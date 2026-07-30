/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  FieldDefinitionIdSchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  StrategicRecordIdSchema,
  TaskAssignmentIdSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
} from "@constellation/contracts";

import type {
  DesktopSnapshot,
  WorkOverviewProjection,
} from "../src/client/workflow.js";
import {
  matchesSavedView,
  matchesSearch,
  type SavedViewContext,
} from "../src/tasks/task-filters.js";
import {
  buildRows,
  dueSentence,
  groupTasks,
  planSentence,
  planStateOf,
  plannerName,
  sitsOnADate,
  sortRows,
  type TaskProse,
  type TaskRow,
} from "../src/tasks/task-view.js";

// The Tasks screen ships five layouts over ONE reading of the work, and until
// this file nothing asserted that reading: the screen was covered only by
// guards checking that every destination renders something. A screen that
// renders is not a screen that is right — the board saying "Northstar" while
// the table says "no project" renders beautifully and is two answers.
//
// Every test below is a claim the screen makes out loud, named so that a
// failure says which claim broke rather than which line moved.

// Fixtures are typed against the PROJECTION rather than against the aliases
// `task-view.ts` gives it. Typing them against the screen's own names would
// let the screen and the contract drift together, with this file following
// quietly behind — the failure mode these tests exist to catch.
type WorkTask = WorkOverviewProjection["tasks"][number];
type WorkProject = WorkOverviewProjection["projects"][number];
type WorkSavedView = WorkOverviewProjection["savedViews"][number];
type SavedViewFilters = WorkSavedView["filters"];
type TaskStatus = DesktopSnapshot["bootstrap"]["taskStatuses"][number];
type Assignment = NonNullable<WorkTask["assignment"]>;
type CalendarBlock = NonNullable<WorkTask["calendarBlock"]>;
type PlanAuthorship = NonNullable<WorkTask["plannedBy"]>;

const WARSAW = "Europe/Warsaw";
const TODAY = "2026-07-27"; // Monday
const NOW = new Date("2026-07-27T07:00:00.000Z"); // 09:00 in Warsaw

