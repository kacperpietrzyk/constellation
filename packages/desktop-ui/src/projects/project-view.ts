import type { ProjectId } from "@constellation/contracts";

import type {
  DesktopSnapshot,
  ProjectListProjection,
  WorkOverviewProjection,
} from "../client/workflow.js";
import type { ListNavigationItemProps } from "../hooks/useListNavigation.js";
import { countLabel, formatDate } from "../i18n.js";
import { daysUntil } from "../today-plan.js";

// The one reading of a project that every Projects layout — and the record
// screen's own header — draws from. Two surfaces deriving health independently
// is the `restated-shape-drift` defect class with a new name on it: the list
// saying "At risk" while the record it opens says "On track" is not a
// rendering difference, it is two answers to one question.
//
// It reads TWO slices, and the join is the point:
//
//   `snapshot.projects`  (`project.list`)  — the Projects themselves, and the
//       only place `updatedAt` is projected for them.
//   `snapshot.work`      (`work.overview`) — their tasks, whole-Space and
//       uncapped, carrying `operationalState`, `waitingOn`, `dueAt`,
//       `completionState`, `projectIds` and `updatedAt`.
//
// `work.overview` projects its own `projects` list, but without `updatedAt`,
// and health cannot be read without it. Both queries are parameterised with the
// same Space (`client/workflow.ts`), so the join is total: a project whose
// tasks came from a different Space would read as having none, and would say
// "No signal" while carrying work.

export type ProjectRecord = ProjectListProjection["items"][number];
export type WorkTask = WorkOverviewProjection["tasks"][number];

/** Every layout the switcher offers, in the order it offers them. */
export const PROJECT_LAYOUTS = ["list", "client", "timeline"] as const;
export type ProjectLayout = (typeof PROJECT_LAYOUTS)[number];

export const PROJECT_LAYOUT_LABELS: Record<ProjectLayout, string> = {
  list: "List",
  client: "By client",
  timeline: "Timeline",
};

/**
 * Health is DERIVED, never stored. Health set by hand lies within a fortnight,
 * because nobody comes back to reset it — so there is no field to read, and the
 * prototype went as far as deleting one from its own fixtures to prove nothing
 * could accidentally read it.
 *
 * Five states. `none` covers the two different silences — a closed project and
 * a project with no work recorded — because neither is a health reading, and
 * dressing either up as "On track" would be an answer where there is none.
 */
export type HealthKey = "risk" | "watch" | "waiting" | "good" | "none";

export interface ProjectHealth {
  readonly key: HealthKey;
  readonly label: string;
  /** Why it says that, in the order the reasons were found. Never empty: a
   *  state without a reason is a badge, and a badge is not an explanation. */
  readonly why: readonly string[];
}

/** No movement for this long stops being quiet and starts being a signal. */
export const STALE_DAYS = 14;

/**
 * A deadline this close is worth colouring. Fourteen days, the same NUMBER as
 * `STALE_DAYS` and an entirely unrelated QUANTITY — one measures silence behind
 * you, the other room in front. The prototype left this one unnamed inside the
 * function that used it, in a file whose own header promised two named
 * thresholds; naming it here is what stops the next reader from "unifying" two
 * fourteens that mean different things.
 */
export const DUE_SOON_DAYS = 14;

export interface ProjectReading {
  readonly project: ProjectRecord;
  readonly all: readonly WorkTask[];
  readonly open: readonly WorkTask[];
  readonly overdue: readonly WorkTask[];
  readonly blocked: readonly WorkTask[];
  /** Waits whose promised date has passed — they stopped being a plan. */
  readonly broken: readonly WorkTask[];
  /** Waits that are still a plan, and still on somebody else's side. */
  readonly waiting: readonly WorkTask[];
  readonly buckets: ProjectBuckets;
  readonly health: ProjectHealth;
  /** Days since anything here last moved. */
  readonly idleDays: number;
  readonly lastMovedAt: string;
  /** Days until the project's own deadline; `undefined` when it has none. */
  readonly daysLeft: number | undefined;
  readonly accessibleName: string;
}

