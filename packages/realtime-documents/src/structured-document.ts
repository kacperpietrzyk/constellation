import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProsemirrorJSON,
} from "@tiptap/y-tiptap";
import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";
import type * as Y from "yjs";

import {
  DOCUMENT_ENTITY_REFERENCE_KINDS,
  type DocumentEntityReferenceKind,
} from "./entity-vocabulary.js";
import {
  MAX_DOCUMENT_TEXT_LENGTH,
  RICH_DOCUMENT_FRAGMENT_ROOT,
} from "./yjs-document-adapter.js";

/**
 * The content schema this build WRITES. Wave D moved it 1 → 2, for `image`
 * and `table`.
 */
export const STRUCTURED_DOCUMENT_SCHEMA_VERSION = 2 as const;

/**
 * The versions this build READS, oldest first.
 *
 * The version was enforced with a hard `!==` against the constant above, in
 * `parseStructuredDocument` — the function every agent read, every idempotency
 * digest and every restore comparison goes through. Bumping the constant
 * without this set would have made every note that exists today unreadable
 * and unwritable to every agent, the same shape as the h4 defect S1 closed,
 * except that this one would have hit ALL of them at once.
 *
 * Removing a version from here is a real decision about abandoning stored
 * content, and it should look like one.
 */
export const READABLE_STRUCTURED_DOCUMENT_SCHEMA_VERSIONS = [1, 2] as const;

export type ReadableStructuredDocumentSchemaVersion =
  (typeof READABLE_STRUCTURED_DOCUMENT_SCHEMA_VERSIONS)[number];

// Poziomy nagłówków, JEDNA lista dla walidatora i dla obu edytorów. Do fali D
// walidator przyjmował `[1, 2, 3]`, a StarterKit oferował sześć poziomów wraz
// ze skrótami `Mod-Alt-N` — więc notatka z h4 wyglądała poprawnie temu, kto ją
// pisał, i była TRWALE NIECZYTELNA ORAZ NIEZAPISYWALNA dla każdego agenta:
// `parseStructuredDocument` odrzucał ją w całości. Rozejście nie miało żadnego
// strażnika i wyszło dopiero z ręcznego porównania obu schematów.
//
// Dlatego stała jest EKSPORTOWANA i wołana po nazwie w obu miejscach, a nie
// przepisana z powrotem na literał: `StarterKit.configure({ heading: { levels } })`
// w `library/KnowledgeEditor.tsx` i `ProjectRichBody.tsx` czyta stąd, więc
// zwężenie jednej strony przestaje być zmianą kompilującą się po cichu.
export const STRUCTURED_DOCUMENT_HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Every bound below is enforced ONCE, here, and published by
 * `structuredDocumentVocabulary` by reference. They are exported — several of
 * them stopped being module-private for exactly this — because the alternative
 * is the descriptor carrying its own copy of a number, which is the h4 defect
 * again with a different pair of files: an agent reads a limit that nothing
 * checks against, writes to it, and is refused by a validator holding the real
 * one. A published bound that is not the enforced bound is worse than an
 * unpublished one.
 */
export const MAX_STRUCTURED_DOCUMENT_BYTES = 512 * 1024;
export const MAX_DOCUMENT_NODES = 20_000;
export const MAX_URL_LENGTH = 2_048;
export const MAX_MARKS_PER_TEXT_NODE = 8;
export const MAX_CODE_BLOCK_LANGUAGE_LENGTH = 80;
export const MAX_ORDERED_LIST_START = 100_000;
/** The schemes a link mark may point at; anything else is refused. */
export const STRUCTURED_DOCUMENT_LINK_PROTOCOLS = [
  "http:",
  "https:",
  "mailto:",
] as const;

/**
 * What a node NEWER than the declared version is refused with. Named because
 * the descriptor tells an agent which refusal its own `schemaVersion` will
 * produce, and a refusal code the agent cannot match against the one it
 * receives teaches nothing.
 */
export const STRUCTURED_DOCUMENT_VERSION_TOO_OLD =
  "DOCUMENT_STRUCTURED_SCHEMA_VERSION_TOO_OLD";

