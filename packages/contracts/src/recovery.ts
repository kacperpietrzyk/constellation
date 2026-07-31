import { z } from "zod";

// Single-command recovery (command.previewUndo, recovery.preview). A command
// records at most one compensation descriptor, so unavailability is a property
// of that descriptor. Restating this enum per projection is how the two undo
// surfaces drifted apart, so both import it from here.
export const UndoUnavailableReasonSchema = z
  .enum(["unsupported", "already_undone", "later_change", "still_referenced"])
  .describe(
    'Why the target command cannot be compensated now. "unsupported": the command applied but its kind records no compensation, so no undo will ever become available — an unknown or mistyped command id is rejected as command.precondition_failed instead of previewed, never as authorization.denied, which states only that the grant lacks the capability. "already_undone": the compensation was consumed by an earlier undo. "later_change": a record moved past the version the compensation requires. "still_referenced": the target command created a record that other work has since attached itself to, so taking it back would orphan that work; detach the records that point at it and the compensation becomes available again.',
  );

// Checkpoint reverts span a set of commands, so the vocabulary differs by one
// member on purpose: a checkpoint carries its own revert lifecycle
// ("already_reverted"), while "already_undone" is a per-descriptor state only a
// single-command preview can report.
export const CheckpointRevertUnavailableReasonSchema = z
  .enum([
    "already_reverted",
    "empty",
    "unsupported",
    "later_change",
    "already_undone",
    "still_referenced",
  ])
  .describe(
    'Why the checkpoint cannot be reverted now. The first two are properties of the checkpoint itself: "already_reverted" — it was reverted before; "empty" — no command named this checkpoint in its envelope, so it captured nothing and reverting it would change nothing, membership being opt-in per command and never implied by sharing a run. The rest summarize the captured command that blocks it, in the same vocabulary a single-command preview uses, and `blocked` names which command each belongs to: "unsupported" — a command in it records no compensation, so no retry will ever help, and it outranks every other reason; "later_change" — a record moved past the version a compensation requires, by work this checkpoint does not carry; "already_undone" — an earlier undo consumed a compensation this revert needs; "still_referenced" — a captured create made a record other work has since attached itself to.',
  );

// The compensation a command recorded, named. It was restated in two
// projections, which is how the two undo surfaces drift; both import it here,
// and the domain's UndoDescriptor kinds are pinned to it by a conformance test.
export const CompensationKindSchema = z.enum([
  "project.restore_outcome",
  "project.restore_details",
  "area.restore_responsibility",
  "initiative.restore_outcome",
  "task.restore_state",
  "task.restore_details",
  "task.restore_calendar_block",
  "task.restore_record_state",
  "task.undo_create",
  "task.restore_parent",
  "taskStatus.restore_definition",
  "workspace.restore_default_status",
  "workspace.restore_commercial_defaults",
  "fieldDef.restore_definition",
  "record.restore_field_value",
  "template.restore_definition",
  "automation.restore_definition",
  "project.unapply_template",
  "meeting.unpromote_work_item",
  "meeting.restore_routing",
  "meeting.restore_work_item",
  "meeting.restore_participant_links",
  "task.restore_operational_state",
  "work_link.restore_state",
  "savedView.restore_definition",
  "relation.remove",
  "relation.restore",
  "capture.undo_route",
  "capture.undo_knowledge_route",
  "knowledge.restore_source",
  "knowledge.restore_evidence",
  "knowledge.void_named_version",
  "relationship.restore_person",
  "relationship.restore_organization",
  "opportunity.restore_details",
  "opportunity.restore_offer_details",
  "relationship.restore_renewal_term",
  "strategic.undo_create",
  "strategic.restore_record_state",
  "record.undo_create",
  "record.restore_record_state",
]);
export type CompensationKind = z.infer<typeof CompensationKindSchema>;
