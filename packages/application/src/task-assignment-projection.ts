import type { SpaceId, WorkspaceId } from "@constellation/contracts";
import type { TaskAssignment } from "@constellation/domain";

import type { ApplicationReadView } from "./ports.js";

/**
 * Whether a caller may be told WHO a task is assigned to.
 *
 * `task.assignmentCandidates` refuses to name revoked members and agent
 * principals at all, so a projection that named one anyway — or a filter that
 * confirmed one by matching it — would hand back the identity that query took
 * care to withhold. Every read of assignment resolves through this one
 * predicate for that reason: two readings of "may I say who this is" is how one
 * surface ends up naming a person another redacts.
 */
export const assigneeIsVisible = (
  view: ApplicationReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
  assignment: TaskAssignment,
): boolean => {
  if (assignment.redactedAssigneeState !== undefined) return false;
  const assignee = view.getMembership(
    workspaceId,
    assignment.assigneePrincipalId,
  );
  if (assignee === undefined || assignee.status === "revoked") return false;
  if (
    assignee.role === "owner" &&
    view.getWorkspace(workspaceId)?.rootSpaceId === spaceId
  )
    return true;
  return (
    view.getSpaceGrantForPrincipal(workspaceId, spaceId, assignee.principalId)
      ?.status === "active"
  );
};

/**
 * The assignment as a projection: the principal id only when the caller may
 * know it, and a name and availability that say what happened when it may not.
 * "Former member" and "No Space access" are two different facts and a reader
 * acts differently on each, so they are not collapsed into one word.
 */
export const projectedTaskAssignment = (
  view: ApplicationReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
  assignment: TaskAssignment,
): {
  readonly id: TaskAssignment["id"];
  readonly assigneePrincipalId?: TaskAssignment["assigneePrincipalId"];
  readonly displayName: string;
  readonly availability: "active" | "unavailable_member" | "former_member";
  readonly version: number;
} => {
  const visible = assigneeIsVisible(view, workspaceId, spaceId, assignment);
  const assignee = view.getMembership(
    workspaceId,
    assignment.assigneePrincipalId,
  );
  return {
    id: assignment.id,
    ...(visible ? { assigneePrincipalId: assignment.assigneePrincipalId } : {}),
    displayName: visible
      ? (assignee?.displayName ?? "Workspace member")
      : assignment.redactedAssigneeState === "unavailable_member"
        ? "No Space access"
        : assignee?.status === "revoked" || assignee === undefined
          ? "Former member"
          : "No Space access",
    availability: visible
      ? "active"
      : (assignment.redactedAssigneeState ??
        (assignee?.status === "revoked" || assignee === undefined
          ? "former_member"
          : "unavailable_member")),
    version: assignment.version,
  };
};
