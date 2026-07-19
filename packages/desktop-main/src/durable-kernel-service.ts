import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import {
  CommandEnvelopeSchema,
  CredentialIdSchema,
  ExecutionContextSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  type Capability,
  type ExecutionContext,
} from "@constellation/contracts";
import {
  openEncryptedLocalStore,
  type SqliteApplicationStore,
  type EncryptedLocalStoreFacts,
  type EncryptedSqliteDatabaseFactory,
} from "@constellation/local-store";
import type { ReferenceStateSnapshot } from "@constellation/application";

import {
  createRuntimeKernelService,
  type DesktopKernelService,
} from "./runtime-kernel-service.js";
import {
  WorkspaceKeyCustody,
  WorkspaceKeyCustodyError,
  type AsyncSafeStorage,
  type WorkspaceBootstrapIdentity,
} from "./workspace-key-custody.js";
import { CapturePayloadCustody } from "./capture-payload-custody.js";

const LOCAL_ALPHA_CAPABILITIES: readonly Capability[] = [
  "workspace.createLocal",
  "workspace.rename",
  "workspace.bootstrapContext",
  "workspace.manageAccess",
  "workspace.access",
  "workspace.exportScoped",
  "capture.submit",
  "capture.process",
  "capture.audioRead",
  "capture.transcriptWrite",
  "capture.submitText",
  "capture.routeAsTask",
  "capture.history",
  "project.create",
  "document.create",
  "project.updateOutcome",
  "project.list",
  "document.list",
  "knowledge.sourceCreate",
  "knowledge.sourceUpdate",
  "knowledge.documentSetEvidence",
  "knowledge.namedVersionCreate",
  "knowledge.namedVersionVoid",
  "knowledge.list",
  "knowledge.documentContext",
  "relationship.organizationCreate",
  "relationship.personCreate",
  "opportunity.create",
  "opportunity.offerCreate",
  "opportunity.linkOutcomes",
  "relationship.workspace",
  "relationship.renewalCreate",
  "relationship.renewalResolve",
  "relationship.factCreate",
  "decision.create",
  "decision.supersede",
  "decision.resolveImpact",
  "area.create",
  "initiative.create",
  "work.linkCreate",
  "work.linkRemove",
  "savedView.create",
  "work.overview",
  "recurrence.create",
  "recurrence.generateOccurrence",
  "project.close",
  "project.reopen",
  "radar.candidateUpsert",
  "radar.resolve",
  "radar.review",
  "meeting.upsertImported",
  "project.operationalOverview",
  "task.create",
  "task.updateDetails",
  "task.setParent",
  "taskStatus.create",
  "taskStatus.rename",
  "taskStatus.setSemantics",
  "taskStatus.reorder",
  "taskStatus.archive",
  "taskStatus.restore",
  "workspace.setDefaultTaskStatus",
  "task.setStatus",
  "task.setOperationalState",
  "task.complete",
  "task.reopen",
  "task.assign",
  "task.unassign",
  "record.relate",
  "record.unrelate",
  "search.global",
  "cockpit.week",
  "activity.meaningful",
  "command.previewUndo",
  "command.undo",
  "recovery.preview",
  "task.list",
  "task.assignmentCandidates",
  "comment.add",
  "comment.edit",
  "comment.resolve",
  "comment.reopen",
  "comment.list",
  "comment.mentionCandidates",
  "attention.inbox",
  "attention.markRead",
  "attention.dismiss",
  "audit.receipt",
  "agent.manageAccess",
  "agent.access",
  "agent.checkpoint.previewRevert",
  "agent.checkpoint.revert",
];

export interface DurableKernelService {
  readonly context: ExecutionContext;
  readonly facts: EncryptedLocalStoreFacts;
  readonly identity: WorkspaceBootstrapIdentity;
  readonly service: DesktopKernelService;
  readonly store: SqliteApplicationStore;
  readonly workspaceName: string;
  close(): void;
}

export class DurableWorkspaceOpenError extends Error {
  public constructor(
    public readonly code:
      | "database_without_key"
      | "workspace_recovery_required"
      | "workspace_bootstrap_failed"
      | "workspace_open_failed",
  ) {
    super(`Durable workspace open failed: ${code}.`);
    this.name = "DurableWorkspaceOpenError";
  }
}

const generatedIdentity = (): WorkspaceBootstrapIdentity => ({
  workspaceId: WorkspaceIdSchema.parse(randomUUID()),
  rootSpaceId: SpaceIdSchema.parse(randomUUID()),
  principalId: PrincipalIdSchema.parse(randomUUID()),
  credentialId: CredentialIdSchema.parse(randomUUID()),
  grantId: GrantIdSchema.parse(randomUUID()),
});

export interface DurableBootstrapProjection {
  readonly identity: WorkspaceBootstrapIdentity;
  readonly snapshot: ReferenceStateSnapshot;
}

