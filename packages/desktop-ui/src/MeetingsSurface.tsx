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
import { SurfaceTitleBand } from "./SurfaceTitleBand.js";
import { CalendarConsentDialog } from "./components/CalendarConsentDialog.js";
import {
  ConceptHelpDialog,
  type ConceptHelpTopicId,
} from "./components/ConceptHelpDialog.js";
import { Icon, type IconName } from "./components/Icon.js";
import { TopicHelp } from "./help/TopicHelp.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import { countLabel, formatDate, formatWeekdayTime } from "./i18n.js";
import { initialsOf } from "./initials.js";
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

/* ── WIERSZ NADCHODZĄCEGO SPOTKANIA, WPIS 10-3 ────────────────────────────
   Prototypowy wiersz mówi trzy rzeczy, których nasz nie mówił: KTO będzie
   (`.mt-room`, `v3/screens/meetings.js:239-242`), CO wnosisz do rozmowy jako
   nazwane pozycje z wyjściem (`.mt-prep`, `:180-218`) i CZYJ jest ten wpis
   (`.mt-locked` w trzeciej ścieżce, `:246-248`). Nasz mówił jedną liczbę
   uczestników, ścieżkę plakietek pochodzenia i dwie pary klucz/wartość,
   w których wszystkie rekordy jednej grupy były sklejone kropkami w JEDEN
   napis bez drogi do żadnego z nich. */

/* NAZWA DOSTAWCY POWSTAJE W JEDNYM MIEJSCU, ale ŹRÓDŁO podaje wołający — i to
   rozróżnienie jest treścią naprawy po przeglądzie adwersarialnym.
   Ta funkcja stała wcześniej w pliku TRZY RAZY jako dosłownie ten sam ternary
   (numerów linii nie ma, bo tamtych trzech kopii już nie ma), czyli lista obok
   `CalendarEventProjectionSchema.provider` / `CalendarCapabilitySchema`.
   Jedna funkcja usuwa przepisanie, ale NIE WOLNO jej przypiąć do jednego
   źródła: plakietka przy zdolności i przy nagłówku sekcji mówi o CAŁYM
   połączeniu (`surface.capability.provider`), a plakietka przy wierszu mówi
   o TYM wydarzeniu (`event.provider`). Wpis 10-3 wziął dla wiersza dane
   sekcji i w fiksturze bramki drukował pod wydarzeniem `provider: "fixture"`
   napis „Apple Calendar” — plakietka mówiła nieprawdę dokładnie w tym
   przelocie, którym para `D7-02g` dowodziła, że wiersz nazywa dostawcę. */
const providerLabel = (
  /* DWA ZAMKNIĘTE SŁOWNIKI, NIE JEDEN, i typ mówi to zamiast komentarza:
     zdolność zna `"eventkit" | "unconfigured"`, a wydarzenie
     `"eventkit" | "fixture"`. Wypisanie tych czterech wartości ręką byłoby
     trzecią listą obok obu słowników; wyprowadzenie z `MeetingLoopSurface`
     sprawia, że dopisanie dostawcy w kontrakcie zapala tu kompilator. */
  provider:
    | MeetingLoopSurface["capability"]["provider"]
    | MeetingLoopSurface["upcoming"][number]["event"]["provider"],
) => (provider === "eventkit" ? "Apple Calendar" : "Calendar");

type MeetingBriefEvidence =
  MeetingLoopSurface["upcoming"][number]["brief"]["orientation"][number];

/* NAZWA POZYCJI JEST RODZAJEM DOWODU, A NIE JEGO TREŚCIĄ, i to jest adaptacja
   z podanym powodem. Prototyp pisze w kluczu całe zdanie („Waiting 11 days on
   Piotr Zieliński”), bo jego dane są ręcznie ułożone pod ten wiersz; nasz
   `MeetingEvidence` niesie `kind`, `label` i `fact`
   (`packages/contracts/src/meeting-loop.ts:77-93`), a `fact` ma do 2000 znaków.
   Klucz stoi w ścieżce 13 rem z `white-space: nowrap`, więc zdanie w nim
   ucięłoby się w połowie na KAŻDYM realnym rekordzie. Rodzaj jest krótki
   i prawdziwy.
   ZDANIE ODPOWIADAJĄCE NA „A GDZIE ZMIEŚCI SIĘ TREŚĆ" STAŁO TU I BYŁO
   NIEPRAWDĄ. Mówiło, że zdanie idzie do wartości, „gdzie ma się gdzie
   zmieścić". Wartość NIE MA gdzie się zmieścić i jest to ZAMIERZONE po obu
   stronach: `.meeting-prep-v` jest jednym wierszem z wielokropkiem, dokładnie
   jak prototypowe `.mt-prep-v` (`v3/screens/meetings.css:120-124` —
   `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`). Bramka
   zmierzyła tę ścieżkę na 395,359 px przy `--text-2xs` = 11 px, czyli około
   siedemdziesięciu znaków. Realny `prior_meeting.fact` to
   `summaryMarkdown.slice(0, 2000)` — całe podsumowanie spotkania, z którego
   widać pierwszą linijkę. To jest ograniczenie WIERSZA LISTY, a nie wada tej
   funkcji: pełna treść należy do ekranu rekordu. Zapisane jako
   `ROUTED_NOT_COVERED` (lot D7, pozycja 2) z warunkiem wyjścia. */
