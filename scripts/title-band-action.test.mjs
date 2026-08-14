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
  TITLE_BAND_INLINE_STATES,
  TITLE_BAND_OPENING_ARMED,
  TITLE_BAND_OPENING_DIVERGENCES,
  TITLE_BAND_OPENING_STATES,
  TITLE_BAND_PROTOTYPE_OPENING_STATES,
  TITLE_BAND_PROTOTYPE_STACK_STATES,
  TITLE_BAND_ROWS,
  TITLE_BAND_STACK_ARMED,
  TITLE_BAND_STACK_DIVERGENCES,
  TITLE_BAND_STACK_STATES,
  TITLE_BAND_STATES,
  CSS_MODULE_HASH_PATTERN,
  classifyTitleBandAction,
  classifyTitleBandCensus,
  classifyTitleBandInline,
  isTitleBandDivergence,
  isTitleBandOpeningDivergence,
  isTitleBandStackDivergence,
  judgeActionAgainstBandEnd,
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

// FIKSTURY OSI POZIOMEJ, tak samo ODCZYTANE, nie wpisane — z przelotu
// `LAYOUT_PORT=5311 npm run test:renderer-layout` z 2026-08-10, wyjście verbatim
// w `dowody/c2-czerwien-poziom.txt`. Raport drukuje przy każdym paśmie
// `content ends x=… (right x=… − padding …) column-gap …`, i to jest jedyne
// miejsce, z którego te trzy liczby dają się przepisać.
//
// Projekty: pasmo bez wyściółki kończy się na 1400, `column-gap` 16, akcja
// „New project" x 1265–1400 — odstęp 0. To jest świadek osi poziomej.
const PROJECTS_BAND = { contentRight: 1400, columnGap: 16 };
const PROJECTS_ACTION_X = { right: 1400 };
// Organizacje: to samo pasmo, ale akcja siedzi w `.crumbbar` przy LEWEJ
// krawędzi, x 276–445,4 — odstęp 954,6 przy tolerancji 16.
const ORGANIZATIONS_ACTION_X = { right: 445.4 };
// Biblioteka: JEDYNE pasmo z wyściółką (`padding-inline: var(--space-6)`),
// prawa krawędź 1440, wyściółka 24, więc treść kończy się na 1416. Bez odjęcia
// wyściółki każda akcja tego ekranu miałaby stały, fałszywy odstęp 24.
const LIBRARY_BAND = { contentRight: 1416, columnGap: 16 };

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

// ── OŚ POZIOMA ──────────────────────────────────────────────────────────────

test("an action flush with the band's content end is FLUSH_END", () => {
  const judged = judgeActionAgainstBandEnd({
    band: PROJECTS_BAND,
    action: PROJECTS_ACTION_X,
  });
  assert.equal(judged.inlineState, "FLUSH_END");
  assert.equal(judged.endGap, 0);
  // TOLERANCJA JEST ZAPISANA, i to jest ta sama poprawka, którą oś pionowa
  // dostała po przeglądzie: bez tej asercji jedyne miejsce z zapisanym progiem
  // byłoby prozą, a proza nie pada.
  assert.equal(judged.inlineTolerance, 16);
});

test("an action at the band's start is INSET_FROM_END, not merely 'present'", () => {
  const judged = judgeActionAgainstBandEnd({
    band: PROJECTS_BAND,
    action: ORGANIZATIONS_ACTION_X,
  });
  assert.equal(judged.inlineState, "INSET_FROM_END");
  assert.equal(judged.endGap, 954.6);
});

// KRAWĘDŹ TREŚCI, NIE KRAWĘDŹ RAMKI. Biblioteka jest jedynym pasmem
// z wyściółką, więc jest jedynym miejscem, gdzie ta różnica jest widoczna —
// i dokładnie dlatego musi mieć test. Akcja dosunięta do końca TREŚCI kończy
// się na 1416, a nie na 1440; reguła czytająca `rect.right` czerwieniłaby ją
// odstępem równym wyściółce, czyli nad ekranem, którego nikt nie zepsuł.
test("a padded band is measured to its content edge, not its border edge", () => {
  assert.equal(
    judgeActionAgainstBandEnd({
      band: LIBRARY_BAND,
      action: { right: 1416 },
    }).inlineState,
    "FLUSH_END",
  );
  assert.equal(
    judgeActionAgainstBandEnd({
      band: LIBRARY_BAND,
      action: { right: 1440 },
    }).endGap,
    -24,
  );
});

