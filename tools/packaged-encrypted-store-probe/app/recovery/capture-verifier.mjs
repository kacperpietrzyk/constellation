import {
  RECOVERY_CAPTURE_FIXTURE,
  RECOVERY_CAPTURE_SCENARIO,
  RECOVERY_CAPTURE_SCHEMA_OBJECTS,
  RecoveryCaptureFixtureError,
  canonicalJson,
  readRecoveryCaptureCounts,
  sha256Canonical,
} from "./capture-command.mjs";

export const RECOVERY_CAPTURE_EXPECTED_STATES = Object.freeze([
  "empty",
  "committed",
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

function deepFreeze(value) {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
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

function parseCanonicalJson(value, code) {
  invariant(typeof value === "string", code);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RecoveryCaptureFixtureError(code);
  }
  invariant(canonicalJson(parsed) === value, code);
  return parsed;
}

function selectRows(database, sql, expectedKeys) {
  const rows = database.prepare(sql).all();
  invariant(Array.isArray(rows), "RECOVERY_QUERY_SHAPE_INVALID");
  for (const row of rows) {
    invariant(hasExactKeys(row, expectedKeys), "RECOVERY_QUERY_SHAPE_INVALID");
  }
  return rows;
}

function readWorkspaceRows(database) {
  return selectRows(
    database,
    `SELECT
      id,
      name,
      timezone,
      root_space_id AS rootSpaceId,
      default_task_status_id AS defaultTaskStatusId,
      version,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM recovery_workspaces ORDER BY id`,
    [
      "id",
      "name",
      "timezone",
      "rootSpaceId",
      "defaultTaskStatusId",
      "version",
      "createdAt",
      "updatedAt",
    ],
  );
}

function readSpaceRows(database) {
  return selectRows(
    database,
    `SELECT
      id,
      workspace_id AS workspaceId,
      name,
      version,
      created_at AS createdAt
    FROM recovery_spaces ORDER BY id`,
    ["id", "workspaceId", "name", "version", "createdAt"],
  );
}

function readMembershipRows(database) {
  return selectRows(
    database,
    `SELECT
      id,
      workspace_id AS workspaceId,
      principal_id AS principalId,
      role,
      version,
      created_at AS createdAt
    FROM recovery_memberships ORDER BY id`,
    ["id", "workspaceId", "principalId", "role", "version", "createdAt"],
  );
}

function readCaptureRows(database) {
  return selectRows(
    database,
    `SELECT
      id,
      workspace_id AS workspaceId,
      space_id AS spaceId,
      original_text AS originalText,
      device_id AS deviceId,
      source,
      captured_at AS capturedAt,
      submitted_by AS submittedBy,
      processing_state AS processingState,
      version
    FROM recovery_captures ORDER BY id`,
    [
      "id",
      "workspaceId",
      "spaceId",
      "originalText",
      "deviceId",
      "source",
      "capturedAt",
      "submittedBy",
      "processingState",
      "version",
    ],
  );
}

function readEventRows(database) {
  return selectRows(
    database,
    `SELECT
      id,
      type,
      workspace_id AS workspaceId,
      space_id AS spaceId,
      aggregate_id AS aggregateId,
      aggregate_version AS aggregateVersion,
      occurred_at AS occurredAt,
      source
    FROM recovery_domain_events ORDER BY id`,
    [
      "id",
      "type",
      "workspaceId",
      "spaceId",
      "aggregateId",
      "aggregateVersion",
      "occurredAt",
      "source",
    ],
  );
}

function readAuditRows(database) {
  const rows = selectRows(
    database,
    `SELECT
      id,
      workspace_id AS workspaceId,
      space_id AS spaceId,
      principal_id AS principalId,
      grant_id AS grantId,
      origin,
      command_id AS commandId,
      command_name AS commandName,
      correlation_id AS correlationId,
      affected_record_ids_json AS affectedRecordIdsJson,
      record_versions_json AS recordVersionsJson,
      changed_fields_json AS changedFieldsJson,
      occurred_at AS occurredAt,
      outcome
    FROM recovery_audit_receipts ORDER BY id`,
    [
      "id",
      "workspaceId",
      "spaceId",
      "principalId",
      "grantId",
      "origin",
      "commandId",
      "commandName",
      "correlationId",
      "affectedRecordIdsJson",
      "recordVersionsJson",
      "changedFieldsJson",
      "occurredAt",
      "outcome",
    ],
  );
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    spaceId: row.spaceId,
    principalId: row.principalId,
    grantId: row.grantId,
    origin: row.origin,
    commandId: row.commandId,
    commandName: row.commandName,
    correlationId: row.correlationId,
    affectedRecordIds: parseCanonicalJson(
      row.affectedRecordIdsJson,
      "RECOVERY_AUDIT_JSON_INVALID",
    ),
    recordVersions: parseCanonicalJson(
      row.recordVersionsJson,
      "RECOVERY_AUDIT_JSON_INVALID",
    ),
    changedFields: parseCanonicalJson(
      row.changedFieldsJson,
      "RECOVERY_AUDIT_JSON_INVALID",
    ),
    occurredAt: row.occurredAt,
    outcome: row.outcome,
  }));
}

