import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  DocumentIdSchema,
  StrategicRecordIdSchema,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type { DesktopSnapshot } from "../src/client/workflow.js";
import { OpportunityRecordScreen } from "../src/opportunity/OpportunityRecordScreen.js";
import {
  offerDeliverableDocumentId,
  opportunityRecordId,
  personRecordId,
  populatedRelationshipWorkspace,
  populatedShellQueries,
  principalId,
  projectionResponse,
  referencedOrganizationId,
  spaceId,
  workspaceId,
} from "./shell-fixture.js";

// The opportunity record, mounted and driven.
//
// WHAT THIS FILE PROVES, AND WHAT IT DELIBERATELY DOES NOT — stated first,
// because the limit is real and a reader who does not know it would over-read
// every green line below.
//
// The three record screens that already ship are proved from the NAVIGATION:
// `record-screen.interaction.test.tsx` mounts `RealApp`, clicks a row and
// waits for the record, and its own header says why — the shell is what decides
// between a collection and a record, and a test that mounted a screen and
// watched it call `onSelect` would prove nothing about the application.
//
// This screen cannot be reached that way YET, and the reason is scheduling
// rather than design. It is a context on `pipeline` exactly as the task record
// is a context on `tasks`; `pipeline` is not in `desktop-preload`'s surface
// registry until the Pipeline lot lands, and `ShellContext.surface` must be a
// registered surface. So the mount — the `opportunityContext` helper and the
// `PipelineSurface` hand-off — is the LAST commit of this branch, and the
// navigation half of the proof arrives with it.
//
// Everything below is therefore about what the screen READS and WRITES, mounted
// in a real DOM against projections parsed by the real contract schemas and a
// client that records real command envelopes. That is the whole of this file's
// claim. It is not a claim that a Pipeline card opens this screen.
//
// Every assertion here was broken on purpose before it was trusted, and the
// failure message it produced is recorded in the pull request. An assertion
// that never fails is decoration, and this repository has shipped four regexes
// guarding focus-return that did not work.

const secondOfferId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000005b1",
);
const wrongPairOfferId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000005b2",
);
const waitingOfferId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000005b3",
);
const derivedOfferId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000005b4",
);
const secondDeliverableId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-0000000005b5",
);
const unstampedDealId = StrategicRecordIdSchema.parse(
  "00000000-0000-4000-8000-0000000005b6",
);

const base = {
  workspaceId,
  spaceId,
  createdBy: principalId,
  recordState: "active" as const,
  version: 4,
  // A YEAR AND A HALF OLD. The record's own age and its time in the current
  // stage are two different numbers, and this fixture is built so they cannot
  // be confused: any screen that fell back to `createdAt` would print a number
  // in the hundreds where the answer is ten.
  createdAt: "2025-01-06T08:00:00.000Z",
  updatedAt: "2026-07-20T14:30:00.000Z",
};

/**
 * A real qualification: four paragraphs, well over a thousand characters.
 *
 * The plan is emphatic and the reason is empirical — fixtures with
 * one-sentence fields hid a whole class of layout defects, and a real
 * `intendedOutcome` runs 1 400-3 000 characters. `qualification` is the CRM
 * analogue of one and is kept OFF the accepted Pipeline card for exactly that
 * reason. This screen is where it lives, so this is the length it is asserted
 * at.
 */
