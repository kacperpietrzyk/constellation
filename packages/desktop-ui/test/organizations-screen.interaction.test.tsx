import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { ScenarioFixtures } from "../src/client/scenario-client.js";
import {
  ProjectIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
} from "@constellation/contracts";

import {
  populatedProjectList,
  populatedRelationshipWorkspace,
  populatedShellQueries,
  populatedWorkOverview,
  principalId,
  projectionResponse,
  referencedOrganizationId,
  spaceId,
  unreferencedOrganizationId,
  workspaceId,
} from "./shell-fixture.js";

// WHY THIS FILE EXISTS AT ALL, stated once so nobody deletes it as redundant.
//
// A lazy surface can ship COMPLETELY EMPTY and stay green in three gates at the
// same time. `surface-registry-render.test.ts` renders with
// `renderToStaticMarkup`, which never resolves `React.lazy`, so for a lazy id it
// measures the Suspense fallback and nothing else. Its companion — "no two
// destinations render the same screen" — compares those same fallbacks, which
// differ only by their label. And the packaged smoke's per-surface check is "the
// first visible child of the work plane exists", which a placeholder satisfies.
//
// This screen carries a second reason. It REPLACED a screen, and four `it()`
// blocks in `interaction-recovery-contract.test.ts` used to read its source as
// text. A regex over source cannot tell a rendering screen from one that renders
// nothing, so the collection half of that file was replaced by this file rather
// than patched — the precedent written into it at :129-136.
//
// So every test below mounts the REAL shell, clicks the REAL navigation item and
// waits until a client row is in the DOM before asserting anything. Every
// assertion was broken on purpose before it was trusted, and the failure message
// it produced is recorded in the pull request.

const watchedOrganizationId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000e1",
);
const quietOrganizationId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000e2",
);
const mainContactId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000e3",
);
const deliveryLinkId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000e4",
);
const blockedTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-0000000000e5",
);
const watchedProjectId = ProjectIdSchema.parse(
  "00000000-0000-4000-8000-0000000000e6",
);

const strategicRecordBase = {
  workspaceId,
  spaceId,
  createdBy: principalId,
  recordState: "active" as const,
  version: 1,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-07-20T14:30:00.000Z",
};

/** Records the shared fixture does not carry, composed HERE rather than added
 *  to `shell-fixture.ts`: each exists to make ONE branch of this screen
 *  reachable, and none of them is a fact about the workspace every other test
 *  should start from (PR #184 §9 — build against the fixture, not sideways).
 *
 *   - an `active` client whose ONLY trouble is a project at risk. This is the
 *     whole of C17: delivery trouble must read as `Watch`, never as `At risk`.
 *     Without a client in exactly this state the split is unobservable, because
 *     the fixture's own client is `At risk` for a contract reason;
 *   - an `inactive` client with nothing at all against it, so the filter has a
 *     third state to hold and the `Dormant` reading has a row;
 *   - a person who is the MAIN CONTACT at the first client — the contact AT the
 *     client, never an owner on our side;
 *   - the live half of a `project_serves_organization` link, which is the only
 *     way a delivery reaches a client from this projection. */
const relationships = {
  ...populatedRelationshipWorkspace,
  records: [
    ...populatedRelationshipWorkspace.records.map((record) =>
      record.id === referencedOrganizationId && record.kind === "organization"
        ? { ...record, mainContactPersonId: mainContactId }
        : record,
    ),
    {
      ...strategicRecordBase,
      id: mainContactId,
      kind: "person" as const,
      name: "Piotr Zielinski",
      organizationId: referencedOrganizationId,
      role: "Dyrektor operacyjny",
    },
    {
      ...strategicRecordBase,
      id: watchedOrganizationId,
      kind: "organization" as const,
      name: "Aurora Serwis",
      relationshipState: "active" as const,
      nextAction: "Umów przegląd kwartalny.",
      segment: "Produkcja",
    },
    {
      ...strategicRecordBase,
      id: quietOrganizationId,
      kind: "organization" as const,
      name: "Zenit Handel",
      relationshipState: "inactive" as const,
    },
    {
      ...strategicRecordBase,
      id: deliveryLinkId,
      kind: "work_link" as const,
      linkType: "project_serves_organization" as const,
      sourceRecordId: watchedProjectId,
      targetRecordId: watchedOrganizationId,
      state: "active" as const,
    },
  ],
};

