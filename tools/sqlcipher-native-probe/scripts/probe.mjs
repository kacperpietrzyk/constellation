import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "constellation-sqlcipher-native-probe-"),
);
const databasePath = path.join(temporaryDirectory, "workspace.db");
const exportPath = path.join(temporaryDirectory, "workspace-export.db");
const marker = "CONSTELLATION_SYNTHETIC_NATIVE_PROBE";
const mainKey = randomBytes(32);
const exportKey = randomBytes(32);
const exportReopenKey = Buffer.from(exportKey);
const wrongKey = randomBytes(32);
let result;
let database;
let restored;

function closeQuietly(connection) {
  try {
    connection?.close();
  } catch {
    // Preserve the primary assertion/build error while still attempting cleanup.
  }
}

try {
  assert.equal(process.arch, "x64");
  assert.match(process.platform, /^(darwin|win32)$/);
  assert.equal(process.versions.electron, "43.1.0");

  database = new Database(databasePath);
  assert.throws(() => database.key("not-a-buffer"), TypeError);
  assert.throws(() => database.key(Buffer.alloc(31)), RangeError);
  const invalidSchemaKey = Buffer.alloc(32);
  try {
    assert.throws(() => database.key(invalidSchemaKey, "other"), RangeError);
  } finally {
    invalidSchemaKey.fill(0);
  }
  database.key(mainKey);
  mainKey.fill(0);

  const cipherVersion = database.pragma("cipher_version", { simple: true });
  const provider = database.pragma("cipher_provider", { simple: true });
  const providerVersion = database.pragma("cipher_provider_version", {
    simple: true,
  });
  assert.equal(cipherVersion, "4.16.0 community");
  assert.equal(typeof provider, "string");
  assert.equal(typeof providerVersion, "string");
  assert(providerVersion.length > 0);
  if (process.platform === "win32") {
    assert.equal(provider, "openssl");
    assert.match(providerVersion, /^OpenSSL 3\.5\.7\b/);
  } else {
    assert.equal(provider, "commoncrypto");
  }

  const compileOptions = new Set(
    database.pragma("compile_options").map((row) => row.compile_options),
  );
  assert(compileOptions.has("HAS_CODEC"));
  assert(compileOptions.has("ENABLE_FTS5"));
  assert(compileOptions.has("OMIT_LOAD_EXTENSION"));
  assert.equal(database.pragma("journal_mode = WAL", { simple: true }), "wal");
  database.pragma("wal_autocheckpoint = 0");

  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE records_fts USING fts5(body);
  `);
  database.transaction(() => {
    database
      .prepare("INSERT INTO records VALUES (?, ?)")
      .run("probe-1", marker);
    database.prepare("INSERT INTO records_fts VALUES (?)").run(marker);
  })();

  assert.equal(
    database
      .prepare(
        "SELECT count(*) AS count FROM records_fts WHERE records_fts MATCH ?",
      )
      .get("CONSTELLATION").count,
    1,
  );
  assert.deepEqual(database.pragma("cipher_integrity_check"), []);
  assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(database.pragma("foreign_key_check"), []);

  const liveWalPath = `${databasePath}-wal`;
  assert.equal(fs.existsSync(liveWalPath), true);
  const liveWal = fs.readFileSync(liveWalPath);
  try {
    assert.equal(liveWal.includes(Buffer.from(marker)), false);
  } finally {
    liveWal.fill(0);
  }

  const exportDescriptor = fs.openSync(exportPath, "wx", 0o600);
  fs.closeSync(exportDescriptor);
  database.prepare("ATTACH DATABASE ? AS encrypted_export").run(exportPath);
  database.key(exportKey, "encrypted_export");
  exportKey.fill(0);
  database.prepare("SELECT sqlcipher_export('encrypted_export')").get();
  database.exec("DETACH DATABASE encrypted_export");
  database.pragma("wal_checkpoint(TRUNCATE)");
  database.close();
  database = undefined;

  for (const encryptedPath of [databasePath, exportPath]) {
    const contents = fs.readFileSync(encryptedPath);
    assert.notEqual(
      contents.subarray(0, 16).toString("utf8"),
      "SQLite format 3\0",
    );
    assert.equal(contents.includes(Buffer.from(marker)), false);
    contents.fill(0);
  }

  assert.throws(() => {
    const wrong = new Database(databasePath, { readonly: true });
    try {
      wrong.key(wrongKey);
      wrongKey.fill(0);
      wrong.prepare("SELECT count(*) FROM sqlite_master").get();
    } finally {
      wrong.close();
    }
  }, /not a database/i);

  restored = new Database(exportPath, { readonly: true });
  restored.key(exportReopenKey);
  exportReopenKey.fill(0);
  assert.equal(
    restored.prepare("SELECT body FROM records WHERE id = ?").get("probe-1")
      .body,
    marker,
  );
  assert.deepEqual(restored.pragma("cipher_integrity_check"), []);
  restored.close();
  restored = undefined;

  result = {
    status: "pass",
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    cipherVersion,
    provider,
    providerVersion,
    rawKeyBinding: true,
    encryptedWal: true,
    fts5: true,
    loadableExtensions: false,
    wrongKeyRejected: true,
    encryptedExportRoundTrip: true,
  };
} finally {
  closeQuietly(restored);
  closeQuietly(database);
  mainKey.fill(0);
  exportKey.fill(0);
  exportReopenKey.fill(0);
  wrongKey.fill(0);
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(JSON.stringify(result, null, 2));
