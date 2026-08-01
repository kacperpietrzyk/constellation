import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ATTACHMENT_PROTOCOL_SCHEME,
  CaptureIdSchema,
  CaptureOriginalSchema,
  KnowledgeSourceIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  attachmentUrl,
  type CaptureId,
  type CaptureOriginal,
  type KnowledgeSourceId,
} from "@constellation/contracts";

import {
  ATTACHMENT_RESPONSE_HEADERS,
  SERVABLE_IMAGE_MEDIA_TYPES,
  attachmentSourceIdFromUrl,
  readAttachmentImage,
  type AttachmentCaptureRecord,
  type AttachmentSourceRecord,
} from "../src/attachment-protocol.js";

/**
 * The image byte path is a NEW main-process surface and a security boundary.
 * Until Wave D nothing returned attachment CONTENT to the renderer — the two
 * preload channels that touch payloads return state — so this is the first
 * path by which an `<img src>` inside a document, including one an agent
 * wrote, can make the main process hand back bytes.
 *
 * Nothing else in the repository covers it, so these are part of the feature
 * rather than follow-up.
 */

const workspaceId = WorkspaceIdSchema.parse(
  "b0000000-0000-4000-8000-000000000001",
);
const otherWorkspaceId = WorkspaceIdSchema.parse(
  "b0000000-0000-4000-8000-0000000000ff",
);
const spaceId = SpaceIdSchema.parse("b0000000-0000-4000-8000-000000000002");
const otherSpaceId = SpaceIdSchema.parse(
  "b0000000-0000-4000-8000-0000000000fe",
);
const sourceId = KnowledgeSourceIdSchema.parse(
  "b0000000-0000-4000-8000-000000000003",
);

const bytes = Uint8Array.from([137, 80, 78, 71]);

const original = (mediaType: string): CaptureOriginal =>
  CaptureOriginalSchema.parse({
    kind: "managed_file",
    payload: {
      payloadId: "b0000000-0000-4000-8000-000000000004",
      displayName: "whiteboard.png",
      mediaType,
      byteLength: bytes.byteLength,
      contentSha256: "a".repeat(64),
      custodyState: "available",
    },
  });

const captureId = CaptureIdSchema.parse("b0000000-0000-4000-8000-000000000005");

/**
 * The two records the authorization walks, supplied honestly: the workspace
 * comes from the PORT, never from the URL, so a test that wants to model
 * another workspace's source moves the record, not the request.
 */
const ports = (
  overrides: {
    readonly source?: AttachmentSourceRecord | undefined;
    readonly capture?: AttachmentCaptureRecord | undefined;
    readonly storedBytes?: Uint8Array | undefined;
  } = {},
) => ({
  workspaceId,
  readSource: (asked: KnowledgeSourceId) =>
    asked === sourceId
      ? "source" in overrides
        ? overrides.source
        : { workspaceId, spaceId, sourceCaptureId: captureId }
      : undefined,
  readCapture: (asked: CaptureId) =>
    asked === captureId
      ? "capture" in overrides
        ? overrides.capture
        : { workspaceId, spaceId, original: original("image/png") }
      : undefined,
  readBytes: () => ("storedBytes" in overrides ? overrides.storedBytes : bytes),
});

