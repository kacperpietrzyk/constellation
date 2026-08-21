import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { StrategicRecordIdSchema } from "@constellation/contracts";
import type { ScenarioFixtures } from "../src/client/scenario-client.js";

import {
  offerDeliverableDocumentId,
  populatedBootstrap,
  populatedRelationshipWorkspace,
  populatedShellQueries,
  principalId,
  projectionResponse,
  referencedOrganizationId,
  spaceId,
  workspaceId,
} from "./shell-fixture.js";

// WHY THIS FILE EXISTS AT ALL, stated once so nobody deletes it as redundant.
//
// A lazy surface can ship COMPLETELY EMPTY and stay green in three gates at
// once. `surface-registry-render.test.ts` renders with `renderToStaticMarkup`,
// which never resolves `React.lazy`, so for a lazy id it measures the Suspense
// fallback and nothing about the screen. Its companion — "no two destinations
// render the same screen" — compares those same fallbacks, which differ only by
// their label. And the packaged smoke's per-surface check is "the first visible
// child of the work plane exists", which a placeholder satisfies.
//
// So this file mounts the REAL shell, clicks the REAL navigation item and waits
// until a deal card is in the DOM before asserting anything. Every assertion
// below was broken on purpose before it was trusted, and the failure message it
// produced is recorded in the pull request — including a run with the whole
// screen replaced by a heading-only placeholder, which turned every one of them
// red.
//
// THE NUMBERS BELOW ARE THE ACCEPTED WORKED EXAMPLE and they can be checked by
// hand. USD 41 200 at a stored USD→PLN rate of 3.94 is 162 328 PLN exactly; plus
// the configured 25% markup that is 202 910, rounded for display to 205 000, and
// what is left is 205 000 − 162 328 = 42 672 — the exact difference of the two
// amounts printed above it. EUR 34 500 at 4.31 is 148 695 PLN; against a
// confirmed price of 186 000 that leaves 37 305, a margin of 20% of the price.

const id = (suffix: string) =>
  StrategicRecordIdSchema.parse(`00000000-0000-4000-8000-0000000000${suffix}`);

const derivedDealId = id("e1");
const derivedOfferId = id("e2");
const confirmedDealId = id("e3");
const confirmedOfferId = id("e4");
const declinedOfferId = id("e5");
const wrongPairDealId = id("e6");
const wrongPairOfferId = id("e7");
const waitingDealId = id("e8");
const waitingOfferId = id("e9");
const strayDealId = id("ea");
const euroDealId = id("ec");

/** A stage id no default funnel configures, and it says so in its own name. The
 *  shared fixture's deal happens to stand on `qualified` against a configured
 *  `qualification`, which is a second stray column and a happy accident —
 *  resting the stray assertion on somebody else's typo would make it break for
 *  an unrelated reason the day that typo is corrected. */
const UNCONFIGURED_STAGE = "kwalifikacja-2024";

const base = {
  workspaceId,
  spaceId,
  createdBy: principalId,
  recordState: "active" as const,
  version: 1,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-07-20T14:30:00.000Z",
};

const deal = (
  dealId: ReturnType<typeof id>,
  title: string,
  stage: string,
  extra: Record<string, unknown> = {},
) => ({
  ...base,
  id: dealId,
  kind: "opportunity" as const,
  title,
  organizationId: referencedOrganizationId,
  personIds: [],
  need: "Recorded on the record screen, not on the card.",
  qualification: "Recorded on the record screen, not on the card.",
  stage,
  nextAction: "Confirm the scope with the sponsor.",
  evidenceSourceIds: [],
  offerIds: [],
  projectIds: [],
  state: "open" as const,
  ...extra,
});

const offer = (
  offerId: ReturnType<typeof id>,
  opportunityId: ReturnType<typeof id>,
  state: "draft" | "ready" | "submitted" | "accepted" | "declined",
  extra: Record<string, unknown> = {},
) => ({
  ...base,
  id: offerId,
  kind: "offer" as const,
  title: "Wariant z dyżurem nocnym",
  opportunityId,
  deliverableDocumentId: offerDeliverableDocumentId,
  ownerPrincipalId: principalId,
  state,
  nextAction: "waiting for the distributor to price the hardware",
  ...extra,
});

/** Every branch of the card, composed HERE rather than added to the shared
 *  fixture: each record exists to make one branch of THIS screen reachable, and
 *  none of them is a fact about the workspace every other test should start
 *  from. */
