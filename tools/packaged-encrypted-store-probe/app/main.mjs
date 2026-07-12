import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import originalFs from "original-fs";
import { app, safeStorage } from "electron";

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
const TERMINATION_FAILSAFE_MS = 30_000;
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
      readyForTermination: true,
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

function finish(result, exitCode) {
  if (finishStarted) return;
  if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
    throw new Error("EXIT_CODE_INVALID");
  }
  finishStarted = true;
  process.exitCode = exitCode;
  setTimeout(
    () => process.kill(process.pid, "SIGKILL"),
    TERMINATION_FAILSAFE_MS,
  );
  // Every store path closes and scans its state before returning here. The
  // synchronous readiness record lets the parent terminate the still-live
  // packaged process tree and verify that all inherited pipes close.
  writeFixedResult(result, exitCode);
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
  const allowedPrefixes = [
    "--probe-mode=",
    "--probe-state-root=",
    "--probe-workspace=",
    "--probe-wrapper=",
    "--probe-database=",
  ];
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

  const mode = getArgument("mode");
  const stateRoot = getArgument("state-root");
  const workspaceId = getArgument("workspace");
  const wrapperName = getArgument("wrapper");
  const databaseName = getArgument("database");

  if (!new Set(["provision", "verify", "plaintext"]).has(mode)) {
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

async function unwrapKey(scope, canaries) {
  const metadata = pathKind(config.wrapperPath);
  if (!metadata) fail("WRAPPER_MISSING");
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("WRAPPER_INVALID");

  const contents = scope.keep(fs.readFileSync(config.wrapperPath));
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

  const key = scope.keep(Buffer.from(payload.keyMaterial, "base64url"));
  if (key.length !== 32 || key.toString("base64url") !== payload.keyMaterial) {
    fail("WRAPPER_INVALID");
  }
  addEncodedCanaries(scope, canaries, key);
  addEncodedCanaries(
    scope,
    canaries,
    scope.keep(Buffer.from(decrypted.result, "utf8")),
  );
  return { key, markerDigest: payload.markerDigest };
}

function openKeyedDatabase(Database, key, options) {
  let database;
  try {
    database = new Database(config.databasePath, options);
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

function assertEncryptedDatabaseAndWal(canaries) {
  const databaseContents = fs.readFileSync(config.databasePath);
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

  const walPath = `${config.databasePath}-wal`;
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

    const encrypted = await encryptPayload(payload, canaries, scope);
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
    reserveDatabase(config.databasePath);
    database = openKeyedDatabase(Database, key, { fileMustExist: true });
    const facts = readEncryptionFacts(database);
    configureSchema(database);
    insertMarker(database, marker);
    readAndVerifyMarker(database, markerDigest);
    verifyDatabaseIntegrity(database);
    assertEncryptedDatabaseAndWal(canaries);
    scanKnownSecrets(canaries);
    closeDatabase(database);
    database = undefined;
    scanKnownSecrets(canaries);

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
  finish(fixedResult("fail", failure.code), failure.exitCode);
}

if (config) {
  app.whenReady().then(async () => {
    try {
      verifyPackagedIdentity();
      const Database = await loadDatabaseConstructor();
      let result;
      if (config.mode === "plaintext") {
        result = createPlaintextFixture(Database);
      } else {
        await requireAsyncEncryption();
        result =
          config.mode === "provision"
            ? await provisionStore(Database)
            : await verifyStore(Database);
      }
      finish(result, 0);
    } catch (error) {
      const failure =
        error instanceof ProbeFailure
          ? error
          : new ProbeFailure("PROBE_FAILED");
      finish(fixedResult("fail", failure.code), failure.exitCode);
    }
  });
}
