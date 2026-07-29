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

const countOccurrences = (haystack: string, needle: RegExp): number =>
  haystack.match(needle)?.length ?? 0;

import { settingsCategories } from "../src/settings-categories.js";

const settingsCategoryIds = [
  "workspace",
  "data",
  "appearance",
  "access",
  "application",
] as const;

describe("enterprise settings navigation contract", () => {
  it("groups the settings surface into five stable, status-bearing categories", () => {
    // The category *ids* are the stable contract: they name the sections, the
    // scroll anchors and the status record. The *labels* are interface copy —
    // the Polish-to-English flip changed every one of them without changing a
    // single guarantee, so we assert the shape of the labels — present, and
    // one per category — never which words they use.
    // Lista sekcji przeniosła się do `settings-categories.ts`, bo w trybie
    // Ustawień rysuje ją TAKŻE lewa kolumna powłoki, a ekran jest leniwy
    // i nie wolno go wciągnąć na ścieżkę gorącą. Czytamy ją więc ze ŹRÓDŁA
    // PRAWDY, nie wycinając literału z pliku ekranu — poprzednia wersja pękła
    // przy samym przeniesieniu, nie mówiąc nic o żadnej gwarancji.
    const declared = settingsCategories.map((category) => ({
      id: category.id as string,
      label: category.label as string,
    }));
    assert.ok(declared.length > 0, "settingsCategories is empty");

    // The five ids, in the order the navigator walks them.
    assert.deepEqual(
      declared.map((category) => category.id),
      [...settingsCategoryIds],
    );
    for (const id of settingsCategoryIds)
      assert.match(settings, new RegExp(`data-settings-category="${id}"`));
    // Every category carries a label a human can read, and no two categories
    // read the same. Which words they use is copy and deliberately unpinned —
    // five entries all labelled "Workspace" is not copy, it is a navigator
    // nobody can steer, so distinctness is asserted structurally.
    for (const category of declared)
      assert.ok(
        category.label.trim().length > 0,
        `category ${category.id} carries no label`,
      );
    assert.equal(new Set(declared.map((category) => category.label)).size, 5);
    // Exactly five: an extra entry, or a section anchored outside the list,
    // would break the navigator/status/scroll-spy correspondence.
    assert.equal(declared.length, 5);
    assert.equal(countOccurrences(settings, /data-settings-category="/g), 5);

    // Status-bearing: every category id maps to a status string, and the
    // navigator actually renders that string beside the category.
    assert.match(
      settings,
      /categoryStatus: Record<SettingsCategoryId, string>/,
    );
    assert.match(
      settings,
      /<small>\{categoryStatus\[category\.id\]\}<\/small>/,
    );

    // The navigator marks the category you are looking at as the current
    // location. Anchored to the expression itself: an unrelated aria-current
    // elsewhere in the file must not satisfy this.
    assert.match(
      settings,
      /aria-current=\{\s*activeCategory === category\.id \? "location" : undefined,?\s*\}/,
    );
  });

  it("keeps every category available through a native narrow-width control", () => {
    assert.match(settings, /<select\s+id="settings-category-select"/s);
    assert.match(settings, /settingsCategories\.map\(\(category\) =>/);
    // Narrow width: the sticky sidebar disappears and the native select takes
    // over, so no category becomes unreachable. Both rules must live inside
    // the same container query — hence the [^@] bound between them.
    assert.match(
      styles,
      /@container \(max-width: 58rem\)[^@]*?\.settings-navigator\s*\{[^}]*display: none/s,
    );
    assert.match(
      styles,
      /@container \(max-width: 58rem\)[^@]*?\.settings-category-picker\s*\{[^}]*display: grid/s,
    );
    assert.match(styles, /\.settings-navigator\s*\{[^}]*position: sticky/s);
  });

  it("offers one global and three contextual routes into the concept help", () => {
    // One global entry point in the header, three contextual ones next to the
    // sections they explain. The two class names are what distinguishes them,
    // so they carry the "one global / three contextual" shape structurally.
    assert.equal(
      countOccurrences(settings, /className="settings-help-entry"/g),
      1,
    );
    assert.equal(
      countOccurrences(settings, /className="settings-context-help"/g),
      3,
    );
    // All four announce themselves as opening a dialog...
    assert.equal(countOccurrences(settings, /aria-haspopup="dialog"/g), 4);
    // ...and all four are wired to a concept-help topic rather than being
    // decorative. Topic ids are typed values (ConceptHelpTopicId), not copy.
    assert.equal(countOccurrences(settings, /setConceptHelpTopic\("/g), 4);
    const topics = new Set(
      [...settings.matchAll(/setConceptHelpTopic\("([a-z-]+)"\)/g)].map(
        (match) => match[1],
      ),
    );
    assert.deepEqual([...topics].sort(), [
      "agent-access",
      "data-home",
      "recovery",
    ]);
    // The chosen topic is what the dialog opens on.
    assert.match(settings, /initialTopic=\{conceptHelpTopic\}/);
  });
});
