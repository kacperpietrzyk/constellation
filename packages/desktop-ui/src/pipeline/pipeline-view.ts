// What the board knows, computed once and rendered by `PipelineSurface.tsx`.
//
// NOTHING HERE DOES MONEY ARITHMETIC. Every amount on this screen comes out of
// `../crm/money.ts` — `costInHome`, `offerPrice`, `offerMargin`,
// `opportunityValue`, `sumByCurrency`, `fmtMoney`, `fmtApprox`. Reproducing any
// of it in a screen file is this repository's named `restated-shape-drift`
// defect class, and money is the one shape whose drift produces a plausible
// number rather than an error.
//
// THE FIVE DISPLAY RULES THIS FILE IMPLEMENTS, each with the reason it exists:
//
//  1. COST IS THE ANCHOR. The chain on a card runs cost → rate and its date →
//     cost in the home currency → price with its state → what is left. That is
//     the order the data actually arrives in: the distributor's quote comes
//     first and the price to the client sometimes never comes at all.
//  2. ONLY THE DERIVED PRICE IS ROUNDED. `leaves` stays the exact difference of
//     the two amounts printed directly above it, under the same `≈`. Rounding
//     it a second time makes three numbers on one card stop subtracting, and a
//     card whose numbers do not subtract reads as broken rather than as
//     approximate.
//  3. CONVERSION IS NEVER ROUNDED. It is arithmetic on a rate somebody recorded
//     on the offer, not an assumption.
//  4. EXACTLY ONE PERCENTAGE PER CARD, ALWAYS NAMED. Derived → the markup FROM
//     SETTINGS; confirmed → the measured margin. 25% markup on a cost is 20%
//     margin on a price, so a bare "%" guarantees somebody eventually decides
//     the application counts wrong.
//  5. COLUMN SUMS ARE TURNOVER, PER CURRENCY, NEVER CONVERTED — and the meter
//     bar disappears entirely unless the whole open funnel stands in one
//     currency, because a bar comparing zloty to euro is a sum even more silent
//     than a number.

import type { PipelineStage } from "@constellation/contracts";

import type { CrmMoneySettings } from "../crm/money-settings.js";
import {
  costInHome,
  fmtMoney,
  offerMargin,
  offerPrice,
  opportunityValue,
  sumByCurrency,
  type Money,
  type OfferMarginReading,
  type OfferPriceReading,
} from "../crm/money.js";
import type {
  OfferRecord,
  OpportunityRecord,
  OrganizationRecord,
  PersonRecord,
  RelationshipIndex,
} from "../crm/organization-reading.js";
import { formatDate } from "../i18n.js";

/**
 * The columns that stand on the board without being part of the funnel. They
 * are here because winning a deal is dragging a card, but they take no part in
 * the meter and they are drawn quiet.
 *
 * Identified BY STAGE ID, exactly as the accepted prototype does, because
 * `PipelineStage` carries `{id, label, order}` and nothing that marks a stage as
 * terminal. A workspace that renames these two ids loses the quiet treatment and
 * keeps everything else; that is a real limit and it is recorded in the pull
 * request rather than papered over with a guess at the label.
 */
export const TERMINAL_STAGE_IDS: readonly string[] = ["won", "lost"];

/** A deal that has stood this long without moving has stopped moving. */
export const DEAL_STALE_DAYS = 45;

/**
 * The order in which an offer LEADS on the card. Accepted beats submitted,
 * submitted beats ready — and declined is last, because it is the history of a
 * negotiation rather than its current state.
 */
const OFFER_RANK: readonly OfferRecord["state"][] = [
  "accepted",
  "submitted",
  "ready",
  "draft",
  "declined",
];

/** What the sheet calls each state. `submitted` is the one that has to be said
 *  in words: "submitted" alone does not tell you who has it. */
export const OFFER_STATE_LABELS: Readonly<
  Record<OfferRecord["state"], string>
> = {
  accepted: "accepted",
  submitted: "sent to the client",
  ready: "ready, not sent",
  draft: "draft",
  declined: "declined",
};

