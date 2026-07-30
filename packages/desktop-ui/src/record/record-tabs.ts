import type {
  CaptureOriginal,
  KnowledgeSourceId,
} from "@constellation/contracts";

import type { CommentListProjection } from "../client/workflow.js";

// The tab bar every record screen wears, and the counts on it.
//
// Decision #28 turned the comment strip into a tab. That strip cost 336 px on
// every record to show one comment, and the price of removing it is named: a
// strip was seen in passing, a tab will not show itself. The COUNT is the
// compensation — the same job "Tasks 14" does.
//
// The name is `Comments` and not `Margin`. "Margin" already means the markup on
// an offer in this product, and one word with two unrelated meanings inside one
// application is worse than a plain name. "Discussion" was rejected for
// sounding like a forum, which is the thing this deliberately is not.

export const RECORD_TABS = [
  "overview",
  "tasks",
  "documents",
  "comments",
  "activity",
] as const;
export type RecordTab = (typeof RECORD_TABS)[number];

export const RECORD_TAB_LABELS: Record<RecordTab, string> = {
  overview: "Overview",
  tasks: "Tasks",
  documents: "Documents",
  comments: "Comments",
  activity: "Activity",
};

/**
 * A stored tab key that no longer exists falls back to Overview.
 *
 * Not defensive programming — `Comments` is new on all three record kinds and
 * the keys in circulation predate it, so stale keys are not hypothetical.
 * Without the fallback the strip renders with nothing selected and its
 * `aria-labelledby` points at an id that is not on the page.
 */
export const restoreTab = (stored: string | undefined): RecordTab =>
  RECORD_TABS.includes(stored as RecordTab)
    ? (stored as RecordTab)
    : "overview";

export type CommentThread = CommentListProjection["threads"][number];

/**
 * An attachment already saved on a comment, as the projection answers it.
 *
 * Derived, never restated. A hand-written copy of this shape is the repeat
 * defect this repo has already paid for three times: the second spelling drifts
 * from the first and only a strict parse at runtime says so.
 */
export type CommentAttachment = CommentThread["attachments"][number];

/**
 * What an inspection can say about a saved attachment's file on this device.
 *
 * Two answers and not three: "checking" is the panel WAITING for one of these,
 * so it belongs to the panel rather than to the shell that answers. Admitting
 * it here would let a caller return a state that never settles into anything.
 */
export type AttachmentCustody = "available" | "unavailable";

/**
 * An attachment staged in the composer and not yet written to a comment.
 *
 * Only the SHELL can produce one — it alone reaches managed storage — so the
 * shape lives here beside `CommentActor` for the same reason that one does:
 * the shell must be able to name what it hands the panel without importing the
 * panel, which would drag the panel's stylesheet onto the hot path. The
 * contracts import above is type-only and erases to nothing.
 */
export interface PendingAttachment {
  readonly sourceId: KnowledgeSourceId;
  readonly original: Extract<
    CaptureOriginal,
    { kind: "managed_file" | "screenshot" }
  >;
}

/**
 * Who wrote a comment, already resolved.
 *
 * It lives here rather than beside the panel that draws it because the SHELL
 * resolves it — from agent grants and mention candidates it holds and the panel
 * does not — and the shell is on the hot path. A resolver reaching into the
 * panel's module would drag the panel and its stylesheet along with it, which
 * is exactly what a record screen is lazy to avoid.
 *
 * The projection carries only `{ principalId?, displayName }` — no agent flag
 * and no role — so the panel cannot work this out and does not guess.
 */
export interface CommentActor {
  readonly name: string;
  /** Initials for a human; the agent mark replaces it for an agent. */
  readonly short: string;
  readonly agent: boolean;
  /** Stated in words beside an agent's name — colour is never the carrier. */
  readonly role: string;
}

export const SYSTEM_ACTOR: CommentActor = {
  name: "Constellation",
  short: "··",
  agent: false,
  role: "system",
};

