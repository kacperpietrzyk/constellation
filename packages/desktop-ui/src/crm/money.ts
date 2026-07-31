// One implementation of CRM arithmetic for every CRM screen.
//
// The accepted prototype keeps this in a single module and every screen reads
// it from there (`v3/app.js:165-280`, consumed at `v3/screens/pipeline.js:24-26`).
// Restating any of it inside a screen file is this repository's named
// `restated-shape-drift` defect class, so the module is plain and exported and
// nothing here renders.
//
// Two rules govern the whole file, and both come from the accepted walkthrough:
//
//  1. An amount is an integer in minor units and its currency travels with it,
//     in ONE object. Money never touches floating point, and a column that adds
//     zloty to euro and prints one number lies.
//  2. A number derived from an assumption is rounded and says so; a number that
//     is arithmetic on recorded data stays exact. Converting a currency by a
//     rate stored on the offer is arithmetic, not an assumption.
//
// Every function takes what it needs as an argument. Nothing here reads a
// workspace setting, a projection or a snapshot, which is what lets the whole
// module be asserted without a render (`test/money.test.ts`).

/**
 * The currencies a workspace can record. A fourth may be added later; adding
 * it here alone is not enough — the contract's own union has to widen too, and
 * a value the projection cannot parse takes boot down rather than degrading
 * one screen.
 */
export type Currency = "PLN" | "EUR" | "USD";

/** An amount and its currency, never two separate fields. */
export interface Money {
  /** Integer minor units. 162_328_00 is 162 328 of the major unit. */
  readonly amountMinor: number;
  readonly currency: Currency;
}

/**
 * The rate the offer was actually calculated at — part of the transaction, not
 * fetched from a network this application does not use.
 *
 * `rateMicros` is an integer: `4_310_000` is 4.31. A float in a stored payload
 * is a decision nobody took, and the entire point of `amountMinor` is that
 * money never travels as a float.
 *
 * The pair is NAMED on the rate rather than implied by the workspace, because
 * the failure it prevents has no visible symptom: converting a dollar cost at
 * the euro rate yields a plausible amount in zloty, not an error.
 */
export interface ExchangeRate {
  readonly from: Currency;
  readonly to: Currency;
  readonly rateMicros: number;
  /** When the rate was taken, as an ISO date. Displayed beside the conversion. */
  readonly at: string;
}

/**
 * What is known about an offer's price. A discriminated union, not a boolean
 * plus a nullable amount: the union makes "confirmed with no amount" and
 * "derived carrying a stored amount" unrepresentable, and a boolean admits
 * both. A derived price is never stored — it is a projection of whatever
 * markup the workspace is configured with today, so storing it would create a
 * second number that silently disagrees with Settings the day that changes.
 */
export type OfferPriceState =
  | { readonly basis: "derived" }
  | { readonly basis: "confirmed"; readonly price: Money };

/**
 * Rounding step for a derived amount, in minor units: whole 5 000 of the major
 * unit. Chosen so it is visible across the room that the number is an estimate.
 * Display only — nothing rounded here is ever written back.
 */
export const PRICE_ROUNDING_MINOR = 500_000;

const MICROS = 1_000_000;

const roundToStep = (money: Money): Money => ({
  amountMinor:
    Math.round(money.amountMinor / PRICE_ROUNDING_MINOR) * PRICE_ROUNDING_MINOR,
  currency: money.currency,
});

/** The parts of an offer this module needs in order to convert its cost. */
export interface OfferCostInput {
  readonly cost?: Money;
  readonly rate?: ExchangeRate;
}

/** The workspace facts the derived numbers are computed against. */
export interface MoneySettings {
  readonly homeCurrency: Currency;
  /** Whole percent, from Settings. A derived price shows THIS number. */
  readonly markupPct: number;
}

/**
 * The offer's cost expressed in the workspace's home currency, or `null` when
 * the data cannot answer the question. `null` is a real answer here and the
 * screen has to render it as one — never as a zero.
 *
 * This is the ONE place in the renderer where a rate is applied to an amount.
 * The pair check is therefore structural rather than remembered: a caller
 * cannot multiply by a rate without coming through here, and here both halves
 * of the pair have to match before the multiplication happens.
 */
