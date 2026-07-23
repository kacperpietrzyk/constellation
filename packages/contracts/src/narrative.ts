import { z } from "zod";

/**
 * The prose a Project, Area or Initiative exists for: a Project's intended
 * outcome, an Area's responsibility, an Initiative's intended outcome. One
 * schema rather than a per-command restatement, because the same shape is
 * accepted by three create commands, three edit commands and read back by
 * every projection that carries it.
 *
 * It is optional wherever a record is created: an import of work that predates
 * the record usually has no written intent, and forcing one guarantees a
 * plausible-looking invention in a system whose value is that its records are
 * trustworthy. Absent means "not written yet"; the empty string stays
 * unrepresentable so a blank cannot pass for prose.
 */
export const RecordNarrativeSchema = z.string().trim().min(1).max(4_000);

/**
 * Derived, never persisted: true when the record's narrative was never
 * written. Projections coalesce the narrative itself to "" so a reader needs
 * no null handling, which is exactly what would make the gap invisible — this
 * flag is what keeps it visible and completable.
 */
export const NeedsReviewSchema = z
  .boolean()
  .describe(
    "True when the record's narrative was never written. Derived from the record, not stored: filling the narrative in clears it.",
  );
