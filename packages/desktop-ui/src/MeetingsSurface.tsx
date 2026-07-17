import { useEffect, useRef, useState } from "react";

import type {
  CalendarBlockDraft,
  CalendarWritePreview,
  MeetingLoopSurface,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";
import { createPortal } from "react-dom";

import { MeetingMarkdown, toPlainMeetingMarkdown } from "./MeetingMarkdown.js";

type MeetingState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly data: MeetingLoopSurface };

type JamieState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly configured: boolean;
      readonly scope?: "personal" | "workspace";
    }
  | { readonly kind: "error" };

type CompletedMeeting = MeetingLoopSurface["completed"][number];
type MeetingWorkItem = CompletedMeeting["workItems"][number];

const countLabel = (
  count: number,
  one: string,
  few: string,
  many: string,
) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return `1 ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${count} ${few}`;
  return `${count} ${many}`;
};

const healthLabel = (meeting: CompletedMeeting) => {
  switch (meeting.triage) {
    case "ready":
      return "Gotowe";
    case "partial":
      return "Częściowe";
    case "conflicted":
      return "Konflikt";
    case "needs_review":
      return "Do uwagi";
  }
};

const workItemKindLabel = (item: MeetingWorkItem) => {
  switch (item.kind) {
    case "task":
      return "Zadanie";
    case "decision":
      return "Decyzja";
    case "waiting":
      return "Oczekiwanie";
    case "note":
      return "Notatka";
    case "follow_up":
      return "Dalszy kontakt";
  }
};

const workItemStateLabel = (item: MeetingWorkItem) => {
  switch (item.state) {
    case "open":
      return "Otwarte";
    case "completed":
      return "Ukończone";
    case "dismissed":
      return "Odrzucone";
    case "withdrawn":
      return "Wycofane w Jamie";
    case "conflicted":
      return "Konflikt";
  }
};

const workItemMetadata = (item: MeetingWorkItem) =>
  item.responsibilityOverride !== undefined
    ? `${workItemStateLabel(item)} · Odpowiedzialność: ${item.responsibilityOverride.name} · korekta lokalna`
    : item.assignee === undefined
      ? workItemStateLabel(item)
      : `${workItemStateLabel(item)} · Jamie: ${item.assignee.name}`;

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const capabilityCopy = (surface: MeetingLoopSurface) => {
  switch (surface.capability.availability) {
    case "available":
      return "Kalendarz jest dostępny. Wydarzenia pozostają źródłem prawdy w wybranym kalendarzu.";
    case "permission_required":
      return "macOS wymaga pełnego dostępu do Kalendarza, aby Constellation mogło odczytać nadchodzące wydarzenia.";
    case "permission_denied":
      return "Dostęp do Kalendarza jest wyłączony. Zmień uprawnienie w Ustawieniach systemowych.";
    case "provider_unavailable":
      return surface.capability.platform === "windows"
        ? "Provider kalendarza dla Windows nie jest jeszcze skonfigurowany. Wyniki Jamie nadal pozostają dostępne."
        : "Na tym urządzeniu nie ma obsługiwanego providera kalendarza.";
    case "offline":
      return "Kalendarz jest chwilowo offline. Pokazujemy ostatnie bezpieczne dane bez udawania aktualności.";
    case "error":
      return "Nie udało się odczytać kalendarza. Spróbuj ponownie; żadne wydarzenie nie zostało zmienione.";
  }
};

