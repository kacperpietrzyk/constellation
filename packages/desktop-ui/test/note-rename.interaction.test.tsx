import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  DocumentIdSchema,
  DocumentRenameCommandSchema,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type {
  DesktopSnapshot,
  MutationFailure,
} from "../src/client/workflow.js";
import { workHarnessSnapshot } from "../src/dev/harness-snapshot.js";
import { NotesReading } from "../src/library/NotesReading.js";

/* RENAMING A NOTE, THROUGH THE SCREEN THAT OFFERS IT.
 *
 * `document.rename` shipped in #212 with the honest note that no screen
 * offered it, so the domain gap Wave D named — a note's title cannot be
 * changed by any means — was closed for an agent and still open for a person.
 * What this file asserts is the half that was missing, and it asserts it the
 * only way that can fail for the right reason.
 *
 * EVERY TEST HERE MOUNTS `NotesReading`, NEVER THE CONTROL AND NEVER THE
 * EDITOR. That is not a preference. Lot ACC measured, this same afternoon,
 * that `npm run check` stayed green with an entire section deleted from the
 * screen that was supposed to hold it, because both of its behaviour tests
 * mounted the component directly: a capability nothing mounts is
 * indistinguishable from one that was never built. The reading pane is reached
 * here the way a reader reaches it — the screen chooses the open note and
 * draws the pane — so deleting the control from the pane's header reddens
 * these tests, and `scripts/break-note-rename.mjs` deletes it to prove that.
 *
 * WHAT THE ENVELOPE MUST CARRY is checked against the boundary schema itself
 * rather than against a hand-written shape, because the failure this catches
 * is a renderer that sends something the kernel refuses — and a test that
 * restated the payload by hand would agree with the renderer and not with the
 * command.
 */

const noteId = (suffix: string) =>
  DocumentIdSchema.parse(`00000000-0000-4000-8000-0000000034${suffix}`);

const notes = {
  open: noteId("01"),
  /** Carries the title the rename below asks for — duplicates are permitted. */
  twin: noteId("02"),
} as const;

const OPEN_TITLE = "Notatki ze spotkania 2026-07-14";
const TWIN_TITLE = "Retention policy";

const spaceId = workHarnessSnapshot.bootstrap.spaces[0]!.id;

const snapshot: DesktopSnapshot = {
  ...workHarnessSnapshot,
  documents: {
    kind: "ready",
    data: {
      kind: "document.list",
      items: [
        {
          id: notes.open,
          spaceId,
          title: OPEN_TITLE,
          role: "note",
          version: 3,
          updatedAt: "2026-07-31T09:00:00.000Z",
        },
        {
          id: notes.twin,
          spaceId,
          title: TWIN_TITLE,
          role: "note",
          version: 2,
          updatedAt: "2026-07-30T09:00:00.000Z",
        },
      ],
    },
  },
  knowledge: {
    kind: "ready",
    data: {
      kind: "knowledge.list",
      spaceId,
      sources: [],
      folders: [],
      documents: [
        {
          id: notes.open,
          title: OPEN_TITLE,
          role: "note",
          references: [],
          evidenceCount: 0,
          namedVersionCount: 0,
          staleEvidence: false,
          // DELIBERATELY AHEAD OF `document.list`. Both reads carry the same
          // record's version and the screen prefers this one, exactly as
          // `moveNote` does; a rename resolving it the other way would send 3
          // where the kernel holds 7 and come back as a conflict over a record
          // nobody else touched. With both numbers equal this assertion would
          // pass whichever read the screen used.
          version: 7,
          updatedAt: "2026-07-31T09:00:00.000Z",
        },
        {
          id: notes.twin,
          title: TWIN_TITLE,
          role: "note",
          references: [],
          evidenceCount: 0,
          namedVersionCount: 0,
          staleEvidence: false,
          version: 2,
          updatedAt: "2026-07-30T09:00:00.000Z",
        },
      ],
    },
  },
} as unknown as DesktopSnapshot;

