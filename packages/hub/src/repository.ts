import type {
  CommandOutcome,
  DeviceId,
  ExecutionContext,
  HubCheckpoint,
  HubWorkspaceSnapshot,
  WorkspaceId,
  DocumentId,
  DocumentRevisionId,
  PrincipalId,
  SpaceId,
  CorrelationId,
} from "@constellation/contracts";
import type {
  AgentAccessGrant,
  AgentCheckpoint,
  AgentHandoff,
  AgentRun,
  SpaceGrant,
  WorkspaceMembership,
} from "@constellation/domain";

export interface HubRemoteAgentState {
  readonly grants: AgentAccessGrant[];
  readonly memberships: WorkspaceMembership[];
  readonly spaceGrants: SpaceGrant[];
  readonly runs: AgentRun[];
  readonly checkpoints: AgentCheckpoint[];
  readonly handoffs: AgentHandoff[];
  readonly federationScopes: Record<
    string,
    {
      readonly crossWorkspaceRead: boolean;
      readonly derivedResultWrite: boolean;
      readonly sourceMaterialization: boolean;
    }
  >;
}

export const emptyHubRemoteAgentState = (): HubRemoteAgentState => ({
  grants: [],
  memberships: [],
  spaceGrants: [],
  runs: [],
  checkpoints: [],
  handoffs: [],
  federationScopes: {},
});

export const parseHubRemoteAgentState = (
  value: unknown,
): HubRemoteAgentState => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid remote agent state.");
  const candidate = value as Record<string, unknown>;
  for (const key of [
    "grants",
    "memberships",
    "spaceGrants",
    "runs",
    "checkpoints",
    "handoffs",
  ] as const) {
    if (
      !Array.isArray(candidate[key]) ||
      candidate[key].some(
        (record) =>
          record === null ||
          typeof record !== "object" ||
          Array.isArray(record),
      )
    )
      throw new Error("Invalid remote agent state.");
  }
  const scopes = candidate.federationScopes;
  if (scopes === null || typeof scopes !== "object" || Array.isArray(scopes))
    throw new Error("Invalid remote agent state.");
  for (const scope of Object.values(scopes)) {
    if (
      scope === null ||
      typeof scope !== "object" ||
      Array.isArray(scope) ||
      typeof (scope as Record<string, unknown>).crossWorkspaceRead !==
        "boolean" ||
      typeof (scope as Record<string, unknown>).derivedResultWrite !==
        "boolean" ||
      typeof (scope as Record<string, unknown>).sourceMaterialization !==
        "boolean"
    )
      throw new Error("Invalid remote agent state.");
  }
  return candidate as unknown as HubRemoteAgentState;
};

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
  remoteAgents?: HubRemoteAgentState;
}

export interface HubDocumentState {
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly documentId: DocumentId;
  readonly engine: "yjs-13";
  readonly state: Uint8Array;
  readonly updatedAt: string;
}

export interface HubDocumentRevision {
  readonly id: DocumentRevisionId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly documentId: DocumentId;
  readonly name: string;
  readonly engine: "yjs-13";
  readonly state: Uint8Array;
  readonly stateVector: Uint8Array;
  readonly createdBy: PrincipalId;
  readonly createdByDeviceId: DeviceId;
  readonly correlationId: CorrelationId;
  readonly createdAt: string;
  readonly restoredFromRevisionId?: DocumentRevisionId;
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
  loadDocumentState(input: {
    readonly workspaceId: WorkspaceId;
    readonly documentId: DocumentId;
  }): Promise<HubDocumentState | undefined>;
  storeDocumentState(state: HubDocumentState): Promise<void>;
  createDocumentRevision(revision: HubDocumentRevision): Promise<void>;
  listDocumentRevisions(input: {
    readonly workspaceId: WorkspaceId;
    readonly documentId: DocumentId;
  }): Promise<readonly HubDocumentRevision[]>;
}

export class InMemoryHubRepository implements HubRepository {
  private readonly workspaces = new Map<WorkspaceId, HubWorkspaceState>();
  private readonly enrollments = new Map<string, HubEnrollmentGrant>();
  private readonly devices = new Map<string, HubDeviceGrant>();
  private readonly locks = new Map<WorkspaceId, Promise<void>>();
  private readonly documentStates = new Map<string, HubDocumentState>();
  private readonly documentRevisions = new Map<string, HubDocumentRevision>();

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

  public async loadDocumentState(input: {
    readonly workspaceId: WorkspaceId;
    readonly documentId: DocumentId;
  }): Promise<HubDocumentState | undefined> {
    return this.documentStates.get(`${input.workspaceId}:${input.documentId}`);
  }

  public async storeDocumentState(state: HubDocumentState): Promise<void> {
    this.documentStates.set(`${state.workspaceId}:${state.documentId}`, {
      ...state,
      state: state.state.slice(),
    });
  }

  public async createDocumentRevision(
    revision: HubDocumentRevision,
  ): Promise<void> {
    if (this.documentRevisions.has(revision.id)) {
      throw new Error("Document revision already exists.");
    }
    this.documentRevisions.set(revision.id, {
      ...revision,
      state: revision.state.slice(),
      stateVector: revision.stateVector.slice(),
    });
  }

  public async listDocumentRevisions(input: {
    readonly workspaceId: WorkspaceId;
    readonly documentId: DocumentId;
  }): Promise<readonly HubDocumentRevision[]> {
    return [...this.documentRevisions.values()]
      .filter(
        (revision) =>
          revision.workspaceId === input.workspaceId &&
          revision.documentId === input.documentId,
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id),
      );
  }
}
