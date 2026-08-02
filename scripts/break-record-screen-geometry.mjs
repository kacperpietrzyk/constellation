// DOWÓD, że kontrola geometrii ekranu rekordu naprawdę pada.
//
// Asercja, która nigdy nie pada, jest ozdobą — a ta kontrola powstała dlatego,
// że przez cztery fale trzy PRAWDZIWE liczby o potomkach malowały fałszywy
// obraz ekranu, który nie miał szerokości. Przyrząd zastępujący tamten musi
// być złamany jawnie, i to w obie strony: raz przez przywrócenie defektu,
// raz przez zabranie pomiarowi podmiotów.
//
// DWIE PĘTLE, bo weryfikatory są dwa i mają różny koszt:
//
//   POWOLNA — weryfikatorem jest `npm run test:renderer-layout`, czyli
//   przeglądarka i serwer dev. Łamie WPIĘCIE: czy czerwień w ogóle dojedzie
//   z pomiaru do bramki.
//   SZYBKA — weryfikatorem jest `node --test` nad czystą regułą. Łamie SAMĄ
//   REGUŁĘ: próg i strażnika pustego pomiaru. Te dwa złamania NIE DAŁYBY SIĘ
//   pokazać w pętli powolnej, bo na zdrowym drzewie ekran ma 94% i przechodzi
//   przez każdy próg — słabszy próg widać dopiero nad zapaścią, a zapaść jest
//   osobnym złamaniem. Rozdzielenie ich jest tym, co czyni każdą czerwień
//   przypisywalną.
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
//   node scripts/break-record-screen-geometry.mjs         # obie pętle
//   node scripts/break-record-screen-geometry.mjs --fast  # sama szybka
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fastOnly = process.argv.includes("--fast");

/**
 * Podmiana, która PADA, kiedy nie trafiła.
 *
 * Regexp albo napis, który nie trafił, jest najczęstszym powodem, dla którego
 * break-test wraca zielony — jeden lot fali D miał trzy takie naraz. Sam
 * harness łapie „tekst identyczny z oryginałem", ale nie powie, KTÓRY z pięciu
 * napisów w tej pętli zwietrzał; ta funkcja mówi.
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
            // ZŁAMANIE, DLA KTÓREGO TEN LOT ISTNIEJE. Bez `inline-size: 100%`
            // auto-marginesy w osi poprzecznej znów wyłączają `stretch`,
            // `container-type: inline-size` rozwiązuje fit-content do zera,
            // a ekran rekordu wraca do 48 px własnego paddingu.
            name: "restore the defect: `.surface-scroll > *` loses its definite inline size",
            file: "packages/desktop-ui/src/styles.css",
            edit: (text) =>
              replaceOnce(
                text,
                ".surface-scroll > * {\n  inline-size: 100%;\n",
                ".surface-scroll > * {\n",
                "the fix itself",
              ),
          },
          {
            // Strażnik pustego pomiaru, złamany po stronie WPIĘCIA: sweep nie
            // znajduje żadnego korzenia ekranu rekordu, więc kontrola geometrii
            // nie ma czego zmierzyć. Musi paść jako awaria przyrządu, a nie
            // przejść w ciszy — bramka, która przechodzi, nie mierząc niczego,
            // byłaby dziewiątym przyrządem kłamiącym w stronę fałszywego spokoju.
            name: "take the measurement its subjects: nothing carries a record kind",
            file: "scripts/verify-renderer-layout.mjs",
            edit: (text) =>
              replaceOnce(
                text,
                'drawn.querySelectorAll("[data-record-kind]")',
                'drawn.querySelectorAll("[data-record-kind-that-nothing-carries]")',
                "the subject query",
              ),
          },
        ],
      }),
  });
}

loops.push({
  label: "the rule — verified by its own portable tests",
  run: () =>
    runBreakTests({
      root,
      build,
      verify: {
        command: "node",
        args: ["--test", "scripts/record-screen-geometry.test.mjs"],
      },
      breaks: [
        {
          // Próg, którym da się spełnić zerową szerokość, nie jest progiem.
          // Na ZDROWYM drzewie ekran ma 94% i przechodzi przez każdą wartość,
          // więc tego złamania nie widać w pętli powolnej — widać je tutaj.
          name: "loosen the threshold to zero: a total collapse would satisfy it",
          file: "scripts/record-screen-geometry.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              "export const MINIMUM_RECORD_CONTENT_FRACTION = 0.5;",
              "export const MINIMUM_RECORD_CONTENT_FRACTION = 0;",
              "the threshold",
            ),
        },
        {
          // Strażnik pustego pomiaru, złamany po stronie REGUŁY: przelot,
          // który nie zmierzył ani jednego korzenia, zaczyna się liczyć jako
          // zmierzony. Druga połowa złamania „zabierz podmioty" — tamto
          // dowodziło, że czerwień dojedzie, to dowodzi, że jest z czego.
          name: "let a sweep that measured nothing count as a sweep",
          file: "scripts/record-screen-geometry.mjs",
          edit: (text) =>
            replaceOnce(
              text,
              "  if (measured <= 0)",
              "  if (measured < 0)",
              "the empty-sweep guard",
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
