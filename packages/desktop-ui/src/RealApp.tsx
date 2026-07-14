import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type {
  PrincipalId,
  ProjectId,
  RelationId,
  TaskId,
} from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  DesktopBuildInfo,
} from "@constellation/desktop-preload/client";

import { AccessSurface } from "./AccessSurface.js";
import { AttentionSurface, CommentsPanel } from "./CollaborationSurfaces.js";
import { DocumentsSurface } from "./DocumentsSurface.js";

import {
  ActivitySurface,
  CockpitSurface,
  HistorySurface,
  ProjectsSurface,
  SearchOverlay,
  TasksSurface,
  UndoDialog,
} from "./Wave2Surfaces.js";
import {
  addWorkspaceMember,
  addComment,
  editComment,
  createProject,
  loadDesktopSnapshot,
  loadProjectOverview,
  loadComments,
  previewUndo,
  revokeWorkspaceMember,
  relateTask,
  setTaskCompletion,
  setTaskAssignment,
  setTaskStatus,
  setWorkspaceMemberAccess,
  setCommentResolved,
  submitCaptureAsTask,
  undoCommand,
  unrelateTask,
  updateProjectOutcome,
  updateAttention,
  createAgentGrant,
  rotateAgentCredential,
  revokeAgentGrant,
  type AuditReceiptProjection,
  type DesktopSnapshot,
  type MutationFailure,
  type ProjectOverviewProjection,
  type CommentListProjection,
  type DataSlice,
  type UndoPreview,
} from "./client/workflow.js";
import {
  activateShellContext,
  activeShellContext,
  canMoveShellHistory,
  closeShellContext,
  createShellNavigation,
  destinationShortcutIndex,
  destinationContext,
  moveShellHistory,
  openShellContext,
  projectContext,
  taskContext,
  type ShellContext,
} from "./client/shell-navigation.js";
import {
  conditionCopy,
  type PreviewCondition,
  type SurfaceId,
} from "./client/wave2-fixtures.js";
import { WorkspaceRecovery } from "./WorkspaceRecovery.js";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "recovery"; readonly build: DesktopBuildInfo }
  | { readonly kind: "unavailable" | "error"; readonly message: string }
  | { readonly kind: "ready"; readonly snapshot: DesktopSnapshot };

type IconName =
  | "capture"
  | "tasks"
  | "history"
  | "search"
  | "close"
  | "project"
  | "cockpit"
  | "activity"
  | "attention"
  | "access"
  | "documents";
const Icon = ({ name }: { readonly name: IconName }) => {
  const paths = {
    capture: <path d="M12 5v14M5 12h14" />,
    tasks: <path d="m5 7 2 2 4-4M12 7h7M5 15l2 2 4-4M12 15h7" />,
    history: <path d="M4 6h16v12H4zM4 14h4l2 2h4l2-2h4" />,
    search: (
      <path d="m20 20-4.3-4.3M10.8 17a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4Z" />
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    project: <path d="M4 5h6l2 2h8v12H4z" />,
    cockpit: <path d="M4 5h7v6H4zM13 5h7v10h-7zM4 13h7v6H4zM13 17h7v2h-7z" />,
    activity: <path d="M5 6h14M5 12h14M5 18h9M3 6h.01M3 12h.01M3 18h.01" />,
    attention: (
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9.5 20h5" />
    ),
    access: (
      <path d="M16 19c0-3-2.2-5-5-5s-5 2-5 5M11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8h4M19 6v4" />
    ),
    documents: <path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h7" />,
  } as const;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
};

const BrandMark = () => (
  <svg className="brand-mark" aria-hidden="true" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    <circle cx="16" cy="4.7" r="1.55" fill="currentColor" />
    <circle cx="25.8" cy="10.3" r="1.55" fill="currentColor" />
    <circle cx="24.4" cy="22.9" r="1.55" fill="currentColor" />
    <circle cx="8.2" cy="23.7" r="1.55" fill="currentColor" />
    <circle cx="5.7" cy="10.8" r="1.55" fill="currentColor" />
    <path
      d="m16 4.7 9.8 5.6-1.4 12.6-16.2.8-2.5-12.9L16 4.7Zm0 0v11.3m9.8-5.7L16 16m8.4 6.9L16 16M8.2 23.7 16 16M5.7 10.8 16 16"
      fill="none"
      stroke="currentColor"
      strokeOpacity=".42"
      strokeWidth="1"
    />
  </svg>
);

const CaptureDialog = ({
  busy,
  workspaceName,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly workspaceName: string;
  readonly onClose: () => void;
  readonly onSubmit: (text: string) => void;
}) => {
  const [text, setText] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
    return () => dialogRef.current?.close();
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() && !busy) onSubmit(text);
  };
  return (
    <dialog
      ref={dialogRef}
      className="capture-backdrop"
      aria-labelledby="capture-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onClose()
      }
    >
      <section className="capture-dialog">
        <header className="capture-header">
          <div>
            <p className="eyebrow">Quick Capture</p>
            <h2 id="capture-title">Zapisz cokolwiek</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij Quick Capture"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="capture-text">
            Treść przechwycenia
          </label>
          <textarea
            id="capture-text"
            name="capture"
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Myśl, zadanie, link albo coś do sprawdzenia…"
            maxLength={500}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                submit(event);
            }}
          />
          <div className="capture-target">
            <div>
              <span>Workspace</span>
              <strong>{workspaceName}</strong>
            </div>
            <div>
              <span>Wynik</span>
              <strong>Zadanie · jawny routing</strong>
            </div>
          </div>
          <footer className="capture-footer">
            <span>Oryginał zostanie zachowany i powiązany z wynikiem.</span>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || !text.trim()}
            >
              {busy ? "Zapisuję…" : "Zapisz jako zadanie"}
            </button>
          </footer>
        </form>
      </section>
    </dialog>
  );
};

