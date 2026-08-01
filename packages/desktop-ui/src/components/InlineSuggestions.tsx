import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  DocumentEntityTargetKind,
  DocumentId,
  SpaceId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";
import type { Editor } from "@tiptap/react";

import {
  loadDocumentLinkCandidates,
  type DesktopSnapshot,
} from "../client/workflow.js";
import {
  documentEntityKindCopy,
  rememberDocumentEntityLabel,
  type DocumentEntityCandidate,
} from "../document-entity-reference.js";
import {
  acceptDocumentSuggestion,
  createDocumentSuggestion,
  type DocumentSuggestionHandlers,
  type DocumentSuggestionState,
  type DocumentSuggestionTrigger,
} from "../document-suggestion.js";

/**
 * The list `[[` and `@` open at the caret, and the query that feeds it.
 *
 * One hook used by both editors. `DocumentsSurface` and `ProjectRichBody` each
 * build their own extension array, and a feature that reaches only one of them
 * is a shape this repository has shipped before.
 *
 * Nothing here is focusable. The caret stays in the document while the list is
 * open — that is the whole point of an inline affordance, and it is the
 * opposite of the help-popover contract, which takes focus and gives it back on
 * Escape. Rows are plain `div`s, `onMouseDown` is prevented so a click cannot
 * move focus out of the editor, and there is no `autoFocus` anywhere.
 */

const RECORD_KINDS = [
  "task",
  "project",
  "person",
  "organization",
  "meeting",
] as const satisfies readonly DocumentEntityTargetKind[];

// `[[` is the superset: it reaches notes AND records, with notes ranked first.
// Kacper is migrating a vault whose every link is `[[`, and his fingers will
// type it for a note and for a client alike — a `[[` that cannot reach an
// organization throws away the one thing this has over Obsidian. `@` reads as
// a mention and keeps exactly the toolbar picker's scope, so nothing anybody
// already learned stops working.
const kindsForTrigger = (
  trigger: DocumentSuggestionTrigger,
): readonly DocumentEntityTargetKind[] | undefined =>
  trigger === "mention" ? RECORD_KINDS : undefined;

const triggerCopy: Record<DocumentSuggestionTrigger, string> = {
  wiki: "Link a note or record",
  mention: "Mention a record",
};

export interface InlineSuggestions {
  /** Goes into the editor's extension array. */
  readonly extension: ReturnType<typeof createDocumentSuggestion>;
  readonly setEditor: (editor: Editor | null | undefined) => void;
  /** Wrap the editor in this; the list is positioned against it. */
  readonly containerRef: (node: HTMLDivElement | null) => void;
  readonly panel: React.ReactNode;
}