export interface PipelineColumn {
  readonly id: string;
  readonly label: string;
  /** A stage this workspace does not configure. Its cards stay on the board. */
  readonly stray: boolean;
  /** Won and lost. On the board, out of the funnel. */
  readonly terminal: boolean;
  readonly cards: readonly PipelineCard[];
  /** One total per currency. Never one converted number. */
  readonly totals: readonly Money[];
  /** Minor units, for the meter only, and only ever within one currency. */
  readonly meterMinor: number;
}

export interface OfferReading {
  readonly offer: OfferRecord;
  /** How many offers stand on this deal, so "2 versions" is not a guess. */
  readonly versions: number;
  /** The cost in the home currency, or `null` — which is an answer, not a zero. */
  readonly home: Money | null;
  /** True when the cost is quoted in something other than the home currency. */
  readonly converted: boolean;
  readonly price: OfferPriceReading;
  readonly margin: OfferMarginReading | null;
}

export interface PipelineCard {
  readonly opportunity: OpportunityRecord;
  readonly organization: OrganizationRecord | undefined;
  readonly owner: PersonRecord | undefined;
  readonly value: Money | null;
  /** `offer` or `estimate` — two different kinds of claim, labelled differently. */
  readonly valueBasis: "offer" | "estimate";
  readonly offer: OfferReading | undefined;
  /** Days since the deal was created. Derived from `createdAt`; the number of
   *  days it has stood in its CURRENT stage is a different quantity and is not
   *  what this one says. */
  readonly ageDays: number;
  readonly stale: boolean;
  /** The whole card, in a sentence, for a reader who cannot see any of it. */
  readonly accessibleName: string;
}

export interface PipelineBoard {
  readonly columns: readonly PipelineColumn[];
  /** Deals outside the terminal columns, stray stages included — the number the
   *  top line reports and the set the sums are taken over. */
  readonly openCount: number;
  /** Of those, how many carry an offer's number rather than an estimate. */
  readonly pricedCount: number;
  readonly openTotals: readonly Money[];
  readonly strayStageCount: number;
  /**
   * The scale every meter is drawn against, or 0 when there is no honest scale
   * — which is what a funnel standing in more than one currency has. Zero means
   * NO BAR ANYWHERE rather than a bar comparing amounts that cannot be compared.
   */
  readonly meterMax: number;
}

const dayMs = 24 * 60 * 60 * 1000;

const daysSince = (instant: string, now: number): number =>
  Math.max(0, Math.floor((now - Date.parse(instant)) / dayMs));

const leadOffer = (offers: readonly OfferRecord[]): OfferRecord | undefined =>
  [...offers].sort(
    (left, right) =>
      OFFER_RANK.indexOf(left.state) - OFFER_RANK.indexOf(right.state),
  )[0];

/** Everything one offer's money says, computed once and through `money.ts`. */
export const readOffer = (
  offer: OfferRecord,
  versions: number,
  settings: CrmMoneySettings,
): OfferReading => {
  // The projection's optional keys are rebuilt as ABSENT rather than as
  // `undefined`, because `money.ts` takes exactly the fields it needs and the
  // compiler is strict about the difference. This is a shape conversion, not
  // arithmetic — no amount is touched here.
  const input = {
    ...(offer.cost === undefined ? {} : { cost: offer.cost }),
    ...(offer.rate === undefined ? {} : { rate: offer.rate }),
    ...(offer.price === undefined ? {} : { price: offer.price }),
  };
  return {
    offer,
    versions,
    home: costInHome(input, settings),
    converted:
      offer.cost !== undefined && offer.cost.currency !== settings.homeCurrency,
    price: offerPrice(input, settings),
    margin: offerMargin(input, settings),
  };
};

/**
 * Why the cost could not be turned into a home-currency amount, in the words
 * the sheet prints. Never blank: an empty note beside a cost in dollars reads as
 * if the conversion simply had not been attempted.
 */
export const conversionNote = (
  reading: OfferReading,
  settings: CrmMoneySettings,
  timeZone: string | undefined,
): string | undefined => {
  const cost = reading.offer.cost;
  if (cost === undefined || !reading.converted) return undefined;
  const rate = reading.offer.rate;
  // The rate stands BESIDE the number it produced, with its date: a conversion
  // whose rate is two moves away is a number nobody can check.
  if (reading.home !== null && rate !== undefined)
    return `rate of ${formatDate(rate.at, timeZone)}`;
  // The pair is NAMED in the sentence, both halves of it, because "the rate does
  // not fit" leaves a reader with no way to tell which of the two ends is wrong.
  return rate === undefined
    ? "no exchange rate recorded on this offer"
    : `the stored rate is ${rate.from}→${rate.to}, not ${cost.currency}→${settings.homeCurrency}`;
};

