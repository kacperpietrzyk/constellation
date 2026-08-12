// DOWÓD, że asercja źródłowa nad rekompozycją Spotkań naprawdę pilnuje tego,
// co mówi, że pilnuje — wpisy #63, #64 i #65 rejestru, lot D7.
//
// PO CO OSOBNY HARNESS OBOK `break-visual-language.mjs`. Tamten dowodzi
// PIKSELI: odpala bramkę układu i pyta, czy nazwana para zapala się na
// nazwanym złamaniu. Ten dowodzi ŹRÓDŁA — i istnieje dlatego, że jedna rzecz
// w tym locie nie ma i nie może mieć pary pikselowej.
//
// TĄ RZECZĄ JEST KONTROLKA UPRAWNIENIA KALENDARZA. Do tego lotu siedziała
// w szynie `.meeting-context-rail`, którą rekompozycja kasuje w całości.
// Jest to JEDYNE w aplikacji wywołanie `requestCalendarAccess()` i jedyny
// „Grant access" / „Check again" na tym ekranie. Bramka układu chodzi po
// fiksturze, w której ta kontrolka się rysuje, ale ŻADNA para nie liczy jej
// obecności — a spis kontrolek (`control-paint.mjs`) deklaruje na tym ekranie
// mniej sztuk, niż rysuje, więc jej zniknięcie byłoby CICHĄ zielenią.
// Martwy przycisk uprawnienia przeszedł już przez cztery podpisane wydania
// tego projektu (PR #143). To złamanie jest jedynym dowodem, jaki istnieje,
// że drugi raz się to nie stanie po cichu.
//
// TRZY ZŁAMANIA, KAŻDE PRZECIW INNEJ ASERCJI tego samego testu:
//
//   • ODWRÓĆ KOLEJNOŚĆ SEKCJI → pada porównanie `indexOf` („Coming up leads").
//     To samo zdanie, którego bramka pilnuje parą D7-01b — dwa przyrządy nad
//     jednym wpisem, bo kolejność w źródle i kolejność w drzewie to dwie różne
//     rzeczy do zepsucia.
//   • WYRZUĆ `{calendarCapability}` Z SEKCJI NADCHODZĄCYCH → pada asercja
//     antyubytkowa. TO JEST ZŁAMANIE, KTÓRE WAŻY NAJWIĘCEJ w całym pliku.
//   • PRZYWRÓĆ SZYNĘ W ARKUSZU → pada asercja nieobecności. Bez niej reguła
//     mogłaby wrócić do arkusza jako martwy selektor i nic by tego nie
//     zauważyło.
//
// Pętla jest ta z `break-test.mjs` (#211) i NIE jest pisana tutaj od nowa:
// wymusza mtime nowszy od przywróconego pliku, bez czego `tsc -b` jest no-opem
// i zostawia ZATRUTY `dist`, który wraca zielony na złamanym kodzie.
//
// Chodzi ręcznie:
//
//   node scripts/break-meetings-recomposition.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Podmiana, która PADA, kiedy nie trafiła. Napis, który nie trafił, jest
 * najczęstszym powodem, dla którego break-test wraca zielony: edycja jest
 * wtedy no-opem, a pętla mierzy niezmieniony kod.
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

const outcome = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "build"] },
  // `test:core`, NIE `test:interaction`, i to jest pomiar, nie preferencja:
  // `interaction-recovery-contract.test.ts` chodzi pod `node:test` przez
  // `scripts/run-tests.mjs`, a `vitest.config.ts` zbiera WYŁĄCZNIE
  // `test/**/*.interaction.test.ts?(x)`. Harness wskazujący na vitest
  // przeleciałby ZIELONY na każdym z tych trzech złamań, nie wykonawszy ani
  // jednej asercji, którą dowodzi — czyli byłby dokładnie tą klasą fałszywego
  // spokoju, przeciw której powstał.
  verify: { command: "npm", args: ["run", "test:core"] },
  breaks: [
    {
      // PIERWSZE: kolejność sekcji. Nic nie znika — obie sekcje dalej
      // istnieją i dalej mają swoje klasy, więc czerwień przychodzi
      // z porównania `indexOf`, czyli dokładnie z tego, co wpis #63 nazywa.
      name: "render Jamie results above Coming up in the source: the order assertion must go red",
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `        {upcomingSection}
        {completedSection}`,
          `        {completedSection}
        {upcomingSection}`,
          "the order of the two meeting sections",
        ),
    },
    {
      // DRUGIE, I NAJWAŻNIEJSZE: kontrolka uprawnienia wypada z sekcji
      // nadchodzących. Powód, dla którego ten plik w ogóle istnieje, stoi
      // w nagłówku. Skasowanie samego wywołania zostawia ekran, który wygląda
      // dokładnie tak samo w każdym stanie, jaki rysuje fikstura bramki
      // układu — i to jest cała treść tego dowodu.
      name: "drop the calendar capability control from Coming up: the anti-drop assertion is the only thing that sees it",
      file: "packages/desktop-ui/src/MeetingsSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          `      {calendarCapability}
      {surface.upcoming.length === 0 ? (`,
          `      {surface.upcoming.length === 0 ? (`,
          "the calendar capability block inside Coming up",
        ),
    },
    {
      // TRZECIE: szyna wraca do arkusza. Reguła bez konsumenta jest martwa
      // i niewidoczna dla każdego przyrządu pikselowego — widzi ją wyłącznie
      // odczyt arkusza.
      name: "put the context rail rule back in the sheet: the absence assertion must go red on a dead selector",
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.meeting-body {
  display: grid;`,
          `.meeting-context-rail {
  background: var(--surface-sunken);
}
.meeting-body {
  display: grid;`,
          "the retired context rail rule",
        ),
    },
  ],
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
