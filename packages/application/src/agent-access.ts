import {
  AuditReceiptIdSchema,
  CommandOutcomeSchema,
  EventIdSchema,
  OutboxEntryIdSchema,
  QueryResultSchema,
  type CommandEnvelope,
  type CommandOutcome,
  type ExecutionContext,
  type QueryEnvelope,
  type QueryResult,
  type SpaceId,
} from "@constellation/contracts";
import {
  addWorkspaceMember,
  bumpWorkspacePolicy,
  createAgentAccessGrant,
  createAgentCheckpoint,
  grantSpaceAccess,
  revokeAgentAccessGrant,
  revokeSpaceGrant,
  revokeWorkspaceMember,
  rotateAgentCredential,
  type AgentHandoff,
  type AuditReceipt,
  type DomainEvent,
  type OutboxEntry,
} from "@constellation/domain";

import {
  canEditSpace,
  canManageWorkspaceAccess,
} from "./collaboration-policy.js";
import type {
  ApplicationKernelDependencies,
  ApplicationReadView,
  ApplicationTransaction,
  IdempotencyRecord,
} from "./ports.js";
import {
  isApplicationWave2ReadView,
  RetryableUnitOfWorkError,
} from "./ports.js";

export type AgentAccessCommand = Extract<
  CommandEnvelope,
  {
    commandName:
      | "agent.grantCreate"
      | "agent.grantRotateCredential"
      | "agent.grantRevoke"
      | "agent.checkpointCreate"
      | "agent.handoffSubmit";
  }
>;

export type AgentAccessQuery = Extract<
  QueryEnvelope,
  { queryName: "agent.access" | "agent.checkpointPreviewRevert" }
>;

const exactExpected = (
  command: AgentAccessCommand,
  records: Readonly<Record<string, number>>,
): boolean => {
  const actual = Object.keys(command.expectedVersions).sort();
  const expected = Object.keys(records).sort();
  return (
    actual.length === expected.length &&
    actual.every(
      (key, index) =>
        key === expected[index] &&
        command.expectedVersions[key] === records[key],
    )
  );
};

const rejected = (
  command: AgentAccessCommand,
  occurredAt: string,
): CommandOutcome =>
  CommandOutcomeSchema.parse({
    outcome: "rejected",
    diagnosticCode: "command.precondition_failed",
    contractVersion: 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    kernelTime: occurredAt,
  });

const conflict = (
  command: AgentAccessCommand,
  occurredAt: string,
  currentVersions: Readonly<Record<string, number>>,
): CommandOutcome =>
  CommandOutcomeSchema.parse({
    outcome: "conflict",
    diagnosticCode: "record.version_conflict",
    contractVersion: 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    kernelTime: occurredAt,
    currentVersions,
  });

