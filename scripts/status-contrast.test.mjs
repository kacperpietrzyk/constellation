// BRAMKA KONTRASTU STATUSÓW. Czyta `packages/desktop-ui/src/tokens.css` z dysku
// i MIERZY, zamiast pinować literał.
//
// Skąd się wzięła: `css-token-lint.test.ts` pinowała napis
// `oklch(52% <chroma> <hue>)` dla czterech statusów motywu jasnego i powoływała
// się w komentarzu na „zmierzone co najmniej 4.98:1" — przy czym w drzewie nie
// istniało NIC, czym można by to policzyć. Literał gnije (zmiana wartości = zmiana
// asercji, bez pytania o kontrast) i wymaga zaufania do liczby wpisanej z zewnątrz.
// Pomiar nie gnije: przy zmianie tokenu odpowiada na to samo pytanie od nowa.
//
// Czego ta bramka pilnuje: tekst statusu musi zdawać WCAG AA (4.5:1) na płótnie
// swojego motywu, na powierzchni treści i na SWOIM WŁASNYM podbarwionym tle
// (`--status-*-bg` to status przy 10% krycia — sam w sobie nie jest farbą kryjącą
// i musi zostać złożony, zanim cokolwiek się liczy).
//
// Progu 4.5 NIE WOLNO OBNIŻYĆ, żeby zmieścił się wybrany kolor. To zamieniłoby
// pomiar z powrotem w deklarację.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  WCAG_AA_NORMAL_TEXT,
  compositeOver,
  contrastRatio,
  parseColor,
  toSrgb,
} from "./color-contrast.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
// Ścieżka jest przybita na sztywno CELOWO — do arkusza, który idzie z aplikacją.
// Wejście dające się przestawić z zewnątrz (zmienna środowiskowa, argument)
// pozwoliłoby tej bramce zostać zieloną, mierząc plik, którego nikt nie wysyła.
//
// Że umie być czerwona, sprawdzono 2026-08-06 na kopiach `tokens.css` w brudnopisie
// (siedem złamań, każde z inną przyczyną): usunięty token statusu, przemianowany
// token, status podniesiony do jasności, która nie zdaje AA, `--status-*-bg`
// podmienione na gradient, płótno z alfą. Każde skończyło się porażką NAZYWAJĄCĄ
// przyczynę, żadne cichą zielenią.
const tokensPath = path.join(
  repoRoot,
  "packages",
  "desktop-ui",
  "src",
  "tokens.css",
);
const tokensCss = readFileSync(tokensPath, "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Reguły najwyższego poziomu, po selektorze i ciele. */
const topLevelRules = (css) => {
  const rules = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = -1;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      depth += 1;
      if (depth === 1) bodyStart = index + 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push({
          selector: css.slice(selectorStart, bodyStart - 1).trim(),
          body: css.slice(bodyStart, index),
        });
        selectorStart = index + 1;
      }
    }
  }
  return rules;
};

/** Deklaracje `--token: wartość` z ciała reguły; wartości bywają wielowierszowe. */
const customProperties = (body) => {
  const declarations = [];
  let depth = 0;
  let start = 0;
  const push = (chunk) => {
    const text = chunk.trim();
    const colon = text.indexOf(":");
    if (colon < 0) return;
    const name = text.slice(0, colon).trim();
    if (!name.startsWith("--")) return;
    declarations.push([name, text.slice(colon + 1).trim()]);
  };
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === ";" && depth === 0) {
      push(body.slice(start, index));
      start = index + 1;
    }
  }
  push(body.slice(start));
  return declarations;
};

const rules = topLevelRules(tokensCss);

// Kaskada, nie „blok motywu". Pierwszy blok arkusza ma selektor
// `:root, [data-theme="dark"]`, więc na `<html data-theme="light">` DALEJ się
// stosuje — przez `:root`. Motyw jasny nadpisuje tylko to, co wymienia u siebie.
// Ta bramka odkryła w ten sposób, że `--status-*-bg` motyw jasny DZIEDZICZY
// z bloku ciemnego (patrz raport z pomiarów).
const themeTokens = (themeName) => {
  const map = new Map();
  for (const { selector, body } of rules) {
    const selects = selector
      .split(",")
      .map((part) => part.trim())
      .some(
        (part) => part === ":root" || part === `[data-theme="${themeName}"]`,
      );
    if (!selects) continue;
    for (const [name, value] of customProperties(body)) {
      map.set(name, { value, from: selector.replace(/\s+/g, " ") });
    }
  }
  return map;
};

