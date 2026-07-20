import { randomUUID } from "node:crypto";

import type {
  ApplicationCommandResponse,
  ApplicationQueryResponse,
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  CredentialIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  type Capability,
  type ExecutionContext,
} from "@constellation/contracts";
import { createReferenceHarness } from "@constellation/testkit";

const ALL_PREVIEW_CAPABILITIES: readonly Capability[] = [
  "workspace.createLocal",
  "workspace.rename",
  "workspace.bootstrapContext",
  "workspace.manageAccess",
  "workspace.access",
  "workspace.exportScoped",
  "capture.submit",
  "capture.process",
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
  "template.create",
  "template.rename",
  "template.updateContents",
  "template.archive",
  "template.restore",
  "project.applyTemplate",
  "fieldDef.create",
  "fieldDef.rename",
  "fieldDef.archive",
  "fieldDef.restore",
  "record.setFieldValue",
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
];

export const PREVIEW_IDENTITY = {
  credentialId: CredentialIdSchema.parse(
    "00000000-0000-4000-8000-000000000103",
  ),
  grantId: GrantIdSchema.parse("00000000-0000-4000-8000-000000000102"),
  principalId: PrincipalIdSchema.parse("00000000-0000-4000-8000-000000000101"),
  rootSpaceId: SpaceIdSchema.parse("00000000-0000-4000-8000-000000000002"),
  workspaceId: WorkspaceIdSchema.parse("00000000-0000-4000-8000-000000000001"),
} as const;

export interface PreviewKernelService {
  execute(rawCommand: unknown): ApplicationCommandResponse;
  query(rawQuery: unknown): ApplicationQueryResponse;
}

export const createPreviewKernelService = (): PreviewKernelService => {
  const harness = createReferenceHarness();
  const context: ExecutionContext = {
    principalId: PREVIEW_IDENTITY.principalId,
    principalKind: "human",
    credentialId: PREVIEW_IDENTITY.credentialId,
    grantId: PREVIEW_IDENTITY.grantId,
    policyVersion: 1,
    workspaceId: PREVIEW_IDENTITY.workspaceId,
    spaceScope: [PREVIEW_IDENTITY.rootSpaceId],
    capabilityScope: [...ALL_PREVIEW_CAPABILITIES],
    origin: "desktop",
  };
  harness.authorization.register(context);

  const bootstrap = CommandEnvelopeSchema.parse({
    contractVersion: 1,
    commandName: "workspace.createLocal",
    commandId: randomUUID(),
    workspaceId: PREVIEW_IDENTITY.workspaceId,
    idempotencyKey: "desktop-preview-workspace-v1",
    expectedVersions: {},
    correlationId: randomUUID(),
    payload: {
      workspaceId: PREVIEW_IDENTITY.workspaceId,
      rootSpaceId: PREVIEW_IDENTITY.rootSpaceId,
      ownerPrincipalId: PREVIEW_IDENTITY.principalId,
      name: "Interactive alpha",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  });
  const bootstrapResponse = harness.kernel.execute(context, bootstrap);
  if (
    bootstrapResponse.kind !== "command_outcome" ||
    bootstrapResponse.outcome.outcome !== "success"
  ) {
    throw new Error("Could not initialize the in-memory preview workspace.");
  }

  return {
    execute: (rawCommand) => harness.kernel.execute(context, rawCommand),
    query: (rawQuery) => harness.kernel.query(context, rawQuery),
  };
};