const commit = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationTransaction,
  context: ExecutionContext,
  command: AgentAccessCommand,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
  input: {
    readonly spaceId: SpaceId;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly recordVersions: Readonly<Record<string, number>>;
    readonly affectedKinds: Readonly<
      Record<
        string,
        | "workspace"
        | "membership"
        | "spaceGrant"
        | "agentGrant"
        | "agentCheckpoint"
        | "agentHandoff"
      >
    >;
    readonly changedFields: readonly string[];
    readonly diagnosticCode:
      | "agent.grant_created"
      | "agent.credential_rotated"
      | "agent.grant_revoked"
      | "agent.checkpoint_created"
      | "agent.handoff_submitted";
    readonly projection: Record<string, unknown>;
  },
): CommandOutcome => {
  const eventId = EventIdSchema.parse(dependencies.ids.next("event"));
  const auditReceiptId = AuditReceiptIdSchema.parse(
    dependencies.ids.next("auditReceipt"),
  );
  const outboxEntryId = OutboxEntryIdSchema.parse(
    dependencies.ids.next("outboxEntry"),
  );
  const outcome = CommandOutcomeSchema.parse({
    outcome: "success",
    diagnosticCode: input.diagnosticCode,
    contractVersion: 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    kernelTime: occurredAt,
    affected: Object.entries(input.recordVersions).map(
      ([recordId, version]) => ({
        recordId,
        recordKind: input.affectedKinds[recordId],
        version,
      }),
    ),
    auditReceiptId,
    projection: input.projection,
  });
  const event: DomainEvent = {
    id: eventId,
    commandId: command.commandId,
    type: input.diagnosticCode,
    workspaceId: command.workspaceId,
    spaceId: input.spaceId,
    aggregateId: input.aggregateId,
    aggregateVersion: input.aggregateVersion,
    occurredAt,
  };
  const audit: AuditReceipt = {
    id: auditReceiptId,
    workspaceId: command.workspaceId,
    spaceId: input.spaceId,
    principalId: context.principalId,
    grantId: context.grantId,
    origin: context.origin,
    commandId: command.commandId,
    commandName: command.commandName,
    correlationId: command.correlationId,
    affectedRecordIds: Object.keys(input.recordVersions),
    recordVersions: input.recordVersions,
    changedFields: input.changedFields,
    occurredAt,
    outcome: "success",
    ...(command.checkpointId === undefined
      ? {}
      : { checkpointId: command.checkpointId }),
    ...(context.hostRun?.agentRunId === undefined
      ? {}
      : { agentRunId: context.hostRun.agentRunId }),
    ...(context.hostRun?.runId === undefined
      ? {}
      : { hostRunId: context.hostRun.runId }),
  };
  const outbox: OutboxEntry = {
    id: outboxEntryId,
    workspaceId: command.workspaceId,
    spaceId: input.spaceId,
    eventId,
    topic: "workspace.projection.requested",
    createdAt: occurredAt,
  };
  transaction.insertEvent(event);
  transaction.insertAuditReceipt(audit);
  transaction.insertIdempotency({ ...idempotency, outcome });
  transaction.insertOutbox(outbox);
  return outcome;
};

export const isAgentAccessCommandAuthorized = (
  dependencies: Pick<ApplicationKernelDependencies, "authorization">,
  view: ApplicationReadView,
  context: ExecutionContext,
  command: AgentAccessCommand,
): boolean => {
  if (
    command.commandName === "agent.grantCreate" ||
    command.commandName === "agent.grantRotateCredential" ||
    command.commandName === "agent.grantRevoke"
  ) {
    return (
      context.principalKind === "human" &&
      canManageWorkspaceAccess(view, context, command.workspaceId) &&
      dependencies.authorization.authorize({
        context,
        capability: "agent.manageAccess",
        workspaceId: command.workspaceId,
      })
    );
  }
  return (
    context.principalKind === "agent" &&
    context.hostRun?.agentRunId === command.payload.runId &&
    dependencies.authorization.authorize({
      context,
      capability:
        command.commandName === "agent.checkpointCreate"
          ? "agent.checkpoint.create"
          : "agent.handoff.submit",
      workspaceId: command.workspaceId,
    })
  );
};

