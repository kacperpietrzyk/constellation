/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getSchema } from "@tiptap/core";
import {
  STRUCTURED_DOCUMENT_HEADING_LEVELS,
  STRUCTURED_DOCUMENT_MARK_KINDS,
  STRUCTURED_DOCUMENT_NODE_KINDS,
  STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  parseStructuredDocument,
  structuredDocumentSchema,
} from "@constellation/realtime-documents";

import { DOCUMENT_SCHEMA_EXTENSIONS } from "../src/document-editor-extensions.js";

/**
 * The editor's ProseMirror schema and the content validator's are DIFFERENT
 * OBJECTS IN DIFFERENT PACKAGES. A node the editor can produce but the
 * validator refuses is a save that fails after somebody has typed; a node the
 * validator accepts but the editor lacks is content that vanishes on open.
 *
 * That is not hypothetical. Until Wave D the editor offered six heading
 * levels — with `Mod-Alt-N` shortcuts — while the validator accepted three,
 * so a note with an h4 was permanently unreadable and unwritable to every
 * agent, with a generic error naming nothing, and it took a hand comparison
 * of the two schemas to find it. A name-only comparison would have missed it:
 * the node SETS already matched exactly. So this compares attributes too.
 *
 * It lives in the renderer for the same reason the heading assertion does:
 * tiptap is a dependency of THIS package and `@constellation/realtime-documents`
 * has no right to know about it.
 */

const editorSchema = getSchema(DOCUMENT_SCHEMA_EXTENSIONS);

const sorted = (value: Iterable<string>): readonly string[] =>
  [...value].sort();

/**
 * The attribute names a node accepts, with the default each carries. Sorted
 * and stringified so the comparison reads as one value per node rather than
 * as a nested diff nobody can parse in a CI log.
 */
const attributeShape = (spec: {
  readonly attrs?: Record<string, { readonly default?: unknown }>;
}): string =>
  sorted(Object.keys(spec.attrs ?? {}))
    .map((name) => `${name}=${JSON.stringify(spec.attrs?.[name]?.default)}`)
    .join(",");

