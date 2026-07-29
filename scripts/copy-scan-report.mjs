// Raport pomocniczy do przebudowy: ile polskiego copy zostało w którym pliku.
// Czyta ten sam skaner co test english-copy, żeby liczba w raporcie i liczba
// w bramce nie mogły się rozjechać.
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  collectSourceFiles,
  stripCommentsAndCode,
} from "../packages/desktop-ui/build/ts/test/copy-scan.js";

const root = path.join(process.cwd(), "packages/desktop-ui/src");
const PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const WORDS =
  /\b(nie|jest|dla|brak|zapisz|dodaj|zamknij|wybierz|zadanie|zadania|nowy|nowa|nowe|wszystkie|tylko|bez|przy|oraz|jako|teraz|potem|kiedy|gdzie|ale|lub|albo|czy|jak|kto|termin|klient|osoba|osoby|organizacja|spotkanie|spotkania|dokument|dokumenty|notatka|notatki|ustawienia|zmiana|zmiany|powod|wynik|nazwa|opis|dodano|usunieto|zapisano|trwa|pokaz|ukryj|wiecej|mniej|wstecz|dalej|gotowe|anuluj|edytuj|otworz|usun|zmien|blad)\b/i;

let total = 0;
const rows = [];
for (const file of collectSourceFiles(root)) {
  if (file.includes(`${path.sep}dev${path.sep}`)) continue;
  const hits = stripCommentsAndCode(readFileSync(file, "utf8")).filter(
    (line) => PL.test(line.text) || WORDS.test(line.text),
  );
  if (hits.length > 0) {
    total += hits.length;
    rows.push([hits.length, path.relative(root, file)]);
  }
}
rows.sort((a, b) => b[0] - a[0]);
for (const [count, file] of rows) console.log(String(count).padStart(5), file);
console.log(`\nTOTAL ${total} across ${rows.length} in-scope files`);
