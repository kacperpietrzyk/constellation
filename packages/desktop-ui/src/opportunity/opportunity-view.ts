// What the opportunity record READS, with nothing rendered.
//
// The screen it feeds is the first place a deal can be looked at whole. Until
// it existed a Pipeline card opened the ORGANISATION, so `qualification` — the
// CRM analogue of a project's intended outcome, and prose of the same length —
// had nowhere to be read, and an offer's history had nowhere to be read at all.
//
// Two rules govern this file, and both are the reason it is a file:
//
//  1. NO ARITHMETIC. Every number comes out of `../crm/money.js`. Restating any
//     of it here is this repository's named `restated-shape-drift` defect class,
//     and the offer sheet below is the exact shape the Pipeline card shows in
//     miniature — two spellings of it would diverge at the first change.
//  2. NO JSX. The sheet is DATA — a named row, a value, a reason and a badge —
//     so the whole reading is assertable without mounting anything, and so the
//     accessible sentence and the visible rows are built from one source rather
//     than from two that agree today.

import type { PipelineStage } from "@constellation/contracts";

import {
  costInHome,
  fmtApprox,
  fmtMargin,
  fmtMarkup,
  fmtMoney,
  offerMargin,
  offerPrice,
  type MoneySettings,
} from "../crm/money.js";
import {
  CRM_DEAL_STALE,
  type CrmProse,
  type OfferRecord,
  type OpportunityRecord,
} from "../crm/organization-reading.js";
import { formatDate } from "../i18n.js";
import { daysUntil } from "../today-plan.js";

export type { CrmProse as OpportunityProse };

/**
 * Where the deal stands, and for how long it has stood there.
 *
 * `since` is `stageEnteredAt` and nothing else. Falling back to the record's own
 * age is the single mistake this field exists to prevent: before a stage could
 * move at all, "sat in discovery for 61 days" was accidentally true because the
 * two numbers were the same one. The moment a stage moves they part company, and
 * a screen that kept the fallback would print the deal's age under the word
 * "stage" and be wrong without ever looking wrong. So an absent `stageEnteredAt`
 * yields `days: undefined`, which the screen has to render as "unknown".
 */
export interface StageStanding {
  readonly stageId: string;
  /** The configured label, or the stored id when the funnel does not list it. */
  readonly label: string;
  /** False when this workspace's funnel has no such stage. The deal still shows
   *  it — a retired stage keeps its deals readable — but the screen says so. */
  readonly configured: boolean;
  readonly since: string | undefined;
  readonly days: number | undefined;
  /** Standing still for longer than the CRM's own patience. Never true when the
   *  duration is unknown: an unknown is not a long time. */
  readonly stale: boolean;
}

export const stageStanding = (
  deal: OpportunityRecord,
  stages: readonly PipelineStage[],
  prose: CrmProse,
): StageStanding => {
  const configured = stages.find((stage) => stage.id === deal.stage);
  const since = deal.stageEnteredAt;
  const days =
    since === undefined
      ? undefined
      : -daysUntil(since, prose.todayKey, prose.timeZone);
  return {
    stageId: deal.stage,
    label: configured?.label ?? deal.stage,
    configured: configured !== undefined,
    since,
    days,
    stale: days !== undefined && days > CRM_DEAL_STALE,
  };
};

/**
 * The order an offer leads in. Accepted beats submitted, submitted beats ready
 * — and declined is last because it is the history of the negotiation rather
 * than its current state (`v3/screens/pipeline.js:61`).
 *
 * The record shows every version, so the ordering is what makes the CURRENT one
 * obvious. On the card only the first survives.
 */
const OFFER_RANK: readonly OfferRecord["state"][] = [
  "accepted",
  "submitted",
  "ready",
  "draft",
  "declined",
];

/** The state as a person says it, never the stored token. */
export const OFFER_STATE_LABELS: Readonly<
  Record<OfferRecord["state"], string>
> = {
  accepted: "accepted",
  submitted: "sent to the client",
  ready: "ready, not sent",
  draft: "draft",
  declined: "declined",
};

