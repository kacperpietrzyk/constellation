import { readFile } from "node:fs/promises";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  createServer as createHttpsServer,
  type ServerOptions as HttpsServerOptions,
} from "node:https";
import type { AddressInfo } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  CorrelationIdSchema,
  CollaborativeContentOwnerSchema,
  DeviceIdSchema,
  DocumentIdSchema,
  DocumentRevisionIdSchema,
  HubAttachmentBeginRequestSchema,
  HubBootstrapSnapshotRequestSchema,
  HubEnrollmentRequestSchema,
  HubSyncRequestSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import { createConstellationMcpServer } from "@constellation/mcp";
import { z } from "zod";

import type { HubService } from "./service.js";
import type { HubAttachmentService } from "./attachments.js";
import type { RealtimeDocumentGateway } from "./realtime-documents.js";
import type { HubRemoteMcpService } from "./remote-mcp.js";

const MAX_BODY_BYTES = 1_048_576;
const MAX_ATTACHMENT_CHUNK_BYTES = 8 * 1024 * 1024;

const ReconcileRequestSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    deviceId: DeviceIdSchema,
    commandId: z.uuid(),
  })
  .strict();

const DocumentRequestSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    deviceId: DeviceIdSchema,
    documentId: DocumentIdSchema,
  })
  .strict();

const DocumentSessionRequestSchema = DocumentRequestSchema.extend({
  supportedDocumentFormats: z
    .array(z.enum(["plain-v1", "rich-v1"]))
    .min(1)
    .max(2)
    .refine((items) => new Set(items).size === items.length),
}).strict();

const DocumentRevisionCreateRequestSchema = DocumentRequestSchema.extend({
  name: z.string().trim().min(1).max(120),
  correlationId: CorrelationIdSchema,
}).strict();

const DocumentRevisionRestoreRequestSchema = DocumentRequestSchema.extend({
  revisionId: DocumentRevisionIdSchema,
  correlationId: CorrelationIdSchema,
}).strict();

const ContentRequestSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    deviceId: DeviceIdSchema,
    owner: CollaborativeContentOwnerSchema,
  })
  .strict();

const ContentSessionRequestSchema = ContentRequestSchema.extend({
  supportedDocumentFormats: z
    .array(z.enum(["plain-v1", "rich-v1"]))
    .min(1)
    .max(2)
    .refine((items) => new Set(items).size === items.length),
}).strict();

const ContentRevisionCreateRequestSchema = ContentRequestSchema.extend({
  name: z.string().trim().min(1).max(120),
  correlationId: CorrelationIdSchema,
}).strict();

const ContentRevisionRestoreRequestSchema = ContentRequestSchema.extend({
  revisionId: DocumentRevisionIdSchema,
  correlationId: CorrelationIdSchema,
}).strict();

const json = (
  response: ServerResponse,
  status: number,
  value: unknown,
): void => {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
};

const readBytes = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_ATTACHMENT_CHUNK_BYTES) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const bearer = (request: IncomingMessage): string | undefined => {
  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith("Bearer ")) return undefined;
  const token = header.slice(7);
  return token.length >= 32 && token.length <= 256 ? token : undefined;
};

export interface HubServerOptions {
  readonly service: HubService;
  readonly host: string;
  readonly port: number;
  readonly tls?: HttpsServerOptions;
  readonly allowInsecureLoopback?: boolean;
  readonly readiness?: () => Promise<boolean>;
  readonly attachments?: HubAttachmentService;
  readonly realtimeDocuments?: RealtimeDocumentGateway;
  readonly remoteMcp?: HubRemoteMcpService;
  /** Test-only failure injection after the authoritative transaction commits. */
  readonly dropSyncResponseAfterCommit?: () => boolean;
  readonly logger?: (entry: {
    readonly event: "hub.request";
    readonly method: string;
    readonly path: string;
    readonly status: number;
    readonly durationMs: number;
  }) => void;
}

export interface RunningHubServer {
  readonly origin: string;
  close(): Promise<void>;
}

const isLoopback = (host: string): boolean =>
  host === "127.0.0.1" || host === "::1" || host === "localhost";

