import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { ScenarioFixtures } from "../src/client/scenario-client.js";
import {
  GrantIdSchema,
  PrincipalIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
} from "@constellation/contracts";

import {
  personRecordId,
  populatedRelationshipWorkspace,
  populatedShellQueries,
  populatedWorkOverview,
  principalId,
  projectionResponse,
  referencedOrganizationId,
  spaceId,
  workspaceId,
} from "./shell-fixture.js";

// WHY THIS FILE EXISTS AT ALL, stated once so nobody deletes it as redundant.
//
// A lazy surface can ship COMPLETELY EMPTY and stay green in three gates at
// the same time. `surface-registry-render.test.ts` renders with
// `renderToStaticMarkup`, which never resolves `React.lazy`, so for a lazy id
// it measures the Suspense fallback and nothing else. Its companion — "no two
// destinations render the same screen" — compares those same fallbacks, which
// differ only by their label. And the packaged smoke's per-surface check is
// "the first visible child of the work plane exists", which a placeholder
// satisfies.
//
// So this file mounts the REAL shell, clicks the REAL navigation item and
// waits until a person row is in the DOM before asserting anything. Every
// assertion below was broken on purpose before it was trusted, and the failure
// message it produced is recorded in the pull request.

const loosePersonId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000c1",
);
const meetingRecordId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000c2",
);
const waitingOnPersonTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-0000000000c3",
);
const memberPrincipalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000c4",
);
const agentPrincipalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000c5",
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

/** Four records the shared fixture does not carry, composed HERE rather than
 *  added to `shell-fixture.ts`: each exists to make one branch of this screen
 *  reachable, and none of them is a fact about the workspace every other test
 *  should start from.
 *
 *   - a person with NO organization, so the loose group is on screen;
 *   - a meeting that happened, with both people on it, so participation and
 *     "last met" are drawn from something rather than assumed. */
const relationships = {
  ...populatedRelationshipWorkspace,
  records: [
    ...populatedRelationshipWorkspace.records,
    {
      ...strategicRecordBase,
      id: loosePersonId,
      kind: "person" as const,
      name: "Tomasz Bez Firmy",
      role: "Doradca",
      email: "tomasz@example.test",
    },
    {
      ...strategicRecordBase,
      id: meetingRecordId,
      kind: "meeting" as const,
      meeting: {
        id: meetingRecordId,
        workspaceId,
        spaceId,
        connectionId: "scenario",
        externalMeetingId: "scenario-1",
        title: "Przegląd zakresu",
        startedAt: "2026-07-15T09:00:00.000Z",
        participants: [
          { externalId: "e1", name: "Marta Nowak", personId: personRecordId },
          {
            externalId: "e2",
            name: "Tomasz Bez Firmy",
            personId: loosePersonId,
          },
        ],
        organizationId: referencedOrganizationId,
        workItems: [],
        contentHash: "a".repeat(64),
        triage: "ready" as const,
        missingComponents: [],
        version: 1,
        updatedAt: "2026-07-15T10:00:00.000Z",
      },
    },
  ],
};

/** An open task WAITING ON a person, by reference. `waitingOn` is structured
 *  in this product — `{kind, label, recordId}` — so the row's claim is a real
 *  edge rather than a surname that happened to match. */
const work = {
  ...populatedWorkOverview,
  tasks: [
    ...populatedWorkOverview.tasks,
    {
      ...populatedWorkOverview.tasks[0]!,
      id: waitingOnPersonTaskId,
      title: "Potwierdź listę uczestników warsztatu i okno terminowe",
      operationalState: "waiting" as const,
      completionState: "open" as const,
      waitingOn: {
        kind: "person" as const,
        label: "Marta Nowak",
        recordId: personRecordId,
        direction: "waiting_on_them" as const,
        expectedAt: "2026-07-28T09:00:00.000Z",
      },
    },
  ],
};

/** A workspace MEMBER and an AGENT, in the vocabulary they really live in.
 *  Neither is a Person record, and the whole point of C20 is that neither ever
 *  becomes a row on this screen. */
