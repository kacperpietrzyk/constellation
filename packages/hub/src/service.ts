import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  ApplicationKernel,
  Base64JsonCursorCodec,
  CommandScopedIdGenerator,
  InMemoryReferenceStore,
  type AuthorizationRequest,
  type Clock,
  type CurrentAuthorizationPolicy,
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
  isCustodiedCaptureOriginal,
  type ExecutionContext,
  type HubEnrollmentRequest,
  type HubBootstrapSnapshotRequest,
  type HubEnrollmentResult,
  type HubReconcileCommandResult,
  type HubSyncRequest,
  type HubSyncResult,
  type HubWorkspaceSnapshot,
  type CaptureOriginal,
  type CaptureId,
  type WorkspaceId,
  type DocumentId,
  type DeviceId,
  type PrincipalId,
  type SpaceId,
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

export interface HubServiceOptions {
  readonly now?: () => string;
  readonly randomSecret?: () => string;
  readonly capturePayloadVerifier?: {
    isAvailable(
      workspaceId: WorkspaceId,
      original: CaptureOriginal,
    ): Promise<boolean>;
    deleteCapturePayload?(input: {
      readonly workspaceId: WorkspaceId;
      readonly original: CaptureOriginal;
    }): Promise<boolean>;
  };
}

export class HubService {
  private readonly now: () => string;
  private readonly randomSecret: () => string;
  private readonly capturePayloadVerifier?: HubServiceOptions["capturePayloadVerifier"];

