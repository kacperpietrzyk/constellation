import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { TaskId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  loadDesktopSnapshot,
  submitCaptureAsTask,
  type AuditReceiptProjection,
  type DesktopSnapshot,
  type SubmitTaskResult,
} from "./client/workflow.js";

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
  | "more"
  | "link"
  | "file"
  | "mic"
  | "open";

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
    more: (
      <path
        d="M5 12h.01M12 12h.01M19 12h.01"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    ),
    link: (
      <path d="M10 14a4 4 0 0 0 5.7 0l2.3-2.3A4 4 0 0 0 12.3 6l-1.1 1.1M14 10a4 4 0 0 0-5.7 0L6 12.3A4 4 0 0 0 11.7 18l1.1-1.1" />
    ),
    file: <path d="M6 3h8l4 4v14H6zM14 3v5h5" />,
    mic: (
      <path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM6 10v1a6 6 0 0 0 12 0v-1M12 17v4" />
    ),
    open: <path d="M14 5h5v5M19 5l-8 8M18 13v6H5V6h6" />,
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
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Myśl, zadanie, link albo coś do sprawdzenia…"
            maxLength={500}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                submit(event);
            }}
          />
          <div
            className="attachment-strip"
            aria-label="Typy załączników — kolejne etapy"
          >
            <button type="button" disabled>
              <Icon name="link" /> Link
            </button>
            <button type="button" disabled>
              <Icon name="file" /> Plik
            </button>
            <button type="button" disabled>
              <Icon name="mic" /> Głos
            </button>
          </div>
          <div className="capture-target">
            <div>
              <span>Workspace</span>
              <strong>{workspaceName}</strong>
            </div>
            <div>
              <span>Wynik M1</span>
              <strong>Zadanie · bez dodatkowej klasyfikacji</strong>
            </div>
          </div>
          <footer className="capture-footer">
            <span>Oryginał zostanie zachowany w podglądzie tej sesji.</span>
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

export const App = ({
  client,
}: {
  readonly client: ConstellationRendererClient | undefined;
}) => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>();
  const [receipts, setReceipts] = useState<
    Record<string, AuditReceiptProjection>
  >({});
  const [notice, setNotice] = useState<Notice>();
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
        if (!active) return;
        setState({ kind: "ready", snapshot });
        setSelectedTaskId(snapshot.tasks[0]?.id);
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
    const openCapture = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "KeyK"
      ) {
        event.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener("keydown", openCapture);
    return () => window.removeEventListener("keydown", openCapture);
  }, []);

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
    } else setNotice(result);
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
  return (
    <main className="desktop-shell">
      <aside className="sidebar">
        <div className="window-drag" />
        <div className="brand-row">
          <BrandMark />
          <strong>Constellation</strong>
        </div>
        <button className="workspace-switcher">
          <span className="workspace-avatar">I</span>
          <span>
            <strong>{bootstrap.workspace.name}</strong>
            <small>Local-only workspace</small>
          </span>
          <Icon name="chevron" />
        </button>
        <button className="search-control" disabled>
          <Icon name="search" />
          <span>Szukaj</span>
          <kbd>{modifierLabel}K</kbd>
        </button>
        <nav aria-label="Główna nawigacja">
          <p className="nav-label">Praca</p>
          <button className="nav-item active" aria-current="page">
            <Icon name="tasks" />
            <span>Zadania</span>
            <span className="nav-count">{tasks.length}</span>
          </button>
          <button className="nav-item" disabled>
            <Icon name="history" />
            <span>Historia Capture</span>
            <small>M2</small>
          </button>
        </nav>
        <div className="sidebar-spacer" />
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
            <span>Pamięć sesji · {build.version}</span>
          </div>
        </div>
      </aside>

      <section className="work-surface" aria-labelledby="tasks-title">
        <header className="surface-header">
          <div>
            <p className="eyebrow">Root Space · podgląd M1</p>
            <h1 id="tasks-title">Zadania</h1>
            <p>Przechwycone myśli, które wymagają działania.</p>
          </div>
          <button
            className="secondary-button compact"
            onClick={() => setCaptureOpen(true)}
          >
            <Icon name="capture" />
            Nowe zadanie
          </button>
        </header>
        {notice && (
          <PreviewNotice
            notice={notice}
            onDismiss={() => setNotice(undefined)}
          />
        )}

        {selectedTask && (
          <section className="context-panel" aria-labelledby="context-title">
            <div className="context-panel-copy">
              <p className="eyebrow">Wybrane teraz</p>
              <h2 id="context-title">{selectedTask.title}</h2>
              <p>
                {sourceCapture
                  ? "Zachowany oryginał prowadzi do tego zadania i jego śladu audytowego."
                  : "Zadanie w aktywnym kontekście workspace."}
              </p>
            </div>
            <button
              className="context-open"
              onClick={() => setSelectedTaskId(selectedTask.id)}
              aria-label="Otwórz kontekst zadania"
            >
              <Icon name="open" />
            </button>
          </section>
        )}

        <section className="task-panel" aria-label="Lista zadań">
          <header>
            <div>
              <h2>Wszystkie zadania</h2>
              <span>{tasks.length} w tym widoku</span>
            </div>
            <button className="icon-button" disabled aria-label="Dalsze opcje">
              <Icon name="more" />
            </button>
          </header>
          {tasks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-glyph">
                <Icon name="tasks" />
              </span>
              <div>
                <h3>Jeszcze nie ma zadań</h3>
                <p>
                  Zapisz pierwszą myśl. Oryginał przejdzie przez prawdziwy
                  Application Kernel i pozostanie powiązany z zadaniem.
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => setCaptureOpen(true)}
              >
                Otwórz Quick Capture
              </button>
            </div>
          ) : (
            <div className="task-list" role="list">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  className={`task-row ${task.id === selectedTaskId ? "selected" : ""}`}
                  onClick={() => setSelectedTaskId(task.id)}
                  role="listitem"
                >
                  <span className="task-check" aria-hidden="true" />
                  <span className="task-copy">
                    <strong>{task.title}</strong>
                    <span>
                      {task.sourceCaptureId
                        ? "Z Quick Capture · oryginał zachowany"
                        : "Zadanie w Root Space"}
                    </span>
                  </span>
                  <span className="task-status">{task.status.label}</span>
                  <Icon name="chevron" />
                </button>
              ))}
            </div>
          )}
        </section>

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
        aria-label="Podgląd zadania"
      >
        <header className="inspector-header">
          <div>
            <span>Podgląd kontekstu</span>
            <small>Zadanie</small>
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
                ? "Utworzone z zachowanego Capture. Relacja i historia pozostają dostępne z tego samego kontekstu."
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
                  <p>Quick Capture w aplikacji · oryginał zachowany</p>
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
                    <dt>Źródło</dt>
                    <dd>{receipt.origin}</dd>
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
                <p>
                  Receipt jest w Kernelu. Pełny detal pojawia się tutaj dla
                  zadań dodanych w tej sesji.
                </p>
              )}
            </section>
          </div>
        ) : (
          <div className="inspector-empty">
            <BrandMark />
            <p>Wybierz zadanie, aby zobaczyć źródło Capture i jego kontekst.</p>
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
    </main>
  );
};
