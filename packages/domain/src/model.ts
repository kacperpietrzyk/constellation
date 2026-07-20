import type {
  AuditReceiptId,
  CaptureId,
  CaptureOriginal,
  CaptureReviewReason,
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
  AutomationRuleId,
  FieldDefinitionId,
  ProjectTemplateId,
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
  readonly voiceAudioRetentionPolicy?: "delete_after_transcript" | "retain";
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
  readonly original: CaptureOriginal;
  readonly originalFingerprint: string;
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

export type RoutedKnowledgeSourceCapture = CaptureBase & {
  readonly processingState: "routed_as_knowledge_source";
  readonly derivedKnowledgeSourceId: KnowledgeSourceId;
  readonly routedAt: string;
  readonly routedBy: PrincipalId;
};

export type ReviewCapture = CaptureBase & {
  readonly processingState: "needs_review";
  readonly reviewReason: CaptureReviewReason;
  readonly duplicateOfCaptureId?: CaptureId;
  readonly attentionSignalId: AttentionSignalId;
  readonly reviewedAt: string;
};

export type AwaitingTranscriptCapture = CaptureBase & {
  readonly processingState: "awaiting_transcript";
  readonly awaitingTranscriptSince: string;
};

export interface VoiceTranscript {
  readonly text: string;
  readonly audioContentSha256: string;
  readonly writtenAt: string;
  readonly writtenBy: PrincipalId;
  readonly writtenByKind: "human" | "integration" | "system" | "agent";
  readonly agentRunId?: AgentRunId;
  readonly hostRunId?: string;
}

export type TranscriptReadyCapture = CaptureBase & {
  readonly processingState: "transcript_ready";
  readonly transcript: VoiceTranscript;
  readonly audioState: "deletion_pending" | "retained" | "deleted";
  readonly audioStateChangedAt: string;
};

export type UnclassifiedCapture = CaptureBase & {
  readonly processingState: "unclassified";
  readonly unclassifiedAt: string;
  readonly unclassifiedBy: PrincipalId;
  readonly previousReviewReason: CaptureReviewReason;
};

export type Capture =
  | PendingCapture
  | AwaitingTranscriptCapture
  | TranscriptReadyCapture
  | RoutedTaskCapture
  | RoutedKnowledgeSourceCapture
  | ReviewCapture
  | UnclassifiedCapture;

export type TaskStatusSemantics =
  "actionable" | "waiting" | "blocked" | "paused";

export interface TaskStatusDefinition {
  readonly id: TaskStatusId;
  readonly workspaceId: WorkspaceId;
  readonly label: string;
  readonly operationalSemantics: TaskStatusSemantics;
  readonly state?: "active" | "archived";
  readonly archivedAt?: string;
  readonly position: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type FieldDefinitionType =
  | { readonly kind: "text" }
  | { readonly kind: "number" }
  | { readonly kind: "date" }
  | { readonly kind: "choice"; readonly options: readonly string[] };

export interface FieldDefinition {
  readonly id: FieldDefinitionId;
  readonly workspaceId: WorkspaceId;
  readonly targetKind: "task" | "project";
  readonly label: string;
  readonly type: FieldDefinitionType;
  readonly state?: "active" | "retired";
  readonly retiredAt?: string;
  readonly position: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type FieldValue =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "date"; readonly value: string }
  | { readonly kind: "choice"; readonly value: string };

export type FieldValueMap = Readonly<Record<string, FieldValue>>;

export interface ProjectTemplate {
  readonly id: ProjectTemplateId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly description?: string;
  readonly taskTitles: readonly string[];
  readonly fieldIds: readonly FieldDefinitionId[];
  readonly state?: "active" | "retired";
  readonly retiredAt?: string;
  readonly position: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AutomationRecipe =
  | { readonly kind: "complete_sets_status"; readonly statusId: TaskStatusId }
  | { readonly kind: "waiting_review_signals" };

export interface AutomationRule {
  readonly id: AutomationRuleId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly recipe: AutomationRecipe;
  readonly state?: "active" | "disabled";
  readonly disabledAt?: string;
  readonly position: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface Task {
  readonly id: TaskId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly description?: string;
  readonly nextAction?: string;
  readonly startAt?: string;
  readonly dueAt?: string;
  readonly priority?: TaskPriority;
  readonly parentTaskId?: TaskId;
  readonly fields?: FieldValueMap;
  readonly statusId: TaskStatusId;
  readonly recordState: "active" | "removed";
  readonly completionState: "open" | "completed";
  readonly operationalState: "actionable" | "waiting" | "blocked";
  readonly waitingOn?: {
    readonly kind: "person" | "task" | "external";
    readonly label: string;
    readonly recordId?: string;
    readonly direction?: "waiting_on_them" | "we_owe";
    readonly expectedAt?: string;
  };
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
  | { readonly kind: "document"; readonly documentId: DocumentId }
  | { readonly kind: "capture"; readonly captureId: CaptureId };

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
    | "waiting_review_elapsed"
    | "relationship_fact_stale"
    | "decision_impact_review"
    | "capture_duplicate"
    | "capture_unsupported"
    | "capture_ambiguous"
    | "capture_parsing_failure"
    | "capture_permission_failure"
    | "capture_stale_conflict"
    | "capture_missing_target"
    | "capture_missing_payload"
    | "capture_partial_payload_transfer"
    | "capture_unknown_reconcile";
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
  readonly fields?: FieldValueMap;
  readonly appliedTemplateId?: ProjectTemplateId;
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
  readonly sourceCaptureId?: CaptureId;
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
      readonly kind: "initiative";
      readonly title: string;
      readonly intendedOutcome: string;
      readonly state: "active" | "closed";
    })
  | (StrategicRecordBase & {
      readonly kind: "work_link";
      readonly linkType:
        | "project_advances_initiative"
        | "project_serves_area"
        | "task_depends_on_task";
      readonly sourceRecordId: string;
      readonly targetRecordId: string;
      readonly state: "active" | "removed";
      readonly removedAt?: string;
    })
  | (StrategicRecordBase & {
      readonly kind: "saved_view";
      readonly name: string;
      readonly filters: {
        readonly operationalStates?: readonly (
          "actionable" | "waiting" | "blocked"
        )[];
        readonly projectIds?: readonly ProjectId[];
        readonly areaIds?: readonly StrategicRecordId[];
        readonly initiativeIds?: readonly StrategicRecordId[];
        readonly unassigned?: boolean;
        readonly statusIds?: readonly TaskStatusId[];
        readonly assigneePrincipalIds?: readonly PrincipalId[];
        readonly priorities?: readonly TaskPriority[];
        readonly dueWindow?: "overdue" | "today" | "this_week";
        readonly scheduled?: boolean;
        readonly fields?: readonly {
          readonly fieldId: FieldDefinitionId;
          readonly predicate:
            | { readonly kind: "choice_is"; readonly option: string }
            | { readonly kind: "set" }
            | { readonly kind: "empty" };
        }[];
      };
      readonly sort: "updated_desc" | "due_asc" | "title_asc";
      readonly groupBy?:
        "status" | "priority" | { readonly fieldId: FieldDefinitionId };
      readonly state: "active" | "deleted";
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
      readonly kind: "task.restore_operational_state";
      readonly taskId: TaskId;
      readonly priorOperationalState: Task["operationalState"];
      readonly priorWaitingOn?: Task["waitingOn"];
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "work_link.restore_state";
      readonly linkId: StrategicRecordId;
      readonly priorState: "active" | "removed";
      readonly priorRemovedAt?: string;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "savedView.restore_definition";
      readonly savedViewId: StrategicRecordId;
      readonly priorName: string;
      readonly priorFilters: Extract<
        StrategicRecord,
        { kind: "saved_view" }
      >["filters"];
      readonly priorSort: "updated_desc" | "due_asc" | "title_asc";
      readonly priorGroupBy?:
        "status" | "priority" | { readonly fieldId: FieldDefinitionId };
      readonly priorState: "active" | "deleted";
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "capture.undo_knowledge_route";
      readonly captureId: CaptureId;
      readonly sourceId: KnowledgeSourceId;
      readonly resultingCaptureVersion: number;
      readonly resultingSourceVersion: number;
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
      readonly kind: "automation.restore_definition";
      readonly ruleId: AutomationRuleId;
      readonly priorName: string;
      readonly priorState: "active" | "disabled";
      readonly priorDisabledAt?: string;
      readonly priorPosition: number;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "template.restore_definition";
      readonly templateId: ProjectTemplateId;
      readonly priorName: string;
      readonly priorDescription?: string;
      readonly priorTaskTitles: readonly string[];
      readonly priorFieldIds: readonly FieldDefinitionId[];
      readonly priorPosition: number;
      readonly priorState: "active" | "retired";
      readonly priorRetiredAt?: string;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "project.unapply_template";
      readonly projectId: ProjectId;
      readonly templateId: ProjectTemplateId;
      readonly createdTaskIds: readonly TaskId[];
      readonly createdRelationIds: readonly RelationId[];
      readonly resultingProjectVersion: number;
      readonly resultingTaskVersions: Readonly<Record<string, number>>;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "fieldDef.restore_definition";
      readonly fieldId: FieldDefinitionId;
      readonly priorLabel: string;
      readonly priorPosition: number;
      readonly priorState: "active" | "retired";
      readonly priorRetiredAt?: string;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "record.restore_field_value";
      readonly targetKind: "task" | "project";
      readonly recordId: string;
      readonly fieldId: FieldDefinitionId;
      readonly priorValue?: FieldValue;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "taskStatus.restore_definition";
      readonly statusId: TaskStatusId;
      readonly priorLabel: string;
      readonly priorSemantics: TaskStatusSemantics;
      readonly priorPosition: number;
      readonly priorState: "active" | "archived";
      readonly priorArchivedAt?: string;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "workspace.restore_default_status";
      readonly priorDefaultTaskStatusId: TaskStatusId;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "task.restore_parent";
      readonly taskId: TaskId;
      readonly priorParentTaskId?: TaskId;
      readonly resultingVersion: number;
      readonly consumedByCommandId?: CommandId;
    }
  | {
      readonly targetCommandId: CommandId;
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly kind: "task.restore_details";
      readonly taskId: TaskId;
      readonly priorTitle: string;
      readonly priorDescription?: string;
      readonly priorNextAction?: string;
      readonly priorStartAt?: string;
      readonly priorDueAt?: string;
      readonly priorPriority?: TaskPriority;
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
      readonly type:
        | "workspace.renamed"
        | "workspace.voice_audio_retention_changed"
        | "workspace.default_status_changed";
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
      readonly type: "template.created" | "template.changed";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: ProjectTemplateId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type:
        "automation.created" | "automation.changed" | "automation.swept";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: AutomationRuleId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "project.template_applied";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: ProjectId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "fieldDef.created" | "fieldDef.changed";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: FieldDefinitionId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "record.field_value_set";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: string;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "taskStatus.created" | "taskStatus.changed";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: TaskStatusId;
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
      readonly type: "capture.routed_as_knowledge_source";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: CaptureId;
      readonly aggregateVersion: number;
      readonly knowledgeSourceId: KnowledgeSourceId;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "capture.needs_review";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: CaptureId;
      readonly aggregateVersion: number;
      readonly attentionSignalId: AttentionSignalId;
      readonly reason: ReviewCapture["reviewReason"];
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "capture.exception_resolved";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: CaptureId;
      readonly aggregateVersion: number;
      readonly attentionSignalId: AttentionSignalId;
      readonly action: "retry" | "keep_unclassified" | "replace_payload";
      readonly processingState: "pending_processing" | "unclassified";
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type: "capture.awaiting_transcript";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: CaptureId;
      readonly aggregateVersion: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: EventId;
      readonly type:
        | "capture.transcript_written"
        | "capture.audio_deletion_requested"
        | "capture.audio_deleted";
      readonly workspaceId: WorkspaceId;
      readonly spaceId: SpaceId;
      readonly aggregateId: CaptureId;
      readonly aggregateVersion: number;
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
      readonly type:
        | "task.created"
        | "task.details_updated"
        | "task.parent_changed"
        | "task.status_changed"
        | "task.operational_state_changed"
        | "task.completed"
        | "task.reopened";
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