const CalendarConsentDialog = ({
  client,
  preview,
  onClose,
  onApplied,
}: {
  readonly client: ConstellationRendererClient;
  readonly preview: CalendarWritePreview;
  readonly onClose: () => void;
  readonly onApplied: () => void;
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
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </header>
        <dl className="calendar-preview-facts">
          <div>
            <dt>Tytuł</dt>
            <dd>{block.title}</dd>
          </div>
          <div>
            <dt>Początek</dt>
            <dd>{formatTime(block.startsAt)}</dd>
          </div>
          <div>
            <dt>Koniec</dt>
            <dd>{formatTime(block.endsAt)}</dd>
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
          <p className="inline-error" role="alert">
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
                  if (result.outcome === "applied") onApplied();
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

export const MeetingsSurface = ({
  client,
  inspectorHost,
  onInspectorOpen,
}: {
  readonly client: ConstellationRendererClient;
  readonly inspectorHost: HTMLElement | null;
  readonly onInspectorOpen: () => void;
}) => {
  const [state, setState] = useState<MeetingState>({ kind: "loading" });
  const [preview, setPreview] = useState<CalendarWritePreview>();
  const [notice, setNotice] = useState<string>();
  const [busyItemId, setBusyItemId] = useState<string>();
  const [responsibilityItemId, setResponsibilityItemId] = useState<string>();
  const [responsibilityName, setResponsibilityName] = useState("");
  const [jamie, setJamie] = useState<JamieState>({ kind: "loading" });
  const [jamieApiKey, setJamieApiKey] = useState("");
  const [jamieScope, setJamieScope] = useState<"personal" | "workspace">(
    "personal",
  );
  const [jamieBusy, setJamieBusy] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>();
  const [visibleTranscriptMeetingId, setVisibleTranscriptMeetingId] =
    useState<string>();
  const [newItemMeetingId, setNewItemMeetingId] = useState<string>();
  const [newItemKind, setNewItemKind] = useState<
    "task" | "waiting" | "decision" | "note" | "follow_up"
  >("task");
  const [newItemTitle, setNewItemTitle] = useState("");
  const loadJamieStatus = () => {
    setJamie({ kind: "loading" });
    void client
      .getJamieStatus()
      .then((status) => setJamie({ kind: "ready", ...status }))
      .catch(() => setJamie({ kind: "error" }));
  };
  const load = () => {
    setState({ kind: "loading" });
    const from = new Date();
    const to = new Date(from.getTime() + 14 * 86_400_000);
    void client
      .getMeetingLoop({ from: from.toISOString(), to: to.toISOString() })
      .then((data) => setState({ kind: "ready", data }))
      .catch(() =>
        setState({
          kind: "error",
          message:
            "Pętla spotkań jest niedostępna. Dane i kalendarz nie zostały zmienione.",
        }),
      );
  };
  useEffect(load, [client]);
  useEffect(loadJamieStatus, [client]);

  if (state.kind === "loading") {
    return (
      <section className="meeting-surface meeting-skeleton" aria-busy="true">
        <div />
        <div />
        <div />
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="meeting-surface state-panel state-panel--error">
        <span className="empty-glyph" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M12 5v8M12 17v.5" />
          </svg>
        </span>
        <h1>Spotkania są chwilowo niedostępne</h1>
        <p>{state.message}</p>
        <button className="primary-button" onClick={load}>
          Spróbuj ponownie
        </button>
      </section>
    );
  }

  const surface = state.data;
  const selectedMeeting =
    surface.completed.find((meeting) => meeting.id === selectedMeetingId) ??
    surface.completed[0];
  return (
    <section
      className="meeting-surface"
      aria-labelledby="meeting-surface-title"
    >
      <header className="meeting-hero">
        <div>
          <p className="eyebrow">Od przygotowania do dalszej pracy</p>
          <h1 id="meeting-surface-title">Spotkania</h1>
          <p>
            Fakty przed spotkaniem, wynik Jamie po nim i każde dalsze działanie
            z własnym cyklem życia.
          </p>
        </div>
        <div
          className={`calendar-capability calendar-capability--${surface.capability.availability}`}
        >
          <strong>
            {surface.capability.provider === "eventkit"
              ? "Apple Calendar"
              : "Kalendarz"}
          </strong>
          <span>{capabilityCopy(surface)}</span>
          {surface.capability.availability !== "available" && (
            <button
              className="quiet-button"
              onClick={() => {
                if (
                  surface.capability.platform === "macos" &&
                  surface.capability.availability === "permission_required"
                ) {
                  void client.requestCalendarAccess().then(load);
                } else load();
              }}
            >
              {surface.capability.platform === "macos" &&
              surface.capability.availability === "permission_required"
                ? "Przyznaj dostęp"
                : "Sprawdź ponownie"}
            </button>
          )}
        </div>
      </header>

      <div className="meeting-integration-wrap">
        <section className="meeting-integration" aria-labelledby="jamie-title">
          <div>
            <p className="eyebrow">Źródło wyników</p>
            <h2 id="jamie-title">Jamie</h2>
            <p>
              Jamie zachowuje odpowiedzialność za nagranie, transkrypcję i
              inteligencję spotkania. Constellation importuje wynik oraz trwałe
              identyfikatory zadań.
            </p>
          </div>
          {jamie.kind === "loading" ? (
            <span className="meeting-integration-status">Sprawdzam…</span>
          ) : jamie.kind === "error" ? (
            <button className="secondary-button" onClick={loadJamieStatus}>
              Ponów sprawdzenie
            </button>
          ) : jamie.configured ? (
            <div className="meeting-integration-actions">
              <span className="meeting-integration-status">
                Połączono klucz{" "}
                {jamie.scope === "workspace" ? "zespołu" : "osobisty"}
              </span>
              <button
                className="primary-button"
                disabled={jamieBusy}
                onClick={() => {
                  setJamieBusy(true);
                  void client
                    .syncJamie()
                    .then((result) => {
                      setJamieBusy(false);
                      setNotice(
                        `Jamie: ${result.applied + result.corrected} nowych lub poprawionych, ${result.noChange} bez zmian, ${result.partial} częściowych${result.failed ? `, ${result.failed} błędów` : ""}.`,
                      );
                      load();
                    })
                    .catch(() => {
                      setJamieBusy(false);
                      setNotice(
                        "Nie udało się zsynchronizować Jamie. Dotychczasowe wyniki pozostały bez zmian.",
                      );
                    });
                }}
              >
                {jamieBusy ? "Synchronizuję…" : "Synchronizuj ostatnie 90 dni"}
              </button>
              <button
                className="quiet-button"
                disabled={jamieBusy}
                onClick={() => {
                  setJamieBusy(true);
                  void client.disconnectJamie().then(() => {
                    setJamieBusy(false);
                    setNotice(
                      "Odłączono klucz Jamie. Zaimportowane wyniki zachowano.",
                    );
                    loadJamieStatus();
                  });
                }}
              >
                Odłącz
              </button>
            </div>
          ) : (
            <form
              className="meeting-integration-form"
              onSubmit={(event) => {
                event.preventDefault();
                setJamieBusy(true);
                void client
                  .configureJamie({ apiKey: jamieApiKey, scope: jamieScope })
                  .then(() => {
                    setJamieApiKey("");
                    setJamieBusy(false);
                    setNotice(
                      "Klucz Jamie zapisano w ochronie poświadczeń systemu operacyjnego.",
                    );
                    loadJamieStatus();
                  })
                  .catch(() => {
                    setJamieBusy(false);
                    setNotice(
                      "Nie zapisano klucza Jamie. Sprawdź format i ochronę poświadczeń systemu.",
                    );
                  });
              }}
            >
              <label>
                Zakres klucza
                <select
                  value={jamieScope}
                  onChange={(event) =>
                    setJamieScope(event.target.value as typeof jamieScope)
                  }
                >
                  <option value="personal">Osobisty</option>
                  <option value="workspace">Workspace</option>
                </select>
              </label>
              <label>
                Klucz API
                <input
                  type="password"
                  autoComplete="off"
                  value={jamieApiKey}
                  onChange={(event) => setJamieApiKey(event.target.value)}
                  placeholder="jk_…"
                  required
                />
              </label>
              <button
                className="primary-button"
                disabled={jamieBusy || jamieApiKey.trim().length < 19}
              >
                {jamieBusy ? "Zabezpieczam…" : "Połącz Jamie"}
              </button>
            </form>
          )}
        </section>
      </div>

      {notice && (
        <p className="meeting-notice" role="status">
          {notice}
        </p>
      )}

      <div className="meeting-lanes">
        <section className="meeting-upcoming" aria-labelledby="upcoming-title">
          <header>
            <h2 id="upcoming-title">Nadchodzące</h2>
            <span>
              {countLabel(
                surface.upcoming.length,
                "wydarzenie",
                "wydarzenia",
                "wydarzeń",
              )}
            </span>
          </header>
          {surface.upcoming.length === 0 ? (
            <div className="meeting-empty">
              <svg aria-hidden="true" viewBox="0 0 48 48">
                <path d="M9 12h30v27H9zM15 7v10M33 7v10M9 20h30" />
              </svg>
              <h3>Brak widocznych wydarzeń</h3>
              <p>
                {surface.capability.canRead
                  ? "W tym oknie czasu kalendarz nie ma spotkań."
                  : "Połącz lub odblokuj provider, aby zobaczyć przygotowanie."}
              </p>
            </div>
          ) : (
            surface.upcoming.map(({ event, brief }) => (
              <article
                className="meeting-event"
                key={`${event.calendarExternalId}:${event.eventExternalId}`}
              >
                <div className="meeting-time">
                  <strong>{formatTime(event.startsAt)}</strong>
                  <span>
                    {event.isAllDay
                      ? "Cały dzień"
                      : `${Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000)} min`}
                  </span>
                </div>
                <div className="meeting-event-body">
                  <h3>{event.title}</h3>
                  <p>
                    {event.attendees.length} uczestników
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                  <div className="evidence-thread">
                    <span className="evidence-node">Wydarzenie</span>
                    <i aria-hidden="true" />
                    <span className="evidence-node">Brief faktograficzny</span>
                    <i aria-hidden="true" />
                    <span className="evidence-node evidence-node--muted">
                      Wynik Jamie po spotkaniu
                    </span>
                  </div>
                  <div className="meeting-brief">
                    <div>
                      <strong>Orientacja</strong>
                      <span>
                        {brief.orientation.length
                          ? brief.orientation
                              .map((item) => item.label)
                              .join(" · ")
                          : "Brak dokładnie powiązanych rekordów."}
                      </span>
                    </div>
                    <div>
                      <strong>Otwarte pętle</strong>
                      <span>
                        {brief.openLoops.length
                          ? brief.openLoops
                              .map((item) => item.label)
                              .join(" · ")
                          : "Brak bezpiecznie dopasowanych zobowiązań."}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  className="secondary-button meeting-block-action"
                  disabled={
                    !surface.capability.canWriteOwnedBlocks || event.isAllDay
                  }
                  title={
                    !surface.capability.canWriteOwnedBlocks
                      ? "Provider nie zezwala na zapis własnych bloków."
                      : undefined
                  }
                  onClick={() => {
                    const startsAt = new Date(
                      Date.parse(event.startsAt) - 30 * 60_000,
                    ).toISOString();
                    const block: CalendarBlockDraft = {
                      calendarExternalId: event.calendarExternalId,
                      ownedBlockExternalId: `meeting-prep:${event.eventExternalId}`,
                      title: `Przygotowanie: ${event.title}`,
                      startsAt,
                      endsAt: event.startsAt,
                      expectedRevision: null,
                      sourceRecordIds: [
                        `calendar-event:${event.eventExternalId}`,
                      ],
                    };
                    void client
                      .previewCalendarBlocks({ blocks: [block] })
                      .then((result) => {
                        if (result === undefined)
                          setNotice(
                            "Nie udało się przygotować bezpiecznego podglądu. Nic nie zapisano.",
                          );
                        else setPreview(result);
                      });
                  }}
                >
                  Podgląd bloku
                </button>
              </article>
            ))
          )}
        </section>

        <section
          className="meeting-completed"
          aria-labelledby="completed-title"
        >
          <header>
            <h2 id="completed-title">Wyniki Jamie</h2>
            <span>
              {countLabel(
                surface.completed.length,
                "wynik",
                "wyniki",
                "wyników",
              )}
            </span>
          </header>
          {surface.completed.length === 0 ? (
            <div className="meeting-empty meeting-empty--compact">
              <h3>Nie zaimportowano jeszcze wyniku</h3>
              <p>
                Jamie nadal odpowiada za nagranie, transkrypcję i inteligencję
                spotkania. Import zachowa źródło i bezpiecznie zbiegnie
                duplikaty.
              </p>
            </div>
          ) : selectedMeeting ? (
            <div className="meeting-results-browser">
              <ol
                className="meeting-result-list"
                aria-label="Zaimportowane wyniki Jamie"
              >
                {surface.completed.map((meeting) => {
                  const selected = meeting.id === selectedMeeting.id;
                  const summary = meeting.summaryMarkdown
                    ? toPlainMeetingMarkdown(meeting.summaryMarkdown)
                    : "Brak podsumowania w wyniku Jamie.";
                  return (
                    <li key={meeting.id}>
                      <button
                        type="button"
                        className={`meeting-result-row${selected ? " is-selected" : ""}`}
                        aria-pressed={selected}
                        aria-controls="meeting-result-detail"
                        onClick={() => {
                          setSelectedMeetingId(meeting.id);
                          setVisibleTranscriptMeetingId(undefined);
                          setNewItemMeetingId(undefined);
                          onInspectorOpen();
                        }}
                      >
                        <span className="meeting-result-row-heading">
                          <strong>
                            {meeting.title ?? "Spotkanie bez tytułu"}
                          </strong>
                          <span
                            className={`meeting-health meeting-health--${meeting.triage}`}
                          >
                            {healthLabel(meeting)}
                          </span>
                        </span>
                        <time dateTime={meeting.startedAt}>
                          {formatTime(meeting.startedAt)}
                        </time>
                        <span className="meeting-result-row-summary">
                          {summary}
                        </span>
                        <span className="meeting-result-row-meta">
                          {meeting.workItems.length} działań
                          <span aria-hidden="true">→</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {inspectorHost &&
                createPortal(
                  <article
                    className="meeting-result-detail"
                    id="meeting-result-detail"
                    aria-labelledby="meeting-result-detail-title"
                  >
                    <header className="meeting-result-detail-header">
                      <div>
                        <p className="eyebrow">Wynik Jamie</p>
                        <h3 id="meeting-result-detail-title">
                          {selectedMeeting.title ?? "Spotkanie bez tytułu"}
                        </h3>
                        <p>
                          <time dateTime={selectedMeeting.startedAt}>
                            {formatTime(selectedMeeting.startedAt)}
                          </time>
                          <span aria-hidden="true"> · </span>
                          {selectedMeeting.participants.length} uczestników
                        </p>
                      </div>
                      <strong
                        className={`meeting-health meeting-health--${selectedMeeting.triage}`}
                      >
                        {healthLabel(selectedMeeting)}
                      </strong>
                    </header>

                    <section
                      className="meeting-result-summary"
                      aria-labelledby="meeting-result-summary-title"
                    >
                      <h4 id="meeting-result-summary-title">Podsumowanie</h4>
                      {selectedMeeting.summaryMarkdown ? (
                        <MeetingMarkdown
                          value={selectedMeeting.summaryMarkdown}
                        />
                      ) : (
                        <p className="meeting-result-empty-copy">
                          Jamie nie zwrócił podsumowania dla tego spotkania.
                        </p>
                      )}
                    </section>

                    {selectedMeeting.transcriptMarkdown && (
                      <section
                        className="meeting-result-transcript"
                        aria-labelledby="meeting-result-transcript-title"
                      >
                        <header>
                          <div>
                            <h4 id="meeting-result-transcript-title">
                              Transkrypcja
                            </h4>
                            <p>Oryginalna treść zaimportowana z Jamie.</p>
                          </div>
                          <button
                            type="button"
                            className="secondary-button"
                            aria-expanded={
                              visibleTranscriptMeetingId === selectedMeeting.id
                            }
                            aria-controls="meeting-result-transcript-content"
                            onClick={() =>
                              setVisibleTranscriptMeetingId((current) =>
                                current === selectedMeeting.id
                                  ? undefined
                                  : selectedMeeting.id,
                              )
                            }
                          >
                            {visibleTranscriptMeetingId === selectedMeeting.id
                              ? "Ukryj transkrypcję"
                              : "Pokaż transkrypcję"}
                          </button>
                        </header>
                        {visibleTranscriptMeetingId === selectedMeeting.id && (
                          <div id="meeting-result-transcript-content">
                            <MeetingMarkdown
                              value={selectedMeeting.transcriptMarkdown}
                            />
                          </div>
                        )}
                      </section>
                    )}

                    <section
                      className="meeting-result-work"
                      aria-labelledby="meeting-result-work-title"
                    >
                      <header>
                        <div>
                          <h4 id="meeting-result-work-title">
                            Dalsze działania
                          </h4>
                          <p>
                            Każdy zapis ma własny stan i pozostaje powiązany ze
                            spotkaniem.
                          </p>
                        </div>
                        <span>
                          {countLabel(
                            selectedMeeting.workItems.length,
                            "zapis",
                            "zapisy",
                            "zapisów",
                          )}
                        </span>
                      </header>
                      {selectedMeeting.workItems.length === 0 ? (
                        <p className="meeting-result-empty-copy">
                          W tym wyniku nie ma jeszcze dalszych działań.
                        </p>
                      ) : (
                        <ul className="meeting-work-items">
                          {selectedMeeting.workItems.map((item) => (
                            <li className="meeting-work-item" key={item.id}>
                              <div className="meeting-work-item-copy">
                                <span>{workItemKindLabel(item)}</span>
                                <strong>{item.title}</strong>
                                <small>{workItemMetadata(item)}</small>
                              </div>
                              <div className="meeting-item-actions">
                                <button
                                  className="quiet-button"
                                  disabled={busyItemId === item.id}
                                  onClick={() => {
                                    setBusyItemId(item.id);
                                    const nextState =
                                      item.state === "open"
                                        ? "completed"
                                        : "open";
                                    void client
                                      .editMeetingWorkItem({
                                        meetingId: selectedMeeting.id,
                                        workItemId: item.id,
                                        expectedVersion: item.version,
                                        title: item.title,
                                        state: nextState,
                                      })
                                      .then((changed) => {
                                        setBusyItemId(undefined);
                                        if (changed) load();
                                        else
                                          setNotice(
                                            "Ten wynik zmienił się w międzyczasie. Odświeżono bez nadpisywania nowszej wersji.",
                                          );
                                      });
                                  }}
                                >
                                  {item.state === "open"
                                    ? "Ukończ"
                                    : item.state === "conflicted"
                                      ? "Zachowaj lokalne"
                                      : "Przywróć"}
                                </button>
                                {item.state === "conflicted" &&
                                  item.sourceValueInConflict && (
                                    <button
                                      className="quiet-button"
                                      disabled={busyItemId === item.id}
                                      onClick={() => {
                                        setBusyItemId(item.id);
                                        void client
                                          .editMeetingWorkItem({
                                            meetingId: selectedMeeting.id,
                                            workItemId: item.id,
                                            expectedVersion: item.version,
                                            title: item.sourceValueInConflict!,
                                            state: "open",
                                          })
                                          .then((changed) => {
                                            setBusyItemId(undefined);
                                            if (changed) load();
                                            else
                                              setNotice(
                                                "Nie rozstrzygnięto konfliktu, bo istnieje nowsza wersja.",
                                              );
                                          });
                                      }}
                                    >
                                      Przyjmij Jamie
                                    </button>
                                  )}
                                {item.state === "open" && (
                                  <button
                                    className="quiet-button"
                                    disabled={busyItemId === item.id}
                                    onClick={() => {
                                      setBusyItemId(item.id);
                                      void client
                                        .editMeetingWorkItem({
                                          meetingId: selectedMeeting.id,
                                          workItemId: item.id,
                                          expectedVersion: item.version,
                                          title: item.title,
                                          state: "dismissed",
                                        })
                                        .then((changed) => {
                                          setBusyItemId(undefined);
                                          if (changed) load();
                                          else
                                            setNotice(
                                              "Nie odrzucono wyniku, bo istnieje nowsza wersja.",
                                            );
                                        });
                                    }}
                                  >
                                    Odrzuć
                                  </button>
                                )}
                                {(item.kind === "task" ||
                                  item.kind === "waiting" ||
                                  item.kind === "follow_up") && (
                                  <button
                                    className="quiet-button"
                                    disabled={busyItemId === item.id}
                                    onClick={() => {
                                      setResponsibilityItemId(item.id);
                                      setResponsibilityName(
                                        item.responsibilityOverride?.name ??
                                          item.assignee?.name ??
                                          "",
                                      );
                                    }}
                                  >
                                    {item.responsibilityOverride ===
                                      undefined && item.assignee === undefined
                                      ? "Ustaw osobę"
                                      : "Zmień osobę"}
                                  </button>
                                )}
                              </div>
                              {responsibilityItemId === item.id && (
                                <form
                                  className="meeting-responsibility-form"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    setBusyItemId(item.id);
                                    void client
                                      .correctMeetingWorkItemResponsibility({
                                        meetingId: selectedMeeting.id,
                                        workItemId: item.id,
                                        expectedVersion: item.version,
                                        name: responsibilityName.trim(),
                                      })
                                      .then((changed) => {
                                        setBusyItemId(undefined);
                                        if (changed) {
                                          setResponsibilityItemId(undefined);
                                          setResponsibilityName("");
                                          load();
                                        } else
                                          setNotice(
                                            "Nie zapisano odpowiedzialności, bo wynik zmienił się w międzyczasie.",
                                          );
                                      });
                                  }}
                                >
                                  <label>
                                    Odpowiedzialność za to działanie
                                    <input
                                      autoFocus
                                      maxLength={300}
                                      required
                                      value={responsibilityName}
                                      onChange={(event) =>
                                        setResponsibilityName(
                                          event.target.value,
                                        )
                                      }
                                    />
                                    {item.assignee !== undefined && (
                                      <small>
                                        Jamie wskazuje: {item.assignee.name}
                                      </small>
                                    )}
                                  </label>
                                  <button
                                    className="primary-button"
                                    disabled={
                                      busyItemId === item.id ||
                                      responsibilityName.trim().length === 0
                                    }
                                    type="submit"
                                  >
                                    Zapisz korektę
                                  </button>
                                  {item.responsibilityOverride !==
                                    undefined && (
                                    <button
                                      className="quiet-button"
                                      disabled={busyItemId === item.id}
                                      type="button"
                                      onClick={() => {
                                        setBusyItemId(item.id);
                                        void client
                                          .correctMeetingWorkItemResponsibility(
                                            {
                                              meetingId: selectedMeeting.id,
                                              workItemId: item.id,
                                              expectedVersion: item.version,
                                              name: null,
                                            },
                                          )
                                          .then((changed) => {
                                            setBusyItemId(undefined);
                                            if (changed) {
                                              setResponsibilityItemId(
                                                undefined,
                                              );
                                              setResponsibilityName("");
                                              load();
                                            } else
                                              setNotice(
                                                "Nie przywrócono odpowiedzialności z Jamie, bo wynik zmienił się w międzyczasie.",
                                              );
                                          });
                                      }}
                                    >
                                      Przywróć Jamie
                                    </button>
                                  )}
                                  <button
                                    className="quiet-button"
                                    type="button"
                                    onClick={() => {
                                      setResponsibilityItemId(undefined);
                                      setResponsibilityName("");
                                    }}
                                  >
                                    Anuluj
                                  </button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    {newItemMeetingId === selectedMeeting.id ? (
                      <form
                        className="meeting-add-item"
                        onSubmit={(event) => {
                          event.preventDefault();
                          setJamieBusy(true);
                          void client
                            .addMeetingWorkItem({
                              meetingId: selectedMeeting.id,
                              requestId: crypto.randomUUID(),
                              kind: newItemKind,
                              title: newItemTitle,
                            })
                            .then((created) => {
                              setJamieBusy(false);
                              if (created) {
                                setNewItemTitle("");
                                setNewItemMeetingId(undefined);
                                load();
                              } else
                                setNotice(
                                  "Nie dodano działania, bo spotkanie zmieniło się w międzyczasie.",
                                );
                            });
                        }}
                      >
                        <label>
                          Typ
                          <select
                            value={newItemKind}
                            onChange={(event) =>
                              setNewItemKind(
                                event.target.value as typeof newItemKind,
                              )
                            }
                          >
                            <option value="task">Zadanie</option>
                            <option value="waiting">Oczekiwanie</option>
                            <option value="decision">Decyzja</option>
                            <option value="note">Notatka</option>
                            <option value="follow_up">Dalszy kontakt</option>
                          </select>
                        </label>
                        <label>
                          Treść
                          <input
                            value={newItemTitle}
                            onChange={(event) =>
                              setNewItemTitle(event.target.value)
                            }
                            maxLength={4_000}
                            required
                            autoFocus
                          />
                        </label>
                        <button
                          className="primary-button"
                          disabled={
                            jamieBusy || newItemTitle.trim().length === 0
                          }
                        >
                          Dodaj niezależnie
                        </button>
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => setNewItemMeetingId(undefined)}
                        >
                          Anuluj
                        </button>
                      </form>
                    ) : (
                      <button
                        className="secondary-button meeting-add-trigger"
                        onClick={() => setNewItemMeetingId(selectedMeeting.id)}
                      >
                        Dodaj niezależny zapis
                      </button>
                    )}
                    {selectedMeeting.missingComponents.length > 0 && (
                      <p className="inline-warning">
                        Brakuje trwałych identyfikatorów zadań Jamie. Ponowienie
                        uzupełni je bez duplikowania spotkania.
                      </p>
                    )}
                  </article>,
                  inspectorHost,
                )}
            </div>
          ) : null}
        </section>
      </div>
      {preview && (
        <CalendarConsentDialog
          client={client}
          preview={preview}
          onClose={() => setPreview(undefined)}
          onApplied={() => {
            setPreview(undefined);
            setNotice(
              "Blok przygotowania zapisano po dokładnym potwierdzeniu.",
            );
            load();
          }}
        />
      )}
    </section>
  );
};
