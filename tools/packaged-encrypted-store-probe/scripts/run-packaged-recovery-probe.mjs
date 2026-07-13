import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  RECOVERY_CAPTURE_SCENARIO,
  getRecoveryCapturePlaintextCanaries,
} from "../app/recovery/capture-command.mjs";
import {
  assertRecoveryFaultBoundaryRecord,
  inspectRecoveryWal,
} from "../app/recovery/failpoint.mjs";
import {
  forceCrashPackagedProcessAtBoundary,
  launchManagedPackagedProcess,
} from "./packaged-process-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appName = "Constellation Packaged Store Probe";
const keychainService = `${appName} Safe Storage`;
const keychainAccount = `${appName} Key`;
const packageRoot = path.join(
  root,
  "out",
  `${appName}-${process.platform}-x64`,
);
const executable =
  process.platform === "darwin"
    ? path.join(packageRoot, `${appName}.app`, "Contents", "MacOS", appName)
    : path.join(packageRoot, `${appName}.exe`);
const resourcesRoot =
  process.platform === "darwin"
    ? path.join(packageRoot, `${appName}.app`, "Contents", "Resources")
    : path.join(packageRoot, "resources");
const appArchive = path.join(resourcesRoot, "app.asar");
const nativeAddon = path.join(
  resourcesRoot,
  "app.asar.unpacked",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);
const temporaryRoot = process.env.RUNNER_TEMP || os.tmpdir();
const stateRoot = fs.mkdtempSync(
  path.join(temporaryRoot, "constellation-packaged-store-recovery-"),
);
const profile = path.join(stateRoot, "profile");
const providerBootstrapReadyType =
  "constellation.packaged-store-probe.provider-bootstrap-ready/v1";
const providerBootstrapContinueType =
  "constellation.packaged-store-probe.provider-bootstrap-continue/v1";
const progressType = "constellation.packaged-store-probe.progress/v1";
const progressStages = new Set([
  "identity-verified",
  "provider-bootstrap-complete",
  "provider-roundtrip-complete",
  "phase-two-ready",
  "safe-storage-ready",
  "native-addon-ready",
  "provision-started",
  "material-prepared",
  "wrapper-encrypted",
  "wrapper-published",
  "database-reserved",
  "database-opened",
  "database-facts-verified",
  "schema-created",
  "marker-inserted",
  "marker-verified",
  "integrity-verified",
  "live-store-scanned",
  "database-closed",
  "closed-store-scanned",
  "recovery-schema-bootstrapped",
  "recovery-state-verified",
  "recovery-command-applied",
  "recovery-fault-baseline-ready",
  "recovery-plaintext-control-verified",
  "recovery-fault-boundary-ready",
  "result-ready",
  "result-published",
]);
const fixedResultKeys = [
  "architecture",
  "code",
  "declaredExitCode",
  "electron",
  "nativeAddonPackaged",
  "packaged",
  "phase",
  "platform",
  "processId",
  "status",
];
const recoveryCommonKeys = [
  "asyncEncryptionAvailable",
  "cipherVersion",
  "markerDigest",
  "provider",
  "providerVersion",
  "rawKeyBinding",
  "scenario",
];
const forbiddenOutput = [
  Buffer.from('"keyMaterial"'),
  Buffer.from('"ciphertext"'),
  Buffer.from("constellation.packaged-store-key-payload/v1"),
];
const processIds = new Set();
let verifiedManagedTerminations = 0;
let verifiedForcedTerminations = 0;