const access = {
  kind: "workspace.access" as const,
  policyVersion: 1,
  currentPrincipalId: principalId,
  canManage: true,
  members: [
    {
      membershipId: "00000000-0000-4000-8000-0000000000d1",
      principalId: memberPrincipalId,
      displayName: "Kacper Members-Only",
      role: "owner" as const,
      status: "active" as const,
      version: 1,
      spaces: [],
    },
  ],
};

const agentAccess = {
  kind: "agent.access" as const,
  policyVersion: 1,
  workspaceVersion: 1,
  canManage: true,
  grants: [
    {
      grantId: GrantIdSchema.parse("00000000-0000-4000-8000-0000000000d2"),
      agentPrincipalId,
      displayName: "Agent Never-A-Person",
      preset: "observe" as const,
      capabilityScope: [],
      scopeStatus: "current" as const,
      missingFromPreset: [],
      status: "active" as const,
      credentialVersion: 1,
      version: 1,
      membershipId: "00000000-0000-4000-8000-0000000000d3",
      membershipVersion: 1,
      spaces: [],
    },
  ],
};

const queries = {
  ...populatedShellQueries,
  "relationship.workspace": projectionResponse(relationships),
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

const openPeople = async (
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
  ].find((node) => node.dataset.surface === "people");
  assert.ok(item, "no navigation target rendered for People");
  await act(async () => {
    item.click();
  });
  // The wait is the whole instrument: without it every assertion below would
  // be measuring the Suspense fallback, which is exactly the failure this file
  // exists to make impossible.
  await waitForCondition(
    () => container.querySelector("[data-people-surface]") !== null,
    "People never mounted into the work plane",
  );
};

const rows = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>("[data-person-row]"),
];

const navigateTo = async (surface: string): Promise<void> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === surface);
  assert.ok(item, `no navigation target rendered for ${surface}`);
  await act(async () => {
    item.click();
  });
};

test("C19 — the list really groups by organization, and a person with none is still on it", async () => {
  await openPeople();
  await waitForCondition(
    () => rows().length > 0,
    "People drew no person row at all",
  );

  const heads = [
    ...container.querySelectorAll<HTMLElement>("[data-people-group]"),
  ];
  assert.ok(
    heads.length >= 2,
    `only ${heads.length} group heading(s) — grouping cannot be observed`,
  );

  // A real organization heading, with the person underneath it rather than
  // beside it: grouping that does not nest is row-clustering.
  const named = heads.find(
    (head) => head.dataset.peopleGroup === referencedOrganizationId,
  );
  assert.ok(named, "the organization with people on it has no group heading");
  const namedGroup = named.parentElement;
  assert.ok(
    namedGroup?.querySelector(`[data-person-row="${personRecordId}"]`),
    "the person at that organization is not inside its group",
  );

  // And the loose person. The prototype's own defect was one step milder than
  // this — a control that promised grouping and did none; filtering the row
  // source on "has an organization" removes the record from the product with
  // no message at all.
  const loose = heads.find((head) => head.dataset.peopleGroup === "none");
  assert.ok(loose, "no heading for people with no organization recorded");
  assert.match(
    loose.textContent ?? "",
    /No organization recorded/u,
    "the loose group is unlabelled",
  );
  assert.ok(
    loose.parentElement?.querySelector(`[data-person-row="${loosePersonId}"]`),
    "the person with no organization is not on the screen",
  );
});

test("C20 — workspace members and agents are never people; the rows are the person arm exactly", async () => {
  await openPeople({
    ...queries,
    "workspace.access": projectionResponse(access),
    "agent.access": projectionResponse(agentAccess),
  });
  await waitForCondition(
    () => rows().length > 0,
    "People drew no person row at all",
  );

  const expected = new Set(
    relationships.records
      .filter(
        (record) => record.kind === "person" && record.recordState === "active",
      )
      .map((record) => record.id as string),
  );
  const drawn = new Set(
    rows()
      .map((row) => row.dataset.personRow ?? "")
      .filter(Boolean),
  );

  // Set equality in BOTH directions, not a count and not an absence check. A
  // count passes over a wholesale swap of the row source, and "the member is
  // not on screen" passes over a source that dropped half the people. The two
  // vocabularies are disjoint today; this is what pins them that way.
  assert.deepEqual(
    [...drawn].sort(),
    [...expected].sort(),
    "the People rows are not exactly the active `person` records of the projection",
  );
  assert.doesNotMatch(
    container.querySelector("[data-people-surface]")?.textContent ?? "",
    /Members-Only|Never-A-Person/u,
    "a workspace member or an agent reached the People screen — these are records in the graph, not application users",
  );
});

