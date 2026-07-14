import { createHash, randomUUID } from "node:crypto";

import {
  ApplicationKernel,
  type ApplicationCommandResponse,
  type ApplicationQueryResponse,
  type ApplicationStore,
  type AuthorizationRequest,
  type Clock,
  type CurrentAuthorizationPolicy,
  type IdGenerator,
  type PaginationCursor,
  type PaginationCursorCodec,
  type SemanticHasher,
} from "@constellation/application";
import {
  CaptureIdSchema,
  TaskIdSchema,
  type ExecutionContext,
} from "@constellation/contracts";

export interface DesktopKernelService {
  execute(rawCommand: unknown): ApplicationCommandResponse;
  query(rawQuery: unknown): ApplicationQueryResponse;
}

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};

class SystemClock implements Clock {
  public now(): string {
    return new Date().toISOString();
  }
}

class RandomIdGenerator implements IdGenerator {
  public next(): string {
    return randomUUID();
  }
}

class Sha256SemanticHasher implements SemanticHasher {
  public fingerprint(value: unknown): string {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
  }
}

class Base64JsonCursorCodec implements PaginationCursorCodec {
  public encode(cursor: PaginationCursor): string {
    return Buffer.from(
      JSON.stringify({
        kind: cursor.kind,
        orderedAt: cursor.orderedAt,
        recordId: cursor.recordId,
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
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return undefined;
      }
      const candidate = parsed as Record<string, unknown>;
      if (
        Object.keys(candidate).sort().join(",") !== "kind,orderedAt,recordId" ||
        typeof candidate.orderedAt !== "string" ||
        Number.isNaN(Date.parse(candidate.orderedAt))
      ) {
        return undefined;
      }
      if (candidate.kind === "capture") {
        const id = CaptureIdSchema.safeParse(candidate.recordId);
        return id.success
          ? {
              kind: "capture",
              orderedAt: candidate.orderedAt,
              recordId: id.data,
            }
          : undefined;
      }
      if (candidate.kind === "task") {
        const id = TaskIdSchema.safeParse(candidate.recordId);
        return id.success
          ? { kind: "task", orderedAt: candidate.orderedAt, recordId: id.data }
          : undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}

class FixedDesktopGrant implements CurrentAuthorizationPolicy {
  public constructor(private readonly trustedContext: ExecutionContext) {}

  public authorize(request: AuthorizationRequest): boolean {
    const context = request.context;
    return (
      context.principalId === this.trustedContext.principalId &&
      context.principalKind === this.trustedContext.principalKind &&
      context.credentialId === this.trustedContext.credentialId &&
      context.grantId === this.trustedContext.grantId &&
      context.workspaceId === this.trustedContext.workspaceId &&
      context.policyVersion === this.trustedContext.policyVersion &&
      request.workspaceId === this.trustedContext.workspaceId &&
      context.capabilityScope.includes(request.capability) &&
      this.trustedContext.capabilityScope.includes(request.capability) &&
      (request.spaceId === undefined ||
        (context.spaceScope.includes(request.spaceId) &&
          this.trustedContext.spaceScope.includes(request.spaceId)))
    );
  }
}

export const createRuntimeKernelService = (input: {
  readonly context: ExecutionContext;
  readonly store: ApplicationStore;
}): DesktopKernelService => {
  const kernel = new ApplicationKernel({
    authorization: new FixedDesktopGrant(input.context),
    clock: new SystemClock(),
    cursorCodec: new Base64JsonCursorCodec(),
    hasher: new Sha256SemanticHasher(),
    ids: new RandomIdGenerator(),
    store: input.store,
  });
  return {
    execute: (rawCommand) => kernel.execute(input.context, rawCommand),
    query: (rawQuery) => kernel.query(input.context, rawQuery),
  };
};
