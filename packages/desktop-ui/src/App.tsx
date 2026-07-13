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

const Icon = ({
  name,
}: {
  readonly name: "capture" | "inbox" | "tasks" | "close";
}) => {
  const paths = {
    capture: <path d="M12 5v14M5 12h14" />,
    inbox: <path d="M4 6h16v12H4zM4 14h4l2 2h4l2-2h4" />,
    tasks: <path d="m5 7 2 2 4-4M12 7h7M5 15l2 2 4-4M12 15h7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  } as const;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      {paths[name]}
    </svg>
  );
};

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
      aria-label="Dismiss message"
    >
      <Icon name="close" />
    </button>
  </div>
);

const CaptureDialog = ({
  busy,
  modifierLabel,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly modifierLabel: string;
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
      className="dialog-backdrop"
      aria-labelledby="capture-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="capture-dialog">
        <header>
          <div>
            <p className="quiet-label">Quick Capture</p>
            <h2 id="capture-title">Capture what needs doing</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close Quick Capture"
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <label htmlFor="capture-text">Original text</label>
          <textarea
            id="capture-text"
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="e.g. Prepare the interactive alpha handoff"
            maxLength={500}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                submit(event);
            }}
          />
          <div className="capture-footer">
            <span>The original Capture is preserved before routing.</span>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || text.trim().length === 0}
            >
              {busy ? "Capturing…" : "Capture as Task"}
              <kbd>{modifierLabel}↵</kbd>
            </button>
          </div>
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
          "The secure Electron bridge is unavailable. Launch this surface with npm run dev:desktop.",
      });
      return;
    }
    let active = true;
    void loadDesktopSnapshot(client)
      .then((snapshot) => active && setState({ kind: "ready", snapshot }))
      .catch((error: unknown) => {
        if (active)
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not load the workspace.",
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
    } else {
      setNotice(result);
    }
  };

  if (state.kind === "loading") {
    return (
      <main className="center-state" aria-busy="true">
        <div className="loading-mark" />
        <p>Opening the workspace…</p>
      </main>
    );
  }
  if (state.kind === "unavailable" || state.kind === "error") {
    return (
      <main className="center-state">
        <div className="state-symbol">!</div>
        <h1>
          {state.kind === "unavailable"
            ? "Desktop bridge unavailable"
            : "Workspace could not open"}
        </h1>
        <p>{state.message}</p>
        <button
          className="secondary-button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </main>
    );
  }

  const { bootstrap, build, tasks } = state.snapshot;
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="window-drag" />
        <div className="workspace-identity">
          <span className="workspace-mark">C</span>
          <div>
            <strong>{bootstrap.workspace.name}</strong>
            <span>Local-only workspace</span>
          </div>
        </div>
        <nav aria-label="Primary">
          <button className="nav-item active" aria-current="page">
            <Icon name="tasks" />
            <span>Tasks</span>
            <span className="nav-count">{tasks.length}</span>
          </button>
          <button className="nav-item" disabled>
            <Icon name="inbox" />
            <span>Capture History</span>
          </button>
        </nav>
        <button
          className="capture-trigger"
          onClick={() => setCaptureOpen(true)}
        >
          <Icon name="capture" />
          <span>Quick Capture</span>
          <kbd>{modifierLabel}⇧K</kbd>
        </button>
        <div className="preview-identity">
          <span className="status-dot" />
          <div>
            <strong>In-memory developer preview</strong>
            <span>Resets when the app closes · {build.version}</span>
          </div>
        </div>
      </aside>

      <section className="work-surface" aria-labelledby="tasks-title">
        <header className="surface-header">
          <div>
            <p className="quiet-label">Root Space</p>
            <h1 id="tasks-title">Tasks</h1>
          </div>
          <button
            className="primary-button compact"
            onClick={() => setCaptureOpen(true)}
          >
            <Icon name="capture" />
            Capture
          </button>
        </header>
        {notice && (
          <PreviewNotice
            notice={notice}
            onDismiss={() => setNotice(undefined)}
          />
        )}
        {tasks.length === 0 ? (
          <section className="empty-state">
            <div className="empty-line" />
            <h2>No tasks yet</h2>
            <p>
              Capture one thought. Constellation will preserve the original and
              route it through the real Application Kernel.
            </p>
            <button
              className="secondary-button"
              onClick={() => setCaptureOpen(true)}
            >
              Open Quick Capture
            </button>
          </section>
        ) : (
          <div className="task-list" role="list" aria-label="Tasks">
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
                  <span>{task.status.label} · Captured just now</span>
                </span>
                {task.sourceCaptureId && (
                  <span className="source-badge">Capture</span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <aside
        className={`inspector ${selectedTask ? "open" : ""}`}
        aria-label="Task inspector"
      >
        {selectedTask ? (
          <>
            <header className="inspector-header">
              <span>Task details</span>
              <button
                className="icon-button"
                onClick={() => setSelectedTaskId(undefined)}
                aria-label="Close inspector"
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="inspector-body">
              <p className="record-type">Task</p>
              <h2>{selectedTask.title}</h2>
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
              <section className="provenance-block">
                <h3>Capture provenance</h3>
                {sourceCapture ? (
                  <>
                    <blockquote>{sourceCapture.originalText}</blockquote>
                    <p>In-app Quick Capture · Original preserved</p>
                  </>
                ) : (
                  <p>No Capture source is attached.</p>
                )}
              </section>
              <section className="audit-block">
                <h3>Audit receipt</h3>
                {receipt ? (
                  <dl>
                    <div>
                      <dt>Command</dt>
                      <dd>{receipt.commandName}</dd>
                    </div>
                    <div>
                      <dt>Origin</dt>
                      <dd>{receipt.origin}</dd>
                    </div>
                    <div>
                      <dt>Changed</dt>
                      <dd>{receipt.changedFields.join(", ")}</dd>
                    </div>
                    <div>
                      <dt>Receipt</dt>
                      <dd className="mono">{receipt.id.slice(0, 18)}…</dd>
                    </div>
                  </dl>
                ) : (
                  <p>
                    Select a Task created in this session to inspect its routing
                    receipt.
                  </p>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="inspector-empty">
            <span className="inspector-glyph" />
            <p>Select a Task to inspect its source and audit trail.</p>
          </div>
        )}
      </aside>

      {captureOpen && (
        <CaptureDialog
          busy={capturing}
          modifierLabel={modifierLabel}
          onClose={() => !capturing && setCaptureOpen(false)}
          onSubmit={(text) => void captureTask(text)}
        />
      )}
    </main>
  );
};
