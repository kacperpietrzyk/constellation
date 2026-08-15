import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import type {
  CommandEnvelope,
  MeetingLoopSurface,
} from "@constellation/contracts";

import {
  populatedPlanDayKey,
  populatedShellQueries,
  populatedTaskList,
  unplannedDeadlineTaskId,
} from "./shell-fixture.js";

// Decyzje z przejścia przez prototyp, przeniesione z prozy do kodu. Ta warstwa
// jest jedyną rzeczą, która przeżyje klon repo — dokumenty przejścia leżą
// w katalogu, którego git nie zna.
//
// Najważniejsza z nich jest pierwsza: przeciągnięcie zadania na dzień wygląda
// identycznie niezależnie od tego, czy zapisze plan, czy termin. Różnica między
// „zajmę się tym w środę" a „obiecuję to na środę" jest cała w danych.

let container: HTMLDivElement;
let root: Root;
let mounted = false;
const commands: CommandEnvelope[] = [];

/* CZTERY LENIWE CHUNKI ŚCIĄGNIĘTE, ZANIM PADNIE PIERWSZY `render`, I JEST TO
   DOMKNIĘCIE ZMIERZONEGO WYŚCIGU, NIE ROZGRZEWKA „NA WSZELKI WYPADEK".
 *
 * Ostatni przypadek w tym pliku otwiera rekord zadania. Powłoka montuje wtedy
 * cztery granice `lazy()` naraz, ich chunki jadą z dysku przez runner Vite'a
 * (prawdziwe I/O, nie mikrozadanie), a rozwiązanie promise'a przychodzi PO
 * ostatnim teście. React woła wtedy `console.error` o „suspended resource …
 * not wrapped in act", vitest przesyła ten log do procesu głównego przez RPC,
 * a zamykane środowisko workera przerywa transport w locie:
 * `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending`.
 *
 * Zmierzone znacznikami czasu: dziewięć takich logów padało PO `afterAll`
 * w KAŻDYM przebiegu, także w zielonym — zieleń znaczyła tylko tyle, że RPC
 * zdążyło się opróżnić. Pod obciążeniem nie zdążyło i to jest ta flaka.
 *
 * Ściągnięcie modułów tutaj niczego nie wycisza: sprawia, że logu NIE MA.
 * `lazy()` dostaje moduł z rejestru pliku, promise rozwiązuje się w
 * mikrozadaniu tego samego `act()`, które go wyrenderowało, więc React nie ma
 * o czym ostrzegać. Lista jest wyprowadzona z pomiaru (ładowania po starcie
 * ostatniego przypadku, stabilne w trzech świeżych przebiegach), a nie
 * z lektury drzewa — jeśli pod Dzisiaj przyjdzie kolejna granica `lazy()`,
 * ta sama czerwień wróci i to jest miejsce, w którym się ją dopisuje. */
beforeAll(async () => {
  await Promise.all([
    import("../src/TaskAttachmentsSection.js"),
    import("../src/record/RecordCommentsPanel.js"),
    import("../src/tasks/SavedViewManager.js"),
    import("../src/tasks/TaskViewControls.js"),
  ]);
});

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  commands.length = 0;
  // Ekran dnia pyta zegar, a fixture ma stałe daty. Bez ustawienia „dzisiaj"
  // ten plik przechodziłby albo padał w zależności od tego, kiedy się go
  // uruchomi — czyli mierzyłby datę, nie ekran.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${populatedPlanDayKey}T09:30:00.000Z`));
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  container.remove();
  vi.useRealTimers();
});

/**
 * Kalendarz z dokładnie tymi spotkaniami, których żąda przypadek. Scenariuszowy
 * klient sam ODMAWIA kalendarza, więc bez tego szwu nie da się zmierzyć dnia,
 * na którym pojemność jest w ogóle policzalna.
 */
const meetingLoop = (
  events: readonly {
    readonly title: string;
    readonly startsAt: string;
    readonly endsAt: string;
  }[],
): MeetingLoopSurface =>
  ({
    capability: {
      platform: "macos",
      provider: "eventkit",
      availability: "available",
      canRead: true,
      canWriteOwnedBlocks: true,
      defaultWriteCalendarExternalId: "calendar-work",
      detailCode: "fixture",
    },
    upcoming: events.map((event, index) => ({
      event: {
        provider: "eventkit",
        calendarExternalId: "calendar-work",
        eventExternalId: `event-${index}`,
        revision: "1",
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        isAllDay: false,
        attendees: [],
      },
      brief: {
        eventExternalId: `event-${index}`,
        orientation: [],
        openLoops: [],
        relevantSources: [],
      },
    })),
    completed: [],
    freshness: "current",
    generatedAt: `${populatedPlanDayKey}T06:00:00.000Z`,
  }) as unknown as MeetingLoopSurface;

