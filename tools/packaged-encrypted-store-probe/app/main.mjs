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
  createGenerationFaultBoundaryRecord,
  createGenerationPublicationFixture,
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
  const scenarioMode = recoveryMode || generationMode;
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

function checkpointAndCloseGenerationDatabase(database, databasePath) {
  try {
    const checkpoint = database.pragma("wal_checkpoint(TRUNCATE)");
    if (
      !Array.isArray(checkpoint) ||
      checkpoint.length !== 1 ||
      !hasExactKeys(checkpoint[0], ["busy", "checkpointed", "log"]) ||
      checkpoint[0].busy !== 0
    ) {
      fail("DATABASE_INTEGRITY_FAILED");
    }
  } catch (error) {
    if (error instanceof ProbeFailure) throw error;
    fail("DATABASE_INTEGRITY_FAILED");
  }
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
}) {
  let lastFacts;
  let lastCaptureVerification;
  return {
    verify({ databasePath, expectedIdentity, expectedIdentityDigest, role }) {
      assertGenerationDatabaseSidecarsAbsent(databasePath);
      const key = scope.keep(Buffer.from(baseKey));
      let database;
      try {
        database = openKeyedDatabase(
          Database,
          key,
          { readonly: true, fileMustExist: true },
          databasePath,
        );
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
        const identity = verifyGenerationDatabaseIdentity(database, {
          expectedIdentity,
          expectedIdentityDigest,
          expectMigration: role === "candidate",
        });
        verifyDatabaseIntegrity(database);
        closeDatabase(database);
        database = undefined;
        removeGenerationReadSidecars(databasePath);
        assertGenerationDatabaseSidecarsAbsent(databasePath);
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

async function setupGenerationPublication(Database) {
  if (pathKind(config.generationWorkspaceRoot)) fail("DATABASE_EXISTS");
  const scope = createSensitiveScope();
  const canaries = [];
  let captureCanaries = [];
  let database;
  try {
    captureCanaries = createRecoveryCaptureCanaries(scope);
    const { key, markerDigest } = await unwrapKey(scope, canaries);
    const baseKey = scope.keep(Buffer.from(key));
    const sourceReopenKey = scope.keep(Buffer.from(key));
    const exportKey = scope.keep(Buffer.from(key));
    const candidateKey = scope.keep(Buffer.from(key));
    const candidateReopenKey = scope.keep(Buffer.from(key));
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
    readEncryptionFacts(database);
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
    fs.mkdirSync(paths.sourceGenerationDirectoryPath, {
      recursive: true,
      mode: 0o700,
    });
    fs.mkdirSync(paths.candidateGenerationDirectoryPath, {
      recursive: true,
      mode: 0o700,
    });
    fs.mkdirSync(paths.operationDirectoryPath, {
      recursive: true,
      mode: 0o700,
    });
    fs.renameSync(config.wrapperPath, paths.wrapperPath);
    fs.renameSync(config.databasePath, paths.sourceDatabasePath);

    reserveDatabase(paths.candidateDatabasePath);
    database = openKeyedDatabase(
      Database,
      sourceReopenKey,
      { fileMustExist: true },
      paths.sourceDatabasePath,
    );
    try {
      database
        .prepare("ATTACH DATABASE ? AS encrypted_export")
        .run(paths.candidateDatabasePath);
      try {
        database.key(exportKey, "encrypted_export");
      } finally {
        exportKey.fill(0);
      }
      database.prepare("SELECT sqlcipher_export('encrypted_export')").get();
      database.exec("DETACH DATABASE encrypted_export");
    } catch {
      fail("DATABASE_INTEGRITY_FAILED");
    }
    closeDatabase(database);
    database = undefined;

    database = openKeyedDatabase(
      Database,
      candidateKey,
      { fileMustExist: true },
      paths.candidateDatabasePath,
    );
    configureGenerationDatabase(database);
    // sqlcipher_export intentionally leaves the target user_version unchanged.
    // Restore the verified source header before applying the synthetic v2 step.
    database.pragma("user_version = 1");
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
    checkpointAndCloseGenerationDatabase(database, paths.candidateDatabasePath);
    database = undefined;

    database = openKeyedDatabase(
      Database,
      candidateReopenKey,
      { readonly: true, fileMustExist: true },
      paths.candidateDatabasePath,
    );
    const facts = readEncryptionFacts(database);
    readAndVerifyMarker(database, markerDigest);
    const candidateCapture = verifyRecoveryCaptureState(database, {
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
    removeGenerationReadSidecars(paths.candidateDatabasePath);

    writeCanonicalGenerationFile(paths.manifestPath, fixture.sourceManifest);
    writeCanonicalGenerationFile(
      paths.operationRecordPath,
      fixture.operationRecord,
    );
    const verifier = createGenerationDatabaseVerifier({
      Database,
      baseKey,
      markerDigest,
      scope,
      canaries,
    });
    const state = verifyGenerationPublicationState({
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
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      paths.sourceDatabasePath,
    );
    assertEncryptedDatabaseFile(
      [...canaries, ...captureCanaries],
      paths.candidateDatabasePath,
    );
    scanGenerationSecrets(canaries, captureCanaries);
    writeFixedProgress("generation-candidate-verified");
    writeFixedProgress("generation-setup-complete");
    return fixedResult("pass", "GENERATION_PUBLICATION_PREPARED", {
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
      manifestDigest: state.manifestDigest,
      operationRecordDigest: state.operationRecordDigest,
      wrapperDigest: state.wrapperDigest,
      inputFingerprint: state.inputFingerprint,
      outcomeDigest: state.publicationOutcomeDigest,
      temporaryManifestPresent: state.temporaryManifestPresent,
      sourceGenerationPresent: state.sourceGenerationPresent,
      candidateGenerationPresent: state.candidateGenerationPresent,
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
    });
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

async function runGenerationMode(Database) {
  if (config.mode === "generation-setup") {
    return await setupGenerationPublication(Database);
  }
  return await useGenerationPublicationWorkspace(Database);
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