  public constructor(
    private readonly repository: HubRepository,
    options: HubServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.randomSecret =
      options.randomSecret ?? (() => randomBytes(32).toString("base64url"));
    this.capturePayloadVerifier = options.capturePayloadVerifier;
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

  public async authorizeDocument(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly documentId: DocumentId;
  }): Promise<
    | {
        readonly outcome: "success";
        readonly principalId: PrincipalId;
        readonly spaceId: SpaceId;
        readonly access: "view" | "comment" | "edit";
      }
    | { readonly outcome: "rejected" }
  > {
    const authentication = await this.repository.authenticate({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      credentialDigest: digest(input.credential),
    });
    if (authentication.outcome === "rejected") return { outcome: "rejected" };
    return this.repository.withWorkspaceLock(input.workspaceId, (state) => {
      const authorization = authorizationForSnapshot(
        state.snapshot,
        input.workspaceId,
        authentication.device.authorization,
      );
      if (authorization === undefined) return { outcome: "rejected" } as const;
      const snapshot = fromHubSnapshot(state.snapshot, input.workspaceId);
      const document = (snapshot.documents ?? []).find(
        (candidate) => candidate.id === input.documentId,
      );
      if (
        document === undefined ||
        !authorization.spaceScope.includes(document.spaceId)
      ) {
        return { outcome: "rejected" } as const;
      }
      const membership = snapshot.memberships.find(
        (candidate) => candidate.principalId === authorization.principalId,
      );
      if (membership === undefined || membership.status === "revoked") {
        return { outcome: "rejected" } as const;
      }
      const workspace = snapshot.workspaces[0];
      const grant = (snapshot.spaceGrants ?? []).find(
        (candidate) =>
          candidate.principalId === authorization.principalId &&
          candidate.spaceId === document.spaceId &&
          candidate.status === "active",
      );
      const access =
        membership.role === "owner" &&
        workspace?.rootSpaceId === document.spaceId
          ? "edit"
          : grant?.access;
      return access === undefined
        ? ({ outcome: "rejected" } as const)
        : {
            outcome: "success" as const,
            principalId: authorization.principalId,
            spaceId: document.spaceId,
            access,
          };
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
    const pendingVoiceFinalizations: CaptureId[] = [];
    const result = await this.repository.withWorkspaceLock(
      input.workspaceId,
      async (state): Promise<HubSyncResult> => {
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
        pendingVoiceFinalizations.push(
          ...state.snapshot.captures
            .filter(
              (capture) =>
                capture.processingState === "transcript_ready" &&
                capture.audioState === "deletion_pending",
            )
            .map((capture) => CaptureIdSchema.parse(capture.id)),
        );
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
          const parsedCommand = CommandEnvelopeSchema.parse(command);
          const managedOriginal:
            | Extract<
                CaptureOriginal,
                { kind: "managed_file" | "screenshot" | "voice_note" }
              >
            | undefined = (() => {
            const original =
              parsedCommand.commandName === "capture.submit"
                ? parsedCommand.payload.original
                : parsedCommand.commandName === "capture.resolveException" &&
                    parsedCommand.payload.action === "replace_payload"
                  ? parsedCommand.payload.original
                  : undefined;
            if (original === undefined) return undefined;
            if (parsedCommand.commandName === "capture.submit")
              return isCustodiedCaptureOriginal(original)
                ? original
                : undefined;
            return original.kind === "managed_file" ||
              original.kind === "screenshot"
              ? original
              : undefined;
          })();
          const managedPayloadAvailable =
            managedOriginal === undefined
              ? false
              : (await this.capturePayloadVerifier?.isAvailable(
                  input.workspaceId,
                  managedOriginal,
                )) === true;
          const kernel = new ApplicationKernel({
            authorization: new TrustedHubGrant(currentAuthorization),
            clock: new ServerClock(),
            cursorCodec: new Base64JsonCursorCodec(),
            hasher,
            ids,
            store,
            ...(managedOriginal === undefined
              ? {}
              : {
                  capturePayloadVerifier: {
                    isAvailable: (workspaceId, original) =>
                      workspaceId === input.workspaceId &&
                      original.kind === managedOriginal.kind &&
                      original.payload.contentSha256 ===
                        managedOriginal.payload.contentSha256 &&
                      original.payload.byteLength ===
                        managedOriginal.payload.byteLength &&
                      managedPayloadAvailable,
                  },
                }),
          });
          const response = kernel.execute(currentAuthorization, parsedCommand);
          if (response.kind !== "command_outcome") {
            throw new Error(
              "A parsed Hub command was rejected by the contract boundary.",
            );
          }
          const outcome = response.outcome;
          if (
            outcome.outcome === "success" &&
            (parsedCommand.commandName === "capture.writeTranscript" ||
              parsedCommand.commandName === "capture.requestAudioDeletion")
          )
            pendingVoiceFinalizations.push(parsedCommand.payload.captureId);
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
      for (const captureId of pendingVoiceFinalizations)
        await this.finalizeVoiceAudio(
          input.workspaceId,
          captureId,
          authentication.device.authorization,
        );
    }
    return result;
  }

  private async finalizeVoiceAudio(
    workspaceId: WorkspaceId,
    captureId: CaptureId,
    authorization: ExecutionContext,
  ): Promise<void> {
    await this.repository.withWorkspaceLock(workspaceId, async (state) => {
      const currentAuthorization = authorizationForSnapshot(
        state.snapshot,
        workspaceId,
        authorization,
      );
      if (currentAuthorization === undefined) return;
      const store = new InMemoryReferenceStore(
        undefined,
        fromHubSnapshot(state.snapshot, workspaceId),
      );
      const capture = store.read((view) => view.getCapture(captureId));
      if (
        capture?.processingState !== "transcript_ready" ||
        capture.audioState !== "deletion_pending" ||
        capture.original.kind !== "voice_note"
      )
        return;
      const voiceOriginal = capture.original;
      const sharedReadableReference = store
        .snapshot()
        .captures.some((candidate) => {
          if (
            candidate.id === capture.id ||
            !isCustodiedCaptureOriginal(candidate.original) ||
            candidate.original.payload.contentSha256 !==
              voiceOriginal.payload.contentSha256
          )
            return false;
          return !(
            candidate.original.kind === "voice_note" &&
            candidate.processingState === "transcript_ready" &&
            candidate.audioState !== "retained"
          );
        });
      const deletionVerified =
        sharedReadableReference ||
        (await this.capturePayloadVerifier?.deleteCapturePayload?.({
          workspaceId,
          original: voiceOriginal,
        })) === true;
      if (!deletionVerified) return;
      const internalAuthorization: ExecutionContext = {
        ...currentAuthorization,
        capabilityScope: [
          ...new Set([
            ...currentAuthorization.capabilityScope,
            "capture.audioDeleteConfirm" as const,
          ]),
        ],
        origin: "maintenance",
      };
      const hasher = new Sha256Hasher();
      const ids = new CommandScopedIdGenerator(hasher);
      const confirmation = CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "capture.confirmAudioDeletion",
        commandId: randomUUID(),
        workspaceId,
        idempotencyKey: `voice-audio-delete:${capture.id}:v${capture.version}`,
        expectedVersions: { [capture.id]: capture.version },
        correlationId: randomUUID(),
        payload: {
          captureId: capture.id,
          audioContentSha256: voiceOriginal.payload.contentSha256,
        },
      });
      ids.begin(confirmation.commandId);
      const kernel = new ApplicationKernel({
        authorization: new TrustedHubGrant(internalAuthorization),
        clock: new ServerClock(),
        cursorCodec: new Base64JsonCursorCodec(),
        hasher,
        ids,
        store,
      });
      const result = kernel.execute(internalAuthorization, confirmation);
      if (
        result.kind !== "command_outcome" ||
        result.outcome.outcome !== "success"
      )
        return;
      state.snapshot = toHubSnapshot(store.snapshot());
      state.snapshotDigest = snapshotDigest(state.snapshot);
      state.checkpoint += 1n;
    });
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
