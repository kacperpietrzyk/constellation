import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { ProjectId, RelationId, TaskId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

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
  createProject,
  loadDesktopSnapshot,
  loadProjectOverview,
  previewUndo,
  relateTask,
  setTaskCompletion,
  setTaskStatus,
  submitCaptureAsTask,
  undoCommand,
  unrelateTask,
  updateProjectOutcome,
  type AuditReceiptProjection,
  type DesktopSnapshot,
  type MutationFailure,
  type ProjectOverviewProjection,
  type UndoPreview,
} from "./client/workflow.js";
import {
  conditionCopy,
  type PreviewCondition,
  type SurfaceId,
} from "./client/wave2-fixtures.js";
import { WorkspaceRecovery } from "./WorkspaceRecovery.js";

type LoadState =
  | { readonly kind: "loading" }
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
  | "activity";
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
];

export const RealApp = ({
  client,
}: {
  readonly client: ConstellationRendererClient | undefined;
}) => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [surface, setSurface] = useState<SurfaceId>("cockpit");
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
  const modifierLabel = /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

  const snapshot = state.kind === "ready" ? state.snapshot : undefined;
  const reload = async () => {
    if (!client) return;
    const next = await loadDesktopSnapshot(client, snapshot?.build);
    setState({ kind: "ready", snapshot: next });
    setSelectedTaskId((current) => current ?? next.tasks[0]?.id);
    if (selectedProjectId === undefined && next.projects.kind === "ready")
      setSelectedProjectId(next.projects.data.items[0]?.id);
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
    void loadDesktopSnapshot(client)
      .then((next) => {
        if (!active) return;
        setState({ kind: "ready", snapshot: next });
        setSelectedTaskId(next.tasks[0]?.id);
        if (next.projects.kind === "ready")
          setSelectedProjectId(next.projects.data.items[0]?.id);
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
    const onKeyDown = (event: KeyboardEvent) => {
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
        /^Digit[1-5]$/.test(event.code)
      ) {
        event.preventDefault();
        const item = navItems[Number(event.code.slice(-1)) - 1];
        if (item) setSurface(item.id);
      } else if (event.key === "Escape") {
        setSearchOpen(false);
        setUndoPreview(undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedTask = useMemo(
    () => snapshot?.tasks.find((task) => task.id === selectedTaskId),
    [selectedTaskId, snapshot],
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

  if (state.kind === "loading")
    return (
      <main className="center-state" aria-busy="true">
        <BrandMark />
        <div className="loading-line" />
        <p>Otwieram workspace…</p>
      </main>
    );
  if (state.kind !== "ready")
    return (
      <main className="center-state">
        <span className="state-symbol">!</span>
        <p className="eyebrow">Interactive alpha</p>
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
          aria-label={`Workspace ${bootstrap.workspace.name}, lokalny`}
          disabled={isPreview}
          title={
            isPreview
              ? "Backup jest dostępny w szyfrowanym lokalnym workspace."
              : "Otwórz backup i odzyskiwanie workspace"
          }
          onClick={() => setRecoveryOpen(true)}
        >
          <span className="workspace-avatar">I</span>
          <span>
            <strong>{bootstrap.workspace.name}</strong>
            <small>Local-only workspace</small>
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
              onClick={() => setSurface(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "tasks" ? (
                <span className="nav-count">{tasks.length}</span>
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
              setSelectedProjectId(id);
              setSurface("projects");
            }}
            onSelectTask={(id) => {
              setSelectedTaskId(id);
              setSurface("tasks");
            }}
          />
        )}
        {surface === "tasks" && (
          <TasksSurface
            snapshot={state.snapshot}
            selectedTaskId={selectedTaskId}
            busyTaskId={busyTaskId}
            onSelectTask={setSelectedTaskId}
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
          />
        )}
        {surface === "projects" && (
          <ProjectsSurface
            snapshot={state.snapshot}
            selectedProjectId={selectedProjectId}
            overview={projectOverview}
            relation={sessionRelation}
            busy={projectBusy}
            onSelectProject={setSelectedProjectId}
            onCreate={(title, outcome) => {
              if (!client) return;
              setProjectBusy(true);
              void createProject(client, state.snapshot, title, outcome).then(
                async (result) => {
                  setProjectBusy(false);
                  if (result.kind === "success") {
                    setSelectedProjectId(result.data.projectId);
                    await refreshAfter("Projekt utworzono.");
                  } else showFailure(result);
                },
              );
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
        <button className="capture-dock" onClick={() => setCaptureOpen(true)}>
          <span>
            <Icon name="capture" />
            Zapisz myśl, link albo zadanie…
          </span>
          <kbd>{modifierLabel}⇧K</kbd>
        </button>
      </section>

      <aside
        className={`inspector ${selectedTask ? "open" : ""}`}
        aria-label="Podgląd kontekstu"
      >
        <header className="inspector-header">
          <div>
            <span>Podgląd kontekstu</span>
            <small>{selectedTask ? "Zadanie" : "Workspace"}</small>
          </div>
          {selectedTask && (
            <button
              className="icon-button"
              aria-label="Zamknij inspector"
              onClick={() => setSelectedTaskId(undefined)}
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

      {selectedTask && <span className="context-thread" aria-hidden="true" />}
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
                  setSelectedTaskId(result.selectedTaskId);
                  setReceipts((current) => ({
                    ...current,
                    [result.selectedTaskId]: result.receipt,
                  }));
                  setCaptureOpen(false);
                  setSurface("tasks");
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
            setSurface(nextSurface);
            if (nextSurface === "tasks") setSelectedTaskId(recordId as TaskId);
            if (nextSurface === "projects")
              setSelectedProjectId(recordId as ProjectId);
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
                  setSurface("activity");
                } else showFailure(result);
              },
            );
          }}
        />
      )}
      {recoveryOpen && client && (
        <WorkspaceRecovery
          client={client}
          workspaceName={bootstrap.workspace.name}
          recoveredPrevious={
            build.startupRecovery === "previous_workspace_restored"
          }
          onClose={() => setRecoveryOpen(false)}
          onRestored={async () => {
            await reload();
            setSelectedTaskId(undefined);
            setSelectedProjectId(undefined);
            setSurface("cockpit");
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
