import type {
  StructuredDocumentMark,
  StructuredDocumentNode,
  StructuredDocumentNodeKind,
} from "./structured-document.js";

/**
 * Markdown, as a document — the door back IN.
 *
 * This is the inverse of `markdown.ts`, and it is deliberately bounded by that
 * file rather than by CommonMark. The acceptance property is a ROUND TRIP:
 * parse → `structuredDocumentToMarkdown` → parse produces the same tree. A
 * parser written against the specification instead would be larger, would
 * still not be complete, and would drift from the serialiser in exactly the
 * places nobody looks — which is how a two-hundred-note migration loses
 * content quietly.
 *
 * THE RULE THAT SHAPES EVERY DECISION HERE: a construct this model cannot
 * express SURVIVES AS THE LITERAL TEXT THE PERSON WROTE. It is never dropped
 * and never approximated into something else. Somebody moving their whole
 * vault can repair text they can still see; they cannot repair a callout that
 * became an ordinary quote and no longer says which kind it was, and they
 * cannot repair a paragraph that is simply gone.
 *
 * The imports above are TYPE-ONLY, as in `markdown.ts` and for the same
 * reason: `structured-document.ts` pulls `prosemirror-model` and
 * `@tiptap/y-tiptap`, and a value import here would drag the editor stack
 * behind anything that wants to read a file.
 */

/**
 * A `[[wikilink]]`, as written, before anything resolves it.
 *
 * In Obsidian this names a FILE. Here a reference stores IDENTITY and the
 * label is resolved at read time from the current authorized target, so the
 * import cannot turn one into the other without knowing what it points at —
 * which it does not, until every note exists. That is why parsing stops at
 * this shape and `resolveMarkdownImport` finishes the job in a second pass.
 */
export interface MarkdownImportWikilink {
  /**
   * What the link names, with `#heading` and `^block` stripped and the `.md`
   * extension removed — the part that identifies a file.
   */
  readonly target: string;
  /** The `|alias`, if one was written. */
  readonly alias?: string;
  /** Exactly what stood in the file, brackets included. */
  readonly raw: string;
}

/**
 * The parser's own node type: the closed document vocabulary, plus ONE arm
 * that is not in it.
 *
 * `wikilink` is not a `StructuredDocumentNodeKind` and must not become one —
 * it is a hole waiting for a second pass, and a tree still holding one is
 * refused by `parseStructuredDocument` rather than stored. Keeping it outside
 * the closed vocabulary is what makes "the resolution pass was skipped" a
 * compile-time and parse-time failure instead of a note full of dead links.
 */
export interface MarkdownImportNode {
  readonly type: StructuredDocumentNodeKind | "wikilink";
  readonly attrs?: Readonly<Record<string, string | number | null>>;
  readonly content?: readonly MarkdownImportNode[];
  readonly marks?: readonly StructuredDocumentMark[];
  readonly text?: string;
  /** Present exactly when `type` is `"wikilink"`. */
  readonly wikilink?: MarkdownImportWikilink;
}

/**
 * The constructs this parser MEETS and cannot express, counted so a person is
 * told what their own vault contains before anything is written.
 *
 * These are ids rather than sentences on purpose: the sentences belong to the
 * surface that shows them, and a count keyed by a phrase stops matching the
 * day the phrase is edited.
 */
export const MARKDOWN_IMPORT_CONSTRUCTS = [
  /** YAML frontmatter. Kept as a code block at the top of the note. */
  "frontmatter",
  /** `![[Note]]` — transclusion. There is no node kind for it. */
  "embed",
  /** `#tag`. A note carries no tags. */
  "tag",
  /** `- [ ]` / `- [x]`. Decision #18: a task lives in exactly one place. */
  "taskCheckbox",
  /** `> [!note]` — the callout type has nowhere to go. */
  "callout",
  /** `^block-id` — block references have no anchor here. */
  "blockReference",
  /** `![alt](path)` — an image node names an attachment already custodied. */
  "imageLink",
  /** `[text](./file.md)` — a link mark takes http, https or mailto only. */
  "relativeLink",
  /** A list item that does not begin with a paragraph. */
  "listItemLead",
] as const;

export type MarkdownImportConstruct =
  (typeof MARKDOWN_IMPORT_CONSTRUCTS)[number];

