import type { TaskId } from "@constellation/contracts";

import type { ListNavigationItemProps } from "../hooks/useListNavigation.js";
import { formatDate } from "../i18n.js";
import {
  PRIORITY_LABELS,
  dueSentence,
  planSentence,
  type TaskGroup,
  type TaskProse,
  type TaskRow,
} from "./task-view.js";
import styles from "./task-list.module.css";

// The default layout, and the one every other layout is judged against: one
// row per task, grouped on the axis the view chose.
//
// The row shows the PLAN beside the deadline rather than the deadline alone.
// They are two different facts — a plan is your decision, a deadline is
// somebody else's — and a screen that shows only the second is a screen of
// other people's promises.

const planMark: Record<TaskRow["planState"], string> = {
  held: "▣",
  planned: "○",
  unplanned: "—",
};

const PlanCell = ({
  row,
  prose,
}: {
  readonly row: TaskRow;
  readonly prose: TaskProse;
}) => {
  const sentence = planSentence(row.task, prose);
  return (
    <span
      className={`${styles.plan} ${styles[`plan_${row.planState}`]}`}
      title={sentence}
    >
      {/* The three plan states differ by MARK, not only by colour: a reader
          who cannot tell the colours apart still sees three shapes. */}
      <span aria-hidden="true" className={styles.planMark}>
        {planMark[row.planState]}
      </span>
      <span className={styles.planWhen}>
        {row.task.startAt === undefined
          ? "no plan"
          : formatDate(row.task.startAt, prose.timeZone)}
      </span>
    </span>
  );
};

export const TaskListLayout = ({
  groups,
  prose,
  itemProps,
  firstRowIndexOfGroup,
  selectedTaskId,
  onSelect,
  onOpen,
  onAddToGroup,
  onToggleCompleted,
}: {
  readonly groups: readonly TaskGroup[];
  readonly prose: TaskProse;
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly firstRowIndexOfGroup: (groupKey: string) => number;
  readonly selectedTaskId?: TaskId | undefined;
  readonly onSelect: (taskId: TaskId) => void;
  readonly onOpen: (taskId: TaskId) => void;
  readonly onAddToGroup: (group: TaskGroup) => void;
  readonly onToggleCompleted: (taskId: TaskId, completed: boolean) => void;
}) => (
  <div className={styles.list} role="listbox" aria-label="Tasks">
    {groups.map((group) => {
      const planned = group.rows.filter(
        (row) => row.planState !== "unplanned",
      ).length;
      const base = firstRowIndexOfGroup(group.key);
      return (
        <div className={styles.group} key={group.key}>
          <div className={styles.groupHead}>
            <span className={styles.groupLabel}>{group.label}</span>
            <span className={styles.groupCount}>{group.rows.length}</span>
            {planned > 0 && (
              <span className={styles.groupPlanned}>{planned} planned</span>
            )}
            <button
              className={styles.groupAdd}
              onClick={() => onAddToGroup(group)}
              type="button"
              aria-label={`Add to ${group.label}`}
            >
              +
            </button>
          </div>
          {group.rows.map((row, offset) => {
            const index = base + offset;
            const nav = itemProps(index);
            return (
              <div
                {...nav}
                aria-label={row.accessibleName}
                aria-selected={row.task.id === selectedTaskId}
                className={`${styles.row} ${
                  row.task.id === selectedTaskId ? styles.rowSelected : ""
                }`}
                key={row.task.id}
                onClick={() => onSelect(row.task.id)}
                onDoubleClick={() => onOpen(row.task.id)}
                role="option"
                data-task-row={row.task.id}
              >
                {/* A real button, not a presentational tick: completing work
                    from the row is the one write this layout offers, and an
                    option may not carry an interactive child — so it sits
                    outside the option's own name and carries its own. */}
                <button
                  aria-label={
                    row.task.completionState === "completed"
                      ? `Reopen ${row.task.title}`
                      : `Complete ${row.task.title}`
                  }
                  aria-pressed={row.task.completionState === "completed"}
                  className={styles.check}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleCompleted(
                      row.task.id,
                      row.task.completionState !== "completed",
                    );
                  }}
                  type="button"
                >
                  {row.task.completionState === "completed" ? "✓" : "○"}
                </button>
                <span
                  aria-hidden="true"
                  className={`${styles.statusDot} ${
                    row.status === undefined ? styles.statusDotUnknown : ""
                  }`}
                />
                <span className={styles.title} data-row-title>
                  {row.task.title}
                </span>
                {row.task.operationalState !== "actionable" && (
                  <span className={styles.state}>
                    {row.task.operationalState}
                  </span>
                )}
                <span className={styles.context}>
                  {row.projects.length > 0
                    ? row.projects.map((project) => project.title).join(", ")
                    : ""}
                </span>
                {(row.task.priority ?? "normal") !== "normal" && (
                  <span className={styles.priority}>
                    {PRIORITY_LABELS[row.task.priority ?? "normal"]}
                  </span>
                )}
                <PlanCell prose={prose} row={row} />
                <span
                  className={styles.due}
                  title={dueSentence(row.task, prose)}
                >
                  {row.task.dueAt === undefined
                    ? "—"
                    : formatDate(row.task.dueAt, prose.timeZone)}
                </span>
                {/* The owner is READ-ONLY here: a row says who holds the work,
                    the record screen is where it changes hands. The principal
                    is exposed only when the projection allowed this reader to
                    know it — a redacted assignee has a name and no id, and
                    this attribute must not invent one. */}
                <span
                  className={styles.owner}
                  {...(row.task.assignment?.assigneePrincipalId === undefined
                    ? {}
                    : {
                        "data-assignee":
                          row.task.assignment.assigneePrincipalId,
                      })}
                >
                  {row.task.assignment?.displayName ?? ""}
                </span>
              </div>
            );
          })}
        </div>
      );
    })}
  </div>
);
