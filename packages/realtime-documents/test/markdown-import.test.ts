import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKDOWN_IMPORT_CONSTRUCTS,
  parseMarkdownImport,
  resolveMarkdownImport,
  type MarkdownImportNode,
} from "../src/markdown-import.js";
import {
  parseStructuredDocument,
  STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  type StructuredDocument,
  type StructuredDocumentNode,
} from "../src/structured-document.js";
import { structuredDocumentToMarkdown } from "../src/markdown.js";

/**
 * The markdown parser, bounded by the SERIALISER rather than by CommonMark.
 *
 * Every assertion here was verified by breaking it, with `tsc -b` inside the
 * loop. The load-bearing one is the round trip: it is derived, not pinned, so
 * it keeps holding as the vocabulary grows and it is the only thing that can
 * catch parser/serialiser drift — the failure that would silently rewrite two
 * hundred notes.
 */

const uuid = (suffix: string): string =>
  `1d000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

/** Resolution that refuses everything: the parser under test, not a resolver. */
const asText = () => ({ kind: "unresolved" }) as const;

const structured = (
  content: readonly MarkdownImportNode[],
): StructuredDocument =>
  parseStructuredDocument({
    schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    type: "doc",
    content: resolveMarkdownImport(content, asText).content,
  });

const parsed = (markdown: string): StructuredDocument =>
  structured(parseMarkdownImport(markdown).content);

/** The markdown a document turns back into, with references left unresolved. */
const serialised = (document: StructuredDocument): string =>
  structuredDocumentToMarkdown(document, {
    resolveReference: () => undefined,
    imageLink: (sourceId) => `constellation://source/${sourceId}`,
  });

/**
 * THE PROPERTY THIS WHOLE PARSER IS ACCEPTED AGAINST.
 *
 * parse → serialise → parse produces the same tree. It is not "the parser is
 * correct markdown" — that is unbounded — it is "the parser and the serialiser
 * agree", which is the only failure that can lose a person's writing between
 * the two directions of the same door.
 *
 * BROKEN BY: making `escapeInline`'s characters not unescape (a round trip
 * then accretes one backslash per pass), or by reading `\` at end of line as
 * anything but a hard break.
 */
const roundTrips = (markdown: string, note: string): StructuredDocument => {
  const first = parsed(markdown);
  const again = parsed(serialised(first));
  assert.deepEqual(again.content, first.content, note);
  return first;
};

test("headings, paragraphs and emphasis round-trip through the serialiser", () => {
  const document = roundTrips(
    [
      "# Northstar",
      "",
      "The **plan** is *simple* and ~~was~~ <u>is</u> ours.",
      "",
      "#### Fourth level",
      "",
      "###### Sixth level",
    ].join("\n"),
    "emphasis did not survive a round trip",
  );
  const levels = document.content
    .filter((node) => node.type === "heading")
    .map((node) => node.attrs?.level);
  assert.deepEqual(levels, [1, 4, 6], "h4 and h6 must survive S1's widening");
  const marks = (document.content[1]?.content ?? []).flatMap((node) =>
    (node.marks ?? []).map((mark) => mark.type),
  );
  assert.deepEqual(marks, ["bold", "italic", "strike", "underline"]);
});

test("a code fence keeps its language and its own backticks", () => {
  const document = roundTrips(
    ["````ts", "const fence = `` ` ``;", "````"].join("\n"),
    "the code fence did not survive a round trip",
  );
  const block = document.content[0];
  assert.equal(block?.type, "codeBlock");
  assert.equal(block?.attrs?.language, "ts");
  assert.equal(block?.content?.[0]?.text, "const fence = `` ` ``;");
});

test("lists nest, and an item that opens with a list still parses", () => {
  const document = roundTrips(
    ["- one", "  - deeper", "- two", "", "3. third", "4. fourth"].join("\n"),
    "the lists did not survive a round trip",
  );
  const bullet = document.content[0];
  assert.equal(bullet?.type, "bulletList");
  assert.equal(bullet?.content?.length, 2);
  assert.equal(bullet?.content?.[0]?.content?.[1]?.type, "bulletList");
  const ordered = document.content[1];
  assert.equal(ordered?.type, "orderedList");
  assert.equal(ordered?.attrs?.start, 3);
});

test("a list item beginning with a nested list gets an empty paragraph, never a refusal", () => {
  // `listItem` content is `paragraph block*` and `parseStructuredDocument`
  // THROWS on an item whose first child is anything else — which would lose the
  // whole note for one bullet. The count is what tells the person it happened.
  const result = parseMarkdownImport(["-   - inner", "- after"].join("\n"));
  assert.equal(result.observed.listItemLead, 1);
  const document = structured(result.content);
  const first = document.content[0]?.content?.[0];
  assert.equal(first?.content?.[0]?.type, "paragraph");
  assert.equal(first?.content?.[1]?.type, "bulletList");
});

