import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  CommentIdSchema,
  DocumentIdSchema,
  StrategicRecordIdSchema,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type { ScenarioFixtures } from "../src/client/scenario-client.js";
import type { DesktopSnapshot } from "../src/client/workflow.js";
import { OpportunityRecordScreen } from "../src/opportunity/OpportunityRecordScreen.js";
import {
  offerDeliverableDocumentId,
  opportunityRecordId,
  personRecordId,
  populatedBootstrap,
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
// client that records real command envelopes and answers real queries. That is
// the whole of this file's claim. It is not a claim that a Pipeline card opens
// this screen.
//
// COMMENTS ARE REACHABLE NOW. `CommentTargetSchema` grew its `opportunity` arm,
// so this record reads and writes its own conversation the way the organization
// record does — a TARGETED fetch beside the record, not a slice threaded down
// from a shell whose own comment target covers tasks and projects only. The
// note that used to stand here explaining that the ready arm was unreachable is
// gone with its reason: an explanation that outlives what it explained is how a
// stale one gets believed.
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

// Dziesięć dni w milisekundach. Stoi osobno, żeby fixture i asercja czytały tę
// samą liczbę, zamiast powtarzać ją w dwóch miejscach.
const TEN_DAYS_IN_MILLISECONDS = 10 * 24 * 60 * 60 * 1_000;

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
  //
  // Liczone OD ZEGARA, nie wpisane datą. Ekran czyta `new Date()`
  // (`OpportunityRecordScreen.tsx:311`), więc wpisana data znaczy „dziesięć
  // dni" wyłącznie w dniu, w którym ktoś ją wpisał: `2026-07-21` przechodziło
  // 31 lipca i padało 1 sierpnia na `main`, bez żadnej zmiany w kodzie.
  // Asercja mierzy CZAS, a nie zdarzenie, więc fixture musi iść za zegarem.
  stageEnteredAt: new Date(Date.now() - TEN_DAYS_IN_MILLISECONDS).toISOString(),
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

/**
 * A real grant, because permission is a STATED FACT on this panel rather than a
 * default. The shared fixture leaves `workspace.access` unavailable, which makes
 * `readCommentPermissions` answer `canComment: false` — correctly: the composer
 * then says the scope is read-only instead of sitting greyed out. Every comment
 * assertion below needs the other branch, so the grant is seeded here rather
 * than in the shared fixture, where it would change what every other screen's
 * tests start from.
 */
const access = {
  kind: "workspace.access" as const,
  policyVersion: 1,
  currentPrincipalId: principalId,
  canManage: true,
  members: [
    {
      membershipId: "00000000-0000-4000-8000-0000000005d1",
      principalId,
      displayName: "Kacper",
      role: "owner" as const,
      status: "active" as const,
      version: 1,
      spaces: [],
    },
  ],
};

const queries = {
  ...populatedShellQueries,
  "relationship.workspace": projectionResponse(relationships),
  "workspace.access": projectionResponse(access),
};

/**
 * The shell's own query set, with a `search.global` answer seeded.
 *
 * ⌘K goes through the real overlay and the real routing branch in `RealApp`,
 * so the search has to answer with the deal — a scenario client that refuses
 * `search.global` would leave the ⌘K half of the chain unproved while looking
 * exactly like a pass.
 */
const shellQueries = (): ScenarioFixtures["queries"] => ({
  ...queries,
  "search.global": projectionResponse({
    kind: "search.global",
    normalizedQuery: "program",
    items: [
      {
        recordKind: "opportunity" as const,
        recordId: opportunityRecordId,
        spaceId,
        title: deal.title,
        snippet: "Program porządkowania bezpieczeństwa informacji",
        matchedFields: ["title" as const],
        score: 10,
        updatedAt: base.updatedAt,
      },
    ],
  }),
});

const noop = async (): Promise<void> => {};

/**
 * `execute` runs `CommandEnvelopeSchema.parse` before this is reached, so an
 * envelope arriving here has satisfied the real contract. A payload key the
 * schema forbids leaves the recorder EMPTY — which is why every write assertion
 * below checks the recorded envelope and not just that a click happened.
 */
const commentId = CommentIdSchema.parse("00000000-0000-4000-8000-0000000005c1");

/** One open thread on the deal, in the projection's own shape. */
const dealThread = {
  id: commentId,
  rootCommentId: commentId,
  body: "Czy dyżur nocny jest w tej cenie, czy osobno?",
  author: { principalId, displayName: "Kacper" },
  mentionPrincipalIds: [],
  attachments: [],
  threadState: "open" as const,
  version: 1,
  createdAt: "2026-07-28T09:00:00.000Z",
  updatedAt: "2026-07-28T09:00:00.000Z",
  edited: false,
};

const recordingClient = (
  sent: CommandEnvelope[],
  reads: RendererQuery[],
  refuseComments: boolean,
): ConstellationRendererClient =>
  ({
    // `comment.list` is a TARGETED fetch this record issues itself — the
    // shell's own comment target covers tasks and projects only — so the read
    // is answered here and its query envelope is recorded. That envelope is
    // half the proof: a deal whose comments were fetched under the wrong
    // discriminator would render somebody else's conversation.
    runQuery: async (query: RendererQuery) => {
      reads.push(query);
      if (refuseComments)
        return {
          kind: "query_result",
          result: {
            contractVersion: 1,
            queryId: "00000000-0000-4000-8000-0000000005c9",
            kernelTime: "2026-07-31T12:00:00.000Z",
            outcome: "refused",
            diagnosticCode: "query.unsupported",
          },
        };
      return projectionResponse({
        kind: "comment.list",
        target: query.parameters.target,
        threads: [dealThread],
      });
    },
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

/** The query envelope shape `runQuery` is handed, narrowed to what is read. */
interface RendererQuery {
  readonly queryName: string;
  readonly parameters: Record<string, unknown>;
}

interface Mounted {
  readonly snapshot: DesktopSnapshot;
  readonly sent: CommandEnvelope[];
  readonly reads: RendererQuery[];
}

const openRecord = async (
  options: {
    readonly dealId?: string;
    /** Refuse the `comment.list` read, the way a kernel predating the
     *  opportunity target arm does. */
    readonly refuseComments?: boolean;
    /** What the workspace sums into, and what it records. */
    readonly homeCurrency?: string;
    readonly currencies?: readonly string[];
  } = {},
): Promise<Mounted> => {
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const readClient = createScenarioClient({
    queries:
      options.homeCurrency === undefined && options.currencies === undefined
        ? queries
        : {
            ...queries,
            "workspace.bootstrapContext": projectionResponse({
              ...populatedBootstrap,
              workspace: {
                ...populatedBootstrap.workspace,
                commercialDefaults: {
                  ...populatedBootstrap.workspace.commercialDefaults,
                  ...(options.homeCurrency === undefined
                    ? {}
                    : { homeCurrency: options.homeCurrency }),
                  ...(options.currencies === undefined
                    ? {}
                    : { currencies: options.currencies }),
                },
              },
            }),
          },
  });
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
  const reads: RendererQuery[] = [];
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(OpportunityRecordScreen, {
        snapshot,
        opportunity,
        client: recordingClient(sent, reads, options.refuseComments === true),
        onReload: noop,
        onFailure: () => {
          assert.fail("the write was refused");
        },
        busy: false,
        onBack: () => {},
        onOpenOrganization: () => {},
        onOpenProject: () => {},
      }),
    );
  });
  return { snapshot, sent, reads };
};

