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

/** Katalog `PATH`, w którym widać wyłącznie wymienione narzędzia. */
const stubPath = (tools) => {
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
  return directory;
};

const runWithOnly = (tools) => {
  const directory = stubPath(tools);
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

test("the script parses", () => {
  const parsed = spawnSync("/bin/bash", ["-n", script], { encoding: "utf8" });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test("a host without any SHA-256 tool is told so before anything is cloned", () => {
  const run = runWithOnly(["git", "make"]);
  // Kod 2 jest kodem sondy. Kod 127 znaczyłby, że skrypt przeszedł do
  // `mktemp` — czyli że sonda przestała stać przed pracą.
  assert.equal(run.status, 2, `stderr: ${run.stderr}`);
  assert.match(run.stderr, /missing a SHA-256 tool \(sha256sum or shasum\)/u);
  assert.equal(run.stderr.includes("Cloning into"), false);
});

test("a host without OpenSSL headers is told exactly what to install", () => {
  // Bez `pkg-config` i bez `brew`, a `/usr/include/openssl/evp.h` na macOS-ie
  // nie istnieje — czyli dokładnie ten stan, w którym stare `LDFLAGS=-lcrypto`
  // oddawało błąd linkera z wnętrza `configure`.
  if (fs.existsSync("/usr/include/openssl/evp.h")) return;
  const run = runWithOnly(["git", "make", "shasum"]);
  assert.equal(run.status, 2, `stderr: ${run.stderr}`);
  assert.match(
    run.stderr,
    /missing the OpenSSL development headers and library/u,
  );
  assert.match(run.stderr, /brew install openssl@3 pkg-config/u);
  assert.match(run.stderr, /apt-get install libssl-dev pkg-config/u);
  assert.equal(run.stderr.includes("Cloning into"), false);
});

test("shellcheck, when the host has it, has nothing to say", () => {
  const available = spawnSync("/usr/bin/which", ["shellcheck"], {
    encoding: "utf8",
  });
  if (available.status !== 0) return;
  const linted = spawnSync(available.stdout.trim(), [script], {
    encoding: "utf8",
  });
  assert.equal(linted.status, 0, linted.stdout);
});
