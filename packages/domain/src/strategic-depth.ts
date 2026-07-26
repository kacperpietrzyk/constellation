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

import { strategicRecordReferences } from "@constellation/contracts";

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
    readonly externalId?: string;
  },
): Extract<StrategicRecord, { kind: "organization" }> => ({
  ...base(input),
  kind: "organization",
  name: input.name,
  relationshipState: input.relationshipState,
  ...(input.nextAction === undefined ? {} : { nextAction: input.nextAction }),
  ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
});

export const createPerson = (
  input: Common & {
    readonly name: string;
    readonly organizationId?: StrategicRecordId;
    readonly role?: string;
    readonly email?: string;
    readonly externalId?: string;
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
  ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
});

/**
 * A correction, not a replacement: an absent field is left alone and an
 * explicit null clears an optional one, so an agent fixing a surname does not
 * silently drop the role and the organization it never mentioned.
 */
export const updatePersonDetails = (
  person: Extract<StrategicRecord, { kind: "person" }>,
  changes: {
    readonly name?: string;
    readonly organizationId?: StrategicRecordId | null;
    readonly role?: string | null;
    readonly email?: string | null;
    // `| null` here but NOT on the command: no caller may clear provenance —
    // the kernel refuses a change and there is no way to ask for a clear — but
    // undoing the update that stamped a key has to put the record back the way
    // it was, and "the way it was" is unstamped. A compensation is not a
    // command, so the helper can express what the contract will not.
    readonly externalId?: string | null;
  },
  occurredAt: string,
): Extract<StrategicRecord, { kind: "person" }> => {
  const {
    organizationId: _organizationId,
    role: _role,
    email: _email,
    externalId: _externalId,
    ...base
  } = person;
  void _organizationId;
  void _role;
  void _email;
  void _externalId;
  const organizationId =
    changes.organizationId === undefined
      ? person.organizationId
      : (changes.organizationId ?? undefined);
  const role =
    changes.role === undefined ? person.role : (changes.role ?? undefined);
  const email =
    changes.email === undefined ? person.email : (changes.email ?? undefined);
  // Absent leaves it alone, an explicit null clears it. Only the compensation
  // path ever passes null; the command schema cannot express it.
  const externalId =
    changes.externalId === undefined
      ? person.externalId
      : (changes.externalId ?? undefined);
  return {
    ...base,
    name: changes.name ?? person.name,
    ...(organizationId === undefined ? {} : { organizationId }),
    ...(role === undefined ? {} : { role }),
    ...(email === undefined ? {} : { email }),
    ...(externalId === undefined ? {} : { externalId }),
    version: person.version + 1,
    updatedAt: occurredAt,
  };
};

export const updateOrganizationDetails = (
  organization: Extract<StrategicRecord, { kind: "organization" }>,
  changes: {
    readonly name?: string;
    readonly relationshipState?: "prospect" | "active" | "inactive";
    readonly nextAction?: string | null;
    /** See `updatePersonDetails` — clearable only by a compensation. */
    readonly externalId?: string | null;
  },
  occurredAt: string,
): Extract<StrategicRecord, { kind: "organization" }> => {
  const {
    nextAction: _nextAction,
    externalId: _externalId,
    ...base
  } = organization;
  void _nextAction;
  void _externalId;
  const externalId =
    changes.externalId === undefined
      ? organization.externalId
      : (changes.externalId ?? undefined);
  const nextAction =
    changes.nextAction === undefined
      ? organization.nextAction
      : (changes.nextAction ?? undefined);
  return {
    ...base,
    name: changes.name ?? organization.name,
    relationshipState:
      changes.relationshipState ?? organization.relationshipState,
    ...(nextAction === undefined ? {} : { nextAction }),
    ...(externalId === undefined ? {} : { externalId }),
    version: organization.version + 1,
    updatedAt: occurredAt,
  };
};

