import assert from "node:assert/strict";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { test } from "vitest";

import { ProjectRecordOverview } from "../src/record/ProjectRecordOverview.js";

const project = (id: string, title: string) => ({
  project: {
    id,
    title,
    intendedOutcome: "Outcome",
    needsReview: false,
    version: 1,
  },
  clientOrganizations: [],
  relatedMeetings: [],
  relatedDecisions: [],
  evidenceSources: [],
});

const reading = (id: string, title: string) => ({
  project: { id, title },
  open: [],
  idleDays: 0,
  health: { key: "on_track", label: "On track", why: [] },
  buckets: { done: 0, held: 0, open: 0, total: 0 },
});

test("switching Project closes the check-in composer instead of carrying its draft into another record", async () => {
  const projectA = "00000000-0000-4000-8000-000000000301";
  const projectB = "00000000-0000-4000-8000-000000000302";
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const saved: Array<{ project: string; summary: string }> = [];
  const render = (id: string, title: string) =>
    act(() =>
      root.render(
        <ProjectRecordOverview
          reading={reading(id, title) as never}
          overview={project(id, title) as never}
          checkIns={{
            kind: "ready",
            projectId: id as never,
            data: {
              kind: "project.checkInList",
              projectId: id,
              items: [],
            } as never,
          }}
          onAddCheckIn={async (draft) => {
            saved.push({ project: id, summary: draft.summary });
            return true;
          }}
        />,
      ),
    );

  try {
    render(projectA, "Project A");
    const add = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Add check-in");
    assert.ok(add);
    act(() => add.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const summary = container.querySelector<HTMLTextAreaElement>("textarea");
    assert.ok(summary);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      assert.ok(setter);
      setter.call(summary, "draft for A");
      summary.dispatchEvent(new Event("input", { bubbles: true }));
    });

    render(projectB, "Project B");
    assert.equal(
      container.querySelector("textarea") === null,
      true,
      "the Project A composer must close before Project B renders",
    );
    const addB = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Add check-in");
    assert.ok(addB);
    act(() => addB.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(
      container.querySelector<HTMLTextAreaElement>("textarea")?.value,
      "",
    );
    assert.deepEqual(saved, []);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