export const executeAgentAccessCommand = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationTransaction,
  context: ExecutionContext,
  command: AgentAccessCommand,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
): CommandOutcome => {
  const workspace = transaction.getWorkspace(command.workspaceId);
  if (workspace === undefined) return rejected(command, occurredAt);
  const rootSpaceId = workspace.rootSpaceId;

  if (command.commandName === "agent.grantCreate") {
    const uniqueSpaces = new Set(
      command.payload.spaces.map((item) => item.spaceId),
    );
    if (
      uniqueSpaces.size !== command.payload.spaces.length ||
      (command.payload.expiresAt !== undefined &&
        Date.parse(command.payload.expiresAt) <= Date.parse(occurredAt)) ||
      transaction.getAgentGrant(command.payload.grantId) !== undefined ||
      transaction.getMembership(
        workspace.id,
        command.payload.agentPrincipalId,
      ) !== undefined ||
      command.payload.spaces.some(
        (item) =>
          transaction.getSpace(item.spaceId)?.workspaceId !== workspace.id ||
          transaction.getSpaceGrant(item.spaceGrantId) !== undefined ||
          !canEditSpace(transaction, context, workspace.id, item.spaceId),
      ) ||
      !exactExpected(command, { [workspace.id]: workspace.version })
    )
      return rejected(command, occurredAt);

    const membership = addWorkspaceMember({
      membershipId: command.payload.membershipId,
      workspaceId: workspace.id,
      principalId: command.payload.agentPrincipalId,
      displayName: command.payload.displayName,
      role: "guest",
      occurredAt,
    });
    const spaceGrants = command.payload.spaces.map((item) =>
      grantSpaceAccess({
        id: item.spaceGrantId,
        workspaceId: workspace.id,
        spaceId: item.spaceId,
        principalId: command.payload.agentPrincipalId,
        access: item.access,
        occurredAt,
      }),
    );
    const grant = createAgentAccessGrant({
      id: command.payload.grantId,
      workspaceId: workspace.id,
      agentPrincipalId: command.payload.agentPrincipalId,
      delegatingUserId: context.principalId,
      displayName: command.payload.displayName,
      preset: command.payload.preset,
      capabilityScope: command.payload.capabilityScope,
      spaceScope: command.payload.spaces.map((item) => item.spaceId),
      credentialId: command.payload.credentialId,
      credentialDigest: command.payload.credentialDigest,
      ...(command.payload.expiresAt === undefined
        ? {}
        : { expiresAt: command.payload.expiresAt }),
      occurredAt,
    });
    const updatedWorkspace = bumpWorkspacePolicy(workspace, occurredAt);
    transaction.insertMembership(membership);
    spaceGrants.forEach((item) => transaction.insertSpaceGrant(item));
    transaction.insertAgentGrant(grant);
    if (!transaction.updateWorkspace(updatedWorkspace, workspace.version))
      throw new RetryableUnitOfWorkError();
    const versions = {
      [updatedWorkspace.id]: updatedWorkspace.version,
      [membership.id]: membership.version,
      [grant.id]: grant.version,
      ...Object.fromEntries(spaceGrants.map((item) => [item.id, item.version])),
    };
    return commit(
      dependencies,
      transaction,
      context,
      command,
      idempotency,
      occurredAt,
      {
        spaceId: rootSpaceId,
        aggregateId: grant.id,
        aggregateVersion: grant.version,
        recordVersions: versions,
        affectedKinds: {
          [updatedWorkspace.id]: "workspace",
          [membership.id]: "membership",
          [grant.id]: "agentGrant",
          ...Object.fromEntries(
            spaceGrants.map((item) => [item.id, "spaceGrant"]),
          ),
        },
        changedFields: [
          "agentPrincipalId",
          "preset",
          "capabilityScope",
          "spaceScope",
          "expiresAt",
          "credentialId",
          "policyVersion",
        ],
        diagnosticCode: "agent.grant_created",
        projection: {
          kind: "agent.grant_created",
          grantId: grant.id,
          agentPrincipalId: grant.agentPrincipalId,
          credentialId: grant.credentialId,
          version: grant.version,
          policyVersion: updatedWorkspace.policyVersion,
        },
      },
    );
  }

  if (command.commandName === "agent.grantRotateCredential") {
    const current = transaction.getAgentGrant(command.payload.grantId);
    if (
      current?.workspaceId !== workspace.id ||
      current.status !== "active" ||
      !exactExpected(command, { [current.id]: current.version })
    )
      return current === undefined
        ? rejected(command, occurredAt)
        : conflict(command, occurredAt, { [current.id]: current.version });
    const rotated = rotateAgentCredential(
      current,
      command.payload.credentialId,
      command.payload.credentialDigest,
      occurredAt,
    );
    if (!transaction.updateAgentGrant(rotated, current.version))
      throw new RetryableUnitOfWorkError();
    return commit(
      dependencies,
      transaction,
      context,
      command,
      idempotency,
      occurredAt,
      {
        spaceId: rootSpaceId,
        aggregateId: rotated.id,
        aggregateVersion: rotated.version,
        recordVersions: { [rotated.id]: rotated.version },
        affectedKinds: { [rotated.id]: "agentGrant" },
        changedFields: [
          "credentialId",
          "credentialDigest",
          "credentialVersion",
        ],
        diagnosticCode: "agent.credential_rotated",
        projection: {
          kind: "agent.credential_rotated",
          grantId: rotated.id,
          credentialId: rotated.credentialId,
          credentialVersion: rotated.credentialVersion,
          version: rotated.version,
        },
      },
    );
  }

  if (command.commandName === "agent.grantRevoke") {
    const current = transaction.getAgentGrant(command.payload.grantId);
    if (current?.workspaceId !== workspace.id || current.status !== "active")
      return rejected(command, occurredAt);
    const membership = transaction.getMembership(
      workspace.id,
      current.agentPrincipalId,
    );
    if (membership === undefined) return rejected(command, occurredAt);
    const grants = transaction
      .listSpaceGrants(workspace.id, current.agentPrincipalId)
      .filter((item) => item.status === "active");
    const expected = {
      [workspace.id]: workspace.version,
      [current.id]: current.version,
      [membership.id]: membership.version,
      ...Object.fromEntries(grants.map((item) => [item.id, item.version])),
    };
    if (!exactExpected(command, expected))
      return conflict(command, occurredAt, expected);
    const revoked = revokeAgentAccessGrant(current, occurredAt);
    const revokedMembership = revokeWorkspaceMember(membership, occurredAt);
    const revokedGrants = grants.map((item) =>
      revokeSpaceGrant(item, occurredAt),
    );
    const updatedWorkspace = bumpWorkspacePolicy(workspace, occurredAt);
    if (
      !transaction.updateAgentGrant(revoked, current.version) ||
      !transaction.updateMembership(revokedMembership, membership.version) ||
      revokedGrants.some(
        (item, index) =>
          !transaction.updateSpaceGrant(item, grants[index]?.version ?? 0),
      ) ||
      !transaction.updateWorkspace(updatedWorkspace, workspace.version)
    )
      throw new RetryableUnitOfWorkError();
    const versions = {
      [updatedWorkspace.id]: updatedWorkspace.version,
      [revoked.id]: revoked.version,
      [revokedMembership.id]: revokedMembership.version,
      ...Object.fromEntries(
        revokedGrants.map((item) => [item.id, item.version]),
      ),
    };
    return commit(
      dependencies,
      transaction,
      context,
      command,
      idempotency,
      occurredAt,
      {
        spaceId: rootSpaceId,
        aggregateId: revoked.id,
        aggregateVersion: revoked.version,
        recordVersions: versions,
        affectedKinds: {
          [updatedWorkspace.id]: "workspace",
          [revoked.id]: "agentGrant",
          [revokedMembership.id]: "membership",
          ...Object.fromEntries(
            revokedGrants.map((item) => [item.id, "spaceGrant"]),
          ),
        },
        changedFields: ["status", "revokedAt", "policyVersion"],
        diagnosticCode: "agent.grant_revoked",
        projection: {
          kind: "agent.grant_revoked",
          grantId: revoked.id,
          version: revoked.version,
          policyVersion: updatedWorkspace.policyVersion,
        },
      },
    );
  }

  const run = transaction.getAgentRun(command.payload.runId);
  if (
    run?.workspaceId !== workspace.id ||
    run.agentPrincipalId !== context.principalId ||
    run.grantId !== context.grantId
  )
    return rejected(command, occurredAt);

  if (command.commandName === "agent.checkpointCreate") {
    if (
      transaction.getAgentCheckpoint(command.payload.checkpointId) !==
        undefined ||
      !exactExpected(command, {})
    )
      return rejected(command, occurredAt);
    const checkpoint = createAgentCheckpoint({
      id: command.payload.checkpointId,
      workspaceId: workspace.id,
      agentPrincipalId: context.principalId,
      grantId: context.grantId,
      runId: command.payload.runId,
      label: command.payload.label,
      occurredAt,
    });
    transaction.insertAgentCheckpoint(checkpoint);
    return commit(
      dependencies,
      transaction,
      context,
      command,
      idempotency,
      occurredAt,
      {
        spaceId: rootSpaceId,
        aggregateId: checkpoint.id,
        aggregateVersion: 1,
        recordVersions: { [checkpoint.id]: 1 },
        affectedKinds: { [checkpoint.id]: "agentCheckpoint" },
        changedFields: ["label", "runId", "status"],
        diagnosticCode: "agent.checkpoint_created",
        projection: {
          kind: "agent.checkpoint_created",
          checkpointId: checkpoint.id,
          runId: checkpoint.runId,
        },
      },
    );
  }

  if (!exactExpected(command, {})) return rejected(command, occurredAt);
  const handoff: AgentHandoff = {
    id: command.payload.handoffId,
    workspaceId: workspace.id,
    agentPrincipalId: context.principalId,
    grantId: context.grantId,
    runId: command.payload.runId,
    evidence: command.payload.evidence,
    changes: command.payload.changes,
    decisions: command.payload.decisions,
    remainingWork: command.payload.remainingWork,
    nextAction: command.payload.nextAction,
    createdAt: occurredAt,
  };
  if (
    transaction.listAgentHandoffs(run.id).some((item) => item.id === handoff.id)
  )
    return rejected(command, occurredAt);
  transaction.insertAgentHandoff(handoff);
  transaction.updateAgentRun({
    ...run,
    status: "completed",
    updatedAt: occurredAt,
    completedAt: occurredAt,
  });
  return commit(
    dependencies,
    transaction,
    context,
    command,
    idempotency,
    occurredAt,
    {
      spaceId: rootSpaceId,
      aggregateId: handoff.id,
      aggregateVersion: 1,
      recordVersions: { [handoff.id]: 1 },
      affectedKinds: { [handoff.id]: "agentHandoff" },
      changedFields: [
        "evidence",
        "changes",
        "decisions",
        "remainingWork",
        "nextAction",
      ],
      diagnosticCode: "agent.handoff_submitted",
      projection: {
        kind: "agent.handoff_submitted",
        handoffId: handoff.id,
        runId: handoff.runId,
      },
    },
  );
};

