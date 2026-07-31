import type {
  FieldDefinitionId,
  ProjectId,
  TaskStatusId,
} from "@constellation/contracts";

import type {
  DesktopSnapshot,
  SavedWorkView,
  WorkOverviewProjection,
} from "../client/workflow.js";
import { countLabel, formatDate, formatTime } from "../i18n.js";
import { daysUntil } from "../today-plan.js";

// The one reading of a task that every Tasks layout draws from. Five layouts
// answering the same question differently is the defect this file exists to
// prevent: the board and the table disagreeing about which project a task
// belongs to is not a rendering difference, it is two answers.
//
// It is built from `work.overview` and not from `task.list`, for one reason
// worth stating: the overview is whole-Space and uncapped, while the query
// pages at fifty. A screen whose filters run over the first page answers from a
// truncated set and looks right doing it.

export type WorkTask = WorkOverviewProjection["tasks"][number];
export type WorkProject = WorkOverviewProjection["projects"][number];
/** The saved view as the work overview projects it — the SAME type
 *  `client/workflow.ts` exports as `SavedWorkView`, aliased rather than derived
 *  a second time. Two names one letter-order apart, each reaching into the
 *  projection separately, is how the create side and the update side came to
 *  disagree about what a filter set is; `task-filters.ts` already imports this
 *  name, so the name stays and only the second derivation goes. */
export type WorkSavedView = SavedWorkView;
export type TaskStatus = DesktopSnapshot["bootstrap"]["taskStatuses"][number];

/** Every layout the switcher offers, in the order it offers them. */
export const TASK_LAYOUTS = [
  "list",
  "board",
  "table",
  "timeline",
  "calendar",
] as const;
export type TaskLayout = (typeof TASK_LAYOUTS)[number];

export const TASK_LAYOUT_LABELS: Record<TaskLayout, string> = {
  list: "List",
  board: "Board",
  table: "Table",
  timeline: "Timeline",
  calendar: "Calendar",
};

/** The axes the switcher names. A stored view can also group by a workspace
 *  field, which is the object arm of `TaskGroupBy` below; the two are separate
 *  names because THIS one keys the label table and an object cannot key a
 *  `Record`. */
export type TaskGrouping =
  "status" | "project" | "priority" | "assignee" | "none";

export const TASK_GROUPING_LABELS: Record<TaskGrouping, string> = {
  status: "Status",
  project: "Project",
  priority: "Priority",
  assignee: "Assignee",
  none: "None",
};

/** Grouping by one workspace field, spelled exactly as the contract spells it
 *  (`SavedViewGroupBySchema`, `command.ts:1328-1334`) so a stored view needs no
 *  translation table on the way in. */
export interface TaskFieldGrouping {
  readonly fieldId: FieldDefinitionId;
}

/** Everything this screen can be grouped by — which is everything a stored view
 *  may ask for. The switcher's own list stays `TaskGrouping`. */
export type TaskGroupBy = TaskGrouping | TaskFieldGrouping;

export type TaskFieldDefinition = NonNullable<
  DesktopSnapshot["bootstrap"]["fieldDefinitions"]
>[number];

/**
 * The grouping a stored view asks for.
 *
 * The contract spells ungrouped as the key being ABSENT, never as a word, so
 * absent arrives here as `"none"` — and `"none"` must never travel back out as
 * the string. Every other member is set-identical on both sides.
 */
export const groupingFromSavedView = (
  groupBy: WorkSavedView["groupBy"],
): TaskGroupBy => (groupBy === undefined ? "none" : groupBy);

/**
 * The options a field grouping draws its columns from.
 *
 * Read by `groupTasks` and by the interlock below through this ONE lookup, so
 * the columns and the rule guarding them can never answer differently. `state`
 * is deliberately not consulted: a retired choice field still declares its
 * options and still draws real columns, and refusing a board over it would
 * refuse an arrangement that works.
 */
const fieldOptions = (
  fieldId: FieldDefinitionId,
  fieldDefinitions: readonly TaskFieldDefinition[],
): readonly string[] => {
  const definition = fieldDefinitions.find(
    (candidate) => candidate.id === fieldId,
  );
  return definition?.type.kind === "choice" ? definition.type.options : [];
};

/**
 * Whether a grouping has anything to make columns out of.
 *
 * `"none"` says so by name. A field grouping says so by the definition it
 * names: one this workspace no longer carries, or has since made a type with no
 * options, leaves `groupTasks` returning the single "No value" group — which is
 * the one-column board the kernel refuses to store, wearing a different name.
 * That view is reachable, because the kernel checks the field resolves to a
 * choice field at WRITE time only (`wave2.ts:3567-3578`) and nothing
 * re-validates a stored payload on load.
 */
