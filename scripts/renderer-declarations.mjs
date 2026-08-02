// CO RENDERER SAM O SOBIE DEKLARUJE — wyprowadzone z jego źródeł, nigdy
// wypisane listą obok nich.
//
// PO CO TO ISTNIEJE. `verify-renderer-layout.mjs` trzymało do dziś zdanie
// `for (const kind of ["project", "task"])` — dwuelementową listę ekranów
// rekordu stojącą obok kodu, który decyduje, ile ich jest. Rodzajów rekordu są
// TRZY: `OpportunityRecordScreen.tsx` niesie `data-record-kind="opportunity"`
// od fali C. Ta lista nie mogła go objąć, bo jej nikt nie dopisał, i dokładnie
// dlatego zapaść zerowej szerokości na ekranie szansy została znaleziona przez
// grep, a nie przez bramkę. To dwudzieste pierwsze żywe miejsce rodziny „ręczna
// lista obok zamkniętego słownika", którą to repozytorium płaci od czterech fal.
//
// REJESTREM JEST ŹRÓDŁO. Element, który rysuje ekran rekordu, mówi to o sobie
// atrybutem `data-record-kind`; ekran, który ma być związany wysokością, mówi
// to atrybutem `data-height-bound`. Jedna funkcja czyta oba, więc czwarty ekran
// rekordu i drugi ekran związany wysokością są objęte w dniu, w którym powstają
// — bez dopisywania czegokolwiek tutaj.
//
// CZEGO TA FUNKCJA NIE WIDZI, powiedziane wprost, bo przemilczane ograniczenie
// przyrządu jest tym, od czego zaczyna się fałszywy spokój: widzi WYŁĄCZNIE
// literał, czyli `data-record-kind="task"`. Zapis `data-record-kind={kind}`
// jest dla niej niewidzialny — i dlatego jest ODDZIELNIE WYKRYWANY i zgłaszany
// jako dziura w wyprowadzeniu, a nie milcząco pomijany.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Rozszerzenia, w których szukamy deklaracji. Renderer jest w TSX. */
const SOURCE_EXTENSIONS = new Set([".tsx"]);

const sourceFiles = (directory) => {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found.sort();
};

/**
 * Wszystkie wartości, jakie źródła renderera nadają danemu atrybutowi.
 *
 * Zwraca RÓWNIEŻ `dynamic` — miejsca, w których atrybut dostaje wyrażenie
 * zamiast literału. Wołający ma je potraktować jako awarię wyprowadzenia:
 * zbiór, który nie zna jednego ze swoich członków, nie jest zbiorem, którym
 * wolno mierzyć pokrycie.
 */
export const declaredAttributeValues = ({ root, attribute }) => {
  const literal = new RegExp(`${attribute}="([a-zA-Z0-9_-]+)"`, "gu");
  const expression = new RegExp(`${attribute}=\\{`, "u");
  const values = new Set();
  const dynamic = [];
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(literal)) values.add(match[1]);
    if (expression.test(text)) dynamic.push(path.relative(root, file));
  }
  return { values: [...values].sort(), dynamic };
};

/**
 * Werdykt o samym WYPROWADZENIU, zanim ktokolwiek nim cokolwiek zmierzy.
 *
 * Zero deklaracji nie znaczy „nie ma czego pilnować" — znaczy, że pętla nad
 * pustym zbiorem przejdzie, nie sprawdziwszy niczego, i zabierze ze sobą całą
 * gwarancję. To ten sam kształt co pusty przelot: awaria przyrządu, nie wynik.
 */
export const classifyDeclarationSet = ({ attribute, values, dynamic }) => {
  if (dynamic.length > 0)
    return {
      verdict: "not-derivable",
      reason:
        `${attribute} is written as an expression in ${dynamic.join(", ")}, so the set ` +
        "derived from the source is incomplete and every count taken against it would " +
        "be a count against an unknown denominator",
    };
  if (values.length === 0)
    return {
      verdict: "no-declarations",
      reason:
        `nothing in the renderer declares ${attribute}, so every loop over the derived ` +
        "set is a loop over nothing — an assertion that cannot fail is not an assertion",
    };
  return { verdict: "derived", values };
};

/**
 * Czy przelot zmierzył WSZYSTKO, co zadeklarowano — i co dokładnie ominął.
 *
 * ROZRÓŻNIENIE, KTÓRE JEST TU CAŁĄ TREŚCIĄ: „nie zmierzone" to nie to samo co
 * „w porządku". Rodzaj rekordu, którego żaden przelot nie otworzył, nie jest
 * ekranem bez usterek — jest ekranem, na który nikt nie spojrzał, a bramka,
 * która milczy o różnicy między tymi dwoma zdaniami, jest przyrządem kłamiącym
 * w stronę fałszywego spokoju. Dlatego `unreachable` wraca ZAWSZE, także
 * z przebiegu bez jednej usterki, i wołający ma to WYPISAĆ.
 */
export const classifyDeclarationCoverage = ({ declared, measured }) => {
  const seen = new Set(measured);
  const unreachable = declared.filter((value) => !seen.has(value));
  if (measured.length === 0)
    return {
      verdict: "measured-nothing",
      unreachable,
      reason:
        `none of the ${declared.length} declared subject(s) was measured, so this pass ` +
        "says nothing about any of them",
    };
  return {
    verdict: unreachable.length === 0 ? "complete" : "partial",
    unreachable,
  };
};
