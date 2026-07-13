import {
  GenerationPublicationError,
  canonicalGenerationBytes,
  digestGenerationValue,
} from "./generation-publication.mjs";

const IDENTITY_TABLE = "generation_identity";
const MIGRATION_TABLE = "generation_migration_probe";
const MIGRATION_ID = "synthetic-schema-v2";

function invariant(condition, code) {
  if (!condition) throw new GenerationPublicationError(code);
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
  invariant(isRecord(database), "GENERATION_DATABASE_INVALID");
  invariant(typeof database.exec === "function", "GENERATION_DATABASE_INVALID");
  invariant(
    typeof database.prepare === "function",
    "GENERATION_DATABASE_INVALID",
  );
  invariant(
    typeof database.pragma === "function",
    "GENERATION_DATABASE_INVALID",
  );
  invariant(
    typeof database.inTransaction === "boolean",
    "GENERATION_DATABASE_INVALID",
  );
}

function rollbackQuietly(database) {
  if (!database.inTransaction) return;
  try {
    database.exec("ROLLBACK");
  } catch {
    // Preserve the primary deterministic fixture failure.
  }
}

function identityJson(identity) {
  const bytes = canonicalGenerationBytes(identity);
  try {
    return bytes.subarray(0, bytes.length - 1).toString("utf8");
  } finally {
    bytes.fill(0);
  }
}

export function installInitialGenerationIdentity(database, identity) {
  assertDatabase(database);
  invariant(!database.inTransaction, "GENERATION_TRANSACTION_ALREADY_OPEN");
  invariant(identity.schemaVersion === 1, "GENERATION_IDENTITY_INVALID");
  const digest = digestGenerationValue(identity);
  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec(`
      CREATE TABLE ${IDENTITY_TABLE} (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        identity_json TEXT NOT NULL,
        identity_digest TEXT NOT NULL CHECK (length(identity_digest) = 64)
      ) STRICT;
    `);
    database
      .prepare(
        `INSERT INTO ${IDENTITY_TABLE} (
          singleton, identity_json, identity_digest
        ) VALUES (1, ?, ?)`,
      )
      .run(identityJson(identity), digest);
    database.pragma("user_version = 1");
    database.exec("COMMIT");
  } catch (error) {
    rollbackQuietly(database);
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError("GENERATION_IDENTITY_INSTALL_FAILED");
  }
  return Object.freeze({ identity, identityDigest: digest });
}

export function applySyntheticGenerationMigration(
  database,
  identity,
  options = {},
) {
  assertDatabase(database);
  invariant(!database.inTransaction, "GENERATION_TRANSACTION_ALREADY_OPEN");
  invariant(identity.schemaVersion === 2, "GENERATION_IDENTITY_INVALID");
  invariant(
    isRecord(options) &&
      (hasExactKeys(options, []) ||
        hasExactKeys(options, ["reachTransactionFailpoint"])) &&
      (options.reachTransactionFailpoint === undefined ||
        typeof options.reachTransactionFailpoint === "function"),
    "GENERATION_MIGRATION_OPTIONS_INVALID",
  );
  const digest = digestGenerationValue(identity);
  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec(`
      CREATE TABLE ${MIGRATION_TABLE} (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        migration_id TEXT NOT NULL UNIQUE,
        schema_version INTEGER NOT NULL CHECK (schema_version = 2)
      ) STRICT;
    `);
    database
      .prepare(
        `INSERT INTO ${MIGRATION_TABLE} (
          singleton, migration_id, schema_version
        ) VALUES (1, ?, 2)`,
      )
      .run(MIGRATION_ID);
    const update = database
      .prepare(
        `UPDATE ${IDENTITY_TABLE}
         SET identity_json = ?, identity_digest = ?
         WHERE singleton = 1`,
      )
      .run(identityJson(identity), digest);
    invariant(update.changes === 1, "GENERATION_IDENTITY_UPDATE_FAILED");
    database.pragma("user_version = 2");
    options.reachTransactionFailpoint?.({
      failpoint: "during-synthetic-migration",
      transactionOpen: database.inTransaction,
    });
    database.exec("COMMIT");
  } catch (error) {
    rollbackQuietly(database);
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError("GENERATION_MIGRATION_FAILED");
  }
  return Object.freeze({
    identity,
    identityDigest: digest,
    migrationId: MIGRATION_ID,
  });
}

