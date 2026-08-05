import { type CommandName } from "./command.js";
import { type Capability, type PrincipalKind } from "./execution-context.js";
import { type QueryName } from "./query.js";

/**
 * What a grant must hold for one operation's authorization to pass.
 *
 * `capability` is the grant-level question the kernel asks first — before any
 * target is read, per the ordering kernel.ts explains at the top of its
 * authorization switch. `additionalCapabilities` are the further questions an
 * arm asks once it has resolved its target, because the command writes outside
 * its own kind: promotion inserts a Task, so it carries `task.create` and does
 * not become a privilege path around the Task grant (ADR-040 §7).
 *
 * A second capability is a separate field rather than a wider type for
 * `capability` because the published catalog shape is already in the field:
 * 0.1.9 hosts parse `requiredCapability` as a string, and turning it into an
 * array would break every one of them on upgrade.
 */
export interface OperationCapabilityRequirement {
  readonly capability: Capability;
  readonly additionalCapabilities?: readonly Capability[];
  /**
   * Which principal kinds may execute the operation at all. ABSENT means any,
   * so the field costs nothing on the ~140 rows that do not care — and absent
   * is the honest default, because a kind restriction is the exception.
   *
   * Stated beside the capability because the two questions have the same two
   * readers, and held apart the second one drifted exactly as the first one
   * did. `capture.requestAudioDeletion` consults `capture.process`, which every
   * `operate` grant carries, so the moment the catalog started deriving
   * reachability from capabilities it began advertising a command whose kernel
   * arm refuses every agent that can ever hold that capability. A catalog
   * cannot see a rule that exists only inside a `case` body; the cure is to
   * move the rule where both readers already look, not to teach the catalog a
   * second hand-written list of exceptions.
   *
   * Kinds and not a boolean: `agent.checkpointCreate` and `agent.handoffSubmit`
   * restrict in the OTHER direction — they write into an agent run, so a human
   * has no run to write into — and a field spelled `humanOnly` would have had
   * nothing to say about them.
   *
   * The field lives on the requirement shared by commands and queries, and only
   * COMMAND arms consume it — no read path restricts a principal kind, and the
   * two query arms that mention `principalKind` (`agent.access`,
   * `agent.checkpointPreviewRevert`) branch to WIDEN rather than to refuse. So
   * a marked QUERY_CAPABILITIES row would be withheld from the catalog and
   * enforced by nothing, which is a one-way statement of exactly the kind this
   * table exists to abolish: if a read ever needs one, make its arm read this
   * first.
   *
   * Origin is deliberately NOT stated here. Exactly one command restricts it
   * (`capture.confirmAudioDeletion` demands the `maintenance` origin) and its
   * capability is `runtime`-class, which no operator may delegate to any grant,
   * so nothing reaches that arm for a catalog to filter. A field the table
   * carries and no reader needs is the next copy of the rule nobody checks.
   */
  readonly principalKinds?: readonly PrincipalKind[];
}

/**
 * Whether a principal of this kind may execute the operation at all.
 *
 * The kernel calls this in the exact position each hand-written kind check
 * occupied — including `agent-access.ts`, where the agent-only question is
 * asked BEFORE the capability consult on purpose — so the ordering ADR-067
 * relies on is untouched while the rule itself is stated once. That is what
 * makes the MCP catalog's filter a CONSEQUENCE of the kernel's decision rather
 * than a second opinion about it.
 */
export const operationPermitsPrincipalKind = (
  requirement: OperationCapabilityRequirement,
  principalKind: PrincipalKind,
): boolean =>
  requirement.principalKinds === undefined ||
  requirement.principalKinds.includes(principalKind);

/**
 * Every capability an operation's authorization consults, primary first.
 *
 * The set — not the primary alone — is what "can this grant reach this
 * operation" means. A scope holding the primary and missing an additional one
 * reaches the arm and is refused inside it, which is precisely the shape a
 * catalog that published only the primary told an agent was reachable.
 */
export const operationCapabilities = (
  requirement: OperationCapabilityRequirement,
): readonly Capability[] => [
  requirement.capability,
  ...(requirement.additionalCapabilities ?? []),
];

