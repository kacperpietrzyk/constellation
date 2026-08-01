import { z } from "zod";

import { WorkingDaySchema as WorkingDayProjectionSchema } from "./working-day.js";
import { CommercialDefaultsSchema as CommercialDefaultsProjectionSchema } from "./commercial-defaults.js";

import {
  AuditReceiptIdSchema,
  CaptureIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  DocumentIdSchema,
  FolderIdSchema,
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
  FieldDefinitionIdSchema,
  AutomationRuleIdSchema,
  ProjectTemplateIdSchema,
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
  CommentTargetSchema,
  ContractVersionSchema,
  FieldDefinitionTypeSchema,
  RelationConditionsSchema,
  SavedViewFieldFiltersSchema,
  SavedViewFiltersSchema,
  SavedViewGroupBySchema,
  SavedViewLayoutSchema,
  TaskAssigneePrincipalIdsFilterSchema,
  TaskOperationalStatesFilterSchema,
  WorkLinkTypeSchema,
} from "./command.js";
import {
  GrantScopeStatusSchema,
  RequestOriginSchema,
} from "./execution-context.js";
import { ImportedMeetingSchema } from "./meeting-loop.js";
import { ExchangeRateSchema, MoneySchema, OfferPriceSchema } from "./money.js";
import { NeedsReviewSchema } from "./narrative.js";
import {
  DEPENDENT_SAMPLE_LIMIT,
  RecordKindSchema,
  StrategicRecordTypeSchema,
} from "./outcome.js";
import { GlobalSearchRecordKindSchema } from "./record-kind-registry.js";
import {
  CheckpointRevertUnavailableReasonSchema,
  CompensationKindSchema,
  UndoUnavailableReasonSchema,
} from "./recovery.js";

// R12.6 / ADR-042 — the calendar block reserving time to do a task, distinct
// from its deadline. Named once and reused by every projection that carries a
// plan: two copies of this shape would drift the day one of them gains a field,
// and a work surface reading the thinner copy would quietly show less.
export const TaskCalendarBlockProjectionSchema = z
  .object({
    ownedBlockExternalId: z.string(),
    calendarExternalId: z.string(),
    revision: z.string(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .strict();

// Who a task is assigned to, as far as the caller is allowed to know. The
// principal id is present only when the assignee is an active member the
// caller shares a Space with; otherwise the name and availability say what
// happened without naming anybody. Shared by every projection that answers
// assignment, so one surface cannot end up naming a person another redacts.
export const TaskAssignmentProjectionSchema = z
  .object({
    id: TaskAssignmentIdSchema,
    assigneePrincipalId: PrincipalIdSchema.optional(),
    displayName: z.string(),
    availability: z.enum(["active", "unavailable_member", "former_member"]),
    version: z.int().positive(),
  })
  .strict();

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
      // A saved view's `dueWindow` has no parameter of its own: these two
      // express it, and the caller supplies the boundaries because the kernel
      // does no timezone arithmetic anywhere (`cockpit.week` takes `weekStart`
      // the same way). The conventions the desktop uses, so an operator can
      // reproduce a stored view exactly: `overdue` is `dueBefore: now`;
      // `today` is `dueAfter`/`dueBefore` at the day's bounds in the
      // workspace timezone; `this_week` is the ISO week (Monday-start) in that
      // same timezone, which `workspace.bootstrapContext` supplies.
      dueBefore: z.iso.datetime({ offset: true }).optional(),
      dueAfter: z.iso.datetime({ offset: true }).optional(),
      // B2b — the four saved-view filter concepts this query could not express.
      // Bounds are imported, never restated, so the view a person stores and
      // the query an operator sends cannot come to mean different things.
      //
      // Two properties an operator should know before comparing an answer to
      // what the desktop shows. The assignee filters match the assignee this
      // caller can SEE: a task assigned to a principal outside the caller's
      // reach contributes nothing, so a filter naming an invisible principal
      // answers empty rather than confirming that principal exists. And the
      // desktop applies a saved view over the whole Space at once, while this
      // query pages — reading one page and stopping is a different answer from
      // the view, however faithfully the filters were translated.
      operationalStates: TaskOperationalStatesFilterSchema.optional(),
      assigneePrincipalIds: TaskAssigneePrincipalIdsFilterSchema.optional(),
      // Only `true`. A saved view treats `unassigned: false` as no filter at
      // all, so accepting it here would be a parameter that is read, validated
      // and changes nothing — the shape of the deprecated id lists this
      // vocabulary already regrets. Refusing it says so out loud instead.
      unassigned: z.literal(true).optional(),
      // Evaluated over COMPUTED field values, matching what the desktop shows:
      // a formula or rollup definition has no stored value at all, so `set`
      // against storage would answer false for every field the workspace
      // computes.
      fields: SavedViewFieldFiltersSchema.optional(),
      // R13.5 / ADR-044 — typed relation-path conditions. Imported rather than
      // restated so a saved view and a task query cannot come to mean different
      // things by the same condition (ADR-045).
      relationConditions: RelationConditionsSchema.optional(),
    })
    .strict(),
}).strict();

export const TaskAssignmentCandidatesQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("task.assignmentCandidates"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

export const CommentListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("comment.list"),
  parameters: z.object({ target: CommentTargetSchema }).strict(),
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

/**
 * The closed vocabulary of things a rich document can link to inline. It is a
 * named constant rather than a bare `z.enum` because the same five arms used to
 * be spelled out by hand in seven places — the domain type, this schema, two
 * lists in `realtime-documents`, a SQL `CHECK`, two wrapper signatures in the
 * renderer and the renderer's own copy of the union — and none of them imported
 * from any other. Adding `document` in Wave D meant editing all of them, and
 * `tsc` was happy with every one left behind.
 *
 * Everything that can reach `@constellation/contracts` now imports this, so an
 * eighth arm breaks the build at every `Record<DocumentEntityTargetKind, …>`
 * and at the exhaustive switch in `resolveDocumentEntityTarget`. The two places
 * that cannot import it — `realtime-documents`, which deliberately depends on
 * nothing of ours, and the SQL `CHECK` inside a frozen migration — are held by
 * assertions that compare their vocabulary to this array.
 */
export const DOCUMENT_ENTITY_TARGET_KINDS = [
  "task",
  "project",
  "person",
  "organization",
  "meeting",
  "document",
] as const;

export type DocumentEntityTargetKind =
  (typeof DOCUMENT_ENTITY_TARGET_KINDS)[number];

export const DocumentEntityTargetKindSchema = z.enum(
  DOCUMENT_ENTITY_TARGET_KINDS,
);

export const DocumentLinkCandidatesQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("document.linkCandidates"),
  parameters: z
    .object({
      spaceId: SpaceIdSchema,
      text: z.string().trim().max(120).default(""),
      targets: z
        .array(
          z
            .object({
              targetKind: DocumentEntityTargetKindSchema,
              targetId: z.uuid(),
            })
            .strict(),
        )
        .max(100)
        .optional(),
      // Which arms the caller wants back. Absent means all of them, so every
      // existing caller keeps its behaviour. Two inline triggers can want
      // different vocabularies out of the same query, and the MCP catalogue
      // recorded "cannot be narrowed to a kind" as a limitation of this
      // picker; this is that narrowing.
      targetKinds: z
        .array(DocumentEntityTargetKindSchema)
        .min(1)
        .max(DOCUMENT_ENTITY_TARGET_KINDS.length)
        .optional(),
      // A note offering itself as a link target is noise, and the caller is
      // the only one that knows which note is open.
      excludeDocumentId: DocumentIdSchema.optional(),
      limit: z.int().min(1).max(100).default(20),
    })
    .strict(),
}).strict();

export const DocumentBacklinksQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("document.backlinks"),
  parameters: z
    .object({
      targetKind: DocumentEntityTargetKindSchema,
      targetId: z.uuid(),
    })
    .strict(),
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
// One kind each, on purpose. `relationship.workspace` is one answer and
// therefore one failure: a single record this build cannot project faults the
// whole set, which is what took Relacje and Praca down on 0.1.5. These read one
// kind, so a kind that cannot be projected cannot reach them — and their items
// are the same shape the wide read returns, so a record read from either is
// written back the same way.
//
// Uncapped and uncut on purpose: reconciling people needs the whole set, and a
// list that truncates without saying so is the trap `search.global` already
// sets. If a cap is ever added, the field that reports the cut ships with it.
export const PersonListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("person.list"),
  parameters: z.object({ spaceId: SpaceIdSchema }).strict(),
}).strict();

export const OrganizationListQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("organization.list"),
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

export const OrganizationOperationalOverviewQuerySchema =
  QueryMetadataSchema.extend({
    queryName: z.literal("organization.operationalOverview"),
    parameters: z
      .object({
        organizationId: StrategicRecordIdSchema,
        spaceId: SpaceIdSchema,
      })
      .strict(),
  }).strict();

