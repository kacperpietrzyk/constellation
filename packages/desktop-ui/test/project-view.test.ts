/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  ProjectIdSchema,
  QueryProjectionSchema,
  SpaceIdSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
} from "@constellation/contracts";

import type {
  DataSlice,
  DesktopSnapshot,
  ProjectListProjection,
  WorkOverviewProjection,
} from "../src/client/workflow.js";
import { formatDate } from "../src/i18n.js";
import {
  DUE_SOON_DAYS,
  HEALTH_ORDER,
  STALE_DAYS,
  compositionSentence,
  deadlineSentence,
  deadlineTone,
  groupByHealth,
  readProject,
  readProjects,
  type ProjectProse,
  type ProjectRecord,
  type WorkTask,
} from "../src/projects/project-view.js";

// The Projects screen states a health for every project and stores none, and
// the ORDER of the checks that derive it is the decision, not an
// implementation detail. These assertions are the durable carrier of that
// order: the design documents live on one disk, this file rides in the repo,
// and no test that merely looks for a health word on the screen can catch a
// branch swapped with the one below it.

const ZONE = "Europe/Warsaw";
const TODAY = "2026-07-30";
const PROSE: ProjectProse = { timeZone: ZONE, todayKey: TODAY };

// Every stamp is 10:00Z on purpose. Midnight-Z falls on the previous day in
// Warsaw, so a fixture written as "2026-07-16T00:00:00Z" would count as
// fifteen days of silence while reading as fourteen.
const YESTERDAY = "2026-07-29T10:00:00.000Z";
const IDLE_13 = "2026-07-17T10:00:00.000Z";
const IDLE_14 = "2026-07-16T10:00:00.000Z";
const IDLE_30 = "2026-06-30T10:00:00.000Z";
const PAST = "2026-07-20T10:00:00.000Z";
const AHEAD = "2026-08-20T10:00:00.000Z";
const IN_3_DAYS = "2026-08-02T10:00:00.000Z";
const IN_15_DAYS = "2026-08-14T10:00:00.000Z";

