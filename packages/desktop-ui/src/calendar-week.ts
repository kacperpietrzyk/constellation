import type { WorkingDayContract } from "@constellation/contracts";

import {
  dayCapacity,
  isoWeekdayInZone,
  meetingFallsOnDay,
  plannedForDay,
  type CalendarMeeting,
  type DayCapacity,
  type PlannedTask,
} from "./today-plan.js";

// Tydzień jako CZAS, osobno od ekranu. Calendar to ten sam materiał co Today,
// tylko w innym powiększeniu, więc arytmetyka jest tamta sama: `dayCapacity`
// i `plannedForDay` przychodzą z `today-plan.ts` i nie są tu przepisywane.
// Kształt przepisany w drugim miejscu to klasa defektu, którą to repo złapało
// już trzy razy — dwa ekrany liczące osobno różnią się dokładnie wtedy, gdy
// ktoś poprawi jeden z nich.
//
// Czego ten plik świadomie NIE robi: nie pyta zegara. „Dzisiaj" wchodzi
// parametrem, a granice tygodnia liczą się na UTC z klucza `YYYY-MM-DD`.
// Wersja licząca `new Date(key).getDay()` przeskakuje o tydzień na maszynie
// z ujemnym przesunięciem — czyli test przechodziłby lokalnie i padał w CI,
// albo, gorzej, odwrotnie.

const DAY_MS = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** Czy napis jest kluczem dnia, którym ten moduł umie się posługiwać. */
export const isDayKey = (value: string): boolean => DAY_KEY.test(value);

