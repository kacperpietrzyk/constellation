// The workspace facts CRM arithmetic is computed against, read out of the
// snapshot in ONE place.
//
// `money.ts` takes every number it needs as an argument and reads no snapshot
// field — that is what lets the whole module be asserted without a render. This
// file is the other half: the single adapter from `workspace.bootstrapContext`
// to the settings object those functions want. Pipeline, Renewals and the
// opportunity record all need the same three values, and three screens each
// reaching into the projection for them is the `restated-shape-drift` defect
// class this repository has already paid for.

import type { Currency, MoneySettings } from "./money.js";
import type { DesktopSnapshot } from "../client/workflow.js";

/**
 * THE ONE GAP IN THIS FILE, and the only place in the renderer that carries it.
 *
 * Brief §2.3 decided that the workspace stores a home currency and an
 * allowed-currency list; the shipping of it was deferred to a small follow-on
 * backend PR — `Workspace.homeCurrency` + `CommercialDefaultsProjection` + two
 * more optional keys on `workspace.setCommercialDefaults` — which is not in
 * `main` yet. `CommercialDefaults` today is `{stages, markupPct, upliftPct}`
 * exactly.
 *
 * So the value is PINNED here, once, behind this comment. When the projection
 * grows the field, this constant dies and the line below it reads
 * `workspace.commercialDefaults.homeCurrency` — a one-line change inside this
 * function and nothing else in the renderer moves.
 *
 * WHAT THIS MUST NEVER BECOME is a per-offer fallback derived from the offer's
 * own `rate.to`. That reads like a harmless default and it disables the guard
 * that matters most: `costInHome` refuses a rate whose `to` is not the home
 * currency, and a home currency taken FROM that rate makes the refusal
 * unreachable by construction. The failure it prevents has no visible symptom —
 * converting a dollar cost at the euro rate yields a plausible zloty amount, not
 * an error — so nothing downstream would ever notice. One pinned value in one
 * function is wrong in a way a reader can see; a derived one is wrong in a way
 * nobody can.
 */
const PINNED_HOME_CURRENCY: Currency = "PLN";

/** What every CRM screen needs before it can print a number. */
export interface CrmMoneySettings extends MoneySettings {
  /** How much a contract is projected to grow on renewal. Renewals reads it. */
  readonly upliftPct: number;
}

export const readMoneySettings = (
  snapshot: DesktopSnapshot,
): CrmMoneySettings => {
  const defaults = snapshot.bootstrap.workspace.commercialDefaults;
  return {
    homeCurrency: PINNED_HOME_CURRENCY,
    // Both of these ARE in the projection and are the effective values, never
    // a stored optional — so no screen ever carries a second copy of the
    // default and no screen can disagree with Settings.
    markupPct: defaults.markupPct,
    upliftPct: defaults.upliftPct,
  };
};
