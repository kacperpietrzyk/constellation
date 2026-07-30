import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { TaskId } from "@constellation/contracts";

import { planIntent, shiftDayKey, weekStartKey } from "../calendar-week.js";
import {
  countLabel,
  dateKeyInZone,
  formatDate,
  formatTime,
  instantForZonedDate,
} from "../i18n.js";
import type { ListNavigationItemProps } from "../hooks/useListNavigation.js";
import { isoWeekdayInZone } from "../today-plan.js";
import {
  dueSentence,
  sortRows,
  type TaskProse,
  type TaskRow,
} from "./task-view.js";
import styles from "./task-calendar.module.css";

// The DEGRADED calendar: a lens over ONE collection, answering the narrower
// question "when does this view's work fall". It carries no meetings, and that
// is a boundary rather than an omission — planning a week against meetings is
// the Calendar destination's job, and this layout points at it instead of
// pretending to replace it.
//
// Three rules this file exists to keep:
//
// · DROPPING A TASK ON A DAY SETS THE PLAN (`startAt`), NEVER THE DEADLINE.
//   The gesture means "I will get to this on Wednesday", not "I promise it for
//   Wednesday". Both mouse and keyboard go through `planIntent`, so the two
//   roads cannot drift into writing different fields.
// · A DAY CELL CARRIES ONLY THE DAY. There is no drop target nested inside a
//   cell: a drop walks to the nearest ancestor carrying `data-day`, and a
//   nested zone would write the day into the wrong field.
// · AN OPTION HOLDS NO INTERACTIVE CHILDREN. The keyboard equivalent of the
//   drag is one picker at layout level, opened with `M` on the focused task,
//   not a button inside every card. `M` and not Enter or Space: the shell's
//   `useListNavigation` already binds those two to open and select, and a
//   third meaning for one key is a key that does something different depending
//   on which layout is on screen.

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Five weeks — the same 35 days the keyboard picker offers, so a keyboard
 *  reaches exactly the days a mouse can drop onto. */
const GRID_DAYS = 35;

/** The rail is a rail, not a second list; past this it points back at the list. */
const RAIL_LIMIT = 14;

const dayNumber = (dayKey: string): string => dayKey.slice(8, 10);

const weekdayShort = (dayKey: string): string =>
  DAY_SHORT[isoWeekdayInZone(`${dayKey}T12:00:00.000Z`, "UTC") - 1] ?? "";

/** The day as a reader names it, in the workspace timezone and never the machine's. */
const dayLabel = (dayKey: string, timeZone: string): string => {
  const instant = instantForZonedDate(dayKey, timeZone, "start");
  return instant === undefined ? dayKey : formatDate(instant, timeZone);
};

/** When the work sits in the day: the reserved hour, or the honest absence of one. */
const whenLabel = (row: TaskRow, timeZone: string): string =>
  row.task.calendarBlock === undefined
    ? "No time"
    : formatTime(row.task.calendarBlock.startsAt, timeZone);

type CalendarCell = {
  readonly key: string;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly weekday: string;
  readonly label: string;
  readonly planned: readonly TaskRow[];
  /** Deadlines falling here — somebody else's promise, not this plan. */
  readonly deadlines: readonly TaskRow[];
};

/** Reserved time first, in clock order; work with only a day follows it. */
const byReservedTime = (entries: readonly TaskRow[]): readonly TaskRow[] => [
  ...entries
    .filter((row) => row.task.calendarBlock !== undefined)
    .toSorted((left, right) =>
      (left.task.calendarBlock?.startsAt ?? "").localeCompare(
        right.task.calendarBlock?.startsAt ?? "",
      ),
    ),
  ...entries.filter((row) => row.task.calendarBlock === undefined),
];

