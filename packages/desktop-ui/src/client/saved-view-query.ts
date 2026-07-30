import {
  translatedRelationConditions,
  type QueryEnvelope,
} from "@constellation/contracts";

import { dateKeyInZone } from "../i18n.js";

import type { WorkOverviewProjection } from "./workflow.js";

type SavedView = WorkOverviewProjection["savedViews"][number];
export type SavedViewFilters = SavedView["filters"];
type TaskListParameters = Extract<
  QueryEnvelope,
  { queryName: "task.list" }
>["parameters"];
export type TaskListFilterParameters = Omit<
  TaskListParameters,
  "spaceId" | "limit" | "cursor" | "orderBy"
>;

export interface SavedViewQueryContext {
  /** The workspace timezone, not the machine's — see `dueWindow` below. */
  readonly timeZone?: string;
  /** Injected so a translation can be asserted without waiting for a date. */
  readonly now: Date;
}

/**
 * How far the workspace timezone sits from UTC at a given instant. A day key is
 * a statement about a place; the query compares instants. Appending `Z` to a
 * zone-local key would shift every boundary by the offset — for a workspace two
 * hours ahead, two hours of tasks fall on the wrong side of "today".
 */
const zoneOffsetMs = (at: Date, timeZone: string | undefined): number => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const part = (type: string): string =>
      parts.find((entry) => entry.type === type)?.value ?? "00";
    const asIfUtc = Date.parse(
      `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`,
    );
    return Number.isFinite(asIfUtc) ? asIfUtc - at.getTime() : 0;
  } catch {
    return -at.getTimezoneOffset() * 60_000;
  }
};

/** The instant a zone-local day begins, resolved twice so a DST change lands. */
const zoneDayStart = (key: string, timeZone: string | undefined): string => {
  const naive = Date.parse(`${key}T00:00:00.000Z`);
  let instant = naive - zoneOffsetMs(new Date(naive), timeZone);
  instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant).toISOString();
};

/** Calendar arithmetic on the day key itself, never on the machine's clock. */
const shiftedDayKey = (key: string, offset: number): string => {
  const shifted = new Date(Date.parse(`${key}T00:00:00.000Z`));
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
};

const weekdayIndex = (now: Date, timeZone: string | undefined): number => {
  try {
    const name = new Intl.DateTimeFormat("en", {
      timeZone,
      weekday: "short",
    }).format(now);
    const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
      name,
    );
    return index < 0 ? (now.getDay() + 6) % 7 : index;
  } catch {
    return (now.getDay() + 6) % 7;
  }
};

const relationTranslation = (
  filters: SavedViewFilters,
): TaskListFilterParameters => {
  const conditions = translatedRelationConditions(filters);
  return conditions.length === 0
    ? {}
    : { relationConditions: conditions.map((condition) => ({ ...condition })) };
};

/**
 * Every key a saved view can carry, and how a `task.list` query says the same
 * thing. Typed as a total record over the filter vocabulary, so a saved-view
 * key added later cannot reach production without somebody deciding what an
 * operator sends to mean it: the kernel's key-by-key copy guards the WRITE
 * path, and nothing guarded this one.
 *
 * A translator returning `{}` is a decision too, and each says why.
 */
const TRANSLATORS: {
  readonly [Key in keyof Required<SavedViewFilters>]: (
    value: NonNullable<Required<SavedViewFilters>[Key]>,
    filters: SavedViewFilters,
    context: SavedViewQueryContext,
  ) => TaskListFilterParameters;
} = {
  operationalStates: (value) => ({ operationalStates: [...value] }),
  statusIds: (value) => ({ statusIds: [...value] }),
  priorities: (value) => ({ priorities: [...value] }),
  scheduled: (value) => ({ scheduled: value }),
  assigneePrincipalIds: (value) => ({ assigneePrincipalIds: [...value] }),
  // `false` means "no filter" in a saved view, so it becomes no parameter. The
  // query refuses `unassigned: false` outright rather than accepting a
  // parameter that changes nothing.
  unassigned: (value) => (value ? { unassigned: true } : {}),
  fields: (value) => ({ fields: value.map((entry) => ({ ...entry })) }),
  // The three retired id lists have no parameter of their own: they ARE
  // relation conditions, written before ADR-045 gave them that name. All four
  // keys translate the whole filter object rather than their own value, so a
  // view carrying only a retired list still sends its condition — and one
  // carrying both does not send it twice. Translating the same object more than
  // once is why the result is assigned, never appended to.
  projectIds: (_value, filters) => relationTranslation(filters),
  areaIds: (_value, filters) => relationTranslation(filters),
  initiativeIds: (_value, filters) => relationTranslation(filters),
  relationConditions: (_value, filters) => relationTranslation(filters),
  // A named window becomes explicit boundaries, because the kernel does no
  // timezone arithmetic anywhere — `cockpit.week` takes its week start from the
  // caller for the same reason. The boundaries are computed in the WORKSPACE
  // timezone: the renderer has a second week computation that uses the local
  // machine day instead, and for anyone whose machine sits in another zone the
  // two disagree about which week "this week" is.
  //
  // `dueAfter` is inclusive and `dueBefore` exclusive on the kernel's side, so
  // a window runs from the start of its first day to the start of the day after
  // its last. Ending it a millisecond earlier would leave a gap that a deadline
  // can fall into.
  dueWindow: (value, _filters, context) => {
    if (value === "overdue") return { dueBefore: context.now.toISOString() };
    const todayKey = dateKeyInZone(context.now, context.timeZone);
    if (value === "today")
      return {
        dueAfter: zoneDayStart(todayKey, context.timeZone),
        dueBefore: zoneDayStart(shiftedDayKey(todayKey, 1), context.timeZone),
      };
    const index = weekdayIndex(context.now, context.timeZone);
    return {
      dueAfter: zoneDayStart(shiftedDayKey(todayKey, -index), context.timeZone),
      dueBefore: zoneDayStart(
        shiftedDayKey(todayKey, 7 - index),
        context.timeZone,
      ),
    };
  },
};

/**
 * The parameters that make `task.list` answer what a saved view shows.
 *
 * Two things it deliberately does not carry. Sort: a view sorts by
 * `updated_desc | due_asc | title_asc` while the query orders by
 * `created_desc | due_asc`, so two of the three orders have no equivalent and
 * the caller gets creation order. And paging: the desktop applies a view over
 * the whole Space at once, while the query pages — reading one page and
 * stopping is a different answer, however faithfully the filters translated.
 */
export const savedViewTaskListParameters = (
  filters: SavedViewFilters,
  context: SavedViewQueryContext,
): TaskListFilterParameters => {
  let parameters: TaskListFilterParameters = {};
  for (const key of Object.keys(TRANSLATORS) as (keyof SavedViewFilters)[]) {
    const value = filters[key];
    if (value === undefined) continue;
    const translate = TRANSLATORS[key] as (
      value: unknown,
      filters: SavedViewFilters,
      context: SavedViewQueryContext,
    ) => TaskListFilterParameters;
    parameters = { ...parameters, ...translate(value, filters, context) };
  }
  return parameters;
};
