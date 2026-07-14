import { z } from "zod";

import { DeviceIdSchema, WorkspaceIdSchema } from "./ids.js";

export const DATA_HOME_CONTRACT_VERSION = 1 as const;
export const LOCAL_ONLY_PROVIDER_ID = "constellation.local-only/v1" as const;

export const DataHomeProviderIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]{2,79}\/v[1-9][0-9]*$/)
  .brand<"DataHomeProviderId">();
export type DataHomeProviderId = z.infer<typeof DataHomeProviderIdSchema>;

export const DataHomeProviderInstanceIdSchema = z
  .string()
  .min(1)
  .max(240)
  .brand<"DataHomeProviderInstanceId">();
export type DataHomeProviderInstanceId = z.infer<
  typeof DataHomeProviderInstanceIdSchema
>;

export const DataHomeCapabilityNameSchema = z.enum([
  "ordered_changes",
  "checkpoints",
  "tombstones",
  "attachments",
  "quota",
  "portable_export",
  "portable_import",
  "provider_migration",
  "device_revocation",
]);
export type DataHomeCapabilityName = z.infer<
  typeof DataHomeCapabilityNameSchema
>;

export const DataHomeCapabilitySupportSchema = z
  .object({
    support: z.enum(["supported", "unsupported"]),
    reason: z.string().trim().min(1).max(240).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.support === "unsupported" && value.reason === undefined) {
      context.addIssue({
        code: "custom",
        message: "Unsupported Data Home capabilities require a reason.",
        path: ["reason"],
      });
    }
    if (value.support === "supported" && value.reason !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Supported Data Home capabilities cannot include a reason.",
        path: ["reason"],
      });
    }
  });
export type DataHomeCapabilitySupport = z.infer<
  typeof DataHomeCapabilitySupportSchema
>;

export const DataHomeCapabilitiesSchema = z
  .object({
    ordered_changes: DataHomeCapabilitySupportSchema,
    checkpoints: DataHomeCapabilitySupportSchema,
    tombstones: DataHomeCapabilitySupportSchema,
    attachments: DataHomeCapabilitySupportSchema,
    quota: DataHomeCapabilitySupportSchema,
    portable_export: DataHomeCapabilitySupportSchema,
    portable_import: DataHomeCapabilitySupportSchema,
    provider_migration: DataHomeCapabilitySupportSchema,
    device_revocation: DataHomeCapabilitySupportSchema,
  })
  .strict();
export type DataHomeCapabilities = z.infer<typeof DataHomeCapabilitiesSchema>;

export const DataHomeDescriptorSchema = z
  .object({
    contractVersion: z.literal(DATA_HOME_CONTRACT_VERSION),
    providerId: DataHomeProviderIdSchema,
    providerInstanceId: DataHomeProviderInstanceIdSchema,
    workspaceId: WorkspaceIdSchema.optional(),
    deviceId: DeviceIdSchema,
    providerKind: z.enum(["local_only", "coordinated"]),
    storageRole: z.enum(["canonical", "projection_with_outbox"]),
    displayName: z.string().trim().min(1).max(80),
    location: z.enum(["this_device", "provider_managed"]),
    capabilities: DataHomeCapabilitiesSchema,
    encryption: z
      .object({
        atRest: z.enum(["sqlcipher", "provider_managed"]),
        keyCustody: z.enum(["operating_system", "provider_managed"]),
        portableRecovery: z.enum([
          "separate_recovery_code",
          "provider_managed",
        ]),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.providerKind === "local_only" &&
      (value.storageRole !== "canonical" || value.location !== "this_device")
    ) {
      context.addIssue({
        code: "custom",
        message: "A local-only Data Home must be canonical on this device.",
      });
    }
    if (
      value.storageRole === "projection_with_outbox" &&
      value.capabilities.ordered_changes.support !== "supported"
    ) {
      context.addIssue({
        code: "custom",
        message: "A coordinated projection requires ordered change exchange.",
        path: ["capabilities", "ordered_changes"],
      });
    }
  });
export type DataHomeDescriptor = z.infer<typeof DataHomeDescriptorSchema>;

export const DataHomeRecoveryActionSchema = z.enum([
  "retry_open",
  "export_checkpoint",
  "restore_checkpoint",
  "reconcile_provider",
  "open_system_credentials",
  "contact_provider",
]);
export type DataHomeRecoveryAction = z.infer<
  typeof DataHomeRecoveryActionSchema
>;

export const DataHomeStatusSchema = z
  .object({
    descriptor: DataHomeDescriptorSchema,
    availability: z.enum([
      "available",
      "locked",
      "unavailable",
      "recovery_required",
      "degraded",
    ]),
    syncState: z.enum([
      "not_configured",
      "current",
      "queued",
      "syncing",
      "offline",
      "conflict",
      "unknown_reconcile",
    ]),
    checkpointState: z.enum([
      "none_recorded",
      "verified_this_session",
      "unknown",
    ]),
    quota: z.discriminatedUnion("state", [
      z.object({ state: z.literal("unknown") }).strict(),
      z
        .object({
          state: z.literal("known"),
          usedBytes: z.int().nonnegative(),
          limitBytes: z.int().positive(),
        })
        .strict(),
    ]),
    lastVerifiedAt: z.iso.datetime({ offset: true }),
    recoveryActions: z.array(DataHomeRecoveryActionSchema),
    detailCode: z
      .enum([
        "ready",
        "secure_storage_unavailable",
        "protected_key_unavailable",
        "workspace_unavailable",
        "provider_partial",
        "provider_conflict",
        "provider_unknown_reconcile",
        "hub_unreachable",
        "device_revoked",
        "sync_conflict",
        "sync_unknown_reconcile",
      ])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.descriptor.providerKind === "local_only" &&
      value.syncState !== "not_configured"
    ) {
      context.addIssue({
        code: "custom",
        message: "A local-only Data Home cannot report synchronization state.",
        path: ["syncState"],
      });
    }
    if (
      value.availability !== "available" &&
      value.recoveryActions.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "A degraded Data Home status requires a recovery action.",
        path: ["recoveryActions"],
      });
    }
    if (
      value.availability === "available" &&
      value.descriptor.workspaceId === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "An available Data Home requires a workspace identity.",
        path: ["descriptor", "workspaceId"],
      });
    }
  });
