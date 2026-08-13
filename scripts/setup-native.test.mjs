// Ten test NIE buduje natywnego sterownika i nie udaje, że buduje: tamten krok
// potrzebuje sieci, autotools i nagłówków Electrona. Mierzy dwie rzeczy, które
// da się zmierzyć wszędzie, a które psuły się po cichu — KOLEJNOŚĆ kroków
// (amalgamacja przed buildem, bo build ją czyta) i to, KIEDY pętla dev ma
// odmówić.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  NATIVE_BINDING,
  NATIVE_SETUP_REMEDY,
  NATIVE_SQLCIPHER_MARKER,
  nativeDriverState,
  nativeSetupPlan,
} from "./setup-native.mjs";

const root = "/repo";

test("the macOS plan generates the amalgamation before the build that reads it", () => {
  const plan = nativeSetupPlan({
    root,
    amalgamationDirectory: "/tmp/amalgamation",
    platform: "darwin",
  });
  assert.equal(plan.length, 2);
  // Kolejność jest treścią, nie porządkiem: `build-sqlcipher-macos.sh` zaczyna
  // od `test -f "$AMALGAMATION_DIR/sqlite3.c"`, więc odwrócony plan pada.
  assert.equal(
    plan[0].args[0],
    path.join(root, "scripts", "native", "generate-sqlcipher-amalgamation.sh"),
  );
  assert.equal(
    plan[1].args[0],
    path.join(root, "scripts", "native", "build-sqlcipher-macos.sh"),
  );
  // Ten sam katalog w obu krokach, inaczej drugi czyta pustkę.
  assert.equal(plan[0].args[1], "/tmp/amalgamation");
  assert.equal(plan[1].args[1], "/tmp/amalgamation");
  // Korzeń podany JAWNIE: bez niego skrypt łata `node_modules` obok siebie,
  // a nie w drzewie roboczym, z którego go zawołano.
  assert.equal(plan[1].args[2], root);
});

test("the Windows plan drives the PowerShell build with the same amalgamation", () => {
  const plan = nativeSetupPlan({
    root,
    amalgamationDirectory: "/tmp/amalgamation",
    platform: "win32",
  });
  assert.equal(plan.length, 2);
  assert.equal(plan[1].command, "powershell");
  assert.equal(
    plan[1].args.includes(
      path.join(root, "scripts", "native", "build-sqlcipher-windows.ps1"),
    ),
    true,
  );
  assert.equal(plan[1].args.includes("/tmp/amalgamation"), true);
  assert.equal(plan[1].args.includes(root), true);
});

test("a platform with no native build script is refused by name", () => {
  assert.throws(
    () =>
      nativeSetupPlan({
        root,
        amalgamationDirectory: "/tmp/amalgamation",
        platform: "linux",
      }),
    (error) => {
      assert.match(error.message, /linux/u);
      assert.match(error.message, /macOS and Windows only/u);
      return true;
    },
  );
});

test("a binding built without SQLCipher is refused, not accepted for existing", () => {
  // To jest cały defekt 1 w jednej asercji: `npm install` bez
  // `--ignore-scripts` zostawia binarkę zbudowaną przeciw ABI Node'a i bez
  // SQLCiphera. Ona ISTNIEJE — i jest dokładnie tym stanem, w którym aplikacja
  // dev nie wstaje.
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "native-state-"));
  try {
    const absent = nativeDriverState(fixture);
    assert.equal(absent.ready, false);
    assert.match(absent.reason, /better_sqlite3\.node/u);

    fs.mkdirSync(path.join(fixture, path.dirname(NATIVE_BINDING)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(fixture, NATIVE_BINDING), "");
    const unmarked = nativeDriverState(fixture);
    assert.equal(unmarked.ready, false);
    assert.match(unmarked.reason, /SQLCipher/u);

    fs.writeFileSync(path.join(fixture, NATIVE_SQLCIPHER_MARKER), "");
    assert.equal(nativeDriverState(fixture).ready, true);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("the refusal carries the command that fixes it, not only the diagnosis", () => {
  assert.match(NATIVE_SETUP_REMEDY, /npm run setup:native/u);
  assert.match(NATIVE_SETUP_REMEDY, /after every npm install/u);
});

test("the native binding targets the Electron the packaged application ships", () => {
  // Trzy pliki muszą zgadzać się co do JEDNEJ wersji Electrona, a żaden z nich
  // nie widzi pozostałych. `setup:native` woła skrypty natywne, więc zbudują
  // one nagłówki tej wersji, którą mają wpisaną — a `fetch-electron.mjs` pobiera
  // binarkę, którą pakiet naprawdę niesie. Rozjazd nie objawia się błędem
  // budowy: objawia się aplikacją, która nie wstaje, czyli dokładnie tym
  // modalem, przez który powstała ta fala.
  //
  // Porównywana jest wersja PAKOWANA, nie devDependency `electron` z
  // `package.json`. To jest świadome: pakiet niesie binarkę z
  // `fetch-electron.mjs`, a devDependency służy pętli dev i bywa nowszy
  // w obrębie tego samego majora, czyli tego samego ABI modułów natywnych.
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const read = (relative) =>
    fs.readFileSync(path.join(repositoryRoot, relative), "utf8");

  const fetcher = read("scripts/desktop/fetch-electron.mjs");
  const shipped = new Set([
    ...[...fetcher.matchAll(/electron-v(\d+\.\d+\.\d+)-/gu)].map(
      (match) => match[1],
    ),
    /electron: "(\d+\.\d+\.\d+)"/u.exec(fetcher)?.[1],
  ]);
  assert.equal(
    shipped.size,
    1,
    `fetch-electron.mjs names more than one Electron version: ${[...shipped].join(", ")}`,
  );
  const [version] = [...shipped];
  assert.match(version, /^\d+\.\d+\.\d+$/u);

  assert.equal(
    /ELECTRON_VERSION="([^"]+)"/u.exec(
      read("scripts/native/build-sqlcipher-macos.sh"),
    )?.[1],
    version,
  );
  assert.equal(
    /\$ElectronVersion = "([^"]+)"/u.exec(
      read("scripts/native/build-sqlcipher-windows.ps1"),
    )?.[1],
    version,
  );
});
