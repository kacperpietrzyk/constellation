import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ProjectIdSchema, TaskIdSchema } from "@constellation/contracts";

import {
  activateShellContext,
  activeShellContext,
  closeShellContext,
  createShellNavigation,
  destinationContext,
  moveShellHistory,
  openShellContext,
  projectContext,
  taskContext,
} from "../src/client/shell-navigation.js";

const taskId = TaskIdSchema.parse("00000000-0000-4000-8000-000000000001");
const projectId = ProjectIdSchema.parse("00000000-0000-4000-8000-000000000002");

describe("stable shell navigation", () => {
  it("preserves record contexts across Back and Forward", () => {
    let state = createShellNavigation(destinationContext("cockpit", "Tydzień"));
    state = openShellContext(state, taskContext(taskId, "Zadanie Alpha"));
    state = openShellContext(state, projectContext(projectId, "Projekt Alpha"));

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

    assert.deepEqual(state.history, [cockpit.key, task.key, cockpit.key]);
    assert.equal(state.tabs.length, 3);
    state = closeShellContext(state, cockpit.key);
    assert.equal(activeShellContext(state).key, task.key);
    assert.equal(
      state.tabs.some((tab) => tab.key === cockpit.key),
      false,
    );
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
});
