import { createPortal } from "react-dom";

import type { CaptureId, CommandId } from "@constellation/contracts";

import type { DesktopSnapshot } from "../client/workflow.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { countLabel, formatDateTime } from "../i18n.js";
import { InlineState, Mark } from "../components/InlineState.js";

// Historia wrzutek jako TRZECI ODCZYT Biblioteki. To jest scalenie treści,
// a nie przemianowanie: cel `history` został wycofany, a wysłany rejestr
// przyjechał tutaj W CAŁOŚCI. Nic nie zostało wymyślone i nic nie zginęło —
// zachowany oryginał z linią pieczy, `Preview undo` z powodem odmowy, przypis
// autorstwa transkrypcji i pełny, dziewięciowartościowy słownik wyników.
//
// „Delete the kept audio" jest JEDYNYM miejscem w całej aplikacji, gdzie widać
// granicę retencji nagrania, którą AGENTS.md czyni wiążącą. Ma własną asercję
// wołającą je po nazwie (`test/capture-history-reading.interaction.test.tsx`),
// bo przed tym scaleniem nie pilnowało go nic.
//
// Nagłówki zjeżdżają o jeden poziom względem wysłanego ekranu: `h1` należy
// teraz do powłoki Biblioteki, więc odczyt zaczyna się od `h2`.

export type HistoryCapture = DesktopSnapshot["captures"][number];

const captureKindLabel = (capture: HistoryCapture): string =>
  capture.original.kind === "text"
    ? "Text"
    : capture.original.kind === "url"
      ? "Link"
      : capture.original.kind === "screenshot"
        ? "Screenshot"
        : capture.original.kind === "managed_file"
          ? "Managed file"
          : capture.original.kind === "voice_note"
            ? "Voice note"
            : "File reference";

const captureResultLabel = (capture: HistoryCapture): string =>
  capture.processingState === "routed_as_task"
    ? "Task created"
    : capture.processingState === "routed_as_knowledge_source"
      ? "Knowledge source created"
      : capture.processingState === "needs_review"
        ? "Needs a decision"
        : capture.processingState === "awaiting_transcript"
          ? "Waiting for the transcript"
          : capture.processingState === "transcript_ready"
            ? capture.audioState === "retained"
              ? "Transcript ready · audio kept"
              : capture.audioState === "deleted"
                ? "Transcript ready · audio deleted"
                : "Transcript ready · deleting audio"
            : capture.processingState === "unclassified"
              ? "Kept without a classification"
              : "Waiting to be processed";

const captureCustodyLabel = (capture: HistoryCapture): string =>
  capture.original.kind === "managed_file" ||
  capture.original.kind === "screenshot" ||
  capture.original.kind === "voice_note"
    ? `Encrypted copy · ${Math.ceil(capture.original.payload.byteLength / 1024).toLocaleString("en-US")} KB · SHA-256 integrity`
    : "Local state confirmed";

export const CaptureHistoryDetail = ({
  capture,
  timezone,
  undoCommandId,
  busy,
  onUndo,
  onDeleteVoiceAudio,
}: {
  readonly capture: HistoryCapture;
  readonly timezone: string;
  readonly undoCommandId?: CommandId;
  readonly busy: boolean;
  readonly onUndo: (targetCommandId: CommandId) => void;
  readonly onDeleteVoiceAudio: (captureId: CaptureId, version: number) => void;
}) => (
  <div className="inspector-body capture-history-detail">
    <span className="record-status">
      <i />
      {captureResultLabel(capture)}
    </span>
    <h2>{capture.originalText}</h2>
    <p className="record-summary">
      {captureKindLabel(capture)} · saved{" "}
      {formatDateTime(capture.capturedAt, timezone)}
    </p>
    <section className="inspector-section provenance-block">
      <p className="section-label">Processing steps</p>
      <ol className="processing-timeline">
        <li className="done">
          <i />
          <div>
            <strong>Original saved</strong>
            <span>{captureCustodyLabel(capture)}</span>
          </div>
        </li>
        <li className="current">
          <i />
          <div>
            <strong>{captureResultLabel(capture)}</strong>
            <span>
              {capture.processingState === "transcript_ready"
                ? capture.transcript.text
                : capture.originalText}
            </span>
            {capture.processingState === "transcript_ready" && (
              <small>
                Written by {capture.transcript.writtenByKind} ·{" "}
                {formatDateTime(capture.transcript.writtenAt, timezone)}
                {capture.transcript.hostRunId
                  ? " · run " + capture.transcript.hostRunId
                  : ""}
              </small>
            )}
          </div>
        </li>
      </ol>
    </section>
    <section className="inspector-section capture-history-actions">
      <p className="section-label">Available actions</p>
      <button
        className="secondary-button"
        disabled={undoCommandId === undefined}
        title={
          undoCommandId === undefined
            ? "No reversible command for this Capture"
            : undefined
        }
        onClick={() => undoCommandId && onUndo(undoCommandId)}
      >
        Preview undo
      </button>
      {capture.processingState === "transcript_ready" &&
        capture.audioState === "retained" && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onDeleteVoiceAudio(capture.id, capture.version)}
          >
            {busy ? "Deleting…" : "Delete the kept audio"}
          </button>
        )}
    </section>
  </div>
);