// TA SAMA UMOWA CO W PIONIE: ten sam układ przy 200% tekstu ma dać ten sam
// werdykt, bo tolerancją jest `column-gap` pasma, który jest w `rem`.
test("the inline verdict is scale-free: the same layout at 200% judges identically", () => {
  assert.equal(
    judgeActionAgainstBandEnd({
      band: { contentRight: 2800, columnGap: 32 },
      action: { right: 2800 },
    }).inlineState,
    "FLUSH_END",
  );
  assert.equal(
    judgeActionAgainstBandEnd({
      band: { contentRight: 2800, columnGap: 32 },
      action: { right: 890.8 },
    }).inlineState,
    "INSET_FROM_END",
  );
});

// Granica po OBU stronach, tak samo jak przy tolerancji pionowej — inaczej „≤"
// kontra „<" przechodzi niezauważone. Lejek stoi dziś DOKŁADNIE na niej
// (odstęp 16 przy tolerancji 16), więc ta asercja nie jest hipotetyczna.
test("the inline tolerance is the band's own column gap, inclusive", () => {
  const band = { contentRight: 1400, columnGap: 16 };
  assert.equal(
    judgeActionAgainstBandEnd({ band, action: { right: 1384 } }).inlineState,
    "FLUSH_END",
  );
  assert.equal(
    judgeActionAgainstBandEnd({ band, action: { right: 1383.9 } }).inlineState,
    "INSET_FROM_END",
  );
});

// `column-gap: normal` rozwiązuje się do NaN, a NaN w porównaniu jest cichym
// „nie" — bez tej gałęzi pasmo bez zadeklarowanego odstępu wracałoby
// INSET_FROM_END nawet dla akcji stojącej dokładnie na krawędzi.
test("a band that declares no column gap gets a tolerance of zero, not NaN", () => {
  const band = { contentRight: 1400, columnGap: Number.NaN };
  const flush = judgeActionAgainstBandEnd({ band, action: { right: 1400 } });
  assert.equal(flush.inlineTolerance, 0);
  assert.equal(flush.inlineState, "FLUSH_END");
  assert.equal(
    judgeActionAgainstBandEnd({ band, action: { right: 1399.9 } }).inlineState,
    "INSET_FROM_END",
  );
});

test("one action at the band's end wins over any number of actions away from it", () => {
  const decision = classifyTitleBandInline({
    band: PROJECTS_BAND,
    actions: [ORGANIZATIONS_ACTION_X, PROJECTS_ACTION_X],
  });
  assert.equal(decision.inlineState, "FLUSH_END");
  assert.equal(decision.judged.length, 2);
});

test("a screen with no action has no inline verdict either, only NO_ACTION", () => {
  assert.deepEqual(
    classifyTitleBandInline({ band: PROJECTS_BAND, actions: [] }),
    {
      inlineState: "NO_ACTION",
      judged: [],
    },
  );
});

