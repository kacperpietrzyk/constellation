import assert from "node:assert/strict";
import { it } from "node:test";

import { buildOperationCatalog } from "../src/catalog.js";

// B4 adds no command, but widening `opportunity.create` and
// `opportunity.offerCreate` widens what an agent may send the day it lands —
// the catalog is generated mechanically from the Zod unions with no allowlist.
// The generated JSON Schema can say "integer" and cannot say "minor units", so
// the only prose an agent reads is the field's own `.describe()`. This test is
// what keeps that from being decoration: a `.describe()` that stopped
// propagating would leave `amountMinor: 45000` meaning 450 złotych to one
// caller and 45 000 to the next, and nothing else would notice.
it("tells an agent that money is in minor units and a rate is in millionths", () => {
  const catalog = buildOperationCatalog([
    "opportunity.create",
    "opportunity.offerCreate",
  ]);
  const schemaOf = (name: string) => {
    const operation = catalog.operations.find(
      (candidate) => candidate.name === name,
    );
    assert.ok(operation, name);
    return JSON.stringify(operation);
  };

  const offerCreate = schemaOf("opportunity.offerCreate");
  assert.match(offerCreate, /Amount in MINOR units/);
  assert.match(offerCreate, /The rate in MILLIONTHS/);
  // The pair the rate names, and the currency union, both reach the agent as
  // structure rather than as prose it has to trust.
  assert.match(offerCreate, /"enum":\["PLN","EUR","USD"\]/);
  assert.match(schemaOf("opportunity.create"), /Amount in MINOR units/);

  // The cross-field rule the schema cannot express: an offer's rate has to be
  // the rate FOR its cost. `command.precondition_failed` is deliberately
  // merged with every other precondition, so an agent that hit this refusal
  // would have no way to learn why without the guidance saying so. An
  // under-specified catalog has already misled a real migration agent once.
  assert.match(catalog.guidance.command ?? "", /rate whose from is not the/);
  assert.match(catalog.guidance.command ?? "", /absent price means derived/);
});
