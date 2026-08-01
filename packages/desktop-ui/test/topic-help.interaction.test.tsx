import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { StrategicRecordIdSchema } from "@constellation/contracts";

import type { ScenarioFixtures } from "../src/client/scenario-client.js";
import { helpTopics } from "../src/help/help-topics.js";
import { assertNoNode, assertSameNode } from "./dom-assert.js";
import {
  opportunityRecordId,
  populatedRelationshipWorkspace,
  populatedShellQueries,
  principalId,
  projectionResponse,
  referencedOrganizationId,
  spaceId,
  workspaceId,
} from "./shell-fixture.js";

/* ASSERTION C24 — EVERY QUESTION MARK IS A REAL BUTTON, POINTING AT A TOPIC
 * THAT EXISTS, AND HELP NEVER RETREATS INTO `title=`.
 *
 * The claim has two halves and a single-half version of it is worthless:
 *
 *   • Looking only at what IS a trigger passes trivially when a trigger was
 *     deleted or turned into a `<span title="…">` — the set to inspect simply
 *     gets smaller. So each route's set of `data-help-topic` values is compared
 *     BOTH WAYS against the topics that route is supposed to carry.
 *   • Looking only at the topics passes over an explanation that came back as a
 *     hover tooltip somewhere else on the same screen. So every route is also
 *     swept for `title=` outright, including the two CRM routes that carry no
 *     help at all.
 *
 * WHY EVERY ROUTE WAITS FOR REAL CONTENT FIRST. A lazy surface can mount empty
 * and stay green in three gates at once; a screen with no rows has no anchors,
 * so "no `title=` and no stray trigger" would be true of a blank page. Each
 * route below waits for the thing its help hangs beside before it asserts.
 */

const KNOWN_TOPIC_IDS = new Set<string>(helpTopics.map((topic) => topic.id));

/* The name a screen reader would give the control.
 *
 * `textContent` ALONE IS NOT THAT NAME, and the difference is the whole point
 * here: `<button><span aria-hidden="true">?</span></button>` has a text content
 * of "?" and an accessible name of NOTHING. A check that fell back to
 * `textContent` would call that button named, which is the shape of assertion
 * this wave keeps catching — green while the guarantee is broken. So hidden
 * subtrees are removed before the text is read, on a clone, so the assertion
 * cannot alter the screen it is measuring.
 */
const accessibleName = (element: Element): string => {
  const labelled = element.getAttribute("aria-label");
  if (labelled !== null) return labelled.trim();
  const clone = element.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return (clone.textContent ?? "").trim();
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

const waitFor = async (
  ready: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  assert.fail(message);
};

/* THE FIXTURE'S ONLY CONTRACT IS ALREADY INSIDE ITS LEAD WINDOW, and
 * `Add to contract` is offered to contracts that are NOT yet — `canAmend` is
 * `startAction > 0` (`renewals-view.ts:130`). So the anchor the amendment topic
 * hangs on does not exist on the shared fixture at all, and the first run of
 * this file said so rather than passing with a topic nobody could reach. One
 * watching contract is composed here, expiring far enough out that time cannot
 * move it into the other section and turn this file red on a date nobody chose.
 */
const watchingRenewalId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000000f1",
);

const watchingQueries: ScenarioFixtures["queries"] = {
  ...populatedShellQueries,
  "relationship.workspace": projectionResponse({
    ...populatedRelationshipWorkspace,
    records: [
      ...populatedRelationshipWorkspace.records,
      {
        workspaceId,
        spaceId,
        createdBy: principalId,
        recordState: "active" as const,
        version: 1,
        createdAt: "2026-06-01T08:00:00.000Z",
        updatedAt: "2026-07-20T14:30:00.000Z",
        id: watchingRenewalId,
        kind: "renewal" as const,
        title: "Umowa utrzymaniowa — druga lokalizacja",
        organizationId: referencedOrganizationId,
        scope: "Wsparcie 24/7, dwa środowiska",
        ownerPrincipalId: principalId,
        evidenceSourceIds: [],
        cycleKey: `${referencedOrganizationId}:2099-01-31`,
        state: "watching" as const,
        expiresAt: "2099-01-31T00:00:00.000Z",
        leadTimeDays: 60,
      },
    ],
  }),
};

const mountShell = async (
  queries: ScenarioFixtures["queries"] = populatedShellQueries,
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries });
  const snapshot = await loadDesktopSnapshot(client);
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
};

const goTo = async (surface: string): Promise<void> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === surface);
  assert.ok(item, `no navigation target rendered for ${surface}`);
  await act(async () => {
    item.click();
  });
};

