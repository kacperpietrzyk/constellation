import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type {
  CaptureId,
  CommandId,
  DocumentId,
  ProjectId,
  RelationId,
  StrategicRecordId,
  TaskId,
} from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  DataHomeStatus,
  DesktopBuildInfo,
} from "@constellation/desktop-preload/client";

import { StrategicRecordInspector } from "./StrategicRecordInspector.js";
import {
  LazySurfaceBoundary,
  SurfaceLoadingState,
} from "./SurfaceLifecycleStates.js";
import type { LoadState } from "./shell/load-state.js";
import {
  desktopSurfaceLabel,
  resolveDesktopSurface,
} from "@constellation/desktop-preload/surface-registry";
import { navItems, sidebarNavItems } from "./shell/nav-items.js";
import { taskPriorityLabels } from "./task-priority-labels.js";
import {
  CalendarSurface,
  KnowledgeSurface,
  MeetingsSurface,
  OnboardingFlow,
  OrganizationContextLoader,
  PeopleSurface,
  PipelineSurface,
  preloadSurface,
  RenewalsSurface,
  SettingsSurface,
  StrategicDepthSurface,
  TaskAttachmentsSection,
  WorkspaceRecovery,
} from "./shell/lazy-surfaces.js";
import { BrandMark } from "./components/BrandMark.js";
import { DocumentBacklinks } from "./components/DocumentBacklinks.js";
import { Icon } from "./components/Icon.js";
import { NarrativeGap } from "./components/RecordNarrative.js";
import {
  ShortcutsOverlay,
  modifierLabel,
  surfaceShortcutHint,
  type SurfaceShortcutHint,
} from "./components/ShortcutsOverlay.js";
import { recordNarrativeGaps } from "./record-narrative.js";
import { TaskAssignmentSection } from "./components/TaskAssignmentSection.js";
import { TaskRemovalSection } from "./components/TaskRemovalSection.js";
import { TaskReservationSection } from "./components/TaskReservationSection.js";
import {
  navigationGroups,
  useCollapsedNavigationGroups,
} from "./hooks/useCollapsedNavigationGroups.js";
import { useDismissiblePanel } from "./hooks/useDismissiblePanel.js";
import { AttentionDetail } from "./CollaborationSurfaces.js";
import {
  countLabel,
  dateKeyInZone,
  formatDate,
  instantForZonedDate,
  recordKindLabels,
} from "./i18n.js";

import { TodaySurface } from "./TodaySurface.js";
import { viewerDisplayName } from "./viewer-identity.js";
import { InboxSurface } from "./InboxSurface.js";
import { inboxWaitingCount } from "./inbox-triage.js";
import { countLiveRecords } from "./crm/record-census.js";
import { ProjectsSurface, SearchOverlay, UndoDialog } from "./Wave2Surfaces.js";
import { TasksSurface } from "./tasks/TasksSurface.js";
import {
  buildActorResolver,
  buildMentionResolver,
  readCommentPermissions,
} from "./record/record-actors.js";
// Lazy, and not as a preference. The record screen carries four panels and five
// stylesheets, and the hot path it would otherwise join has single-digit
// kilobytes left against budgets this rebuild forbids raising per screen. A
// project nobody has opened costs nothing.
const ProjectRecordScreen = lazy(
  () => import("./record/ProjectRecordScreen.js"),
);
const WorkContextRecordHost = lazy(
  () => import("./record/WorkContextRecordHost.js"),
);
// Lazy for exactly the same measured reason. Tasks is an EAGER destination
// (⌘4), so anything this file imports statically for it lands in the first
// paint — and the record screen with its stylesheet and the comments panel is
// several times the room the size gate leaves. A task nobody has opened costs
// nothing.
const TaskRecordScreen = lazy(() => import("./record/TaskRecordScreen.js"));
// Lazy for the same measured reason as the two above, and the reason is the
// gate rather than a preference: Pipeline is a lazy destination, but this file
// is the ENTRY chunk, so a static import here would pull the record screen, its
// stylesheet and the comments panel onto the first paint for every reader who
// never opens a deal. The hot path has single-digit kilobytes left.
const OpportunityRecordScreen = lazy(
  () => import("./opportunity/OpportunityRecordScreen.js"),
);
// Lazy for the same reason, and the reason is measured: the panel's stylesheet
// is eight kilobytes that a STATIC import would move onto the head-linked
// sheet, against the six this retirement frees. The inspector rail is the third
// mount of the one comments panel, not a second implementation of it.
const RecordCommentsPanel = lazy(() =>
  import("./record/RecordCommentsPanel.js").then((module) => ({
    default: module.RecordCommentsPanel,
  })),
);
// Lazy for the same measured reason as the four above, and this one was the
// last big eager dialog in the entry chunk. Capture is twenty kilobytes of
// source — a recorder, a retention control and three consent sentences — behind
// `captureOpen`, which is false at every first paint there has ever been. It
// was static here only because it predates the record screens, and it cost the
// hot path on every window that never captures anything. The dev harness
// imports it too, but `main.tsx` reaches that harness through `import()`, so
// nothing about this module was ever needed before the reader asks for it.
const CaptureDialog = lazy(() =>
  import("./CaptureDialog.js").then((module) => ({
    default: module.CaptureDialog,
  })),
);
import {
  addComment,
  editComment,
  applyTemplateToProject,
  createProject,
  directClientLinks,
  linkableClientOrganizations,
  linkOrganizationDelivery,
  linkProjectClient,
  unlinkOrganizationDelivery,
  unlinkProjectClient,
  createTask,
  setRecordFieldValue,
  updateTaskDetails,
  type FieldValue,
  loadDesktopSnapshot,
  loadProjectOverview,
  loadComments,
  previewUndo,
  relateTask,
  setTaskCompletion,
  setTaskStatus,
  setCommentResolved,
  setProjectLifecycle,
  stageManagedAttachment,
  submitQuickCapture,
  undoCommand,
  unrelateTask,
  updateAreaResponsibility,
  updateInitiativeOutcome,
  updateSavedWorkView,
  updateProjectOutcome,
  updateAttention,
  routeCaptureException,
  requestVoiceAudioDeletion,
  resolveCaptureException,
  type AttentionInboxProjection,
  type AuditReceiptProjection,
  type DesktopSnapshot,
  type MutationFailure,
  type MutationResult,
  type ProjectOverviewProjection,
  type CommentListProjection,
  type CommentTarget,
  type DataSlice,
  type UndoPreview,
} from "./client/workflow.js";
import {
  activateShellContext,
  activeShellContext,
  areaContext,
  canMoveShellHistory,
  closeShellContext,
  createShellNavigation,
  destinationShortcutIndex,
  destinationContext,
  documentContext,
  isLibraryReading,
  type LibraryReading,
  moveShellHistory,
  navigateShellContext,
  openShellContextReportingEviction,
  organizationContext,
  projectContext,
  pruneInaccessibleShellContexts,
  restoreFavoriteSurfaces,
  restoreShellNavigation,
  serializeShellNavigation,
  settingsCategoryContext,
  opportunityContext,
  initiativeContext,
  taskContext,
  tasksSavedViewContext,
  type ShellContext,
} from "./client/shell-navigation.js";
import { subscribeToAgentWrites } from "./client/agent-write-reload.js";
import {
  settingsCategoryGroups,
  settingsCategoryElementId,
  settingsPanes,
  type SettingsCategoryId,
} from "./settings-categories.js";
import {
  conditionCopy,
  type PreviewCondition,
  type SurfaceId,
} from "./client/wave2-fixtures.js";
import type { WorkContextKind } from "./record-narrative.js";

// Re-eksport, bo test kompletności mapy leniwych powierzchni importuje
// `lazySurfaceLoaders` z tego modułu.
export { lazySurfaceLoaders } from "./shell/lazy-surfaces.js";

// The two things "no comments to show" can mean, and they are NOT the same
// thing. `DataSlice` carries a list or a message, so the shell says which in
// the message — and says each of them in exactly ONE place: the sentence below
// used to be written at the slice's initial value AND again in the loader's
// guard, and the rail drew "Choose a task or a project." under the Comments
// heading of a task that WAS chosen, on every first frame, because the effect
// had not run yet.
const NO_COMMENT_TARGET: DataSlice<CommentListProjection> = {
  kind: "unavailable",
  message: "Choose a task or a project.",
};
const COMMENTS_PENDING: DataSlice<CommentListProjection> = {
  kind: "unavailable",
  message: "Loading comments…",
};

// Nazwa rodzaju rekordu w nagłówku inspektora Biblioteki. Rekord jest TOTALNY
// nad słownikiem odczytów, więc czwarty odczyt bez czwartego napisu nie
// skompiluje się — inaczej byłaby to kolejna ręczna lista obok zamkniętego
// słownika, a takie rozejście już raz pokazało wrzutkę pod cudzym napisem.
const libraryInspectorLabel: Readonly<Record<LibraryReading, string>> = {
  notes: "Document",
  sources: "Source",
  captures: "Capture",
};

/**
 * Co obiecuje kontrolka pod przełącznikiem przestrzeni — JEDNO ŹRÓDŁO.
 *
 * Napis stoi w czterech miejscach jednego bloku JSX (etykieta widoczna,
 * `aria-label`, dymek railu z fokusu, dymek railu z hovera). Cztery literały
 * to cztery okazje, żeby jedna z dróg obiecywała co innego niż pozostałe trzy
 * — a to jest w tym repozytorium nazwana klasa defektu („ręczna lista obok
 * zamkniętego słownika"). Prototyp: `v3/app.js:653-655`.
 */
const SEARCH_CONTROL_LABEL = "Search and run…";

/**
 * DRUGA LINIA KAFLA PRZESTRZENI: GDZIE LEŻĄ DANE I W JAKIM SĄ STANIE, W TEJ
 * KOLEJNOŚCI (`v3/app.js:649` — `Local · encrypted`: miejsce, separator,
 * ochrona).
 *
 * CO TU STAŁO I DLACZEGO TO BYŁO GORSZE NIŻ „za długi napis". Linia miała dwie
 * gałęzie: `dataHomeLabel` („Local only · data on this device") przy
 * `availability === "available"` i „Data Home needs attention" w KAŻDYM innym
 * przypadku. A `dataHome` jest w ogóle CZYTANE tylko w kanale `local-alpha`
 * (`client/workflow.ts` — `if (build.channel === "local-alpha")`), więc
 * w podglądzie deweloperskim slice jest `undefined` i kafel MELDOWAŁ USTERKĘ
 * MAGAZYNU, którego nikt nie pytał. To jest dokładnie ta klasa, którą ten
 * program ma nazwaną z drugiej strony („odczyt niedostępny rysuje nic, nigdy
 * zera"): nieodbyty pomiar wychodził jako zła odpowiedź.
 *
 * CZTERY STANY, I ŻADEN NIE JEST DOMYŚLNĄ OZDOBĄ:
 *   * odczyt wzięty i zły  → „needs attention" — usterka, którą ktoś zmierzył;
 *   * magazyn skoordynowany → miejscem jest Hub, nie to urządzenie, więc
 *     miejsce nazywa się jego nazwą, a stan mówi „coordinated";
 *   * odczyt wzięty i dobry albo NIEWZIĘTY → ochrona z `build.persistence`,
 *     bo to pole wie w KAŻDYM kanale, czy dysk niesie szyfrowany magazyn
 *     („encrypted"), czy sesja siedzi w pamięci („session memory").
 *     „encrypted" nad pamięcią sesji byłoby obietnicą bezpieczeństwa, której
 *     nikt nie dotrzymuje, więc gałęzie są dwie.
 *
 * MIEJSCE ZOSTAJE W KAŻDYM STANIE. Napis, który przy usterce przestaje mówić,
 * GDZIE leżą dane, zabiera czytelnikowi jedyną trwałą informację z tego kafla
 * — a usterka jest stanem tego samego magazynu, nie jego zamiennikiem.
 *
 * DLACZEGO TO JEST FUNKCJA MODUŁU, A NIE CZTERY WYRAŻENIA W CIELE KOMPONENTU,
 * i jest to poprawka po przeglądzie adwersarialnym lotu L11. Bramka układu
 * chodzi po JEDNYM stanie tej linii — harness stoi w podglądzie
 * deweloperskim, gdzie `dataHome` jest `undefined`, a build trzyma sesję
 * w pamięci — więc para `L11-02` czyta zawsze „Local · session memory".
 * Trzy pozostałe gałęzie, w tym ta USTERKOWA, dla której cała poprawka
 * powstała, nie były dotknięte ŻADNYM pomiarem, a tytuł pary obiecywał
 * „in every state". Jako funkcja są mierzalne wszystkie cztery, bez
 * przeglądarki: `test/shell-storage-line.interaction.test.ts`.
 */
export const workspaceStorageLine = (
  dataHome: DataHomeStatus | undefined,
  persistence: DesktopBuildInfo["persistence"],
): string => {
  const coordinated = dataHome?.descriptor.providerKind === "coordinated";
  const troubled =
    dataHome !== undefined && dataHome.availability !== "available";
  const place = coordinated
    ? (dataHome?.descriptor.displayName ?? "Hub")
    : "Local";
  const state = troubled
    ? "needs attention"
    : coordinated
      ? "coordinated"
      : persistence === "encrypted-local"
        ? "encrypted"
        : "session memory";
  return `${place} · ${state}`;
};

const ProjectOutcomePreview = ({
  projectId,
  outcome,
}: {
  readonly projectId: ProjectId;
  readonly outcome: string;
}) => {
  const outcomeRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const collapsed = overflows && !expanded;
  const outcomeId = `project-outcome-preview-${projectId}`;

  useLayoutEffect(() => {
    if (expanded) return;
    const element = outcomeRef.current;
    if (element === null) return;
    const measure = () => {
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    if (globalThis.ResizeObserver === undefined) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, outcome]);

  return (
    <>
      <blockquote
        className="inspector-outcome-preview"
        data-collapsed={collapsed ? "true" : "false"}
        id={outcomeId}
      >
        <span
          className="inspector-outcome-text"
          data-measure-bounds={expanded ? "false" : "true"}
          ref={outcomeRef}
        >
          {outcome}
        </span>
      </blockquote>
      {overflows && (
        <button
          type="button"
          className="project-outcome-toggle"
          aria-controls={outcomeId}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? "Show less intended outcome"
            : "Show full intended outcome"}
        </button>
      )}
    </>
  );
};

