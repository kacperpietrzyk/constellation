import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { WorkspaceIdSchema } from "@constellation/contracts";

import {
  createRecoveryCode,
  extractWorkspaceBackup,
  publishWorkspaceBackupArchive,
  readWorkspaceBackupMetadata,
  WorkspaceBackupArchiveError,
} from "../src/workspace-backup-archive.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);

const withDirectory = (run: (directory: string) => void): void => {
  const directory = mkdtempSync(path.join(tmpdir(), "constellation-backup-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("portable workspace backup archive", () => {
  it("publishes and extracts authenticated encrypted database bytes", () => {
    withDirectory((directory) => {
      const databasePath = path.join(directory, "workspace-export.db");
      const archivePath = path.join(
        directory,
        "workspace.constellation-backup",
      );
      const restoredPath = path.join(directory, "restored.db");
      const database = randomBytes(8192);
      database.set(Buffer.from("not-a-plaintext-sqlite-header"), 0);
      writeFileSync(databasePath, database, { mode: 0o600 });
      const exportKey = randomBytes(32);
      const recovery = createRecoveryCode();
      const recoveryCode = recovery.code;
      const rawExportKey = Buffer.from(exportKey);
      const rawRecoveryKey = Buffer.from(recovery.key);

      const metadata = publishWorkspaceBackupArchive({
        filename: archivePath,
        databasePath,
        workspaceId,
        workspaceName: "Personal workspace",
        appVersion: "test",
        createdAt: "2026-07-14T10:00:00.000Z",
        exportKey,
        recoveryKey: recovery.key,
      });
      assert.equal(
        exportKey.every((byte) => byte === 0),
        true,
      );
      assert.equal(
        recovery.key.every((byte) => byte === 0),
        true,
      );
      assert.deepEqual(readWorkspaceBackupMetadata(archivePath), metadata);
      const archive = readFileSync(archivePath);
      assert.equal(archive.includes(Buffer.from(recoveryCode)), false);
      assert.equal(archive.includes(rawExportKey), false);
      assert.equal(archive.includes(rawRecoveryKey), false);

      const extracted = extractWorkspaceBackup({
        filename: archivePath,
        recoveryCode,
        destinationPath: restoredPath,
      });
      assert.deepEqual(extracted.metadata, metadata);
      assert.deepEqual(extracted.exportKey, rawExportKey);
      assert.deepEqual(readFileSync(restoredPath), database);
      extracted.exportKey.fill(0);
      rawExportKey.fill(0);
      rawRecoveryKey.fill(0);
      archive.fill(0);
      database.fill(0);
    });
  });

  it("rejects wrong recovery codes, tamper, and clobber attempts", () => {
    withDirectory((directory) => {
      const databasePath = path.join(directory, "workspace-export.db");
      const archivePath = path.join(
        directory,
        "workspace.constellation-backup",
      );
      const restoredPath = path.join(directory, "restored.db");
      writeFileSync(databasePath, randomBytes(4096), { mode: 0o600 });
      const recovery = createRecoveryCode();
      publishWorkspaceBackupArchive({
        filename: archivePath,
        databasePath,
        workspaceId,
        workspaceName: "Personal workspace",
        appVersion: "test",
        createdAt: "2026-07-14T10:00:00.000Z",
        exportKey: randomBytes(32),
        recoveryKey: recovery.key,
      });
      const wrong = createRecoveryCode();
      wrong.key.fill(0);
      assert.throws(
        () =>
          extractWorkspaceBackup({
            filename: archivePath,
            recoveryCode: wrong.code,
            destinationPath: restoredPath,
          }),
        (error: unknown) =>
          error instanceof WorkspaceBackupArchiveError &&
          error.code === "recovery_code_invalid",
      );
      assert.throws(
        () =>
          publishWorkspaceBackupArchive({
            filename: archivePath,
            databasePath,
            workspaceId,
            workspaceName: "Personal workspace",
            appVersion: "test",
            createdAt: "2026-07-14T10:00:00.000Z",
            exportKey: randomBytes(32),
            recoveryKey: randomBytes(32),
          }),
        (error: unknown) =>
          error instanceof WorkspaceBackupArchiveError &&
          error.code === "archive_exists",
      );

      const tampered = readFileSync(archivePath);
      const last = tampered.length - 1;
      tampered[last] = (tampered[last] ?? 0) ^ 0xff;
      writeFileSync(archivePath, tampered);
      assert.throws(
        () => readWorkspaceBackupMetadata(archivePath),
        WorkspaceBackupArchiveError,
      );
      tampered.fill(0);
    });
  });
});
