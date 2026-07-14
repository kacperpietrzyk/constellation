import type {
  DataHomeStatus,
  WorkspaceBackupExportResult,
  WorkspaceRestorePreviewResult,
  WorkspaceRestoreResult,
} from "@constellation/contracts";

/** Privileged lifecycle port shared by every Data Home implementation. */
export interface DataHomeProvider {
  getStatus(): Promise<DataHomeStatus>;
  exportPortableCheckpoint(): Promise<WorkspaceBackupExportResult>;
  prepareProviderMigration(
    recoveryCode: string,
  ): Promise<WorkspaceRestorePreviewResult>;
  confirmProviderMigration(restoreId: string): Promise<WorkspaceRestoreResult>;
  cancelProviderMigration(restoreId: string): void;
}
