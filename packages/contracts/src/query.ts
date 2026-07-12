import { z } from "zod";

import {
  AuditReceiptIdSchema,
  CaptureIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  QueryIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import { ContractVersionSchema } from "./command.js";
import { RequestOriginSchema } from "./execution-context.js";

const QueryMetadataSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    queryId: QueryIdSchema,
    workspaceId: WorkspaceIdSchema,
    consistency: z.enum(["local_authoritative", "local_projection"]),
  })
  .strict();

export const WorkspaceBootstrapContextQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("workspace.bootstrapContext"),
  parameters: z.object({}).strict(),
}).strict();

export const CaptureHistoryQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("capture.history"),
  parameters: z
    .object({
      spaceId: SpaceIdSchema,
      limit: z.int().min(1).max(200).optional(),
      cursor: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
}).strict();

export const AuditReceiptQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("audit.receipt"),
  parameters: z
    .object({
      receiptId: AuditReceiptIdSchema,
    })
    .strict(),
}).strict();

export const QueryEnvelopeSchema = z.discriminatedUnion("queryName", [
  WorkspaceBootstrapContextQuerySchema,
  CaptureHistoryQuerySchema,
  AuditReceiptQuerySchema,
]);
export type QueryEnvelope = z.infer<typeof QueryEnvelopeSchema>;
export type QueryName = QueryEnvelope["queryName"];

const FreshnessSchema = z
  .object({
    mode: z.enum(["local_authoritative", "local_projection"]),
    checkpoint: z.string().nullable(),
    missingCapabilities: z.array(z.string()),
  })
  .strict();

export const QueryProjectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("workspace.bootstrapContext"),
      workspace: z
        .object({
          id: WorkspaceIdSchema,
          name: z.string(),
          timezone: z.string(),
          version: z.int().positive(),
        })
        .strict(),
      spaces: z.array(
        z
          .object({
            id: SpaceIdSchema,
            name: z.string(),
            version: z.int().positive(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("capture.history"),
      items: z.array(
        z
          .object({
            id: CaptureIdSchema,
            spaceId: SpaceIdSchema,
            originalText: z.string(),
            source: z.enum(["global_quick_capture", "in_app_quick_capture"]),
            capturedAt: z.iso.datetime({ offset: true }),
            processingState: z.literal("pending_processing"),
            version: z.int().positive(),
          })
          .strict(),
      ),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("audit.receipt"),
      receipt: z
        .object({
          id: AuditReceiptIdSchema,
          principalId: PrincipalIdSchema,
          grantId: GrantIdSchema,
          origin: RequestOriginSchema,
          commandId: CommandIdSchema,
          commandName: z.string(),
          correlationId: CorrelationIdSchema,
          affectedRecordIds: z.array(z.uuid()),
          recordVersions: z.record(z.uuid(), z.int().positive()),
          changedFields: z.array(z.string()),
          occurredAt: z.iso.datetime({ offset: true }),
          outcome: z.literal("success"),
        })
        .strict(),
    })
    .strict(),
]);
export type QueryProjection = z.infer<typeof QueryProjectionSchema>;

const QueryResultMetadataSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    queryId: QueryIdSchema,
    kernelTime: z.iso.datetime({ offset: true }),
  })
  .strict();

export const QuerySuccessSchema = QueryResultMetadataSchema.extend({
  outcome: z.literal("success"),
  projection: QueryProjectionSchema,
  freshness: FreshnessSchema,
}).strict();

export const QueryRejectedSchema = QueryResultMetadataSchema.extend({
  outcome: z.literal("rejected"),
  diagnosticCode: z.enum([
    "authorization.denied",
    "query.not_available",
    "query.cursor_invalid",
    "query.consistency_unavailable",
  ]),
}).strict();

export const QueryResultSchema = z.discriminatedUnion("outcome", [
  QuerySuccessSchema,
  QueryRejectedSchema,
]);
export type QueryResult = z.infer<typeof QueryResultSchema>;
