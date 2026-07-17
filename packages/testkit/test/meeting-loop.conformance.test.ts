import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import {
  MemoryMeetingLoopRepository,
  MeetingLoopService,
  normalizeJamieApiMeeting,
  type CalendarReader,
  type CalendarWriter,
  type MeetingLoopAuthorization,
} from "@constellation/application";
import {
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  type CalendarBlockDraft,
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
  return { service, repository, setNow: (value: string) => (now = value) };
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
  const { service } = createHarness();
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
  const edited = service.editWorkItem({
    authorization,
    meetingId: legacy.meeting.id,
    workItemId: legacyTask.id,
    expectedVersion: legacyTask.version,
    title: "Call IT Card after the RFI review",
    state: "open",
  });
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

test("keeps an audited local responsibility correction across Jamie reconciliation", () => {
  const { service, repository } = createHarness();
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
    service.correctWorkItemResponsibility({
      authorization,
      meetingId: imported.meeting.id,
      workItemId: decision.id,
      expectedVersion: decision.version,
      name: "Antek",
    }),
    undefined,
  );

  const corrected = service.correctWorkItemResponsibility({
    authorization,
    meetingId: imported.meeting.id,
    workItemId: importedTask.id,
    expectedVersion: importedTask.version,
    name: " Antek ",
  });
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
    service.correctWorkItemResponsibility({
      authorization,
      meetingId: imported.meeting.id,
      workItemId: importedTask.id,
      expectedVersion: importedTask.version,
    }),
    undefined,
  );

  const cleared = service.correctWorkItemResponsibility({
    authorization,
    meetingId: imported.meeting.id,
    workItemId: importedTask.id,
    expectedVersion: reconciledTask.version,
  });
  assert.equal(
    cleared?.workItems.find((item) => item.id === importedTask.id)
      ?.responsibilityOverride,
    undefined,
  );
  assert.deepEqual(
    repository.load(workspaceId).audits.map((audit) => audit.action),
    ["edited", "edited"],
  );
});

test("Jamie correction preserves a locally edited work item and exposes conflict", () => {
  const { service } = createHarness();
  const applied = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "d".repeat(64), taskId: "task-1" }),
  });
  assert.notEqual(applied.outcome, "rejected");
  if (applied.outcome === "rejected") return;
  const task = applied.meeting.workItems.find((item) => item.kind === "task")!;
  const edited = service.editWorkItem({
    authorization,
    meetingId: applied.meeting.id,
    workItemId: task.id,
    expectedVersion: task.version,
    title: "Confirm rollout owner with security",
    state: "open",
  });
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
  const resolved = service.editWorkItem({
    authorization,
    meetingId: corrected.meeting.id,
    workItemId: conflicted.id,
    expectedVersion: conflicted.version,
    title: conflicted.sourceValueInConflict!,
    state: "open",
  });
  const resolvedTask = resolved?.workItems.find(
    (item) => item.id === conflicted.id,
  );
  assert.equal(resolved?.triage, "ready");
  assert.equal(resolvedTask?.title, "Assign rollout owner immediately");
  assert.equal(resolvedTask?.sourceValueInConflict, undefined);
  assert.equal(resolvedTask?.sourceControlled, true);
});

test("independent meeting work is idempotent, versioned, and attributed", () => {
  const { service, repository } = createHarness();
  const imported = service.importJamie({
    authorization,
    spaceId,
    source: source({ hash: "f".repeat(64), taskId: "task-1" }),
  });
  assert.notEqual(imported.outcome, "rejected");
  if (imported.outcome === "rejected") return;
  const requestId = "00000000-0000-4000-8000-000000000777";
  const created = service.addWorkItem({
    authorization,
    meetingId: imported.meeting.id,
    requestId,
    kind: "waiting",
    title: "Wait for legal review",
  });
  const replay = service.addWorkItem({
    authorization,
    meetingId: imported.meeting.id,
    requestId,
    kind: "waiting",
    title: "Wait for legal review",
  });
  assert.ok(created);
  assert.equal(replay?.workItems.length, created?.workItems.length);
  const waiting = created?.workItems.find((item) => item.kind === "waiting");
  assert.ok(waiting);
  const edited = service.editWorkItem({
    authorization,
    meetingId: imported.meeting.id,
    workItemId: waiting!.id,
    expectedVersion: waiting!.version,
    title: waiting!.title,
    state: "completed",
  });
  assert.equal(
    edited?.workItems.find((item) => item.id === waiting!.id)?.state,
    "completed",
  );
  assert.deepEqual(
    repository
      .load(workspaceId)
      .audits.map((audit) => [audit.action, audit.principalId]),
    [
      ["created", principalId],
      ["edited", principalId],
    ],
  );
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