export type MarkdownImportConstructCounts = Readonly<
  Record<MarkdownImportConstruct, number>
>;

export interface MarkdownImportResult {
  readonly content: readonly MarkdownImportNode[];
  /** Every wikilink, in document order, duplicates included. */
  readonly wikilinks: readonly MarkdownImportWikilink[];
  readonly observed: MarkdownImportConstructCounts;
}

const emptyCounts = (): Record<MarkdownImportConstruct, number> =>
  Object.fromEntries(
    MARKDOWN_IMPORT_CONSTRUCTS.map((construct) => [construct, 0]),
  ) as Record<MarkdownImportConstruct, number>;

interface ParseState {
  readonly counts: Record<MarkdownImportConstruct, number>;
  readonly wikilinks: MarkdownImportWikilink[];
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

const withMark = (
  nodes: readonly MarkdownImportNode[],
  mark: StructuredDocumentMark,
): readonly MarkdownImportNode[] =>
  nodes.map((node) =>
    node.type === "text"
      ? {
          ...node,
          // A duplicate would be refused by `assertMarks`, which rejects the
          // whole note rather than the mark: `**a *b* a**` nests, and the
          // inner run already carries italic when the outer bold wraps it.
          marks: (node.marks ?? []).some(
            (existing) => existing.type === mark.type,
          )
            ? (node.marks ?? [])
            : [...(node.marks ?? []), mark],
        }
      : node,
  );

const text = (value: string): MarkdownImportNode => ({
  type: "text",
  text: value,
});

/** `code` excludes every other mark in the schema, so it never nests. */
const codeSpan = (value: string): MarkdownImportNode => ({
  type: "text",
  text: value,
  marks: [{ type: "code" }],
});

const LINK_PROTOCOLS = ["http:", "https:", "mailto:"];

/**
 * Whether a link destination is one the schema will accept.
 *
 * `assertLink` refuses anything else by THROWING, which fails the whole note
 * — so a relative link inside a vault (`[notes](./other.md)`, which is what
 * half a vault's links look like once Obsidian rewrites them) has to be
 * recognised here and kept as text, not handed to the validator and discovered
 * as a lost note.
 */
const isStorableHref = (destination: string): boolean => {
  if (destination.length > 2_048) return false;
  try {
    return LINK_PROTOCOLS.includes(new URL(destination).protocol);
  } catch {
    return false;
  }
};

/** The characters `escapeInline` puts a backslash in front of, and the ones
 * `escapeLineStarts` adds at the head of a line. Unescaping exactly this set
 * is what stops a round trip from accreting a backslash on every pass. */
const UNESCAPABLE = new Set([
  "\\",
  "`",
  "*",
  "_",
  "[",
  "]",
  "<",
  ">",
  "#",
  "+",
  "=",
  "-",
  ".",
  ")",
  "!",
  "~",
  "|",
]);

const isWordCharacter = (character: string | undefined): boolean =>
  character !== undefined && /[\p{L}\p{N}]/u.test(character);

interface InlineCursor {
  readonly source: string;
  index: number;
}

const readDelimiterRun = (source: string, index: number): number => {
  const character = source[index]!;
  let end = index;
  while (source[end] === character) end += 1;
  return end - index;
};

/**
 * A closing run of `marker` that is a real closer rather than the middle of a
 * word. `_` is intraword-inert in GFM (`snake_case_name` is not emphasis) and
 * `*` is not; both are handled by refusing an underscore run flanked by word
 * characters on both sides.
 */
const findClosing = (
  source: string,
  from: number,
  marker: string,
  length: number,
): number => {
  const run = marker.repeat(length);
  let index = from;
  while (index < source.length) {
    const found = source.indexOf(run, index);
    if (found === -1) return -1;
    if (source[found - 1] === "\\") {
      index = found + 1;
      continue;
    }
    if (readDelimiterRun(source, found) !== length) {
      index = found + readDelimiterRun(source, found);
      continue;
    }
    if (
      marker === "_" &&
      isWordCharacter(source[found - 1]) &&
      isWordCharacter(source[found + length])
    ) {
      index = found + length;
      continue;
    }
    return found;
  }
  return -1;
};

const parseWikilink = (
  cursor: InlineCursor,
  state: ParseState,
  embed: boolean,
): MarkdownImportNode[] | undefined => {
  const start = cursor.index;
  const open = embed ? start + 3 : start + 2;
  const close = cursor.source.indexOf("]]", open);
  if (close === -1) return undefined;
  const inner = cursor.source.slice(open, close);
  if (inner.includes("[[") || inner.includes("\n")) return undefined;
  const raw = cursor.source.slice(start, close + 2);
  cursor.index = close + 2;
  if (embed) {
    // TRANSCLUSION HAS NO NODE KIND and would need a second sort of note→note
    // edge on top of the reference one. It stays as the characters that were
    // written, which is the only form that loses nothing.
    state.counts.embed += 1;
    return [text(raw)];
  }
  const [namePart, ...aliasParts] = inner.split("|");
  const alias = aliasParts.join("|").trim();
  const target = (namePart ?? "")
    .split("#")[0]!
    .split("^")[0]!
    .trim()
    .replace(/\.md$/iu, "");
  if (target.length === 0) return [text(raw)];
  if (inner.includes("^")) state.counts.blockReference += 1;
  const link: MarkdownImportWikilink = {
    target,
    ...(alias.length > 0 ? { alias } : {}),
    raw,
  };
  state.wikilinks.push(link);
  return [{ type: "wikilink", wikilink: link }];
};

/**
 * One line's inline content.
 *
 * Hand-written rather than regex-driven because the precedence matters and a
 * regex alternation cannot express it: a code span wins over everything inside
 * it, an escape wins over the character it hides, and a wikilink wins over the
 * single brackets a markdown link would use.
 */
const parseInline = (
  source: string,
  state: ParseState,
): readonly MarkdownImportNode[] => {
  const nodes: MarkdownImportNode[] = [];
  let buffer = "";
  const flush = (): void => {
    if (buffer.length > 0) {
      nodes.push(text(buffer));
      buffer = "";
    }
  };
  const push = (produced: readonly MarkdownImportNode[]): void => {
    flush();
    nodes.push(...produced);
  };
  const cursor: InlineCursor = { source, index: 0 };
  while (cursor.index < source.length) {
    const character = source[cursor.index]!;
    const rest = source.slice(cursor.index);

    if (character === "\\") {
      const next = source[cursor.index + 1];
      if (next === undefined) {
        buffer += "\\";
        cursor.index += 1;
        continue;
      }
      // A backslash before a newline is the serialiser's own hard break.
      if (next === "\n") {
        push([{ type: "hardBreak" }]);
        cursor.index += 2;
        continue;
      }
      buffer += UNESCAPABLE.has(next) ? next : `\\${next}`;
      cursor.index += 2;
      continue;
    }

    if (character === "`") {
      const length = readDelimiterRun(source, cursor.index);
      const closing = source.indexOf("`".repeat(length), cursor.index + length);
      if (
        closing !== -1 &&
        readDelimiterRun(source, closing) === length &&
        closing > cursor.index + length
      ) {
        const raw = source.slice(cursor.index + length, closing);
        // One space of padding on each side is the fence's own, not the
        // author's: it is what lets a span hold a backtick at its edge.
        const value =
          raw.startsWith(" ") && raw.endsWith(" ") && raw.trim().length > 0
            ? raw.slice(1, -1)
            : raw;
        push([codeSpan(value)]);
        cursor.index = closing + length;
        continue;
      }
      buffer += "`".repeat(length);
      cursor.index += length;
      continue;
    }

    if (rest.startsWith("![[")) {
      const produced = parseWikilink(cursor, state, true);
      if (produced !== undefined) {
        push(produced);
        continue;
      }
    }
    if (rest.startsWith("[[")) {
      const produced = parseWikilink(cursor, state, false);
      if (produced !== undefined) {
        push(produced);
        continue;
      }
    }

    if (rest.startsWith("![")) {
      const parsed = readLinkLike(source, cursor.index + 1);
      if (parsed !== undefined) {
        // AN IMAGE NODE NAMES AN ATTACHMENT ALREADY CUSTODIED HERE, by uuid.
        // A path into somebody's vault is not that, and inventing a source id
        // would produce a picture that renders as a hole forever. The markdown
        // stays as written, so the file it names is still findable by hand.
        state.counts.imageLink += 1;
        push([text(source.slice(cursor.index, parsed.end))]);
        cursor.index = parsed.end;
        continue;
      }
    }

    if (character === "[") {
      const parsed = readLinkLike(source, cursor.index);
      if (parsed !== undefined) {
        if (isStorableHref(parsed.destination)) {
          push(
            withMark(parseInline(parsed.label, state), {
              type: "link",
              attrs: { href: parsed.destination },
            }),
          );
        } else {
          // `assertLink` refuses anything but http, https and mailto BY
          // THROWING, which loses the whole note rather than the link. A
          // vault-relative destination is the ordinary case, so it is kept as
          // text and counted.
          state.counts.relativeLink += 1;
          push([text(source.slice(cursor.index, parsed.end))]);
        }
        cursor.index = parsed.end;
        continue;
      }
    }

    if (character === "<") {
      const closing = source.indexOf(">", cursor.index + 1);
      const inner =
        closing === -1 ? undefined : source.slice(cursor.index + 1, closing);
      if (inner !== undefined && /^u>/iu.test(`${inner}>`) === false) {
        if (isStorableHref(inner)) {
          push(
            withMark([text(inner)], {
              type: "link",
              attrs: { href: inner },
            }),
          );
          cursor.index = closing + 1;
          continue;
        }
      }
      // `<u>` is what the serialiser writes for underline, GFM having no form
      // for it. Reading it back is the other half of that round trip.
      const underline = /^<u>([\s\S]*?)<\/u>/iu.exec(rest);
      if (underline !== null) {
        push(
          withMark(parseInline(underline[1] ?? "", state), {
            type: "underline",
          }),
        );
        cursor.index += underline[0].length;
        continue;
      }
      buffer += character;
      cursor.index += 1;
      continue;
    }

    if (character === "~" && rest.startsWith("~~")) {
      const closing = findClosing(source, cursor.index + 2, "~", 2);
      if (closing !== -1) {
        push(
          withMark(
            parseInline(source.slice(cursor.index + 2, closing), state),
            {
              type: "strike",
            },
          ),
        );
        cursor.index = closing + 2;
        continue;
      }
    }

    if (character === "*" || character === "_") {
      const length = readDelimiterRun(source, cursor.index);
      // Two markers is bold, one is italic, and three is both — the serialiser
      // writes `***` for a run carrying each.
      const wanted = length >= 2 ? 2 : 1;
      const closing = findClosing(
        source,
        cursor.index + wanted,
        character,
        wanted,
      );
      const intraword =
        character === "_" && isWordCharacter(source[cursor.index - 1]);
      if (closing !== -1 && closing > cursor.index + wanted && !intraword) {
        push(
          withMark(
            parseInline(source.slice(cursor.index + wanted, closing), state),
            { type: wanted === 2 ? "bold" : "italic" },
          ),
        );
        cursor.index = closing + wanted;
        continue;
      }
      buffer += character;
      cursor.index += 1;
      continue;
    }

    if (character === "#" && isTagStart(source, cursor.index)) {
      // A NOTE CARRIES NO TAGS. The hash is already text, so nothing has to
      // change for it to survive; it is counted so the person is told how much
      // of their filing system arrives as words rather than as structure.
      state.counts.tag += 1;
      buffer += character;
      cursor.index += 1;
      continue;
    }

    if (character === "\n") {
      // A newline inside one paragraph is a soft break in markdown and a
      // rendered space; the schema has no soft break, and `hardBreak` would
      // claim the author asked for one.
      buffer += " ";
      cursor.index += 1;
      continue;
    }

    buffer += character;
    cursor.index += 1;
  }
  flush();
  return nodes.filter(
    (node) => node.type !== "text" || (node.text ?? "").length > 0,
  );
};

const isTagStart = (source: string, index: number): boolean => {
  if (isWordCharacter(source[index - 1])) return false;
  const match = /^#[\p{L}\p{N}_/-]+/u.exec(source.slice(index));
  return match !== null && /[\p{L}_/-]/u.test(match[0].slice(1));
};

interface LinkLike {
  readonly label: string;
  readonly destination: string;
  readonly end: number;
}

/** `[label](destination)`, with nesting and `\)` handled. */
const readLinkLike = (source: string, start: number): LinkLike | undefined => {
  if (source[start] !== "[") return undefined;
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const character = source[index]!;
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
    if (character === "\n") return undefined;
    index += 1;
  }
  if (depth !== 0 || source[index] !== "]" || source[index + 1] !== "(")
    return undefined;
  const label = source.slice(start + 1, index);
  let cursor = index + 2;
  let destination = "";
  if (source[cursor] === "<") {
    const closing = source.indexOf(">", cursor + 1);
    if (closing === -1 || source[closing + 1] !== ")") return undefined;
    destination = source.slice(cursor + 1, closing);
    cursor = closing + 1;
  } else {
    let open = 1;
    while (cursor < source.length) {
      const character = source[cursor]!;
      if (character === "\\") {
        destination += source[cursor + 1] ?? "";
        cursor += 2;
        continue;
      }
      if (character === "(") open += 1;
      if (character === ")") {
        open -= 1;
        if (open === 0) break;
      }
      if (character === "\n") return undefined;
      destination += character;
      cursor += 1;
    }
    if (source[cursor] !== ")") return undefined;
  }
  return { label, destination: destination.trim(), end: cursor + 1 };
};

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const HEADING = /^(#{1,6})[ \t]+(.*)$/u;
const FENCE = /^([`~]{3,})[ \t]*([^`\s]*)[ \t]*$/u;
const THEMATIC = /^([*_])(?:[ \t]*\1){2,}[ \t]*$/u;
const BULLET = /^([-*+])[ \t]+(.*)$/u;
const ORDERED = /^(\d{1,9})([.)])[ \t]+(.*)$/u;
const QUOTE = /^>[ \t]?(.*)$/u;
const TABLE_DELIMITER =
  /^\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?$/u;
