import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import {
  RelationIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
  type QueryProjection,
} from "@constellation/contracts";

import {
  draftProjectId,
  populatedBootstrap,
  populatedPlanDayKey,
  populatedProjectList,
  populatedShellQueries,
  populatedWorkOverview,
  projectId,
  projectionResponse,
  spaceId,
} from "./shell-fixture.js";

type Projection<Kind extends QueryProjection["kind"]> = Extract<
  QueryProjection,
  { kind: Kind }
>;

// Areas and initiatives, on the screen they moved to.
//
// Nothing anywhere covered them before: they lived on the work surface, which
// had no interaction test at all, so creating an area, putting a project under
// one and taking it back out were three writes with no assertion between the
// contract and the screen. Every guarantee here is therefore NEW, and each one
// was checked by breaking the thing it measures rather than by watching it pass.
//
// Asserted from the navigation and one click, never from a mount of the panel:
// the panel is `lazy()` behind a trigger on a screen the shell decides to draw,
// and a test that rendered it directly would be green over a control nothing on
// screen can reach.

const areaId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-00000000fa01",
);
const initiativeId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-00000000fa02",
);
const linkId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-00000000fa03",
);
const removedLinkId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-00000000fa05",
);
const directAreaRelationId = RelationIdSchema.parse(
  "00000000-0000-4000-8000-00000000fa06",
);

const AREA_TITLE = "Relacje z klientami";
const INITIATIVE_TITLE = "Interaktywna alfa";
const AREA_RESPONSIBILITY =
  "Utrzymujemy kontakt z klientami między wdrożeniami, żeby żaden temat nie wracał do nas dopiero jako eskalacja.";

/**
 * A SECOND Space, and the linked project is not in the first.
 *
 * `work.linkCreate` is checked by the kernel against the Space named in its
 * payload, and the wrapper refuses to guess one — the hardcoded "first Space"
 * default was removed because a project outside it turned a legitimate link into
 * a silent rejection. With one Space in the fixture the project's own Space and
 * the workspace's first are the same string, so the assertion below could not
 * fail and would prove nothing.
 */
const otherSpaceId = SpaceIdSchema.parse(
  "00000000-0000-4000-8000-00000000fa04",
);

const bootstrap: Projection<"workspace.bootstrapContext"> = {
  ...populatedBootstrap,
  spaces: [
    { id: otherSpaceId, name: "Archiwum", version: 1 },
    ...populatedBootstrap.spaces,
  ],
};

/** One area, one initiative, and ONE link — from the second project, so the
 *  panel cannot pass by drawing every project under every context. */
const work: Projection<"work.overview"> = {
  ...populatedWorkOverview,
  tasks: populatedWorkOverview.tasks.map((task, index) =>
    index === 0 ? { ...task, areaIds: [areaId] } : task,
  ),
  areas: [
    {
      id: areaId,
      title: AREA_TITLE,
      responsibility: AREA_RESPONSIBILITY,
      needsReview: false,
      state: "active",
      version: 1,
    },
  ],
  initiatives: [
    {
      id: initiativeId,
      title: INITIATIVE_TITLE,
      // Deliberately unwritten: an initiative created without an outcome must
      // read as a gap to fill and not as a blank line, and only an EMPTY one
      // exercises that branch.
      intendedOutcome: "",
      needsReview: true,
      state: "active",
      version: 1,
    },
  ],
  links: [
    {
      id: linkId,
      linkType: "project_serves_area",
      sourceRecordId: draftProjectId,
      targetRecordId: areaId,
      state: "active",
      version: 2,
    },
    // A link somebody already took off, and the ONLY reason it is here.
    // `work.linkRemove` flips the link's own state and leaves the record alone,
    // so a detached link keeps coming back from this query forever. Without a
    // removed one in the fixture, deleting the `state === "active"` filter
    // altogether leaves every assertion green — verified by doing exactly that.
    // It points at the initiative, which nothing else touches, so if the filter
    // goes the initiative starts claiming a project and says so out loud.
    {
      id: removedLinkId,
      linkType: "project_advances_initiative",
      sourceRecordId: projectId,
      targetRecordId: initiativeId,
      state: "removed",
      version: 3,
    },
  ],
};

