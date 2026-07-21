import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DocumentIdSchema,
  ProjectIdSchema,
  TaskIdSchema,
} from "@constellation/contracts";

import {
  activateShellContext,
  activeShellContext,
  closeShellContext,
  createShellNavigation,
  destinationShortcutIndex,
  destinationContext,
  documentContext,
  moveShellHistory,
  navigateShellContext,
  openShellContext,
  openShellContextReportingEviction,
  projectContext,
  pruneInaccessibleShellContexts,
  restoreShellNavigation,
  serializeShellNavigation,
  taskContext,
} from "../src/client/shell-navigation.js";

const taskId = TaskIdSchema.parse("00000000-0000-4000-8000-000000000001");
const projectId = ProjectIdSchema.parse("00000000-0000-4000-8000-000000000002");
const documentId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);

describe("stable shell navigation", () => {
  it("maps every visible destination shortcut, including Meetings and Documents", () => {
    assert.equal(destinationShortcutIndex("Digit1"), 0);
    assert.equal(destinationShortcutIndex("Digit8"), 7);
    assert.equal(destinationShortcutIndex("Digit9"), 8);
    assert.equal(destinationShortcutIndex("Digit0"), undefined);
  });

  it("preserves record contexts across Back and Forward", () => {
    let state = createShellNavigation(destinationContext("cockpit", "Tydzień"));
    state = openShellContext(state, taskContext(taskId, "Zadanie Alpha"));
    state = openShellContext(state, projectContext(projectId, "Projekt Alpha"));
    state = openShellContext(
      state,
      documentContext(documentId, "Dokument Alpha"),
    );

    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).projectId, projectId);
    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).taskId, taskId);
    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).surface, "cockpit");
    state = moveShellHistory(state, 1);
    assert.equal(activeShellContext(state).taskId, taskId);
  });

  it("reuses a context, truncates forward history, and closes safely", () => {
    const cockpit = destinationContext("cockpit", "Tydzień");
    const task = taskContext(taskId, "Zadanie Alpha");
    const project = projectContext(projectId, "Projekt Alpha");
    let state = createShellNavigation(cockpit);
    state = openShellContext(state, task);
    state = openShellContext(state, project);
    state = moveShellHistory(state, -1);
    state = activateShellContext(state, cockpit.key);

    assert.deepEqual(state.history, [cockpit, task, cockpit]);
    assert.equal(state.tabs.length, 3);
    state = closeShellContext(state, cockpit.key);
    assert.equal(activeShellContext(state).key, task.key);
    assert.equal(
      state.tabs.some((tab) => tab.key === cockpit.key),
      false,
    );
  });

  it("re-materializes contexts navigated within one card on Back and Forward", () => {
    const cockpit = destinationContext("cockpit", "Tydzień");
    const task = taskContext(taskId, "Zadanie Alpha");
    const project = projectContext(projectId, "Projekt Alpha");
    let state = createShellNavigation(cockpit);
    state = navigateShellContext(state, task);
    state = navigateShellContext(state, project);
    assert.equal(state.tabs.length, 1);

    state = moveShellHistory(state, -1);
    assert.equal(state.tabs.length, 1);
    assert.equal(activeShellContext(state).key, task.key);
    assert.equal(activeShellContext(state).taskId, taskId);

    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).key, cockpit.key);

    state = moveShellHistory(state, 1);
    assert.equal(activeShellContext(state).key, task.key);
    assert.equal(state.tabs.length, 1);
  });

  it("does not replace another open card on Back after closing a card", () => {
    const cockpit = destinationContext("cockpit", "Tydzień");
    const taskB = taskContext(taskId, "Zadanie B");
    const projectC = projectContext(projectId, "Projekt C");
    let state = createShellNavigation(cockpit);
    state = openShellContext(state, taskB);
    state = openShellContext(state, projectC);
    state = activateShellContext(state, taskB.key);

    // ⌘W zamyka aktywną kartę B; aktywna staje się karta C.
    state = closeShellContext(state, taskB.key);
    assert.deepEqual(
      state.tabs.map((tab) => tab.key),
      [cockpit.key, projectC.key],
    );
    assert.equal(activeShellContext(state).key, projectC.key);

    // Wstecz pomija wpisy zamkniętej karty B zamiast podmieniać kartę C.
    state = moveShellHistory(state, -1);
    assert.deepEqual(
      state.tabs.map((tab) => tab.key),
      [cockpit.key, projectC.key],
    );
    assert.notEqual(activeShellContext(state).key, taskB.key);

    state = moveShellHistory(state, -1);
    assert.equal(activeShellContext(state).key, cockpit.key);
    assert.deepEqual(
      state.tabs.map((tab) => tab.key),
      [cockpit.key, projectC.key],
    );
  });

  it("reports the silently evicted context when the tab limit overflows", () => {
    let state = createShellNavigation(destinationContext("cockpit", "Tydzień"));
    for (let index = 0; index < 6; index += 1) {
      const id = TaskIdSchema.parse(
        `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      );
      state = openShellContext(state, taskContext(id, `Zadanie ${index + 1}`));
    }
    assert.equal(state.tabs.length, 7);

    const overflowing = taskContext(
      TaskIdSchema.parse("00000000-0000-4000-8000-000000000099"),
      "Zadanie przepełniające",
    );
    const outcome = openShellContextReportingEviction(state, overflowing);
    assert.equal(outcome.state.tabs.length, 7);
    assert.ok(outcome.evictedContext);
    assert.equal(
      outcome.state.tabs.some((tab) => tab.key === outcome.evictedContext?.key),
      false,
    );

    const restored = openShellContext(outcome.state, outcome.evictedContext!);
    assert.equal(activeShellContext(restored).key, outcome.evictedContext!.key);
  });

  it("bounds open contexts without evicting the current context", () => {
    let state = createShellNavigation(destinationContext("cockpit", "Tydzień"));
    for (let index = 0; index < 9; index += 1) {
      const id = TaskIdSchema.parse(
        `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      );
      state = openShellContext(state, taskContext(id, `Zadanie ${index + 1}`));
    }
    assert.ok(state.tabs.length <= 7);
    assert.ok(state.tabs.some((tab) => tab.key === state.activeKey));
  });

  it("restores bounded tabs and rejects corrupt or unknown destinations", () => {
    let state = createShellNavigation(destinationContext("work", "Praca"));
    state = openShellContext(state, taskContext(taskId, "Zadanie Alpha"));
    const restored = restoreShellNavigation(
      serializeShellNavigation(state),
      destinationContext("cockpit", "Tydzień"),
    );
    assert.equal(activeShellContext(restored).taskId, taskId);
    assert.equal(
      activeShellContext(
        restoreShellNavigation(
          '{"version":1,"state":{"tabs":[{"key":"x","label":"X","surface":"unknown"}]}}',
          destinationContext("cockpit", "Tydzień"),
        ),
      ).surface,
      "cockpit",
    );
  });

  it("removes inaccessible record titles and IDs after reauthorization", () => {
    const cockpit = destinationContext("cockpit", "Tydzień");
    let state = createShellNavigation(cockpit);
    state = openShellContext(state, taskContext(taskId, "Poufne zadanie"));
    state = openShellContext(
      state,
      projectContext(projectId, "Poufny projekt"),
    );

    const pruned = pruneInaccessibleShellContexts(
      state,
      {
        taskIds: new Set(),
        projectIds: new Set(),
        documentIds: new Set(),
      },
      cockpit,
    );

    assert.deepEqual(pruned.tabs, [cockpit]);
    assert.deepEqual(pruned.history, [cockpit]);
    assert.equal(pruned.activeKey, cockpit.key);
    assert.doesNotMatch(serializeShellNavigation(pruned), /Poufne|00000000/);
  });
});
