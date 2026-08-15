// Break-testy dla osi konspektu nagłówków NA STANIE PUSTYM — czyli dla
// `packages/desktop-ui/test/empty-state-outline.interaction.test.tsx`.
//
// PO CO TEN PLIK ISTNIEJE, ZE ZDARZENIEM, KTÓRE GO WYMUSIŁO. Lot D3 rozdzielił
// Bibliotekę na `notes`, `sources` i `captures`. Na PUSTYM obszarze roboczym
// Historia wrzutek rysuje `InlineState`, a ten prymityw domyślnie stawia `h3` —
// więc pod `h1` pasma otwierała się dziura h1→h3. Wszystkie trzy zadania
// `Packaged local Alpha` padły na tym w CI (`PACKAGED_ALPHA_NARROW_SURFACE_INVALID`,
// `headingJumps: [3]`), a bramka układu przeszła nad tym na ZIELONO i miała
// rację: jej fikstura ma wrzutki, więc rejestr rysuje `h2 Kept originals`.
//
// CZYLI: reguła była dobra, mierzony był ZŁY STAN. Nowy przyrząd montuje tę samą
// powłokę na fiksturze bez danych i podaje zebrane konspekty TEJ SAMEJ,
// uzbrojonej regule (`scripts/heading-outline.mjs`). Ten plik dowodzi, że nowy
// przyrząd naprawdę widzi tę klasę — na dwóch różnych ekranach, nie tylko na
// tym jednym, który wywołał sprawę.
//
//   node scripts/break-empty-state-outline.mjs
//
// TRZECIE ZŁAMANIE — na wpisie w konfiguracji Vitesta, przez który reguła jest
// w ogóle importowana — jest ZADEKLAROWANE NIŻEJ I NIEWYKONYWALNE W TEJ PĘTLI,
// z powodem i z pomiarem zrobionym z ręki. Nie jest przemilczane.
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

const DECLARED_BREAKS = [
  {
    // WADA, KTÓRA TO WYWOŁAŁA, ODTWORZONA CO DO ZNAKU. Bez `headingLevel="h2"`
    // pusta Historia wrzutek wraca do `h3` pod `h1` pasma. Żaden inny przyrząd
    // w `npm run check` tego nie widzi, bo żaden nie odwiedza tego ekranu bez
    // danych — dowodem jest to, że wada wyszła dopiero z paczkowanego smoke'a.
    //
    // MA ZGASNĄĆ: „no destination's EMPTY state skips a heading rung",
    // z werdyktem `HEADING_OUTLINE_SKIPPED_RUNG — captures`.
    name: "let the empty capture history open on a skipped rung",
    file: "packages/desktop-ui/src/library/CaptureHistoryReading.tsx",
    edit: (text) =>
      replaceOnce(
        text,
        '        <InlineState\n          headingLevel="h2"\n          title="Capture history is empty"',
        '        <InlineState\n          title="Capture history is empty"',
        "the explicit rung on the empty capture history",
      ),
  },
  {
    // DRUGI EKRAN, I TO JEST CAŁY POWÓD TEGO ZŁAMANIA: przyrząd, który
    // sprawdzałby wyłącznie `captures`, byłby ręczną listą obok otwartego
    // zbioru powierzchni — czyli tą samą wadą, która wpuściła `captures`. Pusty
    // stan Spotkań stoi pod `h2#upcoming-title`, więc `h4` robi tam dziurę
    // h2→h4. Bramka układu tego nie zobaczy: w jej fiksturze Spotkania MAJĄ
    // wydarzenia, więc ta gałąź w ogóle się nie rysuje.
    //
    // MA ZGASNĄĆ: ten sam przypadek, z werdyktem na powierzchni `meetings`.
    name: "sink the empty meetings state two rungs below its section",
    file: "packages/desktop-ui/src/MeetingsSurface.tsx",
    edit: (text) =>
      replaceOnce(
        text,
        "          <h3>No events visible</h3>",
        "          <h4>No events visible</h4>",
        "the empty meetings head",
      ),
  },
];

