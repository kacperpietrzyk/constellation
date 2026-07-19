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

// Time-only variant for rows whose surrounding copy already fixes the day.
export const formatTime = (
  value: string | number | Date,
  timeZone?: string,
): string => cachedFormatter("time", timeZone).format(new Date(value));