/**
 * Three buckets, and the third one is where the prototype had two.
 *
 * The prototype split open work into "in flight" and "untouched" by reading
 * statuses named `doing` and `review`. This workspace has no such statuses to
 * read: task statuses are configured per workspace, and the only vocabulary the
 * app is given for them is `position` and `operationalSemantics`, neither of
 * which says "somebody has started this". Deriving it from position — "any
 * status past the first has been picked up" — would be right for
 * `Backlog → Doing → Done` and wrong for `Backlog → Todo → Doing → Done`,
 * silently, in whichever workspace happens to have the second shape.
 *
 * So the bar states what it can stand behind. Named here rather than left as an
 * absence, because a reader comparing this to the prototype will notice.
 */
export interface ProjectBuckets {
  readonly done: number;
  /** Blocked, or waiting on somebody. */
  readonly held: number;
  /** Open and not held. */
  readonly open: number;
  readonly total: number;
}

export interface ProjectProse {
  readonly timeZone: string;
  readonly todayKey: string;
}

/** A wait pointed outward. `we_owe` is a wait at OUR side — somebody is waiting
 *  on us — and decision #23 defines Waiting as the state where the work is not
 *  with you, so it does not qualify. A wait with no stated direction counts:
 *  the field is optional and its absence is silence, not a denial. */
const pointsOutward = (task: WorkTask): boolean =>
  task.waitingOn?.direction !== "we_owe";

/**
 * A wait that has stopped being a plan.
 *
 * The prototype approximated this as "waiting for longer than seven days",
 * saying so in its own comment, because its fixtures carried only a
 * `waitingSince`. The real model carries `waitingOn.expectedAt` — the date
 * somebody promised — so the reading is exact and the seven-day grace does not
 * port: a grace period thresholds a DURATION, `expectedAt` is a PROMISE, and
 * carrying the grace across would have "six days past the date they promised"
 * count as fine.
 *
 * Direction is not consulted here. A date that has passed is a broken promise
 * whichever way it points.
 */
const isBroken = (task: WorkTask, prose: ProjectProse): boolean => {
  const expected = task.waitingOn?.expectedAt;
  if (expected === undefined) return false;
  return daysUntil(expected, prose.todayKey, prose.timeZone) < 0;
};

const isOverdue = (task: WorkTask, prose: ProjectProse): boolean =>
  task.dueAt !== undefined &&
  daysUntil(task.dueAt, prose.todayKey, prose.timeZone) < 0;

/** Who the waiting is on, named from the model rather than guessed. A state
 *  that says "waiting" without saying on whom is a badge without a reason. */
const waitedOn = (tasks: readonly WorkTask[]): readonly string[] => [
  ...new Set(
    tasks
      .map((task) => task.waitingOn?.label)
      .filter((label): label is string => Boolean(label)),
  ),
];

const andMore = (names: readonly string[]): string => {
  if (names.length === 0) return "someone else";
  if (names.length === 1) return names[0] as string;
  return `${names[0] as string} +${names.length - 1} more`;
};

/**
 * One reading of one project. Every layout and the record header call this;
 * nothing recomputes any part of it.
 *
 * THE ORDER OF THE CHECKS IS THE DECISION. Read before rearranging:
 *
 *  1. A closed project is not "at risk". Its unfinished tasks are the trace of
 *     the decision to close it, not a delivery risk — and a row saying both
 *     "Closed" and "At risk" says two contradictory things.
 *  2. No tasks at all is "No signal", not "On track". The walkthrough left this
 *     open and the prototype settled it correctly: silence is not health.
 *  3. At risk, for anything past a date — its own, or one somebody promised.
 *  4. Watch, for no movement at all.
 *  5. Waiting sits AFTER Watch, and this is the position that looks arbitrary
 *     and is not. Waiting is the mild state — nothing is endangered, the work
 *     is simply not with you — and a mild state must not swallow a warning.
 *     Watch exists precisely so that silence nobody would notice on their own
 *     has something to say; a project both silent and waiting is still silent.
 *  6. On track, which by here means what it says.
 *
 * The prototype had a seventh branch — "nothing recorded as moving" — for a
 * project whose `lastMoved` was absent. It does not port: every record in this
 * model carries `updatedAt`, so movement is always known, and a branch that
 * cannot fire is worse than no branch.
 */
