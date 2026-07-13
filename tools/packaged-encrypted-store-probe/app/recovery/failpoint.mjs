import fs from "node:fs";
import path from "node:path";

import {
  RECOVERY_CAPTURE_FAILPOINTS,
  RECOVERY_CAPTURE_FIXTURE,
  RECOVERY_CAPTURE_SCENARIO,
  RecoveryCaptureFixtureError,
  bootstrapRecoveryCaptureSchema,
  canonicalJson,
  executeRecoveryCapture,
  getRecoveryCapturePlaintextCanaries,
  getRecoveryCaptureExpectedRowsAtFailpoint,
} from "./capture-command.mjs";

export const RECOVERY_FAULT_BOUNDARY_TYPE =
  "constellation.packaged-store-recovery.fault-boundary/v1";

const WAL_HEADER_BYTES = 32;
const WAL_FRAME_HEADER_BYTES = 24;
const WAL_FORMAT_VERSION = 3_007_000;
const WAL_MAGIC = new Set([0x377f0682, 0x377f0683]);
const MAX_WAL_BYTES = 32 * 1024 * 1024;
const HOLD_WAIT_STATE = new Int32Array(new SharedArrayBuffer(4));
const FAULT_FAILPOINTS = Object.freeze(
  RECOVERY_CAPTURE_FAILPOINTS.filter((value) => value !== "none"),
);
const ROW_KEYS = Object.freeze([
  "captures",
  "fts",
  "events",
  "audits",
  "idempotency",
  "outbox",
]);
const BOUNDARY_KEYS = Object.freeze([
  "type",
  "processId",
  "scenario",
  "failpoint",
  "transactionOpen",
  "workspaceVersion",
  "visibleRows",
  "originalTextDigest",
  "walBaselineBytes",
  "walPageSize",
  "walBytes",
  "walFrames",
  "walCommitFrames",
  "walSpillObserved",
  "walEncrypted",
  "plaintextWalControlVerified",
  "readyForForcedCrash",
]);

