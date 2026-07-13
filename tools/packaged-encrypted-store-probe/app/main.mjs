import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import originalFs from "original-fs";
import { app, safeStorage } from "electron";

import {
  RECOVERY_CAPTURE_FAILPOINTS,
  RECOVERY_CAPTURE_SCENARIO,
  RecoveryCaptureFixtureError,
  bootstrapRecoveryCaptureSchema,
  executeRecoveryCapture,
  executeRecoveryCaptureConflict,
  getRecoveryCapturePlaintextCanaries,
} from "./recovery/capture-command.mjs";
import { verifyRecoveryCaptureState } from "./recovery/capture-verifier.mjs";
import {
  createRecoveryFaultBoundaryRecord,
  createRecoveryPostCommitFaultBoundaryRecord,
  emitRecoveryFaultBoundaryRecord,
  emitRecoveryPostCommitFaultBoundaryRecord,
  holdForForcedTermination,
  prepareRecoveryWalFaultBaseline,
  verifyPlaintextRecoveryWalControl,
} from "./recovery/failpoint.mjs";
import {
  GENERATION_PUBLICATION_FAILPOINTS,
  GENERATION_PUBLICATION_IDS,
  GENERATION_PUBLICATION_SCENARIO,
  GenerationPublicationError,
  assertRecoverableGenerationSourceSidecars,
  createGenerationFaultBoundaryRecord,
  createGenerationPublicationFixture,
  digestGenerationValue,
  getGenerationPublicationPaths,
  publishGenerationManifest,
  verifyGenerationPublicationState,
  writeCanonicalGenerationFile,
} from "./recovery/generation-publication.mjs";
import {
  applySyntheticGenerationMigration,
  installInitialGenerationIdentity,
  verifyGenerationDatabaseIdentity,
} from "./recovery/generation-verifier.mjs";
import {
  GENERATION_CANDIDATE_BUILD_FAILPOINTS,
  GENERATION_CANDIDATE_BUILD_SCENARIO,
  GENERATION_PREPARATION_FAILPOINTS,
  GENERATION_PREPARATION_SCENARIO,
  createGenerationCandidateBuildFaultBoundaryRecord,
  createGenerationCandidateVerifiedRecord,
  createGenerationPreparationFaultBoundaryRecord,
  createGenerationPreparationIntent,
  getGenerationPreparationPaths,
  handoffPreparedGeneration,
  recoverUnsealedGenerationCandidateBuild,
  verifyGenerationPreparationRecordPrerequisites,
  verifyGenerationPreparationState,
} from "./recovery/generation-preparation.mjs";
import {
  IMMUTABLE_RECORD_FAILPOINTS,
  IMMUTABLE_RECORD_PUBLICATION_SCENARIO,
  createImmutableRecordFaultBoundaryRecord,
  publishImmutableGenerationRecord,
} from "./recovery/immutable-record-publication.mjs";

const APP_ID = "io.constellation.packaged-store-probe";
const APP_NAME = "Constellation Packaged Store Probe";
const ELECTRON_VERSION = "43.1.0";
const PAYLOAD_FORMAT = "constellation.packaged-store-key-payload/v1";
const WRAPPER_FORMAT = "constellation.packaged-store-key-wrapper/v1";
const KEY_VERSION = 1;
const MAX_WRAPPER_BYTES = 64 * 1024;
const MAX_SCAN_FILES = 20_000;
const MAX_SCAN_FILE_BYTES = 128 * 1024 * 1024;
const MAX_SCAN_TOTAL_BYTES = 512 * 1024 * 1024;
const PROVIDER_BOOTSTRAP_READY_TYPE =
  "constellation.packaged-store-probe.provider-bootstrap-ready/v1";
const PROVIDER_BOOTSTRAP_CONTINUE_TYPE =
  "constellation.packaged-store-probe.provider-bootstrap-continue/v1";
const PROGRESS_TYPE = "constellation.packaged-store-probe.progress/v1";
const PROGRESS_STAGES = new Set([
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
  "recovery-idempotency-conflict-verified",
  "recovery-fault-baseline-ready",
  "recovery-plaintext-control-verified",
  "recovery-post-commit-state-verified",
  "recovery-fault-boundary-ready",
  "generation-setup-complete",
  "generation-candidate-verified",
  "generation-temporary-manifest-synced",
  "generation-manifest-replaced",
  "generation-state-verified",
  "generation-publication-applied",
  "generation-publication-replayed",
  "generation-publication-conflict-verified",
  "generation-fault-boundary-ready",
  "generation-preparation-intent-written",
  "generation-preparation-candidate-verified",
  "generation-preparation-candidate-handed-off",
  "generation-preparation-state-verified",
  "generation-preparation-completed",
  "generation-preparation-fault-boundary-ready",
  "generation-record-intent-ready",
  "generation-record-candidate-verified-ready",
  "generation-record-operation-ready",
  "generation-record-source-ready",
  "generation-record-fault-boundary-ready",
  "generation-candidate-build-fault-boundary-ready",
  "result-ready",
  "result-published",
]);
const STANDARD_MODES = new Set([
  "provider-initialize",
  "provision",
  "verify",
  "plaintext",
]);
const RECOVERY_MODES = new Set([
  "recovery-bootstrap",
  "recovery-fault",
  "recovery-verify-empty",
  "recovery-apply",
  "recovery-conflict",
  "recovery-verify-committed",
]);
const GENERATION_MODES = new Set([
  "generation-setup",
  "generation-fault",
  "generation-verify-source",
  "generation-publish",
  "generation-conflict",
  "generation-verify-target",
]);
const GENERATION_PREPARATION_MODES = new Set([
  "generation-preparation-setup",
  "generation-preparation-fault",
  "generation-preparation-verify-staged",
  "generation-preparation-verify-final",
  "generation-preparation-complete",
]);
const GENERATION_RECORD_MODES = new Set([
  "generation-record-source-setup",
  "generation-record-fault",
  "generation-record-recover-intent",
  "generation-record-recover-verified",
  "generation-record-recover-operation",
]);
const GENERATION_CANDIDATE_BUILD_MODES = new Set([
  "generation-candidate-source-setup",
  "generation-candidate-fault",
  "generation-candidate-recover-verified",
]);
const EXIT_CODES = Object.freeze({
  CONFIG_INVALID: 80,
  PACKAGED_IDENTITY_INVALID: 81,
  ENCRYPTION_UNAVAILABLE: 82,
  WRAPPER_MISSING: 83,
  WRAPPER_INVALID: 84,
  WRAPPER_CONTEXT_MISMATCH: 85,
  WRAPPER_DECRYPT_FAILED: 86,
  WRAPPER_INTEGRITY_FAILED: 87,
  WRAPPER_EXISTS: 88,
  DATABASE_MISSING: 89,
  DATABASE_EXISTS: 90,
  DATABASE_OPEN_FAILED: 91,
  DATABASE_INTEGRITY_FAILED: 92,
  PLAINTEXT_EXPOSED: 93,
  PROVIDER_BOOTSTRAP_INVALID: 94,
  PROBE_FAILED: 99,
});

let config;
let nativeAddonPackaged = false;
let finishStarted = false;

class ProbeFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.exitCode = EXIT_CODES[code] ?? EXIT_CODES.PROBE_FAILED;
  }
}

function fail(code) {
  throw new ProbeFailure(code);
}

function rejectUnboundedOutput() {
  fail("PLAINTEXT_EXPOSED");
}

process.stdout.write = rejectUnboundedOutput;
process.stderr.write = rejectUnboundedOutput;
for (const method of ["debug", "error", "info", "log", "warn"]) {
  console[method] = rejectUnboundedOutput;
}

function fixedResult(status, code, extra = {}) {
  return {
    status,
    code,
    phase: config?.mode ?? "startup",
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    packaged: app.isPackaged,
    processId: process.pid,
    nativeAddonPackaged,
    ...extra,
  };
}

function writeFixedResult(result, declaredExitCode) {
  const output = Buffer.from(
    `${JSON.stringify({
      ...result,
      declaredExitCode,
    })}\n`,
    "utf8",
  );
  try {
    let offset = 0;
    while (offset < output.length) {
      const written = fs.writeSync(1, output, offset, output.length - offset);
      if (written <= 0) throw new Error("FIXED_RESULT_WRITE_FAILED");
      offset += written;
    }
  } finally {
    output.fill(0);
  }
}

function writeFixedProgress(stage) {
  if (!PROGRESS_STAGES.has(stage)) throw new Error("PROGRESS_STAGE_INVALID");
  const output = Buffer.from(
    `${JSON.stringify({
      type: PROGRESS_TYPE,
      mode: config?.mode ?? "startup",
      processId: process.pid,
      stage,
    })}\n`,
    "utf8",
  );
  try {
    let offset = 0;
    while (offset < output.length) {
      const written = fs.writeSync(2, output, offset, output.length - offset);
      if (written <= 0) throw new Error("FIXED_PROGRESS_WRITE_FAILED");
      offset += written;
    }
  } finally {
    output.fill(0);
  }
}

function awaitProviderBootstrapTurn() {
  if (
    typeof process.send !== "function" ||
    typeof process.disconnect !== "function" ||
    !process.connected ||
    !process.channel
  ) {
    fail("PROVIDER_BOOTSTRAP_INVALID");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      process.removeListener("disconnect", failBootstrap);
      process.removeListener("message", receiveBootstrap);
    };
    const failBootstrap = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ProbeFailure("PROVIDER_BOOTSTRAP_INVALID"));
    };
    const receiveBootstrap = (message) => {
      if (
        !hasExactKeys(message, ["mode", "processId", "type"]) ||
        message.type !== PROVIDER_BOOTSTRAP_CONTINUE_TYPE ||
        message.mode !== "provider-initialize" ||
        message.processId !== process.pid
      ) {
        failBootstrap();
        return;
      }

      settled = true;
      cleanup();
      setImmediate(() => {
        if (process.connected) process.disconnect();
      });
      resolve();
    };

    process.once("disconnect", failBootstrap);
    process.once("message", receiveBootstrap);
    try {
      process.send(
        {
          type: PROVIDER_BOOTSTRAP_READY_TYPE,
          mode: "provider-initialize",
          processId: process.pid,
          bootstrapEnvironmentCleared:
            process.env.NODE_CHANNEL_FD === undefined &&
            process.env.NODE_CHANNEL_SERIALIZATION_MODE === undefined,
        },
        (error) => {
          if (error) failBootstrap();
        },
      );
    } catch {
      failBootstrap();
    }
  });
}

function assertNoInheritedProviderChannel() {
  if (
    typeof process.send === "function" ||
    typeof process.disconnect === "function" ||
    process.connected === true ||
    process.channel ||
    process.env.NODE_CHANNEL_FD !== undefined ||
    process.env.NODE_CHANNEL_SERIALIZATION_MODE !== undefined
  ) {
    fail("PROVIDER_BOOTSTRAP_INVALID");
  }
}

function exitImmediately(exitCode) {
  if (typeof process.reallyExit !== "function") {
    throw new Error("IMMEDIATE_EXIT_UNAVAILABLE");
  }
  process.reallyExit(exitCode);
}

function finish(result, exitCode) {
  if (finishStarted) return;
  if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
    throw new Error("EXIT_CODE_INVALID");
  }
  finishStarted = true;
  writeFixedResult(result, exitCode);
  writeFixedProgress("result-published");
  if (config?.mode === "provider-initialize") app.exit(exitCode);
  else exitImmediately(exitCode);
}

function getArgument(name) {
  const prefix = `--probe-${name}=`;
  const matches = process.argv.filter((argument) =>
    argument.startsWith(prefix),
  );
  if (matches.length !== 1) fail("CONFIG_INVALID");
  return matches[0].slice(prefix.length);
}

