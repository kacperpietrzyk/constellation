// Break-testy lotu D3 — Biblioteka rozwinięta z JEDNEGO celu o trzech
// odczytach na TRZY pozycje nawigacji: `notes`, `sources`, `captures`.
//
// Po co osobny plik, skoro w #211 stanął `scripts/break-test.mjs`: tamten jest
// PĘTLĄ, a to jest LISTA ZŁAMAŃ. Pętla pilnuje, żeby złamanie naprawdę doszło
// do `dist` (dowód przebudowy) i żeby edycja naprawdę coś zmieniła; ten plik
// mówi, CO w tym locie miało prawo paść i dlaczego. Precedens:
// `scripts/break-access-retirement.mjs` i `scripts/break-activity-retirement.mjs`
// — dwa loty, które robiły rzecz ODWROTNĄ (scalały cel w inny), więc ich lista
// złamań jest tu najbliższym wzorcem.
//
//   node scripts/break-library-split.mjs
//
// STATUS TEJ LISTY, POWIEDZIANY WPROST, BO INACZEJ CZYTAŁABY SIĘ JAK POMIAR:
// brief lotu D3 ZABRONIŁ uruchamiania harnessu, więc te złamania są
// ZADEKLAROWANE i NIEWYKONANE. Każde nazywa asercję, która ma po nim zgasnąć,
// żeby dało się to rozstrzygnąć jednym przebiegiem, a nie oceną. Raport lotu
// podaje trzy liczby — zadeklarowane / wykonane / czerwone — i dwie ostatnie
// są w nim zerami. Zieleń któregokolwiek z tych złamań jest znaleziskiem
// o PRZYRZĄDZIE, nie o produkcie.
//
// BRAMKA UKŁADU JEST W TRZECIEJ PĘTLI i chodzi tylko z jawnym `LAYOUT_PORT`:
// port domyślny bywa na tej maszynie w rękach sąsiedniego worktree, a przelot
// nad cudzą aplikacją wraca ZIELONY.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Podmiana JEDNEGO wystąpienia, z awarią przy zeru i przy wielu. */
const replaceOnce = (text, needle, replacement, what) => {
  const at = text.indexOf(needle);
  if (at === -1)
    throw new Error(
      `${what}: the text this break edits is not there any more, so the break ` +
        "would be a no-op and the loop would report green on nothing.",
    );
  if (text.indexOf(needle, at + needle.length) !== -1)
    throw new Error(
      `${what}: the text this break edits appears more than once, so the edit ` +
        "would not land where it is aimed.",
    );
  return text.slice(0, at) + replacement + text.slice(at + needle.length);
};

const REGISTRY = "packages/desktop-preload/src/surface-registry.ts";
const NAVIGATION = "packages/desktop-ui/src/client/shell-navigation.ts";
const SHELL = "packages/desktop-ui/src/library/LibraryShell.tsx";