function ensure(condition, code) {
  if (!condition) throw new Error(code);
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function digestFile(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest();
}

function sameDigest(left, right) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function assertExactResultKeys(result, extraKeys = []) {
  ensure(
    hasExactKeys(result, [...fixedResultKeys, ...extraKeys]),
    "CHILD_RESULT_SHAPE_INVALID",
  );
}

function inspectOutput(contents) {
  ensure(contents.length <= 64 * 1024, "OUTPUT_TOO_LARGE");
  for (const forbidden of forbiddenOutput) {
    ensure(!contents.includes(forbidden), "SENSITIVE_OUTPUT_SHAPE");
  }
}

function parseFixedResult(stdout) {
  const candidates = [];
  const lines = stdout.toString("utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (Object.hasOwn(value, "declaredExitCode")) candidates.push(value);
    } catch {
      // Chromium diagnostics are not result evidence.
    }
  }
  ensure(candidates.length === 1, "FIXED_RESULT_COUNT_INVALID");
  const result = candidates[0];
  ensure(
    result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      (result.status === "pass" || result.status === "fail") &&
      typeof result.code === "string" &&
      Number.isInteger(result.declaredExitCode) &&
      result.declaredExitCode >= 0 &&
      result.declaredExitCode <= 255 &&
      ((result.status === "pass" && result.declaredExitCode === 0) ||
        (result.status === "fail" && result.declaredExitCode !== 0)),
    "FIXED_RESULT_INVALID",
  );
  return result;
}

function argumentsFor({
  mode,
  workspaceId,
  wrapperName,
  databaseName,
  scenario,
  failpoint,
}) {
  const args = [
    `--user-data-dir=${profile}`,
    `--probe-mode=${mode}`,
    `--probe-state-root=${stateRoot}`,
    `--probe-workspace=${workspaceId}`,
    `--probe-wrapper=${wrapperName}`,
    `--probe-database=${databaseName}`,
  ];
  if (scenario !== undefined) {
    args.push(`--probe-scenario=${scenario}`, `--probe-failpoint=${failpoint}`);
  }
  return args;
}

async function launch(options) {
  const providerChannel = options.mode === "provider-initialize";
  const execution = await launchManagedPackagedProcess({
    executable,
    args: argumentsFor(options),
    mode: options.mode,
    errorContext: `${options.mode}:${options.wrapperName}:${options.databaseName}`,
    providerBootstrap: providerChannel
      ? {
          readyType: providerBootstrapReadyType,
          continueType: providerBootstrapContinueType,
        }
      : undefined,
    progressProtocol: { type: progressType, stages: progressStages },
  });
  try {
    inspectOutput(execution.stdout);
    inspectOutput(execution.stderr);
    const result = parseFixedResult(execution.stdout);
    ensure(
      execution.actualCode === result.declaredExitCode &&
        execution.actualSignal === null,
      "PACKAGED_EXIT_STATUS_INVALID",
    );
    ensure(
      execution.providerBootstrapCompleted &&
        execution.providerBootstrapMessageCount === (providerChannel ? 1 : 0),
      "PROVIDER_BOOTSTRAP_EVIDENCE_INVALID",
    );
    return {
      actualCode: execution.actualCode,
      actualSignal: execution.actualSignal,
      providerBootstrapCompleted: execution.providerBootstrapCompleted,
      providerBootstrapMessageCount: execution.providerBootstrapMessageCount,
      childPid: execution.childPid,
      declaredExitCode: result.declaredExitCode,
      result,
    };
  } finally {
    execution.stdout.fill(0);
    execution.stderr.fill(0);
  }
}

function assertFixedIdentity(execution, mode) {
  const { childPid, result } = execution;
  ensure(result.packaged === true, "CHILD_NOT_PACKAGED");
  ensure(result.architecture === "x64", "CHILD_ARCH_INVALID");
  ensure(result.electron === "43.1.0", "CHILD_ELECTRON_INVALID");
  ensure(result.platform === process.platform, "CHILD_PLATFORM_INVALID");
  ensure(result.processId === childPid, "CHILD_PROCESS_ID_INVALID");
  ensure(result.phase === mode, "CHILD_PHASE_INVALID");
  ensure(result.nativeAddonPackaged === true, "NATIVE_ADDON_PATH_INVALID");
}

function recordManaged(execution, mode) {
  ensure(
    execution.actualCode === execution.result.declaredExitCode &&
      execution.declaredExitCode === execution.result.declaredExitCode &&
      execution.actualSignal === null,
    `CHILD_EXIT_STATUS_INVALID:${mode}`,
  );
  assertFixedIdentity(execution, mode);
  ensure(!processIds.has(execution.childPid), "PROCESS_REUSED");
  processIds.add(execution.childPid);
  verifiedManagedTerminations += 1;
}