function parseConfig() {
  const basePrefixes = [
    "--probe-mode=",
    "--probe-state-root=",
    "--probe-workspace=",
    "--probe-wrapper=",
    "--probe-database=",
  ];
  const mode = getArgument("mode");
  const recoveryMode = RECOVERY_MODES.has(mode);
  const generationMode = GENERATION_MODES.has(mode);
  const generationPreparationMode = GENERATION_PREPARATION_MODES.has(mode);
  const generationRecordMode = GENERATION_RECORD_MODES.has(mode);
  const generationCandidateBuildMode =
    GENERATION_CANDIDATE_BUILD_MODES.has(mode);
  const scenarioMode =
    recoveryMode ||
    generationMode ||
    generationPreparationMode ||
    generationRecordMode ||
    generationCandidateBuildMode;
  if (!STANDARD_MODES.has(mode) && !scenarioMode) fail("CONFIG_INVALID");
  const allowedPrefixes = scenarioMode
    ? [...basePrefixes, "--probe-scenario=", "--probe-failpoint="]
    : basePrefixes;
  const probeArguments = process.argv.filter((argument) =>
    argument.startsWith("--probe-"),
  );
  if (
    probeArguments.length !== allowedPrefixes.length ||
    probeArguments.some(
      (argument) =>
        !allowedPrefixes.some((prefix) => argument.startsWith(prefix)),
    )
  ) {
    fail("CONFIG_INVALID");
  }

  const stateRoot = getArgument("state-root");
  const workspaceId = getArgument("workspace");
  const wrapperName = getArgument("wrapper");
  const databaseName = getArgument("database");
  const scenario = scenarioMode ? getArgument("scenario") : undefined;
  const failpoint = scenarioMode ? getArgument("failpoint") : undefined;

  if (
    recoveryMode &&
    (scenario !== RECOVERY_CAPTURE_SCENARIO ||
      !RECOVERY_CAPTURE_FAILPOINTS.includes(failpoint) ||
      (mode === "recovery-fault" && failpoint === "none") ||
      (mode !== "recovery-fault" && failpoint !== "none"))
  ) {
    fail("CONFIG_INVALID");
  }
  if (
    generationMode &&
    (scenario !== GENERATION_PUBLICATION_SCENARIO ||
      !GENERATION_PUBLICATION_FAILPOINTS.includes(failpoint) ||
      (mode === "generation-fault" && failpoint === "none") ||
      (mode !== "generation-fault" && failpoint !== "none"))
  ) {
    fail("CONFIG_INVALID");
  }
  if (
    generationPreparationMode &&
    (scenario !== GENERATION_PREPARATION_SCENARIO ||
      !GENERATION_PREPARATION_FAILPOINTS.includes(failpoint) ||
      (mode === "generation-preparation-fault" && failpoint === "none") ||
      (mode !== "generation-preparation-fault" && failpoint !== "none"))
  ) {
    fail("CONFIG_INVALID");
  }
  if (
    generationRecordMode &&
    (scenario !== IMMUTABLE_RECORD_PUBLICATION_SCENARIO ||
      !IMMUTABLE_RECORD_FAILPOINTS.includes(failpoint) ||
      (mode === "generation-record-fault" && failpoint === "none") ||
      (mode !== "generation-record-fault" && failpoint !== "none"))
  ) {
    fail("CONFIG_INVALID");
  }
  if (
    generationCandidateBuildMode &&
    (scenario !== GENERATION_CANDIDATE_BUILD_SCENARIO ||
      !GENERATION_CANDIDATE_BUILD_FAILPOINTS.includes(failpoint) ||
      (mode === "generation-candidate-fault" && failpoint === "none") ||
      (mode !== "generation-candidate-fault" && failpoint !== "none"))
  ) {
    fail("CONFIG_INVALID");
  }
  if (!path.isAbsolute(stateRoot) || stateRoot.includes("\0")) {
    fail("CONFIG_INVALID");
  }
  if (!/^workspace-[a-z0-9-]{1,48}$/.test(workspaceId)) {
    fail("CONFIG_INVALID");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,47}\.wrap\.json$/.test(wrapperName)) {
    fail("CONFIG_INVALID");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,47}\.db$/.test(databaseName)) {
    fail("CONFIG_INVALID");
  }
  const resolvedRoot = path.resolve(stateRoot);
  const expectedUserData = path.join(resolvedRoot, "profile");
  return {
    mode,
    stateRoot: resolvedRoot,
    expectedUserData,
    expectedTemp: path.join(resolvedRoot, "temp"),
    expectedCrashDumps: path.join(resolvedRoot, "crash-dumps"),
    workspaceId,
    wrapperPath: path.join(resolvedRoot, wrapperName),
    databasePath: path.join(resolvedRoot, databaseName),
    generationWorkspaceRoot: path.join(resolvedRoot, "workspace"),
    scenario,
    failpoint,
  };
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

function pathsMatch(left, right) {
  try {
    return fs.realpathSync.native(left) === fs.realpathSync.native(right);
  } catch {
    return false;
  }
}

function pathKind(target, fileSystem = fs) {
  try {
    return fileSystem.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function closeQuietly(database) {
  try {
    database?.close();
  } catch {
    // Preserve the bounded primary failure while still attempting cleanup.
  }
}

function closeDatabase(database) {
  try {
    database.close();
  } catch {
    fail("DATABASE_INTEGRITY_FAILED");
  }
}

function createSensitiveScope() {
  const buffers = [];
  return {
    keep(buffer) {
      if (!Buffer.isBuffer(buffer)) fail("PROBE_FAILED");
      buffers.push(buffer);
      return buffer;
    },
    clear() {
      for (const buffer of buffers) buffer.fill(0);
      buffers.length = 0;
    },
  };
}

function addEncodedCanaries(scope, canaries, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail("PROBE_FAILED");
  const raw = scope.keep(Buffer.from(bytes));
  canaries.push(raw);
  for (const encoding of ["hex", "base64", "base64url"]) {
    const encoded = scope.keep(Buffer.from(bytes.toString(encoding), "utf8"));
    canaries.push(encoded);
  }
}

function containsCanary(contents, canaries) {
  return canaries.some(
    (canary) => canary.length > 0 && contents.includes(canary),
  );
}

function scanForCanaries(targets, canaries) {
  const budget = { files: 0, bytes: 0 };

  function inspectBytes(contents) {
    try {
      if (containsCanary(contents, canaries)) fail("PLAINTEXT_EXPOSED");
    } finally {
      contents.fill(0);
    }
  }

  function scan(target) {
    const metadata = pathKind(target);
    if (!metadata) return;
    budget.files += 1;
    if (budget.files > MAX_SCAN_FILES) fail("PROBE_FAILED");

    inspectBytes(Buffer.from(path.basename(target), "utf8"));
    if (metadata.isSymbolicLink()) {
      inspectBytes(Buffer.from(fs.readlinkSync(target), "utf8"));
      return;
    }
    if (metadata.isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) {
        scan(path.join(target, entry));
      }
      return;
    }
    if (!metadata.isFile()) return;
    if (metadata.size > MAX_SCAN_FILE_BYTES) fail("PROBE_FAILED");
    budget.bytes += metadata.size;
    if (budget.bytes > MAX_SCAN_TOTAL_BYTES) fail("PROBE_FAILED");
    inspectBytes(fs.readFileSync(target));
  }

  for (const target of targets) scan(target);
}

function publishAtomically(target, contents) {
  const temporary = path.join(
    path.dirname(target),
    `.packaged-store-${process.pid}-${crypto.randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;

  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, contents);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      fs.linkSync(temporary, target);
    } catch (error) {
      if (error?.code === "EEXIST") fail("WRAPPER_EXISTS");
      throw error;
    }
    fs.rmSync(temporary, { force: true });

    if (process.platform === "darwin") {
      const directory = fs.openSync(path.dirname(target), "r");
      try {
        fs.fsyncSync(directory);
      } finally {
        fs.closeSync(directory);
      }
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function reserveDatabase(target) {
  let descriptor;
  try {
    descriptor = fs.openSync(target, "wx", 0o600);
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (error?.code === "EEXIST") fail("DATABASE_EXISTS");
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function parseWrapper(contents) {
  if (contents.length === 0 || contents.length > MAX_WRAPPER_BYTES) {
    fail("WRAPPER_INVALID");
  }

  let wrapper;
  try {
    wrapper = JSON.parse(contents.toString("utf8"));
  } catch {
    fail("WRAPPER_INVALID");
  }
  if (
    !hasExactKeys(wrapper, [
      "format",
      "workspaceId",
      "keyVersion",
      "ciphertext",
      "payloadDigest",
    ]) ||
    wrapper.format !== WRAPPER_FORMAT ||
    wrapper.keyVersion !== KEY_VERSION ||
    typeof wrapper.ciphertext !== "string" ||
    !/^[a-f0-9]{64}$/.test(wrapper.payloadDigest)
  ) {
    fail("WRAPPER_INVALID");
  }
  if (wrapper.workspaceId !== config.workspaceId) {
    fail("WRAPPER_CONTEXT_MISMATCH");
  }

  const ciphertext = Buffer.from(wrapper.ciphertext, "base64");
  if (
    ciphertext.length === 0 ||
    ciphertext.toString("base64") !== wrapper.ciphertext
  ) {
    ciphertext.fill(0);
    fail("WRAPPER_INVALID");
  }
  return { wrapper, ciphertext };
}

async function requireAsyncEncryption() {
  let available;
  try {
    available = await safeStorage.isAsyncEncryptionAvailable();
  } catch {
    fail("ENCRYPTION_UNAVAILABLE");
  }
  if (available !== true) fail("ENCRYPTION_UNAVAILABLE");
}

async function encryptPayload(payload, canaries, scope) {
  let encrypted;
  try {
    encrypted = await safeStorage.encryptStringAsync(payload);
  } catch {
    fail("ENCRYPTION_UNAVAILABLE");
  }
  if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
    encrypted?.fill?.(0);
    fail("ENCRYPTION_UNAVAILABLE");
  }
  scope.keep(encrypted);
  if (containsCanary(encrypted, canaries)) fail("PLAINTEXT_EXPOSED");
  return encrypted;
}

async function initializeProvider() {
  const scope = createSensitiveScope();
  const canaries = [];
  const sentinel = "constellation-provider-initialization-sentinel-v1";
  try {
    await requireAsyncEncryption();
    addEncodedCanaries(
      scope,
      canaries,
      scope.keep(Buffer.from(sentinel, "utf8")),
    );
    const encrypted = await encryptPayload(sentinel, canaries, scope);
    let decrypted;
    try {
      decrypted = await safeStorage.decryptStringAsync(encrypted);
    } catch {
      fail("ENCRYPTION_UNAVAILABLE");
    }
    if (
      !hasExactKeys(decrypted, ["result", "shouldReEncrypt"]) ||
      decrypted.result !== sentinel ||
      typeof decrypted.shouldReEncrypt !== "boolean"
    ) {
      fail("ENCRYPTION_UNAVAILABLE");
    }
    return fixedResult("pass", "PROVIDER_INITIALIZED", {
      asyncEncryptionAvailable: true,
      providerInitializationRoundTrip: true,
    });
  } finally {
    scope.clear();
  }
}

async function unwrapKey(scope, canaries, wrapperPath = config.wrapperPath) {
  const metadata = pathKind(wrapperPath);
  if (!metadata) fail("WRAPPER_MISSING");
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("WRAPPER_INVALID");

  const contents = scope.keep(fs.readFileSync(wrapperPath));
  const { wrapper, ciphertext } = parseWrapper(contents);
  scope.keep(ciphertext);

  let decrypted;
  try {
    decrypted = await safeStorage.decryptStringAsync(ciphertext);
  } catch {
    fail("WRAPPER_DECRYPT_FAILED");
  }
  if (
    !hasExactKeys(decrypted, ["result", "shouldReEncrypt"]) ||
    typeof decrypted.result !== "string" ||
    typeof decrypted.shouldReEncrypt !== "boolean"
  ) {
    fail("WRAPPER_DECRYPT_FAILED");
  }
  addEncodedCanaries(
    scope,
    canaries,
    scope.keep(Buffer.from(decrypted.result, "utf8")),
  );

  const expectedDigest = scope.keep(Buffer.from(wrapper.payloadDigest, "hex"));
  const actualDigest = scope.keep(
    crypto.createHash("sha256").update(decrypted.result).digest(),
  );
  if (!crypto.timingSafeEqual(expectedDigest, actualDigest)) {
    fail("WRAPPER_INTEGRITY_FAILED");
  }

  let payload;
  try {
    payload = JSON.parse(decrypted.result);
  } catch {
    fail("WRAPPER_INVALID");
  }
  let key;
  if (typeof payload?.keyMaterial === "string") {
    key = scope.keep(Buffer.from(payload.keyMaterial, "base64url"));
    if (
      key.length === 32 &&
      key.toString("base64url") === payload.keyMaterial
    ) {
      addEncodedCanaries(scope, canaries, key);
    }
  }
  if (
    !hasExactKeys(payload, [
      "format",
      "workspaceId",
      "keyVersion",
      "keyMaterial",
      "markerDigest",
    ]) ||
    payload.format !== PAYLOAD_FORMAT ||
    payload.keyVersion !== KEY_VERSION ||
    typeof payload.keyMaterial !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.markerDigest)
  ) {
    fail("WRAPPER_INVALID");
  }
  if (payload.workspaceId !== config.workspaceId) {
    fail("WRAPPER_CONTEXT_MISMATCH");
  }

  if (
    !key ||
    key.length !== 32 ||
    key.toString("base64url") !== payload.keyMaterial
  ) {
    fail("WRAPPER_INVALID");
  }
  return { key, markerDigest: payload.markerDigest };
}

function openKeyedDatabase(
  Database,
  key,
  options,
  databasePath = config.databasePath,
) {
  let database;
  try {
    database = new Database(databasePath, options);
  } catch {
    key.fill(0);
    fail("DATABASE_OPEN_FAILED");
  }

  try {
    if (typeof database.key !== "function") fail("ENCRYPTION_UNAVAILABLE");
    try {
      database.key(key);
    } finally {
      key.fill(0);
    }
    database.prepare("SELECT count(*) AS count FROM sqlite_master").get();
    if (options.readonly) {
      database.pragma("query_only = ON");
      if (database.pragma("query_only", { simple: true }) !== 1) {
        fail("DATABASE_OPEN_FAILED");
      }
    }
    return database;
  } catch (error) {
    closeQuietly(database);
    if (error instanceof ProbeFailure) throw error;
    fail("DATABASE_OPEN_FAILED");
  }
}

function readEncryptionFacts(database) {
  let cipherVersion;
  let provider;
  let providerVersion;
  let compileOptions;
  try {
    cipherVersion = database.pragma("cipher_version", { simple: true });
    provider = database.pragma("cipher_provider", { simple: true });
    providerVersion = database.pragma("cipher_provider_version", {
      simple: true,
    });
    compileOptions = new Set(
      database.pragma("compile_options").map((row) => row.compile_options),
    );
  } catch {
    fail("ENCRYPTION_UNAVAILABLE");
  }

  const expectedProvider =
    process.platform === "darwin" ? "commoncrypto" : "openssl";
  if (
    cipherVersion !== "4.16.0 community" ||
    provider !== expectedProvider ||
    typeof providerVersion !== "string" ||
    !/^[\x20-\x7e]{1,128}$/.test(providerVersion) ||
    (process.platform === "win32" &&
      !/^OpenSSL 3\.5\.7\b/.test(providerVersion)) ||
    !compileOptions.has("HAS_CODEC") ||
    !compileOptions.has("ENABLE_FTS5") ||
    !compileOptions.has("TEMP_STORE=2") ||
    !compileOptions.has("OMIT_LOAD_EXTENSION")
  ) {
    fail("ENCRYPTION_UNAVAILABLE");
  }

  let directExtensionDisabled = false;
  try {
    database.loadExtension("constellation-probe-disabled");
  } catch (error) {
    directExtensionDisabled =
      error instanceof TypeError &&
      error.message === "Loadable extensions are disabled";
  }
  let sqlExtensionDisabled = false;
  try {
    database
      .prepare("SELECT load_extension(?)")
      .get("constellation-probe-disabled");
  } catch (error) {
    sqlExtensionDisabled = /no such function: load_extension/i.test(
      String(error?.message),
    );
  }
  if (!directExtensionDisabled || !sqlExtensionDisabled) {
    fail("ENCRYPTION_UNAVAILABLE");
  }

  return { cipherVersion, provider, providerVersion };
}

function configureSchema(database) {
  try {
    database.pragma("foreign_keys = ON");
    database.pragma("synchronous = FULL");
    if (database.pragma("journal_mode = WAL", { simple: true }) !== "wal") {
      fail("ENCRYPTION_UNAVAILABLE");
    }
    database.pragma("wal_autocheckpoint = 0");
    database.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE records (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        body TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE records_fts USING fts5(
        body,
        content=records,
        content_rowid=rowid
      );
      CREATE TRIGGER records_fts_insert AFTER INSERT ON records BEGIN
        INSERT INTO records_fts(rowid, body) VALUES (new.rowid, new.body);
      END;
      CREATE TRIGGER records_fts_delete AFTER DELETE ON records BEGIN
        INSERT INTO records_fts(records_fts, rowid, body)
        VALUES ('delete', old.rowid, old.body);
      END;
      CREATE TRIGGER records_fts_update AFTER UPDATE ON records BEGIN
        INSERT INTO records_fts(records_fts, rowid, body)
        VALUES ('delete', old.rowid, old.body);
        INSERT INTO records_fts(rowid, body) VALUES (new.rowid, new.body);
      END;
    `);
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    fail("DATABASE_INTEGRITY_FAILED");
  }
}