test("C21 — when the screen says you are waiting on somebody, it shows which task", async () => {
  await openPeople();
  await waitForCondition(
    () => rows().length > 0,
    "People drew no person row at all",
  );

  const row = rows().find((node) => node.dataset.personRow === personRecordId);
  assert.ok(row, "the person the task waits on has no row");
  const waiting = row.querySelector<HTMLElement>("[data-person-waiting]");
  assert.ok(
    waiting,
    "the waiting signal is missing although an open task waits on this person",
  );
  // The TASK, not a chip. A name-match — or a reference — with no proof beside
  // it is the silent control this screen exists to remove: the row still looks
  // correct and the claim becomes unverifiable.
  assert.match(
    waiting.textContent ?? "",
    /Potwierdź listę uczestników warsztatu/u,
    "the waiting signal names no task, so its claim cannot be checked",
  );

  // And the same claim reaches somebody who cannot see the row.
  assert.match(
    row.getAttribute("aria-label") ?? "",
    /you are waiting on them for: Potwierdź listę uczestników warsztatu/u,
    "the waiting claim is visual only",
  );
});

test("the group head states the client's facts, and its reading carries a reason in text", async () => {
  await openPeople();
  await waitForCondition(
    () => rows().length > 0,
    "People drew no person row at all",
  );

  const head = container.querySelector<HTMLElement>(
    `[data-people-group="${referencedOrganizationId}"]`,
  );
  assert.ok(head, "the organization group has no heading");
  assert.ok(
    head.querySelector("[data-relationship-signal]"),
    "the group head carries no reading",
  );
  // Not a `title`. A native tooltip does not exist for a keyboard or for
  // touch, and the badge on its own says nothing once half a list reports
  // something — the reason is the whole informational content.
  //
  // Compared as a BOOLEAN, not as the node: `assert.equal(node, null)` hands
  // vitest a DOM element to serialise for its diff and the worker dies without
  // reporting anything, which this repository has already paid for once.
  assert.equal(
    head.querySelector("[title]") === null,
    true,
    "an explanation survived as a `title` attribute",
  );
  assert.match(
    head.textContent ?? "",
    /deal|project|contract/u,
    "the group head states none of the organization's facts",
  );
  // The REASON, in the visible text. The seeded contract's lead window is open
  // and no decision-maker fact was ever recorded, so this is what the reading
  // computed — and a badge saying "At risk" with the reason removed is the
  // decoration this screen refuses to draw.
  assert.match(
    head.textContent ?? "",
    /decision-maker never recorded/u,
    "the reading states no reason where a reader can see it",
  );
});

