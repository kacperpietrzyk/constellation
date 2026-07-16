export const MAX_VOICE_NOTE_DURATION_MS = 120_000;
export const MAX_VOICE_NOTE_BYTES = 25 * 1024 * 1024;

const VOICE_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
] as const;

export type VoiceNoteMediaType = "audio/webm" | "audio/ogg" | "audio/mp4";

export type VoiceRecordingFailureCode =
  | "unsupported"
  | "permission_denied"
  | "device_unavailable"
  | "recording_failed";

export type VoiceRecordingFinished =
  | {
      readonly outcome: "success";
      readonly bytes: Uint8Array;
      readonly durationMs: number;
      readonly mediaType: VoiceNoteMediaType;
      readonly automaticallyStopped: boolean;
    }
  | { readonly outcome: "cancelled" }
  | {
      readonly outcome: "failure";
      readonly code: VoiceRecordingFailureCode;
    };

export interface VoiceRecordingSession {
  readonly startedAt: number;
  readonly finished: Promise<VoiceRecordingFinished>;
  stop(): void;
  cancel(): void;
}

export const voiceRecorderMimeType = (
  supports: (mimeType: string) => boolean,
):
  | {
      readonly recorderMimeType: string;
      readonly mediaType: VoiceNoteMediaType;
    }
  | undefined => {
  const recorderMimeType = VOICE_MIME_CANDIDATES.find(supports);
  if (recorderMimeType === undefined) return undefined;
  const mediaType = recorderMimeType.split(";", 1)[0];
  return mediaType === "audio/webm" ||
    mediaType === "audio/ogg" ||
    mediaType === "audio/mp4"
    ? { recorderMimeType, mediaType }
    : undefined;
};

const failureCode = (error: unknown): VoiceRecordingFailureCode =>
  error instanceof DOMException &&
  (error.name === "NotAllowedError" || error.name === "SecurityError")
    ? "permission_denied"
    : error instanceof DOMException &&
        (error.name === "NotFoundError" || error.name === "NotReadableError")
      ? "device_unavailable"
      : "recording_failed";

export const startVoiceRecording = async (
  now: () => number = () => Date.now(),
): Promise<VoiceRecordingSession | VoiceRecordingFinished> => {
  if (
    typeof MediaRecorder === "undefined" ||
    navigator.mediaDevices?.getUserMedia === undefined
  )
    return { outcome: "failure", code: "unsupported" };
  const selected = voiceRecorderMimeType((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
  if (selected === undefined)
    return { outcome: "failure", code: "unsupported" };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
  } catch (error) {
    return { outcome: "failure", code: failureCode(error) };
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: selected.recorderMimeType,
      audioBitsPerSecond: 64_000,
    });
  } catch {
    for (const track of stream.getTracks()) track.stop();
    return { outcome: "failure", code: "recording_failed" };
  }
  const chunks: Blob[] = [];
  const startedAt = now();
  let cancelled = false;
  let automaticallyStopped = false;
  let recorderFailed = false;
  let resolveFinished!: (value: VoiceRecordingFinished) => void;
  const finished = new Promise<VoiceRecordingFinished>((resolve) => {
    resolveFinished = resolve;
  });
  const stopTracks = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  const timer = window.setTimeout(() => {
    if (recorder.state !== "inactive") {
      automaticallyStopped = true;
      recorder.stop();
    }
  }, MAX_VOICE_NOTE_DURATION_MS);
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener("error", () => {
    recorderFailed = true;
    if (recorder.state !== "inactive") recorder.stop();
  });
  recorder.addEventListener("stop", () => {
    window.clearTimeout(timer);
    stopTracks();
    if (cancelled) {
      resolveFinished({ outcome: "cancelled" });
      return;
    }
    if (recorderFailed) {
      resolveFinished({ outcome: "failure", code: "recording_failed" });
      return;
    }
    const durationMs = Math.max(
      1,
      Math.min(MAX_VOICE_NOTE_DURATION_MS, Math.round(now() - startedAt)),
    );
    void new Blob(chunks, { type: selected.recorderMimeType })
      .arrayBuffer()
      .then((bytes) => {
        const value = new Uint8Array(bytes);
        resolveFinished(
          value.byteLength === 0
            ? { outcome: "failure", code: "recording_failed" }
            : {
                outcome: "success",
                bytes: value,
                durationMs,
                mediaType: selected.mediaType,
                automaticallyStopped,
              },
        );
      })
      .catch(() =>
        resolveFinished({ outcome: "failure", code: "recording_failed" }),
      );
  });
  try {
    recorder.start(1_000);
  } catch {
    window.clearTimeout(timer);
    stopTracks();
    return { outcome: "failure", code: "recording_failed" };
  }
  return {
    startedAt,
    finished,
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state !== "inactive") recorder.stop();
      else stopTracks();
    },
  };
};