/** A project delivered at Aurora, and a task on it that is BLOCKED — which is
 *  what makes `readProjects` call that project `risk`. Nothing about money and
 *  nothing about the contract, so the only reading it can produce is `Watch`. */
const projects = {
  ...populatedProjectList,
  items: [
    ...populatedProjectList.items,
    {
      ...populatedProjectList.items[0]!,
      id: watchedProjectId,
      title: "Modernizacja linii pakującej",
      relatedOpenTaskCount: 1,
    },
  ],
};

const work = {
  ...populatedWorkOverview,
  tasks: [
    ...populatedWorkOverview.tasks,
    {
      ...populatedWorkOverview.tasks[0]!,
      id: blockedTaskId,
      title: "Czekamy na części od dostawcy",
      operationalState: "blocked" as const,
      completionState: "open" as const,
      projectIds: [watchedProjectId],
    },
  ],
  projects: [
    ...populatedWorkOverview.projects,
    {
      id: watchedProjectId,
      title: "Modernizacja linii pakującej",
      intendedOutcome: "Linia pakująca podnosi przepustowość o jedną trzecią.",
      needsReview: false,
      lifecycle: "active" as const,
      version: 1,
    },
  ],
};

const queries = {
  ...populatedShellQueries,
  "relationship.workspace": projectionResponse(relationships),
  "project.list": projectionResponse(projects),
  "work.overview": projectionResponse(work),
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
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

const openOrganizations = async (
  fixtures: ScenarioFixtures["queries"] = queries,
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: fixtures });
  const snapshot = await loadDesktopSnapshot(client);
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "organizations");
  assert.ok(item, "no navigation target rendered for Organizations");
  await act(async () => {
    item.click();
  });
  // The wait is the whole instrument: without it every assertion below would be
  // measuring the Suspense fallback, which is exactly the failure this file
  // exists to make impossible.
  await waitForCondition(
    () => container.querySelector("[data-organizations-surface]") !== null,
    "Organizations never mounted into the work plane",
  );
};

const rows = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>("[data-org-row]"),
];

const rowFor = (id: string): HTMLElement => {
  const row = rows().find((node) => node.dataset.orgRow === id);
  assert.ok(row, `no row rendered for ${id}`);
  return row;
};

const chip = (state: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(
    `[data-org-filter="${state}"]`,
  );
  assert.ok(node, `no filter control for ${state}`);
  return node;
};

const switchToTable = async (): Promise<void> => {
  const tab = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (node) => (node.textContent ?? "").trim() === "Table",
  );
  assert.ok(tab, "the layout switch offers no Table");
  await act(async () => {
    tab.click();
  });
};

test("the screen draws a client row at all, led by its reading", async () => {
  await openOrganizations();
  await waitForCondition(
    () => rows().length > 0,
    "Organizations drew no client row at all",
  );

  const row = rowFor(referencedOrganizationId);
  const signal = row.querySelector<HTMLElement>("[data-relationship-signal]");
  assert.ok(signal, "the row carries no reading");
  // FIRST, before the name. A list of clients is read for what needs attention
  // and the name is what you confirm once you are already looking.
  assert.equal(
    row.firstElementChild,
    signal,
    "something other than the reading leads the row",
  );
  assert.match(
    row.textContent ?? "",
    /Northstar Industries/u,
    "the client's name is not on its own row",
  );
});

