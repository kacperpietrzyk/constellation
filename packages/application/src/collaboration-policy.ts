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

/**
 * Who may change workspace-level configuration: the working day, the default
 * Task status, the commercial defaults, the field and status vocabularies, the
 * templates and the automations. All of it is `operate` in
 * `CAPABILITY_DELEGATION`, so all of it is delegable to an agent grant.
 *
 * The membership role governs a human; the grant governs an agent. For every
 * principal kind other than `agent` this IS `canManageWorkspaceAccess`, letter
 * for letter — a human who is not `owner` or `admin` is refused exactly as
 * before, and a principal kind added later lands on the strict path rather than
 * through the gap.
 *
 * An agent is asked for its grant and not for its role, because the role
 * answers about the wrong principal. An agent grant's own membership is always
 * minted with role `guest` (`agent-access.ts`, `executeAgentAccessCommand`), so
 * a role check refuses every agent that can ever exist — and it refuses after
 * the capability was already found, which reaches the caller as
 * `command.precondition_failed`: a delegable capability the MCP catalog
 * advertises, the kernel then denies, and the diagnostic blames the payload.
 *
 * This is not an escalation. `agent.grantCreate` may only be issued by a
 * *human* principal that already holds `workspace.manageAccess` (see
 * `isAgentAccessCommandAuthorized`), and that human writes the capability list
 * by hand. A delegated `operate` capability therefore already is an
 * administrator's authority, scoped and named; re-asking the agent for an
 * `owner`/`admin` role afterwards asks a second time, of the wrong principal,
 * about a thing it never claimed. Everything else the strict predicate checks
 * still binds — the workspace exists, the policy version the context carries is
 * still the workspace's own, and the caller holds a live, non-revoked
 * membership — so a revoked agent or one minted against a superseded policy is
 * refused here as it was before.
 */
export const canConfigureWorkspace = (
  view: ApplicationReadView,
  context: ExecutionContext,
  workspaceId: WorkspaceId,
): boolean => {
  if (context.principalKind !== "agent")
    return canManageWorkspaceAccess(view, context, workspaceId);
  const workspace = view.getWorkspace(workspaceId);
  return (
    workspace !== undefined &&
    (workspace.policyVersion ?? 1) === context.policyVersion &&
    // Stated rather than implied: the strict predicate gets membership
    // existence for free from `role === "owner"`, and dropping the role would
    // otherwise drop the membership requirement with it.
    activeMembership(view, workspaceId, context.principalId) !== undefined
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
