import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowsAudioMediaCheck,
  allowsAudioMediaRequest,
} from "../src/media-permission.js";

const trusted = (url: string) => url.startsWith("file://constellation/");

describe("voice-note media permission", () => {
  it("allows only an audio-only main-frame request from the trusted renderer", () => {
    assert.equal(
      allowsAudioMediaCheck(
        {
          permission: "media",
          requestingOrigin: "file://constellation/",
          webContentsUrl: "file://constellation/index.html",
          details: {
            isMainFrame: true,
            mediaType: "audio",
            requestingUrl: "file://constellation/index.html",
            securityOrigin: "file://constellation/",
          },
        },
        trusted,
      ),
      true,
    );
    assert.equal(
      allowsAudioMediaRequest(
        {
          permission: "media",
          webContentsUrl: "file://constellation/index.html",
          details: {
            isMainFrame: true,
            mediaTypes: ["audio"],
            requestingUrl: "file://constellation/index.html",
            securityOrigin: "file://constellation/",
          },
        },
        trusted,
      ),
      true,
    );
  });

  it("rejects camera, mixed media, subframes, and untrusted origins", () => {
    for (const mediaTypes of [["video"], ["audio", "video"]] as const)
      assert.equal(
        allowsAudioMediaRequest(
          {
            permission: "media",
            webContentsUrl: "file://constellation/index.html",
            details: {
              isMainFrame: true,
              mediaTypes,
              requestingUrl: "file://constellation/index.html",
            },
          },
          trusted,
        ),
        false,
      );
    assert.equal(
      allowsAudioMediaCheck(
        {
          permission: "media",
          requestingOrigin: "https://attacker.invalid",
          webContentsUrl: "file://constellation/index.html",
          details: { isMainFrame: false, mediaType: "audio" },
        },
        trusted,
      ),
      false,
    );
  });
});