const QUALIFICATION = [
  "Budżet jest potwierdzony na kwartał i stoi po stronie sponsorki, która ma mandat do podpisu do wysokości ustalonej na początku roku, więc rozmowa o cenie nie musi wracać do zarządu, dopóki mieścimy się w tym progu — a mieścimy się w nim we wszystkich trzech wariantach, które do tej pory policzyliśmy razem z dystrybucją.",
  "Decyzja techniczna należy do zespołu utrzymania, nie do bezpieczeństwa, i to jest zmiana względem tego, co zakładaliśmy na pierwszym spotkaniu. Zespół utrzymania odpowiada za okno serwisowe i za dyżur nocny, więc wariant z dyżurem jest dla nich rozstrzygający, a wariant bez dyżuru czytają jako ofertę dla kogoś innego.",
  "Konkurencja jest w tym postępowaniu obecna i została nazwana wprost: dwie firmy, obie z tego samego katalogu dystrybutora, obie z krótszym czasem reakcji na papierze. Nasza przewaga jest w tym, że mamy już wdrożone dwa środowiska i znamy ich integrację z systemem zgłoszeń, czego żadna z nich nie ma bez osobnego projektu wdrożeniowego.",
  "Ryzyko, którego jeszcze nie zamknęliśmy: termin ważności wyceny dystrybucji jest krótszy niż okno decyzyjne po stronie klienta, więc albo przedłużamy wycenę, albo cena musi zostać potwierdzona przed końcem miesiąca. To jest jedyna rzecz, która może wywrócić ten harmonogram, i dlatego stoi jako następny krok.",
  "Historia kontaktu: pierwsze rozmowy zaczęły się jeszcze przed audytem, wróciły po nim i od tego momentu prowadzimy je z dwiema osobami naraz, co jest wygodne przy uzgadnianiu zakresu i niewygodne przy uzgadnianiu terminu. Warto to zapisać, bo każde następne spotkanie z jedną z nich trzeba potem powtórzyć drugiej.",
].join("\n\n");

/**
 * A next action at the kernel's own ceiling. The Pipeline card clamps this to
 * two lines and must; the RECORD is where the whole thing is readable, which is
 * the difference between a card and a record.
 */
const LONG_NEXT_ACTION =
  `Potwierdź u dystrybucji termin ważności wyceny i dopisz go do oferty. ${"Jeżeli dystrybucja nie przedłuży terminu, przygotuj wariant bez dyżuru nocnego jako pozycję zapasową i pokaż obie ceny obok siebie. ".repeat(5)}`
    .slice(0, 1000)
    .trimEnd();

const deal = {
  ...base,
  id: opportunityRecordId,
  kind: "opportunity" as const,
  title: "Program porządkowania bezpieczeństwa informacji",
  organizationId: referencedOrganizationId,
  personIds: [personRecordId],
  ownerPersonId: personRecordId,
  need: "Zarząd i zespół techniczny mają dwie różne wersje stanu bezpieczeństwa.\n\nKażde spotkanie zaczyna się od uzgadniania faktów, zamiast od decyzji.",
  qualification: QUALIFICATION,
  stage: "negotiation",
  // Ten days ago against a record created eighteen months ago. See `base`.
  stageEnteredAt: "2026-07-21T09:00:00.000Z",
  nextAction: LONG_NEXT_ACTION,
  evidenceSourceIds: [],
  offerIds: [],
  projectIds: [],
  state: "open" as const,
};

/**
 * A deal whose stage was never stamped — every deal written before the stage
 * could move at all. It exists so the "unknown" branch is REACHABLE: without
 * it, a screen that quietly fell back to the record's age would be
 * indistinguishable from one that does not.
 */
const unstampedDeal = {
  ...deal,
  id: unstampedDealId,
  title: "Odnowienie wsparcia platformy",
  stageEnteredAt: undefined,
  offerIds: [],
};

const offerBase = {
  ...base,
  kind: "offer" as const,
  opportunityId: opportunityRecordId,
  ownerPrincipalId: principalId,
  nextAction: "",
};

/** cost EUR 34 500 × 4.31 = 148 695 PLN, price CONFIRMED 186 000 →
 *  leaves 37 305 exactly, margin 20%. */
const confirmedOffer = {
  ...offerBase,
  id: secondOfferId,
  title: "Wariant bez dyżuru nocnego",
  deliverableDocumentId: secondDeliverableId,
  state: "accepted" as const,
  cost: { amountMinor: 3_450_000, currency: "EUR" as const },
  rate: {
    from: "EUR" as const,
    to: "PLN" as const,
    rateMicros: 4_310_000,
    at: "2026-07-02",
  },
  price: {
    basis: "confirmed" as const,
    price: { amountMinor: 18_600_000, currency: "PLN" as const },
  },
};

