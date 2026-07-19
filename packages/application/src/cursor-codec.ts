import { CaptureIdSchema, TaskIdSchema } from "@constellation/contracts";

import type { PaginationCursor, PaginationCursorCodec } from "./ports.js";

const TASK_DUE_CURSOR_PRIORITIES = ["urgent", "high", "normal", "low"] as const;

// The serialized cursor is ASCII by construction (validated UUIDs, ISO
// instants, and enum literals), so a platform-neutral base64url over char
// codes stays byte-identical with the previous Node Buffer encoding.
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const encodeBase64Url = (text: string): string => {
  let out = "";
  for (let index = 0; index < text.length; index += 3) {
    const first = text.charCodeAt(index);
    const second =
      index + 1 < text.length ? text.charCodeAt(index + 1) : undefined;
    const third =
      index + 2 < text.length ? text.charCodeAt(index + 2) : undefined;
    if (first > 255 || (second ?? 0) > 255 || (third ?? 0) > 255) {
      throw new RangeError("Cursor payload must be ASCII.");
    }
    out += BASE64URL_ALPHABET[first >> 2];
    out += BASE64URL_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      out += BASE64URL_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) out += BASE64URL_ALPHABET[third & 63];
  }
  return out;
};

const decodeBase64Url = (value: string): string | undefined => {
  if (value.length % 4 === 1) return undefined;
  let bits = 0;
  let bitCount = 0;
  let out = "";
  for (const character of value) {
    const digit = BASE64URL_ALPHABET.indexOf(character);
    if (digit < 0) return undefined;
    bits = (bits << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      out += String.fromCharCode((bits >> bitCount) & 255);
    }
  }
  return out;
};

/**
 * The one shared opaque-cursor encoding used by the desktop runtime, the Hub,
 * and the deterministic test harness. Decoding validates the exact key set and
 * value shapes for each cursor kind and fails closed on anything else.
 */
export class Base64JsonCursorCodec implements PaginationCursorCodec {
  public encode(cursor: PaginationCursor): string {
    return encodeBase64Url(
      JSON.stringify(
        cursor.kind === "task_due"
          ? {
              kind: cursor.kind,
              dueAt: cursor.dueAt,
              priority: cursor.priority,
              orderedAt: cursor.orderedAt,
              recordId: cursor.recordId,
            }
          : {
              kind: cursor.kind,
              orderedAt: cursor.orderedAt,
              recordId: cursor.recordId,
            },
      ),
    );
  }

  public decode(value: string): PaginationCursor | undefined {
    try {
      const decoded = decodeBase64Url(value);
      if (decoded === undefined) return undefined;
      const parsed: unknown = JSON.parse(decoded);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return undefined;
      }
      const candidate = parsed as Record<string, unknown>;
      if (
        typeof candidate.orderedAt !== "string" ||
        Number.isNaN(Date.parse(candidate.orderedAt))
      ) {
        return undefined;
      }
      const keys = Object.keys(candidate).sort().join(",");
      if (candidate.kind === "task_due") {
        const taskId = TaskIdSchema.safeParse(candidate.recordId);
        return keys === "dueAt,kind,orderedAt,priority,recordId" &&
          taskId.success &&
          (candidate.dueAt === null ||
            (typeof candidate.dueAt === "string" &&
              !Number.isNaN(Date.parse(candidate.dueAt)))) &&
          TASK_DUE_CURSOR_PRIORITIES.includes(
            candidate.priority as (typeof TASK_DUE_CURSOR_PRIORITIES)[number],
          )
          ? {
              kind: "task_due",
              dueAt: candidate.dueAt as string | null,
              priority:
                candidate.priority as (typeof TASK_DUE_CURSOR_PRIORITIES)[number],
              orderedAt: candidate.orderedAt,
              recordId: taskId.data,
            }
          : undefined;
      }
      if (keys !== "kind,orderedAt,recordId") return undefined;
      if (candidate.kind === "capture") {
        const captureId = CaptureIdSchema.safeParse(candidate.recordId);
        return captureId.success
          ? {
              kind: "capture",
              orderedAt: candidate.orderedAt,
              recordId: captureId.data,
            }
          : undefined;
      }
      if (candidate.kind === "task") {
        const taskId = TaskIdSchema.safeParse(candidate.recordId);
        return taskId.success
          ? {
              kind: "task",
              orderedAt: candidate.orderedAt,
              recordId: taskId.data,
            }
          : undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