const uuid = (prefix: string, index: number): string =>
  `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

// Parsed rather than cast: a malformed identifier fails here instead of
// travelling through the reading as a string that joins to nothing.
const SPACE = SpaceIdSchema.parse(uuid("2", 1));
const STATUS = TaskStatusIdSchema.parse(uuid("4", 1));
const TASK = TaskIdSchema.parse(uuid("3", 1));
const ALPHA = ProjectIdSchema.parse(uuid("1", 1));
const BETA = ProjectIdSchema.parse(uuid("1", 2));
const GAMMA = ProjectIdSchema.parse(uuid("1", 3));

// The fixtures are typed as the projection's own row types, so a contract
// change breaks them at the compiler instead of letting them describe a world
// that no longer exists.
const project = (
  over: Partial<ProjectRecord> & { readonly title: string },
): ProjectRecord => ({
  id: ALPHA,
  spaceId: SPACE,
  intendedOutcome: "",
  needsReview: false,
  lifecycle: "active",
  relatedOpenTaskCount: 0,
  version: 1,
  updatedAt: YESTERDAY,
  ...over,
});

const task = (
  over: Partial<WorkTask> & { readonly title: string },
): WorkTask => ({
  id: TASK,
  statusId: STATUS,
  operationalState: "actionable",
  completionState: "open",
  projectIds: [ALPHA],
  version: 1,
  updatedAt: YESTERDAY,
  ...over,
});

const overview = (tasks: readonly WorkTask[]): WorkOverviewProjection => ({
  kind: "work.overview",
  tasks: [...tasks],
  projects: [],
  areas: [],
  initiatives: [],
  links: [],
  savedViews: [],
  freshness: {
    mode: "local_authoritative",
    checkpoint: null,
    missingCapabilities: [],
  },
});

const ready = <T>(data: T): DataSlice<T> => ({ kind: "ready", data });

const snapshot = (
  projects: DataSlice<ProjectListProjection>,
  work: DataSlice<WorkOverviewProjection>,
): Pick<DesktopSnapshot, "projects" | "work"> => ({ projects, work });

const listed = (items: readonly ProjectRecord[]): ProjectListProjection => ({
  kind: "project.list",
  items: [...items],
});

// Walking the contract schema the way packages/contracts/test walks it: the
// question is what the CONTRACT can carry, and a fixture that happens to omit
// a field answers nothing.
interface ObjectSchema {
  readonly shape: Readonly<Record<string, unknown>>;
}

const projectionShape = (kind: string): Readonly<Record<string, unknown>> => {
  const options =
    QueryProjectionSchema.options as unknown as readonly ObjectSchema[];
  const option = options.find(
    (candidate) =>
      (candidate.shape["kind"] as { readonly value: unknown } | undefined)
        ?.value === kind,
  );
  if (option === undefined) {
    throw new Error(`the contract carries no ${kind} projection`);
  }
  return option.shape;
};

const listedKeys = (
  shape: Readonly<Record<string, unknown>>,
  key: string,
): readonly string[] => {
  const list = shape[key] as { readonly element: unknown } | undefined;
  if (list === undefined) throw new Error(`no ${key} on this projection`);
  return Object.keys((list.element as ObjectSchema).shape);
};

test("no project the contract projects carries a health field to read", () => {
  const items = listedKeys(projectionShape("project.list"), "items");
  const under = listedKeys(projectionShape("work.overview"), "projects");

  // An empty read of the schema is a broken measurement, not a clean result:
  // without these two lines a walker that found nothing would pass.
  assert.ok(
    items.includes("lifecycle") && items.includes("relatedOpenTaskCount"),
    `project.list items: ${items.join(", ")}`,
  );
  assert.ok(
    under.includes("lifecycle") && under.includes("intendedOutcome"),
    `work.overview projects: ${under.join(", ")}`,
  );

  const healthLike = [...items, ...under].filter((key) =>
    /health|risk/i.test(key),
  );
  assert.deepEqual(healthLike, [], `stored health: ${healthLike.join(", ")}`);
});

test("a health typed onto a project is refused, not quietly carried", () => {
  const item = project({ title: "Migracja Northstar" });
  const clean = QueryProjectionSchema.safeParse(listed([item]));
  assert.equal(clean.success, true);

  const dressed = QueryProjectionSchema.safeParse({
    kind: "project.list",
    items: [{ ...item, health: "good" }],
  });
  assert.equal(dressed.success, false);
});

test("the fixtures here are a projection the contract really accepts", () => {
  // A previous session shipped an untyped fixture missing a field the
  // projection never omits, and it crashed the shell instead of the test.
  const projects = QueryProjectionSchema.safeParse(
    listed([project({ title: "Alpha" })]),
  );
  assert.equal(projects.success, true);

  const work = QueryProjectionSchema.safeParse(
    overview([task({ title: "One" })]),
  );
  assert.equal(work.success, true);
});

test("a project that carries no health is still given one, so it is derived", () => {
  const record = project({ title: "Migracja Northstar" });
  assert.equal("health" in record, false);

  const late = [task({ title: "Late", dueAt: PAST })];
  const reading = readProject(record, late, PROSE);
  assert.equal(reading.health.key, "risk");
  assert.equal(reading.health.label, "At risk");
  assert.deepEqual(reading.health.why, ["1 task past its date"]);
});

test("a closed project never reads At risk, whatever its tasks are doing", () => {
  const tasks = [
    task({ title: "Late", dueAt: PAST }),
    task({ title: "Stuck", operationalState: "blocked" }),
  ];

  const shut = project({ title: "Wygaszony", lifecycle: "closed" });
  const closed = readProject(shut, tasks, PROSE);
  assert.equal(closed.health.key, "none");
  assert.equal(closed.health.label, "Closed");
  assert.deepEqual(closed.health.why, ["health is only read for live work"]);
  assert.notEqual(closed.health.label, "At risk");

  // The same tasks under a live project DO read At risk — so the branch above
  // suppressed a verdict that was there, rather than reporting an empty one.
  const live = readProject(project({ title: "Żywy" }), tasks, PROSE);
  assert.equal(live.health.label, "At risk");
});

test("a project with no tasks reads No signal, because silence is not health", () => {
  const bare = readProject(project({ title: "Świeży" }), [], PROSE);
  assert.equal(bare.health.key, "none");
  assert.equal(bare.health.label, "No signal");
  assert.deepEqual(bare.health.why, ["no tasks recorded — nothing to read"]);
  assert.equal(bare.buckets.total, 0);

  // Somebody else's work is not this project's signal. The join is by
  // projectIds, and a reading that took every task would state a health whose
  // evidence sits under another project.
  const theirs = [task({ title: "Not ours", projectIds: [BETA] })];
  const elsewhere = readProject(project({ title: "Świeży" }), theirs, PROSE);
  assert.equal(elsewhere.health.label, "No signal");
});

test("overdue, blocked and broken promises pile into one At risk, in that order", () => {
  const reading = readProject(
    project({ title: "Wdrożenie" }),
    [
      task({ title: "Late one", dueAt: PAST }),
      task({ title: "Late two", dueAt: PAST }),
      task({ title: "Stuck", operationalState: "blocked" }),
      task({
        title: "Promised",
        operationalState: "waiting",
        waitingOn: { kind: "person", label: "Anna Kowalska", expectedAt: PAST },
      }),
    ],
    PROSE,
  );

  assert.equal(reading.health.key, "risk");
  assert.equal(reading.health.label, "At risk");
  // The array IS the order requirement, so it is compared whole.
  assert.deepEqual(reading.health.why, [
    "2 tasks past their date",
    "1 task blocked",
    "1 wait past its date",
  ]);
});

test("silence outranks waiting: a project both quiet and waiting reads Watch", () => {
  const waiting = task({
    title: "Czekamy na materiały",
    operationalState: "waiting",
    updatedAt: IDLE_14,
    waitingOn: {
      kind: "person",
      label: "Piotr Zieliński",
      expectedAt: AHEAD,
    },
  });

  const quiet = readProject(
    project({ title: "Cisza", updatedAt: IDLE_14 }),
    [waiting],
    PROSE,
  );
  assert.equal(quiet.idleDays, STALE_DAYS);
  assert.equal(quiet.health.key, "watch");
  assert.equal(quiet.health.label, "Watch");
  assert.deepEqual(quiet.health.why, ["no movement in 14 days"]);
  // The wait is present and was NOT swallowed, which is the whole assertion:
  // a mild state placed above a warning would report it and lose the silence.
  assert.equal(quiet.waiting.length, 1);

  // Both stamps move, because the last movement is the max of the two:
  // refreshing only the project leaves the task's old stamp deciding.
  const moving = readProject(
    project({ title: "Cisza", updatedAt: YESTERDAY }),
    [{ ...waiting, updatedAt: YESTERDAY }],
    PROSE,
  );
  assert.equal(moving.health.key, "waiting");
  assert.deepEqual(moving.health.why, ["1 task waiting on Piotr Zieliński"]);
});

test("a wait past the date somebody promised is At risk, never Waiting", () => {
  // One day late, not seven. The prototype's grace thresholded a DURATION;
  // expectedAt is a PROMISE, and a promise is broken the day after it.
  const reading = readProject(
    project({ title: "Dostawa" }),
    [
      task({
        title: "Materiały",
        operationalState: "waiting",
        waitingOn: {
          kind: "external",
          label: "Dostawca",
          expectedAt: YESTERDAY,
        },
      }),
    ],
    PROSE,
  );

  assert.equal(reading.health.key, "risk");
  assert.deepEqual(reading.health.why, ["1 wait past its date"]);
  assert.equal(reading.broken.length, 1);
  assert.equal(reading.waiting.length, 0);
});

test("a wait with no date, or a date still ahead, is a plan and reads Waiting", () => {
  const undated = readProject(
    project({ title: "Bez daty" }),
    [
      task({
        title: "Materiały",
        operationalState: "waiting",
        waitingOn: { kind: "person", label: "Anna Kowalska" },
      }),
    ],
    PROSE,
  );
  assert.equal(undated.health.key, "waiting");
  assert.deepEqual(undated.health.why, ["1 task waiting on Anna Kowalska"]);

  const ahead = readProject(
    project({ title: "Data przed nami" }),
    [
      task({
        title: "Materiały",
        operationalState: "waiting",
        waitingOn: {
          kind: "person",
          label: "Anna Kowalska",
          expectedAt: AHEAD,
        },
      }),
    ],
    PROSE,
  );
  assert.equal(ahead.health.key, "waiting");

  // Names are deduplicated, so three tasks on two people read "+1 more".
  const several = readProject(
    project({ title: "Kilku ludzi" }),
    [
      task({
        title: "One",
        operationalState: "waiting",
        waitingOn: { kind: "person", label: "Anna Kowalska" },
      }),
      task({
        title: "Two",
        operationalState: "waiting",
        waitingOn: { kind: "person", label: "Piotr Zieliński" },
      }),
      task({
        title: "Three",
        operationalState: "waiting",
        waitingOn: { kind: "person", label: "Anna Kowalska" },
      }),
    ],
    PROSE,
  );
  assert.deepEqual(several.health.why, [
    "3 tasks waiting on Anna Kowalska +1 more",
  ]);

  // A wait with nobody named still says something: a state without a reason
  // is a badge, and a badge is not an explanation.
  const nameless = readProject(
    project({ title: "Bez nazwiska" }),
    [
      task({
        title: "Materiały",
        operationalState: "waiting",
        waitingOn: { kind: "external", label: "" },
      }),
    ],
    PROSE,
  );
  assert.deepEqual(nameless.health.why, ["1 task waiting on someone else"]);
});

test("a wait we owe is not the project waiting — that work is at our side", () => {
  const owed = readProject(
    project({ title: "U nas" }),
    [
      task({
        title: "Odpowiedź",
        operationalState: "waiting",
        waitingOn: { kind: "person", label: "Klient", direction: "we_owe" },
      }),
    ],
    PROSE,
  );
  assert.equal(owed.waiting.length, 0);
  assert.equal(owed.health.key, "good");
  assert.equal(owed.health.label, "On track");
  // Built with the formatter the reading itself uses: a pinned "Jul 29, 2026"
  // is green here and red on a machine with another ICU build.
  assert.deepEqual(owed.health.why, [
    `nothing past its date · last moved ${formatDate(owed.lastMovedAt, ZONE)}`,
  ]);

  // The same wait pointed the other way IS the project waiting. Without this
  // pair the assertion above also passes on a reading that counts no wait at
  // all, which is a different defect wearing the same green.
  const theirs = readProject(
    project({ title: "U nich" }),
    [
      task({
        title: "Odpowiedź",
        operationalState: "waiting",
        waitingOn: {
          kind: "person",
          label: "Klient",
          direction: "waiting_on_them",
        },
      }),
    ],
    PROSE,
  );
  assert.equal(theirs.waiting.length, 1);
  assert.equal(theirs.health.key, "waiting");

  // Direction is not consulted for a broken promise: a date that has passed
  // is past whichever way the wait points.
  const late = readProject(
    project({ title: "U nas, po terminie" }),
    [
      task({
        title: "Odpowiedź",
        operationalState: "waiting",
        waitingOn: {
          kind: "person",
          label: "Klient",
          direction: "we_owe",
          expectedAt: YESTERDAY,
        },
      }),
    ],
    PROSE,
  );
  assert.equal(late.health.key, "risk");
  assert.deepEqual(late.health.why, ["1 wait past its date"]);
});

test("the two fourteens stay two quantities: silence behind, room ahead", () => {
  assert.equal(STALE_DAYS, 14);
  assert.equal(DUE_SOON_DAYS, 14);

  // The dates are written out rather than derived from the constants: a
  // fixture computed from the threshold moves with it and stops measuring it.
  const quiet = task({ title: "Stara", updatedAt: IDLE_14 });
  const stale = readProject(
    project({ title: "Cicha", updatedAt: IDLE_14 }),
    [quiet],
    PROSE,
  );
  assert.equal(stale.idleDays, 14);
  assert.equal(stale.health.key, "watch");

  const nearly = readProject(
    project({ title: "Prawie cicha", updatedAt: IDLE_13 }),
    [{ ...quiet, updatedAt: IDLE_13 }],
    PROSE,
  );
  assert.equal(nearly.idleDays, 13);
  assert.equal(nearly.health.key, "good");

  // DUE_SOON_DAYS is reachable only through the deadline's tone, and its own
  // boundary sits there.
  assert.equal(deadlineTone({ daysLeft: undefined }), "unset");
  assert.equal(deadlineTone({ daysLeft: -1 }), "over");
  assert.equal(deadlineTone({ daysLeft: 0 }), "over");
  assert.equal(deadlineTone({ daysLeft: 14 }), "soon");
  assert.equal(deadlineTone({ daysLeft: 15 }), "plain");

  assert.equal(deadlineSentence({ daysLeft: undefined }), "no deadline");
  assert.equal(deadlineSentence({ daysLeft: -2 }), "2 days over");
  assert.equal(deadlineSentence({ daysLeft: 0 }), "due today");
  assert.equal(deadlineSentence({ daysLeft: 1 }), "1 day left");

  // Neither quantity leaks into the other's function. A deadline inside the
  // due-soon window does not make a moving project Watch…
  const soon = readProject(
    project({ title: "Blisko terminu", dueAt: IN_3_DAYS }),
    [task({ title: "Świeża" })],
    PROSE,
  );
  assert.equal(soon.daysLeft, 3);
  assert.equal(deadlineTone(soon), "soon");
  assert.equal(soon.health.key, "good");

  // …and a month of silence does not colour a deadline nobody set.
  const silent = readProject(
    project({ title: "Bez terminu", updatedAt: IDLE_30 }),
    [task({ title: "Stara", updatedAt: IDLE_30 })],
    PROSE,
  );
  assert.equal(silent.health.key, "watch");
  assert.equal(silent.daysLeft, undefined);
  assert.equal(deadlineTone(silent), "unset");
  assert.equal(deadlineSentence(silent), "no deadline");
});

test("the composition bar sums to the total and counts no task twice", () => {
  const tasks = [
    task({ title: "Zamknięta", completionState: "completed" }),
    // Load-bearing fixture: closed AND blocked. A `held` counted over ALL
    // tasks rather than the OPEN ones puts this row in two buckets, and the
    // bar then states more work than the project holds.
    task({
      title: "Zamknięta, była zablokowana",
      completionState: "completed",
      operationalState: "blocked",
    }),
    task({ title: "Zablokowana", operationalState: "blocked" }),
    task({
      title: "Czeka na Annę",
      operationalState: "waiting",
      waitingOn: { kind: "person", label: "Anna Kowalska" },
    }),
    task({
      title: "Czeka na dostawcę",
      operationalState: "waiting",
      waitingOn: { kind: "external", label: "Dostawca", expectedAt: AHEAD },
    }),
    task({ title: "Do zrobienia", dueAt: PAST }),
  ];

  const reading = readProject(project({ title: "Skład" }), tasks, PROSE);

  // THIS line is the one doing the work, and the three counts are deliberately
  // all different so that two buckets swapped for each other still reddens it.
  // `held` counted over `all` reads 4 here, not 3.
  assert.deepEqual(reading.buckets, { done: 2, held: 3, open: 1, total: 6 });
  // The sum is stated because it is the promise the bar makes, but on its own
  // it is nearly a tautology — do not keep it and drop the line above.
  assert.equal(
    reading.buckets.done + reading.buckets.held + reading.buckets.open,
    reading.buckets.total,
  );
  assert.equal(reading.buckets.total, reading.all.length);
  assert.equal(
    compositionSentence(reading.buckets),
    "2 closed, 3 waiting or blocked, 1 open",
  );
});

test("health groups run in severity order, with No signal ahead of On track", () => {
  const healthy = project({ id: ALPHA, title: "Zdrowy" });
  const shut = project({ id: BETA, title: "Zamknięty", lifecycle: "closed" });
  const risky = project({ id: GAMMA, title: "Zagrożony" });
  const late = task({ title: "C", projectIds: [GAMMA], dueAt: PAST });
  const readings = [
    readProject(healthy, [task({ title: "A" })], PROSE),
    readProject(shut, [], PROSE),
    readProject(risky, [late], PROSE),
  ];

  const groups = groupByHealth(readings);
  const keys = groups.map((group) => group.key);
  assert.deepEqual(keys, ["risk", "none", "good"]);
  // The scale itself, stated once: `none` is the absence of a verdict, not a
  // milder one, so it must not sit below "On track" where it reads as good.
  assert.ok(HEALTH_ORDER.indexOf("none") < HEALTH_ORDER.indexOf("good"));
  // Empty groups are left out — three headings, not five.
  assert.equal(groups.length, 3);
  assert.ok(groups.every((group) => group.readings.length > 0));
});

test("a group of only closed projects is called Closed, not No signal", () => {
  const shutA = project({ id: ALPHA, title: "A", lifecycle: "closed" });
  const shutB = project({ id: BETA, title: "B", lifecycle: "closed" });
  const bare = project({ id: GAMMA, title: "C" });

  const closed = groupByHealth([
    readProject(shutA, [], PROSE),
    readProject(shutB, [], PROSE),
  ]);
  const closedLabels = closed.map((group) => [group.key, group.label]);
  assert.deepEqual(closedLabels, [["none", "Closed"]]);

  const silent = groupByHealth([readProject(bare, [], PROSE)]);
  const silentLabels = silent.map((group) => [group.key, group.label]);
  assert.deepEqual(silentLabels, [["none", "No signal"]]);

  // One key, two labels: with both kinds in the group the heading cannot take
  // its words from the rows, and falls back to the scale's own name.
  const mixed = groupByHealth([
    readProject(shutA, [], PROSE),
    readProject(bare, [], PROSE),
  ]);
  const mixedLabels = mixed.map((group) => [group.key, group.label]);
  assert.deepEqual(mixedLabels, [["none", "No signal"]]);
});

test("inside a group the soonest deadline comes first and the undated last", () => {
  const undated = project({ id: ALPHA, title: "Bez terminu" });
  const later = project({ id: BETA, title: "Później", dueAt: IN_15_DAYS });
  const sooner = project({ id: GAMMA, title: "Wcześniej", dueAt: IN_3_DAYS });
  const readings = [
    readProject(undated, [task({ title: "A" })], PROSE),
    readProject(later, [task({ title: "B", projectIds: [BETA] })], PROSE),
    readProject(sooner, [task({ title: "C", projectIds: [GAMMA] })], PROSE),
  ];

  const groups = groupByHealth(readings);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.key, "good");
  const titles = groups[0]?.readings.map((reading) => reading.project.title);
  assert.deepEqual(titles, ["Wcześniej", "Później", "Bez terminu"]);
});

test("an unavailable slice reads as unknown, not as a workspace with none", () => {
  const projects = ready(listed([project({ title: "Alpha" })]));
  const work = ready(overview([task({ title: "One" })]));
  const gone: DataSlice<never> = { kind: "unavailable", message: "no reply" };

  assert.equal(readProjects(snapshot(gone, work), PROSE), undefined);
  assert.equal(readProjects(snapshot(projects, gone), PROSE), undefined);
  assert.equal(readProjects(snapshot(gone, gone), PROSE), undefined);

  // Without this the test also passes on a reading that always says "unknown".
  assert.equal(readProjects(snapshot(projects, work), PROSE)?.length, 1);

  // An empty workspace is a different answer: a list of none, not a silence.
  const empty = ready(listed([]));
  assert.deepEqual(readProjects(snapshot(empty, work), PROSE), []);
});

test("the list opens on what needs a person today, by the one severity scale", () => {
  const projects = ready(
    listed([
      project({ id: ALPHA, title: "Zdrowy" }),
      project({ id: BETA, title: "Zagrożony" }),
    ]),
  );
  const work = ready(
    overview([
      task({ title: "A", projectIds: [ALPHA] }),
      task({ title: "B", projectIds: [BETA], dueAt: PAST }),
    ]),
  );

  const readings = readProjects(snapshot(projects, work), PROSE);
  const keys = readings?.map((reading) => reading.health.key);
  assert.deepEqual(keys, ["risk", "good"]);
});
