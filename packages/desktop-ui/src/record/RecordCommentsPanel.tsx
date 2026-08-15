import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import type { KnowledgeSourceId, PrincipalId } from "@constellation/contracts";

import { Icon } from "../components/Icon.js";
import { countLabel, formatDate, formatTime } from "../i18n.js";
import {
  buildThreads,
  commentsState,
  type AttachmentCustody,
  type CommentActor,
  type CommentAttachment,
  type CommentThread,
  type CommentTree,
  type PendingAttachment,
} from "./record-tabs.js";
import { initialsOf } from "./record-actors.js";
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
// one question is this repo's named repeat defect. That single reading is
// `openRoots`, and the badge, the tree builder and the valve all go through it.

// `CommentActor`, `SYSTEM_ACTOR` and the two attachment shapes are declared in
// `record-tabs.ts`, not here: the SHELL resolves an author from grants this
// panel never sees and stages the files it hands over, and the shell is on the
// hot path — naming those shapes from this module would pull the panel and its
// stylesheet along. Re-exported so a reader who starts at the panel still finds
// the shapes it draws.
export type {
  AttachmentCustody,
  CommentActor,
  CommentAttachment,
  PendingAttachment,
} from "./record-tabs.js";
export { SYSTEM_ACTOR } from "./record-tabs.js";

/** `@Zieliński` is one mention. The class is Unicode letters, not `\w`: record
 *  content is Polish and `\w` would cut the name in half. */