export type DataHomeStatus = z.infer<typeof DataHomeStatusSchema>;

export const DataHomeOperationOutcomeSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("success"),
      operationId: z.uuid(),
      checkpointId: z.string().min(1).max(200).optional(),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("partial"),
      operationId: z.uuid(),
      committedItemIds: z.array(z.string().min(1).max(200)),
      retryableItemIds: z.array(z.string().min(1).max(200)),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("conflict"),
      operationId: z.uuid(),
      conflictId: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("retryable"),
      operationId: z.uuid(),
      retryAfterMs: z.int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("unknown_reconcile"),
      operationId: z.uuid(),
      reconciliationToken: z.string().min(1).max(240),
    })
    .strict(),
  z
    .object({
      outcome: z.literal("unsupported"),
      operationId: z.uuid(),
      capability: DataHomeCapabilityNameSchema,
    })
    .strict(),
  z.object({ outcome: z.literal("cancelled"), operationId: z.uuid() }).strict(),
]);
export type DataHomeOperationOutcome = z.infer<
  typeof DataHomeOperationOutcomeSchema
>;

export const WorkspaceBackupMetadataSchema = z
  .object({
    archiveId: z.string().uuid(),
    workspaceId: WorkspaceIdSchema,
    workspaceName: z.string().trim().min(1).max(200),
    createdAt: z.iso.datetime({ offset: true }),
    appVersion: z.string().trim().min(1).max(80),
    databaseByteLength: z.int().positive(),
  })
  .strict();
export type WorkspaceBackupMetadata = z.infer<
  typeof WorkspaceBackupMetadataSchema
>;

export const WorkspaceRecoveryCountsSchema = z
  .object({
    captures: z.int().nonnegative(),
    tasks: z.int().nonnegative(),
    projects: z.int().nonnegative(),
    relations: z.int().nonnegative(),
    auditReceipts: z.int().nonnegative(),
  })
  .strict();
export type WorkspaceRecoveryCounts = z.infer<
  typeof WorkspaceRecoveryCountsSchema
>;

export const WorkspaceBackupFailureCodeSchema = z.enum([
  "secure_storage_unavailable",
  "archive_invalid",
  "archive_unsupported",
  "recovery_code_invalid",
  "workspace_identity_invalid",
  "operation_busy",
  "io_failed",
  "restore_interrupted",
]);
export type WorkspaceBackupFailureCode = z.infer<
  typeof WorkspaceBackupFailureCodeSchema
>;

export const WorkspaceBackupExportResultSchema = z.discriminatedUnion(
  "outcome",
  [
    z.object({ outcome: z.literal("cancelled") }).strict(),
    z
      .object({
        outcome: z.literal("success"),
        recoveryCode: z.string().min(1).max(128),
        fileLabel: z.string().min(1).max(255),
        metadata: WorkspaceBackupMetadataSchema,
      })
      .strict(),
    z
      .object({
        outcome: z.literal("failure"),
        code: WorkspaceBackupFailureCodeSchema,
      })
      .strict(),
  ],
);
export type WorkspaceBackupExportResult = z.infer<
  typeof WorkspaceBackupExportResultSchema
>;

export const WorkspaceRestorePreviewResultSchema = z.discriminatedUnion(
  "outcome",
  [
    z.object({ outcome: z.literal("cancelled") }).strict(),
    z
      .object({
        outcome: z.literal("preview"),
        restoreId: z.string().uuid(),
        metadata: WorkspaceBackupMetadataSchema,
        counts: WorkspaceRecoveryCountsSchema,
      })
      .strict(),
    z
      .object({
        outcome: z.literal("failure"),
        code: WorkspaceBackupFailureCodeSchema,
      })
      .strict(),
  ],
);
export type WorkspaceRestorePreviewResult = z.infer<
  typeof WorkspaceRestorePreviewResultSchema
>;

export const WorkspaceRestoreResultSchema = z.discriminatedUnion("outcome", [
  z
    .object({ outcome: z.literal("success"), workspaceId: WorkspaceIdSchema })
    .strict(),
  z
    .object({
      outcome: z.literal("failure"),
      code: WorkspaceBackupFailureCodeSchema,
    })
    .strict(),
]);
export type WorkspaceRestoreResult = z.infer<
  typeof WorkspaceRestoreResultSchema
>;
