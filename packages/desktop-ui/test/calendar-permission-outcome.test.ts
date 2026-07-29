import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarCapability } from "@constellation/contracts";

import {
  calendarAccessOutcome,
  type CalendarAccessOutcome,
} from "../src/MeetingsSurface.js";

const capability = (
  overrides: Partial<CalendarCapability>,
): CalendarCapability => ({
  platform: "macos",
  provider: "eventkit",
  availability: "permission_required",
  canRead: false,
  canWriteOwnedBlocks: false,
  detailCode: "not_determined",
  ...overrides,
});

/**
 * Cztery rozstrzygnięcia, jakie prośba o dostęp może przynieść, nazwane
 * dyskryminantami z kontraktu — nie zdaniami, które ta funkcja z nich robi.
 */
const outcomeFor = {
  granted: () =>
    calendarAccessOutcome(
      capability({
        availability: "available",
        canRead: true,
        canWriteOwnedBlocks: true,
        detailCode: "full_access",
      }),
    ),
  denied: () =>
    calendarAccessOutcome(
      capability({
        availability: "permission_denied",
        detailCode: "access_denied",
      }),
    ),
  suppressed: () =>
    calendarAccessOutcome(
      capability({ detailCode: "permission_prompt_suppressed" }),
    ),
  unanswered: () => calendarAccessOutcome(capability({})),
} as const;

/** Samo zdanie wyniku — dyskryminant i wskazówka mają własne pola. */
const said = (outcome: CalendarAccessOutcome): string => outcome.message;

const sentences = (said: string): readonly string[] =>
  said
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

/**
 * Przycisk mówi jedno zdanie i to zdanie jest całą wiedzą osoby o wyniku. Gdy
 * dwa różne rozstrzygnięcia czyta się tak samo, prośba nie zdaje sprawy z
 * tego, co się faktycznie stało — a właśnie tak wyglądał defekt zgłoszony
 * jako „przycisk nic nie robi”.
 */
test("every outcome the request can have reads as a different one", () => {
  const spoken = Object.entries(outcomeFor).map(
    ([name, outcome]) => [name, said(outcome())] as const,
  );
  for (const [name, message] of spoken)
    assert.notEqual(message.trim(), "", `${name} nie mówi nic`);
  assert.equal(
    new Set(spoken.map(([, message]) => message)).size,
    spoken.length,
  );
  // Rozstrzygnięcia też muszą być rozróżnialne bez czytania zdania — inaczej
  // wołający nie ma jak zareagować inaczej na każde z nich.
  assert.equal(
    new Set(Object.values(outcomeFor).map((outcome) => outcome().tag)).size,
    Object.keys(outcomeFor).length,
  );
});

/**
 * macOS, który nie podniósł pytania, ma tę samą `availability`, co prośba
 * jeszcze nieodpowiedziana — rozróżnia je wyłącznie `detailCode`. Rozstrzyga
 * o tym gałąź, którą łatwo usunąć jako pozornie nadmiarową.
 */
test("a suppressed prompt is told apart by its detail code alone", () => {
  const suppressed = capability({ detailCode: "permission_prompt_suppressed" });
  const unanswered = capability({});
  assert.equal(suppressed.availability, unanswered.availability);
  assert.notEqual(
    calendarAccessOutcome(suppressed).tag,
    calendarAccessOutcome(unanswered).tag,
  );
  assert.notEqual(
    calendarAccessOutcome(suppressed).tag,
    outcomeFor.denied().tag,
  );
});

/**
 * Odmowa osoby i stłumione pytanie kończą się w tym samym miejscu systemu, i
 * tylko one — kierowanie tam po udanej prośbie albo po prośbie jeszcze
 * nieodpowiedzianej wysyła człowieka nie tam, gdzie trzeba.
 */
test("the two states a system setting reverses point at that same setting", () => {
  // Poprzednia wersja sprawdzała, że oba zdania mają WSPÓLNE ZAKOŃCZENIE
  // dłuższe niż 20 znaków. Zaspokajał ją dowolny wspólny ogon, więc dało się
  // usunąć z produktu ścieżkę do ustawień systemowych — czyli jedyną rzecz,
  // którą człowiek może z tym zrobić — a test dalej świecił na zielono.
  // Teraz wskazówka jest osobnym polem i sprawdzamy jej TOŻSAMOŚĆ i ZASIĘG.
  const denied = outcomeFor.denied();
  const suppressed = outcomeFor.suppressed();
  assert.ok(
    (denied.remedy ?? "").trim().length > 0,
    "odmowa nie mówi, gdzie leży przełącznik, którego aplikacja nie naciśnie",
  );
  assert.equal(
    suppressed.remedy,
    denied.remedy,
    "stłumione pytanie kieruje gdzie indziej niż odmowa, choć odblokowuje je ten sam przełącznik",
  );
  // I tylko one: kierowanie tam po udanej prośbie albo przed odpowiedzią
  // wysyła człowieka nie tam, gdzie trzeba.
  assert.equal(outcomeFor.granted().remedy, undefined);
  assert.equal(outcomeFor.unanswered().remedy, undefined);
  // Wskazówka ma też naprawdę stać w zdaniu, a nie tylko obok niego.
  for (const outcome of [denied, suppressed])
    assert.ok(
      outcome.message.includes(outcome.remedy ?? "\u0000"),
      "wskazówka nie dociera do człowieka, bo nie ma jej w zdaniu",
    );
});

/**
 * Żadne rozstrzygnięcie poza zgodą nie może powtórzyć niczego, co mówi
 * zgoda — obietnica „wydarzenia są już widoczne” po odmowie to nie literówka,
 * tylko fałszywy stan aplikacji.
 */
test("an outcome that granted nothing never repeats what a grant claims", () => {
  const granted = said(outcomeFor.granted());
  const grantedSentences = sentences(granted);
  assert.ok(grantedSentences.length > 0);
  for (const outcome of [
    said(outcomeFor.unanswered()),
    said(outcomeFor.denied()),
    said(outcomeFor.suppressed()),
    said(
      calendarAccessOutcome(
        capability({
          availability: "error",
          detailCode: "unknown_authorization",
        }),
      ),
    ),
  ]) {
    assert.notEqual(outcome, granted);
    for (const sentence of grantedSentences)
      assert.ok(
        !outcome.includes(sentence),
        `zdanie ze zgody wróciło w wyniku, który nic nie przyznał: ${sentence}`,
      );
  }
});