function assertProvider(result) {
  ensure(result.asyncEncryptionAvailable === true, "SAFE_STORAGE_INVALID");
  ensure(result.cipherVersion === "4.16.0 community", "CIPHER_INVALID");
  ensure(result.rawKeyBinding === true, "RAW_KEY_BINDING_INVALID");
  if (process.platform === "darwin") {
    ensure(result.provider === "commoncrypto", "PROVIDER_INVALID");
  } else {
    ensure(result.provider === "openssl", "PROVIDER_INVALID");
    ensure(
      /^OpenSSL 3\.5\.7\b/.test(result.providerVersion),
      "PROVIDER_VERSION_INVALID",
    );
  }
}

function assertRows(rows, expected) {
  ensure(
    hasExactKeys(rows, [
      "audits",
      "captures",
      "events",
      "fts",
      "idempotency",
      "outbox",
    ]) && Object.values(rows).every((value) => value === expected),
    "RECOVERY_ROWS_INVALID",
  );
}

function assertRecoveryCommon(result, markerDigest) {
  assertProvider(result);
  ensure(result.scenario === RECOVERY_CAPTURE_SCENARIO, "SCENARIO_INVALID");
  ensure(result.markerDigest === markerDigest, "MARKER_DIGEST_CHANGED");
  ensure(result.workspaceVersion === 1, "WORKSPACE_VERSION_CHANGED");
  ensure(result.integrityVerified === true, "INTEGRITY_NOT_VERIFIED");
  ensure(result.ftsVerified === true, "FTS_NOT_VERIFIED");
  ensure(/^[a-f0-9]{64}$/.test(result.stateDigest), "STATE_DIGEST_INVALID");
}

function removeProbeKeychainItem() {
  if (process.platform !== "darwin") return;
  const identity = ["-s", keychainService, "-a", keychainAccount];
  const find = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  if (find.status === 44) return;
  ensure(find.status === 0, "KEYCHAIN_QUERY_FAILED");
  const remove = spawnSync(
    "/usr/bin/security",
    ["delete-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  ensure(remove.status === 0, "KEYCHAIN_CLEANUP_FAILED");
  const verify = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  ensure(verify.status === 44, "KEYCHAIN_CLEANUP_UNVERIFIED");
}

function assertProbeKeychainItemPresent() {
  if (process.platform !== "darwin") return;
  const find = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", "-s", keychainService, "-a", keychainAccount],
    { stdio: "ignore", timeout: 5_000 },
  );
  ensure(find.status === 0, "KEYCHAIN_ITEM_MISSING");
}

async function removeDirectory(directory) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(200 * (attempt + 1));
    }
  }
  throw lastError || new Error("STATE_CLEANUP_FAILED");
}

function normalizedWalMetadata(walPath) {
  try {
    const metadata = fs.lstatSync(walPath);
    ensure(
      metadata.isFile() && !metadata.isSymbolicLink(),
      "RECOVERY_WAL_FILE_INVALID",
    );
    return { bytes: metadata.size, digest: digestFile(walPath) };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { bytes: 0, digest: Buffer.alloc(0) };
    }
    throw error;
  }
}

