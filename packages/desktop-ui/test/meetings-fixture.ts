import {
  DocumentIdSchema,
  ProjectIdSchema,
  ImportedMeetingSchema,
  MeetingLoopSurfaceSchema,
  PrincipalIdSchema,
  QueryProjectionSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  WorkspaceIdSchema,
  type ImportedMeeting,
  type MeetingLoopSurface,
  type QueryProjection,
} from "@constellation/contracts";

/* PARSED THROUGH THE REAL SCHEMAS, NEVER CAST. A cast fixture describes a
 * world that does not exist the moment a contract moves, and the screen then
 * passes against it — the defect this repo has already met with an
 * untyped bootstrap literal that omitted `workingDay`.
 */

/* THE MEETINGS FIXTURE, AND WHY ITS CARDINALITIES ARE CHOSEN RATHER THAN
 * TYPED OUT.
 *
 * The #33 guard asserts that every number this screen renders is the length of
 * a list rendered beside it. That assertion is only as good as the fixture: if
 * two lists happen to be the same length, or if a planted "imported minus
 * derived" subtraction happens to land on some list's length, the guard goes
 * GREEN over exactly the defect it exists to catch. So the lengths here are
 * deliberately pairwise distinct — 3 results · 9 action items · 2 participants
 * · 6 backlinks of which 1 is detached, leaving 5 attached — and the guard
 * asserts that distinctness about ITSELF before it measures anything.
 *
 * `9 − 2 promoted = 7` and `9 − 5 = 4` are the two residue numbers a careless
 * screen would print, and neither is a length any list here has.
 */

export const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a1",
);
export const spaceId = SpaceIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a2",
);
export const humanPrincipalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a3",
);
export const agentPrincipalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a4",
);
export const selectedMeetingId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000b1",
);
export const agentNoteId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-0000000000c1",
);
export const detachedNoteId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-0000000000c6",
);
export const routedProjectId = ProjectIdSchema.parse(
  "00000000-0000-4000-8000-0000000000f1",
);

const meetingId = (suffix: string) =>
  StrategicRecordIdSchema.parse(`00000000-0000-4000-8000-0000000000b${suffix}`);
const noteId = (suffix: string) =>
  DocumentIdSchema.parse(`00000000-0000-4000-8000-0000000000c${suffix}`);

/* Every instant is derived from the moment the test runs, never written down.
 * A pinned date turned `main` red overnight on a calendar boundary once this
 * wave already; a fixture that says "eight days ago" cannot rot.
 */
const daysAgo = (days: number, now: number): string =>
  new Date(now - days * 86_400_000).toISOString();

const workItem = (index: number, now: number, promoted: boolean) => ({
  id: `00000000-0000-4000-8000-0000000000d${index}`,
  kind: "task" as const,
  sourceExternalId: `jamie-item-${index}`,
  title: `Follow up on point ${index}`,
  state: "open" as const,
  sourceControlled: true,
  locallyModified: false,
  ...(promoted
    ? { taskId: `00000000-0000-4000-8000-0000000000e${index}` }
    : {}),
  version: 1,
  ...(index === 1 ? { dueAt: daysAgo(-3, now) } : {}),
});

export const meetingFixture = (
  now: number,
  detachedNoteIds: readonly string[] = [detachedNoteId],
): ImportedMeeting =>
  ImportedMeetingSchema.parse({
    id: selectedMeetingId,
    workspaceId,
    spaceId,
    connectionId: "jamie-fixture",
    externalMeetingId: "jamie-meeting-1",
    title: "Northstar delivery review",
    startedAt: daysAgo(2, now),
    endedAt: daysAgo(1.95, now),
    summaryMarkdown: "The rollout date holds and the security review moves.",
    participants: [
      { externalId: "p-1", name: "Kacper", email: "kacper@example.com" },
      { externalId: "p-2", name: "Marta", email: "marta@example.com" },
    ],
    // NINE, of which TWO carry a taskId. Both numbers matter to the #33 guard.
    workItems: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) =>
      workItem(index, now, index <= 2),
    ),
    ...(detachedNoteIds.length === 0 ? {} : { detachedNoteIds }),
    contentHash: "a".repeat(64),
    triage: "ready",
    missingComponents: [],
    version: 4,
    updatedAt: daysAgo(1, now),
  });

export const meetingLoopFixture = (
  now: number,
  detachedNoteIds: readonly string[] = [detachedNoteId],
): MeetingLoopSurface =>
  MeetingLoopSurfaceSchema.parse({
    capability: {
      platform: "other",
      provider: "unconfigured",
      availability: "provider_unavailable",
      canRead: false,
      canWriteOwnedBlocks: false,
      detailCode: "fixture",
    },
    /* ONE upcoming event, and it is not decoration: the Coming-up lane is
     * where the `title=` sweep has something to look at, and a fixture with
     * `upcoming: []` renders no article at all — so "no tooltip on Meetings"
     * would have been true of a lane that never drew. Its brief is empty on
     * purpose; the brief is not this lot's subject. */
    upcoming: [
      {
        event: {
          provider: "fixture",
          calendarExternalId: "work",
          eventExternalId: "event-1",
          revision: "rev-1",
          title: "Northstar weekly",
          startsAt: daysAgo(-1, now),
          endsAt: daysAgo(-1.02, now),
          isAllDay: false,
          attendees: [],
        },
        brief: {
          eventExternalId: "event-1",
          deterministic: true,
          generatedAt: new Date(now).toISOString(),
          orientation: [],
          openLoops: [],
          relevantSources: [],
        },
      },
    ],
    // THREE, and the selected one is first.
    completed: [
      meetingFixture(now, detachedNoteIds),
      {
        ...meetingFixture(now, []),
        id: meetingId("2"),
        externalMeetingId: "jamie-meeting-2",
        title: "Security review",
        workItems: [],
        startedAt: daysAgo(9, now),
      },
      {
        ...meetingFixture(now, []),
        id: meetingId("3"),
        externalMeetingId: "jamie-meeting-3",
        title: "Weekly sync",
        workItems: [],
        startedAt: daysAgo(16, now),
      },
    ],
    freshness: "current",
    generatedAt: new Date(now).toISOString(),
  });

/** SIX notes point at the meeting; one of them is the detached one. */
export const backlinksFixture = (
  now: number,
): Extract<QueryProjection, { kind: "document.backlinks" }> =>
  QueryProjectionSchema.parse({
    kind: "document.backlinks",
    target: {
      targetKind: "meeting",
      targetId: selectedMeetingId,
      label: "Northstar delivery review",
    },
    items: [
      {
        documentId: agentNoteId,
        spaceId,
        title: "What the room agreed about the rollout",
        role: "note",
        author: {
          principalId: agentPrincipalId,
          displayName: "Hermes",
          authoredByAgent: true,
        },
        updatedAt: daysAgo(1, now),
      },
      ...[2, 3, 4, 5].map((index) => ({
        documentId: noteId(String(index)),
        spaceId,
        title: `Working note ${index}`,
        role: "note" as const,
        author: {
          principalId: humanPrincipalId,
          displayName: "Kacper",
          authoredByAgent: false,
        },
        updatedAt: daysAgo(index, now),
      })),
      {
        documentId: detachedNoteId,
        spaceId,
        title: "A note the reader took off this meeting",
        role: "note",
        author: {
          principalId: agentPrincipalId,
          displayName: "Hermes",
          authoredByAgent: true,
        },
        updatedAt: daysAgo(2, now),
      },
    ],
  }) as Extract<QueryProjection, { kind: "document.backlinks" }>;
