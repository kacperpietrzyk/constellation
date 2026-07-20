import {
  CalendarBlockDraftSchema,
  CalendarEventProjectionSchema,
  FactualMeetingBriefSchema,
  JamieApiMeetingSchema,
  JamieApiTaskSchema,
  MeetingWorkItemResponsibilityOverrideSchema,
  MeetingLoopSurfaceSchema,
  NormalizedJamieMeetingSchema,
  type CalendarBlockDraft,
  type CalendarCapability,
  type CalendarEventProjection,
  type CalendarWritePreview,
  type FactualMeetingBrief,
  type ImportedMeeting,
  type MeetingEvidence,
  type MeetingImportOutcome,
  type MeetingLoopSurface,
  type MeetingWorkItem,
  type NormalizedJamieMeeting,
  type PrincipalId,
  type SpaceId,
  type WorkspaceId,
} from "@constellation/contracts";

export const normalizeJamieApiMeeting = (input: {
  readonly connectionId: string;
  readonly meeting: unknown;
  readonly tasks: readonly unknown[];
  readonly tasksComplete?: boolean;
  readonly receivedAt: string;
  readonly hasher: MeetingLoopHasher;
}): NormalizedJamieMeeting | undefined => {
  const meeting = JamieApiMeetingSchema.safeParse(input.meeting);
  const tasks = input.tasks.map((task) => JamieApiTaskSchema.safeParse(task));
  if (!meeting.success || tasks.some((task) => !task.success)) return undefined;
  const stableTasks = tasks
    .flatMap((task) => (task.success ? [task.data] : []))
    .filter((task) => task.meetingId === meeting.data.id);
  const normalizedContent = {
    schemaVersion: 1 as const,
    connectionId: input.connectionId,
    externalMeetingId: meeting.data.id,
    title: meeting.data.generatedTitle ?? meeting.data.title,
    startedAt: meeting.data.startTime,
    ...(meeting.data.endTime === null ? {} : { endedAt: meeting.data.endTime }),
    ...(meeting.data.event === null ||
    meeting.data.event === undefined ||
    meeting.data.event.externalId === null
      ? {}
      : { calendarEventId: meeting.data.event.externalId }),
    ...(meeting.data.summary === null || meeting.data.summary === undefined
      ? {}
      : { summaryMarkdown: meeting.data.summary.markdown }),
    ...(meeting.data.transcript === null ||
    meeting.data.transcript === undefined ||
    meeting.data.transcriptInfo?.truncated === true
      ? {}
      : { transcriptMarkdown: meeting.data.transcript }),
    participants: meeting.data.participants.map((participant) => ({
      externalId: participant.id,
      name: participant.name,
      ...(participant.email === null ? {} : { email: participant.email }),
    })),
    actionItems:
      stableTasks.length > 0
        ? stableTasks.map((task) => ({
            externalTaskId: task.id,
            content: task.text,
            completed: task.completed,
            ...(task.assignee === null
              ? {}
              : {
                  assigneeName: task.assignee.name,
                  ...(task.assignee.email === null
                    ? {}
                    : { assigneeEmail: task.assignee.email }),
                }),
          }))
        : meeting.data.tasks.map((task) => ({
            content: task.content,
            completed: task.completed,
            ...(task.assignee === null
              ? {}
              : {
                  assigneeName: task.assignee.name,
                  ...(task.assignee.email === null
                    ? {}
                    : { assigneeEmail: task.assignee.email }),
                }),
          })),
    actionItemsComplete: input.tasksComplete ?? true,
    decisions: [],
  };
  return NormalizedJamieMeetingSchema.parse({
    ...normalizedContent,
    receivedAt: input.receivedAt,
    contentHash: input.hasher.fingerprint(normalizedContent),
  });
};

export interface MeetingLoopAuthorization {
  readonly workspaceId: WorkspaceId;
  readonly principalId: PrincipalId;
  readonly readableSpaceIds: readonly SpaceId[];
  readonly editableSpaceIds: readonly SpaceId[];
  readonly canImportJamie: boolean;
  readonly canWriteCalendar: boolean;
}