test("a table round-trips, including a cell holding a pipe and a line break", () => {
  const document = roundTrips(
    [
      "| Budget | Owner |",
      "| --- | --- |",
      "| 10 \\| 20 | Anna<br>Piotr |",
    ].join("\n"),
    "the table did not survive a round trip",
  );
  const table = document.content[0];
  assert.equal(table?.type, "table");
  assert.equal(table?.content?.[0]?.content?.[0]?.type, "tableHeader");
  const cell = table?.content?.[1]?.content?.[0];
  assert.equal(cell?.content?.[0]?.content?.[0]?.text, "10 | 20");
  const second = table?.content?.[1]?.content?.[1]?.content?.[0]?.content;
  assert.deepEqual(
    second?.map((node) => node.type),
    ["text", "hardBreak", "text"],
  );
});

test("three dashes under a paragraph stay a heading, and three stars stay a rule", () => {
  // The serialiser writes `***` for a horizontal rule precisely because `---`
  // directly under a line is a setext heading. A parser that disagreed would
  // silently retitle the paragraph above every rule in the vault.
  const setext = parsed(["Northstar", "---", "", "body"].join("\n"));
  assert.equal(setext.content[0]?.type, "heading");
  assert.equal(setext.content[0]?.attrs?.level, 2);
  const rule = parsed(["Northstar", "", "***", "", "body"].join("\n"));
  assert.deepEqual(
    rule.content.map((node) => node.type),
    ["paragraph", "horizontalRule", "paragraph"],
  );
});

test("a hard break survives as a hard break and not as two paragraphs", () => {
  const document = roundTrips(
    "first\\\nsecond",
    "the hard break did not survive a round trip",
  );
  assert.deepEqual(
    document.content[0]?.content?.map((node) => node.type),
    ["text", "hardBreak", "text"],
  );
});

test("an absolute link is a link mark and a vault-relative one stays text", () => {
  const result = parseMarkdownImport(
    "See [the site](https://example.com) and [the note](./Other.md).",
  );
  assert.equal(result.observed.relativeLink, 1);
  const document = structured(result.content);
  const inline = document.content[0]?.content ?? [];
  const link = inline.find((node) =>
    (node.marks ?? []).some((mark) => mark.type === "link"),
  );
  assert.equal(
    link?.marks?.find((mark) => mark.type === "link")?.attrs?.href,
    "https://example.com",
  );
  // `assertLink` refuses a relative destination BY THROWING, taking the whole
  // note with it, so the only safe form is the characters that were written.
  assert.ok(
    inline.some((node) => (node.text ?? "").includes("[the note](./Other.md)")),
    "the vault-relative link was not kept as text",
  );
});

test("every construct with no home survives as the text that was written", () => {
  const source = [
    "---",
    "tags: [praca, wdrożenie]",
    "aliases: [Gwiazda]",
    "---",
    "",
    "> [!warning] Uwaga",
    "> This is a callout.",
    "",
    "![[Embedded note]]",
    "",
    "![a picture](attachments/shot.png)",
    "",
    "- [ ] a task box",
    "",
    "Tagged #wdrożenie here.",
  ].join("\n");
  const result = parseMarkdownImport(source);
  assert.deepEqual(
    Object.fromEntries(
      MARKDOWN_IMPORT_CONSTRUCTS.map((construct) => [
        construct,
        result.observed[construct],
      ]),
    ),
    {
      frontmatter: 1,
      embed: 1,
      tag: 1,
      taskCheckbox: 1,
      callout: 1,
      blockReference: 0,
      imageLink: 1,
      relativeLink: 0,
      listItemLead: 0,
    },
  );
  const flat = (nodes: readonly StructuredDocumentNode[]): string =>
    nodes
      .map((node) => `${node.text ?? ""}${flat(node.content ?? [])}`)
      .join("\n");
  const body = flat(structured(result.content).content);
  // NOTHING IS DROPPED. Each of these is a construct the model cannot express,
  // and each one is still readable in the note afterwards.
  for (const surviving of [
    "tags: [praca, wdrożenie]",
    "aliases: [Gwiazda]",
    "[!warning] Uwaga",
    "![[Embedded note]]",
    "![a picture](attachments/shot.png)",
    "[ ] a task box",
    "#wdrożenie",
  ])
    assert.ok(body.includes(surviving), `"${surviving}" did not survive`);
});