const surfaceNode = (selector: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(selector);
  assert.ok(node, `${selector} is not on screen`);
  return node;
};

/** Every help anchor drawn on the screen, as topic ids, sorted. */
const topicsOn = (scope: HTMLElement): string[] =>
  [...scope.querySelectorAll<HTMLElement>("[data-help-topic]")]
    .map((node) => node.dataset.helpTopic ?? "")
    .sort();

const assertHelpContract = (scope: HTMLElement, expected: string[]): void => {
  // 1. The topics on this screen, both directions. A count would pass over a
  //    swap, and a subset check would pass over a deleted trigger.
  assert.deepEqual(
    topicsOn(scope),
    [...expected].sort(),
    "the help topics anchored on this screen are not the ones it is supposed to carry",
  );

  // 2. Every anchor is a REAL button that announces it opens a dialog, with a
  //    name, pointing at a topic that exists.
  for (const anchor of scope.querySelectorAll<HTMLElement>(
    "[data-help-topic]",
  )) {
    const id = anchor.dataset.helpTopic ?? "";
    assert.ok(
      KNOWN_TOPIC_IDS.has(id),
      `a help trigger points at "${id}", which is not a topic that exists`,
    );
    const trigger = anchor.querySelector('[aria-haspopup="dialog"]');
    assert.ok(
      trigger,
      `the help anchor for ${id} opens nothing — it is decoration`,
    );
    assert.equal(
      trigger.tagName,
      "BUTTON",
      `the help trigger for ${id} is a <${trigger.tagName.toLowerCase()}>, not a button — only a button is reachable by keyboard and announced as a control`,
    );
    assert.ok(
      accessibleName(trigger).length > 0,
      `the help trigger for ${id} has no accessible name`,
    );
  }

  // 3. Nothing else on the screen claims to open a dialog without being a
  //    button either — help is not the only control this rule binds.
  for (const trigger of scope.querySelectorAll('[aria-haspopup="dialog"]')) {
    assert.equal(
      trigger.tagName,
      "BUTTON",
      `something that is not a button announces itself as opening a dialog: ${trigger.outerHTML.slice(0, 120)}`,
    );
    assert.ok(
      accessibleName(trigger).length > 0,
      `a dialog trigger with no accessible name reached the screen: ${trigger.outerHTML.slice(0, 120)}`,
    );
  }

  // 4. AND HELP NEVER RETREATS INTO `title=`. A tooltip does not exist for a
  //    keyboard, for touch, or for anybody not hovering.
  const titled = [...scope.querySelectorAll("[title]")].map((node) =>
    node.outerHTML.slice(0, 160),
  );
  assert.deepEqual(
    titled,
    [],
    `an explanation survived as a \`title\` attribute:\n${titled.join("\n")}`,
  );
};

test("the client list carries the reading's topic, and nothing hides in a title", async () => {
  await mountShell();
  await goTo("organizations");
  await waitFor(
    () => container.querySelector("[data-org-row]") !== null,
    "Organizations drew no client row, so its anchors were never on screen",
  );
  assertHelpContract(surfaceNode("[data-organizations-surface]"), [
    "relationship-reading",
  ]);
});

test("the board carries all three money topics from §1.3", async () => {
  await mountShell();
  await goTo("pipeline");
  await waitFor(
    () => container.querySelector("[data-pipeline-card]") !== null,
    "the board drew no deal card, so its anchors were never on screen",
  );
  const board = surfaceNode("[data-pipeline-surface]");
  // The unconfigured-stage topic hangs on the warning tag and appears with it.
  // Asserting the set below without this would let a fixture with no stray
  // stage quietly turn a three-topic claim into a two-topic one.
  assert.ok(
    board.querySelector("[data-pipeline-stray-count]"),
    "this fixture puts no deal on an unconfigured stage, so the tag its topic hangs on is absent",
  );
  assertHelpContract(board, [
    "price-basis",
    "stage-sums",
    "unconfigured-stage",
  ]);
});

test("Renewals carries the lead time and the amendment", async () => {
  await mountShell(watchingQueries);
  await goTo("renewals");
  await waitFor(
    () => container.querySelector("[data-renewal-row]") !== null,
    "Renewals drew no contract row, so its anchors were never on screen",
  );
  const screen = surfaceNode("[data-renewals-surface]");
  // The amendment topic stands at `Add to contract`, which only a contract that
  // can be amended draws.
  const amend = [...screen.querySelectorAll("button")].filter(
    (node) => (node.textContent ?? "").trim() === "Add to contract",
  );
  assert.equal(
    amend.length,
    1,
    `expected exactly one amendable contract in the fixture, found ${amend.length} — the expected topic set below is counted per row`,
  );
  assertHelpContract(screen, ["lead-time", "amendment"]);
});

