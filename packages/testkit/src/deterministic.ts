import { createHash } from "node:crypto";

import type {
  Clock,
  IdGenerator,
  PaginationCursor,
  PaginationCursorCodec,
  SemanticHasher,
} from "@constellation/application";
import { CaptureIdSchema } from "@constellation/contracts";

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
};

export class TickingClock implements Clock {
  private tick = 0;

  public constructor(private readonly start = "2026-07-12T12:00:00.000Z") {}

  public now(): string {
    const value = new Date(
      Date.parse(this.start) + this.tick * 1_000,
    ).toISOString();
    this.tick += 1;
    return value;
  }
}

export class DeterministicIdGenerator implements IdGenerator {
  private sequence = 256;

  public next(): string {
    const suffix = this.sequence.toString(16).padStart(12, "0");
    this.sequence += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  }
}

export class Sha256SemanticHasher implements SemanticHasher {
  public fingerprint(value: unknown): string {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
  }
}

export class Base64JsonCursorCodec implements PaginationCursorCodec {
  public encode(cursor: PaginationCursor): string {
    return Buffer.from(
      JSON.stringify({
        capturedAt: cursor.capturedAt,
        captureId: cursor.captureId,
      }),
      "utf8",
    ).toString("base64url");
  }

  public decode(value: string): PaginationCursor | undefined {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      );
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return undefined;
      }
      const candidate = parsed as Record<string, unknown>;
      if (
        Object.keys(candidate).sort().join(",") !== "captureId,capturedAt" ||
        typeof candidate.capturedAt !== "string" ||
        Number.isNaN(Date.parse(candidate.capturedAt))
      ) {
        return undefined;
      }
      const captureId = CaptureIdSchema.safeParse(candidate.captureId);
      return captureId.success
        ? { capturedAt: candidate.capturedAt, captureId: captureId.data }
        : undefined;
    } catch {
      return undefined;
    }
  }
}
