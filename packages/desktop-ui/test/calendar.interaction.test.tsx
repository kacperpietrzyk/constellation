import { strict as assert } from "node:assert";

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  TaskIdSchema,
  type CommandEnvelope,
  type MeetingLoopSurface,
  type TaskId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type { DesktopSnapshot } from "../src/client/workflow.js";
import { instantForZonedDate } from "../src/i18n.js";
import {
  agentPlannedTaskId,
  populatedPlanDayKey,
  populatedShellQueries,
  populatedTaskList,
  unplannedDeadlineTaskId,
} from "./shell-fixture.js";

// Decyzje z przejścia przez prototyp, przeniesione z prozy do kodu. Calendar
// jest tym samym materiałem co Today w powiększeniu na tydzień, więc obietnice
// są te same — i tak samo mierzone zachowaniem, nie tekstem pliku.
//
// Najważniejsza jest pierwsza: położenie pracy na dniu wygląda identycznie
// niezależnie od tego, czy zapisze plan, czy termin. Różnica między „zajmę się
// tym w środę" a „obiecuję to na środę" jest cała w danych.
//
// Ten ekran montujemy WPROST, nie przez powłokę: podpięcie do rejestru celów
// jest robotą dyspozytora i w tym drzewie jeszcze nie istnieje. Kontrakt,
// którego dyspozytor musi dotrzymać, jest tu sprawdzony osobno — na szwie
// `updateTaskDetails`.

const ZONE = "Europe/Warsaw";
/** Poniedziałek tygodnia, w którym stoi fixture (3 sierpnia 2026). */
const WEEK_START = "2026-08-03";
const WEDNESDAY = "2026-08-05";
/** Terminy dosypywane do migawki: przed poprzednim tygodniem, w nim, i po. */
const LONG_AGO = "2026-07-17T15:00:00.000Z";
const LAST_WEEK = "2026-07-30T15:00:00.000Z";
const NEXT_WEEK = "2026-08-12T15:00:00.000Z";

let container: HTMLDivElement;
let root: Root;
let mounted = false;
const commands: CommandEnvelope[] = [];
const planned: { taskId: TaskId; dayKey: string }[] = [];
const opened: TaskId[] = [];

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
    generatedAt: "2026-08-03T06:00:00.000Z",
  }) as unknown as MeetingLoopSurface;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  commands.length = 0;
  planned.length = 0;
  opened.length = 0;
  // Ekran tygodnia pyta zegar, a fixture ma stałe daty. Bez ustawienia
  // „dzisiaj" ten plik przechodziłby albo padał w zależności od tego, kiedy
  // się go uruchomi — czyli mierzyłby datę, nie ekran.
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

