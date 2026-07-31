import { z } from "zod";

/**
 * Money, once. Amount and currency ALWAYS travel in one object — never as two
 * sibling fields — because a shape restated in several schemas is this repo's
 * named defect family (saved-view filters hit it three times), and money is the
 * one shape where the drift produces a plausible number rather than an error.
 *
 * The amount is in MINOR UNITS and is an integer: 45_000_00 is 45 000 PLN. No
 * money value in this codebase ever touches a float.
 *
 * ADDITIVE-ONLY, on the same terms as `WorkLinkTypeSchema` and
 * `SavedViewFiltersSchema` (`command.ts:1044-1049`, `:1279-1283`): stored
 * payloads are never revalidated on load, so a fourth currency may be ADDED to
 * `CurrencySchema` but no member may ever be removed, and the read-side bounds
 * below may be widened but never lowered. Removing a member would make an
 * already-written offer fail to project — and `relationship.workspace` is a
 * BOOT query, so the blast radius is boot, not a screen.
 */
export const CurrencySchema = z.enum(["PLN", "EUR", "USD"]);

export type Currency = z.infer<typeof CurrencySchema>;

/**
 * The READ side, deliberately looser than the command bound below — exactly
 * like `externalId` on the organization projection. A projection that
 * re-applied the write constraint would make an already-stored value
 * unreadable the day that constraint is tightened.
 */
export const MoneySchema = z
  .object({ amountMinor: z.int(), currency: CurrencySchema })
  .strict();

export type Money = z.infer<typeof MoneySchema>;

/** What a command may write. Tight here, loose in the projection. */
export const MONEY_MAX_AMOUNT_MINOR = 1_000_000_000_000;

/**
 * The one place an agent is told what these integers mean. The generated MCP
 * catalog can say "integer" and cannot say "minor units", and `.describe()` is
 * the only prose it carries — so it sits on the INPUT schemas, which are the
 * ones the catalog is built from, and nowhere else.
 */
export const MoneyInputSchema = MoneySchema.extend({
  amountMinor: z
    .int()
    .min(0)
    .max(MONEY_MAX_AMOUNT_MINOR)
    .describe(
      "Amount in MINOR units of `currency` — grosze, cents. 4500000 is 45 000,00. Never a major-unit number and never a decimal.",
    ),
});

/**
 * An exchange rate NAMES ITS PAIR. `to` is not implied by a workspace home
 * currency and `from` is not implied by the cost it is stored beside.
 *
 * The failure this prevents has no visible symptom: converting a dollar cost at
 * the euro rate yields *a plausible złoty amount*, not an error. Nobody would
 * see it. `convertMoney` below is the one guarded function that refuses the
 * mismatch — the check is structural, never remembered.
 *
 * `rateMicros` is an INTEGER in millionths: 4_310_000 is 4.31. A float in a
 * stored `payload_json` blob is a decision nobody took, and the whole point of
 * `amountMinor` is that money never touches floating point. 4.31 survives a
 * round-trip; a rate arriving from a spreadsheet or an agent may not.
 */
export const RATE_MAX_MICROS = 1_000_000_000_000;

export const ExchangeRateSchema = z
  .object({
    from: CurrencySchema,
    to: CurrencySchema,
    rateMicros: z.int(),
    /** The day the rate was taken, so a stale conversion can be recognised. */
    at: z.iso.date(),
  })
  .strict();

export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

/** See `MoneyInputSchema` for why the prose lives on the input side only. */
export const ExchangeRateInputSchema = ExchangeRateSchema.extend({
  rateMicros: z
    .int()
    .positive()
    .max(RATE_MAX_MICROS)
    .describe(
      "The rate in MILLIONTHS: 4310000 is 4.31. One unit of `from` buys `rateMicros / 1000000` units of `to`. Never a decimal.",
    ),
});

/**
 * The price state, as a discriminated union rather than a boolean beside a
 * nullable amount. The union makes "a confirmed price with no amount" and "a
 * derived price carrying a stored amount" unrepresentable; a boolean plus a
 * nullable amount admits both.
 *
 * Only `confirmed` is ever WRITTEN. A derived price is a projection of the
 * currently configured markup, so storing it would create a second number that
 * silently disagrees with Settings the day the markup changes — the screen
 * computes it from cost + rate + the configured markup instead.
 *
 * The read side accepts BOTH arms permanently anyway: absent is what every
 * offer written before this landed carries, `{ basis: "derived" }` is what an
 * explicit caller may already have stored, and narrowing a read-side union is
 * the outage this file's header describes.
 */
export const OfferPriceSchema = z.discriminatedUnion("basis", [
  z.object({ basis: z.literal("derived") }).strict(),
  z.object({ basis: z.literal("confirmed"), price: MoneySchema }).strict(),
]);

export type OfferPrice = z.infer<typeof OfferPriceSchema>;

export const OfferPriceInputSchema = z.discriminatedUnion("basis", [
  z.object({ basis: z.literal("derived") }).strict(),
  z.object({ basis: z.literal("confirmed"), price: MoneyInputSchema }).strict(),
]);

/**
 * What an absent price means, in ONE place. An offer that has never had a price
 * confirmed is derived; so is one that says so explicitly. Two spellings of one
 * state is how a shape starts to drift, so nothing else in the codebase decides
 * what absence means — it asks here.
 */
export const offerPriceState = (price: OfferPrice | undefined): OfferPrice =>
  price ?? { basis: "derived" };

/**
 * The ONE guarded conversion. Returns `undefined` when the rate is not for this
 * money's currency, because the alternative — trusting the caller to have
 * checked `rate.from` — is precisely the defect this shape exists to prevent:
 * the wrong-pair result is a plausible amount, not an error.
 *
 * The product is computed in BigInt: `amountMinor × rateMicros` exceeds
 * `Number.MAX_SAFE_INTEGER` well inside the bounds both fields allow, and a
 * silently imprecise conversion is the same class of failure as the wrong pair.
 * Rounding is half-up on the minor unit — the result is exact to the grosz,
 * which is the accepted behaviour; every other rounding in this feature is
 * display-only and happens on the screen, not here.
 */
export const convertMoney = (
  amount: Money,
  rate: ExchangeRate,
): Money | undefined => {
  if (rate.from !== amount.currency) return undefined;
  const product = BigInt(amount.amountMinor) * BigInt(rate.rateMicros);
  // Half away from zero. BigInt division truncates towards zero, so the bias
  // has to follow the sign: the command boundary refuses a negative amount, but
  // the read side is deliberately looser than the write side and a helper that
  // rounded the wrong way on a stored negative would be a second defect hidden
  // behind the first.
  const rounded =
    product < 0n
      ? (product - 500_000n) / 1_000_000n
      : (product + 500_000n) / 1_000_000n;
  return { amountMinor: Number(rounded), currency: rate.to };
};
