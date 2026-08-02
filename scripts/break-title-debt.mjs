// Break-testy lotu TITLE fali E: dwanaście atrybutów `title=` sklasyfikowanych
// i przeniesionych, plus przypięcie do Ustawień, którego po #219 nie dało się
// odpiąć.
//
// Po co osobny plik obok `scripts/break-test.mjs` z #211: tamten jest PĘTLĄ
// (dowodzi, że złamanie doszło do `dist`, a przywrócenie naprawdę przebudowało
// drzewo), a to jest LISTA ZŁAMAŃ — mówi, CO w tym locie miało prawo paść
// i dlaczego. Precedens: `scripts/break-activity-retirement.mjs` (#219).
//
//   LAYOUT_PORT=<wolny port> node scripts/break-title-debt.mjs
//
// Dwie pętle, bo `scripts/run-tests.mjs` ŚWIADOMIE nie bierze testów
// interakcji. Bramki układu ten lot nie łamie i to jest decyzja, nie luka:
// żadna zmiana tutaj nie dokłada elementu na powierzchni, którą bramka omiata
// — jedyny nowy element rysuje się w panelu Historii wrzutek, do którego
// bramka nie wchodzi. Gate i tak jest URUCHAMIANY (raz, poza tym plikiem),
// żeby to zdanie było zmierzone, a nie założone.
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

const results = [];
const failed = [];
const collect = (run) => {
  results.push(...run.results);
  failed.push(...run.failed);
};

const FAVORITE_FILTER = `        parsed.flatMap((item) => {
          const resolved = resolveDesktopSurface(item);
          return resolved !== undefined && FAVORITABLE_SURFACES.has(resolved)
            ? [resolved]
            : [];
        }),`;

collect(
  runBreakTests({
    root,
    build: { command: "npm", args: ["run", "build"] },
    verify: { command: "node", args: ["scripts/run-tests.mjs"] },
    breaks: [
      {
        // KIERUNEK PIERWSZY: filtr, który nie odsiewa niczego — dokładnie stan
        // sprzed tej poprawki, gdzie pytanie brzmiało „czy ten cel W OGÓLE
        // istnieje w rejestrze", a nie „czy da się go odpiąć". Przypięcie do
        // Ustawień przeżywa i wraca do szyny na zawsze.
        name: "ask the registry only whether the surface EXISTS (the pre-fix filter)",
        file: "packages/desktop-ui/src/client/shell-navigation.ts",
        edit: (text) =>
          replaceOnce(
            text,
            "new Set<SurfaceId>(desktopNavigationSurfaceIds)",
            "new Set<SurfaceId>(desktopSurfaceIds)",
            "the favouritable-surface set",
          ),
      },
      {
        // KIERUNEK DRUGI, I BEZ NIEGO PIERWSZY NIE ZNACZY NIC. Filtr, który
        // odsiewa ZA DUŻO, przechodzi kierunek pierwszy trywialnie — pusta
        // lista też nie zawiera Ustawień.
        //
        // Złamanie jest ODWRÓCENIEM KOLEJNOŚCI: reguła `chrome` zastosowana do
        // SUROWEGO napisu, przed rozwiązaniem wycofanego identyfikatora.
        // Wersja, która czyta się najnaturalniej („najpierw sprawdź, czy wolno,
        // potem tłumacz"), gubi przypięcie do `history`, bo `history` nie jest
        // celem nawigacji — jest napisem, który się NA taki cel przekłada.
        // To jest ta sama pułapka kolejności co scalenie dubli przed bramką
        // długości w #219.
        name: "apply the chrome rule BEFORE resolving a retired id",
        file: "packages/desktop-ui/src/client/shell-navigation.ts",
        edit: (text) =>
          replaceOnce(
            text,
            FAVORITE_FILTER,
            `        parsed.flatMap((item) => {
          if (!FAVORITABLE_SURFACES.has(item as SurfaceId)) return [];
          const resolved = resolveDesktopSurface(item);
          return resolved === undefined ? [] : [resolved];
        }),`,
            "the favourites restore filter",
          ),
      },
      {
        // SŁOWNIK IDENTYFIKATORÓW TEMATÓW POMOCY, KIERUNEK „ZA SZEROKO" —
        // czyli dokładnie defekt, który tu stał: identyfikator w unii bez wpisu
        // w tablicy. Kompilował się, `TopicHelp` zwracał dla niego `null`,
        // a test capa zostawał zielony, bo iteruje TABLICĘ.
        //
        // ODMOWA KOMPILATORA jest tu wynikiem MOCNIEJSZYM niż czerwony test
        // i jest jedynym możliwym: żadna asercja runtime'owa nie widzi rzeczy,
        // której nie ma na jedynej liście, jaką runtime umie przeczytać.
        name: "widen the help-topic union past the topics that exist",
        expect: "build-refuses",
        file: "packages/desktop-ui/src/help/help-topics.ts",
        edit: (text) =>
          replaceOnce(
            text,
            'export type HelpTopicId = HelpTopic["id"];',
            'export type HelpTopicId = HelpTopic["id"] | "ghost-topic";',
            "the derived help-topic union",
          ),
      },
      {
        // …I KIERUNEK „ZA WĄSKO". Unia węższa niż tablica robi z istniejącego
        // tematu temat, do którego nie da się odwołać — inna awaria, ta sama
        // rozjeżdżająca się para. Jednostronny strażnik nad progiem dowodzi
        // połowy niczego.
        name: "narrow the help-topic union below the topics that exist",
        expect: "build-refuses",
        file: "packages/desktop-ui/src/help/help-topics.ts",
        edit: (text) =>
          replaceOnce(
            text,
            'export type HelpTopicId = HelpTopic["id"];',
            'export type HelpTopicId = Exclude<HelpTopic["id"], "sources">;',
            "the derived help-topic union",
          ),
      },
    ],
  }),
);