export const orderOffers = (
  offers: readonly OfferRecord[],
): readonly OfferRecord[] =>
  [...offers].sort((left, right) => {
    const rank =
      OFFER_RANK.indexOf(left.state) - OFFER_RANK.indexOf(right.state);
    // Ties broken newest-first, then on the id, so a batch written by one
    // command holds its order between renders rather than shuffling.
    if (rank !== 0) return rank;
    if (left.updatedAt !== right.updatedAt)
      return left.updatedAt < right.updatedAt ? 1 : -1;
    return left.id < right.id ? -1 : 1;
  });

/** One named line of the offer sheet. `chip` carries the WORD that qualifies the
 *  number — the `≈` and the rounding are visual channels and a word is not. */
export interface OfferSheetRow {
  readonly key: "cost" | "price" | "leaves";
  readonly label: string;
  readonly value: string;
  /** Why the number is missing, or what the conversion was done at. Never empty
   *  where a number is absent: a blank in "leaves" reads as "nothing is left". */
  readonly note: string;
  readonly chip: string;
  /** `derived` and `assumed` are dashed rather than tinted; see the sheet. */
  readonly chipKind: "confirmed" | "derived" | "assumed" | "measured" | "none";
}

export interface OfferSheet {
  /** Absent when the distribution quote has not arrived — a state of the work,
   *  not missing data, and the whole sheet is replaced by the sentence. */
  readonly waiting: string | undefined;
  readonly rows: readonly OfferSheetRow[];
  /** The sheet said in words, for the reader who gets no glyphs. */
  readonly sentence: string;
}

/**
 * The offer as the money module wants it, with absent keys ABSENT.
 *
 * `exactOptionalPropertyTypes` is on in this workspace, so `{cost: undefined}`
 * and `{}` are different types — and that strictness is the point rather than a
 * nuisance: the money module's whole contract is that a missing cost is a
 * different answer from a zero one, and a spread that carried `undefined`
 * through would make the two indistinguishable at the boundary.
 */
const moneyInputOf = (offer: OfferRecord) => ({
  ...(offer.cost === undefined ? {} : { cost: offer.cost }),
  ...(offer.rate === undefined ? {} : { rate: offer.rate }),
  ...(offer.price === undefined ? {} : { price: offer.price }),
});

const rateLine = (offer: OfferRecord, timeZone: string): string =>
  offer.rate === undefined
    ? ""
    : `${offer.rate.from}→${offer.rate.to} ${(offer.rate.rateMicros / 1_000_000).toString()} · rate of ${formatDate(offer.rate.at, timeZone)}`;

/**
 * The offer's three numbers and what may be claimed about each.
 *
 * The chain starts at the COST in the distribution's own currency and ends at
 * what is left, because that is the order the money actually moves in — a sheet
 * that led with the price would be reading the conversation backwards.
 *
 * "leaves" is the exact difference of the two amounts printed above it and is
 * never rounded a second time. A card whose three numbers stop subtracting reads
 * as broken rather than as approximate, which is a decision this repository has
 * already taken twice.
 */
