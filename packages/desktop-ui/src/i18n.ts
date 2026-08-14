// Shared copy helpers. One plural rule, one entity dictionary and one family of
// timestamp formats keep the tool voice identical across surfaces instead of
// each file re-deriving grammar locally.
//
// The interface is English and there is deliberately NO locale layer: this is a
// single-person tool, a second language is not a goal, and a dictionary nobody
// translates only adds a layer of indirection between the reader and the copy.
// What survives here is date formatting and the workspace timezone, which are
// not translation — they are the difference between the user's Friday and the
// server's.
//
// Dates read `Jul 21` and times read `16:40`: month-first abbreviation with a
// 24-hour clock, matching the accepted prototype. That is `en-US` with
// `hour12: false`, not plain `en-US` (which would say `4:40 PM`) and not
// `en-GB` (which would say `21 Jul`).

import { humanRecordKindRegistry } from "@constellation/contracts";

// The locale of the INTERFACE. Sorting and search over record content stay on
// Polish collation, because the records are Polish — see the localeCompare and
// toLocaleLowerCase call sites in WorkSurface and activity-collection. Those
// are data collation and are not affected by the interface language.
//
// EXPORTED, because it was written down three times. `crm/money.ts:241` and
// `settings/WorkingDaySection.tsx:29-36` each declared their own copy and the
// third one said `en-GB` — the same shape restated beside a closed constant,
// which is the family this repository keeps paying for. The settings copy is
// gone and imports this one; the money copy STAYS a copy and the refusal is
// measured, not stylistic: `crm/money.ts` has no imports at all, and this
// module pulls `@constellation/contracts` in, so importing it there would drag
// the contract package into a leaf that the hot-path budget weighs.
export const UI_LOCALE = "en-US";

// English cardinal agreement: one form for 1, another for everything else,
// including 0. The Polish one/few/many triple this replaced is gone; a caller
// that only has a regular noun can leave `many` out and get the "-s" form.
export const plural = (count: number, one: string, many?: string): string =>
  count === 1 ? one : (many ?? `${one}s`);

// "3 tasks" — the count followed by its matching form.
export const countLabel = (count: number, one: string, many?: string): string =>
  `${count} ${plural(count, one, many)}`;

// HOW FAR A DAY IS FROM THE DAY THE SCREEN IS SHOWING, IN THIS PRODUCT'S WORDS.
//
// Sixteen places used to spell this out locally and no two of them agreed.
// Today and Calendar carried the same six lines byte for byte; Renewals wrote
// its own FOUR times and said "1 days" in every one of them, in a codebase that
// has carried `countLabel` since Wave 2 for exactly that.
//
// THE CLOCK IS NOT IN HERE, AND THAT IS THE POINT. The integer comes from
// `daysUntil`, which counts CALENDAR days in the workspace timezone — so
// "yesterday" is the reader's yesterday and not the machine's, and a deadline
// two hours away is "due today" rather than "in 0 days". This function only
// turns that integer into English. Splitting the two means the words can be
// asserted with no clock at all, so no assertion over them can rot on a year,
// month, DST or leap-day boundary the way a hard-coded date already reddened
// `main` overnight once this month.
//
// A VOICE IS A READING, NOT A SCREEN. Three of them, because there are three
// real things a day count can mean here — a deadline you are answerable for, a
// countdown to a moment, and a bare distance for callers that bring their own
// verb. Written as a total `Record` so a fourth reading cannot be added by
// writing a fourth sentence somewhere else: it has to be added here, and every
// existing voice keeps compiling only because every arm is present.
export type DayDistanceVoice = "deadline" | "lead" | "elapsed";

const dayDistanceVoices: Readonly<
  Record<DayDistanceVoice, (days: number) => string>
> = {
  // A deadline you are answerable for. "overdue by 6 days" is what a reader
  // acts on; the date is what they would otherwise have to work out.
  deadline: (days) =>
    days < 0
      ? `overdue by ${countLabel(-days, "day")}`
      : days === 0
        ? "due today"
        : `due in ${countLabel(days, "day")}`,
  // A countdown to a moment that is somebody's responsibility — the same fact
  // as `deadline`, said shorter, for a chip standing beside a row.
  lead: (days) =>
    days < 0
      ? `${countLabel(-days, "day")} late`
      : days === 0
        ? "due today"
        : `in ${countLabel(days, "day")}`,
  // A bare distance in either direction, carrying no verb of its own, for
  // callers that supply one ("the lead opens …", "ends …, 12 days ago").
  elapsed: (days) =>
    days < 0
      ? `${countLabel(-days, "day")} ago`
      : days === 0
        ? "today"
        : `in ${countLabel(days, "day")}`,
};

