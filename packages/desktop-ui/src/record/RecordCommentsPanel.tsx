import { useState, type FormEvent } from "react";

import type { PrincipalId } from "@constellation/contracts";

import { Icon } from "../components/Icon.js";
import { countLabel, formatDate, formatTime } from "../i18n.js";
import {
  buildThreads,
  commentsState,
  type CommentThread,
  type CommentTree,
} from "./record-tabs.js";
import styles from "./record-comments.module.css";

// The Comments tab, in ONE implementation shared by the task, project and
// organization records. Decision #28 made it a tab; what follows is the rule
// the tab exists to enforce.
//
// A COMMENT DOES NOT WAKE ANYONE, A MENTION DOES. A plain comment creates no
// Inbox item; only a mention emits `comment_mention`. That single valve is what
// keeps the Inbox from becoming a bin, and it is exactly what lets an agent
// write as much as it wants: the volume costs the reader nothing until somebody
// is named. The footer badge is where that becomes visible — the mention badge
// says "this one reached the Inbox", and it is the only thing in the panel
// wearing the accent, because it marks the one comment that woke somebody.
//
// The panel draws NO `data-row`, so it never joins the record's roving tab
// stop, and it takes no `itemProps` — an index spent here would be an index the
// visible list no longer has. It also carries no heading of its own: the tab
// names this section, and a second name would be an orphan in the outline.
//
// Threading, the resolved filter and the three bodies are NOT decided here.
// They come from `record-tabs.ts`, because the count on the tab and the content
// of the panel have to be the same reading of the same threads — two answers to
// one question is this repo's named repeat defect.

/**
 * Who wrote a comment, already resolved.
 *
 * The projection carries only `{ principalId?, displayName }` — no agent flag
 * and no role — so this panel cannot work it out and does not guess. The
 * integrator resolves it from the PRINCIPAL first (Hermes and Claude Code hold
 * separate grants, so they are separate identities and the panel must show
 * that), then from a Person record, then falls back to `SYSTEM_ACTOR`.
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

/** `@Zieliński` is one mention. The class is Unicode letters, not `\w`: record
 *  content is Polish and `\w` would cut the name in half. */