/* The stub answers the rename with the projection the wrapper demands, and
 * answers every OTHER command with the folder projection the move path uses.
 * Branching matters: `renameDocument` reports success only on
 * `document.renamed`, so a stub that answered one shape for everything would
 * make the success path — the popover closing, the reload — unreachable while
 * the "an envelope was sent" assertion passed anyway. */
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
      const payload = command.payload as {
        documentId: string;
        title?: string;
      };
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: "2026-08-02T12:00:00.000Z",
          outcome: "success",
          diagnosticCode: "accepted",
          affected: [],
          auditReceiptId: "90000000-0000-4000-8000-000000000009",
          projection:
            command.commandName === "document.rename"
              ? {
                  kind: "document.renamed",
                  documentId: payload.documentId,
                  title: payload.title,
                  version: 8,
                }
              : {
                  kind: "document.folder_changed",
                  documentId: payload.documentId,
                  version: 8,
                },
        },
      };
    },
  }) as unknown as ConstellationRendererClient;

let container: HTMLElement;
let bandHost: HTMLElement;
let root: Root;
let sent: CommandEnvelope[];
let reloads: { count: number };
let failures: MutationFailure[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  bandHost = document.createElement("div");
  document.body.append(bandHost);
  root = createRoot(container);
  sent = [];
  reloads = { count: 0 };
  failures = [];
  globalThis.localStorage?.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  bandHost.remove();
  // The popover portals its panel to <body>; an unmounted panel left behind
  // would let the next test find a control this one opened.
  for (const panel of document.querySelectorAll('[role="dialog"]'))
    panel.remove();
});

const render = (client?: ConstellationRendererClient) => {
  act(() => {
    root.render(
      createElement(NotesReading, {
        // Pasmo tytułu Biblioteki jest celem PORTALU, więc odczyt pozbawiony
        // celu nie rysuje swojej akcji tworzenia w ogóle. Fikstura daje tu
        // prawdziwy węzeł, żeby ta ścieżka została w teście osiągalna — cel
        // `null` przechodziłby tak samo i po cichu zabierał ją z pomiaru.
        actionHost: bandHost,
        client,
        snapshot,
        inspectorHost: null,
        onInspectorOpen: () => undefined,
        onEntityActivate: () => undefined,
        onReload: async () => {
          reloads.count += 1;
        },
        onFailure: (failure: MutationFailure) => {
          failures.push(failure);
        },
      }),
    );
  });
};

/** The trigger, found where a reader finds it: in the pane that is reading. */
const renameTrigger = (): HTMLButtonElement => {
  const trigger = container.querySelector<HTMLButtonElement>(
    ".knowledge-editor-header .document-rename-trigger",
  );
  assert.ok(
    trigger !== null,
    "the reading pane offers no way to rename the note it is reading",
  );
  return trigger;
};

const openRename = (): HTMLFormElement => {
  act(() => renameTrigger().click());
  const form = document.querySelector<HTMLFormElement>(
    '[role="dialog"] form:has([data-document-rename-input])',
  );
  assert.ok(form !== null, "the rename control opened no form");
  return form;
};

const field = (form: HTMLFormElement): HTMLInputElement => {
  const input = form.querySelector<HTMLInputElement>(
    "[data-document-rename-input]",
  );
  assert.ok(input !== null, "the rename form has no title field");
  return input;
};

