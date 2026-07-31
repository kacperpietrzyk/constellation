import {
  type MembershipId,
  type PrincipalId,
  type SpaceId,
  type TaskStatusId,
  type WorkspaceId,
  type Currency,
  DEFAULT_WORKING_DAY,
  DEFAULT_CURRENCIES,
  DEFAULT_HOME_CURRENCY,
  DEFAULT_MARKUP_PCT,
  DEFAULT_PIPELINE_STAGES,
  DEFAULT_UPLIFT_PCT,
} from "@constellation/contracts";

import {
  type CommercialDefaults,
  type PipelineStage,
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

/**
 * Ustawienia handlowe, których workspace faktycznie używa. Jedyne miejsce, w
 * którym wolno sięgnąć po wartość domyślną — czytający dostaje ją już
 * wyliczoną, tak samo jak dzień roboczy. Etapy jadą posortowane, bo kolejność
 * kolumn nie jest opinią odczytu.
 */
export const effectiveCommercialDefaults = (
  workspace: Workspace,
): CommercialDefaults => ({
  stages: [...(workspace.pipelineStages ?? DEFAULT_PIPELINE_STAGES)].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  ),
  markupPct: workspace.markupPct ?? DEFAULT_MARKUP_PCT,
  upliftPct: workspace.upliftPct ?? DEFAULT_UPLIFT_PCT,
  homeCurrency: workspace.homeCurrency ?? DEFAULT_HOME_CURRENCY,
  // Kopia, nie ta sama tablica: projekcja nie oddaje na zewnątrz referencji do
  // tego, co siedzi w rekordzie — dokładnie jak etapy wyżej.
  currencies: [...(workspace.currencies ?? DEFAULT_CURRENCIES)],
});

/**
 * Poprawka, nie podmiana: pole nieobecne zostaje jak było, a jawny `null`
 * kasuje — czyli wraca do wartości domyślnej. Ten sam kontrakt co
 * `updateOrganizationDetails`, i z tego samego powodu: kto poprawia marżę, nie
 * ma przepisywać listy etapów, której nawet nie wymienił.
 *
 * `| null` jest TYLKO tutaj, nie w komendzie: żaden wywołujący nie prosi o
 * „skasuj ustawienie", ale cofnięcie komendy, która ustawienie ZAŁOŻYŁA, musi
 * je zdjąć. Kompensacja nie jest komendą, więc helper wyraża to, czego kontrakt
 * nie wyraża.
 */
export const setWorkspaceCommercialDefaults = (
  workspace: Workspace,
  changes: {
    readonly pipelineStages?: readonly PipelineStage[] | null;
    readonly markupPct?: number | null;
    readonly upliftPct?: number | null;
    readonly homeCurrency?: Currency | null;
    readonly currencies?: readonly Currency[] | null;
  },
  occurredAt: string,
): Workspace => {
  const {
    pipelineStages: _pipelineStages,
    markupPct: _markupPct,
    upliftPct: _upliftPct,
    homeCurrency: _homeCurrency,
    currencies: _currencies,
    ...base
  } = workspace;
  void _pipelineStages;
  void _markupPct;
  void _upliftPct;
  void _homeCurrency;
  void _currencies;
  const pipelineStages =
    changes.pipelineStages === undefined
      ? workspace.pipelineStages
      : (changes.pipelineStages ?? undefined);
  const markupPct =
    changes.markupPct === undefined
      ? workspace.markupPct
      : (changes.markupPct ?? undefined);
  const upliftPct =
    changes.upliftPct === undefined
      ? workspace.upliftPct
      : (changes.upliftPct ?? undefined);
  const homeCurrency =
    changes.homeCurrency === undefined
      ? workspace.homeCurrency
      : (changes.homeCurrency ?? undefined);
  const currencies =
    changes.currencies === undefined
      ? workspace.currencies
      : (changes.currencies ?? undefined);
  return {
    ...base,
    ...(pipelineStages === undefined ? {} : { pipelineStages }),
    ...(markupPct === undefined ? {} : { markupPct }),
    ...(upliftPct === undefined ? {} : { upliftPct }),
    ...(homeCurrency === undefined ? {} : { homeCurrency }),
    ...(currencies === undefined ? {} : { currencies }),
    version: workspace.version + 1,
    updatedAt: occurredAt,
  };
};

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