export const GlobalSearchQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("search.global"),
  parameters: z
    .object({
      // The only query that spans Spaces, so the only one taking the plural;
      // every other Space-scoped query takes a single spaceId. Both names are
      // easy to guess wrong, and a strict envelope gives no second chance.
      spaceIds: z
        .array(SpaceIdSchema)
        .min(1)
        .max(50)
        .describe(
          "Every Space to search, each authorized in turn. Single-Space queries take spaceId instead.",
        ),
      text: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .describe("The search term. This field is named text, not query."),
      kinds: z.array(GlobalSearchRecordKindSchema).min(1).optional(),
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

/**
 * ADR-051 — a replayable, Space-scoped change feed. Distinct from
 * `activity.meaningful`, which is a curated human activity list with no
 * cursor: this one carries every event in the Space, in order, so an
 * external host can resume exactly where it stopped.
 */
export const ActivityChangeFeedQuerySchema = QueryMetadataSchema.extend({
  queryName: z.literal("activity.changeFeed"),
  parameters: z
    .object({
      spaceId: SpaceIdSchema,
      // The last event already processed. Absent starts from the beginning of
      // the Space's history; an unknown id is rejected rather than silently
      // restarting, because a silent restart replays work as new.
      afterEventId: z.uuid().optional(),
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
  DocumentLinkCandidatesQuerySchema,
  DocumentBacklinksQuerySchema,
  KnowledgeListQuerySchema,
  KnowledgeDocumentContextQuerySchema,
  RelationshipWorkspaceQuerySchema,
  PersonListQuerySchema,
  OrganizationListQuerySchema,
  RadarReviewQuerySchema,
  ProjectOperationalOverviewQuerySchema,
  OrganizationOperationalOverviewQuerySchema,
  GlobalSearchQuerySchema,
  CockpitWeekQuerySchema,
  MeaningfulActivityQuerySchema,
  ActivityChangeFeedQuerySchema,
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

// Kto położył zadanie na dniu i kiedy. JEDEN kształt dla wszystkich trzech
// projekcji, które niosą harmonogram zadania — druga kopia jest dokładnie tym,
// przez co słownik powiązań zaczął znaczyć co innego dla piszącego niż dla
// czytającego. Kontrakt „każdy projektowany harmonogram ma autora" jest
// wyprowadzany z tego rejestru w teście, bo `Task` nie ma strażnika projekcji.
export const TaskPlanAuthorshipSchema = z
  .object({
    principalId: PrincipalIdSchema,
    principalKind: z.enum(["human", "integration", "system", "agent"]),
    at: z.iso.datetime({ offset: true }),
  })
  .strict();

const StrategicRecordBaseSchema = z.object({
  id: StrategicRecordIdSchema,
  workspaceId: WorkspaceIdSchema,
  spaceId: SpaceIdSchema,
  createdBy: PrincipalIdSchema,
  // Projections list active records only, so this is always "active" when it
  // appears at all. It is carried rather than dropped because a reader that
  // holds a projection alongside a record it removed needs the two to be
  // distinguishable, and because the domain field must have a home here.
  recordState: z.enum(["active", "removed"]).optional(),
  version: z.int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type StrategicRecordProjection = z.infer<
  typeof StrategicRecordProjectionSchema
>;
// The one shape a person and an organization are projected in. `person.list`
// and `organization.list` share these with `relationship.workspace` rather than
// restating them: a second copy is how the work-link vocabulary came to mean
// different things to a writer and a reader.
export const OrganizationRecordProjectionSchema =
  StrategicRecordBaseSchema.extend({
    kind: z.literal("organization"),
    name: z.string(),
    relationshipState: z.enum(["prospect", "active", "inactive"]),
    nextAction: z.string().optional(),
    // Free text, and looser than the command bound for the same reason
    // `externalId` is: a projection that re-applied the write constraint would
    // make an already-stored value unreadable the day that bound moves.
    segment: z.string().optional(),
    // A calendar date, not a timestamp: "client since 2023-04-11" is a day, and
    // a time of day nobody recorded would be an invention. Bounded as a date at
    // the command boundary and as a bare string here, like `segment` and
    // `phone` beside it: this is a BOOT query, so a stored value the read side
    // refused would not degrade a screen, it would fault the whole workspace.
    since: z.string().optional(),
    // The contact AT this organisation. See the domain arm for why this is not
    // an owner on our side and why the column is `Main contact`.
    mainContactPersonId: StrategicRecordIdSchema.optional(),
    // Deliberately looser than the command's bound, exactly like `role` and
    // `email` on the person arm: a projection that re-applied the write
    // constraint would make an already-stored value unreadable the day that
    // bound is tightened, which is the outage this branch exists to prevent.
    externalId: z.string().optional(),
  }).strict();

export const PersonRecordProjectionSchema = StrategicRecordBaseSchema.extend({
  kind: z.literal("person"),
  name: z.string(),
  organizationId: StrategicRecordIdSchema.optional(),
  role: z.string().optional(),
  email: z.string().optional(),
  // As given. See the domain arm: a phone-number format this could not later
  // loosen would make an already-stored number unreadable.
  phone: z.string().optional(),
  externalId: z.string().optional(),
}).strict();

export const StrategicRecordProjectionSchema = z.discriminatedUnion("kind", [
  OrganizationRecordProjectionSchema,
  PersonRecordProjectionSchema,
  StrategicRecordBaseSchema.extend({
    kind: z.literal("opportunity"),
    title: z.string(),
    organizationId: StrategicRecordIdSchema,
    personIds: z.array(StrategicRecordIdSchema),
    // Whose deal this is, as against who is named on it. Absent means the
    // distinction was never recorded, not that nobody owns it.
    ownerPersonId: StrategicRecordIdSchema.optional(),
    need: z.string(),
    qualification: z.string(),
    // What the deal is worth before any offer exists. Absent means nobody has
    // put a number on it — never a zero.
    estimate: MoneySchema.optional(),
    stage: z.string(),
    /**
     * When the deal entered the stage it stands in. Absent on deals written
     * before the stage could move at all; a reader must say "unknown", never
     * fall back to the record's own age, which is the number this field exists
     * to stop being mistaken for.
     */
    stageEnteredAt: z.iso.datetime({ offset: true }).optional(),
    nextAction: z.string(),
    evidenceSourceIds: z.array(KnowledgeSourceIdSchema),
    offerIds: z.array(StrategicRecordIdSchema),
    projectIds: z.array(ProjectIdSchema),
    state: z.enum(["open", "pursued", "deferred", "rejected", "lost"]),
    /** See the organization arm: looser than the command's bound, on purpose. */
    externalId: z.string().optional(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("offer"),
    title: z.string(),
    opportunityId: StrategicRecordIdSchema,
    deliverableDocumentId: DocumentIdSchema,
    ownerPrincipalId: PrincipalIdSchema,
    cost: MoneySchema.optional(),
    rate: ExchangeRateSchema.optional(),
    // Both arms are readable forever even though only `confirmed` is written:
    // absent is what every offer written before this landed carries, and
    // narrowing a read-side union is the outage `money.ts` describes.
    price: OfferPriceSchema.optional(),
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
    /** Absent means nobody has started this renewal — a state, not a gap. */
    followUpTaskId: TaskIdSchema.optional(),
    termStartsAt: z.iso.datetime({ offset: true }).optional(),
    termMonths: z.int().nonnegative().optional(),
    cycleOrdinal: z.int().positive().optional(),
    cycleKey: z.string(),
    /** See the offer arm: looser than the command's bound, on purpose. */
    value: MoneySchema.optional(),
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
    // Forced here by `UnprojectableKeys`, and also what makes the shell
    // inspector read "Decision in the Acme relationship": that sentence is
    // built from `organizationId` on whatever record is selected, so the
    // published record has to carry the edge, not merely the kernel's copy.
    organizationId: StrategicRecordIdSchema.optional(),
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
    needsReview: NeedsReviewSchema,
    state: z.enum(["active", "archived"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("initiative"),
    title: z.string(),
    intendedOutcome: z.string(),
    needsReview: NeedsReviewSchema,
    state: z.enum(["active", "closed"]),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("work_link"),
    linkType: WorkLinkTypeSchema,
    sourceRecordId: z.uuid(),
    targetRecordId: z.uuid(),
    state: z.enum(["active", "removed"]),
    removedAt: z.iso.datetime({ offset: true }).optional(),
  }).strict(),
  StrategicRecordBaseSchema.extend({
    kind: z.literal("saved_view"),
    name: z.string(),
    // Shared with the command boundary: a saved view is projected with the
    // whole filter vocabulary it was allowed to be written with.
    filters: SavedViewFiltersSchema,
    sort: z.enum(["updated_desc", "due_asc", "title_asc"]),
    groupBy: SavedViewGroupBySchema.optional(),
    layout: SavedViewLayoutSchema.optional(),
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

const ManagedAttachmentProjectionSchema = z
  .object({
    sourceId: KnowledgeSourceIdSchema,
    captureId: CaptureIdSchema,
    original: z.union([
      CaptureOriginalSchema.options[3],
      CaptureOriginalSchema.options[4],
    ]),
    availability: z.enum(["available", "unavailable"]),
  })
  .strict();

// The one shape a Knowledge Source is projected in. `knowledge.list` and the
// evidence a Project rests on return the same fields, so they share the schema
// rather than restating it — a second copy is how the work-link vocabulary came
// to mean different things to a writer and a reader.
const KnowledgeSourceProjectionSchema = z
  .object({
    id: KnowledgeSourceIdSchema,
    sourceKind: z.enum(["url", "file", "screenshot", "excerpt"]),
    title: z.string(),
    canonicalUrl: z.string().optional(),
    availability: z.enum(["reference_only", "available", "unavailable"]),
    observedAt: z.iso.datetime({ offset: true }),
    version: z.int().positive(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/**
 * One record that rests on a Knowledge Source. Deliberately the same vocabulary
 * as `BlockingRecord`, plus a title: this is the inverse of the guard that
 * refuses to remove a Source something still points at, and the two must name
 * the same records. A caller reading "nothing references me" and then meeting
 * `record.still_referenced` would have no way to find what it missed.
 */
const SourceReferenceSchema = z
  .object({
    recordId: z.uuid(),
    recordKind: RecordKindSchema,
    recordType: StrategicRecordTypeSchema.optional(),
    // A relationship Fact has no title; its type is what a reader recognises
    // it by, and its value is the claim rather than the label.
    title: z.string(),
  })
  .strict();

export const QueryProjectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("work.overview"),
      tasks: z.array(
        z
          .object({
            id: TaskIdSchema,
            title: z.string(),
            statusId: TaskStatusIdSchema,
            operationalState: z.enum(["actionable", "waiting", "blocked"]),
            waitingOn: z
              .object({
                kind: z.enum(["person", "task", "external"]),
                label: z.string(),
                recordId: z.uuid().optional(),
                direction: z.enum(["waiting_on_them", "we_owe"]).optional(),
                expectedAt: z.iso.datetime({ offset: true }).optional(),
              })
              .strict()
              .optional(),
            completionState: z.enum(["open", "completed"]),
            startAt: z.iso.datetime({ offset: true }).optional(),
            plannedBy: TaskPlanAuthorshipSchema.optional(),
            dueAt: z.iso.datetime({ offset: true }).optional(),
            priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
            parentTaskId: TaskIdSchema.optional(),
            // Every Project this task contributes to, not the first one.
            // Task→Project is a relation record and `record.relate` guards
            // pair-uniqueness only, so the list can hold several. Grouping by
            // project lists such a task under EACH of them; an empty list is
            // the "no project" group. Required rather than optional on
            // purpose: `querySuccess` takes `Record<string, unknown>`, so a
            // mapper that forgets the field raises no type error — required
            // turns that into a loud parse failure instead of every task
            // silently landing under "no project".
            projectIds: z.array(ProjectIdSchema),
            fields: z
              .record(
                z.string(),
                z.discriminatedUnion("kind", [
                  z
                    .object({ kind: z.literal("text"), value: z.string() })
                    .strict(),
                  z
                    .object({ kind: z.literal("number"), value: z.number() })
                    .strict(),
                  z
                    .object({
                      kind: z.literal("date"),
                      value: z.iso.datetime({ offset: true }),
                    })
                    .strict(),
                  z
                    .object({ kind: z.literal("choice"), value: z.string() })
                    .strict(),
                ]),
              )
              .optional(),
            // The time actually held for this work, beside the day it is
            // planned for. Without it a work surface cannot tell a task that
            // is planned AND estimated from one that is merely planned — and
            // the shape of that distinction is the block's duration, so
            // inventing an effort field would restate what this already says.
            calendarBlock: TaskCalendarBlockProjectionSchema.optional(),
            // How this assignee may be named, on the same terms as
            // `task.list`: `assigneePrincipalId` is present only when the
            // caller may know who it is, and the name and availability say
            // what to show when it is not. The raw principal used to be
            // projected here unredacted, which was harmless only while nothing
            // rendered it — a screen grouping by assignee would otherwise sort
            // people it is not allowed to name.
            assignment: TaskAssignmentProjectionSchema.optional(),
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
            needsReview: NeedsReviewSchema,
            lifecycle: z.enum(["active", "closed"]),
            // Termin dostawy, opcjonalny. Nigdy nullowalny: `null` w polu
            // ISO ze `.strict()` wywala CAŁY odczyt, a nie jedną wartość.
            dueAt: z.iso.datetime({ offset: true }).optional(),
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
            needsReview: NeedsReviewSchema,
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
            needsReview: NeedsReviewSchema,
            state: z.enum(["active", "closed"]),
            version: z.int().positive(),
          })
          .strict(),
      ),
      links: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            linkType: WorkLinkTypeSchema,
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
            filters: SavedViewFiltersSchema,
            sort: z.enum(["updated_desc", "due_asc", "title_asc"]),
            groupBy: SavedViewGroupBySchema.optional(),
            layout: SavedViewLayoutSchema.optional(),
            // R13.5 / ADR-045 — the Task ids satisfying this view's relation
            // conditions, evaluated kernel-side by the same evaluator
            // `task.list` uses. Present only when the view carries relation
            // conditions; absent means "this view constrains nothing by
            // relation", which is different from an empty list ("constrains by
            // relation, and nothing matches").
            relationTaskIds: z.array(TaskIdSchema).optional(),
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
      kind: z.literal("person.list"),
      items: z.array(PersonRecordProjectionSchema),
      freshness: FreshnessSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("organization.list"),
      items: z.array(OrganizationRecordProjectionSchema),
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
            scopeStatus: GrantScopeStatusSchema,
            missingFromPreset: z.array(z.string()),
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
      unavailableReason: CheckpointRevertUnavailableReasonSchema.optional(),
      // The refusal a revert would return, before spending the checkpoint to
      // see it: one entry per captured command whose compensation does not
      // apply, in the shape the revert itself refuses with. `available: true`
      // and an empty list are the same statement made twice, on purpose —
      // a caller that reads only the list still reads the truth.
      blocked: z.array(
        z
          .object({
            targetCommandId: CommandIdSchema,
            unavailableReason: UndoUnavailableReasonSchema,
          })
          .strict(),
      ),
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
          // WYMAGANE, nie opcjonalne: odczyt dostaje wartość SKUTECZNĄ, więc
          // żaden ekran nie ma powodu przepisywać u siebie domyślnych ośmiu
          // godzin. Domyślna wartość mieszka w jednym miejscu, w domenie.
          workingDay: WorkingDayProjectionSchema,
          // WYMAGANE, nie opcjonalne, i z tego samego powodu co dzień roboczy:
          // odczyt dostaje wartości SKUTECZNE, więc żaden ekran nie ma powodu
          // trzymać u siebie drugiej kopii domyślnego lejka ani domyślnych 25%.
          // Gdyby to było `.optional()`, mapper, który zapomni je ustawić,
          // parsowałby się bez słowa, a każdy ekran pokazywałby pusty lejek.
          commercialDefaults: CommercialDefaultsProjectionSchema,
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
            operationalSemantics: z.enum([
              "actionable",
              "waiting",
              "blocked",
              "paused",
            ]),
            state: z.enum(["active", "archived"]).optional(),
            position: z.int().nonnegative(),
            version: z.int().positive(),
          })
          .strict(),
      ),
      fieldDefinitions: z
        .array(
          z
            .object({
              id: FieldDefinitionIdSchema,
              targetKind: z.enum(["task", "project"]),
              label: z.string(),
              type: FieldDefinitionTypeSchema,
              state: z.enum(["active", "retired"]).optional(),
              position: z.int().nonnegative(),
              version: z.int().positive(),
            })
            .strict(),
        )
        .optional(),
      projectTemplates: z
        .array(
          z
            .object({
              id: ProjectTemplateIdSchema,
              name: z.string(),
              description: z.string().optional(),
              taskTitles: z.array(z.string()),
              fieldIds: z.array(FieldDefinitionIdSchema),
              state: z.enum(["active", "retired"]).optional(),
              position: z.int().nonnegative(),
              version: z.int().positive(),
            })
            .strict(),
        )
        .optional(),
      automationRules: z
        .array(
          z
            .object({
              id: AutomationRuleIdSchema,
              name: z.string(),
              recipe: z.discriminatedUnion("kind", [
                z
                  .object({
                    kind: z.literal("complete_sets_status"),
                    statusId: TaskStatusIdSchema,
                  })
                  .strict(),
                z
                  .object({ kind: z.literal("waiting_review_signals") })
                  .strict(),
              ]),
              state: z.enum(["active", "disabled"]).optional(),
              position: z.int().nonnegative(),
              version: z.int().positive(),
            })
            .strict(),
        )
        .optional(),
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
            plannedBy: TaskPlanAuthorshipSchema.optional(),
            dueAt: z.iso.datetime({ offset: true }).optional(),
            priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
            parentTaskId: TaskIdSchema.optional(),
            // It rides task.list rather than being read from cockpit.week
            // because the cockpit is week-scoped and capped, so a block
            // reserved outside the current week would be invisible to a
            // surface trying to show or release it.
            calendarBlock: TaskCalendarBlockProjectionSchema.optional(),
            fields: z
              .record(
                z.string(),
                z.discriminatedUnion("kind", [
                  z
                    .object({ kind: z.literal("text"), value: z.string() })
                    .strict(),
                  z
                    .object({ kind: z.literal("number"), value: z.number() })
                    .strict(),
                  z
                    .object({
                      kind: z.literal("date"),
                      value: z.iso.datetime({ offset: true }),
                    })
                    .strict(),
                  z
                    .object({ kind: z.literal("choice"), value: z.string() })
                    .strict(),
                ]),
              )
              .optional(),
            status: z
              .object({
                id: TaskStatusIdSchema,
                label: z.string(),
                operationalSemantics: z.enum([
                  "actionable",
                  "waiting",
                  "blocked",
                  "paused",
                ]),
                state: z.enum(["active", "archived"]).optional(),
              })
              .strict(),
            completionState: z.enum(["open", "completed"]),
            completedAt: z.iso.datetime({ offset: true }).optional(),
            sourceCaptureId: CaptureIdSchema.optional(),
            attachments: z.array(ManagedAttachmentProjectionSchema),
            createdAt: z.iso.datetime({ offset: true }),
            updatedAt: z.iso.datetime({ offset: true }),
            version: z.int().positive(),
            assignment: TaskAssignmentProjectionSchema.optional(),
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
      // Extended here rather than in the shared shape: `referencedBy` is the
      // one field on a Source that costs a scan of the whole Space, and
      // `project.operationalOverview` — the other reader of that shape —
      // already knows the Project it is answering for. Widening the base
      // schema would make it pay for an answer it does not need.
      sources: z.array(
        KnowledgeSourceProjectionSchema.extend({
          referencedBy: z
            .array(SourceReferenceSchema)
            .max(DEPENDENT_SAMPLE_LIMIT),
          referencedByCount: z.int().nonnegative(),
        }).strict(),
      ),
      /**
       * The folder tree of this Space, flat, parents named by id. Every folder
       * is here whatever its depth (#30 nests without a limit), and the reader
       * builds the tree from `parentFolderId` — an absent one is a root.
       *
       * `noteCount` counts the folder's own notes AND every descendant's;
       * `ownNoteCount` counts only its own. Both are projected on purpose: the
       * property this wave must prove is
       * `noteCount(p) === ownNoteCount(p) + Σ noteCount(child)`, and with only
       * the total here an assertion would have to re-derive the left side from
       * `documents[].folderId` — testing its own arithmetic instead of the
       * read the screen renders, which is the defect the prototype's B35 has.
       */
      folders: z.array(
        z
          .object({
            id: FolderIdSchema,
            name: z.string(),
            parentFolderId: FolderIdSchema.optional(),
            noteCount: z.int().nonnegative(),
            ownNoteCount: z.int().nonnegative(),
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
            /**
             * Absent means Unfiled. The Notes screen groups on this.
             *
             * A PRESENT id may match no entry in `folders`, and a reader must
             * treat that as Unfiled rather than as a lookup that succeeds. It
             * is reachable by design: a note is soft-removed keeping its
             * folder, the folder — genuinely empty by then — is removed, and
             * the note removal is undone. Refusing that undo would mean a note
             * cannot be recovered because a folder is gone, which is a worse
             * failure than the one it prevents.
             */
            folderId: FolderIdSchema.optional(),
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
          folderId: FolderIdSchema.optional(),
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
            attachment: z
              .object({
                captureId: CaptureIdSchema,
                original: CaptureOriginalSchema,
                availability: z.enum(["available", "unavailable"]),
              })
              .strict()
              .optional(),
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
      target: CommentTargetSchema,
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
            attachments: z.array(ManagedAttachmentProjectionSchema),
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
              "waiting_review_elapsed",
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
            // Every comment target is also a destination a mention can send
            // someone to, plus two the comment path never produces. Spreading
            // the target's arms rather than copying them is what keeps this
            // union from silently trailing the one comments are written
            // against: a mention on a target this list had not been taught
            // would fail the strict parse on the way OUT, which reads as a
            // broken inbox rather than as a rule anybody chose.
            destination: z.discriminatedUnion("kind", [
              ...CommentTargetSchema.options,
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
            needsReview: NeedsReviewSchema,
            // Looser than the command's bound, exactly as on the strategic
            // arms: a projection that re-applied the write constraint would
            // make an already-stored value unreadable the day it is tightened.
            externalId: z.string().optional(),
            lifecycle: z.enum(["active", "closed"]),
            // Termin dostawy, opcjonalny. Nigdy nullowalny: `null` w polu
            // ISO ze `.strict()` wywala CAŁY odczyt, a nie jedną wartość.
            dueAt: z.iso.datetime({ offset: true }).optional(),
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
            folderId: FolderIdSchema.optional(),
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
      kind: z.literal("document.linkCandidates"),
      items: z.array(
        z
          .object({
            targetKind: DocumentEntityTargetKindSchema,
            targetId: z.uuid(),
            label: z.string(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("document.backlinks"),
      target: z
        .object({
          targetKind: DocumentEntityTargetKindSchema,
          targetId: z.uuid(),
          label: z.string(),
        })
        .strict(),
      items: z.array(
        z
          .object({
            documentId: DocumentIdSchema,
            spaceId: SpaceIdSchema,
            title: z.string(),
            folderId: FolderIdSchema.optional(),
            role: z.enum(["note", "document", "deliverable"]),
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
          needsReview: NeedsReviewSchema,
          lifecycle: z.enum(["active", "closed"]),
          appliedTemplateId: ProjectTemplateIdSchema.optional(),
          dueAt: z.iso.datetime({ offset: true }).optional(),
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
      relatedMeetings: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            startedAt: z.iso.datetime({ offset: true }),
            triage: z.enum(["ready", "partial", "conflicted", "needs_review"]),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      relatedDocuments: z.array(
        z
          .object({
            id: DocumentIdSchema,
            title: z.string(),
            role: z.enum(["note", "document", "deliverable"]),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      relatedDecisions: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            state: z.enum(["current", "superseded"]),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      clientOrganizations: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            name: z.string(),
            relationshipState: z.enum(["prospect", "active", "inactive"]),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      // The Sources this Project rests on. `project.create` has accepted
      // `evidenceSourceIds` since 0.1.5 and nothing projected them, so the
      // question the field was added to answer — "which Projects rest on the
      // note whose currency I doubt?" — could not be asked from either end.
      evidenceSources: z.array(KnowledgeSourceProjectionSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("organization.operationalOverview"),
      organization: z
        .object({
          id: StrategicRecordIdSchema,
          spaceId: SpaceIdSchema,
          name: z.string(),
          relationshipState: z.enum(["prospect", "active", "inactive"]),
          nextAction: z.string().optional(),
          segment: z.string().optional(),
          // See the guarded arm above: bounded on the way in, loose on the way
          // out.
          since: z.string().optional(),
          // Resolved, not a bare id, on exactly the terms `owner` is resolved
          // on the opportunities below: absent means no contact was named, or
          // the one that was no longer resolves in this Space — never a dead
          // id handed to a screen.
          mainContact: z
            .object({ id: StrategicRecordIdSchema, name: z.string() })
            .strict()
            .optional(),
          version: z.int().positive(),
          updatedAt: z.iso.datetime({ offset: true }),
        })
        .strict(),
      people: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            name: z.string(),
            role: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      opportunities: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            need: z.string(),
            estimate: MoneySchema.optional(),
            stage: z.string(),
            // The second projection home restates the opportunity by hand, so
            // this key reaches it only because it was put here deliberately —
            // nothing forces it. "Sat in discovery for 61 days" is an
            // Organizations sentence, and Organizations reads this query.
            stageEnteredAt: z.iso.datetime({ offset: true }).optional(),
            nextAction: z.string(),
            // Whose deal this is, as against who is merely named on it. The id
            // has been writable since 0.1.5 but appeared in no projection a
            // client is read through, so "show me this person's pipeline" had
            // no reader. Absent means the distinction was never recorded, or
            // the owner no longer resolves in this Space — never a dead id.
            owner: z
              .object({ id: StrategicRecordIdSchema, name: z.string() })
              .strict()
              .optional(),
            state: z.enum(["open", "pursued", "deferred", "rejected", "lost"]),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      offers: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            opportunityId: StrategicRecordIdSchema,
            deliverableDocumentId: DocumentIdSchema,
            ownerPrincipalId: PrincipalIdSchema,
            cost: MoneySchema.optional(),
            rate: ExchangeRateSchema.optional(),
            price: OfferPriceSchema.optional(),
            state: z.enum([
              "draft",
              "ready",
              "submitted",
              "accepted",
              "declined",
            ]),
            nextAction: z.string(),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      renewals: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            scope: z.string(),
            expiresAt: z.iso.datetime({ offset: true }),
            leadTimeDays: z.int().nonnegative(),
            // Hand-picked into a fresh literal by the handler, so every key
            // here reaches a reader only because it was put there on purpose.
            followUpTaskId: TaskIdSchema.optional(),
            termStartsAt: z.iso.datetime({ offset: true }).optional(),
            termMonths: z.int().nonnegative().optional(),
            cycleOrdinal: z.int().positive().optional(),
            // The compile guard covers the OTHER projection home only. This
            // key reaches a reader because it was hand-picked into the mapper
            // and asserted by a hand-written test — nothing forces it. "This
            // contract is worth 45 000 a term" is an Organizations sentence,
            // and Organizations reads this query.
            value: MoneySchema.optional(),
            state: z.enum([
              "watching",
              "renewed",
              "not_renewing",
              "irrelevant",
            ]),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      facts: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            factType: z.string(),
            value: z.string(),
            verifiedAt: z.iso.datetime({ offset: true }),
            staleAfter: z.iso.datetime({ offset: true }),
            state: z.enum(["current", "stale", "conflicted"]),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      // The decisions taken about this client, beside the facts verified about
      // it — the pair the accepted organisation record renders together.
      //
      // Nothing forces this key: `UnprojectableKeys` guards the wide strategic
      // projection and does not reach a query that restates its shapes by hand,
      // so this array and the mapper line that fills it are the whole reason a
      // decision reaches the client screen. Deleting either leaves an empty
      // section and a green build.
      //
      // SUPERSEDED DECISIONS ARE INCLUDED, unlike `rejected`/`lost`
      // opportunities above: the record shows them struck through, and a
      // decision that was replaced is the part of the history a person asks
      // about. `state` is what the screen dims by.
      decisions: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            rationale: z.string(),
            state: z.enum(["current", "superseded"]),
            supersededById: StrategicRecordIdSchema.optional(),
            supersededAt: z.iso.datetime({ offset: true }).optional(),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      activeProjects: z.array(
        z
          .object({
            id: ProjectIdSchema,
            title: z.string(),
            intendedOutcome: z.string(),
            needsReview: NeedsReviewSchema,
            dueAt: z.iso.datetime({ offset: true }).optional(),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      openTasks: z.array(
        z
          .object({
            id: TaskIdSchema,
            title: z.string(),
            projectIds: z.array(ProjectIdSchema),
            operationalState: z.enum(["actionable", "waiting", "blocked"]),
            dueAt: z.iso.datetime({ offset: true }).optional(),
            priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      meetings: z.array(
        z
          .object({
            id: StrategicRecordIdSchema,
            title: z.string(),
            startedAt: z.iso.datetime({ offset: true }),
            triage: z.enum(["ready", "partial", "conflicted", "needs_review"]),
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
            version: z.int().positive(),
            updatedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      recentActivity: z.array(
        z
          .object({
            eventId: z.uuid(),
            eventType: z.string(),
            recordId: z.uuid(),
            occurredAt: z.iso.datetime({ offset: true }),
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
            recordKind: GlobalSearchRecordKindSchema,
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
                "body",
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
      // Pojemność dnia liczy się z tego, a nie z ośmiu godzin wpisanych w
      // ekran. Jedzie razem z tygodniem, bo ekran dnia i tak czyta ten wynik —
      // druga runda po ustawienia workspace'u byłaby pretekstem do trzeciej
      // kopii domyślnej wartości.
      workingDay: WorkingDayProjectionSchema,
      focus: z.array(
        z
          .object({
            taskId: TaskIdSchema,
            title: z.string(),
            score: z.int().nonnegative(),
            startAt: z.iso.datetime({ offset: true }).optional(),
            plannedBy: TaskPlanAuthorshipSchema.optional(),
            dueAt: z.iso.datetime({ offset: true }).optional(),
            priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
            // Time reserved to do the work, distinct from the deadline above,
            // so a day view can show both without a second query.
            calendarBlock: z
              .object({
                ownedBlockExternalId: z.string(),
                calendarExternalId: z.string(),
                revision: z.string(),
                startsAt: z.iso.datetime({ offset: true }),
                endsAt: z.iso.datetime({ offset: true }),
              })
              .strict()
              .optional(),
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
      kind: z.literal("activity.changeFeed"),
      // Ids, types, versions and timing only: a feed says *that* something
      // changed and where to look, never the record content, so a subscriber
      // cannot receive more than a later authorized read would give it.
      events: z.array(
        z
          .object({
            eventId: z.uuid(),
            type: z.string(),
            recordId: z.uuid(),
            recordVersion: z.int().positive(),
            commandId: CommandIdSchema,
            occurredAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      ),
      // The id to pass as `afterEventId` next time. Absent when the feed is
      // empty, so a caller never invents one.
      nextCursor: z.uuid().optional(),
      hasMore: z.boolean(),
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
              "project_details_changed",
              "task_created",
              "task_details_updated",
              "task_parent_changed",
              "task_status_definition_created",
              "task_status_definition_changed",
              "field_definition_created",
              "field_definition_changed",
              "record_field_value_set",
              "template_definition_created",
              "template_definition_changed",
              "project_template_applied",
              "automation_rule_created",
              "automation_rule_changed",
              "automation_swept",
              "workspace_default_status_changed",
              "workspace_commercial_defaults_changed",
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
      compensationKind: CompensationKindSchema.optional(),
      affectedRecordIds: z.array(z.uuid()),
      requiredVersions: z.record(z.uuid(), z.int().positive()),
      unavailableReason: UndoUnavailableReasonSchema.optional(),
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