const buildGrid = (
  rows: readonly TaskRow[],
  timeZone: string,
  todayKey: string,
) => {
  const month = todayKey.slice(0, 7);
  const start = weekStartKey(`${month}-01`);
  const keys = Array.from({ length: GRID_DAYS }, (_unused, index) =>
    shiftDayKey(start, index),
  );

  const plannedOn = new Map<string, TaskRow[]>();
  const deadlineOn = new Map<string, TaskRow[]>();
  let plannedCount = 0;
  let deadlineCount = 0;
  for (const row of rows) {
    const { startAt, dueAt, completionState } = row.task;
    if (startAt !== undefined) {
      plannedCount += 1;
      const key = dateKeyInZone(startAt, timeZone);
      const bucket = plannedOn.get(key);
      if (bucket === undefined) plannedOn.set(key, [row]);
      else bucket.push(row);
    }
    // A finished task's deadline is history, not a promise still standing.
    if (dueAt !== undefined && completionState !== "completed") {
      deadlineCount += 1;
      const key = dateKeyInZone(dueAt, timeZone);
      const bucket = deadlineOn.get(key);
      if (bucket === undefined) deadlineOn.set(key, [row]);
      else bucket.push(row);
    }
  }

  const cells: readonly CalendarCell[] = keys.map((key) => ({
    key,
    inMonth: key.slice(0, 7) === month,
    isToday: key === todayKey,
    weekday: weekdayShort(key),
    label: dayLabel(key, timeZone),
    planned: byReservedTime(plannedOn.get(key) ?? []),
    deadlines: deadlineOn.get(key) ?? [],
  }));

  const rail = sortRows(
    rows.filter(
      (row) =>
        row.task.startAt === undefined &&
        row.task.completionState !== "completed",
    ),
    "due",
  );
  const shownRail = rail.slice(0, RAIL_LIMIT);

  // One flat index sequence over everything a keyboard can land on: the grid in
  // day order, then the rail. The shell owns the navigation hook and hands the
  // accessor down, so the order it counts in has to be stated, not felt.
  const order = new Map<TaskId, number>();
  for (const cell of cells)
    for (const row of cell.planned) order.set(row.task.id, order.size);
  for (const row of shownRail) order.set(row.task.id, order.size);

  const drawn = cells.reduce((total, cell) => total + cell.planned.length, 0);
  return {
    cells,
    rail,
    shownRail,
    order,
    plannedCount,
    deadlineCount,
    // Work planned outside the five weeks drawn. Without this the header count
    // and the grid would disagree, and the grid would look like the whole truth.
    offGrid: plannedCount - drawn,
    range: `${dayLabel(keys[0] ?? todayKey, timeZone)} – ${dayLabel(
      keys[GRID_DAYS - 1] ?? todayKey,
      timeZone,
    )}`,
  };
};

