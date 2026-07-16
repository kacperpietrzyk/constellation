import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_DURATION_MS,
  voiceRecorderMimeType,
} from "../src/voice-recorder.js";

describe("short voice-note recorder contract", () => {
  it("prefers Opus/WebM and falls back only to accepted audio containers", () => {
    assert.deepEqual(
      voiceRecorderMimeType((mimeType) =>
        ["audio/webm;codecs=opus", "audio/mp4"].includes(mimeType),
      ),
      { recorderMimeType: "audio/webm;codecs=opus", mediaType: "audio/webm" },
    );
    assert.deepEqual(
      voiceRecorderMimeType((mimeType) => mimeType === "audio/mp4"),
      { recorderMimeType: "audio/mp4", mediaType: "audio/mp4" },
    );
    assert.equal(
      voiceRecorderMimeType(() => false),
      undefined,
    );
  });

  it("keeps the accepted recording boundary short and payload-compatible", () => {
    assert.equal(MAX_VOICE_NOTE_DURATION_MS, 120_000);
    assert.equal(MAX_VOICE_NOTE_BYTES, 25 * 1024 * 1024);
  });
});