const mountShell = async (
  meetings?: MeetingLoopSurface,
): Promise<HTMLElement> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const scenario = createScenarioClient({
    queries: populatedShellQueries,
    executeCommand: (command) => {
      commands.push(command);
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      } as never;
    },
  });
  const client =
    meetings === undefined
      ? scenario
      : { ...scenario, getMeetingLoop: async () => meetings };
  const snapshot = await loadDesktopSnapshot(client);
  assert.equal(
    snapshot.tasks.length,
    populatedTaskList.items.length,
    "the snapshot did not take the fixture's tasks, so nothing below measures a row",
  );

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });

  const plane = container.querySelector<HTMLElement>(
    'main[data-surface="today"] [role="tabpanel"]',
  );
  assert.ok(plane, "the shell did not open on Today");
  return plane;
};

const rowTitles = (scope: Element): readonly string[] =>
  [...scope.querySelectorAll<HTMLElement>("[data-row-title]")].map((node) =>
    (node.textContent ?? "").trim(),
  );

test("planning from Today sets the plan and leaves the deadline alone", async () => {
  const plane = await mountShell();
  const target = plane.querySelector<HTMLElement>(
    "[data-approaching-row] [data-plan-today]",
  );
  assert.ok(target, "no deadline row offered a way to plan it");

  await act(async () => {
    target.click();
  });

  const planning = commands.filter(
    (command) => command.commandName === "task.updateDetails",
  );
  assert.equal(
    planning.length,
    1,
    `expected one plan write, got ${planning.length}`,
  );
  const payload = planning[0]?.payload as Record<string, unknown>;
  assert.equal(payload.taskId, unplannedDeadlineTaskId);
  // Plan jest ustawiony…
  assert.equal(
    typeof payload.startAt,
    "string",
    `planning must write startAt, payload was ${JSON.stringify(payload)}`,
  );
  // Instant, nie napis z datą: początek dnia w strefie workspace'u wypada
  // poprzedniej doby UTC, więc porównanie prefiksu sprawdzałoby strefę serwera,
  // nie dzień, który człowiek widzi.
  const { dateKeyInZone } = await import("../src/i18n.js");
  assert.equal(
    dateKeyInZone(String(payload.startAt), "Europe/Warsaw"),
    populatedPlanDayKey,
  );
  // …a termin NIE jest nawet wspomniany. `null` skasowałby go, więc obecność
  // klucza z jakąkolwiek wartością jest tu defektem, nie szczegółem.
  assert.equal(
    "dueAt" in payload,
    false,
    `planning must not touch the deadline, payload was ${JSON.stringify(payload)}`,
  );
});

test("Today says who put each item on the day", async () => {
  const plane = await mountShell();
  const planned = [
    ...plane.querySelectorAll<HTMLElement>("[data-planned-row]"),
  ];
  assert.ok(
    planned.length >= 2,
    `expected the planned rows, got ${planned.length}`,
  );

  const agentRow = planned.find((row) =>
    rowTitles(row).some((title) => title.includes("scenariusze detekcyjne")),
  );
  assert.ok(agentRow, "the agent-planned task is not on the day");
  const attribution = agentRow.querySelector<HTMLElement>("[data-planned-by]");
  assert.ok(
    attribution,
    "a planned row does not say who planned it, so 'why is this here' has no answer",
  );
  // Nie asertujemy imienia agenta — fixture nie niesie grantów, więc ekran ma
  // powiedzieć RODZAJ. Pusty napis byłby tu odpowiedzią „nikt", a to nieprawda.
  expect(attribution.textContent?.trim()).toBeTruthy();
});

test("a row with reserved time shows the time, one without says so", async () => {
  const plane = await mountShell();
  const whens = [
    ...plane.querySelectorAll<HTMLElement>("[data-planned-row]"),
  ].map((row) => (row.textContent ?? "").trim());
  assert.ok(
    whens.some((text) => text.includes("13:00")),
    `the reserved block should show its hours, rows were ${JSON.stringify(whens)}`,
  );
  assert.ok(
    whens.some((text) => text.includes("No time")),
    `a task planned without a reservation must say so, rows were ${JSON.stringify(whens)}`,
  );
});