export const readProject = (
  project: ProjectRecord,
  tasks: readonly WorkTask[],
  prose: ProjectProse,
): ProjectReading => {
  const all = tasks.filter((task) =>
    task.projectIds.includes(project.id as ProjectId),
  );
  const open = all.filter((task) => task.completionState === "open");
  const overdue = open.filter((task) => isOverdue(task, prose));
  const blocked = open.filter((task) => task.operationalState === "blocked");
  const broken = open.filter(
    (task) => task.operationalState === "waiting" && isBroken(task, prose),
  );
  const waiting = open.filter(
    (task) =>
      task.operationalState === "waiting" &&
      !isBroken(task, prose) &&
      pointsOutward(task),
  );

  const lastMovedAt = all.reduce(
    (latest, task) => (task.updatedAt > latest ? task.updatedAt : latest),
    project.updatedAt,
  );
  const idleDays = -daysUntil(lastMovedAt, prose.todayKey, prose.timeZone);
  const daysLeft =
    project.dueAt === undefined
      ? undefined
      : daysUntil(project.dueAt, prose.todayKey, prose.timeZone);

  const buckets: ProjectBuckets = {
    done: all.length - open.length,
    held: open.filter((task) => task.operationalState !== "actionable").length,
    open: open.filter((task) => task.operationalState === "actionable").length,
    total: all.length,
  };

  const why: string[] = [];
  if (overdue.length > 0)
    why.push(
      `${countLabel(overdue.length, "task")} past ${
        overdue.length === 1 ? "its" : "their"
      } date`,
    );
  if (blocked.length > 0)
    why.push(`${countLabel(blocked.length, "task")} blocked`);
  if (broken.length > 0)
    why.push(`${countLabel(broken.length, "wait")} past its date`);

  const health: ProjectHealth =
    project.lifecycle !== "active"
      ? {
          key: "none",
          label: "Closed",
          why: ["health is only read for live work"],
        }
      : all.length === 0
        ? {
            key: "none",
            label: "No signal",
            why: ["no tasks recorded — nothing to read"],
          }
        : why.length > 0
          ? { key: "risk", label: "At risk", why }
          : idleDays >= STALE_DAYS
            ? {
                key: "watch",
                label: "Watch",
                why: [`no movement in ${countLabel(idleDays, "day")}`],
              }
            : waiting.length > 0
              ? {
                  key: "waiting",
                  label: "Waiting",
                  why: [
                    `${countLabel(waiting.length, "task")} waiting on ${andMore(
                      waitedOn(waiting),
                    )}`,
                  ],
                }
              : {
                  key: "good",
                  label: "On track",
                  why: [
                    `nothing past its date · last moved ${formatDate(
                      lastMovedAt,
                      prose.timeZone,
                    )}`,
                  ],
                };

  const reading: Omit<ProjectReading, "accessibleName"> = {
    project,
    all,
    open,
    overdue,
    blocked,
    broken,
    waiting,
    buckets,
    health,
    idleDays,
    lastMovedAt,
    daysLeft,
  };
  // Built without a client, because the reading does not know one: the link
  // lives in a different slice. A layout that HAS the client calls
  // `rowAccessibleName` again with it — this value is the floor, not the
  // ceiling.
  return { ...reading, accessibleName: rowAccessibleName(reading) };
};

