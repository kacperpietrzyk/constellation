import type {
  MeetingLoopSurface,
  WorkingDayContract,
} from "@constellation/contracts";

import type { DesktopSnapshot } from "./client/workflow.js";
import { dateKeyInZone } from "./i18n.js";

// Arytmetyka dnia, osobno od ekranu. Today odpowiada na jedno pytanie — „od
// czego zacząć" — i stoi na `startAt` oraz na zarezerwowanych blokach, NIE na
// `dueAt`. Ekran zbudowany na terminach jest ekranem cudzych obietnic
// i produkuje wieczny niedoczas; termin ma tu jedną rolę: ostrzec, że coś się
// zbliża, a NIKT tego nie zaplanował.
//
// Dlaczego to jest osobny plik bez Reacta: liczba „3h 15m wolnego" jest jedyną
// liczbą na tym ekranie, która naprawdę coś znaczy, a liczby sprawdza się
// asercją, nie okiem.

export type PlannedTask = DesktopSnapshot["tasks"][number];
export type CalendarMeeting = MeetingLoopSurface["upcoming"][number]["event"];

const MINUTES_PER_DAY = 24 * 60;

/** Minuta dnia (lokalnie w strefie workspace'u) dla instantu. */
const minuteOfDayInZone = (value: string, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(value));
  const number = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  // `en-GB` zwraca 24 dla północy końca doby; 24:00 i 00:00 to ta sama chwila,
  // ale jako minuta dnia znaczą przeciwne końce, więc zostawiamy 24 * 60.
  return (number("hour") % 24) * 60 + number("minute");
};

/**
 * Ile minut danego przedziału wpada w okno pracy TEGO dnia. Przedział może
 * zaczynać się poprzedniego dnia albo kończyć następnego, więc liczymy część
 * wspólną, a nie samą długość — spotkanie 8:00–18:00 przy dniu roboczym
 * 9:00–17:00 zjada osiem godzin, nie dziesięć.
 */
export const minutesInsideWorkingDay = (
  span: { readonly startsAt: string; readonly endsAt: string },
  workingDay: WorkingDayContract,
  dayKey: string,
  timeZone: string,
): number => {
  const startKey = dateKeyInZone(span.startsAt, timeZone);
  const endKey = dateKeyInZone(span.endsAt, timeZone);
  if (endKey < dayKey || startKey > dayKey) return 0;
  const from =
    startKey < dayKey ? 0 : minuteOfDayInZone(span.startsAt, timeZone);
  const to =
    endKey > dayKey
      ? MINUTES_PER_DAY
      : minuteOfDayInZone(span.endsAt, timeZone);
  const overlap =
    Math.min(to, workingDay.endMinute) - Math.max(from, workingDay.startMinute);
  return Math.max(0, overlap);
};

/** Dzień tygodnia w formacie ustawienia dnia roboczego (1 = poniedziałek). */
export const isoWeekdayInZone = (value: string, timeZone: string): number => {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(value));
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
    short,
  );
  return index + 1;
};

/**
 * Czy spotkanie stoi na tym dniu. Jeden predykat na całe repo: po nim
 * kubełkuje się kolumnę tygodnia I liczy `meetingCount`, bo kubełkowanie po
 * samym `startsAt` rysowałoby spotkanie 23:00–01:00 raz, a liczyło dwa razy.
 * Wiersz i liczba pod nim muszą wychodzić z tego samego zdania — przepisany
 * drugi raz rozjeżdża się dokładnie wtedy, gdy ktoś poprawi jedną kopię.
 */
export const meetingFallsOnDay = (
  meeting: CalendarMeeting,
  dayKey: string,
  timeZone: string,
): boolean =>
  dateKeyInZone(meeting.startsAt, timeZone) <= dayKey &&
  dateKeyInZone(meeting.endsAt, timeZone) >= dayKey;

export type DayCapacity = {
  /** Czy w ogóle jest to dzień roboczy w tym workspace. */
  readonly isWorkingDay: boolean;
  readonly workingMinutes: number;
  readonly meetingMinutes: number;
  readonly meetingCount: number;
  readonly reservedMinutes: number;
  readonly freeMinutes: number;
};

/**
 * Pojemność dnia LICZONA z kalendarza i ustawienia dnia roboczego — nie wpisana
 * i nie zgadnięta. Wydarzenia całodniowe są wypisywane na ekranie, ale NIE
 * zjadają minut: „urodziny Anny" nie odbiera dnia pracy, a wliczone zjadałoby
 * go w całości i liczba przestałaby cokolwiek znaczyć.
 */
