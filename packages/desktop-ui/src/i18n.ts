// Shared Polish copy helpers. One plural pipeline, one entity dictionary and
// one timestamp format keep the tool voice identical across surfaces instead
// of each file re-deriving Polish grammar locally.

const pluralRules = new Intl.PluralRules("pl-PL");

// Picks the Polish plural form for a cardinal count: "one" (1), "few" (2–4
// outside 12–14) or "many" (everything else, including 0).
export const pluralize = (
  count: number,
  one: string,
  few: string,
  many: string,
): string => {
  const rule = pluralRules.select(count);
  return rule === "one" ? one : rule === "few" ? few : many;
};

// "3 zadania" — the count followed by its matching plural form.
export const countLabel = (
  count: number,
  one: string,
  few: string,
  many: string,
): string => `${count} ${pluralize(count, one, few, many)}`;

// Polish labels for every record kind the product can surface (⌘K results,
// strategic ledger, impact reviews). Raw contract identifiers must not reach
// the UI. "Capture" and "Deliverable" stay untranslated only where the product
// already treats them as proper nouns; the display dictionary prefers Polish.
export const recordKindLabels: { readonly [kind: string]: string } = {
  task: "Zadanie",
  project: "Projekt",
  capture: "Capture",
  source: "Źródło",
  note: "Notatka",
  document: "Dokument",
  deliverable: "Rezultat",
  organization: "Organizacja",
  person: "Osoba",
  opportunity: "Szansa",
  offer: "Oferta",
  renewal: "Odnowienie",
  relationship_fact: "Fakt relacji",
  fact: "Fakt",
  decision: "Decyzja",
  impact_review: "Przegląd skutków",
  area: "Obszar",
  recurrence: "Cykl",
  radar_candidate: "Radar wiedzy",
  meeting: "Spotkanie",
  commitment: "Zobowiązanie",
};

// Product-wide timestamp: pl-PL, date plus time without seconds. Seconds are
// audit-level detail and stay in the audit log, not in reading surfaces.
// Callers pass the workspace timezone so timestamps agree with the cockpit's
// workspace-calendar "dziś"; an invalid or unsupported identifier degrades to
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
      ? { dateStyle: "medium", timeStyle: "short" }
      : { hour: "2-digit", minute: "2-digit" };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("pl-PL", { ...options, timeZone });
  } catch {
    formatter = new Intl.DateTimeFormat("pl-PL", options);
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
const weekdayTimeFormatter = new Intl.DateTimeFormat("pl-PL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
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
      formatter = new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeZone,
      });
    } catch {
      formatter = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
    }
    dateFormatterCache.set(key, formatter);
  }
  return formatter.format(new Date(value));
};

// Calendar-day helpers for the workspace timezone. Task timing is stored as a
// canonical UTC instant; the desktop edits it as a wall-clock date in the
// workspace timezone. A deadline chosen without a time of day normalizes to
// the end of that local day and a start to its beginning, so "do piątku"
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
