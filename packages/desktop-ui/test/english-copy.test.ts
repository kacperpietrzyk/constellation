/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { collectSourceFiles, stripCommentsAndCode } from "./copy-scan.js";

// Interfejs jest po angielsku; komentarze i dane NIE. Ten strażnik pilnuje
// wyłącznie tego, co człowiek czyta na ekranie — czyli literałów tekstowych
// i treści JSX — i celowo NIE patrzy na komentarze (te zostają po polsku,
// decyzja z planu) ani na rekordy w grafie (tam żyje prawdziwa praca Kacpra,
// pisana po polsku, i nic jej nie tłumaczy).
//
// Bez tego strażnika „flip na angielski" jest twierdzeniem niesprawdzalnym:
// `npm run check` przechodzi na drzewie dwujęzycznym równie dobrze jak na
// przetłumaczonym, więc bez pomiaru nie da się odróżnić skończonej roboty od
// zgłoszonej jako skończona.

// Ten test jest uruchamiany ze skompilowanego `build/ts/test`, więc „katalog
// wyżej" wskazuje na build, a nie na źródła — i skan przeszedłby na dwóch
// plikach `.d.ts`. Szukamy korzenia paczki po pliku, który istnieje wyłącznie
// w źródłach.
const packageRoot = ((): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "styles.css"))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("desktop-ui package root not found from the test file");
    }
    directory = parent;
  }
  return directory;
})();
const sourceRoot = path.join(packageRoot, "src");

// Powierzchnie DEV-only (`?surface=`) kompilują się poza paczkę i mają zniknąć
// albo dostać nowy kształt razem z falami ekranowymi. Tłumaczenie ich teraz
// utrwaliłoby martwy zestaw nazw obok prawdziwej nawigacji.
const OUT_OF_SCOPE = [path.join("src", "dev") + path.sep];

// Polskie znaki są sygnałem o najwyższej precyzji, ale nie łapią „Zapisz",
// „Dodaj" ani „Brak". Lista niżej to wyrazy, które NIE są jednocześnie
// angielskimi słowami — dlatego nie ma tu „status", „start", „plan", „data",
// „to" ani „projekt", mimo że wszystkie występują w polskim UI.
const POLISH_DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const POLISH_WORDS =
  /\b(nie|jest|dla|brak|zapisz|dodaj|zamknij|wybierz|zadanie|zadania|nowy|nowa|nowe|wszystkie|tylko|bez|przy|oraz|jako|teraz|potem|kiedy|gdzie|ale|lub|albo|czy|jak|kto|termin|klient|osoba|osoby|organizacja|spotkanie|spotkania|dokument|dokumenty|notatka|notatki|ustawienia|zmiana|zmiany|powod|wynik|nazwa|opis|dodano|usunieto|zapisano|trwa|pokaz|ukryj|wiecej|mniej|wstecz|dalej|gotowe|anuluj|edytuj|otworz|usun|zmien|blad)\b/i;

const polishHits = (text: string): boolean =>
  POLISH_DIACRITICS.test(text) || POLISH_WORDS.test(text);

const files = collectSourceFiles(sourceRoot).filter(
  (file) => !OUT_OF_SCOPE.some((fragment) => file.includes(fragment)),
);

test("every user-visible string in the renderer is English", () => {
  assert.ok(
    files.length > 20,
    `expected the renderer source sweep to find files, found ${files.length} — a scan that finds nothing passes vacuously`,
  );

  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const copy = stripCommentsAndCode(source);
    copy.forEach((line) => {
      if (polishHits(line.text)) {
        offenders.push(
          `${path.relative(sourceRoot, file)}:${line.line}  ${line.text.trim().slice(0, 100)}`,
        );
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `Polish copy still reaches the screen in ${offenders.length} place(s):\n${offenders
      .slice(0, 40)
      .join(
        "\n",
      )}${offenders.length > 40 ? `\n… and ${offenders.length - 40} more` : ""}`,
  );
});

test("the document declares the language it is actually written in", () => {
  // `lang` nie jest kosmetyką: czytnik ekranu wymawia treść według tego
  // atrybutu, więc angielskie zdania czytane polską fonetyką są niezrozumiałe.
  // Ten atrybut był JEDYNĄ rzeczą, której nie złapał ani skan po polskich
  // znakach, ani `npm run check` — wyszedł dopiero na paczkowanym buildzie,
  // gdzie smoke porównywał go z „pl". Lokalny strażnik, żeby następnym razem
  // padło tu, a nie po piętnastu minutach na trzech systemach.
  const html = readFileSync(path.join(packageRoot, "index.html"), "utf8");
  const declared = /<html[^>]*\slang="([^"]*)"/u.exec(html);
  assert.ok(declared, "index.html must declare a document language");
  assert.equal(declared[1], "en");
});

