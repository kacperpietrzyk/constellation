import {
  PrincipalIdSchema,
  ProjectIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";

import { StrategicDepthSurface } from "../StrategicDepthSurface.js";
import { createScenarioClient } from "../client/scenario-client.js";
import type {
  DesktopSnapshot,
  RadarReviewProjection,
  RelationshipWorkspaceProjection,
} from "../client/workflow.js";

const workspaceId = WorkspaceIdSchema.parse(
  "19000000-0000-4000-8000-000000000001",
);
const spaceId = SpaceIdSchema.parse("19000000-0000-4000-8000-000000000002");
const principalId = PrincipalIdSchema.parse(
  "19000000-0000-4000-8000-000000000003",
);
const statusId = TaskStatusIdSchema.parse(
  "19000000-0000-4000-8000-000000000004",
);
const organizationId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000010",
);
const opportunityId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000011",
);
const offerId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000012",
);
const renewalId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000013",
);
const factId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000014",
);
const reviewId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000015",
);
const recurrenceId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000016",
);
const radarId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000017",
);
const personId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000018",
);
const decisionId = StrategicRecordIdSchema.parse(
  "19000000-0000-4000-8000-000000000019",
);
const projectId = ProjectIdSchema.parse("19000000-0000-4000-8000-000000000020");
const timestamp = "2026-07-15T10:00:00.000Z";
const freshness = {
  mode: "local_authoritative" as const,
  checkpoint: null,
  missingCapabilities: [],
};
const base = {
  workspaceId,
  spaceId,
  createdBy: principalId,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const records: RelationshipWorkspaceProjection["records"] = [
  {
    ...base,
    id: organizationId,
    kind: "organization",
    name: "Northstar Industries",
    relationshipState: "active",
    nextAction: "Potwierdź sponsora warsztatu.",
  },
  {
    ...base,
    id: opportunityId,
    kind: "opportunity",
    title: "Program bezpieczeństwa Northstar",
    organizationId,
    personIds: [],
    need: "Wybrać pierwszy program naprawczy.",
    qualification: "Sponsor i dowody potwierdzone.",
    stage: "qualified",
    nextAction: "Przeprowadź zaakceptowany warsztat.",
    evidenceSourceIds: [],
    offerIds: [offerId],
    projectIds: [projectId],
    state: "pursued",
  },
  {
    ...base,
    id: offerId,
    kind: "offer",
    title: "Oferta warsztatu bezpieczeństwa",
    opportunityId,
    deliverableDocumentId: "19000000-0000-4000-8000-000000000030" as never,
    ownerPrincipalId: principalId,
    state: "accepted",
    nextAction: "Przekaż zespół do realizacji.",
  },
  {
    ...base,
    id: renewalId,
    kind: "renewal",
    organizationId,
    title: "Umowa wsparcia",
    scope: "Managed support",
    expiresAt: "2026-09-30T12:00:00.000Z",
    leadTimeDays: 60,
    ownerPrincipalId: principalId,
    evidenceSourceIds: [],
    followUpTaskId: "19000000-0000-4000-8000-000000000031" as never,
    cycleKey: "northstar-support:2026-09",
    state: "watching",
  },
  {
    ...base,
    id: factId,
    kind: "relationship_fact",
    organizationId,
    factType: "security_stack",
    value: "Legacy gateway",
    evidenceSourceIds: [],
    verifiedAt: "2025-01-01T12:00:00.000Z",
    staleAfter: "2025-07-01T12:00:00.000Z",
    state: "stale",
  },
  {
    ...base,
    id: reviewId,
    kind: "impact_review",
    priorDecisionId: "19000000-0000-4000-8000-000000000040" as never,
    replacementDecisionId: "19000000-0000-4000-8000-000000000041" as never,
    reason: "Nowe warunki zmieniły model dostawy.",
    consequences: [
      { recordId: projectId, recordKind: "commitment", state: "open" },
    ],
    state: "open",
  },
  {
    ...base,
    id: recurrenceId,
    kind: "recurrence",
    title: "Miesięczny przegląd relacji",
    taskTitle: "Przejrzyj relację Northstar",
    cadence: "monthly",
    nextDueAt: "2026-08-01T09:00:00.000Z",
    state: "active",
  },
  {
    ...base,
    id: radarId,
    kind: "radar_candidate",
    sourceId: "19000000-0000-4000-8000-000000000050" as never,
    materialKey: "northstar-terms:v2",
    title: "Warunki umowy zmieniły się",
    relevance: "Może wpłynąć na aktywną decyzję o modelu dostawy.",
    state: "pending",
  },
  {
    ...base,
    id: personId,
    kind: "person",
    name: "Marta Nowak",
    organizationId,
    role: "Sponsor programu",
    email: "marta@example.test",
  },
  {
    ...base,
    id: decisionId,
    kind: "decision",
    title: "Warsztat poprzedza wdrożenie",
    rationale: "Najpierw potwierdzamy zakres na dowodach.",
    evidenceSourceIds: [],
    linkedRecordIds: [projectId],
    state: "current",
  },
];

const relationships: RelationshipWorkspaceProjection = {
  kind: "relationship.workspace",
  records,
  freshness,
};
const radar: RadarReviewProjection = {
  kind: "radar.review",
  finite: true,
  pendingCount: 1,
  items: [records.find((record) => record.kind === "radar_candidate")!],
  freshness,
};
const client = createScenarioClient({ queries: {} });

const snapshot: DesktopSnapshot = {
  build: {
    channel: "developer-preview",
    startupRecovery: "none",
    workspaceAvailability: "ready",
    initialWorkspaceId: workspaceId,
    persistence: "in-memory",
    version: "strategic-scenario",
  },
  bootstrap: {
    kind: "workspace.bootstrapContext",
    workspace: {
      id: workspaceId,
      name: "Praca",
      timezone: "Europe/Warsaw",
      defaultTaskStatusId: statusId,
      version: 1,
    },
    spaces: [{ id: spaceId, name: "Praca", version: 1 }],
    taskStatuses: [],
  },
  captures: [],
  tasks: [],
  projects: { kind: "ready", data: { kind: "project.list", items: [] } },
  work: { kind: "unavailable", message: "Scenario" },
  cockpit: { kind: "unavailable", message: "Scenario" },
  activity: { kind: "unavailable", message: "Scenario" },
  access: {
    kind: "ready",
    data: {
      kind: "workspace.access",
      policyVersion: 1,
      currentPrincipalId: principalId,
      canManage: true,
      members: [],
    },
  },
  agentAccess: { kind: "unavailable", message: "Scenario" },
  assignmentCandidates: { kind: "unavailable", message: "Scenario" },
  mentionCandidates: { kind: "unavailable", message: "Scenario" },
  attention: { kind: "unavailable", message: "Scenario" },
  documents: {
    kind: "ready",
    data: {
      kind: "document.list",
      items: [
        {
          id: "19000000-0000-4000-8000-000000000030" as never,
          spaceId,
          title: "Oferta warsztatu",
          role: "deliverable",
          version: 1,
          updatedAt: timestamp,
        },
      ],
    },
  },
  knowledge: {
    kind: "ready",
    data: {
      kind: "knowledge.list",
      spaceId,
      sources: [
        {
          id: "19000000-0000-4000-8000-000000000050" as never,
          sourceKind: "excerpt",
          title: "Warunki umowy",
          availability: "available",
          observedAt: timestamp,
          version: 1,
          updatedAt: timestamp,
        },
      ],
      documents: [],
    },
  },
  relationships: { kind: "ready", data: relationships },
  radar: { kind: "ready", data: radar },
};

export const StrategicDepthHarness = () => (
  <StrategicDepthSurface
    client={client}
    snapshot={snapshot}
    onReload={async () => undefined}
    onFailure={() => undefined}
  />
);
