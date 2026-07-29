import { useEffect, useRef, useState, type FormEvent } from "react";

import type { CaptureOriginal } from "@constellation/contracts";
import type {
  CapturePayloadResponse,
  ConstellationRendererClient,
} from "@constellation/desktop-preload/client";

import { Icon } from "./components/Icon.js";
import { formatDateTime } from "./i18n.js";
import {
  MAX_VOICE_NOTE_BYTES,
  startVoiceRecording,
  type VoiceRecordingSession,
} from "./voice-recorder.js";

export const CaptureDialog = ({
  busy,
  client,
  initialMode = "text",
  defaultVoiceRetentionPolicy,
  workspaceName,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly client: ConstellationRendererClient | undefined;
  readonly initialMode?: "text" | "url" | "file" | "voice";
  readonly defaultVoiceRetentionPolicy: "delete_after_transcript" | "retain";
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
  const [retainVoice, setRetainVoice] = useState(
    defaultVoiceRetentionPolicy === "retain",
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
        return "That file is empty. Choose another file.";
      case "payload_too_large":
        return "That file is over the 25 MB limit. Keep a smaller version.";
      case "payload_unsupported":
        return "That file cannot be captured safely.";
      case "payload_transfer_unavailable":
        return "Files in a Hub workspace need secure transfer turned on. Text and links still work.";
      case "cancelled":
        return "";
      default:
        return "Could not keep that file. Try again.";
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
      setPayloadError("Managed files are unavailable in this build.");
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
            nextFile.name || `Screenshot ${formatDateTime(new Date())}.png`,
          mediaType: nextFile.type || "application/octet-stream",
          inputKind,
          bytes: new Uint8Array(await nextFile.arrayBuffer()),
        }),
      );
    } catch {
      setPayloadBusy(false);
      setPayloadError(
        "Could not read that file. Check its permissions and try again.",
      );
    }
  };
  const choosePayload = async () => {
    if (client?.selectCapturePayload === undefined) {
      setPayloadError("Choosing a managed file is unavailable.");
      return;
    }
    setPayloadBusy(true);
    setPayloadError(undefined);
    try {
      acceptPayload(await client.selectCapturePayload());
    } catch {
      setPayloadBusy(false);
      setPayloadError("Could not open that file. Try again.");
    }
  };
  const voiceFailure = (code: string): string => {
    switch (code) {
      case "unsupported":
        return "Recording a short voice note is not supported in this build.";
      case "permission_denied":
        return "No microphone access. Allow Constellation the microphone in system settings and try again.";
      case "device_unavailable":
        return "The microphone is unavailable or in use by another app.";
      default:
        return "The recording was not kept. Try again.";
    }
  };
  const startVoice = async () => {
    if (client?.stageCapturePayload === undefined) {
      setPayloadError("Encrypted voice notes are unavailable.");
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
        setPayloadError("The recording went over 25 MB and was not saved.");
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
            displayName: `Voice note ${formatDateTime(new Date())}.${extension}`,
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
            "The 2 minute limit was reached. The recording is ready to save.",
          );
      } catch {
        setPayloadBusy(false);
        setVoiceState("idle");
        setPayloadError("Could not encrypt the recording. Try again.");
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
    dialogRef.current?.close();
    onClose();
  };
  const dirty =
    text.trim().length > 0 ||
    url.trim().length > 0 ||
    managedOriginal !== undefined ||
    voiceState === "recording";
  const requestClose = () => {
    if (busy || payloadBusy) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    close();
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
        if (confirmDiscard) {
          setConfirmDiscard(false);
          return;
        }
        requestClose();
      }}
      onMouseDown={(event) =>
        event.target === event.currentTarget && requestClose()
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
            <h2 id="capture-title">Capture anything</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close Quick Capture"
            disabled={busy || payloadBusy}
            onClick={requestClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="capture-kind" role="group" aria-label="Capture kind">
            {(["text", "url", "file", "voice"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={mode === kind}
                onClick={() => {
                  if (mode === "voice" && kind !== "voice") cancelVoice();
                  setMode(kind);
                }}
              >
                {kind === "text"
                  ? "Text"
                  : kind === "url"
                    ? "Link"
                    : kind === "file"
                      ? "File"
                      : "Voice"}
              </button>
            ))}
          </div>
          {mode === "text" ? (
            <>
              <label className="sr-only" htmlFor="capture-text">
                Capture content
              </label>
              <textarea
                id="capture-text"
                name="capture"
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="A thought, a task, or something to do…"
                maxLength={262_144}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                    submit(event);
                }}
              />
              <small className="capture-mode-note">
                System dictation types here like any text — no audio is kept.
              </small>
            </>
          ) : mode === "url" ? (
            <label className="capture-field">
              <span>URL</span>
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
                      ? "Recording encrypted and ready"
                      : voiceState === "requesting"
                        ? "Waiting for system permission…"
                        : voiceState === "recording"
                          ? "Recording"
                          : voiceState === "staging"
                            ? "Encrypting and keeping…"
                            : "Short voice note"}
                  </strong>
                  <span>
                    {managedOriginal?.kind === "voice_note"
                      ? `${Math.ceil(managedOriginal.durationMs / 1000)} s · ${Math.ceil(managedOriginal.payload.byteLength / 1024).toLocaleString("en-US")} KB`
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
                      Stop
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={cancelVoice}
                    >
                      Cancel recording
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
                      ? "Record again"
                      : "Start recording"}
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
                  Keep the audio after transcription. By default it is deleted
                  once an MCP agent has written the transcript.
                </span>
              </label>
              <small>
                Constellation does not transcribe or record meetings. The
                microphone runs only while this window is visibly recording.
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
                    ? "Encrypting and keeping…"
                    : "Drop a file or paste a screenshot"}
              </strong>
              <button
                className="secondary-button"
                type="button"
                disabled={payloadBusy}
                onClick={() => void choosePayload()}
              >
                {managedOriginal === undefined ? "Choose file" : "Change file"}
              </button>
              <small>
                Constellation keeps an encrypted copy in this workspace before
                filing it. The local path is not saved.
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
              <span>Result</span>
              <strong>App rule · can be undone</strong>
            </div>
          </div>
          {confirmDiscard && (
            <div className="capture-discard-confirm" role="alert">
              <span>You have unsaved content. Discard it?</span>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  autoFocus
                  onClick={() => setConfirmDiscard(false)}
                >
                  Back to editing
                </button>
                <button
                  type="button"
                  className="quiet-danger-button"
                  onClick={close}
                >
                  Discard content
                </button>
              </div>
            </div>
          )}
          <footer className="capture-footer">
            <span>The original is kept and linked to the result.</span>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || payloadBusy || !canSubmit}
            >
              {busy ? "Working…" : "Save and file"}
            </button>
          </footer>
        </form>
      </section>
    </dialog>
  );
};
