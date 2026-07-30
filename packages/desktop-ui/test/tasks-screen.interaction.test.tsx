import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  populatedShellQueries,
  populatedWorkOverview,
  projectionResponse,
} from "./shell-fixture.js";

/** The shared work fixture maps EVERY task to `operationalState: "actionable"`,
 *  so the row that used to lose a cell is not in it — and the cell-count
 *  assertion would pass over a list that never had a gap. Two tasks are given
 *  the states that make a row draw its state and priority cells, which is the
 *  only condition under which that assertion can fail at all. */
/** Two tasks that `work.overview` carries and `task.list` does not. Without
 *  them the two projections agree in this fixture, and the badge assertion
 *  passes whichever one the sidebar reads — which is exactly the state the real
 *  workspace was NOT in: `task.list` stops at a hundred and it held a hundred
 *  and fifty-seven. Verified by putting the capped projection back and watching
 *  this file stay green until these existed. */
const beyondTheCap = [0, 1].map((offset) => ({
  ...populatedWorkOverview.tasks[0]!,
  id: `00000000-0000-4000-8000-00000000fa0${offset}`,
  title: `Poza setką ${offset}`,
}));

const work = {
  ...populatedWorkOverview,
  tasks: [
    ...populatedWorkOverview.tasks.map((task, index) =>
      index === 0
        ? {
            ...task,
            operationalState: "waiting" as const,
            priority: "high" as const,
          }
        : index === 1
          ? { ...task, operationalState: "blocked" as const }
          : task,
    ),
    ...beyondTheCap,
  ],
};

const queries = {
  ...populatedShellQueries,
  "work.overview": projectionResponse(work),
};

// Two guarantees the Tasks screen lost against fixtures and gave up on real
// records. Neither is about how the screen looks; both are about it agreeing
// with itself.
//
//   1. EVERY ROW DRAWS THE SAME CELLS. The rows are a grid with one track per
//      cell, and two of the cells used to be conditional — the operational
//      state and the priority. A row about ordinary actionable work therefore
//      rendered seven cells into a nine-track grid, and everything after the
//      gap moved one column left. On a fixture whose rows all look alike this
//      is invisible; on a hundred and fifty-seven real tasks no two rows lined
//      up, and one row's title sat in the middle of the screen.
//
//      Asserted as EQUAL CELL COUNTS, not as pixels: happy-dom computes no
//      layout, so an assertion about column positions here would measure
//      nothing while looking like a measurement. The equal count is the
//      structural fact that the misalignment follows from.
//
//   2. THE BADGE COUNTS WHAT THE SCREEN COUNTS. The sidebar read
//      `snapshot.tasks`, which is `task.list` and stops at a hundred, beside a
//      screen reading `work.overview`, which is whole-Space and uncapped. On a
//      real workspace that was "100" in the sidebar and "157 tasks" on the
//      screen, a finger apart.

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
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

const openTasks = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries });
  const snapshot = await loadDesktopSnapshot(client);
  assert.equal(
    snapshot.work.kind,
    "ready",
    "the work fixture never reached the snapshot, so this measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
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

test("every task row draws the same cells, whatever the task is like", async () => {
  await openTasks();
  const rows = [...container.querySelectorAll<HTMLElement>("[data-task-row]")];
  assert.ok(rows.length >= 3, `only ${rows.length} rows — too few to compare`);

  // The fixture has to contain the rows that used to differ, or this passes
  // over a list that never had a gap in it.
  const labels = rows.map((row) => row.getAttribute("aria-label") ?? "");
  assert.ok(
    labels.some((label) => /waiting|blocked/u.test(label)) &&
      labels.some((label) => !/waiting|blocked/u.test(label)),
    "no row is in a non-ordinary operational state, so the missing-cell case is not represented",
  );

  const counts = new Set(rows.map((row) => row.childElementCount));
  assert.equal(
    counts.size,
    1,
    `rows draw ${[...counts].sort((a, b) => a - b).join(" and ")} cells — every cell after a missing one moves a column left`,
  );
});

test("the sidebar counts the tasks the screen counts", async () => {
  await openTasks();
  // Scoped to the Tasks destination. `.nav-count` is also worn by the Inbox
  // badge, which sits above it — an unscoped query read the Inbox's number and
  // compared it to the Tasks screen, which is a measurement of nothing.
  const badge = container.querySelector<HTMLElement>(
    '.nav-item[data-surface="tasks"] .nav-count',
  );
  assert.ok(badge, "the Tasks destination carries no count");

  // Both numbers are read off the screen rather than recomputed here: a test
  // that computed the expected count itself would agree with a screen and a
  // sidebar that were both wrong in the same way.
  const stated = [...container.querySelectorAll<HTMLElement>("p")]
    .map((node) => /(\d+) tasks?\b/u.exec(node.textContent ?? "")?.[1])
    .find((match) => match !== undefined);
  assert.ok(stated, "the Tasks screen states no count of its own");
  assert.equal(
    badge.textContent,
    stated,
    "the sidebar and the screen give different answers to one question",
  );

  // And the number is the UNCAPPED one. This fixture deliberately gives
  // `work.overview` two tasks `task.list` does not carry, standing in for the
  // hundred-item cap: without that difference both projections answer the same
  // and the assertion above passes whichever one the sidebar happens to read.
  assert.equal(badge.textContent, String(work.tasks.length));
  assert.notEqual(
    work.tasks.length,
    populatedWorkOverview.tasks.length,
    "the fixture no longer makes the two projections disagree, so this proves nothing",
  );
});
