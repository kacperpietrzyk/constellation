import type {
  PrincipalId,
  RelationId,
  SpaceId,
  TaskId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";

import type { Project, Task, TaskProjectRelation } from "./model.js";

export interface CreateTaskInput {
  readonly id: TaskId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly description?: string;
  readonly nextAction?: string;
  readonly statusId: TaskStatusId;
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}

export const createTask = (input: CreateTaskInput): Task => ({
  id: input.id,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  title: input.title,
  ...(input.description === undefined
    ? {}
    : { description: input.description }),
  ...(input.nextAction === undefined ? {} : { nextAction: input.nextAction }),
  statusId: input.statusId,
  recordState: "active",
  completionState: "open",
  operationalState: "actionable",
  createdBy: input.createdBy,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export interface TaskDetailsUpdate {
  readonly title?: string;
  readonly description?: string | null;
  readonly nextAction?: string | null;
}

export const updateTaskDetails = (
  task: Task,
  update: TaskDetailsUpdate,
  occurredAt: string,
): Task => {
  const {
    description: currentDescription,
    nextAction: currentNextAction,
    ...base
  } = task;
  const description =
    update.description === undefined
      ? currentDescription
      : update.description === null
        ? undefined
        : update.description;
  const nextAction =
    update.nextAction === undefined
      ? currentNextAction
      : update.nextAction === null
        ? undefined
        : update.nextAction;
  return {
    ...base,
    title: update.title ?? task.title,
    ...(description === undefined ? {} : { description }),
    ...(nextAction === undefined ? {} : { nextAction }),
    version: task.version + 1,
    updatedAt: occurredAt,
  };
};

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
