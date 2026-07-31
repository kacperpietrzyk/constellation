import { z } from "zod";

import { type Currency, CurrencySchema } from "./money.js";

/**
 * The workspace settings that decide what the funnel looks like and what a
 * number on a deal means: the pipeline stages, the markup a derived price is
 * computed with, the uplift a renewal is projected by, and the two currency
 * settings — which currency a column of mixed money is summed INTO, and which
 * currencies a picker offers.
 *
 * ONE shape for the command, the outcome and every read — the same rule
 * `working-day.ts` states for the same reason: a shape restated across several
 * schemas is the defect family that hit saved-view filters three times.
 *
 * A stage carries an ID and `opportunity.stage` stores that ID, so renaming a
 * stage does not orphan every deal standing on it. Renaming is the operation a
 * person performs most, and a label-keyed stage would make it the most
 * destructive one.
 */
export const PipelineStageSchema = z
  .object({
    /**
     * Stable across renames. It is a stored value on every opportunity, so it
     * is never regenerated from the label.
     */
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(80),
    /**
     * Where the column sits, left to right. Gaps are allowed — reordering by
     * rewriting two numbers must not force a rewrite of the whole list — but
     * two stages may not claim the same position, because then the column
     * order is decided by whatever the sort happens to do.
     */
    order: z.int().nonnegative().max(9_999),
  })
  .strict();

export type PipelineStage = z.infer<typeof PipelineStageSchema>;

/**
 * Case-insensitive and locale-INDEPENDENT on purpose. `taskStatus.rename` folds
 * with `toLocaleLowerCase("pl-PL")` (`wave2.ts:6803`); the app is English now,
 * and a Polish fold hidden inside a copy-paste is a decision nobody took.
 */
const foldLabel = (label: string): string => label.toLowerCase();

export const PipelineStagesSchema = z
  .array(PipelineStageSchema)
  .min(1)
  .max(40)
  .refine(
    (stages) => new Set(stages.map((stage) => stage.id)).size === stages.length,
    { message: "pipelineStages must not repeat a stage id." },
  )
  .refine(
    (stages) =>
      new Set(stages.map((stage) => foldLabel(stage.label))).size ===
      stages.length,
    { message: "pipelineStages must not repeat a stage label." },
  )
  .refine(
    (stages) =>
      new Set(stages.map((stage) => stage.order)).size === stages.length,
    { message: "pipelineStages must not repeat a position." },
  );

/**
 * Percentages, whole numbers. Two percentages of the same money mean different
 * things — 25% markup on cost is 20% margin on price — so neither is ever
 * rendered as a bare "%", and neither is ever back-computed from a stored
 * price. This is the configured number; a measured margin is a different
 * number with a different name.
 *
 * The upper bound is deliberately far above anything real: this schema gates
 * reads as well as writes, and ADDITIVE-ONLY means a bound may be widened later
 * but never lowered (`command.ts:1279-1283`).
 */
export const MarkupPctSchema = z.int().min(0).max(1_000);
export const UpliftPctSchema = z.int().min(0).max(1_000);

/**
 * Which currencies this workspace records money in. It does NOT restate the
 * vocabulary — every member comes from `CurrencySchema` in `money.ts`, which is
 * the one definition of the union (a second list of currency strings is the
 * `restated-shape-drift` family this repo has been bitten by three times, and
 * money is the shape where the drift produces a plausible number rather than an
 * error). This list says which of those a picker offers, not which exist.
 *
 * Shared between the command and the read, exactly as `PipelineStagesSchema`
 * is, and non-empty for the same reason a funnel is: "no currencies at all" is
 * not a state the product has — it is a picker that cannot be used.
 *
 * The upper bound is deliberately far above the union's own size. This schema
 * gates reads as well as writes and ADDITIVE-ONLY means a bound may be widened
 * but never lowered (`command.ts:1279-1283`), so a bound pinned to today's
 * three members would have to move the day a fourth currency is added — and a
 * bound that has to move is a bound that will be forgotten.
 */