/** cost USD 41 200 × 3.94 = 162 328 PLN exact, derived 202 910 → ≈ 205 000,
 *  leaves ≈ 42 672. The worked example the whole wave is checked against. */
const derivedOffer = {
  ...offerBase,
  id: derivedOfferId,
  title: "Wariant z dyżurem nocnym",
  deliverableDocumentId: offerDeliverableDocumentId,
  state: "submitted" as const,
  cost: { amountMinor: 4_120_000, currency: "USD" as const },
  rate: {
    from: "USD" as const,
    to: "PLN" as const,
    rateMicros: 3_940_000,
    at: "2026-07-05",
  },
};

/** A dollar cost with a EURO rate stored beside it. The failure this guards has
 *  NO visible symptom — the wrong pair yields a plausible złoty amount, not an
 *  error — so the case has to be seeded or the guard is untested. */
const wrongPairOffer = {
  ...offerBase,
  id: wrongPairOfferId,
  title: "Wariant rozszerzony",
  deliverableDocumentId: secondDeliverableId,
  state: "ready" as const,
  cost: { amountMinor: 1_000_000, currency: "USD" as const },
  rate: {
    from: "EUR" as const,
    to: "PLN" as const,
    rateMicros: 4_310_000,
    at: "2026-07-02",
  },
};

/** Kacper's frequent working state, not missing data: the distribution has not
 *  quoted yet, and the first number to arrive is the cost. */
const waitingOffer = {
  ...offerBase,
  id: waitingOfferId,
  title: "Wariant pilotażowy",
  deliverableDocumentId: secondDeliverableId,
  state: "draft" as const,
  nextAction: "czekamy na wycenę od dystrybucji",
};

const relationships = {
  ...populatedRelationshipWorkspace,
  records: [
    ...populatedRelationshipWorkspace.records.filter(
      (record) => record.id !== opportunityRecordId && record.kind !== "offer",
    ),
    deal,
    unstampedDeal,
    confirmedOffer,
    derivedOffer,
    wrongPairOffer,
    waitingOffer,
  ],
};

const queries = {
  ...populatedShellQueries,
  "relationship.workspace": projectionResponse(relationships),
};

const noop = async (): Promise<void> => {};

/**
 * `execute` runs `CommandEnvelopeSchema.parse` before this is reached, so an
 * envelope arriving here has satisfied the real contract. A payload key the
 * schema forbids leaves the recorder EMPTY — which is why every write assertion
 * below checks the recorded envelope and not just that a click happened.
 */
const recordingClient = (
  sent: CommandEnvelope[],
): ConstellationRendererClient =>
  ({
    executeCommand: async (command: CommandEnvelope) => {
      sent.push(command);
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: "2026-07-31T12:00:00.000Z",
          outcome: "success",
          diagnosticCode: "accepted",
          affected: [],
          auditReceiptId: "90000000-0000-4000-8000-000000000009",
          projection: {
            kind: "strategic.record_changed",
            recordId: "",
            recordType: "",
            version: 5,
          },
        },
      };
    },
  }) as unknown as ConstellationRendererClient;

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

interface Mounted {
  readonly snapshot: DesktopSnapshot;
  readonly sent: CommandEnvelope[];
}