// ── PĘTLA A: zapisany stan powłoki i rejestr celów ──────────────────────────
const UNIT_BREAKS = [
  {
    // NAJDROŻSZE ZŁAMANIE TEGO LOTU, i jest to ta sama pozycja, co w #215
    // i #216 — tyle że tam wpis DOCHODZIŁ przy scaleniu celu, a tu przy jego
    // ROZDZIALE. Mapa wycofanych celów jest kluczowana zwykłym `string`iem,
    // więc brak wpisu przechodzi kompilację BEZ SŁOWA; `library` stał
    // w KAŻDYM buildzie 0.2.0, więc przy pierwszym starcie po aktualizacji
    // zapisana sesja z tą zakładką jest odrzucana W CAŁOŚCI — każda zakładka,
    // ulubiona pozycja i cała historia.
    //
    // MA ZGASNĄĆ: „sends a saved Library tab with no reading to Notes"
    // (`desktop-ui/test/shell-navigation.test.ts`).
    name: "drop the retired-surface entry the split target needs",
    file: REGISTRY,
    edit: (text) =>
      replaceOnce(
        text,
        '    library: "notes",\n',
        "",
        "the retired-surface entry for the split target",
      ),
  },
  {
    // ROZDZIAŁ JEDNEJ ZAKŁADKI NA TRZY CELE. Bez pierwszeństwa pola
    // `libraryReading` migracja ma do dyspozycji sam identyfikator
    // powierzchni, a ten umie odpowiedzieć tylko „Notatki" — więc zapisana
    // zakładka Historii wrzutek albo Źródeł ląduje po cichu na innym ekranie
    // niż ten, który człowiek zamknął. Nic nie rzuca.
    //
    // MA ZGASNĄĆ: „splits one saved Library tab onto the reading it was left
    // on".
    name: "resolve a saved knowledge tab by the retired-id map alone",
    file: NAVIGATION,
    edit: (text) =>
      replaceOnce(
        text,
        '  const resolved =\n    context.surface === "library" && isLibraryReading(context.libraryReading)\n      ? context.libraryReading\n      : resolveDesktopSurface(context.surface);',
        "  const resolved = resolveDesktopSurface(context.surface);",
        "the reading-first precedence in the restore migration",
      ),
  },
  {
    // KLUCZ ZAKŁADKI MUSI IŚĆ ZA POWIERZCHNIĄ, NA KTÓRĄ TRAFIŁA. Stary napis
    // `destination:library` rozwiązuje się przez mapę wycofań na
    // `destination:notes`, więc odtworzona zakładka Historii wrzutek stałaby
    // pod kluczem Notatek: pokazywałaby jeden ekran pod kluczem drugiego,
    // a otwarcie Notatek podmieniłoby ją zamiast otworzyć nową.
    //
    // MA ZGASNĄĆ: para asercji o kluczu w tym samym teście, co wyżej.
    //
    // `as string` MUSI ZOSTAĆ W PODSTAWIENIU: `context.key` jest w tym miejscu
    // typu `unknown`, więc bez rzutowania złamanie kładłoby BUILD, a nie
    // asercję — czyli mierzyłoby kompilator zamiast zapisanego stanu.
    name: "rebuild the tab key from the saved string",
    file: NAVIGATION,
    edit: (text) =>
      replaceOnce(
        text,
        "    key: `destination:${resolved}`,\n    surface: resolved,",
        "    key: migrateContextKey(context.key as string),\n    surface: resolved,",
        "the tab key rebuilt from the resolved surface",
      ),
  },
  {
    // AKTYWNY KLUCZ TO DRUGA POŁOWA TEJ SAMEJ POPRAWKI I OSOBNE ZŁAMANIE, bo
    // pada inaczej: `activeKey` przeliczony z napisu daje `destination:notes`
    // przy zakładce `destination:captures`, czyli wskazuje NA NIC — a wtedy
    // `restoreShellNavigation` odrzuca CAŁĄ sesję, nie tylko tę jedną zakładkę.
    //
    // MA ZGASNĄĆ: asercja `restored.activeKey === "destination:captures"`.
    //
    // WARUNEK JEST PRZESTAWIANY, A NIE ZASTĘPOWANY `false`, i to jest wymóg:
    // `savedActiveIndex` musi zostać UŻYTY, bo inaczej pada `tsc` i złamanie
    // mierzy kompilator zamiast odtwarzania sesji. `>= state.tabs.length` jest
    // fałszywe dla każdego legalnego indeksu, więc gałąź się nie wykona.
    name: "recompute the active key instead of following its tab",
    file: NAVIGATION,
    edit: (text) =>
      replaceOnce(
        text,
        "    const activeKey =\n      savedActiveIndex >= 0",
        "    const activeKey =\n      savedActiveIndex >= state.tabs.length",
        "the active-key handoff to the migrated tab",
      ),
  },
  {
    // CYFRY SĄ WYCZERPANE, a ten lot dołożył dwa cele — więc pytanie „czy
    // rozdział przenumerował skróty" musi mieć odpowiedź z asercji, a nie
    // z zapewnienia w komentarzu rejestru. Złamanie daje Historii wrzutek
    // dziewiątkę, którą nosi `notes`: zbiór skrótów przestaje być unikalny,
    // a asercja CAŁEGO zbioru par (id, skrót) przestaje pasować.
    //
    // MA ZGASNĄĆ: „desktop surface registry is unique, bounded, and derives
    // its vocabulary" (`desktop-preload/test/client.test.ts`), i to w dwóch
    // miejscach naraz — pojedynczy klucz jest ślepy na przestawienie.
    name: "give Capture history the digit Notes carries",
    file: REGISTRY,
    edit: (text) =>
      replaceOnce(
        text,
        '    id: "captures",\n    label: "Capture history",\n    icon: "capture-history",\n    group: "Knowledge",\n    shortcut: null,',
        '    id: "captures",\n    label: "Capture history",\n    icon: "capture-history",\n    group: "Knowledge",\n    shortcut: 9,',
        "the Capture history shortcut",
      ),
  },
];

