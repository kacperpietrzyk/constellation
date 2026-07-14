#!/usr/bin/env node
import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";

import {
  ExecutionContextSchema,
  DeviceIdSchema,
  HubWorkspaceSnapshotSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import { Pool } from "pg";

import { HubAttachmentService } from "./attachments.js";
import { PostgresHubRepository } from "./postgres-repository.js";
import { RealtimeDocumentGateway } from "./realtime-documents.js";
import { startHubServer, loadTlsOptions } from "./server.js";
import { HubService } from "./service.js";
import { HubRemoteMcpService } from "./remote-mcp.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new Error(`${name} is required.`);
  return value;
};

const main = async (): Promise<void> => {
  const command = process.argv[2] ?? "serve";
  const databaseUrl =
    process.env.CONSTELLATION_HUB_DATABASE_URL ??
    (
      await readFile(required("CONSTELLATION_HUB_DATABASE_URL_FILE"), "utf8")
    ).trim();
  const repository = PostgresHubRepository.create(databaseUrl);
  try {
    if (command === "migrate") {
      await repository.migrate();
      process.stdout.write("Constellation Hub schema is current.\n");
      return;
    }
    if (command === "doctor") {
      const root = required("CONSTELLATION_HUB_STORAGE_ROOT");
      await access(root, constants.R_OK | constants.W_OK);
      await repository.migrate();
      process.stdout.write(
        "Constellation Hub database and attachment storage are ready.\n",
      );
      return;
    }
    if (command === "init-workspace" || command === "create-enrollment") {
      await repository.migrate();
      const authorization = ExecutionContextSchema.parse(
        JSON.parse(
          await readFile(
            required("CONSTELLATION_HUB_AUTHORIZATION_FILE"),
            "utf8",
          ),
        ),
      );
      const workspaceId = WorkspaceIdSchema.parse(authorization.workspaceId);
      const service = new HubService(repository);
      if (command === "init-workspace") {
        const snapshotFile = process.env.CONSTELLATION_HUB_SNAPSHOT_FILE;
        const snapshot = HubWorkspaceSnapshotSchema.parse(
          snapshotFile === undefined
            ? {
                format: "constellation.workspace-snapshot/v1",
                workspaces: [],
                spaces: [],
                memberships: [],
                taskStatuses: [],
                captures: [],
                tasks: [],
                projects: [],
                relations: [],
                undoDescriptors: [],
                events: [],
                auditReceipts: [],
                idempotencyRecords: [],
                outboxEntries: [],
              }
            : JSON.parse(await readFile(snapshotFile, "utf8")),
        );
        await service.createWorkspace({ workspaceId, snapshot });
      }
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const enrollment = await service.createEnrollment({
        workspaceId,
        authorization,
        expiresAt,
      });
      process.stdout.write(
        `${JSON.stringify({ workspaceId, enrollmentSecret: enrollment.enrollmentSecret, expiresAt })}\n`,
      );
      return;
    }
    if (command === "revoke-device") {
      await repository.migrate();
      const workspaceId = WorkspaceIdSchema.parse(
        required("CONSTELLATION_HUB_WORKSPACE_ID"),
      );
      const deviceId = DeviceIdSchema.parse(
        required("CONSTELLATION_HUB_DEVICE_ID"),
      );
      const revoked = await new HubService(repository).revokeDevice({
        workspaceId,
        deviceId,
      });
      if (!revoked) throw new Error("Device was not found.");
      process.stdout.write(
        "Device access revoked; clients will purge the coordinated projection on their next contact.\n",
      );
      return;
    }
    if (command !== "serve") throw new Error(`Unknown Hub command: ${command}`);
    await repository.migrate();
    const storageRoot = required("CONSTELLATION_HUB_STORAGE_ROOT");
    await mkdir(storageRoot, { recursive: true, mode: 0o700 });
    const pool = new Pool({ connectionString: databaseUrl, max: 10 });
    const service = new HubService(repository);
    const realtimeDocuments = new RealtimeDocumentGateway(service, repository);
    const certificatePath = process.env.CONSTELLATION_HUB_TLS_CERT;
    const privateKeyPath = process.env.CONSTELLATION_HUB_TLS_KEY;
    const tls =
      certificatePath !== undefined && privateKeyPath !== undefined
        ? await loadTlsOptions({ certificatePath, privateKeyPath })
        : undefined;
    const host = process.env.CONSTELLATION_HUB_HOST ?? "127.0.0.1";
    const server = await startHubServer({
      service,
      attachments: new HubAttachmentService(pool, repository, storageRoot),
      realtimeDocuments,
      remoteMcp: new HubRemoteMcpService(repository),
      host,
      port: Number(process.env.CONSTELLATION_HUB_PORT ?? "4318"),
      ...(tls === undefined
        ? {
            allowInsecureLoopback:
              process.env.CONSTELLATION_HUB_ALLOW_INSECURE_LOOPBACK === "1",
          }
        : { tls }),
      readiness: async () => {
        const result = await pool.query(
          "SELECT schema_version FROM constellation_hub_meta WHERE singleton = true",
        );
        return result.rows[0]?.schema_version === 2;
      },
      logger: (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`),
    });
    process.stdout.write(`Constellation Hub listening at ${server.origin}\n`);
    const stop = async (): Promise<void> => {
      await server.close();
      await pool.end();
      await repository.close();
    };
    process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
    process.once("SIGINT", () => void stop().then(() => process.exit(0)));
    await new Promise(() => undefined);
  } finally {
    if (command !== "serve") await repository.close();
  }
};

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Hub failed."}\n`,
  );
  process.exitCode = 1;
});
