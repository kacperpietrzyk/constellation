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
  DocumentId,
  DocumentRevisionId,
  PrincipalId,
  SpaceId,
  TaskId,
  ProjectId,
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
  attentionActivated: "constellation:attention:activated",
  openDocument: "constellation:document:open",
  persistDocumentUpdate: "constellation:document:persist-update",
  acknowledgeDocumentUpdates: "constellation:document:acknowledge-updates",
  createDocumentRevision: "constellation:document:create-revision",
  listDocumentRevisions: "constellation:document:list-revisions",
  restoreDocumentRevision: "constellation:document:restore-revision",
} as const;

export interface RendererDocumentRevision {
  readonly id: DocumentRevisionId;
  readonly name: string;
  readonly createdBy: PrincipalId;
  readonly createdAt: string;
  readonly restoredFromRevisionId?: DocumentRevisionId;
}

export interface RendererDocumentOpenResult {
  readonly mode: "local" | "coordinated";
  readonly state?: Uint8Array;
  readonly pendingUpdateCount: number;
  readonly session?: {
    readonly url: string;
    readonly room: string;
    readonly token: string;
    readonly expiresAt: string;
    readonly access: "view" | "comment" | "edit";
  };
}

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
  acknowledgeDocumentUpdates(input: {
    readonly documentId: DocumentId;
    readonly spaceId: SpaceId;
  }): Promise<void>;
  onAttentionActivated(
    listener: (
      destination:
        | { readonly kind: "task"; readonly taskId: TaskId }
        | { readonly kind: "project"; readonly projectId: ProjectId },
    ) => void,
  ): () => void;
  cancelWorkspaceRestore(input: { readonly restoreId: string }): Promise<void>;
  confirmWorkspaceRestore(input: {
    readonly restoreId: string;
  }): Promise<WorkspaceRestoreResult>;
  executeCommand(command: CommandEnvelope): Promise<RendererCommandResponse>;
  createDocumentRevision(input: {
    readonly documentId: DocumentId;
    readonly name: string;
  }): Promise<DocumentRevisionId>;
  exportWorkspaceBackup(): Promise<WorkspaceBackupExportResult>;
  exportHubAuthorization(): Promise<
    | { readonly outcome: "success"; readonly fileLabel: string }
    | { readonly outcome: "cancelled" }
    | { readonly outcome: "failure" }
  >;
  getBuildInfo(): Promise<DesktopBuildInfo>;
  getDataHomeStatus(): Promise<DataHomeStatus>;
  listDocumentRevisions(input: {
    readonly documentId: DocumentId;
  }): Promise<readonly RendererDocumentRevision[]>;
  openDocument(input: {
    readonly documentId: DocumentId;
    readonly spaceId: SpaceId;
  }): Promise<RendererDocumentOpenResult>;
  persistDocumentUpdate(input: {
    readonly documentId: DocumentId;
    readonly spaceId: SpaceId;
    readonly state: Uint8Array;
    readonly update: Uint8Array;
  }): Promise<void>;
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
  restoreDocumentRevision(input: {
    readonly documentId: DocumentId;
    readonly revisionId: DocumentRevisionId;
  }): Promise<void>;
}

export type DesktopInvoke = (
  channel: (typeof DESKTOP_CHANNELS)[keyof typeof DESKTOP_CHANNELS],
  payload?: unknown,
) => Promise<unknown>;

export const createRendererClient = (
  invoke: DesktopInvoke,
): ConstellationRendererClient => ({
  acknowledgeDocumentUpdates: (input) =>
    invoke(DESKTOP_CHANNELS.acknowledgeDocumentUpdates, input) as Promise<void>,
  onAttentionActivated: () => () => undefined,
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
  createDocumentRevision: (input) =>
    invoke(
      DESKTOP_CHANNELS.createDocumentRevision,
      input,
    ) as Promise<DocumentRevisionId>,
  getBuildInfo: () =>
    invoke(DESKTOP_CHANNELS.getBuildInfo) as Promise<DesktopBuildInfo>,
  getDataHomeStatus: () =>
    invoke(DESKTOP_CHANNELS.getDataHomeStatus) as Promise<DataHomeStatus>,
  listDocumentRevisions: (input) =>
    invoke(DESKTOP_CHANNELS.listDocumentRevisions, input) as Promise<
      readonly RendererDocumentRevision[]
    >,
  openDocument: (input) =>
    invoke(
      DESKTOP_CHANNELS.openDocument,
      input,
    ) as Promise<RendererDocumentOpenResult>,
  persistDocumentUpdate: (input) =>
    invoke(DESKTOP_CHANNELS.persistDocumentUpdate, input) as Promise<void>,
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
  restoreDocumentRevision: (input) =>
    invoke(DESKTOP_CHANNELS.restoreDocumentRevision, input) as Promise<void>,
});
