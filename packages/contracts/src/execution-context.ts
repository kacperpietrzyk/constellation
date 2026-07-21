import { z } from "zod";

import {
  CredentialIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  AgentRunIdSchema,
} from "./ids.js";

export const PrincipalKindSchema = z.enum([
  "human",
  "integration",
  "system",
  "agent",
]);
export type PrincipalKind = z.infer<typeof PrincipalKindSchema>;

export const RequestOriginSchema = z.enum([
  "desktop",
  "mobile",
  "import",
  "rule",
  "mcp",
  "maintenance",
]);
export type RequestOrigin = z.infer<typeof RequestOriginSchema>;

export const CapabilitySchema = z.enum([
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
  "capture.audioDeleteConfirm",
  "capture.submitText",
  "capture.routeAsTask",
  "capture.history",
  "project.create",
  "project.updateOutcome",
  "project.list",
  "project.operationalOverview",
  "document.create",
  "document.list",
  "document.linkCandidates",
  "document.backlinks",
  "document.readText",
  "document.replaceText",
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
  "savedView.rename",
  "savedView.update",
  "savedView.delete",
  "task.setOperationalState",
  "work.overview",
  "recurrence.create",
  "recurrence.generateOccurrence",
  "project.close",
  "project.reopen",
  "radar.candidateUpsert",
  "radar.resolve",
  "radar.review",
  "meeting.upsertImported",
  "meeting.route",
  "meeting.promoteWorkItem",
  "meeting.linkParticipants",
  "meeting.editWorkItem",
  "meeting.correctWorkItemResponsibility",
  "meeting.addWorkItem",
  "task.create",
  "task.updateDetails",
  "task.setParent",
  "template.create",
  "automation.create",
  "automation.rename",
  "automation.setState",
  "automation.sweep",
  "recurrence.sweep",
  "task.setCalendarBlock",
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
  "task.complete",
  "task.reopen",
  "task.remove",
  "task.assign",
  "task.unassign",
  "record.relate",
  "record.unrelate",
  "search.global",
  "cockpit.week",
  "activity.meaningful",
  "activity.changeFeed",
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
  "agent.checkpoint.create",
  "agent.checkpoint.previewRevert",
  "agent.checkpoint.revert",
  "agent.handoff.submit",
]);
export type Capability = z.infer<typeof CapabilitySchema>;

/**
 * How far a capability may be delegated to an agent grant (ADR-046).
 *
 * - `read` — a query; held by every preset from `observe` up;
 * - `propose` — a mutation whose only effect is a proposal a human resolves;
 * - `operate` — an ordinary domain mutation;
 * - `sensitive` — delegable only under `full_access`;
 * - `runtime` — issued by the runtime itself under `maintenance` origin and
 *   never by an operator;
 * - `administrative` — never delegable to any agent, local or remote.
 */
export const CapabilityDelegationSchema = z.enum([
  "read",
  "propose",
  "operate",
  "sensitive",
  "runtime",
  "administrative",
]);
export type CapabilityDelegation = z.infer<typeof CapabilityDelegationSchema>;

/**
 * The exhaustive partition of the capability vocabulary. Every list that
 * decides what an operator may hold derives from this record, so a new
 * capability fails the build until someone classifies it. Reasons for the
 * `administrative` and `runtime` entries are recorded in ADR-046.
 */
export const CAPABILITY_DELEGATION: Readonly<
  Record<Capability, CapabilityDelegation>
