import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CommandOutcomeSchema,
  CollaborativeContentOwnerSchema,
  CorrelationIdSchema,
  DocumentRevisionIdSchema,
  DeviceIdSchema,
  ExecutionContextSchema,
  HubWorkspaceSnapshotSchema,
  WorkspaceIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
} from "@constellation/contracts";
import { Pool, type PoolClient } from "pg";

import type {
  DeviceAuthentication,
  EnrollmentClaim,
  HubDeviceGrant,
  HubEnrollmentGrant,
  HubRepository,
  HubStoredReceipt,
  HubWorkspaceState,
  HubDocumentState,
  HubDocumentRevision,
  HubCollaborativeContentState,
  HubCollaborativeContentRevision,
} from "./repository.js";
import {
  emptyHubRemoteAgentState,
  parseHubRemoteAgentState,
} from "./repository.js";

const object = (value: unknown, context: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} is not an object.`);
  }
  return value as Record<string, unknown>;
};

const text = (row: Record<string, unknown>, key: string): string => {
  const value = row[key];
  if (typeof value !== "string")
    throw new Error(`PostgreSQL ${key} is invalid.`);
  return value;
};

const optionalText = (
  row: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string")
    throw new Error(`PostgreSQL ${key} is invalid.`);
  return value;
};

const contentOwnerId = (
  owner: HubCollaborativeContentState["owner"],
): string => (owner.kind === "document" ? owner.documentId : owner.projectId);

const bigint = (row: Record<string, unknown>, key: string): bigint => {
  const value = row[key];
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`PostgreSQL ${key} is invalid.`);
  }
  return BigInt(value);
};

const bytes = (row: Record<string, unknown>, key: string): Uint8Array => {
  const value = row[key];
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new Error(`PostgreSQL ${key} is invalid.`);
  }
  return value.slice();
};

const sameDigest = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

const parseDevice = (rowValue: unknown): HubDeviceGrant => {
  const row = object(rowValue, "device row");
  const revokedAt = optionalText(row, "revoked_at");
  return {
    workspaceId: WorkspaceIdSchema.parse(row.workspace_id),
    deviceId: DeviceIdSchema.parse(row.device_id),
    label: text(row, "label"),
    authorization: ExecutionContextSchema.parse(row.auth_context),
    credentialDigest: text(row, "credential_digest").trim(),
    checkpoint: bigint(row, "checkpoint"),
    ...(revokedAt === undefined ? {} : { revokedAt }),
    purgeRequested: row.purge_requested === true,
  };
};

const loadReceipts = async (
  client: PoolClient,
  workspaceId: string,
): Promise<Map<string, HubStoredReceipt>> => {
  const result = await client.query(
    "SELECT command_id::text, outcome, checkpoint::text FROM constellation_hub_command_receipts WHERE workspace_id = $1",
    [workspaceId],
  );
  return new Map(
    result.rows.map((raw) => {
      const row = object(raw, "receipt row");
      const commandId = text(row, "command_id");
      const checkpoint = optionalText(row, "checkpoint");
      return [
        commandId,
        {
          commandId,
          outcome: CommandOutcomeSchema.parse(row.outcome),
          ...(checkpoint === undefined ? {} : { checkpoint }),
        },
      ];
    }),
  );
};

export const readInitialHubMigration = async (): Promise<string> => {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, "../../migrations/001-initial.sql"),
    path.resolve(moduleDirectory, "../migrations/001-initial.sql"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // Try the source and packaged layouts before failing.
    }
  }
  throw new Error("The Hub PostgreSQL migration is unavailable.");
};

export const HUB_SCHEMA_VERSION = 2;

const HUB_MIGRATION_ADVISORY_LOCK = "734584493293639104";

const readHubSchemaVersion = async (
  client: PoolClient,
): Promise<number | undefined> => {
  const relation = await client.query<{ meta_table: string | null }>(
    "SELECT to_regclass('public.constellation_hub_meta')::text AS meta_table",
  );
  if (relation.rows[0]?.meta_table === null) return undefined;

  const result = await client.query<{ schema_version: number }>(
    "SELECT schema_version FROM constellation_hub_meta WHERE singleton = true",
  );
  const version = result.rows[0]?.schema_version;
  if (
    result.rowCount !== 1 ||
    !Number.isSafeInteger(version) ||
    version === undefined
  ) {
    throw new Error("Constellation Hub schema metadata is invalid.");
  }
  return version;
};

export class PostgresHubRepository implements HubRepository {
  public constructor(private readonly pool: Pool) {}

  public static create(connectionString: string): PostgresHubRepository {
    return new PostgresHubRepository(
      new Pool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
      }),
    );
  }

  public async migrate(): Promise<void> {
    const client = await this.pool.connect();
    let locked = false;
    let reusable = true;
    let failure: unknown;
    try {
      await client.query("SELECT pg_advisory_lock($1::bigint)", [
        HUB_MIGRATION_ADVISORY_LOCK,
      ]);
      locked = true;
      const sourceVersion = await readHubSchemaVersion(client);
      if (
        sourceVersion !== undefined &&
        (sourceVersion < 1 || sourceVersion > HUB_SCHEMA_VERSION)
      ) {
        throw new Error(
          `Unsupported Constellation Hub schema version ${sourceVersion}; this build supports versions 1 through ${HUB_SCHEMA_VERSION}.`,
        );
      }
      await client.query(await readInitialHubMigration());
      const migratedVersion = await readHubSchemaVersion(client);
      if (migratedVersion !== HUB_SCHEMA_VERSION) {
        throw new Error("Unsupported Constellation Hub schema version.");
      }
    } catch (error) {
      failure = error;
      try {
        // The migration file owns its transaction. If any statement fails,
        // PostgreSQL keeps the session aborted until an explicit rollback;
        // preserve the original migration error while making unlock possible.
        await client.query("ROLLBACK");
      } catch {
        reusable = false;
      }
    }
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [
          HUB_MIGRATION_ADVISORY_LOCK,
        ]);
      }
    } catch (error) {
      reusable = false;
      if (failure === undefined) failure = error;
    } finally {
      client.release(!reusable);
    }
    if (failure !== undefined) throw failure;
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async createWorkspace(input: HubWorkspaceState): Promise<void> {
    await this.pool.query(
      "INSERT INTO constellation_hub_workspaces (workspace_id, checkpoint, snapshot, snapshot_digest, remote_agent_state) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)",
      [
        input.workspaceId,
        input.checkpoint.toString(),
        JSON.stringify(input.snapshot),
        input.snapshotDigest,
        JSON.stringify(input.remoteAgents ?? emptyHubRemoteAgentState()),
      ],
    );
  }

  public async createEnrollment(grant: HubEnrollmentGrant): Promise<void> {
    await this.pool.query(
      "INSERT INTO constellation_hub_enrollments (enrollment_id, workspace_id, auth_context, secret_digest, expires_at) VALUES ($1, $2, $3::jsonb, $4, $5)",
      [
        grant.id,
        grant.workspaceId,
        JSON.stringify(grant.authorization),
        grant.secretDigest,
        grant.expiresAt,
      ],
    );
  }

  public async claimEnrollment(input: {
    readonly workspaceId: HubEnrollmentGrant["workspaceId"];
    readonly deviceId: HubDeviceGrant["deviceId"];
    readonly deviceLabel: string;
    readonly secretDigest: string;
    readonly credentialDigest: string;
    readonly now: string;
  }): Promise<EnrollmentClaim> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const enrollment = await client.query(
        "SELECT enrollment_id::text, workspace_id::text, auth_context, secret_digest, expires_at::text, used_at::text FROM constellation_hub_enrollments WHERE secret_digest = $1 FOR UPDATE",
        [input.secretDigest],
      );
      if (enrollment.rowCount !== 1) {
        await client.query("ROLLBACK");
        return { outcome: "rejected", code: "enrollment_invalid" };
      }
      const row = object(enrollment.rows[0], "enrollment row");
      if (text(row, "workspace_id") !== input.workspaceId) {
        await client.query("ROLLBACK");
        return { outcome: "rejected", code: "enrollment_invalid" };
      }
      if (optionalText(row, "used_at") !== undefined) {
        await client.query("ROLLBACK");
        return { outcome: "rejected", code: "enrollment_used" };
      }
      if (Date.parse(text(row, "expires_at")) <= Date.parse(input.now)) {
        await client.query("ROLLBACK");
        return { outcome: "rejected", code: "enrollment_expired" };
      }
      const existing = await client.query(
        "SELECT 1 FROM constellation_hub_devices WHERE workspace_id = $1 AND device_id = $2",
        [input.workspaceId, input.deviceId],
      );
      if ((existing.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return { outcome: "rejected", code: "device_already_enrolled" };
      }
      const authorization = ExecutionContextSchema.parse(row.auth_context);
      await client.query(
        "INSERT INTO constellation_hub_devices (workspace_id, device_id, label, auth_context, credential_digest) VALUES ($1, $2, $3, $4::jsonb, $5)",
        [
          input.workspaceId,
          input.deviceId,
          input.deviceLabel,
          JSON.stringify(authorization),
          input.credentialDigest,
        ],
      );
      await client.query(
        "UPDATE constellation_hub_enrollments SET used_at = $1 WHERE enrollment_id = $2",
        [input.now, text(row, "enrollment_id")],
      );
      await client.query("COMMIT");
      return {
        outcome: "success",
        grant: {
          id: text(row, "enrollment_id"),
          workspaceId: input.workspaceId,
          authorization,
          secretDigest: text(row, "secret_digest").trim(),
          expiresAt: text(row, "expires_at"),
          usedAt: input.now,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async authenticate(input: {
    readonly workspaceId: HubDeviceGrant["workspaceId"];
    readonly deviceId: HubDeviceGrant["deviceId"];
    readonly credentialDigest: string;
  }): Promise<DeviceAuthentication> {
    const result = await this.pool.query(
      "SELECT workspace_id::text, device_id, label, auth_context, credential_digest, checkpoint::text, revoked_at::text, purge_requested FROM constellation_hub_devices WHERE workspace_id = $1 AND device_id = $2",
      [input.workspaceId, input.deviceId],
    );
    if (result.rowCount !== 1) {
      return {
        outcome: "rejected",
        code: "credential_invalid",
        purgeLocalProjection: false,
      };
    }
    const device = parseDevice(result.rows[0]);
    if (!sameDigest(device.credentialDigest, input.credentialDigest)) {
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
    workspaceId: HubWorkspaceState["workspaceId"],
    work: (state: HubWorkspaceState) => Promise<Result> | Result,
  ): Promise<Result> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT workspace_id::text, checkpoint::text, snapshot, snapshot_digest, remote_agent_state FROM constellation_hub_workspaces WHERE workspace_id = $1 FOR UPDATE",
        [workspaceId],
      );
      if (result.rowCount !== 1)
        throw new Error("Hub workspace does not exist.");
      const row = object(result.rows[0], "workspace row");
      const state: HubWorkspaceState = {
        workspaceId: WorkspaceIdSchema.parse(row.workspace_id),
        checkpoint: bigint(row, "checkpoint"),
        snapshot: HubWorkspaceSnapshotSchema.parse(row.snapshot),
        snapshotDigest: text(row, "snapshot_digest").trim(),
        receipts: await loadReceipts(client, workspaceId),
        remoteAgents: parseHubRemoteAgentState(
          row.remote_agent_state ?? emptyHubRemoteAgentState(),
        ),
      };
      const before = new Set(state.receipts.keys());
      const output = await work(state);
      await client.query(
        "UPDATE constellation_hub_workspaces SET checkpoint = $2, snapshot = $3::jsonb, snapshot_digest = $4, remote_agent_state = $5::jsonb, updated_at = now() WHERE workspace_id = $1",
        [
          workspaceId,
          state.checkpoint.toString(),
          JSON.stringify(state.snapshot),
          state.snapshotDigest,
          JSON.stringify(state.remoteAgents ?? emptyHubRemoteAgentState()),
        ],
      );
      for (const receipt of state.receipts.values()) {
        if (before.has(receipt.commandId)) continue;
        await client.query(
          "INSERT INTO constellation_hub_command_receipts (workspace_id, command_id, outcome, checkpoint) VALUES ($1, $2, $3::jsonb, $4)",
          [
            workspaceId,
            receipt.commandId,
            JSON.stringify(receipt.outcome),
            receipt.checkpoint ?? null,
          ],
        );
      }
      await client.query("COMMIT");
      return output;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async updateDeviceCheckpoint(input: {
    readonly workspaceId: HubDeviceGrant["workspaceId"];
    readonly deviceId: HubDeviceGrant["deviceId"];
    readonly checkpoint: bigint;
  }): Promise<void> {
    await this.pool.query(
      "UPDATE constellation_hub_devices SET checkpoint = GREATEST(checkpoint, $3) WHERE workspace_id = $1 AND device_id = $2 AND revoked_at IS NULL",
      [input.workspaceId, input.deviceId, input.checkpoint.toString()],
    );
  }

  public async revokeDevice(input: {
    readonly workspaceId: HubDeviceGrant["workspaceId"];
    readonly deviceId: HubDeviceGrant["deviceId"];
    readonly revokedAt: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE constellation_hub_devices SET revoked_at = $3, purge_requested = true WHERE workspace_id = $1 AND device_id = $2 AND revoked_at IS NULL",
      [input.workspaceId, input.deviceId, input.revokedAt],
    );
    return result.rowCount === 1;
  }

  public async loadDocumentState(input: {
    readonly workspaceId: HubDocumentState["workspaceId"];
    readonly documentId: HubDocumentState["documentId"];
  }): Promise<HubDocumentState | undefined> {
    const state = await this.loadCollaborativeContentState({
      workspaceId: input.workspaceId,
      owner: { kind: "document", documentId: input.documentId },
    });
    return state === undefined
      ? undefined
      : {
          workspaceId: state.workspaceId,
          documentId: input.documentId,
          spaceId: state.spaceId,
          engine: state.engine,
          state: state.state,
          updatedAt: state.updatedAt,
        };
  }

  public async loadCollaborativeContentState(input: {
    readonly workspaceId: HubCollaborativeContentState["workspaceId"];
    readonly owner: HubCollaborativeContentState["owner"];
  }): Promise<HubCollaborativeContentState | undefined> {
    const result = await this.pool.query(
      "SELECT workspace_id::text, owner_kind, owner_id::text, space_id::text, engine, state, updated_at::text FROM constellation_hub_content WHERE workspace_id = $1 AND owner_kind = $2 AND owner_id = $3",
      [input.workspaceId, input.owner.kind, contentOwnerId(input.owner)],
    );
    if (result.rowCount !== 1) return undefined;
    const row = object(result.rows[0], "document state row");
    const owner = CollaborativeContentOwnerSchema.parse(
      row.owner_kind === "document"
        ? { kind: "document", documentId: row.owner_id }
        : { kind: "project", projectId: row.owner_id },
    );
    return {
      workspaceId: WorkspaceIdSchema.parse(row.workspace_id),
      owner,
      spaceId: SpaceIdSchema.parse(row.space_id),
      engine: "yjs-13",
      state: bytes(row, "state"),
      updatedAt: text(row, "updated_at"),
    };
  }

  public async storeDocumentState(state: HubDocumentState): Promise<void> {
    await this.storeCollaborativeContentState({
      workspaceId: state.workspaceId,
      owner: { kind: "document", documentId: state.documentId },
      spaceId: state.spaceId,
      engine: state.engine,
      state: state.state,
      updatedAt: state.updatedAt,
    });
  }

  public async storeCollaborativeContentState(
    state: HubCollaborativeContentState,
  ): Promise<void> {
    await this.pool.query(
      "INSERT INTO constellation_hub_content (workspace_id, owner_kind, owner_id, space_id, engine, state, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (workspace_id, owner_kind, owner_id) DO UPDATE SET space_id = EXCLUDED.space_id, engine = EXCLUDED.engine, state = EXCLUDED.state, updated_at = EXCLUDED.updated_at",
      [
        state.workspaceId,
        state.owner.kind,
        contentOwnerId(state.owner),
        state.spaceId,
        state.engine,
        Buffer.from(state.state),
        state.updatedAt,
      ],
    );
  }

  public async seedCollaborativeContentState(
    state: HubCollaborativeContentState,
  ): Promise<boolean> {
    const result = await this.pool.query(
      "INSERT INTO constellation_hub_content (workspace_id, owner_kind, owner_id, space_id, engine, state, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (workspace_id, owner_kind, owner_id) DO NOTHING RETURNING owner_id",
      [
        state.workspaceId,
        state.owner.kind,
        contentOwnerId(state.owner),
        state.spaceId,
        state.engine,
        Buffer.from(state.state),
        state.updatedAt,
      ],
    );
    return result.rowCount === 1;
  }

  public async createDocumentRevision(
    revision: HubDocumentRevision,
  ): Promise<void> {
    await this.createCollaborativeContentRevision({
      ...revision,
      owner: { kind: "document", documentId: revision.documentId },
    });
  }

  public async createCollaborativeContentRevision(
    revision: HubCollaborativeContentRevision,
  ): Promise<void> {
    await this.pool.query(
      "INSERT INTO constellation_hub_content_revisions (revision_id, workspace_id, owner_kind, owner_id, space_id, name, engine, state, state_vector, created_by, created_by_device_id, correlation_id, created_at, restored_from_revision_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
      [
        revision.id,
        revision.workspaceId,
        revision.owner.kind,
        contentOwnerId(revision.owner),
        revision.spaceId,
        revision.name,
        revision.engine,
        Buffer.from(revision.state),
        Buffer.from(revision.stateVector),
        revision.createdBy,
        revision.createdByDeviceId,
        revision.correlationId,
        revision.createdAt,
        revision.restoredFromRevisionId ?? null,
      ],
    );
  }

  public async listDocumentRevisions(input: {
    readonly workspaceId: HubDocumentRevision["workspaceId"];
    readonly documentId: HubDocumentRevision["documentId"];
  }): Promise<readonly HubDocumentRevision[]> {
    return (
      await this.listCollaborativeContentRevisions({
        workspaceId: input.workspaceId,
        owner: { kind: "document", documentId: input.documentId },
      })
    ).map((revision) => ({ ...revision, documentId: input.documentId }));
  }

  public async listCollaborativeContentRevisions(input: {
    readonly workspaceId: HubCollaborativeContentRevision["workspaceId"];
    readonly owner: HubCollaborativeContentRevision["owner"];
  }): Promise<readonly HubCollaborativeContentRevision[]> {
    const result = await this.pool.query(
      "SELECT revision_id::text, workspace_id::text, owner_kind, owner_id::text, space_id::text, name, engine, state, state_vector, created_by::text, created_by_device_id, correlation_id::text, created_at::text, restored_from_revision_id::text FROM constellation_hub_content_revisions WHERE workspace_id = $1 AND owner_kind = $2 AND owner_id = $3 ORDER BY created_at DESC, revision_id DESC",
      [input.workspaceId, input.owner.kind, contentOwnerId(input.owner)],
    );
    return result.rows.map((raw) => {
      const row = object(raw, "document revision row");
      const restoredFrom = optionalText(row, "restored_from_revision_id");
      const owner = CollaborativeContentOwnerSchema.parse(
        row.owner_kind === "document"
          ? { kind: "document", documentId: row.owner_id }
          : { kind: "project", projectId: row.owner_id },
      );
      return {
        id: DocumentRevisionIdSchema.parse(row.revision_id),
        workspaceId: WorkspaceIdSchema.parse(row.workspace_id),
        owner,
        spaceId: SpaceIdSchema.parse(row.space_id),
        name: text(row, "name"),
        engine: "yjs-13" as const,
        state: bytes(row, "state"),
        stateVector: bytes(row, "state_vector"),
        createdBy: PrincipalIdSchema.parse(row.created_by),
        createdByDeviceId: DeviceIdSchema.parse(row.created_by_device_id),
        correlationId: CorrelationIdSchema.parse(row.correlation_id),
        createdAt: text(row, "created_at"),
        ...(restoredFrom === undefined
          ? {}
          : {
              restoredFromRevisionId:
                DocumentRevisionIdSchema.parse(restoredFrom),
            }),
      };
    });
  }
}
