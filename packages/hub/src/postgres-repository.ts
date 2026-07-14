import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CommandOutcomeSchema,
  DeviceIdSchema,
  ExecutionContextSchema,
  HubWorkspaceSnapshotSchema,
  WorkspaceIdSchema,
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

const bigint = (row: Record<string, unknown>, key: string): bigint => {
  const value = row[key];
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`PostgreSQL ${key} is invalid.`);
  }
  return BigInt(value);
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
    try {
      await client.query(await readInitialHubMigration());
      const result = await client.query(
        "SELECT schema_version FROM constellation_hub_meta WHERE singleton = true",
      );
      if (result.rowCount !== 1 || result.rows[0]?.schema_version !== 1) {
        throw new Error("Unsupported Constellation Hub schema version.");
      }
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async createWorkspace(input: HubWorkspaceState): Promise<void> {
    await this.pool.query(
      "INSERT INTO constellation_hub_workspaces (workspace_id, checkpoint, snapshot, snapshot_digest) VALUES ($1, $2, $3::jsonb, $4)",
      [
        input.workspaceId,
        input.checkpoint.toString(),
        JSON.stringify(input.snapshot),
        input.snapshotDigest,
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
        "SELECT workspace_id::text, checkpoint::text, snapshot, snapshot_digest FROM constellation_hub_workspaces WHERE workspace_id = $1 FOR UPDATE",
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
      };
      const before = new Set(state.receipts.keys());
      const output = await work(state);
      await client.query(
        "UPDATE constellation_hub_workspaces SET checkpoint = $2, snapshot = $3::jsonb, snapshot_digest = $4, updated_at = now() WHERE workspace_id = $1",
        [
          workspaceId,
          state.checkpoint.toString(),
          JSON.stringify(state.snapshot),
          state.snapshotDigest,
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
}