test("C15 — the reading is computed from what moved; no stored health is read", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  // HALF ONE: nothing health-shaped is on the projection, so nothing could be
  // read even if somebody tried.
  const organization = relationships.records.find(
    (record) => record.id === referencedOrganizationId,
  );
  assert.ok(organization, "the fixture lost its organization");
  const stored = Object.keys(organization).filter((key) =>
    /^(health|signal|status|reading)$/u.test(key),
  );
  assert.deepEqual(
    stored,
    [],
    "the organization projection grew a stored health field — a health somebody must remember to update lies within two weeks",
  );

  // HALF TWO, and it is what makes half one non-decorative: the row STILL
  // states a reading, and states it with a reason, so the absence above is a
  // computation rather than a missing feature.
  const row = rowFor(referencedOrganizationId);
  const signal = row.querySelector<HTMLElement>("[data-relationship-signal]");
  assert.ok(signal, "no reading is stated where the stored one used to be");
  assert.ok(
    (signal.textContent ?? "").trim().length > 0,
    "the reading is a mark with no word beside it",
  );
  const why = row.querySelector<HTMLElement>("[data-org-why]");
  assert.ok(why, "the reading carries no reason");
  assert.ok(
    (why.textContent ?? "").trim().length > 10,
    "the reason is empty — a badge without one is decoration",
  );

  // HALF THREE: the reading MOVES with the inputs while the record does not.
  // Northstar's contract has entered its lead window and no decision-maker fact
  // was ever recorded, so this is the reason the computation produced.
  assert.match(
    why.textContent ?? "",
    /decision-maker never recorded/u,
    "the reading is not derived from the contract and the facts",
  );
});

test("C16 — the filter really removes rows, and there are two ways back out", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  const total = rows().length;
  assert.ok(total >= 3, `only ${total} rows — filtering cannot be observed`);

  // Chip counts come from the FULL set: they answer "how many are like this",
  // not "how many do you see now".
  const inactiveChip = chip("inactive");
  assert.match(
    inactiveChip.textContent ?? "",
    /Inactive\s*1/u,
    "the Inactive chip does not count the full set",
  );

  await act(async () => {
    chip("prospect").click();
  });
  // THE ROWS, not `aria-pressed`. The defect this replaces was a chip that
  // toggled its own pressed state and removed nothing.
  const shown = rows();
  assert.ok(
    shown.length > 0 && shown.length < total,
    `pressing Prospect left ${shown.length} of ${total} rows — the chip filtered nothing`,
  );
  assert.deepEqual(
    shown.map((row) => row.dataset.orgRow),
    [unreferencedOrganizationId as string],
    "the filter kept rows that are not prospects",
  );
  assert.equal(
    container.querySelector("[data-org-count]")?.textContent,
    "1 of 4 organizations",
    "the count does not say how much of the set is being shown",
  );

  // WAY OUT ONE — `Show all`, which exists only while the filter holds
  // something.
  await act(async () => {
    chip("all").click();
  });
  assert.equal(rows().length, total, "`Show all` did not clear the filter");
  assert.equal(
    container.querySelector('[data-org-filter="all"]'),
    null,
    "`Show all` is offered when there is nothing to show all of",
  );

  // WAY OUT TWO — unclicking the last held chip. A control a reader cannot get
  // out of is worse than no control, so BOTH exits are asserted.
  await act(async () => {
    chip("prospect").click();
  });
  assert.ok(
    rows().length < total,
    "the chip stopped filtering on the way back",
  );
  await act(async () => {
    chip("prospect").click();
  });
  assert.equal(
    rows().length,
    total,
    "unclicking the last chip did not clear the filter",
  );
});

test("C16b — a filter that matches nothing says which states it is holding", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  // Northstar and Aurora are active, Wiatrak is a prospect, Zenit is inactive.
  // Holding inactive AND prospect still matches; the empty case needs a state
  // with a chip and no row, so the filter is driven to one.
  await act(async () => {
    chip("prospect").click();
  });
  await act(async () => {
    chip("inactive").click();
  });
  await act(async () => {
    chip("prospect").click();
  });
  await act(async () => {
    chip("inactive").click();
  });
  assert.equal(rows().length, 4, "the filter did not come back out");

  const emptyQueries = {
    ...queries,
    "relationship.workspace": projectionResponse({
      ...relationships,
      records: relationships.records.filter(
        (record) =>
          !(
            record.kind === "organization" &&
            record.relationshipState === "inactive"
          ),
      ),
    }),
  };
  act(() => {
    root.unmount();
  });
  mounted = false;
  container.remove();
  container = document.createElement("div");
  document.body.append(container);
  await openOrganizations(emptyQueries);
  await waitForCondition(() => rows().length > 0, "no client row");
  await act(async () => {
    chip("inactive").click();
  });

  assert.equal(
    rows().length,
    0,
    "the filter kept rows in a state nobody is in",
  );
  const surface = container.querySelector("[data-organizations-surface]");
  assert.match(
    surface?.textContent ?? "",
    /The filter is holding Inactive/u,
    "the empty state does not name which states are being held, so there is nothing to act on",
  );
  const out = container.querySelector<HTMLElement>('[data-org-filter="all"]');
  assert.ok(out, "an empty filter offers no way back out of itself");
});

