import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type {
  CaptureOriginal,
  KnowledgeSourceId,
  PrincipalId,
} from "@constellation/contracts";

import type {
  AttentionInboxProjection,
  CommentListProjection,
  DataSlice,
  MentionCandidatesProjection,
} from "./client/workflow.js";
import { countLabel, formatDateTime } from "./i18n.js";
// Pełna taksonomia powodów z kontraktu attention.inbox stoi w JEDNYM miejscu,
// wspólnym dla obu ekranów, które ją czytają. Kopia trzymana tutaj zdążyła się
// już rozjechać na wielkości liter — niewidocznie, bo lista pisze powód
// wersalikami.
import { inboxReasonLabels as reasonLabels } from "./inbox-triage.js";

type Comment = CommentListProjection["threads"][number];
type Candidate = MentionCandidatesProjection["candidates"][number];
type Attachment = Comment["attachments"][number];
type PendingAttachment = {
  readonly sourceId: KnowledgeSourceId;
  readonly original: Extract<
    CaptureOriginal,
    { kind: "managed_file" | "screenshot" }
  >;
};

// Author identity stays compact: initials in a neutral chip. Blue remains
// reserved for collaboration identity — mention chips and the own-entry seam.
const initialsOf = (name: string): string => {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (part[0] ?? "").toUpperCase())
    .join("");
  return letters === "" ? "?" : letters;
};

const MentionChips = ({
  ids,
  candidateById,
  currentPrincipalId,
}: {
  readonly ids: readonly PrincipalId[];
  readonly candidateById: ReadonlyMap<PrincipalId, Candidate>;
  readonly currentPrincipalId: PrincipalId | undefined;
}) =>
  ids.length === 0 ? null : (
    <ul className="comment-mentions" aria-label="Mentioned participants">
      {ids.map((id) => {
        const candidate = candidateById.get(id);
        return (
          <li className="mention-chip" key={id}>
            @
            {id === currentPrincipalId
              ? "You"
              : (candidate?.displayName ?? "Participant")}
            {candidate?.participantKind === "guest" && <small>Guest</small>}
          </li>
        );
      })}
    </ul>
  );

