import type {
  KnowledgeSourceId,
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
  readonly intendedOutcome?: string;
  readonly evidenceSourceIds?: readonly KnowledgeSourceId[];
  readonly externalId?: string;
  readonly createdBy: PrincipalId;
  readonly occurredAt: string;
}): Project => ({
  id: input.id,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  title: input.title,
  ...(input.intendedOutcome === undefined
    ? {}
    : { intendedOutcome: input.intendedOutcome }),
  ...(input.evidenceSourceIds === undefined ||
  input.evidenceSourceIds.length === 0
    ? {}
    : { evidenceSourceIds: [...new Set(input.evidenceSourceIds)].sort() }),
  ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
  lifecycle: "active",
  createdBy: input.createdBy,
  version: 1,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
});

export const updateProjectOutcome = (
  project: Project,
  intendedOutcome: string | undefined,
  occurredAt: string,
  // Absent leaves the Project's provenance alone; an explicit list replaces it,
  // and an explicit empty list clears it.
  evidenceSourceIds?: readonly KnowledgeSourceId[],
): Project => {
  const {
    intendedOutcome: _prior,
    evidenceSourceIds: _priorSources,
    ...rest
  } = project;
  void _prior;
  void _priorSources;
  const sources = evidenceSourceIds ?? project.evidenceSourceIds;
  return {
    ...rest,
    ...(intendedOutcome === undefined ? {} : { intendedOutcome }),
    ...(sources === undefined || sources.length === 0
      ? {}
      : { evidenceSourceIds: [...new Set(sources)].sort() }),
    version: project.version + 1,
    updatedAt: occurredAt,
  };
};

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