function readIdempotencyRows(database) {
  const rows = selectRows(
    database,
    `SELECT
      scope,
      fingerprint,
      outcome_json AS outcomeJson,
      outcome_digest AS outcomeDigest
    FROM recovery_idempotency_outcomes ORDER BY scope`,
    ["scope", "fingerprint", "outcomeJson", "outcomeDigest"],
  );
  return rows.map((row) => {
    const outcome = parseCanonicalJson(
      row.outcomeJson,
      "RECOVERY_OUTCOME_INVALID",
    );
    invariant(
      sha256Canonical(outcome) === row.outcomeDigest,
      "RECOVERY_OUTCOME_DIGEST_INVALID",
    );
    return {
      scope: row.scope,
      fingerprint: row.fingerprint,
      outcome,
      outcomeDigest: row.outcomeDigest,
    };
  });
}

function readOutboxRows(database) {
  return selectRows(
    database,
    `SELECT
      id,
      workspace_id AS workspaceId,
      space_id AS spaceId,
      event_id AS eventId,
      topic,
      created_at AS createdAt
    FROM recovery_outbox ORDER BY id`,
    ["id", "workspaceId", "spaceId", "eventId", "topic", "createdAt"],
  );
}

function readFtsRows(database) {
  const rows = database
    .prepare(
      `SELECT capture.id AS captureId
       FROM recovery_captures_fts AS search
       JOIN recovery_captures AS capture ON capture.rowid = search.rowid
       WHERE recovery_captures_fts MATCH ?
       ORDER BY capture.id`,
    )
    .all(RECOVERY_CAPTURE_FIXTURE.ftsQuery);
  invariant(Array.isArray(rows), "RECOVERY_QUERY_SHAPE_INVALID");
  for (const row of rows) {
    invariant(hasExactKeys(row, ["captureId"]), "RECOVERY_QUERY_SHAPE_INVALID");
  }
  return rows;
}

export function readCanonicalRecoveryCaptureState(database) {
  assertDatabase(database);
  invariant(!database.inTransaction, "RECOVERY_TRANSACTION_ALREADY_OPEN");
  return deepFreeze({
    workspaces: readWorkspaceRows(database),
    spaces: readSpaceRows(database),
    memberships: readMembershipRows(database),
    captures: readCaptureRows(database),
    events: readEventRows(database),
    audits: readAuditRows(database),
    idempotency: readIdempotencyRows(database),
    outbox: readOutboxRows(database),
    fts: readFtsRows(database),
  });
}

function expectedCanonicalState(expectedState) {
  const commandCommitted = expectedState === "committed";
  return {
    workspaces: [RECOVERY_CAPTURE_FIXTURE.workspace],
    spaces: [RECOVERY_CAPTURE_FIXTURE.space],
    memberships: [RECOVERY_CAPTURE_FIXTURE.membership],
    captures: commandCommitted ? [RECOVERY_CAPTURE_FIXTURE.capture] : [],
    events: commandCommitted ? [RECOVERY_CAPTURE_FIXTURE.event] : [],
    audits: commandCommitted ? [RECOVERY_CAPTURE_FIXTURE.audit] : [],
    idempotency: commandCommitted
      ? [
          {
            scope: RECOVERY_CAPTURE_FIXTURE.idempotencyScope,
            fingerprint: RECOVERY_CAPTURE_FIXTURE.semanticFingerprint,
            outcome: RECOVERY_CAPTURE_FIXTURE.outcome,
            outcomeDigest: RECOVERY_CAPTURE_FIXTURE.outcomeDigest,
          },
        ]
      : [],
    outbox: commandCommitted ? [RECOVERY_CAPTURE_FIXTURE.outbox] : [],
    fts: commandCommitted
      ? [{ captureId: RECOVERY_CAPTURE_FIXTURE.capture.id }]
      : [],
  };
}

