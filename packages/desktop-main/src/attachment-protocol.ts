import {
  ATTACHMENT_PROTOCOL_SCHEME,
  KnowledgeSourceIdSchema,
  SERVABLE_IMAGE_MEDIA_TYPES,
  isCustodiedCaptureOriginal,
  type CaptureId,
  type CaptureOriginal,
  type KnowledgeSourceId,
  type SpaceId,
  type WorkspaceId,
} from "@constellation/contracts";

/**
 * Turning an image node's `sourceId` into bytes — the whole of it, with no
 * Electron in sight so that the authorization can be tested directly.
 *
 * THIS IS A SECURITY BOUNDARY AND A NEW ONE. Everything the renderer could
 * previously ask the main process about an attachment returned STATE
 * (`inspectManagedPayload`, `restoreManagedPayload`); nothing returned
 * content. A custom scheme is the first path by which the renderer can make
 * the main process hand back bytes, and it is reachable from any `<img src>`
 * a document happens to contain — including one an agent wrote.
 *
 * Four properties, each of which is a test:
 *
 * 1. **Only an image.** `CapturePayloadCustody.stage` whitelists media types
 *    for a `screenshot` and accepts ANY type up to 255 characters for a
 *    `managed_file`. So without a whitelist, a workspace holding a
 *    `text/html` attachment would serve it back on a scheme the renderer
 *    trusts — an attachment upload turned into script execution.
 * 2. **Only this workspace, and only the note's own Space.** The chain is the
 *    same one `task.list`'s attachment projection walks
 *    (`kernel.ts:3588-3600`), followed rather than reimplemented: source →
 *    workspace equality → capture → workspace and Space equality → kind.
 * 3. **One refusal, never several.** Unknown id, wrong workspace, wrong
 *    Space, wrong media type and malformed URL all answer identically. The
 *    reason is the one `RejectedOutcomeSchema` already states for staying
 *    `.strict()` (`outcome.ts:1546-1551`): distinguishable refusals answer
 *    whether a record outside the caller's reach exists.
 * 4. **The id is the URL's HOST.** A host cannot contain `/`, `..`, a query
 *    or a fragment, so the traversal shapes never form; anything that is not
 *    a bare id is refused anyway. Note the measured correction: the WHATWG
 *    parser does NOT lower-case the host of a non-special scheme, so the
 *    normalisation is done here and pinned by a test.
 */

export interface AttachmentImageSource {
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly original: CaptureOriginal;
}

export interface AttachmentProtocolPorts {
  /**
   * The workspace this process opened. It is a PORT, not a URL parameter: a
   * resolver that took the workspace from the caller would let a document
   * name its own scope, which is the entire boundary.
   */
  readonly workspaceId: WorkspaceId;
  readonly readSource: (
    sourceId: KnowledgeSourceId,
  ) => AttachmentSourceRecord | undefined;
  readonly readCapture: (
    captureId: CaptureId,
  ) => AttachmentCaptureRecord | undefined;
  readonly readBytes: (original: CaptureOriginal) => Uint8Array | undefined;
}

/** Only what the authorization needs, so a test can supply it honestly. */
export interface AttachmentSourceRecord {
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly sourceCaptureId?: CaptureId;
}

export interface AttachmentCaptureRecord {
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly original: CaptureOriginal;
}

/**
 * The authorized attachment behind a source id, or `undefined`.
 *
 * It lives HERE, in the module with no Electron in it, precisely so it is the
 * thing under test: written inline in the protocol handler it would be the
 * one part of this surface no assertion could reach. That is not hypothetical
 * either — it WAS written inline first, and the test meant to cover it passed
 * while checking nothing, because the test supplied the resolver too.
 */
const authorizedAttachment = (
  sourceId: KnowledgeSourceId,
  ports: AttachmentProtocolPorts,
): AttachmentImageSource | undefined => {
  const source = ports.readSource(sourceId);
  if (source === undefined || source.workspaceId !== ports.workspaceId)
    return undefined;
  const capture =
    source.sourceCaptureId === undefined
      ? undefined
      : ports.readCapture(source.sourceCaptureId);
  if (
    capture === undefined ||
    capture.workspaceId !== ports.workspaceId ||
    capture.spaceId !== source.spaceId ||
    (capture.original.kind !== "managed_file" &&
      capture.original.kind !== "screenshot")
  )
    return undefined;
  return {
    workspaceId: source.workspaceId,
    spaceId: source.spaceId,
    original: capture.original,
  };
};

export interface AttachmentResponse {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

/**
 * The source id a URL names, or `undefined` when the URL is not one this
 * scheme serves. Exported so the refusal shapes can be asserted directly
 * rather than inferred from a 404.
 */
export const attachmentSourceIdFromUrl = (
  url: string,
): KnowledgeSourceId | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (
    parsed.protocol !== `${ATTACHMENT_PROTOCOL_SCHEME}:` ||
    // A path of exactly "/" is what `new URL` leaves behind for a bare host;
    // anything longer is somebody navigating, and there is nowhere to go.
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== ""
  )
    return undefined;
  // Lower-cased on purpose. The WHATWG parser does NOT normalise the host of
  // a non-special scheme — measured, not assumed — and a uuid is
  // case-insensitive while every stored id is lower case. Without this an
  // upper-cased URL parses to a well-formed id that matches no record, and
  // every image behind it 404s for a reason nobody could see.
  const candidate = KnowledgeSourceIdSchema.safeParse(
    parsed.hostname.toLowerCase(),
  );
  return candidate.success ? candidate.data : undefined;
};

/**
 * The bytes an image node's URL resolves to, or `undefined` — one refusal for
 * every reason there could be.
 */
export const readAttachmentImage = (
  url: string,
  ports: AttachmentProtocolPorts,
): AttachmentResponse | undefined => {
  const sourceId = attachmentSourceIdFromUrl(url);
  if (sourceId === undefined) return undefined;
  const source = authorizedAttachment(sourceId, ports);
  if (source === undefined || !isCustodiedCaptureOriginal(source.original))
    return undefined;
  const mediaType = source.original.payload.mediaType.trim().toLowerCase();
  if (!SERVABLE_IMAGE_MEDIA_TYPES.has(mediaType)) return undefined;
  const bytes = ports.readBytes(source.original);
  // `read` returns nothing unless the stored bytes still hash to the digest
  // the record carries, so a swapped payload is a refusal and not a picture.
  return bytes === undefined ? undefined : { bytes, mediaType };
};

export { SERVABLE_IMAGE_MEDIA_TYPES };

/**
 * The headers every served image carries.
 *
 * `nosniff` because the whitelist above decides what this is, and a browser
 * re-deciding from the bytes would put the whole point of the whitelist back
 * in play. `default-src 'none'` because nothing inside an image should ever
 * be able to fetch anything — an SVG would, which is also why `image/svg+xml`
 * is not on the list.
 */
export const ATTACHMENT_RESPONSE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cache-Control": "no-store",
} as const;
