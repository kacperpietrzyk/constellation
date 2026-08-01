import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_IMAGE_ALT_LENGTH,
  STRUCTURED_DOCUMENT_NODE_KINDS,
  STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  YjsRealtimeDocumentAdapter,
  parseStructuredDocument,
} from "../src/index.js";

const uuid = (suffix: string): string =>
  `c0000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const origin = { kind: "human", principalId: "kacper" } as const;

// ProseMirror hands attributes back on null-prototype objects; JSON is what
// every consumer of this content actually sees.
const plain = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value)) as unknown;

const document = (content: readonly unknown[]) => ({
  schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  type: "doc",
  content,
});

const cell = (kind: "tableCell" | "tableHeader", text: string) => ({
  type: kind,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const table = {
  type: "table",
  content: [
    {
      type: "tableRow",
      content: [cell("tableHeader", "Budget"), cell("tableHeader", "Owner")],
    },
    {
      type: "tableRow",
      content: [cell("tableCell", "Deadline"), cell("tableCell", "Piotr")],
    },
  ],
};

const image = {
  type: "image",
  attrs: { sourceId: uuid("1"), alt: "The whiteboard after the workshop" },
};

/** A rich body holding the two kinds, read back through the Yjs document. */
const roundTrip = <T>(
  content: readonly unknown[],
  read: (adapter: YjsRealtimeDocumentAdapter) => T,
): T => {
  const adapter = new YjsRealtimeDocumentAdapter();
  try {
    adapter.migrateToRich("a".repeat(64), origin);
    adapter.replaceStructuredContent(document(content), origin);
    return read(adapter);
  } finally {
    adapter.destroy();
  }
};

describe("image and table nodes", () => {
  it("carries both kinds in the closed vocabulary", () => {
    for (const kind of [
      "image",
      "table",
      "tableRow",
      "tableCell",
      "tableHeader",
    ] as const) {
      assert.ok(
        (STRUCTURED_DOCUMENT_NODE_KINDS as readonly string[]).includes(kind),
        `${kind} is missing from the vocabulary the total record is keyed by.`,
      );
    }
  });

  it("round-trips a table through the Yjs document unchanged", () => {
    // The agent path is `table`'s only producer after this lot — there is no
    // human affordance for one, on purpose — so "a table works" has to be a
    // demonstrated claim rather than an inference from the schema accepting
    // one. This is a write through the same adapter an agent's write uses.
    const read = roundTrip([table], (adapter) =>
      adapter.getStructuredContent(),
    );
    assert.deepEqual(plain(read.content), [table]);
  });

  it("round-trips an image, keeping the identity and never a URL", () => {
    const read = roundTrip([{ type: "paragraph" }, image], (adapter) =>
      adapter.getStructuredContent(),
    );
    assert.deepEqual(plain(read.content[1]), image);
  });

  it("indexes a table as separate words, not one welded token", () => {
    // The defect this closes: everything the plain-text reader did not know
    // was joined tightly, so a table's cells became `BudgetOwnerDeadlinePiotr`
    // — one token, in the FTS index, with nothing failing anywhere. The note
    // saved, the index rebuilt, and four words stopped being findable.
    const text = roundTrip([table], (adapter) => adapter.getText());
    for (const word of ["Budget", "Owner", "Deadline", "Piotr"]) {
      assert.ok(
        new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`, "u").test(text),
        `"${word}" is not a separate token in ${JSON.stringify(text)}.`,
      );
    }
    assert.ok(
      !text.includes("BudgetOwner"),
      `The cells were welded together: ${JSON.stringify(text)}`,
    );
  });

  it("indexes an image by its alternative text", () => {
    const text = roundTrip([{ type: "paragraph" }, image], (adapter) =>
      adapter.getText(),
    );
    assert.ok(
      text.includes("The whiteboard after the workshop"),
      `The image's words never reached the index: ${JSON.stringify(text)}`,
    );
  });

  it("refuses an image that is not anchored to an attachment in this workspace", () => {
    for (const attrs of [
      undefined,
      {},
      { sourceId: uuid("1") },
      { alt: "no source" },
      { sourceId: "https://example.org/a.png", alt: "a url, not an identity" },
      { sourceId: uuid("1"), alt: "x".repeat(MAX_IMAGE_ALT_LENGTH + 1) },
      { sourceId: uuid("1"), alt: "ok", src: "https://example.org/a.png" },
    ]) {
      assert.throws(
        () => parseStructuredDocument(document([{ type: "image", attrs }])),
        /DOCUMENT_STRUCTURED_SCHEMA_INVALID/u,
        `These attrs must not be accepted: ${JSON.stringify(attrs)}`,
      );
    }
  });

  it("refuses a table whose shape a reader could not render", () => {
    for (const broken of [
      { type: "table" },
      { type: "table", content: [] },
      // A row directly under the document, or a cell directly under a table.
      { type: "tableRow", content: [cell("tableCell", "x")] },
      { type: "table", content: [cell("tableCell", "x")] },
      // A cell holding inline content with no paragraph around it.
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "text", text: "x" }] },
            ],
          },
        ],
      },
      // A row with nothing in it.
      {
        type: "table",
        content: [{ type: "tableRow", content: [] }],
      },
    ]) {
      assert.throws(
        () => parseStructuredDocument(document([broken])),
        /DOCUMENT_STRUCTURED_SCHEMA_INVALID/u,
        `This table shape must not be accepted: ${JSON.stringify(broken)}`,
      );
    }
  });

  it("lets a table and an image live where a block may live", () => {
    assert.doesNotThrow(() =>
      parseStructuredDocument(
        document([
          { type: "blockquote", content: [table] },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph" }, image],
              },
            ],
          },
        ]),
      ),
    );
  });
});