export interface CalendarReadResult {
  readonly capability: CalendarCapability;
  readonly events: readonly CalendarEventProjection[];
  readonly freshness: "current" | "partial" | "offline";
}

export interface CalendarReader {
  readUpcoming(input: {
    readonly from: string;
    readonly to: string;
  }): Promise<CalendarReadResult>;
}

export interface CalendarWriter {
  writeOwnedBlocks(input: {
    readonly blocks: readonly CalendarBlockDraft[];
  }): Promise<
    | { readonly outcome: "applied"; readonly revisions: readonly string[] }
    | {
        readonly outcome: "rejected";
        readonly code:
          | "permission_denied"
          | "provider_unavailable"
          | "offline"
          | "stale_revision"
          | "provider_error";
      }
  >;
}

export interface MeetingEvidenceReader {
  listAuthorizedEvidence(input: {
    readonly workspaceId: WorkspaceId;
    readonly spaceIds: readonly SpaceId[];
    readonly event: CalendarEventProjection;
  }): readonly MeetingEvidence[];
}

export interface MeetingLoopClock {
  now(): string;
}

export interface MeetingLoopIds {
  uuid(seed: string): string;
  opaqueToken(): string;
}

export interface MeetingLoopHasher {
  fingerprint(value: unknown): string;
}

export interface MeetingImportReceipt {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly externalMeetingIdHash: string;
  readonly outcome:
    | "applied"
    | "no_change"
    | "corrected"
    | "partial"
    | "conflicted"
    | "rejected";
  readonly changedRecordIds: readonly string[];
  readonly occurredAt: string;
}

export interface MeetingLoopState {
  readonly revision: number;
  readonly meetings: readonly ImportedMeeting[];
  readonly previews: readonly CalendarWritePreview[];
  readonly receipts: readonly MeetingImportReceipt[];
  readonly audits: readonly MeetingWorkAudit[];
}

export interface MeetingWorkAudit {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly principalId: PrincipalId;
  readonly meetingId: string;
  readonly workItemId: string;
  readonly action: "created" | "edited";
  readonly fromVersion?: number;
  readonly toVersion: number;
  readonly occurredAt: string;
}

export interface MeetingLoopRepository {
  load(workspaceId: WorkspaceId): MeetingLoopState;
  save(
    workspaceId: WorkspaceId,
    expectedRevision: number,
    state: MeetingLoopState,
  ): boolean;
}

const emptyState = (): MeetingLoopState => ({
  revision: 0,
  meetings: [],
  previews: [],
  receipts: [],
  audits: [],
});

export class MemoryMeetingLoopRepository implements MeetingLoopRepository {
  private readonly states = new Map<WorkspaceId, MeetingLoopState>();

  private clone(state: MeetingLoopState): MeetingLoopState {
    return JSON.parse(JSON.stringify(state)) as MeetingLoopState;
  }

  public load(workspaceId: WorkspaceId): MeetingLoopState {
    return this.clone(this.states.get(workspaceId) ?? emptyState());
  }

  public save(
    workspaceId: WorkspaceId,
    expectedRevision: number,
    state: MeetingLoopState,
  ): boolean {
    const current = this.states.get(workspaceId) ?? emptyState();
    if (current.revision !== expectedRevision) return false;
    this.states.set(workspaceId, this.clone(state));
    return true;
  }
}

const stableUuid = (digest: string): string => {
  const value = digest.padEnd(32, "0").slice(0, 32).split("");
  value[12] = "4";
  value[16] =
    ["8", "9", "a", "b"][Number.parseInt(value[16] ?? "0", 16) % 4] ?? "8";
  const compact = value.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
};

const sortedEvidence = (
  values: readonly MeetingEvidence[],
): MeetingEvidence[] =>
  [...values].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.recordId.localeCompare(right.recordId),
  );