async function forceFault(options) {
  const walPath = path.join(stateRoot, `${options.databaseName}-wal`);
  const execution = await forceCrashPackagedProcessAtBoundary({
    executable,
    args: argumentsFor({
      ...options,
      mode: "recovery-fault",
      scenario: RECOVERY_CAPTURE_SCENARIO,
      failpoint: options.failpoint,
    }),
    errorContext: `${options.failpoint}:${options.databaseName}`,
    parseBoundary: (line, processId) => {
      let record;
      try {
        record = JSON.parse(line.toString("utf8"));
      } catch {
        throw new Error("FAULT_BOUNDARY_INVALID");
      }
      assertRecoveryFaultBoundaryRecord(record);
      ensure(record.processId === processId, "FAULT_PROCESS_ID_INVALID");
      ensure(record.failpoint === options.failpoint, "FAULT_POINT_INVALID");
      return record;
    },
    beforeKill: (boundary) => {
      const canaries =
        options.failpoint === "after-capture-row"
          ? getRecoveryCapturePlaintextCanaries()
          : [];
      let wal;
      try {
        wal = inspectRecoveryWal({
          walPath,
          expectedPageSize: boundary.walPageSize,
          plaintextCanaries: canaries,
        });
      } finally {
        for (const canary of canaries) canary.fill(0);
      }
      ensure(
        wal.walBytes === boundary.walBytes &&
          wal.walFrames === boundary.walFrames &&
          wal.walCommitFrames === 0 &&
          boundary.plaintextWalControlVerified === true,
        "FAULT_WAL_EVIDENCE_MISMATCH",
      );
      return normalizedWalMetadata(walPath);
    },
  });
  try {
    inspectOutput(execution.stdout);
    inspectOutput(execution.stderr);
    const lines = execution.stdout
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    ensure(lines.length === 1, "FAULT_BOUNDARY_COUNT_INVALID");
    ensure(execution.forcedKillVerified === true, "FORCED_KILL_UNVERIFIED");
    ensure(!processIds.has(execution.childPid), "PROCESS_REUSED");
    processIds.add(execution.childPid);
    verifiedForcedTerminations += 1;

    const postKill = normalizedWalMetadata(walPath);
    if (options.failpoint === "after-capture-row") {
      ensure(
        postKill.bytes === execution.beforeKillEvidence.bytes &&
          sameDigest(postKill.digest, execution.beforeKillEvidence.digest),
        "POST_KILL_WAL_CHANGED",
      );
    } else {
      ensure(postKill.bytes === 0, "BEGIN_WAL_NOT_EMPTY");
    }
    execution.beforeKillEvidence.digest.fill(0);
    postKill.digest.fill(0);
    return execution.boundary;
  } finally {
    execution.stdout.fill(0);
    execution.stderr.fill(0);
  }
}

