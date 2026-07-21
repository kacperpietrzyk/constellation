import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Y from "yjs";

import {
  DOCUMENT_FORMAT_METADATA_ROOT,
  LEGACY_DOCUMENT_TEXT_ROOT,
  MAX_DOCUMENT_UPDATE_BYTES,
  RICH_DOCUMENT_FRAGMENT_ROOT,
  YjsRealtimeDocumentAdapter,
} from "../src/index.js";

const legacyDigest = "a".repeat(64);

describe("replaceable Yjs realtime-document adapter", () => {
  it("converges simultaneous online and offline edits without silent loss", () => {
    const alice = new YjsRealtimeDocumentAdapter();
    alice.replaceText("Model odpowiedzialności", {
      kind: "human",
      principalId: "alice",
    });
    const seed = alice.encodeState();
    const bob = new YjsRealtimeDocumentAdapter(seed);
    const aliceUpdates: Uint8Array[] = [];
    const bobUpdates: Uint8Array[] = [];
    alice.onUpdate((update) => aliceUpdates.push(update));
    bob.onUpdate((update) => bobUpdates.push(update));

    alice.replaceText("Model odpowiedzialności\nZakres partnera", {
      kind: "human",
      principalId: "alice",
    });
    bob.replaceText("Model odpowiedzialności\nCzas reakcji P1", {
      kind: "human",
      principalId: "bob",
    });

    for (const update of aliceUpdates) bob.applyUpdate(update);
    for (const update of bobUpdates) alice.applyUpdate(update);

    assert.equal(alice.getText(), bob.getText());
    assert.match(alice.getText(), /Zakres partnera/u);
    assert.match(alice.getText(), /Czas reakcji P1/u);
    alice.destroy();
    bob.destroy();
  });

  it("restores a checkpoint as a new convergent update", () => {
    const alice = new YjsRealtimeDocumentAdapter();
    alice.replaceText("Review 1", { kind: "human", principalId: "alice" });
    const reviewOne = alice.checkpoint();
    const bob = new YjsRealtimeDocumentAdapter(alice.encodeState());
    const restoreUpdates: Uint8Array[] = [];
    alice.onUpdate((update) => restoreUpdates.push(update));

    alice.replaceText("Review 2", { kind: "human", principalId: "alice" });
    alice.restore(reviewOne, "revision-review-1");
    for (const update of restoreUpdates) bob.applyUpdate(update);

    assert.equal(alice.getText(), "Review 1");
    assert.equal(bob.getText(), "Review 1");
    assert.notDeepEqual(alice.encodeState(), reviewOne.state);
    alice.destroy();
    bob.destroy();
  });

  it("migrates legacy text to rich paragraphs exactly once", () => {
    const document = new YjsRealtimeDocumentAdapter();
    document.replaceText("Pierwszy akapit\n\nTrzeci akapit", {
      kind: "human",
      principalId: "alice",
    });
    const updates: Uint8Array[] = [];
    document.onUpdate((update) => updates.push(update));

    assert.equal(
      document.migrateToRich(legacyDigest, {
        kind: "human",
        principalId: "alice",
      }),
      true,
    );
    assert.equal(document.getFormat(), "rich-v1");
    assert.equal(document.getText(), "Pierwszy akapit\n\nTrzeci akapit");
    assert.equal(updates.length, 1);
    assert.equal(
      document.migrateToRich(legacyDigest, {
        kind: "human",
        principalId: "alice",
      }),
      false,
    );
    assert.equal(updates.length, 1);

    const raw = new Y.Doc();
    Y.applyUpdate(raw, document.encodeState());
    assert.equal(
      raw.getText(LEGACY_DOCUMENT_TEXT_ROOT).toString(),
      "Pierwszy akapit\n\nTrzeci akapit",
    );
    assert.equal(raw.getXmlFragment(RICH_DOCUMENT_FRAGMENT_ROOT).length, 3);
    assert.equal(
      raw.getMap(DOCUMENT_FORMAT_METADATA_ROOT).get("legacyDigest"),
      legacyDigest,
    );
    raw.destroy();
    document.destroy();
  });

  it("replaces and restores rich content without reverting to the legacy root", () => {
    const document = new YjsRealtimeDocumentAdapter();
    document.replaceText("Stan nazwanej wersji", {
      kind: "human",
      principalId: "alice",
    });
    document.migrateToRich(legacyDigest, {
      kind: "human",
      principalId: "alice",
    });
    const checkpoint = document.checkpoint();

    document.replaceText("Późniejsza zmiana", {
      kind: "human",
      principalId: "alice",
    });
    document.restore(checkpoint, "revision-rich-1");

    assert.equal(document.getFormat(), "rich-v1");
    assert.equal(document.getText(), "Stan nazwanej wersji");
    const reopened = new YjsRealtimeDocumentAdapter(document.encodeState());
    assert.equal(reopened.getFormat(), "rich-v1");
    assert.equal(reopened.getText(), "Stan nazwanej wersji");
    reopened.destroy();
    document.destroy();
  });

  it("restores a legacy revision into a rich document without downgrading it", () => {
    const legacy = new YjsRealtimeDocumentAdapter();
    legacy.replaceText("Treść sprzed migracji", {
      kind: "human",
      principalId: "alice",
    });
    const checkpoint = legacy.checkpoint();
    legacy.destroy();

    const current = new YjsRealtimeDocumentAdapter();
    current.replaceText("Nowsza treść", {
      kind: "human",
      principalId: "alice",
    });
    current.migrateToRich(legacyDigest, {
      kind: "human",
      principalId: "alice",
    });
    current.restore(checkpoint, "revision-legacy-1");

    assert.equal(current.getFormat(), "rich-v1");
    assert.equal(current.getText(), "Treść sprzed migracji");
    current.destroy();
  });

  it("fails closed for an unknown format or invalid migration digest", () => {
    const document = new YjsRealtimeDocumentAdapter();
    assert.throws(
      () =>
        document.migrateToRich("not-a-digest", {
          kind: "human",
          principalId: "alice",
        }),
      /DOCUMENT_LEGACY_DIGEST_INVALID/u,
    );
    document.destroy();

    const future = new Y.Doc();
    future.getMap(DOCUMENT_FORMAT_METADATA_ROOT).set("format", "future-v2");
    const unsupported = new YjsRealtimeDocumentAdapter(
      Y.encodeStateAsUpdate(future),
    );
    assert.throws(
      () => unsupported.getFormat(),
      /DOCUMENT_FORMAT_UNSUPPORTED/u,
    );
    unsupported.destroy();
    future.destroy();
  });

  it("fails closed for oversized updates and incompatible checkpoints", () => {
    const document = new YjsRealtimeDocumentAdapter();
    assert.throws(
      () => document.applyUpdate(new Uint8Array(MAX_DOCUMENT_UPDATE_BYTES + 1)),
      /DOCUMENT_UPDATE_SIZE_INVALID/u,
    );
    assert.throws(
      () =>
        document.restore(
          {
            engine: "future-engine" as "yjs-13",
            state: new Uint8Array([1]),
            stateVector: new Uint8Array(),
          },
          "revision",
        ),
      /DOCUMENT_CHECKPOINT_ENGINE_INVALID/u,
    );
    document.destroy();
  });
});
