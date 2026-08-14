// BRAMKA KONTRASTU. Czyta `packages/desktop-ui/src/tokens.css` z dysku
// i MIERZY, zamiast pinować literał.
//
// Cztery części, każda z własnym uzasadnieniem przy sobie:
//   1. statusy — plakietka na swoim podbarwieniu (próg 4,5);
//   2. KAŻDA rodzina o kształcie „`--X-bg` + `--X-text`" — akcje, pole
//      tekstowe, aktywna nawigacja (próg 4,5);
//   3. KONTRAST NIEBĘDĄCY TEKSTEM (WCAG 1.4.11, próg 3): pierścień ogniska
//      kontra to, na czym siedzi, oraz krawędź aktywnej nawigacji;
//   4. tekst `--text-*` na kryjących powierzchniach czytania (próg 4,5).
//
// Części 3 i 4 powstały, bo części 1–2 razem ZOSTAWIAŁY DZIURY, i to takie,
// przez które dało się przejechać na zielono z realną wadą w drzewie. Nazwa
// testu z części drugiej („każde tło z arkusza…") obiecywała pokrycie, którego
// jej reguła nie miała — jest poprawiona, a jej granica jest teraz wypisywana
// na wyjściu.
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
  WCAG_AA_NON_TEXT,
  WCAG_AA_NORMAL_TEXT,
  compositeOver,
  contrastRatio,
  parseColor,
  toSrgb,
} from "./color-contrast.mjs";
// Kaskada motywów i podstawianie `var()` stoją od 2026-08-07 w `css-tokens.mjs`,
// bo druga bramka kontrastu (`consumer-contrast.test.mjs`, mierząca KONSUMENTÓW
// z arkuszy powierzchni) potrzebuje TEJ SAMEJ odpowiedzi. Przepisane drugi raz,
// milczałyby osobno w każdej z dwóch bramek — a to jest w tym repo nazwana klasa
// defektu. Przeniesienie było czyste: ciała funkcji bez zmian, wyjście tego pliku
// porównane przed i po co do znaku.
import { looksLikeAColor, tokenSheet } from "./css-tokens.mjs";

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

// `themeTokens` odkryło w ten sposób, że `--status-*-bg` motyw jasny DZIEDZICZY
// z bloku ciemnego (patrz raport z pomiarów) — kaskada `:root` + `[data-theme]`
// jest tu istotą, nie szczegółem, i dlatego ma JEDNEGO właściciela.
const { declaredTokenNames, themeTokens, resolve, colorOf } = tokenSheet({
  css: tokensCss,
  sourcePath: tokensPath,
});

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

// ─── CZĘŚĆ DRUGA: TEKST NA WYPEŁNIENIU ──────────────────────────────────────
//
// Skąd się wzięła: Faza 1 przepięła `--action-primary-bg` z białego
// `--neutral-100` na akcent `oklch(64% 0.2 295)`, a `--action-primary-text`
// został prawie biały (`--on-accent`). Kontrast NAPISU na przycisku głównym
// spadł w motywie ciemnym z 17,21:1 do 3,54:1 — i ŻADEN przyrząd tego nie
// zobaczył: ta bramka czytała wyłącznie `--status-*`, a sonda wierności
// wizualnej orzeka o OBECNOŚCI malowania akcentem, nie o czytelności napisu
// na nim. Brakujący przyrząd, nie zły kod.
//
// Reguła stoi na KSZTAŁCIE, nie na liście nazw: rodzinę wyznacza `--X-bg`,
// dla którego arkusz deklaruje też `--X-text`. Dołożenie kolejnej takiej pary
// włącza ją do pomiaru samo, bez dopisywania tu nazwy.
//
// Że ta część umie być czerwona Z RÓŻNYCH POWODÓW i umie być zielona,
// sprawdzono 2026-08-06 na kopiach `tokens.css` w brudnopisie (nigdy na drzewie):
//   * `--action-primary-text` przemianowany → pada asercja rodzin, NAZYWAJĄC
//     rodzinę, która zniknęła (bez tego rodzina wyparowałaby z pomiaru cicho);
//   * dołożone `--action-primary-active` → pada „każda rola ROZPOZNANA";
//   * `--input-bg` podmienione na gradient → pada „daje się rozłożyć na kolory"
//     z nazwą pary, a tabela DALEJ się wypisuje (18 wierszy zamiast 26) —
//     to jest cała różnica między złapaną porażką pary a rzutem, który kasuje
//     plik i zostawia zero wykonanych testów;
//   * usunięte `--nav-active-text` → pada asercja rodzin;
//   * przyciemnione stopnie akcentu pod akcją główną → EXIT=0, 14/14.
//     Bramka, która nie umie zzielenieć, nie jest pomiarem tylko blokadą.

// `declaredTokenNames` (wszystkie nazwy zadeklarowane GDZIEKOLWIEK w arkuszu)
// przychodzi z `css-tokens.mjs` razem z resztą kaskady.

// Role w obrębie rodziny. Z samej nazwy NIE DA SIĘ odgadnąć, czy token maluje
// płaszczyznę, czy kreskę (`--action-secondary-hover` maluje tło,
// `--input-border-hover` obramowanie), więc role są wypisane — ale wypisane
// TOTALNIE: rola, której nie ma na żadnej z trzech list, jest GŁOŚNYM błędem,
// a nie cichym pominięciem. To jest różnica między tą listą a listą dozwolonych:
// dołożenie `--action-primary-active` nie zniknie z pomiaru po cichu, tylko
// wywali bramkę z pytaniem, czym ten token jest.
const FILL_ROLES = ["bg", "hover", "pressed"];
const TEXT_ROLES = ["text", "placeholder"];
// `placeholder` stoi razem z `text`, bo podpowiedź w polu JEST tekstem. WCAG 2.2
// zwalnia z 1.4.3 tylko tekst nieaktywnej kontrolki, czysto dekoracyjny,
// część logotypu oraz tekst na obrazie niosącym inną istotną treść —
// podpowiedź nie jest żadnym z nich, więc próg zostaje 4.5.
const isBorderRole = (role) => role === "border" || role.startsWith("border-");

const suffixesOf = (family) => {
  const prefix = `${family}-`;
  return [...declaredTokenNames]
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length))
    .sort();
};

const BG_SUFFIX = "-bg";
const declaredBackgrounds = [...declaredTokenNames]
  .filter((name) => name.endsWith(BG_SUFFIX))
  .sort();
const familyOfBackground = (name) => name.slice(0, -BG_SUFFIX.length);

// Statusy mają własny kształt (tekst to `--status-X`, nie `--status-X-text`)
// i własne asercje wyżej; tutaj są wyłączone NAZWANYM wzorcem, żeby nie wpaść
// do wiadra „tło bez tekstu" i nie wyglądać na niemierzone.
const isStatusBackground = (name) => /^--status-[a-z]+-bg$/.test(name);

const fillFamilies = declaredBackgrounds
  .filter((name) => !isStatusBackground(name))
  .map(familyOfBackground)
  .filter((family) => declaredTokenNames.has(`${family}-text`))
  .sort();

// Tła, które NIE deklarują tekstu (`--shell-*`, `--panel-*`, `--overlay-bg`…).
// Nie ma czego na nich zmierzyć — ale są WYPISYWANE, więc „nie zmierzone"
// zostaje widoczne zamiast być niewidzialne.
const backgroundsWithoutText = declaredBackgrounds
  .filter((name) => !isStatusBackground(name))
  .filter(
    (name) => !declaredTokenNames.has(`${familyOfBackground(name)}-text`),
  );

const unknownRoles = fillFamilies.flatMap((family) =>
  suffixesOf(family)
    .filter(
      (role) =>
        !FILL_ROLES.includes(role) &&
        !TEXT_ROLES.includes(role) &&
        !isBorderRole(role),
    )
    .map((role) => `${family}-${role}`),
);

const fillsOf = (family) =>
  FILL_ROLES.map((role) => `${family}-${role}`).filter((name) =>
    declaredTokenNames.has(name),
  );
const textsOf = (family) =>
  TEXT_ROLES.map((role) => `${family}-${role}`).filter((name) =>
    declaredTokenNames.has(name),
  );

const fillMeasurements = [];
const fillPairKeys = new Set();
// Para, której nie umiem rozłożyć, NIE zabija modułu — trafia tutaj i wywala
// własny, nazwany test. Rzut na poziomie modułu skasowałby cały plik: zero
// wykonanych testów, zero wypisanej tabeli, a `EXIT=1` z zera testów wygląda
// identycznie jak `EXIT=1` z prawdziwej czerwieni.
const unmeasurablePairs = [];

