// Spis farby kontrolek wymaga przeglądarki, więc NIE CHODZI w CI. Sama reguła
// „czy ten arkusz ustawił to tło" jest zwykłą funkcją nad napisami i chodzi
// tutaj — bo inaczej jedyną rzeczą pilnującą jej byłby przebieg, którego
// `npm run check` nie odpala, a wtedy każda literówka w klasyfikacji jechałaby
// do CI niezauważona.
//
// KAŻDA LICZBA I KAŻDY NAPIS W TYM PLIKU ZOSTAŁ ODCZYTANY Z DRZEWA
// 2026-08-10, przelotem `control paint` w `npm run test:renderer-layout`
// na gałęzi `agent/domkniecie-wizualne-v3`. Wartości Chromium: goły `<button>`
// wylicza `rgb(107, 107, 107)` w motywie ciemnym i `rgb(239, 239, 239)`
// w jasnym, a tło tokenowe wraca w `oklch()`, bo Chromium ZACHOWUJE przestrzeń
// koloru w wartości wyliczonej. Obie te obserwacje są tu asertowane jako
// zachowanie REGUŁY, nie jako oczekiwanie wobec przeglądarki: reguła nie zna
// żadnej z tych wartości i ma nie znać.
import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROL_PAINT_ARMED,
  CONTROL_PAINT_STATUS,
  CONTROL_PAINT_TAGS,
  KNOWN_CONTROL_PAINT,
  MINIMUM_TOKEN_PALETTE,
  alphaOf,
  classifyControlPaint,
  classifyControlPaintCensus,
  classifyControlPaintWitnesses,
  controlPaintVerdictThrows,
  normaliseClassToken,
  signatureCarriesClass,
  unmetControlPaintEntries,
} from "./control-paint.mjs";

// Paleta zmierzona na tym drzewie: 55 wartości w motywie ciemnym, 68 w jasnym.
// Tutaj wystarczą trzy — reguła pyta o PRZYNALEŻNOŚĆ, nie o rozmiar.
const PALETTE = [
  "oklch(0.21 0.012 285)",
  "oklch(0.28 0.014 285)",
  "rgba(255, 255, 255, 0.055)",
];
const UA_DARK = "rgb(107, 107, 107)";

const group = (overrides) => ({
  surface: "organizations",
  signature: "button._chip",
  tag: "button",
  backgroundColor: UA_DARK,
  backgroundImage: "none",
  count: 3,
  sample: "Active",
  ...overrides,
});

const judge = (overrides, palette = PALETTE) =>
  classifyControlPaint({ group: group(overrides), palette, uaPaint: UA_DARK });

test("THE DEFECT THIS EXISTS FOR: a control painted by the engine, not by this stylesheet", () => {
  // `styles.css:509-512` resetuje `button` bez `background`, a w całym arkuszu
  // nie ma ani jednej deklaracji `appearance` — więc niewciśnięty chip maluje
  // się systemowym `ButtonFace` i jest JAŚNIEJSZY od wciśniętego.
  const decision = judge({});
  assert.equal(decision.state, "UA_DEFAULT");
  assert.match(decision.reason, /no rule of this stylesheet set it/u);
});

test("A DELIBERATELY TRANSPARENT CONTROL IS NOT A FINDING — the false positive that would kill this instrument", () => {
  // `.ghost-button` (`styles.css:787`) mówi `background: transparent` i mówi to
  // świadomie; arkusz powtarza to 38 razy. Przyrząd zgłaszający te kontrolki
  // zostałby skasowany przy pierwszym czerwonym przebiegu — i słusznie, bo
  // fałszywe trafienie jest wadą PRZYRZĄDU.
  assert.equal(
    judge({
      signature: "button.ghost-button",
      backgroundColor: "rgba(0, 0, 0, 0)",
    }).state,
    "TRANSPARENT",
  );
});

test("a background taken from a token is legal, and the comparison is string to string after ONE normalisation", () => {
  // Obie strony przechodzą przez `background-color` tej samej strony, więc
  // „oklch(…)" po stronie tokenu zrównuje się z „oklch(…)" po stronie podmiotu.
  // Bez tego porównanie rozjeżdżałoby się na samej NOTACJI, a nie na farbie.
  assert.equal(
    judge({
      signature: "button.primary-button",
      backgroundColor: "oklch(0.21 0.012 285)",
    }).state,
    "IN_PALETTE",
  );
});

test("A LITERAL OUTSIDE THE PALETTE IS A DIFFERENT FINDING FROM THE ENGINE DEFAULT, because it is different work", () => {
  // `UA_DEFAULT` naprawia się w REGULE RESETU, `OFF_PALETTE` w tej jednej
  // regule, która wpisała literał. Jeden werdykt na obie klasy wysyłałby
  // czytającego w złe miejsce w połowie przypadków.
  const decision = judge({ backgroundColor: "rgb(1, 2, 3)" });
  assert.equal(decision.state, "OFF_PALETTE");
  assert.match(decision.reason, /not the bare-<button> paint either/u);
});