const uuid = (seed: number): string =>
  `20000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;

const me = PrincipalIdSchema.parse(uuid(901));
const teammate = PrincipalIdSchema.parse(uuid(902));
const assistant = PrincipalIdSchema.parse(uuid(903));
const departed = PrincipalIdSchema.parse(uuid(904));
const otherJan = PrincipalIdSchema.parse(uuid(905));
const choiceField = FieldDefinitionIdSchema.parse(uuid(910));

// `plannerName` reads exactly two slices of the snapshot — `access` and
// `agentAccess` — so the fixture carries those two and nothing else. A whole
// DesktopSnapshot here would say the reading depends on the rest of it.
const snapshot = {
  access: {
    kind: "ready",
    data: {
      currentPrincipalId: me,
      members: [{ principalId: teammate, displayName: "Anna Nowak" }],
    },
  },
  agentAccess: {
    kind: "ready",
    data: {
      grants: [{ agentPrincipalId: assistant, displayName: "Asystent" }],
    },
  },
} as unknown as DesktopSnapshot;

const prose: TaskProse = { timeZone: WARSAW, todayKey: TODAY, snapshot };

// Position, insertion order and the alphabet are three different sequences
// here, so an assertion that passes under the wrong one is not possible.
const triage: TaskStatus = {
  id: TaskStatusIdSchema.parse(uuid(101)),
  label: "Triage",
  operationalSemantics: "actionable",
  position: 0,
  version: 1,
};
const doing: TaskStatus = {
  id: TaskStatusIdSchema.parse(uuid(102)),
  label: "Doing",
  operationalSemantics: "actionable",
  position: 1,
  version: 1,
};
const blocked: TaskStatus = {
  id: TaskStatusIdSchema.parse(uuid(103)),
  label: "Blocked",
  operationalSemantics: "blocked",
  position: 2,
  version: 1,
};
const STATUSES: readonly TaskStatus[] = [blocked, triage, doing];

const project = (seed: number, title: string): WorkProject => ({
  id: ProjectIdSchema.parse(uuid(seed)),
  title,
  intendedOutcome: "Jeden uzgodniony obraz tego, co się dzieje.",
  needsReview: false,
  lifecycle: "active",
  version: 1,
});

const northstar = project(201, "Northstar");
const fundament = project(202, "Fundament");
const odnowa = project(203, "Odnowa");
const PROJECTS: readonly WorkProject[] = [northstar, fundament, odnowa];

let minted = 0;
const nextTaskId = (): WorkTask["id"] =>
  TaskIdSchema.parse(uuid(300 + ++minted));

type TaskOverrides = Partial<WorkTask> & { readonly title: string };

// Written field by field rather than by spreading the overrides wholesale:
// `exactOptionalPropertyTypes` is on, so "absent" and "present and undefined"
// are different shapes and the projection only ever produces the first.
const task = (over: TaskOverrides): WorkTask => ({
  id: over.id ?? nextTaskId(),
  title: over.title,
  statusId: over.statusId ?? doing.id,
  operationalState: over.operationalState ?? "actionable",
  completionState: over.completionState ?? "open",
  projectIds: over.projectIds ?? [],
  version: 1,
  updatedAt: "2026-07-20T08:00:00.000Z",
  ...(over.startAt === undefined ? {} : { startAt: over.startAt }),
  ...(over.dueAt === undefined ? {} : { dueAt: over.dueAt }),
  ...(over.priority === undefined ? {} : { priority: over.priority }),
  ...(over.parentTaskId === undefined
    ? {}
    : { parentTaskId: over.parentTaskId }),
  ...(over.calendarBlock === undefined
    ? {}
    : { calendarBlock: over.calendarBlock }),
  ...(over.assignment === undefined ? {} : { assignment: over.assignment }),
  ...(over.plannedBy === undefined ? {} : { plannedBy: over.plannedBy }),
  ...(over.waitingOn === undefined ? {} : { waitingOn: over.waitingOn }),
  ...(over.fields === undefined ? {} : { fields: over.fields }),
});

let assignmentSeed = 0;
const nextAssignmentId = (): Assignment["id"] =>
  TaskAssignmentIdSchema.parse(uuid(400 + ++assignmentSeed));

/** An assignee this reader MAY be told about: a name and a principal. */
const named = (
  principalId: NonNullable<Assignment["assigneePrincipalId"]>,
  displayName: string,
): Assignment => ({
  id: nextAssignmentId(),
  assigneePrincipalId: principalId,
  displayName,
  availability: "active",
  version: 1,
});

/** An assignee the projection withheld: a name, and no id to leak. */
const withheld = (displayName: string): Assignment => ({
  id: nextAssignmentId(),
  displayName,
  availability: "former_member",
  version: 1,
});

const block = (startsAt: string, endsAt: string): CalendarBlock => ({
  ownedBlockExternalId: "block",
  calendarExternalId: "calendar",
  revision: "1",
  startsAt,
  endsAt,
});

// 13:00 to 14:30 in Warsaw, and the same start held until 16:00.
const HELD = block("2026-07-27T11:00:00.000Z", "2026-07-27T12:30:00.000Z");
const LONGER = block("2026-07-27T11:00:00.000Z", "2026-07-27T14:00:00.000Z");

const plannedBy = (
  principalId: PlanAuthorship["principalId"],
): PlanAuthorship => ({
  principalId,
  principalKind: "human",
  at: "2026-07-27T07:00:00.000Z",
});

let viewSeed = 0;
const savedView = (
  filters: SavedViewFilters,
  over: { readonly relationTaskIds?: readonly WorkTask["id"][] } = {},
): WorkSavedView => ({
  id: StrategicRecordIdSchema.parse(uuid(500 + ++viewSeed)),
  name: "Widok",
  filters,
  sort: "due_asc",
  state: "active",
  version: 1,
  ...(over.relationTaskIds === undefined
    ? {}
    : { relationTaskIds: [...over.relationTaskIds] }),
});

const context = (
  over: {
    readonly timeZone?: string;
    readonly todayKey?: string;
    readonly now?: Date;
    readonly relationTaskIds?: ReadonlySet<string>;
  } = {},
): SavedViewContext => ({
  timeZone: over.timeZone ?? WARSAW,
  todayKey: over.todayKey ?? TODAY,
  now: over.now ?? NOW,
  relationTaskIds: over.relationTaskIds,
});

const rows = (tasks: readonly WorkTask[]): readonly TaskRow[] =>
  buildRows(tasks, STATUSES, PROJECTS, prose);

/** One row, found by the title it was written with, so a miss is loud. */
const rowFor = (built: readonly TaskRow[], title: string): TaskRow => {
  const found = built.find((candidate) => candidate.task.title === title);
  if (found === undefined) throw new Error(`No row titled ${title}`);
  return found;
};

/** A single row, for the claims that need one task and not a collection. */
const oneRow = (over: TaskOverrides): TaskRow => {
  const one = task(over);
  return rowFor(rows([one]), one.title);
};

const titlesOf = (
  group: { readonly rows: readonly TaskRow[] } | undefined,
): readonly string[] => (group?.rows ?? []).map((row) => row.task.title);

const labelsOf = (
  groups: readonly { readonly label: string }[],
): readonly string[] => groups.map((group) => group.label);

const groupFor = <Group extends { readonly key: string }>(
  groups: readonly Group[],
  key: string,
): Group | undefined => groups.find((group) => group.key === key);

// The surface folds the typed query with this exact call before handing it
// over, so the helper mirrors it rather than inventing a second normalisation.
const search = (row: TaskRow, query: string): boolean =>
  matchesSearch(row, query.trim().toLocaleLowerCase("pl-PL"));

test("grouping by project lists a task under every project it contributes to", () => {
  // Task→Project is many-to-many and the projection carries a LIST. Taking
  // the first entry would be a claim about the data that the data does not
  // make, and it is invisible on a fixture where every task has one project.
  const shared = task({
    title: "Przegląd architektury",
    projectIds: [northstar.id, fundament.id],
  });
  const single = task({ title: "Migracja bazy", projectIds: [fundament.id] });
  const loose = task({ title: "Notatki z warsztatu" });
  const built = rows([shared, single, loose]);
  const groups = groupTasks(built, "project", STATUSES, PROJECTS);

  assert.deepEqual(labelsOf(groups), ["Northstar", "Fundament", "No project"]);
  const underNorthstar = titlesOf(groupFor(groups, northstar.id));
  const underFundament = titlesOf(groupFor(groups, fundament.id));
  assert.deepEqual(underNorthstar, ["Przegląd architektury"]);
  assert.deepEqual(underFundament, ["Przegląd architektury", "Migracja bazy"]);
  const underNothing = titlesOf(groupFor(groups, "none"));
  assert.deepEqual(underNothing, ["Notatki z warsztatu"]);

  // The consequence the shell depends on: drawn rows outnumber tasks, and the
  // roving tab stop walks the DRAWN rows. Deduplicating this flatMap would
  // put the keyboard on a different collection than the eye.
  const drawn = groups.flatMap((group) => group.rows);
  assert.equal(drawn.length, 4);
  assert.equal(built.length, 3);

  // A project nobody is working on is not a heading on a list.
  assert.equal(groupFor(groups, odnowa.id), undefined);

  // Only the status axis may name a status: any other key here would send a
  // ProjectId into the board's drop, which writes `statusId`.
  assert.ok(groups.every((group) => group.statusId === undefined));
});

test("grouping by assignee names people the projection allows, and leaks no withheld principal", () => {
  const clientTeam = withheld("Zespół klienta");
  const legal = withheld("Dział prawny");
  const jan = named(teammate, "Jan Kowalski");
  const namesake = named(otherJan, "Jan Kowalski");

  const tasks = [
    task({ title: "Umowa ramowa", assignment: jan }),
    task({ title: "Zbiórka danych", assignment: clientTeam }),
    task({ title: "Opinia o RODO", assignment: legal }),
    task({ title: "Aneks do umowy", assignment: namesake }),
    task({ title: "Druga zbiórka", assignment: clientTeam }),
    task({ title: "Porządki" }),
  ];
  const built = rows(tasks);
  const groups = groupTasks(built, "assignee", STATUSES, PROJECTS);

  // Every group is named by the name the projection projected — never by an
  // id, and never by a placeholder standing in for one.
  const labels = labelsOf(groups);
  assert.deepEqual(labels, [
    "Jan Kowalski",
    "Zespół klienta",
    "Dział prawny",
    "Jan Kowalski",
    "Unassigned",
  ]);

  // Two people the projection withheld are two groups, because their names
  // differ. One "redacted" bucket would merge strangers into one person.
  assert.deepEqual(titlesOf(groups[1]), ["Zbiórka danych", "Druga zbiórka"]);
  assert.deepEqual(titlesOf(groups[2]), ["Opinia o RODO"]);

  // Two principals who happen to share a display name stay two people,
  // because the reader may know both ids. Keying on the name would merge them.
  assert.deepEqual(titlesOf(groupFor(groups, teammate)), ["Umowa ramowa"]);
  assert.deepEqual(titlesOf(groupFor(groups, otherJan)), ["Aneks do umowy"]);

  // Nobody's work is its own group and joins no one else's.
  assert.deepEqual(titlesOf(groupFor(groups, "none")), ["Porządki"]);

  // The load-bearing one. A group key may be the unassigned bucket, a
  // principal the projection named, or a key derived from the projected NAME.
  // Nothing else is available to it, so nothing else may appear.
  const projected = new Set<string>();
  for (const candidate of tasks) {
    const principal = candidate.assignment?.assigneePrincipalId;
    if (principal !== undefined) projected.add(principal);
  }
  assert.equal(projected.size, 2);
  const namesOnly = (key: string, label: string): boolean =>
    key === "none" || projected.has(key) || key.includes(label);
  assert.ok(groups.every((group) => namesOnly(group.key, group.label)));
});

test("the plan and the deadline are two different facts, read from different fields", () => {
  // A plan is your decision; a deadline is somebody else's promise. A screen
  // that answers one from the other's field is a screen of promises.
  const both = task({
    title: "Przegląd architektury",
    startAt: "2026-07-27T06:00:00.000Z",
    calendarBlock: HELD,
    plannedBy: plannedBy(me),
    dueAt: "2026-07-31T21:59:59.999Z",
  });
  const planOnly = task({
    title: "Przegląd architektury",
    startAt: "2026-07-27T06:00:00.000Z",
    calendarBlock: HELD,
    plannedBy: plannedBy(me),
  });
  const dueOnly = task({
    title: "Przegląd architektury",
    dueAt: "2026-07-31T21:59:59.999Z",
  });

  const spoken = "planned for Jul 27, 2026, 13:00 to 14:30 reserved, by you";
  assert.equal(planSentence(both, prose), spoken);
  assert.equal(planSentence(both, prose), planSentence(planOnly, prose));
  assert.equal(dueSentence(both, prose), "due Jul 31, 2026");
  assert.equal(dueSentence(both, prose), dueSentence(dueOnly, prose));

  // Each sentence is silent where its OWN field is silent, and neither
  // borrows the other's to fill the gap.
  assert.equal(planSentence(dueOnly, prose), "not planned");
  assert.equal(dueSentence(planOnly, prose), "no deadline");

  // The deadline is counted from today, because "overdue by 6 days" is what a
  // reader acts on and "Jul 21" is what they then have to work out.
  const late = task({ title: "Zaległe", dueAt: "2026-07-21T21:59:59.999Z" });
  const soon = task({ title: "Na dziś", dueAt: "2026-07-27T21:59:59.999Z" });
  assert.equal(dueSentence(late, prose), "overdue by 6 days");
  assert.equal(dueSentence(soon, prose), "due today");

  // Finished work is never late: the count is for work still to do.
  const done = task({
    title: "Zrobione",
    dueAt: "2026-07-21T21:59:59.999Z",
    completionState: "completed",
  });
  assert.equal(dueSentence(done, prose), "due Jul 21, 2026");

  // Who planned it is said in the name this reader may use. An agent is named
  // because a learning agent is asked "why is this here" daily.
  assert.equal(plannerName(snapshot, me), "you");
  assert.equal(plannerName(snapshot, teammate), "Anna Nowak");
  assert.equal(plannerName(snapshot, assistant), "Asystent");
  assert.equal(plannerName(snapshot, departed), "somebody no longer here");
});

test("the three plan states are told apart by startAt and calendarBlock together", () => {
  const unplanned = task({
    title: "Bez planu",
    dueAt: "2026-07-31T21:59:59.999Z",
  });
  const dayOnly = task({
    title: "Dzień bez godziny",
    startAt: "2026-07-27T06:00:00.000Z",
  });
  const reserved = task({
    title: "Czas zarezerwowany",
    startAt: "2026-07-27T06:00:00.000Z",
    calendarBlock: HELD,
  });
  const stretched = task({
    title: "Dłuższa rezerwacja",
    startAt: "2026-07-27T06:00:00.000Z",
    calendarBlock: LONGER,
  });

  assert.equal(planStateOf(unplanned), "unplanned");
  assert.equal(planStateOf(dayOnly), "planned");
  assert.equal(planStateOf(reserved), "held");

  // A deadline is not a plan, so the state must not move because a date
  // exists elsewhere on the record.
  assert.equal(planSentence(unplanned, prose), "not planned");

  const day = "planned for Jul 27, 2026, no time reserved";
  const hour = "planned for Jul 27, 2026, 13:00 to 14:30 reserved";
  const longerHour = "planned for Jul 27, 2026, 13:00 to 16:00 reserved";
  assert.equal(planSentence(dayOnly, prose), day);
  assert.equal(planSentence(reserved, prose), hour);

  // The estimate IS the reserved block's duration, which is why this screen
  // has no effort field: two reservations of different length are the same
  // state and say different things.
  assert.equal(planStateOf(stretched), planStateOf(reserved));
  assert.equal(planSentence(stretched, prose), longerHour);

  // The rows every layout draws carry these three states, rather than each
  // lens reading the two fields again and reaching its own conclusion.
  const built = rows([unplanned, dayOnly, reserved]);
  const states = built.map((row) => row.planState);
  assert.deepEqual(states, ["unplanned", "planned", "held"]);
});

test("sorting has a second key, so an absent deadline does not reshuffle between renders", () => {
  // Twenty tasks share an empty deadline in a real workspace. A comparator
  // without a tiebreak leaves them in whatever order they arrived in, so the
  // list reorders itself while nothing about the work has changed.
  const numbers = Array.from({ length: 20 }, (_unused, index) => index + 11);
  const titles = numbers.map((index) => `Zadanie ${index}`);
  const shuffled = [...titles.slice(10).reverse(), ...titles.slice(0, 10)];
  const inOrder = rows(titles.map((title) => task({ title })));
  const arrived = rows(shuffled.map((title) => task({ title })));
  const sorted = (built: readonly TaskRow[]): readonly string[] =>
    sortRows(built, "due").map((row) => row.task.title);

  assert.deepEqual(sorted(arrived), sorted(inOrder));
  assert.deepEqual(sorted(arrived), titles);

  // Deadlines first in date order; the tasks without one go last and are
  // ordered among themselves rather than left where they fell.
  const mixed = rows([
    task({ title: "Cezary", dueAt: "2026-08-01T21:59:59.999Z" }),
    task({ title: "Zenon" }),
    task({ title: "Adam", dueAt: "2026-08-01T21:59:59.999Z" }),
    task({ title: "Bogdan", dueAt: "2026-07-30T21:59:59.999Z" }),
    task({ title: "Yaga" }),
  ]);
  const byDue = sorted(mixed);
  assert.deepEqual(byDue, ["Bogdan", "Adam", "Cezary", "Yaga", "Zenon"]);

  // Record content is Polish and is collated as Polish. In Polish "ł" is its
  // own letter and sorts after "l", so this pair comes out the other way
  // round under the interface's own locale — which is why the call says "pl".
  const polish = rows([task({ title: "łoś" }), task({ title: "lupa" })]);
  const titled = sortRows(polish, "title").map((row) => row.task.title);
  assert.deepEqual(titled, ["lupa", "łoś"]);
  assert.deepEqual(sorted(polish), ["lupa", "łoś"]);

  // Manual is the order the projection handed over, untouched.
  const untouched = sortRows(arrived, "manual").map((row) => row.task.title);
  assert.deepEqual(untouched, shuffled);
});

test("buildRows gives every row a name carrying the plan, the deadline and the project", () => {
  // A fact reachable only through a nested tooltip is not reachable from a
  // keyboard or from touch, so for that reader it does not exist.
  const rich = task({
    title: "Przegląd architektury",
    projectIds: [northstar.id],
    startAt: "2026-07-27T06:00:00.000Z",
    calendarBlock: HELD,
    plannedBy: plannedBy(me),
    dueAt: "2026-07-31T21:59:59.999Z",
    priority: "urgent",
    assignment: named(teammate, "Anna Nowak"),
  });
  const shared = task({
    title: "Wspólne wdrożenie",
    projectIds: [northstar.id, fundament.id],
  });
  const waiting = task({
    title: "Odpowiedź klienta",
    statusId: blocked.id,
    operationalState: "waiting",
  });
  const built = rows([rich, shared, waiting]);

  // Asserted as one whole string: a name checked only by `includes` passes
  // when the order or the separator breaks, and the order is what a listener
  // hears — they cannot skim back to the start of the row.
  const spoken =
    "Przegląd architektury, Doing, Northstar, planned for Jul 27, 2026, " +
    "13:00 to 14:30 reserved, by you, due Jul 31, 2026, urgent priority, " +
    "Anna Nowak";
  assert.equal(rowFor(built, "Przegląd architektury").accessibleName, spoken);

  // Both projects, because the row belongs to both.
  const twice = rowFor(built, "Wspólne wdrożenie");
  const contributesTo = twice.projects.map((entry) => entry.title);
  assert.deepEqual(contributesTo, ["Northstar", "Fundament"]);
  assert.ok(twice.accessibleName.includes("Northstar and Fundament"));

  // Belonging to no project is a fact too; silence would read as "not
  // loaded", and this row belongs to nothing on purpose.
  const waitingRow = rowFor(built, "Odpowiedź klienta");
  assert.ok(waitingRow.accessibleName.includes("no project"));

  // Work that is not actionable says so in its name, not only in its colour.
  assert.ok(waitingRow.accessibleName.includes("waiting"));
  assert.equal(waitingRow.status?.label, "Blocked");

  // Whatever else changes, the plan and the deadline are IN the name of every
  // row, in the same words the row's own cells use.
  for (const row of built) {
    assert.ok(row.accessibleName.includes(planSentence(row.task, prose)));
    assert.ok(row.accessibleName.includes(dueSentence(row.task, prose)));
    assert.ok(row.accessibleName.startsWith(row.task.title));
  }
});

test("a task on no date sits on no timeline, and the timeline counts it out loud", () => {
  const nowhere = task({ title: "Kiedyś" });
  const urgent = task({ title: "Też kiedyś", priority: "urgent" });
  const started = task({
    title: "Zaczęte",
    startAt: "2026-07-27T06:00:00.000Z",
  });
  const owed = task({ title: "Obiecane", dueAt: "2026-07-31T21:59:59.999Z" });
  const bothDates = task({
    title: "Zaplanowane i obiecane",
    startAt: "2026-07-27T06:00:00.000Z",
    dueAt: "2026-07-31T21:59:59.999Z",
  });

  assert.equal(sitsOnADate(nowhere), false);
  assert.equal(sitsOnADate(started), true);
  assert.equal(sitsOnADate(owed), true);
  assert.equal(sitsOnADate(bothDates), true);
  // Priority is not a date: work can be urgent and still sit nowhere.
  assert.equal(sitsOnADate(urgent), false);

  // The number the timeline states beside its track. Dropping these rows in
  // silence would leave the screen answering a question nobody asked, with no
  // count to hold against the list's.
  const built = rows([nowhere, urgent, started, owed, bothDates]);
  const drawn = built.filter((row) => sitsOnADate(row.task));
  assert.equal(drawn.length, 3);
  assert.equal(built.length - drawn.length, 2);
});

test("the board keeps an empty status column and the list drops an empty heading", () => {
  const built = rows([
    task({ title: "W toku", statusId: doing.id }),
    task({ title: "Drugie w toku", statusId: doing.id }),
  ]);

  // A column must be drawn while empty or there is nothing to drop onto — and
  // moving the last card out would delete the column under the cursor, mid
  // gesture.
  const board = groupTasks(built, "status", STATUSES, PROJECTS, true);
  assert.deepEqual(labelsOf(board), ["Triage", "Doing", "Blocked"]);
  assert.deepEqual(titlesOf(groupFor(board, triage.id)), []);
  assert.ok(board.every((group) => group.statusId !== undefined));

  // On a list an empty heading is noise, so it is not drawn at all.
  const list = groupTasks(built, "status", STATUSES, PROJECTS);
  assert.deepEqual(labelsOf(list), ["Doing"]);

  // The gesture this protects: with the last card gone the board still has
  // its three columns, and the list has nothing left to head.
  assert.equal(groupTasks([], "status", STATUSES, PROJECTS, true).length, 3);
  assert.equal(groupTasks([], "status", STATUSES, PROJECTS).length, 0);

  // The same rule on the other axes a board can be grouped by.
  const byProject = labelsOf(
    groupTasks(built, "project", STATUSES, PROJECTS, true),
  );
  assert.deepEqual(byProject, [
    "Northstar",
    "Fundament",
    "Odnowa",
    "No project",
  ]);
  const byPriority = labelsOf(
    groupTasks(built, "priority", STATUSES, PROJECTS, true),
  );
  assert.deepEqual(byPriority, ["Urgent", "High", "Normal", "Low"]);
  const onAList = labelsOf(groupTasks(built, "priority", STATUSES, PROJECTS));
  assert.deepEqual(onAList, ["Normal"]);
});

test("grouping by status follows the workspace's own order, not insertion and not the alphabet", () => {
  const built = rows([
    task({ title: "Zablokowane", statusId: blocked.id }),
    task({ title: "Do rozpatrzenia", statusId: triage.id }),
    task({ title: "W toku", statusId: doing.id }),
  ]);

  // The array arrives as Blocked, Triage, Doing and the alphabet says
  // Blocked, Doing, Triage. The workspace says Triage, Doing, Blocked, and it
  // owns the answer: somebody put these in that order on purpose.
  const groups = groupTasks(built, "status", STATUSES, PROJECTS, true);
  assert.deepEqual(labelsOf(groups), ["Triage", "Doing", "Blocked"]);

  // Only this axis names a status, and it names its own. Any other key here
  // would hand the board's drop a value that is not a status at all.
  assert.ok(groups.every((group) => group.statusId === group.key));
  for (const grouping of ["project", "priority", "assignee", "none"] as const) {
    const other = groupTasks(built, grouping, STATUSES, PROJECTS, true);
    assert.ok(other.every((group) => group.statusId === undefined));
  }
});

test("a saved view matches on every filter it carries, and never on a name the projection withheld", () => {
  const row = oneRow({
    title: "Otwarte",
    statusId: doing.id,
    priority: "high",
  });

  // No view is not a filter: the screen shows the whole collection.
  assert.equal(matchesSavedView(row, undefined, context()), true);

  const inDoing = savedView({ statusIds: [doing.id] });
  const inTriage = savedView({ statusIds: [triage.id] });
  assert.equal(matchesSavedView(row, inDoing, context()), true);
  assert.equal(matchesSavedView(row, inTriage, context()), false);

  const high = savedView({ priorities: ["high"] });
  const urgent = savedView({ priorities: ["urgent"] });
  const normal = savedView({ priorities: ["normal"] });
  assert.equal(matchesSavedView(row, high, context()), true);
  assert.equal(matchesSavedView(row, urgent, context()), false);
  // A task carrying no priority IS normal, so a normal view holds it.
  const plain = oneRow({ title: "Bez priorytetu" });
  assert.equal(matchesSavedView(plain, normal, context()), true);

  const actionable = savedView({ operationalStates: ["actionable"] });
  const waiting = savedView({ operationalStates: ["waiting"] });
  assert.equal(matchesSavedView(row, actionable, context()), true);
  assert.equal(matchesSavedView(row, waiting, context()), false);

  // "Scheduled" means a DEADLINE exists — the same thing the kernel means by
  // it. Reading it off the plan instead would make one stored view answer one
  // way here and another way to an operator asking `task.list`.
  const dated = oneRow({
    title: "Sam termin",
    dueAt: "2026-07-31T21:59:59.999Z",
  });
  const planned = oneRow({
    title: "Sam plan",
    startAt: "2026-07-27T06:00:00.000Z",
  });
  const scheduled = savedView({ scheduled: true });
  const unscheduled = savedView({ scheduled: false });
  assert.equal(matchesSavedView(dated, scheduled, context()), true);
  assert.equal(matchesSavedView(planned, scheduled, context()), false);
  assert.equal(matchesSavedView(planned, unscheduled, context()), true);

  // Assignment, on the terms the projection set. A view naming somebody this
  // reader may not be told about matches NOTHING, rather than matching on an
  // id the projection withheld — the same person, named but not identified.
  const mine = oneRow({
    title: "Moje",
    assignment: named(teammate, "Anna Nowak"),
  });
  const hidden = oneRow({ title: "Cudze", assignment: withheld("Anna Nowak") });
  const nobody = oneRow({ title: "Niczyje" });
  const byPerson = savedView({ assigneePrincipalIds: [teammate] });
  const unassigned = savedView({ unassigned: true });
  assert.equal(matchesSavedView(mine, byPerson, context()), true);
  assert.equal(matchesSavedView(hidden, byPerson, context()), false);
  assert.equal(matchesSavedView(nobody, byPerson, context()), false);
  assert.equal(matchesSavedView(nobody, unassigned, context()), true);
  assert.equal(matchesSavedView(hidden, unassigned, context()), false);

  // Custom fields, on all three predicates the vocabulary has.
  const green = oneRow({
    title: "Z polem",
    fields: { [choiceField]: { kind: "choice", value: "green" } },
  });
  const bare = oneRow({ title: "Bez pola" });
  const isSet = savedView({
    fields: [{ fieldId: choiceField, predicate: { kind: "set" } }],
  });
  const isEmpty = savedView({
    fields: [{ fieldId: choiceField, predicate: { kind: "empty" } }],
  });
  const isGreen = savedView({
    fields: [
      {
        fieldId: choiceField,
        predicate: { kind: "choice_is", option: "green" },
      },
    ],
  });
  const isRed = savedView({
    fields: [
      { fieldId: choiceField, predicate: { kind: "choice_is", option: "red" } },
    ],
  });
  assert.equal(matchesSavedView(green, isSet, context()), true);
  assert.equal(matchesSavedView(bare, isSet, context()), false);
  assert.equal(matchesSavedView(bare, isEmpty, context()), true);
  assert.equal(matchesSavedView(green, isEmpty, context()), false);
  assert.equal(matchesSavedView(green, isGreen, context()), true);
  assert.equal(matchesSavedView(green, isRed, context()), false);
});

test("a saved view's deadline window is the workspace's week, never the machine's", () => {
  const late = oneRow({ title: "Zaległe", dueAt: "2026-07-21T21:59:59.999Z" });
  const today = oneRow({ title: "Na dziś", dueAt: "2026-07-27T21:59:59.999Z" });
  const undated = oneRow({ title: "Bez terminu" });
  const overdue = savedView({ dueWindow: "overdue" });
  const dueToday = savedView({ dueWindow: "today" });

  assert.equal(matchesSavedView(late, overdue, context()), true);
  // A deadline at the end of today has not passed, so it is not overdue.
  assert.equal(matchesSavedView(today, overdue, context()), false);
  assert.equal(matchesSavedView(today, dueToday, context()), true);
  assert.equal(matchesSavedView(late, dueToday, context()), false);
  // A window is about deadlines, so work without one is outside every window.
  assert.equal(matchesSavedView(undated, dueToday, context()), false);

  // The discriminating case for "which week is this one". At this instant the
  // workspace is already on Monday while the machine is still on Sunday, so
  // the machine's week runs Jul 28 to Aug 3 and the workspace's runs Aug 3 to
  // Aug 9. Neither task below falls inside both.
  const auckland = {
    timeZone: "Pacific/Auckland",
    todayKey: "2026-08-03",
    now: new Date("2026-08-02T15:00:00.000Z"),
  };
  const inside = oneRow({
    title: "Koniec tygodnia",
    dueAt: "2026-08-08T12:00:00.000Z",
  });
  const outside = oneRow({
    title: "Poprzedni tydzień",
    dueAt: "2026-08-01T12:00:00.000Z",
  });
  const thisWeek = savedView({ dueWindow: "this_week" });
  assert.equal(matchesSavedView(inside, thisWeek, context(auckland)), true);
  assert.equal(matchesSavedView(outside, thisWeek, context(auckland)), false);
});

test("the relation answer comes from the kernel: absent constrains nothing, empty matches nothing", () => {
  // ADR-045. The client never walks the relation graph; it intersects with
  // the ids the kernel resolved. The two absences are different answers, and
  // reading them as one flips the screen to everything or to nothing.
  const one = task({ title: "Powiązane" });
  const two = task({ title: "Niepowiązane" });
  const built = rows([one, two]);
  const related = rowFor(built, "Powiązane");
  const unrelated = rowFor(built, "Niepowiązane");
  const view = savedView({}, { relationTaskIds: [one.id] });
  const answered = context({ relationTaskIds: new Set([one.id]) });
  const nobody = context({ relationTaskIds: new Set<string>() });

  assert.equal(matchesSavedView(related, view, context()), true);
  assert.equal(matchesSavedView(unrelated, view, context()), true);
  assert.equal(matchesSavedView(related, view, answered), true);
  assert.equal(matchesSavedView(unrelated, view, answered), false);
  // "Constrains by relation, and nothing matches" — not "constrains nothing".
  assert.equal(matchesSavedView(related, view, nobody), false);
});

test("search reads the row's own words and folds them as Polish", () => {
  const built = rows([
    task({ title: "ŻÓŁW na drodze", statusId: doing.id }),
    task({ title: "Bez znaczenia", statusId: blocked.id }),
    task({ title: "Cicha sprawa", assignment: withheld("Zespół klienta") }),
    task({ title: "Wdrożenie", projectIds: [northstar.id] }),
  ]);
  const turtle = rowFor(built, "ŻÓŁW na drodze");
  const plain = rowFor(built, "Bez znaczenia");
  const quiet = rowFor(built, "Cicha sprawa");
  const rollout = rowFor(built, "Wdrożenie");

  // Records are Polish and the fold has to reach them: a reader typing what
  // they see must find what they see.
  assert.equal(search(turtle, "żółw"), true);
  assert.equal(search(turtle, "ŻÓŁW"), true);
  assert.equal(search(plain, "żółw"), false);

  // Each of the row's other words, reachable on its own: the status, the name
  // the projection allowed, and every project the row contributes to.
  assert.equal(search(plain, "blocked"), true);
  assert.equal(search(quiet, "zespół"), true);
  assert.equal(search(rollout, "northstar"), true);
  assert.equal(search(rollout, "fundament"), false);

  // An empty query is not a filter that matches nothing.
  assert.ok(built.every((row) => search(row, "")));
  assert.ok(built.every((row) => search(row, "   ")));
  assert.ok(built.every((row) => !search(row, "czegoś takiego tu nie ma")));
});