for (const themeName of THEMES) {
  const tokens = themeTokens(themeName);
  const backdrops = ["--surface-canvas", "--surface-content"].map((name) => {
    const backdrop = colorOf(tokens, name, themeName);
    if (backdrop.alpha !== 1) {
      throw new Error(
        `Motyw „${themeName}": ${backdrop.token} = „${backdrop.literal}" nie jest ` +
          "kryjące, więc nie ma na czym składać wypełnień z alfą. Zgłoś to, nie zgaduj.",
      );
    }
    return backdrop;
  });

  for (const family of fillFamilies) {
    for (const fillName of fillsOf(family)) {
      for (const textName of textsOf(family)) {
        // Klucz pary leci do zbioru PRZED próbą pomiaru — dzięki temu asercja
        // na liczbie par mówi o kształcie arkusza, a nie o tym, ile pomiarów
        // się udało (od tego jest osobny test).
        fillPairKeys.add(`${themeName}|${fillName}|${textName}`);
        try {
          const fill = colorOf(tokens, fillName, themeName);
          const text = colorOf(tokens, textName, themeName);
          if (text.alpha !== 1) {
            throw new Error(
              `${textName} = „${text.literal}" ma alfę ${text.alpha}; tekst z alfą ` +
                "trzeba by złożyć na wypełnieniu, a tego ta bramka nie robi. Zgłoś to.",
            );
          }
          // Wypełnienie kryjące mierzy się raz — podłoże jest bez znaczenia.
          // Wypełnienie z alfą MUSI zostać złożone, i to na każdym podłożu,
          // na którym aplikacja je stawia; potraktowanie go jak farby kryjącej
          // mierzyłoby kolor, którego nikt nie widzi.
          const surfaces =
            fill.alpha === 1
              ? [
                  {
                    color: fill,
                    label: fillName,
                    backdrop: "kryjące",
                    backdropFrom: fill.from,
                  },
                ]
              : backdrops.map((backdrop) => ({
                  color: compositeOver(fill, backdrop),
                  label: `${fillName} nad ${backdrop.token}`,
                  backdrop: backdrop.token,
                  backdropFrom: backdrop.from,
                }));
          for (const surface of surfaces) {
            fillMeasurements.push({
              theme: themeName,
              family,
              fillToken: fillName,
              textToken: textName,
              role: textName.slice(family.length + 1),
              backdrop: surface.backdrop,
              ratio: contrastRatio(text, surface.color),
              fillLiteral: fill.literal,
              fillFrom: fill.from,
              textLiteral: text.literal,
              textFrom: text.from,
              surfaceLabel: surface.label,
              backdropFrom: surface.backdropFrom,
              fillBlocks: fill.blocks,
              textBlocks: text.blocks,
              // Kolor spoza gamutu sRGB jest MIERZONY PO PRZYCIĘCIU — bo to
              // jest kolor, który pokazuje ekran sRGB. Na ekranie szerszym
              // wartość prawdziwa jest inna, więc token jest tu NAZWANY
              // zamiast zniknąć w liczbie.
              clipped: [
                [fillName, toSrgb(fill)],
                [textName, toSrgb(text)],
              ]
                .filter(([, srgb]) => srgb.outOfGamut)
                .map(
                  ([name, srgb]) => `${name} +${srgb.gamutExcess.toFixed(3)}`,
                ),
            });
          }
        } catch (cause) {
          unmeasurablePairs.push(
            `${themeName}: ${fillName} × ${textName} — ${cause.message}`,
          );
        }
      }
    }
  }
}

// Liczba par WYLICZONA z arkusza, niezależnie od pętli pomiarowej.
const expectedFillPairs =
  THEMES.length *
  fillFamilies.reduce(
    (sum, family) => sum + fillsOf(family).length * textsOf(family).length,
    0,
  );

// Selektor bloku skrócony do etykiety, bo pełny („:root, [data-theme="dark"]")
// zjada pół wiersza i przy czterech tokenach na wiersz robi z tabeli prozę.
const blockLabel = (selector) =>
  selector.includes('data-theme="light"') && !selector.includes(":root")
    ? "jasny"
    : "root+ciemny";
const provenance = (blocks) => [...new Set(blocks.map(blockLabel))].join(" → ");

test("wypisuje każdą zmierzoną parę tekst-na-wypełnieniu z prowieniencją", () => {
  const lines = fillMeasurements.map(
    (row) =>
      `${row.theme.padEnd(5)} ${row.fillToken.padEnd(25)} × ${row.textToken.padEnd(22)} ` +
      `${format(row.ratio).padStart(6)}:1  ${row.ratio >= WCAG_AA_NORMAL_TEXT ? "AA     " : "PONIŻEJ"}  ` +
      `${row.textLiteral} na ${row.fillLiteral}` +
      (row.backdrop === "kryjące"
        ? " (kryjące)"
        : ` złożone nad ${row.backdrop}`) +
      `  | tło: ${provenance(row.fillBlocks)}; tekst: ${provenance(row.textBlocks)}` +
      (row.backdrop === "kryjące"
        ? ""
        : `; podłoże: ${blockLabel(row.backdropFrom)}`) +
      (row.clipped.length > 0
        ? `  | POZA GAMUTEM sRGB, mierzone po przycięciu: ${row.clipped.join(", ")}`
        : ""),
  );
  console.log(
    `\nKontrast tekstu na wypełnieniu, ${path.relative(repoRoot, tokensPath)} ` +
      `(próg ${WCAG_AA_NORMAL_TEXT}:1):\n` +
      lines.join("\n") +
      `\n\nRodziny mierzone: ${fillFamilies.join(", ")}` +
      `\nTła BEZ tokenu tekstu (nie ma czego zmierzyć): ` +
      `${backgroundsWithoutText.join(", ") || "brak"}\n`,
  );
  assert.ok(
    lines.length > 0,
    "Nie ma czego wypisać — pomiar wypełnień nie zebrał ani jednego wiersza.",
  );
});

test("każda para tekst-na-wypełnieniu daje się rozłożyć na kolory", () => {
  assert.deepEqual(
    unmeasurablePairs,
    [],
    "Pary, których nie umiem rozłożyć (nie zgaduję): " +
      unmeasurablePairs.join(" | "),
  );
});

test("każda rola w mierzonej rodzinie jest ROZPOZNANA", () => {
  assert.deepEqual(
    unknownRoles,
    [],
    `Tokeny o nieznanej roli w rodzinach [${fillFamilies.join(", ")}]: ` +
      `${unknownRoles.join(", ")}. Dopisz je do FILL_ROLES (malują płaszczyznę), ` +
      "do TEXT_ROLES (są tekstem) albo nazwij je obramowaniem — cicho pominąć ich " +
      "nie wolno, bo tak właśnie znika pomiar.",
  );
});

test("mierzy KAŻDĄ rodzinę o kształcie --X-bg + --X-text, w OBU motywach", () => {
  // Podłogi są NAZWANE, a nie wyliczone z tej samej pętli, która mierzy —
  // inaczej asercja mówiłaby „zmierzyłem tyle, ile zmierzyłem".
  for (const expected of [
    "--action-primary",
    "--action-secondary",
    "--input",
    "--nav-active",
  ]) {
    assert.ok(
      fillFamilies.includes(expected),
      `Rodzina ${expected}-bg / ${expected}-text zniknęła z arkusza albo zmieniła ` +
        `kształt; znalezione: [${fillFamilies.join(", ")}].`,
    );
  }
  assert.ok(
    expectedFillPairs >= 12,
    `Z arkusza wychodzi ${expectedFillPairs} par (tło × tekst × motyw) — mniej niż ` +
      "dwanaście znaczy, że rodziny przestały być łapane.",
  );
  assert.equal(
    fillPairKeys.size,
    expectedFillPairs,
    `Pętla objęła ${fillPairKeys.size} par zamiast ${expectedFillPairs}.`,
  );
  assert.ok(
    fillMeasurements.length >= 20,
    `Zebrano ${fillMeasurements.length} wierszy pomiaru — poniżej dwudziestu bramka ` +
      "nie pilnuje już tego, po co powstała.",
  );
  // Każda para daje co najmniej jeden wiersz (wypełnienie kryjące) i najwyżej
  // tyle, ile jest podłoży (wypełnienie z alfą). Wyjście poza ten przedział
  // znaczy, że rozgałęzienie „kryjące / z alfą" się rozjechało.
  assert.ok(
    fillMeasurements.length >= expectedFillPairs &&
      fillMeasurements.length <= expectedFillPairs * 2,
    `${fillMeasurements.length} wierszy przy ${expectedFillPairs} parach nie mieści się ` +
      "między jednym a dwoma podłożami na parę.",
  );
});

// Tła, które są tłem PRZEZ ROLĘ, a nie przez nazwę: `--surface-*` bez przyrostka
// `-bg`. Podział niżej ich NIE WIDZI (filtruje po przyrostku), a tekst na nich
// stoi naprawdę — tę dziurę zamyka dopiero CZĘŚĆ CZWARTA. Lista jest WYLICZONA
// z arkusza, żeby nie zgniła przy dołożeniu planu.
//
// I OD RAZU ROZDZIELONA NA DWOJE, bo prefiks `--surface-` niesie w tym arkuszu
// dwie różne rzeczy: farbę i DŁUGOŚĆ (`--surface-read` to szerokość kolumny
// prozy). Wypisanie długości pod nagłówkiem „tła" byłoby dokładnie tym
// kłamstwem o zakresie, które ten test właśnie przestaje popełniać. Ta sama
// kolizja prefiksu wraca w CZĘŚCI CZWARTEJ przy `--text-*`.
const surfaceNamesOutsideTheBgSuffix = [...declaredTokenNames]
  .filter((name) => name.startsWith("--surface-"))
  .filter((name) => !name.endsWith(BG_SUFFIX))
  .sort();
