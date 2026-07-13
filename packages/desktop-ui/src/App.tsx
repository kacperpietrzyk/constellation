import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { TaskId } from "@constellation/contracts";
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
  loadDesktopSnapshot,
  submitCaptureAsTask,
  type AuditReceiptProjection,
  type DesktopSnapshot,
  type SubmitTaskResult,
} from "./client/workflow.js";
import {
  activity,
  conditionCopy,
  type ActivityFixture,
  type PreviewCondition,
  type SurfaceId,
} from "./client/wave2-fixtures.js";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly snapshot: DesktopSnapshot };

type Notice = Extract<
  SubmitTaskResult,
  { kind: "conflict" | "unavailable" | "error" }
>;
type IconName =
  | "capture"
  | "tasks"
  | "history"
  | "search"
  | "close"
  | "chevron"
  | "project"
  | "cockpit"
  | "activity"
  | "link"
  | "file"
  | "mic";

const Icon = ({ name }: { readonly name: IconName }) => {
  const paths = {
    capture: <path d="M12 5v14M5 12h14" />,
    tasks: <path d="m5 7 2 2 4-4M12 7h7M5 15l2 2 4-4M12 15h7" />,
    history: <path d="M4 6h16v12H4zM4 14h4l2 2h4l2-2h4" />,
    search: (
      <path d="m20 20-4.3-4.3M10.8 17a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4Z" />
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chevron: <path d="m9 7 5 5-5 5" />,
    project: <path d="M4 5h6l2 2h8v12H4z" />,
    cockpit: <path d="M4 5h7v6H4zM13 5h7v10h-7zM4 13h7v6H4zM13 17h7v2h-7z" />,
    activity: <path d="M5 6h14M5 12h14M5 18h9M3 6h.01M3 12h.01M3 18h.01" />,
    link: (
      <path d="M10 14a4 4 0 0 0 5.7 0l2.3-2.3A4 4 0 0 0 12.3 6l-1.1 1.1M14 10a4 4 0 0 0-5.7 0L6 12.3A4 4 0 0 0 11.7 18l1.1-1.1" />
    ),
    file: <path d="M6 3h8l4 4v14H6zM14 3v5h5" />,
    mic: (
      <path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM6 10v1a6 6 0 0 0 12 0v-1M12 17v4" />
    ),
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

const PreviewNotice = ({
  notice,
  onDismiss,
}: {
  readonly notice: Notice;
  readonly onDismiss: () => void;
}) => (
  <div className={`notice notice-${notice.kind}`} role="status">
    <span>{notice.message}</span>
    <button
      className="icon-button"
      onClick={onDismiss}
      aria-label="Zamknij komunikat"
    >
      <Icon name="close" />
    </button>
  </div>
);

const CaptureDialog = ({
  busy,
  modifierLabel,
  workspaceName,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly modifierLabel: string;
  readonly workspaceName: string;
  readonly onClose: () => void;
  readonly onSubmit: (text: string) => void;
}) => {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    inputRef.current?.focus();
    return () => dialog?.close();
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length > 0 && !busy) onSubmit(text);
  };
  return (
    <dialog
      ref={dialogRef}
      className="capture-backdrop"
      aria-labelledby="capture-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="capture-dialog">
        <header className="capture-header">
          <div>
            <p className="eyebrow">Quick Capture</p>
            <h2 id="capture-title">Zapisz cokolwiek</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Zamknij Quick Capture"
            disabled={busy}
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
          <div
            className="attachment-strip"
            aria-label="Typy załączników — kolejne etapy"
          >
            <button
              type="button"
              disabled
              title="Linki pojawią się w kolejnym etapie"
            >
              <Icon name="link" />
              Link
            </button>
            <button
              type="button"
              disabled
              title="Pliki pojawią się w kolejnym etapie"
            >
              <Icon name="file" />
              Plik
            </button>
            <button
              type="button"
              disabled
              title="Głos pojawi się w kolejnym etapie"
            >
              <Icon name="mic" />
              Głos
            </button>
          </div>
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
              disabled={busy || text.trim().length === 0}
            >
              {busy ? "Zapisuję…" : "Zapisz jako zadanie"}
              <kbd>{modifierLabel}↵</kbd>
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

export const App = ({
  client,
}: {
  readonly client: ConstellationRendererClient | undefined;
}) => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [surface, setSurface] = useState<SurfaceId>("cockpit");
  const [condition, setCondition] = useState<PreviewCondition>("ready");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>();
  const [receipts, setReceipts] = useState<
    Record<string, AuditReceiptProjection>
  >({});
  const [notice, setNotice] = useState<Notice>();
  const [relationAdded, setRelationAdded] = useState(false);
  const [undoItem, setUndoItem] = useState<ActivityFixture>();
  const [undoneActivityId, setUndoneActivityId] = useState<string>();
  const [toast, setToast] = useState<string>();
  const navRef = useRef<HTMLElement>(null);
  const modifierLabel = /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

  useEffect(() => {
    if (client === undefined) {
      setState({
        kind: "unavailable",
        message:
          "Bezpieczny most Electron jest niedostępny. Uruchom powierzchnię przez npm run dev:desktop.",
      });
      return;
    }
    let active = true;
    void loadDesktopSnapshot(client)
      .then((snapshot) => {
        if (active) {
          setState({ kind: "ready", snapshot });
          setSelectedTaskId(snapshot.tasks[0]?.id);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Nie udało się otworzyć workspace.",
          });
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "KeyK"
      ) {
        event.preventDefault();
        setCaptureOpen(true);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.code === "KeyK"
      ) {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        /^Digit[1-5]$/.test(event.code)
      ) {
        event.preventDefault();
        const item = navItems[Number(event.code.slice(-1)) - 1];
        if (item) setSurface(item.id);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setUndoItem(undefined);
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

  const snapshot = state.kind === "ready" ? state.snapshot : undefined;
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

  const captureTask = async (text: string) => {
    if (client === undefined || snapshot === undefined) return;
    setCapturing(true);
    setNotice(undefined);
    const result = await submitCaptureAsTask(client, snapshot, text);
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
    } else setNotice(result);
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
  if (state.kind === "unavailable" || state.kind === "error")
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
  const handleSelectTask = (id: TaskId) => {
    setSelectedTaskId(id);
    setSurface("tasks");
  };
  const openUndo = (item: ActivityFixture = activity[0]!) => setUndoItem(item);
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
          className="workspace-switcher"
          aria-label={`Workspace ${bootstrap.workspace.name}, lokalny`}
        >
          <span className="workspace-avatar">I</span>
          <span>
            <strong>{bootstrap.workspace.name}</strong>
            <small>Local-only workspace</small>
          </span>
          <Icon name="chevron" />
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
        <label className="fixture-condition">
          <span>Stan podglądu</span>
          <select
            value={condition}
            onChange={(event) =>
              setCondition(event.target.value as PreviewCondition)
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
            <strong>Podgląd syntetyczny</strong>
            <span>
              {build.persistence === "in-memory"
                ? "Pamięć sesji"
                : "Lokalny store"}{" "}
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
          <PreviewNotice
            notice={notice}
            onDismiss={() => setNotice(undefined)}
          />
        )}
        {condition !== "ready" && (
          <div
            className={`condition-banner tone-${conditionCopy[condition].tone}`}
            role="status"
          >
            <span className="condition-symbol" aria-hidden="true">
              {condition === "conflict" || condition === "permission"
                ? "!"
                : "i"}
            </span>
            <div>
              <strong>{conditionCopy[condition].title}</strong>
              <span>{conditionCopy[condition].detail}</span>
            </div>
            <button
              className="secondary-button compact"
              onClick={() => setCondition("ready")}
            >
              {conditionCopy[condition].action}
            </button>
          </div>
        )}
        {condition === "conflict" && (
          <section
            className="conflict-compare"
            aria-labelledby="conflict-title"
          >
            <header>
              <p className="eyebrow">Jawny konflikt</p>
              <h2 id="conflict-title">Następna akcja projektu</h2>
            </header>
            <div>
              <section>
                <small>Twoja wersja · v18</small>
                <strong>Domknij model cenowy</strong>
                <span>Zmieniono 10:41</span>
              </section>
              <section>
                <small>Nowsza wersja · v19</small>
                <strong>Potwierdź cennik partnera</strong>
                <span>Research Partner · 10:42</span>
              </section>
            </div>
            <footer>
              <button className="ghost-button">Zachowaj nowszą</button>
              <button
                className="secondary-button"
                onClick={() => setCondition("ready")}
              >
                Wybierz i kontynuuj
              </button>
            </footer>
          </section>
        )}
        {surface === "cockpit" && (
          <CockpitSurface
            snapshot={state.snapshot}
            onOpenProject={() => setSurface("projects")}
            onSelectTask={handleSelectTask}
          />
        )}
        {surface === "tasks" && (
          <TasksSurface
            snapshot={state.snapshot}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onCapture={() => setCaptureOpen(true)}
          />
        )}
        {surface === "projects" && (
          <ProjectsSurface
            relationAdded={relationAdded}
            onRelate={() => {
              setRelationAdded(true);
              setToast("Powiązanie dodano w deterministycznym mocku UI.");
            }}
          />
        )}
        {surface === "history" && (
          <HistorySurface snapshot={state.snapshot} onUndo={() => openUndo()} />
        )}
        {surface === "activity" && (
          <ActivitySurface
            undoneActivityId={undoneActivityId}
            onUndo={setUndoItem}
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
              onClick={() => setSelectedTaskId(undefined)}
              aria-label="Zamknij inspector"
            >
              <Icon name="close" />
            </button>
          )}
        </header>
        {selectedTask ? (
          <div className="inspector-body">
            <span className="record-status">
              <i />
              {selectedTask.status.label}
            </span>
            <h2>{selectedTask.title}</h2>
            <p className="record-summary">
              {sourceCapture
                ? "Utworzone z zachowanego Capture. Relacja i historia pozostają dostępne z tego kontekstu."
                : "Zadanie w aktywnym workspace."}
            </p>
            <section className="inspector-section">
              <p className="section-label">Szczegóły</p>
              <dl className="record-fields">
                <div>
                  <dt>Status</dt>
                  <dd>{selectedTask.status.label}</dd>
                </div>
                <div>
                  <dt>Workspace</dt>
                  <dd>{bootstrap.workspace.name}</dd>
                </div>
              </dl>
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
                    <dt>Zmiany</dt>
                    <dd>{receipt.changedFields.join(", ")}</dd>
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
                <dd>Dane syntetyczne + realny Capture</dd>
              </div>
              <div>
                <dt>Stan</dt>
                <dd>
                  {condition === "ready"
                    ? "Gotowy"
                    : conditionCopy[condition].title}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </aside>

      {selectedTask && <span className="context-thread" aria-hidden="true" />}
      {captureOpen && (
        <CaptureDialog
          busy={capturing}
          modifierLabel={modifierLabel}
          workspaceName={bootstrap.workspace.name}
          onClose={() => !capturing && setCaptureOpen(false)}
          onSubmit={(text) => void captureTask(text)}
        />
      )}
      {searchOpen && (
        <SearchOverlay
          snapshot={state.snapshot}
          onClose={() => setSearchOpen(false)}
          onNavigate={setSurface}
        />
      )}
      {undoItem && (
        <UndoDialog
          item={undoItem}
          onClose={() => setUndoItem(undefined)}
          onConfirm={() => {
            setUndoneActivityId(undoItem.id);
            setUndoItem(undefined);
            setSurface("activity");
            setToast("Zmianę cofnięto w deterministycznym mocku UI.");
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
