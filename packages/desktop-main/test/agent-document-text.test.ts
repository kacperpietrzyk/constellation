import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DeviceIdSchema,
  DocumentIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import {
  MAX_DOCUMENT_TEXT_LENGTH,
  YjsRealtimeDocumentAdapter,
} from "@constellation/realtime-documents";
import type { SqliteApplicationStore } from "@constellation/local-store";

import { createAgentDocumentTextPort } from "../src/document-collaboration.js";

const ids = {
  workspace: WorkspaceIdSchema.parse("42000000-0000-4000-8000-000000000001"),
  space: SpaceIdSchema.parse("42000000-0000-4000-8000-000000000002"),
  document: DocumentIdSchema.parse("42000000-0000-4000-8000-000000000003"),
} as const;

interface StoredState {
  state: Uint8Array;
  updatedAt: string;
}

const fakeStore = () => {
  let stored: StoredState | undefined;
  let failNextStructuredReceipt = false;
  const committed: { state: Uint8Array; update: Uint8Array }[] = [];
  const revisions: Array<
    Parameters<SqliteApplicationStore["storeDocumentRevision"]>[0]
  > = [];
  return {
    committed,
    revisions,
    current: () => stored,
    store: {
      loadDocumentCollaborationState: () =>
        stored === undefined
          ? undefined
          : {
              documentId: ids.document,
              workspaceId: ids.workspace,
              spaceId: ids.space,
              engine: "yjs-13" as const,
              state: stored.state,
              updatedAt: stored.updatedAt,
            },
      loadCollaborativeContentState: () =>
        stored === undefined
          ? undefined
          : {
              owner: { kind: "document", documentId: ids.document } as const,
              workspaceId: ids.workspace,
              spaceId: ids.space,
              engine: "yjs-13" as const,
              state: stored.state,
              updatedAt: stored.updatedAt,
            },
      storeDocumentCollaborationState: (input: {
        state: Uint8Array;
        updatedAt: string;
      }) => {
        stored = { state: input.state, updatedAt: input.updatedAt };
      },
      storeCollaborativeContentState: (input: {
        state: Uint8Array;
        updatedAt: string;
      }) => {
        stored = { state: input.state, updatedAt: input.updatedAt };
      },
      storeDocumentRevision: (
        revision: Parameters<
          SqliteApplicationStore["storeDocumentRevision"]
        >[0],
      ) => {
        if (
          failNextStructuredReceipt &&
          (revision.name.startsWith("Agent receipt ") ||
            revision.name.startsWith("Agent restore receipt "))
        ) {
          failNextStructuredReceipt = false;
          throw new Error("INJECTED_RECEIPT_FAILURE");
        }
        revisions.push(revision);
      },
      listDocumentRevisions: () => revisions,
      storeCollaborativeContentRevision: (
        revision: Parameters<
          SqliteApplicationStore["storeCollaborativeContentRevision"]
        >[0],
      ) => {
        if (
          failNextStructuredReceipt &&
          (revision.name.startsWith("Agent receipt ") ||
            revision.name.startsWith("Agent restore receipt "))
        ) {
          failNextStructuredReceipt = false;
          throw new Error("INJECTED_RECEIPT_FAILURE");
        }
        revisions.push({ ...revision, documentId: ids.document });
      },
      listCollaborativeContentRevisions: () =>
        revisions.map((revision) => ({
          ...revision,
          owner: { kind: "document", documentId: ids.document } as const,
        })),
      replaceDocumentEntityLinks: () => undefined,
      replaceDocumentSearchProjection: () => undefined,
      replaceCollaborativeContentEntityLinks: () => undefined,
      replaceCollaborativeContentSearchProjection: () => undefined,
      commitDocumentUpdate: (input: {
        state: Uint8Array;
        update: Uint8Array;
        createdAt: string;
      }) => {
        stored = { state: input.state, updatedAt: input.createdAt };
        committed.push({ state: input.state, update: input.update });
      },
      commitCollaborativeContentUpdate: (input: {
        state: Uint8Array;
        update: Uint8Array;
        createdAt: string;
      }) => {
        stored = { state: input.state, updatedAt: input.createdAt };
        committed.push({ state: input.state, update: input.update });
      },
    },
    failNextStructuredReceipt: () => {
      failNextStructuredReceipt = true;
    },
  };
};

/**
 * ADR-049. The port is the only place that knows how document text is stored;
 * authorization lives in the MCP runtime. These cases pin what the port
 * promises: the same adapter the desktop uses, the agent origin, the existing
 * bound, and the coordinated outbox when a Hub connection exists.
 */