const records = [
  ...populatedRelationshipWorkspace.records,
  // 1. Cost in dollars, a rate that fits, no confirmed price → the derived
  //    chain, and an estimate that still leads the value block because a
  //    derived price is not what a deal is worth.
  deal(derivedDealId, "Odnowienie wsparcia z dyżurem nocnym", "negotiation", {
    offerIds: [derivedOfferId],
    estimate: { amountMinor: 20_000_000, currency: "PLN" },
  }),
  offer(derivedOfferId, derivedDealId, "ready", {
    cost: { amountMinor: 4_120_000, currency: "USD" },
    rate: {
      from: "USD",
      to: "PLN",
      rateMicros: 3_940_000,
      at: "2026-07-10",
    },
  }),
  // 2. A confirmed price, and a second offer behind it so the version chip and
  //    the ordering are drawn from something rather than assumed.
  deal(
    confirmedDealId,
    "Wdrożenie monitoringu w dwóch środowiskach",
    "discovery",
    {
      offerIds: [confirmedOfferId, declinedOfferId],
    },
  ),
  offer(confirmedOfferId, confirmedDealId, "submitted", {
    cost: { amountMinor: 3_450_000, currency: "EUR" },
    rate: {
      from: "EUR",
      to: "PLN",
      rateMicros: 4_310_000,
      at: "2026-07-02",
    },
    price: {
      basis: "confirmed",
      price: { amountMinor: 18_600_000, currency: "PLN" },
    },
  }),
  offer(declinedOfferId, confirmedDealId, "declined"),
  // 3. THE FAILURE WITH NO VISIBLE SYMPTOM: a dollar cost beside a euro rate.
  //    Converting it would produce a plausible amount in zloty rather than an
  //    error, which is why the pair check is structural in `money.ts` and why
  //    the card says which pair it holds.
  deal(wrongPairDealId, "Rozbudowa łącza zapasowego", "discovery", {
    offerIds: [wrongPairOfferId],
  }),
  offer(wrongPairOfferId, wrongPairDealId, "ready", {
    cost: { amountMinor: 2_000_000, currency: "USD" },
    rate: {
      from: "EUR",
      to: "PLN",
      rateMicros: 4_310_000,
      at: "2026-07-02",
    },
  }),
  // 4. Waiting for the distributor's quote. A state of work, not missing data.
  deal(waitingDealId, "Migracja poczty do środowiska zapasowego", "proposal", {
    offerIds: [waitingOfferId],
  }),
  offer(waitingOfferId, waitingDealId, "draft"),
  // 5. A deal standing on a stage this workspace does not configure.
  deal(strayDealId, "Przegląd architektury po audycie", UNCONFIGURED_STAGE, {
    estimate: { amountMinor: 5_000_000, currency: "PLN" },
  }),
];

const relationships = {
  ...populatedRelationshipWorkspace,
  records,
};

/** The same board with one deal priced in euro. Every open amount was in zloty
 *  before; now two currencies stand in one funnel and the meter has no honest
 *  scale to be drawn against. Both runs are needed: a board with no meter and a
 *  board that never had one look identical. */
const twoCurrencyRelationships = {
  ...populatedRelationshipWorkspace,
  records: [
    ...records,
    deal(euroDealId, "Wsparcie dla oddziału w Berlinie", "qualification", {
      estimate: { amountMinor: 4_000_000, currency: "EUR" },
    }),
  ],
};

const queries = {
  ...populatedShellQueries,
  "relationship.workspace": projectionResponse(relationships),
  "opportunity.list": projectionResponse({
    kind: "opportunity.list" as const,
    items: records.filter((record) => record.kind === "opportunity"),
    totalCount: records.filter((record) => record.kind === "opportunity")
      .length,
    snapshot: "pipeline-opportunities-snapshot",
    nextCursor: null,
    final: true,
    freshness: populatedRelationshipWorkspace.freshness,
  }),
  "relation.list": projectionResponse({
    kind: "relation.list" as const,
    items: [],
    totalCount: 0,
    snapshot: "pipeline-relations-snapshot",
    nextCursor: null,
    final: true,
    freshness: populatedRelationshipWorkspace.freshness,
  }),
};

interface IssuedCommand {
  readonly name: string;
  readonly payload: Record<string, unknown>;
}

let container: HTMLDivElement;
let root: Root;
let mounted = false;
let issued: IssuedCommand[] = [];

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

