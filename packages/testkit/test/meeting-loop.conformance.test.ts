import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import {
  MemoryMeetingLoopRepository,
  MeetingLoopService,
  addMeetingWorkItem,
  correctMeetingWorkItemResponsibility,
  editMeetingWorkItem,
  normalizeJamieApiMeeting,
  type CalendarReader,
  type CalendarWriter,
  type MeetingLoopAuthorization,
} from "@constellation/application";
import {
  CalendarCapabilitySchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
  WorkspaceIdSchema,
  type CalendarBlockDraft,
  type ImportedMeeting,
  type NormalizedJamieMeeting,
} from "@constellation/contracts";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);
const spaceId = SpaceIdSchema.parse("00000000-0000-4000-8000-000000000002");
const principalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);

const authorization: MeetingLoopAuthorization = {
  workspaceId,
  principalId,
  readableSpaceIds: [spaceId],
  editableSpaceIds: [spaceId],
  canImportJamie: true,
  canWriteCalendar: true,
};

const fingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const uuid = (seed: string): string => {
  const chars = fingerprint(seed).slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "8";
  const compact = chars.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`;
};

const source = (input: {
  readonly hash: string;
  readonly taskId?: string;
  readonly taskTitle?: string;
  readonly assigneeName?: string;
  readonly assigneeEmail?: string;
}): NormalizedJamieMeeting => ({
  schemaVersion: 1,
  connectionId: "jamie-workspace",
  externalMeetingId: "meeting-42",
  receivedAt: "2026-07-15T10:01:00.000Z",
  title: "Weekly delivery review",
  startedAt: "2026-07-15T09:00:00.000Z",
  endedAt: "2026-07-15T10:00:00.000Z",
  calendarEventId: "event-42",
  summaryMarkdown: "## Summary\nDelivery risks reviewed.",
  participants: [
    { externalId: "participant-1", name: "Alex", email: "alex@example.com" },
  ],
  actionItems: [
    {
      ...(input.taskId === undefined ? {} : { externalTaskId: input.taskId }),
      content: input.taskTitle ?? "Confirm rollout owner",
      completed: false,
      ...(input.assigneeName === undefined
        ? {}
        : { assigneeName: input.assigneeName }),
      ...(input.assigneeEmail === undefined
        ? {}
        : { assigneeEmail: input.assigneeEmail }),
    },
  ],
  actionItemsComplete: true,
  decisions: [{ externalId: "decision-1", text: "Ship behind a feature flag" }],
  contentHash: input.hash,
});

const createHarness = (writer?: CalendarWriter) => {
  let now = "2026-07-15T10:00:00.000Z";
  const repository = new MemoryMeetingLoopRepository();
  const calendarReader: CalendarReader = {
    readUpcoming: async () => ({
      capability: {
        platform: "macos",
        provider: "eventkit",
        availability: "available",
        canRead: true,
        canWriteOwnedBlocks: true,
        detailCode: "ready",
      },
      events: [
        {
          provider: "fixture",
          calendarExternalId: "calendar-1",
          eventExternalId: "event-42",
          revision: "rev-1",
          title: "Weekly delivery review",
          startsAt: "2026-07-16T09:00:00.000Z",
          endsAt: "2026-07-16T10:00:00.000Z",
          isAllDay: false,
          attendees: [],
        },
      ],
      freshness: "current",
    }),
  };
  const service = new MeetingLoopService({
    calendarReader,
    calendarWriter:
      writer ??
      ({
        writeOwnedBlocks: async () => ({
          outcome: "applied",
          revisions: ["rev-2"],
        }),
      } satisfies CalendarWriter),
    clock: { now: () => now },
    evidence: {
      listAuthorizedEvidence: ({ spaceIds }) => [
        {
          kind: "task",
          recordId: "00000000-0000-4000-8000-000000000020",
          spaceId: spaceIds[0]!,
          label: "Confirm rollout owner",
          fact: "Still open",
          updatedAt: "2026-07-15T08:00:00.000Z",
        },
      ],
    },
    hasher: { fingerprint },
    ids: { uuid, opaqueToken: () => randomUUID().replaceAll("-", "") },
    repository,
  });
  /**
   * ADR-047 moved the work-item corrections to kernel commands. These tests
   * are about Jamie reconciliation, not about the envelope, so they apply the
   * same shared transformation the kernel handler applies and persist it the
   * way the kernel's strategic-record write later reaches this state through
   * the store's meeting merge. A refusal stays a refusal: `undefined`.
   */
  const applyLocally = (
    meetingId: string,
    transform: (meeting: ImportedMeeting) => ImportedMeeting | undefined,
  ): ImportedMeeting | undefined => {
    const state = repository.load(workspaceId);
    const meeting = state.meetings.find((item) => item.id === meetingId);
    if (meeting === undefined) return undefined;
    const updated = transform(meeting);
    if (updated === undefined) return undefined;
    return repository.save(workspaceId, state.revision, {
      ...state,
      revision: state.revision + 1,
      meetings: state.meetings.map((item) =>
        item.id === meeting.id ? updated : item,
      ),
    })
      ? updated
      : undefined;
  };
  return {
    service,
    repository,
    applyLocally,
    now: () => now,
    setNow: (value: string) => (now = value),
  };
};

const jamieApiMeeting = {
  id: "meeting-42",
  title: "Delivery review",
  generatedTitle: null,
  startTime: "2026-07-15T09:00:00.000Z",
  endTime: "2026-07-15T10:00:00.000Z",
  summary: {
    markdown: "Summary",
    html: "<p>Summary</p>",
    short: "Summary",
  },
  transcript: "**Alex**\nReady.",
  transcriptInfo: {
    truncated: true,
    totalBytes: 12_000,
    returnedBytes: 10_000,
    nextCursor: "next-page",
    hint: "Read the remaining transcript sequentially.",
  },
  participants: [{ id: "p1", name: "Alex", email: "alex@example.com" }],
  tasks: [{ content: "Fallback task", completed: false, assignee: null }],
  tags: [],
  event: {
    id: "event-internal",
    externalId: "event-external",
    title: "Delivery review",
    scheduledTime: "2026-07-15T09:00:00.000Z",
    endTime: "2026-07-15T10:00:00.000Z",
    attendees: [],
  },
};
const jamieApiTasks = [
  {
    id: "task-stable-1",
    text: "Confirm rollout owner",
    completed: false,
    assignee: { id: "p1", name: "Alex", email: "alex@example.com" },
    meetingId: "meeting-42",
    meetingTitle: "Delivery review",
    createdAt: "2026-07-15T10:00:00.000Z",
    userId: "user-1",
  },
];

test("normalizes the current Jamie API meeting and stable task-list identities", () => {
  const normalized = normalizeJamieApiMeeting({
    connectionId: "jamie-workspace",
    receivedAt: "2026-07-15T10:00:00.000Z",
    hasher: { fingerprint },
    meeting: jamieApiMeeting,
    tasks: jamieApiTasks,
  });
  assert.ok(normalized);
  assert.equal(normalized.calendarEventId, "event-external");
  assert.equal(normalized.actionItems[0]?.externalTaskId, "task-stable-1");
  assert.equal(normalized.transcriptMarkdown, undefined);
  assert.match(normalized.contentHash, /^[a-f0-9]{64}$/);
});

test("Jamie receipt time does not change the semantic content identity", () => {
  const first = normalizeJamieApiMeeting({
    connectionId: "jamie:personal",
    meeting: jamieApiMeeting,
    tasks: jamieApiTasks,
    receivedAt: "2026-07-15T10:00:00.000Z",
    hasher: { fingerprint },
  });
  const retry = normalizeJamieApiMeeting({
    connectionId: "jamie:personal",
    meeting: jamieApiMeeting,
    tasks: jamieApiTasks,
    receivedAt: "2026-07-15T10:05:00.000Z",
    hasher: { fingerprint },
  });
  assert.equal(first?.contentHash, retry?.contentHash);
});

test("projects authorized calendar evidence into a deterministic factual brief", async () => {
  const { service } = createHarness();
  const surface = await service.surface({
    authorization,
    from: "2026-07-15T00:00:00.000Z",
    to: "2026-07-22T00:00:00.000Z",
  });
  assert.equal(surface.upcoming.length, 1);
  assert.equal(surface.upcoming[0]?.brief.deterministic, true);
  assert.equal(surface.upcoming[0]?.brief.openLoops[0]?.fact, "Still open");
});

test("keeps a Jamie import partial until action items have stable source IDs", () => {
  const { service } = createHarness();
  const first = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "a".repeat(64) }),
  });
  assert.equal(first.outcome, "partial");
  assert.deepEqual(first.meeting.missingComponents, ["action_items"]);
  assert.equal(
    first.meeting.workItems.some((item) => item.kind === "task"),
    false,
  );

  const completed = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "b".repeat(64), taskId: "jamie-task-9" }),
  });
  assert.equal(completed.outcome, "corrected");
  assert.equal(completed.meeting.triage, "ready");
  assert.equal(
    completed.meeting.workItems.filter((item) => item.kind === "task").length,
    1,
  );
});

test("exact Jamie redelivery is a no-op and does not churn meeting versions", () => {
  const { service } = createHarness();
  const input = source({ hash: "c".repeat(64), taskId: "task-1" });
  const first = service.importJamie({ authorization, spaceId, source: input });
  const second = service.importJamie({ authorization, spaceId, source: input });
  assert.equal(first.outcome, "applied");
  assert.equal(second.outcome, "no_change");
  assert.equal(second.meeting.id, first.meeting.id);
  assert.equal(second.meeting.version, first.meeting.version);
});

test("backfills source responsibility once without turning it into a workspace assignment", () => {
  const { service, applyLocally, now } = createHarness();
  const hash = "9".repeat(64);
  const legacy = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash, taskId: "task-1" }),
  });
  assert.equal(legacy.outcome, "applied");
  const legacyTask = legacy.meeting.workItems.find(
    (item) => item.sourceExternalId === "task-1",
  )!;
  const edited = applyLocally(legacy.meeting.id, (meeting) =>
    editMeetingWorkItem(meeting, {
      workItemId: legacyTask.id,
      expectedWorkItemVersion: legacyTask.version,
      title: "Call IT Card after the RFI review",
      state: "open",
      occurredAt: now(),
    }),
  );
  assert.ok(edited);

  const withResponsibility = source({
    hash,
    taskId: "task-1",
    assigneeName: "Antek",
    assigneeEmail: "antek@example.com",
  });
  const corrected = service.importJamie({
    authorization,
    spaceId,
    source: withResponsibility,
  });
  assert.equal(corrected.outcome, "corrected");
  const task = corrected.meeting.workItems.find(
    (item) => item.sourceExternalId === "task-1",
  );
  assert.deepEqual(task?.assignee, {
    name: "Antek",
    email: "antek@example.com",
  });
  assert.equal(task?.title, "Call IT Card after the RFI review");
  assert.equal(corrected.meeting.triage, "ready");
  assert.equal(task?.taskId, undefined);

  const redelivered = service.importJamie({
    authorization,
    spaceId,
    source: withResponsibility,
  });
  assert.equal(redelivered.outcome, "no_change");
  assert.equal(redelivered.meeting.version, corrected.meeting.version);
});

test("keeps a local responsibility correction across Jamie reconciliation", () => {
  const { service, applyLocally, now } = createHarness();
  const fromJamie = source({
    hash: "8".repeat(64),
    taskId: "task-1",
    assigneeName: "Kacper Pietrzyk",
    assigneeEmail: "kacper@example.com",
  });
  const imported = service.importJamie({
    authorization,
    spaceId,
    source: fromJamie,
  });
  assert.equal(imported.outcome, "applied");
  const importedTask = imported.meeting.workItems.find(
    (item) => item.sourceExternalId === "task-1",
  )!;
  const decision = imported.meeting.workItems.find(
    (item) => item.kind === "decision",
  )!;
  assert.equal(
    applyLocally(imported.meeting.id, (meeting) =>
      correctMeetingWorkItemResponsibility(meeting, {
        workItemId: decision.id,
        expectedWorkItemVersion: decision.version,
        name: "Antek",
        occurredAt: now(),
      }),
    ),
    undefined,
  );

  const corrected = applyLocally(imported.meeting.id, (meeting) =>
    correctMeetingWorkItemResponsibility(meeting, {
      workItemId: importedTask.id,
      expectedWorkItemVersion: importedTask.version,
      name: " Antek ",
      occurredAt: now(),
    }),
  );
  const correctedTask = corrected?.workItems.find(
    (item) => item.id === importedTask.id,
  );
  assert.deepEqual(correctedTask?.assignee, {
    name: "Kacper Pietrzyk",
    email: "kacper@example.com",
  });
  assert.deepEqual(correctedTask?.responsibilityOverride, { name: "Antek" });
  assert.equal(correctedTask?.state, "open");

  const redelivered = service.importJamie({
    authorization,
    spaceId,
    source: fromJamie,
  });
  assert.equal(redelivered.outcome, "no_change");
  assert.deepEqual(
    redelivered.meeting.workItems.find((item) => item.id === importedTask.id)
      ?.responsibilityOverride,
    { name: "Antek" },
  );

  const sourceCorrected = service.importJamie({
    authorization,
    spaceId,
    source: source({
      hash: "7".repeat(64),
      taskId: "task-1",
      assigneeName: "Kacper P.",
    }),
  });
  assert.equal(sourceCorrected.outcome, "corrected");
  const reconciledTask = sourceCorrected.meeting.workItems.find(
    (item) => item.id === importedTask.id,
  )!;
  assert.equal(reconciledTask.assignee?.name, "Kacper P.");
  assert.deepEqual(reconciledTask.responsibilityOverride, { name: "Antek" });
  assert.equal(
    applyLocally(imported.meeting.id, (meeting) =>
      correctMeetingWorkItemResponsibility(meeting, {
        workItemId: importedTask.id,
        expectedWorkItemVersion: importedTask.version,
        name: null,
        occurredAt: now(),
      }),
    ),
    undefined,
  );

  const cleared = applyLocally(imported.meeting.id, (meeting) =>
    correctMeetingWorkItemResponsibility(meeting, {
      workItemId: importedTask.id,
      expectedWorkItemVersion: reconciledTask.version,
      name: null,
      occurredAt: now(),
    }),
  );
  assert.equal(
    cleared?.workItems.find((item) => item.id === importedTask.id)
      ?.responsibilityOverride,
    undefined,
  );
  // Attribution for a correction is now a kernel audit receipt (ADR-047), not
  // a device-local trail nothing read; the kernel conformance covers it.
});

test("Jamie correction preserves a locally edited work item and exposes conflict", () => {
  const { service, applyLocally, now } = createHarness();
  const applied = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "d".repeat(64), taskId: "task-1" }),
  });
  assert.notEqual(applied.outcome, "rejected");
  if (applied.outcome === "rejected") return;
  const task = applied.meeting.workItems.find((item) => item.kind === "task")!;
  const edited = applyLocally(applied.meeting.id, (meeting) =>
    editMeetingWorkItem(meeting, {
      workItemId: task.id,
      expectedWorkItemVersion: task.version,
      title: "Confirm rollout owner with security",
      state: "open",
      occurredAt: now(),
    }),
  );
  assert.ok(edited);
  const corrected = service.importJamie({
    authorization,
    spaceId,
    source: source({
      hash: "e".repeat(64),
      taskId: "task-1",
      taskTitle: "Assign rollout owner immediately",
    }),
  });
  assert.equal(corrected.outcome, "conflicted");
  const conflicted = corrected.meeting.workItems.find(
    (item) => item.id === task.id,
  )!;
  assert.equal(conflicted.title, "Confirm rollout owner with security");
  assert.equal(
    conflicted.sourceValueInConflict,
    "Assign rollout owner immediately",
  );
  const resolved = applyLocally(corrected.meeting.id, (meeting) =>
    editMeetingWorkItem(meeting, {
      workItemId: conflicted.id,
      expectedWorkItemVersion: conflicted.version,
      title: conflicted.sourceValueInConflict!,
      state: "open",
      occurredAt: now(),
    }),
  );
  const resolvedTask = resolved?.workItems.find(
    (item) => item.id === conflicted.id,
  );
  assert.equal(resolved?.triage, "ready");
  assert.equal(resolvedTask?.title, "Assign rollout owner immediately");
  assert.equal(resolvedTask?.sourceValueInConflict, undefined);
  assert.equal(resolvedTask?.sourceControlled, true);
});

test("independent meeting work is versioned and refuses a reused id", () => {
  const { service, applyLocally, now } = createHarness();
  const imported = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "f".repeat(64), taskId: "task-1" }),
  });
  assert.notEqual(imported.outcome, "rejected");
  if (imported.outcome === "rejected") return;
  const workItemId = "00000000-0000-4000-8000-000000000777";
  const created = applyLocally(imported.meeting.id, (meeting) =>
    addMeetingWorkItem(meeting, {
      workItemId,
      kind: "waiting",
      title: "Wait for legal review",
      occurredAt: now(),
    }),
  );
  assert.ok(created);
  // ADR-047: replay protection moved to the kernel's idempotency record, so
  // the transformation refuses a reused id rather than quietly returning the
  // meeting unchanged — a caller reusing an id believes it is creating.
  assert.equal(
    applyLocally(imported.meeting.id, (meeting) =>
      addMeetingWorkItem(meeting, {
        workItemId,
        kind: "waiting",
        title: "Wait for legal review again",
        occurredAt: now(),
      }),
    ),
    undefined,
  );
  const waiting = created.workItems.find((item) => item.id === workItemId);
  assert.ok(waiting);
  assert.equal(waiting.sourceControlled, false);
  assert.equal(waiting.locallyModified, true);
  assert.equal(waiting.version, 1);
  const edited = applyLocally(imported.meeting.id, (meeting) =>
    editMeetingWorkItem(meeting, {
      workItemId,
      expectedWorkItemVersion: waiting.version,
      title: waiting.title,
      state: "completed",
      occurredAt: now(),
    }),
  );
  assert.equal(
    edited?.workItems.find((item) => item.id === workItemId)?.state,
    "completed",
  );
  assert.equal(edited?.version, created.version + 1);
});

const block: CalendarBlockDraft = {
  calendarExternalId: "calendar-1",
  ownedBlockExternalId: "constellation:block:1",
  title: "Prepare delivery review",
  startsAt: "2026-07-16T08:00:00.000Z",
  endsAt: "2026-07-16T08:30:00.000Z",
  expectedRevision: null,
  sourceRecordIds: ["00000000-0000-4000-8000-000000000020"],
};

test("calendar consent is bound to exact values and is single use", async () => {
  const { service } = createHarness();
  const preview = service.previewCalendarWrite({
    authorization,
    blocks: [block],
  });
  assert.ok(preview);
  const altered = await service.confirmCalendarWrite({
    authorization,
    previewId: preview.previewId,
    consentToken: preview.consentToken,
    blocks: [{ ...block, title: "Altered block" }],
  });
  assert.deepEqual(altered, { outcome: "rejected", code: "altered_preview" });
  const applied = await service.confirmCalendarWrite({
    authorization,
    previewId: preview.previewId,
    consentToken: preview.consentToken,
    blocks: [block],
  });
  assert.equal(applied.outcome, "applied");
  const replay = await service.confirmCalendarWrite({
    authorization,
    previewId: preview.previewId,
    consentToken: preview.consentToken,
    blocks: [block],
  });
  assert.deepEqual(replay, { outcome: "rejected", code: "already_consumed" });
});

test("expired and stale calendar previews fail closed", async () => {
  const staleWriter: CalendarWriter = {
    writeOwnedBlocks: async () => ({
      outcome: "rejected",
      code: "stale_revision",
    }),
  };
  const staleHarness = createHarness(staleWriter);
  const stalePreview = staleHarness.service.previewCalendarWrite({
    authorization,
    blocks: [block],
  })!;
  assert.deepEqual(
    await staleHarness.service.confirmCalendarWrite({
      authorization,
      previewId: stalePreview.previewId,
      consentToken: stalePreview.consentToken,
      blocks: [block],
    }),
    { outcome: "rejected", code: "stale_revision" },
  );

  const expiredHarness = createHarness();
  const expiredPreview = expiredHarness.service.previewCalendarWrite({
    authorization,
    blocks: [block],
  })!;
  expiredHarness.setNow("2026-07-15T10:06:00.000Z");
  assert.deepEqual(
    await expiredHarness.service.confirmCalendarWrite({
      authorization,
      previewId: expiredPreview.previewId,
      consentToken: expiredPreview.consentToken,
      blocks: [block],
    }),
    { outcome: "rejected", code: "expired" },
  );
});

test("a corrected Jamie redelivery preserves promotion, identity links, and routing", () => {
  // ADR-040 §5. This is the load-bearing guarantee behind the "Powtórzony
  // webhook Jamie" acceptance test: a repeated delivery must never strand a
  // promoted Task by clearing the back-reference that makes promotion
  // idempotent. A byte-identical redelivery proves nothing here — it takes the
  // no_change fast path — so this exercises a *content-changed* delivery.
  const { service, repository } = createHarness();
  const applied = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "d".repeat(64), taskId: "task-1" }),
  });
  assert.equal(applied.outcome, "applied");

  // Stand in for the kernel commands, which write these workspace-owned refs
  // onto the coordinated record and raise the meeting version.
  const promotedTaskId = TaskIdSchema.parse(
    "00000000-0000-4000-8000-0000000000a1",
  );
  const linkedPersonId = StrategicRecordIdSchema.parse(
    "00000000-0000-4000-8000-0000000000a2",
  );
  const routedProjectId = ProjectIdSchema.parse(
    "00000000-0000-4000-8000-0000000000a3",
  );
  const routedOrganizationId = StrategicRecordIdSchema.parse(
    "00000000-0000-4000-8000-0000000000a4",
  );
  const state = repository.load(workspaceId);
  const stored = state.meetings.find(
    (meeting) => meeting.id === applied.meeting.id,
  )!;
  assert.ok(
    repository.save(workspaceId, state.revision, {
      ...state,
      meetings: [
        {
          ...stored,
          projectId: routedProjectId,
          organizationId: routedOrganizationId,
          participants: stored.participants.map((participant) => ({
            ...participant,
            personId: linkedPersonId,
          })),
          workItems: stored.workItems.map((item) =>
            item.sourceExternalId === "task-1"
              ? { ...item, taskId: promotedTaskId }
              : item,
          ),
        },
      ],
    }),
  );

  // Jamie corrects the meeting: new content hash and a retitled action item.
  const corrected = service.importJamie({
    authorization,
    spaceId,
    source: source({
      hash: "e".repeat(64),
      taskId: "task-1",
      taskTitle: "Confirm rollout owner before Friday",
    }),
  });
  assert.equal(corrected.outcome, "corrected");
  assert.equal(corrected.meeting.projectId, routedProjectId);
  assert.equal(corrected.meeting.organizationId, routedOrganizationId);
  assert.equal(corrected.meeting.participants[0]?.personId, linkedPersonId);
  const item = corrected.meeting.workItems.find(
    (candidate) => candidate.sourceExternalId === "task-1",
  )!;
  // Source content refreshed, workspace-owned reference intact: the next
  // promotion attempt is a no-op instead of minting a duplicate Task.
  assert.equal(item.title, "Confirm rollout owner before Friday");
  assert.equal(item.taskId, promotedTaskId);
});

test("re-import keeps a routed Space instead of snapping back to the caller's", () => {
  const { service, repository } = createHarness();
  const applied = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "f".repeat(64), taskId: "task-1" }),
  });
  assert.notEqual(applied.outcome, "rejected");
  assert.equal(
    applied.outcome === "rejected" ? undefined : applied.meeting.spaceId,
    spaceId,
  );
  const routedSpaceId = SpaceIdSchema.parse(
    "00000000-0000-4000-8000-0000000000b1",
  );
  const state = repository.load(workspaceId);
  assert.ok(
    repository.save(workspaceId, state.revision, {
      ...state,
      meetings: state.meetings.map((meeting) => ({
        ...meeting,
        spaceId: routedSpaceId,
      })),
    }),
  );
  const corrected = service.importJamie({
    authorization,
    spaceId,
    source: source({
      hash: "0".repeat(64),
      taskId: "task-1",
      taskTitle: "Confirm rollout owner again",
    }),
  });
  assert.equal(corrected.outcome, "corrected");
  assert.equal(corrected.meeting.spaceId, routedSpaceId);
});

test("Jamie due dates reach the work item and clear when the source drops them", () => {
  const { service } = createHarness();
  const withDue: NormalizedJamieMeeting = {
    ...source({ hash: "1".repeat(64), taskId: "task-1" }),
    actionItems: [
      {
        externalTaskId: "task-1",
        content: "Confirm rollout owner",
        completed: false,
        dueAt: "2026-07-20T09:00:00.000Z",
      },
    ],
  };
  const applied = service.importJamie({
    authorization,
    spaceId,
    source: withDue,
  });
  assert.notEqual(applied.outcome, "rejected");
  const dueItem =
    applied.outcome === "rejected"
      ? undefined
      : applied.meeting.workItems.find(
          (item) => item.sourceExternalId === "task-1",
        );
  assert.equal(dueItem?.dueAt, "2026-07-20T09:00:00.000Z");

  const withoutDue: NormalizedJamieMeeting = {
    ...withDue,
    contentHash: "2".repeat(64),
    actionItems: [
      {
        externalTaskId: "task-1",
        content: "Confirm rollout owner",
        completed: false,
      },
    ],
  };
  const cleared = service.importJamie({
    authorization,
    spaceId,
    source: withoutDue,
  });
  assert.equal(cleared.outcome, "corrected");
  const clearedItem = cleared.meeting.workItems.find(
    (item) => item.sourceExternalId === "task-1",
  );
  assert.equal(clearedItem?.title, "Confirm rollout owner");
  assert.equal(clearedItem?.dueAt, undefined);
});

test("a local completion survives an unrelated Jamie correction", () => {
  const { service, applyLocally, now } = createHarness();
  const applied = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "7".repeat(64), taskId: "task-1" }),
  });
  if (applied.outcome === "rejected") throw new Error("expected import");
  const item = applied.meeting.workItems.find(
    (candidate) => candidate.sourceExternalId === "task-1",
  )!;
  const edited = applyLocally(applied.meeting.id, (meeting) =>
    editMeetingWorkItem(meeting, {
      workItemId: item.id,
      expectedWorkItemVersion: item.version,
      title: item.title,
      state: "completed",
      occurredAt: now(),
    }),
  );
  assert.ok(edited);
  // Jamie changes something else about the meeting; this item is untouched.
  const corrected = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "8".repeat(64), taskId: "task-1" }),
  });
  if (corrected.outcome === "rejected") throw new Error("expected correction");
  const after = corrected.meeting.workItems.find(
    (candidate) => candidate.sourceExternalId === "task-1",
  )!;
  // The title-based conflict check cannot see a state-only divergence, so
  // without an explicit lifecycle guard this completion was silently reverted
  // to Jamie's "open" with no conflict raised — losing the user's work.
  assert.equal(after.state, "completed");
  assert.equal(after.title, item.title);
});

test("the calendar capability declares where a Task block would be written", () => {
  // ADR-042. A meeting block inherits its calendar from the event it prepares.
  // A Task has no event, so without a declared default there is no honest
  // target and the surface would have to guess — possibly at a read-only or
  // shared calendar. The capability therefore carries the default write
  // target, and its absence is a first-class answer meaning "time cannot be
  // reserved here", not a reason to fall back to some calendar we happen to
  // have seen.
  const writable = CalendarCapabilitySchema.parse({
    platform: "macos",
    provider: "eventkit",
    availability: "available",
    canRead: true,
    canWriteOwnedBlocks: true,
    defaultWriteCalendarExternalId: "calendar-work",
    detailCode: "full_access",
  });
  assert.equal(writable.defaultWriteCalendarExternalId, "calendar-work");

  // Windows and unwritable providers stay valid without the field.
  const unwritable = CalendarCapabilitySchema.parse({
    platform: "windows",
    provider: "unconfigured",
    availability: "provider_unavailable",
    canRead: false,
    canWriteOwnedBlocks: false,
    detailCode: "no_provider",
  });
  assert.equal(unwritable.defaultWriteCalendarExternalId, undefined);
});