const factualBrief = (
  event: CalendarEventProjection,
  evidence: readonly MeetingEvidence[],
  now: string,
): FactualMeetingBrief => {
  const sorted = sortedEvidence(evidence);
  return FactualMeetingBriefSchema.parse({
    eventExternalId: event.eventExternalId,
    orientation: sorted
      .filter(
        (item) => item.kind === "project" || item.kind === "prior_meeting",
      )
      .slice(0, 8),
    openLoops: sorted
      .filter((item) => item.kind === "task" || item.kind === "waiting")
      .slice(0, 8),
    relevantSources: sorted
      .filter((item) => item.kind === "decision" || item.kind === "note")
      .slice(0, 8),
    generatedAt: now,
    deterministic: true,
  });
};

const sameSourceKey = (
  meeting: ImportedMeeting,
  source: NormalizedJamieMeeting,
): boolean =>
  meeting.connectionId === source.connectionId &&
  meeting.externalMeetingId === source.externalMeetingId;

const sourceItems = (
  source: NormalizedJamieMeeting,
  meetingId: string,
  ids: MeetingLoopIds,
): readonly MeetingWorkItem[] => [
  ...source.actionItems
    .filter((item) => item.externalTaskId !== undefined)
    .map((item) => ({
      id: ids.uuid(`${meetingId}:task:${item.externalTaskId}`),
      kind: "task" as const,
      sourceExternalId: item.externalTaskId!,
      title: item.content,
      state: item.completed ? ("completed" as const) : ("open" as const),
      sourceControlled: true,
      locallyModified: false,
      ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
      ...(item.assigneeName === undefined
        ? {}
        : {
            assignee: {
              name: item.assigneeName,
              ...(item.assigneeEmail === undefined
                ? {}
                : { email: item.assigneeEmail }),
            },
          }),
      version: 1,
    })),
  ...source.decisions.map((decision) => ({
    id: ids.uuid(`${meetingId}:decision:${decision.externalId}`),
    kind: "decision" as const,
    sourceExternalId: decision.externalId,
    title: decision.text,
    state: "open" as const,
    sourceControlled: true,
    locallyModified: false,
    version: 1,
  })),
];

const sameAssignee = (
  left: MeetingWorkItem["assignee"],
  right: MeetingWorkItem["assignee"],
): boolean => left?.name === right?.name && left?.email === right?.email;

// `dueAt` is Jamie-owned content: it refreshes from source and clears when the
// source drops it, unlike the workspace-owned `taskId` beside it (ADR-040 §5).
const withSourceDue = (
  item: MeetingWorkItem,
  dueAt: string | undefined,
): MeetingWorkItem => {
  const { dueAt: _prior, ...rest } = item;
  void _prior;
  return dueAt === undefined ? rest : { ...rest, dueAt };
};

const withSourceAssignee = (
  item: MeetingWorkItem,
  assignee: MeetingWorkItem["assignee"],
): MeetingWorkItem => {
  const withoutAssignee = { ...item };
  delete withoutAssignee.assignee;
  return assignee === undefined
    ? withoutAssignee
    : { ...withoutAssignee, assignee };
};

const sourceProjectionIsCurrent = (
  current: readonly MeetingWorkItem[],
  incoming: readonly MeetingWorkItem[],
): boolean => {
  const incomingKeys = new Set(
    incoming.map((item) => `${item.kind}:${item.sourceExternalId}`),
  );
  const incomingMatches = incoming.every((source) => {
    const prior = current.find(
      (item) =>
        item.kind === source.kind &&
        item.sourceExternalId === source.sourceExternalId,
    );
    if (prior === undefined || !sameAssignee(prior.assignee, source.assignee))
      return false;
    return (
      prior.locallyModified ||
      (prior.title === source.title &&
        prior.state === source.state &&
        prior.dueAt === source.dueAt)
    );
  });
  if (!incomingMatches) return false;
  return current.every(
    (item) =>
      !item.sourceControlled ||
      incomingKeys.has(`${item.kind}:${item.sourceExternalId}`) ||
      item.locallyModified ||
      item.state === "withdrawn",
  );
};

