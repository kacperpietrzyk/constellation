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
const tokenSource = readFileSync(path.join(root, "src", "tokens.css"), "utf8");
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

  it("uses the dynamic viewport for height-bound desktop surfaces", () => {
    const legacyViewportReferences = sources.flatMap((css, sourceIndex) =>
      [...css.matchAll(/100vh/g)].map((match) => ({
        source: sourceIndex === 0 ? "tokens.css" : "styles.css",
        offset: match.index,
      })),
    );
    assert.deepEqual(
      legacyViewportReferences,
      [],
      "Height-bound overlays and editors must use 100dvh so changing browser " +
        "chrome cannot hide their footer or final action.",
    );
  });

  it("keeps light-theme semantic status text on the AA contrast mapping", () => {
    const lightTheme = tokenSource.match(
      /\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    assert.ok(lightTheme, "The light-theme token mapping must remain present.");

    const contrastSafeStatuses = [
      ["success", "0.1", "150"],
      ["warning", "0.1", "78"],
      ["error", "0.14", "25"],
      ["info", "0.075", "245"],
    ] as const;

    for (const [status, chroma, hue] of contrastSafeStatuses) {
      assert.match(
        lightTheme,
        new RegExp(
          `--status-${status}:\\s*oklch\\(52%\\s+${chroma}\\s+${hue}\\)`,
        ),
        `Light ${status} text must retain the measured 52% OKLCH mapping.`,
      );
    }
  });
});