const areaOverview: Projection<"area.operationalOverview"> = {
  kind: "area.operationalOverview",
  area: {
    id: areaId,
    spaceId,
    title: AREA_TITLE,
    responsibility: AREA_RESPONSIBILITY,
    needsReview: false,
    state: "active",
    version: 1,
    updatedAt: "2026-08-20T12:00:00.000Z",
  },
  directTaskCount: 1,
  directTasks: [
    {
      id: populatedWorkOverview.tasks[0]!.id,
      title: populatedWorkOverview.tasks[0]!.title,
      completionState: populatedWorkOverview.tasks[0]!.completionState,
      relationId: directAreaRelationId,
      relationVersion: 2,
      version: populatedWorkOverview.tasks[0]!.version,
      updatedAt: populatedWorkOverview.tasks[0]!.updatedAt,
    },
  ],
  projectCount: 1,
  projects: [
    {
      id: draftProjectId,
      title: populatedProjectList.items[1]!.title,
      intendedOutcome: populatedProjectList.items[1]!.intendedOutcome,
      needsReview: populatedProjectList.items[1]!.needsReview,
      lifecycle: populatedProjectList.items[1]!.lifecycle,
      linkId,
      linkVersion: 2,
      version: populatedProjectList.items[1]!.version,
      updatedAt: populatedProjectList.items[1]!.updatedAt,
    },
  ],
};

const initiativeOverview: Projection<"initiative.operationalOverview"> = {
  kind: "initiative.operationalOverview",
  initiative: {
    id: initiativeId,
    spaceId,
    title: INITIATIVE_TITLE,
    intendedOutcome: "",
    needsReview: true,
    state: "active",
    version: 1,
    updatedAt: "2026-08-20T12:00:00.000Z",
  },
  directTaskCount: 0,
  directTasks: [],
  projectCount: 0,
  projects: [],
};

