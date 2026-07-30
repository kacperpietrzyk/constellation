import type { TaskId, TaskStatusId } from "@constellation/contracts";

import type { ListNavigationItemProps } from "../hooks/useListNavigation.js";
import { formatDate } from "../i18n.js";
import {
  PRIORITY_LABELS,
  type TaskStatus,
  type WorkTask,
} from "../tasks/task-view.js";
import { daysUntil } from "../today-plan.js";
import styles from "./record-panels.module.css";

// The work under the project, on the record that promised it.
//
// This is the one panel of the three whose entries are REAL selectable rows:
// the same keyboard, the same select-versus-open split and the same single
// roving tab stop as the Projects and Tasks collections. A decorative list here
// would make the record the one place where a task cannot be reached without a
// mouse.
//
// The tab COUNT is open tasks while this panel lists ALL of them, Done
// included. That reads like a slip and is the prototype's own behaviour, ported
// deliberately: the badge answers "how much is still owed", the panel answers
// "what is the work" — and a record that hid its finished tasks would make the
// composition bar above it unverifiable.

export interface RecordTaskProse {
  readonly timeZone: string;
  /** Today in the workspace's calendar, as `YYYY-MM-DD`. */
  readonly todayKey: string;
}

export interface RecordTaskGroup {
  readonly key: TaskStatusId;
  readonly label: string;
  readonly status: TaskStatus;
  readonly tasks: readonly WorkTask[];
}

/**
 * The statuses this workspace defines, in the order it defines them, each
 * carrying the tasks that sit in it. Empty groups are dropped: a heading over
 * nothing is noise on a record, and unlike a board there is nothing to drop
 * into it.
 *
 * Position, never a name. Statuses are configured per workspace, so `Backlog →
 * Todo → Doing → Done` and `Backlog → Doing → Done` are both legal and neither
 * can be recognised by label without guessing at somebody else's vocabulary.
 */
export const recordTaskGroups = (
  tasks: readonly WorkTask[],
  statuses: readonly TaskStatus[],
): readonly RecordTaskGroup[] =>
  [...statuses]
    .sort((left, right) => left.position - right.position)
    .map((status) => ({
      key: status.id,
      label: status.label,
      status,
      tasks: tasks.filter((task) => task.statusId === status.id),
    }))
    .filter((group) => group.tasks.length > 0);

/**
 * The rows in the order they are DRAWN, flattened across group boundaries.
 *
 * The caller must size its `useListNavigation` by this length and resolve an
 * index back to a task through this same array. The surface keys one roving tab
 * stop by a flat index, so a caller numbering rows in any other order would open
 * a different task than the focused one — silently, and only for the keyboard,
 * because the mouse passes an id and looks perfectly correct beside it.
 */
export const orderRecordTasks = (
  tasks: readonly WorkTask[],
  statuses: readonly TaskStatus[],
): readonly WorkTask[] =>
  recordTaskGroups(tasks, statuses).flatMap((group) => group.tasks);

/** Where each group's rows start in the ONE index space `itemProps` is keyed
 *  by. Indices run unbroken across group boundaries — restarting them per group
 *  gives several rows the same key, and the single roving stop lands on all. */
const withBaseIndex = (
  groups: readonly RecordTaskGroup[],
  baseIndex: number,
): readonly { readonly base: number; readonly group: RecordTaskGroup }[] => {
  let base = baseIndex;
  return groups.map((group) => {
    const entry = { base, group };
    base += group.tasks.length;
    return entry;
  });
};

/** Four marks that differ by SHAPE. The label stands beside every one of them,
 *  so a reader who cannot tell the colours apart still reads four states. */
const SEMANTICS_MARKS: Record<TaskStatus["operationalSemantics"], string> = {
  actionable: "○",
  waiting: "‖",
  blocked: "✕",
  paused: "◫",
};

/** The deadline as this row says it. A task with none says so in words rather
 *  than showing an empty cell: an absent deadline is a fact about the task. */
const dueSentence = (task: WorkTask, prose: RecordTaskProse): string =>
  task.dueAt === undefined
    ? "no due date"
    : `due ${formatDate(task.dueAt, prose.timeZone)}`;

const isOverdue = (task: WorkTask, prose: RecordTaskProse): boolean =>
  task.completionState === "open" &&
  task.dueAt !== undefined &&
  daysUntil(task.dueAt, prose.todayKey, prose.timeZone) < 0;

/**
 * The row as a screen reader hears it. A `role="option"` label REPLACES
 * everything inside the row, so every fact drawn on it has to be in this one
 * string or it is sighted-only.
 *
 * The operational state appears only when it is not `actionable`: "actionable"
 * on every second row is the default said out loud, and it buries the two
 * states that mean the work is standing still. Priority and owner follow the
 * deadline for the same reason they are drawn at all — a cell present on the
 * row and absent from this string exists for sighted readers only.
 */
const rowAccessibleName = (
  task: WorkTask,
  statusLabel: string,
  prose: RecordTaskProse,
): string =>
  [
    task.title,
    statusLabel,
    task.operationalState !== "actionable" ? task.operationalState : undefined,
    dueSentence(task, prose),
    (task.priority ?? "normal") !== "normal"
      ? `${task.priority} priority`
      : undefined,
    task.assignment?.displayName,
  ]
    .filter((part): part is string => part !== undefined)
    .join(", ");

