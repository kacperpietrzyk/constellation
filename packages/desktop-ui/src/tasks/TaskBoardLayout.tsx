import { useState } from "react";

import type { TaskId, TaskStatusId } from "@constellation/contracts";

import { formatDate, formatTime } from "../i18n.js";
import { daysUntil } from "../today-plan.js";
import {
  PRIORITY_LABELS,
  TASK_GROUPING_LABELS,
  dueSentence,
  ownerName,
  plannerName,
  type TaskGroup,
  type TaskGrouping,
  type TaskProse,
  type TaskRow,
} from "./task-view.js";
import styles from "./task-board.module.css";

// The board is the spatial reading of the rows every other Tasks layout draws.
// It adds one thing the others cannot: a card moves by being PUT somewhere.
// That gesture writes `statusId`, so the whole layout turns on one question —
// is the column key a status?
//
// Grouped by project or by person it is not, and a drop would write a project
// id into `statusId` and corrupt the record without a word. Those columns are
// read-only. The keyboard move stays on every card either way, because a
// task's status is always movable; what is illegal is putting the task INTO
// a project.

/** How far one keypress may carry a card along the status order. */
const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

const BoardCard = ({
  row,
  index,
  prose,
  movable,
  selected,
  tabStop,
  dragging,
  showProjects,
  onSelect,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  readonly row: TaskRow;
  readonly index: number;
  readonly prose: TaskProse;
  readonly movable: boolean;
  readonly selected: boolean;
  /** The board's single tab stop. Exactly one card carries it. */
  readonly tabStop: boolean;
  readonly dragging: boolean;
  /** False while the board groups by project: the column already says it. */
  readonly showProjects: boolean;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
  readonly onMove: (step: number) => void;
  readonly onDragStart: () => void;
  readonly onDragEnd: () => void;
}) => {
  const priority = row.task.priority ?? "normal";
  const owner = ownerName(row.task);
  const late =
    row.task.dueAt !== undefined &&
    row.task.completionState !== "completed" &&
    daysUntil(row.task.dueAt, prose.todayKey, prose.timeZone) < 0;

  return (
    <article
      className={`${styles.card} ${dragging ? styles.cardDragging : ""}`}
      role="option"
      aria-selected={selected}
      // The row's one reading, already built. A card composing its own name
      // would be a second answer to the same question.
      aria-label={row.accessibleName}
      tabIndex={tabStop ? 0 : -1}
      // The parent owns which row has focus, and reaches this card by index.
      data-row={index}
      data-card={row.task.id}
      draggable={movable || undefined}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onDragStart={
        movable
          ? (event) => {
              event.dataTransfer?.setData?.("text/plain", row.task.id);
              onDragStart();
            }
          : undefined
      }
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        // The split: the parent owns MOVEMENT between rows, because it owns
        // the focused index; the card owns ACTIVATION and the status move.
        // Plain arrows are left alone, and the keys handled here are stopped
        // so no ancestor runs them a second time — opening a record twice is
        // another navigation, not a harmless repeat.
        const step = event.altKey ? STEP[event.key] : undefined;
        if (step !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          onMove(step);
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Enter") onOpen();
        else onSelect();
      }}
    >
      {showProjects && row.projects.length > 0 ? (
        <p className={styles.context}>
          {row.projects.map((project) => project.title).join(", ")}
        </p>
      ) : null}

      <p className={styles.title} data-row-title>
        {row.task.title}
      </p>

      {/* The plan, when there is one. Shape tells a reserved block from a bare
          day, and only the reserved one carries a clock time — so the two are
          told apart twice over, never by colour alone. */}
      {row.task.startAt === undefined ? null : (
        <p className={styles.plan}>
          <span
            className={`${styles.planMark} ${
              row.planState === "held" ? styles.planMarkHeld : ""
            }`}
            aria-hidden="true"
          />
          <span className={styles.planWhen}>
            {formatDate(row.task.startAt, prose.timeZone)}
            {row.task.calendarBlock === undefined
              ? ""
              : ` ${formatTime(row.task.calendarBlock.startsAt, prose.timeZone)}`}
          </span>
        </p>
      )}

      {/* Who put it there. With an agent planning days, this is the question
          asked daily, so the answer stands on the card. */}
      {row.task.startAt === undefined ||
      row.task.plannedBy === undefined ? null : (
        <p className={styles.planBy} data-planned-by>
          Planned by{" "}
          {plannerName(prose.snapshot, row.task.plannedBy.principalId)}
        </p>
      )}

      <p className={styles.meta}>
        {priority === "normal" ? null : (
          <span className={styles.priority} data-priority={priority}>
            {PRIORITY_LABELS[priority] ?? priority}
          </span>
        )}
        {row.task.operationalState === "actionable" ? null : (
          <span className={styles.state}>{row.task.operationalState}</span>
        )}
        {row.task.dueAt === undefined ? null : (
          <span className={`${styles.due} ${late ? styles.dueLate : ""}`}>
            {dueSentence(row.task, prose)}
          </span>
        )}
        {owner === undefined ? null : (
          <span className={styles.owner}>{owner}</span>
        )}
      </p>
    </article>
  );
};

