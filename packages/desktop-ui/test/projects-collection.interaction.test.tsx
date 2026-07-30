import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import {
  ProjectIdSchema,
  type QueryProjection,
} from "@constellation/contracts";

/** Same narrowing the shared fixture uses: a literal typed by the contract, so
 *  a projection change breaks the fixture at the compiler rather than letting
 *  it describe a world that does not exist. */
type Projection<Kind extends QueryProjection["kind"]> = Extract<
  QueryProjection,
  { kind: Kind }
>;

import { assertNoNode } from "./dom-assert.js";
import {
  populatedPlanDayKey,
  populatedShellQueries,
  projectionResponse,
  spaceId,
} from "./shell-fixture.js";

// The guarantee this file carries used to be pinned by regexing
// `Wave2Surfaces.tsx` for `className="project-portfolio"` and
// `...projectNav(index)`. That assertion measured MARKUP, so it went red the
// moment the collection was rebuilt — while proving nothing about what the
// screen does. The guarantee itself is behavioural and survives any rewrite:
//
//   Projects stays a COLLECTION until somebody deliberately opens one, and
//   the lens switcher changes how the collection is drawn, never what is in it.
//
// It is asserted from a click in the navigation, not from the screen's own
// callback: the shell is what decides between the collection and the full
// view, so a test that mounted only the collection would prove nothing about
// the application.

// A fixture built for ONE purpose: to make the lenses disagree about order.
//
// The shared populated fixture carries two projects, neither with a client and
// neither with a deadline, so the severity order and the by-client order come
// out identical — and an assertion about the two agreeing passes whether the
// screen orders its rows correctly or not at all. Verified by breaking it: with
// the shared fixture, deleting the surface's ordering entirely left this file
// green.
//
// These four make the collection's own order and the list lens's drawn order
// come apart, which is the only condition under which the keyboard assertion
// below is able to fail at all.
const project = (
  suffix: string,
  title: string,
  updatedAt: string,
  dueAt?: string,
): Projection<"project.list">["items"][number] => ({
  id: ProjectIdSchema.parse(`00000000-0000-4000-8000-0000000009${suffix}`),
  spaceId,
  title,
  intendedOutcome: `Cel projektu ${title}.`,
  needsReview: false,
  lifecycle: "active",
  relatedOpenTaskCount: 1,
  version: 1,
  updatedAt,
  ...(dueAt === undefined ? {} : { dueAt }),
});

const NOW = "2026-08-03T08:00:00.000Z";
const ALPHA = project("01", "Alpha, przeterminowana", NOW);
const BRAVO = project("02", "Bravo, ucichla", "2026-07-01T08:00:00.000Z");
// Both read "No signal", so they share a group — and their deadlines run the
// OTHER way round from their titles. The collection is ordered by severity then
// title, the list lens orders inside a group by deadline, so these two are
// drawn in the opposite order to the one they arrive in. That is the divergence
// the keyboard assertion needs in order to be able to fail at all.
const CHARLIE = project(
  "03",
  "Charlie, bez zadan",
  NOW,
  "2026-12-01T10:00:00.000Z",
);
const DELTA = project(
  "04",
  "Delta, bez zadan",
  NOW,
  "2026-09-01T10:00:00.000Z",
);

const spread = {
  ...populatedShellQueries,
  "project.list": projectionResponse({
    kind: "project.list",
    items: [ALPHA, BRAVO, CHARLIE, DELTA],
  }),
  "work.overview": projectionResponse({
    kind: "work.overview",
    // ALPHA holds a task past its date, so it reads At risk. BRAVO holds one
    // that moved a month ago and nothing else, so it reads Watch. CHARLIE and
    // DELTA hold none at all, so both read No signal.
    tasks: [
      {
        id: "00000000-0000-4000-8000-0000000009a1",
        title: "Zaległe",
        statusId: "00000000-0000-4000-8000-000000000002",
        operationalState: "actionable",
        completionState: "open",
        dueAt: "2026-07-01T10:00:00.000Z",
        projectIds: [ALPHA.id],
        version: 1,
        updatedAt: "2026-08-03T08:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-0000000009a2",
        title: "Cisza",
        statusId: "00000000-0000-4000-8000-000000000002",
        operationalState: "actionable",
        completionState: "open",
        projectIds: [BRAVO.id],
        version: 1,
        updatedAt: "2026-07-01T08:00:00.000Z",
      },
    ],
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
  }),
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
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

const mountShell = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: spread });
  const snapshot = await loadDesktopSnapshot(client);
  assert.equal(
    snapshot.projects.kind,
    "ready",
    "the project fixture never reached the snapshot, so this measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
};

