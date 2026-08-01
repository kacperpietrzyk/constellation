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
import { CalendarConsentDialog } from "./components/CalendarConsentDialog.js";
import { TopicHelp } from "./help/TopicHelp.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import { countLabel, formatDate, formatWeekdayTime } from "./i18n.js";
import {
  attachedNoteAuthorship,
  attachedNotesFor,
  type MeetingBacklink,
} from "./meetings/attached-notes.js";

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
  "Could not refresh meetings. Showing the last safe state.";

// A focus target that is not a document id and can never collide with one.
const REATTACH_FOCUS = "\u0000reattach";

const healthLabel = (meeting: CompletedMeeting) => {
  switch (meeting.triage) {
    case "ready":
      return "Ready";
    case "partial":
      return "Partial";
    case "conflicted":
      return "Conflicted";
    case "needs_review":
      return "Needs review";
  }
};

const workItemKindLabel = (item: MeetingWorkItem) => {
  switch (item.kind) {
    case "task":
      return "Task";
    case "decision":
      return "Decision";
    case "waiting":
      return "Waiting";
    case "note":
      return "Note";
    case "follow_up":
      return "Follow-up";
  }
};

const workItemStateLabel = (item: MeetingWorkItem) => {
  switch (item.state) {
    case "open":
      return "Open";
    case "completed":
      return "Completed";
    case "dismissed":
      return "Dismissed";
    case "withdrawn":
      return "Withdrawn in Jamie";
    case "conflicted":
      return "Conflicted";
  }
};

const workItemMetadata = (item: MeetingWorkItem) =>
  item.responsibilityOverride !== undefined
    ? `${workItemStateLabel(item)} · Assignee: ${item.responsibilityOverride.name} · local correction`
    : item.assignee === undefined
      ? workItemStateLabel(item)
      : `${workItemStateLabel(item)} · Jamie: ${item.assignee.name}`;

const capabilityCopy = (surface: MeetingLoopSurface) => {
  switch (surface.capability.availability) {
    case "available":
      return "Calendar is available. Events stay the source of truth in that calendar.";
    case "permission_required":
      return "macOS needs full Calendar access before Constellation can read upcoming events.";
    case "permission_denied":
      return "Calendar access is off. Change the permission in System Settings.";
    case "provider_unavailable":
      return surface.capability.platform === "windows"
        ? "The Windows calendar provider is not set up yet. Jamie results still work."
        : "This device has no supported calendar provider.";
    case "offline":
      return "Calendar is offline. Showing the last safe data instead of pretending it is current.";
    case "error":
      return "Could not read the calendar. Try again; no event was changed.";
  }
};

// What came back from asking macOS for Calendar access. The four outcomes are
// genuinely different — granted, refused by the person, never asked at all, and
// unavailable — and only the first one changes what the surface can do.
//
// Ścieżka do przełącznika, którego nie da się nacisnąć z aplikacji. Jedna stała
// dla obu zablokowanych wyników, bo to jest TO SAMO rozwiązanie tego samego
// problemu — i dlatego da się o nią asertować bez czytania zdania.
const CALENDAR_PERMISSION_REMEDY =
  "System Settings → Privacy & Security → Calendars";

export type CalendarAccessOutcome = {
  // Rozstrzygnięcie, po którym wołający i test rozpoznają wynik. Wcześniej
  // funkcja oddawała samo zdanie, więc jedyne, co dało się sprawdzić, to jego
  // treść — a po przepisaniu asercji na „coś wspólnego na końcu" z produktu
  // dało się USUNĄĆ ścieżkę do ustawień przy zielonym teście.
  readonly tag: "granted" | "denied" | "suppressed" | "unavailable";
  readonly message: string;
  // Obecne dokładnie wtedy, gdy człowiek musi wyjść z aplikacji, żeby to
  // odblokować. `undefined` znaczy „nie ma czego naprawiać tutaj".
  readonly remedy?: string;
};

