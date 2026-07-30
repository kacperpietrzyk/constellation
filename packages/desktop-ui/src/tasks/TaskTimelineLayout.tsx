import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { TaskId } from "@constellation/contracts";

import {
  daysBetweenKeys,
  shiftDayKey,
  weekStartKey,
} from "../calendar-week.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { countLabel, dateKeyInZone, formatDate } from "../i18n.js";
import {
  dueSentence,
  sitsOnADate,
  type TaskProse,
  type TaskRow,
} from "./task-view.js";
import styles from "./task-timeline.module.css";

// The bar runs from THE DAY YOU PLAN TO START to THE DAY YOU PROMISED IT. This
// is the only layout in which the gap between a plan and a promise is a
// distance rather than two fields, which is also why the bar is not decoration:
// its length is the claim.
//
// A task with a deadline nobody planned gets a DASHED bar starting today. That
// bar begins where it begins by default, not by decision — it is a debt, and it
// differs in SHAPE, so the distinction survives a monochrome screen.
//
// Tasks carrying neither a plan nor a deadline are not silently dropped: they
// sit on no date, and the layout counts them out loud underneath and says where
// to find them.

/** The window the accepted prototype draws. Here it is the FLOOR, not the size. */
const WINDOW_WEEKS = 10;
const DAYS_IN_WEEK = 7;

interface TimelineWindow {
  /** Monday of the first week on the track. */
  readonly startKey: string;
  readonly weeks: number;
  readonly totalDays: number;
}

/**
 * The window, derived from the rows and today rather than pinned to a date.
 *
 * It opens on the Monday of the week holding the earliest day on screen —
 * today included, so "now" is always somewhere on the track — and grows in
 * whole weeks until the latest day fits, never shorter than ten weeks. The
 * alternative, a fixed ten weeks with positions clamped to the edges, would
 * draw a task due in November flush against a task due next Friday: identical
 * pictures for different promises, in the one layout whose entire claim is that
 * distance means something. A window wider than the box scrolls sideways
 * instead, which costs a gesture and lies about nothing.
 */
const windowFor = (
  drawn: readonly TaskRow[],
  prose: TaskProse,
): TimelineWindow => {
  const keys = [prose.todayKey];
  for (const row of drawn) {
    if (row.task.startAt !== undefined)
      keys.push(dateKeyInZone(row.task.startAt, prose.timeZone));
    if (row.task.dueAt !== undefined)
      keys.push(dateKeyInZone(row.task.dueAt, prose.timeZone));
  }
  // Day keys are `YYYY-MM-DD` in the workspace timezone, so string order is
  // date order and no second date library is needed to find the ends.
  const earliest = keys.reduce((left, right) => (right < left ? right : left));
  const latest = keys.reduce((left, right) => (right > left ? right : left));
  const startKey = weekStartKey(earliest);
  const weeks = Math.max(
    WINDOW_WEEKS,
    Math.ceil((daysBetweenKeys(startKey, latest) + 1) / DAYS_IN_WEEK),
  );
  return { startKey, weeks, totalDays: weeks * DAYS_IN_WEEK };
};

/**
 * A day key read as a date. Noon UTC rather than midnight on purpose: the key
 * is already a calendar day in the workspace timezone, and midnight formatted
 * west of UTC comes back as the day before.
 */
const dayLabel = (dayKey: string, timeZone: string): string =>
  formatDate(`${dayKey}T12:00:00.000Z`, timeZone);