function readSchemaObjects(database) {
  const rows = database
    .prepare(
      `SELECT name, type FROM sqlite_master
       WHERE name IN (?, ?)
       ORDER BY name`,
    )
    .all(IDENTITY_TABLE, MIGRATION_TABLE);
  invariant(Array.isArray(rows), "GENERATION_SCHEMA_INVALID");
  return rows;
}

export function verifyGenerationDatabaseIdentity(
  database,
  { expectedIdentity, expectedIdentityDigest, expectMigration },
) {
  assertDatabase(database);
  invariant(!database.inTransaction, "GENERATION_TRANSACTION_ALREADY_OPEN");
  invariant(
    typeof expectMigration === "boolean",
    "GENERATION_VERIFY_OPTIONS_INVALID",
  );
  invariant(
    digestGenerationValue(expectedIdentity) === expectedIdentityDigest,
    "GENERATION_EXPECTED_IDENTITY_INVALID",
  );
  const expectedSchemaVersion = expectMigration ? 2 : 1;
  invariant(
    expectedIdentity.schemaVersion === expectedSchemaVersion,
    "GENERATION_EXPECTED_IDENTITY_INVALID",
  );

  let row;
  try {
    const objects = readSchemaObjects(database);
    invariant(
      objects.length === (expectMigration ? 2 : 1) &&
        objects.every(
          (object) =>
            hasExactKeys(object, ["name", "type"]) && object.type === "table",
        ) &&
        objects.some((object) => object.name === IDENTITY_TABLE) &&
        objects.some((object) => object.name === MIGRATION_TABLE) ===
          expectMigration,
      "GENERATION_SCHEMA_INVALID",
    );
    invariant(
      database.pragma("user_version", { simple: true }) ===
        expectedSchemaVersion,
      "GENERATION_SCHEMA_VERSION_INVALID",
    );
    row = database
      .prepare(
        `SELECT
          singleton,
          identity_json AS identityJson,
          identity_digest AS identityDigest
         FROM ${IDENTITY_TABLE}`,
      )
      .get();
    invariant(
      hasExactKeys(row, ["identityDigest", "identityJson", "singleton"]) &&
        row.singleton === 1 &&
        row.identityJson === identityJson(expectedIdentity) &&
        row.identityDigest === expectedIdentityDigest,
      "GENERATION_DATABASE_IDENTITY_MISMATCH",
    );
    const parsed = JSON.parse(row.identityJson);
    invariant(
      identityJson(parsed) === row.identityJson &&
        digestGenerationValue(parsed) === row.identityDigest,
      "GENERATION_DATABASE_IDENTITY_MISMATCH",
    );
    if (expectMigration) {
      const migration = database
        .prepare(
          `SELECT
            singleton,
            migration_id AS migrationId,
            schema_version AS schemaVersion
           FROM ${MIGRATION_TABLE}`,
        )
        .get();
      invariant(
        hasExactKeys(migration, [
          "migrationId",
          "schemaVersion",
          "singleton",
        ]) &&
          migration.singleton === 1 &&
          migration.migrationId === MIGRATION_ID &&
          migration.schemaVersion === 2,
        "GENERATION_MIGRATION_INVALID",
      );
    }
    return Object.freeze(parsed);
  } catch (error) {
    if (error instanceof GenerationPublicationError) throw error;
    throw new GenerationPublicationError("GENERATION_DATABASE_VERIFY_FAILED");
  }
}
