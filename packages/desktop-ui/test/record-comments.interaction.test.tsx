import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  CaptureIdSchema,
  CapturePayloadIdSchema,
  CommentIdSchema,
  KnowledgeSourceIdSchema,
  PrincipalIdSchema,
  type KnowledgeSourceId,
} from "@constellation/contracts";

import {
  RecordCommentsPanel,
  type AttachmentCustody,
  type CommentAttachment,
  type PendingAttachment,
} from "../src/record/RecordCommentsPanel.js";
import {
  openThreadCount,
  type CommentThread,
} from "../src/record/record-tabs.js";
import { assertNoNode } from "./dom-assert.js";

// Replying, resolving, editing and attaching, proved by CLICKING them.
//
// Before this file, `grep -rn 'canResolve|onResolve|comment\.resolve|
// comment\.edit|comment\.reopen'` over the whole test tree returned nothing.
// Four capabilities could have left the product with a fully green gate —
// which is how the older inspector panel came to carry behaviour nobody could
// name and nobody dared touch.
//
// The panel is mounted DIRECTLY rather than through the shell, and that limit
// is worth stating: this proves the panel honours the props it is given, not
// that any mount gives them. The mounts are what the compiler is for — the
// permission pair and the two writes are REQUIRED props, so a record that
// forgets one no longer compiles — and the mounted half of the guarantee lives
// in `record-screen.interaction.test.tsx` and `organization-comments`.
//
// Nothing here selects on a CSS-module class. Module names are hashed in a
// production build, so a class-based selector stops measuring anything the
// moment the app is packaged.

const me = PrincipalIdSchema.parse("00000000-0000-4000-8000-00000000ca01");
const other = PrincipalIdSchema.parse("00000000-0000-4000-8000-00000000ca02");
const rootId = CommentIdSchema.parse("00000000-0000-4000-8000-00000000cb01");
const settledId = CommentIdSchema.parse("00000000-0000-4000-8000-00000000cb02");
const replyId = CommentIdSchema.parse("00000000-0000-4000-8000-00000000cb03");

const captureId = CaptureIdSchema.parse("00000000-0000-4000-8000-00000000cd01");
const payloadId = CapturePayloadIdSchema.parse(
  "00000000-0000-4000-8000-00000000ce01",
);

const sourceId = (nth: number): KnowledgeSourceId =>
  KnowledgeSourceIdSchema.parse(
    `00000000-0000-4000-8000-0000000f${String(nth).padStart(4, "0")}`,
  );

const managed = (displayName: string): PendingAttachment["original"] => ({
  kind: "managed_file",
  payload: {
    payloadId,
    displayName,
    mediaType: "application/pdf",
    byteLength: 4096,
    contentSha256: "a".repeat(64),
    custodyState: "available",
  },
});

const attached = (
  id: KnowledgeSourceId,
  displayName: string,
): CommentAttachment => ({
  sourceId: id,
  captureId,
  original: managed(displayName),
  availability: "available",
});

const comment = (
  overrides: Partial<CommentThread> & Pick<CommentThread, "id">,
): CommentThread => ({
  rootCommentId: overrides.id,
  body: "Czy zakres obejmuje też oddział w Gdańsku?",
  author: { principalId: me, displayName: "Kacper" },
  mentionPrincipalIds: [],
  attachments: [],
  threadState: "open",
  version: 1,
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
  edited: false,
  ...overrides,
});

/** One open root of mine, one settled root of somebody else's, and one reply.
 *  "How many threads" has three different answers over this fixture — the tab
 *  count, the tree and the valve each read it — and a fixture with one root
 *  could not tell a broken reading from a correct one. */
const openRoot = comment({ id: rootId });
const settledRoot = comment({
  id: settledId,
  author: { principalId: other, displayName: "Marta" },
  body: "Termin przesunięty, potwierdzone.",
  threadState: "resolved",
  createdAt: "2026-07-18T08:00:00.000Z",
});
const reply = comment({
  id: replyId,
  parentCommentId: rootId,
  rootCommentId: rootId,
  body: "Tak, Gdańsk wchodzi w zakres.",
  createdAt: "2026-07-19T09:00:00.000Z",
  edited: true,
});

type PanelProps = Parameters<typeof RecordCommentsPanel>[0];

