import { z } from "zod";

import {
  AuditReceiptIdSchema,
  CaptureIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  DocumentIdSchema,
  MembershipIdSchema,
  ProjectIdSchema,
  RelationIdSchema,
  SpaceGrantIdSchema,
  SpaceIdSchema,
  TaskIdSchema,
  TaskAssignmentIdSchema,
  CommentIdSchema,
  AttentionSignalIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
  GrantIdSchema,
  CredentialIdSchema,
  CheckpointIdSchema,
  AgentRunIdSchema,
  AgentHandoffIdSchema,
  KnowledgeSourceIdSchema,
  NamedDocumentVersionIdSchema,
  DocumentRevisionIdSchema,
  StrategicRecordIdSchema,
} from "./ids.js";
import { CaptureReviewReasonSchema, ContractVersionSchema } from "./command.js";

export const DiagnosticCodeSchema = z.enum([
  "workspace.created",
  "workspace.renamed",
  "workspace.member_added",
  "workspace.member_access_changed",
  "workspace.member_revoked",
  "agent.grant_created",
  "agent.credential_rotated",
  "agent.grant_revoked",
  "agent.checkpoint_created",
  "agent.handoff_submitted",
  "capture.stored",
  "capture.routed_as_knowledge_source",
  "capture.needs_review",
  "capture.exception_resolved",
  "capture.routed_as_task",
  "project.created",
  "document.created",
  "knowledge.source_created",
  "knowledge.source_updated",
  "knowledge.evidence_updated",
  "knowledge.named_version_created",
  "knowledge.named_version_voided",
  "strategic.record_changed",
  "project.outcome_updated",
  "project.lifecycle_changed",
  "task.status_changed",
  "task.operational_state_changed",
  "task.completed",
  "task.reopened",
  "task.assigned",
  "task.unassigned",
  "comment.added",
  "comment.edited",
  "comment.resolved",
  "comment.reopened",
  "attention.read",
  "attention.dismissed",
  "relation.created",
  "relation.removed",
  "undo.previewed",
  "command.undone",
  "authorization.denied",
  "command.precondition_failed",
  "idempotency.key_reused",
  "record.already_exists",
  "record.version_conflict",
  "capture.already_routed",
  "capture.payload_unavailable",
  "task.already_completed",
  "task.already_open",
  "relation.already_exists",
  "undo.not_available",
  "undo.already_applied",
  "storage.unit_of_work_failed",
  "operation.partial",
  "external.unknown_reconcile",
]);
export type DiagnosticCode = z.infer<typeof DiagnosticCodeSchema>;

export const RecordKindSchema = z.enum([
  "workspace",
  "space",
  "membership",
  "spaceGrant",
  "agentGrant",
  "agentCheckpoint",
  "agentHandoff",
  "capture",
  "task",
  "taskAssignment",
  "comment",
  "attentionSignal",
  "taskStatus",
  "project",
  "document",
  "knowledgeSource",
  "namedDocumentVersion",
  "strategicRecord",
  "relation",
]);
export type RecordKind = z.infer<typeof RecordKindSchema>;

export const AffectedRecordSchema = z
  .object({
    recordId: z.uuid(),
    recordKind: RecordKindSchema,
    version: z.int().positive(),
  })
  .strict();
export type AffectedRecord = z.infer<typeof AffectedRecordSchema>;

export const WorkspaceCreatedProjectionSchema = z
  .object({
    kind: z.literal("workspace.created"),
    workspaceId: WorkspaceIdSchema,
    rootSpaceId: SpaceIdSchema,
    defaultTaskStatusId: TaskStatusIdSchema,
    version: z.int().positive(),
  })
  .strict();

export const WorkspaceRenamedProjectionSchema = z
  .object({
    kind: z.literal("workspace.renamed"),
    workspaceId: WorkspaceIdSchema,
    name: z.string(),
    version: z.int().positive(),
  })
  .strict();

const MembershipProjectionFields = {
  membershipId: MembershipIdSchema,
  principalId: z.uuid(),
  role: z.enum(["admin", "member", "guest"]),
  status: z.enum(["active", "revoked"]),
  membershipVersion: z.int().positive(),
  policyVersion: z.int().positive(),
} as const;