describe("the attachment image protocol", () => {
  it("serves an image the workspace really holds", () => {
    const image = readAttachmentImage(attachmentUrl(sourceId), ports());
    assert.deepEqual(image, { bytes, mediaType: "image/png" });
  });

  it("refuses a source this workspace cannot reach, and says nothing about why", () => {
    // A source that does not exist, one in another workspace, and one whose
    // capture sits in another Space must be INDISTINGUISHABLE. A refusal that
    // varied with the cause would answer whether a record outside the
    // caller's reach exists — the property `RejectedOutcomeSchema` stays
    // `.strict()` for, restated for agents at `mcp/catalog.ts:151`.
    const refusals = [
      // No such source.
      readAttachmentImage(
        attachmentUrl(sourceId),
        ports({ source: undefined }),
      ),
      // A source belonging to another workspace.
      readAttachmentImage(
        attachmentUrl(sourceId),
        ports({
          source: {
            workspaceId: otherWorkspaceId,
            spaceId,
            sourceCaptureId: captureId,
          },
        }),
      ),
      // A capture belonging to another workspace.
      readAttachmentImage(
        attachmentUrl(sourceId),
        ports({
          capture: {
            workspaceId: otherWorkspaceId,
            spaceId,
            original: original("image/png"),
          },
        }),
      ),
      // A capture in a DIFFERENT Space from its source — the leak that the
      // workspace check alone would let through.
      readAttachmentImage(
        attachmentUrl(sourceId),
        ports({
          capture: {
            workspaceId,
            spaceId: otherSpaceId,
            original: original("image/png"),
          },
        }),
      ),
      // A source with no capture behind it at all.
      readAttachmentImage(
        attachmentUrl(sourceId),
        ports({ source: { workspaceId, spaceId } }),
      ),
      // A capture that is not a file or a screenshot — a URL source, say.
      readAttachmentImage(
        attachmentUrl(sourceId),
        ports({
          capture: {
            workspaceId,
            spaceId,
            original: CaptureOriginalSchema.parse({
              kind: "url",
              url: "https://example.org/a.png",
            }),
          },
        }),
      ),
      // Present and authorized, but the bytes are gone from custody — which
      // `CapturePayloadCustody.read` also answers for a payload whose stored
      // bytes no longer hash to the digest the record carries.
      readAttachmentImage(
        attachmentUrl(sourceId),
        ports({ storedBytes: undefined }),
      ),
      // A different source id in the same workspace.
      readAttachmentImage(
        attachmentUrl("b0000000-0000-4000-8000-0000000000aa"),
        ports(),
      ),
    ];
    for (const refusal of refusals) assert.equal(refusal, undefined);
    assert.equal(
      new Set(refusals.map((value) => JSON.stringify(value ?? null))).size,
      1,
      "The refusals are distinguishable from one another.",
    );
  });

  it("serves only pictures, whatever the attachment claims to be", () => {
    // `CapturePayloadCustody.stage` whitelists media types for a SCREENSHOT
    // and accepts ANY type up to 255 characters for a managed file. So the
    // only thing standing between an uploaded `.html` and script execution on
    // a scheme the renderer trusts is this list.
    for (const mediaType of [
      "text/html",
      "application/javascript",
      "image/svg+xml",
      "application/pdf",
      "text/html; charset=utf-8",
    ]) {
      assert.equal(
        readAttachmentImage(
          attachmentUrl(sourceId),
          ports({
            capture: { workspaceId, spaceId, original: original(mediaType) },
          }),
        ),
        undefined,
        `${mediaType} must not be served as a picture.`,
      );
    }
    // And every type the whitelist DOES carry really is served, so the list
    // cannot quietly become empty and make the refusals above trivially true.
    for (const mediaType of SERVABLE_IMAGE_MEDIA_TYPES) {
      assert.equal(
        readAttachmentImage(
          attachmentUrl(sourceId),
          ports({
            capture: { workspaceId, spaceId, original: original(mediaType) },
          }),
        )?.mediaType,
        mediaType,
      );
    }
    assert.ok(
      SERVABLE_IMAGE_MEDIA_TYPES.size >= 4,
      "The servable media types went empty — this test measures nothing.",
    );
  });

  it("resolves nothing but a bare identity in the host", () => {
    // The id is the URL's HOST, so `/`, `..`, a query and a fragment cannot
    // form part of it. This holds that true rather than assuming it.
    for (const url of [
      `${ATTACHMENT_PROTOCOL_SCHEME}://${sourceId}/../../etc/passwd`,
      `${ATTACHMENT_PROTOCOL_SCHEME}://${sourceId}/anything`,
      `${ATTACHMENT_PROTOCOL_SCHEME}://${sourceId}?x=1`,
      `${ATTACHMENT_PROTOCOL_SCHEME}://${sourceId}#fragment`,
      `${ATTACHMENT_PROTOCOL_SCHEME}://${sourceId}:8080`,
      `${ATTACHMENT_PROTOCOL_SCHEME}://user:pass@${sourceId}`,
      `${ATTACHMENT_PROTOCOL_SCHEME}://not-an-id`,
      `${ATTACHMENT_PROTOCOL_SCHEME}://`,
      `file:///etc/passwd`,
      `https://example.org/${sourceId}`,
      `${ATTACHMENT_PROTOCOL_SCHEME}:${sourceId}`,
      "",
      "not a url at all",
    ]) {
      assert.equal(
        attachmentSourceIdFromUrl(url),
        undefined,
        `${url} must not resolve to a source.`,
      );
      assert.equal(readAttachmentImage(url, ports()), undefined, url);
    }
    // The one shape that must resolve, so the refusals above are not simply
    // "nothing ever resolves".
    assert.equal(attachmentSourceIdFromUrl(attachmentUrl(sourceId)), sourceId);
  });

  it("keeps working when the host arrives upper-cased", () => {
    // Written expecting `new URL` to normalise the host — it does NOT for a
    // non-special scheme, which this assertion measured rather than assumed.
    // So the normalisation is ours, and both halves are pinned: the parser's
    // behaviour, and the fact that we correct for it. Without the correction
    // an upper-cased URL parses to a well-formed id that matches no record
    // and every image behind it 404s for a reason nobody could see.
    const upper = `${ATTACHMENT_PROTOCOL_SCHEME}://${sourceId.toUpperCase()}`;
    assert.equal(new URL(upper).hostname, sourceId.toUpperCase());
    assert.equal(attachmentSourceIdFromUrl(upper), sourceId);
    assert.deepEqual(readAttachmentImage(upper, ports()), {
      bytes,
      mediaType: "image/png",
    });
  });

  it("tells the browser not to re-decide what it was sent", () => {
    // `nosniff` because the whitelist decides the type and a browser
    // re-deriving it from the bytes would put the whitelist back in play;
    // `default-src 'none'` because nothing inside a served image should be
    // able to reach anywhere.
    assert.equal(
      ATTACHMENT_RESPONSE_HEADERS["X-Content-Type-Options"],
      "nosniff",
    );
    assert.match(
      ATTACHMENT_RESPONSE_HEADERS["Content-Security-Policy"],
      /default-src 'none'/u,
    );
  });
});