// `declaredTokenNames` jest sumą po WSZYSTKICH blokach, więc token zadeklarowany
// wyłącznie w bloku jasnym rzuciłby tu z `resolve` — NA POZIOMIE MODUŁU, czyli
// kasując cały plik: zero testów, zero tabel, a `EXIT=1` z zera testów wygląda
// identycznie jak `EXIT=1` z prawdziwej czerwieni. Dziś takiego tokenu nie ma,
// ale rozstrzyganie tego przez „dziś nie ma" jest dokładnie tą wadą, którą ten
// plik nazywa w dwóch innych miejscach. Nierozwiązane idą do własnego wiadra
// i wywalają NAZWANĄ asercję niżej.
const surfacesUnresolved = [];
const surfacesOutsideTheBgSuffix = [];
const surfaceNamesThatAreNotPaint = [];
for (const name of surfaceNamesOutsideTheBgSuffix) {
  let literal;
  try {
    literal = resolve(themeTokens("dark"), name, "dark").literal;
  } catch (cause) {
    surfacesUnresolved.push(`${name} — ${cause.message}`);
    continue;
  }
  if (looksLikeAColor(literal)) surfacesOutsideTheBgSuffix.push(name);
  else surfaceNamesThatAreNotPaint.push(name);
}

test("każdy token Z PRZYROSTKIEM -bg wpada do DOKŁADNIE jednego wiadra (a to NIE jest całe tło aplikacji)", () => {
  // NAZWA MÓWI ZAKRES, BO POPRZEDNIA GO ZAWYŻAŁA. Test nazywał się „każde tło
  // z arkusza…" i brzmiał jak pokrycie wszystkich teł — a filtruje po
  // PRZYROSTKU `-bg`, więc `--surface-content`, `--surface-selected`,
  // `--surface-hover`, `--surface-raised` i reszta planów w ogóle do podziału
  // nie wchodzą. Adwersarz udowodnił to URUCHOMIENIEM: złamanie
  // `--text-secondary` na `--neutral-700` daje 1,77:1 na `--surface-content`,
  // a ta bramka wracała EXIT=0, 14/14. Nazwa obiecywała pokrycie, którego
  // reguła nie miała — znana z tego repo klasa kłamiącego przyrządu.
  //
  // CZEGO TEN TEST NIE MIERZY (wypisane też na wyjściu, nie tylko tutaj):
  //   * teł nazwanych rolą, nie przyrostkiem — `--surface-*` bez `-bg`;
  //   * jakiegokolwiek tekstu spoza rodzin `--X-bg` + `--X-text` — w tym
  //     całej rodziny `--text-*` na powierzchniach czytania.
  // Drugą dziurę zamyka CZĘŚĆ CZWARTA tego pliku; pierwsza zostaje otwarta
  // dla planów, których żaden arkusz dziś nie maluje.
  const measured = fillFamilies.map((family) => `${family}${BG_SUFFIX}`);
  const status = declaredBackgrounds.filter(isStatusBackground);
  const buckets = [...measured, ...status, ...backgroundsWithoutText].sort();
  console.log(
    `\nPodział dotyczy WYŁĄCZNIE ${declaredBackgrounds.length} tokenów z przyrostkiem ` +
      `${BG_SUFFIX}. POZA nim stoją tła nazwane rolą: ` +
      `${surfacesOutsideTheBgSuffix.join(", ")} — tekst na nich mierzy dopiero ` +
      "CZĘŚĆ CZWARTA (powierzchnie czytania), i tylko na kryjących." +
      `\nPod prefiksem --surface- stoją też tokeny, które NIE SĄ farbą: ` +
      `${surfaceNamesThatAreNotPaint.join(", ") || "brak"}.\n`,
  );
  assert.deepEqual(
    buckets,
    [...declaredBackgrounds].sort(),
    `Podział tokenów ${BG_SUFFIX} się nie domyka. Mierzone: [${measured.join(", ")}]; ` +
      `statusowe: [${status.join(", ")}]; bez tekstu: [${backgroundsWithoutText.join(", ")}].`,
  );
  assert.deepEqual(
    surfacesUnresolved,
    [],
    "Tokeny --surface-*, których nie umiem rozwiązać w motywie ciemnym (a więc nie " +
      `umiem powiedzieć, czy są farbą): ${surfacesUnresolved.join(" | ")}`,
  );
  assert.ok(
    surfacesOutsideTheBgSuffix.length > 0,
    "Nie znalazłem ANI JEDNEGO tła nazwanego rolą — wzorzec `--surface-*` przestał " +
      "łapać, więc zdanie o zakresie tego testu przestało być sprawdzalne.",
  );
  assert.equal(
    new Set(buckets).size,
    buckets.length,
    "To samo tło trafiło do dwóch wiader.",
  );
  assert.ok(
    status.length >= 4,
    `Wiadro statusów ma ${status.length} teł zamiast co najmniej czterech.`,
  );
});

test("tekst na wypełnieniu zdaje AA", () => {
  const failures = fillMeasurements
    .filter((row) => row.role === "text" && row.ratio < WCAG_AA_NORMAL_TEXT)
    .map(
      (row) =>
        `${row.theme}/${row.fillToken}×${row.textToken}: ${format(row.ratio)}:1 ` +
        `(${row.textLiteral} na ${row.surfaceLabel} = ${row.fillLiteral})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Tekst poniżej ${WCAG_AA_NORMAL_TEXT}:1 na swoim wypełnieniu: ${failures.join("; ")}. ` +
      "Progu nie wolno obniżyć — zmienia się WARTOŚĆ tokenu (tło albo tekst).",
  );
});

test("podpowiedź w polu zdaje AA na tle pola", () => {
  // Osobny test, żeby porażka podpowiedzi nie chowała się za porażką akcji
  // głównej i odwrotnie — dwie różne przyczyny, dwa różne czerwone wiersze.
  const failures = fillMeasurements
    .filter(
      (row) => row.role === "placeholder" && row.ratio < WCAG_AA_NORMAL_TEXT,
    )
    .map(
      (row) =>
        `${row.theme}/${row.fillToken}×${row.textToken}: ${format(row.ratio)}:1 ` +
        `(${row.textLiteral} na ${row.surfaceLabel} = ${row.fillLiteral})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Podpowiedź poniżej ${WCAG_AA_NORMAL_TEXT}:1: ${failures.join("; ")}. ` +
      "Podpowiedź jest tekstem — WCAG 1.4.3 nie zwalnia jej z progu.",
  );
});

test("wypełnienie z alfą zostaje ZŁOŻONE, a nie potraktowane jak farba kryjąca", () => {
  // Wypełnień z alfą jest dziś dziesięć na motyw (`--surface-raised`,
  // `--surface-hover`, `--surface-sunken`, `--accent-quieter`). Gdyby ta
  // gałąź obumarła, każde z nich zostałoby zmierzone jako farba kryjąca —
  // czyli w kolorze, którego nikt nie widzi. `contrastRatio` odmawia liczenia
  // na kolorze z alfą, więc awaria byłaby głośna; ta asercja pilnuje drugiego
  // wariantu: że gałąź kompozycji w ogóle się WYKONAŁA.
  const composited = fillMeasurements.filter(
    (row) => row.backdrop !== "kryjące",
  );
  assert.ok(
    composited.length >= 8,
    `Tylko ${composited.length} wierszy powstało przez złożenie alfy; arkusz ma ` +
      "wypełnienia z alfą w obu motywach, więc ta liczba nie może spaść tak nisko.",
  );
  for (const row of composited) {
    assert.equal(
      row.backdrop === "--surface-canvas" ||
        row.backdrop === "--surface-content",
      true,
      `${row.theme}/${row.fillToken}: złożono na nieznanym podłożu „${row.backdrop}".`,
    );
  }
});

// ─── CZĘŚĆ TRZECIA: KONTRAST NIEBĘDĄCY TEKSTEM (WCAG 1.4.11, próg 3:1) ──────
//
// Skąd się wzięła: Faza 1 przepięła `--action-primary-bg` na akcent, a pierścień
// ogniska niesie krawędź w kolorze `var(--accent)` — czyli W MOTYWIE JASNYM
// DOKŁADNIE TEN SAM LITERAŁ, co wypełnienie przycisku głównego. Zmierzone niżej
// przez tę część: krawędź pierścienia kontra to wypełnienie to 1,00:1 w jasnym
// i 1,47:1 w ciemnym. Wskaźnik ogniska na przycisku głównym NIE ISTNIEJE,
// a motyw jasny jest osiągalny BEZ ŻADNEGO KLIKNIĘCIA (`main.tsx` czyta
// `prefers-color-scheme`).
//
// Żaden dotychczasowy przyrząd tego nie widział, i to nie przez niedbałość,
// tylko przez ZADAWANE PYTANIE: sonda wierności pyta, CZY pierścień niesie
// akcent (i słusznie mówi TAK), część druga tego pliku pyta o TEKST na
// wypełnieniu. Nikt nie pytał, czy pierścień jest widoczny NA TYM, NA CZYM
// SIEDZI. Brakujący przyrząd, nie zły kod.
//
// REGUŁA: pierścień jest wielowarstwowy i to jest POPRAWNE — wystarczy, żeby
// na danym tle NIÓSŁ GO PRZYNAJMNIEJ JEDNA warstwa rysująca linię. Tabela
// wypisuje, KTÓRA warstwa niesie na którym tle.
//
// GDZIE TA REGUŁA JEST ŁAGODNA — powiedziane wprost, żeby nikt się na tym nie
// oparł: „przynajmniej jedna warstwa" nad iloczynem kartezjańskim pobłażyłaby
// pierścieniowi, w którym na wypełnieniu akcentu niesie WYŁĄCZNIE warstwa
// `inset`, a zewnętrzna obwódka — ta, którą człowiek czyta jako ognisko przy
// krawędzi kształtu — jest niewidzialna. Na dzisiejszym drzewie to nie zmienia
// odpowiedzi (na akcencie nie niesie ŻADNA warstwa), ale reguła jest słabsza
// niż fizyka i tak ma zostać zapisana.
const RING_TOKEN = "--focus-ring";

