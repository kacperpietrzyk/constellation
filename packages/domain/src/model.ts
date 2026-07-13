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
  ProjectId,
  RelationId,
  RequestOrigin,
  SpaceId,
  TaskId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";

export interface Workspace {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly timezone: string;
  readonly rootSpaceId: SpaceId;
  readonly defaultTaskStatusId: TaskStatusId;
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

interface CaptureBase {
  readonly id: CaptureId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly originalText: string;
  readonly deviceId: string;
  readonly source: "global_quick_capture" | "in_app_quick_capture";
  readonly capturedAt: string;
  readonly submittedBy: PrincipalId;
  readonly version: number;
}

export type PendingCapture = CaptureBase & {
  readonly processingState: "pending_processing";
};

export type RoutedTaskCapture = CaptureBase & {
  readonly processingState: "routed_as_task";
  readonly derivedTaskId: TaskId;
  readonly routedAt: string;
  readonly routedBy: PrincipalId;
};

export type Capture = PendingCapture | RoutedTaskCapture;

export interface TaskStatusDefinition {
  readonly id: TaskStatusId;
  readonly workspaceId: WorkspaceId;
  readonly label: string;
  readonly operationalSemantics: "actionable";
  readonly position: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Task {
  readonly id: TaskId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly statusId: TaskStatusId;
  readonly completionState: "open" | "completed";
  readonly completedAt?: string;
  readonly sourceCaptureId?: CaptureId;
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Project {
  readonly id: ProjectId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly intendedOutcome: string;
  readonly lifecycle: "active";
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskProjectRelation {
  readonly id: RelationId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly relationType: "task_contributes_to_project";
  readonly state: "active" | "removed";
  readonly removedAt?: string;
  readonly taskId: TaskId;
  readonly projectId: ProjectId;
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
}

export type UndoDescriptor =
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "project.restore_outcome";
      readonly projectId: ProjectId;
      readonly priorOutcome: string;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "task.restore_state";
      readonly taskId: TaskId;
      readonly priorStatusId: TaskStatusId;
      readonly priorCompletionState: "open" | "completed";
      readonly priorCompletedAt?: string;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "relation.remove";
      readonly relationId: RelationId;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "relation.restore";
      readonly relationId: RelationId;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    };

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
    }
  | {
      readonly id: EventId;
      readonly type: "capture.routed_as_task";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: CaptureId;
      readonly aggregateVersion: number;
      readonly taskId: TaskId;
      readonly taskStatusId: TaskStatusId;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "project.created" | "project.outcome_updated";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: ProjectId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "task.status_changed" | "task.completed" | "task.reopened";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: TaskId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "relation.created" | "relation.removed";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: RelationId;
      readonly aggregateVersion: number;
      readonly taskId: TaskId;
      readonly projectId: ProjectId;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "command.undone";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: string;
      readonly aggregateVersion: number;
      readonly targetCommandId: CommandId;
      readonly occurredAt: string;
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
    | "workspace.projection.requested"
    | "capture.processing.requested"
    | "work.projection.requested";
  readonly createdAt: string;
}
