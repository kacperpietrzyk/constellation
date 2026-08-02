import type { MarkdownImportConstruct } from "@constellation/realtime-documents";

/**
 * WHAT WILL NOT MIGRATE — named on the screen BEFORE the import runs.
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
 * An entry with no `construct` states so with `countable: false` rather than
 * omitting the key, because "nothing counts this" is a decision — canvas files
 * are not markdown and never reach the parser at all — and an omitted key
 * reads as an oversight.
 *
 * The type is imported TYPE-ONLY. This module is data, and pulling the parser
 * behind it would put the whole markdown reader into the Settings chunk.
 */
export interface NotesImportLimitation {
  readonly id: string;
  readonly heading: string;
  readonly detail: string;
  /** The scan's counter for this construct, or `false` when nothing counts it. */
  readonly construct: MarkdownImportConstruct | false;
  /** A document node kind that would be needed. Asserted ABSENT by the guard. */
  readonly wouldNeedNodeKind?: string;
  /** An inline mark that would be needed. Asserted ABSENT by the guard. */
  readonly wouldNeedMark?: string;
}

export const notesImportLimitations: readonly NotesImportLimitation[] = [
  {
    id: "frontmatter",
    heading: "Properties at the top of a note",
    detail:
      "A note has no properties, so tags, aliases and dates written in the block at the top of a file cannot become fields. The block is kept at the top of the note as text, so nothing is lost and you can see it.",
    construct: "frontmatter",
  },
  {
    id: "tags",
    heading: "Tags",
    detail:
      "A note carries no tags. A #tag stays as the word you wrote, inside the sentence it was in; folders and links are what filing is made of here.",
    construct: "tag",
  },
  {
    id: "embeds",
    heading: "Embedded notes",
    detail:
      "![[Another note]] shows one note inside another. There is no such thing here — a note names another note, it does not contain it — so the line stays as text.",
    construct: "embed",
    wouldNeedNodeKind: "embed",
  },
  {
    id: "callouts",
    heading: "Callouts",
    detail:
      "A quote can be a quote, but not a warning or a tip: there is nowhere to keep which kind it was. The quote arrives with [!warning] still written in it, so you can still tell.",
    construct: "callout",
    wouldNeedNodeKind: "callout",
  },
  {
    id: "task-checkboxes",
    heading: "Checkboxes in a note",
    detail:
      "A task lives in exactly one place and a note points at it, so - [ ] does not become a task. The line arrives as an ordinary bullet with the box still in it.",
    construct: "taskCheckbox",
  },
  {
    id: "block-references",
    heading: "Links to a paragraph",
    detail:
      "A link can name a note, never a paragraph inside one: ^block-ids have nothing to anchor to. The link resolves to the note, and the part after # or ^ is dropped.",
    construct: "blockReference",
  },
  {
    id: "pictures",
    heading: "Pictures in a note",
    detail:
      "A picture here is a file this workspace keeps, named by identity. A picture in a vault is a path on one machine, so it cannot be adopted by pointing at it — the line stays as text and the file stays where it is.",
    construct: "imageLink",
  },
  {
    id: "links-to-files",
    heading: "Links to files other than notes",
    detail:
      "A link can hold a web address; a link into your vault's own folders has nowhere to point once the notes are here. Those stay as text so you can still read where they went.",
    construct: "relativeLink",
    wouldNeedMark: "file",
  },
  {
    id: "list-shape",
    heading: "A bullet that starts with a sub-list",
    detail:
      "Every bullet begins with a line of its own here. A bullet that opens straight into an indented list gets an empty first line rather than losing the list.",
    construct: "listItemLead",
  },
  {
    id: "outside-markdown",
    heading: "Canvas, Dataview and plugin syntax",
    detail:
      "Only .md files are read. A canvas is a different kind of file and is left alone; anything a plugin renders arrives as the characters that are actually in the file, because that is all a file holds.",
    construct: false,
  },
  {
    id: "history",
    heading: "What the files never had",
    detail:
      "Editing history, named versions and who wrote what start here, on the day of the import. A file has one state; a note has every state it passes through from now on.",
    construct: false,
  },
];
