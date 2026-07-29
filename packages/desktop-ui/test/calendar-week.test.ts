/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_WORKING_DAY } from "@constellation/contracts";

import {
  buildWeek,
  daysBetweenKeys,
  planIntent,
  shiftDayKey,
  weekDayKeys,
  weekStartKey,
} from "../src/calendar-week.js";
import { dateKeyInZone } from "../src/i18n.js";
// Predykat „spotkanie stoi na tym dniu" ma w repo jedno miejsce, i jest nim
// arytmetyka dnia — tydzień tylko jej używa.
import {
  dayCapacity,
  formatSpan,
  meetingFallsOnDay,
} from "../src/today-plan.js";
import type { CalendarMeeting, PlannedTask } from "../src/today-plan.js";

// Tydzień to arytmetyka, a arytmetykę sprawdza się asercją: „3 sierpnia"
// wygląda tak samo, czy wypadło w dobrym tygodniu, czy o siedem dni obok.

const ZONE = "Europe/Warsaw";
const MONDAY = "2026-08-03";

const task = (
  over: Partial<PlannedTask> & { readonly title: string },
): PlannedTask =>
  ({
    id: `task-${over.title}`,
    spaceId: "space",
    status: {
      id: "status",
      label: "In progress",
      operationalSemantics: "actionable",
    },
    completionState: "open",
    attachments: [],
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
    version: 1,
    ...over,
  }) as unknown as PlannedTask;

const meeting = (over: {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isAllDay?: boolean;
}): CalendarMeeting =>
  ({
    provider: "fixture",
    calendarExternalId: "cal",
    eventExternalId: `event-${over.title}`,
    revision: "1",
    isAllDay: false,
    attendees: [],
    ...over,
  }) as unknown as CalendarMeeting;

test("the week is derived from the day, and stepping is exactly seven days", () => {
  assert.equal(weekStartKey(MONDAY), MONDAY);
  assert.equal(weekStartKey("2026-08-09"), MONDAY); // niedziela należy do tego tygodnia
  assert.equal(weekStartKey("2026-08-06"), MONDAY);
  assert.equal(weekStartKey(MONDAY, -1), "2026-07-27");
  assert.equal(weekStartKey(MONDAY, 1), "2026-08-10");
  assert.deepEqual(weekDayKeys(MONDAY), [
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ]);
  assert.equal(daysBetweenKeys(MONDAY, "2026-08-09"), 6);
  // Przez zmianę czasu — doba trwająca 23 albo 25 godzin nie może przesunąć
  // klucza dnia o pół doby.
  assert.equal(shiftDayKey("2026-10-24", 7), "2026-10-31");
  assert.equal(weekStartKey("2026-11-01"), "2026-10-26");
});

test("the week does not depend on the machine's timezone", () => {
  // Klucz dnia liczony przez `new Date(key).getDay()` na maszynie z ujemnym
  // przesunięciem cofa się o dobę i cały tydzień przeskakuje. Wchodzimy tu
  // kluczem, nie instantem, więc odpowiedź jest jedna niezależnie od maszyny —
  // a ten przypadek pilnuje, żeby ktoś nie wrócił do liczenia na `Date`
  // lokalnym.
  const localOffsetMinutes = new Date(
    `${MONDAY}T12:00:00.000Z`,
  ).getTimezoneOffset();
  assert.equal(
    weekStartKey(MONDAY),
    MONDAY,
    `the week start moved on a machine offset by ${localOffsetMinutes} minutes`,
  );
  // Instant tuż przed północą UTC opisuje w Warszawie już następny dzień —
  // dlatego klucz rozstrzyga strefa workspace'u, a nie strefa maszyny, i to
  // klucz, nie instant, wchodzi do arytmetyki tygodnia.
  const lateSunday = "2026-08-02T22:30:00.000Z";
  assert.equal(dateKeyInZone(lateSunday, ZONE), MONDAY);
  assert.equal(weekStartKey(dateKeyInZone(lateSunday, ZONE)), MONDAY);
  assert.equal(weekStartKey(dateKeyInZone(lateSunday, "UTC")), "2026-07-27");
});

test("a meeting is bucketed by the same predicate that counts it", () => {
  // Spotkanie przez północ: kubełkowanie po samym `startsAt` narysowałoby je
  // raz, a `dayCapacity` policzyłby je na obu dniach. Wiersz i liczba muszą
  // wyjść z jednego predykatu.
  const overnight = meeting({
    title: "overnight",
    startsAt: "2026-08-03T21:00:00.000Z", // 23:00 w Warszawie
    endsAt: "2026-08-03T23:00:00.000Z", // 01:00 następnego dnia
  });
  assert.equal(meetingFallsOnDay(overnight, MONDAY, ZONE), true);
  assert.equal(meetingFallsOnDay(overnight, "2026-08-04", ZONE), true);

  const week = buildWeek({
    todayKey: MONDAY,
    weekOffset: 0,
    meetings: [overnight],
    tasks: [],
    workingDay: DEFAULT_WORKING_DAY,
    timeZone: ZONE,
  });
  // Porównanie idzie do arytmetyki liczonej z PEŁNEJ listy, nie z kubełka:
  // kubełek podany do `dayCapacity` zgadza się sam ze sobą niezależnie od tego,
  // czy jest dobrze zebrany, więc taka asercja mierzyłaby własną zgodność
  // i przechodziła nad zgubionym spotkaniem.
  for (const day of week.days) {
    const fromEverything = dayCapacity({
      meetings: [overnight],
      tasks: [],
      workingDay: DEFAULT_WORKING_DAY,
      dayKey: day.key,
      timeZone: ZONE,
    });
    assert.equal(
      day.meetings.length,
      fromEverything.meetingCount,
      `${day.key} shows ${day.meetings.length} meetings but the arithmetic sees ${fromEverything.meetingCount}`,
    );
  }
});