// ── PĘTLA B: przyrządy czytające ŹRÓDŁA, nie aplikację ──────────────────────
const SOURCE_INSTRUMENT_BREAKS = [
  {
    // TRZY DEKLARACJE WYSOKOŚCI, PO JEDNEJ NA EKRAN. Zlanie dwóch w jedną
    // nazwę zabiera wąskim przelotom podmiot: `heightBoundExpected` filtruje
    // zbiór deklaracji przez listę powierzchni przelotu, więc ekran, którego
    // deklaracja nosi CUDZĄ nazwę, wypada ze strażnika wysokości po cichu —
    // ten sam kształt, co „pusta fikstura chroni fałszywą asercję".
    //
    // MA ZGASNĄĆ: „the height-bound registry is the same mechanism, read
    // a second time" (`scripts/renderer-declarations.test.mjs`).
    name: "collapse the Sources height-bound declaration onto the Notes one",
    file: SHELL,
    edit: (text) =>
      replaceOnce(
        text,
        'data-height-bound="sources"',
        'data-height-bound="notes"',
        "the Sources height-bound declaration",
      ),
  },
  {
    // EKRAN, KTÓREGO PROTOTYP NIE MA, NIE MOŻE BYĆ Z PROTOTYPEM ZGODNY.
    // Historia wrzutek nie ma odpowiednika w `DESTINATIONS` prototypu, więc
    // jej wiersz deklaruje `no-screen` — i wtedy trzy osie milkną
    // ZADEKLAROWANYM napisem `NO_SCREEN`. Przestawienie wiersza na
    // `no-action` czyni z tej ciszy ZGODNOŚĆ: przyrząd zaczyna raportować, że
    // aplikacja odtwarza prototyp na ekranie, którego prototyp nie ma.
    //
    // MA ZGASNĄĆ: „both new axes declare their states, and the two sides use
    // different dictionaries" — asercja „silences the stack axis without
    // declaring the screen missing".
    name: "let Capture history claim agreement with a prototype that has no such screen",
    file: "scripts/title-band-action.mjs",
    edit: (text) =>
      replaceOnce(
        text,
        '    prototype: "no-screen",\n    prototypeRow: "NO_ACTION",\n    prototypeInline: "NO_ACTION",\n    cite:\n      "v3: `grep -n capture app.js`',
        '    prototype: "no-action",\n    prototypeRow: "NO_ACTION",\n    prototypeInline: "NO_ACTION",\n    cite:\n      "v3: `grep -n capture app.js`',
        "the Capture history prototype column",
      ),
  },
];