export const dayDistance = (days: number, voice: DayDistanceVoice): string =>
  dayDistanceVoices[voice](days);

/** The voices, for a test that wants to walk all of them without naming any. */
export const dayDistanceVoiceNames = Object.keys(
  dayDistanceVoices,
) as readonly DayDistanceVoice[];

// Display labels for every record kind the product can surface (⌘K results,
// strategic ledger, impact reviews). Raw contract identifiers must not reach
// the UI.
export const recordKindLabels: Readonly<Record<string, string>> =
  Object.fromEntries(
    humanRecordKindRegistry.map((descriptor) => [
      descriptor.id,
      descriptor.label,
    ]),
  );

// Product-wide timestamp: date plus time without seconds. Seconds are
// audit-level detail and stay in the audit log, not in reading surfaces.
// Callers pass the workspace timezone so timestamps agree with the cockpit's
// workspace-calendar "today"; an invalid or unsupported identifier degrades to
// the machine timezone instead of breaking the surface. Formatters are cached
// per timezone because Intl.DateTimeFormat construction is expensive.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

const cachedFormatter = (
  style: "dateTime" | "time",
  timeZone: string | undefined,
): Intl.DateTimeFormat => {
  const key = `${style}:${timeZone ?? ""}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions =
    style === "dateTime"
      ? { dateStyle: "medium", timeStyle: "short", hour12: false }
      : { hour: "2-digit", minute: "2-digit", hour12: false };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(UI_LOCALE, { ...options, timeZone });
  } catch {
    formatter = new Intl.DateTimeFormat(UI_LOCALE, options);
  }
  formatterCache.set(key, formatter);
  return formatter;
};

export const formatDateTime = (
  value: string | number | Date,
  timeZone?: string,
): string => cachedFormatter("dateTime", timeZone).format(new Date(value));

// Weekday-and-time variant for calendar rows, where the weekday carries real
// planning meaning and the year does not. Distinct from formatDateTime (which
// shows the year) and formatTime (time only); the meeting and calendar
// surfaces share this exact shape.
const weekdayTimeFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatWeekdayTime = (value: string | number | Date): string =>
  weekdayTimeFormatter.format(new Date(value));

// Time-only variant for rows whose surrounding copy already fixes the day.
export const formatTime = (
  value: string | number | Date,
  timeZone?: string,
): string => cachedFormatter("time", timeZone).format(new Date(value));

// ── JAK CZYTA SIĘ DATA ──────────────────────────────────────────────────────
//
// Day-only variant for planning fields (start, deadline) where a clock time
// would suggest false precision. Uses the same workspace-timezone rule.
//
// THREE BRANCHES, ONE FUNCTION, AND NONE OF THEM IS A LOCALE SETTING. The
// prototype says this in nine lines (`v3/app.js:69-77`, `fmtDay`) and every
// screen of it reads dates through that one function:
//
//   • the day next door is a WORD — „Yesterday", „Today", „Tomorrow". A reader
//     who has to subtract two dates to learn that a note was touched yesterday
//     is doing the product's arithmetic;
//   • the CURRENT year is not printed — „ends Sep 30", not „ends Sep 30, 2026".
//     Every row on a screen carries it, so it separates nothing and is the one
//     part of the date the reader already knows;
//   • ANOTHER year IS printed, and without a comma — „Mar 31 2027". The comma
//     in `dateStyle: "medium"` exists to separate a year that is always there;
//     with the year gone half the time, it would appear and disappear.
//
// `Intl` cannot express any of the three. `dateStyle: "medium"` always prints
// the year and always prints the comma, in `en-US` and in `pl-PL` alike, and
// `Intl.RelativeTimeFormat` is not used anywhere in this tree. So the decision
// „the interface locale is en-US" (2026-08-13) closes the MONEY entry and only
// that one: the words below are a product rule, and `UI_LOCALE` only supplies
// the month names and the digits.
//
// WHY THE CLOCK IS NOT IN THE PURE HALF. Same reason as `dayDistance` thirty
// lines up: the words are asserted with no clock at all, so no assertion over
// them can rot on a year, month, DST or leap-day boundary — which has already
// reddened `main` overnight once this month. The clock is read in ONE line, in
// the wrapper, so the fifty-two call sites keep their two arguments.
export type DayForm = "relative" | "thisYear" | "otherYear";

/** A calendar day in the reader's zone, already split into its pieces. */
export interface CalendarDay {
  readonly day: number;
  /** The abbreviated month name in `UI_LOCALE` — „Sep". */
  readonly month: string;
  readonly year: number;
}

/**
 * WHICH BRANCH A DAY FALLS IN, from the distance and the two years. Exported
 * because the screens have to be able to SAY it: `formatDate` returns a
 * string, so a caller cannot see which of the three sentences it was given,
 * and three screens each re-deriving „is this the current year" would be the
 * same restated shape this file's header names. One rule, one place, and the
 * layout gate reads the answer off `data-day-form`.
 *
 * AND READING IT IS NOT READING THE WORDS. This attribute and the string come
 * from two separate calls over one shared branch rule, so a gate that reads
 * only the attribute is blind to `formatDayFromDays` printing something else
 * inside the branch it correctly named. The gate therefore carries BOTH: the
 * attribute for the branches whose words are a date (L10-02/03/04/05) and the
 * literal word for the branch whose words are not (L10-06, „Yesterday").
 */
export const dayFormFromDays = (
  days: number,
  year: number,
  todayYear: number,
): DayForm =>
  days >= -1 && days <= 1
    ? "relative"
    : year === todayYear
      ? "thisYear"
      : "otherYear";

/** The words. A pure function of a day distance and a calendar day. */
export const formatDayFromDays = (
  days: number,
  day: CalendarDay,
  todayYear: number,
): string => {
  switch (dayFormFromDays(days, day.year, todayYear)) {
    case "relative":
      return days === 0 ? "Today" : days === 1 ? "Tomorrow" : "Yesterday";
    case "thisYear":
      return `${day.month} ${day.day}`;
    case "otherYear":
      return `${day.month} ${day.day} ${day.year}`;
  }
};

/**
 * HOW FAR A DAY IS FROM THE DAY THE SCREEN IS SHOWING, IN CALENDAR DAYS.
 *
 * Counted in the workspace timezone, so „yesterday" is the reader's yesterday
 * and not the machine's, and a deadline two hours away is „due today" rather
 * than „in 0 days". Lived in `today-plan.ts` until this lot needed it here;
 * that module re-exports this one rather than keeping a second copy.
 */
export const daysUntil = (
  value: string | number | Date,
  dayKey: string,
  timeZone?: string,
): number => {
  const target = Date.parse(`${dateKeyInZone(value, timeZone)}T00:00:00.000Z`);
  const today = Date.parse(`${dayKey}T00:00:00.000Z`);
  return Math.round((target - today) / 86_400_000);
};

const dayPartsCache = new Map<string, Intl.DateTimeFormat>();

const dayPartsFormatter = (
  timeZone: string | undefined,
): Intl.DateTimeFormat => {
  const key = timeZone ?? "";
  const cached = dayPartsCache.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(UI_LOCALE, { ...options, timeZone });
  } catch {
    formatter = new Intl.DateTimeFormat(UI_LOCALE, options);
  }
  dayPartsCache.set(key, formatter);
  return formatter;
};

const partOf = (
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string => parts.find((part) => part.type === type)?.value ?? "";

/** The calendar day an instant falls on, in the workspace timezone. */
export const calendarDay = (
  value: string | number | Date,
  timeZone?: string,
): CalendarDay => {
  const parts = dayPartsFormatter(timeZone).formatToParts(new Date(value));
  return {
    day: Number(partOf(parts, "day")),
    month: partOf(parts, "month"),
    year: Number(partOf(parts, "year")),
  };
};

/** The one line that reads the clock, shared by the two exports below. */
const dayReading = (
  value: string | number | Date,
  timeZone: string | undefined,
): { days: number; day: CalendarDay; todayYear: number } => {
  const todayKey = dateKeyInZone(Date.now(), timeZone);
  return {
    days: daysUntil(value, todayKey, timeZone),
    day: calendarDay(value, timeZone),
    todayYear: Number(todayKey.slice(0, 4)),
  };
};

export const formatDate = (
  value: string | number | Date,
  timeZone?: string,
): string => {
  const reading = dayReading(value, timeZone);
  return formatDayFromDays(reading.days, reading.day, reading.todayYear);
};

/** Which of the three sentences `formatDate` would give this value. */
export const dayFormOf = (
  value: string | number | Date,
  timeZone?: string,
): DayForm => {
  const reading = dayReading(value, timeZone);
  return dayFormFromDays(reading.days, reading.day.year, reading.todayYear);
};

/**
 * THE DAY A SURFACE BAND STANDS ON — „Monday, 27 July 2026".
 *
 * A different reading from `formatDate` and deliberately so: on a screen whose
 * entire content is „today", „Today" is the crumb to its left, and repeating it
 * says nothing. The weekday is the fact the reader is actually after, and the
 * month is spelled out because there is exactly one of these on a screen.
 * Prototype: `v3/screens/today.js:129-130`.
 *
 * DAY BEFORE MONTH, and this is not `en-GB` sneaking in through a fourth
 * locale constant. The words come from `UI_LOCALE`; the ORDER is a typographic
 * decision of the product, taken from the prototype, which wins over the
 * contract wherever the two differ. Composed from parts rather than a second
 * locale for exactly that reason.
 *
 * Returned in two pieces because the band draws the weekday in its own
 * element: that is what lets a gate ask whether the weekday is there at all,
 * instead of comparing a whole date string that rots the next morning.
 */
export interface BandDay {
  readonly weekday: string;
  /** „27 July 2026" — everything after the comma. */
  readonly remainder: string;
}

const bandDayCache = new Map<string, Intl.DateTimeFormat>();

const bandDayFormatter = (
  timeZone: string | undefined,
): Intl.DateTimeFormat => {
  const key = timeZone ?? "";
  const cached = bandDayCache.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(UI_LOCALE, { ...options, timeZone });
  } catch {
    formatter = new Intl.DateTimeFormat(UI_LOCALE, options);
  }
  bandDayCache.set(key, formatter);
  return formatter;
};

export const formatBandDay = (
  value: string | number | Date,
  timeZone?: string,
): BandDay => {
  const parts = bandDayFormatter(timeZone).formatToParts(new Date(value));
  return {
    weekday: partOf(parts, "weekday"),
    remainder: `${partOf(parts, "day")} ${partOf(parts, "month")} ${partOf(parts, "year")}`,
  };
};

// Calendar-day helpers for the workspace timezone. Task timing is stored as a
// canonical UTC instant; the desktop edits it as a wall-clock date in the
// workspace timezone. A deadline chosen without a time of day normalizes to
// the end of that local day and a start to its beginning, so "by Friday"
// means the user's Friday, not the server's.
const zoneOffsetMs = (timeZone: string, utcMs: number): number => {
  const instant = new Date(utcMs);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant);
  } catch {
    return 0;
  }
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  const wallUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour") % 24,
    part("minute"),
    part("second"),
    instant.getUTCMilliseconds(),
  );
  return wallUtc - utcMs;
};

// "YYYY-MM-DD" of an instant in the workspace timezone (for date inputs).
//
// THE FORMATTER IS CACHED PER TIMEZONE, like every other one in this file, and
// this line stopped being a nicety in the lot that gave `formatDate` its day
// rule: every printed date now asks this helper twice — once for the value and
// once for today — so a list of forty rows was building eighty
// `Intl.DateTimeFormat` objects where it used to build none. The comment at the
// top of this file already said construction is expensive; this one call site
// was the exception.
const dayKeyCache = new Map<string, Intl.DateTimeFormat>();

export const dateKeyInZone = (
  value: string | number | Date,
  timeZone?: string,
): string => {
  const key = timeZone ?? "";
  let formatter = dayKeyCache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", {
        dateStyle: "short",
        timeZone,
      });
    } catch {
      formatter = new Intl.DateTimeFormat("en-CA", { dateStyle: "short" });
    }
    dayKeyCache.set(key, formatter);
  }
  return formatter.format(new Date(value));
};

// The UTC instant for a "YYYY-MM-DD" wall-clock date in the workspace
// timezone: the start (00:00:00.000) or end (23:59:59.999) of that local day.
// Two offset probes converge across DST transitions.
export const instantForZonedDate = (
  date: string,
  timeZone: string | undefined,
  edge: "start" | "end",
): string | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) return undefined;
  const wallUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    edge === "start" ? 0 : 23,
    edge === "start" ? 0 : 59,
    edge === "start" ? 0 : 59,
    edge === "start" ? 0 : 999,
  );
  if (Number.isNaN(wallUtc)) return undefined;
  const zone = timeZone ?? "";
  let utc = wallUtc - (zone === "" ? 0 : zoneOffsetMs(zone, wallUtc));
  if (zone !== "") utc = wallUtc - zoneOffsetMs(zone, utc);
  return new Date(utc).toISOString();
};