export const RealApp = ({
  client,
  initialSnapshot,
}: {
  readonly client: ConstellationRendererClient | undefined;
  // Szew testowy, ten sam wzorzec co `initialStatus` w `WorkspaceRecovery`:
  // stan startowy to zawsze „loading", a `renderToStaticMarkup` NIE URUCHAMIA
  // efektów, więc bez tego każdy cel renderuje się jako ten sam ekran ładowania
  // i o żadnej powierzchni nie da się orzec niczego. Podanie snapshotu wsadza
  // powłokę od razu w gałąź „ready". Produkcja nie podaje go nigdy.
  readonly initialSnapshot?: DesktopSnapshot;
}) => {
  const [state, setState] = useState<LoadState>(() =>
    initialSnapshot === undefined
      ? { kind: "loading" }
      : { kind: "ready", snapshot: initialSnapshot },
  );
  const [navigation, setNavigation] = useState(() => {
    const parameters = new URLSearchParams(window.location.search);
    // Through the RETIRED map, not straight at the registry. A detached window
    // carries its destination in the query string, and a window opened before an
    // upgrade still names the surface it was opened on — which is the case the
    // map exists for. Matching the registry alone sent it to Today instead of to
    // the screen that took the work over.
    const requested = navItems.find(
      (item) =>
        item.id === resolveDesktopSurface(parameters.get("destination")),
    );
    const fallback = destinationContext(
      requested?.id ?? "today",
      requested?.label ?? "Today",
    );
    return parameters.get("detached") === "1"
      ? createShellNavigation(fallback)
      : restoreShellNavigation(
          localStorage.getItem("constellation.shell-navigation"),
          fallback,
        );
  });
  const navigationRef = useRef(navigation);
  // Ta sama mapa wycofanych celów co przy zakładkach, plus reguła, że przypiąć
  // da się tylko cel z lewej kolumny. Obie mieszkają w `shell-navigation.ts`,
  // przy odtwarzaniu sesji, bo to jest jedno miejsce: STAN URZĄDZENIA CZYTANY
  // ZE ZAPISU SPRZED PRZEBUDOWY. Wcześniej ta odsiewka stała tutaj i pytała
  // rejestr o samo ISTNIENIE celu, więc przypięte Ustawienia przeżywały
  // aktualizację, w której przestały być pozycją nawigacji — a odpiąć je było
  // można tylko gwiazdką przy pozycji nawigacji, której już nie ma.
  const [favorites, setFavorites] = useState<readonly SurfaceId[]>(() =>
    restoreFavoriteSurfaces(localStorage.getItem("constellation.favorites")),
  );
  const [collapsedNavigationGroups, toggleNavigationGroup] =
    useCollapsedNavigationGroups();
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const stored = Number(
      localStorage.getItem("constellation.inspector-width"),
    );
    return Number.isFinite(stored) && stored >= 280 && stored <= 640
      ? stored
      : 320;
  });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>();
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>();
  const [selectedWorkContext, setSelectedWorkContext] = useState<{
    readonly kind: WorkContextKind;
    readonly id: string;
  }>();
  // Obszar i Inicjatywa nie mają własnej powierzchni edycji, więc nienapisaną
  // intencję uzupełnia się tam, gdzie jest widoczna — w inspectorze.
  const [workContextNarrative, setWorkContextNarrative] = useState<string>();
  const [selectedStrategicId, setSelectedStrategicId] = useState<string>();
  const [selectedCaptureId, setSelectedCaptureId] = useState<CaptureId>();
  const [selectedAttentionId, setSelectedAttentionId] = useState<string>();
  const [meetingInspectorHost, setMeetingInspectorHost] =
    useState<HTMLElement | null>(null);
  const [meetingInspectorOpen, setMeetingInspectorOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>();
  const [documentInspectorHost, setDocumentInspectorHost] =
    useState<HTMLElement | null>(null);
  const [documentInspectorOpen, setDocumentInspectorOpen] = useState(false);
  // Rodzaj karty w inspektorze Biblioteki JEST słownikiem odczytów, a nie
  // drugą, ręcznie przepisaną listą obok niego: trzeci odczyt bez trzeciego
  // ramienia tutaj kompilowałby się i pokazywał wrzutkę pod napisem
  // „Document".
  const [documentInspectorKind, setDocumentInspectorKind] =
    useState<LibraryReading>("notes");
  const [projectOverview, setProjectOverview] =
    useState<ProjectOverviewProjection>();
  const [busyTaskId, setBusyTaskId] = useState<TaskId>();
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState({
    title: "",
    description: "",
    nextAction: "",
    startDate: "",
    dueDate: "",
    priority: "",
  });
  const [taskEditBusy, setTaskEditBusy] = useState(false);
  const taskEditButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskEditWantsFocusRef = useRef(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [subtaskBusy, setSubtaskBusy] = useState(false);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [fieldSaveBusy, setFieldSaveBusy] = useState(false);
  useEffect(() => {
    if (!taskEditOpen && taskEditWantsFocusRef.current) {
      taskEditWantsFocusRef.current = false;
      taskEditButtonRef.current?.focus();
    }
  }, [taskEditOpen]);
  const [projectBusy, setProjectBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attentionBusy, setAttentionBusy] = useState(false);
  const [historyBusyCaptureId, setHistoryBusyCaptureId] = useState<CaptureId>();
  const [comments, setComments] =
    useState<DataSlice<CommentListProjection>>(NO_COMMENT_TARGET);
  // Which record the slice above holds, because the slice itself cannot say.
  // Without it, switching from task A to task B leaves A's threads under B's
  // Comments heading for the whole round trip of the new read.
  const commentTargetKeyRef = useRef<string | undefined>(undefined);
  const [sessionRelation, setSessionRelation] = useState<{
    id: RelationId;
    version: number;
    taskId: TaskId;
  }>();
  const [undoPreview, setUndoPreview] = useState<UndoPreview>();
  const [undoBusy, setUndoBusy] = useState(false);
  const [receipts, setReceipts] = useState<
    Record<string, AuditReceiptProjection>
  >({});
  const [notice, setNotice] = useState<MutationFailure>();
  // Toasty są kolejkowane zamiast nadpisywane: widoczny jest pierwszy wpis,
  // kolejne czekają, a odwracalna mutacja niesie akcję „Cofnij”.
  const [toasts, setToasts] = useState<
    readonly {
      readonly id: number;
      readonly message: string;
      readonly restore?: ShellContext;
      readonly undoCommandId?: CommandId;
    }[]
  >([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback(
    (toast: {
      readonly message: string;
      readonly restore?: ShellContext;
      readonly undoCommandId?: CommandId;
    }) => {
      toastIdRef.current += 1;
      const id = toastIdRef.current;
      setToasts((current) => [...current, { ...toast, id }]);
    },
    [],
  );
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);
  const activeToast = toasts[0];
  // Hover lub fokus w toaście wstrzymuje automatyczne zamknięcie, żeby akcje
  // „Cofnij”/„Przywróć” nie znikały użytkownikowi spod kursora ani spod
  // fokusa klawiatury; timer rusza od nowa po opuszczeniu toastu.
  const [toastPaused, setToastPaused] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [previewCondition, setPreviewCondition] =
    useState<PreviewCondition>("ready");
  const [narrowShell, setNarrowShell] = useState(
    () => window.matchMedia("(max-width: 75rem)").matches,
  );
  // TWO SOURCES FOR THE RAIL, ONE STATE (`v3/app.css:152`, `v3/app.js:662`).
  // The window can force the rail, and now a person can ask for it — but every
  // rail rule downstream (hidden labels, icon-width rows, the tooltip that
  // replaces the labels) must keep exactly ONE owner, or the two triggers drift
  // into two behaviours. `railMode` is that owner and nothing else reads the
  // media query directly.
  const [narrowRail, setNarrowRail] = useState(
    () => window.matchMedia("(max-width: 50rem)").matches,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const railMode = narrowRail || sidebarCollapsed;
  const [focusedNavItemId, setFocusedNavItemId] = useState<SurfaceId>();
  const [railTip, setRailTip] = useState<{
    readonly label: string;
    readonly hint?: SurfaceShortcutHint;
    readonly top: number;
  }>();
  const navRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLDivElement>(null);
  const captureReturnFocusRef = useRef<HTMLElement | null>(null);
  const captureRestoreFocusPendingRef = useRef(false);
  const activeContext = activeShellContext(navigation);
  const surface = activeContext.surface;
  // JEDNO ZDANIE „JESTEŚMY W TRYBIE USTAWIEŃ" DLA CZTERECH CZYTAJĄCYCH — karty
  // przestrzeni, wyszukiwarki, dwóch grup skrótów i samego spisu sekcji.
  // Powtórzony `surface === "settings"` przy każdym z nich byłby piątą kopią
  // tego samego warunku i pierwszy cel dopisany do trybu rozjechałby je po
  // cichu: kolumna zostałaby podmieniona w połowie.
  const settingsMode = surface === "settings";
  // Bound to a const so the "an Organization is open" narrowing survives into
  // the callbacks below: a property access is not narrowed inside a closure,
  // and the client-link handlers need the id after the check, not before it.
  const activeOrganizationId = activeContext.organizationId;
  const detachedWindow =
    new URLSearchParams(window.location.search).get("detached") === "1";
  const recentContexts = navigation.history
    .slice(0, navigation.historyIndex + 1)
    .reverse()
    .reduce<ShellContext[]>((items, context) => {
      if (
        context.key === activeContext.key ||
        context.key.startsWith("destination:") ||
        items.some((item) => item.key === context.key)
      )
        return items;
      items.push(context);
      return items;
    }, [])
    .slice(0, 3);

  useEffect(() => {
    if (detachedWindow) return;
    localStorage.setItem(
      "constellation.shell-navigation",
      serializeShellNavigation(navigation),
    );
  }, [detachedWindow, navigation]);

  useEffect(() => {
    localStorage.setItem("constellation.favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (detachedWindow) return;
    localStorage.setItem(
      "constellation.inspector-width",
      String(inspectorWidth),
    );
  }, [detachedWindow, inspectorWidth]);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 75rem)");
    const rail = window.matchMedia("(max-width: 50rem)");
    const update = () => {
      setNarrowShell(narrow.matches);
      setNarrowRail(rail.matches);
    };
    narrow.addEventListener("change", update);
    rail.addEventListener("change", update);
    return () => {
      narrow.removeEventListener("change", update);
      rail.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (!railMode) setRailTip(undefined);
  }, [railMode]);
  // W trybie rail etykiety sidebaru są ukryte; tooltip z etykietą i skrótem
  // pojawia się przy hover oraz fokusie klawiatury obok zwiniętej kolumny.
  const showRailTip = (
    target: HTMLElement,
    label: string,
    hint?: SurfaceShortcutHint,
  ) => {
    if (!railMode) return;
    const rect = target.getBoundingClientRect();
    setRailTip({
      label,
      ...(hint === undefined ? {} : { hint }),
      top: rect.top + rect.height / 2,
    });
  };
  const hideRailTip = () => setRailTip(undefined);

  // Separator szerokości inspektora używa pointer capture, więc przeciąganie
  // nie gubi się poza oknem; podwójne kliknięcie przywraca domyślne 320 px.
  const resizePointerIdRef = useRef<number | undefined>(undefined);
  const beginInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  const moveInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current !== event.pointerId) return;
    setInspectorWidth(
      Math.min(640, Math.max(280, window.innerWidth - event.clientX)),
    );
  };
  const endInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current !== event.pointerId) return;
    resizePointerIdRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  // Każde otwarcie kontekstu w bieżącej karcie (sidebar, ⌘1-9, Enter,
  // dblclick, wyszukiwarka) przenosi fokus na nagłówek nowej powierzchni —
  // flaga jest ustawiana w jednym miejscu, żeby żadna ścieżka nie gubiła
  // fokusa na odmontowanym elemencie listy.
  const surfaceFocusPendingRef = useRef(false);
  const openContext = useCallback((context: ShellContext) => {
    surfaceFocusPendingRef.current = true;
    setNavigation((current) => navigateShellContext(current, context));
  }, []);

  // Ustawienia są TRYBEM, nie kolejnym ekranem w rzędzie: wejście podmienia
  // lewą kolumnę, a wyjście wraca tam, gdzie się było. Kontekst powrotu
  // zapamiętujemy przy WEJŚCIU, bo po otwarciu Ustawień aktywnym kontekstem są
  // już one same i nie da się go odtworzyć.
  const [settingsReturn, setSettingsReturn] = useState<ShellContext>();
  // WHICH SETTINGS SECTION THE READER IS LOOKING AT, held here because the
  // section list is here. The surface owns the fact (its intersection observer
  // decides which category is in view); the shell owns the only navigator that
  // shows it, so the fact has to cross the boundary. One value, one setter —
  // deliberately not six status strings: this state lives on the hot path and
  // the wave's gzip headroom is measured in hundreds of bytes.
  const [settingsCategory, setSettingsCategory] =
    useState<SettingsCategoryId>();
  const openSettings = useCallback(() => {
    surfaceFocusPendingRef.current = true;
    setNavigation((current) => {
      const active = activeShellContext(current);
      if (active.surface !== "settings") setSettingsReturn(active);
      return navigateShellContext(
        current,
        destinationContext("settings", "Settings"),
      );
    });
  }, []);
  // Ustawienia otwarte NA KONKRETNEJ KATEGORII. Idzie przez tę samą ścieżkę co
  // koło zębate — łącznie z zapamiętaniem kontekstu powrotu — i to jest jedyny
  // powód, dla którego to jest osobna funkcja, a nie `openContext` z gotowym
  // kontekstem: `settingsReturn` zapisuje się przy WEJŚCIU, więc głęboki link
  // omijający tę funkcję wypuszczałby człowieka z Ustawień na Today zamiast
  // tam, gdzie był.
  const openSettingsCategory = useCallback((category: SettingsCategoryId) => {
    surfaceFocusPendingRef.current = true;
    setNavigation((current) => {
      const active = activeShellContext(current);
      if (active.surface !== "settings") setSettingsReturn(active);
      return navigateShellContext(current, settingsCategoryContext(category));
    });
  }, []);
  const leaveSettings = useCallback(() => {
    surfaceFocusPendingRef.current = true;
    const back = settingsReturn ?? destinationContext("today", "Today");
    setNavigation((current) => navigateShellContext(current, back));
    setSettingsReturn(undefined);
  }, [settingsReturn]);
  const openContextInNewTab = useCallback(
    (context: ShellContext) => {
      const outcome = openShellContextReportingEviction(navigation, context);
      setNavigation(outcome.state);
      if (outcome.evictedContext !== undefined) {
        pushToast({
          message: `Closed the “${outcome.evictedContext.label}” tab to open a new one.`,
          restore: outcome.evictedContext,
        });
      }
    },
    [navigation, pushToast],
  );
  const [navMenu, setNavMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly context: ShellContext;
  }>();
  const navMenuRef = useRef<HTMLDivElement>(null);
  const navMenuReturnFocusRef = useRef<HTMLElement | null>(null);
  const navHandlers = (context: ShellContext) => ({
    onClick: (event: ReactMouseEvent) => {
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        openContextInNewTab(context);
      } else {
        openContext(context);
      }
    },
    onAuxClick: (event: ReactMouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
        openContextInNewTab(context);
      }
    },
    onContextMenu: (event: ReactMouseEvent) => {
      event.preventDefault();
      navMenuReturnFocusRef.current =
        event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      setNavMenu({
        x: Math.min(event.clientX, window.innerWidth - 208),
        y: Math.min(event.clientY, window.innerHeight - 96),
        context,
      });
    },
  });
  const closeNavMenu = useCallback((restoreFocus: boolean) => {
    setNavMenu(undefined);
    if (restoreFocus && navMenuReturnFocusRef.current?.isConnected)
      navMenuReturnFocusRef.current.focus();
  }, []);
  useEffect(() => {
    if (navMenu === undefined) return;
    navMenuRef.current
      ?.querySelector<HTMLButtonElement>("[role='menuitem']")
      ?.focus();
  }, [navMenu]);
  const navMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(navMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']",
      ) ?? []),
    ];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      items[(current + delta + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeNavMenu(true);
    } else if (event.key === "Tab") {
      closeNavMenu(false);
    }
  };
  const openCapture = useCallback(() => {
    const activeElement = document.activeElement;
    captureReturnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : document.querySelector<HTMLElement>(".capture-dock");
    setCaptureOpen(true);
  }, []);
  const dismissCapture = useCallback(() => {
    captureRestoreFocusPendingRef.current = true;
    setCaptureOpen(false);
  }, []);
  useLayoutEffect(() => {
    if (captureOpen || !captureRestoreFocusPendingRef.current) return;
    captureRestoreFocusPendingRef.current = false;
    const returnTarget = captureReturnFocusRef.current;
    if (returnTarget?.isConnected) returnTarget.focus();
    else document.querySelector<HTMLElement>(".capture-dock")?.focus();
    captureReturnFocusRef.current = null;
  }, [captureOpen]);

  useEffect(() => {
    setSelectedTaskId(activeContext.taskId);
    setSelectedProjectId(activeContext.projectId);
    if (
      activeContext.taskId ||
      activeContext.projectId ||
      activeContext.organizationId
    ) {
      setSelectedWorkContext(undefined);
      setSelectedStrategicId(undefined);
      setSelectedCaptureId(undefined);
      setSelectedAttentionId(undefined);
    }
  }, [
    activeContext.organizationId,
    activeContext.projectId,
    activeContext.taskId,
  ]);

  // Inspector selection is intentionally separate from the active context:
  // selecting a row keeps the collection surface in place and only feeds the
  // inspector; opening (Enter, double-click, ⌘click) promotes the record to
  // the active shell context.
  const selectTaskInInspector = useCallback((id: TaskId) => {
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(undefined);
    setSelectedTaskId(id);
    setTaskEditOpen(false);
  }, []);
  const selectProjectInInspector = useCallback((id: ProjectId) => {
    setSelectedTaskId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(undefined);
    setSelectedProjectId(id);
  }, []);
  const selectWorkContextInInspector = useCallback(
    (kind: WorkContextKind, id: string) => {
      setSelectedTaskId(undefined);
      setSelectedProjectId(undefined);
      setSelectedStrategicId(undefined);
      setSelectedCaptureId(undefined);
      setSelectedAttentionId(undefined);
      setSelectedWorkContext({ kind, id });
    },
    [],
  );
  const selectStrategicInInspector = useCallback((id: string) => {
    setSelectedTaskId(undefined);
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(undefined);
    setSelectedStrategicId(id);
  }, []);
  const selectCaptureInInspector = useCallback((id: CaptureId) => {
    setSelectedTaskId(undefined);
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedAttentionId(undefined);
    setSelectedCaptureId(id);
  }, []);
  const selectAttentionInInspector = useCallback((id: string) => {
    setSelectedTaskId(undefined);
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(id);
  }, []);

  // Surface changes requested from the sidebar or ⌘1-9 move focus onto the
  // freshly rendered surface heading; lazy surfaces fall back to the panel.
  useEffect(() => {
    if (!surfaceFocusPendingRef.current) return;
    surfaceFocusPendingRef.current = false;
    (
      document.getElementById("surface-title") ??
      document.getElementById("main-content")
    )?.focus();
  }, [activeContext.key]);

  useEffect(() => {
    if (surface !== "meetings") setMeetingInspectorOpen(false);
    // TRZY EKRANY WIEDZY DZIELĄ JEDNĄ SZUFLADĘ, więc wyjście liczy się dopiero
    // poza CAŁĄ trójką (lot D3). `isLibraryReading` jest predykatem po tym samym
    // zamkniętym słowniku, z którego biorą się etykiety i migracja zakładek —
    // ręcznie przepisane „notes || sources || captures" byłoby czwartą kopią
    // tej listy.
    if (!isLibraryReading(surface)) {
      setDocumentInspectorOpen(false);
      setDocumentInspectorKind("notes");
    }
    // FOUR destinations draw strategic records now, so leaving one for another
    // must not drop the selection. Without each of them here, the search
    // routing above sets a record and this effect wipes it on arrival — the
    // record is lost one layer further up than trap 24, and just as quietly.
    // Every CRM screen that repoints a record kind at itself adds itself here
    // too; the pairing is three-part, not two.
    if (
      surface !== "organizations" &&
      surface !== "people" &&
      surface !== "pipeline" &&
      surface !== "renewals"
    )
      setSelectedStrategicId(undefined);
    // Wrzutka jest zaznaczana na ekranie Historii wrzutek — od lotu D3 znowu
    // WŁASNYM celu, `captures`. Warunek zostaje jednak na całej trójce, a nie
    // na samym `captures`, i to jest różnica warta zapisania: szuflada jest
    // wspólna, więc przejście Historia → Źródła nie ma czyścić zaznaczenia,
    // które ta szuflada właśnie pokazuje.
    if (!isLibraryReading(surface)) setSelectedCaptureId(undefined);
    if (surface !== "inbox") setSelectedAttentionId(undefined);
  }, [surface]);

  const snapshot = state.kind === "ready" ? state.snapshot : undefined;
  const selectedWorkContextRecord = useMemo(() => {
    if (!snapshot || snapshot.work.kind !== "ready" || !selectedWorkContext)
      return undefined;
    if (selectedWorkContext.kind === "area") {
      const area = snapshot.work.data.areas.find(
        (item) => item.id === selectedWorkContext.id,
      );
      return area === undefined
        ? undefined
        : {
            kind: "area" as const,
            id: area.id,
            version: area.version,
            title: area.title,
            detail: area.responsibility,
            needsReview: area.needsReview,
            stateLabel: area.state === "active" ? "Active" : "Archived",
          };
    }
    const initiative = snapshot.work.data.initiatives.find(
      (item) => item.id === selectedWorkContext.id,
    );
    return initiative === undefined
      ? undefined
      : {
          kind: "initiative" as const,
          id: initiative.id,
          version: initiative.version,
          title: initiative.title,
          detail: initiative.intendedOutcome,
          needsReview: initiative.needsReview,
          stateLabel: initiative.state === "active" ? "Active" : "Closed",
        };
  }, [selectedWorkContext, snapshot]);
  // Szkic należy do wybranego rekordu, nie do inspectora — zmiana wyboru nie
  // może przenieść nienapisanej intencji na inny Obszar czy Inicjatywę.
  useEffect(
    () => setWorkContextNarrative(undefined),
    [selectedWorkContext?.kind, selectedWorkContext?.id],
  );
  const selectedStrategicRecord = useMemo(
    () =>
      snapshot?.relationships.kind === "ready" &&
      selectedStrategicId !== undefined
        ? snapshot.relationships.data.records.find(
            (record) => record.id === selectedStrategicId,
          )
        : undefined,
    [selectedStrategicId, snapshot],
  );
  useEffect(() => {
    if (!snapshot) return;
    const taskIds = new Set(snapshot.tasks.map((task) => task.id));
    const projectIds = new Set(
      snapshot.projects.kind === "ready"
        ? snapshot.projects.data.items.map((project) => project.id)
        : [],
    );
    const areaIds = new Set(
      snapshot.work.kind === "ready"
        ? snapshot.work.data.areas.map((area) => area.id)
        : [],
    );
    const initiativeIds = new Set(
      snapshot.work.kind === "ready"
        ? snapshot.work.data.initiatives.map((initiative) => initiative.id)
        : [],
    );
    const documentIds = new Set(
      snapshot.documents.kind === "ready"
        ? snapshot.documents.data.items.map((document) => document.id)
        : [],
    );
    const organizationIds = new Set(
      snapshot.relationships.kind === "ready"
        ? snapshot.relationships.data.records
            .filter((record) => record.kind === "organization")
            .map((record) => record.id)
        : [],
    );
    const opportunityIds = new Set(
      snapshot.relationships.kind === "ready"
        ? snapshot.relationships.data.records
            .filter((record) => record.kind === "opportunity")
            .map((record) => record.id)
        : [],
    );
    setNavigation((current) =>
      pruneInaccessibleShellContexts(
        current,
        {
          taskIds,
          projectIds,
          areaIds,
          initiativeIds,
          documentIds,
          organizationIds,
          opportunityIds,
        },
        destinationContext("today", "Today"),
      ),
    );
  }, [snapshot]);

  useEffect(() => {
    if (!client) return;
    return client.onAttentionActivated((destination) => {
      if (destination.kind === "task") {
        openContext(taskContext(destination.taskId, "Task"));
      } else if (destination.kind === "project") {
        openContext(projectContext(destination.projectId, "Project"));
      } else {
        openContext(destinationContext("notes", "Notes"));
      }
    });
  }, [client, openContext]);

  const reloadSnapshot = async () => {
    if (!client) return undefined;
    const next = await loadDesktopSnapshot(client, snapshot?.build);
    setState({ kind: "ready", snapshot: next });
    return next;
  };
  const reload = async () => {
    await reloadSnapshot();
  };

  // Agent writes land in the same graph this window is showing, but the window
  // holds its own projection: without a re-read it keeps rendering the state it
  // opened with, and a correct agent write reads as a missing one. The
  // subscription is laid once per client and reaches the current reload through
  // a ref, so a burst of agent commands cannot slip between unsubscribe and
  // resubscribe.
  //
  // Samo sklejanie mieszka w `client/agent-write-reload.ts`. Tu zostaje tylko
  // spięcie go z Reactem, bo w domknięciu `useEffect` ta logika była
  // NIESPRAWDZALNA: jedynym jej pokryciem była asercja, że stała opóźnienia
  // występuje w tekście tego pliku — zielona przy dowolnie zepsutym sklejaniu.
  const reloadSnapshotRef = useRef(reloadSnapshot);
  const workspaceIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    reloadSnapshotRef.current = reloadSnapshot;
    workspaceIdRef.current = snapshot?.bootstrap.workspace.id;
  });
  useEffect(() => {
    const onWorkspaceChanged = client?.onWorkspaceChanged;
    if (onWorkspaceChanged === undefined) return;
    return subscribeToAgentWrites({
      subscribe: (listener) => onWorkspaceChanged(listener),
      currentWorkspaceId: () => workspaceIdRef.current,
      reload: () => {
        void reloadSnapshotRef.current();
      },
    });
  }, [client]);

  useEffect(() => {
    if (!client) {
      setState({
        kind: "unavailable",
        message:
          "The secure Electron bridge is unavailable. Start the app through the desktop script.",
      });
      return;
    }
    let active = true;
    void client
      .getBuildInfo()
      .then((build) => {
        if (build.workspaceAvailability === "recovery_required") {
          if (active) {
            setState({ kind: "recovery", build });
            setRecoveryOpen(true);
          }
          return undefined;
        }
        return loadDesktopSnapshot(client, build);
      })
      .then((next) => {
        if (!active || next === undefined) return;
        setState({ kind: "ready", snapshot: next });
        if (
          next.build.channel !== "developer-preview" &&
          localStorage.getItem(
            `constellation.onboarded:${next.bootstrap.workspace.id}`,
          ) !== "1"
        )
          setOnboardingOpen(true);
      })
      .catch(
        (error: unknown) =>
          active &&
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not open the workspace.",
          }),
      );
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!client || !snapshot || !selectedProjectId) {
      setProjectOverview(undefined);
      return;
    }
    let active = true;
    void loadProjectOverview(client, snapshot, selectedProjectId)
      .then((overview) => active && setProjectOverview(overview))
      .catch((error: unknown) => {
        if (active) {
          setProjectOverview(undefined);
          setNotice({
            kind: "unavailable",
            message:
              error instanceof Error
                ? error.message
                : "The project overview is unavailable.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [client, selectedProjectId, snapshot]);

  // WHICH record the SELECTED-RECORD comments are read and written against.
  // The loader below and the six write callbacks on the two rails used to spell
  // their own copy of this, and a task record screen would have made it nine
  // statements of one fact — the shape of this repo's named repeat defect. The
  // project record screen is the one thing this cannot answer for; it pins its
  // own, and `recordComment` says why.
  //
  // Memoised because it is an effect dependency: a fresh object each render
  // would re-read the comments on every render.
  const commentTarget = useMemo<CommentTarget | undefined>(
    () =>
      selectedTaskId
        ? { kind: "task", taskId: selectedTaskId }
        : selectedProjectId
          ? { kind: "project", projectId: selectedProjectId }
          : undefined,
    [selectedProjectId, selectedTaskId],
  );

  useEffect(() => {
    // The ref is assigned on EVERY path, including this one, so "the record the
    // slice holds" never becomes a lie the next branch inherits.
    const targetKey = selectedTaskId ?? selectedProjectId;
    const switched = commentTargetKeyRef.current !== targetKey;
    commentTargetKeyRef.current = targetKey;
    // Nothing is selected, which is the ONLY frame that sentence is true of.
    if (commentTarget === undefined) {
      setComments(NO_COMMENT_TARGET);
      return;
    }
    if (switched)
      // A DIFFERENT record than the one on screen: whatever is held belongs to
      // the record just left, so it goes. Keeping it would put the previous
      // record's threads under this one's heading until the read lands.
      setComments(COMMENTS_PENDING);
    // The SAME record, re-read because `reloadSnapshot` ran after a write. The
    // list on screen is still this record's, so it stays and only an
    // `unavailable` slot becomes the pending line — an unconditional set here
    // would blank the threads on every single write.
    else
      setComments((current) =>
        current.kind === "unavailable" ? COMMENTS_PENDING : current,
      );
    // A record IS chosen and the shell is still booting: the line above already
    // says the read is pending, which is the true thing to say.
    if (!client || !snapshot) return;
    let active = true;
    void loadComments(client, snapshot, commentTarget)
      .then((data) => active && setComments({ kind: "ready", data }))
      .catch(
        (error: unknown) =>
          active &&
          setComments({
            kind: "unavailable",
            message:
              error instanceof Error
                ? error.message
                : "Comments are unavailable.",
          }),
      );
    return () => {
      active = false;
    };
  }, [client, commentTarget, selectedProjectId, selectedTaskId, snapshot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modalOpen = document.querySelector("dialog[open]") !== null;
      const shortcutIndex = destinationShortcutIndex(event.code);
      // Nieprzypisana cyfra ⌘Digit nie jest przechwytywana — zdarzenie
      // przechodzi dalej zamiast znikać bez efektu.
      const shortcutItem =
        shortcutIndex === undefined
          ? undefined
          : navItems.find(
              (entry) => entry.shortcut === String(shortcutIndex + 1),
            );
      if (modalOpen && event.key !== "Escape") return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "KeyK"
      ) {
        event.preventDefault();
        openCapture();
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyK") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        (event.key === "," || event.code === "Comma")
      ) {
        // ⌘, to systemowy skrót do ustawień na macOS — człowiek przychodzi
        // z nim z każdej innej aplikacji.
        event.preventDefault();
        openSettings();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        (event.key === "/" || event.code === "Slash")
      ) {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (
        (event.metaKey || event.ctrlKey) &&
        shortcutItem !== undefined
      ) {
        event.preventDefault();
        openContext(destinationContext(shortcutItem.id, shortcutItem.label));
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        setNavigation((current) => moveShellHistory(current, -1));
      } else if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        setNavigation((current) => moveShellHistory(current, 1));
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Tab" &&
        navigation.tabs.length > 1
      ) {
        event.preventDefault();
        const current = navigation.tabs.findIndex(
          (tab) => tab.key === navigation.activeKey,
        );
        const delta = event.shiftKey ? -1 : 1;
        const next =
          navigation.tabs[
            (current + delta + navigation.tabs.length) % navigation.tabs.length
          ];
        if (next)
          setNavigation((value) => activateShellContext(value, next.key));
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.code === "KeyW" &&
        navigation.tabs.length > 1
      ) {
        event.preventDefault();
        setNavigation((current) =>
          closeShellContext(current, current.activeKey),
        );
      } else if (event.key === "Escape") {
        const overlayOpen =
          searchOpen || undoPreview !== undefined || navMenu !== undefined;
        setSearchOpen(false);
        setUndoPreview(undefined);
        setNavMenu(undefined);
        // Escape z fokusem w polu edycji nie czyści selekcji inspektora —
        // wyczyszczenie odmontowałoby formularz razem z wpisanym szkicem.
        const target = event.target;
        const editableTarget =
          target instanceof HTMLElement &&
          (target.matches("input, textarea, select") ||
            target.isContentEditable);
        if (!modalOpen && !overlayOpen && !editableTarget) {
          setSelectedTaskId(undefined);
          setSelectedProjectId(undefined);
          setSelectedWorkContext(undefined);
          setSelectedStrategicId(undefined);
          setMeetingInspectorOpen(false);
          setDocumentInspectorOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    navigation.activeKey,
    navigation.tabs,
    navMenu,
    openCapture,
    openContext,
    searchOpen,
    undoPreview,
  ]);

  // Subskrypcja komend IPC jest zakładana raz na klienta; liczba kart jest
  // czytana z refa aktualizowanego przy każdym renderze, żeby ⌘W z menu nie
  // działał na nieaktualnym stanie (i żeby komendy nie przepadały w oknie
  // między unsubscribe a resubscribe).
  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);
  useEffect(() => {
    if (client?.onShellCommand === undefined) return;
    return client.onShellCommand((command) => {
      if (document.querySelector("dialog[open]") !== null) return;
      if (command.kind === "close-tab") {
        if (navigationRef.current.tabs.length <= 1) window.close();
        else
          setNavigation((current) =>
            closeShellContext(current, current.activeKey),
          );
      } else if (command.kind === "open-capture") {
        openCapture();
      } else if (command.kind === "open-search") {
        setSearchOpen(true);
      } else if (command.kind === "open-shortcuts") {
        setShortcutsOpen(true);
      } else {
        const item = navItems.find(
          (entry) => entry.shortcut === String(command.digit),
        );
        if (item) {
          openContext(destinationContext(item.id, item.label));
        }
      }
    });
  }, [client, openCapture, openContext]);
  useEffect(() => {
    if (activeToast === undefined) {
      setToastPaused(false);
      return;
    }
    if (toastPaused) return;
    const timer = window.setTimeout(
      () => dismissToast(activeToast.id),
      activeToast.undoCommandId === undefined ? 5000 : 8000,
    );
    return () => window.clearTimeout(timer);
  }, [activeToast, dismissToast, toastPaused]);

  useEffect(() => {
    const element = tabRef.current;
    if (!element) return;
    const update = () => {
      const overflowing = element.scrollWidth - element.clientWidth > 1;
      element.dataset.overflowLeft = String(
        overflowing && element.scrollLeft > 1,
      );
      element.dataset.overflowRight = String(
        overflowing &&
          element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      );
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [navigation.tabs.length]);

  useEffect(() => {
    tabRef.current
      ?.querySelector(`[data-shell-tab="${CSS.escape(navigation.activeKey)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [navigation.activeKey]);

  const selectedTask = useMemo(
    () => snapshot?.tasks.find((task) => task.id === selectedTaskId),
    [selectedTaskId, snapshot],
  );
  const selectedProject = useMemo(
    () =>
      snapshot?.projects.kind === "ready"
        ? snapshot.projects.data.items.find(
            (project) => project.id === selectedProjectId,
          )
        : undefined,
    [selectedProjectId, snapshot],
  );
  // The version a comment write is checked against, carried BESIDE the target
  // rather than re-read at each write site: a version sent under another
  // record's id is answered `record.version_conflict` for a record nobody
  // touched. The overview carries it once it has loaded — and only while it is
  // still the overview OF this project, because that state keeps the previous
  // project's reading on screen for the whole round trip of the next one; the
  // list entry is what the inspector opened with.
  // A task's version, from whichever projection actually has the task.
  //
  // `task.list` pages at fifty or a hundred; `work.overview` does not. A record
  // opened past that page therefore has a task the rail's list never returned —
  // and the composer's own grant is a workspace reading, so it drew a live
  // field over a write that could not name a version and silently answered
  // false. A field that takes your text and sends nothing is worse than no
  // field: the second attempt is a retype, not a retry.
  const commentTaskVersion =
    selectedTaskId === undefined
      ? undefined
      : (selectedTask?.version ??
        (snapshot?.work.kind === "ready"
          ? snapshot.work.data.tasks.find((task) => task.id === selectedTaskId)
              ?.version
          : undefined));
  const commentTargetVersion = selectedTaskId
    ? commentTaskVersion
    : projectOverview !== undefined &&
        projectOverview.project.id === selectedProjectId
      ? projectOverview.project.version
      : selectedProject?.version;
  // The project RECORD screen pins its own, and that is not the duplicate the
  // reading above exists to remove — it is a fact about the screen. Its Tasks
  // tab selects a row through the raw setter, so a task chosen INSIDE the
  // record leaves both ids set, and the shell's reading prefers the task: a
  // comment written on the record's Comments tab would land on the task. The
  // record answers for the project it opened, and for nothing else.
  const recordComment =
    projectOverview === undefined
      ? undefined
      : {
          target: {
            kind: "project" as const,
            projectId: projectOverview.project.id,
          },
          version: projectOverview.project.version,
        };
  const selectedCapture = useMemo(
    () =>
      snapshot?.captures.find((capture) => capture.id === selectedCaptureId),
    [selectedCaptureId, snapshot],
  );
  const selectedAttention = useMemo(
    () =>
      snapshot?.attention.kind === "ready"
        ? snapshot.attention.data.items.find(
            (item) => item.id === selectedAttentionId,
          )
        : undefined,
    [selectedAttentionId, snapshot],
  );
  const selectedCaptureRouteActivity = useMemo(
    () =>
      selectedCapture && snapshot?.activity.kind === "ready"
        ? snapshot.activity.data.items.find(
            (item) =>
              item.activityType === "capture_routed" &&
              item.recordId === selectedCapture.id,
          )
        : undefined,
    [selectedCapture, snapshot],
  );
  const projectFullView = Boolean(
    surface === "projects" && activeContext.projectId !== undefined,
  );
  const inspectorDetailOpen = Boolean(
    selectedTask ||
    (selectedProject && !projectFullView) ||
    selectedWorkContextRecord ||
    selectedStrategicRecord ||
    selectedAttention ||
    (surface === "meetings" && meetingInspectorOpen) ||
    (isLibraryReading(surface) && documentInspectorOpen),
  );
  const dismissInspector = useCallback(() => {
    if (surface === "meetings") {
      setMeetingInspectorOpen(false);
      return;
    }
    if (isLibraryReading(surface)) {
      setDocumentInspectorOpen(false);
      // Bez tego wrzutka zostaje zaznaczona po Escape i wraca sama przy
      // następnym otwarciu szuflady, choć człowiek ją właśnie zamknął.
      setSelectedCaptureId(undefined);
      return;
    }
    setSelectedTaskId(undefined);
    setSelectedProjectId(undefined);
    setSelectedWorkContext(undefined);
    setSelectedStrategicId(undefined);
    setSelectedCaptureId(undefined);
    setSelectedAttentionId(undefined);
  }, [surface]);
  // Każdy inspector jest zamykalny Escape i oddaje fokus do obiektu, który go
  // otworzył. Poniżej 75rem działa jako drawer i dodatkowo przenosi fokus na
  // nagłówek; na szerokim ekranie fokus pozostaje w kolekcji do czasu jawnej
  // interakcji z panelem.
  const inspectorPanel = useDismissiblePanel({
    open: inspectorDetailOpen,
    onDismiss: dismissInspector,
    focusOnOpen: narrowShell,
  });
  const sourceCapture =
    selectedTask?.sourceCaptureId === undefined
      ? undefined
      : snapshot?.captures.find(
          (capture) => capture.id === selectedTask.sourceCaptureId,
        );
  const receipt =
    selectedTask === undefined ? undefined : receipts[selectedTask.id];
  const showFailure = (result: MutationFailure) => setNotice(result);
  // Whose voice this is and what it may do to a comment. One reading, shared
  // with the organization loader, which spelled out the same five steps until
  // the two copies were one edit away from disagreeing.
  const {
    currentPrincipalId,
    canComment,
    canResolve: canResolveComments,
  } = readCommentPermissions(snapshot?.access);
  // One shape for all nine comment writes — three on the project record and
  // three on each rail. Each RE-READS the list on success rather than patching
  // it: the version the write expected has just moved, and a list assembled
  // from the old one refuses the NEXT write with a version conflict nobody can
  // explain.
  // The target is passed IN rather than taken from the shell, because the
  // record screen answers for the project it opened and the rails answer for
  // whatever is selected — see `recordComment`.
  //
  // The ONLY path that answers false is a refused write. Once the write has
  // landed every path answers true, INCLUDING a re-read that throws: this
  // boolean is what clears the composer and closes the editor, so a false here
  // would leave the author's text sitting under a comment that DID post, and
  // the retry would double-post it. Nothing catches the read downstream either
  // — the panel attaches only `.then` — so the alternative is an uncaught
  // rejection.
  const settleCommentWrite = async (
    target: CommentTarget | undefined,
    result: MutationResult<unknown>,
    toast?: string,
  ): Promise<boolean> => {
    setCommentBusy(false);
    if (result.kind !== "success") {
      showFailure(result);
      return false;
    }
    if (client && snapshot && target !== undefined)
      try {
        const data = await loadComments(client, snapshot, target);
        setComments({ kind: "ready", data });
      } catch {
        // The list is one read behind until the next one lands, and that is the
        // whole cost.
      }
    if (toast !== undefined) pushToast({ message: toast });
    return true;
  };
  // Po odwracalnej mutacji toast niesie akcję „Cofnij”: świeży wpis na
  // szczycie timeline aktywności wskazuje polecenie, którego podgląd
  // cofnięcia otwiera istniejący UndoDialog.
  const refreshAfter = async (message: string) => {
    const previousHeadEventId =
      snapshot?.activity.kind === "ready"
        ? snapshot.activity.data.items[0]?.eventId
        : undefined;
    const next = await reloadSnapshot();
    const head =
      next?.activity.kind === "ready" ? next.activity.data.items[0] : undefined;
    const undoCommandId =
      head !== undefined &&
      head.eventId !== previousHeadEventId &&
      head.activityType !== "command_undone"
        ? head.targetCommandId
        : undefined;
    pushToast({
      message,
      ...(undoCommandId === undefined ? {} : { undoCommandId }),
    });
  };
  const refreshAfterWithoutUndo = async (message: string) => {
    await reloadSnapshot();
    pushToast({ message });
  };
  const writeWorkContextNarrative = () => {
    const record = selectedWorkContextRecord;
    const narrative = workContextNarrative?.trim();
    if (!client || !snapshot || record === undefined || !narrative) return;
    setProjectBusy(true);
    const target = { id: record.id, version: record.version };
    void (
      record.kind === "area"
        ? updateAreaResponsibility(client, snapshot, target, narrative)
        : updateInitiativeOutcome(client, snapshot, target, narrative)
    ).then(async (result) => {
      setProjectBusy(false);
      if (result.kind !== "success") {
        showFailure(result);
        return;
      }
      setWorkContextNarrative(undefined);
      await refreshAfter(
        record.kind === "area"
          ? "Responsibility saved."
          : "Intended outcome saved.",
      );
    });
  };
  const stageCommentAttachment = async () => {
    if (!client || !snapshot) return undefined;
    const result = await stageManagedAttachment(client, snapshot);
    if (result.kind !== "success") {
      if (result.message !== "No file was chosen.") showFailure(result);
      return undefined;
    }
    setState({ kind: "ready", snapshot: result.data.snapshot });
    return {
      sourceId: result.data.sourceId,
      original: result.data.original,
    };
  };
  const inspectManagedAttachment = async (
    attachment: DesktopSnapshot["tasks"][number]["attachments"][number],
  ): Promise<"available" | "unavailable"> => {
    if (!client?.inspectManagedPayload) return "unavailable";
    return client
      .inspectManagedPayload({
        captureId: attachment.captureId,
        original: attachment.original,
      })
      .then((result) => result.state)
      .catch(() => "unavailable");
  };
  const restoreManagedAttachment = async (
    attachment: DesktopSnapshot["tasks"][number]["attachments"][number],
  ): Promise<"available" | "unavailable"> => {
    if (!client?.restoreManagedPayload) return "unavailable";
    try {
      const result = await client.restoreManagedPayload({
        captureId: attachment.captureId,
        original: attachment.original,
      });
      if (result.state === "available") {
        await reloadSnapshot();
        pushToast({ message: "The attachment is available again." });
        return "available";
      }
    } catch {
      // The content-safe recovery below is the same for native and Hub errors.
    }
    showFailure({
      kind: "retry",
      message: "Could not fetch the attachment to this device yet. Try again.",
    });
    return "unavailable";
  };

  type AttentionItem = AttentionInboxProjection["items"][number];
  const openAttentionDestination = (item: AttentionItem) => {
    const destination = item.destination;
    if (destination.kind === "task") {
      const task = tasks.find(
        (candidate) => candidate.id === destination.taskId,
      );
      openContext(taskContext(destination.taskId, task?.title ?? item.title));
    } else if (destination.kind === "project") {
      const project =
        snapshot?.projects.kind === "ready"
          ? snapshot.projects.data.items.find(
              (candidate) => candidate.id === destination.projectId,
            )
          : undefined;
      openContext(
        projectContext(destination.projectId, project?.title ?? item.title),
      );
    } else if (destination.kind === "organization") {
      // Wzmianka na organizacji prowadzi na ekran Organizacji z zaznaczonym
      // rekordem. Bez tej gałęzi wpadałaby w `else` na końcu łańcucha i
      // otwierała HISTORIĘ WRZUTEK — cel bez związku z tym, w co się kliknęło,
      // i to bez ani jednego błędu kompilacji.
      setSelectedStrategicId(destination.organizationId);
      openContext(destinationContext("organizations", "Organizations"));
    } else if (destination.kind === "document") {
      openContext(destinationContext("notes", "Notes"));
    } else {
      openContext(destinationContext("captures", "Capture history"));
    }
    if (client && snapshot && item.state === "unread") {
      setAttentionBusy(true);
      void updateAttention(client, snapshot, item, "read").then(
        async (result) => {
          setAttentionBusy(false);
          if (result.kind === "success") await reload();
          else showFailure(result);
        },
      );
    }
  };
  const readAttention = (item: AttentionItem) => {
    if (!client || !snapshot) return;
    setAttentionBusy(true);
    void updateAttention(client, snapshot, item, "read").then(
      async (result) => {
        setAttentionBusy(false);
        if (result.kind === "success")
          await refreshAfter("Signal marked as read.");
        else showFailure(result);
      },
    );
  };
  const dismissAttention = (item: AttentionItem) => {
    if (!client || !snapshot) return;
    setAttentionBusy(true);
    void updateAttention(client, snapshot, item, "dismiss").then(
      async (result) => {
        setAttentionBusy(false);
        if (result.kind === "success")
          await refreshAfter("Signal removed from the inbox.");
        else showFailure(result);
      },
    );
  };
  const routeAttentionCapture = (
    item: AttentionItem,
    destination: "task" | "knowledge_source",
  ) => {
    if (!client || !snapshot || item.destination.kind !== "capture") return;
    setAttentionBusy(true);
    void routeCaptureException(
      client,
      snapshot,
      item.destination.captureId,
      destination,
    ).then(async (result) => {
      setAttentionBusy(false);
      if (result.kind === "success")
        await refreshAfter(
          destination === "task"
            ? "Capture filed as a task."
            : "Capture filed as a knowledge source.",
        );
      else showFailure(result);
    });
  };
  const retryAttentionCapture = (item: AttentionItem) => {
    if (!client || !snapshot) return;
    setAttentionBusy(true);
    void resolveCaptureException(client, snapshot, item, "retry").then(
      async (result) => {
        setAttentionBusy(false);
        if (result.kind === "success")
          await refreshAfter("Capture is back in the safe processing queue.");
        else showFailure(result);
      },
    );
  };
  const keepAttentionCapture = (item: AttentionItem) => {
    if (!client || !snapshot) return;
    setAttentionBusy(true);
    void resolveCaptureException(
      client,
      snapshot,
      item,
      "keep_unclassified",
    ).then(async (result) => {
      setAttentionBusy(false);
      if (result.kind === "success")
        await refreshAfter("Original kept without a forced classification.");
      else showFailure(result);
    });
  };
  const replaceAttentionPayload = (item: AttentionItem) => {
    if (!client?.selectCapturePayload || !snapshot) {
      pushToast({ message: "Choosing a file is unavailable right now." });
      return;
    }
    setAttentionBusy(true);
    void client.selectCapturePayload().then(async (selected) => {
      if (selected.outcome !== "success") {
        setAttentionBusy(false);
        if (selected.code !== "cancelled")
          pushToast({
            message: "Could not prepare a safe replacement file. Try again.",
          });
        return;
      }
      const result = await resolveCaptureException(
        client,
        snapshot,
        item,
        "replace_payload",
        selected.original,
      );
      setAttentionBusy(false);
      if (result.kind === "success")
        await refreshAfter("Original replaced and sent back for processing.");
      else showFailure(result);
    });
  };

  const openUndo = async (
    targetCommandId: Parameters<typeof previewUndo>[2],
  ) => {
    if (!client || !snapshot) return;
    setNotice(undefined);
    const result = await previewUndo(client, snapshot, targetCommandId);
    if (result.kind === "success") setUndoPreview(result.data);
    else showFailure(result);
  };

  const navKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;
    event.preventDefault();
    const buttons = [
      ...(navRef.current?.querySelectorAll<HTMLButtonElement>(
        ".nav-item, .nav-group-toggle",
      ) ?? []),
    ].filter((button) => button.closest("[hidden]") === null);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[nextIndex]?.focus();
  };

  const tabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    key: string,
  ) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;
    event.preventDefault();
    const current = navigation.tabs.findIndex((tab) => tab.key === key);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? navigation.tabs.length - 1
          : (current +
              (event.key === "ArrowRight" ? 1 : -1) +
              navigation.tabs.length) %
            navigation.tabs.length;
    const next = navigation.tabs[nextIndex];
    if (!next) return;
    setNavigation((value) => activateShellContext(value, next.key));
    window.requestAnimationFrame(() => {
      tabRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-shell-tab="${CSS.escape(next.key)}"]`,
        )
        ?.focus();
    });
  };

  if (state.kind === "loading")
    return (
      <main className="center-state" aria-busy="true">
        <BrandMark />
        <div className="loading-line" />
        <p>Opening the workspace…</p>
      </main>
    );
  if (state.kind === "recovery") {
    const reason =
      state.build.recoveryReason === "secure_storage_unavailable"
        ? "The system keychain is unavailable. Unlock the system and try again, or restore a verified backup."
        : state.build.recoveryReason === "protected_key_unavailable"
          ? "The protected workspace key is unavailable or damaged. Existing data was not replaced."
          : "The local workspace did not open safely. Constellation stopped before writing anything.";
    return (
      <main className="center-state recovery-required-state">
        <BrandMark />
        <p className="eyebrow">Workspace recovery</p>
        <h1>This data needs a safe restore</h1>
        <p>{reason}</p>
        <div>
          <button
            className="primary-button"
            onClick={() => setRecoveryOpen(true)}
          >
            Open recovery
          </button>
          <button
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Try opening again
          </button>
        </div>
        {recoveryOpen && client && (
          <Suspense fallback={null}>
            <WorkspaceRecovery
              client={client}
              workspaceName="Local workspace"
              recoveredPrevious={false}
              restoreOnly
              onClose={() => setRecoveryOpen(false)}
              onRestored={async () => window.location.reload()}
            />
          </Suspense>
        )}
      </main>
    );
  }
  if (state.kind !== "ready")
    return (
      <main className="center-state">
        <span className="state-symbol">!</span>
        <p className="eyebrow">Constellation</p>
        <h1>
          {state.kind === "unavailable"
            ? "The desktop bridge is unavailable"
            : "Could not open the workspace"}
        </h1>
        <p>{state.message}</p>
        <button
          className="secondary-button"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </main>
    );

  const { bootstrap, build, tasks } = state.snapshot;
  // The badge counts what the Tasks screen counts, and not what the inspector
  // reads. `snapshot.tasks` is `task.list`, which stops at a hundred: the
  // sidebar said "100" beside a screen saying "157 tasks" on a real workspace —
  // one number, two answers, a finger apart. `work.overview` is whole-Space and
  // uncapped, which is exactly why the Tasks screen stands on it.
  // WPISY #50 I #66 REJESTRU — PRAWA KRAWĘDŹ WIERSZA NAWIGACJI NIESIE LICZBĘ.
  //
  // Prototyp stawia prawostronnie wyrównaną liczbę przy prawie każdym module
  // (`v3/app.js:580-591`); tu stała przy DOKŁADNIE dwóch celach, i rejestr
  // dowiódł, że to nie jest chowanie zer — pod „Projects" widać zagnieżdżony
  // projekt, a wiersz „Projects" był pusty.
  //
  // TRZY REGUŁY, KTÓRE TA MAPA TRZYMA:
  //
  // 1. ŹRÓDŁO JEST TO SAMO, CO ŹRÓDŁO EKRANU POD CELEM. Projekty biorą
  //    `snapshot.projects` — ten sam odczyt, z którego rysuje się kolekcja
  //    i drugi poziom nawigacji. Cztery cele CRM biorą `snapshot.relationships`
  //    przez `countLiveRecords`, dzielący predykat z `indexRelationships`,
  //    czyli z indeksem, na którym stoją wszystkie cztery ekrany. Ekrany
  //    wiedzy biorą te same długości, co licznik paska widoku
  //    (`library/LibraryShell.tsx`, stała `count`) — od lotu D3 jest to
  //    JEDNA długość na ekran, a nie suma dokumentów i źródeł: cel jest
  //    trzema celami, więc adres z numerami wierszy wskazywałby dziś na kod,
  //    którego tam nie ma.
  // 2. NIEDOSTĘPNY ODCZYT NIE JEST ZEREM. Brak klucza znaczy „nie wiem" i wiersz
  //    nie rysuje wtedy NICZEGO. Zero w tym miejscu byłoby odpowiedzią „nie ma
  //    ani jednego" na pytanie, którego nie dało się zadać — to jest defekt,
  //    dla którego istnieje `readSlice` w `client/workflow.ts`.
  //    REGUŁA OBEJMUJE TEŻ `tasks`, I DOPIERO OD NAPRAWY PO PRZEGLĄDZIE. Wpis
  //    wypisany jako pierwszy był bezwarunkowy: przy niegotowym `work` schodził
  //    na `snapshot.tasks.length`, czyli na odczyt PRZYCIĘTY do stu, opisany
  //    w akapicie nad tą mapą jako sto obok stu pięćdziesięciu siedmiu. Wiersz
  //    podawał wtedy złą liczbę OBOK ekranu Zadań, który w tym samym stanie
  //    mówi, że nie dało się zapytać — czyli zdanie tej reguły było nieprawdą
  //    o kodzie pod nią, a kod przywracał wadę, przeciw której ta reguła stoi.
  // 3. `meetings` NIE MA TU WPISU I TO JEST ODMOWA Z POWODEM, nie przeoczenie.
  //    Spotkania nie są w migawce: stan kalendarza jest świadomie lokalny dla
  //    urządzenia i schodzi przez `client.getMeetingLoop`, z własną odmową
  //    uprawnienia. Licznik przy tym celu wymagałby odczytu kalendarza przy
  //    starcie okna, dla wszystkich, także dla tych, którzy dostępu nie dali.
  const strategicRecords =
    state.snapshot.relationships.kind === "ready"
      ? state.snapshot.relationships.data.records
      : undefined;
  const navCounts: Partial<Record<SurfaceId, number>> = {
    ...(state.snapshot.work.kind === "ready"
      ? { tasks: state.snapshot.work.data.tasks.length }
      : {}),
    ...(state.snapshot.projects.kind === "ready"
      ? { projects: state.snapshot.projects.data.items.length }
      : {}),
    ...(strategicRecords === undefined
      ? {}
      : {
          pipeline: countLiveRecords(strategicRecords, "opportunity"),
          organizations: countLiveRecords(strategicRecords, "organization"),
          people: countLiveRecords(strategicRecords, "person"),
          renewals: countLiveRecords(strategicRecords, "renewal"),
        }),
    ...(state.snapshot.documents.kind === "ready" &&
    state.snapshot.knowledge.kind === "ready"
      ? {
          library:
            state.snapshot.documents.data.items.length +
            state.snapshot.knowledge.data.sources.length,
        }
      : {}),
  };
  const isPreview = build.channel === "developer-preview";
  // KTO CZYTA — jedyna rzecz, jaką stopka paska bocznego ma powiedzieć
  // (`v3/app.js:660-664`). Odczyt jest już w migawce powłoki, więc to nie jest
  // nowe zapytanie ani nowa zdolność; `undefined` znaczy „nie dało się
  // zapytać" i rysuje NIC, a nie zastępnik. Reguła zeszła do
  // `viewer-identity.ts` w locie L3, bo powitanie na Dzisiaj pyta o TO SAMO.
  const viewerName = viewerDisplayName(state.snapshot.access);
  const coordinatedDataHome =
    state.snapshot.dataHome?.descriptor.providerKind === "coordinated";
  // DRUGA LINIA KAFLA — MIEJSCE, SEPARATOR, STAN. Cztery gałęzie i ich powody
  // stoją przy `workspaceStorageLine` na poziomie modułu; bramka układu widzi
  // stąd wyłącznie tę jedną, w którą wpada podgląd deweloperski, a pozostałe
  // trzy mierzy `test/shell-storage-line.interaction.test.ts`.
  const storageLine = workspaceStorageLine(
    state.snapshot.dataHome,
    build.persistence,
  );
  // Product-owner correction (2026-07-18): the work plane owns the available
  // width until a deliberate record selection opens the inspector. The panel
  // remains the single detail plane, but it never consumes an empty column.
  // Jedno miejsce, w którym powstaje pozycja nawigacji. Wcześniej ten blok
  // istniał wyłącznie WEWNĄTRZ pętli po grupach, więc cel bez modułu
  // (`group: null` — pozycje dnia, Access, Settings) nie renderował się
  // w ogóle: był w rejestrze, miał skrót i trasę, a w sidebarze go nie było.
  // DRUGI POZIOM LEWEJ KOLUMNY (`v3/app.css:240-260`). Wiersze potomne CELOWO
  // nie niosą `data-surface`: sonda wierności buduje swój przelot
  // z `.nav-item[data-surface]` i KLIKA każdy, więc potomek z tym atrybutem
  // po cichu wydłużyłby jej spacer i zmienił to, co skanuje, bez ani jednej
  // czerwonej asercji. Rozpoznaje je `data-nav-level="child"`.
  //
  // `tabIndex={-1}` jest tu regułą sidebara, nie wyjątkiem: pozycje nawigacji
  // chodzą strzałkami (`navKeyDown` zbiera `.nav-item`), a przystankiem Tab
  // jest wyłącznie ta aktywna. Potomek nie dokłada więc ani jednego przystanku
  // — a sonda ogniska robi 14 Tabów od świeżej strony i liczy na kolejność.
  const openProjectId = activeContext.projectId;
  const projectItems =
    state.snapshot.projects.kind === "ready"
      ? state.snapshot.projects.data.items
      : [];
  const firstProjectShortcuts = projectItems.slice(0, 5);
  const openProject =
    openProjectId === undefined
      ? undefined
      : projectItems.find((project) => project.id === openProjectId);
  const projectNavShortcuts =
    openProject !== undefined &&
    !firstProjectShortcuts.some((project) => project.id === openProject.id)
      ? [...firstProjectShortcuts.slice(0, 4), openProject]
      : firstProjectShortcuts;
  //
  // ŹRÓDŁEM JEST `snapshot.projects`, czyli `project.list` — ten sam odczyt,
  // który rysuje kolekcja po kliknięciu w cel (`ProjectsSurface`), a nie
  // `work.overview.projects`. Nie jest to wybór estetyczny: pierwsza wersja
  // czytała `work`, bramka pokazała ZERO wierszy potomnych, i dopiero pomiar
  // fikstury powiedział dlaczego — `work.overview.projects` jest w niej pustą
  // tablicą, a `project.list` niesie jeden projekt. Drugi poziom, który
  // wymienia inne projekty niż ekran pod nim, byłby wadą, nie oszczędnością.
  const projectNavChildren =
    projectItems.length > 0 ? (
      <div
        className="nav-children"
        data-nav-children="projects"
        key="projects-children"
      >
        {projectNavShortcuts.map((project) => (
          <button
            key={project.id}
            type="button"
            data-nav-level="child"
            data-project-shortcut
            className={`nav-item nav-child ${openProjectId === project.id ? "active" : ""}`}
            tabIndex={-1}
            aria-current={openProjectId === project.id ? "page" : undefined}
            {...navHandlers(projectContext(project.id, project.title))}
          >
            <span className="nav-child-dot" aria-hidden="true" />
            <span>{project.title}</span>
          </button>
        ))}
        {projectItems.length > projectNavShortcuts.length && (
          <button
            type="button"
            data-nav-level="child"
            className="nav-item nav-child nav-child-more"
            tabIndex={-1}
            {...navHandlers(destinationContext("projects", "Projects"))}
          >
            <span className="nav-child-dot" aria-hidden="true" />
            <span>View all {projectItems.length} projects</span>
          </button>
        )}
      </div>
    ) : null;
  // DRUGI POZIOM MA DWIE GAŁĘZIE, NIE JEDNĄ (`v3/app.js:637-641`: prototyp
  // rysuje `.nav-views` POD Zadaniami i POD Projektami, tym samym elementem).
  // Aplikacja miała tylko projektową, więc drzewo nawigacji różniło się od
  // prototypu STRUKTURĄ, a nie zawartością fikstury — jedyny cel z zapisanymi
  // widokami nie pokazywał ani jednego, choć ekran pod nim wymienia je
  // w kontrolce „View".
  //
  // WIERSZ, KTÓRY OTWIERA WIDOK, A NIE TYLKO EKRAN. Widok był do tej pory
  // wyłącznie stanem lokalnym `TasksSurface`, więc wiersz potomny prowadzący
  // na „All work" byłby afordancją bez celu — w tym repozytorium nazwana klasa
  // defektu („zdolność, której nic nie montuje"). Dlatego kontekst niesie
  // `savedViewId` (`client/shell-navigation.ts`), tą samą drogą co odczyt
  // Biblioteki i kategoria Ustawień.
  //
  // ODFILTROWANE PO `state`, tak samo jak w kontrolce ekranu: widok wycofany
  // stoi dalej w projekcji, a lewa kolumna nie jest archiwum.
  //
  // `data-nav-children` NAZYWA RODZICA, i to jest wymóg pomiaru, nie ozdoba:
  // `[data-nav-level="child"]` liczy oba drugie poziomy naraz i jest zielone
  // od JEDNEGO projektu, więc bez tego atrybutu żadna asercja nie odróżnia
  // „drzewo ma drugi poziom" od „drzewo ma drugi poziom POD ZADANIAMI".
  //
  // `+ New view` Z PROTOTYPU TU NIE MA i to jest ODMOWA, nie przeoczenie:
  // tworzenie widoku mieszka w `SavedViewManager` obok kontrolki, która go
  // otwiera, a przycisk w nawigacji musiałby albo powtórzyć ten zapis drugi
  // raz, albo prowadzić donikąd. Wpis rejestru przejścia, który go opisuje
  // (P-8), jest wpisem OSOBNYM od tego (P-10) i nie został temu lotowi dany.
  const savedViewNavChildren =
    state.snapshot.work.kind === "ready" &&
    state.snapshot.work.data.savedViews.some(
      (view) => view.state === "active",
    ) ? (
      <div
        className="nav-children"
        data-nav-children="tasks"
        key="tasks-children"
      >
        {state.snapshot.work.data.savedViews
          .filter((view) => view.state === "active")
          .map((view) => {
            const open =
              surface === "tasks" && activeContext.savedViewId === view.id;
            return (
              <button
                key={view.id}
                type="button"
                data-nav-level="child"
                className={`nav-item nav-child ${open ? "active" : ""}`}
                tabIndex={-1}
                aria-current={open ? "page" : undefined}
                {...navHandlers(tasksSavedViewContext(view.id))}
              >
                <span className="nav-child-dot" aria-hidden="true" />
                <span>{view.name}</span>
              </button>
            );
          })}
      </div>
    ) : null;
  // Kiedy otwarty jest REKORD projektu, „bieżącą stroną" jest ten projekt,
  // a nie kolekcja nad nim. Bez tego w jednej nawigacji stałyby dwa
  // `aria-current="page"`, które przeczą sobie nawzajem. Przystanek Tab
  // ZOSTAJE na wierszu celu — inaczej nawigacja nie miałaby ani jednego.
  //
  // WARUNEK MUSI BYĆ TEN SAM, CO WARUNEK ZASTĘPSTWA, i pierwsza wersja tego
  // nie miała: zerowała bieżącą stronę BEZWARUNKOWO przy otwartym rekordzie,
  // a wiersz potomny, który miał ją przejąć, rysuje się tylko poza trybem
  // szyny i tylko gdy odczyt projektów jest gotowy i niepusty. W trybie szyny
  // z otwartym rekordem nawigacja nie miała więc ANI JEDNEGO
  // `aria-current="page"` — regresja dostępności wobec stanu sprzed tego lotu,
  // zmierzona przy 800 px. Dwa warunki opisujące jedno zjawisko rozjeżdżają
  // się przy pierwszej zmianie któregokolwiek; tu jest jeden.
  const openProjectHasNavChild =
    !railMode &&
    surface === "projects" &&
    openProjectId !== undefined &&
    state.snapshot.projects.kind === "ready" &&
    state.snapshot.projects.data.items.some(
      (project) => project.id === openProjectId,
    );
  const currentNavId = openProjectHasNavChild ? undefined : surface;
  // DRUGI NOŚNIK STANU „TU JESTEŚ" MA JEDNO ŹRÓDŁO, TAK SAMO JAK PIERWSZY.
  // Pierwsza wersja tego lotu wpisywała warunek `data-nav-open` WPROST
  // w `navEntry`, więc wiersz grupy dostawał podbarwienie, szynę i akcentowany
  // glif, a ulubiony skrót do tego samego celu jeden blok wyżej nie dostawał
  // niczego — czyli dokładnie ten nieoznaczony wiersz bieżący, który ten lot
  // istnieje, żeby zamknąć, odtworzony o sekcję wyżej. Oba nośniki czytają
  // teraz tę samą nazwę. UWAGA DLA NASTĘPNEGO: harness bramki układu NIE
  // zasiewa `constellation.favorites`, więc pas ulubionych nie rysuje się tam
  // ani razu i tej połowy poprawki NIE MIERZY ani jedna para.
  const navOpenId: SurfaceId | undefined = openProjectHasNavChild
    ? "projects"
    : undefined;
  const navEntry = (item: (typeof navItems)[number]) => {
    const shortcutHint = surfaceShortcutHint(item);
    // DECYZJA #35, W JEDNEJ LINII: skrót przestaje istnieć WYŁĄCZNIE w tooltipie.
    // Klawisz stoi dziś w trzech miejscach i żadne z nich nie dociera do
    // czytnika ekranu — `title` wymaga najechania, `<kbd>` obok jest
    // `aria-hidden`, a dymek trybu rail rysuje się tylko przy zwiniętej
    // kolumnie. Tooltip ZOSTAJE, bo dla myszy jest właściwą afordancją; to
    // fakt, a nie tooltip, ma być osiągalny drugą drogą.
    const shortcutName =
      shortcutHint.kind === "direct"
        ? shortcutHint.keys
        : `through the palette, ${shortcutHint.keys}`;
    // NAZWA DOSTĘPNA NIESIE TĘ SAMĄ LICZBĘ, CO WIERSZ. Meta wiersza jest
    // `aria-hidden`, więc bez tego czytnik ekranu nie dowiaduje się o liczniku
    // NICZEGO — tak było przez cztery fale dla wszystkiego poza Zadaniami.
    const navCount = navCounts[item.id];
    const itemName =
      item.id === "inbox" && inboxWaiting > 0
        ? `${item.label} · ${inboxWaiting} waiting`
        : navCount === undefined
          ? item.label
          : `${item.label} · ${navCount}`;
    return (
      <div className="nav-entry" key={item.id}>
        <button
          data-surface={item.id}
          // CEL NADRZĘDNY OTWARTEGO REKORDU DALEJ MÓWI „TU JESTEŚ", TYLKO NIE
          // BIERZE NA TO `aria-current`. Prototyp stawia bieżącą stronę na
          // obu wierszach naraz (`v3/app.js:573` — trasa `project` zapala też
          // cel `projects`), więc pod otwartym projektem świecą tam rodzic
          // i dziecko. Rozstrzygnięcie niżej — jedno `aria-current` w jednej
          // nawigacji — ZOSTAJE, bo dotyczy tego, co czyta czytnik ekranu.
          // Rozjeżdżała się z prototypem sama FARBA, i to ona dostaje tu
          // własny nośnik: `styles.css` maluje `[data-nav-open]` dokładnie tak
          // jak `.active`, z tą samą wagą, więc rodzic dziedziczy wszystkie
          // remisy tej kolumny (hover, wciśnięcie) bez własnych wyjątków.
          data-nav-open={navOpenId === item.id ? "" : undefined}
          // MALOWANIE IDZIE ZA `currentNavId`, PRZYSTANEK TAB ZA `surface`,
          // i ten rozjazd jest zamierzony. Przy otwartym rekordzie projektu
          // wiersz potomny przejmuje bieżącą stronę, więc rodzic przestaje
          // wyglądać na aktywny — inaczej w jednej kolumnie stały DWA wiersze
          // pomalowane akcentem, a skrót `⌘5` gasł na tym, który wyglądał na
          // bieżący (zmierzone). Przystanek Tab zostaje na rodzicu, bo potomek
          // ma `tabIndex={-1}` i nawigacja bez tego nie miałaby ani jednego.
          className={`nav-item ${currentNavId === item.id ? "active" : ""}`}
          tabIndex={surface === item.id ? 0 : -1}
          aria-label={`${itemName}, ${shortcutName}`}
          aria-current={currentNavId === item.id ? "page" : undefined}
          title={
            railMode
              ? undefined
              : shortcutHint.kind === "direct"
                ? `${item.label} · ${shortcutHint.keys}`
                : `${item.label} · via palette ${shortcutHint.keys}`
          }
          onFocus={(event) => {
            setFocusedNavItemId(item.id);
            preloadSurface(item.id);
            showRailTip(event.currentTarget, item.label, shortcutHint);
          }}
          onBlur={hideRailTip}
          onMouseEnter={(event) => {
            preloadSurface(item.id);
            showRailTip(event.currentTarget, item.label, shortcutHint);
          }}
          onMouseLeave={hideRailTip}
          {...navHandlers(destinationContext(item.id, item.label))}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
          <span className="nav-item-meta" aria-hidden="true">
            {item.id === "inbox" && inboxWaiting > 0 ? (
              <span className="nav-count nav-count--attention">
                {inboxWaiting}
              </span>
            ) : navCount === undefined ? null : (
              <span className="nav-count" data-nav-count>
                {navCount}
              </span>
            )}
            <kbd
              className={
                shortcutHint.kind === "palette"
                  ? "nav-palette-shortcut"
                  : undefined
              }
            >
              {shortcutHint.keys}
              {shortcutHint.kind === "palette" ? "…" : ""}
            </kbd>
          </span>
        </button>
        <button
          type="button"
          className="nav-favorite-toggle"
          tabIndex={
            focusedNavItemId === item.id || surface === item.id ? 0 : -1
          }
          aria-label={`${favorites.includes(item.id) ? "Remove" : "Add"} ${item.label} ${favorites.includes(item.id) ? "from" : "to"} favorites`}
          aria-pressed={favorites.includes(item.id)}
          onClick={() =>
            setFavorites((current) =>
              current.includes(item.id)
                ? current.filter((id) => id !== item.id)
                : [...current, item.id],
            )
          }
        >
          {favorites.includes(item.id) ? "★" : "☆"}
        </button>
      </div>
    );
  };

  // Dyspozytor ekranów. Do PR 6 był to płaski łańcuch dwunastu
  // `{surface === "x" && …}` rozciągnięty na ~600 linii: żeby dołożyć ekran,
  // trzeba było znaleźć właściwe miejsce w środku pliku, a żeby sprawdzić,
  // co się renderuje dla danego celu — przeczytać wszystkie dwanaście.
  //
  // Mapa jest TOTALNA nad `DesktopSurface`, więc nowy cel w rejestrze wywala
  // build do czasu podpięcia ekranu — zamiast renderować pusty panel. Wpisy
  // są funkcjami, nie elementami: inaczej każdy ekran liczyłby swój JSX przy
  // każdym renderze powłoki, także ten, którego nikt nie ogląda.
  // DECYZJA #22: liczba z boku znaczy „tyle rzeczy na mnie czeka", a nie „tyle
  // rzeczy jednego rodzaju". Bierze się z TEJ SAMEJ funkcji, co podział ekranu
  // — drugie liczenie tej samej rzeczy było defektem, z którego ta decyzja
  // powstała. Skutek do zapamiętania: przeczytanie sygnału NIE zmniejsza
  // liczby, bo przeczytana rzecz dalej czeka; zmniejsza ją dopiero odrzucenie.
  const inboxWaiting =
    state.snapshot.attention.kind === "ready"
      ? inboxWaitingCount(state.snapshot.attention.data.items)
      : 0;

  // Attaching and detaching the project's client, named once because two
  // places now offer the operation: the context card the collection still
  // shows, and the record screen's rail. Two copies of a mutation drift on the
  // first change to either — this repo has a name for that family.
  const attachProjectClient = (organizationId: StrategicRecordId): void => {
    if (!client || !projectOverview) return;
    setProjectBusy(true);
    void linkProjectClient(
      client,
      state.snapshot,
      projectOverview.project,
      organizationId,
    ).then(async (result) => {
      setProjectBusy(false);
      if (result.kind === "success")
        await refreshAfter("Client linked to the project.");
      else showFailure(result);
    });
  };
  // Detaching reloads the whole snapshot like every other write here, which is
  // what re-derives both the client list and the candidate set — the link
  // record the command needs lives in that snapshot, not in session state.
  const detachProjectClient = (organizationId: StrategicRecordId): void => {
    if (!client || !projectOverview) return;
    setProjectBusy(true);
    void unlinkProjectClient(
      client,
      state.snapshot,
      projectOverview.project.id,
      organizationId,
    ).then(async (result) => {
      setProjectBusy(false);
      if (result.kind === "success") await refreshAfter("Client link removed.");
      else showFailure(result);
    });
  };

  // The project as `project.list` carries it. The record header reads health
  // through `readProject`, which needs the `updatedAt` only that slice
  // projects — `project.operationalOverview` does not carry it, so a header
  // built from the overview alone would have to invent the reading the
  // collection already made.
  const recordProject =
    activeContext.projectId !== undefined &&
    state.snapshot.projects.kind === "ready"
      ? state.snapshot.projects.data.items.find(
          (item) => item.id === activeContext.projectId,
        )
      : undefined;
  const recordProse = {
    timeZone: state.snapshot.bootstrap.workspace.timezone,
    todayKey: dateKeyInZone(
      new Date(),
      state.snapshot.bootstrap.workspace.timezone,
    ),
  };
  // The opened TASK, read from `work.overview` and not from `task.list`. The
  // overview is whole-Space and uncapped while the query pages at fifty or a
  // hundred — the pairing that already put "100" in the sidebar beside "157
  // tasks" on the screen. A record opened from the uncapped list must not fail
  // to open because the capped one stopped short of it.
  const recordTask =
    activeContext.record === true &&
    activeContext.taskId !== undefined &&
    state.snapshot.work.kind === "ready"
      ? state.snapshot.work.data.tasks.find(
          (item) => item.id === activeContext.taskId,
        )
      : undefined;
  // The opened DEAL. Finding it is the mount's gate, exactly as it is for the
  // task record: a screen that could not find its own record would have to
  // invent a state the surface already has one for — and Pipeline's slot draws
  // that state, saying what is missing rather than showing a board that ignores
  // the request.
  //
  // No `record === true` beside the id, and that asymmetry with `recordTask` is
  // the point: eleven call sites build a task context meaning "take me to this
  // task", so the promotion there is opt-in. Every opportunity context in this
  // program means the record, which is why `opportunityContext` is the only one
  // that builds them and why carrying the id IS the request.
  const recordOpportunity =
    activeContext.opportunityId !== undefined &&
    state.snapshot.relationships.kind === "ready"
      ? state.snapshot.relationships.data.records.find(
          // The KIND is tested inside the predicate rather than after it: an
          // id alone does not say what it names, and a context restored from
          // device state carries an id this session never resolved. A cast
          // after a bare id match would hand the screen a Person.
          (item): item is Extract<typeof item, { kind: "opportunity" }> =>
            item.kind === "opportunity" &&
            item.id === activeContext.opportunityId,
        )
      : undefined;
  // Whether the shell's comment slice is the one THIS record asked for. The
  // effect that follows the active context into `selectedTaskId` runs after the
  // commit, so there is one painted frame in which the record is the newly
  // opened task and the slice still holds the previous one's threads — and a
  // write in that frame would carry the previous task's version. Reusing the
  // shell's target is the point; checking that it is this record's is the price.
  const recordTaskCommentsMatch =
    recordTask !== undefined &&
    commentTarget?.kind === "task" &&
    commentTarget.taskId === recordTask.id;
  const actorOf = buildActorResolver(
    state.snapshot.agentAccess.kind === "ready"
      ? state.snapshot.agentAccess.data
      : undefined,
  );
  const mentionNameOf = buildMentionResolver(
    state.snapshot.mentionCandidates.kind === "ready"
      ? state.snapshot.mentionCandidates.data
      : undefined,
    currentPrincipalId,
  );
  // The reader is taken out of their own picker: a comment does not wake
  // anyone, a mention does, and naming yourself would be a chip that reaches an
  // Inbox you are already reading.
  const commentMentionCandidates =
    state.snapshot.mentionCandidates.kind === "ready"
      ? state.snapshot.mentionCandidates.data.candidates.filter(
          (candidate) => candidate.principalId !== currentPrincipalId,
        )
      : [];
  // Ta sama projekcja PRZED odsianiem czytelnika — znacznik autora
  // w kompozytorze potrzebuje dokładnie tego, co odsiewa linijka wyżej
  // (rejestr, wpis #58). Nazwa jest tu prawdziwa albo jej nie ma; nic się
  // nie zmyśla.
  const currentDisplayName =
    state.snapshot.mentionCandidates.kind === "ready"
      ? state.snapshot.mentionCandidates.data.candidates.find(
          (candidate) => candidate.principalId === currentPrincipalId,
        )?.displayName
      : undefined;

  // TRZY WPISY MAPY POWIERZCHNI, JEDEN BLOK JSX (lot D3). Notatki, Źródła
  // i Historia wrzutek dostały własne pozycje nawigacji, ale wiszą na tym samym
  // komponencie i na tym samym okablowaniu (szuflada, paleta, aktywacja
  // encji), więc trzy kopie tego bloku byłyby przepisanym kształtem w trzech
  // miejscach — nazwana klasa defektu w tym repozytorium. Różni je JEDEN
  // argument, i to jest dokładnie ta różnica, którą rozdział wprowadził.
  //
  // ETYKIETY GRANICY I STANU ŁADOWANIA IDĄ Z REJESTRU POWIERZCHNI, czyli
  // z tego samego napisu, co pozycja nawigacji i (przez `library-readings.ts`)
  // `h1` ekranu: „Loading Library…" nad ekranem, który po załadowaniu nazywa
  // się „Sources", byłby trzecią nazwą tej samej rzeczy w jednej sekundzie.
  // Z REJESTRU, A NIE Z `libraryReadingLabel`, i to jest wymóg budowy, nie gust:
  // tamten słownik mieszka w `src/library/`, czyli w leniwym chunku, a import
  // WARTOŚCI stamtąd wciągnąłby go na ścieżkę gorącą (pułapka zapisana
  // w `client/shell-navigation.ts` pomiarem na bajtach).
  const knowledgeSurfacePanel = (reading: LibraryReading) => (
    <LazySurfaceBoundary label={desktopSurfaceLabel(reading)}>
      <Suspense
        fallback={<SurfaceLoadingState label={desktopSurfaceLabel(reading)} />}
      >
        <KnowledgeSurface
          client={client}
          snapshot={state.snapshot}
          activeDocumentId={activeContext.documentId}
          reading={reading}
          inspectorHost={documentInspectorHost}
          onInspectorOpen={(kind) => {
            setDocumentInspectorKind(kind);
            setDocumentInspectorOpen(true);
          }}
          // TA SAMA PALETA, CO POD `⌘K` I POD KONTROLKĄ W SZYNIE — jedno
          // wywołanie, trzy afordancje. Własne pole wyszukiwania w paśmie
          // Biblioteki byłoby DRUGĄ wyszukiwarką o innym zasięgu niż ta
          // z powłoki; prototyp stawia tam przycisk otwierający paletę
          // (`act: "palette"`, `v3/screens/knowledge.js:803`).
          onOpenSearch={() => setSearchOpen(true)}
          captureHistory={{
            selectedCaptureId,
            ...(selectedCaptureRouteActivity?.targetCommandId === undefined
              ? {}
              : {
                  undoCommandId: selectedCaptureRouteActivity.targetCommandId,
                }),
            busy:
              selectedCapture !== undefined &&
              historyBusyCaptureId === selectedCapture.id,
            onSelectCapture: selectCaptureInInspector,
            onUndo: (id) => void openUndo(id),
            onDeleteVoiceAudio: (captureId, version) => {
              if (!client) return;
              setHistoryBusyCaptureId(captureId);
              void requestVoiceAudioDeletion(
                client,
                state.snapshot,
                captureId,
                version,
              ).then(async (result) => {
                setHistoryBusyCaptureId(undefined);
                if (result.kind === "success")
                  await refreshAfter("The kept audio was deleted.");
                else showFailure(result);
              });
            },
          }}
          onEntityActivate={(target) => {
            if (target.targetKind === "task") {
              const task = state.snapshot.tasks.find(
                (item) => item.id === target.targetId,
              );
              openContext(
                taskContext(target.targetId as TaskId, task?.title ?? "Task"),
              );
              return;
            }
            if (target.targetKind === "project") {
              const project =
                state.snapshot.projects.kind === "ready"
                  ? state.snapshot.projects.data.items.find(
                      (item) => item.id === target.targetId,
                    )
                  : undefined;
              openContext(
                projectContext(
                  target.targetId as ProjectId,
                  project?.title ?? "Project",
                ),
              );
              return;
            }
            if (
              target.targetKind === "person" ||
              target.targetKind === "organization"
            ) {
              setSelectedStrategicId(target.targetId as StrategicRecordId);
              openContext(destinationContext("organizations", "Organizations"));
              return;
            }
            setSelectedMeetingId(target.targetId);
            openContext(destinationContext("meetings", "Meetings"));
          }}
          onReload={reload}
          onFailure={showFailure}
        />
      </Suspense>
    </LazySurfaceBoundary>
  );

  const contextRecordPanel =
    client !== undefined &&
    (activeContext.areaId !== undefined ||
      activeContext.initiativeId !== undefined) ? (
      <Suspense fallback={<p className="capacity-note">Opening the record…</p>}>
        <WorkContextRecordHost
          client={client}
          snapshot={state.snapshot}
          {...(activeContext.areaId === undefined
            ? {}
            : { areaId: activeContext.areaId })}
          {...(activeContext.initiativeId === undefined
            ? {}
            : { initiativeId: activeContext.initiativeId })}
          onBack={() => openContext(destinationContext("projects", "Projects"))}
          onOpenTask={(taskId) => {
            const task = state.snapshot.tasks.find(
              (item) => item.id === taskId,
            );
            openContext(
              taskContext(taskId, task?.title ?? "Task", { record: true }),
            );
          }}
          onOpenProject={(projectId) => {
            const project =
              state.snapshot.projects.kind === "ready"
                ? state.snapshot.projects.data.items.find(
                    (item) => item.id === projectId,
                  )
                : undefined;
            openContext(projectContext(projectId, project?.title ?? "Project"));
          }}
          onWrote={refreshAfter}
          onWroteWithoutUndo={refreshAfterWithoutUndo}
          onFailure={showFailure}
        />
      </Suspense>
    ) : undefined;

  const surfacePanels: Record<SurfaceId, () => ReactNode> = {
    today: () => (
      <TodaySurface
        client={client}
        snapshot={state.snapshot}
        selectedTaskId={selectedTaskId}
        planBusyTaskId={busyTaskId}
        onOpenTask={(id) => {
          const task = tasks.find((item) => item.id === id);
          openContext(taskContext(id, task?.title ?? "Task"));
        }}
        onSelectTask={selectTaskInInspector}
        // Prawy koniec nagłówka sekcji terminów (wpis #6) prowadzi tam, gdzie
        // prowadzi prototyp — do Kalendarza. Ta sama droga, co pozycja
        // nawigacji: jeden `destinationContext`, więc otwarcie z Dzisiaj
        // podmienia tę samą zakładkę, co kliknięcie w lewej kolumnie.
        onOpenCalendar={() =>
          openContext(destinationContext("calendar", "Calendar"))
        }
        onPlanForToday={(id) => {
          const task = tasks.find((item) => item.id === id);
          if (!client || !task) return;
          const planTimeZone = state.snapshot.bootstrap.workspace.timezone;
          const startAt = instantForZonedDate(
            dateKeyInZone(new Date(), planTimeZone),
            planTimeZone,
            "start",
          );
          if (startAt === undefined) return;
          setBusyTaskId(id);
          // Planowanie ustawia `startAt` i NIE rusza terminu. Różnica między
          // „zajmę się tym w środę" a „obiecuję to na środę" jest cała
          // w danych — na ekranie wygląda identycznie.
          void updateTaskDetails(client, state.snapshot, id, task.version, {
            startAt,
          }).then(async (result) => {
            setBusyTaskId(undefined);
            if (result.kind === "success")
              await refreshAfter("Planned for today.");
            else showFailure(result);
          });
        }}
      />
    ),
    calendar: () => (
      <LazySurfaceBoundary label="Calendar">
        <Suspense fallback={<SurfaceLoadingState label="Calendar" />}>
          <CalendarSurface
            client={client}
            snapshot={state.snapshot}
            selectedTaskId={selectedTaskId}
            planBusyTaskId={busyTaskId}
            onSelectTask={selectTaskInInspector}
            onOpenTask={(id) => {
              const task = tasks.find((item) => item.id === id);
              openContext(taskContext(id, task?.title ?? "Task"));
            }}
            onPlanTaskOnDay={(id, dayKey) => {
              const task = tasks.find((item) => item.id === id);
              if (!client || !task) return;
              const startAt = instantForZonedDate(
                dayKey,
                state.snapshot.bootstrap.workspace.timezone,
                "start",
              );
              if (startAt === undefined) return;
              setBusyTaskId(id);
              // Ta sama zasada co na Today: dzień to PLAN, nie obietnica.
              // `dueAt` nie pojawia się w ładunku nawet jako `null`.
              void updateTaskDetails(client, state.snapshot, id, task.version, {
                startAt,
              }).then(async (result) => {
                setBusyTaskId(undefined);
                if (result.kind === "success")
                  await refreshAfter("Planned for that day.");
                else showFailure(result);
              });
            }}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    meetings: () =>
      client === undefined ? null : (
        <LazySurfaceBoundary label="Meetings">
          <Suspense fallback={<SurfaceLoadingState label="Meetings" />}>
            <MeetingsSurface
              client={client}
              activeMeetingId={selectedMeetingId}
              inspectorHost={meetingInspectorHost}
              onInspectorOpen={() => setMeetingInspectorOpen(true)}
              onMeetingSelected={setSelectedMeetingId}
              /* GDZIE STOI KONFIGURACJA JAMIE (wpis 10-1, lot L6). Formularz
                 zszedł z tego ekranu do Ustawień, więc akcja pasma „Import from
                 Jamie" bez zapisanego klucza otwiera TĘ kategorię Ustawień,
                 zamiast przewijać do tafli, której na tym ekranie już nie ma.
                 `openSettingsCategory`, a nie gołe przejście na powierzchnię:
                 Ustawienia są trybem powłoki i mają jedną drogę wejścia
                 (`RealApp.tsx:5574-5579` mówi to wprost). */
              onOpenConnections={() => openSettingsCategory("access")}
              /* „Open Sources →" na prawym końcu nagłówka sekcji odbytych spotkań
                 („What is left of the ones that happened"; do ogona Fazy III
                 nagłówek nazywał się „Jamie results" — wpis 10-2)
                 (wpis #65). Od lotu D3 to jest zwykłe przejście na cel
                 `sources`, a etykieta zgadza się z pozycją nawigacji, na którą
                 prowadzi — do tego lotu prowadziła na cel „Library" i mówiła
                 „Sources", bo Źródła były zakładką wewnątrz. Precedens:
                 `onOpenCalendar` na Dzisiaj (wpis #6). */
              onOpenSources={() =>
                openContext(destinationContext("sources", "Sources"))
              }
            />
          </Suspense>
        </LazySurfaceBoundary>
      ),
    organizations: () => (
      <LazySurfaceBoundary label="Organizations">
        <Suspense fallback={<SurfaceLoadingState label="Organizations" />}>
          {activeOrganizationId === undefined ? (
            <StrategicDepthSurface
              client={client}
              snapshot={state.snapshot}
              selectedRecordId={selectedStrategicId}
              onSelectRecord={selectStrategicInInspector}
              onOpenOrganization={(id, name) =>
                openContext(organizationContext(id, name))
              }
              onReload={reload}
              onFailure={showFailure}
            />
          ) : (
            <OrganizationContextLoader
              client={client}
              snapshot={state.snapshot}
              organizationId={activeOrganizationId}
              // The same flag the Project page's client row uses: this is
              // the same edge authored from the other end, and the two
              // contexts are never open at once.
              linkBusy={projectBusy}
              onLinkDelivery={(projectId) => {
                if (!client) return;
                setProjectBusy(true);
                void linkOrganizationDelivery(
                  client,
                  state.snapshot,
                  activeOrganizationId,
                  projectId,
                ).then(async (result) => {
                  setProjectBusy(false);
                  if (result.kind === "success")
                    await refreshAfter("Project linked to the client.");
                  else showFailure(result);
                });
              }}
              onUnlinkDelivery={(projectId) => {
                if (!client) return;
                setProjectBusy(true);
                void unlinkOrganizationDelivery(
                  client,
                  state.snapshot,
                  activeOrganizationId,
                  projectId,
                ).then(async (result) => {
                  setProjectBusy(false);
                  if (result.kind === "success")
                    await refreshAfter("Project link removed.");
                  else showFailure(result);
                });
              }}
              onOpenProject={(id, title) =>
                openContext(projectContext(id, title))
              }
              onOpenTask={(id, title) => openContext(taskContext(id, title))}
              onOpenDocument={(id, title) =>
                openContext(documentContext(id, title))
              }
              onOpenMeeting={(id) => {
                setSelectedMeetingId(id);
                openContext(destinationContext("meetings", "Meetings"));
              }}
              onOpenRelationship={(id) => {
                openContext(
                  destinationContext("organizations", "Organizations"),
                );
                selectStrategicInInspector(id);
              }}
            />
          )}
        </Suspense>
      </LazySurfaceBoundary>
    ),
    pipeline: () => (
      <LazySurfaceBoundary label="Pipeline">
        <Suspense fallback={<SurfaceLoadingState label="Pipeline" />}>
          <PipelineSurface
            client={client}
            snapshot={state.snapshot}
            selectedRecordId={selectedStrategicId}
            // THE OPPORTUNITY RECORD IS A CONTEXT ON THIS SURFACE, exactly as
            // the task record is a context on `tasks`. Both halves are handed
            // in here: the context carries the deal, and the screen that draws
            // it is the slot below.
            activeOpportunityId={activeContext.opportunityId}
            renderRecordScreen={
              recordOpportunity === undefined
                ? undefined
                : () => (
                    <Suspense
                      fallback={
                        <p className="capacity-note">Opening the deal…</p>
                      }
                    >
                      <OpportunityRecordScreen
                        busy={false}
                        client={client}
                        onBack={() =>
                          openContext(
                            destinationContext("pipeline", "Pipeline"),
                          )
                        }
                        onFailure={showFailure}
                        onOpenOrganization={(id, name) =>
                          openContext(organizationContext(id, name))
                        }
                        onOpenProject={(id, title) =>
                          openContext(projectContext(id, title))
                        }
                        onReload={reload}
                        opportunity={recordOpportunity}
                        snapshot={state.snapshot}
                      />
                    </Suspense>
                  )
            }
            onSelectRecord={selectStrategicInInspector}
            onOpenOpportunity={(id, title) =>
              // Opening a deal now means THE DEAL, not the board holding it.
              // The context is what makes the tab reopen as the record and what
              // lets ⌘K reach the same place — the board-with-it-selected state
              // this replaced was the honest halfway house for the one release
              // in which no context could carry a deal.
              openContext(opportunityContext(id, title))
            }
            onOpenOrganization={(id, name) =>
              openContext(organizationContext(id, name))
            }
            onNavigate={(next, label) =>
              openContext(destinationContext(next, label))
            }
            onReload={reload}
            onFailure={showFailure}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    people: () => (
      <LazySurfaceBoundary label="People">
        <Suspense fallback={<SurfaceLoadingState label="People" />}>
          <PeopleSurface
            client={client}
            snapshot={state.snapshot}
            selectedRecordId={selectedStrategicId}
            onSelectRecord={selectStrategicInInspector}
            onOpenOrganization={(id, name) =>
              openContext(organizationContext(id, name))
            }
            onReload={reload}
            onFailure={showFailure}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    renewals: () => (
      <LazySurfaceBoundary label="Renewals">
        <Suspense fallback={<SurfaceLoadingState label="Renewals" />}>
          <RenewalsSurface
            client={client}
            snapshot={state.snapshot}
            selectedRecordId={selectedStrategicId}
            onSelectRecord={selectStrategicInInspector}
            onOpenOrganization={(id, name) =>
              openContext(organizationContext(id, name))
            }
            // A deal has its own record since #191, so opening one from here
            // opens THE DEAL. Sending it to the board with the record selected
            // was the honest halfway house while no context could carry a deal;
            // leaving it that way now would be the substitution trap 24
            // describes, authored from this end.
            onOpenOpportunity={(id, title) =>
              openContext(opportunityContext(id, title))
            }
            onOpenTask={(id, title) => openContext(taskContext(id, title))}
            onReload={reload}
            onFailure={showFailure}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    settings: () => (
      <LazySurfaceBoundary label="Settings">
        <Suspense fallback={<SurfaceLoadingState label="Settings" />}>
          <SettingsSurface
            client={client}
            snapshot={state.snapshot}
            onReload={reload}
            // The access writes moved into Settings with their content, and
            // they end where they always ended: in this shell's toast, with
            // the undo affordance this function reads off the activity head.
            onWrote={refreshAfter}
            onFailure={showFailure}
            onOpenRecovery={() => setRecoveryOpen(true)}
            // The surface owns the fact of which section is in view; the
            // shell's left column is the only navigator that shows it.
            onCategoryChange={setSettingsCategory}
            // Kategoria ŻĄDANA przez kontekst zakładki — głęboki link. Podana
            // tylko wtedy, gdy naprawdę o nią proszono: bez tego pola ekran
            // wybiera kategorię własnym stanem, i to jest zachowanie, które
            // ma zostać zachowaniem domyślnym.
            {...(activeContext.settingsCategory === undefined
              ? {}
              : { requestedCategory: activeContext.settingsCategory })}
            onUndo={(id) => void openUndo(id)}
            onOpenActivityRecord={(recordKind, recordId) => {
              if (recordKind === "area") {
                const area =
                  state.snapshot.work.kind === "ready"
                    ? state.snapshot.work.data.areas.find(
                        (item) => item.id === recordId,
                      )
                    : undefined;
                if (area !== undefined)
                  openContext(areaContext(area.id, area.title));
                return;
              }
              if (recordKind === "initiative") {
                const initiative =
                  state.snapshot.work.kind === "ready"
                    ? state.snapshot.work.data.initiatives.find(
                        (item) => item.id === recordId,
                      )
                    : undefined;
                if (initiative !== undefined)
                  openContext(
                    initiativeContext(initiative.id, initiative.title),
                  );
                return;
              }
              if (recordKind === "task") {
                const task = state.snapshot.tasks.find(
                  (item) => item.id === recordId,
                );
                openContext(
                  taskContext(recordId as TaskId, task?.title ?? "Task", {
                    record: true,
                  }),
                );
                return;
              }
              if (recordKind === "project") {
                const project =
                  state.snapshot.projects.kind === "ready"
                    ? state.snapshot.projects.data.items.find(
                        (item) => item.id === recordId,
                      )
                    : undefined;
                openContext(
                  projectContext(
                    recordId as ProjectId,
                    project?.title ?? "Project",
                  ),
                );
                return;
              }
              setSelectedStrategicId(recordId);
              openContext(destinationContext("organizations", "Organizations"));
            }}
          />
        </Suspense>
      </LazySurfaceBoundary>
    ),
    tasks: () => (
      <TasksSurface
        snapshot={state.snapshot}
        selectedTaskId={selectedTaskId}
        // Który zapisany widok ma być otwarty — z KONTEKSTU, bo prosi o niego
        // drugi poziom lewej kolumny. Pominięte, gdy kontekst o żaden nie
        // prosi: prop obecny z wartością `undefined` znaczyłby „otwórz All
        // work" i cofałby wybór zrobiony na ekranie przy każdym renderze
        // powłoki.
        {...(activeContext.savedViewId === undefined
          ? {}
          : { requestedViewId: activeContext.savedViewId })}
        // Droga powrotna. Bez niej lewa kolumna trzymałaby
        // `aria-current="page"` na widoku, z którego czytelnik zszedł
        // kontrolką — a bieżąca strona, która kłamie, jest gorsza niż jej brak.
        onViewOpened={(savedViewId) =>
          // NIE `openContext`, I TO JEST WARUNEK, NIE STYL. `openContext`
          // podnosi `surfaceFocusPendingRef`, którego konsument (efekt niżej)
          // chodzi na ZMIANIE `activeContext.key`. Zapisany widok siedzi na
          // TYM SAMYM kluczu (`destination:tasks`), więc przy przełączeniu
          // widoku kontrolką efekt nie ruszyłby — a flaga zostałaby podniesiona
          // i przeniosła ognisko przy NASTĘPNEJ, cudzej zmianie celu.
          // Czytelnik stoi w tej chwili w kontrolce „View" i nie prosił
          // o przeniesienie ogniska nigdzie.
          setNavigation((current) =>
            navigateShellContext(
              current,
              savedViewId === undefined
                ? destinationContext("tasks", "Tasks")
                : tasksSavedViewContext(savedViewId),
            ),
          )
        }
        // Only a context that ASKED to be a record draws one. A capture that
        // just became a task, a signal activated from the operating system and
        // a reference followed out of a document all carry `taskId` too, and
        // all of them mean the list with the task in hand.
        activeTaskId={
          activeContext.record === true ? activeContext.taskId : undefined
        }
        renderRecordScreen={
          recordTask === undefined
            ? undefined
            : () => (
                <Suspense
                  fallback={<p className="capacity-note">Opening the task…</p>}
                >
                  <TaskRecordScreen
                    actorOf={actorOf}
                    // The shell's per-task write flag, and nothing wider. It is
                    // rarely true while the record is open — the writes that set
                    // it are the collection's row controls, and the collection
                    // is not on screen — but folding the rail's own busy flags
                    // in here would disable the record's composer because
                    // somebody is picking a file in the inspector.
                    busy={busyTaskId === recordTask.id}
                    canComment={canComment}
                    canResolve={canResolveComments}
                    // The three the record's own authoring panels need. Handed
                    // straight through — writing a handler body here would put
                    // it in the entry chunk, which is the one place in this
                    // program with no room.
                    client={client}
                    commentBusy={commentBusy}
                    // The shell's slice, and only while it IS this record's —
                    // otherwise the pending line, which is the true thing to say
                    // for the one frame the selection lags the context.
                    comments={
                      recordTaskCommentsMatch ? comments : COMMENTS_PENDING
                    }
                    currentPrincipalId={currentPrincipalId}
                    currentDisplayName={currentDisplayName}
                    mentionCandidates={commentMentionCandidates}
                    mentionNameOf={mentionNameOf}
                    onAddComment={(
                      body,
                      mentions,
                      parent,
                      attachmentSourceIds,
                    ) => {
                      if (
                        !client ||
                        !recordTaskCommentsMatch ||
                        commentTarget === undefined ||
                        commentTargetVersion === undefined
                      )
                        return Promise.resolve(false);
                      setCommentBusy(true);
                      return addComment(
                        client,
                        state.snapshot,
                        commentTarget,
                        commentTargetVersion,
                        body,
                        mentions,
                        parent,
                        attachmentSourceIds,
                      ).then((result) =>
                        settleCommentWrite(
                          commentTarget,
                          result,
                          "Comment saved.",
                        ),
                      );
                    }}
                    onAttachToComment={stageCommentAttachment}
                    onBack={() =>
                      openContext(destinationContext("tasks", "Tasks"))
                    }
                    onEditComment={(comment, body, attachmentSourceIds) => {
                      if (!client || !recordTaskCommentsMatch)
                        return Promise.resolve(false);
                      setCommentBusy(true);
                      return editComment(
                        client,
                        state.snapshot,
                        comment.id,
                        comment.version,
                        body,
                        comment.mentionPrincipalIds,
                        attachmentSourceIds,
                      ).then((result) =>
                        settleCommentWrite(commentTarget, result),
                      );
                    }}
                    onFailure={showFailure}
                    onInspectAttachment={inspectManagedAttachment}
                    // The record resolved the row that was clicked, so the tab
                    // it opens is named after the work rather than after a
                    // second lookup over the capped list.
                    onOpenProject={(projectId, title) =>
                      openContext(projectContext(projectId, title))
                    }
                    onOpenTask={(id, title) =>
                      openContext(taskContext(id, title, { record: true }))
                    }
                    onResolveComment={(comment, resolved) => {
                      if (!client || !recordTaskCommentsMatch)
                        return Promise.resolve(false);
                      setCommentBusy(true);
                      return setCommentResolved(
                        client,
                        state.snapshot,
                        comment,
                        resolved,
                      ).then((result) =>
                        settleCommentWrite(commentTarget, result),
                      );
                    }}
                    onReload={reload}
                    onRestoreAttachment={restoreManagedAttachment}
                    receipt={receipts[recordTask.id]}
                    snapshot={state.snapshot}
                    task={recordTask}
                  />
                </Suspense>
              )
        }
        // The ONE place a list promotes a task to its own screen: the reader
        // asked for it, with Enter or a second click. Every other task context
        // in this file means "take me to it", and those keep the collection.
        onOpenTask={(id) => {
          const task = tasks.find((item) => item.id === id);
          openContext(taskContext(id, task?.title ?? "Task", { record: true }));
        }}
        onSelectTask={selectTaskInInspector}
        onOpenCalendar={() => {
          openContext(destinationContext("calendar", "Calendar"));
        }}
        onCreateTask={async (title) => {
          if (!client) return false;
          const result = await createTask(client, state.snapshot, { title });
          if (result.kind === "success") {
            await refreshAfter("Task created.");
            selectTaskInInspector(result.data.taskId);
            return true;
          }
          showFailure(result);
          return false;
        }}
        onSetStatus={(id, statusId) => {
          const task = tasks.find((item) => item.id === id);
          if (!client || !task) return;
          setBusyTaskId(id);
          void setTaskStatus(
            client,
            state.snapshot,
            id,
            task.version,
            statusId,
          ).then(async (result) => {
            setBusyTaskId(undefined);
            if (result.kind === "success")
              await refreshAfter("Task status updated.");
            else showFailure(result);
          });
        }}
        onSetCompleted={(id, completed) => {
          const task = tasks.find((item) => item.id === id);
          if (!client || !task) return;
          setBusyTaskId(id);
          void setTaskCompletion(
            client,
            state.snapshot,
            id,
            task.version,
            completed,
          ).then(async (result) => {
            setBusyTaskId(undefined);
            if (result.kind === "success")
              await refreshAfter(
                completed ? "Task completed." : "Task reopened.",
              );
            else showFailure(result);
          });
        }}
        onPlanOnDay={(id, dayKey) => {
          const task = tasks.find((item) => item.id === id);
          if (!client || !task) return;
          setBusyTaskId(id);
          // The whole point of the gesture: it writes `startAt` and says
          // nothing about `dueAt`. A plan is this person's decision about when
          // they will get to the work; a deadline is somebody else's promise,
          // and dragging a card never moves one.
          // The day comes from the gesture; the time of day comes from the
          // workspace's working day, never from a number written here. Nine
          // o'clock in the code is exactly the hardcoded default B10 removed.
          const dayStart = instantForZonedDate(
            dayKey,
            state.snapshot.bootstrap.workspace.timezone,
            "start",
          );
          if (dayStart === undefined) {
            setBusyTaskId(undefined);
            return;
          }
          const startAt = new Date(
            Date.parse(dayStart) +
              state.snapshot.bootstrap.workspace.workingDay.startMinute *
                60_000,
          ).toISOString();
          void updateTaskDetails(client, state.snapshot, id, task.version, {
            startAt,
          }).then(async (result) => {
            setBusyTaskId(undefined);
            if (result.kind === "success") await refreshAfter("Task planned.");
            else showFailure(result);
          });
        }}
        onSaveViewFilters={async (view, change) => {
          if (!client) return false;
          const result = await updateSavedWorkView(
            client,
            state.snapshot,
            view,
            {
              filters: change,
            },
          );
          if (result.kind !== "success") {
            showFailure(result);
            return false;
          }
          await refreshAfter("View conditions saved.");
          return true;
        }}
        // Making, renaming and deleting a view live on this screen now. Handed
        // straight through: the four wrappers are imported by the lazy manager
        // itself, so no handler body for them lands in the entry chunk.
        client={client}
        onReload={reload}
        onFailure={showFailure}
      />
    ),
    notes: () => knowledgeSurfacePanel("notes"),
    sources: () => knowledgeSurfacePanel("sources"),
    captures: () => knowledgeSurfacePanel("captures"),
    projects: () => (
      <ProjectsSurface
        client={client}
        contextRecord={contextRecordPanel}
        snapshot={state.snapshot}
        selectedProjectId={selectedProjectId}
        activeProjectId={activeContext.projectId}
        overview={projectOverview}
        relation={sessionRelation}
        renderRecordScreen={
          projectOverview === undefined || recordProject === undefined
            ? undefined
            : (slots) => (
                <Suspense
                  fallback={
                    <p className="capacity-note">Opening the project…</p>
                  }
                >
                  <ProjectRecordScreen
                    actions={slots.actions}
                    currentDisplayName={currentDisplayName}
                    activity={state.snapshot.activity}
                    body={slots.body}
                    busy={projectBusy}
                    canComment={canComment}
                    canResolve={canResolveComments}
                    clientLinking={{
                      candidates: linkableClientOrganizations(
                        state.snapshot,
                        projectOverview.project,
                      ),
                      detachableIds: new Set(
                        directClientLinks(
                          state.snapshot,
                          projectOverview.project.id,
                        ).keys(),
                      ),
                      busy: projectBusy,
                      onLink: (organizationId) =>
                        attachProjectClient(
                          organizationId as StrategicRecordId,
                        ),
                      onUnlink: (organizationId) =>
                        detachProjectClient(
                          organizationId as StrategicRecordId,
                        ),
                    }}
                    commentBusy={commentBusy}
                    comments={comments}
                    currentPrincipalId={currentPrincipalId}
                    documents={projectOverview.relatedDocuments}
                    mentionCandidates={
                      state.snapshot.mentionCandidates.kind === "ready"
                        ? state.snapshot.mentionCandidates.data.candidates.filter(
                            (candidate) =>
                              candidate.principalId !== currentPrincipalId,
                          )
                        : []
                    }
                    onAddComment={(
                      body,
                      mentions,
                      parent,
                      attachmentSourceIds,
                    ) => {
                      if (!client || recordComment === undefined)
                        return Promise.resolve(false);
                      setCommentBusy(true);
                      return addComment(
                        client,
                        state.snapshot,
                        recordComment.target,
                        recordComment.version,
                        body,
                        mentions,
                        parent,
                        attachmentSourceIds,
                      ).then((result) =>
                        settleCommentWrite(
                          recordComment.target,
                          result,
                          "Comment saved.",
                        ),
                      );
                    }}
                    actorOf={actorOf}
                    mentionNameOf={mentionNameOf}
                    onBack={() =>
                      openContext(destinationContext("projects", "Projects"))
                    }
                    onEditComment={(comment, body, attachmentSourceIds) => {
                      if (!client || recordComment === undefined)
                        return Promise.resolve(false);
                      setCommentBusy(true);
                      return editComment(
                        client,
                        state.snapshot,
                        comment.id,
                        comment.version,
                        body,
                        comment.mentionPrincipalIds,
                        attachmentSourceIds,
                      ).then((result) =>
                        settleCommentWrite(recordComment.target, result),
                      );
                    }}
                    onResolveComment={(comment, resolved) => {
                      if (!client || recordComment === undefined)
                        return Promise.resolve(false);
                      setCommentBusy(true);
                      return setCommentResolved(
                        client,
                        state.snapshot,
                        comment,
                        resolved,
                      ).then((result) =>
                        settleCommentWrite(recordComment.target, result),
                      );
                    }}
                    onNewTask={() =>
                      openContext(destinationContext("tasks", "Tasks"))
                    }
                    onOpenDocument={(id, title) =>
                      openContext(documentContext(id, title))
                    }
                    onOpenMeeting={(id) => {
                      setSelectedMeetingId(id);
                      openContext(destinationContext("meetings", "Meetings"));
                    }}
                    onOpenRelationship={(id) => {
                      setSelectedStrategicId(id);
                      openContext(
                        destinationContext("organizations", "Organizations"),
                      );
                    }}
                    onOpenTask={(taskId) => {
                      setSelectedTaskId(taskId);
                      openContext(destinationContext("tasks", "Tasks"));
                    }}
                    onSelectTask={setSelectedTaskId}
                    onWriteOutcome={slots.onWriteOutcome}
                    outcomeEditor={slots.outcomeEditor}
                    overview={projectOverview}
                    project={recordProject}
                    projectId={projectOverview.project.id}
                    prose={recordProse}
                    statuses={state.snapshot.bootstrap.taskStatuses}
                    taskLinking={slots.taskLinking}
                    tasks={
                      state.snapshot.work.kind === "ready"
                        ? state.snapshot.work.data.tasks
                        : []
                    }
                  />
                </Suspense>
              )
        }
        busy={projectBusy}
        onOpenProject={(id) => {
          const project =
            state.snapshot.projects.kind === "ready"
              ? state.snapshot.projects.data.items.find(
                  (item) => item.id === id,
                )
              : undefined;
          openContext(projectContext(id, project?.title ?? "Project"));
        }}
        onSelectProject={selectProjectInInspector}
        onBackToProjects={() =>
          openContext(destinationContext("projects", "Projects"))
        }
        onEntityActivate={(target) => {
          if (target.targetKind === "task") {
            setSelectedTaskId(target.targetId as TaskId);
            openContext(destinationContext("tasks", "Tasks"));
            return;
          }
          if (target.targetKind === "project") {
            const project =
              state.snapshot.projects.kind === "ready"
                ? state.snapshot.projects.data.items.find(
                    (item) => item.id === target.targetId,
                  )
                : undefined;
            openContext(
              projectContext(
                target.targetId as ProjectId,
                project?.title ?? "Project",
              ),
            );
            return;
          }
          if (
            target.targetKind === "person" ||
            target.targetKind === "organization"
          ) {
            setSelectedStrategicId(target.targetId as StrategicRecordId);
            openContext(destinationContext("organizations", "Organizations"));
            return;
          }
          setSelectedMeetingId(target.targetId);
          openContext(destinationContext("meetings", "Meetings"));
        }}
        onCreate={async (title, outcome, templateId) => {
          if (!client) return false;
          setProjectBusy(true);
          const result = await createProject(
            client,
            state.snapshot,
            title,
            outcome,
          );
          if (result.kind !== "success") {
            setProjectBusy(false);
            showFailure(result);
            return false;
          }
          if (templateId !== undefined) {
            const applied = await applyTemplateToProject(
              client,
              state.snapshot,
              {
                projectId: result.data.projectId,
                projectVersion: 1,
                templateId,
              },
            );
            if (applied.kind !== "success") showFailure(applied);
          }
          setProjectBusy(false);
          openContext(projectContext(result.data.projectId, title.trim()));
          await refreshAfter("Project created.");
          return true;
        }}
        onApplyTemplate={(templateId) => {
          if (!client || !projectOverview) return;
          setProjectBusy(true);
          void applyTemplateToProject(client, state.snapshot, {
            projectId: projectOverview.project.id,
            projectVersion: projectOverview.project.version,
            templateId,
          }).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success") {
              await refreshAfter("Template applied.");
            } else {
              showFailure(result);
            }
          });
        }}
        onUpdateOutcome={(outcome) => {
          if (!client || !projectOverview) return;
          setProjectBusy(true);
          void updateProjectOutcome(
            client,
            state.snapshot,
            projectOverview.project,
            outcome,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success")
              await refreshAfter("Intended outcome updated.");
            else showFailure(result);
          });
        }}
        onSetLifecycle={(lifecycle) => {
          if (!client || !projectOverview) return;
          setProjectBusy(true);
          void setProjectLifecycle(
            client,
            state.snapshot,
            projectOverview.project,
            lifecycle,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success")
              await refreshAfter(
                lifecycle === "closed"
                  ? "Project closed. History and open tasks are unchanged."
                  : "Project reopened.",
              );
            else showFailure(result);
          });
        }}
        onRelate={(taskId) => {
          const task = tasks.find((item) => item.id === taskId);
          if (!client || !task || !projectOverview) return;
          setProjectBusy(true);
          void relateTask(
            client,
            state.snapshot,
            task.id,
            task.version,
            projectOverview.project.id,
            projectOverview.project.version,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success") {
              setSessionRelation({
                id: result.data.relationId,
                version: result.data.version,
                taskId,
              });
              await refreshAfter("Task linked to the project.");
            } else showFailure(result);
          });
        }}
        onUnrelate={() => {
          if (!client || !sessionRelation) return;
          setProjectBusy(true);
          void unrelateTask(
            client,
            state.snapshot,
            sessionRelation.id,
            sessionRelation.version,
          ).then(async (result) => {
            setProjectBusy(false);
            if (result.kind === "success") {
              setSessionRelation(undefined);
              await refreshAfter("Link removed.");
            } else showFailure(result);
          });
        }}
        // Areas and initiatives live on this screen now. The selection is the
        // SHELL's, and the same one the work surface used to set — picking one
        // opens it in the inspector drawer, beside the projects it holds.
        selectedContextId={selectedWorkContext?.id}
        onSelectContext={selectWorkContextInInspector}
        onOpenContext={(kind, id, title) => {
          setSelectedWorkContext(undefined);
          openContext(
            kind === "area"
              ? areaContext(id as StrategicRecordId, title)
              : initiativeContext(id as StrategicRecordId, title),
          );
        }}
        onReload={reload}
        onFailure={showFailure}
      />
    ),
    inbox: () => (
      <InboxSurface
        attention={state.snapshot.attention}
        selectedItemId={selectedAttentionId}
        busy={attentionBusy}
        timezone={state.snapshot.bootstrap.workspace.timezone}
        onSelect={(item) => selectAttentionInInspector(item.id)}
        onOpen={openAttentionDestination}
        onMarkRead={readAttention}
        onDismiss={dismissAttention}
        onRouteCapture={routeAttentionCapture}
        onRetryCapture={retryAttentionCapture}
        onKeepCapture={keepAttentionCapture}
        onReplaceCapturePayload={replaceAttentionPayload}
        onRetryLoad={() => void reload()}
      />
    ),
  };

  return (
    <div
      className={`desktop-shell wave2-shell${railMode ? " rail" : ""}${inspectorDetailOpen ? " inspector-open" : ""}${surface === "meetings" ? " meeting-context-shell" : ""}`}
      style={{ ["--inspector-width" as string]: `${inspectorWidth}px` }}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      {/* THE TITLE BAND SPANS THE WINDOW (`v3/app.css:84-90`, `:146-151`).
          It used to be the first row of the WORK COLUMN, so its left edge sat
          at the sidebar's width and the strip above the sidebar was a bare drag
          region with the product mark absolutely positioned into it. The band
          is now a row of the shell grid spanning every column, and the mark,
          the history controls, the tabs and the chrome actions are all in it —
          which is the arrangement the prototype has and the reason its tab
          strip reads as part of the window rather than as part of one pane. */}
      <div className="shell-tabbar" aria-label="Open contexts">
        {/* The mark is a plain flex child now. It used to be positioned
            absolutely into the sidebar's top strip, and `.window-drag` was a
            second absolutely-positioned box covering the same strip so the
            window could be dragged by it. The band itself is the drag region
            today (`styles.css`), so both the extra node and the absolute
            positioning are gone. */}
        <div className="brand-row">
          <BrandMark />
          <strong>Constellation</strong>
        </div>
        <div className="shell-history-controls" aria-label="Context history">
          <button
            className="icon-button"
            data-shell-history="back"
            aria-label="Back, Alt+Left"
            title="Back · Alt+←"
            disabled={!canMoveShellHistory(navigation, -1)}
            onClick={() =>
              setNavigation((current) => moveShellHistory(current, -1))
            }
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            className="icon-button"
            data-shell-history="forward"
            aria-label="Forward, Alt+Right"
            title="Forward · Alt+→"
            disabled={!canMoveShellHistory(navigation, 1)}
            onClick={() =>
              setNavigation((current) => moveShellHistory(current, 1))
            }
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <div
          ref={tabRef}
          className="shell-tabs"
          role="tablist"
          aria-label="Contexts"
        >
          {navigation.tabs.map((tab, index) => {
            const active = tab.key === navigation.activeKey;
            return (
              <div
                className={`shell-tab ${active ? "active" : ""}`}
                role="presentation"
                key={tab.key}
              >
                <button
                  type="button"
                  role="tab"
                  id={`shell-tab-${index}`}
                  aria-selected={active}
                  aria-controls="main-content"
                  tabIndex={active ? 0 : -1}
                  data-shell-tab={tab.key}
                  onKeyDown={(event) => tabKeyDown(event, tab.key)}
                  onClick={() =>
                    setNavigation((current) =>
                      activateShellContext(current, tab.key),
                    )
                  }
                >
                  {/* NIC PRZED TYTUŁEM (`v3/app.css:106-133`). Stał tu
                      `<span className="shell-tab-kind">` — okrąg bez wartości:
                      ta sama plamka przy celu, przy rekordzie i przy odczycie
                      Biblioteki. Reguła arkusza znikła razem z nim. */}
                  <span>{tab.label}</span>
                </button>
                {navigation.tabs.length > 1 && (
                  <button
                    type="button"
                    className="shell-tab-close"
                    aria-label={`Close context ${tab.label}, ${modifierLabel}W`}
                    title={`Close · ${modifierLabel}W`}
                    onClick={() =>
                      setNavigation((current) =>
                        closeShellContext(current, tab.key),
                      )
                    }
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* THE RIGHT END OF THE TITLE BAND IS A GROUP OF GLYPHS
            (`v3/app.css:135-143`, `v3/app.js:554-557`), not one wide bordered
            word. The button that stood here spelled „Separate window" in a
            2xs box with a border, shortened itself to „Window" below 30 rem
            and still took more of the band than every tab it sat beside.

            THE SECOND MEMBER IS NOT NEW FUNCTION, IT IS A MISSING DOOR. The
            shortcuts overlay has existed since Wave B and could be reached by
            ⌘/ ALONE — a feature whose only affordance is the shortcut it
            documents. The prototype puts exactly this control in exactly this
            group, so the door and the shape arrive together. */}
        <div className="shell-tab-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Keyboard shortcuts, ${modifierLabel}/`}
            title={`Keyboard shortcuts · ${modifierLabel}/`}
            onClick={() => setShortcutsOpen(true)}
          >
            <Icon name="fields" />
          </button>
          <button
            type="button"
            className="icon-button shell-detach"
            aria-label={
              detachedWindow
                ? "Close the separate window"
                : `Open ${activeContext.label} in a separate window`
            }
            title={detachedWindow ? "Attach back" : "Separate window"}
            disabled={
              !detachedWindow && client?.openDetachedSurface === undefined
            }
            onClick={() => {
              if (detachedWindow) window.close();
              else
                void client?.openDetachedSurface?.(surface).catch(() =>
                  setNotice({
                    kind: "unavailable",
                    message:
                      "Could not open a separate window. This context stays here.",
                  }),
                );
            }}
          >
            <Icon name="panel" />
          </button>
        </div>
      </div>
      <aside
        className={`sidebar${settingsMode ? " sidebar-settings-mode" : ""}`}
        id="workspace-sidebar"
        // TRZY PUNKTY ORIENTACYJNE, TRZY RÓŻNE NAZWY — poprawka po przeglądzie.
        // Ta kolumna, nawigacja w środku i `nav.settings-mode-column` są
        // zagnieżdżone jedno w drugim, a w trybie Ustawień wszystkie trzy
        // nazywały się „Settings sections": czytnik ekranu wypisywał trzy
        // nieodróżnialne regiony, w tym dwa tej samej roli `navigation`, zamiast
        // jednego spisu sekcji. Nazwa spisu należy do listy i tam zostaje
        // (prototyp trzyma ją wyłącznie na `.st-nav-list`,
        // `v3/screens/settings.js:995`); kolumna nazywa SIEBIE.
        aria-label={settingsMode ? "Settings" : "Workspace and navigation"}
      >
        {/* USTAWIENIA SĄ TRYBEM, WIĘC WEJŚCIE PODMIENIA KOLUMNĘ, A NIE DOKŁADA
        SIĘ POD NIĄ (`v3/screens/settings.css:6-27` — prototyp zeruje szerokość
        prawdziwego paska i rysuje `.st-nav`, czyli pasmo „‹ Settings" i sam
        pogrupowany spis sekcji; `.ui-craft/patterns.md` — „Pattern: Application
        shell", jedna kolumna nawigacji naraz).

        POWŁOKA PRACY ZOSTAWAŁA NAD SPISEM: karta przestrzeni, wyszukiwarka
        i grupy „Favorites"/„Recent" renderowały się BEZWARUNKOWO, a kolumna
        trybu doklejała się dopiero pod nimi — zmierzone przed poprawką przy
        1440 px: pierwsza pozycja spisu zaczynała się na y=215,9, czyli 176 px
        pod górną krawędzią kolumny.

        WARUNEK, NIE UKRYCIE STYLEM — tak samo jak przy samym spisie sekcji
        niżej: element schowany `visibility` zostaje w kolejności Tab albo
        w drzewie dostępności zależnie od reguły, a element, który się nie
        renderuje, nie zostaje nigdzie. Prototyp musiał sięgnąć po `visibility`,
        bo jego `renderSidebar()` nie znał trybu i sam nazywa to OBEJŚCIEM
        (`:24-25`); tutaj kolumnę rysuje ten sam komponent, co tryb, więc
        warunek jest do napisania wprost.

        CZEGO TA POPRAWKA NIE ZDEJMUJE, i to jest rozstrzygnięcie, nie
        przeoczenie: stopka (`.sidebar-foot`, do lotu L11 `.preview-identity`)
        zostaje w OBU trybach. Prototyp ma ją w pasku bocznym i nie ma trybu
        Ustawień, więc jej obecność tutaj nie jest rozjazdem TRYBU — jest
        osobnym zdaniem o powłoce. Od L11 stoi w niej imię czytelnika, czyli
        dokładnie to, co prototyp trzyma w `sidebar-foot`.

        WYSZUKIWANIA TO NIE ZABIERA: `⌘K` wisi na nasłuchu okna
        (`RealApp.tsx`, gałąź `event.code === "KeyK"`), a nie na tym przycisku
        — sprawdzone przed skasowaniem go z tej gałęzi. */}
        {!settingsMode && (
          <>
            <button
              type="button"
              className="workspace-switcher"
              // CO TEN PRZYCISK ROBI, W JEGO NAZWIE — a nie w dymku obok niej.
              // Widoczna treść to nazwa przestrzeni, więc czynność („otwiera
              // ustawienia") nie stała nigdzie poza `title`. W trybie podglądu
              // przycisk jest DODATKOWO `disabled`, a wyłączony przycisk nie
              // przyjmuje fokusu — tam tooltip nie docierał do nikogo poza
              // najeżdżającą myszą.
              // NAZWA DOSTĘPNA CZYTA TĘ SAMĄ LINIĘ, CO OKO. Stał tu
              // `dataHomeLabel` — osobny napis o tym samym magazynie, więc przy
              // usterce czytnik ekranu słyszał „Local only · data on this
              // device" nad kaflem, który na ekranie mówił coś innego. Jedno
              // źródło, jedna prawda.
              aria-label={`Workspace ${bootstrap.workspace.name}, ${storageLine}, ${
                isPreview
                  ? "opens workspace settings"
                  : coordinatedDataHome
                    ? "opens coordinated workspace settings"
                    : "opens workspace settings and switching"
              }`}
              disabled={isPreview}
              onClick={() =>
                openContext(destinationContext("settings", "Settings"))
              }
            >
              {/* Kafel niósł WPISANĄ literę „I" — nie inicjał, nie skrót, literał,
          i tak było w każdej przestrzeni od co najmniej trzech fal. Rozbicie
          przez `[...]` zamiast `charAt(0)`, bo nazwa zaczynająca się emoji
          rozpada się w połowie pary surogatów. */}
              <span className="workspace-avatar">
                {[...bootstrap.workspace.name.trim()][0]?.toUpperCase() ?? "·"}
              </span>
              <span>
                <strong>{bootstrap.workspace.name}</strong>
                <small>{storageLine}</small>
              </span>
              {/* SZEWRON, NIE WIELOKROPEK, I BEZ WARUNKU (`v3/app.js:651`,
                  `v3/app.css:181`). Stały tu trzy kropki `•••` — znak „więcej
                  akcji", czyli obietnica menu, którego ten przycisk nie
                  otwiera; prototyp stawia `⌄`, który mówi „to się rozwija".
                  Reguła arkusza na ten glif CZEKAŁA: `.workspace-switcher > svg`
                  niesie obrót o 90° od dawna i nie miała ani jednego dziecka,
                  więc obrócony `chevron-right` jest tym glifem, który ona
                  opisuje — nie nowym rysunkiem płaconym przy otwarciu okna.
                  Rozmiar tej reguły zszedł po przeglądzie adwersarialnym
                  z 0,85 rem na prototypowe 0,75 rem w obu osiach.

                  BEZ `!isPreview`, I TO JEST ZMIANA, NIE PRZEOCZENIE. Kropki
                  znikały w podglądzie, więc trzeci tor siatki
                  (`grid-template-columns: … 1rem`) stał pusty dokładnie w tym
                  jedynym stanie, po którym chodzi bramka — glif nie do
                  zmierzenia jest glifem bez dowodu. Wyłączony przycisk ZOSTAJE
                  wyłączony i całą kontrolkę gasi `:disabled { opacity }`; ta
                  sama para stoi obok w tym pliku, w przycisku zwijania paska
                  (`disabled={narrowRail}` z glifem w środku). */}
              <Icon name="chevron-right" />
            </button>
            <button
              className="search-control"
              // OBIETNICA TEJ KONTROLKI JEST OBIETNICĄ TEGO, CO SIĘ OTWIERA
              // (`v3/app.js:653-655` — `<span class="lbl">Search and run…</span>`).
              // Stało tu samo „Search" przy `⌘K`, a za `⌘K` stoi paleta, która
              // sama nazywa się „Command palette and global search"
              // (`Wave2Surfaces.tsx`): kłamało WEJŚCIE, nie zawartość. Napis
              // jest w czterech miejscach jednego bloku — etykieta widoczna,
              // `aria-label` i dwa dymki railu — i wszystkie cztery mówią to
              // samo zdanie, bo to jest jedna obietnica, a nie cztery.
              aria-label={`${SEARCH_CONTROL_LABEL} · ${modifierLabel}K`}
              onFocus={(event) =>
                showRailTip(event.currentTarget, SEARCH_CONTROL_LABEL, {
                  keys: `${modifierLabel}K`,
                  kind: "direct",
                })
              }
              onBlur={hideRailTip}
              onMouseEnter={(event) =>
                showRailTip(event.currentTarget, SEARCH_CONTROL_LABEL, {
                  keys: `${modifierLabel}K`,
                  kind: "direct",
                })
              }
              onMouseLeave={hideRailTip}
              onClick={() => setSearchOpen(true)}
            >
              <Icon name="search" />
              <span>{SEARCH_CONTROL_LABEL}</span>
              {/* CICHY GLIF, NIE KLAWISZ (`v3/app.css:183-194`). `<kbd>` niesie
          w tym arkuszu obwódkę, tło i promień, czyli rysunek klawiatury —
          a to jest jedna kontrolka, nie ściągawka. Znaczenie „to jest skrót"
          zostaje w `aria-label` przycisku, gdzie i tak było jedynym miejscem
          docierającym do czytnika ekranu. */}
              <span className="search-shortcut">{modifierLabel}K</span>
            </button>
          </>
        )}
        <nav
          ref={navRef}
          // Nazwa BEZ WARUNKU: to jest ta sama nawigacja w obu trybach — nosi
          // `navRef` i obsługę klawiszy, więc w trybie Ustawień to ona wodzi
          // ognisko po pozycjach spisu. „Settings sections" należy do listy
          // w środku i byłoby tu drugą kopią tej samej nazwy.
          aria-label="Main navigation"
          onKeyDown={navKeyDown}
        >
          {!settingsMode && favorites.length > 0 && (
            <>
              <p className="nav-label">Favorites</p>
              {favorites.map((favorite) => {
                const item = navItems.find((entry) => entry.id === favorite);
                return item ? (
                  <button
                    key={`favorite:${item.id}`}
                    // Malowanie i bieżąca strona z JEDNEGO źródła, tak samo jak
                    // w `navEntry` — ulubiony skrót do Projektów rozjeżdżałby
                    // się przy otwartym rekordzie dokładnie tak samo. Dotyczy
                    // to OBU nośników: `data-nav-open` czyta tu tę samą nazwę,
                    // co wiersz grupy.
                    className={`nav-item nav-favorite ${currentNavId === item.id ? "active" : ""}`}
                    data-nav-open={navOpenId === item.id ? "" : undefined}
                    tabIndex={-1}
                    aria-current={currentNavId === item.id ? "page" : undefined}
                    onFocus={() => preloadSurface(item.id)}
                    onMouseEnter={() => preloadSurface(item.id)}
                    {...navHandlers(destinationContext(item.id, item.label))}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    <span aria-hidden="true">★</span>
                  </button>
                ) : null;
              })}
            </>
          )}
          {!settingsMode && recentContexts.length > 0 && (
            <>
              <p className="nav-label">Recent</p>
              {recentContexts.map((recent) => {
                const item = navItems.find(
                  (entry) => entry.id === recent.surface,
                );
                return (
                  <button
                    key={`recent:${recent.key}`}
                    className="nav-item nav-recent"
                    tabIndex={-1}
                    {...navHandlers(recent)}
                  >
                    <Icon name={item?.icon ?? "project"} />
                    <span>{recent.label}</span>
                    {item !== undefined && item.label !== recent.label && (
                      <small>{item.label}</small>
                    )}
                  </button>
                );
              })}
            </>
          )}
          {/* TRYB USTAWIEŃ: lewa kolumna przestaje być nawigacją po pracy
              i staje się spisem sekcji. Nawigacja nie jest ukrywana stylem —
              po prostu się nie renderuje, więc nie zostaje osiągalna Tabem
              w miejscu, którego nie widać. */}
          {settingsMode ? (
            <nav
              className="settings-mode-column"
              aria-label="Settings sections"
            >
              {/* PASMO, NIE PIERWSZY WIERSZ LISTY (`v3/screens/settings.css:40-43`
              — `.st-nav-head` ma `min-height: var(--header-band-height)`
              i własną dolną krawędź, a spis zaczyna się dopiero POD nią).
              Wyjście z trybu stało dotąd w tej samej kolumnie co sekcje, więc
              czytało się jak siódma sekcja. */}
              <div className="settings-mode-head">
                <button
                  type="button"
                  className="nav-item settings-mode-back"
                  data-settings-back="true"
                  // NAZWA DLA CZYTNIKA, NIE OZDOBA. At rail width the shared
                  // rule `.desktop-shell.rail .nav-item > span { display: none }`
                  // (styles.css:4748, inside the rail block that begins at
                  // :4744) takes BOTH children out of the accessibility tree,
                  // and the
                  // only way out of settings mode was left announcing itself as
                  // „‹". The label is now on the button, so it survives the
                  // width at which the text disappears.
                  aria-label="Leave settings"
                  onClick={leaveSettings}
                >
                  <span aria-hidden="true">‹</span>
                  <span>Settings</span>
                </button>
              </div>
              {/* SPIS DZIELI SIĘ NA NAZWANE GRUPY I KAŻDA POZYCJA MA GLIF
              (`v3/screens/settings.css:57-60` — `.st-nav-glabel`, wersaliki
              `--text-2xs` z rozstrzeleniem 0,06em w kolorze czwartorzędnym;
              `:61-71` — `.st-navitem` z torem ikony `.ico` przed etykietą;
              złożone w `v3/screens/settings.js:996-1000`).

              GRUPY SĄ WYPROWADZONE Z JEDNEJ LISTY, nie zadeklarowane obok niej
              — `settingsCategoryGroups` skleja SĄSIADUJĄCE kategorie o tej
              samej nazwie grupy. Druga lista wypisująca „które kategorie są
              w której grupie" byłaby ręczną listą obok zamkniętego słownika,
              czyli klasą defektu, którą to repo przegrywa od kilku fal:
              kategoria dopisana do słownika i nieprzepisana do tamtej listy
              zniknęłaby ze spisu bez ani jednego błędu. Tutaj kategoria bez
              grupy nie kompiluje się. */}
              {settingsCategoryGroups.map((group) => (
                <div className="settings-mode-group" key={group.label}>
                  {/* `aria-hidden`, tak jak w prototypie (`settings.js:998`):
                  nagłówek grupy jest podziałem WZROKOWYM, a czytnik ekranu ma
                  tę samą listę już opisaną nazwą `nav`. Wypowiedziany byłby
                  szóstym powtórzeniem tej samej informacji. */}
                  <p className="settings-mode-group-label" aria-hidden="true">
                    {group.label}
                  </p>
                  {group.categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className="nav-item settings-mode-section"
                      data-settings-section={category.id}
                      // CO TA POZYCJA STEROWANIE — przeprowadzone razem ze
                      // znacznikiem. Skasowany nawigator w treści ekranu niósł
                      // `aria-controls`; ten niósł tylko atrybut danych, czyli
                      // adres dla testu, a nie dla czytnika ekranu.
                      aria-controls={settingsCategoryElementId(category.id)}
                      // JEDEN NAWIGATOR USTAWIEŃ, I TO JEST TEN
                      // (`v3/screens/settings.css:36-80`, `:76-80`). Do fali E
                      // stały trzy: ta kolumna, drugi nawigator w treści ekranu
                      // i natywna kontrolka wąskiego okna. Kolumna była jedyną,
                      // która NIE mówiła, gdzie czytelnik jest — a jest jedyną,
                      // która stoi tam, gdzie prototyp trzyma spis sekcji.
                      aria-current={
                        settingsCategory === category.id
                          ? "location"
                          : undefined
                      }
                      onClick={() => {
                        // Stan ustawiony OD RAZU, a nie dopiero z obserwatora
                        // przecięć na ekranie: ostatnia sekcja bywa krótsza niż
                        // okno i przewinięcie do niej nie zawsze przesuwa próg,
                        // więc znacznik zostawał na poprzedniej. Obserwator
                        // poprawia tę wartość przy każdym dalszym przewinięciu.
                        setSettingsCategory(category.id);
                        document
                          .getElementById(
                            settingsCategoryElementId(category.id),
                          )
                          ?.scrollIntoView({
                            block: "start",
                            behavior: "auto",
                          });
                      }}
                    >
                      <Icon name={category.icon} />
                      <span>{category.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          ) : (
            <>
              {/* Cele bez modułu (Today, Inbox) stoją NAD modułami i bez nagłówka
              grupy: to nie są filtry, tylko tryby pracy. Renderują się tą samą
              funkcją co pozycje w modułach, więc nie mogą się od nich rozjechać.

              LISTA JEST `sidebarNavItems`, i to jest poprawka defektu, a nie
              kosmetyka. Stał tu warunek `item.shortcut !== null`, który miał
              odsiać Ustawienia i NIE ODSIEWAŁ NICZEGO — `nav-items.ts` opuszcza
              klucz, więc `undefined !== null` jest prawdą i Ustawienia rysowały
              się w lewej kolumnie wbrew dwóm komentarzom w drzewie mówiącym, że
              tak nie jest. Wejściem jest koło zębate przy tożsamości i `⌘,`. */}
              {sidebarNavItems
                .filter((item) => item.group === null)
                .map((item) => navEntry(item))}
              {navigationGroups.map((group) => {
                // Też `sidebarNavItems`, a nie `navItems`: obie gałęzie lewej
                // kolumny — cele bez modułu wyżej i cele w modułach tutaj —
                // czytają JEDNĄ regułę o tym, co się w niej rysuje. Dziś
                // wychodzi na to samo, bo tryb Ustawień nie ma modułu; wpis
                // rejestru z modułem i `chrome: "mode"` rysowałby się mimo
                // wszystko, a to jest dokładnie ten kształt, który przez dwie
                // fale odsiewał nic.
                const groupItems = sidebarNavItems.filter(
                  (item) => item.group === group,
                );
                const activeGroupItem = groupItems.find(
                  (item) => item.id === surface,
                );
                const expanded =
                  railMode || !collapsedNavigationGroups.includes(group);
                // `aria-controls` rozdziela wartość po BIAŁYCH ZNAKACH, więc nazwa
                // modułu ze spacją („Work Management") rozpadała się na dwa tokeny
                // — `primary-navigation-work` i `management` — z których żaden nie
                // istniał. Przycisk rozwijania wskazywał w nicość, a asystujące
                // technologie nie miały jak powiedzieć, co on właściwie otwiera.
                // Poprzednie nazwy grup („Praca", „Wiedza") były jednowyrazowe,
                // więc defekt czekał na pierwszą nazwę ze spacją.
                const groupId = `primary-navigation-${group
                  .toLocaleLowerCase("en")
                  .replace(/[^a-z0-9]+/gu, "-")
                  .replace(/^-|-$/gu, "")}`;
                return (
                  <div className="nav-group" key={group}>
                    {!railMode && (
                      <button
                        type="button"
                        className={`nav-group-toggle${activeGroupItem === undefined ? "" : " contains-current"}`}
                        tabIndex={
                          activeGroupItem !== undefined && !expanded ? 0 : -1
                        }
                        aria-expanded={expanded}
                        aria-controls={groupId}
                        aria-label={
                          activeGroupItem === undefined
                            ? group
                            : `${group}, current view ${activeGroupItem.label}`
                        }
                        onClick={() => toggleNavigationGroup(group)}
                      >
                        {/* DASZEK JEST PIERWSZYM DZIECKIEM, tak jak
                        w prototypie (`v3/app.js:599` — `icon("chevDown")`
                        przed `<span>` z nazwą modułu). Kolejność w JSX-ie JEST
                        tu układem: siatka `.nav-group-toggle` przypisuje tory
                        po kolejności dzieci, więc zostawienie tego elementu na
                        końcu przy zmienionych torach postawiłoby daszek pod
                        etykietą, a nie przed nią. */}
                        <span
                          className="nav-group-chevron"
                          aria-hidden="true"
                        />
                        <span>{group}</span>
                        {activeGroupItem !== undefined && !expanded && (
                          <small>{activeGroupItem.label}</small>
                        )}
                      </button>
                    )}
                    <div
                      id={groupId}
                      className="nav-group-items"
                      role="group"
                      aria-label={group}
                      hidden={!expanded}
                    >
                      {/* `flatMap`, żeby drugi poziom stanął POD swoim celem,
                      a nie na końcu modułu: kolejność w rejestrze nie jest
                      kontraktem i cel dołożony za Projektami rozsunąłby
                      wiersze potomne od ich rodzica bez ani jednego błędu. */}
                      {groupItems.flatMap((item) =>
                        item.id === "projects" && !railMode
                          ? [navEntry(item), projectNavChildren]
                          : item.id === "tasks" && !railMode
                            ? [navEntry(item), savedViewNavChildren]
                            : navEntry(item),
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </nav>
        <div className="sidebar-spacer" />
        {isPreview && (
          <details className="fixture-condition">
            <summary>Preview condition</summary>
            {/* STAN BUILDA STOI TU, A NIE W WIERSZU TOŻSAMOŚCI, i to jest cała
                treść P-3. „Developer preview / Session memory · <wersja>"
                zajmowało miejsce, w którym prototyp pisze imię czytelnika
                (`v3/app.js:661` — `${avatar(ME)}<span class="who">Kacper</span>`),
                czyli powłoka mówiła CZYM JEST BUILD tam, gdzie człowiek szuka
                KIM JEST. Obie informacje zostają: ta schodzi o jeden element
                wyżej, do pojemnika, który i tak istnieje wyłącznie w podglądzie
                i znika z buildem produkcyjnym w całości.

                `· {build.version}` NIE MA TU ZAMIENNIKA I NIE WRACA. Wersja
                stoi w Ustawieniach dwa razy (`SettingsSurface.tsx`, podtytuł
                kategorii „Setup and app" i jej wartość); trzecia kopia w
                stopce paska bocznego była kopią wartości. */}
            <p className="fixture-condition-build">
              Developer preview ·{" "}
              {build.persistence === "encrypted-local"
                ? "encrypted local storage"
                : "session memory"}
            </p>
            <select
              value={previewCondition}
              onChange={(event) =>
                setPreviewCondition(event.target.value as PreviewCondition)
              }
              aria-label="Choose a deterministic preview condition"
            >
              <option value="ready">Ready</option>
              <option value="offline">Offline</option>
              <option value="retry">Retry</option>
              <option value="partial">Partial</option>
              <option value="conflict">Conflict</option>
              <option value="permission">Permission</option>
              <option value="recovery">Recovery</option>
            </select>
          </details>
        )}
        {/* STOPKA PASKA BOCZNEGO NALEŻY DO CZŁOWIEKA (`v3/app.js:660-664`,
            `v3/app.css:262-267`). Stała tu `.preview-identity`: kropka stanu,
            nazwa KANAŁU BUILDA i rodzaj magazynu z numerem wersji — trzy
            zdania o programie w jedynym miejscu powłoki, które prototyp
            oddaje czytelnikowi. Kanał zszedł do `.fixture-condition` wyżej,
            magazyn stoi teraz na drugiej linii kafla przestrzeni (P-2, jedno
            zdanie zamiast dwóch), a wersja nie ma tu zamiennika.

            IMIĘ JEST OSIĄGALNE ZAWSZE I NIE KOSZTUJE NOWEGO ODCZYTU.
            `snapshot.access` jest w migawce powłoki od dawna
            (`client/workflow.ts`, `DataSlice<AccessProjection>`), a członek
            niebędący zarządcą i tak dostaje SWOJE własne członkostwo
            (`application/src/collaboration.ts` — `canManage ? … : [membership]`),
            więc `currentPrincipalId` zawsze ma się z czym zejść. To NIE jest
            `Person` z grafu: ludzie w grafie nigdy nie logują się do tej
            aplikacji.

            ODCZYT NIEDOSTĘPNY RYSUJE NIC, NIGDY ZASTĘPNIK — ta sama reguła co
            przy licznikach nawigacji (`.ui-craft/patterns.md`, „Pattern:
            Navigation row"). Ani „You", ani inicjał przestrzeni w miejscu
            inicjału człowieka: kafel z cudzą literą jest gorszy niż pusty
            wiersz, bo wygląda na odpowiedź. Zostają wtedy same dwie
            kontrolki. */}
        <div className="sidebar-foot">
          {viewerName !== undefined && (
            <>
              <span className="sidebar-foot-avatar" aria-hidden="true">
                {[...viewerName.trim()][0]?.toUpperCase() ?? "·"}
              </span>
              <span className="sidebar-foot-who" data-sidebar-identity="true">
                {viewerName}
              </span>
            </>
          )}
          {/* THE COLLAPSE AFFORDANCE THE SHELL NEVER HAD (`v3/app.js:662`,
              which puts it in the sidebar foot beside Settings — same place).
              Until now the rail was a pure consequence of window width: a
              person on a wide screen could not ask for the room, and a person
              on a narrow one could not ask for the labels back.

              NAME AND STATE, NOT JUST A GLYPH. `aria-expanded` says which way
              the sidebar is, `aria-controls` says what it is about, and the
              name changes with the state — a control whose only signal is a
              rotating chevron says nothing to a screen reader. The labels this
              collapses are NOT lost from the accessibility tree: every control
              in the sidebar carries its own `aria-label` (`navEntry`, the
              search control, the workspace switcher), so `display: none` on
              the visible `<span>` removes paint, not names.

              DISABLED WHEN THE WINDOW ALREADY FORCES THE RAIL, because at
              ≤50rem there is no room to expand into and a button that flips a
              state nothing can honour is a lie with a tooltip. */}
          <button
            type="button"
            className="icon-button sidebar-collapse"
            data-sidebar-collapse="true"
            aria-controls="workspace-sidebar"
            aria-expanded={!railMode}
            aria-label={
              railMode ? "Expand the sidebar" : "Collapse the sidebar"
            }
            title={railMode ? "Expand the sidebar" : "Collapse the sidebar"}
            disabled={narrowRail}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <Icon name="chevron-right" />
          </button>
          {/* Wejście w tryb Ustawień stoi PRZY tożsamości, bo to jest miejsce,
              w którym człowiek szuka „moich rzeczy" — a nie kolejna pozycja
              w rzędzie celów pracy. */}
          <button
            type="button"
            className="icon-button settings-entry"
            data-settings-entry="true"
            aria-label={`Open settings, ${modifierLabel},`}
            // Napis w dymku niósł `⌘` na sztywno, a skrót działa też pod
            // `ctrl` — na Windowsie tooltip obiecywał klawisz, którego tam
            // nie ma. Jedno źródło, `modifierLabel`, w obu.
            title={`Settings (${modifierLabel},)`}
            onClick={openSettings}
          >
            <Icon name="settings" />
          </button>
        </div>
      </aside>

      {/* `data-surface` na planie roboczym: stabilny zaczep, po którym testy
          i smoke'i spakowanej apki rozpoznają aktywny cel, zamiast dopasowywać
          nazwę klasy albo widoczny napis. Klasa `work-column` przeniesie się
          przy rozbiciu powłoki, a napis zmieni się przy flipie na angielski —
          ten atrybut nie zmienia się przy żadnym z nich. */}
      <main
        className="work-column"
        data-surface={surface}
        aria-labelledby="surface-title"
      >
        <div
          className="work-surface wave2-work"
          id="main-content"
          role="tabpanel"
          tabIndex={-1}
          aria-labelledby={`shell-tab-${Math.max(
            0,
            navigation.tabs.findIndex(
              (tab) => tab.key === navigation.activeKey,
            ),
          )}`}
        >
          {notice && (
            <div
              className={`notice notice-${notice.kind}`}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              <span>{notice.message}</span>
              {notice.kind !== "retry" && (
                <button
                  className="text-button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(`${notice.kind}: ${notice.message}`)
                      .catch(() => undefined)
                  }
                >
                  Copy details
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Close message"
                onClick={() => setNotice(undefined)}
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          {isPreview && previewCondition !== "ready" && (
            <div
              className={`condition-banner tone-${conditionCopy[previewCondition].tone}`}
              role="status"
            >
              <span className="condition-symbol" aria-hidden="true">
                i
              </span>
              <div>
                <strong>{conditionCopy[previewCondition].title}</strong>
                <span>{conditionCopy[previewCondition].detail}</span>
              </div>
              <button
                className="secondary-button compact"
                onClick={() => setPreviewCondition("ready")}
              >
                {conditionCopy[previewCondition].action}
              </button>
            </div>
          )}
          {surfacePanels[surface]?.()}
        </div>

        <div className="capture-dock-layer">
          <button className="capture-dock" onClick={openCapture}>
            <span className="capture-dock-content">
              <Icon name="capture" />
              {/* WPIS 1-8 OGONA FAZY III — dwa nadmiarowe „a".
                  Prototyp: `<span class="lbl">Capture a thought, link or
                  task…</span>` (`v3/app.js:566`). Trzy pary rejestru stoją na
                  DOKŁADNIE tym podmiocie (`L1-10a` promień, `L1-10b`
                  wyściółka, `L1-10c` `min-height`) i żadna nie dotyka tekstu,
                  więc ten napis mógł się rozjechać w ciszy. Wyliczenie po
                  angielsku niesie rodzajnik RAZ, przy pierwszym członie. */}
              <span className="capture-dock-label">
                Capture a thought, link or task…
              </span>
            </span>
            <kbd>{modifierLabel}⇧K</kbd>
          </button>
        </div>
      </main>

      {narrowShell && inspectorDetailOpen && (
        <div
          className="inspector-scrim"
          aria-hidden="true"
          onClick={dismissInspector}
        />
      )}
      <aside
        className={`inspector${surface === "meetings" ? " inspector--meeting" : ""}${inspectorDetailOpen ? " open" : ""}`}
        aria-label="Context preview"
        aria-hidden={!inspectorDetailOpen}
      >
        <div
          className="inspector-resize"
          role="separator"
          aria-orientation="vertical"
          // Separator jest `tabIndex={0}` i ma obsługę strzałek, więc człowiek
          // z klawiaturą go DOSIĘGA — i nie dowiadywał się o podwójnym
          // kliknięciu niczego, bo gest stał wyłącznie w dymku, którego nie
          // widzi nikt niehoverujący. Zdanie wraca do nazwy, która i tak tu
          // była.
          aria-label="Resize the preview panel; double-click restores the default width"
          aria-valuemin={280}
          aria-valuemax={640}
          aria-valuenow={inspectorWidth}
          tabIndex={0}
          onPointerDown={beginInspectorResize}
          onPointerMove={moveInspectorResize}
          onPointerUp={endInspectorResize}
          onPointerCancel={endInspectorResize}
          onDoubleClick={() => setInspectorWidth(320)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setInspectorWidth((width) => Math.min(640, width + 16));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setInspectorWidth((width) => Math.max(280, width - 16));
            }
          }}
        />
        <header
          className="inspector-header"
          tabIndex={-1}
          ref={inspectorPanel.focusTargetRef}
        >
          <div>
            <span>Context preview</span>
            <small>
              {selectedTask
                ? "Task"
                : selectedProject
                  ? "Project"
                  : selectedWorkContextRecord
                    ? selectedWorkContextRecord.kind === "area"
                      ? "Area"
                      : "Initiative"
                    : selectedStrategicRecord
                      ? (recordKindLabels[selectedStrategicRecord.kind] ??
                        "Strategic record")
                      : selectedAttention
                        ? "Signal"
                        : surface === "meetings"
                          ? "Jamie result"
                          : isLibraryReading(surface)
                            ? libraryInspectorLabel[documentInspectorKind]
                            : "Workspace"}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Close the context preview"
            onClick={dismissInspector}
          >
            <Icon name="close" />
          </button>
        </header>
        {surface === "meetings" ? (
          <div
            className="surface-inspector-host"
            ref={setMeetingInspectorHost}
          />
        ) : isLibraryReading(surface) ? (
          <div
            className="surface-inspector-host"
            ref={setDocumentInspectorHost}
          />
        ) : selectedAttention ? (
          <AttentionDetail
            item={selectedAttention}
            busy={attentionBusy}
            onOpen={openAttentionDestination}
            onRead={readAttention}
            onDismiss={dismissAttention}
            onRouteCapture={routeAttentionCapture}
            onRetryCapture={retryAttentionCapture}
            onKeepCapture={keepAttentionCapture}
            onReplaceCapturePayload={replaceAttentionPayload}
          />
        ) : selectedTask ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedTask.completionState === "completed"
                ? "Completed"
                : selectedTask.status.label}
            </span>
            <h2>{selectedTask.title}</h2>
            <p className="record-summary">
              {sourceCapture
                ? "Created from a kept Capture."
                : "In the active workspace."}
            </p>
            <section className="inspector-section task-context-block">
              <p className="section-label">Working context</p>
              {taskEditOpen ? (
                <form
                  className="task-context-editor"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      taskEditWantsFocusRef.current = true;
                      setTaskEditOpen(false);
                    }
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!client || taskEditBusy) return;
                    const timeZone =
                      state.snapshot.bootstrap.workspace.timezone;
                    const title = taskDraft.title.trim();
                    const description = taskDraft.description.trim();
                    const nextAction = taskDraft.nextAction.trim();
                    if (title.length === 0) return;
                    const currentStartDate =
                      selectedTask.startAt === undefined
                        ? ""
                        : dateKeyInZone(selectedTask.startAt, timeZone);
                    const currentDueDate =
                      selectedTask.dueAt === undefined
                        ? ""
                        : dateKeyInZone(selectedTask.dueAt, timeZone);
                    const startAt =
                      taskDraft.startDate === ""
                        ? null
                        : instantForZonedDate(
                            taskDraft.startDate,
                            timeZone,
                            "start",
                          );
                    const dueAt =
                      taskDraft.dueDate === ""
                        ? null
                        : instantForZonedDate(
                            taskDraft.dueDate,
                            timeZone,
                            "end",
                          );
                    if (startAt === undefined || dueAt === undefined) {
                      showFailure({
                        kind: "error",
                        message: "That date has an invalid format.",
                      });
                      return;
                    }
                    if (
                      taskDraft.startDate !== "" &&
                      taskDraft.dueDate !== "" &&
                      taskDraft.startDate > taskDraft.dueDate
                    ) {
                      showFailure({
                        kind: "error",
                        message:
                          "Start cannot fall after the deadline. Fix the dates and save again.",
                      });
                      return;
                    }
                    const currentPriority = selectedTask.priority ?? "";
                    const draft = {
                      ...(title === selectedTask.title ? {} : { title }),
                      ...(description === (selectedTask.description ?? "")
                        ? {}
                        : {
                            description:
                              description.length === 0 ? null : description,
                          }),
                      ...(nextAction === (selectedTask.nextAction ?? "")
                        ? {}
                        : {
                            nextAction:
                              nextAction.length === 0 ? null : nextAction,
                          }),
                      ...(taskDraft.startDate === currentStartDate
                        ? {}
                        : { startAt }),
                      ...(taskDraft.dueDate === currentDueDate
                        ? {}
                        : { dueAt }),
                      ...(taskDraft.priority === currentPriority
                        ? {}
                        : {
                            priority:
                              taskDraft.priority === ""
                                ? null
                                : (taskDraft.priority as
                                    "urgent" | "high" | "normal" | "low"),
                          }),
                    };
                    if (Object.keys(draft).length === 0) {
                      taskEditWantsFocusRef.current = true;
                      setTaskEditOpen(false);
                      return;
                    }
                    setTaskEditBusy(true);
                    void updateTaskDetails(
                      client,
                      state.snapshot,
                      selectedTask.id,
                      selectedTask.version,
                      draft,
                    ).then(async (result) => {
                      setTaskEditBusy(false);
                      if (result.kind === "success") {
                        taskEditWantsFocusRef.current = true;
                        setTaskEditOpen(false);
                        await refreshAfter("Task context saved.");
                      } else showFailure(result);
                    });
                  }}
                >
                  <label>
                    <span>Title</span>
                    <input
                      value={taskDraft.title}
                      maxLength={500}
                      required
                      autoFocus
                      disabled={taskEditBusy}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Context</span>
                    <textarea
                      value={taskDraft.description}
                      rows={6}
                      maxLength={16000}
                      disabled={taskEditBusy}
                      placeholder="What do you need to know to pick this up later?"
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Next step</span>
                    <input
                      value={taskDraft.nextAction}
                      maxLength={500}
                      disabled={taskEditBusy}
                      placeholder="One sentence: where to start."
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          nextAction: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="task-context-dates">
                    <label>
                      <span>Start</span>
                      <input
                        type="date"
                        value={taskDraft.startDate}
                        disabled={taskEditBusy}
                        onChange={(event) =>
                          setTaskDraft((current) => ({
                            ...current,
                            startDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Deadline</span>
                      <input
                        type="date"
                        value={taskDraft.dueDate}
                        disabled={taskEditBusy}
                        onChange={(event) =>
                          setTaskDraft((current) => ({
                            ...current,
                            dueDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>Priority</span>
                    <select
                      value={taskDraft.priority}
                      disabled={taskEditBusy}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          priority: event.target.value,
                        }))
                      }
                    >
                      <option value="">Default (normal)</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </label>
                  <div className="task-context-actions">
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={taskEditBusy || !client}
                    >
                      {taskEditBusy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={taskEditBusy}
                      onClick={() => {
                        taskEditWantsFocusRef.current = true;
                        setTaskEditOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {selectedTask.description ? (
                    <p className="task-context-text">
                      {selectedTask.description}
                    </p>
                  ) : (
                    <p>
                      No context saved yet. Add notes so you can pick this up
                      without reconstructing it from memory.
                    </p>
                  )}
                  {selectedTask.nextAction && (
                    <p className="task-next-action">
                      <span>Next step:</span> {selectedTask.nextAction}
                    </p>
                  )}
                  {(selectedTask.startAt !== undefined ||
                    selectedTask.dueAt !== undefined ||
                    selectedTask.priority !== undefined) && (
                    <p className="task-timing-line">
                      {selectedTask.startAt !== undefined && (
                        <span>
                          Start:{" "}
                          {formatDate(
                            selectedTask.startAt,
                            state.snapshot.bootstrap.workspace.timezone,
                          )}
                        </span>
                      )}
                      {selectedTask.dueAt !== undefined && (
                        <span
                          className={
                            selectedTask.completionState === "open" &&
                            Date.parse(selectedTask.dueAt) < Date.now()
                              ? "task-overdue"
                              : undefined
                          }
                        >
                          Deadline:{" "}
                          {formatDate(
                            selectedTask.dueAt,
                            state.snapshot.bootstrap.workspace.timezone,
                          )}
                          {selectedTask.completionState === "open" &&
                          Date.parse(selectedTask.dueAt) < Date.now()
                            ? " · overdue"
                            : ""}
                        </span>
                      )}
                      {selectedTask.priority !== undefined &&
                        selectedTask.priority !== "normal" && (
                          <span>
                            Priority:{" "}
                            {taskPriorityLabels[selectedTask.priority]}
                          </span>
                        )}
                    </p>
                  )}
                  <button
                    type="button"
                    className="secondary-button"
                    ref={taskEditButtonRef}
                    onClick={() => {
                      const timeZone =
                        state.snapshot.bootstrap.workspace.timezone;
                      setTaskDraft({
                        title: selectedTask.title,
                        description: selectedTask.description ?? "",
                        nextAction: selectedTask.nextAction ?? "",
                        startDate:
                          selectedTask.startAt === undefined
                            ? ""
                            : dateKeyInZone(selectedTask.startAt, timeZone),
                        dueDate:
                          selectedTask.dueAt === undefined
                            ? ""
                            : dateKeyInZone(selectedTask.dueAt, timeZone),
                        priority: selectedTask.priority ?? "",
                      });
                      setTaskEditOpen(true);
                    }}
                  >
                    Edit context
                  </button>
                </>
              )}
            </section>
            {client && (
              <TaskReservationSection
                client={client}
                snapshot={state.snapshot}
                taskId={selectedTask.id}
                taskVersion={selectedTask.version}
                taskTitle={selectedTask.title}
                block={selectedTask.calendarBlock}
                onRecorded={refreshAfter}
                onFailure={showFailure}
              />
            )}
            <section className="inspector-section subtasks-block">
              <p className="section-label">Subtasks</p>
              {selectedTask.parentTaskId !== undefined ? (
                <p>
                  Part of:{" "}
                  <button
                    type="button"
                    className="inspector-link"
                    onClick={() => {
                      const parentId = selectedTask.parentTaskId;
                      if (parentId !== undefined)
                        selectTaskInInspector(parentId);
                    }}
                  >
                    {tasks.find((item) => item.id === selectedTask.parentTaskId)
                      ?.title ?? "Parent task"}
                  </button>
                </p>
              ) : (
                (() => {
                  const children = tasks.filter(
                    (item) => item.parentTaskId === selectedTask.id,
                  );
                  const doneCount = children.filter(
                    (child) => child.completionState === "completed",
                  ).length;
                  return (
                    <>
                      {children.length === 0 ? (
                        <p>
                          Split the outcome only when part of the work has its
                          own state, deadline or assignee.
                        </p>
                      ) : (
                        <>
                          <p>
                            {doneCount} of {children.length} completed
                            {doneCount === children.length
                              ? " · closing the outcome stays your call"
                              : ""}
                          </p>
                          <ul className="inspector-links subtask-list">
                            {children.map((child) => (
                              <li key={child.id}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    selectTaskInInspector(child.id)
                                  }
                                >
                                  <i
                                    aria-hidden="true"
                                    className={
                                      child.completionState === "completed"
                                        ? "subtask-done"
                                        : "subtask-open"
                                    }
                                  />
                                  {child.title}
                                  {child.completionState === "completed"
                                    ? " · completed"
                                    : ""}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      <form
                        className="subtask-create"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!client || subtaskBusy) return;
                          const title = subtaskDraft.trim();
                          if (title.length === 0) return;
                          setSubtaskBusy(true);
                          void createTask(client, state.snapshot, {
                            title,
                            parentTaskId: selectedTask.id,
                          }).then(async (result) => {
                            setSubtaskBusy(false);
                            if (result.kind === "success") {
                              setSubtaskDraft("");
                              await refreshAfter("Subtask created.");
                            } else showFailure(result);
                          });
                        }}
                      >
                        <label>
                          <span className="sr-only">New subtask title</span>
                          <input
                            value={subtaskDraft}
                            maxLength={500}
                            disabled={subtaskBusy}
                            placeholder="Add a subtask"
                            onChange={(event) =>
                              setSubtaskDraft(event.target.value)
                            }
                          />
                        </label>
                        <button
                          type="submit"
                          className="secondary-button"
                          disabled={subtaskBusy || subtaskDraft.trim() === ""}
                        >
                          Add
                        </button>
                      </form>
                    </>
                  );
                })()
              )}
            </section>
            {(state.snapshot.bootstrap.fieldDefinitions ?? []).some(
              (definition) =>
                definition.targetKind === "task" &&
                (definition.state !== "retired" ||
                  selectedTask.fields?.[definition.id] !== undefined),
            ) && (
              <section className="inspector-section task-fields-block">
                <p className="section-label">Fields</p>
                {(state.snapshot.bootstrap.fieldDefinitions ?? [])
                  .filter(
                    (definition) =>
                      definition.targetKind === "task" &&
                      (definition.state !== "retired" ||
                        selectedTask.fields?.[definition.id] !== undefined),
                  )
                  .map((definition) => {
                    const current = selectedTask.fields?.[definition.id];
                    const retired = definition.state === "retired";
                    const draft = fieldDrafts[definition.id];
                    const commit = (value: FieldValue | null) => {
                      if (!client || fieldSaveBusy) return;
                      setFieldSaveBusy(true);
                      void setRecordFieldValue(client, state.snapshot, {
                        targetKind: "task",
                        recordId: selectedTask.id,
                        recordVersion: selectedTask.version,
                        fieldId: definition.id,
                        value,
                      }).then(async (result) => {
                        setFieldSaveBusy(false);
                        if (result.kind === "success") {
                          setFieldDrafts((currentDrafts) => {
                            const next = { ...currentDrafts };
                            delete next[definition.id];
                            return next;
                          });
                          await refreshAfter("Field value saved.");
                        } else showFailure(result);
                      });
                    };
                    return (
                      <div className="task-field-row" key={definition.id}>
                        <span className="task-field-label">
                          {definition.label}
                          {retired ? " (retired)" : ""}
                        </span>
                        {retired ||
                        definition.type.kind === "formula" ||
                        definition.type.kind === "rollup" ? (
                          <span className="task-field-value">
                            {current?.kind === "date"
                              ? formatDate(
                                  current.value,
                                  state.snapshot.bootstrap.workspace.timezone,
                                )
                              : String(current?.value ?? "—")}
                            {!retired &&
                            (definition.type.kind === "formula" ||
                              definition.type.kind === "rollup")
                              ? " · calculated"
                              : ""}
                          </span>
                        ) : definition.type.kind === "choice" ? (
                          <select
                            aria-label={definition.label}
                            disabled={fieldSaveBusy}
                            value={
                              current?.kind === "choice" ? current.value : ""
                            }
                            onChange={(event) =>
                              commit(
                                event.target.value === ""
                                  ? null
                                  : {
                                      kind: "choice",
                                      value: event.target.value,
                                    },
                              )
                            }
                          >
                            <option value="">—</option>
                            {definition.type.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : definition.type.kind === "date" ? (
                          <input
                            type="date"
                            aria-label={definition.label}
                            disabled={fieldSaveBusy}
                            value={
                              current?.kind === "date"
                                ? dateKeyInZone(
                                    current.value,
                                    state.snapshot.bootstrap.workspace.timezone,
                                  )
                                : ""
                            }
                            onChange={(event) => {
                              const date = event.target.value;
                              if (date === "") {
                                if (current !== undefined) commit(null);
                                return;
                              }
                              const instant = instantForZonedDate(
                                date,
                                state.snapshot.bootstrap.workspace.timezone,
                                "end",
                              );
                              if (instant !== undefined)
                                commit({ kind: "date", value: instant });
                            }}
                          />
                        ) : (
                          <form
                            className="task-field-edit"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const raw = (
                                draft ?? String(current?.value ?? "")
                              ).trim();
                              if (raw === "") {
                                if (current !== undefined) commit(null);
                                return;
                              }
                              if (definition.type.kind === "number") {
                                const parsed = Number(raw);
                                if (!Number.isFinite(parsed)) {
                                  showFailure({
                                    kind: "error",
                                    message: "That number is not valid.",
                                  });
                                  return;
                                }
                                commit({ kind: "number", value: parsed });
                              } else {
                                commit({ kind: "text", value: raw });
                              }
                            }}
                          >
                            <input
                              aria-label={definition.label}
                              disabled={fieldSaveBusy}
                              inputMode={
                                definition.type.kind === "number"
                                  ? "decimal"
                                  : undefined
                              }
                              value={draft ?? String(current?.value ?? "")}
                              onChange={(event) =>
                                setFieldDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [definition.id]: event.target.value,
                                }))
                              }
                            />
                            {draft !== undefined &&
                              draft !== String(current?.value ?? "") && (
                                <button
                                  type="submit"
                                  className="secondary-button"
                                  disabled={fieldSaveBusy}
                                >
                                  Save
                                </button>
                              )}
                          </form>
                        )}
                      </div>
                    );
                  })}
              </section>
            )}
            {client && (
              <TaskAssignmentSection
                client={client}
                onAssigned={refreshAfter}
                onFailure={showFailure}
                snapshot={state.snapshot}
                task={selectedTask}
              />
            )}
            <section className="inspector-section provenance-block">
              <p className="section-label">Capture origin</p>
              {sourceCapture ? (
                <>
                  <blockquote>{sourceCapture.originalText}</blockquote>
                  <p>Quick Capture · original kept</p>
                </>
              ) : (
                <p>No linked Capture source.</p>
              )}
            </section>
            <Suspense fallback={null}>
              <TaskAttachmentsSection
                client={client}
                snapshot={state.snapshot}
                task={selectedTask}
                canEdit={canResolveComments}
                busy={attachmentBusy}
                onBusyChange={setAttachmentBusy}
                onSnapshot={(next) =>
                  setState({ kind: "ready", snapshot: next })
                }
                onChanged={refreshAfter}
                onFailure={showFailure}
                onRestore={restoreManagedAttachment}
              />
            </Suspense>
            <section className="inspector-section audit-block">
              <p className="section-label">Audit trail</p>
              {receipt ? (
                <dl>
                  <div>
                    <dt>Command</dt>
                    <dd>{receipt.commandName}</dd>
                  </div>
                  <div>
                    <dt>Receipt</dt>
                    <dd className="mono">{receipt.id.slice(0, 18)}…</dd>
                  </div>
                </dl>
              ) : (
                <p>The full receipt stays in the local data core.</p>
              )}
            </section>
            {client && (
              <TaskRemovalSection
                client={client}
                snapshot={state.snapshot}
                taskId={selectedTask.id}
                taskVersion={selectedTask.version}
                activeChildCount={
                  tasks.filter((item) => item.parentTaskId === selectedTask.id)
                    .length
                }
                onRemoved={async (message) => {
                  await refreshAfter(message);
                  setSelectedTaskId(undefined);
                }}
                onFailure={showFailure}
              />
            )}
            {/* The rail's Comments, and the SAME panel the project and the
                organization records draw. The older one lived here alone and
                had grown replies, editing, resolving and attachments the record
                screens could not offer — so consistency was reached by growing
                the shared panel to match, not by giving the task less.

                It stands down for ONE case: this task open as a record on the
                Tasks screen, where the record's own Comments tab is the
                conversation and two live composers a hand apart is two places
                to write one thing. The test is the OPENED task and not merely
                the selected one — a task selected from Today, Inbox or Calendar
                has no record on screen to defer to, and would lose its comments
                entirely. Every other rail section stays: the record reads, the
                rail edits.

                `record` is the whole test, and reading `taskId` alone was not
                it: a signal activated from the operating system navigates to a
                task context WITHOUT asking for the record, so the rail hid its
                comments and no record appeared to hold them — the packaged hub
                smoke opened an exact comment context and found neither. The
                same flag that decides whether the record is drawn has to decide
                whether the rail defers to it, or the two disagree. */}
            {!(
              surface === "tasks" &&
              activeContext.record === true &&
              activeContext.taskId === selectedTask.id
            ) && (
              <section className="inspector-section">
                <p className="section-label">Comments</p>
                {/* The message sits ABOVE the panel and no longer INSTEAD of it.
                  A read that failed says what went wrong — rather than one
                  sentence for every cause — but it must not also cost the
                  reader the ability to write: the composer takes its version
                  from the selected task, not from this slice, so a write still
                  lands with no threads on screen. Short-circuiting here is what
                  left a member with `comment` access looking at a message and
                  no composer. */}
                {comments.kind === "unavailable" && (
                  <p role="status">{comments.message}</p>
                )}
                <Suspense fallback={null}>
                  <RecordCommentsPanel
                    actorOf={actorOf}
                    busy={commentBusy}
                    canComment={canComment}
                    canResolve={canResolveComments}
                    currentPrincipalId={currentPrincipalId}
                    currentDisplayName={currentDisplayName}
                    mentionCandidates={commentMentionCandidates}
                    mentionNameOf={(principalId) => mentionNameOf(principalId)}
                    onAttach={stageCommentAttachment}
                    onEdit={(comment, body, attachmentSourceIds) => {
                      if (!client) return Promise.resolve(false);
                      setCommentBusy(true);
                      return editComment(
                        client,
                        state.snapshot,
                        comment.id,
                        comment.version,
                        body,
                        comment.mentionPrincipalIds,
                        attachmentSourceIds,
                      ).then((result) =>
                        settleCommentWrite(commentTarget, result),
                      );
                    }}
                    onInspectAttachment={inspectManagedAttachment}
                    onResolve={(comment, resolved) => {
                      if (!client) return Promise.resolve(false);
                      setCommentBusy(true);
                      return setCommentResolved(
                        client,
                        state.snapshot,
                        comment,
                        resolved,
                      ).then((result) =>
                        settleCommentWrite(commentTarget, result),
                      );
                    }}
                    onRestoreAttachment={restoreManagedAttachment}
                    onSubmit={(body, mentions, parent, attachmentSourceIds) => {
                      if (
                        !client ||
                        commentTarget === undefined ||
                        commentTargetVersion === undefined
                      )
                        return Promise.resolve(false);
                      setCommentBusy(true);
                      return addComment(
                        client,
                        state.snapshot,
                        commentTarget,
                        commentTargetVersion,
                        body,
                        mentions,
                        parent,
                        attachmentSourceIds,
                      ).then((result) =>
                        settleCommentWrite(
                          commentTarget,
                          result,
                          "Comment saved.",
                        ),
                      );
                    }}
                    recordKey={`task-${selectedTask.id}`}
                    threads={
                      comments.kind === "ready" ? comments.data.threads : []
                    }
                    threadsKnown={comments.kind === "ready"}
                    timeZone={recordProse.timeZone}
                  />
                </Suspense>
              </section>
            )}
          </div>
        ) : selectedProject ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedProject.lifecycle === "active"
                ? "Active"
                : selectedProject.lifecycle}
            </span>
            <h2>{selectedProject.title}</h2>
            <p className="record-summary">
              In the active workspace and the current Space scope.
            </p>
            <section className="inspector-section provenance-block">
              <p className="section-label">Intended outcome</p>
              {/* Inspector jest podglądem, więc luka prowadzi na powierzchnię
                  Projektu, gdzie wynik da się napisać. */}
              {selectedProject.needsReview ? (
                <NarrativeGap
                  kind="project"
                  onWrite={() =>
                    openContext(
                      projectContext(selectedProject.id, selectedProject.title),
                    )
                  }
                />
              ) : (
                <ProjectOutcomePreview
                  key={selectedProject.id}
                  projectId={selectedProject.id}
                  outcome={selectedProject.intendedOutcome}
                />
              )}
              <p>The outcome stays part of the versioned project record.</p>
            </section>
            <section className="inspector-section">
              <p className="section-label">Work context</p>
              <dl className="record-fields">
                <div>
                  <dt>Open</dt>
                  <dd>
                    {countLabel(selectedProject.relatedOpenTaskCount, "task")}
                  </dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>
                    {projectOverview?.project.version ??
                      selectedProject.version}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="inspector-section">
              <p className="section-label">Comments</p>
              {/* Above the panel, not instead of it — the same reading as the
                  task rail above. */}
              {comments.kind === "unavailable" && (
                <p role="status">{comments.message}</p>
              )}
              <Suspense fallback={null}>
                <RecordCommentsPanel
                  actorOf={actorOf}
                  busy={commentBusy}
                  canComment={canComment}
                  canResolve={canResolveComments}
                  currentPrincipalId={currentPrincipalId}
                  currentDisplayName={currentDisplayName}
                  mentionCandidates={commentMentionCandidates}
                  mentionNameOf={(principalId) => mentionNameOf(principalId)}
                  onAttach={stageCommentAttachment}
                  onEdit={(comment, body, attachmentSourceIds) => {
                    if (!client) return Promise.resolve(false);
                    setCommentBusy(true);
                    return editComment(
                      client,
                      state.snapshot,
                      comment.id,
                      comment.version,
                      body,
                      comment.mentionPrincipalIds,
                      attachmentSourceIds,
                    ).then((result) =>
                      settleCommentWrite(commentTarget, result),
                    );
                  }}
                  onInspectAttachment={inspectManagedAttachment}
                  onResolve={(comment, resolved) => {
                    if (!client) return Promise.resolve(false);
                    setCommentBusy(true);
                    return setCommentResolved(
                      client,
                      state.snapshot,
                      comment,
                      resolved,
                    ).then((result) =>
                      settleCommentWrite(commentTarget, result),
                    );
                  }}
                  onRestoreAttachment={restoreManagedAttachment}
                  onSubmit={(body, mentions, parent, attachmentSourceIds) => {
                    if (
                      !client ||
                      commentTarget === undefined ||
                      commentTargetVersion === undefined
                    )
                      return Promise.resolve(false);
                    setCommentBusy(true);
                    return addComment(
                      client,
                      state.snapshot,
                      commentTarget,
                      commentTargetVersion,
                      body,
                      mentions,
                      parent,
                      attachmentSourceIds,
                    ).then((result) =>
                      settleCommentWrite(
                        commentTarget,
                        result,
                        "Comment saved.",
                      ),
                    );
                  }}
                  recordKey={`project-${selectedProject.id}`}
                  threads={
                    comments.kind === "ready" ? comments.data.threads : []
                  }
                  threadsKnown={comments.kind === "ready"}
                  timeZone={recordProse.timeZone}
                />
              </Suspense>
            </section>
          </div>
        ) : selectedWorkContextRecord ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedWorkContextRecord.stateLabel}
            </span>
            <h2>{selectedWorkContextRecord.title}</h2>
            <p className="record-summary">
              {selectedWorkContextRecord.kind === "area"
                ? "A standing responsibility in the work model."
                : "An initiative with an outcome to close."}
            </p>
            <section className="inspector-section provenance-block">
              <p className="section-label">
                {selectedWorkContextRecord.kind === "area"
                  ? "Standing responsibility"
                  : "Intended outcome"}
              </p>
              {!selectedWorkContextRecord.needsReview ? (
                <blockquote>{selectedWorkContextRecord.detail}</blockquote>
              ) : workContextNarrative === undefined ? (
                <NarrativeGap
                  kind={selectedWorkContextRecord.kind}
                  onWrite={() => setWorkContextNarrative("")}
                />
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    writeWorkContextNarrative();
                  }}
                >
                  <label className="sr-only" htmlFor="work-context-narrative">
                    {recordNarrativeGaps[selectedWorkContextRecord.kind].field}
                  </label>
                  <textarea
                    id="work-context-narrative"
                    value={workContextNarrative}
                    autoFocus
                    onChange={(event) =>
                      setWorkContextNarrative(event.target.value)
                    }
                  />
                  <div className="capture-footer">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setWorkContextNarrative(undefined)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      disabled={
                        projectBusy || workContextNarrative.trim() === ""
                      }
                      type="submit"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}
              <p>
                {selectedWorkContextRecord.kind === "area"
                  ? "An area has no end date; projects close inside it."
                  : "An initiative closes when this outcome is reached."}
              </p>
            </section>
          </div>
        ) : selectedStrategicRecord ? (
          <StrategicRecordInspector
            record={selectedStrategicRecord}
            records={
              state.snapshot.relationships.kind === "ready"
                ? state.snapshot.relationships.data.records
                : []
            }
            projects={
              state.snapshot.projects.kind === "ready"
                ? state.snapshot.projects.data.items
                : []
            }
            client={client}
            snapshot={state.snapshot}
            onSelectRecord={selectStrategicInInspector}
            onOpenProject={(id, title) =>
              openContext(projectContext(id, title))
            }
            onRemoved={async (message) => {
              await refreshAfter(message);
              setSelectedStrategicId(undefined);
            }}
            // Refresh and KEEP the selection: the record the reader just
            // corrected is still on screen, and dropping it here would answer a
            // one-field correction by closing the inspector.
            onUpdated={refreshAfter}
            onRemoveFailure={showFailure}
          />
        ) : (
          <div className="inspector-empty workspace-context">
            <BrandMark />
            <p className="eyebrow">Active context</p>
            <h2>{bootstrap.workspace.name}</h2>
            <p>
              Root Space ·{" "}
              {coordinatedDataHome
                ? "coordinated Data Home"
                : "local data source"}
            </p>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>
                  {coordinatedDataHome
                    ? "Hub + encrypted working copy"
                    : build.persistence === "encrypted-local"
                      ? "Encrypted local storage"
                      : "Developer preview"}
                </dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>Ready</dd>
              </div>
            </dl>
          </div>
        )}
        {!isLibraryReading(surface) && (
          <DocumentBacklinks
            client={client}
            snapshot={state.snapshot}
            target={
              surface === "meetings" && selectedMeetingId
                ? { targetKind: "meeting", targetId: selectedMeetingId }
                : selectedTask
                  ? { targetKind: "task", targetId: selectedTask.id }
                  : selectedProject
                    ? { targetKind: "project", targetId: selectedProject.id }
                    : selectedStrategicRecord?.kind === "person" ||
                        selectedStrategicRecord?.kind === "organization"
                      ? {
                          targetKind: selectedStrategicRecord.kind,
                          targetId: selectedStrategicRecord.id,
                        }
                      : undefined
            }
            onOpenDocument={(documentId, title) =>
              openContext(documentContext(documentId, title))
            }
          />
        )}
      </aside>

      {inspectorDetailOpen && (
        <span className="context-thread" aria-hidden="true" />
      )}
      {captureOpen && (
        <Suspense fallback={null}>
          <CaptureDialog
            busy={capturing}
            client={client}
            defaultVoiceRetentionPolicy={
              bootstrap.workspace.voiceAudioRetentionPolicy
            }
            workspaceName={bootstrap.workspace.name}
            onClose={() => !capturing && dismissCapture()}
            onSubmit={async (original) => {
              if (!client) return "The desktop is unavailable right now.";
              setCapturing(true);
              setNotice(undefined);
              const result = await submitQuickCapture(
                client,
                state.snapshot,
                original,
              );
              setCapturing(false);
              if (result.kind !== "success") {
                showFailure(result);
                return result.message;
              }
              setState({ kind: "ready", snapshot: result.snapshot });
              const captureResult = result.result;
              if (captureResult.kind === "task") {
                const task = result.snapshot.tasks.find(
                  (item) => item.id === captureResult.taskId,
                );
                openContext(
                  taskContext(captureResult.taskId, task?.title ?? "New task"),
                );
                setReceipts((current) => ({
                  ...current,
                  [captureResult.taskId]: result.receipt,
                }));
              } else if (captureResult.kind === "review") {
                openContext(destinationContext("inbox", "Inbox"));
              } else if (captureResult.kind === "voice_note") {
                openContext(destinationContext("captures", "Capture history"));
              } else {
                openContext(destinationContext("notes", "Notes"));
              }
              setCaptureOpen(false);
              pushToast({
                message:
                  captureResult.kind === "task"
                    ? "Capture filed as a task."
                    : captureResult.kind === "knowledge_source"
                      ? "Capture filed as a knowledge source."
                      : captureResult.kind === "voice_note"
                        ? "The voice note is safe and waiting for an agent to transcribe it."
                        : "This capture needs a decision and went to the inbox.",
              });
              return undefined;
            }}
          />
        </Suspense>
      )}
      {searchOpen && client && (
        <SearchOverlay
          client={client}
          snapshot={state.snapshot}
          destinations={[
            ...favorites
              .map((id) => navItems.find((item) => item.id === id))
              .filter(
                (item): item is (typeof navItems)[number] => item !== undefined,
              ),
            ...navItems.filter((item) => !favorites.includes(item.id)),
            // TAFLE USTAWIEŃ, WYPROWADZONE ZE SŁOWNIKA KATEGORII, nie wypisane
            // tutaj z ręki. `activity` przestał być celem nawigacji w tej fali
            // i bez tej linii przestałby też istnieć w palecie — a dziennik
            // zmian z cofaniem, którego nie da się znaleźć po nazwie, jest
            // zakopany, a nie przeniesiony. Ręczna lista celów palety obok
            // zamkniętego słownika byłaby dwudziestym piątym żywym miejscem
            // rodziny, którą to repo przegrywa od trzech fal; tutaj deklaracja
            // stoi RAZ, przy kategorii, w `settings-categories.ts`.
            ...settingsPanes.map((pane) => ({
              id: "settings" as const,
              label: pane.label,
              settingsCategory: pane.category,
            })),
          ]}
          onClose={() => setSearchOpen(false)}
          onOpenDestination={(nextSurface, label, settingsCategory) => {
            // Ustawienia zawsze przez `openSettings*`, nigdy przez goły
            // `openContext`: to one zapamiętują kontekst powrotu, więc wyjście
            // kołem zębatym wraca tam, gdzie człowiek był, a nie na Today.
            if (nextSurface === "settings") {
              if (settingsCategory === undefined) openSettings();
              else openSettingsCategory(settingsCategory);
              return;
            }
            openContext(destinationContext(nextSurface, label));
          }}
          onNavigate={(nextSurface, recordId, recordKind, title) => {
            if (nextSurface === "tasks") {
              const id = recordId as TaskId;
              const task = tasks.find((item) => item.id === id);
              openContext(taskContext(id, task?.title ?? "Task"));
            } else if (nextSurface === "projects") {
              if (recordKind === "area") {
                openContext(areaContext(recordId as StrategicRecordId, title));
                return;
              }
              if (recordKind === "initiative") {
                openContext(
                  initiativeContext(recordId as StrategicRecordId, title),
                );
                return;
              }
              const work =
                state.snapshot.work.kind === "ready"
                  ? state.snapshot.work.data
                  : undefined;
              const area = work?.areas.find((item) => item.id === recordId);
              if (area !== undefined) {
                openContext(areaContext(area.id, area.title));
                return;
              }
              const initiative = work?.initiatives.find(
                (item) => item.id === recordId,
              );
              if (initiative !== undefined) {
                openContext(initiativeContext(initiative.id, initiative.title));
                return;
              }
              const id = recordId as ProjectId;
              const project =
                state.snapshot.projects.kind === "ready"
                  ? state.snapshot.projects.data.items.find(
                      (item) => item.id === id,
                    )
                  : undefined;
              openContext(projectContext(id, project?.title ?? "Project"));
            } else if (nextSurface === "captures") {
              // ROZGAŁĘZIENIE PO RODZAJU ZNIKŁO RAZEM ZE ZWINIĘCIEM (lot D3),
              // i to jest jedyne miejsce, w którym rozdział na trzy cele
              // UPROŚCIŁ kod zamiast go rozmnożyć. Stała tu jedna gałąź
              // `nextSurface === "library"`, która musiała sama zgadnąć, czy
              // trafiony rekord jest wrzutką, czy dokumentem — bo cel niósł
              // trzy rodzaje naraz, a jego nota ostrzegała, że bez tego
              // zgadywania wrzutka ląduje na Notatkach „bez ani jednego błędu
              // kompilacji". Teraz rodzaj JEST w celu: fikstura wyszukiwarki
              // mówi `captures` przy wrzutce i `notes` przy dokumencie, więc
              // pytanie zadaje się raz, po stronie danych.
              const capture = state.snapshot.captures.find(
                (item) => item.id === recordId,
              );
              if (capture !== undefined) {
                selectCaptureInInspector(capture.id);
                setDocumentInspectorKind("captures");
                setDocumentInspectorOpen(true);
              }
              openContext(destinationContext("captures", "Capture history"));
            } else if (nextSurface === "notes") {
              const id = recordId as DocumentId;
              const document =
                state.snapshot.knowledge.kind === "ready"
                  ? state.snapshot.knowledge.data.documents.find(
                      (item) => item.id === id,
                    )
                  : undefined;
              if (document !== undefined) {
                openContext(documentContext(id, document.title));
              } else {
                const item = navItems.find((entry) => entry.id === nextSurface);
                openContext(
                  destinationContext(nextSurface, item?.label ?? "Notes"),
                );
              }
            } else if (nextSurface === "organizations") {
              const record =
                state.snapshot.relationships.kind === "ready"
                  ? state.snapshot.relationships.data.records.find(
                      (item) => item.id === recordId,
                    )
                  : undefined;
              if (record?.kind === "organization") {
                openContext(organizationContext(record.id, record.name));
              } else {
                openContext(
                  destinationContext("organizations", "Organizations"),
                );
                selectStrategicInInspector(recordId);
              }
            } else if (nextSurface === "pipeline") {
              // Both halves of the repoint, in one place, the way the `people`
              // branch below does it — and this is the half that MOVED when the
              // deal got a record screen.
              //
              // A DEAL opens its own record. Until a context could carry an
              // opportunity there was nowhere for it to open, so this branch
              // held the board with the deal selected: honest for that release,
              // and still a downgrade of "open this deal" to "open the board".
              // Now `opportunityContext` exists and ⌘K lands on the record.
              //
              // An OFFER stays on the board, deliberately. Its sheet is on the
              // deal's record, but the record is named after the DEAL — sending
              // a search hit for "Wariant z dyżurem" to a screen headed by
              // another record is the same substitution trap 24 describes,
              // pointing the other way. The board's inspector shows THE OFFER,
              // which is the record the search actually found.
              const record =
                state.snapshot.relationships.kind === "ready"
                  ? state.snapshot.relationships.data.records.find(
                      (item) => item.id === recordId,
                    )
                  : undefined;
              if (record?.kind === "opportunity") {
                openContext(opportunityContext(record.id, record.title));
              } else {
                openContext(destinationContext("pipeline", "Pipeline"));
                selectStrategicInInspector(recordId);
              }
            } else if (nextSurface === "people") {
              // Both halves of the repoint, in one place. Opening the
              // destination and stopping would turn "open this person" into
              // "open the People screen" — the generic `else` below does
              // exactly that, silently, and it is why `record-kind-registry`
              // and this branch change together or not at all.
              openContext(destinationContext("people", "People"));
              selectStrategicInInspector(recordId);
            } else if (nextSurface === "renewals") {
              // The same pairing, for the contract. The Renewals row keys its
              // selected state on the RENEWAL's id, which is the id arriving
              // here — a screen keyed on the organisation would open with
              // nothing highlighted and the repoint would be a downgrade
              // wearing a new destination.
              openContext(destinationContext("renewals", "Renewals"));
              selectStrategicInInspector(recordId);
            } else if (nextSurface === "meetings") {
              setSelectedMeetingId(recordId);
              openContext(destinationContext("meetings", "Meetings"));
            } else {
              const item = navItems.find((entry) => entry.id === nextSurface);
              openContext(
                destinationContext(nextSurface, item?.label ?? "View"),
              );
            }
          }}
        />
      )}
      {undoPreview && (
        <UndoDialog
          preview={undoPreview}
          busy={undoBusy}
          onClose={() => !undoBusy && setUndoPreview(undefined)}
          onConfirm={() => {
            if (!client) return;
            setUndoBusy(true);
            void undoCommand(client, state.snapshot, undoPreview).then(
              async (result) => {
                setUndoBusy(false);
                if (result.kind === "success") {
                  setUndoPreview(undefined);
                  await refreshAfter(
                    "Change undone and recorded in the audit.",
                  );
                  // TEN SAM DZIENNIK POD NOWYM ADRESEM. Do fali E ta linia
                  // wysyłała na `destination:activity`; wycofanie jest
                  // SCALENIEM TREŚCI, więc zachowanie zostaje takie samo,
                  // tylko cel jest głębokim linkiem w kategorię, która teraz
                  // trzyma tę taflę. Bez głębokiego linku człowiek lądowałby
                  // na górze Ustawień i szukał, co się właśnie stało.
                  openSettingsCategory("data");
                } else showFailure(result);
              },
            );
          }}
        />
      )}
      {onboardingOpen && client && (
        <Suspense fallback={null}>
          <OnboardingFlow
            client={client}
            snapshot={state.snapshot}
            onComplete={async () => {
              setOnboardingOpen(false);
              await reload();
            }}
            onFailure={showFailure}
          />
        </Suspense>
      )}
      {recoveryOpen && client && (
        <Suspense fallback={null}>
          <WorkspaceRecovery
            client={client}
            {...(state.snapshot.dataHome === undefined
              ? {}
              : { initialStatus: state.snapshot.dataHome })}
            workspaceName={bootstrap.workspace.name}
            recoveredPrevious={
              build.startupRecovery === "previous_workspace_restored"
            }
            onClose={() => setRecoveryOpen(false)}
            onRestored={async () => {
              await reload();
              openContext(destinationContext("today", "Today"));
              pushToast({
                message: "Workspace restored and reopened.",
              });
            }}
          />
        </Suspense>
      )}
      {navMenu && (
        <div
          className="context-menu-layer"
          onMouseDown={() => closeNavMenu(false)}
          onContextMenu={(event) => {
            event.preventDefault();
            closeNavMenu(false);
          }}
        >
          <div
            ref={navMenuRef}
            className="context-menu"
            role="menu"
            aria-label={`Actions for ${navMenu.context.label}`}
            style={{ left: navMenu.x, top: navMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={navMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                openContext(navMenu.context);
                closeNavMenu(true);
              }}
            >
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                openContextInNewTab(navMenu.context);
                closeNavMenu(true);
              }}
            >
              Open in a new tab
            </button>
          </div>
        </div>
      )}
      {railMode && railTip && (
        <div
          className="nav-rail-tooltip"
          role="presentation"
          style={{ top: railTip.top }}
        >
          <span>{railTip.label}</span>
          {railTip.hint !== undefined && (
            <span>
              {railTip.hint.kind === "palette" && <small>via palette</small>}
              <kbd>{railTip.hint.keys}</kbd>
            </span>
          )}
        </div>
      )}
      {shortcutsOpen && (
        <ShortcutsOverlay
          surfaces={navItems}
          onClose={() => setShortcutsOpen(false)}
        />
      )}
      {activeToast && (
        <div
          className="undo-toast"
          role="status"
          onMouseEnter={() => setToastPaused(true)}
          onMouseLeave={() => setToastPaused(false)}
          onFocus={() => setToastPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setToastPaused(false);
          }}
        >
          <span>{activeToast.message}</span>
          {toasts.length > 1 && (
            <span
              className="undo-toast-queue"
              aria-label={`${toasts.length - 1} queued`}
            >
              +{toasts.length - 1}
            </span>
          )}
          {activeToast.restore && (
            <button
              className="ghost-button"
              onClick={() => {
                const restore = activeToast.restore;
                dismissToast(activeToast.id);
                if (restore) openContextInNewTab(restore);
              }}
            >
              Restore
            </button>
          )}
          {activeToast.undoCommandId && (
            <button
              className="ghost-button"
              onClick={() => {
                const target = activeToast.undoCommandId;
                dismissToast(activeToast.id);
                if (target) void openUndo(target);
              }}
            >
              Undo
            </button>
          )}
          <button
            className="ghost-button"
            onClick={() => dismissToast(activeToast.id)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