/**
 * The document's node vocabulary, CLOSED.
 *
 * Until Wave D `StructuredDocumentNode.type` was `string`, and the twenty
 * places in this repository that branch on a node kind were all keyed by a
 * string: adding a kind was a change no compiler could see. The worst of them
 * was not the one that threw — it was `richNodeText`, which turned a kind it
 * did not know into ONE concatenated token in the search index, so the note
 * saved, the index rebuilt, and the note quietly stopped being findable.
 *
 * The order matters twice: `doc` must come first, because `new Schema` takes
 * the first entry as the top node; and this array is the single source the
 * total `Record` below is keyed by, so a kind added here fails the build in
 * every place that must classify it.
 */
export const STRUCTURED_DOCUMENT_NODE_KINDS = [
  "doc",
  "paragraph",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "heading",
  "horizontalRule",
  "hardBreak",
  "text",
  "entityReference",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
] as const;

/** The longest alternative text an image may carry. */
export const MAX_IMAGE_ALT_LENGTH = 500;

export type StructuredDocumentNodeKind =
  (typeof STRUCTURED_DOCUMENT_NODE_KINDS)[number];

/** The inline marks, closed for the same reason and by the same mechanism. */
export const STRUCTURED_DOCUMENT_MARK_KINDS = [
  "bold",
  "italic",
  "strike",
  "underline",
  "code",
  "link",
] as const;

export type StructuredDocumentMarkKind =
  (typeof STRUCTURED_DOCUMENT_MARK_KINDS)[number];

export interface StructuredDocumentMark {
  readonly type: StructuredDocumentMarkKind;
  readonly attrs?: Readonly<Record<string, string | null>>;
}

export interface StructuredDocumentNode {
  readonly type: StructuredDocumentNodeKind;
  readonly attrs?: Readonly<Record<string, string | number | null>>;
  readonly content?: readonly StructuredDocumentNode[];
  readonly marks?: readonly StructuredDocumentMark[];
  readonly text?: string;
}