test("THE MEASUREMENT THAT FORCED THE GRADIENT CARVE-OUT: a gradient button computes ButtonFace underneath", () => {
  // Zmierzone w Chromium: kontrolka malowana SAMYM gradientem wylicza
  // `background-color` DOKŁADNIE równe `ButtonFace`. Akcja główna prototypu
  // jest gradientem akcentu, więc bez tego wyłączenia najważniejszy przycisk
  // aplikacji byłby fałszywym trafieniem w każdym przebiegu.
  const decision = judge({
    signature: "button.primary-button",
    backgroundImage: "linear-gradient(rgb(167, 139, 250), rgb(127, 75, 220))",
  });
  assert.equal(decision.state, "PAINTED_IMAGE");
});

test("a colour this instrument cannot decompose is UNREADABLE, never quietly transparent", () => {
  // Zgadywanie w tym miejscu byłoby dokładnie tą klasą kłamstwa, przed którą
  // stoi cały ten przyrząd: cisza z liczbą.
  assert.equal(
    judge({ backgroundColor: "color(display-p3 1 0 0)" }).state,
    "UNREADABLE",
  );
  assert.equal(alphaOf("color(display-p3 1 0 0)"), null);
});

test("alpha is read through the colour parser, because Chromium keeps the authored colour space", () => {
  assert.equal(alphaOf("rgba(0, 0, 0, 0)"), 0);
  assert.equal(alphaOf("oklch(0.21 0.012 285 / 0)"), 0);
  assert.equal(alphaOf("oklch(0.21 0.012 285)"), 1);
  assert.equal(alphaOf("rgb(107, 107, 107)"), 1);
});

