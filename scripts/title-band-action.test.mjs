// Testy REGUŁY lotu B2. Bez przeglądarki — chodzą w `npm run check` i w
// `npm run test` na wszystkich trzech systemach, bo reguła jest przenośna,
// a PIKSELE nie są.
//
// Każda liczba w tym pliku została odczytana z drzewa 2026-08-10 przelotem
// `LAYOUT_PORT=5301 npm run test:renderer-layout` (wyjście verbatim
// w `docs/plans/2026-08-06-adopcja-jezyka-wizualnego/dowody/b2-czerwien.txt`).
// Wpisanie tu liczb z głowy zrobiłoby z tych testów strażnika własnej fikcji —
// i ZROBIŁO: dwa pudełka akcji trzeba było poprawić po przeglądzie, patrz
// komentarz przy fiksturach.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROTOTYPE_FILLED_MODIFIERS,
  TITLE_BAND_ACTION_ARMED,
  TITLE_BAND_ACTION_CLASSES,
  TITLE_BAND_ACTION_STATUS,
  TITLE_BAND_DIVERGENCES,
  TITLE_BAND_ROWS,
  TITLE_BAND_STATES,
  CSS_MODULE_HASH_PATTERN,
  classifyTitleBandAction,
  classifyTitleBandCensus,
  isTitleBandDivergence,
  judgeActionAgainstTitleRow,
  titleBandVerdictThrows,
} from "./title-band-action.mjs";

// DWIE Z TYCH FIKSTUR BYŁY WPISANE Z GŁOWY, i wyszło to dopiero na przeglądzie:
// pudełka akcji Projektów i rekordu miały wysokość 28 px, której ta aplikacja
// nigdy nie narysowała, a asercja pinowała próg 14 px, którego przyrząd nie
// wypisał ANI RAZU. Werdykty się zgadzały (2,5 ≤ 14 i 2,5 ≤ 18 to ten sam
// IN_BAND), więc jedyną szkodą było to, co najgorsze: JEDYNE miejsce z zapisanym
// progiem zapisywało liczbę spoza pomiaru. Środki obu pudełek trafiały co do
// dziesiątej — podpis pudełka odtworzonego WSTECZ z linii raportu, nie
// odczytanego z akcji. Raport drukuje teraz `y … h=… x …` każdej akcji właśnie
// po to, żeby ta fikstura miała skąd być przepisana.
//
// Zmierzone na Projektach: tytuł „Projects" 75–91,9 (h 16,9), akcja
// „New project" 67,9–103,9 (h 36). To jest jedyny dziś świadek na to, że ten
// przyrząd umie zwrócić cokolwiek poza znaleziskiem.
const PROJECTS_TITLE = { top: 75, bottom: 91.9, height: 16.9 };
const PROJECTS_ACTION = { top: 67.9, bottom: 103.9, height: 36 };
// Zmierzone na Lejku: tytuł 75,5–92,4 (h 16,9), akcja „New opportunity"
// 140–176 (h 36) — cały rząd niżej.
const PIPELINE_TITLE = { top: 75.5, bottom: 92.4, height: 16.9 };
const PIPELINE_ACTION = { top: 140, bottom: 176, height: 36 };
// Zmierzone na ekranie rekordu projektu: tytuł 136–160,6 (h 24,6), akcje
// w `.crumbs` 86–118 (h 32) — rząd WYŻEJ.
const RECORD_TITLE = { top: 136, bottom: 160.6, height: 24.6 };
const RECORD_ACTION = { top: 86, bottom: 118, height: 32 };

test("an action centred on the title row is IN_BAND", () => {
  const judged = judgeActionAgainstTitleRow({
    title: PROJECTS_TITLE,
    action: PROJECTS_ACTION,
  });
  assert.equal(judged.state, "IN_BAND");
  assert.equal(judged.drift, 2.5);
  assert.equal(judged.tolerance, 18);
});

test("an action a whole row lower is BELOW_BAND", () => {
  const judged = judgeActionAgainstTitleRow({
    title: PIPELINE_TITLE,
    action: PIPELINE_ACTION,
  });
  assert.equal(judged.state, "BELOW_BAND");
  assert.equal(judged.drift, 74.1);
  assert.equal(judged.tolerance, 18);
});