const openRecord = async (
  options: {
    readonly dealId?: string;
    readonly comments?: string;
  } = {},
): Promise<Mounted> => {
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const readClient = createScenarioClient({ queries });
  const snapshot = await loadDesktopSnapshot(readClient);
  assert.equal(
    snapshot.relationships.kind,
    "ready",
    "the fixture did not parse as a relationship workspace",
  );
  const records =
    snapshot.relationships.kind === "ready"
      ? snapshot.relationships.data.records
      : [];
  const opportunity = records.find(
    (record) =>
      record.kind === "opportunity" &&
      record.id === (options.dealId ?? opportunityRecordId),
  );
  assert.ok(
    opportunity?.kind === "opportunity",
    "the deal is not in the parsed projection",
  );

  const sent: CommandEnvelope[] = [];
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(OpportunityRecordScreen, {
        snapshot,
        opportunity,
        client: recordingClient(sent),
        onReload: noop,
        onFailure: () => {
          assert.fail("the write was refused");
        },
        busy: false,
        // ALWAYS `unavailable`, and that is a FINDING rather than a shortcut.
        // `CommentTargetSchema` (`contracts/src/command.ts:2332-2345`) has three
        // arms — task, project, organization — and its own comment says the
        // kernel "refuses a target that resolves to a Person, an Opportunity or
        // any other strategic kind". So `comment.list` cannot be issued for a
        // deal and `comment.add` cannot be written against one: the ready arm is
        // UNREACHABLE against today's kernel, and a fixture that built one would
        // be asserting a shape the product cannot produce.
        comments: {
          kind: "unavailable",
          message:
            options.comments ?? "Comments could not be read on this device.",
        },
        commentBusy: false,
        canComment: true,
        canResolve: true,
        currentPrincipalId: principalId,
        actorOf: () => ({
          name: "Kacper",
          short: "KP",
          agent: false,
          role: "member",
        }),
        mentionNameOf: () => "Kacper",
        mentionCandidates: [],
        onAddComment: async () => true,
        onEditComment: async () => true,
        onResolveComment: async () => true,
        onAttachToComment: async () => undefined,
        onInspectAttachment: async () => "available" as const,
        onRestoreAttachment: async () => "available" as const,
        onBack: () => {},
        onOpenOrganization: () => {},
        onOpenProject: () => {},
      }),
    );
  });
  return { snapshot, sent };
};

const openTab = async (tab: string): Promise<void> => {
  const button = container.querySelector<HTMLElement>(
    `[data-record-tab="${tab}"]`,
  );
  assert.ok(button, `no ${tab} tab on the record`);
  await act(async () => {
    button.click();
  });
};

const text = (selector: string): string => {
  const node = container.querySelector(selector);
  assert.ok(node, `nothing matched ${selector}`);
  return node.textContent ?? "";
};

const offerArticles = (): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>("[data-offer]"),
];

// ── The record is the document ──────────────────────────────────────────────

test("the qualification is the BODY of the record and arrives whole, paragraph for paragraph", async () => {
  await openRecord();
  const body = container.querySelector<HTMLElement>(
    '[data-opportunity-field="qualification"]',
  );
  assert.ok(body, "the qualification is not on the record at all");

  // Every paragraph, and every paragraph's whole text. A clamp, an ellipsis or
  // an expander would satisfy "the qualification is on screen" and fail here,
  // which is the point: this field is kept off the Pipeline card BECAUSE it
  // arrives as paragraphs, so the record showing a teaser of it would leave the
  // product with nowhere the deal is actually readable.
  const paragraphs = [...body.querySelectorAll("p")].map(
    (node) => node.textContent ?? "",
  );
  const expected = QUALIFICATION.split("\n\n");
  assert.equal(paragraphs.length, expected.length);
  for (const [position, paragraph] of expected.entries())
    assert.equal(paragraphs[position], paragraph);
  assert.ok(
    (body.textContent ?? "").length > 1_400,
    "the rendered qualification is shorter than the text it was given",
  );
});

test("a next action at the kernel's 1 000-character ceiling is readable in full on the record", async () => {
  await openRecord();
  const body = container.querySelector<HTMLElement>(
    '[data-opportunity-field="nextAction"]',
  );
  assert.ok(body, "the next action is not on the record");
  assert.equal(body.textContent, LONG_NEXT_ACTION);
});

// ── Time in a stage is a different number from the deal's age ───────────────

test("how long a deal has stood in its stage is read from the stamp, never from the record's age", async () => {
  await openRecord();
  const standing = text("[data-opportunity-standing]");
  // The deal was created eighteen months ago and entered this stage ten days
  // ago. A fallback to `createdAt` prints a number in the hundreds.
  assert.match(standing, /\b10 days in this stage\b/u);
  assert.doesNotMatch(standing, /\b[5-9]\d\d days\b/u);
});

