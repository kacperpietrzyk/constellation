import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { CommandEnvelope } from "@constellation/contracts";
import {
  StrategicRecordIdSchema,
  TaskIdSchema,
} from "@constellation/contracts";

import type { ScenarioFixtures } from "../src/client/scenario-client.js";
import {
  populatedRelationshipWorkspace,
  populatedShellQueries,
  principalId,
  projectionResponse,
  referencedOrganizationId,
  renewalRecordId,
  spaceId,
  waitingTaskId,
  workspaceId,
} from "./shell-fixture.js";

// WHY THIS FILE EXISTS AT ALL, stated once so nobody deletes it as redundant.
//
// A lazy surface can ship COMPLETELY EMPTY and stay green in three gates at the
// same time. `surface-registry-render.test.ts` renders with
// `renderToStaticMarkup`, which never resolves `React.lazy`, so for a lazy id it
// measures the Suspense fallback and nothing else. Its companion — "no two
// destinations render the same screen" — compares those same fallbacks, which
// differ only by their label. And the packaged smoke's per-surface check is
// "the first visible child of the work plane exists", which a placeholder
// satisfies.
//
// So this file mounts the REAL shell, clicks the REAL navigation item and waits
// until a renewal row is in the DOM before asserting anything. Every assertion
// below was broken on purpose before it was trusted, and the failure message it
// produced is recorded in the pull request — including a run against a
// heading-only placeholder, which must turn every one of them red.
//
// WHAT THE SHARED FIXTURE GIVES AND WHAT IT CANNOT. It carries exactly one
// renewal: expiry 2026-09-30 with a 90-day lead, so its window opened on
// 2 July 2026 and it stands in "Time to start" permanently — time runs one way,
// so that is the only stable side of that transition. Everything else this
// screen can be — a contract still before its lead, a closed one, a term
// renewed after its expiry, a contract nobody has started, a follow-up outside
// `task.list`'s page — is composed HERE, per test, and none of it is a fact
// about the workspace every other suite should start from.
//
// DATES IN COMPOSED RECORDS ARE FAR OUT ON PURPOSE. A "watching" contract with
// a near expiry becomes a "time to start" contract on a date nobody chose, and
// the test would then fail with no code change. 2099 keeps the reading stable
// for the lifetime of this file; every "due" case uses a window that has
// already opened, which only ever gets more true.

const strategicRecordBase = {
  workspaceId,
  spaceId,
  createdBy: principalId,
  recordState: "active" as const,
  version: 1,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-07-20T14:30:00.000Z",
};

const id = (suffix: string) =>
  StrategicRecordIdSchema.parse(`00000000-0000-4000-8000-0000000000${suffix}`);

const watchingNearId = id("e1");
const watchingFarId = id("e2");
const irrelevantId = id("e3");
const clippedTermId = id("e4");
const unstartedId = id("e5");
const detachedId = id("e6");
const unloadedTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-0000000000e7",
);

const renewal = (
  record: {
    readonly id: ReturnType<typeof id>;
    readonly title: string;
    readonly expiresAt: string;
    readonly leadTimeDays: number;
  } & Partial<{
    readonly state: "watching" | "renewed" | "not_renewing" | "irrelevant";
    readonly followUpTaskId: ReturnType<typeof TaskIdSchema.parse>;
    readonly termStartsAt: string;
    readonly termMonths: number;
    readonly cycleOrdinal: number;
  }>,
) => ({
  ...strategicRecordBase,
  kind: "renewal" as const,
  organizationId: referencedOrganizationId,
  scope: "Wsparcie 24/7, dwa środowiska",
  ownerPrincipalId: principalId,
  evidenceSourceIds: [],
  cycleKey: `${referencedOrganizationId}:${record.expiresAt.slice(0, 10)}`,
  state: "watching" as const,
  ...record,
});

const withRenewals = (
  ...records: readonly ReturnType<typeof renewal>[]
): typeof populatedRelationshipWorkspace => ({
  ...populatedRelationshipWorkspace,
  records: [
    ...populatedRelationshipWorkspace.records.filter(
      (record) => record.kind !== "renewal",
    ),
    ...records,
  ],
});

