import { createHash, randomUUID } from "node:crypto";

import {
  CaptureOriginalSchema,
  CapturePayloadIdSchema,
  isCustodiedCaptureOriginal,
  type CaptureOriginal,
  type WorkspaceId,
} from "@constellation/contracts";
import type { SqliteApplicationStore } from "@constellation/local-store";

export const MAX_CAPTURE_PAYLOAD_BYTES = 25 * 1024 * 1024;

export type CapturePayloadFailureCode =
  | "cancelled"
  | "payload_empty"
  | "payload_too_large"
  | "payload_unsupported"
  | "payload_unavailable"
  | "payload_integrity_failed"
  | "payload_transfer_unavailable";

export type CapturePayloadCustodyResult =
  | { readonly outcome: "success"; readonly original: CaptureOriginal }
  | { readonly outcome: "failure"; readonly code: CapturePayloadFailureCode };

const supportedScreenshotTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const supportedVoiceTypes = new Set(["audio/webm", "audio/ogg", "audio/mp4"]);

export class CapturePayloadCustody {
  public constructor(
    private readonly workspaceId: WorkspaceId,
    private readonly store: SqliteApplicationStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public stage(input: {
    readonly displayName: string;
    readonly mediaType: string;
    readonly inputKind: "file" | "screenshot" | "voice_note";
    readonly bytes: Uint8Array;
    readonly durationMs?: number;
    readonly retentionPolicy?: "delete_after_transcript" | "retain";
  }): CapturePayloadCustodyResult {
    const displayName = input.displayName.trim();
    const mediaType = input.mediaType.trim().toLowerCase();
    if (input.bytes.byteLength === 0)
      return { outcome: "failure", code: "payload_empty" };
    if (input.bytes.byteLength > MAX_CAPTURE_PAYLOAD_BYTES)
      return { outcome: "failure", code: "payload_too_large" };
    if (
      displayName.length === 0 ||
      displayName.length > 500 ||
      mediaType.length === 0 ||
      mediaType.length > 255 ||
      (input.inputKind === "screenshot" &&
        !supportedScreenshotTypes.has(mediaType)) ||
      (input.inputKind === "voice_note" &&
        (!supportedVoiceTypes.has(mediaType) ||
          !Number.isSafeInteger(input.durationMs) ||
          input.durationMs === undefined ||
          input.durationMs < 1 ||
          input.durationMs > 120_000 ||
          (input.retentionPolicy !== "delete_after_transcript" &&
            input.retentionPolicy !== "retain")))
    )
      return { outcome: "failure", code: "payload_unsupported" };

    const payloadId = CapturePayloadIdSchema.parse(randomUUID());
    const contentSha256 = createHash("sha256")
      .update(input.bytes)
      .digest("hex");
    try {
      this.store.storeCapturePayload({
        payloadId,
        workspaceId: this.workspaceId,
        displayName,
        mediaType,
        inputKind: input.inputKind,
        contentSha256,
        bytes: input.bytes,
        createdAt: this.now().toISOString(),
      });
    } catch {
      return { outcome: "failure", code: "payload_unavailable" };
    }
    const original = CaptureOriginalSchema.parse({
      kind:
        input.inputKind === "screenshot"
          ? "screenshot"
          : input.inputKind === "voice_note"
            ? "voice_note"
            : "managed_file",
      payload: {
        payloadId,
        displayName,
        mediaType,
        byteLength: input.bytes.byteLength,
        contentSha256,
        custodyState: "available",
      },
      ...(input.inputKind === "voice_note"
        ? {
            durationMs: input.durationMs,
            retentionPolicy: input.retentionPolicy,
          }
        : {}),
    });
    return { outcome: "success", original };
  }

  public verify(original: CaptureOriginal): boolean {
    if (!isCustodiedCaptureOriginal(original)) return true;
    const stored = this.store.readCapturePayload({
      payloadId: original.payload.payloadId,
      workspaceId: this.workspaceId,
    });
    if (stored === undefined) return false;
    return (
      stored.displayName === original.payload.displayName &&
      stored.mediaType === original.payload.mediaType &&
      stored.inputKind ===
        (original.kind === "screenshot"
          ? "screenshot"
          : original.kind === "voice_note"
            ? "voice_note"
            : "file") &&
      stored.bytes.byteLength === original.payload.byteLength &&
      stored.contentSha256 === original.payload.contentSha256 &&
      createHash("sha256").update(stored.bytes).digest("hex") ===
        original.payload.contentSha256
    );
  }

  public read(original: CaptureOriginal): Uint8Array | undefined {
    if (!isCustodiedCaptureOriginal(original)) return undefined;
    if (!this.verify(original)) return undefined;
    return this.store.readCapturePayload({
      payloadId: original.payload.payloadId,
      workspaceId: this.workspaceId,
    })?.bytes;
  }

  public discard(original: CaptureOriginal): void {
    if (!isCustodiedCaptureOriginal(original)) return;
    this.store.deleteCapturePayload({
      payloadId: original.payload.payloadId,
      workspaceId: this.workspaceId,
    });
  }

  public deleteVoiceAudio(original: CaptureOriginal): boolean {
    if (original.kind !== "voice_note") return false;
    this.discard(original);
    return !this.verify(original);
  }

  public reconcile(): number {
    return this.store.purgeUnreferencedCapturePayloads(this.workspaceId);
  }
}
