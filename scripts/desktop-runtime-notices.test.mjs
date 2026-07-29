import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectDesktopRuntimeNotices,
  DESKTOP_RUNTIME_ROOTS,
  renderDesktopRuntimeNotices,
} from "./desktop-runtime-notices.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("desktop runtime notices cover bundled roots and preserve license text", () => {
  const packages = collectDesktopRuntimeNotices({ root });
  // Sprawdzaną gwarancją jest POKRYCIE: każdy zadeklarowany korzeń runtime'u ma
  // swój wpis w notatkach. Wcześniej ta lista była przepisana tutaj RAZEM
  // Z WERSJAMI (`react@19.2.7`), więc każde podbicie zapalało ją na czerwono
  // nie mówiąc nic o licencjach, a nowy korzeń dodany po tamtej stronie
  // przechodził niezauważony — czyli myliła się w obie strony naraz.
  // Teraz zbiór wymagany jest CZYTANY ze źródła prawdy.
  const names = new Set(
    packages.map((entry) => entry.key.slice(0, entry.key.lastIndexOf("@"))),
  );
  assert.ok(
    DESKTOP_RUNTIME_ROOTS.length > 5,
    `expected the declared runtime roots to be non-trivial, got ${DESKTOP_RUNTIME_ROOTS.length}`,
  );
  for (const required of DESKTOP_RUNTIME_ROOTS) {
    assert.equal(names.has(required), true, required);
  }
  // Wersja jest częścią klucza i musi tam być — bez niej notatka nie mówi,
  // czyją licencję cytuje. Sprawdzamy KSZTAŁT, nie konkretny numer.
  for (const entry of packages) {
    assert.match(
      entry.key,
      /^@?[^@]+@\d+\.\d+\.\d+/u,
      `every notice must name a version: ${entry.key}`,
    );
  }
  const rendered = renderDesktopRuntimeNotices(packages);
  assert.match(rendered, /Permission is hereby granted/u);
  assert.match(rendered, /lazy-val \d+\.\d+\.\d+ — MIT/u);
  assert.doesNotMatch(rendered, /\/Users\//u);
});

test("desktop runtime notice collection fails closed without a license file", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-notices-"));
  try {
    fs.writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({ name: "fixture", private: true }),
    );
    const dependency = path.join(fixture, "node_modules", "missing-license");
    fs.mkdirSync(dependency, { recursive: true });
    fs.writeFileSync(
      path.join(dependency, "package.json"),
      JSON.stringify({
        name: "missing-license",
        version: "1.0.0",
        license: "MIT",
      }),
    );
    fs.writeFileSync(path.join(dependency, "index.js"), "export {};\n");
    assert.throws(
      () =>
        collectDesktopRuntimeNotices({
          root: fixture,
          packageRoots: ["missing-license"],
        }),
      /DESKTOP_NOTICE_LICENSE_MISSING:missing-license@1\.0\.0/u,
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("desktop runtime notices reject terminal control characters", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-notices-"));
  try {
    fs.writeFileSync(
      path.join(fixture, "package.json"),
      JSON.stringify({ name: "fixture", private: true }),
    );
    const dependency = path.join(fixture, "node_modules", "unsafe-license");
    fs.mkdirSync(dependency, { recursive: true });
    fs.writeFileSync(
      path.join(dependency, "package.json"),
      JSON.stringify({
        name: "unsafe-license",
        version: "1.0.0",
        license: "MIT",
        main: "index.js",
      }),
    );
    fs.writeFileSync(path.join(dependency, "index.js"), "export {};\n");
    fs.writeFileSync(path.join(dependency, "LICENSE"), "MIT\u001b[2J\n");
    assert.throws(
      () =>
        collectDesktopRuntimeNotices({
          root: fixture,
          packageRoots: ["unsafe-license"],
        }),
      /DESKTOP_NOTICE_LICENSE_CONTROL_CHAR:unsafe-license@1\.0\.0/u,
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