// ── PĘTLA C: bramka układu ──────────────────────────────────────────────────
const LAYOUT_BREAKS = [
  {
    // SZCZEBEL, NIE ROZMIAR. Lot zdjął z Historii wrzutek drugie pasmo tytułu
    // (`h2` o tym samym brzmieniu, co nowy `h1` ekranu) i podniósł nagłówek
    // rejestru z `h3` na `h2`. Przywrócenie `h3` zostawia konspekt `h1 → h3`,
    // czyli pominięty szczebel — a oś konspektu jest TOTALNA nad wszystkimi
    // ekranami i pyta o RANGĘ, nie o rozmiar, więc żaden przyrząd pikselowy
    // tego nie zobaczy.
    //
    // MA ZGASNĄĆ: `HEADING_OUTLINE_SKIPPED_RUNG` na powierzchni `captures`.
    name: "put the capture ledger head back on a skipped rung",
    file: "packages/desktop-ui/src/library/CaptureHistoryReading.tsx",
    edit: (text) =>
      replaceOnce(
        text,
        "              <h2>Kept originals</h2>",
        "              <h3>Kept originals</h3>",
        "the capture ledger head",
      ),
  },
  {
    // MARKER PRZYBYCIA NA NOTATKI. Bez niego trasa czterdziestu jeden par
    // Biblioteki nie ma czym potwierdzić, że kliknięcie w pozycję nawigacji
    // dowiozło EKRAN — a przelot, który zaliczy powłokę zamiast ekranu,
    // zmierzy wszystkie te pary na powierzchni lądowania.
    //
    // MA ZGASNĄĆ: `ROUTED_ROUTE_FAILED` na kroku `surface notes`.
    name: "take Notes its arrival marker",
    file: "packages/desktop-ui/src/library/NotesReading.tsx",
    edit: (text) =>
      replaceOnce(
        text,
        "                          data-note-id={note.id}\n",
        "",
        "the note row arrival marker",
      ),
  },
];

/**
 * Wybór podzbioru złamań po FRAGMENCIE NAZWY — ten sam mechanizm i ta sama
 * umowa co w `scripts/break-visual-language.mjs`: kilka fragmentów rozdziela
 * `|`, a wybór trafiający w NIC pada zamiast wrócić zielony na zerze
 * wykonanych złamań.
 *
 *   BREAK_ONLY="retired-surface entry" node scripts/break-library-split.mjs
 *
 * FRAGMENTY MUSZĄ BYĆ ROZŁĄCZNE I ŻADEN NIE MOŻE ZAWIERAĆ SIĘ W INNYM. Filtr
 * działa przez `includes`, więc fragment będący podciągiem drugiej nazwy
 * uruchomiłby po cichu dwa złamania na jednej bazie — i raport podałby o jedno
 * za mało. Rozłączność nazw z tego pliku jest sprawdzana MASZYNOWO niżej,
 * a nie oceniana wzrokiem.
 */
const only = process.env.BREAK_ONLY ?? "";
const needles = only.split("|").filter((part) => part !== "");
const select = (breaks) =>
  needles.length === 0
    ? breaks
    : breaks.filter((entry) =>
        needles.some((needle) => entry.name.includes(needle)),
      );

// WSZYSTKIE ZADEKLAROWANE, niezależnie od tego, ile z nich TEN przebieg
// uruchomi. Strażnik rozłączności niżej chodzi po tej liście, a nie po liście
// wykonywanej, i to jest poprawka po przeglądzie: gdy `LAYOUT_PORT` nie jest
// ustawiony, lista wykonywana ma 7 z 9 nazw, więc kolizja fragmentu z nazwą
// złamania bramkowego byłaby sprawdzona WYŁĄCZNIE w przebiegach z portem —
// czyli w tych, w których kosztuje najwięcej. Strażnik filtra ma być totalny
// nad tym, co plik DEKLARUJE.
const DECLARED_BREAKS = [
  ...UNIT_BREAKS,
  ...SOURCE_INSTRUMENT_BREAKS,
  ...LAYOUT_BREAKS,
];

