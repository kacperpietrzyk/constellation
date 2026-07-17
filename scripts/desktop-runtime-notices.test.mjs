import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectDesktopRuntimeNotices,
  renderDesktopRuntimeNotices,
} from "./desktop-runtime-notices.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("desktop runtime notices cover bundled roots and preserve license text", () => {
  const packages = collectDesktopRuntimeNotices({ root });
  const keys = new Set(packages.map((entry) => entry.key));
  for (const required of [
    "@hocuspocus/provider@4.4.0",
    "@modelcontextprotocol/sdk@1.29.0",
    "better-sqlite3@12.11.1",
    "electron-updater@6.8.9",
    "lazy-val@1.0.5",
    "react@19.2.7",
    "yjs@13.6.31",
    "zod@4.4.3",
  ]) {
    assert.equal(keys.has(required), true, required);
  }
  const rendered = renderDesktopRuntimeNotices(packages);
  assert.match(rendered, /Permission is hereby granted/u);
  assert.match(rendered, /lazy-val 1\.0\.5 — MIT/u);
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
