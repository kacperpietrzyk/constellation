import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProsemirrorJSON,
} from "@tiptap/y-tiptap";
import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";
import type * as Y from "yjs";

import {
  MAX_DOCUMENT_TEXT_LENGTH,
  RICH_DOCUMENT_FRAGMENT_ROOT,
  type DocumentEntityReferenceKind,
} from "./yjs-document-adapter.js";

export const STRUCTURED_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const MAX_STRUCTURED_DOCUMENT_BYTES = 512 * 1024;
const MAX_DOCUMENT_NODES = 20_000;
const MAX_URL_LENGTH = 2_048;

export interface StructuredDocumentMark {
  readonly type: "bold" | "italic" | "strike" | "underline" | "code" | "link";
  readonly attrs?: Readonly<Record<string, string | null>>;
}

export interface StructuredDocumentNode {
  readonly type: string;
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

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },
  paragraph: { content: "inline*", group: "block" },
  blockquote: { content: "block+", group: "block" },
  bulletList: { content: "listItem+", group: "block" },
  orderedList: {
    content: "listItem+",
    group: "block",
    attrs: { start: { default: 1 }, type: { default: null } },
  },
  listItem: { content: "paragraph block*" },
  codeBlock: {
    content: "text*",
    marks: "",
    group: "block",
    code: true,
    defining: true,
    attrs: { language: { default: null } },
  },
  heading: {
    content: "inline*",
    group: "block",
    defining: true,
    attrs: { level: { default: 1 } },
  },
  horizontalRule: { group: "block" },
  hardBreak: { inline: true, group: "inline", selectable: false },
  text: { group: "inline" },
  entityReference: {
    inline: true,
    group: "inline",
    atom: true,
    selectable: true,
    attrs: { targetKind: { default: null }, targetId: { default: null } },
  },
};

const marks: Record<string, MarkSpec> = {
  link: {
    inclusive: false,
    attrs: {
      href: { default: null },
      target: { default: "_blank" },
      rel: { default: "noopener noreferrer nofollow" },
      class: { default: null },
      title: { default: null },
    },
  },
  bold: {},
  code: { code: true, excludes: "_" },
  italic: {},
  strike: {},
  underline: {},
};

export const structuredDocumentSchema = new Schema({ nodes, marks });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): void => {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const entityKinds = new Set<DocumentEntityReferenceKind>([
  "task",
  "project",
  "person",
  "organization",
  "meeting",
]);

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

const assertMarks = (value: unknown): void => {
  if (!Array.isArray(value) || value.length > 8)
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  const seen = new Set<string>();
  for (const mark of value) {
    if (!isRecord(mark)) throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    exactKeys(mark, ["type", "attrs"]);
    if (
      typeof mark.type !== "string" ||
      !["bold", "italic", "strike", "underline", "code", "link"].includes(
        mark.type,
      ) ||
      seen.has(mark.type)
    )
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    seen.add(mark.type);
    if (mark.type === "link") assertLink(mark.attrs);
    else if (
      mark.attrs !== undefined &&
      (!isRecord(mark.attrs) || Object.keys(mark.attrs).length > 0)
    )
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  }
};

const blockTypes = new Set([
  "paragraph",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "heading",
  "horizontalRule",
]);
const inlineTypes = new Set(["text", "hardBreak", "entityReference"]);

const assertNodes = (
  value: unknown,
  parent: string,
  count: { value: number },
  textLength: { value: number },
): void => {
  if (!Array.isArray(value))
    throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
  for (const node of value) {
    count.value += 1;
    if (count.value > MAX_DOCUMENT_NODES || !isRecord(node))
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    exactKeys(node, ["type", "attrs", "content", "marks", "text"]);
    if (typeof node.type !== "string")
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    const inlineParent = parent === "paragraph" || parent === "heading";
    const codeParent = parent === "codeBlock";
    if (parent === "doc" || parent === "blockquote") {
      if (!blockTypes.has(node.type) || node.type === "listItem")
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    } else if (parent === "bulletList" || parent === "orderedList") {
      if (node.type !== "listItem")
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    } else if (parent === "listItem") {
      if (!blockTypes.has(node.type) || node.type === "listItem")
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    } else if (codeParent) {
      if (node.type !== "text")
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    } else if (inlineParent && !inlineTypes.has(node.type)) {
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    }

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
    if (node.type === "entityReference") {
      if (!isRecord(node.attrs))
        throw new Error("DOCUMENT_ENTITY_REFERENCE_INVALID");
      exactKeys(node.attrs, ["targetKind", "targetId"]);
      if (
        typeof node.attrs.targetKind !== "string" ||
        !entityKinds.has(
          node.attrs.targetKind as DocumentEntityReferenceKind,
        ) ||
        typeof node.attrs.targetId !== "string" ||
        !uuid.test(node.attrs.targetId) ||
        node.content !== undefined
      )
        throw new Error("DOCUMENT_ENTITY_REFERENCE_INVALID");
      continue;
    }
    if (node.type === "hardBreak" || node.type === "horizontalRule") {
      if (node.attrs !== undefined || node.content !== undefined)
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
      continue;
    }
    if (node.type === "heading") {
      if (!isRecord(node.attrs))
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
      exactKeys(node.attrs, ["level"]);
      if (![1, 2, 3].includes(Number(node.attrs.level)))
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    } else if (node.type === "orderedList") {
      if (node.attrs !== undefined) {
        if (!isRecord(node.attrs))
          throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
        exactKeys(node.attrs, ["start", "type"]);
        if (
          !Number.isInteger(node.attrs.start ?? 1) ||
          Number(node.attrs.start ?? 1) < 1 ||
          Number(node.attrs.start ?? 1) > 100_000
        )
          throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
        if (
          node.attrs.type !== undefined &&
          node.attrs.type !== null &&
          typeof node.attrs.type !== "string"
        )
          throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
      }
    } else if (node.type === "codeBlock") {
      if (node.attrs !== undefined) {
        if (!isRecord(node.attrs))
          throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
        exactKeys(node.attrs, ["language"]);
        if (
          node.attrs.language !== null &&
          node.attrs.language !== undefined &&
          (typeof node.attrs.language !== "string" ||
            node.attrs.language.length > 80)
        )
          throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
      }
    } else if (node.attrs !== undefined) {
      throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    }
    if (node.content === undefined) {
      if (!["paragraph", "heading", "codeBlock"].includes(node.type))
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    } else {
      if (!Array.isArray(node.content))
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
      const content = node.content;
      assertNodes(content, node.type, count, textLength);
      if (
        content.length === 0 &&
        !["paragraph", "heading", "codeBlock"].includes(node.type)
      )
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
      if (
        node.type === "listItem" &&
        (!isRecord(content[0]) || content[0].type !== "paragraph")
      )
        throw new Error("DOCUMENT_STRUCTURED_SCHEMA_INVALID");
    }
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
