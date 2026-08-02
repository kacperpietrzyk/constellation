// Break-testy lotu, który wycofał powierzchnię `activity` do kategorii
// „Data and privacy" Ustawień — i przy okazji zdjął z lewej kolumny pozycję
// Ustawień, której nie miało tam być od dwóch fal.
//
// Po co osobny plik, skoro w #211 stanął `scripts/break-test.mjs`: tamten jest
// PĘTLĄ, a to jest LISTA ZŁAMAŃ. Pętla pilnuje, żeby złamanie naprawdę doszło
// do `dist` (dowód przebudowy) i żeby edycja naprawdę coś zmieniła; ten plik
// mówi, CO w tym locie miało prawo paść i dlaczego. Precedens:
// `scripts/break-access-retirement.mjs` z lotu `access`.
//
//   node scripts/break-activity-retirement.mjs
//
// BRAMKA UKŁADU JEST TU, w trzeciej pętli, i to jest różnica wobec #215.
// `verify-renderer-layout.mjs` przyjmuje od #214 `LAYOUT_PORT`, a od lotu LIBP
// dowodzi TOŻSAMOŚCI mierzonego drzewa (żąda pliku z korzenia TEGO worktree,
// więc żywy serwer sąsiada odpowiada 403). Bez obu tych rzeczy pętla z bramką
// byłaby przyrządem, który czasem sprawdza cudzą pracę. Port podaje się
// zmienną `LAYOUT_PORT`; bez niej ta pętla jest POMIJANA, świadomie i głośno,
// zamiast biec na porcie domyślnym, który na tej maszynie bywa zajęty.
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

collect(
  runBreakTests({
    root,
    build: { command: "npm", args: ["run", "build"] },
    verify: { command: "node", args: ["scripts/run-tests.mjs"] },
    breaks: [
      {
        // NAJDROŻSZE ZŁAMANIE TEGO LOTU, tak samo jak w #215. Mapa wycofanych
        // celów jest kluczowana zwykłym `string`iem, więc brak wpisu przechodzi
        // kompilację BEZ SŁOWA, a przy pierwszym starcie po aktualizacji
        // zapisana sesja z zakładką `activity` jest odrzucana W CAŁOŚCI — każda
        // zakładka, ulubiona pozycja i cała historia. Bez awarii, więc bez
        // śladu.
        name: 'drop `activity: "settings"` from the retired-surface map',
        file: "packages/desktop-preload/src/surface-registry.ts",
        edit: (text) =>
          replaceOnce(
            text,
            '    activity: "settings",\n',
            "",
            "the retired-surface entry",
          ),
      },
      {
        // SCALENIE DUBLI, czyli to, co ten lot naprawił. Bez niego sesja
        // trzymająca OBA wycofane cele odtwarza dwie zakładki o identycznym
        // kluczu `destination:settings`. Złamanie zdejmuje scalanie i zostawia
        // resztę nietkniętą — fikstura z trzema zakładkami musi to zobaczyć.
        name: "take the restore path its key merge: two tabs, one key",
        file: "packages/desktop-ui/src/client/shell-navigation.ts",
        edit: (text) =>
          replaceOnce(
            text,
            "    const tabs = migrated.filter(\n      (tab, index) =>\n        migrated.findIndex((other) => other.key === tab.key) === index,\n    );",
            "    const tabs = migrated;",
            "the restore-path key merge",
          ),
      },
      {
        // KOLEJNOŚĆ TYCH DWÓCH LINII JEST CAŁĄ POPRAWKĄ, więc ma własne
        // złamanie. Scalanie wpięte PRZED bramką długości daje
        // `tabs.length < state.tabs.length`, a to jest dla `restoreShellNavigation`
        // sygnał „zapisu nie rozumiem" — odrzuca CAŁĄ sesję. Czyli wersja,
        // która czyta się najnaturalniej, wywołuje dokładnie tę awarię, przed
        // którą ten lot broni. Bez trzeciej zakładki w fiksturze to złamanie
        // byłoby NIEWIDOCZNE: „została jedna zakładka" wychodzi i ze scalenia,
        // i z odrzucenia.
        name: "merge the keys BEFORE the length gate: the whole session is discarded",
        file: "packages/desktop-ui/src/client/shell-navigation.ts",
        edit: (text) =>
          replaceOnce(
            text,
            "    if (migrated.length !== state.tabs.length)\n      return createShellNavigation(fallback);",
            "    if (migrated.length !== state.tabs.length)\n      return createShellNavigation(fallback);\n    if (new Set(migrated.map((tab) => tab.key)).size !== state.tabs.length)\n      return createShellNavigation(fallback);",
            "the length gate",
          ),
      },
      {
        // R2-1. Pole `chrome` zastąpiło filtr `shortcut !== null`, który NICZEGO
        // NIE ODSIEWAŁ. Złamanie przywraca Ustawienia do zbioru celów lewej
        // kolumny: test renderu powłoki musi paść na zakazie
        // `data-surface="settings"`.
        name: "put the settings MODE back in the sidebar",
        file: "packages/desktop-preload/src/surface-registry.ts",
        edit: (text) =>
          replaceOnce(
            text,
            '    chrome: "mode",',
            '    chrome: "navigation",',
            "the settings chrome field",
          ),
      },
      {
        // Głęboki link jest walidowany przy odtwarzaniu tak samo jak odczyt
        // Biblioteki. Bez tego ramienia zapis niosący kategorię spoza słownika
        // przechodzi, a ekran przewija do identyfikatora, którego nie ma.
        name: "let an unknown settings category through the restore validator",
        file: "packages/desktop-ui/src/client/shell-navigation.ts",
        edit: (text) =>
          replaceOnce(
            text,
            "  if (\n    context.settingsCategory !== undefined &&\n    !isSettingsCategory(context.settingsCategory)\n  )\n    return false;",
            "",
            "the settings-category arm of the restore validator",
          ),
      },
      {
        // Kontrakt odzyskiwania czyta plik sekcji jako TEKST i został PRZEPIĘTY
        // na nową ścieżkę. Złamanie zabiera taflę jej listę: regexp musi trafiać
        // w to, co ta tafla naprawdę rysuje, a nie w cokolwiek.
        name: "take the pane its list class",
        file: "packages/desktop-ui/src/settings/ActivitySection.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "<ol className={styles.list}>",
            "<ol className={styles.groups}>",
            "the activity list class",
          ),
      },
    ],
  }),
);