export const createOpportunity = (
  input: Common & {
    readonly title: string;
    readonly organizationId: StrategicRecordId;
    readonly personIds: readonly StrategicRecordId[];
    readonly ownerPersonId?: StrategicRecordId;
    readonly need: string;
    readonly qualification: string;
    readonly stage: string;
    readonly nextAction: string;
    readonly evidenceSourceIds: readonly KnowledgeSourceId[];
    readonly externalId?: string;
  },
): Extract<StrategicRecord, { kind: "opportunity" }> => ({
  ...base(input),
  kind: "opportunity",
  title: input.title,
  organizationId: input.organizationId,
  personIds: [...new Set(input.personIds)].sort(),
  ...(input.ownerPersonId === undefined
    ? {}
    : { ownerPersonId: input.ownerPersonId }),
  need: input.need,
  qualification: input.qualification,
  stage: input.stage,
  nextAction: input.nextAction,
  evidenceSourceIds: [...new Set(input.evidenceSourceIds)].sort(),
  ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
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
  input: Common & { readonly title: string; readonly responsibility?: string },
): Extract<StrategicRecord, { kind: "area" }> => ({
  ...base(input),
  kind: "area",
  title: input.title,
  ...(input.responsibility === undefined
    ? {}
    : { responsibility: input.responsibility }),
  state: "active",
});

export const updateAreaResponsibility = (
  record: Extract<StrategicRecord, { kind: "area" }>,
  responsibility: string | undefined,
  occurredAt: string,
): Extract<StrategicRecord, { kind: "area" }> => {
  const { responsibility: _prior, ...rest } = record;
  void _prior;
  return {
    ...rest,
    ...(responsibility === undefined ? {} : { responsibility }),
    version: record.version + 1,
    updatedAt: occurredAt,
  };
};

export const createInitiative = (
  input: Common & { readonly title: string; readonly intendedOutcome?: string },
): Extract<StrategicRecord, { kind: "initiative" }> => ({
  ...base(input),
  kind: "initiative",
  title: input.title,
  ...(input.intendedOutcome === undefined
    ? {}
    : { intendedOutcome: input.intendedOutcome }),
  state: "active",
});

export const updateInitiativeOutcome = (
  record: Extract<StrategicRecord, { kind: "initiative" }>,
  intendedOutcome: string | undefined,
  occurredAt: string,
): Extract<StrategicRecord, { kind: "initiative" }> => {
  const { intendedOutcome: _prior, ...rest } = record;
  void _prior;
  return {
    ...rest,
    ...(intendedOutcome === undefined ? {} : { intendedOutcome }),
    version: record.version + 1,
    updatedAt: occurredAt,
  };
};

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
    readonly layout?: Extract<
      StrategicRecord,
      { kind: "saved_view" }
    >["layout"];
  },
): Extract<StrategicRecord, { kind: "saved_view" }> => ({
  ...base(input),
  kind: "saved_view",
  name: input.name,
  filters: input.filters,
  sort: input.sort,
  ...(input.groupBy === undefined ? {} : { groupBy: input.groupBy }),
  ...(input.layout === undefined ? {} : { layout: input.layout }),
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
  readonly layout?: Exclude<
    Extract<StrategicRecord, { kind: "saved_view" }>["layout"],
    undefined
  > | null;
  readonly state?: "active" | "deleted";
}

export const updateSavedView = (
  record: Extract<StrategicRecord, { kind: "saved_view" }>,
  update: SavedViewUpdate,
  occurredAt: string,
): Extract<StrategicRecord, { kind: "saved_view" }> => {
  const { groupBy: priorGroupBy, layout: priorLayout, ...rest } = record;
  const groupBy =
    update.groupBy === undefined
      ? priorGroupBy
      : update.groupBy === null
        ? undefined
        : update.groupBy;
  const layout =
    update.layout === undefined
      ? priorLayout
      : update.layout === null
        ? undefined
        : update.layout;
  return {
    ...rest,
    name: update.name ?? record.name,
    filters: update.filters ?? record.filters,
    sort: update.sort ?? record.sort,
    ...(groupBy === undefined ? {} : { groupBy }),
    ...(layout === undefined ? {} : { layout }),
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

/**
 * The one recordState transition. The explicit remove commands, the undo of a
 * create, and the undo of a remove all go through here, so a record can never
 * be taken out of the graph by one path and put back by a different rule.
 */
export const setStrategicRecordState = (
  record: StrategicRecord,
  recordState: "active" | "removed",
  occurredAt: string,
): StrategicRecord => ({
  ...record,
  recordState,
  version: record.version + 1,
  updatedAt: occurredAt,
});

export const strategicRecordState = (
  record: StrategicRecord,
): "active" | "removed" => record.recordState ?? "active";

/**
 * The same reading for the records that keep their own table — Project,
 * NativeDocument, KnowledgeSource. Absent means active, so nothing written
 * before removal existed has to be migrated.
 */
export const recordIsActive = (record: {
  readonly recordState?: "active" | "removed";
}): boolean => (record.recordState ?? "active") === "active";

/**
 * Deletion is written on two different axes, and a read that honours one
 * without the other hands back a dead record as a live one.
 *
 * `recordState` is the axis every strategic record shares, and the axis the
 * store's list primitives filter. Two kinds predate it and carry their own:
 * a work link is removed onto `state: "removed"` and a Saved View onto
 * `state: "deleted"`, because each is restorable on that axis rather than
 * through the shared one. Everything else's `state` is a domain lifecycle —
 * `archived`, `closed`, `lost`, `superseded` — and a record in one of those is
 * emphatically still there.
 *
 * So the test is the *value*, not the kind: no other arm of the union names a
 * state `removed` or `deleted`, and a kind that later does means the same
 * thing by it. `strategic-depth` asserts that correspondence, so a new kind
 * cannot quietly acquire a deletion value this reading does not know about.
 */
const DELETED_STRATEGIC_STATES: ReadonlySet<string> = new Set([
  "removed",
  "deleted",
]);

export const strategicRecordIsDeleted = (record: StrategicRecord): boolean =>
  strategicRecordState(record) === "removed" ||
  ("state" in record &&
    typeof record.state === "string" &&
    DELETED_STRATEGIC_STATES.has(record.state));

export { strategicRecordReferences };