const denied = (query: AgentAccessQuery, kernelTime: string): QueryResult =>
  QueryResultSchema.parse({
    outcome: "rejected",
    diagnosticCode: "authorization.denied",
    contractVersion: 1,
    queryId: query.queryId,
    kernelTime,
  });

export const executeAgentAccessQuery = (
  dependencies: ApplicationKernelDependencies,
  view: ApplicationReadView,
  context: ExecutionContext,
  query: AgentAccessQuery,
  kernelTime: string,
): QueryResult => {
  const workspace = view.getWorkspace(query.workspaceId);
  if (
    workspace === undefined ||
    (workspace.policyVersion ?? 1) !== context.policyVersion
  )
    return denied(query, kernelTime);
  if (query.queryName === "agent.access") {
    const canManage =
      context.principalKind === "human" &&
      canManageWorkspaceAccess(view, context, workspace.id) &&
      dependencies.authorization.authorize({
        context,
        capability: "agent.access",
        workspaceId: workspace.id,
      });
    const grants = canManage
      ? view.listAgentGrants(workspace.id)
      : view
          .listAgentGrants(workspace.id)
          .filter(
            (grant) =>
              context.principalKind === "agent" &&
              grant.id === context.grantId &&
              grant.agentPrincipalId === context.principalId,
          );
    if (grants.length === 0 && !canManage) return denied(query, kernelTime);
    return QueryResultSchema.parse({
      outcome: "success",
      contractVersion: 1,
      queryId: query.queryId,
      kernelTime,
      freshness: view.getFreshness(),
      projection: {
        kind: "agent.access",
        policyVersion: workspace.policyVersion ?? 1,
        workspaceVersion: workspace.version,
        canManage,
        grants: grants.map((grant) => {
          const membership = view.getMembership(
            workspace.id,
            grant.agentPrincipalId,
          );
          if (membership === undefined)
            throw new Error("Agent grant membership is missing.");
          return {
            grantId: grant.id,
            agentPrincipalId: grant.agentPrincipalId,
            displayName: grant.displayName,
            preset: grant.preset,
            capabilityScope: grant.capabilityScope,
            membershipId: membership.id,
            membershipVersion: membership.version,
            spaces: grant.spaceScope.map((spaceId) => {
              const spaceGrant = view.getSpaceGrantForPrincipal(
                workspace.id,
                spaceId,
                grant.agentPrincipalId,
              );
              if (spaceGrant === undefined)
                throw new Error("Agent Space grant is missing.");
              return {
                spaceId,
                spaceName: view.getSpace(spaceId)?.name ?? "Unavailable Space",
                spaceGrantId: spaceGrant.id,
                access: spaceGrant.access,
                version: spaceGrant.version,
              };
            }),
            status:
              grant.status === "revoked"
                ? "revoked"
                : grant.expiresAt !== undefined &&
                    Date.parse(grant.expiresAt) <= Date.parse(kernelTime)
                  ? "expired"
                  : "active",
            ...(grant.expiresAt === undefined
              ? {}
              : { expiresAt: grant.expiresAt }),
            credentialVersion: grant.credentialVersion,
            version: grant.version,
            ...(grant.lastUsedAt === undefined
              ? {}
              : { lastUsedAt: grant.lastUsedAt }),
          };
        }),
      },
    });
  }
  const checkpoint = view.getAgentCheckpoint(query.parameters.checkpointId);
  const canRead =
    checkpoint?.workspaceId === workspace.id &&
    ((context.principalKind === "agent" &&
      checkpoint.agentPrincipalId === context.principalId &&
      checkpoint.grantId === context.grantId) ||
      (context.principalKind === "human" &&
        canManageWorkspaceAccess(view, context, workspace.id))) &&
    dependencies.authorization.authorize({
      context,
      capability: "agent.checkpoint.previewRevert",
      workspaceId: workspace.id,
    });
  if (!canRead || checkpoint === undefined) return denied(query, kernelTime);
  if (!isApplicationWave2ReadView(view)) return denied(query, kernelTime);
  const descriptors = checkpoint.commandIds.map((id) =>
    view.getUndoDescriptor(id),
  );
  const unavailableReason =
    checkpoint.status === "reverted"
      ? "already_reverted"
      : descriptors.some((item) => item === undefined)
        ? "unsupported"
        : descriptors.some((item) => item?.consumedByCommandId !== undefined)
          ? "later_change"
          : undefined;
  return QueryResultSchema.parse({
    outcome: "success",
    contractVersion: 1,
    queryId: query.queryId,
    kernelTime,
    freshness: view.getFreshness(),
    projection: {
      kind: "agent.checkpoint_revert_preview",
      checkpointId: checkpoint.id,
      available: unavailableReason === undefined,
      commandIds: checkpoint.commandIds,
      affectedRecordIds: descriptors.flatMap<string>((descriptor) => {
        if (descriptor === undefined) return [];
        switch (descriptor.kind) {
          case "project.restore_outcome":
            return [descriptor.projectId];
          case "taskStatus.restore_definition":
            return [descriptor.statusId];
          case "fieldDef.restore_definition":
            return [descriptor.fieldId];
          case "template.restore_definition":
            return [descriptor.templateId];
          case "project.unapply_template":
            return [descriptor.projectId, ...descriptor.createdTaskIds];
          case "record.restore_field_value":
            return [descriptor.recordId];
          case "workspace.restore_default_status":
            return [descriptor.workspaceId];
          case "task.restore_state":
          case "task.restore_details":
          case "task.restore_parent":
          case "task.restore_operational_state":
            return [descriptor.taskId];
          case "savedView.restore_definition":
            return [descriptor.savedViewId];
          case "work_link.restore_state":
            return [descriptor.linkId];
          case "relation.remove":
          case "relation.restore":
            return [descriptor.relationId];
          case "capture.undo_route":
            return [descriptor.captureId, descriptor.taskId];
          case "capture.undo_knowledge_route":
            return [descriptor.captureId, descriptor.sourceId];
          case "knowledge.restore_source":
            return [descriptor.sourceId];
          case "knowledge.restore_evidence":
            return [descriptor.documentId];
          case "knowledge.void_named_version":
            return [descriptor.namedVersionId];
        }
      }),
      ...(unavailableReason === undefined ? {} : { unavailableReason }),
    },
  });
};
