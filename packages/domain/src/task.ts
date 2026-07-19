import type { TaskStatusId, WorkspaceId } from "@constellation/contracts";

import type { TaskStatusDefinition, TaskStatusSemantics } from "./model.js";

export interface CreateDefaultTaskStatusInput {
  readonly id: TaskStatusId;
  readonly workspaceId: WorkspaceId;
  readonly occurredAt: string;
}

export const createDefaultTaskStatus = (
  input: CreateDefaultTaskStatusInput,
): TaskStatusDefinition => ({
  id: input.id,
  workspaceId: input.workspaceId,
  label: "To do",
  operationalSemantics: "actionable",
  position: 0,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const taskStatusState = (
  status: TaskStatusDefinition,
): "active" | "archived" => status.state ?? "active";

export interface CreateTaskStatusInput {
  readonly id: TaskStatusId;
  readonly workspaceId: WorkspaceId;
  readonly label: string;
  readonly operationalSemantics: TaskStatusSemantics;
  readonly position: number;
  readonly occurredAt: string;
}

export const createTaskStatus = (
  input: CreateTaskStatusInput,
): TaskStatusDefinition => ({
  id: input.id,
  workspaceId: input.workspaceId,
  label: input.label,
  operationalSemantics: input.operationalSemantics,
  state: "active",
  position: input.position,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export interface TaskStatusDefinitionUpdate {
  readonly label?: string;
  readonly operationalSemantics?: TaskStatusSemantics;
  readonly position?: number;
  readonly state?: "active" | "archived";
}

export const updateTaskStatusDefinition = (
  status: TaskStatusDefinition,
  update: TaskStatusDefinitionUpdate,
  occurredAt: string,
): TaskStatusDefinition => {
  const { archivedAt: currentArchivedAt, ...base } = status;
  const nextState = update.state ?? taskStatusState(status);
  const archivedAt =
    update.state === "archived"
      ? occurredAt
      : update.state === "active"
        ? undefined
        : currentArchivedAt;
  return {
    ...base,
    label: update.label ?? status.label,
    operationalSemantics:
      update.operationalSemantics ?? status.operationalSemantics,
    position: update.position ?? status.position,
    state: nextState,
    ...(archivedAt === undefined ? {} : { archivedAt }),
    version: status.version + 1,
    updatedAt: occurredAt,
  };
};
