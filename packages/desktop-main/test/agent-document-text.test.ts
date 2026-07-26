import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  createRichDocumentSeed,
} from "@constellation/realtime-documents";
import { ABSENT_CONTENT_STATE_VECTOR_SHA256 } from "@constellation/realtime-documents/agent-content";
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

  /**
   * Finding #16. A document written through the agent's plain-text path stays
   * plain-v1, and the structured read used to throw on it — reaching the agent
   * as an internal fault, which reads as "this build is broken" rather than
   * "this body is not rich yet". The read is now total, and what it shows is
   * exactly what the next write will start from.
   */
  it("reads a document the text path wrote instead of faulting on its format", () => {
    const fake = fakeStore();
    const subject = port(fake, false);
    subject.replace({
      documentId: ids.document,
      spaceId: ids.space,
      text: "Written as plain text\nby the agent",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    const read = subject.readStructured({
      documentId: ids.document,
      spaceId: ids.space,
    });
    assert.ok(read !== undefined);
    assert.equal(read.contentState, "plain-v1");
    assert.equal(read.text, "Written as plain text\nby the agent");
    // Two lines of plain text are two paragraphs once upgraded, and the digest
    // describes the stored plain-v1 state — so quoting it back is what lets the
    // very next write upgrade this document.
    assert.equal(read.content.content.length, 2);
    const written = subject.replaceStructured({
      documentId: ids.document,
      spaceId: ids.space,
      content: {
        schemaVersion: 1,
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Rich now" }] },
        ],
      },
      expectedStateVectorSha256: read.stateVectorSha256,
      idempotencyKey: "upgrade-1",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    assert.equal(written.outcome, "success", JSON.stringify(written));
    assert.equal(written.outcome === "success" && written.formatUpgraded, true);
    const after = subject.readStructured({
      documentId: ids.document,
      spaceId: ids.space,
    });
    assert.equal(after?.contentState, "rich-v1");
    assert.equal(after?.text, "Rich now");
  });

  /**
   * The blocking gap: a Project nobody had opened had no body, and both content
   * tools refused, so an agent could migrate an engagement's records but never
   * the operating context they exist for. Absence is a state now — the read
   * answers with the digest that means "nothing here yet", and quoting it back
   * creates the body, seeded from the Project's own intended outcome so the
   * scalar and the page do not start out disagreeing.
   */
  it("creates a body for an owner that has none, from the seed a human would have got", () => {
    const fake = fakeStore();
    const subject = port(fake, false);
    const seed = {
      text: "Sequence the PoV before the enablement deck.",
      principalId: "42000000-0000-4000-8000-000000000006",
    };
    const before = subject.readStructured({
      documentId: ids.document,
      spaceId: ids.space,
      seed,
    });
    assert.ok(before !== undefined);
    assert.equal(before.contentState, "absent");
    assert.equal(before.stateVectorSha256, ABSENT_CONTENT_STATE_VECTOR_SHA256);
    // The read already shows the body the write will start from, seed included.
    assert.equal(before.text, seed.text);
    const stale = subject.replaceStructured({
      documentId: ids.document,
      spaceId: ids.space,
      seed,
      content: {
        schemaVersion: 1,
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "x" }] },
        ],
      },
      expectedStateVectorSha256: "f".repeat(64),
      idempotencyKey: "create-stale",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    // A first write is an ordinary compare-and-set, so a caller that did not
    // read first cannot create a body by guessing.
    assert.equal(stale.outcome, "conflict");
    assert.equal(
      stale.outcome === "conflict" && stale.diagnosticCode,
      "document.state_vector_stale",
    );
    const created = subject.replaceStructured({
      documentId: ids.document,
      spaceId: ids.space,
      seed,
      content: {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "How this engagement runs" }],
          },
        ],
      },
      expectedStateVectorSha256: before.stateVectorSha256,
      idempotencyKey: "create-1",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    assert.equal(created.outcome, "success", JSON.stringify(created));
    assert.equal(created.outcome === "success" && created.contentCreated, true);
    const after = subject.readStructured({
      documentId: ids.document,
      spaceId: ids.space,
      seed,
    });
    // rich-v1 from the first byte: the desktop Project surface opens nothing
    // else, so a body left in plain text would be a page a person cannot edit.
    assert.equal(after?.contentState, "rich-v1");
    assert.equal(after?.text, "How this engagement runs");
    // The pre-write state is restorable, and it names what the write did.
    assert.ok(
      fake.revisions.some((revision) => revision.name.includes("created body")),
    );
  });

  /**
   * `contentState` answers a question nobody asked. A person opening a Project
   * in the app materialises its body from the Project's own intended outcome,
   * so `rich-v1` means "there is a body", not "somebody wrote one" — and an
   * agent deciding whether it may write has to tell those apart from the read
   * alone, because there is nobody to ask mid-run. Measured in the field on
   * 0.1.6: two of four real Projects held nothing but a word-for-word echo of
   * their own outcome.
   */
  it("says whether a body holds anything the seed did not put there", () => {
    const fake = fakeStore();
    const subject = port(fake, false);
    const seed = {
      text: "Sequence the PoV before the enablement deck.",
      principalId: "42000000-0000-4000-8000-000000000006",
    };
    const address = { documentId: ids.document, spaceId: ids.space, seed };
    const empty = subject.readStructured(address);
    assert.equal(empty?.contentState, "absent");
    assert.equal(empty?.contentOrigin, "absent");

    // Materialised the way the field case was: not by an agent write, but by
    // the desktop open path, through the exact call it makes. This is the only
    // form of the assertion worth having — the signal is a structural
    // comparison against what the seed alone produces, so it is only correct
    // while the open path and the agent baseline build the same document. Pin
    // them together here and a drift in either fails this test rather than
    // silently reporting somebody's work as safe to overwrite.
    fake.store.storeCollaborativeContentState({
      state: createRichDocumentSeed(
        seed.text,
        createHash("sha256").update(seed.text).digest("hex"),
        { kind: "human", principalId: seed.principalId },
      ),
      updatedAt: "2026-07-26T09:00:00.000Z",
    });
    const afterSeed = subject.readStructured(address);
    // The distinction the old read could not carry: same contentState, and a
    // different answer to the question that decides whether to write.
    assert.equal(afterSeed?.contentState, "rich-v1");
    assert.equal(afterSeed?.contentOrigin, "seeded");

    // One word, and it is somebody's. Authorship is not the test — content is:
    // from here on there is something to lose.
    const authored = subject.replaceStructured({
      ...address,
      content: {
        schemaVersion: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `${seed.text} Confirmed.` }],
          },
        ],
      },
      expectedStateVectorSha256: afterSeed!.stateVectorSha256,
      idempotencyKey: "origin-authored",
      principalId: "42000000-0000-4000-8000-000000000004",
      runId: "42000000-0000-4000-8000-000000000005",
      deviceId: DeviceIdSchema.parse("42000000-0000-4000-8000-000000000007"),
    });
    assert.equal(authored.outcome, "success", JSON.stringify(authored));
    const afterAuthoring = subject.readStructured(address);
    assert.equal(afterAuthoring?.contentState, "rich-v1");
    assert.equal(afterAuthoring?.contentOrigin, "authored");
  });
});