> = {
  "workspace.createLocal": "administrative",
  "workspace.rename": "administrative",
  "workspace.bootstrapContext": "read",
  "workspace.manageAccess": "administrative",
  "workspace.access": "read",
  "workspace.exportScoped": "administrative",
  "capture.submit": "operate",
  "capture.process": "operate",
  "capture.audioRead": "sensitive",
  "capture.transcriptWrite": "operate",
  "capture.audioDeleteConfirm": "runtime",
  "capture.submitText": "operate",
  "capture.routeAsTask": "operate",
  "capture.history": "read",
  "project.create": "operate",
  "project.updateOutcome": "operate",
  "project.list": "read",
  "project.operationalOverview": "read",
  "document.create": "operate",
  "document.list": "read",
  "document.linkCandidates": "read",
  "document.backlinks": "read",
  "document.readText": "read",
  "document.replaceText": "operate",
  "knowledge.sourceCreate": "operate",
  "knowledge.sourceUpdate": "operate",
  "knowledge.documentSetEvidence": "operate",
  "knowledge.namedVersionCreate": "operate",
  "knowledge.namedVersionVoid": "operate",
  "knowledge.list": "read",
  "knowledge.documentContext": "read",
  "relationship.organizationCreate": "operate",
  "relationship.personCreate": "operate",
  "opportunity.create": "operate",
  "opportunity.offerCreate": "operate",
  "opportunity.linkOutcomes": "operate",
  "relationship.workspace": "read",
  "relationship.renewalCreate": "operate",
  "relationship.renewalResolve": "operate",
  "relationship.factCreate": "operate",
  "decision.create": "operate",
  "decision.supersede": "operate",
  "decision.resolveImpact": "operate",
  "area.create": "operate",
  "initiative.create": "operate",
  "work.linkCreate": "operate",
  "work.linkRemove": "operate",
  "savedView.create": "operate",
  "savedView.rename": "operate",
  "savedView.update": "operate",
  "savedView.delete": "operate",
  "task.setOperationalState": "operate",
  "work.overview": "read",
  "recurrence.create": "operate",
  "recurrence.generateOccurrence": "operate",
  "project.close": "operate",
  "project.reopen": "operate",
  "radar.candidateUpsert": "operate",
  "radar.resolve": "operate",
  "radar.review": "read",
  "meeting.upsertImported": "operate",
  "meeting.route": "operate",
  "meeting.promoteWorkItem": "operate",
  "meeting.linkParticipants": "operate",
  "meeting.editWorkItem": "operate",
  "meeting.correctWorkItemResponsibility": "operate",
  "meeting.addWorkItem": "operate",
  "task.create": "operate",
  "task.updateDetails": "operate",
  "task.setParent": "operate",
  "template.create": "operate",
  "automation.create": "operate",
  "automation.rename": "operate",
  "automation.setState": "operate",
  "automation.sweep": "operate",
  "recurrence.sweep": "operate",
  "task.setCalendarBlock": "operate",
  "template.rename": "operate",
  "template.updateContents": "operate",
  "template.archive": "operate",
  "template.restore": "operate",
  "project.applyTemplate": "operate",
  "fieldDef.create": "operate",
  "fieldDef.rename": "operate",
  "fieldDef.archive": "operate",
  "fieldDef.restore": "operate",
  "record.setFieldValue": "operate",
  "taskStatus.create": "operate",
  "taskStatus.rename": "operate",
  "taskStatus.setSemantics": "operate",
  "taskStatus.reorder": "operate",
  "taskStatus.archive": "operate",
  "taskStatus.restore": "operate",
  "workspace.setDefaultTaskStatus": "operate",
  "task.setStatus": "operate",
  "task.complete": "operate",
  "task.reopen": "operate",
  "task.remove": "operate",
  "task.assign": "operate",
  "task.unassign": "operate",
  "record.relate": "operate",
  "record.unrelate": "operate",
  "search.global": "read",
  "cockpit.week": "read",
  "activity.meaningful": "read",
  "activity.changeFeed": "read",
  "command.previewUndo": "operate",
  "command.undo": "operate",
  "recovery.preview": "read",
  "task.list": "read",
  "task.assignmentCandidates": "read",
  "comment.add": "propose",
  "comment.edit": "propose",
  "comment.resolve": "operate",
  "comment.reopen": "operate",
  "comment.list": "read",
  "comment.mentionCandidates": "read",
  "attention.inbox": "read",
  "attention.markRead": "operate",
  "attention.dismiss": "operate",
  "audit.receipt": "read",
  "agent.manageAccess": "administrative",
  "agent.access": "read",
  "agent.checkpoint.create": "operate",
  "agent.checkpoint.previewRevert": "read",
  "agent.checkpoint.revert": "operate",
  "agent.handoff.submit": "operate",
};

const capabilitiesWithDelegation = (
  ...delegations: readonly CapabilityDelegation[]
): readonly Capability[] =>
  CapabilitySchema.options.filter((capability) =>
    delegations.includes(CAPABILITY_DELEGATION[capability]),
  );

export const AgentGrantPresetSchema = z.enum([
  "observe",
  "propose",
  "operate",
  "full_access",
]);
export type AgentGrantPreset = z.infer<typeof AgentGrantPresetSchema>;

/** A stored grant may also record a hand-picked scope as `custom`. */
export const AgentAccessPresetSchema = z.enum([
  ...AgentGrantPresetSchema.options,
  "custom",
]);
export type AgentAccessPreset = z.infer<typeof AgentAccessPresetSchema>;

/** The capability scope a grant preset carries (ADR-046). */
export const capabilitiesForAgentGrantPreset = (
  preset: AgentGrantPreset,
): readonly Capability[] => {
  switch (preset) {
    case "observe":
      return capabilitiesWithDelegation("read");
    case "propose":
      return capabilitiesWithDelegation("read", "propose");
    case "operate":
      return capabilitiesWithDelegation("read", "propose", "operate");
    case "full_access":
      return capabilitiesWithDelegation(
        "read",
        "propose",
        "operate",
        "sensitive",
      );
  }
};

/**
 * Capabilities an agent grant may carry at all. `runtime` and
 * `administrative` capabilities are excluded by design; the Hub enforces the
 * same partition independently on the remote path.
 */
export const DELEGABLE_CAPABILITIES: readonly Capability[] =
  capabilitiesWithDelegation("read", "propose", "operate", "sensitive");

/** Capabilities no agent grant may carry, local or remote. */
export const NON_DELEGABLE_CAPABILITIES: readonly Capability[] =
  capabilitiesWithDelegation("runtime", "administrative");

export const ExecutionContextSchema = z
  .object({
    principalId: PrincipalIdSchema,
    principalKind: PrincipalKindSchema,
    delegatingUserId: PrincipalIdSchema.optional(),
    credentialId: CredentialIdSchema,
    grantId: GrantIdSchema,
    policyVersion: z.int().positive(),
    workspaceId: WorkspaceIdSchema,
    spaceScope: z.array(SpaceIdSchema).min(1),
    capabilityScope: z.array(CapabilitySchema).min(1),
    origin: RequestOriginSchema,
    hostRun: z
      .object({
        runId: z.string().trim().min(1).max(200),
        parentRunId: z.string().trim().min(1).max(200).optional(),
        intent: z.string().trim().min(1).max(500).optional(),
        agentRunId: AgentRunIdSchema.optional(),
        hostName: z.string().trim().min(1).max(120).optional(),
        hostVersion: z.string().trim().min(1).max(120).optional(),
        modelProvider: z.string().trim().min(1).max(120).optional(),
        modelName: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