/** Types into the field the way React's controlled input needs. */
const type = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submit = async (form: HTMLFormElement) => {
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * Every rename that reached the bridge, read back through the boundary schema
 * that decides whether the kernel would take it. `.strict()` on the payload
 * means an added field, a missing one or an untrimmed title fails here rather
 * than a process away, and it is why nothing in this file restates the shape.
 */
const renames = () =>
  sent
    .filter((command) => command.commandName === "document.rename")
    .map((command) => DocumentRenameCommandSchema.parse(command));

/* THE AFFORDANCE EXISTS, IS REACHED THROUGH THE SCREEN, AND SENDS THE COMMAND
 * THE KERNEL ACCEPTS.
 *
 * The envelope is parsed by `DocumentRenameCommandSchema` itself: the payload
 * is `.strict()`, so a renderer that added a field, dropped one or sent an
 * untrimmed title fails here rather than at the process boundary. The version
 * is asserted as the WHOLE key set — #212's wrapper test learned that one, and
 * a check for "the note's id is in there" would pass while a second key rode
 * along and made every rename a conflict.
 */
test("renames the open note, with the version the screen resolves", async () => {
  render(recordingClient(sent));

  const form = openRename();
  const input = field(form);
  assert.equal(
    input.value,
    OPEN_TITLE,
    "the field did not open on the name the note carries",
  );

  type(input, "  Ustalenia z Orbit  ");
  await submit(form);

  assert.equal(renames().length, 1, "no rename reached the bridge");
  const envelope = renames()[0]!;
  assert.equal(envelope.payload.documentId, notes.open);
  // The padding is absorbed by the boundary, not restated by the screen:
  // `execute()` parses the envelope through `CommandEnvelopeSchema` and the
  // payload trims. A second `.trim()` in the control would be the same rule
  // written twice, and the copy nobody reads is the one that drifts.
  assert.equal(
    envelope.payload.title,
    "Ustalenia z Orbit",
    "the note was renamed to something other than what was typed",
  );
  assert.deepEqual(
    envelope.expectedVersions,
    { [notes.open]: 7 },
    "the rename did not send exactly the open note's version, from the read the screen prefers",
  );
  assert.equal(reloads.count, 1, "the screen never re-read after the rename");
});

/* A TITLE OF PURE WHITESPACE IS REFUSED ON THE FIELD, NOT IN A TOAST.
 *
 * `z.string().trim().min(1)` at the boundary means `"   "` is refused after
 * trimming — and `execute()` parses the envelope with `CommandEnvelopeSchema`
 * BEFORE it reaches the bridge, so without a guard here the refusal comes back
 * as a caught Zod message handed to `onFailure`. A reader who typed four
 * spaces would read a schema error about their own note.
 *
 * WHICH HALF OF THIS TEST IS LOAD-BEARING, said out loud because the other
 * half looks stronger than it is: "no rename reached the bridge" is ALSO true
 * when the guard is deleted, because the parse throws first. What changes when
 * the guard goes is that the field stops saying why and a failure appears
 * instead — `reportFirstEmptyRequiredField` exists for exactly this case,
 * since the browser's own `required` never fires on whitespace.
 */
test("refuses a title that is only whitespace, and says so on the field", async () => {
  render(recordingClient(sent));

  const form = openRename();
  const input = field(form);
  type(input, "    ");
  await submit(form);

  assert.equal(
    renames().length,
    0,
    "a whitespace-only title was sent to a boundary that refuses it",
  );
  assert.equal(
    input.validationMessage,
    "This field cannot be only spaces.",
    "the field was refused without saying why",
  );
  assert.deepEqual(
    failures,
    [],
    "the refusal was reported as a failed mutation instead of on the field",
  );
  assert.ok(
    document.querySelector('[role="dialog"]') !== null,
    "the rename form closed on a refusal, losing what was typed",
  );
});

/* THE TWO RULES THE COMMAND DOES NOT MAKE, AND THE INTERFACE DOES NOT INVENT.
 *
 * Nothing in this domain makes a note's name unique, and the handler accepts
 * the name a note already carries on purpose — a retried write must not fail
 * on a workspace that already applied it. A screen that greyed out either case
 * would be stating a rule the kernel declined to make, which is the harder
 * defect to find: it looks like care.
 */
test("permits a title another note already carries, and the note's own", async () => {
  render(recordingClient(sent));

  const duplicate = openRename();
  type(field(duplicate), TWIN_TITLE);
  await submit(duplicate);
  assert.equal(
    renames().length,
    1,
    "the screen refused a title another note already carries",
  );
  assert.equal(renames()[0]?.payload.title, TWIN_TITLE);

  const unchanged = openRename();
  assert.equal(
    field(unchanged).value,
    OPEN_TITLE,
    "the reopened field did not start from the note's current name",
  );
  await submit(unchanged);
  assert.equal(
    renames().length,
    2,
    "the screen swallowed a rename to the name the note already has",
  );
  assert.equal(renames()[1]?.payload.title, OPEN_TITLE);
});

/* NOTHING IS SENT WITHOUT A BRIDGE, and the control still draws.
 *
 * The reading pane only mounts with a client, so this is the one shape where
 * the affordance is absent for a reason rather than by omission — asserted so
 * that "no control" and "no bridge" stay different sentences.
 */
test("draws no reading pane, and no rename, without a client", () => {
  render(undefined);

  assert.equal(
    container.querySelector(".knowledge-editor-header"),
    null,
    "the reading pane mounted without a bridge to write through",
  );
  assert.equal(sent.length, 0);
});
