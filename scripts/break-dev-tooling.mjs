// DOWÓD, że asercje pilnujące pętli deweloperskiej naprawdę pilnują.
//
// Fala F naprawia cztery defekty oprzyrządowania, a każdy z nich przez wiele
// miesięcy przechodził KOMPLET zielonych bramek — bo żadna bramka go nie
// mierzyła. Nowe asercje mają dokładnie ten sam sposób umierania: pilnują
// rzeczy, których w tym drzewie roboczym nie da się uruchomić (Electron,
// natywny sterownik, sieć), więc bez złamania nie sposób odróżnić „pilnuje"
// od „jest zielone, bo nic nie sprawdza".
//
// Pętla jest ta z `break-test.mjs` (#211) i nie jest tutaj pisana od nowa.
// Łamane pliki to `.sh` i `.mjs`, więc dowód przebudowy ich nie dotyczy —
// nie mają `dist/`, którego można by zatruć — a pliki `.ts` idą przez `tsc -b`
// wewnątrz obiegu.
//
//   node scripts/break-dev-tooling.mjs
//
// CHODZI RĘCZNIE, nie w `npm run check`: każde złamanie przebudowuje repo
// i uruchamia zestaw testów, więc jest to minuty, nie sekundy.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Podmiana, która PADA, kiedy nie trafiła — najczęstszy powód, dla którego
 * break-test wraca zielony, to regexp albo napis, który się nie znalazł.
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

const nodeTest = (...files) => ({
  command: "node",
  args: ["--test", ...files],
});

