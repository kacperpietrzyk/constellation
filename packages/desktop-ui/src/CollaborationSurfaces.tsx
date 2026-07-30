import type { AttentionInboxProjection } from "./client/workflow.js";
import { formatDateTime } from "./i18n.js";
// Pełna taksonomia powodów z kontraktu attention.inbox stoi w JEDNYM miejscu,
// wspólnym dla obu ekranów, które ją czytają. Kopia trzymana tutaj zdążyła się
// już rozjechać na wielkości liter — niewidocznie, bo lista pisze powód
// wersalikami.
import { inboxReasonLabels as reasonLabels } from "./inbox-triage.js";

// What is left here is the ATTENTION side of collaboration. The comments panel
// that stood above it is gone, and not because it was unloved: the task
// inspector, the project record and the organization record now draw the one
// `RecordCommentsPanel`, so a capability added to comments arrives on all three
// at once instead of on whichever file somebody edited. Its stylesheet went
// with it — those rules were nearly six kilobytes of the hot-path sheet, and
// the replacement carries its own, in a chunk nobody loads until a record is
// opened.

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
