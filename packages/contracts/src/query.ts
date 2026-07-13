import { z } from "zod";

import {
  AuditReceiptIdSchema,
  CaptureIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  QueryIdSchema,
  SpaceIdSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
} from "./ids.js";
import { ContractVersionSchema } from "./command.js";
import { RequestOriginSchema } from "./execution-context.js";

const QueryMetadataSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    queryId: QueryIdSchema,
    workspaceId: WorkspaceIdSchema,
    consistency: z.enum(["local_authoritative", "local_projection"]),
  })
  .strict();

export const WorkspaceBootstrapContextQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("workspace.bootstrapContext"),
  parameters: z.object({}).strict(),
}).strict();

export const CaptureHistoryQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("capture.history"),
  parameters: z
    .object({
      spaceId: SpaceIdSchema,
      limit: z.int().min(1).max(200).optional(),
      cursor: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
}).strict();

export const AuditReceiptQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("audit.receipt"),
  parameters: z
    .object({
      receiptId: AuditReceiptIdSchema,
    })
    .strict(),
}).strict();

export const TaskListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("task.list"),
  parameters: z
    .object({
      spaceId: SpaceIdSchema,
      limit: z.int().min(1).max(200).optional(),
      cursor: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
}).strict();

export const ProjectListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("project.list"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

export const ProjectOperationalOverviewQuerySchema = QueryMetadataSchema.extend(
  {
    queryName: z.literal("project.operationalOverview"),
    parameters: z.object({ projectId: ProjectIdSchema }).strict(),
  },
).strict();

export const GlobalSearchQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("search.global"),
  parameters: z
    .object({
      spaceIds: z.array(SpaceIdSchema).min(1).max(50),
      text: z.string().trim().min(1).max(500),
      kinds: z
        .array(z.enum(["task", "project", "capture"]))
        .min(1)
        .optional(),
      limit: z.int().min(1).max(100).optional(),
    })
    .strict(),
}).strict();

export const CockpitWeekQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("cockpit.week"),
  parameters: z
    .object({
      spaceId: SpaceIdSchema,
      weekStart: z.iso.date(),
      limit: z.int().min(1).max(100).optional(),
    })
    .strict(),
}).strict();

export const MeaningfulActivityQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("activity.meaningful"),
  parameters: z
    .object({
      spaceId: SpaceIdSchema,
      limit: z.int().min(1).max(200).optional(),
    })
    .strict(),
}).strict();

export const RecoveryPreviewQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("recovery.preview"),
  parameters: z.object({ targetCommandId: CommandIdSchema }).strict(),
}).strict();

export const QueryEnvelopeSchema = z.discriminatedUnion("queryName", [
  WorkspaceBootstrapContextQuerySchema,
  CaptureHistoryQuerySchema,
  TaskListQuerySchema,
  ProjectListQuerySchema,
  ProjectOperationalOverviewQuerySchema,
  GlobalSearchQuerySchema,
  CockpitWeekQuerySchema,
  MeaningfulActivityQuerySchema,
  RecoveryPreviewQuerySchema,
  AuditReceiptQuerySchema,
]);
export type QueryEnvelope = z.infer<typeof QueryEnvelopeSchema>;
export type QueryName = QueryEnvelope["queryName"];

const FreshnessSchema = z
  .object({
    mode: z.enum(["local_authoritative", "local_projection"]),
    checkpoint: z.string().nullable(),
    missingCapabilities: z.array(z.string()),
  })
  .strict();

const CaptureHistoryItemBaseSchema = z.object({
  id: CaptureIdSchema,
  spaceId: SpaceIdSchema,
  originalText: z.string(),
  source: z.enum(["global_quick_capture", "in_app_quick_capture"]),
  capturedAt: z.iso.datetime({ offset: true }),
  version: z.int().positive(),
});

const CaptureHistoryItemSchema = z.discriminatedUnion("processingState", [
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("pending_processing"),
  }).strict(),
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("routed_as_task"),
    derivedTaskId: TaskIdSchema,
    routedAt: z.iso.datetime({ offset: true }),
    routedBy: PrincipalIdSchema,
  }).strict(),
]);

