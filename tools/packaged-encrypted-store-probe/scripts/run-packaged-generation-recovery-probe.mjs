import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { getRecoveryCapturePlaintextCanaries } from "../app/recovery/capture-command.mjs";
import {
  GENERATION_PUBLICATION_IDS,
  GENERATION_PUBLICATION_SCENARIO,
  assertGenerationFaultBoundaryRecord,
  assertRecoverableGenerationSourceSidecars,
  getGenerationPublicationPaths,
} from "../app/recovery/generation-publication.mjs";
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
  "generation-setup-complete",
  "generation-candidate-verified",
  "generation-temporary-manifest-synced",
  "generation-manifest-replaced",
  "generation-state-verified",
  "generation-publication-applied",
  "generation-publication-replayed",
  "generation-publication-conflict-verified",
  "generation-fault-boundary-ready",
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
const generationResultKeys = [
  "activeGenerationId",
  "applicationKind",
  "asyncEncryptionAvailable",
  "candidateGenerationId",
  "candidateGenerationIdentityDigest",
  "candidateGenerationPresent",
  "candidateReadOnlyReopen",
  "cipherVersion",
  "diagnosticCode",
  "encryptedExport",
  "ftsVerified",
  "inputFingerprint",
  "integrityVerified",
  "manifestDigest",
  "markerDigest",
  "operationRecordDigest",
  "outcomeDigest",
  "provider",
  "providerVersion",
  "rawKeyBinding",
  "rows",
  "scenario",
  "sourceGenerationId",
  "sourceGenerationIdentityDigest",
  "sourceGenerationPresent",
  "stateDigest",
  "temporaryManifestPresent",
  "workspaceVersion",
  "wrapperDigest",
];
const provisionResultKeys = [
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
];
const forbiddenOutput = [
  Buffer.from('"keyMaterial"'),
  Buffer.from('"ciphertext"'),
  Buffer.from("constellation.packaged-store-key-payload/v1"),
  ...getRecoveryCapturePlaintextCanaries(),
];
const sentinelRoots = [];
const artifactPaths = [executable, appArchive, nativeAddon];
const artifactDigests = new Map();
const observedNumericProcessIds = new Set();
let verifiedProcessExecutions = 0;
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

function digestFileHex(filename) {
  const value = digestFile(filename);
  try {
    return value.toString("hex");
  } finally {
    value.fill(0);
  }
}

function sameDigest(left, right) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function inspectOutput(contents) {
  ensure(contents.length <= 64 * 1024, "OUTPUT_TOO_LARGE");
  for (const forbidden of forbiddenOutput) {
    ensure(!contents.includes(forbidden), "SENSITIVE_OUTPUT_SHAPE");
  }
}

