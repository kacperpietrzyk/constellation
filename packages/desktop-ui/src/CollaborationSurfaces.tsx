import {
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { PrincipalId } from "@constellation/contracts";

import type {
  AttentionInboxProjection,
  CommentListProjection,
  DataSlice,
  MentionCandidatesProjection,
} from "./client/workflow.js";
import { countLabel, formatDateTime } from "./i18n.js";

type Comment = CommentListProjection["threads"][number];
type Candidate = MentionCandidatesProjection["candidates"][number];

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
    <ul className="comment-mentions" aria-label="Wzmiankowani uczestnicy">
      {ids.map((id) => {
        const candidate = candidateById.get(id);
        return (
          <li className="mention-chip" key={id}>
            @
            {id === currentPrincipalId
              ? "Ty"
              : (candidate?.displayName ?? "Uczestnik")}
            {candidate?.participantKind === "guest" && <small>Gość</small>}
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
  onEdit,
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
  ) => Promise<boolean>;
  readonly onEdit: (comment: Comment, body: string) => Promise<boolean>;
  readonly onResolve: (comment: Comment, resolved: boolean) => void;
}) => {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<readonly PrincipalId[]>([]);
  const [replyTo, setReplyTo] = useState<Comment>();
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
      void onAdd(body.trim(), mentions, replyTo).then((saved) => {
        if (!saved) return;
        setBody("");
        setMentions([]);
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
          <span className="comment-own-mark">Ty</span>
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
            Zapisz
          </button>
          <button
            type="button"
            onClick={() => cancelEdit(comment)}
            disabled={busy}
          >
            Anuluj
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
          <span>Komentarze</span>
          <h3 id="comments-heading">Ustalenia przy pracy</h3>
        </div>
        <small>{countLabel(roots.length, "wątek", "wątki", "wątków")}</small>
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
                <article className={entryClassName(root)}>
                  {entryHeader(root)}
                  {entryBody(root, "Edytuj komentarz")}
                  <footer>
                    {root.edited && <span>Edytowany · historia zachowana</span>}
                    {draftPreserved(root) && (
                      <span>Szkic edycji zachowany</span>
                    )}
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
                    className={entryClassName(reply, "comment-reply")}
                    key={reply.id}
                  >
                    {entryHeader(reply)}
                    {entryBody(reply, "Edytuj odpowiedź")}
                    {(draftPreserved(reply) ||
                      (reply.author.principalId === currentPrincipalId &&
                        editingId !== reply.id)) && (
                      <footer>
                        {draftPreserved(reply) && (
                          <span>Szkic edycji zachowany</span>
                        )}
                        {reply.author.principalId === currentPrincipalId &&
                          editingId !== reply.id && (
                            <button
                              type="button"
                              onClick={() => beginEdit(reply)}
                              disabled={busy}
                            >
                              Edytuj
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
        {mentionOptions.length > 0 && (
          <fieldset className="mention-picker" disabled={!canComment || busy}>
            <legend>Wzmianki</legend>
            <div className="mention-chips">
              {mentionOptions.map((candidate) => (
                <button
                  type="button"
                  className="mention-chip"
                  key={candidate.principalId}
                  aria-pressed={mentions.includes(candidate.principalId)}
                  onClick={() => toggleMention(candidate.principalId)}
                >
                  {candidate.displayName}
                  {candidate.participantKind === "guest" && <small>Gość</small>}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="comment-composer-actions">
          <span className="comment-composer-hint">
            <kbd>⌘ Enter</kbd> wysyła
          </span>
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

type AttentionItem = AttentionInboxProjection["items"][number];

// Pełna taksonomia powodów z kontraktu attention.inbox. Typ mapowany po unii
// wymusza kompletność: nowy powód w kontrakcie nie przejdzie typecheck bez
// polskiej etykiety.
const reasonLabels: { readonly [reason in AttentionItem["reason"]]: string } = {
  comment_mention: "Wzmianka",
  task_assignment: "Odpowiedzialność",
  sync_conflict: "Konflikt synchronizacji",
  knowledge_evidence_changed: "Zmiana dowodów wiedzy",
  renewal_due: "Termin odnowienia",
  relationship_fact_stale: "Nieaktualny fakt relacji",
  decision_impact_review: "Skutki decyzji do przeglądu",
  capture_duplicate: "Duplikat Capture",
  capture_ambiguous: "Niejasny kierunek",
  capture_unsupported: "Nieobsługiwany oryginał",
  capture_parsing_failure: "Błąd odczytu",
  capture_permission_failure: "Brak uprawnienia",
  capture_stale_conflict: "Nieaktualna wersja",
  capture_missing_target: "Brak celu",
  capture_missing_payload: "Brak oryginału",
  capture_partial_payload_transfer: "Niepełny transfer",
  capture_unknown_reconcile: "Wynik nieznany",
};

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

export const AttentionSurface = ({
  attention,
  busy,
  onOpen,
  onRead,
  onDismiss,
  onRouteCapture,
  onRetryCapture,
  onKeepCapture,
  onReplaceCapturePayload,
  onRetry,
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
  readonly onRetryCapture: (item: AttentionItem) => void;
  readonly onKeepCapture: (item: AttentionItem) => void;
  readonly onReplaceCapturePayload: (item: AttentionItem) => void;
  /** Ponawia ładowanie skrzynki, gdy warstwa danych była niedostępna. */
  readonly onRetry?: () => void;
}) => {
  // Pilne sygnały prowadzą listę; wewnątrz grup porządek pozostaje
  // chronologiczny (sortowanie stabilne).
  const items =
    attention.kind === "ready"
      ? [...attention.data.items].sort(
          (a, b) =>
            (a.urgency === "urgent" ? 0 : 1) - (b.urgency === "urgent" ? 0 : 1),
        )
      : [];
  return (
    <section className="attention-surface" aria-labelledby="surface-title">
      <header className="surface-header attention-heading">
        <div>
          <p className="eyebrow">Sygnały wymagające reakcji</p>
          <h1 id="surface-title" tabIndex={-1}>
            Do uwagi
          </h1>
          <p>
            To nie jest dziennik aktywności. Każdy wpis ma powód i prowadzi do
            dokładnego kontekstu.
          </p>
        </div>
        {attention.kind === "ready" && (
          <span className="attention-total">
            {countLabel(
              attention.data.unreadCount,
              "nieprzeczytany",
              "nieprzeczytane",
              "nieprzeczytanych",
            )}
          </span>
        )}
      </header>
      {attention.kind === "unavailable" ? (
        <div className="attention-empty" role="status">
          <strong>Skrzynka uwagi jest chwilowo niedostępna</strong>
          <span>Żaden sygnał nie został oznaczony jako przeczytany.</span>
          {onRetry && (
            <button
              type="button"
              className="secondary-button compact"
              onClick={onRetry}
            >
              Spróbuj ponownie
            </button>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="attention-empty">
          <strong>Nic nie wymaga reakcji</strong>
          <span>
            Rutynowa aktywność pozostaje w historii i nie tworzy długu uwagi.
          </span>
        </div>
      ) : (
        <ol className="attention-list-real">
          {items.map((item) => (
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
                  {reasonLabels[item.reason]}
                  {item.urgency === "urgent" && (
                    <b className="attention-urgent">Pilne</b>
                  )}
                </span>
                <strong>
                  {item.state === "unread" && (
                    <>
                      <i className="attention-unread-dot" aria-hidden="true" />
                      <span className="sr-only">Nieprzeczytane: </span>
                    </>
                  )}
                  {item.title}
                </strong>
                <span>
                  {item.reason === "comment_mention"
                    ? "Wspomniano Cię w komentarzu."
                    : item.reason === "task_assignment"
                      ? "Masz odpowiedzialność za to zadanie."
                      : item.detail}
                </span>
                <time dateTime={item.occurredAt}>
                  {formatDateTime(item.occurredAt)}
                </time>
              </button>
              <div className="attention-actions">
                {item.destination.kind === "capture" &&
                  captureRecoveryActions(item.reason).includes("route") && (
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
                {item.destination.kind === "capture" &&
                  captureRecoveryActions(item.reason).includes("retry") && (
                    <button
                      type="button"
                      onClick={() => onRetryCapture(item)}
                      disabled={busy}
                    >
                      Spróbuj ponownie
                    </button>
                  )}
                {item.destination.kind === "capture" &&
                  captureRecoveryActions(item.reason).includes(
                    "replace_payload",
                  ) && (
                    <button
                      type="button"
                      onClick={() => onReplaceCapturePayload(item)}
                      disabled={busy}
                    >
                      Zastąp oryginał
                    </button>
                  )}
                {item.destination.kind === "capture" &&
                  captureRecoveryActions(item.reason).includes(
                    "keep_unclassified",
                  ) && (
                    <button
                      type="button"
                      onClick={() => onKeepCapture(item)}
                      disabled={busy}
                    >
                      Zachowaj bez klasyfikacji
                    </button>
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
};
