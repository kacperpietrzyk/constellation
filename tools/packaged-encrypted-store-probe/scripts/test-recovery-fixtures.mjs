import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  RECOVERY_CAPTURE_FAILPOINTS,
  RECOVERY_CAPTURE_FIXTURE,
  RecoveryCaptureFixtureError,
  bootstrapRecoveryCaptureSchema,
  canonicalJson,
  executeRecoveryCapture,
  getRecoveryCapturePlaintextCanaries,
  readRecoveryCaptureCounts,
} from "../app/recovery/capture-command.mjs";
import { readCanonicalRecoveryCaptureState } from "../app/recovery/capture-verifier.mjs";
import {
  createRecoveryFaultBoundaryRecord,
  inspectRecoveryWal,
  prepareRecoveryWalFaultBaseline,
  verifyPlaintextRecoveryWalControl,
} from "../app/recovery/failpoint.mjs";

function ensure(condition, code) {
  if (!condition) throw new Error(code);
}

const TEST_PRECOMMIT_ROWS = Object.freeze({
  "after-capture-row": Object.freeze({
    captures: 1,
    fts: 1,
    events: 0,
    audits: 0,
    idempotency: 0,
    outbox: 0,
  }),
  "after-event-row": Object.freeze({
    captures: 1,
    fts: 1,
    events: 1,
    audits: 0,
    idempotency: 0,
    outbox: 0,
  }),
  "after-audit-row": Object.freeze({
    captures: 1,
    fts: 1,
    events: 1,
    audits: 1,
    idempotency: 0,
    outbox: 0,
  }),
  "after-idempotency-row": Object.freeze({
    captures: 1,
    fts: 1,
    events: 1,
    audits: 1,
    idempotency: 1,
    outbox: 0,
  }),
  "after-outbox-row": Object.freeze({
    captures: 1,
    fts: 1,
    events: 1,
    audits: 1,
    idempotency: 1,
    outbox: 1,
  }),
});

class NodeSqliteAdapter {
  #database;
  #pageSizeOverride;

  constructor(filename, { pageSizeOverride } = {}) {
    ensure(
      pageSizeOverride === undefined || typeof pageSizeOverride === "string",
      "TEST_PAGE_SIZE_OVERRIDE_INVALID",
    );
    this.#database = new DatabaseSync(filename, { timeout: 5_000 });
    this.#pageSizeOverride = pageSizeOverride;
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
    ensure(values.length === 1, "TEST_PRAGMA_SHAPE_INVALID");
    if (source === "page_size" && this.#pageSizeOverride !== undefined) {
      return this.#pageSizeOverride;
    }
    return values[0];
  }

  close() {
    this.#database.close();
  }
}

function assertCounts(database, expected) {
  const counts = readRecoveryCaptureCounts(database);
  ensure(
    Object.values(counts).every((count) => count === expected),
    "TEST_ROW_COUNTS_INVALID",
  );
}

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "constellation-recovery-fixtures-"),
);
const databasePath = path.join(root, "fixture.db");
const walPath = `${databasePath}-wal`;
let database;
let missingProjectionDatabase;

