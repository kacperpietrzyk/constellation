import {
  DataHomeStatusSchema,
  LOCAL_ONLY_PROVIDER_ID,
  type DataHomeCapabilities,
  type DataHomeStatus,
  type DeviceId,
  type WorkspaceBackupExportResult,
  type WorkspaceId,
  type WorkspaceRestorePreviewResult,
  type WorkspaceRestoreResult,
} from "@constellation/contracts";
import type { DataHomeProvider } from "@constellation/application";

export interface LocalDataHomeRecoveryPort {
  readonly kernel:
    { readonly identity: { readonly workspaceId: WorkspaceId } } | undefined;
  readonly recoveryReason:
    | "none"
    | "secure_storage_unavailable"
    | "protected_key_unavailable"
    | "workspace_unavailable";
  cancelRestore(restoreId: string): void;
  confirmRestore(restoreId: string): Promise<WorkspaceRestoreResult>;
  exportBackup(): Promise<WorkspaceBackupExportResult>;
  prepareRestore(recoveryCode: string): Promise<WorkspaceRestorePreviewResult>;
}

const unsupported = (reason: string) =>
  ({ support: "unsupported", reason }) as const;
const supported = { support: "supported" } as const;

export const LOCAL_ONLY_DATA_HOME_CAPABILITIES: DataHomeCapabilities = {
  ordered_changes: unsupported(
    "Local-only work has no remote change exchange or synchronization queue.",
  ),
  checkpoints: supported,
  tombstones: unsupported(
    "Tombstone propagation applies only to coordinated providers.",
  ),
  attachments: supported,
  quota: unsupported(
    "Constellation does not infer a provider quota from a local filesystem volume.",
  ),
  portable_export: supported,
  portable_import: supported,
  provider_migration: supported,
  device_revocation: unsupported(
    "A local-only Data Home has no remote authority that can revoke this device.",
  ),
};

export class LocalOnlyDataHomeProvider implements DataHomeProvider {
  private checkpointState: DataHomeStatus["checkpointState"] = "none_recorded";

  public constructor(
    private readonly recovery: LocalDataHomeRecoveryPort,
    private readonly deviceId: DeviceId,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async getStatus(): Promise<DataHomeStatus> {
    const workspaceId = this.recovery.kernel?.identity.workspaceId;
    const reason = this.recovery.recoveryReason;
    const availability =
      this.recovery.kernel !== undefined
        ? ("available" as const)
        : reason === "secure_storage_unavailable"
          ? ("locked" as const)
          : ("recovery_required" as const);
    const recoveryActions =
      availability === "available"
        ? (["export_checkpoint", "restore_checkpoint"] as const)
        : reason === "secure_storage_unavailable"
          ? ([
              "open_system_credentials",
              "retry_open",
              "restore_checkpoint",
            ] as const)
          : (["retry_open", "restore_checkpoint"] as const);
    return DataHomeStatusSchema.parse({
      descriptor: {
        contractVersion: 1,
        providerId: LOCAL_ONLY_PROVIDER_ID,
        providerInstanceId: `${LOCAL_ONLY_PROVIDER_ID}:${this.deviceId}`,
        ...(workspaceId === undefined ? {} : { workspaceId }),
        deviceId: this.deviceId,
        providerKind: "local_only",
        storageRole: "canonical",
        displayName: "Local only",
        location: "this_device",
        capabilities: LOCAL_ONLY_DATA_HOME_CAPABILITIES,
        encryption: {
          atRest: "sqlcipher",
          keyCustody: "operating_system",
          portableRecovery: "separate_recovery_code",
        },
      },
      availability,
      syncState: "not_configured",
      checkpointState: this.checkpointState,
      quota: { state: "unknown" },
      lastVerifiedAt: this.now().toISOString(),
      recoveryActions,
      detailCode:
        availability === "available"
          ? "ready"
          : reason === "secure_storage_unavailable"
            ? "secure_storage_unavailable"
            : reason === "protected_key_unavailable"
              ? "protected_key_unavailable"
              : "workspace_unavailable",
    });
  }

  public async exportPortableCheckpoint(): Promise<WorkspaceBackupExportResult> {
    const result = await this.recovery.exportBackup();
    if (result.outcome === "success") {
      this.checkpointState = "verified_this_session";
    }
    return result;
  }

  public prepareProviderMigration(
    recoveryCode: string,
  ): Promise<WorkspaceRestorePreviewResult> {
    return this.recovery.prepareRestore(recoveryCode);
  }

  public async confirmProviderMigration(
    restoreId: string,
  ): Promise<WorkspaceRestoreResult> {
    const result = await this.recovery.confirmRestore(restoreId);
    if (result.outcome === "success") {
      this.checkpointState = "verified_this_session";
    }
    return result;
  }

  public cancelProviderMigration(restoreId: string): void {
    this.recovery.cancelRestore(restoreId);
  }
}
