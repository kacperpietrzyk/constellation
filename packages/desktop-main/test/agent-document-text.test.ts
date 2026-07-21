import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DocumentIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import {
  MAX_DOCUMENT_TEXT_LENGTH,
  YjsRealtimeDocumentAdapter,
} from "@constellation/realtime-documents";

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
  const committed: { state: Uint8Array; update: Uint8Array }[] = [];
  return {
    committed,
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
      storeDocumentCollaborationState: (input: {
        state: Uint8Array;
        updatedAt: string;
      }) => {
        stored = { state: input.state, updatedAt: input.updatedAt };
      },
      commitDocumentUpdate: (input: {
        state: Uint8Array;
        update: Uint8Array;
        createdAt: string;
      }) => {
        stored = { state: input.state, updatedAt: input.createdAt };
        committed.push({ state: input.state, update: input.update });
      },
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
    });
    assert.deepEqual(written, { characters: 35 });
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
    });
    assert.equal(
      subject.read({ documentId: ids.document, spaceId: ids.space }),
      "Rewritten by an agent",
    );
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
      }),
      undefined,
    );
    assert.equal(fake.current(), undefined);
  });
});
