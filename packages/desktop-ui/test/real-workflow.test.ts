/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CommandIdSchema,
  DataHomeStatusSchema,
  DeviceIdSchema,
  LOCAL_ONLY_PROVIDER_ID,
  ProjectIdSchema,
  RelationIdSchema,
  SpaceIdSchema,
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
  loadDesktopSnapshot,
  previewUndo,
  relateTask,
  searchGlobal,
  setTaskCompletion,
  setTaskOperationalState,
  setTaskStatus,
  undoCommand,
  unrelateTask,
  updateProjectOutcome,
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
const relationId = RelationIdSchema.parse(
  "00000000-0000-4000-8000-000000000006",
);
const targetCommandId = CommandIdSchema.parse(
  "00000000-0000-4000-8000-000000000007",
);

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
    case "initiative.create":
    case "savedView.create":
    case "work.linkCreate":
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
          command.commandName === "area.create"
            ? "area"
            : command.commandName === "initiative.create"
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
    cancelWorkspaceRestore: async () => undefined,
    copyWorkspaceRecoveryCode: async () => ({ outcome: "success" }),
    confirmWorkspaceRestore: async () => ({
      outcome: "success",
      workspaceId,
    }),
    createDocumentRevision: async () =>
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
    openDocument: async () => ({ mode: "local", pendingUpdateCount: 0 }),
    persistDocumentUpdate: async () => undefined,
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

  it("explains recoverable capacity and permission failures without partial-save ambiguity", async () => {
    const { client } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    for (const [diagnosticCode, expectedCopy] of [
      ["storage.capacity_exhausted", "Zwolnij miejsce"],
      ["storage.permission_denied", "Przywróć dostęp"],
    ] as const) {
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
      assert.equal(result.kind, "retry");
      if (result.kind !== "retry") throw new Error("Expected safe retry.");
      assert.match(result.message, /Nic nie zapisano częściowo/u);
      assert.match(result.message, new RegExp(expectedCopy, "u"));
    }
  });

  it("uses search.global and all Wave 2 mutation commands without local decisions", async () => {
    const { client, commands, queries } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    await searchGlobal(client, snapshot, "Alpha");
    await createProject(client, snapshot, "Alpha", "Gotowe");
    await createArea(client, snapshot, "Produkt", "Utrzymuj jakość");
    await createInitiative(client, snapshot, "Alfa", "Pełny tydzień pracy");
    await createSavedWorkView(client, snapshot, "Czekam", ["waiting"]);
    await createWorkLink(
      client,
      snapshot,
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
        operationalState: "actionable",
        completionState: "open",
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
});
