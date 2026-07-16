import type { ReactNode } from "react";

export const toPlainMeetingMarkdown = (value: string) =>
  value
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*+] |\d+[.)] )/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\[([^\]]+)]\((?:https:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const renderInlineMarkdown = (value: string): ReactNode[] => {
  const pattern =
    /(\[([^\]]+)]\((https:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index;
    if (index > offset) nodes.push(value.slice(offset, index));
    const key = `${index}-${match[0].length}`;
    if (match[2] !== undefined && match[3] !== undefined) {
      nodes.push(
        <a key={key} href={match[3]} target="_blank" rel="noreferrer">
          {match[2]}
        </a>,
      );
    } else if (match[4] !== undefined || match[5] !== undefined) {
      nodes.push(<strong key={key}>{match[4] ?? match[5]}</strong>);
    } else if (match[6] !== undefined) {
      nodes.push(<code key={key}>{match[6]}</code>);
    } else {
      nodes.push(<em key={key}>{match[7] ?? match[8]}</em>);
    }
    offset = index + match[0].length;
  }
  if (offset < value.length) nodes.push(value.slice(offset));
  return nodes;
};

const isMarkdownBlockStart = (line: string) =>
  /^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?|(?:-{3,}|\*{3,})\s*$)/.test(
    line,
  );

export const MeetingMarkdown = ({ value }: { readonly value: string }) => {
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
    const unordered = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    if (unordered !== null) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index]!.match(/^\s{0,3}[-*+]\s+(.+)$/);
        if (item === null) break;
        items.push(
          <li key={`unordered-${index}`}>{renderInlineMarkdown(item[1]!)}</li>,
        );
        index += 1;
      }
      blocks.push(<ul key={`unordered-list-${index}`}>{items}</ul>);
      continue;
    }
    const ordered = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
    if (ordered !== null) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index]!.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
        if (item === null) break;
        items.push(
          <li key={`ordered-${index}`}>{renderInlineMarkdown(item[1]!)}</li>,
        );
        index += 1;
      }
      blocks.push(<ol key={`ordered-list-${index}`}>{items}</ol>);
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
      !isMarkdownBlockStart(lines[index]!)
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
  return <div className="meeting-markdown">{blocks}</div>;
};