function insertMarker(database, marker) {
  try {
    database.transaction(() => {
      database
        .prepare("INSERT INTO workspaces (id) VALUES (?)")
        .run(config.workspaceId);
      database
        .prepare(
          "INSERT INTO records (id, workspace_id, body) VALUES (?, ?, ?)",
        )
        .run("probe-record", config.workspaceId, marker);
    })();
  } catch {
    fail("DATABASE_INTEGRITY_FAILED");
  }
}

function readAndVerifyMarker(database, expectedDigest) {
  let marker;
  try {
    database.pragma("foreign_keys = ON");
    if (database.pragma("foreign_keys", { simple: true }) !== 1) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    if (database.pragma("journal_mode", { simple: true }) !== "wal") {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    const row = database
      .prepare("SELECT body FROM records WHERE id = ? AND workspace_id = ?")
      .get("probe-record", config.workspaceId);
    if (!hasExactKeys(row, ["body"]) || !/^[a-f0-9]{64}$/.test(row.body)) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    marker = row.body;
    const ftsRow = database
      .prepare(
        "SELECT count(*) AS count FROM records_fts WHERE records_fts MATCH ?",
      )
      .get(marker);
    if (!hasExactKeys(ftsRow, ["count"]) || ftsRow.count !== 1) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    fail("DATABASE_INTEGRITY_FAILED");
  }

  const actualDigest = crypto.createHash("sha256").update(marker).digest();
  const expected = Buffer.from(expectedDigest, "hex");
  try {
    if (!crypto.timingSafeEqual(actualDigest, expected)) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
  } finally {
    actualDigest.fill(0);
    expected.fill(0);
  }
  return marker;
}

function verifyDatabaseIntegrity(database) {
  try {
    if (
      !Array.isArray(database.pragma("cipher_integrity_check")) ||
      database.pragma("cipher_integrity_check").length !== 0 ||
      database.pragma("integrity_check", { simple: true }) !== "ok" ||
      database.pragma("foreign_key_check").length !== 0
    ) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    fail("DATABASE_INTEGRITY_FAILED");
  }
}

function assertEncryptedDatabaseAndWal(
  canaries,
  databasePath = config.databasePath,
) {
  const databaseContents = fs.readFileSync(databasePath);
  try {
    if (
      databaseContents.subarray(0, 16).toString("utf8") ===
        "SQLite format 3\0" ||
      containsCanary(databaseContents, canaries)
    ) {
      fail("PLAINTEXT_EXPOSED");
    }
  } finally {
    databaseContents.fill(0);
  }

  const walPath = `${databasePath}-wal`;
  const metadata = pathKind(walPath);
  if (!metadata?.isFile() || metadata.size <= 32) {
    fail("DATABASE_INTEGRITY_FAILED");
  }
  const walContents = fs.readFileSync(walPath);
  try {
    if (containsCanary(walContents, canaries)) fail("PLAINTEXT_EXPOSED");
  } finally {
    walContents.fill(0);
  }
}

function assertEncryptedDatabaseFile(canaries, databasePath) {
  const metadata = pathKind(databasePath);
  if (!metadata?.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    fail("DATABASE_INTEGRITY_FAILED");
  }
  const contents = fs.readFileSync(databasePath);
  try {
    if (
      contents.subarray(0, 16).toString("utf8") === "SQLite format 3\0" ||
      containsCanary(contents, canaries)
    ) {
      fail("PLAINTEXT_EXPOSED");
    }
  } finally {
    contents.fill(0);
  }
}

function createRecoveryCaptureCanaries(scope) {
  const canaries = getRecoveryCapturePlaintextCanaries();
  for (const canary of canaries) {
    scope.keep(canary);
  }
  return canaries;
}

function scanGenerationSecrets(secretCanaries, captureCanaries) {
  scanKnownSecrets(secretCanaries);
  scanForCanaries([config.stateRoot], captureCanaries);
}

function scanKnownSecrets(canaries) {
  scanForCanaries(
    [
      config.stateRoot,
      path.join(process.resourcesPath, "app.asar"),
      path.join(process.resourcesPath, "app.asar.unpacked"),
    ],
    canaries,
  );
}

async function provisionStore(Database) {
  if (pathKind(config.wrapperPath)) fail("WRAPPER_EXISTS");
  if (pathKind(config.databasePath)) fail("DATABASE_EXISTS");
  writeFixedProgress("provision-started");

  const scope = createSensitiveScope();
  const canaries = [];
  let database;
  try {
    const key = scope.keep(crypto.randomBytes(32));
    const markerBytes = scope.keep(crypto.randomBytes(32));
    const marker = markerBytes.toString("hex");
    const markerDigest = crypto
      .createHash("sha256")
      .update(marker)
      .digest("hex");
    const keyMaterial = key.toString("base64url");
    const payload = JSON.stringify({
      format: PAYLOAD_FORMAT,
      workspaceId: config.workspaceId,
      keyVersion: KEY_VERSION,
      keyMaterial,
      markerDigest,
    });

    addEncodedCanaries(scope, canaries, key);
    addEncodedCanaries(scope, canaries, markerBytes);
    addEncodedCanaries(
      scope,
      canaries,
      scope.keep(Buffer.from(marker, "utf8")),
    );
    addEncodedCanaries(
      scope,
      canaries,
      scope.keep(Buffer.from(payload, "utf8")),
    );
    writeFixedProgress("material-prepared");

    const encrypted = await encryptPayload(payload, canaries, scope);
    writeFixedProgress("wrapper-encrypted");
    const payloadDigest = crypto
      .createHash("sha256")
      .update(payload)
      .digest("hex");
    const wrapperContents = scope.keep(
      Buffer.from(
        `${JSON.stringify({
          format: WRAPPER_FORMAT,
          workspaceId: config.workspaceId,
          keyVersion: KEY_VERSION,
          ciphertext: encrypted.toString("base64"),
          payloadDigest,
        })}\n`,
        "utf8",
      ),
    );
    if (containsCanary(wrapperContents, canaries)) {
      fail("PLAINTEXT_EXPOSED");
    }

    publishAtomically(config.wrapperPath, wrapperContents);
    writeFixedProgress("wrapper-published");
    reserveDatabase(config.databasePath);
    writeFixedProgress("database-reserved");
    database = openKeyedDatabase(Database, key, { fileMustExist: true });
    writeFixedProgress("database-opened");
    const facts = readEncryptionFacts(database);
    writeFixedProgress("database-facts-verified");
    configureSchema(database);
    writeFixedProgress("schema-created");
    insertMarker(database, marker);
    writeFixedProgress("marker-inserted");
    readAndVerifyMarker(database, markerDigest);
    writeFixedProgress("marker-verified");
    verifyDatabaseIntegrity(database);
    writeFixedProgress("integrity-verified");
    assertEncryptedDatabaseAndWal(canaries);
    scanKnownSecrets(canaries);
    writeFixedProgress("live-store-scanned");
    closeDatabase(database);
    database = undefined;
    writeFixedProgress("database-closed");
    scanKnownSecrets(canaries);
    writeFixedProgress("closed-store-scanned");

    return fixedResult("pass", "STORE_PROVISIONED", {
      asyncEncryptionAvailable: true,
      cipherVersion: facts.cipherVersion,
      provider: facts.provider,
      providerVersion: facts.providerVersion,
      rawKeyBinding: true,
      fts5: true,
      loadableExtensions: false,
      plaintextScan: true,
      markerDigest,
      encryptedWal: true,
    });
  } finally {
    closeQuietly(database);
    try {
      if (canaries.length > 0) scanKnownSecrets(canaries);
    } finally {
      scope.clear();
    }
  }
}

async function verifyStore(Database) {
  const scope = createSensitiveScope();
  const canaries = [];
  let database;
  try {
    const { key, markerDigest } = await unwrapKey(scope, canaries);
    const metadata = pathKind(config.databasePath);
    if (!metadata) fail("DATABASE_MISSING");
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      fail("DATABASE_OPEN_FAILED");
    }

    database = openKeyedDatabase(Database, key, {
      readonly: true,
      fileMustExist: true,
    });
    const facts = readEncryptionFacts(database);
    const marker = readAndVerifyMarker(database, markerDigest);
    addEncodedCanaries(
      scope,
      canaries,
      scope.keep(Buffer.from(marker, "utf8")),
    );
    verifyDatabaseIntegrity(database);
    scanKnownSecrets(canaries);
    closeDatabase(database);
    database = undefined;
    scanKnownSecrets(canaries);

    return fixedResult("pass", "STORE_VERIFIED", {
      asyncEncryptionAvailable: true,
      cipherVersion: facts.cipherVersion,
      provider: facts.provider,
      providerVersion: facts.providerVersion,
      rawKeyBinding: true,
      fts5: true,
      loadableExtensions: false,
      plaintextScan: true,
      markerDigest,
      integrityVerified: true,
    });
  } finally {
    closeQuietly(database);
    try {
      if (canaries.length > 0) scanKnownSecrets(canaries);
    } finally {
      scope.clear();
    }
  }
}

