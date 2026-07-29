import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Testy interakcji należą do Vitesta i tylko do niego: importują `vitest`,
// potrzebują happy-doma i korzenia Reacta. Ten runner ich NIE bierze, mimo że
// leżą obok skompilowane — inaczej padają na samym imporcie, a przy odwrotnym
// błędzie (gdyby jakoś się uruchomiły) wyglądałyby na przechodzące, nie
// wykonawszy ani jednej asercji. Zawężenie jest lustrem `include` w
// `packages/desktop-ui/vitest.config.ts`, które z tego samego powodu nie
// wpuszcza do Vitesta plików `node:test`.
//
// Bez tej reguły nie da się typecheckować testów interakcji: dopisanie
// `test/**/*.tsx` do `include` w tsconfigu renderera wystawia ich kompilaty
// pod ten glob. Osobno łapie to martwe kompilaty po skasowanym źródle —
// `test:quick` nie czyści `build/`, więc taki plik chodzi dalej.
const isInteractionTest = (name) => name.endsWith(".interaction.test.js");

const findTests = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") return [];
      return findTests(entryPath);
    }
    return entry.isFile() &&
      entry.name.endsWith(".test.js") &&
      !isInteractionTest(entry.name)
      ? [entryPath]
      : [];
  });

const tests = findTests(path.join(root, "packages")).sort();
if (tests.length === 0) {
  throw new Error("No compiled test files were found.");
}
// Pusty wynik pomiaru to awaria pomiaru: gdyby powyższe zawężenie kiedyś objęło
// wszystko, ta bramka zgłosiłaby komplet zieleni na zerze testów.
const FEWEST_PLAUSIBLE_TEST_FILES = 70; // 78 at the time of writing
if (tests.length < FEWEST_PLAUSIBLE_TEST_FILES) {
  throw new Error(
    `Only ${tests.length} compiled test files were found, which is too few to be the whole suite.`,
  );
}

// Komponenty pisane od 0.2.0 przynoszą własny arkusz jako CSS Module, a Today
// jest powierzchnią startową, więc nie da się jej ukryć za leniwym importem.
// Bez tego haka test renderujący powłokę przewraca się na rozszerzeniu `.css`,
// zanim wykona jedną asercję.
const cssHook = path.join(root, "scripts", "css-module-register.mjs");

const result = spawnSync(
  process.execPath,
  ["--import", cssHook, "--test", ...tests],
  {
    cwd: root,
    stdio: "inherit",
  },
);

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