export interface StructuredDocument {
  readonly schemaVersion: typeof STRUCTURED_DOCUMENT_SCHEMA_VERSION;
  readonly type: "doc";
  readonly content: readonly StructuredDocumentNode[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Which slot of a parent a kind fills. `root` is `doc` alone: it is the only
 * kind that is never anybody's child, which is why a nested `doc` is refused
 * everywhere without a rule saying so.
 */
export type StructuredDocumentNodeGroup =
  "root" | "block" | "inline" | "listItem" | "tableRow" | "tableCell";

/**
 * What a kind admits as children. The three shared with the group vocabulary
 * mean "any kind in that group" — `listItem` is its own group precisely so that
 * `block` can mean "block, and NOT a list item" without restating the
 * exception at each of the four places that used to carry it.
 */
type ContentModel =
  "none" | "text" | Exclude<StructuredDocumentNodeGroup, "root">;

interface StructuredDocumentNodeRule {
  readonly spec: NodeSpec;
  readonly group: StructuredDocumentNodeGroup;
  readonly content: ContentModel;
  /**
   * The oldest schema version that may DECLARE this kind. It is what makes
   * the version number mean something instead of decorate a request: a write
   * that says `schemaVersion: 1` and carries an image is refused, so an agent
   * cannot put content into a document that a reader pinned to 1 would have
   * to invent a rendering for.
   *
   * It is not a read gate. A stored document is read at the version this
   * build writes, because every older node set is a subset of the current one.
   */
  readonly introducedIn: ReadableStructuredDocumentSchemaVersion;
  /** May it appear with no `content` key, and with an empty one. */
  readonly childlessAllowed: boolean;
  /** The kind the first child must be, when it has children. */
  readonly firstChild?: StructuredDocumentNodeKind;
  /**
   * What a violation of THIS kind's own shape is reported as. Only
   * `entityReference` names itself; every other kind reports the generic
   * schema error, and that split is the shipped contract, not an accident.
   */
  readonly invalidError: string;
  readonly assertAttrs: (attrs: unknown) => void;
  /**
   * The visible text of one node, given the already-extracted text of its
   * children and an accessor for its attributes. It lives HERE, beside the
   * schema it walks, rather than in the Yjs adapter where it used to live —
   * two files is exactly how the two drifted.
   */
  readonly text: (
    children: readonly string[],
    attribute: (name: string) => string | undefined,
  ) => string;
}

const schemaInvalid = (): never => {
  throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
};

const noAttrs = (attrs: unknown): void => {
  if (attrs !== undefined) schemaInvalid();
};

const joined = (children: readonly string[]): string => children.join("");
const lines = (children: readonly string[]): string => children.join("\n");
const empty = (): string => "";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const entityKinds = new Set<DocumentEntityReferenceKind>(
  DOCUMENT_ENTITY_REFERENCE_KINDS,
);

const exactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): void => {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
};

/**
 * The attribute sets, declared ONCE per kind and used three times over: as the
 * ProseMirror `NodeSpec.attrs` the canonicalising round trip is built from, as
 * the allow-list `exactKeys` refuses an unknown key against, and as the names
 * `structuredDocumentVocabulary` publishes. They used to be a spec object and
 * a hand-written array sitting some two hundred lines apart, which is the
 * "manual list beside a closed dictionary" shape this repository keeps
 * meeting: renaming an attribute in the spec left the validator refusing the
 * new name and accepting the old.
 */
const headingAttrs = { level: { default: 1 } };
const orderedListAttrs = { start: { default: 1 }, type: { default: null } };
const codeBlockAttrs = { language: { default: null } };
const imageAttrs = { sourceId: { default: null }, alt: { default: "" } };
const entityReferenceAttrs = {
  targetKind: { default: null },
  targetId: { default: null },
};
const linkAttrs = {
  href: { default: null },
  target: { default: "_blank" },
  rel: { default: "noopener noreferrer nofollow" },
  class: { default: null },
  title: { default: null },
};

const assertHeadingAttrs = (attrs: unknown): void => {
  if (!isRecord(attrs)) schemaInvalid();
  else {
    exactKeys(attrs, Object.keys(headingAttrs));
    if (
      !(STRUCTURED_DOCUMENT_HEADING_LEVELS as readonly number[]).includes(
        Number(attrs.level),
      )
    )
      schemaInvalid();
  }
};

const assertOrderedListAttrs = (attrs: unknown): void => {
  if (attrs === undefined) return;
  if (!isRecord(attrs)) return schemaInvalid();
  exactKeys(attrs, Object.keys(orderedListAttrs));
  if (
    !Number.isInteger(attrs.start ?? 1) ||
    Number(attrs.start ?? 1) < 1 ||
    Number(attrs.start ?? 1) > MAX_ORDERED_LIST_START
  )
    schemaInvalid();
  if (
    attrs.type !== undefined &&
    attrs.type !== null &&
    typeof attrs.type !== "string"
  )
    schemaInvalid();
};

const assertCodeBlockAttrs = (attrs: unknown): void => {
  if (attrs === undefined) return;
  if (!isRecord(attrs)) return schemaInvalid();
  exactKeys(attrs, Object.keys(codeBlockAttrs));
  if (
    attrs.language !== null &&
    attrs.language !== undefined &&
    (typeof attrs.language !== "string" ||
      attrs.language.length > MAX_CODE_BLOCK_LANGUAGE_LENGTH)
  )
    schemaInvalid();
};

/**
 * An image stores the IDENTITY of an attachment already in this workspace and
 * never a URL — the same deliberate design as `entityReference`: store what a
 * thing is, resolve how it looks at render time. A URL in the node would put
 * bytes (or an unauthorized reference to them) inside the CRDT, past
 * `MAX_STRUCTURED_DOCUMENT_BYTES` immediately for the first, and outside the
 * attachment's own authorization for the second.
 *
 * `alt` is required and may be empty. Empty means decorative, which is a
 * statement; absent would mean nobody was ever asked.
 */
const assertImageAttrs = (attrs: unknown): void => {
  if (!isRecord(attrs)) return schemaInvalid();
  exactKeys(attrs, Object.keys(imageAttrs));
  if (typeof attrs.sourceId !== "string" || !uuid.test(attrs.sourceId))
    schemaInvalid();
  if (typeof attrs.alt !== "string" || attrs.alt.length > MAX_IMAGE_ALT_LENGTH)
    schemaInvalid();
};

const assertEntityReferenceAttrs = (attrs: unknown): void => {
  if (!isRecord(attrs)) throw new Error("DOCUMENT_ENTITY_REFERENCE_INVALID");
  exactKeys(attrs, Object.keys(entityReferenceAttrs));
  if (
    typeof attrs.targetKind !== "string" ||
    !entityKinds.has(attrs.targetKind as DocumentEntityReferenceKind) ||
    typeof attrs.targetId !== "string" ||
    !uuid.test(attrs.targetId)
  )
    throw new Error("DOCUMENT_ENTITY_REFERENCE_INVALID");
};

/**
 * THE total record. Adding a member to `STRUCTURED_DOCUMENT_NODE_KINDS`
 * without classifying it here does not compile — which is the whole point of
 * the vocabulary being closed, and the only guard in this file that needs no
 * test to work.
 */
const nodeRules: Record<
  StructuredDocumentNodeKind,
  StructuredDocumentNodeRule
> = {
  doc: {
    spec: { content: "block+" },
    group: "root",
    content: "block",
    introducedIn: 1,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: lines,
  },
  paragraph: {
    spec: { content: "inline*", group: "block" },
    group: "block",
    content: "inline",
    introducedIn: 1,
    childlessAllowed: true,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: joined,
  },
  blockquote: {
    spec: { content: "block+", group: "block" },
    group: "block",
    content: "block",
    introducedIn: 1,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: joined,
  },
  bulletList: {
    spec: { content: "listItem+", group: "block" },
    group: "block",
    content: "listItem",
    introducedIn: 1,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: lines,
  },
  orderedList: {
    spec: {
      content: "listItem+",
      group: "block",
      attrs: orderedListAttrs,
    },
    group: "block",
    content: "listItem",
    introducedIn: 1,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: assertOrderedListAttrs,
    text: lines,
  },
  listItem: {
    spec: { content: "paragraph block*" },
    group: "listItem",
    content: "block",
    introducedIn: 1,
    childlessAllowed: false,
    firstChild: "paragraph",
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: lines,
  },
  codeBlock: {
    spec: {
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      attrs: codeBlockAttrs,
    },
    group: "block",
    content: "text",
    introducedIn: 1,
    childlessAllowed: true,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: assertCodeBlockAttrs,
    text: joined,
  },
  heading: {
    spec: {
      content: "inline*",
      group: "block",
      defining: true,
      attrs: headingAttrs,
    },
    group: "block",
    content: "inline",
    introducedIn: 1,
    childlessAllowed: true,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: assertHeadingAttrs,
    text: joined,
  },
  horizontalRule: {
    spec: { group: "block" },
    group: "block",
    content: "none",
    introducedIn: 1,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: empty,
  },
  hardBreak: {
    spec: { inline: true, group: "inline", selectable: false },
    group: "inline",
    content: "none",
    introducedIn: 1,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: () => "\n",
  },
  text: {
    spec: { group: "inline" },
    group: "inline",
    content: "none",
    introducedIn: 1,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    // Never consulted: a text node's characters are read off the node itself,
    // by both readers, before any rule is looked up.
    text: empty,
  },
  entityReference: {
    spec: {
      inline: true,
      group: "inline",
      atom: true,
      selectable: true,
      attrs: entityReferenceAttrs,
    },
    group: "inline",
    content: "none",
    introducedIn: 1,
    childlessAllowed: false,
    invalidError: "DOCUMENT_ENTITY_REFERENCE_INVALID",
    assertAttrs: assertEntityReferenceAttrs,
    // The label is resolved at render time from the target's current name and
    // is deliberately not stored, so there is nothing here to contribute.
    text: empty,
  },
  image: {
    spec: {
      group: "block",
      atom: true,
      selectable: true,
      draggable: true,
      attrs: imageAttrs,
    },
    group: "block",
    content: "none",
    introducedIn: 2,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: assertImageAttrs,
    // The alternative text IS the image's contribution to search. It is the
    // only thing about the picture that is words, and dropping it is how an
    // image becomes a hole in the index of the note that holds it.
    text: (_children, attribute) => attribute("alt") ?? "",
  },
  table: {
    spec: { content: "tableRow+", group: "block", isolating: true },
    group: "block",
    content: "tableRow",
    introducedIn: 2,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: lines,
  },
  tableRow: {
    spec: { content: "(tableCell | tableHeader)+" },
    group: "tableRow",
    content: "tableCell",
    introducedIn: 2,
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    // A TAB between cells and a newline between rows. The separator is the
    // whole point: joined tightly — which is what a kind with no rule used to
    // get — a row of `Budget`, `Anna`, `Deadline` indexes as
    // `BudgetAnnaDeadline` and none of the three words is findable again.
    text: (children) => children.join("\t"),
  },
  tableCell: {
    spec: { content: "paragraph block*", isolating: true },
    group: "tableCell",
    content: "block",
    introducedIn: 2,
    childlessAllowed: false,
    firstChild: "paragraph",
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: (children) => children.join(" "),
  },
  tableHeader: {
    spec: { content: "paragraph block*", isolating: true },
    group: "tableCell",
    content: "block",
    introducedIn: 2,
    childlessAllowed: false,
    firstChild: "paragraph",
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: (children) => children.join(" "),
  },
};

interface StructuredDocumentMarkRule {
  readonly spec: MarkSpec;
  readonly assertAttrs: (attrs: unknown) => void;
}

const assertLink = (attrs: unknown): void => {
  if (!isRecord(attrs)) throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  exactKeys(attrs, Object.keys(linkAttrs));
  const href = attrs.href;
  if (typeof href !== "string" || href.length > MAX_URL_LENGTH)
    throw new Error("DOCUMENT_STRUCTURED_LINK_INVALID");
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    throw new Error("DOCUMENT_STRUCTURED_LINK_INVALID");
  }
  if (
    !(STRUCTURED_DOCUMENT_LINK_PROTOCOLS as readonly string[]).includes(
      parsed.protocol,
    )
  )
    throw new Error("DOCUMENT_STRUCTURED_LINK_INVALID");
  for (const key of ["target", "rel", "class", "title"] as const) {
    const current = attrs[key];
    if (
      current !== undefined &&
      current !== null &&
      typeof current !== "string"
    )
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  }
};

