/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "styles.css"))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Could not locate the desktop-ui package root.");
    }
    directory = parent;
  }
  return directory;
};

const root = findPackageRoot();
const sources = ["src/tokens.css", "src/styles.css"].map((relative) =>
  readFileSync(path.join(root, relative), "utf8"),
);

const definitions = new Set<string>();
const references = new Set<string>();
for (const css of sources) {
  for (const match of css.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) {
    definitions.add(match[1] ?? "");
  }
  for (const match of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    references.add(match[1] ?? "");
  }
}

describe("css token lint", () => {
  it("every var(--…) reference resolves to a defined custom property", () => {
    const undefinedTokens = [...references]
      .filter((token) => !definitions.has(token))
      .sort();
    assert.deepEqual(
      undefinedTokens,
      [],
      `Undefined design tokens referenced in CSS: ${undefinedTokens.join(", ")}. ` +
        "An undefined var(--…) silently resolves to transparent/inherit and " +
        "unstyles real UI. Define the token in tokens.css or fix the name.",
    );
  });

  it("keeps a sane baseline of definitions", () => {
    assert.ok(
      definitions.size > 100,
      "Token definitions were not parsed; the lint would pass vacuously.",
    );
  });
});
