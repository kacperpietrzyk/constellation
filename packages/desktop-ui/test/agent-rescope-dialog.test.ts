import assert from "node:assert/strict";
import test from "node:test";

import { SpaceIdSchema } from "@constellation/contracts";

import {
  missingCapabilitiesClause,
  missingCapabilitiesNote,
  rescopeBlockedReason,
  rescopeTarget,
  summariseRescope,
} from "../src/AccessSurface.js";

const praca = SpaceIdSchema.parse("70000000-0000-4000-8000-000000000001");
const dom = SpaceIdSchema.parse("70000000-0000-4000-8000-000000000002");
const usuniety = SpaceIdSchema.parse("70000000-0000-4000-8000-000000000003");

const workSpace = { id: praca, name: "Praca" };
const homeSpace = { id: dom, name: "Dom" };
const spaces = [workSpace, homeSpace];

const spaceGrant = (
  spaceGrantId: string,
  space: { readonly id: string; readonly name: string },
  access = "edit",
) => ({
  spaceGrantId,
  spaceId: space.id,
  spaceName: space.name,
  access,
  version: 1,
});

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
    spaces: [spaceGrant("70000000-0000-4000-8000-000000000011", workSpace)],
    ...overrides,
  }) as never;

const heldBySpace = (
  space: { readonly id: string; readonly name: string },
  access?: string,
) => ({
  spaces: [spaceGrant("70000000-0000-4000-8000-000000000011", space, access)],
});

const heldByBoth = {
  spaces: [
    spaceGrant("70000000-0000-4000-8000-000000000011", workSpace),
    spaceGrant("70000000-0000-4000-8000-000000000013", homeSpace),
  ],
};

/**
 * Podsumowanie jest jednym stringiem, więc jego kształt czyta się przez
 * zdania: zmiana poziomu i każda strona zmiany Space'ów mają być osobnymi
 * członami, a nie jedną wyliczanką.
 */
const clauses = (summary: string): readonly string[] =>
  summary
    .split(/(?<=[.;])\s+/u)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);

const clauseNaming = (summary: string, name: string): string => {
  const naming = clauses(summary).filter((clause) => clause.includes(name));
  assert.equal(
    naming.length,
    1,
    `${name} powinien być nazwany dokładnie w jednym członie: ${summary}`,
  );
  return naming[0] ?? "";
};

const sharedStart = (a: string, b: string): number => {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length])
    length += 1;
  return length;
};

const sharedEnd = (a: string, b: string): number => {
  let length = 0;
  while (
    length < a.length &&
    length < b.length &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  )
    length += 1;
  return length;
};

/**
 * The sentence carries the whole decision: the dialog shows the target state,
 * but a person can only judge a re-scope by the difference it makes. Neither
 * dialog in this surface can be opened from `renderToStaticMarkup`, so the
 * wording is only reachable — and only provable — through this function.
 *
 * Oba końce zmiany są dowodzone różnicowo: gdy zniknie poziom trzymany, dwa
 * różne granty dostaną to samo zdanie; gdy zniknie poziom wybrany, dwa różne
 * wybory dostaną to samo zdanie. Żadne słowo nie jest tu cytowane.
 */
test("names the level change with both ends of it", () => {
  const lowered = summariseRescope(grant(), "observe", [praca], spaces);
  assert.notEqual(lowered.trim(), "");
  assert.notEqual(
    lowered,
    summariseRescope(
      grant({ preset: "full_access" }),
      "observe",
      [praca],
      spaces,
    ),
  );
  assert.notEqual(
    lowered,
    summariseRescope(grant(), "propose", [praca], spaces),
  );

  // Kierunek, nie tylko obecność obu poziomów: dwa zapisy wychodzące z tego
  // samego poziomu do różnych poziomów mają wspólny POCZĄTEK. Zamiana stron
  // strzałki przenosi wspólną część na koniec i tylko ta asercja to widzi.
  const toPropose = summariseRescope(grant(), "propose", [praca], spaces);
  assert.ok(
    sharedStart(lowered, toPropose) > sharedEnd(lowered, toPropose),
    `poziom trzymany nie stoi po stronie, po której się zaczyna: ${lowered} / ${toPropose}`,
  );
});

/**
 * A hand-picked scope is a level like the others as far as the sentence is
 * concerned: it has to be named as what it is. Every level a grant can hold
 * and every level a person can choose therefore needs its own name — a shared
 * or missing one would let two different re-scopes read identically.
 */
test("every level a grant holds or a person picks carries its own name", () => {
  const held = ["observe", "propose", "operate", "custom"].map((preset) =>
    summariseRescope(grant({ preset }), "full_access", [praca], spaces),
  );
  assert.equal(new Set(held).size, held.length);
  for (const summary of held) assert.notEqual(summary.trim(), "");

  const chosen = (["observe", "propose", "full_access"] as const).map(
    (preset) => summariseRescope(grant(), preset, [praca], spaces),
  );
  assert.equal(new Set(chosen).size, chosen.length);
  for (const summary of chosen) assert.notEqual(summary.trim(), "");
});

/**
 * Dodanie i odebranie dostępu muszą stać w osobnych członach i brzmieć
 * inaczej — wspólna lista nazw ("zmieniasz dostęp do: Dom, Praca") nazywa
 * wszystko i nie mówi nic, a to jest zdanie czytane przed odebraniem dostępu.
 */