/** Części wartości CSS rozdzielone przecinkiem POZA nawiasami. */
const topLevelParts = (value) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
};

// Długości cienia z przodu, kolor na końcu. Składnia CSS pozwala też postawić
// kolor PRZED długościami — ten arkusz tego nie robi, a zgadywanie, która
// kolejność zaszła, byłoby dokładnie tym, czego ta bramka nie robi. Kształt
// spoza wzorca kończy się NAZWANYM błędem.
const SHADOW_GEOMETRY =
  /^((?:-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em)?\s+)*-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em)?)\s+(\S[\s\S]*)$/;

/**
 * Lista cieni → warstwy z rozpoznaniem „rysuje LINIĘ czy POŚWIATĘ".
 * Linia to warstwa o promieniu rozmycia 0, która cokolwiek maluje poza samym
 * pudełkiem (niezerowy rozrost albo niezerowe przesunięcie). Poświata (rozmycie
 * > 0) jest z pomiaru WYŁĄCZONA i nazwana, bo jej kontrast na krawędzi nie jest
 * kontrastem linii — a policzenie jej razem z liniami zawyżyłoby wynik.
 */
const shadowLayersOf = (tokens, name, themeName) => {
  const { literal, blocks } = resolve(tokens, name, themeName);
  return topLevelParts(literal).map((part, index) => {
    const text = part.trim().replace(/\s+/g, " ");
    const inset = /(?:^|\s)inset(?:\s|$)/.test(text);
    const geometry = text.replace(/(?:^|\s)inset(?:\s|$)/, " ").trim();
    const match = SHADOW_GEOMETRY.exec(geometry);
    if (!match) {
      throw new Error(
        `Motyw „${themeName}", ${name} warstwa ${index} = „${text}" — nie umiem ` +
          "rozłożyć tego na długości i kolor (kolor przed długościami też nie jest " +
          "obsługiwany). NIE ZGADUJĘ, którą warstwą to jest.",
      );
    }
    const lengths = match[1].split(/\s+/);
    if (lengths.length < 2 || lengths.length > 4) {
      throw new Error(
        `Motyw „${themeName}", ${name} warstwa ${index} ma ${lengths.length} długości ` +
          `(${lengths.join(" ")}) zamiast od dwóch do czterech.`,
      );
    }
    const numbers = lengths.map((length) => Number.parseFloat(length));
    const blur = numbers.length >= 3 ? numbers[2] : 0;
    const spread = numbers.length >= 4 ? numbers[3] : 0;
    return {
      index,
      inset,
      blur,
      spread,
      geometry: lengths.join(" "),
      colorLiteral: match[2],
      color: parseColor(match[2]),
      drawsLine:
        blur === 0 && (spread !== 0 || numbers[0] !== 0 || numbers[1] !== 0),
      blocks,
    };
  });
};

// Wypełnienia, na których pierścień może usiąść. WYPROWADZONE Z KSZTAŁTU:
// każda rola malująca płaszczyznę w rodzinach rozpoznanych w części drugiej
// (`--action-primary-bg/-hover/-pressed`, `--action-secondary-bg/-hover`,
// `--input-bg`, `--nav-active-bg`) plus kryjące powierzchnie, na których
// kontrolka po prostu stoi. Dołożenie `--action-primary-active` wejdzie tu samo.
const READING_SURFACES = [
  "--surface-canvas",
  "--surface-content",
  "--surface-elevated",
];
const ringFillTokens = [
  ...new Set([...fillFamilies.flatMap(fillsOf), ...READING_SURFACES]),
].sort();

const ringLayers = new Map();
const ringMeasurements = [];
const ringSetupFailures = [];
const ringUnmeasurable = [];
// Ile wypełnień (po złożeniu) weszło do pomiaru W KAŻDYM MOTYWIE — liczone
// osobno per motyw, bo motywy nie muszą mieć tyle samo wypełnień z alfą
// (`--surface-raised` jest z alfą w obu, ale nic tego nie gwarantuje).
// Suma iloczynów per motyw jest jedyną liczbą, która nie kłamie przy rozjeździe.
const ringSurfaceCount = new Map();

for (const themeName of THEMES) {
  const tokens = themeTokens(themeName);
  let layers;
  try {
    layers = shadowLayersOf(tokens, RING_TOKEN, themeName);
    ringLayers.set(themeName, layers);
  } catch (cause) {
    // Rzut na poziomie modułu skasowałby CAŁY plik — zero testów, zero tabel,
    // a `EXIT=1` z zera testów wygląda identycznie jak `EXIT=1` z czerwieni.
    ringSetupFailures.push(`${themeName}: ${RING_TOKEN} — ${cause.message}`);
    continue;
  }
  const lineLayers = layers.filter((layer) => layer.drawsLine);

  const backdrops = ["--surface-canvas", "--surface-content"].map((name) =>
    colorOf(tokens, name, themeName),
  );

  for (const fillName of ringFillTokens) {
    let surfaces;
    try {
      const fill = colorOf(tokens, fillName, themeName);
      surfaces =
        fill.alpha === 1
          ? [{ color: fill, label: fillName, blocks: fill.blocks }]
          : backdrops.map((backdrop) => ({
              color: compositeOver(fill, backdrop),
              label: `${fillName} nad ${backdrop.token}`,
              blocks: [...fill.blocks, ...backdrop.blocks],
            }));
    } catch (cause) {
      ringUnmeasurable.push(`${themeName}: ${fillName} — ${cause.message}`);
      continue;
    }
    for (const surface of surfaces) {
      ringSurfaceCount.set(
        themeName,
        (ringSurfaceCount.get(themeName) ?? 0) + 1,
      );
      for (const layer of lineLayers) {
        // Warstwa z alfą siada NA TYM WŁAŚNIE wypełnieniu, więc składa się
        // na nim — a potem porównuje z nim. Potraktowanie jej jak farby
        // kryjącej mierzyłoby kolor, którego nikt nie widzi.
        const painted =
          layer.color.alpha === 1
            ? layer.color
            : compositeOver(layer.color, surface.color);
        ringMeasurements.push({
          theme: themeName,
          layerIndex: layer.index,
          layerLabel: `w${layer.index}${layer.inset ? " inset" : ""}`,
          layerLiteral: layer.colorLiteral,
          surfaceLabel: surface.label,
          surfaceToken: fillName,
          ratio: contrastRatio(painted, surface.color),
          surfaceBlocks: surface.blocks,
          // Prowieniencja WARSTWY, nie tylko wypełnienia. To jest ta połowa,
          // która niesie dowód: kolizja w motywie jasnym bierze się stąd, że
          // `--accent` jest remapowany w bloku jasnym, A `--focus-ring` jest
          // w tym bloku zadeklarowany PONOWNIE. Ślad samego wypełnienia nie
          // powiedziałby o tym nic.
          layerBlocks: layer.blocks,
        });
      }
    }
  }
}

const format3 = (value) => value.toFixed(3);

// Grupowanie po (motyw, wypełnienie): która warstwa niesie, i czy niesie ktoś.
const ringCarriers = [];
for (const row of ringMeasurements) {
  const key = `${row.theme}|${row.surfaceLabel}`;
  let entry = ringCarriers.find((item) => item.key === key);
  if (!entry) {
    entry = {
      key,
      theme: row.theme,
      surfaceLabel: row.surfaceLabel,
      best: null,
      rows: [],
    };
    ringCarriers.push(entry);
  }
  entry.rows.push(row);
  if (entry.best === null || row.ratio > entry.best.ratio) entry.best = row;
}

test("wypisuje warstwy pierścienia ogniska z rozpoznaniem linia/poświata", () => {
  const lines = [];
  for (const themeName of THEMES) {
    const layers = ringLayers.get(themeName) ?? [];
    for (const layer of layers) {
      lines.push(
        `${themeName.padEnd(5)} w${layer.index}${layer.inset ? " inset" : "      "} ` +
          `rozmycie ${String(layer.blur).padStart(5)} rozrost ${String(layer.spread).padStart(6)}  ` +
          `${layer.drawsLine ? "LINIA    " : "poświata "} ${layer.colorLiteral}`,
      );
    }
  }
  console.log(
    `\nWarstwy ${RING_TOKEN} (mierzone są WYŁĄCZNIE linie; poświata nie jest krawędzią):\n` +
      lines.join("\n") +
      "\n",
  );
  assert.deepEqual(
    ringSetupFailures,
    [],
    `Nie umiem rozłożyć ${RING_TOKEN} na warstwy: ${ringSetupFailures.join(" | ")}`,
  );
  for (const themeName of THEMES) {
    const layers = ringLayers.get(themeName) ?? [];
    assert.ok(
      layers.filter((layer) => layer.drawsLine).length >= 1,
      `Motyw „${themeName}": ${RING_TOKEN} nie ma ANI JEDNEJ warstwy rysującej linię ` +
        `(warstw w ogóle: ${layers.length}). Albo pierścień przestał być pierścieniem, ` +
        "albo rozpoznanie linii przestało działać — jedno i drugie kasuje ten pomiar.",
    );
  }
});