const bareMarkAttrs = (attrs: unknown): void => {
  if (
    attrs !== undefined &&
    (!isRecord(attrs) || Object.keys(attrs).length > 0)
  )
    schemaInvalid();
};

const markRules: Record<
  StructuredDocumentMarkKind,
  StructuredDocumentMarkRule
> = {
  bold: { spec: {}, assertAttrs: bareMarkAttrs },
  italic: { spec: {}, assertAttrs: bareMarkAttrs },
  strike: { spec: {}, assertAttrs: bareMarkAttrs },
  underline: { spec: {}, assertAttrs: bareMarkAttrs },
  code: { spec: { code: true, excludes: "_" }, assertAttrs: bareMarkAttrs },
  link: {
    spec: { inclusive: false, attrs: linkAttrs },
    assertAttrs: assertLink,
  },
};

const isNodeKind = (value: unknown): value is StructuredDocumentNodeKind =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(nodeRules, value);

const isMarkKind = (value: unknown): value is StructuredDocumentMarkKind =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(markRules, value);

const admits = (
  model: ContentModel,
  kind: StructuredDocumentNodeKind,
): boolean => {
  if (model === "none") return false;
  if (model === "text") return kind === "text";
  return nodeRules[kind].group === model;
};

/**
 * The visible text of one node, for the search index and for export.
 *
 * A kind this build does not know joins its children with a NEWLINE rather
 * than tightly. That case is unreachable through our own editors — both
 * schemas are closed — but a document written by a newer build can carry one,
 * and the failure mode being guarded is precisely the tight join: it welded a
 * table's cells into `BudgetAnnaDeadlinePiotr`, one unsearchable token, with
 * nothing failing anywhere.
 */