test("an action a row higher is ABOVE_BAND, not BELOW", () => {
  const judged = judgeActionAgainstTitleRow({
    title: RECORD_TITLE,
    action: RECORD_ACTION,
  });
  assert.equal(judged.state, "ABOVE_BAND");
  assert.equal(judged.drift, -46.3);
  // Trzeci z trzech progów, które cytuje nagłówek modułu (18 / 18 / 16). Bez tej
  // asercji jeden z nich nie był nigdzie zapisany, a nagłówek powoływał się na
  // niego w prozie.
  assert.equal(judged.tolerance, 16);
});

// TO JEST TEST, KTÓRY BRONI PUNKTU 4 ZADANIA. Ten sam układ przeskalowany
// dwukrotnie (200% tekstu) musi dać TEN SAM werdykt — a dałby inny, gdyby próg
// był wpisaną liczbą pikseli. Skalowane są wszystkie cztery liczby, bo tak
// właśnie zachowuje się pasmo o `min-height` w `rem`.
test("the verdict is scale-free: the same layout at 200% judges identically", () => {
  const scale = (box) => ({
    top: box.top * 2,
    bottom: box.bottom * 2,
    height: box.height * 2,
  });
  assert.equal(
    judgeActionAgainstTitleRow({
      title: scale(PROJECTS_TITLE),
      action: scale(PROJECTS_ACTION),
    }).state,
    "IN_BAND",
  );
  assert.equal(
    judgeActionAgainstTitleRow({
      title: scale(PIPELINE_TITLE),
      action: scale(PIPELINE_ACTION),
    }).state,
    "BELOW_BAND",
  );
});

// Ta granica jest jedyną, którą ten przyrząd sam ustala, więc musi mieć test
// po OBU stronach — inaczej „≤" kontra „<" przechodzi niezauważone.
test("the tolerance is exactly half the taller box, inclusive", () => {
  const title = { top: 0, bottom: 20, height: 20 };
  assert.equal(
    judgeActionAgainstTitleRow({
      title,
      action: { top: 10, bottom: 30, height: 20 },
    }).state,
    "IN_BAND",
  );
  assert.equal(
    judgeActionAgainstTitleRow({
      title,
      action: { top: 10.2, bottom: 30.2, height: 20 },
    }).state,
    "BELOW_BAND",
  );
});

test("a screen with no action-class button is NO_ACTION, not a displaced one", () => {
  const decision = classifyTitleBandAction({
    title: PIPELINE_TITLE,
    actions: [],
  });
  assert.equal(decision.state, "NO_ACTION");
  assert.deepEqual(decision.judged, []);
});

test("one action in the band wins over any number of actions outside it", () => {
  const decision = classifyTitleBandAction({
    title: PROJECTS_TITLE,
    actions: [
      { ...PROJECTS_ACTION, signature: "button.secondary-button" },
      { ...PIPELINE_ACTION, signature: "button.primary-button" },
    ],
  });
  assert.equal(decision.state, "IN_BAND");
  assert.deepEqual(
    decision.judged.map((entry) => entry.state),
    ["IN_BAND", "BELOW_BAND"],
  );
});

test("actions on both sides of the title are SPLIT_BAND, not rounded to one", () => {
  const decision = classifyTitleBandAction({
    title: RECORD_TITLE,
    actions: [
      { ...RECORD_ACTION, signature: "button.secondary-button" },
      {
        top: 300,
        bottom: 328,
        height: 28,
        signature: "button.primary-button",
      },
    ],
  });
  assert.equal(decision.state, "SPLIT_BAND");
});

test("every state a row declares is a state the rule can produce", () => {
  for (const row of TITLE_BAND_ROWS)
    assert.ok(
      TITLE_BAND_STATES.includes(row.today),
      `${row.id} declares today="${row.today}", which is not a state this rule returns`,
    );
});

