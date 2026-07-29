import {
  type MembershipId,
  type PrincipalId,
  type SpaceId,
  type TaskStatusId,
  type WorkspaceId,
  DEFAULT_WORKING_DAY,
} from "@constellation/contracts";

import {
  type Space,
  type TaskStatusDefinition,
  type WorkingDay,
  type Workspace,
  type WorkspaceMembership,
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
    voiceAudioRetentionPolicy: "delete_after_transcript",
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

/**
 * Dzień roboczy, którego workspace faktycznie używa. Jedyne miejsce, w którym
 * wolno sięgnąć po wartość domyślną — czytający dostaje ją już wyliczoną.
 */
export const effectiveWorkingDay = (workspace: Workspace): WorkingDay =>
  workspace.workingDay ?? DEFAULT_WORKING_DAY;

/** Ile minut liczy dzień roboczy — pojemność, od której odejmuje się zajęte. */
export const workingDayMinutes = (workingDay: WorkingDay): number =>
  workingDay.endMinute - workingDay.startMinute;

/** Czy ten dzień tygodnia (ISO, 1 = poniedziałek) jest w ogóle roboczy. */
export const isWorkingWeekday = (
  workingDay: WorkingDay,
  isoWeekday: number,
): boolean => workingDay.weekdays.includes(isoWeekday);

export const setWorkspaceWorkingDay = (
  workspace: Workspace,
  workingDay: WorkingDay,
  occurredAt: string,
): Workspace => ({
  ...workspace,
  workingDay,
  version: workspace.version + 1,
  updatedAt: occurredAt,
});

export const setWorkspaceVoiceAudioRetention = (
  workspace: Workspace,
  voiceAudioRetentionPolicy: "delete_after_transcript" | "retain",
  occurredAt: string,
): Workspace => ({
  ...workspace,
  voiceAudioRetentionPolicy,
  version: workspace.version + 1,
  updatedAt: occurredAt,
});