test("People carries no help of its own, and still no title anywhere", async () => {
  await mountShell();
  await goTo("people");
  await waitFor(
    () => container.querySelector("[data-person-row]") !== null,
    "People drew no row, so the sweep below would have measured an empty screen",
  );
  assertHelpContract(surfaceNode("[data-people-surface]"), []);
});

test("the deal's own record carries no help, and no tooltip either", async () => {
  await mountShell();
  await goTo("pipeline");
  await waitFor(
    () => container.querySelector("[data-pipeline-card]") !== null,
    "the board never mounted",
  );
  const card = container.querySelector<HTMLElement>(
    `[data-pipeline-card="${opportunityRecordId}"]`,
  );
  assert.ok(card, "the seeded deal has no card on the board");
  await act(async () => {
    card.click();
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitFor(
    () => container.querySelector('[data-record-kind="opportunity"]') !== null,
    "the deal never opened on its own record",
  );
  assertHelpContract(surfaceNode('[data-record-kind="opportunity"]'), []);
});

/* MEETINGS joins this file rather than growing its own copy of the contract.
 *
 * It is the first NON-CRM route here, and it is the reason the array, the
 * component and this file lost their `crm` prefix: a second contract helper
 * beside this one is the restated-shape defect, and a Meetings topic measured
 * under a name that says CRM is an assertion whose name lies.
 *
 * It mounts the surface directly instead of navigating the shell, because the
 * shell's scenario client answers `getMeetingLoop` with an empty loop — and a
 * screen with no rows has no anchors, so "no title and no stray trigger" would
 * be true of a blank page.
 */
test("Meetings carries the attachment topic, and nothing hides in a title", async () => {
  const now = Date.now();
  const { MeetingsSurface } = await import("../src/MeetingsSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { meetingLoopFixture, backlinksFixture } =
    await import("./meetings-fixture.js");
  const base = createScenarioClient({ queries: {} });
  const inspectorHost = document.createElement("div");
  inspectorHost.className = "inspector";
  document.body.append(inspectorHost);
  try {
    root = createRoot(container);
    mounted = true;
    await act(async () => {
      root.render(
        createElement(MeetingsSurface, {
          client: {
            ...base,
            getJamieStatus: async () => ({
              configured: true,
              scope: "personal" as const,
            }),
            getMeetingLoop: async () => meetingLoopFixture(now),
            runQuery: async (query) =>
              query.queryName === "document.backlinks"
                ? projectionResponse(backlinksFixture(now))
                : base.runQuery(query),
          },
          inspectorHost,
          onInspectorOpen: () => undefined,
          onMeetingSelected: () => undefined,
        }),
      );
    });
    await waitFor(
      () => container.querySelector(".meeting-result-row") !== null,
      "Meetings drew no result row, so the sweep would have measured an empty screen",
    );
    // The help hangs in the inspector, so the inspector has to be open before
    // either half of the contract means anything.
    await act(async () => {
      container.querySelector<HTMLElement>(".meeting-result-row")!.click();
    });
    await waitFor(
      () => inspectorHost.querySelector(".meeting-result-notes") !== null,
      "the attached-notes section never opened",
    );
    assertHelpContract(container, []);
    assertHelpContract(inspectorHost, ["attached-notes"]);
  } finally {
    inspectorHost.remove();
  }
});

/* SOURCES joins this file for the same reason Meetings did: one contract, one
 * place. Two topics hang on this screen — what a source IS, at the list header
 * where decision #21 cut the lecture that used to say it, and what the three
 * availability states MEAN, at the badge where that explanation used to live in
 * a `title=`. The `title=` sweep below is therefore not a formality here: it is
 * the assertion that the tooltip did not come back.
 *
 * Mounted directly rather than navigated to, on the Library harness fixture:
 * the shell's scenario client answers `knowledge.list` with no sources, and a
 * screen with no rows has no anchors — so "no title and no stray trigger" would
 * be true of a blank page.
 */
test("Sources carries the two Knowledge topics, and nothing hides in a title", async () => {
  const { SourcesReading } = await import("../src/library/SourcesReading.js");
  const { librarySources } = await import("../src/dev/library-fixture.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(SourcesReading, {
        client: undefined,
        snapshot: {
          ...workHarnessSnapshot,
          knowledge: {
            kind: "ready",
            data: {
              kind: "knowledge.list",
              spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
              folders: [],
              sources: librarySources(),
              documents: [],
            },
          },
        },
        onReload: async () => undefined,
        onFailure: () => undefined,
      }),
    );
  });
  await waitFor(
    () => container.querySelector("[data-source-row]") !== null,
    "Sources drew no row, so the sweep below would have measured an empty screen",
  );
  // The availability topic hangs in the READER, so the reader has to be open
  // before either half of the contract means anything. It opens on the first
  // row in render order by itself; this asserts that rather than assuming it.
  assert.ok(
    container.querySelector("[data-source-reader]"),
    "no source opened in the reading panel, so its help anchor was never drawn",
  );
  assertHelpContract(container, ["sources", "source-availability"]);
});

