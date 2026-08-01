import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  DocumentIdSchema,
  FolderIdSchema,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type { DesktopSnapshot } from "../src/client/workflow.js";
import { workHarnessSnapshot } from "../src/dev/harness-snapshot.js";
import { NotesReading } from "../src/library/NotesReading.js";

/* THE NOTES SCREEN — decision #30, and the assertions that carry it.
 *
 * The prototype's own checks for this decision are decoration, and were ruled
 * so before a line of this existed: its B34 is a type check on invented data
 * that never exercises a move, its B35 compares a NOTE count against a
 * CHILD-FOLDER count — unlike things, so it passes trivially — and its B36
 * checks that SOME attached note is on screen, which cannot fail while others
 * are missing.
 *
 * What is asserted here is what the SCREEN does with the read. The kernel side
 * of the same decision (a move command's before/after membership, the roll-up
 * equation over the projection) is `testkit/test/folders.conformance.test.ts`
 * and is deliberately not repeated: two copies of one property drift, and the
 * copy nobody reads is the one that stops being true.
 *
 * THE FIXTURE IS HAND-WRITTEN, BOTH COUNTERS INCLUDED, and that is the point.
 * Deriving `noteCount` here from the document list would compare one traversal
 * against itself and pass forever. Written out, the equation below is a real
 * check — and the tree it describes has a node whose two counters DIFFER
 * (`Klienci`: no notes of its own, five below it), which is the only shape in
 * which rendering the wrong field is visible at all.
 *
 * Every assertion in this file was verified BY BREAKING IT.
 */

const folderId = (suffix: string) =>
  FolderIdSchema.parse(`00000000-0000-4000-8000-0000000031${suffix}`);
const noteId = (suffix: string) =>
  DocumentIdSchema.parse(`00000000-0000-4000-8000-0000000032${suffix}`);

const folders = {
  clients: folderId("01"),
  orbit: folderId("02"),
  rollout: folderId("03"),
  acceptance: folderId("04"),
  policies: folderId("05"),
} as const;

const notes = {
  // `Klienci / Orbit / Wdrożenie / Odbiór` — four levels, notes on three of
  // them, plus a second root and one note outside the tree entirely.
  rollout: noteId("01"),
  acceptance: noteId("02"),
  orbit: noteId("03"),
  policy: noteId("04"),
  attached: noteId("05"),
  loose: noteId("06"),
} as const;

const spaceId = workHarnessSnapshot.bootstrap.spaces[0]!.id;

/**
 * The task and project two notes name. `Wdrożenie` names both, which is the
 * only shape that exercises the rotation: a note read under TWO headings.
 */
interface ReferenceShape {
  readonly targetKind: "task" | "project";
  readonly targetId: string;
  readonly label: string;
}

const taskTarget: ReferenceShape = {
  targetKind: "task",
  targetId: "00000000-0000-4000-8000-000000003301",
  label: "Confirm the egress rules",
};
const projectTarget: ReferenceShape = {
  targetKind: "project",
  targetId: "00000000-0000-4000-8000-000000003302",
  label: "Orbit onboarding",
};

interface NoteShape {
  readonly id: string;
  readonly title: string;
  readonly folderId?: string;
  readonly references: readonly ReferenceShape[];
  readonly updatedAt: string;
}

const noteShapes: readonly NoteShape[] = [
  {
    id: notes.rollout,
    title: "Rollout runbook",
    folderId: folders.rollout,
    references: [taskTarget, projectTarget],
    updatedAt: "2026-07-31T09:00:00.000Z",
  },
  {
    id: notes.acceptance,
    title: "Acceptance criteria",
    folderId: folders.acceptance,
    references: [],
    updatedAt: "2026-07-30T09:00:00.000Z",
  },
  {
    id: notes.orbit,
    title: "Identity model",
    folderId: folders.orbit,
    references: [taskTarget],
    updatedAt: "2026-07-29T09:00:00.000Z",
  },
  {
    id: notes.policy,
    title: "Retention policy",
    folderId: folders.policies,
    references: [],
    updatedAt: "2026-07-28T09:00:00.000Z",
  },
  {
    // ATTACHED TO A PROJECT, and listed beside the loose ones. #30's second
    // hard requirement: Notes is the whole library, not a leftovers box.
    id: notes.attached,
    title: "Delivery plan for Orbit onboarding",
    folderId: folders.orbit,
    references: [projectTarget],
    updatedAt: "2026-07-27T09:00:00.000Z",
  },
  {
    id: notes.loose,
    title: "Machine inventory",
    references: [],
    updatedAt: "2026-07-26T09:00:00.000Z",
  },
];

