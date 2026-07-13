import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  GENERATION_PUBLICATION_FAILPOINTS,
  GENERATION_PUBLICATION_IDS,
  GenerationPublicationError,
  createGenerationFaultBoundaryRecord,
  createGenerationPublicationFixture,
  getGenerationPublicationPaths,
  publishGenerationManifest,
  verifyGenerationPublicationState,
  writeCanonicalGenerationFile,
} from "../app/recovery/generation-publication.mjs";
import {
  applySyntheticGenerationMigration,
  installInitialGenerationIdentity,
  verifyGenerationDatabaseIdentity,
} from "../app/recovery/generation-verifier.mjs";

const sandboxRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "constellation-generation-fixture-"),
);
const SOURCE_BYTES = Buffer.from("encrypted-generation-one-fixture\n", "utf8");
const CANDIDATE_BYTES = Buffer.from(
  "encrypted-generation-two-fixture\n",
  "utf8",
);

function digest(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function digestFile(filename) {
  return digest(fs.readFileSync(filename));
}

function expectCode(callback, code) {
  assert.throws(
    callback,
    (error) =>
      error instanceof GenerationPublicationError && error.code === code,
  );
}

class NodeSqliteAdapter {
  #database;

  constructor(filename) {
    this.#database = new DatabaseSync(filename, { timeout: 5_000 });
  }

  get inTransaction() {
    return this.#database.isTransaction;
  }

  exec(sql) {
    return this.#database.exec(sql);
  }

  prepare(sql) {
    return this.#database.prepare(sql);
  }

  pragma(source, options = {}) {
    const rows = this.#database.prepare(`PRAGMA ${source}`).all();
    if (options.simple !== true) return rows;
    if (rows.length === 0) return undefined;
    const values = Object.values(rows[0]);
    assert.equal(values.length, 1);
    return values[0];
  }

  close() {
    this.#database.close();
  }
}

function snapshotTree(root) {
  const entries = [];
  function visit(target) {
    const relative = path.relative(root, target) || ".";
    const metadata = fs.lstatSync(target);
    if (metadata.isSymbolicLink()) {
      entries.push([relative, "symlink", fs.readlinkSync(target)]);
      return;
    }
    if (metadata.isDirectory()) {
      entries.push([relative, "directory"]);
      for (const name of fs.readdirSync(target).sort()) {
        visit(path.join(target, name));
      }
      return;
    }
    entries.push([relative, "file", metadata.size, digestFile(target)]);
  }
  visit(root);
  return JSON.stringify(entries);
}

function createWorkspace(slug) {
  const workspaceId = `workspace-generation-${slug}`;
  const workspaceRoot = path.join(sandboxRoot, slug);
  const operationId = GENERATION_PUBLICATION_IDS.operationId;
  const paths = getGenerationPublicationPaths(workspaceRoot, operationId);
  fs.mkdirSync(paths.sourceGenerationDirectoryPath, { recursive: true });
  fs.mkdirSync(paths.candidateGenerationDirectoryPath, { recursive: true });
  fs.mkdirSync(paths.operationDirectoryPath, { recursive: true });
  fs.writeFileSync(paths.wrapperPath, "wrapped-key-ciphertext-only\n", {
    flag: "wx",
    mode: 0o600,
  });
  fs.writeFileSync(paths.sourceDatabasePath, SOURCE_BYTES, {
    flag: "wx",
    mode: 0o600,
  });
  fs.writeFileSync(paths.candidateDatabasePath, CANDIDATE_BYTES, {
    flag: "wx",
    mode: 0o600,
  });
  const fixture = createGenerationPublicationFixture(
    workspaceId,
    digestFile(paths.wrapperPath),
  );
  writeCanonicalGenerationFile(paths.manifestPath, fixture.sourceManifest);
  writeCanonicalGenerationFile(
    paths.operationRecordPath,
    fixture.operationRecord,
  );
  const verifyGeneration = ({ databasePath, role }) => {
    if (role === "source") {
      assert.equal(digestFile(databasePath), digest(SOURCE_BYTES));
      return fixture.sourceIdentity;
    }
    assert.equal(role, "candidate");
    assert.equal(digestFile(databasePath), digest(CANDIDATE_BYTES));
    return fixture.candidateIdentity;
  };
  return {
    workspaceId,
    workspaceRoot,
    operationId,
    paths,
    fixture,
    verifyGeneration,
    options: {
      workspaceRoot,
      operationId,
      inputFingerprint: fixture.inputFingerprint,
      verifyGeneration,
      reachFailpoint: undefined,
    },
  };
}

function runFaultBoundary(failpoint, slug) {
  const workspace = createWorkspace(slug);
  const reached = new Error(`fixture-stop:${failpoint}`);
  assert.throws(
    () =>
      publishGenerationManifest({
        ...workspace.options,
        reachFailpoint: ({ failpoint: actual, state }) => {
          if (actual !== failpoint) return;
          const boundary = createGenerationFaultBoundaryRecord({
            processId: 42,
            failpoint: actual,
            state,
          });
          assert.equal(boundary.failpoint, failpoint);
          throw reached;
        },
      }),
    (error) => error === reached,
  );
  return workspace;
}

try {
  assert.deepEqual(GENERATION_PUBLICATION_FAILPOINTS, [
    "none",
    "after-temporary-manifest-synced",
    "after-manifest-replaced",
  ]);

  const beforeReplace = runFaultBoundary(
    "after-temporary-manifest-synced",
    "before-replace",
  );
  const sourceState = verifyGenerationPublicationState(beforeReplace.options);
  assert.equal(
    sourceState.activeGenerationId,
    GENERATION_PUBLICATION_IDS.sourceGenerationId,
  );
  assert.equal(sourceState.temporaryManifestPresent, true);
  assert.equal(sourceState.sourceGenerationPresent, true);
  assert.equal(sourceState.candidateGenerationPresent, true);
  const applied = publishGenerationManifest(beforeReplace.options);
  assert.equal(applied.kind, "applied");
  assert.deepEqual(applied.outcome, beforeReplace.fixture.publicationOutcome);
  const targetState = verifyGenerationPublicationState(beforeReplace.options);
  assert.equal(
    targetState.activeGenerationId,
    GENERATION_PUBLICATION_IDS.candidateGenerationId,
  );
  assert.equal(targetState.temporaryManifestPresent, false);
  const beforeReplay = snapshotTree(beforeReplace.workspaceRoot);
  const manifestStatBefore = fs.statSync(beforeReplace.paths.manifestPath, {
    bigint: true,
  });
  const replay = publishGenerationManifest(beforeReplace.options);
  const manifestStatAfter = fs.statSync(beforeReplace.paths.manifestPath, {
    bigint: true,
  });
  assert.equal(replay.kind, "replayed");
  assert.equal(snapshotTree(beforeReplace.workspaceRoot), beforeReplay);
  assert.equal(manifestStatAfter.mtimeNs, manifestStatBefore.mtimeNs);

  const conflictSnapshot = snapshotTree(beforeReplace.workspaceRoot);
  expectCode(
    () =>
      publishGenerationManifest({
        ...beforeReplace.options,
        inputFingerprint: beforeReplace.fixture.conflictInputFingerprint,
      }),
    "GENERATION_PUBLICATION_CONFLICT",
  );
  assert.equal(snapshotTree(beforeReplace.workspaceRoot), conflictSnapshot);

  const afterReplace = runFaultBoundary(
    "after-manifest-replaced",
    "after-replace",
  );
  const recoveredTarget = verifyGenerationPublicationState(
    afterReplace.options,
  );
  assert.equal(
    recoveredTarget.activeGenerationId,
    GENERATION_PUBLICATION_IDS.candidateGenerationId,
  );
  assert.equal(recoveredTarget.temporaryManifestPresent, false);
  const afterReplaceSnapshot = snapshotTree(afterReplace.workspaceRoot);
  assert.equal(
    publishGenerationManifest(afterReplace.options).kind,
    "replayed",
  );
  assert.equal(snapshotTree(afterReplace.workspaceRoot), afterReplaceSnapshot);

  const corruptTemp = createWorkspace("corrupt-temp");
  fs.writeFileSync(corruptTemp.paths.temporaryManifestPath, "not-json\n");
  const corruptTempManifestDigest = digestFile(corruptTemp.paths.manifestPath);
  expectCode(
    () => publishGenerationManifest(corruptTemp.options),
    "GENERATION_TEMPORARY_MANIFEST_INVALID",
  );
  assert.equal(
    digestFile(corruptTemp.paths.manifestPath),
    corruptTempManifestDigest,
  );

  const oversizedTemp = createWorkspace("oversized-temp");
  fs.writeFileSync(
    oversizedTemp.paths.temporaryManifestPath,
    Buffer.alloc(64 * 1024 + 1, 0x20),
  );
  expectCode(
    () => publishGenerationManifest(oversizedTemp.options),
    "GENERATION_TEMPORARY_MANIFEST_INVALID",
  );

  const missingCandidate = createWorkspace("missing-candidate");
  fs.rmSync(missingCandidate.paths.candidateDatabasePath);
  expectCode(
    () => verifyGenerationPublicationState(missingCandidate.options),
    "GENERATION_DATABASE_INVALID",
  );

  const corruptCandidate = createWorkspace("corrupt-candidate");
  fs.appendFileSync(corruptCandidate.paths.candidateDatabasePath, "corrupt");
  assert.throws(() =>
    verifyGenerationPublicationState(corruptCandidate.options),
  );

  const symlinkCandidate = createWorkspace("symlink-candidate");
  fs.rmSync(symlinkCandidate.paths.candidateDatabasePath);
  fs.symlinkSync(
    symlinkCandidate.paths.sourceDatabasePath,
    symlinkCandidate.paths.candidateDatabasePath,
  );
  expectCode(
    () => verifyGenerationPublicationState(symlinkCandidate.options),
    "GENERATION_DATABASE_INVALID",
  );

  for (const suffix of ["-wal", "-shm"]) {
    const symlinkSidecar = createWorkspace(
      `symlink-sidecar-${suffix.slice(1)}`,
    );
    fs.symlinkSync(
      symlinkSidecar.paths.sourceDatabasePath,
      `${symlinkSidecar.paths.candidateDatabasePath}${suffix}`,
    );
    expectCode(
      () => verifyGenerationPublicationState(symlinkSidecar.options),
      "GENERATION_DATABASE_SIDECAR_INVALID",
    );
  }

  const sourceReadSidecars = createWorkspace("source-read-sidecars");
  fs.writeFileSync(`${sourceReadSidecars.paths.sourceDatabasePath}-wal`, "");
  fs.writeFileSync(
    `${sourceReadSidecars.paths.sourceDatabasePath}-shm`,
    Buffer.alloc(32 * 1024),
  );
  assert.equal(
    verifyGenerationPublicationState(sourceReadSidecars.options)
      .sourceGenerationPresent,
    true,
  );

  const sourceWalFrames = createWorkspace("source-wal-frames");
  fs.writeFileSync(
    `${sourceWalFrames.paths.sourceDatabasePath}-wal`,
    "committed-or-uncommitted-frames",
  );
  expectCode(
    () => verifyGenerationPublicationState(sourceWalFrames.options),
    "GENERATION_DATABASE_SIDECAR_INVALID",
  );

  const sourceHardlinkWal = createWorkspace("source-hardlink-wal");
  const outsideSourceWal = path.join(sandboxRoot, "outside-source-wal");
  fs.writeFileSync(outsideSourceWal, "");
  fs.linkSync(
    outsideSourceWal,
    `${sourceHardlinkWal.paths.sourceDatabasePath}-wal`,
  );
  expectCode(
    () => verifyGenerationPublicationState(sourceHardlinkWal.options),
    "GENERATION_DATABASE_SIDECAR_INVALID",
  );

  const identityDatabase = new NodeSqliteAdapter(
    path.join(sandboxRoot, "generation-identity.db"),
  );
  try {
    installInitialGenerationIdentity(
      identityDatabase,
      beforeReplace.fixture.sourceIdentity,
    );
    assert.deepEqual(
      verifyGenerationDatabaseIdentity(identityDatabase, {
        expectedIdentity: beforeReplace.fixture.sourceIdentity,
        expectedIdentityDigest:
          beforeReplace.fixture.sourceGenerationIdentityDigest,
        expectMigration: false,
      }),
      beforeReplace.fixture.sourceIdentity,
    );
    let migrationTransactionBoundaryReached = false;
    applySyntheticGenerationMigration(
      identityDatabase,
      beforeReplace.fixture.candidateIdentity,
      {
        reachTransactionFailpoint: ({ failpoint, transactionOpen }) => {
          assert.equal(failpoint, "during-synthetic-migration");
          assert.equal(transactionOpen, true);
          assert.equal(identityDatabase.inTransaction, true);
          migrationTransactionBoundaryReached = true;
        },
      },
    );
    assert.equal(migrationTransactionBoundaryReached, true);
    assert.deepEqual(
      verifyGenerationDatabaseIdentity(identityDatabase, {
        expectedIdentity: beforeReplace.fixture.candidateIdentity,
        expectedIdentityDigest:
          beforeReplace.fixture.candidateGenerationIdentityDigest,
        expectMigration: true,
      }),
      beforeReplace.fixture.candidateIdentity,
    );
  } finally {
    identityDatabase.close();
  }

  const rollbackDatabase = new NodeSqliteAdapter(
    path.join(sandboxRoot, "generation-migration-rollback.db"),
  );
  try {
    installInitialGenerationIdentity(
      rollbackDatabase,
      beforeReplace.fixture.sourceIdentity,
    );
    expectCode(
      () =>
        applySyntheticGenerationMigration(
          rollbackDatabase,
          beforeReplace.fixture.candidateIdentity,
          {
            reachTransactionFailpoint: () => {
              throw new Error("forced-migration-stop");
            },
          },
        ),
      "GENERATION_MIGRATION_FAILED",
    );
    assert.equal(rollbackDatabase.inTransaction, false);
    assert.deepEqual(
      verifyGenerationDatabaseIdentity(rollbackDatabase, {
        expectedIdentity: beforeReplace.fixture.sourceIdentity,
        expectedIdentityDigest:
          beforeReplace.fixture.sourceGenerationIdentityDigest,
        expectMigration: false,
      }),
      beforeReplace.fixture.sourceIdentity,
    );
    for (const invalidOptions of [
      null,
      { extra: true },
      { reachTransactionFailpoint: true },
    ]) {
      expectCode(
        () =>
          applySyntheticGenerationMigration(
            rollbackDatabase,
            beforeReplace.fixture.candidateIdentity,
            invalidOptions,
          ),
        "GENERATION_MIGRATION_OPTIONS_INVALID",
      );
    }
    assert.deepEqual(
      verifyGenerationDatabaseIdentity(rollbackDatabase, {
        expectedIdentity: beforeReplace.fixture.sourceIdentity,
        expectedIdentityDigest:
          beforeReplace.fixture.sourceGenerationIdentityDigest,
        expectMigration: false,
      }),
      beforeReplace.fixture.sourceIdentity,
    );
  } finally {
    rollbackDatabase.close();
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      activationPivotSentinels: 2,
      manifestOnlyActivationVerified: true,
      exactReplayWithoutChurnVerified: true,
      conflictWithoutMutationVerified: true,
      malformedMissingCorruptSymlinkRejected: true,
      boundedSourceReadSidecarsAccepted: true,
      unsafeSourceSidecarsRejected: true,
      generationIdentityMigrationVerified: true,
      migrationTransactionFailpointVerified: true,
      migrationFailpointRollbackVerified: true,
      migrationOptionsFailClosedVerified: true,
      processCrashScopeOnly: true,
    })}\n`,
  );
} finally {
  fs.rmSync(sandboxRoot, { recursive: true, force: true });
  SOURCE_BYTES.fill(0);
  CANDIDATE_BYTES.fill(0);
}