// LICZBA JEST ZAPISANA PRECYZYJNIE, żeby wiersz nie mógł zniknąć po cichu —
// ta sama umowa co `VISUAL_LANGUAGE_COUNT_DRIFT`. Jej uzasadnieniem jest
// WYLICZENIE PODMIOTÓW, a nie zgodność sumy z rejestrem: rejestr rozjazdów
// (`faza-4-porownanie-ekranow.md`) liczy pod przyczyną C2 dziewięć wpisów, ten
// przelot dochodzi do ośmiu i różnica rozkłada się na trzy udowodnione ruchy —
//
//   −1  Notatki i Źródła to JEDEN wiersz `library`: rejestr porównywał dwa
//       zrzuty, a pasmo jest jedno (`LibraryShell.tsx:80-90`);
//   −1  rekord projektu i jego zakładka komentarzy to JEDEN wiersz
//       `projects/record:project`: `.crumbs` z `.actions` renderuje się POZA
//       panelem zakładki (`ProjectRecordScreen.tsx:300-306` wobec `:308`);
//   +1  `tasks` jest podmiotem, którego rejestr pod tą przyczyną NIE MA —
//       prototyp stawia w paśmie Zadań „+ New task", nasze pasmo nie niesie ani
//       jednej akcji.
//
// 9 − 2 + 1 = 8. Rekord zadania NIE jest tu czwartym ruchem: symetrycznie
// oceniony jest MATCH-em, nie rozjazdem (patrz predykat w nagłówku modułu).
test("the canonical screen list holds fifteen screens and eight divergences", () => {
  assert.equal(TITLE_BAND_ROWS.length, 15);
  assert.equal(TITLE_BAND_DIVERGENCES.length, 8);
  assert.deepEqual(
    TITLE_BAND_DIVERGENCES.map((row) => row.id),
    [
      "tasks",
      "pipeline",
      "renewals",
      "organizations",
      "people",
      "meetings",
      "library",
      "projects/record:project",
    ],
  );
});

// TA ASERCJA POWSTAŁA Z ŻYWEJ WADY, i jest to wada, którą ten lot nosił do
// przeglądu: dwie kolumny tabeli mierzyły DWA RÓŻNE predykaty, a
// `isTitleBandDivergence` porównywał je na równość. Kolumna `today` liczy
// wyłącznie przyciski z WYPEŁNIENIEM, więc kolumna `prototype` musi liczyć
// dokładnie to samo po swojej stronie — inaczej pierwszy wiersz, w którym
// prototyp stawia kontrolkę przezroczystą, staje się rozjazdem NIESPEŁNIALNYM.
test("every prototype action cites a modifier that paints a background", () => {
  assert.deepEqual(PROTOTYPE_FILLED_MODIFIERS, ["primary", "bordered"]);
  for (const row of TITLE_BAND_ROWS.filter(
    (candidate) => candidate.prototype === "action",
  ))
    assert.ok(
      PROTOTYPE_FILLED_MODIFIERS.some((modifier) =>
        new RegExp(`\\b${modifier}\\b`, "u").test(row.cite),
      ),
      `${row.id} is declared prototype="action" but its citation names no filled ` +
        `modifier (${PROTOTYPE_FILLED_MODIFIERS.join(", ")}) — a transparent control ` +
        "in the prototype's band is what `.ghost-button` is in ours, not an action",
    );
});

test("at least one screen is declared IN_BAND, or the instrument can only go red", () => {
  assert.ok(TITLE_BAND_ROWS.some((row) => row.today === "IN_BAND"));
});

test("a screen the prototype leaves without an action cannot be a divergence", () => {
  assert.equal(
    isTitleBandDivergence({ prototype: "no-action", today: "NO_ACTION" }),
    false,
  );
  // I TO JEST TEN TEST, KTÓRY BRONI CZTERECH ZDROWYCH EKRANÓW. Bez tej
  // asercji „brak akcji" stałoby się znaleziskiem wszędzie, a Dziś, Skrzynka,
  // Kalendarz i Ustawienia zostałyby zgłoszone jako wada, której nie mają.
  // Rekord zadania stoi w tej liście, bo prototyp kładzie w jego paśmie
  // WYŁĄCZNIE kontrolki bez tła — patrz test symetrii wyżej.
  assert.deepEqual(
    TITLE_BAND_ROWS.filter((row) => row.prototype === "no-action").map(
      (row) => row.id,
    ),
    ["today", "calendar", "inbox", "settings", "tasks/record:task"],
  );
  // Ekran bez odpowiednika w prototypie nie ma się od czego rozjechać.
  assert.equal(
    isTitleBandDivergence({ prototype: "no-screen", today: "NO_ACTION" }),
    false,
  );
});

