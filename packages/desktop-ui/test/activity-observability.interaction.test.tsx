import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { DesktopSnapshot } from "../src/client/workflow.js";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const id = (value: number): string =>
  `a3000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const activity = (): DesktopSnapshot["activity"] =>
  ({
    kind: "ready",
    data: {
      kind: "activity.meaningful",
      items: Array.from({ length: 200 }, (_, index) => ({
        eventId: id(index + 1),
        targetCommandId: id(index + 301) as never,
        activityType: index % 2 === 0 ? "project_created" : "task_created",
        recordId: id(index + 601),
        recordKind: index % 2 === 0 ? "project" : "task",
        recordTitle: `Observable record ${index + 1}`,
        ...(index === 199
          ? {}
          : {
              actor: {
                principalId: id(index % 4 < 2 ? 901 : 902) as never,
                displayName: index % 4 < 2 ? "Hermes" : "Claude",
                kind: "agent" as const,
              },
            }),
        commandName: index % 2 === 0 ? "project.create" : "task.create",
        changedFields: ["title"],
        correlationId: id(1_201 + Math.floor(index / 2)) as never,
        agentRunId: id(index % 4 < 2 ? 1_401 : 1_402) as never,
        hostRunId: index % 4 < 2 ? "hermes-run" : "claude-run",
        occurredAt: new Date(
          Date.parse("2026-08-20T12:00:00.000Z") - index * 1_000,
        ).toISOString(),
      })),
    },
  }) as DesktopSnapshot["activity"];

const setSelect = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

test("200-event Activity keeps authorized filters, grouped evidence and honest fallback", async () => {
  const { ActivitySection } =
    await import("../src/settings/ActivitySection.js");
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(ActivitySection, {
        activity: activity(),
        timezone: "Europe/Warsaw",
        onUndo: () => undefined,
        onRetry: () => undefined,
      }),
    );
  });

  assert.match(container.textContent ?? "", /200 changes/);
  assert.equal(container.textContent?.includes("Unknown user"), false);
  assert.equal(container.querySelectorAll("details").length, 100);

  const actor = container.querySelector<HTMLSelectElement>("#activity-actor");
  const kind = container.querySelector<HTMLSelectElement>(
    "#activity-record-kind",
  );
  assert.ok(actor);
  assert.ok(kind);
  assert.deepEqual(
    [...actor.options].map((option) => option.textContent),
    ["All actors", "Claude · agent", "Hermes · agent"],
  );
  assert.deepEqual(
    [...kind.options].map((option) => option.textContent),
    ["All record kinds", "Project", "Task"],
  );

  const firstSummary =
    container.querySelector<HTMLElement>("details > summary");
  assert.ok(firstSummary);
  await act(async () => firstSummary.click());
  const open = firstSummary.closest("details");
  assert.equal(open?.open, true);
  assert.equal(open?.querySelectorAll("button").length, 2);
  assert.equal(open?.textContent?.includes("Observable record"), true);

  await setSelect(actor, id(901));
  await setSelect(kind, "project");
  assert.match(container.textContent ?? "", /50 results of 200/);
  assert.equal(
    container.querySelectorAll("details").length,
    0,
    "filtering one command out of each correlation must not merge separate operations by run",
  );
});