const CALLOUT = /^\[![^\]]*\]/u;
const SETEXT = /^(=+|-{2,})[ \t]*$/u;
const TASK_BOX = /^\[[ xX]\][ \t]+/u;

const indentWidth = (line: string): number => {
  let width = 0;
  for (const character of line) {
    if (character === " ") width += 1;
    else if (character === "\t") width += 4;
    else break;
  }
  return width;
};

const stripIndent = (line: string, width: number): string => {
  let removed = 0;
  let index = 0;
  while (index < line.length && removed < width) {
    if (line[index] === " ") removed += 1;
    else if (line[index] === "\t") removed += 4;
    else break;
    index += 1;
  }
  return line.slice(index);
};

const paragraph = (
  lines: readonly string[],
  state: ParseState,
): MarkdownImportNode[] => {
  const joined = lines.join("\n").trim();
  if (joined.length === 0) return [];
  const content = parseInline(joined, state);
  return content.length === 0 ? [] : [{ type: "paragraph", content }];
};

/**
 * A list item's blocks.
 *
 * `listItem` content is `paragraph block*` and `parseStructuredDocument`
 * refuses an item whose first child is anything else — so an item that opens
 * with a nested list gets an EMPTY paragraph in front rather than being
 * degraded or dropped. An empty paragraph is a legal, visible, zero-loss
 * placeholder; the alternative was a note the validator throws on, which is
 * the whole note gone for one bullet.
 */
