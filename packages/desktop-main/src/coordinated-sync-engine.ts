import { createHash } from "node:crypto";

import type { ReferenceStateSnapshot } from "@constellation/application";
import {
  HubReconcileCommandResultSchema,
  HubAttachmentUploadSchema,
  HubSyncResultSchema,
  HubWorkspaceSnapshotSchema,
  type DeviceId,
  type HubReconcileCommandResult,
  type HubSyncRequest,
  type HubSyncResult,
  type HubWorkspaceSnapshot,
  type WorkspaceId,
} from "@constellation/contracts";
import type {
  LocalCoordinationState,
  PendingSyncCommand,
} from "@constellation/local-store";

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

export const coordinatedSnapshotDigest = (
  snapshot: HubWorkspaceSnapshot,
): string => createHash("sha256").update(canonicalJson(snapshot)).digest("hex");

export const createHubWorkspaceSnapshot = (
  snapshot: ReferenceStateSnapshot,
): HubWorkspaceSnapshot =>
  HubWorkspaceSnapshotSchema.parse({
    format: "constellation.workspace-snapshot/v1",
    ...snapshot,
  });

const projection = (
  snapshot: HubWorkspaceSnapshot,
  workspaceId: WorkspaceId,
): ReferenceStateSnapshot => {
  const parsed = HubWorkspaceSnapshotSchema.parse(snapshot);
  if (
    parsed.workspaces.length !== 1 ||
    parsed.workspaces[0]?.id !== workspaceId
  ) {
    throw new Error("The Hub snapshot does not match the local workspace.");
  }
  const scoped = [
    ...parsed.spaces,
    ...parsed.memberships,
    ...parsed.taskStatuses,
    ...parsed.captures,
    ...parsed.tasks,
    ...parsed.projects,
    ...parsed.relations,
    ...parsed.events,
    ...parsed.auditReceipts,
    ...parsed.outboxEntries,
  ];
  if (scoped.some((value) => value.workspaceId !== workspaceId)) {
    throw new Error("The Hub snapshot crosses a workspace boundary.");
  }
  const { format: _format, ...state } = parsed;
  void _format;
  return state as unknown as ReferenceStateSnapshot;
};

export interface CoordinatedProjectionStore {
  getCoordinationState(): LocalCoordinationState | undefined;
  listPendingSyncCommands(limit?: number): readonly PendingSyncCommand[];
  listUnknownSyncCommands(): readonly PendingSyncCommand[];
  recordSyncResult(input: {
    readonly commandId: string;
    readonly state: "accepted" | "conflict" | "rejected" | "unknown_reconcile";
    readonly outcome?: unknown;
    readonly updatedAt: string;
  }): void;
  replaceProjection(
    snapshot: ReferenceStateSnapshot,
    coordination: {
      readonly checkpoint: string;
      readonly snapshotDigest: string;
      readonly syncState: LocalCoordinationState["syncState"];
      readonly updatedAt: string;
    },
  ): void;
  retrySyncCommand(commandId: string): void;
  updateCoordinationState(input: {
    readonly checkpoint: string;
    readonly snapshotDigest: string;
    readonly syncState: LocalCoordinationState["syncState"];
    readonly updatedAt?: string;
    readonly errorCode?: string;
  }): void;
}

export interface HubTransport {
  reconcileCommand(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly commandId: string;
  }): Promise<HubReconcileCommandResult>;
  sync(credential: string, request: HubSyncRequest): Promise<HubSyncResult>;
}

export class HttpHubTransport implements HubTransport {
  private readonly origin: string;

