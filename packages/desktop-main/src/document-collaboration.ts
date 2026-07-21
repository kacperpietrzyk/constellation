import { randomUUID } from "node:crypto";

import {
  CorrelationIdSchema,
  DocumentIdSchema,
  DocumentRevisionIdSchema,
  SpaceIdSchema,
  type DeviceId,
  type DocumentId,
  type SpaceId,
  type DocumentRevisionId,
  type PrincipalId,
  type WorkspaceId,
} from "@constellation/contracts";
import type { SqliteApplicationStore } from "@constellation/local-store";
import {
  MAX_DOCUMENT_TEXT_LENGTH,
  YjsRealtimeDocumentAdapter,
} from "@constellation/realtime-documents";

import type { HubConnection } from "./hub-connection-custody.js";

const MAX_BINARY_BYTES = 1_048_576;

export interface RendererDocumentRevision {
  readonly id: DocumentRevisionId;
  readonly name: string;
  readonly createdBy: PrincipalId;
  readonly createdAt: string;
  readonly restoredFromRevisionId?: DocumentRevisionId;
}

export interface RendererDocumentOpenResult {
  readonly mode: "local" | "coordinated";
  readonly state?: Uint8Array;
  readonly pendingUpdateCount: number;
  readonly session?: {
    readonly url: string;
    readonly room: string;
    readonly token: string;
    readonly expiresAt: string;
    readonly access: "view" | "comment" | "edit";
  };
}

interface DocumentBridgeInput {
  readonly workspaceId: WorkspaceId;
  readonly deviceId: DeviceId;
  readonly store: SqliteApplicationStore;
  readonly connection: () => HubConnection | undefined;
  readonly fetcher?: typeof fetch;
  readonly now?: () => string;
}

const boundedBytes = (value: unknown): Uint8Array => {
  if (!(value instanceof Uint8Array)) {
    throw new Error("Document binary payload is invalid.");
  }
  if (value.byteLength < 1 || value.byteLength > MAX_BINARY_BYTES) {
    throw new Error("Document binary payload is outside the supported limit.");
  }
  return value;
};

export class DocumentCollaborationBridge {
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;

  public constructor(private readonly input: DocumentBridgeInput) {
    this.fetcher = input.fetcher ?? fetch;
    this.now = input.now ?? (() => new Date().toISOString());
  }

  private document(documentId: DocumentId) {
    const document = this.input.store
      .snapshot()
      .documents?.find((candidate) => candidate.id === documentId);
    if (document === undefined) throw new Error("DOCUMENT_NOT_AVAILABLE");
    return document;
  }

  private scope(raw: {
    readonly documentId: unknown;
    readonly spaceId: unknown;
  }) {
    return {
      documentId: DocumentIdSchema.parse(raw.documentId),
      workspaceId: this.input.workspaceId,
      spaceId: SpaceIdSchema.parse(raw.spaceId),
    };
  }