test("every row carries an address on both sides of the comparison", () => {
  for (const row of TITLE_BAND_ROWS) {
    // Wiersz „no-screen" nie może zacytować linii ekranu, którego prototyp nie
    // ma — cytuje więc SPOSÓB, w jaki tę nieobecność da się odtworzyć. To jest
    // jedyne odstępstwo i jest przypięte tutaj, żeby nie dało się go rozszerzyć
    // po cichu na wiersz, który adres mieć powinien.
    assert.match(
      row.cite,
      row.prototype === "no-screen"
        ? /^v3: `grep/u
        : /v3\/(app\.js|screens\/[a-z]+\.js):\d+/u,
      `${row.id} does not cite the prototype with a line number`,
    );
    assert.ok(row.app.length > 20, `${row.id} does not say where it lives`);
  }
});

// KANONICZNOŚĆ LISTY PRZYPIĘTA DO JEDYNEGO ŹRÓDŁA, bo bez tego `TITLE_BAND_ROWS`
// jest CZWARTĄ ręcznie przepisaną kopią listy ekranów — a „ręczna lista obok
// zamkniętego słownika" jest w tym repozytorium nazwaną klasą defektu i sam
// rejestr powierzchni nosi o niej komentarz (`surface-registry.ts:203-207`).
//
// DZIURA, KTÓRĄ TO ZAMYKA, JEST WĄSKA I REALNA: powierzchnia nawigacyjna, która
// przybędzie, wpada w `TITLE_BAND_ROW_UNDECLARED`, a znikająca w
// `TITLE_BAND_ROW_UNTOUCHED` — ale powierzchnia z `chrome: "mode"` (dziś jedyna
// taka to Ustawienia) NIE RYSUJE `.nav-item[data-surface]`, więc nie wchodzi do
// `walk.declared`, nie wymusza wiersza i nie zapala żadnego strażnika.
//
// NACISK JEST DWUSTOPNIOWY I TAK MA BYĆ: czternasta powierzchnia najpierw kładzie
// TEN test (nie ma o niej wiersza), a po dopisaniu wiersza kładzie
// `TITLE_BAND_ROW_UNTOUCHED` w bramce (spacer po niej nie dojeżdża) — dopóki ktoś
// nie powie, którymi drzwiami się w nią wchodzi. Drugi upadek nie jest zepsutym
// przyrządem, jest drugą połową tej samej decyzji.
//
// ŹRÓDŁEM JEST TEKST `.ts`, NIE ZBUDOWANE `dist`, i to jest wybór: ten plik
// chodzi w `test:scripts`, a `test:scripts` nie ma `needs: ["build"]`
// (`run-check.mjs:85`) — import z `dist` zamieniłby czysty `npm run test:scripts`
// po `npm run clean` w awarię modułu. Precedens na czytanie źródeł zamiast
// przepisywania ich kształtu stoi w `renderer-declarations.mjs`.
const REGISTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "desktop-preload",
  "src",
  "surface-registry.ts",
);

const registrySurfaces = () => {
  const source = readFileSync(REGISTRY, "utf8");
  const start = source.indexOf("export const desktopSurfaceRegistry = [");
  const end = source.indexOf("] as const;", start);
  assert.ok(
    start !== -1 && end !== -1,
    `${REGISTRY} no longer declares „export const desktopSurfaceRegistry = [ … ] as const;”, ` +
      "so this binding read nothing — which is exactly the silence it exists to prevent",
  );
  const body = source.slice(start, end);
  // WZORZEC BEZ KLASY ZNAKÓW I BEZ KOTWICY KOŃCA LINII, i oba są celowe:
  // `[a-z-]+` przemilczałby identyfikator z cyfrą albo wielką literą, a `$` po
  // przecinku wiąże ten test z zakończeniem linii — dziś nieszkodliwe, bo
  // `.gitattributes` pinuje `eol=lf` dla całego repozytorium, ale asercja, która
  // czerwieni się WYŁĄCZNIE na jednym systemie, jest w tym repozytorium nazwaną
  // wadą.
  const ids = [...body.matchAll(/^ {4}id: "([^"]+)",/gmu)].map(
    (match) => match[1],
  );
  const chrome = [...body.matchAll(/^ {4}chrome: "([^"]+)",/gmu)].map(
    (match) => match[1],
  );
  return { ids, chrome };
};

test("every surface in the registry has a row, and every row is a surface", () => {
  const { ids, chrome } = registrySurfaces();
  // Guard przeciwko wzorcowi, który przestał pasować: pusty odczyt musi paść
  // TUTAJ, a nie zamienić się w cichą zgodność dwóch pustych zbiorów.
  assert.equal(
    ids.length,
    chrome.length,
    "each registry entry carries exactly one id and one chrome field; unequal counts " +
      "mean this reader stopped matching the file it claims to read",
  );
  assert.ok(chrome.includes("navigation") && chrome.includes("mode"));
  assert.deepEqual(
    [...TITLE_BAND_ROWS.map((row) => row.id)]
      .filter((id) => !id.includes("/record:"))
      .sort(),
    [...ids].sort(),
  );
});

test("row ids are unique", () => {
  const ids = TITLE_BAND_ROWS.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the action classes are the two that carry a fill, and ghost is not one", () => {
  assert.deepEqual(TITLE_BAND_ACTION_CLASSES, [
    "primary-button",
    "secondary-button",
  ]);
  assert.ok(!TITLE_BAND_ACTION_CLASSES.includes("ghost-button"));
});

test("pending reports what the list predicts and throws on anything else", () => {
  assert.equal(TITLE_BAND_ACTION_ARMED, false);
  assert.equal(TITLE_BAND_ACTION_STATUS, "pending: FAZA C, lot C2");
  assert.equal(
    titleBandVerdictThrows({ predicted: true, divergent: true, armed: false }),
    false,
    "a screen measured exactly as the list predicts is known debt, not a failure",
  );
  assert.equal(
    titleBandVerdictThrows({ predicted: false, divergent: true, armed: false }),
    true,
    "a screen that drifted from the list throws even while the position is pending",
  );
});

// TA PARA ASERCJI JEST TU ZAMIAST JEDNEJ, KTÓRA PRZYPINAŁA WADĘ JAKO ZAMIERZONĄ.
// `armed || !predicted` było prawdziwe dla KAŻDEGO wiersza, więc przełączenie na
// „enforced" — warunek zapisany i rozstrzygalny — dawało bramkę czerwoną NA
// ZAWSZE, także nad ekranami zgodnymi z prototypem, i werdykt o treści „ten
// przelot zmierzył NO_ACTION, a lista mówi NO_ACTION". Uzbrojenie ma DOKŁADAĆ
// rozjazdy, nie zastępować reguły.
test("arming adds divergences to the verdict and stays silent on screens that hold", () => {
  assert.equal(
    titleBandVerdictThrows({ predicted: true, divergent: false, armed: true }),
    false,
    "an armed pass must stay silent about a screen that agrees with the prototype, " +
      "or enforcement means „red forever” instead of „a divergence fails this run”",
  );
  assert.equal(
    titleBandVerdictThrows({ predicted: true, divergent: true, armed: true }),
    true,
    "an armed pass must fail the screens that still place the action outside the band",
  );
  assert.equal(
    titleBandVerdictThrows({ predicted: false, divergent: false, armed: true }),
    true,
    "drift from the canonical list throws whether the position is armed or not",
  );
});

test("the module-hash pattern strips the sheet digest and keeps the name", () => {
  const pattern = new RegExp(CSS_MODULE_HASH_PATTERN, "u");
  assert.deepEqual(pattern.exec("_createToggle_1kitm_80")?.[1], "createToggle");
  assert.equal(pattern.exec("primary-button"), null);
});

// ── KSIĘGOWOŚĆ CAŁEGO PRZELOTU ──────────────────────────────────────────────

const walk = {
  declared: ["today", "projects", "pipeline"],
  settingsEntry: true,
  arrivals: [
    { id: "today", seen: "today" },
    { id: "projects", seen: "projects" },
    { id: "pipeline", seen: "pipeline" },
  ],
};
const measured = [
  { id: "today", state: "NO_ACTION", titles: 1 },
  { id: "projects", state: "IN_BAND", titles: 1 },
  { id: "pipeline", state: "BELOW_BAND", titles: 1 },
];
const rows = TITLE_BAND_ROWS.filter((row) =>
  ["today", "projects", "pipeline"].includes(row.id),
);

test("a clean walk over the declared screens raises nothing", () => {
  assert.deepEqual(classifyTitleBandCensus({ walk, measured, rows }), []);
});

test("a screen with no resolvable title band is NOT_MEASURED, never NO_ACTION", () => {
  const failures = classifyTitleBandCensus({
    walk,
    measured: [
      { id: "today", state: "NOT_MEASURED", titles: 0 },
      { id: "projects", state: "IN_BAND", titles: 1 },
      { id: "pipeline", state: "BELOW_BAND", titles: 1 },
    ],
    rows,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^TITLE_BAND_NOT_MEASURED — today:/u);
  assert.match(failures[0], /matched 0 rendered element\(s\)/u);
});

// TA ASERCJA POWSTAŁA Z ŻYWEJ WADY, którą znalazł przegląd przed komitem:
// przelot oddawał do księgowości wyłącznie `titles`, więc ekran z JEDNYM
// `#surface-title` bez przodka `<header>` wchodził tu jako `NOT_MEASURED`
// i NIE ZAPALAŁ NICZEGO — `entry.band` było `undefined`, a nie `null`. Cichy
// `NOT_MEASURED` jest nieodróżnialny od ekranu zdrowego, czyli dokładnie tą
// klasą defektu, którą ten przyrząd ma zamykać.
test("a title with no ancestor header is a failure, not a silent NOT_MEASURED", () => {
  const failures = classifyTitleBandCensus({
    walk,
    measured: [
      { id: "today", state: "NOT_MEASURED", titles: 1, band: null },
      { id: "projects", state: "IN_BAND", titles: 1 },
      { id: "pipeline", state: "BELOW_BAND", titles: 1 },
    ],
    rows,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^TITLE_BAND_NOT_MEASURED — today:/u);
  assert.match(failures[0], /no ancestor\n?\s*<header>/u);
});

test("two title ids on one screen is an instrument failure, not a richer measurement", () => {
  const failures = classifyTitleBandCensus({
    walk,
    measured: [
      { id: "today", state: "NOT_MEASURED", titles: 2 },
      { id: "projects", state: "IN_BAND", titles: 1 },
      { id: "pipeline", state: "BELOW_BAND", titles: 1 },
    ],
    rows,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /matched 2 rendered element\(s\)/u);
});

test("a declared row nobody reached fails, and says how many of how many", () => {
  const failures = classifyTitleBandCensus({
    walk,
    measured: measured.filter((entry) => entry.id !== "pipeline"),
    rows,
  });
  assert.equal(
    failures.filter((failure) =>
      failure.startsWith("TITLE_BAND_DESTINATIONS_DIVERGED"),
    ).length,
    1,
  );
  const untouched = failures.filter((failure) =>
    failure.startsWith("TITLE_BAND_ROW_UNTOUCHED"),
  );
  assert.equal(untouched.length, 1);
  assert.match(untouched[0], /1 of 3 row\(s\)/u);
  assert.match(untouched[0], /\(pipeline\)/u);
});

test("a screen measured but absent from the canonical list fails", () => {
  const failures = classifyTitleBandCensus({
    walk: { ...walk, declared: [...walk.declared, "people"] },
    measured: [...measured, { id: "people", state: "BELOW_BAND", titles: 1 }],
    rows,
  });
  assert.equal(
    failures.filter((failure) =>
      failure.startsWith("TITLE_BAND_ROW_UNDECLARED"),
    ).length,
    1,
  );
});

test("navigation that silently failed is named, not counted as a measurement", () => {
  const failures = classifyTitleBandCensus({
    walk: {
      ...walk,
      arrivals: [
        { id: "today", seen: "today" },
        { id: "projects", seen: "today" },
        { id: "pipeline", seen: null },
      ],
    },
    measured,
    rows,
  });
  assert.equal(
    failures.filter((failure) =>
      failure.startsWith("TITLE_BAND_DID_NOT_ARRIVE"),
    ).length,
    1,
  );
  assert.equal(
    failures.filter((failure) => failure.startsWith("TITLE_BAND_NO_AFFORDANCE"))
      .length,
    1,
  );
});

test("a walk with no destinations and no gear is a broken measurement", () => {
  const failures = classifyTitleBandCensus({
    walk: { declared: [], settingsEntry: false, arrivals: [] },
    measured: [],
    rows: [],
  });
  assert.ok(
    failures.some((failure) =>
      failure.startsWith("TITLE_BAND_NO_DESTINATIONS"),
    ),
  );
  assert.ok(
    failures.some((failure) =>
      failure.startsWith("TITLE_BAND_NO_SETTINGS_ENTRY"),
    ),
  );
});

// Najważniejszy strażnik przyrządu w tym pliku: przelot, w którym ANI JEDEN
// ekran nie wrócił z akcją w rzędzie tytułu, jest nieodróżnialny od przelotu
// z zepsutym doborem podmiotów — obydwa wyglądają jak „wszystko jest wadą".
test("a pass that never returns IN_BAND is reported as a broken probe", () => {
  const failures = classifyTitleBandCensus({
    walk,
    measured: measured.map((entry) =>
      entry.state === "IN_BAND" ? { ...entry, state: "NO_ACTION" } : entry,
    ),
    rows,
  });
  assert.ok(
    failures.some((failure) => failure.startsWith("TITLE_BAND_NEVER_IN_BAND")),
  );
});
