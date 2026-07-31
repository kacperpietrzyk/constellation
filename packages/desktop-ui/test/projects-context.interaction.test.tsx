import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test, vi } from "vitest";

import {
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

const queries = {
  ...populatedShellQueries,
  "workspace.bootstrapContext": projectionResponse(bootstrap),
  "work.overview": projectionResponse(work),
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