function createPlaintextFixture(Database) {
  if (pathKind(config.databasePath)) fail("DATABASE_EXISTS");
  reserveDatabase(config.databasePath);

  let database;
  try {
    try {
      database = new Database(config.databasePath, { fileMustExist: true });
    } catch {
      fail("DATABASE_OPEN_FAILED");
    }
    database.exec(`
      CREATE TABLE plaintext_fixture (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    database
      .prepare("INSERT INTO plaintext_fixture (id, value) VALUES (?, ?)")
      .run(1, "ordinary-unkeyed-sqlite");
    if (database.pragma("integrity_check", { simple: true }) !== "ok") {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    closeDatabase(database);
    database = undefined;
    return fixedResult("pass", "PLAINTEXT_FIXTURE_CREATED", {
      plaintextFixtureCreated: true,
    });
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    fail("PROBE_FAILED");
  } finally {
    closeQuietly(database);
  }
}

async function useRecoveryStore(Database, { readonly, operation }) {
  const scope = createSensitiveScope();
  const canaries = [];
  let database;
  try {
    const { key, markerDigest } = await unwrapKey(scope, canaries);
    const metadata = pathKind(config.databasePath);
    if (!metadata) fail("DATABASE_MISSING");
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      fail("DATABASE_OPEN_FAILED");
    }
    database = openKeyedDatabase(Database, key, {
      readonly,
      fileMustExist: true,
    });
    const facts = readEncryptionFacts(database);
    const marker = readAndVerifyMarker(database, markerDigest);
    addEncodedCanaries(
      scope,
      canaries,
      scope.keep(Buffer.from(marker, "utf8")),
    );
    verifyDatabaseIntegrity(database);
    scanKnownSecrets(canaries);

    const operationResult = await operation(database);
    readAndVerifyMarker(database, markerDigest);
    verifyDatabaseIntegrity(database);
    scanKnownSecrets(canaries);
    closeDatabase(database);
    database = undefined;
    scanKnownSecrets(canaries);
    return fixedResult("pass", operationResult.code, {
      asyncEncryptionAvailable: true,
      cipherVersion: facts.cipherVersion,
      provider: facts.provider,
      providerVersion: facts.providerVersion,
      rawKeyBinding: true,
      markerDigest,
      ...operationResult.evidence,
    });
  } finally {
    closeQuietly(database);
    try {
      if (canaries.length > 0) scanKnownSecrets(canaries);
    } finally {
      scope.clear();
    }
  }
}

async function runRecoveryMode(Database) {
  const readonly = new Set([
    "recovery-verify-empty",
    "recovery-verify-committed",
  ]).has(config.mode);
  return await useRecoveryStore(Database, {
    readonly,
    operation: async (database) => {
      switch (config.mode) {
        case "recovery-bootstrap": {
          const bootstrap = bootstrapRecoveryCaptureSchema(database);
          writeFixedProgress("recovery-schema-bootstrapped");
          const verification = verifyRecoveryCaptureState(database, {
            expectedState: "empty",
          });
          writeFixedProgress("recovery-state-verified");
          return {
            code: "RECOVERY_BOOTSTRAPPED",
            evidence: {
              scenario: config.scenario,
              workspaceVersion: bootstrap.workspaceVersion,
              rows: verification.rows,
              stateDigest: verification.stateDigest,
              integrityVerified: verification.integrityVerified,
              ftsVerified: verification.ftsVerified,
            },
          };
        }
        case "recovery-verify-empty": {
          const verification = verifyRecoveryCaptureState(database, {
            expectedState: "empty",
          });
          writeFixedProgress("recovery-state-verified");
          return {
            code: "RECOVERY_EMPTY_VERIFIED",
            evidence: {
              scenario: config.scenario,
              expectedState: verification.expectedState,
              workspaceVersion: verification.workspaceVersion,
              rows: verification.rows,
              stateDigest: verification.stateDigest,
              integrityVerified: verification.integrityVerified,
              ftsVerified: verification.ftsVerified,
            },
          };
        }
        case "recovery-apply": {
          const execution = executeRecoveryCapture(database);
          writeFixedProgress("recovery-command-applied");
          const verification = verifyRecoveryCaptureState(database, {
            expectedState: "committed",
          });
          writeFixedProgress("recovery-state-verified");
          return {
            code:
              execution.kind === "applied"
                ? "RECOVERY_CAPTURE_APPLIED"
                : "RECOVERY_CAPTURE_REPLAYED",
            evidence: {
              scenario: config.scenario,
              applicationKind: execution.kind,
              connectionChanges: execution.connectionChanges,
              outcomeDigest: execution.outcomeDigest,
              semanticFingerprint: execution.semanticFingerprint,
              workspaceVersion: verification.workspaceVersion,
              rows: verification.rows,
              stateDigest: verification.stateDigest,
              integrityVerified: verification.integrityVerified,
              ftsVerified: verification.ftsVerified,
            },
          };
        }
        case "recovery-conflict": {
          const execution = executeRecoveryCaptureConflict(database);
          const verification = verifyRecoveryCaptureState(database, {
            expectedState: "committed",
          });
          writeFixedProgress("recovery-idempotency-conflict-verified");
          return {
            code: "RECOVERY_IDEMPOTENCY_CONFLICT_VERIFIED",
            evidence: {
              scenario: config.scenario,
              applicationKind: execution.kind,
              diagnosticCode: execution.diagnosticCode,
              connectionChanges: execution.connectionChanges,
              requestedSemanticFingerprint:
                execution.requestedSemanticFingerprint,
              storedSemanticFingerprint: execution.storedSemanticFingerprint,
              storedOutcomeDigest: execution.storedOutcomeDigest,
              workspaceVersion: verification.workspaceVersion,
              rows: verification.rows,
              stateDigest: verification.stateDigest,
              integrityVerified: verification.integrityVerified,
              ftsVerified: verification.ftsVerified,
            },
          };
        }
        case "recovery-verify-committed": {
          const verification = verifyRecoveryCaptureState(database, {
            expectedState: "committed",
          });
          writeFixedProgress("recovery-state-verified");
          return {
            code: "RECOVERY_COMMITTED_VERIFIED",
            evidence: {
              scenario: config.scenario,
              expectedState: verification.expectedState,
              workspaceVersion: verification.workspaceVersion,
              rows: verification.rows,
              stateDigest: verification.stateDigest,
              integrityVerified: verification.integrityVerified,
              ftsVerified: verification.ftsVerified,
            },
          };
        }
        case "recovery-fault": {
          const baseline = prepareRecoveryWalFaultBaseline(database, {
            walPath: `${config.databasePath}-wal`,
            cacheSizePages: 8,
          });
          writeFixedProgress("recovery-fault-baseline-ready");
          const plaintextWalControlVerified = verifyPlaintextRecoveryWalControl(
            Database,
            {
              databasePath: path.join(
                config.expectedTemp,
                `${config.failpoint}-plaintext-control.db`,
              ),
              expectedPageSize: baseline.walPageSize,
              cacheSizePages: baseline.cacheSizePages,
              failpoint: config.failpoint,
            },
          );
          writeFixedProgress("recovery-plaintext-control-verified");
          executeRecoveryCapture(database, {
            failpoint: config.failpoint,
            reachFailpoint: ({ failpoint, visibleRows }) => {
              const postCommit = failpoint === "after-commit-before-result";
              const boundary = postCommit
                ? createRecoveryPostCommitFaultBoundaryRecord({
                    database,
                    walPath: `${config.databasePath}-wal`,
                    failpoint,
                    visibleRows,
                    baseline,
                    plaintextWalControlVerified,
                  })
                : createRecoveryFaultBoundaryRecord({
                    database,
                    walPath: `${config.databasePath}-wal`,
                    failpoint,
                    visibleRows,
                    baseline,
                    plaintextWalControlVerified,
                  });
              if (postCommit) {
                writeFixedProgress("recovery-post-commit-state-verified");
              }
              writeFixedProgress("recovery-fault-boundary-ready");
              if (postCommit) {
                emitRecoveryPostCommitFaultBoundaryRecord(boundary);
              } else {
                emitRecoveryFaultBoundaryRecord(boundary);
              }
              holdForForcedTermination({ timeoutMs: 120_000 });
            },
          });
          fail("PROBE_FAILED");
          break;
        }
        default:
          fail("CONFIG_INVALID");
      }
    },
  });
}

function checkpointAndCloseGenerationDatabase(
  database,
  databasePath,
  reachCheckpointFailpoint,
) {
  try {
    const checkpoint = database.pragma("wal_checkpoint(TRUNCATE)");
    if (
      !Array.isArray(checkpoint) ||
      checkpoint.length !== 1 ||
      !hasExactKeys(checkpoint[0], ["busy", "checkpointed", "log"]) ||
      checkpoint[0].busy !== 0 ||
      checkpoint[0].checkpointed !== 0 ||
      checkpoint[0].log !== 0
    ) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    fail("DATABASE_INTEGRITY_FAILED");
  }
  reachCheckpointFailpoint?.({
    failpoint: "after-candidate-checkpointed",
    transactionOpen: database.inTransaction,
  });
  closeDatabase(database);
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const sidecar = `${databasePath}${suffix}`;
    const metadata = pathKind(sidecar);
    if (!metadata) continue;
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size !== 0
    ) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    fs.rmSync(sidecar);
  }
}

function configureGenerationDatabase(database) {
  try {
    database.pragma("foreign_keys = ON");
    database.pragma("synchronous = FULL");
    if (database.pragma("journal_mode = WAL", { simple: true }) !== "wal") {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    database.pragma("wal_autocheckpoint = 0");
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    fail("DATABASE_INTEGRITY_FAILED");
  }
}

function assertGenerationDatabaseSidecarsAbsent(databasePath) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (pathKind(`${databasePath}${suffix}`)) {
      throw new GenerationPublicationError(
        "GENERATION_DATABASE_SIDECAR_INVALID",
      );
    }
  }
}

function removeGenerationReadSidecars(databasePath) {
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${databasePath}${suffix}`;
    const metadata = pathKind(sidecar);
    if (!metadata) continue;
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      (suffix === "-wal" && metadata.size !== 0) ||
      (suffix === "-shm" && metadata.size > 128 * 1024)
    ) {
      throw new GenerationPublicationError(
        "GENERATION_DATABASE_SIDECAR_INVALID",
      );
    }
    fs.rmSync(sidecar);
  }
  if (pathKind(`${databasePath}-journal`)) {
    throw new GenerationPublicationError("GENERATION_DATABASE_SIDECAR_INVALID");
  }
}

function createGenerationDatabaseVerifier({
  Database,
  baseKey,
  markerDigest,
  scope,
  canaries,
  expectExportTimingPayload = false,
}) {
  let lastFacts;
  let lastCaptureVerification;
  const verifyOpenedDatabase = (
    database,
    { expectedIdentity, expectedIdentityDigest, role },
  ) => {
    lastFacts = readEncryptionFacts(database);
    const marker = readAndVerifyMarker(database, markerDigest);
    addEncodedCanaries(
      scope,
      canaries,
      scope.keep(Buffer.from(marker, "utf8")),
    );
    lastCaptureVerification = verifyRecoveryCaptureState(database, {
      expectedState: "committed",
    });
    if (expectExportTimingPayload) {
      verifyGenerationExportTimingPayload(database);
    }
    const identity = verifyGenerationDatabaseIdentity(database, {
      expectedIdentity,
      expectedIdentityDigest,
      expectMigration: role === "candidate",
    });
    verifyDatabaseIntegrity(database);
    return identity;
  };
  return {
    verify({ databasePath, expectedIdentity, expectedIdentityDigest, role }) {
      if (role !== "source" && role !== "candidate") {
        throw new GenerationPublicationError(
          "GENERATION_DATABASE_ROLE_INVALID",
        );
      }
      if (role === "source") {
        assertRecoverableGenerationSourceSidecars(databasePath);
      } else {
        assertGenerationDatabaseSidecarsAbsent(databasePath);
      }
      const key = scope.keep(Buffer.from(baseKey));
      let database;
      try {
        database = openKeyedDatabase(
          Database,
          key,
          { readonly: true, fileMustExist: true },
          databasePath,
        );
        const identity = verifyOpenedDatabase(database, {
          expectedIdentity,
          expectedIdentityDigest,
          role,
        });
        closeDatabase(database);
        database = undefined;
        if (role === "source") {
          assertRecoverableGenerationSourceSidecars(databasePath);
        } else {
          removeGenerationReadSidecars(databasePath);
          assertGenerationDatabaseSidecarsAbsent(databasePath);
        }
        return identity;
      } finally {
        closeQuietly(database);
      }
    },
    facts() {
      if (!lastFacts) fail("DATABASE_INTEGRITY_FAILED");
      return lastFacts;
    },
    captureVerification() {
      if (!lastCaptureVerification) fail("DATABASE_INTEGRITY_FAILED");
      return lastCaptureVerification;
    },
  };
}

function acquireGenerationPreparationLock({
  Database,
  sourceDatabasePath,
  key,
}) {
  assertRecoverableGenerationSourceSidecars(sourceDatabasePath);
  let database;
  try {
    database = openKeyedDatabase(
      Database,
      key,
      { fileMustExist: true },
      sourceDatabasePath,
    );
    database.pragma("foreign_keys = ON");
    if (database.pragma("foreign_keys", { simple: true }) !== 1) {
      throw new GenerationPublicationError(
        "GENERATION_PREPARATION_LOCK_INVALID",
      );
    }
    database.pragma("busy_timeout = 0");
    database.exec("BEGIN IMMEDIATE");
    if (!database.inTransaction) {
      throw new GenerationPublicationError(
        "GENERATION_PREPARATION_LOCK_INVALID",
      );
    }
    return database;
  } catch (error) {
    closeQuietly(database);
    if (
      error instanceof ProbeFailure ||
      error instanceof GenerationPublicationError
    ) {
      throw error;
    }
    if (
      error?.code === "SQLITE_BUSY" ||
      (typeof error?.code === "string" && error.code.startsWith("SQLITE_BUSY_"))
    ) {
      throw new GenerationPublicationError("GENERATION_PREPARATION_BUSY");
    }
    throw new GenerationPublicationError("GENERATION_PREPARATION_LOCK_FAILED");
  }
}

function releaseGenerationPreparationLock(database) {
  if (!database) return;
  if (database.inTransaction) {
    try {
      database.exec("ROLLBACK");
    } catch {
      closeQuietly(database);
      throw new GenerationPublicationError(
        "GENERATION_PREPARATION_LOCK_RELEASE_FAILED",
      );
    }
  }
  closeDatabase(database);
}

function emitGenerationFaultBoundaryRecord(record) {
  const output = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
  try {
    let offset = 0;
    while (offset < output.length) {
      const written = fs.writeSync(1, output, offset, output.length - offset);
      if (written <= 0) throw new Error("GENERATION_BOUNDARY_WRITE_FAILED");
      offset += written;
    }
  } finally {
    output.fill(0);
  }
}

function digestFileHex(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function installGenerationExportTimingPayload(database) {
  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec(`
      CREATE TABLE generation_export_timing_payload (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        payload BLOB NOT NULL CHECK (length(payload) = 67108864)
      ) STRICT;
      INSERT INTO generation_export_timing_payload (singleton, payload)
      VALUES (1, zeroblob(67108864));
    `);
    database.exec("COMMIT");
    verifyGenerationExportTimingPayload(database);
  } catch {
    if (database.inTransaction) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the bounded fixture failure.
      }
    }
    fail("DATABASE_INTEGRITY_FAILED");
  }
}

function verifyGenerationExportTimingPayload(database) {
  let row;
  try {
    row = database
      .prepare(
        `SELECT
          count(*) AS rows,
          min(singleton) AS minimumSingleton,
          max(singleton) AS maximumSingleton,
          sum(length(payload)) AS payloadBytes,
          min(typeof(payload)) AS payloadType
         FROM generation_export_timing_payload`,
      )
      .get();
  } catch {
    fail("DATABASE_INTEGRITY_FAILED");
  }
  if (
    !hasExactKeys(row, [
      "maximumSingleton",
      "minimumSingleton",
      "payloadBytes",
      "payloadType",
      "rows",
    ]) ||
    row.rows !== 1 ||
    row.minimumSingleton !== 1 ||
    row.maximumSingleton !== 1 ||
    row.payloadBytes !== 67_108_864 ||
    row.payloadType !== "blob"
  ) {
    fail("DATABASE_INTEGRITY_FAILED");
  }
}

