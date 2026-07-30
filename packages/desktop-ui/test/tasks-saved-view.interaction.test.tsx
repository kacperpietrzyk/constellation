import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  assigneeBoardViewId,
  fieldGroupedViewId,
  savedViewShellQueries,
} from "./shell-fixture.js";

// A saved view is a stored answer to "how do I want to look at this work".
// Tasks read one third of that answer — the filters — and dropped the rest:
// `groupBy` and `layout` were read NOWHERE under `src/tasks/`, so a view its
// owner stored as a board grouped by assignee opened as an ungrouped list and
// said nothing about the difference. The stored view was lying about itself.
//
// Nothing in the suite could see it. Every fixture in the repo ships
// `savedViews: []`, and `TasksSurface` had no mounted coverage of any kind, so
// the whole feature could have been deleted with a green gate.
//
// Driven from the shell, not from the component. The defect was never inside
// `groupTasks` — it was that nobody handed it what the view said. A component
// test given the grouping directly would have passed throughout the outage.

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
  const client = createScenarioClient({ queries: savedViewShellQueries });
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

/** A `<select>` the way a person changes one: React owns the value, so the
 *  native setter has to be used or the component never hears about it. */
const choose = async (selectId: string, value: string): Promise<void> => {
  const select = container.querySelector<HTMLSelectElement>(`#${selectId}`);
  assert.ok(select, `the Tasks view bar carries no #${selectId}`);
  assert.ok(
    [...select.options].some((option) => option.value === value),
    `#${selectId} offers no option ${value}`,
  );
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const boardColumns = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(
    "[data-tasks-surface] [data-board-column]",
  ),
];

/** The column's own name, read off the listbox it wraps rather than off a
 *  class: CSS-module names are hashed in the packaged app, so a class-based
 *  selector here would measure a different build from the one that ships. */
const columnLabel = (column: HTMLElement): string =>
  column.querySelector('[role="listbox"]')?.getAttribute("aria-label") ?? "";

/** Group names in the order they are drawn, in whichever lens is open. Both the
 *  list and the board hang an "Add to …" button off every group heading, which
 *  is the one name-bearing element both share. */
const groupLabels = (): string[] =>
  [
    ...container.querySelectorAll<HTMLElement>(
      "[data-tasks-surface] button[aria-label^='Add to ']",
    ),
  ].map((button) =>
    (button.getAttribute("aria-label") ?? "").slice("Add to ".length),
  );

const layoutButton = (layout: string): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(
    `[data-tasks-surface] [data-layout="${layout}"]`,
  );
  assert.ok(button, `the layout switcher offers no ${layout}`);
  return button;
};

/** What the screen says it is showing. Read off the screen rather than counted
 *  from the fixture: a test that recomputed the number would agree with a lens
 *  that dropped a task and a counter that dropped it too. */
const statedTaskCount = (): number => {
  const status = container.querySelector<HTMLElement>(
    '[data-tasks-surface] p[role="status"]',
  );
  const match = /(\d+) tasks?\b/u.exec(status?.textContent ?? "");
  assert.ok(match, "the Tasks screen states no count of its own");
  return Number(match[1]);
};

test("a view stored as a board grouped by assignee opens as that board", async () => {
  await openTasks();
  assert.equal(
    boardColumns().length,
    0,
    "Tasks already opens as a board, so seeding one from a view proves nothing",
  );

  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => boardColumns().length > 0,
    "a view stored as a board opened as something else",
  );

  assert.deepEqual(
    boardColumns().map(columnLabel),
    ["Kacper", "Marta", "Unassigned"],
    "the columns are not the people the stored view groups by",
  );

  // The cards and the counter are two readings of one question, compared to
  // EACH OTHER: two literals would both stay green if the seeding quietly
  // filtered the set down on the way into the columns.
  const carded = boardColumns().reduce(
    (total, column) =>
      total + column.querySelectorAll("[data-row-title]").length,
    0,
  );
  assert.equal(
    carded,
    statedTaskCount(),
    "the board holds a different number of tasks from the one the screen states",
  );

  assert.equal(
    layoutButton("board").getAttribute("aria-pressed"),
    "true",
    "the switcher and the screen disagree about which lens is open",
  );
});

test("the Board lens is refused with the reason said out loud while grouping is off", async () => {
  await openTasks();
  assert.equal(
    layoutButton("board").disabled,
    false,
    "Board was already refused before grouping was turned off",
  );

  await choose("tasks-group", "none");

  const board = layoutButton("board");
  assert.equal(
    board.disabled,
    true,
    "Board can still be chosen with nothing to make columns out of",
  );
  // The kernel refuses this pair on the resulting record, so a board drawn here
  // would be a screen showing an arrangement that cannot be saved.
  const describedBy = board.getAttribute("aria-describedby");
  assert.ok(describedBy, "the refused Board button points at no reason");
  const reason = document.getElementById(describedBy);
  assert.ok(
    reason,
    "the Board button names a reason that is not on the page — a control greyed out for nothing",
  );
  assert.equal(reason.textContent?.trim(), "Board needs a grouped view.");
});

test("turning grouping off takes the board down rather than drawing one column called All work", async () => {
  await openTasks();
  await choose("tasks-view", assigneeBoardViewId);
  await waitForCondition(
    () => boardColumns().length > 0,
    "a view stored as a board opened as something else",
  );

  await choose("tasks-group", "none");
  await waitForCondition(
    () => container.querySelectorAll("[data-task-row]").length > 0,
    "turning grouping off left the screen with no rows at all",
  );
  assert.equal(
    boardColumns().length,
    0,
    'the board stayed up over a single "All work" column, which is the shape the kernel refuses to store',
  );
});

test("a view grouped by a workspace field draws that field's options, in the order the field declares them", async () => {
  await openTasks();
  await choose("tasks-view", fieldGroupedViewId);
  // Waited on the COUNT, not on "No value" being present: the trailing group
  // appears the instant the field grouping applies, so a half-drawn screen
  // would satisfy a membership test and then fail the comparison below with a
  // diff about the wrong thing.
  const expected = ["Warsztat", "Analiza", "Przegląd", "No value"];
  await waitForCondition(
    () => groupLabels().length === expected.length,
    "a view grouped by a field never settled on the field's own groups",
  );

  // Declared order, and neither alphabetical nor the order the values happen to
  // appear in the rows — the fixture's options differ under all three, so this
  // fails if the groups are built from the data instead of from the definition.
  assert.deepEqual(
    groupLabels(),
    expected,
    "the field's own groups are not what the screen drew",
  );

  // Work carrying no value for the field is SAID, not dropped. A silent
  // collapse would leave the screen quietly showing fewer tasks than it counts.
  assert.equal(
    container.querySelectorAll("[data-tasks-surface] [data-task-row]").length,
    statedTaskCount(),
    "grouping by a field lost a task that has no value for it",
  );
});
