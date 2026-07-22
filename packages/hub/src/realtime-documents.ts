import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import { Hocuspocus, type WebSocketLike } from "@hocuspocus/server";
import {
  CorrelationIdSchema,
  CollaborativeContentOwnerSchema,
  DocumentRevisionIdSchema,
  DeviceIdSchema,
  WorkspaceIdSchema,
  type DeviceId,
  type DocumentId,
  type DocumentRevisionId,
  type PrincipalId,
  type SpaceId,
  type WorkspaceId,
  type CorrelationId,
  type CollaborativeContentOwner,
} from "@constellation/contracts";
import {
  type DocumentContentFormat,
  type StructuredDocument,
  MAX_DOCUMENT_UPDATE_BYTES,
  MAX_DOCUMENT_TEXT_LENGTH,
  YjsRealtimeDocumentAdapter,
  createRichDocumentSeed,
  documentPlainText,
  documentEntityReferences,
  documentContentFormat,
  parseStructuredDocument,
  replaceStructuredDocumentInYjs,
  structuredDocumentFromYjs,
  restoreDocumentFromCheckpoint,
} from "@constellation/realtime-documents";
import crossws from "crossws/adapters/node";
import * as Y from "yjs";

import type { HubRepository } from "./repository.js";
import type { HubService } from "./service.js";

const SESSION_TTL_MS = 5 * 60_000;
const MAX_AWARENESS_BYTES = 8_192;
const MAX_DEVICE_SESSIONS = 64;
const MAX_GATEWAY_SESSIONS = 10_000;
const MAX_NAMED_REVISIONS = 500;

interface DocumentSession {
  readonly token: string;
  readonly credential: string;
  readonly workspaceId: WorkspaceId;
  readonly deviceId: DeviceId;
  readonly owner: CollaborativeContentOwner;
  readonly principalId: PrincipalId;
  readonly spaceId: SpaceId;
  readonly access: "view" | "comment" | "edit";
  readonly supportedDocumentFormats: readonly DocumentContentFormat[];
  readonly expiresAt: string;
}

interface ConnectionContext {
  readonly sessionToken: string;
  readonly workspaceId: WorkspaceId;
  readonly deviceId: DeviceId;
  readonly owner: CollaborativeContentOwner;
  readonly principalId: PrincipalId;
  readonly spaceId: SpaceId;
}

const contentOwnerId = (owner: CollaborativeContentOwner): string =>
  owner.kind === "document" ? owner.documentId : owner.projectId;

type AuthorizedContentAddress = {
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
} & (
  | { readonly owner: CollaborativeContentOwner }
  | { readonly documentId: DocumentId }
);

const authorizedContentOwner = (
  input: AuthorizedContentAddress,
): CollaborativeContentOwner =>
  "owner" in input
    ? input.owner
    : { kind: "document", documentId: input.documentId };

const roomName = (
  workspaceId: WorkspaceId,
  owner: CollaborativeContentOwner,
): string => `${workspaceId}/${owner.kind}/${contentOwnerId(owner)}`;

const parseRoomName = (
  name: string,
): { workspaceId: WorkspaceId; owner: CollaborativeContentOwner } => {
  const [rawWorkspaceId, rawOwnerKind, rawOwnerId, extra] = name.split("/");
  if (extra !== undefined) throw new Error("DOCUMENT_ROOM_INVALID");
  return {
    workspaceId: WorkspaceIdSchema.parse(rawWorkspaceId),
    owner: CollaborativeContentOwnerSchema.parse(
      rawOwnerKind === "document"
        ? { kind: "document", documentId: rawOwnerId }
        : { kind: rawOwnerKind, projectId: rawOwnerId },
    ),
  };
};

export interface RealtimeDocumentSessionResult {
  readonly token: string;
  readonly room: string;
  readonly expiresAt: string;
  readonly access: "view" | "comment" | "edit";
  readonly documentFormat: DocumentContentFormat;
}

const formatFromState = (
  state: Uint8Array | undefined,
): DocumentContentFormat => {
  if (state === undefined) return "plain-v1";
  const adapter = new YjsRealtimeDocumentAdapter(state);
  try {
    return adapter.getFormat();
  } finally {
    adapter.destroy();
  }
};

export class RealtimeDocumentGateway {
  private readonly sessions = new Map<string, DocumentSession>();
  private readonly roomSpaces = new Map<string, SpaceId>();
  private readonly hocuspocus: Hocuspocus<ConnectionContext>;
  private mounted = false;