function buildAndVerifyStagedGenerationCandidate({
  Database,
  paths,
  fixture,
  markerDigest,
  baseKey,
  scope,
  reachCandidateFailpoint,
  expectExportTimingPayload = false,
}) {
  if (
    pathKind(paths.buildingCandidateDirectoryPath) ||
    pathKind(paths.discardingCandidateDirectoryPath) ||
    pathKind(paths.stagingCandidateDirectoryPath) ||
    pathKind(paths.candidateGenerationDirectoryPath)
  ) {
    fail("DATABASE_EXISTS");
  }
  try {
    fs.mkdirSync(paths.buildingCandidateDirectoryPath, {
      recursive: false,
      mode: 0o700,
    });
  } catch {
    fail("DATABASE_INTEGRITY_FAILED");
  }
  reserveDatabase(paths.buildingDatabasePath);

  let database;
  let attached = false;
  try {
    const sourceKey = scope.keep(Buffer.from(baseKey));
    const exportKey = scope.keep(Buffer.from(baseKey));
    database = openKeyedDatabase(
      Database,
      sourceKey,
      { fileMustExist: true },
      paths.sourceDatabasePath,
    );
    try {
      database
        .prepare("ATTACH DATABASE ? AS encrypted_export")
        .run(paths.buildingDatabasePath);
      attached = true;
      try {
        database.key(exportKey, "encrypted_export");
      } finally {
        exportKey.fill(0);
      }
      if (
        database.pragma("encrypted_export.journal_mode = DELETE", {
          simple: true,
        }) !== "delete"
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
      database.pragma("encrypted_export.synchronous = FULL");
      database.exec("BEGIN");
      reachCandidateFailpoint?.({
        failpoint: "during-sqlcipher-export",
        transactionOpen: database.inTransaction,
      });
      database.prepare("SELECT sqlcipher_export('encrypted_export')").get();
      database.pragma("encrypted_export.user_version = 1");
      if (
        database.pragma("encrypted_export.user_version", { simple: true }) !== 1
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
      database.exec("COMMIT");
      database.exec("DETACH DATABASE encrypted_export");
      attached = false;
    } catch (error) {
      if (database.inTransaction) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // Preserve the bounded export failure.
        }
      }
      if (attached) {
        try {
          database.exec("DETACH DATABASE encrypted_export");
          attached = false;
        } catch {
          // Closing the source connection is the final cleanup attempt.
        }
      }
      if (error instanceof ProbeFailure) throw error;
      fail("DATABASE_INTEGRITY_FAILED");
    }
    closeDatabase(database);
    database = undefined;
    assertRecoverableGenerationSourceSidecars(paths.sourceDatabasePath);

    const candidateKey = scope.keep(Buffer.from(baseKey));
    database = openKeyedDatabase(
      Database,
      candidateKey,
      { fileMustExist: true },
      paths.buildingDatabasePath,
    );
    configureGenerationDatabase(database);
    readEncryptionFacts(database);
    readAndVerifyMarker(database, markerDigest);
    verifyRecoveryCaptureState(database, { expectedState: "committed" });
    verifyGenerationDatabaseIdentity(database, {
      expectedIdentity: fixture.sourceIdentity,
      expectedIdentityDigest: fixture.sourceGenerationIdentityDigest,
      expectMigration: false,
    });
    if (expectExportTimingPayload) {
      verifyGenerationExportTimingPayload(database);
    }
    applySyntheticGenerationMigration(database, fixture.candidateIdentity, {
      reachTransactionFailpoint: ({ transactionOpen }) => {
        reachCandidateFailpoint?.({
          failpoint: "during-synthetic-migration",
          transactionOpen,
        });
      },
    });
    reachCandidateFailpoint?.({
      failpoint: "after-synthetic-migration-commit",
      transactionOpen: database.inTransaction,
    });
    verifyGenerationDatabaseIdentity(database, {
      expectedIdentity: fixture.candidateIdentity,
      expectedIdentityDigest: fixture.candidateGenerationIdentityDigest,
      expectMigration: true,
    });
    verifyDatabaseIntegrity(database);
    checkpointAndCloseGenerationDatabase(
      database,
      paths.buildingDatabasePath,
      ({ transactionOpen }) => {
        reachCandidateFailpoint?.({
          failpoint: "after-candidate-checkpointed",
          transactionOpen,
        });
      },
    );
    database = undefined;

    const candidateReopenKey = scope.keep(Buffer.from(baseKey));
    database = openKeyedDatabase(
      Database,
      candidateReopenKey,
      { readonly: true, fileMustExist: true },
      paths.buildingDatabasePath,
    );
    const facts = readEncryptionFacts(database);
    readAndVerifyMarker(database, markerDigest);
    const candidateCapture = verifyRecoveryCaptureState(database, {
      expectedState: "committed",
    });
    if (expectExportTimingPayload) {
      verifyGenerationExportTimingPayload(database);
    }
    verifyGenerationDatabaseIdentity(database, {
      expectedIdentity: fixture.candidateIdentity,
      expectedIdentityDigest: fixture.candidateGenerationIdentityDigest,
      expectMigration: true,
    });
    verifyDatabaseIntegrity(database);
    closeDatabase(database);
    database = undefined;
    removeGenerationReadSidecars(paths.buildingDatabasePath);
    assertGenerationDatabaseSidecarsAbsent(paths.buildingDatabasePath);
    const buildingEntries = fs
      .readdirSync(paths.buildingCandidateDirectoryPath)
      .sort();
    const buildingDatabase = pathKind(paths.buildingDatabasePath);
    if (
      buildingEntries.length !== 1 ||
      buildingEntries[0] !== "workspace.db" ||
      !buildingDatabase?.isFile() ||
      buildingDatabase.isSymbolicLink() ||
      buildingDatabase.size <= 0 ||
      pathKind(paths.stagingCandidateDirectoryPath) ||
      pathKind(paths.discardingCandidateDirectoryPath)
    ) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    const promotedDigest = digestFileHex(paths.buildingDatabasePath);
    const promotedSize = buildingDatabase.size;
    try {
      fs.renameSync(
        paths.buildingCandidateDirectoryPath,
        paths.stagingCandidateDirectoryPath,
      );
    } catch {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    reachCandidateFailpoint?.({
      failpoint: "after-verified-candidate-renamed",
      transactionOpen: false,
    });
    const promotedDatabase = pathKind(paths.stagingDatabasePath);
    if (
      pathKind(paths.buildingCandidateDirectoryPath) ||
      pathKind(paths.discardingCandidateDirectoryPath) ||
      !promotedDatabase?.isFile() ||
      promotedDatabase.isSymbolicLink() ||
      promotedDatabase.size !== promotedSize ||
      digestFileHex(paths.stagingDatabasePath) !== promotedDigest
    ) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    return Object.freeze({ facts, candidateCapture });
  } finally {
    closeQuietly(database);
  }
}

async function setupGenerationPublication(
  Database,
  {
    stagedCandidate = false,
    sourceOnly = false,
    reachRecordFailpoint = undefined,
    reachCandidateFailpoint = undefined,
    exportTimingPayload = false,
  } = {},
) {
  if (sourceOnly && !stagedCandidate) fail("CONFIG_INVALID");
  if (pathKind(config.generationWorkspaceRoot)) fail("DATABASE_EXISTS");
  const scope = createSensitiveScope();
  const canaries = [];
  let captureCanaries = [];
  let database;
  try {
    captureCanaries = createRecoveryCaptureCanaries(scope);
    const { key, markerDigest } = await unwrapKey(scope, canaries);
    const baseKey = scope.keep(Buffer.from(key));
    const wrapperDigest = digestFileHex(config.wrapperPath);
    const fixture = createGenerationPublicationFixture(
      config.workspaceId,
      wrapperDigest,
    );

    const databaseMetadata = pathKind(config.databasePath);
    if (!databaseMetadata?.isFile() || databaseMetadata.isSymbolicLink()) {
      fail("DATABASE_MISSING");
    }
    database = openKeyedDatabase(Database, key, { fileMustExist: true });
    const sourceFacts = readEncryptionFacts(database);
    const marker = readAndVerifyMarker(database, markerDigest);
    addEncodedCanaries(
      scope,
      canaries,
      scope.keep(Buffer.from(marker, "utf8")),
    );
    bootstrapRecoveryCaptureSchema(database);
    const captureExecution = executeRecoveryCapture(database);
    if (captureExecution.kind !== "applied") fail("DATABASE_INTEGRITY_FAILED");
    const sourceCapture = verifyRecoveryCaptureState(database, {
      expectedState: "committed",
    });
    installInitialGenerationIdentity(database, fixture.sourceIdentity);
    if (exportTimingPayload) installGenerationExportTimingPayload(database);
    verifyGenerationDatabaseIdentity(database, {
      expectedIdentity: fixture.sourceIdentity,
      expectedIdentityDigest: fixture.sourceGenerationIdentityDigest,
      expectMigration: false,
    });
    verifyDatabaseIntegrity(database);
    checkpointAndCloseGenerationDatabase(database, config.databasePath);
    database = undefined;

    const paths = getGenerationPublicationPaths(
      config.generationWorkspaceRoot,
      GENERATION_PUBLICATION_IDS.operationId,
    );
    const preparationPaths = stagedCandidate
      ? getGenerationPreparationPaths(
          config.generationWorkspaceRoot,
          GENERATION_PUBLICATION_IDS.operationId,
        )
      : undefined;
    fs.mkdirSync(paths.sourceGenerationDirectoryPath, {
      recursive: true,
      mode: 0o700,
    });
    fs.mkdirSync(paths.operationDirectoryPath, {
      recursive: true,
      mode: 0o700,
    });
    if (!sourceOnly && !stagedCandidate) {
      fs.mkdirSync(paths.candidateGenerationDirectoryPath, {
        recursive: true,
        mode: 0o700,
      });
    }
    fs.renameSync(config.wrapperPath, paths.wrapperPath);
    fs.renameSync(config.databasePath, paths.sourceDatabasePath);

    let preparationIntent;
    if (stagedCandidate) {
      writeCanonicalGenerationFile(paths.manifestPath, fixture.sourceManifest);
      if (sourceOnly) {
        const verifier = createGenerationDatabaseVerifier({
          Database,
          baseKey,
          markerDigest,
          scope,
          canaries,
          expectExportTimingPayload: exportTimingPayload,
        });
        const sourceState = verifyGenerationPreparationRecordPrerequisites({
          workspaceRoot: config.generationWorkspaceRoot,
          operationId: GENERATION_PUBLICATION_IDS.operationId,
          inputFingerprint: fixture.inputFingerprint,
          nextRecordKind: "intent",
          verifyGeneration: verifier.verify,
        });
        if (
          sourceState.candidatePresent ||
          sourceState.intentDigest !== null ||
          sourceState.verifiedRecordDigest !== null
        ) {
          fail("DATABASE_INTEGRITY_FAILED");
        }
        assertEncryptedDatabaseFile(
          [...canaries, ...captureCanaries],
          paths.sourceDatabasePath,
        );
        scanGenerationSecrets(canaries, captureCanaries);
        writeFixedProgress("generation-record-source-ready");
        return fixedResult("pass", "GENERATION_RECORD_SOURCE_READY", {
          asyncEncryptionAvailable: true,
          cipherVersion: sourceFacts.cipherVersion,
          provider: sourceFacts.provider,
          providerVersion: sourceFacts.providerVersion,
          rawKeyBinding: true,
          scenario: config.scenario,
          markerDigest,
          sourceGenerationId: fixture.sourceIdentity.generationId,
          sourceGenerationIdentityDigest:
            fixture.sourceGenerationIdentityDigest,
          activeGenerationId: fixture.sourceIdentity.generationId,
          manifestDigest: sourceState.sourceManifestDigest,
          wrapperDigest: sourceState.wrapperDigest,
          inputFingerprint: fixture.inputFingerprint,
          sourceGenerationPresent: true,
          candidateGenerationPresent: false,
          candidateStagingPresent: false,
          applicationKind: "source_ready",
          diagnosticCode: null,
          workspaceVersion: sourceCapture.workspaceVersion,
          rows: sourceCapture.rows,
          stateDigest: sourceCapture.stateDigest,
          integrityVerified: sourceCapture.integrityVerified,
          ftsVerified: sourceCapture.ftsVerified,
        });
      }
      preparationIntent = createGenerationPreparationIntent(
        config.workspaceId,
        wrapperDigest,
      );
      publishImmutableGenerationRecord({
        recordKind: "intent",
        targetPath: preparationPaths.intentPath,
        value: preparationIntent,
        reachFailpoint: reachRecordFailpoint,
      });
      writeFixedProgress("generation-preparation-intent-written");
    }
    const candidateDatabasePath = stagedCandidate
      ? preparationPaths.stagingDatabasePath
      : paths.candidateDatabasePath;
    let facts;
    let candidateCapture;
    if (stagedCandidate) {
      const built = buildAndVerifyStagedGenerationCandidate({
        Database,
        paths: preparationPaths,
        fixture,
        markerDigest,
        baseKey,
        scope,
        reachCandidateFailpoint,
        expectExportTimingPayload: exportTimingPayload,
      });
      facts = built.facts;
      candidateCapture = built.candidateCapture;
    } else {
      const sourceReopenKey = scope.keep(Buffer.from(baseKey));
      const exportKey = scope.keep(Buffer.from(baseKey));
      const candidateKey = scope.keep(Buffer.from(baseKey));
      const candidateReopenKey = scope.keep(Buffer.from(baseKey));
      reserveDatabase(candidateDatabasePath);
      database = openKeyedDatabase(
        Database,
        sourceReopenKey,
        { fileMustExist: true },
        paths.sourceDatabasePath,
      );
      try {
        database
          .prepare("ATTACH DATABASE ? AS encrypted_export")
          .run(candidateDatabasePath);
        try {
          database.key(exportKey, "encrypted_export");
        } finally {
          exportKey.fill(0);
        }
        database.exec("BEGIN");
        database.prepare("SELECT sqlcipher_export('encrypted_export')").get();
        database.pragma("encrypted_export.user_version = 1");
        database.exec("COMMIT");
        database.exec("DETACH DATABASE encrypted_export");
      } catch {
        if (database.inTransaction) {
          try {
            database.exec("ROLLBACK");
          } catch {
            // Preserve the bounded export failure.
          }
        }
        fail("DATABASE_INTEGRITY_FAILED");
      }
      closeDatabase(database);
      database = undefined;
      assertRecoverableGenerationSourceSidecars(paths.sourceDatabasePath);

      database = openKeyedDatabase(
        Database,
        candidateKey,
        { fileMustExist: true },
        candidateDatabasePath,
      );
      configureGenerationDatabase(database);
      if (database.pragma("user_version", { simple: true }) !== 1) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
      readEncryptionFacts(database);
      readAndVerifyMarker(database, markerDigest);
      verifyRecoveryCaptureState(database, { expectedState: "committed" });
      verifyGenerationDatabaseIdentity(database, {
        expectedIdentity: fixture.sourceIdentity,
        expectedIdentityDigest: fixture.sourceGenerationIdentityDigest,
        expectMigration: false,
      });
      applySyntheticGenerationMigration(database, fixture.candidateIdentity);
      verifyGenerationDatabaseIdentity(database, {
        expectedIdentity: fixture.candidateIdentity,
        expectedIdentityDigest: fixture.candidateGenerationIdentityDigest,
        expectMigration: true,
      });
      verifyDatabaseIntegrity(database);
      checkpointAndCloseGenerationDatabase(database, candidateDatabasePath);
      database = undefined;

      database = openKeyedDatabase(
        Database,
        candidateReopenKey,
        { readonly: true, fileMustExist: true },
        candidateDatabasePath,
      );
      facts = readEncryptionFacts(database);
      readAndVerifyMarker(database, markerDigest);
      candidateCapture = verifyRecoveryCaptureState(database, {
        expectedState: "committed",
      });
      verifyGenerationDatabaseIdentity(database, {
        expectedIdentity: fixture.candidateIdentity,
        expectedIdentityDigest: fixture.candidateGenerationIdentityDigest,
        expectMigration: true,
      });
      verifyDatabaseIntegrity(database);
      closeDatabase(database);
      database = undefined;
      removeGenerationReadSidecars(candidateDatabasePath);
    }

    const verifier = createGenerationDatabaseVerifier({
      Database,
      baseKey,
      markerDigest,
      scope,
      canaries,
    });
    let state;
    let candidateVerifiedRecord;
    if (stagedCandidate) {
      const candidateMetadata = fs.lstatSync(candidateDatabasePath);
      candidateVerifiedRecord = createGenerationCandidateVerifiedRecord({
        intent: preparationIntent,
        candidateDatabaseDigest: digestFileHex(candidateDatabasePath),
        candidateDatabaseSize: candidateMetadata.size,
      });
      publishImmutableGenerationRecord({
        recordKind: "candidate-verified",
        targetPath: preparationPaths.verifiedRecordPath,
        value: candidateVerifiedRecord,
        reachFailpoint: reachRecordFailpoint,
      });
      publishImmutableGenerationRecord({
        recordKind: "operation",
        targetPath: paths.operationRecordPath,
        value: fixture.operationRecord,
        reachFailpoint: reachRecordFailpoint,
      });
      state = verifyGenerationPreparationState({
        workspaceRoot: config.generationWorkspaceRoot,
        operationId: GENERATION_PUBLICATION_IDS.operationId,
        inputFingerprint: fixture.inputFingerprint,
        verifyGeneration: verifier.verify,
      });
      if (
        state.phase !== "staged" ||
        state.activeGenerationId !== fixture.sourceIdentity.generationId
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
      writeFixedProgress("generation-preparation-candidate-verified");
    } else {
      writeCanonicalGenerationFile(paths.manifestPath, fixture.sourceManifest);
      writeCanonicalGenerationFile(
        paths.operationRecordPath,
        fixture.operationRecord,
      );
      state = verifyGenerationPublicationState({
        workspaceRoot: config.generationWorkspaceRoot,
        operationId: GENERATION_PUBLICATION_IDS.operationId,
        inputFingerprint: fixture.inputFingerprint,
        verifyGeneration: verifier.verify,
        reachFailpoint: undefined,
      });
      if (
        state.activeGenerationId !== fixture.sourceIdentity.generationId ||
        state.temporaryManifestPresent
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
    }
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      paths.sourceDatabasePath,
    );
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      candidateDatabasePath,
    );
    scanGenerationSecrets(canaries, captureCanaries);
    writeFixedProgress("generation-candidate-verified");
    writeFixedProgress("generation-setup-complete");
    return fixedResult(
      "pass",
      stagedCandidate
        ? "GENERATION_CANDIDATE_STAGED"
        : "GENERATION_PUBLICATION_PREPARED",
      {
        asyncEncryptionAvailable: true,
        cipherVersion: facts.cipherVersion,
        provider: facts.provider,
        providerVersion: facts.providerVersion,
        rawKeyBinding: true,
        scenario: config.scenario,
        markerDigest,
        sourceGenerationId: fixture.sourceIdentity.generationId,
        sourceGenerationIdentityDigest: fixture.sourceGenerationIdentityDigest,
        candidateGenerationId: fixture.candidateIdentity.generationId,
        candidateGenerationIdentityDigest:
          fixture.candidateGenerationIdentityDigest,
        activeGenerationId: state.activeGenerationId,
        manifestDigest: state.manifestDigest ?? state.sourceManifestDigest,
        operationRecordDigest: state.operationRecordDigest ?? null,
        wrapperDigest: state.wrapperDigest,
        inputFingerprint: state.inputFingerprint,
        outcomeDigest:
          state.publicationOutcomeDigest ?? state.handoffOutcomeDigest,
        temporaryManifestPresent: state.temporaryManifestPresent ?? false,
        sourceGenerationPresent: state.sourceGenerationPresent,
        candidateGenerationPresent: state.candidateGenerationPresent,
        ...(stagedCandidate
          ? {
              candidateStagingPresent: state.candidateStagingPresent,
              candidateDatabaseDigest: state.candidateDatabaseDigest,
              candidateDatabaseSize: state.candidateDatabaseSize,
              intentDigest: state.intentDigest,
              verifiedRecordDigest: state.verifiedRecordDigest,
              preparationPhase: state.phase,
              candidateLocation: state.candidateLocation,
            }
          : {}),
        applicationKind: "prepared",
        diagnosticCode: null,
        workspaceVersion: candidateCapture.workspaceVersion,
        rows: candidateCapture.rows,
        stateDigest: candidateCapture.stateDigest,
        integrityVerified:
          sourceCapture.integrityVerified && candidateCapture.integrityVerified,
        ftsVerified: sourceCapture.ftsVerified && candidateCapture.ftsVerified,
        encryptedExport: true,
        candidateReadOnlyReopen: true,
      },
    );
  } finally {
    closeQuietly(database);
    try {
      if (canaries.length > 0) scanKnownSecrets(canaries);
      if (captureCanaries.length > 0) {
        scanForCanaries([config.stateRoot], captureCanaries);
      }
    } finally {
      scope.clear();
    }
  }
}

function createStagedCandidateForRecordRecovery({
  Database,
  paths,
  fixture,
  markerDigest,
  baseKey,
  scope,
  reachCandidateFailpoint,
  expectExportTimingPayload,
}) {
  if (pathKind(paths.stagingCandidateDirectoryPath)) return false;
  buildAndVerifyStagedGenerationCandidate({
    Database,
    paths,
    fixture,
    markerDigest,
    baseKey,
    scope,
    reachCandidateFailpoint,
    expectExportTimingPayload,
  });
  return true;
}

function recordReadyProgressStage(recordKind) {
  return recordKind === "intent"
    ? "generation-record-intent-ready"
    : recordKind === "candidate-verified"
      ? "generation-record-candidate-verified-ready"
      : "generation-record-operation-ready";
}

async function advanceGenerationPreparationRecords(
  Database,
  { throughRecordKind, reachRecordFailpoint, reachCandidateFailpoint },
) {
  if (
    !["intent", "candidate-verified", "operation"].includes(
      throughRecordKind,
    ) ||
    (reachRecordFailpoint !== undefined &&
      typeof reachRecordFailpoint !== "function") ||
    (reachCandidateFailpoint !== undefined &&
      typeof reachCandidateFailpoint !== "function")
  ) {
    fail("CONFIG_INVALID");
  }
  const scope = createSensitiveScope();
  const canaries = [];
  let captureCanaries = [];
  let operationLockDatabase;
  try {
    captureCanaries = createRecoveryCaptureCanaries(scope);
    const paths = getGenerationPreparationPaths(
      config.generationWorkspaceRoot,
      GENERATION_PUBLICATION_IDS.operationId,
    );
    const unwrapped = await unwrapKey(scope, canaries, paths.wrapperPath);
    const baseKey = scope.keep(Buffer.from(unwrapped.key));
    const fixture = createGenerationPublicationFixture(
      config.workspaceId,
      digestFileHex(paths.wrapperPath),
    );
    const operationLockKey = scope.keep(Buffer.from(baseKey));
    operationLockDatabase = acquireGenerationPreparationLock({
      Database,
      sourceDatabasePath: paths.sourceDatabasePath,
      key: operationLockKey,
    });
    const verifier = createGenerationDatabaseVerifier({
      Database,
      baseKey,
      markerDigest: unwrapped.markerDigest,
      scope,
      canaries,
      expectExportTimingPayload:
        config.scenario === GENERATION_CANDIDATE_BUILD_SCENARIO,
    });
    const prerequisiteOptions = {
      workspaceRoot: config.generationWorkspaceRoot,
      operationId: GENERATION_PUBLICATION_IDS.operationId,
      inputFingerprint: fixture.inputFingerprint,
      verifyGeneration: verifier.verify,
    };

    verifier.verify({
      role: "source",
      databasePath: paths.sourceDatabasePath,
      expectedIdentity: fixture.sourceIdentity,
      expectedIdentityDigest: fixture.sourceGenerationIdentityDigest,
    });

    let partial = verifyGenerationPreparationRecordPrerequisites({
      ...prerequisiteOptions,
      nextRecordKind: throughRecordKind,
    });
    const intent = createGenerationPreparationIntent(
      config.workspaceId,
      digestFileHex(paths.wrapperPath),
    );
    let publication = publishImmutableGenerationRecord({
      recordKind: "intent",
      targetPath: paths.intentPath,
      value: intent,
      reachFailpoint: reachRecordFailpoint,
    });
    writeFixedProgress("generation-record-intent-ready");
    if (throughRecordKind === "intent") {
      partial = verifyGenerationPreparationRecordPrerequisites({
        ...prerequisiteOptions,
        nextRecordKind: "candidate-verified",
      });
    }
    let finalState;

    if (throughRecordKind !== "intent") {
      partial = verifyGenerationPreparationRecordPrerequisites({
        ...prerequisiteOptions,
        nextRecordKind: throughRecordKind,
      });
      if (!partial.candidatePresent) {
        if (throughRecordKind === "operation") {
          fail("DATABASE_INTEGRITY_FAILED");
        }
        if (
          partial.candidateBuildPresent ||
          partial.candidateDiscardingPresent
        ) {
          recoverUnsealedGenerationCandidateBuild({
            workspaceRoot: config.generationWorkspaceRoot,
            operationId: GENERATION_PUBLICATION_IDS.operationId,
          });
          partial = verifyGenerationPreparationRecordPrerequisites({
            ...prerequisiteOptions,
            nextRecordKind: throughRecordKind,
          });
        }
        createStagedCandidateForRecordRecovery({
          Database,
          paths,
          fixture,
          markerDigest: unwrapped.markerDigest,
          baseKey,
          scope,
          expectExportTimingPayload:
            config.scenario === GENERATION_CANDIDATE_BUILD_SCENARIO,
          reachCandidateFailpoint: ({ failpoint, transactionOpen }) => {
            reachCandidateFailpoint?.({
              failpoint,
              state: Object.freeze({
                workspaceId: config.workspaceId,
                operationId: GENERATION_PUBLICATION_IDS.operationId,
                activeGenerationId: fixture.sourceIdentity.generationId,
                candidateGenerationId: fixture.candidateIdentity.generationId,
                candidateGenerationIdentityDigest:
                  fixture.candidateGenerationIdentityDigest,
                sourceManifestDigest: digestGenerationValue(
                  fixture.sourceManifest,
                ),
                intentDigest: digestGenerationValue(intent),
                wrapperDigest: digestFileHex(paths.wrapperPath),
                candidateBuildingPresent:
                  failpoint !== "after-verified-candidate-renamed",
                candidateStagingPresent:
                  failpoint === "after-verified-candidate-renamed",
                candidateGenerationPresent: false,
                migrationTransactionOpen: transactionOpen,
              }),
            });
          },
        });
      }
      partial = verifyGenerationPreparationRecordPrerequisites({
        ...prerequisiteOptions,
        nextRecordKind: throughRecordKind,
      });
      if (
        !partial.candidatePresent ||
        !partial.intent ||
        !partial.candidateDatabaseDigest ||
        !Number.isSafeInteger(partial.candidateDatabaseSize)
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
      const verifiedRecord = createGenerationCandidateVerifiedRecord({
        intent: partial.intent,
        candidateDatabaseDigest: partial.candidateDatabaseDigest,
        candidateDatabaseSize: partial.candidateDatabaseSize,
      });
      publication = publishImmutableGenerationRecord({
        recordKind: "candidate-verified",
        targetPath: paths.verifiedRecordPath,
        value: verifiedRecord,
        reachFailpoint: reachRecordFailpoint,
      });
      writeFixedProgress("generation-record-candidate-verified-ready");
      partial = verifyGenerationPreparationRecordPrerequisites({
        ...prerequisiteOptions,
        nextRecordKind: "operation",
      });
    }

    if (throughRecordKind === "operation") {
      publication = publishImmutableGenerationRecord({
        recordKind: "operation",
        targetPath: paths.operationRecordPath,
        value: fixture.operationRecord,
        reachFailpoint: reachRecordFailpoint,
      });
      writeFixedProgress("generation-record-operation-ready");
      finalState = verifyGenerationPreparationState({
        ...prerequisiteOptions,
        reachFailpoint: undefined,
      });
      if (
        finalState.phase !== "staged" ||
        finalState.activeGenerationId !== fixture.sourceIdentity.generationId
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
    }

    const facts = verifier.facts();
    const capture = verifier.captureVerification();
    const candidatePresent = finalState
      ? finalState.candidateStagingPresent
      : partial.candidatePresent;
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      paths.sourceDatabasePath,
    );
    if (candidatePresent) {
      assertEncryptedDatabaseFile(
        [...canaries, ...captureCanaries],
        paths.stagingDatabasePath,
      );
    }
    const recordPhase =
      throughRecordKind === "intent"
        ? "intent_ready"
        : throughRecordKind === "candidate-verified"
          ? "candidate_verified"
          : "staged";
    const intentDigest = finalState?.intentDigest ?? partial.intentDigest;
    const verifiedRecordDigest =
      finalState?.verifiedRecordDigest ?? partial.verifiedRecordDigest;
    const candidateDatabaseDigest =
      finalState?.candidateDatabaseDigest ?? partial.candidateDatabaseDigest;
    const candidateDatabaseSize =
      finalState?.candidateDatabaseSize ?? partial.candidateDatabaseSize;
    const recordCode =
      throughRecordKind === "intent"
        ? "GENERATION_RECORD_INTENT"
        : throughRecordKind === "candidate-verified"
          ? "GENERATION_RECORD_CANDIDATE_VERIFIED"
          : "GENERATION_RECORD_OPERATION";
    const publicationCode =
      publication.kind === "replayed"
        ? "REPLAYED"
        : publication.kind === "applied"
          ? "APPLIED"
          : "RECOVERED";
    return fixedResult("pass", `${recordCode}_${publicationCode}`, {
      asyncEncryptionAvailable: true,
      cipherVersion: facts.cipherVersion,
      provider: facts.provider,
      providerVersion: facts.providerVersion,
      rawKeyBinding: true,
      scenario: config.scenario,
      markerDigest: unwrapped.markerDigest,
      sourceGenerationId: fixture.sourceIdentity.generationId,
      sourceGenerationIdentityDigest: fixture.sourceGenerationIdentityDigest,
      candidateGenerationId: fixture.candidateIdentity.generationId,
      candidateGenerationIdentityDigest:
        fixture.candidateGenerationIdentityDigest,
      activeGenerationId: fixture.sourceIdentity.generationId,
      manifestDigest:
        finalState?.sourceManifestDigest ?? partial.sourceManifestDigest,
      wrapperDigest: finalState?.wrapperDigest ?? partial.wrapperDigest,
      inputFingerprint: fixture.inputFingerprint,
      sourceGenerationPresent: true,
      candidateGenerationPresent: false,
      candidateStagingPresent: candidatePresent,
      candidateDatabaseDigest,
      candidateDatabaseSize,
      intentDigest,
      verifiedRecordDigest,
      operationRecordDigest: finalState?.operationRecordDigest ?? null,
      recordKind: throughRecordKind,
      recordPhase,
      recordPublicationKind: publication.kind,
      recordDigest: publication.recordDigest,
      recordSize: publication.recordSize,
      recordOutcomeDigest: publication.outcomeDigest,
      recoveredPrefix: publication.recoveredPrefix,
      recoveredSyncedTemporary: publication.recoveredSyncedTemporary,
      recoveredPublishedLink: publication.recoveredPublishedLink,
      applicationKind: publication.kind,
      diagnosticCode: null,
      workspaceVersion: capture.workspaceVersion,
      rows: capture.rows,
      stateDigest: capture.stateDigest,
      integrityVerified: capture.integrityVerified,
      ftsVerified: capture.ftsVerified,
      encryptedExport: candidatePresent,
      candidateReadOnlyReopen: candidatePresent,
    });
  } finally {
    try {
      // Windows WAL uses byte-range locks in SHM; release them before the
      // full persisted-state canary scan opens every file through new handles.
      releaseGenerationPreparationLock(operationLockDatabase);
      operationLockDatabase = undefined;
    } finally {
      try {
        if (canaries.length > 0) scanKnownSecrets(canaries);
        if (captureCanaries.length > 0) {
          scanForCanaries([config.stateRoot], captureCanaries);
        }
      } finally {
        scope.clear();
      }
    }
  }
}

async function useGenerationPublicationWorkspace(Database) {
  const scope = createSensitiveScope();
  const canaries = [];
  let captureCanaries = [];
  let baseKey;
  try {
    captureCanaries = createRecoveryCaptureCanaries(scope);
    const paths = getGenerationPublicationPaths(
      config.generationWorkspaceRoot,
      GENERATION_PUBLICATION_IDS.operationId,
    );
    const unwrapped = await unwrapKey(scope, canaries, paths.wrapperPath);
    baseKey = unwrapped.key;
    const fixture = createGenerationPublicationFixture(
      config.workspaceId,
      digestFileHex(paths.wrapperPath),
    );
    const verifier = createGenerationDatabaseVerifier({
      Database,
      baseKey,
      markerDigest: unwrapped.markerDigest,
      scope,
      canaries,
    });
    const publicationOptions = {
      workspaceRoot: config.generationWorkspaceRoot,
      operationId: GENERATION_PUBLICATION_IDS.operationId,
      inputFingerprint: fixture.inputFingerprint,
      verifyGeneration: verifier.verify,
      reachFailpoint: undefined,
    };
    let applicationKind = "verified";
    let diagnosticCode = null;

    if (config.mode === "generation-fault") {
      publishGenerationManifest({
        ...publicationOptions,
        reachFailpoint: ({ failpoint, state }) => {
          if (failpoint !== config.failpoint) return;
          writeFixedProgress(
            failpoint === "after-temporary-manifest-synced"
              ? "generation-temporary-manifest-synced"
              : "generation-manifest-replaced",
          );
          const boundary = createGenerationFaultBoundaryRecord({
            processId: process.pid,
            failpoint,
            state,
          });
          writeFixedProgress("generation-fault-boundary-ready");
          emitGenerationFaultBoundaryRecord(boundary);
          holdForForcedTermination({ timeoutMs: 120_000 });
        },
      });
      fail("PROBE_FAILED");
    }

    let stateBefore = verifyGenerationPublicationState(publicationOptions);
    if (config.mode === "generation-verify-source") {
      if (
        stateBefore.activeGenerationId !==
          fixture.sourceIdentity.generationId ||
        !stateBefore.temporaryManifestPresent
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
    } else if (config.mode === "generation-verify-target") {
      if (
        stateBefore.activeGenerationId !==
          fixture.candidateIdentity.generationId ||
        stateBefore.temporaryManifestPresent
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
    } else if (config.mode === "generation-publish") {
      const publication = publishGenerationManifest(publicationOptions);
      applicationKind = publication.kind;
      writeFixedProgress(
        publication.kind === "applied"
          ? "generation-publication-applied"
          : "generation-publication-replayed",
      );
    } else if (config.mode === "generation-conflict") {
      const before = JSON.stringify(stateBefore);
      try {
        publishGenerationManifest({
          ...publicationOptions,
          inputFingerprint: fixture.conflictInputFingerprint,
        });
        fail("DATABASE_INTEGRITY_FAILED");
      } catch (error) {
        if (
          !(error instanceof GenerationPublicationError) ||
          error.code !== "GENERATION_PUBLICATION_CONFLICT"
        ) {
          throw error;
        }
      }
      const after = verifyGenerationPublicationState(publicationOptions);
      if (JSON.stringify(after) !== before) fail("DATABASE_INTEGRITY_FAILED");
      applicationKind = "conflict";
      diagnosticCode = "generation.publication_input_conflict";
      writeFixedProgress("generation-publication-conflict-verified");
    } else {
      fail("CONFIG_INVALID");
    }

    const state = verifyGenerationPublicationState(publicationOptions);
    const facts = verifier.facts();
    const capture = verifier.captureVerification();
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      paths.sourceDatabasePath,
    );
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      paths.candidateDatabasePath,
    );
    scanGenerationSecrets(canaries, captureCanaries);
    writeFixedProgress("generation-state-verified");
    const code =
      config.mode === "generation-verify-source"
        ? "GENERATION_SOURCE_VERIFIED"
        : config.mode === "generation-verify-target"
          ? "GENERATION_TARGET_VERIFIED"
          : config.mode === "generation-conflict"
            ? "GENERATION_PUBLICATION_CONFLICT_VERIFIED"
            : applicationKind === "applied"
              ? "GENERATION_PUBLICATION_APPLIED"
              : "GENERATION_PUBLICATION_REPLAYED";
    return fixedResult("pass", code, {
      asyncEncryptionAvailable: true,
      cipherVersion: facts.cipherVersion,
      provider: facts.provider,
      providerVersion: facts.providerVersion,
      rawKeyBinding: true,
      scenario: config.scenario,
      markerDigest: unwrapped.markerDigest,
      sourceGenerationId: fixture.sourceIdentity.generationId,
      sourceGenerationIdentityDigest: fixture.sourceGenerationIdentityDigest,
      candidateGenerationId: fixture.candidateIdentity.generationId,
      candidateGenerationIdentityDigest:
        fixture.candidateGenerationIdentityDigest,
      activeGenerationId: state.activeGenerationId,
      manifestDigest: state.manifestDigest,
      operationRecordDigest: state.operationRecordDigest,
      wrapperDigest: state.wrapperDigest,
      inputFingerprint: state.inputFingerprint,
      outcomeDigest: state.publicationOutcomeDigest,
      temporaryManifestPresent: state.temporaryManifestPresent,
      sourceGenerationPresent: state.sourceGenerationPresent,
      candidateGenerationPresent: state.candidateGenerationPresent,
      applicationKind,
      diagnosticCode,
      workspaceVersion: capture.workspaceVersion,
      rows: capture.rows,
      stateDigest: capture.stateDigest,
      integrityVerified: capture.integrityVerified,
      ftsVerified: capture.ftsVerified,
      encryptedExport: true,
      candidateReadOnlyReopen: true,
    });
  } finally {
    try {
      if (canaries.length > 0) scanKnownSecrets(canaries);
      if (captureCanaries.length > 0) {
        scanForCanaries([config.stateRoot], captureCanaries);
      }
    } finally {
      scope.clear();
    }
  }
}

async function useGenerationPreparationWorkspace(Database) {
  const scope = createSensitiveScope();
  const canaries = [];
  let captureCanaries = [];
  try {
    captureCanaries = createRecoveryCaptureCanaries(scope);
    const paths = getGenerationPreparationPaths(
      config.generationWorkspaceRoot,
      GENERATION_PUBLICATION_IDS.operationId,
    );
    const unwrapped = await unwrapKey(scope, canaries, paths.wrapperPath);
    const fixture = createGenerationPublicationFixture(
      config.workspaceId,
      digestFileHex(paths.wrapperPath),
    );
    const verifier = createGenerationDatabaseVerifier({
      Database,
      baseKey: unwrapped.key,
      markerDigest: unwrapped.markerDigest,
      scope,
      canaries,
    });
    const preparationOptions = {
      workspaceRoot: config.generationWorkspaceRoot,
      operationId: GENERATION_PUBLICATION_IDS.operationId,
      inputFingerprint: fixture.inputFingerprint,
      verifyGeneration: verifier.verify,
      reachFailpoint: undefined,
    };

    if (config.mode === "generation-preparation-fault") {
      handoffPreparedGeneration({
        ...preparationOptions,
        reachFailpoint: ({ failpoint, state }) => {
          if (failpoint !== config.failpoint) return;
          writeFixedProgress(
            failpoint === "after-candidate-read-only-verified"
              ? "generation-preparation-candidate-verified"
              : "generation-preparation-candidate-handed-off",
          );
          const boundary = createGenerationPreparationFaultBoundaryRecord({
            processId: process.pid,
            failpoint,
            state,
          });
          writeFixedProgress("generation-preparation-fault-boundary-ready");
          emitGenerationFaultBoundaryRecord(boundary);
          holdForForcedTermination({ timeoutMs: 120_000 });
        },
      });
      fail("PROBE_FAILED");
    }

    let state = verifyGenerationPreparationState(preparationOptions);
    let handoffKind = "verified";
    let operationRecordDigest = state.operationRecordDigest;
    let preparationConflictVerified = false;
    const expectedPhase =
      config.mode === "generation-preparation-verify-staged"
        ? "staged"
        : config.mode === "generation-preparation-verify-final"
          ? "handed_off"
          : undefined;

    if (expectedPhase) {
      if (state.phase !== expectedPhase) fail("DATABASE_INTEGRITY_FAILED");
      const before = JSON.stringify(state);
      try {
        handoffPreparedGeneration({
          ...preparationOptions,
          inputFingerprint: fixture.conflictInputFingerprint,
        });
        fail("DATABASE_INTEGRITY_FAILED");
      } catch (error) {
        if (
          !(error instanceof GenerationPublicationError) ||
          error.code !== "GENERATION_PREPARATION_CONFLICT"
        ) {
          throw error;
        }
      }
      state = verifyGenerationPreparationState(preparationOptions);
      if (JSON.stringify(state) !== before) fail("DATABASE_INTEGRITY_FAILED");
      preparationConflictVerified = true;
    } else if (config.mode === "generation-preparation-complete") {
      const handoff = handoffPreparedGeneration(preparationOptions);
      handoffKind = handoff.kind;
      state = verifyGenerationPreparationState(preparationOptions);
      if (state.phase !== "handed_off") fail("DATABASE_INTEGRITY_FAILED");
      const publicationState = verifyGenerationPublicationState({
        workspaceRoot: config.generationWorkspaceRoot,
        operationId: GENERATION_PUBLICATION_IDS.operationId,
        inputFingerprint: fixture.inputFingerprint,
        verifyGeneration: verifier.verify,
        reachFailpoint: undefined,
      });
      if (
        publicationState.activeGenerationId !==
        fixture.sourceIdentity.generationId
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
      if (
        publicationState.operationRecordDigest !== state.operationRecordDigest
      ) {
        fail("DATABASE_INTEGRITY_FAILED");
      }
      operationRecordDigest = state.operationRecordDigest;
      writeFixedProgress("generation-preparation-completed");
    } else {
      fail("CONFIG_INVALID");
    }

    const facts = verifier.facts();
    const capture = verifier.captureVerification();
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      paths.sourceDatabasePath,
    );
    const candidateDatabasePath =
      state.phase === "staged"
        ? paths.stagingDatabasePath
        : paths.candidateDatabasePath;
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      candidateDatabasePath,
    );
    scanGenerationSecrets(canaries, captureCanaries);
    writeFixedProgress("generation-preparation-state-verified");
    const code =
      config.mode === "generation-preparation-verify-staged"
        ? "GENERATION_CANDIDATE_STAGED_VERIFIED"
        : config.mode === "generation-preparation-verify-final"
          ? "GENERATION_CANDIDATE_HANDOFF_VERIFIED"
          : "GENERATION_CANDIDATE_HANDOFF_COMPLETED";
    return fixedResult("pass", code, {
      asyncEncryptionAvailable: true,
      cipherVersion: facts.cipherVersion,
      provider: facts.provider,
      providerVersion: facts.providerVersion,
      rawKeyBinding: true,
      scenario: config.scenario,
      markerDigest: unwrapped.markerDigest,
      sourceGenerationId: fixture.sourceIdentity.generationId,
      sourceGenerationIdentityDigest: fixture.sourceGenerationIdentityDigest,
      candidateGenerationId: fixture.candidateIdentity.generationId,
      candidateGenerationIdentityDigest:
        fixture.candidateGenerationIdentityDigest,
      activeGenerationId: state.activeGenerationId,
      manifestDigest: state.sourceManifestDigest,
      operationRecordDigest,
      wrapperDigest: state.wrapperDigest,
      inputFingerprint: state.inputFingerprint,
      outcomeDigest: state.handoffOutcomeDigest,
      sourceGenerationPresent: state.sourceGenerationPresent,
      candidateGenerationPresent: state.candidateGenerationPresent,
      candidateStagingPresent: state.candidateStagingPresent,
      candidateDatabaseDigest: state.candidateDatabaseDigest,
      candidateDatabaseSize: state.candidateDatabaseSize,
      intentDigest: state.intentDigest,
      verifiedRecordDigest: state.verifiedRecordDigest,
      preparationPhase: state.phase,
      candidateLocation: state.candidateLocation,
      handoffKind,
      preparationConflictVerified,
      applicationKind:
        config.mode === "generation-preparation-complete"
          ? "completed"
          : "verified",
      diagnosticCode: null,
      workspaceVersion: capture.workspaceVersion,
      rows: capture.rows,
      stateDigest: capture.stateDigest,
      integrityVerified: capture.integrityVerified,
      ftsVerified: capture.ftsVerified,
      encryptedExport: true,
      candidateReadOnlyReopen: true,
    });
  } finally {
    try {
      if (canaries.length > 0) scanKnownSecrets(canaries);
      if (captureCanaries.length > 0) {
        scanForCanaries([config.stateRoot], captureCanaries);
      }
    } finally {
      scope.clear();
    }
  }
}

async function runGenerationMode(Database) {
  if (config.mode === "generation-setup") {
    return await setupGenerationPublication(Database);
  }
  return await useGenerationPublicationWorkspace(Database);
}

async function runGenerationPreparationMode(Database) {
  if (config.mode === "generation-preparation-setup") {
    return await setupGenerationPublication(Database, {
      stagedCandidate: true,
    });
  }
  return await useGenerationPreparationWorkspace(Database);
}

async function runGenerationRecordMode(Database) {
  if (config.mode === "generation-record-source-setup") {
    return await setupGenerationPublication(Database, {
      stagedCandidate: true,
      sourceOnly: true,
    });
  }
  const throughRecordKind =
    config.mode === "generation-record-recover-intent"
      ? "intent"
      : config.mode === "generation-record-recover-verified"
        ? "candidate-verified"
        : config.mode === "generation-record-recover-operation"
          ? "operation"
          : config.failpoint.startsWith("after-intent-")
            ? "intent"
            : config.failpoint.startsWith("after-candidate-verified-")
              ? "candidate-verified"
              : "operation";
  const reachRecordFailpoint =
    config.mode === "generation-record-fault"
      ? (state) => {
          if (state.failpoint !== config.failpoint) return;
          writeFixedProgress(recordReadyProgressStage(state.recordKind));
          const boundary = createImmutableRecordFaultBoundaryRecord({
            processId: process.pid,
            workspaceId: config.workspaceId,
            operationId: GENERATION_PUBLICATION_IDS.operationId,
            state,
          });
          writeFixedProgress("generation-record-fault-boundary-ready");
          emitGenerationFaultBoundaryRecord(boundary);
          holdForForcedTermination({ timeoutMs: 120_000 });
        }
      : undefined;
  const result = await advanceGenerationPreparationRecords(Database, {
    throughRecordKind,
    reachRecordFailpoint,
  });
  if (config.mode === "generation-record-fault") fail("PROBE_FAILED");
  return result;
}

async function runGenerationCandidateBuildMode(Database) {
  if (config.mode === "generation-candidate-source-setup") {
    return await setupGenerationPublication(Database, {
      stagedCandidate: true,
      sourceOnly: true,
      exportTimingPayload: true,
    });
  }
  const reachCandidateFailpoint =
    config.mode === "generation-candidate-fault"
      ? ({ failpoint, state }) => {
          if (failpoint !== config.failpoint) return;
          const boundary = createGenerationCandidateBuildFaultBoundaryRecord({
            processId: process.pid,
            failpoint,
            state,
          });
          writeFixedProgress("generation-candidate-build-fault-boundary-ready");
          emitGenerationFaultBoundaryRecord(boundary);
          if (failpoint !== "during-sqlcipher-export") {
            holdForForcedTermination({ timeoutMs: 120_000 });
          }
        }
      : undefined;
  const result = await advanceGenerationPreparationRecords(Database, {
    throughRecordKind: "candidate-verified",
    reachRecordFailpoint: undefined,
    reachCandidateFailpoint,
  });
  if (config.mode === "generation-candidate-fault") fail("PROBE_FAILED");
  return result;
}

function verifyPackagedIdentity() {
  const expectedArchive = path.join(process.resourcesPath, "app.asar");
  const expectedUnpackedRoot = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
  );
  const expectedAddon = path.join(
    expectedUnpackedRoot,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );
  const expectedExecutable =
    process.platform === "darwin" ? APP_NAME : `${APP_NAME}.exe`;
  if (
    !app.isPackaged ||
    process.env.ELECTRON_RUN_AS_NODE ||
    process.arch !== "x64" ||
    !/^(darwin|win32)$/.test(process.platform) ||
    process.versions.electron !== ELECTRON_VERSION ||
    app.getName() !== APP_NAME ||
    path.basename(process.execPath) !== expectedExecutable ||
    path.resolve(app.getAppPath()) !== path.resolve(expectedArchive) ||
    !pathsMatch(app.getPath("userData"), config.expectedUserData) ||
    !pathsMatch(app.getPath("sessionData"), config.expectedUserData) ||
    !pathsMatch(app.getPath("temp"), config.expectedTemp) ||
    !pathsMatch(app.getPath("crashDumps"), config.expectedCrashDumps)
  ) {
    fail("PACKAGED_IDENTITY_INVALID");
  }

  // Electron's patched fs treats app.asar as a virtual directory. Inspect the
  // archive through original-fs so this check proves the physical package
  // layout instead of asserting against Electron's synthetic ASAR metadata.
  const archiveMetadata = pathKind(expectedArchive, originalFs);
  const unpackedMetadata = pathKind(expectedUnpackedRoot);
  const addonMetadata = pathKind(expectedAddon);
  if (
    !archiveMetadata?.isFile() ||
    !unpackedMetadata?.isDirectory() ||
    !addonMetadata?.isFile() ||
    addonMetadata.isSymbolicLink()
  ) {
    fail("PACKAGED_IDENTITY_INVALID");
  }

  const matches = [];
  function findBindings(target) {
    const metadata = fs.lstatSync(target);
    if (metadata.isSymbolicLink()) return;
    if (metadata.isDirectory()) {
      for (const entry of fs.readdirSync(target)) {
        findBindings(path.join(target, entry));
      }
    } else if (
      metadata.isFile() &&
      path.basename(target) === "better_sqlite3.node"
    ) {
      matches.push(fs.realpathSync.native(target));
    }
  }
  findBindings(
    path.join(expectedUnpackedRoot, "node_modules", "better-sqlite3"),
  );
  if (
    matches.length !== 1 ||
    matches[0] !== fs.realpathSync.native(expectedAddon)
  ) {
    fail("PACKAGED_IDENTITY_INVALID");
  }

  if (process.platform === "darwin") {
    const infoPlist = path.resolve(
      path.dirname(process.execPath),
      "..",
      "Info.plist",
    );
    const contents = fs.readFileSync(infoPlist);
    try {
      if (
        !contents.includes(Buffer.from(APP_ID, "utf8")) ||
        !contents.includes(Buffer.from(APP_NAME, "utf8"))
      ) {
        fail("PACKAGED_IDENTITY_INVALID");
      }
    } finally {
      contents.fill(0);
    }
  }

  nativeAddonPackaged = true;
}