const openProjects = async (): Promise<HTMLElement> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "projects");
  assert.ok(item, "no navigation target rendered for Projects");
  await act(async () => {
    item.click();
  });
  await waitForCondition(
    () => container.querySelectorAll("[data-project-row]").length > 0,
    "Projects never drew a single row into the work plane",
  );
  const main = container.querySelector<HTMLElement>("main[data-surface]");
  assert.ok(main, "the shell rendered no main landmark");
  return main;
};

const rows = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>("[data-project-row]"),
];

test("Projects opens as a collection, not as one project", async () => {
  await mountShell();
  const main = await openProjects();
  assert.ok(rows().length > 1, "a collection of one row is not a collection");
  // The record screen is what an opened project renders. Landing straight in
  // it would mean the destination silently restored a record instead of the
  // set.
  //
  // Anchored on `data-record-kind`, not on a class name. This assertion spent
  // a session querying `.project-detail-flow` after the view that wrote it was
  // deleted: it passed on every run, its message described a condition it could
  // no longer detect, and an empty measurement looks exactly like a passing
  // one. `assertNoNode` rather than `assert.equal(node, null, …)` — a DOM node
  // inside an AssertionError kills the Vitest worker without a message.
  assertNoNode(
    main.querySelector('[data-record-kind="project"]'),
    "Projects opened straight into a single project's record",
  );
});

test("every lens draws the same collection, only differently", async () => {
  await mountShell();
  await openProjects();
  const lenses = [...container.querySelectorAll<HTMLElement>("[data-layout]")];
  assert.equal(lenses.length, 3, "the three lenses are not all offered");

  const identity = (): string =>
    rows()
      .map((row) => row.dataset.projectRow ?? "")
      .sort()
      .join("|");
  const first = identity();
  assert.ok(first.length > 0, "no row carried an identity to compare");

  for (const lens of lenses) {
    await act(async () => {
      lens.click();
    });
    await waitForCondition(
      () => rows().length > 0,
      `the ${lens.dataset.layout ?? "?"} lens drew no rows`,
    );
    assert.equal(
      identity(),
      first,
      `the ${lens.dataset.layout ?? "?"} lens changed WHAT is in the collection`,
    );
  }
});

test("the roving tab stop opens the project it is actually on", async () => {
  await mountShell();
  await openProjects();
  // The defect this catches: the surface numbering its rows in one order while
  // a grouped lens draws them in another. Enter then opens a DIFFERENT project
  // than the focused one — silently, and only from the keyboard, because a
  // mouse click passes an id and looks perfectly correct beside it.
  for (const lens of container.querySelectorAll<HTMLElement>("[data-layout]")) {
    await act(async () => {
      lens.click();
    });
    await waitForCondition(
      () => rows().length > 0,
      `the ${lens.dataset.layout ?? "?"} lens drew no rows`,
    );
    const drawn = rows();
    const stops = drawn.filter((row) => row.tabIndex === 0);
    assert.equal(
      stops.length,
      1,
      `the ${lens.dataset.layout ?? "?"} lens holds ${stops.length} tab stops`,
    );
    // Walk to the last row, then open it. The row the keyboard lands on and
    // the project that opens must be the same one.
    const last = drawn[drawn.length - 1];
    assert.ok(last, "the lens drew no rows to walk to");
    await act(async () => {
      drawn[0]?.focus();
      drawn[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
    });
    assert.equal(
      document.activeElement,
      last,
      `End did not reach the last row of the ${lens.dataset.layout ?? "?"} lens`,
    );
    await act(async () => {
      last.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await waitForCondition(
      () =>
        container.querySelector<HTMLElement>(
          ".shell-tab.active [data-shell-tab]",
        ) !== null,
      "opening a project from the keyboard opened no context at all",
    );
    const opened = container.querySelector<HTMLElement>(
      ".shell-tab.active [data-shell-tab]",
    );
    assert.ok(
      opened?.dataset.shellTab?.includes(last.dataset.projectRow ?? " "),
      `the ${lens.dataset.layout ?? "?"} lens opened a project other than the focused row`,
    );
    // Back to the collection for the next lens.
    await act(async () => {
      [...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]")]
        .find((node) => node.dataset.surface === "projects")
        ?.click();
    });
    await waitForCondition(
      () => rows().length > 0,
      "returning to Projects drew no rows",
    );
  }
});
