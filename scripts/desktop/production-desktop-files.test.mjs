import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { PRODUCTION_DESKTOP_FILES } from "./production-desktop-files.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");

test("the packaged main is the production entry", () => {
  assert.equal(PRODUCTION_DESKTOP_FILES.has("production-main.js"), true);
});

test("development-only entries never reach a package", () => {
  for (const excluded of ["dev-main.js", "main.js", "preview-service.js"]) {
    assert.equal(PRODUCTION_DESKTOP_FILES.has(excluded), false, excluded);
  }
});

test("the development entry is built but pruned from the package", () => {
  const built = path.join(
    root,
    "packages",
    "desktop-main",
    "dist",
    "src",
    "dev-main.js",
  );
  assert.equal(fs.existsSync(built), true, "run npm run build first");
  assert.equal(PRODUCTION_DESKTOP_FILES.has("dev-main.js"), false);
});

test("packaging reads the allowlist from this module", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts", "package-alpha.mjs"),
    "utf8",
  );
  assert.match(source, /production-desktop-files\.mjs/u);
  assert.doesNotMatch(source, /const productionDesktopFiles = new Set\(/u);
});
