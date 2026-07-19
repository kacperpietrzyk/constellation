import { useState } from "react";

import {
  AttentionSignalIdSchema,
  CaptureIdSchema,
  CapturePayloadIdSchema,
  KnowledgeSourceIdSchema,
  PrincipalIdSchema,
  TaskIdSchema,
  type CaptureId,
} from "@constellation/contracts";

import { CaptureHistoryDetail, HistorySurface } from "../Wave2Surfaces.js";
import type { DesktopSnapshot } from "../client/workflow.js";
import { Icon } from "../components/Icon.js";
import { workHarnessSnapshot } from "./WorkHarness.js";

const captureId = CaptureIdSchema.parse("00000000-0000-4000-8000-000000000951");
const principalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-000000000953",
);

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
        writtenBy: principalId,
        writtenByKind: "agent",
        hostRunId: "codex-voice-run-7f31",
      },
      audioState: "retained",
      audioStateChangedAt: "2026-07-16T09:20:14.000+02:00",
      version: 3,
    },
    {
      id: CaptureIdSchema.parse("00000000-0000-4000-8000-000000000954"),
      spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
      originalText: "Pomysł na rozmowę z zespołem produktu",
      original: {
        kind: "voice_note",
        payload: {
          payloadId: CapturePayloadIdSchema.parse(
            "00000000-0000-4000-8000-000000000955",
          ),
          displayName: "Notatka głosowa 09-42.webm",
          mediaType: "audio/webm",
          byteLength: 184_320,
          contentSha256: "8".repeat(64),
          custodyState: "available",
        },
        durationMs: 72_000,
        retentionPolicy: "delete_after_transcript",
      },
      source: "global_quick_capture",
      capturedAt: "2026-07-16T09:42:18.000+02:00",
      processingState: "awaiting_transcript",
      awaitingTranscriptSince: "2026-07-16T09:42:18.000+02:00",
      version: 1,
    },
    {
      id: CaptureIdSchema.parse("00000000-0000-4000-8000-000000000956"),
      spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
      originalText: "Przygotować zakres pilotażu dla zespołu bezpieczeństwa",
      original: {
        kind: "text",
        text: "Przygotować zakres pilotażu dla zespołu bezpieczeństwa",
      },
      source: "in_app_quick_capture",
      capturedAt: "2026-07-16T08:51:00.000+02:00",
      processingState: "routed_as_task",
      derivedTaskId: TaskIdSchema.parse("00000000-0000-4000-8000-000000000957"),
      routedAt: "2026-07-16T08:51:01.000+02:00",
      routedBy: principalId,
      version: 2,
    },
    {
      id: CaptureIdSchema.parse("00000000-0000-4000-8000-000000000958"),
      spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
      originalText: "Architektura środowiska klienta.png",
      original: {
        kind: "screenshot",
        payload: {
          payloadId: CapturePayloadIdSchema.parse(
            "00000000-0000-4000-8000-000000000959",
          ),
          displayName: "Architektura środowiska klienta.png",
          mediaType: "image/png",
          byteLength: 1_425_408,
          contentSha256: "7".repeat(64),
          custodyState: "available",
        },
      },
      source: "global_quick_capture",
      capturedAt: "2026-07-15T17:24:30.000+02:00",
      processingState: "routed_as_knowledge_source",
      derivedKnowledgeSourceId: KnowledgeSourceIdSchema.parse(
        "00000000-0000-4000-8000-000000000960",
      ),
      routedAt: "2026-07-15T17:24:32.000+02:00",
      routedBy: principalId,
      version: 2,
    },
    {
      id: CaptureIdSchema.parse("00000000-0000-4000-8000-000000000961"),
      spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
      originalText: "https://example.com/security-review",
      original: {
        kind: "url",
        url: "https://example.com/security-review",
        title: "Security review",
      },
      source: "global_quick_capture",
      capturedAt: "2026-07-15T16:08:12.000+02:00",
      processingState: "needs_review",
      reviewReason: "ambiguous",
      attentionSignalId: AttentionSignalIdSchema.parse(
        "00000000-0000-4000-8000-000000000962",
      ),
      reviewedAt: "2026-07-15T16:08:13.000+02:00",
      version: 1,
    },
  ],
};

export const VoiceHistoryHarness = () => {
  const [selectedCaptureId, setSelectedCaptureId] = useState<CaptureId>();
  const selectedCapture = snapshot.captures.find(
    (capture) => capture.id === selectedCaptureId,
  );
  return (
    <div
      className={`history-harness-layout${selectedCapture ? " detail-open" : ""}`}
      data-testid="voice-history-harness"
    >
      <main className="app-shell">
        <HistorySurface
          snapshot={snapshot}
          selectedCaptureId={selectedCaptureId}
          onSelectCapture={setSelectedCaptureId}
        />
      </main>
      {selectedCapture && (
        <aside className="history-harness-detail" aria-label="Podgląd Capture">
          <header>
            <div>
              <span>Podgląd kontekstu</span>
              <small>Capture</small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Zamknij podgląd kontekstu"
              onClick={() => setSelectedCaptureId(undefined)}
            >
              <Icon name="close" />
            </button>
          </header>
          <CaptureHistoryDetail
            capture={selectedCapture}
            timezone={snapshot.bootstrap.workspace.timezone}
            busy={false}
            onUndo={() => undefined}
            onDeleteVoiceAudio={() => undefined}
          />
        </aside>
      )}
    </div>
  );
};