export const evidenceKeyLabel = (kind: MeetingBriefEvidence["kind"]) => {
  switch (kind) {
    case "project":
      return "Project";
    case "task":
      return "Open task";
    case "waiting":
      return "Waiting on";
    case "decision":
      return "Open decision";
    case "note":
      return "Note";
    case "prior_meeting":
      return "Last time";
  }
};

const evidenceKeyIcon = (kind: MeetingBriefEvidence["kind"]): IconName => {
  switch (kind) {
    case "project":
      return "project";
    case "task":
      return "tasks";
    case "waiting":
      return "clock";
    case "decision":
      return "flag";
    case "note":
      return "documents";
    case "prior_meeting":
      return "meetings";
  }
};

/* DRZWI NIE MA ŻADNYCH, I TO JEST NAPRAWA PO PRZEGLĄDZIE ADWERSARIALNYM.
   Stała tu funkcja `evidenceDoor`, która dla rodzajów `task`, `project`
   i `note` rysowała w trzeciej ścieżce pozycji pigułkę celu, a powłoka
   otwierała pod jej identyfikatorem ekran rekordu.

   ZMIERZONE W ŹRÓDLE, NIE ZAŁOŻONE: `recordId` dowodu NIE ADRESUJE rekordu,
   który pozycja nazywa. Jedyny produkcyjny czytnik dowodów
   (`packages/desktop-main/src/calendar-meeting-loop.ts:290-326`) wpisuje tam
   `meeting.id` (identyfikator `ImportedMeeting`) albo `item.id`
   (identyfikator `MeetingWorkItem`) — NIGDY `item.taskId`, mimo że
   `MeetingWorkItemSchema` (`packages/contracts/src/meeting-loop.ts:308-309`)
   niesie `taskId` i `projectId` obok. Pigułka `Task →` prowadziła więc pod
   adres, pod którym nie ma zadania.

   STRAŻNIK, KTÓRY MIAŁ TO ŁAPAĆ, NIE MOŻE ZADZIAŁAĆ. `TaskIdSchema` to
   `opaqueId<"TaskId">()`, czyli `z.uuid().brand<"TaskId">()`
   (`packages/contracts/src/ids.ts:3` i `:44`); marka
   jest WYŁĄCZNIE typowa, a w runtime zostaje gołe `z.uuid()`. Identyfikator
   work-itemu jest poprawnym uuidem, więc `safeParse` przechodzi zawsze. Obie
   strony są uuidami i nic ich nie odróżni.

   DLACZEGO USUNIĘCIE, A NIE POPRAWKA. Poprawka jest jedną linią w czytniku
   (`recordId` ma nieść identyfikator NAZWANEGO rekordu), czyli w pakiecie
   spoza `desktop-ui` — a ograniczenie tego drzewa roboczego zabrania go
   ruszać. Wybór jest więc między drzwiami pod zły adres a brakiem drzwi, i ten
   sam lot rozstrzygnął już raz tę samą sytuację w drugą stronę: ROLI
   uczestnika nie narysował, bo kontrakt jej nie niesie. Tożsamość celu tak
   samo nie jest niesiona. Twierdzenie bez odczytu jest gorsze niż milczenie —
   również wtedy, gdy twierdzeniem jest przycisk.

   Zapisane jako `ROUTED_NOT_COVERED` (lot D7, pozycja 1) z warunkiem wyjścia
   i jego ceną, więc nie zniknie po cichu. */

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
  onOpenConnections,
  onOpenSources,
}: {
  readonly client: ConstellationRendererClient;
  readonly activeMeetingId?: string | undefined;
  readonly inspectorHost: HTMLElement | null;
  readonly onInspectorOpen: () => void;
  readonly onMeetingSelected: (meetingId: string) => void;
  /* PRAWY KONIEC NAGŁÓWKA SEKCJI ODBYTYCH SPOTKAŃ („What is left of the ones
     that happened"; „Jamie results" do wpisu 10-2) — WPIS #65, DRUGA POŁOWA.
     Prototyp stawia tam wyjście, nie ozdobę (`v3/screens/meetings.js:445` —
     `<button class="more" data-mt-go='{"kind":"sources"}'>Open Sources →`),
     a ekran, na który ono prowadzi, w tej aplikacji ISTNIEJE: czytelnia Źródeł
     Biblioteki. To ten sam precedens, co wpis #6 na Dzisiaj
     (`TodaySurface.tsx` — `onOpenCalendar`): powierzchnia nie zna powłoki, więc
     drogę podaje jej `RealApp`. */
  readonly onOpenSources: () => void;
  /* GDZIE STOI KONFIGURACJA JAMIE — druga połowa wpisu 10-1. Formularz zszedł
     do Ustawień, więc akcja pasma, która bez klucza prowadziła do niego przez
     przewinięcie, musi teraz prowadzić do Ustawień. Ten sam wzorzec i ten sam
     powód co `onOpenSources` wyżej: ekran nie zna powłoki. */
  readonly onOpenConnections: () => void;
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
  /* Okno pojęciowe otwierane plakietką przy kłódce sekcji nadchodzących
     (wpis 10-4, lot L7 Fazy II). Ten sam stan i ten sam komponent co na
     Dzisiaj (`TodaySurface.tsx`) i na Kalendarzu (`CalendarSurface.tsx`). */
  const [conceptHelpTopic, setConceptHelpTopic] =
    useState<ConceptHelpTopicId>();
  // Where the focus must land once the list has been re-rendered without the
  // row the control lived on. Holding the intent rather than calling `focus()`
  // straight away is what makes it survive the refetch: the element the reader
  // pressed is gone by the time React commits the new list.
  /* STOI PRZY POZOSTAŁYCH ZACZEPACH, A NIE PRZY SWOIM UŻYCIU, i to jest
     poprawka zmierzona, nie stylistyczna: pierwsza wersja tego lotu wołała
     `useRef` niżej, obok tafli integracji — czyli PO trzech wczesnych
     `return`ach tego komponentu (ładowanie, błąd, brak Space'u). Zaczep wołany
     warunkowo to zmienna liczba zaczepów między przebiegami: ekran Spotkań
     przestał się renderować w całości, a sonda geometrii wróciła z `band: null`
     zamiast z komunikatem — awaria, którą lint tego repozytorium przepuścił. */
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
        {/* DWA PLACEHOLDERY, NIE TRZY, i to jest poprawka cytatu, nie kosmetyka:
            ten szkielet rysował dwukolumnową siatkę, czyli obiecywał układ,
            który po rekompozycji nie przyjeżdża. Sekcje są dwie i stoją jedna
            pod drugą. Nic tego stanu nie zrzuca ekranem, więc dowodem jest tu
            odczyt kodu — ale szkielet zapowiadający nieistniejący układ to
            dokładnie ta klasa długu, którą dwa ostatnie commity tej gałęzi
            spłacały w komentarzach. */}
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
      <strong>{providerLabel(surface.capability.provider)}</strong>
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
  /* IMPORT Z JAMIE JAKO JEDNA FUNKCJA, WOŁANA Z DWÓCH MIEJSC. Do tej pory ta
     obsługa stała wpisana w atrybut `onClick` przycisku w tafli integracji;
     pasmo tytułu żąda tej samej roboty u swojego prawego końca, a druga kopia
     tego łańcucha byłaby drugim miejscem, w którym następna zmiana komunikatu
     może się nie odbyć. */
  const importFromJamie = () => {
    setJamieBusy(true);
    void client
      .syncJamie()
      .then((result) => {
        setJamieBusy(false);
        setNotice(
          `Jamie: ${result.applied + result.corrected} new or corrected, ${result.noChange} unchanged, ${result.partial} partial${
            result.failed ? `, ${countLabel(result.failed, "error")}` : ""
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
  };
  /* AKCJA PASMA JEST BEZWARUNKOWA, i to jest wymóg, nie wygoda. Prototyp stawia
     ją w paśmie zawsze (`v3/screens/meetings.js:431-433` — `btn("Import from
     Jamie", { cls: "bordered", icon: "arrow" })`), niezależnie od tego, czy
     klucz jest zapisany; przycisk pojawiający się dopiero po podłączeniu byłby
     akcją, której czytelnik bez klucza nigdy nie zobaczy — a to jest właśnie
     stan, w którym ma ona najwięcej do powiedzenia.

     BEZ KLUCZA NIE ODMAWIA, TYLKO PROWADZI — i od lotu L6 prowadzi DALEJ NIŻ
     przedtem. Do wpisu 10-1 naciśnięcie przewijało do tafli integracji stojącej
     w treści TEGO ekranu i dawało ognisko jej polu. Tafla zeszła do Ustawień
     („Access and connections" → „Calendar and Jamie"), więc przycisk otwiera
     TĘ kategorię Ustawień. Zdanie się nie zmieniło: martwy przycisk „disabled"
     mówiłby czytelnikowi, że nic nie da się zrobić, a dokładnie w tym stanie
     da się — tylko jedno okno dalej.

     DROGĘ PODAJE POWŁOKA, NIE EKRAN. Ten sam precedens co `onOpenSources` obok:
     powierzchnia nie wie, gdzie w powłoce stoją Ustawienia, i nie ma prawa
     wiedzieć. `RealApp` wiąże to z `openSettingsCategory("access")`.

     `secondary-button`, NIE `primary-button`: prototypowy modyfikator to
     `bordered` (`v3/app.css:319` — `background: var(--surface-raised)`), czyli
     powierzchnia z obwódką, a nie wypełnienie akcentem. Spis pasma tytułu liczy
     obie klasy jako akcję (`TITLE_BAND_ACTION_CLASSES`), więc wybór między nimi
     jest wyborem o WIERNOŚCI, nie o przejściu bramki.

     GLIF NIE JEST OZDOBĄ, JEST WARUNKIEM WIDOCZNOŚCI TEJ AKCJI (naprawa po
     przeglądzie lotu D1). Trzeci argument cytowanego wyżej wywołania —
     `icon: "arrow"` — lot D1 przepisał z prototypu razem z etykietą
     i modyfikatorem, a sam glif pominął. Poniżej 50 rem okna arkusz zwija
     KAŻDĄ akcję pasma do kwadratu i gasi jej napis (`styles.css` —
     `.surface-header .secondary-button { width: …; font-size: 0 }`), bo reguła
     jest pisana pod akcję Z IKONĄ: chowa etykietę i zostawia glif. Przycisk bez
     `svg` zostawał w tym trybie PUSTYM prostokątem — jedyny taki z sześciu
     ekranów, które oddały akcję pasma, bo pięć pozostałych podaje `<Icon />`
     (np. `people/PeopleSurface.tsx:515-519`). Bramka układu chodzi przy 320 px
     i wróciła zielona, bo mierzy PRZEPEŁNIENIE, a nie pustkę. */
  const bandAction = (
    <button
      className="secondary-button"
      disabled={jamieBusy}
      onClick={() => {
        if (jamie.kind === "ready" && jamie.configured) {
          importFromJamie();
          return;
        }
        onOpenConnections();
      }}
      type="button"
    >
      <Icon name="arrow" />
      {jamieBusy ? "Importing…" : "Import from Jamie"}
    </button>
  );
  /* KARTA KONFIGURACJI JAMIE STAŁA TU I ZESZŁA DO USTAWIEŃ — WPIS 10-1,
     decyzja Kacpra z Fazy 0, oddana w locie L6 (Faza II).

     BYŁO: `<div class="meeting-integration-wrap">` z sekcją `RESULT SOURCE /
     Jamie`, a w niej `Key scope` jako natywny `<select>`, `API key` jako
     natywny `<input type="password">` i przycisk `Connect Jamie` — formularz
     administracyjny wstawiony MIĘDZY nagłówek sekcji odbytych spotkań a samą
     listę wyników.

     JEST: `SettingsSurface.tsx`, kategoria `access` („Access and connections"),
     sekcja „Calendar and Jamie". Ta sama sekcja miała dotąd JEDEN przycisk
     („Open connections"), który prowadził tutaj — czyli kierunek był odwrócony
     i ekran pracy trzymał ustawienia ekranu ustawień.

     DWA CYTATY. Prototyp: `v3/screens/meetings.js:1-452` — cały ekran spotkań
     ma ZERO `<select>`, ZERO `<input>` i ZERO `<textarea>` (zmierzone), a jego
     jedyny `<select>` w całym drzewie stoi w wierszu Ustawień
     (`v3/screens/settings.js:331`). Kontrakt: `.ui-craft/patterns.md`,
     „Pattern: Control size" — na powierzchni treści wybór nie jest natywną
     kontrolką; wyjątkiem jest wiersz Ustawień.

     CO ZOSTAŁO TUTAJ i dlaczego to nie jest połowa roboty: `jamie` (stan
     połączenia) i `importFromJamie` (synchronizacja). Import wyników jest
     ROBOTĄ NA TYM EKRANIE i prototyp stawia go w paśmie tytułu
     (`v3/screens/meetings.js:431-433`). Zeszła wyłącznie KONFIGURACJA. */

  /* REKOMPOZYCJA CIAŁA EKRANU — WPISY #63, #64 I #65 REJESTRU JAKO JEDNA
     ROBOTA, BO KAŻDY Z NICH OSOBNO ZOSTAWIŁBY EKRAN GORSZYM NIŻ BYŁ.

     Do tej chwili ten ekran rysował DWA PASY: podniesioną taflę sekcji
     odbytych spotkań i wąską szynę `.meeting-context-rail` po prawej, w której siedziało to,
     z czym w spotkanie się WCHODZI. Trzy zdania rejestru opisują trzy strony
     tego samego pudełka:

       #63 — nadchodzące są ZDEGRADOWANE do prawej szyny zamiast stać jako
             PIERWSZA sekcja na pełną szerokość (prototyp: `v3/screens/
             meetings.js:430-451` — dwie sekcje jedna pod drugą, „Coming up”
             pierwsza; `v3/screens/meetings.css:11` — `.mt` to JEDNA kolumna);
       #64 — drabina jasności jest ODWRÓCONA: szyna była CIEMNIEJSZA od kanwy
             (`--surface-sunken` położony wprost na płótnie), a tafla formularza
             integracji siedziała wpuszczona WEWNĄTRZ podniesionej karty;
       #65 — nagłówek sekcji był WCIĄGNIĘTY DO ŚRODKA karty i służył jej za
             kreskę działową, zamiast stać na kanwie nad nią, i nie miał prawego
             końca.

     JEDNYM RUCHEM, KTÓRY TO ZAMYKA, JEST PRZENIESIENIE CHROMU KARTY Z SEKCJI NA
     LISTĘ W ŚRODKU. Farba, która stała na `.meeting-completed`, była naraz:
     przeciwwagą szyny (#64), pudełkiem, w którym uwięziony był nagłówek (#65),
     i powodem, dla którego nadchodzące nie mieściły się obok (#63). Sekcja jest
     odtąd PRZEZROCZYSTA, karta to `.meeting-upcoming-list` / `.meeting-result-
     list`, a nagłówek jest RODZEŃSTWEM karty, nie jej pierwszym dzieckiem.

     GŁĘBIA ZOSTAJE NOŚNIKIEM ZNACZENIA I NIE JEST TU ODWRACANA. Prototyp mówi
     to wprost w swoim własnym arkuszu (`v3/screens/meetings.css:6-9`):
     nadchodzące są WPUSZCZONE, bo nie da się w nich nic zmienić; odbyte stoją
     na planie treści, bo to na nich się pracuje. Wpuszczony wiersz WEWNĄTRZ
     jaśniejszej karty jest więc CELEM, a nie wadą — wadą było `--surface-
     sunken` położony wprost na kanwie. I działa to razem z kłódką i etykietą,
     nigdy samo.

     OBIE SEKCJE SĄ WYCIĄGNIĘTE DO STAŁYCH, i to nie jest kosmetyka: kolejność
     z #63 jest wtedy jedną linijką do zamiany, więc break-test dowodzący tej
     kolejności ZMIENIA UKŁAD zamiast KASOWAĆ sekcję. Złamanie, które kasuje
     podmiot, dowodzi nieobecności, a nie wpisu. */
  const upcomingSection = (
    <section className="meeting-upcoming" aria-labelledby="upcoming-title">
      {/* NAGŁÓWEK STOI NA KANWIE, A LICZBA SIEDZI W NIM — wpis #65 i prototyp
          `v3/screens/meetings.js:436` (`<h2>Coming up <span class="n">…`).
          Poziom drugi, nie trzeci: `h3` brał się wyłącznie stąd, że sekcja
          wisiała pod `<h2 id="sources-title">` skasowanej szyny. Dziś obie
          sekcje są równorzędne i obie stoją wprost pod `<h1 id="surface-title">`
          pasma — prototyp żąda tego wprost prozą (`meetings.js:429-430`). */}
      <div className="meeting-sec-head">
        <h2 id="upcoming-title">
          Coming up{" "}
          <span className="meeting-sec-count">{surface.upcoming.length}</span>
        </h2>
        {/* KŁÓDKA MÓWI TO, CO MÓWI WPUSZCZENIE WIERSZA, TYLKO SŁOWAMI. Głębia
            sama w sobie nie jest czytelna dla nikogo, kto jej nie widzi, więc
            prototyp stawia obok niej plakietkę z kłódką i nazwą dostawcy
            (`v3/screens/meetings.css:31-38`, `meetings.js:437-438`). Te
            wydarzenia są tu do CZYTANIA: aplikacja umie dopisać własny blok
            przygotowania, ale nie umie zmienić cudzego wpisu w kalendarzu. */}
        <span className="meeting-sec-lock">
          <Icon name="lock" />
          {providerLabel(surface.capability.provider)}
        </span>
        {/* WPIS 10-4: plakietka ZARAZ ZA kłódką, jak `v3/screens/meetings.js:439`.
            Kłódka mówi CO, plakietka DLACZEGO. Temat jest ten sam, który niosą
            znaczniki na Dzisiaj i Kalendarzu — jedenasty temat na to samo
            pytanie byłby drugą listą obok zamkniętego słownika. Reszta powodu
            stoi przy parze `L7-07a` w `scripts/visual-language-pairs.mjs`;
            TU JEST KRÓTKO, bo `interaction-recovery-contract.test.ts` mierzy
            ODLEGŁOŚĆ W ŹRÓDLE między tą sekcją a `{calendarCapability}`
            (okno 3000 znaków) i pierwsza wersja tego komentarza ją przekroczyła.
            Guard nie jest mój i jego liczby nie ruszam. */}
        <span className="help-anchor" data-help-topic="calendar-meetings">
          <button
            type="button"
            className="help-mark"
            aria-haspopup="dialog"
            aria-label="Why the calendar is read-only"
            onClick={() => setConceptHelpTopic("calendar-meetings")}
          >
            ?
          </button>
        </span>
      </div>
      {/* KONTROLKA UPRAWNIENIA WCHODZI DO TEJ SEKCJI, A NIE ZNIKA Z SZYNĄ, i to
          jest jedyne miejsce w całej aplikacji, z którego woła się
          `requestCalendarAccess()`. Tłumaczy DOKŁADNIE tę listę: pusta albo
          niepełna jest przez to, co ta kontrolka pokazuje. Martwy „Grant
          access" przeszedł już raz przez cztery podpisane wydania (PR #143),
          a spis kontrolek deklaruje na tym ekranie 2 przy zmierzonych 4 — więc
          zgubienie go byłoby CICHĄ zielenią, nie czerwienią. */}
      {calendarCapability}
      {surface.upcoming.length === 0 ? (
        <div className="meeting-empty">
          <svg aria-hidden="true" viewBox="0 0 48 48">
            <path d="M9 12h30v27H9zM15 7v10M33 7v10M9 20h30" />
          </svg>
          {/* POZIOM TRZECI, BO GŁOWA SEKCJI ZJECHAŁA NA DRUGI (lot D7). Ten
              nadpis stoi wprost pod `<h2 id="upcoming-title">`, więc `h4`
              zostawiał w spisie treści dziurę h2→h4 — i to jest dokładnie ta
              dziura, którą złapało zamiatanie paczkowanej alfy przy 320 px
              (`PACKAGED_ALPHA_NARROW_SURFACE_INVALID`, `headingJumps: [4]`).
              TA CYFRA JEST CYTATEM Z ŁADUNKU TAMTEGO PRZEBIEGU i nigdy już się
              nie pojawi: pole niesie dziś OPIS przeskoku (`h2->h4 h4 "..."`),
              bo sama cyfra kazała odtwarzać z CI, o który nagłówek chodzi.
              Bliźniak po stronie odbytych (`meeting-completed`) stał na `h3` od
              początku i dlatego nie miał tego defektu. */}
          <h3>No events visible</h3>
          <p>
            {surface.capability.canRead
              ? "The calendar has no meetings in this window."
              : "Unblock the provider to see preparation."}
          </p>
        </div>
      ) : (
        /* KARTA JEST TU, NIE NA SEKCJI — to jest cały wpis #64 w jednym
           elemencie. Nie dostaje `role`/`aria-label`: prototypowe `.mt-list`
           jest `role="listbox"`, bo jego wiersze SĄ opcjami, a nasze to
           `<article>` z własnymi kontrolkami. Rola obiecująca semantykę
           klawiatury, której kod nie ma, jest gorsza niż jej brak. */
        <div className="meeting-upcoming-list">
          {surface.upcoming.map(({ event, brief }) => (
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
                {/* TEN SAM POZIOM, CO NADPIS PUSTEGO RAMIENIA WYŻEJ, i z tego
                    samego powodu: tytuł wydarzenia jest dzieckiem sekcji
                    „Coming up", a ta jest dziś `h2`. Ramię z wierszami rysuje
                    fikstura bramki układu, a ramię puste — zamiatanie alfy;
                    poprawka jednego bez drugiego zostawiłaby defekt w tym
                    ramieniu, którego akurat NIE mierzy ten przyrząd. */}
                {/* TYTUŁ I MIEJSCE W JEDNEJ LINII BAZOWEJ — prototypowe
                    `.mt-up-head` (`v3/screens/meetings.css:76`) trzyma obok
                    tytułu ciche `.mt-org`. U prototypu jest tam nazwa
                    organizacji; nasza projekcja wydarzenia jej NIE NIESIE
                    (`CalendarEventProjectionSchema`,
                    `packages/contracts/src/meeting-loop.ts:54-66`, `.strict()`),
                    a niesie `location`. Miejsce spotkania jest tym, co ta
                    projekcja o nim wie poza czasem, więc stoi w tej ścieżce.
                    Nazwa klasy mówi `where`, a nie `org`, właśnie po to, żeby
                    następny czytający nie wziął jej za organizację. */}
                <div className="meeting-event-head">
                  <h3>{event.title}</h3>
                  {event.location === undefined ? null : (
                    <span className="meeting-event-where">
                      {event.location}
                    </span>
                  )}
                </div>
                {/* KTO BĘDZIE — IMIONA, NIE LICZNIK. Prototyp pisze powód
                    własnym komentarzem (`v3/screens/meetings.css:85`): „z rolą,
                    bo »MN · PZ« nie przygotowuje nikogo do rozmowy". Tu stoi
                    połowa, którą projekcja UNOSI: awatar i imię.
                    ROLI TU NIE MA I NIE JEST TO PRZEOCZENIE.
                    `CalendarAttendeeSchema`
                    (`packages/contracts/src/meeting-loop.ts:43-53`) jest
                    `.strict()` i niesie `externalId`, `name`, `email`,
                    `organizer`, `response` — ŻADNEGO stanowiska i żadnego
                    `personId`. Roli nie da się narysować, bo nie ma jej skąd
                    wziąć, a `.strict()` nie pozwoli jej nawet przemycić obok.
                    `organizer` NIE JEST rolą: to rola w spotkaniu, nie
                    stanowisko człowieka, i wstawiona w tę szczelinę czytałaby
                    się jak stanowisko.
                    Prototypowy kształt `.mt-person.unlinked` (przerywana
                    ramka, „ten uczestnik nie jest jeszcze osobą w grafie")
                    TEŻ TU NIE WCHODZI: on twierdzi coś o grafie, a my w graf
                    nie zaglądamy. Twierdzenie bez odczytu jest gorsze niż
                    milczenie. */}
                {event.attendees.length === 0 ? (
                  <p className="meeting-room-none">
                    The calendar lists nobody for this meeting.
                  </p>
                ) : (
                  <div className="meeting-room">
                    {event.attendees.map((attendee, index) => (
                      <span
                        className="meeting-person"
                        key={`${attendee.email ?? attendee.externalId ?? attendee.name}:${index}`}
                      >
                        <span
                          aria-hidden="true"
                          className="meeting-person-avatar"
                        >
                          {initialsOf(attendee.name)}
                        </span>
                        <span className="meeting-person-name">
                          {attendee.name}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {/* CO WNOSISZ DO ROZMOWY — JEDNA NAZWANA POZYCJA NA JEDEN
                    REKORD. Prototypowe `.mt-prep` (`v3/screens/
                    meetings.css:107-112`) jest kolumną pozycji, a każda pozycja
                    to siatka `13rem minmax(0, 1fr) auto`: klucz, wartość, cel.
                    CEL STOI DZIŚ PUSTY — powód i warunek wyjścia w bloku
                    „DRZWI NIE MA ŻADNYCH" wyżej w tym pliku; ścieżka zostaje,
                    bo deklaruje ją prototyp bezwarunkowo.
                    Dotąd stały tu DWIE pary klucz/wartość, w których wszystkie
                    rekordy jednej grupy były sklejone kropkami w jeden napis —
                    czyli nazwa grupy zamiast nazwy rzeczy i zero drogi do
                    którejkolwiek z nich. Grupa zostaje, ale jako TON: otwarte
                    pętle są ostrzeżeniem, tak jak `.mt-prep-item.warn`
                    u prototypu. Modyfikator jest pełną nazwą
                    (`meeting-prep-item--warn`), nie nagim `.warn` — prototyp
                    ostrzega przed nagim modyfikatorem własnym komentarzem
                    w pierwszych linijkach `meetings.css`, bo łapie globalne
                    `.warn` z arkusza powłoki. */}
                {(() => {
                  const prep = [
                    ...brief.orientation.map((item) => ({
                      item,
                      warn: false,
                    })),
                    ...brief.openLoops.map((item) => ({ item, warn: true })),
                    ...brief.relevantSources.map((item) => ({
                      item,
                      warn: false,
                    })),
                  ];
                  if (prep.length === 0)
                    return (
                      <p className="meeting-prep-none">
                        Nothing exactly linked to bring into this room.
                      </p>
                    );
                  return (
                    <div className="meeting-prep">
                      {prep.map(({ item, warn }) => (
                        <div
                          className={
                            warn
                              ? "meeting-prep-item meeting-prep-item--warn"
                              : "meeting-prep-item"
                          }
                          key={`${item.kind}:${item.recordId}`}
                        >
                          <span className="meeting-prep-k">
                            <Icon name={evidenceKeyIcon(item.kind)} />
                            {evidenceKeyLabel(item.kind)}
                          </span>
                          {/* NAZWA REKORDU, A FAKT TYLKO WTEDY, GDY MÓWI COŚ
                              PONAD NIĄ. Kropka rozdzielająca stała tu
                              bezwarunkowo i w produkcji drukowała ten sam
                              napis dwa razy: czytnik dowodów wpisuje
                              niekonfliktowemu work-itemowi `fact: item.title`
                              obok `label: item.title`
                              (`calendar-meeting-loop.ts:314-321`), więc każda
                              pozycja z Jamie brzmiała „Tytuł · Tytuł”.
                              Fikstura bramki ma te pola RÓŻNE, więc żaden
                              przyrząd tego nie dosięgał — pusta różnica
                              w fiksturze nie tylko nie mierzy, ona CHOWA. */}
                          <span className="meeting-prep-v">
                            {item.label}
                            {item.fact === item.label ? null : (
                              <>
                                <span className="meeting-prep-dot"> · </span>
                                {item.fact}
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {/* TRZECIA ŚCIEŻKA WIERSZA JEST OGONEM, NIE SAMYM PRZYCISKIEM —
                  prototypowe `.mt-up-tail` (`v3/screens/meetings.css:126`).
                  DOSTAWCA STOI PRZY KAŻDYM SPOTKANIU, a nie tylko przy sekcji,
                  i to jest wpis 10-3, oś czwarta. Kontrakt mówi to jako regułę,
                  nie jako powtórzenie ozdoby: głębia jest niewidzialna dla
                  kogoś, kto jej nie widzi, więc WPUSZCZENIE WIERSZA
                  (`--surface-sunken`, para D7-02f) ma iść razem z glifem
                  i słowem. Wpuszczony jest WIERSZ, więc plakietka należy do
                  wiersza; ta przy nagłówku sekcji mówi to o sekcji i zostaje,
                  dokładnie tak jak u prototypu, który ma OBIE
                  (`meetings.js:437-438` i `:246-248`).
                  `Preview block` ZOSTAJE, choć prototyp go nie ma: to nie jest
                  ozdoba, tylko jedyna droga do zarezerwowania czasu na
                  przygotowanie (`previewCalendarBlocks`). Prototyp tej
                  zdolności nie modeluje, a skasowanie jej „bo prototyp wygrywa"
                  skasowałoby funkcję — ten sam precedens co `Close` na
                  Odnowieniach. */}
              <div className="meeting-event-tail">
                <span className="meeting-locked">
                  <Icon name="lock" />
                  {providerLabel(event.provider)}
                </span>
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
              </div>
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
          ))}
        </div>
      )}
    </section>
  );
  const completedSection = (
    <section className="meeting-completed" aria-labelledby="completed-title">
      <div className="meeting-sec-head">
        {/* WPIS 10-2 OGONA FAZY III — SEKCJA NAZYWA SIĘ TYM, CO ZNACZY, A NIE
            DOSTAWCĄ. Prototyp: `<h2>What is left of the ones that happened
            <span class="n">${"{"}imported.length{"}"}</span></h2>`
            (`v3/screens/meetings.js:446`), obok `Coming up` — obie nazwy mówią
            o CZASIE spotkania, nie o systemie, z którego przyszła treść.
            Stało tu `Jamie results`, czyli nazwa integracji w miejscu, w którym
            sąsiednia sekcja nazywa robotę.

            SZEŚĆ PAR REJESTRU STOI NA TYM NAGŁÓWKU (`D7-03a`…`D7-03g`) i ANI
            JEDNA nie pyta, co on mówi; przemianowanie przechodzi wszystkie
            sześć na zielono. Myli też pierwszy kandydat spoza rejestru:
            `interaction-recovery-contract.test.ts:519` NAZYWA się „stacks
            Coming up above Jamie results", a asertuje `className` i KOLEJNOŚĆ
            montażu. Dlatego pomiar tej pozycji jest osobny i jest o REGULE
            (nazwa sekcji nie jest nazwą dostawcy), a nie o tym jednym napisie.

            `Jamie` ZOSTAJE TAM, GDZIE NAZYWA INTEGRACJĘ — w zdaniu stanu
            pustego („Jamie still owns recording and transcription") i przy
            imporcie. To nie jest niekonsekwencja: tam nazwa dostawcy jest
            TREŚCIĄ zdania, a nie nazwą zbioru spotkań. */}
        <h2 id="completed-title">
          What is left of the ones that happened{" "}
          <span className="meeting-sec-count">{surface.completed.length}</span>
        </h2>
        <button
          type="button"
          className="meeting-sec-more"
          data-open-sources
          onClick={onOpenSources}
        >
          Open Sources →
        </button>
      </div>
      {surface.completed.length === 0 ? (
        <div className="meeting-empty">
          <h3>No result imported yet</h3>
          <p>
            Jamie still owns recording and transcription. Import keeps the
            source and merges duplicates safely.
          </p>
        </div>
      ) : (
        <div className="meeting-results-browser">
          {/* Nazwa dostępna RÓWNA widocznemu nagłówkowi sekcji, której ta lista
              jest treścią — rozjazd między nimi zostawiłby czytelnikowi
              z czytnikiem ekranu inną nazwę zbioru niż czytelnikowi
              patrzącemu (wpis 10-2). */}
          <ol
            className="meeting-result-list"
            role="listbox"
            aria-label="What is left of the ones that happened"
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
                    <span className="meeting-result-row-summary" id={previewId}>
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
                        {routingOptions.organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
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
                    <MeetingMarkdown value={selectedMeeting.summaryMarkdown} />
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
                        <h4 id="meeting-result-transcript-title">Transcript</h4>
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
                        Participants with an email become People. The rest wait
                        for your decision.
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
                                  item.state === "open" ? "completed" : "open";
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
                                {item.responsibilityOverride === undefined &&
                                item.assignee === undefined
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
                                    setResponsibilityName(event.target.value)
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
                              {item.responsibilityOverride !== undefined && (
                                <button
                                  className="quiet-button"
                                  disabled={busyItemId !== undefined}
                                  type="button"
                                  onClick={() => {
                                    setBusyItemId(item.id);
                                    void client
                                      .correctMeetingWorkItemResponsibility({
                                        meetingId: selectedMeeting.id,
                                        workItemId: item.id,
                                        expectedVersion: item.version,
                                        name: null,
                                      })
                                      .then((changed) => {
                                        setBusyItemId(undefined);
                                        if (changed) {
                                          setResponsibilityItemId(undefined);
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
                      No note points at this meeting yet. A note reaches it by
                      naming it while it is being written.
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
                              {note.author.authoredByAgent ? "Agent" : "Note"}
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
                            pendingFocusRef.current = justDetached.documentId;
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
                      disabled={jamieBusy || newItemTitle.trim().length === 0}
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
                    Some Jamie task ids are missing. Syncing again fills them in
                    without duplicating the meeting.
                  </p>
                )}
              </article>,
              inspectorHost,
            )}
        </div>
      )}
    </section>
  );
  return (
    <section className="meeting-surface" aria-labelledby="surface-title">
      {/* PIĄTY KSZTAŁT PASMA ZNIKA, NIE PRZYBYWA SZÓSTY. `.meeting-hero` był
          czwartym pasmem tytułu tej aplikacji (`.surface-header`, `.meeting-hero`,
          nagłówek Biblioteki, nagłówek ekranów rekordu) i jedynym, którego
          siatka JEDNOKOLUMNOWA nie miała prawego końca — więc ten ekran nie
          miał gdzie postawić akcji głównej i był ostatnim rozjazdem spisu B2.
          Prototyp składa go tą samą funkcją co pozostałe
          (`v3/screens/meetings.js:431-433` przez `crumbbar(crumbs, actions)`,
          `v3/app.js:677-683`), więc odpowiedzią jest ten sam prymityw, którego
          Faza C użyła na sześciu ekranach, a nie druga implementacja pasma.

          NADPIS I ZDANIE OPISU ODCHODZĄ RAZEM Z NIM, i to jest wierność, a nie
          skrót: prototypowe pasmo niesie NAZWĘ EKRANU i akcję, nic więcej
          (`v3/app.css:282-293`), a nadpis „From preparation to follow-up"
          powtarzał to, co mówią nagłówki dwóch sekcji pod nim. */}
      <SurfaceTitleBand action={bandAction} title="Meetings" />

      {notice && (
        <p className="meeting-notice" role="status">
          {notice}
        </p>
      )}

      <div className="meeting-body">
        {upcomingSection}
        {completedSection}
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
      {/* TRZECI EKRAN NIOSĄCY TO OKNO, I NIC W NIM NIE JEST PRZEPISANE —
          `ConceptHelpDialog` jest jednym komponentem z jednym słownikiem
          tematów, a Dzisiaj i Kalendarz montują go dokładnie tak samo. */}
      {conceptHelpTopic !== undefined && (
        <ConceptHelpDialog
          initialTopic={conceptHelpTopic}
          onClose={() => setConceptHelpTopic(undefined)}
        />
      )}
    </section>
  );
};