test("C17 — a blocked task never makes a client At risk; delivery reads as Watch", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  // Aurora's only trouble is a project with a blocked task on it.
  const watched = rowFor(watchedOrganizationId);
  assert.equal(
    watched
      .querySelector("[data-relationship-signal]")
      ?.getAttribute("data-relationship-signal"),
    "watch",
    "delivery trouble was folded into risk — four of five clients then turn red and the column stops meaning anything",
  );
  assert.match(
    watched.querySelector("[data-org-why]")?.textContent ?? "",
    /1 project at risk/u,
    "the Watch reading does not say what it is watching",
  );

  // And the other half of the split, or the first half proves nothing: money
  // and the contract DO read as risk.
  const atRisk = rowFor(referencedOrganizationId);
  assert.equal(
    atRisk
      .querySelector("[data-relationship-signal]")
      ?.getAttribute("data-relationship-signal"),
    "risk",
    "a contract entering its lead window with no decision-maker does not read as risk — the split has collapsed the other way",
  );
});

test("C18 — a client with no meeting ever says so; contact is never inferred", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  // WHAT IS ASSERTABLE HERE, and what is not, said plainly rather than faked.
  // The recon's C18 asks for a meeting scheduled for today, still `upcoming`,
  // and expects the screen to refuse to count it as contact. That record cannot
  // reach this screen: `MeetingLoopSurfaceSchema` splits `upcoming` as a
  // `CalendarEventProjection` and `completed` as an `ImportedMeeting`
  // (`contracts/src/meeting-loop.ts:410-425`), and `relationship.workspace`
  // carries only the latter — so an `ImportedMeeting` is a meeting that already
  // happened, BY CONSTRUCTION. The upcoming case is reachable only through
  // `client.getMeetingLoop()`, an IPC call outside the snapshot this screen
  // reads.
  //
  // What IS reachable, and is the half that matters for a lie: with no meeting
  // in the projection the row must say nothing was recorded as contact — never
  // a date, never a zero, and never silence that reads as "recently".
  const watched = rowFor(watchedOrganizationId);
  assert.match(
    watched.textContent ?? "",
    /nothing recorded as contact/u,
    "a client with no meeting on record does not say so",
  );
  assert.doesNotMatch(
    watched.textContent ?? "",
    /last contact/u,
    "a client never met is claiming a last contact",
  );
  // The reading itself, not only the cell — the same absence has to be the
  // reason it is being watched at all.
  assert.match(
    watched.querySelector("[data-org-why]")?.textContent ?? "",
    /nothing recorded as contact/u,
    "silence is not part of the reading",
  );
});

test("the deal cell sums per currency and never prints a zero", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  // The fixture's offer carries no confirmed price and the deal no estimate, so
  // nothing has put a number on it. That is NOT the same as being worth nothing.
  const row = rowFor(referencedOrganizationId);
  const total = row.querySelector<HTMLElement>("[data-org-deal-total]");
  assert.ok(total, "an open deal is drawn with no total beside it");
  assert.equal(
    total.textContent,
    "no value recorded",
    "an unpriced deal is rendered as an amount",
  );
  assert.doesNotMatch(
    total.textContent ?? "",
    /\b0\b/u,
    "nobody having put a number on a deal is being printed as zero",
  );

  const quiet = rowFor(quietOrganizationId);
  assert.match(
    quiet.textContent ?? "",
    /No open deal/u,
    "a client with no deal shows a blank where a sentence belongs",
  );
});

