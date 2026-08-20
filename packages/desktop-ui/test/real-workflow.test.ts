/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CommandIdSchema,
  DataHomeStatusSchema,
  DeviceIdSchema,
  LOCAL_ONLY_PROVIDER_ID,
  PrincipalIdSchema,
  ProjectIdSchema,
  RelationIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
  type CommandEnvelope,
  type QueryEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createArea,
  createInitiative,
  createProject,
  createSavedWorkView,
  createWorkLink,
  directClientLinks,
  directDeliveryProjects,
  linkOrganizationDelivery,
  linkProjectClient,
  linkableClientOrganizations,
  linkableDeliveryProjects,
  loadDesktopSnapshot,
  loadOrganizationOverview,
  previewUndo,
  relateTask,
  searchGlobal,
  setTaskCompletion,
  setTaskOperationalState,
  setTaskStatus,
  undoCommand,
  unlinkOrganizationDelivery,
  unlinkProjectClient,
  unrelateTask,
  updateAreaResponsibility,
  updateInitiativeOutcome,
  updateProjectOutcome,
  type DesktopSnapshot,
} from "../src/client/workflow.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);
const spaceId = SpaceIdSchema.parse("00000000-0000-4000-8000-000000000002");
const statusId = TaskStatusIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);
const taskId = TaskIdSchema.parse("00000000-0000-4000-8000-000000000004");
const projectId = ProjectIdSchema.parse("00000000-0000-4000-8000-000000000005");
const organizationId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000012",
);
const relationId = RelationIdSchema.parse(
  "00000000-0000-4000-8000-000000000006",
);
const targetCommandId = CommandIdSchema.parse(
  "00000000-0000-4000-8000-000000000007",
);
const areaId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000013",
);
const initiativeId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000014",
);
const otherSpaceId = SpaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000015",
);
const linkId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000016",
);
const detachedOrganizationId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-000000000017",
);

const strategicBase = {
  workspaceId,
  spaceId,
  createdBy: PrincipalIdSchema.parse("00000000-0000-4000-8000-000000000003"),
  createdAt: "2026-07-13T10:00:00.000Z",
  updatedAt: "2026-07-13T10:00:00.000Z",
} as const;

// One `relationship.workspace` answer holding every case the Klient picker has
// to get right: a client already linked, a client whose link was detached, an
// organization in another Space, and two that are genuinely offerable.
const readyRelationships: DesktopSnapshot["relationships"] = {
  kind: "ready",
  data: {
    kind: "relationship.workspace",
    records: [
      {
        ...strategicBase,
        id: organizationId,
        kind: "organization",
        name: "Alfa",
        relationshipState: "active",
        version: 2,
      },
      {
        ...strategicBase,
        id: detachedOrganizationId,
        kind: "organization",
        name: "Dach",
        relationshipState: "prospect",
        version: 1,
      },
      {
        ...strategicBase,
        id: StrategicRecordIdSchema.parse(
          "00000000-0000-4000-8000-000000000018",
        ),
        kind: "organization",
        name: "Ćma",
        relationshipState: "prospect",
        version: 1,
      },
      {
        ...strategicBase,
        spaceId: otherSpaceId,
        id: StrategicRecordIdSchema.parse(
          "00000000-0000-4000-8000-000000000019",
        ),
        kind: "organization",
        name: "Beta",
        relationshipState: "active",
        version: 1,
      },
      {
        ...strategicBase,
        id: linkId,
        kind: "work_link",
        linkType: "project_serves_organization",
        sourceRecordId: projectId,
        targetRecordId: organizationId,
        state: "active",
        version: 4,
      },
      {
        ...strategicBase,
        id: StrategicRecordIdSchema.parse(
          "00000000-0000-4000-8000-00000000001a",
        ),
        kind: "work_link",
        linkType: "project_serves_organization",
        sourceRecordId: projectId,
        targetRecordId: detachedOrganizationId,
        state: "removed",
        removedAt: "2026-07-14T10:00:00.000Z",
        version: 2,
      },
    ],
    freshness: {
      mode: "local_authoritative",
      checkpoint: null,
      missingCapabilities: [],
    },
  },
};