/**
 * How much time is left, as a sentence rather than a date. A date says WHEN;
 * what a reader acts on is HOW LONG. Both matter, in that order.
 */
export const deadlineSentence = (
  reading: Pick<ProjectReading, "daysLeft">,
): string => {
  if (reading.daysLeft === undefined) return "no deadline";
  if (reading.daysLeft < 0)
    return `${countLabel(-reading.daysLeft, "day")} over`;
  if (reading.daysLeft === 0) return "due today";
  return `${countLabel(reading.daysLeft, "day")} left`;
};

/** How loudly to say it. Never the only carrier of the fact — the sentence
 *  beside it says the same thing in words. */
export type DeadlineTone = "unset" | "over" | "soon" | "plain";

export const deadlineTone = (
  reading: Pick<ProjectReading, "daysLeft">,
): DeadlineTone => {
  if (reading.daysLeft === undefined) return "unset";
  if (reading.daysLeft <= 0) return "over";
  if (reading.daysLeft <= DUE_SOON_DAYS) return "soon";
  return "plain";
};

/**
 * The composition bar as a sentence, for the reader who cannot see it. It
 * names all three buckets including the empty ones: "0 waiting or blocked" is
 * the answer to a question this screen exists to ask, and a segment omitted
 * from the drawing must not be omitted from the telling.
 */
/**
 * The bar in words, and the third word is NOT "open".
 *
 * Found on real records: the record header states `open.length` — every task
 * still owed, 38 of them — while this sentence stated `buckets.open`, which is
 * open MINUS the held ones, 37. Two numbers one apart, both labelled "open",
 * two lines from each other. Both were right and the screen read as broken.
 *
 * "Unblocked" is what this bucket actually is, and it pairs with the segment
 * beside it. What it deliberately is NOT is "in flight" or "moving": nothing
 * in the model says anybody has started a task — see the note on
 * `ProjectBuckets` — and a word implying that would be a claim no data backs.
 */
export const compositionSentence = (buckets: ProjectBuckets): string =>
  [
    `${buckets.done} closed`,
    `${buckets.held} waiting or blocked`,
    `${buckets.open} unblocked`,
  ].join(", ");

/** The deadline as the date it is, for the places that show both. */
export const deadlineDate = (
  reading: Pick<ProjectReading, "project">,
  prose: ProjectProse,
): string | undefined =>
  reading.project.dueAt === undefined
    ? undefined
    : formatDate(reading.project.dueAt, prose.timeZone);

/**
 * The row as a screen reader hears it. Health reaches this reader as WORDS —
 * the shape and the colour beside it are the same fact told twice for people
 * who can see it, and neither is available here.
 *
 * It carries the COMPOSITION and the CLIENT for a reason that is easy to get
 * wrong: a row is a `role="option"` with its own `aria-label`, and an option's
 * label replaces everything inside it. So the composition bar's own
 * `role="img"` and the client cell are announced to nobody. Every fact drawn on
 * the row has to be in this one string or it is sighted-only — and on the
 * "By client" lens the client cell is `visibility: hidden`, which takes it out
 * of the accessibility tree as well.
 */
export const rowAccessibleName = (
  reading: Omit<ProjectReading, "accessibleName">,
  clientName?: string | undefined,
): string =>
  [
    reading.project.title,
    reading.health.label,
    ...reading.health.why,
    `${countLabel(reading.open.length, "task")} open of ${reading.buckets.total}`,
    compositionSentence(reading.buckets),
    deadlineSentence(reading),
    clientName ?? "no client linked",
  ].join(", ");

/**
 * The severity scale, and there is exactly ONE of it. The list orders its
 * groups by this and nothing else re-states it: two orderings of the same
 * scale in one screen drift apart the first time a state is added, which is
 * precisely what a "Waiting" written into one of them and not the other did.
 *
 * `none` sits BEFORE `good`. It is not a milder verdict than "On track" — it
 * is the absence of one, and an absence read as good news is how a project
 * with no work recorded gets left alone for a month.
 */