test("each day's capacity is the shared arithmetic, not a second copy of it", () => {
  const week = buildWeek({
    todayKey: MONDAY,
    weekOffset: 0,
    meetings: [
      meeting({
        title: "review",
        startsAt: "2026-08-03T07:00:00.000Z", // 09:00–10:30
        endsAt: "2026-08-03T08:30:00.000Z",
      }),
    ],
    tasks: [
      task({
        title: "reserved",
        startAt: "2026-08-03T07:00:00.000Z",
        calendarBlock: {
          ownedBlockExternalId: "block",
          calendarExternalId: "cal",
          revision: "1",
          startsAt: "2026-08-03T11:00:00.000Z", // 13:00–14:30
          endsAt: "2026-08-03T12:30:00.000Z",
        },
      } as Partial<PlannedTask> & { readonly title: string }),
      task({ title: "loose", startAt: "2026-08-05T07:00:00.000Z" }),
      task({
        title: "done",
        startAt: "2026-08-05T07:00:00.000Z",
        completionState: "completed",
      }),
    ],
    workingDay: DEFAULT_WORKING_DAY,
    timeZone: ZONE,
  });

  const monday = week.days[0]!;
  assert.equal(monday.timed.length, 1);
  assert.equal(monday.loose.length, 0);
  assert.deepEqual(
    monday.capacity,
    dayCapacity({
      meetings: monday.meetings,
      tasks: [...monday.timed, ...monday.loose],
      workingDay: DEFAULT_WORKING_DAY,
      dayKey: MONDAY,
      timeZone: ZONE,
    }),
  );
  assert.equal(formatSpan(monday.capacity.freeMinutes), "5h");

  const wednesday = week.days[2]!;
  assert.deepEqual(
    wednesday.loose.map((entry) => entry.title),
    ["loose"],
    "finished work is not planned work, and must not stand on the day",
  );
  // Praca bez bloku nie mówi, ile trwa, więc nie zjada minut. Zmyślenie czasu
  // trwania byłoby jedyną nieprawdziwą liczbą na tym ekranie.
  assert.equal(wednesday.capacity.freeMinutes, 8 * 60);
});

test("the week total counts working days only, and says how much is planned", () => {
  const week = buildWeek({
    todayKey: MONDAY,
    weekOffset: 0,
    meetings: [
      meeting({
        title: "saturday call",
        startsAt: "2026-08-08T07:00:00.000Z",
        endsAt: "2026-08-08T08:00:00.000Z",
      }),
    ],
    tasks: [
      task({ title: "sunday work", startAt: "2026-08-09T07:00:00.000Z" }),
    ],
    workingDay: DEFAULT_WORKING_DAY,
    timeZone: ZONE,
  });
  // Pięć dni roboczych po osiem godzin. Weekend nie dokłada szesnastu godzin
  // „wolnego", których nikt nie zamierza przepracować.
  assert.equal(week.totals.freeMinutes, 5 * 8 * 60);
  assert.equal(
    week.totals.meetingCount,
    0,
    "a Saturday meeting is not working time",
  );
  // …ale praca położona na niedzielę nadal jest położona i musi być policzona.
  assert.equal(week.totals.plannedCount, 1);
  assert.equal(week.days[6]?.capacity.isWorkingDay, false);
});

test("the working day is a setting here too, so a longer one leaves more room", () => {
  const week = buildWeek({
    todayKey: MONDAY,
    weekOffset: 0,
    meetings: [],
    tasks: [],
    workingDay: {
      startMinute: 7 * 60,
      endMinute: 19 * 60,
      weekdays: [1, 2, 3],
    },
    timeZone: ZONE,
  });
  assert.equal(week.totals.freeMinutes, 3 * 12 * 60);
  assert.equal(week.days[3]?.capacity.isWorkingDay, false);
});

test("today is marked in the week that contains it, and only there", () => {
  const thisWeek = buildWeek({
    todayKey: "2026-08-06",
    weekOffset: 0,
    meetings: [],
    tasks: [],
    workingDay: DEFAULT_WORKING_DAY,
    timeZone: ZONE,
  });
  assert.deepEqual(
    thisWeek.days.filter((day) => day.isToday).map((day) => day.key),
    ["2026-08-06"],
  );
  const nextWeek = buildWeek({
    todayKey: "2026-08-06",
    weekOffset: 1,
    meetings: [],
    tasks: [],
    workingDay: DEFAULT_WORKING_DAY,
    timeZone: ZONE,
  });
  assert.equal(nextWeek.startKey, "2026-08-10");
  assert.equal(
    nextWeek.days.some((day) => day.isToday),
    false,
  );
});

test("a plan intent needs a task and a real day, and carries nothing else", () => {
  assert.deepEqual(planIntent("task-1", "2026-08-05"), {
    taskId: "task-1",
    dayKey: "2026-08-05",
  });
  // Puszczenie zadania obok kolumny, a nie na nią, nie jest planem.
  assert.equal(planIntent("task-1", undefined), undefined);
  assert.equal(planIntent("task-1", "Wednesday"), undefined);
  // Upuszczenie bez przeciągania — na przykład po tym, jak gest się urwał.
  assert.equal(planIntent(undefined, "2026-08-05"), undefined);
  assert.equal(planIntent("", "2026-08-05"), undefined);
  // Zamiar niesie DZIEŃ i nic więcej: nie ma tu miejsca, w którym mógłby się
  // pojawić termin.
  assert.deepEqual(
    Object.keys(planIntent("task-1", "2026-08-05") ?? {}).toSorted(),
    ["dayKey", "taskId"],
  );
});