const queriesFor = (
  relationships: typeof populatedRelationshipWorkspace,
): ScenarioFixtures["queries"] => ({
  ...populatedShellQueries,
  "relationship.workspace": projectionResponse(relationships),
});

let container: HTMLDivElement;
let root: Root;
let mounted = false;
let issued: CommandEnvelope[] = [];

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  issued = [];
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

const openRenewals = async (
  queries: ScenarioFixtures["queries"] = queriesFor(
    populatedRelationshipWorkspace,
  ),
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({
    queries,
    executeCommand: (command) => {
      issued.push(command);
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    },
  });
  const snapshot = await loadDesktopSnapshot(client);
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "renewals");
  assert.ok(item, "no navigation target rendered for Renewals");
  await act(async () => {
    item.click();
  });
  // The wait is the whole instrument: without it every assertion below would be
  // measuring the Suspense fallback, which is exactly the failure this file
  // exists to make impossible.
  await waitForCondition(
    () => container.querySelector("[data-renewals-surface]") !== null,
    "Renewals never mounted into the work plane",
  );
};

const section = (kind: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(
    `[data-renewal-section="${kind}"]`,
  );
  assert.ok(node, `no "${kind}" section on the screen`);
  return node;
};

const rowsIn = (kind: string): HTMLElement[] => [
  ...section(kind).querySelectorAll<HTMLElement>("[data-renewal-row]"),
];