export const HEALTH_ORDER: readonly HealthKey[] = [
  "risk",
  "watch",
  "waiting",
  "none",
  "good",
];

export const HEALTH_GROUP_LABELS: Record<HealthKey, string> = {
  risk: "At risk",
  watch: "Watch",
  waiting: "Waiting",
  good: "On track",
  none: "No signal",
};

export const readProjects = (
  snapshot: Pick<DesktopSnapshot, "projects" | "work">,
  prose: ProjectProse,
): readonly ProjectReading[] | undefined => {
  if (snapshot.projects.kind !== "ready" || snapshot.work.kind !== "ready")
    return undefined;
  const tasks = snapshot.work.data.tasks;
  return snapshot.projects.data.items
    .map((project) => readProject(project, tasks, prose))
    .sort(
      (left, right) =>
        HEALTH_ORDER.indexOf(left.health.key) -
          HEALTH_ORDER.indexOf(right.health.key) ||
        left.project.title.localeCompare(right.project.title, "pl"),
    );
};

export interface ProjectGroup {
  readonly key: string;
  readonly label: string;
  readonly readings: readonly ProjectReading[];
}

/**
 * What the surface hands EVERY layout, frozen here so three files cannot each
 * invent their own. The Tasks screen wrote its five layouts first and had to
 * reconcile their signatures afterwards; this exists so that does not happen a
 * second time.
 *
 * `itemProps` is the load-bearing one. It comes from the surface's single
 * `useListNavigation`, so the ONE roving tab stop survives a change of layout —
 * a layout that keeps its own focus index hands the reader a second tab stop
 * the moment they switch, and neither of them is the one they were on.
 *
 * `baseIndex` is how a layout that draws groups turns a position within a group
 * into the continuous row index `itemProps` is keyed by. Row indices run
 * unbroken across group boundaries; restarting them per group gives several
 * rows the same key and the roving stop lands on all of them.
 */
export interface ProjectLayoutProps {
  readonly readings: readonly ProjectReading[];
  readonly prose: ProjectProse;
  readonly itemProps: (index: number) => ListNavigationItemProps;
  readonly selectedProjectId?: ProjectId | undefined;
  readonly onSelect: (projectId: ProjectId) => void;
  readonly onOpen: (projectId: ProjectId) => void;
  /** The client a project is delivered to, by the name this reader may see.
   *  `undefined` means no client is linked — a state to be shown, not hidden. */
  readonly clientOf: (projectId: ProjectId) => string | undefined;
}

/**
 * The list groups by health and nothing else — decision #24 removed "By health"
 * as a layout precisely so it could stop being something to choose. An empty
 * group is left out: a heading over nothing is noise on a list, and unlike a
 * board there is nothing to drop into it.
 *
 * Two details that look like polish and are not:
 *
 * The heading takes its words FROM THE ROWS when the rows agree. One key,
 * `none`, carries two different labels — a closed project and a project with no
 * work recorded are both "no reading", and they are not the same thing.
 * A group holding only closed projects reads "Closed"; calling it "No signal"
 * would be a small lie told on every visit.
 *
 * Inside a group the order is by deadline, soonest first, with the undated
 * last. That is the order it gets read in on a Monday morning — and twenty
 * projects sharing an absent deadline need the second key, or they reshuffle
 * on every render.
 */
export const groupByHealth = (
  readings: readonly ProjectReading[],
): readonly ProjectGroup[] =>
  HEALTH_ORDER.map((key) => {
    const inGroup = readings.filter((reading) => reading.health.key === key);
    const labels = [...new Set(inGroup.map((reading) => reading.health.label))];
    return {
      key,
      label:
        labels.length === 1 ? (labels[0] as string) : HEALTH_GROUP_LABELS[key],
      readings: sortByDeadline(inGroup),
    };
  }).filter((group) => group.readings.length > 0);

