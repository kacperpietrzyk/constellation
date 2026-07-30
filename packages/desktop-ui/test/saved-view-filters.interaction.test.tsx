import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  type CommandEnvelope,
  FieldDefinitionIdSchema,
  ProjectIdSchema,
  StrategicRecordIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";

import { createScenarioClient } from "../src/client/scenario-client.js";
import {
  updateSavedWorkView,
  type DesktopSnapshot,
  type SavedWorkView,
} from "../src/client/workflow.js";
import { SavedViewFilterForm } from "../src/tasks/SavedViewFilterForm.js";
import type { TaskStatus } from "../src/tasks/task-view.js";

// One guarantee, and it is about the KERNEL's semantics rather than the form's
// manners: `savedView.update` replaces `filters` WHOLESALE
// (`domain/src/strategic-depth.ts:445`), so a payload naming the one condition
// somebody edited deletes every condition they did not. Nothing refuses it —
// the view simply comes back next week having quietly forgotten its deadline
// and its relation condition, with a successful write in the journal.
//
// So the assertion here is deliberately a deep-equality over the WHOLE payload
// rather than a check that the edited key arrived. A narrower assertion is
// green on exactly the write that loses the other conditions, which is the
// only failure this file exists to catch.
//
// The fixture carries three kinds of condition on purpose:
//
//   - two the form shows (`priorities`, `statusIds`) and one it shows but
//     leaves alone (`dueWindow`);
//   - two it does not show at all (`relationConditions`, `fields`) — they can
//     only survive by being seeded, never by being re-entered;
//   - one DEPRECATED key (`projectIds`). The projection still carries it on
//     any view stored before ADR-045 and `SavedWorkViewFilters` omits it, so a
//     merge that rebuilt the object key by key would drop it and silently
//     unfilter those views. It rides along only because the merge spreads.

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a0",
);
const savedViewId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a1",
);
const projectId = ProjectIdSchema.parse("00000000-0000-4000-8000-0000000000a2");
const fieldId = FieldDefinitionIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a3",
);
const doing = TaskStatusIdSchema.parse("00000000-0000-4000-8000-0000000000a4");
const parked = TaskStatusIdSchema.parse("00000000-0000-4000-8000-0000000000a5");

const storedFilters: SavedWorkView["filters"] = {
  dueWindow: "this_week",
  fields: [{ fieldId, predicate: { kind: "set" } }],
  priorities: ["urgent", "high", "normal"],
  projectIds: [projectId],
  relationConditions: [
    { path: "project", predicate: { field: "id", in: [projectId] } },
  ],
  scheduled: true,
  statusIds: [doing],
};

const view: SavedWorkView = {
  filters: storedFilters,
  id: savedViewId,
  name: "Pilne w tym tygodniu",
  sort: "due_asc",
  state: "active",
  version: 7,
};

const statuses: readonly TaskStatus[] = [
  {
    id: doing,
    label: "W toku",
    operationalSemantics: "actionable",
    position: 0,
    version: 1,
  },
  {
    id: parked,
    label: "Odłożone",
    operationalSemantics: "paused",
    position: 1,
    version: 1,
  },
];

// The wrapper reads exactly one thing off the snapshot — the workspace the
// command is addressed to — so building a whole bootstrap here would add
// nothing this file measures and a great deal it does not.
const snapshot = {
  bootstrap: { workspace: { id: workspaceId } },
} as unknown as DesktopSnapshot;

let container: HTMLDivElement;
let root: Root;
let mounted = false;
let issued: CommandEnvelope[] = [];

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
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

const openEditor = async (): Promise<HTMLFormElement> => {
  issued = [];
  const client = createScenarioClient({
    queries: {},
    executeCommand: (command) => {
      issued.push(command);
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    },
  });
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(SavedViewFilterForm, {
        // VERBATIM the call the Tasks screen has to make. Written out here
        // rather than behind a test helper, because a helper that seeded the
        // filters itself would prove a wiring nobody ships.
        onSave: async (change) =>
          (
            await updateSavedWorkView(client, snapshot, view, {
              filters: change,
            })
          ).kind === "success",
        statuses,
        view,
      }),
    );
  });
  const toggle = container.querySelector<HTMLButtonElement>(
    "button[aria-expanded]",
  );
  assert.ok(toggle, "a stored view offers no way to edit its conditions");
  await act(async () => {
    toggle.click();
  });
  const form = container.querySelector<HTMLFormElement>(
    'form[aria-label="Saved view filters"]',
  );
  assert.ok(form, "opening the editor rendered no form");
  return form;
};

