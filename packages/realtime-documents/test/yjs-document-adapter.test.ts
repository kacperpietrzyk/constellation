import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_DOCUMENT_UPDATE_BYTES,
  YjsRealtimeDocumentAdapter,
} from "../src/index.js";

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