export const groupingMakesColumns = (
  grouping: TaskGroupBy,
  fieldDefinitions: readonly TaskFieldDefinition[],
): boolean =>
  typeof grouping === "object"
    ? fieldOptions(grouping.fieldId, fieldDefinitions).length > 0
    : grouping !== "none";

/**
 * The board interlock, written once and used by both readers of it.
 *
 * The kernel refuses board-without-grouping on the RESULTING record
 * (`wave2.ts:3579-3584`), so no stored view SHOULD carry that pair — but stored
 * payloads are never re-validated on load, and a board with nothing to make
 * columns from draws one column and calls itself a board. Resolved the same way
 * `WorkSurface.tsx:459-462` resolves it.
 *
 * `fieldDefinitions` is REQUIRED rather than defaulted: an empty default reads
 * as "this workspace declares no fields", under which every field grouping is
 * degenerate and every stored field board would be refused.
 */
export const resolveBoardInterlock = (
  layout: TaskLayout,
  grouping: TaskGroupBy,
  fieldDefinitions: readonly TaskFieldDefinition[],
): TaskLayout =>
  layout === "board" && !groupingMakesColumns(grouping, fieldDefinitions)
    ? "list"
    : layout;

/**
 * The layout a stored view asks for.
 *
 * Kept apart from the interlock above on purpose: "a view naming no layout
 * opens as a list" and "a board without columns is not a board" are two
 * different rules that happen to reach for the same word, and folding them
 * together would let a change to one move the other silently.
 */
export const layoutFromSavedView = (
  layout: WorkSavedView["layout"],
  grouping: TaskGroupBy,
  fieldDefinitions: readonly TaskFieldDefinition[],
): TaskLayout =>
  layout === undefined
    ? "list"
    : resolveBoardInterlock(layout, grouping, fieldDefinitions);

export type TaskSort = "manual" | "due" | "title";

export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  manual: "Manual",
  due: "Due date",
  title: "Title",
};

/**
 * The order a stored view asks for, and the order a stored view is given.
 *
 * The kernel and this screen name the same three orders differently, and the
 * translation lives HERE — in one place, in both directions — rather than at
 * each end. A screen carrying its own copy of half a mapping is how a view
 * saved as "by deadline" comes back sorted by title, with neither side wrong on
 * its own terms; that is this repo's named repeat defect.
 *
 * `manual` is the kernel's `updated_desc`, which is what "no order was chosen"
 * has always meant on this side.
 */
export const sortFromSavedView = (
  sort: WorkSavedView["sort"] | undefined,
): TaskSort =>
  sort === "due_asc" ? "due" : sort === "title_asc" ? "title" : "manual";

export const savedViewSortOf = (
  sort: TaskSort,
): "updated_desc" | "due_asc" | "title_asc" =>
  sort === "due" ? "due_asc" : sort === "title" ? "title_asc" : "updated_desc";

/**
 * The grouping a view is STORED with — the inverse of `groupingFromSavedView`
 * above.
 *
 * Ungrouped is the key being absent, never the word: the contract has no
 * `"none"`. This answers `null`, which `savedView.update` reads as "clear it"
 * and which the create path turns into an omission.
 */
export const savedViewGroupByOf = (
  grouping: TaskGroupBy,
): NonNullable<WorkSavedView["groupBy"]> | null =>
  grouping === "none" ? null : grouping;

/**
 * How a task's plan stands, as three states told apart by SHAPE and not only by
 * colour: time is reserved for it, a day is chosen but no time is held, or
 * nobody has planned it. The reserved block carries a duration, which is why
 * the screen needs no separate effort field.
 */
export type PlanState = "held" | "planned" | "unplanned";

export interface TaskRow {
  readonly task: WorkTask;
  readonly status: TaskStatus | undefined;
  readonly projects: readonly WorkProject[];
  readonly planState: PlanState;
  /** The prose a screen reader hears; the row's own visible parts echo it. */
  readonly accessibleName: string;
}

const PRIORITY_RANK: Record<string, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const planStateOf = (task: WorkTask): PlanState =>
  task.startAt === undefined
    ? "unplanned"
    : task.calendarBlock === undefined
      ? "planned"
      : "held";

/**
 * Who to credit for the plan, by the name this reader is allowed to see. An
 * agent is named because a learning agent is asked "why is this here" daily;
 * the person reading is "you" rather than their own name.
 */
