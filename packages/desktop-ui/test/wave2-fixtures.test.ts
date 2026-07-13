/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DesktopSnapshot } from "../src/client/workflow.js";
import {
  buildSearchFixtures,
  conditionCopy,
  contractRequests,
  projects,
} from "../src/client/wave2-fixtures.js";

const snapshot = {
  build: {
    channel: "developer-preview",
    initialWorkspaceId: "00000000-0000-4000-8000-000000000001",
    persistence: "in-memory",
    version: "scenario",
  },
  bootstrap: {
    kind: "workspace.bootstrapContext",
    workspace: { name: "Interactive alpha" },
  },
  captures: [
    {
      id: "capture-1",
      originalText: "Zapisz wynik przeglądu",
      processingState: "pending_processing",
    },
  ],
  tasks: [
    {
      id: "task-1",
      title: "Przygotuj przegląd",
      status: { label: "W toku" },
    },
  ],
} as unknown as DesktopSnapshot;

describe("Wave 2 deterministic UI fixtures", () => {
  it("keeps operational projects ordered and fully explained", () => {
    assert.equal(projects[0]?.title, "Oferta Northstar");
    assert.ok(projects.every((project) => project.outcome.length > 0));
    assert.ok(projects.every((project) => project.nextAction.length > 0));
  });

  it("groups real snapshot records before synthetic search evidence", () => {
    const results = buildSearchFixtures(snapshot);
    assert.deepEqual(
      results.slice(0, 2).map((result) => [result.kind, result.title]),
      [
        ["Zadanie", "Przygotuj przegląd"],
        ["Capture", "Zapisz wynik przeglądu"],
      ],
    );
  });

  it("provides an action for every unhappy-path preview", () => {
    assert.deepEqual(Object.keys(conditionCopy).sort(), [
      "conflict",
      "offline",
      "partial",
      "permission",
      "recovery",
      "retry",
    ]);
    assert.ok(Object.values(conditionCopy).every((state) => state.action));
  });

  it("records every missing Wave 2 route as a minimal contract request", () => {
    assert.ok(contractRequests.includes("search.global"));
    assert.ok(contractRequests.includes("cockpit.week"));
    assert.ok(contractRequests.includes("command.previewUndo + command.undo"));
  });
});
