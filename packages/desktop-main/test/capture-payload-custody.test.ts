import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { WorkspaceIdSchema } from "@constellation/contracts";
import {
  SqliteApplicationStore,
  type SqliteDatabase,
} from "@constellation/local-store";

import {
  CapturePayloadCustody,
  MAX_CAPTURE_PAYLOAD_BYTES,
} from "../src/capture-payload-custody.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000009001",
);

const fixture = () => {
  const database = new DatabaseSync(":memory:");
  const store = new SqliteApplicationStore(
    database as unknown as SqliteDatabase,
  );
  database
    .prepare(
      "INSERT INTO workspaces (id, version, payload_json) VALUES (?, 1, ?)",
    )
    .run(workspaceId, JSON.stringify({ id: workspaceId }));
  return {
    custody: new CapturePayloadCustody(
      workspaceId,
      store,
      () => new Date("2026-07-16T16:00:00.000Z"),
    ),
    database,
    store,
  };
};

describe("Capture payload custody", () => {
  it("stores a path-free descriptor and verifies the exact encrypted-store bytes", () => {
    const { custody, store } = fixture();
    const result = custody.stage({
      displayName: "private-brief.pdf",
      mediaType: "application/pdf",
      inputKind: "file",
      bytes: new TextEncoder().encode("bounded private fixture"),
    });

    assert.equal(result.outcome, "success");
    if (result.outcome !== "success") return;
    assert.equal(result.original.kind, "managed_file");
    assert.equal(JSON.stringify(result.original).includes("/private/"), false);
    assert.equal(custody.verify(result.original), true);
    assert.equal(
      new TextDecoder().decode(custody.read(result.original)),
      "bounded private fixture",
    );
    if (result.original.kind !== "managed_file") return;
    const stored = store.readCapturePayload({
      payloadId: result.original.payload.payloadId,
      workspaceId,
    });
    assert.equal(
      new TextDecoder().decode(stored?.bytes),
      "bounded private fixture",
    );
  });

  it("rejects empty, oversized, and unsupported screenshot payloads", () => {
    const { custody } = fixture();
    assert.deepEqual(
      custody.stage({
        displayName: "empty.txt",
        mediaType: "text/plain",
        inputKind: "file",
        bytes: new Uint8Array(),
      }),
      { outcome: "failure", code: "payload_empty" },
    );
    assert.deepEqual(
      custody.stage({
        displayName: "too-large.bin",
        mediaType: "application/octet-stream",
        inputKind: "file",
        bytes: new Uint8Array(MAX_CAPTURE_PAYLOAD_BYTES + 1),
      }),
      { outcome: "failure", code: "payload_too_large" },
    );
    assert.deepEqual(
      custody.stage({
        displayName: "not-an-image.txt",
        mediaType: "text/plain",
        inputKind: "screenshot",
        bytes: new Uint8Array([1]),
      }),
      { outcome: "failure", code: "payload_unsupported" },
    );
  });

  it("preserves voice identity, duration, retention, and exact audio bytes", () => {
    const { custody, store } = fixture();
    const bytes = new Uint8Array([26, 45, 223, 163, 66, 134]);
    const result = custody.stage({
      displayName: "Voice note.webm",
      mediaType: "audio/webm",
      inputKind: "voice_note",
      bytes,
      durationMs: 12_400,
      retentionPolicy: "delete_after_transcript",
    });
    assert.equal(result.outcome, "success");
    if (result.outcome !== "success" || result.original.kind !== "voice_note")
      return;
    assert.equal(result.original.durationMs, 12_400);
    assert.equal(result.original.retentionPolicy, "delete_after_transcript");
    assert.equal(custody.verify(result.original), true);
    assert.deepEqual(custody.read(result.original), bytes);
    assert.equal(custody.deleteVoiceAudio(result.original), true);
    assert.equal(custody.verify(result.original), false);
    assert.equal(custody.read(result.original), undefined);
    assert.equal(custody.deleteVoiceAudio(result.original), true);
    assert.equal(
      store.readCapturePayload({
        payloadId: result.original.payload.payloadId,
        workspaceId,
      }),
      undefined,
    );
    assert.deepEqual(
      custody.stage({
        displayName: "Too long.webm",
        mediaType: "audio/webm",
        inputKind: "voice_note",
        bytes,
        durationMs: 120_001,
        retentionPolicy: "retain",
      }),
      { outcome: "failure", code: "payload_unsupported" },
    );
  });

  it("fails integrity after byte tampering and removes abandoned staging rows", () => {
    const { custody, database } = fixture();
    const result = custody.stage({
      displayName: "Screenshot.png",
      mediaType: "image/png",
      inputKind: "screenshot",
      bytes: new Uint8Array([1, 2, 3, 4]),
    });
    assert.equal(result.outcome, "success");
    if (result.outcome !== "success" || result.original.kind !== "screenshot")
      return;
    database
      .prepare("UPDATE capture_payloads SET bytes = ? WHERE id = ?")
      .run(new Uint8Array([4, 3, 2, 1]), result.original.payload.payloadId);
    assert.equal(custody.verify(result.original), false);
    assert.equal(custody.reconcile(), 1);
    assert.equal(custody.verify(result.original), false);
  });

  it("restores a missing managed object only from exact Hub bytes", () => {
    const { custody, database } = fixture();
    const bytes = new TextEncoder().encode("downloaded from the owned Hub");
    const staged = custody.stage({
      displayName: "hub-proof.pdf",
      mediaType: "application/pdf",
      inputKind: "file",
      bytes,
    });
    assert.equal(staged.outcome, "success");
    if (staged.outcome !== "success") return;
    custody.discard(staged.original);
    assert.equal(custody.verify(staged.original), false);
    assert.equal(
      custody.restore(staged.original, new TextEncoder().encode("tampered")),
      false,
    );
    assert.equal(custody.verify(staged.original), false);
    assert.equal(custody.restore(staged.original, bytes), true);
    assert.equal(custody.restore(staged.original, bytes), true);
    assert.deepEqual(custody.read(staged.original), bytes);
    if (staged.original.kind !== "managed_file") return;
    database
      .prepare("UPDATE capture_payloads SET bytes = ? WHERE id = ?")
      .run(new Uint8Array(bytes.byteLength), staged.original.payload.payloadId);
    assert.equal(custody.verify(staged.original), false);
    assert.equal(custody.restore(staged.original, bytes), true);
    assert.deepEqual(custody.read(staged.original), bytes);
  });

  it("verifies the same managed payload after the workspace database reopens", () => {
    const root = mkdtempSync(path.join(tmpdir(), "capture-custody-restart-"));
    const filename = path.join(root, "workspace.db");
    try {
      const firstDatabase = new DatabaseSync(filename);
      const firstStore = new SqliteApplicationStore(
        firstDatabase as unknown as SqliteDatabase,
      );
      firstDatabase
        .prepare(
          "INSERT INTO workspaces (id, version, payload_json) VALUES (?, 1, ?)",
        )
        .run(workspaceId, JSON.stringify({ id: workspaceId }));
      const firstCustody = new CapturePayloadCustody(workspaceId, firstStore);
      const staged = firstCustody.stage({
        displayName: "restart-proof.pdf",
        mediaType: "application/pdf",
        inputKind: "file",
        bytes: new TextEncoder().encode("survives encrypted-store restart"),
      });
      assert.equal(staged.outcome, "success");
      firstDatabase.close();
      if (staged.outcome !== "success") return;

      const reopenedDatabase = new DatabaseSync(filename);
      const reopenedStore = new SqliteApplicationStore(
        reopenedDatabase as unknown as SqliteDatabase,
      );
      const reopenedCustody = new CapturePayloadCustody(
        workspaceId,
        reopenedStore,
      );
      assert.equal(reopenedCustody.verify(staged.original), true);
      reopenedDatabase.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
