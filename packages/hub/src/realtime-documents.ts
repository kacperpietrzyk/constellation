import { randomBytes, randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import { Hocuspocus, type WebSocketLike } from "@hocuspocus/server";
import {
  DocumentIdSchema,
  DocumentRevisionIdSchema,
  WorkspaceIdSchema,
  type DeviceId,
  type DocumentId,
  type DocumentRevisionId,
  type PrincipalId,
  type SpaceId,
  type WorkspaceId,
  type CorrelationId,
} from "@constellation/contracts";
import {
  type DocumentContentFormat,
  MAX_DOCUMENT_UPDATE_BYTES,
  MAX_DOCUMENT_TEXT_LENGTH,
  YjsRealtimeDocumentAdapter,
  documentPlainText,
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
  readonly documentId: DocumentId;
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
  readonly documentId: DocumentId;
  readonly principalId: PrincipalId;
  readonly spaceId: SpaceId;
}

const roomName = (workspaceId: WorkspaceId, documentId: DocumentId): string =>
  `${workspaceId}/${documentId}`;

const parseRoomName = (
  name: string,
): { workspaceId: WorkspaceId; documentId: DocumentId } => {
  const [rawWorkspaceId, rawDocumentId, extra] = name.split("/");
  if (extra !== undefined) throw new Error("DOCUMENT_ROOM_INVALID");
  return {
    workspaceId: WorkspaceIdSchema.parse(rawWorkspaceId),
    documentId: DocumentIdSchema.parse(rawDocumentId),
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
          data.documentName !==
            roomName(session.workspaceId, session.documentId)
        ) {
          throw new Error("DOCUMENT_SESSION_INVALID");
        }
        const current = await this.service.authorizeDocument(session);
        if (current.outcome === "rejected") {
          this.sessions.delete(session.token);
          throw new Error("DOCUMENT_SESSION_INVALID");
        }
        const stored = await this.repository.loadDocumentState(session);
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
          documentId: session.documentId,
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
        const current = await this.service.authorizeDocument(session);
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
            (await this.service.authorizeDocument(session)).outcome ===
              "rejected"
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
        const stored = await this.repository.loadDocumentState(room);
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
        await this.repository.storeDocumentState({
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

  public async createSession(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
    readonly supportedDocumentFormats: readonly DocumentContentFormat[];
  }): Promise<RealtimeDocumentSessionResult | "upgrade_required" | undefined> {
    const authorization = await this.service.authorizeDocument(input);
    if (authorization.outcome === "rejected") return undefined;
    const stored = await this.repository.loadDocumentState(input);
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
        existing.documentId === input.documentId
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
      room: roomName(input.workspaceId, input.documentId),
      expiresAt,
      access: authorization.access,
      documentFormat,
    };
  }

  public async createRevision(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
    readonly name: string;
    readonly correlationId: CorrelationId;
    readonly restoredFromRevisionId?: DocumentRevisionId;
  }): Promise<DocumentRevisionId | undefined> {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 120) return undefined;
    const authorization = await this.service.authorizeDocument(input);
    if (
      authorization.outcome === "rejected" ||
      authorization.access !== "edit"
    ) {
      return undefined;
    }
    if (
      (await this.repository.listDocumentRevisions(input)).length >=
      MAX_NAMED_REVISIONS
    ) {
      return undefined;
    }
    const room = roomName(input.workspaceId, input.documentId);
    this.roomSpaces.set(room, authorization.spaceId);
    const connection = await this.hocuspocus.openDirectConnection(room, {
      sessionToken: "direct",
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      documentId: input.documentId,
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
    await this.repository.createDocumentRevision({
      id,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
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

  public async restoreRevision(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
    readonly revisionId: DocumentRevisionId;
    readonly correlationId: CorrelationId;
  }): Promise<boolean> {
    const authorization = await this.service.authorizeDocument(input);
    if (
      authorization.outcome === "rejected" ||
      authorization.access !== "edit"
    ) {
      return false;
    }
    const revision = (await this.repository.listDocumentRevisions(input)).find(
      (candidate) => candidate.id === input.revisionId,
    );
    if (revision === undefined) return false;
    const room = roomName(input.workspaceId, input.documentId);
    this.roomSpaces.set(room, authorization.spaceId);
    const connection = await this.hocuspocus.openDirectConnection(room, {
      sessionToken: "direct",
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      documentId: input.documentId,
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
    await this.createRevision({
      credential: input.credential,
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      documentId: input.documentId,
      name: `Restored ${revision.name}`,
      correlationId: input.correlationId,
      restoredFromRevisionId: revision.id,
    });
    return true;
  }

  public async listRevisions(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
  }) {
    const authorization = await this.service.authorizeDocument(input);
    if (authorization.outcome === "rejected") return undefined;
    return (await this.repository.listDocumentRevisions(input)).slice(
      0,
      MAX_NAMED_REVISIONS,
    );
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
    for (const [token, session] of this.sessions) {
      if (
        session.documentId === documentId &&
        session.workspaceId === workspaceId
      ) {
        this.sessions.delete(token);
      }
    }
    this.hocuspocus.closeConnections(roomName(workspaceId, documentId));
  }

  public async reauthorizeSessions(): Promise<void> {
    const roomsToClose = new Set<string>();
    for (const [token, session] of this.sessions) {
      const expired = Date.parse(session.expiresAt) <= Date.parse(this.now());
      const current = expired
        ? undefined
        : await this.service.authorizeDocument(session);
      if (current === undefined || current.outcome === "rejected") {
        this.sessions.delete(token);
        roomsToClose.add(roomName(session.workspaceId, session.documentId));
        continue;
      }
      if (
        current.access !== session.access ||
        current.spaceId !== session.spaceId ||
        current.principalId !== session.principalId
      ) {
        this.sessions.delete(token);
        roomsToClose.add(roomName(session.workspaceId, session.documentId));
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
