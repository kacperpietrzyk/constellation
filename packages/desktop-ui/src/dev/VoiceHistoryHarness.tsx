import {
  CaptureIdSchema,
  CapturePayloadIdSchema,
  PrincipalIdSchema,
} from "@constellation/contracts";

import { HistorySurface } from "../Wave2Surfaces.js";
import type { DesktopSnapshot } from "../client/workflow.js";
import { workHarnessSnapshot } from "./WorkHarness.js";

const captureId = CaptureIdSchema.parse("00000000-0000-4000-8000-000000000951");

const snapshot: DesktopSnapshot = {
  ...workHarnessSnapshot,
  captures: [
    {
      id: captureId,
      spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
      originalText: "Voice note.webm",
      original: {
        kind: "voice_note",
        payload: {
          payloadId: CapturePayloadIdSchema.parse(
            "00000000-0000-4000-8000-000000000952",
          ),
          displayName: "Voice note.webm",
          mediaType: "audio/webm",
          byteLength: 98_304,
          contentSha256: "9".repeat(64),
          custodyState: "available",
        },
        durationMs: 38_000,
        retentionPolicy: "retain",
      },
      source: "global_quick_capture",
      capturedAt: "2026-07-16T09:18:02.000+02:00",
      processingState: "transcript_ready",
      transcript: {
        text: "Ustaliliśmy, że oferta ma być gotowa przed piątkowym przeglądem.",
        audioContentSha256: "9".repeat(64),
        writtenAt: "2026-07-16T09:20:14.000+02:00",
        writtenBy: PrincipalIdSchema.parse(
          "00000000-0000-4000-8000-000000000953",
        ),
        writtenByKind: "agent",
        hostRunId: "codex-voice-run-7f31",
      },
      audioState: "retained",
      audioStateChangedAt: "2026-07-16T09:20:14.000+02:00",
      version: 3,
    },
  ],
};

export const VoiceHistoryHarness = () => (
  <main className="app-shell" data-testid="voice-history-harness">
    <HistorySurface
      snapshot={snapshot}
      busyCaptureId={undefined}
      onDeleteVoiceAudio={() => undefined}
      onUndo={() => undefined}
    />
  </main>
);
