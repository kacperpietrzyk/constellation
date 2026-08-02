import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STRUCTURED_DOCUMENT_NODE_KINDS,
  STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  noteMarkdownFile,
  parseStructuredDocument,
  structuredDocumentToMarkdown,
  type StructuredDocumentMarkdownPorts,
  type StructuredDocumentNodeKind,
} from "../src/index.js";

const uuid = (suffix: string): string =>
  `c0000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const TASK = uuid("1");
const SOURCE = uuid("2");

/**
 * Every case goes through `parseStructuredDocument` first, so nothing in this
 * file can assert markdown for a document the product would refuse to store.
 * A hand-built object would let a test pass on content no note can contain.
 */
const markdown = (
  content: readonly unknown[],
  ports: Partial<StructuredDocumentMarkdownPorts> = {},
): string =>
  structuredDocumentToMarkdown(
    parseStructuredDocument({
      schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
      type: "doc",
      content,
    }),
    {
      resolveReference: ({ targetId }) =>
        targetId === TASK ? "Q3 budget [draft]" : undefined,
      imageLink: (sourceId) => `constellation://source/${sourceId}`,
      ...ports,
    },
  );

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const cell = (kind: "tableCell" | "tableHeader", text: string) => ({
  type: kind,
  content: [paragraph(text)],
});

/**
 * The cases, each declaring which node kinds it exercises.
 *
 * The declaration is not decoration: the last test in this file derives the
 * covered set from here and compares it to the closed vocabulary, so a kind
 * added to `STRUCTURED_DOCUMENT_NODE_KINDS` turns this file red even if
 * somebody gives it a stub arm to make the build pass. A hand-kept list of
 * "kinds we test" is the defect family this repository has met eight times.
 */
