import { z } from "zod";

import {
  AuditReceiptIdSchema,
  CaptureIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  DocumentIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  QueryIdSchema,
  SpaceIdSchema,
  TaskIdSchema,
  TaskAssignmentIdSchema,
  CommentIdSchema,
  AttentionSignalIdSchema,
  AgentRunIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
  CheckpointIdSchema,
  KnowledgeSourceIdSchema,
  NamedDocumentVersionIdSchema,
  DocumentRevisionIdSchema,
  StrategicRecordIdSchema,
} from "./ids.js";
import {
  CaptureOriginalSchema,
  CaptureReviewReasonSchema,
  ContractVersionSchema,
} from "./command.js";
import { RequestOriginSchema } from "./execution-context.js";
import { ImportedMeetingSchema } from "./meeting-loop.js";

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

export const WorkspaceAccessQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("workspace.access"),
  parameters: z.object({}).strict(),
}).strict();

export const WorkspaceExportScopedQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("workspace.exportScoped"),
  parameters: z.object({}).strict(),
}).strict();

export const AgentAccessQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("agent.access"),
  parameters: z.object({}).strict(),
}).strict();

export const AgentCheckpointPreviewRevertQuerySchema =
  QueryMetadataSchema.extend({
    queryName: z.literal("agent.checkpointPreviewRevert"),
    parameters: z.object({ checkpointId: CheckpointIdSchema }).strict(),
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
      orderBy: z.enum(["created_desc", "due_asc"]).optional(),
      statusIds: z.array(TaskStatusIdSchema).max(50).optional(),
      priorities: z
        .array(z.enum(["urgent", "high", "normal", "low"]))
        .max(4)
        .optional(),
      scheduled: z.boolean().optional(),
      dueBefore: z.iso.datetime({ offset: true }).optional(),
      dueAfter: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
}).strict();

export const TaskAssignmentCandidatesQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("task.assignmentCandidates"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

const CommentQueryTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), taskId: TaskIdSchema }).strict(),
  z.object({ kind: z.literal("project"), projectId: ProjectIdSchema }).strict(),
]);

export const CommentListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("comment.list"),
  parameters: z.object({ target: CommentQueryTargetSchema }).strict(),
}).strict();

export const CommentMentionCandidatesQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("comment.mentionCandidates"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

export const AttentionInboxQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("attention.inbox"),
  parameters: z.object({ limit: z.int().min(1).max(200).optional() }).strict(),
}).strict();