test("a pass with no FLUSH_END anywhere is a broken horizontal rule, not a finding", () => {
  const failures = classifyTitleBandCensus({
    walk,
    measured: measured.map((entry) =>
      entry.inlineState === "FLUSH_END"
        ? { ...entry, inlineState: "INSET_FROM_END" }
        : entry,
    ),
    rows,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^TITLE_BAND_NEVER_FLUSH_END:/u);
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
  for (const row of TITLE_BAND_ROWS) {
    assert.ok(
      TITLE_BAND_STATES.includes(row.today),
      `${row.id} declares today="${row.today}", which is not a state this rule returns`,
    );
    // TE SAME TRZY ASERCJE NAD TRZEMA NOWYMI KOLUMNAMI, bo kolumna, której nikt
    // nie waliduje, jest napisem — a literówka w napisie deklaracji jest cichym
    // zezwoleniem na wszystko (ta sama nota stoi przy `TITLE_BAND_STATES`).
    assert.ok(
      TITLE_BAND_STATES.includes(row.prototypeRow),
      `${row.id} declares prototypeRow="${row.prototypeRow}", which is not a state this rule returns`,
    );
    assert.ok(
      TITLE_BAND_INLINE_STATES.includes(row.todayInline),
      `${row.id} declares todayInline="${row.todayInline}", which is not a state the inline rule returns`,
    );
    assert.ok(
      TITLE_BAND_INLINE_STATES.includes(row.prototypeInline),
      `${row.id} declares prototypeInline="${row.prototypeInline}", which is not a state the inline rule returns`,
    );
    // OŚ POZIOMA NIE MOŻE MÓWIĆ O EKRANIE BEZ AKCJI CZEGOŚ INNEGO NIŻ PION.
    // Bez tego wiersz „NO_ACTION w pionie, FLUSH_END w poziomie" kompiluje się
    // i opisuje ekran, którego nie ma.
    assert.equal(
      row.today === "NO_ACTION",
      row.todayInline === "NO_ACTION",
      `${row.id} says today="${row.today}" and todayInline="${row.todayInline}" — a screen ` +
        "either has an action on both axes or on neither",
    );
  }
});

// LICZBA JEST ZAPISANA PRECYZYJNIE, żeby wiersz nie mógł zniknąć po cichu —
// ta sama umowa co `VISUAL_LANGUAGE_COUNT_DRIFT`. Jej uzasadnieniem jest
// WYLICZENIE PODMIOTÓW, a nie zgodność sumy z rejestrem: rejestr rozjazdów
// (`faza-4-porownanie-ekranow.md`) liczy pod przyczyną C2 dziewięć wpisów, ten
// przelot dochodzi do SIEDMIU i różnica rozkłada się na cztery udowodnione
// ruchy —
//
//   −1  Notatki i Źródła to JEDEN wiersz `library`: rejestr porównywał dwa
//       zrzuty, a pasmo jest jedno (`LibraryShell.tsx:80-90`);
//   −1  rekord projektu i jego zakładka komentarzy to JEDEN wiersz
//       `projects/record:project`: `.crumbs` z `.actions` renderuje się POZA
//       panelem zakładki (`ProjectRecordScreen.tsx:300-306` wobec `:308`);
//   −1  i TEN JEDEN wiersz NIE JEST rozjazdem POŁOŻENIA, co wyszło dopiero
//       w locie C2: prototyp stawia akcję rekordu w crumbbarze, a tytuł rekordu
//       W NASTĘPNYM PAŚMIE (`v3/screens/record.js:429-433` skleja `crumbbar(…)`
//       z `rcShell(`<h1 class="rec-title">…`)`), czyli robi DOKŁADNIE to samo,
//       co nasz `.crumbs` nad `header._header`. Rejestr mówi o tym ekranie to
//       samo — „w pasie akcji NAD TYTUŁEM nie ma ani jednej powierzchni
//       akcentowej" — i plan liczy go pod przyczyną C4 (farba), nie C2
//       (położenie). Wiersz zostaje MIERZONY, DRUKOWANY i osądzany na obu
//       osiach; zmienia się to, z czym się go porównuje, a nie to, czy się go
//       porównuje;
//   +1  `tasks` jest podmiotem, którego rejestr pod tą przyczyną NIE MA —
//       prototyp stawia w paśmie Zadań „+ New task", nasze pasmo nie niesie ani
//       jednej akcji.
//
// 9 − 3 + 1 = 7. Rekord zadania NIE jest tu piątym ruchem: symetrycznie
// oceniony jest MATCH-em, nie rozjazdem (patrz predykat w nagłówku modułu).
//
// Z TYCH SIEDMIU LOT C2 ZAMKNĄŁ SZEŚĆ, a Spotkania — siódme i jedyne oddane
// przez tamten lot JAKO NIEZROBIONE — zamknął lot D1 Fazy D: `.meeting-hero`
// nie istnieje, ekran rysuje `SurfaceTitleBand` z akcją „Import from Jamie"
// u końca pasma. Asercja niżej pilnuje więc PUSTEJ listy, a nie jednego wiersza.
test("the canonical screen list holds fifteen screens and no divergence is left", () => {
  assert.equal(TITLE_BAND_ROWS.length, 15);
  // SIEDEM ZNALEZIONYCH, SZEŚĆ ZAMKNIĘTYCH W LOCIE C2, SIÓDME W LOCIE D1.
  // Lista jest tym, co ZOSTAJE, a nie tym, co przelot kiedyś naliczył —
  // wyliczenie siedmiu podmiotów stoi w komentarzu wyżej i jest historią tego
  // pomiaru, nie stanem produktu.
  assert.deepEqual(
    TITLE_BAND_DIVERGENCES.map((row) => row.id),
    [],
  );
  // I TO JEST WARUNEK UZBROJENIA, ZAPISANY JAKO ASERCJA, A NIE JAKO PROZA:
  // przyrząd wolno uzbroić DOKŁADNIE wtedy, gdy lista rozjazdów jest pusta.
  // Odwrotny kierunek jest tak samo pilnowany — uzbrojony przyrząd nad niepustą
  // listą robiłby z bramki układu czerwień do końca fali.
  assert.equal(TITLE_BAND_ACTION_ARMED, TITLE_BAND_DIVERGENCES.length === 0);
  assert.equal(TITLE_BAND_ACTION_ARMED, true);
});

// SZEŚĆ EKRANÓW ODDANYCH PRZEZ LOT C2, WYPISANYCH Z NAZWY. Bez tej asercji
// „lista rozjazdów jest prawie pusta" dałoby się osiągnąć też przez zepsucie
// kolumny `prototypeRow` — a to jest ta sama sztuczka co skreślenie wiersza.
// Tu każdy z sześciu musi mieć zmierzone `IN_BAND` I `FLUSH_END` naprzeciw
// prototypowego `IN_BAND`/`FLUSH_END`.
test("the six screens lot C2 delivered stand in their title band, at its end", () => {
  const delivered = [
    "tasks",
    "pipeline",
    "renewals",
    "organizations",
    "people",
    "library",
  ];
  for (const id of delivered) {
    const row = TITLE_BAND_ROWS.find((candidate) => candidate.id === id);
    assert.equal(row.prototype, "action", id);
    assert.equal(row.prototypeRow, "IN_BAND", id);
    assert.equal(row.prototypeInline, "FLUSH_END", id);
    assert.equal(row.today, "IN_BAND", id);
    assert.equal(row.todayInline, "FLUSH_END", id);
    assert.equal(isTitleBandDivergence(row), false, id);
  }
});

// PRZYRZĄD, KTÓRY PORÓWNUJE Z LITERAŁEM, NIE PORÓWNUJE Z PROTOTYPEM, i ten test
// jest jedynym miejscem, w którym ta różnica jest asertowana. Ekran rekordu
// projektu ma dziś `today: "ABOVE_BAND"` — gdyby predykat wrócił do wpisanego
// „IN_BAND", ten wiersz stałby się rozjazdem NIESPEŁNIALNYM: poprawka wierna
// prototypowi zostawiłaby go czerwonym, a poprawka zielona musiałaby przenieść
// akcję tam, gdzie prototyp jej NIE MA.
test("the record screen is judged against the prototype's own row, not a literal", () => {
  const record = TITLE_BAND_ROWS.find(
    (row) => row.id === "projects/record:project",
  );
  assert.equal(record.prototype, "action");
  assert.equal(record.prototypeRow, "ABOVE_BAND");
  assert.equal(record.today, "ABOVE_BAND");
  assert.equal(isTitleBandDivergence(record), false);
  assert.equal(
    isTitleBandDivergence({ ...record, today: "IN_BAND" }),
    true,
    "moving this action into the title row would DIVERGE from the prototype, " +
      "which puts it a row above — the predicate has to say so",
  );
  // A powierzchnie dalej porównują się z rzędem tytułu, więc korekta rekordu
  // nie zdjęła nikomu innemu wymagania.
  assert.deepEqual(
    TITLE_BAND_ROWS.filter((row) => row.prototypeRow === "IN_BAND").map(
      (row) => row.id,
    ),
    [
      "projects",
      "tasks",
      "pipeline",
      "renewals",
      "organizations",
      "people",
      "meetings",
      "library",
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

// ── PRZYRZĄD P3: SKŁAD PASMA I MIEJSCE WIDOCZNEGO TYTUŁU ────────────────────

// STRAŻNIK SŁOWNIKA, i to nie jest formalność: obie nowe kolumny są NAPISAMI,
// a literówka w napisie deklaracji jest cichym zezwoleniem na wszystko —
// `"ONE_ROV"` nigdy nie zrówna się z żadnym pomiarem, więc wiersz stałby się
// wiecznym rozjazdem, którego nie da się zamknąć.
//
// SŁOWNIKI SĄ DWA NA OŚ, I TO TEŻ JEST TREŚĆ. Kolumna `today` jest MIERZONA
// przeglądarką, kolumna prototypu CZYTANA ze źródła — więc prototyp ma prawo
// powiedzieć „nie ma takiego ekranu", a pomiar nie ma; i odwrotnie: pomiar
// rozróżnia `OPENING_SMALLER` od `NO_OPENING`, a lektura prototypu tego
// rozróżnienia nie unosi i dlatego go nie deklaruje.
test("both new axes declare their states, and the two sides use different dictionaries", () => {
  assert.deepEqual(TITLE_BAND_STACK_STATES, ["ONE_ROW", "STACKED"]);
  assert.deepEqual(TITLE_BAND_OPENING_STATES, [
    "OPENING_2XL",
    "OPENING_SMALLER",
    "NO_OPENING",
  ]);
  for (const row of TITLE_BAND_ROWS) {
    assert.ok(
      TITLE_BAND_STACK_STATES.includes(row.todayStack),
      `${row.id} measures an undeclared stack state: ${row.todayStack}`,
    );
    assert.ok(
      TITLE_BAND_PROTOTYPE_STACK_STATES.includes(row.prototypeStack),
      `${row.id} claims an undeclared prototype stack state: ${row.prototypeStack}`,
    );
    assert.ok(
      TITLE_BAND_OPENING_STATES.includes(row.todayOpening),
      `${row.id} measures an undeclared opening state: ${row.todayOpening}`,
    );
    assert.ok(
      TITLE_BAND_PROTOTYPE_OPENING_STATES.includes(row.prototypeOpening),
      `${row.id} claims an undeclared prototype opening state: ${row.prototypeOpening}`,
    );
    // `NO_SCREEN` NIE JEST WOLNYM WYBOREM: wolno go postawić DOKŁADNIE tam,
    // gdzie oś akcji już powiedziała „no-screen". Inaczej dowolny wiersz dałby
    // się wyciszyć na dwóch nowych osiach, nie mówiąc o tym ani słowa.
    assert.equal(
      row.prototypeStack === "NO_SCREEN",
      row.prototype === "no-screen",
      `${row.id} silences the stack axis without declaring the screen missing`,
    );
    assert.equal(
      row.prototypeOpening === "NO_SCREEN",
      row.prototype === "no-screen",
      `${row.id} silences the opening axis without declaring the screen missing`,
    );
  }
});

// KAŻDA NOWA KOLUMNA NIESIE ADRES PO STRONIE PROTOTYPU, tak samo jak `cite` —
// inaczej dwie z czterech osi byłyby jedynymi bez źródła, a „prototyp składa
// pasmo jednym wierszem" byłoby twierdzeniem bez odsyłacza. Regex dopuszcza
// `.css`, bo obie te osi stoją na ARKUSZU prototypu tak samo jak na jego JS —
// `.crumbs .cur` i `--text-2xl` są deklaracjami CSS.
test("both new axes cite the prototype with a file and a line on every row", () => {
  const address = /v3\/(app\.(js|css)|screens\/[a-z]+\.(js|css)):\d+/u;
  for (const row of TITLE_BAND_ROWS) {
    assert.match(
      row.citeStack,
      address,
      `${row.id} does not cite the prototype's band composition`,
    );
    assert.match(
      row.citeOpening,
      address,
      `${row.id} does not cite what opens the prototype's content`,
    );
  }
});

// ROZJAZDY WYPISANE Z NAZWY, nie policzone. „Pięć rozjazdów" dałoby się
// osiągnąć również przez zepsucie kolumny prototypu na innych pięciu ekranach.
test("the stack axis is red on exactly the five screens that wrap their title", () => {
  assert.deepEqual(
    TITLE_BAND_STACK_DIVERGENCES.map((row) => row.id),
    ["calendar", "inbox", "settings", "projects", "library"],
  );
  // WARUNEK UZBROJENIA JAKO ASERCJA, nie jako proza — ta sama umowa co przy
  // osi akcji, w obie strony.
  assert.equal(
    TITLE_BAND_STACK_ARMED,
    TITLE_BAND_STACK_DIVERGENCES.length === 0,
  );
  assert.equal(TITLE_BAND_STACK_ARMED, false);
});

test("the opening axis is red on exactly the two screens the prototype opens at 2xl", () => {
  assert.deepEqual(
    TITLE_BAND_OPENING_DIVERGENCES.map((row) => row.id),
    ["today", "calendar"],
  );
  assert.equal(
    TITLE_BAND_OPENING_ARMED,
    TITLE_BAND_OPENING_DIVERGENCES.length === 0,
  );
  assert.equal(TITLE_BAND_OPENING_ARMED, false);
});

// EKRAN BEZ PROTOTYPU NIE MOŻE BYĆ ROZJAZDEM NA ŻADNEJ Z CZTERECH OSI. Bez
// tego P3 dokładałby rozjazd NIESPEŁNIALNY — wiersz, którego żadna poprawka nie
// zamyka, bo nie ma wzorca, do którego miałaby doprowadzić. Ta sama pułapka,
// którą oś akcji zapłaciła dwa razy (predykat farby i predykat miejsca).
test("a screen the prototype does not have is never a divergence on the new axes", () => {
  assert.equal(
    isTitleBandStackDivergence({
      prototype: "no-screen",
      todayStack: "STACKED",
      prototypeStack: "NO_SCREEN",
    }),
    false,
  );
  assert.equal(
    isTitleBandOpeningDivergence({
      prototype: "no-screen",
      todayOpening: "OPENING_2XL",
      prototypeOpening: "NO_SCREEN",
    }),
    false,
  );
});

// PORÓWNANIE OSI 4 JEST BINARNE PO OBU STRONACH, i ten test jest jedynym
// miejscem, które to zapisuje. Ekran, na którym prototyp nie otwiera treści
// wielkości 2xl, jest ZGODNY zarówno wtedy, gdy nasza treść otwiera się
// mniejszym nagłówkiem, jak i wtedy, gdy nie otwiera się żadnym — bo lektura
// prototypu nie unosi tego rozróżnienia i orzekanie o nim byłoby przepisaniem
// wartości prototypu zamiast jej zmierzenia.
test("the opening axis judges the 2xl question, not the three measured states", () => {
  assert.equal(
    isTitleBandOpeningDivergence({
      prototype: "no-action",
      prototypeOpening: "NOT_2XL",
      todayOpening: "OPENING_SMALLER",
    }),
    false,
  );
  assert.equal(
    isTitleBandOpeningDivergence({
      prototype: "no-action",
      prototypeOpening: "NOT_2XL",
      todayOpening: "NO_OPENING",
    }),
    false,
  );
  assert.equal(
    isTitleBandOpeningDivergence({
      prototype: "no-action",
      prototypeOpening: "OPENING_2XL",
      todayOpening: "OPENING_SMALLER",
    }),
    true,
  );
  assert.equal(
    isTitleBandOpeningDivergence({
      prototype: "action",
      prototypeOpening: "NOT_2XL",
      todayOpening: "OPENING_2XL",
    }),
    true,
  );
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

test("the position is armed and the pending rule still holds as a rule", () => {
  assert.equal(TITLE_BAND_ACTION_ARMED, true);
  // STATUS NAZYWA TO, CO ZOSTAŁO, A NIE LOT, KTÓRY JUŻ POSZEDŁ. Do lotu C2
  // brzmiał „pending: FAZA C, lot C2", potem „pending: pasmo akcji Spotkań
  // (.meeting-hero)" — a od lotu D1 nie ZOSTAŁO nic, więc mówi „enforced".
  assert.equal(TITLE_BAND_ACTION_STATUS, "enforced");
  // REGUŁA TRYBU RAPORTU JEST DALEJ ASERTOWANA, choć produkt jej dziś nie
  // używa: to jest funkcja nad liczbami, nie stan tej aplikacji, a przyrząd,
  // który po uzbrojeniu przestaje pilnować własnej ścieżki raportu, oddaje ją
  // pierwszemu locie, który znów coś odłoży.
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
// ŚWIADKOWIE OSI P3 W KAŻDEJ FIKSTURZE ZDROWEGO PRZELOTU, i to nie jest
// ozdoba fikstury. `TITLE_BAND_NEVER_ONE_ROW` czyta `entry.stack?.state`, więc
// wpis BEZ tego pola zapala go tak samo jak wpis, który wrócił `STACKED` — i
// tak ma być: pole, którego przelot nie przepisał do `judged`, jest awarią
// przyrządu, a nie brakiem danych. Fikstury muszą więc nieść to, co niesie
// zdrowy przelot, inaczej testy niżej mierzyłyby własne niedbalstwo.
const ONE_ROW_WITNESS = {
  stack: { state: "ONE_ROW" },
  opening: { state: "OPENING_SMALLER" },
};
const measured = [
  {
    id: "today",
    state: "NO_ACTION",
    inlineState: "NO_ACTION",
    titles: 1,
    ...ONE_ROW_WITNESS,
  },
  {
    id: "projects",
    state: "IN_BAND",
    inlineState: "FLUSH_END",
    titles: 1,
    stack: { state: "STACKED" },
    opening: { state: "OPENING_SMALLER" },
  },
  {
    id: "pipeline",
    state: "BELOW_BAND",
    inlineState: "INSET_FROM_END",
    titles: 1,
    ...ONE_ROW_WITNESS,
  },
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
      {
        id: "projects",
        state: "IN_BAND",
        inlineState: "FLUSH_END",
        titles: 1,
        ...ONE_ROW_WITNESS,
      },
      { id: "pipeline", state: "BELOW_BAND", titles: 1, ...ONE_ROW_WITNESS },
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
      {
        id: "projects",
        state: "IN_BAND",
        inlineState: "FLUSH_END",
        titles: 1,
        ...ONE_ROW_WITNESS,
      },
      { id: "pipeline", state: "BELOW_BAND", titles: 1, ...ONE_ROW_WITNESS },
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
      {
        id: "projects",
        state: "IN_BAND",
        inlineState: "FLUSH_END",
        titles: 1,
        ...ONE_ROW_WITNESS,
      },
      { id: "pipeline", state: "BELOW_BAND", titles: 1, ...ONE_ROW_WITNESS },
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
    measured: [
      ...measured,
      { id: "people", state: "BELOW_BAND", titles: 1, ...ONE_ROW_WITNESS },
    ],
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

// TEN SAM STRAŻNIK NA OSI SKŁADU. Reguła osi 3 jest koniunkcją dwóch członów
// („tytuł jest bezpośrednim dzieckiem pasma" I „nic z tekstem nie stoi przed
// nim"), więc literówka w którymkolwiek z nich zwraca `STACKED` na wszystkich
// piętnastu ekranach — a przelot, o którym wiadomo wyłącznie, że umie
// czerwienieć, jest nieodróżnialny od zepsutego.
test("a pass whose bands never come back one-row is reported as a broken probe", () => {
  const failures = classifyTitleBandCensus({
    walk,
    measured: measured.map((entry) => ({
      ...entry,
      stack: { state: "STACKED" },
    })),
    rows,
  });
  assert.ok(
    failures.some((failure) => failure.startsWith("TITLE_BAND_NEVER_ONE_ROW")),
  );
});

// POLE, KTÓREGO PRZELOT NIE PRZEPISAŁ, JEST AWARIĄ — NIE BRAKIEM DANYCH.
// `judged` buduje się WYBOREM pól, nie rozłożeniem obiektu, więc pominięcie
// `stack` przy `judged.push` dawałoby `undefined` na ZDROWYM drzewie. Ten test
// przypina kierunek pomyłki: `undefined` ma zapalać strażnika, a nie go mijać.
test("a pass that forgot to carry the stack field fails like a pass with no witness", () => {
  const failures = classifyTitleBandCensus({
    walk,
    measured: measured.map((entry) => {
      const withoutStack = { ...entry };
      delete withoutStack.stack;
      return withoutStack;
    }),
    rows,
  });
  assert.ok(
    failures.some((failure) => failure.startsWith("TITLE_BAND_NEVER_ONE_ROW")),
  );
});

// STRAŻNIK OSI OTWARCIA MÓWI „ROZWIĄZAŁA SIĘ", A NIE „ZNALAZŁA 2XL", i ten test
// pilnuje właśnie tej różnicy: przelot, w którym ŻADEN ekran nie otwiera treści
// na 2xl, jest dziś POPRAWNYM wynikiem — o to ta oś pyta. Przelot, w którym
// żaden ekran nie ma w treści ANI JEDNEGO nagłówka, jest awarią sondy.
test("an opening axis that resolved nowhere is a broken probe, but zero 2xl hits is not", () => {
  const noHeadings = classifyTitleBandCensus({
    walk,
    measured: measured.map((entry) => ({
      ...entry,
      opening: { state: "NO_OPENING" },
    })),
    rows,
  });
  assert.ok(
    noHeadings.some((failure) =>
      failure.startsWith("TITLE_BAND_OPENING_NEVER_RESOLVED"),
    ),
  );
  const noneAt2xl = classifyTitleBandCensus({ walk, measured, rows });
  assert.deepEqual(noneAt2xl, []);
});