  public constructor(
    private readonly service: HubService,
    private readonly repository: HubRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.hocuspocus = new Hocuspocus<ConnectionContext>({
      debounce: 500,
      maxDebounce: 2_000,
      timeout: 30_000,
      maxUnauthenticatedQueueSize: 64 * 1024,
      maxUnauthenticatedQueueMessages: 16,
      maxPendingDocuments: 1,
      onAuthenticate: async (data) => {
        const session = this.sessions.get(data.token);
        if (
          session === undefined ||
          Date.parse(session.expiresAt) <= Date.parse(this.now()) ||
          data.documentName !== roomName(session.workspaceId, session.owner)
        ) {
          throw new Error("DOCUMENT_SESSION_INVALID");
        }
        const current =
          await this.service.authorizeCollaborativeContent(session);
        if (current.outcome === "rejected") {
          this.sessions.delete(session.token);
          throw new Error("DOCUMENT_SESSION_INVALID");
        }
        const stored =
          await this.repository.loadCollaborativeContentState(session);
        if (
          !session.supportedDocumentFormats.includes(
            formatFromState(stored?.state),
          )
        ) {
          this.sessions.delete(session.token);
          throw new Error("DOCUMENT_SCHEMA_UPGRADE_REQUIRED");
        }
        data.connectionConfig.readOnly = current.access !== "edit";
        this.roomSpaces.set(data.documentName, current.spaceId);
        return {
          sessionToken: session.token,
          workspaceId: session.workspaceId,
          deviceId: session.deviceId,
          owner: session.owner,
          principalId: current.principalId,
          spaceId: current.spaceId,
        };
      },
      beforeHandleMessage: async (data) => {
        if (data.update.byteLength > MAX_DOCUMENT_UPDATE_BYTES) {
          throw new Error("DOCUMENT_UPDATE_SIZE_INVALID");
        }
        const session = this.sessions.get(data.context.sessionToken);
        if (
          session === undefined ||
          Date.parse(session.expiresAt) <= Date.parse(this.now())
        ) {
          if (session !== undefined) this.sessions.delete(session.token);
          throw new Error("DOCUMENT_SESSION_INVALID");
        }
        const current =
          await this.service.authorizeCollaborativeContent(session);
        if (current.outcome === "rejected") {
          this.sessions.delete(session.token);
          throw new Error("DOCUMENT_SESSION_INVALID");
        }
        if (
          !session.supportedDocumentFormats.includes(
            formatFromState(Y.encodeStateAsUpdate(data.document)),
          )
        ) {
          this.sessions.delete(session.token);
          throw new Error("DOCUMENT_SCHEMA_UPGRADE_REQUIRED");
        }
        data.connection.readOnly = current.access !== "edit";
      },
      beforeHandleAwareness: async (data) => {
        if (data.context !== undefined) {
          const session = this.sessions.get(data.context.sessionToken);
          if (
            session === undefined ||
            Date.parse(session.expiresAt) <= Date.parse(this.now()) ||
            (await this.service.authorizeCollaborativeContent(session))
              .outcome === "rejected"
          ) {
            if (session !== undefined) this.sessions.delete(session.token);
            throw new Error("DOCUMENT_SESSION_INVALID");
          }
        }
        if (
          data.states.size > 50 ||
          Buffer.byteLength(JSON.stringify([...data.states.values()])) >
            MAX_AWARENESS_BYTES
        ) {
          throw new Error("DOCUMENT_AWARENESS_SIZE_INVALID");
        }
      },
      onChange: async (data) => {
        const state = Y.encodeStateAsUpdate(data.document);
        if (
          state.byteLength > MAX_DOCUMENT_UPDATE_BYTES ||
          documentPlainText(data.document).length > MAX_DOCUMENT_TEXT_LENGTH
        ) {
          this.hocuspocus.closeConnections(data.documentName);
          throw new Error("DOCUMENT_STATE_SIZE_INVALID");
        }
      },
      onLoadDocument: async (data) => {
        const room = parseRoomName(data.documentName);
        const stored =
          await this.repository.loadCollaborativeContentState(room);
        const document = new Y.Doc({ gc: true });
        if (stored !== undefined) Y.applyUpdate(document, stored.state);
        return document;
      },
      onStoreDocument: async (data) => {
        const room = parseRoomName(data.documentName);
        const spaceId = this.roomSpaces.get(data.documentName);
        if (spaceId === undefined) throw new Error("DOCUMENT_SCOPE_MISSING");
        const state = Y.encodeStateAsUpdate(data.document);
        if (state.byteLength > MAX_DOCUMENT_UPDATE_BYTES) {
          throw new Error("DOCUMENT_UPDATE_SIZE_INVALID");
        }
        await this.repository.storeCollaborativeContentState({
          ...room,
          spaceId,
          engine: "yjs-13",
          state,
          updatedAt: this.now(),
        });
      },
      afterUnloadDocument: async (data) => {
        this.roomSpaces.delete(data.documentName);
      },
    });
  }