test("the table carries only fields every row can fill, and the reason stays visible", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");
  await switchToTable();
  await waitForCondition(
    () => container.querySelector("table[role='grid']") !== null,
    "the Table layout drew no table",
  );

  const table = container.querySelector<HTMLTableElement>("table[role='grid']");
  assert.ok(table, "no grid");
  const headers = [...table.querySelectorAll("th")].map((cell) =>
    (cell.textContent ?? "").trim(),
  );
  // `segment` and the main contact are optional in this product; a column of
  // dashes is emptiness rendered as densely as content.
  assert.deepEqual(
    headers,
    [
      "Organization",
      "Relationship",
      "Reading",
      "Open deals",
      "Projects",
      "Renewal",
      "Next step",
    ],
    "the table grew a column not every row can fill, or lost one it compares on",
  );
  const cells = [...table.querySelectorAll("td")].map((cell) =>
    (cell.textContent ?? "").trim(),
  );
  assert.equal(
    cells.filter((text) => text === "—" || text === "").length,
    0,
    "a table cell is a dash — where absence means something it has to say what",
  );

  // The reason survives the layout switch AS TEXT. In the prototype the Table
  // layout carried it in a `title` and nowhere else, so the whole informational
  // content of the reading vanished for a keyboard and for touch.
  const row = rowFor(referencedOrganizationId);
  assert.match(
    row.querySelector("[data-org-why]")?.textContent ?? "",
    /decision-maker never recorded/u,
    "the Table layout dropped the reason",
  );
});

test("no explanation anywhere on this screen survives as a `title`", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  const surface = container.querySelector("[data-organizations-surface]");
  assert.ok(surface, "the surface is not mounted");
  // Compared as a BOOLEAN, not as the node: `assert.equal(node, null)` hands
  // vitest a DOM element to serialise for its diff and the worker dies without
  // reporting anything, which this repository has already paid for once.
  assert.equal(
    surface.querySelector("[title]") === null,
    true,
    "an explanation survived as a `title` attribute — a native tooltip does not exist for a keyboard or for touch",
  );
  await switchToTable();
  await waitForCondition(
    () => container.querySelector("table[role='grid']") !== null,
    "the Table layout drew no table",
  );
  assert.equal(
    container.querySelector("[data-organizations-surface] [title]") === null,
    true,
    "the Table layout put an explanation back into a `title`",
  );
});

test("a row states the whole of itself to somebody who cannot see the layout", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  const label =
    rowFor(referencedOrganizationId).getAttribute("aria-label") ?? "";
  // The visual row separates the reading from its reason, the deal count from
  // its money and the renewal phrase from the contract it names. Read out on
  // its own a badge says nothing, so the name carries all of it.
  for (const [what, pattern] of [
    ["the client's name", /Northstar Industries/u],
    ["the declared relationship", /Active/u],
    ["the computed reading", /At risk/u],
    ["the reason for it", /decision-maker never recorded/u],
    ["what is open", /open deal/u],
    ["the contract", /renewal Wsparcie i utrzymanie platformy/u],
    ["the next step", /next step:/u],
    ["who the contact is", /main contact Piotr Zielinski/u],
  ] as const) {
    assert.match(
      label,
      pattern,
      `the row's accessible name does not carry ${what}`,
    );
  }
});

