/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isDesktopShellCommand } from "@constellation/desktop-preload/client";
import { desktopSurfaceRegistry } from "@constellation/desktop-preload/surface-registry";

import {
  modifierLabel,
  shellShortcutGroups,
  surfaceShortcutHint,
} from "../src/components/ShortcutsOverlay.js";

/* Wejście nakładki bierzemy z rejestru powierzchni — dokładnie tak, jak robi
   to RealApp — więc test nie przepisuje żadnej etykiety z interfejsu. Grupy
   rozpoznajemy po zawartości i po dyskryminatorze `kind`; tytuł grupy służy tu
   wyłącznie za nieprzezroczystą tożsamość i nigdy nie jest sprawdzany co do
   treści. Dzięki temu asercje przeżyją dowolną zmianę słów, w tym przełączenie
   interfejsu na inny język. */

type SurfaceDescriptor = (typeof desktopSurfaceRegistry)[number];

const inputFor = (
  surface: SurfaceDescriptor,
): { readonly label: string; readonly shortcut?: string } =>
  surface.shortcut === null
    ? { label: surface.label }
    : { label: surface.label, shortcut: String(surface.shortcut) };

const surfaceInputs = desktopSurfaceRegistry.map(inputFor);

const directSurfaces = desktopSurfaceRegistry.filter(
  (surface) => surfaceShortcutHint(inputFor(surface)).kind === "direct",
);
const paletteSurfaces = desktopSurfaceRegistry.filter(
  (surface) => surfaceShortcutHint(inputFor(surface)).kind === "palette",
);

const labelsOf = (
  surfaces: readonly SurfaceDescriptor[],
): ReadonlySet<string> => new Set(surfaces.map((surface) => surface.label));

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((value) => b.has(value));

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

  it("advertises every destination once, split by the route that reaches it", () => {
    // Bez obu rodzajów w rejestrze test byłby pusty.
    assert.ok(directSurfaces.length > 0);
    assert.ok(paletteSurfaces.length > 0);

    const groups = shellShortcutGroups(surfaceInputs);
    const memberships = groups.map(
      (group) => new Set(group.entries.map((entry) => entry.label)),
    );
    const directIndex = memberships.findIndex((members) =>
      sameMembers(members, labelsOf(directSurfaces)),
    );
    const paletteIndex = memberships.findIndex((members) =>
      sameMembers(members, labelsOf(paletteSurfaces)),
    );

    assert.notEqual(
      directIndex,
      -1,
      "Żadna grupa nie zawiera dokładnie powierzchni z klawiszem bezpośrednim.",
    );
    assert.notEqual(
      paletteIndex,
      -1,
      "Żadna grupa nie zawiera dokładnie powierzchni osiągalnych tylko przez paletę.",
    );
    assert.notEqual(
      directIndex,
      paletteIndex,
      "Obie drogi dojścia trafiły do jednej grupy — nakładka ich nie rozróżnia.",
    );

    const directEntries = groups[directIndex]!.entries;
    // Kolejność i krotność wierszy idzie za rejestrem, nie tylko skład grupy.
    assert.deepEqual(
      directEntries.map((entry) => entry.label),
      directSurfaces.map((surface) => surface.label),
    );
    for (const surface of directSurfaces) {
      const entry = directEntries.find((item) => item.label === surface.label);
      assert.ok(
        entry !== undefined,
        `Powierzchnia ${surface.id} zniknęła z widoków bezpośrednich.`,
      );
      // Klawisz musi nieść cyfrę TEJ powierzchni, a nie cudzą.
      assert.deepEqual(entry.keys, [`${modifierLabel}${surface.shortcut}`]);
    }

    const paletteEntries = groups[paletteIndex]!.entries;
    assert.deepEqual(
      paletteEntries.map((entry) => entry.label),
      paletteSurfaces.map((surface) => surface.label),
    );
    const paletteChords = new Set(
      paletteEntries.map((entry) => entry.keys.join(" ")),
    );
    assert.deepEqual(
      [...paletteChords],
      [`${modifierLabel}K`],
      "Powierzchnie bez klawisza muszą być reklamowane jednym, wspólnym akordem palety.",
    );
    for (const surface of paletteSurfaces) {
      assert.ok(
        paletteEntries.some((entry) => entry.label === surface.label),
        `Powierzchnia ${surface.id} zniknęła z widoków przez paletę.`,
      );
    }
  });

  it("documents the global chords next to the destination rows", () => {
    const groups = shellShortcutGroups(surfaceInputs);
    const entries = groups.flatMap((group) => group.entries);
    const chords = new Set(entries.flatMap((entry) => entry.keys));

    for (const chord of [
      `${modifierLabel}K`,
      `${modifierLabel}⇧K`,
      `${modifierLabel}/`,
      `${modifierLabel}W`,
      "Ctrl+Tab",
      "Esc",
    ]) {
      assert.ok(
        chords.has(chord),
        `Nakładka przestała dokumentować akord ${chord}.`,
      );
    }

    // Każdy wiersz nazywa czynność i pokazuje co najmniej jeden klawisz.
    for (const entry of entries) {
      assert.ok(entry.label.trim().length > 0);
      assert.ok(entry.keys.length > 0);
      assert.ok(entry.keys.every((key) => key.trim().length > 0));
    }
    // Tytuł grupy jest tożsamością — musi być unikalny i niepusty.
    const titles = groups.map((group) => group.title);
    assert.equal(new Set(titles).size, titles.length);
    assert.ok(titles.every((title) => title.trim().length > 0));
  });

  it("labels direct and command-palette destination routes truthfully", () => {
    for (const surface of desktopSurfaceRegistry) {
      const hint = surfaceShortcutHint(inputFor(surface));
      if (surface.shortcut === null) {
        assert.deepEqual(hint, { keys: `${modifierLabel}K`, kind: "palette" });
      } else {
        assert.deepEqual(hint, {
          keys: `${modifierLabel}${surface.shortcut}`,
          kind: "direct",
        });
      }
    }
  });
});