/** `var(--x)` rozwiązywane w obrębie motywu; brak definicji = GŁOŚNY błąd. */
const resolve = (tokens, name, themeName, seen = new Set()) => {
  const entry = tokens.get(name);
  if (!entry) {
    throw new Error(
      `Motyw „${themeName}" nie definiuje ${name} w ${tokensPath}. ` +
        "Bramka kontrastu nie ma czego zmierzyć — nazwa tokenu zmieniła kształt " +
        "albo token zniknął.",
    );
  }
  if (seen.has(name)) {
    throw new Error(`Cykl var() na ${name} w motywie „${themeName}".`);
  }
  seen.add(name);
  const substituted = entry.value.replace(
    /var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g,
    (_match, referenced) =>
      resolve(tokens, referenced, themeName, seen).literal,
  );
  return { literal: substituted.trim(), from: entry.from };
};

/** Rozwiązany token → kolor. Wszystko, czego nie umiem rozłożyć, ma krzyknąć. */
const colorOf = (tokens, name, themeName) => {
  const { literal, from } = resolve(tokens, name, themeName);
  let color;
  try {
    color = parseColor(literal);
  } catch (cause) {
    throw new Error(
      `Motyw „${themeName}", token ${name} = „${literal}" — nie umiem tego rozłożyć ` +
        `na kolor, więc NIE ZGADUJĘ. (${cause.message})`,
    );
  }
  return { ...color, token: name, literal, from };
};

// Zbiór statusów bierze się z ARKUSZA, nie z listy w tym pliku. Lista wpisana
// tutaj po obu stronach porównania dałaby asercję liczby pomiarów, która nie może
// paść — czyli dokładnie ten rodzaj przyrządu, który to repo już zbierało.
const discoveredStatuses = [
  ...new Set(
    [...tokensCss.matchAll(/^\s*--status-([a-z]+)\s*:/gm)].map(
      (match) => match[1],
    ),
  ),
].sort();

const THEMES = ["dark", "light"];
const BACKGROUND_KINDS = ["canvas", "content", "own-tint"];

const measurements = [];
for (const themeName of THEMES) {
  const tokens = themeTokens(themeName);
  if (tokens.size === 0) {
    throw new Error(
      `Nie znalazłem ŻADNEGO tokenu dla motywu „${themeName}" w ${tokensPath}; ` +
        "bramka przeszłaby na zerze porównań.",
    );
  }
  const canvas = colorOf(tokens, "--surface-canvas", themeName);
  const content = colorOf(tokens, "--surface-content", themeName);
  for (const backdrop of [canvas, content]) {
    if (backdrop.alpha !== 1) {
      throw new Error(
        `Motyw „${themeName}": ${backdrop.token} = „${backdrop.literal}" nie jest ` +
          "kryjące, więc nie ma na czym składać podbarwionych teł. Zgłoś to, nie zgaduj.",
      );
    }
  }
  for (const status of discoveredStatuses) {
    const text = colorOf(tokens, `--status-${status}`, themeName);
    const tint = colorOf(tokens, `--status-${status}-bg`, themeName);
    const backgrounds = {
      canvas: { color: canvas, label: canvas.token, from: canvas.from },
      content: { color: content, label: content.token, from: content.from },
      "own-tint": {
        color: compositeOver(tint, canvas),
        label: `${tint.token} nad ${canvas.token}`,
        from: tint.from,
      },
    };
    for (const kind of BACKGROUND_KINDS) {
      const background = backgrounds[kind];
      measurements.push({
        theme: themeName,
        status,
        kind,
        ratio: contrastRatio(text, background.color),
        textLiteral: text.literal,
        textFrom: text.from,
        backgroundLabel: background.label,
        backgroundFrom: background.from,
        backgroundSrgb: toSrgb(background.color),
      });
    }
  }
}

const format = (value) => value.toFixed(2);

test("wypisuje zmierzone współczynniki, żeby nikt nie musiał ich odtwarzać", () => {
  const lines = measurements.map(
    (row) =>
      `${row.theme.padEnd(5)} ${row.status.padEnd(8)} ${row.kind.padEnd(9)} ` +
      `${format(row.ratio).padStart(6)}:1  ${row.ratio >= WCAG_AA_NORMAL_TEXT ? "AA " : "PONIŻEJ"} ` +
      `tekst ${row.textLiteral} [${row.textFrom}] na ${row.backgroundLabel} [${row.backgroundFrom}]`,
  );
  console.log(
    `\nKontrast statusów, ${path.relative(repoRoot, tokensPath)} (próg ${WCAG_AA_NORMAL_TEXT}:1):\n` +
      lines.join("\n") +
      "\n",
  );
  assert.ok(
    lines.length > 0,
    "Nie ma czego wypisać — pomiar nie zebrał ani jednego wiersza.",
  );
});