describe("the editor schema and the content validator schema", () => {
  it("is measuring two real schemas", () => {
    // An empty measurement is an instrument failure, not a result. If either
    // schema ever came back with no nodes, every assertion below would pass
    // over nothing.
    assert.ok(
      Object.keys(editorSchema.nodes).length >=
        STRUCTURED_DOCUMENT_NODE_KINDS.length,
      "The editor schema came back with fewer nodes than the vocabulary has — it was not built.",
    );
    assert.ok(
      Object.keys(structuredDocumentSchema.nodes).length >=
        STRUCTURED_DOCUMENT_NODE_KINDS.length,
      "The validator schema came back empty.",
    );
  });

  it("carries exactly the same node kinds, in both directions", () => {
    assert.deepEqual(
      sorted(Object.keys(editorSchema.nodes)),
      sorted(STRUCTURED_DOCUMENT_NODE_KINDS),
    );
    assert.deepEqual(
      sorted(Object.keys(structuredDocumentSchema.nodes)),
      sorted(STRUCTURED_DOCUMENT_NODE_KINDS),
    );
  });

  it("carries exactly the same marks, in both directions", () => {
    assert.deepEqual(
      sorted(Object.keys(editorSchema.marks)),
      sorted(STRUCTURED_DOCUMENT_MARK_KINDS),
    );
    assert.deepEqual(
      sorted(Object.keys(structuredDocumentSchema.marks)),
      sorted(STRUCTURED_DOCUMENT_MARK_KINDS),
    );
  });

  it("agrees on the attributes of every shared node", () => {
    // The h4 defect lived HERE and nowhere else: the names matched, the
    // attribute did not.
    for (const kind of STRUCTURED_DOCUMENT_NODE_KINDS) {
      const editorNode = editorSchema.nodes[kind];
      const validatorNode = structuredDocumentSchema.nodes[kind];
      assert.ok(editorNode !== undefined, `The editor has no ${kind}.`);
      assert.ok(validatorNode !== undefined, `The validator has no ${kind}.`);
      assert.equal(
        attributeShape(editorNode.spec as never),
        attributeShape(validatorNode.spec as never),
        `The two schemas disagree about ${kind}'s attributes.`,
      );
    }
  });

  it("agrees on where every node may appear", () => {
    for (const kind of STRUCTURED_DOCUMENT_NODE_KINDS) {
      assert.equal(
        editorSchema.nodes[kind]?.spec.content ?? "",
        structuredDocumentSchema.nodes[kind]?.spec.content ?? "",
        `The two schemas disagree about what ${kind} may contain.`,
      );
    }
  });

  it("accepts, on BOTH sides, one document holding every kind", () => {
    // The structural comparisons above cannot see everything, and it is worth
    // being exact about what they miss: `heading.levels` is a tiptap
    // EXTENSION OPTION, not a node-spec attribute, so the h4 divergence would
    // NOT have shown up in the attribute comparison. What catches a
    // disagreement about accepted VALUES is running a document through both
    // sides — this, plus `document-heading-levels.test.ts`, which reads the
    // levels the heading extension is actually mounted with.
    const paragraph = (text: string) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const content = [
      // Every heading level the shared constant offers, derived rather than
      // listed: a level added to the constant must be exercised here without
      // anybody remembering to come back.
      ...STRUCTURED_DOCUMENT_HEADING_LEVELS.map((level) => ({
        type: "heading",
        attrs: { level },
        content: [{ type: "text", text: `Level ${String(level)}` }],
      })),
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "bold" },
          { type: "hardBreak" },
          {
            type: "entityReference",
            attrs: {
              targetKind: "document",
              targetId: "c0000000-0000-4000-8000-000000000001",
            },
          },
        ],
      },
      { type: "blockquote", content: [paragraph("quoted")] },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph("one")] }],
      },
      {
        type: "orderedList",
        attrs: { start: 1, type: null },
        content: [{ type: "listItem", content: [paragraph("two")] }],
      },
      {
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [{ type: "text", text: "x" }],
      },
      { type: "horizontalRule" },
      {
        type: "image",
        attrs: {
          sourceId: "c0000000-0000-4000-8000-000000000002",
          alt: "A whiteboard",
        },
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [paragraph("Budget")] },
              { type: "tableCell", content: [paragraph("Anna")] },
            ],
          },
        ],
      },
    ];

    // Every kind is exercised, checked rather than assumed — a fixture that
    // silently stopped covering one would make this pass over less than it
    // claims.
    const covered = new Set<string>();
    const walk = (node: {
      type: string;
      content?: readonly unknown[];
    }): void => {
      covered.add(node.type);
      for (const child of node.content ?? []) walk(child as never);
    };
    for (const node of content) walk(node as never);
    covered.add("doc");
    assert.deepEqual(
      sorted(covered),
      sorted(STRUCTURED_DOCUMENT_NODE_KINDS),
      "The fixture no longer holds every node kind, so this proves less than it says.",
    );

    assert.doesNotThrow(() =>
      parseStructuredDocument({
        schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
        type: "doc",
        content,
      }),
    );
    assert.doesNotThrow(() =>
      editorSchema.nodeFromJSON({ type: "doc", content }).check(),
    );
  });

  it("is the array both editors actually mount", () => {
    // Without this, either editor could go back to its own list with ONE
    // edit, and every assertion above would keep passing over a schema
    // nothing renders with.
    const root = ((): string => {
      let directory = path.dirname(fileURLToPath(import.meta.url));
      while (!existsSync(path.join(directory, "src", "RealApp.tsx"))) {
        const parent = path.dirname(directory);
        if (parent === directory)
          throw new Error("Could not locate the desktop-ui package root.");
        directory = parent;
      }
      return directory;
    })();
    for (const source of [
      path.join("src", "library", "KnowledgeEditor.tsx"),
      path.join("src", "ProjectRichBody.tsx"),
    ]) {
      const text = readFileSync(path.join(root, source), "utf8");
      assert.match(
        text,
        /extensions: \[\n(?:\s*\/\/[^\n]*\n)*\s*\.\.\.DOCUMENT_SCHEMA_EXTENSIONS,/u,
        `${source} no longer spreads the shared schema extensions.`,
      );
      assert.doesNotMatch(
        text,
        /StarterKit\.configure/u,
        `${source} configures StarterKit itself again — the two schemas can drift from here.`,
      );
    }
  });
});