export const WorkspaceMemberAddedProjectionSchema = z
  .object({
    kind: z.literal("workspace.member_added"),
    ...MembershipProjectionFields,
    spaceGrantId: SpaceGrantIdSchema,
    spaceId: SpaceIdSchema,
    access: z.enum(["view", "comment", "edit"]),
    spaceGrantVersion: z.int().positive(),
  })
  .strict();

export const WorkspaceMemberAccessChangedProjectionSchema = z
  .object({
    kind: z.literal("workspace.member_access_changed"),
    ...MembershipProjectionFields,
    spaceGrantId: SpaceGrantIdSchema,
    spaceId: SpaceIdSchema,
    access: z.enum(["view", "comment", "edit"]),
    spaceGrantVersion: z.int().positive(),
  })
  .strict();

export const WorkspaceMemberRevokedProjectionSchema = z
  .object({
    kind: z.literal("workspace.member_revoked"),
    ...MembershipProjectionFields,
    revokedSpaceGrantIds: z.array(SpaceGrantIdSchema),
  })
  .strict();

export const CaptureStoredProjectionSchema = z
  .object({
    kind: z.literal("capture.stored"),
    captureId: CaptureIdSchema,
    processingState: z.literal("pending_processing"),
    version: z.int().positive(),
  })
  .strict();

export const CaptureRoutedAsTaskProjectionSchema = z
  .object({
    kind: z.literal("capture.routed_as_task"),
    captureId: CaptureIdSchema,
    captureVersion: z.int().positive(),
    taskId: TaskIdSchema,
    taskStatusId: TaskStatusIdSchema,
    taskVersion: z.int().positive(),
  })
  .strict();

export const CaptureRoutedAsKnowledgeSourceProjectionSchema = z
  .object({
    kind: z.literal("capture.routed_as_knowledge_source"),
    captureId: CaptureIdSchema,
    captureVersion: z.int().positive(),
    sourceId: KnowledgeSourceIdSchema,
    sourceVersion: z.int().positive(),
  })
  .strict();

export const CaptureNeedsReviewProjectionSchema = z
  .object({
    kind: z.literal("capture.needs_review"),
    captureId: CaptureIdSchema,
    captureVersion: z.int().positive(),
    attentionSignalId: AttentionSignalIdSchema,
    reason: CaptureReviewReasonSchema,
  })
  .strict();

export const CaptureExceptionResolvedProjectionSchema = z
  .object({
    kind: z.literal("capture.exception_resolved"),
    captureId: CaptureIdSchema,
    captureVersion: z.int().positive(),
    attentionSignalId: AttentionSignalIdSchema,
    attentionVersion: z.int().positive(),
    action: z.enum(["retry", "keep_unclassified", "replace_payload"]),
    processingState: z.enum(["pending_processing", "unclassified"]),
  })
  .strict();

const ProjectProjectionFields = {
  projectId: ProjectIdSchema,
  title: z.string(),
  intendedOutcome: z.string(),
  lifecycle: z.enum(["active", "closed"]),
  version: z.int().positive(),
} as const;

export const ProjectCreatedProjectionSchema = z
  .object({ kind: z.literal("project.created"), ...ProjectProjectionFields })
  .strict();

export const DocumentCreatedProjectionSchema = z
  .object({
    kind: z.literal("document.created"),
    documentId: DocumentIdSchema,
    title: z.string(),
    role: z.enum(["note", "document", "deliverable"]),
    version: z.int().positive(),
  })
  .strict();

export const KnowledgeSourceMutationProjectionSchema = z
  .object({
    kind: z.enum(["knowledge.source_created", "knowledge.source_updated"]),
    sourceId: KnowledgeSourceIdSchema,
    title: z.string(),
    version: z.int().positive(),
  })
  .strict();

export const KnowledgeEvidenceUpdatedProjectionSchema = z
  .object({
    kind: z.literal("knowledge.evidence_updated"),
    documentId: DocumentIdSchema,
    evidenceCount: z.int().nonnegative(),
    version: z.int().positive(),
  })
  .strict();