// ── TRZECIE ZŁAMANIE ISTNIEJE I NIE MIEŚCI SIĘ W TYM HARNESSIE ───────────────
//
// Chciało brzmieć „zamknij drzwi, przez które importowana jest reguła": wpis
// `server: { fs: { allow: [".", "../../scripts"] } }` w
// `packages/desktop-ui/vitest.config.ts` jest jedyną rzeczą, która pozwala
// testowi sięgnąć po `scripts/heading-outline.mjs`. Bez niego plik wygląda tak
// samo i nie osądza NICZEGO — kształt „zdolności, której nic nie montuje".
//
// HARNESS GO NIE PRZYJMUJE, i to jest jego poprawne zachowanie, a nie usterka:
// `runBreakTests` żąda DOWODU PRZEBUDOWY dla każdego pliku o rozszerzeniu
// `.ts`, a `vitest.config.ts` nie jest w żadnym `include` tsconfiga, więc
// `tsc -b` nie rusza po nim ani jednego stempla. Pętla przerywa z
// „the build changed no build stamp" — czyli odmawia, zamiast zmierzyć coś
// innego niż zadeklarowała. Zmierzone przy pisaniu tego pliku, nie zgadnięte.
//
// ZMIERZONE Z RĘKI ZAMIAST TEGO, żeby ten wpis nie był deklaracją bez pomiaru:
// przy `allow: ["."]` przypadek „no destination's EMPTY state skips a heading
// rung" pada na `Cannot find module '/…/scripts/heading-outline.mjs'`, a przy
// `allow: [".", "../../scripts"]` przechodzi. Ten wpis w konfiguracji jest więc
// nośny i jego usunięcie NIE jest ciche — jest po prostu czerwone poza tą
// pętlą.

/**
 * Wybór podzbioru złamań po FRAGMENCIE NAZWY, ta sama umowa co
 * w `scripts/break-library-split.mjs`:
 *
 *   BREAK_ONLY="empty capture history" node scripts/break-empty-state-outline.mjs
 *
 * FRAGMENTY MUSZĄ BYĆ ROZŁĄCZNE I ŻADEN NIE MOŻE ZAWIERAĆ SIĘ W INNYM —
 * sprawdzane MASZYNOWO niżej, bo filtr działa przez `includes`, więc fragment
 * będący podciągiem drugiej nazwy uruchomiłby po cichu dwa złamania na jednej
 * bazie.
 */
const only = process.env.BREAK_ONLY ?? "";
const needles = only.split("|").filter((part) => part !== "");
const chosen =
  needles.length === 0
    ? DECLARED_BREAKS
    : DECLARED_BREAKS.filter((entry) =>
        needles.some((needle) => entry.name.includes(needle)),
      );

for (const outer of DECLARED_BREAKS)
  for (const inner of DECLARED_BREAKS)
    if (outer !== inner && outer.name.includes(inner.name))
      throw new Error(
        `BREAK_NAMES_NEST: „${inner.name}" is a substring of „${outer.name}", so a ` +
          "BREAK_ONLY fragment aimed at the first would silently run the second too.",
      );

if (needles.length > 0 && chosen.length === 0)
  throw new Error(
    `BREAK_ONLY="${only}" matched none of the ${DECLARED_BREAKS.length} declared break(s), ` +
      "so this run would prove nothing while looking like a pass.\n" +
      "Names available:\n" +
      DECLARED_BREAKS.map((entry) => `  ${entry.name}`).join("\n"),
  );

// BUDOWA JEST TU MIMO TEGO, ŻE VITEST CZYTA ŹRÓDŁA. Oba wykonywane złamania
// tykają pliki, które `tsc -b` kompiluje, a `dist` zatruty poprzednim przebiegiem jest
// w tym repozytorium nazwaną pułapką — pętla ma zaczynać od bazy zbudowanej
// z TEGO drzewa.
const { results, failed } = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "build"] },
  verify: { command: "npm", args: ["run", "test:interaction"] },
  breaks: chosen,
});

for (const result of results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of failed) console.error(`FAILED: ${result.name}`);

// TRZY LICZBY, NIE JEDNA — `runBreakTests` z pustą listą zwraca `ok: true`,
// więc zieleń na ZERZE wykonanych złamań jest w tym repozytorium zdarzeniem,
// które już zaszło.
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
