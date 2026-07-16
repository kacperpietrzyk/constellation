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
  CaptureOriginal,
  PrincipalId,
  ProjectId,
  RelationId,
  TaskId,
} from "@constellation/contracts";
import type {
  CapturePayloadResponse,
  ConstellationRendererClient,
  DesktopBuildInfo,
} from "@constellation/desktop-preload/client";

import { AccessSurface } from "./AccessSurface.js";
import { AttentionSurface, CommentsPanel } from "./CollaborationSurfaces.js";
import { DocumentsSurface } from "./DocumentsSurface.js";
import { MeetingsSurface } from "./MeetingsSurface.js";
import { StrategicDepthSurface } from "./StrategicDepthSurface.js";
import { WorkSurface } from "./WorkSurface.js";
import { SettingsSurface } from "./SettingsSurface.js";
import { OnboardingFlow } from "./OnboardingFlow.js";

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
  setProjectLifecycle,
  submitQuickCapture,
  undoCommand,
  unrelateTask,
  updateProjectOutcome,
  updateAttention,
  createAgentGrant,
  rotateAgentCredential,
  revokeAgentGrant,
  createRemoteAgentGrant,
  rotateRemoteAgentCredential,
  revokeRemoteAgentGrant,
  routeCaptureException,
  resolveCaptureException,
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
  pruneInaccessibleShellContexts,
  restoreShellNavigation,
  serializeShellNavigation,
  taskContext,
  type ShellContext,
} from "./client/shell-navigation.js";
import {
  conditionCopy,
  type PreviewCondition,
  type SurfaceId,
} from "./client/wave2-fixtures.js";
import { WorkspaceRecovery } from "./WorkspaceRecovery.js";
import {
  MAX_VOICE_NOTE_BYTES,
  startVoiceRecording,
  type VoiceRecordingSession,
} from "./voice-recorder.js";

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
  | "documents"
  | "meetings"
  | "relationships";
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
    meetings: <path d="M5 5h14v14H5zM8 3v5M16 3v5M5 10h14M8 14h3M13 14h3" />,
    relationships: (
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 10a2.5 2.5 0 1 0 0-5M3 20c0-4 2-6 5-6s5 2 5 6M14 14c3 0 5 2 5 6M11 8h3" />
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

export const CaptureDialog = ({
  busy,
  client,
  initialMode = "text",
  workspaceName,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly client: ConstellationRendererClient | undefined;
  readonly initialMode?: "text" | "url" | "file" | "voice";
  readonly workspaceName: string;
  readonly onClose: () => void;
  readonly onSubmit: (original: CaptureOriginal) => Promise<string | undefined>;
}) => {
  const [mode, setMode] = useState<"text" | "url" | "file" | "voice">(
    initialMode,
  );
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [managedOriginal, setManagedOriginal] = useState<CaptureOriginal>();
  const [payloadBusy, setPayloadBusy] = useState(false);
  const [payloadError, setPayloadError] = useState<string>();
  const [voiceState, setVoiceState] = useState<
    "idle" | "requesting" | "recording" | "staging"
  >("idle");
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);
  const [retainVoice, setRetainVoice] = useState(false);
  const voiceSessionRef = useRef<VoiceRecordingSession | undefined>(undefined);
  const voiceGenerationRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
    return () => dialogRef.current?.close();
  }, []);
  useEffect(() => {
    if (voiceState !== "recording") return;
    const timer = window.setInterval(() => {
      const startedAt = voiceSessionRef.current?.startedAt;
      if (startedAt !== undefined)
        setVoiceElapsedMs(Math.min(120_000, Date.now() - startedAt));
    }, 250);
    return () => window.clearInterval(timer);
  }, [voiceState]);
  useEffect(
    () => () => {
      voiceGenerationRef.current += 1;
      voiceSessionRef.current?.cancel();
    },
    [],
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const original =
      mode === "text" && text.trim()
        ? ({ kind: "text", text } as const)
        : mode === "url" && url.trim()
          ? ({ kind: "url", url: url.trim() } as const)
          : mode === "file" &&
              (managedOriginal?.kind === "managed_file" ||
                managedOriginal?.kind === "screenshot")
            ? managedOriginal
            : mode === "voice" && managedOriginal?.kind === "voice_note"
              ? managedOriginal
              : undefined;
    if (original === undefined) return;
    setPayloadError(undefined);
    const error = await onSubmit(original);
    if (error !== undefined) setPayloadError(error);
  };
  const payloadFailure = (code: string): string => {
    switch (code) {
      case "payload_empty":
        return "Ten plik jest pusty. Wybierz inny plik.";
      case "payload_too_large":
        return "Plik przekracza limit 25 MB. Zachowaj mniejszą wersję.";
      case "payload_unsupported":
        return "Tego pliku nie można bezpiecznie przejąć.";
      case "payload_transfer_unavailable":
        return "Pliki w workspace z Hubem będą dostępne po włączeniu bezpiecznego transferu. Tekst i linki działają nadal.";
      case "cancelled":
        return "";
      default:
        return "Nie udało się zachować pliku. Spróbuj ponownie.";
    }
  };
  const acceptPayload = (result: CapturePayloadResponse) => {
    setPayloadBusy(false);
    if (result.outcome === "success") {
      if (managedOriginal !== undefined)
        void client?.discardCapturePayload?.(managedOriginal);
      setManagedOriginal(result.original);
      setPayloadError(undefined);
    } else {
      const message = payloadFailure(result.code);
      setPayloadError(message || undefined);
    }
  };
  const stageFile = async (
    nextFile: File,
    inputKind: "file" | "screenshot",
  ) => {
    if (client?.stageCapturePayload === undefined) {
      setPayloadError("Zarządzane pliki są niedostępne w tym uruchomieniu.");
      return;
    }
    if (nextFile.size === 0) {
      setPayloadError(payloadFailure("payload_empty"));
      return;
    }
    if (nextFile.size > 25 * 1024 * 1024) {
      setPayloadError(payloadFailure("payload_too_large"));
      return;
    }
    setPayloadBusy(true);
    setPayloadError(undefined);
    try {
      acceptPayload(
        await client.stageCapturePayload({
          displayName:
            nextFile.name ||
            `Screenshot ${new Date().toLocaleString("pl-PL")}.png`,
          mediaType: nextFile.type || "application/octet-stream",
          inputKind,
          bytes: new Uint8Array(await nextFile.arrayBuffer()),
        }),
      );
    } catch {
      setPayloadBusy(false);
      setPayloadError(
        "Nie udało się odczytać pliku. Sprawdź uprawnienia i spróbuj ponownie.",
      );
    }
  };
  const choosePayload = async () => {
    if (client?.selectCapturePayload === undefined) {
      setPayloadError("Wybór zarządzanego pliku jest niedostępny.");
      return;
    }
    setPayloadBusy(true);
    setPayloadError(undefined);
    try {
      acceptPayload(await client.selectCapturePayload());
    } catch {
      setPayloadBusy(false);
      setPayloadError("Nie udało się otworzyć pliku. Spróbuj ponownie.");
    }
  };
  const voiceFailure = (code: string): string => {
    switch (code) {
      case "unsupported":
        return "Nagrywanie krótkiej notatki głosowej nie jest wspierane w tym uruchomieniu.";
      case "permission_denied":
        return "Brak dostępu do mikrofonu. Zezwól Constellation na mikrofon w ustawieniach systemu i spróbuj ponownie.";
      case "device_unavailable":
        return "Mikrofon jest niedostępny lub używany przez inną aplikację.";
      default:
        return "Nagranie nie zostało zachowane. Spróbuj ponownie.";
    }
  };
  const startVoice = async () => {
    if (client?.stageCapturePayload === undefined) {
      setPayloadError("Szyfrowane notatki głosowe są niedostępne.");
      return;
    }
    if (managedOriginal !== undefined) discardPayload();
    const generation = voiceGenerationRef.current + 1;
    voiceGenerationRef.current = generation;
    setVoiceState("requesting");
    setVoiceElapsedMs(0);
    setPayloadError(undefined);
    const started = await startVoiceRecording();
    if (voiceGenerationRef.current !== generation) {
      if ("finished" in started) started.cancel();
      return;
    }
    if (!("finished" in started)) {
      setVoiceState("idle");
      if (started.outcome === "failure")
        setPayloadError(voiceFailure(started.code));
      return;
    }
    voiceSessionRef.current = started;
    setVoiceState("recording");
    const retentionPolicy = retainVoice ? "retain" : "delete_after_transcript";
    void started.finished.then(async (finished) => {
      if (voiceGenerationRef.current !== generation) return;
      voiceSessionRef.current = undefined;
      if (finished.outcome === "cancelled") {
        setVoiceState("idle");
        setVoiceElapsedMs(0);
        return;
      }
      if (finished.outcome === "failure") {
        setVoiceState("idle");
        setPayloadError(voiceFailure(finished.code));
        return;
      }
      if (finished.bytes.byteLength > MAX_VOICE_NOTE_BYTES) {
        setVoiceState("idle");
        setPayloadError(
          "Nagranie przekroczyło limit 25 MB i nie zostało zapisane.",
        );
        return;
      }
      setVoiceState("staging");
      setPayloadBusy(true);
      const extension =
        finished.mediaType === "audio/mp4"
          ? "m4a"
          : finished.mediaType === "audio/ogg"
            ? "ogg"
            : "webm";
      try {
        acceptPayload(
          await client.stageCapturePayload!({
            displayName: `Notatka głosowa ${new Date().toLocaleString("pl-PL")}.${extension}`,
            mediaType: finished.mediaType,
            inputKind: "voice_note",
            bytes: finished.bytes,
            durationMs: finished.durationMs,
            retentionPolicy,
          }),
        );
        setVoiceElapsedMs(finished.durationMs);
        setVoiceState("idle");
        if (finished.automaticallyStopped)
          setPayloadError(
            "Osiągnięto limit 2 minut. Nagranie jest gotowe do zapisania.",
          );
      } catch {
        setPayloadBusy(false);
        setVoiceState("idle");
        setPayloadError(
          "Nie udało się zaszyfrować nagrania. Spróbuj ponownie.",
        );
      }
    });
  };
  const cancelVoice = () => {
    voiceGenerationRef.current += 1;
    voiceSessionRef.current?.cancel();
    voiceSessionRef.current = undefined;
    setVoiceState("idle");
    setVoiceElapsedMs(0);
  };
  const discardPayload = () => {
    if (managedOriginal !== undefined)
      void client?.discardCapturePayload?.(managedOriginal);
    setManagedOriginal(undefined);
  };
  const close = () => {
    cancelVoice();
    discardPayload();
    onClose();
  };
  const canSubmit =
    mode === "text"
      ? text.trim().length > 0
      : mode === "url"
        ? url.trim().length > 0
        : mode === "file"
          ? managedOriginal?.kind === "managed_file" ||
            managedOriginal?.kind === "screenshot"
          : managedOriginal?.kind === "voice_note";
  return (
    <dialog
      ref={dialogRef}
      className="capture-backdrop"
      aria-labelledby="capture-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy && !payloadBusy) close();
      }}
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && !payloadBusy && close()
      }
      onPaste={(event) => {
        if (mode !== "file") return;
        const image = [...event.clipboardData.files].find((item) =>
          item.type.startsWith("image/"),
        );
        if (image !== undefined) {
          event.preventDefault();
          void stageFile(image, "screenshot");
        }
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
            aria-label="Zamknij Quick Capture"
            disabled={busy || payloadBusy}
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <div
            className="capture-kind"
            role="tablist"
            aria-label="Rodzaj Capture"
          >
            {(["text", "url", "file", "voice"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={mode === kind}
                onClick={() => {
                  if (mode === "voice" && kind !== "voice") cancelVoice();
                  setMode(kind);
                }}
              >
                {kind === "text"
                  ? "Tekst"
                  : kind === "url"
                    ? "Link"
                    : kind === "file"
                      ? "Plik"
                      : "Głos"}
              </button>
            ))}
          </div>
          {mode === "text" ? (
            <>
              <label className="sr-only" htmlFor="capture-text">
                Treść przechwycenia
              </label>
              <textarea
                id="capture-text"
                name="capture"
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Myśl, zadanie albo coś do zrobienia…"
                maxLength={262_144}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                    submit(event);
                }}
              />
              <small className="capture-mode-note">
                Dyktowanie systemowe działa w tym polu jak zwykły tekst —
                Constellation nie zachowuje wtedy audio.
              </small>
            </>
          ) : mode === "url" ? (
            <label className="capture-field">
              <span>Adres URL</span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                autoFocus
                required
              />
            </label>
          ) : mode === "voice" ? (
            <div className="capture-voice" aria-busy={voiceState === "staging"}>
              <div className="capture-voice-status" aria-live="polite">
                <span
                  className={
                    voiceState === "recording"
                      ? "voice-indicator is-recording"
                      : "voice-indicator"
                  }
                  aria-hidden="true"
                />
                <div>
                  <strong>
                    {managedOriginal?.kind === "voice_note"
                      ? "Nagranie zaszyfrowane i gotowe"
                      : voiceState === "requesting"
                        ? "Czekam na zgodę systemu…"
                        : voiceState === "recording"
                          ? "Nagrywanie"
                          : voiceState === "staging"
                            ? "Szyfruję i zachowuję…"
                            : "Krótka notatka głosowa"}
                  </strong>
                  <span>
                    {managedOriginal?.kind === "voice_note"
                      ? `${Math.ceil(managedOriginal.durationMs / 1000)} s · ${Math.ceil(managedOriginal.payload.byteLength / 1024).toLocaleString("pl-PL")} KB`
                      : `${Math.floor(voiceElapsedMs / 60_000)}:${Math.floor(
                          (voiceElapsedMs % 60_000) / 1000,
                        )
                          .toString()
                          .padStart(2, "0")} / 2:00`}
                  </span>
                </div>
              </div>
              <div className="capture-voice-actions">
                {voiceState === "recording" ? (
                  <>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => voiceSessionRef.current?.stop()}
                    >
                      Zatrzymaj
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={cancelVoice}
                    >
                      Anuluj nagranie
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={
                      voiceState === "requesting" || voiceState === "staging"
                    }
                    onClick={() => void startVoice()}
                  >
                    {managedOriginal?.kind === "voice_note"
                      ? "Nagraj ponownie"
                      : "Rozpocznij nagrywanie"}
                  </button>
                )}
              </div>
              <label className="capture-voice-retention">
                <input
                  type="checkbox"
                  checked={retainVoice}
                  disabled={
                    voiceState !== "idle" ||
                    managedOriginal?.kind === "voice_note"
                  }
                  onChange={(event) => setRetainVoice(event.target.checked)}
                />
                <span>
                  Zachowaj audio po transkrypcji. Domyślnie zostanie usunięte
                  dopiero po trwałym zapisie transkryptu przez zewnętrznego
                  agenta MCP.
                </span>
              </label>
              <small>
                Constellation nie transkrybuje i nie nagrywa spotkań. Mikrofon
                działa wyłącznie podczas widocznego nagrywania w tym oknie.
              </small>
              {payloadError && (
                <p className="capture-payload-error" role="alert">
                  {payloadError}
                </p>
              )}
            </div>
          ) : (
            <div
              className="capture-file"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer.files[0];
                if (dropped !== undefined)
                  void stageFile(
                    dropped,
                    dropped.type.startsWith("image/") ? "screenshot" : "file",
                  );
              }}
              aria-busy={payloadBusy}
            >
              <strong>
                {managedOriginal?.kind === "managed_file" ||
                managedOriginal?.kind === "screenshot"
                  ? managedOriginal.payload.displayName
                  : payloadBusy
                    ? "Szyfruję i zachowuję…"
                    : "Upuść plik lub wklej screenshot"}
              </strong>
              <button
                className="secondary-button"
                type="button"
                disabled={payloadBusy}
                onClick={() => void choosePayload()}
              >
                {managedOriginal === undefined ? "Wybierz plik" : "Zmień plik"}
              </button>
              <small>
                Constellation zachowa zaszyfrowaną kopię w tym workspace przed
                uporządkowaniem. Lokalna ścieżka nie zostanie zapisana.
              </small>
              {payloadError && (
                <p className="capture-payload-error" role="alert">
                  {payloadError}
                </p>
              )}
            </div>
          )}
          <div className="capture-target">
            <div>
              <span>Workspace</span>
              <strong>{workspaceName}</strong>
            </div>
            <div>
              <span>Wynik</span>
              <strong>Reguła aplikacji · z możliwością cofnięcia</strong>
            </div>
          </div>
          <footer className="capture-footer">
            <span>Oryginał zostanie zachowany i powiązany z wynikiem.</span>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || payloadBusy || !canSubmit}
            >
              {busy ? "Przetwarzam…" : "Zapisz i uporządkuj"}
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
  shortcut?: string;
}[] = [
  { id: "cockpit", label: "Tydzień", icon: "cockpit", shortcut: "1" },
  { id: "meetings", label: "Spotkania", icon: "meetings", shortcut: "2" },
  { id: "relationships", label: "Relacje", icon: "relationships" },
  { id: "work", label: "Praca", icon: "project", shortcut: "3" },
  { id: "tasks", label: "Zadania", icon: "tasks", shortcut: "4" },
  { id: "projects", label: "Projekty", icon: "project", shortcut: "5" },
  { id: "history", label: "Historia Capture", icon: "history", shortcut: "6" },
  { id: "activity", label: "Aktywność", icon: "activity", shortcut: "7" },
  { id: "attention", label: "Do uwagi", icon: "attention", shortcut: "8" },
  { id: "access", label: "Dostęp", icon: "access", shortcut: "9" },
  { id: "documents", label: "Dokumenty", icon: "documents" },
  { id: "settings", label: "Ustawienia", icon: "access" },
];