/** The comments are a FETCH, so the render that shows them is a frame later
 *  than the mount. Without this every comment assertion would be measuring the
 *  empty list the panel draws while the read is in flight. */
const settleReads = async (): Promise<void> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
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

/**
 * Type into a controlled field the way a person does.
 *
 * Assigning `node.value` directly does NOT reach React: React installs its own
 * value tracker on the prototype descriptor and treats an unchanged tracked
 * value as "no change", so the synthetic `input` event is dropped and the
 * component's state never moves. The write then lands carrying whatever the
 * draft held before — an empty string.
 *
 * This is not a hypothetical. The qualification write assertion below was
 * GREEN while sending an empty body, because it checked the payload's KEY SET
 * and a key holding "" is still a key. The estimate assertion is what caught
 * it, by asserting the value rather than the shape. Both now go through here,
 * and both assert what was actually sent.
 */
const typeInto = (
  node: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void => {
  const prototype =
    node instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  assert.ok(setter, "no native value setter to bypass React's tracker with");
  setter.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
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

test("the value on the record says whether it came from an offer or from an estimate", async () => {
  // The FIRST number a reader sees. A confirmed offer amount and somebody's
  // guess are not the same claim, and printed bare they are the same string —
  // an assumption rendered like a fact, which is the defect the offer sheet
  // below spends four channels avoiding. Two channels here too: the word, and
  // the `≈` that only an estimate carries.
  //
  // The seeded deal has an ACCEPTED offer with a confirmed price, so the answer
  // is the offer's number and must say so.
  await openRecord();
  const block = container.querySelector<HTMLElement>(
    "[data-opportunity-value]",
  );
  assert.ok(block, "the record shows no value at all");
  assert.equal(block.dataset.valueBasis, "offer");
  assert.match(block.textContent ?? "", /186,000 PLN from an offer/u);
  assert.ok(
    !(block.textContent ?? "").includes("≈"),
    "a number taken from a confirmed offer must not be marked approximate",
  );
});

test("a deal with no offer says so as an ESTIMATE rather than as an unlabelled number", async () => {
  // `unstampedDeal` carries no offer at all. Without the basis on the block,
  // this case and the one above render the same shape — which is the point.
  await openRecord({ dealId: unstampedDealId });
  const block = container.querySelector<HTMLElement>(
    "[data-opportunity-value]",
  );
  assert.ok(block);
  assert.equal(block.dataset.valueBasis, "estimate");
  assert.match(
    block.textContent ?? "",
    /No value yet — neither an estimate nor a confirmed offer/u,
  );
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
    typeInto(textarea, `${QUALIFICATION}\n\nDodatek.`);
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
  // The key set AND the value. A key holding an empty string is still a key,
  // which is how this assertion once shone green over a write that sent
  // nothing — see `typeInto`.
  assert.deepEqual(envelope.payload, {
    opportunityId: opportunityRecordId,
    qualification: `${QUALIFICATION}\n\nDodatek.`,
  });
});

test("the estimate is writable from the record, in minor units, and never as a zero", async () => {
  // The one money field the DEAL owns, and the only screen that could write it.
  // A deal with no estimate says nobody has put a number on it — never "0 PLN",
  // which is a different claim entirely.
  const { sent } = await openRecord({ dealId: unstampedDealId });
  assert.match(
    container.textContent ?? "",
    /Nobody has put a number on this deal/u,
  );
  const open = [...container.querySelectorAll("button")].find(
    (node) => (node.textContent ?? "").trim() === "Set the estimate",
  );
  assert.ok(open, "the deal's own value cannot be written from its record");
  await act(async () => {
    open.click();
  });
  const input = container.querySelector<HTMLInputElement>(
    "#opportunity-estimate",
  );
  assert.ok(input);
  await act(async () => {
    typeInto(input, "120000");
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
  // MINOR units. A major-unit number here is off by a hundred and looks
  // entirely plausible on the board, which is why it is asserted exactly.
  assert.deepEqual(envelope.payload, {
    opportunityId: unstampedDealId,
    estimate: { amountMinor: 12_000_000, currency: "PLN" },
  });
});

// ── The currency the workspace sums into ────────────────────────────────────

test("the sheet converts into the currency the WORKSPACE is configured with, not a pinned one", async () => {
  // THE DEFECT THIS EXISTS FOR IS INVISIBLE TO EVERY OTHER ASSERTION IN THIS
  // FILE. A wrong home currency still renders every row, still shows a price,
  // still subtracts — the numbers are simply in a currency nobody chose. The
  // shape is right and the value is wrong, which is the only kind of defect a
  // layout assertion cannot see.
  //
  // The seeded offers convert USD→PLN and EUR→PLN, so a workspace summing into
  // PLN and a screen with `"PLN"` written into it agree BY ACCIDENT. Configure
  // the workspace for EUR and they part company: `costInHome` refuses a rate
  // whose `to` is not the home currency, so the sheet must now say the pair is
  // wrong rather than print a złoty amount under a euro heading.
  await openRecord({ homeCurrency: "EUR", currencies: ["EUR", "USD", "PLN"] });
  await openTab("offers");
  const derived = container.querySelector<HTMLElement>(
    `[data-offer="${derivedOfferId}"]`,
  );
  assert.ok(derived);
  const cost =
    derived.querySelector('[data-offer-row="cost"]')?.textContent ?? "";
  const price =
    derived.querySelector('[data-offer-row="price"]')?.textContent ?? "";
  // The dollar cost stands in dollars and names the pair it could not use.
  assert.match(cost, /41,200 USD/u);
  assert.match(cost, /the stored rate is USD→PLN, not USD→EUR/u);
  // And the number that WOULD have been printed against a pinned PLN is gone.
  assert.doesNotMatch(
    cost,
    /162,328/u,
    "the cost was converted at a rate the workspace's home currency forbids",
  );
  assert.match(price, /not known yet/u);
});

test("an amount is written in a currency the workspace records", async () => {
  await openRecord({ homeCurrency: "EUR", currencies: ["EUR", "USD", "PLN"] });
  const open = [...container.querySelectorAll("button")].find((node) =>
    (node.textContent ?? "").includes("the estimate"),
  );
  assert.ok(open, "the estimate cannot be written");
  await act(async () => {
    open.click();
  });
  const picker = container.querySelector<HTMLSelectElement>(
    "#opportunity-estimate-currency",
  );
  assert.ok(picker, "the estimate offers no currency");
  // The options ARE the workspace's list — not a fourth hand-written copy of
  // the currency union, which is what this projection field exists to prevent.
  assert.deepEqual(
    [...picker.options].map((option) => option.value),
    ["EUR", "USD", "PLN"],
  );
  assert.equal(
    picker.value,
    "EUR",
    "the picker did not open on the home currency",
  );
});

test("a workspace summing into a currency it does not record is refused a control, not given a broken one", async () => {
  // #189's NAMED GAP: nothing enforces that `homeCurrency` is a member of
  // `currencies`. Starting a form here would offer to write an amount in a
  // currency the workspace does not record. Reading is unaffected — a stored
  // amount stays readable in whatever it was stored in.
  await openRecord({ homeCurrency: "USD", currencies: ["PLN", "EUR"] });
  assert.ok(
    container.querySelector("[data-currency-misconfigured]"),
    "the mismatch is not stated",
  );
  assert.equal(
    [...container.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes("the estimate"),
    ),
    undefined,
    "a control was offered on a currency the workspace does not record",
  );
  // The record still READS. Withholding a control is not withholding the deal.
  assert.match(container.textContent ?? "", /Qualification/u);
});

// ── Comments ────────────────────────────────────────────────────────────────

test("a comment written on a deal reaches the kernel AS A DEAL", async () => {
  const { sent } = await openRecord();
  await settleReads();
  await openTab("comments");
  const field = container.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Write a comment"]',
  );
  assert.ok(field, "the Comments tab offers no way to comment");
  await act(async () => {
    typeInto(field, "Dyżur nocny jest w tej cenie.");
  });
  await act(async () => {
    field
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  const added = sent.find((command) => command.commandName === "comment.add");
  assert.ok(added, "writing a comment on a deal issued no command");
  // The TARGET is the whole point. A strategic-record id does not say which
  // kind it names, so the discriminator is the only thing the kernel can check
  // what it found against — and it is the DEAL's id, not its client's, which is
  // the slip that would otherwise land this conversation on the organization.
  assert.deepEqual((added.payload as Record<string, unknown>)["target"], {
    kind: "opportunity",
    opportunityId: opportunityRecordId,
  });
  // Written against the DEAL's version. A comment is checked against the record
  // it hangs on, and this envelope's key set is exact — one id too many is a
  // version conflict rather than a partial success.
  assert.deepEqual(added.expectedVersions, { [opportunityRecordId]: 4 });
});

test("the deal's conversation is FETCHED as a deal, not as its client", async () => {
  const { reads } = await openRecord();
  await settleReads();
  await openTab("comments");
  const read = reads.find((query) => query.queryName === "comment.list");
  assert.ok(read, "the record never asked for its own comments");
  // The read half of the same point. A list fetched under the wrong
  // discriminator renders somebody else's conversation under this heading, and
  // every visual assertion on this screen would stay green.
  assert.deepEqual(read.parameters["target"], {
    kind: "opportunity",
    opportunityId: opportunityRecordId,
  });
  assert.match(
    container.textContent ?? "",
    /Czy dyżur nocny jest w tej cenie/u,
  );
});

test("a kernel that refuses the deal target says so and still offers the composer", async () => {
  // A workspace whose kernel predates the opportunity arm refuses this query.
  // The tab is one of three here, so its absence would read as "this deal has
  // no conversation" rather than "the conversation could not be read".
  await openRecord({ refuseComments: true });
  await settleReads();
  const tab = container.querySelector<HTMLElement>(
    '[data-record-tab="comments"]',
  );
  assert.ok(tab);
  // No number: a claim with nothing to claim it from.
  assert.equal(tab.textContent, "Comments");
  await openTab("comments");
  const status = container.querySelector('[role="status"]');
  assert.ok(status, "the failure is not stated at all");
  assert.match(
    status.textContent ?? "",
    /unavailable/iu,
    "the reason shown is not the read's own",
  );
  // The write is checked against the RECORD's version, which the list does not
  // carry, so it still lands with no threads on screen.
  assert.ok(
    container.querySelector('textarea[aria-label="Write a comment"]'),
    "the composer went away with the list",
  );
});

// ── The slices this record cannot fetch ─────────────────────────────────────

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

// ── THE CHAIN, END TO END ───────────────────────────────────────────────────
//
// Everything above mounts the screen directly, and says so. THIS section does
// not: it mounts the real shell, clicks the real card and drives the real
// search overlay, because the thing being proved is a SEAM and not a component.
//
// The failure it guards is trap 24, and the whole point of it is that it is
// invisible: `record-kind-registry` pointing `opportunity` at `pipeline`
// compiles, passes every test in this repository, and silently turns "open this
// deal" into "open the Pipeline screen". The board renders, a card is there, the
// reader is on the right surface — and the record they asked for never opened.
// Both halves of the repoint change together or neither does, and this is what
// says so.

const mountShell = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: shellQueries() });
  const snapshot = await loadDesktopSnapshot(client);
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
};

const waitFor = async (
  ready: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (ready()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.fail(message);
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

/** The record that is on screen, by the anchor only this screen writes. */
const openedRecord = (): HTMLElement | null =>
  container.querySelector<HTMLElement>('[data-record-kind="opportunity"]');

test("opening a deal from a Pipeline card lands on THAT deal's record", async () => {
  await mountShell();
  await goTo("pipeline");
  await waitFor(
    () => container.querySelector("[data-pipeline-card]") !== null,
    "the board never mounted",
  );
  // The board is a board FIRST. If this were already the record, the assertion
  // below would prove nothing about opening one.
  assert.equal(openedRecord(), null, "the board opened as a record");

  const card = container.querySelector<HTMLElement>(
    `[data-pipeline-card="${opportunityRecordId}"]`,
  );
  assert.ok(card, "the seeded deal has no card on the board");
  await act(async () => {
    card.click();
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitFor(
    () => openedRecord() !== null,
    "opening a card did not open the record — it held the board instead",
  );

  // THAT deal, not merely A record. The board carries two deals, and a mount
  // that resolved the wrong one would satisfy every structural check above.
  const record = openedRecord();
  assert.ok(record);
  assert.match(
    record.querySelector("h1")?.textContent ?? "",
    /Program porządkowania bezpieczeństwa informacji/u,
  );
  assert.ok(
    record.querySelector('[data-opportunity-field="qualification"]'),
    "the record opened without the body it exists to carry",
  );
});

test("⌘K on a deal opens THAT deal's record, not the screen it lives on", async () => {
  await mountShell();
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        metaKey: true,
        bubbles: true,
      }),
    );
  });
  const field = container.querySelector<HTMLInputElement>(
    'input[type="search"], .search-overlay input, dialog input',
  );
  assert.ok(field, "⌘K opened no search field");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  await act(async () => {
    setter.call(field, "Program");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await waitFor(
    () =>
      [...container.querySelectorAll("button, [role='option']")].some((node) =>
        (node.textContent ?? "").includes(
          "Program porządkowania bezpieczeństwa informacji",
        ),
      ),
    "the search never offered the seeded deal",
  );
  const hit = [
    ...container.querySelectorAll<HTMLElement>("button, [role='option']"),
  ].find((node) =>
    (node.textContent ?? "").includes(
      "Program porządkowania bezpieczeństwa informacji",
    ),
  );
  assert.ok(hit);
  await act(async () => {
    hit.click();
  });
  await waitFor(
    () => openedRecord() !== null,
    "⌘K on a deal opened the Pipeline SCREEN rather than the deal's record — the exact downgrade the paired repoint exists to prevent",
  );
  assert.match(
    openedRecord()?.querySelector("h1")?.textContent ?? "",
    /Program porządkowania bezpieczeństwa informacji/u,
  );
});

test("a saved tab whose deal id names something else does not open that thing as a deal", async () => {
  // REACHABLE, and that is the point of writing it. `opportunityContext` is
  // only ever built from a record already known to be a deal — but a session is
  // restored from device state, and `restoreShellNavigation` validates that the
  // id is a STRING, not what it names. A workspace where the id was reassigned,
  // or a saved state written by hand, hands this mount an organization under an
  // `opportunity:` key.
  //
  // Without the kind test in the mount's lookup, `find` matches on the id alone
  // and the record screen is handed an ORGANIZATION: it would read
  // `qualification` and `stage` off a record that has neither, and every
  // structural assertion in this file would still pass.
  localStorage.setItem(
    "constellation.shell-navigation",
    JSON.stringify({
      version: 3,
      state: {
        tabs: [
          {
            key: `opportunity:${referencedOrganizationId}`,
            label: "Northstar Industries",
            surface: "pipeline",
            opportunityId: referencedOrganizationId,
          },
        ],
        activeKey: `opportunity:${referencedOrganizationId}`,
        history: [
          {
            key: `opportunity:${referencedOrganizationId}`,
            label: "Northstar Industries",
            surface: "pipeline",
            opportunityId: referencedOrganizationId,
          },
        ],
        historyIndex: 0,
      },
    }),
  );
  await mountShell();
  // Settle whatever the shell decides to do with the restored tab — the point
  // is what it must NOT do, so the wait is on the shell being past its first
  // paint rather than on any particular landing.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  // TWO independent guards stand here and the order is worth knowing. The
  // prune fires first: an id that is not in the deal set drops the tab
  // entirely, so the session falls back rather than opening anything. The kind
  // test in the mount's own lookup is the second, for the frame before a
  // snapshot has arrived to prune against.
  //
  // What must never happen is the one thing both exist to stop: an ORGANIZATION
  // rendered on the deal's record screen, where it would be read for a
  // `qualification` and a `stage` it does not have.
  assert.equal(
    openedRecord(),
    null,
    "an organization was opened as a deal, on the deal's own record screen",
  );
  assert.doesNotMatch(
    container.textContent ?? "",
    /Northstar Industries/u,
    "the restored tab kept a client's name under a deal's key",
  );
});