export const ProjectListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("project.list"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

export const WorkOverviewQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("work.overview"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

export const DocumentListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("document.list"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

export const KnowledgeListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("knowledge.list"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

export const KnowledgeDocumentContextQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("knowledge.documentContext"),
  parameters: z.object({ documentId: DocumentIdSchema }).strict(),
}).strict();

export const RelationshipWorkspaceQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("relationship.workspace"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();
export const RadarReviewQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("radar.review"),
  parameters: z
    .object({
      spaceId: SpaceIdSchema,
      limit: z.int().min(1).max(50).default(12),
    })
    .strict(),
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
        .array(
          z.enum([
            "task",
            "project",
            "capture",
            "source",
            "note",
            "document",
            "deliverable",
            "organization",
            "person",
            "opportunity",
            "offer",
            "renewal",
            "relationship_fact",
            "decision",
            "impact_review",
            "area",
            "recurrence",
            "radar_candidate",
            "meeting",
          ]),
        )
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
  WorkspaceAccessQuerySchema,
  WorkspaceExportScopedQuerySchema,
  AgentAccessQuerySchema,
  AgentCheckpointPreviewRevertQuerySchema,
  CaptureHistoryQuerySchema,
  TaskListQuerySchema,
  TaskAssignmentCandidatesQuerySchema,
  CommentListQuerySchema,
  CommentMentionCandidatesQuerySchema,
  AttentionInboxQuerySchema,
  ProjectListQuerySchema,
  WorkOverviewQuerySchema,
  DocumentListQuerySchema,
  KnowledgeListQuerySchema,
  KnowledgeDocumentContextQuerySchema,
  RelationshipWorkspaceQuerySchema,
  RadarReviewQuerySchema,
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
  original: CaptureOriginalSchema,
  source: z.enum(["global_quick_capture", "in_app_quick_capture"]),
  capturedAt: z.iso.datetime({ offset: true }),
  version: z.int().positive(),
});

const StrategicRecordBaseSchema = z.object({
  id: StrategicRecordIdSchema,
  workspaceId: WorkspaceIdSchema,
  spaceId: SpaceIdSchema,
  createdBy: PrincipalIdSchema,
  version: z.int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const StrategicRecordProjectionSchema = z.discriminatedUnion("kind", [
  StrategicRecordBaseSchema.extend({
    kind: z.literal("organization"),
    name: z.string(),
    relationshipState: z.enum(["prospect", "active", "inactive"]),
    nextAction: z.string().optional(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("person"),
    name: z.string(),
    organizationId: StrategicRecordIdSchema.optional(),
    role: z.string().optional(),
    email: z.string().optional(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("opportunity"),
    title: z.string(),
    organizationId: StrategicRecordIdSchema,
    personIds: z.array(StrategicRecordIdSchema),
    need: z.string(),
    qualification: z.string(),
    stage: z.string(),
    nextAction: z.string(),
    evidenceSourceIds: z.array(KnowledgeSourceIdSchema),
    offerIds: z.array(StrategicRecordIdSchema),
    projectIds: z.array(ProjectIdSchema),
    state: z.enum(["open", "pursued", "deferred", "rejected", "lost"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("offer"),
    title: z.string(),
    opportunityId: StrategicRecordIdSchema,
    deliverableDocumentId: DocumentIdSchema,
    ownerPrincipalId: PrincipalIdSchema,
    state: z.enum(["draft", "ready", "submitted", "accepted", "declined"]),
    nextAction: z.string(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("renewal"),
    organizationId: StrategicRecordIdSchema,
    title: z.string(),
    scope: z.string(),
    expiresAt: z.iso.datetime({ offset: true }),
    leadTimeDays: z.int().nonnegative(),
    ownerPrincipalId: PrincipalIdSchema,
    evidenceSourceIds: z.array(KnowledgeSourceIdSchema),
    followUpTaskId: TaskIdSchema,
    cycleKey: z.string(),
    state: z.enum(["watching", "renewed", "not_renewing", "irrelevant"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("relationship_fact"),
    organizationId: StrategicRecordIdSchema,
    factType: z.string(),
    value: z.string(),
    evidenceSourceIds: z.array(KnowledgeSourceIdSchema),
    verifiedAt: z.iso.datetime({ offset: true }),
    staleAfter: z.iso.datetime({ offset: true }),
    state: z.enum(["current", "stale", "conflicted"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("decision"),
    title: z.string(),
    rationale: z.string(),
    evidenceSourceIds: z.array(KnowledgeSourceIdSchema),
    linkedRecordIds: z.array(z.uuid()),
    state: z.enum(["current", "superseded"]),
    supersededById: StrategicRecordIdSchema.optional(),
    supersededAt: z.iso.datetime({ offset: true }).optional(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("impact_review"),
    priorDecisionId: StrategicRecordIdSchema,
    replacementDecisionId: StrategicRecordIdSchema,
    reason: z.string(),
    consequences: z.array(
      z
        .object({
          recordId: z.uuid(),
          recordKind: z.enum([
            "task",
            "offer",
            "document",
            "deliverable",
            "commitment",
          ]),
          state: z.enum(["open", "resolved"]),
          resolution: z.string().optional(),
        })
        .strict(),
    ),
    state: z.enum(["open", "resolved"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("area"),
    title: z.string(),
    responsibility: z.string(),
    state: z.enum(["active", "archived"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("initiative"),
    title: z.string(),
    intendedOutcome: z.string(),
    state: z.enum(["active", "closed"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("work_link"),
    linkType: z.enum([
      "project_advances_initiative",
      "project_serves_area",
      "task_depends_on_task",
    ]),
    sourceRecordId: z.uuid(),
    targetRecordId: z.uuid(),
    state: z.enum(["active", "removed"]),
    removedAt: z.iso.datetime({ offset: true }).optional(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("saved_view"),
    name: z.string(),
    filters: z
      .object({
        operationalStates: z
          .array(z.enum(["actionable", "waiting", "blocked"]))
          .optional(),
        projectIds: z.array(ProjectIdSchema).optional(),
        areaIds: z.array(StrategicRecordIdSchema).optional(),
        initiativeIds: z.array(StrategicRecordIdSchema).optional(),
        unassigned: z.boolean().optional(),
      })
      .strict(),
    sort: z.enum(["updated_desc", "due_asc", "title_asc"]),
    state: z.enum(["active", "deleted"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("recurrence"),
    title: z.string(),
    taskTitle: z.string(),
    contextRecordId: z.uuid().optional(),
    cadence: z.enum(["daily", "weekly", "monthly", "yearly"]),
    nextDueAt: z.iso.datetime({ offset: true }),
    state: z.enum(["active", "paused", "ended"]),
    lastOccurrenceTaskId: TaskIdSchema.optional(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("radar_candidate"),
    sourceId: KnowledgeSourceIdSchema,
    materialKey: z.string(),
    title: z.string(),
    relevance: z.string(),
    state: z.enum(["pending", "saved", "dismissed"]),
    resolutionRecordId: z.uuid().optional(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("meeting"),
    meeting: ImportedMeetingSchema,
  }).strict(),
]);

const CaptureHistoryItemSchema = z.discriminatedUnion("processingState", [
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("pending_processing"),
  }).strict(),
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("awaiting_transcript"),
    awaitingTranscriptSince: z.iso.datetime({ offset: true }),
  }).strict(),
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("transcript_ready"),
    transcript: z
      .object({
        text: z.string(),
        audioContentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
        writtenAt: z.iso.datetime({ offset: true }),
        writtenBy: PrincipalIdSchema,
        writtenByKind: z.enum(["human", "integration", "system", "agent"]),
        agentRunId: AgentRunIdSchema.optional(),
        hostRunId: z.string().optional(),
      })
      .strict(),
    audioState: z.enum(["deletion_pending", "retained", "deleted"]),
    audioStateChangedAt: z.iso.datetime({ offset: true }),
  }).strict(),
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("routed_as_task"),
    derivedTaskId: TaskIdSchema,
    routedAt: z.iso.datetime({ offset: true }),
    routedBy: PrincipalIdSchema,
  }).strict(),
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("routed_as_knowledge_source"),
    derivedKnowledgeSourceId: KnowledgeSourceIdSchema,
    routedAt: z.iso.datetime({ offset: true }),
    routedBy: PrincipalIdSchema,
  }).strict(),
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("needs_review"),
    reviewReason: CaptureReviewReasonSchema,
    duplicateOfCaptureId: CaptureIdSchema.optional(),
    attentionSignalId: AttentionSignalIdSchema,
    reviewedAt: z.iso.datetime({ offset: true }),
  }).strict(),
  CaptureHistoryItemBaseSchema.extend({
    processingState: z.literal("unclassified"),
    unclassifiedAt: z.iso.datetime({ offset: true }),
    unclassifiedBy: PrincipalIdSchema,
    previousReviewReason: CaptureReviewReasonSchema,
  }).strict(),
]);

export const QueryProjectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("work.overview"),
      tasks: z.array(
        z
          .object({
            id: TaskIdSchema,
            title: z.string(),
            operationalState: z.enum(["actionable", "waiting", "blocked"]),
            waitingOn: z
              .object({
                kind: z.enum(["person", "task", "external"]),
                label: z.string(),
                recordId: z.uuid().optional(),
              })
              .strict()
              .optional(),
            completionState: z.enum(["open", "completed"]),
            startAt: z.iso.datetime({ offset: true }).optional(),
            dueAt: z.iso.datetime({ offset: true }).optional(),
            priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      projects: z.array(
        z
          .object({
            id: ProjectIdSchema,
            title: z.string(),
            intendedOutcome: z.string(),
            lifecycle: z.enum(["active", "closed"]),
            version: z.int().positive(),
          })
          .strict(),
      ),
      areas: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            responsibility: z.string(),
            state: z.enum(["active", "archived"]),
            version: z.int().positive(),
          })
          .strict(),
      ),
      initiatives: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            intendedOutcome: z.string(),
            state: z.enum(["active", "closed"]),
            version: z.int().positive(),
          })
          .strict(),
      ),
      links: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            linkType: z.enum([
              "project_advances_initiative",
              "project_serves_area",
              "task_depends_on_task",
            ]),
            sourceRecordId: z.uuid(),
            targetRecordId: z.uuid(),
            state: z.enum(["active", "removed"]),
            version: z.int().positive(),
          })
          .strict(),
      ),
      savedViews: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            name: z.string(),
            filters: z
              .object({
                operationalStates: z
                  .array(z.enum(["actionable", "waiting", "blocked"]))
                  .optional(),
                projectIds: z.array(ProjectIdSchema).optional(),
                areaIds: z.array(StrategicRecordIdSchema).optional(),
                initiativeIds: z.array(StrategicRecordIdSchema).optional(),
                unassigned: z.boolean().optional(),
              })
              .strict(),
            sort: z.enum(["updated_desc", "due_asc", "title_asc"]),
            state: z.enum(["active", "deleted"]),
            version: z.int().positive(),
          })
          .strict(),
      ),
      freshness: FreshnessSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("relationship.workspace"),
      records: z.array(StrategicRecordProjectionSchema),
      freshness: FreshnessSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("radar.review"),
      items: z.array(StrategicRecordProjectionSchema),
      pendingCount: z.int().nonnegative(),
      finite: z.literal(true),
      freshness: FreshnessSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("agent.access"),
      policyVersion: z.int().positive(),
      workspaceVersion: z.int().positive(),
      canManage: z.boolean(),
      grants: z.array(
        z
          .object({
            grantId: GrantIdSchema,
            agentPrincipalId: PrincipalIdSchema,
            displayName: z.string(),
            preset: z.enum([
              "observe",
              "propose",
              "operate",
              "full_access",
              "custom",
            ]),
            capabilityScope: z.array(z.string()),
            status: z.enum(["active", "expired", "revoked"]),
            expiresAt: z.iso.datetime({ offset: true }).optional(),
            credentialVersion: z.int().positive(),
            version: z.int().positive(),
            membershipId: z.uuid(),
            membershipVersion: z.int().positive(),
            spaces: z.array(
              z
                .object({
                  spaceId: SpaceIdSchema,
                  spaceName: z.string(),
                  spaceGrantId: z.uuid(),
                  access: z.enum(["view", "comment", "edit"]),
                  version: z.int().positive(),
                })
                .strict(),
            ),
            lastUsedAt: z.iso.datetime({ offset: true }).optional(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("agent.checkpoint_revert_preview"),
      checkpointId: CheckpointIdSchema,
      available: z.boolean(),
      commandIds: z.array(CommandIdSchema),
      affectedRecordIds: z.array(z.uuid()),
      unavailableReason: z
        .enum(["missing", "already_reverted", "unsupported", "later_change"])
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("workspace.access"),
      policyVersion: z.int().positive(),
      currentPrincipalId: PrincipalIdSchema,
      canManage: z.boolean(),
      members: z.array(
        z
          .object({
            membershipId: z.uuid(),
            principalId: PrincipalIdSchema,
            displayName: z.string(),
            role: z.enum(["owner", "admin", "member", "guest"]),
            status: z.enum(["active", "revoked"]),
            version: z.int().positive(),
            spaces: z.array(
              z
                .object({
                  spaceGrantId: z.uuid(),
                  spaceId: SpaceIdSchema,
                  spaceName: z.string(),
                  access: z.enum(["view", "comment", "edit"]),
                  status: z.enum(["active", "revoked"]),
                  version: z.int().positive(),
                })
                .strict(),
            ),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("workspace.exportScoped"),
      policyVersion: z.int().positive(),
      workspace: z.object({ id: WorkspaceIdSchema, name: z.string() }).strict(),
      spaces: z.array(
        z.object({ id: SpaceIdSchema, name: z.string() }).strict(),
      ),
      counts: z
        .object({
          tasks: z.int().nonnegative(),
          projects: z.int().nonnegative(),
          documents: z.int().nonnegative().default(0),
          knowledgeSources: z.int().nonnegative().default(0),
          namedDocumentVersions: z.int().nonnegative().default(0),
          relations: z.int().nonnegative(),
          captures: z.int().nonnegative(),
          activity: z.int().nonnegative(),
          taskAssignments: z.int().nonnegative().default(0),
          comments: z.int().nonnegative().default(0),
          attentionSignals: z.int().nonnegative().default(0),
          strategicRecords: z.int().nonnegative().default(0),
        })
        .strict(),
      records: z.array(
        z
          .object({
            kind: z.enum([
              "task",
              "project",
              "document",
              "knowledge_source",
              "named_document_version",
              "capture",
              "task_assignment",
              "comment",
              "attention_signal",
              "strategic_record",
            ]),
            id: z.uuid(),
            spaceId: SpaceIdSchema,
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("workspace.bootstrapContext"),
      workspace: z
        .object({
          id: WorkspaceIdSchema,
          name: z.string(),
          timezone: z.string(),
          defaultTaskStatusId: TaskStatusIdSchema,
          voiceAudioRetentionPolicy: z.enum([
            "delete_after_transcript",
            "retain",
          ]),
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
            description: z.string().optional(),
            nextAction: z.string().optional(),
            startAt: z.iso.datetime({ offset: true }).optional(),
            dueAt: z.iso.datetime({ offset: true }).optional(),
            priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
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
            assignment: z
              .object({
                id: TaskAssignmentIdSchema,
                assigneePrincipalId: PrincipalIdSchema.optional(),
                displayName: z.string(),
                availability: z.enum([
                  "active",
                  "unavailable_member",
                  "former_member",
                ]),
                version: z.int().positive(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      ),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("knowledge.list"),
      spaceId: SpaceIdSchema,
      sources: z.array(
        z
          .object({
            id: KnowledgeSourceIdSchema,
            sourceKind: z.enum(["url", "file", "screenshot", "excerpt"]),
            title: z.string(),
            canonicalUrl: z.string().optional(),
            availability: z.enum([
              "reference_only",
              "available",
              "unavailable",
            ]),
            observedAt: z.iso.datetime({ offset: true }),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      documents: z.array(
        z
          .object({
            id: DocumentIdSchema,
            title: z.string(),
            role: z.enum(["note", "document", "deliverable"]),
            evidenceCount: z.int().nonnegative(),
            namedVersionCount: z.int().nonnegative(),
            staleEvidence: z.boolean(),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("knowledge.documentContext"),
      document: z
        .object({
          id: DocumentIdSchema,
          spaceId: SpaceIdSchema,
          title: z.string(),
          role: z.enum(["note", "document", "deliverable"]),
          version: z.int().positive(),
          updatedAt: z.iso.datetime({ offset: true }),
        })
        .strict(),
      evidence: z.array(
        z
          .object({
            kind: z.enum(["source", "note"]),
            recordId: z.uuid(),
            title: z.string(),
            currentVersion: z.int().positive(),
          })
          .strict(),
      ),
      namedVersions: z.array(
        z
          .object({
            id: NamedDocumentVersionIdSchema,
            documentRevisionId: DocumentRevisionIdSchema,
            name: z.string(),
            milestone: z.enum([
              "finalized",
              "delivered",
              "approved",
              "published",
            ]),
            contentSnapshot: z.string(),
            evidence: z.array(
              z
                .object({
                  kind: z.enum(["source", "note"]),
                  recordId: z.uuid(),
                  title: z.string(),
                  frozenVersion: z.int().positive(),
                  currentVersion: z.int().positive().optional(),
                  changed: z.boolean(),
                })
                .strict(),
            ),
            state: z.enum(["active", "voided"]),
            version: z.int().positive(),
            createdAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("task.assignmentCandidates"),
      spaceId: SpaceIdSchema,
      candidates: z.array(
        z
          .object({
            principalId: PrincipalIdSchema,
            displayName: z.string(),
            participantKind: z.enum(["member", "guest"]),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("comment.list"),
      target: CommentQueryTargetSchema,
      threads: z.array(
        z
          .object({
            id: CommentIdSchema,
            parentCommentId: CommentIdSchema.optional(),
            rootCommentId: CommentIdSchema,
            body: z.string(),
            author: z
              .object({
                principalId: PrincipalIdSchema.optional(),
                displayName: z.string(),
              })
              .strict(),
            mentionPrincipalIds: z.array(PrincipalIdSchema),
            threadState: z.enum(["open", "resolved"]),
            version: z.int().positive(),
            createdAt: z.iso.datetime({ offset: true }),
            updatedAt: z.iso.datetime({ offset: true }),
            edited: z.boolean(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("comment.mentionCandidates"),
      spaceId: SpaceIdSchema,
      candidates: z.array(
        z
          .object({
            principalId: PrincipalIdSchema,
            displayName: z.string(),
            participantKind: z.enum(["member", "guest"]),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("attention.inbox"),
      unreadCount: z.int().nonnegative(),
      items: z.array(
        z
          .object({
            id: AttentionSignalIdSchema,
            reason: z.enum([
              "comment_mention",
              "task_assignment",
              "sync_conflict",
              "knowledge_evidence_changed",
              "renewal_due",
              "relationship_fact_stale",
              "decision_impact_review",
              "capture_duplicate",
              "capture_unsupported",
              "capture_ambiguous",
              "capture_parsing_failure",
              "capture_permission_failure",
              "capture_stale_conflict",
              "capture_missing_target",
              "capture_missing_payload",
              "capture_partial_payload_transfer",
              "capture_unknown_reconcile",
            ]),
            destination: z.discriminatedUnion("kind", [
              z
                .object({ kind: z.literal("task"), taskId: TaskIdSchema })
                .strict(),
              z
                .object({
                  kind: z.literal("project"),
                  projectId: ProjectIdSchema,
                })
                .strict(),
              z
                .object({
                  kind: z.literal("document"),
                  documentId: DocumentIdSchema,
                })
                .strict(),
              z
                .object({
                  kind: z.literal("capture"),
                  captureId: CaptureIdSchema,
                })
                .strict(),
            ]),
            title: z.string(),
            detail: z.string(),
            urgency: z.enum(["in_app", "urgent"]),
            state: z.enum(["unread", "read", "dismissed"]),
            version: z.int().positive(),
            occurredAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
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
            lifecycle: z.enum(["active", "closed"]),
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
      kind: z.literal("document.list"),
      items: z.array(
        z
          .object({
            id: DocumentIdSchema,
            spaceId: SpaceIdSchema,
            title: z.string(),
            role: z.enum(["note", "document", "deliverable"]),
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
          lifecycle: z.enum(["active", "closed"]),
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
            assignment: z
              .object({
                id: TaskAssignmentIdSchema,
                assigneePrincipalId: PrincipalIdSchema.optional(),
                displayName: z.string(),
                availability: z.enum([
                  "active",
                  "unavailable_member",
                  "former_member",
                ]),
                version: z.int().positive(),
              })
              .strict()
              .optional(),
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
            recordKind: z.enum([
              "task",
              "project",
              "capture",
              "source",
              "note",
              "document",
              "deliverable",
              "organization",
              "person",
              "opportunity",
              "offer",
              "renewal",
              "relationship_fact",
              "decision",
              "impact_review",
              "area",
              "recurrence",
              "radar_candidate",
              "meeting",
            ]),
            recordId: z.uuid(),
            spaceId: SpaceIdSchema,
            title: z.string(),
            snippet: z.string(),
            matchedFields: z.array(
              z.enum([
                "title",
                "description",
                "nextAction",
                "intendedOutcome",
                "originalText",
                "excerpt",
                "canonicalUrl",
                "detail",
              ]),
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
            startAt: z.iso.datetime({ offset: true }).optional(),
            dueAt: z.iso.datetime({ offset: true }).optional(),
            priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
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
                    code: z.literal("overdue"),
                    weight: z.literal(60),
                    dueAt: z.iso.datetime({ offset: true }),
                  })
                  .strict(),
                z
                  .object({
                    code: z.literal("due_this_week"),
                    weight: z.literal(40),
                    dueAt: z.iso.datetime({ offset: true }),
                  })
                  .strict(),
                z
                  .object({
                    code: z.literal("starts_this_week"),
                    weight: z.literal(15),
                    startAt: z.iso.datetime({ offset: true }),
                  })
                  .strict(),
                z
                  .object({
                    code: z.literal("priority_urgent"),
                    weight: z.literal(25),
                  })
                  .strict(),
                z
                  .object({
                    code: z.literal("priority_high"),
                    weight: z.literal(15),
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
              "capture_transcript_ready",
              "project_created",
              "project_outcome_changed",
              "task_created",
              "task_details_updated",
              "task_completed",
              "task_reopened",
              "task_assigned",
              "task_unassigned",
              "comment_added",
              "comment_resolved",
              "comment_reopened",
              "relation_added",
              "relation_removed",
              "knowledge_source_created",
              "knowledge_source_updated",
              "knowledge_evidence_updated",
              "knowledge_named_version_created",
              "knowledge_named_version_voided",
              "strategic_record_changed",
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
          "task.restore_details",
          "task.restore_operational_state",
          "work_link.restore_state",
          "relation.remove",
          "relation.restore",
          "capture.undo_route",
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
          checkpointId: CheckpointIdSchema.optional(),
          agentRunId: z.uuid().optional(),
          hostRunId: z.string().optional(),
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
