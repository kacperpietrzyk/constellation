import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  ApplicationKernel,
  CommandScopedIdGenerator,
  InMemoryReferenceStore,
  type AuthorizationRequest,
  type Clock,
  type CurrentAuthorizationPolicy,
  type PaginationCursor,
  type PaginationCursorCodec,
  type SemanticHasher,
} from "@constellation/application";
import {
  CaptureIdSchema,
  CommandEnvelopeSchema,
  HubEnrollmentRequestSchema,
  HubBootstrapSnapshotRequestSchema,
  HubEnrollmentResultSchema,
  HubReconcileCommandResultSchema,
  HubSyncRequestSchema,
  HubSyncResultSchema,
  TaskIdSchema,
  type ExecutionContext,
  type HubEnrollmentRequest,
  type HubBootstrapSnapshotRequest,
  type HubEnrollmentResult,
  type HubReconcileCommandResult,
  type HubSyncRequest,
  type HubSyncResult,
  type HubWorkspaceSnapshot,
  type WorkspaceId,
} from "@constellation/contracts";

import type { HubRepository, HubStoredReceipt } from "./repository.js";
import {
  authorizationForSnapshot,
  fromHubSnapshot,
  scopeHubSnapshot,
  snapshotDigest,
  toHubSnapshot,
} from "./snapshot.js";

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
};

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const secretMatches = (left: string, right: string): boolean => {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

class Sha256Hasher implements SemanticHasher {
  public fingerprint(value: unknown): string {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
  }
}

class ServerClock implements Clock {
  public now(): string {
    return new Date().toISOString();
  }
}

class TrustedHubGrant implements CurrentAuthorizationPolicy {
  public constructor(private readonly trusted: ExecutionContext) {}

  public authorize(request: AuthorizationRequest): boolean {
    return (
      request.context.principalId === this.trusted.principalId &&
      request.context.credentialId === this.trusted.credentialId &&
      request.context.grantId === this.trusted.grantId &&
      request.context.policyVersion === this.trusted.policyVersion &&
      request.workspaceId === this.trusted.workspaceId &&
      request.context.capabilityScope.includes(request.capability) &&
      this.trusted.capabilityScope.includes(request.capability) &&
      (request.spaceId === undefined ||
        (request.context.spaceScope.includes(request.spaceId) &&
          this.trusted.spaceScope.includes(request.spaceId)))
    );
  }
}

class CursorCodec implements PaginationCursorCodec {
  public encode(cursor: PaginationCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
  }

  public decode(value: string): PaginationCursor | undefined {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      if (typeof parsed.orderedAt !== "string") return undefined;
      if (parsed.kind === "capture") {
        const id = CaptureIdSchema.safeParse(parsed.recordId);
        return id.success
          ? { kind: "capture", orderedAt: parsed.orderedAt, recordId: id.data }
          : undefined;
      }
      if (parsed.kind === "task") {
        const id = TaskIdSchema.safeParse(parsed.recordId);
        return id.success
          ? { kind: "task", orderedAt: parsed.orderedAt, recordId: id.data }
          : undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}

export interface HubServiceOptions {
  readonly now?: () => string;
  readonly randomSecret?: () => string;
}

export class HubService {
  private readonly now: () => string;
  private readonly randomSecret: () => string;

  public constructor(
    private readonly repository: HubRepository,
    options: HubServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.randomSecret =
      options.randomSecret ?? (() => randomBytes(32).toString("base64url"));
  }

  public async createWorkspace(input: {
    readonly workspaceId: WorkspaceId;
    readonly snapshot: HubWorkspaceSnapshot;
  }): Promise<void> {
    if (input.snapshot.workspaces.length === 0) {
      const recordArrays = Object.entries(input.snapshot).filter(
        ([key]) => key !== "format",
      );
      if (
        recordArrays.some(
          ([, value]) => !Array.isArray(value) || value.length > 0,
        )
      ) {
        throw new Error(
          "An empty Hub bootstrap snapshot cannot contain records.",
        );
      }
    } else {
      fromHubSnapshot(input.snapshot, input.workspaceId);
    }
    await this.repository.createWorkspace({
      workspaceId: input.workspaceId,
      checkpoint: 0n,
      snapshot: input.snapshot,
      snapshotDigest: snapshotDigest(input.snapshot),
      receipts: new Map(),
    });
  }

  public async createEnrollment(input: {
    readonly workspaceId: WorkspaceId;
    readonly authorization: ExecutionContext;
    readonly expiresAt: string;
  }): Promise<{
    readonly enrollmentId: string;
    readonly enrollmentSecret: string;
  }> {
    if (input.authorization.workspaceId !== input.workspaceId) {
      throw new Error("Enrollment authorization must match the workspace.");
    }
    const currentAuthorization = await this.repository.withWorkspaceLock(
      input.workspaceId,
      (state) =>
        authorizationForSnapshot(
          state.snapshot,
          input.workspaceId,
          input.authorization,
        ),
    );
    if (currentAuthorization === undefined) {
      throw new Error("Enrollment principal has no active Workspace access.");
    }
    const enrollmentSecret = this.randomSecret();
    const enrollmentId = randomUUID();
    await this.repository.createEnrollment({
      id: enrollmentId,
      workspaceId: input.workspaceId,
      authorization: currentAuthorization,
      secretDigest: digest(enrollmentSecret),
      expiresAt: input.expiresAt,
    });
    return { enrollmentId, enrollmentSecret };
  }

  public async enroll(raw: HubEnrollmentRequest): Promise<HubEnrollmentResult> {
    const input = HubEnrollmentRequestSchema.parse(raw);
    const deviceCredential = this.randomSecret();
    const result = await this.repository.claimEnrollment({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      secretDigest: digest(input.enrollmentSecret),
      credentialDigest: digest(deviceCredential),
      now: this.now(),
    });
    if (result.outcome === "rejected") {
      return HubEnrollmentResultSchema.parse(result);
    }
    const checkpoint = await this.repository.withWorkspaceLock(
      input.workspaceId,
      (state) => state.checkpoint.toString(),
    );
    return HubEnrollmentResultSchema.parse({
      outcome: "success",
      protocolVersion: 1,
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      deviceCredential,
      checkpoint,
    });
  }

  public async sync(
    credential: string,
    raw: HubSyncRequest,
  ): Promise<HubSyncResult> {
    const input = HubSyncRequestSchema.parse(raw);
    const authentication = await this.repository.authenticate({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      credentialDigest: digest(credential),
    });
    if (authentication.outcome === "rejected") {
      return HubSyncResultSchema.parse({
        outcome: "rejected",
        code: authentication.code,
        purgeLocalProjection: authentication.purgeLocalProjection,
      });
    }
    const result = await this.repository.withWorkspaceLock(
      input.workspaceId,
      (state): HubSyncResult => {
        let currentAuthorization = authorizationForSnapshot(
          state.snapshot,
          input.workspaceId,
          authentication.device.authorization,
        );
        if (currentAuthorization === undefined) {
          return {
            outcome: "rejected",
            code: "membership_revoked",
            purgeLocalProjection: true,
          };
        }
        const requestedCheckpoint = BigInt(input.checkpoint);
        if (requestedCheckpoint > state.checkpoint) {
          return {
            outcome: "rejected",
            code: "checkpoint_ahead",
            purgeLocalProjection: false,
          };
        }
        const receipts: HubStoredReceipt[] = [];
        for (const command of input.commands) {
          const existing = state.receipts.get(command.commandId);
          if (existing !== undefined) {
            receipts.push(existing);
            continue;
          }
          const store = new InMemoryReferenceStore(
            undefined,
            fromHubSnapshot(state.snapshot, input.workspaceId),
          );
          const hasher = new Sha256Hasher();
          const ids = new CommandScopedIdGenerator(hasher);
          ids.begin(command.commandId);
          const kernel = new ApplicationKernel({
            authorization: new TrustedHubGrant(currentAuthorization),
            clock: new ServerClock(),
            cursorCodec: new CursorCodec(),
            hasher,
            ids,
            store,
          });
          const response = kernel.execute(
            currentAuthorization,
            CommandEnvelopeSchema.parse(command),
          );
          if (response.kind !== "command_outcome") {
            throw new Error(
              "A parsed Hub command was rejected by the contract boundary.",
            );
          }
          const outcome = response.outcome;
          let checkpoint: string | undefined;
          if (outcome.outcome === "success") {
            state.checkpoint += 1n;
            checkpoint = state.checkpoint.toString();
            state.snapshot = toHubSnapshot(store.snapshot());
            state.snapshotDigest = snapshotDigest(state.snapshot);
            currentAuthorization =
              authorizationForSnapshot(
                state.snapshot,
                input.workspaceId,
                currentAuthorization,
              ) ?? currentAuthorization;
          }
          const receipt: HubStoredReceipt = {
            commandId: command.commandId,
            outcome,
            ...(checkpoint === undefined ? {} : { checkpoint }),
          };
          state.receipts.set(command.commandId, receipt);
          receipts.push(receipt);
        }
        const shouldSendChange = requestedCheckpoint < state.checkpoint;
        const scopedSnapshot = scopeHubSnapshot(
          state.snapshot,
          input.workspaceId,
          currentAuthorization,
        );
        if (scopedSnapshot === undefined) {
          return {
            outcome: "rejected",
            code: "membership_revoked",
            purgeLocalProjection: true,
          };
        }
        return HubSyncResultSchema.parse({
          outcome: "success",
          protocolVersion: 1,
          receipts,
          currentCheckpoint: state.checkpoint.toString(),
          ...(shouldSendChange
            ? {
                change: {
                  checkpoint: state.checkpoint.toString(),
                  digest: snapshotDigest(scopedSnapshot),
                  snapshot: scopedSnapshot,
                },
              }
            : {}),
          hasMore: false,
        });
      },
    );
    if (result.outcome === "success") {
      await this.repository.updateDeviceCheckpoint({
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        checkpoint: BigInt(result.currentCheckpoint),
      });
    }
    return result;
  }

  public async bootstrapSnapshot(
    credential: string,
    raw: HubBootstrapSnapshotRequest,
  ): Promise<
    | { readonly outcome: "success" }
    | { readonly outcome: "rejected"; readonly code: string }
  > {
    const input = HubBootstrapSnapshotRequestSchema.parse(raw);
    const authentication = await this.repository.authenticate({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      credentialDigest: digest(credential),
    });
    if (authentication.outcome === "rejected")
      return { outcome: "rejected", code: authentication.code };
    fromHubSnapshot(input.snapshot, input.workspaceId);
    if (snapshotDigest(input.snapshot) !== input.digest)
      return { outcome: "rejected", code: "digest_mismatch" };
    return this.repository.withWorkspaceLock(input.workspaceId, (state) => {
      if (state.checkpoint !== 0n || state.receipts.size > 0)
        return { outcome: "rejected" as const, code: "workspace_not_empty" };
      if (state.snapshot.workspaces.length > 0) {
        return state.snapshotDigest === input.digest
          ? { outcome: "success" as const }
          : { outcome: "rejected" as const, code: "workspace_not_empty" };
      }
      state.snapshot = input.snapshot;
      state.snapshotDigest = input.digest;
      return { outcome: "success" as const };
    });
  }

  public async reconcileCommand(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: HubSyncRequest["deviceId"];
    readonly commandId: string;
  }): Promise<HubReconcileCommandResult> {
    const authentication = await this.repository.authenticate({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      credentialDigest: digest(input.credential),
    });
    if (authentication.outcome === "rejected") {
      return { outcome: "not_found" };
    }
    return this.repository.withWorkspaceLock(input.workspaceId, (state) => {
      const receipt = state.receipts.get(input.commandId);
      return HubReconcileCommandResultSchema.parse(
        receipt === undefined
          ? { outcome: "not_found" }
          : { outcome: "committed", receipt },
      );
    });
  }

  public async leaveDevice(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: HubSyncRequest["deviceId"];
  }): Promise<boolean> {
    const authentication = await this.repository.authenticate({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      credentialDigest: digest(input.credential),
    });
    if (authentication.outcome === "rejected") return false;
    return this.repository.revokeDevice({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      revokedAt: this.now(),
    });
  }

  public async revokeDevice(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: HubSyncRequest["deviceId"];
  }): Promise<boolean> {
    return this.repository.revokeDevice({ ...input, revokedAt: this.now() });
  }
}

export { secretMatches };