export const structuredDocumentNodeText = (
  kind: string,
  children: readonly string[],
  attribute: (name: string) => string | undefined,
): string =>
  isNodeKind(kind)
    ? nodeRules[kind].text(children, attribute)
    : children.join("\n");

const nodes = Object.fromEntries(
  STRUCTURED_DOCUMENT_NODE_KINDS.map((kind) => [kind, nodeRules[kind].spec]),
) as Record<StructuredDocumentNodeKind, NodeSpec>;

const marks = Object.fromEntries(
  STRUCTURED_DOCUMENT_MARK_KINDS.map((kind) => [kind, markRules[kind].spec]),
) as Record<StructuredDocumentMarkKind, MarkSpec>;

export const structuredDocumentSchema = new Schema({ nodes, marks });

export interface StructuredDocumentNodeDescriptor {
  readonly kind: StructuredDocumentNodeKind;
  readonly group: StructuredDocumentNodeGroup;
  /** The kinds this one admits as children, already narrowed to the version. */
  readonly mayContain: readonly StructuredDocumentNodeKind[];
  readonly mayBeEmpty: boolean;
  readonly firstChildMustBe?: StructuredDocumentNodeKind;
  readonly attributes: readonly string[];
  readonly attributesRequired: boolean;
  readonly introducedIn: ReadableStructuredDocumentSchemaVersion;
  /** The error a node of this kind is refused with when its shape is wrong. */
  readonly refusalCode: string;
}

