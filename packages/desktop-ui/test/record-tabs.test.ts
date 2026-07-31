/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  CommentIdSchema,
  PrincipalIdSchema,
  type CommentId,
} from "@constellation/contracts";

import type { CommentListProjection } from "../src/client/workflow.js";
import {
  RECORD_TABS,
  RECORD_TAB_LABELS,
  buildThreads,
  commentsState,
  openRoots,
  openThreadCount,
  restoreTab,
  type CommentsState,
} from "../src/record/record-tabs.js";

// Decision #28 moved comments off the record body and onto a tab, and every
// promise made to pay for that move — the name, the count, the two levels, the
// three empty states — is a decision that lives in one function each. A render
// test can only see that SOMETHING said "Comments"; these assertions pin what
// the word counts and what happens to a record nobody ever opened again.

// The fixtures are the projection's own row type, so a contract change breaks
// them at the compiler instead of letting them describe comments the kernel
// stopped sending. `CommentThread` in record-tabs.ts is this same type.
type Thread = CommentListProjection["threads"][number];

const uuid = (prefix: string, index: number): string =>
  `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

// Parsed rather than cast: a malformed identifier fails here instead of
// travelling through the tree builder as a string that joins to nothing.
const commentId = (index: number): CommentId =>
  CommentIdSchema.parse(uuid("c", index));

const AUTHOR = {
  principalId: PrincipalIdSchema.parse(uuid("a", 1)),
  displayName: "Zofia Ląd",
} as const;

// Every stamp is distinct. `Array.prototype.sort` is stable, so two comments
// written in the same second would take their order from the INPUT array and
// the ordering assertions below would pass without a comparator.
const at = (minute: number): string =>
  `2026-07-28T09:${String(minute).padStart(2, "0")}:00.000Z`;

/**
 * A root, which points its `rootCommentId` at ITSELF.
 *
 * That self-reference is why `buildThreads` carries an identity guard on its
 * reply predicate: without it a root matches that predicate and appears
 * underneath itself. A fixture that pointed roots elsewhere would leave the
 * guard untestable.
 */
const root = (
  id: CommentId,
  createdAt: string,
  threadState: Thread["threadState"] = "open",
): Thread => ({
  id,
  rootCommentId: id,
  body: "Czy ten termin jest jeszcze realny?",
  author: AUTHOR,
  mentionPrincipalIds: [],
  attachments: [],
  threadState,
  version: 1,
  createdAt,
  updatedAt: createdAt,
  edited: false,
});

const reply = (
  id: CommentId,
  createdAt: string,
  parentCommentId: CommentId,
  rootCommentId: CommentId,
  threadState: Thread["threadState"] = "open",
): Thread => ({
  id,
  parentCommentId,
  rootCommentId,
  body: "Przesunęliśmy go po rozmowie z klientem.",
  author: AUTHOR,
  mentionPrincipalIds: [],
  attachments: [],
  threadState,
  version: 1,
  createdAt,
  updatedAt: createdAt,
  edited: false,
});

/** Root ids of a state, without leaning on a narrowing that can go dead. */
const shownRoots = (state: CommentsState): readonly string[] =>
  state.kind === "threads" ? state.trees.map((tree) => tree.root.id) : [];

// `offers` is the sixth member, added with the opportunity record — the first
// record kind whose history of versions is a section rather than a chip on a
// card. The list is the VOCABULARY, not any one record's bar: every kind names
// its own subset, so nothing that shipped with five tabs grew a sixth.
//
// The whole list is pinned rather than a membership test, and deliberately: a
// key is what lands in stored device state, in `data-record-tab` and in every
// id on the strip, so a key added without a label leaves a nameless tab and a
// label added without a key is dead. Both halves move together or the test
// says so.
test("the record's tab vocabulary is exactly these six, in the agreed order", () => {
  assert.deepEqual(
    [...RECORD_TABS],
    ["overview", "tasks", "offers", "documents", "comments", "activity"],
  );
  assert.deepEqual(
    RECORD_TABS.map((key) => RECORD_TAB_LABELS[key]),
    ["Overview", "Tasks", "Offers", "Documents", "Comments", "Activity"],
  );
});

test("the comments tab is named Comments — Margin means money in this product", () => {
  // Both halves are needed. The label list still reads "Comments" if the KEY is
  // renamed to `margin` and the label left alone, and the key is what ends up
  // in stored state, in `data-tab` and in every id on the strip.
  const keys: readonly string[] = RECORD_TABS;
  const labels = Object.values(RECORD_TAB_LABELS);
  assert.ok(keys.includes("comments"), keys.join(", "));
  assert.ok(labels.includes("Comments"), labels.join(", "));

  // "Margin" already means the markup on an offer here; "Discussion" was
  // rejected for sounding like a forum. Only the two names the decision
  // actually rejected are listed — a longer list would invent history.
  for (const rejected of ["margin", "discussion"]) {
    assert.equal(
      keys.includes(rejected),
      false,
      `${rejected} came back as a key`,
    );
    assert.equal(
      labels.some((label) => label.toLowerCase() === rejected),
      false,
      `${rejected} came back as a label`,
    );
  }
});

test("a stale tab key falls back to Overview and a known key is left alone", () => {
  // `Comments` is new on all three record kinds, so keys stored before it are
  // genuinely in circulation — this is not defensive programming.
  assert.equal(restoreTab("margin"), "overview");
  assert.equal(restoreTab("comment"), "overview");
  assert.equal(restoreTab(""), "overview");
  assert.equal(restoreTab(undefined), "overview");

  // Every known key, not one: a fallback that swallowed a valid key would send
  // every reader back to Overview on reopen and still pass a single case.
  for (const key of RECORD_TABS) {
    assert.equal(restoreTab(key), key, `${key} was rewritten`);
  }
});

test("the Comments count is unresolved ROOT threads, not comments", () => {
  // It is not an UNREAD count and cannot be: `RecordComment` carries no read
  // state, so the compensation named for decision #28 stays unbuilt rather than
  // faked from something adjacent. Open roots is what can be said honestly, and
  // it is the same sentence "Tasks 14" makes.
  const openRoot = root(commentId(1), at(1));
  const answer = reply(commentId(2), at(2), openRoot.id, openRoot.id);
  const settled = root(commentId(3), at(3), "resolved");
  // Deliberately still open under a SETTLED root: counting open comments
  // instead of open roots would report this record as having a live thread.
  const settledAnswer = reply(
    commentId(4),
    at(4),
    settled.id,
    settled.id,
    "open",
  );

  assert.equal(openThreadCount([openRoot]), 1);
  assert.equal(openThreadCount([openRoot, answer]), 1);
  assert.equal(openThreadCount([openRoot, answer, settled, settledAnswer]), 1);
  assert.equal(openThreadCount([settled, settledAnswer]), 0);
  assert.equal(openThreadCount([]), 0);
  assert.equal(openThreadCount(undefined), 0);
});

test("the panel shows exactly the roots the tab counts", () => {
  // `openRoots` is THE reading of "still open on this record", and the badge,
  // the tree builder and the resolved valve were all routed through it. Nothing
  // pinned that: every test above measures one reading against a LITERAL, and a
  // literal cannot notice that the other reading moved. So this compares the two
  // readings TO EACH OTHER — the number the panel would show against the number
  // on the tab — which is the promise the extraction was made to keep.
  const open = root(commentId(1), at(1));
  const settled = root(commentId(2), at(2), "resolved");
  // OPEN and under the SETTLED root, deliberately. That is the one shape that
  // tells the two readings apart: a valve re-inlined to treat "has a live
  // answer" as open would show two roots while the tab still said one, and no
  // fixture of roots without replies can see it.
  const answer = reply(commentId(3), at(3), settled.id, settled.id, "open");
  const threads = [open, settled, answer];

  const shown = commentsState(threads, false);
  assert.equal(shown.kind, "threads");
  const showing = shownRoots(shown);
  const counted = openThreadCount(threads);
  // IDENTITIES, not counts. Two lengths agree just as readily when the valve is
  // inverted — it would then show the settled root and hide the open one, one
  // for one — so a count comparison passes over the exact drift this pins.
  assert.deepEqual(
    showing,
    openRoots(threads).map((thread) => thread.id),
    `the tab says ${counted} open and the panel shows ${showing.length}`,
  );
  assert.equal(showing.length, counted);
  // Neither may be zero, or the equality above holds over nothing at all.
  assert.ok(counted > 0, "the fixture carries no open root");
  // And the settled root is genuinely there to be excluded: asked for, it
  // appears, which is one MORE than the tab counts. Without this the equality
  // would also pass on a fixture the valve had nothing to hide from.
  assert.equal(
    shownRoots(commentsState(threads, true)).length,
    counted + 1,
    "the resolved root is not being hidden from the open list",
  );
});

test("threading is two levels — a reply to a reply is pinned to the root", () => {
  // Three deep on the wire: C answers B, B answers A, and the kernel keeps
  // `rootCommentId` on A throughout. The panel is meant to be READ, and a
  // thread that nests without limit becomes a thing you collapse instead.
  const a = root(commentId(1), at(1));
  const b = reply(commentId(2), at(2), a.id, a.id);
  const c = reply(commentId(3), at(3), b.id, a.id);

  const trees = buildThreads([a, b, c]);
  assert.equal(trees.length, 1);
  const [only] = trees;
  assert.ok(only);
  assert.equal(only.root.id, a.id);
  assert.deepEqual(
    only.replies.map((entry) => entry.id),
    [b.id, c.id],
  );
  // B has a child of its own and is still NOT a level: promoting any comment
  // with children to a root is exactly the third level this forbids.
  assert.equal(
    trees.some((tree) => tree.root.id === b.id),
    false,
  );
  assert.equal(
    trees.some((tree) => tree.root.id === c.id),
    false,
  );
});

test("a reply is matched by its parent OR its root, and a root is never its own reply", () => {
  const a = root(commentId(1), at(1));
  const byParent = reply(commentId(2), at(2), a.id, a.id);
  // Answers B, so only `rootCommentId` ties it to A.
  const byRoot = reply(commentId(3), at(3), byParent.id, a.id);
  // Names A as its parent while its root points at a thread absent from this
  // set. Well-formed data can never isolate the parent branch — every real
  // reply matches both — so deleting that branch would go unnoticed without it.
  const parentOnly = reply(commentId(4), at(4), a.id, commentId(9));

  const trees = buildThreads([a, byParent, byRoot, parentOnly]);
  const [only] = trees;
  assert.ok(only);
  assert.deepEqual(
    only.replies.map((entry) => entry.id),
    [byParent.id, byRoot.id, parentOnly.id],
  );
  assert.equal(
    only.replies.some((entry) => entry.id === a.id),
    false,
    "the root appeared underneath itself",
  );
});

test("a conversation reads forwards — roots and replies both oldest first", () => {
  const first = root(commentId(1), at(1));
  const second = root(commentId(2), at(2));
  const third = root(commentId(3), at(3));
  const early = reply(commentId(4), at(4), first.id, first.id);
  const middle = reply(commentId(5), at(5), first.id, first.id);
  const late = reply(commentId(6), at(6), middle.id, first.id);

  // Roots and replies are BOTH out of order in the input. Shuffling one only
  // would leave the other assertion passing on input order alone.
  const trees = buildThreads([third, late, first, middle, second, early]);
  assert.deepEqual(
    trees.map((tree) => tree.root.id),
    [first.id, second.id, third.id],
  );
  const [opening] = trees;
  assert.ok(opening);
  assert.deepEqual(
    opening.replies.map((entry) => entry.id),
    [early.id, middle.id, late.id],
  );
});

test("all threads resolved is NOT the same state as never discussed", () => {
  // Collapsing the two tells a reader a record was never discussed when in
  // truth every thread on it was settled. They are different facts.
  const settledOne = root(commentId(1), at(1), "resolved");
  const settledTwo = root(commentId(2), at(2), "resolved");
  const answers = [
    reply(commentId(3), at(3), settledOne.id, settledOne.id, "resolved"),
    reply(commentId(4), at(4), settledTwo.id, settledTwo.id, "resolved"),
  ];

  const settledThreads = [settledOne, settledTwo, ...answers];
  const allResolved = commentsState(settledThreads, false);
  // `hidden` is two threads, not four comments — that is what the reader is
  // being offered to unhide.
  assert.deepEqual(allResolved, { kind: "all_resolved", hidden: 2 });

  const untouched = commentsState([], false);
  assert.deepEqual(untouched, { kind: "none" });
  assert.notDeepEqual(allResolved, untouched);

  // The third state is the ordinary one, and it must be neither of the others.
  const live = commentsState([root(commentId(5), at(5))], false);
  assert.equal(live.kind, "threads");
  assert.notDeepEqual(live, allResolved);
  assert.notDeepEqual(live, untouched);
});

test("the resolved valve shows settled threads when asked for them", () => {
  const live = root(commentId(1), at(1));
  const settled = root(commentId(2), at(2), "resolved");

  const closed = commentsState([live, settled], false);
  assert.equal(closed.kind, "threads");
  assert.deepEqual(shownRoots(closed), [live.id]);

  const opened = commentsState([live, settled], true);
  assert.equal(opened.kind, "threads");
  assert.deepEqual(shownRoots(opened), [live.id, settled.id]);

  // Asked for on a record where everything is settled, the valve gives threads
  // — not the empty state that exists precisely because it was NOT asked for.
  const everythingSettled = commentsState([settled], true);
  assert.equal(everythingSettled.kind, "threads");
  assert.deepEqual(shownRoots(everythingSettled), [settled.id]);
});