test("frontmatter is kept as a yaml block rather than discarded", () => {
  const document = parsed(["---", "tags: [a]", "---", "", "Body."].join("\n"));
  assert.equal(document.content[0]?.type, "codeBlock");
  assert.equal(document.content[0]?.attrs?.language, "yaml");
  assert.equal(document.content[0]?.content?.[0]?.text, "tags: [a]");
});

test("a wikilink is a hole until pass two, and pass two decides what it becomes", () => {
  const result = parseMarkdownImport(
    "Read [[Wdrożenie u klienta|the rollout]] and [[Gone]] and [[Wdrożenie u klienta#Cel]].",
  );
  assert.deepEqual(
    result.wikilinks.map((link) => link.target),
    ["Wdrożenie u klienta", "Gone", "Wdrożenie u klienta"],
  );
  assert.equal(result.wikilinks[0]?.alias, "the rollout");
  // A link naming a heading inside a note still names THAT NOTE: `#Cel` is an
  // anchor, and dropping the anchor is the only lossy part of a resolvable link.
  assert.equal(result.wikilinks[2]?.target, "Wdrożenie u klienta");

  const resolved = resolveMarkdownImport(result.content, (link) =>
    link.target === "Gone"
      ? ({ kind: "unresolved" } as const)
      : ({
          kind: "reference",
          targetKind: "document",
          targetId: uuid("1"),
        } as const),
  );
  assert.equal(resolved.resolved, 2);
  assert.equal(resolved.unresolved, 1);
  const inline = resolved.content[0]?.content ?? [];
  assert.equal(
    inline.filter((node) => node.type === "entityReference").length,
    2,
  );
  // AN UNRESOLVABLE LINK IS THE TEXT THAT WAS WRITTEN — never a dangling id
  // and never a remembered title.
  assert.ok(
    inline.some((node) => (node.text ?? "").includes("[[Gone]]")),
    "the unresolvable link did not stay as text",
  );
  assert.equal(
    inline.some((node) => node.text?.includes(uuid("1"))),
    false,
    "an id leaked into the body as text",
  );
});

test("a tree still holding a wikilink is refused by the validator, not stored", () => {
  // The placeholder is deliberately OUTSIDE the closed vocabulary, so skipping
  // pass two fails loudly instead of writing a note full of dead links.
  const result = parseMarkdownImport("Read [[Northstar]].");
  assert.throws(
    () =>
      parseStructuredDocument({
        schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
        type: "doc",
        content: result.content,
      }),
    /DOCUMENT_STRUCTURED_SCHEMA_INVALID/u,
  );
});

test("Polish titles match exactly, because ł has no decomposition to fold", () => {
  // INS found a folded query returning ZERO at every N for exactly this
  // reason. The link and the file name are compared as written.
  const result = parseMarkdownImport("Zobacz [[Wdrożenie w Łodzi]].");
  assert.equal(result.wikilinks[0]?.target, "Wdrożenie w Łodzi");
  assert.equal(
    result.wikilinks[0]?.target.normalize("NFD"),
    "Wdrożenie w Łodzi".normalize("NFD"),
  );
  const document = roundTrips(
    "Zażółć gęślą jaźń — **łódź** w Łodzi.",
    "Polish text did not survive a round trip",
  );
  assert.ok(
    (document.content[0]?.content ?? []).some((node) =>
      (node.text ?? "").includes("Zażółć gęślą jaźń"),
    ),
  );
});

test("escapes come back as themselves rather than accreting backslashes", () => {
  // The one failure that would corrupt a whole vault quietly: the serialiser
  // escapes `\ ` * _ [ ] < >` and the line starts, so a parser that did not
  // unescape would add a backslash on every pass through the door.
  const source = "A literal * and _ and [bracket] and <angle> and \\# hash.";
  const first = parsed(source);
  const second = parsed(serialised(first));
  const third = parsed(serialised(second));
  assert.deepEqual(second.content, first.content);
  assert.deepEqual(third.content, first.content);
  assert.equal(
    first.content[0]?.content?.[0]?.text,
    "A literal * and _ and [bracket] and <angle> and # hash.",
  );
});

test("an empty file becomes an empty note rather than a failure", () => {
  const document = parsed("");
  assert.deepEqual(document.content, [{ type: "paragraph" }]);
});

test("a blockquote holding a list and a paragraph keeps both", () => {
  const document = roundTrips(
    ["> First.", "> ", "> - one", "> - two"].join("\n"),
    "the quote did not survive a round trip",
  );
  const quote = document.content[0];
  assert.equal(quote?.type, "blockquote");
  assert.deepEqual(
    quote?.content?.map((node) => node.type),
    ["paragraph", "bulletList"],
  );
});
