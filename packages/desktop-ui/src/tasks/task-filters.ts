import type { TaskRow, WorkSavedView } from "./task-view.js";
import { dateKeyInZone } from "../i18n.js";

// Applying a saved view to the rows the shell already holds. This stays a local
// operation on purpose: switching view is a chip click, and a round trip with a
// loading state would make the cheapest interaction on the screen the slowest.
// The kernel resolves the one filter a client cannot honestly evaluate —
// relation conditions — and hands back the task ids that satisfy them.

/** Which week a named window means, in the WORKSPACE timezone. The renderer has
 *  a second week computation that uses the machine's day; for anyone whose
 *  machine sits in another zone the two disagree about which week is "this"
 *  one, and the workspace is the one that owns the answer. */
const weekBounds = (
  todayKey: string,
  now: Date,
  timeZone: string,
): { readonly first: string; readonly last: string } => {
  let index: number;
  try {
    const name = new Intl.DateTimeFormat("en", {
      timeZone,
      weekday: "short",
    }).format(now);
    const found = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
      name,
    );
    index = found < 0 ? (now.getDay() + 6) % 7 : found;
  } catch {
    index = (now.getDay() + 6) % 7;
  }
  const shifted = (offset: number): string => {
    const day = new Date(Date.parse(`${todayKey}T00:00:00.000Z`));
    day.setUTCDate(day.getUTCDate() + offset);
    return day.toISOString().slice(0, 10);
  };
  return { first: shifted(-index), last: shifted(6 - index) };
};

export interface SavedViewContext {
  readonly timeZone: string;
  readonly todayKey: string;
  readonly now: Date;
  /** Task ids satisfying the view's relation conditions, resolved kernel-side.
   *  `undefined` means the view constrains nothing by relation, which is a
   *  different answer from an empty set — that one means it constrains by
   *  relation and nothing matches. */
  readonly relationTaskIds: ReadonlySet<string> | undefined;
}

export const matchesSavedView = (
  row: TaskRow,
  view: WorkSavedView | undefined,
  context: SavedViewContext,
): boolean => {
  if (view === undefined) return true;
  const task = row.task;
  const filters = view.filters;
  if (
    context.relationTaskIds !== undefined &&
    !context.relationTaskIds.has(task.id)
  )
    return false;
  if (
    filters.operationalStates !== undefined &&
    !filters.operationalStates.includes(task.operationalState)
  )
    return false;
  if (filters.unassigned === true && task.assignment !== undefined)
    return false;
  if (
    filters.statusIds !== undefined &&
    !filters.statusIds.includes(task.statusId)
  )
    return false;
  if (filters.assigneePrincipalIds !== undefined) {
    // A view naming somebody this reader may not be told about matches nothing,
    // rather than matching on an id the projection withheld.
    const principalId = task.assignment?.assigneePrincipalId;
    if (
      principalId === undefined ||
      !filters.assigneePrincipalIds.includes(principalId)
    )
      return false;
  }
  if (
    filters.priorities !== undefined &&
    !filters.priorities.includes(task.priority ?? "normal")
  )
    return false;
  if (
    filters.scheduled !== undefined &&
    filters.scheduled !== (task.dueAt !== undefined)
  )
    return false;
  if (filters.dueWindow !== undefined) {
    if (task.dueAt === undefined) return false;
    const dueKey = dateKeyInZone(task.dueAt, context.timeZone);
    if (filters.dueWindow === "overdue") {
      if (Date.parse(task.dueAt) >= context.now.getTime()) return false;
    } else if (filters.dueWindow === "today") {
      if (dueKey !== context.todayKey) return false;
    } else {
      const week = weekBounds(context.todayKey, context.now, context.timeZone);
      if (dueKey < week.first || dueKey > week.last) return false;
    }
  }
  for (const filter of filters.fields ?? []) {
    const value = task.fields?.[filter.fieldId];
    if (filter.predicate.kind === "set" && value === undefined) return false;
    if (filter.predicate.kind === "empty" && value !== undefined) return false;
    if (
      filter.predicate.kind === "choice_is" &&
      (value?.kind !== "choice" || value.value !== filter.predicate.option)
    )
      return false;
  }
  return true;
};

/** Free-text search over what a row shows. Records are Polish and stay that
 *  way — only the interface is English — so the fold is Polish too. */
export const matchesSearch = (row: TaskRow, normalized: string): boolean => {
  if (normalized.length === 0) return true;
  return [
    row.task.title,
    row.status?.label,
    row.task.assignment?.displayName,
    ...row.projects.map((project) => project.title),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLocaleLowerCase("pl-PL")
    .includes(normalized);
};