export const startHubServer = async (
  options: HubServerOptions,
): Promise<RunningHubServer> => {
  if (
    options.tls === undefined &&
    (!options.allowInsecureLoopback || !isLoopback(options.host))
  ) {
    throw new Error("TLS is required outside explicit loopback development.");
  }
  const handler = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    try {
      const startedAt = performance.now();
      const requestUrl = new URL(request.url ?? "/", "http://hub.invalid");
      response.once("finish", () => {
        options.logger?.({
          event: "hub.request",
          method: request.method ?? "UNKNOWN",
          path: requestUrl.pathname,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        });
      });
      if (request.method === "GET" && request.url === "/healthz") {
        json(response, 200, { status: "alive", protocolVersion: 1 });
        return;
      }
      if (request.method === "GET" && request.url === "/readyz") {
        const ready = (await options.readiness?.()) ?? true;
        json(response, ready ? 200 : 503, {
          status: ready ? "ready" : "unavailable",
        });
        return;
      }
      const remoteMcpPath = requestUrl.pathname.match(
        /^\/v1\/mcp\/([0-9a-f-]{36})$/u,
      );
      if (remoteMcpPath !== null && options.remoteMcp !== undefined) {
        const workspace = WorkspaceIdSchema.safeParse(remoteMcpPath[1]);
        const credential = bearer(request);
        if (
          !workspace.success ||
          credential === undefined ||
          !(await options.remoteMcp.isAuthorized(workspace.data, credential))
        ) {
          json(response, 401, { code: "authorization_denied" });
          return;
        }
        if (request.method !== "POST") {
          json(response, 405, { code: "method_not_allowed" });
          return;
        }
        const host = request.headers.host;
        const origin = request.headers.origin;
        if (
          host === undefined ||
          (origin !== undefined &&
            origin !== `https://${host}` &&
            !(options.allowInsecureLoopback && origin === `http://${host}`))
        ) {
          json(response, 403, { code: "origin_denied" });
          return;
        }
        const body = await readJson(request);
        const transport = new StreamableHTTPServerTransport({
          enableJsonResponse: true,
        });
        const mcp = createConstellationMcpServer(
          {
            invoke: (invocation) =>
              options.remoteMcp!.invoke(workspace.data, credential, invocation),
          },
          {
            name: "constellation-hub",
            capabilityTitle: "Constellation remote MCP capability contract",
          },
        );
        // SDK 1.29's Node transport setter declarations are not structurally
        // assignable under exactOptionalPropertyTypes, although it implements
        // the same runtime Transport contract.
        await mcp.connect(transport as never);
        try {
          await transport.handleRequest(request, response, body);
        } finally {
          await transport.close();
          await mcp.close();
        }
        return;
      }
      if (
        requestUrl.pathname === "/v1/remote-mcp/grants" &&
        options.remoteMcp !== undefined
      ) {
        const credential = bearer(request);
        if (credential === undefined) {
          json(response, 401, { outcome: "rejected" });
          return;
        }
        const body = await readJson(request);
        const result =
          request.method === "POST"
            ? await options.remoteMcp.createGrant(credential, body as never)
            : request.method === "PUT"
              ? await options.remoteMcp.rotateGrant(credential, body as never)
              : request.method === "DELETE"
                ? await options.remoteMcp.revokeGrant(credential, body as never)
                : undefined;
        if (result === undefined) {
          json(response, 405, { outcome: "rejected" });
          return;
        }
        json(
          response,
          result.outcome === "success"
            ? 200
            : result.outcome === "conflict"
              ? 409
              : // A scope the workspace refuses to delegate is a policy answer,
                // not a failed credential: 403 keeps the two distinguishable.
                "diagnosticCode" in result &&
                  result.diagnosticCode === "grant.capability_not_delegable"
                ? 403
                : 401,
          result,
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/remote-mcp/grants/list" &&
        request.method === "POST" &&
        options.remoteMcp !== undefined
      ) {
        const credential = bearer(request);
        if (credential === undefined) {
          json(response, 401, { outcome: "rejected" });
          return;
        }
        const result = await options.remoteMcp.listGrants(
          credential,
          (await readJson(request)) as never,
        );
        json(response, result.outcome === "success" ? 200 : 401, result);
        return;
      }
      const attachmentDownload = requestUrl.pathname.match(
        /^\/v1\/attachments\/([0-9a-f]{64})$/u,
      );
      if (
        request.method === "GET" &&
        attachmentDownload !== null &&
        options.attachments !== undefined
      ) {
        const credential = bearer(request);
        const workspace = WorkspaceIdSchema.safeParse(
          requestUrl.searchParams.get("workspaceId"),
        );
        const device = DeviceIdSchema.safeParse(
          requestUrl.searchParams.get("deviceId"),
        );
        if (credential === undefined || !workspace.success || !device.success) {
          json(response, 401, { code: "credential_invalid" });
          return;
        }
        const rangeHeader = request.headers.range;
        const match = rangeHeader?.match(/^bytes=(\d+)-(\d+)$/u);
        const range =
          match === undefined || match === null
            ? undefined
            : { start: Number(match[1]), end: Number(match[2]) };
        const object = await options.attachments.openAuthorized({
          credential,
          workspaceId: workspace.data,
          deviceId: device.data,
          digest: attachmentDownload[1] ?? "",
          ...(range === undefined ? {} : { range }),
        });
        response.writeHead(range === undefined ? 200 : 206, {
          "accept-ranges": "bytes",
          "cache-control": "private, no-store",
          "content-length": String(
            range === undefined
              ? object.byteLength
              : range.end - range.start + 1,
          ),
          "content-type": "application/octet-stream",
          ...(range === undefined
            ? {}
            : {
                "content-range": `bytes ${range.start}-${range.end}/${object.byteLength}`,
              }),
        });
        object.stream.pipe(response);
        return;
      }
      if (request.method !== "POST" && request.method !== "PUT") {
        json(response, 404, { code: "not_found" });
        return;
      }
      const uploadPath = requestUrl.pathname.match(
        /^\/v1\/attachments\/uploads\/([0-9a-f-]{36})(\/publish)?$/u,
      );
      const credential = bearer(request);
      if (
        request.method === "PUT" &&
        uploadPath !== null &&
        uploadPath[2] === undefined &&
        options.attachments !== undefined
      ) {
        const workspace = WorkspaceIdSchema.safeParse(
          requestUrl.searchParams.get("workspaceId"),
        );
        const device = DeviceIdSchema.safeParse(
          requestUrl.searchParams.get("deviceId"),
        );
        const offset = Number(request.headers["upload-offset"]);
        if (
          credential === undefined ||
          !workspace.success ||
          !device.success ||
          !Number.isSafeInteger(offset) ||
          offset < 0
        ) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const result = await options.attachments.append({
          credential,
          workspaceId: workspace.data,
          deviceId: device.data,
          uploadId: uploadPath[1] ?? "",
          offset,
          chunk: await readBytes(request),
        });
        json(response, 200, result);
        return;
      }
      const body = await readJson(request);
      if (request.url === "/v1/enroll") {
        const parsed = HubEnrollmentRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        json(response, 200, await options.service.enroll(parsed.data));
        return;
      }
      if (credential === undefined) {
        json(response, 401, { code: "credential_invalid" });
        return;
      }
      if (
        requestUrl.pathname === "/v1/documents/session" &&
        options.realtimeDocuments !== undefined
      ) {
        const parsed = DocumentSessionRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const session = await options.realtimeDocuments.createSession({
          credential,
          ...parsed.data,
        });
        if (session === "upgrade_required") {
          json(response, 409, { code: "document_format_upgrade_required" });
          return;
        }
        json(
          response,
          session === undefined ? 404 : 200,
          session ?? { code: "not_found" },
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/documents/revisions" &&
        options.realtimeDocuments !== undefined
      ) {
        const parsed = DocumentRevisionCreateRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const revisionId = await options.realtimeDocuments.createRevision({
          credential,
          ...parsed.data,
        });
        json(
          response,
          revisionId === undefined ? 404 : 200,
          revisionId === undefined ? { code: "not_found" } : { revisionId },
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/documents/revisions/list" &&
        options.realtimeDocuments !== undefined
      ) {
        const parsed = DocumentRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const revisions = await options.realtimeDocuments.listRevisions({
          credential,
          ...parsed.data,
        });
        json(
          response,
          revisions === undefined ? 404 : 200,
          revisions === undefined
            ? { code: "not_found" }
            : {
                revisions: revisions.map((revision) => ({
                  id: revision.id,
                  name: revision.name,
                  createdBy: revision.createdBy,
                  createdAt: revision.createdAt,
                  restoredFromRevisionId: revision.restoredFromRevisionId,
                })),
              },
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/documents/revisions/restore" &&
        options.realtimeDocuments !== undefined
      ) {
        const parsed = DocumentRevisionRestoreRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const restored = await options.realtimeDocuments.restoreRevision({
          credential,
          ...parsed.data,
        });
        json(
          response,
          restored ? 200 : 404,
          restored ? { outcome: "success" } : { code: "not_found" },
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/content/session" &&
        options.realtimeDocuments !== undefined
      ) {
        const parsed = ContentSessionRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const session = await options.realtimeDocuments.createContentSession({
          credential,
          ...parsed.data,
        });
        if (session === "upgrade_required") {
          json(response, 409, { code: "document_format_upgrade_required" });
          return;
        }
        json(
          response,
          session === undefined ? 404 : 200,
          session ?? { code: "not_found" },
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/content/revisions" &&
        options.realtimeDocuments !== undefined
      ) {
        const parsed = ContentRevisionCreateRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const revisionId =
          await options.realtimeDocuments.createContentRevision({
            credential,
            ...parsed.data,
          });
        json(
          response,
          revisionId === undefined ? 404 : 200,
          revisionId === undefined ? { code: "not_found" } : { revisionId },
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/content/revisions/list" &&
        options.realtimeDocuments !== undefined
      ) {
        const parsed = ContentRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const revisions = await options.realtimeDocuments.listContentRevisions({
          credential,
          ...parsed.data,
        });
        json(
          response,
          revisions === undefined ? 404 : 200,
          revisions === undefined
            ? { code: "not_found" }
            : {
                revisions: revisions.map((revision) => ({
                  id: revision.id,
                  name: revision.name,
                  createdBy: revision.createdBy,
                  createdAt: revision.createdAt,
                  restoredFromRevisionId: revision.restoredFromRevisionId,
                })),
              },
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/content/revisions/restore" &&
        options.realtimeDocuments !== undefined
      ) {
        const parsed = ContentRevisionRestoreRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const restored = await options.realtimeDocuments.restoreContentRevision(
          {
            credential,
            ...parsed.data,
          },
        );
        json(
          response,
          restored ? 200 : 404,
          restored ? { outcome: "success" } : { code: "not_found" },
        );
        return;
      }
      if (
        requestUrl.pathname === "/v1/attachments/uploads" &&
        options.attachments !== undefined
      ) {
        const parsed = HubAttachmentBeginRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        json(
          response,
          200,
          await options.attachments.begin(credential, parsed.data),
        );
        return;
      }
      if (requestUrl.pathname === "/v1/bootstrap-snapshot") {
        const parsed = HubBootstrapSnapshotRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        json(
          response,
          200,
          await options.service.bootstrapSnapshot(credential, parsed.data),
        );
        return;
      }
      if (requestUrl.pathname === "/v1/leave-device") {
        const parsed = z
          .object({ workspaceId: WorkspaceIdSchema, deviceId: DeviceIdSchema })
          .strict()
          .safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        json(response, 200, {
          outcome: (await options.service.leaveDevice({
            credential,
            ...parsed.data,
          }))
            ? "success"
            : "rejected",
        });
        return;
      }
      if (
        uploadPath !== null &&
        uploadPath[2] === "/publish" &&
        options.attachments !== undefined
      ) {
        const parsed = z
          .object({ workspaceId: WorkspaceIdSchema, deviceId: DeviceIdSchema })
          .strict()
          .safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        json(
          response,
          200,
          await options.attachments.publish({
            credential,
            ...parsed.data,
            uploadId: uploadPath[1] ?? "",
          }),
        );
        return;
      }
      if (request.url === "/v1/sync") {
        const parsed = HubSyncRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        const result = await options.service.sync(credential, parsed.data);
        await options.realtimeDocuments?.reauthorizeSessions();
        if (options.dropSyncResponseAfterCommit?.() === true) {
          response.destroy();
          return;
        }
        json(response, 200, result);
        return;
      }
      if (request.url === "/v1/reconcile-command") {
        const parsed = ReconcileRequestSchema.safeParse(body);
        if (!parsed.success) {
          json(response, 400, { code: "contract_invalid" });
          return;
        }
        json(
          response,
          200,
          await options.service.reconcileCommand({
            credential,
            ...parsed.data,
          }),
        );
        return;
      }
      json(response, 404, { code: "not_found" });
    } catch (error) {
      json(
        response,
        error instanceof Error && error.message === "request_too_large"
          ? 413
          : 400,
        {
          code:
            error instanceof Error && error.message === "request_too_large"
              ? "request_too_large"
              : "request_invalid",
        },
      );
    }
  };
  const server =
    options.tls === undefined
      ? createHttpServer((request, response) => void handler(request, response))
      : createHttpsServer(
          options.tls,
          (request, response) => void handler(request, response),
        );
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  options.realtimeDocuments?.mount(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `${options.tls === undefined ? "http" : "https"}://${options.host}:${address.port}`,
    close: async () => {
      await options.realtimeDocuments?.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      });
    },
  };
};

export const loadTlsOptions = async (input: {
  readonly certificatePath: string;
  readonly privateKeyPath: string;
}): Promise<HttpsServerOptions> => ({
  cert: await readFile(input.certificatePath),
  key: await readFile(input.privateKeyPath),
  minVersion: "TLSv1.3",
});
