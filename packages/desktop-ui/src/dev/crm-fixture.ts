// The CRM material the layout harness never had.
//
// WHY THIS FILE EXISTS. Wave C shipped four screens that read one slice —
// `relationship.workspace` — and the harness that mounts the shell for the
// layout gate answered no such query at all. `optionalProjection` swallowed the
// refusal, every one of those screens rendered "this view's data is unavailable
// right now", and five green passes said nothing whatsoever about them. Measured
// rather than assumed: the gate's own report line named `opportunity` as a
// record kind NEVER OPENED, and `pipeline`, `renewals`, `organizations` and
// `people` as destinations that drew no row or card. A capability a fixture does
// not exercise is indistinguishable from one that was never built.
//
// SEEDED FOR SHAPE, NOT FOR PRESENCE. A deal called "Deal" worth a round hundred
// thousand proves that a card renders; it proves nothing about the geometry the
// card is asked to hold. So the names are the length real organisation names
// are, the qualification runs paragraphs, the amounts are not round, one cost is
// quoted in a currency the workspace does not sell in so the conversion draws,
// and one contract clock spans years. That rule is not a preference — Wave B's
// one-sentence fixture is what hid a whole class of layout defects until real
// prose met a fixed track.
//
// AND IT IS STILL NOT REAL DATA. Every number registered against these records
// is a statement about THIS FIXTURE's shape. Kacper seeds real money before the
// verification session, and that pass is the one that gets to say whether these
// screens hold his workspace.
//
// NOTHING HERE INVENTS A SHAPE THE KERNEL CANNOT WRITE. Each record is built to
// what `domain/src/strategic-depth.ts` actually produces: `cycleKey` is
// `{organizationId}:{expiry date}`, the way `workflow.ts:3054` generates it;
// `evidenceSourceIds` are deduplicated and sorted the way `createRenewal` and
// `createOpportunity` leave them, and they are ids of sources this harness
// really serves rather than ids minted beside the list they point into;
// `offerIds` on a deal and
// `opportunityId` on an offer name each other; a renewal is linked to the deal
// that renews it by a `work_link`, because that edge is where the money on the
// next term comes from. A fixture carrying a shape no command can produce looks
// tested and measures a world that does not exist.
//
// EVERY DATE IS DERIVED FROM THE CLOCK, NEVER WRITTEN DOWN. Renewals are
// SECTIONED by time — due, watching, closed — and a deal goes stale at
// `DEAL_STALE_DAYS`. A pinned expiry would move a row between sections on some
// future morning, change what is drawn, and redden `main` on nobody's branch:
// exactly the delay fuse this wave defused three times over in lot DATE. Offsets
// are chosen far from their own boundaries so the section a row lands in is
// stable, and the timestamp is pinned to midday so no time zone can move the day.

import {
  DocumentIdSchema,
  PrincipalIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
  type SpaceId,
  type WorkspaceId,
} from "@constellation/contracts";

import type { RelationshipWorkspaceProjection } from "../client/workflow.js";
import { librarySources } from "./library-fixture.js";

const recordId = (suffix: string) =>
  StrategicRecordIdSchema.parse(`00000000-0000-4000-8000-0000000005${suffix}`);

export const crmRecordIds = {
  northwind: recordId("01"),
  helio: recordId("02"),
  wisniewski: recordId("03"),
  krol: recordId("04"),
  lewandowski: recordId("05"),
  mdrDeal: recordId("06"),
  edrDeal: recordId("07"),
  segmentationDeal: recordId("08"),
  supportRenewalDeal: recordId("09"),
  wonDeal: recordId("0a"),
  mdrOffer: recordId("0b"),
  mdrOfferSuperseded: recordId("0c"),
  edrOffer: recordId("0d"),
  supportContract: recordId("0e"),
  licenceContract: recordId("0f"),
  closedContract: recordId("10"),
  renewsLink: recordId("11"),
  amendsLink: recordId("12"),
  stackFact: recordId("13"),
  pilotDecision: recordId("14"),
} as const;

const DAY_MS = 86_400_000;

/**
 * A day offset from today, at midday. Midday and not midnight because the
 * screens compute their day counts in the reader's zone: an instant at 00:00Z
 * is the previous day in half the world, and a fixture whose row changes
 * section by time zone is a fixture that measures a different screen on a
 * different machine.
 */
const at = (dayOffset: number): string =>
  `${new Date(Date.now() + dayOffset * DAY_MS).toISOString().slice(0, 10)}T12:00:00.000Z`;

