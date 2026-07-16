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
  GrantId,
  CredentialId,
  Capability,
  RemoteMcpFederationScope,
  RemoteMcpGrantProjection,
  CalendarBlockDraft,
  CalendarWritePreview,
  MeetingLoopSurface,
  MeetingWorkItem,
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
  prepareAgentCredential: "constellation:agent:prepare-credential",
  listRemoteAgentGrants: "constellation:agent:remote:list",
  createRemoteAgentGrant: "constellation:agent:remote:create",
  rotateRemoteAgentGrant: "constellation:agent:remote:rotate",
  revokeRemoteAgentGrant: "constellation:agent:remote:revoke",
  getMeetingLoop: "constellation:meeting-loop:get",
  requestCalendarAccess: "constellation:calendar:request-access",
  editMeetingWorkItem: "constellation:meeting-loop:edit-work-item",
  addMeetingWorkItem: "constellation:meeting-loop:add-work-item",
  previewCalendarBlocks: "constellation:calendar-blocks:preview",
  confirmCalendarBlocks: "constellation:calendar-blocks:confirm",
  getJamieStatus: "constellation:jamie:status",
  configureJamie: "constellation:jamie:configure",
  syncJamie: "constellation:jamie:sync",
  disconnectJamie: "constellation:jamie:disconnect",
  getReleaseStatus: "constellation:release:status",
  checkForRelease: "constellation:release:check",
  downloadRelease: "constellation:release:download",
  installRelease: "constellation:release:install",
  openDetachedSurface: "constellation:shell:open-detached-surface",
  listWorkspaces: "constellation:workspace:list",
  createWorkspace: "constellation:workspace:create",
  switchWorkspace: "constellation:workspace:switch",
  getCrossWorkspaceCockpit: "constellation:workspace:cockpit",
  previewStarterWorkspace: "constellation:workspace:preview-starter",
  importStarterWorkspace: "constellation:workspace:import-starter",
} as const;

export type DesktopSurface =
  | "cockpit"
  | "work"
  | "tasks"
  | "projects"
  | "history"
  | "activity"
  | "attention"
  | "access"
  | "documents"
  | "meetings"
  | "relationships"
  | "settings";

export interface DesktopWorkspaceEntry {
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly active: boolean;
}

export type DesktopWorkspaceOperationResult =
  | { readonly outcome: "success" }
  | {
      readonly outcome: "failure";
      readonly code: "invalid_name" | "workspace_missing" | "operation_failed";
    };

export interface DesktopWorkspaceCockpitEntry extends DesktopWorkspaceEntry {
  readonly availability: "ready" | "unavailable";
  readonly focusCount?: number;
  readonly firstFocus?: string;
}

export interface StarterWorkspaceCounts {
  readonly areas: number;
  readonly initiatives: number;
  readonly projects: number;
  readonly tasks: number;
  readonly links: number;
}

export type StarterWorkspacePreviewResponse =
  | { readonly outcome: "success"; readonly counts: StarterWorkspaceCounts }
  | {
      readonly outcome: "failure";
      readonly code: "manifest_invalid" | "unavailable";
    };

export type StarterWorkspaceImportResponse =
  | {
      readonly outcome: "success";
      readonly counts: StarterWorkspaceCounts;
    }
  | {
      readonly outcome: "failure";
      readonly code: "manifest_invalid" | "import_failed" | "unavailable";
    };