const uncheck = async (
  form: HTMLFormElement,
  condition: string,
  value: string,
): Promise<void> => {
  const box = form.querySelector<HTMLInputElement>(
    `[data-condition="${condition}"] input[value="${value}"]`,
  );
  assert.ok(box, `the editor offers no control for ${condition} ${value}`);
  assert.equal(
    box.checked,
    true,
    `the editor opened without the view's own ${value}, so unchecking it measures nothing`,
  );
  await act(async () => {
    box.click();
  });
};

const save = async (form: HTMLFormElement): Promise<void> => {
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
  assert.ok(button, "the editor has no way to save");
  assert.equal(
    button.disabled,
    false,
    "Save stayed dead after the conditions changed, so the click below writes nothing",
  );
  await act(async () => {
    button.click();
  });
};

test("narrowing a saved view to one priority keeps its other conditions", async () => {
  const form = await openEditor();
  await uncheck(form, "priorities", "high");
  await uncheck(form, "priorities", "normal");
  await save(form);

  assert.equal(issued.length, 1, `saving issued ${issued.length} commands`);
  const command = issued[0]!;
  assert.equal(command.commandName, "savedView.update");
  // `exactExpected` compares the KEY SET, not a subset (`wave2.ts:1067-1081`),
  // so a second record id here is a version conflict rather than a partial
  // success.
  assert.deepEqual(command.expectedVersions, { [savedViewId]: 7 });
  assert.deepEqual(command.payload, {
    savedViewId,
    filters: {
      dueWindow: "this_week",
      fields: [{ fieldId, predicate: { kind: "set" } }],
      priorities: ["urgent"],
      projectIds: [projectId],
      relationConditions: [
        { path: "project", predicate: { field: "id", in: [projectId] } },
      ],
      scheduled: true,
      statusIds: [doing],
    },
  });
});

test("clearing a condition removes it, not stores one that matches nothing", async () => {
  // An emptied filter is not an empty list. `matchesSavedView` reads
  // `filters.priorities !== undefined && !includes(…)`
  // (`tasks/task-filters.ts:82-86`), so storing `[]` is a view that shows no
  // task at all — the write reads as a success and the screen goes blank.
  const form = await openEditor();
  await uncheck(form, "priorities", "urgent");
  await uncheck(form, "priorities", "high");
  await uncheck(form, "priorities", "normal");
  await save(form);

  assert.equal(issued.length, 1, `saving issued ${issued.length} commands`);
  const filters = (
    issued[0]!.payload as unknown as { filters: Record<string, unknown> }
  ).filters;
  assert.equal(
    "priorities" in filters,
    false,
    "an emptied priority filter was stored as a list, which matches no task",
  );
  assert.equal(filters["dueWindow"], "this_week");
});

test("an editor nobody touched cannot write, and says why", async () => {
  const form = await openEditor();
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
  assert.ok(button);
  assert.equal(
    button.disabled,
    true,
    "an untouched editor offers a live Save, which writes a new version for nothing",
  );
  // A control greyed out with no reason given is a named defect in this repo,
  // so the reason sits beside the button rather than in somebody's head.
  assert.match(form.textContent ?? "", /Nothing changed yet\./u);
  // `requestSubmit()` and not a hand-built `Event`: it is the same path the
  // submit button takes in the test above, which is what proves the submit
  // reaches React here at all. A raw dispatch that quietly reached nobody
  // would leave this assertion green over a guard that is not there.
  await act(async () => {
    form.requestSubmit();
  });
  assert.equal(issued.length, 0, "an untouched editor still issued a write");
});
