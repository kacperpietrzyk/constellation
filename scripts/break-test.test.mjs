// ASERCJA O PRZYRZĄDZIE MUSI SAMA DAĆ SIĘ ZŁAMAĆ.
//
// Ten plik nie sprawdza, czy break-testy przechodzą. Sprawdza, czy HARNESS
// break-testów potrafi odróżnić przebudowę, która się odbyła, od przebudowy,
// która była no-opem — bo to jest jedyna rzecz, dla której on istnieje.
//
// Najważniejszy test niżej ODTWARZA DEFEKT: buduje prawdziwy projekt
// TypeScriptu w katalogu tymczasowym, przywraca plik przez `rename` (czyli
// `mv`), pokazuje asercję wracającą ZIELONO przy `dist/` niosącym kod
// ZEPSUTY — a potem pokazuje tę samą sekwencję przez harness, gdzie ten stan
// jest nieosiągalny. Bez tej pary reszta pliku byłaby opowieścią o defekcie,
// a nie dowodem, że został zamknięty.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdirSync,
  readdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildStampFiles,
  classifyBreakOutcome,
  readBuildStamps,
  rebuildHappened,
  runBreakTests,
} from "./break-test.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tscEntry = path.join(
  path.dirname(createRequire(import.meta.url).resolve("typescript")),
  "tsc.js",
);

const SOURCE_ORIGINAL = 'export const greeting = (): string => "ORIGINAL";\n';
const SOURCE_BROKEN = 'export const greeting = (): string => "BROKEN";\n';

/**
 * Najmniejszy projekt, na którym `tsc -b` zachowuje się jak w tym repozytorium:
 * `composite`, `incremental`, własny `tsBuildInfoFile` w `dist/`.
 *
 * Asercja jest skryptem czytającym ZBUDOWANY `dist/`, a nie źródło — dokładnie
 * tak, jak `@constellation/contracts` rozwiązuje się do `dist/`. To jest cały
 * mechanizm defektu w miniaturze.
 */
const scaffold = () => {
  const root = mkdtempSync(path.join(tmpdir(), "constellation-break-test-"));
  const project = path.join(root, "packages", "probe");
  mkdirSync(path.join(project, "src"), { recursive: true });
  writeFileSync(
    path.join(project, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          composite: true,
          incremental: true,
          tsBuildInfoFile: "dist/.tsbuildinfo",
          outDir: "dist",
          rootDir: "src",
          module: "nodenext",
          moduleResolution: "nodenext",
          target: "es2023",
          strict: true,
          declaration: true,
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );
  const source = path.join(project, "src", "index.ts");
  writeFileSync(source, SOURCE_ORIGINAL);
  writeFileSync(
    path.join(root, "assert-original.mjs"),
    'import { greeting } from "./packages/probe/dist/index.js";\n' +
      'if (greeting() !== "ORIGINAL") { console.error(`dist says ${greeting()}`); process.exit(1); }\n',
  );
  writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: "probe", type: "module" }, null, 2),
  );
  // Skrypt, który NIE przechodzi przez kompilator — jak `scripts/*.mjs` w tym
  // repozytorium. Nie ma `dist/`, więc nie ma czego zatruć.
  const uncompiled = path.join(root, "tool.mjs");
  writeFileSync(uncompiled, 'export const label = "ORIGINAL";\n');
  writeFileSync(
    path.join(root, "assert-tool.mjs"),
    'import { label } from "./tool.mjs";\n' +
      'if (label !== "ORIGINAL") process.exit(1);\n',
  );
  return {
    root,
    source,
    uncompiled,
    verifyUncompiled: {
      command: process.execPath,
      args: ["assert-tool.mjs"],
    },
    stamp: path.join(project, "dist", ".tsbuildinfo"),
    build: {
      command: process.execPath,
      args: [tscEntry, "-b", "packages/probe"],
    },
    verify: { command: process.execPath, args: ["assert-original.mjs"] },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
};

const runIn = (root, { command, args }) =>
  spawnSync(command, args, { cwd: root, encoding: "utf8" });