test("names Spaces gained and Spaces lost, each as a name and each as itself", () => {
  const swapped = summariseRescope(grant(), "operate", [dom], spaces);
  const gained = clauseNaming(swapped, homeSpace.name);
  const lost = clauseNaming(swapped, workSpace.name);
  assert.notEqual(gained, lost);
  assert.notEqual(
    gained.replace(homeSpace.name, ""),
    lost.replace(workSpace.name, ""),
  );

  // Ten sam Space po drugiej stronie zmiany nie może czytać się tak samo.
  const withdrawn = summariseRescope(
    grant(heldByBoth),
    "operate",
    [praca],
    spaces,
  );
  assert.notEqual(clauseNaming(withdrawn, homeSpace.name), gained);
});

test("says both things when both change", () => {
  const levelOnly = summariseRescope(grant(), "full_access", [praca], spaces);
  const spacesOnly = summariseRescope(grant(), "operate", [praca, dom], spaces);
  const both = summariseRescope(grant(), "full_access", [praca, dom], spaces);
  assert.notEqual(levelOnly.trim(), "");
  assert.notEqual(spacesOnly.trim(), "");
  assert.ok(both.includes(levelOnly), `${both} pomija zmianę poziomu`);
  assert.ok(both.includes(spacesOnly), `${both} pomija zmianę Space'ów`);
});

/**
 * A Space can leave the workspace while a grant still holds it; only the
 * grant remembers its name. Falling back to the id would put a UUID in the
 * one sentence a person reads before withdrawing access.
 */
test("names a withdrawn Space the workspace no longer lists", () => {
  const archived = spaceGrant("70000000-0000-4000-8000-000000000012", {
    id: usuniety,
    name: "Archiwum",
  });
  const summary = summariseRescope(
    grant({ spaces: [archived] }),
    "operate",
    [praca],
    spaces,
  );
  assert.ok(summary.includes(archived.spaceName), summary);
  assert.ok(!summary.includes(usuniety), `identyfikator w zdaniu: ${summary}`);
  assert.ok(summary.includes(workSpace.name), summary);
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
    summariseRescope(grant(heldByBoth), "operate", [dom, praca], spaces),
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
 * level change that was the entire point. A save that would leave every Space
 * grant exactly as it stands must therefore state nothing, and the kernel
 * selects that branch on the key's *absence*, not on an undefined value.
 * Closing drift is that save: the level is restated, so the per-Space access
 * it derives is the one every held Space already carries.
 */
test("a save that changes no Space and no per-Space level states no Spaces", () => {
  const target = rescopeTarget(
    grant({ scopeStatus: "behind_preset", missingFromPreset: ["task.remove"] }),
    "operate",
    [praca],
  );
  assert.equal("spaceIds" in target, false);
  assert.equal(target.preset, "operate");
});

test("order alone does not turn a save into a Space change", () => {
  assert.equal(
    "spaceIds" in rescopeTarget(grant(heldByBoth), "operate", [dom, praca]),
    false,
  );
});

/**
 * The level is carried twice — in the grant's capability scope and in each
 * Space grant's own `access`, which the kernel rewrites only for the Spaces a
 * command states. Omitting them here because the *set* is unchanged is what a
 * raise looks like in the dialog, and it would leave the agent holding
 * `operate` capabilities behind `view` access: every command the person was
 * just told it may now perform, refused at the Space.
 */
test("raising the level states the Spaces even when the set is unchanged", () => {
  const observing = grant({
    preset: "observe",
    ...heldBySpace(workSpace, "view"),
  });
  assert.deepEqual(rescopeTarget(observing, "operate", [praca]).spaceIds, [
    praca,
  ]);
});

/** The same divergence in the other direction, left behind by a narrowing. */
test("lowering the level states the Spaces even when the set is unchanged", () => {
  assert.deepEqual(rescopeTarget(grant(), "observe", [praca]).spaceIds, [
    praca,
  ]);
});

test("a changed Space set is stated in full", () => {
  const target = rescopeTarget(grant(), "operate", [praca, dom]);
  assert.deepEqual(target.spaceIds, [praca, dom]);
});

/**
 * The gate is the only thing standing between a person and a command the
 * kernel would refuse, and it holds all three reasons. The dialog cannot be
 * opened from `renderToStaticMarkup`, so this is where it is provable — and
 * trzy powody muszą być trzema różnymi zdaniami, bo jedno wspólne „nie da się
 * zapisać” nie mówi, czego brakuje.
 */
test("each thing that blocks the save is said, and each is said differently", () => {
  const noLevel = rescopeBlockedReason(grant({ preset: "custom" }), undefined, [
    praca,
  ]);
  const noSpace = rescopeBlockedReason(grant(), "observe", []);
  const noChange = rescopeBlockedReason(grant(), "operate", [praca]);
  for (const reason of [noLevel, noSpace, noChange]) {
    assert.ok(reason !== undefined, "zapis blokowany bez powodu");
    assert.notEqual(reason.trim(), "");
  }
  assert.equal(new Set([noLevel, noSpace, noChange]).size, 3);
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
 * powers. Te dwa testy celowo cytują polskie formy: sprawdzaną gwarancją jest
 * sam język, więc żyją i giną razem z polską odmianą w źródle.
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

/**
 * The grant row states the same count after `brakuje`, which governs the
 * genitive — a different case with a different split. Only 1 takes the
 * genitive singular; 2, 3 and 4 take the genitive plural that the nominative
 * rule above would spell "uprawnienia", so the two sentences cannot share a
 * helper and the row's noun cannot be a constant.
 */
test("the row's count agrees in the case `brakuje` governs", () => {
  assert.equal(missingCapabilitiesClause(1), "brakuje 1 uprawnienia");
  assert.equal(missingCapabilitiesClause(2), "brakuje 2 uprawnień");
  assert.equal(missingCapabilitiesClause(4), "brakuje 4 uprawnień");
  assert.equal(missingCapabilitiesClause(5), "brakuje 5 uprawnień");
  assert.equal(missingCapabilitiesClause(22), "brakuje 22 uprawnień");
});
