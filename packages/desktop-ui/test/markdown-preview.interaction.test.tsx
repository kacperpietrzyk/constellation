import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, assert, beforeEach, describe, it } from "vitest";

import { workHarnessSnapshot } from "../src/dev/harness-snapshot.js";
import {
  libraryDocumentIds,
  libraryNoteState,
  librarySummaries,
} from "../src/dev/library-fixture.js";
import { KnowledgeEditor } from "../src/library/KnowledgeEditor.js";

/**
 * THE PER-NOTE MARKDOWN PREVIEW, ON THE SURFACE.
 *
 * The prototype's B25 matched `/markdown/i` somewhere on the screen, which a
 * button label satisfies while the export does not exist. This calls the real
 * toggle on the real editor, over the harness fixture's REAL Yjs bytes, and
 * reads the string it produced.
 *
 * What is asserted is what decision #17 is actually about: that a reference
 * comes out as its current name plus an id that survives a rename, that a code
 * block keeps the language it was written in, and that the surface SAYS which
 * one thing it does differently from the full export. A preview that lied by
 * omission would be worse than one that admits a limit.
 */

const spaceId = workHarnessSnapshot.bootstrap.spaces[0]!.id;
const taskId = "00000000-0000-4000-8000-0000000000c1";
const TASK_LABEL = "Potwierdź wariant recovery";

const documentItem = () => {
  const summary = librarySummaries().find(
    (item) => item.id === libraryDocumentIds.runbook,
  )!;
  return {
    id: summary.id,
    spaceId,
    title: summary.title,
    folderId: summary.folderId,
    role: summary.role,
    version: summary.version,
    updatedAt: summary.updatedAt,
  };
};

const client = {
  openDocument: async () => ({
    mode: "local" as const,
    state: libraryNoteState(taskId as never),
    pendingUpdateCount: 0,
    searchIndexState: "current" as const,
  }),
  persistDocumentUpdate: async () => ({ acknowledged: true }),
  acknowledgeDocumentUpdates: async () => undefined,
  listDocumentRevisions: async () => [],
  runQuery: async (envelope: unknown) => {
    const { queryName } = envelope as { readonly queryName: string };
    const projection =
      queryName === "document.linkCandidates"
        ? {
            kind: "document.linkCandidates",
            items: [
              { targetKind: "task", targetId: taskId, label: TASK_LABEL },
            ],
          }
        : queryName === "knowledge.documentContext"
          ? {
              kind: "knowledge.documentContext",
              document: {
                id: libraryDocumentIds.runbook,
                spaceId,
                title: documentItem().title,
                role: "note",
                version: 3,
                updatedAt: "2026-07-31T11:05:00.000Z",
              },
              evidence: [],
              namedVersions: [],
            }
          : undefined;
    return projection === undefined
      ? { kind: "query_rejected" }
      : {
          kind: "query_result",
          result: {
            outcome: "success",
            projection,
            freshness: { kind: "local_authoritative" },
          },
        };
  },
} as never;

let host: HTMLDivElement;
let root: Root;

const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(KnowledgeEditor, {
        client,
        document: documentItem() as never,
        snapshot: workHarnessSnapshot as never,
        inspectorHost: null,
        onEntityActivate: () => undefined,
        onReload: async () => undefined,
        onFailure: () => undefined,
      }),
    );
  });
  // Two flushes: the document opens, then its references resolve through
  // `document.linkCandidates` — the preview is only honest after the second.
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const toggle = (): HTMLButtonElement => {
  const button = host.querySelector<HTMLButtonElement>(
    "[data-document-markdown-toggle]",
  );
  assert.ok(button, "the note offers no way to see its markdown");
  return button;
};

const openPreview = async () => {
  await act(async () => {
    toggle().click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  const pre = host.querySelector("#document-markdown-preview pre");
  assert.ok(pre, "the preview opened with nothing in it");
  return pre.textContent ?? "";
};

beforeEach(() => {
  host = document.createElement("div");
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("the markdown a note exports", () => {
  it("names a reference by its current title and by an id a rename survives", async () => {
    await mount();
    const markdown = await openPreview();
    // The name is resolved at export time and never stored, so this is the
    // CURRENT title; the id is what makes the link outlive a rename.
    assert.ok(
      markdown.includes(`[${TASK_LABEL}](constellation://task/${taskId})`),
      markdown.slice(0, 400),
    );
  });

  it("keeps the language a code block was written in", async () => {
    await mount();
    const markdown = await openPreview();
    // The language is in the model (`codeBlock.attrs.language`) and only the
    // rendering was ever missing; a fence without it turns every code block in
    // the vault into plain text on the way out.
    assert.ok(markdown.includes("```bash\n"), markdown.slice(0, 400));
    assert.ok(
      markdown.includes("./bootstrap.sh --stage directory --read-back"),
    );
  });

  it("carries the note's identity and its headings out of the CRDT", async () => {
    await mount();
    const markdown = await openPreview();
    assert.ok(markdown.startsWith(`---\nid: ${libraryDocumentIds.runbook}\n`));
    assert.ok(
      markdown.includes(
        "# Runbook uruchomienia środowiska po stronie klienta\n",
      ),
    );
    assert.ok(markdown.includes("\n## Zanim cokolwiek ruszy\n"));
    // A list item is a list item and not a paragraph that starts with a dash.
    assert.ok(markdown.includes("\n- Potwierdzone okno serwisowe"));
  });

  it("states the one thing it does differently from the full export", async () => {
    await mount();
    await openPreview();
    const statement = host.querySelector(
      "#document-markdown-preview [data-markdown-preview-statement]",
    );
    assert.ok(statement, "the preview shows a limit it does not admit to");
    // The SHAPE, not a phrase: the sentence has to name the full export as the
    // thing that writes attachments out, because that is the difference. A
    // guard on exact words is the one this repository has already had to
    // rewrite three times.
    const text = (statement.textContent ?? "").toLowerCase();
    assert.ok(text.includes("attachment"), text);
    assert.ok(text.includes("export"), text);
    assert.ok(text.length > 40, text);
  });

  it("opens and closes from one control that says which it will do", async () => {
    await mount();
    assert.equal(toggle().getAttribute("aria-expanded"), "false");
    await openPreview();
    assert.equal(toggle().getAttribute("aria-expanded"), "true");
    await act(async () => {
      toggle().click();
    });
    assert.equal(
      host.querySelector("#document-markdown-preview"),
      null,
      "hiding the markdown left it on the screen",
    );
  });
});
