// Odbudowa natywnego sterownika po instalacji zależności — jednym poleceniem.
//
// PO CO TO ISTNIEJE. `node_modules/better-sqlite3` musi być zbudowany przeciw
// ABI Electrona i przeciw przypiętemu źródłu SQLCiphera, inaczej aplikacja dev
// nie wstaje. Ten krok istniał WYŁĄCZNIE w dwóch workflowach CI, więc znikał
// po każdym `npm install` i był niewidzialny dla każdego, kto sklonował repo.
//
// DLACZEGO NIE `postinstall`, skoro to skrypt. Trzy powody, wszystkie
// sprawdzalne w tym repozytorium:
//
//   1. Udokumentowaną ścieżką instalacji jest `npm ci --ignore-scripts`
//      (README, sekcja Development). `postinstall` z definicji się tam nie
//      uruchomi, więc automatyzacja obiecywałaby coś, czego nie robi.
//   2. Ten krok klonuje SQLCiphera z sieci i buduje go autotoolsami. Cicha
//      instalacja zależności nie jest miejscem na kilkuminutowy build
//      wymagający sieci — a `npm ci` na CI robi się kilkanaście razy dziennie
//      w zadaniach, które natywnego sterownika nie dotykają.
//   3. Oba workflowy wołają te kroki JAWNIE i to one są kontraktem wydania.
//      Trzecie, niejawne wywołanie tego samego z `postinstall` dawałoby dwie
//      prawdy o tym, jak powstaje binarka podpisywana w wydaniu.
//
// Zostaje więc jawne polecenie — `npm run setup:native` — plus sonda niżej,
// dzięki której pętla dev odmawia z NAZWANYM lekarstwem zamiast padać
// w środku startu Electrona.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ślad, że natywny sterownik NAPRAWDĘ przeszedł przez skrypty SQLCiphera.
 *
 * Sprawdzana jest licencja, nie sama binarka, i to nie jest ozdoba: zwykły
 * `npm install` bez `--ignore-scripts` potrafi zbudować `better_sqlite3.node`
 * przeciw ABI Node'a i bez SQLCiphera. Taka binarka istnieje, a mimo to jest
 * dokładnie tym stanem, przez który aplikacja nie wstaje. Plik licencji kopiuje
 * OSTATNI krok `build-sqlcipher-{macos,windows}` i tylko on.
 */
export const NATIVE_MODULE_DIRECTORY = path.join(
  "node_modules",
  "better-sqlite3",
);
export const NATIVE_BINDING = path.join(
  NATIVE_MODULE_DIRECTORY,
  "build",
  "Release",
  "better_sqlite3.node",
);
export const NATIVE_SQLCIPHER_MARKER = path.join(
  NATIVE_MODULE_DIRECTORY,
  "SQLCipher-LICENSE.md",
);

/** Co trzeba powiedzieć czytelnikowi, żeby nie musiał tego szukać. */
export const NATIVE_SETUP_REMEDY =
  "Run: npm run setup:native (rebuilds better-sqlite3 against the pinned " +
  "SQLCipher source and the Electron ABI; needed again after every npm install)";

/**
 * Czy natywny sterownik jest gotowy — czysta funkcja nad istnieniem plików,
 * żeby dało się ją sprawdzić bez Electrona i bez zbudowanego modułu.
 */
export const nativeDriverState = (root, exists = existsSync) => {
  if (!exists(path.join(root, NATIVE_BINDING)))
    return {
      ready: false,
      reason: `${NATIVE_BINDING} is missing, so better-sqlite3 was never built for this checkout.`,
    };
  if (!exists(path.join(root, NATIVE_SQLCIPHER_MARKER)))
    return {
      ready: false,
      reason: `${NATIVE_BINDING} exists but ${NATIVE_SQLCIPHER_MARKER} does not, so the binding was built without the pinned SQLCipher source.`,
    };
  return {
    ready: true,
    reason: "the native driver carries the SQLCipher source it was built from.",
  };
};

/**
 * Kolejność kroków, w jednym miejscu i bez ich wykonywania — dzięki temu plan
 * daje się sprawdzić testem na maszynie, na której samego buildu wykonać się
 * nie da (potrzebuje sieci, autotools i nagłówków Electrona).
 */
export const nativeSetupPlan = ({ root, amalgamationDirectory, platform }) => {
  const generate = path.join(
    root,
    "scripts",
    "native",
    "generate-sqlcipher-amalgamation.sh",
  );
  if (platform === "darwin")
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
    ];
  if (platform === "win32")
    return [
      {
        label: "generate the pinned SQLCipher amalgamation",
        command: "bash",
        args: [generate, amalgamationDirectory],
      },
      {
        label: "rebuild better-sqlite3 against it for the Electron ABI",
        command: "powershell",
        args: [
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(root, "scripts", "native", "build-sqlcipher-windows.ps1"),
          "-Amalgamation",
          amalgamationDirectory,
          "-TargetRoot",
          root,
        ],
      },
    ];
  // Odmowa NAZYWAJĄCA to, czego nie ma, zamiast buildu, który padnie później:
  // repozytorium nie niesie skryptu natywnego dla tej platformy, bo pakowana
  // aplikacja powstaje wyłącznie na macOS-ie i Windowsie.
  throw new Error(
    `No native build script exists for ${platform}; the desktop application is built on macOS and Windows only.`,
  );
};

const main = () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const amalgamationDirectory = mkdtempSync(
    path.join(os.tmpdir(), "constellation-sqlcipher-"),
  );
  const steps = nativeSetupPlan({
    root,
    amalgamationDirectory,
    platform: process.platform,
  });
  for (const step of steps) {
    console.log(`setup:native — ${step.label}`);
    const result = spawnSync(step.command, step.args, {
      cwd: root,
      stdio: "inherit",
    });
    if (result.error !== undefined) {
      console.error(
        `setup:native failed to start ${step.command}: ${result.error.message}`,
      );
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(
        `setup:native stopped: ${step.label} exited ${result.status ?? "on a signal"}.`,
      );
      process.exit(result.status ?? 1);
    }
  }
  // Sonda na końcu, bo „wszystkie kroki zwróciły zero" nie jest tym samym co
  // „sterownik jest na miejscu": to była zmierzona pułapka tej rodziny —
  // `bash skrypt | tail` raz wypisało OK nad pustym katalogiem.
  const state = nativeDriverState(root);
  if (!state.ready) {
    console.error(`setup:native ran every step but ${state.reason}`);
    process.exit(1);
  }
  console.log(`setup:native done — ${state.reason}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
