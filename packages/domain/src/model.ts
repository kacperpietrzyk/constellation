import type {
  AuditReceiptId,
  CaptureId,
  CommandId,
  CorrelationId,
  DocumentId,
  DocumentRevisionId,
  EventId,
  GrantId,
  CredentialId,
  CheckpointId,
  MembershipId,
  OutboxEntryId,
  PrincipalId,
  ProjectId,
  RelationId,
  RequestOrigin,
  SpaceId,
  SpaceGrantId,
  TaskId,
  TaskAssignmentId,
  CommentId,
  AttentionSignalId,
  TaskStatusId,
  WorkspaceId,
  Capability,
  AgentRunId,
  AgentHandoffId,
  KnowledgeSourceId,
  NamedDocumentVersionId,
  StrategicRecordId,
  ImportedMeeting,
} from "@constellation/contracts";

export interface Workspace {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly timezone: string;
  readonly rootSpaceId: SpaceId;
  readonly defaultTaskStatusId: TaskStatusId;
  readonly policyVersion?: number;
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
  readonly displayName?: string;
  readonly status?: "active" | "revoked";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly revokedAt?: string;
}

export interface SpaceGrant {
  readonly id: SpaceGrantId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly principalId: PrincipalId;
  readonly access: "view" | "comment" | "edit";
  readonly status: "active" | "revoked";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revokedAt?: string;
}

export type AgentAccessPreset =
  "observe" | "propose" | "operate" | "full_access" | "custom";

export interface AgentAccessGrant {
  readonly id: GrantId;
  readonly workspaceId: WorkspaceId;
  readonly agentPrincipalId: PrincipalId;
  readonly delegatingUserId: PrincipalId;
  readonly displayName: string;
  readonly preset: AgentAccessPreset;
  readonly capabilityScope: readonly Capability[];
  readonly spaceScope: readonly SpaceId[];
  readonly credentialId: CredentialId;
  readonly credentialDigest: string;
  readonly credentialVersion: number;
  readonly status: "active" | "revoked";
  readonly expiresAt?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revokedAt?: string;
  readonly lastUsedAt?: string;
}

