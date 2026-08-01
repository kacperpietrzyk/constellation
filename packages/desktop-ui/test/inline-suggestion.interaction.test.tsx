import { StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import {
  EntityReference,
  publishDocumentEntityLabels,
} from "../src/document-entity-reference.js";
import { documentSuggestionState } from "../src/document-suggestion.js";
import { useInlineSuggestions } from "../src/components/InlineSuggestions.js";

/**
 * THE ONE PROPERTY THIS WHOLE LOT EXISTS TO PROTECT.
 *
 * Every other popover in this app takes focus: Wave C's B46 established that a
 * help popover focuses itself and Escape gives focus back. An inline suggestion
 * list must do the OPPOSITE — the caret stays in the document the entire time
 * it is open, because the query is typed into the document. If anything in the
 * list takes focus, typing stops, and the affordance is a toolbar picker with
 * extra steps.
 *
 * Asserted POSITIVELY — `activeElement === the editor` and `view.hasFocus()`
 * and the document still changes when a further character is typed — never as
 * "some other element does not have focus". The negative form is the shape four
 * Wave C instrument defects took, and it passes on a list that was never
 * rendered at all.
 */

const CANDIDATES = [
  {
    targetKind: "document" as const,
    targetId: "11111111-1111-4111-8111-111111111111",
    label: "Northstar",
  },
  {
    targetKind: "organization" as const,
    targetId: "22222222-2222-4222-8222-222222222222",
    label: "Northstar",
  },
];

let requested: unknown[] = [];

const client = {
  runQuery: async (envelope: unknown) => {
    requested.push(envelope);
    const parameters = (
      envelope as { readonly parameters: { readonly targetKinds?: string[] } }
    ).parameters;
    const allowed = parameters.targetKinds;
    return {
      kind: "query_result",
      result: {
        outcome: "success",
        projection: {
          kind: "document.linkCandidates",
          items: CANDIDATES.filter(
            (candidate) =>
              allowed === undefined || allowed.includes(candidate.targetKind),
          ),
        },
        freshness: { kind: "local_authoritative" },
      },
    };
  },
} as never;

const snapshot = {
  bootstrap: { workspace: { id: "33333333-3333-4333-8333-333333333333" } },
} as never;

const spaceId = "44444444-4444-4444-8444-444444444444" as never;

let capturedEditor: Editor | undefined;

const Harness = () => {
  const suggestions = useInlineSuggestions({ client, snapshot, spaceId });
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      suggestions.extension,
      EntityReference,
    ],
    immediatelyRender: false,
    content: "<p></p>",
    editorProps: {
      attributes: { class: "document-canvas", role: "textbox" },
    },
  });
  useEffect(() => {
    suggestions.setEditor(editor);
    capturedEditor = editor ?? undefined;
  }, [editor, suggestions]);
  return (
    <div className="document-editor-frame" ref={suggestions.containerRef}>
      <EditorContent editor={editor} className="document-editor-shell" />
      {suggestions.panel}
    </div>
  );
};

let container: HTMLDivElement;
let root: Root;

const mount = async (): Promise<void> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/** Types into the document the way a person does: through the editor. */
const type = async (text: string): Promise<void> => {
  await act(async () => {
    capturedEditor?.commands.focus("end");
    capturedEditor?.commands.insertContent(text);
  });
};

