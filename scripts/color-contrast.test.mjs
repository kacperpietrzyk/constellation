// KONTROLA ZNANEGO WYNIKU dla `color-contrast.mjs`. Ten plik istnieje, zanim
// ktokolwiek zaufa liczbom z bramki statusów: gamma i klipowanie poza gamut mylą
// się SUBTELNIE — wynik dalej wygląda jak kolor, a współczynnik dalej wygląda
// jak współczynnik. Dlatego każda liczba niżej ma źródło poza tym repo
// (definicja WCAG 2.x albo powszechnie publikowana para kontrastowa), a nie
// wynik pierwszego przebiegu tego kodu.
import assert from "node:assert/strict";
import test from "node:test";

import {
  compositeOver,
  contrastRatio,
  oklchToSrgb,
  parseColor,
  parseHex,
  parseOklch,
  parseRgb,
  relativeLuminance,
  srgbToOklch,
} from "./color-contrast.mjs";

const BLACK = "rgb(0, 0, 0)";
const WHITE = "rgb(255, 255, 255)";

test("czarny na białym to dokładnie 21:1 — górna granica skali WCAG", () => {
  assert.ok(
    Math.abs(contrastRatio(BLACK, WHITE) - 21) < 0.01,
    `czarny na białym wyszedł ${contrastRatio(BLACK, WHITE)}, a musi być 21`,
  );
  // Kolejność argumentów nie może zmieniać wyniku: to jest stosunek jaśniejszego
  // do ciemniejszego, nie „tekstu do tła".
  assert.equal(contrastRatio(WHITE, BLACK), contrastRatio(BLACK, WHITE));
});

test("biały na białym to 1:1 — dolna granica skali", () => {
  assert.equal(contrastRatio(WHITE, WHITE), 1);
});

test("#767676 na białym to 4.54:1 — para o wartości publikowanej", () => {
  // Klasyczny próg „najciemniejsza szarość jeszcze zdająca AA na białym"
  // z materiałów WCAG. Wartość pośrednia jest tu kluczowa: 21:1 i 1:1 wychodzą
  // POPRAWNIE nawet przy błędnej krzywej gamma (0 i 1 są jej punktami stałymi),
  // więc same nie dowodzą niczego o linearyzacji.
  const measured = contrastRatio("#767676", WHITE);
  assert.ok(
    Math.abs(measured - 4.54) < 0.01,
    `#767676 na białym wyszedł ${measured.toFixed(4)}, a publikowana wartość to 4.54`,
  );
  // Ta sama para o jeden krok jaśniejsza NIE zdaje AA — bez tego test przeszedłby
  // też przy krzywej, która zawyża wszystko.
  assert.ok(contrastRatio("#777777", WHITE) < 4.5);
});

test("luminancja czerni i bieli zgadza się z definicją WCAG", () => {
  assert.equal(relativeLuminance(BLACK), 0);
  assert.ok(Math.abs(relativeLuminance(WHITE) - 1) < 1e-12);
});

test("parser czyta obie składnie rgb() i obie skale alfy", () => {
  assert.deepEqual(parseRgb("rgb(18, 52, 86)"), {
    space: "srgb",
    r: 18,
    g: 52,
    b: 86,
    alpha: 1,
  });
  assert.deepEqual(parseRgb("rgba(18, 52, 86, 0.5)"), {
    space: "srgb",
    r: 18,
    g: 52,
    b: 86,
    alpha: 0.5,
  });
  // Chromium w nowszych wersjach oddaje właśnie taki kształt.
  assert.deepEqual(parseRgb("rgb(18 52 86 / 0.5)"), {
    space: "srgb",
    r: 18,
    g: 52,
    b: 86,
    alpha: 0.5,
  });
  assert.deepEqual(parseHex("#123456"), {
    space: "srgb",
    r: 18,
    g: 52,
    b: 86,
    alpha: 1,
  });
});

test("parser oklch czyta procent, ułamek i alfę po ukośniku", () => {
  const withPercent = parseOklch("oklch(52% 0.1 150)");
  assert.equal(withPercent.l, 0.52);
  assert.equal(withPercent.c, 0.1);
  assert.equal(withPercent.h, 150);
  assert.equal(withPercent.alpha, 1);

  const withAlpha = parseOklch("oklch(74% 0.1 150 / 0.1)");
  assert.equal(withAlpha.alpha, 0.1);

  // Zapis ułamkowy jasności jest legalnym CSS-em i musi znaczyć to samo.
  assert.equal(parseOklch("oklch(0.52 0.1 150)").l, 0.52);
  assert.equal(parseOklch("oklch(52% 0.1 150deg)").h, 150);

  assert.throws(
    () => parseColor("linear-gradient(180deg, red, blue)"),
    /Nie umiem rozłożyć koloru/u,
    "gradient musi być GŁOŚNYM błędem, a nie po cichu potraktowanym jak kolor",
  );
});

