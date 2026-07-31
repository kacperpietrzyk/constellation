import assert from "node:assert/strict";
import test from "node:test";

import {
  costInHome,
  fmtApprox,
  fmtMargin,
  fmtMarkup,
  fmtMoney,
  offerMargin,
  offerPrice,
  opportunityValue,
  PRICE_ROUNDING_MINOR,
  renewalOutlook,
  sumByCurrency,
  type ExchangeRate,
  type Money,
  type OfferPriceInput,
} from "../src/crm/money.js";

// Pure arithmetic, no render. These are the most portable assertions in the
// wave: they outlive any screen built on top of them, because none of them
// knows a screen exists.
//
// The numbers below are the ones from the accepted walkthrough, so every
// expectation here is checkable by hand:
//
//   offer 1  cost EUR 34 500 x 4.31 = 148 695 PLN, price CONFIRMED 186 000
//            -> leaves 37 305, margin 20%
//   offer 3  cost USD 41 200 x 3.94 = 162 328 PLN, price DERIVED at 25%
//            -> 202 910 raw, 205 000 shown, leaves 42 672

const settings = { homeCurrency: "PLN", markupPct: 25 } as const;

const PLN = (major: number): Money => ({
  amountMinor: major * 100,
  currency: "PLN",
});
const EUR = (major: number): Money => ({
  amountMinor: major * 100,
  currency: "EUR",
});
const USD = (major: number): Money => ({
  amountMinor: major * 100,
  currency: "USD",
});

const eurToPln: ExchangeRate = {
  from: "EUR",
  to: "PLN",
  rateMicros: 4_310_000,
  at: "2026-07-18",
};
const usdToPln: ExchangeRate = {
  from: "USD",
  to: "PLN",
  rateMicros: 3_940_000,
  at: "2026-07-22",
};

/** The confirmed offer: a price somebody agreed to, quoted in EUR cost. */
const confirmedOffer: OfferPriceInput = {
  cost: EUR(34_500),
  rate: eurToPln,
  price: { basis: "confirmed", price: PLN(186_000) },
};

/** The derived offer: a distribution quote in USD and no agreed price yet. */
const derivedOffer: OfferPriceInput = {
  cost: USD(41_200),
  rate: usdToPln,
  price: { basis: "derived" },
};

test("C1 — a cost is never converted by a rate stored for another pair", () => {
  // Break-test: delete the `rate.from !== cost.currency` guard in `costInHome`
  // and a cost in dollars becomes a plausible amount in the home currency.
  // The failure this guards has NO visible symptom, which is why it is
  // asserted at all rather than left to review.
  assert.equal(
    costInHome({ cost: USD(41_200), rate: eurToPln }, settings),
    null,
  );

  // The same refusal from the other side of the pair: a rate that converts to
  // something other than the home currency cannot answer "cost in home".
  assert.equal(
    costInHome(
      {
        cost: EUR(34_500),
        rate: {
          from: "EUR",
          to: "USD",
          rateMicros: 1_080_000,
          at: "2026-07-18",
        },
      },
      settings,
    ),
    null,
  );

  // The other two ways of answering `null`, asserted separately so a function
  // that always answers `null` cannot pass this test on the first line alone.
  assert.equal(costInHome({ rate: eurToPln }, settings), null);
  assert.equal(costInHome({ cost: USD(41_200) }, settings), null);

  // And the positive case: the matching pair converts, at the exact figure.
  assert.deepEqual(costInHome(derivedOffer, settings), PLN(162_328));
});

test("C2 — converting a currency stays exact", () => {
  // Break-test: route `costInHome` through the rounding step and this goes red
  // on both offers. A conversion is arithmetic on a rate recorded with the
  // transaction, not an assumption, so it keeps every unit.
  assert.deepEqual(costInHome(confirmedOffer, settings), PLN(148_695));
  assert.deepEqual(costInHome(derivedOffer, settings), PLN(162_328));

  // Stated as the rule rather than as a constant, so a change of rate or
  // amount cannot make the assertion vacuous.
  for (const offer of [confirmedOffer, derivedOffer]) {
    const cost = offer.cost;
    const rate = offer.rate;
    assert.ok(cost !== undefined && rate !== undefined);
    assert.equal(
      costInHome(offer, settings)?.amountMinor,
      Math.round((cost.amountMinor * rate.rateMicros) / 1_000_000),
    );
  }

  // A cost already in the home currency passes through untouched — no rate is
  // consulted and nothing is rounded.
  const alreadyHome: Money = { amountMinor: 16_232_855, currency: "PLN" };
  assert.deepEqual(costInHome({ cost: alreadyHome }, settings), alreadyHome);
});

