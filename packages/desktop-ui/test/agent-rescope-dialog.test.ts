import assert from "node:assert/strict";
import test from "node:test";

import { SpaceIdSchema } from "@constellation/contracts";

import {
  missingCapabilitiesNote,
  rescopeBlockedReason,
  rescopeTarget,
  summariseRescope,
} from "../src/AccessSurface.js";

const praca = SpaceIdSchema.parse("70000000-0000-4000-8000-000000000001");
const dom = SpaceIdSchema.parse("70000000-0000-4000-8000-000000000002");
const usuniety = SpaceIdSchema.parse("70000000-0000-4000-8000-000000000003");

const spaces = [
  { id: praca, name: "Praca" },
  { id: dom, name: "Dom" },
];

const grant = (
  overrides: Record<string, unknown> = {},
): Parameters<typeof summariseRescope>[0] =>
  ({
    grantId: "70000000-0000-4000-8000-000000000010",
    displayName: "Codex",
    preset: "operate",
    scopeStatus: "current",
    missingFromPreset: [],
    status: "active",
    spaces: [
      {
        spaceGrantId: "70000000-0000-4000-8000-000000000011",
        spaceId: praca,
        spaceName: "Praca",
        access: "edit",
        version: 1,
      },
    ],
    ...overrides,
  }) as never;

/**
 * The sentence carries the whole decision: the dialog shows the target state,
 * but a person can only judge a re-scope by the difference it makes. Neither
 * dialog in this surface can be opened from `renderToStaticMarkup`, so the
 * wording is only reachable — and only provable — through this function.
 */
test("names the level change with both ends of it", () => {
  assert.equal(
    summariseRescope(grant(), "observe", [praca], spaces),
    "Poziom: Działa → Obserwuje.",
  );
});

test("names Spaces gained and Spaces lost, each as a name", () => {
  assert.equal(
    summariseRescope(grant(), "operate", [dom], spaces),
    "Dodajesz dostęp do: Dom. Odbierasz dostęp do: Praca.",
  );
});

test("says both things when both change", () => {
  assert.equal(
    summariseRescope(grant(), "full_access", [praca, dom], spaces),
    "Poziom: Działa → Pełny dostęp. Dodajesz dostęp do: Dom.",
  );
});

/**
 * A Space can leave the workspace while a grant still holds it; only the
 * grant remembers its name. Falling back to the id would put a UUID in the
 * one sentence a person reads before withdrawing access.
 */
test("names a withdrawn Space the workspace no longer lists", () => {
  assert.equal(
    summariseRescope(
      grant({
        spaces: [
          {
            spaceGrantId: "70000000-0000-4000-8000-000000000012",
            spaceId: usuniety,
            spaceName: "Archiwum",
            access: "edit",
            version: 1,
          },
        ],
      }),
      "operate",
      [praca],
      spaces,
    ),
    "Dodajesz dostęp do: Praca. Odbierasz dostęp do: Archiwum.",
  );
});

test("a hand-picked scope is named as what it is, not as a level", () => {
  assert.equal(
    summariseRescope(grant({ preset: "custom" }), "observe", [praca], spaces),
    "Poziom: Ręcznie dobrany → Obserwuje.",
  );
});

/**
 * Empty is the signal the dialog needs to say why saving is unavailable
 * instead of describing a change that is not there.
 */
test("says nothing when the choices still match the grant", () => {
  assert.equal(summariseRescope(grant(), "operate", [praca], spaces), "");
  // Order is not a change: unchecking and rechecking a Space rebuilds the
  // same set at the end of the list.
  assert.equal(
    summariseRescope(
      grant({
        spaces: [
          {
            spaceGrantId: "70000000-0000-4000-8000-000000000011",
            spaceId: praca,
            spaceName: "Praca",
            access: "edit",
            version: 1,
          },
          {
            spaceGrantId: "70000000-0000-4000-8000-000000000013",
            spaceId: dom,
            spaceName: "Dom",
            access: "edit",
            version: 1,
          },
        ],
      }),
      "operate",
      [dom, praca],
      spaces,
    ),
    "",
  );
});

/**
 * Closing drift restates the level the grant already carries, so there is no
 * difference to describe — the dialog's own drift note is what explains that
 * save, and this must not duplicate or contradict it.
 */