// DRUGA PĘTLA — testy interakcji. Wszystko, co ten lot przeniósł, jest
// widoczne dopiero na zamontowanym drzewie: nazwa kontrolki, zdanie zamiast
// dymku i szyna przypięć.
collect(
  runBreakTests({
    root,
    build: { command: "npm", args: ["run", "build"] },
    verify: { command: "npm", args: ["run", "test:interaction"] },
    breaks: [
      {
        // TEN SAM FILTR, DRUGA STRONA. Pętla node'owa dowodzi funkcji;
        // tutaj dowodzi się EKRANU i DYSKU: pinezka nie rysuje się w szynie,
        // a odsiana lista zostaje zapisana z powrotem, więc naprawa jest
        // trwała, a nie chowaniem stanu przed rysowaniem.
        name: "the pre-fix filter, seen from the rail and from localStorage",
        file: "packages/desktop-ui/src/client/shell-navigation.ts",
        edit: (text) =>
          replaceOnce(
            text,
            "new Set<SurfaceId>(desktopNavigationSurfaceIds)",
            "new Set<SurfaceId>(desktopSurfaceIds)",
            "the favouritable-surface set",
          ),
      },
      {
        // SKRÓT WRACA DO SAMEGO DYMKU. Reguła jest wyprowadzona z rejestru,
        // więc to złamanie zdejmuje klawisz ze WSZYSTKICH dwunastu nazw naraz
        // — i tak samo zdjęłoby go z trzynastej, gdyby kiedyś powstała.
        name: "take the keyboard shortcut back out of the navigation item's name",
        file: "packages/desktop-ui/src/RealApp.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "aria-label={`${itemName}, ${shortcutName}`}",
            "aria-label={itemName}",
            "the navigation item's accessible name",
          ),
      },
      {
        // DYMEK WRACA NA KOMÓRCE TERMINU. Zamiatanie `title=` na trasie
        // „Projekty" musi to zobaczyć — inaczej ten lot dopisał trasę, która
        // niczego nie pilnuje.
        name: "put the deadline tooltip back on the by-client lens",
        file: "packages/desktop-ui/src/projects/ProjectClientsLayout.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "                    className={`${styles.left} ${\n                      styles[`left_${deadlineTone(reading)}`]\n                    }`}\n                  >",
            "                    className={`${styles.left} ${\n                      styles[`left_${deadlineTone(reading)}`]\n                    }`}\n                    title={deadlineDate(reading, prose)}\n                  >",
            "the deadline cell",
          ),
      },
      {
        // DATA ZNIKA Z NAZWY WIERSZA, A DYMKA NIE MA. To jest złamanie, które
        // odróżnia „skasowałem atrybut" od „przeniosłem fakt": samo zamiatanie
        // `title=` przechodzi na ekranie, z którego data zniknęła zupełnie.
        name: "drop the date from the row's accessible name",
        file: "packages/desktop-ui/src/projects/ProjectClientsLayout.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "                aria-label={rowAccessibleName(\n                  reading,\n                  clientOf(reading.project.id),\n                  deadlineDate(reading, prose),\n                )}",
            "                aria-label={rowAccessibleName(\n                  reading,\n                  clientOf(reading.project.id),\n                )}",
            "the project row's accessible name",
          ),
      },
      {
        // POWÓD, DLA KTÓREGO KONTROLKA JEST MARTWA, ZNIKA Z EKRANU. Ta sama
        // klasa co wyżej: skasowanie dymku bez widocznego zdania nie jest
        // poprawką, tylko usunięciem informacji.
        name: "delete the visible sentence that replaced the disabled-button tooltip",
        file: "packages/desktop-ui/src/library/CaptureHistoryReading.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            `      {undoCommandId === undefined && (
        <small className="capture-undo-unavailable">
          No reversible command was recorded for this Capture.
        </small>
      )}\n`,
            "",
            "the capture undo explanation",
          ),
      },
      {
        // GEST PODWÓJNEGO KLIKNIĘCIA ZNIKA Z NAZWY SEPARATORA. Separator ma
        // fokus i obsługę strzałek, więc człowiek z klawiaturą stoi na nim
        // i nie ma skąd wiedzieć, co dwuklik robi.
        name: "take the double-click gesture out of the separator's name",
        file: "packages/desktop-ui/src/RealApp.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            'aria-label="Resize the preview panel; double-click restores the default width"',
            'aria-label="Resize the preview panel"',
            "the inspector separator's accessible name",
          ),
      },
    ],
  }),
);

console.log(
  `\n${results.length - failed.length}/${results.length} breaks behaved as expected`,
);
if (failed.length > 0) {
  for (const result of failed)
    console.log(`  ${result.name}: ${result.verdict} — ${result.reason}`);
  process.exitCode = 1;
}