test("a deadline warns before the day it falls on, and names the lead time", async () => {
  const plane = await mountShell();
  const rows = [
    ...plane.querySelectorAll<HTMLElement>("[data-approaching-row]"),
  ];
  assert.ok(rows.length >= 1, "no approaching deadline reached the screen");
  assert.deepEqual(
    rows.flatMap((row) => rowTitles(row)),
    ["Zamów licencje na 12 000 EPS"],
    "only work with a deadline and no plan belongs in the warning section",
  );
  const lead = rows[0]?.querySelector<HTMLElement>("[data-lead]");
  assert.equal((lead?.textContent ?? "").trim(), "in 3 days");
});

test("Today shows no attention signals — they live in the Inbox", async () => {
  // Powtarzanie sygnałów na ekranie dnia było źródłem wrażenia „po co mi to".
  // Sprawdzone przez zepsucie: dopóki pasek wyjątków stał na Today, ten
  // przypadek był czerwony.
  const plane = await mountShell();
  const text = plane.textContent ?? "";
  assert.equal(
    /unread signal|Open Inbox|needs your decision/i.test(text),
    false,
    `the day plane still repeats inbox signals: ${text.slice(0, 200)}`,
  );
});

test("the day's capacity is on the screen, computed rather than assumed", async () => {
  // Kalendarz PRZECZYTANY: spotkanie 9:00–10:00 i zarezerwowany blok 1h30m
  // z fixture'u schodzą z ośmiogodzinnego dnia roboczego.
  const plane = await mountShell(
    meetingLoop([
      {
        title: "Przegląd architektury z Northstar",
        startsAt: `${populatedPlanDayKey}T07:00:00.000Z`,
        endsAt: `${populatedPlanDayKey}T08:00:00.000Z`,
      },
    ]),
  );
  const capacity = plane.querySelector<HTMLElement>("[data-capacity]");
  assert.ok(capacity, "the day does not state its capacity");
  assert.equal(capacity.dataset.capacityKnown, "true");
  const text = (capacity.textContent ?? "").trim();
  assert.match(text, /1 meeting, 1h/);
  assert.match(text, /1h 30m reserved/);
  assert.match(text, /5h 30m free/);
});

test("without the calendar the day states no free time instead of a full one", async () => {
  // Ten sam defekt co w Kalendarzu, z tego samego miejsca: gdy spotkania nie są
  // przeczytane, `dayCapacity` liczy z pustej listy — i „6h 30m wolnego" stało
  // dokładnie NAD paskiem mówiącym, że kalendarza nie ma.
  const plane = await mountShell();
  assert.ok(
    plane.querySelector("[data-calendar-refusal]"),
    "this case needs a refused calendar to mean anything",
  );
  const capacity = plane.querySelector<HTMLElement>("[data-capacity]");
  assert.ok(capacity, "the day does not state its capacity");
  assert.equal(capacity.dataset.capacityKnown, "false");
  const text = (capacity.textContent ?? "").trim();
  assert.equal(
    /\d+\s*h\b/u.test(text),
    false,
    `the day printed an hour figure it cannot know: “${text}”`,
  );
  assert.match(text, /unknown/iu);
});

test("with no calendar, the day says so instead of showing a meeting-free day", async () => {
  const plane = await mountShell();
  const refusal = plane.querySelector<HTMLElement>("[data-calendar-refusal]");
  assert.ok(
    refusal,
    "an unavailable calendar must be stated; a silent empty list reads as 'nothing today'",
  );
  expect(refusal.textContent?.trim()).toBeTruthy();
});

test("one click shows a task, two open it — the shell's select-vs-open contract", async () => {
  // Gwarancja przeniesiona z sekcji, która pilnowała dwukolumnowego układu
  // starego pulpitu jako TEKSTU w pliku. Układ zniknął, obietnica została.
  const plane = await mountShell();
  const row = plane.querySelector<HTMLElement>("[data-planned-row]");
  assert.ok(row, "no planned row to click");

  await act(async () => {
    row.click();
  });
  assert.equal(
    row.getAttribute("aria-selected"),
    "true",
    "a single click must show the record without navigating",
  );
  await act(async () => {
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  // Ten sam zaczep, po którym rozpoznaje kontekst zadania smoke spakowanej
  // apki — liczba zakładek nie jest gwarancją, bo powłoka może otworzyć
  // rekord w bieżącej zakładce.
  assert.ok(
    container.querySelector('.shell-tab.active [data-shell-tab^="task:"]'),
    `a double click must open the record as its own context, tabs were ${[...container.querySelectorAll("[data-shell-tab]")].map((node) => node.getAttribute("data-shell-tab")).join(", ")}`,
  );
});
