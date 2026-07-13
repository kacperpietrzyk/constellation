import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  RECOVERY_CAPTURE_FAILPOINTS,
  RECOVERY_CAPTURE_CONFLICT_FIXTURE,
  RECOVERY_CAPTURE_FIXTURE,
  STORE_BUSY_RETRYABLE,
  RecoveryCaptureFixtureError,
  bootstrapRecoveryCaptureSchema,
  canonicalJson,
  executeRecoveryCapture,
  executeRecoveryCaptureConflict,
  getRecoveryCapturePlaintextCanaries,
  isSqliteBusyError,
  readRecoveryCaptureCounts,
} from "../app/recovery/capture-command.mjs";
import {
  getRecoveryCaptureExpectedStateDigest,
  readCanonicalRecoveryCaptureState,
  verifyRecoveryCaptureState,
} from "../app/recovery/capture-verifier.mjs";
import {
  RECOVERY_POST_COMMIT_FAULT_BOUNDARY_TYPE,
  assertRecoveryPostCommitFaultBoundaryRecord,
  createRecoveryFaultBoundaryRecord,
  createRecoveryPostCommitFaultBoundaryRecord,
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

ensure(
  STORE_BUSY_RETRYABLE === "STORE_BUSY_RETRYABLE",
  "TEST_BUSY_CODE_INVALID",
);
for (const code of [
  "SQLITE_BUSY",
  "SQLITE_BUSY_RECOVERY",
  "SQLITE_BUSY_SNAPSHOT",
  "SQLITE_BUSY_TIMEOUT",
]) {
  ensure(
    isSqliteBusyError(Object.assign(new Error("busy"), { code })),
    `TEST_BUSY_CODE_REJECTED:${code}`,
  );
}
for (const code of [
  undefined,
  "SQLITE_BUSYNESS",
  "SQLITE_BUSY_",
  "SQLITE_LOCKED",
  "SQLITE_LOCKED_SHAREDCACHE",
  "SQLITE_FULL",
  "SQLITE_IOERR",
  "SQLITE_IOERR_READ",
  "SQLITE_CANTOPEN",
  "SQLITE_CANTOPEN_ISDIR",
  "SQLITE_PROTOCOL",
  "SQLITE_ERROR_RETRY",
]) {
  ensure(
    !isSqliteBusyError(Object.assign(new Error("not busy"), { code })),
    `TEST_NON_BUSY_CODE_ACCEPTED:${code ?? "missing"}`,
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
      failpoint !== "none" &&
      failpoint !== "after-begin-immediate" &&
      failpoint !== "after-commit-before-result",
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

  baseline = prepareRecoveryWalFaultBaseline(database, {
    walPath,
    cacheSizePages: 8,
  });
  let postCommitReached = false;
  let postCommitVisibleRows;
  let postCommitWal;
  let plaintextPostCommitRejected = false;
  try {
    executeRecoveryCapture(database, {
      failpoint: "after-commit-before-result",
      reachFailpoint: ({ failpoint, visibleRows }) => {
        ensure(
          failpoint === "after-commit-before-result" &&
            !database.inTransaction &&
            canonicalJson(visibleRows) ===
              canonicalJson(TEST_PRECOMMIT_ROWS["after-outbox-row"]),
          "TEST_POST_COMMIT_ROWS_INVALID",
        );
        const verification = verifyRecoveryCaptureState(database, {
          expectedState: "committed",
        });
        ensure(
          verification.stateDigest ===
            getRecoveryCaptureExpectedStateDigest("committed"),
          "TEST_POST_COMMIT_STATE_INVALID",
        );
        postCommitWal = inspectRecoveryWal({
          walPath,
          expectedPageSize: baseline.walPageSize,
        });
        ensure(
          postCommitWal.walFrames > 0 && postCommitWal.walCommitFrames === 1,
          "TEST_POST_COMMIT_WAL_INVALID",
        );
        const contents = fs.readFileSync(walPath);
        const canaries = getRecoveryCapturePlaintextCanaries();
        try {
          ensure(
            canaries.some((canary) => contents.includes(canary)),
            "TEST_POST_COMMIT_CANARY_NOT_SPILLED",
          );
        } finally {
          contents.fill(0);
          for (const canary of canaries) canary.fill(0);
        }
        try {
          createRecoveryPostCommitFaultBoundaryRecord({
            database,
            walPath,
            failpoint,
            visibleRows,
            baseline,
            plaintextWalControlVerified: true,
          });
        } catch (error) {
          plaintextPostCommitRejected =
            error instanceof RecoveryCaptureFixtureError &&
            error.code === "RECOVERY_WAL_PLAINTEXT_EXPOSED";
        }
        postCommitReached = true;
        postCommitVisibleRows = visibleRows;
        throw new RecoveryCaptureFixtureError(
          "TEST_POST_COMMIT_BOUNDARY_REACHED",
        );
      },
    });
  } catch (error) {
    ensure(
      error instanceof RecoveryCaptureFixtureError &&
        error.code === "TEST_POST_COMMIT_BOUNDARY_REACHED",
      "TEST_POST_COMMIT_FAILPOINT_FAILED",
    );
  }
  ensure(
    postCommitReached && plaintextPostCommitRejected && !database.inTransaction,
    "TEST_POST_COMMIT_BOUNDARY_INVALID",
  );
  assertCounts(database, 1);

  const validPostCommitRecord = Object.freeze({
    type: RECOVERY_POST_COMMIT_FAULT_BOUNDARY_TYPE,
    processId: 12_345,
    scenario: RECOVERY_CAPTURE_FIXTURE.scenario,
    failpoint: "after-commit-before-result",
    commitReturned: true,
    transactionOpen: false,
    commandResultPublished: false,
    canonicalStateVerified: true,
    workspaceVersion: RECOVERY_CAPTURE_FIXTURE.workspace.version,
    visibleRows: Object.freeze({ ...postCommitVisibleRows }),
    stateDigest: getRecoveryCaptureExpectedStateDigest("committed"),
    originalTextDigest: RECOVERY_CAPTURE_FIXTURE.originalTextDigest,
    semanticFingerprint: RECOVERY_CAPTURE_FIXTURE.semanticFingerprint,
    outcomeDigest: RECOVERY_CAPTURE_FIXTURE.outcomeDigest,
    walBaselineBytes: baseline.walBaselineBytes,
    walPageSize: baseline.walPageSize,
    walBytes: postCommitWal.walBytes,
    walFrames: postCommitWal.walFrames,
    walCommitFrames: postCommitWal.walCommitFrames,
    walSpillObserved: true,
    walEncrypted: true,
    plaintextWalControlVerified: true,
    readyForForcedCrash: true,
  });
  ensure(
    assertRecoveryPostCommitFaultBoundaryRecord(validPostCommitRecord) ===
      validPostCommitRecord,
    "TEST_POST_COMMIT_RECORD_REJECTED",
  );
  let unexpectedPostCommitFieldRejected = false;
  try {
    assertRecoveryPostCommitFaultBoundaryRecord({
      ...validPostCommitRecord,
      unexpected: true,
    });
  } catch (error) {
    unexpectedPostCommitFieldRejected =
      error instanceof RecoveryCaptureFixtureError &&
      error.code === "RECOVERY_POST_COMMIT_BOUNDARY_SHAPE_INVALID";
  }
  ensure(
    unexpectedPostCommitFieldRejected,
    "TEST_POST_COMMIT_RECORD_SHAPE_ACCEPTED",
  );
  for (const mutation of [
    { transactionOpen: true },
    { commandResultPublished: true },
    { canonicalStateVerified: false },
    { stateDigest: "0".repeat(64) },
    { walCommitFrames: 0 },
    { walCommitFrames: 2 },
    { walEncrypted: false },
    {
      visibleRows: {
        ...validPostCommitRecord.visibleRows,
        outbox: 0,
      },
    },
  ]) {
    let malformedRejected = false;
    try {
      assertRecoveryPostCommitFaultBoundaryRecord({
        ...validPostCommitRecord,
        ...mutation,
      });
    } catch (error) {
      malformedRejected =
        error instanceof RecoveryCaptureFixtureError &&
        error.code === "RECOVERY_POST_COMMIT_BOUNDARY_VALUE_INVALID";
    }
    ensure(malformedRejected, "TEST_MALFORMED_POST_COMMIT_RECORD_ACCEPTED");
  }

  const beforeReplay = canonicalJson(
    readCanonicalRecoveryCaptureState(database),
  );
  const replay = executeRecoveryCapture(database);
  const afterReplay = canonicalJson(
    readCanonicalRecoveryCaptureState(database),
  );
  const conflict = executeRecoveryCaptureConflict(database);
  const afterConflict = canonicalJson(
    readCanonicalRecoveryCaptureState(database),
  );
  ensure(
    replay.kind === "replayed" &&
      replay.connectionChanges === 0 &&
      replay.outcomeDigest === RECOVERY_CAPTURE_FIXTURE.outcomeDigest &&
      conflict.kind === "conflict" &&
      conflict.diagnosticCode ===
        RECOVERY_CAPTURE_CONFLICT_FIXTURE.diagnosticCode &&
      conflict.connectionChanges === 0 &&
      conflict.requestedSemanticFingerprint ===
        "42e7000a85fb02207e52b8618211e1b9641b875949906f19932ea01227a9be92" &&
      conflict.storedSemanticFingerprint ===
        "41fb2096fd21e2e58cf199704dc43195c12b2f73e3cd7c02f55e0700a93a17b5" &&
      conflict.storedOutcomeDigest === RECOVERY_CAPTURE_FIXTURE.outcomeDigest &&
      beforeReplay === afterReplay &&
      afterReplay === afterConflict &&
      afterReplay.includes(RECOVERY_CAPTURE_FIXTURE.capture.id),
    "TEST_REPLAY_OR_CONFLICT_FAILED",
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
      postCommitBeforeResultCommitted: true,
      postCommitWalCommitFrameObserved: true,
      idempotentReplayWithoutChurn: true,
      idempotencyConflictWithoutChurn: true,
      malformedPostCommitRecordsRejected: true,
      sqliteBusyTaxonomyVerified: true,
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
