import type {
  PrincipalId,
  StrategicRecordId,
  RelationId,
  SpaceId,
  TaskId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";

import type {
  Project,
  Task,
  TaskPlanAuthorship,
  TaskPriority,
  TaskWorkRelation,
} from "./model.js";

/**
 * Kto odpowiada za plan po tej zmianie — parametr WYMAGANY, bo `Task` nie ma
 * strażnika `UnprojectableKeys` i nic poza sygnaturą nie zmusi kolejnego
 * wywołania do podjęcia tej decyzji.
 *
 * - `acting` — ktoś właśnie ustawia `startAt`; podpisujemy go tym, kto wykonał
 *   komendę.
 * - `restore` — cofnięcie; przywracamy podpis SPRZED zmiany, nie podpisujemy
 *   cofającego.
 */
export type TaskPlanDecision =
  | {
      readonly kind: "acting";
      readonly principalId: PrincipalId;
      readonly principalKind: TaskPlanAuthorship["principalKind"];
    }
  | { readonly kind: "restore"; readonly plannedBy?: TaskPlanAuthorship };

const stampPlan = (
  startAt: string | undefined,
  decision: TaskPlanDecision,
  occurredAt: string,
): { plannedBy?: TaskPlanAuthorship } => {
  // Autorstwo istnieje dokładnie tak długo jak plan: bez `startAt` nie ma czego
  // podpisać, więc podpis znika razem z datą.
  if (startAt === undefined) return {};
  if (decision.kind === "restore") {
    return decision.plannedBy === undefined
      ? {}
      : { plannedBy: decision.plannedBy };
  }
  return {
    plannedBy: {
      principalId: decision.principalId,
      principalKind: decision.principalKind,
      at: occurredAt,
    },
  };
};

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
  /** Wymagane, bo zadanie założone z datą jest już zaplanowane — przez tego,
   *  kto je zakłada. Przy tworzeniu nie ma przypadku „przywróć cudzy podpis". */
  readonly createdByKind: TaskPlanAuthorship["principalKind"];
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
  ...stampPlan(
    input.startAt,
    {
      kind: "acting",
      principalId: input.createdBy,
      principalKind: input.createdByKind,
    },
    input.occurredAt,
  ),
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
  readonly attachmentSourceIds?: Task["attachmentSourceIds"];
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
  plan: TaskPlanDecision,
): Task => {
  const {
    description: currentDescription,
    nextAction: currentNextAction,
    startAt: currentStartAt,
    plannedBy: currentPlannedBy,
    dueAt: currentDueAt,
    priority: currentPriority,
    attachmentSourceIds: currentAttachmentSourceIds,
    ...base
  } = task;
  const description = mergeOptional(currentDescription, update.description);
  const nextAction = mergeOptional(currentNextAction, update.nextAction);
  const startAt = mergeOptional(currentStartAt, update.startAt);
  const dueAt = mergeOptional(currentDueAt, update.dueAt);
  const priority = mergeOptional(currentPriority, update.priority);
  const attachmentSourceIds =
    update.attachmentSourceIds ?? currentAttachmentSourceIds;
  return {
    ...base,
    title: update.title ?? task.title,
    ...(description === undefined ? {} : { description }),
    ...(nextAction === undefined ? {} : { nextAction }),
    ...(startAt === undefined ? {} : { startAt }),
    // Podpis zmienia się TYLKO wtedy, gdy zmiana dotknęła `startAt`. Zmiana
    // tytułu nie czyni zmieniającego autorem cudzego planu.
    ...(update.startAt === undefined
      ? currentPlannedBy === undefined
        ? {}
        : { plannedBy: currentPlannedBy }
      : stampPlan(startAt, plan, occurredAt)),
    ...(dueAt === undefined ? {} : { dueAt }),
    ...(priority === undefined ? {} : { priority }),
    ...(attachmentSourceIds === undefined ? {} : { attachmentSourceIds }),
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
  // B2b — the triage state carried by the Task itself (`Task.operationalState`,
  // three values). Deliberately NOT `status.operationalSemantics`, which a task
  // projection also carries: that one describes the status DEFINITION and has a
  // fourth value, "paused". Filtering the wrong one makes the desktop and an
  // operator disagree about the same saved view while both look right.
  readonly operationalStates?: readonly Task["operationalState"][];
  // R13.5 / ADR-044 — an allow-set of Task ids the kernel computed by
  // evaluating relation-path conditions. It stays a task-intrinsic membership
  // test (task.id ∈ set) so pagination is applied over the already-constrained
  // set rather than filtered after a page is drawn.
  readonly taskIdAllowList?: ReadonlySet<TaskId>;
  // B2b — the complement of the same idea, for filters that answer "not one of
  // these": `unassigned: true` is the set of tasks NOT in the assigned set.
  // Kept as an id set for the same reason as the allow-list — a membership test
  // survives pagination, a post-filter over a drawn page does not.
  readonly excludeTaskIds?: ReadonlySet<TaskId>;
}

export const taskMatchesFilters = (
  task: Task,
  filters: TaskListFilters,
): boolean => {
  if (
    filters.taskIdAllowList !== undefined &&
    !filters.taskIdAllowList.has(task.id)
  )
    return false;
  if (
    filters.excludeTaskIds !== undefined &&
    filters.excludeTaskIds.has(task.id)
  )
    return false;
  if (
    filters.operationalStates !== undefined &&
    !filters.operationalStates.includes(task.operationalState)
  )
    return false;
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
}): TaskWorkRelation => {
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

/**
 * The other far end. An Opportunity's next action belongs to that deal and
 * dies with it; before this it could only be a Task on some Project, with the
 * client's name carried in the title.
 */
export const relateTaskToOpportunity = (input: {
  readonly id: RelationId;
  readonly task: Task;
  readonly opportunity: {
    readonly id: StrategicRecordId;
    readonly workspaceId: WorkspaceId;
    readonly spaceId: SpaceId;
  };
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): TaskWorkRelation => {
  if (
    input.task.workspaceId !== input.opportunity.workspaceId ||
    input.task.spaceId !== input.opportunity.spaceId
  ) {
    throw new Error(
      "Task and Opportunity must share an owning Workspace and Space.",
    );
  }
  return {
    id: input.id,
    workspaceId: input.task.workspaceId,
    spaceId: input.task.spaceId,
    relationType: "task_contributes_to_opportunity",
    state: "active",
    taskId: input.task.id,
    opportunityId: input.opportunity.id,
    createdBy: input.createdBy,
    version: 1,
    createdAt: input.occurredAt,
  };
};

export const removeTaskProjectRelation = (
  relation: TaskWorkRelation,
  occurredAt: string,
): TaskWorkRelation => ({
  ...relation,
  state: "removed",
  removedAt: occurredAt,
  version: relation.version + 1,
});

export const restoreTaskProjectRelation = (
  relation: TaskWorkRelation,
): TaskWorkRelation => {
  const withoutRemovedAt = { ...relation };
  delete (withoutRemovedAt as { removedAt?: string }).removedAt;
  return {
    ...withoutRemovedAt,
    state: "active",
    version: relation.version + 1,
  };
};