test("every stamp path is the one its own tsconfig declares, read a second way", () => {
  // NIE TĄ SAMĄ METODĄ. `buildStampFiles` czyta regexpem, bo `tsconfig.json`
  // wolno nieść komentarze; tutaj to samo jest czytane `JSON.parse`. Test
  // powtarzający implementację pomyliłby się dokładnie tam, gdzie ona —
  // w szczególności zahardkodowane `dist/.tsbuildinfo` przeszłoby przez
  // porównanie liczb, a `desktop-ui` trzyma stempel w `build/ts/`.
  const packagesRoot = path.join(repoRoot, "packages");
  const declared = readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const config = path.join(packagesRoot, entry.name, "tsconfig.json");
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(config, "utf8"));
      } catch {
        return [];
      }
      const value = parsed.compilerOptions?.tsBuildInfoFile;
      return typeof value === "string"
        ? [path.join(packagesRoot, entry.name, value)]
        : [];
    })
    .sort();
  assert.deepEqual(buildStampFiles(repoRoot), declared);
  assert.ok(declared.length > 0);
});

test("a build that changes no stamp is not a rebuild", () => {
  const before = new Map([["a", { mtimeMs: 10, size: 5 }]]);
  assert.equal(rebuildHappened(before, before).proven, false);
  assert.equal(
    rebuildHappened(before, new Map([["a", { mtimeMs: 11, size: 5 }]])).proven,
    true,
  );
  // Ten sam mtime przy innym rozmiarze też jest przebudową — system plików
  // o grubszym zegarze potrafi trafić w tę samą chwilę.
  assert.equal(
    rebuildHappened(before, new Map([["a", { mtimeMs: 10, size: 6 }]])).proven,
    true,
  );
  // I mtime WCZEŚNIEJSZY też. Stempel z przyszłości po przebudowie cofa się do
  // zegara maszyny; warunek „nowszy" czytał to jako brak przebudowy.
  assert.equal(
    rebuildHappened(before, new Map([["a", { mtimeMs: 9, size: 5 }]])).proven,
    true,
  );
});

test("a break that only the compiler catches is a red for the wrong reason", () => {
  assert.equal(
    classifyBreakOutcome({
      expect: "assertion-fails",
      buildOk: false,
      verifyOk: false,
    }).verdict,
    "aborted",
  );
  assert.equal(
    classifyBreakOutcome({
      expect: "assertion-fails",
      buildOk: true,
      verifyOk: true,
    }).verdict,
    "failed",
  );
  assert.equal(
    classifyBreakOutcome({
      expect: "assertion-fails",
      buildOk: true,
      verifyOk: false,
    }).verdict,
    "passed",
  );
  // Odwrotnie, kiedy dowodem jest ODMOWA kompilatora: udana budowa znaczy, że
  // typ przepuścił to, co miał odrzucić.
  assert.equal(
    classifyBreakOutcome({ expect: "build-refuses", buildOk: true }).verdict,
    "failed",
  );
  assert.equal(
    classifyBreakOutcome({ expect: "build-refuses", buildOk: false }).verdict,
    "passed",
  );
});