test("C3 — a derived price is rounded and says it is derived", () => {
  // Break-test: return the raw product instead of the rounded one and the
  // multiple check fails at 20 291 000.
  const price = offerPrice(derivedOffer, settings);
  assert.equal(price.basis, "derived");
  assert.equal(price.amount?.amountMinor, 20_500_000);
  // A zero would satisfy the modulo on its own, so the pinned value above and
  // the non-zero check below are both part of the assertion.
  assert.notEqual(price.amount?.amountMinor, 0);
  assert.equal((price.amount?.amountMinor ?? 1) % PRICE_ROUNDING_MINOR, 0);
  // The rounding really moved the number: the raw product is 202 910.
  assert.notEqual(price.amount?.amountMinor, 20_291_000);
  assert.equal(fmtApprox(price.amount), "≈ 205,000 PLN");
});

test("C4 — a confirmed price is shown exactly as agreed", () => {
  // Break-test: round the confirmed branch too and 186 000 becomes 185 000.
  const price = offerPrice(confirmedOffer, settings);
  assert.equal(price.basis, "confirmed");
  assert.deepEqual(price.amount, PLN(186_000));
  assert.equal(price.amount?.amountMinor, 18_600_000);
  // Not a multiple of the rounding step, so the exactness is observable.
  assert.notEqual(18_600_000 % PRICE_ROUNDING_MINOR, 0);

  // No cost and no rate: the offer is still waiting for the distribution
  // quote, and the answer is "nothing", never a zero.
  const waiting = offerPrice({ price: { basis: "derived" } }, settings);
  assert.equal(waiting.basis, "none");
  assert.equal(waiting.amount, null);
  assert.equal(fmtMoney(waiting.amount), "—");
});

test("C5 — what is left is the exact difference of the two numbers above it", () => {
  // Break-test: round `offerMargin.amount` and the three numbers on the card
  // stop subtracting, which reads as broken rather than as approximate.
  const derived = offerMargin(derivedOffer, settings);
  assert.deepEqual(derived?.amount, PLN(42_672));
  assert.equal(derived?.amount.amountMinor, 20_500_000 - 16_232_800);
  assert.equal(derived?.assumed, true);
  assert.equal(fmtMargin(derived?.marginPct ?? 0), "margin 21%");

  const confirmed = offerMargin(confirmedOffer, settings);
  assert.deepEqual(confirmed?.amount, PLN(37_305));
  assert.equal(confirmed?.amount.amountMinor, 18_600_000 - 14_869_500);
  assert.equal(confirmed?.assumed, false);
  assert.equal(fmtMargin(confirmed?.marginPct ?? 0), "margin 20%");

  // A derived card shows the CONFIGURED markup, never one back-computed from
  // the rounded price. `offerMargin` does not hand a back-computed markup out
  // at all, and this is the number it would have been: 26% against Settings'
  // 25%, which is the contradiction the omission prevents.
  const backComputed = Math.round(
    ((derived?.amount.amountMinor ?? 0) / 16_232_800) * 100,
  );
  assert.equal(backComputed, 26);
  assert.equal(fmtMarkup(settings.markupPct), "markup 25%");
  assert.notEqual(fmtMarkup(settings.markupPct), fmtMarkup(backComputed));
});

test("C6 — sums keep currencies apart", () => {
  // Break-test: add `amountMinor` ignoring `currency` and the length collapses
  // to one. The per-currency totals are asserted too, because two entries with
  // the wrong sums also have length two.
  const sums = sumByCurrency([
    PLN(45_000),
    EUR(12_000),
    PLN(30_000),
    null,
    undefined,
  ]);
  assert.equal(sums.length, 2);
  assert.deepEqual(sums, [PLN(75_000), EUR(12_000)]);
  assert.equal(sums.map(fmtMoney).join(" · "), "75,000 PLN · 12,000 EUR");

  // One currency in, one row out — the joined head is not a special case.
  assert.deepEqual(sumByCurrency([PLN(45_000), PLN(30_000)]), [PLN(75_000)]);
  assert.deepEqual(sumByCurrency([]), []);
});

