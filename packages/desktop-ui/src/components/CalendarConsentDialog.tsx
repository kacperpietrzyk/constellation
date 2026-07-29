import { useEffect, useRef, useState } from "react";

import type { CalendarWritePreview } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { Icon } from "./Icon.js";
import { formatWeekdayTime } from "../i18n.js";

// Lifted out of MeetingsSurface so any surface that can produce a
// CalendarBlockDraft — a meeting, and now a Task reserving time — opens the
// same exact-consent dialog. The consent contract is unchanged: one preview,
// one single-use token, five-minute expiry, and the concrete save verb.
//
// onApplied receives the provider revisions the confirm returned, positionally
// matching preview.blocks. A meeting-prep block is fire-and-forget and ignores
// them; a Task must record the revision through task.setCalendarBlock or it
// owns a block it can never update or release — the whole point of ADR-042.
// The dialog stays generic by handing the revisions back rather than recording
// anything itself.
export const CalendarConsentDialog = ({
  client,
  preview,
  onClose,
  onApplied,
}: {
  readonly client: ConstellationRendererClient;
  readonly preview: CalendarWritePreview;
  readonly onClose: () => void;
  readonly onApplied: (revisions: readonly string[]) => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
    return () => dialogRef.current?.close();
  }, []);
  const block = preview.blocks[0]!;
  const deleting = preview.operation === "delete";
  return (
    <dialog
      ref={dialogRef}
      className="meeting-consent-backdrop"
      aria-labelledby="calendar-consent-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section className="meeting-consent-dialog">
        <header>
          <div>
            <p className="eyebrow">Calendar consent</p>
            <h2 id="calendar-consent-title">
              {deleting
                ? "Delete this block from the calendar?"
                : "Confirm this calendar block"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close the preview"
            onClick={onClose}
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </header>
        <dl className="calendar-preview-facts">
          <div>
            <dt>Title</dt>
            <dd>{block.title}</dd>
          </div>
          <div>
            <dt>Start</dt>
            <dd>{formatWeekdayTime(block.startsAt)}</dd>
          </div>
          <div>
            <dt>End</dt>
            <dd>{formatWeekdayTime(block.endsAt)}</dd>
          </div>
          <div>
            <dt>Calendar</dt>
            <dd>{block.calendarExternalId}</dd>
          </div>
        </dl>
        <p className="meeting-consent-note">
          {deleting
            ? "This deletes the event. There is no undo. Consent expires in five minutes."
            : "This one-time consent covers these values and expires in five minutes. A change needs a new preview."}
        </p>
        {error && (
          <p id="calendar-consent-error" className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="task-removal-actions">
          <button
            ref={cancelRef}
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className={
              deleting ? "secondary-button status-danger" : "primary-button"
            }
            disabled={busy}
            aria-describedby={error ? "calendar-consent-error" : undefined}
            onClick={() => {
              setBusy(true);
              setError(undefined);
              void client
                .confirmCalendarBlocks({
                  previewId: preview.previewId,
                  consentToken: preview.consentToken,
                  operation: preview.operation,
                  blocks: preview.blocks,
                })
                .then((result) => {
                  setBusy(false);
                  if (result.outcome === "applied") onApplied(result.revisions);
                  else
                    setError(
                      result.code === "stale_revision"
                        ? "The calendar changed. Try again."
                        : "The write did not go through. Check the Calendar permission.",
                    );
                });
            }}
          >
            {busy
              ? "Working…"
              : deleting
                ? "Delete from calendar"
                : "Save this block"}
          </button>
        </footer>
      </section>
    </dialog>
  );
};
