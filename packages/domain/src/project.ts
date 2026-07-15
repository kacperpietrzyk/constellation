import type {
  PrincipalId,
  ProjectId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type { Project } from "./model.js";

export const createProject = (input: {
  readonly id: ProjectId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly title: string;
  readonly intendedOutcome: string;
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): Project => ({
  id: input.id,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  title: input.title,
  intendedOutcome: input.intendedOutcome,
  lifecycle: "active",
  createdBy: input.createdBy,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const updateProjectOutcome = (
  project: Project,
  intendedOutcome: string,
  occurredAt: string,
): Project => ({
  ...project,
  intendedOutcome,
  version: project.version + 1,
  updatedAt: occurredAt,
});

export const closeProject = (
  project: Project,
  principalId: PrincipalId,
  occurredAt: string,
): Project => ({
  ...project,
  lifecycle: "closed",
  closedAt: occurredAt,
  closedBy: principalId,
  version: project.version + 1,
  updatedAt: occurredAt,
});

export const reopenProject = (
  project: Project,
  occurredAt: string,
): Project => {
  const opened: Omit<Project, "closedAt" | "closedBy"> & {
    closedAt?: string;
    closedBy?: PrincipalId;
  } = { ...project };
  delete opened.closedAt;
  delete opened.closedBy;
  return {
    ...opened,
    lifecycle: "active",
    version: project.version + 1,
    updatedAt: occurredAt,
  };
};
