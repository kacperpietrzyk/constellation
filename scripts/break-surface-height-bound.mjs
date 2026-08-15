// DOWÓD, że pierwszy pionowy pomiar tej bramki naprawdę pada — I ŻE PADA
// WYŁĄCZNIE NA TYM, NA CZYM MA.
//
// Jednostronny break-test na progu dowodzi połowy niczego: asercja, która
// czerwieni się zawsze, jest tak samo bezużyteczna jak ta, która nie czerwieni
// się nigdy. Dlatego ten harness łamie w OBIE strony:
//
//   • czytelnia BEZ ZWIĄZANIA ma iść na CZERWONO — pętla powolna, złamanie
//     przywracające defekt z księgi fali D;
//   • czytelnia WYSOKA, ALE ZWIĄZANA ma zostać ZIELONA — a tego break-test
//     pokazać nie umie, bo `break-test.mjs` traktuje „zielone na zepsutym" jako
//     PORAŻKĘ. Ten kierunek stoi jako przypadek POZYTYWNY w
//     `surface-height-bound.test.mjs` („A LEGITIMATELY TALL READING STAYS
//     GREEN"), a jego nośność dowodzi złamanie ZACIŚNIĘCIA progu w pętli
//     szybkiej: podniesienie podłogi do 0.9 czerwieni ten właśnie przypadek.
//     Reguła zatem ROZRÓŻNIA, a nie tylko strzela.
//
// DWIE PĘTLE, bo weryfikatory są dwa i mają różny koszt — ten sam podział co
// w `break-record-screen-geometry.mjs` (#213):
//
//   POWOLNA — weryfikatorem jest `npm run test:renderer-layout`, czyli
//   przeglądarka i serwer dev. Łamie WPIĘCIE: czy czerwień w ogóle dojedzie
//   z pomiaru do bramki.
//   SZYBKA — weryfikatorem jest `node --test` nad czystymi regułami. Łamie SAM
//   PRÓG, strażnika pustego pomiaru i wyprowadzenie podmiotów. Tych złamań NIE
//   DA SIĘ pokazać w pętli powolnej: na zdrowym drzewie ekran ma 78.5% i
//   przechodzi przez każdy próg poniżej, więc słabszy próg widać dopiero nad
//   zapaścią — a zapaść jest osobnym złamaniem.
//
// Pętla jest ta z `break-test.mjs` (#211) i NIE JEST pisana tutaj od nowa:
// `tsc -b` wewnątrz obiegu jest konieczne i NIEWYSTARCZAJĄCE, a przywrócenie,
// które zostawia źródło starsze niż `.tsbuildinfo`, daje zielony przebieg nad
// `dist` zbudowanym ze złamania.
//
// CHODZI RĘCZNIE, nie w `npm run check`: pętla powolna dzieli ograniczenie
// `verify-renderer-layout.mjs` — potrzebuje przeglądarki, której czysty klon
// nie ma.
//
//   node scripts/break-surface-height-bound.mjs         # obie pętle
//   node scripts/break-surface-height-bound.mjs --fast  # sama szybka
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fastOnly = process.argv.includes("--fast");

/**
 * Podmiana, która PADA, kiedy nie trafiła.
 *
 * Regexp albo napis, który nie trafił, jest najczęstszym powodem, dla którego
 * break-test wraca zielony — jeden lot fali D miał trzy takie naraz.
 */
const replaceOnce = (text, needle, replacement, what) => {
  const at = text.indexOf(needle);
  if (at === -1)
    throw new Error(
      `${what}: the text this break edits is no longer in the file, so the ` +
        "break would be a no-op and a green run would mean nothing.",
    );
  if (text.indexOf(needle, at + needle.length) !== -1)
    throw new Error(
      `${what}: the text this break edits appears more than once, so the edit ` +
        "would not land where it is aimed.",
    );
  return text.slice(0, at) + replacement + text.slice(at + needle.length);
};

const build = { command: "npm", args: ["run", "build"] };
const ruleTests = {
  command: "node",
  args: [
    "--test",
    "scripts/surface-height-bound.test.mjs",
    "scripts/renderer-declarations.test.mjs",
  ],
};

const loops = [];

if (!fastOnly) {
  loops.push({
    label: "the wiring — verified by the layout gate itself",
    run: () =>
      runBreakTests({
        root,
        build,
        verify: { command: "npm", args: ["run", "test:renderer-layout"] },
        breaks: [
          {
            // ZŁAMANIE, DLA KTÓREGO TEN LOT ISTNIEJE. `min-height` jest
            // PODŁOGĄ, nie granicą: powłoka rośnie do wysokości najdłuższej
            // notatki, panele nigdy nie dostają określonej wysokości, ich
            // własne `overflow: auto` się nie włącza i cały ekran przewija się
            // jako strona. Zmierzone: 4297 px w oknie 735 px.
            name: "restore the defect: the Library shell asks for a floor instead of a bound",
            file: "packages/desktop-ui/src/library/library.module.css",
            edit: (text) =>
              replaceOnce(
                text,
                "  block-size: 100%;\n  background: var(--surface-window);",
                "  min-height: 100%;\n  background: var(--surface-window);",
                "the bound itself",
              ),
          },
          {
            // DRUGI, ODDZIELNY defekt, ten, którego księga fali D nigdy nie
            // nazwała: związana powłoka bez własnego przewijania panelu
            // czytania oddaje przewijanie PUDEŁKU czytelni, więc drzewo plików
            // ucieka razem z notatką. Sufit i podłoga są wtedy spełnione.
            name: "take the reading panel its own scroll: the three panels scroll together again",
            file: "packages/desktop-ui/src/library/notes.module.css",
            edit: (text) =>
              replaceOnce(
                text,
                "  min-height: 0;\n  overflow-y: auto;\n}\n\n.panelHead {",
                "  min-height: 0;\n}\n\n.panelHead {",
                "the reading panel's scroll",
              ),
          },
          {
            // Strażnik pustego pomiaru, złamany po stronie WPIĘCIA: przelot nie
            // znajduje żadnego podmiotu, więc nie ma czego zmierzyć. Musi paść
            // jako awaria przyrządu, a nie przejść w ciszy.
            name: "take the measurement its subjects: nothing carries a height-bound declaration",
            file: "packages/desktop-ui/src/library/LibraryShell.tsx",
            edit: (text) =>
              replaceOnce(
                text,
                'data-height-bound="notes"',
                'data-height-bound-that-nothing-reads="notes"',
                "the declaration",
              ),
          },
        ],
      }),
  });
}

