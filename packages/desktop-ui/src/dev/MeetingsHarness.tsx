import { useState } from "react";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { MeetingsSurface } from "../MeetingsSurface.js";
import { createScenarioClient } from "../client/scenario-client.js";

const base = createScenarioClient({ queries: {} });
const client: ConstellationRendererClient = {
  ...base,
  getJamieStatus: async () => ({ configured: true, scope: "personal" }),
  syncJamie: async () => ({
    applied: 0,
    corrected: 0,
    noChange: 2,
    partial: 0,
    conflicted: 0,
    failed: 0,
  }),
  disconnectJamie: async () => undefined,
  getMeetingLoop: async () => ({
    capability: {
      platform: "macos",
      provider: "eventkit",
      availability: "available",
      canRead: true,
      canWriteOwnedBlocks: true,
      detailCode: "full_access",
    },
    freshness: "current",
    generatedAt: "2026-07-15T10:00:00.000Z",
    upcoming: [
      {
        event: {
          provider: "fixture",
          calendarExternalId: "Praca",
          eventExternalId: "event-delivery-review",
          revision: "rev-7",
          title: "Przegląd dostawy Northstar",
          startsAt: "2026-07-16T09:00:00.000Z",
          endsAt: "2026-07-16T09:45:00.000Z",
          isAllDay: false,
          location: "Google Meet",
          attendees: [
            {
              name: "Kacper",
              email: "kacper@example.com",
              organizer: true,
              response: "accepted",
            },
            {
              name: "Alex",
              email: "alex@example.com",
              organizer: false,
              response: "accepted",
            },
          ],
        },
        brief: {
          eventExternalId: "event-delivery-review",
          deterministic: true,
          generatedAt: "2026-07-15T10:00:00.000Z",
          orientation: [
            {
              kind: "project",
              recordId: "00000000-0000-4000-8000-000000000201",
              spaceId: "00000000-0000-4000-8000-000000000002" as never,
              label: "Northstar rollout",
              fact: "Pilot enters release review",
              updatedAt: "2026-07-15T08:00:00.000Z",
            },
          ],
          openLoops: [
            {
              kind: "waiting",
              recordId: "00000000-0000-4000-8000-000000000202",
              spaceId: "00000000-0000-4000-8000-000000000002" as never,
              label: "Confirm rollout owner",
              fact: "Waiting on security",
              updatedAt: "2026-07-15T09:00:00.000Z",
            },
          ],
          relevantSources: [],
        },
      },
    ],
    completed: [
      {
        id: "00000000-0000-4000-8000-000000000210",
        workspaceId: "00000000-0000-4000-8000-000000000001" as never,
        spaceId: "00000000-0000-4000-8000-000000000002" as never,
        connectionId: "jamie-workspace",
        externalMeetingId: "meeting-previous",
        title: "Decyzja o pilocie",
        startedAt: "2026-07-14T09:00:00.000Z",
        endedAt: "2026-07-14T09:45:00.000Z",
        calendarEventId: "event-previous",
        summaryMarkdown:
          "## Wynik\n\n- **Pilot pozostaje za flagą** do czasu potwierdzenia recovery.\n- Właściciel wdrożenia zostanie potwierdzony po przeglądzie.",
        transcriptMarkdown:
          "## Fragment transkrypcji\n\n**Alex:** Potwierdzę procedurę recovery przed kolejnym spotkaniem.",
        participants: [],
        workItems: [
          {
            id: "00000000-0000-4000-8000-000000000211",
            kind: "decision",
            sourceExternalId: "decision-1",
            title: "Pilot pozostaje za flagą",
            state: "open",
            sourceControlled: true,
            locallyModified: false,
            version: 1,
          },
          {
            id: "00000000-0000-4000-8000-000000000212",
            kind: "task",
            sourceExternalId: "task-1",
            title: "Potwierdź procedurę recovery",
            state: "open",
            sourceControlled: true,
            locallyModified: false,
            assignee: {
              name: "Kacper Pietrzyk",
              email: "kacper@example.com",
            },
            responsibilityOverride: { name: "Antek" },
            version: 1,
          },
        ],
        contentHash: "a".repeat(64),
        triage: "ready",
        missingComponents: [],
        version: 1,
        updatedAt: "2026-07-14T10:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000213",
        workspaceId: "00000000-0000-4000-8000-000000000001" as never,
        spaceId: "00000000-0000-4000-8000-000000000002" as never,
        connectionId: "jamie-workspace",
        externalMeetingId: "meeting-weekly-review",
        title: "Tygodniowy przegląd wdrożenia i otwartych decyzji",
        startedAt: "2026-07-12T13:30:00.000Z",
        endedAt: "2026-07-12T14:15:00.000Z",
        summaryMarkdown:
          "## Najważniejsze ustalenia\n\n1. Zespół zamyka etap przygotowania.\n2. Następny przegląd obejmie **ryzyko i termin**.\n\n> Decyzja pozostaje jawna i powiązana ze spotkaniem.",
        participants: [],
        workItems: [],
        contentHash: "b".repeat(64),
        triage: "ready",
        missingComponents: [],
        version: 1,
        updatedAt: "2026-07-12T14:20:00.000Z",
      },
    ],
  }),
  previewCalendarBlocks: async ({ blocks }) => ({
    previewId: "00000000-0000-4000-8000-000000000220",
    consentToken: "token".repeat(10),
    workspaceId: "00000000-0000-4000-8000-000000000001" as never,
    principalId: "00000000-0000-4000-8000-000000000003" as never,
    blocks: [...blocks],
    exactDigest: "b".repeat(64),
    expiresAt: "2026-07-15T10:05:00.000Z",
    state: "pending",
  }),
  confirmCalendarBlocks: async () => ({
    outcome: "applied",
    revisions: ["rev-8"],
  }),
};

export const MeetingsHarness = () => {
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  return (
    <main className="meetings-harness-shell">
      <div className="meetings-harness-work">
        <MeetingsSurface
          client={client}
          inspectorHost={inspectorHost}
          onInspectorOpen={() => setInspectorOpen(true)}
        />
      </div>
      <aside
        className={`inspector inspector--meeting${inspectorOpen ? " open" : ""}`}
        aria-label="Podgląd kontekstu"
      >
        <header className="inspector-header">
          <div>
            <span>Podgląd kontekstu</span>
            <small>Wynik Jamie</small>
          </div>
          <button
            className="icon-button surface-inspector-close"
            aria-label="Zamknij szczegóły spotkania"
            onClick={() => setInspectorOpen(false)}
          >
            ×
          </button>
        </header>
        <div className="surface-inspector-host" ref={setInspectorHost} />
      </aside>
    </main>
  );
};
