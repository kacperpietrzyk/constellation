import type {
  StructuredDocument,
  StructuredDocumentMark,
  StructuredDocumentNode,
  StructuredDocumentNodeKind,
} from "./structured-document.js";

/**
 * The document, as markdown — the door out.
 *
 * Decision #17 calls export a CONDITION of this product rather than a feature
 * of it, and the reason is the storage format: a ProseMirror document inside a
 * Yjs CRDT is not a file anybody can open with anything else. A knowledge tool
 * that cannot give the writing back is a trap, so this module is the proof
 * that it can.
 *
 * The imports above are TYPE-ONLY on purpose. `structured-document.ts` pulls
 * `prosemirror-model` and `@tiptap/y-tiptap`; a value import here would drag
 * the editor stack behind every surface that wants a markdown string, and the
 * renderer size gate exists to catch exactly that. Nothing in this file is
 * imported at runtime, so it costs what it weighs.
 */

/**
 * The scheme an exported document names Constellation records with.
 *
 * It is an IDENTITY, not a URL: nothing resolves it outside this workspace,
 * and that is written into the "what does not travel" list rather than hidden
 * behind a link that looks live. The image form (`constellation://source/<id>`)
 * is deliberately the same shape as the record form, so a reader meets one
 * spelling instead of two — it is NOT `constellation-attachment://`, which is
 * the renderer's internal fetch scheme and would suggest the file can still
 * fetch the bytes.
 */
export const MARKDOWN_RECORD_URI_SCHEME = "constellation";

export const markdownRecordUri = (kind: string, id: string): string =>
  `${MARKDOWN_RECORD_URI_SCHEME}://${kind}/${id}`;

export interface StructuredDocumentMarkdownPorts {
  /**
   * The target's CURRENT name, or `undefined` when it does not resolve.
   *
   * Both surfaces resolve through the same read (`document.linkCandidates`
   * with `targets`), which is what stops the preview and the bulk export from
   * disagreeing about a reference while agreeing about everything else.
   *
   * Labels are deliberately never stored (`model.ts:612-617`): a persisted
   * title goes stale and can leak after revocation. Resolving at export time
   * is the same decision applied to the exported file.
   */
  readonly resolveReference: (reference: {
    readonly targetKind: string;
    readonly targetId: string;
  }) => string | undefined;
  /**
   * What an image node's `sourceId` becomes on THIS surface. The per-note
   * preview has no directory to write bytes into and hands back an identity
   * URI; the bulk export writes the payload out and hands back a relative
   * path. That difference is accepted and is STATED on the preview, because a
   * preview that lies by omission is worse than one that admits a limit.
   */
  readonly imageLink: (sourceId: string) => string;
}

interface MarkdownContext {
  readonly ports: StructuredDocumentMarkdownPorts;
  /** Gaps produced by the block being rendered, drained after each block. */
  readonly gaps: string[];
  /** Whether we are already inside a block container (quote, list, cell). */
  readonly nested: boolean;
}

const attribute = (
  node: StructuredDocumentNode,
  name: string,
): string | undefined => {
  const value = node.attrs?.[name];
  return value === undefined || value === null ? undefined : String(value);
};

/**
 * A gap markdown cannot carry, written out as a comment.
 *
 * SILENT LOSS IS THE ONE FAILURE MODE THIS FEATURE CANNOT HAVE. A person
 * exporting two hundred notes cannot diff them against a CRDT, so anything
 * that does not survive has to say so in the file itself — the alternative is
 * a vault that looks complete and is not.
 */
const gapComment = (message: string): string =>
  `<!-- ${message.replaceAll("--", "- -")} -->`;

/**
 * Backslash-escaped so that text a person typed cannot become structure.
 *
 * The set is the characters that change meaning ANYWHERE in a line. The ones
 * that only matter at the start of a line (`#`, `>`, `-`, `+`, `=`, a digit
 * followed by `.`) are handled by `escapeLineStarts` instead, because
 * escaping them mid-sentence produces `\#` everywhere somebody wrote a hash.
 */