/** What the price row says when there is no price to print. */
export const missingPriceNote = (reading: OfferReading): string =>
  reading.offer.cost === undefined
    ? "nothing to derive it from until the cost lands"
    : reading.home === null
      ? "the cost cannot be converted, so it cannot be derived either"
      : "no confirmed price and no cost to derive one from";

/** What the `leaves` row says when there is nothing left to subtract from.
 *  A blank here reads as "nothing is left", which is a different claim. */
export const missingMarginNote = (reading: OfferReading): string =>
  reading.offer.cost === undefined
    ? "no cost from distribution recorded"
    : reading.home === null
      ? "the stored rate is for another currency pair"
      : "no price to the client yet";

/**
 * The sentence the card gives a reader who cannot see it.
 *
 * THREE OF THE FOUR CHANNELS THAT SEPARATE A DERIVED PRICE FROM A CONFIRMED ONE
 * ARE VISUAL — the `≈`, the rounding, and a badge sitting after the number it
 * qualifies. This sentence is the fourth, and it is the only one a screen reader
 * gets. Percentages are spelled out here rather than passed through `fmtMarkup`
 * / `fmtMargin`: those format a number to be looked at, not a sentence to be
 * heard.
 */
export const composeCardName = (
  card: Omit<PipelineCard, "accessibleName">,
  stageLabel: string,
  settings: CrmMoneySettings,
): string => {
  const parts: string[] = [
    card.opportunity.title,
    card.organization?.name ?? "no client recorded",
    stageLabel,
    card.value === null
      ? "no value yet"
      : `${fmtMoney(card.value)}${card.valueBasis === "offer" ? " from the offer" : " estimated"}`,
  ];
  const reading = card.offer;
  if (reading !== undefined) {
    const state = OFFER_STATE_LABELS[reading.offer.state];
    if (
      reading.offer.cost === undefined &&
      reading.price.basis !== "confirmed"
    ) {
      parts.push(`an offer is ${state} with no cost from distribution yet`);
    } else {
      parts.push(`on the offer, ${state}`);
      if (reading.home !== null)
        parts.push(`cost from distribution ${fmtMoney(reading.home)}`);
      else if (reading.offer.cost !== undefined)
        parts.push(
          `cost from distribution ${fmtMoney(reading.offer.cost)}, which cannot be converted because the stored rate is for another currency pair`,
        );
      if (reading.price.basis === "confirmed")
        parts.push(
          `price to the client ${fmtMoney(reading.price.amount)}, confirmed`,
        );
      else if (reading.price.basis === "derived")
        parts.push(
          `price to the client about ${fmtMoney(reading.price.amount)}, derived from the cost with an assumed markup of ${settings.markupPct} percent on the cost`,
        );
      else parts.push("no price to the client yet");
      const margin = reading.margin;
      if (margin !== null && margin.assumed)
        parts.push(
          `which would leave about ${fmtMoney(margin.amount)}, an assumption rather than a measurement`,
        );
      else if (margin !== null)
        parts.push(
          `leaving ${fmtMoney(margin.amount)}, a margin of ${margin.marginPct} percent of the price`,
        );
    }
  }
  parts.push(`${card.ageDays} days in pipeline`);
  return parts.join(", ");
};

