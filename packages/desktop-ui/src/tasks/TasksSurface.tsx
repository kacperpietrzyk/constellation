import { Suspense, lazy, useMemo, useState } from "react";

import type {
  FieldDefinitionId,
  TaskId,
  TaskStatusId,
} from "@constellation/contracts";

import type {
  DesktopSnapshot,
  SavedWorkViewFilterChange,
} from "../client/workflow.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { countLabel, dateKeyInZone } from "../i18n.js";
import {
  LazySurfaceBoundary,
  SurfaceLoadingState,
} from "../SurfaceLifecycleStates.js";
import { TaskListLayout } from "./TaskListLayout.js";
import { matchesSavedView, matchesSearch } from "./task-filters.js";
import {
  TASK_GROUPING_LABELS,
  TASK_LAYOUTS,
  TASK_LAYOUT_LABELS,
  TASK_SORT_LABELS,
  buildRows,
  groupTasks,
  groupingFromSavedView,
  groupingMakesColumns,
  layoutFromSavedView,
  resolveBoardInterlock,
  sortRows,
  type TaskFieldDefinition,
  type TaskGroup,
  type TaskGroupBy,
  type TaskGrouping,
  type TaskLayout,
  type TaskProse,
  type TaskSort,
  type WorkSavedView,
} from "./task-view.js";
import styles from "./tasks.module.css";

// The list is the default lens and ships with the screen; the other four load
// when somebody switches to them. Tasks is an eager destination (⌘4), so
// everything statically imported here lands in the first paint — and four
// lenses nobody has opened yet, with four stylesheets, is not what the first
// paint is for. The size gate measures exactly this and refused the static
// version.
const TaskBoardLayout = lazy(async () => ({
  default: (await import("./TaskBoardLayout.js")).TaskBoardLayout,
}));
const TaskTableLayout = lazy(async () => ({
  default: (await import("./TaskTableLayout.js")).TaskTableLayout,
}));
const TaskTimelineLayout = lazy(async () => ({
  default: (await import("./TaskTimelineLayout.js")).TaskTimelineLayout,
}));
const TaskCalendarLayout = lazy(async () => ({
  default: (await import("./TaskCalendarLayout.js")).TaskCalendarLayout,
}));

// Lazy for the same reason and one more: the editor is reachable only with a
// saved view open, and its own stylesheet is 3.6 kB. Statically imported it
// would join the first paint of a screen most visits never edit a view on, and
// the hot-path budget this rebuild refuses to raise has no room for it.
const SavedViewFilterForm = lazy(async () => ({
  default: (await import("./SavedViewFilterForm.js")).SavedViewFilterForm,
}));

// One collection of work, five lenses over it. The layout switcher changes how
// the same set is drawn and never what is in it — which is why filtering,
// grouping and sorting all live here and every layout is handed finished rows.
//
// Calendar is last in the switcher on purpose. It answers a narrower question
// than the Calendar destination — "when does THIS view's work fall" — and
// carries no meetings, because planning a week without them is not a thing
// this screen claims to do.

const GROUPINGS: readonly TaskGrouping[] = [
  "status",
  "project",
  "priority",
  "assignee",
  "none",
];
const SORTS: readonly TaskSort[] = ["manual", "due", "title"];

/** Layouts that group; the rest read a flat list. */
const GROUPED: ReadonlySet<TaskLayout> = new Set<TaskLayout>(["list", "board"]);

/**
 * How a field grouping is spelled as one `<option value>`.
 *
 * Decoded by TESTING for the prefix, never by an else-branch: an axis added to
 * the list above without touching the decoder would otherwise be read as a
 * field id with its first six characters cut off, and the kernel would refuse
 * the resulting view naming nothing.
 */
const FIELD_PREFIX = "field:";

const NO_FIELDS: readonly TaskFieldDefinition[] = [];

const groupingOptionValue = (grouping: TaskGroupBy): string =>
  typeof grouping === "object"
    ? `${FIELD_PREFIX}${grouping.fieldId}`
    : grouping;

const groupingFromOption = (value: string): TaskGroupBy => {
  if (!value.startsWith(FIELD_PREFIX)) return value as TaskGrouping;
  return { fieldId: value.slice(FIELD_PREFIX.length) as FieldDefinitionId };
};