/** Hand-written on purpose — see the header. */
const folderShapes = [
  {
    id: folders.clients,
    name: "Klienci",
    ownNoteCount: 0,
    noteCount: 4,
  },
  {
    id: folders.orbit,
    name: "Orbit",
    parentFolderId: folders.clients,
    ownNoteCount: 2,
    noteCount: 4,
  },
  {
    id: folders.rollout,
    name: "Wdrożenie",
    parentFolderId: folders.orbit,
    ownNoteCount: 1,
    noteCount: 2,
  },
  {
    id: folders.acceptance,
    name: "Odbiór",
    parentFolderId: folders.rollout,
    ownNoteCount: 1,
    noteCount: 1,
  },
  { id: folders.policies, name: "Polityki", ownNoteCount: 1, noteCount: 1 },
] as const;

const snapshotWith = (shapes: readonly NoteShape[]): DesktopSnapshot =>
  ({
    ...workHarnessSnapshot,
    documents: {
      kind: "ready",
      data: {
        kind: "document.list",
        items: shapes.map((shape) => ({
          id: shape.id,
          spaceId,
          title: shape.title,
          ...(shape.folderId === undefined ? {} : { folderId: shape.folderId }),
          role: "note",
          version: 3,
          updatedAt: shape.updatedAt,
        })),
      },
    },
    knowledge: {
      kind: "ready",
      data: {
        kind: "knowledge.list",
        spaceId,
        sources: [],
        folders: folderShapes.map((folder) => ({
          ...folder,
          version: 1,
          updatedAt: "2026-07-31T09:00:00.000Z",
        })),
        documents: shapes.map((shape) => ({
          id: shape.id,
          title: shape.title,
          ...(shape.folderId === undefined ? {} : { folderId: shape.folderId }),
          role: "note",
          references: shape.references,
          evidenceCount: 0,
          namedVersionCount: 0,
          staleEvidence: false,
          version: 3,
          updatedAt: shape.updatedAt,
        })),
      },
    },
  }) as unknown as DesktopSnapshot;

/* The editor mounts in the reading pane, so the stub has to answer the calls it
 * makes on the bridge. They are answered with "nothing yet" rather than
 * mocked-out behaviour: this file asserts what the SCREEN does, and a document
 * session that half-works would put failures from another surface in here. */
const recordingClient = (
  sent: CommandEnvelope[],
): ConstellationRendererClient =>
  ({
    openDocument: async () => ({
      kind: "unavailable" as const,
      message: "No document session in this suite.",
    }),
    persistDocumentUpdate: async () => undefined,
    acknowledgeDocumentUpdates: async () => undefined,
    listDocumentRevisions: async () => [],
    executeQuery: async () => ({
      kind: "query_rejected" as const,
      diagnosticCode: "authorization.denied",
    }),
    executeCommand: async (command: CommandEnvelope) => {
      sent.push(command);
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: "2026-08-01T12:00:00.000Z",
          outcome: "success",
          diagnosticCode: "accepted",
          affected: [],
          auditReceiptId: "90000000-0000-4000-8000-000000000009",
          projection: {
            kind: "document.folder_changed",
            documentId: (command.payload as { documentId: string }).documentId,
            version: 4,
          },
        },
      };
    },
  }) as unknown as ConstellationRendererClient;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  globalThis.localStorage?.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (
  snapshot: DesktopSnapshot,
  client?: ConstellationRendererClient,
) => {
  act(() => {
    root.render(
      createElement(NotesReading, {
        client,
        snapshot,
        inspectorHost: null,
        onInspectorOpen: () => undefined,
        onEntityActivate: () => undefined,
        onReload: async () => undefined,
        onFailure: () => undefined,
      }),
    );
  });
};

const treeNodes = () => [
  ...container.querySelectorAll<HTMLElement>('[role="treeitem"]'),
];

