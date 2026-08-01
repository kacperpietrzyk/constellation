/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import StarterKit from "@tiptap/starter-kit";
import {
  STRUCTURED_DOCUMENT_HEADING_LEVELS,
  STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  parseStructuredDocument,
} from "@constellation/realtime-documents";

// Ta asercja mieszka w rendererze, a nie przy walidatorze, z tego samego
// powodu co asercja o `inspectorSurface`: StarterKit jest zależnością TEJ
// paczki, a `@constellation/realtime-documents` nie ma prawa jej znać.
//
// Czego pilnuje: do fali D edytor oferował sześć poziomów nagłówka wraz ze
// skrótami `Mod-Alt-N`, a walidator treści przyjmował trzy. Notatka z h4
// wyglądała poprawnie temu, kto ją pisał, i nie dawała się ani przeczytać, ani
// zapisać żadnemu agentowi, bo `parseStructuredDocument` odrzucał cały
// dokument. Rozejście nie miało strażnika i wyszło z ręcznego porównania obu
// schematów — dlatego trwałą częścią naprawy jest ten plik, a nie sama
// jednolinijkowa zmiana listy.

const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "RealApp.tsx"))) {
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error("Could not locate the desktop-ui package root.");
    directory = parent;
  }
  return directory;
};

const uiRoot = findPackageRoot();
const read = (...segments: readonly string[]): string =>
  readFileSync(path.join(uiRoot, ...segments), "utf8");

const headingNode = (level: number) => ({
  schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  type: "doc" as const,
  content: [
    {
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text: "Heading" }],
    },
  ],
});

// Poziomy, które StarterKit NAPRAWDĘ zamontuje po skonfigurowaniu ze wspólnej
// stałej. Sięgamy po dziecko rozszerzenia, bo sprawdzanie własnego argumentu
// nie sprawdza niczego: liczy się to, co dostanie rozszerzenie `heading`.
// Nieudane sięgnięcie jest AWARIĄ PRZYRZĄDU, nie wynikiem — bez tego rzutu
// zmiana wewnętrznego kształtu StarterKita zamieniłaby ten test w zieleń nad
// pustym zbiorem.
const starterKitHeadingLevels = (
  levels: typeof STRUCTURED_DOCUMENT_HEADING_LEVELS,
): readonly number[] => {
  const kit = StarterKit.configure({ heading: { levels: [...levels] } });
  const addExtensions = kit.config.addExtensions;
  if (typeof addExtensions !== "function")
    throw new Error(
      "StarterKit nie wystawia już `addExtensions` — asercja poziomów nagłówka przestała cokolwiek czytać.",
    );
  const children = addExtensions.call({
    ...kit,
    options: kit.options,
  } as never) as readonly {
    readonly name: string;
    readonly options: unknown;
  }[];
  const heading = children.find((child) => child.name === "heading");
  if (heading === undefined)
    throw new Error(
      "StarterKit nie montuje rozszerzenia `heading` — asercja poziomów nagłówka przestała cokolwiek czytać.",
    );
  const found = (heading.options as { readonly levels?: unknown }).levels;
  if (!Array.isArray(found) || found.length === 0)
    throw new Error(
      "Rozszerzenie `heading` nie podaje listy poziomów — asercja poziomów nagłówka przestała cokolwiek czytać.",
    );
  return found as readonly number[];
};

describe("the editor and the content validator agree on heading levels", () => {
  it("mounts in the editor exactly the levels the validator accepts", () => {
    assert.deepEqual(
      starterKitHeadingLevels(STRUCTURED_DOCUMENT_HEADING_LEVELS),
      [...STRUCTURED_DOCUMENT_HEADING_LEVELS],
    );
  });

  it("accepts every level the editor offers and refuses the ones outside it", () => {
    for (const level of STRUCTURED_DOCUMENT_HEADING_LEVELS) {
      const parsed = parseStructuredDocument(headingNode(level));
      assert.equal(parsed.content[0]?.attrs?.level, level);
    }
    // Kraniec z obu stron, bo zwężenie listy pokazuje się na h4, a rozszerzenie
    // jej „na wszelki wypadek" na h0 i h7.
    for (const level of [0, 7]) {
      assert.throws(
        () => parseStructuredDocument(headingNode(level)),
        /DOCUMENT_STRUCTURED_SCHEMA_INVALID/,
        `Poziom ${level} leży poza wspólną listą i musi zostać odrzucony.`,
      );
    }
  });

  it("configures both editors from the shared constant instead of a literal", () => {
    // Bez tego oba miejsca mogą wrócić do domyślnych ustawień StarterKita
    // JEDNYM skasowaniem opcji — i wtedy zbiory znowu rozjeżdżają się cicho,
    // bo domyślne poziomy nie są niczym związane z walidatorem.
    for (const source of [
      read("src", "library", "KnowledgeEditor.tsx"),
      read("src", "ProjectRichBody.tsx"),
    ]) {
      assert.match(
        source,
        /heading:\s*\{\s*levels:\s*\[\.\.\.STRUCTURED_DOCUMENT_HEADING_LEVELS\]\s*\}/,
      );
    }
  });
});