export const WorkspaceCurrenciesSchema = z
  .array(CurrencySchema)
  .min(1)
  .max(24)
  .refine((currencies) => new Set(currencies).size === currencies.length, {
    message: "currencies must not repeat a currency.",
  });

/**
 * What a read receives: the EFFECTIVE values, never the stored optionals. The
 * projection is required for the reason `query.ts:1109-1111` gives for the
 * working day — a screen that had to fall back would be the second copy of the
 * default, and the second copy is the one that goes stale.
 */
export const CommercialDefaultsSchema = z
  .object({
    stages: PipelineStagesSchema,
    markupPct: MarkupPctSchema,
    upliftPct: UpliftPctSchema,
    /**
     * What `costInHome` converts TO, and what a column of mixed money is summed
     * into. It does NOT make a rate's pair implicit: an `ExchangeRate` still
     * names its own `from` and `to`, and `convertMoney` still refuses the
     * mismatch. Belt and braces — the guarded converter is what prevents the
     * wrong-pair conversion; this is what a screen asks when it needs to know
     * which single currency a total is allowed to be in.
     */
    homeCurrency: CurrencySchema,
    currencies: WorkspaceCurrenciesSchema,
  })
  .strict();

export type CommercialDefaults = z.infer<typeof CommercialDefaultsSchema>;

/**
 * The funnel a workspace has before anybody configures one, taken from the
 * prototype's `WORKSPACE_CONFIG` and its Settings screen (`v3/data.js:201-208`)
 * rather than composed from a textbook. Stages exist to name the conversation
 * this deal is actually in; a list nobody recognises is worse than no list.
 */
export const DEFAULT_PIPELINE_STAGES: readonly PipelineStage[] = [
  { id: "qualification", label: "Qualification", order: 0 },
  { id: "discovery", label: "Discovery", order: 1 },
  { id: "proposal", label: "Proposal", order: 2 },
  { id: "negotiation", label: "Negotiation", order: 3 },
  { id: "won", label: "Won", order: 4 },
  { id: "lost", label: "Lost", order: 5 },
];

/** `v3/data.js:693` — cost plus 25% is the price the offer card derives. */
export const DEFAULT_MARKUP_PCT = 25;

/**
 * `v3/data.js:694` — how much a contract usually grows on renewal. Kacper:
 * "zazwyczaj jest około 5% uplift, ale to też nie reguła", which is why a
 * number derived from it is rounded and labelled an assumption, never a fact.
 */
export const DEFAULT_UPLIFT_PCT = 5;

/**
 * `v3/data.js:697` — `homeCurrency: "PLN"`. Taken from the prototype's
 * `WORKSPACE_CONFIG`, not invented: the workspace this product was specified
 * against sells in złoty and buys some of what it sells in euro and dollars,
 * which is the entire reason `costInHome` exists.
 */
export const DEFAULT_HOME_CURRENCY: Currency = "PLN";

/** `v3/data.js:696` — `currencies: ["PLN", "EUR", "USD"]`, in that order. */
export const DEFAULT_CURRENCIES: readonly Currency[] = ["PLN", "EUR", "USD"];

/**
 * Stands in contracts and not in the domain, and for the same reason
 * `DEFAULT_WORKING_DAY` does: the renderer reaches for it too — the dev
 * harnesses build projections by hand — and the domain is not reachable from
 * there. ONE copy.
 */
export const DEFAULT_COMMERCIAL_DEFAULTS: CommercialDefaults = {
  stages: [...DEFAULT_PIPELINE_STAGES],
  markupPct: DEFAULT_MARKUP_PCT,
  upliftPct: DEFAULT_UPLIFT_PCT,
  homeCurrency: DEFAULT_HOME_CURRENCY,
  currencies: [...DEFAULT_CURRENCIES],
};