const nodeFor = (key: string): HTMLElement => {
  const node = treeNodes().find(
    (candidate) => candidate.dataset.treeKey === key,
  );
  assert.ok(node !== undefined, `no tree node for ${key}`);
  return node;
};

/** The number the reader sees beside a folder name. */
const renderedCount = (key: string): number =>
  Number(nodeFor(key).lastElementChild?.textContent ?? "NaN");

const rows = () => [
  ...container.querySelectorAll<HTMLElement>("[data-note-id]"),
];

const listedIds = (): readonly string[] =>
  rows().map((row) => row.dataset.noteId ?? "");

const distinctListedIds = (): ReadonlySet<string> => new Set(listedIds());

const groupLabels = (): readonly string[] =>
  [...container.querySelectorAll("h3")].map(
    (head) => head.firstElementChild?.textContent ?? "",
  );

const arrangeBy = (mode: "folder" | "record" | "date") => {
  const button = container.querySelector<HTMLButtonElement>(
    `[data-arrangement="${mode}"]`,
  );
  assert.ok(button !== null, `no ${mode} arrangement control`);
  act(() => button.click());
};

const pressedArrangement = (): string =>
  container
    .querySelector('[data-arrangement][aria-pressed="true"]')
    ?.getAttribute("data-arrangement") ?? "none";

const openNoteId = (): string =>
  container.querySelector<HTMLElement>("[data-open-note-id]")?.dataset
    .openNoteId ?? "";

/* B35 — THE ROLL-UP, READ OFF THE SCREEN.
 *
 * The equation `noteCount(p) === ownNoteCount(p) + Σ noteCount(child)` is a
 * property of the read; what the SCREEN can get wrong is which of the two
 * numbers it prints and whether the list under a node agrees with it. Both are
 * asserted, at every level, and the tree is four deep with notes on three
 * levels so no clause passes by coincidence.
 */
test("prints the rolled-up count at every level and lists exactly that many notes", () => {
  render(snapshotWith(noteShapes));

  // RULING E, asserted where it is visible: the tree opens expanded to level 1
  // and collapsed below, so a folder two levels down has no row yet.
  assert.deepEqual(
    treeNodes().map((node) => node.dataset.treeKey),
    ["all-notes", "unfiled", folders.clients, folders.orbit, folders.policies],
    "the tree did not open expanded to level 1 and collapsed below",
  );

  for (const folder of folderShapes) {
    const children = folderShapes.filter(
      (candidate) =>
        "parentFolderId" in candidate && candidate.parentFolderId === folder.id,
    );
    assert.equal(
      folder.noteCount,
      folder.ownNoteCount +
        children.reduce((total, child) => total + child.noteCount, 0),
      `${folder.name}: its count is its own notes plus its children's counts`,
    );
    // Expanding as we go, because a collapsed folder has no row to read.
    act(() => nodeFor(folder.id).click());
    assert.equal(
      renderedCount(folder.id),
      folder.noteCount,
      `${folder.name}: the tree prints its own notes, not everything below it`,
    );
    assert.equal(
      distinctListedIds().size,
      folder.noteCount,
      `${folder.name}: the list is narrower than the counter beside it`,
    );
  }

  // Instrument, now that the walk has opened everything: a tree that stopped
  // drawing would have satisfied every "for every folder" claim above.
  assert.equal(
    treeNodes().length,
    folderShapes.length + 2,
    "the tree drew neither its two roots nor its five folders",
  );

  act(() => nodeFor("all-notes").click());
  assert.equal(renderedCount("all-notes"), noteShapes.length);
  act(() => nodeFor("unfiled").click());
  assert.equal(renderedCount("unfiled"), 1);
  assert.deepEqual([...distinctListedIds()], [notes.loose]);
});

/* B36 — NOTES IS THE WHOLE LIBRARY, NOT A LEFTOVERS BOX.
 *
 * DISTINCT IDS, and the mode is READ rather than assumed: under `Record` a note
 * with two references is drawn twice by design, so a plain row count against
 * the note total is red there for a reason that has nothing to do with a
 * missing note.
 */