const openPipeline = async (
  fixtures: ScenarioFixtures["queries"] = queries,
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({
    queries: fixtures,
    executeCommand: (command) => {
      issued.push({
        name: command.commandName,
        payload: command.payload as Record<string, unknown>,
      });
      // Rejected on purpose: this file measures what the screen ASKS FOR. A
      // scripted success would have to invent a projection and the assertion
      // would then be about the fixture rather than about the screen.
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
  ].find((node) => node.dataset.surface === "pipeline");
  assert.ok(item, "no navigation target rendered for Pipeline");
  await act(async () => {
    item.click();
  });
  // The wait is the whole instrument: without it every assertion below would be
  // measuring the Suspense fallback, which is exactly the failure this file
  // exists to make impossible.
  await waitForCondition(
    () => container.querySelector("[data-pipeline-surface]") !== null,
    "Pipeline never mounted into the work plane",
  );
};

const cards = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>("[data-pipeline-card]"),
];

const cardFor = (dealId: string): HTMLElement => {
  const found = cards().find((node) => node.dataset.pipelineCard === dealId);
  assert.ok(found, `no card on the board for ${dealId}`);
  return found;
};

const boardText = (): string =>
  container.querySelector<HTMLElement>("[data-pipeline-board]")?.textContent ??
  "";

const openBoard = async (
  fixtures: ScenarioFixtures["queries"] = queries,
): Promise<void> => {
  await openPipeline(fixtures);
  await waitForCondition(
    () => cards().length > 0,
    "Pipeline drew no deal card at all",
  );
};

test("GAP-06A-002 — Pipeline states authoritative Opportunity and relation inventory finality", async () => {
  await openBoard();
  const inventory = container.querySelector<HTMLElement>(
    "[data-portfolio-inventory-finality]",
  );
  assert.ok(inventory, "Pipeline did not expose portfolio inventory finality");
  assert.match(inventory.textContent ?? "", /6 opportunities · complete/u);
  assert.match(inventory.textContent ?? "", /0 relations · complete/u);
});

test("C8 — a reader who cannot see the card is told IN WORDS whether the price was confirmed or derived", async () => {
  await openBoard();

  // The `≈`, the rounding and the badge are all visual, and a badge sitting
  // after the number it qualifies is announced out of order. This sentence is
  // the only channel a non-sighted reader gets, and nothing else in the suite
  // would notice it vanishing.
  const derived = cardFor(derivedDealId).getAttribute("aria-label") ?? "";
  assert.match(
    derived,
    /derived from the cost with an assumed markup of 25 percent on the cost/u,
    "the derived card never says in words that its price is an assumption",
  );
  assert.match(
    derived,
    /price to the client about 205,000 PLN/u,
    "the derived price is missing from the card's spoken sentence",
  );
  assert.match(
    derived,
    /an assumption rather than a measurement/u,
    "what is left of a derived price is not named as an assumption",
  );

  const confirmed = cardFor(confirmedDealId).getAttribute("aria-label") ?? "";
  assert.match(
    confirmed,
    /price to the client 186,000 PLN, confirmed/u,
    "the confirmed card never says in words that its price was confirmed",
  );
  assert.match(
    confirmed,
    /a margin of 20 percent of the price/u,
    "the measured margin is missing from the card's spoken sentence",
  );

  // And the conversion that could not be made is stated rather than left out —
  // silence there reads as "there is nothing to convert".
  assert.match(
    cardFor(wrongPairDealId).getAttribute("aria-label") ?? "",
    /cannot be converted because the stored rate is for another currency pair/u,
    "a cost that could not be converted says nothing about it out loud",
  );
});

test("C9 — every percentage on the board says which one it is; a bare % never appears", async () => {
  await openBoard();

  const stripped = boardText().replace(/(markup|margin|uplift)\s*\d+%/gu, "");
  assert.doesNotMatch(
    stripped,
    /\d+%/u,
    "a percentage without a name reached the board — 25% markup on a cost is 20% margin on a price, and unnamed they read as the same number",
  );
  assert.match(
    boardText(),
    /markup 25%/u,
    "no named markup on the board, so the assertion above measured nothing",
  );
  assert.match(
    boardText(),
    /margin 20%/u,
    "no named margin on the board, so the assertion above measured nothing",
  );
});

test("C10 — a derived card shows the markup from Settings, never one back-computed from the rounded price", async () => {
  await openBoard();

  const card = cardFor(derivedDealId);
  assert.match(
    card.textContent ?? "",
    /derived · markup 25%/u,
    "the derived badge does not carry the configured markup",
  );
  // 42 672 / 162 328 is 26%, and rounding the price is what moved it. A card
  // printing 26 would contradict Settings' 25 with no way for a reader to tell
  // which of the two is the assumption they configured.
  const backComputed = Math.round((4_267_200 / 16_232_800) * 100);
  assert.equal(
    backComputed,
    26,
    "the worked example stopped being the one this assertion is about",
  );
  assert.doesNotMatch(
    card.textContent ?? "",
    /markup 26%/u,
    "the derived card shows a markup back-computed from the rounded price instead of the configured one",
  );
  // The three numbers subtract exactly, which is the reason `leaves` is never
  // rounded a second time.
  assert.match(
    card.textContent ?? "",
    /162,328 PLN/u,
    "the cost in the home currency is missing",
  );
  assert.match(
    card.textContent ?? "",
    /≈ 205,000 PLN/u,
    "the derived price is missing or not marked approximate",
  );
  assert.match(
    card.textContent ?? "",
    /≈ 42,672 PLN/u,
    "what is left is not the exact difference of the two amounts above it",
  );
});

test("C11 — an offer's number and an estimate are different claims and are labelled differently", async () => {
  await openBoard();

  const basisOf = (dealId: string): string =>
    cardFor(dealId).querySelector<HTMLElement>("[data-price-basis]")?.dataset
      .priceBasis ?? "";

  assert.equal(
    basisOf(confirmedDealId),
    "offer",
    "a deal with a confirmed offer price does not read as an offer",
  );
  assert.equal(
    basisOf(derivedDealId),
    "estimate",
    "a deal whose only offer carries a DERIVED price counts that price as its value — a derived price is a projection of today's markup and cannot be what a deal is worth",
  );
  const estimateBlock =
    cardFor(derivedDealId).querySelector<HTMLElement>("[data-price-basis]");
  assert.match(
    estimateBlock?.textContent ?? "",
    /≈ 200,000 PLN/u,
    "the estimate is not marked as approximate",
  );
  assert.match(
    cardFor(wrongPairDealId).querySelector<HTMLElement>("[data-price-basis]")
      ?.textContent ?? "",
    /No value yet/u,
    "a deal with neither an estimate nor a usable offer number reads as something other than 'no value yet'",
  );
});

test("C12 — a deal on an unconfigured stage stays on the board, in its own column, and cannot be dropped into", async () => {
  await openBoard();

  const stray = container.querySelector<HTMLElement>(
    `[data-pipeline-column="${UNCONFIGURED_STAGE}"]`,
  );
  assert.ok(
    stray,
    "the unconfigured stage has no column, so its deal is off the board",
  );
  assert.ok(
    stray.querySelector(`[data-pipeline-card="${strayDealId}"]`),
    "the deal standing on an unconfigured stage is not on the board",
  );
  assert.equal(
    stray.querySelector("[data-dropzone]") === null,
    true,
    "the stray column accepts drops — moving a card onto a stage that does not exist means nothing",
  );
  // A configured column DOES take one, so the assertion above is about being
  // stray rather than about dropzones having quietly disappeared everywhere.
  assert.equal(
    container
      .querySelector<HTMLElement>('[data-pipeline-column="discovery"]')
      ?.querySelector("[data-dropzone]") === null,
    false,
    "no configured column accepts a drop either, so the stray assertion measures nothing",
  );

  // AND THE NUMBER AT THE TOP COUNTS IT. Filtering the deal out instead would
  // make the card vanish while the sum went on including it, and a screen
  // contradicting its own number is worse than a column with an odd name.
  const count =
    container.querySelector<HTMLElement>("[data-pipeline-count]")
      ?.textContent ?? "";
  const open = records.filter(
    (record) =>
      record.kind === "opportunity" &&
      record.stage !== "won" &&
      record.stage !== "lost",
  ).length;
  assert.match(
    count,
    new RegExp(`^${open} open`, "u"),
    `the top line does not count every open deal, stray stages included (expected ${open})`,
  );
  assert.match(
    container.querySelector<HTMLElement>("[data-pipeline-stray-count]")
      ?.textContent ?? "",
    /2 not configured/u,
    "the board does not say how many stages it does not recognise",
  );
});

test("C13 — an offer still waiting for the distribution quote says so, and never reads as zero", async () => {
  await openBoard();

  const card = cardFor(waitingDealId);
  const waiting = card.querySelector<HTMLElement>("[data-offer-waiting]");
  assert.ok(
    waiting,
    "an offer with no cost and no price draws no waiting sentence",
  );
  assert.match(
    waiting.textContent ?? "",
    /No cost from distribution yet — waiting for the distributor to price the hardware/u,
    "the waiting sentence does not say what is being waited for",
  );
  // Waiting for a quote is Kacper's frequent working state. A zero here would
  // be a claim about what the conversation is worth.
  assert.doesNotMatch(
    card.textContent ?? "",
    /\b0\s?(PLN|EUR|USD)/u,
    "an offer with no numbers rendered a zero amount",
  );
});

test("C14 — the comparison bar disappears entirely once the funnel holds more than one currency", async () => {
  await openBoard();
  // FIRST, THE BAR HAS TO EXIST. Without this half, "no meter with two
  // currencies" cannot be told apart from "no meter, ever".
  assert.ok(
    container.querySelector("[data-pipeline-meter]"),
    "no meter is drawn even with the whole open funnel in one currency, so the assertion below measures nothing",
  );

  act(() => {
    root.unmount();
  });
  mounted = false;
  container.remove();
  container = document.createElement("div");
  document.body.append(container);

  await openBoard({
    ...queries,
    "relationship.workspace": projectionResponse(twoCurrencyRelationships),
    "opportunity.list": projectionResponse({
      kind: "opportunity.list",
      items: twoCurrencyRelationships.records.filter(
        (record) => record.kind === "opportunity",
      ),
      totalCount: twoCurrencyRelationships.records.filter(
        (record) => record.kind === "opportunity",
      ).length,
      snapshot: "two-currency-opportunities",
      nextCursor: null,
      final: true,
      freshness: twoCurrencyRelationships.freshness,
    }),
  });
  assert.equal(
    container.querySelectorAll("[data-pipeline-meter]").length,
    0,
    "a bar is still drawn over a funnel standing in two currencies — it compares amounts that cannot be compared, and no bar is better than an invented one",
  );
  // The sums themselves survive, per currency, because they never claimed to be
  // one number.
  assert.match(
    container.querySelector<HTMLElement>("[data-pipeline-count]")
      ?.textContent ?? "",
    /PLN.*EUR|EUR.*PLN/u,
    "the top line collapsed two currencies into one total",
  );
});

test("moving a deal issues opportunity.update with the stage, from the keyboard and from a drop, through one path", async () => {
  await openBoard();

  // `M` on the focused card. The gesture the stray column tells you about.
  const card = cardFor(strayDealId);
  await act(async () => {
    card.focus();
    card.dispatchEvent(
      new KeyboardEvent("keydown", { key: "m", bubbles: true }),
    );
  });
  const panel = container.querySelector<HTMLElement>(
    `[data-pipeline-deal-panel="${strayDealId}"]`,
  );
  assert.ok(
    panel,
    "pressing M on a card opens no way to move it, so the stray column's own instruction is a lie",
  );
  const target = panel.querySelector<HTMLButtonElement>(
    '[data-pipeline-move="discovery"]',
  );
  assert.ok(target, "the move control offers no configured stage to move to");
  await act(async () => {
    target.click();
  });
  const moved = issued.find((command) => command.name === "opportunity.update");
  assert.ok(
    moved,
    "moving a deal issued no command — `opportunity.update` is the ONLY way a deal changes stage",
  );
  assert.equal(moved.payload["opportunityId"], strayDealId);
  assert.equal(moved.payload["stage"], "discovery");
  // Nothing else rides along. `stageEnteredAt` is stamped by the kernel when
  // and only when the stage actually changes, and a screen sending its own
  // would erase the number the field exists to keep.
  assert.deepEqual(
    Object.keys(moved.payload).sort(),
    ["opportunityId", "stage"],
    "the move carried keys other than the deal and its stage",
  );
  // The stage the deal already stands on is not a destination.
  assert.equal(
    panel.querySelector<HTMLButtonElement>(
      `[data-pipeline-move="${UNCONFIGURED_STAGE}"]`,
    ),
    null,
    "an unconfigured stage is offered as a move destination",
  );

  // And the drop takes the same path, which is what makes the gesture a browser
  // cannot be driven to perform here nonetheless tested.
  issued = [];
  const dropped = cardFor(derivedDealId);
  const transfer = { setData: () => undefined, getData: () => "" };
  await act(async () => {
    const start = new Event("dragstart", { bubbles: true });
    Object.defineProperty(start, "dataTransfer", { value: transfer });
    dropped.dispatchEvent(start);
    const drop = new Event("drop", { bubbles: true });
    Object.defineProperty(drop, "dataTransfer", { value: transfer });
    container
      .querySelector<HTMLElement>('[data-dropzone="proposal"]')
      ?.dispatchEvent(drop);
  });
  const dragMoved = issued.find(
    (command) => command.name === "opportunity.update",
  );
  assert.ok(dragMoved, "dropping a card on a column issued no command");
  assert.equal(dragMoved.payload["opportunityId"], derivedDealId);
  assert.equal(dragMoved.payload["stage"], "proposal");
});

test("M lands the focus on a control that can be pressed, even for a deal on the first stage", async () => {
  // The seed with the euro deal is the one that puts a deal on `qualification`,
  // the FIRST configured stage. Focusing the move group by position would land
  // on that stage's own button, which is disabled — and `.focus()` on a disabled
  // control is a silent no-op, so `M` would do nothing for exactly the deals the
  // funnel starts with while the stray column goes on advertising the gesture.
  await openBoard({
    ...queries,
    "relationship.workspace": projectionResponse(twoCurrencyRelationships),
    "opportunity.list": projectionResponse({
      kind: "opportunity.list",
      items: twoCurrencyRelationships.records.filter(
        (record) => record.kind === "opportunity",
      ),
      totalCount: twoCurrencyRelationships.records.filter(
        (record) => record.kind === "opportunity",
      ).length,
      snapshot: "two-currency-opportunities",
      nextCursor: null,
      final: true,
      freshness: twoCurrencyRelationships.freshness,
    }),
  });

  const card = cardFor(euroDealId);
  await act(async () => {
    card.focus();
    card.dispatchEvent(
      new KeyboardEvent("keydown", { key: "m", bubbles: true }),
    );
  });
  const focused = document.activeElement as HTMLButtonElement | null;
  assert.equal(
    focused?.dataset.pipelineMove !== undefined,
    true,
    "M on a deal standing on the first configured stage moved the focus nowhere",
  );
  assert.equal(
    focused?.disabled,
    false,
    "M focused a disabled stage button — the deal already stands on that stage, so the keyboard gesture does nothing at all",
  );
  assert.notEqual(
    focused?.dataset.pipelineMove,
    "qualification",
    "the focused stage is the one the deal already stands on",
  );

  // AND THERE IS A WAY BACK OUT. A control you cannot leave is worse than no
  // control, and the focus must land on the card it came from rather than at the
  // top of the document.
  await act(async () => {
    focused?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  // Compared as a BOOLEAN, not as the node. `assert.equal(node, null)` hands
  // vitest a DOM element to serialise for its diff and the worker dies without
  // reporting anything — the break-test for this very assertion produced
  // "7 passed (15)" and an unhandled worker error instead of a failure.
  assert.equal(
    container.querySelector(`[data-pipeline-deal-panel="${euroDealId}"]`) ===
      null,
    true,
    "Escape does not close the move panel",
  );
  assert.equal(
    (document.activeElement as HTMLElement | null)?.dataset.pipelineCard,
    euroDealId,
    "leaving the move panel dropped the focus somewhere other than the card it was opened from",
  );
});

test("confirming a price stores it, and going back to the derived one CLEARS it", async () => {
  await openBoard();

  await act(async () => {
    cardFor(derivedDealId).click();
  });
  const input = container.querySelector<HTMLInputElement>(
    "[data-pipeline-price-input]",
  );
  assert.ok(input, "a deal with an offer offers no way to confirm its price");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "210000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>("[data-pipeline-confirm-price]")
      ?.click();
  });
  const confirmedWrite = issued.find(
    (command) => command.name === "opportunity.offerUpdate",
  );
  assert.ok(confirmedWrite, "confirming a price issued no command");
  assert.deepEqual(
    confirmedWrite.payload["price"],
    { basis: "confirmed", price: { amountMinor: 21_000_000, currency: "PLN" } },
    "the confirmed price was not sent as an amount in minor units with its currency",
  );

  // The other direction. `{basis:"derived"}` has to be SENT, because the kernel
  // turns it into a clear — derived has exactly one spelling on the record, and
  // treating it as "nothing to change" would leave a stale confirmed amount
  // behind a card that reads as derived.
  issued = [];
  await act(async () => {
    cardFor(confirmedDealId).click();
  });
  const underive = container.querySelector<HTMLButtonElement>(
    "[data-pipeline-underive]",
  );
  assert.ok(
    underive,
    "a confirmed price offers no way back to the derived one",
  );
  await act(async () => {
    underive.click();
  });
  const cleared = issued.find(
    (command) => command.name === "opportunity.offerUpdate",
  );
  assert.ok(cleared, "un-confirming a price issued no command");
  assert.deepEqual(
    cleared.payload["price"],
    { basis: "derived" },
    "un-confirming did not send the derived basis, so the stored amount would survive behind a card reading as derived",
  );
});

test("the money the screen prints comes from the WORKSPACE, not from a constant in the screen", async () => {
  // A workspace that sums into euro and offers only two currencies. Nothing on
  // this board may disagree with it: the home currency decides what a cost is
  // converted INTO, and the list decides what a picker may offer. Both were
  // pinned in the renderer until the settings landed, and a pin that survives
  // its own removal is invisible to every other assertion here — every card
  // still renders, every sum still adds, and the numbers are simply for the
  // wrong currency.
  const euroWorkspace = {
    ...populatedBootstrap,
    workspace: {
      ...populatedBootstrap.workspace,
      commercialDefaults: {
        ...populatedBootstrap.workspace.commercialDefaults,
        homeCurrency: "EUR" as const,
        currencies: ["EUR", "USD"] as const,
      },
    },
  };
  await openBoard({
    ...queries,
    "workspace.bootstrapContext": projectionResponse(euroWorkspace),
  });

  // The confirmed offer's cost is EUR 34 500 and its stored rate converts
  // EUR→PLN. Against a EUR home currency the cost needs no conversion at all,
  // so the sheet prints it flat — and the rate that no longer applies is not
  // used to produce a plausible number in the wrong currency.
  const card = cardFor(confirmedDealId);
  assert.match(
    card.textContent ?? "",
    /34,500 EUR/u,
    "the cost is not printed in its own currency against a matching home currency",
  );
  assert.doesNotMatch(
    card.textContent ?? "",
    /148,695 PLN/u,
    "the board converted a cost into a currency this workspace does not sum into — the home currency is still pinned in the renderer",
  );

  // And the estimate picker offers the workspace's own list, not a third copy
  // of the currency union written out by hand in the screen.
  await act(async () => {
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => /new opportunity/iu.test(button.textContent ?? ""))
      ?.click();
  });
  const picker = [
    ...container.querySelectorAll<HTMLSelectElement>(
      "[data-pipeline-surface] select",
    ),
  ].find((select) =>
    [...select.options].some((option) => option.value === "EUR"),
  );
  assert.ok(picker, "the create form offers no currency at all");
  assert.deepEqual(
    [...picker.options].map((option) => option.value),
    ["EUR", "USD"],
    "the currency picker offers a hand-written list instead of the currencies this workspace records money in",
  );
  assert.equal(
    picker.value,
    "EUR",
    "the picker does not start on the currency this workspace sums into",
  );
});

