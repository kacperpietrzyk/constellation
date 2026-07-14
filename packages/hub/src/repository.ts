import type {
  CommandOutcome,
  DeviceId,
  ExecutionContext,
  HubCheckpoint,
  HubWorkspaceSnapshot,
  WorkspaceId,
} from "@constellation/contracts";

export interface HubStoredReceipt {
  readonly commandId: string;
  readonly outcome: CommandOutcome;
  readonly checkpoint?: HubCheckpoint;
}

export interface HubWorkspaceState {
  readonly workspaceId: WorkspaceId;
  checkpoint: bigint;
  snapshot: HubWorkspaceSnapshot;
  snapshotDigest: string;
  readonly receipts: Map<string, HubStoredReceipt>;
}

export interface HubEnrollmentGrant {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly authorization: ExecutionContext;
  readonly secretDigest: string;
  readonly expiresAt: string;
  usedAt?: string;
}

export interface HubDeviceGrant {
  readonly workspaceId: WorkspaceId;
  readonly deviceId: DeviceId;
  readonly label: string;
  readonly authorization: ExecutionContext;
  credentialDigest: string;
  checkpoint: bigint;
  revokedAt?: string;
  purgeRequested: boolean;
}

export type EnrollmentClaim =
  | { readonly outcome: "success"; readonly grant: HubEnrollmentGrant }
  | {
      readonly outcome: "rejected";
      readonly code:
        | "enrollment_invalid"
        | "enrollment_expired"
        | "enrollment_used"
        | "device_already_enrolled";
    };

export type DeviceAuthentication =
  | { readonly outcome: "success"; readonly device: HubDeviceGrant }
  | {
      readonly outcome: "rejected";
      readonly code:
        "credential_invalid" | "device_revoked" | "workspace_mismatch";
      readonly purgeLocalProjection: boolean;
    };

export interface HubRepository {
  createWorkspace(input: HubWorkspaceState): Promise<void>;
  createEnrollment(grant: HubEnrollmentGrant): Promise<void>;
  claimEnrollment(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly deviceLabel: string;
    readonly secretDigest: string;
    readonly credentialDigest: string;
    readonly now: string;
  }): Promise<EnrollmentClaim>;
  authenticate(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly credentialDigest: string;
  }): Promise<DeviceAuthentication>;
  withWorkspaceLock<Result>(
    workspaceId: WorkspaceId,
    work: (state: HubWorkspaceState) => Promise<Result> | Result,
  ): Promise<Result>;
  updateDeviceCheckpoint(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly checkpoint: bigint;
  }): Promise<void>;
  revokeDevice(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly revokedAt: string;
  }): Promise<boolean>;
}

export class InMemoryHubRepository implements HubRepository {
  private readonly workspaces = new Map<WorkspaceId, HubWorkspaceState>();
  private readonly enrollments = new Map<string, HubEnrollmentGrant>();
  private readonly devices = new Map<string, HubDeviceGrant>();
  private readonly locks = new Map<WorkspaceId, Promise<void>>();

  private deviceKey(workspaceId: WorkspaceId, deviceId: DeviceId): string {
    return `${workspaceId}:${deviceId}`;
  }

  public async createWorkspace(input: HubWorkspaceState): Promise<void> {
    if (this.workspaces.has(input.workspaceId)) {
      throw new Error("Hub workspace already exists.");
    }
    this.workspaces.set(input.workspaceId, input);
  }

  public async createEnrollment(grant: HubEnrollmentGrant): Promise<void> {
    if (this.enrollments.has(grant.secretDigest)) {
      throw new Error("Enrollment digest already exists.");
    }
    this.enrollments.set(grant.secretDigest, grant);
  }

  public async claimEnrollment(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly deviceLabel: string;
    readonly secretDigest: string;
    readonly credentialDigest: string;
    readonly now: string;
  }): Promise<EnrollmentClaim> {
    const grant = this.enrollments.get(input.secretDigest);
    if (grant === undefined || grant.workspaceId !== input.workspaceId) {
      return { outcome: "rejected", code: "enrollment_invalid" };
    }
    if (grant.usedAt !== undefined) {
      return { outcome: "rejected", code: "enrollment_used" };
    }
    if (Date.parse(grant.expiresAt) <= Date.parse(input.now)) {
      return { outcome: "rejected", code: "enrollment_expired" };
    }
    const key = this.deviceKey(input.workspaceId, input.deviceId);
    if (this.devices.has(key)) {
      return { outcome: "rejected", code: "device_already_enrolled" };
    }
    grant.usedAt = input.now;
    this.devices.set(key, {
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      label: input.deviceLabel,
      authorization: grant.authorization,
      credentialDigest: input.credentialDigest,
      checkpoint: 0n,
      purgeRequested: false,
    });
    return { outcome: "success", grant };
  }

  public async authenticate(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly credentialDigest: string;
  }): Promise<DeviceAuthentication> {
    const device = this.devices.get(
      this.deviceKey(input.workspaceId, input.deviceId),
    );
    if (
      device === undefined ||
      device.credentialDigest !== input.credentialDigest
    ) {
      return {
        outcome: "rejected",
        code: "credential_invalid",
        purgeLocalProjection: false,
      };
    }
    if (device.revokedAt !== undefined) {
      return {
        outcome: "rejected",
        code: "device_revoked",
        purgeLocalProjection: device.purgeRequested,
      };
    }
    return { outcome: "success", device };
  }

  public async withWorkspaceLock<Result>(
    workspaceId: WorkspaceId,
    work: (state: HubWorkspaceState) => Promise<Result> | Result,
  ): Promise<Result> {
    const previous = this.locks.get(workspaceId) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(workspaceId, queued);
    await previous;
    try {
      const state = this.workspaces.get(workspaceId);
      if (state === undefined) throw new Error("Hub workspace does not exist.");
      return await work(state);
    } finally {
      release();
      if (this.locks.get(workspaceId) === queued)
        this.locks.delete(workspaceId);
    }
  }

  public async updateDeviceCheckpoint(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly checkpoint: bigint;
  }): Promise<void> {
    const device = this.devices.get(
      this.deviceKey(input.workspaceId, input.deviceId),
    );
    if (device !== undefined && input.checkpoint > device.checkpoint) {
      device.checkpoint = input.checkpoint;
    }
  }

  public async revokeDevice(input: {
    readonly workspaceId: WorkspaceId;
    readonly deviceId: DeviceId;
    readonly revokedAt: string;
  }): Promise<boolean> {
    const device = this.devices.get(
      this.deviceKey(input.workspaceId, input.deviceId),
    );
    if (device === undefined) return false;
    device.revokedAt = input.revokedAt;
    device.purgeRequested = true;
    return true;
  }
}