export const KnowledgeNamedVersionMutationProjectionSchema = z
  .object({
    kind: z.enum([
      "knowledge.named_version_created",
      "knowledge.named_version_voided",
    ]),
    namedVersionId: NamedDocumentVersionIdSchema,
    documentId: DocumentIdSchema,
    documentRevisionId: DocumentRevisionIdSchema,
    state: z.enum(["active", "voided"]),
    version: z.int().positive(),
  })
  .strict();
export const StrategicRecordMutationProjectionSchema = z
  .object({
    kind: z.literal("strategic.record_changed"),
    recordId: StrategicRecordIdSchema,
    recordType: z.enum([
      "organization",
      "person",
      "opportunity",
      "offer",
      "renewal",
      "relationship_fact",
      "decision",
      "impact_review",
      "area",
      "initiative",
      "work_link",
      "saved_view",
      "recurrence",
      "radar_candidate",
      "meeting",
    ]),
    version: z.int().positive(),
  })
  .strict();
export const ProjectOutcomeUpdatedProjectionSchema = z
  .object({
    kind: z.literal("project.outcome_updated"),
    ...ProjectProjectionFields,
  })
  .strict();
export const ProjectLifecycleChangedProjectionSchema = z
  .object({
    kind: z.literal("project.lifecycle_changed"),
    projectId: ProjectIdSchema,
    lifecycle: z.enum(["active", "closed"]),
    unresolvedTaskCount: z.int().nonnegative(),
    version: z.int().positive(),
  })
  .strict();

const TaskMutationProjectionFields = {
  taskId: TaskIdSchema,
  statusId: TaskStatusIdSchema,
  completionState: z.enum(["open", "completed"]),
  completedAt: z.iso.datetime({ offset: true }).optional(),
  version: z.int().positive(),
} as const;

export const TaskStatusChangedProjectionSchema = z
  .object({
    kind: z.literal("task.status_changed"),
    ...TaskMutationProjectionFields,
  })
  .strict();
export const TaskOperationalStateChangedProjectionSchema = z
  .object({
    kind: z.literal("task.operational_state_changed"),
    taskId: TaskIdSchema,
    operationalState: z.enum(["actionable", "waiting", "blocked"]),
    waitingOn: z
      .object({
        kind: z.enum(["person", "task", "external"]),
        label: z.string(),
        recordId: z.uuid().optional(),
      })
      .strict()
      .optional(),
    version: z.int().positive(),
  })
  .strict();
export const TaskCompletedProjectionSchema = z
  .object({
    kind: z.literal("task.completed"),
    ...TaskMutationProjectionFields,
  })
  .strict();
export const TaskReopenedProjectionSchema = z
  .object({ kind: z.literal("task.reopened"), ...TaskMutationProjectionFields })
  .strict();

const TaskAssignmentProjectionFields = {
  assignmentId: TaskAssignmentIdSchema,
  taskId: TaskIdSchema,
  assignmentVersion: z.int().positive(),
} as const;

export const TaskAssignedProjectionSchema = z
  .object({
    kind: z.literal("task.assigned"),
    ...TaskAssignmentProjectionFields,
    assigneePrincipalId: z.uuid(),
  })
  .strict();
export const TaskUnassignedProjectionSchema = z
  .object({
    kind: z.literal("task.unassigned"),
    ...TaskAssignmentProjectionFields,
  })
  .strict();

const CommentMutationProjectionFields = {
  commentId: CommentIdSchema,
  rootCommentId: CommentIdSchema,
  version: z.int().positive(),
} as const;
export const CommentAddedProjectionSchema = z
  .object({
    kind: z.literal("comment.added"),
    ...CommentMutationProjectionFields,
  })
  .strict();
export const CommentEditedProjectionSchema = z
  .object({
    kind: z.literal("comment.edited"),
    ...CommentMutationProjectionFields,
  })
  .strict();
export const CommentResolvedProjectionSchema = z
  .object({
    kind: z.literal("comment.resolved"),
    ...CommentMutationProjectionFields,
  })
  .strict();
export const CommentReopenedProjectionSchema = z
  .object({
    kind: z.literal("comment.reopened"),
    ...CommentMutationProjectionFields,
  })
  .strict();
