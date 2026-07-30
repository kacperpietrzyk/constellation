import { useMemo, type CSSProperties } from "react";

import type { ProjectId } from "@constellation/contracts";

import { daysBetweenKeys, shiftDayKey } from "../calendar-week.js";
import { dateKeyInZone } from "../i18n.js";
import {
  deadlineDate,
  rowAccessibleName,
  sortByDeadline,
  type HealthKey,
  type ProjectLayoutProps,
  type ProjectProse,
  type ProjectReading,
} from "./project-view.js";
import styles from "./project-timeline.module.css";

// The third lens over the same readings: one row per project, and the bar is
// the distance between NOW and THE DATE SOMEBODY WAS PROMISED. Nothing on this
// screen is recomputed — health, the open count and the row's spoken name all
// come from `project-view.ts`, which is also what the record screen reads.
//
// A `Project` carries `dueAt` and no start date, so a bar has one end that is
// given and one that is today. That is not a degraded Gantt chart: the useful
// question here is "how much room is left", and today is exactly the edge that
// question is measured from. A project with no deadline gets no bar at all
// rather than a bar with an invented end.
//
// The scale is derived from the data. A fixed window would draw a project due
// in November flush against one due next Friday — identical pictures for
// different promises, in the one layout whose whole claim is that distance
// means something.

/** How far past the outermost date the scale still runs, so a deadline never
 *  sits flush against the edge it is being read against. */
const MARGIN_DAYS = 7;

/** Past this much of the track a caption on the right would run off the end,
 *  so it changes sides instead. */
const FLIP_AT = 72;

/** A bar this short is still a bar. Below it the shape disappears and a
 *  deadline two days out becomes indistinguishable from no deadline. */
const MIN_BAR = 1.5;

/** Month names for the axis. Short by design: the tick marks a boundary, the
 *  caption beside each bar carries the date that matters. */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

interface MonthTick {
  readonly key: string;
  readonly label: string;
}

/**
 * Every calendar month boundary strictly inside the range, first of the month.
 *
 * Counted rather than walked: the number of boundaries is the difference
 * between two month indices, so there is no loop that needs a guard against
 * running away when the range is a decade wide.
 */
const monthTicksIn = (
  startKey: string,
  endKey: string,
): readonly MonthTick[] => {
  const startYear = Number(startKey.slice(0, 4));
  const startMonth = Number(startKey.slice(5, 7));
  const endYear = Number(endKey.slice(0, 4));
  const endMonth = Number(endKey.slice(5, 7));
  const boundaries = Math.max(
    (endYear - startYear) * 12 + (endMonth - startMonth),
    0,
  );
  return Array.from({ length: boundaries }, (_unused, index) => {
    // Months counted on from the start month, so the first tick is the
    // boundary AFTER the range opens and never the range's own first day.
    const monthsOn = startMonth + index;
    const year = startYear + Math.floor(monthsOn / 12);
    const month = String((monthsOn % 12) + 1).padStart(2, "0");
    return {
      key: `${year}-${month}-01`,
      label: MONTH_NAMES[monthsOn % 12] as string,
    };
  });
};

interface TimelineScale {
  readonly startKey: string;
  readonly totalDays: number;
  /** How many months the track spans, which is what gives it its width. */
  readonly months: number;
  readonly ticks: readonly MonthTick[];
}

/**
 * The scale, from today and every deadline on the screen — never a fixed
 * window. Day keys are `YYYY-MM-DD` in the workspace timezone, so string order
 * is date order and finding the two ends needs no second date library.
 */
const scaleFor = (
  readings: readonly ProjectReading[],
  prose: ProjectProse,
): TimelineScale => {
  const keys = [prose.todayKey];
  for (const reading of readings) {
    if (reading.project.dueAt !== undefined)
      keys.push(dateKeyInZone(reading.project.dueAt, prose.timeZone));
  }
  const earliest = keys.reduce((left, right) => (right < left ? right : left));
  const latest = keys.reduce((left, right) => (right > left ? right : left));
  const startKey = shiftDayKey(earliest, -MARGIN_DAYS);
  const endKey = shiftDayKey(latest, MARGIN_DAYS);
  const ticks = monthTicksIn(startKey, endKey);
  return {
    startKey,
    totalDays: daysBetweenKeys(startKey, endKey) + 1,
    months: ticks.length + 1,
    ticks,
  };
};

/** Health reaches the bar as a tint. It reaches the reader as the word beside
 *  it, and as the row's spoken name — colour is never the only carrier. */
const barTone: Record<HealthKey, string> = {
  risk: styles.barRisk as string,
  watch: styles.barWatch as string,
  waiting: styles.barWaiting as string,
  good: styles.barGood as string,
  none: styles.barNone as string,
};

interface Bar {
  /** The deadline is already behind us. */
  readonly over: boolean;
  readonly left: number;
  readonly width: number;
  /** The caption stands to the LEFT of the bar rather than after it. */
  readonly flip: boolean;
  readonly date: string;
}

