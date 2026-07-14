import { z } from "zod";

import { CommandEnvelopeSchema } from "./command.js";
import { DeviceIdSchema, WorkspaceIdSchema } from "./ids.js";
import { CommandOutcomeSchema } from "./outcome.js";

export const HUB_PROTOCOL_VERSION = 1 as const;
export const HubProtocolVersionSchema = z.literal(HUB_PROTOCOL_VERSION);
export type HubProtocolVersion = z.infer<typeof HubProtocolVersionSchema>;

export const HubCheckpointSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,19})$/u)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n, {
    error: "Hub checkpoint exceeds signed 64-bit range.",
  });
export type HubCheckpoint = z.infer<typeof HubCheckpointSchema>;

const JsonObjectSchema = z.record(z.string(), z.json());

/** Logical application state carried by the R3 correctness-first feed. */
export const HubWorkspaceSnapshotSchema = z
  .object({
    format: z.literal("constellation.workspace-snapshot/v1"),
    workspaces: z.array(JsonObjectSchema),
    spaces: z.array(JsonObjectSchema),
    memberships: z.array(JsonObjectSchema),
    spaceGrants: z.array(JsonObjectSchema).default([]),
    taskAssignments: z.array(JsonObjectSchema).default([]),
    comments: z.array(JsonObjectSchema).default([]),
    attentionSignals: z.array(JsonObjectSchema).default([]),
    taskStatuses: z.array(JsonObjectSchema),
    captures: z.array(JsonObjectSchema),
    tasks: z.array(JsonObjectSchema),
    projects: z.array(JsonObjectSchema),
    relations: z.array(JsonObjectSchema),
    undoDescriptors: z.array(JsonObjectSchema),
    events: z.array(JsonObjectSchema),
    auditReceipts: z.array(JsonObjectSchema),
    idempotencyRecords: z.array(JsonObjectSchema),
    outboxEntries: z.array(JsonObjectSchema),
  })
  .strict();
export type HubWorkspaceSnapshot = z.infer<typeof HubWorkspaceSnapshotSchema>;

export const HubSnapshotEnvelopeSchema = z
  .object({
    checkpoint: HubCheckpointSchema,
    digest: z.string().regex(/^[0-9a-f]{64}$/u),
    snapshot: HubWorkspaceSnapshotSchema,
  })
  .strict();
export type HubSnapshotEnvelope = z.infer<typeof HubSnapshotEnvelopeSchema>;

export const HubEnrollmentRequestSchema = z
  .object({
    protocolVersion: HubProtocolVersionSchema,
    workspaceId: WorkspaceIdSchema,
    deviceId: DeviceIdSchema,
    enrollmentSecret: z.string().min(32).max(256),
    deviceLabel: z.string().trim().min(1).max(80),
  })
  .strict();
export type HubEnrollmentRequest = z.infer<typeof HubEnrollmentRequestSchema>;

export const HubEnrollmentResultSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("success"),
      protocolVersion: HubProtocolVersionSchema,
      workspaceId: WorkspaceIdSchema,
      deviceId: DeviceIdSchema,
      deviceCredential: z.string().min(32).max(256),
      checkpoint: HubCheckpointSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal("rejected"),
      code: z.enum([
        "enrollment_invalid",
        "enrollment_expired",
        "enrollment_used",
        "device_already_enrolled",
      ]),
    })
    .strict(),
]);
export type HubEnrollmentResult = z.infer<typeof HubEnrollmentResultSchema>;

export const HubSyncRequestSchema = z
  .object({
    protocolVersion: HubProtocolVersionSchema,
    workspaceId: WorkspaceIdSchema,
    deviceId: DeviceIdSchema,
    checkpoint: HubCheckpointSchema,
    commands: z.array(CommandEnvelopeSchema).max(50),
  })
  .strict();
export type HubSyncRequest = z.infer<typeof HubSyncRequestSchema>;

export const HubCommandReceiptSchema = z
  .object({
    commandId: z.uuid(),
    checkpoint: HubCheckpointSchema.optional(),
    outcome: CommandOutcomeSchema,
  })
  .strict();
export type HubCommandReceipt = z.infer<typeof HubCommandReceiptSchema>;

export const HubSyncResultSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("success"),
      protocolVersion: HubProtocolVersionSchema,
      receipts: z.array(HubCommandReceiptSchema),
      currentCheckpoint: HubCheckpointSchema,
      change: HubSnapshotEnvelopeSchema.optional(),
      hasMore: z.boolean(),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("rejected"),
      code: z.enum([
        "credential_invalid",
        "device_revoked",
        "membership_revoked",
        "workspace_mismatch",
        "checkpoint_ahead",
        "protocol_unsupported",
      ]),
      purgeLocalProjection: z.boolean(),
    })
    .strict(),
]);
export type HubSyncResult = z.infer<typeof HubSyncResultSchema>;

export const HubReconcileCommandResultSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("committed"),
      receipt: HubCommandReceiptSchema,
    })
    .strict(),
  z.object({ outcome: z.literal("not_found") }).strict(),
]);
export type HubReconcileCommandResult = z.infer<
  typeof HubReconcileCommandResultSchema
>;

export const HubAttachmentBeginRequestSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    deviceId: DeviceIdSchema,
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    byteLength: z.int().positive().max(1_073_741_824),
  })
  .strict();
export type HubAttachmentBeginRequest = z.infer<
  typeof HubAttachmentBeginRequestSchema
>;

export const HubAttachmentUploadSchema = z
  .object({
    uploadId: z.uuid(),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    byteLength: z.int().positive(),
    receivedBytes: z.int().nonnegative(),
    state: z.enum(["staging", "published"]),
  })
  .strict();
export type HubAttachmentUpload = z.infer<typeof HubAttachmentUploadSchema>;

export const HubBootstrapSnapshotRequestSchema = z
  .object({
    protocolVersion: HubProtocolVersionSchema,
    workspaceId: WorkspaceIdSchema,
    deviceId: DeviceIdSchema,
    digest: z.string().regex(/^[0-9a-f]{64}$/u),
    snapshot: HubWorkspaceSnapshotSchema,
  })
  .strict();
export type HubBootstrapSnapshotRequest = z.infer<
  typeof HubBootstrapSnapshotRequestSchema
>;
