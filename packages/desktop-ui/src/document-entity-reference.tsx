import { useSyncExternalStore } from "react";

import type { DocumentEntityTargetKind } from "@constellation/contracts";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

/**
 * Re-exported from the contract, not declared here. This module used to spell
 * the union out itself, and both editors and the workflow wrapper imported it
 * from HERE rather than from `@constellation/contracts` — so the three
 * `Record<DocumentEntityTargetKind, string>` copy maps in the renderer were
 * total over a private restatement. They read like exhaustiveness guards and
 * guarded nothing: an arm added to the contract reached none of them and `tsc`
 * stayed quiet. Now they are total over the real vocabulary and a new arm is a
 * compile error in all three.
 */
export type { DocumentEntityTargetKind } from "@constellation/contracts";

export interface DocumentEntityCandidate {
  readonly targetKind: DocumentEntityTargetKind;
  readonly targetId: string;
  readonly label: string;
}

export const DOCUMENT_ENTITY_ACTIVATE_EVENT =
  "constellation-document-entity-activate";

const labels = new Map<string, string>();
// A reference that was just inserted at the caret, kept separately because
// `publishDocumentEntityLabels` CLEARS the map above and the publisher's set is
// whatever the surrounding screen happens to have loaded — never "everything on
// screen". Without this layer an inline insertion renders "Record unavailable"
// the instant it lands: present in the document, broken on the screen, and
// invisible to any assertion that reads the document rather than the render.
//
// It is dropped by the next authoritative publish rather than kept, so a target
// that stops resolving cannot go on showing its old title for the rest of the
// session. Labels are deliberately not stored anywhere (`model.ts:612-617`);
// this is a bridge across one resolve cycle, not a cache.
const rememberedLabels = new Map<string, string>();
const listeners = new Set<() => void>();
const keyOf = (targetKind: string, targetId: string) =>
  `${targetKind}:${targetId}`;

export const publishDocumentEntityLabels = (
  candidates: readonly DocumentEntityCandidate[],
): void => {
  labels.clear();
  rememberedLabels.clear();
  for (const candidate of candidates)
    labels.set(
      keyOf(candidate.targetKind, candidate.targetId),
      candidate.label,
    );
  for (const listener of listeners) listener();
};

export const rememberDocumentEntityLabel = (
  candidate: DocumentEntityCandidate,
): void => {
  rememberedLabels.set(
    keyOf(candidate.targetKind, candidate.targetId),
    candidate.label,
  );
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * One copy map, shared. It is total over the CONTRACT union, so an arm added
 * upstream is a compile error here rather than a row that renders `undefined`.
 */
export const documentEntityKindCopy: Record<DocumentEntityTargetKind, string> =
  {
    task: "Task",
    project: "Project",
    person: "Person",
    organization: "Organization",
    meeting: "Meeting",
    document: "Document",
  };

const EntityReferenceView = ({ node }: NodeViewProps) => {
  const targetKind = node.attrs.targetKind as DocumentEntityTargetKind;
  const targetId = node.attrs.targetId as string;
  const label = useSyncExternalStore(
    subscribe,
    () =>
      labels.get(keyOf(targetKind, targetId)) ??
      rememberedLabels.get(keyOf(targetKind, targetId)) ??
      "Record unavailable",
  );
  const available = label !== "Record unavailable";
  const activate = () => {
    if (!available) return;
    window.dispatchEvent(
      new CustomEvent(DOCUMENT_ENTITY_ACTIVATE_EVENT, {
        detail: { targetKind, targetId },
      }),
    );
  };
  return (
    <NodeViewWrapper
      as="span"
      className={`document-entity-reference${available ? "" : " unavailable"}`}
      role="link"
      tabIndex={available ? 0 : -1}
      aria-disabled={!available}
      aria-label={
        available
          ? `${documentEntityKindCopy[targetKind]}: ${label}`
          : "Record unavailable"
      }
      data-target-kind={targetKind}
      data-target-id={targetId}
      onClick={activate}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate();
      }}
    >
      <span aria-hidden="true">@</span>
      {label}
    </NodeViewWrapper>
  );
};

export const EntityReference = Node.create({
  name: "entityReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetKind: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-kind"),
      },
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-id"),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-constellation-entity-reference]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-constellation-entity-reference": "",
      }),
      "Linked record",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EntityReferenceView);
  },
});