test("nothing on this screen explains itself in a tooltip", async () => {
  await openBoard();

  // A native tooltip does not exist for a keyboard or for touch. Everything the
  // accepted prototype kept in one is visible text here, or a help topic
  // recorded for the help lot.
  //
  // Compared as a BOOLEAN, not as the node: handing vitest a DOM element to
  // serialise for its diff kills the worker without reporting anything, which
  // this repository has already paid for once.
  // CAŁY EKRAN, NIE JEGO PRZEWIJANE PUDEŁKO. Od lotu R3 pasmo tytułu i pasek
  // widoku są RODZEŃSTWEM `.surface-scroll`, a `data-pipeline-surface` został na
  // pudełku — zamiatanie po tamtym adresie przestało widzieć oba pasma i byłoby
  // zielone nad `title=` postawionym w którymkolwiek z nich. Ten plik montuje na
  // dwa sposoby (powłoka i sam ekran), więc zakres rozstrzyga się w locie.
  const screen =
    container.querySelector<HTMLElement>('main[data-surface="pipeline"]') ??
    container;
  assert.equal(
    screen.querySelector("[title]") === null,
    true,
    "an explanation survived as a `title` attribute",
  );
});

// WPIS 6-4 OGONA FAZY III — POMIAR, KTÓREGO NIE BYŁO.
//
// Plakietka wieku dopisywała słowo: `420 d · stale` tam, gdzie prototyp pisze
// `61 d` (`v3/screens/pipeline.js:326`). Kolor, tło, ramka i zegar są po obu
// stronach IDENTYCZNE co do wartości — różniło je WYŁĄCZNIE dopisane słowo.
// Dwie pary rejestru stoją na tej plakietce i obie mają rację o czym innym:
// `L2-05a` pilnuje, żeby była WYPEŁNIONA, `L2-05b` — żeby niosła ZEGAR. Ani
// jedna nie czyta jej TEKSTU, więc dopisek mógł zostać albo zniknąć bez drgnienia.
//
// ASERCJA JEST O KSZTAŁCIE, NIE O LICZBIE, i to nie jest ostrożność, tylko
// warunek istnienia tej asercji: wiek liczy się z ZEGARA (`pipeline-view.ts` →
// `daysSince(opportunity.createdAt)`), więc `420 d` będzie jutro `421 d`.
// Wpisana liczba położyłaby `main` bez żadnej zmiany w kodzie — ten tryb awarii
// jest w tym repozytorium udokumentowany i już raz zapłacony.
//
// TOTALNA NAD WSZYSTKIMI KARTAMI, także spokojnymi: reguła brzmi „plakietka
// wieku mówi liczbę dni i nic poza nią", a nie „przeterminowana karta mówi".
// Asercja nad jedną kartą byłaby zielona, gdyby słowo wróciło na drugiej.
test("the age badge says a number of days and nothing else, on every card", async () => {
  await openBoard();

  const badges = [
    ...container.querySelectorAll<HTMLElement>("[data-deal-age]"),
  ];
  assert.ok(
    badges.length > 0,
    "the board drew no age badge at all, so this assertion would be measuring an empty screen",
  );
  // THE ARM THAT CARRIED THE WORD HAS TO BE ON SCREEN, or this sweep proves
  // nothing about the thing it closes: the word was appended only when
  // `card.stale`, so a board of calm badges satisfies the rule without ever
  // reaching the branch. Measured, not assumed — this file's deals all carry
  // `createdAt: 2026-06-01`, so at the time of writing every one of the six is
  // over the 45-day threshold and the CALM arm is what this fixture cannot
  // draw. That gap is stated rather than hidden: the calm badge has always
  // printed `${ageDays} d` and never carried the word, so the arm this rule
  // exists for is the one the fixture does reach.
  const stale = badges.filter((badge) => badge.querySelector("svg") !== null);
  assert.ok(
    stale.length > 0,
    `none of the ${badges.length} badge(s) on the board is in the stale arm, and that is the only ` +
      "arm that ever appended a word — this run would pass without reaching the branch it guards",
  );
  const wrong = badges
    .map((badge) => (badge.textContent ?? "").trim())
    .filter((said) => !/^\d+ d$/u.test(said));
  assert.deepEqual(
    wrong,
    [],
    "an age badge said more than the number of days; the reference says `${o.age} d` and keeps " +
      "the rest in a title attribute, and the word this repository had added bought no channel " +
      "the clock glyph does not already carry on both sides",
  );
});

