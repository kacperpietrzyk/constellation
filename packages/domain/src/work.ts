import type {
  PrincipalId,
  RelationId,
  TaskStatusId,
} from "@constellation/contracts";

import type { Project, Task, TaskProjectRelation } from "./model.js";

export const setTaskStatus = (
  task: Task,
  statusId: TaskStatusId,
  occurredAt: string,
): Task => ({
  ...task,
  statusId,
  version: task.version + 1,
  updatedAt: occurredAt,
});

export const completeTask = (task: Task, occurredAt: string): Task => ({
  ...task,
  completionState: "completed",
  completedAt: occurredAt,
  version: task.version + 1,
  updatedAt: occurredAt,
});

export const reopenTask = (task: Task, occurredAt: string): Task => {
  const openTask: Omit<Task, "completedAt"> & { completedAt?: string } = {
    ...task,
  };
  delete openTask.completedAt;
  return {
    ...openTask,
    completionState: "open",
    version: task.version + 1,
    updatedAt: occurredAt,
  };
};

export const setTaskOperationalState = (
  task: Task,
  input: {
    readonly operationalState: Task["operationalState"];
    readonly waitingOn?: Task["waitingOn"];
    readonly occurredAt: string;
  },
): Task => {
  const { waitingOn: _waitingOn, ...base } = task;
  void _waitingOn;
  return {
    ...base,
    operationalState: input.operationalState,
    ...(input.waitingOn === undefined ? {} : { waitingOn: input.waitingOn }),
    version: task.version + 1,
    updatedAt: input.occurredAt,
  };
};

export const relateTaskToProject = (input: {
  readonly id: RelationId;
  readonly task: Task;
  readonly project: Project;
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): TaskProjectRelation => {
  if (
    input.task.workspaceId !== input.project.workspaceId ||
    input.task.spaceId !== input.project.spaceId
  ) {
    throw new Error(
      "Task and Project must share an owning Workspace and Space.",
    );
  }
  return {
    id: input.id,
    workspaceId: input.task.workspaceId,
    spaceId: input.task.spaceId,
    relationType: "task_contributes_to_project",
    state: "active",
    taskId: input.task.id,
    projectId: input.project.id,
    createdBy: input.createdBy,
    version: 1,
    createdAt: input.occurredAt,
  };
};

export const removeTaskProjectRelation = (
  relation: TaskProjectRelation,
  occurredAt: string,
): TaskProjectRelation => ({
  ...relation,
  state: "removed",
  removedAt: occurredAt,
  version: relation.version + 1,
});

export const restoreTaskProjectRelation = (
  relation: TaskProjectRelation,
): TaskProjectRelation => {
  const withoutRemovedAt: Omit<TaskProjectRelation, "removedAt"> & {
    removedAt?: string;
  } = { ...relation };
  delete withoutRemovedAt.removedAt;
  return {
    ...withoutRemovedAt,
    state: "active",
    version: relation.version + 1,
  };
};