async function loadDatabaseConstructor() {
  let module;
  try {
    module = await import("better-sqlite3");
  } catch {
    fail("ENCRYPTION_UNAVAILABLE");
  }
  if (typeof module.default !== "function") fail("ENCRYPTION_UNAVAILABLE");
  return module.default;
}

try {
  config = parseConfig();
  fs.mkdirSync(config.stateRoot, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(config.stateRoot).isDirectory()) fail("CONFIG_INVALID");
  for (const directory of [
    config.expectedUserData,
    config.expectedTemp,
    config.expectedCrashDumps,
  ]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  app.disableHardwareAcceleration();
  app.setAppUserModelId(APP_ID);
  app.setPath("sessionData", config.expectedUserData);
  app.setPath("temp", config.expectedTemp);
  app.setPath("crashDumps", config.expectedCrashDumps);
} catch (error) {
  const failure =
    error instanceof ProbeFailure ? error : new ProbeFailure("CONFIG_INVALID");
  writeFixedResult(fixedResult("fail", failure.code), failure.exitCode);
  exitImmediately(failure.exitCode);
}

if (config) {
  app.whenReady().then(async () => {
    let result;
    let exitCode;
    try {
      verifyPackagedIdentity();
      writeFixedProgress("identity-verified");
      if (config.mode === "provider-initialize") {
        await awaitProviderBootstrapTurn();
        writeFixedProgress("provider-bootstrap-complete");
        result = await initializeProvider();
        writeFixedProgress("provider-roundtrip-complete");
      } else if (config.mode === "plaintext") {
        assertNoInheritedProviderChannel();
        writeFixedProgress("phase-two-ready");
        const Database = await loadDatabaseConstructor();
        writeFixedProgress("native-addon-ready");
        result = createPlaintextFixture(Database);
      } else {
        assertNoInheritedProviderChannel();
        writeFixedProgress("phase-two-ready");
        await requireAsyncEncryption();
        writeFixedProgress("safe-storage-ready");
        const Database = await loadDatabaseConstructor();
        writeFixedProgress("native-addon-ready");
        if (config.mode === "provision") {
          result = await provisionStore(Database);
        } else if (config.mode === "verify") {
          result = await verifyStore(Database);
        } else if (GENERATION_CANDIDATE_BUILD_MODES.has(config.mode)) {
          result = await runGenerationCandidateBuildMode(Database);
        } else if (GENERATION_RECORD_MODES.has(config.mode)) {
          result = await runGenerationRecordMode(Database);
        } else if (GENERATION_PREPARATION_MODES.has(config.mode)) {
          result = await runGenerationPreparationMode(Database);
        } else if (GENERATION_MODES.has(config.mode)) {
          result = await runGenerationMode(Database);
        } else {
          result = await runRecoveryMode(Database);
        }
      }
      exitCode = 0;
    } catch (error) {
      const recoveryFailureCode =
        error instanceof RecoveryCaptureFixtureError &&
        typeof error.code === "string" &&
        /^RECOVERY_[A-Z0-9_]+$/.test(error.code)
          ? error.code
          : undefined;
      const generationFailureCode =
        error instanceof GenerationPublicationError &&
        typeof error.code === "string" &&
        /^GENERATION_[A-Z0-9_]+$/.test(error.code)
          ? error.code
          : undefined;
      const failure =
        error instanceof ProbeFailure
          ? error
          : new ProbeFailure(
              recoveryFailureCode ?? generationFailureCode ?? "PROBE_FAILED",
            );
      result = fixedResult("fail", failure.code);
      exitCode = failure.exitCode;
    }
    writeFixedProgress("result-ready");
    finish(result, exitCode);
  });
}