export const dayCapacity = (input: {
  readonly meetings: readonly CalendarMeeting[];
  readonly tasks: readonly PlannedTask[];
  readonly workingDay: WorkingDayContract;
  readonly dayKey: string;
  readonly timeZone: string;
}): DayCapacity => {
  const { meetings, tasks, workingDay, dayKey, timeZone } = input;
  const weekday = isoWeekdayInZone(`${dayKey}T12:00:00.000Z`, "UTC");
  const isWorkingDay = workingDay.weekdays.includes(weekday);
  const workingMinutes = isWorkingDay
    ? workingDay.endMinute - workingDay.startMinute
    : 0;

  const onThisDay = meetings.filter((meeting) =>
    meetingFallsOnDay(meeting, dayKey, timeZone),
  );
  const meetingMinutes = onThisDay
    .filter((meeting) => !meeting.isAllDay)
    .reduce(
      (total, meeting) =>
        total + minutesInsideWorkingDay(meeting, workingDay, dayKey, timeZone),
      0,
    );

  const reservedMinutes = tasks.reduce((total, task) => {
    const block = task.calendarBlock;
    if (block === undefined) return total;
    return total + minutesInsideWorkingDay(block, workingDay, dayKey, timeZone);
  }, 0);

  return {
    isWorkingDay,
    workingMinutes,
    meetingMinutes,
    meetingCount: onThisDay.length,
    reservedMinutes,
    freeMinutes: Math.max(0, workingMinutes - meetingMinutes - reservedMinutes),
  };
};

/**
 * Zaplanowane na dany dzień: `startAt` na ten dzień i praca jeszcze otwarta.
 * Kolejność: najpierw to, co ma zarezerwowaną godzinę (rosnąco), potem reszta —
 * bo pozycja z godziną jest umówiona z dniem, a bez godziny tylko z dniem.
 */
export const plannedForDay = (
  tasks: readonly PlannedTask[],
  dayKey: string,
  timeZone: string,
): readonly PlannedTask[] =>
  tasks
    .filter(
      (task) =>
        task.completionState === "open" &&
        task.startAt !== undefined &&
        dateKeyInZone(task.startAt, timeZone) === dayKey,
    )
    .toSorted((left, right) => {
      const leftStart = left.calendarBlock?.startsAt;
      const rightStart = right.calendarBlock?.startsAt;
      if (leftStart !== undefined && rightStart !== undefined)
        return leftStart.localeCompare(rightStart);
      if (leftStart !== undefined) return -1;
      if (rightStart !== undefined) return 1;
      // Treść rekordów jest polska i taka zostaje — po angielsku jest wyłącznie
      // interfejs, więc sortowanie po tytule idzie polską kolacją.
      return left.title.localeCompare(right.title, "pl");
    });

/**
 * Termin w zasięgu wzroku, którego NIKT nie zaplanował. To jedyne miejsce, gdzie
 * `dueAt` ma na tym ekranie prawo głosu — termin nie może pojawić się pierwszy
 * raz w dniu, w którym mija.
 *
 * `notBeforeDayKey` jest DOLNĄ granicą okna i istnieje dlatego, że samo „nie
 * dalej niż tyle dni" nie ma dna: ekran przeglądający przyszły tydzień pytał
 * o horyzont tamtego tygodnia, a dostawał wszystko po drodze — czyli listę
 * pod nagłówkiem „termin w tym tygodniu", w której terminów z tego tygodnia
 * prawie nie było. Pominięty parametr zostawia okno bez dna świadomie: dzień
 * dzisiejszy MA wciągać wszystko zaległe, bo termin po czasie, którego nikt
 * nie zaplanował, najbardziej potrzebuje dnia.
 */
export const approachingUnplanned = (
  tasks: readonly PlannedTask[],
  input: {
    readonly dayKey: string;
    readonly withinDays: number;
    readonly timeZone: string;
    readonly notBeforeDayKey?: string | undefined;
  },
): readonly PlannedTask[] => {
  const horizon = new Date(`${input.dayKey}T00:00:00.000Z`);
  horizon.setUTCDate(horizon.getUTCDate() + input.withinDays);
  const horizonKey = horizon.toISOString().slice(0, 10);
  const floorKey = input.notBeforeDayKey;
  return tasks
    .filter((task) => {
      if (task.completionState !== "open") return false;
      if (task.startAt !== undefined) return false;
      if (task.dueAt === undefined) return false;
      const dueKey = dateKeyInZone(task.dueAt, input.timeZone);
      if (dueKey > horizonKey) return false;
      return floorKey === undefined || dueKey >= floorKey;
    })
    .toSorted((left, right) =>
      (left.dueAt ?? "").localeCompare(right.dueAt ?? ""),
    );
};

/**
 * Ile dni dzieli termin od dnia, który ekran pokazuje (ujemne = po terminie).
 *
 * MIESZKA TERAZ W `i18n.ts` i jest stąd RE-EKSPORTOWANA, a nie przepisana:
 * ta sama liczba rozstrzyga teraz także, czy data ma się przeczytać słowem
 * („Yesterday") czy dniem miesiąca, więc `formatDate` musi ją znać — a `i18n`
 * nie może zaimportować tego modułu, bo ten importuje `i18n`. Dwadzieścia
 * wywołań w drzewie zostaje pod tą samą nazwą i tym samym adresem.
 */
export { daysUntil } from "./i18n.js";

/** „3h 15m", „45m", „0m" — bez zer, które nic nie wnoszą. */
export const formatSpan = (minutes: number): string => {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
};