test("REPRODUCTION: a `mv`-restored break-test comes back green against poisoned dist", () => {
  const probe = scaffold();
  try {
    assert.equal(runIn(probe.root, probe.build).status, 0);
    assert.equal(
      runIn(probe.root, probe.verify).status,
      0,
      "baseline is green",
    );

    // Dokładnie ta pętla, którą fala D miała napisaną ręcznie w każdym locie.
    const backup = `${probe.source}.bak`;
    writeFileSync(backup, readFileSync(probe.source, "utf8"));
    writeFileSync(probe.source, SOURCE_BROKEN);
    assert.equal(runIn(probe.root, probe.build).status, 0);
    assert.equal(
      runIn(probe.root, probe.verify).status,
      1,
      "the break is red, which is all the two-number protocol ever checks",
    );

    // `mv` zachowuje mtime kopii. Warunek konstruujemy JAWNIE, zamiast liczyć
    // na to, że zegar akurat go da: kopia dostaje mtime starszy niż stempel
    // zapisany przy budowie złamania. Tak samo wygląda `cp` sprzed złamania.
    const stampBefore = statSync(probe.stamp).mtimeMs;
    const older = stampBefore / 1000 - 60;
    utimesSync(backup, older, older);
    renameSync(backup, probe.source);

    assert.equal(
      readFileSync(probe.source, "utf8"),
      SOURCE_ORIGINAL,
      "the source is restored — this is what makes the state invisible",
    );
    assert.equal(runIn(probe.root, probe.build).status, 0, "`tsc -b` is happy");
    assert.equal(
      statSync(probe.stamp).mtimeMs,
      stampBefore,
      "and it did NOTHING: the stamp did not move",
    );
    assert.match(
      readFileSync(
        path.join(probe.root, "packages/probe/dist/index.js"),
        "utf8",
      ),
      /BROKEN/u,
      "dist still carries the code the previous break-test wrote",
    );
    assert.equal(
      runIn(probe.root, probe.verify).status,
      1,
      "POISONED: the source is correct and the assertion is red against dist",
    );
  } finally {
    probe.dispose();
  }
});