const cases: readonly {
  readonly name: string;
  readonly kinds: readonly StructuredDocumentNodeKind[];
  readonly content: readonly unknown[];
  readonly expected: string;
}[] = [
  {
    name: "a paragraph, with the characters that would otherwise become structure",
    kinds: ["paragraph", "text"],
    content: [paragraph("cost * 2 [see below] _draft_")],
    expected: "cost \\* 2 \\[see below\\] \\_draft\\_",
  },
  {
    name: "a heading at every level the editor offers",
    kinds: ["heading"],
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Cel" }],
      },
      {
        type: "heading",
        attrs: { level: 6 },
        content: [{ type: "text", text: "Detal" }],
      },
    ],
    expected: "# Cel\n\n###### Detal",
  },
  {
    name: "a bullet list, with a nested list under an item",
    kinds: ["bulletList", "listItem"],
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              paragraph("Anna"),
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph("budget")] }],
              },
            ],
          },
          { type: "listItem", content: [paragraph("Piotr")] },
        ],
      },
    ],
    expected: "- Anna\n\n  - budget\n- Piotr",
  },
  {
    name: "an ordered list keeping the number it starts at",
    kinds: ["orderedList"],
    content: [
      {
        type: "orderedList",
        attrs: { start: 4 },
        content: [
          { type: "listItem", content: [paragraph("czwarty")] },
          { type: "listItem", content: [paragraph("piąty")] },
        ],
      },
    ],
    expected: "4. czwarty\n5. piąty",
  },
  {
    name: "a quote, whose every line stays quoted",
    kinds: ["blockquote"],
    content: [
      {
        type: "blockquote",
        content: [paragraph("Nie zmieściliśmy się"), paragraph("— Anna")],
      },
    ],
    // The em dash is not a hyphen, so it opens no list; the quote marker
    // survives the blank line between the two paragraphs.
    expected: "> Nie zmieściliśmy się\n>\n> — Anna",
  },
  {
    name: "A CODE FENCE CARRYING ITS LANGUAGE",
    kinds: ["codeBlock"],
    content: [
      {
        type: "codeBlock",
        attrs: { language: "sql" },
        content: [{ type: "text", text: "select 1;" }],
      },
    ],
    expected: "```sql\nselect 1;\n```",
  },
  {
    name: "a code fence long enough that the code cannot close it",
    kinds: ["codeBlock"],
    content: [
      {
        type: "codeBlock",
        content: [{ type: "text", text: "``` not the end" }],
      },
    ],
    expected: "````\n``` not the end\n````",
  },
  {
    name: "a rule that cannot retitle the paragraph above it",
    kinds: ["horizontalRule"],
    content: [paragraph("Wnioski"), { type: "horizontalRule" }],
    expected: "Wnioski\n\n***",
  },
  {
    name: "a hard break inside a paragraph",
    kinds: ["hardBreak"],
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Anna" },
          { type: "hardBreak" },
          { type: "text", text: "Piotr" },
        ],
      },
    ],
    expected: "Anna\\\nPiotr",
  },
  {
    name: "every mark, including the one GFM has no form for",
    kinds: ["text"],
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: " " },
          { type: "text", text: "italic", marks: [{ type: "italic" }] },
          { type: "text", text: " " },
          { type: "text", text: "gone", marks: [{ type: "strike" }] },
          { type: "text", text: " " },
          { type: "text", text: "under", marks: [{ type: "underline" }] },
          { type: "text", text: " " },
          { type: "text", text: "a*b", marks: [{ type: "code" }] },
          { type: "text", text: " " },
          {
            type: "text",
            text: "Jamie",
            marks: [
              { type: "link", attrs: { href: "https://example.test/a b" } },
            ],
          },
        ],
      },
    ],
    expected:
      "**bold** *italic* ~~gone~~ <u>under</u> `a*b` [Jamie](<https://example.test/a b>)",
  },
  {
    name: "A RESOLVABLE REFERENCE — the current name and the stable id",
    kinds: ["entityReference"],
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Dotyczy " },
          {
            type: "entityReference",
            attrs: { targetKind: "task", targetId: TASK },
          },
        ],
      },
    ],
    // The bracket in the record's own name is escaped, or it would end the
    // link text early and the id would land in the visible sentence.
    expected: `Dotyczy [Q3 budget \\[draft\\]](constellation://task/${TASK})`,
  },
  {
    name: "AN UNRESOLVABLE REFERENCE — plain text with a marker, no name, no id",
    kinds: ["entityReference"],
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "entityReference",
            attrs: { targetKind: "person", targetId: uuid("9") },
          },
        ],
      },
    ],
    expected: "[unresolved person reference]",
  },
  {
    name: "an image, by its alternative text and its source identity",
    kinds: ["image"],
    content: [
      {
        type: "image",
        attrs: { sourceId: SOURCE, alt: "Tablica po warsztacie" },
      },
    ],
    expected: `![Tablica po warsztacie](constellation://source/${SOURCE})`,
  },
  {
    name: "a table with a real header row, and a pipe that cannot end a cell",
    kinds: ["table", "tableRow", "tableHeader", "tableCell"],
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("tableHeader", "Temat"), cell("tableHeader", "Kto")],
          },
          {
            type: "tableRow",
            content: [
              cell("tableCell", "Budżet | koszty"),
              cell("tableCell", "Anna"),
            ],
          },
        ],
      },
    ],
    expected: "| Temat | Kto |\n| --- | --- |\n| Budżet \\| koszty | Anna |",
  },
  {
    name: "a table whose first row is data keeps an empty header rather than promoting it",
    kinds: ["table"],
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("tableCell", "Anna"), cell("tableCell", "Piotr")],
          },
        ],
      },
    ],
    expected: "|  |  |\n| --- | --- |\n| Anna | Piotr |",
  },
  {
    name: "A SCHEMA GAP EMITTED AS A COMMENT RATHER THAN DROPPED",
    kinds: ["tableCell"],
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  paragraph("Budżet"),
                  {
                    type: "bulletList",
                    content: [{ type: "listItem", content: [paragraph("q3")] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    expected:
      "|  |\n| --- |\n| Budżet |\n\n" +
      "<!-- table cell dropped 1 block(s) markdown cannot hold in a cell (bulletList) -->",
  },
  {
    name: "a table inside a quote says so instead of pretending it nested",
    kinds: ["table"],
    content: [
      {
        type: "blockquote",
        content: [
          {
            type: "table",
            content: [
              { type: "tableRow", content: [cell("tableHeader", "Kto")] },
            ],
          },
        ],
      },
    ],
    // The comment stays INSIDE the quote, beside the table it describes,
    // rather than escaping to the top level where a reader would have to
    // guess which block it belongs to.
    expected:
      "> | Kto |\n> | --- |\n>\n" +
      "> <!-- table rendered flat: markdown has no table inside a quote, a list item or another table -->",
  },
];

describe("structured document → markdown", () => {
  for (const testCase of cases)
    it(`serialises ${testCase.name}`, () => {
      assert.equal(markdown(testCase.content), testCase.expected);
    });

  it("covers every kind in the closed node vocabulary", () => {
    // Derived, never listed: `STRUCTURED_DOCUMENT_NODE_KINDS` is the registry
    // and this asks it, so a kind added there fails HERE with its own name
    // rather than passing quietly on a stub arm that returns "".
    const covered = new Set<string>(
      cases.flatMap((testCase) => testCase.kinds),
    );
    // `doc` is the top node and every case exercises it by construction.
    covered.add("doc");
    const missing = STRUCTURED_DOCUMENT_NODE_KINDS.filter(
      (kind) => !covered.has(kind),
    );
    assert.deepEqual(
      missing,
      [],
      `no markdown case exercises: ${missing.join(", ")}`,
    );
  });

  it("keeps the preview and the bulk export identical except on the image line", () => {
    // The shape, not a sentence: the two surfaces are ALLOWED to differ about
    // an image and about nothing else, so this diffs them line by line rather
    // than matching a phrase. A future arm that started depending on the
    // ports would show up here as a second differing line.
    const content = [
      paragraph("Przed"),
      { type: "image", attrs: { sourceId: SOURCE, alt: "Tablica" } },
      paragraph("Po"),
      {
        type: "paragraph",
        content: [
          {
            type: "entityReference",
            attrs: { targetKind: "task", targetId: TASK },
          },
        ],
      },
    ];
    const preview = markdown(content).split("\n");
    const bulk = markdown(content, {
      imageLink: (sourceId) => `attachments/${sourceId}.png`,
    }).split("\n");
    assert.equal(preview.length, bulk.length);
    const differing = preview.filter((line, index) => line !== bulk[index]);
    assert.deepEqual(differing, [
      `![Tablica](constellation://source/${SOURCE})`,
    ]);
  });

  it("never writes a remembered name for a target that stopped resolving", () => {
    // The privacy property, stated as an absence. `model.ts:612-617` refuses
    // to store labels because a persisted title goes stale and can leak after
    // revocation; an export that wrote one back would reintroduce it in a
    // file that outlives the revocation.
    const secret = "Acquisition of Northwind";
    const output = markdown(
      [
        {
          type: "paragraph",
          content: [
            {
              type: "entityReference",
              attrs: { targetKind: "project", targetId: uuid("7") },
            },
          ],
        },
      ],
      { resolveReference: () => undefined },
    );
    assert.doesNotMatch(output, new RegExp(secret, "u"));
    assert.doesNotMatch(output, /c0000000-0000-4000-8000-000000000007/u);
    assert.match(output, /^\[unresolved project reference\]$/u);
  });
});

describe("one exported note file", () => {
  it("carries the record id and a title no punctuation can break", () => {
    const file = noteMarkdownFile({
      id: uuid("3"),
      title: 'Budget: "Q3" — draft',
      updatedAt: "2026-08-01T09:00:00.000Z",
      body: markdown([paragraph("Treść")]),
    });
    // A bare YAML scalar dies on the colon and on the quotes; the frontmatter
    // is what tells the exported file which record it was, so it has to parse.
    assert.match(file, /^---\nid: c0000000-0000-4000-8000-000000000003\n/u);
    assert.match(file, /\ntitle: "Budget: \\"Q3\\" — draft"\n/u);
    assert.match(file, /\nupdated: 2026-08-01T09:00:00\.000Z\n---\n/u);
    assert.match(file, /\n# Budget: "Q3" — draft\n/u);
    assert.ok(file.endsWith("Treść\n"));
  });

  it("lists the sources a note cites instead of claiming to carry them", () => {
    const file = noteMarkdownFile({
      id: uuid("4"),
      title: "Notatka",
      updatedAt: "2026-08-01T09:00:00.000Z",
      body: "",
      sources: [
        {
          title: "Umowa ramowa.pdf",
          sourceKind: "file",
          availability: "reference_only",
        },
        {
          title: "Cennik",
          sourceKind: "url",
          availability: "available",
          canonicalUrl: "https://example.test/cennik",
        },
      ],
    });
    assert.match(file, /\n## Sources\n/u);
    assert.match(file, /- Umowa ramowa\.pdf \(file, reference only\)\n/u);
    assert.match(
      file,
      /- Cennik \(url, available\) — <https:\/\/example\.test\/cennik>\n/u,
    );
  });

  it("omits the sources section when a note cites nothing", () => {
    const file = noteMarkdownFile({
      id: uuid("5"),
      title: "Notatka",
      updatedAt: "2026-08-01T09:00:00.000Z",
      body: "Treść",
    });
    assert.doesNotMatch(file, /## Sources/u);
  });
});