export const calendarAccessOutcome = (
  capability: MeetingLoopSurface["capability"],
): CalendarAccessOutcome => {
  if (capability.availability === "available")
    return {
      tag: "granted",
      message: "Calendar access granted. Upcoming events are visible now.",
    };
  if (capability.availability === "permission_denied")
    return {
      tag: "denied",
      message: `Calendar access was refused. Turn it on in ${CALENDAR_PERMISSION_REMEDY}.`,
      remedy: CALENDAR_PERMISSION_REMEDY,
    };
  // macOS declined to raise the prompt at all. The person did nothing wrong
  // and clicking again cannot help, so say where the switch actually lives.
  if (capability.detailCode === "permission_prompt_suppressed")
    return {
      tag: "suppressed",
      message: `macOS did not show the Calendar access prompt. Grant the permission in ${CALENDAR_PERMISSION_REMEDY}.`,
      remedy: CALENDAR_PERMISSION_REMEDY,
    };
  return {
    tag: "unavailable",
    message: "Calendar access is still not in place. No event was changed.",
  };
};

export const MeetingsSurface = ({
  client,
  activeMeetingId,
  inspectorHost,
  onInspectorOpen,
  onMeetingSelected,
}: {
  readonly client: ConstellationRendererClient;
  readonly activeMeetingId?: string | undefined;
  readonly inspectorHost: HTMLElement | null;
  readonly onInspectorOpen: () => void;
  readonly onMeetingSelected: (meetingId: string) => void;
}) => {
  const [state, setState] = useState<MeetingState>({ kind: "loading" });
  const [preview, setPreview] = useState<CalendarWritePreview>();
  const [notice, setNotice] = useState<string>();
  const [calendarAccessBusy, setCalendarAccessBusy] = useState(false);
  // One in-flight mutation at a time across the whole inspector. A per-target
  // flag would re-enable a still-pending control as soon as a different one
  // started, allowing a second submission against an already-stale version.
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
  // What points at the selected meeting, read once per selection. Keyed by
  // meeting id so a slower read for a meeting the reader has already left
  // cannot paint its notes under a different heading.
  const [backlinks, setBacklinks] = useState<{
    readonly meetingId: string;
    readonly items: readonly MeetingBacklink[];
  }>();
  // The note the reader has just taken off, kept only while they stay on this
  // meeting. It is NOT the list showing a detached note again — the list no
  // longer holds it — it is the reversal of the action they just took, put
  // where their hands already are and where the focus goes.
  const [justDetached, setJustDetached] = useState<MeetingBacklink>();
  // Where the focus must land once the list has been re-rendered without the
  // row the control lived on. Holding the intent rather than calling `focus()`
  // straight away is what makes it survive the refetch: the element the reader
  // pressed is gone by the time React commits the new list.
  const detachRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const reattachRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusRef = useRef<string | undefined>(undefined);
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
          // A LIVE DEFECT ON `main`, found by writing the read beside it: this
          // envelope carried `correlationId` — which a QUERY envelope does not
          // have — and omitted the required `consistency`, so
          // `QueryEnvelopeSchema.parse` threw inside the async `read`, the
          // rejection landed in the `catch` below, and the Project and Client
          // selects have been permanently empty. `meeting.route` was
          // unreachable from the interface, with nothing red anywhere.
          consistency: "local_projection",
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
  /* DECISION #32's read, and it needed no backend: `document.backlinks`
   * already answers "which notes point at this meeting" and this screen has
   * never asked it. Read per selected meeting rather than for the whole list —
   * a backlink read is one query per meeting and the collection shows many.
   */
  const loadAttachedNotes = (meeting: ImportedMeeting) => {
    void client
      .runQuery(
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName: "document.backlinks",
          queryId: crypto.randomUUID(),
          workspaceId: meeting.workspaceId,
          consistency: "local_projection",
          parameters: { targetKind: "meeting", targetId: meeting.id },
        }),
      )
      .then((response) => {
        const projection =
          response.kind === "contract_rejected" ||
          response.result.outcome !== "success"
            ? undefined
            : response.result.projection;
        setBacklinks({
          meetingId: meeting.id,
          items:
            projection?.kind === "document.backlinks" ? projection.items : [],
        });
      })
      // A meeting whose notes cannot be read is still a readable meeting. The
      // section says it has nothing rather than the screen failing.
      .catch(() => setBacklinks({ meetingId: meeting.id, items: [] }));
  };
  const setNoteAttachment = async (
    meeting: ImportedMeeting,
    note: MeetingBacklink,
    detached: boolean,
  ): Promise<boolean> => {
    const response = await client.executeCommand(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "meeting.detachNote",
        commandId: crypto.randomUUID(),
        workspaceId: meeting.workspaceId,
        // The meeting version rides in the key, exactly as the work-item
        // corrections do it: a detach repeated after an undo must not collide
        // with the first attempt's fingerprint and become unrepeatable.
        idempotencyKey: `meeting.detachNote:${meeting.id}:${note.documentId}:${detached}:v${meeting.version}`,
        expectedVersions: { [meeting.id]: meeting.version },
        correlationId: crypto.randomUUID(),
        payload: {
          meetingId: meeting.id,
          documentId: note.documentId,
          detached,
        },
      }),
    );
    return (
      response.kind !== "contract_rejected" &&
      response.outcome.outcome === "success"
    );
  };
  const selectResult = (index: number) => {
    if (state.kind !== "ready") return;
    const meeting = state.data.completed[index];
    if (meeting === undefined) return;
    loadRoutingOptions(meeting);
    loadAttachedNotes(meeting);
    setJustDetached(undefined);
    setSelectedMeetingId(meeting.id);
    onMeetingSelected(meeting.id);
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
              "The meeting loop is unavailable. No data and no calendar event changed.",
          });
      });
  };
  useEffect(load, [client]);
  useEffect(loadJamieStatus, [client]);
  // The row a control lived on is gone by the time this runs, so the intent is
  // recorded at the press and consumed here, once the new list is committed.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === undefined) return;
    const target =
      pending === REATTACH_FOCUS
        ? reattachRef.current
        : (detachRefs.current.get(pending) ?? null);
    if (target === null) return;
    pendingFocusRef.current = undefined;
    target.focus();
  }, [backlinks, justDetached]);
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
          : "No summary in the Jamie result.",
      ]),
    );
  }, [state]);
  useEffect(() => {
    if (
      activeMeetingId === undefined ||
      selectedMeetingId === activeMeetingId ||
      state.kind !== "ready"
    )
      return;
    const meeting = state.data.completed.find(
      (candidate) => candidate.id === activeMeetingId,
    );
    if (meeting === undefined) return;
    loadRoutingOptions(meeting);
    loadAttachedNotes(meeting);
    setJustDetached(undefined);
    setSelectedMeetingId(meeting.id);
    onMeetingSelected(meeting.id);
    onInspectorOpen();
  }, [activeMeetingId, selectedMeetingId, state]);

  if (state.kind === "loading") {
    return (
      <section className="meeting-surface meeting-skeleton" aria-busy="true">
        <h1 id="surface-title" className="sr-only" tabIndex={-1}>
          Opening meetings…
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
          Meetings are unavailable right now
        </h1>
        <p>{state.message}</p>
        {/* Ten sam zaczep, co na granicy leniwej powierzchni w `RealApp`:
            gwarancją jest „ekran, którego nie da się otworzyć, proponuje
            ponowienie" — nie to, jakimi słowami i którą klasą to robi. */}
        <button
          className="primary-button"
          data-surface-action="retry"
          onClick={load}
        >
          Try again
        </button>
      </section>
    );
  }

  const surface = state.data;
  const selectedMeeting = surface.completed.find(
    (meeting) => meeting.id === selectedMeetingId,
  );
  // The read is the author's fact; the subtraction is the reader's. Both are
  // spelled in `attachedNotesFor`, which is what the assertion measures.
  const attachedNotes =
    selectedMeeting === undefined ||
    backlinks === undefined ||
    backlinks.meetingId !== selectedMeeting.id
      ? []
      : attachedNotesFor(selectedMeeting, backlinks.items);
  const calendarCapability = (
    <div
      className={`calendar-capability calendar-capability--${surface.capability.availability}`}
    >
      <strong>
        {surface.capability.provider === "eventkit"
          ? "Apple Calendar"
          : "Calendar"}
      </strong>
      <span>{capabilityCopy(surface)}</span>
      {surface.capability.availability !== "available" && (
        <button
          className="quiet-button"
          disabled={calendarAccessBusy}
          onClick={() => {
            if (
              surface.capability.platform !== "macos" ||
              surface.capability.availability !== "permission_required"
            ) {
              load();
              return;
            }
            // The request can sit for half a minute on the system prompt, and
            // it can come back refused. Both used to be discarded, so a
            // refusal and a dead button looked identical from here.
            setCalendarAccessBusy(true);
            setNotice(undefined);
            void client
              .requestCalendarAccess()
              .then((capability) => {
                setNotice(calendarAccessOutcome(capability).message);
                load();
              })
              .catch(() =>
                setNotice(
                  "Could not ask for Calendar access. Nothing was changed.",
                ),
              )
              .finally(() => setCalendarAccessBusy(false));
          }}
        >
          {surface.capability.platform === "macos" &&
          surface.capability.availability === "permission_required"
            ? calendarAccessBusy
              ? "Asking macOS…"
              : "Grant access"
            : "Check again"}
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
              Connected{" "}
              {jamie.scope === "workspace" ? "workspace key" : "personal key"}
            </span>
          </p>
        ) : (
          <div>
            <p className="eyebrow">Result source</p>
            <h2 id="jamie-title">Jamie</h2>
            <p>
              Jamie records and transcribes. Constellation imports the result
              and its durable task ids.
            </p>
          </div>
        )}
        {jamie.kind === "loading" ? (
          <span className="meeting-integration-status">Checking…</span>
        ) : jamie.kind === "error" ? (
          <button className="secondary-button" onClick={loadJamieStatus}>
            Check again
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
                      `Jamie: ${result.applied + result.corrected} new or corrected, ${result.noChange} unchanged, ${result.partial} partial${
                        result.failed
                          ? `, ${countLabel(result.failed, "error")}`
                          : ""
                      }.`,
                    );
                    load();
                  })
                  .catch(() => {
                    setJamieBusy(false);
                    setNotice(
                      "Could not sync Jamie. The results you already have are unchanged.",
                    );
                  });
              }}
            >
              {jamieBusy ? "Syncing…" : "Sync the last 90 days"}
            </button>
            <button
              className="quiet-button"
              disabled={jamieBusy}
              onClick={() => {
                setJamieBusy(true);
                void client.disconnectJamie().then(() => {
                  setJamieBusy(false);
                  setNotice(
                    "Jamie key disconnected. Imported results were kept.",
                  );
                  loadJamieStatus();
                });
              }}
            >
              Disconnect
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
                    "Jamie key saved in the operating system credential store.",
                  );
                  loadJamieStatus();
                })
                .catch(() => {
                  setJamieBusy(false);
                  setNotice(
                    "Could not save the Jamie key. Check its format and the system credential store.",
                  );
                });
            }}
          >
            <label>
              Key scope
              <select
                value={jamieScope}
                onChange={(event) =>
                  setJamieScope(event.target.value as typeof jamieScope)
                }
              >
                <option value="personal">Personal</option>
                <option value="workspace">Workspace</option>
              </select>
            </label>
            <label>
              API key
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
              {jamieBusy ? "Securing…" : "Connect Jamie"}
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
          <p className="eyebrow">From preparation to follow-up</p>
          <h1 id="surface-title" tabIndex={-1}>
            Meetings
          </h1>
          <p>
            Facts before a meeting, the Jamie result after, and every action
            item that follows.
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
            <h2 id="completed-title">Jamie results</h2>
            <span>{countLabel(surface.completed.length, "result")}</span>
          </header>
          {jamieConnection}
          {surface.completed.length === 0 ? (
            <div className="meeting-empty meeting-empty--compact">
              <h3>No result imported yet</h3>
              <p>
                Jamie still owns recording and transcription. Import keeps the
                source and merges duplicates safely.
              </p>
            </div>
          ) : (
            <div className="meeting-results-browser">
              <ol
                className="meeting-result-list"
                role="listbox"
                aria-label="Imported Jamie results"
              >
                {surface.completed.map((meeting, index) => {
                  const selected = meeting.id === selectedMeeting?.id;
                  const preview =
                    resultPreviews.get(meeting.id) ??
                    "No summary in the Jamie result.";
                  const previewId = `meeting-result-preview-${index}`;
                  const title = meeting.title ?? "Untitled meeting";
                  const workCount = countLabel(
                    meeting.workItems.length,
                    "action item",
                  );
                  return (
                    <li key={meeting.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        className={`meeting-result-row${selected ? " is-selected" : ""}`}
                        aria-label={`${title}. ${healthLabel(meeting)}. ${formatWeekdayTime(meeting.startedAt)}. ${workCount}.`}
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
                          {formatWeekdayTime(meeting.startedAt)}
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
                        <p className="eyebrow">Jamie result</p>
                        <h3 id="meeting-result-detail-title">
                          {selectedMeeting.title ?? "Untitled meeting"}
                        </h3>
                        <p>
                          <time dateTime={selectedMeeting.startedAt}>
                            {formatWeekdayTime(selectedMeeting.startedAt)}
                          </time>
                          <span aria-hidden="true"> · </span>
                          {countLabel(
                            selectedMeeting.participants.length,
                            "participant",
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
                            Project and client
                          </h4>
                          <p>
                            {selectedMeeting.projectId ||
                            selectedMeeting.organizationId
                              ? "This meeting belongs to the chosen project and client."
                              : "This meeting has no project or client yet."}
                          </p>
                        </div>
                      </header>
                      <div className="meeting-routing-fields">
                        <label htmlFor="meeting-routing-project">
                          Project
                          <select
                            id="meeting-routing-project"
                            value={selectedMeeting.projectId ?? ""}
                            disabled={busyItemId !== undefined}
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
                                    "Could not change the project. The result may have changed since — refresh and try again.",
                                  );
                              });
                            }}
                          >
                            <option value="">No project</option>
                            {routingOptions.projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label htmlFor="meeting-routing-organization">
                          Client
                          <select
                            id="meeting-routing-organization"
                            value={selectedMeeting.organizationId ?? ""}
                            disabled={busyItemId !== undefined}
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
                                    "Could not change the client. The result may have changed since — refresh and try again.",
                                  );
                              });
                            }}
                          >
                            <option value="">No client</option>
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
                      <h4 id="meeting-result-summary-title">Summary</h4>
                      {selectedMeeting.summaryMarkdown ? (
                        <MeetingMarkdown
                          value={selectedMeeting.summaryMarkdown}
                        />
                      ) : (
                        <p className="meeting-result-empty-copy">
                          Jamie returned no summary for this meeting.
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
                              Transcript
                            </h4>
                            <p>The original content imported from Jamie.</p>
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
                              ? "Hide transcript"
                              : "Show transcript"}
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
                            Participants
                          </h4>
                          <p>
                            Participants with an email become People. The rest
                            wait for your decision.
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
                            disabled={busyItemId !== undefined}
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
                                    "Could not link participants. Refresh and try again.",
                                  );
                              });
                            }}
                          >
                            Link to People
                          </button>
                        )}
                      </header>
                      {selectedMeeting.participants.length === 0 && (
                        <p className="meeting-result-empty-copy">
                          Jamie returned no participants for this meeting.
                        </p>
                      )}
                      <ul className="meeting-participants">
                        {selectedMeeting.participants.map((participant) => (
                          <li key={participant.externalId}>
                            <strong>{participant.name}</strong>
                            <small>
                              {participant.personId
                                ? "Person in the workspace"
                                : participant.email
                                  ? "Not linked"
                                  : "No email — needs a decision"}
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
                          <h4 id="meeting-result-work-title">Action items</h4>
                          <p>
                            Each item has its own state and stays linked to the
                            meeting.
                          </p>
                        </div>
                        <span>
                          {countLabel(
                            selectedMeeting.workItems.length,
                            "action item",
                          )}
                        </span>
                      </header>
                      {selectedMeeting.workItems.length === 0 ? (
                        <p className="meeting-result-empty-copy">
                          This result has no action items yet.
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
                                      Is a task
                                    </span>
                                  ) : (
                                    <button
                                      className="secondary-button"
                                      disabled={busyItemId !== undefined}
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
                                              "Could not create the task. The result may have changed since — refresh and try again.",
                                            );
                                        });
                                      }}
                                    >
                                      Create task
                                    </button>
                                  ))}
                                <button
                                  className="secondary-button"
                                  disabled={busyItemId !== undefined}
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
                                            "This result changed since. Refreshed without overwriting the newer version.",
                                          );
                                      });
                                  }}
                                >
                                  {item.state === "open"
                                    ? "Complete"
                                    : item.state === "conflicted"
                                      ? "Keep local"
                                      : "Reopen"}
                                </button>
                                {item.state === "conflicted" &&
                                  item.sourceValueInConflict && (
                                    <button
                                      className="secondary-button"
                                      disabled={busyItemId !== undefined}
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
                                                "Could not resolve the conflict; a newer version exists.",
                                              );
                                          });
                                      }}
                                    >
                                      Accept Jamie
                                    </button>
                                  )}
                                {item.state === "open" && (
                                  <button
                                    className="secondary-button"
                                    disabled={busyItemId !== undefined}
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
                                              "Could not dismiss the item; a newer version exists.",
                                            );
                                        });
                                    }}
                                  >
                                    Dismiss
                                  </button>
                                )}
                                {(item.kind === "task" ||
                                  item.kind === "waiting" ||
                                  item.kind === "follow_up") && (
                                  <button
                                    className="secondary-button"
                                    disabled={busyItemId !== undefined}
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
                                      ? "Set person"
                                      : "Change person"}
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
                                            "Could not save the assignee; the result changed since.",
                                          );
                                      });
                                  }}
                                >
                                  <label>
                                    Assignee for this item
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
                                        Jamie says: {item.assignee.name}
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
                                    Save correction
                                  </button>
                                  {item.responsibilityOverride !==
                                    undefined && (
                                    <button
                                      className="quiet-button"
                                      disabled={busyItemId !== undefined}
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
                                                "Could not restore the Jamie assignee; the result changed since.",
                                              );
                                          });
                                      }}
                                    >
                                      Restore Jamie
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
                                    Cancel
                                  </button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    {/* DECISION #32. No acceptance gate anywhere in here: the
                        notes are listed because they already point at this
                        meeting, and the only operation offered is removal. */}
                    <section
                      className="meeting-result-notes"
                      aria-labelledby="meeting-result-notes-title"
                    >
                      <header>
                        <div>
                          <h4 id="meeting-result-notes-title">
                            Notes on this meeting
                          </h4>
                          <p>Already attached. Nothing waits to be accepted.</p>
                        </div>
                        <TopicHelp topic="attached-notes" />
                      </header>
                      {attachedNotes.length === 0 ? (
                        <p className="meeting-result-empty-copy">
                          No note points at this meeting yet. A note reaches it
                          by naming it while it is being written.
                        </p>
                      ) : (
                        <ul className="meeting-attached-notes">
                          {attachedNotes.map((note) => (
                            <li
                              className="meeting-attached-note"
                              key={note.documentId}
                            >
                              <div className="meeting-work-item-copy">
                                <span>
                                  {note.author.authoredByAgent
                                    ? "Agent"
                                    : "Note"}
                                </span>
                                <strong>{note.title}</strong>
                                <small>
                                  {attachedNoteAuthorship(
                                    note,
                                    formatDate(note.updatedAt),
                                  )}
                                </small>
                              </div>
                              <div className="meeting-item-actions">
                                <button
                                  className="secondary-button"
                                  data-meeting-detach={note.documentId}
                                  disabled={busyItemId !== undefined}
                                  ref={(element) => {
                                    detachRefs.current.set(
                                      note.documentId,
                                      element,
                                    );
                                  }}
                                  onClick={() => {
                                    setBusyItemId(note.documentId);
                                    void setNoteAttachment(
                                      selectedMeeting,
                                      note,
                                      true,
                                    ).then((changed) => {
                                      setBusyItemId(undefined);
                                      if (!changed) {
                                        setNotice(
                                          "Could not detach the note. The result may have changed since — refresh and try again.",
                                        );
                                        return;
                                      }
                                      setJustDetached(note);
                                      // Decided at the press, consumed after
                                      // the commit: the row this button lives
                                      // on is gone by then, and the reversal
                                      // is where the hands already are.
                                      pendingFocusRef.current = REATTACH_FOCUS;
                                      load();
                                    });
                                  }}
                                >
                                  Detach
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      {justDetached !== undefined && (
                        <p
                          className="meeting-result-empty-copy"
                          data-meeting-detached={justDetached.documentId}
                        >
                          Detached “{justDetached.title}”. The note itself is
                          unchanged.{" "}
                          <button
                            className="quiet-button"
                            data-meeting-reattach={justDetached.documentId}
                            disabled={busyItemId !== undefined}
                            ref={reattachRef}
                            type="button"
                            onClick={() => {
                              setBusyItemId(justDetached.documentId);
                              void setNoteAttachment(
                                selectedMeeting,
                                justDetached,
                                false,
                              ).then((changed) => {
                                setBusyItemId(undefined);
                                if (!changed) {
                                  setNotice(
                                    "Could not put the note back. The result may have changed since — refresh and try again.",
                                  );
                                  return;
                                }
                                pendingFocusRef.current =
                                  justDetached.documentId;
                                setJustDetached(undefined);
                                load();
                              });
                            }}
                          >
                            Put it back
                          </button>
                        </p>
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
                                  "Could not add the item; the meeting changed since.",
                                );
                            });
                        }}
                      >
                        <label>
                          Kind
                          <select
                            value={newItemKind}
                            onChange={(event) =>
                              setNewItemKind(
                                event.target.value as typeof newItemKind,
                              )
                            }
                          >
                            <option value="task">Task</option>
                            <option value="waiting">Waiting</option>
                            <option value="decision">Decision</option>
                            <option value="note">Note</option>
                            <option value="follow_up">Follow-up</option>
                          </select>
                        </label>
                        <label>
                          Content
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
                          Add item
                        </button>
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => setNewItemMeetingId(undefined)}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        className="secondary-button meeting-add-trigger"
                        onClick={() => setNewItemMeetingId(selectedMeeting.id)}
                      >
                        Add a standalone item
                      </button>
                    )}
                    {selectedMeeting.missingComponents.length > 0 && (
                      <p className="inline-warning">
                        Some Jamie task ids are missing. Syncing again fills
                        them in without duplicating the meeting.
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
            <p className="eyebrow">Sources and preparation</p>
            <h2 id="sources-title">Meeting context</h2>
          </header>
          {calendarCapability}
          <section
            className="meeting-upcoming"
            aria-labelledby="upcoming-title"
          >
            <header>
              <h3 id="upcoming-title">Upcoming</h3>
              <span>{countLabel(surface.upcoming.length, "event")}</span>
            </header>
            {surface.upcoming.length === 0 ? (
              <div className="meeting-empty">
                <svg aria-hidden="true" viewBox="0 0 48 48">
                  <path d="M9 12h30v27H9zM15 7v10M33 7v10M9 20h30" />
                </svg>
                <h4>No events visible</h4>
                <p>
                  {surface.capability.canRead
                    ? "The calendar has no meetings in this window."
                    : "Unblock the provider to see preparation."}
                </p>
              </div>
            ) : (
              surface.upcoming.map(({ event, brief }) => (
                <article
                  className="meeting-event"
                  key={`${event.calendarExternalId}:${event.eventExternalId}`}
                >
                  <div className="meeting-time">
                    {/* An instant, marked up as one. It was a bare `<strong>`,
                        which is the only timestamp on this screen that a
                        reader's software could not recognise as a time. */}
                    <strong>
                      <time dateTime={event.startsAt}>
                        {formatWeekdayTime(event.startsAt)}
                      </time>
                    </strong>
                    <span>
                      {event.isAllDay
                        ? "All day"
                        : `${Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000)} min`}
                    </span>
                  </div>
                  <div className="meeting-event-body">
                    <h4>{event.title}</h4>
                    <p>
                      {countLabel(event.attendees.length, "participant")}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    <div className="evidence-thread">
                      <span className="evidence-node">Event</span>
                      <i aria-hidden="true" />
                      <span className="evidence-node">Fact brief</span>
                      <i aria-hidden="true" />
                      <span className="evidence-node evidence-node--muted">
                        Jamie result after
                      </span>
                    </div>
                    <div className="meeting-brief">
                      <div>
                        <strong>Orientation</strong>
                        <span>
                          {brief.orientation.length
                            ? brief.orientation
                                .map((item) => item.label)
                                .join(" · ")
                            : "No exactly linked records."}
                        </span>
                      </div>
                      <div>
                        <strong>Open loops</strong>
                        <span>
                          {brief.openLoops.length
                            ? brief.openLoops
                                .map((item) => item.label)
                                .join(" · ")
                            : "No safely matched commitments."}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    className="secondary-button meeting-block-action"
                    disabled={
                      !surface.capability.canWriteOwnedBlocks || event.isAllDay
                    }
                    onClick={() => {
                      const startsAt = new Date(
                        Date.parse(event.startsAt) - 30 * 60_000,
                      ).toISOString();
                      const block: CalendarBlockDraft = {
                        calendarExternalId: event.calendarExternalId,
                        ownedBlockExternalId: `meeting-prep:${event.eventExternalId}`,
                        title: `Preparation: ${event.title}`,
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
                              "Could not build a safe preview. Nothing was written.",
                            );
                          else setPreview(result);
                        });
                    }}
                  >
                    Preview block
                  </button>
                  {/* #35 forbids a `title=` as the only carrier of an
                      explanation: it does not exist for a keyboard, for touch,
                      or for anybody not hovering, and the reason a control is
                      dead is exactly what those readers need. This sentence
                      used to be one. */}
                  {!surface.capability.canWriteOwnedBlocks && (
                    <small className="meeting-block-unavailable">
                      This calendar does not allow writing blocks.
                    </small>
                  )}
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
            setNotice("Preparation block saved after your exact confirmation.");
            load();
          }}
        />
      )}
    </section>
  );
};