/** The same instant as a calendar date, for the fields that carry a day. */
const on = (dayOffset: number): string => at(dayOffset).slice(0, 10);

const principalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-000000000004",
);

/**
 * The evidence a deal was qualified on — TAKEN FROM THE SOURCES THIS HARNESS
 * ACTUALLY SERVES, never minted here.
 *
 * An id written out beside the list it is supposed to point into is a dangling
 * reference, and a dangling reference is a shape the kernel cannot produce:
 * this file's own header names that failure with the fixture that carried
 * `referencedBy: []` beside `referencedByCount: 2`. Derived, the two cannot
 * disagree.
 *
 * WHAT IT BUYS ON SCREEN, said accurately because the first draft of this
 * comment overclaimed it: the opportunity record renders the evidence as a
 * COUNT — "2 sources recorded behind this deal" — not as a row of chips. So the
 * value here is that the sentence has a real number in it and its other arm
 * ("No source recorded behind this deal") is reachable from a deal that has
 * none, which the segmentation deal is.
 */
const librarySourceIds = librarySources().map((source) => source.id);

const evidence = (...positions: readonly number[]) =>
  positions.map((position) => {
    const id = librarySourceIds[position];
    if (id === undefined)
      throw new Error(
        `crm-fixture: the harness serves ${librarySourceIds.length.toString()} sources and this ` +
          `deal cites position ${position.toString()}, so the citation points at nothing.`,
      );
    return id;
  });

/**
 * Written the way a real qualification is written — several paragraphs, blank
 * line between them, the way the record screen splits them. The median note in
 * this workspace runs 4 487 characters; a one-sentence field is the shape that
 * hid the collapsed record screen for four waves.
 */
const MDR_QUALIFICATION = [
  "Sponsor confirmed: Grzegorz Wiśniewski-Zaremba holds the security budget for all four plants and has already run one procurement of this size through the board, so the approval path is known rather than assumed.",
  "Budget is confirmed for the monitoring line but NOT for the on-site retainer, which is the part of the scope that carries the travel cost. Agata Król asked for the retainer to be priced separately so it can be dropped without reopening the whole negotiation — that split is now reflected in the two offer versions.",
  "The competing bid is a distributor reselling the same platform without the incident retainer. We are not cheaper and are not trying to be; the argument is the four-hour on-site commitment, which nobody else in this procurement has offered in writing.",
  "Risk that would lose this: the legacy gateway fact on this relationship is stale and the migration schedule it feeds has slipped twice. If the plants are still on the old gateway at signature the first month of monitoring produces noise instead of findings, and the pilot verdict is written on that month.",
].join("\n\n");

const MDR_NEED = [
  "Four manufacturing sites across Poland, Czechia and Slovakia run production networks with no out-of-hours monitoring at all. An incident on second shift is found by the plant manager in the morning, and the last one cost eleven hours of line time.",
  "What they are buying is somebody awake: 24×7 detection with a named responder and a contractual time to be physically on site, not a dashboard and an e-mail alert.",
].join("\n\n");

const EDR_QUALIFICATION =
  "Technical fit confirmed in the workshop; the blocker is commercial. Their existing endpoint licence runs to the end of the current term and the finance team will not carry two overlapping agreements, so the start date is what the negotiation is actually about.";

/**
 * The CRM slice the harness serves. Parameterised by workspace and Space so it
 * cannot drift from the harness that mounts it — the ids a projection is read
 * under are the ids the shell booted with, and a fixture that restates them is
 * a fixture that will one day describe a different workspace than the one on
 * screen.
 */