export const CommentsPanel = ({
  comments,
  candidates,
  currentPrincipalId,
  canComment,
  canResolve,
  busy,
  onAdd,
  onAttach,
  onEdit,
  onInspectAttachment,
  onRestoreAttachment,
  onResolve,
}: {
  readonly comments: DataSlice<CommentListProjection>;
  readonly candidates: DataSlice<MentionCandidatesProjection>;
  readonly currentPrincipalId: PrincipalId | undefined;
  readonly canComment: boolean;
  readonly canResolve: boolean;
  readonly busy: boolean;
  // Add/edit report their outcome: the panel clears a draft only after the
  // mutation confirmed, so a failed save never discards the typed text.
  readonly onAdd: (
    body: string,
    mentions: readonly PrincipalId[],
    parent?: Comment,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  readonly onAttach?: () => Promise<PendingAttachment | undefined>;
  readonly onEdit: (
    comment: Comment,
    body: string,
    attachmentSourceIds?: readonly KnowledgeSourceId[],
  ) => Promise<boolean>;
  readonly onInspectAttachment?: (
    attachment: Attachment,
  ) => Promise<"available" | "unavailable">;
  readonly onRestoreAttachment?: (
    attachment: Attachment,
  ) => Promise<"available" | "unavailable">;
  readonly onResolve: (comment: Comment, resolved: boolean) => void;
}) => {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<readonly PrincipalId[]>([]);
  const [replyTo, setReplyTo] = useState<Comment>();
  const [pendingAttachments, setPendingAttachments] = useState<
    readonly PendingAttachment[]
  >([]);
  const [attachmentCustody, setAttachmentCustody] = useState<
    Readonly<Record<string, "checking" | "available" | "unavailable">>
  >({});
  useEffect(() => {
    if (comments.kind !== "ready" || onInspectAttachment === undefined) return;
    let active = true;
    const attachments = comments.data.threads.flatMap(
      (comment) => comment.attachments,
    );
    setAttachmentCustody(
      Object.fromEntries(
        attachments.map((attachment) => [attachment.sourceId, "checking"]),
      ),
    );
    void Promise.all(
      attachments.map(async (attachment) => {
        const state = await onInspectAttachment(attachment);
        if (!active) return;
        setAttachmentCustody((current) => ({
          ...current,
          [attachment.sourceId]: state,
        }));
      }),
    );
    return () => {
      active = false;
    };
  }, [comments, onInspectAttachment]);
  const [editingId, setEditingId] = useState<Comment["id"]>();
  // Szkice edycji trzymane per wpis: przełączenie edycji na inny komentarz
  // nie kasuje niezapisanych zmian — wracają po ponownym wejściu w edycję.
  const [editDrafts, setEditDrafts] = useState<{
    readonly [id: string]: string;
  }>({});
  const setDraft = (id: Comment["id"], value: string) =>
    setEditDrafts((current) => ({ ...current, [id]: value }));
  const clearDraft = (id: Comment["id"]) =>
    setEditDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
    );
  const beginEdit = (comment: Comment) => {
    setEditDrafts((current) =>
      current[comment.id] === undefined
        ? { ...current, [comment.id]: comment.body }
        : current,
    );
    setEditingId(comment.id);
  };
  const saveEdit = (comment: Comment) => {
    const draft = (editDrafts[comment.id] ?? comment.body).trim();
    if (!busy && draft) {
      void onEdit(comment, draft).then((saved) => {
        if (!saved) return;
        setEditingId(undefined);
        clearDraft(comment.id);
      });
    }
  };
  const cancelEdit = (comment: Comment) => {
    setEditingId(undefined);
    clearDraft(comment.id);
  };
  // ⌘Enter saves, Escape cancels — the same contract as the composer below.
  const editKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    comment: Comment,
  ) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      saveEdit(comment);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit(comment);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && canComment && body.trim()) {
      void onAdd(
        body.trim(),
        mentions,
        replyTo,
        pendingAttachments.map((attachment) => attachment.sourceId),
      ).then((saved) => {
        if (!saved) return;
        setBody("");
        setMentions([]);
        setPendingAttachments([]);
        setReplyTo(undefined);
      });
    }
  };
  const toggleMention = (id: PrincipalId) =>
    setMentions((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const items = comments.kind === "ready" ? comments.data.threads : [];
  const roots = items.filter(
    (comment) => comment.parentCommentId === undefined,
  );
  const candidateById = new Map<PrincipalId, Candidate>(
    candidates.kind === "ready"
      ? candidates.data.candidates.map((candidate) => [
          candidate.principalId,
          candidate,
        ])
      : [],
  );
  const mentionOptions =
    candidates.kind === "ready"
      ? candidates.data.candidates.filter(
          (candidate) => candidate.principalId !== currentPrincipalId,
        )
      : [];
  const entryHeader = (comment: Comment) => (
    <header>
      <span className="comment-author">
        <span className="comment-avatar" aria-hidden="true">
          {initialsOf(comment.author.displayName)}
        </span>
        <strong>{comment.author.displayName}</strong>
        {comment.author.principalId === currentPrincipalId && (
          <span className="comment-own-mark">You</span>
        )}
      </span>
      <time dateTime={comment.createdAt}>
        {formatDateTime(comment.createdAt)}
      </time>
    </header>
  );
  const entryBody = (comment: Comment, editLabel: string) =>
    editingId === comment.id ? (
      <div className="comment-inline-edit">
        <label htmlFor={`edit-comment-${comment.id}`}>{editLabel}</label>
        <textarea
          id={`edit-comment-${comment.id}`}
          value={editDrafts[comment.id] ?? comment.body}
          onChange={(event) => setDraft(comment.id, event.target.value)}
          onKeyDown={(event) => editKeyDown(event, comment)}
          maxLength={16000}
          disabled={busy}
          autoFocus
        />
        <div>
          <button
            type="button"
            onClick={() => saveEdit(comment)}
            disabled={busy || !(editDrafts[comment.id] ?? "").trim()}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => cancelEdit(comment)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <>
        <p>{comment.body}</p>
        <MentionChips
          ids={comment.mentionPrincipalIds}
          candidateById={candidateById}
          currentPrincipalId={currentPrincipalId}
        />
        {comment.attachments.length > 0 && (
          <ul
            className="managed-attachment-list"
            aria-label="Comment attachments"
          >
            {comment.attachments.map((attachment) => (
              <li key={attachment.sourceId}>
                <span>
                  <strong>{attachment.original.payload.displayName}</strong>
                  <small>
                    {Math.ceil(attachment.original.payload.byteLength / 1024)}{" "}
                    KB
                  </small>
                </span>
                <span
                  className={`attachment-state ${attachmentCustody[attachment.sourceId] ?? "checking"}`}
                >
                  {attachmentCustody[attachment.sourceId] === "available"
                    ? "In managed storage"
                    : attachmentCustody[attachment.sourceId] === "unavailable"
                      ? "Not on this device"
                      : "Checking storage…"}
                </span>
                {attachmentCustody[attachment.sourceId] === "unavailable" &&
                  onRestoreAttachment && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setAttachmentCustody((current) => ({
                          ...current,
                          [attachment.sourceId]: "checking",
                        }));
                        void onRestoreAttachment(attachment).then((state) =>
                          setAttachmentCustody((current) => ({
                            ...current,
                            [attachment.sourceId]: state,
                          })),
                        );
                      }}
                    >
                      Restore
                    </button>
                  )}
                {comment.author.principalId === currentPrincipalId && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void onEdit(
                        comment,
                        comment.body,
                        comment.attachments
                          .filter(
                            (item) => item.sourceId !== attachment.sourceId,
                          )
                          .map((item) => item.sourceId),
                      )
                    }
                  >
                    Unlink
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  const draftPreserved = (comment: Comment) =>
    editingId !== comment.id &&
    editDrafts[comment.id] !== undefined &&
    editDrafts[comment.id] !== comment.body;
  const entryClassName = (comment: Comment, extra?: string) =>
    [
      "comment-entry",
      extra,
      comment.author.principalId === currentPrincipalId
        ? "comment-own"
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");
  return (
    <section className="comments-panel" aria-labelledby="comments-heading">
      <header>
        <div>
          <span>Comments</span>
          <h3 id="comments-heading">What was agreed here</h3>
        </div>
        <small>{countLabel(roots.length, "thread")}</small>
      </header>
      {comments.kind === "unavailable" ? (
        <div className="comments-state" role="status">
          Comments are unavailable right now. Refresh the context — nothing is
          lost.
        </div>
      ) : roots.length === 0 ? (
        <div className="comments-state">
          No comments yet. The first one stays with this record, not in a
          separate chat.
        </div>
      ) : (
        <ol className="comment-threads">
          {roots.map((root) => {
            const replies = items.filter(
              (comment) => comment.parentCommentId === root.id,
            );
            return (
              <li
                key={root.id}
                className={root.threadState === "resolved" ? "resolved" : ""}
              >
                <article className={entryClassName(root)}>
                  {entryHeader(root)}
                  {entryBody(root, "Edit comment")}
                  <footer>
                    {root.edited && <span>Edited · history kept</span>}
                    {draftPreserved(root) && <span>Draft kept</span>}
                    {canComment && root.threadState === "open" && (
                      <button type="button" onClick={() => setReplyTo(root)}>
                        Reply
                      </button>
                    )}
                    {(root.author.principalId === currentPrincipalId ||
                      canResolve) && (
                      <button
                        type="button"
                        onClick={() =>
                          onResolve(root, root.threadState !== "resolved")
                        }
                        disabled={busy}
                      >
                        {root.threadState === "resolved" ? "Reopen" : "Resolve"}
                      </button>
                    )}
                    {root.author.principalId === currentPrincipalId &&
                      editingId !== root.id && (
                        <button
                          type="button"
                          onClick={() => beginEdit(root)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                      )}
                  </footer>
                </article>
                {replies.map((reply) => (
                  <article
                    className={entryClassName(reply, "comment-reply")}
                    key={reply.id}
                  >
                    {entryHeader(reply)}
                    {entryBody(reply, "Edit reply")}
                    {(draftPreserved(reply) ||
                      (reply.author.principalId === currentPrincipalId &&
                        editingId !== reply.id)) && (
                      <footer>
                        {draftPreserved(reply) && <span>Draft kept</span>}
                        {reply.author.principalId === currentPrincipalId &&
                          editingId !== reply.id && (
                            <button
                              type="button"
                              onClick={() => beginEdit(reply)}
                              disabled={busy}
                            >
                              Edit
                            </button>
                          )}
                      </footer>
                    )}
                  </article>
                ))}
              </li>
            );
          })}
        </ol>
      )}
      <form
        className="comment-composer"
        onSubmit={submit}
        aria-label={
          replyTo
            ? `Reply in the thread by ${replyTo.author.displayName}`
            : "New comment"
        }
      >
        {replyTo && (
          <div className="reply-context">
            <span>Replying to {replyTo.author.displayName}</span>
            <button type="button" onClick={() => setReplyTo(undefined)}>
              Cancel
            </button>
          </div>
        )}
        <label>
          <span>{replyTo ? "Reply" : "Comment"}</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={16000}
            disabled={!canComment || busy}
            placeholder={
              canComment
                ? "Add something concrete…"
                : "This scope is read-only."
            }
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                submit(event);
            }}
          />
        </label>
        {mentionOptions.length > 0 && (
          <fieldset className="mention-picker" disabled={!canComment || busy}>
            <legend>Mentions</legend>
            <div className="mention-chips">
              {mentionOptions.map((candidate) => (
                <button
                  type="button"
                  className="mention-chip"
                  key={candidate.principalId}
                  data-principal-id={candidate.principalId}
                  aria-pressed={mentions.includes(candidate.principalId)}
                  onClick={() => toggleMention(candidate.principalId)}
                >
                  {candidate.displayName}
                  {candidate.participantKind === "guest" && (
                    <small>Guest</small>
                  )}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {pendingAttachments.length > 0 && (
          <ul
            className="managed-attachment-list pending"
            aria-label="New comment attachments"
          >
            {pendingAttachments.map((attachment) => (
              <li key={attachment.sourceId}>
                <span>
                  <strong>{attachment.original.payload.displayName}</strong>
                  <small>Ready to attach</small>
                </span>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    setPendingAttachments((current) =>
                      current.filter(
                        (item) => item.sourceId !== attachment.sourceId,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="comment-composer-actions">
          <span className="comment-composer-hint">
            <kbd>⌘ Enter</kbd> sends
          </span>
          {onAttach && (
            <button
              className="text-button"
              type="button"
              disabled={!canComment || busy || pendingAttachments.length >= 20}
              onClick={() => {
                void onAttach().then((attachment) => {
                  if (attachment === undefined) return;
                  setPendingAttachments((current) => [
                    ...current.filter(
                      (item) => item.sourceId !== attachment.sourceId,
                    ),
                    attachment,
                  ]);
                });
              }}
            >
              Attach file
            </button>
          )}
          <button
            className="secondary-button compact"
            type="submit"
            disabled={!canComment || busy || !body.trim()}
          >
            {busy ? "Saving…" : replyTo ? "Add reply" : "Add comment"}
          </button>
        </div>
      </form>
    </section>
  );
};

type AttentionItem = AttentionInboxProjection["items"][number];

export const captureRecoveryActions = (
  reason: AttentionItem["reason"],
): readonly ("route" | "retry" | "replace_payload" | "keep_unclassified")[] => {
  if (!reason.startsWith("capture_")) return [];
  const actions: (
    "route" | "retry" | "replace_payload" | "keep_unclassified"
  )[] = [];
  if (
    reason === "capture_ambiguous" ||
    reason === "capture_duplicate" ||
    reason === "capture_unsupported" ||
    reason === "capture_missing_target"
  )
    actions.push("route");
  if (
    reason === "capture_parsing_failure" ||
    reason === "capture_permission_failure" ||
    reason === "capture_stale_conflict" ||
    reason === "capture_missing_payload" ||
    reason === "capture_partial_payload_transfer" ||
    reason === "capture_unknown_reconcile"
  )
    actions.push("retry");
  if (
    reason === "capture_missing_payload" ||
    reason === "capture_partial_payload_transfer"
  )
    actions.push("replace_payload");
  actions.push("keep_unclassified");
  return actions;
};

export const AttentionDetail = ({
  item,
  busy,
  onOpen,
  onRead,
  onDismiss,
  onRouteCapture,
  onRetryCapture,
  onKeepCapture,
  onReplaceCapturePayload,
}: {
  readonly item: AttentionItem;
  readonly busy: boolean;
  readonly onOpen: (item: AttentionItem) => void;
  readonly onRead: (item: AttentionItem) => void;
  readonly onDismiss: (item: AttentionItem) => void;
  readonly onRouteCapture: (
    item: AttentionItem,
    destination: "task" | "knowledge_source",
  ) => void;
  readonly onRetryCapture: (item: AttentionItem) => void;
  readonly onKeepCapture: (item: AttentionItem) => void;
  readonly onReplaceCapturePayload: (item: AttentionItem) => void;
}) => {
  const recoveryActions = captureRecoveryActions(item.reason);
  return (
    <div className="inspector-body attention-detail">
      <span className="record-status">
        <i />
        {item.urgency === "urgent"
          ? "Urgent"
          : item.state === "unread"
            ? "Unread"
            : "Read"}
      </span>
      <h2>{item.title}</h2>
      <p className="record-summary">{item.detail}</p>
      <section className="inspector-section">
        <p className="section-label">Reason</p>
        <p>{reasonLabels[item.reason]}</p>
      </section>
      <section className="inspector-section">
        <p className="section-label">Received</p>
        <p>
          <time dateTime={item.occurredAt}>
            {formatDateTime(item.occurredAt)}
          </time>
        </p>
      </section>
      <div className="attention-detail-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => onOpen(item)}
          disabled={busy}
        >
          Open exact context
        </button>
        {item.destination.kind === "capture" &&
          recoveryActions.includes("route") && (
            <>
              <button
                type="button"
                onClick={() => onRouteCapture(item, "task")}
                disabled={busy}
              >
                Create task
              </button>
              <button
                type="button"
                onClick={() => onRouteCapture(item, "knowledge_source")}
                disabled={busy}
              >
                Save as source
              </button>
            </>
          )}
        {item.destination.kind === "capture" &&
          recoveryActions.includes("retry") && (
            <button
              type="button"
              onClick={() => onRetryCapture(item)}
              disabled={busy}
            >
              Try again
            </button>
          )}
        {item.destination.kind === "capture" &&
          recoveryActions.includes("replace_payload") && (
            <button
              type="button"
              onClick={() => onReplaceCapturePayload(item)}
              disabled={busy}
            >
              Replace original
            </button>
          )}
        {item.destination.kind === "capture" &&
          recoveryActions.includes("keep_unclassified") && (
            <button
              type="button"
              onClick={() => onKeepCapture(item)}
              disabled={busy}
            >
              Keep unclassified
            </button>
          )}
        {item.state === "unread" && (
          <button type="button" onClick={() => onRead(item)} disabled={busy}>
            Mark as read
          </button>
        )}
        <button type="button" onClick={() => onDismiss(item)} disabled={busy}>
          Dismiss
        </button>
      </div>
    </div>
  );
};
