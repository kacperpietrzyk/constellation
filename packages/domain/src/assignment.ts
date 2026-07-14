import type { PrincipalId, TaskAssignmentId } from "@constellation/contracts";

import type { Task, TaskAssignment } from "./model.js";

export const assignTask = (input: {
  readonly id: TaskAssignmentId;
  readonly task: Task;
  readonly assigneePrincipalId: PrincipalId;
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): TaskAssignment => ({
  id: input.id,
  workspaceId: input.task.workspaceId,
  spaceId: input.task.spaceId,
  taskId: input.task.id,
  assigneePrincipalId: input.assigneePrincipalId,
  state: "active",
  createdBy: input.createdBy,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const removeTaskAssignment = (
  assignment: TaskAssignment,
  occurredAt: string,
): TaskAssignment => ({
  ...assignment,
  state: "removed",
  version: assignment.version + 1,
  updatedAt: occurredAt,
  removedAt: occurredAt,
});
