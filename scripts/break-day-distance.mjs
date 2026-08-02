// DOWÓD, że asercje wokół `dayDistance` naprawdę padają.
//
// Asercja, która nigdy nie pada, jest ozdobą — a ten lot zebrał PIĘTNAŚCIE
// ręcznych przepisań frazy „ile dni dzieli ten dzień od dziś" i TRZYNAŚCIE
// ramion mówiących „1 days". Przyrząd, który je zastępuje, musi być złamany
// jawnie i W OBIE STRONY wszędzie, gdzie strona w ogóle istnieje:
//
//   LICZBA MNOGA — raz za dużo („1 days"), raz za mało („5 day"). Złamanie
//   jednostronne dowodzi połowy niczego, a drugie ramię tej asercji nie
//   zmierzyłoby niczego bez własnego złamania.
//   MATCHER STRAŻNIKA — raz oślepiony (przestaje widzieć defekt), raz zbyt
//   chciwy (zaczyna zgłaszać poprawną angielszczyznę „1-day lead”). Strażnik,
//   który zgłasza wszystko, jest tak samo bezużyteczny jak ten, który nie
//   zgłasza nic.
//   ZAMIATANIE — raz zabrane mu podmioty (czy czerwień w ogóle dojedzie
//   z podłogi pomiaru), raz wpięcie (czy czerwień dojedzie z PLIKU renderera).
//   To jest para z `break-record-screen-geometry.mjs`: „reguła” i „wpięcie”.
//
// Plus dwa złamania bez strony przeciwnej: totalny `Record` bez ramienia MUSI
// odmówić kompilacji (`expect: "build-refuses"` — udana budowa jest wtedy
// porażką typu), a `daysUntil`, który przestaje patrzeć na strefę, musi
// położyć asercję strefową. Ta ostatnia jest tu dlatego, że cały lot stoi na
// zdaniu „dzień to dzień KALENDARZOWY czytelnika": zdanie bez złamania jest
// deklaracją, nie pomiarem.
//
// Pętla jest ta z `break-test.mjs` (#211) i NIE JEST pisana od nowa: `tsc -b`
// wewnątrz obiegu jest KONIECZNY i NIEWYSTARCZAJĄCY, bo przywrócenie
// zostawiające źródło starsze niż `.tsbuildinfo` daje zielony przebieg nad
// `dist` zbudowanym ze złamania.
//
// BUDOWĄ JEST `npm run typecheck`, nie `npm run build`. To jedyna faza, która
// tę asercję w ogóle karmi (testy chodzą z `build/ts`), a pełna budowa
// dokłada bundle Vite i Electrona do każdego z dziewięciu obiegów, czyli ~27
// przebiegi pakowania po nic. `tsc -b` przesuwa `.tsbuildinfo`, więc dowód
// przebudowy zostaje nienaruszony.
//
// CHODZI RĘCZNIE, nie w `npm run check`: dziewięć obiegów × trzy budowy to kilka
// minut, a bramka ma być szybka.
//
//   node scripts/break-day-distance.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Podmiana, która PADA, kiedy nie trafiła.
 *
 * Napis, który zwietrzał, jest najczęstszym powodem zielonego break-testu —
 * ten lot już raz zobaczył zieleń na ramieniu, które nic nie mierzyło.
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

const I18N = "packages/desktop-ui/src/i18n.ts";
const SUITE = "packages/desktop-ui/test/day-distance.test.ts";
const compiled = "packages/desktop-ui/build/ts/test/day-distance.test.js";

/**
 * Weryfikator zawężony do JEDNEJ asercji.
 *
 * Bez tego złamanie gramatyki w `i18n.ts` kładzie także zamiatanie (bo do
 * pliku wraca goła liczba przed słowem „days"), a wtedy czerwień nie jest
 * PRZYPISYWALNA: nie wiadomo, które ramię ją wyprodukowało. Wzorce zostały
 * sprawdzone pojedynczo — każdy trafia dokładnie w zamierzony test.
 */
const only = (pattern) => ({
  command: "node",
  args: ["--test", `--test-name-pattern=${pattern}`, compiled],
});

