import { createHash, randomUUID } from "node:crypto";

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
  type DocumentContentFormat,
  type StructuredDocument,
  MAX_DOCUMENT_TEXT_LENGTH,
  YjsRealtimeDocumentAdapter,
  parseStructuredDocument,
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
  readonly searchIndexState: "current" | "rebuilding" | "unavailable";
  readonly session?: {
    readonly url: string;
    readonly room: string;
    readonly token: string;
    readonly expiresAt: string;
    readonly access: "view" | "comment" | "edit";
    readonly documentFormat: DocumentContentFormat;
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

const supportedFormats = (value: unknown): readonly DocumentContentFormat[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new Error("DOCUMENT_FORMAT_CAPABILITY_INVALID");
  }
  const formats = [...new Set(value)];
  if (
    formats.length !== value.length ||
    formats.some((format) => format !== "plain-v1" && format !== "rich-v1")
  ) {
    throw new Error("DOCUMENT_FORMAT_CAPABILITY_INVALID");
  }
  return formats as DocumentContentFormat[];
};

export class DocumentCollaborationBridge {
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;
  private readonly searchIndexTimers = new Map<DocumentId, NodeJS.Timeout>();
  private readonly unavailableSearchIndexes = new Set<DocumentId>();

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

  private stateDigest(state: Uint8Array): string {
    return createHash("sha256").update(state).digest("hex");
  }

  private indexDocument(
    scope: {
      readonly documentId: DocumentId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
    },
    state: Uint8Array,
  ): "current" | "unavailable" {
    const adapter = new YjsRealtimeDocumentAdapter(state);
    try {
      this.input.store.replaceDocumentSearchProjection({
        ...scope,
        body: adapter.getText(),
        stateDigest: this.stateDigest(state),
        indexedAt: this.now(),
      });
      this.unavailableSearchIndexes.delete(scope.documentId);
      return "current";
    } catch {
      this.unavailableSearchIndexes.add(scope.documentId);
      return "unavailable";
    } finally {
      adapter.destroy();
    }
  }

  private scheduleDocumentIndex(
    scope: {
      readonly documentId: DocumentId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
    },
    state: Uint8Array,
  ): void {
    const currentTimer = this.searchIndexTimers.get(scope.documentId);
    if (currentTimer !== undefined) clearTimeout(currentTimer);
    const stateCopy = state.slice();
    const timer = setTimeout(() => {
      this.searchIndexTimers.delete(scope.documentId);
      try {
        const stored = this.input.store.loadDocumentCollaborationState(scope);
        if (
          stored !== undefined &&
          this.stateDigest(stored.state) === this.stateDigest(stateCopy)
        ) {
          this.indexDocument(scope, stateCopy);
        }
      } catch {
        // Revocation can race the debounce. Editing persistence and access
        // purge remain authoritative; a later authorized open rebuilds the
        // projection from the current encrypted Yjs state.
        this.unavailableSearchIndexes.add(scope.documentId);
      }
    }, 250);
    timer.unref();
    this.searchIndexTimers.set(scope.documentId, timer);
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
    if (!response.ok) {
      const failure = (await response.json().catch(() => undefined)) as
        { readonly code?: unknown } | undefined;
      if (
        response.status === 409 &&
        failure?.code === "document_format_upgrade_required"
      ) {
        throw new Error("DOCUMENT_SCHEMA_UPGRADE_REQUIRED");
      }
      throw new Error("DOCUMENT_NOT_AVAILABLE");
    }
    return response.json() as Promise<unknown>;
  }

