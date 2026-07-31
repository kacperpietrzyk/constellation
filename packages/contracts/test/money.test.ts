import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CurrencySchema,
  ExchangeRateInputSchema,
  MoneyInputSchema,
  MoneySchema,
  OfferPriceSchema,
  StrategicRecordProjectionSchema,
  convertMoney,
  offerPriceState,
  validateCommandEnvelope,
} from "../src/index.js";

const ids = {
  workspace: "20000000-0000-4000-8000-000000000001",
  space: "20000000-0000-4000-8000-000000000002",
  command: "20000000-0000-4000-8000-000000000003",
  correlation: "20000000-0000-4000-8000-000000000004",
  organization: "20000000-0000-4000-8000-000000000005",
  person: "20000000-0000-4000-8000-000000000006",
  opportunity: "20000000-0000-4000-8000-000000000007",
  offer: "20000000-0000-4000-8000-000000000008",
  document: "20000000-0000-4000-8000-000000000009",
  principal: "20000000-0000-4000-8000-00000000000a",
} as const;

const metadata = {
  contractVersion: 1,
  commandId: ids.command,
  workspaceId: ids.workspace,
  idempotencyKey: "money",
  expectedVersions: {},
  correlationId: ids.correlation,
};

const recordBase = {
  id: ids.offer,
  workspaceId: ids.workspace,
  spaceId: ids.space,
  createdBy: ids.principal,
  version: 1,
  createdAt: "2026-07-31T09:00:00.000Z",
  updatedAt: "2026-07-31T09:00:00.000Z",
};

const offerRecord = {
  ...recordBase,
  kind: "offer",
  title: "Security workshop offer",
  opportunityId: ids.opportunity,
  deliverableDocumentId: ids.document,
  ownerPrincipalId: ids.principal,
  state: "ready",
  nextAction: "Send after the sponsor confirms.",
};

describe("money arithmetic", () => {
  // The accepted behaviour, in its own numbers: 28 400 EUR at 4.31 is
  // 122 404 PLN — exact, "co do złotówki". Anything that goes through a float
  // loses that, which is the reason the rate is an integer at all.
  it("converts to the grosz and never through a float", () => {
    const converted = convertMoney(
      { amountMinor: 28_400_00, currency: "EUR" },
      { from: "EUR", to: "PLN", rateMicros: 4_310_000, at: "2026-07-18" },
    );
    assert.deepEqual(converted, {
      amountMinor: 122_404_00,
      currency: "PLN",
    });
  });

  // The defect that has no symptom: a dollar cost converted at the euro rate
  // is a plausible złoty amount, not an error. The refusal is structural.
  it("refuses a rate that is not for this money's currency", () => {
    assert.equal(
      convertMoney(
        { amountMinor: 12_000_00, currency: "USD" },
        { from: "EUR", to: "PLN", rateMicros: 4_310_000, at: "2026-07-18" },
      ),
      undefined,
    );
  });

  it("stays exact past Number.MAX_SAFE_INTEGER", () => {
    // These two operands are chosen, not illustrative. "Past MAX_SAFE_INTEGER"
    // is NOT enough on its own: 1 000 000 000 000 × 4 310 000 is 4.31e18, which
    // a double happens to hold exactly — the first version of this test used
    // those round numbers, and the break-test that replaced BigInt with Number
    // arithmetic stayed GREEN. This pair is one grosz apart: BigInt gives
    // 931 459 435 721 and Number gives …722.
    const amountMinor = 105_786_102_851;
    const rateMicros = 8_805_121;
    assert.ok(amountMinor * rateMicros > Number.MAX_SAFE_INTEGER);
    assert.notEqual(
      BigInt(amountMinor) * BigInt(rateMicros),
      BigInt(amountMinor * rateMicros),
      "the operands must actually lose precision as Numbers, or this test measures nothing",
    );
    assert.deepEqual(
      convertMoney(
        { amountMinor, currency: "EUR" },
        { from: "EUR", to: "PLN", rateMicros, at: "2026-07-18" },
      ),
      { amountMinor: 931_459_435_721, currency: "PLN" },
    );
  });

  it("rounds half away from zero, in both directions", () => {
    // 1 grosz at 1,0000005 is half a grosz up.
    assert.deepEqual(
      convertMoney(
        { amountMinor: 1, currency: "EUR" },
        { from: "EUR", to: "PLN", rateMicros: 1_500_000, at: "2026-07-18" },
      ),
      { amountMinor: 2, currency: "PLN" },
    );
    // The read side is deliberately looser than the write side, so a stored
    // negative can reach here; truncation-towards-zero would round it the
    // wrong way.
    assert.deepEqual(
      convertMoney(
        { amountMinor: -1, currency: "EUR" },
        { from: "EUR", to: "PLN", rateMicros: 1_500_000, at: "2026-07-18" },
      ),
      { amountMinor: -2, currency: "PLN" },
    );
  });

  // One place decides what an absent price means. Two spellings of one state
  // is how a shape starts to drift.
  it("reads an absent price as derived, and leaves a confirmed one alone", () => {
    assert.deepEqual(offerPriceState(undefined), { basis: "derived" });
    assert.deepEqual(offerPriceState({ basis: "derived" }), {
      basis: "derived",
    });
    const confirmed = {
      basis: "confirmed" as const,
      price: { amountMinor: 205_000_00, currency: "PLN" as const },
    };
    assert.deepEqual(offerPriceState(confirmed), confirmed);
  });
});