test("the harness restores by rewriting, so the poisoned state is unreachable", () => {
  const probe = scaffold();
  const lines = [];
  try {
    const outcome = runBreakTests({
      root: probe.root,
      build: probe.build,
      verify: probe.verify,
      stampFiles: [probe.stamp],
      log: (line) => lines.push(line),
      breaks: [
        {
          name: "greeting stops saying ORIGINAL",
          file: probe.source,
          edit: () => SOURCE_BROKEN,
        },
        // Drugie złamanie po pierwszym jest tym, co w fali D chodziło już na
        // zatrutym `dist`. Zielona baza przed nim jest asercją, nie ozdobą.
        {
          name: "greeting says it twice",
          file: probe.source,
          edit: (text) => text.replace("ORIGINAL", "ORIGINAL ORIGINAL"),
        },
      ],
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.results.length, 2);
    const reported = lines.filter((line) => line.includes("→"));
    assert.equal(reported.length, 2);
    for (const line of reported)
      assert.match(line, /baseline GREEN → break RED → restore GREEN/u);
    assert.equal(readFileSync(probe.source, "utf8"), SOURCE_ORIGINAL);
    assert.match(
      readFileSync(
        path.join(probe.root, "packages/probe/dist/index.js"),
        "utf8",
      ),
      /ORIGINAL/u,
    );
    assert.equal(runIn(probe.root, probe.verify).status, 0);
  } finally {
    probe.dispose();
  }
});

test("a build stamp dated ahead of the clock does not make a fresh write stale", () => {
  const probe = scaffold();
  try {
    assert.equal(runIn(probe.root, probe.build).status, 0);
    // Zwykły zapis nadaje mtime „teraz", a to WYSTARCZA tylko dopóki stempel
    // jest z przeszłości. Stempel z przyszłości — zegar maszyny przestawiony,
    // plik z archiwum, system plików o innym źródle czasu — sprawia, że świeży
    // zapis jest STARSZY niż on, czyli dokładnie ten sam warunek co przy
    // przywróceniu z `mv`. Harness podbija mtime ponad stempel, więc tutaj
    // przechodzi; bez podbicia przebudowa byłaby no-opem i harness by padł.
    const ahead = Date.now() / 1000 + 3_600;
    for (const name of ["index.js", "index.d.ts", ".tsbuildinfo"])
      utimesSync(
        path.join(probe.root, "packages", "probe", "dist", name),
        ahead,
        ahead,
      );
    const outcome = runBreakTests({
      root: probe.root,
      build: probe.build,
      verify: probe.verify,
      stampFiles: [probe.stamp],
      log: () => {},
      breaks: [
        {
          name: "a break written against a stamp from the future",
          file: probe.source,
          edit: () => SOURCE_BROKEN,
        },
      ],
    });
    assert.equal(outcome.ok, true);
    assert.equal(runIn(probe.root, probe.verify).status, 0);
  } finally {
    probe.dispose();
  }
});

test("the harness refuses to proceed when it cannot prove the rebuild happened", () => {
  const probe = scaffold();
  try {
    assert.equal(runIn(probe.root, probe.build).status, 0);
    assert.throws(
      () =>
        runBreakTests({
          root: probe.root,
          // Budowa, która wraca zero i nie buduje niczego — nieodróżnialna od
          // udanej po kodzie wyjścia, odróżnialna po stemplu.
          build: { command: process.execPath, args: ["-e", ""] },
          verify: probe.verify,
          stampFiles: [probe.stamp],
          log: () => {},
          breaks: [
            {
              name: "a break nobody compiled",
              file: probe.source,
              edit: () => SOURCE_BROKEN,
            },
          ],
        }),
      /the build changed no build stamp/u,
    );
    // Nawet padając, harness zostawia źródło przywrócone.
    assert.equal(readFileSync(probe.source, "utf8"), SOURCE_ORIGINAL);
  } finally {
    probe.dispose();
  }
});

test("a file the compiler never sees needs no rebuild proof, and the extension decides", () => {
  const probe = scaffold();
  try {
    // Ten sam brak stempla, który wyżej jest PRZERWANIEM dla pliku `.ts`, tutaj
    // jest poprawny: `tool.mjs` nie ma `dist/`. Gdyby decydowała deklaracja
    // wołającego, byłaby to furtka z powrotem do zatrutego `dist`; decyduje
    // rozszerzenie.
    const outcome = runBreakTests({
      root: probe.root,
      build: probe.build,
      verify: probe.verifyUncompiled,
      stampFiles: [probe.stamp],
      log: () => {},
      breaks: [
        {
          name: "the tool stops saying ORIGINAL",
          file: probe.uncompiled,
          edit: (text) => text.replace("ORIGINAL", "BROKEN"),
        },
      ],
    });
    assert.equal(outcome.ok, true);
    assert.equal(
      readFileSync(probe.uncompiled, "utf8"),
      'export const label = "ORIGINAL";\n',
    );
  } finally {
    probe.dispose();
  }
});

test("a loop that starts from red proves nothing, and the harness says so first", () => {
  const probe = scaffold();
  try {
    // `dist/` nigdy nie zbudowane: asercja jest czerwona ZANIM cokolwiek
    // złamano. Bez tej bramki każde „złamanie" niżej wracałoby czerwone
    // z powodu, który nie ma nic wspólnego z badaną asercją — a to jest
    // dokładnie stan, jaki zostawia po sobie zatruty przebieg.
    assert.throws(
      () =>
        runBreakTests({
          root: probe.root,
          build: { command: process.execPath, args: ["-e", ""] },
          verify: probe.verify,
          stampFiles: [probe.stamp],
          log: () => {},
          breaks: [
            {
              name: "never reached",
              file: probe.source,
              edit: () => SOURCE_BROKEN,
            },
          ],
        }),
      /baseline is not green before the first break/u,
    );
  } finally {
    probe.dispose();
  }
});

test("assertions still red after the restore stop the run instead of the next break", () => {
  const probe = scaffold();
  try {
    // Weryfikacja zielona dwa razy i czerwona za trzecim — czyli dokładnie po
    // przywróceniu. To jest sygnatura zatrutego `dist/`: złamanie wygląda
    // poprawnie, a stan po nim już nie. Bez tej bramki przebieg leciałby
    // dalej i każdy następny break-test byłby czerwony z cudzego powodu.
    const counter = path.join(probe.root, "calls.txt");
    const flaky = path.join(probe.root, "flaky.mjs");
    writeFileSync(
      flaky,
      'import { appendFileSync, readFileSync } from "node:fs";\n' +
        `appendFileSync(${JSON.stringify(counter)}, "x");\n` +
        `if (readFileSync(${JSON.stringify(counter)}, "utf8").length >= 3) process.exit(1);\n`,
    );
    assert.throws(
      () =>
        runBreakTests({
          root: probe.root,
          build: probe.build,
          verify: { command: process.execPath, args: ["flaky.mjs"] },
          stampFiles: [probe.stamp],
          log: () => {},
          breaks: [
            {
              name: "the break itself is fine",
              file: probe.source,
              edit: () => SOURCE_BROKEN,
            },
          ],
        }),
      /assertions are RED after the restore/u,
    );
    assert.equal(readFileSync(probe.source, "utf8"), SOURCE_ORIGINAL);
  } finally {
    probe.dispose();
  }
});

test("a verify that writes to the source under test is caught, not carried forward", () => {
  const probe = scaffold();
  try {
    // Realny kształt: weryfikacja uruchamiająca formater albo generator, który
    // przepisuje plik. Następne złamanie startowałoby wtedy z innego tekstu,
    // niż sądzi — a `edit` dostający nieoczekiwany tekst to jedna z trzech
    // przyczyn, dla których break-testy fali D wracały zielone.
    const meddling = path.join(probe.root, "meddle.mjs");
    writeFileSync(
      meddling,
      'import { appendFileSync, readFileSync } from "node:fs";\n' +
        `const source = ${JSON.stringify(probe.source)};\n` +
        'if (readFileSync(source, "utf8").includes("ORIGINAL"))\n' +
        '  appendFileSync(source, "// tidied by the verify step\\n");\n' +
        'import("./packages/probe/dist/index.js").then(({ greeting }) => {\n' +
        '  if (greeting() !== "ORIGINAL") process.exit(1);\n' +
        "});\n",
    );
    assert.throws(
      () =>
        runBreakTests({
          root: probe.root,
          build: probe.build,
          verify: { command: process.execPath, args: ["meddle.mjs"] },
          stampFiles: [probe.stamp],
          log: () => {},
          breaks: [
            {
              name: "a break beside a verify that tidies",
              file: probe.source,
              edit: () => SOURCE_BROKEN,
            },
          ],
        }),
      /does not match the text it started with/u,
    );
  } finally {
    probe.dispose();
  }
});

test("an edit that changes nothing is an abort, not a green break-test", () => {
  const probe = scaffold();
  try {
    assert.throws(
      () =>
        runBreakTests({
          root: probe.root,
          build: probe.build,
          verify: probe.verify,
          stampFiles: [probe.stamp],
          log: () => {},
          breaks: [
            {
              name: "a regex that matched nothing",
              file: probe.source,
              edit: (text) => text.replace("NOT PRESENT", "x"),
            },
          ],
        }),
      /identical to the original/u,
    );
  } finally {
    probe.dispose();
  }
});

test("a break the compiler refuses is only proof when that was the claim", () => {
  const probe = scaffold();
  try {
    // Zadeklarowane jako „asercja ma paść", a nie kompiluje się: czerwień
    // przychodzi od kompilatora, więc o asercji nie mówi nic.
    assert.throws(
      () =>
        runBreakTests({
          root: probe.root,
          build: probe.build,
          verify: probe.verify,
          stampFiles: [probe.stamp],
          log: () => {},
          breaks: [
            {
              name: "a type error dressed as a behaviour break",
              file: probe.source,
              edit: () => "export const greeting = (): string => 42;\n",
            },
          ],
        }),
      /any red comes from the compiler/u,
    );

    const declared = runBreakTests({
      root: probe.root,
      build: probe.build,
      verify: probe.verify,
      stampFiles: [probe.stamp],
      log: () => {},
      breaks: [
        {
          name: "the type refuses it, and that is the proof",
          file: probe.source,
          edit: () => "export const greeting = (): string => 42;\n",
          expect: "build-refuses",
        },
      ],
    });
    assert.equal(declared.ok, true);
    assert.equal(readFileSync(probe.source, "utf8"), SOURCE_ORIGINAL);
    assert.equal(
      runIn(probe.root, probe.verify).status,
      0,
      "and dist recovered from a build that emitted broken JS on the way",
    );
  } finally {
    probe.dispose();
  }
});

test("a build stamp state can be read for files that do not exist yet", () => {
  const stamps = readBuildStamps([
    path.join(repoRoot, "packages", "nothing-here"),
  ]);
  assert.equal(stamps.size, 1);
  assert.equal([...stamps.values()][0], null);
});
