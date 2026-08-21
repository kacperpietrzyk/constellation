import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import {
  CommentIdSchema,
  PrincipalIdSchema,
  RelationIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  TaskAssignmentIdSchema,
  TaskIdSchema,
  type QueryProjection,
} from "@constellation/contracts";
import type { RendererQueryResponse } from "@constellation/desktop-preload/client";

import { assertNoNode } from "./dom-assert.js";
import {
  inProgressStatusId,
  populatedBootstrap,
  populatedPlanDayKey,
  populatedShellQueries,
  populatedWorkOverview,
  principalId,
  projectId,
  projectionResponse,
  spaceId,
  statusId,
} from "./shell-fixture.js";

type Projection<Kind extends QueryProjection["kind"]> = Extract<
  QueryProjection,
  { kind: Kind }
>;

// Opening a task shows the RECORD, and the record is reachable from a click.
//
// Every proof here starts from the navigation — Tasks, then one row — and never
// from a mount of the screen or from one of its callbacks. That rule is paid
// for: the shell is what decides between the collection and the record, what
// supplies the two slices the screen cannot fetch, and what turns a written
// comment into a command. A test that rendered `TaskRecordScreen` directly and
// watched it call `onOpenTask` would be green over a capability nothing on
// screen can reach, which is how four of them shipped last wave.
//
// What this file guarantees, in the words a reader would use:
//
//   - opening a task from the list puts the task on screen — the list is gone,
//     the task names itself once at level one, and there is a way back;
//   - a single click still only SELECTS: the record opens on Enter or a double
//     click, and opening it does not take the inspector away. The rail and the
//     record coexist by decision, and that is the thing most likely to be
//     "tidied" by a later change copying the project record's pattern;
//   - the conversation lives in ONE place: with the task open, there is exactly
//     one composer on screen and it is the record's — and a task merely
//     SELECTED still gets the rail's, because there is no record to defer to;
//   - switching sections changes what is on screen, one panel exists at a time,
//     and only the section on screen holds the keyboard's tab stop;
//   - a section this record kind does not offer, left over in storage, opens on
//     Overview WITH Overview on screen — the subset trap, invisible to the
//     compiler and to the tab strip alike;
//   - a comment written here is stored against THIS task, and an answer under a
//     thread is stored as an answer to it;
//   - a conversation that could not be read says why and still lets you write;
//   - the readings this screen is the only place for — subtasks and both
//     directions of a dependency — are on screen and openable.

const parentTaskId = TaskIdSchema.parse("00000000-0000-4000-8000-00000000ea01");
const openedTaskId = TaskIdSchema.parse("00000000-0000-4000-8000-00000000ea02");
const childDoneTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-00000000ea03",
);
const childOpenTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-00000000ea04",
);
const blockerTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-00000000ea05",
);
const dependentTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-00000000ea06",
);
const droppedTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-00000000ea07",
);
const otherTaskId = TaskIdSchema.parse("00000000-0000-4000-8000-00000000ea08");
const areaId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-00000000ea09",
);
const initiativeId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-00000000ea10",
);
const areaRelationId = RelationIdSchema.parse(
  "00000000-0000-4000-8000-00000000ea11",
);

const openRootId = CommentIdSchema.parse(
  "00000000-0000-4000-8000-00000000eb01",
);
const replyId = CommentIdSchema.parse("00000000-0000-4000-8000-00000000eb02");
const settledRootId = CommentIdSchema.parse(
  "00000000-0000-4000-8000-00000000eb03",
);

const OPENED_TITLE =
  "Uzgodnij ze sponsorką zakres warsztatu bezpieczeństwa informacji";
const PARENT_TITLE = "Program porządkowania bezpieczeństwa w Northstar";
const CHILD_DONE_TITLE = "Zbierz listę uczestników od Marty";
const CHILD_OPEN_TITLE = "Ustal agendę godzinową warsztatu";
const BLOCKER_TITLE = "Potwierdź budżet u sponsorki";
const DEPENDENT_TITLE = "Wyślij zaproszenia do uczestników";
const DROPPED_TITLE = "Zamów catering na warsztat";
const OTHER_TITLE = "Zamów licencje na 12 000 EPS";

/** Real context, in paragraphs. A one-sentence fixture cannot tell a screen
 *  that draws the writing from one that draws its first line — and the "the
 *  panel on screen has CONTENT" assertion below leans on a phrase that appears
 *  nowhere else on the record. */
const OPENED_CONTEXT = `Zakres ma się zmieścić na jednej stronie i ma być podpisany przez sponsorkę, a nie tylko wysłany do wiadomości. Wszystko, co się na tej stronie nie mieści, jest osobnym zaangażowaniem z własnym terminem.

Warsztat prowadzimy w dwóch turach, bo zespół techniczny i zarząd nie usiądą razem na cały dzień. Materiały wstępne idą tydzień wcześniej, inaczej pierwsza godzina schodzi na czytanie.`;

/**
 * One task list, one work plane DERIVED from it — never two hand-kept copies.
 *
 * The record reads the uncapped `work.overview` while its written context and
 * the version a comment write is checked against come from the capped
 * `task.list`, so a task missing from the second opens as a record whose
 * composer sends nothing. Both projections are built from this one array so
 * they cannot drift into that state by accident.
 *
 * The order is deliberately NOT the order anything on screen draws: the opened
 * task is third, its two children are three rows apart, and the task it waits
 * for comes after it. A fixture whose every list agrees cannot catch a screen
 * that opened the highlighted row's neighbour.
 */