/** Every required prop in its OFF position, so each test below turns on exactly
 *  the one capability it measures. A richer baseline would light up Edit,
 *  Unlink and Resolve across the whole file and let an assertion pass on a
 *  control some other test switched on. */
const base: PanelProps = {
  threads: [openRoot, settledRoot, reply],
  recordKey: "project-a",
  actorOf: (entry) => ({
    name: entry.author.displayName,
    short: "KP",
    agent: false,
    role: "human",
  }),
  mentionNameOf: (principalId) => (principalId === other ? "Marta" : "Kacper"),
  mentionCandidates: [
    { principalId: other, displayName: "Marta", participantKind: "member" },
  ],
  canComment: false,
  canResolve: false,
  currentPrincipalId: undefined,
  onSubmit: () => Promise.resolve(true),
  onEdit: undefined,
  onResolve: undefined,
  timeZone: "Europe/Warsaw",
};

/** Hands out a FRESH pending promise on every call, and answers them all at
 *  once. Memoising an already-given answer would let a chip repair itself
 *  inside the same `act`, and the flash the custody tests measure would never
 *  be visible for an assertion to catch. */
const inspector = (): {
  readonly inspect: () => Promise<AttachmentCustody>;
  readonly answer: (held: AttachmentCustody) => Promise<void>;
} => {
  const waiting: ((held: AttachmentCustody) => void)[] = [];
  return {
    inspect: () =>
      new Promise<AttachmentCustody>((resolve) => {
        waiting.push(resolve);
      }),
    answer: async (held) => {
      const pending = waiting.splice(0, waiting.length);
      await act(async () => {
        for (const resolve of pending) resolve(held);
        await Promise.resolve();
        await Promise.resolve();
      });
    },
  };
};

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  container.remove();
});

const render = async (props: PanelProps): Promise<void> => {
  await act(async () => {
    root.render(createElement(RecordCommentsPanel, props));
  });
};

/** Lets queued promises settle inside `act`, so a control whose handler awaits
 *  the shell has actually finished before the next assertion runs. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const click = async (node: Element): Promise<void> => {
  await act(async () => {
    (node as HTMLElement).click();
  });
  await settle();
};

/** A node that must be there. Deliberately not `assert.ok(node)`: a failing
 *  `ok` puts the node itself into `actual`, and serialising a happy-dom node
 *  graph takes the worker down without printing which test failed. */
const one = <T extends Element>(
  scope: ParentNode,
  selector: string,
  message: string,
): T => {
  const found = scope.querySelector<T>(selector);
  if (found === null) throw new Error(`${message} — no ${selector} on screen`);
  return found;
};

const entryOf = (id: CommentThread["id"]): Element =>
  one(container, `[data-comment-id="${id}"]`, `the entry ${id} is not drawn`);

const named = (scope: ParentNode, label: string): HTMLButtonElement | null =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === label,
  ) ?? null;

const control = (
  scope: ParentNode,
  label: string,
  message: string,
): HTMLButtonElement => {
  const found = named(scope, label);
  if (found === null) throw new Error(`${message} — no "${label}" control`);
  return found;
};

const composer = (): HTMLTextAreaElement =>
  one(
    container,
    'textarea[aria-label="Write a comment"]',
    "the panel offers no composer",
  );

const form = (): Element => one(container, "form", "the composer is gone");

const typeInto = async (
  field: HTMLTextAreaElement,
  text: string,
): Promise<void> => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const press = async (
  field: HTMLTextAreaElement,
  key: string,
  init: KeyboardEventInit = {},
): Promise<void> => {
  await act(async () => {
    field.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key, ...init }),
    );
  });
  await settle();
};

