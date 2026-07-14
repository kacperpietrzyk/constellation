import type {
  ExecutionContext,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type { ApplicationReadView } from "./ports.js";

export const activeMembership = (
  view: ApplicationReadView,
  workspaceId: WorkspaceId,
  principalId: ExecutionContext["principalId"],
) => {
  const membership = view.getMembership(workspaceId, principalId);
  return membership !== undefined && membership.status !== "revoked"
    ? membership
    : undefined;
};

export const canManageWorkspaceAccess = (
  view: ApplicationReadView,
  context: ExecutionContext,
  workspaceId: WorkspaceId,
): boolean => {
  const workspace = view.getWorkspace(workspaceId);
  const membership = activeMembership(view, workspaceId, context.principalId);
  return (
    workspace !== undefined &&
    (workspace.policyVersion ?? 1) === context.policyVersion &&
    (membership?.role === "owner" || membership?.role === "admin")
  );
};

export const effectiveSpaceAccess = (
  view: ApplicationReadView,
  context: ExecutionContext,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
): "view" | "comment" | "edit" | undefined => {
  const workspace = view.getWorkspace(workspaceId);
  const membership = activeMembership(view, workspaceId, context.principalId);
  if (
    workspace === undefined ||
    membership === undefined ||
    (workspace.policyVersion ?? 1) !== context.policyVersion ||
    context.workspaceId !== workspaceId ||
    !context.spaceScope.includes(spaceId)
  ) {
    return undefined;
  }
  if (membership.role === "owner" && spaceId === workspace.rootSpaceId)
    return "edit";
  const grant = view.getSpaceGrantForPrincipal(
    workspaceId,
    spaceId,
    context.principalId,
  );
  return grant?.status === "active" ? grant.access : undefined;
};

export const canViewSpace = (
  view: ApplicationReadView,
  context: ExecutionContext,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
): boolean =>
  effectiveSpaceAccess(view, context, workspaceId, spaceId) !== undefined;

export const canEditSpace = (
  view: ApplicationReadView,
  context: ExecutionContext,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
): boolean =>
  effectiveSpaceAccess(view, context, workspaceId, spaceId) === "edit";

export const canCommentInSpace = (
  view: ApplicationReadView,
  context: ExecutionContext,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
): boolean => {
  const access = effectiveSpaceAccess(view, context, workspaceId, spaceId);
  return access === "comment" || access === "edit";
};
