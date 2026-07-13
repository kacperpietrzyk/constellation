import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { launchManagedPackagedProcess } from "./packaged-process-harness.mjs";

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
  path.join(temporaryRoot, "constellation-packaged-store-probe-"),
);
const profile = path.join(stateRoot, "profile");
const workspace = "workspace-alpha";
const primaryWrapper = "primary.wrap.json";
const primaryDatabase = "primary.db";
const primaryWrapperPath = path.join(stateRoot, primaryWrapper);
const primaryDatabasePath = path.join(stateRoot, primaryDatabase);
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
  "result-ready",
  "result-published",
]);
const MAX_CAPTURED_OUTPUT_BYTES = 64 * 1024;
const processIds = new Set();
let verifiedProcessTerminations = 0;
const captured = [];
const forbiddenOutput = [
  Buffer.from('"keyMaterial"'),
  Buffer.from('"ciphertext"'),
  Buffer.from("constellation.packaged-store-key-payload/v1"),
];
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

function ensure(condition, code) {
  if (!condition) throw new Error(code);
}

function digestFile(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest();
}

function sameDigest(left, right) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function assertExactResultKeys(result, extraKeys = []) {
  const actual = Object.keys(result).sort();
  const expected = [...fixedResultKeys, ...extraKeys].sort();
  ensure(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    "CHILD_RESULT_SHAPE_INVALID",
  );
}

function inspectOutput(contents) {
  ensure(contents.length <= 64 * 1024, "OUTPUT_TOO_LARGE");
  for (const forbidden of forbiddenOutput) {
    ensure(!contents.includes(forbidden), "SENSITIVE_OUTPUT_SHAPE");
  }
  captured.push(contents);
}

function hasFixedResultFields(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.hasOwn(value, "declaredExitCode")
  );
}

function isFixedResultEnvelope(value) {
  return (
    hasFixedResultFields(value) &&
    (value.status === "pass" || value.status === "fail") &&
    typeof value.code === "string" &&
    Number.isInteger(value.declaredExitCode) &&
    value.declaredExitCode >= 0 &&
    value.declaredExitCode <= 255 &&
    ((value.status === "pass" && value.declaredExitCode === 0) ||
      (value.status === "fail" && value.declaredExitCode !== 0))
  );
}

function parseFixedResult(stdout) {
  const candidates = [];
  const lines = stdout.toString("utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (hasFixedResultFields(value)) candidates.push(value);
    } catch {
      // Chromium may emit unrelated diagnostic lines; only the exact bounded
      // result envelope is accepted as evidence.
    }
  }
  ensure(candidates.length === 1, "FIXED_RESULT_COUNT_INVALID");
  ensure(isFixedResultEnvelope(candidates[0]), "FIXED_RESULT_INVALID");
  return candidates[0];
}

async function launch({ mode, workspaceId, wrapperName, databaseName }) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const providerChannel = mode === "provider-initialize";
  const argumentsForProbe = [
    `--user-data-dir=${profile}`,
    `--probe-mode=${mode}`,
    `--probe-state-root=${stateRoot}`,
    `--probe-workspace=${workspaceId}`,
    `--probe-wrapper=${wrapperName}`,
    `--probe-database=${databaseName}`,
  ];
  const execution = await launchManagedPackagedProcess({
    executable,
    args: argumentsForProbe,
    environment,
    mode,
    errorContext: `${mode}:${wrapperName}:${databaseName}`,
    providerBootstrap: providerChannel
      ? {
          readyType: providerBootstrapReadyType,
          continueType: providerBootstrapContinueType,
        }
      : undefined,
    progressProtocol: { type: progressType, stages: progressStages },
    maxOutputBytes: MAX_CAPTURED_OUTPUT_BYTES,
  });
  let retainedOutput = false;
  try {
    inspectOutput(execution.stdout);
    inspectOutput(execution.stderr);
    retainedOutput = true;
    const result = parseFixedResult(execution.stdout);
    ensure(
      execution.actualCode === result.declaredExitCode &&
        execution.actualSignal === null,
      `PACKAGED_EXIT_STATUS_INVALID:${String(execution.actualCode)}:${String(execution.actualSignal)}:${result.declaredExitCode}`,
    );
    ensure(
      execution.providerBootstrapCompleted &&
        execution.providerBootstrapMessageCount === (providerChannel ? 1 : 0),
      "PROVIDER_BOOTSTRAP_EVIDENCE_INVALID",
    );
    return {
      actualCode: execution.actualCode,
      actualSignal: execution.actualSignal,
      declaredExitCode: result.declaredExitCode,
      providerBootstrapCompleted: execution.providerBootstrapCompleted,
      providerBootstrapMessageCount: execution.providerBootstrapMessageCount,
      childPid: execution.childPid,
      result,
    };
  } finally {
    if (!retainedOutput) {
      execution.stdout.fill(0);
      execution.stderr.fill(0);
    }
  }
}

