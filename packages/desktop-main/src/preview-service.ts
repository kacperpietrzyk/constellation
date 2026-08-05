import { randomUUID } from "node:crypto";

import type {
  ApplicationBatchResponse,
  ApplicationCommandResponse,
  ApplicationQueryResponse,
} from "@constellation/application";
import {
  CapabilitySchema,
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

/**
 * What the preview session does with one capability: hold it, or refuse it for
 * a reason somebody wrote down.
 *
 * An intentional gap and an accidental one must not have the same spelling.
 * Until this record existed they did: both were an absence from a hand-written
 * array, and nothing anywhere could tell them apart.
 */
type PreviewCapabilityDisposition = "granted" | { readonly withheld: string };

/**
 * The exhaustive disposition of the capability vocabulary for the developer
 * preview — the same mechanism `CAPABILITY_DELEGATION` uses one file over, and
 * for the same reason its comment gives: a new capability fails the build until
 * someone decides about it.
 *
 * WHY IT IS A TOTAL `Record` AND NOT AN ARRAY. What stood here was a
 * hand-written array of 150 entries beside a closed vocabulary of 162, with
 * nothing forcing the two to move together. Twelve capabilities were missing,
 * and they went missing across four unrelated releases — #28 added the four
 * agent-access ones, #47 and #48 the two voice ones, #119 the two Project
 * content ones — each time to the desktop session's own scope and not to this
 * one, and no gate anywhere went red. This repository has paid the
 * hand-list-beside-a-closed-vocabulary bill twenty-one other times across three
 * waves; this was the first site where the drift had already happened rather
 * than merely being possible.
 *
 * WHAT THE PREVIEW HOLDS. Exactly what the desktop operator holds. The preview
 * is not a reduced product — it is the same single-person session over an
 * in-memory store, so `LOCAL_ALPHA_CAPABILITIES` is the standard it is measured
 * against, in `preview-service.test.ts`, by name and not by count.
 *
 * WHAT IT WITHHOLDS, AND WHY THAT IS NOT A GAP. Three capabilities, each
 * refused with the reason recorded on the arm. None of them is withheld
 * *because of* the preview: the desktop operator does not hold them either, and
 * both reasons were already written down elsewhere in the repository before
 * this record named them here.
 */
export const PREVIEW_CAPABILITY_DISPOSITION: Readonly<
  Record<Capability, PreviewCapabilityDisposition>
> = {
  "workspace.createLocal": "granted",
  "workspace.rename": "granted",
  "workspace.bootstrapContext": "granted",
  "workspace.manageAccess": "granted",
  "workspace.access": "granted",
  "workspace.exportScoped": "granted",
  "capture.submit": "granted",
  "capture.process": "granted",
  "capture.audioRead": "granted",
  "capture.transcriptWrite": "granted",
  "capture.audioDeleteConfirm": {
    withheld:
      "the runtime issues this to itself under a `maintenance` origin and no operator ever holds it (ADR-046; `CAPABILITY_DELEGATION` classifies it `runtime`)",
  },
  "capture.submitText": "granted",
  "capture.routeAsTask": "granted",
  "capture.history": "granted",
  "project.create": "granted",
  "project.remove": "granted",
  "project.updateOutcome": "granted",
  "project.updateDetails": "granted",
  "project.list": "granted",
  "project.operationalOverview": "granted",
  "organization.operationalOverview": "granted",
  "project.readContent": "granted",
  "project.replaceContent": "granted",
  "document.create": "granted",
  "document.rename": "granted",
  "document.remove": "granted",
  "document.setFolder": "granted",
  "folder.create": "granted",
  "folder.rename": "granted",
  "folder.setParent": "granted",
  "folder.remove": "granted",
  "document.list": "granted",
  "document.linkCandidates": "granted",
  "document.backlinks": "granted",
  "document.readText": "granted",
  "document.replaceText": "granted",
  "document.readContent": "granted",
  "document.replaceContent": "granted",
  "knowledge.sourceCreate": "granted",
  "knowledge.sourceRemove": "granted",
  "knowledge.sourceUpdate": "granted",
  "knowledge.documentSetEvidence": "granted",
  "knowledge.namedVersionCreate": "granted",
  "knowledge.namedVersionVoid": "granted",
  "knowledge.list": "granted",
  "knowledge.documentContext": "granted",
  "relationship.organizationCreate": "granted",
  "relationship.organizationRemove": "granted",
  "relationship.personCreate": "granted",
  "relationship.personUpdate": "granted",
  "relationship.organizationUpdate": "granted",
  "relationship.personRemove": "granted",
  "opportunity.create": "granted",
  "opportunity.update": "granted",
  "opportunity.remove": "granted",
  "opportunity.offerCreate": "granted",
  "opportunity.offerUpdate": "granted",
  "opportunity.offerRemove": "granted",
  "opportunity.linkOutcomes": "granted",
  "relationship.workspace": "granted",
  "person.list": "granted",
  "organization.list": "granted",
  "relationship.renewalCreate": "granted",
  "relationship.renewalUpdate": "granted",
  "relationship.renewalResolve": "granted",
  "relationship.factCreate": "granted",
  "relationship.factRemove": "granted",
  "decision.create": "granted",
  "decision.update": "granted",
  "decision.remove": "granted",
  "decision.supersede": "granted",
  "decision.resolveImpact": "granted",
  "area.create": "granted",
  "area.remove": "granted",
  "area.updateResponsibility": "granted",
  "initiative.create": "granted",
  "initiative.remove": "granted",
  "initiative.updateOutcome": "granted",
  "work.linkCreate": "granted",
  "work.linkRemove": "granted",
  "savedView.create": "granted",
  "savedView.rename": "granted",
  "savedView.update": "granted",
  "savedView.delete": "granted",
  "task.setOperationalState": "granted",
  "work.overview": "granted",
  "recurrence.create": "granted",
  "recurrence.generateOccurrence": "granted",
  "project.close": "granted",
  "project.reopen": "granted",
  "radar.candidateUpsert": "granted",
  "radar.resolve": "granted",
  "radar.review": "granted",
  "meeting.upsertImported": "granted",
  "meeting.route": "granted",
  "meeting.promoteWorkItem": "granted",
  "meeting.linkParticipants": "granted",
  "meeting.editWorkItem": "granted",
  "meeting.correctWorkItemResponsibility": "granted",
  "meeting.addWorkItem": "granted",
  "meeting.detachNote": "granted",
  "task.create": "granted",
  "task.updateDetails": "granted",
  "task.setParent": "granted",
  "template.create": "granted",
  "automation.create": "granted",
  "automation.rename": "granted",
  "automation.setState": "granted",
  "automation.sweep": "granted",
  "recurrence.sweep": "granted",
  "task.setCalendarBlock": "granted",
  "template.rename": "granted",
  "template.updateContents": "granted",
  "template.archive": "granted",
  "template.restore": "granted",
  "project.applyTemplate": "granted",
  "fieldDef.create": "granted",
  "fieldDef.rename": "granted",
  "fieldDef.archive": "granted",
  "fieldDef.restore": "granted",
  "record.setFieldValue": "granted",
  "taskStatus.create": "granted",
  "taskStatus.rename": "granted",
  "taskStatus.setSemantics": "granted",
  "taskStatus.reorder": "granted",
  "taskStatus.archive": "granted",
  "taskStatus.restore": "granted",
  "workspace.setDefaultTaskStatus": "granted",
  "workspace.setCommercialDefaults": "granted",
  "workspace.setWorkingDay": "granted",
  "task.setStatus": "granted",
  "task.complete": "granted",
  "task.reopen": "granted",
  "task.remove": "granted",
  "task.assign": "granted",
  "task.unassign": "granted",
  "record.relate": "granted",
  "record.unrelate": "granted",
  "search.global": "granted",
  "cockpit.week": "granted",
  "activity.meaningful": "granted",
  "activity.changeFeed": "granted",
  "command.previewUndo": "granted",
  "command.undo": "granted",
  "recovery.preview": "granted",
  "task.list": "granted",
  "task.assignmentCandidates": "granted",
  "comment.add": "granted",
  "comment.edit": "granted",
  "comment.resolve": "granted",
  "comment.reopen": "granted",
  "comment.list": "granted",
  "comment.mentionCandidates": "granted",
  "attention.inbox": "granted",
  "attention.markRead": "granted",
  "attention.dismiss": "granted",
  "audit.receipt": "granted",
  "agent.manageAccess": "granted",
  "agent.access": "granted",
  "agent.checkpoint.create": {
    withheld:
      "agent lifecycle: a checkpoint bounds an agent's own run, and `operator-parity.test.ts` records this as one of exactly two capabilities a full-access grant holds and the desktop operator does not",
  },
  "agent.checkpoint.previewRevert": "granted",
  "agent.checkpoint.revert": "granted",
  "agent.handoff.submit": {
    withheld:
      "agent lifecycle: a handoff is submitted by the agent, and `operator-parity.test.ts` records this as the second of that pair",
  },
};

/**
 * The preview session's scope, DERIVED from the vocabulary rather than restated
 * beside it. `CapabilitySchema.options` is the order and the population both,
 * so a capability cannot be in this list without being in the vocabulary and
 * cannot be in the vocabulary without an arm above deciding about it.
 */
export const ALL_PREVIEW_CAPABILITIES: readonly Capability[] =
  CapabilitySchema.options.filter(
    (capability) => PREVIEW_CAPABILITY_DISPOSITION[capability] === "granted",
  );

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
  executeBatch(rawBatch: unknown): ApplicationBatchResponse;
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
    executeBatch: (rawBatch) => harness.kernel.executeBatch(context, rawBatch),
    query: (rawQuery) => harness.kernel.query(context, rawQuery),
  };
};
