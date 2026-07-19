import { createHash } from "node:crypto";

import {
  ApplicationKernel,
  Base64JsonCursorCodec,
  CommandScopedIdGenerator,
  type ApplicationCommandResponse,
  type ApplicationQueryResponse,
  type ApplicationStore,
  type AuthorizationRequest,
  type Clock,
  type CurrentAuthorizationPolicy,
  type SemanticHasher,
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  type ExecutionContext,
  type CaptureOriginal,
  type WorkspaceId,
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

class Sha256SemanticHasher implements SemanticHasher {
  public fingerprint(value: unknown): string {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
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
  readonly capturePayloadVerifier?: {
    isAvailable(workspaceId: WorkspaceId, original: CaptureOriginal): boolean;
  };
}): DesktopKernelService => {
  const hasher = new Sha256SemanticHasher();
  const ids = new CommandScopedIdGenerator(hasher);
  const kernel = new ApplicationKernel({
    authorization: new FixedDesktopGrant(input.context),
    clock: new SystemClock(),
    cursorCodec: new Base64JsonCursorCodec(),
    hasher,
    ids,
    store: input.store,
    ...(input.capturePayloadVerifier === undefined
      ? {}
      : { capturePayloadVerifier: input.capturePayloadVerifier }),
  });
  const currentContext = (): ExecutionContext =>
    input.store.read((view) => {
      const workspace = view.getWorkspace(input.context.workspaceId);
      const membership = view.getMembership(
        input.context.workspaceId,
        input.context.principalId,
      );
      const spaceScope =
        workspace === undefined
          ? input.context.spaceScope
          : membership !== undefined && membership.status !== "revoked"
            ? input.context.spaceScope.filter(
                (spaceId) =>
                  (membership.role === "owner" &&
                    spaceId === workspace?.rootSpaceId) ||
                  view.getSpaceGrantForPrincipal(
                    input.context.workspaceId,
                    spaceId,
                    input.context.principalId,
                  )?.status === "active",
              )
            : [];
      return {
        ...input.context,
        policyVersion: workspace?.policyVersion ?? input.context.policyVersion,
        spaceScope,
      };
    });
  return {
    execute: (rawCommand) => {
      const command = CommandEnvelopeSchema.safeParse(rawCommand);
      if (command.success) ids.begin(command.data.commandId);
      return kernel.execute(currentContext(), rawCommand);
    },
    query: (rawQuery) => kernel.query(currentContext(), rawQuery),
  };
};
