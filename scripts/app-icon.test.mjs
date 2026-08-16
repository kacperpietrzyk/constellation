import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("application icon has a reproducible branded vector source", () => {
  const source = fs.readFileSync(
    path.join(root, "assets", "app-icon.svg"),
    "utf8",
  );
  assert.match(source, /viewBox="0 0 1024 1024"/u);
  assert.match(source, /#AE8BFF/iu);
  assert.match(source, /#7F4BDC/iu);
  assert.match(source, /id="constellation-mark"/u);
  assert.equal((source.match(/data-node=/gu) ?? []).length, 6);

  for (const relative of [
    "assets/app-icon.png",
    "assets/app-icon.icns",
    "assets/app-icon.ico",
  ]) {
    assert.ok(fs.statSync(path.join(root, relative)).size > 10_000, relative);
  }
});
