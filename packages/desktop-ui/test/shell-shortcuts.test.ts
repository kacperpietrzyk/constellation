import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isDesktopShellCommand } from "@constellation/desktop-preload/client";

import { shellShortcutGroups } from "../src/components/ShortcutsOverlay.js";

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
    const views = groups.find((group) => group.title === "Widoki");

    assert.deepEqual(
      views?.entries.map((entry) => entry.label),
      ["Tydzień", "Spotkania"],
    );
    assert.equal(
      groups
        .flatMap((group) => group.entries)
        .some((entry) => entry.label === "Quick Capture"),
      true,
    );
  });
});
