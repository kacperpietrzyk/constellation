import type { MeetingLoopSurface } from "@constellation/contracts";
import type { RendererQueryResponse } from "@constellation/desktop-preload/client";

import { RealApp } from "../RealApp.js";
import { createScenarioClient } from "../client/scenario-client.js";

// Deterministic, truthful cockpit fixture. It mounts the canonical RealApp shell
// so the weekly cockpit's populated `ready` state is designable and
// screenshot-verifiable in a browser — the one flagship state no other scenario
// renders. No parallel component language: this is the real surface with real
// projection shapes. Attention carries unread signals so the exceptions bar —
// part of the brief's 30-second orientation — renders and stays verifiable.

const workspaceId = "00000000-0000-4000-8000-000000000601";
const spaceId = "00000000-0000-4000-8000-000000000602";
const statusId = "00000000-0000-4000-8000-000000000603";
const waitingStatusId = "00000000-0000-4000-8000-000000000605";
const readyStatusId = "00000000-0000-4000-8000-000000000606";
const ownerId = "00000000-0000-4000-8000-000000000604";
const memberId = "00000000-0000-4000-8000-000000000607";
const guestId = "00000000-0000-4000-8000-000000000608";

const projectA = "00000000-0000-4000-8000-000000000610";
const projectB = "00000000-0000-4000-8000-000000000611";
const projectC = "00000000-0000-4000-8000-000000000612";
const searchDocumentId = "00000000-0000-4000-8000-000000000650";

const task1 = "00000000-0000-4000-8000-000000000620";
const task2 = "00000000-0000-4000-8000-000000000621";
const task3 = "00000000-0000-4000-8000-000000000622";
const task4 = "00000000-0000-4000-8000-000000000623";
const task5 = "00000000-0000-4000-8000-000000000624";

const signal1 = "00000000-0000-4000-8000-000000000640";
const signal2 = "00000000-0000-4000-8000-000000000641";
const signal3 = "00000000-0000-4000-8000-000000000642";
const signal4 = "00000000-0000-4000-8000-000000000643";
const signal5 = "00000000-0000-4000-8000-000000000644";
const captureAttention = "00000000-0000-4000-8000-000000000645";

const weekStart = "2026-07-13";
const weekEnd = "2026-07-19";

const result = (projection: Record<string, unknown>): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId: "00000000-0000-4000-8000-0000000006f0",
      kernelTime: "2026-07-15T09:00:00.000Z",
      outcome: "success",
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
      projection,
    },
  }) as unknown as RendererQueryResponse;

const taskRow = (
  id: string,
  title: string,
  createdAt: string,
  status: { readonly id: string; readonly label: string } = {
    id: statusId,
    label: "W toku",
  },
  assignment?: { readonly principalId: string; readonly displayName: string },
  timing?: {
    readonly dueAt?: string;
    readonly priority?: string;
    // R12.6 — reserved time, deliberately on a different day than the
    // deadline so the harness shows the two facts are independent.
    readonly reservedAt?: string;
  },
): Record<string, unknown> => ({
  id,
  spaceId,
  title,
  status: {
    id: status.id,
    label: status.label,
    operationalSemantics: "actionable",
  },
  completionState: "open",
  ...(timing?.dueAt === undefined ? {} : { dueAt: timing.dueAt }),
  ...(timing?.priority === undefined ? {} : { priority: timing.priority }),
  ...(timing?.reservedAt === undefined
    ? {}
    : {
        calendarBlock: {
          ownedBlockExternalId: `task-block:${id}`,
          calendarExternalId: "calendar-default",
          revision: "rev-1",
          startsAt: timing.reservedAt,
          endsAt: new Date(
            Date.parse(timing.reservedAt) + 3_600_000,
          ).toISOString(),
        },
      }),
  ...(assignment
    ? {
        assignment: {
          id: `${id.slice(0, -1)}${Number(id.slice(-1)) + 6}`,
          assigneePrincipalId: assignment.principalId,
          displayName: assignment.displayName,
          availability: "active",
          version: 1,
        },
      }
    : {}),
  createdAt,
  updatedAt: "2026-07-15T09:00:00.000Z",
  version: 1,
});