export const RecordTasksPanel = ({
  tasks,
  statuses,
  prose,
  itemProps,
  baseIndex = 0,
  selectedTaskId,
  onSelect,
  onOpen,
  onNewTask,
}: {
  readonly tasks: readonly WorkTask[];
  readonly statuses: readonly TaskStatus[];
  readonly prose: RecordTaskProse;
  /** From the record screen's single `useListNavigation`, sized by
   *  `orderRecordTasks`. Rows are built here and only here — see the file
   *  header of the record screen: a panel that builds rows while another one is
   *  on screen spends indices on things nobody can see, and the visible panel is
   *  left with no `tabindex="0"` at all. */
  readonly itemProps: (index: number) => ListNavigationItemProps;
  /** Offset of this panel's first row when the record shares its index space
   *  with something drawn above it — and 0 unless something actually does.
   *
   *  `useListNavigation` starts at index 0 and puts the tab stop on
   *  `min(focusIndex, itemCount - 1)`. An offset nobody fills leaves index 0
   *  unrendered, so the stop lands on a null ref and NO row is a Tab stop — the
   *  same defect as building rows for a panel that is not on screen, arriving
   *  through a parameter instead. On this record nothing else draws selectable
   *  rows, so this stays 0 and `itemCount` is `recordTaskCount`. */
  readonly baseIndex?: number | undefined;
  readonly selectedTaskId?: TaskId | undefined;
  readonly onSelect: (taskId: TaskId) => void;
  readonly onOpen: (taskId: TaskId) => void;
  readonly onNewTask: () => void;
}) => {
  const groups = recordTaskGroups(tasks, statuses);

  if (groups.length === 0)
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No tasks yet</p>
          <p className={styles.emptyBody}>
            Break the outcome into the first three things that must be true.
          </p>
          <button
            className={styles.emptyAction}
            onClick={onNewTask}
            type="button"
          >
            New task
          </button>
        </div>
      </div>
    );

  return (
    <div className={styles.panel}>
      {withBaseIndex(groups, baseIndex).map(({ base, group }) => (
        <div className={styles.group} key={group.key}>
          {/* The heading stands OUTSIDE the listbox. A child of a listbox that
              is not an option has to be rescued with a presentational role —
              simpler not to put it there. */}
          <div className={styles.groupHead}>
            <span aria-hidden="true" className={styles.groupMark}>
              {SEMANTICS_MARKS[group.status.operationalSemantics]}
            </span>
            <span className={styles.groupLabel}>{group.label}</span>
            <span className={styles.groupCount}>{group.tasks.length}</span>
          </div>
          <div aria-label={group.label} className={styles.rows} role="listbox">
            {group.tasks.map((task, offset) => {
              const selected = task.id === selectedTaskId;
              return (
                <div
                  {...itemProps(base + offset)}
                  aria-label={rowAccessibleName(task, group.label, prose)}
                  aria-selected={selected}
                  className={`${styles.row} ${
                    selected ? styles.rowSelected : ""
                  }`}
                  key={task.id}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey) {
                      onOpen(task.id);
                      return;
                    }
                    onSelect(task.id);
                  }}
                  onDoubleClick={() => onOpen(task.id)}
                  role="option"
                  data-task-row={task.id}
                >
                  <span className={styles.rowTitle} data-row-title>
                    {task.title}
                  </span>
                  {/* Waiting and blocked are the only reasons a task on a live
                      project is standing still, so they are said on the row
                      rather than left to the record behind it. */}
                  {task.operationalState !== "actionable" && (
                    <span className={styles.rowState}>
                      {task.operationalState}
                    </span>
                  )}
                  {(task.priority ?? "normal") !== "normal" && (
                    <span className={styles.rowPriority}>
                      {PRIORITY_LABELS[task.priority ?? "normal"]}
                    </span>
                  )}
                  <span
                    className={`${styles.rowDue} ${
                      task.dueAt === undefined
                        ? styles.rowDueUnset
                        : isOverdue(task, prose)
                          ? styles.rowDueOver
                          : ""
                    }`}
                  >
                    {task.dueAt === undefined
                      ? "—"
                      : formatDate(task.dueAt, prose.timeZone)}
                  </span>
                  {/* Read-only: a row says who holds the work, the task record
                      is where it changes hands. */}
                  <span className={styles.rowOwner}>
                    {task.assignment?.displayName ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/** How many rows this panel draws — the number the caller's navigation must be
 *  sized by. Kept beside the order it counts so the two cannot disagree. */
export const recordTaskCount = (
  tasks: readonly WorkTask[],
  statuses: readonly TaskStatus[],
): number => orderRecordTasks(tasks, statuses).length;

/** The tab badge, which counts OPEN work and not the rows below it. Named here
 *  so the difference from `recordTaskCount` is a decision a reader can find,
 *  rather than a discrepancy they discover. */
export const recordOpenTaskCount = (tasks: readonly WorkTask[]): number =>
  tasks.filter((task) => task.completionState === "open").length;