export const crmRecords = (
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
): RelationshipWorkspaceProjection["records"] => {
  const base = {
    workspaceId,
    spaceId,
    createdBy: principalId,
    recordState: "active" as const,
    version: 2,
    createdAt: at(-420),
    updatedAt: at(-3),
  };
  const supportExpiry = at(38);
  const licenceExpiry = at(214);
  const closedExpiry = at(96);

  return [
    {
      ...base,
      id: crmRecordIds.northwind,
      kind: "organization",
      // The length a real client name is. The prototype's "Acme" is what let a
      // fixed track look like it fitted.
      name: "Northwind Manufacturing Group — Central Europe Operations",
      relationshipState: "active",
      nextAction:
        "Confirm with Agata whether the on-site retainer can be signed as a separate annex before the board meeting.",
      segment: "Enterprise · Discrete manufacturing",
      since: on(-1_142),
      mainContactPersonId: crmRecordIds.wisniewski,
      externalId: "crm-legacy/NWMG-CEE-0041",
    },
    {
      ...base,
      id: crmRecordIds.helio,
      kind: "organization",
      name: "Helio Energetyka Rozproszona",
      relationshipState: "prospect",
      nextAction: "Send the segmentation scoping questions.",
      segment: "Mid-market · Energy",
      since: on(-96),
    },
    {
      ...base,
      id: crmRecordIds.wisniewski,
      kind: "person",
      name: "Grzegorz Wiśniewski-Zaremba",
      organizationId: crmRecordIds.northwind,
      role: "Dyrektor ds. bezpieczeństwa informacji",
      email: "g.wisniewski-zaremba@northwind-manufacturing.example",
      phone: "+48 601 118 042",
    },
    {
      ...base,
      id: crmRecordIds.krol,
      kind: "person",
      name: "Agata Król",
      organizationId: crmRecordIds.northwind,
      role: "Kierowniczka zakupów IT",
      email: "a.krol@northwind-manufacturing.example",
    },
    {
      ...base,
      id: crmRecordIds.lewandowski,
      kind: "person",
      name: "Tomasz Lewandowski",
      organizationId: crmRecordIds.helio,
      role: "Kierownik utrzymania ruchu",
      email: "t.lewandowski@helio.example",
    },
    {
      ...base,
      id: crmRecordIds.mdrDeal,
      kind: "opportunity",
      title:
        "Managed detection and response for the four Central Europe plants, with a contracted on-site incident retainer",
      organizationId: crmRecordIds.northwind,
      personIds: [crmRecordIds.wisniewski, crmRecordIds.krol],
      ownerPersonId: crmRecordIds.wisniewski,
      need: MDR_NEED,
      qualification: MDR_QUALIFICATION,
      // Not a round number, and not the offer's price: an estimate is what the
      // deal looked worth before anybody wrote an offer.
      estimate: { amountMinor: 92_487_00, currency: "PLN" },
      stage: "negotiation",
      // THIS COMMENT USED TO SAY the deal sits "well inside DEAL_STALE_DAYS,
      // so the 'not moving' warning is a state this fixture can reach without
      // being permanently in it". IT WAS FALSE, and it was false about the
      // wrong field: the card's age does NOT come from `stageEnteredAt` at all.
      // `pipeline-view.ts:331` derives it from `createdAt`, every record here
      // inherits `base.createdAt: at(-420)` (:172), and `DEAL_STALE_DAYS` is 45
      // (`:71`) — so EVERY card on this board is stale, permanently, and no
      // value written here changes that. `stageEnteredAt` is read by exactly
      // one place, the "in this stage since …" line on the open deal
      // (`PipelineSurface.tsx:905-907`).
      //
      // The value STAYS and the sentence goes. Two pairs of the visual-language
      // map read the stale badge (L2-05a, L2-05b), so a fixture with no stale
      // card would take their subject off the page — the fix here is the
      // comment, not the date. What is genuinely unmeasured is the OTHER
      // branch: no card on this board is fresh, so nobody has looked at the
      // badge's quiet state.
      stageEnteredAt: at(-12),
      nextAction:
        "Price the on-site retainer as a separate annex and send both versions to Agata before Thursday.",
      evidenceSourceIds: evidence(0, 1),
      offerIds: [crmRecordIds.mdrOffer, crmRecordIds.mdrOfferSuperseded],
      projectIds: [],
      state: "pursued",
    },
    {
      ...base,
      id: crmRecordIds.edrDeal,
      kind: "opportunity",
      title: "Endpoint detection rollout across the Kraków and Ostrava sites",
      organizationId: crmRecordIds.northwind,
      personIds: [crmRecordIds.krol],
      need: "Replace the endpoint agent the plants inherited from the old outsourcing contract, which nobody administers and which stopped reporting in April.",
      qualification: EDR_QUALIFICATION,
      estimate: { amountMinor: 17_294_00, currency: "EUR" },
      stage: "proposal",
      stageEnteredAt: at(-6),
      nextAction: "Agree the start date against their current licence term.",
      evidenceSourceIds: evidence(1),
      offerIds: [crmRecordIds.edrOffer],
      projectIds: [],
      state: "open",
    },
    {
      ...base,
      id: crmRecordIds.segmentationDeal,
      kind: "opportunity",
      title: "Network segmentation review for the distributed generation sites",
      organizationId: crmRecordIds.helio,
      personIds: [crmRecordIds.lewandowski],
      need: "They have been told by their insurer that the generation sites and the office network must be separated, and nobody has told them what that costs.",
      qualification:
        "Nothing is qualified yet. There is a named problem, an insurer's deadline, and no confirmed budget holder.",
      // ABSENT on purpose: nobody has put a number on this. A zero here would
      // say the deal is worth nothing, which is a different sentence.
      stage: "qualification",
      stageEnteredAt: at(-4),
      nextAction:
        "Find out who signs for this and by when the insurer wants it.",
      evidenceSourceIds: [],
      offerIds: [],
      projectIds: [],
      state: "open",
    },
    {
      ...base,
      id: crmRecordIds.supportRenewalDeal,
      kind: "opportunity",
      title: "Support contract, next term — 24 months with the extended SLA",
      organizationId: crmRecordIds.northwind,
      personIds: [crmRecordIds.krol],
      need: "The running support agreement expires and the plants cannot be without cover for a day.",
      qualification:
        "Renewal rather than a new sale: the scope is the running one plus the extended SLA the last incident review asked for.",
      estimate: { amountMinor: 44_918_00, currency: "PLN" },
      stage: "discovery",
      stageEnteredAt: at(-9),
      nextAction: "Confirm the extended SLA wording with legal.",
      evidenceSourceIds: [],
      offerIds: [],
      projectIds: [],
      state: "open",
    },
    {
      ...base,
      id: crmRecordIds.wonDeal,
      kind: "opportunity",
      title: "Vulnerability management pilot",
      organizationId: crmRecordIds.helio,
      personIds: [],
      need: "A three-month pilot to prove the reporting is readable by their maintenance team.",
      qualification: "Signed. Delivery starts next month.",
      estimate: { amountMinor: 3_871_00, currency: "PLN" },
      // The terminal column, so the board draws the quiet treatment it has for
      // stages that stand outside the funnel.
      stage: "won",
      stageEnteredAt: at(-21),
      nextAction: "Hand over to delivery.",
      evidenceSourceIds: [],
      offerIds: [],
      projectIds: [],
      state: "pursued",
    },
    {
      ...base,
      id: crmRecordIds.mdrOffer,
      kind: "offer",
      title: "MDR 24×7 with four-hour on-site retainer — version 2",
      opportunityId: crmRecordIds.mdrDeal,
      deliverableDocumentId: DocumentIdSchema.parse(
        "00000000-0000-4000-8000-0000000000a1",
      ),
      ownerPrincipalId: principalId,
      cost: { amountMinor: 68_742_00, currency: "PLN" },
      // CONFIRMED, so the card prints a measured margin rather than the markup
      // from Settings. Both branches have to draw or half the card's widest
      // row is geometry nobody has looked at.
      price: {
        basis: "confirmed",
        price: { amountMinor: 89_517_00, currency: "PLN" },
      },
      state: "submitted",
      nextAction: "Chase Agata for the annex decision.",
    },
    {
      ...base,
      id: crmRecordIds.mdrOfferSuperseded,
      kind: "offer",
      title: "MDR 24×7, monitoring only — version 1",
      opportunityId: crmRecordIds.mdrDeal,
      deliverableDocumentId: DocumentIdSchema.parse(
        "00000000-0000-4000-8000-0000000000a2",
      ),
      ownerPrincipalId: principalId,
      cost: { amountMinor: 51_308_00, currency: "PLN" },
      // No price at all, which `offerPriceState` reads as derived. Two offers
      // on one deal also makes the card say "2 versions" from a real count.
      state: "declined",
      nextAction: "Keep for the price history.",
    },
    {
      ...base,
      id: crmRecordIds.edrOffer,
      kind: "offer",
      title: "Endpoint detection — 1 200 seats, three-year term",
      opportunityId: crmRecordIds.edrDeal,
      deliverableDocumentId: DocumentIdSchema.parse(
        "00000000-0000-4000-8000-0000000000a3",
      ),
      ownerPrincipalId: principalId,
      // Bought in euro, sold in złoty. This is the entire reason `costInHome`
      // exists, and the converted line with its `≈` is the widest row a card
      // can draw — so a fixture without it measures the narrow case only.
      cost: { amountMinor: 12_894_00, currency: "EUR" },
      rate: { from: "EUR", to: "PLN", rateMicros: 4_318_000, at: on(-2) },
      price: { basis: "derived" },
      state: "ready",
      nextAction: "Send once the start date is agreed.",
    },
    {
      ...base,
      id: crmRecordIds.supportContract,
      kind: "renewal",
      organizationId: crmRecordIds.northwind,
      title: "Managed support agreement — all four plants",
      scope:
        "Second-line support, spare-part logistics and the quarterly incident review, across all four production sites.",
      expiresAt: supportExpiry,
      // Expiry is 38 days out and the lead time is 60, so this contract is DUE
      // TO START — the section that means somebody has to act. Both numbers are
      // far from the boundary between them, so no morning moves this row.
      leadTimeDays: 60,
      ownerPrincipalId: principalId,
      evidenceSourceIds: evidence(0),
      followUpTaskId: TaskIdSchema.parse(
        "00000000-0000-4000-8000-000000000006",
      ),
      // The clock that spans years: two-year term, third cycle, most of the way
      // through. "1 yr 10 mo of 2 yrs · term 3" is small print with real
      // arithmetic behind it rather than a rendered placeholder.
      termStartsAt: at(38 - 730),
      termMonths: 24,
      cycleOrdinal: 3,
      cycleKey: `${crmRecordIds.northwind}:${supportExpiry.slice(0, 10)}`,
      value: { amountMinor: 41_763_00, currency: "PLN" },
      state: "watching",
    },
    {
      ...base,
      id: crmRecordIds.licenceContract,
      kind: "renewal",
      organizationId: crmRecordIds.northwind,
      title: "Platform licences — Kraków",
      scope: "Console licences for the monitoring platform at the Kraków site.",
      expiresAt: licenceExpiry,
      leadTimeDays: 45,
      ownerPrincipalId: principalId,
      evidenceSourceIds: [],
      // No follow-up task: nobody has started this one, which is a state and
      // not a gap, and the row has to be able to say so.
      termStartsAt: at(214 - 365),
      termMonths: 12,
      cycleOrdinal: 2,
      cycleKey: `${crmRecordIds.northwind}:${licenceExpiry.slice(0, 10)}`,
      value: { amountMinor: 7_419_00, currency: "EUR" },
      state: "watching",
    },
    {
      ...base,
      id: crmRecordIds.closedContract,
      kind: "renewal",
      organizationId: crmRecordIds.helio,
      title: "Pilot support cover",
      scope: "Support cover for the vulnerability management pilot.",
      expiresAt: closedExpiry,
      leadTimeDays: 30,
      ownerPrincipalId: principalId,
      evidenceSourceIds: [],
      cycleKey: `${crmRecordIds.helio}:${closedExpiry.slice(0, 10)}`,
      // Closed, so the third section has a real count in its heading and a
      // reachable row behind "Show" — measured: the layout gate draws TWO rows,
      // not three, because that section starts collapsed and the sweep does not
      // expand it. Said here rather than left to be inferred: the fixture holds
      // three contracts and the ROW FLOOR in the gate is two, and those are
      // different numbers on purpose.
      state: "renewed",
    },
    // BOTH EDGES A CONTRACT CAN CARRY, on purpose. One deal RENEWS the support
    // agreement and is what the next term is worth; one AMENDS it, selling
    // inside the term that is running and leaving the expiry alone. The screen
    // picks between them, and a fixture holding only the first would never draw
    // the picking.
    {
      ...base,
      id: crmRecordIds.renewsLink,
      kind: "work_link",
      linkType: "opportunity_renews_renewal",
      sourceRecordId: crmRecordIds.supportRenewalDeal,
      targetRecordId: crmRecordIds.supportContract,
      state: "active",
    },
    {
      ...base,
      id: crmRecordIds.amendsLink,
      kind: "work_link",
      linkType: "opportunity_amends_renewal",
      sourceRecordId: crmRecordIds.mdrDeal,
      targetRecordId: crmRecordIds.supportContract,
      state: "active",
    },
    {
      ...base,
      id: crmRecordIds.stackFact,
      kind: "relationship_fact",
      organizationId: crmRecordIds.northwind,
      factType: "Production network gateway",
      value:
        "Legacy Fortigate 200E pair at Kraków and Ostrava; migration to the 600F pair slipped twice.",
      evidenceSourceIds: evidence(0),
      verifiedAt: at(-190),
      staleAfter: at(-10),
      // Stale, because a fact that has gone out of date is the one the
      // relationship screen has to be able to draw differently.
      state: "stale",
    },
    {
      ...base,
      id: crmRecordIds.pilotDecision,
      kind: "decision",
      title: "The retainer is priced as an annex, not folded into the monthly",
      rationale:
        "Agata asked for a line she can drop without reopening the negotiation, and folding the travel cost into the monthly fee would have made the comparison against the distributor's bid unreadable. The annex keeps both numbers arguable on their own terms.",
      organizationId: crmRecordIds.northwind,
      evidenceSourceIds: evidence(1),
      linkedRecordIds: [crmRecordIds.mdrDeal],
      state: "current",
    },
  ];
};
