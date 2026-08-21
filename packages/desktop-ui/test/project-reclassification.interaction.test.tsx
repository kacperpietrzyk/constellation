import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  ProjectIdSchema,
  StrategicRecordIdSchema,
} from "@constellation/contracts";

import {
  ProjectReclassificationDialog,
  reclassificationDraftKey,
} from "../src/record/ProjectReclassificationDialog.js";

const projectId = ProjectIdSchema.parse("76100000-0000-4000-8000-000000000001");
const targetId = StrategicRecordIdSchema.parse(
  "76100000-0000-4000-8000-000000000002",
);

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => root.unmount());
  }
  container.remove();
});

test("previews a Project merge with preserved history before it can confirm", async () => {
  const previewed: unknown[] = [];
  const applied: unknown[] = [];
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(ProjectReclassificationDialog, {
        projectId,
        projectTitle: "Desktop migration",
        targets: [
          { id: targetId, kind: "initiative", title: "Desktop platform" },
        ],
        onClose: () => undefined,
        onPreview: async (destination) => {
          previewed.push(destination);
          return {
            kind: "ready" as const,
            data: {
              projectId,
              destination: { ...destination, targetTitle: "Desktop platform" },
              canApply: true,
              expectedVersions: { [projectId]: 4, [targetId]: 7 },
              history: {
                bodyOwner: { kind: "project" as const, projectId },
                checkInIds: ["76100000-0000-4000-8000-000000000011" as never],
                commentIds: ["76100000-0000-4000-8000-000000000012" as never],
                evidenceSourceIds: [
                  "76100000-0000-4000-8000-000000000013" as never,
                ],
                taskIds: ["76100000-0000-4000-8000-000000000014" as never],
                relationIds: ["76100000-0000-4000-8000-000000000015" as never],
                workLinkIds: ["76100000-0000-4000-8000-000000000016" as never],
                eventIds: ["76100000-0000-4000-8000-000000000017"],
                auditReceiptIds: [
                  "76100000-0000-4000-8000-000000000018" as never,
                ],
              },
            },
          };
        },
        onApply: async (_preview, destination) => {
          applied.push(destination);
          return {
            kind: "success" as const,
            commandId: "76100000-0000-4000-8000-000000000019",
          };
        },
      }),
    );
  });

  const mode = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Reclassification mode"]',
  );
  const kind = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Target kind"]',
  );
  assert.ok(mode);
  assert.ok(kind);
  assert.ok(
    container.querySelector("[data-reclassification-dialog-body]"),
    "reclassification controls must live inside the padded scroll body",
  );
  await act(async () => {
    mode.value = "merge";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    kind.value = "initiative";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const target = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Merge target"]',
  );
  assert.ok(target);
  await act(async () => {
    target.value = targetId;
    target.dispatchEvent(new Event("change", { bubbles: true }));
    container
      .querySelector<HTMLButtonElement>("button[data-reclassification-preview]")
      ?.click();
  });

  assert.equal(previewed.length, 1);
  assert.match(container.textContent ?? "", /Project remains the body owner/u);
  assert.match(
    container.textContent ?? "",
    /1 check-in.*1 comment.*1 evidence/u,
  );
  assert.match(container.textContent ?? "", /Expected versions.*4.*7/u);
  const confirm = container.querySelector<HTMLButtonElement>(
    "button[data-reclassification-confirm]",
  );
  assert.ok(confirm, "a fresh preview must offer confirmation");
  await act(async () => confirm.click());
  assert.equal(applied.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(applied[0])),
    JSON.parse(JSON.stringify(previewed[0])),
    "preview and apply must use the same semantic destination bytes",
  );
});

test("keys a preview to every destination fact", () => {
  const destination = {
    mode: "create" as const,
    kind: "area" as const,
    targetId,
  };
  const original = reclassificationDraftKey(destination, {
    title: "Desktop migration",
    responsibility: "Own the desktop product",
    opportunity: {
      organizationId: "",
      need: "",
      qualification: "",
      stage: "",
      nextAction: "",
    },
  });
  const changed = reclassificationDraftKey(destination, {
    title: "Desktop migration",
    responsibility: "Own the whole product",
    opportunity: {
      organizationId: "",
      need: "",
      qualification: "",
      stage: "",
      nextAction: "",
    },
  });
  assert.notEqual(original, changed);
});
