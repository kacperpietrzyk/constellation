import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  CaptureIdSchema,
  CapturePayloadIdSchema,
  PrincipalIdSchema,
} from "@constellation/contracts";

import type { DesktopSnapshot } from "../src/client/workflow.js";
import { workHarnessSnapshot } from "../src/dev/harness-snapshot.js";
import { CaptureHistoryReading } from "../src/library/CaptureHistoryReading.js";
import { assertNoNode } from "./dom-assert.js";

/* THE VOICE-RETENTION BOUNDARY HAS EXACTLY ONE CONTROL IN THE WHOLE PRODUCT,
 * AND THIS IS THE ASSERTION THAT NAMES IT.
 *
 * AGENTS.md makes it a binding product boundary: a short voice note keeps
 * encrypted audio until an external MCP agent writes a durable transcript, and
 * it is then deleted by default, while a per-workspace or per-capture policy may
 * explicitly keep it. `Delete the kept audio` is the only place in the interface
 * where a person can act on that kept audio. Until Capture history became a
 * reading of the Library it was guarded by NOTHING, and a content merge that
 * quietly dropped it would have broken a stated boundary with a green suite.
 *
 * The assertion is written over the SHAPE, both ways, because a one-way version
 * is worthless:
 *
 *   • A transcript that is ready with the audio RETAINED offers the control,
 *     and pressing it asks to delete THAT capture at THAT version — an
 *     expected-version mismatch is how a concurrent write is refused, so the
 *     version travelling with the request is part of the guarantee.
 *   • A transcript whose audio is already DELETED must not offer it. Without
 *     this half, a control rendered unconditionally passes the first half and
 *     invites a person to delete what is gone.
 *
 * The name is read the way a screen reader would read it, not from
 * `textContent`: a control whose label lives in an `aria-hidden` subtree has an
 * EMPTY accessible name while its text content looks right, and that is exactly
 * the shape of assertion this project keeps catching green over a broken
 * guarantee.
 */

const principalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000009a1",
);

const voiceCapture = (
  suffix: string,
  audioState: "retained" | "deleted",
  version: number,
): DesktopSnapshot["captures"][number] => ({
  id: CaptureIdSchema.parse(`00000000-0000-4000-8000-0000000009${suffix}`),
  spaceId: workHarnessSnapshot.bootstrap.spaces[0]!.id,
  originalText: `Voice note ${suffix}.webm`,
  original: {
    kind: "voice_note",
    payload: {
      payloadId: CapturePayloadIdSchema.parse(
        `00000000-0000-4000-8000-0000000008${suffix}`,
      ),
      displayName: `Voice note ${suffix}.webm`,
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
  audioState,
  audioStateChangedAt: "2026-07-16T09:20:14.000+02:00",
  version,
});

const retained = voiceCapture("b1", "retained", 3);
const deleted = voiceCapture("b2", "deleted", 5);

const snapshot: DesktopSnapshot = {
  ...workHarnessSnapshot,
  captures: [retained, deleted],
};

let container: HTMLElement;
let inspectorHost: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  inspectorHost = document.createElement("div");
  document.body.append(container, inspectorHost);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  inspectorHost.remove();
});

/** The name a screen reader would give the control — never `textContent`. */
const accessibleName = (element: Element): string => {
  const labelled = element.getAttribute("aria-label");
  if (labelled !== null) return labelled.trim();
  const clone = element.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  return (clone.textContent ?? "").replace(/\s+/gu, " ").trim();
};

const namedControl = (name: string): HTMLButtonElement | undefined =>
  [...inspectorHost.querySelectorAll("button")].find(
    (button) => accessibleName(button) === name,
  );

const openCapture = (
  capture: DesktopSnapshot["captures"][number],
  onDeleteVoiceAudio: (captureId: string, version: number) => void = () =>
    undefined,
) => {
  act(() => {
    root.render(
      createElement(CaptureHistoryReading, {
        snapshot,
        inspectorHost,
        onInspectorOpen: () => undefined,
        wiring: {
          selectedCaptureId: capture.id,
          busy: false,
          onSelectCapture: () => undefined,
          onUndo: () => undefined,
          onDeleteVoiceAudio,
        },
      }),
    );
  });
};

test("the only control for the kept voice audio survives the merge into the Library", () => {
  const asked: { captureId: string; version: number }[] = [];
  openCapture(retained, (captureId, version) =>
    asked.push({ captureId, version }),
  );

  // Instrument first: a reading that rendered nothing would pass every
  // "the control is absent" claim below and say nothing at all.
  assert.ok(
    container.querySelectorAll(".history-row").length === 2,
    "the ledger rendered no rows — the measurement failed, it did not pass",
  );

  const control = namedControl("Delete the kept audio");
  assert.ok(
    control !== undefined,
    "a transcript with the audio kept offers no way to delete it",
  );
  assert.equal(control.disabled, false);

  act(() => control.click());
  assert.deepEqual(asked, [
    { captureId: retained.id, version: retained.version },
  ]);
});

test("a capture whose audio is already gone does not offer to delete it", () => {
  openCapture(deleted);
  assertNoNode(
    namedControl("Delete the kept audio") ?? null,
    "a capture whose audio was already deleted still offered to delete it",
  );
  // The rest of the ledger's contract is still there for that capture, so the
  // absence above is about the audio and not about an unrendered inspector.
  assert.ok(namedControl("Preview undo") !== undefined);
});
