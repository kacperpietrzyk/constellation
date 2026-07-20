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
            <p className="eyebrow">Dokładny zapis do kalendarza</p>
            <h2 id="calendar-consent-title">Potwierdź ten blok pracy</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij podgląd"
            onClick={onClose}
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </header>
        <dl className="calendar-preview-facts">
          <div>
            <dt>Tytuł</dt>
            <dd>{block.title}</dd>
          </div>
          <div>
            <dt>Początek</dt>
            <dd>{formatWeekdayTime(block.startsAt)}</dd>
          </div>
          <div>
            <dt>Koniec</dt>
            <dd>{formatWeekdayTime(block.endsAt)}</dd>
          </div>
          <div>
            <dt>Kalendarz</dt>
            <dd>{block.calendarExternalId}</dd>
          </div>
        </dl>
        <p className="meeting-consent-note">
          Zgoda dotyczy wyłącznie tych wartości i wygasa po pięciu minutach.
          Zmiana treści albo rewizji wymaga nowego podglądu.
        </p>
        {error && (
          <p id="calendar-consent-error" className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            ref={cancelRef}
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            Anuluj
          </button>
          <button
            className="primary-button"
            disabled={busy}
            aria-describedby={error ? "calendar-consent-error" : undefined}
            onClick={() => {
              setBusy(true);
              setError(undefined);
              void client
                .confirmCalendarBlocks({
                  previewId: preview.previewId,
                  consentToken: preview.consentToken,
                  blocks: preview.blocks,
                })
                .then((result) => {
                  setBusy(false);
                  if (result.outcome === "applied") onApplied(result.revisions);
                  else
                    setError(
                      result.code === "stale_revision"
                        ? "Kalendarz zmienił się od czasu podglądu. Otwórz nowy podgląd."
                        : "Zapis nie został wykonany. Sprawdź uprawnienie i spróbuj ponownie.",
                    );
                });
            }}
          >
            {busy ? "Zapisuję blok…" : "Zapisz ten blok"}
          </button>
        </footer>
      </section>
    </dialog>
  );
};