export interface StructuredDocumentMarkDescriptor {
  readonly kind: StructuredDocumentMarkKind;
  readonly attributes: readonly string[];
}

export interface StructuredDocumentVocabulary {
  readonly schemaVersion: ReadableStructuredDocumentSchemaVersion;
  readonly readableSchemaVersions: readonly ReadableStructuredDocumentSchemaVersion[];
  readonly writesSchemaVersion: typeof STRUCTURED_DOCUMENT_SCHEMA_VERSION;
  readonly root: "doc";
  readonly nodes: readonly StructuredDocumentNodeDescriptor[];
  readonly marks: readonly StructuredDocumentMarkDescriptor[];
  readonly headingLevels: readonly number[];
  readonly entityReferenceKinds: readonly DocumentEntityReferenceKind[];
  readonly linkProtocols: readonly string[];
  readonly limits: Readonly<Record<string, number>>;
  readonly guidance: readonly string[];
}

/**
 * Whether a kind may omit `attrs` entirely — ASKED of the validator rather than
 * restated beside it. `assertAttrs` is the function that will judge the write,
 * so a rule that starts requiring attributes changes this answer by itself.
 *
 * It reads as wrong for `heading` and it is not: the spec defaults `level` to 1,
 * so ProseMirror would canonicalise a heading without attributes — but
 * `assertNodes` calls `assertAttrs` unconditionally and the heading check
 * demands a record, so the write is refused before the schema ever sees it.
 * Publishing the spec's answer instead of the validator's would tell an agent
 * to omit a field that gets its document rejected.
 */
const attributesRequired = (rule: StructuredDocumentNodeRule): boolean => {
  try {
    rule.assertAttrs(undefined);
    return false;
  } catch {
    return true;
  }
};

/**
 * The document vocabulary, MACHINE-READABLE, as of one declared schema version.
 *
 * Everything an agent may put in a note lives in this file and nowhere on the
 * MCP surface: the operations catalog covers commands and queries, and document
 * content is neither. So the newest thing the product learned to hold — an
 * image, a table — was discoverable only by reading somebody else's note that
 * already contained one, and a malformed write came back refused without ever
 * naming what would have been legal.
 *
 * Every field is DERIVED: the kinds from the closed dictionaries, the nesting
 * from `admits` — the same predicate `assertNodes` refuses with — the attribute
 * names from the specs the ProseMirror schema is built from, the bounds from
 * the constants the parser compares against. A hand-written copy would be the
 * defect it is meant to close: a list that drifts in silence, and that an agent
 * trusts precisely because it is published.
 *
 * It is keyed by version because the answer differs by version: `introducedIn`
 * refuses a kind newer than the version the caller declares, so the honest
 * answer to "what may I write" needs to know what the caller will declare.
 */
