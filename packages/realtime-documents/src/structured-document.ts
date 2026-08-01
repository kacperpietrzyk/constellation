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

export const STRUCTURED_DOCUMENT_SCHEMA_VERSION = 1 as const;

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
export const MAX_STRUCTURED_DOCUMENT_BYTES = 512 * 1024;
const MAX_DOCUMENT_NODES = 20_000;
const MAX_URL_LENGTH = 2_048;

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
] as const;

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
type NodeGroup = "root" | "block" | "inline" | "listItem";

/**
 * What a kind admits as children. The three shared with `NodeGroup` mean
 * "any kind in that group" — `listItem` is its own group precisely so that
 * `block` can mean "block, and NOT a list item" without restating the
 * exception at each of the four places that used to carry it.
 */
type ContentModel = "none" | "text" | Exclude<NodeGroup, "root">;

interface StructuredDocumentNodeRule {
  readonly spec: NodeSpec;
  readonly group: NodeGroup;
  readonly content: ContentModel;
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

const assertHeadingAttrs = (attrs: unknown): void => {
  if (!isRecord(attrs)) schemaInvalid();
  else {
    exactKeys(attrs, ["level"]);
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
  exactKeys(attrs, ["start", "type"]);
  if (
    !Number.isInteger(attrs.start ?? 1) ||
    Number(attrs.start ?? 1) < 1 ||
    Number(attrs.start ?? 1) > 100_000
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
  exactKeys(attrs, ["language"]);
  if (
    attrs.language !== null &&
    attrs.language !== undefined &&
    (typeof attrs.language !== "string" || attrs.language.length > 80)
  )
    schemaInvalid();
};

const assertEntityReferenceAttrs = (attrs: unknown): void => {
  if (!isRecord(attrs)) throw new Error("DOCUMENT_ENTITY_REFERENCE_INVALID");
  exactKeys(attrs, ["targetKind", "targetId"]);
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
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: lines,
  },
  paragraph: {
    spec: { content: "inline*", group: "block" },
    group: "block",
    content: "inline",
    childlessAllowed: true,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: joined,
  },
  blockquote: {
    spec: { content: "block+", group: "block" },
    group: "block",
    content: "block",
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: joined,
  },
  bulletList: {
    spec: { content: "listItem+", group: "block" },
    group: "block",
    content: "listItem",
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: lines,
  },
  orderedList: {
    spec: {
      content: "listItem+",
      group: "block",
      attrs: { start: { default: 1 }, type: { default: null } },
    },
    group: "block",
    content: "listItem",
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: assertOrderedListAttrs,
    text: lines,
  },
  listItem: {
    spec: { content: "paragraph block*" },
    group: "listItem",
    content: "block",
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
      attrs: { language: { default: null } },
    },
    group: "block",
    content: "text",
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
      attrs: { level: { default: 1 } },
    },
    group: "block",
    content: "inline",
    childlessAllowed: true,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: assertHeadingAttrs,
    text: joined,
  },
  horizontalRule: {
    spec: { group: "block" },
    group: "block",
    content: "none",
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: empty,
  },
  hardBreak: {
    spec: { inline: true, group: "inline", selectable: false },
    group: "inline",
    content: "none",
    childlessAllowed: false,
    invalidError: "DOCUMENT_STRUCTURED_SCHEMA_INVALID",
    assertAttrs: noAttrs,
    text: () => "\n",
  },
  text: {
    spec: { group: "inline" },
    group: "inline",
    content: "none",
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
      attrs: { targetKind: { default: null }, targetId: { default: null } },
    },
    group: "inline",
    content: "none",
    childlessAllowed: false,
    invalidError: "DOCUMENT_ENTITY_REFERENCE_INVALID",
    assertAttrs: assertEntityReferenceAttrs,
    // The label is resolved at render time from the target's current name and
    // is deliberately not stored, so there is nothing here to contribute.
    text: empty,
  },
};

interface StructuredDocumentMarkRule {
  readonly spec: MarkSpec;
  readonly assertAttrs: (attrs: unknown) => void;
}

const assertLink = (attrs: unknown): void => {
  if (!isRecord(attrs)) throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  exactKeys(attrs, ["href", "target", "rel", "class", "title"]);
  const href = attrs.href;
  if (typeof href !== "string" || href.length > MAX_URL_LENGTH)
    throw new Error("DOCUMENT_STRUCTURED_LINK_INVALID");
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    throw new Error("DOCUMENT_STRUCTURED_LINK_INVALID");
  }
  if (!["http:", "https:", "mailto:"].includes(parsed.protocol))
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
    spec: {
      inclusive: false,
      attrs: {
        href: { default: null },
        target: { default: "_blank" },
        rel: { default: "noopener noreferrer nofollow" },
        class: { default: null },
        title: { default: null },
      },
    },
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

const assertMarks = (value: unknown): void => {
  if (!Array.isArray(value) || value.length > 8)
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
    assertNodes(content, node.type, count, textLength);
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
  if (
    value.schemaVersion !== STRUCTURED_DOCUMENT_SCHEMA_VERSION ||
    value.type !== "doc"
  )
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  if (encoded.byteLength > MAX_STRUCTURED_DOCUMENT_BYTES)
    throw new Error("DOCUMENT_STRUCTURED_SIZE_INVALID");
  if (!Array.isArray(value.content) || value.content.length < 1)
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  assertNodes(value.content, "doc", { value: 0 }, { value: 0 });
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