  private async createOwnerSession(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly owner: CollaborativeContentOwner;
    readonly supportedDocumentFormats: readonly DocumentContentFormat[];
  }): Promise<RealtimeDocumentSessionResult | "upgrade_required" | undefined> {
    const authorization =
      await this.service.authorizeCollaborativeContent(input);
    if (authorization.outcome === "rejected") return undefined;
    let stored = await this.repository.loadCollaborativeContentState(input);
    if (
      stored === undefined &&
      input.owner.kind === "project" &&
      authorization.initialText !== undefined &&
      authorization.contentCreatedBy !== undefined
    ) {
      const state = createRichDocumentSeed(
        authorization.initialText,
        createHash("sha256").update(authorization.initialText).digest("hex"),
        {
          kind: "human",
          principalId: authorization.contentCreatedBy,
        },
      );
      await this.repository.seedCollaborativeContentState({
        workspaceId: input.workspaceId,
        owner: input.owner,
        spaceId: authorization.spaceId,
        engine: "yjs-13",
        state,
        updatedAt: this.now(),
      });
      stored = await this.repository.loadCollaborativeContentState(input);
    }
    const documentFormat = formatFromState(stored?.state);
    if (!input.supportedDocumentFormats.includes(documentFormat)) {
      return "upgrade_required";
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.parse(this.now()) + SESSION_TTL_MS,
    ).toISOString();
    const session: DocumentSession = {
      token,
      ...input,
      principalId: authorization.principalId,
      spaceId: authorization.spaceId,
      access: authorization.access,
      supportedDocumentFormats: input.supportedDocumentFormats,
      expiresAt,
    };
    for (const [existingToken, existing] of this.sessions) {
      if (
        existing.workspaceId === input.workspaceId &&
        existing.deviceId === input.deviceId &&
        existing.owner.kind === input.owner.kind &&
        contentOwnerId(existing.owner) === contentOwnerId(input.owner)
      ) {
        this.sessions.delete(existingToken);
      } else if (Date.parse(existing.expiresAt) <= Date.parse(this.now())) {
        this.sessions.delete(existingToken);
      }
    }
    const deviceSessions = [...this.sessions].filter(
      ([, existing]) =>
        existing.workspaceId === input.workspaceId &&
        existing.deviceId === input.deviceId,
    );
    while (deviceSessions.length >= MAX_DEVICE_SESSIONS) {
      const oldest = deviceSessions.shift();
      if (oldest !== undefined) this.sessions.delete(oldest[0]);
    }
    while (this.sessions.size >= MAX_GATEWAY_SESSIONS) {
      const oldestToken = this.sessions.keys().next().value as
        string | undefined;
      if (oldestToken === undefined) break;
      this.sessions.delete(oldestToken);
    }
    this.sessions.set(token, session);
    return {
      token,
      room: roomName(input.workspaceId, input.owner),
      expiresAt,
      access: authorization.access,
      documentFormat,
    };
  }

  public createSession(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
    readonly supportedDocumentFormats: readonly DocumentContentFormat[];
  }): Promise<RealtimeDocumentSessionResult | "upgrade_required" | undefined> {
    return this.createOwnerSession({
      ...input,
      owner: { kind: "document", documentId: input.documentId },
    });
  }

  public createContentSession(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly owner: CollaborativeContentOwner;
    readonly supportedDocumentFormats: readonly DocumentContentFormat[];
  }): Promise<RealtimeDocumentSessionResult | "upgrade_required" | undefined> {
    return this.createOwnerSession(input);
  }

  private async createOwnerRevision(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly owner: CollaborativeContentOwner;
    readonly name: string;
    readonly correlationId: CorrelationId;
    readonly restoredFromRevisionId?: DocumentRevisionId;
  }): Promise<DocumentRevisionId | undefined> {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 120) return undefined;
    const authorization =
      await this.service.authorizeCollaborativeContent(input);
    if (
      authorization.outcome === "rejected" ||
      authorization.access !== "edit"
    ) {
      return undefined;
    }
    if (
      (await this.repository.listCollaborativeContentRevisions(input)).length >=
      MAX_NAMED_REVISIONS
    ) {
      return undefined;
    }
    const room = roomName(input.workspaceId, input.owner);
    this.roomSpaces.set(room, authorization.spaceId);
    const connection = await this.hocuspocus.openDirectConnection(room, {
      sessionToken: "direct",
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      owner: input.owner,
      principalId: authorization.principalId,
      spaceId: authorization.spaceId,
    });
    let state: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let stateVector: Uint8Array<ArrayBufferLike> = new Uint8Array();
    try {
      await connection.transact((document) => {
        state = Y.encodeStateAsUpdate(document);
        stateVector = Y.encodeStateVector(document);
      });
    } finally {
      await connection.disconnect({ unloadImmediately: true });
    }
    const id = DocumentRevisionIdSchema.parse(randomUUID());
    await this.repository.createCollaborativeContentRevision({
      id,
      workspaceId: input.workspaceId,
      owner: input.owner,
      spaceId: authorization.spaceId,
      name,
      engine: "yjs-13",
      state,
      stateVector,
      createdBy: authorization.principalId,
      createdByDeviceId: input.deviceId,
      correlationId: input.correlationId,
      createdAt: this.now(),
      ...(input.restoredFromRevisionId === undefined
        ? {}
        : { restoredFromRevisionId: input.restoredFromRevisionId }),
    });
    return id;
  }

  public createRevision(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
    readonly name: string;
    readonly correlationId: CorrelationId;
    readonly restoredFromRevisionId?: DocumentRevisionId;
  }): Promise<DocumentRevisionId | undefined> {
    return this.createOwnerRevision({
      ...input,
      owner: { kind: "document", documentId: input.documentId },
    });
  }

  public createContentRevision(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly owner: CollaborativeContentOwner;
    readonly name: string;
    readonly correlationId: CorrelationId;
    readonly restoredFromRevisionId?: DocumentRevisionId;
  }): Promise<DocumentRevisionId | undefined> {
    return this.createOwnerRevision(input);
  }

  private async restoreOwnerRevision(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly owner: CollaborativeContentOwner;
    readonly revisionId: DocumentRevisionId;
    readonly correlationId: CorrelationId;
  }): Promise<boolean> {
    const authorization =
      await this.service.authorizeCollaborativeContent(input);
    if (
      authorization.outcome === "rejected" ||
      authorization.access !== "edit"
    ) {
      return false;
    }
    const revision = (
      await this.repository.listCollaborativeContentRevisions(input)
    ).find((candidate) => candidate.id === input.revisionId);
    if (revision === undefined) return false;
    const room = roomName(input.workspaceId, input.owner);
    this.roomSpaces.set(room, authorization.spaceId);
    const connection = await this.hocuspocus.openDirectConnection(room, {
      sessionToken: "direct",
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      owner: input.owner,
      principalId: authorization.principalId,
      spaceId: authorization.spaceId,
    });
    try {
      await connection.transact((document) => {
        restoreDocumentFromCheckpoint(
          document,
          {
            engine: revision.engine,
            state: revision.state,
            stateVector: revision.stateVector,
          },
          revision.id,
        );
      });
    } finally {
      await connection.disconnect({ unloadImmediately: true });
    }
    await this.createOwnerRevision({
      credential: input.credential,
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      owner: input.owner,
      name: `Restored ${revision.name}`,
      correlationId: input.correlationId,
      restoredFromRevisionId: revision.id,
    });
    return true;
  }

  public restoreRevision(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
    readonly revisionId: DocumentRevisionId;
    readonly correlationId: CorrelationId;
  }): Promise<boolean> {
    return this.restoreOwnerRevision({
      ...input,
      owner: { kind: "document", documentId: input.documentId },
    });
  }

  public restoreContentRevision(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly owner: CollaborativeContentOwner;
    readonly revisionId: DocumentRevisionId;
    readonly correlationId: CorrelationId;
  }): Promise<boolean> {
    return this.restoreOwnerRevision(input);
  }

  private async listOwnerRevisions(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly owner: CollaborativeContentOwner;
  }) {
    const authorization =
      await this.service.authorizeCollaborativeContent(input);
    if (authorization.outcome === "rejected") return undefined;
    return (
      await this.repository.listCollaborativeContentRevisions(input)
    ).slice(0, MAX_NAMED_REVISIONS);
  }

  public listRevisions(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
  }) {
    return this.listOwnerRevisions({
      ...input,
      owner: { kind: "document", documentId: input.documentId },
    });
  }

  public listContentRevisions(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly owner: CollaborativeContentOwner;
  }) {
    return this.listOwnerRevisions(input);
  }

  /**
   * Trusted remote-MCP port. The caller reauthorizes the current grant and
   * Space immediately before calling; this gateway independently verifies the
   * persisted document scope and owns all Yjs/revision mechanics.
   */
  public async readStructuredAuthorized(
    input: AuthorizedContentAddress,
  ): Promise<
    | {
        readonly content: StructuredDocument;
        readonly text: string;
        readonly entityReferences: ReturnType<typeof documentEntityReferences>;
        readonly stateVectorSha256: string;
      }
    | undefined
  > {
    const owner = authorizedContentOwner(input);
    const stored = await this.repository.loadCollaborativeContentState({
      workspaceId: input.workspaceId,
      owner,
    });
    if (
      stored === undefined ||
      stored.spaceId !== input.spaceId ||
      formatFromState(stored.state) !== "rich-v1"
    )
      return undefined;
    const document = new Y.Doc({ gc: true });
    try {
      Y.applyUpdate(document, stored.state);
      return {
        content: structuredDocumentFromYjs(document),
        text: documentPlainText(document),
        entityReferences: documentEntityReferences(document),
        stateVectorSha256: createHash("sha256")
          .update(Y.encodeStateVector(document))
          .digest("hex"),
      };
    } finally {
      document.destroy();
    }
  }

  public async replaceStructuredAuthorized(
    input: AuthorizedContentAddress & {
      readonly principalId: PrincipalId;
      readonly credentialId: string;
      readonly runId: string;
      readonly expectedStateVectorSha256: string;
      readonly idempotencyKey: string;
      readonly content: unknown;
    },
  ): Promise<
    | {
        readonly outcome: "success";
        readonly revisionId: DocumentRevisionId;
        readonly stateVectorSha256: string;
        readonly idempotentReplay: boolean;
      }
    | {
        readonly outcome: "conflict" | "rejected";
        readonly diagnosticCode: string;
      }
  > {
    const owner = authorizedContentOwner(input);
    const digest = (value: string): string =>
      createHash("sha256").update(value).digest("base64url").slice(0, 22);
    const keyDigest = digest(input.idempotencyKey);
    let content: StructuredDocument;
    try {
      content = parseStructuredDocument(input.content);
    } catch {
      return {
        outcome: "rejected",
        diagnosticCode: "document.structured_content_invalid",
      };
    }
    const requestDigest = digest(
      JSON.stringify({
        content,
        expectedStateVectorSha256: input.expectedStateVectorSha256,
      }),
    );
    const receiptSuffix = `[${keyDigest}.${requestDigest}]`;
    const revisionScope = { workspaceId: input.workspaceId, owner };
    const revisions =
      await this.repository.listCollaborativeContentRevisions(revisionScope);
    const existingReceipt = revisions.find(
      (revision) =>
        revision.name.startsWith("Agent receipt ") &&
        revision.name.endsWith(receiptSuffix),
    );
    if (existingReceipt !== undefined) {
      const current = await this.readStructuredAuthorized(input);
      return current === undefined ||
        existingReceipt.restoredFromRevisionId === undefined
        ? {
            outcome: "rejected",
            diagnosticCode: "document.content_unavailable",
          }
        : {
            outcome: "success",
            revisionId: existingReceipt.restoredFromRevisionId,
            stateVectorSha256: createHash("sha256")
              .update(existingReceipt.stateVector)
              .digest("hex"),
            idempotentReplay: true,
          };
    }
    const pending = revisions.find(
      (revision) =>
        revision.name.startsWith("Before agent structured write ") &&
        revision.name.endsWith(receiptSuffix),
    );
    const keyCollision = revisions.some(
      (revision) =>
        (revision.name.startsWith("Agent receipt ") ||
          revision.name.startsWith("Before agent structured write ")) &&
        revision.name.includes(`[${keyDigest}.`) &&
        !revision.name.endsWith(receiptSuffix),
    );
    if (keyCollision)
      return {
        outcome: "conflict",
        diagnosticCode: "document.idempotency_mismatch",
      };
    if (
      revisions.length >=
      MAX_NAMED_REVISIONS - (pending === undefined ? 1 : 0)
    )
      return {
        outcome: "rejected",
        diagnosticCode: "document.revision_limit_reached",
      };

    const stored =
      await this.repository.loadCollaborativeContentState(revisionScope);
    if (stored === undefined || stored.spaceId !== input.spaceId)
      return {
        outcome: "rejected",
        diagnosticCode: "document.content_unavailable",
      };
    if (formatFromState(stored.state) !== "rich-v1")
      return {
        outcome: "rejected",
        diagnosticCode: "document.schema_upgrade_required",
      };
    // Validate before creating a recovery revision.
    const validation = new YjsRealtimeDocumentAdapter(stored.state);
    try {
      validation.replaceStructuredContent(content, {
        kind: "agent",
        principalId: input.principalId,
        runId: input.runId,
      });
    } catch {
      return {
        outcome: "rejected",
        diagnosticCode: "document.structured_content_invalid",
      };
    } finally {
      validation.destroy();
    }

    const room = roomName(input.workspaceId, owner);
    this.roomSpaces.set(room, input.spaceId);
    const connection = await this.hocuspocus.openDirectConnection(room, {
      sessionToken: "direct-agent",
      workspaceId: input.workspaceId,
      deviceId: DeviceIdSchema.parse(input.credentialId),
      owner,
      principalId: input.principalId,
      spaceId: input.spaceId,
    });
    let priorState: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let priorStateVector: Uint8Array<ArrayBufferLike> = new Uint8Array();
    try {
      await connection.transact((document) => {
        if (documentContentFormat(document) !== "rich-v1") return;
        priorState = Y.encodeStateAsUpdate(document);
        priorStateVector = Y.encodeStateVector(document);
      });
      const priorDigest = createHash("sha256")
        .update(priorStateVector)
        .digest("hex");
      if (pending !== undefined) {
        const current = new YjsRealtimeDocumentAdapter(priorState);
        let currentContentDigest: string;
        try {
          currentContentDigest = digest(
            JSON.stringify(current.getStructuredContent()),
          );
        } finally {
          current.destroy();
        }
        if (currentContentDigest === digest(JSON.stringify(content))) {
          await this.repository.createCollaborativeContentRevision({
            id: DocumentRevisionIdSchema.parse(randomUUID()),
            workspaceId: input.workspaceId,
            owner,
            spaceId: input.spaceId,
            name: `Agent receipt ${receiptSuffix}`,
            engine: "yjs-13",
            state: priorState,
            stateVector: priorStateVector,
            createdBy: input.principalId,
            createdByDeviceId: DeviceIdSchema.parse(input.credentialId),
            correlationId: CorrelationIdSchema.parse(randomUUID()),
            createdAt: this.now(),
            restoredFromRevisionId: pending.id,
          });
          return {
            outcome: "success",
            revisionId: pending.id,
            stateVectorSha256: priorDigest,
            idempotentReplay: true,
          };
        }
        const pendingDigest = createHash("sha256")
          .update(pending.stateVector)
          .digest("hex");
        if (
          priorDigest !== pendingDigest ||
          pendingDigest !== input.expectedStateVectorSha256
        )
          return {
            outcome: "conflict",
            diagnosticCode: "document.state_vector_stale",
          };
      } else if (priorDigest !== input.expectedStateVectorSha256)
        return {
          outcome: "conflict",
          diagnosticCode: "document.state_vector_stale",
        };
      const revisionId =
        pending?.id ?? DocumentRevisionIdSchema.parse(randomUUID());
      if (pending === undefined)
        await this.repository.createCollaborativeContentRevision({
          id: revisionId,
          workspaceId: input.workspaceId,
          owner,
          spaceId: input.spaceId,
          name: `Before agent structured write (run ${input.runId.slice(0, 8)}) ${receiptSuffix}`,
          engine: "yjs-13",
          state: priorState,
          stateVector: priorStateVector,
          createdBy: input.principalId,
          createdByDeviceId: DeviceIdSchema.parse(input.credentialId),
          correlationId: CorrelationIdSchema.parse(randomUUID()),
          createdAt: this.now(),
        });
      let stateVectorSha256 = "";
      let resultingState: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      let resultingStateVector: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      let stale = false;
      await connection.transact((document) => {
        const currentDigest = createHash("sha256")
          .update(Y.encodeStateVector(document))
          .digest("hex");
        if (currentDigest !== input.expectedStateVectorSha256) {
          stale = true;
          return;
        }
        replaceStructuredDocumentInYjs(document, content, {
          kind: "agent",
          principalId: input.principalId,
          runId: input.runId,
        });
        resultingState = Y.encodeStateAsUpdate(document);
        resultingStateVector = Y.encodeStateVector(document);
        stateVectorSha256 = createHash("sha256")
          .update(resultingStateVector)
          .digest("hex");
      });
      if (stale)
        return {
          outcome: "conflict",
          diagnosticCode: "document.state_vector_stale",
        };
      await this.repository.createCollaborativeContentRevision({
        id: DocumentRevisionIdSchema.parse(randomUUID()),
        workspaceId: input.workspaceId,
        owner,
        spaceId: input.spaceId,
        name: `Agent receipt ${receiptSuffix}`,
        engine: "yjs-13",
        state: resultingState,
        stateVector: resultingStateVector,
        createdBy: input.principalId,
        createdByDeviceId: DeviceIdSchema.parse(input.credentialId),
        correlationId: CorrelationIdSchema.parse(randomUUID()),
        createdAt: this.now(),
        restoredFromRevisionId: revisionId,
      });
      return {
        outcome: "success",
        revisionId,
        stateVectorSha256,
        idempotentReplay: false,
      };
    } finally {
      await connection.disconnect({ unloadImmediately: true });
    }
  }

  public async restoreStructuredAuthorized(
    input: AuthorizedContentAddress & {
      readonly principalId: PrincipalId;
      readonly credentialId: string;
      readonly runId: string;
      readonly revisionId: DocumentRevisionId;
      readonly expectedStateVectorSha256: string;
      readonly idempotencyKey: string;
    },
  ): Promise<
    | {
        readonly outcome: "success";
        readonly recoveryRevisionId: DocumentRevisionId;
        readonly stateVectorSha256: string;
        readonly idempotentReplay: boolean;
      }
    | {
        readonly outcome: "conflict" | "rejected";
        readonly diagnosticCode: string;
      }
  > {
    const owner = authorizedContentOwner(input);
    const digest = (value: string): string =>
      createHash("sha256").update(value).digest("base64url").slice(0, 22);
    const keyDigest = digest(input.idempotencyKey);
    const requestDigest = digest(
      JSON.stringify({
        revisionId: input.revisionId,
        expectedStateVectorSha256: input.expectedStateVectorSha256,
      }),
    );
    const receiptSuffix = `[${keyDigest}.${requestDigest}]`;
    const revisionScope = { workspaceId: input.workspaceId, owner };
    const revisions =
      await this.repository.listCollaborativeContentRevisions(revisionScope);
    const receipt = revisions.find(
      (revision) =>
        revision.name.startsWith("Agent restore receipt ") &&
        revision.name.endsWith(receiptSuffix),
    );
    if (receipt !== undefined) {
      const current = await this.readStructuredAuthorized(input);
      return current === undefined ||
        receipt.restoredFromRevisionId === undefined
        ? {
            outcome: "rejected",
            diagnosticCode: "document.content_unavailable",
          }
        : {
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
      (revision) =>
        revision.id === input.revisionId && revision.spaceId === input.spaceId,
    );
    if (target === undefined)
      return {
        outcome: "rejected",
        diagnosticCode: "document.revision_unavailable",
      };
    if (
      revisions.length >=
      MAX_NAMED_REVISIONS - (pending === undefined ? 1 : 0)
    )
      return {
        outcome: "rejected",
        diagnosticCode: "document.revision_limit_reached",
      };
    const room = roomName(input.workspaceId, owner);
    this.roomSpaces.set(room, input.spaceId);
    const deviceId = DeviceIdSchema.parse(input.credentialId);
    const connection = await this.hocuspocus.openDirectConnection(room, {
      sessionToken: "direct-agent-restore",
      workspaceId: input.workspaceId,
      deviceId,
      owner,
      principalId: input.principalId,
      spaceId: input.spaceId,
    });
    let priorState: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let priorStateVector: Uint8Array<ArrayBufferLike> = new Uint8Array();
    try {
      await connection.transact((document) => {
        priorState = Y.encodeStateAsUpdate(document);
        priorStateVector = Y.encodeStateVector(document);
      });
      const priorDigest = createHash("sha256")
        .update(priorStateVector)
        .digest("hex");
      if (pending !== undefined) {
        const current = new YjsRealtimeDocumentAdapter(priorState);
        const expected = new YjsRealtimeDocumentAdapter(priorState);
        let currentContentDigest: string;
        let expectedContentDigest: string;
        try {
          currentContentDigest = digest(
            JSON.stringify(current.getStructuredContent()),
          );
          expected.restore(target, target.id);
          expectedContentDigest = digest(
            JSON.stringify(expected.getStructuredContent()),
          );
        } finally {
          current.destroy();
          expected.destroy();
        }
        if (currentContentDigest === expectedContentDigest) {
          await this.repository.createCollaborativeContentRevision({
            id: DocumentRevisionIdSchema.parse(randomUUID()),
            workspaceId: input.workspaceId,
            owner,
            spaceId: input.spaceId,
            name: `Agent restore receipt ${receiptSuffix}`,
            engine: "yjs-13",
            state: priorState,
            stateVector: priorStateVector,
            createdBy: input.principalId,
            createdByDeviceId: deviceId,
            correlationId: CorrelationIdSchema.parse(randomUUID()),
            createdAt: this.now(),
            restoredFromRevisionId: pending.id,
          });
          return {
            outcome: "success",
            recoveryRevisionId: pending.id,
            stateVectorSha256: priorDigest,
            idempotentReplay: true,
          };
        }
        const pendingDigest = createHash("sha256")
          .update(pending.stateVector)
          .digest("hex");
        if (
          priorDigest !== pendingDigest ||
          pendingDigest !== input.expectedStateVectorSha256
        )
          return {
            outcome: "conflict",
            diagnosticCode: "document.state_vector_stale",
          };
      } else if (priorDigest !== input.expectedStateVectorSha256)
        return {
          outcome: "conflict",
          diagnosticCode: "document.state_vector_stale",
        };
      const recoveryRevisionId =
        pending?.id ?? DocumentRevisionIdSchema.parse(randomUUID());
      if (pending === undefined)
        await this.repository.createCollaborativeContentRevision({
          id: recoveryRevisionId,
          workspaceId: input.workspaceId,
          owner,
          spaceId: input.spaceId,
          name: `Before agent structured restore (run ${input.runId.slice(0, 8)}) ${receiptSuffix}`,
          engine: "yjs-13",
          state: priorState,
          stateVector: priorStateVector,
          createdBy: input.principalId,
          createdByDeviceId: deviceId,
          correlationId: CorrelationIdSchema.parse(randomUUID()),
          createdAt: this.now(),
          restoredFromRevisionId: target.id,
        });
      let stale = false;
      let resultingState: Uint8Array<ArrayBufferLike> = new Uint8Array();
      let resultingStateVector: Uint8Array<ArrayBufferLike> = new Uint8Array();
      await connection.transact((document) => {
        const currentDigest = createHash("sha256")
          .update(Y.encodeStateVector(document))
          .digest("hex");
        if (currentDigest !== input.expectedStateVectorSha256) {
          stale = true;
          return;
        }
        restoreDocumentFromCheckpoint(
          document,
          {
            engine: target.engine,
            state: target.state,
            stateVector: target.stateVector,
          },
          target.id,
        );
        resultingState = Y.encodeStateAsUpdate(document);
        resultingStateVector = Y.encodeStateVector(document);
      });
      if (stale)
        return {
          outcome: "conflict",
          diagnosticCode: "document.state_vector_stale",
        };
      await this.repository.createCollaborativeContentRevision({
        id: DocumentRevisionIdSchema.parse(randomUUID()),
        workspaceId: input.workspaceId,
        owner,
        spaceId: input.spaceId,
        name: `Agent restore receipt ${receiptSuffix}`,
        engine: "yjs-13",
        state: resultingState,
        stateVector: resultingStateVector,
        createdBy: input.principalId,
        createdByDeviceId: deviceId,
        correlationId: CorrelationIdSchema.parse(randomUUID()),
        createdAt: this.now(),
        restoredFromRevisionId: recoveryRevisionId,
      });
      return {
        outcome: "success",
        recoveryRevisionId,
        stateVectorSha256: createHash("sha256")
          .update(resultingStateVector)
          .digest("hex"),
        idempotentReplay: false,
      };
    } finally {
      await connection.disconnect({ unloadImmediately: true });
    }
  }

  public mount(server: HttpServer): void {
    if (this.mounted) throw new Error("Realtime gateway is already mounted.");
    this.mounted = true;
    const clients = new WeakMap<
      object,
      ReturnType<Hocuspocus<ConnectionContext>["handleConnection"]>
    >();
    const adapter = crossws({
      hooks: {
        open: (peer) => {
          const connection = this.hocuspocus.handleConnection(
            peer.websocket as unknown as WebSocketLike,
            peer.request as Request,
          );
          clients.set(peer as object, connection);
        },
        message: (peer, message) => {
          void clients.get(peer as object)?.handleMessage(message.uint8Array());
        },
        close: (peer, event) => {
          clients.get(peer as object)?.handleClose({
            code: event.code ?? 1000,
            reason: event.reason ?? "",
          });
          clients.delete(peer as object);
        },
        error: (peer) => {
          clients.delete(peer as object);
        },
      },
    });
    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://hub.invalid");
      if (url.pathname !== "/v1/realtime") {
        socket.destroy();
        return;
      }
      adapter.handleUpgrade(request, socket, head);
    });
  }

  public revokeDocument(
    documentId: DocumentId,
    workspaceId: WorkspaceId,
  ): void {
    this.revokeContent({ kind: "document", documentId }, workspaceId);
  }

  public revokeContent(
    owner: CollaborativeContentOwner,
    workspaceId: WorkspaceId,
  ): void {
    for (const [token, session] of this.sessions) {
      if (
        session.owner.kind === owner.kind &&
        contentOwnerId(session.owner) === contentOwnerId(owner) &&
        session.workspaceId === workspaceId
      ) {
        this.sessions.delete(token);
      }
    }
    this.hocuspocus.closeConnections(roomName(workspaceId, owner));
  }

  public async reauthorizeSessions(): Promise<void> {
    const roomsToClose = new Set<string>();
    for (const [token, session] of this.sessions) {
      const expired = Date.parse(session.expiresAt) <= Date.parse(this.now());
      const current = expired
        ? undefined
        : await this.service.authorizeCollaborativeContent(session);
      if (current === undefined || current.outcome === "rejected") {
        this.sessions.delete(token);
        roomsToClose.add(roomName(session.workspaceId, session.owner));
        continue;
      }
      if (
        current.access !== session.access ||
        current.spaceId !== session.spaceId ||
        current.principalId !== session.principalId
      ) {
        this.sessions.delete(token);
        roomsToClose.add(roomName(session.workspaceId, session.owner));
      }
    }
    for (const room of roomsToClose) this.hocuspocus.closeConnections(room);
  }

  public async close(): Promise<void> {
    this.sessions.clear();
    this.hocuspocus.closeConnections();
    await Promise.all(
      [...this.hocuspocus.documents.values()].map((document) =>
        this.hocuspocus.unloadDocument(document),
      ),
    );
  }
}