const navItems: readonly {
  id: SurfaceId;
  label: string;
  icon: IconName;
  shortcut: string;
}[] = [
  { id: "cockpit", label: "Tydzień", icon: "cockpit", shortcut: "1" },
  { id: "tasks", label: "Zadania", icon: "tasks", shortcut: "2" },
  { id: "projects", label: "Projekty", icon: "project", shortcut: "3" },
  { id: "history", label: "Historia Capture", icon: "history", shortcut: "4" },
  { id: "activity", label: "Aktywność", icon: "activity", shortcut: "5" },
  { id: "attention", label: "Do uwagi", icon: "attention", shortcut: "6" },
  { id: "access", label: "Dostęp", icon: "access", shortcut: "7" },
  { id: "documents", label: "Dokumenty", icon: "documents", shortcut: "8" },
];

export const RealApp = ({
  client,
}: {
  readonly client: ConstellationRendererClient | undefined;
}) => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [navigation, setNavigation] = useState(() =>
    createShellNavigation(destinationContext("cockpit", "Tydzień")),
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>();
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>();
  const [projectOverview, setProjectOverview] =
    useState<ProjectOverviewProjection>();
  const [busyTaskId, setBusyTaskId] = useState<TaskId>();
  const [projectBusy, setProjectBusy] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [attentionBusy, setAttentionBusy] = useState(false);
  const [comments, setComments] = useState<DataSlice<CommentListProjection>>({
    kind: "unavailable",
    message: "Wybierz Task albo Project.",
  });
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
  const [toast, setToast] = useState<string>();
  const [previewCondition, setPreviewCondition] =
    useState<PreviewCondition>("ready");
  const navRef = useRef<HTMLElement>(null);
  const tabRef = useRef<HTMLDivElement>(null);
  const modifierLabel = /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl";
  const activeContext = activeShellContext(navigation);
  const surface = activeContext.surface;

  const openContext = useCallback((context: ShellContext) => {
    setNavigation((current) => openShellContext(current, context));
  }, []);

  useEffect(() => {
    setSelectedTaskId(activeContext.taskId);
    setSelectedProjectId(activeContext.projectId);
  }, [activeContext.projectId, activeContext.taskId]);

  const snapshot = state.kind === "ready" ? state.snapshot : undefined;
  useEffect(() => {
    if (!client) return;
    return client.onAttentionActivated((destination) => {
      if (destination.kind === "task") {
        openContext(taskContext(destination.taskId, "Zadanie"));
      } else {
        openContext(projectContext(destination.projectId, "Projekt"));
      }
    });
  }, [client, openContext]);

  const reload = async () => {
    if (!client) return;
    const next = await loadDesktopSnapshot(client, snapshot?.build);
    setState({ kind: "ready", snapshot: next });
  };

  useEffect(() => {
    if (!client) {
      setState({
        kind: "unavailable",
        message:
          "Bezpieczny most Electron jest niedostępny. Uruchom aplikację przez skrypt desktopowy.",
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
      })
      .catch(
        (error: unknown) =>
          active &&
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Nie udało się otworzyć workspace.",
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
                : "Przegląd projektu jest niedostępny.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [client, selectedProjectId, snapshot]);

  useEffect(() => {
    if (!client || !snapshot || (!selectedTaskId && !selectedProjectId)) {
      setComments({
        kind: "unavailable",
        message: "Wybierz Task albo Project.",
      });
      return;
    }
    let active = true;
    const target = selectedTaskId
      ? { kind: "task" as const, taskId: selectedTaskId }
      : { kind: "project" as const, projectId: selectedProjectId! };
    void loadComments(client, snapshot, target)
      .then((data) => active && setComments({ kind: "ready", data }))
      .catch(
        (error: unknown) =>
          active &&
          setComments({
            kind: "unavailable",
            message:
              error instanceof Error
                ? error.message
                : "Komentarze są niedostępne.",
          }),
      );
    return () => {
      active = false;
    };
  }, [client, selectedProjectId, selectedTaskId, snapshot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modalOpen = document.querySelector("dialog[open]") !== null;
      const shortcutIndex = destinationShortcutIndex(event.code);
      if (modalOpen && event.key !== "Escape") return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "KeyK"
      ) {
        event.preventDefault();
        setCaptureOpen(true);
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyK") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (
        (event.metaKey || event.ctrlKey) &&
        shortcutIndex !== undefined
      ) {
        event.preventDefault();
        const item = navItems[shortcutIndex];
        if (item) openContext(destinationContext(item.id, item.label));
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
        setSearchOpen(false);
        setUndoPreview(undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigation.activeKey, navigation.tabs, openContext]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
  const sourceCapture =
    selectedTask?.sourceCaptureId === undefined
      ? undefined
      : snapshot?.captures.find(
          (capture) => capture.id === selectedTask.sourceCaptureId,
        );
  const receipt =
    selectedTask === undefined ? undefined : receipts[selectedTask.id];
  const showFailure = (result: MutationFailure) => setNotice(result);
  const currentPrincipalId =
    snapshot?.access.kind === "ready"
      ? snapshot.access.data.currentPrincipalId
      : undefined;
  const currentMember =
    snapshot?.access.kind === "ready"
      ? snapshot.access.data.members.find(
          (member) => member.principalId === currentPrincipalId,
        )
      : undefined;
  const currentGrant = currentMember?.spaces[0];
  const canResolveComments =
    currentMember?.role === "owner" || currentGrant?.access === "edit";
  const canComment = canResolveComments || currentGrant?.access === "comment";
  const refreshAfter = async (message: string) => {
    await reload();
    setToast(message);
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
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [
      ...(navRef.current?.querySelectorAll<HTMLButtonElement>(".nav-item") ??
        []),
    ];
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const delta = event.key === "ArrowDown" ? 1 : -1;
    buttons[(current + delta + buttons.length) % buttons.length]?.focus();
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
        <p>Otwieram workspace…</p>
      </main>
    );
  if (state.kind === "recovery") {
    const reason =
      state.build.recoveryReason === "secure_storage_unavailable"
        ? "Bezpieczny magazyn systemu jest niedostępny. Możesz spróbować ponownie po odblokowaniu systemu albo przywrócić zweryfikowany backup."
        : state.build.recoveryReason === "protected_key_unavailable"
          ? "Chroniony klucz workspace’u jest niedostępny lub uszkodzony. Istniejące dane nie zostały zastąpione."
          : "Lokalny workspace nie przeszedł bezpiecznego otwarcia. Constellation zatrzymał się przed zapisem.";
    return (
      <main className="center-state recovery-required-state">
        <BrandMark />
        <p className="eyebrow">Odzyskiwanie workspace</p>
        <h1>Dane wymagają bezpiecznego restore</h1>
        <p>{reason}</p>
        <div>
          <button
            className="primary-button"
            onClick={() => setRecoveryOpen(true)}
          >
            Otwórz odzyskiwanie
          </button>
          <button
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Spróbuj otworzyć ponownie
          </button>
        </div>
        {recoveryOpen && client && (
          <WorkspaceRecovery
            client={client}
            workspaceName="Lokalny workspace"
            recoveredPrevious={false}
            restoreOnly
            onClose={() => setRecoveryOpen(false)}
            onRestored={async () => window.location.reload()}
          />
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
            ? "Most desktopowy jest niedostępny"
            : "Nie udało się otworzyć workspace"}
        </h1>
        <p>{state.message}</p>
        <button
          className="secondary-button"
          onClick={() => window.location.reload()}
        >
          Spróbuj ponownie
        </button>
      </main>
    );

  const { bootstrap, build, tasks } = state.snapshot;
  const isPreview = build.channel === "developer-preview";
  return (
    <main className="desktop-shell wave2-shell">
      <a className="skip-link" href="#main-content">
        Przejdź do treści
      </a>
      <aside className="sidebar">
        <div className="window-drag" />
        <div className="brand-row">
          <BrandMark />
          <strong>Constellation</strong>
        </div>
        <button
          type="button"
          className="workspace-switcher"
          aria-label={`Workspace ${bootstrap.workspace.name}, Data Home lokalny, dane kanoniczne na tym urządzeniu`}
          disabled={isPreview}
          title={
            isPreview
              ? "Backup jest dostępny w szyfrowanym lokalnym workspace."
              : "Otwórz Data Home i odzyskiwanie workspace"
          }
          onClick={() => setRecoveryOpen(true)}
        >
          <span className="workspace-avatar">I</span>
          <span>
            <strong>{bootstrap.workspace.name}</strong>
            <small>
              {state.snapshot.dataHome?.availability === "available"
                ? "Local only · dane na tym urządzeniu"
                : "Data Home wymaga uwagi"}
            </small>
          </span>
          {!isPreview && <span className="workspace-switcher-action">•••</span>}
        </button>
        <button className="search-control" onClick={() => setSearchOpen(true)}>
          <Icon name="search" />
          <span>Szukaj</span>
          <kbd>{modifierLabel}K</kbd>
        </button>
        <nav ref={navRef} aria-label="Główna nawigacja" onKeyDown={navKeyDown}>
          <p className="nav-label">Praca</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              data-surface={item.id}
              className={`nav-item ${surface === item.id ? "active" : ""}`}
              aria-current={surface === item.id ? "page" : undefined}
              onClick={() =>
                openContext(destinationContext(item.id, item.label))
              }
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "tasks" ? (
                <span className="nav-count">{tasks.length}</span>
              ) : item.id === "attention" &&
                state.snapshot.attention.kind === "ready" &&
                state.snapshot.attention.data.unreadCount > 0 ? (
                <span
                  className="nav-count"
                  aria-label={`${state.snapshot.attention.data.unreadCount} nieprzeczytanych`}
                >
                  {state.snapshot.attention.data.unreadCount}
                </span>
              ) : (
                <kbd>
                  {modifierLabel}
                  {item.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        {isPreview && (
          <label className="fixture-condition">
            <span>Stan podglądu</span>
            <select
              value={previewCondition}
              onChange={(event) =>
                setPreviewCondition(event.target.value as PreviewCondition)
              }
              aria-label="Wybierz deterministyczny stan podglądu"
            >
              <option value="ready">Gotowy</option>
              <option value="offline">Offline</option>
              <option value="retry">Retry</option>
              <option value="partial">Częściowy</option>
              <option value="conflict">Konflikt</option>
              <option value="permission">Uprawnienia</option>
              <option value="recovery">Recovery</option>
            </select>
          </label>
        )}
        <button
          className="sidebar-capture"
          onClick={() => setCaptureOpen(true)}
        >
          <span className="capture-plus">
            <Icon name="capture" />
          </span>
          <span>Quick Capture</span>
          <kbd>{modifierLabel}⇧K</kbd>
        </button>
        <div className="preview-identity">
          <span className="status-dot" />
          <div>
            <strong>
              {isPreview ? "Podgląd deweloperski" : "Lokalny workspace"}
            </strong>
            <span>
              {build.persistence === "encrypted-local"
                ? "Szyfrowany local store"
                : "Pamięć sesji"}{" "}
              · {build.version}
            </span>
          </div>
        </div>
      </aside>

      <section
        className="work-surface wave2-work"
        id="main-content"
        aria-labelledby="surface-title"
      >
        <div className="shell-tabbar" aria-label="Otwarte konteksty">
          <div
            className="shell-history-controls"
            aria-label="Historia kontekstu"
          >
            <button
              className="icon-button"
              aria-label="Wstecz"
              title="Wstecz · Alt+←"
              disabled={!canMoveShellHistory(navigation, -1)}
              onClick={() =>
                setNavigation((current) => moveShellHistory(current, -1))
              }
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              className="icon-button"
              aria-label="Dalej"
              title="Dalej · Alt+→"
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
            aria-label="Konteksty"
          >
            {navigation.tabs.map((tab) => {
              const active = tab.key === navigation.activeKey;
              return (
                <div
                  className={`shell-tab ${active ? "active" : ""}`}
                  key={tab.key}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    data-shell-tab={tab.key}
                    onKeyDown={(event) => tabKeyDown(event, tab.key)}
                    onClick={() =>
                      setNavigation((current) =>
                        activateShellContext(current, tab.key),
                      )
                    }
                  >
                    <span className="shell-tab-kind" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                  {navigation.tabs.length > 1 && (
                    <button
                      type="button"
                      className="shell-tab-close"
                      aria-label={`Zamknij kontekst ${tab.label}`}
                      title={`Zamknij · ${modifierLabel}W`}
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
        </div>
        {notice && (
          <div
            className={`notice notice-${notice.kind}`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            <span>{notice.message}</span>
            <button
              className="icon-button"
              aria-label="Zamknij komunikat"
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
        {surface === "cockpit" && (
          <CockpitSurface
            snapshot={state.snapshot}
            onOpenProject={(id) => {
              const project =
                state.snapshot.projects.kind === "ready"
                  ? state.snapshot.projects.data.items.find(
                      (item) => item.id === id,
                    )
                  : undefined;
              openContext(projectContext(id, project?.title ?? "Projekt"));
            }}
            onSelectTask={(id) => {
              const task = tasks.find((item) => item.id === id);
              openContext(taskContext(id, task?.title ?? "Zadanie"));
            }}
          />
        )}
        {surface === "tasks" && (
          <TasksSurface
            snapshot={state.snapshot}
            selectedTaskId={selectedTaskId}
            busyTaskId={busyTaskId}
            onSelectTask={(id) => {
              const task = tasks.find((item) => item.id === id);
              openContext(taskContext(id, task?.title ?? "Zadanie"));
            }}
            onCapture={() => setCaptureOpen(true)}
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
                  await refreshAfter("Status zadania zaktualizowano.");
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
                    completed
                      ? "Zadanie ukończono."
                      : "Zadanie otwarto ponownie.",
                  );
                else showFailure(result);
              });
            }}
            onSetAssignment={(
              id: TaskId,
              principalId: PrincipalId | undefined,
            ) => {
              const task = tasks.find((item) => item.id === id);
              if (!client || !task) return;
              if (principalId === undefined && task.assignment === undefined)
                return;
              setBusyTaskId(id);
              void setTaskAssignment(
                client,
                state.snapshot,
                task,
                principalId,
              ).then(async (result) => {
                setBusyTaskId(undefined);
                if (result.kind === "success")
                  await refreshAfter(
                    principalId === undefined
                      ? "Odpowiedzialność usunięto."
                      : "Odpowiedzialność przypisano.",
                  );
                else showFailure(result);
              });
            }}
          />
        )}
        {surface === "documents" && (
          <DocumentsSurface
            client={client}
            snapshot={state.snapshot}
            onReload={reload}
            onFailure={showFailure}
          />
        )}
        {surface === "projects" && (
          <ProjectsSurface
            snapshot={state.snapshot}
            selectedProjectId={selectedProjectId}
            overview={projectOverview}
            relation={sessionRelation}
            busy={projectBusy}
            onSelectProject={(id) => {
              const project =
                state.snapshot.projects.kind === "ready"
                  ? state.snapshot.projects.data.items.find(
                      (item) => item.id === id,
                    )
                  : undefined;
              openContext(projectContext(id, project?.title ?? "Projekt"));
            }}
            onCreate={async (title, outcome) => {
              if (!client) return false;
              setProjectBusy(true);
              const result = await createProject(
                client,
                state.snapshot,
                title,
                outcome,
              );
              setProjectBusy(false);
              if (result.kind === "success") {
                openContext(
                  projectContext(result.data.projectId, title.trim()),
                );
                await refreshAfter("Projekt utworzono.");
                return true;
              }
              showFailure(result);
              return false;
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
                  await refreshAfter("Zamierzony wynik zaktualizowano.");
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
                  await refreshAfter("Zadanie powiązano z projektem.");
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
                  await refreshAfter("Powiązanie usunięto.");
                } else showFailure(result);
              });
            }}
          />
        )}
        {surface === "history" && (
          <HistorySurface
            snapshot={state.snapshot}
            onUndo={(id) => void openUndo(id)}
          />
        )}
        {surface === "activity" && (
          <ActivitySurface
            activity={state.snapshot.activity}
            onUndo={(id) => void openUndo(id)}
          />
        )}
        {surface === "attention" && (
          <AttentionSurface
            attention={state.snapshot.attention}
            busy={attentionBusy}
            onOpen={(item) => {
              const destination = item.destination;
              if (destination.kind === "task") {
                const task = tasks.find(
                  (candidate) => candidate.id === destination.taskId,
                );
                openContext(
                  taskContext(destination.taskId, task?.title ?? item.title),
                );
              } else {
                const project =
                  state.snapshot.projects.kind === "ready"
                    ? state.snapshot.projects.data.items.find(
                        (candidate) => candidate.id === destination.projectId,
                      )
                    : undefined;
                openContext(
                  projectContext(
                    destination.projectId,
                    project?.title ?? item.title,
                  ),
                );
              }
              if (client && item.state === "unread") {
                setAttentionBusy(true);
                void updateAttention(client, state.snapshot, item, "read").then(
                  async (result) => {
                    setAttentionBusy(false);
                    if (result.kind === "success") await reload();
                    else showFailure(result);
                  },
                );
              }
            }}
            onRead={(item) => {
              if (!client) return;
              setAttentionBusy(true);
              void updateAttention(client, state.snapshot, item, "read").then(
                async (result) => {
                  setAttentionBusy(false);
                  if (result.kind === "success")
                    await refreshAfter("Sygnał oznaczono jako przeczytany.");
                  else showFailure(result);
                },
              );
            }}
            onDismiss={(item) => {
              if (!client) return;
              setAttentionBusy(true);
              void updateAttention(
                client,
                state.snapshot,
                item,
                "dismiss",
              ).then(async (result) => {
                setAttentionBusy(false);
                if (result.kind === "success")
                  await refreshAfter("Sygnał usunięto z uwagi.");
                else showFailure(result);
              });
            }}
          />
        )}
        {surface === "access" && (
          <AccessSurface
            access={state.snapshot.access}
            agentAccess={
              state.snapshot.dataHome?.descriptor.providerKind === "local_only"
                ? state.snapshot.agentAccess
                : {
                    kind: "unavailable",
                    message:
                      "Lokalny dostęp MCP jest obecnie dostępny dla Workspace z lokalnym Data Home. Zdalne i skoordynowane działanie należy do następnego etapu.",
                  }
            }
            spaces={state.snapshot.bootstrap.spaces}
            busy={accessBusy}
            onAdd={(input) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void addWorkspaceMember(client, state.snapshot, input).then(
                async (result) => {
                  setAccessBusy(false);
                  if (result.kind === "success")
                    await refreshAfter("Dostęp utworzono.");
                  else showFailure(result);
                },
              );
            }}
            onSetAccess={(member, access) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void setWorkspaceMemberAccess(
                client,
                state.snapshot,
                member,
                access,
              ).then(async (result) => {
                setAccessBusy(false);
                if (result.kind === "success")
                  await refreshAfter("Zakres dostępu zaktualizowano.");
                else showFailure(result);
              });
            }}
            onRevoke={(member) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void revokeWorkspaceMember(client, state.snapshot, member).then(
                async (result) => {
                  setAccessBusy(false);
                  if (result.kind === "success")
                    await refreshAfter(
                      "Dostęp cofnięto. Urządzenia usuną projekcję po synchronizacji.",
                    );
                  else showFailure(result);
                },
              );
            }}
            onAgentAdd={(input) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void createAgentGrant(client, state.snapshot, input).then(
                async (result) => {
                  setAccessBusy(false);
                  if (result.kind === "success")
                    await refreshAfter(
                      `Dostęp MCP utworzono. Plik dostępu: ${result.data.descriptorPath}. Adapter hosta: ${result.data.launchCommand} ${result.data.launchArgs.join(" ")}`,
                    );
                  else showFailure(result);
                },
              );
            }}
            onAgentRotate={(grant) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void rotateAgentCredential(client, state.snapshot, grant).then(
                async (result) => {
                  setAccessBusy(false);
                  if (result.kind === "success")
                    await refreshAfter(
                      `Poświadczenie obrócono. Plik dostępu: ${result.data.descriptorPath}. Adapter hosta: ${result.data.launchCommand} ${result.data.launchArgs.join(" ")}`,
                    );
                  else showFailure(result);
                },
              );
            }}
            onAgentRevoke={(grant) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              void revokeAgentGrant(client, state.snapshot, grant).then(
                async (result) => {
                  setAccessBusy(false);
                  if (result.kind === "success")
                    await refreshAfter(
                      "Dostęp agenta cofnięto, a lokalne poświadczenie usunięto.",
                    );
                  else showFailure(result);
                },
              );
            }}
          />
        )}
        <button className="capture-dock" onClick={() => setCaptureOpen(true)}>
          <span>
            <Icon name="capture" />
            Zapisz myśl, link albo zadanie…
          </span>
          <kbd>{modifierLabel}⇧K</kbd>
        </button>
      </section>

      <aside
        className={`inspector ${selectedTask || selectedProject ? "open" : ""}`}
        aria-label="Podgląd kontekstu"
      >
        <header className="inspector-header">
          <div>
            <span>Podgląd kontekstu</span>
            <small>
              {selectedTask
                ? "Zadanie"
                : selectedProject
                  ? "Projekt"
                  : "Workspace"}
            </small>
          </div>
          {(selectedTask || selectedProject) && (
            <button
              className="icon-button"
              aria-label="Zamknij inspector"
              onClick={() =>
                setNavigation((current) =>
                  closeShellContext(current, current.activeKey),
                )
              }
            >
              <Icon name="close" />
            </button>
          )}
        </header>
        {selectedTask ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedTask.completionState === "completed"
                ? "Ukończone"
                : selectedTask.status.label}
            </span>
            <h2>{selectedTask.title}</h2>
            <p className="record-summary">
              {sourceCapture
                ? "Utworzone z zachowanego Capture."
                : "Zadanie w aktywnym workspace."}
            </p>
            <section className="inspector-section assignment-block">
              <p className="section-label">Odpowiedzialność</p>
              <p>
                {selectedTask.assignment?.displayName ?? "Nieprzypisane"}
                {selectedTask.assignment?.availability === "former_member"
                  ? " · dostęp cofnięty"
                  : ""}
              </p>
            </section>
            <section className="inspector-section provenance-block">
              <p className="section-label">Capture provenance</p>
              {sourceCapture ? (
                <>
                  <blockquote>{sourceCapture.originalText}</blockquote>
                  <p>Quick Capture · oryginał zachowany</p>
                </>
              ) : (
                <p>Brak powiązanego źródła Capture.</p>
              )}
            </section>
            <section className="inspector-section audit-block">
              <p className="section-label">Ślad audytowy</p>
              {receipt ? (
                <dl>
                  <div>
                    <dt>Polecenie</dt>
                    <dd>{receipt.commandName}</dd>
                  </div>
                  <div>
                    <dt>Receipt</dt>
                    <dd className="mono">{receipt.id.slice(0, 18)}…</dd>
                  </div>
                </dl>
              ) : (
                <p>Pełny receipt pozostaje w Kernelu.</p>
              )}
            </section>
            <CommentsPanel
              comments={comments}
              candidates={state.snapshot.mentionCandidates}
              currentPrincipalId={currentPrincipalId}
              canComment={Boolean(canComment)}
              canResolve={Boolean(canResolveComments)}
              busy={commentBusy}
              onAdd={(body, mentions, parent) => {
                if (!client) return;
                setCommentBusy(true);
                void addComment(
                  client,
                  state.snapshot,
                  { kind: "task", taskId: selectedTask.id },
                  selectedTask.version,
                  body,
                  mentions,
                  parent,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "task",
                      taskId: selectedTask.id,
                    });
                    setComments({ kind: "ready", data });
                    setToast("Komentarz zapisano.");
                  } else showFailure(result);
                });
              }}
              onEdit={(comment, body) => {
                if (!client) return;
                setCommentBusy(true);
                void editComment(
                  client,
                  state.snapshot,
                  comment.id,
                  comment.version,
                  body,
                  comment.mentionPrincipalIds,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "task",
                      taskId: selectedTask.id,
                    });
                    setComments({ kind: "ready", data });
                  } else showFailure(result);
                });
              }}
              onResolve={(comment, resolved) => {
                if (!client) return;
                setCommentBusy(true);
                void setCommentResolved(
                  client,
                  state.snapshot,
                  comment,
                  resolved,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "task",
                      taskId: selectedTask.id,
                    });
                    setComments({ kind: "ready", data });
                  } else showFailure(result);
                });
              }}
            />
          </div>
        ) : selectedProject ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedProject.lifecycle === "active"
                ? "Aktywny"
                : selectedProject.lifecycle}
            </span>
            <h2>{selectedProject.title}</h2>
            <p className="record-summary">
              Projekt w aktywnym workspace i bieżącym zakresie Space.
            </p>
            <section className="inspector-section provenance-block">
              <p className="section-label">Zamierzony wynik</p>
              <blockquote>{selectedProject.intendedOutcome}</blockquote>
              <p>Wynik pozostaje częścią wersjonowanego rekordu Projektu.</p>
            </section>
            <section className="inspector-section">
              <p className="section-label">Kontekst pracy</p>
              <dl className="record-fields">
                <div>
                  <dt>Otwarte</dt>
                  <dd>{selectedProject.relatedOpenTaskCount} zadań</dd>
                </div>
                <div>
                  <dt>Wersja</dt>
                  <dd>
                    {projectOverview?.project.version ??
                      selectedProject.version}
                  </dd>
                </div>
              </dl>
            </section>
            <CommentsPanel
              comments={comments}
              candidates={state.snapshot.mentionCandidates}
              currentPrincipalId={currentPrincipalId}
              canComment={Boolean(canComment)}
              canResolve={Boolean(canResolveComments)}
              busy={commentBusy}
              onAdd={(body, mentions, parent) => {
                if (!client) return;
                setCommentBusy(true);
                void addComment(
                  client,
                  state.snapshot,
                  { kind: "project", projectId: selectedProject.id },
                  projectOverview?.project.version ?? selectedProject.version,
                  body,
                  mentions,
                  parent,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "project",
                      projectId: selectedProject.id,
                    });
                    setComments({ kind: "ready", data });
                    setToast("Komentarz zapisano.");
                  } else showFailure(result);
                });
              }}
              onEdit={(comment, body) => {
                if (!client) return;
                setCommentBusy(true);
                void editComment(
                  client,
                  state.snapshot,
                  comment.id,
                  comment.version,
                  body,
                  comment.mentionPrincipalIds,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "project",
                      projectId: selectedProject.id,
                    });
                    setComments({ kind: "ready", data });
                  } else showFailure(result);
                });
              }}
              onResolve={(comment, resolved) => {
                if (!client) return;
                setCommentBusy(true);
                void setCommentResolved(
                  client,
                  state.snapshot,
                  comment,
                  resolved,
                ).then(async (result) => {
                  setCommentBusy(false);
                  if (result.kind === "success") {
                    const data = await loadComments(client, state.snapshot, {
                      kind: "project",
                      projectId: selectedProject.id,
                    });
                    setComments({ kind: "ready", data });
                  } else showFailure(result);
                });
              }}
            />
          </div>
        ) : (
          <div className="inspector-empty workspace-context">
            <BrandMark />
            <p className="eyebrow">Aktywny kontekst</p>
            <h2>{bootstrap.workspace.name}</h2>
            <p>Root Space · lokalne źródło danych</p>
            <dl>
              <div>
                <dt>Tryb</dt>
                <dd>
                  {build.persistence === "encrypted-local"
                    ? "Szyfrowany local store"
                    : "Podgląd deweloperski"}
                </dd>
              </div>
              <div>
                <dt>Stan</dt>
                <dd>Gotowy</dd>
              </div>
            </dl>
          </div>
        )}
      </aside>

      {(selectedTask || selectedProject) && (
        <span className="context-thread" aria-hidden="true" />
      )}
      {captureOpen && (
        <CaptureDialog
          busy={capturing}
          workspaceName={bootstrap.workspace.name}
          onClose={() => !capturing && setCaptureOpen(false)}
          onSubmit={(text) => {
            if (!client) return;
            setCapturing(true);
            setNotice(undefined);
            void submitCaptureAsTask(client, state.snapshot, text).then(
              (result) => {
                setCapturing(false);
                if (result.kind === "success") {
                  setState({ kind: "ready", snapshot: result.snapshot });
                  const task = result.snapshot.tasks.find(
                    (item) => item.id === result.selectedTaskId,
                  );
                  openContext(
                    taskContext(
                      result.selectedTaskId,
                      task?.title ?? "Nowe zadanie",
                    ),
                  );
                  setReceipts((current) => ({
                    ...current,
                    [result.selectedTaskId]: result.receipt,
                  }));
                  setCaptureOpen(false);
                  setToast("Capture zapisano i utworzono zadanie.");
                } else showFailure(result);
              },
            );
          }}
        />
      )}
      {searchOpen && client && (
        <SearchOverlay
          client={client}
          snapshot={state.snapshot}
          onClose={() => setSearchOpen(false)}
          onNavigate={(nextSurface, recordId) => {
            if (nextSurface === "tasks") {
              const id = recordId as TaskId;
              const task = tasks.find((item) => item.id === id);
              openContext(taskContext(id, task?.title ?? "Zadanie"));
            } else if (nextSurface === "projects") {
              const id = recordId as ProjectId;
              const project =
                state.snapshot.projects.kind === "ready"
                  ? state.snapshot.projects.data.items.find(
                      (item) => item.id === id,
                    )
                  : undefined;
              openContext(projectContext(id, project?.title ?? "Projekt"));
            } else {
              const item = navItems.find((entry) => entry.id === nextSurface);
              openContext(
                destinationContext(nextSurface, item?.label ?? "Widok"),
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
                  await refreshAfter("Zmianę cofnięto i zapisano w audycie.");
                  openContext(destinationContext("activity", "Aktywność"));
                } else showFailure(result);
              },
            );
          }}
        />
      )}
      {recoveryOpen && client && (
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
            openContext(destinationContext("cockpit", "Tydzień"));
            setToast("Workspace przywrócono i otwarto ponownie.");
          }}
        />
      )}
      {toast && (
        <div className="undo-toast" role="status">
          <span>{toast}</span>
          <button className="ghost-button" onClick={() => setToast(undefined)}>
            Zamknij
          </button>
        </div>
      )}
    </main>
  );
};
