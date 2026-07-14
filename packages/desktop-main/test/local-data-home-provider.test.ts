import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DeviceIdSchema,
  DataHomeProviderIdSchema,
  LOCAL_ONLY_PROVIDER_ID,
  WorkspaceIdSchema,
  type WorkspaceBackupExportResult,
  type WorkspaceRestorePreviewResult,
  type WorkspaceRestoreResult,
} from "@constellation/contracts";
import { certifyDataHomeProvider } from "@constellation/testkit";

import {
  LocalOnlyDataHomeProvider,
  type LocalDataHomeRecoveryPort,
} from "../src/local-data-home-provider.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000201",
);
const deviceId = DeviceIdSchema.parse("00000000-0000-4000-8000-000000000202");

const fakeRecovery = (
  overrides: Partial<LocalDataHomeRecoveryPort> = {},
): LocalDataHomeRecoveryPort => ({
  kernel: { identity: { workspaceId } },
  recoveryReason: "none",
  cancelRestore: () => undefined,
  confirmRestore: async (): Promise<WorkspaceRestoreResult> => ({
    outcome: "success",
    workspaceId,
  }),
  exportBackup: async (): Promise<WorkspaceBackupExportResult> => ({
    outcome: "cancelled",
  }),
  prepareRestore: async (): Promise<WorkspaceRestorePreviewResult> => ({
    outcome: "cancelled",
  }),
  ...overrides,
});

describe("local-only Data Home provider", () => {
  it("passes the shared provider certification with honest capabilities", async () => {
    const provider = new LocalOnlyDataHomeProvider(
      fakeRecovery(),
      deviceId,
      () => new Date("2026-07-14T10:00:00.000Z"),
    );
    await certifyDataHomeProvider(provider, {
      providerId: DataHomeProviderIdSchema.parse(LOCAL_ONLY_PROVIDER_ID),
      providerKind: "local_only",
      storageRole: "canonical",
      supportedCapabilities: [
        "checkpoints",
        "portable_export",
        "portable_import",
        "provider_migration",
      ],
    });
  });

  it("records a verified checkpoint only after successful export", async () => {
    const provider = new LocalOnlyDataHomeProvider(
      fakeRecovery({
        exportBackup: async () => ({
          outcome: "success",
          recoveryCode: "cst1_test",
          fileLabel: "workspace.constellation-backup",
          metadata: {
            archiveId: "00000000-0000-4000-8000-000000000203",
            workspaceId,
            workspaceName: "Personal workspace",
            createdAt: "2026-07-14T10:00:00.000Z",
            appVersion: "0.0.0",
            databaseByteLength: 4096,
          },
        }),
      }),
      deviceId,
      () => new Date("2026-07-14T10:00:00.000Z"),
    );
    assert.equal((await provider.getStatus()).checkpointState, "none_recorded");
    assert.equal(
      (await provider.exportPortableCheckpoint()).outcome,
      "success",
    );
    assert.equal(
      (await provider.getStatus()).checkpointState,
      "verified_this_session",
    );
  });

  it("exposes locked key custody without fabricating workspace identity", async () => {
    const availableProvider = new LocalOnlyDataHomeProvider(
      fakeRecovery(),
      deviceId,
      () => new Date("2026-07-14T10:00:00.000Z"),
    );
    const provider = new LocalOnlyDataHomeProvider(
      fakeRecovery({
        kernel: undefined,
        recoveryReason: "secure_storage_unavailable",
      }),
      deviceId,
      () => new Date("2026-07-14T10:00:00.000Z"),
    );
    const status = await provider.getStatus();
    assert.equal(status.availability, "locked");
    assert.equal(status.descriptor.workspaceId, undefined);
    assert.equal(
      status.descriptor.providerInstanceId,
      (await availableProvider.getStatus()).descriptor.providerInstanceId,
    );
    assert.ok(status.recoveryActions.includes("open_system_credentials"));
  });
});