test("wypisuje każdą parę warstwa-pierścienia × wypełnienie z prowieniencją", () => {
  const lines = ringCarriers.map((entry) => {
    const cells = entry.rows
      .map((row) => `${row.layerLabel}=${format3(row.ratio)}`)
      .join("  ");
    const carries = entry.best !== null && entry.best.ratio >= WCAG_AA_NON_TEXT;
    return (
      `${entry.theme.padEnd(5)} ${entry.surfaceLabel.padEnd(46)} ${cells.padEnd(40)} ` +
      `${carries ? `NIESIE ${entry.best.layerLabel}` : "NIE NIESIE NIKT"}` +
      `  | wypełnienie: ${provenance(entry.rows[0].surfaceBlocks)}` +
      `; pierścień: ${provenance(entry.rows[0].layerBlocks)}`
    );
  });
  console.log(
    `\nPierścień ogniska kontra wypełnienie, ${path.relative(repoRoot, tokensPath)} ` +
      `(WCAG 1.4.11, próg ${WCAG_AA_NON_TEXT}:1, trzy miejsca po przecinku, bo ` +
      "wiersze siadają tuż pod progiem):\n" +
      lines.join("\n") +
      `\n\nWypełnienia w pomiarze: ${ringFillTokens.join(", ")}\n`,
  );
  assert.ok(
    lines.length > 0,
    "Nie ma czego wypisać — pomiar pierścienia nie zebrał ani jednego wiersza.",
  );
});

test("każde wypełnienie pod pierścieniem daje się rozłożyć na kolory", () => {
  assert.deepEqual(
    ringUnmeasurable,
    [],
    "Wypełnienia, których nie umiem rozłożyć (nie zgaduję): " +
      ringUnmeasurable.join(" | "),
  );
});

test("mierzy KAŻDĄ linię pierścienia na KAŻDYM wypełnieniu, w OBU motywach", () => {
  for (const expected of [
    "--action-primary-bg",
    "--action-primary-hover",
    "--action-primary-pressed",
    "--action-secondary-bg",
    "--input-bg",
    "--surface-canvas",
    "--surface-content",
    "--surface-elevated",
  ]) {
    assert.ok(
      ringFillTokens.includes(expected),
      `Wypełnienie ${expected} wypadło z pomiaru pierścienia; zebrane: ` +
        `[${ringFillTokens.join(", ")}].`,
    );
  }
  // Liczba wierszy jest SUMĄ ILOCZYNÓW per motyw, policzoną poza pętlą
  // mierzącą — asercja nie mówi „zmierzyłem tyle, ile zmierzyłem".
  const perTheme = THEMES.map((themeName) => ({
    theme: themeName,
    surfaces: ringSurfaceCount.get(themeName) ?? 0,
    lines: (ringLayers.get(themeName) ?? []).filter((layer) => layer.drawsLine)
      .length,
  }));
  const totalSurfaces = perTheme.reduce((sum, item) => sum + item.surfaces, 0);
  const expectedRows = perTheme.reduce(
    (sum, item) => sum + item.surfaces * item.lines,
    0,
  );
  assert.ok(
    totalSurfaces >= 20,
    `Zebrałem ${totalSurfaces} wypełnień (po złożeniu, oba motywy) — poniżej ` +
      "dwudziestu ta bramka przestaje pytać o to, po co powstała.",
  );
  assert.ok(
    expectedRows >= 60,
    `Z arkusza wychodzi ${expectedRows} wierszy (wypełnienia × linie pierścienia, ` +
      "per motyw) — za mało, żeby iloczyn w ogóle coś pilnował.",
  );
  assert.equal(
    ringMeasurements.length,
    expectedRows,
    `${ringMeasurements.length} wierszy zamiast ${expectedRows} wyliczonych z ` +
      `${perTheme.map((item) => `${item.theme}: ${item.surfaces}×${item.lines}`).join(", ")}.`,
  );
});

test("pierścień ogniska jest widoczny NA TYM, NA CZYM SIEDZI (WCAG 1.4.11)", () => {
  const failures = ringCarriers
    .filter(
      (entry) => entry.best === null || entry.best.ratio < WCAG_AA_NON_TEXT,
    )
    .map(
      (entry) =>
        `${entry.theme}/${entry.surfaceLabel}: najlepsza warstwa ${entry.best.layerLabel} ` +
        `= ${format3(entry.best.ratio)}:1 (${entry.best.layerLiteral})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Wypełnienia, na których ŻADNA warstwa pierścienia nie zdaje ${WCAG_AA_NON_TEXT}:1: ` +
      `${failures.join("; ")}. Progu nie wolno obniżyć — zmienia się WARTOŚĆ warstwy ` +
      "pierścienia albo wartość wypełnienia.",
  );
});

// ─── KRAWĘDŹ STANU BIEŻĄCEGO ───────────────────────────────────────────────
//
// `--nav-active-border` niesie STAN „to jest bieżące", a stan kontrolki jest
// wymieniony w 1.4.11 wprost. Krawędź siada na planie okna albo szyny
// (`--surface-window`, `--surface-sidebar`) i graniczy też z własnym
// podbarwieniem `--nav-active-bg`. Mierzone są wszystkie trzy sąsiedztwa.
//
// NAZWA RODZINY JEST SZERSZA NIŻ JEJ DZISIEJSI KONSUMENCI, i tak zostaje.
// Do Fazy C token malował obwódkę aktywnej pozycji nawigacji — ta wzięła szynę
// prototypu (`v3/app.css:222-226`) i nie deklaruje już `border-color`. Zostają
// dwaj konsumenci, oba tym samym stanem: wynik wyszukiwania pod kursorem
// klawiatury i otwarta przestrzeń robocza. Pomiar jest o WARTOŚCI na tle, nie
// o kształcie, więc wiąże ich tak samo — i wiąże też szynę, która wypełnia się
// tą samą wartością bez alfy. Nazwy tokenu ten lot NIE zmienia: przemianowanie
// rodziny `--nav-active-*` ruszyłoby `--nav-active-bg`, którego nawigacja dalej
// używa, i rozjechałoby trzy przeloty bramki układu czytające go po nazwie.
const navMeasurements = [];
const navUnmeasurable = [];
const NAV_BASES = ["--surface-window", "--surface-sidebar"];

for (const themeName of THEMES) {
  const tokens = themeTokens(themeName);
  for (const baseName of NAV_BASES) {
    try {
      const base = colorOf(tokens, baseName, themeName);
      if (base.alpha !== 1) {
        throw new Error(
          `${baseName} = „${base.literal}" nie jest kryjące, więc nie ma na czym ` +
            "składać krawędzi. Zgłoś to, nie zgaduj.",
        );
      }
      const border = colorOf(tokens, "--nav-active-border", themeName);
      const tintToken = colorOf(tokens, "--nav-active-bg", themeName);
      const tint =
        tintToken.alpha === 1 ? tintToken : compositeOver(tintToken, base);
      for (const [label, neighbour] of [
        [baseName, base],
        [`--nav-active-bg nad ${baseName}`, tint],
      ]) {
        const painted =
          border.alpha === 1 ? border : compositeOver(border, neighbour);
        navMeasurements.push({
          theme: themeName,
          neighbourLabel: label,
          ratio: contrastRatio(painted, neighbour),
          borderLiteral: border.literal,
          blocks: [...border.blocks, ...base.blocks],
        });
      }
    } catch (cause) {
      navUnmeasurable.push(
        `${themeName}: --nav-active-border × ${baseName} — ${cause.message}`,
      );
    }
  }
}

test("wypisuje krawędź aktywnej nawigacji przy każdym sąsiedztwie", () => {
  const lines = navMeasurements.map(
    (row) =>
      `${row.theme.padEnd(5)} krawędź kontra ${row.neighbourLabel.padEnd(40)} ` +
      `${format3(row.ratio).padStart(7)}:1  ` +
      `${row.ratio >= WCAG_AA_NON_TEXT ? "ZDAJE " : "PONIŻEJ"}  ${row.borderLiteral}` +
      `  | ${provenance(row.blocks)}`,
  );
  console.log(
    `\nKrawędź aktywnej nawigacji (WCAG 1.4.11, próg ${WCAG_AA_NON_TEXT}:1):\n` +
      lines.join("\n") +
      "\n",
  );
  assert.deepEqual(
    navUnmeasurable,
    [],
    "Sąsiedztwa krawędzi nawigacji, których nie umiem rozłożyć: " +
      navUnmeasurable.join(" | "),
  );
  assert.equal(
    navMeasurements.length,
    THEMES.length * NAV_BASES.length * 2,
    `Zebrano ${navMeasurements.length} sąsiedztw zamiast ` +
      `${THEMES.length * NAV_BASES.length * 2} (dwa plany razy dwa sąsiedztwa razy dwa motywy).`,
  );
});

