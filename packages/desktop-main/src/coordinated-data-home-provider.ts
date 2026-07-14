import type { DataHomeProvider } from "@constellation/application";
import {
  DataHomeStatusSchema,
  type DataHomeCapabilities,
  type DataHomeStatus,
  type DeviceId,
  type WorkspaceBackupExportResult,
  type WorkspaceId,
  type WorkspaceRestorePreviewResult,
  type WorkspaceRestoreResult,
} from "@constellation/contracts";
import type { SqliteApplicationStore } from "@constellation/local-store";

import type { CoordinatedSyncEngine } from "./coordinated-sync-engine.js";
import type { LocalDataHomeRecoveryPort } from "./local-data-home-provider.js";

export const SELF_HOSTED_HUB_PROVIDER_ID = "constellation.self-hosted-hub/v1";

const supported = { support: "supported" } as const;
const unsupported = (reason: string) =>
  ({ support: "unsupported", reason }) as const;
export const SELF_HOSTED_HUB_CAPABILITIES: DataHomeCapabilities = {
  ordered_changes: supported,
  checkpoints: supported,
  tombstones: supported,
  attachments: supported,
  quota: unsupported(
    "This self-hosted preview does not yet claim an operator storage quota.",
  ),
  portable_export: supported,
  portable_import: supported,
  provider_migration: supported,
  device_revocation: supported,
};

export class CoordinatedDataHomeProvider implements DataHomeProvider {
  private checkpointState: DataHomeStatus["checkpointState"] = "none_recorded";
  private activeSync: ReturnType<CoordinatedSyncEngine["syncNow"]> | undefined;

  public constructor(
    private readonly input: {
      readonly workspaceId: WorkspaceId;
      readonly deviceId: DeviceId;
      readonly providerInstanceId: string;
      readonly displayName: string;
      readonly store: SqliteApplicationStore;
      readonly recovery: LocalDataHomeRecoveryPort;
      readonly sync: CoordinatedSyncEngine;
      readonly now?: () => Date;
    },
  ) {}

  public syncNow(): ReturnType<CoordinatedSyncEngine["syncNow"]> {
    if (this.activeSync !== undefined) return this.activeSync;
    const running = this.input.sync.syncNow();
    this.activeSync = running;
    void running.finally(() => {
      if (this.activeSync === running) this.activeSync = undefined;
    });
    return running;
  }

  public async getStatus(): Promise<DataHomeStatus> {
    const coordination = this.input.store.getCoordinationState();
    if (coordination === undefined) {
      throw new Error("Coordinated Data Home state is unavailable.");
    }
    const pending = this.input.store.listPendingSyncCommands().length;
    const availability =
      coordination.syncState === "revoked" ? "unavailable" : "available";
    const syncState =
      coordination.syncState === "revoked"
        ? "offline"
        : coordination.syncState === "unknown_reconcile"
          ? "unknown_reconcile"
          : coordination.syncState;
    const detailCode =
      coordination.syncState === "offline"
        ? "hub_unreachable"
        : coordination.syncState === "revoked"
          ? coordination.lastErrorCode === "membership_revoked"
            ? "membership_revoked"
            : "device_revoked"
          : coordination.syncState === "conflict"
            ? "sync_conflict"
            : coordination.syncState === "unknown_reconcile"
              ? "sync_unknown_reconcile"
              : "ready";
    return DataHomeStatusSchema.parse({
      descriptor: {
        contractVersion: 1,
        providerId: SELF_HOSTED_HUB_PROVIDER_ID,
        providerInstanceId: this.input.providerInstanceId,
        workspaceId: this.input.workspaceId,
        deviceId: this.input.deviceId,
        providerKind: "coordinated",
        storageRole: "projection_with_outbox",
        displayName: this.input.displayName,
        location: "provider_managed",
        capabilities: SELF_HOSTED_HUB_CAPABILITIES,
        encryption: {
          atRest: "sqlcipher",
          keyCustody: "operating_system",
          portableRecovery: "separate_recovery_code",
        },
      },
      availability,
      syncState: pending > 0 && syncState === "current" ? "queued" : syncState,
      checkpointState: this.checkpointState,
      quota: { state: "unknown" },
      lastVerifiedAt:
        coordination.lastSyncedAt ??
        (this.input.now ?? (() => new Date()))().toISOString(),
      recoveryActions:
        availability === "available"
          ? ["reconcile_provider", "export_checkpoint", "restore_checkpoint"]
          : ["contact_provider", "restore_checkpoint"],
      detailCode,
    });
  }

  public async exportPortableCheckpoint(): Promise<WorkspaceBackupExportResult> {
    const result = await this.input.recovery.exportBackup();
    if (result.outcome === "success")
      this.checkpointState = "verified_this_session";
    return result;
  }

  public prepareProviderMigration(
    recoveryCode: string,
  ): Promise<WorkspaceRestorePreviewResult> {
    return this.input.recovery.prepareRestore(recoveryCode);
  }

  public async confirmProviderMigration(
    restoreId: string,
  ): Promise<WorkspaceRestoreResult> {
    const result = await this.input.recovery.confirmRestore(restoreId);
    if (result.outcome === "success")
      this.checkpointState = "verified_this_session";
    return result;
  }

  public cancelProviderMigration(restoreId: string): void {
    this.input.recovery.cancelRestore(restoreId);
  }
}