  private async post(path: string, body: object): Promise<unknown> {
    const connection = this.input.connection();
    if (connection === undefined) throw new Error("DOCUMENT_HUB_UNAVAILABLE");
    const response = await this.fetcher(`${connection.origin}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${connection.deviceCredential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: connection.workspaceId,
        deviceId: connection.deviceId,
        ...body,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("DOCUMENT_NOT_AVAILABLE");
    return response.json() as Promise<unknown>;
  }

  public async open(raw: {
    readonly documentId: unknown;
    readonly spaceId: unknown;
  }): Promise<RendererDocumentOpenResult> {
    const scope = this.scope(raw);
    const state = this.input.store.loadDocumentCollaborationState(scope)?.state;
    const pendingUpdateCount =
      this.input.store.listPendingDocumentUpdates(scope).length;
    const connection = this.input.connection();
    if (connection === undefined) {
      return {
        mode: "local",
        ...(state === undefined ? {} : { state }),
        pendingUpdateCount,
      };
    }
    let value: Record<string, unknown>;
    try {
      value = (await this.post("/v1/documents/session", {
        documentId: scope.documentId,
      })) as Record<string, unknown>;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "DOCUMENT_NOT_AVAILABLE"
      ) {
        throw error;
      }
      return {
        mode: "coordinated",
        ...(state === undefined ? {} : { state }),
        pendingUpdateCount,
      };
    }
    if (
      typeof value.token !== "string" ||
      typeof value.room !== "string" ||
      typeof value.expiresAt !== "string" ||
      !["view", "comment", "edit"].includes(String(value.access))
    ) {
      throw new Error("DOCUMENT_SESSION_INVALID");
    }
    const url = new URL(connection.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/v1/realtime";
    url.search = "";
    return {
      mode: "coordinated",
      ...(state === undefined ? {} : { state }),
      pendingUpdateCount,
      session: {
        url: url.toString(),
        room: value.room,
        token: value.token,
        expiresAt: value.expiresAt,
        access: value.access as "view" | "comment" | "edit",
      },
    };
  }

  public persist(raw: {
    readonly documentId: unknown;
    readonly spaceId: unknown;
    readonly state: unknown;
    readonly update: unknown;
  }): void {
    const scope = this.scope(raw);
    const state = boundedBytes(raw.state);
    const update = boundedBytes(raw.update);
    const updatedAt = this.now();
    if (this.input.connection() === undefined) {
      this.input.store.storeDocumentCollaborationState({
        ...scope,
        state,
        updatedAt,
      });
      return;
    }
    this.input.store.commitDocumentUpdate({
      id: randomUUID(),
      ...scope,
      state,
      update,
      createdAt: updatedAt,
    });
  }

  public acknowledge(raw: {
    readonly documentId: unknown;
    readonly spaceId: unknown;
  }): void {
    const scope = this.scope(raw);
    const updateIds = this.input.store
      .listPendingDocumentUpdates(scope)
      .map((update) => update.id);
    this.input.store.acknowledgeDocumentUpdates({
      documentId: scope.documentId,
      updateIds,
    });
  }

  public async createRevision(raw: {
    readonly documentId: unknown;
    readonly name: unknown;
  }): Promise<DocumentRevisionId> {
    const documentId = DocumentIdSchema.parse(raw.documentId);
    if (typeof raw.name !== "string") throw new Error("REVISION_NAME_INVALID");
    const name = raw.name.trim();
    if (name.length < 1 || name.length > 120)
      throw new Error("REVISION_NAME_INVALID");
    const connection = this.input.connection();
    const correlationId = CorrelationIdSchema.parse(randomUUID());
    if (connection === undefined) {
      const document = this.document(documentId);
      const scope = {
        documentId,
        workspaceId: this.input.workspaceId,
        spaceId: document.spaceId,
      };
      const stored = this.input.store.loadDocumentCollaborationState(scope);
      const adapter = new YjsRealtimeDocumentAdapter(stored?.state);
      try {
        const checkpoint = adapter.checkpoint();
        const id = DocumentRevisionIdSchema.parse(randomUUID());
        this.input.store.storeDocumentRevision({
          id,
          ...scope,
          name,
          ...checkpoint,
          createdBy: document.createdBy,
          createdByDeviceId: this.input.deviceId,
          correlationId,
          createdAt: this.now(),
        });
        return id;
      } finally {
        adapter.destroy();
      }
    }
    const value = (await this.post("/v1/documents/revisions", {
      documentId,
      name,
      correlationId,
    })) as Record<string, unknown>;
    return DocumentRevisionIdSchema.parse(value.revisionId);
  }

  public async listRevisions(raw: {
    readonly documentId: unknown;
  }): Promise<readonly RendererDocumentRevision[]> {
    const documentId = DocumentIdSchema.parse(raw.documentId);
    if (this.input.connection() === undefined) {
      const document = this.document(documentId);
      return this.input.store
        .listDocumentRevisions({
          documentId,
          workspaceId: this.input.workspaceId,
          spaceId: document.spaceId,
        })
        .map(({ id, name, createdBy, createdAt, restoredFromRevisionId }) => ({
          id,
          name,
          createdBy,
          createdAt,
          ...(restoredFromRevisionId === undefined
            ? {}
            : { restoredFromRevisionId }),
        }));
    }
    const value = (await this.post("/v1/documents/revisions/list", {
      documentId,
    })) as { revisions?: readonly Record<string, unknown>[] };
    if (!Array.isArray(value.revisions))
      throw new Error("REVISION_LIST_INVALID");
    return value.revisions.map((revision) => ({
      id: DocumentRevisionIdSchema.parse(revision.id),
      name: String(revision.name),
      createdBy: String(revision.createdBy) as PrincipalId,
      createdAt: String(revision.createdAt),
      ...(revision.restoredFromRevisionId === undefined
        ? {}
        : {
            restoredFromRevisionId: DocumentRevisionIdSchema.parse(
              revision.restoredFromRevisionId,
            ),
          }),
    }));
  }

  public async restoreRevision(raw: {
    readonly documentId: unknown;
    readonly revisionId: unknown;
  }): Promise<void> {
    const documentId = DocumentIdSchema.parse(raw.documentId);
    const revisionId = DocumentRevisionIdSchema.parse(raw.revisionId);
    const correlationId = CorrelationIdSchema.parse(randomUUID());
    if (this.input.connection() === undefined) {
      const document = this.document(documentId);
      const scope = {
        documentId,
        workspaceId: this.input.workspaceId,
        spaceId: document.spaceId,
      };
      const revisions = this.input.store.listDocumentRevisions(scope);
      const revision = revisions.find(
        (candidate) => candidate.id === revisionId,
      );
      if (revision === undefined) throw new Error("DOCUMENT_NOT_AVAILABLE");
      const current = new YjsRealtimeDocumentAdapter(
        this.input.store.loadDocumentCollaborationState(scope)?.state,
      );
      try {
        current.restore(revision, revision.id);
        const checkpoint = current.checkpoint();
        this.input.store.storeDocumentCollaborationState({
          ...scope,
          state: checkpoint.state,
          updatedAt: this.now(),
        });
        this.input.store.storeDocumentRevision({
          id: DocumentRevisionIdSchema.parse(randomUUID()),
          ...scope,
          name: `Restored ${revision.name}`,
          ...checkpoint,
          createdBy: document.createdBy,
          createdByDeviceId: this.input.deviceId,
          correlationId,
          createdAt: this.now(),
          restoredFromRevisionId: revision.id,
        });
        return;
      } finally {
        current.destroy();
      }
    }
    await this.post("/v1/documents/revisions/restore", {
      documentId,
      revisionId,
      correlationId,
    });
  }
}

/**
 * ADR-049. The agent-facing text port: the same adapter, the same persistence
 * calls the renderer bridge makes, and the same size bound. Authorization is
 * the caller's (the local MCP runtime); this only knows how document text is
 * stored.
 */
export const createAgentDocumentTextPort = (input: {
  readonly workspaceId: WorkspaceId;
  readonly store: DocumentBridgeInput["store"];
  readonly connection: DocumentBridgeInput["connection"];
  readonly now?: () => string;
}) => {
  const now = input.now ?? (() => new Date().toISOString());
  const scope = (documentId: DocumentId, spaceId: SpaceId) => ({
    documentId,
    workspaceId: input.workspaceId,
    spaceId,
  });
  return {
    read: (request: {
      readonly documentId: DocumentId;
      readonly spaceId: SpaceId;
    }): string | undefined => {
      const state = input.store.loadDocumentCollaborationState(
        scope(request.documentId, request.spaceId),
      )?.state;
      if (state === undefined) return undefined;
      const adapter = new YjsRealtimeDocumentAdapter(state);
      try {
        return adapter.getText();
      } finally {
        adapter.destroy();
      }
    },
    replace: (request: {
      readonly documentId: DocumentId;
      readonly spaceId: SpaceId;
      readonly text: string;
      readonly principalId: string;
      // Absent for a non-agent write (an import restoring text): the change
      // origin then records a human principal rather than pretending an agent
      // run produced it.
      readonly runId?: string;
      readonly deviceId: DeviceId;
    }):
      | { readonly characters: number; readonly revisionId: DocumentRevisionId }
      | undefined => {
      if (request.text.length > MAX_DOCUMENT_TEXT_LENGTH) return undefined;
      const documentScope = scope(request.documentId, request.spaceId);
      const existing =
        input.store.loadDocumentCollaborationState(documentScope)?.state;
      const adapter = new YjsRealtimeDocumentAdapter(existing);
      try {
        // A Yjs transaction origin reaches live observers and is never stored,
        // so it cannot be the durable record of who wrote this. Agent
        // mutations must be attributable, auditable, and reversible (AGENTS.md
        // and ADR-049 §5): the pre-write state is snapshotted as a revision
        // naming the run, which both records the act and makes restoring the
        // prior text a normal action rather than a recovery project.
        const priorCheckpoint = adapter.checkpoint();
        const revisionId = DocumentRevisionIdSchema.parse(randomUUID());
        input.store.storeDocumentRevision({
          id: revisionId,
          ...documentScope,
          name:
            request.runId === undefined
              ? "Before import"
              : `Before agent write (run ${request.runId.slice(0, 8)})`,
          ...priorCheckpoint,
          createdBy: request.principalId as never,
          createdByDeviceId: request.deviceId,
          correlationId: CorrelationIdSchema.parse(randomUUID()),
          createdAt: now(),
        });
        let update: Uint8Array | undefined;
        const stop = adapter.onUpdate((value) => {
          update = value;
        });
        adapter.replaceText(
          request.text,
          request.runId === undefined
            ? { kind: "human", principalId: request.principalId }
            : {
                kind: "agent",
                principalId: request.principalId,
                runId: request.runId,
              },
        );
        stop();
        const state = adapter.encodeState();
        const updatedAt = now();
        // Same branch the renderer bridge takes. The coordinated half is
        // currently unreachable from the agent path — the local MCP endpoint
        // is disabled under a coordinated Data Home — and is kept because it
        // is the correct behaviour if that gate ever moves (ADR-049).
        if (update === undefined || input.connection() === undefined) {
          input.store.storeDocumentCollaborationState({
            ...documentScope,
            state,
            updatedAt,
          });
        } else {
          input.store.commitDocumentUpdate({
            id: randomUUID(),
            ...documentScope,
            state,
            update,
            createdAt: updatedAt,
          });
        }
        return { characters: request.text.length, revisionId };
      } finally {
        adapter.destroy();
      }
    },
  };
};
