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
  // test:scripts in package.json always runs after `npm run build`, so this
  // artifact is expected to already exist by the time this test runs.
  assert.equal(fs.existsSync(built), true, "run npm run build first");
  assert.equal(PRODUCTION_DESKTOP_FILES.has("dev-main.js"), false);
});

test("packaging reads the allowlist from this module", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts", "package-alpha.mjs"),
    "utf8",
  );
  assert.match(source, /production-desktop-files\.mjs/u);

  // Importing the module is not enough on its own — assert the identifier
  // is genuinely used at both places that consume the allowlist, anchored on
  // the identifier itself rather than on the import line or the filename.
  assert.match(
    source,
    /if \(!PRODUCTION_DESKTOP_FILES\.has\(entry\)\)/u,
    "the prune loop over the staged desktop-main directory must consult PRODUCTION_DESKTOP_FILES directly",
  );
  assert.match(
    source,
    /for \(const entry of PRODUCTION_DESKTOP_FILES\)/u,
    "the import-existence-check loop must iterate PRODUCTION_DESKTOP_FILES directly",
  );

  // Guard against the old inline literal reappearing under a different
  // local name. Anchored on its first entry rather than on
  // `productionDesktopFiles` so a rename doesn't dodge it, and anchored on
  // that specific content (not on `new Set(` generally) so it doesn't trip
  // over the file's other, unrelated sets such as expectedRuntimePackages.
  assert.doesNotMatch(source, /const productionDesktopFiles = new Set\(/u);
  assert.doesNotMatch(source, /new Set\(\s*\[\s*"attention-notification\.js"/u);

  // Residual hole, left honest rather than papered over: these checks are
  // textual. A local set assembled by spreading PRODUCTION_DESKTOP_FILES
  // into a new Set and then driving both loops from that copy would satisfy
  // every assertion above while still not being "the same set" in any
  // enforced sense. Closing that would need a behavioral test that actually
  // runs the pruning logic, which this file deliberately does not do.
});