export const useInlineSuggestions = ({
  client,
  snapshot,
  spaceId,
  excludeDocumentId,
  disabled = false,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly spaceId: SpaceId;
  readonly excludeDocumentId?: DocumentId;
  readonly disabled?: boolean;
}): InlineSuggestions => {
  const listId = useId();
  const [suggestion, setSuggestion] = useState<DocumentSuggestionState>();
  const [candidates, setCandidates] = useState<
    readonly DocumentEntityCandidate[]
  >([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{
    readonly top: number;
    readonly left: number;
  }>();
  const editorRef = useRef<Editor>(undefined);
  const containerElement = useRef<HTMLDivElement | null>(null);
  const handlers = useRef<DocumentSuggestionHandlers>({
    onChange: () => undefined,
    onKeyDown: () => false,
  });
  const extension = useMemo(() => createDocumentSuggestion(handlers), []);

  const open = suggestion !== undefined && !disabled;

  const accept = useCallback((candidate: DocumentEntityCandidate) => {
    const editor = editorRef.current;
    const range = suggestionRef.current;
    if (editor === undefined || range === undefined) return;
    acceptDocumentSuggestion(editor, range, candidate);
    // The node view reads its label from a shared store, not from the node, so
    // the reference renders as unavailable until something publishes it.
    rememberDocumentEntityLabel(candidate);
    setSuggestion(undefined);
    setCandidates([]);
  }, []);

  // The plugin runs inside ProseMirror's key handling, so it needs the CURRENT
  // candidate list and index, not the ones captured when the editor was built.
  const suggestionRef = useRef<DocumentSuggestionState>(undefined);
  suggestionRef.current = suggestion;
  useEffect(() => {
    handlers.current = {
      onChange: (next) => {
        setSuggestion(next);
        if (next === undefined) setCandidates([]);
      },
      onKeyDown: (key) => {
        if (disabled) return false;
        if (key === "ArrowDown" || key === "ArrowUp") {
          if (candidates.length === 0) return true;
          const direction = key === "ArrowDown" ? 1 : -1;
          setActiveIndex(
            (current) =>
              (current + direction + candidates.length) % candidates.length,
          );
          return true;
        }
        if (key !== "Enter" && key !== "Tab") return false;
        const candidate = candidates[activeIndex];
        if (candidate === undefined) return false;
        accept(candidate);
        return true;
      },
    };
  }, [accept, activeIndex, candidates, disabled]);

  useEffect(() => setActiveIndex(0), [candidates]);

  useEffect(() => {
    if (!open || client === undefined || suggestion === undefined) return;
    const timer = window.setTimeout(() => {
      const kinds = kindsForTrigger(suggestion.trigger);
      void loadDocumentLinkCandidates(client, snapshot, spaceId, {
        text: suggestion.query,
        ...(kinds === undefined ? {} : { targetKinds: kinds }),
        ...(excludeDocumentId === undefined ? {} : { excludeDocumentId }),
      })
        .then((projection) => setCandidates(projection.items))
        .catch(() => setCandidates([]));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    client,
    excludeDocumentId,
    open,
    snapshot,
    spaceId,
    suggestion?.query,
    suggestion?.trigger,
    suggestion,
  ]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    const container = containerElement.current;
    if (!open || editor === undefined || container === null) {
      setPosition(undefined);
      return;
    }
    // `coordsAtPos` throws when the position is not laid out yet — a
    // reconnect, a restored revision, the first frame. The list is still the
    // right thing to show; only its offset is unknown, so it falls back to the
    // top of the frame rather than disappearing.
    let caret: { readonly bottom: number; readonly left: number };
    try {
      caret = editor.view.coordsAtPos(suggestion.from);
    } catch {
      setPosition({ top: 0, left: 0 });
      return;
    }
    const box = container.getBoundingClientRect();
    setPosition({
      top: caret.bottom - box.top + 4,
      left: Math.max(0, caret.left - box.left),
    });
  }, [open, suggestion]);

  // `aria-activedescendant` on the editor is what tells a screen reader which
  // row is current WITHOUT moving focus, which is the only way to announce a
  // list while the caret stays in the text.
  useEffect(() => {
    const element = editorRef.current?.view.dom;
    if (element === undefined) return;
    const activeId =
      open && candidates[activeIndex] !== undefined
        ? `${listId}-${activeIndex}`
        : undefined;
    if (activeId === undefined) {
      element.removeAttribute("aria-activedescendant");
      element.removeAttribute("aria-controls");
    } else {
      element.setAttribute("aria-activedescendant", activeId);
      element.setAttribute("aria-controls", listId);
    }
    return () => {
      element.removeAttribute("aria-activedescendant");
      element.removeAttribute("aria-controls");
    };
  }, [activeIndex, candidates, listId, open]);

  const setEditor = useCallback((editor: Editor | null | undefined) => {
    editorRef.current = editor ?? undefined;
  }, []);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElement.current = node;
  }, []);

  const panel =
    !open || position === undefined ? null : (
      <div
        className="inline-suggestion-panel"
        style={{ top: position.top, left: position.left }}
      >
        <div
          id={listId}
          role="listbox"
          aria-label={triggerCopy[suggestion.trigger]}
        >
          {candidates.length === 0 ? (
            <p className="inline-suggestion-empty">Nothing matches yet.</p>
          ) : (
            candidates.map((candidate, index) => (
              <div
                id={`${listId}-${index}`}
                key={`${candidate.targetKind}:${candidate.targetId}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`inline-suggestion-option${index === activeIndex ? " active" : ""}`}
                onMouseDown={(event) => {
                  // Without this the click moves focus out of the editor
                  // before the insertion runs, and the caret is gone.
                  event.preventDefault();
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => accept(candidate)}
              >
                <span className="inline-suggestion-label">
                  {candidate.label}
                </span>
                {/* The kind is TEXT, not a colour or an icon. `[[` spans notes
                    and records, so a note called Northstar and an organization
                    called Northstar are two targets with one label, and picking
                    the wrong one is silent. */}
                <span className="inline-suggestion-kind">
                  {documentEntityKindCopy[candidate.targetKind]}
                </span>
              </div>
            ))
          )}
        </div>
        <p role="status" className="sr-only">
          {candidates.length === 0
            ? "No matches."
            : `${candidates.length} matches. Arrow keys to choose, Enter to insert, Escape to dismiss.`}
        </p>
      </div>
    );

  return { extension, setEditor, containerRef, panel };
};
