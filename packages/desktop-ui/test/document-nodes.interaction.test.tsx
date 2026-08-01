import { StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";

import {
  ATTACHMENT_PROTOCOL_SCHEME,
  attachmentUrl,
} from "@constellation/contracts";

import { DOCUMENT_SCHEMA_EXTENSIONS } from "../src/document-editor-extensions.js";

/**
 * THAT THE TWO NEW KINDS ACTUALLY RENDER.
 *
 * `table` has NO human producer after this lot, by decision: half a table —
 * one that can be created and cannot grow a row — invites use and dead-ends
 * at the first thing anybody tries. Its producers are the Obsidian import and
 * agents through MCP.
 *
 * That makes this assertion load-bearing rather than incidental. "An agent
 * can write a table" is otherwise an INFERENCE from the validator accepting
 * one, and this repository has already shipped a capability that was built,
 * unreachable, and green — a fourth health state no fixture ever entered.
 * So the document below is exactly what an agent's `document_structured_write`
 * puts into the shared fragment, and what is asserted is the DOM.
 */

const SOURCE_ID = "c0000000-0000-4000-8000-000000000002";

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const cell = (kind: "tableCell" | "tableHeader", text: string) => ({
  type: kind,
  content: [paragraph(text)],
});

const AGENT_WRITTEN_DOCUMENT = {
  type: "doc",
  content: [
    paragraph("What the workshop settled:"),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            cell("tableHeader", "Budget"),
            cell("tableHeader", "Owner"),
          ],
        },
        {
          type: "tableRow",
          content: [cell("tableCell", "Deadline"), cell("tableCell", "Piotr")],
        },
      ],
    },
    {
      type: "image",
      attrs: { sourceId: SOURCE_ID, alt: "The whiteboard after the workshop" },
    },
  ],
};

let capturedEditor: Editor | undefined;

const Harness = () => {
  const editor = useEditor({
    extensions: DOCUMENT_SCHEMA_EXTENSIONS,
    immediatelyRender: false,
    content: AGENT_WRITTEN_DOCUMENT,
    editorProps: {
      attributes: { class: "document-canvas", role: "textbox" },
    },
  });
  useEffect(() => {
    capturedEditor = editor ?? undefined;
  }, [editor]);
  return <EditorContent editor={editor} className="document-editor-shell" />;
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  capturedEditor = undefined;
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
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("an agent-written document holding a table and an image", () => {
  it("mounted an editor at all", () => {
    // An empty measurement is an instrument failure, not a result: every
    // assertion below reads the DOM, and an editor that never mounted would
    // make "no wrong element is present" trivially true.
    assert.ok(capturedEditor !== undefined, "The editor never mounted.");
    expect(container.querySelector(".document-canvas")).not.toBe(null);
  });

  it("renders the table, with every cell's words in its own cell", () => {
    const table = container.querySelector("table");
    assert.ok(table !== null, "The agent's table did not render.");
    const headers = [...table.querySelectorAll("th")].map((cell) =>
      cell.textContent?.trim(),
    );
    const cells = [...table.querySelectorAll("td")].map((cell) =>
      cell.textContent?.trim(),
    );
    expect(headers).toEqual(["Budget", "Owner"]);
    expect(cells).toEqual(["Deadline", "Piotr"]);
    // Two rows, not one long one — the shape a tight join would have produced
    // everywhere else in this feature.
    expect(table.querySelectorAll("tr").length).toBe(2);
  });

  it("says out loud that the table may scroll sideways", () => {
    // The descendant-overflow sweep fails an element that scrolls
    // horizontally without declaring it. A table declares.
    expect(
      container
        .querySelector("table")
        ?.hasAttribute("data-scrolls-horizontally"),
    ).toBe(true);
  });

  it("renders the image against the attachment scheme, never a bare path", () => {
    const image = container.querySelector("img");
    assert.ok(image !== null, "The image node did not render an <img>.");
    expect(image.getAttribute("src")).toBe(attachmentUrl(SOURCE_ID));
    expect(
      image.getAttribute("src")?.startsWith(ATTACHMENT_PROTOCOL_SCHEME),
    ).toBe(true);
    // Alternative text reaches the DOM, which is the only thing about a
    // picture that a screen reader — or the search index — can use.
    expect(image.getAttribute("alt")).toBe("The whiteboard after the workshop");
  });

  it("gives the editor back exactly the content it was handed", () => {
    // Rendering is half of it. The other half is that opening the note and
    // closing it does not quietly rewrite what the agent wrote.
    expect(capturedEditor?.getJSON()).toEqual(AGENT_WRITTEN_DOCUMENT);
  });
});
