/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_WORKING_DAY } from "@constellation/contracts";

import {
  approachingUnplanned,
  dayCapacity,
  daysUntil,
  formatSpan,
  minutesInsideWorkingDay,
  plannedForDay,
  type CalendarMeeting,
  type PlannedTask,
} from "../src/today-plan.js";

// Pojemność dnia jest JEDYNĄ liczbą na Today, która naprawdę coś znaczy —
// ile miejsca zostało. Liczbę sprawdza się asercją, nie okiem, bo „3h 15m"
// wygląda tak samo, czy jest policzone dobrze, czy źle.

const ZONE = "Europe/Warsaw";
const DAY = "2026-07-27"; // poniedziałek

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

test("a meeting only eats the part of it that falls inside the working day", () => {
  // 8:00–18:00 lokalnie przy dniu roboczym 9:00–17:00 to osiem godzin zajętych,
  // nie dziesięć. Wersja licząca samą długość spotkania pokazywałaby ujemną
  // pojemność jako fakt.
  const long = meeting({
    title: "long",
    startsAt: "2026-07-27T06:00:00.000Z", // 08:00 w Warszawie
    endsAt: "2026-07-27T16:00:00.000Z", // 18:00
  });
  assert.equal(
    minutesInsideWorkingDay(long, DEFAULT_WORKING_DAY, DAY, ZONE),
    8 * 60,
  );

  const evening = meeting({
    title: "evening",
    startsAt: "2026-07-27T17:00:00.000Z", // 19:00
    endsAt: "2026-07-27T18:00:00.000Z", // 20:00
  });
  assert.equal(
    minutesInsideWorkingDay(evening, DEFAULT_WORKING_DAY, DAY, ZONE),
    0,
  );

  const otherDay = meeting({
    title: "tuesday",
    startsAt: "2026-07-28T08:00:00.000Z",
    endsAt: "2026-07-28T09:00:00.000Z",
  });
  assert.equal(
    minutesInsideWorkingDay(otherDay, DEFAULT_WORKING_DAY, DAY, ZONE),
    0,
  );
});

test("the day's capacity is computed from the calendar, never assumed", () => {
  const capacity = dayCapacity({
    meetings: [
      meeting({
        title: "review",
        startsAt: "2026-07-27T07:00:00.000Z", // 09:00–10:30
        endsAt: "2026-07-27T08:30:00.000Z",
      }),
      meeting({
        title: "workshop",
        startsAt: "2026-07-27T09:30:00.000Z", // 11:30–12:45
        endsAt: "2026-07-27T10:45:00.000Z",
      }),
    ],
    tasks: [
      task({
        title: "detection scenarios",
        startAt: "2026-07-27T00:00:00.000Z",
        calendarBlock: {
          ownedBlockExternalId: "block",
          calendarExternalId: "cal",
          revision: "1",
          startsAt: "2026-07-27T11:00:00.000Z", // 13:00–14:30
          endsAt: "2026-07-27T12:30:00.000Z",
        },
      } as Partial<PlannedTask> & { readonly title: string }),
    ],
    workingDay: DEFAULT_WORKING_DAY,
    dayKey: DAY,
    timeZone: ZONE,
  });

  assert.equal(capacity.workingMinutes, 8 * 60);
  assert.equal(capacity.meetingMinutes, 90 + 75);
  assert.equal(capacity.meetingCount, 2);
  assert.equal(capacity.reservedMinutes, 90);
  assert.equal(capacity.freeMinutes, 480 - 165 - 90);
  assert.equal(formatSpan(capacity.freeMinutes), "3h 45m");
});

test("an all-day event is shown but does not swallow the day", () => {
  // Wliczone zjadałoby cały dzień, więc liczba przestałaby cokolwiek znaczyć:
  // „urodziny Anny" nie odbiera ośmiu godzin pracy.
  const capacity = dayCapacity({
    meetings: [
      meeting({
        title: "birthday",
        startsAt: "2026-07-26T22:00:00.000Z",
        endsAt: "2026-07-27T22:00:00.000Z",
        isAllDay: true,
      }),
    ],
    tasks: [],
    workingDay: DEFAULT_WORKING_DAY,
    dayKey: DAY,
    timeZone: ZONE,
  });
  assert.equal(capacity.meetingCount, 1);
  assert.equal(capacity.meetingMinutes, 0);
  assert.equal(capacity.freeMinutes, 8 * 60);
});

test("a day outside the working week has no capacity to report", () => {
  const sunday = dayCapacity({
    meetings: [],
    tasks: [],
    workingDay: DEFAULT_WORKING_DAY,
    dayKey: "2026-07-26",
    timeZone: ZONE,
  });
  assert.equal(sunday.isWorkingDay, false);
  assert.equal(sunday.workingMinutes, 0);
  assert.equal(sunday.freeMinutes, 0);
});