test("krawędź aktywnej nawigacji jest widoczna na swoim planie (WCAG 1.4.11)", () => {
  const failures = navMeasurements
    .filter((row) => row.ratio < WCAG_AA_NON_TEXT)
    .map(
      (row) =>
        `${row.theme}/${row.neighbourLabel}: ${format3(row.ratio)}:1 (${row.borderLiteral})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Krawędź aktywnej pozycji poniżej ${WCAG_AA_NON_TEXT}:1: ${failures.join("; ")}. ` +
      "Stan kontrolki jest wymieniony w 1.4.11 wprost — progu nie wolno obniżyć.",
  );
});

// ─── POZOSTAŁE PARY „KRAWĘDŹ RODZINY KONTRA WŁASNE TŁO" ────────────────────
//
// Znalezione PO KSZTAŁCIE: każdy token `--X-border` albo `--X-border-<coś>`,
// dla którego arkusz deklaruje też `--X-bg`. Te pary są MIERZONE I WYPISANE,
// ale NIE SĄ ASERTOWANE progiem 3:1 — i to jest decyzja, którą trzeba nazwać,
// a nie przemilczeć:
//
//   * 1.4.11 wymaga 3:1 od informacji POTRZEBNEJ, żeby rozpoznać kontrolkę
//     i jej stan. Włos wokół panelu czytania czy warstwy podniesionej nie
//     jest kontrolką — panel nie jest komponentem interfejsu w rozumieniu
//     tego kryterium.
//   * Dla pola tekstowego i przycisku wtórnego pytanie jest ŻYWE, ale
//     odpowiedzi NIE DA SIĘ wyprowadzić z samych tokenów: komponent wolno
//     rozpoznać po CZYMKOLWIEK widocznym, więc równie dobrze może go nieść
//     samo wypełnienie. Dlatego obok każdej pary stoi druga liczba —
//     wypełnienie kontra powierzchnia, na której leży. Co z tego wyszło,
//     stoi w raporcie; asercję postawić może dopiero człowiek, który
//     zdecyduje, czy pole ma się odklejać włosem, czy wypełnieniem.
//   * Postawienie tu 3:1 na wszystkim uczyniłoby tę bramkę BLOKADĄ nie do
//     zdjęcia bez grubych, piętrzonych kadrów — czyli bez złamania
//     ograniczenia z 2026-07-12, na które powołuje się sam `tokens.css`.
//
// Żeby ta łagodność nie stała się cichą dziurą: zbiór rodzin NIE asertowanych
// jest ZAMKNIĘTY i sprawdzany. Nowa rodzina `--X-border` + `--X-bg` wywali
// asercję z własną nazwą, zamiast po cichu dołączyć do zwolnionych.
const BORDER_FAMILY = /^(--.+)-border(?:-[a-z0-9-]+)?$/;
const borderPairNames = [...declaredTokenNames]
  .map((name) => ({ name, match: BORDER_FAMILY.exec(name) }))
  .filter((entry) => entry.match !== null)
  .map((entry) => ({ name: entry.name, family: entry.match[1] }))
  .filter((entry) => declaredTokenNames.has(`${entry.family}${BG_SUFFIX}`))
  .sort((left, right) => left.name.localeCompare(right.name));

const borderMeasurements = [];
const borderUnmeasurableFamilies = new Set();
const borderUnmeasurable = [];

for (const themeName of THEMES) {
  const tokens = themeTokens(themeName);
  const backdrop = colorOf(tokens, "--surface-canvas", themeName);
  for (const { name, family } of borderPairNames) {
    try {
      const fillToken = colorOf(tokens, `${family}${BG_SUFFIX}`, themeName);
      const fill =
        fillToken.alpha === 1 ? fillToken : compositeOver(fillToken, backdrop);
      const border = colorOf(tokens, name, themeName);
      const painted = border.alpha === 1 ? border : compositeOver(border, fill);
      borderMeasurements.push({
        theme: themeName,
        borderToken: name,
        fillToken: `${family}${BG_SUFFIX}`,
        ratio: contrastRatio(painted, fill),
        // Druga liczba: czy samo wypełnienie odkleja kontrolkę od podłoża.
        fillAgainstBackdrop: contrastRatio(fill, backdrop),
        borderLiteral: border.literal,
      });
    } catch (cause) {
      borderUnmeasurableFamilies.add(family);
      borderUnmeasurable.push(`${themeName}: ${name} — ${cause.message}`);
    }
  }
}

test("wypisuje pary krawędź-rodziny kontra własne tło (mierzone, NIE asertowane)", () => {
  const lines = borderMeasurements.map(
    (row) =>
      `${row.theme.padEnd(5)} ${row.borderToken.padEnd(26)} kontra ${row.fillToken.padEnd(24)} ` +
      `${format3(row.ratio).padStart(7)}:1  ` +
      `${row.ratio >= WCAG_AA_NON_TEXT ? "zdaje  " : "poniżej"}  | samo wypełnienie kontra ` +
      `--surface-canvas: ${format3(row.fillAgainstBackdrop)}:1`,
  );
  console.log(
    `\nKrawędzie rodzin kontra własne tło — MIERZONE I WYPISANE, NIE ASERTOWANE ` +
      `(dlaczego: nota nad tą sekcją; próg odniesienia ${WCAG_AA_NON_TEXT}:1):\n` +
      lines.join("\n") +
      `\n\nRodziny bez pary: ${[...declaredTokenNames]
        .filter((name) => BORDER_FAMILY.test(name))
        .filter(
          (name) =>
            !declaredTokenNames.has(
              `${BORDER_FAMILY.exec(name)[1]}${BG_SUFFIX}`,
            ),
        )
        .sort()
        .join(", ")}\n`,
  );
  assert.ok(
    borderPairNames.length >= 7,
    `Znalazłem ${borderPairNames.length} par --X-border × --X-bg — mniej niż siedem ` +
      "znaczy, że wzorzec rodziny przestał łapać.",
  );
});

test("rodziny krawędzi NIE DO ROZŁOŻENIA są dokładnie tymi, o których wiem", () => {
  // Zamknięty zbiór, nie „pusto". `--capture-bg` i `--context-bg` są
  // GRADIENTAMI (`linear-gradient(...) , kolor`), więc nie ma JEDNEGO koloru,
  // na którym można by złożyć krawędź — i bramka mówi to wprost zamiast
  // zgadywać, który przystanek gradientu wziąć. Asercja przeciwko PUSTEMU
  // zbiorowi uczyniłaby tę część czerwoną NA ZAWSZE, czyli blokadą.
  assert.deepEqual(
    [...borderUnmeasurableFamilies].sort(),
    ["--capture", "--context"],
    "Zbiór rodzin nie do rozłożenia się zmienił. Dziś: " +
      `[${[...borderUnmeasurableFamilies].sort().join(", ")}]. Powody: ` +
      `${borderUnmeasurable.join(" | ")}`,
  );
});