export const QueryProjectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("workspace.bootstrapContext"),
      workspace: z
        .object({
          id: WorkspaceIdSchema,
          name: z.string(),
          timezone: z.string(),
          defaultTaskStatusId: TaskStatusIdSchema,
          version: z.int().positive(),
        })
        .strict(),
      spaces: z.array(
        z
          .object({
            id: SpaceIdSchema,
            name: z.string(),
            version: z.int().positive(),
          })
          .strict(),
      ),
      taskStatuses: z.array(
        z
          .object({
            id: TaskStatusIdSchema,
            label: z.string(),
            operationalSemantics: z.literal("actionable"),
            position: z.int().nonnegative(),
            version: z.int().positive(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("capture.history"),
      items: z.array(CaptureHistoryItemSchema),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("task.list"),
      items: z.array(
        z
          .object({
            id: TaskIdSchema,
            spaceId: SpaceIdSchema,
            title: z.string(),
            status: z
              .object({
                id: TaskStatusIdSchema,
                label: z.string(),
                operationalSemantics: z.literal("actionable"),
              })
              .strict(),
            completionState: z.enum(["open", "completed"]),
            completedAt: z.iso.datetime({ offset: true }).optional(),
            sourceCaptureId: CaptureIdSchema.optional(),
            createdAt: z.iso.datetime({ offset: true }),
            updatedAt: z.iso.datetime({ offset: true }),
            version: z.int().positive(),
          })
          .strict(),
      ),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("project.list"),
      items: z.array(
        z
          .object({
            id: ProjectIdSchema,
            spaceId: SpaceIdSchema,
            title: z.string(),
            intendedOutcome: z.string(),
            lifecycle: z.literal("active"),
            relatedOpenTaskCount: z.int().nonnegative(),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("project.operationalOverview"),
      project: z
        .object({
          id: ProjectIdSchema,
          spaceId: SpaceIdSchema,
          title: z.string(),
          intendedOutcome: z.string(),
          lifecycle: z.literal("active"),
          version: z.int().positive(),
          updatedAt: z.iso.datetime({ offset: true }),
        })
        .strict(),
      relatedTasks: z.array(
        z
          .object({
            id: TaskIdSchema,
            title: z.string(),
            completionState: z.enum(["open", "completed"]),
            version: z.int().positive(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("search.global"),
      normalizedQuery: z.string(),
      items: z.array(
        z
          .object({
            recordKind: z.enum(["task", "project", "capture"]),
            recordId: z.uuid(),
            spaceId: SpaceIdSchema,
            title: z.string(),
            snippet: z.string(),
            matchedFields: z.array(
              z.enum(["title", "intendedOutcome", "originalText"]),
            ),
            score: z.int().nonnegative(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cockpit.week"),
      weekStart: z.iso.date(),
      weekEnd: z.iso.date(),
      focus: z.array(
        z
          .object({
            taskId: TaskIdSchema,
            title: z.string(),
            score: z.int().nonnegative(),
            reasons: z.array(
              z.discriminatedUnion("code", [
                z
                  .object({
                    code: z.literal("task_open"),
                    weight: z.literal(100),
                  })
                  .strict(),
                z
                  .object({
                    code: z.literal("created_this_week"),
                    weight: z.literal(20),
                  })
                  .strict(),
                z
                  .object({
                    code: z.literal("active_project"),
                    weight: z.literal(10),
                    projectId: ProjectIdSchema,
                    projectTitle: z.string(),
                  })
                  .strict(),
              ]),
            ),
            relatedProjectId: ProjectIdSchema.optional(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("activity.meaningful"),
      items: z.array(
        z
          .object({
            eventId: z.uuid(),
            targetCommandId: CommandIdSchema,
            activityType: z.enum([
              "capture_routed",
              "project_created",
              "project_outcome_changed",
              "task_completed",
              "task_reopened",
              "relation_added",
              "relation_removed",
              "command_undone",
            ]),
            recordId: z.uuid(),
            occurredAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("recovery.preview"),
      targetCommandId: CommandIdSchema,
      available: z.boolean(),
      compensationKind: z
        .enum([
          "project.restore_outcome",
          "task.restore_state",
          "relation.remove",
          "relation.restore",
          "capture.undo_route",
        ])
        .optional(),
      affectedRecordIds: z.array(z.uuid()),
      requiredVersions: z.record(z.uuid(), z.int().positive()),
      unavailableReason: z
        .enum(["unsupported", "already_undone", "later_change"])
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("audit.receipt"),
      receipt: z
        .object({
          id: AuditReceiptIdSchema,
          principalId: PrincipalIdSchema,
          grantId: GrantIdSchema,
          origin: RequestOriginSchema,
          commandId: CommandIdSchema,
          commandName: z.string(),
          correlationId: CorrelationIdSchema,
          affectedRecordIds: z.array(z.uuid()),
          recordVersions: z.record(z.uuid(), z.int().positive()),
          changedFields: z.array(z.string()),
          occurredAt: z.iso.datetime({ offset: true }),
          outcome: z.literal("success"),
        })
        .strict(),
    })
    .strict(),
]);
export type QueryProjection = z.infer<typeof QueryProjectionSchema>;

const QueryResultMetadataSchema = z
  .object({
    contractVersion: ContractVersionSchema,
    queryId: QueryIdSchema,
    kernelTime: z.iso.datetime({ offset: true }),
  })
  .strict();

export const QuerySuccessSchema = QueryResultMetadataSchema.extend({
  outcome: z.literal("success"),
  projection: QueryProjectionSchema,
  freshness: FreshnessSchema,
}).strict();

export const QueryRejectedSchema = QueryResultMetadataSchema.extend({
  outcome: z.literal("rejected"),
  diagnosticCode: z.enum([
    "authorization.denied",
    "query.not_available",
    "query.cursor_invalid",
    "query.consistency_unavailable",
  ]),
}).strict();

export const QueryResultSchema = z.discriminatedUnion("outcome", [
  QuerySuccessSchema,
  QueryRejectedSchema,
]);
export type QueryResult = z.infer<typeof QueryResultSchema>;