const utcMsOf = (dayKey: string): number => {
  const match = DAY_KEY.exec(dayKey);
  if (match === null)
    throw new Error("Calendar week arithmetic needs a YYYY-MM-DD key.");
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

/** Klucz dnia przesunięty o `days` — bez dotykania strefy maszyny. */
export const shiftDayKey = (dayKey: string, days: number): string =>
  new Date(utcMsOf(dayKey) + days * DAY_MS).toISOString().slice(0, 10);

/** Ile dni dzieli dwa klucze (dodatnie, gdy `to` jest później). */
export const daysBetweenKeys = (from: string, to: string): number =>
  Math.round((utcMsOf(to) - utcMsOf(from)) / DAY_MS);

/**
 * Poniedziałek tygodnia, w którym stoi dany dzień, przesunięty o `weekOffset`
 * tygodni. Tydzień jest WYLICZANY, nie wpisany.
 */
export const weekStartKey = (dayKey: string, weekOffset = 0): string => {
  const weekday = isoWeekdayInZone(`${dayKey}T12:00:00.000Z`, "UTC");
  return shiftDayKey(dayKey, -(weekday - 1) + weekOffset * 7);
};

/** Siedem kluczy dnia, od poniedziałku. */
export const weekDayKeys = (
  dayKey: string,
  weekOffset = 0,
): readonly string[] => {
  const start = weekStartKey(dayKey, weekOffset);
  return Array.from({ length: 7 }, (_unused, index) =>
    shiftDayKey(start, index),
  );
};

export type CalendarDay = {
  readonly key: string;
  /** 1 = poniedziałek, w formacie ustawienia dnia roboczego. */
  readonly isoWeekday: number;
  readonly isToday: boolean;
  readonly meetings: readonly CalendarMeeting[];
  /** Praca z zarezerwowaną godziną — blok niesie czas trwania. */
  readonly timed: readonly PlannedTask[];
  /** Zaplanowane na ten dzień, ale nieoszacowane: `startAt` bez bloku. */
  readonly loose: readonly PlannedTask[];
  readonly capacity: DayCapacity;
};

export type WeekTotals = {
  readonly freeMinutes: number;
  readonly meetingMinutes: number;
  readonly meetingCount: number;
  readonly reservedMinutes: number;
  readonly plannedCount: number;
};

export type CalendarWeek = {
  readonly startKey: string;
  readonly endKey: string;
  readonly days: readonly CalendarDay[];
  readonly totals: WeekTotals;
};

/**
 * Suma tygodnia liczona TYLKO z dni roboczych. Doliczenie soboty i niedzieli
 * dołożyłoby godziny, których nikt nie zamierza przepracować, i nagłówek
 * zacząłby kłamać w stronę optymizmu. `plannedCount` idzie po wszystkich
 * dniach, bo praca położona na sobotę nadal jest położona.
 */
export const weekTotals = (days: readonly CalendarDay[]): WeekTotals => {
  const working = days.filter((day) => day.capacity.isWorkingDay);
  const sum = (
    entries: readonly CalendarDay[],
    pick: (day: CalendarDay) => number,
  ): number => entries.reduce((total, day) => total + pick(day), 0);
  return {
    freeMinutes: sum(working, (day) => day.capacity.freeMinutes),
    meetingMinutes: sum(working, (day) => day.capacity.meetingMinutes),
    meetingCount: sum(working, (day) => day.capacity.meetingCount),
    reservedMinutes: sum(working, (day) => day.capacity.reservedMinutes),
    plannedCount: sum(days, (day) => day.timed.length + day.loose.length),
  };
};

export const buildWeek = (input: {
  readonly todayKey: string;
  readonly weekOffset: number;
  readonly meetings: readonly CalendarMeeting[];
  readonly tasks: readonly PlannedTask[];
  readonly workingDay: WorkingDayContract;
  readonly timeZone: string;
}): CalendarWeek => {
  const { todayKey, weekOffset, meetings, tasks, workingDay, timeZone } = input;
  const keys = weekDayKeys(todayKey, weekOffset);
  const days = keys.map((key): CalendarDay => {
    const onThisDay = meetings
      .filter((meeting) => meetingFallsOnDay(meeting, key, timeZone))
      .toSorted((left, right) => {
        // Całodniowe idą na górę kolumny: nie mają godziny, więc wstawione
        // między pozycje z godziną udawałyby północ.
        if (left.isAllDay !== right.isAllDay) return left.isAllDay ? -1 : 1;
        return left.startsAt.localeCompare(right.startsAt);
      });
    const planned = plannedForDay(tasks, key, timeZone);
    return {
      key,
      isoWeekday: isoWeekdayInZone(`${key}T12:00:00.000Z`, "UTC"),
      isToday: key === todayKey,
      meetings: onThisDay,
      timed: planned.filter((task) => task.calendarBlock !== undefined),
      loose: planned.filter((task) => task.calendarBlock === undefined),
      // Kubełek, nie cała lista: liczba pod kolumną liczy dokładnie to, co
      // w kolumnie widać.
      capacity: dayCapacity({
        meetings: onThisDay,
        tasks: planned,
        workingDay,
        dayKey: key,
        timeZone,
      }),
    };
  });
  return {
    startKey: keys[0] ?? todayKey,
    endKey: keys[6] ?? todayKey,
    days,
    totals: weekTotals(days),
  };
};

export type PlanIntent<Id extends string = string> = {
  readonly taskId: Id;
  readonly dayKey: string;
};

/**
 * Jedyna droga z gestu do zapisu — wspólna dla myszy i dla klawiatury. Obie
 * wchodzą tutaj, więc „przeciągnij" i „zaplanuj na dzień" nie mogą się
 * rozjechać, a to, czego NIE da się przeciągnąć (spotkania), nie ma też drogi
 * klawiaturowej: żeby ją mieć, musiałoby dostać wywołanie tej funkcji.
 *
 * Zwraca zamiar, nie zapis: co z niego wyniknie, decyduje powłoka. Ustawia
 * `startAt`, NIGDY `dueAt` — gest znaczy „zajmę się tym w środę", a nie
 * „obiecuję to na środę".
 */
export const planIntent = <Id extends string>(
  taskId: Id | undefined,
  dayKey: string | undefined,
): PlanIntent<Id> | undefined => {
  if (taskId === undefined || taskId === "") return undefined;
  if (dayKey === undefined || !isDayKey(dayKey)) return undefined;
  return { taskId, dayKey };
};
