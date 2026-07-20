import { useEffect, useMemo, useRef, useState } from "react";

import {
  CommandEnvelopeSchema,
  QueryEnvelopeSchema,
  type CalendarBlockDraft,
  type CalendarWritePreview,
  type ImportedMeeting,
  type MeetingLoopSurface,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";
import { createPortal } from "react-dom";

import { MeetingMarkdown, toMeetingResultPreview } from "./MeetingMarkdown.js";
import { Icon } from "./components/Icon.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import { countLabel } from "./i18n.js";

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

const staleRefreshNotice =
  "Nie udało się odświeżyć spotkań. Pokazuję ostatni bezpieczny stan.";

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
  // Routing destinations are read lazily for the selected meeting's Space, so
  // an unrouted meeting never pays for them and the Jamie plane stays first.
  const [routingOptions, setRoutingOptions] = useState<{
    readonly projects: readonly {
      readonly id: string;
      readonly title: string;
    }[];
    readonly organizations: readonly {
      readonly id: string;
      readonly name: string;
    }[];
  }>({ projects: [], organizations: [] });
  const runMeetingCommand = async (
    meeting: ImportedMeeting,
    commandName:
      "meeting.route" | "meeting.promoteWorkItem" | "meeting.linkParticipants",
    payload: Record<string, unknown>,
    idempotencySuffix: string,
  ): Promise<boolean> => {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName,
        commandId: crypto.randomUUID(),
        workspaceId: meeting.workspaceId,
        idempotencyKey: `${commandName}:${meeting.id}:${idempotencySuffix}`,
        // The meeting version is the single optimistic guard: a Jamie sync or
        // another operator landing first is reported, never overwritten.
        expectedVersions: { [meeting.id]: meeting.version },
        correlationId: crypto.randomUUID(),
        payload: { meetingId: meeting.id, ...payload },
      }),
    );
    return (
      response.kind !== "contract_rejected" &&
      response.outcome.outcome === "success"
    );
  };
  const loadJamieStatus = () => {
    setJamie({ kind: "loading" });
    void client
      .getJamieStatus()
      .then((status) => setJamie({ kind: "ready", ...status }))
      .catch(() => setJamie({ kind: "error" }));
  };
  const loadRoutingOptions = (meeting: ImportedMeeting) => {
    const read = async (
      queryName: "project.list" | "relationship.workspace",
    ) => {
      const response = await client.runQuery(
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName,
          queryId: crypto.randomUUID(),
          workspaceId: meeting.workspaceId,
          correlationId: crypto.randomUUID(),
          parameters: { spaceId: meeting.spaceId },
        }),
      );
      return response.kind === "contract_rejected" ||
        response.result.outcome !== "success"
        ? undefined
        : response.result.projection;
    };
    void Promise.all([read("project.list"), read("relationship.workspace")])
      .then(([projects, relationships]) => {
        setRoutingOptions({
          projects:
            projects?.kind === "project.list"
              ? projects.items
                  .filter((project) => project.lifecycle === "active")
                  .map((project) => ({ id: project.id, title: project.title }))
              : [],
          organizations:
            relationships?.kind === "relationship.workspace"
              ? relationships.records.flatMap((record) =>
                  record.kind === "organization"
                    ? [{ id: record.id, name: record.name }]
                    : [],
                )
              : [],
        });
      })
      // Routing is an enhancement over a readable meeting: if destinations
      // cannot be read the rest of the inspector still works, and the section
      // reports that it has nothing to offer rather than failing the view.
      .catch(() => setRoutingOptions({ projects: [], organizations: [] }));
  };
  const selectResult = (index: number) => {
    if (state.kind !== "ready") return;
    const meeting = state.data.completed[index];
    if (meeting === undefined) return;
    loadRoutingOptions(meeting);
    setSelectedMeetingId(meeting.id);
    setVisibleTranscriptMeetingId(undefined);
    setNewItemMeetingId(undefined);
    onInspectorOpen();
  };
  const resultNav = useListNavigation({
    itemCount: state.kind === "ready" ? state.data.completed.length : 0,
    onOpen: selectResult,
    onSelect: selectResult,
  });
  // Refetch is decoupled from the visible state: after a mutation the last
  // ready snapshot stays on screen and the skeleton appears only on the very
  // first load. A failed refresh keeps the safe data and reports via notice.
  // Requests carry a generation so a slower, older refetch can never
  // overwrite the snapshot of a newer one.
  const hasLoadedRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const load = () => {
    const generation = ++loadGenerationRef.current;
    setState((current) =>
      current.kind === "ready" ? current : { kind: "loading" },
    );
    const from = new Date();
    const to = new Date(from.getTime() + 14 * 86_400_000);
    void client
      .getMeetingLoop({ from: from.toISOString(), to: to.toISOString() })
      .then((data) => {
        if (generation !== loadGenerationRef.current) return;
        hasLoadedRef.current = true;
        setNotice((current) =>
          current === staleRefreshNotice ? undefined : current,
        );
        setState({ kind: "ready", data });
      })
      .catch(() => {
        if (generation !== loadGenerationRef.current) return;
        if (hasLoadedRef.current) setNotice(staleRefreshNotice);
        else
          setState({
            kind: "error",
            message:
              "Pętla spotkań jest niedostępna. Dane i kalendarz nie zostały zmienione.",
          });
      });
  };
  useEffect(load, [client]);
  useEffect(loadJamieStatus, [client]);
  // Collection rows expose a bounded preview to both layout and assistive
  // technology. The complete source remains available only in the selected
  // inspector reading view.
  const resultPreviews = useMemo(() => {
    if (state.kind !== "ready") return new Map<string, string>();
    return new Map(
      state.data.completed.map((meeting) => [
        meeting.id,
        meeting.summaryMarkdown
          ? toMeetingResultPreview(meeting.summaryMarkdown)
          : "Brak podsumowania w wyniku Jamie.",
      ]),
    );
  }, [state]);

  if (state.kind === "loading") {
    return (
      <section className="meeting-surface meeting-skeleton" aria-busy="true">
        <h1 id="surface-title" className="sr-only" tabIndex={-1}>
          Otwieram spotkania…
        </h1>
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
        <h1 id="surface-title" tabIndex={-1}>
          Spotkania są chwilowo niedostępne
        </h1>
        <p>{state.message}</p>
        <button className="primary-button" onClick={load}>
          Spróbuj ponownie
        </button>
      </section>
    );
  }

  const surface = state.data;
  const selectedMeeting = surface.completed.find(
    (meeting) => meeting.id === selectedMeetingId,
  );
  const calendarCapability = (
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
  );
  const jamieConnection = (
    <div className="meeting-integration-wrap">
      {/* Po skonfigurowaniu integracja zwija się do jednowierszowego paska
          statusu; pełny opis i formularz wracają dopiero po odłączeniu. */}
      <section
        className={`meeting-integration${jamie.kind === "ready" && jamie.configured ? " meeting-integration--connected" : ""}`}
        aria-labelledby="jamie-title"
      >
        {jamie.kind === "ready" && jamie.configured ? (
          <p className="meeting-integration-summary">
            <span className="eyebrow" id="jamie-title">
              Jamie
            </span>
            <span className="meeting-integration-status">
              Połączono klucz{" "}
              {jamie.scope === "workspace" ? "zespołu" : "osobisty"}
            </span>
          </p>
        ) : (
          <div>
            <p className="eyebrow">Źródło wyników</p>
            <h2 id="jamie-title">Jamie</h2>
            <p>
              Jamie zachowuje odpowiedzialność za nagranie, transkrypcję i
              inteligencję spotkania. Constellation importuje wynik oraz trwałe
              identyfikatory zadań.
            </p>
          </div>
        )}
        {jamie.kind === "loading" ? (
          <span className="meeting-integration-status">Sprawdzam…</span>
        ) : jamie.kind === "error" ? (
          <button className="secondary-button" onClick={loadJamieStatus}>
            Ponów sprawdzenie
          </button>
        ) : jamie.configured ? (
          <div className="meeting-integration-actions">
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
                      `Jamie: ${countLabel(
                        result.applied + result.corrected,
                        "nowy lub poprawiony",
                        "nowe lub poprawione",
                        "nowych lub poprawionych",
                      )}, ${result.noChange} bez zmian, ${countLabel(
                        result.partial,
                        "częściowy",
                        "częściowe",
                        "częściowych",
                      )}${
                        result.failed
                          ? `, ${countLabel(result.failed, "błąd", "błędy", "błędów")}`
                          : ""
                      }.`,
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
  );
  return (
    <section className="meeting-surface" aria-labelledby="surface-title">
      <header className="meeting-hero">
        <div>
          <p className="eyebrow">Od przygotowania do dalszej pracy</p>
          <h1 id="surface-title" tabIndex={-1}>
            Spotkania
          </h1>
          <p>
            Fakty przed spotkaniem, wynik Jamie po nim i każde dalsze działanie
            z własnym cyklem życia.
          </p>
        </div>
      </header>

      {notice && (
        <p className="meeting-notice" role="status">
          {notice}
        </p>
      )}

      <div className="meeting-lanes">
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
          {jamieConnection}
          {surface.completed.length === 0 ? (
            <div className="meeting-empty meeting-empty--compact">
              <h3>Nie zaimportowano jeszcze wyniku</h3>
              <p>
                Jamie nadal odpowiada za nagranie, transkrypcję i inteligencję
                spotkania. Import zachowa źródło i bezpiecznie zbiegnie
                duplikaty.
              </p>
            </div>
          ) : (
            <div className="meeting-results-browser">
              <ol
                className="meeting-result-list"
                role="listbox"
                aria-label="Zaimportowane wyniki Jamie"
              >
                {surface.completed.map((meeting, index) => {
                  const selected = meeting.id === selectedMeeting?.id;
                  const preview =
                    resultPreviews.get(meeting.id) ??
                    "Brak podsumowania w wyniku Jamie.";
                  const previewId = `meeting-result-preview-${index}`;
                  const title = meeting.title ?? "Spotkanie bez tytułu";
                  const workCount = countLabel(
                    meeting.workItems.length,
                    "działanie",
                    "działania",
                    "działań",
                  );
                  return (
                    <li key={meeting.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        className={`meeting-result-row${selected ? " is-selected" : ""}`}
                        aria-label={`${title}. ${healthLabel(meeting)}. ${formatTime(meeting.startedAt)}. ${workCount}.`}
                        aria-describedby={previewId}
                        aria-selected={selected}
                        {...(selected && inspectorHost
                          ? { "aria-controls": "meeting-result-detail" }
                          : {})}
                        {...resultNav(index)}
                        onClick={() => selectResult(index)}
                      >
                        <span className="meeting-result-row-heading">
                          <strong>{title}</strong>
                          <span
                            className={`meeting-health meeting-health--${meeting.triage}`}
                          >
                            {healthLabel(meeting)}
                          </span>
                        </span>
                        <time dateTime={meeting.startedAt}>
                          {formatTime(meeting.startedAt)}
                        </time>
                        <span
                          className="meeting-result-row-summary"
                          id={previewId}
                        >
                          {preview}
                        </span>
                        <span className="meeting-result-row-meta">
                          {workCount}
                          <span aria-hidden="true">→</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {selectedMeeting &&
                inspectorHost &&
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
                          {countLabel(
                            selectedMeeting.participants.length,
                            "uczestnik",
                            "uczestników",
                            "uczestników",
                          )}
                        </p>
                      </div>
                      <strong
                        className={`meeting-health meeting-health--${selectedMeeting.triage}`}
                      >
                        {healthLabel(selectedMeeting)}
                      </strong>
                    </header>

                    <section
                      className="meeting-result-routing"
                      aria-labelledby="meeting-result-routing-title"
                    >
                      <header>
                        <div>
                          <h4 id="meeting-result-routing-title">
                            Projekt i klient
                          </h4>
                          <p>
                            {selectedMeeting.projectId ||
                            selectedMeeting.organizationId
                              ? "Spotkanie należy do wybranego projektu i klienta."
                              : "To spotkanie nie ma jeszcze projektu ani klienta."}
                          </p>
                        </div>
                      </header>
                      <div className="meeting-routing-fields">
                        <label htmlFor="meeting-routing-project">
                          Projekt
                          <select
                            id="meeting-routing-project"
                            value={selectedMeeting.projectId ?? ""}
                            disabled={busyItemId === selectedMeeting.id}
                            onChange={(event) => {
                              const value = event.target.value;
                              setBusyItemId(selectedMeeting.id);
                              void runMeetingCommand(
                                selectedMeeting,
                                "meeting.route",
                                { projectId: value === "" ? null : value },
                                `project:${value}:${selectedMeeting.version}`,
                              ).then((changed) => {
                                setBusyItemId(undefined);
                                if (changed) load();
                                else
                                  setNotice(
                                    "Nie udało się zmienić projektu. Wynik mógł zmienić się w międzyczasie — odśwież i spróbuj ponownie.",
                                  );
                              });
                            }}
                          >
                            <option value="">Bez projektu</option>
                            {routingOptions.projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label htmlFor="meeting-routing-organization">
                          Klient
                          <select
                            id="meeting-routing-organization"
                            value={selectedMeeting.organizationId ?? ""}
                            disabled={busyItemId === selectedMeeting.id}
                            onChange={(event) => {
                              const value = event.target.value;
                              setBusyItemId(selectedMeeting.id);
                              void runMeetingCommand(
                                selectedMeeting,
                                "meeting.route",
                                { organizationId: value === "" ? null : value },
                                `organization:${value}:${selectedMeeting.version}`,
                              ).then((changed) => {
                                setBusyItemId(undefined);
                                if (changed) load();
                                else
                                  setNotice(
                                    "Nie udało się zmienić klienta. Wynik mógł zmienić się w międzyczasie — odśwież i spróbuj ponownie.",
                                  );
                              });
                            }}
                          >
                            <option value="">Bez klienta</option>
                            {routingOptions.organizations.map(
                              (organization) => (
                                <option
                                  key={organization.id}
                                  value={organization.id}
                                >
                                  {organization.name}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                    </section>

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
                            aria-controls={
                              visibleTranscriptMeetingId === selectedMeeting.id
                                ? "meeting-result-transcript-content"
                                : undefined
                            }
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
                      className="meeting-result-participants"
                      aria-labelledby="meeting-result-participants-title"
                    >
                      <header>
                        <div>
                          <h4 id="meeting-result-participants-title">
                            Uczestnicy
                          </h4>
                          <p>
                            Uczestnicy z adresem e-mail stają się Osobami.
                            Pozostali czekają na Twoją decyzję — nikt nie jest
                            łączony na podstawie samego imienia.
                          </p>
                        </div>
                        {selectedMeeting.participants.some(
                          (participant) =>
                            participant.personId === undefined &&
                            participant.email !== undefined,
                        ) && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busyItemId === selectedMeeting.id}
                            onClick={() => {
                              setBusyItemId(selectedMeeting.id);
                              // One identifier per unlinked participant that
                              // carries an email; the kernel consumes only what
                              // it needs and leaves name-only people alone.
                              const personIdPool = selectedMeeting.participants
                                .filter(
                                  (participant) =>
                                    participant.personId === undefined &&
                                    participant.email !== undefined,
                                )
                                .map(() => crypto.randomUUID());
                              void runMeetingCommand(
                                selectedMeeting,
                                "meeting.linkParticipants",
                                { personIdPool, resolutions: [] },
                                `link:${selectedMeeting.version}`,
                              ).then((changed) => {
                                setBusyItemId(undefined);
                                if (changed) load();
                                else
                                  setNotice(
                                    "Nie udało się połączyć uczestników. Odśwież i spróbuj ponownie.",
                                  );
                              });
                            }}
                          >
                            Połącz z Osobami
                          </button>
                        )}
                      </header>
                      {selectedMeeting.participants.length === 0 && (
                        <p className="meeting-result-empty-copy">
                          Jamie nie zwrócił uczestników dla tego spotkania.
                        </p>
                      )}
                      <ul className="meeting-participants">
                        {selectedMeeting.participants.map((participant) => (
                          <li key={participant.externalId}>
                            <strong>{participant.name}</strong>
                            <small>
                              {participant.personId
                                ? "Osoba w przestrzeni roboczej"
                                : participant.email
                                  ? "Nie połączony"
                                  : "Brak adresu e-mail — wymaga decyzji"}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </section>

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
                                {(item.kind === "task" ||
                                  item.kind === "follow_up") &&
                                  (item.taskId ? (
                                    <span className="meeting-item-promoted">
                                      Jest zadaniem
                                    </span>
                                  ) : (
                                    <button
                                      className="secondary-button"
                                      disabled={busyItemId === item.id}
                                      onClick={() => {
                                        setBusyItemId(item.id);
                                        void runMeetingCommand(
                                          selectedMeeting,
                                          "meeting.promoteWorkItem",
                                          {
                                            workItemId: item.id,
                                            taskId: crypto.randomUUID(),
                                          },
                                          // The meeting version keeps a
                                          // re-promotion after undo a
                                          // distinct command; a stable key
                                          // would collide with the original
                                          // attempt's fingerprint and make
                                          // the item permanently unpromotable.
                                          `promote:${item.id}:${selectedMeeting.version}`,
                                        ).then((changed) => {
                                          setBusyItemId(undefined);
                                          if (changed) load();
                                          else
                                            setNotice(
                                              "Nie udało się utworzyć zadania. Wynik mógł zmienić się w międzyczasie — odśwież i spróbuj ponownie.",
                                            );
                                        });
                                      }}
                                    >
                                      Utwórz zadanie
                                    </button>
                                  ))}
                                <button
                                  className="secondary-button"
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
                                      className="secondary-button"
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
                                    className="secondary-button"
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
                                    className="secondary-button"
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
          )}
        </section>
        <aside className="meeting-context-rail" aria-labelledby="sources-title">
          <header>
            <p className="eyebrow">Źródła i przygotowanie</p>
            <h2 id="sources-title">Kontekst spotkań</h2>
          </header>
          {calendarCapability}
          <section
            className="meeting-upcoming"
            aria-labelledby="upcoming-title"
          >
            <header>
              <h3 id="upcoming-title">Nadchodzące</h3>
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
                <h4>Brak widocznych wydarzeń</h4>
                <p>
                  {surface.capability.canRead
                    ? "W tym oknie czasu kalendarz nie ma spotkań."
                    : "Odblokuj provider, aby zobaczyć przygotowanie."}
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
                    <h4>{event.title}</h4>
                    <p>
                      {countLabel(
                        event.attendees.length,
                        "uczestnik",
                        "uczestników",
                        "uczestników",
                      )}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    <div className="evidence-thread">
                      <span className="evidence-node">Wydarzenie</span>
                      <i aria-hidden="true" />
                      <span className="evidence-node">
                        Brief faktograficzny
                      </span>
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
        </aside>
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
