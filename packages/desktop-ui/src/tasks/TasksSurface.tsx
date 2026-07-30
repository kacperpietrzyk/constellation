import { Suspense, lazy, useMemo, useState } from "react";

import type { TaskId, TaskStatusId } from "@constellation/contracts";

import type { DesktopSnapshot } from "../client/workflow.js";
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
  sortRows,
  type TaskGroup,
  type TaskGrouping,
  type TaskLayout,
  type TaskProse,
  type TaskSort,
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
}) => {
  const [layout, setLayout] = useState<TaskLayout>("list");
  const [grouping, setGrouping] = useState<TaskGrouping>("status");
  const [sort, setSort] = useState<TaskSort>("manual");
  const [activeViewId, setActiveViewId] = useState<string>();
  const [search, setSearch] = useState("");

  const timeZone = snapshot.bootstrap.workspace.timezone;
  const work = snapshot.work;
  const projection = work.kind === "ready" ? work.data : undefined;
  const statuses = snapshot.bootstrap.taskStatuses;

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
        layout === "board",
      ),
    [grouping, layout, projection?.projects, rows, statuses],
  );

  // Flat index order, shared by every layout, so one roving tab stop survives a
  // layout switch instead of each lens inventing its own.
  const orderedRows = GROUPED.has(layout)
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
              aria-pressed={layout === candidate}
              className={styles.switch}
              data-layout={candidate}
              key={candidate}
              onClick={() => setLayout(candidate)}
              type="button"
            >
              {TASK_LAYOUT_LABELS[candidate]}
            </button>
          ))}
        </div>

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
              setActiveViewId(
                event.target.value === "" ? undefined : event.target.value,
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

        <div className={styles.control}>
          <label htmlFor="tasks-group">Group</label>
          <select
            id="tasks-group"
            onChange={(event) =>
              setGrouping(event.target.value as TaskGrouping)
            }
            value={grouping}
          >
            {GROUPINGS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {TASK_GROUPING_LABELS[candidate]}
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

      {layout === "list" ? (
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
        <LazySurfaceBoundary label={TASK_LAYOUT_LABELS[layout]}>
          <Suspense
            fallback={
              <SurfaceLoadingState label={TASK_LAYOUT_LABELS[layout]} />
            }
          >
            {layout === "board" ? (
              <TaskBoardLayout
                firstRowIndexOfGroup={firstRowIndexOfGroup}
                grouping={grouping}
                groups={groups}
                itemProps={itemProps}
                onAddToGroup={addToGroup}
                onMoveToStatus={onSetStatus}
                onOpen={onOpenTask}
                onSelect={onSelectTask}
                prose={prose}
                selectedTaskId={selectedTaskId}
              />
            ) : layout === "table" ? (
              <TaskTableLayout
                itemProps={itemProps}
                onOpen={onOpenTask}
                onSelect={onSelectTask}
                prose={prose}
                rows={rows}
                selectedTaskId={selectedTaskId}
              />
            ) : layout === "timeline" ? (
              <TaskTimelineLayout
                itemProps={itemProps}
                onOpen={onOpenTask}
                onPlanOnDay={onPlanOnDay}
                onSelect={onSelectTask}
                prose={prose}
                rows={rows}
                selectedTaskId={selectedTaskId}
              />
            ) : layout === "calendar" ? (
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
