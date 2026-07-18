import { memo, useMemo, type ReactNode } from "react";

export const toPlainMeetingMarkdown = (value: string) =>
  value
    .replace(/^\s{0,3}(?:`{3,}|~{3,}).*$/gm, "")
    .replace(/^\s{0,3}[|\s:-]*-{3,}[|\s:-]*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+] |\d+[.)] )/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/!\[([^\]]*)]\([^\s)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^\s)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const toMeetingResultPreview = (
  value: string,
  maxLength = 220,
): string => {
  const plain = toPlainMeetingMarkdown(value);
  if (plain.length <= maxLength) return plain;

  const safeLimit = Math.max(2, maxLength) - 1;
  const candidate = plain.slice(0, safeLimit);
  const wordBoundary = candidate.lastIndexOf(" ");
  const end =
    wordBoundary >= Math.floor(safeLimit * 0.7) ? wordBoundary : safeLimit;
  return `${candidate.slice(0, end).trimEnd()}…`;
};

// Imported content is untrusted: only plain web and mail schemes may become
// real links; anything else degrades to its visible text.
const sanitizeMarkdownHref = (value: string): string | undefined =>
  /^(?:https?:\/\/|mailto:)\S+$/i.test(value) ? value : undefined;

const renderInlineMarkdown = (value: string): ReactNode[] => {
  const pattern =
    /(!\[([^\]]*)]\(([^\s)]+)\)|\[([^\]]+)]\(([^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index;
    if (index > offset) nodes.push(value.slice(offset, index));
    const key = `${index}-${match[0].length}`;
    if (match[3] !== undefined) {
      // Image → degrade to a link carrying the alt text; never raw markup.
      const href = sanitizeMarkdownHref(match[3]);
      const alt =
        match[2] === undefined || match[2].trim() === "" ? "Obraz" : match[2];
      nodes.push(
        href === undefined ? (
          <span key={key}>{alt}</span>
        ) : (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {alt}
          </a>
        ),
      );
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const href = sanitizeMarkdownHref(match[5]);
      nodes.push(
        href === undefined ? (
          <span key={key}>{match[4]}</span>
        ) : (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {match[4]}
          </a>
        ),
      );
    } else if (match[6] !== undefined || match[7] !== undefined) {
      nodes.push(<strong key={key}>{match[6] ?? match[7]}</strong>);
    } else if (match[8] !== undefined) {
      nodes.push(<code key={key}>{match[8]}</code>);
    } else {
      nodes.push(<em key={key}>{match[9] ?? match[10]}</em>);
    }
    offset = index + match[0].length;
  }
  if (offset < value.length) nodes.push(value.slice(offset));
  return nodes;
};

const listItemPattern = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.+)$/;

const isMarkdownBlockStart = (line: string) =>
  /^\s{0,3}(?:#{1,6}\s+|>\s?|(?:-{3,}|\*{3,})\s*$|`{3,}|~{3,})/.test(line) ||
  listItemPattern.test(line);

const isTableSeparator = (line: string) =>
  /^\s{0,3}[|\s:-]+$/.test(line) && line.includes("-") && line.includes("|");

const splitTableRow = (line: string): string[] => {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
};

const isTableStart = (lines: readonly string[], index: number): boolean => {
  const line = lines[index]!;
  return (
    line.includes("|") &&
    index + 1 < lines.length &&
    isTableSeparator(lines[index + 1]!) &&
    splitTableRow(line).length > 1
  );
};

type ListEntry = {
  readonly level: number;
  readonly ordered: boolean;
  readonly content: string;
  readonly line: number;
};

const renderList = (
  entries: readonly ListEntry[],
  cursor: { value: number },
): ReactNode => {
  const first = entries[cursor.value]!;
  const level = first.level;
  const items: ReactNode[] = [];
  let current: { key: number; children: ReactNode[] } | undefined;
  const flush = () => {
    if (current !== undefined)
      items.push(<li key={`item-${current.key}`}>{current.children}</li>);
    current = undefined;
  };
  while (cursor.value < entries.length) {
    const entry = entries[cursor.value]!;
    if (entry.level < level) break;
    if (entry.level > level) {
      const nested = renderList(entries, cursor);
      if (current === undefined) items.push(nested);
      else current.children.push(nested);
      continue;
    }
    flush();
    current = {
      key: entry.line,
      children: [...renderInlineMarkdown(entry.content)],
    };
    cursor.value += 1;
  }
  flush();
  const key = `list-${first.line}`;
  return first.ordered ? (
    <ol key={key}>{items}</ol>
  ) : (
    <ul key={key}>{items}</ul>
  );
};

const parseMeetingMarkdown = (value: string): ReactNode[] => {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading !== null) {
      const content = renderInlineMarkdown(heading[2]!);
      blocks.push(
        heading[1]!.length <= 2 ? (
          <h4 key={`heading-${index}`}>{content}</h4>
        ) : (
          <h5 key={`heading-${index}`}>{content}</h5>
        ),
      );
      index += 1;
      continue;
    }
    if (/^\s{0,3}(?:-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})[^`~]*$/);
    if (fence !== null) {
      const marker = fence[1]![0]!;
      const size = fence[1]!.length;
      const code: string[] = [];
      index += 1;
      while (index < lines.length) {
        const closing = lines[index]!.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
        if (
          closing !== null &&
          closing[1]![0] === marker &&
          closing[1]!.length >= size
        ) {
          index += 1;
          break;
        }
        code.push(lines[index]!);
        index += 1;
      }
      blocks.push(
        <pre key={`code-${index}`}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    // Tables degrade to a labelled list: each row keeps its header context
    // without reproducing grid syntax on a reading surface.
    if (isTableStart(lines, index)) {
      const headers = splitTableRow(line);
      const framed = line.trim().startsWith("|");
      index += 2;
      const rows: ReactNode[] = [];
      while (index < lines.length) {
        const row = lines[index]!;
        if (row.trim().length === 0 || !row.includes("|")) break;
        // A row belongs to the table only while it keeps the table's own
        // shape; a following paragraph that merely contains "|" stays text.
        if (
          framed ? !row.trim().startsWith("|") : splitTableRow(row).length < 2
        )
          break;
        const cells = splitTableRow(row);
        rows.push(
          <li key={`table-row-${index}`}>
            {cells.map((cell, cellIndex) => (
              <span key={cellIndex}>
                {cellIndex > 0 ? " · " : ""}
                {headers[cellIndex] !== undefined &&
                headers[cellIndex] !== "" ? (
                  <strong>{`${headers[cellIndex]}: `}</strong>
                ) : null}
                {renderInlineMarkdown(cell)}
              </span>
            ))}
          </li>,
        );
        index += 1;
      }
      blocks.push(<ul key={`table-${index}`}>{rows}</ul>);
      continue;
    }
    if (listItemPattern.test(line)) {
      const entries: ListEntry[] = [];
      while (index < lines.length) {
        const item = lines[index]!.match(listItemPattern);
        if (item === null) break;
        entries.push({
          level: Math.floor(item[1]!.length / 2),
          ordered: item[3] !== undefined,
          content: item[4]!,
          line: index,
        });
        index += 1;
      }
      // A block may dedent below its first line's level; each renderList call
      // consumes one segment, so no entry is ever silently dropped.
      const cursor = { value: 0 };
      while (cursor.value < entries.length)
        blocks.push(renderList(entries, cursor));
      continue;
    }
    if (/^\s{0,3}>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index]!)) {
        quote.push(lines[index]!.replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {renderInlineMarkdown(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index]!.trim().length > 0 &&
      !isMarkdownBlockStart(lines[index]!) &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index]!.trim());
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>
        {renderInlineMarkdown(paragraph.join(" "))}
      </p>,
    );
  }
  return blocks;
};

// Transcripts run to thousands of lines; parse only when the source text
// changes and skip re-renders entirely while parent state (busy flags,
// notices) churns around the reading surface.
export const MeetingMarkdown = memo(({ value }: { readonly value: string }) => {
  const blocks = useMemo(() => parseMeetingMarkdown(value), [value]);
  return <div className="meeting-markdown">{blocks}</div>;
});

MeetingMarkdown.displayName = "MeetingMarkdown";