export const createDurableKernelService = async (input: {
  readonly databaseFactory: EncryptedSqliteDatabaseFactory;
  readonly safeStorage: AsyncSafeStorage;
  readonly stateRoot: string;
  readonly timezone: string;
  readonly workspaceName?: string;
  readonly platform?: NodeJS.Platform;
  readonly bootstrapProjection?: DurableBootstrapProjection;
}): Promise<DurableKernelService> => {
  const workspaceRoot = path.join(input.stateRoot, "local-alpha-workspace");
  const wrapperPath = path.join(workspaceRoot, "key-wrapper.json");
  const databasePath = path.join(workspaceRoot, "workspace.db");
  mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
  const wrapperExists = existsSync(wrapperPath);
  const databaseExists = existsSync(databasePath);
  if (
    input.bootstrapProjection !== undefined &&
    (wrapperExists || databaseExists)
  ) {
    throw new DurableWorkspaceOpenError("workspace_open_failed");
  }
  if (!wrapperExists && databaseExists) {
    throw new DurableWorkspaceOpenError("database_without_key");
  }

  const custody = new WorkspaceKeyCustody(input.safeStorage, wrapperPath);
  let bundle;
  try {
    bundle = wrapperExists
      ? await custody.load(custody.discoverWorkspaceId())
      : await custody.create(
          input.bootstrapProjection?.identity ?? generatedIdentity(),
        );
  } catch (error) {
    if (error instanceof WorkspaceKeyCustodyError) throw error;
    throw new DurableWorkspaceOpenError("workspace_open_failed");
  }
  if (!databaseExists && bundle.state === "ready") {
    bundle.key.fill(0);
    throw new DurableWorkspaceOpenError("workspace_recovery_required");
  }

  let opened;
  try {
    opened = openEncryptedLocalStore({
      databaseFactory: input.databaseFactory,
      databasePath,
      key: bundle.key,
      ...(input.platform === undefined ? {} : { platform: input.platform }),
      create: !databaseExists,
    });
  } catch (error) {
    bundle.key.fill(0);
    if (!databaseExists && bundle.state === "prepared") {
      for (const suffix of ["", "-shm", "-wal"]) {
        rmSync(`${databasePath}${suffix}`, { force: true });
      }
    }
    throw error;
  }

  try {
    if (input.bootstrapProjection !== undefined) {
      opened.store.initializeProjection(input.bootstrapProjection.snapshot);
    }
    const projected = opened.store.snapshot();
    const projectedWorkspace = projected.workspaces.find(
      (workspace) => workspace.id === bundle.identity.workspaceId,
    );
    const projectedMembership = projected.memberships.find(
      (membership) =>
        membership.workspaceId === bundle.identity.workspaceId &&
        membership.principalId === bundle.identity.principalId &&
        membership.status !== "revoked",
    );
    const projectedSpaceScope = new Set(
      projected.spaceGrants
        ?.filter(
          (grant) =>
            grant.workspaceId === bundle.identity.workspaceId &&
            grant.principalId === bundle.identity.principalId &&
            grant.status === "active",
        )
        .map((grant) => grant.spaceId) ?? [],
    );
    if (
      projectedMembership?.role === "owner" &&
      projectedWorkspace !== undefined
    ) {
      projectedSpaceScope.add(projectedWorkspace.rootSpaceId);
    }
    const context = ExecutionContextSchema.parse({
      principalId: bundle.identity.principalId,
      principalKind: "human",
      credentialId: bundle.identity.credentialId,
      grantId: bundle.identity.grantId,
      policyVersion: projectedWorkspace?.policyVersion ?? 1,
      workspaceId: bundle.identity.workspaceId,
      spaceScope:
        projectedWorkspace === undefined
          ? [bundle.identity.rootSpaceId]
          : [...projectedSpaceScope].sort(),
      capabilityScope: LOCAL_ALPHA_CAPABILITIES,
      origin: "desktop",
    });
    const payloadCustody = new CapturePayloadCustody(
      bundle.identity.workspaceId,
      opened.store,
    );
    const service = createRuntimeKernelService({
      context,
      store: opened.store,
      capturePayloadVerifier: {
        isAvailable: (workspaceId, original) =>
          workspaceId === bundle.identity.workspaceId &&
          payloadCustody.verify(original),
      },
    });
    const workspace = opened.store.read((view) =>
      view.getWorkspace(bundle.identity.workspaceId),
    );
    if (workspace === undefined) {
      if (bundle.state === "ready") {
        throw new DurableWorkspaceOpenError("workspace_recovery_required");
      }
      const bootstrap = service.execute(
        CommandEnvelopeSchema.parse({
          contractVersion: 1,
          commandName: "workspace.createLocal",
          commandId: randomUUID(),
          workspaceId: bundle.identity.workspaceId,
          idempotencyKey: "local-alpha-workspace-bootstrap-v1",
          expectedVersions: {},
          correlationId: randomUUID(),
          payload: {
            workspaceId: bundle.identity.workspaceId,
            rootSpaceId: bundle.identity.rootSpaceId,
            ownerPrincipalId: bundle.identity.principalId,
            name: input.workspaceName ?? "Personal workspace",
            timezone: input.timezone,
          },
        }),
      );
      if (
        bootstrap.kind !== "command_outcome" ||
        bootstrap.outcome.outcome !== "success"
      ) {
        throw new DurableWorkspaceOpenError("workspace_bootstrap_failed");
      }
    } else if (
      workspace.rootSpaceId !== bundle.identity.rootSpaceId ||
      opened.store.read((view) =>
        view.getMembership(
          bundle.identity.workspaceId,
          bundle.identity.principalId,
        ),
      ) === undefined
    ) {
      throw new DurableWorkspaceOpenError("workspace_open_failed");
    }
    if (bundle.state === "prepared") {
      await custody.markReady(bundle.identity.workspaceId);
    }

    const verifiedWorkspace = opened.store.read((view) =>
      view.getWorkspace(bundle.identity.workspaceId),
    );
    if (verifiedWorkspace === undefined) {
      throw new DurableWorkspaceOpenError("workspace_open_failed");
    }
    return {
      context,
      facts: opened.facts,
      identity: bundle.identity,
      service,
      store: opened.store,
      workspaceName: verifiedWorkspace.name,
      close: opened.close,
    };
  } catch (error) {
    opened.close();
    if (input.bootstrapProjection !== undefined && !databaseExists) {
      for (const filename of [wrapperPath, databasePath]) {
        for (const suffix of ["", "-shm", "-wal"]) {
          rmSync(`${filename}${suffix}`, { force: true });
        }
      }
    }
    throw error;
  }
};