const ALL_BREAKS = [...UNIT_BREAKS, ...SOURCE_INSTRUMENT_BREAKS];
const layoutPort = process.env.LAYOUT_PORT;
if (layoutPort !== undefined) ALL_BREAKS.push(...LAYOUT_BREAKS);

// STRAŻNIK SAMEGO FILTRA, nie produktu. Nazwa zawierająca się w innej czyni
// z `BREAK_ONLY` narzędzie, które uruchamia więcej, niż o nie poproszono —
// a wtedy „ile złamań wykonano" przestaje być odpowiedzią na „ile wybrano".
for (const outer of DECLARED_BREAKS)
  for (const inner of DECLARED_BREAKS)
    if (outer !== inner && outer.name.includes(inner.name))
      throw new Error(
        `BREAK_NAMES_NEST: „${inner.name}" is a substring of „${outer.name}", so a ` +
          "BREAK_ONLY fragment aimed at the first would silently run the second too.",
      );

const chosen = select(ALL_BREAKS);
if (needles.length > 0 && chosen.length === 0)
  throw new Error(
    `BREAK_ONLY="${only}" matched none of the ${ALL_BREAKS.length} break(s) THIS RUN can execute, ` +
      "so this run would prove nothing while looking like a pass." +
      (select(DECLARED_BREAKS).length > 0
        ? ` It DOES match ${select(DECLARED_BREAKS).length} declared break(s) that need the layout ` +
          "gate: set LAYOUT_PORT=<free port> and run again."
        : "") +
      "\nNames available in this run:\n" +
      ALL_BREAKS.map((entry) => `  ${entry.name}`).join("\n"),
  );

const results = [];
const failed = [];
const collect = (run) => {
  results.push(...run.results);
  failed.push(...run.failed);
};

const pick = (list) => chosen.filter((entry) => list.includes(entry));

collect(
  runBreakTests({
    root,
    build: { command: "npm", args: ["run", "build"] },
    verify: { command: "node", args: ["scripts/run-tests.mjs"] },
    breaks: pick(UNIT_BREAKS),
  }),
);

collect(
  runBreakTests({
    root,
    build: { command: "npm", args: ["run", "build"] },
    verify: {
      command: "node",
      args: [
        "--test",
        "scripts/renderer-declarations.test.mjs",
        "scripts/title-band-action.test.mjs",
      ],
    },
    breaks: pick(SOURCE_INSTRUMENT_BREAKS),
  }),
);

if (layoutPort === undefined) {
  console.log(
    "\nSKIPPED the layout-gate loop: set LAYOUT_PORT=<free port> to run it.\n" +
      "It is skipped rather than run on the default port because a neighbouring\n" +
      "worktree holding it would make this loop measure somebody else's tree.",
  );
} else {
  collect(
    runBreakTests({
      root,
      build: { command: "npm", args: ["run", "build"] },
      verify: {
        command: "npm",
        args: ["run", "test:renderer-layout"],
        env: { LAYOUT_PORT: layoutPort },
      },
      breaks: pick(LAYOUT_BREAKS),
    }),
  );
}

for (const result of results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of failed) console.error(`FAILED: ${result.name}`);

// TRZY LICZBY, NIE JEDNA — `runBreakTests` z pustą listą zwraca `ok: true`
// i drukuje dwa wiersze bazy, więc zieleń na ZERZE wykonanych złamań jest
// w tym repozytorium zdarzeniem, które już zaszło.
console.log(
  `\nbreaks: ${chosen.length} selected / ${results.length} executed / ` +
    `${failed.length} failed`,
);
if (results.length !== chosen.length)
  throw new Error(
    `BREAK_LIST_INCOMPLETE: ${chosen.length} break(s) were selected and ` +
      `${results.length} ran. A loop that skipped its list reports green on nothing.`,
  );
if (failed.length > 0) process.exitCode = 1;