export interface CaptureHistoryWiring {
  readonly selectedCaptureId: CaptureId | undefined;
  readonly undoCommandId?: CommandId;
  readonly busy: boolean;
  readonly onSelectCapture: (captureId: CaptureId) => void;
  readonly onUndo: (targetCommandId: CommandId) => void;
  readonly onDeleteVoiceAudio: (captureId: CaptureId, version: number) => void;
}

export const CaptureHistoryReading = ({
  snapshot,
  inspectorHost,
  onInspectorOpen,
  wiring,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly inspectorHost: HTMLElement | null;
  readonly onInspectorOpen: () => void;
  readonly wiring: CaptureHistoryWiring;
}) => {
  const { selectedCaptureId, onSelectCapture } = wiring;
  const select = (captureId: CaptureId) => {
    onSelectCapture(captureId);
    onInspectorOpen();
  };
  const captureNav = useListNavigation({
    itemCount: snapshot.captures.length,
    onOpen: (index) => {
      const capture = snapshot.captures[index];
      if (capture) select(capture.id);
    },
    onSelect: (index) => {
      const capture = snapshot.captures[index];
      if (capture) select(capture.id);
    },
  });
  const selectedCapture = snapshot.captures.find(
    (capture) => capture.id === selectedCaptureId,
  );
  return (
    <div className="surface-scroll history-surface">
      <header className="surface-header wave2-header">
        <div>
          <p className="eyebrow">Kept originals</p>
          <h2>Capture history</h2>
          <p>
            What was processed stays checkable, and reversible when versions
            match.
          </p>
        </div>
      </header>
      {snapshot.captures.length === 0 ? (
        <InlineState
          title="Capture history is empty"
          detail="The first Quick Capture will appear here with what it became."
        />
      ) : (
        <section className="history-ledger" aria-label="Kept captures">
          <header>
            <div>
              <h3>Kept originals</h3>
              <span>{countLabel(snapshot.captures.length, "capture")}</span>
            </div>
            <span>Select a row to see its steps</span>
          </header>
          <div className="history-list">
            {snapshot.captures.map((capture, index) => (
              <button
                type="button"
                className={`history-row${selectedCaptureId === capture.id ? " selected" : ""}`}
                key={capture.id}
                aria-pressed={selectedCaptureId === capture.id}
                {...captureNav(index)}
                onClick={() => select(capture.id)}
              >
                <Mark kind="capture" />
                <span className="history-row-copy">
                  <span>{captureKindLabel(capture)}</span>
                  <strong>{capture.originalText}</strong>
                  <small>{captureResultLabel(capture)}</small>
                </span>
                <time dateTime={capture.capturedAt}>
                  {formatDateTime(
                    capture.capturedAt,
                    snapshot.bootstrap.workspace.timezone,
                  )}
                </time>
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedCapture &&
        inspectorHost &&
        createPortal(
          <CaptureHistoryDetail
            key={`${selectedCapture.id}:${selectedCapture.version}`}
            capture={selectedCapture}
            timezone={snapshot.bootstrap.workspace.timezone}
            {...(wiring.undoCommandId === undefined
              ? {}
              : { undoCommandId: wiring.undoCommandId })}
            busy={wiring.busy}
            onUndo={wiring.onUndo}
            onDeleteVoiceAudio={wiring.onDeleteVoiceAudio}
          />,
          inspectorHost,
        )}
    </div>
  );
};
