// Break-testy sondy wierności wizualnej — czyli DOWÓD, że przyrząd, który
// Faza 0 postawiła, naprawdę mierzy język wizualny v3, a nie własną obecność.
//
// PO CO TO ISTNIEJE, skoro sonda była CZERWONA na `c2f7b5d`. Tamta czerwień
// jest dowodem MOMENTU: pokazała, że na farbie sprzed Fazy 1 przyrząd widzi
// brak akcentu. Nie jest dowodem TRWAŁYM. Od tamtej chwili doszło pięć lotów,
// dziesięć przyrządów i sto dwadzieścia par — a jedyne zdanie, jakie ktokolwiek
// mógłby dziś powiedzieć o tej sondzie, brzmi „przechodzi". Sonda, o której
// wiadomo wyłącznie, że jest zielona, jest nieodróżnialna od sondy, która nic
// nie mierzy. To jest dokładnie ta klasa fałszywego spokoju, którą to
// repozytorium zbiera od fal — i którą sonda wierności miała zamknąć.
//
// Plan adopcji języka v3 żąda tego wprost w punkcie 5 weryfikacji: „cofnąć
// akcent w tokenach i potwierdzić CZERWIEŃ. Zielony break-test = sonda nie
// mierzy."
//
// Po co osobny plik obok `scripts/break-test.mjs` (#211): tamten jest PĘTLĄ
// (dowodzi, że złamanie doszło do drzewa, a przywrócenie naprawdę przebudowało),
// a to jest LISTA ZŁAMAŃ — mówi, CO w tej fali miało prawo paść i dlaczego.
// Precedens: `scripts/break-crm-fixture.mjs`, `scripts/break-title-debt.mjs`.
//
// CHODZI RĘCZNIE, nie w `npm run check`: dzieli ograniczenie
// `verify-renderer-layout.mjs` — potrzebuje przeglądarki, której czysty klon
// nie ma. PORT PODAJE SIĘ Z ZEWNĄTRZ i to nie jest wygoda: bramka przypina go
// z `--strictPort`, ten harness odpala ją siedem razy, a dwa drzewa robocze na
// jednej maszynie zmierzyłyby sobie nawzajem aplikacje i wróciły ZIELONE
// (zmierzone w locie ACC fali E).
//
//   LAYOUT_PORT=5291 node scripts/break-visual-language.mjs
//
// TRZY ZŁAMANIA, TRZY RÓŻNE POWODY CZERWIENI — i to jest cała treść tego pliku.
// Jedno złamanie dowodzi tylko tego, że sonda umie paść; trzy dowodzą, że pada
// na TYM, co deklaruje, a nie na czymkolwiek.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Podmiana, która PADA, kiedy nie trafiła.
 *
 * Napis, który nie trafił, jest najczęstszym powodem, dla którego break-test
 * wraca zielony: edycja jest wtedy no-opem, a pętla mierzy niezmieniony kod.
 * Wielokrotne trafienie jest równie złe — edycja ląduje gdzie indziej niż
 * celuje, więc werdykt opisuje inne złamanie niż nazwa.
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
  verify: { command: "npm", args: ["run", "test:renderer-layout"] },
  breaks: [
    {
      // ZŁAMANIE PIERWSZE — TO, KTÓREGO ŻĄDA PLAN: cofnięcie akcentu do
      // Black Glass. Nie „przygaszenie", tylko powrót do tego, co ta aplikacja
      // niosła przez trzy fale: rampa prawie achromatyczna o odcieniu 255.
      //
      // TRZY EDYCJE, NIE JEDNA, i to jest treść, a nie porządki. Sama rampa
      // `--a-*` nie wystarcza: akcent o niskiej mocy (`--accent-quiet`,
      // `--accent-quieter`, `--accent-edge`, `--accent-glow`) stoi w tym pliku
      // LITERAŁAMI `oklch()`, osobno w każdym motywie, i przeżyłby zgaszenie
      // samej rampy. Aktywna pozycja nawigacji bierze `--accent-quieter`, więc
      // złamanie tylko rampy zaczerwieniłoby akcję główną i pierścień, a
      // nawigację ZOSTAWIŁO ZIELONĄ — co czyta się jak „sonda mierzy dwa z
      // trzech podmiotów", a znaczy „złamanie było niepełne".
      //
      // Chroma 0.005 przy odcieniu 255 pada na OBU warunkach sondy naraz
      // (podłoga chromy 0.09, pas odcienia 295±25) — czyli tak, jak padał
      // dzisiejszy neutralny przed Fazą 1.
      name: "revert the accent to Black Glass: the primary action, the active navigation item and the focus ring all go neutral",
      file: "packages/desktop-ui/src/tokens.css",
      edit: (text) => {
        const ramp = replaceOnce(
          text,
          `  --a-700: oklch(46% 0.19 295);
  --a-600: oklch(55% 0.21 295);
  --a-500: oklch(64% 0.2 295);
  --a-400: oklch(72% 0.17 295);
  --a-300: oklch(80% 0.12 295);`,
          `  --a-700: oklch(46% 0.005 255);
  --a-600: oklch(55% 0.005 255);
  --a-500: oklch(64% 0.005 255);
  --a-400: oklch(72% 0.005 255);
  --a-300: oklch(80% 0.005 255);`,
          "the accent ramp",
        );
        const dark = replaceOnce(
          ramp,
          `  --accent-quiet: oklch(64% 0.2 295 / 0.16);
  --accent-quieter: oklch(64% 0.2 295 / 0.08);
  --accent-edge: oklch(64% 0.2 295 / 0.42);
  --accent-glow: oklch(64% 0.2 295 / 0.28);`,
          `  --accent-quiet: oklch(64% 0.005 255 / 0.16);
  --accent-quieter: oklch(64% 0.005 255 / 0.08);
  --accent-edge: oklch(64% 0.005 255 / 0.42);
  --accent-glow: oklch(64% 0.005 255 / 0.28);`,
          "the dark theme's low-power accent literals",
        );
        return replaceOnce(
          dark,
          `  --accent-quiet: oklch(55% 0.21 295 / 0.13);
  --accent-quieter: oklch(55% 0.21 295 / 0.07);
  --accent-edge: oklch(55% 0.21 295 / 0.4);
  --accent-glow: oklch(55% 0.21 295 / 0.22);`,
          `  --accent-quiet: oklch(55% 0.005 255 / 0.13);
  --accent-quieter: oklch(55% 0.005 255 / 0.07);
  --accent-edge: oklch(55% 0.005 255 / 0.4);
  --accent-glow: oklch(55% 0.005 255 / 0.22);`,
          "the light theme's low-power accent literals",
        );
      },
    },
    {
      // ZŁAMANIE DRUGIE — I BEZ NIEGO PIERWSZE DOWODZI POŁOWY. Akcent zostaje
      // w arkuszu w pełnej mocy, zdefiniowany, fioletowy i policzalny grepem;
      // odpięty zostaje JEDEN konsument. `--action-primary-bg` wraca na
      // `--neutral-100`, czyli DOKŁADNIE na wartość sprzed Fazy 1 (`21c7864~1`,
      // tokens.css:166) — biały przycisk akcji głównej.
      //
      // To jest test SONDY, nie tokenów: przyrząd czytający ŹRÓDŁO („czy
      // `--accent` jest zdefiniowany", „czy nazwa pada w arkuszu") przechodzi
      // to złamanie bez mrugnięcia, bo nazwa nadal tam stoi i nadal jest
      // fioletowa. Czerwień może tu przyjść WYŁĄCZNIE z odczytu tego, co
      // przeglądarka naprawdę narysowała na przycisku. Nazwa w CSS przechodzi,
      // kiedy nikt jej nie użył — od tego zdania zaczęła się cała ta faza.
      name: "keep the accent defined and unplug one consumer: the primary action goes white while --accent stays violet in the sheet",
      file: "packages/desktop-ui/src/tokens.css",
      edit: (text) =>
        replaceOnce(
          text,
          "  --action-primary-bg: var(--accent-legible-bg);",
          "  --action-primary-bg: var(--neutral-100);",
          "the primary action's resting fill",
        ),
    },
    {
      // ZŁAMANIE TRZECIE — DRUGA POŁOWA JĘZYKA, TA NIE-KOLOROWA. Faza 2 zdjęła
      // tytuł ekranu z nagłówka display (`--text-display`, 30-42 px) na pasmo
      // crumbbara (`--text-sm`, waga 600). Kolor i typografia to w tym planie
      // jedna pozycja, więc break-test mierzący wyłącznie farbę zostawiłby
      // połowę adopcji bez ani jednego dowodu.
      //
      // Wraca dokładnie ten literał, który stał tu przed Fazą 2 — nie „coś
      // większego". Sufit sondy to 1,25 rem wyliczone z ŻYWEGO rem, więc to
      // złamanie ma paść tak samo przy tekście przeskalowanym do 200%, gdzie
      // wpisana liczba pikseli by się rozjechała.
      name: "put the display heading back on the surface header: the screen title draws over the crumbbar ceiling again",
      file: "packages/desktop-ui/src/styles.css",
      edit: (text) =>
        replaceOnce(
          text,
          `.surface-header h1,
.surface-header h2 {
  margin: 0;
  font-size: var(--text-sm);`,
          `.surface-header h1,
.surface-header h2 {
  margin: 0;
  font-size: clamp(1.9rem, 2.2vw, 2.6rem);`,
          "the surface header's title size",
        ),
    },
  ],
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