const send = async (): Promise<void> => {
  await act(async () => {
    form().dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await settle();
};

// ── 1. PERMISSION IS A STATED FACT ────────────────────────────────────────

test("a read-only scope says so, and offers no write it would refuse", async () => {
  await render(base);
  assert.equal(
    composer().placeholder,
    "This scope is read-only.",
    "a reader without the grant gets a dead field and no reason for it",
  );
  assert.equal(composer().disabled, true);
  // And nothing invites a write either. A Reply above a composer nobody may
  // use is a control that exists only to be turned down.
  assertNoNode(
    named(entryOf(rootId), "Reply"),
    "a read-only scope still invites an answer it cannot accept",
  );

  // The other direction, from the same fixture: permission is a STATED fact
  // now, so both readings are the mount's and neither is a default.
  await render({ ...base, canComment: true });
  assert.equal(composer().placeholder, "Write a comment");
  assert.equal(composer().disabled, false);
  control(entryOf(rootId), "Reply", "a granted scope offers no way to answer");
});

// ── 2. REPLIES ────────────────────────────────────────────────────────────

test("a reply is written into its root's thread and the tab count stays put", async () => {
  const sent: { body: string; parent: CommentThread | undefined }[] = [];
  await render({
    ...base,
    canComment: true,
    onSubmit: (body, _mentions, parent) => {
      sent.push({ body, parent });
      return Promise.resolve(true);
    },
  });

  // Threading is two levels. A Reply on a REPLY would write a sibling, because
  // anything deeper is pinned back to the root — so the control is drawn on
  // roots only, and the reply already in the fixture proves the nesting.
  const thread = one(
    container,
    `[data-thread-root="${rootId}"]`,
    "the open root draws no thread",
  );
  const replies = one(thread, "[data-replies]", "the reply is not indented");
  one(
    replies,
    `[data-comment-id="${replyId}"]`,
    "the reply is drawn outside the thread it answers",
  );
  assertNoNode(
    named(replies, "Reply"),
    "a reply offers a Reply of its own, which would write a sibling",
  );

  await click(control(thread, "Reply", "an open root offers no way to answer"));

  // Who is being answered is said where a screen reader hears it, not only in
  // the strip: the form is what the field lives in.
  assert.equal(
    form().getAttribute("aria-label"),
    "Reply in the thread by Kacper",
  );
  control(container, "Add reply", "the send control still says Comment");

  await typeInto(composer(), "Potwierdzam zakres.");
  await send();

  assert.equal(sent.length, 1, "answering a thread sent nothing");
  assert.equal(
    sent[0]?.parent?.id,
    rootId,
    "the reply was sent without the thread it answers, so it lands as a root",
  );

  // The badge counts open ROOTS. An answer is part of a conversation, not
  // another one — a count that moved here would tell a reader a new question
  // was asked.
  const answered = comment({
    id: CommentIdSchema.parse("00000000-0000-4000-8000-00000000cb04"),
    parentCommentId: rootId,
    rootCommentId: rootId,
  });
  assert.equal(openThreadCount(base.threads), 1);
  assert.equal(openThreadCount([...base.threads, answered]), 1);
});

// ── 3. RESOLVE / REOPEN ───────────────────────────────────────────────────

test("the author settles their own thread and it leaves the open list", async () => {
  const resolved: { id: string; to: boolean }[] = [];
  const props: PanelProps = {
    ...base,
    canComment: true,
    canResolve: false,
    currentPrincipalId: me,
    onResolve: (entry, next) => {
      resolved.push({ id: entry.id, to: next });
      return Promise.resolve(true);
    },
  };
  await render(props);

  // WITHOUT the grant. An author may close their own question and nobody
  // else's — one fixture, both directions.
  await click(
    control(
      entryOf(rootId),
      "Resolve",
      "the author cannot settle their own thread",
    ),
  );
  assert.deepEqual(resolved, [{ id: rootId, to: true }]);

  // The shell answers a write by re-reading, so the panel comes back with the
  // thread settled. Two things must move together: the valve and the count.
  const settledNow = { ...openRoot, threadState: "resolved" as const };
  const after = [settledNow, settledRoot, reply];
  await render({ ...props, threads: after });
  assert.equal(
    openThreadCount(after),
    0,
    "settling the last open thread left the tab claiming one is open",
  );
  await click(control(container, "Show 2 resolved", "the valve did not grow"));

  const settledEntry = entryOf(rootId);
  control(settledEntry, "Reopen", "a settled thread cannot be reopened");
  assertNoNode(
    named(settledEntry, "Reply"),
    "a settled thread still invites an answer nobody will read",
  );
  // Somebody else's thread, without the grant: no control at all.
  assertNoNode(
    named(entryOf(settledId), "Reopen"),
    "a reader without the grant can reopen a thread that is not theirs",
  );

  // The other half of the gate. Without this, deleting `canResolve` from the
  // condition leaves every line above green — the grant would stop being what
  // lets anybody settle a thread that is not their own.
  await render({ ...props, canResolve: true });
  control(
    entryOf(settledId),
    "Reopen",
    "the grant does not settle other people's threads",
  );
});

test("a refused settle says so instead of passing for one that worked", async () => {
  let accept = false;
  await render({
    ...base,
    canComment: true,
    canResolve: true,
    currentPrincipalId: me,
    threads: [openRoot],
    onResolve: () => Promise.resolve(accept),
  });

  // A refused resolve leaves the thread exactly as it was, which on its own is
  // what a resolve that WORKED also looks like until the list is re-read. The
  // panel has the answer in hand; throwing it away is what made the two the
  // same picture.
  await click(control(entryOf(rootId), "Resolve", "the thread cannot settle"));
  assert.equal(
    (entryOf(rootId).textContent ?? "").includes("That change was refused."),
    true,
    "a refused settle is drawn exactly like one the kernel accepted",
  );

  // And the account is withdrawn the moment a settle lands, rather than
  // sitting under a thread that did close.
  accept = true;
  await click(control(entryOf(rootId), "Resolve", "the control disappeared"));
  assert.equal(
    (entryOf(rootId).textContent ?? "").includes("That change was refused."),
    false,
    "the refusal is still stated over a settle that then worked",
  );
});

// ── 4. INLINE EDITING WITH PER-ENTRY DRAFT RETENTION ──────────────────────

test("a refused edit keeps the typed text, and moving the editor keeps it too", async () => {
  let accept = false;
  const edits: { id: string; body: string }[] = [];
  await render({
    ...base,
    canComment: true,
    currentPrincipalId: me,
    threads: [openRoot, reply],
    onEdit: (entry, body) => {
      edits.push({ id: entry.id, body });
      return Promise.resolve(accept);
    },
  });

  // The composer and the editor carry the SAME cap. A reader who can write
  // 16 000 characters into one and more into the other finds out which is
  // which only when the write is refused.
  assert.equal(composer().maxLength, 16_000);

  const editor = (): HTMLTextAreaElement =>
    one(container, 'textarea[aria-label="Edit comment"]', "no editor is open");

  await click(control(entryOf(rootId), "Edit", "the author cannot edit"));
  assert.equal(editor().maxLength, 16_000);
  await typeInto(editor(), "Zakres poprawiony.");

  // Moving the editor to the reply must not throw the first draft away — and
  // the entry left behind says so rather than looking untouched.
  await click(control(entryOf(replyId), "Edit", "a reply cannot be edited"));
  await typeInto(editor(), "Druga poprawka.");
  assert.equal(
    [...entryOf(rootId).querySelectorAll("span")].some(
      (node) => node.textContent === "Draft kept",
    ),
    true,
    "the entry left behind does not say its draft survived",
  );

  await click(control(entryOf(rootId), "Edit", "the editor cannot move back"));
  assert.equal(
    editor().value,
    "Zakres poprawiony.",
    "moving the editor away and back erased what was typed",
  );

  // Refused: the text stays exactly where its author left it, and the editor
  // stays open over it.
  await press(editor(), "Enter", { metaKey: true });
  assert.deepEqual(edits, [{ id: rootId, body: "Zakres poprawiony." }]);
  assert.equal(
    editor().value,
    "Zakres poprawiony.",
    "a refused edit ate what somebody had typed",
  );

  accept = true;
  await press(editor(), "Enter", { metaKey: true });
  assertNoNode(
    container.querySelector('textarea[aria-label="Edit comment"]'),
    "a confirmed edit left the editor open",
  );

  // An edit is not a rewrite: the entry says the previous body is kept — on a
  // REPLY as much as on a root, which the older panel marked only on roots.
  assert.equal(
    [...entryOf(replyId).querySelectorAll("span")].some(
      (node) => node.textContent === "Edited · history kept",
    ),
    true,
    "an edited reply does not say its history was kept",
  );
});

test("Escape leaves the editor without leaving the record around it", async () => {
  // The probe sits on an ANCESTOR of the React root, because React's own
  // listener is bound to the root itself and `stopPropagation` does not stop a
  // second listener on the same node.
  let reached = 0;
  const probe = (): void => {
    reached += 1;
  };
  document.body.addEventListener("keydown", probe);
  try {
    await render({
      ...base,
      canComment: true,
      currentPrincipalId: me,
      threads: [openRoot],
      onEdit: () => Promise.resolve(true),
    });
    await click(control(entryOf(rootId), "Edit", "the author cannot edit"));
    const editor = (): HTMLTextAreaElement =>
      one(container, 'textarea[aria-label="Edit comment"]', "no editor open");
    await typeInto(editor(), "Poprawka bez zapisu.");

    // The instrument first: a key the editor does not handle must reach the
    // probe, or "Escape did not reach it" would be satisfied by a probe that
    // never fires at all.
    await press(editor(), "a");
    assert.equal(reached, 1, "the probe never fires, so it proves nothing");

    await press(editor(), "Escape");
    assert.equal(
      reached,
      1,
      "Escape carried past the editor, so it also closes the inspector",
    );
    assertNoNode(
      container.querySelector('textarea[aria-label="Edit comment"]'),
      "Escape did not close the editor",
    );

    // Escape closes the editor and KEEPS the draft, which is the answer moving
    // the editor elsewhere already gave. The older panel destroyed it here and
    // kept it there, and put the destructive one on the key people press to
    // get out of the way.
    await click(control(entryOf(rootId), "Edit", "the editor cannot reopen"));
    assert.equal(
      editor().value,
      "Poprawka bez zapisu.",
      "leaving the editor with Escape threw the draft away",
    );
  } finally {
    document.body.removeEventListener("keydown", probe);
  }
});

test("unlinking one file sends the rest, and the body now on screen", async () => {
  const first = sourceId(201);
  const second = sourceId(202);
  const withFiles = comment({
    id: rootId,
    attachments: [attached(first, "Umowa.pdf"), attached(second, "Aneks.pdf")],
  });
  const edits: {
    body: string;
    ids: readonly KnowledgeSourceId[] | undefined;
  }[] = [];
  await render({
    ...base,
    canComment: true,
    currentPrincipalId: me,
    threads: [withFiles],
    onEdit: (_entry, body, ids) => {
      edits.push({ body, ids });
      return Promise.resolve(true);
    },
  });

  // With an editor open over an unsaved draft. Unlinking IS an edit, so it
  // carries a body — the older panel sent the STORED one and silently rolled
  // back what the author had just typed.
  await click(control(entryOf(rootId), "Edit", "the author cannot edit"));
  await typeInto(
    one(container, 'textarea[aria-label="Edit comment"]', "no editor is open"),
    "Treść po poprawce.",
  );

  const unlinks = [
    ...entryOf(rootId).querySelectorAll<HTMLButtonElement>("button"),
  ].filter((button) => button.textContent === "Unlink");
  assert.equal(unlinks.length, 2, "each file needs its own Unlink");
  await click(unlinks[0]!);

  // The WHOLE remaining set, not the one removed: the command replaces the
  // list, so a partial set deletes the files nobody touched.
  assert.deepEqual(edits, [{ body: "Treść po poprawce.", ids: [second] }]);
});

test("unlinking with the editor closed publishes no draft nobody sent", async () => {
  const first = sourceId(203);
  const second = sourceId(204);
  const withFiles = comment({
    id: rootId,
    attachments: [attached(first, "Umowa.pdf"), attached(second, "Aneks.pdf")],
  });
  const edits: { body: string }[] = [];
  await render({
    ...base,
    canComment: true,
    currentPrincipalId: me,
    threads: [withFiles],
    onEdit: (_entry, body) => {
      edits.push({ body });
      return Promise.resolve(true);
    },
  });

  const editor = (): HTMLTextAreaElement =>
    one(container, 'textarea[aria-label="Edit comment"]', "no editor is open");
  await click(control(entryOf(rootId), "Edit", "the author cannot edit"));
  await typeInto(editor(), "Wersja, której nie wysłałem.");
  await press(editor(), "Escape");

  // The instrument first: the entry has to be claiming the draft was KEPT, or
  // the assertion below could pass over an editor that is simply empty.
  assert.equal(
    [...entryOf(rootId).querySelectorAll("span")].some(
      (node) => node.textContent === "Draft kept",
    ),
    true,
    "the entry never claims the draft survived, so this measures nothing",
  );

  // Two defensible answers — Cancel keeps the draft, Unlink sends what is on
  // screen — compose into a write nobody asked for: removing a file becomes
  // the thing that finally publishes text its author had backed out of, under
  // a label promising it was merely kept.
  const unlinks = [
    ...entryOf(rootId).querySelectorAll<HTMLButtonElement>("button"),
  ].filter((button) => button.textContent === "Unlink");
  await click(unlinks[0]!);
  assert.deepEqual(
    edits,
    [{ body: withFiles.body }],
    "removing a file published the draft its author had walked away from",
  );
});

// ── 5. ATTACHMENTS ────────────────────────────────────────────────────────

test("a staged file survives a refused write and is staged only once", async () => {
  let staged = 0;
  const sent: (readonly KnowledgeSourceId[] | undefined)[] = [];
  await render({
    ...base,
    canComment: true,
    threads: [openRoot],
    onAttach: () => {
      staged += 1;
      // The third staging repeats the second file on purpose: the same file
      // chosen twice is one attachment, not a list carrying a repeated id.
      const id = sourceId(Math.min(staged, 2));
      return Promise.resolve({ sourceId: id, original: managed("Raport.pdf") });
    },
    onSubmit: (_body, _mentions, _parent, attachments) => {
      sent.push(attachments);
      return Promise.resolve(false);
    },
  });

  const staging = (): Element =>
    one(
      container,
      'ul[aria-label="New comment attachments"]',
      "nothing was staged",
    );
  const attach = (): HTMLButtonElement =>
    control(container, "Attach file", "the composer offers no way to attach");

  await click(attach());
  await click(attach());
  assert.equal(staging().querySelectorAll("li").length, 2);
  await click(attach());
  assert.equal(
    staging().querySelectorAll("li").length,
    2,
    "choosing the same file twice sends the kernel a repeated id",
  );

  await typeInto(composer(), "Załącznik w komentarzu.");
  await send();
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.length, 2, "the staged files never reached the write");
  assert.equal(
    staging().querySelectorAll("li").length,
    2,
    "a refused write threw away the files somebody had chosen",
  );
});

test("custody is stated per file, and never asked when nobody can answer", async () => {
  const lost = sourceId(101);
  const withFile = comment({
    id: rootId,
    attachments: [attached(lost, "Umowa.pdf")],
  });
  let held: "available" | "unavailable" = "unavailable";
  await render({
    ...base,
    canComment: true,
    threads: [withFile],
    onInspectAttachment: () => Promise.resolve(held),
    onRestoreAttachment: () => Promise.resolve("available" as const),
  });
  await settle();

  const chip = (): string =>
    one(
      entryOf(rootId),
      'ul[aria-label="Comment attachments"] li',
      "the comment's file is not listed",
    ).textContent ?? "";
  assert.equal(
    chip().includes("Not on this device"),
    true,
    `a file this device no longer holds does not say so: ${chip()}`,
  );

  held = "available";
  await click(
    control(entryOf(rootId), "Restore", "a lost file cannot be fetched back"),
  );
  assert.equal(
    chip().includes("In managed storage"),
    true,
    `restoring the file left the chip claiming it is missing: ${chip()}`,
  );
});

/** Its own test, and that is load-bearing: reusing the mount above would carry
 *  an already-answered custody map into it, and the assertion would pass on
 *  the leftover answer instead of on the absent chip. */
test("a file's custody is not claimed when nothing can answer for it", async () => {
  const lost = sourceId(102);
  const withFile = comment({
    id: rootId,
    attachments: [attached(lost, "Umowa.pdf")],
  });
  await render({ ...base, canComment: true, threads: [withFile] });
  await settle();

  const row =
    one(
      entryOf(rootId),
      'ul[aria-label="Comment attachments"] li',
      "the comment's file is not listed",
    ).textContent ?? "";
  // The older panel left the chip reading "Checking storage…" for the life of
  // the screen — a spinner pretending to be a fact. With nobody to ask, none
  // of the three sentences may appear at all.
  for (const claim of [
    "Checking storage",
    "In managed storage",
    "Not on this device",
  ])
    assert.equal(
      row.includes(claim),
      false,
      `custody is claimed with nothing to answer it: ${row}`,
    );
  // The file is still listed, which is the point of the row.
  assert.equal(row.includes("Umowa.pdf"), true);
});

/** The two tests below are the whole reason the custody effect is shaped the
 *  way it is, and neither can be read off the code: one keeps an answer across
 *  a re-run, the other keeps a question across a re-render. Both were claimed
 *  before they were asserted, and the claim was wrong — over a fixture whose
 *  threads never change, the effect runs exactly once and every shape of it
 *  looks identical. */
test("a file already answered for keeps its answer when another arrives", async () => {
  const first = sourceId(301);
  const second = sourceId(302);
  const storage = inspector();
  const props: PanelProps = {
    ...base,
    canComment: true,
    threads: [comment({ id: rootId, attachments: [attached(first, "A.pdf")] })],
    onInspectAttachment: storage.inspect,
  };
  await render(props);
  await storage.answer("available");

  const row = (nth: number): string =>
    Array.from(
      entryOf(rootId).querySelectorAll(
        'ul[aria-label="Comment attachments"] li',
      ),
      (node) => node.textContent ?? "",
    )[nth] ?? "";
  assert.equal(
    row(0).includes("In managed storage"),
    true,
    `the first file was never answered for, so this measures nothing: ${row(0)}`,
  );

  // A second file lands on the same comment, so the inspection runs again.
  // The older panel replaced the whole map on each run and flashed every chip
  // back to a spinner — a settled fact redrawn as a question.
  await render({
    ...props,
    threads: [
      comment({
        id: rootId,
        attachments: [attached(first, "A.pdf"), attached(second, "B.pdf")],
      }),
    ],
  });
  assert.equal(
    row(0).includes("In managed storage"),
    true,
    `an answer already given flashed back to a spinner: ${row(0)}`,
  );
  assert.equal(
    row(1).includes("Checking storage"),
    true,
    "the file that just arrived is not being asked about at all",
  );
});

test("a rebuilt inspect callback does not abandon the question in flight", async () => {
  const only = sourceId(303);
  const storage = inspector();
  const props: PanelProps = {
    ...base,
    canComment: true,
    threads: [comment({ id: rootId, attachments: [attached(only, "A.pdf")] })],
    onInspectAttachment: storage.inspect,
  };
  await render(props);

  const row = (): string =>
    one(
      entryOf(rootId),
      'ul[aria-label="Comment attachments"] li',
      "the comment's file is not listed",
    ).textContent ?? "";
  assert.equal(
    row().includes("Checking storage"),
    true,
    "nothing is being asked, so the abandonment below cannot be seen",
  );

  // The shell rebuilds this callback on every render. An effect keyed on its
  // identity cancels the question already asked and puts a new one to the
  // fresh callback — and this one never answers, so the chip would spin for
  // the life of the screen while the real answer was thrown away.
  await render({
    ...props,
    onInspectAttachment: () => new Promise<AttachmentCustody>(() => undefined),
  });
  await storage.answer("available");
  assert.equal(
    row().includes("In managed storage"),
    true,
    `a re-render threw away the answer this file was waiting on: ${row()}`,
  );
});

test("the twentieth staged file says what the limit is", async () => {
  let staged = 0;
  await render({
    ...base,
    canComment: true,
    threads: [openRoot],
    onAttach: () => {
      staged += 1;
      return Promise.resolve({
        sourceId: sourceId(staged),
        original: managed(`Plik ${staged}.pdf`),
      });
    },
  });
  for (let index = 0; index < 20; index += 1)
    await click(
      control(container, "Attach file", "the Attach control disappeared"),
    );

  assert.equal(
    control(container, "Attach file", "the Attach control disappeared")
      .disabled,
    true,
  );
  assert.equal(
    (form().textContent ?? "").includes("20 attachments is the limit."),
    true,
    "the cap greys the control out and gives no reason, which reads as broken",
  );
});

// ── 6. RECORD-SCOPED RESET ────────────────────────────────────────────────

test("nothing typed on one record is carried onto the next one opened", async () => {
  await render({ ...base, canComment: true });
  const chip = (): HTMLButtonElement =>
    one(
      container,
      "[data-principal-id][aria-pressed]",
      "the composer names nobody",
    );
  await click(chip());
  await typeInto(composer(), "Do potwierdzenia z Martą.");
  await click(
    control(entryOf(rootId), "Reply", "an open root offers no way to answer"),
  );
  assert.equal(chip().getAttribute("aria-pressed"), "true");

  // The next record. A mention left selected here and sent from there wakes
  // somebody about a record they were never discussing.
  await render({ ...base, canComment: true, recordKey: "project-b" });
  assert.equal(composer().value, "", "the draft followed the reader");
  assert.equal(
    chip().getAttribute("aria-pressed"),
    "false",
    "a mention chosen on one record is still armed on the next",
  );
  assert.equal(
    form().getAttribute("aria-label"),
    "New comment",
    "the reader is still answering a thread on a record they have left",
  );
});
