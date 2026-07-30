import type { TaskId } from "@constellation/contracts";

import type { ListNavigationItemProps } from "../hooks/useListNavigation.js";
import { formatDate, formatTime } from "../i18n.js";
import { daysUntil } from "../today-plan.js";
import {
  PRIORITY_LABELS,
  ownerName,
  type TaskProse,
  type TaskRow,
} from "./task-view.js";
import styles from "./task-table.module.css";

// The table is the layout that answers "what does this whole set look like,
// field by field". It reads the frozen row model and adds nothing of its own:
// the prose a screen reader hears is `row.accessibleName`, built once in
// `task-view.ts`, so the table cannot disagree with the board about what a task
// is. What the cells add is COMPACTNESS — `dueSentence` says "overdue by six
// days", which is right for a sentence and far too wide for a column.
//
// Two things this layout has to get right, both learned from real data:
//   • titles run past a hundred characters and project titles past seventy, so
//     a cell truncates with an ellipsis while the row's accessible name keeps
//     the whole string;
//   • the table scrolls sideways inside its OWN box. A table that widens the
//     document pushes every other surface off-screen with it.

/** Absent is drawn, never left blank: an empty cell reads as a rendering
 *  failure, a dash reads as "nothing here". The glyph is hidden from the
 *  accessible tree — eight columns of "em dash" per row is noise, and the row's
 *  accessible name already says "no project", "not planned", "no deadline". */
const Absent = () => (
  <span className={styles.absent} aria-hidden="true">
    —
  </span>
);

/**
 * The status dot's SHAPE, from the two fields that mean the same thing in every
 * workspace. Status ids are workspace-defined here, so the prototype's fixed
 * `backlog / todo / doing / review / done` classes have nothing to key on;
 * `operationalSemantics` and `completionState` do.
 */
const statusShape = (row: TaskRow): string => {
  if (row.task.completionState === "completed") return "done";
  return row.status?.operationalSemantics ?? "actionable";
};

/** Two letters, so a name that is not resolvable still occupies its column. */
const initialsOf = (name: string): string => {
  const letters = name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("");
  return letters === "" ? "?" : letters.toUpperCase();
};

/** The owner as a screen reader hears them. An assignee who left the workspace
 *  is drawn with a dashed ring, and a ring is not readable — so the word goes
 *  here too, rather than letting the shape carry it alone. */
const ownerNote = (row: TaskRow): string => {
  const name = ownerName(row.task) ?? "";
  const availability = row.task.assignment?.availability;
  if (availability === "former_member") return `${name} (former member)`;
  if (availability === "unavailable_member") return `${name} (unavailable)`;
  return name;
};