test("Enter on a row opens that client's context", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  const row = rowFor(referencedOrganizationId);
  await act(async () => {
    row.click();
  });
  assert.equal(
    row.getAttribute("aria-selected"),
    "true",
    "clicking a client row selects nothing",
  );
  // The gesture the retired ledger spelled by hand and this screen takes from
  // `useListNavigation`, the shell's one roving-tab-stop primitive.
  await act(async () => {
    row.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await waitForCondition(
    () => container.querySelector("[data-organizations-surface]") === null,
    "Enter on a client row left the collection on screen, so nothing was opened",
  );
  // The client's own context, not the destination it lives on. This harness
  // supplies no `organization.operationalOverview` fixture, so the record page
  // itself lands on its unavailable branch — which is exactly why the assertion
  // is about WHICH CONTEXT IS OPEN rather than about the page's heading: the
  // name is in the shell because the row named it on the way in.
  assert.equal(
    (container.textContent ?? "").includes("Northstar Industries"),
    true,
    "Enter opened a context that does not name the client the row was for",
  );
});

test("an unavailable slice says why and offers a way back, and never an empty list", async () => {
  const withoutRelationships = { ...queries };
  delete (withoutRelationships as Record<string, unknown>)[
    "relationship.workspace"
  ];
  await openOrganizations(withoutRelationships);
  await waitForCondition(
    () =>
      container.querySelector("[data-organizations-unavailable]") !== null ||
      rows().length > 0,
    "Organizations neither drew rows nor said the slice was unavailable",
  );

  assert.equal(
    rows().length,
    0,
    "Organizations drew rows from a slice that could not be read",
  );
  const message = container.querySelector<HTMLElement>(
    "[data-organizations-unavailable]",
  );
  assert.ok(
    message,
    "Organizations turned an unavailable slice into an empty screen rather than saying so",
  );
  // The slice's OWN message, not a sentence written on this screen: a fixed
  // line names nothing a reader can act on.
  assert.ok(
    (message.textContent ?? "").trim().length > 20,
    "the unavailable branch printed no reason",
  );
  const retry = [
    ...(container
      .querySelector("[data-organizations-surface]")
      ?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ].find((button) => /try again/iu.test(button.textContent ?? ""));
  assert.ok(retry, "the unavailable branch offers no way to retry");
});

test("a failed work plane is stated, never rendered as a healthy client", async () => {
  const withoutWork = { ...queries };
  delete (withoutWork as Record<string, unknown>)["work.overview"];
  await openOrganizations(withoutWork);
  await waitForCondition(() => rows().length > 0, "no client row");

  // Aurora reads `Watch` on a healthy workspace because one of its projects is
  // at risk. With the work plane unreadable the reading must not fall through
  // to `On track` — the count of deliveries survives, the health of them does
  // not, and the row has to say which.
  const watched = rowFor(watchedOrganizationId);
  assert.notEqual(
    watched
      .querySelector("[data-relationship-signal]")
      ?.getAttribute("data-relationship-signal"),
    "good",
    "a client whose deliveries could not be read came back as healthy",
  );
  assert.match(
    watched.querySelector("[data-org-why]")?.textContent ?? "",
    /delivery could not be read/u,
    "the failed read was swallowed instead of stated",
  );
  assert.match(
    watched.textContent ?? "",
    /open tasks unavailable/u,
    "the open-task count went to zero rather than saying it is unknown",
  );
});

test("the kinds with no home are still on the screen after the retirement", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  const surface = container.querySelector("[data-organizations-surface]");
  assert.ok(surface, "the surface is not mounted");
  // The retirement is only for kinds that HAVE a home. `decision`,
  // `impact_review` and `recurrence` carry no edge to an organisation, and a
  // radar candidate rides `snapshot.radar` — which the shell inspector never
  // resolves a selection against. Removing these regions would take built,
  // reachable capability off the product with nothing replacing it.
  assert.ok(
    surface.querySelector("#supporting-title"),
    "the ledger holding the records with no home is gone",
  );
  assert.ok(
    surface.querySelector("#review-title"),
    "the review rail is gone, and a radar candidate has nowhere else to be seen or resolved",
  );
  // And the create panel keeps its mount: it is the only authoring path there
  // is for every one of those kinds.
  assert.ok(
    surface.querySelector(".strategic-create-toggle"),
    "the create panel lost its mount, so four record kinds became unauthorable",
  );
});

test("the kinds that DID get a home are gone from this screen", async () => {
  await openOrganizations();
  await waitForCondition(() => rows().length > 0, "no client row");

  const surface = container.querySelector("[data-organizations-surface]");
  assert.ok(surface, "the surface is not mounted");
  const text = surface.textContent ?? "";
  // Each of these is a record in the fixture, and each now has a screen of its
  // own. A collection that keeps drawing them is four screens reading one array
  // four ways — this repository's named `restated-shape-drift` family.
  for (const [kind, title] of [
    ["the opportunity", "Program porządkowania bezpieczeństwa informacji"],
    ["the offer", "Wariant z dyżurem nocnym"],
    ["the person", "Marta Nowak"],
  ] as const) {
    assert.equal(
      text.includes(title),
      false,
      `${kind} is still rendered by the collection although it has a screen of its own`,
    );
  }
  // The renewal keeps a PHRASE on the client row — "start in N days" is a fact
  // about the relationship — but not a row of its own.
  assert.equal(
    surface.querySelectorAll("#ledger-title").length,
    0,
    "the renewals-and-facts ledger is still drawn",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DECLARATIONS THAT BREAK THE PACKAGED TEXT-SCALING GATE, pinned.
//
// None is visible to this harness: happy-dom computes no layout, so
// `scrollWidth` and `clientWidth` are both zero here and an assertion about them
// would measure nothing while looking like a measurement. What CAN be asserted
// without a browser is the SHAPE of the sheet — and the shape is the whole
// defect. The real gate is `scripts/run-packaged-alpha-smoke.mjs:786-795`, on
// three operating systems; this is the cheap guard that fails in one second
// instead of fifteen minutes.
//
// Walked up from this file rather than taken from `import.meta.url` directly:
// the Vitest harness rewrites that to an http URL, and `readFileSync` then fails
// with a message about schemes rather than about the sheet.
const packageRoot = (() => {
  let directory = path.dirname(
    fileURLToPath(import.meta.url.replace(/^http[^/]*\/\/[^/]+/u, "file://")),
  );
  while (!existsSync(path.join(directory, "src", "styles.css"))) {
    const parent = path.dirname(directory);
    assert.notEqual(parent, directory, "desktop-ui package root not found");
    directory = parent;
  }
  return directory;
})();

// Comments stripped FIRST. Both declarations are explained in the sheet by name,
// and a guard that reads the explanation as the thing it forbids fires on the
// fix rather than on the defect — which is how a guard gets deleted instead of
// fixed.
const sheet = readFileSync(
  path.join(packageRoot, "src", "organizations", "organizations.module.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//gu, "");

const declarationsOf = (selector: string): string => {
  const at = sheet.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `${selector} is not in the Organizations sheet`);
  return sheet.slice(at, sheet.indexOf("}", at));
};

test("the Organizations sheet keeps the declarations that stop the surface sizing itself", () => {
  // 1. Inline-size containment makes an element's own intrinsic width ignore its
  //    contents. `.surface-scroll > *` centres every child with
  //    `margin-inline: auto`, which turns off stretch, so a contained list
  //    resolves to a fit-content width of ZERO and every row inside it overflows
  //    a box with no width.
  assert.equal(
    /container-type/u.test(sheet),
    false,
    "`container-type` is in the Organizations sheet — with `margin-inline: auto` above it that sizes the list from nothing and the surface overflows itself",
  );
  // 2. A row track capped in rem is a width that doubles with the text while the
  //    row it lives in does not. Every elastic track is a ratio; the avatar is a
  //    glyph and is the one thing that must not shrink.
  const tracks = /grid-template-columns:([^;]*);/u.exec(
    declarationsOf(".row"),
  )?.[1];
  assert.ok(tracks, "the Organizations row stopped being a grid");
  assert.equal(
    (tracks.match(/rem/gu) ?? []).length,
    1,
    "a row track other than the avatar is sized in rem — a rem cap doubles with the text while the row it lives in does not, so the cells stop fitting and the surface overflows itself",
  );
  // 3. Automatic table layout takes its width from the widest unbreakable cell,
  //    and one long next-step sentence is enough to push the table past the
  //    surface.
  assert.equal(
    /table-layout: fixed/u.test(declarationsOf(".table")),
    true,
    "the Organizations table went to automatic layout — one long sentence then sets a width the surface cannot hold",
  );
  // 4. Every bar wraps. A non-wrapping flex row's min-content is the sum of its
  //    children, which is a number nothing can shrink.
  for (const bar of [".crumbbar", ".viewbar", ".filter"]) {
    assert.match(
      declarationsOf(bar),
      /flex-wrap: wrap/u,
      `${bar} stopped wrapping — its min-content becomes the sum of its children and the surface overflows itself at 200% text`,
    );
  }
  // 5. And the list declares a definite width rather than taking one from the
  //    rows, which for a grid is the sum of its tracks.
  assert.match(
    declarationsOf(".list"),
    /width: 100%/u,
    "the list stopped declaring its width, so it is sized by its rows instead of sizing them",
  );
});
