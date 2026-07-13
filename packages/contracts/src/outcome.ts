import { z } from "zod";

import {
  AuditReceiptIdSchema,
  CaptureIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  ProjectIdSchema,
  RelationIdSchema,
  SpaceIdSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import { ContractVersionSchema } from "./command.js";

export const DiagnosticCodeSchema = z.enum([
  "workspace.created",
  "workspace.renamed",
  "capture.stored",
  "capture.routed_as_task",
  "project.created",
  "project.outcome_updated",
  "task.status_changed",
  "task.completed",
  "task.reopened",
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
  "capture",
  "task",
  "taskStatus",
  "project",
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

export const ProjectProjectionSchema = z
  .object({
    kind: z.enum(["project.created", "project.outcome_updated"]),
    projectId: ProjectIdSchema,
    title: z.string(),
    intendedOutcome: z.string(),
    lifecycle: z.literal("active"),
    version: z.int().positive(),
  })
  .strict();

export const TaskMutationProjectionSchema = z
  .object({
    kind: z.enum(["task.status_changed", "task.completed", "task.reopened"]),
    taskId: TaskIdSchema,
    statusId: TaskStatusIdSchema,
    completionState: z.enum(["open", "completed"]),
    completedAt: z.iso.datetime({ offset: true }).optional(),
    version: z.int().positive(),
  })
  .strict();

export const RelationProjectionSchema = z
  .object({
    kind: z.enum(["relation.created", "relation.removed"]),
    relationId: RelationIdSchema,
    taskId: TaskIdSchema,
    projectId: ProjectIdSchema,
    version: z.int().positive(),
  })
  .strict();

export const UndoAppliedProjectionSchema = z
  .object({
    kind: z.literal("command.undone"),
    targetCommandId: CommandIdSchema,
    compensatedRecordId: z.uuid(),
    version: z.int().positive(),
  })
  .strict();

export const CommandProjectionSchema = z.discriminatedUnion("kind", [
  WorkspaceCreatedProjectionSchema,
  WorkspaceRenamedProjectionSchema,
  CaptureStoredProjectionSchema,
  CaptureRoutedAsTaskProjectionSchema,
  ProjectProjectionSchema,
  TaskMutationProjectionSchema,
  RelationProjectionSchema,
  UndoAppliedProjectionSchema,
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

const ProjectSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("success"),
  diagnosticCode: z.enum(["project.created", "project.outcome_updated"]),
  projection: ProjectProjectionSchema,
}).strict();

const TaskMutationSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("success"),
  diagnosticCode: z.enum([
    "task.status_changed",
    "task.completed",
    "task.reopened",
  ]),
  projection: TaskMutationProjectionSchema,
}).strict();

const RelationSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("success"),
  diagnosticCode: z.enum(["relation.created", "relation.removed"]),
  projection: RelationProjectionSchema,
}).strict();

const UndoSuccessOutcomeSchema = CommittedOutcomeMetadataSchema.extend({
  outcome: z.literal("success"),
  diagnosticCode: z.literal("command.undone"),
  projection: UndoAppliedProjectionSchema,
}).strict();

export const SuccessOutcomeSchema = z.discriminatedUnion("diagnosticCode", [
  WorkspaceCreatedSuccessOutcomeSchema,
  WorkspaceRenamedSuccessOutcomeSchema,
  CaptureStoredSuccessOutcomeSchema,
  CaptureRoutedAsTaskSuccessOutcomeSchema,
  ProjectSuccessOutcomeSchema,
  TaskMutationSuccessOutcomeSchema,
  RelationSuccessOutcomeSchema,
  UndoSuccessOutcomeSchema,
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
          "relation.remove",
          "relation.restore",
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
