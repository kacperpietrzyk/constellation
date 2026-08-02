// Break-testy lotu, który dowiózł resztę Ustawień: lejek i pieniądze (B6),
// dzień roboczy (B10) i asercję plakietek (§7 spisu długu).
//
// Po co osobny plik, skoro w #211 stanął `scripts/break-test.mjs`: tamten jest
// PĘTLĄ (pilnuje, że złamanie naprawdę doszło do `dist`, a przywrócenie
// naprawdę przebudowało), a to jest LISTA ZŁAMAŃ — mówi, CO w tym locie miało
// prawo paść i dlaczego. Precedens: `scripts/break-activity-retirement.mjs`.
//
//   node scripts/break-workspace-settings.mjs
//
// Bramki układu tutaj NIE MA i to jest świadome: ten lot nie dokłada żadnego
// wpisu do `scripts/descendant-overflow.mjs`, więc nie ma czego łamać po
// stronie rejestru długu. `test:renderer-layout` biegnie osobno, na wolnym
// porcie podanym przez `LAYOUT_PORT`, i jego wynik jest w opisie PR-a.
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

// WSZYSTKIE ZŁAMANIA TEGO LOTU SĄ WIDOCZNE WYŁĄCZNIE W TESTACH INTERAKCJI.
// `scripts/run-tests.mjs` świadomie ich nie bierze — montowanie ekranu należy
// do Vitesta — więc `verify` jest jeden i jest nim `test:interaction`.
collect(
  runBreakTests({
    root,
    build: { command: "npm", args: ["run", "build"] },
    verify: { command: "npm", args: ["run", "test:interaction"] },
    breaks: [
      {
        // §7 SPISU DŁUGU, PIERWSZE RAMIĘ: goła liczba. Plakietka kategorii ma
        // mówić, CO sekcja robi. Zanim ta asercja powstała, gwarancję niósł
        // komentarz nad `categoryStatus` — a komentarz nie pada.
        name: "make one badge a bare record count",
        file: "packages/desktop-ui/src/SettingsSurface.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            '    notes: "Import and export",',
            "    notes: String(snapshot.tasks.length),",
            "the notes badge",
          ),
      },
      {
        // §7, DRUGIE RAMIĘ, i to jest ramię, którego wzorzec z reconu NIE
        // ŁAPAŁ. Spec mówił „nie pasuje do /^\\d+$|^\\d+\\s/", czyli liczba
        // goła albo na początku. Błąd, który komentarz w kodzie NAZYWA
        // z imienia, to „Notes 16" — liczba na KOŃCU, przechodząca oba te
        // warunki. Bez trzeciego ramienia ta asercja przepuszczałaby dokładnie
        // ten napis, przed którym stoi.
        name: "count the records in the badge the way the comment names",
        file: "packages/desktop-ui/src/SettingsSurface.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            '    notes: "Import and export",',
            "    notes: `Notes ${snapshot.tasks.length}`,",
            "the notes badge",
          ),
      },
      {
        // ZDOLNOŚĆ, KTÓREJ NIC NIE MONTUJE — klasa, którą #215 zmierzył na tym
        // samym ekranie: NIC w `npm run check` nie czerwieniało, gdy
        // `<AccessSection />` znikał z tego pliku. Kasujemy kontrolkę lejka
        // razem z importem. Bez asercji montowania ta edycja przechodzi całe
        // `npm run check`, a jedyny wywołujący `setWorkspaceCommercialDefaults`
        // znika — czyli wrapper wraca do zera wywołań, od czego ten lot zaczął.
        name: "unmount the funnel: delete <CommercialDefaultsSection /> and its import",
        file: "packages/desktop-ui/src/SettingsSurface.tsx",
        edit: (text) => {
          const withoutImport = replaceOnce(
            text,
            'import { CommercialDefaultsSection } from "./settings/CommercialDefaultsSection.js";\n',
            "",
            "the funnel import",
          );
          const open = withoutImport.indexOf(
            "              <CommercialDefaultsSection\n",
          );
          if (open === -1)
            throw new Error(
              "the funnel element is not there any more, so this break would be a no-op",
            );
          const marker = "\n              />\n";
          const close = withoutImport.indexOf(marker, open);
          if (close === -1)
            throw new Error(
              "the funnel element has no closing tag where this break expects one",
            );
          return (
            withoutImport.slice(0, open) +
            withoutImport.slice(close + marker.length)
          );
        },
      },
      {
        // TA SAMA KLASA, DRUGA KONTROLKA. Dzień roboczy był czytany na trzech
        // ekranach i ustawialny nigdzie; bez tej asercji może tam wrócić bez
        // jednego czerwonego testu.
        name: "unmount the working day: delete <WorkingDaySection /> and its import",
        file: "packages/desktop-ui/src/SettingsSurface.tsx",
        edit: (text) => {
          const withoutImport = replaceOnce(
            text,
            'import { WorkingDaySection } from "./settings/WorkingDaySection.js";\n',
            "",
            "the working-day import",
          );
          const open = withoutImport.indexOf(
            "              <WorkingDaySection\n",
          );
          if (open === -1)
            throw new Error(
              "the working-day element is not there any more, so this break would be a no-op",
            );
          const marker = "\n              />\n";
          const close = withoutImport.indexOf(marker, open);
          if (close === -1)
            throw new Error(
              "the working-day element has no closing tag where this break expects one",
            );
          return (
            withoutImport.slice(0, open) +
            withoutImport.slice(close + marker.length)
          );
        },
      },
      {
        // CAŁA POPRAWKA B6 W JEDNEJ LINII: `stages` ZASTĘPUJE listę, więc
        // wysłanie samego nowego etapu KASUJE resztę lejka — i komenda zostaje
        // PRZYJĘTA. To jest awaria bez komunikatu błędu, dokładnie ta, przed
        // którą ostrzega komentarz wrappera.
        name: "send only the new stage: the rest of the funnel is deleted, silently",
        file: "packages/desktop-ui/src/settings/CommercialDefaultsSection.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "      stages: [\n        ...stages,",
            "      stages: [",
            "the whole-list replacement on create",
          ),
      },
      {
        // Identyfikator etapu jest tym, co `opportunity.stage` PRZECHOWUJE.
        // Zmiana nazwy, która go regeneruje, osierocą każdy deal stojący na tej
        // kolumnie — a lista dalej wygląda poprawnie na ekranie.
        name: "regenerate the stage id on rename: every deal on that column is orphaned",
        file: "packages/desktop-ui/src/settings/CommercialDefaultsSection.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "                        other.id === stage.id ? { ...other, label } : other,",
            "                        other.id === stage.id\n                          ? { ...other, id: crypto.randomUUID(), label }\n                          : other,",
            "the stable id on rename",
          ),
      },
      {
        // Komenda jest CZĘŚCIOWA PO POLU. Dopisanie klucza, którego nikt nie
        // ruszył, przepisuje ustawienie, o którym piszący nie myślał — a przy
        // `stages` byłoby to przepisanie całej listy z widoku, który mógł być
        // nieaktualny.
        name: "restate the uplift when only the markup changed",
        file: "packages/desktop-ui/src/settings/CommercialDefaultsSection.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "      ...(upliftPct === defaults.upliftPct ? {} : { upliftPct }),",
            "      upliftPct,",
            "the partial-by-field payload",
          ),
      },
      {
        // Dzień roboczy jedzie CAŁY. Wysłanie samych godzin gubi dni tygodnia,
        // a `WorkingDaySchema` wymaga co najmniej jednego — więc zapis pada na
        // granicy, a nie w ekranie, i człowiek dostaje odmowę bez powodu.
        name: "drop the weekdays from the working-day write",
        file: "packages/desktop-ui/src/settings/WorkingDaySection.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "          weekdays: orderedWeekdays,",
            "          weekdays: [],",
            "the weekdays in the payload",
          ),
      },
      {
        // Strażnik przy renderze, nie przy zapisie: bez tego warunku ekran
        // OFERUJE zapis dnia, który kończy się przed swoim początkiem, i
        // wydaje rundę do kernela po to, żeby usłyszeć nie.
        name: "offer to save a day that ends before it starts",
        file: "packages/desktop-ui/src/settings/WorkingDaySection.tsx",
        edit: (text) =>
          replaceOnce(
            text,
            "    startMinute < endMinute &&",
            "",
            "the start-before-end refusal",
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