/**
 * The capability every command's authorization actually consults.
 *
 * WHY THIS EXISTS, and what breaks without it: the MCP catalog used to decide
 * reachability from a hand-written table of four aliases, and the kernel
 * restated the same requirement inside its `case` arms. Two hand-maintained
 * copies of one rule is the defect family this repository keeps meeting — the
 * copies drifted, and the catalog stopped listing `capture.reportException`
 * and `capture.resolveException` even though a `capture.process` grant could
 * and did execute them. The documentation said one thing, the machine-readable
 * catalog said another, and nothing could see the gap because the test's
 * expectation was a third copy of the same four rows.
 *
 * Total on purpose, like CAPABILITY_DELEGATION above it: keyed by the
 * command-name union, so a new command fails the build until someone states
 * which capability guards it. That is the only property that makes this table
 * a mechanism rather than a fifth copy.
 *
 * The kernel READS this table — it does not restate it — and the catalog reads
 * it too, so the two cannot disagree. That holds for `principalKinds` as much
 * as for `capability`: the arms call `operationPermitsPrincipalKind` where
 * their literal kind checks used to sit, and the catalog withholds from an
 * agent whatever the table says an agent cannot execute. Entries whose value
 * repeats the command name are still written out: an entry that could be
 * defaulted is an entry nobody has to think about, and the four rows that
 * mattered were exactly the ones a default would have swallowed.
 *
 * packages/testkit/test/operation-capabilities.conformance.test.ts executes
 * every command through the real kernel and asserts each stated capability is
 * both sufficient and necessary.
 */
export const COMMAND_CAPABILITIES: Readonly<
  Record<CommandName, OperationCapabilityRequirement>