export const offerSheet = (
  offer: OfferRecord,
  settings: MoneySettings,
  timeZone: string,
): OfferSheet => {
  const cost = offer.cost;
  const input = moneyInputOf(offer);
  const price = offerPrice(input, settings);
  const margin = offerMargin(input, settings);
  const home = costInHome(input, settings);

  if (cost === undefined && price.basis === "none") {
    return {
      waiting:
        offer.nextAction === ""
          ? "No cost from distribution yet."
          : `No cost from distribution yet — ${offer.nextAction}`,
      rows: [],
      sentence: "No cost from the distribution has arrived on this offer yet.",
    };
  }

  const rows: OfferSheetRow[] = [];

  if (cost === undefined) {
    rows.push({
      key: "cost",
      label: "cost",
      value: "not quoted yet",
      note:
        offer.nextAction === ""
          ? "waiting for the distribution quote"
          : offer.nextAction,
      chip: "",
      chipKind: "none",
    });
  } else if (home !== null && home.currency !== cost.currency) {
    rows.push({
      key: "cost",
      label: "cost",
      value: `${fmtMoney(cost)} = ${fmtMoney(home)}`,
      note: rateLine(offer, timeZone),
      chip: "",
      chipKind: "none",
    });
  } else if (home !== null) {
    rows.push({
      key: "cost",
      label: "cost",
      value: fmtMoney(cost),
      note: "",
      chip: "",
      chipKind: "none",
    });
  } else {
    // `costInHome` has already refused. Which of the two facts is on screen is
    // read off the record rather than by re-testing the pair: a second spelling
    // of that guard is the drift the module was written to prevent.
    rows.push({
      key: "cost",
      label: "cost",
      value: fmtMoney(cost),
      note:
        offer.rate === undefined
          ? "no exchange rate recorded on this offer"
          : `the stored rate is ${offer.rate.from}→${offer.rate.to}, not ${cost.currency}→${settings.homeCurrency}`,
      chip: "",
      chipKind: "none",
    });
  }

  if (price.basis === "confirmed") {
    rows.push({
      key: "price",
      label: "price",
      value: fmtMoney(price.amount),
      note: "",
      chip: "confirmed",
      chipKind: "confirmed",
    });
  } else if (price.basis === "derived") {
    rows.push({
      key: "price",
      label: "price",
      value: fmtApprox(price.amount),
      note: "",
      // The CONFIGURED markup, taken from Settings. A markup back-computed from
      // the rounded price comes out at a different number and contradicts the
      // page it was configured on, which is why `money.ts` hands none out.
      chip: `derived · ${fmtMarkup(settings.markupPct)}`,
      chipKind: "derived",
    });
  } else {
    rows.push({
      key: "price",
      label: "price",
      value: "not known yet",
      note:
        cost === undefined
          ? "nothing to derive it from until the cost lands"
          : "the cost cannot be converted, so it cannot be derived either",
      chip: "",
      chipKind: "none",
    });
  }

  if (margin === null) {
    rows.push({
      key: "leaves",
      label: "leaves",
      value: "not known yet",
      note:
        cost === undefined
          ? "no cost from distribution recorded"
          : home === null
            ? "the stored rate is for another currency pair"
            : "no price to the client yet",
      chip: "",
      chipKind: "none",
    });
  } else if (margin.assumed) {
    rows.push({
      key: "leaves",
      label: "leaves",
      value: fmtApprox(margin.amount),
      note: "",
      chip: "assumed, not measured",
      chipKind: "assumed",
    });
  } else {
    rows.push({
      key: "leaves",
      label: "leaves",
      value: fmtMoney(margin.amount),
      note: "",
      chip: fmtMargin(margin.marginPct),
      chipKind: "measured",
    });
  }

  return { waiting: undefined, rows, sentence: offerSentence(offer, settings) };
};

/**
 * The sheet as one sentence, for the channel that gets no glyphs.
 *
 * Three of the four channels that tell a derived price from a confirmed one are
 * visual — the `≈`, the rounding to whole five thousands, and a badge announced
 * out of order relative to the number it qualifies. The fourth is this. The
 * percentages are SPELLED rather than passed through `fmtMarkup`/`fmtMargin`,
 * because those format a number to be looked at, not a clause to be heard.
 */
export const offerSentence = (
  offer: OfferRecord,
  settings: MoneySettings,
): string => {
  const price = offerPrice(moneyInputOf(offer), settings);
  const state = OFFER_STATE_LABELS[offer.state];
  if (price.basis === "none")
    return `Offer ${offer.title}, ${state}, with no price yet.`;
  const amount = fmtMoney(price.amount);
  const basis =
    price.basis === "confirmed"
      ? "confirmed"
      : `derived from the cost with an assumed markup of ${settings.markupPct.toString()} percent on the cost`;
  return `Offer ${offer.title}, ${state}, price to the client ${price.basis === "derived" ? "about " : ""}${amount}, ${basis}.`;
};

/**
 * The paragraphs of a written field, split on blank lines.
 *
 * Single newlines INSIDE a paragraph are kept by the stylesheet rather than
 * turned into more paragraphs: the text is somebody's writing, and re-flowing it
 * is editing it. Same rule the project record's intended outcome follows, and
 * for the same reason — `need` and `qualification` are free prose and arrive at
 * the same length.
 */
export const paragraphsOf = (text: string): readonly string[] =>
  text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