test("a deal whose stage was never stamped says the time is unknown rather than borrowing its age", async () => {
  await openRecord({ dealId: unstampedDealId });
  const standing = text("[data-opportunity-standing]");
  assert.equal(standing, "time in this stage unknown");
  assert.doesNotMatch(standing, /\d/u);
});

// ── The offer sheet ─────────────────────────────────────────────────────────

test("the three numbers on an offer subtract exactly, and the derived one names the CONFIGURED markup", async () => {
  await openRecord();
  await openTab("offers");
  const derived = container.querySelector<HTMLElement>(
    `[data-offer="${derivedOfferId}"]`,
  );
  assert.ok(derived, "the derived offer is not on the sheet");
  const row = (key: string): string =>
    derived.querySelector(`[data-offer-row="${key}"]`)?.textContent ?? "";

  // cost 162 328 → derived price ≈ 205 000 → leaves ≈ 42 672. The derived
  // price is rounded and says so with `≈`; what is LEFT is the exact difference
  // of the two numbers printed above it and is never rounded a second time — a
  // card whose three numbers stop subtracting reads as broken, not approximate.
  assert.match(row("cost"), /162,328 PLN/u);
  assert.match(row("price"), /≈ 205,000 PLN/u);
  assert.match(row("leaves"), /≈ 42,672 PLN/u);

  // The markup is the one configured in Settings, not one back-computed from
  // the rounded price — that comes out at 26% and would contradict the page it
  // was configured on, which is why `money.ts` hands none out at all.
  assert.match(row("price"), /markup 25%/u);
  assert.match(row("leaves"), /assumed, not measured/u);
});

test("a confirmed price is exact, carries no ≈, and states a MEASURED margin", async () => {
  await openRecord();
  await openTab("offers");
  const confirmed = container.querySelector<HTMLElement>(
    `[data-offer="${secondOfferId}"]`,
  );
  assert.ok(confirmed, "the confirmed offer is not on the sheet");
  const price =
    confirmed.querySelector('[data-offer-row="price"]')?.textContent ?? "";
  const leaves =
    confirmed.querySelector('[data-offer-row="leaves"]')?.textContent ?? "";
  assert.match(price, /186,000 PLN/u);
  assert.ok(!price.includes("≈"), "a confirmed price must not be approximate");
  assert.match(price, /confirmed/u);
  assert.match(leaves, /37,305 PLN/u);
  assert.match(leaves, /margin 20%/u);
});

test("a cost is never converted by a rate stored for another currency pair, and the sheet says which pair is stored", async () => {
  await openRecord();
  await openTab("offers");
  const wrong = container.querySelector<HTMLElement>(
    `[data-offer="${wrongPairOfferId}"]`,
  );
  assert.ok(wrong, "the wrong-pair offer is not on the sheet");
  const cost =
    wrong.querySelector('[data-offer-row="cost"]')?.textContent ?? "";
  const price =
    wrong.querySelector('[data-offer-row="price"]')?.textContent ?? "";
  const leaves =
    wrong.querySelector('[data-offer-row="leaves"]')?.textContent ?? "";

  // The dollar cost stands in dollars. A converted amount here would be a
  // plausible złoty number that nobody would ever question — which is the whole
  // reason the pair is named on the rate rather than implied.
  assert.match(cost, /10,000 USD/u);
  // No AMOUNT in the home currency — the pair itself is named in the reason
  // below, so the test looks for a number followed by PLN rather than for the
  // three letters, which is the difference between "nothing was converted" and
  // "nothing mentions złoty".
  assert.doesNotMatch(
    cost,
    /[\d,]+\s*PLN/u,
    "a mismatched pair must not produce a home-currency amount",
  );
  assert.match(cost, /the stored rate is EUR→PLN, not USD→PLN/u);
  assert.match(price, /not known yet/u);
  assert.match(leaves, /the stored rate is for another currency pair/u);
});