export const structuredDocumentVocabulary = (
  schemaVersion: ReadableStructuredDocumentSchemaVersion,
): StructuredDocumentVocabulary => {
  const legal = (kind: StructuredDocumentNodeKind): boolean =>
    nodeRules[kind].introducedIn <= schemaVersion;
  return {
    schemaVersion,
    readableSchemaVersions: [...READABLE_STRUCTURED_DOCUMENT_SCHEMA_VERSIONS],
    writesSchemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    root: "doc",
    nodes: STRUCTURED_DOCUMENT_NODE_KINDS.filter(legal).map((kind) => {
      const rule = nodeRules[kind];
      return {
        kind,
        group: rule.group,
        mayContain: STRUCTURED_DOCUMENT_NODE_KINDS.filter(
          (candidate) => admits(rule.content, candidate) && legal(candidate),
        ),
        mayBeEmpty: rule.childlessAllowed,
        ...(rule.firstChild === undefined
          ? {}
          : { firstChildMustBe: rule.firstChild }),
        attributes: Object.keys(rule.spec.attrs ?? {}),
        attributesRequired: attributesRequired(rule),
        introducedIn: rule.introducedIn,
        refusalCode: rule.invalidError,
      };
    }),
    // Marks carry no `introducedIn` and are not filtered here: `assertMarks`
    // enforces no version rule over them, and describing one would publish a
    // restriction the parser does not apply.
    marks: STRUCTURED_DOCUMENT_MARK_KINDS.map((kind) => ({
      kind,
      attributes: Object.keys(markRules[kind].spec.attrs ?? {}),
    })),
    headingLevels: [...STRUCTURED_DOCUMENT_HEADING_LEVELS],
    entityReferenceKinds: [...DOCUMENT_ENTITY_REFERENCE_KINDS],
    linkProtocols: [...STRUCTURED_DOCUMENT_LINK_PROTOCOLS],
    limits: {
      documentBytes: MAX_STRUCTURED_DOCUMENT_BYTES,
      nodes: MAX_DOCUMENT_NODES,
      textLength: MAX_DOCUMENT_TEXT_LENGTH,
      imageAltLength: MAX_IMAGE_ALT_LENGTH,
      linkHrefLength: MAX_URL_LENGTH,
      marksPerTextNode: MAX_MARKS_PER_TEXT_NODE,
      codeBlockLanguageLength: MAX_CODE_BLOCK_LANGUAGE_LENGTH,
      orderedListStart: MAX_ORDERED_LIST_START,
    },
    // The handful of rules that are branches in the parser rather than entries
    // in a dictionary, so there is no constant to point at. Kept to what a
    // write is actually refused for; anything longer becomes prose that rots.
    guidance: [
      'The body is { "schemaVersion", "type": "doc", "content": [...] } and content may not be empty. A node is { "type", and optionally "attrs", "content", "marks", "text" } — any other key is refused.',
      "Only a text node carries `text` (never empty) and only a text node carries `marks`; either on any other kind is refused.",
      `A kind whose introducedIn exceeds the schemaVersion you declare is refused with ${STRUCTURED_DOCUMENT_VERSION_TOO_OLD}, so declare the highest version you can read rather than the oldest.`,
      "An attrs object is exact: every attribute listed for the kind is checked and an unlisted key is refused. An image stores sourceId, the id of an attachment already in this workspace, never a URL; alt is required and may be empty, which means decorative.",
    ],
  };
};

const assertMarks = (value: unknown): void => {
  if (!Array.isArray(value) || value.length > MAX_MARKS_PER_TEXT_NODE)
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  const seen = new Set<string>();
  for (const mark of value) {
    if (!isRecord(mark)) throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    exactKeys(mark, ["type", "attrs"]);
    if (!isMarkKind(mark.type) || seen.has(mark.type))
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    seen.add(mark.type);
    markRules[mark.type].assertAttrs(mark.attrs);
  }
};

const assertNodes = (
  value: unknown,
  parent: StructuredDocumentNodeKind,
  declaredVersion: ReadableStructuredDocumentSchemaVersion,
  count: { value: number },
  textLength: { value: number },
): void => {
  if (!Array.isArray(value))
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  const parentContent = nodeRules[parent].content;
  for (const node of value) {
    count.value += 1;
    if (count.value > MAX_DOCUMENT_NODES || !isRecord(node))
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    exactKeys(node, ["type", "attrs", "content", "marks", "text"]);
    // A kind outside the closed vocabulary is refused HERE, by name, rather
    // than falling through the parent checks into whichever branch happened
    // to catch it. Admission into the parent stays the generic schema error
    // even for a kind that names its own violations: what went wrong is the
    // placement, not the node.
    if (!isNodeKind(node.type) || !admits(parentContent, node.type))
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    const rule = nodeRules[node.type];
    if (rule.introducedIn > declaredVersion)
      throw new Error(STRUCTURED_DOCUMENT_VERSION_TOO_OLD);

    if (node.type === "text") {
      if (
        typeof node.text !== "string" ||
        node.text.length < 1 ||
        node.content !== undefined ||
        node.attrs !== undefined
      )
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
      textLength.value += node.text.length;
      if (textLength.value > MAX_DOCUMENT_TEXT_LENGTH)
        throw new Error("DOCUMENT_TEXT_SIZE_INVALID");
      if (node.marks !== undefined) assertMarks(node.marks);
      continue;
    }
    if (node.text !== undefined || node.marks !== undefined)
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    rule.assertAttrs(node.attrs);

    if (rule.content === "none") {
      if (node.content !== undefined) throw new Error(rule.invalidError);
      continue;
    }
    if (node.content === undefined) {
      if (!rule.childlessAllowed) throw new Error(rule.invalidError);
      continue;
    }
    if (!Array.isArray(node.content)) throw new Error(rule.invalidError);
    const content = node.content;
    assertNodes(content, node.type, declaredVersion, count, textLength);
    if (content.length === 0 && !rule.childlessAllowed)
      throw new Error(rule.invalidError);
    if (
      rule.firstChild !== undefined &&
      (!isRecord(content[0]) || content[0].type !== rule.firstChild)
    )
      throw new Error(rule.invalidError);
  }
};