export const RealApp = ({
  client,
}: {
  readonly client: ConstellationRendererClient | undefined;
}) => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [navigation, setNavigation] = useState(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requested = navItems.find(
      (item) => item.id === parameters.get("destination"),
    );
    const fallback = destinationContext(
      requested?.id ?? "cockpit",
      requested?.label ?? "Tydzień",
    );
    return parameters.get("detached") === "1"
      ? createShellNavigation(fallback)
      : restoreShellNavigation(
          localStorage.getItem("constellation.shell-navigation"),
          fallback,
        );
  });
  const [favorites, setFavorites] = useState<readonly SurfaceId[]>(() => {
    try {
      const parsed = JSON.parse(
        localStorage.getItem("constellation.favorites") ?? "[]",
      ) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is SurfaceId =>
            navItems.some((entry) => entry.id === item),
          )
        : ["cockpit", "work"];
    } catch {
      return ["cockpit", "work"];
    }
  });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId>();
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId>();
  const [meetingInspectorHost, setMeetingInspectorHost] =
    useState<HTMLElement | null>(null);
  const [meetingInspectorOpen, setMeetingInspectorOpen] = useState(false);
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
  const detachedWindow =
    new URLSearchParams(window.location.search).get("detached") === "1";
  const recentContexts = navigation.history
    .slice(0, navigation.historyIndex + 1)
    .reverse()
    .reduce<ShellContext[]>((items, key) => {
      if (key === activeContext.key || items.some((item) => item.key === key))
        return items;
      const context = navigation.tabs.find((item) => item.key === key);
      if (context) items.push(context);
      return items;
    }, [])
    .slice(0, 3);

  useEffect(() => {
    localStorage.setItem(
      "constellation.shell-navigation",
      serializeShellNavigation(navigation),
    );
  }, [navigation]);

  useEffect(() => {
    localStorage.setItem("constellation.favorites", JSON.stringify(favorites));
  }, [favorites]);

  const openContext = useCallback((context: ShellContext) => {
    setNavigation((current) => openShellContext(current, context));
  }, []);

  useEffect(() => {
    setSelectedTaskId(activeContext.taskId);
    setSelectedProjectId(activeContext.projectId);
  }, [activeContext.projectId, activeContext.taskId]);

  useEffect(() => {
    if (surface !== "meetings") setMeetingInspectorOpen(false);
  }, [surface]);

  const snapshot = state.kind === "ready" ? state.snapshot : undefined;
  useEffect(() => {
    if (!snapshot) return;
    const taskIds = new Set(snapshot.tasks.map((task) => task.id));
    const projectIds = new Set(
      snapshot.projects.kind === "ready"
        ? snapshot.projects.data.items.map((project) => project.id)
        : [],
    );
    setNavigation((current) =>
      pruneInaccessibleShellContexts(
        current,
        { taskIds, projectIds },
        destinationContext("cockpit", "Tydzień"),
      ),
    );
  }, [snapshot]);

  useEffect(() => {
    if (!client) return;
    return client.onAttentionActivated((destination) => {
      if (destination.kind === "task") {
        openContext(taskContext(destination.taskId, "Zadanie"));
      } else if (destination.kind === "project") {
        openContext(projectContext(destination.projectId, "Projekt"));
      } else {
        openContext(destinationContext("documents", "Dokumenty"));
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
  const coordinatedDataHome =
    state.snapshot.dataHome?.descriptor.providerKind === "coordinated";
  const dataHomeLabel = coordinatedDataHome
    ? `${state.snapshot.dataHome?.descriptor.displayName ?? "Hub"} · skoordynowany`
    : "Local only · dane na tym urządzeniu";
  return (
    <main
      className={`desktop-shell wave2-shell${surface === "meetings" ? " meeting-context-shell" : ""}`}
    >
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
          aria-label={`Workspace ${bootstrap.workspace.name}, ${dataHomeLabel}`}
          disabled={isPreview}
          title={
            isPreview
              ? "Otwórz ustawienia workspace"
              : coordinatedDataHome
                ? "Otwórz ustawienia skoordynowanego workspace"
                : "Otwórz ustawienia i przełączanie workspace"
          }
          onClick={() =>
            openContext(destinationContext("settings", "Ustawienia"))
          }
        >
          <span className="workspace-avatar">I</span>
          <span>
            <strong>{bootstrap.workspace.name}</strong>
            <small>
              {state.snapshot.dataHome?.availability === "available"
                ? dataHomeLabel
                : "Data Home wymaga uwagi"}
            </small>
          </span>
          {!isPreview && <span className="workspace-switcher-action">•••</span>}
        </button>
        <button
          className="search-control"
          aria-label={`Szukaj · ${modifierLabel}K`}
          onClick={() => setSearchOpen(true)}
        >
          <Icon name="search" />
          <span>Szukaj</span>
          <kbd>{modifierLabel}K</kbd>
        </button>
        <nav ref={navRef} aria-label="Główna nawigacja" onKeyDown={navKeyDown}>
          {favorites.length > 0 && (
            <>
              <p className="nav-label">Ulubione</p>
              {favorites.map((favorite) => {
                const item = navItems.find((entry) => entry.id === favorite);
                return item ? (
                  <button
                    key={`favorite:${item.id}`}
                    className={`nav-item nav-favorite ${surface === item.id ? "active" : ""}`}
                    aria-current={surface === item.id ? "page" : undefined}
                    onClick={() =>
                      openContext(destinationContext(item.id, item.label))
                    }
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    <span aria-hidden="true">★</span>
                  </button>
                ) : null;
              })}
            </>
          )}
          {recentContexts.length > 0 && (
            <>
              <p className="nav-label">Ostatnie</p>
              {recentContexts.map((recent) => {
                const item = navItems.find(
                  (entry) => entry.id === recent.surface,
                );
                return (
                  <button
                    key={`recent:${recent.key}`}
                    className="nav-item nav-recent"
                    onClick={() =>
                      setNavigation((current) =>
                        activateShellContext(current, recent.key),
                      )
                    }
                  >
                    <Icon name={item?.icon ?? "project"} />
                    <span>{recent.label}</span>
                    <small>{item?.label}</small>
                  </button>
                );
              })}
            </>
          )}
          <p className="nav-label">Wszystkie</p>
          {navItems.map((item) => (
            <div className="nav-entry" key={item.id}>
              <button
                data-surface={item.id}
                className={`nav-item ${surface === item.id ? "active" : ""}`}
                aria-label={
                  item.id === "tasks"
                    ? `${item.label} · ${tasks.length}`
                    : item.label
                }
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
                ) : item.shortcut !== undefined ? (
                  <kbd>
                    {modifierLabel}
                    {item.shortcut}
                  </kbd>
                ) : null}
              </button>
              <button
                type="button"
                className="nav-favorite-toggle"
                aria-label={`${favorites.includes(item.id) ? "Usuń" : "Dodaj"} ${item.label} ${favorites.includes(item.id) ? "z" : "do"} ulubionych`}
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
          aria-label={`Quick Capture · ${modifierLabel}⇧K`}
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
              {isPreview
                ? "Podgląd deweloperski"
                : coordinatedDataHome
                  ? "Skoordynowany workspace"
                  : "Lokalny workspace"}
            </strong>
            <span>
              {coordinatedDataHome
                ? "Hub + szyfrowana projekcja"
                : build.persistence === "encrypted-local"
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
          <button
            type="button"
            className="shell-detach"
            aria-label={
              detachedWindow
                ? "Zamknij osobne okno"
                : `Otwórz ${activeContext.label} w osobnym oknie`
            }
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
                      "Nie udało się otworzyć osobnego okna. Bieżący kontekst pozostaje tutaj.",
                  }),
                );
            }}
          >
            {detachedWindow ? "Dołącz z powrotem" : "Osobne okno"}
          </button>
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
            client={client}
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
        {surface === "meetings" && client && (
          <MeetingsSurface
            client={client}
            inspectorHost={meetingInspectorHost}
            onInspectorOpen={() => setMeetingInspectorOpen(true)}
          />
        )}
        {surface === "relationships" && (
          <StrategicDepthSurface
            client={client}
            snapshot={state.snapshot}
            onReload={reload}
            onFailure={showFailure}
          />
        )}
        {surface === "work" && (
          <WorkSurface
            client={client}
            snapshot={state.snapshot}
            onReload={reload}
            onFailure={showFailure}
          />
        )}
        {surface === "settings" && (
          <SettingsSurface
            client={client}
            snapshot={state.snapshot}
            onReload={reload}
            onFailure={showFailure}
            onOpenRecovery={() => setRecoveryOpen(true)}
            onNavigate={(next, label) =>
              openContext(destinationContext(next, label))
            }
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
                      ? "Projekt zamknięto; historia i otwarte zadania pozostały bez zmian."
                      : "Projekt otwarto ponownie.",
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
              } else if (destination.kind === "project") {
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
              } else if (destination.kind === "document") {
                openContext(destinationContext("documents", "Dokumenty"));
              } else {
                openContext(destinationContext("history", "Historia Capture"));
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
            onRouteCapture={(item, destination) => {
              if (!client || item.destination.kind !== "capture") return;
              setAttentionBusy(true);
              void routeCaptureException(
                client,
                state.snapshot,
                item.destination.captureId,
                destination,
              ).then(async (routeResult) => {
                setAttentionBusy(false);
                if (routeResult.kind === "success")
                  await refreshAfter(
                    destination === "task"
                      ? "Capture skierowano do zadań."
                      : "Capture zapisano jako źródło wiedzy.",
                  );
                else showFailure(routeResult);
              });
            }}
            onRetryCapture={(item) => {
              if (!client) return;
              setAttentionBusy(true);
              void resolveCaptureException(
                client,
                state.snapshot,
                item,
                "retry",
              ).then(async (result) => {
                setAttentionBusy(false);
                if (result.kind === "success")
                  await refreshAfter(
                    "Capture wrócił do bezpiecznej kolejki przetwarzania.",
                  );
                else showFailure(result);
              });
            }}
            onKeepCapture={(item) => {
              if (!client) return;
              setAttentionBusy(true);
              void resolveCaptureException(
                client,
                state.snapshot,
                item,
                "keep_unclassified",
              ).then(async (result) => {
                setAttentionBusy(false);
                if (result.kind === "success")
                  await refreshAfter(
                    "Oryginał zachowano bez wymuszonej klasyfikacji.",
                  );
                else showFailure(result);
              });
            }}
            onReplaceCapturePayload={(item) => {
              if (!client?.selectCapturePayload) {
                setToast("Wybór pliku jest chwilowo niedostępny.");
                return;
              }
              setAttentionBusy(true);
              void client.selectCapturePayload().then(async (selected) => {
                if (selected.outcome !== "success") {
                  setAttentionBusy(false);
                  if (selected.code !== "cancelled")
                    setToast(
                      "Nie udało się przygotować bezpiecznego pliku zastępczego.",
                    );
                  return;
                }
                const result = await resolveCaptureException(
                  client,
                  state.snapshot,
                  item,
                  "replace_payload",
                  selected.original,
                );
                setAttentionBusy(false);
                if (result.kind === "success")
                  await refreshAfter(
                    "Oryginał zastąpiono i skierowano do ponownego przetwarzania.",
                  );
                else showFailure(result);
              });
            }}
          />
        )}
        {surface === "access" && (
          <AccessSurface
            access={state.snapshot.access}
            agentAccess={state.snapshot.agentAccess}
            agentTransport={
              state.snapshot.dataHome?.descriptor.providerKind === "coordinated"
                ? "remote_hub"
                : "local"
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
              const remote =
                state.snapshot.dataHome?.descriptor.providerKind ===
                "coordinated";
              void (
                remote
                  ? createRemoteAgentGrant(client, input)
                  : createAgentGrant(client, state.snapshot, input)
              ).then(async (result) => {
                setAccessBusy(false);
                if (result.kind === "success")
                  await refreshAfter(
                    "endpoint" in result.data
                      ? `Zdalny dostęp MCP utworzono. Chroniony plik konfiguracji: ${result.data.descriptorPath}. Endpoint: ${result.data.endpoint}`
                      : `Dostęp MCP utworzono. Plik dostępu: ${result.data.descriptorPath}. Adapter hosta: ${result.data.launchCommand} ${result.data.launchArgs.join(" ")}`,
                  );
                else showFailure(result);
              });
            }}
            onAgentRotate={(grant) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              const remote =
                state.snapshot.dataHome?.descriptor.providerKind ===
                "coordinated";
              void (
                remote
                  ? rotateRemoteAgentCredential(client, grant)
                  : rotateAgentCredential(client, state.snapshot, grant)
              ).then(async (result) => {
                setAccessBusy(false);
                if (result.kind === "success")
                  await refreshAfter(
                    "endpoint" in result.data
                      ? `Zdalne poświadczenie obrócono. Chroniony plik konfiguracji: ${result.data.descriptorPath}. Endpoint: ${result.data.endpoint}`
                      : `Poświadczenie obrócono. Plik dostępu: ${result.data.descriptorPath}. Adapter hosta: ${result.data.launchCommand} ${result.data.launchArgs.join(" ")}`,
                  );
                else showFailure(result);
              });
            }}
            onAgentRevoke={(grant) => {
              if (!client) return;
              setAccessBusy(true);
              setNotice(undefined);
              const remote =
                state.snapshot.dataHome?.descriptor.providerKind ===
                "coordinated";
              void (
                remote
                  ? revokeRemoteAgentGrant(client, grant)
                  : revokeAgentGrant(client, state.snapshot, grant)
              ).then(async (result) => {
                setAccessBusy(false);
                if (result.kind === "success")
                  await refreshAfter(
                    remote
                      ? "Zdalny dostęp agenta cofnięto, a chroniony plik konfiguracji usunięto."
                      : "Dostęp agenta cofnięto, a lokalne poświadczenie usunięto.",
                  );
                else showFailure(result);
              });
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
        className={`inspector${surface === "meetings" ? " inspector--meeting" : ""}${selectedTask || selectedProject || (surface === "meetings" && meetingInspectorOpen) ? " open" : ""}`}
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
                  : surface === "meetings"
                    ? "Wynik Jamie"
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
          {surface === "meetings" && (
            <button
              className="icon-button meeting-inspector-close"
              aria-label="Zamknij szczegóły spotkania"
              onClick={() => setMeetingInspectorOpen(false)}
            >
              <Icon name="close" />
            </button>
          )}
        </header>
        {surface === "meetings" ? (
          <div
            className="meeting-inspector-host"
            ref={setMeetingInspectorHost}
          />
        ) : selectedTask ? (
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
            <p>
              Root Space ·{" "}
              {coordinatedDataHome
                ? "skoordynowany Data Home"
                : "lokalne źródło danych"}
            </p>
            <dl>
              <div>
                <dt>Tryb</dt>
                <dd>
                  {coordinatedDataHome
                    ? "Hub + szyfrowana projekcja"
                    : build.persistence === "encrypted-local"
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

      {(selectedTask || selectedProject || surface === "meetings") && (
        <span className="context-thread" aria-hidden="true" />
      )}
      {captureOpen && (
        <CaptureDialog
          busy={capturing}
          client={client}
          workspaceName={bootstrap.workspace.name}
          onClose={() => !capturing && setCaptureOpen(false)}
          onSubmit={async (original) => {
            if (!client) return "Desktop jest chwilowo niedostępny.";
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
                taskContext(
                  captureResult.taskId,
                  task?.title ?? "Nowe zadanie",
                ),
              );
              setReceipts((current) => ({
                ...current,
                [captureResult.taskId]: result.receipt,
              }));
            } else if (captureResult.kind === "review") {
              openContext(destinationContext("attention", "Do uwagi"));
            } else if (captureResult.kind === "voice_note") {
              openContext(destinationContext("history", "Historia Capture"));
            } else {
              openContext(destinationContext("documents", "Dokumenty"));
            }
            setCaptureOpen(false);
            setToast(
              captureResult.kind === "task"
                ? "Capture zapisano jako zadanie."
                : captureResult.kind === "knowledge_source"
                  ? "Capture zapisano jako źródło wiedzy."
                  : captureResult.kind === "voice_note"
                    ? "Notatka głosowa jest bezpieczna i czeka na transkrypcję agenta."
                    : "Capture wymaga decyzji i trafił do Attention.",
            );
            return undefined;
          }}
        />
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
          ]}
          onClose={() => setSearchOpen(false)}
          onOpenDestination={(nextSurface, label) =>
            openContext(destinationContext(nextSurface, label))
          }
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
      {onboardingOpen && client && (
        <OnboardingFlow
          client={client}
          snapshot={state.snapshot}
          onComplete={async () => {
            setOnboardingOpen(false);
            await reload();
          }}
          onFailure={showFailure}
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
