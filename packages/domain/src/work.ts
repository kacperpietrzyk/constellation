import type {
  PrincipalId,
  RelationId,
  SpaceId,
  TaskId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";

import type {
  Project,
  Task,
  TaskPriority,
  TaskProjectRelation,
} from "./model.js";

export interface CreateTaskInput {
  readonly id: TaskId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly description?: string;
  readonly nextAction?: string;
  readonly startAt?: string;
  readonly dueAt?: string;
  readonly priority?: TaskPriority;
  readonly parentTaskId?: TaskId;
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
  ...(input.startAt === undefined ? {} : { startAt: input.startAt }),
  ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
  ...(input.priority === undefined ? {} : { priority: input.priority }),
  ...(input.parentTaskId === undefined
    ? {}
    : { parentTaskId: input.parentTaskId }),
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
  readonly startAt?: string | null;
  readonly dueAt?: string | null;
  readonly priority?: TaskPriority | null;
}

const mergeOptional = <Value>(
  current: Value | undefined,
  update: Value | null | undefined,
): Value | undefined =>
  update === undefined ? current : update === null ? undefined : update;

export const updateTaskDetails = (
  task: Task,
  update: TaskDetailsUpdate,
  occurredAt: string,
): Task => {
  const {
    description: currentDescription,
    nextAction: currentNextAction,
    startAt: currentStartAt,
    dueAt: currentDueAt,
    priority: currentPriority,
    ...base
  } = task;
  const description = mergeOptional(currentDescription, update.description);
  const nextAction = mergeOptional(currentNextAction, update.nextAction);
  const startAt = mergeOptional(currentStartAt, update.startAt);
  const dueAt = mergeOptional(currentDueAt, update.dueAt);
  const priority = mergeOptional(currentPriority, update.priority);
  return {
    ...base,
    title: update.title ?? task.title,
    ...(description === undefined ? {} : { description }),
    ...(nextAction === undefined ? {} : { nextAction }),
    ...(startAt === undefined ? {} : { startAt }),
    ...(dueAt === undefined ? {} : { dueAt }),
    ...(priority === undefined ? {} : { priority }),
    version: task.version + 1,
    updatedAt: occurredAt,
  };
};

/** The resulting timing of a details update, before it is applied. */
export const taskTimingAfterUpdate = (
  task: Task,
  update: TaskDetailsUpdate,
): { startAt?: string; dueAt?: string } => {
  const startAt = mergeOptional(task.startAt, update.startAt);
  const dueAt = mergeOptional(task.dueAt, update.dueAt);
  return {
    ...(startAt === undefined ? {} : { startAt }),
    ...(dueAt === undefined ? {} : { dueAt }),
  };
};

export const isTaskTimingValid = (timing: {
  startAt?: string;
  dueAt?: string;
}): boolean =>
  timing.startAt === undefined ||
  timing.dueAt === undefined ||
  Date.parse(timing.startAt) <= Date.parse(timing.dueAt);

export const effectiveTaskPriority = (task: Task): TaskPriority =>
  task.priority ?? "normal";

const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

/**
 * The due-aware null-ordering contract: scheduled Tasks first by ascending
 * deadline, then priority (urgent first), creation time, and id; unscheduled
 * Tasks follow in the same deterministic sub-order. Overdue items are ordinary
 * scheduled items, not a separate bucket.
 */
export const compareTasksByDue = (left: Task, right: Task): number => {
  if (left.dueAt !== undefined || right.dueAt !== undefined) {
    if (left.dueAt === undefined) return 1;
    if (right.dueAt === undefined) return -1;
    const byDue = Date.parse(left.dueAt) - Date.parse(right.dueAt);
    if (byDue !== 0) return byDue;
  }
  const byPriority =
    TASK_PRIORITY_RANK[effectiveTaskPriority(right)] -
    TASK_PRIORITY_RANK[effectiveTaskPriority(left)];
  if (byPriority !== 0) return byPriority;
  const byCreated = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (byCreated !== 0) return byCreated;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};

export interface TaskListFilters {
  readonly statusIds?: readonly TaskStatusId[];
  readonly priorities?: readonly TaskPriority[];
  readonly scheduled?: boolean;
  readonly dueBefore?: string;
  readonly dueAfter?: string;
}

export const taskMatchesFilters = (
  task: Task,
  filters: TaskListFilters,
): boolean => {
  if (
    filters.statusIds !== undefined &&
    !filters.statusIds.includes(task.statusId)
  )
    return false;
  if (
    filters.priorities !== undefined &&
    !filters.priorities.includes(effectiveTaskPriority(task))
  )
    return false;
  if (filters.scheduled !== undefined) {
    if (filters.scheduled !== (task.dueAt !== undefined)) return false;
  }
  if (filters.dueBefore !== undefined) {
    if (
      task.dueAt === undefined ||
      Date.parse(task.dueAt) >= Date.parse(filters.dueBefore)
    )
      return false;
  }
  if (filters.dueAfter !== undefined) {
    if (
      task.dueAt === undefined ||
      Date.parse(task.dueAt) < Date.parse(filters.dueAfter)
    )
      return false;
  }
  return true;
};

export const setTaskParent = (
  task: Task,
  parentTaskId: TaskId | undefined,
  occurredAt: string,
): Task => {
  const { parentTaskId: _prior, ...base } = task;
  void _prior;
  return {
    ...base,
    ...(parentTaskId === undefined ? {} : { parentTaskId }),
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