describe("agent document text port", () => {
  const port = (
    fake: ReturnType<typeof fakeStore>,
    connected: boolean,
    now = "2026-07-21T12:00:00.000Z",
  ) =>
    createAgentDocumentTextPort({
      workspaceId: ids.workspace,
      store: fake.store as never,
      connection: () =>
        connected
          ? ({
              origin: "https://hub.example.com",
              workspaceId: ids.workspace,
              deviceId: "device",
              deviceCredential: "credential",
            } as never)
          : undefined,
      now: () => now,
    });

  it("writes text an unopened document can be read back from", () => {
    const fake = fakeStore();
    const subject = port(fake, false);
    // A document nobody has opened has no state blob at all; that is empty
    // text rather than a failure.
    assert.equal(
      subject.read({ documentId: ids.document, spaceId: ids.space }),
      undefined,
    );
    const written = subject.replace({
      documentId: ids.document,
      spaceId: ids.space,
      text: "Delivery notes written by an agent.",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    assert.equal(written?.characters, 35);
    // Durable attribution and reversibility: the pre-write text is captured as
    // a revision naming the run, so an agent's rewrite can be undone by a
    // person restoring it (ADR-049 §5).
    assert.ok(written?.revisionId);
    assert.equal(
      subject.read({ documentId: ids.document, spaceId: ids.space }),
      "Delivery notes written by an agent.",
    );
    // A local-only workspace stores state and queues nothing.
    assert.equal(fake.committed.length, 0);
  });

  it("produces an ordinary Yjs update a collaborator can apply", () => {
    const fake = fakeStore();
    const subject = port(fake, true);
    subject.replace({
      documentId: ids.document,
      spaceId: ids.space,
      text: "First",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    // Coordinated: the update is queued for the outbox, exactly as the
    // renderer bridge queues its own.
    assert.equal(fake.committed.length, 1);
    const collaborator = new YjsRealtimeDocumentAdapter();
    try {
      collaborator.applyUpdate(fake.committed[0]!.update);
      assert.equal(collaborator.getText(), "First");
    } finally {
      collaborator.destroy();
    }
  });

  it("merges over an existing document rather than starting a new one", () => {
    const fake = fakeStore();
    const seed = new YjsRealtimeDocumentAdapter();
    seed.replaceText("Written by a person", {
      kind: "human",
      principalId: "42000000-0000-4000-8000-000000000006",
    });
    fake.store.storeDocumentCollaborationState({
      state: seed.encodeState(),
      updatedAt: "2026-07-21T11:00:00.000Z",
    });
    seed.destroy();
    const subject = port(fake, false);
    subject.replace({
      documentId: ids.document,
      spaceId: ids.space,
      text: "Rewritten by an agent",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    assert.equal(
      subject.read({ documentId: ids.document, spaceId: ids.space }),
      "Rewritten by an agent",
    );
  });

  it("records the pre-write text as a restorable revision naming the run", () => {
    const fake = fakeStore();
    const subject = port(fake, false);
    subject.replace({
      documentId: ids.document,
      spaceId: ids.space,
      text: "First version",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    subject.replace({
      documentId: ids.document,
      spaceId: ids.space,
      text: "Second version",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    // One revision per agent write, each holding the text that write replaced,
    // so "reversible" is a restore rather than a recovery project.
    assert.equal(fake.revisions.length, 2);
    assert.equal(fake.revisions[1]?.name, "Before agent write (run 42000000)");
  });

  it("refuses text beyond the existing document bound", () => {
    const fake = fakeStore();
    const subject = port(fake, false);
    assert.equal(
      subject.replace({
        documentId: ids.document,
        spaceId: ids.space,
        text: "x".repeat(MAX_DOCUMENT_TEXT_LENGTH + 1),
        principalId: "42000000-0000-4000-8000-000000000004",
        runId: "42000000-0000-4000-8000-000000000005",
        deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
      }),
      undefined,
    );
    assert.equal(fake.current(), undefined);
  });

  it("replaces rich structure only at the expected state vector and replays once", () => {
    const fake = fakeStore();
    const seed = new YjsRealtimeDocumentAdapter();
    seed.replaceText("Before", {
      kind: "human",
      principalId: "42000000-0000-4000-8000-000000000006",
    });
    seed.migrateToRich("a".repeat(64), {
      kind: "human",
      principalId: "42000000-0000-4000-8000-000000000006",
    });
    fake.store.storeDocumentCollaborationState({
      state: seed.encodeState(),
      updatedAt: "2026-07-21T11:00:00.000Z",
    });
    seed.destroy();
    const subject = port(fake, false);
    const current = subject.readStructured({
      documentId: ids.document,
      spaceId: ids.space,
    });
    assert.ok(current !== undefined);
    const request = {
      documentId: ids.document,
      spaceId: ids.space,
      content: {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Linked " },
              {
                type: "entityReference",
                attrs: {
                  targetKind: "task",
                  targetId: "42000000-0000-4000-8000-000000000008",
                },
              },
            ],
          },
        ],
      },
      expectedStateVectorSha256: current.stateVectorSha256,
      idempotencyKey: "rich-write-1",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    };
    const written = subject.replaceStructured(request);
    assert.equal(written.outcome, "success");
    if (written.outcome !== "success") throw new Error("Expected success.");
    assert.equal(written.idempotentReplay, false);
    const replay = subject.replaceStructured(request);
    assert.equal(replay.outcome, "success");
    if (replay.outcome !== "success") throw new Error("Expected replay.");
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.revisionId, written.revisionId);
    const stale = subject.replaceStructured({
      ...request,
      idempotencyKey: "rich-write-2",
    });
    assert.deepEqual(stale, {
      outcome: "conflict",
      diagnosticCode: "document.state_vector_stale",
    });
    const after = subject.readStructured({
      documentId: ids.document,
      spaceId: ids.space,
    });
    assert.deepEqual(after?.entityReferences, [
      {
        targetKind: "task",
        targetId: "42000000-0000-4000-8000-000000000008",
      },
    ]);
    assert.match(
      fake.revisions[0]?.name ?? "",
      /^Before agent structured write \(run 42000000\) /u,
    );
    const restoreRequest = {
      documentId: ids.document,
      spaceId: ids.space,
      revisionId: written.revisionId,
      expectedStateVectorSha256: after!.stateVectorSha256,
      idempotencyKey: "rich-restore-1",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    };
    fake.failNextStructuredReceipt();
    assert.throws(
      () => subject.restoreStructured(restoreRequest),
      /INJECTED_RECEIPT_FAILURE/u,
    );
    const restored = subject.restoreStructured(restoreRequest);
    assert.equal(restored.outcome, "success");
    if (restored.outcome === "success")
      assert.equal(restored.idempotentReplay, true);
    assert.equal(
      subject.readStructured({
        documentId: ids.document,
        spaceId: ids.space,
      })?.text,
      "Before",
    );
    const restoreReplay = subject.restoreStructured(restoreRequest);
    assert.equal(restoreReplay.outcome, "success");
    if (restoreReplay.outcome === "success")
      assert.equal(restoreReplay.idempotentReplay, true);
  });

  it("never turns a failed structured receipt write into a false retry", () => {
    const fake = fakeStore();
    const seed = new YjsRealtimeDocumentAdapter();
    seed.replaceText("Before receipt failure", {
      kind: "human",
      principalId: "42000000-0000-4000-8000-000000000006",
    });
    seed.migrateToRich("a".repeat(64), {
      kind: "human",
      principalId: "42000000-0000-4000-8000-000000000006",
    });
    fake.store.storeDocumentCollaborationState({
      state: seed.encodeState(),
      updatedAt: "2026-07-21T11:00:00.000Z",
    });
    seed.destroy();
    const subject = port(fake, false);
    const before = subject.readStructured({
      documentId: ids.document,
      spaceId: ids.space,
    });
    assert.ok(before !== undefined);
    const request = {
      documentId: ids.document,
      spaceId: ids.space,
      content: {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Persisted before receipt" }],
          },
        ],
      },
      expectedStateVectorSha256: before.stateVectorSha256,
      idempotencyKey: "receipt-failure-write",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    };
    fake.failNextStructuredReceipt();
    assert.throws(
      () => subject.replaceStructured(request),
      /INJECTED_RECEIPT_FAILURE/u,
    );
    assert.equal(
      subject.readStructured({
        documentId: ids.document,
        spaceId: ids.space,
      })?.text,
      "Persisted before receipt",
    );
    assert.equal(fake.revisions.length, 1);
    const replay = subject.replaceStructured(request);
    assert.equal(replay.outcome, "success");
    if (replay.outcome !== "success") throw new Error("Expected replay.");
    assert.equal(replay.idempotentReplay, true);
    assert.equal(fake.revisions.length, 2);
    assert.deepEqual(
      subject.replaceStructured({
        ...request,
        expectedStateVectorSha256: replay.stateVectorSha256,
      }),
      {
        outcome: "conflict",
        diagnosticCode: "document.idempotency_mismatch",
      },
    );
  });

  it("imports structured content as one rich state with a recovery revision", () => {
    const fake = fakeStore();
    const subject = port(fake, false);
    const imported = subject.importStructured({
      documentId: ids.document,
      spaceId: ids.space,
      text: "Portable fallback",
      content: {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Portable rich heading" }],
          },
        ],
      },
      principalId: "42000000-0000-4000-8000-000000000004",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    assert.ok(imported !== undefined);
    const read = subject.readStructured({
      documentId: ids.document,
      spaceId: ids.space,
    });
    assert.equal(read?.text, "Portable rich heading");
    assert.equal(read?.content.content[0]?.type, "heading");
    assert.equal(fake.revisions[0]?.name, "Before structured import");
  });
});