const buttonIn = (scope: HTMLElement, label: string): HTMLElement => {
  const node = [...scope.querySelectorAll<HTMLElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  assert.ok(node, `no "${label}" control where one was expected`);
  return node;
};

test('C22 — "Time to start" holds exactly the contracts whose lead window has opened', async () => {
  await openRenewals();
  await waitForCondition(
    () => rowsIn("due").length > 0,
    "Renewals drew no row in the section that means somebody has to act",
  );

  assert.deepEqual(
    rowsIn("due").map((row) => row.dataset.renewalRow),
    [renewalRecordId as string],
    "the contract whose 90-day window opened in July is not in Time to start",
  );
  assert.equal(
    rowsIn("watching").length,
    0,
    "a contract whose lead window has opened is also being shown as watched",
  );
  assert.match(
    section("watching").textContent ?? "",
    /Nothing is waiting for its lead time\./u,
    "the empty Watching section says nothing at all",
  );

  // THE ROW LEADS WITH THE EXPIRY DATE. That reading was reversed once and
  // accepted on the third pass: the section and the lead chip carry "time to
  // start", the row carries the date. A reader who cannot see the layout gets
  // the same order, which is what this asserts.
  const name = rowsIn("due")[0]?.getAttribute("aria-label") ?? "";
  assert.match(
    name,
    /ends Sep 30, 2026, \d+ days ago|ends Sep 30, 2026, (today|in \d+ days)/u,
    `the row's accessible name does not lead with the expiry date: ${name}`,
  );
  assert.match(
    name,
    /90-day lead began \d+ days ago/u,
    `the row's accessible name never says the lead window opened: ${name}`,
  );
});

test("C22 — an empty Time to start is a computed answer, and irrelevant is closed", async () => {
  const relationships = withRenewals(
    renewal({
      id: watchingNearId,
      title: "Licencje katalogu tożsamości",
      expiresAt: "2099-06-30T21:59:59.000Z",
      leadTimeDays: 45,
    }),
    renewal({
      id: watchingFarId,
      title: "Umowa wsparcia platformy",
      expiresAt: "2099-12-31T21:59:59.000Z",
      leadTimeDays: 30,
    }),
    // NOT a named-state split. `irrelevant` is closed, and a split written on
    // the two obvious names leaves it standing in Watching looking like work.
    renewal({
      id: irrelevantId,
      title: "Subskrypcja szkoleń",
      expiresAt: "2099-03-31T21:59:59.000Z",
      leadTimeDays: 30,
      state: "irrelevant",
    }),
  );
  await openRenewals(queriesFor(relationships));
  await waitForCondition(
    () => rowsIn("watching").length > 0,
    "Renewals drew no watched contract at all",
  );

  assert.equal(
    rowsIn("due").length,
    0,
    "a contract whose window opens in 2099 is being shown as due to start",
  );
  const empty = section("due").querySelector<HTMLElement>(
    "[data-renewal-empty]",
  );
  assert.ok(
    empty,
    "the empty Time to start section drew nothing — an empty answer here is an ANSWER",
  );
  assert.match(
    empty.textContent ?? "",
    /No contract has entered its lead time\./u,
    "the empty section never says what it found",
  );
  // BOTH NUMBERS ARE COMPUTED. The count is the watching set's size and the
  // date is today plus the nearest window, so the sentence cannot be satisfied
  // by a placeholder.
  assert.equal(
    rowsIn("watching").length,
    2,
    "the watched set is not the two contracts this test composed",
  );
  assert.match(
    empty.textContent ?? "",
    /2 contracts under watch — the nearest lead opens in \d+ days, on \w+ \d+, 20\d\d\./u,
    `the empty section does not carry the computed count and date: ${empty.textContent ?? ""}`,
  );

  assert.deepEqual(
    rowsIn("watching")
      .map((row) => row.dataset.renewalRow)
      .toSorted(),
    [watchingNearId as string, watchingFarId as string].toSorted(),
    "the section that means «before the lead window» does not hold exactly the watched contracts",
  );

  await act(async () => {
    buttonIn(section("closed"), "Show").click();
  });
  assert.deepEqual(
    rowsIn("closed").map((row) => row.dataset.renewalRow),
    [irrelevantId as string],
    "a contract marked no longer relevant is not in Closed this cycle",
  );
});

test("C23 — a contract renewed after its expiry never prints a term longer than the term", async () => {
  const relationships = withRenewals(
    renewal({
      id: clippedTermId,
      title: "Wsparcie i utrzymanie platformy",
      // Due, so the row is on screen without expanding anything; the term began
      // more than three years ago against a one-year term, so the elapsed side
      // is larger than the denominator and stays that way.
      expiresAt: "2026-09-30T21:59:59.000Z",
      leadTimeDays: 90,
      termStartsAt: "2023-01-01T00:00:00.000Z",
      termMonths: 12,
      cycleOrdinal: 3,
    }),
  );
  await openRenewals(queriesFor(relationships));
  await waitForCondition(
    () => rowsIn("due").length > 0,
    "Renewals drew no row, so the contract clock could not be read",
  );

  const term = container.querySelector<HTMLElement>("[data-renewal-term]");
  assert.ok(term, "the contract clock is not on the row at all");
  assert.equal(
    term.textContent,
    "1 yr of 1 yr",
    `the elapsed term is not clipped to the term: ${term.textContent ?? ""}`,
  );
  assert.match(
    rowsIn("due")[0]?.textContent ?? "",
    /term 3/u,
    "the cycle the contract records is not printed",
  );
});

test("a contract nobody has started says so, and offers the one control that changes it", async () => {
  const relationships = withRenewals(
    renewal({
      id: unstartedId,
      title: "Managed Support",
      expiresAt: "2026-08-31T21:59:59.000Z",
      leadTimeDays: 90,
    }),
  );
  await openRenewals(queriesFor(relationships));
  await waitForCondition(
    () => rowsIn("due").length > 0,
    "Renewals drew no row, so the unstarted state could not be read",
  );

  const row = rowsIn("due")[0];
  assert.ok(row);
  const follow = row.querySelector<HTMLElement>('[data-renewal-follow="none"]');
  assert.ok(
    follow,
    "a contract with no follow-up task does not say that nobody has started it",
  );
  assert.match(follow.textContent ?? "", /nobody has started this/u);

  // The control has to reach the kernel, not just exist. `task.create` is the
  // first of two commands; the attach follows it, and a `Start` that issues
  // nothing is the dead button this assertion exists to catch.
  await act(async () => {
    buttonIn(row, "Start").click();
  });
  await waitForCondition(
    () => issued.length > 0,
    "pressing Start issued no command at all",
  );
  assert.equal(
    issued[0]?.commandName,
    "task.create",
    `Start issued ${issued[0]?.commandName ?? "nothing"} instead of creating the follow-up`,
  );
});

test("closing a contract whose follow-up is off the page says why instead of failing silently", async () => {
  const relationships = withRenewals(
    renewal({
      id: detachedId,
      title: "Wsparcie podstawowe",
      expiresAt: "2026-09-30T21:59:59.000Z",
      leadTimeDays: 90,
      // A task the renewal names and `task.list` did not return. `task.list` is
      // capped at 100 rows, so this is reachable on a real workspace — and
      // `relationship.renewalResolve` completes the follow-up in the same
      // transaction, so it needs a version nothing here can supply.
      followUpTaskId: unloadedTaskId,
    }),
  );
  await openRenewals(queriesFor(relationships));
  await waitForCondition(
    () => rowsIn("due").length > 0,
    "Renewals drew no row, so the refusal could not be reached",
  );

  const row = rowsIn("due")[0];
  assert.ok(row);
  assert.ok(
    row.querySelector('[data-renewal-follow="detached"]'),
    "a follow-up that is not loaded is being reported as one that does not exist",
  );

  await act(async () => {
    buttonIn(row, "Close").click();
  });
  await act(async () => {
    buttonIn(row, "Renewed").click();
  });
  await waitForCondition(
    () => row.querySelector("[data-renewal-message]") !== null,
    "closing the contract produced no sentence — the button is dead and says nothing",
  );
  assert.match(
    row.querySelector("[data-renewal-message]")?.textContent ?? "",
    /follow-up task is not loaded/u,
    "the row does not carry the reason the close could not be sent",
  );
  assert.equal(
    issued.length,
    0,
    "an envelope the kernel is certain to refuse was sent anyway",
  );
});

test("closing a contract whose follow-up IS loaded sends the outcome to the kernel", async () => {
  await openRenewals();
  await waitForCondition(
    () => rowsIn("due").length > 0,
    "Renewals drew no row, so the close control could not be reached",
  );

  const row = rowsIn("due")[0];
  assert.ok(row);
  await act(async () => {
    buttonIn(row, "Close").click();
  });
  await act(async () => {
    buttonIn(row, "Not renewing").click();
  });
  await waitForCondition(
    () => issued.length > 0,
    "closing the contract issued no command at all",
  );

  const envelope = issued[0];
  assert.equal(envelope?.commandName, "relationship.renewalResolve");
  assert.equal(
    (envelope?.payload as { readonly state?: string }).state,
    "not_renewing",
    "the outcome the person chose is not the outcome that was sent",
  );
  // The WHOLE key set, not "my id is in there". A presence check is what stayed
  // green while this wrapper sent one version where the kernel expects two.
  assert.deepEqual(
    Object.keys(envelope?.expectedVersions ?? {}).toSorted(),
    [renewalRecordId as string, waitingTaskId as string].toSorted(),
    "the envelope does not name both the contract and the follow-up it completes",
  );
});

test("an unavailable relationship slice replaces the screen with its own reason", async () => {
  await openRenewals({
    ...populatedShellQueries,
    "relationship.workspace": {
      kind: "contract_rejected",
      diagnosticCode: "contract.invalid",
      issues: [{ path: "", code: "custom" }],
    },
  });

  const message = container.querySelector<HTMLElement>(
    "[data-renewals-unavailable]",
  );
  assert.ok(
    message,
    "a failed read drew no reason — the screen is claiming an answer it does not have",
  );
  assert.ok(
    (message.textContent ?? "").trim().length > 0,
    "the slice's own message was dropped in favour of an empty element",
  );
  // AND NOT THE SECTIONS. An empty "Time to start" is computed from the
  // watching set; drawing it over a failed read says "nothing to do" when the
  // truth is "nothing could be asked".
  assert.equal(
    container.querySelector('[data-renewal-section="due"]'),
    null,
    "the section headings rendered over a failed read, with zeroes beside them",
  );
});