  public constructor(
    origin: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(origin);
    const loopback = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
      throw new Error("A Hub URL must use HTTPS outside loopback development.");
    }
    this.origin = url.origin;
  }

  private async post(
    path: string,
    credential: string,
    body: unknown,
  ): Promise<unknown> {
    const response = await this.fetcher(`${this.origin}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`Hub request failed with ${response.status}.`);
    return response.json() as Promise<unknown>;
  }

  public async reconcileCommand(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly commandId: string;
  }): Promise<HubReconcileCommandResult> {
    return HubReconcileCommandResultSchema.parse(
      await this.post("/v1/reconcile-command", input.credential, {
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        commandId: input.commandId,
      }),
    );
  }

  public async sync(
    credential: string,
    request: HubSyncRequest,
  ): Promise<HubSyncResult> {
    return HubSyncResultSchema.parse(
      await this.post("/v1/sync", credential, request),
    );
  }

  public async uploadAttachment(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly bytes: Uint8Array;
  }): Promise<{ readonly digest: string; readonly byteLength: number }> {
    if (input.bytes.byteLength < 1 || input.bytes.byteLength > 1_073_741_824) {
      throw new Error("Attachment length is outside the Hub limit.");
    }
    const digest = createHash("sha256").update(input.bytes).digest("hex");
    let upload = HubAttachmentUploadSchema.parse(
      await this.post("/v1/attachments/uploads", input.credential, {
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        contentSha256: digest,
        byteLength: input.bytes.byteLength,
      }),
    );
    while (
      upload.state === "staging" &&
      upload.receivedBytes < input.bytes.byteLength
    ) {
      const end = Math.min(
        upload.receivedBytes + 8 * 1024 * 1024,
        input.bytes.byteLength,
      );
      const response = await this.fetcher(
        `${this.origin}/v1/attachments/uploads/${upload.uploadId}?workspaceId=${input.workspaceId}&deviceId=${input.deviceId}`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${input.credential}`,
            "content-type": "application/octet-stream",
            "upload-offset": String(upload.receivedBytes),
          },
          body: input.bytes.slice(upload.receivedBytes, end),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Hub attachment upload failed with ${response.status}.`,
        );
      upload = HubAttachmentUploadSchema.parse(await response.json());
    }
    if (upload.state !== "published") {
      upload = HubAttachmentUploadSchema.parse(
        await this.post(
          `/v1/attachments/uploads/${upload.uploadId}/publish`,
          input.credential,
          {
            workspaceId: input.workspaceId,
            deviceId: input.deviceId,
          },
        ),
      );
    }
    if (upload.state !== "published")
      throw new Error("Hub did not publish the attachment.");
    return { digest, byteLength: input.bytes.byteLength };
  }

  public async downloadAttachment(input: {
    readonly credential: string;
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly digest: string;
  }): Promise<Uint8Array> {
    if (!/^[0-9a-f]{64}$/u.test(input.digest))
      throw new Error("Attachment digest is invalid.");
    const response = await this.fetcher(
      `${this.origin}/v1/attachments/${input.digest}?workspaceId=${input.workspaceId}&deviceId=${input.deviceId}`,
      {
        headers: { authorization: `Bearer ${input.credential}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Hub attachment download failed with ${response.status}.`,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== input.digest) {
      throw new Error("Downloaded attachment digest does not match.");
    }
    return bytes;
  }
}

export interface CoordinatedSyncResult {
  readonly state: LocalCoordinationState["syncState"];
  readonly checkpoint: string;
  readonly accepted: number;
  readonly conflicts: number;
}

export class CoordinatedSyncEngine {
  public constructor(
    private readonly input: {
      readonly workspaceId: WorkspaceId;
      readonly deviceId: DeviceId;
      readonly credential: string;
      readonly store: CoordinatedProjectionStore;
      readonly transport: HubTransport;
      readonly now?: () => string;
    },
  ) {}

  public async syncNow(): Promise<CoordinatedSyncResult> {
    const state = this.input.store.getCoordinationState();
    if (state === undefined)
      throw new Error("Coordinated Data Home is not configured.");
    const now = this.input.now ?? (() => new Date().toISOString());
    const unknown = this.input.store.listUnknownSyncCommands();
    try {
      for (const item of unknown) {
        const reconciled = await this.input.transport.reconcileCommand({
          credential: this.input.credential,
          workspaceId: this.input.workspaceId,
          deviceId: this.input.deviceId,
          commandId: item.command.commandId,
        });
        if (reconciled.outcome === "not_found") {
          this.input.store.retrySyncCommand(item.command.commandId);
        } else {
          const outcomeState =
            reconciled.receipt.outcome.outcome === "success"
              ? "accepted"
              : reconciled.receipt.outcome.outcome === "conflict"
                ? "conflict"
                : "rejected";
          this.input.store.recordSyncResult({
            commandId: item.command.commandId,
            state: outcomeState,
            outcome: reconciled.receipt.outcome,
            updatedAt: now(),
          });
        }
      }

      const pending = this.input.store.listPendingSyncCommands(50);
      this.input.store.updateCoordinationState({
        checkpoint: state.checkpoint,
        snapshotDigest: state.snapshotDigest,
        syncState: "syncing",
      });
      const result = await this.input.transport.sync(this.input.credential, {
        protocolVersion: 1,
        workspaceId: this.input.workspaceId,
        deviceId: this.input.deviceId,
        checkpoint: state.checkpoint,
        commands: pending.map((item) => item.command),
      });
      if (result.outcome === "rejected") {
        const syncState =
          result.code === "device_revoked" ? "revoked" : "offline";
        this.input.store.updateCoordinationState({
          checkpoint: state.checkpoint,
          snapshotDigest: state.snapshotDigest,
          syncState,
          errorCode: result.code,
        });
        return {
          state: syncState,
          checkpoint: state.checkpoint,
          accepted: 0,
          conflicts: 0,
        };
      }
      let accepted = 0;
      let conflicts = 0;
      for (const receipt of result.receipts) {
        const receiptState =
          receipt.outcome.outcome === "success"
            ? "accepted"
            : receipt.outcome.outcome === "conflict"
              ? "conflict"
              : "rejected";
        if (receiptState === "accepted") accepted += 1;
        if (receiptState === "conflict") conflicts += 1;
        this.input.store.recordSyncResult({
          commandId: receipt.commandId,
          state: receiptState,
          outcome: receipt.outcome,
          updatedAt: now(),
        });
      }
      const finalState = conflicts > 0 ? "conflict" : "current";
      if (result.change !== undefined) {
        if (
          coordinatedSnapshotDigest(result.change.snapshot) !==
          result.change.digest
        ) {
          throw new Error("Hub snapshot digest mismatch.");
        }
        this.input.store.replaceProjection(
          projection(result.change.snapshot, this.input.workspaceId),
          {
            checkpoint: result.change.checkpoint,
            snapshotDigest: result.change.digest,
            syncState: finalState,
            updatedAt: now(),
          },
        );
      } else {
        this.input.store.updateCoordinationState({
          checkpoint: result.currentCheckpoint,
          snapshotDigest: state.snapshotDigest,
          syncState: finalState,
          updatedAt: now(),
        });
      }
      return {
        state: finalState,
        checkpoint: result.currentCheckpoint,
        accepted,
        conflicts,
      };
    } catch (error) {
      const pending = this.input.store.listPendingSyncCommands(50);
      for (const item of pending) {
        this.input.store.recordSyncResult({
          commandId: item.command.commandId,
          state: "unknown_reconcile",
          updatedAt: now(),
        });
      }
      const syncState = pending.length > 0 ? "unknown_reconcile" : "offline";
      this.input.store.updateCoordinationState({
        checkpoint: state.checkpoint,
        snapshotDigest: state.snapshotDigest,
        syncState,
        errorCode: error instanceof Error ? "hub_unreachable" : "hub_unknown",
      });
      return {
        state: syncState,
        checkpoint: state.checkpoint,
        accepted: 0,
        conflicts: 0,
      };
    }
  }
}