export const parseStructuredDocument = (value: unknown): StructuredDocument => {
  if (!isRecord(value)) throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  exactKeys(value, ["schemaVersion", "type", "content"]);
  // THE enforcement point. The MCP boundary is the visible one, but this is
  // the one every path goes through — the agent read, the idempotency digest,
  // the restore comparison and the renderer's own round trip. A version
  // widened at the boundary and left as a `!==` here refuses the request one
  // layer deeper, with a generic error naming nothing.
  const declaredVersion = READABLE_STRUCTURED_DOCUMENT_SCHEMA_VERSIONS.find(
    (version) => version === value.schemaVersion,
  );
  if (declaredVersion === undefined || value.type !== "doc")
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  if (encoded.byteLength > MAX_STRUCTURED_DOCUMENT_BYTES)
    throw new Error("DOCUMENT_STRUCTURED_SIZE_INVALID");
  if (!Array.isArray(value.content) || value.content.length < 1)
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  assertNodes(
    value.content,
    "doc",
    declaredVersion,
    { value: 0 },
    { value: 0 },
  );
  const canonical = structuredDocumentSchema
    .nodeFromJSON({ type: "doc", content: value.content })
    .toJSON() as {
    readonly type: "doc";
    readonly content: readonly StructuredDocumentNode[];
  };
  return {
    schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    type: "doc",
    content: canonical.content,
  };
};

export const structuredDocumentEntityReferences = (
  value: unknown,
): readonly {
  readonly targetKind: DocumentEntityReferenceKind;
  readonly targetId: string;
}[] => {
  const document = parseStructuredDocument(value);
  const references = new Map<
    string,
    {
      readonly targetKind: DocumentEntityReferenceKind;
      readonly targetId: string;
    }
  >();
  const visit = (node: StructuredDocumentNode): void => {
    if (node.type === "entityReference" && node.attrs !== undefined) {
      const targetKind = node.attrs.targetKind as DocumentEntityReferenceKind;
      const targetId = String(node.attrs.targetId);
      references.set(`${targetKind}:${targetId}`, { targetKind, targetId });
    }
    node.content?.forEach(visit);
  };
  document.content.forEach(visit);
  return [...references.values()].sort(
    (left, right) =>
      left.targetKind.localeCompare(right.targetKind) ||
      left.targetId.localeCompare(right.targetId),
  );
};

export const structuredDocumentFromYjs = (
  document: Y.Doc,
): StructuredDocument =>
  parseStructuredDocument({
    schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    ...yXmlFragmentToProsemirrorJSON(
      document.getXmlFragment(RICH_DOCUMENT_FRAGMENT_ROOT),
    ),
  });

export const replaceStructuredDocumentInYjs = (
  document: Y.Doc,
  value: unknown,
  origin: unknown,
): StructuredDocument => {
  const parsed = parseStructuredDocument(value);
  document.transact(() => {
    prosemirrorJSONToYXmlFragment(
      structuredDocumentSchema,
      { type: "doc", content: parsed.content },
      document.getXmlFragment(RICH_DOCUMENT_FRAGMENT_ROOT),
    );
  }, origin);
  return parsed;
};