export const TaskBoardLayout = ({
  groups,
  grouping,
  prose,
  focusedRowIndex,
  firstRowIndexOfGroup,
  selectedTaskId,
  onSelect,
  onOpen,
  onMoveToStatus,
  onAddToGroup,
}: {
  readonly groups: readonly TaskGroup[];
  readonly grouping: TaskGrouping;
  readonly prose: TaskProse;
  readonly focusedRowIndex: number;
  readonly firstRowIndexOfGroup: (groupKey: string) => number;
  readonly selectedTaskId?: TaskId | undefined;
  readonly onSelect: (taskId: TaskId) => void;
  readonly onOpen: (taskId: TaskId) => void;
  readonly onMoveToStatus: (taskId: TaskId, statusId: TaskStatusId) => void;
  readonly onAddToGroup: (group: TaskGroup) => void;
}) => {
  const [dragged, setDragged] = useState<{
    readonly id: TaskId;
    readonly statusId: TaskStatusId;
  }>();
  const [dropColumnKey, setDropColumnKey] = useState<string>();

  // Read from the COLUMNS, never from the switcher's word: a board asked for
  // "no grouping" still draws statuses, so a flag taken from `grouping` would
  // refuse cards on columns that are perfectly legal targets. The column
  // carries the id a drop would write, which makes it the honest test.
  const movable =
    groups.length > 0 && groups.every((group) => group.statusId !== undefined);

  // Where a keyboard move may land. When the columns are statuses, their own
  // order is the order — the card then lands where the reader can see it. When
  // they are not, there is no status column on screen for this to disagree
  // with, so the workspace's own status order is the only reading available
  // and the only one that could matter.
  const statusOrder: readonly TaskStatusId[] = movable
    ? groups.flatMap((group) =>
        group.statusId === undefined ? [] : [group.statusId],
      )
    : [...prose.snapshot.bootstrap.taskStatuses]
        .sort((left, right) => left.position - right.position)
        .map((status) => status.id);

  const columns = groups.map((group) => ({
    group,
    firstIndex: firstRowIndexOfGroup(group.key),
  }));
  const largest = Math.max(1, ...groups.map((group) => group.rows.length));

  // One tab stop for the whole board, and it has to exist somewhere: when the
  // parent's focused row is not on this board — nothing focused yet, or a
  // filter emptied the column it was in — the first card takes it. Without the
  // fallback, Tab walks straight past the work and the board is mouse-only.
  const focused = columns.some(
    ({ group, firstIndex }) =>
      focusedRowIndex >= firstIndex &&
      focusedRowIndex < firstIndex + group.rows.length,
  );
  const fallback = columns.find(({ group }) => group.rows.length > 0);
  const tabStopIndex = focused ? focusedRowIndex : fallback?.firstIndex;

  const move = (row: TaskRow, step: number): void => {
    const current = statusOrder.indexOf(row.task.statusId);
    if (current < 0) return;
    const target = statusOrder[current + step];
    if (target === undefined || target === row.task.statusId) return;
    onMoveToStatus(row.task.id, target);
  };

  return (
    <div className={styles.board} data-task-board>
      {movable || groups.length === 0 ? null : (
        <p className={styles.lens} data-board-lens>
          <b>
            {grouping === "none" ? "These" : TASK_GROUPING_LABELS[grouping]}
          </b>{" "}
          columns are a lens, not a place a task can be put. Press{" "}
          <kbd>Alt</kbd> with <kbd>←</kbd> or <kbd>→</kbd> on a card to move its
          status.
        </p>
      )}

      <div className={styles.columns}>
        {columns.map(({ group, firstIndex }) => (
          <section
            key={group.key}
            className={`${styles.column} ${
              dropColumnKey === group.key ? styles.columnDrop : ""
            }`}
            data-board-column={group.key}
            {...(movable ? { "data-board-dropzone": group.statusId } : {})}
            // One drop zone per column and none nested inside it: a drop that
            // walks to its nearest ancestor would otherwise find a child zone
            // and write whichever key that one happens to carry.
            onDragOver={
              movable
                ? (event) => {
                    if (dragged === undefined) return;
                    // Preventing the default IS what makes this a target.
                    event.preventDefault();
                    // Set here rather than cleared on drag-leave: leave fires
                    // whenever the cursor crosses into a child, so the
                    // highlight would flicker across the column's own cards.
                    setDropColumnKey(group.key);
                  }
                : undefined
            }
            onDrop={
              movable
                ? (event) => {
                    event.preventDefault();
                    const statusId = group.statusId;
                    const moving = dragged;
                    setDropColumnKey(undefined);
                    setDragged(undefined);
                    if (moving === undefined) return;
                    if (statusId === undefined) return;
                    if (moving.statusId === statusId) return;
                    onMoveToStatus(moving.id, statusId);
                  }
                : undefined
            }
          >
            <header className={styles.columnHead}>
              <h3 className={styles.columnLabel}>{group.label}</h3>
              <span className={styles.count}>{group.rows.length}</span>
              <button
                type="button"
                className={styles.add}
                aria-label={`Add to ${group.label}`}
                onClick={() => onAddToGroup(group)}
              >
                <span aria-hidden="true">+</span>
              </button>
            </header>

            {/* The count beside the label already says the number; the bar is
                here so the shape of the load reads without arithmetic. */}
            <div className={styles.meter} aria-hidden="true">
              <i
                style={{
                  width: `${Math.round((group.rows.length / largest) * 100)}%`,
                }}
              />
            </div>

            <div
              className={styles.columnBody}
              role="listbox"
              aria-label={group.label}
            >
              {group.rows.map((row, offset) => (
                <BoardCard
                  key={row.task.id}
                  row={row}
                  index={firstIndex + offset}
                  prose={prose}
                  movable={movable}
                  selected={row.task.id === selectedTaskId}
                  tabStop={firstIndex + offset === tabStopIndex}
                  dragging={dragged?.id === row.task.id}
                  showProjects={grouping !== "project"}
                  onSelect={() => onSelect(row.task.id)}
                  onOpen={() => onOpen(row.task.id)}
                  onMove={(step) => move(row, step)}
                  onDragStart={() =>
                    setDragged({
                      id: row.task.id,
                      statusId: row.task.statusId,
                    })
                  }
                  onDragEnd={() => {
                    setDragged(undefined);
                    setDropColumnKey(undefined);
                  }}
                />
              ))}
            </div>

            {/* An empty column is drawn on purpose — moving the last card out
                must not delete the column under the cursor — so it has to say
                whether it can take one. */}
            {group.rows.length > 0 ? null : (
              <p className={styles.columnEmpty}>
                {movable ? "Drop a task here" : "Nothing here"}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};