export const TasksSurface = ({
  snapshot,
  selectedTaskId,
  onOpenTask,
  onSelectTask,
  onCreateTask,
  onSetStatus,
  onSetCompleted,
  onPlanOnDay,
  onOpenCalendar,
  onSaveViewFilters,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onCreateTask: (title: string) => Promise<boolean>;
  readonly onSetStatus: (id: TaskId, statusId: TaskStatusId) => void;
  readonly onSetCompleted: (id: TaskId, completed: boolean) => void;
  /** Planning writes `startAt` and never touches `dueAt`: dragging onto a day
   *  means "I will start this on Wednesday", not "I promise it for
   *  Wednesday". The two are different facts and the gesture means the first. */
  readonly onPlanOnDay: (id: TaskId, dayKey: string) => void;
  readonly onOpenCalendar: () => void;
  /** Writes the edited conditions back and resolves true once the refreshed
   *  view is in hand. Optional because the write needs a client this screen
   *  does not hold, so the shell owns it — and the editor is drawn only when it
   *  is passed, since a Save that reaches nobody is worse than no Save. */
  readonly onSaveViewFilters?: (
    view: WorkSavedView,
    change: SavedWorkViewFilterChange,
  ) => Promise<boolean>;
}) => {
  const [layout, setLayout] = useState<TaskLayout>("list");
  const [grouping, setGrouping] = useState<TaskGroupBy>("status");
  const [sort, setSort] = useState<TaskSort>("manual");
  const [activeViewId, setActiveViewId] = useState<string>();
  const [search, setSearch] = useState("");

  const timeZone = snapshot.bootstrap.workspace.timezone;
  const work = snapshot.work;
  const projection = work.kind === "ready" ? work.data : undefined;
  const statuses = snapshot.bootstrap.taskStatuses;
  // One identity for the absent case, or the grouping memo recomputes on every
  // render of a workspace that has declared no fields at all.
  const fieldDefinitions = snapshot.bootstrap.fieldDefinitions ?? NO_FIELDS;

  const prose: TaskProse = useMemo(
    () => ({
      timeZone,
      todayKey: dateKeyInZone(new Date(), timeZone),
      snapshot,
    }),
    [snapshot, timeZone],
  );

  const activeView = projection?.savedViews.find(
    (view) => view.id === activeViewId,
  );

  // A view SEEDS the lens; it does not hold it. Opening one draws the board it
  // was stored as, and the switcher is free the moment it is open — which is
  // also why this is done on the change and not derived every render: a lens
  // recomputed from the view would put the reader back where they started
  // every time they moved.
  //
  // Returning to "All work" leaves the lens where the reader left it. There is
  // no view saying anything, so there is nothing to seed from, and yanking
  // them back to a list would be this screen making a choice it was not asked
  // to make.
  const openView = (view: WorkSavedView | undefined): void => {
    setActiveViewId(view?.id);
    if (view === undefined) return;
    const seeded = groupingFromSavedView(view.groupBy);
    setGrouping(seeded);
    setLayout(layoutFromSavedView(view.layout, seeded, fieldDefinitions));
  };

  // The lens actually drawn, which is the chosen one except for the pair the
  // kernel refuses to store. Held as a DERIVED value rather than written back
  // into `layout`, so restoring a grouping restores the board the reader had
  // chosen instead of leaving them on the list they were pushed onto.
  const activeLayout = resolveBoardInterlock(
    layout,
    grouping,
    fieldDefinitions,
  );
  // Not `grouping === "none"`. A grouping that names a field this workspace no
  // longer offers makes exactly one column too, so the Board button has to be
  // refused on whether there are columns rather than on the word.
  const boardBlocked = !groupingMakesColumns(grouping, fieldDefinitions);

  const rows = useMemo(() => {
    if (projection === undefined) return [];
    const normalized = search.trim().toLocaleLowerCase("pl-PL");
    const built = buildRows(
      projection.tasks,
      statuses,
      projection.projects,
      prose,
    );
    const context = {
      timeZone,
      todayKey: prose.todayKey,
      now: new Date(),
      // ADR-045: relation filtering is NOT evaluated here. The kernel resolved
      // the view's conditions and sent the ids that satisfy them; this is a
      // membership test against that answer, never a walk of the relations.
      relationTaskIds:
        activeView?.relationTaskIds === undefined
          ? undefined
          : new Set<string>(activeView.relationTaskIds),
    };
    return sortRows(
      built.filter(
        (row) =>
          matchesSavedView(row, activeView, context) &&
          matchesSearch(row, normalized),
      ),
      sort,
    );
  }, [activeView, projection, prose, search, sort, statuses, timeZone]);

  const groups = useMemo(
    () =>
      groupTasks(
        rows,
        grouping,
        statuses,
        projection?.projects ?? [],
        // A status column must be drawn while empty or there is nothing to drop
        // onto, and moving the last card out would delete the column under the
        // cursor. A list is the opposite: an empty heading is noise.
        activeLayout === "board",
        fieldDefinitions,
      ),
    [
      activeLayout,
      fieldDefinitions,
      grouping,
      projection?.projects,
      rows,
      statuses,
    ],
  );

  // Flat index order, shared by every layout, so one roving tab stop survives a
  // layout switch instead of each lens inventing its own.
  const orderedRows = GROUPED.has(activeLayout)
    ? groups.flatMap((group) => group.rows)
    : rows;
  const itemProps = useListNavigation({
    itemCount: orderedRows.length,
    onOpen: (index) => {
      const row = orderedRows[index];
      if (row) onOpenTask(row.task.id);
    },
    onSelect: (index) => {
      const row = orderedRows[index];
      if (row) onSelectTask(row.task.id);
    },
  });

  const firstRowIndexOfGroup = (groupKey: string): number => {
    let index = 0;
    for (const group of groups) {
      if (group.key === groupKey) return index;
      index += group.rows.length;
    }
    return index;
  };

  const addToGroup = (group: TaskGroup): void => {
    void onCreateTask(`New task in ${group.label}`);
  };

  if (work.kind !== "ready")
    return (
      <div className={`surface-scroll ${styles.tasks}`} data-tasks-surface>
        <header className="surface-header">
          <h1 id="surface-title" tabIndex={-1}>
            Tasks
          </h1>
        </header>
        <p className={styles.unavailable}>
          Tasks are unavailable while the work plane cannot be read.
        </p>
      </div>
    );

  const planned = rows.filter((row) => row.planState !== "unplanned").length;

  // The axes the switcher names, then every choice field a task can carry. A
  // stored view may name a field this workspace has since retired or made
  // another type: the grouping still applies and puts every row under "No
  // value", so the switcher has to be able to SHOW what is in force rather
  // than standing blank on a value none of its options carry.
  const groupingValue = groupingOptionValue(grouping);
  const groupingOptions = [
    ...GROUPINGS.map((axis) => ({
      value: axis as string,
      label: TASK_GROUPING_LABELS[axis],
    })),
    ...fieldDefinitions
      .filter(
        (definition) =>
          definition.targetKind === "task" &&
          definition.state !== "retired" &&
          definition.type.kind === "choice",
      )
      .map((definition) => ({
        value: `${FIELD_PREFIX}${definition.id}`,
        label: definition.label,
      })),
  ];
  if (!groupingOptions.some((option) => option.value === groupingValue))
    groupingOptions.push({ value: groupingValue, label: "Stored field" });

  // The board names its axis from a table keyed by the five words, which has no
  // entry for a field — `TASK_GROUPING_LABELS[{ fieldId }]` is `undefined` and
  // would draw an empty bold. Until the board can be handed the field's own
  // label, a field grouping is announced with the sentence that is true of any
  // non-status board: these columns are a lens, not a place. The drop rules do
  // not read this — they read the columns (`TaskBoardLayout.tsx:217-218`).
  const boardGrouping: TaskGrouping =
    typeof grouping === "object" ? "none" : grouping;

  return (
    <div className={`surface-scroll ${styles.tasks}`} data-tasks-surface>
      <header className="surface-header">
        <h1 id="surface-title" tabIndex={-1}>
          Tasks
        </h1>
      </header>
      <div className={styles.viewbar}>
        <div
          className={styles.switcher}
          role="tablist"
          aria-label="Task layout"
        >
          {TASK_LAYOUTS.map((candidate) => (
            <button
              aria-describedby={
                candidate === "board" && boardBlocked
                  ? "tasks-board-requirement"
                  : undefined
              }
              aria-pressed={activeLayout === candidate}
              className={styles.switch}
              data-layout={candidate}
              disabled={candidate === "board" && boardBlocked}
              key={candidate}
              onClick={() => setLayout(candidate)}
              type="button"
            >
              {TASK_LAYOUT_LABELS[candidate]}
            </button>
          ))}
        </div>
        {boardBlocked && (
          <small className={styles.requirement} id="tasks-board-requirement">
            {typeof grouping === "object"
              ? "This view groups by a field the workspace no longer offers."
              : "Board needs a grouped view."}
          </small>
        )}

        <div className={styles.search}>
          <label className={styles.searchLabel} htmlFor="tasks-search">
            Search
          </label>
          <input
            id="tasks-search"
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            value={search}
          />
        </div>

        <div className={styles.control}>
          <label htmlFor="tasks-view">View</label>
          <select
            id="tasks-view"
            onChange={(event) =>
              openView(
                projection?.savedViews.find(
                  (view) => view.id === event.target.value,
                ),
              )
            }
            value={activeViewId ?? ""}
          >
            <option value="">All work</option>
            {projection?.savedViews
              .filter((view) => view.state === "active")
              .map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
          </select>
        </div>

        {/* Editing lives beside the picker and only with a view open: there is
            nothing to edit on "All work", and a stored view is the only thing
            here that HAS conditions. Creating a view is not offered — that is
            on Work (`WorkSurface.tsx:675-768`) and is not duplicated. The
            fallback is empty on purpose; a spinner where a small button will be
            is more movement than the wait it reports. */}
        {activeView !== undefined && onSaveViewFilters !== undefined && (
          <LazySurfaceBoundary label="View filters">
            <Suspense fallback={null}>
              <SavedViewFilterForm
                onSave={(change) => onSaveViewFilters(activeView, change)}
                statuses={statuses}
                view={activeView}
              />
            </Suspense>
          </LazySurfaceBoundary>
        )}

        <div className={styles.control}>
          <label htmlFor="tasks-group">Group</label>
          <select
            id="tasks-group"
            onChange={(event) =>
              setGrouping(groupingFromOption(event.target.value))
            }
            value={groupingValue}
          >
            {groupingOptions.map((candidate) => (
              <option key={candidate.value} value={candidate.value}>
                {candidate.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.control}>
          <label htmlFor="tasks-sort">Sort</label>
          <select
            id="tasks-sort"
            onChange={(event) => setSort(event.target.value as TaskSort)}
            value={sort}
          >
            {SORTS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {TASK_SORT_LABELS[candidate]}
              </option>
            ))}
          </select>
        </div>

        <p aria-live="polite" className={styles.count} role="status">
          {countLabel(rows.length, "task")}
          <span className={styles.separator}>·</span>
          {planned} planned
        </p>
      </div>

      {activeLayout === "list" ? (
        <TaskListLayout
          firstRowIndexOfGroup={firstRowIndexOfGroup}
          groups={groups}
          itemProps={itemProps}
          onAddToGroup={addToGroup}
          onOpen={onOpenTask}
          onSelect={onSelectTask}
          onToggleCompleted={onSetCompleted}
          prose={prose}
          selectedTaskId={selectedTaskId}
        />
      ) : (
        <LazySurfaceBoundary label={TASK_LAYOUT_LABELS[activeLayout]}>
          <Suspense
            fallback={
              <SurfaceLoadingState label={TASK_LAYOUT_LABELS[activeLayout]} />
            }
          >
            {activeLayout === "board" ? (
              <TaskBoardLayout
                firstRowIndexOfGroup={firstRowIndexOfGroup}
                grouping={boardGrouping}
                groups={groups}
                itemProps={itemProps}
                onAddToGroup={addToGroup}
                onMoveToStatus={onSetStatus}
                onOpen={onOpenTask}
                onSelect={onSelectTask}
                prose={prose}
                selectedTaskId={selectedTaskId}
              />
            ) : activeLayout === "table" ? (
              <TaskTableLayout
                itemProps={itemProps}
                onOpen={onOpenTask}
                onSelect={onSelectTask}
                prose={prose}
                rows={rows}
                selectedTaskId={selectedTaskId}
              />
            ) : activeLayout === "timeline" ? (
              <TaskTimelineLayout
                itemProps={itemProps}
                onOpen={onOpenTask}
                onPlanOnDay={onPlanOnDay}
                onSelect={onSelectTask}
                prose={prose}
                rows={rows}
                selectedTaskId={selectedTaskId}
              />
            ) : activeLayout === "calendar" ? (
              <TaskCalendarLayout
                itemProps={itemProps}
                onOpen={onOpenTask}
                onOpenCalendarDestination={onOpenCalendar}
                onPlanOnDay={onPlanOnDay}
                onSelect={onSelectTask}
                prose={prose}
                rows={rows}
                selectedTaskId={selectedTaskId}
              />
            ) : null}
          </Suspense>
        </LazySurfaceBoundary>
      )}
    </div>
  );
};
