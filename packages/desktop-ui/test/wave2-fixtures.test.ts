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
    // The fixture is deterministic by contract, so its order is pinned on the
    // stable record ids, never on the display titles: a title is interface
    // copy and carries no guarantee once it is read as a label. Pinning the
    // whole sequence states the ordering claim for every element — not just
    // the first — and keeps the `every` assertions below from passing
    // vacuously on an empty list.
    assert.deepEqual(
      projects.map((project) => project.id),
      ["project-offer", "project-alpha"],
    );
    // "Fully explained" = every narrative field a project screen needs is
    // actually filled. Language-agnostic: only that the text exists.
    assert.ok(projects.every((project) => project.title.length > 0));
    assert.ok(projects.every((project) => project.outcome.length > 0));
    assert.ok(projects.every((project) => project.state.length > 0));
    assert.ok(projects.every((project) => project.nextAction.length > 0));
    assert.ok(projects.every((project) => project.deadline.length > 0));
  });

  it("groups real snapshot records before synthetic search evidence", () => {
    const results = buildSearchFixtures(snapshot);
    const snapshotIds = new Set<string>([
      ...snapshot.tasks.map((task) => task.id),
      ...snapshot.captures.map((capture) => capture.id),
    ]);
    const realIndexes = results.flatMap((result, index) =>
      snapshotIds.has(result.id) ? [index] : [],
    );
    const syntheticIndexes = results.flatMap((result, index) =>
      snapshotIds.has(result.id) ? [] : [index],
    );

    // Both counterparts have to be present, or the ordering claim below is
    // decided by an empty spread (±Infinity) instead of by the data.
    assert.equal(realIndexes.length, snapshotIds.size);
    assert.ok(syntheticIndexes.length > 0);
    assert.ok(Math.min(...syntheticIndexes) > Math.max(...realIndexes));

    // The real records lead in snapshot order — tasks, then captures — and
    // each one keeps the classification that decides how it reads and where it
    // opens. Those are contract enums, not copy, so they are asserted as
    // literals: a task labelled "Capture", or one that opens the history
    // surface, is a defect no title check would catch.
    assert.deepEqual(
      results.slice(0, 2).map((result) => ({
        id: result.id,
        kind: result.kind,
        group: result.group,
        surface: result.surface,
      })),
      [
        { id: "task-1", kind: "Task", group: "Work", surface: "tasks" },
        {
          id: "capture-1",
          kind: "Capture",
          group: "Capture",
          // Wrzutka otwiera się w Bibliotece: `history` przestał być celem.
          surface: "library",
        },
      ],
    );
    // Record content is user data, so it stays in whatever language the record
    // was written in; the assertion compares against the input rather than
    // against a literal, which still catches a wrongly mapped field.
    assert.equal(results[0]?.title, snapshot.tasks[0]?.title);
    assert.equal(results[1]?.title, snapshot.captures[0]?.originalText);
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