const taskItems: Projection<"task.list">["items"] = [
  {
    id: otherTaskId,
    spaceId,
    title: OTHER_TITLE,
    priority: "high",
    status: {
      id: statusId,
      label: "Do zrobienia",
      operationalSemantics: "actionable",
      state: "active",
    },
    completionState: "open",
    attachments: [],
    createdAt: "2026-07-28T09:00:00.000Z",
    updatedAt: "2026-07-28T09:00:00.000Z",
    version: 1,
  },
  {
    id: childDoneTaskId,
    spaceId,
    title: CHILD_DONE_TITLE,
    parentTaskId: openedTaskId,
    status: {
      id: statusId,
      label: "Do zrobienia",
      operationalSemantics: "actionable",
      state: "active",
    },
    completionState: "completed",
    completedAt: "2026-07-27T16:40:00.000Z",
    attachments: [],
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-27T16:40:00.000Z",
    version: 4,
  },
  {
    id: openedTaskId,
    spaceId,
    title: OPENED_TITLE,
    description: OPENED_CONTEXT,
    nextAction: "Wyślij zakres sponsorce do akceptacji.",
    parentTaskId: parentTaskId,
    dueAt: "2026-08-05T15:00:00.000Z",
    priority: "high",
    plannedBy: {
      principalId,
      principalKind: "human",
      at: "2026-07-29T09:15:00.000Z",
    },
    startAt: "2026-08-03T07:00:00.000Z",
    status: {
      id: inProgressStatusId,
      label: "W toku",
      operationalSemantics: "actionable",
      state: "active",
    },
    completionState: "open",
    assignment: {
      id: TaskAssignmentIdSchema.parse("00000000-0000-4000-8000-00000000ec01"),
      assigneePrincipalId: principalId,
      displayName: "Kacper",
      availability: "active",
      version: 1,
    },
    attachments: [],
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-29T09:15:00.000Z",
    version: 3,
  },
  {
    id: blockerTaskId,
    spaceId,
    title: BLOCKER_TITLE,
    status: {
      id: statusId,
      label: "Do zrobienia",
      operationalSemantics: "actionable",
      state: "active",
    },
    completionState: "open",
    attachments: [],
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    version: 1,
  },
  {
    id: parentTaskId,
    spaceId,
    title: PARENT_TITLE,
    status: {
      id: statusId,
      label: "Do zrobienia",
      operationalSemantics: "actionable",
      state: "active",
    },
    completionState: "open",
    attachments: [],
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
    version: 2,
  },
  {
    id: dependentTaskId,
    spaceId,
    title: DEPENDENT_TITLE,
    status: {
      id: statusId,
      label: "Do zrobienia",
      operationalSemantics: "actionable",
      state: "active",
    },
    completionState: "open",
    attachments: [],
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T08:00:00.000Z",
    version: 1,
  },
  {
    id: childOpenTaskId,
    spaceId,
    title: CHILD_OPEN_TITLE,
    description: "Dwie tury po dziewięćdziesiąt minut, z przerwą.",
    parentTaskId: openedTaskId,
    status: {
      id: statusId,
      label: "Do zrobienia",
      operationalSemantics: "actionable",
      state: "active",
    },
    completionState: "open",
    attachments: [],
    createdAt: "2026-07-26T08:00:00.000Z",
    updatedAt: "2026-07-26T08:00:00.000Z",
    version: 1,
  },
  {
    id: droppedTaskId,
    spaceId,
    title: DROPPED_TITLE,
    status: {
      id: statusId,
      label: "Do zrobienia",
      operationalSemantics: "actionable",
      state: "active",
    },
    completionState: "open",
    attachments: [],
    createdAt: "2026-07-22T08:00:00.000Z",
    updatedAt: "2026-07-22T08:00:00.000Z",
    version: 1,
  },
];

/**
 * Three links, and the third is the one that matters.
 *
 * `work.linkRemove` flips the LINK's state and leaves the record alone, so a
 * dependency somebody removed keeps coming back from this query forever. The
 * removed one points at a task that is in the work plane and is nothing else to
 * the opened task — not its parent, not its child, not its other dependency —
 * so if the `state === "active"` filter goes, its title appears on screen and
 * nothing else can account for it.
 */
const links: Projection<"work.overview">["links"] = [
  {
    id: StrategicRecordIdSchema.parse("00000000-0000-4000-8000-00000000ed01"),
    linkType: "task_depends_on_task",
    sourceRecordId: openedTaskId,
    targetRecordId: blockerTaskId,
    state: "active",
    version: 1,
  },
  {
    id: StrategicRecordIdSchema.parse("00000000-0000-4000-8000-00000000ed02"),
    linkType: "task_depends_on_task",
    sourceRecordId: dependentTaskId,
    targetRecordId: openedTaskId,
    state: "active",
    version: 1,
  },
  {
    id: StrategicRecordIdSchema.parse("00000000-0000-4000-8000-00000000ed03"),
    linkType: "task_depends_on_task",
    sourceRecordId: openedTaskId,
    targetRecordId: droppedTaskId,
    state: "removed",
    version: 2,
  },
];

/**
 * What stands in the way of each task, for the two that are not simply
 * actionable.
 *
 * Written down because the record can now CHANGE it, and every assertion about
 * that change needs a task the change starts from. A fixture where every task is
 * actionable renders the authoring panel's seeded state exactly never: the drafts
 * fall back to what the task already says, and with nothing said they fall back
 * to empty — which is the one case that cannot catch a panel that erases a
 * recorded reason.
 *
 * The waiting one carries the WHOLE composite. A label without a direction and a
 * date proves nothing about re-sending the two fields a reader did not touch.
 */
const waitingOn: Partial<
  Record<string, Projection<"work.overview">["tasks"][number]["waitingOn"]>
> = {
  [blockerTaskId]: {
    kind: "external",
    label: "Sponsorka — decyzja o budżecie",
    direction: "waiting_on_them",
    expectedAt: "2026-08-10T21:59:59.999Z",
  },
};

const operationalStates: Partial<
  Record<
    string,
    Projection<"work.overview">["tasks"][number]["operationalState"]
  >
> = {
  [blockerTaskId]: "waiting",
  [dependentTaskId]: "blocked",
};

const work: Projection<"work.overview"> = {
  ...populatedWorkOverview,
  tasks: taskItems.map((item) => ({
    id: item.id,
    title: item.title,
    statusId: item.status.id,
    operationalState: operationalStates[item.id] ?? ("actionable" as const),
    ...(waitingOn[item.id] === undefined
      ? {}
      : { waitingOn: waitingOn[item.id] }),
    completionState: item.completionState,
    ...(item.startAt === undefined ? {} : { startAt: item.startAt }),
    ...(item.plannedBy === undefined ? {} : { plannedBy: item.plannedBy }),
    ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
    ...(item.priority === undefined ? {} : { priority: item.priority }),
    ...(item.parentTaskId === undefined
      ? {}
      : { parentTaskId: item.parentTaskId }),
    ...(item.assignment === undefined ? {} : { assignment: item.assignment }),
    projectIds: [projectId],
    areaIds: item.id === openedTaskId ? [areaId] : [],
    initiativeIds: [],
    directContextRelations:
      item.id === openedTaskId
        ? [
            {
              relationId: areaRelationId,
              relationType: "task_contributes_to_area" as const,
              targetId: areaId,
              version: 1,
            },
          ]
        : [],
    version: item.version,
    updatedAt: item.updatedAt,
  })),
  areas: [
    {
      id: areaId,
      title: "Product stewardship",
      responsibility: "Keep lightweight work in its durable responsibility.",
      needsReview: false,
      state: "active",
      version: 1,
    },
  ],
  initiatives: [
    {
      id: initiativeId,
      title: "Adopt the work structure",
      intendedOutcome: "No synthetic project is needed for lightweight work.",
      needsReview: false,
      state: "active",
      version: 1,
    },
  ],
  links,
};

/**
 * One open root WITH an answer under it, and one settled root.
 *
 * Three different numbers are then possible — one open root, two roots, three
 * comments — so the count on the Comments tab can be wrong in either direction
 * and be seen to be wrong. A fixture of one open root and one settled one makes
 * "roots" and "comments" both read two, and only one wrong answer is excluded.
 */