export const plannerName = (
  snapshot: DesktopSnapshot,
  principalId: string,
): string => {
  const access = snapshot.access;
  if (access.kind === "ready") {
    if (access.data.currentPrincipalId === principalId) return "you";
    const member = access.data.members.find(
      (candidate) => candidate.principalId === principalId,
    );
    if (member) return member.displayName;
  }
  const agents = snapshot.agentAccess;
  if (agents.kind === "ready") {
    const grant = agents.data.grants.find(
      (candidate) => candidate.agentPrincipalId === principalId,
    );
    if (grant) return grant.displayName;
  }
  return "somebody no longer here";
};

/** The owner as the projection allows this reader to know them. */
export const ownerName = (task: WorkTask): string | undefined =>
  task.assignment?.displayName;

export interface TaskGroup {
  readonly key: string;
  readonly label: string;
  /** The status this group is, when grouping by status — a board drops cards
   *  here only then, because any other key would write a non-status into
   *  `statusId`. */
  readonly statusId?: TaskStatusId;
  readonly rows: readonly TaskRow[];
}

/**
 * Groups the rows on one axis.
 *
 * `keepEmpty` exists for the board and only the board: a status column must be
 * drawn while empty or there is nothing to drop onto, and moving the last card
 * out of a column would delete the column under the cursor. A list is the
 * opposite — an empty group heading is noise.
 *
 * Grouping by project lists a task under EVERY project it contributes to.
 * Task→Project is many-to-many and the projection carries a list, so collapsing
 * that to the first one would be a claim the data does not make.
 *
 * `fieldDefinitions` is last and optional because it is needed by one arm only
 * and every existing caller passes `keepEmpty` positionally.
 */
export const groupTasks = (
  rows: readonly TaskRow[],
  grouping: TaskGroupBy,
  statuses: readonly TaskStatus[],
  projects: readonly WorkProject[],
  keepEmpty = false,
  fieldDefinitions: readonly TaskFieldDefinition[] = [],
): readonly TaskGroup[] => {
  const used = (groups: readonly TaskGroup[]): readonly TaskGroup[] =>
    keepEmpty ? groups : groups.filter((group) => group.rows.length > 0);

  if (typeof grouping === "object") {
    const fieldId = grouping.fieldId;
    // Declared order, never the order the rows happen to arrive in: the
    // definition says what the options are and in which sequence, and a group
    // list sorted by first appearance would move as work moves.
    const options = fieldOptions(fieldId, fieldDefinitions);
    // A field the workspace no longer offers — dropped, or since made a type
    // that has no options — leaves every row under "No value". That says the
    // grouping is in force and answers nothing; falling back to one "All work"
    // group would say the view asked for something it did not.
    const chosen = (row: TaskRow): string | undefined => {
      const value = row.task.fields?.[fieldId];
      return value?.kind === "choice" ? value.value : undefined;
    };
    return used([
      ...options.map((option) => ({
        key: `field:${option}`,
        label: option,
        rows: rows.filter((row) => chosen(row) === option),
      })),
      {
        key: "field:empty",
        label: "No value",
        // A value the definition has since dropped belongs here too: it is a
        // stored answer to a question that no longer offers it.
        rows: rows.filter((row) => {
          const value = chosen(row);
          return value === undefined || !options.includes(value);
        }),
      },
    ]);
  }

  if (grouping === "none") return [{ key: "all", label: "All work", rows }];

  if (grouping === "project")
    return used([
      ...projects.map((project) => ({
        key: project.id,
        label: project.title,
        rows: rows.filter((row) =>
          row.task.projectIds.includes(project.id as ProjectId),
        ),
      })),
      {
        key: "none",
        label: "No project",
        rows: rows.filter((row) => row.task.projectIds.length === 0),
      },
    ]);

  if (grouping === "priority")
    return used(
      (["urgent", "high", "normal", "low"] as const).map((priority) => ({
        key: priority,
        label: PRIORITY_LABELS[priority] ?? priority,
        rows: rows.filter(
          (row) => (row.task.priority ?? "normal") === priority,
        ),
      })),
    );

  if (grouping === "assignee") {
    const owners = new Map<string, string>();
    for (const row of rows) {
      const assignment = row.task.assignment;
      if (assignment === undefined) continue;
      // Keyed by the id only when the reader may know it. A revoked assignee
      // has no id to key on, so every one of them shares the group its
      // projected name gives — which is the most this reader may be told.
      owners.set(
        assignment.assigneePrincipalId ?? `redacted:${assignment.displayName}`,
        assignment.displayName,
      );
    }
    return used([
      ...[...owners.entries()].map(([key, label]) => ({
        key,
        label,
        rows: rows.filter((row) => {
          const assignment = row.task.assignment;
          if (assignment === undefined) return false;
          return (
            (assignment.assigneePrincipalId ??
              `redacted:${assignment.displayName}`) === key
          );
        }),
      })),
      {
        key: "none",
        label: "Unassigned",
        rows: rows.filter((row) => row.task.assignment === undefined),
      },
    ]);
  }

  return used(
    [...statuses]
      .sort((left, right) => left.position - right.position)
      .map((status) => ({
        key: status.id,
        label: status.label,
        statusId: status.id,
        rows: rows.filter((row) => row.task.statusId === status.id),
      })),
  );
};

