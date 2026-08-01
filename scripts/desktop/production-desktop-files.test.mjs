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

test("every module the allowlist keeps can still find what it imports", () => {
  // The SAME closure check `package-alpha.mjs` runs while staging, hoisted to
  // where it costs seconds instead of an eight-minute packaging job.
  //
  // It was written because that is exactly how it was met: a new
  // `production-main.js` import of a new sibling module passed format, lint,
  // typecheck, 806 node tests, 268 interaction tests and the bundle gate, and
  // then failed packaging on all three platforms with
  // `PRODUCTION_DESKTOP_IMPORT_MISSING`. The list here is hand-maintained
  // beside code that moves — the defect family Wave D is closing — so the
  // cheapest honest fix is to make its failure arrive early.
  const built = path.join(root, "packages", "desktop-main", "dist", "src");
  assert.equal(
    fs.existsSync(built),
    true,
    "run npm run build first — this test measures the built output",
  );
  let checked = 0;
  for (const entry of PRODUCTION_DESKTOP_FILES) {
    const sourcePath = path.join(built, entry);
    // A name in the allowlist that no longer exists is its own defect: the
    // pruning loop would keep nothing, and every import assertion below would
    // pass over a file that is not there.
    assert.equal(
      fs.existsSync(sourcePath),
      true,
      `${entry} is on the packaged allowlist and is not in the build.`,
    );
    const source = fs.readFileSync(sourcePath, "utf8");
    for (const [, specifier] of source.matchAll(
      /(?:from\s+|import\()\s*["'](\.[^"']+\.js)["']/g,
    )) {
      checked += 1;
      assert.equal(
        PRODUCTION_DESKTOP_FILES.has(path.basename(specifier)),
        true,
        `${entry} imports ${specifier}, which packaging prunes — add it to PRODUCTION_DESKTOP_FILES.`,
      );
    }
  }
  // An empty measurement is an instrument failure, not a result: if the regex
  // ever stopped matching, this test would report success having compared
  // nothing at all.
  assert.ok(
    checked > 20,
    `Only ${checked} relative imports were found across the packaged set — this test is no longer reading them.`,
  );
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