test("an unavailable slice says why and offers a way back, and never an empty board", async () => {
  const withoutRelationships = { ...queries };
  delete (withoutRelationships as Record<string, unknown>)[
    "relationship.workspace"
  ];
  await openPipeline(withoutRelationships);
  await waitForCondition(
    () =>
      container.querySelector("[data-pipeline-unavailable]") !== null ||
      cards().length > 0,
    "Pipeline neither drew cards nor said the slice was unavailable",
  );

  assert.equal(
    cards().length,
    0,
    "Pipeline drew cards from a slice that could not be read",
  );
  const message = container.querySelector<HTMLElement>(
    "[data-pipeline-unavailable]",
  );
  assert.ok(
    message,
    "Pipeline turned an unavailable slice into an empty board, which reads as 'no deals'",
  );
  assert.ok(
    (message.textContent ?? "").trim().length > 20,
    "the unavailable branch printed no reason",
  );
  const retry = [
    ...(container
      .querySelector("[data-pipeline-surface]")
      ?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ].find((button) => /try again/iu.test(button.textContent ?? ""));
  assert.ok(retry, "the unavailable branch offers no way to retry");
});

test("the board keeps exactly one Tab stop, numbered across every column", async () => {
  await openBoard();

  const stops = cards().filter((card) => card.getAttribute("tabindex") === "0");
  assert.equal(
    stops.length,
    1,
    `the board has ${stops.length} Tab stops — it is one composite widget and the keyboard has to reach it once, not once per card`,
  );
  // Across columns, not per column: the roving index counts through the DOM in
  // the order the eye reads it.
  assert.ok(
    cards().length > 4,
    "too few cards to observe numbering across columns",
  );
  assert.equal(
    container.querySelectorAll("[data-pipeline-card] button").length,
    0,
    "a control was placed inside a card — a listbox holds options, and a button inside one adds a Tab stop per row in a place the accessibility tree does not define",
  );
});

test("the record slot is a real seam: with one handed in it replaces the board, without one it says so", async () => {
  const { PipelineSurface } =
    await import("../src/pipeline/PipelineSurface.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries });
  const snapshot = await loadDesktopSnapshot(client);

  const props = {
    client,
    snapshot,
    selectedRecordId: undefined,
    activeOpportunityId: derivedDealId,
    onSelectRecord: () => undefined,
    onOpenOpportunity: () => undefined,
    onOpenOrganization: () => undefined,
    onNavigate: () => undefined,
    onReload: () => undefined,
    onFailure: () => undefined,
  };

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(PipelineSurface, {
        ...props,
        renderRecordScreen: () =>
          createElement("p", { "data-test-record": true }, "the deal itself"),
      }),
    );
  });
  assert.ok(
    container.querySelector("[data-test-record]"),
    "a deal opened as a record did not reach the slot the record lot lands on",
  );
  assert.equal(
    cards().length,
    0,
    "the board is still drawn underneath the record, so the context did nothing",
  );

  // And with nothing handed in, the surface says what is missing rather than
  // showing a board that ignores the request.
  await act(async () => {
    root.render(createElement(PipelineSurface, props));
  });
  assert.ok(
    container.querySelector("[data-pipeline-record-missing]"),
    "with no record screen handed in the surface silently fell back to the board, which loses the deal the context asked for",
  );
});