async function runSentinel({ slug, failpoint }) {
  const workspaceId = `workspace-recovery-${slug}`;
  const wrapperName = `${slug}.wrap.json`;
  const databaseName = `${slug}.db`;

  const provision = await launch({
    mode: "provision",
    workspaceId,
    wrapperName,
    databaseName,
  });
  ensure(provision.result.status === "pass", "RECOVERY_PROVISION_FAILED");
  ensure(
    provision.result.code === "STORE_PROVISIONED",
    "PROVISION_CODE_INVALID",
  );
  recordManaged(provision, "provision");
  assertExactResultKeys(provision.result, [
    "asyncEncryptionAvailable",
    "cipherVersion",
    "encryptedWal",
    "fts5",
    "loadableExtensions",
    "markerDigest",
    "plaintextScan",
    "provider",
    "providerVersion",
    "rawKeyBinding",
  ]);
  assertProvider(provision.result);
  const markerDigest = provision.result.markerDigest;

  const bootstrap = await launch({
    mode: "recovery-bootstrap",
    workspaceId,
    wrapperName,
    databaseName,
    scenario: RECOVERY_CAPTURE_SCENARIO,
    failpoint: "none",
  });
  ensure(bootstrap.result.status === "pass", "RECOVERY_BOOTSTRAP_FAILED");
  ensure(
    bootstrap.result.code === "RECOVERY_BOOTSTRAPPED",
    "BOOTSTRAP_CODE_INVALID",
  );
  recordManaged(bootstrap, "recovery-bootstrap");
  assertExactResultKeys(bootstrap.result, [
    ...recoveryCommonKeys,
    "ftsVerified",
    "integrityVerified",
    "rows",
    "stateDigest",
    "workspaceVersion",
  ]);
  assertRecoveryCommon(bootstrap.result, markerDigest);
  assertRows(bootstrap.result.rows, 0);

  const boundary = await forceFault({
    workspaceId,
    wrapperName,
    databaseName,
    failpoint,
  });

  const empty = await launch({
    mode: "recovery-verify-empty",
    workspaceId,
    wrapperName,
    databaseName,
    scenario: RECOVERY_CAPTURE_SCENARIO,
    failpoint: "none",
  });
  ensure(empty.result.status === "pass", "RECOVERY_EMPTY_FAILED");
  ensure(empty.result.code === "RECOVERY_EMPTY_VERIFIED", "EMPTY_CODE_INVALID");
  recordManaged(empty, "recovery-verify-empty");
  assertExactResultKeys(empty.result, [
    ...recoveryCommonKeys,
    "expectedState",
    "ftsVerified",
    "integrityVerified",
    "rows",
    "stateDigest",
    "workspaceVersion",
  ]);
  assertRecoveryCommon(empty.result, markerDigest);
  ensure(empty.result.expectedState === "empty", "EMPTY_STATE_INVALID");
  ensure(
    empty.result.stateDigest === bootstrap.result.stateDigest,
    "EMPTY_STATE_CHANGED",
  );
  assertRows(empty.result.rows, 0);

  const applied = await launch({
    mode: "recovery-apply",
    workspaceId,
    wrapperName,
    databaseName,
    scenario: RECOVERY_CAPTURE_SCENARIO,
    failpoint: "none",
  });
  ensure(applied.result.status === "pass", "RECOVERY_APPLY_FAILED");
  ensure(
    applied.result.code === "RECOVERY_CAPTURE_APPLIED",
    "APPLY_CODE_INVALID",
  );
  recordManaged(applied, "recovery-apply");
  assertExactResultKeys(applied.result, [
    ...recoveryCommonKeys,
    "applicationKind",
    "connectionChanges",
    "ftsVerified",
    "integrityVerified",
    "outcomeDigest",
    "rows",
    "semanticFingerprint",
    "stateDigest",
    "workspaceVersion",
  ]);
  assertRecoveryCommon(applied.result, markerDigest);
  ensure(
    applied.result.applicationKind === "applied" &&
      Number.isSafeInteger(applied.result.connectionChanges) &&
      applied.result.connectionChanges > 0,
    "APPLY_EVIDENCE_INVALID",
  );
  assertRows(applied.result.rows, 1);

  const replay = await launch({
    mode: "recovery-apply",
    workspaceId,
    wrapperName,
    databaseName,
    scenario: RECOVERY_CAPTURE_SCENARIO,
    failpoint: "none",
  });
  ensure(replay.result.status === "pass", "RECOVERY_REPLAY_FAILED");
  ensure(
    replay.result.code === "RECOVERY_CAPTURE_REPLAYED",
    "REPLAY_CODE_INVALID",
  );
  recordManaged(replay, "recovery-apply");
  assertExactResultKeys(replay.result, [
    ...recoveryCommonKeys,
    "applicationKind",
    "connectionChanges",
    "ftsVerified",
    "integrityVerified",
    "outcomeDigest",
    "rows",
    "semanticFingerprint",
    "stateDigest",
    "workspaceVersion",
  ]);
  assertRecoveryCommon(replay.result, markerDigest);
  ensure(
    replay.result.applicationKind === "replayed" &&
      replay.result.connectionChanges === 0 &&
      replay.result.outcomeDigest === applied.result.outcomeDigest &&
      replay.result.semanticFingerprint ===
        applied.result.semanticFingerprint &&
      replay.result.stateDigest === applied.result.stateDigest,
    "REPLAY_EVIDENCE_INVALID",
  );
  assertRows(replay.result.rows, 1);

  const committed = await launch({
    mode: "recovery-verify-committed",
    workspaceId,
    wrapperName,
    databaseName,
    scenario: RECOVERY_CAPTURE_SCENARIO,
    failpoint: "none",
  });
  ensure(committed.result.status === "pass", "RECOVERY_COMMITTED_FAILED");
  ensure(
    committed.result.code === "RECOVERY_COMMITTED_VERIFIED",
    "COMMITTED_CODE_INVALID",
  );
  recordManaged(committed, "recovery-verify-committed");
  assertExactResultKeys(committed.result, [
    ...recoveryCommonKeys,
    "expectedState",
    "ftsVerified",
    "integrityVerified",
    "rows",
    "stateDigest",
    "workspaceVersion",
  ]);
  assertRecoveryCommon(committed.result, markerDigest);
  ensure(
    committed.result.expectedState === "committed" &&
      committed.result.stateDigest === applied.result.stateDigest,
    "COMMITTED_STATE_INVALID",
  );
  assertRows(committed.result.rows, 1);

  return Object.freeze({
    failpoint,
    rollbackVerified: true,
    plaintextWalControlVerified: boundary.plaintextWalControlVerified,
    walSpillObserved: boundary.walSpillObserved,
    walFrames: boundary.walFrames,
    stateDigest: committed.result.stateDigest,
    outcomeDigest: applied.result.outcomeDigest,
    replayConnectionChanges: replay.result.connectionChanges,
  });
}

