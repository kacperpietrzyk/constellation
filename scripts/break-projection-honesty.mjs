// DOWÓD, że ekran naprawdę MÓWI, zamiast rysować zero — i że asercje, które to
// pilnują, potrafią wrócić CZERWONE.
//
// PO CO OSOBNY HARNESS. Każde z trzech twierdzeń tego lotu jest twierdzeniem o
// NIEOBECNOŚCI: „nie wyrzucamy rekordów", „nie gubimy powodu", „nie meldujemy
// awarii jako braku funkcji". Zieleń testu nad nieobecnością jest dokładnie tym
// samym, czym była zieleń bramki układu nad ekranem, który się nie narysował —
// nie mierzy niczego, dopóki nie pokaże się, że umie paść.
//
// NAJWAŻNIEJSZE ZŁAMANIE JEST PIERWSZE i ono jedno uzasadnia cały plik. Defekt
// `recordState` stał w produkcie CZTERY WYDANIA przy komplecie zielonych bramek,
// bo KAŻDA fikstura tego repozytorium stempluje `recordState: "active"` na
// każdym rekordzie, a domena nie stempluje go NIGDY. Test napisany na fiksturze
// CRM tego defektu ZOBACZYĆ NIE MOŻE: przywróć `!== "active"` i taki test
// zostaje zielony. Dlatego złamanie pierwsze przywraca dokładnie stary odczyt —
// jeżeli asercja nie zaczerwieni się na nim, to znaczy, że nowy test jest
// kolejnym przyrządem mierzącym fiksturę zamiast produktu.
//
// CZTERY ZŁAMANIA:
//
//   • ODDAJ ODCZYT „BRAK = NIEAKTYWNY" → wiersze i licznik mają paść. To jest
//     Znalezisko 0 Fazy 4 odtworzone w harnessie.
//   • ZDEJMIJ PRZYCZYNĘ Z KOMUNIKATU → wróć do stałego zdania. Panel dalej się
//     rysuje i dalej ma „Try again", więc STARE asercje („powód dłuższy niż 20
//     znaków") zostają zielone — czerwienieje wyłącznie asercja o nazwie
//     zapytania i kodzie odmowy. Dowód, że nowe twierdzenie jest NOWE.
//   • ODDAJ KOLEJNOŚĆ RETURNÓW W LEJKU → slot rekordu znowu wyprzedza strażnika
//     dostępności i nieczytelna projekcja melduje się jako brakujący ekran.
//   • ZDEJMIJ `.message` Z BIBLIOTEKI → notatki wracają do zdania, które NAZYWA
//     PRZYCZYNĘ, jakiej kod nie zna („not available in this scope").
//
// Pętla jest ta z `break-test.mjs` (#211) i NIE JEST pisana tutaj od nowa:
// `tsc -b` wewnątrz obiegu jest konieczne i NIEWYSTARCZAJĄCE, a przywrócenie
// zostawiające źródło starsze niż `.tsbuildinfo` daje zielony przebieg nad
// `dist` zbudowanym ze złamania.
//
// NIE POTRZEBUJE PRZEGLĄDARKI — cała trójka siedzi w `test:interaction`, a nie
// w bramce układu. To jest celowe: bramka układu przypina port i dwa drzewa
// robocze na jednej maszynie mierzą sobie nawzajem aplikacje.
//
//   node scripts/break-projection-honesty.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Podmiana, która PADA, kiedy nie trafiła. Regexp albo napis, który nie trafił,
 * jest najczęstszym powodem, dla którego break-test wraca zielony.
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

/**
 * Sprawdzenie ZAWĘŻONE do pliku, który te złamania mierzą. Harness woła je trzy
 * razy na każde złamanie; całą suitę uruchamia się osobno, a czerwień w niej
 * nie powiedziałaby, KTÓRA asercja złapała złamanie.
 */
const verify = {
  command: "npm",
  args: [
    "run",
    "test:interaction",
    "-w",
    "@constellation/desktop-ui",
    "--",
    "test/projection-honesty.interaction.test.tsx",
  ],
};

const outcome = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "build"] },
  verify,
  breaks: [
    {
      // ZNALEZISKO 0 FAZY 4. Stary odczyt wyrzucał każdy rekord, którego nikt
      // nigdy nie usunął — czyli każdy, jaki produkt kiedykolwiek zapisał.
      name: "read an absent recordState as NOT active again: every record the product writes disappears",
      file: "packages/desktop-ui/src/crm/organization-reading.ts",
      edit: (text) =>
        replaceOnce(
          text,
          '}): boolean => (record.recordState ?? "active") === "active";',
          '}): boolean => record.recordState === "active";',
          "the recordState reading",
        ),
    },
    {
      // Panel zostaje, „Try again" zostaje, długość zdania zostaje — pada
      // WYŁĄCZNIE twierdzenie, że powód niesie nazwę zapytania i kod odmowy.
      name: "put the fixed sentence back on a refused read: the panel still draws, only the cause is gone",
      file: "packages/desktop-ui/src/client/workflow.ts",
      edit: (text) =>
        replaceOnce(
          text,
          "      `${query.queryName} was refused: ${response.result.diagnosticCode}. This view's data is unavailable right now. Try again.`,",
          '      "This view\'s data is unavailable right now. Try again.",',
          "the refusal message",
        ),
    },
    {
      // Kolejność returnów JEST poprawką. Wystarczy przenieść strażnika za slot
      // rekordu, żeby nieczytelna projekcja znów udawała brak funkcji.
      name: "let the deal slot jump the availability guard again: an unreadable slice reports as a missing screen",
      file: "packages/desktop-ui/src/pipeline/PipelineSurface.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "  if (!relationships.available)\n    return (",
          "  if (!relationships.available && activeOpportunityId === undefined)\n    return (",
          "the pipeline availability guard",
        ),
    },
    {
      // Zdanie, które NAZYWA przyczynę, jakiej kod nie zna: `optionalProjection`
      // łapie odmowę autoryzacji, odrzucenie kontraktu i milczący most tak samo.
      name: "claim a cause the code cannot know in the Library again: 'not available in this scope'",
      file: "packages/desktop-ui/src/library/NotesReading.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "              <p data-notes-unavailable>{snapshot.documents.message}</p>",
          "              <p data-notes-unavailable>Content is not available in this scope.</p>",
          "the notes unavailable message",
        ),
    },
  ],
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