export const TaskTimelineLayout = ({
  rows,
  prose,
  focusedRowIndex,
  selectedTaskId,
  onSelect,
  onOpen,
  onPlanOnDay,
}: {
  readonly rows: readonly TaskRow[];
  readonly prose: TaskProse;
  readonly focusedRowIndex: number;
  // `| undefined` beside the `?` on purpose: `exactOptionalPropertyTypes` is on,
  // so without it a caller holding `TaskId | undefined` could not pass it at all.
  readonly selectedTaskId?: TaskId | undefined;
  readonly onSelect: (taskId: TaskId) => void;
  readonly onOpen: (taskId: TaskId) => void;
  readonly onPlanOnDay: (taskId: TaskId, dayKey: string) => void;
}) => {
  const drawn = useMemo(
    () => rows.filter((row) => sitsOnADate(row.task)),
    [rows],
  );
  const undatedCount = rows.length - drawn.length;
  const span = useMemo(() => windowFor(drawn, prose), [drawn, prose]);

  const [draggedTaskId, setDraggedTaskId] = useState<TaskId>();
  // Where the drop would land, and on whose track the pointer is standing: the
  // day comes from the x position, so the mark has to appear under the pointer
  // rather than on the row that was picked up.
  const [dropAt, setDropAt] = useState<{
    readonly overTaskId: TaskId;
    readonly dayKey: string;
  }>();

  const nav = useListNavigation({
    itemCount: drawn.length,
    onSelect: (index) => {
      const row = drawn[index];
      if (row) onSelect(row.task.id);
    },
    onOpen: (index) => {
      const row = drawn[index];
      if (row) onOpen(row.task.id);
    },
  });

  // `focusedRowIndex` indexes `rows`, not the drawn subset: a task with no date
  // is a legal place to stand in the list layouts and simply is not on this
  // track. When it maps to nothing drawn, the first bar keeps the tab stop, so
  // the timeline is never a list that Tab cannot reach.
  const focusedTaskId = rows[focusedRowIndex]?.task.id;
  const tabStop = Math.max(
    0,
    drawn.findIndex((row) => row.task.id === focusedTaskId),
  );

  const dayWidth = 100 / span.totalDays;
  const offsetOf = (dayKey: string): number =>
    daysBetweenKeys(span.startKey, dayKey);
  const percentOf = (dayKey: string): number => offsetOf(dayKey) * dayWidth;
  const todayPercent = percentOf(prose.todayKey) + dayWidth / 2;

  const weekStarts = Array.from({ length: span.weeks }, (_unused, index) =>
    shiftDayKey(span.startKey, index * DAYS_IN_WEEK),
  );

  /** Which day the pointer is over, from its position along the track. */
  const dayKeyAt = (track: HTMLElement, clientX: number): string => {
    const box = track.getBoundingClientRect();
    const ratio = box.width === 0 ? 0 : (clientX - box.left) / box.width;
    const day = Math.floor(ratio * span.totalDays);
    return shiftDayKey(
      span.startKey,
      Math.min(span.totalDays - 1, Math.max(0, day)),
    );
  };

  // Planning from the keyboard lives on the row itself, because an option may
  // not hold a button to press. `[` and `]` walk the plan a day at a time from
  // where it already stands — from today when nobody has planned it — and `T`
  // answers the dashed bar directly.
  const planFromKeyboard = (
    row: TaskRow,
    event: ReactKeyboardEvent<HTMLElement>,
  ): boolean => {
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const from =
        row.task.startAt === undefined
          ? prose.todayKey
          : dateKeyInZone(row.task.startAt, prose.timeZone);
      onPlanOnDay(row.task.id, shiftDayKey(from, event.key === "]" ? 1 : -1));
      return true;
    }
    if (event.key === "t" || event.key === "T") {
      event.preventDefault();
      onPlanOnDay(row.task.id, prose.todayKey);
      return true;
    }
    return false;
  };

  if (drawn.length === 0)
    return (
      <div className={styles.timeline}>
        <div className={styles.emptyState} data-timeline-empty>
          <p>
            <strong>Nothing here sits on a date.</strong>
          </p>
          <p>
            {rows.length === 0
              ? "No work matches this view, so there is nothing to lay out in time."
              : "None of these tasks carries a plan or a deadline, so no bar has two ends."}
          </p>
          <p>
            Plan one from the List layout, or open Calendar to give it a day.
          </p>
        </div>
      </div>
    );

  return (
    <div className={styles.timeline}>
      <div className={styles.scroller}>
        <div
          className={styles.grid}
          style={{ "--timeline-weeks": span.weeks } as CSSProperties}
        >
          {/* The axis is scenery for the bars: every date it shows is already in
              the row's accessible name, so a reader hearing the rows is not
              made to walk a second copy of the calendar. */}
          <div className={styles.axis} aria-hidden="true">
            <div className={styles.axisCorner}>Task</div>
            <div className={styles.axisWeeks}>
              {weekStarts.map((weekKey) => (
                <div key={weekKey} className={styles.axisWeek}>
                  {dayLabel(weekKey, prose.timeZone)}
                </div>
              ))}
              <span
                className={styles.axisToday}
                style={{ left: `${todayPercent}%` }}
              >
                Today
              </span>
            </div>
          </div>

          <div
            className={styles.rows}
            role="listbox"
            aria-label="Tasks on a timeline"
          >
            {drawn.map((row, index) => {
              const navProps = nav(index);
              const planKey =
                row.task.startAt === undefined
                  ? prose.todayKey
                  : dateKeyInZone(row.task.startAt, prose.timeZone);
              const dueKey =
                row.task.dueAt === undefined
                  ? undefined
                  : dateKeyInZone(row.task.dueAt, prose.timeZone);
              // A deadline BEFORE the planned start is a real shape, not a bug
              // to normalise away: it is a promise already broken by the plan.
              // The bar spans both ends whichever way round they fall.
              const from =
                dueKey !== undefined && dueKey < planKey ? dueKey : planKey;
              const to =
                dueKey !== undefined && dueKey > planKey ? dueKey : planKey;
              const late =
                dueKey !== undefined &&
                dueKey < prose.todayKey &&
                row.task.completionState !== "completed";
              const unplanned = row.planState === "unplanned";
              const dropKey =
                dropAt !== undefined && dropAt.overTaskId === row.task.id
                  ? dropAt.dayKey
                  : undefined;
              const barShape = unplanned
                ? styles.barDebt
                : row.planState === "held"
                  ? styles.barHeld
                  : styles.barPlanned;
              const barLeft = percentOf(from);
              const barWidth = (offsetOf(to) - offsetOf(from) + 1) * dayWidth;

              return (
                <div
                  key={row.task.id}
                  className={styles.row}
                  role="option"
                  aria-selected={row.task.id === selectedTaskId}
                  aria-label={row.accessibleName}
                  data-timeline-row={row.task.id}
                  draggable
                  ref={navProps.ref}
                  tabIndex={index === tabStop ? 0 : -1}
                  onFocus={navProps.onFocus}
                  onKeyDown={(event) => {
                    if (planFromKeyboard(row, event)) return;
                    navProps.onKeyDown(event);
                  }}
                  onClick={() => onSelect(row.task.id)}
                  onDoubleClick={() => onOpen(row.task.id)}
                  onDragStart={(event) => {
                    event.dataTransfer?.setData?.("text/plain", row.task.id);
                    setDraggedTaskId(row.task.id);
                  }}
                  onDragEnd={() => {
                    setDraggedTaskId(undefined);
                    setDropAt(undefined);
                  }}
                >
                  <div className={styles.label}>
                    <span className={styles.title} data-row-title>
                      {row.task.title}
                    </span>
                    <span className={styles.meta}>
                      {unplanned ? (
                        <span
                          className={styles.chipDebt}
                          data-timeline-unplanned
                        >
                          No plan
                        </span>
                      ) : null}
                      <span className={late ? styles.chipLate : styles.chip}>
                        {dueSentence(row.task, prose)}
                      </span>
                    </span>
                  </div>

                  {/* Dropping anywhere along the track sets `startAt` and never
                      `dueAt`: the gesture means "I will take this on Wednesday",
                      not "I promise it by Wednesday". */}
                  <div
                    className={styles.track}
                    onDragOver={(event) => {
                      if (draggedTaskId === undefined) return;
                      event.preventDefault();
                      const key = dayKeyAt(event.currentTarget, event.clientX);
                      setDropAt({ overTaskId: row.task.id, dayKey: key });
                    }}
                    onDragLeave={() => setDropAt(undefined)}
                    onDrop={(event) => {
                      event.preventDefault();
                      const target = draggedTaskId;
                      const key = dayKeyAt(event.currentTarget, event.clientX);
                      setDraggedTaskId(undefined);
                      setDropAt(undefined);
                      if (target !== undefined) onPlanOnDay(target, key);
                    }}
                  >
                    <span
                      className={styles.today}
                      style={{ left: `${todayPercent}%` }}
                    />
                    <span
                      className={`${styles.bar} ${barShape} ${
                        late ? styles.barLate : ""
                      }`}
                      style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
                    />
                    {dueKey === undefined ? null : (
                      <span
                        className={late ? styles.dueMarkLate : styles.dueMark}
                        style={{ left: `${percentOf(dueKey) + dayWidth}%` }}
                      />
                    )}
                    {dropKey === undefined ? null : (
                      <span
                        className={styles.dropMark}
                        style={{ left: `${percentOf(dropKey)}%` }}
                      >
                        {dayLabel(dropKey, prose.timeZone)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className={styles.legend}>
        <span>
          A bar runs from <strong>the day you plan to start</strong> to{" "}
          <strong>the day you promised it</strong>.
        </span>
        <span>A dashed bar has no plan: it starts today by default.</span>
        <span>
          Drag a bar onto a day to plan it. <kbd>[</kbd> and <kbd>]</kbd> shift
          the plan; <kbd>T</kbd> plans today.
        </span>
        {undatedCount === 0 ? null : (
          <span data-timeline-undated>
            Not drawn: {countLabel(undatedCount, "task")} with no plan and no
            deadline. Find them in the List layout.
          </span>
        )}
      </p>
    </div>
  );
};
