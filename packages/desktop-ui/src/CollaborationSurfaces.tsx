import { useState, type FormEvent } from "react";

import type { PrincipalId } from "@constellation/contracts";

import type {
  AttentionInboxProjection,
  CommentListProjection,
  DataSlice,
  MentionCandidatesProjection,
} from "./client/workflow.js";

type Comment = CommentListProjection["threads"][number];

export const CommentsPanel = ({
  comments,
  candidates,
  currentPrincipalId,
  canComment,
  canResolve,
  busy,
  onAdd,
  onEdit,
  onResolve,
}: {
  readonly comments: DataSlice<CommentListProjection>;
  readonly candidates: DataSlice<MentionCandidatesProjection>;
  readonly currentPrincipalId: PrincipalId | undefined;
  readonly canComment: boolean;
  readonly canResolve: boolean;
  readonly busy: boolean;
  readonly onAdd: (
    body: string,
    mentions: readonly PrincipalId[],
    parent?: Comment,
  ) => void;
  readonly onEdit: (comment: Comment, body: string) => void;
  readonly onResolve: (comment: Comment, resolved: boolean) => void;
}) => {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<readonly PrincipalId[]>([]);
  const [replyTo, setReplyTo] = useState<Comment>();
  const [editingId, setEditingId] = useState<Comment["id"]>();
  const [editBody, setEditBody] = useState("");
  const beginEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditBody(comment.body);
  };
  const saveEdit = (comment: Comment) => {
    if (!busy && editBody.trim()) {
      onEdit(comment, editBody.trim());
      setEditingId(undefined);
      setEditBody("");
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && canComment && body.trim()) {
      onAdd(body.trim(), mentions, replyTo);
      setBody("");
      setMentions([]);
      setReplyTo(undefined);
    }
  };
  const items = comments.kind === "ready" ? comments.data.threads : [];
  const roots = items.filter(
    (comment) => comment.parentCommentId === undefined,
  );
  return (
    <section className="comments-panel" aria-labelledby="comments-heading">
      <header>
        <div>
          <span>Komentarze</span>
          <h3 id="comments-heading">Ustalenia przy pracy</h3>
        </div>
        <small>
          {roots.length} {roots.length === 1 ? "wątek" : "wątki"}
        </small>
      </header>
      {comments.kind === "unavailable" ? (
        <div className="comments-state" role="status">
          Komentarze są teraz niedostępne. Odśwież kontekst bez utraty wersji.
        </div>
      ) : roots.length === 0 ? (
        <div className="comments-state">
          Nie ma jeszcze komentarzy. Pierwszy wpis pozostanie przy tym
          rekordzie, nie w osobnym czacie.
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
                <article className="comment-entry">
                  <header>
                    <strong>{root.author.displayName}</strong>
                    <time dateTime={root.createdAt}>
                      {new Date(root.createdAt).toLocaleString()}
                    </time>
                  </header>
                  {editingId === root.id ? (
                    <div className="comment-inline-edit">
                      <label htmlFor={`edit-comment-${root.id}`}>
                        Edytuj komentarz
                      </label>
                      <textarea
                        id={`edit-comment-${root.id}`}
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        maxLength={16000}
                        disabled={busy}
                        autoFocus
                      />
                      <div>
                        <button
                          type="button"
                          onClick={() => saveEdit(root)}
                          disabled={busy || !editBody.trim()}
                        >
                          Zapisz
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(undefined)}
                          disabled={busy}
                        >
                          Anuluj
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>{root.body}</p>
                  )}
                  <footer>
                    {root.edited && <span>Edytowany · historia zachowana</span>}
                    {canComment && root.threadState === "open" && (
                      <button type="button" onClick={() => setReplyTo(root)}>
                        Odpowiedz
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
                        {root.threadState === "resolved"
                          ? "Otwórz ponownie"
                          : "Rozwiąż"}
                      </button>
                    )}
                    {root.author.principalId === currentPrincipalId &&
                      editingId !== root.id && (
                        <button
                          type="button"
                          onClick={() => beginEdit(root)}
                          disabled={busy}
                        >
                          Edytuj
                        </button>
                      )}
                  </footer>
                </article>
                {replies.map((reply) => (
                  <article
                    className="comment-entry comment-reply"
                    key={reply.id}
                  >
                    <header>
                      <strong>{reply.author.displayName}</strong>
                      <time dateTime={reply.createdAt}>
                        {new Date(reply.createdAt).toLocaleString()}
                      </time>
                    </header>
                    {editingId === reply.id ? (
                      <div className="comment-inline-edit">
                        <label htmlFor={`edit-comment-${reply.id}`}>
                          Edytuj odpowiedź
                        </label>
                        <textarea
                          id={`edit-comment-${reply.id}`}
                          value={editBody}
                          onChange={(event) => setEditBody(event.target.value)}
                          maxLength={16000}
                          disabled={busy}
                          autoFocus
                        />
                        <div>
                          <button
                            type="button"
                            onClick={() => saveEdit(reply)}
                            disabled={busy || !editBody.trim()}
                          >
                            Zapisz
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(undefined)}
                            disabled={busy}
                          >
                            Anuluj
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>{reply.body}</p>
                    )}
                    {reply.author.principalId === currentPrincipalId &&
                      editingId !== reply.id && (
                        <footer>
                          <button
                            type="button"
                            onClick={() => beginEdit(reply)}
                            disabled={busy}
                          >
                            Edytuj
                          </button>
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
            ? `Odpowiedź w wątku ${replyTo.author.displayName}`
            : "Nowy komentarz"
        }
      >
        {replyTo && (
          <div className="reply-context">
            <span>Odpowiedź do {replyTo.author.displayName}</span>
            <button type="button" onClick={() => setReplyTo(undefined)}>
              Anuluj
            </button>
          </div>
        )}
        <label>
          <span>{replyTo ? "Odpowiedź" : "Komentarz"}</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={16000}
            disabled={!canComment || busy}
            placeholder={
              canComment
                ? "Dodaj konkretne ustalenie…"
                : "Ten zakres pozwala tylko czytać."
            }
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                submit(event);
            }}
          />
        </label>
        <div className="comment-composer-actions">
          <label>
            <span>Wzmianki</span>
            <select
              multiple
              value={mentions}
              disabled={
                !canComment || busy || candidates.kind === "unavailable"
              }
              onChange={(event) =>
                setMentions(
                  [...event.currentTarget.selectedOptions].map(
                    (option) => option.value as PrincipalId,
                  ),
                )
              }
            >
              {candidates.kind === "ready" &&
                candidates.data.candidates
                  .filter(
                    (candidate) => candidate.principalId !== currentPrincipalId,
                  )
                  .map((candidate) => (
                    <option
                      value={candidate.principalId}
                      key={candidate.principalId}
                    >
                      {candidate.displayName}
                    </option>
                  ))}
            </select>
          </label>
          <button
            className="secondary-button compact"
            type="submit"
            disabled={!canComment || busy || !body.trim()}
          >
            {busy
              ? "Zapisuję…"
              : replyTo
                ? "Dodaj odpowiedź"
                : "Dodaj komentarz"}
          </button>
        </div>
      </form>
    </section>
  );
};

export const AttentionSurface = ({
  attention,
  busy,
  onOpen,
  onRead,
  onDismiss,
  onRouteCapture,
}: {
  readonly attention: DataSlice<AttentionInboxProjection>;
  readonly busy: boolean;
  readonly onOpen: (item: AttentionInboxProjection["items"][number]) => void;
  readonly onRead: (item: AttentionInboxProjection["items"][number]) => void;
  readonly onDismiss: (item: AttentionInboxProjection["items"][number]) => void;
  readonly onRouteCapture: (
    item: AttentionInboxProjection["items"][number],
    destination: "task" | "knowledge_source",
  ) => void;
}) => (
  <section className="attention-surface" aria-labelledby="surface-title">
    <header className="surface-heading attention-heading">
      <div>
        <p className="eyebrow">Do uwagi</p>
        <h1 id="surface-title">Tylko sygnały wymagające reakcji</h1>
        <p>
          To nie jest dziennik aktywności. Każdy wpis ma powód i prowadzi do
          dokładnego kontekstu.
        </p>
      </div>
      {attention.kind === "ready" && (
        <span className="attention-total">
          {attention.data.unreadCount} nieprzeczytane
        </span>
      )}
    </header>
    {attention.kind === "unavailable" ? (
      <div className="attention-empty" role="status">
        Skrzynka uwagi jest chwilowo niedostępna. Żaden sygnał nie został
        oznaczony jako przeczytany.
      </div>
    ) : attention.data.items.length === 0 ? (
      <div className="attention-empty">
        <strong>Nic nie wymaga reakcji</strong>
        <span>
          Rutynowa aktywność pozostaje w historii i nie tworzy długu uwagi.
        </span>
      </div>
    ) : (
      <ol className="attention-list-real">
        {attention.data.items.map((item) => (
          <li
            key={item.id}
            className={item.state === "unread" ? "unread" : "read"}
          >
            <button
              className="attention-main"
              type="button"
              onClick={() => onOpen(item)}
            >
              <span className="attention-reason">
                {item.reason === "comment_mention"
                  ? "Wzmianka"
                  : item.reason === "task_assignment"
                    ? "Odpowiedzialność"
                    : item.reason === "capture_duplicate"
                      ? "Duplikat Capture"
                      : "Wymaga decyzji"}
              </span>
              <strong>{item.title}</strong>
              <span>
                {item.reason === "comment_mention"
                  ? "Wspomniano Cię w komentarzu."
                  : item.reason === "task_assignment"
                    ? "Masz odpowiedzialność za to zadanie."
                    : item.detail}
              </span>
              <time dateTime={item.occurredAt}>
                {new Date(item.occurredAt).toLocaleString()}
              </time>
            </button>
            <div className="attention-actions">
              {item.destination.kind === "capture" &&
                item.reason === "capture_duplicate" && (
                  <>
                    <button
                      type="button"
                      onClick={() => onRouteCapture(item, "task")}
                      disabled={busy}
                    >
                      Utwórz zadanie
                    </button>
                    <button
                      type="button"
                      onClick={() => onRouteCapture(item, "knowledge_source")}
                      disabled={busy}
                    >
                      Zapisz jako źródło
                    </button>
                  </>
                )}
              {item.state === "unread" && (
                <button
                  type="button"
                  onClick={() => onRead(item)}
                  disabled={busy}
                >
                  Oznacz jako przeczytane
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(item)}
                disabled={busy}
              >
                Usuń z uwagi
              </button>
            </div>
          </li>
        ))}
      </ol>
    )}
  </section>
);