function invariant(condition, code) {
  if (!condition) throw new RecoveryCaptureFixtureError(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function assertDatabase(database) {
  invariant(isRecord(database), "RECOVERY_DATABASE_INVALID");
  invariant(
    typeof database.prepare === "function",
    "RECOVERY_DATABASE_INVALID",
  );
  invariant(typeof database.pragma === "function", "RECOVERY_DATABASE_INVALID");
  invariant(
    typeof database.inTransaction === "boolean",
    "RECOVERY_DATABASE_INVALID",
  );
}

function assertWalPath(walPath) {
  invariant(
    typeof walPath === "string" &&
      path.isAbsolute(walPath) &&
      !walPath.includes("\0"),
    "RECOVERY_WAL_PATH_INVALID",
  );
}

function pathKind(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function normalizedWalBytes(walPath) {
  const metadata = pathKind(walPath);
  if (!metadata) return 0;
  invariant(
    metadata.isFile() && !metadata.isSymbolicLink(),
    "RECOVERY_WAL_FILE_INVALID",
  );
  invariant(
    Number.isSafeInteger(metadata.size) &&
      metadata.size >= 0 &&
      metadata.size <= MAX_WAL_BYTES,
    "RECOVERY_WAL_SIZE_INVALID",
  );
  return metadata.size;
}

function normalizeCanaries(values) {
  invariant(Array.isArray(values), "RECOVERY_WAL_CANARIES_INVALID");
  return values.map((value) => {
    const canary = Buffer.isBuffer(value)
      ? Buffer.from(value)
      : typeof value === "string"
        ? Buffer.from(value, "utf8")
        : undefined;
    invariant(
      canary && canary.length > 0 && canary.length <= 4096,
      "RECOVERY_WAL_CANARIES_INVALID",
    );
    return canary;
  });
}

function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

export function prepareRecoveryWalFaultBaseline(
  database,
  { walPath, cacheSizePages = 8 },
) {
  assertDatabase(database);
  assertWalPath(walPath);
  invariant(!database.inTransaction, "RECOVERY_TRANSACTION_ALREADY_OPEN");
  invariant(
    Number.isSafeInteger(cacheSizePages) &&
      cacheSizePages >= 4 &&
      cacheSizePages <= 64,
    "RECOVERY_CACHE_SIZE_INVALID",
  );

  database.pragma("foreign_keys = ON");
  database.pragma("synchronous = FULL");
  invariant(
    database.pragma("journal_mode", { simple: true }) === "wal",
    "RECOVERY_WAL_UNAVAILABLE",
  );
  database.pragma("wal_autocheckpoint = 0");
  database.pragma(`cache_size = ${cacheSizePages}`);
  database.pragma("cache_spill = ON");
  invariant(
    database.pragma("foreign_keys", { simple: true }) === 1 &&
      database.pragma("synchronous", { simple: true }) === 2 &&
      database.pragma("wal_autocheckpoint", { simple: true }) === 0 &&
      database.pragma("cache_size", { simple: true }) === cacheSizePages &&
      database.pragma("cache_spill", { simple: true }) > 0,
    "RECOVERY_WAL_CONFIGURATION_INVALID",
  );

  const checkpoint = database.pragma("wal_checkpoint(TRUNCATE)");
  invariant(
    Array.isArray(checkpoint) &&
      checkpoint.length === 1 &&
      hasExactKeys(checkpoint[0], ["busy", "log", "checkpointed"]) &&
      checkpoint[0].busy === 0 &&
      checkpoint[0].log === 0 &&
      checkpoint[0].checkpointed === 0,
    "RECOVERY_WAL_BASELINE_CHECKPOINT_FAILED",
  );
  const walBaselineBytes = normalizedWalBytes(walPath);
  invariant(walBaselineBytes === 0, "RECOVERY_WAL_BASELINE_NOT_EMPTY");

  const rawWalPageSize = database.pragma("page_size", { simple: true });
  const walPageSize =
    typeof rawWalPageSize === "string" &&
    /^[1-9][0-9]{2,4}$/.test(rawWalPageSize)
      ? Number(rawWalPageSize)
      : rawWalPageSize;
  invariant(
    Number.isSafeInteger(walPageSize) &&
      walPageSize >= 512 &&
      walPageSize <= 65_536 &&
      isPowerOfTwo(walPageSize),
    "RECOVERY_WAL_PAGE_SIZE_INVALID",
  );
  return Object.freeze({
    scenario: RECOVERY_CAPTURE_SCENARIO,
    walBaselineBytes,
    walPageSize,
    cacheSizePages,
  });
}

export function inspectRecoveryWal({
  walPath,
  expectedPageSize,
  plaintextCanaries = [],
}) {
  assertWalPath(walPath);
  invariant(
    Number.isSafeInteger(expectedPageSize) &&
      expectedPageSize >= 512 &&
      expectedPageSize <= 65_536 &&
      isPowerOfTwo(expectedPageSize),
    "RECOVERY_WAL_PAGE_SIZE_INVALID",
  );
  const canaries = normalizeCanaries(plaintextCanaries);
  const walBytes = normalizedWalBytes(walPath);
  if (walBytes === 0) {
    for (const canary of canaries) canary.fill(0);
    return Object.freeze({
      walBytes: 0,
      walFrames: 0,
      walCommitFrames: 0,
      walEncrypted: false,
    });
  }
  invariant(walBytes >= WAL_HEADER_BYTES, "RECOVERY_WAL_TRUNCATED");

  const contents = fs.readFileSync(walPath);
  try {
    invariant(contents.length === walBytes, "RECOVERY_WAL_SIZE_CHANGED");
    invariant(
      WAL_MAGIC.has(contents.readUInt32BE(0)),
      "RECOVERY_WAL_MAGIC_INVALID",
    );
    invariant(
      contents.readUInt32BE(4) === WAL_FORMAT_VERSION,
      "RECOVERY_WAL_FORMAT_INVALID",
    );
    const encodedPageSize = contents.readUInt32BE(8);
    const walPageSize = encodedPageSize === 1 ? 65_536 : encodedPageSize;
    invariant(
      walPageSize === expectedPageSize,
      "RECOVERY_WAL_PAGE_SIZE_MISMATCH",
    );
    const frameBytes = WAL_FRAME_HEADER_BYTES + walPageSize;
    invariant(
      (walBytes - WAL_HEADER_BYTES) % frameBytes === 0,
      "RECOVERY_WAL_FRAME_ALIGNMENT_INVALID",
    );
    const walFrames = (walBytes - WAL_HEADER_BYTES) / frameBytes;
    invariant(walFrames > 0, "RECOVERY_WAL_FRAMES_MISSING");

    const saltOne = contents.readUInt32BE(16);
    const saltTwo = contents.readUInt32BE(20);
    let walCommitFrames = 0;
    for (let index = 0; index < walFrames; index += 1) {
      const offset = WAL_HEADER_BYTES + index * frameBytes;
      invariant(
        contents.readUInt32BE(offset) > 0 &&
          contents.readUInt32BE(offset + 8) === saltOne &&
          contents.readUInt32BE(offset + 12) === saltTwo,
        "RECOVERY_WAL_FRAME_INVALID",
      );
      if (contents.readUInt32BE(offset + 4) !== 0) walCommitFrames += 1;
    }
    for (const canary of canaries) {
      invariant(!contents.includes(canary), "RECOVERY_WAL_PLAINTEXT_EXPOSED");
    }

    return Object.freeze({
      walBytes,
      walFrames,
      walCommitFrames,
      walEncrypted: true,
    });
  } finally {
    contents.fill(0);
    for (const canary of canaries) canary.fill(0);
  }
}

function removeControlFiles(databasePath) {
  for (const filename of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
  ]) {
    fs.rmSync(filename, { force: true });
    invariant(!pathKind(filename), "RECOVERY_PLAINTEXT_CONTROL_CLEANUP_FAILED");
  }
}

export function verifyPlaintextRecoveryWalControl(
  Database,
  {
    databasePath,
    expectedPageSize,
    cacheSizePages = 8,
    failpoint = "after-capture-row",
  },
) {
  invariant(typeof Database === "function", "RECOVERY_DATABASE_INVALID");
  assertWalPath(databasePath);
  invariant(!pathKind(databasePath), "RECOVERY_PLAINTEXT_CONTROL_EXISTS");
  invariant(FAULT_FAILPOINTS.includes(failpoint), "RECOVERY_FAILPOINT_INVALID");
  const controlFailpoint =
    failpoint === "after-begin-immediate" ? "after-capture-row" : failpoint;
  let database;
  let controlReached = false;
  try {
    database = new Database(databasePath);
    bootstrapRecoveryCaptureSchema(database);
    const baseline = prepareRecoveryWalFaultBaseline(database, {
      walPath: `${databasePath}-wal`,
      cacheSizePages,
    });
    invariant(
      baseline.walPageSize === expectedPageSize,
      "RECOVERY_PLAINTEXT_CONTROL_PAGE_SIZE_MISMATCH",
    );
    try {
      executeRecoveryCapture(database, {
        failpoint: controlFailpoint,
        reachFailpoint: () => {
          const walPath = `${databasePath}-wal`;
          const wal = inspectRecoveryWal({
            walPath,
            expectedPageSize,
          });
          invariant(
            wal.walFrames > 0 && wal.walCommitFrames === 0,
            "RECOVERY_PLAINTEXT_CONTROL_WAL_INVALID",
          );
          const contents = fs.readFileSync(walPath);
          const canaries = getRecoveryCapturePlaintextCanaries();
          try {
            invariant(
              canaries.some((canary) => contents.includes(canary)),
              "RECOVERY_PLAINTEXT_CONTROL_CANARY_NOT_SPILLED",
            );
          } finally {
            contents.fill(0);
            for (const canary of canaries) canary.fill(0);
          }
          controlReached = true;
          throw new RecoveryCaptureFixtureError(
            "RECOVERY_PLAINTEXT_CONTROL_REACHED",
          );
        },
      });
    } catch (error) {
      invariant(
        error instanceof RecoveryCaptureFixtureError &&
          error.code === "RECOVERY_PLAINTEXT_CONTROL_REACHED",
        "RECOVERY_PLAINTEXT_CONTROL_FAILED",
      );
    }
    invariant(
      controlReached && !database.inTransaction,
      "RECOVERY_PLAINTEXT_CONTROL_FAILED",
    );
  } catch (error) {
    if (error instanceof RecoveryCaptureFixtureError) throw error;
    throw new RecoveryCaptureFixtureError("RECOVERY_PLAINTEXT_CONTROL_FAILED");
  } finally {
    try {
      database?.close();
    } finally {
      removeControlFiles(databasePath);
    }
  }
  return true;
}

function assertVisibleRows(rows) {
  invariant(hasExactKeys(rows, ROW_KEYS), "RECOVERY_VISIBLE_ROWS_INVALID");
  invariant(
    ROW_KEYS.every((key) => Number.isSafeInteger(rows[key]) && rows[key] >= 0),
    "RECOVERY_VISIBLE_ROWS_INVALID",
  );
}

export function assertRecoveryFaultBoundaryRecord(record) {
  invariant(
    hasExactKeys(record, BOUNDARY_KEYS),
    "RECOVERY_FAULT_BOUNDARY_SHAPE_INVALID",
  );
  assertVisibleRows(record.visibleRows);
  invariant(
    record.type === RECOVERY_FAULT_BOUNDARY_TYPE &&
      Number.isSafeInteger(record.processId) &&
      record.processId > 0 &&
      record.scenario === RECOVERY_CAPTURE_SCENARIO &&
      FAULT_FAILPOINTS.includes(record.failpoint) &&
      record.transactionOpen === true &&
      record.workspaceVersion === RECOVERY_CAPTURE_FIXTURE.workspace.version &&
      record.originalTextDigest ===
        RECOVERY_CAPTURE_FIXTURE.originalTextDigest &&
      record.walBaselineBytes === 0 &&
      Number.isSafeInteger(record.walPageSize) &&
      record.walPageSize >= 512 &&
      Number.isSafeInteger(record.walBytes) &&
      record.walBytes >= 0 &&
      Number.isSafeInteger(record.walFrames) &&
      record.walFrames >= 0 &&
      Number.isSafeInteger(record.walCommitFrames) &&
      record.walCommitFrames >= 0 &&
      typeof record.walSpillObserved === "boolean" &&
      typeof record.walEncrypted === "boolean" &&
      record.plaintextWalControlVerified === true &&
      record.readyForForcedCrash === true,
    "RECOVERY_FAULT_BOUNDARY_VALUE_INVALID",
  );

  const expectedRows = getRecoveryCaptureExpectedRowsAtFailpoint(
    record.failpoint,
  );
  invariant(
    canonicalJson(record.visibleRows) === canonicalJson(expectedRows),
    "RECOVERY_FAULT_BOUNDARY_ROWS_INVALID",
  );
  if (record.failpoint === "after-begin-immediate") {
    invariant(
      record.walBytes === 0 &&
        record.walFrames === 0 &&
        record.walCommitFrames === 0 &&
        record.walSpillObserved === false &&
        record.walEncrypted === false,
      "RECOVERY_BEGIN_BOUNDARY_WAL_INVALID",
    );
  } else {
    const minimumFrameBytes =
      WAL_HEADER_BYTES + WAL_FRAME_HEADER_BYTES + record.walPageSize;
    invariant(
      record.walBytes >= minimumFrameBytes &&
        (record.walBytes - WAL_HEADER_BYTES) %
          (WAL_FRAME_HEADER_BYTES + record.walPageSize) ===
          0 &&
        record.walFrames >= 1 &&
        record.walCommitFrames === 0 &&
        record.walSpillObserved === true &&
        record.walEncrypted === true,
      "RECOVERY_CAPTURE_BOUNDARY_WAL_INVALID",
    );
  }
  return record;
}

export function createRecoveryFaultBoundaryRecord({
  database,
  walPath,
  failpoint,
  visibleRows,
  baseline,
  plaintextWalControlVerified,
  processId = process.pid,
}) {
  assertDatabase(database);
  assertWalPath(walPath);
  invariant(database.inTransaction, "RECOVERY_TRANSACTION_NOT_OPEN");
  invariant(FAULT_FAILPOINTS.includes(failpoint), "RECOVERY_FAILPOINT_INVALID");
  assertVisibleRows(visibleRows);
  invariant(
    hasExactKeys(baseline, [
      "scenario",
      "walBaselineBytes",
      "walPageSize",
      "cacheSizePages",
    ]) &&
      baseline.scenario === RECOVERY_CAPTURE_SCENARIO &&
      baseline.walBaselineBytes === 0,
    "RECOVERY_WAL_BASELINE_INVALID",
  );

  const plaintextCanaries =
    failpoint === "after-begin-immediate"
      ? []
      : getRecoveryCapturePlaintextCanaries();
  let wal;
  try {
    wal = inspectRecoveryWal({
      walPath,
      expectedPageSize: baseline.walPageSize,
      plaintextCanaries,
    });
  } finally {
    for (const canary of plaintextCanaries) canary.fill(0);
  }
  return assertRecoveryFaultBoundaryRecord(
    Object.freeze({
      type: RECOVERY_FAULT_BOUNDARY_TYPE,
      processId,
      scenario: RECOVERY_CAPTURE_SCENARIO,
      failpoint,
      transactionOpen: true,
      workspaceVersion: RECOVERY_CAPTURE_FIXTURE.workspace.version,
      visibleRows: Object.freeze({ ...visibleRows }),
      originalTextDigest: RECOVERY_CAPTURE_FIXTURE.originalTextDigest,
      walBaselineBytes: baseline.walBaselineBytes,
      walPageSize: baseline.walPageSize,
      walBytes: wal.walBytes,
      walFrames: wal.walFrames,
      walCommitFrames: wal.walCommitFrames,
      walSpillObserved: wal.walFrames > 0,
      walEncrypted: wal.walEncrypted,
      plaintextWalControlVerified,
      readyForForcedCrash: true,
    }),
  );
}

export function emitRecoveryFaultBoundaryRecord(
  record,
  { fileDescriptor = 1, writeSync = fs.writeSync } = {},
) {
  assertRecoveryFaultBoundaryRecord(record);
  invariant(
    Number.isSafeInteger(fileDescriptor) && fileDescriptor >= 0,
    "RECOVERY_FAULT_OUTPUT_INVALID",
  );
  invariant(typeof writeSync === "function", "RECOVERY_FAULT_OUTPUT_INVALID");
  const output = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  try {
    let offset = 0;
    while (offset < output.length) {
      const written = writeSync(
        fileDescriptor,
        output,
        offset,
        output.length - offset,
      );
      invariant(
        Number.isSafeInteger(written) && written > 0,
        "RECOVERY_FAULT_OUTPUT_FAILED",
      );
      offset += written;
    }
    return output.length;
  } finally {
    output.fill(0);
  }
}

export function holdForForcedTermination({
  timeoutMs = 60_000,
  waitSliceMs = 1_000,
} = {}) {
  invariant(
    Number.isSafeInteger(timeoutMs) &&
      timeoutMs >= 1_000 &&
      timeoutMs <= 120_000 &&
      Number.isSafeInteger(waitSliceMs) &&
      waitSliceMs >= 1 &&
      waitSliceMs <= 1_000 &&
      waitSliceMs <= timeoutMs,
    "RECOVERY_FAULT_HOLD_INVALID",
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    Atomics.wait(
      HOLD_WAIT_STATE,
      0,
      0,
      Math.min(waitSliceMs, Math.max(1, deadline - Date.now())),
    );
  }
  throw new RecoveryCaptureFixtureError("RECOVERY_FAULT_HOLD_TIMEOUT");
}
