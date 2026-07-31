// The workspace facts CRM arithmetic is computed against, read out of the
// snapshot in ONE place.
//
// `money.ts` takes every number it needs as an argument and reads no snapshot
// field — that is what lets the whole module be asserted without a render. This
// file is the other half: the single adapter from `workspace.bootstrapContext`
// to the settings object those functions want. Pipeline, Renewals and the
// opportunity record all need the same values, and three screens each reaching
// into the projection for them is the `restated-shape-drift` defect class this
// repository has already paid for.
//
// EVERY VALUE HERE IS READ, AND NOTHING IS DEFAULTED. `CommercialDefaults` is
// required on the projection and carries the EFFECTIVE values, never the stored
// optionals (`commercial-defaults.ts:107-112`). A fallback in this file would be
// a second copy of a default that already exists in one place, and the second
// copy is the one that goes stale the day Settings moves.
//
// IN PARTICULAR, `homeCurrency` IS NEVER DERIVED FROM AN OFFER'S OWN `rate.to`.
// That reads like a harmless default and it disables the guard that matters
// most: `costInHome` refuses a rate whose `to` is not the home currency, and a
// home currency taken FROM that rate makes the refusal unreachable by
// construction. The failure it prevents has no visible symptom — converting a
// dollar cost at the euro rate yields a plausible zloty amount, not an error —
// so nothing downstream would ever notice.

import type { MoneySettings } from "./money.js";
import type { DesktopSnapshot } from "../client/workflow.js";
import type { Currency } from "./money.js";

/** What every CRM screen needs before it can print a number. */
export interface CrmMoneySettings extends MoneySettings {
  /** How much a contract is projected to grow on renewal. Renewals reads it. */
  readonly upliftPct: number;
  /**
   * Which currencies this workspace records money in — what a picker offers,
   * not what exists.
   *
   * NOTHING GUARANTEES `homeCurrency` IS A MEMBER OF THIS LIST. That is a named
   * gap the settings PR reported rather than papered over, so a caller that
   * needs the home currency to be offerable has to say so itself. `costInHome`
   * is unaffected either way: it compares against `homeCurrency` directly and
   * never consults this list.
   */
  readonly currencies: readonly Currency[];
}

export const readMoneySettings = (
  snapshot: DesktopSnapshot,
): CrmMoneySettings => {
  const defaults = snapshot.bootstrap.workspace.commercialDefaults;
  return {
    homeCurrency: defaults.homeCurrency,
    markupPct: defaults.markupPct,
    upliftPct: defaults.upliftPct,
    currencies: defaults.currencies,
  };
};