const outcome = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "typecheck"] },
  verify: { command: "node", args: ["--test", compiled] },
  breaks: [
    {
      // ZŁAMANIE, DLA KTÓREGO TEN LOT ISTNIEJE. Dokładnie ten napis stał
      // w `renewals-view.ts` i mówił „1 days ago" przez całą falę C i D.
      name: "restore the grammar defect: the elapsed voice spells the count itself",
      file: I18N,
      verify: only("1 days"),
      edit: (text) =>
        replaceOnce(
          text,
          '      ? `${countLabel(-days, "day")} ago`',
          "      ? `${-days} days ago`",
          "the elapsed voice's past arm",
        ),
    },
    {
      // DRUGA STRONA TEJ SAMEJ ASERCJI. Bez tego złamania ramię pilnujące
      // „N day" dla liczby mnogiej nie mierzy NICZEGO — a ta fala widziała
      // już break-test wracający zielony właśnie z takiego powodu.
      name: "the mirror direction: a plural count wearing the singular noun",
      file: I18N,
      verify: only("1 days"),
      edit: (text) =>
        replaceOnce(
          text,
          '        : `in ${countLabel(days, "day")}`,\n};',
          "        : `in ${days} day`,\n};",
          "the elapsed voice's future arm",
        ),
    },
    {
      // TOTALNY `Record` — dowodem jest ODMOWA KOMPILATORA, nie czerwony test.
      // To jest ta połowa projektu, która działa BEZ przebiegu testów: szósty
      // głos nie da się dopisać gdzie indziej, bo bez ramienia nic się nie
      // zbuduje.
      name: "delete a voice arm: the total Record must refuse to compile",
      file: I18N,
      expect: "build-refuses",
      edit: (text) =>
        replaceOnce(
          text,
          `  lead: (days) =>
    days < 0
      ? \`\${countLabel(-days, "day")} late\`
      : days === 0
        ? "due today"
        : \`in \${countLabel(days, "day")}\`,
`,
          "",
          "the lead arm",
        ),
    },
    {
      // MATCHER OŚLEPIONY. Kontrola pozytywna istnieje po to, żeby zamiatanie
      // wracające „zero trafień" znaczyło „czysto", a nie „nie patrzyłem".
      // Osiem przyrządów tego repozytorium skłamało w stronę fałszywego
      // spokoju; ten musi udowodnić, że jeszcze widzi.
      name: "blind the matcher: it stops seeing the defect it exists to catch",
      file: SUITE,
      verify: only("matcher catches"),
      edit: (text) =>
        replaceOnce(
          text,
          "const BARE_DAY_COUNT = /\\}\\s+days?\\b/gu;",
          "const BARE_DAY_COUNT = /\\}\\s+xdays?\\b/gu;",
          "the matcher",
        ),
    },
    {
      // MATCHER ZBYT CHCIWY. `${n}-day lead` to przymiotnik złożony, po polsku
      // i po angielsku niezmienny — strażnik, który go zgłasza, kazałby komuś
      // „naprawić" poprawne zdanie. Spacja w matcherze jest NOŚNA i to jest
      // jej dowód.
      name: "over-eager matcher: the compound adjective starts being flagged",
      file: SUITE,
      verify: only("leaves correct phrasings alone"),
      edit: (text) =>
        replaceOnce(
          text,
          "const BARE_DAY_COUNT = /\\}\\s+days?\\b/gu;",
          "const BARE_DAY_COUNT = /\\}[\\s-]+days?\\b/gu;",
          "the matcher",
        ),
    },
    {
      // ZAMIATANIE BEZ PODMIOTÓW — połowa „reguły". Przelot, który obszedł
      // dwa pliki zamiast stu trzydziestu dziewięciu, ma paść jako awaria
      // przyrządu, nie przejść w ciszy. Rekonesans tej fali dwa razy zamiótł
      // pusto i zaraportował spokój.
      name: "take the sweep its subjects: it walks a corner of the tree instead",
      file: SUITE,
      verify: only("by hand"),
      edit: (text) =>
        replaceOnce(
          text,
          'const sourceRoot = path.join(packageRoot, "src");',
          'const sourceRoot = path.join(packageRoot, "src", "hooks");',
          "the sweep root",
        ),
    },
    {
      // ZAMIATANIE PO STRONIE WPIĘCIA — druga połowa. Tamto dowodziło, że
      // czerwień JEST Z CZEGO wyprodukować; to dowodzi, że dojedzie z PLIKU
      // renderera aż do bramki. Napis jest dokładnie ten, który stał w tym
      // miejscu przed tym lotem.
      name: "the wiring: a renderer file writes a day count by hand again",
      file: "packages/desktop-ui/src/renewals/renewals-view.ts",
      verify: only("by hand"),
      edit: (text) =>
        replaceOnce(
          text,
          '${dayDistance(clock.daysLeft, "elapsed")}`,',
          "${clock.daysLeft} days`,",
          "the renewals accessible name",
        ),
    },
    {
      // STREFA. Cały lot stoi na zdaniu „dzień to dzień KALENDARZOWY
      // czytelnika, nie doba maszyny" — i to zdanie ma tu jedyne złamanie,
      // jakie może mieć. Bez strefy 22:30 UTC przestaje być jutrem
      // w Warszawie i asercja musi to zobaczyć.
      name: "make the zone stop mattering: a day becomes the machine's day",
      file: "packages/desktop-ui/src/today-plan.ts",
      verify: only("calendar day"),
      edit: (text) =>
        replaceOnce(
          text,
          "  const target = Date.parse(`${dateKeyInZone(value, timeZone)}T00:00:00.000Z`);",
          "  const target = Date.parse(`${dateKeyInZone(value)}T00:00:00.000Z`);",
          "the zoned day key",
        ),
    },
    {
      // DZIEWIĄTE ZŁAMANIE, DOPISANE PO TYM, JAK ÓSEMKA PRZEPUŚCIŁA CAŁĄ KLASĘ.
      // Pierwsza wersja matchera wymagała `${`, czyli widziała szablon i BYŁA
      // ŚLEPA NA JSX — a `.tsx` to pliki, w których mieszka większość treści
      // ekranu. Wąska wersja przeszła obok żywego czternastego ramienia
      // (`{followUp.lateDays} days late`). To złamanie wkłada TĘ SAMĄ postać
      // z powrotem do prawdziwego pliku `.tsx`; bez niego szerokość matchera
      // jest deklaracją, nie pomiarem. Rodzeństwo złamania „wpięcie" wyżej —
      // i tamto właśnie w ten sposób złapało defekt w `build/ts/src`.
      name: "the JSX shape: a screen writes a day count into an expression container",
      file: "packages/desktop-ui/src/renewals/RenewalsSurface.tsx",
      verify: only("by hand"),
      edit: (text) =>
        replaceOnce(
          text,
          '{dayDistance(-followUp.lateDays, "lead")}',
          "{followUp.lateDays} days late",
          "the follow-up late tag",
        ),
    },
  ],
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
