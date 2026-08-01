import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DOCUMENT_ENTITY_TARGET_KINDS } from "@constellation/contracts";
import {
  DOCUMENT_ENTITY_REFERENCE_KINDS,
  YjsRealtimeDocumentAdapter,
  parseStructuredDocument,
} from "@constellation/realtime-documents";

/**
 * `@constellation/realtime-documents` deliberately depends on nothing of ours,
 * so it cannot import the link vocabulary from `@constellation/contracts` the
 * way every other holder of it now does — it keeps its own array, and two of
 * its lists are built from that array. The renderer is the one package that can
 * see both, so this is where the two are held equal.
 *
 * The equality check alone would be weak: an array can agree with the contract
 * while the code that consumes it has drifted. So each assertion below runs the
 * vocabulary through the thing that actually uses it — the structured-document
 * validator and the Yjs reader — with `document`, the arm Wave D added.
 */
const uuid = (suffix: string): string =>
  `c0000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const richDocument = (targetKind: string, targetId: string) => ({
  schemaVersion: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "See " },
        { type: "entityReference", attrs: { targetKind, targetId } },
      ],
    },
  ],
});

describe("document entity link vocabulary across packages", () => {
  it("keeps the realtime-documents vocabulary equal to the contract's", () => {
    assert.deepEqual(
      [...DOCUMENT_ENTITY_REFERENCE_KINDS].sort(),
      [...DOCUMENT_ENTITY_TARGET_KINDS].sort(),
    );
  });

  it("validates an entity reference of every kind the contract declares", () => {
    for (const targetKind of DOCUMENT_ENTITY_TARGET_KINDS) {
      const parsed = parseStructuredDocument(
        richDocument(targetKind, uuid("1")),
      );
      const reference = parsed.content[0]?.content?.[1];
      assert.equal(
        reference?.attrs?.targetKind,
        targetKind,
        `The validator dropped a ${targetKind} reference.`,
      );
    }
  });

  it("refuses a kind the contract does not declare", () => {
    assert.throws(
      () => parseStructuredDocument(richDocument("folder", uuid("1"))),
      /DOCUMENT_ENTITY_REFERENCE_INVALID/u,
    );
  });

  it("reads a note-to-note reference back out of the Yjs document", () => {
    const adapter = new YjsRealtimeDocumentAdapter();
    const origin = { kind: "human", principalId: "kacper" } as const;
    adapter.migrateToRich("a".repeat(64), origin);
    adapter.replaceStructuredContent(
      richDocument("document", uuid("2")),
      origin,
    );
    assert.deepEqual(adapter.getEntityReferences(), [
      { targetKind: "document", targetId: uuid("2") },
    ]);
  });
});
