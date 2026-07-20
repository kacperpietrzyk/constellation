import type {
  KnowledgeSourceId,
  PrincipalId,
  ProjectId,
  SpaceId,
  StrategicRecordId,
  WorkspaceId,
  DocumentId,
  TaskId,
} from "@constellation/contracts";

import type { StrategicRecord } from "./model.js";

type Common = {
  readonly id: StrategicRecordId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
};

const base = (input: Common) => ({
  id: input.id,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  createdBy: input.createdBy,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const createOrganization = (
  input: Common & {
    readonly name: string;
    readonly relationshipState: "prospect" | "active" | "inactive";
    readonly nextAction?: string;
  },
): Extract<StrategicRecord, { kind: "organization" }> => ({
  ...base(input),
  kind: "organization",
  name: input.name,
  relationshipState: input.relationshipState,
  ...(input.nextAction === undefined ? {} : { nextAction: input.nextAction }),
});

export const createPerson = (
  input: Common & {
    readonly name: string;
    readonly organizationId?: StrategicRecordId;
    readonly role?: string;
    readonly email?: string;
  },
): Extract<StrategicRecord, { kind: "person" }> => ({
  ...base(input),
  kind: "person",
  name: input.name,
  ...(input.organizationId === undefined
    ? {}
    : { organizationId: input.organizationId }),
  ...(input.role === undefined ? {} : { role: input.role }),
  ...(input.email === undefined ? {} : { email: input.email }),
});

export const createOpportunity = (
  input: Common & {
    readonly title: string;
    readonly organizationId: StrategicRecordId;
    readonly personIds: readonly StrategicRecordId[];
    readonly need: string;
    readonly qualification: string;
    readonly stage: string;
    readonly nextAction: string;
    readonly evidenceSourceIds: readonly KnowledgeSourceId[];
  },
): Extract<StrategicRecord, { kind: "opportunity" }> => ({
  ...base(input),
  kind: "opportunity",
  title: input.title,
  organizationId: input.organizationId,
  personIds: [...new Set(input.personIds)].sort(),
  need: input.need,
  qualification: input.qualification,
  stage: input.stage,
  nextAction: input.nextAction,
  evidenceSourceIds: [...new Set(input.evidenceSourceIds)].sort(),
  offerIds: [],
  projectIds: [],
  state: "open",
});

export const createOffer = (
  input: Common & {
    readonly title: string;
    readonly opportunityId: StrategicRecordId;
    readonly deliverableDocumentId: DocumentId;
    readonly ownerPrincipalId: PrincipalId;
    readonly state: "draft" | "ready" | "submitted" | "accepted" | "declined";
    readonly nextAction: string;
  },
): Extract<StrategicRecord, { kind: "offer" }> => ({
  ...base(input),
  kind: "offer",
  title: input.title,
  opportunityId: input.opportunityId,
  deliverableDocumentId: input.deliverableDocumentId,
  ownerPrincipalId: input.ownerPrincipalId,
  state: input.state,
  nextAction: input.nextAction,
});

export const linkOpportunityOutcomes = (
  opportunity: Extract<StrategicRecord, { kind: "opportunity" }>,
  input: {
    readonly offerIds: readonly StrategicRecordId[];
    readonly projectIds: readonly ProjectId[];
    readonly state: Extract<StrategicRecord, { kind: "opportunity" }>["state"];
    readonly nextAction: string;
    readonly occurredAt: string;
  },
): Extract<StrategicRecord, { kind: "opportunity" }> => ({
  ...opportunity,
  offerIds: [...new Set(input.offerIds)].sort(),
  projectIds: [...new Set(input.projectIds)].sort(),
  state: input.state,
  nextAction: input.nextAction,
  version: opportunity.version + 1,
  updatedAt: input.occurredAt,
});

export const createRenewal = (
  input: Common & {
    readonly organizationId: StrategicRecordId;
    readonly title: string;
    readonly scope: string;
    readonly expiresAt: string;
    readonly leadTimeDays: number;
    readonly ownerPrincipalId: PrincipalId;
    readonly evidenceSourceIds: readonly KnowledgeSourceId[];
    readonly followUpTaskId: TaskId;
    readonly cycleKey: string;
  },
): Extract<StrategicRecord, { kind: "renewal" }> => ({
  ...base(input),
  kind: "renewal",
  organizationId: input.organizationId,
  title: input.title,
  scope: input.scope,
  expiresAt: input.expiresAt,
  leadTimeDays: input.leadTimeDays,
  ownerPrincipalId: input.ownerPrincipalId,
  evidenceSourceIds: [...new Set(input.evidenceSourceIds)].sort(),
  followUpTaskId: input.followUpTaskId,
  cycleKey: input.cycleKey,
  state: "watching",
});

export const createRelationshipFact = (
  input: Common & {
    readonly organizationId: StrategicRecordId;
    readonly factType: string;
    readonly value: string;
    readonly evidenceSourceIds: readonly KnowledgeSourceId[];
    readonly verifiedAt: string;
    readonly staleAfter: string;
  },
): Extract<StrategicRecord, { kind: "relationship_fact" }> => ({
  ...base(input),
  kind: "relationship_fact",
  organizationId: input.organizationId,
  factType: input.factType,
  value: input.value,
  evidenceSourceIds: [...new Set(input.evidenceSourceIds)].sort(),
  verifiedAt: input.verifiedAt,
  staleAfter: input.staleAfter,
  state:
    Date.parse(input.staleAfter) <= Date.parse(input.occurredAt)
      ? "stale"
      : "current",
});

export const createDecision = (
  input: Common & {
    readonly title: string;
    readonly rationale: string;
    readonly evidenceSourceIds: readonly KnowledgeSourceId[];
    readonly linkedRecordIds: readonly string[];
  },
): Extract<StrategicRecord, { kind: "decision" }> => ({
  ...base(input),
  kind: "decision",
  title: input.title,
  rationale: input.rationale,
  evidenceSourceIds: [...new Set(input.evidenceSourceIds)].sort(),
  linkedRecordIds: [...new Set(input.linkedRecordIds)].sort(),
  state: "current",
});

export const createArea = (
  input: Common & { readonly title: string; readonly responsibility: string },
): Extract<StrategicRecord, { kind: "area" }> => ({
  ...base(input),
  kind: "area",
  title: input.title,
  responsibility: input.responsibility,
  state: "active",
});

export const createInitiative = (
  input: Common & { readonly title: string; readonly intendedOutcome: string },
): Extract<StrategicRecord, { kind: "initiative" }> => ({
  ...base(input),
  kind: "initiative",
  title: input.title,
  intendedOutcome: input.intendedOutcome,
  state: "active",
});

export const createWorkLink = (
  input: Common & {
    readonly linkType: Extract<
      StrategicRecord,
      { kind: "work_link" }
    >["linkType"];
    readonly sourceRecordId: string;
    readonly targetRecordId: string;
  },
): Extract<StrategicRecord, { kind: "work_link" }> => ({
  ...base(input),
  kind: "work_link",
  linkType: input.linkType,
  sourceRecordId: input.sourceRecordId,
  targetRecordId: input.targetRecordId,
  state: "active",
});

export const createSavedView = (
  input: Common & {
    readonly name: string;
    readonly filters: Extract<
      StrategicRecord,
      { kind: "saved_view" }
    >["filters"];
    readonly sort: Extract<StrategicRecord, { kind: "saved_view" }>["sort"];
    readonly groupBy?: Extract<
      StrategicRecord,
      { kind: "saved_view" }
    >["groupBy"];
  },
): Extract<StrategicRecord, { kind: "saved_view" }> => ({
  ...base(input),
  kind: "saved_view",
  name: input.name,
  filters: input.filters,
  sort: input.sort,
  ...(input.groupBy === undefined ? {} : { groupBy: input.groupBy }),
  state: "active",
});

export interface SavedViewUpdate {
  readonly name?: string;
  readonly filters?: Extract<
    StrategicRecord,
    { kind: "saved_view" }
  >["filters"];
  readonly sort?: Extract<StrategicRecord, { kind: "saved_view" }>["sort"];
  readonly groupBy?: Exclude<
    Extract<StrategicRecord, { kind: "saved_view" }>["groupBy"],
    undefined
  > | null;
  readonly state?: "active" | "deleted";
}

export const updateSavedView = (
  record: Extract<StrategicRecord, { kind: "saved_view" }>,
  update: SavedViewUpdate,
  occurredAt: string,
): Extract<StrategicRecord, { kind: "saved_view" }> => {
  const { groupBy: priorGroupBy, ...rest } = record;
  const groupBy =
    update.groupBy === undefined
      ? priorGroupBy
      : update.groupBy === null
        ? undefined
        : update.groupBy;
  return {
    ...rest,
    name: update.name ?? record.name,
    filters: update.filters ?? record.filters,
    sort: update.sort ?? record.sort,
    ...(groupBy === undefined ? {} : { groupBy }),
    state: update.state ?? record.state,
    version: record.version + 1,
    updatedAt: occurredAt,
  };
};

export const createRecurrence = (
  input: Common & {
    readonly title: string;
    readonly taskTitle: string;
    readonly contextRecordId?: string;
    readonly cadence: "daily" | "weekly" | "monthly" | "yearly";
    readonly nextDueAt: string;
  },
): Extract<StrategicRecord, { kind: "recurrence" }> => ({
  ...base(input),
  kind: "recurrence",
  title: input.title,
  taskTitle: input.taskTitle,
  ...(input.contextRecordId === undefined
    ? {}
    : { contextRecordId: input.contextRecordId }),
  cadence: input.cadence,
  nextDueAt: input.nextDueAt,
  state: "active",
});

export const createRadarCandidate = (
  input: Common & {
    readonly sourceId: KnowledgeSourceId;
    readonly materialKey: string;
    readonly title: string;
    readonly relevance: string;
  },
): Extract<StrategicRecord, { kind: "radar_candidate" }> => ({
  ...base(input),
  kind: "radar_candidate",
  sourceId: input.sourceId,
  materialKey: input.materialKey,
  title: input.title,
  relevance: input.relevance,
  state: "pending",
});