// The mirror fixture, for the picker on the Organization page: a delivery
// already linked at this client, a closed one, one in another Space, and two
// that are genuinely offerable.
const readyProjects: DesktopSnapshot["projects"] = {
  kind: "ready",
  data: {
    kind: "project.list",
    items: [
      {
        id: projectId,
        spaceId,
        title: "Alpha",
        intendedOutcome: "Działa lokalnie",
        needsReview: false,
        attentionState: "current",
        lifecycle: "active",
        relatedOpenTaskCount: 0,
        version: 2,
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
      {
        id: ProjectIdSchema.parse("00000000-0000-4000-8000-00000000001b"),
        spaceId,
        title: "Ćwierćfinał",
        intendedOutcome: "Druga oferowalna realizacja",
        needsReview: false,
        attentionState: "current",
        lifecycle: "active",
        relatedOpenTaskCount: 0,
        version: 1,
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
      {
        id: ProjectIdSchema.parse("00000000-0000-4000-8000-00000000001c"),
        spaceId,
        title: "Domknięcie",
        intendedOutcome: "Pierwsza oferowalna realizacja",
        needsReview: false,
        attentionState: "current",
        lifecycle: "active",
        relatedOpenTaskCount: 0,
        version: 1,
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
      {
        id: ProjectIdSchema.parse("00000000-0000-4000-8000-00000000001d"),
        spaceId,
        title: "Zamknięty",
        intendedOutcome: "Zakończona realizacja",
        needsReview: false,
        attentionState: "current",
        lifecycle: "closed",
        relatedOpenTaskCount: 0,
        version: 3,
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
      {
        id: ProjectIdSchema.parse("00000000-0000-4000-8000-00000000001e"),
        spaceId: otherSpaceId,
        title: "Obca przestrzeń",
        intendedOutcome: "Poza przestrzenią klienta",
        needsReview: false,
        attentionState: "current",
        lifecycle: "active",
        relatedOpenTaskCount: 0,
        version: 1,
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
    ],
  },
};

const successQuery = (query: QueryEnvelope, projection: object) => ({
  kind: "query_result" as const,
  result: {
    contractVersion: 1 as const,
    queryId: query.queryId,
    kernelTime: "2026-07-13T12:00:00.000Z",
    outcome: "success" as const,
    projection,
    freshness: {
      mode: "local_authoritative" as const,
      checkpoint: null,
      missingCapabilities: [],
    },
  },
});

const commandProjection = (command: CommandEnvelope) => {
  switch (command.commandName) {
    case "project.create":
      return {
        kind: "project.created",
        projectId,
        title: command.payload.title,
        intendedOutcome: command.payload.intendedOutcome,
        lifecycle: "active",
        version: 1,
      };
    case "project.updateOutcome":
      return {
        kind: "project.outcome_updated",
        projectId,
        title: "Alpha",
        intendedOutcome: command.payload.intendedOutcome,
        lifecycle: "active",
        version: 3,
      };
    case "area.create":
    case "area.updateResponsibility":
    case "initiative.create":
    case "initiative.updateOutcome":
    case "savedView.create":
    case "work.linkCreate":
    case "work.linkRemove":
      return {
        kind: "strategic.record_changed",
        recordId:
          "areaId" in command.payload
            ? command.payload.areaId
            : "initiativeId" in command.payload
              ? command.payload.initiativeId
              : "savedViewId" in command.payload
                ? command.payload.savedViewId
                : command.payload.linkId,
        recordType:
          command.commandName === "area.create" ||
          command.commandName === "area.updateResponsibility"
            ? "area"
            : command.commandName === "initiative.create" ||
                command.commandName === "initiative.updateOutcome"
              ? "initiative"
              : command.commandName === "savedView.create"
                ? "saved_view"
                : "work_link",
        version: 1,
      };
    case "task.setOperationalState":
      return {
        kind: "task.operational_state_changed",
        taskId,
        operationalState: command.payload.operationalState,
        ...(command.payload.waitingOn === undefined
          ? {}
          : { waitingOn: command.payload.waitingOn }),
        version: 3,
      };
    case "task.setStatus":
      return {
        kind: "task.status_changed",
        taskId,
        statusId,
        completionState: "open",
        version: 3,
      };
    case "task.complete":
      return {
        kind: "task.completed",
        taskId,
        statusId,
        completionState: "completed",
        completedAt: "2026-07-13T12:00:00.000Z",
        version: 3,
      };
    case "record.relate":
      return {
        kind: "relation.created",
        relationId,
        taskId,
        projectId,
        version: 1,
      };
    case "record.unrelate":
      return {
        kind: "relation.removed",
        relationId,
        taskId,
        projectId,
        version: 2,
      };
    case "command.undo":
      return {
        kind: "command.undone",
        targetCommandId,
        compensatedRecordIds: [relationId],
        recordVersions: { [relationId]: 2 },
      };
    default:
      throw new Error(`Unexpected command ${command.commandName}`);
  }
};

const createTypedClient = () => {
  const commands: CommandEnvelope[] = [];
  const queries: QueryEnvelope[] = [];
  const client: ConstellationRendererClient = {
    getReleaseStatus: async () => ({
      kind: "unavailable",
      currentVersion: "0.0.0-m1",
      reason: "developer_preview",
    }),
    checkForRelease: async () => ({
      kind: "unavailable",
      currentVersion: "0.0.0-m1",
      reason: "developer_preview",
    }),
    downloadRelease: async () => ({
      kind: "unavailable",
      currentVersion: "0.0.0-m1",
      reason: "developer_preview",
    }),
    installRelease: async () => ({
      kind: "unavailable",
      currentVersion: "0.0.0-m1",
      reason: "developer_preview",
    }),
    getJamieStatus: async () => ({ configured: false }),
    configureJamie: async () => undefined,
    syncJamie: async () => ({
      applied: 0,
      corrected: 0,
      noChange: 0,
      partial: 0,
      conflicted: 0,
      failed: 0,
    }),
    disconnectJamie: async () => undefined,
    requestCalendarAccess: async () => ({
      platform: "other",
      provider: "unconfigured",
      availability: "provider_unavailable",
      canRead: false,
      canWriteOwnedBlocks: false,
      detailCode: "test_unconfigured",
    }),
    editMeetingWorkItem: async () => false,
    correctMeetingWorkItemResponsibility: async () => false,
    addMeetingWorkItem: async () => false,
    getMeetingLoop: async () => ({
      capability: {
        platform: "other",
        provider: "unconfigured",
        availability: "provider_unavailable",
        canRead: false,
        canWriteOwnedBlocks: false,
        detailCode: "test_unconfigured",
      },
      upcoming: [],
      completed: [],
      freshness: "partial",
      generatedAt: "2026-07-15T10:00:00.000Z",
    }),
    previewCalendarBlocks: async () => undefined,
    confirmCalendarBlocks: async () => ({
      outcome: "rejected",
      code: "provider_unavailable",
    }),
    listRemoteAgentGrants: async () => {
      throw new Error("Remote MCP is unavailable in this local fixture.");
    },
    createRemoteAgentGrant: async () => {
      throw new Error("Remote MCP is unavailable in this local fixture.");
    },
    rotateRemoteAgentGrant: async () => {
      throw new Error("Remote MCP is unavailable in this local fixture.");
    },
    revokeRemoteAgentGrant: async () => {
      throw new Error("Remote MCP is unavailable in this local fixture.");
    },
    acknowledgeDocumentUpdates: async () => undefined,
    acknowledgeCollaborativeContentUpdates: async () => undefined,
    prepareAgentCredential: async () => ({
      credentialId: "00000000-0000-4000-8000-000000000093" as never,
      credentialDigest: "0".repeat(64),
      descriptorPath: "/tmp/constellation-agent.json",
      launchCommand: "/Applications/Constellation",
      launchArgs: ["/Applications/constellation-mcp.mjs"],
      launchEnvironment: {
        ELECTRON_RUN_AS_NODE: "1",
        CONSTELLATION_MCP_CREDENTIAL_FILE: "/tmp/constellation-agent.json",
      },
    }),
    onAttentionActivated: () => () => undefined,
    onWorkspaceChanged: () => () => undefined,
    cancelWorkspaceRestore: async () => undefined,
    copyWorkspaceRecoveryCode: async () => ({ outcome: "success" }),
    confirmWorkspaceRestore: async () => ({
      outcome: "success",
      workspaceId,
    }),
    createDocumentRevision: async () =>
      "00000000-0000-4000-8000-000000000091" as never,
    createCollaborativeContentRevision: async () =>
      "00000000-0000-4000-8000-000000000091" as never,
    enrollHub: async () => ({ outcome: "rejected", code: "hub_unreachable" }),
    exportHubAuthorization: async () => ({ outcome: "cancelled" }),
    exportWorkspaceBackup: async () => ({ outcome: "cancelled" }),
    getBuildInfo: async () => ({
      channel: "local-alpha",
      startupRecovery: "none",
      workspaceAvailability: "ready",
      initialWorkspaceId: workspaceId,
      persistence: "encrypted-local",
      version: "test",
    }),
    getDataHomeStatus: async () =>
      DataHomeStatusSchema.parse({
        descriptor: {
          contractVersion: 1,
          providerId: LOCAL_ONLY_PROVIDER_ID,
          providerInstanceId: `${LOCAL_ONLY_PROVIDER_ID}:${workspaceId}`,
          workspaceId,
          deviceId: DeviceIdSchema.parse(
            "00000000-0000-4000-8000-000000000099",
          ),
          providerKind: "local_only",
          storageRole: "canonical",
          displayName: "Local only",
          location: "this_device",
          capabilities: {
            ordered_changes: {
              support: "unsupported",
              reason: "No remote provider is configured.",
            },
            checkpoints: { support: "supported" },
            tombstones: {
              support: "unsupported",
              reason: "No remote provider is configured.",
            },
            attachments: {
              support: "unsupported",
              reason: "Attachments are not implemented.",
            },
            quota: {
              support: "unsupported",
              reason: "Local filesystem quota is unknown.",
            },
            portable_export: { support: "supported" },
            portable_import: { support: "supported" },
            provider_migration: { support: "supported" },
            device_revocation: {
              support: "unsupported",
              reason: "No remote authority exists.",
            },
          },
          encryption: {
            atRest: "sqlcipher",
            keyCustody: "operating_system",
            portableRecovery: "separate_recovery_code",
          },
        },
        availability: "available",
        syncState: "not_configured",
        checkpointState: "none_recorded",
        quota: { state: "unknown" },
        lastVerifiedAt: "2026-07-14T10:00:00.000Z",
        recoveryActions: ["export_checkpoint", "restore_checkpoint"],
        detailCode: "ready",
      }),
    listDocumentRevisions: async () => [],
    listCollaborativeContentRevisions: async () => [],
    openDocument: async () => ({
      mode: "local",
      pendingUpdateCount: 0,
      searchIndexState: "current",
    }),
    openCollaborativeContent: async () => ({
      mode: "local",
      pendingUpdateCount: 0,
      searchIndexState: "current",
    }),
    persistDocumentUpdate: async () => undefined,
    persistCollaborativeContentUpdate: async () => undefined,
    syncDataHome: async () => client.getDataHomeStatus(),
    prepareWorkspaceRestore: async () => ({ outcome: "cancelled" }),
    runQuery: async (query) => {
      queries.push(query);
      switch (query.queryName) {
        case "workspace.bootstrapContext":
          return successQuery(query, {
            kind: "workspace.bootstrapContext",
            workspace: {
              id: workspaceId,
              name: "Local Alpha",
              timezone: "Europe/Warsaw",
              defaultTaskStatusId: statusId,
              version: 1,
            },
            spaces: [{ id: spaceId, name: "Root Space", version: 1 }],
            taskStatuses: [
              {
                id: statusId,
                label: "Otwarte",
                operationalSemantics: "actionable",
                position: 0,
                version: 1,
              },
            ],
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "task.list":
          return successQuery(query, {
            kind: "task.list",
            items: [
              {
                id: taskId,
                spaceId,
                title: "Sprawdź integrację",
                status: {
                  id: statusId,
                  label: "Otwarte",
                  operationalSemantics: "actionable",
                },
                completionState: "open",
                createdAt: "2026-07-13T10:00:00.000Z",
                updatedAt: "2026-07-13T10:00:00.000Z",
                version: 2,
              },
            ],
            nextCursor: null,
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "task.assignmentCandidates":
          return successQuery(query, {
            kind: "task.assignmentCandidates",
            spaceId,
            candidates: [
              {
                principalId: "20000000-0000-4000-8000-000000000003",
                displayName: "Workspace member",
                participantKind: "member",
              },
            ],
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "capture.history":
          return successQuery(query, {
            kind: "capture.history",
            items: [],
            nextCursor: null,
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "project.list":
          return successQuery(query, {
            kind: "project.list",
            items: [
              {
                id: projectId,
                spaceId,
                title: "Alpha",
                intendedOutcome: "Działa lokalnie",
                lifecycle: "active",
                relatedOpenTaskCount: 0,
                version: 2,
                updatedAt: "2026-07-13T10:00:00.000Z",
              },
            ],
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "organization.operationalOverview":
          return successQuery(query, {
            kind: "organization.operationalOverview",
            organization: {
              id: organizationId,
              spaceId,
              name: "Client Alpha",
              relationshipState: "active",
              nextAction: "Potwierdź odbiór",
              version: 2,
              updatedAt: "2026-07-13T10:00:00.000Z",
            },
            people: [],
            opportunities: [],
            offers: [],
            renewals: [],
            facts: [],
            activeProjects: [
              {
                id: projectId,
                title: "Alpha",
                intendedOutcome: "Działa lokalnie",
                version: 2,
                updatedAt: "2026-07-13T10:00:00.000Z",
              },
            ],
            openTasks: [],
            meetings: [],
            documents: [],
            recentActivity: [],
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "work.overview":
          return successQuery(query, {
            kind: "work.overview",
            tasks: [
              {
                id: taskId,
                title: "Sprawdź integrację",
                operationalState: "actionable",
                completionState: "open",
                version: 2,
                updatedAt: "2026-07-13T10:00:00.000Z",
              },
            ],
            projects: [],
            areas: [],
            initiatives: [],
            links: [],
            savedViews: [],
            freshness: {
              mode: "local_authoritative",
              checkpoint: null,
              missingCapabilities: [],
            },
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "cockpit.week":
          return successQuery(query, {
            kind: "cockpit.week",
            weekStart: query.parameters.weekStart,
            weekEnd: "2026-07-19",
            focus: [
              {
                taskId,
                title: "Sprawdź integrację",
                score: 100,
                reasons: [{ code: "task_open", weight: 100 }],
              },
            ],
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "activity.meaningful":
          return successQuery(query, {
            kind: "activity.meaningful",
            items: [
              {
                eventId: "00000000-0000-4000-8000-000000000008",
                targetCommandId,
                activityType: "relation_added",
                recordId: relationId,
                occurredAt: "2026-07-13T12:00:00.000Z",
              },
            ],
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "workspace.access":
          return successQuery(query, {
            kind: "workspace.access",
            policyVersion: 1,
            currentPrincipalId: "00000000-0000-4000-8000-000000000003",
            canManage: true,
            members: [
              {
                membershipId: "00000000-0000-4000-8000-000000000010",
                principalId: "00000000-0000-4000-8000-000000000003",
                displayName: "Workspace owner",
                role: "owner",
                status: "active",
                version: 1,
                spaces: [],
              },
            ],
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "search.global":
          return successQuery(query, {
            kind: "search.global",
            normalizedQuery: query.parameters.text.toLowerCase(),
            items: [
              {
                recordKind: "project",
                recordId: projectId,
                spaceId,
                title: "Alpha",
                snippet: "Działa lokalnie",
                matchedFields: ["title"],
                score: 300,
                updatedAt: "2026-07-13T10:00:00.000Z",
              },
            ],
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        case "recovery.preview":
          return successQuery(query, {
            kind: "recovery.preview",
            targetCommandId,
            available: true,
            compensationKind: "relation.remove",
            affectedRecordIds: [relationId],
            requiredVersions: { [relationId]: 1 },
          }) as Awaited<ReturnType<ConstellationRendererClient["runQuery"]>>;
        default:
          throw new Error(`Unexpected query ${query.queryName}`);
      }
    },
    restoreDocumentRevision: async () => undefined,
    restoreCollaborativeContentRevision: async () => undefined,
    executeCommand: async (command) => {
      commands.push(command);
      if (command.commandName === "command.previewUndo")
        return {
          kind: "command_outcome",
          outcome: {
            contractVersion: 1,
            commandId: command.commandId,
            correlationId: command.correlationId,
            kernelTime: "2026-07-13T12:00:00.000Z",
            outcome: "preview",
            diagnosticCode: "undo.previewed",
            projection: {
              kind: "undo.previewed",
              targetCommandId,
              available: true,
              compensationKind: "relation.remove",
              affectedRecordIds: [relationId],
              requiredVersions: { [relationId]: 1 },
            },
          },
        };
      const projection = commandProjection(command);
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: "2026-07-13T12:00:00.000Z",
          outcome: "success",
          diagnosticCode: projection.kind,
          affected: [],
          auditReceiptId: "00000000-0000-4000-8000-000000000009",
          projection,
        },
      } as unknown as Awaited<
        ReturnType<ConstellationRendererClient["executeCommand"]>
      >;
    },
  };
  return { client, commands, queries };
};

describe("real Wave 2 renderer workflow", () => {
  it("loads the project, cockpit and meaningful activity routes", async () => {
    const { client, queries } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    assert.equal(snapshot.projects.kind, "ready");
    assert.equal(snapshot.cockpit.kind, "ready");
    assert.equal(snapshot.activity.kind, "ready");
    assert.equal(snapshot.work.kind, "ready");
    assert.equal(snapshot.access.kind, "ready");
    assert.equal(snapshot.dataHome?.descriptor.storageRole, "canonical");
    assert.equal(snapshot.dataHome?.syncState, "not_configured");
    assert.deepEqual(
      queries.map((query) => query.queryName).sort(),
      [
        "activity.meaningful",
        "agent.access",
        "attention.inbox",
        "capture.history",
        "cockpit.week",
        "comment.mentionCandidates",
        "document.list",
        "knowledge.list",
        "project.list",
        "radar.review",
        "relationship.workspace",
        "task.list",
        "task.assignmentCandidates",
        "work.overview",
        "workspace.access",
        "workspace.bootstrapContext",
      ].sort(),
    );
  });

  it("keeps local work usable when Data Home status needs an independent retry", async () => {
    const { client } = createTypedClient();
    client.getDataHomeStatus = async () => {
      throw new Error("provider unavailable");
    };
    const snapshot = await loadDesktopSnapshot(client);
    assert.equal(snapshot.dataHome, undefined);
    assert.equal(snapshot.tasks.length, 1);
  });

  it("loads one Organization context through the shared query port", async () => {
    const { client, queries } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    const overview = await loadOrganizationOverview(
      client,
      snapshot,
      organizationId,
      spaceId,
    );
    assert.equal(overview.organization.name, "Client Alpha");
    assert.deepEqual(
      overview.activeProjects.map((project) => project.id),
      [projectId],
    );
    const query = queries.at(-1);
    assert.equal(query?.queryName, "organization.operationalOverview");
    if (query?.queryName === "organization.operationalOverview") {
      assert.equal(query.parameters.organizationId, organizationId);
      assert.equal(query.parameters.spaceId, spaceId);
    }
  });

  it("explains recoverable capacity and permission failures without partial-save ambiguity", async () => {
    const { client } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    const retryMessage = async (
      diagnosticCode:
        | "storage.capacity_exhausted"
        | "storage.permission_denied"
        | "storage.unit_of_work_failed",
    ) => {
      client.executeCommand = async (command) =>
        ({
          kind: "command_outcome",
          outcome: {
            contractVersion: 1,
            commandId: command.commandId,
            correlationId: command.correlationId,
            kernelTime: "2026-07-17T00:00:00.000Z",
            outcome: "retryable",
            diagnosticCode,
          },
        }) as Awaited<
          ReturnType<ConstellationRendererClient["executeCommand"]>
        >;
      const result = await createProject(
        client,
        snapshot,
        "Recovery probe",
        "No partial write",
      );
      // Every retryable outcome is a safe retry, whatever the cause: that part
      // of the guarantee is carried by the discriminant, not by any wording.
      assert.equal(result.kind, "retry");
      if (result.kind !== "retry") throw new Error("Expected safe retry.");
      return result.message;
    };
    const capacity = await retryMessage("storage.capacity_exhausted");
    const permission = await retryMessage("storage.permission_denied");
    // The third recoverable code the kernel can send, and the one with no
    // dedicated remedy. Holding it next to the other two proves the cause is
    // actually read, rather than every retryable outcome sharing one sentence.
    const contention = await retryMessage("storage.unit_of_work_failed");
    assert.equal(new Set([capacity, permission, contention]).size, 3);
    // Copy is legitimately the guarantee here, and there is no structure to
    // anchor on: a retryable outcome means the workspace was left untouched,
    // and the only place a human learns that is the sentence. Drop the clause
    // and the message reads as "it may have half-written" — the very ambiguity
    // this test is named for — so the words are the assertion.
    for (const message of [capacity, permission, contention])
      assert.match(message, /Nothing was half-saved/u);
    // Also copy, for the same reason: a retry with no named remedy is a dead
    // end, so each distinguishable cause has to say what clears it.
    assert.match(capacity, /Free up space/u);
    assert.match(permission, /Restore access/u);
  });

  it("uses search.global and all Wave 2 mutation commands without local decisions", async () => {
    const { client, commands, queries } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    await searchGlobal(client, snapshot, "Alpha");
    await createProject(client, snapshot, "Alpha", "Gotowe");
    await createArea(client, snapshot, "Produkt", "Utrzymuj jakość");
    await createInitiative(client, snapshot, "Alfa", "Pełny tydzień pracy");
    await createSavedWorkView(client, snapshot, "Czekam", {
      operationalStates: ["waiting"],
    });
    await createWorkLink(
      client,
      snapshot,
      spaceId,
      "project_advances_initiative",
      projectId,
      "00000000-0000-4000-8000-000000000020",
    );
    await setTaskOperationalState(
      client,
      snapshot,
      {
        id: taskId,
        title: "Sprawdź integrację",
        statusId: TaskStatusIdSchema.parse(
          "00000000-0000-4000-8000-000000000031",
        ),
        operationalState: "actionable",
        completionState: "open",
        projectIds: [],
        areaIds: [],
        initiativeIds: [],
        directContextRelations: [],
        version: 2,
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
      "waiting",
      "Dostawca",
    );
    await updateProjectOutcome(
      client,
      snapshot,
      {
        id: projectId,
        spaceId,
        title: "Alpha",
        intendedOutcome: "Działa",
        needsReview: false,
        attentionState: "current",
        lifecycle: "active",
        version: 2,
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
      "Gotowe lokalnie",
    );
    await setTaskStatus(client, snapshot, taskId, 2, statusId);
    await setTaskCompletion(client, snapshot, taskId, 2, true);
    await relateTask(client, snapshot, taskId, 2, projectId, 2);
    await unrelateTask(client, snapshot, relationId, 1);
    assert.ok(queries.some((query) => query.queryName === "search.global"));
    assert.deepEqual(
      commands.map((command) => command.commandName),
      [
        "project.create",
        "area.create",
        "initiative.create",
        "savedView.create",
        "work.linkCreate",
        "task.setOperationalState",
        "project.updateOutcome",
        "task.setStatus",
        "task.complete",
        "record.relate",
        "record.unrelate",
      ],
    );
  });

  it("creates strategic records without a narrative instead of sending an empty one", async () => {
    const { client, commands } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    await createProject(client, snapshot, "Import bez wyniku");
    await createArea(client, snapshot, "Obszar bez opisu");
    await createInitiative(client, snapshot, "Inicjatywa bez wyniku");
    assert.deepEqual(
      commands.map((command) => command.commandName),
      ["project.create", "area.create", "initiative.create"],
    );
    for (const command of commands) {
      const payload: Readonly<Record<string, unknown>> = command.payload;
      assert.ok(
        !("intendedOutcome" in payload) && !("responsibility" in payload),
        `${command.commandName} must omit the narrative, never send ""`,
      );
    }
  });

  it("writes a narrative that was left blank at creation through the update commands", async () => {
    const { client, commands } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    await createProject(client, snapshot, "Alpha", "Gotowe");
    await updateAreaResponsibility(
      client,
      snapshot,
      { id: areaId, version: 1 },
      "Utrzymuj jakość produktu",
    );
    await updateInitiativeOutcome(
      client,
      snapshot,
      { id: initiativeId, version: 2 },
      "Pełny tydzień przepracowany",
    );
    assert.deepEqual(
      commands.map((command) => command.commandName),
      [
        "project.create",
        "area.updateResponsibility",
        "initiative.updateOutcome",
      ],
    );
    assert.deepEqual(commands[0]?.payload, {
      spaceId,
      title: "Alpha",
      intendedOutcome: "Gotowe",
    });
    assert.deepEqual(commands[1]?.expectedVersions, { [areaId]: 1 });
    assert.deepEqual(commands[2]?.expectedVersions, { [initiativeId]: 2 });
  });

  it("requires matching recovery.preview and command.previewUndo before undo", async () => {
    const { client, commands, queries } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    const preview = await previewUndo(client, snapshot, targetCommandId);
    assert.equal(preview.kind, "success");
    if (preview.kind !== "success") return;
    const undone = await undoCommand(client, snapshot, preview.data);
    assert.equal(undone.kind, "success");
    assert.ok(queries.some((query) => query.queryName === "recovery.preview"));
    assert.deepEqual(
      commands.slice(-2).map((command) => command.commandName),
      ["command.previewUndo", "command.undo"],
    );
    assert.deepEqual(commands.at(-1)?.expectedVersions, { [relationId]: 1 });
  });

  it("links a client into the Project's own Space with no endpoint versions", async () => {
    const { client, commands } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    const result = await linkProjectClient(
      client,
      snapshot,
      { id: projectId, spaceId: otherSpaceId },
      organizationId,
    );
    assert.equal(result.kind, "success");
    const command = commands.at(-1);
    assert.equal(command?.commandName, "work.linkCreate");
    // The Space comes from the Project, not from the workspace's first Space:
    // a Project opened from global search can sit anywhere, and the kernel
    // answers a mismatched payload Space with an unnamed precondition failure.
    assert.notEqual(otherSpaceId, snapshot.bootstrap.spaces[0]?.id);
    if (command?.commandName === "work.linkCreate") {
      assert.equal(command.payload.spaceId, otherSpaceId);
      assert.equal(command.payload.linkType, "project_serves_organization");
      assert.equal(command.payload.sourceRecordId, projectId);
      assert.equal(command.payload.targetRecordId, organizationId);
    }
    // `work.linkCreate` is the one command here whose kernel branch asserts
    // exactExpected against {}; sending an endpoint version is a rejection.
    assert.deepEqual(command?.expectedVersions, {});
  });

  it("detaches a client with the link record's own version, read from the workspace slice", async () => {
    const { client, commands } = createTypedClient();
    const loaded = await loadDesktopSnapshot(client);
    const snapshot = { ...loaded, relationships: readyRelationships };
    assert.deepEqual(
      [...directClientLinks(snapshot, projectId).keys()],
      [organizationId],
    );
    const result = await unlinkProjectClient(
      client,
      snapshot,
      projectId,
      organizationId,
    );
    assert.equal(result.kind, "success");
    const command = commands.at(-1);
    assert.equal(command?.commandName, "work.linkRemove");
    if (command?.commandName === "work.linkRemove")
      assert.deepEqual(command.payload, { linkId });
    assert.deepEqual(command?.expectedVersions, { [linkId]: 4 });
  });

  it("refuses to detach a client it cannot name a link for, without sending a command", async () => {
    const { client, commands } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    // The fixture answers no `relationship.workspace`, so the slice is
    // unavailable — the same state a human meets before the read lands.
    assert.equal(snapshot.relationships.kind, "unavailable");
    const unloaded = await unlinkProjectClient(
      client,
      snapshot,
      projectId,
      organizationId,
    );
    assert.equal(unloaded.kind, "unavailable");
    // Copy is the guarantee, and nothing structural carries it: `unavailable`
    // is also what a kernel refusal returns, so the sentence is the only place
    // a human learns this refusal is temporary and that a reload — not a
    // permission, not an unlink elsewhere — is what clears it.
    if (unloaded.kind === "unavailable")
      assert.match(unloaded.message, /needs a (data )?reload before/u);
    const detached = await unlinkProjectClient(
      client,
      { ...snapshot, relationships: readyRelationships },
      projectId,
      // Already detached: the link record stays in the projection with
      // `state: "removed"`, so a reader that ignored state would send a
      // command the kernel refuses.
      detachedOrganizationId,
    );
    assert.equal(detached.kind, "unavailable");
    // A link that is present but already removed is the same kind of refusal:
    // the reader has stale data, so it must read as reloadable too.
    if (detached.kind === "unavailable")
      assert.match(detached.message, /needs a (data )?reload before/u);
    assert.deepEqual(commands, []);
  });

  it("offers only organizations this Project can still be linked to", () => {
    const snapshot = { relationships: readyRelationships };
    assert.deepEqual(
      linkableClientOrganizations(snapshot, {
        id: projectId,
        spaceId,
      })?.map((organization) => organization.name),
      // Ćma before Dach under Polish collation; the already-linked client and
      // the one in another Space are both absent, because the kernel would
      // refuse either without naming a cause.
      ["Ćma", "Dach"],
    );
  });

  it("says nothing about a Space whose organizations never loaded", () => {
    // The distinction the whole branch is about: an empty list would tell a
    // human this Space holds no organizations, on the evidence that a read
    // failed. Absent means "not answered", and the surface says so.
    assert.equal(
      linkableClientOrganizations(
        { relationships: { kind: "unavailable", message: "nie działa" } },
        { id: projectId, spaceId },
      ),
      undefined,
    );
  });

  it("links a delivery from the client's side into the client's own Space", async () => {
    const { client, commands } = createTypedClient();
    const loaded = await loadDesktopSnapshot(client);
    const snapshot = { ...loaded, relationships: readyRelationships };
    const target = ProjectIdSchema.parse(
      "00000000-0000-4000-8000-00000000001c",
    );
    const result = await linkOrganizationDelivery(
      client,
      snapshot,
      organizationId,
      target,
    );
    assert.equal(result.kind, "success");
    const command = commands.at(-1);
    assert.equal(command?.commandName, "work.linkCreate");
    if (command?.commandName === "work.linkCreate") {
      // The edge is not flipped by being authored from the other end: the
      // Project stays the source and the Organization the target, because the
      // kernel enforces a kind at each.
      assert.equal(command.payload.sourceRecordId, target);
      assert.equal(command.payload.targetRecordId, organizationId);
      assert.equal(command.payload.spaceId, spaceId);
    }
    assert.deepEqual(command?.expectedVersions, {});
  });

  it("detaches a delivery with the same link record the Project side would use", async () => {
    const { client, commands } = createTypedClient();
    const loaded = await loadDesktopSnapshot(client);
    const snapshot = { ...loaded, relationships: readyRelationships };
    // The one map read from the client end names the Project, where the one
    // read from the Project end names the client — same link record, so the
    // two pages can never disagree about what is attached.
    assert.deepEqual(
      [...directDeliveryProjects(snapshot, organizationId).keys()],
      [projectId],
    );
    const result = await unlinkOrganizationDelivery(
      client,
      snapshot,
      organizationId,
      projectId,
    );
    assert.equal(result.kind, "success");
    const command = commands.at(-1);
    assert.equal(command?.commandName, "work.linkRemove");
    if (command?.commandName === "work.linkRemove")
      assert.deepEqual(command.payload, { linkId });
    assert.deepEqual(command?.expectedVersions, { [linkId]: 4 });
  });

  it("refuses either half of the client-side link it cannot name a record for", async () => {
    const { client, commands } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    assert.equal(snapshot.relationships.kind, "unavailable");
    // Linking needs the client record for its Space, detaching needs the link
    // record for its version. Neither is guessed, and neither sends a command.
    const link = await linkOrganizationDelivery(
      client,
      snapshot,
      organizationId,
      projectId,
    );
    assert.equal(link.kind, "unavailable");
    // Both halves refuse the same way and for the same reason, so both have to
    // say the same thing about what clears it. See the Project-side test for
    // why this one assertion is legitimately about the words.
    if (link.kind === "unavailable")
      assert.match(link.message, /needs a (data )?reload before/u);
    const unlink = await unlinkOrganizationDelivery(
      client,
      { ...snapshot, relationships: readyRelationships },
      organizationId,
      // Never linked at this client, so there is no record to carry a version.
      ProjectIdSchema.parse("00000000-0000-4000-8000-00000000001c"),
    );
    assert.equal(unlink.kind, "unavailable");
    if (unlink.kind === "unavailable")
      assert.match(unlink.message, /needs a (data )?reload before/u);
    assert.deepEqual(commands, []);
  });

  it("offers only active, same-Space projects this client is not already running", () => {
    assert.deepEqual(
      linkableDeliveryProjects(
        { relationships: readyRelationships, projects: readyProjects },
        { id: organizationId, spaceId },
      )?.map((project) => project.title),
      // Ćwierćfinał before Domknięcie under Polish collation. Absent: the
      // delivery already linked, the closed one, and the one in another Space.
      ["Ćwierćfinał", "Domknięcie"],
    );
  });

  it("says nothing about a client's deliveries while either half of the answer is missing", () => {
    // Two projections feed this picker, not one, so either being absent means
    // the answer is unknown rather than empty — the same distinction the
    // Project-side picker draws from a single slice.
    assert.equal(
      linkableDeliveryProjects(
        {
          relationships: { kind: "unavailable", message: "nie działa" },
          projects: readyProjects,
        },
        { id: organizationId, spaceId },
      ),
      undefined,
    );
    assert.equal(
      linkableDeliveryProjects(
        {
          relationships: readyRelationships,
          projects: { kind: "unavailable", message: "nie działa" },
        },
        { id: organizationId, spaceId },
      ),
      undefined,
    );
  });
});
