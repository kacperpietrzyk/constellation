import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compose = fs.readFileSync(
  path.join(root, "deploy", "hub", "compose.yml"),
  "utf8",
);

test("the shipped Hub compose initializes attachment volume ownership before Hub commands", () => {
  assert.match(compose, /^  attachments-init:\n/mu);
  assert.match(compose, /chown -R 1000:1000 \/data/u);
  assert.match(compose, /- attachment-data:\/data/u);
  assert.match(
    compose,
    /attachments-init:\s*\{ condition: service_completed_successfully \}/u,
  );
});