// ─── CZĘŚĆ CZWARTA: TEKST NA POWIERZCHNIACH CZYTANIA (próg 4,5) ────────────
//
// Zamyka największy kawałek dziury nazwanej w CZĘŚCI DRUGIEJ: tamten podział
// filtruje po przyrostku `-bg`, więc `--text-*` na `--surface-content` nie był
// mierzony NIGDZIE. Adwersarz udowodnił to uruchomieniem — złamanie
// `--text-secondary` na `--neutral-700` daje 1,77:1, a bramka wracała EXIT=0.
//
// Zbiór tekstów jest WYPROWADZONY Z KSZTAŁTU, nie wpisany: wszystkie tokeny
// `--text-*` z arkusza, podzielone na trzy rozłączne wiadra. Podział musi się
// domykać, bo prefiks `--text-` niesie w tym arkuszu DWIE różne rzeczy —
// kolory i STOPNIE SKALI TYPOGRAFICZNEJ (`--text-sm`, `--text-2xl`). Filtr po
// samej nazwie wpuściłby `0.8125rem` do pomiaru kontrastu.
const TEXT_TOKEN = /^--text-[a-z0-9-]+$/;
const LOOKS_LIKE_COLOR = /oklch\(|rgba?\(|color-mix\(|#[0-9a-f]{3}/i;
const textTokenNames = [...declaredTokenNames]
  .filter((name) => TEXT_TOKEN.test(name))
  .sort();

const typographyScale = [];
const textBoundToAFill = [];
const readingTextTokens = [];
const textPartitionFailures = [];

for (const name of textTokenNames) {
  // Wystarczy jeden motyw, żeby rozstrzygnąć KSZTAŁT tokenu; wartości mierzy
  // się dalej w obu.
  let literal;
  try {
    literal = resolve(themeTokens("dark"), name, "dark").literal;
  } catch (cause) {
    textPartitionFailures.push(`${name} — ${cause.message}`);
    continue;
  }
  if (!looksLikeAColor(literal)) {
    if (LOOKS_LIKE_COLOR.test(literal)) {
      // Wygląda jak kolor, a się nie rozkłada — to NIE jest stopień skali
      // i nie wolno go po cichu wrzucić do typografii.
      textPartitionFailures.push(
        `${name} = „${literal}" wygląda na kolor, ale się nie rozkłada. NIE ZGADUJĘ.`,
      );
      continue;
    }
    typographyScale.push(name);
    continue;
  }
  // `--text-on-*` z nazwy deklaruje, na czym leży — mierzy go CZĘŚĆ DRUGA
  // na wypełnieniu, do którego należy. Zmierzenie go na płótnie byłoby
  // pomiarem pary, która nigdy się nie maluje.
  if (name.startsWith("--text-on-")) textBoundToAFill.push(name);
  else readingTextTokens.push(name);
}

const readingMeasurements = [];
const readingUnmeasurable = [];

for (const themeName of THEMES) {
  const tokens = themeTokens(themeName);
  for (const surfaceName of READING_SURFACES) {
    let surface;
    try {
      surface = colorOf(tokens, surfaceName, themeName);
      if (surface.alpha !== 1) {
        throw new Error(
          `${surfaceName} = „${surface.literal}" nie jest kryjące; ta część mierzy ` +
            "WYŁĄCZNIE kryjące powierzchnie czytania.",
        );
      }
    } catch (cause) {
      readingUnmeasurable.push(
        `${themeName}: ${surfaceName} — ${cause.message}`,
      );
      continue;
    }
    for (const textName of readingTextTokens) {
      try {
        const text = colorOf(tokens, textName, themeName);
        if (text.alpha !== 1) {
          throw new Error(
            `${textName} = „${text.literal}" ma alfę ${text.alpha}; tekst z alfą trzeba ` +
              "by złożyć na powierzchni, a ta część tego nie robi. Zgłoś to.",
          );
        }
        readingMeasurements.push({
          theme: themeName,
          textToken: textName,
          surfaceToken: surfaceName,
          ratio: contrastRatio(text, surface),
          textLiteral: text.literal,
          surfaceLiteral: surface.literal,
          blocks: [...text.blocks, ...surface.blocks],
        });
      } catch (cause) {
        readingUnmeasurable.push(
          `${themeName}: ${textName} × ${surfaceName} — ${cause.message}`,
        );
      }
    }
  }
}

test("wypisuje każdą parę tekst × powierzchnia czytania z prowieniencją", () => {
  const lines = readingMeasurements.map(
    (row) =>
      `${row.theme.padEnd(5)} ${row.textToken.padEnd(20)} na ${row.surfaceToken.padEnd(20)} ` +
      `${format(row.ratio).padStart(6)}:1  ` +
      `${row.ratio >= WCAG_AA_NORMAL_TEXT ? "AA     " : "PONIŻEJ"}  ` +
      `${row.textLiteral} na ${row.surfaceLiteral}  | ${provenance(row.blocks)}`,
  );
  console.log(
    `\nTekst na powierzchniach czytania, ${path.relative(repoRoot, tokensPath)} ` +
      `(próg ${WCAG_AA_NORMAL_TEXT}:1):\n` +
      lines.join("\n") +
      `\n\nMierzone tokeny tekstu: ${readingTextTokens.join(", ")}` +
      `\nStopnie skali typograficznej (nie kolory, nie mierzone): ${typographyScale.join(", ")}` +
      `\nTekst przypisany do wypełnienia (mierzy go CZĘŚĆ DRUGA): ${textBoundToAFill.join(", ")}\n`,
  );
  assert.deepEqual(
    readingUnmeasurable,
    [],
    "Pary tekst × powierzchnia, których nie umiem rozłożyć: " +
      readingUnmeasurable.join(" | "),
  );
  assert.ok(
    lines.length > 0,
    "Nie ma czego wypisać — pomiar tekstu na powierzchniach czytania nie zebrał wiersza.",
  );
});

test("podział tokenów --text-* domyka się i nie gubi ani jednego", () => {
  assert.deepEqual(
    textPartitionFailures,
    [],
    `Tokeny --text-*, których nie umiem zaszufladkować: ${textPartitionFailures.join(" | ")}`,
  );
  const buckets = [
    ...typographyScale,
    ...textBoundToAFill,
    ...readingTextTokens,
  ].sort();
  assert.deepEqual(
    buckets,
    textTokenNames,
    `Podział --text-* się nie domyka. Skala: [${typographyScale.join(", ")}]; ` +
      `przypisane do wypełnienia: [${textBoundToAFill.join(", ")}]; ` +
      `czytane na powierzchni: [${readingTextTokens.join(", ")}].`,
  );
  assert.equal(
    new Set(buckets).size,
    buckets.length,
    "Ten sam token --text-* trafił do dwóch wiader.",
  );
  for (const expected of [
    "--text-primary",
    "--text-secondary",
    "--text-tertiary",
    "--text-quaternary",
    "--text-disabled",
  ]) {
    assert.ok(
      readingTextTokens.includes(expected),
      `${expected} wypadł z pomiaru na powierzchniach czytania; mierzone: ` +
        `[${readingTextTokens.join(", ")}].`,
    );
  }
  const expectedRows =
    THEMES.length * READING_SURFACES.length * readingTextTokens.length;
  assert.ok(
    expectedRows >= 30,
    `Z arkusza wychodzi ${expectedRows} par tekst × powierzchnia × motyw — poniżej ` +
      "trzydziestu ta część nie pilnuje już tego, po co powstała.",
  );
  assert.equal(
    readingMeasurements.length,
    expectedRows,
    `Zebrano ${readingMeasurements.length} pomiarów zamiast ${expectedRows}.`,
  );
});

test("tekst zdaje AA na każdej kryjącej powierzchni czytania", () => {
  // `--text-disabled` NIE JEST tu zwolniony. Wyjątek „Incidental" w SC 1.4.3
  // zwalnia tekst będący częścią NIEAKTYWNEJ kontrolki — a ten token maluje
  // w tym repo także treść żywą: `.amountNone` (pipeline.module.css:401),
  // `.state_none` (project-record.module.css:80), ikonę w aktywnym wierszu
  // (`styles.css:1614`) i kropkę jako `background` (task-table.module.css:285).
  // Wyjątek nie obejmuje żadnego z tych czterech, więc próg zostaje 4,5.
  const failures = readingMeasurements
    .filter((row) => row.ratio < WCAG_AA_NORMAL_TEXT)
    .map(
      (row) =>
        `${row.theme}/${row.textToken} na ${row.surfaceToken}: ${format(row.ratio)}:1 ` +
        `(${row.textLiteral} na ${row.surfaceLiteral})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Tekst poniżej ${WCAG_AA_NORMAL_TEXT}:1 na powierzchni czytania: ${failures.join("; ")}. ` +
      "Progu nie wolno obniżyć — zmienia się WARTOŚĆ tokenu tekstu albo powierzchni.",
  );
});

test("podpowiedź w polu jest mierzona TAM, GDZIE SIĘ MALUJE", () => {
  // `--input-placeholder` celowo NIE wchodzi do pomiaru na powierzchniach
  // czytania: podpowiedź nie maluje się na płótnie ani na treści, tylko na
  // `--input-bg` — i tam mierzy ją CZĘŚĆ DRUGA, progiem 4,5, własnym testem.
  // Ten test pilnuje, żeby to zdanie zostało PRAWDZIWE, zamiast zostać notatką.
  const placeholderRows = fillMeasurements.filter(
    (row) => row.textToken === "--input-placeholder",
  );
  assert.ok(
    placeholderRows.length >= THEMES.length,
    `CZĘŚĆ DRUGA zmierzyła --input-placeholder w ${placeholderRows.length} wierszach; ` +
      "poniżej jednego na motyw zdanie „mierzy ją część druga” przestaje być prawdziwe.",
  );
  // Czy podpowiedź to ten sam kolor, co `--text-quaternary`, jest MIERZONE,
  // a nie przepisane z arkusza — alias może zostać przepięty.
  for (const themeName of THEMES) {
    const tokens = themeTokens(themeName);
    const placeholder = colorOf(tokens, "--input-placeholder", themeName);
    const quaternary = colorOf(tokens, "--text-quaternary", themeName);
    console.log(
      `${themeName}: --input-placeholder = ${placeholder.literal}; ` +
        `--text-quaternary = ${quaternary.literal}; ten sam literał: ` +
        `${placeholder.literal === quaternary.literal ? "tak" : "NIE"}`,
    );
  }
});

// ─── CZĘŚĆ PIĄTA: AKCENT JAKO TUSZ PISMA (próg 4,5) ────────────────────────
//
// Skąd się wzięła. Loty 2–4 Fazy 3 postawiły akcent na PIŚMIE w pięciu nowych
// miejscach (`.basisLink`, `.offerState[data-offer-state="submitted"]`,
// `.eventAgent`, `.badgeMention`, `.markAgent`) i ani jedna para tokenów tego
// nie czytała. Nie przez niedbałość, tylko przez KSZTAŁT pytań, które ten plik
// zadaje: CZĘŚĆ DRUGA pyta o rodziny `--X-bg` + `--X-text` (akcent semantyczny
// żadnej nie tworzy), a CZĘŚĆ CZWARTA pyta wyłącznie o prefiks `--text-*`
// (akcent go nie ma). Rodzina `--accent-*` wpadała dokładnie MIĘDZY te dwa
// pytania. Brakujący przyrząd, nie zły kod — i dokładnie ta sama luka, którą
// CZĘŚĆ CZWARTA zamknęła dla `--text-*`.
//
// CZEGO TA CZĘŚĆ NIE MIERZY, POWIEDZIANE OD RAZU: mierzy TOKEN na GOŁYM,
// KRYJĄCYM planie czytania. Konsument stojący na LASERUNKU nad planem (a tak
// stoją trzy z tamtych pięciu reguł) jest mierzony w
// `scripts/consumer-contrast.test.mjs`, który czyta arkusze powierzchni i zna
// stos warstw pod regułą z nazwy (`INHERITED_SURFACES`). Ta część jest
// PODŁOGĄ: jeżeli akcent nie zdaje na samym planie, nie zda nigdzie wyżej.
//
// Podział rodziny jest WYPROWADZONY Z KSZTAŁTU i musi się domykać, bo prefiks
// `--accent-` niesie w tym arkuszu trzy różne rzeczy: tusz pisma, laserunek
// z alfą (nie jest pismem — jest powierzchnią albo kreską) i człon rodziny
// wypełnieniowej `--accent-legible-bg` / `--accent-legible-text`, którą mierzy
// CZĘŚĆ DRUGA. Wrzucenie laserunku do pomiaru pisma liczyłoby kontrast koloru
// z samym sobą po złożeniu; pominięcie go po cichu byłoby dziurą.
const ACCENT_TOKEN = /^--accent(-[a-z0-9-]+)?$/;
const accentTokenNames = [...declaredTokenNames]
  .filter((name) => ACCENT_TOKEN.test(name))
  .sort();

// Człony rodzin, które CZĘŚĆ DRUGA już mierzy jako tło × tekst. Wyliczone
// z `fillFamilies`, nie wpisane: przepięcie `--accent-legible-*` na inną
// rodzinę przeniesie je tu samo.
const accentBoundToAFill = [];
const accentNotPaintForText = [];
const accentReadingInks = [];
const accentPartitionFailures = [];

for (const name of accentTokenNames) {
  const family = fillFamilies.find(
    (candidate) =>
      name === `${candidate}${BG_SUFFIX}` || name === `${candidate}-text`,
  );
  if (family !== undefined) {
    accentBoundToAFill.push(name);
    continue;
  }
  let color;
  try {
    color = colorOf(themeTokens("dark"), name, "dark");
  } catch (cause) {
    accentPartitionFailures.push(`${name} — ${cause.message}`);
    continue;
  }
  // Alfa rozstrzyga rolę: token z alfą jest laserunkiem, kreską albo poświatą,
  // a nie tuszem pisma. Krawędź `--accent-edge` ma własne pytanie (1.4.11)
  // i własną sekcję wyżej; poświata nie jest krawędzią i nie jest pismem.
  if (color.alpha !== 1) accentNotPaintForText.push(name);
  else accentReadingInks.push(name);
}

const accentMeasurements = [];
const accentUnmeasurable = [];

for (const themeName of THEMES) {
  const tokens = themeTokens(themeName);
  for (const surfaceName of READING_SURFACES) {
    let surface;
    try {
      surface = colorOf(tokens, surfaceName, themeName);
      if (surface.alpha !== 1) {
        throw new Error(
          `${surfaceName} = „${surface.literal}" nie jest kryjące; ta część mierzy ` +
            "WYŁĄCZNIE kryjące powierzchnie czytania.",
        );
      }
    } catch (cause) {
      accentUnmeasurable.push(
        `${themeName}: ${surfaceName} — ${cause.message}`,
      );
      continue;
    }
    for (const inkName of accentReadingInks) {
      try {
        const ink = colorOf(tokens, inkName, themeName);
        accentMeasurements.push({
          theme: themeName,
          inkToken: inkName,
          surfaceToken: surfaceName,
          ratio: contrastRatio(ink, surface),
          inkLiteral: ink.literal,
          surfaceLiteral: surface.literal,
          blocks: [...ink.blocks, ...surface.blocks],
        });
      } catch (cause) {
        accentUnmeasurable.push(
          `${themeName}: ${inkName} × ${surfaceName} — ${cause.message}`,
        );
      }
    }
  }
}

test("wypisuje każdą parę akcent × powierzchnia czytania z prowieniencją", () => {
  const lines = accentMeasurements.map(
    (row) =>
      `${row.theme.padEnd(5)} ${row.inkToken.padEnd(20)} na ${row.surfaceToken.padEnd(20)} ` +
      `${format(row.ratio).padStart(6)}:1  ` +
      `${row.ratio >= WCAG_AA_NORMAL_TEXT ? "AA     " : "PONIŻEJ"}  ` +
      `${row.inkLiteral} na ${row.surfaceLiteral}  | ${provenance(row.blocks)}`,
  );
  console.log(
    `\nAKCENT JAKO TUSZ PISMA, ${path.relative(repoRoot, tokensPath)} ` +
      `(próg ${WCAG_AA_NORMAL_TEXT}:1, SC 1.4.3):\n` +
      lines.join("\n") +
      `\n\nMierzone tusze akcentu: ${accentReadingInks.join(", ")}` +
      `\nZ alfą — laserunek, kreska, poświata; NIE pismo: ${accentNotPaintForText.join(", ")}` +
      `\nCzłon rodziny wypełnieniowej (mierzy go CZĘŚĆ DRUGA): ${accentBoundToAFill.join(", ") || "brak"}` +
      "\nKonsument stojący na LASERUNKU nad planem jest mierzony w " +
      "`scripts/consumer-contrast.test.mjs` — ta część mierzy TOKEN na GOŁYM planie.\n",
  );
  assert.deepEqual(
    accentUnmeasurable,
    [],
    "Pary akcent × powierzchnia, których nie umiem rozłożyć: " +
      accentUnmeasurable.join(" | "),
  );
  assert.ok(
    lines.length > 0,
    "Nie ma czego wypisać — pomiar akcentu na powierzchniach czytania nie zebrał wiersza.",
  );
});

test("podział tokenów --accent-* domyka się i nie gubi ani jednego", () => {
  assert.deepEqual(
    accentPartitionFailures,
    [],
    `Tokeny --accent-*, których nie umiem zaszufladkować: ${accentPartitionFailures.join(" | ")}`,
  );
  const buckets = [
    ...accentBoundToAFill,
    ...accentNotPaintForText,
    ...accentReadingInks,
  ].sort();
  assert.deepEqual(
    buckets,
    accentTokenNames,
    `Podział --accent-* się nie domyka. Rodzina wypełnieniowa: ` +
      `[${accentBoundToAFill.join(", ")}]; z alfą: [${accentNotPaintForText.join(", ")}]; ` +
      `tusz pisma: [${accentReadingInks.join(", ")}].`,
  );
  assert.equal(
    new Set(buckets).size,
    buckets.length,
    "Ten sam token --accent-* trafił do dwóch wiader.",
  );
  // Podłogi NAZWANE, nie wyliczone z pętli mierzącej. `--accent` i
  // `--accent-hover` to jedyne dwa kryjące tusze akcentu w tym arkuszu i to
  // one malują pismo w pięciu regułach lotów 2–4; wypadnięcie któregokolwiek
  // z pomiaru ma wywalić TĘ asercję, a nie zniknąć w liczbie.
  for (const expected of ["--accent", "--accent-hover"]) {
    assert.ok(
      accentReadingInks.includes(expected),
      `${expected} wypadł z pomiaru na powierzchniach czytania; mierzone: ` +
        `[${accentReadingInks.join(", ")}].`,
    );
  }
  assert.ok(
    accentNotPaintForText.length >= 4,
    `Wiadro laserunków ma ${accentNotPaintForText.length} tokenów zamiast co najmniej ` +
      "czterech (quiet, quieter, edge, glow) — wykrywanie alfy przestało działać.",
  );
  const expectedRows =
    THEMES.length * READING_SURFACES.length * accentReadingInks.length;
  assert.ok(
    expectedRows >= 12,
    `Z arkusza wychodzi ${expectedRows} par akcent × powierzchnia × motyw — poniżej ` +
      "dwunastu ta część nie pilnuje już tego, po co powstała.",
  );
  assert.equal(
    accentMeasurements.length,
    expectedRows,
    `Zebrano ${accentMeasurements.length} pomiarów zamiast ${expectedRows}.`,
  );
});

test("akcent zdaje AA jako tusz pisma na każdej kryjącej powierzchni czytania", () => {
  const failures = accentMeasurements
    .filter((row) => row.ratio < WCAG_AA_NORMAL_TEXT)
    .map(
      (row) =>
        `${row.theme}/${row.inkToken} na ${row.surfaceToken}: ${format(row.ratio)}:1 ` +
        `(${row.inkLiteral} na ${row.surfaceLiteral})`,
    );
  assert.deepEqual(
    failures,
    [],
    `Akcent poniżej ${WCAG_AA_NORMAL_TEXT}:1 jako pismo na powierzchni czytania: ` +
      `${failures.join("; ")}. Progu nie wolno obniżyć — zmienia się WARTOŚĆ stopnia ` +
      "akcentu albo powierzchni.",
  );
});
