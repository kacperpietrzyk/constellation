import { useState } from "react";

import type {
  CalendarBlockDraft,
  CalendarWritePreview,
  TaskId,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { CalendarConsentDialog } from "./CalendarConsentDialog.js";
import {
  calendarDeletionDraft,
  nextReservationStart,
  reservationTarget,
} from "../client/calendar-reservation.js";
import {
  setTaskCalendarBlock,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";
import { dateKeyInZone, formatWeekdayTime } from "../i18n.js";

type ReservedBlock = {
  readonly ownedBlockExternalId: string;
  readonly calendarExternalId: string;
  readonly revision: string;
  readonly startsAt: string;
  readonly endsAt: string;
};

const previewFailed = "Nie udało się przygotować podglądu. Bez zmian.";

// R12.6 / ADR-042 — "when I will do it", kept deliberately separate from the
// deadline shown above it in the inspector.
//
// The order of the write is load-bearing and is the thing most easily got
// wrong: read the Task version, write to the provider through the exact
// consent preview, record the returned revision against that version, and only
// then refresh. Refreshing before recording would make the version stale; not
// recording at all would leave a real calendar event the Task cannot ever
// update or release, which is precisely what ADR-042 exists to prevent.
export const TaskReservationSection = ({
  client,
  snapshot,
  taskId,
  taskVersion,
  taskTitle,
  block,
  onRecorded,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly taskId: TaskId;
  readonly taskVersion: number;
  readonly taskTitle: string;
  readonly block: ReservedBlock | undefined;
  readonly onRecorded: (message: string) => Promise<void>;
  readonly onFailure: (result: MutationFailure) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [preview, setPreview] = useState<CalendarWritePreview>();
  const [defaultStart] = useState(nextReservationStart);
  const [date, setDate] = useState(() => dateKeyInZone(defaultStart));
  const [startTime, setStartTime] = useState(() =>
    defaultStart.toTimeString().slice(0, 5),
  );
  const [minutes, setMinutes] = useState(60);
  // Captured when the preview is opened, so the recording step uses the
  // version that was current before the provider write rather than one read
  // after a refresh.
  const [pendingVersion, setPendingVersion] = useState(taskVersion);

  const record = async (revision: string, draft: CalendarBlockDraft) => {
    const result = await setTaskCalendarBlock(
      client,
      snapshot,
      taskId,
      pendingVersion,
      {
        ownedBlockExternalId: draft.ownedBlockExternalId,
        calendarExternalId: draft.calendarExternalId,
        revision,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
      },
    );
    if (result.kind === "success") {
      setOpen(false);
      await onRecorded("Czas zarezerwowano i zapisano przy zadaniu.");
      return;
    }
    // The provider event exists — the write already succeeded. Saying
    // "reservation failed" here would be a lie that sends the owner looking
    // for a calendar entry that is really there. ADR-042 §2's recovery is
    // reconcile-on-next-preview, so say exactly that.
    setNotice(
      "Blok zapisano w kalendarzu, ale nie udało się go zapisać przy zadaniu. Wydarzenie istnieje — kolejny podgląd rezerwacji je odnajdzie i uzgodni.",
    );
  };

  const startReservation = () => {
    setBusy(true);
    setNotice(undefined);
    const from = new Date();
    const to = new Date(from.getTime() + 14 * 86_400_000);
    void client
      .getMeetingLoop({ from: from.toISOString(), to: to.toISOString() })
      .then((surface) => surface.capability)
      // A device with no meeting loop at all rejects; that is one of the
      // "cannot reserve here" answers, not an error to surface raw.
      .catch(() => undefined)
      .then((capability) => {
        const target = reservationTarget(capability);
        if (target.kind === "unavailable") {
          setBusy(false);
          setNotice(target.reason);
          return;
        }
        // Device-local wall clock on purpose: the block is written to this
        // device's calendar and shows there in device time, so "09:00" means
        // the clock in front of the owner. The workspace timezone governs
        // deadlines ("do piątku" = the owner's Friday), not where a calendar
        // event lands.
        const startsAt = new Date(`${date}T${startTime}:00`);
        if (Number.isNaN(startsAt.getTime())) {
          setBusy(false);
          setNotice("Podaj poprawną datę i godzinę rozpoczęcia.");
          return;
        }
        if (startsAt.getTime() <= Date.now()) {
          setBusy(false);
          setNotice("Wybierz przyszłą godzinę rozpoczęcia.");
          return;
        }
        const draft: CalendarBlockDraft = {
          calendarExternalId: target.calendarExternalId,
          ownedBlockExternalId: `task-block:${taskId}`,
          title: taskTitle,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
          // Replacing an existing reservation must match the revision the
          // provider last reported, or the write is refused as stale.
          expectedRevision: block?.revision ?? null,
          sourceRecordIds: [`task:${taskId}`],
        };
        setPendingVersion(taskVersion);
        return client.previewCalendarBlocks({ blocks: [draft] }).then((r) => {
          setBusy(false);
          if (r === undefined) setNotice(previewFailed);
          else setPreview(r);
        });
      });
  };

  const clearReservation = (version: number, calendarDeleted = false) => {
    setBusy(true);
    setNotice(undefined);
    void setTaskCalendarBlock(client, snapshot, taskId, version, null).then(
      async (result) => {
        setBusy(false);
        if (result.kind === "success")
          await onRecorded(
            calendarDeleted
              ? "Usunięto wydarzenie i rezerwację."
              : "Zwolniono rezerwację. Wydarzenie pozostaje w kalendarzu.",
          );
        else if (calendarDeleted)
          setNotice(
            "Wydarzenie usunięto, ale zadanie nadal pokazuje rezerwację. Przestań ją śledzić.",
          );
        else onFailure(result);
      },
    );
  };

  const release = () => clearReservation(taskVersion);

  const previewDeletion = () => {
    if (block === undefined) return;
    setBusy(true);
    setNotice(undefined);
    const draft = calendarDeletionDraft(block, taskId, taskTitle);
    setPendingVersion(taskVersion);
    void client
      .previewCalendarBlocks({ operation: "delete", blocks: [draft] })
      .then((result) => {
        setBusy(false);
        if (result === undefined) setNotice(previewFailed);
        else setPreview(result);
      })
      .catch(() => {
        setBusy(false);
        setNotice(previewFailed);
      });
  };

  return (
    <section className="inspector-section task-reservation-block">
      <p className="section-label">Zarezerwowany czas</p>
      {block === undefined ? (
        <p className="muted-text">
          Termin mówi, kiedy to ma być zrobione. Rezerwacja mówi, kiedy to
          zrobisz.
        </p>
      ) : (
        <p className="task-reservation-window">
          {formatWeekdayTime(block.startsAt)} –{" "}
          {formatWeekdayTime(block.endsAt)}
        </p>
      )}
      {notice && (
        <p className="inline-error" role="alert">
          {notice}
        </p>
      )}
      {open && block === undefined && (
        <div className="task-reservation-form">
          <label>
            Dzień
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Początek
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>
          <label>
            Długość
            <select
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            >
              <option value={30}>30 minut</option>
              <option value={60}>1 godzina</option>
              <option value={90}>1,5 godziny</option>
              <option value={120}>2 godziny</option>
            </select>
          </label>
        </div>
      )}
      <div className="task-reservation-actions task-removal-actions">
        {block === undefined ? (
          open ? (
            <>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={startReservation}
              >
                {busy ? "Przygotowuję podgląd…" : "Pokaż podgląd zapisu"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setNotice(undefined);
                }}
              >
                Anuluj
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setOpen(true)}
            >
              Zarezerwuj czas
            </button>
          )
        ) : (
          <>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={release}
            >
              {busy ? "Zwalniam…" : "Przestań śledzić"}
            </button>
            <button
              type="button"
              className="secondary-button status-danger"
              disabled={busy}
              onClick={previewDeletion}
            >
              Usuń z kalendarza…
            </button>
          </>
        )}
      </div>
      {preview && (
        <CalendarConsentDialog
          client={client}
          preview={preview}
          onClose={() => setPreview(undefined)}
          onApplied={(revisions) => {
            const draft = preview.blocks[0]!;
            const deleting = preview.operation === "delete";
            const revision = revisions[0];
            setPreview(undefined);
            if (deleting) {
              clearReservation(pendingVersion, true);
              return;
            }
            if (revision === undefined) {
              setNotice(
                "Kalendarz nie zwrócił rewizji zapisu, więc rezerwacji nie zapisano przy zadaniu.",
              );
              return;
            }
            void record(revision, draft);
          }}
        />
      )}
    </section>
  );
};
