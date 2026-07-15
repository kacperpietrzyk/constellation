import {
  DocumentIdSchema,
  DocumentRevisionIdSchema,
  KnowledgeSourceIdSchema,
  NamedDocumentVersionIdSchema,
  QueryIdSchema,
  SpaceIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
  type QueryProjection,
} from "@constellation/contracts";
import type { RendererQueryResponse } from "@constellation/desktop-preload/client";

import { DocumentsSurface } from "../DocumentsSurface.js";
import { createScenarioClient } from "../client/scenario-client.js";
import type { DesktopSnapshot } from "../client/workflow.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);
const spaceId = SpaceIdSchema.parse("00000000-0000-4000-8000-000000000002");
const sourceId = KnowledgeSourceIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);
const noteId = DocumentIdSchema.parse("00000000-0000-4000-8000-000000000004");
const deliverableId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-000000000005",
);
const namedVersionId = NamedDocumentVersionIdSchema.parse(
  "00000000-0000-4000-8000-000000000006",
);
const documentRevisionId = DocumentRevisionIdSchema.parse(
  "00000000-0000-4000-8000-000000000007",
);
const taskStatusId = TaskStatusIdSchema.parse(
  "00000000-0000-4000-8000-000000000008",
);
const queryId = QueryIdSchema.parse("00000000-0000-4000-8000-000000000099");
const timestamp = "2026-07-15T10:00:00.000Z";

const response = (projection: QueryProjection): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId,
      kernelTime: timestamp,
      outcome: "success",
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
      projection,
    },
  }) as unknown as RendererQueryResponse;

const contextProjection = {
  kind: "knowledge.documentContext",
  document: {
    id: deliverableId,
    spaceId,
    title: "Raport gotowości operacyjnej",
    role: "deliverable",
    version: 3,
    updatedAt: timestamp,
  },
  evidence: [
    {
      kind: "source",
      recordId: sourceId,
      title: "Wytyczne audytowe",
      currentVersion: 2,
    },
    {
      kind: "note",
      recordId: noteId,
      title: "Synteza ustaleń",
      currentVersion: 1,
    },
  ],
  namedVersions: [
    {
      id: namedVersionId,
      documentRevisionId,
      name: "Dostarczona · 15 lipca",
      milestone: "delivered",
      contentSnapshot: "Gotowość operacyjna została potwierdzona dowodami.",
      evidence: [
        {
          kind: "source",
          recordId: sourceId,
          title: "Wytyczne audytowe",
          frozenVersion: 1,
          currentVersion: 2,
          changed: true,
        },
        {
          kind: "note",
          recordId: noteId,
          title: "Synteza ustaleń",
          frozenVersion: 1,
          currentVersion: 1,
          changed: false,
        },
      ],
      state: "active",
      version: 1,
      createdAt: timestamp,
    },
  ],
} satisfies Extract<QueryProjection, { kind: "knowledge.documentContext" }>;

const client = createScenarioClient({
  queries: {
    "knowledge.documentContext": response(contextProjection),
  },
});

const snapshot: DesktopSnapshot = {
  build: {
    channel: "developer-preview",
    startupRecovery: "none",
    workspaceAvailability: "ready",
    initialWorkspaceId: workspaceId,
    persistence: "in-memory",
    version: "knowledge-scenario",
  },
  bootstrap: {
    kind: "workspace.bootstrapContext",
    workspace: {
      id: workspaceId,
      name: "Praca",
      timezone: "Europe/Warsaw",
      defaultTaskStatusId: taskStatusId,
      version: 1,
    },
    spaces: [{ id: spaceId, name: "Praca", version: 1 }],
    taskStatuses: [],
  },
  captures: [],
  tasks: [],
  projects: { kind: "unavailable", message: "Scenario" },
  work: { kind: "unavailable", message: "Scenario" },
  relationships: { kind: "unavailable", message: "Scenario" },
  radar: { kind: "unavailable", message: "Scenario" },
  cockpit: { kind: "unavailable", message: "Scenario" },
  activity: { kind: "unavailable", message: "Scenario" },
  access: { kind: "unavailable", message: "Scenario" },
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
          id: deliverableId,
          spaceId,
          title: "Raport gotowości operacyjnej",
          role: "deliverable",
          version: 3,
          updatedAt: timestamp,
        },
        {
          id: noteId,
          spaceId,
          title: "Synteza ustaleń",
          role: "note",
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
          id: sourceId,
          sourceKind: "url",
          title: "Wytyczne audytowe",
          canonicalUrl: "https://example.test/audit",
          availability: "available",
          observedAt: timestamp,
          version: 2,
          updatedAt: timestamp,
        },
      ],
      documents: [
        {
          id: deliverableId,
          title: "Raport gotowości operacyjnej",
          role: "deliverable",
          evidenceCount: 2,
          namedVersionCount: 1,
          staleEvidence: true,
          version: 3,
          updatedAt: timestamp,
        },
        {
          id: noteId,
          title: "Synteza ustaleń",
          role: "note",
          evidenceCount: 1,
          namedVersionCount: 0,
          staleEvidence: false,
          version: 1,
          updatedAt: timestamp,
        },
      ],
    },
  },
};

export const KnowledgeHarness = () => (
  <DocumentsSurface
    client={client}
    snapshot={snapshot}
    onReload={async () => undefined}
    onFailure={() => undefined}
  />
);
