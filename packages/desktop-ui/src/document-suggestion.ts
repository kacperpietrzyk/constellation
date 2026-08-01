import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import type { DocumentEntityTargetKind } from "@constellation/contracts";

/**
 * Inline `[[` and `@` at the caret.
 *
 * Hand-written on `@tiptap/pm` rather than `@tiptap/suggestion`, which is not a
 * dependency. The reason is not that the package is bad: both editors run
 * `Collaboration.configure` over a shared Yjs fragment with `undoRedo: false`,
 * and a third-party plugin's own history assumptions are exactly the kind of
 * thing that produces a defect nobody can attribute to either side.
 *
 * THE INTERACTION CONTRACT IS INVERTED FROM EVERY OTHER POPOVER IN THIS APP.
 * A help popover TAKES focus and Escape returns it. An inline suggestion list
 * must do the opposite: the caret stays in the document the whole time the list
 * is open, because the query is typed INTO the document. The moment anything in
 * the list takes focus, typing stops. That is the property to protect, and it
 * is asserted directly rather than by testing that some other element does not
 * have focus.
 */

export type DocumentSuggestionTrigger = "wiki" | "mention";

export interface DocumentSuggestionState {
  readonly trigger: DocumentSuggestionTrigger;
  /** Position of the first trigger character, so accepting can replace it. */
  readonly from: number;
  /** The caret. */
  readonly to: number;
  readonly query: string;
}

export interface DocumentSuggestionHandlers {
  readonly onChange: (state: DocumentSuggestionState | undefined) => void;
  /** Returns true when the list consumed the key. */
  readonly onKeyDown: (key: string) => boolean;
}

interface PluginState {
  readonly suggestion: DocumentSuggestionState | undefined;
  /** Trigger position the person dismissed, so Escape does not reopen. */
  readonly dismissedFrom: number | undefined;
}

// Long enough for a real title, short enough that an unclosed `[[` stops
// following the caret across a paragraph.
const MAX_QUERY_LENGTH = 60;

const suggestionKey = new PluginKey<PluginState>(
  "constellationDocumentSuggestion",
);

const matchAt = (state: EditorState): DocumentSuggestionState | undefined => {
  const { selection } = state;
  if (!selection.empty) return undefined;
  const { $from } = selection;
  // A code block is where somebody types `[[` and means `[[`.
  if ($from.parent.type.spec.code === true) return undefined;
  // The placeholder keeps one character per leaf node, so an entityReference
  // already in the paragraph does not shift every position after it.
  const before = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    "￼",
  );
  const blockStart = $from.start();
  const wiki = /\[\[([^[\]\n]*)$/u.exec(before);
  if (wiki?.[1] !== undefined && wiki[1].length <= MAX_QUERY_LENGTH)
    return {
      trigger: "wiki",
      from: blockStart + wiki.index,
      to: selection.from,
      query: wiki[1],
    };
  // `@` only at a word start, or every email address in a note opens a list.
  const mention = /(?:^|[\s([])@([^\s@[\]]*)$/u.exec(before);
  if (mention?.[1] !== undefined && mention[1].length <= MAX_QUERY_LENGTH)
    return {
      trigger: "mention",
      from: blockStart + before.length - mention[1].length - 1,
      to: selection.from,
      query: mention[1],
    };
  return undefined;
};

const NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "Enter",
  "Tab",
  "Escape",
]);

export const documentSuggestionState = (
  editor: Editor,
): DocumentSuggestionState | undefined =>
  suggestionKey.getState(editor.state)?.suggestion;

/**
 * `handlers` is a ref rather than a value because the list's answer to a key
 * depends on React state — which candidate is active — while the plugin is
 * built once, when the editor is.
 */
export const createDocumentSuggestion = (handlers: {
  current: DocumentSuggestionHandlers;
}) =>
  Extension.create({
    name: "constellationDocumentSuggestion",
    addProseMirrorPlugins() {
      return [
        new Plugin<PluginState>({
          key: suggestionKey,
          state: {
            init: () => ({ suggestion: undefined, dismissedFrom: undefined }),
            apply: (transaction, previous, _old, next) => {
              if (transaction.getMeta(suggestionKey) === "dismiss")
                return {
                  suggestion: undefined,
                  dismissedFrom: previous.suggestion?.from,
                };
              const suggestion = matchAt(next);
              // A dismissal survives until the caret leaves the trigger it was
              // dismissed at; otherwise Escape closes the list and the very
              // next keystroke reopens it at the same place.
              const dismissedFrom =
                suggestion === undefined ||
                suggestion.from !== previous.dismissedFrom
                  ? undefined
                  : previous.dismissedFrom;
              return {
                suggestion:
                  dismissedFrom === undefined ? suggestion : undefined,
                dismissedFrom,
              };
            },
          },
          view: () => ({
            update: (view, previous) => {
              const before = suggestionKey.getState(previous)?.suggestion;
              const after = suggestionKey.getState(view.state)?.suggestion;
              if (
                before?.from === after?.from &&
                before?.to === after?.to &&
                before?.query === after?.query
              )
                return;
              handlers.current.onChange(after);
            },
          }),
          props: {
            handleKeyDown: (view, event) => {
              if (
                suggestionKey.getState(view.state)?.suggestion === undefined ||
                !NAVIGATION_KEYS.has(event.key)
              )
                return false;
              if (event.key === "Escape") {
                view.dispatch(view.state.tr.setMeta(suggestionKey, "dismiss"));
                handlers.current.onChange(undefined);
                event.preventDefault();
                return true;
              }
              if (!handlers.current.onKeyDown(event.key)) return false;
              event.preventDefault();
              return true;
            },
            decorations: (state) => {
              const suggestion = suggestionKey.getState(state)?.suggestion;
              return suggestion === undefined
                ? DecorationSet.empty
                : DecorationSet.create(state.doc, [
                    Decoration.inline(suggestion.from, suggestion.to, {
                      class: "document-suggestion-trigger",
                    }),
                  ]);
            },
          },
        }),
      ];
    },
  });

/**
 * Replaces the trigger text with the reference node and a trailing space.
 * `.focus()` is what keeps the caret in the document after the list closes;
 * the person is mid-sentence.
 */
export const acceptDocumentSuggestion = (
  editor: Editor,
  range: { readonly from: number; readonly to: number },
  candidate: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  },
): void => {
  editor
    .chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, [
      {
        type: "entityReference",
        attrs: {
          targetKind: candidate.targetKind,
          targetId: candidate.targetId,
        },
      },
      { type: "text", text: " " },
    ])
    .run();
};
