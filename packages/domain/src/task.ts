import type { TaskStatusId, WorkspaceId } from "@constellation/contracts";

import type { TaskStatusDefinition } from "./model.js";

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
