// Break-testy lotu, który wycofał powierzchnię `access` do sekcji Ustawień.
//
// Po co osobny plik, skoro w #211 stanął `scripts/break-test.mjs`: tamten jest
// PĘTLĄ, a to jest LISTA ZŁAMAŃ. Pętla pilnuje, żeby złamanie naprawdę doszło
// do `dist` (dowód przebudowy) i żeby edycja naprawdę coś zmieniła; ten plik
// mówi, CO w tym locie miało prawo paść i dlaczego. Precedens:
// `scripts/break-record-screen-geometry.mjs` z lotu ekranu rekordu.
//
//   node scripts/break-access-retirement.mjs
//
// NIE MA TU BRAMKI UKŁADU i to jest decyzja, nie przeoczenie.
// `verify-renderer-layout.mjs` przypina PORT 5178 z `--strictPort`, więc dwa
// worktree, które odpalą ją naraz, mierzą NAWZAJEM SWOJE aplikacje — i ten
// wariant wraca ZIELONY, bo mierzy cudze, zdrowe drzewo. Złamanie sufitu
// `settings / div._memberList` zostało przeprowadzone RĘCZNIE, na kopii tego
// skryptu z innym portem, i jest opisane w treści PR-a. Wpisanie go tutaj
// zrobiłoby z tej listy przyrząd, który czasem sprawdza cudzą pracę.
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

const { results, failed, ok } = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "build"] },
  verify: { command: "node", args: ["scripts/run-tests.mjs"] },
  breaks: [
    {
      // NAJDROŻSZE ZŁAMANIE TEGO LOTU. Mapa wycofanych celów jest kluczowana
      // zwykłym `string`iem, więc brak wpisu przechodzi kompilację BEZ SŁOWA,
      // a przy pierwszym starcie po aktualizacji zapisana sesja z zakładką
      // `access` jest odrzucana W CAŁOŚCI — każda zakładka, ulubiona pozycja
      // i cała historia. Bez awarii, więc bez śladu. To złamanie sprawdza, że
      // fikstura przywracania naprawdę tego pilnuje.
      name: 'drop `access: "settings"` from the retired-surface map',
      file: "packages/desktop-preload/src/surface-registry.ts",
      edit: (text) =>
        replaceOnce(
          text,
          '    access: "settings",\n',
          "",
          "the retired-surface entry",
        ),
    },
    {
      // Waiver prose-guarda jest kluczowany NAZWĄ PLIKU plus początkiem zdania.
      // Przeprowadzka treści zmienia nazwę pliku, więc wpis przestaje pasować
      // — a wpis, który nic nie dopasowuje, jest u tego strażnika BŁĘDEM.
      // Złamanie przywraca starą nazwę: strażnik musi paść jako „stale waiver".
      name: "re-key the prose-guard waiver back to the retired file name",
      file: "packages/desktop-ui/test/prose-guard.test.ts",
      edit: (text) =>
        replaceOnce(
          text,
          '    file: "settings/AccessSection.tsx",',
          '    file: "AccessSurface.tsx",',
          "the prose-guard waiver",
        ),
    },
    {
      // Zaczep zakresu danych przestał być nazwą klasy i stał się atrybutem
      // danych, bo CSS Moduł nie ma czego wyeksportować dla klasy, której
      // nikt nie deklaruje. Kontrakt odzyskiwania czyta plik jako TEKST, więc
      // to złamanie sprawdza, że czyta ten NOWY zaczep, a nie że przepisano mu
      // regexpa na taki, który trafia w cokolwiek.
      name: "take the data-scope fieldset its hook",
      file: "packages/desktop-ui/src/settings/AccessSection.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          '                  <fieldset\n                    data-space-scope="true"',
          '                  <fieldset\n                    data-nothing-reads-this="true"',
          "the data-scope hook in the creation dialog",
        ),
    },
    {
      // Status wiersza grantu jest teraz DANYMI, nie nazwą klasy — właśnie
      // dlatego, że jako nazwa klasy kłamał (wiersz przygasał dla `expired`
      // i `revoked`, a kropka stanu miała regułę tylko dla `revoked`, więc
      // wygasły grant nosił zieloną kropkę „w porządku"). Bez tego atrybutu
      // test zachowania nie ma jak odróżnić wygasłego od odwołanego.
      name: "take the grant row its status",
      file: "packages/desktop-ui/src/settings/AccessSection.tsx",
      edit: (text) =>
        replaceOnce(
          text,
          "                    data-grant-status={grant.status}\n",
          "",
          "the grant status attribute",
        ),
    },
    {
      // Nazwy klas CSS Modułu są CZYTANE Z PLIKU przez
      // `scripts/css-module-hook.mjs`, więc `styles.agentSection` po zmianie
      // nazwy w arkuszu jest `undefined` i markup dostaje klasę „undefined".
      // Test zachowania kroi markup po tej klasie i musi to zobaczyć — inaczej
      // literówka w `styles.x` przechodziłaby na zielono.
      name: "rename the agent ledger class out from under the markup slice",
      file: "packages/desktop-ui/src/settings/access-section.module.css",
      edit: (text) =>
        replaceOnce(
          text,
          ".agentSection {\n  gap: 0;\n}",
          ".agentSectionRenamed {\n  gap: 0;\n}",
          "the agent ledger class",
        ),
    },
  ],
});

console.log(
  `\n${results.length - failed.length}/${results.length} breaks behaved as expected`,
);
if (!ok) {
  for (const result of failed)
    console.log(`  ${result.name}: ${result.verdict} — ${result.reason}`);
  process.exitCode = 1;
}