const baseClient = createScenarioClient({
  queries: {
    "workspace.bootstrapContext": result({
      kind: "workspace.bootstrapContext",
      workspace: {
        id: workspaceId,
        name: "Praca",
        timezone: "Europe/Warsaw",
        defaultTaskStatusId: statusId,
        version: 6,
      },
      spaces: [{ id: spaceId, name: "Praca", version: 1 }],
      taskStatuses: [
        {
          id: statusId,
          label: "W toku",
          operationalSemantics: "actionable",
          position: 0,
          version: 1,
        },
        {
          id: waitingStatusId,
          label: "Czeka",
          operationalSemantics: "actionable",
          position: 1,
          version: 1,
        },
        {
          id: readyStatusId,
          label: "Do decyzji",
          operationalSemantics: "actionable",
          position: 2,
          version: 1,
        },
      ],
    }),
    "task.list": result({
      kind: "task.list",
      items: [
        taskRow(
          task1,
          "Zatwierdzić model custody dla przechwyceń",
          weekStart,
          { id: readyStatusId, label: "Do decyzji" },
          { principalId: ownerId, displayName: "Kacper" },
          {
            dueAt: `${weekStart}T21:59:59.999Z`,
            priority: "high",
            // Due Monday, being done Wednesday.
            reservedAt: "2026-07-15T07:00:00.000Z",
          },
        ),
        taskRow(
          task2,
          "Opisać stan lattice kokpitu tygodnia",
          "2026-07-14",
          undefined,
          { principalId: memberId, displayName: "Ada Nowak" },
          { dueAt: `${weekEnd}T21:59:59.999Z` },
        ),
        taskRow(
          task3,
          "Sprawdzić migrację SQLCipher",
          "2026-06-30",
          { id: waitingStatusId, label: "Czeka" },
          { principalId: guestId, displayName: "Marek Lis" },
          { dueAt: "2026-06-30T21:59:59.999Z" },
        ),
        taskRow(task4, "Dowieźć harness kokpitu", "2026-07-15"),
        taskRow(task5, "Przejrzeć kopie w Ustawieniach", "2026-06-20"),
      ],
      nextCursor: null,
    }),
    "task.assignmentCandidates": result({
      kind: "task.assignmentCandidates",
      spaceId,
      candidates: [
        {
          principalId: ownerId,
          displayName: "Kacper",
          participantKind: "member",
        },
        {
          principalId: memberId,
          displayName: "Ada Nowak",
          participantKind: "member",
        },
        {
          principalId: guestId,
          displayName: "Marek Lis",
          participantKind: "guest",
        },
      ],
    }),
    "capture.history": result({
      kind: "capture.history",
      items: [],
      nextCursor: null,
    }),
    "cockpit.week": result({
      kind: "cockpit.week",
      weekStart,
      weekEnd,
      focus: [
        {
          taskId: task1,
          title: "Zatwierdzić model custody dla przechwyceń",
          score: 170,
          dueAt: `${weekStart}T21:59:59.999Z`,
          priority: "high",
          reasons: [
            { code: "task_open", weight: 100 },
            {
              code: "due_this_week",
              weight: 40,
              dueAt: `${weekStart}T21:59:59.999Z`,
            },
            { code: "priority_high", weight: 15 },
            {
              code: "active_project",
              weight: 10,
              projectId: projectA,
              projectTitle: "Domknięcie aplikacji",
            },
          ],
          relatedProjectId: projectA,
        },
        {
          taskId: task2,
          title: "Opisać stan lattice kokpitu tygodnia",
          score: 140,
          dueAt: `${weekEnd}T21:59:59.999Z`,
          reasons: [
            { code: "task_open", weight: 100 },
            {
              code: "due_this_week",
              weight: 40,
              dueAt: `${weekEnd}T21:59:59.999Z`,
            },
          ],
        },
        {
          taskId: task3,
          title: "Sprawdzić migrację SQLCipher",
          score: 110,
          reasons: [
            { code: "task_open", weight: 100 },
            {
              code: "active_project",
              weight: 10,
              projectId: projectB,
              projectTitle: "Migracja magazynu",
            },
          ],
          relatedProjectId: projectB,
        },
        {
          taskId: task4,
          title: "Dowieźć harness kokpitu",
          score: 110,
          reasons: [
            { code: "task_open", weight: 100 },
            {
              code: "active_project",
              weight: 10,
              projectId: projectA,
              projectTitle: "Domknięcie aplikacji",
            },
          ],
          relatedProjectId: projectA,
        },
        {
          taskId: task5,
          title: "Przejrzeć kopie w Ustawieniach",
          score: 100,
          reasons: [{ code: "task_open", weight: 100 }],
        },
      ],
    }),
    "project.list": result({
      kind: "project.list",
      items: [
        {
          id: projectA,
          spaceId,
          title: "Domknięcie aplikacji",
          intendedOutcome:
            "Główne powierzchnie są operacyjne i spójne z roadmapą",
          needsReview: false,
          lifecycle: "active",
          relatedOpenTaskCount: 3,
          version: 2,
          updatedAt: "2026-07-15T09:00:00.000Z",
        },
        {
          id: projectB,
          spaceId,
          title: "Migracja magazynu",
          intendedOutcome:
            "Dane działają na SQLCipher bez utraty historii i dowodów",
          needsReview: false,
          lifecycle: "active",
          relatedOpenTaskCount: 2,
          version: 1,
          updatedAt: "2026-07-14T09:00:00.000Z",
        },
        {
          id: projectC,
          spaceId,
          title: "Alfa interaktywna",
          intendedOutcome: "Pełny tydzień przepracowany na realnych danych",
          needsReview: false,
          lifecycle: "active",
          relatedOpenTaskCount: 1,
          version: 1,
          updatedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
    }),
    "attention.inbox": result({
      kind: "attention.inbox",
      unreadCount: 4,
      items: [
        {
          id: signal3,
          reason: "capture_missing_payload",
          destination: { kind: "capture", captureId: captureAttention },
          title: "Oferta_Northstar_v3.pdf wymaga bezpiecznej wymiany",
          detail:
            "Zaszyfrowany rekord pozostał zachowany, ale jego bajty są niedostępne i wymagają świadomej decyzji.",
          urgency: "urgent",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-15T08:54:00.000Z",
        },
        {
          id: signal1,
          reason: "task_assignment",
          destination: { kind: "task", taskId: task3 },
          title: "Przypisano: Sprawdzić migrację SQLCipher",
          detail: "Zadanie zostało przypisane do Ciebie w Space Praca.",
          urgency: "in_app",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-14T08:30:00.000Z",
        },
        {
          id: signal2,
          reason: "sync_conflict",
          destination: { kind: "task", taskId: task5 },
          title: "Konflikt wersji: Przejrzeć kopie w Ustawieniach",
          detail: "Dwie równoległe zmiany zadania wymagają decyzji.",
          urgency: "in_app",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-15T07:10:00.000Z",
        },
        {
          id: signal4,
          reason: "decision_impact_review",
          destination: { kind: "project", projectId: projectA },
          title: "Nowa decyzja wpływa na zakres Domknięcia aplikacji",
          detail:
            "Dwa powiązane rezultaty używają wcześniejszej wersji decyzji i wymagają przeglądu skutków.",
          urgency: "in_app",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-14T15:45:00.000Z",
        },
        {
          id: signal5,
          reason: "comment_mention",
          destination: { kind: "task", taskId: task2 },
          title: "Ada wspomniała Cię przy opisie kokpitu tygodnia",
          detail: "Komentarz zawiera pytanie o zakres dowodu przed akceptacją.",
          urgency: "in_app",
          state: "read",
          version: 1,
          occurredAt: "2026-07-13T12:20:00.000Z",
        },
      ],
    }),
    "workspace.access": result({
      kind: "workspace.access",
      policyVersion: 6,
      currentPrincipalId: ownerId,
      canManage: true,
      members: [
        {
          membershipId: "00000000-0000-4000-8000-000000000630",
          principalId: ownerId,
          displayName: "Kacper",
          role: "owner",
          status: "active",
          version: 1,
          spaces: [],
        },
      ],
    }),
    "document.list": result({
      kind: "document.list",
      items: [
        {
          id: searchDocumentId,
          spaceId,
          title: "Notatka z wywiadu Northstar",
          role: "note",
          version: 1,
          updatedAt: "2026-07-15T08:45:00.000Z",
        },
      ],
    }),
    "knowledge.list": result({
      kind: "knowledge.list",
      spaceId,
      sources: [],
      documents: [
        {
          id: searchDocumentId,
          title: "Notatka z wywiadu Northstar",
          role: "note",
          evidenceCount: 0,
          namedVersionCount: 0,
          staleEvidence: false,
          version: 1,
          updatedAt: "2026-07-15T08:45:00.000Z",
        },
      ],
    }),
    "search.global": result({
      kind: "search.global",
      normalizedQuery: "zakres pilotażu",
      items: [
        {
          recordKind: "note",
          recordId: searchDocumentId,
          spaceId,
          title: "Notatka z wywiadu Northstar",
          snippet: "…potwierdzony zakres pilotażu i odpowiedzialność zespołu…",
          matchedFields: ["body"],
          score: 90,
          updatedAt: "2026-07-15T08:45:00.000Z",
        },
      ],
    }),
  },
});

let injectedSearchAttempt = 0;
// R12.6 — the shared scenario fixture reports provider_unavailable, which is
// the right default and exercises the honest refusal. The cockpit harness
// overrides it locally so the day composition's meeting rendering can be
// driven too; overriding the shared fixture would change every other surface.
const client = {
  ...baseClient,
  getMeetingLoop: async (): Promise<MeetingLoopSurface> => ({
    capability: {
      platform: "macos" as const,
      provider: "eventkit" as const,
      availability: "available" as const,
      canRead: true,
      canWriteOwnedBlocks: true,
      detailCode: "harness",
      defaultWriteCalendarExternalId: "calendar-default",
    },
    upcoming: [
      {
        event: {
          provider: "fixture" as const,
          calendarExternalId: "calendar-default",
          eventExternalId: "event-1",
          revision: "rev-1",
          title: "Przegląd tygodnia z zespołem",
          startsAt: "2026-07-14T08:00:00.000Z",
          endsAt: "2026-07-14T09:00:00.000Z",
          isAllDay: false,
          attendees: [],
        },
        brief: {
          eventExternalId: "event-1",
          orientation: [],
          openLoops: [],
          relevantSources: [],
          generatedAt: "2026-07-13T06:00:00.000Z",
          deterministic: true as const,
        },
      },
    ],
    completed: [],
    freshness: "current" as const,
    generatedAt: "2026-07-13T06:00:00.000Z",
  }),
  runQuery: async (...parameters: Parameters<typeof baseClient.runQuery>) => {
    const [query] = parameters;
    const searchFailureMode = new URLSearchParams(window.location.search).get(
      "search-error",
    );
    if (query.queryName === "search.global" && searchFailureMode !== null) {
      injectedSearchAttempt += 1;
      if (searchFailureMode === "1" || injectedSearchAttempt === 1) {
        throw new Error("private/path/provider-secret");
      }
      return result({
        kind: "search.global",
        normalizedQuery: query.parameters.text,
        items: [],
      });
    }
    return baseClient.runQuery(...parameters);
  },
};

export const CockpitHarness = () => <RealApp client={client} />;
