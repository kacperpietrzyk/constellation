/**
 * How an image inside a note reaches its bytes.
 *
 * An `image` node stores `{ sourceId, alt }` — a `KnowledgeSourceId`, never a
 * URL. Something still has to turn that identity into something an `<img>`
 * can load, and this is the shape of it: a custom scheme the main process
 * serves from the workspace's own attachment custody.
 *
 * The three shapes considered, and why this one:
 *
 * - A `data:` URI in the node's attributes puts the bytes inside the CRDT,
 *   past `MAX_STRUCTURED_DOCUMENT_BYTES` (512 kB) and `MAX_DOCUMENT_UPDATE_BYTES`
 *   (1 MB) on the first photograph anybody attaches. Rejected on sight.
 * - An IPC call returning a `Uint8Array` copies the whole file across the
 *   bridge and needs blob-URL lifecycle management per node; an attachment may
 *   be 25 MB.
 * - This: bytes never enter the renderer's heap, `<img src>` works natively,
 *   and — the part that matters most — resolution goes through the SAME
 *   authorization the attachment list already goes through, in the main
 *   process, where the renderer cannot reach around it.
 *
 * The constant lives in `contracts` because BOTH sides need it and neither may
 * import the other: the renderer builds the URL, the main process registers
 * the scheme and answers it. It is also why it must not live in the editor's
 * lazy module — an eager import of that module would drag the whole tiptap
 * stack onto the startup path.
 */
export const ATTACHMENT_PROTOCOL_SCHEME = "constellation-attachment";

/**
 * The URL an image node's `sourceId` resolves to.
 *
 * The id is the URL's HOST, not a path segment, and that is deliberate: a
 * host cannot carry `/`, `..`, a query or a fragment, so the shapes a reader
 * would otherwise have to defend against never form. The resolver still
 * refuses anything that is not a bare id — this makes that refusal a
 * formality rather than the only line of defence.
 */
export const attachmentUrl = (sourceId: string): string =>
  `${ATTACHMENT_PROTOCOL_SCHEME}://${sourceId}`;

/**
 * The media types an attachment may be shown, and served, as a picture.
 *
 * ONE list, in the contract, because both sides need it and a restatement is
 * this wave's own defect family: the renderer decides whether to offer
 * "Insert into note" and the main process decides whether to answer with
 * bytes, and the two disagreeing means either a button that always fails or
 * — far worse — a type the renderer would not offer being served anyway.
 *
 * A whitelist rather than a prefix test. `CapturePayloadCustody.stage`
 * whitelists media types for a SCREENSHOT and accepts ANY type up to 255
 * characters for a managed file, so an attachment may legitimately claim to
 * be `text/html`; serving that back on a scheme the renderer trusts turns an
 * upload into script execution.
 *
 * `image/svg+xml` is deliberately absent. An SVG is a document: it can fetch,
 * and it can script. It is a picture in the way a web page is a picture.
 */
export const SERVABLE_IMAGE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