export const ProjectTimelineLayout = ({
  readings,
  prose,
  itemProps,
  selectedProjectId,
  onSelect,
  onOpen,
  clientOf,
}: ProjectLayoutProps) => {
  // Every reading is drawn, including the ones with no deadline. The surface
  // owns the single roving tab stop and keys it by position in `readings`, so
  // a row skipped here would shift every index after it onto the wrong project.
  const drawn = useMemo(() => sortByDeadline(readings), [readings]);
  // Keyed on the two fields the scale actually reads, not on `prose`: the
  // caller rebuilds that object every render, so a dependency on it would
  // recompute the scale every time and the memo would be decoration.
  const scale = useMemo(
    () => scaleFor(drawn, prose),
    [drawn, prose.timeZone, prose.todayKey],
  );

  if (drawn.length === 0)
    return (
      <div className={styles.timeline}>
        <p className={styles.emptyState}>No projects to lay out in time.</p>
      </div>
    );

  const dayWidth = 100 / scale.totalDays;
  const percentOf = (dayKey: string): number =>
    daysBetweenKeys(scale.startKey, dayKey) * dayWidth;
  const todayPercent = percentOf(prose.todayKey) + dayWidth / 2;

  // About as much track as a caption takes: one month column, which is what
  // sets the scale's own width. Used to answer whether the left-hand side has
  // room at all.
  const captionRoom = 100 / scale.months;

  /**
   * The bar for one project, or nothing when no date was ever promised.
   *
   * A deadline that has already passed is drawn where it fell, with the bar
   * covering the ground between it and today. Clamping it to zero would erase
   * the one fact the row exists to carry: an overrun is the LONGEST bar on the
   * screen, not the shortest. It is told apart from time still in hand by its
   * hatching and by ending at today rather than starting there.
   *
   * The caption changes sides when the bar reaches far enough right that a
   * caption after it would run off the end — but ONLY when the left-hand side
   * has room. Every bar that is not overdue starts at today, so the widest bar
   * on the screen starts near the left edge with nothing to its left but the
   * project names; flipping that one would lay the date over the titles, while
   * leaving it on the right merely puts it where the track already scrolls.
   */
  const barFor = (reading: ProjectReading): Bar | undefined => {
    if (reading.project.dueAt === undefined) return undefined;
    const dueKey = dateKeyInZone(reading.project.dueAt, prose.timeZone);
    const over = dueKey < prose.todayKey;
    const from = over ? dueKey : prose.todayKey;
    const to = over ? prose.todayKey : dueKey;
    const left = percentOf(from);
    const width = Math.max(MIN_BAR, (daysBetweenKeys(from, to) + 1) * dayWidth);
    return {
      over,
      left,
      width,
      flip: left + width > FLIP_AT && left > captionRoom,
      // `deadlineDate` answers `undefined` only for a project with no
      // deadline, which this branch has already excluded. The fallback is
      // unreachable and exists because the helper's type cannot say so.
      date: deadlineDate(reading, prose) ?? "",
    };
  };

  return (
    <div className={styles.timeline}>
      {/* The track scrolls INSIDE this box. The scale grows with the data, so
          a range wider than the window is expected; the surface sliding
          sideways under it is not. */}
      <div className={styles.scroller}>
        <div
          className={styles.grid}
          style={{ "--timeline-month-count": scale.months } as CSSProperties}
        >
          {/* Scenery for the bars: every date the axis shows is already inside
              the row's accessible name, so a reader hearing the rows is not
              made to walk a second copy of the calendar. */}
          <div className={styles.axis} aria-hidden="true">
            <div className={styles.axisCorner}>Project</div>
            <div className={styles.axisScale}>
              {scale.ticks.map((tick) => (
                <span
                  className={styles.axisMonth}
                  key={tick.key}
                  style={{ left: `${percentOf(tick.key)}%` }}
                >
                  {tick.label}
                </span>
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
            aria-label="Projects on a timeline"
          >
            {drawn.map((reading, index) => {
              const bar = barFor(reading);
              const tone = barTone[reading.health.key];
              return (
                <div
                  {...itemProps(index)}
                  aria-label={rowAccessibleName(
                    reading,
                    clientOf(reading.project.id),
                  )}
                  aria-selected={reading.project.id === selectedProjectId}
                  className={styles.row}
                  data-project-row={reading.project.id}
                  key={reading.project.id}
                  onClick={() => onSelect(reading.project.id as ProjectId)}
                  onDoubleClick={() => onOpen(reading.project.id as ProjectId)}
                  role="option"
                >
                  <div className={styles.label}>
                    <span className={styles.title} data-row-title>
                      {reading.project.title}
                    </span>
                    <span className={styles.health}>
                      {reading.health.label}
                    </span>
                  </div>

                  <div className={styles.track}>
                    {bar === undefined ? (
                      <span className={styles.undated}>
                        No start and no deadline recorded
                      </span>
                    ) : (
                      <>
                        {/* An overrun is a STATE of the bar, not another
                            variant of it: the tint still says which health
                            reading this is, and the attribute adds the
                            hatching over the top. */}
                        <span
                          className={`${styles.bar} ${tone}`}
                          data-over={bar.over || undefined}
                          style={{
                            left: `${bar.left}%`,
                            width: `${bar.width}%`,
                          }}
                        />
                        {/* Beside the bar, never inside it: a short project's
                            bar is a few dozen pixels wide and any text in
                            there is clipped mid-date. */}
                        <span
                          className={
                            bar.flip ? styles.captionFlipped : styles.caption
                          }
                          style={
                            bar.flip
                              ? { right: `${100 - bar.left}%` }
                              : { left: `${bar.left + bar.width}%` }
                          }
                        >
                          {bar.date} · {reading.open.length} open
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* One rule layer over the whole collection rather than a copy per
                row: the months and today are the same two facts for every row,
                so they are drawn once. Last child so the dashed today line
                stays visible over the bar tints, and it takes no pointer, so a
                click still lands on the row underneath. */}
            <div className={styles.rules} aria-hidden="true">
              {scale.ticks.map((tick) => (
                <span
                  className={styles.rule}
                  key={tick.key}
                  style={{ left: `${percentOf(tick.key)}%` }}
                />
              ))}
              <span
                className={styles.today}
                style={{ left: `${todayPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
