import { z } from "zod";

import { CommandEnvelopeSchema } from "./command.js";
import {
  PrincipalIdSchema,
  CredentialIdSchema,
  DeviceIdSchema,
  GrantIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import { CapabilitySchema } from "./execution-context.js";
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
    documents: z.array(JsonObjectSchema).default([]),
    knowledgeSources: z.array(JsonObjectSchema).default([]),
    namedDocumentVersions: z.array(JsonObjectSchema).default([]),
    strategicRecords: z.array(JsonObjectSchema).default([]),
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

export const RemoteMcpFederationScopeSchema = z
  .object({
    crossWorkspaceRead: z.boolean(),
    derivedResultWrite: z.boolean(),
    sourceMaterialization: z.boolean(),
  })
  .strict();
export type RemoteMcpFederationScope = z.infer<
  typeof RemoteMcpFederationScopeSchema
>;

const RemoteMcpManagementBaseSchema = z
  .object({
    protocolVersion: HubProtocolVersionSchema,
    workspaceId: WorkspaceIdSchema,
    deviceId: DeviceIdSchema,
  })
  .strict();

export const RemoteMcpGrantCreateRequestSchema =
  RemoteMcpManagementBaseSchema.extend({
    displayName: z.string().trim().min(1).max(120),
    preset: z.enum(["observe", "propose", "operate", "full_access", "custom"]),
    capabilityScope: z.array(CapabilitySchema).min(1).max(100),
    spaces: z
      .array(
        z
          .object({
            spaceId: SpaceIdSchema,
            access: z.enum(["view", "comment", "edit"]),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    federationScope: RemoteMcpFederationScopeSchema,
    expiresAt: z.iso.datetime().optional(),
  }).strict();
export type RemoteMcpGrantCreateRequest = z.infer<
  typeof RemoteMcpGrantCreateRequestSchema
>;

export const RemoteMcpGrantListRequestSchema = RemoteMcpManagementBaseSchema;
export type RemoteMcpGrantListRequest = z.infer<
  typeof RemoteMcpGrantListRequestSchema
>;

export const RemoteMcpGrantChangeRequestSchema =
  RemoteMcpManagementBaseSchema.extend({
    grantId: GrantIdSchema,
    expectedVersion: z.int().positive(),
  }).strict();
export type RemoteMcpGrantChangeRequest = z.infer<
  typeof RemoteMcpGrantChangeRequestSchema
>;

export const RemoteMcpGrantProjectionSchema = z
  .object({
    grantId: GrantIdSchema,
    displayName: z.string(),
    agentPrincipalId: PrincipalIdSchema,
    preset: z.string(),
    capabilityScope: z.array(CapabilitySchema),
    spaceScope: z.array(SpaceIdSchema),
    federationScope: RemoteMcpFederationScopeSchema,
    credentialId: CredentialIdSchema,
    credentialVersion: z.int().positive(),
    status: z.enum(["active", "expired", "revoked"]),
    expiresAt: z.iso.datetime().optional(),
    version: z.int().positive(),
    membershipId: z.uuid(),
    membershipVersion: z.int().positive(),
    spaces: z.array(
      z
        .object({
          spaceId: SpaceIdSchema,
          spaceName: z.string(),
          spaceGrantId: z.uuid(),
          access: z.enum(["view", "comment", "edit"]),
          version: z.int().positive(),
        })
        .strict(),
    ),
    lastUsedAt: z.iso.datetime().optional(),
  })
  .strict();
export type RemoteMcpGrantProjection = z.infer<
  typeof RemoteMcpGrantProjectionSchema
>;
