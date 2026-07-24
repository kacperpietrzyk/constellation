import { type CommandName } from "./command.js";

/**
 * Whether a command records a compensation descriptor when it succeeds.
 * "always" — every successful application records one, whichever payload it
 * carried; "never" — the kind records none and no retry will change that, so a
 * checkpoint containing it can never be reverted.
 *
 * An agent sizes a slice of work before writing it, which means it needs this
 * before the first command, not after the write has landed. The vocabulary is
 * a string rather than a boolean because revertability is a quantifier over
 * payloads, and a handler that compensated only some of them would need a
 * third value rather than a different shape.
 */
export type CommandRevertability = "always" | "never";

/**
 * Compensation is decided inside each handler, so this table cannot be
 * generated from the Zod unions the rest of the catalog is generated from —
 * and hand-maintained catalog data is exactly the drift ADR-039 removed. Two
 * things keep it honest: the exhaustive Record makes a new command a compile
 * error until it is classified here, and
 * packages/testkit/test/command-revertability.conformance.test.ts executes
 * every classified command and asserts the descriptor it actually records.
 */
export const COMMAND_REVERTABILITY: Readonly<
  Record<CommandName, CommandRevertability>
> = {
  "workspace.createLocal": "never",
  "workspace.rename": "never",
  "workspace.setVoiceAudioRetention": "never",
  "workspace.memberAdd": "never",
  "workspace.memberSetAccess": "never",
  "workspace.memberRevoke": "never",
  "agent.grantCreate": "never",
  "agent.grantRotateCredential": "never",
  "agent.grantRevoke": "never",
  // Deliberately uncompensated: a security scope a human narrowed must not be
  // widened again by reverting a checkpoint that happened to contain it.
  "agent.grantSetScope": "never",
  "agent.checkpointCreate": "never",
  "agent.handoffSubmit": "never",
  "capture.submit": "never",
  "capture.process": "always",
  "capture.reportException": "never",
  "capture.resolveException": "never",
  "capture.writeTranscript": "never",
  "capture.requestAudioDeletion": "never",
  "capture.confirmAudioDeletion": "never",
  "capture.submitText": "never",
  "capture.routeAsTask": "always",
  "project.create": "always",
  "project.remove": "always",
  "document.create": "always",
  "document.remove": "always",
  "knowledge.sourceCreate": "always",
  "knowledge.sourceRemove": "always",
  "knowledge.sourceUpdate": "always",
  "knowledge.documentSetEvidence": "always",
  "knowledge.namedVersionCreate": "always",
  "knowledge.namedVersionVoid": "never",
  "relationship.organizationCreate": "always",
  "relationship.organizationRemove": "always",
  "relationship.personCreate": "always",
  "relationship.personRemove": "always",
  "opportunity.create": "always",
  "opportunity.remove": "always",
  "opportunity.offerCreate": "always",
  "opportunity.offerRemove": "always",
  "opportunity.linkOutcomes": "never",
  "relationship.renewalCreate": "never",
  "relationship.renewalResolve": "never",
  "relationship.factCreate": "always",
  "relationship.factRemove": "always",
  "decision.create": "always",
  "decision.remove": "always",
  "decision.supersede": "never",
  "decision.resolveImpact": "never",
  "area.create": "always",
  "area.remove": "always",
  "area.updateResponsibility": "always",
  "initiative.create": "always",
  "initiative.remove": "always",
  "initiative.updateOutcome": "always",
  "work.linkCreate": "always",
  "work.linkRemove": "always",
  "savedView.create": "always",
  "savedView.rename": "always",
  "savedView.update": "always",
  "savedView.delete": "always",
  "recurrence.create": "never",
  "recurrence.generateOccurrence": "never",
  "project.close": "never",
  "project.reopen": "never",
  "radar.candidateUpsert": "never",
  "radar.resolve": "never",
  "meeting.upsertImported": "never",
  "meeting.route": "always",
  "meeting.promoteWorkItem": "always",
  "meeting.linkParticipants": "always",
  "meeting.editWorkItem": "always",
  "meeting.correctWorkItemResponsibility": "always",
  "meeting.addWorkItem": "always",
  "project.updateOutcome": "always",
  "task.create": "always",
  "task.updateDetails": "always",
  "task.setParent": "always",
  "template.create": "never",
  "automation.create": "never",
  "automation.rename": "always",
  "automation.setState": "always",
  "automation.sweep": "never",
  "recurrence.sweep": "never",
  "task.setCalendarBlock": "always",
  "template.rename": "always",
  "template.updateContents": "always",
  "template.archive": "always",
  "template.restore": "always",
  "project.applyTemplate": "always",
  "fieldDef.create": "never",
  "fieldDef.rename": "always",
  "fieldDef.archive": "always",
  "fieldDef.restore": "always",
  "record.setFieldValue": "always",
  "taskStatus.create": "never",
  "taskStatus.rename": "always",
  "taskStatus.setSemantics": "always",
  "taskStatus.reorder": "always",
  "taskStatus.archive": "always",
  "taskStatus.restore": "always",
  "workspace.setDefaultTaskStatus": "always",
  "task.setStatus": "always",
  "task.setOperationalState": "always",
  "task.complete": "always",
  "task.reopen": "always",
  "task.remove": "always",
  "task.assign": "never",
  "task.unassign": "never",
  "comment.add": "never",
  "comment.edit": "never",
  "comment.resolve": "never",
  "comment.reopen": "never",
  "attention.markRead": "never",
  "attention.dismiss": "never",
  "record.relate": "always",
  "record.unrelate": "always",
  "command.previewUndo": "never",
  "command.undo": "never",
};
