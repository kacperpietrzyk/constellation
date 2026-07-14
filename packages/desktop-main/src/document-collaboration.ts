import { randomUUID } from "node:crypto";

import {
  CorrelationIdSchema,
  DocumentIdSchema,
  DocumentRevisionIdSchema,
  SpaceIdSchema,
  type DeviceId,
  type DocumentId,
  type DocumentRevisionId,
  type PrincipalId,
  type WorkspaceId,
} from "@constellation/contracts";
import type { SqliteApplicationStore } from "@constellation/local-store";
import { YjsRealtimeDocumentAdapter } from "@constellation/realtime-documents";

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
