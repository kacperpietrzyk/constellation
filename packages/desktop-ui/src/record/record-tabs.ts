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
): number =>
  threads === undefined
    ? 0
    : threads.filter(
        (thread) =>
          thread.parentCommentId === undefined && thread.threadState === "open",
      ).length;

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
  return byTime
    .filter((thread) => thread.parentCommentId === undefined)
    .map((root) => ({
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
  const visible = showResolved
    ? trees
    : trees.filter((tree) => tree.root.threadState === "open");
  if (visible.length > 0) return { kind: "threads", trees: visible };
  return { kind: "all_resolved", hidden: trees.length };
};
