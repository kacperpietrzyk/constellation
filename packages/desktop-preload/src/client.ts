import type {
  CommandEnvelope,
  CommandOutcome,
  ContractIssue,
  QueryEnvelope,
  QueryResult,
  WorkspaceId,
} from "@constellation/contracts";

export const DESKTOP_CHANNELS = {
  executeCommand: "constellation:command:execute",
  getBuildInfo: "constellation:build:info",
  runQuery: "constellation:query:run",
  exportWorkspaceBackup: "constellation:workspace-backup:export",
  prepareWorkspaceRestore: "constellation:workspace-backup:prepare-restore",
  confirmWorkspaceRestore: "constellation:workspace-backup:confirm-restore",
  cancelWorkspaceRestore: "constellation:workspace-backup:cancel-restore",
} as const;

export interface WorkspaceBackupMetadataDto {
  readonly archiveId: string;
  readonly workspaceId: WorkspaceId;
  readonly workspaceName: string;
  readonly createdAt: string;
  readonly appVersion: string;
  readonly databaseByteLength: number;
}

export interface WorkspaceRecoveryCountsDto {
  readonly captures: number;
  readonly tasks: number;
  readonly projects: number;
  readonly relations: number;
  readonly auditReceipts: number;
}

export type WorkspaceBackupFailureCode =
  | "secure_storage_unavailable"
  | "archive_invalid"
  | "archive_unsupported"
  | "recovery_code_invalid"
  | "workspace_identity_invalid"
  | "operation_busy"
  | "io_failed"
  | "restore_interrupted";

export type WorkspaceBackupExportResult =
  | { readonly outcome: "cancelled" }
  | {
      readonly outcome: "success";
      readonly recoveryCode: string;
      readonly fileLabel: string;
      readonly metadata: WorkspaceBackupMetadataDto;
    }
  | {
      readonly outcome: "failure";
      readonly code: WorkspaceBackupFailureCode;
    };

export type WorkspaceRestorePreviewResult =
  | { readonly outcome: "cancelled" }
  | {
      readonly outcome: "preview";
      readonly restoreId: string;
      readonly metadata: WorkspaceBackupMetadataDto;
      readonly counts: WorkspaceRecoveryCountsDto;
    }
  | {
      readonly outcome: "failure";
      readonly code: WorkspaceBackupFailureCode;
    };

export type WorkspaceRestoreResult =
  | { readonly outcome: "success"; readonly workspaceId: WorkspaceId }
  | {
      readonly outcome: "failure";
      readonly code: WorkspaceBackupFailureCode;
    };

export interface ContractRejection {
  readonly kind: "contract_rejected";
  readonly diagnosticCode: "contract.invalid";
  readonly issues: readonly ContractIssue[];
}

export type RendererCommandResponse =
  | { readonly kind: "command_outcome"; readonly outcome: CommandOutcome }
  | ContractRejection;

export type RendererQueryResponse =
  | { readonly kind: "query_result"; readonly result: QueryResult }
  | ContractRejection;

export interface DesktopBuildInfo {
  readonly channel: "developer-preview" | "local-alpha";
  readonly initialWorkspaceId?: WorkspaceId;
  readonly persistence: "in-memory" | "encrypted-local";
  readonly version: string;
  readonly startupRecovery: "none" | "previous_workspace_restored";
  readonly workspaceAvailability: "ready" | "recovery_required";
  readonly recoveryReason?:
    | "secure_storage_unavailable"
    | "protected_key_unavailable"
    | "workspace_unavailable";
}

export interface ConstellationRendererClient {
  cancelWorkspaceRestore(input: { readonly restoreId: string }): Promise<void>;
  confirmWorkspaceRestore(input: {
    readonly restoreId: string;
  }): Promise<WorkspaceRestoreResult>;
  executeCommand(command: CommandEnvelope): Promise<RendererCommandResponse>;
  exportWorkspaceBackup(): Promise<WorkspaceBackupExportResult>;
  getBuildInfo(): Promise<DesktopBuildInfo>;
  prepareWorkspaceRestore(input: {
    readonly recoveryCode: string;
  }): Promise<WorkspaceRestorePreviewResult>;
  runQuery(query: QueryEnvelope): Promise<RendererQueryResponse>;
}

export type DesktopInvoke = (
  channel: (typeof DESKTOP_CHANNELS)[keyof typeof DESKTOP_CHANNELS],
  payload?: unknown,
) => Promise<unknown>;

export const createRendererClient = (
  invoke: DesktopInvoke,
): ConstellationRendererClient => ({
  cancelWorkspaceRestore: (input) =>
    invoke(DESKTOP_CHANNELS.cancelWorkspaceRestore, input) as Promise<void>,
  confirmWorkspaceRestore: (input) =>
    invoke(
      DESKTOP_CHANNELS.confirmWorkspaceRestore,
      input,
    ) as Promise<WorkspaceRestoreResult>,
  executeCommand: (command) =>
    invoke(
      DESKTOP_CHANNELS.executeCommand,
      command,
    ) as Promise<RendererCommandResponse>,
  getBuildInfo: () =>
    invoke(DESKTOP_CHANNELS.getBuildInfo) as Promise<DesktopBuildInfo>,
  exportWorkspaceBackup: () =>
    invoke(
      DESKTOP_CHANNELS.exportWorkspaceBackup,
    ) as Promise<WorkspaceBackupExportResult>,
  prepareWorkspaceRestore: (input) =>
    invoke(
      DESKTOP_CHANNELS.prepareWorkspaceRestore,
      input,
    ) as Promise<WorkspaceRestorePreviewResult>,
  runQuery: (query) =>
    invoke(DESKTOP_CHANNELS.runQuery, query) as Promise<RendererQueryResponse>,
});
