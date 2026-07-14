import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DataHomeOperationOutcomeSchema,
  DataHomeStatusSchema,
  DeviceIdSchema,
  LOCAL_ONLY_PROVIDER_ID,
  WorkspaceIdSchema,
} from "../src/index.js";

const unsupported = (reason: string) => ({
  support: "unsupported" as const,
  reason,
});

const localStatus = () => ({
  descriptor: {
    contractVersion: 1 as const,
    providerId: LOCAL_ONLY_PROVIDER_ID,
    providerInstanceId:
      "constellation.local-only/v1:00000000-0000-4000-8000-000000000101",
    workspaceId: WorkspaceIdSchema.parse(
      "00000000-0000-4000-8000-000000000101",
    ),
    deviceId: DeviceIdSchema.parse("00000000-0000-4000-8000-000000000102"),
    providerKind: "local_only" as const,
    storageRole: "canonical" as const,
    displayName: "Local only",
    location: "this_device" as const,
    capabilities: {
      ordered_changes: unsupported("No remote provider is configured."),
      checkpoints: { support: "supported" as const },
      tombstones: unsupported("No remote provider is configured."),
      attachments: unsupported("Attachments are not implemented."),
      quota: unsupported("Local filesystem quota is unknown."),
      portable_export: { support: "supported" as const },
      portable_import: { support: "supported" as const },
      provider_migration: { support: "supported" as const },
      device_revocation: unsupported("No remote authority exists."),
    },
    encryption: {
      atRest: "sqlcipher" as const,
      keyCustody: "operating_system" as const,
      portableRecovery: "separate_recovery_code" as const,
    },
  },
  availability: "available" as const,
  syncState: "not_configured" as const,
  checkpointState: "none_recorded" as const,
  quota: { state: "unknown" as const },
  lastVerifiedAt: "2026-07-14T10:00:00.000Z",
  recoveryActions: ["export_checkpoint", "restore_checkpoint"] as const,
  detailCode: "ready" as const,
});

describe("Data Home contracts", () => {
  it("accepts an honest canonical local-only provider", () => {
    const status = DataHomeStatusSchema.parse(localStatus());
    assert.equal(status.descriptor.providerId, LOCAL_ONLY_PROVIDER_ID);
    assert.equal(status.descriptor.capabilities.quota.support, "unsupported");
  });

  it("rejects silent local sync and degradation without recovery", () => {
    const synced = localStatus();
    assert.equal(
      DataHomeStatusSchema.safeParse({ ...synced, syncState: "current" })
        .success,
      false,
    );
    assert.equal(
      DataHomeStatusSchema.safeParse({
        ...synced,
        availability: "degraded",
        recoveryActions: [],
      }).success,
      false,
    );
  });

  it("keeps partial, conflict, retryable, and unknown effects distinct", () => {
    const operationId = "00000000-0000-4000-8000-000000000103";
    for (const outcome of [
      {
        outcome: "partial",
        operationId,
        committedItemIds: ["change-1"],
        retryableItemIds: ["change-2"],
      },
      { outcome: "conflict", operationId, conflictId: "conflict-1" },
      { outcome: "retryable", operationId, retryAfterMs: 1000 },
      {
        outcome: "unknown_reconcile",
        operationId,
        reconciliationToken: "reconcile-1",
      },
    ]) {
      assert.equal(
        DataHomeOperationOutcomeSchema.parse(outcome).outcome,
        outcome.outcome,
      );
    }
  });
});
