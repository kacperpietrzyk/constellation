// Czy `generate-sqlcipher-amalgamation.sh` mówi, czego mu brakuje, ZANIM
// pociągnie sieć.
//
// Skrypt buduje amalgamację SQLCiphera i tego kroku nie da się wykonać w tym
// teście: potrzebuje klonu z sieci, autotools i kilku minut. Ale cała
// zawartość defektu, który ten test pilnuje, leży PRZED tym krokiem —
// w dwóch założeniach o środowisku runnera (`sha256sum` i `-lcrypto` na
// domyślnej ścieżce), przez które skrypt padał na czystym macOS-ie.
//
// Dlatego mierzone jest to, co da się zmierzyć bez sieci: uruchomienie
// z OKROJONYM `PATH`, w którym brakuje dokładnie jednego z wymaganych
// narzędzi. Stub `PATH` niesie tylko dowiązania do tego, co ma być widoczne,
// więc każde wyjście poza sondę objawia się natychmiast — `mktemp` i `git`
// nie istnieją i skrypt umiera z kodem 127 na „command not found", a nie
// z nazwanym kodem 2 sondy. To jest ta różnica, która robi z tego test
// zamiast dekoracji: przesunięcie sondy pod `git clone` zmienia wynik.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "generate-sqlcipher-amalgamation.sh");

// `test:scripts` jest krokiem suite'u `check`, a CI wykonuje `npm run check`
// TAKŻE na `windows-latest`. Wszystko w tym pliku woła binarki POSIX po
// ścieżkach absolutnych — tam `/bin/bash` rozwija się do `C:\bin\bash`, spawn
// kończy się ENOENT, `status` jest `null`, a każda asercja porównująca go z 0
// pada. Bramka jest w opcji `skip`, a nie gołym `return`, bo licznik
// `skipped` ma powiedzieć prawdę: test, który NICZEGO nie sprawdził, nie może
// stać w kolumnie „pass".
const posixOnly =
  process.platform === "win32" &&
  "the stub PATH, /bin/bash and /usr/bin/which are POSIX-only";

/**
 * Skrypt widoczny w stubie, kiedy nie chodzi o jego treść, tylko o obecność.
 *
 * Sonda pyta `command -v`, więc pusty plik wykonywalny wystarcza — a to zdejmuje
 * z testu zależność od tego, czy dany host w ogóle NIESIE dane narzędzie.
 */
const STUB_TOOL = "#!/bin/sh\nexit 0\n";

/** Katalog `PATH`, w którym widać wyłącznie wymienione narzędzia. */
const stubPath = (tools, stubs = {}) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlcipher-probe-"));
  for (const tool of tools) {
    const real = spawnSync("/usr/bin/which", [tool], { encoding: "utf8" });
    assert.equal(
      real.status,
      0,
      `the host has no ${tool}, so this test cannot build the stub PATH it needs`,
    );
    fs.symlinkSync(real.stdout.trim(), path.join(directory, tool));
  }
  for (const [tool, body] of Object.entries(stubs))
    fs.writeFileSync(path.join(directory, tool), body, { mode: 0o755 });
  return directory;
};

const runWithOnly = (tools, stubs = {}) => {
  const directory = stubPath(tools, stubs);
  try {
    return spawnSync("/bin/bash", [script, path.join(directory, "out")], {
      encoding: "utf8",
      env: { PATH: directory },
      timeout: 30_000,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

/** Tcl jest sprawdzany przed sumą SHA-256, więc bez niego nie widać reszty. */
const withTcl = { tclsh: STUB_TOOL };

test("the script parses", { skip: posixOnly }, () => {
  const parsed = spawnSync("/bin/bash", ["-n", script], { encoding: "utf8" });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test(
  "a host without any SHA-256 tool is told so before anything is cloned",
  { skip: posixOnly },
  () => {
    const run = runWithOnly(["git", "make"], withTcl);
    // Kod 2 jest kodem sondy. Kod 127 znaczyłby, że skrypt przeszedł do
    // `mktemp` — czyli że sonda przestała stać przed pracą.
    assert.equal(run.status, 2, `stderr: ${run.stderr}`);
    assert.match(run.stderr, /missing a SHA-256 tool \(sha256sum or shasum\)/u);
    assert.equal(run.stderr.includes("Cloning into"), false);
  },
);

test(
  "a host without Tcl is told so before anything is cloned",
  { skip: posixOnly },
  () => {
    // `make sqlite3.c` w SQLCipherze nie stoi na samym `make`: oba workflowy
    // instalują `tcl-dev` w tej samej linii `apt-get`, z której bierze się
    // `libssl-dev`. Sonda pokrywała jedną połowę tej linii i nie pokrywała
    // drugiej — brak Tcl wychodził dopiero z wnętrza `make`, po klonie z sieci.
    //
    // Ten test nie zależy od tego, co host ma: sonda Tcl stoi przed sumą
    // SHA-256 i przed OpenSSL-em, więc odpowiedź jest ta sama na macOS-ie
    // i na Linuksie z systemowymi nagłówkami.
    const run = runWithOnly(["git", "make"]);
    assert.equal(run.status, 2, `stderr: ${run.stderr}`);
    assert.match(run.stderr, /missing tclsh/u);
    assert.equal(run.stderr.includes("Cloning into"), false);
  },
);

test(
  "a host without OpenSSL headers is told exactly what to install",
  {
    // Bez `pkg-config` i bez `brew`, a `/usr/include/openssl/evp.h` na
    // macOS-ie nie istnieje — czyli dokładnie ten stan, w którym stare
    // `LDFLAGS=-lcrypto` oddawało błąd linkera z wnętrza `configure`.
    //
    // Host z systemowymi nagłówkami (Linux) tej odmowy NIE DA SIĘ tu wywołać:
    // ścieżka jest absolutna, a stub `PATH` jej nie dosięga. Pominięcie jest
    // nazwane, żeby zielony `test:scripts` na Linuksie nie czytał się jako
    // dowód, że odmowa OpenSSL działa — ona jest tam po prostu niemierzona.
    skip:
      posixOnly ||
      (fs.existsSync("/usr/include/openssl/evp.h") &&
        "this host has system OpenSSL headers, so the refusal is unreachable"),
  },
  () => {
    const run = runWithOnly(["git", "make", "shasum"], withTcl);
    assert.equal(run.status, 2, `stderr: ${run.stderr}`);
    assert.match(
      run.stderr,
      /missing the OpenSSL development headers and library/u,
    );
    assert.match(run.stderr, /brew install openssl@3 pkg-config/u);
    assert.match(run.stderr, /apt-get install libssl-dev pkg-config/u);
    assert.equal(run.stderr.includes("Cloning into"), false);
  },
);

// Liczone RAZ, przy wczytaniu pliku, bo `skip` rozstrzyga się w chwili
// definicji testu. Krótkie spięcie na `posixOnly` jest konieczne: bez niego ta
// linia wołałaby POSIX-ową ścieżkę absolutną na Windowsie.
const shellcheck = posixOnly
  ? { status: 1, stdout: "" }
  : spawnSync("/usr/bin/which", ["shellcheck"], { encoding: "utf8" });

test(
  "shellcheck, when the host has it, has nothing to say",
  {
    skip:
      posixOnly ||
      (shellcheck.status !== 0 && "this host has no shellcheck installed"),
  },
  () => {
    const linted = spawnSync(shellcheck.stdout.trim(), [script], {
      encoding: "utf8",
    });
    assert.equal(linted.status, 0, linted.stdout);
  },
);