export interface AgentRun {
  readonly id: AgentRunId;
  readonly workspaceId: WorkspaceId;
  readonly agentPrincipalId: PrincipalId;
  readonly grantId: GrantId;
  readonly hostRunId: string;
  readonly parentHostRunId?: string;
  readonly intent?: string;
  readonly hostName: string;
  readonly hostVersion?: string;
  readonly modelProvider?: string;
  readonly modelName?: string;
  readonly attributionTrust: "host_asserted";
  readonly status: "active" | "completed";
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface AgentHandoff {
  readonly id: AgentHandoffId;
  readonly workspaceId: WorkspaceId;
  readonly agentPrincipalId: PrincipalId;
  readonly grantId: GrantId;
  readonly runId: AgentRunId;
  readonly evidence: readonly string[];
  readonly changes: readonly string[];
  readonly decisions: readonly string[];
  readonly remainingWork: readonly string[];
  readonly nextAction: string;
  readonly createdAt: string;
}

export interface AgentCheckpoint {
  readonly id: CheckpointId;
  readonly workspaceId: WorkspaceId;
  readonly agentPrincipalId: PrincipalId;
  readonly grantId: GrantId;
  readonly runId: AgentRunId;
  readonly label: string;
  readonly commandIds: readonly CommandId[];
  readonly status: "open" | "reverted";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revertedAt?: string;
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
  readonly recordState: "active" | "removed";
  readonly completionState: "open" | "completed";
  readonly completedAt?: string;
  readonly sourceCaptureId?: CaptureId;
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskAssignment {
  readonly id: TaskAssignmentId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly taskId: TaskId;
  readonly assigneePrincipalId: PrincipalId;
  readonly redactedAssigneeState?: "unavailable_member" | "former_member";
  readonly state: "active" | "removed";
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly removedAt?: string;
}

export type CommentTarget =
  | { readonly kind: "task"; readonly taskId: TaskId }
  | { readonly kind: "project"; readonly projectId: ProjectId };

export type AttentionDestination =
  | CommentTarget
  | { readonly kind: "document"; readonly documentId: DocumentId };

export interface CommentRevision {
  readonly body: string;
  readonly mentionPrincipalIds: readonly PrincipalId[];
  readonly editedBy: PrincipalId;
  readonly editedAt: string;
}

export interface RecordComment {
  readonly id: CommentId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly target: CommentTarget;
  readonly parentCommentId?: CommentId;
  readonly rootCommentId: CommentId;
  readonly body: string;
  readonly mentionPrincipalIds: readonly PrincipalId[];
  readonly authorPrincipalId: PrincipalId;
  readonly threadState: "open" | "resolved";
  readonly revisions: readonly CommentRevision[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: PrincipalId;
}

export interface AttentionSignal {
  readonly id: AttentionSignalId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly targetPrincipalId: PrincipalId;
  readonly reason:
    | "comment_mention"
    | "task_assignment"
    | "sync_conflict"
    | "knowledge_evidence_changed"
    | "renewal_due"
    | "relationship_fact_stale"
    | "decision_impact_review";
  readonly destination: AttentionDestination;
  readonly sourceRecordId: string;
  readonly deduplicationKey: string;
  readonly urgency: "in_app" | "urgent";
  readonly state: "unread" | "read" | "dismissed";
  readonly version: number;
  readonly occurredAt: string;
  readonly updatedAt: string;
  readonly readAt?: string;
  readonly dismissedAt?: string;
}

export interface Project {
  readonly id: ProjectId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly intendedOutcome: string;
  readonly lifecycle: "active" | "closed";
  readonly closedAt?: string;
  readonly closedBy?: PrincipalId;
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NativeDocument {
  readonly id: DocumentId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly role?: "note" | "document" | "deliverable";
  readonly evidence?: {
    readonly sourceIds: readonly KnowledgeSourceId[];
    readonly noteDocumentIds: readonly DocumentId[];
  };
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeSource {
  readonly id: KnowledgeSourceId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly sourceKind: "url" | "file" | "screenshot" | "excerpt";
  readonly title: string;
  readonly canonicalUrl?: string;
  readonly excerpt?: string;
  readonly availability: "reference_only" | "available" | "unavailable";
  readonly observedAt: string;
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FrozenEvidenceVersion {
  readonly kind: "source" | "note";
  readonly recordId: KnowledgeSourceId | DocumentId;
  readonly version: number;
  readonly title: string;
}

export interface NamedDocumentVersion {
  readonly id: NamedDocumentVersionId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly documentId: DocumentId;
  readonly documentRevisionId: DocumentRevisionId;
  readonly name: string;
  readonly milestone: "finalized" | "delivered" | "approved" | "published";
  readonly contentSnapshot: string;
  readonly evidence: readonly FrozenEvidenceVersion[];
  readonly state: "active" | "voided";
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly voidedAt?: string;
  readonly voidedBy?: PrincipalId;
}

interface StrategicRecordBase {
  readonly id: StrategicRecordId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly createdBy: PrincipalId;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type StrategicRecord =
  | (StrategicRecordBase & {
      readonly kind: "organization";
      readonly name: string;
      readonly relationshipState: "prospect" | "active" | "inactive";
      readonly nextAction?: string;
    })
  | (StrategicRecordBase & {
      readonly kind: "person";
      readonly name: string;
      readonly organizationId?: StrategicRecordId;
      readonly role?: string;
      readonly email?: string;
    })
  | (StrategicRecordBase & {
      readonly kind: "opportunity";
      readonly title: string;
      readonly organizationId: StrategicRecordId;
      readonly personIds: readonly StrategicRecordId[];
      readonly need: string;
      readonly qualification: string;
      readonly stage: string;
      readonly nextAction: string;
      readonly evidenceSourceIds: readonly KnowledgeSourceId[];
      readonly offerIds: readonly StrategicRecordId[];
      readonly projectIds: readonly ProjectId[];
      readonly state: "open" | "pursued" | "deferred" | "rejected" | "lost";
    })
  | (StrategicRecordBase & {
      readonly kind: "offer";
      readonly title: string;
      readonly opportunityId: StrategicRecordId;
      readonly deliverableDocumentId: DocumentId;
      readonly ownerPrincipalId: PrincipalId;
      readonly state: "draft" | "ready" | "submitted" | "accepted" | "declined";
      readonly nextAction: string;
    })
  | (StrategicRecordBase & {
      readonly kind: "renewal";
      readonly organizationId: StrategicRecordId;
      readonly title: string;
      readonly scope: string;
      readonly expiresAt: string;
      readonly leadTimeDays: number;
      readonly ownerPrincipalId: PrincipalId;
      readonly evidenceSourceIds: readonly KnowledgeSourceId[];
      readonly followUpTaskId: TaskId;
      readonly cycleKey: string;
      readonly state: "watching" | "renewed" | "not_renewing" | "irrelevant";
    })
  | (StrategicRecordBase & {
      readonly kind: "relationship_fact";
      readonly organizationId: StrategicRecordId;
      readonly factType: string;
      readonly value: string;
      readonly evidenceSourceIds: readonly KnowledgeSourceId[];
      readonly verifiedAt: string;
      readonly staleAfter: string;
      readonly state: "current" | "stale" | "conflicted";
    })
  | (StrategicRecordBase & {
      readonly kind: "decision";
      readonly title: string;
      readonly rationale: string;
      readonly evidenceSourceIds: readonly KnowledgeSourceId[];
      readonly linkedRecordIds: readonly string[];
      readonly state: "current" | "superseded";
      readonly supersededById?: StrategicRecordId;
      readonly supersededAt?: string;
    })
  | (StrategicRecordBase & {
      readonly kind: "impact_review";
      readonly priorDecisionId: StrategicRecordId;
      readonly replacementDecisionId: StrategicRecordId;
      readonly reason: string;
      readonly consequences: readonly {
        readonly recordId: string;
        readonly recordKind:
          "task" | "offer" | "document" | "deliverable" | "commitment";
        readonly state: "open" | "resolved";
        readonly resolution?: string;
      }[];
      readonly state: "open" | "resolved";
    })
  | (StrategicRecordBase & {
      readonly kind: "area";
      readonly title: string;
      readonly responsibility: string;
      readonly state: "active" | "archived";
    })
  | (StrategicRecordBase & {
      readonly kind: "recurrence";
      readonly title: string;
      readonly taskTitle: string;
      readonly contextRecordId?: string;
      readonly cadence: "daily" | "weekly" | "monthly" | "yearly";
      readonly nextDueAt: string;
      readonly state: "active" | "paused" | "ended";
      readonly lastOccurrenceTaskId?: TaskId;
    })
  | (StrategicRecordBase & {
      readonly kind: "radar_candidate";
      readonly sourceId: KnowledgeSourceId;
      readonly materialKey: string;
      readonly title: string;
      readonly relevance: string;
      readonly state: "pending" | "saved" | "dismissed";
      readonly resolutionRecordId?: string;
    })
  | (StrategicRecordBase & {
      readonly kind: "meeting";
      readonly meeting: ImportedMeeting;
    });

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
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "capture.undo_route";
      readonly captureId: CaptureId;
      readonly taskId: TaskId;
      readonly resultingCaptureVersion: number;
      readonly resultingTaskVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "knowledge.restore_source";
      readonly sourceId: KnowledgeSourceId;
      readonly priorTitle: string;
      readonly priorCanonicalUrl?: string;
      readonly priorExcerpt?: string;
      readonly priorAvailability:
        "reference_only" | "available" | "unavailable";
      readonly priorObservedAt: string;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "knowledge.restore_evidence";
      readonly documentId: DocumentId;
      readonly priorSourceIds: readonly KnowledgeSourceId[];
      readonly priorNoteDocumentIds: readonly DocumentId[];
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "knowledge.void_named_version";
      readonly namedVersionId: NamedDocumentVersionId;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    };

export type DomainEvent = { readonly commandId: CommandId } & (
  | {
      readonly id: EventId;
      readonly type: "strategic.record_changed";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: StrategicRecordId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
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
      readonly type:
        | "agent.grant_created"
        | "agent.credential_rotated"
        | "agent.grant_revoked"
        | "agent.checkpoint_created"
        | "agent.handoff_submitted";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: string;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type:
        | "workspace.member_added"
        | "workspace.member_access_changed"
        | "workspace.member_revoked";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: MembershipId;
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
      readonly type:
        | "project.created"
        | "project.outcome_updated"
        | "project.lifecycle_changed";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: ProjectId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "document.created";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: DocumentId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type:
        | "knowledge.source_created"
        | "knowledge.source_updated"
        | "knowledge.evidence_updated"
        | "knowledge.named_version_created"
        | "knowledge.named_version_voided";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId:
        KnowledgeSourceId | DocumentId | NamedDocumentVersionId;
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
      readonly type: "task.assigned" | "task.unassigned";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: TaskAssignmentId;
      readonly aggregateVersion: number;
      readonly taskId: TaskId;
      readonly assigneePrincipalId: PrincipalId;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type:
        | "comment.added"
        | "comment.edited"
        | "comment.resolved"
        | "comment.reopened";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: CommentId;
      readonly aggregateVersion: number;
      readonly rootCommentId: CommentId;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "attention.read" | "attention.dismissed";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: AttentionSignalId;
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
    }
);

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
  readonly checkpointId?: CheckpointId;
  readonly agentRunId?: AgentRunId;
  readonly hostRunId?: string;
}

export interface OutboxEntry {
  readonly id: OutboxEntryId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly eventId: EventId;
  readonly topic:
    | "workspace.projection.requested"
    | "capture.processing.requested"
    | "work.projection.requested"
    | "attention.delivery.requested";
  readonly createdAt: string;
}