// Arkusze stylów też potrafią wypisać tekst na ekran — `content:` na
// pseudoelemencie renderuje się jak każdy inny napis. Dziś wszystkie siedem
// deklaracji to znaki („✓", „⌕"), ale PR 6 wprowadza CSS Modules dla nowo
// pisanych komponentów, a oracle, który nie widzi arkuszy, meldowałby zero
// także wtedy, gdy nowe pliki przyniosą prawdziwe copy.
const cssContentValues = (css: string): readonly string[] =>
  [...css.matchAll(/content:\s*"((?:[^"\\]|\\.)*)"/g)].map(
    (match) => match[1] ?? "",
  );

test("every string a stylesheet prints is English too", () => {
  const sheets = readdirSync(sourceRoot, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith(".css"))
    .map((entry) => path.join(sourceRoot, entry));

  assert.ok(
    sheets.length > 5,
    `expected the stylesheet sweep to find sheets, found ${sheets.length} — a scan that finds nothing passes vacuously`,
  );

  const offenders: string[] = [];
  for (const sheet of sheets) {
    for (const value of cssContentValues(readFileSync(sheet, "utf8"))) {
      if (polishHits(value)) {
        offenders.push(
          `${path.relative(sourceRoot, sheet)}  content: "${value}"`,
        );
      }
    }
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("the stylesheet scanner sees a printed string", () => {
  // Sprawdzone przez zepsucie: gdyby wyrażenie nie łapało `content:`, ten test
  // pada. Pusty `content: ""` jest ozdobnikiem i ma zostać niewidzialny.
  const sample = [
    '.a::before { content: "✓"; }',
    '.b::after { content: "Brak wyników"; }',
    '.c::before { content: ""; }',
  ].join("\n");

  assert.deepEqual(cssContentValues(sample), ["✓", "Brak wyników", ""]);
  assert.deepEqual(cssContentValues(sample).filter(polishHits), [
    "Brak wyników",
  ]);
});

test("the scanner sees copy and ignores comments", () => {
  // Asercja sprawdzona przez zepsucie: gdyby stripCommentsAndCode zwracał
  // wszystko albo nic, ten test pada. Strażnik, który nigdy nie pada, jest
  // ozdobą.
  const sample = [
    "// Polski komentarz z ogonkami: zadania i spotkania.",
    "/* Blok też po polsku: usunięto powiązanie. */",
    'const label = "Save changes";',
    'const stale = "Zapisz zmiany";',
    "return <p>Nothing to review.</p>;",
    // Prettier łamie dłuższą treść do własnej linii. Skaner, który wymagał
    // tekstu ZARAZ po `>`, przepuszczał dokładnie te napisy — czyli te dłuższe.
    "<button>",
    "  Otwórz w nowej karcie",
    "</button>",
  ].join("\n");

  const lines = stripCommentsAndCode(sample);
  const flagged = lines.filter((line) => polishHits(line.text));

  assert.deepEqual(
    flagged.map((line) => line.line),
    [4, 6],
    `the Polish string literal and the Polish multi-line JSX text should both be flagged, got ${JSON.stringify(lines)}`,
  );
});

test("an apostrophe in English prose does not blind the scanner", () => {
  // To był PRAWDZIWY defekt tego skanera, nie hipoteza: apostrof w „record's"
  // otwierał tryb literału w środku zdania, a maszyna stanu połykała wszystko
  // do następnego apostrofu. Skaner, który gubi treść, myli się w stronę
  // fałszywego spokoju — melduje zero i nie widzi tego, co zostało.
  const sample = [
    "<p>Values inherit the record's permissions.</p>",
    'const stale = "Usunięto powiązanie";',
    "<p>You don't lose saved values.</p>",
  ].join("\n");

  const lines = stripCommentsAndCode(sample);
  const flagged = lines.filter((line) => polishHits(line.text));

  assert.deepEqual(
    flagged.map((line) => line.text),
    ["Usunięto powiązanie"],
    `the Polish literal between two apostrophes must still be seen, got ${JSON.stringify(lines)}`,
  );
});