const outcome = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "build"] },
  verify: nodeTest(
    "scripts/native/sqlcipher-amalgamation-environment.test.mjs",
    "scripts/setup-native.test.mjs",
    "scripts/dev-renderer-gate.test.mjs",
  ),
  breaks: [
    {
      // DEFEKT 3, pierwsze założenie: GNU-owy `sha256sum`. Oddane oznacza
      // „skrypt nie sprawdza, czy ma czym policzyć sumę" — na hoście bez
      // `sha256sum` przejdzie dalej i padnie później, na czymś innym.
      name: "assume sha256sum exists: a macOS host stops being told which tool it lacks",
      file: "scripts/native/generate-sqlcipher-amalgamation.sh",
      edit: (text) =>
        replaceOnce(
          text,
          `else
  missing_tool "a SHA-256 tool (sha256sum or shasum)" \\
    "Install coreutils, or run this on a host whose base system ships shasum."
fi`,
          `else
  sha256_of() { sha256sum "$1" | cut -d ' ' -f 1; }
fi`,
          "the SHA-256 probe",
        ),
    },
    {
      // DEFEKT 3, trzecie założenie: `tclsh` na hoście. Oddane oznacza, że
      // brak Tcl wychodzi dopiero z wnętrza `make sqlite3.c` — po klonie
      // z sieci, czyli po minucie czekania na coś, co dało się powiedzieć od
      // razu. Oba workflowy instalują `tcl-dev` obok `libssl-dev`.
      name: "assume tclsh exists: a host without Tcl learns it from inside make, after the clone",
      file: "scripts/native/generate-sqlcipher-amalgamation.sh",
      edit: (text) =>
        replaceOnce(
          text,
          "for tool in git make tclsh; do",
          "for tool in git make; do",
          "the Tcl probe",
        ),
    },
    {
      // DEFEKT 3, drugie założenie: `-lcrypto` na domyślnej ścieżce linkera.
      // Oddane oznacza, że host bez nagłówków OpenSSL-a dowiaduje się o tym
      // dopiero z wnętrza `configure`, po klonie z sieci.
      name: "assume -lcrypto resolves: a host without OpenSSL headers learns it from configure, after the clone",
      file: "scripts/native/generate-sqlcipher-amalgamation.sh",
      edit: (text) =>
        replaceOnce(
          text,
          `if [[ -z "$CRYPTO_LDFLAGS" ]]; then
  if [[ -f /usr/include/openssl/evp.h ]]; then
    CRYPTO_LDFLAGS="-lcrypto"
  else
    missing_tool "the OpenSSL development headers and library" \\
      "On macOS: brew install openssl@3 pkg-config. On Debian/Ubuntu: apt-get install libssl-dev pkg-config."
  fi
fi`,
          `if [[ -z "$CRYPTO_LDFLAGS" ]]; then
  CRYPTO_LDFLAGS="-lcrypto"
fi`,
          "the OpenSSL probe",
        ),
    },
    {
      // DEFEKT 1: sonda uznaje ISTNIENIE binarki za gotowość. To jest dokładnie
      // ten stan, w którym pętla dev nie wstaje: `npm install` bez
      // `--ignore-scripts` zostawia `better_sqlite3.node` zbudowany przeciw ABI
      // Node'a i bez SQLCiphera. Sonda mierząca obecność nigdy nie mierzy
      // pochodzenia.
      name: "accept any better_sqlite3.node: a binding built without SQLCipher passes for ready",
      file: "scripts/setup-native.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `  if (!exists(path.join(root, NATIVE_SQLCIPHER_MARKER)))
    return {
      ready: false,
      reason: \`\${NATIVE_BINDING} exists but \${NATIVE_SQLCIPHER_MARKER} does not, so the binding was built without the pinned SQLCipher source.\`,
    };
`,
          "",
          "the SQLCipher provenance check",
        ),
    },
    {
      // DEFEKT 1, wersja Electrona: skrypt natywny buduje przeciw nagłówkom
      // wpisanym u siebie, a pakiet niesie binarkę z `fetch-electron.mjs`.
      // Rozjazd nie pada na budowie — pada dopiero przy starcie aplikacji,
      // i to jest ten sam pusty modal, od którego zaczęła się ta fala.
      name: "let the native scripts target another Electron than the package ships",
      file: "scripts/native/build-sqlcipher-macos.sh",
      edit: (text) =>
        replaceOnce(
          text,
          'ELECTRON_VERSION="43.1.0"',
          'ELECTRON_VERSION="43.2.0"',
          "the Electron target of the macOS native build",
        ),
    },
    {
      // DEFEKT 1, druga połowa: kolejność kroków. `build-sqlcipher-macos.sh`
      // otwiera się od `test -f "$AMALGAMATION_DIR/sqlite3.c"`, więc plan
      // odwrócony pada — ale pada dopiero po wykonaniu, na maszynie z siecią
      // i autotoolsami. Asercja ma to złapać wszędzie.
      name: "swap the two native steps: the build runs before the source it reads exists",
      file: "scripts/setup-native.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `  if (platform === "darwin")
    return [
      {
        label: "generate the pinned SQLCipher amalgamation",
        command: "bash",
        args: [generate, amalgamationDirectory],
      },
      {
        label: "rebuild better-sqlite3 against it for the Electron ABI",
        command: "bash",
        args: [
          path.join(root, "scripts", "native", "build-sqlcipher-macos.sh"),
          amalgamationDirectory,
          root,
        ],
      },
    ];`,
          `  if (platform === "darwin")
    return [
      {
        label: "rebuild better-sqlite3 against it for the Electron ABI",
        command: "bash",
        args: [
          path.join(root, "scripts", "native", "build-sqlcipher-macos.sh"),
          amalgamationDirectory,
          root,
        ],
      },
      {
        label: "generate the pinned SQLCipher amalgamation",
        command: "bash",
        args: [generate, amalgamationDirectory],
      },
    ];`,
          "the macOS step order",
        ),
    },
    {
      // DEFEKT 4, pierwsza połowa: oddaj bramie warunek świeżości i zostaw samo
      // „czy plik jest kompletny". ZMIERZONE: przez 463 ms po starcie watchera
      // ten warunek jest SPEŁNIONY przez bundle z poprzedniej budowy — czyli
      // złamana brama przepuszcza dokładnie w tej chwili, w której Electron
      // startował przedtem.
      name: "let the pre-watch bundle satisfy the gate: the existence-only check is the defect wearing a gate",
      file: "scripts/dev-renderer-gate.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `  if (
    baseline.present &&
    current.mtimeMs === baseline.mtimeMs &&
    current.size === baseline.size
  )
    return {
      ready: false,
      reason:
        "index.html is still the one the pre-watch build left behind, so the " +
        "watcher has not rewritten it yet and is about to delete it",
    };
`,
          "",
          "the freshness clause",
        ),
    },
    {
      // DEFEKT 4, druga połowa: przepuść bundle zapisany w połowie. `index.html`
      // istnieje i jest świeży, ale `assets/*` jeszcze się nie zapisały —
      // Electron dostaje pustą stronę zamiast ERR_FILE_NOT_FOUND, czyli awarię
      // trudniejszą do rozpoznania niż ta pierwotna.
      name: "accept a half-written bundle: index.html is fresh but the chunks it names are not there yet",
      file: "scripts/dev-renderer-gate.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `  if (current.missingAssets.length > 0)
    return {
      ready: false,
      reason: \`index.html references \${current.missingAssets.length} file(s) the watcher has not written yet, starting with \${current.missingAssets[0]}\`,
    };
`,
          "",
          "the completeness clause",
        ),
    },
    {
      // DEFEKT 4, cisza: brama, która nie zna rozbieranej pętli. Zmierzona
      // ścieżka — watcher renderera pada przy starcie, `dev-desktop.mjs`
      // wypisuje „Tearing down the dev loop" i woła `stop()`, a brama milczy
      // jeszcze przez cały sufit czasu nad pętlą, której już nie ma.
      name: "let the gate ignore a torn-down loop: sixty seconds of silence after an explicit teardown",
      file: "scripts/dev-renderer-gate.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `      if (abandoned()) {
        finish(
          reject,
          new Error(
            "The dev loop was torn down while the renderer bundle was still " +
              \`building (\${last.reason}), so Electron was never started.\`,
          ),
        );
        return;
      }
`,
          "",
          "the abandonment check inside the wait",
        ),
    },
    {
      // DEFEKT 4, trzecia połowa — KOLEJNOŚĆ, czyli logika sprzed naprawy
      // w czystej postaci: uruchom Electrona, a dopiero potem czekaj na
      // renderer. Dokładnie to robił `dev-desktop.mjs`.
      name: "start Electron before the wait, exactly as the old loop did",
      file: "scripts/dev-renderer-gate.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `  const verdict = await wait();`,
          `  start();
  const verdict = await wait();`,
          "the start-after-wait order",
        ),
    },
    {
      // DEFEKT 4, PIERWSZY START W PLIKU, W KTÓRYM DEFEKT MIESZKAŁ. Złamanie
      // wyżej („start Electron before the wait") edytuje moduł bramy, więc
      // dowodzi rzeczy o module — a nie tego, że pętla dev przez bramę
      // przechodzi. TO złamanie jest logiką sprzed naprawy w czystej postaci:
      // `startElectron();` dokładnie w tym wierszu, w którym stało.
      name: "start Electron straight from the dev loop, bypassing the gate entirely",
      file: "scripts/dev-desktop.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `const started =
  await startWhenBundleIsWhole(bundleBeforeWatch).catch(reportGateFailure);`,
          `startElectron();
const started = { started: true };`,
          "the gated first start",
        ),
    },
    {
      // DEFEKT 4, RESTART: ta sama pętla, druga ścieżka. Restart po
      // przebudowie procesu głównego omijał bramę w całości i wchodził w to
      // samo okno pustego `dist/` — a `loadFile` odrzucone tam wywala CAŁĄ
      // pętlę dev, nie samo okno.
      name: "restart Electron without the gate, into the window where vite has emptied dist",
      file: "scripts/dev-desktop.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `      void startWhenBundleIsWhole(WITHOUT_PRE_WATCH_STAMP)
        .catch(reportGateFailure)
        .finally(() => restarts.settle());`,
          "      startElectron();",
          "the gated restart",
        ),
    },
    {
      // DEFEKT 4, KSIĘGOWOŚĆ RESTARTU: żądanie przybyłe w trakcie restartu
      // zapisane zamiast odrzuconego. Dotyczy PROCESU, KTÓRY JUŻ NIE ŻYJE,
      // więc nikt go nie zużyje — a pierwsze prawdziwe wyjście następnego okna
      // przeczyta je jako restart i wstanie po cichu zamiast zwinąć pętlę.
      // Osiągalne dopiero odkąd restart czeka na bramę, czyli od tej naprawy.
      name: "record a restart request mid-restart: the next genuine crash silently respawns",
      file: "scripts/dev-renderer-gate.mjs",
      edit: (text) =>
        replaceOnce(
          text,
          `    request: () => {
      if (inFlight) return false;
      requested = true;
      return true;
    },`,
          `    request: () => {
      requested = true;
      return true;
    },`,
          "the in-flight refusal in the restart ledger",
        ),
    },
    {
      // DEFEKT 2: oddaj przyczynę z komunikatu i zostaw samo uspokojenie.
      // Tak wyglądał modal zmierzony DWA RAZY na realnych danych: „The local
      // workspace was not opened" i ani jednego szczegółu.
      //
      // Plik jest w TypeScripcie, więc obieg przechodzi przez `tsc -b`,
      // a harness żąda dowodu przebudowy — inaczej weryfikacja czytałaby
      // `dist` sprzed złamania.
      name: "swallow the cause again: the modal says only that the workspace was not opened",
      file: "packages/desktop-main/src/startup-failure.ts",
      verify: nodeTest(
        "packages/desktop-main/dist/test/startup-failure.test.js",
      ),
      edit: (text) =>
        replaceOnce(
          text,
          "return { code, guidance, cause, detail: `${guidance}\\n\\nCause: ${cause}` };",
          "return { code, guidance, cause, detail: guidance };",
          "the cause in the dialog detail",
        ),
    },
    {
      // DEFEKT 2, sedno: postaw przyczynę z powrotem za zmienną, która
      // JEDNOCZEŚNIE przestawia korzeń workspace'u. Diagnostyka zmieniająca
      // mierzoną rzecz nie jest diagnostyką — a złamanie pokazuje, że asercja
      // pilnuje właśnie tego, a nie tylko obecności napisu.
      name: "gate the cause on the smoke-root variable: asking why startup failed changes what startup does",
      file: "packages/desktop-main/src/startup-failure.ts",
      verify: nodeTest(
        "packages/desktop-main/dist/test/startup-failure.test.js",
      ),
      edit: (text) =>
        replaceOnce(
          text,
          "return { code, guidance, cause, detail: `${guidance}\\n\\nCause: ${cause}` };",
          'return {\n    code,\n    guidance,\n    cause,\n    detail:\n      process.env["CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT"] === undefined\n        ? guidance\n        : `${guidance}\\n\\nCause: ${cause}`,\n  };',
          "the unconditional cause",
        ),
    },
  ],
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