// DRUGA PĘTLA, bo `scripts/run-tests.mjs` ŚWIADOMIE nie bierze testów
// interakcji — te należą do Vitesta. Montowanie tafli i głęboki link da się
// sprawdzić tylko tam, więc mają własny `verify`.
collect(
  runBreakTests({
    root,
    build: { command: "npm", args: ["run", "build"] },
    verify: { command: "npm", args: ["run", "test:interaction"] },
    breaks: [
      {
        // ZDOLNOŚĆ, KTÓREJ NIC NIE MONTUJE — ta sama klasa, którą #215 nazwał
        // przy `<AccessSection />`. Kasujemy `<ActivitySection />` razem
        // z importem. Bez asercji montowania ta edycja przechodzi CAŁE
        // `npm run check`, a paleta zachowuje cel prowadzący donikąd.
        name: "unmount the pane: delete <ActivitySection /> and its import",
        file: "packages/desktop-ui/src/SettingsSurface.tsx",
        edit: (text) => {
          const withoutImport = replaceOnce(
            text,
            'import { ActivitySection } from "./settings/ActivitySection.js";\n',
            "",
            "the pane import",
          );
          const open = withoutImport.indexOf("            <ActivitySection\n");
          if (open === -1)
            throw new Error(
              "the pane element is not there any more, so this break would be a no-op",
            );
          const close = withoutImport.indexOf("\n            />\n", open);
          if (close === -1)
            throw new Error(
              "the pane element has no closing tag where this break expects one",
            );
          return (
            withoutImport.slice(0, open) +
            withoutImport.slice(close + "\n            />\n".length)
          );
        },
      },
      {
        // Głęboki link po stronie EKRANU. Bez tego efektu prop przychodzi
        // i nie robi nic — czyli paleta otwiera Ustawienia na kategorii
        // wybranej po cichu przez własny stan ekranu, a cofnięcie ląduje na
        // górze strony.
        name: "ignore the requested category: the deep link stops being deep",
        file: "packages/desktop-ui/src/SettingsSurface.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "    if (requestedCategory === undefined) return;\n    navigateToCategory(requestedCategory);",
            "    if (requestedCategory === undefined) return;",
            "the deep-link effect",
          ),
      },
      {
        // Strażnik „zadeklarowana tafla jest zamontowana" po stronie KOTWICY.
        // Bez identyfikatora paleta przewija donikąd, a sama tafla dalej się
        // rysuje — czyli defekt jest niewidoczny dla każdej innej asercji.
        name: "take the pane its anchor id",
        file: "packages/desktop-ui/src/settings/ActivitySection.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            '      id={settingsPaneElementId("activity")}\n',
            "",
            "the pane anchor",
          ),
      },
    ],
  }),
);