const escapeInline = (text: string): string =>
  text.replaceAll(/[\\`*_[\]<>]/gu, (character) => `\\${character}`);

const escapeLineStarts = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.replace(/^(\s*)([#>+=-]|\d+[.)])/u, "$1\\$2"))
    .join("\n");

/** A link destination, wrapped when it carries anything a bare one cannot. */
const escapeDestination = (destination: string): string =>
  /[\s()<>]/u.test(destination)
    ? `<${destination.replaceAll(/[<>]/gu, "")}>`
    : destination;

/** Link and image TEXT: only the bracket can end it early. */
const escapeLinkText = (text: string): string =>
  text.replaceAll(/[[\]]/gu, (character) => `\\${character}`);

/** The shortest fence that cannot be closed by the code it wraps. */
const codeFence = (code: string): string => {
  const longest = [...code.matchAll(/`+/gu)].reduce(
    (length, match) => Math.max(length, match[0].length),
    0,
  );
  return "`".repeat(Math.max(3, longest + 1));
};

const markedText = (
  text: string,
  marks: readonly StructuredDocumentMark[],
): string => {
  const has = (kind: string): boolean =>
    marks.some((mark) => mark.type === kind);
  // `code` excludes every other mark in the schema (`excludes: "_"`), so it
  // is the only branch that can skip escaping — inside a code span nothing is
  // structure.
  if (has("code")) {
    const fence = "`".repeat(
      [...text.matchAll(/`+/gu)].reduce(
        (length, match) => Math.max(length, match[0].length),
        0,
      ) + 1,
    );
    const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
    return `${fence}${padding}${text}${padding}${fence}`;
  }
  let rendered = escapeInline(text);
  // Innermost first, so the order two marks nest in is fixed rather than
  // whatever order the writer happened to apply them in.
  // GFM HAS NO UNDERLINE. `<u>` keeps it visible instead of dropping it
  // silently; that it leaves markdown for HTML is in the round-trip list.
  if (has("underline")) rendered = `<u>${rendered}</u>`;
  if (has("strike")) rendered = `~~${rendered}~~`;
  if (has("italic")) rendered = `*${rendered}*`;
  if (has("bold")) rendered = `**${rendered}**`;
  const link = marks.find((mark) => mark.type === "link");
  const href = link?.attrs?.href;
  if (typeof href === "string" && href.length > 0)
    rendered = `[${escapeLinkText(rendered)}](${escapeDestination(href)})`;
  return rendered;
};

const inlineNodes = (
  nodes: readonly StructuredDocumentNode[] | undefined,
  context: MarkdownContext,
): string => (nodes ?? []).map((node) => renderNode(node, context)).join("");

/**
 * Block children, each followed by whatever gaps it produced.
 *
 * Draining here rather than at the end is what puts a comment BESIDE the
 * thing it describes: a gap collected three levels down inside a table cell
 * still lands directly after that table.
 */
const blockNodes = (
  nodes: readonly StructuredDocumentNode[] | undefined,
  context: MarkdownContext,
): readonly string[] => {
  const rendered: string[] = [];
  for (const node of nodes ?? []) {
    const block = renderNode(node, context);
    if (block.length > 0) rendered.push(block);
    while (context.gaps.length > 0) rendered.push(context.gaps.shift()!);
  }
  return rendered;
};

const prefixLines = (text: string, prefix: string, first = prefix): string =>
  text
    .split("\n")
    .map((line, index) =>
      index === 0
        ? `${first}${line}`
        : line.length === 0
          ? prefix.trimEnd()
          : `${prefix}${line}`,
    )
    .join("\n");

const listBlocks = (
  node: StructuredDocumentNode,
  context: MarkdownContext,
  marker: (index: number) => string,
): string =>
  (node.content ?? [])
    .map((item, index) => {
      const label = marker(index);
      const body = renderNode(item, { ...context, nested: true });
      return prefixLines(body, " ".repeat(label.length), label);
    })
    .join("\n");

/** One table cell's markdown, plus a gap for anything GFM cannot hold. */
const cellMarkdown = (
  node: StructuredDocumentNode,
  context: MarkdownContext,
): string => {
  const children = node.content ?? [];
  const [first, ...rest] = children;
  if (rest.length > 0)
    context.gaps.push(
      gapComment(
        `table cell dropped ${rest.length} block(s) markdown cannot hold in a ` +
          `cell (${[...new Set(rest.map((block) => block.type))].join(", ")})`,
      ),
    );
  const text =
    first === undefined
      ? ""
      : inlineNodes(first.content, { ...context, nested: true });
  // A pipe would end the cell and a newline would end the row. `<br>` is the
  // only line break a GFM cell has.
  return text.replaceAll("|", "\\|").replaceAll("\n", "<br>").trim();
};

const tableMarkdown = (
  node: StructuredDocumentNode,
  context: MarkdownContext,
): string => {
  if (context.nested)
    context.gaps.push(
      gapComment(
        "table rendered flat: markdown has no table inside a quote, a list " +
          "item or another table",
      ),
    );
  const rows = (node.content ?? []).map((row) => ({
    header: (row.content ?? []).every((cell) => cell.type === "tableHeader"),
    cells: (row.content ?? []).map((cell) => cellMarkdown(cell, context)),
  }));
  const width = rows.reduce(
    (widest, row) => Math.max(widest, row.cells.length),
    0,
  );
  if (width === 0) return "";
  const pad = (cells: readonly string[]): string =>
    `| ${[...cells, ...Array.from({ length: width - cells.length }, () => "")].join(" | ")} |`;
  // A table whose first row is data has NO header, and GFM cannot express
  // that. An empty header row is the honest form: promoting the first data
  // row would move a fact out of the table and into its heading.
  const leading = rows[0]?.header === true ? rows[0] : undefined;
  const body = leading === undefined ? rows : rows.slice(1);
  return [
    pad(leading?.cells ?? Array.from({ length: width }, () => "")),
    `|${" --- |".repeat(width)}`,
    ...body.map((row) => pad(row.cells)),
  ].join("\n");
};

/**
 * THE total record — one arm per node kind, and adding a kind to
 * `STRUCTURED_DOCUMENT_NODE_KINDS` without an arm here DOES NOT COMPILE.
 *
 * That is the whole mechanism, and it is deliberately a `Record` literal
 * rather than anything built from the kinds array: `Object.fromEntries` would
 * type as `Record<string, …>` and a missing kind would export empty content
 * with nothing failing anywhere — which is the exact defect family (a
 * hand-written list beside a closed vocabulary) this repository has now met
 * eight times.
 */
const nodeMarkdown: Record<
  StructuredDocumentNodeKind,
  (node: StructuredDocumentNode, context: MarkdownContext) => string
> = {
  doc: (node, context) => blockNodes(node.content, context).join("\n\n"),
  paragraph: (node, context) =>
    escapeLineStarts(inlineNodes(node.content, context)),
  heading: (node, context) => {
    const level = Number(attribute(node, "level") ?? 1);
    return `${"#".repeat(level)} ${inlineNodes(node.content, context)}`;
  },
  blockquote: (node, context) =>
    prefixLines(
      blockNodes(node.content, { ...context, nested: true }).join("\n\n"),
      "> ",
    ),
  bulletList: (node, context) => listBlocks(node, context, () => "- "),
  orderedList: (node, context) => {
    const start = Number(attribute(node, "start") ?? 1);
    return listBlocks(node, context, (index) => `${start + index}. `);
  },
  listItem: (node, context) =>
    blockNodes(node.content, { ...context, nested: true }).join("\n\n"),
  codeBlock: (node) => {
    // The raw characters, NOT the inline path: a code block carries no marks
    // (`marks: ""` in its spec) and nothing inside a fence is structure, so
    // escaping here would put backslashes into the person's own code. It went
    // through `inlineNodes` first and a fence containing three backticks came
    // out as `\`\`\``.
    const code = (node.content ?? []).map((child) => child.text ?? "").join("");
    const fence = codeFence(code);
    // The language is IN the model (`codeBlock.attrs.language`) and only the
    // rendering was ever missing. A fence that drops it turns every code
    // block in the vault into plain text on the way out.
    return `${fence}${attribute(node, "language") ?? ""}\n${code}\n${fence}`;
  },
  horizontalRule: () => "***",
  // `***`, not `---`: three dashes directly under a paragraph is a setext
  // heading, so the rule would silently retitle the line above it.
  hardBreak: () => "\\\n",
  text: (node) => {
    const text = node.text ?? "";
    return node.marks === undefined || node.marks.length === 0
      ? escapeInline(text)
      : markedText(text, node.marks);
  },
  entityReference: (node, context) => {
    const targetKind = attribute(node, "targetKind") ?? "";
    const targetId = attribute(node, "targetId") ?? "";
    const label = context.ports.resolveReference({ targetKind, targetId });
    // A REFERENCE THAT DOES NOT RESOLVE BECOMES PLAIN TEXT CARRYING A MARKER,
    // and never a remembered name. This is a privacy property, not a
    // formatting choice: `model.ts:612-617` refuses to store labels because a
    // persisted title goes stale and can LEAK AFTER REVOCATION, and an export
    // that wrote one back would reintroduce exactly what the model refuses.
    // The id is left out for the same reason the name is — an unresolvable
    // target is one this reader was not shown.
    return label === undefined
      ? `[unresolved ${targetKind} reference]`
      : `[${escapeLinkText(label)}](${markdownRecordUri(targetKind, targetId)})`;
  },
  image: (node, context) => {
    const sourceId = attribute(node, "sourceId") ?? "";
    // `alt` is required and may be empty; empty means decorative, which is a
    // claim somebody made. The plain-text reader emits `alt` for an image, so
    // markdown emits it too — two readers describing one picture differently
    // is how a search index and a file stop agreeing.
    const alt = attribute(node, "alt") ?? "";
    return `![${escapeLinkText(alt)}](${escapeDestination(context.ports.imageLink(sourceId))})`;
  },
  table: tableMarkdown,
  // Reached only through `tableMarkdown`, which needs the row and the cell
  // together to know the table's width. They carry real arms rather than
  // throwing, so that a row or a cell that somehow reaches a block position
  // exports its text instead of taking the export down.
  tableRow: (node, context) =>
    (node.content ?? []).map((cell) => cellMarkdown(cell, context)).join(" | "),
  tableCell: cellMarkdown,
  tableHeader: cellMarkdown,
};

const renderNode = (
  node: StructuredDocumentNode,
  context: MarkdownContext,
): string => nodeMarkdown[node.type](node, context);

/**
 * A parsed document's body as markdown. The wrapper (frontmatter, title,
 * sources) is `noteMarkdownFile`; this is the part both surfaces share
 * character for character.
 */
export const structuredDocumentToMarkdown = (
  document: StructuredDocument,
  ports: StructuredDocumentMarkdownPorts,
): string => {
  const context: MarkdownContext = { ports, gaps: [], nested: false };
  return blockNodes(document.content, context).join("\n\n");
};

export interface NoteMarkdownSource {
  readonly title: string;
  readonly sourceKind: "url" | "file" | "screenshot" | "excerpt";
  readonly availability: "reference_only" | "available" | "unavailable";
  readonly canonicalUrl?: string | undefined;
}

export interface NoteMarkdownFile {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly body: string;
  /**
   * The note's evidence, listed rather than copied. 75 of the 81 sources in
   * the real workspace are `reference_only` and have no bytes at all, and a
   * `file` source keeps a path on ONE machine — so a source travels as what
   * it is, a citation, and the panel says so.
   */
  readonly sources?: readonly NoteMarkdownSource[] | undefined;
}

/**
 * YAML double-quoted scalars are a superset of JSON strings, so this is exact
 * for every title a person can type — including one with a colon, a quote or
 * a `#`, each of which breaks a bare scalar.
 */
const yamlString = (value: string): string => JSON.stringify(value);

const sourceLine = (source: NoteMarkdownSource): string => {
  const suffix =
    source.canonicalUrl === undefined || source.canonicalUrl.length === 0
      ? ""
      : ` — <${source.canonicalUrl}>`;
  return `- ${escapeInline(source.title)} (${source.sourceKind}, ${source.availability.replaceAll("_", " ")})${suffix}`;
};

/**
 * One exported `.md` file: frontmatter, the title as an H1, the body, and the
 * sources it cites.
 *
 * The frontmatter carries the record id because it is the only place the
 * exported file still knows WHICH note it was. Everything else about the
 * record — its versions, its history, its authorship — stays behind, and that
 * list is the honest half of "the door out stays open".
 */
export const noteMarkdownFile = (note: NoteMarkdownFile): string => {
  const frontmatter = [
    "---",
    `id: ${note.id}`,
    `title: ${yamlString(note.title)}`,
    `updated: ${note.updatedAt}`,
    "---",
  ].join("\n");
  const sources =
    note.sources === undefined || note.sources.length === 0
      ? []
      : ["## Sources", note.sources.map(sourceLine).join("\n")];
  return [
    frontmatter,
    `# ${escapeLineStarts(escapeInline(note.title))}`,
    ...(note.body.length > 0 ? [note.body] : []),
    ...sources,
  ]
    .join("\n\n")
    .concat("\n");
};
