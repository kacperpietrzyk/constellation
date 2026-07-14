import type {
  MembershipId,
  PrincipalId,
  SpaceId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";

import type {
  Space,
  TaskStatusDefinition,
  Workspace,
  WorkspaceMembership,
} from "./model.js";
import { createDefaultTaskStatus } from "./task.js";

export interface CreateLocalWorkspaceInput {
  readonly workspaceId: WorkspaceId;
  readonly rootSpaceId: SpaceId;
  readonly membershipId: MembershipId;
  readonly defaultTaskStatusId: TaskStatusId;
  readonly ownerPrincipalId: PrincipalId;
  readonly name: string;
  readonly timezone: string;
  readonly occurredAt: string;
}

export interface CreatedLocalWorkspace {
  readonly workspace: Workspace;
  readonly rootSpace: Space;
  readonly ownerMembership: WorkspaceMembership;
  readonly defaultTaskStatus: TaskStatusDefinition;
}

export const createLocalWorkspace = (
  input: CreateLocalWorkspaceInput,
): CreatedLocalWorkspace => ({
  workspace: {
    id: input.workspaceId,
    name: input.name,
    timezone: input.timezone,
    rootSpaceId: input.rootSpaceId,
    defaultTaskStatusId: input.defaultTaskStatusId,
    policyVersion: 1,
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
    displayName: "Workspace owner",
    status: "active",
    version: 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  },
  defaultTaskStatus: createDefaultTaskStatus({
    id: input.defaultTaskStatusId,
    workspaceId: input.workspaceId,
    occurredAt: input.occurredAt,
  }),
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