const comments: Projection<"comment.list"> = {
  kind: "comment.list",
  target: { kind: "task", taskId: openedTaskId },
  threads: [
    {
      id: openRootId,
      rootCommentId: openRootId,
      body: "Czy zakres obejmuje też oddział w Gdańsku?",
      author: { principalId, displayName: "Kacper" },
      mentionPrincipalIds: [],
      attachments: [],
      threadState: "open",
      version: 1,
      createdAt: "2026-07-29T08:00:00.000Z",
      updatedAt: "2026-07-29T08:00:00.000Z",
      edited: false,
    },
    {
      id: replyId,
      rootCommentId: openRootId,
      parentCommentId: openRootId,
      body: "Sprawdzam u Marty.",
      author: { principalId, displayName: "Kacper" },
      mentionPrincipalIds: [],
      attachments: [],
      threadState: "open",
      version: 1,
      createdAt: "2026-07-29T09:00:00.000Z",
      updatedAt: "2026-07-29T09:00:00.000Z",
      edited: false,
    },
    {
      id: settledRootId,
      rootCommentId: settledRootId,
      body: "Termin przesunięty, potwierdzone.",
      author: { displayName: "Marta" },
      mentionPrincipalIds: [],
      attachments: [],
      threadState: "resolved",
      version: 2,
      createdAt: "2026-07-28T08:00:00.000Z",
      updatedAt: "2026-07-28T09:00:00.000Z",
      edited: false,
    },
  ],
};

const mentionCandidates: Projection<"comment.mentionCandidates"> = {
  kind: "comment.mentionCandidates",
  spaceId,
  candidates: [
    { principalId, displayName: "Kacper", participantKind: "member" },
    {
      principalId: PrincipalIdSchema.parse(
        "00000000-0000-4000-8000-00000000ec02",
      ),
      displayName: "Marta",
      participantKind: "member",
    },
  ],
};

/** Identity and a grant. Without both, nobody is the reader, no comment is
 *  anybody's own, and the composer is correctly absent — which is a different
 *  screen from the one every assertion below is about. */
const access: Projection<"workspace.access"> = {
  kind: "workspace.access",
  policyVersion: 1,
  currentPrincipalId: principalId,
  canManage: true,
  members: [
    {
      membershipId: "00000000-0000-4000-8000-00000000ec03",
      principalId,
      displayName: "Kacper",
      role: "owner",
      status: "active",
      version: 1,
      spaces: [
        {
          spaceGrantId: "00000000-0000-4000-8000-00000000ec04",
          spaceId,
          spaceName: "Space",
          access: "edit",
          status: "active",
          version: 1,
        },
      ],
    },
  ],
};

/** A read the boundary throws out. Written down rather than left as a missing
 *  fixture, so the refusal reads as the subject of a test instead of an
 *  oversight. */
const refused: RendererQueryResponse = {
  kind: "contract_rejected",
  diagnosticCode: "contract.invalid",
  issues: [{ path: "target", code: "custom" }],
};

/**
 * TWO Spaces, and the work's own is deliberately not the first.
 *
 * `work.linkCreate` is checked by the kernel against the Space named in its
 * payload, and the renderer's wrapper refuses to guess one — the hardcoded
 * "first Space" default was removed because a record outside it turned a
 * legitimate link into a silent rejection. With one Space in the fixture, the
 * task's own Space and the workspace's first are the same string, so an
 * assertion that the right one was sent cannot fail and proves nothing.
 *
 * Named `Archiwum` rather than something neutral so a screen that renders a
 * Space name is caught saying the wrong one out loud.
 */
const otherSpaceId = SpaceIdSchema.parse(
  "00000000-0000-4000-8000-00000000ef01",
);

const bootstrap: Projection<"workspace.bootstrapContext"> = {
  ...populatedBootstrap,
  spaces: [
    { id: otherSpaceId, name: "Archiwum", version: 1 },
    ...populatedBootstrap.spaces,
  ],
};

const queries = {
  ...populatedShellQueries,
  "workspace.bootstrapContext": projectionResponse(bootstrap),
  "workspace.access": projectionResponse(access),
  "work.overview": projectionResponse(work),
  "task.list": projectionResponse({
    kind: "task.list",
    items: taskItems,
    nextCursor: null,
  }),
  "comment.list": projectionResponse(comments),
  "comment.mentionCandidates": projectionResponse(mentionCandidates),
};

/** Where the task record stores which section each task was left on. Seeded by
 *  hand in one test; cleared with the rest of storage before every other. */
const TAB_STORE_KEY = "constellation.task-record-tab.v1";

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  // Only `Date`. Faking every timer would stop `waitForCondition` — which is
  // built on `setTimeout` — from ever advancing, and the wait would read as a
  // screen that never settled.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${populatedPlanDayKey}T09:30:00.000Z`));
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  container.remove();
  vi.useRealTimers();
});

const waitForCondition = async (
  ready: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  assert.fail(message);
};

/** Every command the shell issued, in order. A composer that redraws itself
 *  and a composer that SENDS what was typed look the same on screen; the
 *  payload is the only place the difference lives. */
let issued: {
  name: string;
  payload: Record<string, unknown>;
  /** Kept beside the payload because the version a write is checked against
   *  does NOT travel in the payload — it is keyed by record id in
   *  `expectedVersions`. A test reading only the payload cannot tell a write
   *  that named the right version from one that named none. */
  expectedVersions: Record<string, number>;
}[] = [];

const mountShell = async (
  overrides: Record<string, unknown> = {},
  /** Set only by the test that deliberately puts the opened task PAST the
   *  capped page. Every other test wants the guard below, which turns a fixture
   *  that drifted into that state into a named failure rather than a confusing
   *  one somewhere downstream. */
  beyondTheCappedPage = false,
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  issued = [];
  const scenario = createScenarioClient({
    queries: { ...queries, ...overrides },
    executeCommand: (command) => {
      issued.push({
        name: command.commandName,
        payload: command.payload as Record<string, unknown>,
        expectedVersions: (command.expectedVersions ?? {}) as Record<
          string,
          number
        >,
      });
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    },
  });
  const snapshot = await loadDesktopSnapshot(scenario);
  assert.equal(
    snapshot.work.kind,
    "ready",
    "the work fixture never reached the snapshot, so this measures nothing",
  );
  assert.equal(
    snapshot.tasks.some((item) => item.id === openedTaskId),
    !beyondTheCappedPage,
    "the opened task is missing from the capped list, so its context and its comment version are absent for a reason that is not the screen's",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(RealApp, { client: scenario, initialSnapshot: snapshot }),
    );
  });
};

/** The Tasks destination, from the navigation and nowhere else. */
const openTasks = async (): Promise<void> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "tasks");
  assert.ok(item, "no navigation target rendered for Tasks");
  await act(async () => {
    item.click();
  });
  await waitForCondition(
    () => container.querySelectorAll("[data-task-row]").length > 0,
    "Tasks never drew a single row into the work plane",
  );
};

const rowFor = (taskId: string): HTMLElement => {
  const row = container.querySelector<HTMLElement>(
    `[data-task-row="${taskId}"]`,
  );
  assert.ok(row, "the collection never drew the task this test opens");
  return row;
};