const AttentionProjectionFields = {
  attentionSignalId: AttentionSignalIdSchema,
  version: z.int().positive(),
} as const;
export const AttentionReadProjectionSchema = z
  .object({ kind: z.literal("attention.read"), ...AttentionProjectionFields })
  .strict();
export const AttentionDismissedProjectionSchema = z
  .object({
    kind: z.literal("attention.dismissed"),
    ...AttentionProjectionFields,
  })
  .strict();

const RelationProjectionFields = {
  relationId: RelationIdSchema,
  taskId: TaskIdSchema,
  projectId: ProjectIdSchema,
  version: z.int().positive(),
} as const;

export const RelationCreatedProjectionSchema = z
  .object({ kind: z.literal("relation.created"), ...RelationProjectionFields })
  .strict();
export const RelationRemovedProjectionSchema = z
  .object({ kind: z.literal("relation.removed"), ...RelationProjectionFields })
  .strict();

export const UndoAppliedProjectionSchema = z
  .object({
    kind: z.literal("command.undone"),
    targetCommandId: CommandIdSchema,
    compensatedRecordIds: z.array(z.uuid()).min(1),
    recordVersions: z.record(z.uuid(), z.int().positive()),
  })
  .strict();

export const AgentGrantCreatedProjectionSchema = z
  .object({
    kind: z.literal("agent.grant_created"),
    grantId: GrantIdSchema,
    agentPrincipalId: z.uuid(),
    credentialId: CredentialIdSchema,
    version: z.int().positive(),
    policyVersion: z.int().positive(),
  })
  .strict();
export const AgentCredentialRotatedProjectionSchema = z
  .object({
    kind: z.literal("agent.credential_rotated"),
    grantId: GrantIdSchema,
    credentialId: CredentialIdSchema,
    credentialVersion: z.int().positive(),
    version: z.int().positive(),
  })
  .strict();
export const AgentGrantRevokedProjectionSchema = z
  .object({
    kind: z.literal("agent.grant_revoked"),
    grantId: GrantIdSchema,
    version: z.int().positive(),
    policyVersion: z.int().positive(),
  })
  .strict();
export const AgentCheckpointCreatedProjectionSchema = z
  .object({
    kind: z.literal("agent.checkpoint_created"),
    checkpointId: CheckpointIdSchema,
    runId: AgentRunIdSchema,
  })
  .strict();
export const AgentHandoffSubmittedProjectionSchema = z
  .object({
    kind: z.literal("agent.handoff_submitted"),
    handoffId: AgentHandoffIdSchema,
    runId: AgentRunIdSchema,
  })
  .strict();

export const CommandProjectionSchema = z.discriminatedUnion("kind", [
  WorkspaceCreatedProjectionSchema,
  WorkspaceRenamedProjectionSchema,
  WorkspaceMemberAddedProjectionSchema,
  WorkspaceMemberAccessChangedProjectionSchema,
  WorkspaceMemberRevokedProjectionSchema,
  CaptureStoredProjectionSchema,
  CaptureRoutedAsTaskProjectionSchema,
  CaptureRoutedAsKnowledgeSourceProjectionSchema,
  CaptureNeedsReviewProjectionSchema,
  CaptureExceptionResolvedProjectionSchema,
  ProjectCreatedProjectionSchema,
  DocumentCreatedProjectionSchema,
  KnowledgeSourceMutationProjectionSchema,
  KnowledgeEvidenceUpdatedProjectionSchema,
  KnowledgeNamedVersionMutationProjectionSchema,
  StrategicRecordMutationProjectionSchema,
  ProjectOutcomeUpdatedProjectionSchema,
  ProjectLifecycleChangedProjectionSchema,
  TaskStatusChangedProjectionSchema,
  TaskOperationalStateChangedProjectionSchema,
  TaskCompletedProjectionSchema,
  TaskReopenedProjectionSchema,
  TaskAssignedProjectionSchema,
  TaskUnassignedProjectionSchema,
  CommentAddedProjectionSchema,
  CommentEditedProjectionSchema,
  CommentResolvedProjectionSchema,
  CommentReopenedProjectionSchema,
  AttentionReadProjectionSchema,
  AttentionDismissedProjectionSchema,
  RelationCreatedProjectionSchema,
  RelationRemovedProjectionSchema,
  UndoAppliedProjectionSchema,
  AgentGrantCreatedProjectionSchema,
  AgentCredentialRotatedProjectionSchema,
  AgentGrantRevokedProjectionSchema,
  AgentCheckpointCreatedProjectionSchema,
  AgentHandoffSubmittedProjectionSchema,
]);
export type CommandProjection = z.infer<typeof CommandProjectionSchema>;

const OutcomeMetadataSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    commandId: CommandIdSchema,
    correlationId: CorrelationIdSchema,
    kernelTime: z.iso.datetime({ offset: true }),
    diagnosticCode: DiagnosticCodeSchema,
  })
  .strict();

const CommittedOutcomeMetadataSchema = OutcomeMetadataSchema.extend({
  affected: z.array(AffectedRecordSchema),
  auditReceiptId: AuditReceiptIdSchema,
}).strict();

const WorkspaceCreatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("workspace.created"),
    projection: WorkspaceCreatedProjectionSchema,
  }).strict();

const WorkspaceRenamedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("workspace.renamed"),
    projection: WorkspaceRenamedProjectionSchema,
  }).strict();

const WorkspaceMemberAddedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("workspace.member_added"),
    projection: WorkspaceMemberAddedProjectionSchema,
  }).strict();
const WorkspaceMemberAccessChangedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("workspace.member_access_changed"),
    projection: WorkspaceMemberAccessChangedProjectionSchema,
  }).strict();
const WorkspaceMemberRevokedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("workspace.member_revoked"),
    projection: WorkspaceMemberRevokedProjectionSchema,
  }).strict();

const CaptureStoredSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend(
  {
    outcome: z.literal("success"),
    diagnosticCode: z.literal("capture.stored"),
    projection: CaptureStoredProjectionSchema,
  },
).strict();

const CaptureRoutedAsTaskSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("capture.routed_as_task"),
    projection: CaptureRoutedAsTaskProjectionSchema,
  }).strict();

const CaptureRoutedAsKnowledgeSourceSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("capture.routed_as_knowledge_source"),
    projection: CaptureRoutedAsKnowledgeSourceProjectionSchema,
  }).strict();

const CaptureNeedsReviewSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("capture.needs_review"),
    projection: CaptureNeedsReviewProjectionSchema,
  }).strict();

const CaptureExceptionResolvedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("capture.exception_resolved"),
    projection: CaptureExceptionResolvedProjectionSchema,
  }).strict();

const ProjectCreatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("project.created"),
    projection: ProjectCreatedProjectionSchema,
  }).strict();
const DocumentCreatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("document.created"),
    projection: DocumentCreatedProjectionSchema,
  }).strict();
const KnowledgeSourceCreatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("knowledge.source_created"),
    projection: KnowledgeSourceMutationProjectionSchema,
  }).strict();
const KnowledgeSourceUpdatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("knowledge.source_updated"),
    projection: KnowledgeSourceMutationProjectionSchema,
  }).strict();
const KnowledgeEvidenceUpdatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("knowledge.evidence_updated"),
    projection: KnowledgeEvidenceUpdatedProjectionSchema,
  }).strict();
const KnowledgeNamedVersionCreatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("knowledge.named_version_created"),
    projection: KnowledgeNamedVersionMutationProjectionSchema,
  }).strict();
const KnowledgeNamedVersionVoidedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("knowledge.named_version_voided"),
    projection: KnowledgeNamedVersionMutationProjectionSchema,
  }).strict();
const StrategicRecordChangedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("strategic.record_changed"),
    projection: StrategicRecordMutationProjectionSchema,
  }).strict();
const ProjectOutcomeUpdatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("project.outcome_updated"),
    projection: ProjectOutcomeUpdatedProjectionSchema,
  }).strict();
const ProjectLifecycleChangedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("project.lifecycle_changed"),
    projection: ProjectLifecycleChangedProjectionSchema,
  }).strict();
const TaskStatusChangedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("task.status_changed"),
    projection: TaskStatusChangedProjectionSchema,
  }).strict();
const TaskOperationalStateChangedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("task.operational_state_changed"),
    projection: TaskOperationalStateChangedProjectionSchema,
  }).strict();
const TaskCompletedSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend(
  {
    outcome: z.literal("success"),
    diagnosticCode: z.literal("task.completed"),
    projection: TaskCompletedProjectionSchema,
  },
).strict();
const TaskReopenedSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("success"),
  diagnosticCode: z.literal("task.reopened"),
  projection: TaskReopenedProjectionSchema,
}).strict();
const TaskAssignedSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("success"),
  diagnosticCode: z.literal("task.assigned"),
  projection: TaskAssignedProjectionSchema,
}).strict();
const TaskUnassignedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("task.unassigned"),
    projection: TaskUnassignedProjectionSchema,
  }).strict();
const CommentAddedSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("success"),
  diagnosticCode: z.literal("comment.added"),
  projection: CommentAddedProjectionSchema,
}).strict();
const CommentEditedSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend(
  {
    outcome: z.literal("success"),
    diagnosticCode: z.literal("comment.edited"),
    projection: CommentEditedProjectionSchema,
  },
).strict();
const CommentResolvedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("comment.resolved"),
    projection: CommentResolvedProjectionSchema,
  }).strict();
const CommentReopenedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("comment.reopened"),
    projection: CommentReopenedProjectionSchema,
  }).strict();
const AttentionReadSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend(
  {
    outcome: z.literal("success"),
    diagnosticCode: z.literal("attention.read"),
    projection: AttentionReadProjectionSchema,
  },
).strict();
const AttentionDismissedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("attention.dismissed"),
    projection: AttentionDismissedProjectionSchema,
  }).strict();
const RelationCreatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("relation.created"),
    projection: RelationCreatedProjectionSchema,
  }).strict();
const RelationRemovedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("relation.removed"),
    projection: RelationRemovedProjectionSchema,
  }).strict();

const UndoSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("success"),
  diagnosticCode: z.literal("command.undone"),
  projection: UndoAppliedProjectionSchema,
}).strict();

const AgentGrantCreatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("agent.grant_created"),
    projection: AgentGrantCreatedProjectionSchema,
  }).strict();
const AgentCredentialRotatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("agent.credential_rotated"),
    projection: AgentCredentialRotatedProjectionSchema,
  }).strict();
const AgentGrantRevokedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("agent.grant_revoked"),
    projection: AgentGrantRevokedProjectionSchema,
  }).strict();
const AgentCheckpointCreatedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("agent.checkpoint_created"),
    projection: AgentCheckpointCreatedProjectionSchema,
  }).strict();
const AgentHandoffSubmittedSuccessOutcomeSchema =
  CommittedOutcomeMetadataSchema.extend({
    outcome: z.literal("success"),
    diagnosticCode: z.literal("agent.handoff_submitted"),
    projection: AgentHandoffSubmittedProjectionSchema,
  }).strict();

export const SuccessOutcomeSchema = z.discriminatedUnion("diagnosticCode", [
  WorkspaceCreatedSuccessOutcomeSchema,
  WorkspaceRenamedSuccessOutcomeSchema,
  WorkspaceMemberAddedSuccessOutcomeSchema,
  WorkspaceMemberAccessChangedSuccessOutcomeSchema,
  WorkspaceMemberRevokedSuccessOutcomeSchema,
  CaptureStoredSuccessOutcomeSchema,
  CaptureRoutedAsTaskSuccessOutcomeSchema,
  CaptureRoutedAsKnowledgeSourceSuccessOutcomeSchema,
  CaptureNeedsReviewSuccessOutcomeSchema,
  CaptureExceptionResolvedSuccessOutcomeSchema,
  ProjectCreatedSuccessOutcomeSchema,
  DocumentCreatedSuccessOutcomeSchema,
  KnowledgeSourceCreatedSuccessOutcomeSchema,
  KnowledgeSourceUpdatedSuccessOutcomeSchema,
  KnowledgeEvidenceUpdatedSuccessOutcomeSchema,
  KnowledgeNamedVersionCreatedSuccessOutcomeSchema,
  KnowledgeNamedVersionVoidedSuccessOutcomeSchema,
  StrategicRecordChangedSuccessOutcomeSchema,
  ProjectOutcomeUpdatedSuccessOutcomeSchema,
  ProjectLifecycleChangedSuccessOutcomeSchema,
  TaskStatusChangedSuccessOutcomeSchema,
  TaskOperationalStateChangedSuccessOutcomeSchema,
  TaskCompletedSuccessOutcomeSchema,
  TaskReopenedSuccessOutcomeSchema,
  TaskAssignedSuccessOutcomeSchema,
  TaskUnassignedSuccessOutcomeSchema,
  CommentAddedSuccessOutcomeSchema,
  CommentEditedSuccessOutcomeSchema,
  CommentResolvedSuccessOutcomeSchema,
  CommentReopenedSuccessOutcomeSchema,
  AttentionReadSuccessOutcomeSchema,
  AttentionDismissedSuccessOutcomeSchema,
  RelationCreatedSuccessOutcomeSchema,
  RelationRemovedSuccessOutcomeSchema,
  UndoSuccessOutcomeSchema,
  AgentGrantCreatedSuccessOutcomeSchema,
  AgentCredentialRotatedSuccessOutcomeSchema,
  AgentGrantRevokedSuccessOutcomeSchema,
  AgentCheckpointCreatedSuccessOutcomeSchema,
  AgentHandoffSubmittedSuccessOutcomeSchema,
]);