function assertFixedIdentity(result, childPid, mode) {
  ensure(result.packaged === true, "CHILD_NOT_PACKAGED");
  ensure(result.architecture === "x64", "CHILD_ARCH_INVALID");
  ensure(result.electron === "43.1.0", "CHILD_ELECTRON_INVALID");
  ensure(result.platform === process.platform, "CHILD_PLATFORM_INVALID");
  ensure(result.processId === childPid, "CHILD_PROCESS_ID_INVALID");
  ensure(result.phase === mode, "CHILD_PHASE_INVALID");
  ensure(result.nativeAddonPackaged === true, "NATIVE_ADDON_PATH_INVALID");
}

function assertProvider(result) {
  ensure(result.asyncEncryptionAvailable === true, "SAFE_STORAGE_INVALID");
  ensure(result.cipherVersion === "4.16.0 community", "CIPHER_INVALID");
  ensure(result.rawKeyBinding === true, "RAW_KEY_BINDING_INVALID");
  ensure(result.fts5 === true, "FTS_INVALID");
  ensure(result.loadableExtensions === false, "EXTENSION_POLICY_INVALID");
  ensure(result.plaintextScan === true, "PLAINTEXT_SCAN_INVALID");
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

function recordProcess(execution, mode) {
  const { childPid, result } = execution;
  ensure(
    execution.actualCode === result.declaredExitCode &&
      execution.declaredExitCode === result.declaredExitCode &&
      execution.actualSignal === null,
    `CHILD_EXIT_STATUS_INVALID:${mode}`,
  );
  ensure(
    execution.providerBootstrapCompleted === true &&
      execution.providerBootstrapMessageCount ===
        (mode === "provider-initialize" ? 1 : 0),
    "PROVIDER_BOOTSTRAP_EVIDENCE_INVALID",
  );
  verifiedProcessTerminations += 1;
  assertFixedIdentity(result, childPid, mode);
  ensure(!processIds.has(result.processId), "PROCESS_REUSED");
  processIds.add(result.processId);
}

async function expectFailure(options, acceptedCodes, expectedState) {
  const execution = await launch(options);
  ensure(execution.declaredExitCode !== 0, "NEGATIVE_PROBE_SUCCEEDED");
  ensure(execution.result.status === "fail", "NEGATIVE_RESULT_INVALID");
  recordProcess(execution, options.mode);
  assertExactResultKeys(execution.result);
  ensure(
    acceptedCodes.includes(execution.result.code),
    "NEGATIVE_CODE_INVALID",
  );
  assertPrimaryUnchanged(expectedState);
}

function assertPrimaryUnchanged(expected) {
  for (const [filename, expectedDigest] of expected) {
    const exists = fs.existsSync(filename);
    ensure(exists === Boolean(expectedDigest), "PRIMARY_SIDECAR_SET_CHANGED");
    if (expectedDigest) {
      const actual = digestFile(filename);
      try {
        ensure(sameDigest(actual, expectedDigest), "PRIMARY_STATE_CHANGED");
      } finally {
        actual.fill(0);
      }
    }
  }
  assertPrimarySidecarsSafe();
  assertNoProbeTemps();
}

function snapshotPrimaryState() {
  const snapshot = new Map();
  for (const filename of [
    primaryWrapperPath,
    primaryDatabasePath,
    `${primaryDatabasePath}-wal`,
    `${primaryDatabasePath}-journal`,
  ]) {
    snapshot.set(
      filename,
      fs.existsSync(filename) ? digestFile(filename) : null,
    );
  }
  return snapshot;
}

function assertPrimarySidecarsSafe() {
  ensure(
    !fs.existsSync(`${primaryDatabasePath}-journal`),
    "PRIMARY_ROLLBACK_JOURNAL_RESIDUE",
  );
  for (const filename of [
    `${primaryDatabasePath}-wal`,
    `${primaryDatabasePath}-shm`,
  ]) {
    if (fs.existsSync(filename)) {
      const metadata = fs.lstatSync(filename);
      ensure(
        metadata.isFile() && !metadata.isSymbolicLink(),
        "PRIMARY_SIDECAR_INVALID",
      );
    }
  }
}

function clearSnapshot(snapshot) {
  for (const digest of snapshot.values()) digest?.fill(0);
}

function assertNoProbeTemps() {
  for (const entry of fs.readdirSync(stateRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      ensure(!entry.name.endsWith(".tmp"), "PROBE_TEMP_RESIDUE");
    }
  }
}

function writeFixture(name, contents) {
  fs.writeFileSync(path.join(stateRoot, name), contents, {
    flag: "wx",
    mode: 0o600,
  });
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

async function removeStateRoot() {
  await removeDirectory(stateRoot);
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

  const providerInitializer = await launch({
    mode: "provider-initialize",
    workspaceId: "workspace-provider-initialization",
    wrapperName: "unused-provider.wrap.json",
    databaseName: "unused-provider.db",
  });
  ensure(
    providerInitializer.declaredExitCode === 0,
    `PROVIDER_INITIALIZER_FAILED:${providerInitializer.result.code}`,
  );
  ensure(
    providerInitializer.result.status === "pass" &&
      providerInitializer.result.code === "PROVIDER_INITIALIZED",
    "PROVIDER_INITIALIZER_RESULT_INVALID",
  );
  recordProcess(providerInitializer, "provider-initialize");
  assertExactResultKeys(providerInitializer.result, [
    "asyncEncryptionAvailable",
    "providerInitializationRoundTrip",
  ]);
  ensure(
    providerInitializer.result.asyncEncryptionAvailable === true &&
      providerInitializer.result.providerInitializationRoundTrip === true,
    "PROVIDER_INITIALIZATION_EVIDENCE_INVALID",
  );
  ensure(
    !fs.existsSync(primaryWrapperPath) &&
      !fs.existsSync(primaryDatabasePath) &&
      !fs.existsSync(path.join(stateRoot, "unused-provider.wrap.json")) &&
      !fs.existsSync(path.join(stateRoot, "unused-provider.db")),
    "PROVIDER_INITIALIZATION_TOUCHED_STORE",
  );
  assertNoProbeTemps();
  assertProbeKeychainItemPresent();

  const writer = await launch({
    mode: "provision",
    workspaceId: workspace,
    wrapperName: primaryWrapper,
    databaseName: primaryDatabase,
  });
  ensure(writer.declaredExitCode === 0, `WRITER_FAILED:${writer.result.code}`);
  ensure(writer.result.status === "pass", "WRITER_RESULT_INVALID");
  ensure(writer.result.code === "STORE_PROVISIONED", "WRITER_CODE_INVALID");
  recordProcess(writer, "provision");
  assertExactResultKeys(writer.result, [
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
  assertProvider(writer.result);
  ensure(
    /^[a-f0-9]{64}$/.test(writer.result.markerDigest),
    "MARKER_DIGEST_INVALID",
  );
  ensure(writer.result.encryptedWal === true, "ENCRYPTED_WAL_INVALID");
  assertProbeKeychainItemPresent();

  ensure(fs.existsSync(primaryWrapperPath), "PRIMARY_WRAPPER_MISSING");
  ensure(fs.existsSync(primaryDatabasePath), "PRIMARY_DATABASE_MISSING");
  const header = fs.readFileSync(primaryDatabasePath).subarray(0, 16);
  ensure(header.toString("utf8") !== "SQLite format 3\0", "PLAINTEXT_DATABASE");
  header.fill(0);

  const reader = await launch({
    mode: "verify",
    workspaceId: workspace,
    wrapperName: primaryWrapper,
    databaseName: primaryDatabase,
  });
  ensure(reader.declaredExitCode === 0, `READER_FAILED:${reader.result.code}`);
  ensure(reader.result.status === "pass", "READER_RESULT_INVALID");
  ensure(reader.result.code === "STORE_VERIFIED", "READER_CODE_INVALID");
  recordProcess(reader, "verify");
  assertExactResultKeys(reader.result, [
    "asyncEncryptionAvailable",
    "cipherVersion",
    "fts5",
    "integrityVerified",
    "loadableExtensions",
    "markerDigest",
    "plaintextScan",
    "provider",
    "providerVersion",
    "rawKeyBinding",
  ]);
  assertProvider(reader.result);
  ensure(
    reader.result.markerDigest === writer.result.markerDigest,
    "RECOVERED_MARKER_MISMATCH",
  );
  ensure(reader.result.integrityVerified === true, "INTEGRITY_INVALID");
  const primaryState = snapshotPrimaryState();
  assertPrimaryUnchanged(primaryState);

  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "missing.wrap.json",
      databaseName: primaryDatabase,
    },
    ["WRAPPER_MISSING"],
    primaryState,
  );

  const primaryWrapperContents = fs.readFileSync(primaryWrapperPath);
  const parsedWrapper = JSON.parse(primaryWrapperContents.toString("utf8"));
  const flippedCiphertext = Buffer.from(parsedWrapper.ciphertext, "base64");
  flippedCiphertext[Math.floor(flippedCiphertext.length / 2)] ^= 0x01;
  parsedWrapper.ciphertext = flippedCiphertext.toString("base64");
  flippedCiphertext.fill(0);
  writeFixture(
    "flipped.wrap.json",
    Buffer.from(`${JSON.stringify(parsedWrapper)}\n`),
  );
  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "flipped.wrap.json",
      databaseName: primaryDatabase,
    },
    ["WRAPPER_DECRYPT_FAILED", "WRAPPER_INTEGRITY_FAILED"],
    primaryState,
  );

  const forgedContext = JSON.parse(primaryWrapperContents.toString("utf8"));
  forgedContext.workspaceId = "workspace-beta";
  writeFixture(
    "forged-context.wrap.json",
    Buffer.from(`${JSON.stringify(forgedContext)}\n`),
  );
  primaryWrapperContents.fill(0);
  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "forged-context.wrap.json",
      databaseName: primaryDatabase,
    },
    ["WRAPPER_CONTEXT_MISMATCH"],
    primaryState,
  );
  await expectFailure(
    {
      mode: "verify",
      workspaceId: "workspace-beta",
      wrapperName: "forged-context.wrap.json",
      databaseName: primaryDatabase,
    },
    ["WRAPPER_CONTEXT_MISMATCH"],
    primaryState,
  );

  const secondaryWriter = await launch({
    mode: "provision",
    workspaceId: workspace,
    wrapperName: "secondary.wrap.json",
    databaseName: "secondary.db",
  });
  ensure(secondaryWriter.declaredExitCode === 0, "SECONDARY_WRITER_FAILED");
  ensure(
    secondaryWriter.result.status === "pass" &&
      secondaryWriter.result.code === "STORE_PROVISIONED",
    "SECONDARY_WRITER_RESULT_INVALID",
  );
  recordProcess(secondaryWriter, "provision");
  assertExactResultKeys(secondaryWriter.result, [
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
  assertProvider(secondaryWriter.result);
  ensure(
    secondaryWriter.result.markerDigest !== writer.result.markerDigest,
    "SECONDARY_MARKER_REUSED",
  );
  assertPrimaryUnchanged(primaryState);

  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "secondary.wrap.json",
      databaseName: primaryDatabase,
    },
    ["DATABASE_OPEN_FAILED", "DATABASE_INTEGRITY_FAILED"],
    primaryState,
  );

  const plaintext = await launch({
    mode: "plaintext",
    workspaceId: workspace,
    wrapperName: "unused.wrap.json",
    databaseName: "plaintext.db",
  });
  ensure(plaintext.declaredExitCode === 0, "PLAINTEXT_SETUP_FAILED");
  ensure(
    plaintext.result.status === "pass" &&
      plaintext.result.code === "PLAINTEXT_FIXTURE_CREATED",
    "PLAINTEXT_SETUP_RESULT_INVALID",
  );
  recordProcess(plaintext, "plaintext");
  assertExactResultKeys(plaintext.result, ["plaintextFixtureCreated"]);
  assertPrimaryUnchanged(primaryState);
  const plaintextPath = path.join(stateRoot, "plaintext.db");
  ensure(fs.existsSync(plaintextPath), "PLAINTEXT_FIXTURE_MISSING");
  ensure(fs.statSync(plaintextPath).size > 512, "PLAINTEXT_FIXTURE_TOO_SMALL");
  const plaintextHeader = fs.readFileSync(plaintextPath).subarray(0, 16);
  ensure(
    plaintextHeader.toString("utf8") === "SQLite format 3\0",
    "PLAINTEXT_FIXTURE_INVALID",
  );
  plaintextHeader.fill(0);

  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: primaryWrapper,
      databaseName: "plaintext.db",
    },
    ["DATABASE_OPEN_FAILED"],
    primaryState,
  );

  const corruptDatabase = fs.readFileSync(primaryDatabasePath);
  ensure(corruptDatabase.length > 1024, "DATABASE_FIXTURE_TOO_SMALL");
  corruptDatabase[Math.min(512, corruptDatabase.length - 1)] ^= 0x01;
  writeFixture("corrupt.db", corruptDatabase);
  corruptDatabase.fill(0);
  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: primaryWrapper,
      databaseName: "corrupt.db",
    },
    ["DATABASE_OPEN_FAILED", "DATABASE_INTEGRITY_FAILED"],
    primaryState,
  );

  await expectFailure(
    {
      mode: "provision",
      workspaceId: workspace,
      wrapperName: primaryWrapper,
      databaseName: primaryDatabase,
    },
    ["WRAPPER_EXISTS", "DATABASE_EXISTS"],
    primaryState,
  );

  ensure(processIds.size === 13, "PROCESS_COUNT_INVALID");
  ensure(
    verifiedProcessTerminations === processIds.size,
    "PROCESS_TERMINATION_COUNT_INVALID",
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
  clearSnapshot(primaryState);
  for (const output of captured) output.fill(0);

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      platform: process.platform,
      targetArchitecture: "x64",
      electron: "43.1.0",
      packagedRelaunch: true,
      verifiedProcessTerminations,
      declaredExitCodesMatched: true,
      providerInitializationRoundTrip: true,
      phaseTwoIpcChannelAbsent: true,
      distinctProcesses: processIds.size,
      internallyGeneratedDek: true,
      asyncSafeStorage: true,
      rawKeyBinding: true,
      cipherVersion: "4.16.0 community",
      exactMarkerRecovered: true,
      encryptedDatabase: true,
      encryptedWal: true,
      nativeAddonDigestStable: true,
      missingWrapperRejected: true,
      corruptWrapperRejected: true,
      contextMismatchRejected: true,
      wrongKeyRejected: true,
      plaintextDatabaseRejected: true,
      corruptDatabaseRejected: true,
      existingStatePreserved: true,
      plaintextScan: true,
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
  for (const digest of artifactDigests.values()) digest.fill(0);
  for (const output of captured) output.fill(0);
  try {
    removeProbeKeychainItem();
  } finally {
    await removeStateRoot();
  }
}