/** Opens a task the way a person does: the destination, one row, two clicks. */
const openRecord = async (
  taskId: string = openedTaskId,
  overrides: Record<string, unknown> = {},
): Promise<HTMLElement> => {
  await mountShell(overrides);
  await openTasks();
  const row = rowFor(taskId);
  await act(async () => {
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitForCondition(
    () => container.querySelector('[data-record-kind="task"]') !== null,
    "opening a task never produced a record screen",
  );
  return record();
};

/** The record, and the scope of every query below it. The inspector rail is
 *  open BESIDE this screen by decision, and it mounts several of the same
 *  components — an unscoped query would answer from whichever came first in
 *  the document while looking like a measurement of this screen. */
const record = (): HTMLElement => {
  const found = container.querySelector<HTMLElement>(
    '[data-record-kind="task"]',
  );
  assert.ok(found, "the record screen is not on the page");
  return found;
};

/**
 * The inspector rail, and whether it is actually ON SCREEN.
 *
 * The shell keeps the `<aside>` mounted at all times and says whether it is
 * showing with `aria-hidden` and an `open` class — so finding the node proves
 * nothing. Verified by breaking it: suppressing the rail the way the project
 * record does left the node, its heading and its assignment picker all in the
 * document, and an assertion that merely found them stayed green over a rail
 * hidden from every reader.
 */
const railOnScreen = (): HTMLElement => {
  const found = container.querySelector<HTMLElement>(
    '[aria-label="Context preview"]',
  );
  assert.ok(found, "the shell drew no inspector at all");
  assert.equal(
    found.getAttribute("aria-hidden"),
    "false",
    "the inspector is in the document but hidden from everyone",
  );
  assert.ok(
    found.classList.contains("open"),
    "the inspector is in the document but not opened",
  );
  return found;
};

const tabs = (): HTMLElement[] => [
  ...record().querySelectorAll<HTMLElement>('[role="tab"][data-record-tab]'),
];

const tabNamed = (name: string): HTMLElement => {
  const found = tabs().find((tab) => tab.dataset.recordTab === name);
  assert.ok(found, `the task record has no ${name} tab`);
  return found;
};

const panel = (): HTMLElement => {
  const panels = [
    ...record().querySelectorAll<HTMLElement>('[role="tabpanel"]'),
  ];
  assert.equal(
    panels.length,
    1,
    `the record draws ${panels.length} tabpanels, which breaks its own ARIA`,
  );
  return panels[0]!;
};

const openTab = async (name: string): Promise<void> => {
  await act(async () => {
    tabNamed(name).click();
  });
};

const composers = (): HTMLTextAreaElement[] => [
  ...container.querySelectorAll<HTMLTextAreaElement>(
    'textarea[aria-label="Write a comment"]',
  ),
];

/** Opens the record's own conversation and waits for the threads to land: the
 *  slice is fetched after the record paints, so a query fired the instant the
 *  tab changes measures the pending frame. */
const openComments = async (): Promise<HTMLElement> => {
  await openTab("comments");
  await waitForCondition(
    () => record().querySelector("[data-thread-root]") !== null,
    "the record's Comments tab never drew a thread",
  );
  return record();
};

const buttonIn = (scope: ParentNode, text: string): HTMLElement | undefined =>
  [...scope.querySelectorAll<HTMLElement>("button")].find(
    (button) => (button.textContent ?? "").trim() === text,
  );

const rowNamed = (scope: ParentNode, label: string): HTMLElement | null =>
  scope.querySelector<HTMLElement>(`[data-record-row="${label}"]`);

/** Types the way a person does. React's own value tracker swallows a plain
 *  assignment, so a test that skipped the native setter would leave the
 *  composer holding what it started with — and every assertion about what was
 *  SENT would then be about the stored body instead of the typed one. */
const typeInto = async (
  field: HTMLTextAreaElement,
  text: string,
): Promise<void> => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submit = async (field: HTMLTextAreaElement): Promise<void> => {
  await act(async () => {
    field
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

const commentAdds = (): Record<string, unknown>[] =>
  issued
    .filter((command) => command.name === "comment.add")
    .map((command) => command.payload);

/** The versions each `comment.add` was checked against, in the same order. */
const commentAddVersions = (): Record<string, number>[] =>
  issued
    .filter((command) => command.name === "comment.add")
    .map((command) => command.expectedVersions);

test("a Task authors direct Area and Initiative context without creating a Project relation", async () => {
  const opened = await openRecord();
  const contextSection = opened.querySelector<HTMLElement>(
    "[data-task-context]",
  );
  assert.ok(
    contextSection,
    "the Task record has no direct work-context section",
  );
  assert.match(contextSection.textContent ?? "", /Product stewardship/u);

  const remove = contextSection.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove Product stewardship"]',
  );
  assert.ok(remove, "the direct Area relation cannot be removed from the Task");
  await act(async () => {
    remove.click();
  });
  assert.deepEqual(
    issued.find((command) => command.name === "record.unrelate"),
    {
      name: "record.unrelate",
      payload: { relationId: areaRelationId },
      expectedVersions: { [areaRelationId]: 1 },
    },
  );

  const picker = contextSection.querySelector<HTMLButtonElement>(
    "#task-direct-context",
  );
  assert.ok(picker, "the Task record has no drawn context picker");
  await act(async () => {
    picker.click();
  });
  const initiativeChoice = document.body.querySelector<HTMLButtonElement>(
    `[data-choice="initiative:${initiativeId}"]`,
  );
  assert.ok(
    initiativeChoice,
    "the context picker does not offer the Initiative",
  );
  assert.equal(initiativeChoice.getAttribute("role"), "menuitemradio");
  const menu = initiativeChoice.closest<HTMLElement>('[role="menu"]');
  const emptyChoice =
    document.body.querySelector<HTMLButtonElement>('[data-choice=""]');
  assert.ok(menu && emptyChoice, "the drawn context menu is incomplete");
  emptyChoice.focus();
  await act(async () => {
    menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  assert.equal(
    document.activeElement,
    initiativeChoice,
    "ArrowDown does not move to the Initiative choice",
  );
  await act(async () => {
    initiativeChoice.click();
  });
  const link = buttonIn(contextSection, "Link context");
  assert.ok(link, "the Task record has no link action");
  await act(async () => {
    link.click();
  });
  assert.deepEqual(
    issued.find(
      (command) =>
        command.name === "record.relate" &&
        command.payload.relationType === "task_advances_initiative",
    ),
    {
      name: "record.relate",
      payload: {
        relationType: "task_advances_initiative",
        taskId: openedTaskId,
        initiativeId,
      },
      expectedVersions: { [openedTaskId]: 3, [initiativeId]: 1 },
    },
  );
  assert.equal(
    issued.some(
      (command) =>
        command.name === "record.relate" &&
        command.payload.relationType === "task_contributes_to_project",
    ),
    false,
    "linking direct context must not synthesize a Project relation",
  );
});

test("opening a task puts the task itself on screen, named once, with a way back", async () => {
  const opened = await openRecord();

  // The COLLECTION is gone. Not hidden behind the record: a list still in the
  // document keeps its rows in the Tab order and its roving index, so the
  // keyboard would walk a screen nobody can see.
  assertNoNode(
    container.querySelector("[data-task-row]"),
    "the task list is still on the page underneath the record",
  );

  // Exactly one `<h1>`, and it is this task's. Two would be two records
  // according to the outline, and the shell names the work plane after
  // whichever comes first in the document.
  const headings = [...container.querySelectorAll("h1")];
  assert.equal(
    headings.length,
    1,
    `the screen renders ${headings.length} level-one headings`,
  );
  assert.equal(headings[0]?.textContent, OPENED_TITLE);
  assert.ok(
    opened.contains(headings[0] ?? null),
    "the only level-one heading belongs to something other than the record",
  );

  // The shell uses this id twice — as the work plane's accessible name and as
  // where focus lands after a destination change. A heading without it leaves
  // the plane unnamed and drops focus on the panel, silently and only for the
  // keyboard.
  assert.equal(headings[0]?.id, "surface-title");
  assert.equal(headings[0]?.tabIndex, -1);
  assert.equal(
    container
      .querySelector<HTMLElement>("main[data-surface]")
      ?.getAttribute("aria-labelledby"),
    "surface-title",
  );

  // And there is a way out, which returns the collection rather than an empty
  // plane. NAPIS ZMIENIŁ SIĘ W LOCIE L2 i ta asercja jedzie za nim świadomie:
  // rząd nad rekordem przestał być linkiem cofającym („‹ Tasks") i stał się
  // TRASĄ w paśmie („Tasks › <tytuł rekordu>"), tak jak w prototypie
  // (`v3/screens/record.js:556-562`). Wyjście jest tym samym przyciskiem, tylko
  // pierwszym członem trasy, więc test dalej pyta o zachowanie, a nie o glif.
  const back = buttonIn(opened, "Tasks");
  assert.ok(back, "the record offers no way back to the task list");
  await act(async () => {
    back.click();
  });
  await waitForCondition(
    () =>
      container.querySelector('[data-record-kind="task"]') === null &&
      container.querySelectorAll("[data-task-row]").length > 0,
    "leaving the record never brought the task list back",
  );
});

test("a single click selects without opening, and opening keeps the inspector", async () => {
  await mountShell();
  await openTasks();
  const row = rowFor(openedTaskId);

  // SELECT. One click marks the row and leaves the collection where it is —
  // the two gestures mean different things, and a screen that opened on the
  // first would make the list unusable with a mouse.
  await act(async () => {
    row.click();
  });
  await waitForCondition(
    () => rowFor(openedTaskId).getAttribute("aria-selected") === "true",
    "one click does not even select the row",
  );
  assertNoNode(
    container.querySelector('[data-record-kind="task"]'),
    "one click opened the record, so selecting a task is no longer possible",
  );
  assert.ok(
    container.querySelectorAll("[data-task-row]").length > 1,
    "the collection left the screen on a single click",
  );
  railOnScreen();

  // OPEN, and the inspector STAYS. This is the coexistence decision: the
  // record is where the task is read, the rail is where it is operated on, and
  // the project record's pattern of taking the rail away must not be copied
  // here. `TaskAssignmentSection` stands for the rail's four operation
  // sections — it is the one nothing else on this screen draws.
  await act(async () => {
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitForCondition(
    () => container.querySelector('[data-record-kind="task"]') !== null,
    "a double click on the row never opened the record",
  );
  const beside = railOnScreen();
  assert.ok(
    beside.querySelector(".assignment-block select"),
    "the inspector is open beside the record but no longer offers to hand the task on",
  );
});

test("the task's conversation lives in exactly one place at a time", async () => {
  // ARM ONE: the task is OPEN as a record. Two live composers a hand apart are
  // two places to write one thing, and a reader cannot tell which of them the
  // comment they are typing will hang on.
  await openRecord();
  await openComments();
  const inRecord = composers();
  assert.equal(
    inRecord.length,
    1,
    `${inRecord.length} places to write a comment are on screen at once`,
  );
  assert.ok(
    record().contains(inRecord[0] ?? null),
    "the one composer on screen is not the record's own",
  );

  // ARM TWO: the task is merely SELECTED. There is no record to defer to, so
  // the rail keeps the conversation — a task chosen from the list, from Today
  // or from the Inbox must not silently lose its comments. Nothing asserted
  // this before: every existing test single-clicks, so it exercised this arm
  // without ever stating it.
  const back = buttonIn(record(), "Tasks");
  assert.ok(back);
  await act(async () => {
    back.click();
  });
  await waitForCondition(
    () => container.querySelectorAll("[data-task-row]").length > 0,
    "leaving the record never brought the task list back",
  );
  await act(async () => {
    rowFor(openedTaskId).click();
  });
  await waitForCondition(
    () => composers().length > 0,
    "a task that is selected but not opened offers nowhere to write a comment",
  );
  assert.ok(
    railOnScreen().contains(composers()[0] ?? null),
    "the composer for a merely selected task is not in the inspector",
  );
});

test("switching sections changes the screen, and only the one on screen is reachable", async () => {
  const opened = await openRecord();

  // Three sections, in this order, and none of the two a task does not have:
  // it carries no documents of its own, and its subtasks are read on Overview
  // beside the work they split.
  assert.deepEqual(
    tabs().map((tab) => tab.dataset.recordTab),
    ["overview", "comments", "activity"],
  );

  // OVERVIEW is on screen: its own headings and its rows, and no composer.
  assert.equal(
    panel().getAttribute("aria-labelledby"),
    tabNamed("overview").id,
  );
  assert.ok(
    [...panel().querySelectorAll("h2")].some(
      (heading) => heading.textContent === "Context",
    ),
    "the Overview section is selected but its readings are not on screen",
  );
  const rows = [...opened.querySelectorAll<HTMLElement>("[data-record-row]")];
  assert.ok(rows.length > 0, "Overview drew no rows, so this measures nothing");
  for (const row of rows)
    assert.ok(
      panel().contains(row),
      "a row of the record sits outside the panel that names it",
    );
  assert.equal(composers().length, 0, "Overview is drawing a comment composer");

  // COMMENTS replaces it. The other section is not merely hidden — it is not
  // built, so its buttons cannot hold a Tab stop behind the section on screen.
  await openComments();
  assert.equal(
    panel().getAttribute("aria-labelledby"),
    tabNamed("comments").id,
  );
  assertNoNode(
    record().querySelector("[data-record-row]"),
    "the Overview rows are still built while Comments is the section on screen",
  );
  assert.equal(
    composers().length,
    1,
    "the Comments section offers no way to write",
  );

  // And the strip itself is ONE control: the arrows move inside it, so only
  // the open tab is a Tab stop.
  const stops = tabs().filter((tab) => tab.tabIndex === 0);
  assert.equal(
    stops.length,
    1,
    `${stops.length} tabs hold a Tab stop; the strip is one control and must have one`,
  );
  assert.equal(stops[0]?.dataset.recordTab, "comments");
});

test("a section stored for another kind of record opens on Overview, with Overview on screen", async () => {
  // `documents` is a real section — the project record has one — and this key
  // set is in circulation. A task has no Documents panel, so the stored value
  // survives every check that asks "is this a tab that exists" and fails only
  // the one that asks "is this a tab a TASK offers".
  //
  // The assertion has to be about the CONTENT, not about the strip: the strip
  // makes the same coercion for itself, so a record whose panel matched no
  // branch still highlighted Overview over an empty page. That screen is what
  // this test exists to fail on.
  localStorage.setItem(
    TAB_STORE_KEY,
    JSON.stringify({ [openedTaskId]: "documents" }),
  );
  await openRecord();

  assert.equal(
    tabs().find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset
      .recordTab,
    "overview",
  );
  assert.ok(
    [...panel().querySelectorAll("h2")].some(
      (heading) => heading.textContent === "Context",
    ),
    "the record opened on Overview with nothing under it",
  );
  // A phrase from the task's own writing, which appears nowhere else on the
  // record. "The panel has some text in it" passes on a panel holding a full
  // stop — this repo has broken that assertion on purpose to prove it.
  assert.ok(
    panel().textContent?.includes("Zakres ma się zmieścić na jednej stronie"),
    "Overview is selected but the task's written context is not on screen",
  );
});

test("a comment written here is stored against the task on screen", async () => {
  // Opened from a row that is NOT the first in any list this shell holds, and
  // with another task selected first, so a target taken from the selection, the
  // first row or the collection's own order lands on a different task.
  await mountShell();
  await openTasks();
  await act(async () => {
    rowFor(otherTaskId).click();
  });
  await act(async () => {
    rowFor(openedTaskId).dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
  });
  await waitForCondition(
    () => container.querySelector('[data-record-kind="task"]') !== null,
    "opening a task never produced a record screen",
  );
  await openComments();

  const field = composers()[0];
  assert.ok(field, "the record's Comments section offers no composer");
  await typeInto(field, "Czy to jeszcze aktualne?");
  await submit(field);

  const first = commentAdds().at(-1);
  assert.ok(first, "writing a comment issued no command at all");
  assert.deepEqual(
    first["target"],
    { kind: "task", taskId: openedTaskId },
    "the comment reached the kernel against a different record than the one on screen",
  );
  assert.equal(first["body"], "Czy to jeszcze aktualne?");

  // And the target FOLLOWS the record. Opening a subtask from inside the record
  // replaces what is on screen; a target pinned when the screen first mounted
  // would keep sending the parent's comments under the child's heading, and
  // both writes would look identical from the outside.
  await openTab("overview");
  const child = rowNamed(record(), CHILD_OPEN_TITLE);
  assert.ok(child, "the record does not draw the subtask this test opens");
  await act(async () => {
    child.click();
  });
  await waitForCondition(
    () =>
      container.querySelector('[data-record-kind="task"] h1')?.textContent ===
      CHILD_OPEN_TITLE,
    "opening a subtask from the record did not put it on screen",
  );
  await openComments();
  const second = composers()[0];
  assert.ok(second, "the subtask's record offers no composer");
  await typeInto(second, "Dwie tury czy trzy?");
  await submit(second);

  const latest = commentAdds().at(-1);
  assert.ok(latest, "writing on the subtask issued no command at all");
  assert.deepEqual(
    latest["target"],
    { kind: "task", taskId: childOpenTaskId },
    "the comment landed on the task the reader came from, not the one they are reading",
  );
});

test("a task reached without asking for the record keeps its comments in the rail", async () => {
  // The rail defers its Comments to the record so there are not two live
  // composers a hand apart. What it must defer to is the record BEING THERE.
  //
  // A signal activated from the operating system, a capture that just became a
  // task and a row opened from Today all navigate to a task CONTEXT without
  // asking for the record. Keyed on the context's task id alone, the rail hid
  // its comments and no record appeared to hold them: the packaged hub smoke
  // opened an exact comment context and found neither. One flag has to decide
  // both, or the two disagree and the conversation falls between them.
  await mountShell();
  const today = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((item) => item.dataset["surface"] === "today");
  assert.ok(today, "the shell offers no Today destination to open a task from");
  await act(async () => {
    today.click();
  });
  await waitForCondition(
    () => container.querySelector("[data-planned-row]") !== null,
    "Today drew no planned work, so this measures nothing",
  );
  const planned = container.querySelector<HTMLElement>("[data-planned-row]");
  assert.ok(planned, "Today drew no planned work, so this measures nothing");
  await act(async () => {
    planned.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });

  assertNoNode(
    container.querySelector('[data-record-kind="task"]'),
    "opening a task from Today promoted it to a record nobody asked for",
  );
  await waitForCondition(
    () => composers().length > 0,
    "a task reached without the record lost its comments from both places",
  );
});

test("a task past the capped page still takes a comment, or offers no field", async () => {
  // `task.list` pages at fifty or a hundred; `work.overview` does not. So a
  // record can open on a task the capped list never returned — and the version
  // a comment write is checked against used to be read only from that list.
  //
  // The composer's own grant is a workspace reading, not a per-task one, so it
  // rendered live and enabled over a write that could not name a version and
  // answered false without a word. A field that takes your text and sends
  // nothing is worse than no field: the next attempt is a retype, not a retry.
  await mountShell(
    {
      "task.list": projectionResponse({
        kind: "task.list",
        items: taskItems.filter((item) => item.id !== openedTaskId),
        nextCursor: null,
      }),
    },
    true,
  );
  await openTasks();
  await act(async () => {
    rowFor(openedTaskId).dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
  });
  await waitForCondition(
    () => container.querySelector('[data-record-kind="task"]') !== null,
    "a task the capped list never returned could not be opened at all",
  );
  await openComments();

  const field = composers()[0];
  assert.ok(field, "the record past the capped page offers no composer at all");
  await typeInto(field, "Czy sponsorka podpisała zakres?");
  await submit(field);

  const written = commentAdds().at(-1);
  assert.ok(
    written,
    "the composer accepted the text and issued no command — the dead field this test exists for",
  );
  assert.deepEqual(
    written["target"],
    { kind: "task", taskId: openedTaskId },
    "the comment reached the kernel against a different record than the one on screen",
  );
  // Identity, not merely "a number is present": the uncapped projection is the
  // only place this version can now come from, and naming another task's would
  // be refused by the kernel for a reason nobody could explain.
  const expected = commentAddVersions().at(-1);
  assert.equal(
    expected?.[openedTaskId],
    taskItems.find((item) => item.id === openedTaskId)?.version,
    "the write carried a version that did not come from the projection the record opened from",
  );
});

test("an answer written under a thread is stored as an answer to it", async () => {
  await openRecord();
  const opened = await openComments();

  // Started from the thread on screen, never from the panel's own callback.
  // The screen forwards FOUR arguments to the composer's submit, and a
  // two-parameter function is assignable to that prop while dropping the last
  // two — which is what shipped once: every answer landed as a fresh thread
  // and the staged files went with it. Nothing on screen changes when that
  // happens, so the payload is the only place the defect is visible.
  const thread = opened.querySelector<HTMLElement>(
    `[data-thread-root="${openRootId}"]`,
  );
  assert.ok(thread, "the open thread this test answers was never drawn");
  const reply = buttonIn(thread, "Reply");
  assert.ok(reply, "the task record offers no way to answer a thread");
  await act(async () => {
    reply.click();
  });

  const field = composers()[0];
  assert.ok(field, "the composer disappeared when a thread was answered");
  // The composer PROMISES it is answering that thread; without this the payload
  // assertion would be about a promise nobody made.
  assert.equal(
    field.closest("form")?.getAttribute("aria-label"),
    "Reply in the thread by Kacper",
  );
  await typeInto(field, "Tak, oddział w Gdańsku też.");
  await submit(field);

  const answer = commentAdds().at(-1);
  assert.ok(answer, "answering a thread issued no command at all");
  assert.equal(
    answer["parentCommentId"],
    openRootId,
    "the answer reached the kernel as a new thread instead of an answer",
  );
  assert.equal(answer["body"], "Tak, oddział w Gdańsku też.");
  assert.deepEqual(answer["target"], { kind: "task", taskId: openedTaskId });
});

test("the count beside Comments is what is still open on the task", async () => {
  await openRecord();
  // One open root, one answer under it, one settled root. Three readings, three
  // DIFFERENT numbers — so a count of comments (3) or a count of roots (2) is
  // not merely wrong, it is visibly wrong. A fixture of one open root and one
  // settled root makes two of those readings agree.
  await waitForCondition(
    () => tabNamed("comments").textContent === "Comments1",
    `the tab counts something other than open threads: ${tabNamed("comments").textContent}`,
  );
});

test("a conversation that could not be read says why and still lets you write", async () => {
  await openRecord(openedTaskId, { "comment.list": refused });
  await openTab("comments");

  // No number is not a zero. A read that never landed has nothing to count, and
  // "Comments 0" beside a message saying the conversation could not be read is
  // a claim with nothing behind it.
  await waitForCondition(
    () => tabNamed("comments").textContent === "Comments",
    "a conversation that could not be read is still being counted",
  );

  // The reason, and the reason this read gave — not one sentence covering every
  // cause. Scoped to the record: the rail stands down for this exact state, so
  // an unscoped query would be measuring nothing here and everything later.
  await waitForCondition(
    () =>
      record()
        .querySelector('[role="status"]')
        ?.textContent?.includes("refused an invalid query") === true,
    "a conversation that could not be read is drawn exactly like an empty one",
  );

  // AND the composer. The write does not depend on the read — it is checked
  // against the TASK's version, which this slice does not carry — so losing the
  // list must not cost the reader the ability to write. Saying the reason
  // INSTEAD of the panel is what left a member with `comment` access looking at
  // a sentence and nothing to type into.
  const field = composers()[0];
  assert.ok(
    field,
    "a failed comment read also took away the ability to write one",
  );
  assert.ok(record().contains(field));
  await typeInto(field, "Piszę mimo to.");
  await submit(field);
  const written = commentAdds().at(-1);
  assert.ok(
    written,
    "the composer survived a failed read but sends nothing when used",
  );
  assert.deepEqual(written["target"], { kind: "task", taskId: openedTaskId });
});

test("the work this task splits into is on screen and openable", async () => {
  const opened = await openRecord();

  // Upward and downward off the one hierarchy the model has. Both directions,
  // because a screen drawing only children tells a reader nested three deep
  // that they are at the top.
  const up = rowNamed(opened, PARENT_TITLE);
  assert.ok(up, "the record does not say which work this task is part of");
  assert.ok(
    (up.textContent ?? "").includes("part of"),
    "the parent row does not say which way it points",
  );
  const done = rowNamed(opened, CHILD_DONE_TITLE);
  const openChild = rowNamed(opened, CHILD_OPEN_TITLE);
  assert.ok(done && openChild, "the record does not list both subtasks");
  // Shape, not colour: a finished subtask carries a different glyph, and the
  // word is beside it. A fixture with only open children could not tell the two
  // apart at all.
  assert.ok(
    (done.textContent ?? "").includes("completed"),
    "a finished subtask is told apart from a live one by colour alone",
  );
  assert.ok(!(openChild.textContent ?? "").includes("completed"));

  // Openable, and the one that was clicked is the one that opens. A pair of
  // rows wired to the same id passes every assertion about their existence.
  assert.equal(openChild.localName, "button");
  await act(async () => {
    openChild.click();
  });
  await waitForCondition(
    () =>
      container.querySelector('[data-record-kind="task"] h1')?.textContent ===
      CHILD_OPEN_TITLE,
    "clicking a subtask did not open that subtask",
  );
});

test("both directions of a dependency are on screen, said in words", async () => {
  const opened = await openRecord();

  // The DIRECTION is on each row, in words. Two lists one under the other,
  // told apart by position alone, are one list to anybody hearing them read —
  // and swapping the two sides keeps every count identical, which is why this
  // is asserted per row rather than as "two dependencies are drawn".
  const waitsFor = rowNamed(opened, BLOCKER_TITLE);
  assert.ok(waitsFor, "the task the work waits for is not on the record");
  assert.ok(
    (waitsFor.textContent ?? "").includes("this task depends on it"),
    "the row for the task this one waits for is pointing the other way",
  );
  const waitingOnThis = rowNamed(opened, DEPENDENT_TITLE);
  assert.ok(waitingOnThis, "the task waiting on this one is not on the record");
  assert.ok(
    (waitingOnThis.textContent ?? "").includes("it depends on this task"),
    "the row for the task waiting on this one is pointing the other way",
  );

  // A dependency somebody REMOVED stays removed. `work.linkRemove` flips the
  // link's state and leaves the record, so the query keeps answering with it
  // forever; drawing it would tell a reader the work is still blocked by
  // something that was unblocked.
  assertNoNode(
    rowNamed(opened, DROPPED_TITLE),
    "a dependency that was removed is still drawn as if it held",
  );

  // And it opens, from here. This reading lived only on a surface scheduled for
  // retirement, so this record is now the only place a dependency is read at
  // all.
  assert.equal(waitsFor.localName, "button");
  await act(async () => {
    waitsFor.click();
  });
  await waitForCondition(
    () =>
      container.querySelector('[data-record-kind="task"] h1')?.textContent ===
      BLOCKER_TITLE,
    "a dependency cannot be opened from the record that names it",
  );
});

/* ── AUTHORING ────────────────────────────────────────────────────────────
   The two operations the retired work surface was the only home for. They are
   asserted through the PAYLOAD and not through the screen: a panel that redraws
   itself and a panel that SENDS what was chosen look identical, and every defect
   these guard against is one where the screen looked right. */

/** The popover trigger, by the name a reader sees on it. */
const openPopoverNamed = async (
  scope: ParentNode,
  label: string,
): Promise<HTMLElement> => {
  const trigger = [...scope.querySelectorAll<HTMLElement>("button")].find(
    (button) => (button.textContent ?? "").trim().startsWith(label),
  );
  assert.ok(trigger, `the record offers no control named ${label}`);
  await act(async () => {
    trigger.click();
  });
  // Portaled to <body>, so it is deliberately NOT looked for inside the record.
  const dialog = document.body.querySelector<HTMLElement>(
    '[role="dialog"].inline-popover',
  );
  assert.ok(dialog, `${label} opened nothing`);
  return dialog;
};

/** React's own value tracker swallows a plain assignment, so a test that skipped
 *  the native setter would assert about the value the control started with. */
const setValue = async (
  field: HTMLInputElement | HTMLSelectElement,
  value: string,
): Promise<void> => {
  await act(async () => {
    const prototype =
      field instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      field,
      value,
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const controlNamed = <Element extends HTMLElement>(
  scope: ParentNode,
  id: string,
): Element => {
  const found = scope.querySelector<Element>(`#${id}`);
  assert.ok(found, `the panel drew no control with id ${id}`);
  return found;
};

const lastCommand = (name: string) => {
  const found = [...issued].reverse().find((command) => command.name === name);
  assert.ok(found, `nothing issued a ${name} command`);
  return found;
};

const submitFormOf = async (field: HTMLElement): Promise<void> => {
  await act(async () => {
    field
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

test("setting a task to waiting sends who, which way round, and until when", async () => {
  const opened = await openRecord();
  const dialog = await openPopoverNamed(opened, "State:");

  await setValue(
    controlNamed<HTMLInputElement>(dialog, "task-waiting-label"),
    "Marta z prawnego",
  );
  await setValue(
    controlNamed<HTMLSelectElement>(dialog, "task-waiting-direction"),
    "we_owe",
  );
  await setValue(
    controlNamed<HTMLInputElement>(dialog, "task-waiting-expected"),
    "2026-08-12",
  );

  await act(async () => {
    buttonIn(dialog, "Set waiting")?.click();
  });

  const command = lastCommand("task.setOperationalState");
  assert.equal(command.payload.operationalState, "waiting");
  // All THREE parts, not just the label. Each one is separately droppable in
  // the assembly, and each drop leaves a command the kernel still accepts.
  assert.deepEqual(command.payload.waitingOn, {
    kind: "external",
    label: "Marta z prawnego",
    direction: "we_owe",
    // End of that day in the workspace zone: a review date is a deadline for
    // looking again, so it is not due until the day is over.
    expectedAt: "2026-08-12T21:59:59.999Z",
  });
  // The version this write is checked against does not travel in the payload,
  // and it is the WORK plane's — the one this screen holds and the inspector
  // rail, which carries a `task.list` item, does not have.
  assert.equal(command.expectedVersions[openedTaskId], 3);
});

test("changing only the review date keeps the reason and the direction already recorded", async () => {
  // A task that is ALREADY waiting, with the whole composite on it.
  const opened = await openRecord(blockerTaskId);
  const dialog = await openPopoverNamed(opened, "State:");

  // Seeded from the record rather than from empty, so a reader can see what is
  // stored before touching anything.
  assert.equal(
    controlNamed<HTMLInputElement>(dialog, "task-waiting-label").value,
    "Sponsorka — decyzja o budżecie",
  );

  await setValue(
    controlNamed<HTMLInputElement>(dialog, "task-waiting-expected"),
    "2026-09-01",
  );
  await act(async () => {
    buttonIn(dialog, "Set waiting")?.click();
  });

  // The kernel replaces `waitingOn` WHOLESALE. Drafts seeded empty would send a
  // composite with the reason missing and quietly erase what somebody wrote.
  assert.deepEqual(lastCommand("task.setOperationalState").payload.waitingOn, {
    kind: "external",
    label: "Sponsorka — decyzja o budżecie",
    direction: "waiting_on_them",
    expectedAt: "2026-09-01T21:59:59.999Z",
  });
});

test("actionable clears the recorded reason, and says so before the click", async () => {
  const opened = await openRecord(blockerTaskId);
  const dialog = await openPopoverNamed(opened, "State:");

  // The panel says what the button does. This one erases writing, and a toast
  // afterwards is not a warning.
  assert.ok(
    (dialog.textContent ?? "").includes(
      "Actionable clears who this task waits on",
    ),
    "the button that erases a recorded reason does not say so",
  );

  await act(async () => {
    buttonIn(dialog, "Actionable")?.click();
  });

  const command = lastCommand("task.setOperationalState");
  assert.equal(command.payload.operationalState, "actionable");
  // Break-tested, and the result is worth writing down: this needs BOTH guards
  // broken before it goes red — the panel passing a label to a non-waiting
  // state, AND `setTaskOperationalState` dropping its `operationalState ===
  // "waiting"` condition. Either one alone keeps the payload clean, so a single
  // mutation of either file comes back green. That is a double guard rather
  // than a decorative assertion, and it is said here because a later reader
  // testing one half would otherwise conclude this measures nothing.
  assert.equal(
    "waitingOn" in command.payload,
    false,
    "clearing the state carried the old reason along with it",
  );
});

test("a dependency is added in the direction the record reads it back", async () => {
  const opened = await openRecord();
  const dialog = await openPopoverNamed(opened, "Edit dependencies");

  const picker = controlNamed<HTMLSelectElement>(dialog, "task-dependency");
  const offered = [...picker.options].map((option) => option.textContent);
  // Refusing after the click is a rule the reader has to discover first.
  // Neither the task itself nor a task it is already linked to is on offer.
  assert.equal(
    offered.includes(OPENED_TITLE),
    false,
    "the task is offered as its own dependency",
  );
  assert.equal(
    offered.includes(BLOCKER_TITLE),
    false,
    "a task this one already depends on is offered a second time",
  );
  assert.equal(
    offered.includes(DEPENDENT_TITLE),
    false,
    "a task already depending on this one is offered as a dependency of it",
  );
  assert.ok(
    offered.includes(OTHER_TITLE),
    "no unlinked task is offered at all",
  );

  await setValue(picker, otherTaskId);
  await submitFormOf(picker);

  const command = lastCommand("work.linkCreate");
  assert.equal(command.payload.linkType, "task_depends_on_task");
  // Source depends on target. Reversed, the link still draws — under the OTHER
  // heading, with confident wording and identical counts, which no assertion
  // about the NUMBER of dependencies could ever see.
  assert.equal(command.payload.sourceRecordId, openedTaskId);
  assert.equal(command.payload.targetRecordId, otherTaskId);
  // The Space the kernel checks both ends against, named by the caller: the
  // opened task's own, read off `task.list`, not the workspace's first.
  assert.equal(command.payload.spaceId, spaceId);
  // The one command on this page whose kernel branch asserts an EMPTY expected
  // version map — naming a version is a rejection, not a stricter check.
  assert.deepEqual(command.expectedVersions, {});
});

test("a dependency can be taken off, from either side, at the version it is on", async () => {
  const opened = await openRecord();
  const dialog = await openPopoverNamed(opened, "Edit dependencies");

  // Both directions are detachable and each says which one it is: the edge is
  // one record, and the task at the other end of "it depends on this task" is
  // just as entitled to have it taken off. Until this, nothing anywhere in the
  // product could detach a task dependency at all.
  const rows = [...dialog.querySelectorAll("li")];
  const outgoing = rows.find((row) =>
    (row.textContent ?? "").includes(BLOCKER_TITLE),
  );
  const incoming = rows.find((row) =>
    (row.textContent ?? "").includes(DEPENDENT_TITLE),
  );
  assert.ok(outgoing, "the dependency this task waits for cannot be detached");
  assert.ok(incoming, "the dependency waiting on this task cannot be detached");
  assert.ok(
    (outgoing.textContent ?? "").includes("this task depends on it"),
    "the detach row does not say which way the link points",
  );
  // A link somebody already removed is not offered for removal a second time.
  assert.equal(
    rows.some((row) => (row.textContent ?? "").includes(DROPPED_TITLE)),
    false,
    "a dependency that was already detached is offered for detaching",
  );

  await act(async () => {
    outgoing.querySelector("button")?.click();
  });

  const command = lastCommand("work.linkRemove");
  assert.equal(
    command.payload.linkId,
    "00000000-0000-4000-8000-00000000ed01",
    "detaching took off a different link than the row that was clicked",
  );
  // The LINK's own version and nothing else — the mirror of `work.linkCreate`
  // just above, which refuses one.
  assert.deepEqual(command.expectedVersions, {
    "00000000-0000-4000-8000-00000000ed01": 1,
  });
});