test("biel i czerń w OKLCH trafiają w skrajne wartości sRGB", () => {
  const white = oklchToSrgb(parseOklch("oklch(100% 0 0)"));
  assert.ok(Math.abs(white.r - 255) < 0.01);
  assert.ok(Math.abs(white.g - 255) < 0.01);
  assert.ok(Math.abs(white.b - 255) < 0.01);
  const black = oklchToSrgb(parseOklch("oklch(0% 0 0)"));
  assert.ok(Math.abs(black.r) < 0.01);
});

test("runda oklch → rgb → oklch odtwarza jasność, chromę i odcień", () => {
  const cases = [
    "oklch(52% 0.1 150)",
    "oklch(74% 0.1 150)",
    "oklch(21% 0.006 255)",
    "oklch(62% 0.19 285)",
  ];
  for (const literal of cases) {
    const source = parseOklch(literal);
    const roundTrip = srgbToOklch(oklchToSrgb(source));
    assert.ok(
      Math.abs(roundTrip.l - source.l) < 1e-6,
      `${literal}: jasność ${roundTrip.l} zamiast ${source.l}`,
    );
    assert.ok(
      Math.abs(roundTrip.c - source.c) < 1e-6,
      `${literal}: chroma ${roundTrip.c} zamiast ${source.c}`,
    );
    assert.ok(
      Math.abs(roundTrip.h - source.h) < 1e-4,
      `${literal}: odcień ${roundTrip.h} zamiast ${source.h}`,
    );
  }
});

test("kolor spoza gamutu sRGB PODNOSI FLAGĘ, a nie klipuje po cichu", () => {
  const outside = oklchToSrgb(parseOklch("oklch(70% 0.35 150)"));
  assert.equal(
    outside.outOfGamut,
    true,
    "chroma 0.35 przy 70% leży daleko poza sRGB i musi być zgłoszona",
  );
  assert.ok(outside.gamutExcess > 0.01);
  // Klipowanie DALEJ ma się zdarzyć — flaga jest dodatkiem, nie zamiennikiem.
  for (const channel of [outside.r, outside.g, outside.b]) {
    assert.ok(channel >= 0 && channel <= 255);
  }
});

test("DRUGA STRONA TEJ FLAGI: kolor W gamucie jej nie podnosi", () => {
  // Bez tego przypadku flaga zawsze prawdziwa przeszłaby test wyżej i zamieniła
  // sygnał „poza gamutem" w stały szum.
  for (const literal of [
    "oklch(52% 0.1 150)",
    "oklch(74% 0.1 150)",
    "oklch(98.2% 0.003 255)",
    "oklch(10.2% 0.004 255)",
  ]) {
    const inside = oklchToSrgb(parseOklch(literal));
    assert.equal(
      inside.outOfGamut,
      false,
      `${literal} mieści się w sRGB, a został zgłoszony jako poza gamutem (nadmiar ${inside.gamutExcess})`,
    );
  }
});

test("kompozycja: alfa 0 oddaje tło, alfa 1 oddaje kolor", () => {
  const background = "rgb(250, 250, 250)";
  const transparent = compositeOver(
    { space: "srgb", r: 0, g: 0, b: 0, alpha: 0 },
    background,
  );
  assert.deepEqual(
    [transparent.r, transparent.g, transparent.b],
    [250, 250, 250],
  );

  const opaque = compositeOver(
    { space: "srgb", r: 10, g: 20, b: 30, alpha: 1 },
    background,
  );
  assert.deepEqual([opaque.r, opaque.g, opaque.b], [10, 20, 30]);

  // Połowa drogi ma leżeć w POŁOWIE — mieszanie idzie w zapisie gamma,
  // tak jak składa przeglądarka.
  const half = compositeOver(
    { space: "srgb", r: 0, g: 0, b: 0, alpha: 0.5 },
    background,
  );
  assert.equal(half.r, 125);
  assert.equal(half.alpha, 1);
});

test("kontrast ODMAWIA liczenia na kolorze z alfą", () => {
  // To jest zabezpieczenie przed najcichszym możliwym błędem tej bramki:
  // policzeniem `--status-*-bg` (10% krycia) tak, jakby było farbą kryjącą.
  assert.throws(
    () => contrastRatio("oklch(52% 0.1 150)", "oklch(74% 0.1 150 / 0.1)"),
    /kolorów nieprzezroczystych/u,
  );
  assert.throws(
    () => compositeOver("oklch(52% 0.1 150)", "oklch(74% 0.1 150 / 0.1)"),
    /nieprzezroczyste/u,
  );
});