const listItemContent = (
  lines: readonly string[],
  state: ParseState,
): MarkdownImportNode[] => {
  const blocks = parseBlocks(lines, state);
  if (blocks.length === 0) return [{ type: "paragraph" }];
  if (blocks[0]!.type !== "paragraph") {
    state.counts.listItemLead += 1;
    return [{ type: "paragraph" }, ...blocks];
  }
  return blocks;
};

const tableRow = (line: string): readonly string[] => {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/u, "").replace(/\|$/u, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index]!;
    if (character === "\\" && inner[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (character === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
};

const tableCell = (
  value: string,
  kind: "tableHeader" | "tableCell",
  state: ParseState,
): MarkdownImportNode => ({
  type: kind,
  // `<br>` is the only line break a GFM cell has, and the serialiser writes
  // exactly that; reading it back as a hard break closes the round trip.
  //
  // The optional backslash is BACKWARD COMPATIBILITY, and no longer a
  // workaround. `structuredDocumentToMarkdown` used to render a `hardBreak` as
  // `\` + newline and only then replace newlines inside a cell, so a hard break
  // in a table cell came out as `\<br>` — in which `\<` is a CommonMark escape,
  // and the tag rendered as the literal characters `<br>`. That defect is now
  // fixed at the source (`markdown.ts`, `hardBreak` renders `<br>` directly
  // when `inTableCell`), and reading the old spelling stays only so a file an
  // unreleased build already wrote still comes back whole.
  //
  // IT HAS A COST, AND THE COST IS NAMED RATHER THAN HIDDEN: a person who
  // deliberately escaped `<br>` in an incoming vault means the literal
  // characters, and this reads it as a line break. Narrowing it is a decision
  // about how long files written during this wave keep working.
  content: [
    {
      type: "paragraph",
      content: value
        .split(/\\?<br\s*\/?>/iu)
        .flatMap((part, index) =>
          index === 0
            ? parseInline(part, state)
            : [
                { type: "hardBreak" } as MarkdownImportNode,
                ...parseInline(part, state),
              ],
        ),
    },
  ],
});

const parseBlocks = (
  lines: readonly string[],
  state: ParseState,
): MarkdownImportNode[] => {
  const blocks: MarkdownImportNode[] = [];
  let index = 0;
  let pending: string[] = [];
  const flushParagraph = (): void => {
    if (pending.length > 0) {
      blocks.push(...paragraph(pending, state));
      pending = [];
    }
  };

  while (index < lines.length) {
    const line = lines[index]!;
    const bare = line.trimEnd();
    const indent = indentWidth(bare);
    const body = bare.slice(bare.length - bare.trimStart().length);

    if (bare.trim().length === 0) {
      flushParagraph();
      index += 1;
      continue;
    }

    // A fence opens even when indented; the closing fence is the same
    // character at the same length or longer.
    const fence = FENCE.exec(body);
    if (fence !== null && indent < 4) {
      flushParagraph();
      const marker = fence[1]!;
      const language = fence[2] ?? "";
      const code: string[] = [];
      index += 1;
      while (index < lines.length) {
        const current = lines[index]!;
        const closing = current.trimStart();
        if (
          closing.startsWith(marker[0]!) &&
          closing.replace(/[^`~]/gu, "").length >= marker.length &&
          closing.replace(
            new RegExp(`[^${marker[0] === "`" ? "`" : "~"}]`, "gu"),
            "",
          ).length === closing.length
        ) {
          index += 1;
          break;
        }
        code.push(stripIndent(current, indent));
        index += 1;
      }
      const value = code.join("\n");
      blocks.push({
        type: "codeBlock",
        // The validator caps a language at 80 characters and refuses a longer
        // one by throwing. An info string that long is not a language.
        ...(language.length > 0 && language.length <= 80
          ? { attrs: { language } }
          : {}),
        ...(value.length > 0 ? { content: [text(value)] } : {}),
      });
      continue;
    }

    const heading = HEADING.exec(body);
    if (heading !== null && indent < 4) {
      flushParagraph();
      blocks.push({
        type: "heading",
        attrs: { level: heading[1]!.length },
        content: parseInline(
          (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, ""),
          state,
        ),
      });
      index += 1;
      continue;
    }

    // `***` and `___` only. `---` is deliberately NOT a rule here: three
    // dashes directly under a paragraph is a setext heading, and the
    // serialiser writes `***` for exactly that reason.
    if (THEMATIC.test(body) && indent < 4) {
      flushParagraph();
      blocks.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    const setext = SETEXT.exec(body);
    if (setext !== null && pending.length > 0 && indent < 4) {
      const content = parseInline(pending.join("\n").trim(), state);
      pending = [];
      blocks.push({
        type: "heading",
        attrs: { level: setext[1]!.startsWith("=") ? 1 : 2 },
        content,
      });
      index += 1;
      continue;
    }
    // A dash rule with no paragraph above it is an ordinary thematic break.
    if (setext !== null && setext[1]!.startsWith("-") && indent < 4) {
      flushParagraph();
      blocks.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    const quote = QUOTE.exec(body);
    if (quote !== null && indent < 4) {
      flushParagraph();
      const inner: string[] = [];
      while (index < lines.length) {
        const current = lines[index]!.trimEnd();
        const match = QUOTE.exec(current.trimStart());
        if (match === null) {
          if (current.trim().length === 0) break;
          // A lazy continuation line belongs to the quote's own paragraph.
          if (inner.length === 0) break;
          inner.push(current.trim());
          index += 1;
          continue;
        }
        inner.push(match[1] ?? "");
        index += 1;
      }
      // A CALLOUT KEEPS ITS TYPE AS TEXT. `blockquote` has no attributes and
      // the validator throws on any, so `> [!warning]` cannot become a warning
      // — but turning it into an ordinary quote silently would lose the one
      // word that said what kind of aside it was.
      if (CALLOUT.test((inner[0] ?? "").trim())) state.counts.callout += 1;
      const content = parseBlocks(inner, state);
      blocks.push({
        type: "blockquote",
        content: content.length > 0 ? content : [{ type: "paragraph" }],
      });
      continue;
    }

    const bullet = BULLET.exec(body);
    const ordered = ORDERED.exec(body);
    if ((bullet !== null || ordered !== null) && indent < 4) {
      flushParagraph();
      blocks.push(
        ...[readList(lines, index, state)].flatMap((result) => {
          index = result.next;
          return [result.node];
        }),
      );
      continue;
    }

    // A table needs its delimiter row; without one a line of pipes is a
    // paragraph that happens to contain pipes.
    const next = lines[index + 1]?.trim() ?? "";
    if (
      bare.includes("|") &&
      TABLE_DELIMITER.test(next) &&
      next.includes("-") &&
      indent < 4
    ) {
      flushParagraph();
      const header = tableRow(bare);
      const rows: MarkdownImportNode[] = [
        {
          type: "tableRow",
          content: header.map((cell) => tableCell(cell, "tableHeader", state)),
        },
      ];
      index += 2;
      while (index < lines.length) {
        const current = lines[index]!.trimEnd();
        if (current.trim().length === 0 || !current.includes("|")) break;
        const cells = tableRow(current);
        rows.push({
          type: "tableRow",
          content: Array.from({ length: header.length }, (_, column) =>
            tableCell(cells[column] ?? "", "tableCell", state),
          ),
        });
        index += 1;
      }
      blocks.push({ type: "table", content: rows });
      continue;
    }

    pending.push(bare);
    index += 1;
  }
  flushParagraph();
  return blocks;
};

interface ListResult {
  readonly node: MarkdownImportNode;
  readonly next: number;
}

const readList = (
  lines: readonly string[],
  from: number,
  state: ParseState,
): ListResult => {
  const first = lines[from]!.trimEnd();
  const baseIndent = indentWidth(first);
  const ordered = ORDERED.exec(first.trimStart());
  const start = ordered === null ? 1 : Number(ordered[1]);
  const items: MarkdownImportNode[] = [];
  let index = from;
  let current: string[] | undefined;
  const closeItem = (): void => {
    if (current === undefined) return;
    items.push({ type: "listItem", content: listItemContent(current, state) });
    current = undefined;
  };
  while (index < lines.length) {
    const line = lines[index]!.trimEnd();
    if (line.trim().length === 0) {
      // A blank line inside a list is a paragraph break within the item; two
      // in a row end the list, as does anything less indented after one.
      const following = lines[index + 1]?.trimEnd() ?? "";
      if (following.trim().length === 0 || indentWidth(following) < baseIndent)
        break;
      current?.push("");
      index += 1;
      continue;
    }
    const indent = indentWidth(line);
    const body = line.trimStart();
    const isBullet = BULLET.test(body);
    const isOrdered = ORDERED.test(body);
    if (indent < baseIndent) break;
    if (indent === baseIndent && (isBullet || isOrdered)) {
      // A list changing marker family starts a new list, exactly as it renders.
      if ((ordered === null) !== (isOrdered === false)) break;
      closeItem();
      const marker = isOrdered
        ? ORDERED.exec(body)![3]!
        : BULLET.exec(body)![2]!;
      // `- [ ] something` is a task. Decision #18: a task in a note is a
      // REFERENCE to a real Task, so the box cannot become one — the
      // characters stay and the count says how many there were.
      if (TASK_BOX.test(marker)) state.counts.taskCheckbox += 1;
      current = [marker];
      index += 1;
      continue;
    }
    if (current === undefined) break;
    current.push(stripIndent(line, baseIndent + 2));
    index += 1;
  }
  closeItem();
  return {
    node:
      ordered === null
        ? { type: "bulletList", content: items }
        : {
            type: "orderedList",
            ...(start === 1 ? {} : { attrs: { start } }),
            content: items,
          },
    next: index,
  };
};

/**
 * Frontmatter, as it is found and as it is kept.
 *
 * There is no key/value store on a note — `fields` exists on `Project` and not
 * here — so nothing in the frontmatter can become structure. Recon called
 * silently discarding it a "will migrate WRONG", which is worse than not
 * migrating, and it is right: tags and aliases are how a person finds their
 * own writing. So it travels as a fenced `yaml` block at the top of the note:
 * visibly not structure, completely intact, and greppable.
 */
const splitFrontmatter = (
  markdown: string,
): { readonly frontmatter?: string; readonly body: string } => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(markdown);
  if (match === null) return { body: markdown };
  return { frontmatter: match[1] ?? "", body: markdown.slice(match[0].length) };
};

export const parseMarkdownImport = (markdown: string): MarkdownImportResult => {
  const state: ParseState = { counts: emptyCounts(), wikilinks: [] };
  const normalised = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const split = splitFrontmatter(normalised);
  const content: MarkdownImportNode[] = [];
  if (split.frontmatter !== undefined) {
    state.counts.frontmatter += 1;
    content.push({
      type: "codeBlock",
      attrs: { language: "yaml" },
      ...(split.frontmatter.length > 0
        ? { content: [text(split.frontmatter)] }
        : {}),
    });
  }
  content.push(...parseBlocks(split.body.split("\n"), state));
  // `doc` content is `block+` and an empty one is refused. An empty file is an
  // ordinary thing to find in a vault, so it becomes an empty paragraph — an
  // empty note — rather than a failure.
  if (content.length === 0) content.push({ type: "paragraph" });
  return {
    content,
    wikilinks: state.wikilinks,
    observed: state.counts,
  };
};

// ---------------------------------------------------------------------------
// Pass two — resolution
// ---------------------------------------------------------------------------

export type MarkdownImportResolution =
  | {
      readonly kind: "reference";
      readonly targetKind: string;
      readonly targetId: string;
    }
  | { readonly kind: "unresolved" };

export interface MarkdownImportResolved {
  readonly content: readonly StructuredDocumentNode[];
  readonly resolved: number;
  readonly unresolved: number;
}

/**
 * PASS TWO. A `[[link]]` cannot be resolved while the notes it points at do
 * not exist yet, and a vault is mostly forward references — so parsing stops
 * at a placeholder, every note is created, and only then does this run.
 *
 * AN UNRESOLVABLE LINK BECOMES THE TEXT THAT WAS WRITTEN, brackets and all.
 * Never a dangling id, which would render as a permanent hole; and never a
 * remembered title, which is what `model.ts:612-617` refuses to store because
 * a persisted label goes stale and can leak after revocation. The characters
 * came out of the person's own file, so keeping them invents nothing, loses
 * nothing, and stays re-importable the day the target does exist.
 */
export const resolveMarkdownImport = (
  content: readonly MarkdownImportNode[],
  resolve: (link: MarkdownImportWikilink) => MarkdownImportResolution,
): MarkdownImportResolved => {
  let resolved = 0;
  let unresolved = 0;
  const visit = (
    nodes: readonly MarkdownImportNode[],
  ): readonly StructuredDocumentNode[] =>
    nodes.flatMap((node): readonly StructuredDocumentNode[] => {
      if (node.type === "wikilink") {
        const link = node.wikilink;
        if (link === undefined) return [];
        const answer = resolve(link);
        if (answer.kind === "unresolved") {
          unresolved += 1;
          return [{ type: "text", text: link.raw }];
        }
        resolved += 1;
        return [
          {
            type: "entityReference",
            attrs: {
              targetKind: answer.targetKind,
              targetId: answer.targetId,
            },
          },
        ];
      }
      const kind = node.type;
      return [
        {
          type: kind,
          ...(node.attrs === undefined ? {} : { attrs: node.attrs }),
          ...(node.marks === undefined ? {} : { marks: node.marks }),
          ...(node.text === undefined ? {} : { text: node.text }),
          ...(node.content === undefined
            ? {}
            : { content: visit(node.content) }),
        },
      ];
    });
  return { content: visit(content), resolved, unresolved };
};