export type ReleaseStatus =
  | {
      readonly kind: "unavailable";
      readonly currentVersion: string;
      readonly reason:
        | "developer_preview"
        | "mechanism_only_build"
        | "platform_unsupported"
        | "release_origin_missing";
    }
  | { readonly kind: "idle"; readonly currentVersion: string }
  | { readonly kind: "checking"; readonly currentVersion: string }
  | {
      readonly kind: "current";
      readonly currentVersion: string;
      readonly checkedAt: string;
    }
  | {
      readonly kind: "available";
      readonly currentVersion: string;
      readonly version: string;
      readonly releasedAt?: string;
    }
  | {
      readonly kind: "downloading";
      readonly currentVersion: string;
      readonly version: string;
    }
  | {
      readonly kind: "ready";
      readonly currentVersion: string;
      readonly version: string;
    }
  | {
      readonly kind: "installing";
      readonly currentVersion: string;
      readonly version: string;
    }
  | {
      readonly kind: "failure";
      readonly currentVersion: string;
      readonly operation: "check" | "download" | "install";
      readonly message: string;
    };

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
  openDetachedSurface?(surface: DesktopSurface): Promise<void>;
  listWorkspaces?(): Promise<readonly DesktopWorkspaceEntry[]>;
  createWorkspace?(input: {
    readonly name: string;
  }): Promise<DesktopWorkspaceOperationResult>;
  switchWorkspace?(input: {
    readonly workspaceId: WorkspaceId;
  }): Promise<DesktopWorkspaceOperationResult>;
  getCrossWorkspaceCockpit?(): Promise<readonly DesktopWorkspaceCockpitEntry[]>;
  previewStarterWorkspace?(
    manifest: unknown,
  ): Promise<StarterWorkspacePreviewResponse>;
  importStarterWorkspace?(
    manifest: unknown,
  ): Promise<StarterWorkspaceImportResponse>;
  getReleaseStatus(): Promise<ReleaseStatus>;
  checkForRelease(): Promise<ReleaseStatus>;
  downloadRelease(): Promise<ReleaseStatus>;
  installRelease(): Promise<ReleaseStatus>;
  getJamieStatus(): Promise<{
    readonly configured: boolean;
    readonly scope?: "personal" | "workspace";
  }>;
  configureJamie(input: {
    readonly apiKey: string;
    readonly scope: "personal" | "workspace";
  }): Promise<void>;
  syncJamie(): Promise<{
    readonly applied: number;
    readonly corrected: number;
    readonly noChange: number;
    readonly partial: number;
    readonly conflicted: number;
    readonly failed: number;
  }>;
  disconnectJamie(): Promise<void>;
  requestCalendarAccess(): Promise<MeetingLoopSurface["capability"]>;
  editMeetingWorkItem(input: {
    readonly meetingId: string;
    readonly workItemId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly state: MeetingWorkItem["state"];
  }): Promise<boolean>;
  addMeetingWorkItem(input: {
    readonly meetingId: string;
    readonly requestId: string;
    readonly kind: MeetingWorkItem["kind"];
    readonly title: string;
  }): Promise<boolean>;
  getMeetingLoop(input: {
    readonly from: string;
    readonly to: string;
  }): Promise<MeetingLoopSurface>;
  previewCalendarBlocks(input: {
    readonly blocks: readonly CalendarBlockDraft[];
  }): Promise<CalendarWritePreview | undefined>;
  confirmCalendarBlocks(input: {
    readonly previewId: string;
    readonly consentToken: string;
    readonly blocks: readonly CalendarBlockDraft[];
  }): Promise<
    | { readonly outcome: "applied"; readonly revisions: readonly string[] }
    | { readonly outcome: "rejected"; readonly code: string }
  >;
  listRemoteAgentGrants(): Promise<{
    readonly policyVersion: number;
    readonly workspaceVersion: number;
    readonly grants: readonly RemoteMcpGrantProjection[];
  }>;
  createRemoteAgentGrant(input: {
    readonly displayName: string;
    readonly preset: "observe" | "propose" | "operate" | "full_access";
    readonly capabilityScope: readonly Capability[];
    readonly spaces: readonly {
      readonly spaceId: SpaceId;
      readonly access: "view" | "comment" | "edit";
    }[];
    readonly federationScope: RemoteMcpFederationScope;
    readonly expiresAt?: string;
  }): Promise<{
    readonly grant: RemoteMcpGrantProjection;
    readonly endpoint: string;
    readonly descriptorPath: string;
  }>;
  rotateRemoteAgentGrant(input: {
    readonly grantId: GrantId;
    readonly expectedVersion: number;
  }): Promise<{
    readonly grant: RemoteMcpGrantProjection;
    readonly endpoint: string;
    readonly descriptorPath: string;
  }>;
  revokeRemoteAgentGrant(input: {
    readonly grantId: GrantId;
    readonly expectedVersion: number;
  }): Promise<{ readonly grant: RemoteMcpGrantProjection }>;
  prepareAgentCredential(input: { readonly grantId: GrantId }): Promise<{
    readonly credentialId: CredentialId;
    readonly credentialDigest: string;
    readonly descriptorPath: string;
    readonly launchCommand: string;
    readonly launchArgs: readonly string[];
    readonly launchEnvironment: Readonly<Record<string, string>>;
  }>;
  acknowledgeDocumentUpdates(input: {
    readonly documentId: DocumentId;
    readonly spaceId: SpaceId;
  }): Promise<void>;
  onAttentionActivated(
    listener: (
      destination:
        | { readonly kind: "task"; readonly taskId: TaskId }
        | { readonly kind: "project"; readonly projectId: ProjectId }
        | { readonly kind: "document"; readonly documentId: DocumentId },
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
  openDetachedSurface: (surface) =>
    invoke(DESKTOP_CHANNELS.openDetachedSurface, { surface }) as Promise<void>,
  listWorkspaces: () =>
    invoke(DESKTOP_CHANNELS.listWorkspaces) as Promise<
      readonly DesktopWorkspaceEntry[]
    >,
  createWorkspace: (input) =>
    invoke(
      DESKTOP_CHANNELS.createWorkspace,
      input,
    ) as Promise<DesktopWorkspaceOperationResult>,
  switchWorkspace: (input) =>
    invoke(
      DESKTOP_CHANNELS.switchWorkspace,
      input,
    ) as Promise<DesktopWorkspaceOperationResult>,
  getCrossWorkspaceCockpit: () =>
    invoke(DESKTOP_CHANNELS.getCrossWorkspaceCockpit) as Promise<
      readonly DesktopWorkspaceCockpitEntry[]
    >,
  previewStarterWorkspace: (manifest) =>
    invoke(
      DESKTOP_CHANNELS.previewStarterWorkspace,
      manifest,
    ) as Promise<StarterWorkspacePreviewResponse>,
  importStarterWorkspace: (manifest) =>
    invoke(
      DESKTOP_CHANNELS.importStarterWorkspace,
      manifest,
    ) as Promise<StarterWorkspaceImportResponse>,
  getReleaseStatus: () =>
    invoke(DESKTOP_CHANNELS.getReleaseStatus) as Promise<ReleaseStatus>,
  checkForRelease: () =>
    invoke(DESKTOP_CHANNELS.checkForRelease) as Promise<ReleaseStatus>,
  downloadRelease: () =>
    invoke(DESKTOP_CHANNELS.downloadRelease) as Promise<ReleaseStatus>,
  installRelease: () =>
    invoke(DESKTOP_CHANNELS.installRelease) as Promise<ReleaseStatus>,
  getJamieStatus: () =>
    invoke(DESKTOP_CHANNELS.getJamieStatus) as ReturnType<
      ConstellationRendererClient["getJamieStatus"]
    >,
  configureJamie: (input) =>
    invoke(DESKTOP_CHANNELS.configureJamie, input) as ReturnType<
      ConstellationRendererClient["configureJamie"]
    >,
  syncJamie: () =>
    invoke(DESKTOP_CHANNELS.syncJamie) as ReturnType<
      ConstellationRendererClient["syncJamie"]
    >,
  disconnectJamie: () =>
    invoke(DESKTOP_CHANNELS.disconnectJamie) as ReturnType<
      ConstellationRendererClient["disconnectJamie"]
    >,
  requestCalendarAccess: () =>
    invoke(DESKTOP_CHANNELS.requestCalendarAccess) as ReturnType<
      ConstellationRendererClient["requestCalendarAccess"]
    >,
  editMeetingWorkItem: (input) =>
    invoke(DESKTOP_CHANNELS.editMeetingWorkItem, input) as ReturnType<
      ConstellationRendererClient["editMeetingWorkItem"]
    >,
  addMeetingWorkItem: (input) =>
    invoke(DESKTOP_CHANNELS.addMeetingWorkItem, input) as ReturnType<
      ConstellationRendererClient["addMeetingWorkItem"]
    >,
  getMeetingLoop: (input) =>
    invoke(
      DESKTOP_CHANNELS.getMeetingLoop,
      input,
    ) as Promise<MeetingLoopSurface>,
  previewCalendarBlocks: (input) =>
    invoke(DESKTOP_CHANNELS.previewCalendarBlocks, input) as Promise<
      CalendarWritePreview | undefined
    >,
  confirmCalendarBlocks: (input) =>
    invoke(DESKTOP_CHANNELS.confirmCalendarBlocks, input) as ReturnType<
      ConstellationRendererClient["confirmCalendarBlocks"]
    >,
  listRemoteAgentGrants: () =>
    invoke(DESKTOP_CHANNELS.listRemoteAgentGrants) as ReturnType<
      ConstellationRendererClient["listRemoteAgentGrants"]
    >,
  createRemoteAgentGrant: (input) =>
    invoke(DESKTOP_CHANNELS.createRemoteAgentGrant, input) as ReturnType<
      ConstellationRendererClient["createRemoteAgentGrant"]
    >,
  rotateRemoteAgentGrant: (input) =>
    invoke(DESKTOP_CHANNELS.rotateRemoteAgentGrant, input) as ReturnType<
      ConstellationRendererClient["rotateRemoteAgentGrant"]
    >,
  revokeRemoteAgentGrant: (input) =>
    invoke(DESKTOP_CHANNELS.revokeRemoteAgentGrant, input) as ReturnType<
      ConstellationRendererClient["revokeRemoteAgentGrant"]
    >,
  prepareAgentCredential: (input) =>
    invoke(DESKTOP_CHANNELS.prepareAgentCredential, input) as ReturnType<
      ConstellationRendererClient["prepareAgentCredential"]
    >,
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
