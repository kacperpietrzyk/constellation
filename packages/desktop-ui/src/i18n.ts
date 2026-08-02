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
const UI_LOCALE = "en-US";

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
// Six surfaces used to spell this out locally and no two of them agreed. Today
// and Calendar carried the same six lines byte for byte; Renewals wrote its own
// three times and said "1 days" in every one of them, in a codebase that has
// carried `countLabel` since Wave 2 for exactly that.
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

// Day-only variant for planning fields (start, deadline) where a clock time
// would suggest false precision. Uses the same workspace-timezone rule.
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export const formatDate = (
  value: string | number | Date,
  timeZone?: string,
): string => {
  const key = timeZone ?? "";
  let formatter = dateFormatterCache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(UI_LOCALE, {
        dateStyle: "medium",
        timeZone,
      });
    } catch {
      formatter = new Intl.DateTimeFormat(UI_LOCALE, { dateStyle: "medium" });
    }
    dateFormatterCache.set(key, formatter);
  }
  return formatter.format(new Date(value));
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
export const dateKeyInZone = (
  value: string | number | Date,
  timeZone?: string,
): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "short",
      timeZone,
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("en-CA", { dateStyle: "short" }).format(
      new Date(value),
    );
  }
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
