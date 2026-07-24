import assert from "node:assert/strict";
import test from "node:test";

import { SpaceIdSchema } from "@constellation/contracts";

import { summariseRescope } from "../src/AccessSurface.js";

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