test("an unavailable slice says why and offers a way back, and never an empty list", async () => {
  const withoutRelationships = { ...queries };
  delete (withoutRelationships as Record<string, unknown>)[
    "relationship.workspace"
  ];
  await openPeople(withoutRelationships);
  await waitForCondition(
    () =>
      container.querySelector("[data-people-unavailable]") !== null ||
      rows().length > 0,
    "People neither drew rows nor said the slice was unavailable",
  );

  assert.equal(
    rows().length,
    0,
    "People drew rows from a slice that could not be read",
  );
  const message = container.querySelector<HTMLElement>(
    "[data-people-unavailable]",
  );
  assert.ok(
    message,
    "People turned an unavailable slice into an empty screen rather than saying so",
  );
  // The slice's OWN message, not a sentence written on this screen: a fixed
  // line names nothing a reader can act on. `TasksSurface.tsx:419-430` is the
  // pattern this deliberately does not copy.
  assert.ok(
    (message.textContent ?? "").trim().length > 20,
    "the unavailable branch printed no reason",
  );
  const retry = [
    ...(container
      .querySelector("[data-people-surface]")
      ?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ].find((button) => /try again/iu.test(button.textContent ?? ""));
  assert.ok(retry, "the unavailable branch offers no way to retry");
});

test("a person opened from elsewhere is still in hand on arrival", async () => {
  await openPeople();
  await waitForCondition(
    () => rows().length > 0,
    "People drew no person row at all",
  );

  const row = rows().find((node) => node.dataset.personRow === personRecordId);
  assert.ok(row, "the person has no row to select");
  await act(async () => {
    row.click();
  });
  assert.equal(
    row.getAttribute("aria-selected"),
    "true",
    "clicking a person row selects nothing",
  );

  // Both CRM destinations draw strategic records, so moving between them keeps
  // the record in hand. This is the half of the ⌘K repoint that lives one layer
  // above the routing branch: the shell clears the strategic selection on every
  // destination change that is not a strategic one, and a People arrival that
  // clears it turns "open this person" back into "open the People screen".
  await navigateTo("organizations");
  await navigateTo("people");
  await waitForCondition(
    () => rows().length > 0,
    "People drew no rows after coming back to it",
  );
  const again = rows().find(
    (node) => node.dataset.personRow === personRecordId,
  );
  assert.equal(
    again?.getAttribute("aria-selected"),
    "true",
    "the selected person was dropped on the way back to People",
  );
});

// THE TWO DECLARATIONS THAT BROKE THE PACKAGED TEXT-SCALING GATE, pinned.
//
// Neither is visible to the interaction harness: happy-dom computes no layout,
// so `scrollWidth` and `clientWidth` are both zero here and an assertion about
// them would measure nothing while looking like a measurement. What CAN be
// asserted without a browser is the SHAPE of the sheet — and the shape is the
// whole defect. Both properties below made this surface wider than the box it
// sits in at 200% root font-size, with no descendant overflowing anything,
// which is exactly the report the Windows job produced.
//
// The real gate is `scripts/run-packaged-alpha-smoke.mjs:786-795`, on three
// operating systems. This is the cheap guard that fails in one second instead
// of fifteen minutes.
// Walked up from this file rather than taken from `import.meta.url` directly:
// the Vitest harness rewrites that to an http URL, and `readFileSync` then
// fails with a message about schemes rather than about the sheet.
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

// Comments stripped FIRST. Both of these declarations are explained in the
// sheet by name, and a guard that reads the explanation as the thing it forbids
// fires on the fix rather than on the defect — which is how a guard gets
// deleted instead of fixed.
const peopleSheet = readFileSync(
  path.join(packageRoot, "src", "people", "people.module.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//gu, "");

const declarationsOf = (selector: string): string => {
  const at = peopleSheet.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `${selector} is not in the People sheet any more`);
  return peopleSheet.slice(at, peopleSheet.indexOf("}", at));
};

test("the People sheet keeps the two declarations that made the surface wider than itself", () => {
  // 1. Inline-size containment makes an element's own intrinsic width ignore
  //    its contents. `.surface-scroll > *` gives every child an auto inline end
  //    margin, which turns off `stretch`, so a contained list
  //    resolved to a fit-content width of ZERO and every row inside it
  //    overflowed a box with no width.
  assert.equal(
    /container-type/u.test(peopleSheet),
    false,
    "`container-type` is back in the People sheet — with `margin-inline: auto` above it that sizes the list from nothing and the surface overflows itself",
  );
  // 2. A row track capped in rem is a width that doubles with the text while
  //    the row it lives in does not. Every elastic track is a ratio.
  const tracks = /grid-template-columns:([^;]*);/u.exec(
    declarationsOf(".row"),
  )?.[1];
  assert.ok(tracks, "the People row stopped being a grid");
  assert.equal(
    (tracks.match(/rem/gu) ?? []).length,
    1,
    "a People row track other than the avatar is sized in rem again — a rem cap doubles with the text while the row it lives in does not, so the cells stop fitting and the surface overflows itself",
  );
  // 3. Automatic table layout takes its width from the widest unbreakable cell,
  //    and one email address is enough to push the table past the surface.
  assert.equal(
    /table-layout: fixed/u.test(declarationsOf(".table")),
    true,
    "the People table went back to automatic layout — one long email then sets a width the surface cannot hold",
  );
});