const buildClient = async (
  meetings?: MeetingLoopSurface,
): Promise<ConstellationRendererClient> => {
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const base = createScenarioClient({
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
  return meetings === undefined
    ? base
    : { ...base, getMeetingLoop: async () => meetings };
};

/**
 * Termin bez planu, doklejony do migawki. Zasobnik nad tygodniem ma sens
 * dopiero wtedy, gdy jest CO z niego wypaść przy kroku na inny tydzień —
 * fixture niesie jeden taki termin, a to za mało, żeby odróżnić „filtr działa"
 * od „lista i tak jest pusta".
 */
const deadlineOn = (
  snapshot: DesktopSnapshot,
  suffix: string,
  title: string,
  dueAt: string,
): DesktopSnapshot["tasks"][number] => {
  const template = snapshot.tasks.find(
    (entry) => entry.id === unplannedDeadlineTaskId,
  );
  assert.ok(template, "the fixture lost the unplanned deadline");
  // Kopia BEZ planu: `startAt` decyduje, czy zadanie w ogóle trafia do tacki
  // pracy niezaplanowanej, więc przeniesienie go razem z resztą pól cicho
  // opróżniłoby tackę i wszystkie asercje niżej mierzyłyby pustkę.
  const withoutStart = { ...template };
  delete (withoutStart as { startAt?: string }).startAt;
  return {
    ...withoutStart,
    id: TaskIdSchema.parse(`00000000-0000-4000-8000-0000000007${suffix}`),
    title,
    dueAt,
  };
};

const mountCalendar = async (
  meetings?: MeetingLoopSurface,
  options?: { readonly extraDeadlines: boolean },
): Promise<HTMLElement> => {
  const { CalendarSurface } = await import("../src/CalendarSurface.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = await buildClient(meetings);
  const loaded = await loadDesktopSnapshot(client);
  assert.equal(
    loaded.tasks.length,
    populatedTaskList.items.length,
    "the snapshot did not take the fixture's tasks, so nothing below measures a row",
  );
  const snapshot: DesktopSnapshot =
    options?.extraDeadlines === true
      ? {
          ...loaded,
          tasks: [
            ...loaded.tasks,
            deadlineOn(loaded, "01", "Termin sprzed tego tygodnia", LONG_AGO),
            deadlineOn(loaded, "02", "Termin w poprzednim tygodniu", LAST_WEEK),
            deadlineOn(loaded, "03", "Termin w przyszłym tygodniu", NEXT_WEEK),
          ],
        }
      : loaded;

  // Powłoka po zaplanowaniu ZAPISUJE `startAt`, więc wiersz, z którego wyszedł
  // wybór, znika: zadanie wypada z zasobnika i staje w kolumnie dnia. Zaślepka,
  // która tylko notuje wywołanie, zostawia wiersz na ekranie — a wtedy
  // „ognisko wróciło na przycisk" jest twierdzeniem o świecie, którego nie ma.
  const Harness = ({ initial }: { readonly initial: DesktopSnapshot }) => {
    const [current, setCurrent] = useState(initial);
    return createElement(CalendarSurface, {
      client,
      snapshot: current,
      selectedTaskId: undefined,
      planBusyTaskId: undefined,
      onSelectTask: () => {},
      onOpenTask: (taskId) => {
        opened.push(taskId);
      },
      onPlanTaskOnDay: (taskId, dayKey) => {
        planned.push({ taskId, dayKey });
        const startAt = instantForZonedDate(dayKey, ZONE, "start");
        if (startAt === undefined) return;
        setCurrent((snapshotNow) => ({
          ...snapshotNow,
          tasks: snapshotNow.tasks.map((entry) =>
            entry.id === taskId ? { ...entry, startAt } : entry,
          ),
        }));
      },
    });
  };

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(Harness, { initial: snapshot }));
  });
  return container;
};

const fire = async (node: Element, type: string): Promise<void> => {
  await act(async () => {
    node.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  });
};