test("says nothing when a save only closes drift", () => {
  assert.equal(
    summariseRescope(
      grant({
        scopeStatus: "behind_preset",
        missingFromPreset: ["task.remove"],
      }),
      "operate",
      [praca],
      spaces,
    ),
    "",
  );
});

test("says nothing about a level nobody has chosen yet", () => {
  assert.equal(
    summariseRescope(grant({ preset: "custom" }), undefined, [praca], spaces),
    "",
  );
});

/**
 * Stating Spaces makes the kernel demand edit rights on every Space stated,
 * and it refuses the whole command when one of them fails — including the
 * level change that was the entire point. A save that leaves the set alone
 * must therefore state nothing, and the kernel selects that branch on the
 * key's *absence*, not on an undefined value.
 */
test("a save that does not change the Space set states no Spaces at all", () => {
  const target = rescopeTarget(grant(), "observe", [praca]);
  assert.equal("spaceIds" in target, false);
  assert.equal(target.preset, "observe");
});

test("order alone does not turn a level change into a Space change", () => {
  const both = grant({
    spaces: [
      {
        spaceGrantId: "70000000-0000-4000-8000-000000000011",
        spaceId: praca,
        spaceName: "Praca",
        access: "edit",
        version: 1,
      },
      {
        spaceGrantId: "70000000-0000-4000-8000-000000000013",
        spaceId: dom,
        spaceName: "Dom",
        access: "edit",
        version: 1,
      },
    ],
  });
  assert.equal(
    "spaceIds" in rescopeTarget(both, "observe", [dom, praca]),
    false,
  );
});

test("a changed Space set is stated in full", () => {
  const target = rescopeTarget(grant(), "operate", [praca, dom]);
  assert.deepEqual(target.spaceIds, [praca, dom]);
});

/**
 * The gate is the only thing standing between a person and a command the
 * kernel would refuse, and it holds all three reasons. The dialog cannot be
 * opened from `renderToStaticMarkup`, so this is where it is provable.
 */
test("no level chosen blocks the save and says so", () => {
  assert.equal(
    rescopeBlockedReason(grant({ preset: "custom" }), undefined, [praca]),
    "Wybierz poziom możliwości, aby zapisać.",
  );
});

test("an empty Space set blocks the save and says so", () => {
  assert.equal(
    rescopeBlockedReason(grant(), "observe", []),
    "Wybierz co najmniej jeden Space, aby zapisać.",
  );
});

test("a save that would change nothing blocks and says so", () => {
  assert.equal(
    rescopeBlockedReason(grant(), "operate", [praca]),
    "Nic się nie zmienia — nie ma czego zapisać.",
  );
});

test("a level change, a Space change, or drift each open the save", () => {
  assert.equal(rescopeBlockedReason(grant(), "observe", [praca]), undefined);
  assert.equal(
    rescopeBlockedReason(grant(), "operate", [praca, dom]),
    undefined,
  );
  // Restating the level a drifted grant already carries is the one case where
  // "nothing looks different" and the save still does something.
  assert.equal(
    rescopeBlockedReason(
      grant({
        scopeStatus: "behind_preset",
        missingFromPreset: ["task.remove"],
      }),
      "operate",
      [praca],
    ),
    undefined,
  );
});

/**
 * Polish counts take three forms, and the relative pronoun follows the same
 * split — a count formatted as "2 uprawnień" or a plural pronoun on a single
 * capability is wrong in a sentence a person reads before widening an agent's
 * powers.
 */
test("the drift sentence agrees with its own number", () => {
  assert.match(missingCapabilitiesNote(1), /1 uprawnienie, którego /u);
  assert.match(missingCapabilitiesNote(2), /2 uprawnienia, których /u);
  assert.match(missingCapabilitiesNote(4), /4 uprawnienia, których /u);
  assert.match(missingCapabilitiesNote(5), /5 uprawnień, których /u);
  // The teens are the exception every naive rule gets wrong.
  assert.match(missingCapabilitiesNote(12), /12 uprawnień, /u);
  assert.match(missingCapabilitiesNote(13), /13 uprawnień, /u);
  assert.match(missingCapabilitiesNote(14), /14 uprawnień, /u);
  assert.match(missingCapabilitiesNote(22), /22 uprawnienia, /u);
  assert.match(missingCapabilitiesNote(25), /25 uprawnień, /u);
  assert.match(missingCapabilitiesNote(101), /101 uprawnień, /u);
});
