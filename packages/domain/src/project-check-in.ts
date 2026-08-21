import type {
  AgentRunId,
  GrantId,
  KnowledgeSourceId,
  PrincipalId,
  PrincipalKind,
  ProjectCheckInId,
  ProjectCheckInReference,
  ProjectId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type { ProjectCheckIn } from "./model.js";

export const createProjectCheckIn = (input: {
  readonly id: ProjectCheckInId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly projectId: ProjectId;
  readonly summary: string;
  readonly waitingOn?: string;
  readonly nextCheckpointAt?: string;
  readonly evidenceSourceIds: readonly KnowledgeSourceId[];
  readonly references: readonly ProjectCheckInReference[];
  readonly supersedesCheckInId?: ProjectCheckInId;
  readonly authorPrincipalId: PrincipalId;
  readonly authorPrincipalKind?: PrincipalKind;
  readonly authorGrantId?: GrantId;
  readonly agentRunId?: AgentRunId;
  readonly hostRunId?: string;
  readonly createdAt: string;
}): ProjectCheckIn => ({
  id: input.id,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  projectId: input.projectId,
  summary: input.summary,
  ...(input.waitingOn === undefined ? {} : { waitingOn: input.waitingOn }),
  ...(input.nextCheckpointAt === undefined
    ? {}
    : { nextCheckpointAt: input.nextCheckpointAt }),
  evidenceSourceIds: [...input.evidenceSourceIds].sort(),
  references: [...input.references].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.recordId.localeCompare(right.recordId),
  ),
  ...(input.supersedesCheckInId === undefined
    ? {}
    : { supersedesCheckInId: input.supersedesCheckInId }),
  state: "active",
  authorPrincipalId: input.authorPrincipalId,
  ...(input.authorPrincipalKind === undefined
    ? {}
    : { authorPrincipalKind: input.authorPrincipalKind }),
  ...(input.authorGrantId === undefined
    ? {}
    : { authorGrantId: input.authorGrantId }),
  ...(input.agentRunId === undefined ? {} : { agentRunId: input.agentRunId }),
  ...(input.hostRunId === undefined ? {} : { hostRunId: input.hostRunId }),
  version: 1,
  createdAt: input.createdAt,
});

export const voidProjectCheckIn = (
  checkIn: ProjectCheckIn,
  principalId: PrincipalId,
  occurredAt: string,
): ProjectCheckIn => ({
  ...checkIn,
  state: "voided",
  voidedBy: principalId,
  voidedAt: occurredAt,
  version: checkIn.version + 1,
});