test("C7 — a real deal beats a projection, and says so with two different things", () => {
  // Break-test: force `renewalOutlook` down the uplift branch unconditionally
  // and the linked-deal case loses both its exact amount and its link.
  const uplift = renewalOutlook({ value: PLN(120_000) }, { upliftPct: 5 });
  assert.equal(uplift.basis, "uplift");
  assert.equal(uplift.opportunityId, null);
  // 120 000 x 1.05 = 126 000, rounded to 125 000: the projection is an
  // assumption and is shown as one.
  assert.deepEqual(uplift.amount, PLN(125_000));
  assert.equal((uplift.amount?.amountMinor ?? 1) % PRICE_ROUNDING_MINOR, 0);
  assert.notEqual(uplift.amount?.amountMinor, 12_600_000);
  assert.notEqual(uplift.amount?.amountMinor, 0);

  // A linked deal carrying a confirmed offer answers exactly, and hands the
  // row the id it needs in order to link to the deal.
  const linked = renewalOutlook(
    {
      value: PLN(120_000),
      opportunity: {
        id: "opportunity-1",
        estimate: PLN(320_000),
        offers: [
          {
            state: "accepted",
            price: { basis: "confirmed", price: PLN(186_000) },
          },
        ],
      },
    },
    { upliftPct: 5 },
  );
  assert.equal(linked.basis, "offer");
  assert.equal(linked.opportunityId, "opportunity-1");
  assert.deepEqual(linked.amount, PLN(186_000));
  assert.notEqual((linked.amount?.amountMinor ?? 0) % PRICE_ROUNDING_MINOR, 0);

  // A linked deal with no offer falls back to its estimate — still the deal's
  // number, still exact, still linked, and labelled as an estimate.
  const estimated = renewalOutlook(
    {
      value: PLN(120_000),
      opportunity: { id: "opportunity-2", estimate: PLN(148_000), offers: [] },
    },
    { upliftPct: 5 },
  );
  assert.equal(estimated.basis, "estimate");
  assert.equal(estimated.opportunityId, "opportunity-2");
  assert.deepEqual(estimated.amount, PLN(148_000));
  assert.notEqual(14_800_000 % PRICE_ROUNDING_MINOR, 0);

  // Nothing to project from and nothing linked: the answer is "nothing", and
  // the screen has to render it as one.
  const nothing = renewalOutlook({}, { upliftPct: 5 });
  assert.equal(nothing.basis, "none");
  assert.equal(nothing.amount, null);
});

test("only a confirmed offer price is what a deal is worth", () => {
  // A derived price is a projection of whatever markup is configured today, so
  // it cannot be the opportunity's value — otherwise every column total on the
  // board moves the day Settings moves.
  assert.deepEqual(
    opportunityValue({
      estimate: PLN(320_000),
      offers: [{ state: "accepted", price: { basis: "derived" } }],
    }),
    { amount: PLN(320_000), basis: "estimate" },
  );

  // An accepted offer wins over a submitted one.
  assert.deepEqual(
    opportunityValue({
      estimate: PLN(320_000),
      offers: [
        {
          state: "submitted",
          price: { basis: "confirmed", price: PLN(95_000) },
        },
        {
          state: "accepted",
          price: { basis: "confirmed", price: PLN(186_000) },
        },
      ],
    }),
    { amount: PLN(186_000), basis: "offer" },
  );

  // A submitted one wins over the estimate.
  assert.deepEqual(
    opportunityValue({
      estimate: PLN(320_000),
      offers: [
        {
          state: "submitted",
          price: { basis: "confirmed", price: PLN(95_000) },
        },
      ],
    }),
    { amount: PLN(95_000), basis: "offer" },
  );

  // No offer and no estimate: still labelled `estimate`, with nothing in it.
  assert.deepEqual(opportunityValue({ offers: [] }), {
    amount: null,
    basis: "estimate",
  });
});

test("an amount prints with its currency, and nothing prints as a zero it does not have", () => {
  assert.equal(fmtMoney(PLN(162_328)), "162,328 PLN");
  assert.equal(fmtMoney(EUR(12_000)), "12,000 EUR");
  assert.equal(fmtMoney(null), "—");
  assert.equal(fmtMoney(undefined), "—");
  assert.equal(fmtApprox(null), "—");
  // Zero is an amount and prints as one. Only absence prints as the dash.
  assert.equal(fmtMoney(PLN(0)), "0 PLN");
});
