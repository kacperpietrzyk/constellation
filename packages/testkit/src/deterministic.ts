import { createHash } from "node:crypto";

import type {
  Clock,
  IdGenerator,
  SemanticHasher,
} from "@constellation/application";

export { Base64JsonCursorCodec } from "@constellation/application";

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
