import { useState, type FormEvent } from "react";

import type { SpaceId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createWorkLink,
  firstSpace,
  removeWorkLink,
  setTaskOperationalState,
  type DesktopSnapshot,
  type MutationFailure,
  type WorkOverviewProjection,
} from "../client/workflow.js";
import { InlinePopover } from "../components/InlinePopover.js";
import { dateKeyInZone, instantForZonedDate } from "../i18n.js";
import type { WorkTask } from "../tasks/task-view.js";
import styles from "./task-operations.module.css";

// The two operations on a task that live NOWHERE else in the product.
//
// The inspector rail authors working context, reservation, fields, assignment,
// attachments and removal. It does not author state and it cannot: the rail's
// task is a `task.list` item, and `task.setOperationalState` needs the version
// of the `work.overview` task — which is exactly what the record screen already
// holds. That type fit is the reason these two controls belong here rather than
// beside the rail's, and it is stated so the next reader does not delete them as
// duplicates of controls the rail does not have.
//
// Imported STATICALLY by the record screen, which is itself lazy — and that is a
// measured decision rather than the obvious one.
//
// The obvious shape was a nested `lazy()`, keeping this sheet out of
// `task-record.module.css`, which every record open pays for. It was built that
// way and undone: a dynamic import INSIDE a lazy chunk makes Vite extract
// `__vitePreload` into a shared chunk, and that chunk is reachable from the
// entry, so it joins `modulepreload`. The hot path grew 237 B of gzip — a
// quarter of everything that was left — to save bytes on a path that is not the
// scarce one. So this travels with the screen: a few kilobytes on opening a
// record, and nothing at all on first paint.

type WorkLink = WorkOverviewProjection["links"][number];
type OperationalState = WorkTask["operationalState"];
type WaitingDirection = NonNullable<
  NonNullable<WorkTask["waitingOn"]>["direction"]
>;

const STATE_LABELS: Record<OperationalState, string> = {
  actionable: "Actionable",
  waiting: "Waiting",
  blocked: "Blocked",
};

const DIRECTION_LABELS: Record<WaitingDirection, string> = {
  waiting_on_them: "Waiting on them",
  we_owe: "We owe",
};

const DIRECTIONS = Object.keys(DIRECTION_LABELS) as WaitingDirection[];

interface Wiring {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}

/**
 * One write, its busy flag and its failure path — the same contract the work
 * surface used, narrowed to a single record so the busy flag is a boolean
 * rather than a set keyed by task.
 *
 * A rejected transport promise lands in `onFailure` and still clears busy: a
 * control stuck disabled after a dropped connection reads as a broken screen.
 */
