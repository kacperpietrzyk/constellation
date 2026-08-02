// Pomiar szerokości ekranu rekordu wymaga przeglądarki, więc NIE CHODZI w CI.
// Sama reguła „zapadł się czy nie" jest zwykłą funkcją i chodzi tutaj — bo
// inaczej jedyną rzeczą pilnującą jej byłby przebieg, którego CI nie odpala.
import assert from "node:assert/strict";
import test from "node:test";

import {
  MINIMUM_RECORD_CONTENT_FRACTION,
  allowedRecordContentWidth,
  classifyRecordScreenGeometry,
  classifyRecordScreenSweep,
} from "./record-screen-geometry.mjs";

const screen = (overrides) => ({
  kind: "task",
  surface: "tasks:task",
  contentPx: 772,
  paneContentPx: 820,
  maxWidthPx: 1152,
  ...overrides,
});

test("a record screen using the width it is given is not a finding", () => {
  assert.equal(classifyRecordScreenGeometry(screen()).verdict, "roomy");
});

test("THE DEFECT THIS EXISTS FOR: zero content width is a collapse", () => {
  // Zmierzone na `main` @d6c4d4b: `.screen` miał 48 px `clientWidth` — dokładnie
  // tyle, ile ma własnego paddingu — więc szerokość treści wynosiła ZERO,
  // a tytuł zadania rysował się po jednym znaku w wierszu.
  const decision = classifyRecordScreenGeometry(screen({ contentPx: 0 }));
  assert.equal(decision.verdict, "collapsed");
  assert.match(decision.reason, /0 px of CONTENT width/u);
});

test("THE HALF-REMEDY IS ALSO A COLLAPSE, and that is why the threshold is a half", () => {
  // `container-type: normal` to lekarstwo POŁOWICZNE — wygląda na naprawę, bo
  // ekran przestaje mieć zero. Sonda rekonesansu: 365 px w panelu 820 px.
  // Próg, który by to przepuścił, przepuściłby „naprawę", po której ekran dalej
  // jest nieczytelny.
  assert.equal(
    classifyRecordScreenGeometry(screen({ contentPx: 365 })).verdict,
    "collapsed",
  );
  assert.ok(365 / 820 < MINIMUM_RECORD_CONTENT_FRACTION);
});

test("the ceiling the sizing rule allows is what the fraction is taken against, not the pane", () => {
  // `.surface-scroll > *` niesie `max-width: var(--surface-measure)`, więc
  // w bardzo szerokim oknie ekran JEST węższy od panelu i jest to zamierzone.
  // Ułamek liczony od samego panelu robiłby się czerwony od rozciągnięcia okna
  // — asercja z zapalnikiem, w której zapalnikiem jest monitor czytającego.
  assert.equal(
    allowedRecordContentWidth({ paneContentPx: 2400, maxWidthPx: 1152 }),
    1152,
  );
  assert.equal(
    allowedRecordContentWidth({ paneContentPx: 820, maxWidthPx: 1152 }),
    820,
  );
  assert.equal(
    allowedRecordContentWidth({ paneContentPx: 820, maxWidthPx: null }),
    820,
  );
  assert.equal(
    classifyRecordScreenGeometry(
      screen({ contentPx: 1140, paneContentPx: 2400 }),
    ).verdict,
    "roomy",
  );
});

test("a pane with no width of its own is an instrument failure, not a verdict", () => {
  // Ułamek nad zerowym mianownikiem to nie wynik, tylko cisza z liczbą.
  for (const paneContentPx of [0, -1, Number.NaN]) {
    assert.equal(
      classifyRecordScreenGeometry(screen({ paneContentPx })).verdict,
      "unmeasurable",
    );
  }
});

test("A SWEEP THAT MEASURED NOTHING IS NOT A PASS", () => {
  // Ta bramka przeszła już raz nad zerową liczbą rekordów, a rekonesans, który
  // znalazł ten defekt, dwa razy zmierzył pustkę, zanim zmierzył ekran.
  const nothing = classifyRecordScreenSweep({ measured: 0, expected: true });
  assert.equal(nothing.verdict, "measured-nothing");
  assert.match(nothing.reason, /empty measurement is a broken/u);
  assert.equal(
    classifyRecordScreenSweep({ measured: 6, expected: true }).verdict,
    "measured",
  );
});

test("a pass that is not allowed to open records is not held to having opened one", () => {
  // Poniżej własnego minimum okna produktu sweep świadomie nie otwiera rekordu,
  // a przelot zawężony do jednej powierzchni nigdy nie odwiedza tej, z której
  // rekord się otwiera. Żądanie pomiaru tam zamieniłoby wypowiedziane wyłączenie
  // w awarię, która nigdy nie miała nic wspólnego z mierzoną geometrią.
  assert.equal(
    classifyRecordScreenSweep({ measured: 0, expected: false }).verdict,
    "not-expected",
  );
});
