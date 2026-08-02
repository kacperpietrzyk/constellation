import type { MarkdownImportConstruct } from "@constellation/realtime-documents";

/**
 * WHAT WILL NOT MIGRATE — the list named on the screen BEFORE the import runs.
 *
 * A person about to move two hundred notes is entitled to know what arrives
 * changed, and to know it while they can still decide not to. This list was
 * derived from what the document schema can and cannot express, not from
 * running the import once and writing down what broke.
 *
 * IT IS A HAND-WRITTEN LIST BESIDE A CLOSED VOCABULARY, which is the defect
 * family this repository has met eleven times — so it is GUARDED, in
 * `notes-import-limitations.test.ts`, in both directions:
 *
 *   - every construct the parser counts is claimed by exactly one entry here,
 *     so a new construct cannot arrive unnamed;
 *   - every `wouldNeed*` claim is checked against the real vocabulary, so the
 *     day somebody adds a `callout` node kind this list stops compiling its
 *     own excuse and has to be corrected.
 *
 * An entry with no `construct` states so with `false` rather than omitting the
 * key, because "nothing counts this" is a decision — a canvas is not markdown
 * and never reaches the parser at all — and an omitted key reads as an
 * oversight.
 *
 * THE WORDS ARE NOT HERE. They live in `SettingsSurface.tsx`, in a TOTAL
 * `Record` keyed by these ids, so an id added without copy does not compile.
 * The split is not cosmetic: Settings copy is deliberately outside the prose
 * guard, because long text beside a control states a CONSEQUENCE and no
 * pattern can tell that from a lecture — and this file is data, which the
 * guard should keep reading.
 *
 * The type import is TYPE-ONLY: pulling the parser behind this would put the
 * whole markdown reader into the Settings chunk.
 */
export interface NotesImportLimitation {
  readonly id: NotesImportLimitationId;
  /** The scan's counter for this construct, or `false` when nothing counts it. */
  readonly construct: MarkdownImportConstruct | false;
  /** A document node kind that would be needed. Asserted ABSENT by the guard. */
  readonly wouldNeedNodeKind?: string;
  /** An inline mark that would be needed. Asserted ABSENT by the guard. */
  readonly wouldNeedMark?: string;
}

const entries = [
  { id: "frontmatter", construct: "frontmatter" },
  { id: "tags", construct: "tag" },
  { id: "embeds", construct: "embed", wouldNeedNodeKind: "embed" },
  { id: "callouts", construct: "callout", wouldNeedNodeKind: "callout" },
  { id: "task-checkboxes", construct: "taskCheckbox" },
  { id: "block-references", construct: "blockReference" },
  { id: "pictures", construct: "imageLink" },
  { id: "links-to-files", construct: "relativeLink", wouldNeedMark: "file" },
  { id: "list-shape", construct: "listItemLead" },
  { id: "outside-markdown", construct: false },
  { id: "history", construct: false },
] as const;

/**
 * The ids, DERIVED from the entries above rather than restated beside them —
 * so the copy `Record` in Settings cannot miss one, and cannot carry one that
 * no longer exists.
 */
export type NotesImportLimitationId = (typeof entries)[number]["id"];

/** The same entries, widened, so a reader can ask any entry for any field. */
export const notesImportLimitations: readonly NotesImportLimitation[] = entries;