/** A key press at the editor, where ProseMirror's own handler listens. */
const press = async (key: string): Promise<void> => {
  await act(async () => {
    capturedEditor?.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
};

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
};

const editorDom = (): HTMLElement => {
  const element = capturedEditor?.view.dom;
  assert(element instanceof HTMLElement, "The editor must be mounted.");
  return element;
};

const options = (): readonly HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('[role="option"]'),
];

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  requested = [];
  capturedEditor = undefined;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("inline [[ and @ at the caret", () => {
  it("keeps the caret in the document while the list is open", async () => {
    await mount();
    await type("[[");
    await settle();

    expect(documentSuggestionState(capturedEditor!)?.trigger).toBe("wiki");
    expect(options().length).toBeGreaterThan(0);
    // Positive form, both halves: the browser's focus AND ProseMirror's own.
    expect(document.activeElement).toBe(editorDom());
    expect(capturedEditor?.view.hasFocus()).toBe(true);

    // And the thing focus is FOR: typing still reaches the document and still
    // narrows the query. A list that stole focus would leave both frozen.
    await type("nor");
    await settle();
    expect(capturedEditor?.getText()).toContain("[[nor");
    expect(documentSuggestionState(capturedEditor!)?.query).toBe("nor");
    expect(document.activeElement).toBe(editorDom());
  });

  it("owns the arrow keys, Enter and Escape while it is open", async () => {
    await mount();
    await type("[[nor");
    await settle();
    const selected = () =>
      container.querySelector<HTMLElement>(".inline-suggestion-option.active")
        ?.textContent ?? "";

    expect(selected()).toContain("Document");
    await press("ArrowDown");
    // Two candidates share the label, so the KIND is what says the selection
    // moved. Asserting on the label alone would pass without moving.
    expect(selected()).toContain("Organization");
    await press("ArrowUp");
    expect(selected()).toContain("Document");

    await press("Enter");
    await settle();
    expect(JSON.stringify(capturedEditor?.getJSON())).toContain(
      CANDIDATES[0]!.targetId,
    );
    expect(document.activeElement).toBe(editorDom());
  });

  it("closes on Escape and does not reopen on the next keystroke", async () => {
    await mount();
    await type("[[nor");
    await settle();
    expect(options().length).toBeGreaterThan(0);

    await press("Escape");
    await settle();
    expect(options()).toHaveLength(0);
    // The caret never left, so Escape has nothing to give back — the contract
    // the help popover has and this one must not.
    expect(document.activeElement).toBe(editorDom());

    // Still inside the same `[[`. Without the dismissal surviving the next
    // transaction, one more character reopens the list Escape just closed.
    await type("t");
    await settle();
    expect(capturedEditor?.getText()).toContain("[[nort");
    expect(options()).toHaveLength(0);
  });

  it("shows the kind of every candidate as text", async () => {
    await mount();
    await type("[[");
    await settle();
    // Two candidates share the label "Northstar" — one note, one organization.
    // Without the kind in the row they are indistinguishable, and picking the
    // wrong one produces a link that looks right and points elsewhere.
    const rows = options().map((option) => option.textContent ?? "");
    expect(
      rows.some((row) => row.includes("Northstar") && row.includes("Document")),
    ).toBe(true);
    expect(
      rows.some(
        (row) => row.includes("Northstar") && row.includes("Organization"),
      ),
    ).toBe(true);
  });

  it("announces the active row without moving focus to it", async () => {
    await mount();
    await type("[[");
    await settle();
    const active = editorDom().getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(active ?? "")}`)).not.toBe(
      null,
    );
    expect(document.activeElement).toBe(editorDom());
  });

  it("refuses the focus a mouse press would otherwise take", async () => {
    await mount();
    await type("[[nor");
    await settle();
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      options()[0]?.dispatchEvent(press);
    });
    // The MECHANISM, not the effect, and the difference is the instrument's:
    // happy-dom does not move focus on a mouse press at all, so removing the
    // `preventDefault` changes nothing it can see. In a real browser the press
    // blurs the editor before the click ever runs and the caret is gone. This
    // is the strongest thing this environment can say about it; the effect
    // itself is checked by hand in the app.
    expect(press.defaultPrevented).toBe(true);
  });

  it("inserts the reference and returns the caret to the text", async () => {
    await mount();
    await type("[[nor");
    await settle();
    // Blurred first ON PURPOSE. With the editor already focused, an accept
    // path that forgot to refocus would look identical to one that refocuses,
    // and the assertion would pass on a defect.
    await act(async () => {
      editorDom().blur();
    });
    expect(document.activeElement).not.toBe(editorDom());
    await act(async () => {
      options()[0]?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      options()[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const json = JSON.stringify(capturedEditor?.getJSON());
    expect(json).toContain("entityReference");
    expect(json).toContain(CANDIDATES[0]!.targetId);
    // The RENDERED node, not the document. The node view resolves its label
    // from a module-level map that every publish CLEARS first, so a reference
    // inserted through a path that never publishes renders as
    // "Record unavailable" — present in the document, broken on the screen,
    // and `getJSON()` cannot tell the difference.
    const rendered = container.querySelector(".document-entity-reference");
    expect(rendered?.getAttribute("aria-label")).toContain(
      CANDIDATES[0]!.label,
    );
    expect(rendered?.getAttribute("aria-disabled")).toBe("false");

    // And it survives the surrounding surface republishing labels, which both
    // editors do whenever the set of references in the body changes. The
    // remembered label bridges one resolve cycle; the surface's re-derive is
    // what carries it after that, and a publish that does NOT know about the
    // new reference is exactly the state this used to render broken in.
    await act(async () => {
      publishDocumentEntityLabels(CANDIDATES);
    });
    expect(
      container
        .querySelector(".document-entity-reference")
        ?.getAttribute("aria-label"),
    ).toContain(CANDIDATES[0]!.label);
    // The trigger text is gone: it was replaced, not left behind.
    expect(capturedEditor?.getText()).not.toContain("[[");
    expect(document.activeElement).toBe(editorDom());
    expect(options()).toHaveLength(0);
  });

  it("scopes @ to records and [[ to everything", async () => {
    await mount();
    await type("@");
    await settle();
    const mention = requested.at(-1) as {
      readonly parameters: { readonly targetKinds?: readonly string[] };
    };
    expect(mention.parameters.targetKinds).toEqual([
      "task",
      "project",
      "person",
      "organization",
      "meeting",
    ]);
    expect(options().map((option) => option.textContent)).toHaveLength(1);

    await type(" [[");
    await settle();
    const wiki = requested.at(-1) as {
      readonly parameters: { readonly targetKinds?: readonly string[] };
    };
    expect(wiki.parameters.targetKinds).toBeUndefined();
    expect(options()).toHaveLength(2);
  });

  it("does not open on an address in the middle of a word", async () => {
    await mount();
    await type("write to kacper@example.com");
    await settle();
    expect(documentSuggestionState(capturedEditor!)).toBeUndefined();
    expect(options()).toHaveLength(0);
  });
});
