import assert from "node:assert/strict";
import { it } from "node:test";

import {
  buildOperationCatalog,
  completeOperationScope,
} from "../src/catalog.js";

/**
 * THE CATALOGUE'S OWN LIST OF WHICH COMMANDS CLAIM A SOURCE KEY, held against
 * the schemas.
 *
 * `INVOCATION_GUIDANCE.command` names them in a sentence, because JSON Schema
 * cannot say "this deduplicates the row you are importing". That sentence is a
 * HAND-WRITTEN LIST BESIDE A CLOSED VOCABULARY — the twelfth live site of the
 * family this repository keeps meeting — and a command that gains `externalId`
 * without being named there tells every agent the field does not exist, which
 * is precisely the state that makes a re-run duplicate.
 *
 * That site is now REMOVED rather than watched: the sentence interpolates the
 * list, derived from the Zod union. This checks the two independent derivations
 * against each other — the union's own shapes against the JSON Schema the
 * catalogue actually generates — and that the sentence really carries them.
 *
 * A first version of this test asked only whether the guidance string CONTAINED
 * each name, and came back GREEN with the enumeration deleted, because the same
 * command is named elsewhere in the same paragraph for a different reason. An
 * instrument failing toward calm, caught by breaking it.
 *
 * BROKEN BY: replacing the interpolation with a hand-written list.
 */
it("names every command that claims a source key, and no other", () => {
  const catalog = buildOperationCatalog(completeOperationScope());
  const carriesExternalId = catalog.operations
    .filter((operation) => {
      if (operation.kind !== "command") return false;
      const envelope = operation.envelopeSchema as {
        readonly properties?: {
          readonly payload?: {
            readonly properties?: Readonly<Record<string, unknown>>;
          };
        };
      };
      return envelope.properties?.payload?.properties?.externalId !== undefined;
    })
    .map((operation) => operation.name)
    .sort();

  assert.ok(
    carriesExternalId.length > 0,
    "no command carries externalId at all, so this guard is measuring nothing",
  );
  // The ENUMERATION ITSELF, read out of the sentence rather than searched for
  // inside it. "Does the paragraph mention this name" is the check that came
  // back green on a deleted list.
  const enumerated = /an optional field on (.*?): put the identity/u.exec(
    catalog.guidance.command ?? "",
  )?.[1];
  assert.ok(enumerated, "the guidance no longer enumerates the field at all");
  assert.deepEqual(
    enumerated.split(", ").sort(),
    carriesExternalId,
    "the sentence an agent reads and the schemas it is generated from disagree",
  );
  // The command this lot added, named explicitly: a derivation that silently
  // produced an empty list would satisfy every assertion above.
  assert.equal(
    carriesExternalId.includes("document.create"),
    true,
    "document.create takes no source key, so an import cannot be retried",
  );
});
