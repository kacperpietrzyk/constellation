/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "SettingsSurface.tsx"))) {
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error("Could not locate the desktop-ui package root.");
    directory = parent;
  }
  return directory;
};

const root = findPackageRoot();
const settings = readFileSync(
  path.join(root, "src", "SettingsSurface.tsx"),
  "utf8",
);
const styles = readFileSync(path.join(root, "src", "styles.css"), "utf8");

describe("enterprise settings navigation contract", () => {
  it("groups the settings surface into five stable, status-bearing categories", () => {
    for (const [id, label] of [
      ["workspace", "Workspace"],
      ["data", "Dane i prywatność"],
      ["appearance", "Wygląd"],
      ["access", "Dostęp i połączenia"],
      ["application", "Start i aplikacja"],
    ]) {
      assert.match(settings, new RegExp(`id: "${id}", label: "${label}"`));
      assert.match(settings, new RegExp(`data-settings-category="${id}"`));
    }
    assert.match(
      settings,
      /categoryStatus: Record<SettingsCategoryId, string>/,
    );
    assert.match(settings, /aria-current=.*"location"/s);
  });

  it("keeps every category available through a native narrow-width control", () => {
    assert.match(settings, /<select\s+id="settings-category-select"/s);
    assert.match(settings, /settingsCategories\.map\(\(category\) =>/);
    assert.match(
      styles,
      /@container \(max-width: 58rem\)[^{]*\{[\s\S]*?\.settings-category-picker\s*\{[\s\S]*?display: grid/s,
    );
    assert.match(styles, /\.settings-navigator\s*\{[\s\S]*?position: sticky/s);
  });

  it("offers one global and three contextual routes into the concept help", () => {
    assert.match(settings, /Wyjaśnij pojęcia danych i dostępu/);
    assert.match(settings, /Wyjaśnij Data Home, Hub i MCP/);
    assert.match(settings, /Wyjaśnij odzyskiwanie/);
    assert.match(settings, /Wyjaśnij dostęp agenta/);
    assert.equal(settings.match(/aria-haspopup="dialog"/g)?.length, 4);
    assert.match(settings, /initialTopic=\{conceptHelpTopic\}/);
  });
});