> = {
  // A workspace is brought into being by the person who will own it: the arm
  // also requires the caller to BE `payload.ownerPrincipalId`, and an agent
  // principal owning a workspace is not a thing this product has.
  "workspace.createLocal": {
    capability: "workspace.createLocal",
    principalKinds: ["human"],
  },
  "workspace.rename": { capability: "workspace.rename" },
  // Retention is not a capability of its own and never was: deciding whether
  // recorded audio is kept or deleted is administrative authority over
  // sensitive material, so it deliberately shares the rename grant. Spelling
  // it as its own capability would newly refuse every grant in the field that
  // holds `workspace.rename` (ADR-067 §3).
  "workspace.setVoiceAudioRetention": { capability: "workspace.rename" },
  // The working day left that arm: it is an ordinary operate-class setting,
  // the class `workspace.setCommercialDefaults` and
  // `workspace.setDefaultTaskStatus` already carry, and it sat beside rename
  // by adjacency rather than by decision. No grant in the field loses
  // anything — the capability is new, so nobody held it before.
  "workspace.setWorkingDay": { capability: "workspace.setWorkingDay" },
  "workspace.memberAdd": { capability: "workspace.manageAccess" },
  "workspace.memberSetAccess": { capability: "workspace.manageAccess" },
  "workspace.memberRevoke": { capability: "workspace.manageAccess" },
  // Who an agent is and what it may reach is decided by a person, never by an
  // agent — an agent editing its own grant is the escalation the whole grant
  // model exists to prevent. `agent.manageAccess` is also `administrative`
  // class, so no grant carries it either; the kind is stated anyway, because a
  // rule that holds only as long as a classification stays put is a rule
  // nobody wrote down.
  "agent.grantCreate": {
    capability: "agent.manageAccess",
    principalKinds: ["human"],
  },
  "agent.grantRotateCredential": {
    capability: "agent.manageAccess",
    principalKinds: ["human"],
  },
  "agent.grantRevoke": {
    capability: "agent.manageAccess",
    principalKinds: ["human"],
  },
  "agent.grantSetScope": {
    capability: "agent.manageAccess",
    principalKinds: ["human"],
  },
  // Spelled for the act rather than for the command: these three capabilities
  // are already written into every grant in the field, and renaming one
  // silently removes it from all of them (ADR-067 §3, ADR-069).
  //
  // The first and third restrict to `agent` rather than away from it: both
  // write into an agent RUN, whose identity is the grant-plus-host-run pair the
  // caller carries, and a human has no run for them to write into.
  // `agent.checkpointRevert` deliberately carries no kind: a person reverting
  // an agent's checkpoint from the desktop is the recovery path it exists for.
  "agent.checkpointCreate": {
    capability: "agent.checkpoint.create",
    principalKinds: ["agent"],
  },
  "agent.checkpointRevert": { capability: "agent.checkpoint.revert" },
  "agent.handoffSubmit": {
    capability: "agent.handoff.submit",
    principalKinds: ["agent"],
  },
  "capture.submit": { capability: "capture.submit" },
  "capture.process": { capability: "capture.process" },
  // The two rows the old alias table omitted. A `capture.process` grant HAS
  // been able to run both since they existed — reporting and resolving an
  // exception is capture processing — and docs/local-mcp-agents.md said so
  // while the catalog listed neither.
  "capture.reportException": { capability: "capture.process" },
  "capture.resolveException": { capability: "capture.process" },
  "capture.writeTranscript": { capability: "capture.transcriptWrite" },
  // The row this field was added for. Deleting a person's recorded voice is a
  // decision a person takes, and the kernel has always refused any other kind
  // — but the capability it consults is `capture.process`, which every
  // `operate` grant carries, so a catalog deriving reachability from
  // capabilities alone listed it to agents that can never run it.
  "capture.requestAudioDeletion": {
    capability: "capture.process",
    principalKinds: ["human"],
  },
  // Its sibling additionally demands the `maintenance` origin, which stays a
  // literal in the kernel (see the field's comment): the origin rule protects
  // nothing here that `capture.audioDeleteConfirm` being `runtime`-class does
  // not already protect, so it is not worth a second column.
  "capture.confirmAudioDeletion": {
    capability: "capture.audioDeleteConfirm",
    principalKinds: ["human"],
  },
  "capture.submitText": { capability: "capture.submitText" },
  "capture.routeAsTask": { capability: "capture.routeAsTask" },
  "project.create": { capability: "project.create" },
  "project.remove": { capability: "project.remove" },
  "document.create": { capability: "document.create" },
  "document.rename": { capability: "document.rename" },
  "document.remove": { capability: "document.remove" },
  "document.setFolder": { capability: "document.setFolder" },
  "folder.create": { capability: "folder.create" },
  "folder.rename": { capability: "folder.rename" },
  "folder.setParent": { capability: "folder.setParent" },
  "folder.remove": { capability: "folder.remove" },
  "knowledge.sourceCreate": { capability: "knowledge.sourceCreate" },
  "knowledge.sourceRemove": { capability: "knowledge.sourceRemove" },
  "knowledge.sourceUpdate": { capability: "knowledge.sourceUpdate" },
  "knowledge.documentSetEvidence": {
    capability: "knowledge.documentSetEvidence",
  },
  "knowledge.namedVersionCreate": {
    capability: "knowledge.namedVersionCreate",
  },
  "knowledge.namedVersionVoid": { capability: "knowledge.namedVersionVoid" },
  "relationship.organizationCreate": {
    capability: "relationship.organizationCreate",
  },
  "relationship.organizationRemove": {
    capability: "relationship.organizationRemove",
  },
  "relationship.personCreate": { capability: "relationship.personCreate" },
  "relationship.personUpdate": { capability: "relationship.personUpdate" },
  "relationship.organizationUpdate": {
    capability: "relationship.organizationUpdate",
  },
  "relationship.personRemove": { capability: "relationship.personRemove" },
  "opportunity.create": { capability: "opportunity.create" },
  "opportunity.update": { capability: "opportunity.update" },
  "opportunity.remove": { capability: "opportunity.remove" },
  "opportunity.offerCreate": { capability: "opportunity.offerCreate" },
  "opportunity.offerUpdate": { capability: "opportunity.offerUpdate" },
  "opportunity.offerRemove": { capability: "opportunity.offerRemove" },
  "opportunity.linkOutcomes": { capability: "opportunity.linkOutcomes" },
  "relationship.renewalCreate": { capability: "relationship.renewalCreate" },
  "relationship.renewalUpdate": { capability: "relationship.renewalUpdate" },
  "relationship.renewalResolve": { capability: "relationship.renewalResolve" },
  "relationship.factCreate": { capability: "relationship.factCreate" },
  "relationship.factRemove": { capability: "relationship.factRemove" },
  "decision.create": { capability: "decision.create" },
  "decision.update": { capability: "decision.update" },
  "decision.remove": { capability: "decision.remove" },
  "decision.supersede": { capability: "decision.supersede" },
  "decision.resolveImpact": { capability: "decision.resolveImpact" },
  "area.create": { capability: "area.create" },
  "area.remove": { capability: "area.remove" },
  "area.updateResponsibility": { capability: "area.updateResponsibility" },
  "initiative.create": { capability: "initiative.create" },
  "initiative.remove": { capability: "initiative.remove" },
  "initiative.updateOutcome": { capability: "initiative.updateOutcome" },
  "work.linkCreate": { capability: "work.linkCreate" },
  "work.linkRemove": { capability: "work.linkRemove" },
  "savedView.create": { capability: "savedView.create" },
  "savedView.rename": { capability: "savedView.rename" },
  "savedView.update": { capability: "savedView.update" },
  "savedView.delete": { capability: "savedView.delete" },
  "recurrence.create": { capability: "recurrence.create" },
  "recurrence.generateOccurrence": {
    capability: "recurrence.generateOccurrence",
  },
  "project.close": { capability: "project.close" },
  "project.reopen": { capability: "project.reopen" },
  "radar.candidateUpsert": { capability: "radar.candidateUpsert" },
  "radar.resolve": { capability: "radar.resolve" },
  "meeting.upsertImported": { capability: "meeting.upsertImported" },
  "meeting.route": { capability: "meeting.route" },
  // ADR-040 §7: promotion inserts a Task directly, so it must not become a
  // privilege path around the Task-creation grant.
  "meeting.promoteWorkItem": {
    capability: "meeting.promoteWorkItem",
    additionalCapabilities: ["task.create"],
  },
  // Linking can create a Person, so it carries the relationship grant too.
  "meeting.linkParticipants": {
    capability: "meeting.linkParticipants",
    additionalCapabilities: ["relationship.personCreate"],
  },
  "meeting.editWorkItem": { capability: "meeting.editWorkItem" },
  "meeting.correctWorkItemResponsibility": {
    capability: "meeting.correctWorkItemResponsibility",
  },
  "meeting.addWorkItem": { capability: "meeting.addWorkItem" },
  "meeting.detachNote": { capability: "meeting.detachNote" },
  "project.updateOutcome": { capability: "project.updateOutcome" },
  "project.updateDetails": { capability: "project.updateDetails" },
  "task.create": { capability: "task.create" },
  "task.updateDetails": { capability: "task.updateDetails" },
  "task.setParent": { capability: "task.setParent" },
  // Templates, automation rules and the recurrence sweep all insert Tasks
  // directly, so each carries the Task-creation grant for the same reason
  // meeting promotion does. `automation.sweep` is the one neighbour that does
  // NOT: it only moves work that already exists.
  "template.create": {
    capability: "template.create",
    additionalCapabilities: ["task.create"],
  },
  "automation.create": {
    capability: "automation.create",
    additionalCapabilities: ["task.create"],
  },
  "automation.rename": {
    capability: "automation.rename",
    additionalCapabilities: ["task.create"],
  },
  "automation.setState": {
    capability: "automation.setState",
    additionalCapabilities: ["task.create"],
  },
  "automation.sweep": { capability: "automation.sweep" },
  "recurrence.sweep": {
    capability: "recurrence.sweep",
    additionalCapabilities: ["task.create"],
  },
  "task.setCalendarBlock": { capability: "task.setCalendarBlock" },
  "template.rename": {
    capability: "template.rename",
    additionalCapabilities: ["task.create"],
  },
  "template.updateContents": {
    capability: "template.updateContents",
    additionalCapabilities: ["task.create"],
  },
  "template.archive": {
    capability: "template.archive",
    additionalCapabilities: ["task.create"],
  },
  "template.restore": {
    capability: "template.restore",
    additionalCapabilities: ["task.create"],
  },
  "project.applyTemplate": { capability: "project.applyTemplate" },
  "fieldDef.create": { capability: "fieldDef.create" },
  "fieldDef.rename": { capability: "fieldDef.rename" },
  "fieldDef.archive": { capability: "fieldDef.archive" },
  "fieldDef.restore": { capability: "fieldDef.restore" },
  "record.setFieldValue": { capability: "record.setFieldValue" },
  "taskStatus.create": { capability: "taskStatus.create" },
  "taskStatus.rename": { capability: "taskStatus.rename" },
  "taskStatus.setSemantics": { capability: "taskStatus.setSemantics" },
  "taskStatus.reorder": { capability: "taskStatus.reorder" },
  "taskStatus.archive": { capability: "taskStatus.archive" },
  "taskStatus.restore": { capability: "taskStatus.restore" },
  "workspace.setDefaultTaskStatus": {
    capability: "workspace.setDefaultTaskStatus",
  },
  "workspace.setCommercialDefaults": {
    capability: "workspace.setCommercialDefaults",
  },
  "task.setStatus": { capability: "task.setStatus" },
  "task.setOperationalState": { capability: "task.setOperationalState" },
  "task.complete": { capability: "task.complete" },
  "task.reopen": { capability: "task.reopen" },
  "task.remove": { capability: "task.remove" },
  "task.assign": { capability: "task.assign" },
  "task.unassign": { capability: "task.unassign" },
  "comment.add": { capability: "comment.add" },
  "comment.edit": { capability: "comment.edit" },
  "comment.resolve": { capability: "comment.resolve" },
  // Reopening authorized against `comment.resolve` for as long as the ternary
  // in the kernel said so, which left `comment.reopen` as dead vocabulary: it
  // exists in `CapabilitySchema`, it is classified `operate`, every preset from
  // `operate` up carries it — and nothing ever consulted it. Granting it alone
  // achieved nothing, and a scope holding `comment.resolve` alone could reopen
  // without ever having been given the permission named after the act.
  //
  // Both capabilities are `operate` and every preset carries both, so no
  // preset-issued grant loses anything here. What changes is the one shape that
  // was lying: a hand-narrowed scope holding `comment.resolve` without
  // `comment.reopen` is now refused, which is the honest answer to a scope that
  // was deliberately narrowed.
  "comment.reopen": { capability: "comment.reopen" },
  "attention.markRead": { capability: "attention.markRead" },
  "attention.dismiss": { capability: "attention.dismiss" },
  "record.relate": { capability: "record.relate" },
  "record.unrelate": { capability: "record.unrelate" },
  "command.previewUndo": { capability: "command.previewUndo" },
  "command.undo": { capability: "command.undo" },
};