const artifactPaths = [executable, appArchive, nativeAddon];
const artifactDigests = new Map();

ensure(process.argv.length === 2, "RUNNER_ARGUMENT_INVALID");

try {
  ensure(/^(darwin|win32)$/.test(process.platform), "PLATFORM_UNSUPPORTED");
  ensure(process.arch === "x64", "HOST_ARCH_UNSUPPORTED");
  for (const artifact of artifactPaths) {
    ensure(fs.existsSync(artifact), "PACKAGED_ARTIFACT_MISSING");
    artifactDigests.set(artifact, digestFile(artifact));
  }
  removeProbeKeychainItem();

  const provider = await launch({
    mode: "provider-initialize",
    workspaceId: "workspace-recovery-provider",
    wrapperName: "unused-recovery.wrap.json",
    databaseName: "unused-recovery.db",
  });
  ensure(provider.result.status === "pass", "PROVIDER_INITIALIZER_FAILED");
  ensure(
    provider.result.code === "PROVIDER_INITIALIZED",
    "PROVIDER_CODE_INVALID",
  );
  recordManaged(provider, "provider-initialize");
  assertExactResultKeys(provider.result, [
    "asyncEncryptionAvailable",
    "providerInitializationRoundTrip",
  ]);
  ensure(
    provider.result.asyncEncryptionAvailable === true &&
      provider.result.providerInitializationRoundTrip === true,
    "PROVIDER_INITIALIZATION_EVIDENCE_INVALID",
  );
  assertProbeKeychainItemPresent();

  const sentinels = [];
  sentinels.push(
    await runSentinel({
      slug: "after-begin",
      failpoint: "after-begin-immediate",
    }),
  );
  sentinels.push(
    await runSentinel({
      slug: "after-capture",
      failpoint: "after-capture-row",
    }),
  );

  ensure(processIds.size === 15, "PROCESS_COUNT_INVALID");
  ensure(verifiedManagedTerminations === 13, "MANAGED_PROCESS_COUNT_INVALID");
  ensure(verifiedForcedTerminations === 2, "FORCED_PROCESS_COUNT_INVALID");
  for (const [artifact, expected] of artifactDigests) {
    const actual = digestFile(artifact);
    try {
      ensure(sameDigest(actual, expected), "PACKAGED_ARTIFACT_CHANGED");
    } finally {
      actual.fill(0);
      expected.fill(0);
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      platform: process.platform,
      targetArchitecture: "x64",
      electron: "43.1.0",
      packagedForcedCrashRecovery: true,
      sentinels,
      distinctProcesses: processIds.size,
      verifiedManagedTerminations,
      verifiedForcedTerminations,
      completeProcessTreesKilled: true,
      inheritedPipesClosed: true,
      rollbackVerified: true,
      idempotentReplayVerified: true,
      zeroReplayChurn: true,
      workspaceVersionPreserved: true,
      plaintextWalControlVerified: true,
      encryptedWalSpillVerified: true,
      exactArtifactDigestsStable: true,
      provider:
        process.platform === "darwin"
          ? "Electron Keychain plus SQLCipher CommonCrypto"
          : "Electron DPAPI plus SQLCipher OpenSSL 3.5.7",
      identityTier:
        process.platform === "darwin"
          ? "same ad-hoc-signed packaged artifact"
          : "same unsigned packaged artifact and Windows user",
    })}\n`,
  );
} finally {
  try {
    removeProbeKeychainItem();
  } finally {
    await removeDirectory(stateRoot);
    for (const digest of artifactDigests.values()) digest.fill(0);
  }
}
