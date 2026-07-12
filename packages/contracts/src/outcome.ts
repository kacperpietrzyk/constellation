import { z } from "zod";

import {
  AuditReceiptIdSchema,
  CaptureIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
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
  "authorization.denied",
  "command.precondition_failed",
  "idempotency.key_reused",
  "record.already_exists",
  "record.version_conflict",
  "capture.already_routed",
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

export const CommandProjectionSchema = z.discriminatedUnion("kind", [
  WorkspaceCreatedProjectionSchema,
  WorkspaceRenamedProjectionSchema,
  CaptureStoredProjectionSchema,
  CaptureRoutedAsTaskProjectionSchema,
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

export const SuccessOutcomeSchema = z.discriminatedUnion("diagnosticCode", [
  WorkspaceCreatedSuccessOutcomeSchema,
  WorkspaceRenamedSuccessOutcomeSchema,
  CaptureStoredSuccessOutcomeSchema,
  CaptureRoutedAsTaskSuccessOutcomeSchema,
]);

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
  PartialOutcomeSchema,
  ConflictOutcomeSchema,
  RetryableOutcomeSchema,
  RejectedOutcomeSchema,
  UnknownReconcileOutcomeSchema,
]);
export type CommandOutcome = z.infer<typeof CommandOutcomeSchema>;
export type SuccessOutcome = z.infer<typeof SuccessOutcomeSchema>;