test("a topic opens as a named dialog with one paragraph, and Escape hands the focus back", async () => {
  await mountShell();
  await goTo("renewals");
  await waitFor(
    () => container.querySelector("[data-renewal-row]") !== null,
    "Renewals drew no contract row",
  );
  const anchor = container.querySelector<HTMLElement>(
    '[data-help-topic="lead-time"]',
  );
  assert.ok(anchor, "the lead time has no help anchor");
  const trigger = anchor.querySelector<HTMLElement>("button");
  assert.ok(trigger);
  const topic = helpTopics.find((entry) => entry.id === "lead-time");
  assert.ok(topic);
  assert.equal(
    accessibleName(trigger),
    topic.question,
    "the trigger does not read as the question the panel answers",
  );

  await act(async () => {
    trigger.click();
  });
  // Portaled to <body>: looking for it inside `container` would find nothing
  // and the assertion would fail for the wrong reason.
  const panel = document.body.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(panel, "the trigger opened no dialog");
  assert.equal(panel.getAttribute("aria-label"), topic.question);

  // ONE PARAGRAPH, and the paragraph is the answer. #35's cap is 180 characters
  // in one paragraph; a panel free to render two of them walks through the cap
  // while every length assertion stays green.
  const paragraphs = [...panel.querySelectorAll("p")];
  assert.equal(
    paragraphs.length,
    1,
    `the help panel renders ${paragraphs.length} paragraphs — the topic is capped at one`,
  );
  assert.equal((paragraphs[0]?.textContent ?? "").trim(), topic.answer);

  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  assertNoNode(
    document.body.querySelector('[role="dialog"]'),
    "Escape did not close the help panel",
  );
  assertSameNode(
    document.activeElement,
    trigger,
    "closing the help panel dropped the focus instead of returning it",
  );
});

/* THE NOTES READING CARRIES THE ARRANGEMENT TOPIC — decision #30's `?`.
 *
 * It mounts the reading directly rather than navigating the shell, for the same
 * reason Meetings does: the shell's scenario client answers `knowledge.list`
 * with nothing, the screen then WITHDRAWS its switcher — deliberately, because
 * two of the three axes come from that read — and "no stray anchor" would be
 * true of a screen that draws no anchor at all.
 *
 * The `title=` half of the contract is the one this screen had to be built
 * around: a folder name truncates in a narrow column, and the obvious fix is a
 * tooltip carrying the full path. #35's whole objection is that a tooltip does
 * not exist for a keyboard, for touch, or for anybody not hovering — so the
 * path rides the accessible name instead, and this assertion is what keeps it
 * there.
 */
test("the Notes reading carries the arrangement topic, and no path hides in a title", async () => {
  const { NotesReading } = await import("../src/library/NotesReading.js");
  const { workHarnessSnapshot } =
    await import("../src/dev/harness-snapshot.js");
  const { libraryFolders, librarySummaries, libraryDocuments } =
    await import("../src/dev/library-fixture.js");
  const spaceId = workHarnessSnapshot.bootstrap.spaces[0]!.id;
  const snapshot = {
    ...workHarnessSnapshot,
    documents: {
      kind: "ready",
      data: { kind: "document.list", items: libraryDocuments(spaceId) },
    },
    knowledge: {
      kind: "ready",
      data: {
        kind: "knowledge.list",
        spaceId,
        sources: [],
        folders: libraryFolders(),
        documents: librarySummaries({
          task: { id: "00000000-0000-4000-8000-000000004401", label: "A task" },
          project: {
            id: "00000000-0000-4000-8000-000000004402",
            label: "A project",
          },
        }),
      },
    },
  };
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(NotesReading, {
        client: undefined,
        snapshot,
        inspectorHost: null,
        onInspectorOpen: () => undefined,
        onEntityActivate: () => undefined,
        onReload: async () => undefined,
        onFailure: () => undefined,
      } as never),
    );
  });
  await waitFor(
    () => container.querySelector('[role="treeitem"]') !== null,
    "the Notes reading drew no folder tree, so the sweep would have measured an empty screen",
  );
  assertHelpContract(surfaceNode("[data-notes-screen]"), ["note-arrangement"]);
});