function parseFixedResult(stdout) {
  const candidates = [];
  for (const line of stdout.toString("utf8").split(/\r?\n/).filter(Boolean)) {
    try {
      const value = JSON.parse(line);
      if (Object.hasOwn(value, "declaredExitCode")) candidates.push(value);
    } catch {
      // Bounded non-object Chromium diagnostics are not result evidence.
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

function assertExactResultKeys(result, extraKeys = []) {
  ensure(
    hasExactKeys(result, [...fixedResultKeys, ...extraKeys]),
    "CHILD_RESULT_SHAPE_INVALID",
  );
}

function parseGenerationFaultProgress(stderr, processId) {
  const stages = [];
  for (const line of stderr.toString("utf8").split(/\r?\n/).filter(Boolean)) {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      hasExactKeys(value, ["mode", "processId", "stage", "type"]) &&
      value.type === progressType &&
      value.mode === "generation-fault" &&
      value.processId === processId
    ) {
      ensure(progressStages.has(value.stage), "FAULT_PROGRESS_STAGE_INVALID");
      stages.push(value.stage);
    }
  }
  return stages;
}

function argumentsFor(stateRoot, options) {
  const args = [
    `--user-data-dir=${path.join(stateRoot, "profile")}`,
    `--probe-mode=${options.mode}`,
    `--probe-state-root=${stateRoot}`,
    `--probe-workspace=${options.workspaceId}`,
    `--probe-wrapper=${options.wrapperName}`,
    `--probe-database=${options.databaseName}`,
  ];
  if (options.scenario !== undefined) {
    args.push(
      `--probe-scenario=${options.scenario}`,
      `--probe-failpoint=${options.failpoint}`,
    );
  }
  return args;
}

async function launch(stateRoot, options) {
  const providerChannel = options.mode === "provider-initialize";
  const execution = await launchManagedPackagedProcess({
    executable,
    args: argumentsFor(stateRoot, options),
    mode: options.mode,
    errorContext: `${options.mode}:${options.workspaceId}`,
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

function recordProcessExecution(processId) {
  ensure(
    Number.isSafeInteger(processId) && processId > 0,
    "PROCESS_ID_INVALID",
  );
  observedNumericProcessIds.add(processId);
  verifiedProcessExecutions += 1;
}

function recordManaged(execution, mode) {
  ensure(
    execution.actualCode === execution.result.declaredExitCode &&
      execution.declaredExitCode === execution.result.declaredExitCode &&
      execution.actualSignal === null,
    `CHILD_EXIT_STATUS_INVALID:${mode}`,
  );
  assertFixedIdentity(execution, mode);
  recordProcessExecution(execution.childPid);
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

function assertRows(rows) {
  ensure(
    hasExactKeys(rows, [
      "audits",
      "captures",
      "events",
      "fts",
      "idempotency",
      "outbox",
    ]) && Object.values(rows).every((value) => value === 1),
    "GENERATION_ROWS_INVALID",
  );
}

function assertGenerationCommon(result, expected) {
  assertExactResultKeys(result, generationResultKeys);
  assertProvider(result);
  ensure(
    result.scenario === GENERATION_PUBLICATION_SCENARIO &&
      result.markerDigest === expected.markerDigest &&
      result.sourceGenerationId ===
        GENERATION_PUBLICATION_IDS.sourceGenerationId &&
      result.candidateGenerationId ===
        GENERATION_PUBLICATION_IDS.candidateGenerationId &&
      /^[a-f0-9]{64}$/.test(result.sourceGenerationIdentityDigest) &&
      /^[a-f0-9]{64}$/.test(result.candidateGenerationIdentityDigest) &&
      /^[a-f0-9]{64}$/.test(result.manifestDigest) &&
      /^[a-f0-9]{64}$/.test(result.operationRecordDigest) &&
      /^[a-f0-9]{64}$/.test(result.wrapperDigest) &&
      /^[a-f0-9]{64}$/.test(result.inputFingerprint) &&
      /^[a-f0-9]{64}$/.test(result.outcomeDigest) &&
      /^[a-f0-9]{64}$/.test(result.stateDigest) &&
      result.workspaceVersion === 1 &&
      result.sourceGenerationPresent === true &&
      result.candidateGenerationPresent === true &&
      result.integrityVerified === true &&
      result.ftsVerified === true &&
      result.encryptedExport === true &&
      result.candidateReadOnlyReopen === true,
    "GENERATION_RESULT_INVALID",
  );
  assertRows(result.rows);
  if (expected.setup === true) return;
  ensure(
    result.sourceGenerationIdentityDigest ===
      expected.setup.sourceGenerationIdentityDigest &&
      result.candidateGenerationIdentityDigest ===
        expected.setup.candidateGenerationIdentityDigest &&
      result.operationRecordDigest === expected.setup.operationRecordDigest &&
      result.wrapperDigest === expected.setup.wrapperDigest &&
      result.inputFingerprint === expected.setup.inputFingerprint &&
      result.outcomeDigest === expected.setup.outcomeDigest &&
      result.stateDigest === expected.setup.stateDigest,
    "GENERATION_RESULT_DIVERGED",
  );
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

function snapshotWorkspace(workspaceRoot, ignoredPaths = new Set()) {
  const entries = [];
  function visit(target) {
    if (ignoredPaths.has(target)) return;
    const metadata = fs.lstatSync(target, { bigint: true });
    ensure(!metadata.isSymbolicLink(), "WORKSPACE_SYMLINK_PRESENT");
    const relative = path.relative(workspaceRoot, target) || ".";
    if (metadata.isDirectory()) {
      entries.push([relative, "directory"]);
      for (const name of fs.readdirSync(target).sort()) {
        visit(path.join(target, name));
      }
      return;
    }
    ensure(metadata.isFile(), "WORKSPACE_ENTRY_INVALID");
    entries.push([
      relative,
      "file",
      metadata.size.toString(),
      (metadata.mode & 0o777n).toString(8),
      metadata.mtimeNs.toString(),
      digestFileHex(target),
    ]);
  }
  visit(workspaceRoot);
  return JSON.stringify(entries);
}

function snapshotAuthoritativeGenerationWorkspace(paths) {
  assertRecoverableGenerationSourceSidecars(paths.sourceDatabasePath);
  return snapshotWorkspace(
    paths.workspaceRoot,
    new Set([
      `${paths.sourceDatabasePath}-wal`,
      `${paths.sourceDatabasePath}-shm`,
    ]),
  );
}

function scanGenerationStateCanaries(stateRoot) {
  const canaries = getRecoveryCapturePlaintextCanaries();
  let files = 0;
  let bytes = 0;
  function visit(target) {
    const metadata = fs.lstatSync(target);
    ensure(!metadata.isSymbolicLink(), "STATE_SYMLINK_PRESENT");
    if (metadata.isDirectory()) {
      for (const name of fs.readdirSync(target).sort()) {
        visit(path.join(target, name));
      }
      return;
    }
    if (!metadata.isFile()) return;
    files += 1;
    bytes += metadata.size;
    ensure(files <= 20_000 && bytes <= 512 * 1024 * 1024, "STATE_SCAN_LIMIT");
    const contents = fs.readFileSync(target);
    try {
      ensure(
        canaries.every((canary) => !contents.includes(canary)),
        "CAPTURE_PLAINTEXT_EXPOSED",
      );
    } finally {
      contents.fill(0);
    }
  }
  try {
    visit(stateRoot);
  } finally {
    for (const canary of canaries) canary.fill(0);
  }
}

async function forceGenerationFault({
  stateRoot,
  workspaceId,
  failpoint,
  setup,
}) {
  const workspaceRoot = path.join(stateRoot, "workspace");
  const paths = getGenerationPublicationPaths(
    workspaceRoot,
    GENERATION_PUBLICATION_IDS.operationId,
  );
  const execution = await forceCrashPackagedProcessAtBoundary({
    executable,
    args: argumentsFor(stateRoot, {
      mode: "generation-fault",
      workspaceId,
      wrapperName: "key.wrap.json",
      databaseName: "bootstrap.db",
      scenario: GENERATION_PUBLICATION_SCENARIO,
      failpoint,
    }),
    errorContext: `${failpoint}:${workspaceId}`,
    parseBoundary: (line, processId) => {
      let record;
      try {
        record = JSON.parse(line.toString("utf8"));
      } catch {
        throw new Error("FAULT_BOUNDARY_INVALID");
      }
      if (Object.hasOwn(record, "declaredExitCode")) {
        throw new Error(`FAULT_CHILD_FAILED_BEFORE_BOUNDARY:${record.code}`);
      }
      assertGenerationFaultBoundaryRecord(record);
      ensure(record.processId === processId, "FAULT_PROCESS_ID_INVALID");
      ensure(record.failpoint === failpoint, "FAULT_POINT_INVALID");
      ensure(
        record.workspaceId === workspaceId &&
          record.operationId === GENERATION_PUBLICATION_IDS.operationId &&
          record.operationRecordDigest === setup.operationRecordDigest &&
          record.wrapperDigest === setup.wrapperDigest &&
          record.publicationOutcomeDigest === setup.outcomeDigest &&
          record.sourceGenerationPresent === true &&
          record.candidateGenerationPresent === true,
        "FAULT_BOUNDARY_STATE_INVALID",
      );
      if (failpoint === "after-temporary-manifest-synced") {
        ensure(
          record.activeGenerationId ===
            GENERATION_PUBLICATION_IDS.sourceGenerationId &&
            record.manifestDigest === setup.manifestDigest &&
            record.temporaryManifestPresent === true,
          "FAULT_PRE_REPLACE_STATE_INVALID",
        );
      } else {
        ensure(
          record.activeGenerationId ===
            GENERATION_PUBLICATION_IDS.candidateGenerationId &&
            record.manifestDigest === record.targetManifestDigest &&
            record.temporaryManifestPresent === false,
          "FAULT_POST_REPLACE_STATE_INVALID",
        );
      }
      return record;
    },
    beforeKill: () => {
      scanGenerationStateCanaries(stateRoot);
      return {
        workspaceSnapshot: snapshotAuthoritativeGenerationWorkspace(paths),
        manifestDigest: digestFileHex(
          path.join(workspaceRoot, "workspace.json"),
        ),
      };
    },
  });
  try {
    inspectOutput(execution.stdout);
    inspectOutput(execution.stderr);
    ensure(
      execution.stdoutProtocolCandidateCount === 1 &&
        execution.stdoutDiagnosticLineCount >= 0 &&
        execution.stdoutDiagnosticLineCount <= 32 &&
        execution.forcedKillVerified === true,
      "FAULT_TERMINATION_EVIDENCE_INVALID",
    );
    const stages = parseGenerationFaultProgress(
      execution.stderr,
      execution.childPid,
    );
    const expectedBoundaryStage =
      failpoint === "after-temporary-manifest-synced"
        ? "generation-temporary-manifest-synced"
        : "generation-manifest-replaced";
    ensure(
      stages.includes(expectedBoundaryStage) &&
        stages.at(-1) === "generation-fault-boundary-ready" &&
        !stages.includes("generation-publication-applied") &&
        !stages.includes("generation-publication-replayed") &&
        !stages.includes("result-ready") &&
        !stages.includes("result-published"),
      "FAULT_RESULT_PUBLICATION_BOUNDARY_INVALID",
    );
    ensure(
      snapshotAuthoritativeGenerationWorkspace(paths) ===
        execution.beforeKillEvidence.workspaceSnapshot &&
        digestFileHex(path.join(workspaceRoot, "workspace.json")) ===
          execution.beforeKillEvidence.manifestDigest,
      "POST_KILL_WORKSPACE_CHANGED",
    );
    scanGenerationStateCanaries(stateRoot);
    recordProcessExecution(execution.childPid);
    verifiedForcedTerminations += 1;
    return execution.boundary;
  } finally {
    execution.stdout.fill(0);
    execution.stderr.fill(0);
  }
}

function assertStableGenerationFiles(paths, baseline) {
  ensure(
    digestFileHex(paths.wrapperPath) === baseline.wrapper &&
      digestFileHex(paths.operationRecordPath) === baseline.operation &&
      digestFileHex(paths.sourceDatabasePath) === baseline.sourceDatabase &&
      digestFileHex(paths.candidateDatabasePath) === baseline.candidateDatabase,
    "GENERATION_IMMUTABLE_FILE_CHANGED",
  );
}

async function runSentinel({ slug, failpoint }) {
  const stateRoot = fs.mkdtempSync(
    path.join(
      temporaryRoot,
      `constellation-packaged-store-generation-${slug}-`,
    ),
  );
  sentinelRoots.push(stateRoot);
  const workspaceId = "workspace-generation-pivot";
  const baseOptions = {
    workspaceId,
    wrapperName: "key.wrap.json",
    databaseName: "bootstrap.db",
  };

  const provider = await launch(stateRoot, {
    ...baseOptions,
    mode: "provider-initialize",
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

  const provision = await launch(stateRoot, {
    ...baseOptions,
    mode: "provision",
  });
  ensure(
    provision.result.status === "pass" &&
      provision.result.code === "STORE_PROVISIONED",
    "GENERATION_PROVISION_FAILED",
  );
  recordManaged(provision, "provision");
  assertExactResultKeys(provision.result, provisionResultKeys);
  assertProvider(provision.result);
  const markerDigest = provision.result.markerDigest;

  const setupExecution = await launch(stateRoot, {
    ...baseOptions,
    mode: "generation-setup",
    scenario: GENERATION_PUBLICATION_SCENARIO,
    failpoint: "none",
  });
  ensure(
    setupExecution.result.status === "pass" &&
      setupExecution.result.code === "GENERATION_PUBLICATION_PREPARED",
    `GENERATION_SETUP_FAILED:${setupExecution.result.code}`,
  );
  recordManaged(setupExecution, "generation-setup");
  const setup = setupExecution.result;
  assertGenerationCommon(setup, { markerDigest, setup: true });
  ensure(
    setup.activeGenerationId ===
      GENERATION_PUBLICATION_IDS.sourceGenerationId &&
      setup.temporaryManifestPresent === false &&
      setup.applicationKind === "prepared" &&
      setup.diagnosticCode === null,
    "GENERATION_SETUP_STATE_INVALID",
  );

  const paths = getGenerationPublicationPaths(
    path.join(stateRoot, "workspace"),
    GENERATION_PUBLICATION_IDS.operationId,
  );
  const immutableBaseline = {
    wrapper: digestFileHex(paths.wrapperPath),
    operation: digestFileHex(paths.operationRecordPath),
    sourceDatabase: digestFileHex(paths.sourceDatabasePath),
    candidateDatabase: digestFileHex(paths.candidateDatabasePath),
  };
  ensure(
    immutableBaseline.wrapper === setup.wrapperDigest,
    "WRAPPER_DIGEST_MISMATCH",
  );
  scanGenerationStateCanaries(stateRoot);

  const boundary = await forceGenerationFault({
    stateRoot,
    workspaceId,
    failpoint,
    setup,
  });
  assertStableGenerationFiles(paths, immutableBaseline);

  const postReplace = failpoint === "after-manifest-replaced";
  const recoveredMode = postReplace
    ? "generation-verify-target"
    : "generation-verify-source";
  const recovered = await launch(stateRoot, {
    ...baseOptions,
    mode: recoveredMode,
    scenario: GENERATION_PUBLICATION_SCENARIO,
    failpoint: "none",
  });
  ensure(recovered.result.status === "pass", "GENERATION_RECOVERY_FAILED");
  ensure(
    recovered.result.code ===
      (postReplace
        ? "GENERATION_TARGET_VERIFIED"
        : "GENERATION_SOURCE_VERIFIED"),
    "GENERATION_RECOVERY_CODE_INVALID",
  );
  recordManaged(recovered, recoveredMode);
  assertGenerationCommon(recovered.result, { markerDigest, setup });
  ensure(
    recovered.result.activeGenerationId ===
      (postReplace
        ? GENERATION_PUBLICATION_IDS.candidateGenerationId
        : GENERATION_PUBLICATION_IDS.sourceGenerationId) &&
      recovered.result.temporaryManifestPresent === !postReplace &&
      recovered.result.applicationKind === "verified" &&
      recovered.result.diagnosticCode === null,
    "GENERATION_RECOVERED_STATE_INVALID",
  );

  let applied;
  if (!postReplace) {
    applied = await launch(stateRoot, {
      ...baseOptions,
      mode: "generation-publish",
      scenario: GENERATION_PUBLICATION_SCENARIO,
      failpoint: "none",
    });
    ensure(
      applied.result.status === "pass" &&
        applied.result.code === "GENERATION_PUBLICATION_APPLIED",
      "GENERATION_APPLY_FAILED",
    );
    recordManaged(applied, "generation-publish");
    assertGenerationCommon(applied.result, { markerDigest, setup });
    ensure(
      applied.result.applicationKind === "applied" &&
        applied.result.activeGenerationId ===
          GENERATION_PUBLICATION_IDS.candidateGenerationId &&
        applied.result.temporaryManifestPresent === false,
      "GENERATION_APPLY_STATE_INVALID",
    );
  }

  const beforeReplay = snapshotAuthoritativeGenerationWorkspace(paths);
  const replay = await launch(stateRoot, {
    ...baseOptions,
    mode: "generation-publish",
    scenario: GENERATION_PUBLICATION_SCENARIO,
    failpoint: "none",
  });
  ensure(
    replay.result.status === "pass" &&
      replay.result.code === "GENERATION_PUBLICATION_REPLAYED",
    "GENERATION_REPLAY_FAILED",
  );
  recordManaged(replay, "generation-publish");
  assertGenerationCommon(replay.result, { markerDigest, setup });
  ensure(
    replay.result.applicationKind === "replayed" &&
      replay.result.activeGenerationId ===
        GENERATION_PUBLICATION_IDS.candidateGenerationId &&
      replay.result.manifestDigest === boundary.targetManifestDigest &&
      replay.result.temporaryManifestPresent === false &&
      snapshotAuthoritativeGenerationWorkspace(paths) === beforeReplay,
    "GENERATION_REPLAY_CHURNED",
  );

  const beforeConflict = snapshotAuthoritativeGenerationWorkspace(paths);
  const conflict = await launch(stateRoot, {
    ...baseOptions,
    mode: "generation-conflict",
    scenario: GENERATION_PUBLICATION_SCENARIO,
    failpoint: "none",
  });
  ensure(
    conflict.result.status === "pass" &&
      conflict.result.code === "GENERATION_PUBLICATION_CONFLICT_VERIFIED",
    "GENERATION_CONFLICT_FAILED",
  );
  recordManaged(conflict, "generation-conflict");
  assertGenerationCommon(conflict.result, { markerDigest, setup });
  ensure(
    conflict.result.applicationKind === "conflict" &&
      conflict.result.diagnosticCode ===
        "generation.publication_input_conflict" &&
      conflict.result.activeGenerationId ===
        GENERATION_PUBLICATION_IDS.candidateGenerationId &&
      snapshotAuthoritativeGenerationWorkspace(paths) === beforeConflict,
    "GENERATION_CONFLICT_CHURNED",
  );

  const final = await launch(stateRoot, {
    ...baseOptions,
    mode: "generation-verify-target",
    scenario: GENERATION_PUBLICATION_SCENARIO,
    failpoint: "none",
  });
  ensure(
    final.result.status === "pass" &&
      final.result.code === "GENERATION_TARGET_VERIFIED",
    "GENERATION_FINAL_VERIFY_FAILED",
  );
  recordManaged(final, "generation-verify-target");
  assertGenerationCommon(final.result, { markerDigest, setup });
  ensure(
    final.result.activeGenerationId ===
      GENERATION_PUBLICATION_IDS.candidateGenerationId &&
      final.result.applicationKind === "verified" &&
      final.result.diagnosticCode === null &&
      final.result.manifestDigest === replay.result.manifestDigest,
    "GENERATION_FINAL_STATE_INVALID",
  );
  assertStableGenerationFiles(paths, immutableBaseline);
  scanGenerationStateCanaries(stateRoot);

  return Object.freeze({
    failpoint,
    activeGenerationAtCrash: boundary.activeGenerationId,
    temporaryManifestPresentAtCrash: boundary.temporaryManifestPresent,
    recoveredGeneration: recovered.result.activeGenerationId,
    finalGeneration: final.result.activeGenerationId,
    manifestDigest: final.result.manifestDigest,
    operationRecordDigest: final.result.operationRecordDigest,
    outcomeDigest: final.result.outcomeDigest,
    stateDigest: final.result.stateDigest,
    sourceGenerationRetained: true,
    candidateGenerationRetained: true,
    replayWithoutAuthoritativeWorkspaceChurn: true,
    conflictWithoutAuthoritativeWorkspaceChurn: true,
    resultPublishedBeforeCrash: false,
  });
}

ensure(process.argv.length === 2, "RUNNER_ARGUMENT_INVALID");

try {
  ensure(/^(darwin|win32)$/.test(process.platform), "PLATFORM_UNSUPPORTED");
  ensure(process.arch === "x64", "HOST_ARCH_UNSUPPORTED");
  for (const artifact of artifactPaths) {
    ensure(fs.existsSync(artifact), "PACKAGED_ARTIFACT_MISSING");
    artifactDigests.set(artifact, digestFile(artifact));
  }
  removeProbeKeychainItem();

  const sentinels = [];
  sentinels.push(
    await runSentinel({
      slug: "before-replace",
      failpoint: "after-temporary-manifest-synced",
    }),
  );
  sentinels.push(
    await runSentinel({
      slug: "after-replace",
      failpoint: "after-manifest-replaced",
    }),
  );
  ensure(
    sentinels.length === 2 &&
      sentinels.every(
        (sentinel) =>
          sentinel.finalGeneration ===
            GENERATION_PUBLICATION_IDS.candidateGenerationId &&
          sentinel.outcomeDigest === sentinels[0].outcomeDigest &&
          sentinel.stateDigest === sentinels[0].stateDigest,
      ),
    "GENERATION_SENTINELS_DIVERGED",
  );
  ensure(verifiedProcessExecutions === 17, "PROCESS_COUNT_INVALID");
  ensure(verifiedManagedTerminations === 15, "MANAGED_PROCESS_COUNT_INVALID");
  ensure(verifiedForcedTerminations === 2, "FORCED_PROCESS_COUNT_INVALID");
  ensure(
    observedNumericProcessIds.size > 0 &&
      observedNumericProcessIds.size <= verifiedProcessExecutions,
    "PROCESS_ID_ACCOUNTING_INVALID",
  );
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
      packagedGenerationPublicationRecovery: true,
      sentinels,
      processExecutions: verifiedProcessExecutions,
      uniqueNumericProcessIds: observedNumericProcessIds.size,
      numericPidReuseObserved:
        observedNumericProcessIds.size < verifiedProcessExecutions,
      verifiedManagedTerminations,
      verifiedForcedTerminations,
      capturedProcessIdentitiesTerminated: true,
      inheritedPipesClosed: true,
      manifestOnlyActivationVerified: true,
      encryptedSqlCipherExportVerified: true,
      candidateReadOnlyReopenVerified: true,
      sourceGenerationRetained: true,
      replayWithoutAuthoritativeWorkspaceChurnVerified: true,
      conflictWithoutAuthoritativeWorkspaceChurnVerified: true,
      capturePlaintextStateScanVerified: true,
      exactArtifactDigestsStable: true,
      processCrashScopeOnly: true,
      parentDirectoryDurabilityClaimed: false,
      provider:
        process.platform === "darwin"
          ? "Electron Keychain plus SQLCipher CommonCrypto"
          : "Electron DPAPI plus SQLCipher OpenSSL 3.5.7",
      terminationScope:
        process.platform === "darwin"
          ? "captured-posix-process-group"
          : "captured-windows-process-tree",
    })}\n`,
  );
} finally {
  try {
    removeProbeKeychainItem();
  } finally {
    for (const stateRoot of sentinelRoots.reverse()) {
      await removeDirectory(stateRoot);
    }
    for (const digest of artifactDigests.values()) digest.fill(0);
    for (const forbidden of forbiddenOutput) forbidden.fill(0);
  }
}