export const costInHome = (
  offer: OfferCostInput,
  settings: Pick<MoneySettings, "homeCurrency">,
): Money | null => {
  const cost = offer.cost;
  if (cost === undefined) return null;
  if (cost.currency === settings.homeCurrency) return cost;
  const rate = offer.rate;
  if (rate === undefined) return null;
  // The rate has to be FOR this currency. Without the check a cost in dollars
  // converts at the euro rate and nobody sees it, because the result is a
  // plausible amount in the home currency rather than an error.
  if (rate.from !== cost.currency) return null;
  // The other half of the same pair, and a deliberate tightening of the
  // prototype's single-sided check (`v3/app.js:233`): a rate that converts to
  // something other than the home currency cannot answer a question whose name
  // is "cost in home".
  if (rate.to !== settings.homeCurrency) return null;
  // Exact. Converting a currency is arithmetic on a recorded rate, not an
  // assumption, so it is never routed through the rounding step above.
  // `amountMinor * rateMicros` stays inside the safe-integer range for any
  // amount this product records: 10^9 minor units at a rate of 10 is 10^16 —
  // realistic offers run six orders of magnitude below that.
  return {
    amountMinor: Math.round((cost.amountMinor * rate.rateMicros) / MICROS),
    currency: rate.to,
  };
};

export interface OfferPriceInput extends OfferCostInput {
  readonly price?: OfferPriceState;
}

/**
 * What the screen prints as the price, and what it is allowed to claim about
 * it. `basis` is the whole point: an assumption rendered like a fact reads as
 * a fact.
 */
export type OfferPriceReading =
  | {
      readonly basis: "confirmed";
      readonly amount: Money;
      /** Absent when the distribution quote has not arrived yet. */
      readonly cost: Money | null;
    }
  | { readonly basis: "derived"; readonly amount: Money; readonly cost: Money }
  | { readonly basis: "none"; readonly amount: null; readonly cost: null };

/**
 * A confirmed price is shown exactly as it was agreed. Everything else is
 * derived from the cost and the configured markup, and rounded, because a
 * derived price to the last unit claims a precision the data does not have.
 */
export const offerPrice = (
  offer: OfferPriceInput,
  settings: MoneySettings,
): OfferPriceReading => {
  const cost = costInHome(offer, settings);
  const price = offer.price;
  if (price !== undefined && price.basis === "confirmed") {
    return { basis: "confirmed", amount: price.price, cost };
  }
  if (cost === null) return { basis: "none", amount: null, cost: null };
  const raw: Money = {
    amountMinor: Math.round(cost.amountMinor * (1 + settings.markupPct / 100)),
    currency: cost.currency,
  };
  return { basis: "derived", amount: roundToStep(raw), cost };
};

/** What is left after the cost, and whether that figure is a measurement. */
export interface OfferMarginReading {
  /**
   * The exact difference of the two amounts printed above it on the card. It
   * is NOT rounded a second time: a card whose three numbers stop subtracting
   * reads as broken rather than as approximate.
   */
  readonly amount: Money;
  /** Whole percent of the price. A measurement when the price was confirmed. */
  readonly marginPct: number;
  /** True when the price it was computed from is an assumption. */
  readonly assumed: boolean;
}

/**
 * Deliberately does NOT return a markup back-computed from the price. Rounding
 * the derived price moves it, so the markup implied by the rounded number is
 * not the markup the workspace is configured with — on the accepted data it
 * comes out at 26% against Settings' 25%. A derived card shows the CONFIGURED
 * markup; a confirmed card shows the MEASURED margin; nothing anywhere shows a
 * back-computed markup, so this module does not hand one out.
 */
export const offerMargin = (
  offer: OfferPriceInput,
  settings: MoneySettings,
): OfferMarginReading | null => {
  const price = offerPrice(offer, settings);
  if (price.basis === "none" || price.cost === null) return null;
  const amountMinor = price.amount.amountMinor - price.cost.amountMinor;
  return {
    amount: { amountMinor, currency: price.amount.currency },
    marginPct: Math.round((amountMinor / price.amount.amountMinor) * 100),
    assumed: price.basis === "derived",
  };
};

/**
 * Totals, kept apart by currency. Never converted: a column head showing one
 * number over a mix of currencies would have to invent a rate, and this
 * application has nowhere to get one.
 *
 * The ordering is by size across the whole result so the largest currency
 * leads. That is presentation only — no amount is ever compared against an
 * amount in another currency for anything but this sort.
 */
export const sumByCurrency = (
  amounts: readonly (Money | null | undefined)[],
): readonly Money[] => {
  const totals = new Map<Currency, number>();
  for (const amount of amounts) {
    if (amount === null || amount === undefined) continue;
    totals.set(
      amount.currency,
      (totals.get(amount.currency) ?? 0) + amount.amountMinor,
    );
  }
  return [...totals]
    .map(([currency, amountMinor]) => ({ amountMinor, currency }))
    .sort((left, right) => right.amountMinor - left.amountMinor);
};