  public async open(raw: {
    readonly documentId: unknown;
    readonly spaceId: unknown;
    readonly supportedDocumentFormats?: unknown;
  }): Promise<RendererDocumentOpenResult> {
    const scope = this.scope(raw);
    const state = this.input.store.loadDocumentCollaborationState(scope)?.state;
    const formats = supportedFormats(
      raw.supportedDocumentFormats ?? ["plain-v1"],
    );
    if (state !== undefined) {
      const adapter = new YjsRealtimeDocumentAdapter(state);
      try {
        if (!formats.includes(adapter.getFormat())) {
          throw new Error("DOCUMENT_SCHEMA_UPGRADE_REQUIRED");
        }
        this.input.store.replaceDocumentEntityLinks({
          ...scope,
          links: adapter.getEntityReferences(),
          updatedAt: this.now(),
        });
      } finally {
        adapter.destroy();
      }
    }
    let searchIndexState: RendererDocumentOpenResult["searchIndexState"] =
      "current";
    if (state !== undefined) {
      const currentProjection =
        this.input.store.getDocumentSearchProjection(scope);
      searchIndexState =
        currentProjection?.stateDigest === this.stateDigest(state)
          ? "current"
          : this.indexDocument(scope, state);
    } else if (this.unavailableSearchIndexes.has(scope.documentId)) {
      searchIndexState = "unavailable";
    }
    const pendingUpdateCount =
      this.input.store.listPendingDocumentUpdates(scope).length;
    const connection = this.input.connection();
    if (connection === undefined) {
      return {
        mode: "local",
        ...(state === undefined ? {} : { state }),
        pendingUpdateCount,
        searchIndexState,
      };
    }
    let value: Record<string, unknown>;
    try {
      value = (await this.post("/v1/documents/session", {
        documentId: scope.documentId,
        supportedDocumentFormats: formats,
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
        searchIndexState,
      };
    }
    if (
      typeof value.token !== "string" ||
      typeof value.room !== "string" ||
      typeof value.expiresAt !== "string" ||
      (value.documentFormat !== "plain-v1" &&
        value.documentFormat !== "rich-v1") ||
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
      searchIndexState,
      session: {
        url: url.toString(),
        room: value.room,
        token: value.token,
        expiresAt: value.expiresAt,
        access: value.access as "view" | "comment" | "edit",
        documentFormat: value.documentFormat,
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
    const incoming = new YjsRealtimeDocumentAdapter(state);
    let entityReferences: ReturnType<
      YjsRealtimeDocumentAdapter["getEntityReferences"]
    > = [];
    try {
      if (incoming.getText().length > MAX_DOCUMENT_TEXT_LENGTH) {
        throw new Error("DOCUMENT_TEXT_SIZE_INVALID");
      }
      entityReferences = incoming.getEntityReferences();
      const stored = this.input.store.loadDocumentCollaborationState(scope);
      if (stored !== undefined) {
        const current = new YjsRealtimeDocumentAdapter(stored.state);
        try {
          if (
            current.getFormat() === "rich-v1" &&
            incoming.getFormat() !== "rich-v1"
          ) {
            throw new Error("DOCUMENT_SCHEMA_DOWNGRADE_REFUSED");
          }
        } finally {
          current.destroy();
        }
      }
    } finally {
      incoming.destroy();
    }
    const updatedAt = this.now();
    if (this.input.connection() === undefined) {
      this.input.store.storeDocumentCollaborationState({
        ...scope,
        state,
        updatedAt,
      });
      this.input.store.replaceDocumentEntityLinks({
        ...scope,
        links: entityReferences,
        updatedAt,
      });
      this.scheduleDocumentIndex(scope, state);
      return;
    }
    this.input.store.commitDocumentUpdate({
      id: randomUUID(),
      ...scope,
      state,
      update,
      createdAt: updatedAt,
    });
    this.input.store.replaceDocumentEntityLinks({
      ...scope,
      links: entityReferences,
      updatedAt,
    });
    this.scheduleDocumentIndex(scope, state);
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
        this.input.store.replaceDocumentEntityLinks({
          ...scope,
          links: current.getEntityReferences(),
          updatedAt: this.now(),
        });
        this.indexDocument(scope, checkpoint.state);
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
    readStructured: (request: {
      readonly documentId: DocumentId;
      readonly spaceId: SpaceId;
    }):
      | {
          readonly content: StructuredDocument;
          readonly text: string;
          readonly entityReferences: ReturnType<
            YjsRealtimeDocumentAdapter["getEntityReferences"]
          >;
          readonly stateVectorSha256: string;
        }
      | undefined => {
      const state = input.store.loadDocumentCollaborationState(
        scope(request.documentId, request.spaceId),
      )?.state;
      if (state === undefined) return undefined;
      const adapter = new YjsRealtimeDocumentAdapter(state);
      try {
        const checkpoint = adapter.checkpoint();
        return {
          content: adapter.getStructuredContent(),
          text: adapter.getText(),
          entityReferences: adapter.getEntityReferences(),
          stateVectorSha256: createHash("sha256")
            .update(checkpoint.stateVector)
            .digest("hex"),
        };
      } finally {
        adapter.destroy();
      }
    },
    importStructured: (request: {
      readonly documentId: DocumentId;
      readonly spaceId: SpaceId;
      readonly text: string;
      readonly content: unknown;
      readonly principalId: string;
      readonly deviceId: DeviceId;
    }): { readonly revisionId: DocumentRevisionId } | undefined => {
      if (request.text.length > MAX_DOCUMENT_TEXT_LENGTH) return undefined;
      const documentScope = scope(request.documentId, request.spaceId);
      const existing =
        input.store.loadDocumentCollaborationState(documentScope)?.state;
      const adapter = new YjsRealtimeDocumentAdapter(existing);
      try {
        const priorCheckpoint = adapter.checkpoint();
        adapter.replaceText(request.text, {
          kind: "human",
          principalId: request.principalId,
        });
        adapter.migrateToRich(
          createHash("sha256").update(request.text).digest("hex"),
          { kind: "human", principalId: request.principalId },
        );
        try {
          adapter.replaceStructuredContent(request.content, {
            kind: "human",
            principalId: request.principalId,
          });
        } catch {
          return undefined;
        }
        const revisionId = DocumentRevisionIdSchema.parse(randomUUID());
        input.store.storeDocumentRevision({
          id: revisionId,
          ...documentScope,
          name: "Before structured import",
          ...priorCheckpoint,
          createdBy: request.principalId as never,
          createdByDeviceId: request.deviceId,
          correlationId: CorrelationIdSchema.parse(randomUUID()),
          createdAt: now(),
        });
        const state = adapter.encodeState();
        const update = adapter.encodeUpdateSince(priorCheckpoint.stateVector);
        const updatedAt = now();
        if (input.connection() === undefined) {
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
        try {
          input.store.replaceDocumentEntityLinks({
            ...documentScope,
            links: adapter.getEntityReferences(),
            updatedAt,
          });
          input.store.replaceDocumentSearchProjection({
            ...documentScope,
            body: adapter.getText(),
            stateDigest: createHash("sha256").update(state).digest("hex"),
            indexedAt: updatedAt,
          });
        } catch {
          // Rebuildable projections never invalidate a durable import.
        }
        return { revisionId };
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
        try {
          input.store.replaceDocumentSearchProjection({
            ...documentScope,
            body: adapter.getText(),
            stateDigest: createHash("sha256").update(state).digest("hex"),
            indexedAt: updatedAt,
          });
        } catch {
          // Search is a rebuildable local projection. A failed index write
          // must never turn an already-durable document mutation into a false
          // retryable failure; the next authorized open repairs it.
        }
        return { characters: request.text.length, revisionId };
      } finally {
        adapter.destroy();
      }
    },
    replaceStructured: (request: {
      readonly documentId: DocumentId;
      readonly spaceId: SpaceId;
      readonly content: unknown;
      readonly expectedStateVectorSha256: string;
      readonly idempotencyKey: string;
      readonly principalId: string;
      readonly runId: string;
      readonly deviceId: DeviceId;
    }):
      | {
          readonly outcome: "success";
          readonly revisionId: DocumentRevisionId;
          readonly stateVectorSha256: string;
          readonly idempotentReplay: boolean;
        }
      | { readonly outcome: "conflict"; readonly diagnosticCode: string }
      | { readonly outcome: "rejected"; readonly diagnosticCode: string } => {
      const documentScope = scope(request.documentId, request.spaceId);
      const keyDigest = createHash("sha256")
        .update(request.idempotencyKey)
        .digest("base64url")
        .slice(0, 22);
      let content: StructuredDocument;
      try {
        content = parseStructuredDocument(request.content);
      } catch {
        return {
          outcome: "rejected",
          diagnosticCode: "document.structured_content_invalid",
        };
      }
      const requestDigest = createHash("sha256")
        .update(
          JSON.stringify({
            content,
            expectedStateVectorSha256: request.expectedStateVectorSha256,
          }),
        )
        .digest("base64url")
        .slice(0, 22);
      const receiptSuffix = `[${keyDigest}.${requestDigest}]`;
      const revisions = input.store.listDocumentRevisions(documentScope);
      const receipt = revisions.find(
        (revision) =>
          revision.name.startsWith("Agent receipt ") &&
          revision.name.endsWith(receiptSuffix),
      );
      if (receipt !== undefined) {
        if (receipt.restoredFromRevisionId === undefined)
          return {
            outcome: "rejected",
            diagnosticCode: "document.content_unavailable",
          };
        return {
          outcome: "success",
          revisionId: receipt.restoredFromRevisionId,
          stateVectorSha256: createHash("sha256")
            .update(receipt.stateVector)
            .digest("hex"),
          idempotentReplay: true,
        };
      }
      const pending = revisions.find(
        (revision) =>
          revision.name.startsWith("Before agent structured write ") &&
          revision.name.endsWith(receiptSuffix),
      );
      if (
        revisions.some(
          (revision) =>
            (revision.name.startsWith("Agent receipt ") ||
              revision.name.startsWith("Before agent structured write ")) &&
            revision.name.includes(`[${keyDigest}.`) &&
            !revision.name.endsWith(receiptSuffix),
        )
      )
        return {
          outcome: "conflict",
          diagnosticCode: "document.idempotency_mismatch",
        };
      const existing =
        input.store.loadDocumentCollaborationState(documentScope)?.state;
      if (existing === undefined)
        return {
          outcome: "rejected",
          diagnosticCode: "document.content_unavailable",
        };
      const adapter = new YjsRealtimeDocumentAdapter(existing);
      try {
        if (adapter.getFormat() !== "rich-v1")
          return {
            outcome: "rejected",
            diagnosticCode: "document.schema_upgrade_required",
          };
        const priorCheckpoint = adapter.checkpoint();
        const priorDigest = createHash("sha256")
          .update(priorCheckpoint.stateVector)
          .digest("hex");
        if (pending !== undefined) {
          const currentContentDigest = createHash("sha256")
            .update(JSON.stringify(adapter.getStructuredContent()))
            .digest("base64url")
            .slice(0, 22);
          const requestedContentDigest = createHash("sha256")
            .update(JSON.stringify(content))
            .digest("base64url")
            .slice(0, 22);
          if (currentContentDigest === requestedContentDigest) {
            const checkpoint = adapter.checkpoint();
            input.store.storeDocumentRevision({
              id: DocumentRevisionIdSchema.parse(randomUUID()),
              ...documentScope,
              name: `Agent receipt ${receiptSuffix}`,
              ...checkpoint,
              createdBy: request.principalId as never,
              createdByDeviceId: request.deviceId,
              correlationId: CorrelationIdSchema.parse(randomUUID()),
              createdAt: now(),
              restoredFromRevisionId: pending.id,
            });
            return {
              outcome: "success",
              revisionId: pending.id,
              stateVectorSha256: createHash("sha256")
                .update(checkpoint.stateVector)
                .digest("hex"),
              idempotentReplay: true,
            };
          }
          const pendingDigest = createHash("sha256")
            .update(pending.stateVector)
            .digest("hex");
          if (
            priorDigest !== pendingDigest ||
            pendingDigest !== request.expectedStateVectorSha256
          )
            return {
              outcome: "conflict",
              diagnosticCode: "document.state_vector_stale",
            };
        } else if (priorDigest !== request.expectedStateVectorSha256)
          return {
            outcome: "conflict",
            diagnosticCode: "document.state_vector_stale",
          };
        let update: Uint8Array | undefined;
        const stop = adapter.onUpdate((value) => {
          update = value;
        });
        try {
          adapter.replaceStructuredContent(content, {
            kind: "agent",
            principalId: request.principalId,
            runId: request.runId,
          });
        } catch {
          return {
            outcome: "rejected",
            diagnosticCode: "document.structured_content_invalid",
          };
        } finally {
          stop();
        }
        const revisionId =
          pending?.id ?? DocumentRevisionIdSchema.parse(randomUUID());
        if (pending === undefined)
          input.store.storeDocumentRevision({
            id: revisionId,
            ...documentScope,
            name: `Before agent structured write (run ${request.runId.slice(0, 8)}) ${receiptSuffix}`,
            ...priorCheckpoint,
            createdBy: request.principalId as never,
            createdByDeviceId: request.deviceId,
            correlationId: CorrelationIdSchema.parse(randomUUID()),
            createdAt: now(),
          });
        const state = adapter.encodeState();
        const updatedAt = now();
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
        try {
          input.store.replaceDocumentEntityLinks({
            ...documentScope,
            links: adapter.getEntityReferences(),
            updatedAt,
          });
          input.store.replaceDocumentSearchProjection({
            ...documentScope,
            body: adapter.getText(),
            stateDigest: createHash("sha256").update(state).digest("hex"),
            indexedAt: updatedAt,
          });
        } catch {
          // Both are rebuildable projections; the collaborative mutation and
          // its recovery revision are already durable.
        }
        const resultCheckpoint = adapter.checkpoint();
        input.store.storeDocumentRevision({
          id: DocumentRevisionIdSchema.parse(randomUUID()),
          ...documentScope,
          name: `Agent receipt ${receiptSuffix}`,
          ...resultCheckpoint,
          createdBy: request.principalId as never,
          createdByDeviceId: request.deviceId,
          correlationId: CorrelationIdSchema.parse(randomUUID()),
          createdAt: now(),
          restoredFromRevisionId: revisionId,
        });
        return {
          outcome: "success",
          revisionId,
          stateVectorSha256: createHash("sha256")
            .update(resultCheckpoint.stateVector)
            .digest("hex"),
          idempotentReplay: false,
        };
      } finally {
        adapter.destroy();
      }
    },
    restoreStructured: (request: {
      readonly documentId: DocumentId;
      readonly spaceId: SpaceId;
      readonly revisionId: string;
      readonly expectedStateVectorSha256: string;
      readonly idempotencyKey: string;
      readonly principalId: string;
      readonly runId: string;
      readonly deviceId: DeviceId;
    }):
      | {
          readonly outcome: "success";
          readonly recoveryRevisionId: DocumentRevisionId;
          readonly stateVectorSha256: string;
          readonly idempotentReplay: boolean;
        }
      | {
          readonly outcome: "conflict" | "rejected";
          readonly diagnosticCode: string;
        } => {
      const documentScope = scope(request.documentId, request.spaceId);
      const keyDigest = createHash("sha256")
        .update(request.idempotencyKey)
        .digest("base64url")
        .slice(0, 22);
      const requestDigest = createHash("sha256")
        .update(
          JSON.stringify({
            revisionId: request.revisionId,
            expectedStateVectorSha256: request.expectedStateVectorSha256,
          }),
        )
        .digest("base64url")
        .slice(0, 22);
      const receiptSuffix = `[${keyDigest}.${requestDigest}]`;
      const revisions = input.store.listDocumentRevisions(documentScope);
      const receipt = revisions.find(
        (revision) =>
          revision.name.startsWith("Agent restore receipt ") &&
          revision.name.endsWith(receiptSuffix),
      );
      if (receipt !== undefined) {
        if (receipt.restoredFromRevisionId === undefined)
          return {
            outcome: "rejected",
            diagnosticCode: "document.content_unavailable",
          };
        return {
          outcome: "success",
          recoveryRevisionId: receipt.restoredFromRevisionId,
          stateVectorSha256: createHash("sha256")
            .update(receipt.stateVector)
            .digest("hex"),
          idempotentReplay: true,
        };
      }
      const pending = revisions.find(
        (revision) =>
          revision.name.startsWith("Before agent structured restore ") &&
          revision.name.endsWith(receiptSuffix),
      );
      if (
        revisions.some(
          (revision) =>
            (revision.name.startsWith("Agent restore receipt ") ||
              revision.name.startsWith("Before agent structured restore ")) &&
            revision.name.includes(`[${keyDigest}.`) &&
            !revision.name.endsWith(receiptSuffix),
        )
      )
        return {
          outcome: "conflict",
          diagnosticCode: "document.idempotency_mismatch",
        };
      const target = revisions.find(
        (revision) => revision.id === request.revisionId,
      );
      const existing =
        input.store.loadDocumentCollaborationState(documentScope)?.state;
      if (target === undefined || existing === undefined)
        return {
          outcome: "rejected",
          diagnosticCode: "document.revision_unavailable",
        };
      const adapter = new YjsRealtimeDocumentAdapter(existing);
      try {
        const priorCheckpoint = adapter.checkpoint();
        const priorDigest = createHash("sha256")
          .update(priorCheckpoint.stateVector)
          .digest("hex");
        if (pending !== undefined) {
          const expected = new YjsRealtimeDocumentAdapter(existing);
          let expectedContentDigest: string;
          try {
            expected.restore(target, target.id);
            expectedContentDigest = createHash("sha256")
              .update(JSON.stringify(expected.getStructuredContent()))
              .digest("base64url")
              .slice(0, 22);
          } finally {
            expected.destroy();
          }
          const currentContentDigest = createHash("sha256")
            .update(JSON.stringify(adapter.getStructuredContent()))
            .digest("base64url")
            .slice(0, 22);
          if (currentContentDigest === expectedContentDigest) {
            const checkpoint = adapter.checkpoint();
            input.store.storeDocumentRevision({
              id: DocumentRevisionIdSchema.parse(randomUUID()),
              ...documentScope,
              name: `Agent restore receipt ${receiptSuffix}`,
              ...checkpoint,
              createdBy: request.principalId as never,
              createdByDeviceId: request.deviceId,
              correlationId: CorrelationIdSchema.parse(randomUUID()),
              createdAt: now(),
              restoredFromRevisionId: pending.id,
            });
            return {
              outcome: "success",
              recoveryRevisionId: pending.id,
              stateVectorSha256: createHash("sha256")
                .update(checkpoint.stateVector)
                .digest("hex"),
              idempotentReplay: true,
            };
          }
          const pendingDigest = createHash("sha256")
            .update(pending.stateVector)
            .digest("hex");
          if (
            priorDigest !== pendingDigest ||
            pendingDigest !== request.expectedStateVectorSha256
          )
            return {
              outcome: "conflict",
              diagnosticCode: "document.state_vector_stale",
            };
        } else if (priorDigest !== request.expectedStateVectorSha256)
          return {
            outcome: "conflict",
            diagnosticCode: "document.state_vector_stale",
          };
        let update: Uint8Array | undefined;
        const stop = adapter.onUpdate((value) => {
          update = value;
        });
        adapter.restore(target, target.id);
        stop();
        const recoveryRevisionId =
          pending?.id ?? DocumentRevisionIdSchema.parse(randomUUID());
        if (pending === undefined)
          input.store.storeDocumentRevision({
            id: recoveryRevisionId,
            ...documentScope,
            name: `Before agent structured restore (run ${request.runId.slice(0, 8)}) ${receiptSuffix}`,
            ...priorCheckpoint,
            createdBy: request.principalId as never,
            createdByDeviceId: request.deviceId,
            correlationId: CorrelationIdSchema.parse(randomUUID()),
            createdAt: now(),
            restoredFromRevisionId: target.id,
          });
        const state = adapter.encodeState();
        const updatedAt = now();
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
        try {
          input.store.replaceDocumentEntityLinks({
            ...documentScope,
            links: adapter.getEntityReferences(),
            updatedAt,
          });
          input.store.replaceDocumentSearchProjection({
            ...documentScope,
            body: adapter.getText(),
            stateDigest: createHash("sha256").update(state).digest("hex"),
            indexedAt: updatedAt,
          });
        } catch {
          // Rebuildable projections never invalidate a durable restore.
        }
        const resultCheckpoint = adapter.checkpoint();
        input.store.storeDocumentRevision({
          id: DocumentRevisionIdSchema.parse(randomUUID()),
          ...documentScope,
          name: `Agent restore receipt ${receiptSuffix}`,
          ...resultCheckpoint,
          createdBy: request.principalId as never,
          createdByDeviceId: request.deviceId,
          correlationId: CorrelationIdSchema.parse(randomUUID()),
          createdAt: now(),
          restoredFromRevisionId: recoveryRevisionId,
        });
        return {
          outcome: "success",
          recoveryRevisionId,
          stateVectorSha256: createHash("sha256")
            .update(resultCheckpoint.stateVector)
            .digest("hex"),
          idempotentReplay: false,
        };
      } finally {
        adapter.destroy();
      }
    },
  };
};