test("the working day is a setting, so a longer one leaves more room", () => {
  // Sprawdzone przez zepsucie ośmiu godzin wpisanych w kod: gdyby ekran dalej
  // je zakładał, ta asercja by padła.
  const capacity = dayCapacity({
    meetings: [],
    tasks: [],
    workingDay: {
      startMinute: 7 * 60,
      endMinute: 19 * 60,
      weekdays: [1, 2, 3, 4, 5],
    },
    dayKey: DAY,
    timeZone: ZONE,
  });
  assert.equal(capacity.freeMinutes, 12 * 60);
});

test("planned means startAt on this day, with reserved time first", () => {
  const tasks = [
    task({ title: "loose", startAt: "2026-07-27T00:00:00.000Z" }),
    task({
      title: "reserved",
      startAt: "2026-07-27T00:00:00.000Z",
      calendarBlock: {
        ownedBlockExternalId: "b",
        calendarExternalId: "c",
        revision: "1",
        startsAt: "2026-07-27T11:00:00.000Z",
        endsAt: "2026-07-27T12:00:00.000Z",
      },
    } as Partial<PlannedTask> & { readonly title: string }),
    task({ title: "tomorrow", startAt: "2026-07-28T00:00:00.000Z" }),
    task({
      title: "done today",
      startAt: "2026-07-27T00:00:00.000Z",
      completionState: "completed",
    }),
    task({
      title: "unplanned but due today",
      dueAt: "2026-07-27T21:59:59.999Z",
    }),
  ];

  assert.deepEqual(
    plannedForDay(tasks, DAY, ZONE).map((entry) => entry.title),
    ["reserved", "loose"],
  );
});

test("a deadline warns before the day it falls on, and only when nobody planned it", () => {
  const tasks = [
    task({ title: "in four days", dueAt: "2026-07-31T21:59:59.999Z" }),
    task({ title: "overdue", dueAt: "2026-07-21T21:59:59.999Z" }),
    task({ title: "far away", dueAt: "2026-09-01T21:59:59.999Z" }),
    task({
      title: "due soon but planned",
      dueAt: "2026-07-30T21:59:59.999Z",
      startAt: "2026-07-27T00:00:00.000Z",
    }),
    task({
      title: "due soon but finished",
      dueAt: "2026-07-30T21:59:59.999Z",
      completionState: "completed",
    }),
  ];

  assert.deepEqual(
    approachingUnplanned(tasks, {
      dayKey: DAY,
      withinDays: 7,
      timeZone: ZONE,
    }).map((entry) => entry.title),
    ["overdue", "in four days"],
  );
});

test("a window with a floor holds only the deadlines inside it", () => {
  // Bez dolnej granicy „nie dalej niż tyle dni" nie ma dna: ekran pytający
  // o okno przyszłego tygodnia dostawał wszystko po drodze — czyli listę,
  // w której terminów z pytanego okna było najmniej.
  const tasks = [
    task({ title: "before the window", dueAt: "2026-07-21T21:59:59.999Z" }),
    task({ title: "first day of it", dueAt: "2026-08-03T21:59:59.999Z" }),
    task({ title: "last day of it", dueAt: "2026-08-09T21:59:59.999Z" }),
    task({ title: "past the window", dueAt: "2026-08-10T21:59:59.999Z" }),
  ];

  const inside = approachingUnplanned(tasks, {
    dayKey: DAY,
    withinDays: 13, // 2026-07-27 + 13 = 2026-08-09
    timeZone: ZONE,
    notBeforeDayKey: "2026-08-03",
  }).map((entry) => entry.title);
  assert.deepEqual(inside, ["first day of it", "last day of it"]);

  // Pominięta granica ZOSTAWIA okno bez dna — świadomie, bo bieżący dzień ma
  // wciągać zaległości. To jest różnica, nie przypadek.
  const withoutFloor = approachingUnplanned(tasks, {
    dayKey: DAY,
    withinDays: 13,
    timeZone: ZONE,
  }).map((entry) => entry.title);
  assert.deepEqual(withoutFloor, [
    "before the window",
    "first day of it",
    "last day of it",
  ]);

  // Okno w przeszłości: horyzont ujemny nie może znaczyć „wszystko stare".
  const behind = approachingUnplanned(tasks, {
    dayKey: DAY,
    withinDays: -1, // 2026-07-26
    timeZone: ZONE,
    notBeforeDayKey: "2026-07-20",
  }).map((entry) => entry.title);
  assert.deepEqual(behind, ["before the window"]);
});

test("the lead time says how far off the deadline is, in whole days", () => {
  assert.equal(daysUntil("2026-07-31T21:59:59.999Z", DAY, ZONE), 4);
  assert.equal(daysUntil("2026-07-27T21:59:59.999Z", DAY, ZONE), 0);
  assert.equal(daysUntil("2026-07-21T21:59:59.999Z", DAY, ZONE), -6);
});

test("a span reads the way a person would say it", () => {
  assert.equal(formatSpan(0), "0m");
  assert.equal(formatSpan(-30), "0m");
  assert.equal(formatSpan(45), "45m");
  assert.equal(formatSpan(120), "2h");
  assert.equal(formatSpan(195), "3h 15m");
});