export const UndoPreviewOutcomeSchema = OutcomeMetadataSchema.extend({
  outcome: z.literal("preview"),
  diagnosticCode: z.literal("undo.previewed"),
  projection: z
    .object({
      kind: z.literal("undo.previewed"),
      targetCommandId: CommandIdSchema,
      available: z.boolean(),
      compensationKind: z
        .enum([
          "project.restore_outcome",
          "task.restore_state",
          "task.restore_operational_state",
          "work_link.restore_state",
          "relation.remove",
          "relation.restore",
          "capture.undo_route",
          "capture.undo_knowledge_route",
          "knowledge.restore_source",
          "knowledge.restore_evidence",
          "knowledge.void_named_version",
        ])
        .optional(),
      affectedRecordIds: z.array(z.uuid()),
      requiredVersions: z.record(z.uuid(), z.int().positive()),
      unavailableReason: z
        .enum(["unsupported", "already_undone", "later_change"])
        .optional(),
    })
    .strict(),
}).strict();

export const PartialOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("partial"),
  diagnosticCode: z.literal("operation.partial"),
  projection: CommandProjectionSchema,
  remaining: z.array(DiagnosticCodeSchema).min(1),
}).strict();

export const ConflictOutcomeSchema = OutcomeMetadataSchema.extend({
  outcome: z.literal("conflict"),
  diagnosticCode: z.enum([
    "idempotency.key_reused",
    "record.already_exists",
    "record.version_conflict",
    "capture.already_routed",
    "task.already_completed",
    "task.already_open",
    "relation.already_exists",
    "undo.not_available",
    "undo.already_applied",
  ]),
  currentVersions: z.record(z.uuid(), z.int().positive()),
}).strict();

export const RetryableOutcomeSchema = OutcomeMetadataSchema.extend({
  outcome: z.literal("retryable"),
  diagnosticCode: z.literal("storage.unit_of_work_failed"),
  retryAfterMs: z.int().nonnegative().optional(),
}).strict();

export const RejectedOutcomeSchema = OutcomeMetadataSchema.extend({
  outcome: z.literal("rejected"),
  diagnosticCode: z.enum([
    "authorization.denied",
    "command.precondition_failed",
    "capture.payload_unavailable",
  ]),
}).strict();

export const UnknownReconcileOutcomeSchema = OutcomeMetadataSchema.extend({
  outcome: z.literal("unknown_reconcile"),
  diagnosticCode: z.literal("external.unknown_reconcile"),
  reconciliationReference: z.string().trim().min(1).max(500),
}).strict();

export const CommandOutcomeSchema = z.union([
  SuccessOutcomeSchema,
  UndoPreviewOutcomeSchema,
  PartialOutcomeSchema,
  ConflictOutcomeSchema,
  RetryableOutcomeSchema,
  RejectedOutcomeSchema,
  UnknownReconcileOutcomeSchema,
]);
export type CommandOutcome = z.infer<typeof CommandOutcomeSchema>;
export type SuccessOutcome = z.infer<typeof SuccessOutcomeSchema>;