describe("money shapes", () => {
  it("refuses an amount that is not an integer number of minor units", () => {
    assert.equal(
      MoneyInputSchema.safeParse({ amountMinor: 450.5, currency: "PLN" })
        .success,
      false,
    );
  });

  it("refuses a currency outside the union, on both the read and write side", () => {
    assert.equal(
      MoneyInputSchema.safeParse({ amountMinor: 45_000_00, currency: "GBP" })
        .success,
      false,
    );
    assert.equal(
      MoneySchema.safeParse({ amountMinor: 45_000_00, currency: "GBP" })
        .success,
      false,
    );
  });

  // The additive-only rule as an executable assertion: the members that exist
  // today may be added to, never removed. A stored payload is never
  // revalidated on load, so dropping one would make an already-written offer
  // fail to project — and `relationship.workspace` is a boot query.
  it("keeps every currency member that has ever been written", () => {
    for (const currency of ["PLN", "EUR", "USD"])
      assert.equal(CurrencySchema.safeParse(currency).success, true);
  });

  it("makes a confirmed price with no amount unrepresentable", () => {
    assert.equal(
      OfferPriceSchema.safeParse({ basis: "confirmed" }).success,
      false,
    );
    assert.equal(
      OfferPriceSchema.safeParse({
        basis: "derived",
        price: { amountMinor: 1, currency: "PLN" },
      }).success,
      false,
    );
  });

  it("refuses a rate that does not name its pair, and a decimal rate", () => {
    assert.equal(
      ExchangeRateInputSchema.safeParse({
        to: "PLN",
        rateMicros: 4_310_000,
        at: "2026-07-18",
      }).success,
      false,
    );
    assert.equal(
      ExchangeRateInputSchema.safeParse({
        from: "EUR",
        to: "PLN",
        rateMicros: 4.31,
        at: "2026-07-18",
      }).success,
      false,
    );
  });

  // The value-not-key blind spot, stated as an assertion: the projection
  // key-set guard cannot see a widened enum VALUE, so the read side has to
  // refuse it itself — loudly, at `querySuccess`, rather than dropping it.
  it("refuses an unknown currency on an already-stored offer", () => {
    assert.equal(
      StrategicRecordProjectionSchema.safeParse({
        ...offerRecord,
        cost: { amountMinor: 12_000_00, currency: "GBP" },
      }).success,
      false,
    );
    assert.equal(
      StrategicRecordProjectionSchema.safeParse({
        ...offerRecord,
        cost: { amountMinor: 12_000_00, currency: "EUR" },
      }).success,
      true,
    );
  });

  // Bound tightly at the command boundary, loosely in the projection — the
  // pattern `externalId` already follows. A projection that re-applied the
  // write bound would make an already-stored value unreadable the day that
  // bound moves.
  it("bounds the amount at the command boundary and not in the projection", () => {
    assert.equal(
      MoneyInputSchema.safeParse({ amountMinor: -1, currency: "PLN" }).success,
      false,
    );
    assert.equal(
      MoneySchema.safeParse({ amountMinor: -1, currency: "PLN" }).success,
      true,
    );
  });
});

describe("money at the command boundary", () => {
  const offerCreate = (payload: Record<string, unknown>) =>
    validateCommandEnvelope({
      ...metadata,
      commandName: "opportunity.offerCreate",
      payload: {
        offerId: ids.offer,
        opportunityId: ids.opportunity,
        deliverableDocumentId: ids.document,
        title: "Security workshop offer",
        ownerPrincipalId: ids.principal,
        state: "ready",
        nextAction: "Send after the sponsor confirms.",
        ...payload,
      },
    });

  it("accepts cost, rate and a confirmed price together", () => {
    assert.equal(
      offerCreate({
        cost: { amountMinor: 28_400_00, currency: "EUR" },
        rate: {
          from: "EUR",
          to: "PLN",
          rateMicros: 4_310_000,
          at: "2026-07-18",
        },
        price: {
          basis: "confirmed",
          price: { amountMinor: 205_000_00, currency: "PLN" },
        },
      }).ok,
      true,
    );
  });

  it("still accepts an offer with no money at all", () => {
    // The common case Kacper named: waiting for the distributor's quote. An
    // offer without a cost is a state, not a zero.
    assert.equal(offerCreate({}).ok, true);
  });

  it("accepts an estimate on an opportunity, and refuses two loose fields", () => {
    const opportunityCreate = (payload: Record<string, unknown>) =>
      validateCommandEnvelope({
        ...metadata,
        commandName: "opportunity.create",
        payload: {
          opportunityId: ids.opportunity,
          spaceId: ids.space,
          title: "Northstar security workshop",
          organizationId: ids.organization,
          personIds: [ids.person],
          need: "Choose the first remediation programme.",
          qualification: "Sponsor and evidence confirmed.",
          stage: "qualified",
          nextAction: "Prepare a scoped offer.",
          evidenceSourceIds: [],
          ...payload,
        },
      });
    assert.equal(
      opportunityCreate({
        estimate: { amountMinor: 200_000_00, currency: "PLN" },
      }).ok,
      true,
    );
    // Amount and currency ALWAYS travel in one object. Two sibling fields is
    // the restated-shape drift this whole file exists to prevent, and `.strict()`
    // is what makes the rule enforceable rather than remembered.
    assert.equal(
      opportunityCreate({ estimateMinor: 200_000_00, estimateCurrency: "PLN" })
        .ok,
      false,
    );
  });
});