const queries = {
  ...populatedShellQueries,
  "workspace.bootstrapContext": projectionResponse(bootstrap),
  "work.overview": projectionResponse(work),
  "area.operationalOverview": projectionResponse(areaOverview),
  "initiative.operationalOverview": projectionResponse(initiativeOverview),
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;

let issued: {
  name: string;
  payload: Record<string, unknown>;
  expectedVersions: Record<string, number>;
}[] = [];

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${populatedPlanDayKey}T09:30:00.000Z`));
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
  vi.useRealTimers();
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

const mountShell = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  issued = [];
  const scenario = createScenarioClient({
    queries,
    executeCommand: (command) => {
      issued.push({
        name: command.commandName,
        payload: command.payload as Record<string, unknown>,
        expectedVersions: (command.expectedVersions ?? {}) as Record<
          string,
          number
        >,
      });
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    },
  });
  const snapshot = await loadDesktopSnapshot(scenario);
  assert.equal(
    snapshot.work.kind,
    "ready",
    "the work fixture never reached the snapshot, so this measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(RealApp, { client: scenario, initialSnapshot: snapshot }),
    );
  });
};

const buttonNamed = (scope: ParentNode, text: string): HTMLElement => {
  const found = [...scope.querySelectorAll<HTMLElement>("button")].find(
    (button) => (button.textContent ?? "").trim() === text,
  );
  assert.ok(found, `no control named “${text}” is on screen`);
  return found;
};

/** Projects, then the disclosure, then the lazy panel actually loading. */
const openContextPanel = async (): Promise<HTMLElement> => {
  await mountShell();
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "projects");
  assert.ok(item, "no navigation target rendered for Projects");
  await act(async () => {
    item.click();
  });
  await act(async () => {
    buttonNamed(container, "Areas and initiatives").click();
  });
  await waitForCondition(
    () => container.querySelector("[data-work-context]") !== null,
    "the areas and initiatives panel never drew a row",
  );
  const panel = container.querySelector<HTMLElement>("#project-context-panel");
  assert.ok(panel, "the panel is not in the document");
  return panel;
};

const openContextRecord = async (
  kind: "area" | "initiative",
): Promise<HTMLElement> => {
  const panel = await openContextPanel();
  const openButton = panel.querySelector<HTMLElement>(
    `[aria-label="Open ${kind} ${kind === "area" ? AREA_TITLE : INITIATIVE_TITLE}"]`,
  );
  assert.ok(openButton, `the ${kind} row has no keyboard-operable Open action`);
  await act(async () => {
    openButton.focus();
    openButton.click();
  });
  await waitForCondition(
    () => container.querySelector(`[data-record-kind="${kind}"]`) !== null,
    `the ${kind} never opened as a record`,
  );
  const record = container.querySelector<HTMLElement>(
    `[data-record-kind="${kind}"]`,
  );
  assert.ok(record);
  return record;
};

const openPopoverNamed = async (
  scope: ParentNode,
  label: string,
): Promise<HTMLElement> => {
  await act(async () => {
    buttonNamed(scope, label).click();
  });
  // Portaled to <body>, so deliberately not looked for inside the panel.
  const dialog = document.body.querySelector<HTMLElement>(
    '[role="dialog"].inline-popover',
  );
  assert.ok(dialog, `${label} opened nothing`);
  return dialog;
};

const setValue = async (
  field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
): Promise<void> => {
  await act(async () => {
    const prototype =
      field instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      field,
      value,
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const fieldLabelled = <Element extends HTMLElement>(
  scope: ParentNode,
  label: string,
): Element => {
  const found = scope.querySelector<Element>(`[aria-label="${label}"]`);
  assert.ok(found, `the form has no field labelled “${label}”`);
  return found;
};

const submitFormOf = async (field: HTMLElement): Promise<void> => {
  await act(async () => {
    field
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

const lastCommand = (name: string) => {
  const found = [...issued].reverse().find((command) => command.name === name);
  assert.ok(found, `nothing issued a ${name} command`);
  return found;
};

test("Projects is where an area and an initiative are read, with the work under them named", async () => {
  const panel = await openContextPanel();
  const text = panel.textContent ?? "";

  assert.ok(
    text.includes(AREA_TITLE),
    "the area is not on the Projects screen",
  );
  assert.ok(
    text.includes(INITIATIVE_TITLE),
    "the initiative is not on the Projects screen",
  );

  // Which projects sit under a context. Retiring the work surface takes away
  // the only display of that membership, so it is NAMED here rather than
  // counted: "1 project" is a number nobody can act on.
  const areaRow = panel.querySelector<HTMLElement>(
    '[data-work-context="area"]',
  );
  assert.ok(areaRow, "the area is drawn without being openable");
  assert.ok(
    (areaRow.textContent ?? "").includes("Przeniesienie archiwum umów"),
    "the area does not say which project is under it",
  );
  const directTasks = areaRow.querySelector<HTMLElement>(
    '[data-context-direct-tasks="area"]',
  );
  assert.ok(directTasks, "direct tasks are not separated from projects");
  assert.ok(
    (directTasks.textContent ?? "").includes(
      populatedWorkOverview.tasks[0]!.title,
    ),
    "the Area does not name its directly related Task",
  );
  const initiativeRow = panel.querySelector<HTMLElement>(
    '[data-work-context="initiative"]',
  );
  assert.ok(initiativeRow, "the initiative is drawn without being openable");
  assert.ok(
    (initiativeRow.textContent ?? "").includes("No project under it yet"),
    "an empty context claims work it does not hold",
  );

  // An initiative created without an outcome reads as a gap to FILL. A bare
  // text node here would draw an empty span, which is the regression
  // `NarrativeText` exists to stop.
  assert.ok(
    (initiativeRow.textContent ?? "").includes("Outcome to write"),
    "an unwritten outcome renders as a blank line instead of a gap",
  );
});

test("opening an area sends it to the inspector, the same drawer a project opens into", async () => {
  const panel = await openContextPanel();
  await act(async () => {
    panel.querySelector<HTMLElement>('[data-work-context="area"]')?.click();
  });
  await waitForCondition(() => {
    const inspector = container.querySelector('[aria-label="Context preview"]');
    return (
      inspector?.getAttribute("aria-hidden") === "false" &&
      (inspector.textContent ?? "").includes(AREA_TITLE)
    );
  }, "opening an area did not put it in the inspector");
});

test("opening an Area promotes it to a first-class record with direct Tasks, Projects and Activity", async () => {
  const panel = await openContextPanel();
  await act(async () => {
    panel
      .querySelector<HTMLElement>('[data-work-context="area"]')
      ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitForCondition(
    () => container.querySelector('[data-record-kind="area"]') !== null,
    "the Area never opened as a record",
  );
  const record = container.querySelector<HTMLElement>(
    '[data-record-kind="area"]',
  );
  assert.ok(record);
  assert.equal(record.querySelector("h1")?.textContent, AREA_TITLE);
  const tasksTab = record.querySelector<HTMLElement>(
    '[data-record-tab="tasks"]',
  );
  const projectsTab = record.querySelector<HTMLElement>(
    '[data-record-tab="projects"]',
  );
  const activityTab = record.querySelector<HTMLElement>(
    '[data-record-tab="activity"]',
  );
  assert.ok(tasksTab, "the direct Tasks tab is missing");
  assert.equal((tasksTab.textContent ?? "").replace(/\s/gu, ""), "Tasks1");
  assert.ok(projectsTab, "the Projects tab is missing");
  assert.equal(
    (projectsTab.textContent ?? "").replace(/\s/gu, ""),
    "Projects1",
  );
  assert.ok(activityTab, "the Activity tab is missing");
  assert.ok(
    (record.textContent ?? "").includes(AREA_RESPONSIBILITY),
    "the responsibility is not the Area overview narrative",
  );

  await act(async () => tasksTab.click());
  assert.ok(
    (record.textContent ?? "").includes(populatedWorkOverview.tasks[0]!.title),
    "direct work is missing from the Tasks tab",
  );
  await act(async () => projectsTab.click());
  assert.ok(
    (record.textContent ?? "").includes(populatedProjectList.items[1]!.title),
    "the Project serving the Area is missing",
  );
});

test("an Initiative opens as its own record and names an unwritten outcome honestly", async () => {
  const record = await openContextRecord("initiative");
  assert.equal(record.querySelector("h1")?.textContent, INITIATIVE_TITLE);
  assert.ok(
    (record.textContent ?? "").includes("Outcome to write"),
    "an unwritten Initiative outcome rendered as blank content",
  );
  assert.ok(buttonNamed(record, "Close initiative"));
});

test("Area narrative and lifecycle writes carry the exact record version", async () => {
  const record = await openContextRecord("area");
  await act(async () => buttonNamed(record, "Edit responsibility").click());
  const narrative = fieldLabelled<HTMLTextAreaElement>(
    record,
    "Responsibility",
  );
  await setValue(narrative, "Own the product after every delivery closes.");
  await submitFormOf(narrative);
  const updated = lastCommand("area.updateResponsibility");
  assert.equal(updated.payload.areaId, areaId);
  assert.deepEqual(updated.expectedVersions, { [areaId]: 1 });

  await act(async () => buttonNamed(record, "Archive area").click());
  const archived = lastCommand("area.archive");
  assert.equal(archived.payload.areaId, areaId);
  assert.deepEqual(archived.expectedVersions, { [areaId]: 1 });
});

test("an Area creates, links and unlinks direct Tasks without a synthetic Project", async () => {
  const record = await openContextRecord("area");
  const tasksTab = record.querySelector<HTMLElement>(
    '[data-record-tab="tasks"]',
  );
  assert.ok(tasksTab);
  await act(async () => tasksTab.click());

  const directTitle = fieldLabelled<HTMLInputElement>(
    record,
    "New direct task",
  );
  await setValue(directTitle, "Review the operating standard");
  await submitFormOf(directTitle);
  const created = lastCommand("task.create");
  assert.equal(created.payload.spaceId, spaceId);
  assert.equal(created.payload.title, "Review the operating standard");
  assert.equal(
    issued.some((command) => command.name === "project.create"),
    false,
    "direct Task creation manufactured a Project",
  );

  const existing = fieldLabelled<HTMLSelectElement>(record, "Existing task");
  const candidate = populatedWorkOverview.tasks[1]!;
  await setValue(existing, candidate.id);
  await submitFormOf(existing);
  const linked = lastCommand("record.relate");
  assert.deepEqual(linked.payload, {
    relationType: "task_contributes_to_area",
    taskId: candidate.id,
    areaId,
  });
  assert.deepEqual(linked.expectedVersions, {
    [candidate.id]: candidate.version,
    [areaId]: 1,
  });

  const unlink = record.querySelector<HTMLElement>(
    `[aria-label="Unlink task: ${populatedWorkOverview.tasks[0]!.title}"]`,
  );
  assert.ok(unlink);
  await act(async () => unlink.click());
  const removed = lastCommand("record.unrelate");
  assert.deepEqual(removed.payload, { relationId: directAreaRelationId });
  assert.deepEqual(removed.expectedVersions, { [directAreaRelationId]: 2 });
});

test("an Area links and unlinks Projects from its own Projects tab", async () => {
  const record = await openContextRecord("area");
  const projectsTab = record.querySelector<HTMLElement>(
    '[data-record-tab="projects"]',
  );
  assert.ok(projectsTab);
  await act(async () => projectsTab.click());

  const project = fieldLabelled<HTMLSelectElement>(record, "Project to link");
  await setValue(project, projectId);
  await submitFormOf(project);
  const linked = lastCommand("work.linkCreate");
  assert.equal(linked.payload.linkType, "project_serves_area");
  assert.equal(linked.payload.sourceRecordId, projectId);
  assert.equal(linked.payload.targetRecordId, areaId);
  assert.equal(linked.payload.spaceId, spaceId);

  const unlink = record.querySelector<HTMLElement>(
    `[aria-label="Unlink project: ${populatedProjectList.items[1]!.title}"]`,
  );
  assert.ok(unlink);
  await act(async () => unlink.click());
  const removed = lastCommand("work.linkRemove");
  assert.deepEqual(removed.payload, { linkId });
  assert.deepEqual(removed.expectedVersions, { [linkId]: 2 });
});

test("an area is created with an explicit gap rather than an empty responsibility", async () => {
  const panel = await openContextPanel();
  const dialog = await openPopoverNamed(panel, "Add area");

  await setValue(
    fieldLabelled<HTMLInputElement>(dialog, "Area name"),
    "Umowy ramowe",
  );
  // Left blank ON PURPOSE. The contract REFUSES an empty responsibility, so the
  // key has to be absent rather than "" — and the rule lives in this handler,
  // not in the wrapper, so no test of `createArea` protects it.
  await submitFormOf(fieldLabelled<HTMLInputElement>(dialog, "Area name"));

  const command = lastCommand("area.create");
  assert.equal(command.payload.title, "Umowy ramowe");
  assert.equal(
    "responsibility" in command.payload,
    false,
    "a blank responsibility was sent as an empty string instead of omitted",
  );
});

test("a project goes under a context in ITS OWN Space, and comes back out at the link's version", async () => {
  const panel = await openContextPanel();
  const dialog = await openPopoverNamed(panel, "Put a project in context");

  await setValue(
    fieldLabelled<HTMLSelectElement>(dialog, "Project"),
    projectId,
  );
  await setValue(
    fieldLabelled<HTMLSelectElement>(dialog, "Area or initiative"),
    `initiative:${initiativeId}`,
  );
  await submitFormOf(fieldLabelled<HTMLSelectElement>(dialog, "Project"));

  const created = lastCommand("work.linkCreate");
  assert.equal(created.payload.linkType, "project_advances_initiative");
  assert.equal(created.payload.sourceRecordId, projectId);
  assert.equal(created.payload.targetRecordId, initiativeId);
  // The project's own Space, read off `project.list` — not the workspace's
  // first, which this fixture deliberately makes a different string.
  assert.equal(created.payload.spaceId, spaceId);
  // The one command whose kernel branch asserts an EMPTY expected-version map.
  assert.deepEqual(created.expectedVersions, {});
});

test("a project already under a context can be taken back out", async () => {
  const panel = await openContextPanel();
  const dialog = await openPopoverNamed(panel, "Put a project in context");

  // The second project is the one with a link. Choosing it shows what it is
  // ALREADY under — without this, linking is the only half that exists and a
  // project put in the wrong place stays there.
  await setValue(
    fieldLabelled<HTMLSelectElement>(dialog, "Project"),
    draftProjectId,
  );
  const linked = [...dialog.querySelectorAll("li")].find((row) =>
    (row.textContent ?? "").includes(AREA_TITLE),
  );
  assert.ok(linked, "the project does not say which context it is already in");
  assert.ok(
    (linked.textContent ?? "").includes("serves this area"),
    "the existing link does not say what kind of link it is",
  );

  await act(async () => {
    linked.querySelector("button")?.click();
  });

  const removed = lastCommand("work.linkRemove");
  assert.equal(removed.payload.linkId, linkId);
  // The LINK's own version, and nothing else — the mirror of `work.linkCreate`
  // above, which refuses one.
  assert.deepEqual(removed.expectedVersions, { [linkId]: 2 });
});

test("a project in no context says so instead of showing an empty list", async () => {
  const panel = await openContextPanel();
  const dialog = await openPopoverNamed(panel, "Put a project in context");
  await setValue(
    fieldLabelled<HTMLSelectElement>(dialog, "Project"),
    projectId,
  );
  // The unlinked project HAS a removed link in the fixture, so this sentence is
  // also the proof that a detached link is not offered for detaching again.
  assert.ok(
    (dialog.textContent ?? "").includes("Not in any context yet"),
    "a project whose only link was taken off is drawn as still in a context",
  );
  assert.ok(
    populatedProjectList.items.some((item) => item.id === projectId),
    "the fixture stopped carrying the unlinked project this test needs",
  );
});