const readCard = (
  opportunity: OpportunityRecord,
  index: RelationshipIndex,
  settings: CrmMoneySettings,
  stageLabel: string,
  now: number,
): PipelineCard => {
  const offers = index.offersByOpportunity.get(opportunity.id) ?? [];
  const lead = leadOffer(offers);
  const value = opportunityValue({
    ...(opportunity.estimate === undefined
      ? {}
      : { estimate: opportunity.estimate }),
    offers: offers.map((offer) => ({
      state: offer.state,
      ...(offer.price === undefined ? {} : { price: offer.price }),
    })),
  });
  const ageDays = daysSince(opportunity.createdAt, now);
  const owner =
    opportunity.ownerPersonId === undefined
      ? undefined
      : [
          ...(index.peopleByOrganization.get(opportunity.organizationId) ?? []),
          ...index.loosePeople,
        ].find((person) => person.id === opportunity.ownerPersonId);
  const partial = {
    opportunity,
    organization: index.organizations.find(
      (candidate) => candidate.id === opportunity.organizationId,
    ),
    owner,
    value: value.amount,
    valueBasis: value.basis,
    offer:
      lead === undefined ? undefined : readOffer(lead, offers.length, settings),
    ageDays,
    stale: ageDays > DEAL_STALE_DAYS,
  };
  return {
    ...partial,
    accessibleName: composeCardName(partial, stageLabel, settings),
  };
};

/**
 * The whole board.
 *
 * A DEAL STANDING ON A STAGE THIS WORKSPACE DOES NOT CONFIGURE KEEPS ITS CARD.
 * It goes into a trailing column of its own, drawn quiet and carrying no
 * dropzone — you may move a card out of it and never into it, because moving
 * onto a stage that does not exist means nothing. Filtering those deals out
 * instead would remove the card while the top line went on counting it, and a
 * screen contradicting its own number is worse than a column with an odd name.
 */
export const readBoard = (
  index: RelationshipIndex,
  stages: readonly PipelineStage[],
  settings: CrmMoneySettings,
  now: number,
): PipelineBoard => {
  const deals: OpportunityRecord[] = [];
  for (const bucket of index.opportunitiesByOrganization.values())
    deals.push(...bucket);

  const configured = [...stages].sort(
    (left, right) => left.order - right.order,
  );
  const known = new Set(configured.map((stage) => stage.id));
  const strayIds: string[] = [];
  for (const deal of deals)
    if (!known.has(deal.stage) && !strayIds.includes(deal.stage))
      strayIds.push(deal.stage);

  const definitions = [
    ...configured.map((stage) => ({
      id: stage.id,
      label: stage.label,
      stray: false,
    })),
    // The stray columns stand LAST, in the order they were met, so the funnel
    // still reads left to right as the funnel.
    ...strayIds.map((id) => ({ id, label: id, stray: true })),
  ];

  const columns: PipelineColumn[] = definitions.map((definition) => {
    // Oldest first: the deal that has stood longest is the one you are meant
    // to see. Sorting by value would need a rate this screen has no right to
    // invent the moment two currencies are on the board.
    const cards = deals
      .filter((deal) => deal.stage === definition.id)
      .map((deal) => readCard(deal, index, settings, definition.label, now))
      .sort((left, right) => right.ageDays - left.ageDays);
    const amounts = cards.map((card) => card.value);
    return {
      ...definition,
      terminal: TERMINAL_STAGE_IDS.includes(definition.id),
      cards,
      totals: sumByCurrency(amounts),
      meterMinor: amounts.reduce(
        (total, amount) => total + (amount?.amountMinor ?? 0),
        0,
      ),
    };
  });

  const openColumns = columns.filter((column) => !column.terminal);
  const openCards = openColumns.flatMap((column) => column.cards);
  const openAmounts = openCards.map((card) => card.value);
  // ONE CURRENCY OR NO BAR. A meter compares columns against each other, and
  // columns can only be compared when they measure the same thing.
  const meterMax =
    sumByCurrency(openAmounts).length === 1
      ? Math.max(
          1,
          ...openColumns
            .filter((column) => !column.stray)
            .map((column) => column.meterMinor),
        )
      : 0;

  return {
    columns,
    openCount: openCards.length,
    pricedCount: openCards.filter(
      (card) => card.value !== null && card.valueBasis === "offer",
    ).length,
    openTotals: sumByCurrency(openAmounts),
    strayStageCount: strayIds.length,
    meterMax,
  };
};

/** Every card on the board, in the order the DOM draws them — which is what the
 *  single roving tab stop counts through. Derived from the same columns the
 *  board renders, never rebuilt, so focus order cannot disagree with the eye. */
export const boardCards = (board: PipelineBoard): readonly PipelineCard[] =>
  board.columns.flatMap((column) => column.cards);
