// Pomiar wysokości wymaga przeglądarki, więc NIE CHODZI w CI. Sama reguła
// „związany czy nie" jest zwykłą funkcją i chodzi tutaj — bo inaczej jedyną
// rzeczą pilnującą jej byłby przebieg, którego CI nie odpala.
//
// Każda liczba w tym pliku jest ZMIERZONA na powłoce Biblioteki (harness
// deweloperski, Chromium, 2026-08-02), nie wymyślona: baza z defektem, stan po
// poprawce, i stan po sondzie, która pokazała zapaść wiersza czytelni.
import assert from "node:assert/strict";
import test from "node:test";

import {
  HEIGHT_BOUND_TOLERANCE_PX,
  MINIMUM_READING_HEIGHT_FRACTION,
  classifyHeightBoundEvidence,
  classifyHeightBoundScreen,
  classifyHeightBoundSweep,
} from "./surface-height-bound.mjs";

/** Stan ZDROWY, zmierzony: 1440×900 po poprawce. */
const healthy = (overrides) => ({
  name: "library",
  surface: "library:notes",
  paneClientPx: 735,
  rootHeightPx: 735,
  rootClientPx: 735,
  rootScrollPx: 735,
  readingClientPx: 577,
  panelsTallerThanReading: 0,
  ...overrides,
});

test("a screen that fits its pane and keeps its reading area is not a finding", () => {
  const decision = classifyHeightBoundScreen(healthy());
  assert.equal(decision.verdict, "bounded");
  assert.ok(decision.fraction > MINIMUM_READING_HEIGHT_FRACTION);
});

test("THE DEFECT THIS EXISTS FOR: the whole screen scrolls as one page", () => {
  // Zmierzone na `main` @70f0984: czytelnia 4140 px w oknie 735 px, cała
  // powłoka przewijana jako strona w `.work-surface`.
  const decision = classifyHeightBoundScreen(
    healthy({
      rootHeightPx: 4297,
      rootScrollPx: 4297,
      rootClientPx: 4297,
      readingClientPx: 4140,
    }),
  );
  assert.equal(decision.verdict, "unbounded");
  assert.match(decision.reason, /the PAGE scrolls instead of the panels/u);
});

test("A LEGITIMATELY TALL READING STAYS GREEN — the other direction of the same threshold", () => {
  // To jest połowa, której break-test nie umie pokazać: harness złamań ocenia
  // „zielone na zepsutym" jako porażkę, więc przypadek „wysoka treść, ale
  // związana" musi stać jako przypadek POZYTYWNY tutaj. Notatka ma 4140 px
  // treści, panel czytania przewija ją u siebie, strona stoi.
  const decision = classifyHeightBoundScreen(
    healthy({ rootHeightPx: 735, rootScrollPx: 735, readingClientPx: 577 }),
  );
  assert.equal(decision.verdict, "bounded");
});

test("THE FLOOR: a reading row eaten to zero passes every ceiling and is still broken", () => {
  // Sonda 1092×900 przy 300% tekstu, z samym `block-size: 100%` na powłoce —
  // czyli z lekarstwem, które rekonesans zmierzył i polecił. Nagłówek i pasek
  // odczytów chcą 795 px z 404-pikselowego pudełka, wiersz czytelni dostaje 0.
  const decision = classifyHeightBoundScreen(
    healthy({
      surface: "library:notes",
      paneClientPx: 404,
      rootHeightPx: 404,
      rootClientPx: 404,
      rootScrollPx: 404,
      readingClientPx: 0,
    }),
  );
  assert.equal(decision.verdict, "collapsed");
  assert.match(decision.reason, /zero pixels tall/u);
});

test("the floor is measured, not chosen: it sits between the collapse and the healthy screen", () => {
  assert.ok(0 < MINIMUM_READING_HEIGHT_FRACTION);
  assert.ok(MINIMUM_READING_HEIGHT_FRACTION < 577 / 735);
});