// THE DECLARATIONS THAT DECIDE THE PACKAGED TEXT-SCALING GATE, pinned.
//
// Neither is visible to this harness: happy-dom computes no layout, so
// `scrollWidth` and `clientWidth` are both zero here and an assertion about them
// would measure nothing while looking like a measurement. What CAN be asserted
// without a browser is the SHAPE of the sheet — and the shape is the whole
// defect. The real gate is `scripts/run-packaged-alpha-smoke.mjs:786-795`, on
// three operating systems; this is the cheap guard that fails in one second
// instead of fifteen minutes.
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

// Comments stripped FIRST: every declaration below is explained by name in the
// sheet, and a guard that reads the explanation as the thing it forbids fires on
// the fix rather than on the defect.
const pipelineSheet = readFileSync(
  path.join(packageRoot, "src", "pipeline", "pipeline.module.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//gu, "");

const declarationsOf = (selector: string): string => {
  const at = pipelineSheet.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `${selector} is not in the Pipeline sheet any more`);
  return pipelineSheet.slice(at, pipelineSheet.indexOf("}", at));
};

test("the Pipeline sheet keeps the declarations that hold a scrolling board inside its own surface", () => {
  // 1. The board IS a non-wrapping row of fixed columns — that is the accepted
  //    geometry. It is only safe because the scroller absorbs it: `overflow-x`
  //    makes the scroller's own min-content zero, and `width: 100%` stops its
  //    used width depending on how `fit-content` resolves under the shell's
  //    `margin-inline: auto`.
  const scroller = declarationsOf(".scroller");
  assert.match(
    scroller,
    /overflow-x:\s*auto/u,
    "the board's scroll container stopped scrolling — the row of columns then sets the surface's width instead of taking it, and the surface overflows itself with no descendant overflowing anything",
  );
  assert.match(
    scroller,
    /width:\s*100%/u,
    "the scroller no longer states its own width, so it is sized `fit-content` under the shell's `margin-inline: auto`",
  );
  // 2. Inline-size containment makes an element's intrinsic width ignore its
  //    contents, which under the same `margin-inline: auto` resolves to ZERO.
  assert.equal(
    /container-type/u.test(pipelineSheet),
    false,
    "`container-type` is back in the Pipeline sheet — it sizes a centred child from nothing and every row inside it then overflows a box with no width",
  );
  // 3. Every bar ABOVE the board wraps. A non-wrapping flex row's min-content is
  //    the sum of its children, and at 200% text that sum stops fitting.
  // `.crumbbar` ZNIKNĄŁ Z TEGO SELEKTORA W LOCIE C2 razem z samym rzędem: akcja
  // Lejka stoi teraz w paśmie tytułu, a blok, który wymieniał obie klasy, został
  // przepisany na jedną, żeby nie zostawić w nim martwej nazwy.
  // `.viewbar` ZSZEDŁ Z TEJ PĘTLI W LOCIE D1 FAZY D, tak jak `.crumbbar` zszedł
  // w C2, i z powodu tej samej rodziny: deklaracja nie zniknęła, tylko przestała
  // być W TYM ARKUSZU. Kształt paska widoku stoi teraz raz, w `styles.css` przy
  // `.view-band` — był przepisany w siedmiu arkuszach modułowych i w każdym
  // inaczej. Gwarancja jest asertowana niżej, na arkuszu, w którym mieszka.
  for (const bar of [".create", ".dealPanel", ".moveGroup,\n.priceControls"]) {
    assert.match(
      declarationsOf(bar),
      /flex-wrap:\s*wrap/u,
      `${bar} stopped wrapping — at 200% root font-size its min-content is the sum of its children and it sets a width the surface cannot hold`,
    );
  }
  assert.match(
    readFileSync(path.join(packageRoot, "src", "styles.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//gu,
      "",
    ),
    /\.view-band\s*\{[^}]*flex-wrap:\s*wrap/su,
    "the shared view band stopped wrapping — at 200% root font-size its min-content is the sum of its children and every screen that draws one sets a width its surface cannot hold",
  );
  // 4. Only the column is capped in rem, and it is inside the scroller.
  assert.match(
    declarationsOf(".column"),
    /width:\s*19rem/u,
    "the accepted column geometry changed; it is the one rem cap on this screen and it is only safe inside the scroller",
  );
  assert.equal(
    (declarationsOf(".quoteRow").match(/rem/gu) ?? []).length,
    0,
    "the offer sheet's term column is capped in rem again — a rem track doubles with the text while the card it lives in does not",
  );
});