test("lists every note at the All notes root, project-attached beside loose", () => {
  render(snapshotWith(noteShapes));
  act(() => nodeFor("all-notes").click());

  assert.equal(
    pressedArrangement(),
    "folder",
    "this claim is about Folder mode",
  );
  assert.deepEqual(
    [...distinctListedIds()].sort(),
    noteShapes.map((shape) => shape.id).sort(),
  );
  assert.equal(
    listedIds().length,
    noteShapes.length,
    "in Folder mode a note is listed once",
  );
  // Named rather than implied: the note attached to a project is one of them.
  assert.ok(distinctListedIds().has(notes.attached));
  assert.ok(distinctListedIds().has(notes.loose));
});

/* THE ROTATION LOSES NOTHING — and it is not a filter.
 *
 * Under `Record` a note with two references is read under both headings and a
 * note about no record is read under its own, so the ROWS outnumber the notes
 * while the DISTINCT IDS still equal them exactly.
 */
test("reads a note under every record it names, and loses none of the others", () => {
  render(snapshotWith(noteShapes));
  act(() => nodeFor("all-notes").click());
  arrangeBy("record");

  assert.equal(pressedArrangement(), "record");
  assert.deepEqual(
    [...distinctListedIds()].sort(),
    noteShapes.map((shape) => shape.id).sort(),
    "the rotation dropped a note",
  );
  assert.equal(
    listedIds().filter((id) => id === notes.rollout).length,
    2,
    "a note naming two records is read under one heading only",
  );
  assert.ok(
    listedIds().length > noteShapes.length,
    "no note was read twice, so this fixture cannot show what Record mode does",
  );
  assert.ok(
    groupLabels().includes("Not about any record yet"),
    "notes about no record silently left the list",
  );
});

/* GROUP ORDER IN `Folder` MODE IS TREE ORDER, NOT ALPHABETICAL.
 *
 * The discriminating case is in the fixture on purpose: sorted as strings the
 * paths would put `Klienci / Odbiór…` in a different place from where the tree
 * draws it, and `Polityki` would not follow the whole `Klienci` subtree.
 */
test("orders the Folder headings the way the tree draws them", () => {
  render(snapshotWith(noteShapes));
  act(() => nodeFor("all-notes").click());

  const headings = groupLabels();
  assert.deepEqual(headings, [
    "Klienci / Orbit",
    "Klienci / Orbit / Wdrożenie",
    "Klienci / Orbit / Wdrożenie / Odbiór",
    "Polityki",
    "Unfiled",
  ]);
  // The two orders a wrong implementation would plausibly produce, and this
  // fixture is chosen so BOTH differ from the sequence above. Without these
  // the `deepEqual` would be true of an alphabetical screen as well.
  assert.notDeepEqual(
    headings,
    [
      "Klienci / Orbit / Wdrożenie / Odbiór",
      "Klienci / Orbit",
      "Polityki",
      "Klienci / Orbit / Wdrożenie",
      "Unfiled",
    ],
    "by leaf name and by tree order agree here, so this proves neither",
  );
  assert.notDeepEqual(
    headings,
    [
      "Polityki",
      "Klienci / Orbit / Wdrożenie / Odbiór",
      "Klienci / Orbit / Wdrożenie",
      "Klienci / Orbit",
      "Unfiled",
    ],
    "the projection's own order and tree order agree here, so this proves neither",
  );
});

/* THE READING PANE DOES NOT CHANGE WHEN THE SWITCHER MOVES.
 *
 * The single most testable property of the switcher, and nothing guarded it.
 * All three positions, not two — the pane is read from `selectedId`, and a
 * version that reset it would have to be caught in whichever position happened
 * to be visited second.
 */
test("keeps the same note open through every arrangement", () => {
  render(snapshotWith(noteShapes));
  act(() => nodeFor("all-notes").click());

  const chosen = rows().find((row) => row.dataset.noteId === notes.policy);
  assert.ok(chosen !== undefined, "the note this test reads was never drawn");
  act(() => chosen.click());
  assert.equal(openNoteId(), notes.policy, "clicking a row did not open it");

  for (const mode of ["record", "date", "folder"] as const) {
    arrangeBy(mode);
    assert.equal(
      openNoteId(),
      notes.policy,
      `the ${mode} arrangement moved what is being read`,
    );
    assert.deepEqual(
      rows()
        .filter((row) => row.getAttribute("aria-current") === "page")
        .map((row) => row.dataset.noteId),
      mode === "record" ? [notes.policy] : [notes.policy],
      `the ${mode} arrangement marked a different row as the one being read`,
    );
  }
});

