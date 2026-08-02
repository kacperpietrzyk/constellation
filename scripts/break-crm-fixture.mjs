// DOWÓD, że zasiana fikstura CRM naprawdę jest MIERZONA — i że nowe wpisy
// rejestru pilnują tego, co mówią, że pilnują.
//
// PO CO OSOBNY HARNESS. Ten lot niczego nie liczy sam: dokłada MATERIAŁ,
// a materiał jest tą jedyną rzeczą, której zieleń bramki nie potrafi odróżnić
// od nieobecności. Ekran, który się nie narysował, nie przepełnia się nigdzie —
// więc pięć przelotów wraca „no overflow" i czyta się to jak pokrycie. Cała
// wartość tego PR-a stoi na tym, że da się pokazać CZERWIEŃ, kiedy materiał
// znika, i CZERWIEŃ, kiedy zmierzona liczba się pogarsza.
//
// CZTERY ZŁAMANIA, w DWÓCH kierunkach, o które prosi księga długu:
//
//   • ZABIERZ MATERIAŁ → `unusedRegistryEntries` ma paść, bo cztery nowe wpisy
//     opisują elementy, których już nie ma, i razem z nimi progi wierszy CRM.
//     To jest kierunek „skasuj element spłaconego wpisu".
//   • POGORSZ ZMIERZONĄ LICZBĘ → przepełnienie ponad sufit + tolerancję ma paść
//     jako REGRESJA NAZYWAJĄCA SWÓJ WĄTEK, a nie jako nowe przepełnienie.
//   • ODDAJ SELEKTOR, KTÓRY USUNĄŁ TEN LOT → bramka ma znów paść na „wiersz
//     odnowienia niczego nie otwiera". To jest dowód, że twierdzenie z #214
//     było FAŁSZYWE, a nie że usunięcie było wygodne — i że mogło stać zielone
//     wyłącznie dlatego, że fikstura nie rysowała ani jednego wiersza umowy.
//   • ZDEJMIJ ZAKRES Z PROGÓW → przeloty ZAWĘŻONE do Biblioteki mają paść na
//     CRM-ie, którego z definicji nie odwiedzają. To jest dowód, że filtr
//     zakresu kupuje prawdziwą klasę fałszywej czerwieni, a nie porządek.
//
// Pętla jest ta z `break-test.mjs` (#211) i NIE JEST pisana tutaj od nowa:
// `tsc -b` wewnątrz obiegu jest konieczne i NIEWYSTARCZAJĄCE, a przywrócenie
// zostawiające źródło starsze niż `.tsbuildinfo` daje zielony przebieg nad
// `dist` zbudowanym ze złamania.
//
// CHODZI RĘCZNIE, nie w `npm run check`: dzieli ograniczenie
// `verify-renderer-layout.mjs` — potrzebuje przeglądarki, której czysty klon
// nie ma. PORT PODAJE SIĘ Z ZEWNĄTRZ i to nie jest wygoda: dwa drzewa robocze
// na jednej maszynie mierzą sobie nawzajem aplikacje, a ten harness odpala
// bramkę trzy razy na każde złamanie.
//
//   LAYOUT_PORT=5290 node scripts/break-crm-fixture.mjs
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

const outcome = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "build"] },
  verify: { command: "npm", args: ["run", "test:renderer-layout"] },
  breaks: [
    {
      // KIERUNEK PIERWSZY: zabierz materiał. Cztery nowe wpisy rejestru opisują
      // elementy czterech ekranów CRM; bez rekordów żaden się nie narysuje,
      // `unusedRegistryEntries` czyni z każdego niedopasowanego wpisu PORAŻKĘ,
      // a progi `pipelineCards` i `renewalRows` padają obok nich. Przed tym
      // PR-em ten sam stan był CISZĄ.
      name: "empty the CRM fixture: four registry entries describe elements that no longer draw",
      file: "packages/desktop-ui/src/dev/crm-fixture.ts",
      edit: (text) =>
        replaceOnce(
          text,
          '): RelationshipWorkspaceProjection["records"] => {\n  const base = {',
          '): RelationshipWorkspaceProjection["records"] => {\n  if (`${workspaceId}`.length > 0) return [];\n  const base = {',
          "the fixture itself",
        ),
    },
    {
      // KIERUNEK DRUGI: pogorszenie ponad sufit. Sufit zaciśnięty pod zmierzoną
      // wartość stawia to samo pytanie, co element, który urósł — czy różnica
      // ponad `KNOWN_OVERFLOW_TOLERANCE_PX` dojedzie z pomiaru do bramki jako
      // REGRESJA z nazwanym właścicielem, a nie jako świeże przepełnienie bez
      // adresu. 54 px zmierzone przy oknie 320 px kontra sufit 1 px.
      name: "tighten a measured CRM ceiling below what draws: the overflow must come back as a regression naming its thread",
      file: "scripts/descendant-overflow.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          '      "text scaled to 200%": 19,\n      "a 320 px window": 54,\n    },\n    thread: "skalowanie interfejsu (R3-5, za falą E) — kwota na umowie",',
          '      "text scaled to 200%": 19,\n      "a 320 px window": 1,\n    },\n    thread: "skalowanie interfejsu (R3-5, za falą E) — kwota na umowie",',
          "the renewals money ceiling",
        ),
    },
    {
      // TRZECI: oddaj selektor, który ten lot usunął. Bramka ma paść na
      // „renewals offered a row to open and double-clicking it opened no record
      // screen" — czyli na twierdzeniu #214, że wiersz umowy otwiera rekord
      // szansy. Ten break jest jedynym dowodem, jaki istnieje, że tamto zdanie
      // było nieprawdziwe: dopóki fikstura nie miała ani jednego wiersza umowy,
      // asercja NIE MIAŁA JAK się pomylić.
      name: "put the renewal row back in the record-opening selector: the false claim goes red the moment a row exists",
      file: "scripts/verify-renderer-layout.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          '"[data-project-row], [data-task-row], [data-pipeline-card]"',
          '"[data-project-row], [data-task-row], [data-pipeline-card], [data-renewal-row]"',
          "the record-opening selector",
        ),
    },
    {
      // CZWARTY: zdejmij zakres z progów. Przelot zawężony do Biblioteki nigdy
      // nie odwiedza Lejka ani Odnowień, więc próg żądany tam mierzy nie
      // zapadnięty ekran, tylko ZADEKLAROWANE wyłączenie. Zmierzone: bez tego
      // filtra dwa przeloty Biblioteki czerwienią się na CRM-ie, którego z
      // definicji nie widzą — fałszywa czerwień, czyli ta gorsza połowa.
      name: "demand every fixture floor in every pass: the two scoped Library passes go red on CRM they never visit",
      file: "scripts/verify-renderer-layout.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          "  const expectedHere = (needs) =>\n    surfaces === undefined || surfaces.includes(needs);",
          "  const expectedHere = (needs) => needs !== undefined;",
          "the scope filter on fixture floors",
        ),
    },
  ],
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