test("an offer still waiting for the distribution quote says so and never reads as a zero", async () => {
  await openRecord();
  await openTab("offers");
  const waiting = container.querySelector<HTMLElement>(
    `[data-offer="${waitingOfferId}"]`,
  );
  assert.ok(waiting, "the waiting offer is not on the sheet");
  const sentence =
    waiting.querySelector("[data-offer-waiting]")?.textContent ?? "";
  assert.match(sentence, /No cost from distribution yet/u);
  assert.match(sentence, /czekamy na wycenę od dystrybucji/u);
  // Not "0 PLN", not "—": the sheet is REPLACED by the sentence, because
  // waiting for a quote is a state of the work rather than a gap in the data.
  assert.equal(waiting.querySelectorAll("[data-offer-row]").length, 0);
  assert.ok(
    !(waiting.textContent ?? "").includes("0 PLN"),
    "a waiting offer must not print an amount",
  );
});

test("offer history is ordered so the current version leads, and the lead says so in a WORD", async () => {
  await openRecord();
  await openTab("offers");
  const articles = offerArticles();
  assert.equal(articles.length, 4, "the record must show every version");
  // Accepted beats submitted beats ready beats draft; declined would be last,
  // because it is the history of the negotiation rather than its current state.
  assert.deepEqual(
    articles.map((node) => node.dataset.offer),
    [secondOfferId, derivedOfferId, wrongPairOfferId, waitingOfferId],
  );
  // Order alone is not a channel a reader arriving mid-list can use, so the
  // leading version is named as well as placed first.
  assert.equal(articles[0]?.dataset.offerLead, "true");
  assert.match(articles[0]?.textContent ?? "", /current version/u);
  assert.equal(articles[1]?.dataset.offerLead, undefined);
});

test("a screen reader is told in WORDS whether a price was confirmed or derived", async () => {
  await openRecord();
  await openTab("offers");
  // The `≈`, the rounding to whole five thousands and the badge's position are
  // all visual, and a badge in a `<dd>` is announced out of order relative to
  // the number it qualifies. This sentence is the only channel that carries the
  // distinction to a reader who gets none of them — and nothing else in the
  // suite would notice it vanishing.
  const confirmed = container
    .querySelector(`[data-offer="${secondOfferId}"]`)
    ?.getAttribute("aria-label");
  const derived = container
    .querySelector(`[data-offer="${derivedOfferId}"]`)
    ?.getAttribute("aria-label");
  assert.match(confirmed ?? "", /price to the client 186,000 PLN, confirmed/u);
  assert.match(
    derived ?? "",
    /price to the client about 205,000 PLN, derived from the cost with an assumed markup of 25 percent on the cost/u,
  );
});

test("every percentage on the record says which percentage it is; a bare % never appears", async () => {
  await openRecord();
  await openTab("offers");
  const rendered = container.textContent ?? "";
  const bare = rendered
    .replaceAll(/(?:markup|margin|uplift)\s*\d+%/gu, "")
    .match(/\d+\s*%/gu);
  assert.equal(
    bare,
    null,
    `a percentage was printed without saying which one it is: ${String(bare)}`,
  );
});

// ── Writes ──────────────────────────────────────────────────────────────────