const reconcileItems = (
  current: readonly MeetingWorkItem[],
  incoming: readonly MeetingWorkItem[],
  preserveLocalModifications = false,
): {
  readonly items: readonly MeetingWorkItem[];
  readonly conflicts: boolean;
} => {
  const next: MeetingWorkItem[] = [];
  let conflicts = false;
  for (const source of incoming) {
    const prior = current.find(
      (item) =>
        item.kind === source.kind &&
        item.sourceExternalId === source.sourceExternalId,
    );
    if (prior === undefined) {
      next.push(source);
      continue;
    }
    if (preserveLocalModifications && prior.locallyModified) {
      next.push({
        ...withSourceAssignee(prior, source.assignee),
        version: sameAssignee(prior.assignee, source.assignee)
          ? prior.version
          : prior.version + 1,
      });
      continue;
    }
    if (prior.locallyModified && prior.title !== source.title) {
      conflicts = true;
      next.push({
        ...withSourceAssignee(prior, source.assignee),
        state: "conflicted",
        sourceValueInConflict: source.title,
        version: prior.version + 1,
      });
      continue;
    }
    // A locally modified item keeps its own lifecycle. Completing a follow-up
    // here and then receiving an unrelated Jamie correction must not silently
    // reopen it: the title conflict above only catches divergent text, so
    // without this a local completion was lost with no conflict raised.
    // Source still owns the descriptive fields.
    const nextState = prior.locallyModified ? prior.state : source.state;
    next.push({
      ...withSourceDue(
        withSourceAssignee(prior, source.assignee),
        source.dueAt,
      ),
      title: source.title,
      state: nextState,
      version:
        prior.title === source.title &&
        prior.state === nextState &&
        prior.dueAt === source.dueAt &&
        sameAssignee(prior.assignee, source.assignee)
          ? prior.version
          : prior.version + 1,
    });
  }
  for (const prior of current) {
    if (
      incoming.some(
        (item) =>
          item.kind === prior.kind &&
          item.sourceExternalId === prior.sourceExternalId,
      )
    ) {
      continue;
    }
    next.push(
      prior.locallyModified
        ? prior
        : { ...prior, state: "withdrawn", version: prior.version + 1 },
    );
  }
  return { items: next.sort((a, b) => a.id.localeCompare(b.id)), conflicts };
};

export class MeetingLoopService {
  public constructor(
    private readonly dependencies: {
      readonly calendarReader: CalendarReader;
      readonly calendarWriter: CalendarWriter;
      readonly clock: MeetingLoopClock;
      readonly evidence: MeetingEvidenceReader;
      readonly hasher: MeetingLoopHasher;
      readonly ids: MeetingLoopIds;
      readonly repository: MeetingLoopRepository;
    },
  ) {}

  public async surface(input: {
    readonly authorization: MeetingLoopAuthorization;
    readonly from: string;
    readonly to: string;
  }): Promise<MeetingLoopSurface> {
    const calendar = await this.dependencies.calendarReader.readUpcoming({
      from: input.from,
      to: input.to,
    });
    const now = this.dependencies.clock.now();
    const upcoming = calendar.events.map((rawEvent) => {
      const event = CalendarEventProjectionSchema.parse(rawEvent);
      return {
        event,
        brief: factualBrief(
          event,
          this.dependencies.evidence.listAuthorizedEvidence({
            workspaceId: input.authorization.workspaceId,
            spaceIds: input.authorization.readableSpaceIds,
            event,
          }),
          now,
        ),
      };
    });
    const state = this.dependencies.repository.load(
      input.authorization.workspaceId,
    );
    return MeetingLoopSurfaceSchema.parse({
      capability: calendar.capability,
      upcoming,
      completed: state.meetings,
      freshness: calendar.freshness,
      generatedAt: now,
    });
  }