test("A SCREEN WHOSE OWN CHROME DOES NOT FIT YIELDS THE BOUND, and that is declared", () => {
  // 1092×900 przy 300% tekstu po pełnej poprawce: powłoka chce 997 px z 404,
  // więc strona wraca do przewijania. Podłoga obowiązuje dalej — czytelnia ma
  // swoje 202 px, czyli równo połowę — a sufit nie.
  const decision = classifyHeightBoundScreen(
    healthy({
      paneClientPx: 404,
      rootHeightPx: 404,
      rootClientPx: 404,
      rootScrollPx: 997,
      readingClientPx: 202,
    }),
  );
  assert.equal(decision.verdict, "yields");
});

test("THE SECOND DEFECT: panels taller than the box holding them scroll together", () => {
  // Rekonesans nazwał to osobno i miał rację: przy związanej powłoce, ale bez
  // własnego przewijania panelu czytania, pudełko czytelni przewijało wszystkie
  // trzy panele naraz. Sufit i podłoga są wtedy spełnione.
  const decision = classifyHeightBoundScreen(
    healthy({ panelsTallerThanReading: 3 }),
  );
  assert.equal(decision.verdict, "panels-scroll-together");
  assert.match(decision.reason, /loses the file tree/u);
});

test("a pane or a screen with no height is an instrument failure, not a layout verdict", () => {
  assert.equal(
    classifyHeightBoundScreen(healthy({ paneClientPx: 0 })).verdict,
    "unmeasurable",
  );
  assert.equal(
    classifyHeightBoundScreen(healthy({ rootClientPx: 0 })).verdict,
    "unmeasurable",
  );
});

test("the tolerance is arithmetic, not slack: one pixel passes, two do not", () => {
  // Ścieżki grida rozwiązują się ułamkowo (zmierzone 577.312 px), a
  // `clientHeight` jest całkowity.
  assert.equal(HEIGHT_BOUND_TOLERANCE_PX, 1);
  assert.equal(
    classifyHeightBoundScreen(healthy({ rootHeightPx: 735 + 1 })).verdict,
    "bounded",
  );
  assert.equal(
    classifyHeightBoundScreen(healthy({ rootHeightPx: 735 + 2 })).verdict,
    "unbounded",
  );
});

test("A SWEEP THAT MEASURED NOTHING IS NOT A SWEEP", () => {
  assert.equal(
    classifyHeightBoundSweep({
      declared: ["library"],
      measured: [],
      expected: true,
    }).verdict,
    "short",
  );
});

test("AND AN EMPTY REGISTRY IS NOT PERMISSION TO MEASURE NOTHING", () => {
  // Gdyby nikt nie deklarował się związanym wysokością, pętla nad pustym
  // zbiorem przeszłaby, nie sprawdziwszy niczego. To jest dokładnie ten kształt,
  // przez który ta fala łapie ósmy przyrząd — więc pusty rejestr jest awarią.
  const decision = classifyHeightBoundSweep({
    declared: [],
    measured: [],
    expected: true,
  });
  assert.equal(decision.verdict, "no-declarations");
  assert.match(decision.reason, /cannot fail is decoration/u);
});

test("a declared screen this pass never reached is named, not shrugged at", () => {
  const decision = classifyHeightBoundSweep({
    declared: ["library", "meetings"],
    measured: ["library"],
    expected: true,
  });
  assert.equal(decision.verdict, "short");
  assert.deepEqual(decision.missing, ["meetings"]);
});

test("a full sweep of the declared set is what a pass looks like", () => {
  assert.equal(
    classifyHeightBoundSweep({
      declared: ["library"],
      measured: ["library"],
      expected: true,
    }).verdict,
    "measured",
  );
});

test("THE EMPTY-FIXTURE TRAP: a ceiling over content that fits proves nothing", () => {
  const decision = classifyHeightBoundEvidence({
    scrollingSubjects: 0,
    expected: true,
  });
  assert.equal(decision.verdict, "nothing-overflowed");
  assert.match(decision.reason, /emptied its fixture before/u);
});

test("one screen holding more than its reading box is the evidence the pass needs", () => {
  assert.equal(
    classifyHeightBoundEvidence({ scrollingSubjects: 1, expected: true })
      .verdict,
    "witnessed",
  );
});
