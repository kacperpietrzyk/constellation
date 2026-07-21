import { createHash } from "node:crypto";

import {
  isApplicationWave2ReadView,
  type ApplicationStore,
} from "@constellation/application";
import type { SpaceId, WorkspaceId } from "@constellation/contracts";
import type { StrategicRecord } from "@constellation/domain";

import type { StarterWorkspaceManifest } from "./starter-workspace-import.js";

/**
 * ADR-050. Export produces exactly the package the import engine already
 * accepts — the same v2 exchange manifest, so the round trip is one format
 * rather than a writer and a reader that can disagree.
 */

const deterministicUuid = (seed: string): string => {
  const digest = createHash("sha256").update(seed).digest("hex");
  const value = digest.slice(0, 32).split("");
  value[12] = "4";
  value[16] = ["8", "9", "a", "b"][parseInt(digest[16]!, 16) % 4]!;
  const joined = value.join("");
  return [
    joined.slice(0, 8),
    joined.slice(8, 12),
    joined.slice(12, 16),
    joined.slice(16, 20),
    joined.slice(20, 32),
  ].join("-");
};

// Record ids are the keys: stable across exports, unique by construction, and
// already the identity the workspace uses. A title-derived slug would collide
// the moment two Projects share a name.
const recordKey = (prefix: string, id: string): string =>
  `${prefix}-${id.replaceAll("-", "").slice(0, 24)}`;

export interface ExchangeExportResult {
  readonly manifest: StarterWorkspaceManifest;
  readonly counts: {
    readonly taskStatuses: number;
    readonly areas: number;
    readonly initiatives: number;
    readonly projects: number;
    readonly tasks: number;
  };
}

export const buildExchangeManifest = (input: {
  readonly store: ApplicationStore;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
}): ExchangeExportResult | undefined =>
  input.store.read((view) => {
    if (!isApplicationWave2ReadView(view)) return undefined;
    const strategic = view.listStrategicRecords(
      input.workspaceId,
      input.spaceId,
    );
    const statusLabels = new Map(
      view
        .listTaskStatuses(input.workspaceId)
        .map((status) => [status.id, status.label]),
    );
    // v3: the statuses the exported tasks name travel with them, so a target
    // workspace that has never heard of a custom status can still accept the
    // package (ADR-052). Archived statuses are left behind: nothing active
    // names them.
    const taskStatuses = view
      .listTaskStatuses(input.workspaceId)
      .filter((status) => status.state !== "archived")
      .map((status) => ({
        key: recordKey("status", status.id),
        label: status.label,
        operationalSemantics: status.operationalSemantics,
      }));
    const areas = strategic.flatMap((record) =>
      record.kind === "area" && record.state !== "archived"
        ? [
            {
              key: recordKey("area", record.id),
              title: record.title,
              responsibility: record.responsibility,
            },
          ]
        : [],
    );
    const initiatives = strategic.flatMap((record) =>
      record.kind === "initiative" && record.state !== "closed"
        ? [
            {
              key: recordKey("initiative", record.id),
              title: record.title,
              intendedOutcome: record.intendedOutcome,
            },
          ]
        : [],
    );
    const linkTarget = (
      sourceId: string,
      linkType: "project_serves_area" | "project_advances_initiative",
    ): string | undefined => {
      const link = strategic.find(
        (record: StrategicRecord) =>
          record.kind === "work_link" &&
          record.state === "active" &&
          record.linkType === linkType &&
          record.sourceRecordId === sourceId,
      );
      return link !== undefined && link.kind === "work_link"
        ? link.targetRecordId
        : undefined;
    };
    const projects = view
      .listProjects(input.workspaceId, input.spaceId)
      .map((project) => {
        const areaId = linkTarget(project.id, "project_serves_area");
        const initiativeId = linkTarget(
          project.id,
          "project_advances_initiative",
        );
        return {
          key: recordKey("project", project.id),
          title: project.title,
          intendedOutcome: project.intendedOutcome,
          ...(areaId === undefined
            ? {}
            : { areaKey: recordKey("area", areaId) }),
          ...(initiativeId === undefined
            ? {}
            : { initiativeKey: recordKey("initiative", initiativeId) }),
        };
      });
    const exportedProjectKeys = new Set(projects.map((project) => project.key));
    const relations = view.listRelations(input.workspaceId, input.spaceId);
    const projectOfTask = new Map<string, string>();
    for (const relation of relations) {
      if (relation.state !== "active") continue;
      if (!projectOfTask.has(relation.taskId))
        projectOfTask.set(relation.taskId, relation.projectId);
    }
    const tasks = view
      .listTasksInSpace(input.workspaceId, input.spaceId)
      .filter((task) => task.recordState !== "removed")
      .map((task) => {
        const projectId = projectOfTask.get(task.id);
        const projectKey =
          projectId === undefined ? undefined : recordKey("project", projectId);
        const statusLabel = statusLabels.get(task.statusId);
        return {
          key: recordKey("task", task.id),
          title: task.title,
          // A relation to a Project outside this Space would import as a
          // dangling key, so it is dropped rather than exported as a promise
          // the package cannot keep.
          ...(projectKey !== undefined && exportedProjectKeys.has(projectKey)
            ? { projectKey }
            : {}),
          ...(task.operationalState === "actionable"
            ? {}
            : { operationalState: task.operationalState }),
          ...(task.waitingOn === undefined
            ? {}
            : { waitingOn: task.waitingOn.label }),
          ...(task.description === undefined
            ? {}
            : { description: task.description }),
          ...(task.priority === undefined ? {} : { priority: task.priority }),
          ...(task.startAt === undefined ? {} : { startAt: task.startAt }),
          ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
          ...(statusLabel === undefined ? {} : { statusLabel }),
        };
      });
    const body = {
      version: 3 as const,
      areas,
      initiatives,
      projects,
      tasks,
      taskStatuses,
    };
    // The importId is a digest of the content, so exporting the same workspace
    // twice produces the same package and re-importing one is idempotent
    // through the import's own `starter:<importId>:<key>` keys.
    const manifest: StarterWorkspaceManifest = {
      ...body,
      importId: deterministicUuid(`exchange-export:${JSON.stringify(body)}`),
    };
    return {
      manifest,
      counts: {
        taskStatuses: taskStatuses.length,
        areas: areas.length,
        initiatives: initiatives.length,
        projects: projects.length,
        tasks: tasks.length,
      },
    };
  });