export const TaskTableLayout = ({
  rows,
  prose,
  itemProps,
  selectedTaskId,
  onSelect,
  onOpen,
}: {
  readonly rows: readonly TaskRow[];
  readonly prose: TaskProse;
  /** The shell's `useListNavigation` accessor. The hook owns the focus index,
   *  so the screen keeps ONE tab stop across a layout switch — this layout
   *  spreads what it is handed and adds only the pointer half. */
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selectedTaskId?: TaskId | undefined;
  readonly onSelect: (taskId: TaskId) => void;
  readonly onOpen: (taskId: TaskId) => void;
}) => {
  if (rows.length === 0) {
    return (
      <div className={styles.emptyState} data-tasks-empty>
        <p>
          <strong>No work matches this view.</strong>
        </p>
        <p>Loosen a filter, or create the first task here.</p>
      </div>
    );
  }

  return (
    <div className={styles.scroller}>
      <table className={styles.table} role="grid" aria-label="Tasks">
        <colgroup>
          <col className={styles.colStatus} />
          <col className={styles.colTitle} />
          <col className={styles.colProject} />
          <col className={styles.colPlan} />
          <col className={styles.colDeadline} />
          <col className={styles.colState} />
          <col className={styles.colPriority} />
          <col className={styles.colOwner} />
        </colgroup>
        <thead>
          <tr role="row">
            <th scope="col">
              <span className="sr-only">Status</span>
            </th>
            <th scope="col">Title</th>
            <th scope="col">Project</th>
            <th scope="col">Plan</th>
            <th scope="col">Deadline</th>
            <th scope="col">State</th>
            <th scope="col">Priority</th>
            <th scope="col">Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const task = row.task;
            const startAt = task.startAt;
            const dueAt = task.dueAt;
            const priority = task.priority ?? "normal";
            const owner = ownerName(task);
            const lead =
              dueAt === undefined || task.completionState === "completed"
                ? undefined
                : daysUntil(dueAt, prose.todayKey, prose.timeZone);

            return (
              <tr
                key={task.id}
                role="row"
                className={styles.row}
                aria-selected={task.id === selectedTaskId}
                aria-label={row.accessibleName}
                data-task-row
                onClick={() => onSelect(task.id)}
                onDoubleClick={() => onOpen(task.id)}
                {...itemProps(index)}
              >
                <td>
                  <span
                    className={styles.dot}
                    data-state={statusShape(row)}
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {row.status?.label ?? "No status"}
                  </span>
                </td>
                <td>
                  <span className={styles.clip} data-row-title>
                    {task.title}
                  </span>
                </td>
                <td>
                  {/* Every Project the task contributes to. Task→Project is
                      many-to-many, so drawing only the first is a claim the
                      data does not make. */}
                  {row.projects.length === 0 ? (
                    <Absent />
                  ) : (
                    <span className={`${styles.clip} ${styles.quiet}`}>
                      {row.projects.map((project) => project.title).join(", ")}
                    </span>
                  )}
                </td>
                <td>
                  {startAt === undefined ? (
                    <Absent />
                  ) : (
                    <span
                      className={styles.plan}
                      data-plan-state={row.planState}
                    >
                      <span className={styles.planMark} aria-hidden="true" />
                      <span className={styles.clip}>
                        {formatDate(startAt, prose.timeZone)}
                        {task.calendarBlock === undefined
                          ? ""
                          : ` ${formatTime(
                              task.calendarBlock.startsAt,
                              prose.timeZone,
                            )}`}
                      </span>
                    </span>
                  )}
                </td>
                <td>
                  {dueAt === undefined ? (
                    <Absent />
                  ) : (
                    <span className={styles.deadline}>
                      <span className={styles.clip}>
                        {formatDate(dueAt, prose.timeZone)}
                      </span>
                      {/* A late deadline says so in WORDS. Tinting the date red
                          leaves the fact unreadable to a reader who cannot
                          separate the two greys, let alone the two reds. */}
                      {lead !== undefined && lead < 0 ? (
                        <span className={styles.tag} data-tone="late">
                          Late
                        </span>
                      ) : lead === 0 ? (
                        <span className={styles.tag} data-tone="today">
                          Today
                        </span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td>
                  {task.operationalState === "actionable" ? (
                    <Absent />
                  ) : (
                    <span
                      className={styles.tag}
                      data-tone={task.operationalState}
                    >
                      {task.operationalState === "blocked"
                        ? "Blocked"
                        : "Waiting"}
                    </span>
                  )}
                </td>
                <td>
                  {priority === "normal" ? (
                    <Absent />
                  ) : (
                    <span className={styles.priority}>
                      <span
                        className={styles.bars}
                        data-level={priority}
                        aria-hidden="true"
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className={styles.clip}>
                        {PRIORITY_LABELS[priority] ?? priority}
                      </span>
                    </span>
                  )}
                </td>
                <td>
                  {owner === undefined ? (
                    <Absent />
                  ) : (
                    <span
                      className={styles.owner}
                      data-availability={
                        row.task.assignment?.availability ?? "active"
                      }
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {initialsOf(owner)}
                      </span>
                      <span className="sr-only">{ownerNote(row)}</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
