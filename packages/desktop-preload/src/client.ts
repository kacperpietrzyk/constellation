import type {
  CommandEnvelope,
  CommandOutcome,
  ContractIssue,
  DataHomeStatus,
  QueryEnvelope,
  QueryResult,
  WorkspaceBackupExportResult,
  WorkspaceRestorePreviewResult,
  WorkspaceRestoreResult,
  WorkspaceId,
} from "@constellation/contracts";

export type {
  DataHomeStatus,
  WorkspaceBackupExportResult,
  WorkspaceBackupFailureCode,
  WorkspaceBackupMetadata,
  WorkspaceRecoveryCounts,
  WorkspaceRestorePreviewResult,
  WorkspaceRestoreResult,
} from "@constellation/contracts";

export const DESKTOP_CHANNELS = {
  executeCommand: "constellation:command:execute",
  getBuildInfo: "constellation:build:info",
  getDataHomeStatus: "constellation:data-home:status",
  exportHubAuthorization: "constellation:data-home:export-hub-authorization",
  enrollHub: "constellation:data-home:enroll-hub",
  syncDataHome: "constellation:data-home:sync-now",
  runQuery: "constellation:query:run",
  exportWorkspaceBackup: "constellation:workspace-backup:export",
  prepareWorkspaceRestore: "constellation:workspace-backup:prepare-restore",
  confirmWorkspaceRestore: "constellation:workspace-backup:confirm-restore",
  cancelWorkspaceRestore: "constellation:workspace-backup:cancel-restore",
} as const;

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
  exportHubAuthorization(): Promise<
    | { readonly outcome: "success"; readonly fileLabel: string }
    | { readonly outcome: "cancelled" }
    | { readonly outcome: "failure" }
  >;
  getBuildInfo(): Promise<DesktopBuildInfo>;
  getDataHomeStatus(): Promise<DataHomeStatus>;
  enrollHub(input: {
    readonly hubOrigin: string;
    readonly enrollmentSecret: string;
    readonly deviceLabel: string;
  }): Promise<
    | { readonly outcome: "success"; readonly status: DataHomeStatus }
    | {
        readonly outcome: "rejected";
        readonly code:
          | "input_invalid"
          | "workspace_unavailable"
          | "enrollment_invalid"
          | "enrollment_expired"
          | "enrollment_used"
          | "device_already_enrolled"
          | "hub_unreachable"
          | "credential_storage_failed";
      }
  >;
  syncDataHome(): Promise<DataHomeStatus>;
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
  getDataHomeStatus: () =>
    invoke(DESKTOP_CHANNELS.getDataHomeStatus) as Promise<DataHomeStatus>,
  exportHubAuthorization: () =>
    invoke(DESKTOP_CHANNELS.exportHubAuthorization) as ReturnType<
      ConstellationRendererClient["exportHubAuthorization"]
    >,
  enrollHub: (input) =>
    invoke(DESKTOP_CHANNELS.enrollHub, input) as ReturnType<
      ConstellationRendererClient["enrollHub"]
    >,
  syncDataHome: () =>
    invoke(DESKTOP_CHANNELS.syncDataHome) as Promise<DataHomeStatus>,
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