/**
 * Soonest deadline first, undated last, ties broken by title. The second key is
 * not decoration: on real data most projects share an absent deadline, and a
 * comparator without a tiebreak reshuffles them on every render.
 *
 * Undated sorts last by comparing against a string no ISO date can reach,
 * rather than by a branch — one comparison, one order, nothing to get wrong
 * twice.
 */
export const sortByDeadline = (
  readings: readonly ProjectReading[],
): readonly ProjectReading[] =>
  [...readings].sort(
    (left, right) =>
      (left.project.dueAt ?? "9999").localeCompare(
        right.project.dueAt ?? "9999",
      ) || left.project.title.localeCompare(right.project.title, "pl"),
  );

/**
 * The other grouping axis. Client names are record CONTENT and collate as
 * Polish; the group's own fallback label is interface copy and stays English.
 *
 * Projects nobody linked to a client take the last group and are neither hidden
 * nor apologised for: on real data it is the biggest group, and a state you
 * cannot see is a state nobody ever closes.
 *
 * Inside a group the readings keep the order they arrived in — severity, then
 * title. Re-sorting here would be a second answer to a settled question.
 */
export const NO_CLIENT_GROUP = "No client linked";

export const groupByClient = (
  readings: readonly ProjectReading[],
  clientOf: (projectId: ProjectId) => string | undefined,
): readonly ProjectGroup[] => {
  const named = new Map<string, ProjectReading[]>();
  const unlinked: ProjectReading[] = [];
  for (const reading of readings) {
    const client = clientOf(reading.project.id);
    if (client === undefined) {
      unlinked.push(reading);
      continue;
    }
    const held = named.get(client);
    if (held === undefined) named.set(client, [reading]);
    else held.push(reading);
  }
  const linked = [...named.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "pl"))
    .map(([label, inGroup]) => ({
      key: `client:${label}`,
      label,
      readings: inGroup as readonly ProjectReading[],
    }));
  return unlinked.length === 0
    ? linked
    : [
        ...linked,
        { key: "unlinked", label: NO_CLIENT_GROUP, readings: unlinked },
      ];
};

/**
 * The order a given lens actually DRAWS its rows in — and the reason this is
 * here rather than inside each layout.
 *
 * The surface keys its one roving tab stop by a flat index. Each lens groups
 * and sorts differently, so if the surface numbered rows in any order but the
 * drawn one, pressing Enter on a focused row would open a DIFFERENT project
 * than the one under the cursor, silently, and only for the keyboard — the
 * mouse passes an id and would look perfectly correct next to it.
 *
 * So there is exactly one definition of each order, and both the surface and
 * the layout that draws it read from here.
 */
export const orderForLayout = (
  layout: ProjectLayout,
  readings: readonly ProjectReading[],
  clientOf: (projectId: ProjectId) => string | undefined,
): readonly ProjectReading[] => {
  if (layout === "list")
    return groupByHealth(readings).flatMap((group) => group.readings);
  if (layout === "client")
    return groupByClient(readings, clientOf).flatMap((group) => group.readings);
  return sortByDeadline(readings);
};

/**
 * The five health marks, defined once. Shape carries the meaning, colour only
 * reinforces it, and the label stands beside it in words — so a reader who
 * cannot tell the colours apart still reads five different states.
 *
 * `waiting` is a pause sign and deliberately NOT a half shape: a half shape is
 * what `watch` uses, and the two states must not be confusable.
 *
 * This lives in the contract because two layouts each inventing a mark for "At
 * risk" is user-visible drift of exactly the kind this file exists to prevent.
 */
export const HEALTH_MARKS: Record<HealthKey, string> = {
  risk: "▣",
  watch: "◪",
  waiting: "‖",
  good: "■",
  none: "▢",
};
