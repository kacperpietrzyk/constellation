import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isDesktopShellCommand } from "@constellation/desktop-preload/client";

import {
  modifierLabel,
  shellShortcutGroups,
  surfaceShortcutHint,
} from "../src/components/ShortcutsOverlay.js";

describe("desktop shell shortcut contract", () => {
  it("accepts every native-menu shell command and rejects malformed input", () => {
    for (const kind of [
      "close-tab",
      "open-capture",
      "open-search",
      "open-shortcuts",
    ]) {
      assert.equal(isDesktopShellCommand({ kind }), true);
    }
    assert.equal(
      isDesktopShellCommand({ kind: "navigate-shortcut", digit: 9 }),
      true,
    );
    assert.equal(
      isDesktopShellCommand({ kind: "navigate-shortcut", digit: 0 }),
      false,
    );
    assert.equal(isDesktopShellCommand({ kind: "open-chat" }), false);
  });

  it("derives visible destination hints from the same surface contract", () => {
    const groups = shellShortcutGroups([
      { label: "Tydzień", shortcut: "1" },
      { label: "Spotkania", shortcut: "2" },
      { label: "Ustawienia" },
    ]);
    const directViews = groups.find(
      (group) => group.title === "Widoki bezpośrednie",
    );
    const paletteViews = groups.find(
      (group) => group.title === "Widoki przez paletę",
    );

    assert.deepEqual(
      directViews?.entries.map((entry) => entry.label),
      ["Tydzień", "Spotkania"],
    );
    assert.deepEqual(
      paletteViews?.entries.map((entry) => entry.label),
      ["Ustawienia"],
    );
    assert.deepEqual(paletteViews?.entries[0]?.keys, [`${modifierLabel}K`]);
    assert.equal(
      [...(directViews?.entries ?? []), ...(paletteViews?.entries ?? [])]
        .length,
      3,
    );
    assert.equal(
      groups
        .flatMap((group) => group.entries)
        .some((entry) => entry.label === "Quick Capture"),
      true,
    );
  });

  it("labels direct and command-palette destination routes truthfully", () => {
    assert.deepEqual(surfaceShortcutHint({ shortcut: "4" }), {
      keys: `${modifierLabel}4`,
      kind: "direct",
    });
    assert.deepEqual(surfaceShortcutHint({}), {
      keys: `${modifierLabel}K`,
      kind: "palette",
    });
  });
});