/* B34, ON THE SCREEN — the move the reader can actually perform.
 *
 * The kernel's before/after membership is asserted in the testkit. What only
 * this side can get wrong is the payload: `null` is Unfiled, a real
 * destination, and it is the value most easily swallowed by a wrapper that
 * treats a falsy field as "nothing to change". The note's OWN version travels
 * with it and no folder's does — filing two notes into one folder is not a
 * conflict over a record neither of them changed.
 */
test("moves a note to a folder and out to Unfiled, and the list follows", () => {
  const sent: CommandEnvelope[] = [];
  render(snapshotWith(noteShapes), recordingClient(sent));
  act(() => nodeFor("all-notes").click());

  const row = rows().find(
    (candidate) => candidate.dataset.noteId === notes.loose,
  );
  assert.ok(row !== undefined);
  const move =
    row.parentElement?.querySelector<HTMLButtonElement>("button + button");
  assert.ok(
    move !== undefined && move !== null,
    "a row offers no way to move it",
  );
  act(() => move.click());

  const target = document.querySelector<HTMLButtonElement>(
    `[data-move-target="${folders.policies}"]`,
  );
  assert.ok(target !== null, "the move menu does not offer the folder tree");
  act(() => target.click());

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.commandName, "document.setFolder");
  assert.deepEqual(sent[0]?.payload, {
    documentId: notes.loose,
    folderId: folders.policies,
  });
  assert.deepEqual(
    sent[0]?.expectedVersions,
    { [notes.loose]: 3 },
    "the note's own version travels, and nothing else's",
  );

  // BEFORE AND AFTER, as the screen sees it: the same read with the note filed
  // moves it out of Unfiled and into the folder's list.
  const moved = noteShapes.map((shape) =>
    shape.id === notes.loose ? { ...shape, folderId: folders.policies } : shape,
  );
  render(snapshotWith(moved), recordingClient(sent));
  act(() => nodeFor("unfiled").click());
  assert.equal(distinctListedIds().size, 0, "the note is still in the source");
  act(() => nodeFor(folders.policies).click());
  assert.ok(
    distinctListedIds().has(notes.loose),
    "the note is not in the destination",
  );

  // And back out. `null` is legal, not an error.
  sent.length = 0;
  const filed = rows().find(
    (candidate) => candidate.dataset.noteId === notes.loose,
  );
  assert.ok(filed !== undefined);
  const moveAgain =
    filed.parentElement?.querySelector<HTMLButtonElement>("button + button");
  act(() => moveAgain?.click());
  const unfile = document.querySelector<HTMLButtonElement>(
    '[data-move-target="unfiled"]',
  );
  assert.ok(unfile !== null, "Unfiled is not offered as a destination");
  act(() => unfile.click());
  assert.deepEqual(sent[0]?.payload, {
    documentId: notes.loose,
    folderId: null,
  });
});

/* THE TREE KEEPS EXACTLY ONE TAB STOP, INCLUDING AFTER A COLLAPSE.
 *
 * A2 covers list rows; a tree needs its own version, and the discriminating
 * case is the one that has actually broken trees before: the focused row stops
 * existing because an ancestor closed, and the whole tree leaves the Tab order
 * until the window is reloaded.
 */
test("keeps one tab stop in the tree, including after the focused node is collapsed", () => {
  render(snapshotWith(noteShapes));
  const stops = () => treeNodes().filter((node) => node.tabIndex === 0).length;

  act(() => nodeFor(folders.clients).click());
  act(() => nodeFor(folders.orbit).click());
  assert.equal(stops(), 1, "the tree has more than one Tab stop");

  // Focus a node that only exists while its ancestor is open, then close the
  // ancestor from under it.
  const deep = nodeFor(folders.rollout);
  act(() => deep.click());
  assert.equal(stops(), 1);
  act(() =>
    nodeFor(folders.clients).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    ),
  );
  assert.equal(
    treeNodes().some((node) => node.dataset.treeKey === folders.rollout),
    false,
    "collapsing the ancestor left its descendants on screen",
  );
  assert.equal(
    stops(),
    1,
    "collapsing took the tree's only Tab stop off the screen with it",
  );
});
