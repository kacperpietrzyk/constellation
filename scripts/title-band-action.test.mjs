// Testy REGUŁY lotu B2. Bez przeglądarki — chodzą w `npm run check` i w
// `npm run test` na wszystkich trzech systemach, bo reguła jest przenośna,
// a PIKSELE nie są.
//
// Każda liczba w tym pliku została odczytana z drzewa 2026-08-10 przelotem
// `LAYOUT_PORT=5299 node scripts/verify-renderer-layout.mjs` (wyjście verbatim
// w `docs/plans/2026-08-06-adopcja-jezyka-wizualnego/dowody/b2-czerwien.txt`).
// Wpisanie tu liczb z głowy zrobiłoby z tych testów strażnika własnej fikcji.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
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

// Zmierzone na Projektach: tytuł „Projects" 75–91,9 (h 16,9), akcja
// „New project" 71,9–99,9 (h 28). To jest jedyny dziś świadek na to, że ten
// przyrząd umie zwrócić cokolwiek poza znaleziskiem.
const PROJECTS_TITLE = { top: 75, bottom: 91.9, height: 16.9 };
const PROJECTS_ACTION = { top: 71.9, bottom: 99.9, height: 28 };
// Zmierzone na Lejku: tytuł 75,5–92,4 (h 16,9), akcja „New opportunity"
// 140–176 (h 36) — cały rząd niżej.
const PIPELINE_TITLE = { top: 75.5, bottom: 92.4, height: 16.9 };
const PIPELINE_ACTION = { top: 140, bottom: 176, height: 36 };
// Zmierzone na ekranie rekordu projektu: tytuł 136–160,6 (h 24,6), akcje
// w `.crumbs` 88–116 (h 28) — rząd WYŻEJ.
const RECORD_TITLE = { top: 136, bottom: 160.6, height: 24.6 };
const RECORD_ACTION = { top: 88, bottom: 116, height: 28 };

test("an action centred on the title row is IN_BAND", () => {
  const judged = judgeActionAgainstTitleRow({
    title: PROJECTS_TITLE,
    action: PROJECTS_ACTION,
  });
  assert.equal(judged.state, "IN_BAND");
  assert.equal(judged.drift, 2.5);
  assert.equal(judged.tolerance, 14);
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
// ta sama umowa co `VISUAL_LANGUAGE_COUNT_DRIFT`. Dziewiątka nie jest
// przypadkiem: tyle wpisów przyczyny C2 liczy rejestr rozjazdów
// (`faza-4-porownanie-ekranow.md`), a ten przelot dochodzi do niej WŁASNYM
// pomiarem, po drodze wymieniając jeden wpis rejestru na inny — patrz komentarz
// przy wierszach `library` i `tasks`.
test("the canonical screen list holds fifteen screens and nine divergences", () => {
  assert.equal(TITLE_BAND_ROWS.length, 15);
  assert.equal(TITLE_BAND_DIVERGENCES.length, 9);
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
      "tasks/record:task",
    ],
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
  assert.deepEqual(
    TITLE_BAND_ROWS.filter((row) => row.prototype === "no-action").map(
      (row) => row.id,
    ),
    ["today", "calendar", "inbox", "settings"],
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
    titleBandVerdictThrows({ predicted: true, armed: false }),
    false,
    "a screen measured exactly as the list predicts is known debt, not a failure",
  );
  assert.equal(
    titleBandVerdictThrows({ predicted: false, armed: false }),
    true,
    "a screen that drifted from the list throws even while the position is pending",
  );
  assert.equal(titleBandVerdictThrows({ predicted: true, armed: true }), true);
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