test("mierzy KAŻDY status z arkusza w OBU motywach, na trzech tłach", () => {
  // Pusty albo skurczony pomiar to awaria przyrządu, nie wynik. Liczba oczekiwana
  // bierze się ze statusów ZNALEZIONYCH w arkuszu, więc dołożenie piątego statusu
  // bez pomiaru wywali tę asercję zamiast po cichu go pominąć.
  assert.ok(
    discoveredStatuses.length >= 4,
    `W ${tokensPath} znalazłem statusy [${discoveredStatuses.join(", ")}] — ` +
      "to mniej niż cztery, więc wzorzec przestał je łapać.",
  );
  for (const expected of ["error", "info", "success", "warning"]) {
    assert.ok(
      discoveredStatuses.includes(expected),
      `Status --status-${expected} zniknął z arkusza albo przestał być łapany; ` +
        `znalezione: [${discoveredStatuses.join(", ")}].`,
    );
  }
  const expectedCount =
    THEMES.length * discoveredStatuses.length * BACKGROUND_KINDS.length;
  assert.ok(
    expectedCount >= 8,
    "Bramka ma mierzyć co najmniej osiem par; poniżej tego nie pilnuje niczego.",
  );
  assert.equal(
    measurements.length,
    expectedCount,
    `Zebrano ${measurements.length} pomiarów zamiast ${expectedCount}.`,
  );
});

test("tekst statusu zdaje AA na płótnie swojego motywu", () => {
  const failures = measurements
    .filter((row) => row.kind === "canvas" && row.ratio < WCAG_AA_NORMAL_TEXT)
    .map(
      (row) =>
        `${row.theme}/${row.status}: ${format(row.ratio)}:1 (${row.textLiteral} na ${row.backgroundLabel})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Tekst statusu poniżej ${WCAG_AA_NORMAL_TEXT}:1 na płótnie: ${failures.join("; ")}. ` +
      "Progu nie wolno obniżyć — zmień wartość statusu.",
  );
});

test("tekst statusu zdaje AA na powierzchni treści swojego motywu", () => {
  const failures = measurements
    .filter((row) => row.kind === "content" && row.ratio < WCAG_AA_NORMAL_TEXT)
    .map(
      (row) =>
        `${row.theme}/${row.status}: ${format(row.ratio)}:1 (${row.textLiteral} na ${row.backgroundLabel})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Tekst statusu poniżej ${WCAG_AA_NORMAL_TEXT}:1 na powierzchni treści: ${failures.join("; ")}.`,
  );
});

test("tekst statusu zdaje AA na SWOIM podbarwionym tle", () => {
  // To jest para, którą plakietka statusu maluje naprawdę: `--status-*-bg`
  // złożone na płótnie, a na tym tekst `--status-*`.
  const failures = measurements
    .filter((row) => row.kind === "own-tint" && row.ratio < WCAG_AA_NORMAL_TEXT)
    .map(
      (row) =>
        `${row.theme}/${row.status}: ${format(row.ratio)}:1 (${row.textLiteral} na ${row.backgroundLabel})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Tekst statusu poniżej ${WCAG_AA_NORMAL_TEXT}:1 na własnym tle: ${failures.join("; ")}.`,
  );
});

test("podbarwione tło zostaje ZŁOŻONE, a nie potraktowane jak farba kryjąca", () => {
  // Przy 10% krycia tło plakietki leży blisko płótna. Gdyby kompozycja poszła
  // w złej przestrzeni albo alfa została zignorowana, ta para rozjechałaby się
  // z parą „na płótnie" o rzędy, a nie o kilkanaście procent — i wtedy zielona
  // bramka mierzyłaby inny kolor niż ten, który widzi człowiek.
  for (const row of measurements.filter((item) => item.kind === "own-tint")) {
    const onCanvas = measurements.find(
      (item) =>
        item.theme === row.theme &&
        item.status === row.status &&
        item.kind === "canvas",
    );
    assert.ok(
      onCanvas,
      `Brak pary „na płótnie" dla ${row.theme}/${row.status}.`,
    );
    const drift = Math.abs(row.ratio - onCanvas.ratio) / onCanvas.ratio;
    assert.ok(
      drift < 0.5,
      `${row.theme}/${row.status}: tło przy 10% krycia dało ${format(row.ratio)}:1 ` +
        `wobec ${format(onCanvas.ratio)}:1 na samym płótnie (rozjazd ${(drift * 100).toFixed(0)}%). ` +
        "Tak duża różnica znaczy, że kompozycja alfy poszła w złej przestrzeni.",
    );
  }
});