/**
 * The same statement for reads. Total for the same reason, even though only
 * one query name diverges today: the point of the table is that the day a
 * second one diverges, nobody has to remember this file exists.
 *
 * `workspace.access` and `agent.access` consult `workspace.manageAccess` and
 * `agent.manageAccess` too, and those are deliberately NOT stated here: they
 * WIDEN the answer (a manager sees every member, a non-manager sees itself)
 * rather than gating it, so publishing them would tell an agent it cannot run
 * a read it can.
 *
 * One row is knowingly stricter than the kernel and stays that way. The only
 * `agent.access` consult sits behind `principalKind === "human"`, so an AGENT
 * reading its own grant is never asked for it — the capability gates the
 * manager's view of every grant, not the self-read. It is published anyway
 * because it is what the catalog has always said, every preset from `observe`
 * up carries it, and the safe direction to err is the one where a grant that
 * holds the capability certainly succeeds. Loosening it would be a change to
 * what a read authorizes, which belongs to whoever decides the self-read
 * should be ungated, not to a table that only writes down what already is.
 */
export const QUERY_CAPABILITIES: Readonly<
  Record<QueryName, OperationCapabilityRequirement>
> = {
  "workspace.bootstrapContext": { capability: "workspace.bootstrapContext" },
  "workspace.access": { capability: "workspace.access" },
  "workspace.exportScoped": { capability: "workspace.exportScoped" },
  "agent.access": { capability: "agent.access" },
  "agent.checkpointPreviewRevert": {
    capability: "agent.checkpoint.previewRevert",
  },
  "capture.history": { capability: "capture.history" },
  "audit.receipt": { capability: "audit.receipt" },
  "task.list": { capability: "task.list" },
  "task.assignmentCandidates": { capability: "task.assignmentCandidates" },
  "comment.list": { capability: "comment.list" },
  "comment.mentionCandidates": { capability: "comment.mentionCandidates" },
  "attention.inbox": { capability: "attention.inbox" },
  "project.list": { capability: "project.list" },
  "work.overview": { capability: "work.overview" },
  "document.list": { capability: "document.list" },
  "document.linkCandidates": { capability: "document.linkCandidates" },
  "document.backlinks": { capability: "document.backlinks" },
  "knowledge.list": { capability: "knowledge.list" },
  "knowledge.documentContext": { capability: "knowledge.documentContext" },
  "relationship.workspace": { capability: "relationship.workspace" },
  "person.list": { capability: "person.list" },
  "organization.list": { capability: "organization.list" },
  "radar.review": { capability: "radar.review" },
  "project.operationalOverview": { capability: "project.operationalOverview" },
  "organization.operationalOverview": {
    capability: "organization.operationalOverview",
  },
  "search.global": { capability: "search.global" },
  "cockpit.week": { capability: "cockpit.week" },
  "activity.meaningful": { capability: "activity.meaningful" },
  "activity.changeFeed": { capability: "activity.changeFeed" },
  "recovery.preview": { capability: "recovery.preview" },
};
