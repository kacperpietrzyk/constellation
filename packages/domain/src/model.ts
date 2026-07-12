import type {
  AuditReceiptId,
  CaptureId,
  CommandId,
  CorrelationId,
  EventId,
  GrantId,
  MembershipId,
  OutboxEntryId,
  PrincipalId,
  RequestOrigin,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

export interface Workspace {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly timezone: string;
  readonly rootSpaceId: SpaceId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Space {
  readonly id: SpaceId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly version: number;
  readonly createdAt: string;
}

export type WorkspaceRole = "owner" | "admin" | "member" | "guest";

export interface WorkspaceMembership {
  readonly id: MembershipId;
  readonly workspaceId: WorkspaceId;
  readonly principalId: PrincipalId;
  readonly role: WorkspaceRole;
  readonly version: number;
  readonly createdAt: string;
}

export interface Capture {
  readonly id: CaptureId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly originalText: string;
  readonly deviceId: string;
  readonly source: "global_quick_capture" | "in_app_quick_capture";
  readonly capturedAt: string;
  readonly processingState: "pending_processing";
  readonly submittedBy: PrincipalId;
  readonly version: number;
}

export type DomainEvent =
  | {
      readonly id: EventId;
      readonly type: "workspace.created";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: WorkspaceId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "workspace.renamed";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: WorkspaceId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "capture.submitted";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: CaptureId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
      readonly source: Capture["source"];
    };

export interface AuditReceipt {
  readonly id: AuditReceiptId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly principalId: PrincipalId;
  readonly grantId: GrantId;
  readonly origin: RequestOrigin;
  readonly commandId: CommandId;
  readonly commandName: string;
  readonly correlationId: CorrelationId;
  readonly affectedRecordIds: readonly string[];
  readonly recordVersions: Readonly<Record<string, number>>;
  readonly changedFields: readonly string[];
  readonly occurredAt: string;
  readonly outcome: "success";
}

export interface OutboxEntry {
  readonly id: OutboxEntryId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly eventId: EventId;
  readonly topic:
    "workspace.projection.requested" | "capture.processing.requested";
  readonly createdAt: string;
}
