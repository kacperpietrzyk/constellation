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
  ],
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
