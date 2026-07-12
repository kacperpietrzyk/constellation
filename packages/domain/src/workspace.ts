import type {
  MembershipId,
  PrincipalId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type { Space, Workspace, WorkspaceMembership } from "./model.js";

export interface CreateLocalWorkspaceInput {
  readonly workspaceId: WorkspaceId;
  readonly rootSpaceId: SpaceId;
  readonly membershipId: MembershipId;
  readonly ownerPrincipalId: PrincipalId;
  readonly name: string;
  readonly timezone: string;
  readonly occurredAt: string;
}

export interface CreatedLocalWorkspace {
  readonly workspace: Workspace;
  readonly rootSpace: Space;
  readonly ownerMembership: WorkspaceMembership;
}

export const createLocalWorkspace = (
  input: CreateLocalWorkspaceInput,
): CreatedLocalWorkspace => ({
  workspace: {
    id: input.workspaceId,
    name: input.name,
    timezone: input.timezone,
    rootSpaceId: input.rootSpaceId,
    version: 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  },
  rootSpace: {
    id: input.rootSpaceId,
    workspaceId: input.workspaceId,
    name: "Personal",
    version: 1,
    createdAt: input.occurredAt,
  },
  ownerMembership: {
    id: input.membershipId,
    workspaceId: input.workspaceId,
    principalId: input.ownerPrincipalId,
    role: "owner",
    version: 1,
    createdAt: input.occurredAt,
  },
});

export const renameWorkspace = (
  workspace: Workspace,
  name: string,
  occurredAt: string,
): Workspace => ({
  ...workspace,
  name,
  version: workspace.version + 1,
  updatedAt: occurredAt,
});
