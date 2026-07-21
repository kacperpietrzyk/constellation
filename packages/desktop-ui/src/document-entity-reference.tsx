import { useSyncExternalStore } from "react";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

export type DocumentEntityTargetKind =
  "task" | "project" | "person" | "organization" | "meeting";

export interface DocumentEntityCandidate {
  readonly targetKind: DocumentEntityTargetKind;
  readonly targetId: string;
  readonly label: string;
}

export const DOCUMENT_ENTITY_ACTIVATE_EVENT =
  "constellation-document-entity-activate";

const labels = new Map<string, string>();
const listeners = new Set<() => void>();
const keyOf = (targetKind: string, targetId: string) =>
  `${targetKind}:${targetId}`;

export const publishDocumentEntityLabels = (
  candidates: readonly DocumentEntityCandidate[],
): void => {
  labels.clear();
  for (const candidate of candidates)
    labels.set(
      keyOf(candidate.targetKind, candidate.targetId),
      candidate.label,
    );
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const kindLabel: Record<DocumentEntityTargetKind, string> = {
  task: "Zadanie",
  project: "Projekt",
  person: "Osoba",
  organization: "Organizacja",
  meeting: "Spotkanie",
};

const EntityReferenceView = ({ node }: NodeViewProps) => {
  const targetKind = node.attrs.targetKind as DocumentEntityTargetKind;
  const targetId = node.attrs.targetId as string;
  const label = useSyncExternalStore(
    subscribe,
    () => labels.get(keyOf(targetKind, targetId)) ?? "Rekord niedostępny",
  );
  const available = label !== "Rekord niedostępny";
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
        available ? `${kindLabel[targetKind]}: ${label}` : "Rekord niedostępny"
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
      "Powiązany rekord",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EntityReferenceView);
  },
});