  public importJamie(input: {
    readonly authorization: MeetingLoopAuthorization;
    readonly spaceId: SpaceId;
    readonly source: unknown;
  }): MeetingImportOutcome {
    const parsed = NormalizedJamieMeetingSchema.safeParse(input.source);
    if (!parsed.success)
      return { outcome: "rejected", code: "contract_invalid" };
    if (
      !input.authorization.canImportJamie ||
      !input.authorization.editableSpaceIds.includes(input.spaceId)
    ) {
      return { outcome: "rejected", code: "unauthorized" };
    }
    const source = parsed.data;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const state = this.dependencies.repository.load(
        input.authorization.workspaceId,
      );
      const current = state.meetings.find((meeting) =>
        sameSourceKey(meeting, source),
      );
      const now = this.dependencies.clock.now();
      const meetingId =
        current?.id ??
        this.dependencies.ids.uuid(
          `${input.authorization.workspaceId}:jamie:${source.connectionId}:${source.externalMeetingId}`,
        );
      const missingComponents =
        !source.actionItemsComplete ||
        source.actionItems.some((item) => item.externalTaskId === undefined)
          ? (["action_items"] as const)
          : ([] as const);
      const incomingItems = sourceItems(
        source,
        meetingId,
        this.dependencies.ids,
      );
      if (
        current?.contentHash === source.contentHash &&
        sourceProjectionIsCurrent(current.workItems, incomingItems)
      ) {
        this.appendReceipt(input.authorization.workspaceId, state, {
          source,
          outcome: "no_change",
          changedRecordIds: [],
        });
        return { outcome: "no_change", meeting: current };
      }
      const reconciled = reconcileItems(
        current?.workItems ?? [],
        incomingItems,
        current?.contentHash === source.contentHash,
      );
      const triage = reconciled.conflicts
        ? "conflicted"
        : missingComponents.length > 0
          ? "partial"
          : "ready";
      const meeting: ImportedMeeting = {
        id: meetingId,
        workspaceId: input.authorization.workspaceId,
        // An already-imported meeting keeps the Space it was routed to; the
        // caller's Space is only the placement for a first import (ADR-040 §5).
        spaceId: current?.spaceId ?? input.spaceId,
        connectionId: source.connectionId,
        externalMeetingId: source.externalMeetingId,
        title: source.title,
        startedAt: source.startedAt,
        ...(source.endedAt === undefined ? {} : { endedAt: source.endedAt }),
        ...(source.calendarEventId === undefined
          ? {}
          : { calendarEventId: source.calendarEventId }),
        ...(source.summaryMarkdown === undefined
          ? {}
          : { summaryMarkdown: source.summaryMarkdown }),
        ...(source.transcriptMarkdown === undefined
          ? {}
          : { transcriptMarkdown: source.transcriptMarkdown }),
        // ADR-040 §5: local graph references are workspace-owned. Jamie owns
        // meeting content; it must never clear routing or identity links.
        // Participants reconcile by externalId so a linked person survives a
        // corrected re-delivery, while name/email refresh from source.
        participants: source.participants.map((participant) => {
          const linked = current?.participants.find(
            (prior) =>
              prior.externalId === participant.externalId &&
              prior.personId !== undefined,
          );
          return linked === undefined
            ? participant
            : { ...participant, personId: linked.personId };
        }),
        ...(current?.projectId === undefined
          ? {}
          : { projectId: current.projectId }),
        ...(current?.organizationId === undefined
          ? {}
          : { organizationId: current.organizationId }),
        workItems: [...reconciled.items],
        contentHash: source.contentHash,
        triage,
        missingComponents: [...missingComponents],
        version: (current?.version ?? 0) + 1,
        updatedAt: now,
      };
      const outcome =
        triage === "conflicted"
          ? "conflicted"
          : triage === "partial"
            ? "partial"
            : current === undefined
              ? "applied"
              : "corrected";
      const next: MeetingLoopState = {
        revision: state.revision + 1,
        meetings: [
          ...state.meetings.filter((item) => item.id !== meeting.id),
          meeting,
        ].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        previews: state.previews,
        receipts: [
          ...state.receipts,
          this.receipt(input.authorization.workspaceId, source, outcome, [
            meeting.id,
            ...meeting.workItems.map((item) => item.id),
          ]),
        ],
        audits: state.audits,
      };
      if (
        this.dependencies.repository.save(
          input.authorization.workspaceId,
          state.revision,
          next,
        )
      ) {
        return { outcome, meeting };
      }
    }
    return { outcome: "rejected", code: "workspace_mismatch" };
  }

  public editWorkItem(input: {
    readonly authorization: MeetingLoopAuthorization;
    readonly meetingId: string;
    readonly workItemId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly state: MeetingWorkItem["state"];
  }): ImportedMeeting | undefined {
    const state = this.dependencies.repository.load(
      input.authorization.workspaceId,
    );
    const meeting = state.meetings.find((item) => item.id === input.meetingId);
    if (
      meeting === undefined ||
      !input.authorization.editableSpaceIds.includes(meeting.spaceId)
    )
      return undefined;
    const item = meeting.workItems.find(
      (value) => value.id === input.workItemId,
    );
    if (item?.version !== input.expectedVersion) return undefined;
    const workItems = meeting.workItems.map((value): MeetingWorkItem => {
      if (value.id !== item.id) return value;
      const acceptedSource =
        value.sourceValueInConflict !== undefined &&
        input.title.trim() === value.sourceValueInConflict;
      return {
        ...value,
        title: input.title.trim(),
        state: input.state,
        sourceControlled: acceptedSource,
        locallyModified: !acceptedSource,
        sourceValueInConflict: undefined,
        version: value.version + 1,
      };
    });
    const updated: ImportedMeeting = {
      ...meeting,
      workItems,
      triage: workItems.some((value) => value.state === "conflicted")
        ? "conflicted"
        : meeting.missingComponents.length > 0
          ? "partial"
          : "ready",
      version: meeting.version + 1,
      updatedAt: this.dependencies.clock.now(),
    };
    const next = {
      ...state,
      revision: state.revision + 1,
      meetings: state.meetings.map((value) =>
        value.id === meeting.id ? updated : value,
      ),
      audits: [
        ...state.audits,
        this.workAudit({
          authorization: input.authorization,
          meetingId: meeting.id,
          workItemId: item.id,
          action: "edited",
          fromVersion: item.version,
          toVersion: item.version + 1,
        }),
      ],
    };
    return this.dependencies.repository.save(
      input.authorization.workspaceId,
      state.revision,
      next,
    )
      ? updated
      : undefined;
  }

  public correctWorkItemResponsibility(input: {
    readonly authorization: MeetingLoopAuthorization;
    readonly meetingId: string;
    readonly workItemId: string;
    readonly expectedVersion: number;
    readonly name?: string;
  }): ImportedMeeting | undefined {
    const override =
      input.name === undefined
        ? undefined
        : MeetingWorkItemResponsibilityOverrideSchema.safeParse({
            name: input.name,
          });
    if (override !== undefined && !override.success) return undefined;
    const state = this.dependencies.repository.load(
      input.authorization.workspaceId,
    );
    const meeting = state.meetings.find((item) => item.id === input.meetingId);
    if (
      meeting === undefined ||
      !input.authorization.editableSpaceIds.includes(meeting.spaceId)
    )
      return undefined;
    const item = meeting.workItems.find(
      (value) => value.id === input.workItemId,
    );
    if (
      item?.version !== input.expectedVersion ||
      item.kind === "decision" ||
      item.kind === "note"
    )
      return undefined;
    const workItems = meeting.workItems.map((value): MeetingWorkItem => {
      if (value.id !== item.id) return value;
      const next = { ...value };
      if (override === undefined) delete next.responsibilityOverride;
      else next.responsibilityOverride = override.data;
      return { ...next, version: value.version + 1 };
    });
    const updated: ImportedMeeting = {
      ...meeting,
      workItems,
      version: meeting.version + 1,
      updatedAt: this.dependencies.clock.now(),
    };
    const next: MeetingLoopState = {
      ...state,
      revision: state.revision + 1,
      meetings: state.meetings.map((value) =>
        value.id === meeting.id ? updated : value,
      ),
      audits: [
        ...state.audits,
        this.workAudit({
          authorization: input.authorization,
          meetingId: meeting.id,
          workItemId: item.id,
          action: "edited",
          fromVersion: item.version,
          toVersion: item.version + 1,
        }),
      ],
    };
    return this.dependencies.repository.save(
      input.authorization.workspaceId,
      state.revision,
      next,
    )
      ? updated
      : undefined;
  }

  public addWorkItem(input: {
    readonly authorization: MeetingLoopAuthorization;
    readonly meetingId: string;
    readonly requestId: string;
    readonly kind: MeetingWorkItem["kind"];
    readonly title: string;
  }): ImportedMeeting | undefined {
    const state = this.dependencies.repository.load(
      input.authorization.workspaceId,
    );
    const meeting = state.meetings.find((item) => item.id === input.meetingId);
    if (
      meeting === undefined ||
      !input.authorization.editableSpaceIds.includes(meeting.spaceId) ||
      input.title.trim().length === 0
    )
      return undefined;
    const workItemId = this.dependencies.ids.uuid(
      `${input.authorization.workspaceId}:meeting-work:${input.requestId}`,
    );
    if (meeting.workItems.some((item) => item.id === workItemId))
      return meeting;
    const item: MeetingWorkItem = {
      id: workItemId,
      kind: input.kind,
      sourceExternalId: `local:${input.requestId}`,
      title: input.title.trim(),
      state: "open",
      sourceControlled: false,
      locallyModified: true,
      version: 1,
    };
    const updated: ImportedMeeting = {
      ...meeting,
      workItems: [...meeting.workItems, item],
      version: meeting.version + 1,
      updatedAt: this.dependencies.clock.now(),
    };
    return this.dependencies.repository.save(
      input.authorization.workspaceId,
      state.revision,
      {
        ...state,
        revision: state.revision + 1,
        meetings: state.meetings.map((value) =>
          value.id === meeting.id ? updated : value,
        ),
        audits: [
          ...state.audits,
          this.workAudit({
            authorization: input.authorization,
            meetingId: meeting.id,
            workItemId,
            action: "created",
            toVersion: 1,
          }),
        ],
      },
    )
      ? updated
      : undefined;
  }

  public previewCalendarWrite(input: {
    readonly authorization: MeetingLoopAuthorization;
    readonly blocks: readonly CalendarBlockDraft[];
  }): CalendarWritePreview | undefined {
    if (!input.authorization.canWriteCalendar) return undefined;
    const blocks = input.blocks.map((block) =>
      CalendarBlockDraftSchema.parse(block),
    );
    const now = this.dependencies.clock.now();
    const previewId = this.dependencies.ids.uuid(
      `${input.authorization.workspaceId}:${input.authorization.principalId}:${now}:${this.dependencies.ids.opaqueToken()}`,
    );
    const exactDigest = this.dependencies.hasher.fingerprint({
      workspaceId: input.authorization.workspaceId,
      principalId: input.authorization.principalId,
      blocks,
    });
    const preview: CalendarWritePreview = {
      previewId,
      consentToken: this.dependencies.ids.opaqueToken(),
      workspaceId: input.authorization.workspaceId,
      principalId: input.authorization.principalId,
      blocks,
      exactDigest,
      expiresAt: new Date(Date.parse(now) + 5 * 60_000).toISOString(),
      state: "pending",
    };
    const state = this.dependencies.repository.load(
      input.authorization.workspaceId,
    );
    const next = {
      ...state,
      revision: state.revision + 1,
      previews: [...state.previews, preview],
    };
    return this.dependencies.repository.save(
      input.authorization.workspaceId,
      state.revision,
      next,
    )
      ? preview
      : undefined;
  }

  public async confirmCalendarWrite(input: {
    readonly authorization: MeetingLoopAuthorization;
    readonly previewId: string;
    readonly consentToken: string;
    readonly blocks: readonly CalendarBlockDraft[];
  }): Promise<
    | { readonly outcome: "applied"; readonly revisions: readonly string[] }
    | {
        readonly outcome: "rejected";
        readonly code:
          | "unauthorized"
          | "missing_preview"
          | "expired"
          | "already_consumed"
          | "altered_preview"
          | "permission_denied"
          | "provider_unavailable"
          | "offline"
          | "stale_revision"
          | "provider_error";
      }
  > {
    if (!input.authorization.canWriteCalendar)
      return { outcome: "rejected", code: "unauthorized" };
    const state = this.dependencies.repository.load(
      input.authorization.workspaceId,
    );
    const preview = state.previews.find(
      (item) => item.previewId === input.previewId,
    );
    if (preview === undefined)
      return { outcome: "rejected", code: "missing_preview" };
    if (preview.state !== "pending")
      return { outcome: "rejected", code: "already_consumed" };
    if (
      Date.parse(preview.expiresAt) <= Date.parse(this.dependencies.clock.now())
    ) {
      this.updatePreview(
        state,
        input.authorization.workspaceId,
        preview.previewId,
        "expired",
      );
      return { outcome: "rejected", code: "expired" };
    }
    const exactDigest = this.dependencies.hasher.fingerprint({
      workspaceId: input.authorization.workspaceId,
      principalId: input.authorization.principalId,
      blocks: input.blocks,
    });
    if (
      preview.principalId !== input.authorization.principalId ||
      preview.consentToken !== input.consentToken ||
      preview.exactDigest !== exactDigest
    ) {
      return { outcome: "rejected", code: "altered_preview" };
    }
    // Consume the single-use authority before crossing the provider boundary.
    // If the provider fails or the process stops, the user must create a new
    // preview; a token can never drive the external write twice.
    if (
      !this.updatePreview(
        state,
        input.authorization.workspaceId,
        preview.previewId,
        "consumed",
      )
    ) {
      return { outcome: "rejected", code: "already_consumed" };
    }
    const written = await this.dependencies.calendarWriter.writeOwnedBlocks({
      blocks: input.blocks,
    });
    return written;
  }

  private updatePreview(
    state: MeetingLoopState,
    workspaceId: WorkspaceId,
    previewId: string,
    previewState: CalendarWritePreview["state"],
  ): boolean {
    return this.dependencies.repository.save(workspaceId, state.revision, {
      ...state,
      revision: state.revision + 1,
      previews: state.previews.map((item) =>
        item.previewId === previewId ? { ...item, state: previewState } : item,
      ),
    });
  }

  private receipt(
    workspaceId: WorkspaceId,
    source: NormalizedJamieMeeting,
    outcome: MeetingImportReceipt["outcome"],
    changedRecordIds: readonly string[],
  ): MeetingImportReceipt {
    return {
      id: stableUuid(
        this.dependencies.hasher.fingerprint({
          workspaceId,
          externalMeetingId: source.externalMeetingId,
          receivedAt: source.receivedAt,
          outcome,
        }),
      ),
      workspaceId,
      externalMeetingIdHash: this.dependencies.hasher.fingerprint(
        source.externalMeetingId,
      ),
      outcome,
      changedRecordIds,
      occurredAt: this.dependencies.clock.now(),
    };
  }

  private workAudit(input: {
    readonly authorization: MeetingLoopAuthorization;
    readonly meetingId: string;
    readonly workItemId: string;
    readonly action: MeetingWorkAudit["action"];
    readonly fromVersion?: number;
    readonly toVersion: number;
  }): MeetingWorkAudit {
    const occurredAt = this.dependencies.clock.now();
    return {
      id: stableUuid(
        this.dependencies.hasher.fingerprint({
          principalId: input.authorization.principalId,
          meetingId: input.meetingId,
          workItemId: input.workItemId,
          action: input.action,
          toVersion: input.toVersion,
        }),
      ),
      workspaceId: input.authorization.workspaceId,
      principalId: input.authorization.principalId,
      meetingId: input.meetingId,
      workItemId: input.workItemId,
      action: input.action,
      ...(input.fromVersion === undefined
        ? {}
        : { fromVersion: input.fromVersion }),
      toVersion: input.toVersion,
      occurredAt,
    };
  }

  private appendReceipt(
    workspaceId: WorkspaceId,
    state: MeetingLoopState,
    input: {
      readonly source: NormalizedJamieMeeting;
      readonly outcome: MeetingImportReceipt["outcome"];
      readonly changedRecordIds: readonly string[];
    },
  ): void {
    this.dependencies.repository.save(workspaceId, state.revision, {
      ...state,
      revision: state.revision + 1,
      receipts: [
        ...state.receipts,
        this.receipt(
          workspaceId,
          input.source,
          input.outcome,
          input.changedRecordIds,
        ),
      ],
    });
  }
}
