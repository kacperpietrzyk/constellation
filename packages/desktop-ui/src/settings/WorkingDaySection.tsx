import { useState, type FormEvent } from "react";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  setWorkspaceWorkingDay,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";

import styles from "./working-day-section.module.css";

/**
 * THE HOURS THIS WORKSPACE WORKS — the control B10 turned out to owe.
 *
 * The debt line said "the hardcoded eight-hour day". THAT IS NO LONGER TRUE
 * and this section is not it: the constant is gone, the projection carries the
 * effective value, and Today's remaining capacity is already computed from
 * `endMinute − startMinute` gated on the weekday. What was left is the other
 * half of the same sentence — THE DAY WAS READABLE ON THREE SCREENS AND
 * SETTABLE ON NONE. The kernel arm and its conformance tests shipped with the
 * schema; there was no renderer wrapper and no control, so the only working
 * day anyone could have was the default one.
 *
 * The day is sent WHOLE, because the schema refuses an end before its start
 * and a repeated weekday, and neither refusal can be made one field at a time.
 */
const UI_LOCALE = "en-GB";

/**
 * Weekday names DERIVED, not written down. ISO numbers the days 1..7 from
 * Monday, and 2024-01-01 was a Monday, so the reference date for day `n` is
 * that Monday plus `n − 1` — formatted in UTC so no machine's timezone can
 * shift a name onto the day next door. A hand-written list of seven strings
 * beside a closed numeric vocabulary is the family this repository keeps
 * paying for; a calendar fact does not need one.
 */
const weekdayFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  weekday: "short",
  timeZone: "UTC",
});
const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const weekdayLabel = (weekday: number): string =>
  weekdayFormatter.format(new Date(Date.UTC(2024, 0, weekday)));

/** Minutes from local midnight ↔ what `<input type="time">` reads and writes. */
const toClock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
const fromClock = (clock: string): number | undefined => {
  const match = /^(\d{2}):(\d{2})$/u.exec(clock);
  if (match === null) return undefined;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isInteger(minutes) ? minutes : undefined;
};

export const WorkingDaySection = ({
  client,
  snapshot,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const day = snapshot.bootstrap.workspace.workingDay;
  const [start, setStart] = useState(toClock(day.startMinute));
  const [end, setEnd] = useState(toClock(day.endMinute));
  const [weekdays, setWeekdays] = useState<readonly number[]>(day.weekdays);
  const [busy, setBusy] = useState(false);

  const startMinute = fromClock(start);
  const endMinute = fromClock(end);
  const orderedWeekdays = [...weekdays].sort((left, right) => left - right);
  // The same three refusals the schema makes, asked before the round trip
  // rather than instead of it: the kernel still decides, this only declines to
  // send a command whose answer is already known.
  const valid =
    startMinute !== undefined &&
    endMinute !== undefined &&
    startMinute < endMinute &&
    endMinute <= 24 * 60 &&
    orderedWeekdays.length > 0;
  const unchanged =
    startMinute === day.startMinute &&
    endMinute === day.endMinute &&
    orderedWeekdays.join(",") === [...day.weekdays].sort().join(",");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || !client || busy) return;
    setBusy(true);
    void (async () => {
      try {
        const result = await setWorkspaceWorkingDay(client, snapshot, {
          startMinute,
          endMinute,
          weekdays: orderedWeekdays,
        });
        if (result.kind === "success") {
          await onReload();
          return;
        }
        onFailure(result as MutationFailure);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <form
      className={`settings-control ${styles.workingDay}`}
      data-working-day="true"
      onSubmit={submit}
    >
      <div className={styles.hours}>
        <label className={styles.hour}>
          <span>Day starts</span>
          <input
            type="time"
            value={start}
            disabled={busy}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label className={styles.hour}>
          <span>Day ends</span>
          <input
            type="time"
            value={end}
            disabled={busy}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
      </div>

      <fieldset className={styles.weekdays}>
        <legend>Days worked</legend>
        {ISO_WEEKDAYS.map((weekday) => {
          const worked = weekdays.includes(weekday);
          return (
            <label key={weekday} className={styles.weekday}>
              <input
                type="checkbox"
                checked={worked}
                disabled={busy}
                aria-label={weekdayLabel(weekday)}
                onChange={() =>
                  setWeekdays(
                    worked
                      ? weekdays.filter((other) => other !== weekday)
                      : [...weekdays, weekday],
                  )
                }
              />
              <span>{weekdayLabel(weekday)}</span>
            </label>
          );
        })}
      </fieldset>

      {valid ? null : (
        <p className={styles.invalid} role="status">
          A day ends after it starts, on at least one weekday.
        </p>
      )}

      <button type="submit" disabled={busy || unchanged || !valid || !client}>
        Save working day
      </button>
    </form>
  );
};