loops.push({
  label: "the rules — verified by their own portable tests",
  run: () =>
    runBreakTests({
      root,
      build,
      verify: ruleTests,
      breaks: [
        {
          // Podłoga, którą da się spełnić zerową wysokością, nie jest podłogą.
          name: "loosen the floor to zero: a reading row eaten to nothing would satisfy it",
          file: "scripts/surface-height-bound.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              "export const MINIMUM_READING_HEIGHT_FRACTION = 0.35;",
              "export const MINIMUM_READING_HEIGHT_FRACTION = 0;",
              "the floor",
            ),
        },
        {
          // DRUGI KIERUNEK. Podłoga zaciśnięta ponad zmierzoną wartość zdrową
          // (0.785) czerwieni ekran, który jest w porządku — czyli dowodzi, że
          // przypadek pozytywny „wysoka treść, ale związana" naprawdę coś
          // trzyma, a nie przechodzi obojętnie.
          name: "tighten the floor above the healthy screen: a correct reading would go red",
          file: "scripts/surface-height-bound.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              "export const MINIMUM_READING_HEIGHT_FRACTION = 0.35;",
              "export const MINIMUM_READING_HEIGHT_FRACTION = 0.9;",
              "the floor, tightened",
            ),
        },
        {
          // Ramię „panele przewijają się razem" i jego BRAMKA KSZTAŁTU. Nie da
          // się tego pokazać w pętli powolnej inaczej niż przez sam defekt CSS
          // wyżej: na zdrowym drzewie wyłączenie ramienia niczego nie zmienia,
          // bo ramię i tak nie miałoby powodu paść. Tutaj widać, że ramię
          // NIEŚĆ COŚ MUSI — bez niego pudełko czytelni przewijające 4140 px
          // w 577 px przechodzi jako ekran w porządku.
          name: "take away the side-by-side arm: a box scrolling three panels at once would pass",
          file: "scripts/surface-height-bound.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              "  if (panelsSideBySide && readingScrollPx > readingClientPx + tolerancePx)",
              "  if (false && readingScrollPx > readingClientPx + tolerancePx)",
              "the side-by-side arm",
            ),
        },
        {
          // Tolerancja, która jest zapasem zamiast zaokrąglenia, przepuszcza
          // ekran naprawdę wystający.
          name: "turn the rounding tolerance into slack: a screen that really overflows would pass",
          file: "scripts/surface-height-bound.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              "export const HEIGHT_BOUND_TOLERANCE_PX = 1;",
              "export const HEIGHT_BOUND_TOLERANCE_PX = 64;",
              "the tolerance",
            ),
        },
        {
          // Strażnik pustego pomiaru po stronie REGUŁY: rejestr bez ani jednej
          // deklaracji zaczyna się liczyć jako rejestr.
          name: "let an empty registry count as a registry",
          file: "scripts/surface-height-bound.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              "  if (declared.length === 0)",
              "  if (declared.length < 0)",
              "the empty-registry guard",
            ),
        },
        {
          // Dowód, że w przelocie było CO związać. Bez niego sufit przechodzi
          // nad pustą fiksturą — dokładnie pułapka, w którą ta powłoka wpadła
          // w #203.
          name: "let a pass in which nothing overflowed count as evidence",
          file: "scripts/surface-height-bound.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              '  if (scrollingSubjects > 0) return { verdict: "witnessed", scrollingSubjects };',
              '  if (scrollingSubjects >= 0) return { verdict: "witnessed", scrollingSubjects };',
              "the overflow-witness guard",
            ),
        },
        {
          // Wyprowadzenie podmiotów: atrybut pisany wyrażeniem przestaje być
          // dziurą, więc zbiór zaczyna udawać kompletny.
          name: "let a dynamically written attribute pass as a complete derivation",
          file: "scripts/renderer-declarations.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              "  if (dynamic.length > 0)",
              "  if (dynamic.length < 0)",
              "the derivation-hole guard",
            ),
        },
      ],
    }),
});

let ok = true;
for (const loop of loops) {
  console.log(`\n── ${loop.label} ──`);
  const outcome = loop.run();
  for (const result of outcome.results)
    console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
  for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
  ok = ok && outcome.ok;
}
if (!ok) process.exitCode = 1;