try {
  const textPageSizeDatabase = new NodeSqliteAdapter(
    path.join(root, "text-page-size.db"),
    { pageSizeOverride: "4096" },
  );
  try {
    bootstrapRecoveryCaptureSchema(textPageSizeDatabase);
    const textPageSizeBaseline = prepareRecoveryWalFaultBaseline(
      textPageSizeDatabase,
      {
        walPath: path.join(root, "text-page-size.db-wal"),
        cacheSizePages: 8,
      },
    );
    ensure(
      textPageSizeBaseline.walPageSize === 4096,
      "TEST_TEXT_PAGE_SIZE_NOT_NORMALIZED",
    );
  } finally {
    textPageSizeDatabase.close();
  }

  for (const [index, malformedPageSize] of [
    " 4096",
    "04096",
    "+4096",
    "4096.0",
    "4096x",
  ].entries()) {
    const malformedPageSizeDatabase = new NodeSqliteAdapter(
      path.join(root, `malformed-page-size-${index}.db`),
      { pageSizeOverride: malformedPageSize },
    );
    try {
      bootstrapRecoveryCaptureSchema(malformedPageSizeDatabase);
      let malformedPageSizeRejected = false;
      try {
        prepareRecoveryWalFaultBaseline(malformedPageSizeDatabase, {
          walPath: path.join(root, `malformed-page-size-${index}.db-wal`),
          cacheSizePages: 8,
        });
      } catch (error) {
        malformedPageSizeRejected =
          error instanceof RecoveryCaptureFixtureError &&
          error.code === "RECOVERY_WAL_PAGE_SIZE_INVALID";
      }
      ensure(
        malformedPageSizeRejected,
        "TEST_MALFORMED_TEXT_PAGE_SIZE_ACCEPTED",
      );
    } finally {
      malformedPageSizeDatabase.close();
    }
  }

  missingProjectionDatabase = new NodeSqliteAdapter(
    path.join(root, "missing-fts-projection.db"),
  );
  bootstrapRecoveryCaptureSchema(missingProjectionDatabase);
  missingProjectionDatabase.exec("DROP TRIGGER recovery_captures_fts_insert");
  let missingProjectionBoundaryReached = false;
  let missingProjectionRejected = false;
  try {
    executeRecoveryCapture(missingProjectionDatabase, {
      failpoint: "after-capture-row",
      reachFailpoint: () => {
        missingProjectionBoundaryReached = true;
      },
    });
  } catch (error) {
    missingProjectionRejected =
      error instanceof RecoveryCaptureFixtureError &&
      error.code === "RECOVERY_FAILPOINT_ROWS_INVALID";
  }
  ensure(
    missingProjectionRejected &&
      !missingProjectionBoundaryReached &&
      !missingProjectionDatabase.inTransaction,
    "TEST_MISSING_FTS_PROJECTION_BOUNDARY_ACCEPTED",
  );
  assertCounts(missingProjectionDatabase, 0);
  missingProjectionDatabase.close();
  missingProjectionDatabase = undefined;

  database = new NodeSqliteAdapter(databasePath);
  bootstrapRecoveryCaptureSchema(database);
  assertCounts(database, 0);

  let baseline = prepareRecoveryWalFaultBaseline(database, {
    walPath,
    cacheSizePages: 8,
  });
  let beginBoundary;
  try {
    executeRecoveryCapture(database, {
      failpoint: "after-begin-immediate",
      reachFailpoint: ({ failpoint, visibleRows }) => {
        beginBoundary = createRecoveryFaultBoundaryRecord({
          database,
          walPath,
          failpoint,
          visibleRows,
          baseline,
          plaintextWalControlVerified: true,
        });
        throw new RecoveryCaptureFixtureError("TEST_BOUNDARY_REACHED");
      },
    });
  } catch (error) {
    ensure(
      error instanceof RecoveryCaptureFixtureError &&
        error.code === "TEST_BOUNDARY_REACHED",
      "TEST_BEGIN_FAILPOINT_FAILED",
    );
  }
  ensure(
    beginBoundary?.walFrames === 0 && !database.inTransaction,
    "TEST_BEGIN_BOUNDARY_INVALID",
  );
  assertCounts(database, 0);

  const spillFailpoints = RECOVERY_CAPTURE_FAILPOINTS.filter(
    (failpoint) =>
      failpoint !== "none" && failpoint !== "after-begin-immediate",
  );
  for (const failpoint of spillFailpoints) {
    baseline = prepareRecoveryWalFaultBaseline(database, {
      walPath,
      cacheSizePages: 8,
    });
    let boundaryReached = false;
    try {
      executeRecoveryCapture(database, {
        failpoint,
        reachFailpoint: ({ visibleRows }) => {
          ensure(
            canonicalJson(visibleRows) ===
              canonicalJson(TEST_PRECOMMIT_ROWS[failpoint]),
            `TEST_PRECOMMIT_ROWS_INVALID:${failpoint}`,
          );
          const wal = inspectRecoveryWal({
            walPath,
            expectedPageSize: baseline.walPageSize,
          });
          ensure(
            wal.walFrames > 0 && wal.walCommitFrames === 0,
            `TEST_PRECOMMIT_WAL_NOT_SPILLED:${failpoint}`,
          );
          boundaryReached = true;
          throw new RecoveryCaptureFixtureError(
            "TEST_PRECOMMIT_BOUNDARY_REACHED",
          );
        },
      });
    } catch (error) {
      ensure(
        error instanceof RecoveryCaptureFixtureError &&
          error.code === "TEST_PRECOMMIT_BOUNDARY_REACHED",
        `TEST_PRECOMMIT_FAILPOINT_FAILED:${failpoint}`,
      );
    }
    ensure(
      boundaryReached && !database.inTransaction,
      `TEST_PRECOMMIT_BOUNDARY_INVALID:${failpoint}`,
    );
    assertCounts(database, 0);
  }

  baseline = prepareRecoveryWalFaultBaseline(database, {
    walPath,
    cacheSizePages: 8,
  });
  let plaintextRejected = false;
  try {
    executeRecoveryCapture(database, {
      failpoint: "after-capture-row",
      reachFailpoint: ({ failpoint, visibleRows }) => {
        const wal = inspectRecoveryWal({
          walPath,
          expectedPageSize: baseline.walPageSize,
        });
        ensure(
          wal.walFrames > 0 && wal.walCommitFrames === 0,
          "TEST_CAPTURE_WAL_NOT_SPILLED",
        );
        const contents = fs.readFileSync(walPath);
        const canaries = getRecoveryCapturePlaintextCanaries();
        try {
          ensure(
            canaries.some((canary) => contents.includes(canary)),
            "TEST_PLAINTEXT_CANARY_NOT_SPILLED",
          );
        } finally {
          contents.fill(0);
          for (const canary of canaries) canary.fill(0);
        }
        createRecoveryFaultBoundaryRecord({
          database,
          walPath,
          failpoint,
          visibleRows,
          baseline,
          plaintextWalControlVerified: true,
        });
      },
    });
  } catch (error) {
    plaintextRejected =
      error instanceof RecoveryCaptureFixtureError &&
      error.code === "RECOVERY_WAL_PLAINTEXT_EXPOSED";
  }
  ensure(plaintextRejected, "TEST_PLAINTEXT_WAL_NOT_REJECTED");
  ensure(!database.inTransaction, "TEST_CAPTURE_TRANSACTION_NOT_ROLLED_BACK");
  assertCounts(database, 0);

  for (const [index, failpoint] of RECOVERY_CAPTURE_FAILPOINTS.filter(
    (value) => value !== "none",
  ).entries()) {
    ensure(
      verifyPlaintextRecoveryWalControl(NodeSqliteAdapter, {
        databasePath: path.join(root, `control-${index}.db`),
        expectedPageSize: baseline.walPageSize,
        cacheSizePages: baseline.cacheSizePages,
        failpoint,
      }) === true,
      `TEST_PLAINTEXT_CONTROL_FAILED:${failpoint}`,
    );
  }

  const applied = executeRecoveryCapture(database);
  ensure(
    applied.kind === "applied" && applied.connectionChanges > 0,
    "TEST_APPLY_FAILED",
  );
  assertCounts(database, 1);
  const beforeReplay = canonicalJson(
    readCanonicalRecoveryCaptureState(database),
  );
  const replay = executeRecoveryCapture(database);
  const afterReplay = canonicalJson(
    readCanonicalRecoveryCaptureState(database),
  );
  ensure(
    replay.kind === "replayed" &&
      replay.connectionChanges === 0 &&
      replay.outcomeDigest === applied.outcomeDigest &&
      beforeReplay === afterReplay &&
      afterReplay.includes(RECOVERY_CAPTURE_FIXTURE.capture.id),
    "TEST_REPLAY_FAILED",
  );

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      beginImmediateRollback: true,
      captureRowRollback: true,
      preCommitRollbackFailpoints: spillFailpoints.length + 1,
      eventAuditIdempotencyOutboxRollback: true,
      missingFtsProjectionBoundaryRejected: true,
      plaintextWalCanaryControl: true,
      uncommittedWalFramesObserved: true,
      idempotentReplayWithoutChurn: true,
      sqlCipherTextPageSizeNormalized: true,
      malformedTextPageSizesRejected: true,
    })}\n`,
  );
} finally {
  try {
    missingProjectionDatabase?.close();
    database?.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