export function getRecoveryCaptureExpectedStateDigest(expectedState) {
  invariant(
    RECOVERY_CAPTURE_EXPECTED_STATES.includes(expectedState),
    "RECOVERY_EXPECTED_STATE_INVALID",
  );
  return sha256Canonical(expectedCanonicalState(expectedState));
}

function verifySchema(database) {
  const rows = database
    .prepare(
      `SELECT name, type FROM sqlite_master
       WHERE name GLOB 'recovery_*' ORDER BY name`,
    )
    .all();
  invariant(Array.isArray(rows), "RECOVERY_SCHEMA_SHAPE_INVALID");
  const byName = new Map();
  for (const row of rows) {
    invariant(
      hasExactKeys(row, ["name", "type"]) &&
        typeof row.name === "string" &&
        typeof row.type === "string",
      "RECOVERY_SCHEMA_SHAPE_INVALID",
    );
    byName.set(row.name, row.type);
  }
  for (const name of RECOVERY_CAPTURE_SCHEMA_OBJECTS) {
    const expectedType = name.startsWith("recovery_captures_fts_")
      ? "trigger"
      : "table";
    invariant(byName.get(name) === expectedType, "RECOVERY_SCHEMA_INCOMPLETE");
  }
}

function verifyIntegrity(database) {
  invariant(
    database.pragma("journal_mode", { simple: true }) === "wal",
    "RECOVERY_WAL_UNAVAILABLE",
  );
  database.pragma("foreign_keys = ON");
  invariant(
    database.pragma("foreign_keys", { simple: true }) === 1,
    "RECOVERY_FOREIGN_KEYS_DISABLED",
  );
  const cipherIntegrity = database.pragma("cipher_integrity_check");
  invariant(
    Array.isArray(cipherIntegrity) && cipherIntegrity.length === 0,
    "RECOVERY_CIPHER_INTEGRITY_FAILED",
  );
  invariant(
    database.pragma("integrity_check", { simple: true }) === "ok",
    "RECOVERY_DATABASE_INTEGRITY_FAILED",
  );
  const foreignKeyFailures = database.pragma("foreign_key_check");
  invariant(
    Array.isArray(foreignKeyFailures) && foreignKeyFailures.length === 0,
    "RECOVERY_FOREIGN_KEY_INTEGRITY_FAILED",
  );
}

function validateOptions(options) {
  invariant(
    hasExactKeys(options, ["expectedState"]),
    "RECOVERY_VERIFIER_OPTIONS_INVALID",
  );
  invariant(
    RECOVERY_CAPTURE_EXPECTED_STATES.includes(options.expectedState),
    "RECOVERY_EXPECTED_STATE_INVALID",
  );
  return options.expectedState;
}

export function verifyRecoveryCaptureState(database, options) {
  assertDatabase(database);
  const expectedState = validateOptions(options);
  invariant(!database.inTransaction, "RECOVERY_TRANSACTION_ALREADY_OPEN");
  verifySchema(database);
  verifyIntegrity(database);

  const rows = readRecoveryCaptureCounts(database);
  const expectedCount = expectedState === "committed" ? 1 : 0;
  invariant(
    Object.values(rows).every((count) => count === expectedCount),
    "RECOVERY_ROW_COUNTS_INVALID",
  );

  const state = readCanonicalRecoveryCaptureState(database);
  const expected = expectedCanonicalState(expectedState);
  invariant(
    canonicalJson(state) === canonicalJson(expected),
    "RECOVERY_LOGICAL_STATE_INVALID",
  );
  invariant(
    state.workspaces.length === 1 &&
      state.workspaces[0].version ===
        RECOVERY_CAPTURE_FIXTURE.workspace.version,
    "RECOVERY_WORKSPACE_VERSION_CHANGED",
  );

  return deepFreeze({
    scenario: RECOVERY_CAPTURE_SCENARIO,
    expectedState,
    stateDigest: sha256Canonical(state),
    workspaceVersion: state.workspaces[0].version,
    rows,
    integrityVerified: true,
    ftsVerified: true,
  });
}