// TRZECIA PĘTLA — BRAMKA UKŁADU. Chodzi tylko z jawnym `LAYOUT_PORT`, bo
// port domyślny (5178) bywa na tej maszynie w rękach sąsiedniego worktree,
// a przelot nad cudzą aplikacją wraca ZIELONY.
const layoutPort = process.env.LAYOUT_PORT;
if (layoutPort === undefined) {
  console.log(
    "\nSKIPPED the layout-gate loop: set LAYOUT_PORT=<free port> to run it.\n" +
      "It is skipped rather than run on the default port because a neighbouring\n" +
      "worktree holding 5178 would make this loop measure somebody else's tree.",
  );
} else {
  collect(
    runBreakTests({
      root,
      build: { command: "npm", args: ["run", "build"] },
      verify: {
        command: "npm",
        args: ["run", "test:renderer-layout"],
        env: { LAYOUT_PORT: layoutPort },
      },
      breaks: [
        {
          // DOWÓD, ŻE DWA WPISY REJESTRU DŁUGU ZNIKNĘŁY, BO ELEMENTY PRZESTAŁY
          // SIĘ PRZEPEŁNIAĆ — a nie dlatego, że bramka przestała je widzieć.
          // To jest rozróżnienie, które ten rejestr już raz pomylił, i jedyny
          // sposób, żeby je rozstrzygnąć, to przywrócić defekt i zobaczyć
          // czerwień. Bez zapytania kontenerowego stan pusty tej tafli wraca do
          // globalnej siatki trójkolumnowej, przycisk skalujący się z tekstem
          // zjada trzecią kolumnę i kolumna tekstu ma 13 px szerokości treści.
          name: "restore the collapsed empty state: the pane overflows again at 200% text",
          file: "packages/desktop-ui/src/settings/activity-section.module.css",
          edit: (text) =>
            replaceOnce(
              text,
              "  .root :global(.empty-state) {\n    grid-template-columns: 2.25rem minmax(0, 1fr);\n  }",
              "  .root :global(.empty-state) {\n    grid-template-columns: 2.25rem minmax(0, 1fr) auto;\n  }",
              "the empty-state container query",
            ),
        },
        {
          // DRUGA POŁOWA TEJ SAMEJ PARY, i to jest złamanie o POKRYCIU, nie
          // o układzie. Bramka buduje listę podmiotów Z ŻYWEGO DOM-u i wchodzi
          // w Ustawienia przez `[data-settings-entry]`, bo od tego lotu nie ma
          // ich już w `.nav-item[data-surface]`. Bez tej afordancji cały ekran
          // Ustawień wypada z zamiatania i dwa wpisy rejestru
          // (`form.status-create`, `div._memberList`) idą jako niedopasowane —
          // `unusedRegistryEntries` musi to zamienić w GŁOŚNĄ porażkę.
          name: "take the sweep its way into Settings: the whole screen stops being measured",
          file: "packages/desktop-ui/src/RealApp.tsx",
          edit: (text) =>
            replaceOnce(
              text,
              '            data-settings-entry="true"\n',
              "",
              "the settings entry affordance",
            ),
        },
      ],
    }),
  );
}

console.log(
  `\n${results.length - failed.length}/${results.length} breaks behaved as expected`,
);
if (failed.length > 0) {
  for (const result of failed)
    console.log(`  ${result.name}: ${result.verdict} — ${result.reason}`);
  process.exitCode = 1;
}