const MENTION = /(@[\p{L}\p{M}'-]+)/gu;
const isMention = (part: string): boolean => /^@[\p{L}\p{M}'-]+$/u.test(part);

/** The body is plain text and is rendered as plain text. `RecordComment.body`
 *  is a string in the contract, so there is no markup to restore and nothing
 *  that would justify handing React raw HTML. */
const CommentBody = ({ body }: { readonly body: string }) => (
  <>
    {body.split(/\n{2,}/u).map((paragraph, index) => (
      <p className={styles.text} key={index}>
        {paragraph.split(MENTION).map((part, partIndex) =>
          isMention(part) ? (
            <span className={styles.at} key={partIndex}>
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </p>
    ))}
  </>
);

const CommentEntry = ({
  comment,
  actor,
  mentionNameOf,
  timeZone,
}: {
  readonly comment: CommentThread;
  readonly actor: CommentActor;
  readonly mentionNameOf: (principalId: PrincipalId) => string;
  readonly timeZone: string | undefined;
}) => {
  const resolved = comment.threadState === "resolved";
  // Called with one argument on purpose: `map` also passes the index, and a
  // resolver that happens to take a second parameter would silently receive it.
  const mentioned = comment.mentionPrincipalIds.map((id) => mentionNameOf(id));
  return (
    <article
      className={`${styles.entry} ${actor.agent ? styles.entryAgent : ""} ${
        resolved ? styles.entryResolved : ""
      }`}
    >
      <header className={styles.head}>
        {/* Agent and human differ by MARK before they differ by colour: a
            spark against initials, and the word "agent" beside the name. */}
        <span
          aria-hidden="true"
          className={`${styles.mark} ${actor.agent ? styles.markAgent : ""}`}
        >
          {actor.agent ? "✦" : actor.short}
        </span>
        <span className={styles.author}>{actor.name}</span>
        {actor.agent && (
          <span className={styles.kind}>agent · {actor.role}</span>
        )}
        {/* Comment stamps are ISO with a `T`; the app's own formatters read
            that and put the workspace timezone on it. No comma of ours between
            them — `formatDate` already carries one before the year. */}
        <time className={styles.stamp} dateTime={comment.createdAt}>
          {formatDate(comment.createdAt, timeZone)}{" "}
          {formatTime(comment.createdAt, timeZone)}
        </time>
      </header>
      <CommentBody body={comment.body} />
      {(mentioned.length > 0 || resolved) && (
        <footer className={styles.footer}>
          {mentioned.length > 0 && (
            <span className={`${styles.badge} ${styles.badgeMention}`}>
              <Icon name="attention" />
              <span>mentioned {mentioned.join(", ")} — reached the Inbox</span>
            </span>
          )}
          {resolved && (
            <span className={styles.badge}>
              <span aria-hidden="true" className={styles.glyph}>
                ✓
              </span>
              <span>resolved</span>
            </span>
          )}
        </footer>
      )}
    </article>
  );
};

const CommentThreadView = ({
  tree,
  actorOf,
  mentionNameOf,
  timeZone,
}: {
  readonly tree: CommentTree;
  readonly actorOf: (comment: CommentThread) => CommentActor;
  readonly mentionNameOf: (principalId: PrincipalId) => string;
  readonly timeZone: string | undefined;
}) => (
  <div className={styles.thread}>
    <CommentEntry
      actor={actorOf(tree.root)}
      comment={tree.root}
      mentionNameOf={mentionNameOf}
      timeZone={timeZone}
    />
    {tree.replies.length > 0 && (
      <div className={styles.replies}>
        {tree.replies.map((reply) => (
          <CommentEntry
            actor={actorOf(reply)}
            comment={reply}
            key={reply.id}
            mentionNameOf={mentionNameOf}
            timeZone={timeZone}
          />
        ))}
      </div>
    )}
  </div>
);

export const RecordCommentsPanel = ({
  threads,
  recordKey,
  actorOf,
  mentionNameOf,
  onSubmit,
  busy = false,
  timeZone,
}: {
  readonly threads: readonly CommentThread[];
  /** Identifies the record on screen. The resolved valve is keyed by it, so
   *  opening the next record starts closed again without an effect. */
  readonly recordKey: string;
  readonly actorOf: (comment: CommentThread) => CommentActor;
  readonly mentionNameOf: (principalId: PrincipalId) => string;
  /** Resolves true once the write is confirmed. The draft is cleared only
   *  then, so a refused command never eats what somebody typed. */
  readonly onSubmit: (body: string) => Promise<boolean>;
  readonly busy?: boolean;
  readonly timeZone?: string | undefined;
}) => {
  // The valve remembers WHICH record it was opened on, not merely that it was
  // opened: a boolean would carry "showing resolved" into the next record.
  const [openedOn, setOpenedOn] = useState<string>();
  const [draft, setDraft] = useState("");
  const showResolved = openedOn === recordKey;

  const trees = buildThreads(threads);
  const resolvedRoots = trees.filter(
    (tree) => tree.root.threadState === "resolved",
  ).length;
  const state = commentsState(threads, showResolved);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (body === "" || busy) return;
    void onSubmit(body).then((saved) => {
      if (saved) setDraft("");
    });
  };

  return (
    <div className={styles.panel}>
      {/* Resolved threads are hidden by default. Without the valve the tab
          becomes an archive nobody scrolls; with it, settled work stays
          reachable and is never the first thing read. The toggle itself
          disappears when there is nothing settled — "Show 0 resolved" is a
          control that does nothing. */}
      {resolvedRoots > 0 && (
        <div className={styles.valve}>
          <button
            aria-pressed={showResolved}
            className={styles.toggle}
            onClick={() => setOpenedOn(showResolved ? undefined : recordKey)}
            type="button"
          >
            {showResolved ? "Hide" : "Show"} {resolvedRoots} resolved
          </button>
        </div>
      )}

      {state.kind === "threads" && (
        <div className={styles.threads}>
          {state.trees.map((tree) => (
            <CommentThreadView
              actorOf={actorOf}
              key={tree.root.id}
              mentionNameOf={mentionNameOf}
              timeZone={timeZone}
              tree={tree}
            />
          ))}
        </div>
      )}

      {/* "Nothing open" and "never discussed" are different facts about a
          record, and one sentence covering both would tell a reader nobody has
          ever written here when in truth every thread was settled. */}
      {state.kind === "all_resolved" && (
        <p className={styles.empty}>
          Nothing open — {countLabel(state.hidden, "resolved thread")}{" "}
          {state.hidden === 1 ? "is" : "are"} hidden.
        </p>
      )}
      {state.kind === "none" && (
        <p className={styles.empty}>No comments on this record yet.</p>
      )}

      <form className={styles.composer} onSubmit={submit}>
        <textarea
          aria-label="Write a comment"
          className={styles.field}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a comment — @ to mention"
          rows={2}
          value={draft}
        />
        {/* Disabled only while there is nothing to send or a write is in
            flight. A control greyed out for no stated reason is a dummy, and
            dummies are a named defect here. */}
        <button
          className={styles.submit}
          disabled={busy || draft.trim() === ""}
          type="submit"
        >
          Comment
        </button>
      </form>
    </div>
  );
};
