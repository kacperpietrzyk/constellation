import { z } from "zod";

// Single-command recovery (command.previewUndo, recovery.preview). A command
// records at most one compensation descriptor, so unavailability is a property
// of that descriptor. Restating this enum per projection is how the two undo
// surfaces drifted apart, so both import it from here.
export const UndoUnavailableReasonSchema = z
  .enum(["unsupported", "already_undone", "later_change"])
  .describe(
    'Why the target command cannot be compensated now. "unsupported": the command applied but its kind records no compensation, so no undo will ever become available — an unknown or mistyped command id is rejected as authorization.denied instead of previewed. "already_undone": the compensation was consumed by an earlier undo. "later_change": a record moved past the version the compensation requires.',
  );

// Checkpoint reverts span a set of commands, so the vocabulary differs by one
// member on purpose: a checkpoint carries its own revert lifecycle
// ("already_reverted"), while "already_undone" is a per-descriptor state only a
// single-command preview can report.
export const CheckpointRevertUnavailableReasonSchema = z
  .enum(["already_reverted", "unsupported", "later_change"])
  .describe(
    'Why the checkpoint cannot be reverted now. "already_reverted": the checkpoint was reverted before. "unsupported": at least one command in it records no compensation. "later_change": at least one compensation was already consumed by a later undo.',
  );
