import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

import {
  ATTACHMENT_PROTOCOL_SCHEME,
  SERVABLE_IMAGE_MEDIA_TYPES,
  attachmentUrl,
} from "@constellation/contracts";
import { MAX_IMAGE_ALT_LENGTH } from "@constellation/realtime-documents";

/**
 * The editor's side of `image` and `table`.
 *
 * Hand-written on `Node.create`, on the `EntityReference` precedent, rather
 * than pulled from `@tiptap/extension-image` and `@tiptap/extension-table`.
 * Two reasons, and the second is the real one:
 *
 * 1. Bytes. The lazy editor chunk is already 608 kB against a 700 kB ceiling
 *    and the whole-bundle ceiling has 129 kB of slack; `prosemirror-tables`
 *    and its editing plugin would spend a visible part of both for behaviour
 *    nothing in this wave produces.
 * 2. Parity. The validator's schema and the editor's schema are different
 *    objects in different packages, and this repo has already shipped a note
 *    that was permanently unreadable to every agent because they disagreed
 *    about ONE attribute of ONE node. A hand-written node is a node whose
 *    attributes are decided here, beside the assertion that holds the two
 *    schemas equal — an upstream default cannot move it.
 *
 * A table is READ-ONLY in the editor after this lot, and that is a decision,
 * not an omission: a table that can be created but cannot grow a row invites
 * use and dead-ends at the first thing anybody tries. Its producers are the
 * Obsidian import and agents through MCP, both of which write whole tables.
 */

const ImageView = ({ node }: NodeViewProps) => {
  const sourceId = String(node.attrs.sourceId ?? "");
  const alt = String(node.attrs.alt ?? "");
  return (
    <NodeViewWrapper as="figure" className="document-image">
      <img
        src={attachmentUrl(sourceId)}
        alt={alt}
        data-source-id={sourceId}
        draggable={false}
      />
      {/*
        An attachment that is no longer in custody renders as a named gap
        rather than a broken-image glyph: the resolver answers 404 and the
        browser's own `onError` is what turns the figure into words. Saying
        "this picture is not on this device" is a state; a torn icon is not.
      */}
      {alt === "" ? null : <figcaption>{alt}</figcaption>}
    </NodeViewWrapper>
  );
};

export const DocumentImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      sourceId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-source-id"),
      },
      alt: {
        default: "",
        parseHTML: (element) =>
          (element.getAttribute("alt") ?? "").slice(0, MAX_IMAGE_ALT_LENGTH),
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-source-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes), ["img", {}]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

export const DocumentTable = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,
  parseHTML() {
    return [{ tag: "table" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "table",
      mergeAttributes(HTMLAttributes, {
        // S2's descendant-overflow contract. A table wide enough to scroll
        // inside a 50 rem canvas is legitimate — three columns of prose will
        // do it — but it has to SAY so: an element with `overflow-x: auto`
        // and no declaration is an accidental scroll and fails the sweep.
        // The attribute name is `HORIZONTAL_SCROLL_ATTRIBUTE` in
        // `scripts/descendant-overflow.mjs`, and `document-image-path.test.ts`
        // holds this string equal to it rather than trusting the spelling.
        "data-scrolls-horizontally": "",
      }),
      ["tbody", 0],
    ];
  },
});

export const DocumentTableRow = Node.create({
  name: "tableRow",
  content: "(tableCell | tableHeader)+",
  parseHTML() {
    return [{ tag: "tr" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["tr", mergeAttributes(HTMLAttributes), 0];
  },
});

export const DocumentTableCell = Node.create({
  name: "tableCell",
  content: "paragraph block*",
  isolating: true,
  parseHTML() {
    return [{ tag: "td" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["td", mergeAttributes(HTMLAttributes), 0];
  },
});

export const DocumentTableHeader = Node.create({
  name: "tableHeader",
  content: "paragraph block*",
  isolating: true,
  parseHTML() {
    return [{ tag: "th" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["th", mergeAttributes(HTMLAttributes), 0];
  },
});

export { ATTACHMENT_PROTOCOL_SCHEME, SERVABLE_IMAGE_MEDIA_TYPES };