const press = async (node: Element, key: string): Promise<void> => {
  await act(async () => {
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
};

const dayColumn = (scope: Element, dayKey: string): HTMLElement => {
  const column = scope.querySelector<HTMLElement>(`[data-day="${dayKey}"]`);
  assert.ok(column, `the week has no column for ${dayKey}`);
  return column;
};

test("B3 the calendar exposes days as drop targets", async () => {
  const scope = await mountCalendar();
  const days = [...scope.querySelectorAll<HTMLElement>("[data-day]")];
  assert.equal(
    days.length,
    7,
    `a week is seven days, the screen exposed ${days.length}`,
  );
  assert.deepEqual(
    days.map((day) => day.getAttribute("data-day")),
    [
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ],
    "the week must be derived from today, not from a hardcoded range",
  );
  // Dzisiejsza kolumna jest oznaczona NAPISEM, nie samym kolorem.
  const marked = [...scope.querySelectorAll("[data-today-column]")];
  assert.equal(marked.length, 1, "exactly one column is today");
  assert.equal(
    marked[0]?.closest("[data-day]")?.getAttribute("data-day"),
    populatedPlanDayKey,
  );
});

test("B1/B2 at week zoom: dropping work on a day plans it, and names that day", async () => {
  const scope = await mountCalendar();
  const row = scope.querySelector<HTMLElement>(
    `[data-approaching-row][data-task-row="${unplannedDeadlineTaskId}"]`,
  );
  assert.ok(row, "the unplanned deadline is not draggable from the tray");
  assert.equal(
    row.getAttribute("draggable"),
    "true",
    "work the app owns must be movable",
  );

  await fire(row, "dragstart");
  const target = dayColumn(scope, WEDNESDAY);
  await fire(target, "dragover");
  await fire(target, "drop");

  assert.deepEqual(
    planned,
    [{ taskId: unplannedDeadlineTaskId, dayKey: WEDNESDAY }],
    `dropping named the wrong day or nothing at all: ${JSON.stringify(planned)}`,
  );
});

test("the keyboard reaches the same plan — a drag-only affordance is unreachable", async () => {
  const scope = await mountCalendar();
  const row = scope.querySelector<HTMLElement>(
    `[data-approaching-row][data-task-row="${unplannedDeadlineTaskId}"]`,
  );
  assert.ok(row, "no tray row to plan");
  const opener = row.querySelector<HTMLElement>("[data-move-task]");
  assert.ok(
    opener,
    "a row that can be dragged offers no keyboard way to the same write",
  );

  await act(async () => {
    opener.click();
  });
  const picker = row.querySelector<HTMLElement>("[data-day-picker]");
  assert.ok(picker, "the keyboard path opens no day picker");
  // Ognisko idzie do menu samo: menu, które trzeba znaleźć myszą, nie jest
  // drogą klawiaturową.
  assert.equal(
    document.activeElement?.getAttribute("data-move-to"),
    WEEK_START,
    "the picker did not take focus",
  );
  const choice = picker.querySelector<HTMLElement>(
    `[data-move-to="${WEDNESDAY}"]`,
  );
  assert.ok(choice, "the picker offers no day from the shown week");
  await act(async () => {
    choice.click();
  });

  assert.deepEqual(planned, [
    { taskId: unplannedDeadlineTaskId, dayKey: WEDNESDAY },
  ]);
});

test("Enter on the plan control does not open the record instead", async () => {
  // Kliknięcie z testu nie wytwarza zdarzenia klawiatury, więc „droga
  // klawiaturowa działa" sprawdzone samym `click()` jest twierdzeniem o myszy.
  // Tu naciskamy naprawdę. Uruchomienie przycisku Enterem robi przeglądarka
  // (happy-dom tego nie syntetyzuje), więc mierzalne jest to, co naprawdę było
  // zepsute: bez zatrzymania klawisza na przycisku Enter dopływa do wiersza,
  // system roving robi `preventDefault` — czyli kasuje uruchomienie przycisku —
  // i OTWIERA rekord. Wtedy klawiatura robi co innego niż mysz.
  const scope = await mountCalendar();
  const opener = scope.querySelector<HTMLElement>(
    `[data-approaching-row] [data-move-task="${unplannedDeadlineTaskId}"]`,
  );
  assert.ok(opener, "no keyboard control to plan the row");
  await act(async () => {
    opener.focus();
  });
  await press(opener, "Enter");

  assert.deepEqual(
    opened,
    [],
    "Enter on the plan control opened the record instead of reaching the button",
  );
  await press(opener, " ");
  assert.deepEqual(
    opened,
    [],
    "Space on the plan control reached the row instead of the button",
  );
});

test("closing the day picker gives focus back to the control that opened it", async () => {
  const scope = await mountCalendar();
  const opener = scope.querySelector<HTMLElement>(
    `[data-approaching-row] [data-move-task="${unplannedDeadlineTaskId}"]`,
  );
  assert.ok(opener, "no keyboard control to plan the row");

  await act(async () => {
    opener.focus();
    opener.click();
  });
  const picker = scope.querySelector<HTMLElement>("[data-day-picker]");
  assert.ok(picker, "the picker did not open");
  await press(picker, "Escape");
  assert.equal(
    scope.querySelector("[data-day-picker]"),
    null,
    "Escape did not close the picker",
  );
  // Porównanie przez `assert.ok`, nie `assert.equal`: przy niepowodzeniu
  // `assert.equal` inspekcjonuje OBA węzły DOM, żeby zbudować różnicę, i na
  // drzewie happy-doma potrafi się w tym zawiesić — czyli czerwony przypadek
  // wygląda jak zawieszony przyrząd, a nie jak wynik.
  assert.ok(
    document.activeElement === opener,
    "Escape dropped focus instead of returning it to the plan control",
  );

  // …a po WYBRANIU dnia ognisko idzie na kolumnę, która pracę dostała.
  // Wiersz, z którego wyszedł wybór, przestaje istnieć (zadanie ma `startAt`,
  // więc wypadło z zasobnika), a `focus()` na odpiętym węźle nie robi nic —
  // ognisko spadłoby na `<body>`, czyli tam, gdzie klawiatura traci miejsce.
  await act(async () => {
    opener.focus();
    opener.click();
  });
  const choice = scope.querySelector<HTMLElement>(
    `[data-day-picker] [data-move-to="${WEDNESDAY}"]`,
  );
  assert.ok(choice, "the reopened picker offers no day");
  await act(async () => {
    choice.click();
  });
  assert.deepEqual(planned, [
    { taskId: unplannedDeadlineTaskId, dayKey: WEDNESDAY },
  ]);
  // Wiersz naprawdę zniknął — bez tego reszta mierzyłaby zaślepkę. Porównanie
  // przez `assert.ok`, nie `assert.equal`: przy niepowodzeniu `assert.equal`
  // buduje różnicę z węzła DOM i na drzewie happy-doma potrafi się w tym
  // zawiesić — czerwony przypadek wygląda wtedy jak zawieszony przyrząd.
  assert.ok(
    scope.querySelector(
      `[data-approaching-row][data-task-row="${unplannedDeadlineTaskId}"]`,
    ) === null,
    "the harness left the planned row in the tray, so focus had somewhere stale to land",
  );
  assert.equal(
    opener.isConnected,
    false,
    "the control that opened the picker must be gone for this case to mean anything",
  );
  const landed = document.activeElement;
  assert.ok(
    landed instanceof HTMLElement && landed.getAttribute("data-day") !== null,
    `planning dropped focus onto <${landed?.nodeName.toLowerCase()}> instead of the day column`,
  );
  assert.equal(
    landed.getAttribute("data-day"),
    WEDNESDAY,
    "focus landed on a day column, but not the one that received the work",
  );
});

test("B1/B2 at the seam: the shell's write sets startAt and never mentions dueAt", async () => {
  // Ekran mówi tylko „ten task, ten dzień" — zapis należy do powłoki. Ta część
  // kontraktu jest tu, bo bez niej „nie rusza terminu" byłoby twierdzeniem
  // o kodzie, którego nikt nie wykonał.
  const client = await buildClient();
  const { loadDesktopSnapshot, updateTaskDetails } =
    await import("../src/client/workflow.js");
  const { instantForZonedDate, dateKeyInZone } = await import("../src/i18n.js");
  const snapshot = await loadDesktopSnapshot(client);
  const task = snapshot.tasks.find(
    (entry) => entry.id === unplannedDeadlineTaskId,
  );
  assert.ok(task, "the fixture lost the unplanned deadline");
  const startAt = instantForZonedDate(WEDNESDAY, ZONE, "start");
  assert.ok(startAt, "a day key must resolve to an instant");

  await updateTaskDetails(client, snapshot, task.id, task.version, { startAt });

  const writes = commands.filter(
    (command) => command.commandName === "task.updateDetails",
  );
  assert.equal(
    writes.length,
    1,
    `expected one plan write, got ${writes.length}`,
  );
  const payload = writes[0]?.payload as Record<string, unknown>;
  assert.equal(payload.taskId, unplannedDeadlineTaskId);
  // Instant, nie napis z datą: początek dnia w strefie workspace'u wypada
  // poprzedniej doby UTC, więc porównanie prefiksu sprawdzałoby strefę
  // maszyny, nie dzień, który człowiek widzi.
  assert.equal(dateKeyInZone(String(payload.startAt), ZONE), WEDNESDAY);
  // …a termin NIE jest nawet wspomniany. `null` skasowałby go, więc obecność
  // klucza z jakąkolwiek wartością jest tu defektem, nie szczegółem.
  assert.equal(
    "dueAt" in payload,
    false,
    `planning must not touch the deadline, payload was ${JSON.stringify(payload)}`,
  );
});

test("B4 meetings cannot be dragged or moved by keyboard", async () => {
  const scope = await mountCalendar(
    meetingLoop([
      {
        title: "Przegląd architektury z Northstar",
        startsAt: "2026-08-05T07:00:00.000Z",
        endsAt: "2026-08-05T08:30:00.000Z",
      },
    ]),
  );
  const meetings = [...scope.querySelectorAll<HTMLElement>("[data-meeting]")];
  assert.equal(meetings.length, 1, "the meeting did not reach the week");
  assert.equal(
    meetings[0]?.closest("[data-day]")?.getAttribute("data-day"),
    WEDNESDAY,
    "the meeting landed on the wrong day",
  );
  for (const meeting of meetings) {
    assert.equal(
      meeting.getAttribute("draggable"),
      null,
      "a meeting must not be draggable — the app moves only its own work",
    );
    assert.equal(
      meeting.querySelector("[data-move-task]"),
      null,
      "a meeting must not offer a keyboard move either",
    );
    assert.equal(
      meeting.closest('[role="option"]'),
      null,
      "a meeting is not an option in a listbox, so it must not be inside one",
    );
  }
});

test("B5 …and EVERY meeting says why, rather than being silently inert", async () => {
  const scope = await mountCalendar(
    meetingLoop([
      {
        title: "Przegląd architektury z Northstar",
        startsAt: "2026-08-05T07:00:00.000Z",
        endsAt: "2026-08-05T08:30:00.000Z",
      },
      {
        title: "Retrospektywa zespołu",
        startsAt: "2026-08-06T12:00:00.000Z",
        endsAt: "2026-08-06T13:00:00.000Z",
      },
    ]),
  );
  const meetings = [...scope.querySelectorAll<HTMLElement>("[data-meeting]")];
  // „Każde spotkanie" sprawdzone na jednym spotkaniu jest twierdzeniem
  // o jednym spotkaniu, a na zerze — twierdzeniem o niczym.
  assert.equal(meetings.length, 2, "both meetings must reach the week");
  for (const meeting of meetings) {
    const badge = meeting.querySelector<HTMLElement>("[data-meeting-readonly]");
    assert.ok(
      badge,
      `an immovable row that says nothing is just a broken row: ${meeting.textContent}`,
    );
    // Nie „cokolwiek niepustego": kropka spełnia „niepuste", a nie tłumaczy nic.
    assert.equal(
      badge.textContent?.trim(),
      "Read-only",
      "the badge must name the constraint, not merely occupy space",
    );
  }

  // Powód pełny jest pomocą NA ŻĄDANIE, nie akapitem pod nagłówkiem. Stoi RAZ.
  const helps = [...scope.querySelectorAll<HTMLElement>("[data-meeting-help]")];
  assert.equal(
    helps.length,
    1,
    `the same answer must be offered once, the week offered it ${helps.length} times`,
  );
  const help = helps[0];
  assert.ok(help);
  assert.equal(help.getAttribute("aria-haspopup"), "dialog");
  // WPIS #4 REJESTRU, MIERZONY TUTAJ, BO PRZELOT PIKSELI TU NIE DOJEŻDŻA.
  // Kształt tej afordancji — okrągły znacznik „?" mniejszy od etykiety, przy
  // której stoi (`v3/app.css:896-903`) — jest zmierzony parami D2-03a i D2-03b
  // na Dzisiaj. Bliźniak na Kalendarzu bierze tę samą regułę TYLKO wtedy, gdy
  // niesie tę samą klasę, a klienta scenariuszowego bramki układu nie da się
  // doprowadzić do tygodnia ze spotkaniem (odmawia kalendarza), więc żaden
  // przelot pikseli tego przycisku nie widzi. Do naprawy po przeglądzie lotu D2
  // stał tu `ghost-button compact` ze zdaniem „Why read-only?" — słowny przycisk
  // w rozmiarze kontrolki, czyli dokładnie ta forma, którą wpis #4 nazywa
  // rozjazdem — obok Dzisiaj, które ten sam temat pomocy otwierało znacznikiem.
  //
  // TA ASERCJA JEST UDOWODNIONA, nie zadeklarowana: cofnięcie klasy do
  // `ghost-button compact` z napisem „Why read-only?" dało 336 zielonych → 1
  // czerwony (ten) → 336 zielonych po przywróceniu, 2026-08-11.
  assert.equal(
    help.className,
    "help-mark",
    "the Calendar trigger must take the same rule as the one on Today, or the shape measured there says nothing about this one",
  );
  // Nie „niepuste": znacznik jest ZNAKIEM, a etykieta idzie do `aria-label`,
  // bo „?" sam nie mówi czytnikowi ekranu, o co pyta.
  assert.equal(help.textContent?.trim(), "?");
  assert.equal(
    help.getAttribute("aria-label"),
    "Why the calendar is read-only",
  );
  await act(async () => {
    help.click();
  });
  const dialog = document.querySelector("dialog");
  assert.ok(dialog, "the reason did not open");
  assert.match(
    dialog.textContent ?? "",
    /Why can't I move a meeting here\?/,
    "the dialog opened on the wrong topic",
  );
});

test("a week with no meetings on it explains nothing, because nothing is there", async () => {
  // Przycisk „dlaczego tylko do odczytu?" nad tygodniem BEZ spotkań tłumaczy
  // zachowanie rzeczy, której na ekranie nie ma — i stał tam nawet wtedy, gdy
  // kalendarz był odmówiony.
  const scope = await mountCalendar(meetingLoop([]));
  assert.equal(
    scope.querySelectorAll("[data-meeting]").length,
    0,
    "this case needs a week with no meetings to mean anything",
  );
  // `assert.ok` na porównaniu, nie `assert.equal` na węźle: różnica budowana
  // z drzewa happy-doma potrafi zawiesić czerwony przypadek.
  assert.ok(
    scope.querySelector("[data-meeting-help]") === null,
    "the week explains why meetings are immovable, with no meeting on it",
  );
});

test("a week with no meetings shown says so, instead of looking meeting-free", async () => {
  // Scenariuszowy klient odmawia kalendarza — dokładnie tak wygląda urządzenie
  // bez uprawnienia. Cicha pusta siatka byłaby kłamstwem, wokół którego
  // właściciel zaplanowałby tydzień.
  const scope = await mountCalendar();
  const refusal = scope.querySelector<HTMLElement>("[data-calendar-refusal]");
  assert.ok(refusal, "an unavailable calendar must be stated");
  expect(refusal.textContent?.trim()).toBeTruthy();
});

test("each day states its capacity, and the week states its own", async () => {
  const scope = await mountCalendar(
    meetingLoop([
      {
        title: "Przegląd architektury z Northstar",
        startsAt: "2026-08-05T07:00:00.000Z", // 09:00–10:30 w Warszawie
        endsAt: "2026-08-05T08:30:00.000Z",
      },
    ]),
  );
  // Poniedziałek niesie zarezerwowany blok 13:00–14:30 z fixture'u.
  const monday = dayColumn(scope, WEEK_START);
  assert.equal(
    monday.querySelector("[data-day-free]")?.textContent?.trim(),
    "6h 30m free",
  );
  const wednesday = dayColumn(scope, WEDNESDAY);
  assert.equal(
    wednesday.querySelector("[data-day-free]")?.textContent?.trim(),
    "6h 30m free",
  );
  // Weekend nie dostaje ośmiu godzin „wolnego", których nikt nie przepracuje.
  assert.equal(
    dayColumn(scope, "2026-08-08")
      .querySelector("[data-day-free]")
      ?.textContent?.trim(),
    "Non-working",
  );
  const week = scope.querySelector<HTMLElement>("[data-week-capacity]");
  assert.ok(week, "the week does not state its capacity");
  assert.equal(week.dataset.capacityKnown, "true");
  const text = (week.textContent ?? "").replace(/\s+/gu, " ").trim();
  // 5 × 8h = 40h, minus 1h30m spotkania, minus 1h30m rezerwacji.
  assert.match(text, /37h free/);
  assert.match(text, /1 meeting, 1h 30m/);
  assert.match(text, /1h 30m reserved/);
});

test("without the calendar the week states no capacity at all", async () => {
  // Scenariuszowy klient odmawia kalendarza. `buildWeek` dostaje wtedy pustą
  // listę spotkań, więc każda liczba pojemności jest liczbą policzoną BEZ
  // twardych ograniczeń — „40h wolnego" stałoby wprost nad paskiem z odmową.
  const scope = await mountCalendar();
  assert.ok(
    scope.querySelector("[data-calendar-refusal]"),
    "this case needs a refused calendar to mean anything",
  );
  const week = scope.querySelector<HTMLElement>("[data-week-capacity]");
  assert.ok(week, "the week does not state its capacity");
  assert.equal(week.dataset.capacityKnown, "false");
  const text = (week.textContent ?? "").replace(/\s+/gu, " ").trim();
  assert.equal(
    /\d+\s*h\b/u.test(text),
    false,
    `the week printed an hour figure it cannot know: “${text}”`,
  );
  assert.match(text, /unknown/iu);

  // Kolumny dnia kłamały tą samą liczbą, z tego samego powodu.
  const free = [...scope.querySelectorAll<HTMLElement>("[data-day-free]")];
  assert.equal(free.length, 7, "every day states something about its capacity");
  const working = free.filter(
    (badge) => (badge.textContent ?? "").trim() !== "Non-working",
  );
  assert.equal(working.length, 5, "the fixture works Monday to Friday");
  for (const badge of working)
    assert.equal(
      (badge.textContent ?? "").trim(),
      "Unknown",
      "a working day printed free minutes computed without the calendar",
    );
  assert.ok(
    scope.querySelector("[data-day-meter]") === null,
    "the meter draws a picture of a capacity the screen does not have",
  );
});

test("stepping to another week moves the grid by exactly seven days", async () => {
  const scope = await mountCalendar();
  const next = scope.querySelector<HTMLElement>('[data-week-step="next"]');
  assert.ok(next, "the week cannot be navigated");
  await act(async () => {
    next.click();
  });
  assert.deepEqual(
    [...scope.querySelectorAll("[data-day]")].map((day) =>
      day.getAttribute("data-day"),
    ),
    [
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ],
  );
  assert.equal(
    scope.querySelector("[data-today-column]"),
    null,
    "today is not in the shown week, so nothing may claim to be it",
  );
  const back = scope.querySelector<HTMLElement>('[data-week-step="current"]');
  assert.ok(back, "there is no way back to this week");
  await act(async () => {
    back.click();
  });
  assert.equal(
    scope.querySelector("[data-day]")?.getAttribute("data-day"),
    WEEK_START,
  );
});

test("the tray holds the deadlines its heading claims, week by week", async () => {
  const scope = await mountCalendar(undefined, { extraDeadlines: true });
  const trayTitles = (): readonly string[] =>
    [...scope.querySelectorAll<HTMLElement>("[data-approaching-row]")].map(
      (row) =>
        (row.querySelector("[data-row-title]")?.textContent ?? "").trim(),
    );
  const heading = (): string =>
    (
      scope.querySelector<HTMLElement>("[data-tray-heading]")?.textContent ?? ""
    ).replace(/\s+/gu, " ");
  const step = async (direction: "previous" | "next" | "current") => {
    const button = scope.querySelector<HTMLElement>(
      `[data-week-step="${direction}"]`,
    );
    assert.ok(button, `the week cannot be stepped ${direction}`);
    await act(async () => {
      button.click();
    });
  };

  // Tydzień bieżący ZOSTAJE bez dna: termin po czasie, którego nikt nie
  // zaplanował, najbardziej potrzebuje dnia — i nagłówek się do tego przyznaje.
  assert.deepEqual(trayTitles().toSorted(), [
    "Termin sprzed tego tygodnia",
    "Termin w poprzednim tygodniu",
    "Zamów licencje na 12 000 EPS",
  ]);
  assert.match(heading(), /already late/u);

  // Krok naprzód pokazywał wszystko po drodze — czyli listę pod nagłówkiem
  // „termin w tym tygodniu", w której terminów z tego tygodnia było najmniej.
  await step("next");
  assert.deepEqual(trayTitles(), ["Termin w przyszłym tygodniu"]);
  assert.equal(
    /already late/u.test(heading()),
    false,
    "a future week has nothing late in it, so the heading must not claim any",
  );

  // Krok wstecz dawał ujemny horyzont i wyłącznie stare zaległości: termin
  // stojący W oglądanym tygodniu wypadał, a wcześniejszy zostawał.
  await step("current");
  await step("previous");
  assert.deepEqual(trayTitles(), ["Termin w poprzednim tygodniu"]);
});

test("planned work stands on the day its startAt names", async () => {
  const scope = await mountCalendar();
  const monday = dayColumn(scope, WEEK_START);
  const rows = [...monday.querySelectorAll<HTMLElement>("[data-planned-row]")];
  assert.equal(
    rows.length,
    2,
    `the fixture plans two tasks on Monday, the column showed ${rows.length}`,
  );
  assert.equal(
    rows[0]?.getAttribute("data-task-row"),
    agentPlannedTaskId,
    "the item with a reserved hour comes first — it is agreed with the clock",
  );
  const texts = rows.map((row) => (row.textContent ?? "").trim());
  assert.ok(
    texts.some((text) => text.includes("13:00")),
    `a reserved block shows its hours, rows were ${JSON.stringify(texts)}`,
  );
  assert.ok(
    texts.some((text) => text.includes("No time")),
    `work planned without a reservation must say so, rows were ${JSON.stringify(texts)}`,
  );
});