// The locale of the INTERFACE, matching `i18n.ts:23`. Grouping an amount is
// interface chrome, not record content, so it does not follow the Polish
// collation the record lists use.
const UI_LOCALE = "en-US";

/**
 * "162,328 PLN". Whole major units: a price carried to the minor unit is
 * noise at the sizes this product deals in, and the accepted screens never
 * show one. `null` prints an em dash, never a zero.
 */
export const fmtMoney = (money: Money | null | undefined): string =>
  money === null || money === undefined
    ? "—"
    : `${Math.round(money.amountMinor / 100).toLocaleString(UI_LOCALE)} ${money.currency}`;

/** The same amount, marked as approximate. Only ever used on a rounded one. */
export const fmtApprox = (money: Money | null | undefined): string =>
  money === null || money === undefined ? "—" : `≈ ${fmtMoney(money)}`;

// Exactly one percentage per card, and it always says which one it is. The
// same money gives two different numbers — 25% markup on a cost is 20% margin
// on a price — so a bare "%" guarantees somebody eventually decides the
// application counts wrong.
export const fmtMarkup = (pct: number): string => `markup ${pct}%`;
export const fmtMargin = (pct: number): string => `margin ${pct}%`;
export const fmtUplift = (pct: number): string => `uplift ${pct}%`;

/** The offer states this arithmetic distinguishes, as the projection has them. */
export type OfferState =
  "draft" | "ready" | "submitted" | "accepted" | "declined";

export interface OpportunityOfferInput {
  readonly state: OfferState;
  readonly price?: OfferPriceState;
}

export interface OpportunityValueInput {
  readonly estimate?: Money;
  readonly offers: readonly OpportunityOfferInput[];
}

export interface OpportunityValueReading {
  readonly amount: Money | null;
  /** Which kind of number this is. The screen has to show the difference. */
  readonly basis: "offer" | "estimate";
}

/**
 * What an opportunity is worth on the board: an offer if there is one, the
 * estimate otherwise, and the two labelled differently because they are not
 * the same kind of claim.
 *
 * Only a CONFIRMED offer price counts. A derived price is a projection of
 * whatever markup is configured today, so it cannot be what the deal is worth
 * — it would make every column total move when Settings moves.
 */
export const opportunityValue = (
  opportunity: OpportunityValueInput,
): OpportunityValueReading => {
  const confirmed = (state: OfferState): Money | undefined => {
    for (const offer of opportunity.offers) {
      if (offer.state !== state) continue;
      const price = offer.price;
      if (price !== undefined && price.basis === "confirmed")
        return price.price;
    }
    return undefined;
  };
  const accepted = confirmed("accepted");
  if (accepted !== undefined) return { amount: accepted, basis: "offer" };
  const submitted = confirmed("submitted");
  if (submitted !== undefined) return { amount: submitted, basis: "offer" };
  return { amount: opportunity.estimate ?? null, basis: "estimate" };
};

export interface RenewalOutlookInput {
  /** What the contract is worth today. */
  readonly value?: Money;
  /** The deal opened against this renewal, if somebody opened one. */
  readonly opportunity?: OpportunityValueInput & { readonly id: string };
}

export interface RenewalOutlookReading {
  readonly amount: Money | null;
  readonly basis: "offer" | "estimate" | "uplift" | "none";
  /** Set only when a real deal answered the question, so the row can link to it. */
  readonly opportunityId: string | null;
}

/**
 * What the renewal is likely to be worth. A real linked deal beats a
 * projection, exactly as a real offer beats an estimate — and the two are told
 * apart by two different things rather than two shades: the projection is
 * rounded and names its percentage, the real deal is exact and carries a link.
 */
export const renewalOutlook = (
  renewal: RenewalOutlookInput,
  settings: { readonly upliftPct: number },
): RenewalOutlookReading => {
  const opportunity = renewal.opportunity;
  if (opportunity !== undefined) {
    const value = opportunityValue(opportunity);
    if (value.amount !== null) {
      return {
        amount: value.amount,
        basis: value.basis,
        opportunityId: opportunity.id,
      };
    }
  }
  if (renewal.value === undefined) {
    return { amount: null, basis: "none", opportunityId: null };
  }
  const raw: Money = {
    amountMinor: Math.round(
      renewal.value.amountMinor * (1 + settings.upliftPct / 100),
    ),
    currency: renewal.value.currency,
  };
  return { amount: roundToStep(raw), basis: "uplift", opportunityId: null };
};
