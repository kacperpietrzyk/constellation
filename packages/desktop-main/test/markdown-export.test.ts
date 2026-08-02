import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  parseStructuredDocument,
  type StructuredDocument,
} from "@constellation/realtime-documents";

import {
  ATTACHMENT_DIRECTORY,
  UNFILED_DIRECTORY,
  buildMarkdownExport,
  markdownExportName,
  type MarkdownExportPorts,
  type MarkdownExportSpace,
} from "../src/markdown-export.js";

const uuid = (suffix: string): string =>
  `d0000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const body = (content: readonly unknown[]): StructuredDocument =>
  parseStructuredDocument({
    schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    type: "doc",
    content,
  });

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const plan = (input: {
  readonly spaces: readonly MarkdownExportSpace[];
  readonly content?: Readonly<Record<string, readonly unknown[]>>;
  readonly labels?: Readonly<Record<string, string>>;
  readonly evidence?: Readonly<Record<string, readonly string[]>>;
  readonly attachments?: Readonly<
    Record<string, { readonly bytes: Uint8Array; readonly mediaType: string }>
  >;
}) => {
  const ports: MarkdownExportPorts = {
    readSpaces: () => input.spaces,
    readStructured: ({ documentId }) => {
      const content = input.content?.[documentId];
      return content === undefined ? undefined : body(content);
    },
    readEvidenceSourceIds: ({ documentId }) =>
      input.evidence?.[documentId] ?? [],
    resolveReferences: ({ targets }) =>
      targets.flatMap((target) => {
        const label = input.labels?.[target.targetId];
        return label === undefined ? [] : [{ ...target, label }];
      }),
    readAttachment: (sourceId) => input.attachments?.[sourceId],
  };
  return buildMarkdownExport(ports);
};

const space = (
  overrides: Partial<MarkdownExportSpace> = {},
): MarkdownExportSpace => ({
  spaceId: uuid("a"),
  name: "Praca",
  folders: [],
  documents: [],
  sources: [],
  ...overrides,
});

describe("a filesystem name a title cannot break", () => {
  it("keeps a name that is already legal", () => {
    assert.equal(markdownExportName("Spotkanie z Anną"), "Spotkanie z Anną");
  });

  it("refuses the characters Windows and POSIX disagree about", () => {
    // A slash would end the path segment and silently move the note; the rest
    // are illegal on Windows, where the gate runs.
    assert.equal(
      markdownExportName('Q3: budget/plan <draft> "final" | v2?*'),
      "Q3- budget-plan -draft- -final- - v2--",
    );
  });

  it("drops a trailing dot, which Windows would drop anyway", () => {
    // Two distinct titles becoming one file is the failure this prevents, and
    // it would only ever have appeared on one of the two platforms.
    assert.equal(markdownExportName("Notatka."), "Notatka");
    assert.equal(markdownExportName("Notatka "), "Notatka");
  });

  it("gets out of the way of a reserved device name", () => {
    assert.equal(markdownExportName("con"), "_con");
    assert.equal(markdownExportName("COM1"), "_COM1");
    assert.equal(markdownExportName("Contract"), "Contract");
  });

  it("names a title that survives sanitising as nothing", () => {
    assert.equal(markdownExportName("   "), "Untitled");
    // "." and ".." are the two names a directory already has.
    assert.equal(markdownExportName("."), "Untitled");
    assert.equal(markdownExportName(".."), "Untitled");
    // A slash becomes a hyphen rather than nothing, so a title made of them
    // is still a name — just not a path.
    assert.equal(markdownExportName("///"), "---");
  });
});

describe("the bulk markdown export", () => {
  it("mirrors the folder tree and sends an unfiled note to its own directory", () => {
    const root = uuid("10");
    const child = uuid("11");
    const result = plan({
      spaces: [
        space({
          folders: [
            { id: root, name: "Klienci" },
            { id: child, name: "Acme", parentFolderId: root },
          ],
          documents: [
            {
              id: uuid("20"),
              title: "Kickoff",
              updatedAt: "2026-08-01T09:00:00.000Z",
              folderId: child,
            },
            {
              id: uuid("21"),
              title: "Luźna myśl",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
          ],
        }),
      ],
      content: {
        [uuid("20")]: [paragraph("Ustalenia")],
        [uuid("21")]: [paragraph("Później")],
      },
    });
    assert.deepEqual(
      result.notes.map((note) => note.path),
      ["Klienci/Acme/Kickoff.md", `${UNFILED_DIRECTORY}/Luźna myśl.md`],
    );
  });

  it("treats a folderId naming no folder as Unfiled rather than a missing path", () => {
    // Reachable BY DESIGN and written down as such in `contracts/src/query.ts`:
    // a note is soft-removed keeping its folder, the folder — empty by then —
    // is removed, and the note's removal is undone. Refusing that undo would
    // mean a note cannot be recovered because a folder is gone.
    const result = plan({
      spaces: [
        space({
          documents: [
            {
              id: uuid("20"),
              title: "Ocalona",
              updatedAt: "2026-08-01T09:00:00.000Z",
              folderId: uuid("99"),
            },
          ],
        }),
      ],
      content: { [uuid("20")]: [paragraph("Treść")] },
    });
    assert.deepEqual(
      result.notes.map((note) => note.path),
      [`${UNFILED_DIRECTORY}/Ocalona.md`],
    );
  });

  it("gives two notes with one title two files", () => {
    const result = plan({
      spaces: [
        space({
          documents: [
            {
              id: uuid("20"),
              title: "Notatka",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
            {
              id: uuid("21"),
              title: "Notatka",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
            {
              id: uuid("22"),
              title: "notatka",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
          ],
        }),
      ],
      content: {
        [uuid("20")]: [paragraph("A")],
        [uuid("21")]: [paragraph("B")],
        // A case-insensitive filesystem would have overwritten this one.
        [uuid("22")]: [paragraph("C")],
      },
    });
    assert.deepEqual(
      result.notes.map((note) => note.path),
      [
        `${UNFILED_DIRECTORY}/Notatka.md`,
        `${UNFILED_DIRECTORY}/Notatka (2).md`,
        `${UNFILED_DIRECTORY}/notatka (3).md`,
      ],
    );
    assert.equal(new Set(result.notes.map((note) => note.path)).size, 3);
  });

  it("keeps its own two directories when a real folder claims their names", () => {
    const result = plan({
      spaces: [
        space({
          folders: [
            { id: uuid("10"), name: UNFILED_DIRECTORY },
            { id: uuid("11"), name: ATTACHMENT_DIRECTORY },
          ],
          documents: [
            {
              id: uuid("20"),
              title: "W folderze",
              updatedAt: "2026-08-01T09:00:00.000Z",
              folderId: uuid("10"),
            },
            {
              id: uuid("21"),
              title: "Bez folderu",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
          ],
        }),
      ],
      content: {
        [uuid("20")]: [paragraph("A")],
        [uuid("21")]: [paragraph("B")],
      },
    });
    assert.deepEqual(
      result.notes.map((note) => note.path),
      [
        `${UNFILED_DIRECTORY} (2)/W folderze.md`,
        `${UNFILED_DIRECTORY}/Bez folderu.md`,
      ],
    );
  });

  it("writes a picture out once and links it relative to each note's depth", () => {
    const sourceId = uuid("30");
    const folder = uuid("10");
    const bytes = new Uint8Array([1, 2, 3]);
    const result = plan({
      spaces: [
        space({
          folders: [{ id: folder, name: "Klienci" }],
          sources: [
            {
              id: sourceId,
              title: "Tablica",
              sourceKind: "screenshot",
              availability: "available",
            },
          ],
          documents: [
            {
              id: uuid("20"),
              title: "Głęboko",
              updatedAt: "2026-08-01T09:00:00.000Z",
              folderId: folder,
            },
            {
              id: uuid("21"),
              title: "Płytko",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
          ],
        }),
      ],
      content: {
        [uuid("20")]: [{ type: "image", attrs: { sourceId, alt: "Tablica" } }],
        [uuid("21")]: [{ type: "image", attrs: { sourceId, alt: "Tablica" } }],
      },
      attachments: { [sourceId]: { bytes, mediaType: "image/png" } },
    });
    assert.deepEqual(
      result.attachments.map((attachment) => attachment.path),
      [`${ATTACHMENT_DIRECTORY}/Tablica.png`],
    );
    // One picture, one file, two notes pointing at it from their own depth.
    assert.match(
      result.notes[0]!.contents,
      /!\[Tablica\]\(\.\.\/attachments\/Tablica\.png\)/u,
    );
    assert.match(
      result.notes[1]!.contents,
      /!\[Tablica\]\(\.\.\/attachments\/Tablica\.png\)/u,
    );
  });

  it("keeps the identity link when a picture's bytes are not custodied here", () => {
    const sourceId = uuid("30");
    const result = plan({
      spaces: [
        space({
          documents: [
            {
              id: uuid("20"),
              title: "Notatka",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
          ],
        }),
      ],
      content: {
        [uuid("20")]: [{ type: "image", attrs: { sourceId, alt: "Brak" } }],
      },
    });
    // Never a path to a file that was never written: the reader can tell the
    // difference between "here it is" and "this workspace still holds it".
    assert.match(
      result.notes[0]!.contents,
      new RegExp(`!\\[Brak\\]\\(constellation://source/${sourceId}\\)`, "u"),
    );
    assert.equal(result.counts.missingAttachments, 1);
    assert.equal(result.attachments.length, 0);
  });

  it("counts a note it cannot read instead of writing an empty file for it", () => {
    // An empty `.md` beside 213 full ones is the worst outcome available: it
    // looks like an empty note. The count is what the panel reports.
    const result = plan({
      spaces: [
        space({
          documents: [
            {
              id: uuid("20"),
              title: "Czytelna",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
            {
              id: uuid("21"),
              title: "Nieczytelna",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
          ],
        }),
      ],
      content: { [uuid("20")]: [paragraph("Treść")] },
    });
    assert.equal(result.counts.notes, 1);
    assert.equal(result.counts.unreadable, 1);
    assert.deepEqual(
      result.notes.map((note) => note.path),
      [`${UNFILED_DIRECTORY}/Czytelna.md`],
    );
  });

  it("resolves a reference to its current name and counts the ones that do not", () => {
    const live = uuid("40");
    const gone = uuid("41");
    const result = plan({
      spaces: [
        space({
          documents: [
            {
              id: uuid("20"),
              title: "Notatka",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
          ],
        }),
      ],
      content: {
        [uuid("20")]: [
          {
            type: "paragraph",
            content: [
              {
                type: "entityReference",
                attrs: { targetKind: "task", targetId: live },
              },
              { type: "text", text: " i " },
              {
                type: "entityReference",
                attrs: { targetKind: "project", targetId: gone },
              },
            ],
          },
        ],
      },
      labels: { [live]: "Budżet Q3" },
    });
    assert.match(
      result.notes[0]!.contents,
      new RegExp(`\\[Budżet Q3\\]\\(constellation://task/${live}\\)`, "u"),
    );
    assert.match(
      result.notes[0]!.contents,
      /\[unresolved project reference\]/u,
    );
    assert.doesNotMatch(result.notes[0]!.contents, new RegExp(gone, "u"));
    assert.equal(result.counts.unresolvedReferences, 1);
  });

  it("lists a note's own sources and nobody else's", () => {
    const cited = uuid("30");
    const other = uuid("31");
    const result = plan({
      spaces: [
        space({
          sources: [
            {
              id: cited,
              title: "Umowa",
              sourceKind: "file",
              availability: "reference_only",
            },
            {
              id: other,
              title: "Cennik",
              sourceKind: "url",
              availability: "available",
              canonicalUrl: "https://example.test/c",
            },
          ],
          documents: [
            {
              id: uuid("20"),
              title: "Notatka",
              updatedAt: "2026-08-01T09:00:00.000Z",
            },
          ],
        }),
      ],
      content: { [uuid("20")]: [paragraph("Treść")] },
      evidence: { [uuid("20")]: [cited] },
    });
    assert.match(
      result.notes[0]!.contents,
      /- Umowa \(file, reference only\)/u,
    );
    assert.doesNotMatch(result.notes[0]!.contents, /Cennik/u);
  });

  it("keeps Unfiled apart from a folder of that name inside a Space, too", () => {
    // The top-level reservation does not reach `<Space>/Unfiled`, so without a
    // second one the unfiled notes and a real folder called "Unfiled" merge
    // into one directory nobody can tell apart afterwards.
    const shared = {
      folders: [{ id: uuid("10"), name: UNFILED_DIRECTORY }],
      documents: [
        {
          id: uuid("20"),
          title: "W folderze",
          updatedAt: "2026-08-01T09:00:00.000Z",
          folderId: uuid("10"),
        },
        {
          id: uuid("21"),
          title: "Bez folderu",
          updatedAt: "2026-08-01T09:00:00.000Z",
        },
      ],
    };
    const result = plan({
      spaces: [
        space({ spaceId: uuid("a"), name: "Praca", ...shared }),
        space({ spaceId: uuid("b"), name: "Prywatne" }),
      ],
      content: {
        [uuid("20")]: [paragraph("A")],
        [uuid("21")]: [paragraph("B")],
      },
    });
    assert.deepEqual(
      result.notes.map((note) => note.path),
      [
        `Praca/${UNFILED_DIRECTORY} (2)/W folderze.md`,
        `Praca/${UNFILED_DIRECTORY}/Bez folderu.md`,
      ],
    );
  });

  it("gives every Space its own directory only when there is more than one", () => {
    const one = space({
      spaceId: uuid("a"),
      name: "Praca",
      documents: [
        { id: uuid("20"), title: "A", updatedAt: "2026-08-01T09:00:00.000Z" },
      ],
    });
    const two = space({
      spaceId: uuid("b"),
      name: "Prywatne",
      documents: [
        { id: uuid("21"), title: "B", updatedAt: "2026-08-01T09:00:00.000Z" },
      ],
    });
    const content = {
      [uuid("20")]: [paragraph("A")],
      [uuid("21")]: [paragraph("B")],
    };
    assert.deepEqual(
      plan({ spaces: [one], content }).notes.map((note) => note.path),
      [`${UNFILED_DIRECTORY}/A.md`],
    );
    assert.deepEqual(
      plan({ spaces: [one, two], content }).notes.map((note) => note.path),
      [`Praca/${UNFILED_DIRECTORY}/A.md`, `Prywatne/${UNFILED_DIRECTORY}/B.md`],
    );
  });

  it("writes no path that could escape the chosen directory", () => {
    // The whole plan is relative and stays relative: an absolute path or a
    // `..` segment in a NAME would write outside the directory the person
    // picked, and a title is the one part of this a person controls freely.
    const result = plan({
      spaces: [
        space({
          folders: [{ id: uuid("10"), name: "../../etc" }],
          documents: [
            {
              id: uuid("20"),
              title: "../../../passwd",
              updatedAt: "2026-08-01T09:00:00.000Z",
              folderId: uuid("10"),
            },
          ],
        }),
      ],
      content: { [uuid("20")]: [paragraph("Treść")] },
    });
    for (const note of result.notes) {
      assert.ok(!note.path.startsWith("/"), note.path);
      assert.deepEqual(
        note.path.split("/").filter((segment) => segment === ".."),
        [],
        note.path,
      );
    }
  });
});