/**
 * A ROOT: a comment that opens a conversation rather than answering one.
 *
 * `rootCommentId` is deliberately NOT consulted, and that is a proof rather
 * than an omission. The kernel writes both fields from one ternary on the
 * resolved parent (`application/src/wave2.ts:7503-7504`): `parentCommentId`
 * appears only when a parent was found, and `rootCommentId` falls back to the
 * comment's own id when it was not. Neither `editComment` nor
 * `setCommentThreadState` can break that pairing — both spread the record whole
 * (`domain/src/comment.ts:13, 43`) — and the store round-trips the record as
 * one JSON payload, so nothing narrows it in transit. INVARIANT:
 * `parentCommentId === undefined` implies `rootCommentId === id`. A root can
 * therefore never also satisfy a foreign root's reply predicate below, and a
 * guard against that would be defending against a shape the kernel cannot emit.
 */
const isRoot = (thread: CommentThread): boolean =>
  thread.parentCommentId === undefined;

/**
 * THE reading of "still open on this record" — one function, three readers.
 *
 * The tab count, the tree builder and the resolved valve each used to spell
 * this predicate out for themselves. Three copies is two chances for the badge
 * to claim something the panel underneath it contradicts, and two answers to
 * one question is this repo's named repeat defect. Absent threads are a reading
 * too: a record whose comments have not loaded has nothing open, not an unknown
 * number of open threads.
 */
export const openRoots = (
  threads: readonly CommentThread[] | undefined,
): readonly CommentThread[] =>
  threads === undefined
    ? []
    : threads.filter(
        (thread) => isRoot(thread) && thread.threadState === "open",
      );

/**
 * What the `Comments` count means, and why it is not the number of comments.
 *
 * The domain has no read state — `RecordComment` carries none — so an unread
 * count cannot be computed, and the named compensation for decision #28 stays
 * unbuilt rather than faked from something adjacent. What the badge CAN say
 * honestly is the same thing "Tasks 14" says: how many things are still open.
 * So it counts unresolved ROOT threads; a reply is part of a conversation, not
 * another one.
 */
export const openThreadCount = (
  threads: readonly CommentThread[] | undefined,
): number => openRoots(threads).length;

/**
 * Roots and their replies, two levels and no deeper.
 *
 * Anything nested further is pinned to its root rather than indented again:
 * this panel is meant to be READ, and a thread that can nest without limit
 * becomes a thing you collapse instead. Sorted oldest first, because a
 * conversation reads forwards.
 */
export interface CommentTree {
  readonly root: CommentThread;
  readonly replies: readonly CommentThread[];
}

export const buildThreads = (
  threads: readonly CommentThread[],
): readonly CommentTree[] => {
  const byTime = [...threads].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
  return byTime.filter(isRoot).map((root) => ({
    root,
    replies: byTime.filter(
      (candidate) =>
        candidate.id !== root.id &&
        (candidate.parentCommentId === root.id ||
          candidate.rootCommentId === root.id),
    ),
  }));
};

/**
 * The three things the Comments panel can be, kept apart on purpose.
 *
 * "Nothing open" and "no comments at all" are different facts about a record,
 * and collapsing them into one empty state tells a reader a record has never
 * been discussed when in truth every thread was settled.
 */
export type CommentsState =
  | { readonly kind: "threads"; readonly trees: readonly CommentTree[] }
  | { readonly kind: "all_resolved"; readonly hidden: number }
  | { readonly kind: "none" };

export const commentsState = (
  threads: readonly CommentThread[],
  showResolved: boolean,
): CommentsState => {
  const trees = buildThreads(threads);
  if (trees.length === 0) return { kind: "none" };
  // Routed through `openRoots` rather than re-reading `threadState` here: the
  // valve must hide exactly what the tab counts, and one function is the only
  // thing that keeps that true when the definition of "open" next moves.
  const open = new Set(openRoots(threads).map((thread) => thread.id));
  const visible = showResolved
    ? trees
    : trees.filter((tree) => open.has(tree.root.id));
  if (visible.length > 0) return { kind: "threads", trees: visible };
  return { kind: "all_resolved", hidden: trees.length };
};