const useWrite = ({ onReload, onFailure }: Wiring) => {
  const [busy, setBusy] = useState(false);
  const run = async (
    operation: () => Promise<{ readonly kind: string }>,
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await operation();
      if (result.kind === "success") {
        await onReload();
        return true;
      }
      onFailure(result as MutationFailure);
      return false;
    } catch {
      onFailure({
        kind: "unavailable",
        message: "Could not reach the data layer. Nothing changed — try again.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return [busy, run] as const;
};

/**
 * What state this task is in, and — when it is waiting — on whom, which way
 * round, and until when.
 *
 * Every draft falls back to what the task ALREADY says rather than to empty.
 * Changing only the date has to re-send the label and the direction unchanged,
 * because the kernel replaces `waitingOn` wholesale: a draft seeded empty would
 * quietly erase the reason somebody wrote down.
 */
export const TaskStatePanel = ({
  task,
  wiring,
}: {
  readonly task: WorkTask;
  readonly wiring: Wiring;
}) => {
  const { client, snapshot } = wiring;
  const [busy, run] = useWrite(wiring);
  const [open, setOpen] = useState(false);
  const timeZone = snapshot.bootstrap.workspace.timezone;
  const storedDate =
    task.waitingOn?.expectedAt === undefined
      ? ""
      : dateKeyInZone(task.waitingOn.expectedAt, timeZone);
  const [label, setLabel] = useState<string>();
  const [direction, setDirection] = useState<WaitingDirection>();
  const [expectedDate, setExpectedDate] = useState<string>();

  const currentLabel = label ?? task.waitingOn?.label ?? "";
  const currentDirection =
    direction ?? task.waitingOn?.direction ?? "waiting_on_them";
  const currentDate = expectedDate ?? storedDate;

  const apply = async (
    state: OperationalState,
    waitingLabel?: string,
    waitingDetails?: {
      readonly direction?: WaitingDirection;
      readonly expectedAt?: string;
    },
  ): Promise<void> => {
    if (!client) return;
    const changed = await run(() =>
      setTaskOperationalState(
        client,
        snapshot,
        task,
        state,
        waitingLabel,
        waitingDetails,
      ),
    );
    if (!changed) return;
    // The drafts go back to reading the record. Keeping them would show the
    // text somebody just cleared with "Actionable" as if it were still stored.
    setLabel(undefined);
    setDirection(undefined);
    setExpectedDate(undefined);
    setOpen(false);
  };

  return (
    <InlinePopover
      label={`State: ${STATE_LABELS[task.operationalState]}`}
      onOpenChange={setOpen}
      open={open}
      panelLabel={`Change what stands in the way of: ${task.title}`}
      triggerClassName="task-state-trigger"
    >
      <div className={styles.panel}>
        {/* Named out loud because the button erases writing: Actionable drops
            `waitingOn` in the command, so a reason recorded here is gone. */}
        <button
          className={styles.wide}
          disabled={busy || !client}
          onClick={() => void apply("actionable")}
          type="button"
        >
          Actionable
        </button>
        <p className={styles.note}>Actionable clears who this task waits on.</p>

        <label className={styles.field} htmlFor="task-waiting-label">
          Waiting on
        </label>
        <input
          id="task-waiting-label"
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Who or what are you waiting on?"
          value={currentLabel}
        />

        <label className={styles.field} htmlFor="task-waiting-direction">
          Which way round
        </label>
        <select
          id="task-waiting-direction"
          onChange={(event) =>
            setDirection(event.target.value as WaitingDirection)
          }
          value={currentDirection}
        >
          {DIRECTIONS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {DIRECTION_LABELS[candidate]}
            </option>
          ))}
        </select>

        <label className={styles.field} htmlFor="task-waiting-expected">
          Look at it again on
        </label>
        <input
          id="task-waiting-expected"
          onChange={(event) => setExpectedDate(event.target.value)}
          type="date"
          value={currentDate}
        />

        <button
          className={styles.wide}
          disabled={busy || !client || currentLabel.trim() === ""}
          onClick={() => {
            const expectedAt =
              currentDate === ""
                ? undefined
                : // End of that day in the workspace's zone. A review date is a
                  // deadline for looking again, so it is not due until the day
                  // is over.
                  instantForZonedDate(currentDate, timeZone, "end");
            void apply("waiting", currentLabel, {
              direction: currentDirection,
              ...(expectedAt === undefined ? {} : { expectedAt }),
            });
          }}
          type="button"
        >
          Set waiting
        </button>

        <button
          className={styles.wide}
          disabled={busy || !client}
          onClick={() => void apply("blocked")}
          type="button"
        >
          Blocked
        </button>
      </div>
    </InlinePopover>
  );
};

/**
 * Attaching and detaching what this task waits for.
 *
 * Both directions are offered, and each says which one it is in words: the edge
 * is one record, and the task at the other end of "it depends on this task" is
 * just as entitled to have the link taken off. Detaching is a state change on
 * the link, not a delete — undo puts it back.
 */
export const TaskDependencyPanel = ({
  task,
  tasks,
  blockedBy,
  blocks,
  wiring,
}: {
  readonly task: WorkTask;
  readonly tasks: readonly WorkTask[];
  readonly blockedBy: readonly WorkLink[];
  readonly blocks: readonly WorkLink[];
  readonly wiring: Wiring;
}) => {
  const { client, snapshot } = wiring;
  const [busy, run] = useWrite(wiring);
  const [open, setOpen] = useState(false);

  // The Space the kernel checks the link against. `work.overview` tasks carry
  // no Space, so it comes from the same task in `task.list` — which is capped,
  // hence the fallback. The fallback is the workspace's first Space, which is
  // what this edge was always written into; naming it here rather than letting
  // `createWorkLink` default was the point of removing that default.
  const spaceId: SpaceId =
    (snapshot.tasks.find((item) => item.id === task.id)?.spaceId as
      SpaceId | undefined) ?? firstSpace(snapshot);

  const linkedIds = new Set([
    ...blockedBy.map((link) => link.targetRecordId),
    ...blocks.map((link) => link.sourceRecordId),
  ]);
  const candidates = tasks.filter(
    (candidate) => candidate.id !== task.id && !linkedIds.has(candidate.id),
  );

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dependencyId = String(data.get("dependencyId") ?? "");
    if (!client || dependencyId === "") return;
    const created = await run(() =>
      createWorkLink(
        client,
        snapshot,
        spaceId,
        "task_depends_on_task",
        // Source depends on target. Reversed, the link still draws — under the
        // other heading, with confident wording and identical counts.
        task.id,
        dependencyId,
      ),
    );
    if (created) setOpen(false);
  };

  const detach = async (link: WorkLink): Promise<void> => {
    if (!client) return;
    await run(() =>
      removeWorkLink(client, snapshot, { id: link.id, version: link.version }),
    );
  };

  const detachRow = (link: WorkLink, otherId: string, meta: string) => {
    const other = tasks.find((candidate) => candidate.id === otherId);
    return (
      <li className={styles.detachRow} key={link.id}>
        <span className={styles.detachLabel}>
          {other?.title ?? "A task outside this Space’s work"}
          <small className={styles.detachMeta}>{meta}</small>
        </span>
        <button
          disabled={busy || !client}
          onClick={() => void detach(link)}
          type="button"
        >
          Detach
        </button>
      </li>
    );
  };

  return (
    <InlinePopover
      label="Edit dependencies"
      onOpenChange={setOpen}
      open={open}
      panelLabel={`Edit what this task waits for: ${task.title}`}
    >
      <div className={styles.panel}>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <label className={styles.field} htmlFor="task-dependency">
            This task depends on
          </label>
          {/* A task cannot depend on itself and cannot depend twice on the same
              task, so neither is offered. A guard that refuses after the click
              is a guard the reader has to discover. */}
          <select id="task-dependency" name="dependencyId" required>
            <option value="">Choose a task…</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
          <button disabled={busy || !client} type="submit">
            Add dependency
          </button>
        </form>

        {blockedBy.length + blocks.length > 0 && (
          <ul className={styles.detachList}>
            {blockedBy.map((link) =>
              detachRow(link, link.targetRecordId, "this task depends on it"),
            )}
            {blocks.map((link) =>
              detachRow(link, link.sourceRecordId, "it depends on this task"),
            )}
          </ul>
        )}
      </div>
    </InlinePopover>
  );
};

export type { Wiring as TaskOperationsWiring };