const MENTION = /(@[\p{L}\p{M}'-]+)/gu;
const isMention = (part: string): boolean => /^@[\p{L}\p{M}'-]+$/u.test(part);

/** A body long enough that nobody writes it by accident, and short enough that
 *  the kernel accepts it. The composer and the editor carry the SAME cap: a
 *  reader who can write 16 000 characters into one and 60 000 into the other
 *  finds out which is which only when the write is refused. */
const BODY_LIMIT = 16_000;

/** Staged files per comment. The older panel greyed the Attach control at this
 *  number and said nothing, which reads as a broken button. */
const ATTACHMENT_LIMIT = 20;

/** What the panel knows about one saved attachment's file. `checking` is this
 *  panel waiting for an answer, which is why it is not part of the shell's
 *  `AttachmentCustody` — a shell that could return it would be returning a
 *  state that never settles. */
type CustodyState = AttachmentCustody | "checking";

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

/**
 * Everything an entry reads that the PANEL owns, in one bag.
 *
 * Eighteen separate props threaded through the thread view would be eighteen
 * chances to pass the root's editor to a reply. None of this is an entry's own
 * state — the panel holds the single open editor, the drafts kept per comment
 * and the custody answers, because those have to survive the entry unmounting
 * when a thread is filtered away.
 */
interface EntryTools {
  readonly actorOf: (comment: CommentThread) => CommentActor;
  readonly mentionNameOf: (principalId: PrincipalId) => string;
  readonly timeZone: string | undefined;
  readonly busy: boolean;
  /** Absent means custody cannot be asked about at all, and no chip is drawn.
   *  The older panel left the chip reading "Checking storage…" forever. */
  readonly custodyOf:
    ((attachment: CommentAttachment) => CustodyState) | undefined;
  readonly onRestore: ((attachment: CommentAttachment) => void) | undefined;
  readonly onUnlink:
    | ((comment: CommentThread, attachment: CommentAttachment) => void)
    | undefined;
  readonly editingId: CommentThread["id"] | undefined;
  readonly mayEdit: (comment: CommentThread) => boolean;
  readonly draftKept: (comment: CommentThread) => boolean;
  readonly onBeginEdit: (comment: CommentThread) => void;
  readonly editor: (comment: CommentThread) => ReactNode;
}

const CommentEntry = ({
  comment,
  tools,
  actions,
}: {
  readonly comment: CommentThread;
  readonly tools: EntryTools;
  /** Root-only controls. A reply carries none: threading is two levels, so a
   *  Reply on a reply would write a sibling, and a thread is settled as a
   *  whole or not at all. */
  readonly actions?: ReactNode;
}) => {
  // Destructured before use so the narrowing survives into the callbacks
  // below: TypeScript drops a property's narrowing inside a closure.
  const { custodyOf, onRestore, onUnlink } = tools;
  const resolved = comment.threadState === "resolved";
  const actor = tools.actorOf(comment);
  const editing = tools.editingId === comment.id;
  const mayEdit = tools.mayEdit(comment);
  // Called with one argument on purpose: `map` also passes the index, and a
  // resolver that happens to take a second parameter would silently receive it.
  const mentioned = comment.mentionPrincipalIds.map((id) =>
    tools.mentionNameOf(id),
  );
  const kept = tools.draftKept(comment);
  return (
    <article
      className={`${styles.entry} ${actor.agent ? styles.entryAgent : ""} ${
        resolved ? styles.entryResolved : ""
      }`}
      data-comment-id={comment.id}
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
          {formatDate(comment.createdAt, tools.timeZone)}{" "}
          {formatTime(comment.createdAt, tools.timeZone)}
        </time>
      </header>
      {editing ? tools.editor(comment) : <CommentBody body={comment.body} />}
      {comment.attachments.length > 0 && (
        <ul aria-label="Comment attachments" className={styles.attachments}>
          {comment.attachments.map((attachment) => {
            const held = custodyOf?.(attachment);
            return (
              <li className={styles.attachment} key={attachment.sourceId}>
                <span className={styles.attachmentName}>
                  {attachment.original.payload.displayName}
                </span>
                <span className={styles.attachmentSize}>
                  {Math.ceil(attachment.original.payload.byteLength / 1024)} KB
                </span>
                {held !== undefined && (
                  <span
                    className={`${styles.custody} ${
                      held === "unavailable" ? styles.custodyOff : ""
                    }`}
                  >
                    {held === "available"
                      ? "In managed storage"
                      : held === "unavailable"
                        ? "Not on this device"
                        : "Checking storage…"}
                  </span>
                )}
                {held === "unavailable" && onRestore !== undefined && (
                  <button
                    className={styles.action}
                    disabled={tools.busy}
                    onClick={() => onRestore(attachment)}
                    type="button"
                  >
                    Restore
                  </button>
                )}
                {mayEdit && onUnlink !== undefined && (
                  <button
                    className={styles.action}
                    disabled={tools.busy}
                    onClick={() => onUnlink(comment, attachment)}
                    type="button"
                  >
                    Unlink
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
      {/* An edit is not a rewrite of history: the previous body stays in the
          activity log, and the entry says so — on a REPLY as much as on a
          root, which the older panel marked only on roots. */}
      {(comment.edited || kept || mayEdit || actions !== undefined) && (
        <div className={styles.actions}>
          {comment.edited && (
            <span className={styles.note}>Edited · history kept</span>
          )}
          {kept && <span className={styles.note}>Draft kept</span>}
          {actions}
          {mayEdit && !editing && (
            <button
              className={styles.action}
              disabled={tools.busy}
              onClick={() => tools.onBeginEdit(comment)}
              type="button"
            >
              Edit
            </button>
          )}
        </div>
      )}
    </article>
  );
};

const CommentThreadView = ({
  tree,
  tools,
  actions,
}: {
  readonly tree: CommentTree;
  readonly tools: EntryTools;
  readonly actions?: ReactNode;
}) => (
  <div className={styles.thread} data-thread-root={tree.root.id}>
    <CommentEntry actions={actions} comment={tree.root} tools={tools} />
    {tree.replies.length > 0 && (
      <div className={styles.replies} data-replies="">
        {tree.replies.map((reply) => (
          <CommentEntry comment={reply} key={reply.id} tools={tools} />
        ))}
      </div>
    )}
  </div>
);

/** Somebody who can be named, as the mention query answers it. */
export interface MentionCandidate {
  readonly principalId: PrincipalId;
  readonly displayName: string;
  readonly participantKind: "member" | "guest";
}

// The shape below is the whole agreement between this panel and the three
// records that mount it, and it was settled in one step rather than grown one
// capability at a time — otherwise each of replying, resolving, editing and
// attaching would have moved the same three mounts again, and the mounts drift
// apart on one of them.
//
// PERMISSION AND THE TWO WRITES ARE REQUIRED PROPS, NOT DEFAULTED ONES. Every
// record can be commented on, edited and settled, so a mount that says nothing
// about one of them is a mount that FORGOT, and a defaulted prop turns that
// into a capability which quietly is not there. Making them required puts the
// compiler on it. Staging files is the exception and stays optional, because
// not every mount reaches managed storage — and where it does not, the panel
// says so by drawing no control rather than a dead one.
export const RecordCommentsPanel = ({
  threads,
  threadsKnown,
  recordKey,
  actorOf,
  mentionNameOf,
  mentionCandidates = [],
  currentPrincipalId,
  currentDisplayName,
  canComment,
  canResolve,
  onSubmit,
  onEdit,
  onResolve,
  onAttach,
  onInspectAttachment,
  onRestoreAttachment,
  busy = false,
  timeZone,
}: {
  readonly threads: readonly CommentThread[];
  /** Whether that list is the ANSWER or merely what there is so far.
   *
   *  A read still in flight and a read that was refused both arrive here as an
   *  empty array, and an empty array is indistinguishable from a record nobody
   *  has written on. The panel used to be spared this question because a caller
   *  that could not read the comments drew a sentence INSTEAD of the panel —
   *  which also took away the composer, and a failed read has no business
   *  costing anybody the ability to write.
   *
   *  So the caller now says which it is. Required, not defaulted, for the
   *  reason stated above this component: a mount that forgets would go back to
   *  claiming "no comments on this record yet" on the evidence of a query that
   *  never answered. */
  readonly threadsKnown: boolean;
  /** Identifies the record on screen. Every unsent thing in this panel is
   *  keyed by it, so opening the next record starts from nothing typed. */
  readonly recordKey: string;
  readonly actorOf: (comment: CommentThread) => CommentActor;
  readonly mentionNameOf: (principalId: PrincipalId) => string;
  /** Who this comment can wake. Empty means nobody can be named — which the
   *  composer says out loud rather than showing a picker with nothing in it. */
  readonly mentionCandidates?: readonly MentionCandidate[];
  /** Who is reading. The VALUE may be absent — a shell whose access slice has
   *  not landed knows nobody yet — but the prop may not: editing belongs to an
   *  author, and an author may settle their own thread without the grant that
   *  settles anybody else's. */
  readonly currentPrincipalId: PrincipalId | undefined;
  /** JAK NAZYWA SIĘ CZYTELNIK — wyłącznie po to, żeby znacznik autora
   *  w kompozytorze niósł jego inicjały (rejestr, wpis #58).
   *
   *  OSOBNY PROP, A NIE ODCZYT Z `mentionCandidates`, I JEST KU TEMU POWÓD:
   *  wywołujący WYCINA czytelnika z listy kandydatów, zanim ją tu poda
   *  (`RealApp.tsx:2398`, `StrategicDepthSurface.tsx:1925`) — nie wzmiankuje
   *  się samego siebie — więc w tym komponencie nazwiska czytelnika po prostu
   *  nie ma. `mentionNameOf` też go nie zna: dla własnego principala zwraca
   *  słowo „You" (`record-actors.ts:143`), z którego inicjały byłyby literą
   *  „Y". Wartość może być pusta i wtedy znacznik rysuje glif osoby zamiast
   *  zmyślonych liter. */
  readonly currentDisplayName: string | undefined;
  /** Kept apart from `busy` on purpose. A control disabled because a write is
   *  in flight and one disabled because the grant is read-only are different
   *  facts about the same button, and folding them together leaves a reader
   *  looking at a dead control with no reason given. */
  readonly canComment: boolean;
  readonly canResolve: boolean;
  /** Resolves true once the write is confirmed. The draft is cleared only
   *  then, so a refused command never eats what somebody typed.
   *
   *  `parent` names the root being answered — the shell turns it into both the
   *  expected version and the stored parent, so a reply cannot be written
   *  against a thread that moved underneath it. A TWO-PARAMETER FUNCTION IS
   *  ASSIGNABLE HERE and silently drops it, landing the answer as a fresh root
   *  under a strip promising otherwise. TypeScript cannot see that, so every
   *  mount forwards all four arguments by hand. */
  readonly onSubmit: (
    body: string,
    mentions: readonly PrincipalId[],
    parent?: CommentThread,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  /** Answers true only once the edit lands, for the reason `onSubmit` does: a
   *  refused edit has to leave the typed text where the author left it.
   *
   *  Undefined is a MOUNT'S ANSWER, not a missing prop: it draws no Edit and no
   *  Unlink, so nothing offers a write the mount cannot perform. */
  readonly onEdit:
    | ((
        comment: CommentThread,
        body: string,
        attachmentSourceIds?: readonly KnowledgeSourceId[],
      ) => Promise<boolean>)
    | undefined;
  /** Answers whether the write landed, and the panel SAYS SO when it did not.
   *  The older panel returned nothing here, which left a refused resolve
   *  looking exactly like one that worked. */
  readonly onResolve:
    | ((comment: CommentThread, resolved: boolean) => Promise<boolean>)
    | undefined;
  /** Stages a file and answers with it, or with nothing when the reader backs
   *  out. Only the shell reaches managed storage; the panel never does. */
  readonly onAttach?:
    (() => Promise<PendingAttachment | undefined>) | undefined;
  /** Whether this device still holds the file behind a saved attachment.
   *  Absent means custody cannot be asked about — which the chip says, rather
   *  than waiting forever on an answer nobody is coming to give. */
  readonly onInspectAttachment?:
    ((attachment: CommentAttachment) => Promise<AttachmentCustody>) | undefined;
  readonly onRestoreAttachment?:
    ((attachment: CommentAttachment) => Promise<AttachmentCustody>) | undefined;
  readonly busy?: boolean;
  readonly timeZone?: string | undefined;
}) => {
  // The valve remembers WHICH record it was opened on, not merely that it was
  // opened: a boolean would carry "showing resolved" into the next record.
  const [openedOn, setOpenedOn] = useState<string>();
  const [draft, setDraft] = useState("");
  // Who this comment names, chosen from a list rather than parsed out of the
  // text. A resolver matching `@Kacper` against "Kacper Pietrzyk" guesses, and
  // a mention that resolves to the wrong person wakes the wrong person — while
  // one that silently resolves to nobody turns the whole valve into a dummy.
  const [mentions, setMentions] = useState<readonly PrincipalId[]>([]);
  const [replyTo, setReplyTo] = useState<CommentThread>();
  const [staged, setStaged] = useState<readonly PendingAttachment[]>([]);
  // At most one editor open, and a draft kept per comment: moving the editor to
  // another entry must not throw away what was typed in the first.
  const [editingId, setEditingId] = useState<CommentThread["id"]>();
  const [editDrafts, setEditDrafts] = useState<{
    readonly [id: string]: string;
  }>({});
  const [custody, setCustody] = useState<
    Readonly<Record<string, CustodyState>>
  >({});
  // Which thread's last settle was refused, if any. A resolve that answered
  // `false` and said nothing left the reader looking at an unchanged thread
  // with no account of why — the same shape as a control greyed out for no
  // stated reason, one step later.
  const [resolveRefused, setResolveRefused] = useState<CommentThread["id"]>();
  const [scopedTo, setScopedTo] = useState(recordKey);

  // EVERY UNSENT THING IS RECORD-SCOPED. Until the legacy inspector panel
  // retires, the only thing resetting a draft is a React `key` its caller
  // passes — and neither record mount passes one. A mention left selected on
  // one project and sent from the next wakes somebody about a record they were
  // never discussing, which is the one failure this panel exists to prevent.
  // Adjusted during render rather than in an effect, so no frame is ever drawn
  // with the previous record's text under the new record's heading.
  //
  // `custody` is deliberately NOT reset: it answers "does this device hold that
  // file", which is true or false regardless of which record is open.
  if (scopedTo !== recordKey) {
    setScopedTo(recordKey);
    setDraft("");
    setMentions([]);
    setReplyTo(undefined);
    setStaged([]);
    setEditingId(undefined);
    setEditDrafts({});
    setResolveRefused(undefined);
  }

  const showResolved = openedOn === recordKey;
  const trees = buildThreads(threads);
  const resolvedRoots = trees.filter(
    (tree) => tree.root.threadState === "resolved",
  ).length;
  const state = commentsState(threads, showResolved);

  // ONE expression for "what this editor would send", read by the Save gate, by
  // Save itself and by Unlink. The older panel spelled it two ways — the gate
  // read `editDrafts[id] ?? ""` while the save read `editDrafts[id] ??
  // comment.body` — so an entry whose draft had been cleared offered a Save
  // that sent the untouched body back.
  const bodyToSend = (comment: CommentThread): string =>
    (editDrafts[comment.id] ?? comment.body).trim();

  const clearDraft = (id: CommentThread["id"]): void =>
    setEditDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
    );

  const beginEdit = (comment: CommentThread): void => {
    setEditDrafts((current) =>
      current[comment.id] === undefined
        ? { ...current, [comment.id]: comment.body }
        : current,
    );
    setEditingId(comment.id);
  };

  const saveEdit = (comment: CommentThread): void => {
    const body = bodyToSend(comment);
    if (body === "" || busy || onEdit === undefined) return;
    void onEdit(comment, body).then((saved) => {
      if (!saved) return;
      setEditingId(undefined);
      clearDraft(comment.id);
    });
  };

  // Cancel CLOSES the editor and keeps the draft, which is the same answer
  // switching to another entry gives. The older panel destroyed it here and
  // kept it there — two answers to "where did my text go", and the destructive
  // one sat on the key people press to get out of the way.
  const cancelEdit = (): void => setEditingId(undefined);

  const editKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    comment: CommentThread,
  ): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      saveEdit(comment);
    } else if (event.key === "Escape") {
      event.preventDefault();
      // The inspector this panel can sit inside also closes on Escape. Without
      // this the key that leaves an editor also leaves the record.
      event.stopPropagation();
      cancelEdit();
    }
  };

  // Unlinking IS an edit: the command carries the remaining attachment ids and
  // the body. Which body is the whole question, and it turns on whether the
  // EDITOR IS OPEN. Open, it sends what the author is looking at — the older
  // panel sent the stored body and rolled back text that had just been typed.
  // Closed, it sends the STORED body, because the entry says "Draft kept" and a
  // kept draft is one nobody published: an unrelated click on Unlink must not
  // be what finally writes the text its author backed out of.
  const unlink = (
    comment: CommentThread,
    attachment: CommentAttachment,
  ): void => {
    const body =
      editingId === comment.id ? bodyToSend(comment) : comment.body.trim();
    if (body === "" || busy || onEdit === undefined) return;
    void onEdit(
      comment,
      body,
      comment.attachments
        .filter((item) => item.sourceId !== attachment.sourceId)
        .map((item) => item.sourceId),
    );
  };

  const setCustodyOf = (
    sourceId: KnowledgeSourceId,
    next: CustodyState,
  ): void => setCustody((current) => ({ ...current, [sourceId]: next }));

  // The shell's inspect callback is a plain arrow rebuilt on every render, so
  // keying the effect on it re-ran the whole inspection on re-renders that had
  // nothing to do with attachments — and the older panel replaced the map on
  // each run, flashing every chip back to "Checking storage…". This keys on the
  // ATTACHMENT IDS and reads the callback through a ref, and it MERGES: an id
  // already answered for keeps its answer.
  const inspectRef = useRef(onInspectAttachment);
  useEffect(() => {
    inspectRef.current = onInspectAttachment;
  });
  const savedAttachments = threads.flatMap((thread) => thread.attachments);
  const custodyKey = savedAttachments
    .map((attachment) => attachment.sourceId)
    .join(" ");
  useEffect(() => {
    const inspect = inspectRef.current;
    if (inspect === undefined) return undefined;
    let active = true;
    setCustody((current) => {
      const next = { ...current };
      for (const attachment of savedAttachments)
        if (next[attachment.sourceId] === undefined)
          next[attachment.sourceId] = "checking";
      return next;
    });
    void Promise.all(
      savedAttachments.map(async (attachment) => {
        const held = await inspect(attachment);
        if (active) setCustodyOf(attachment.sourceId, held);
      }),
    );
    return () => {
      active = false;
    };
  }, [custodyKey]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const body = draft.trim();
    if (body === "" || busy || !canComment) return;
    void onSubmit(
      body,
      mentions,
      replyTo,
      staged.map((attachment) => attachment.sourceId),
    ).then((sent) => {
      if (!sent) return;
      setDraft("");
      setMentions([]);
      setReplyTo(undefined);
      setStaged([]);
    });
  };

  const attach = (): void => {
    if (onAttach === undefined) return;
    void onAttach().then((attachment) => {
      if (attachment === undefined) return;
      // De-duplicated by sourceId: staging the same file twice is one
      // attachment, and the second staging replaces the first rather than
      // sending the kernel a list with a repeated id.
      setStaged((current) => [
        ...current.filter((item) => item.sourceId !== attachment.sourceId),
        attachment,
      ]);
    });
  };

  const editor = (comment: CommentThread): ReactNode => (
    <div className={styles.editor}>
      <textarea
        aria-label="Edit comment"
        autoFocus
        className={`${styles.field} ${styles.editField}`}
        disabled={busy}
        maxLength={BODY_LIMIT}
        onChange={(event) =>
          setEditDrafts((current) => ({
            ...current,
            [comment.id]: event.target.value,
          }))
        }
        onKeyDown={(event) => editKeyDown(event, comment)}
        value={editDrafts[comment.id] ?? comment.body}
      />
      <div className={styles.actions}>
        <button
          className={styles.action}
          disabled={busy || bodyToSend(comment) === ""}
          onClick={() => saveEdit(comment)}
          type="button"
        >
          Save
        </button>
        <button
          className={styles.action}
          disabled={busy}
          onClick={cancelEdit}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // Editing belongs to the AUTHOR, and an author is only known when the mount
  // says who is reading. `author.principalId` is optional in the projection, so
  // without the first half a system-written comment — which has no author
  // principal at all — would match every reader.
  const mayEdit = (comment: CommentThread): boolean =>
    onEdit !== undefined &&
    currentPrincipalId !== undefined &&
    comment.author.principalId === currentPrincipalId;

  const tools: EntryTools = {
    actorOf,
    mentionNameOf,
    timeZone,
    busy,
    custodyOf:
      onInspectAttachment === undefined
        ? undefined
        : (attachment) => custody[attachment.sourceId] ?? "checking",
    onRestore:
      onRestoreAttachment === undefined
        ? undefined
        : (attachment) => {
            setCustodyOf(attachment.sourceId, "checking");
            void onRestoreAttachment(attachment).then((held) =>
              setCustodyOf(attachment.sourceId, held),
            );
          },
    onUnlink: onEdit === undefined ? undefined : unlink,
    editingId,
    mayEdit,
    // Said only where it is not already obvious: an entry whose editor is open
    // shows the text itself.
    draftKept: (comment) =>
      editingId !== comment.id &&
      editDrafts[comment.id] !== undefined &&
      editDrafts[comment.id] !== comment.body,
    onBeginEdit: beginEdit,
    editor,
  };

  // A thread is settled by whoever holds the grant, and always by the person
  // who opened it — somebody may close their own question without being able to
  // close anybody else's.
  const mayResolve = (root: CommentThread): boolean =>
    onResolve !== undefined &&
    (canResolve ||
      (currentPrincipalId !== undefined &&
        root.author.principalId === currentPrincipalId));

  const rootActions = (root: CommentThread): ReactNode => {
    // A settled thread offers no Reply: reopening it is the way back in, and
    // an answer written into something closed is an answer nobody reads.
    const reply = canComment && root.threadState === "open";
    const resolve = mayResolve(root);
    if (!reply && !resolve) return undefined;
    return (
      <>
        {reply && (
          <button
            className={styles.action}
            disabled={busy}
            onClick={() => setReplyTo(root)}
            type="button"
          >
            Reply
          </button>
        )}
        {resolve && (
          <button
            className={styles.action}
            disabled={busy}
            onClick={() => {
              if (onResolve === undefined) return;
              // The answer is READ. A refused settle leaves the thread exactly
              // as it was, which on its own is indistinguishable from a settle
              // that worked and a list that has not re-read yet.
              void onResolve(root, root.threadState !== "resolved").then(
                (done) => setResolveRefused(done ? undefined : root.id),
              );
            }}
            type="button"
          >
            {root.threadState === "resolved" ? "Reopen" : "Resolve"}
          </button>
        )}
        {resolveRefused === root.id && (
          <span className={styles.note}>That change was refused.</span>
        )}
      </>
    );
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
              actions={rootActions(tree.root)}
              key={tree.root.id}
              tools={tools}
              tree={tree}
            />
          ))}
        </div>
      )}

      {/* "Nothing open" and "never discussed" are different facts about a
          record, and one sentence covering both would tell a reader nobody has
          ever written here when in truth every thread was settled. */}
      {threadsKnown && state.kind === "all_resolved" && (
        <p className={styles.empty}>
          Nothing open — {countLabel(state.hidden, "resolved thread")}{" "}
          {state.hidden === 1 ? "is" : "are"} hidden.
        </p>
      )}
      {/* Both empty states are claims about the record, and neither can be made
          from a list that has not arrived. The caller draws the reason in its
          place — "loading", or why the read was refused — so saying nothing
          here is what keeps two sentences from contradicting each other one
          line apart. */}
      {threadsKnown && state.kind === "none" && (
        <p className={styles.empty}>No comments on this record yet.</p>
      )}

      {/* The FORM carries the reply context in its name, not the textarea: the
          field is anchored on "Write a comment" by the packaged smoke and by
          the record tests, and a label that moves under them would take the
          only stable handle on this composer with it. */}
      <form
        aria-label={
          replyTo === undefined
            ? "New comment"
            : `Reply in the thread by ${replyTo.author.displayName}`
        }
        className={styles.composer}
        onSubmit={submit}
      >
        {/* ZNACZNIK AUTORA W KOMPOZYTORZE (rejestr, wpis #58). Inicjały —
            gdy wiadomo, CZYJE; glif osoby — gdy nie. Wymyślone „?" byłoby
            atrapą, a atrapy są tu nazwaną wadą; imienia nie ma skąd wziąć,
            dopóki projekcja kandydatów do wzmianki nie jest gotowa. */}
        <span
          aria-hidden="true"
          className={`${styles.mark} ${styles.composerMark}`}
        >
          {currentDisplayName === undefined ? (
            <Icon name="people" />
          ) : (
            initialsOf(currentDisplayName)
          )}
        </span>
        <div className={styles.composerMain}>
          {replyTo !== undefined && (
            <div className={styles.replyStrip}>
              <span>Replying to {replyTo.author.displayName}</span>
              <button
                className={styles.action}
                onClick={() => setReplyTo(undefined)}
                type="button"
              >
                Cancel
              </button>
            </div>
          )}
          {/* OPRAWA JEST RAMKĄ PISANEGO KOMENTARZA — pole, to, co komentarz
            obudzi, i wysyłka stoją w JEDNYM obrysie, a przycisk siedzi
            w jego prawym dolnym rogu, jak w prototypie
            (`v3/screens/record.js:206-212`). Wybór wzmianek został MIĘDZY
            polem a przyciskiem: pod przyciskiem byłby decyzją podejmowaną
            po wysłaniu. */}
          <div className={styles.composerField}>
            <textarea
              aria-label="Write a comment"
              className={styles.composerText}
              disabled={!canComment || busy}
              maxLength={BODY_LIMIT}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                  submit(event);
                // Escape leaves the REPLY, and only when there is one to leave —
                // otherwise the key keeps closing whatever holds this panel.
                else if (event.key === "Escape" && replyTo !== undefined) {
                  event.preventDefault();
                  event.stopPropagation();
                  setReplyTo(undefined);
                }
              }}
              placeholder={
                canComment ? "Write a comment" : "This scope is read-only."
              }
              rows={2}
              value={draft}
            />
            {/* The valve, made operable. Everything above this line says a mention
            is what wakes somebody; a composer that could not create one would
            have made that sentence describe a thing the reader cannot do.
            Toggles rather than a free-text `@`, because the only honest way to
            name a person is to pick them. */}
            {mentionCandidates.length > 0 && (
              <ul aria-label="Mention someone" className={styles.mentions}>
                {mentionCandidates.map((candidate) => {
                  const named = mentions.includes(candidate.principalId);
                  return (
                    <li key={candidate.principalId}>
                      <button
                        aria-pressed={named}
                        className={`${styles.mentionChip} ${
                          named ? styles.mentionChipOn : ""
                        }`}
                        data-principal-id={candidate.principalId}
                        disabled={!canComment || busy}
                        onClick={() =>
                          setMentions((current) =>
                            named
                              ? current.filter(
                                  (id) => id !== candidate.principalId,
                                )
                              : [...current, candidate.principalId],
                          )
                        }
                        type="button"
                      >
                        @{candidate.displayName}
                        {candidate.participantKind === "guest" && (
                          <span className={styles.mentionKind}>guest</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {staged.length > 0 && (
              <ul
                aria-label="New comment attachments"
                className={styles.attachments}
              >
                {staged.map((attachment) => (
                  <li className={styles.attachment} key={attachment.sourceId}>
                    <span className={styles.attachmentName}>
                      {attachment.original.payload.displayName}
                    </span>
                    <span className={styles.attachmentSize}>
                      Ready to attach
                    </span>
                    <button
                      className={styles.action}
                      disabled={busy}
                      onClick={() =>
                        setStaged((current) =>
                          current.filter(
                            (item) => item.sourceId !== attachment.sourceId,
                          ),
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* Said before the write, not after: whether this comment will wake
            anybody is the one thing about it worth knowing in advance. */}
            <p className={styles.reach}>
              {mentions.length === 0
                ? "Nobody is notified."
                : `${countLabel(mentions.length, "person", "people")} will be notified.`}
            </p>
            {staged.length >= ATTACHMENT_LIMIT && (
              <p className={styles.reach}>
                {ATTACHMENT_LIMIT} attachments is the limit.
              </p>
            )}
            <div className={styles.send}>
              {onAttach !== undefined && (
                <button
                  className={styles.action}
                  disabled={
                    !canComment || busy || staged.length >= ATTACHMENT_LIMIT
                  }
                  onClick={attach}
                  type="button"
                >
                  Attach file
                </button>
              )}
              {/* Disabled only while there is nothing to send, a write is in
              flight, or the grant does not allow one — and the placeholder
              above has already said which. A control greyed out for no stated
              reason is a dummy, and dummies are a named defect here. */}
              <button
                className={styles.submit}
                disabled={!canComment || busy || draft.trim() === ""}
                type="submit"
              >
                {replyTo === undefined ? "Comment" : "Add reply"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