test("NO PLATFORM AND NO THEME IS PINNED: the same rule judges the light theme with a different engine paint", () => {
  // `ButtonFace` to `rgb(107,107,107)` w ciemnym i `rgb(239,239,239)`
  // w jasnym — a bramka chodzi w OBU motywach, więc literał byłby zielony
  // w połowie przebiegów, zanim ktokolwiek dojechałby do Linuksa.
  const light = classifyControlPaint({
    group: group({ backgroundColor: "rgb(239, 239, 239)" }),
    palette: PALETTE,
    uaPaint: "rgb(239, 239, 239)",
  });
  assert.equal(light.state, "UA_DEFAULT");
  const sources = [...KNOWN_CONTROL_PAINT.map((entry) => entry.why)].join("\n");
  assert.doesNotMatch(sources, /rgb\(/u);
});

test("the verdict does not need the engine probe at all — it only names the class", () => {
  // Sonda gołej kontrolki jest ADNOTACJĄ. Reguła bez niej dalej odmawia,
  // tylko mówi „to nie jest token" zamiast „nikt tego nie ustawił".
  const blind = classifyControlPaint({
    group: group(),
    palette: PALETTE,
    uaPaint: undefined,
  });
  assert.equal(blind.state, "OFF_PALETTE");
});

test("THE REGISTRY IS KEYED ON SHAPE, NEVER ON COUNTS — a growing fixture may not turn this red", () => {
  // `.treeNode` to jeden wiersz na folder, `.groupName` jeden na organizację,
  // `.action` do czterech na kartę odnowienia. Rejestr trzymający liczby
  // zgniłby przy pierwszym urośnięciu fikstury — czyli czerwieniłby na
  // DANYCH, nie na kodzie.
  for (const entry of KNOWN_CONTROL_PAINT) {
    assert.equal(typeof entry.surface, "string");
    assert.equal(typeof entry.signature, "string");
    assert.ok(
      entry.why.length > 0,
      `${entry.signature} must cite where the rule is silent`,
    );
    assert.equal(Object.keys(entry).length, 3);
  }
  const keys = KNOWN_CONTROL_PAINT.map(
    (entry) => `${entry.surface}\t${entry.signature}`,
  );
  assert.equal(new Set(keys).size, keys.length, "duplicate registry key");
});

test("an entry nobody met is a failure, because a fixed control must take its entry with it", () => {
  assert.equal(
    unmetControlPaintEntries(new Set()).length,
    KNOWN_CONTROL_PAINT.length,
  );
  const all = new Set(
    KNOWN_CONTROL_PAINT.map((entry) => `${entry.surface}\t${entry.signature}`),
  );
  assert.deepEqual(unmetControlPaintEntries(all), []);
});

test("THE ANSWER TO „RED TODAY, GREEN IN CI”: known debt reports, anything outside the registry throws", () => {
  // Reguła tego repozytorium: pozycja NIEODDANA raportuje, rzuca dopiero to, co
  // ODDANE i ZEPSUTE. To jest też dokładnie to, co mierzy break-test — bramka
  // przechodzi z 0 na 1 nie dlatego, że przyrząd coś znalazł, tylko dlatego, że
  // znalazł coś NOWEGO.
  assert.equal(
    controlPaintVerdictThrows({ registered: true, armed: false }),
    false,
  );
  assert.equal(
    controlPaintVerdictThrows({ registered: false, armed: false }),
    true,
  );
  assert.equal(
    controlPaintVerdictThrows({ registered: true, armed: true }),
    true,
  );
  assert.equal(CONTROL_PAINT_ARMED, false);
  assert.equal(CONTROL_PAINT_STATUS, "pending: FAZA C, lot C3");
});

test("a destination where the census saw ZERO controls is an instrument failure, not silence", () => {
  // „Pusta fikstura chroni fałszywą asercję" — asercja, której fikstura nie
  // dosięga, jest nieodróżnialna od poprawnej.
  const failures = classifyControlPaintCensus({
    examined: { library: 210, meetings: 0 },
    uaPaints: { "dark/button": UA_DARK },
    palettesByTheme: { dark: PALETTE.concat(Array(60).fill("x")) },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /CONTROL_PAINT_EXAMINED_NOTHING.*meetings/su);
});

test("A TRANSPARENT BARE-CONTROL PROBE MAKES THE WHOLE INSTRUMENT A SHELL, so it fails loudly", () => {
  // Na silniku, który nie maluje kontrolek, „nikt tego nie ustawił" i „ktoś
  // ustawił to na przezroczyste" czyta się tak samo — a wtedy przyrząd nie
  // odróżnia wady od `.ghost-button`.
  const failures = classifyControlPaintCensus({
    examined: { library: 210 },
    uaPaints: { "dark/button": "rgba(0, 0, 0, 0)" },
    palettesByTheme: { dark: PALETTE.concat(Array(60).fill("x")) },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /CONTROL_PAINT_PROBE_TRANSPARENT/u);
});

test("two themes resolving the SAME palette means one page was measured twice", () => {
  const palette = PALETTE.concat(Array(60).fill("x"));
  const failures = classifyControlPaintCensus({
    examined: { library: 210 },
    uaPaints: { "dark/button": UA_DARK },
    palettesByTheme: { dark: palette, light: [...palette] },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /CONTROL_PAINT_THEME_DID_NOT_SWITCH/u);
});

test("a palette that collapsed would make EVERY control read as off-palette, so its size has a floor", () => {
  const failures = classifyControlPaintCensus({
    examined: { library: 210 },
    uaPaints: { "dark/button": UA_DARK },
    palettesByTheme: { dark: PALETTE },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /CONTROL_PAINT_PALETTE_TOO_SMALL/u);
  assert.ok(MINIMUM_TOKEN_PALETTE > PALETTE.length);
});

test("THE POSITIVE CONTROL: a witness this census never drew is an instrument failure", () => {
  // Przyrząd, o którym wiadomo wyłącznie, że czerwienieje, jest nieodróżnialny
  // od przyrządu zepsutego.
  const { failures } = classifyControlPaintWitnesses({
    observed: { "button._chip": { states: ["UA_DEFAULT"], count: 3 } },
    witnesses: [{ class: "ghost-button", expect: "TRANSPARENT" }],
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /CONTROL_PAINT_WITNESS_NOT_DRAWN/u);
});

test("a witness judged as a finding is EITHER a regression OR a false positive, and both must stop the run", () => {
  const { failures, lines } = classifyControlPaintWitnesses({
    observed: {
      "button.primary-button": { states: ["UA_DEFAULT"], count: 2 },
    },
    witnesses: [{ class: "primary-button", expect: "IN_PALETTE" }],
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /CONTROL_PAINT_WITNESS_FLAGGED/u);
  assert.match(lines[0], /primary-button/u);
});

test("witness matching is by CLASS TOKEN, because „primary-button” and „secondary-button” share a substring", () => {
  assert.equal(
    signatureCarriesClass(
      "button.secondary-button.compact",
      "secondary-button",
    ),
    true,
  );
  assert.equal(
    signatureCarriesClass("button.secondary-button", "primary-button"),
    false,
  );
  assert.equal(signatureCarriesClass("button.primary-button", "button"), false);
  const { failures } = classifyControlPaintWitnesses({
    observed: {
      "button.secondary-button": { states: ["IN_PALETTE"], count: 4 },
      "button.primary-button": { states: ["IN_PALETTE"], count: 1 },
      "button.ghost-button": { states: ["TRANSPARENT"], count: 3 },
    },
  });
  assert.deepEqual(failures, []);
});

test("the CSS Modules content hash is stripped, or one stylesheet edit would void the whole registry", () => {
  assert.equal(normaliseClassToken("_chip_1kitm_126"), "_chip");
  assert.equal(
    normaliseClassToken("_treeNodeLoose_a1b2c_204"),
    "_treeNodeLoose",
  );
  assert.equal(normaliseClassToken("primary-button"), "primary-button");
});

test("the census covers exactly the group the reset rule names", () => {
  // `styles.css:501-505` wymienia `button, input, textarea, select`. Spis
  // węższy od przyczyny nie umiałby powiedzieć, że pole „Change title" na
  // Źródłach ma tę samą wadę co chip na Organizacjach — a ma.
  assert.deepEqual(CONTROL_PAINT_TAGS, [
    "button",
    "input",
    "textarea",
    "select",
  ]);
});
