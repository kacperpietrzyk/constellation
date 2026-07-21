import type {
  ProjectId,
  RelationCondition,
  SpaceId,
  StrategicRecordId,
  TaskId,
  WorkspaceId,
} from "@constellation/contracts";
import type { StrategicRecord } from "@constellation/domain";

import type { ApplicationWave2ReadView } from "./ports.js";

// R13.5 / ADR-044, extracted per ADR-045.
//
// This is the single evaluation source for relation-path conditions. It was a
// private method on the kernel serving `task.list` alone; a saved view carrying
// the same conditions has to reach the same answer, and the only honest way to
// guarantee that is one implementation with two callers rather than two
// implementations asserted to agree. In particular the Work surface must never
// re-derive relations client-side — that would reopen the ADR-036 deferral this
// evaluator closed.
//
// Conditions AND together; within one condition the match is existential (a
// task matches when *any* project it relates to satisfies the predicate), since
// a project reaches its organization through a many-to-many opportunity bridge
// and there is no honest "primary organization" to pick (ADR-044 §3).

// Projects on the source side of an active work link whose target is one of the
// matched terminus records. Source is always the project for the
// project_serves_area / project_advances_initiative link types.
const projectsReachingWorkLink = (
  strategic: readonly StrategicRecord[],
  linkType: "project_serves_area" | "project_advances_initiative",
  terminusIds: ReadonlySet<string>,
): ReadonlySet<ProjectId> => {
  const projectIds = new Set<ProjectId>();
  for (const record of strategic) {
    if (
      record.kind === "work_link" &&
      record.state === "active" &&
      record.linkType === linkType &&
      terminusIds.has(record.targetRecordId)
    )
      projectIds.add(record.sourceRecordId as ProjectId);
  }
  return projectIds;
};

const projectsMatchingCondition = (
  view: ApplicationWave2ReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
  condition: RelationCondition,
): ReadonlySet<ProjectId> => {
  // One-hop: the terminus is the Project itself.
  if (condition.path === "project") {
    if (condition.predicate.field === "id")
      return new Set(condition.predicate.in);
    const lifecycle = condition.predicate.equals;
    return new Set(
      view
        .listProjects(workspaceId, spaceId)
        .filter((project) => project.lifecycle === lifecycle)
        .map((project) => project.id),
    );
  }

  // Two-hop: resolve the set of terminus strategic-record ids the predicate
  // matches, then map back to the projects that reach them. All strategic
  // records are loaded once and indexed in memory — bounded, no traversal.
  const strategic = view.listStrategicRecords(workspaceId, spaceId);
  const terminusIds = new Set<StrategicRecordId>();
  if (condition.path === "project.area") {
    const predicate = condition.predicate;
    for (const record of strategic) {
      if (record.kind !== "area") continue;
      if (
        predicate.field === "id"
          ? predicate.in.includes(record.id)
          : record.state === predicate.equals
      )
        terminusIds.add(record.id);
    }
    return projectsReachingWorkLink(
      strategic,
      "project_serves_area",
      terminusIds,
    );
  }
  if (condition.path === "project.initiative") {
    const predicate = condition.predicate;
    for (const record of strategic) {
      if (record.kind !== "initiative") continue;
      if (
        predicate.field === "id"
          ? predicate.in.includes(record.id)
          : record.state === predicate.equals
      )
        terminusIds.add(record.id);
    }
    return projectsReachingWorkLink(
      strategic,
      "project_advances_initiative",
      terminusIds,
    );
  }
  // condition.path === "project.organization" — via the opportunity bridge.
  const predicate = condition.predicate;
  for (const record of strategic) {
    if (record.kind !== "organization") continue;
    if (
      predicate.field === "id"
        ? predicate.in.includes(record.id)
        : record.relationshipState === predicate.equals
    )
      terminusIds.add(record.id);
  }
  const projectIds = new Set<ProjectId>();
  for (const record of strategic) {
    if (record.kind !== "opportunity") continue;
    if (!terminusIds.has(record.organizationId)) continue;
    for (const projectId of record.projectIds) projectIds.add(projectId);
  }
  return projectIds;
};

/**
 * Evaluate relation-path conditions into an allow-set of Task ids, scoped to
 * one Space. Every relation and strategic record read here is drawn for that
 * `(workspaceId, spaceId)` pair only — the caller must have authorized the
 * Space first, and this must never be handed a wider scope than the caller
 * checked.
 */
export const evaluateRelationConditions = (
  view: ApplicationWave2ReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
  conditions: readonly RelationCondition[],
): ReadonlySet<TaskId> => {
  const relations = view.listRelations(workspaceId, spaceId);
  let allowed: Set<TaskId> | undefined;
  for (const condition of conditions) {
    const matchingProjectIds = projectsMatchingCondition(
      view,
      workspaceId,
      spaceId,
      condition,
    );
    const tasksForCondition = new Set<TaskId>();
    for (const relation of relations) {
      if (matchingProjectIds.has(relation.projectId))
        tasksForCondition.add(relation.taskId);
    }
    allowed =
      allowed === undefined
        ? tasksForCondition
        : new Set(
            [...allowed].filter((taskId) => tasksForCondition.has(taskId)),
          );
  }
  return allowed ?? new Set<TaskId>();
};