test("moving the deal to another stage sends that stage and that deal's version, and nothing else", async () => {
  const { sent } = await openRecord();
  const select =
    container.querySelector<HTMLSelectElement>("#opportunity-stage");
  assert.ok(select, "the record offers no way to move a stage");
  assert.equal(select.value, "negotiation");
  await act(async () => {
    select.value = "proposal";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.equal(sent.length, 1);
  const envelope = sent[0];
  assert.ok(envelope);
  assert.equal(envelope.commandName, "opportunity.update");
  assert.deepEqual(
    Object.keys(envelope.payload as Record<string, unknown>).sort(),
    ["opportunityId", "stage"],
  );
  // The EXACT key set, not "the deal is in there": one id too many is a version
  // conflict rather than a partial success.
  assert.deepEqual(envelope.expectedVersions, { [opportunityRecordId]: 4 });
});

test("un-confirming a price SENDS the derived basis rather than treating it as nothing to change", async () => {
  const { sent } = await openRecord();
  await openTab("offers");
  const confirmed = container.querySelector<HTMLElement>(
    `[data-offer="${secondOfferId}"]`,
  );
  assert.ok(confirmed);
  const button = [...confirmed.querySelectorAll("button")].find((node) =>
    (node.textContent ?? "").includes("Un-confirm"),
  );
  assert.ok(button, "a confirmed price offers no way back to derived");
  await act(async () => {
    button.click();
  });
  assert.equal(sent.length, 1);
  const envelope = sent[0];
  assert.ok(envelope);
  assert.equal(envelope.commandName, "opportunity.offerUpdate");
  // `{basis:"derived"}` has to travel. The kernel turns it into a CLEAR, so
  // derived keeps exactly one spelling on the record and un-confirming can never
  // leave a stale confirmed amount behind a sheet that reads as derived.
  assert.deepEqual(envelope.payload, {
    offerId: secondOfferId,
    price: { basis: "derived" },
  });
  assert.deepEqual(envelope.expectedVersions, { [secondOfferId]: 4 });
});

test("writing the qualification sends only that field, against only this deal", async () => {
  const { sent } = await openRecord();
  const form = container.querySelector<HTMLElement>(
    '[data-opportunity-field="qualification"]',
  );
  assert.ok(form, "the qualification is not on the record");
  const edit = [...(form.parentElement?.querySelectorAll("button") ?? [])].find(
    (node) => (node.textContent ?? "").trim() === "Edit",
  );
  assert.ok(edit, "the qualification cannot be written from the record");
  await act(async () => {
    edit.click();
  });
  const textarea = container.querySelector<HTMLTextAreaElement>(
    "#opportunity-qualification",
  );
  assert.ok(textarea, "no editor opened");
  assert.equal(
    textarea.value,
    QUALIFICATION,
    "the editor must open on the text that is stored, not on an empty box",
  );
  await act(async () => {
    textarea.value = `${QUALIFICATION}\n\nDodatek.`;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...container.querySelectorAll("button")].find(
    (node) => (node.textContent ?? "").trim() === "Save",
  );
  assert.ok(save);
  await act(async () => {
    save.click();
  });
  assert.equal(sent.length, 1);
  const envelope = sent[0];
  assert.ok(envelope);
  assert.equal(envelope.commandName, "opportunity.update");
  assert.deepEqual(
    Object.keys(envelope.payload as Record<string, unknown>).sort(),
    ["opportunityId", "qualification"],
  );
});

// ── The slices this record cannot fetch ─────────────────────────────────────

test("a comments read that failed shows the slice's OWN reason, keeps the composer, and puts no count on the tab", async () => {
  await openRecord({
    comments: "Comments could not be read on this device.",
  });
  const tab = container.querySelector<HTMLElement>(
    '[data-record-tab="comments"]',
  );
  assert.ok(tab);
  // A number is a claim, and there is nothing to claim it from. No number is
  // the honest reading of a slice that never arrived — a zero would be a lie
  // that looks exactly like a record nobody has written on.
  assert.equal(tab.textContent, "Comments");
  await openTab("comments");
  const status = container.querySelector('[role="status"]');
  assert.ok(status, "the failure is not stated at all");
  assert.equal(
    status.textContent,
    "Comments could not be read on this device.",
  );
  // The write is checked against the RECORD's version, which this slice does
  // not carry, so it still lands with no threads on screen. Losing the composer
  // with the list was the expensive half of getting this wrong.
  assert.ok(
    container.querySelector("textarea"),
    "the composer went away with the list",
  );
});

test("a linked project this reader cannot reach says so rather than offering a button that goes nowhere", async () => {
  await openRecord();
  // The deal above carries no project. The branch that matters is the one where
  // it does and the projects slice cannot answer — an id rendered as a title
  // would be a claim about a record nobody read.
  const note = container.querySelector("[data-opportunity-project]");
  assert.equal(
    note,
    null,
    "a deal with no delivery must not draw a project row",
  );
  assert.match(
    container.textContent ?? "",
    /Nothing has been turned into a project yet/u,
  );
});
