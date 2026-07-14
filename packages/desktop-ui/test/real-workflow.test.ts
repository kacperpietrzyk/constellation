/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CommandIdSchema,
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
  createProject,
  loadDesktopSnapshot,
  previewUndo,
  relateTask,
  searchGlobal,
  setTaskCompletion,
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
    cancelWorkspaceRestore: async () => undefined,
    confirmWorkspaceRestore: async () => ({
      outcome: "success",
      workspaceId,
    }),
    exportWorkspaceBackup: async () => ({ outcome: "cancelled" }),
    getBuildInfo: async () => ({
      channel: "local-alpha",
      startupRecovery: "none",
      initialWorkspaceId: workspaceId,
      persistence: "encrypted-local",
      version: "test",
    }),
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
    assert.deepEqual(
      queries.map((query) => query.queryName).sort(),
      [
        "activity.meaningful",
        "capture.history",
        "cockpit.week",
        "project.list",
        "task.list",
        "workspace.bootstrapContext",
      ].sort(),
    );
  });

  it("uses search.global and all Wave 2 mutation commands without local decisions", async () => {
    const { client, commands, queries } = createTypedClient();
    const snapshot = await loadDesktopSnapshot(client);
    await searchGlobal(client, snapshot, "Alpha");
    await createProject(client, snapshot, "Alpha", "Gotowe");
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