/** Sorting, with a second key: twenty tasks share an empty deadline in a real
 *  workspace, and a comparator without a tiebreak reshuffles them on every
 *  render. */
export const sortRows = (
  rows: readonly TaskRow[],
  sort: TaskSort,
): readonly TaskRow[] => {
  if (sort === "due")
    return [...rows].sort(
      (left, right) =>
        (left.task.dueAt ?? "9999-12-31").localeCompare(
          right.task.dueAt ?? "9999-12-31",
        ) || left.task.title.localeCompare(right.task.title, "pl"),
    );
  if (sort === "title")
    return [...rows].sort((left, right) =>
      left.task.title.localeCompare(right.task.title, "pl"),
    );
  return rows;
};

export const priorityRank = (task: WorkTask): number =>
  PRIORITY_RANK[task.priority ?? "normal"] ?? 1;

/** Tasks that carry neither a plan nor a deadline sit on no timeline. The
 *  timeline counts them out loud rather than dropping them silently. */
export const sitsOnADate = (task: WorkTask): boolean =>
  task.startAt !== undefined || task.dueAt !== undefined;

export interface TaskProse {
  readonly timeZone: string;
  readonly todayKey: string;
  readonly snapshot: DesktopSnapshot;
}

/**
 * The plan as a sentence. It goes into the row's accessible name, not only into
 * a `title` — a fact reachable exclusively through a nested tooltip is not
 * reachable from a keyboard or from touch, so for that reader it does not
 * exist.
 */
export const planSentence = (task: WorkTask, prose: TaskProse): string => {
  if (task.startAt === undefined) return "not planned";
  const parts = [`planned for ${formatDate(task.startAt, prose.timeZone)}`];
  parts.push(
    task.calendarBlock === undefined
      ? "no time reserved"
      : `${formatTime(task.calendarBlock.startsAt, prose.timeZone)} to ${formatTime(
          task.calendarBlock.endsAt,
          prose.timeZone,
        )} reserved`,
  );
  if (task.plannedBy !== undefined)
    parts.push(`by ${plannerName(prose.snapshot, task.plannedBy.principalId)}`);
  return parts.join(", ");
};

/** The deadline as a sentence, counted from today rather than stated flatly:
 *  "overdue by 6 days" is what a reader acts on, "Jul 24" is what they then
 *  have to work out. */
export const dueSentence = (task: WorkTask, prose: TaskProse): string => {
  if (task.dueAt === undefined) return "no deadline";
  if (task.completionState === "completed")
    return `due ${formatDate(task.dueAt, prose.timeZone)}`;
  const days = daysUntil(task.dueAt, prose.todayKey, prose.timeZone);
  if (days < 0) return `overdue by ${countLabel(-days, "day")}`;
  if (days === 0) return "due today";
  return `due ${formatDate(task.dueAt, prose.timeZone)}`;
};

export const rowAccessibleName = (row: TaskRow, prose: TaskProse): string =>
  [
    row.task.title,
    row.status?.label,
    row.projects.length > 0
      ? row.projects.map((project) => project.title).join(" and ")
      : "no project",
    row.task.operationalState !== "actionable"
      ? row.task.operationalState
      : undefined,
    planSentence(row.task, prose),
    dueSentence(row.task, prose),
    (row.task.priority ?? "normal") !== "normal"
      ? `${row.task.priority} priority`
      : undefined,
    ownerName(row.task),
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");

/** One pass over the projection, so every layout reads the same rows. */
export const buildRows = (
  tasks: readonly WorkTask[],
  statuses: readonly TaskStatus[],
  projects: readonly WorkProject[],
  prose: TaskProse,
): readonly TaskRow[] =>
  tasks.map((task) => {
    const row: TaskRow = {
      task,
      status: statuses.find((candidate) => candidate.id === task.statusId),
      projects: projects.filter((project) =>
        task.projectIds.includes(project.id as ProjectId),
      ),
      planState: planStateOf(task),
      accessibleName: "",
    };
    return { ...row, accessibleName: rowAccessibleName(row, prose) };
  });