export const TaskCalendarLayout = ({
  rows,
  prose,
  itemProps,
  selectedTaskId,
  onSelect,
  onOpen,
  onPlanOnDay,
  onOpenCalendarDestination,
}: {
  readonly rows: readonly TaskRow[];
  readonly prose: TaskProse;
  /** The shell's roving tab stop, so one stop survives a layout switch. Index
   *  order: the tasks drawn on days, in draw order, then the side rail. */
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selectedTaskId?: TaskId;
  readonly onSelect: (taskId: TaskId) => void;
  readonly onOpen: (taskId: TaskId) => void;
  /** Plan, not deadline: the shell writes `startAt` and never touches `dueAt`. */
  readonly onPlanOnDay: (taskId: TaskId, dayKey: string) => void;
  readonly onOpenCalendarDestination: () => void;
}) => {
  const timeZone = prose.timeZone;
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<TaskId>();
  const [droppingDayKey, setDroppingDayKey] = useState<string>();
  const [pickerTaskId, setPickerTaskId] = useState<TaskId>();
  const [focusDayKey, setFocusDayKey] = useState<string>();

  // Composing the grid walks every row twice and is paid on every hover of a
  // dragged card; the material does not change while the cursor moves. The two
  // fields go in separately rather than `prose` whole: the parent rebuilds that
  // object every render, so a memo keyed on it would never hit.
  const grid = useMemo(
    () => buildGrid(rows, timeZone, prose.todayKey),
    [rows, timeZone, prose.todayKey],
  );

  useEffect(() => {
    if (pickerTaskId === undefined) return;
    pickerRef.current?.focus();
  }, [pickerTaskId]);

  // After planning from the keyboard, focus lands on the day that received the
  // work: the card the choice started from has moved or left the rail, and
  // focus on a detached node is focus on `<body>` — the keyboard would be
  // thrown back to the top of the screen by its own successful write.
  // Scoped to this layout's root: `data-day` is the Calendar destination's
  // attribute too, and a document-wide lookup could focus the other screen.
  useEffect(() => {
    if (focusDayKey === undefined) return;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-day="${focusDayKey}"]`)
      ?.focus();
    setFocusDayKey(undefined);
  }, [focusDayKey]);

  const plan = (
    taskId: TaskId | undefined,
    dayKey: string | undefined,
    options?: { readonly focusDay: boolean },
  ): void => {
    const intent = planIntent(taskId, dayKey);
    setDraggedTaskId(undefined);
    setDroppingDayKey(undefined);
    setPickerTaskId(undefined);
    if (intent === undefined) return;
    if (options?.focusDay === true) setFocusDayKey(intent.dayKey);
    onPlanOnDay(intent.taskId, intent.dayKey);
  };

  const dismissPicker = (taskId: TaskId): void => {
    setPickerTaskId(undefined);
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-task-card="${taskId}"]`)
      ?.focus();
  };

  // The one key this layout claims. `useListNavigation` already owns the
  // arrows, Enter and Space, so planning needs a key of its own — otherwise
  // dragging would be the only way to put work on a day, and a drag-only
  // affordance does not exist for somebody working from the keyboard.
  const onCardKeyDown =
    (taskId: TaskId) =>
    (event: ReactKeyboardEvent<HTMLElement>): void => {
      if (event.key !== "m" && event.key !== "M") return;
      event.preventDefault();
      setPickerTaskId(taskId);
    };

  const cardProps = (row: TaskRow) => {
    const index = grid.order.get(row.task.id) ?? -1;
    const nav = itemProps(index);
    return {
      // Focus, the tab stop and the arrow keys come from the shell's hook; what
      // this layout adds is the one key the hook does not claim.
      ...nav,
      role: "option" as const,
      "aria-selected": row.task.id === selectedTaskId,
      "aria-label": row.accessibleName,
      "aria-keyshortcuts": "M",
      "data-row": index,
      "data-task-card": row.task.id,
      draggable: true,
      onClick: () => onSelect(row.task.id),
      onDoubleClick: () => onOpen(row.task.id),
      onDragStart: (event: ReactDragEvent<HTMLElement>) => {
        event.dataTransfer?.setData?.("text/plain", row.task.id);
        setDraggedTaskId(row.task.id);
      },
      onDragEnd: () => {
        setDraggedTaskId(undefined);
        setDroppingDayKey(undefined);
      },
      onKeyDown: onCardKeyDown(row.task.id),
    };
  };

  // Zero rows is a filter catching nothing, not a plan that holds — so this
  // state must never be the sentence about everything having a day.
  if (rows.length === 0)
    return (
      <div className={styles.calendar} ref={rootRef}>
        <div className={styles.emptyState} data-calendar-empty>
          <p>
            <strong>No work matches this view.</strong>
          </p>
          <p>Loosen a filter to see work here.</p>
        </div>
      </div>
    );

  return (
    <div className={styles.calendar} ref={rootRef}>
      <header className={styles.head}>
        <p className={styles.lead}>
          <strong>
            Only the work in this view, on the day you plan to start it.
          </strong>{" "}
          No meetings here.{" "}
          <button
            type="button"
            className={styles.link}
            data-open-calendar
            onClick={onOpenCalendarDestination}
          >
            Open Calendar
          </button>{" "}
          puts them beside your plan.
        </p>
        <p className={styles.counts} data-calendar-counts>
          <span>{countLabel(grid.plannedCount, "task")} planned</span>
          <span className={styles.separator}>·</span>
          <span>{countLabel(grid.deadlineCount, "deadline")} here</span>
          <span className={styles.separator}>·</span>
          <span>{countLabel(grid.rail.length, "task")} with no day yet</span>
          {grid.offGrid > 0 ? (
            <>
              <span className={styles.separator}>·</span>
              <span data-off-grid>
                {grid.offGrid} planned outside this range
              </span>
            </>
          ) : null}
        </p>
        <p className={styles.range} data-grid-range>
          {grid.range}
        </p>
      </header>

      <div className={styles.grid}>
        {DAY_SHORT.map((name) => (
          // The full date rides on every cell's own label, so the header row is
          // decoration and says so.
          <span key={name} className={styles.dow} aria-hidden="true">
            {name}
          </span>
        ))}
        {grid.cells.map((cell) => (
          <div
            key={cell.key}
            className={[
              styles.cell,
              cell.inMonth ? "" : styles.cellOther,
              cell.isToday ? styles.cellToday : "",
              droppingDayKey === cell.key ? styles.cellDropping : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="group"
            aria-label={`${cell.label}, ${countLabel(
              cell.planned.length,
              "task",
            )} planned, ${countLabel(cell.deadlines.length, "deadline")}`}
            data-day={cell.key}
            // Focus target after a keyboard plan; the day that received the
            // work is the one node certain to still exist after the write.
            tabIndex={-1}
            onDragOver={(event) => {
              if (draggedTaskId === undefined) return;
              event.preventDefault();
              setDroppingDayKey(cell.key);
            }}
            onDragLeave={() => setDroppingDayKey(undefined)}
            onDrop={(event) => {
              event.preventDefault();
              plan(draggedTaskId, cell.key);
            }}
          >
            <div className={styles.cellHead}>
              <span className={styles.dayNum}>{dayNumber(cell.key)}</span>
              <span className={styles.dowInline} aria-hidden="true">
                {cell.weekday}
              </span>
              {/* Today carries a word, not only an outline: colour is never the
                  only carrier of meaning. */}
              {cell.isToday ? (
                <span className={styles.todayTag} data-today-cell>
                  Today
                </span>
              ) : null}
              {/* A deadline is somebody else's promise: it counts, it never
                  becomes a card, and nothing here drags it. */}
              {cell.deadlines.length > 0 ? (
                <span className={styles.deadlines} data-day-deadlines>
                  {cell.deadlines.length} due
                </span>
              ) : null}
            </div>
            {cell.planned.length > 0 ? (
              <ul
                className={styles.cards}
                role="listbox"
                aria-label={cell.label}
              >
                {cell.planned.map((row) => (
                  <li
                    key={row.task.id}
                    className={[
                      styles.card,
                      row.planState === "held" ? styles.cardHeld : "",
                      draggedTaskId === row.task.id ? styles.cardDragging : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    {...cardProps(row)}
                  >
                    <span className={styles.when}>
                      {whenLabel(row, timeZone)}
                    </span>
                    <span className={styles.cardTitle} data-row-title>
                      {row.task.title}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      {/* The keyboard road to the same write as the drag. It stands OUTSIDE the
          options: a listbox option holding buttons hands a screen reader a row
          it cannot describe, and the shipped Calendar row is the example not to
          copy here. */}
      {pickerTaskId !== undefined ? (
        <div
          className={styles.picker}
          role="group"
          aria-label="Plan on a day"
          data-plan-picker={pickerTaskId}
          onKeyDown={(event) => {
            // Keys stop here: arrows would otherwise move the roving stop
            // behind the open menu.
            event.stopPropagation();
            if (event.key !== "Escape") return;
            event.preventDefault();
            dismissPicker(pickerTaskId);
          }}
        >
          <p className={styles.pickerSay}>Choose the day you will start it.</p>
          <div className={styles.pickerDays}>
            {grid.cells.map((cell, index) => (
              <button
                key={cell.key}
                type="button"
                ref={index === 0 ? pickerRef : undefined}
                className="ghost-button compact"
                aria-label={cell.label}
                aria-current={cell.isToday ? "date" : undefined}
                data-move-to={cell.key}
                onClick={() => plan(pickerTaskId, cell.key, { focusDay: true })}
              >
                {cell.weekday} {dayNumber(cell.key)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <section className={styles.rail} aria-labelledby="task-calendar-rail">
        <div className={styles.railHead}>
          <h3 className={styles.railTitle} id="task-calendar-rail">
            No day yet <span className={styles.count}>{grid.rail.length}</span>
          </h3>
          <p className={styles.railSay}>
            Nearest deadline first. A drop sets the start, never the deadline.
          </p>
          <p className={styles.railSay}>
            Press <kbd>M</kbd> on a task to plan it without the mouse.
          </p>
        </div>
        {grid.shownRail.length === 0 ? (
          <p className={styles.railNone} data-rail-none>
            Everything open in this view has a day. That is what a plan that
            holds looks like.
          </p>
        ) : (
          <ul
            className={styles.chips}
            role="listbox"
            aria-label="Work with no day yet"
          >
            {grid.shownRail.map((row) => (
              <li
                key={row.task.id}
                className={[
                  styles.chip,
                  draggedTaskId === row.task.id ? styles.cardDragging : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                {...cardProps(row)}
              >
                <span className={styles.chipDue}>
                  {dueSentence(row.task, prose)}
                </span>
                <span className={styles.chipTitle} data-row-title>
                  {row.task.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        {grid.rail.length > grid.shownRail.length ? (
          <p className={styles.railMore} data-rail-overflow>
            {grid.rail.length - grid.shownRail.length} more are in the list
            layout.
          </p>
        ) : null}
      </section>
    </div>
  );
};
