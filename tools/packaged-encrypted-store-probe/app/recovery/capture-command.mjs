import crypto from "node:crypto";

export const RECOVERY_CAPTURE_SCENARIO = "capture-submit-text";
export const RECOVERY_CAPTURE_FAILPOINTS = Object.freeze([
  "none",
  "after-begin-immediate",
  "after-capture-row",
]);

const MAX_CAPTURE_TEXT_LENGTH = 262_144;
const BODY_PREFIX = "constellationrecovery walspill sentinel v1 ";
const BODY_FILL = "bounded encrypted capture payload ";
const RECOVERY_CAPTURE_BODY = `${BODY_PREFIX}${BODY_FILL.repeat(
  Math.ceil(MAX_CAPTURE_TEXT_LENGTH / BODY_FILL.length),
)}`.slice(0, MAX_CAPTURE_TEXT_LENGTH);

export const RECOVERY_CAPTURE_TABLES = Object.freeze({
  workspaces: "recovery_workspaces",
  spaces: "recovery_spaces",
  memberships: "recovery_memberships",
  captures: "recovery_captures",
  fts: "recovery_captures_fts",
  events: "recovery_domain_events",
  audits: "recovery_audit_receipts",
  idempotency: "recovery_idempotency_outcomes",
  outbox: "recovery_outbox",
});

export const RECOVERY_CAPTURE_SCHEMA_OBJECTS = Object.freeze([
  "recovery_workspaces",
  "recovery_spaces",
  "recovery_memberships",
  "recovery_captures",
  "recovery_captures_fts",
  "recovery_captures_fts_insert",
  "recovery_captures_fts_delete",
  "recovery_captures_fts_update",
  "recovery_domain_events",
  "recovery_audit_receipts",
  "recovery_idempotency_outcomes",
  "recovery_outbox",
]);

export class RecoveryCaptureFixtureError extends Error {
  constructor(code) {
    super(code);
    this.name = "RecoveryCaptureFixtureError";
    this.code = code;
  }
}

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

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function sha256Canonical(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

const ids = Object.freeze({
  workspace: "00000000-0000-4000-8000-000000000101",
  rootSpace: "00000000-0000-4000-8000-000000000102",
  defaultTaskStatus: "00000000-0000-4000-8000-000000000103",
  principal: "00000000-0000-4000-8000-000000000104",
  membership: "00000000-0000-4000-8000-000000000105",
  credential: "00000000-0000-4000-8000-000000000106",
  grant: "00000000-0000-4000-8000-000000000107",
  command: "00000000-0000-4000-8000-000000000108",
  correlation: "00000000-0000-4000-8000-000000000109",
  capture: "00000000-0000-4000-8000-000000000110",
  event: "00000000-0000-4000-8000-000000000111",
  audit: "00000000-0000-4000-8000-000000000112",
  outbox: "00000000-0000-4000-8000-000000000113",
});

const occurredAt = "2026-07-13T03:00:00.000Z";
const context = {
  principalId: ids.principal,
  principalKind: "human",
  credentialId: ids.credential,
  grantId: ids.grant,
  policyVersion: 1,
  workspaceId: ids.workspace,
  spaceScope: [ids.rootSpace],
  capabilityScope: ["capture.submitText"],
  origin: "desktop",
};
const command = {
  contractVersion: 1,
  commandId: ids.command,
  workspaceId: ids.workspace,
  idempotencyKey: "packaged-recovery-capture-v1",
  expectedVersions: {},
  correlationId: ids.correlation,
  commandName: "capture.submitText",
  payload: {
    spaceId: ids.rootSpace,
    originalText: RECOVERY_CAPTURE_BODY,
    deviceId: "packaged-recovery-probe-device",
    source: "global_quick_capture",
  },
};

export function semanticCommandInput(value = command) {
  return {
    contractVersion: value.contractVersion,
    commandName: value.commandName,
    workspaceId: value.workspaceId,
    payload: value.payload,
    expectedVersions: value.expectedVersions,
    causationId: value.causationId ?? null,
    checkpointId: value.checkpointId ?? null,
  };
}

export function captureIdempotencyScope(
  executionContext = context,
  value = command,
) {
  return [
    value.workspaceId,
    executionContext.principalId,
    value.commandName,
    value.idempotencyKey,
  ].join(":");
}

const workspace = {
  id: ids.workspace,
  name: "Synthetic recovery workspace",
  timezone: "Europe/Warsaw",
  rootSpaceId: ids.rootSpace,
  defaultTaskStatusId: ids.defaultTaskStatus,
  version: 1,
  createdAt: occurredAt,
  updatedAt: occurredAt,
};
const space = {
  id: ids.rootSpace,
  workspaceId: ids.workspace,
  name: "Synthetic recovery root",
  version: 1,
  createdAt: occurredAt,
};
const membership = {
  id: ids.membership,
  workspaceId: ids.workspace,
  principalId: ids.principal,
  role: "owner",
  version: 1,
  createdAt: occurredAt,
};
const capture = {
  id: ids.capture,
  workspaceId: ids.workspace,
  spaceId: ids.rootSpace,
  originalText: command.payload.originalText,
  deviceId: command.payload.deviceId,
  source: command.payload.source,
  capturedAt: occurredAt,
  submittedBy: ids.principal,
  processingState: "pending_processing",
  version: 1,
};
const event = {
  id: ids.event,
  type: "capture.submitted",
  workspaceId: ids.workspace,
  spaceId: ids.rootSpace,
  aggregateId: ids.capture,
  aggregateVersion: 1,
  occurredAt,
  source: command.payload.source,
};
const audit = {
  id: ids.audit,
  workspaceId: ids.workspace,
  spaceId: ids.rootSpace,
  principalId: ids.principal,
  grantId: ids.grant,
  origin: context.origin,
  commandId: ids.command,
  commandName: command.commandName,
  correlationId: ids.correlation,
  affectedRecordIds: [ids.capture],
  recordVersions: { [ids.capture]: 1 },
  changedFields: ["originalText", "deviceId", "source", "processingState"],
  occurredAt,
  outcome: "success",
};
const outcome = {
  contractVersion: 1,
  commandId: ids.command,
  correlationId: ids.correlation,
  kernelTime: occurredAt,
  outcome: "success",
  diagnosticCode: "capture.stored",
  affected: [{ recordId: ids.capture, recordKind: "capture", version: 1 }],
  auditReceiptId: ids.audit,
  projection: {
    kind: "capture.stored",
    captureId: ids.capture,
    processingState: "pending_processing",
    version: 1,
  },
};
const outbox = {
  id: ids.outbox,
  workspaceId: ids.workspace,
  spaceId: ids.rootSpace,
  eventId: ids.event,
  topic: "capture.processing.requested",
  createdAt: occurredAt,
};

export const RECOVERY_CAPTURE_FIXTURE = deepFreeze({
  scenario: RECOVERY_CAPTURE_SCENARIO,
  ids,
  occurredAt,
  context,
  command,
  workspace,
  space,
  membership,
  capture,
  event,
  audit,
  outcome,
  outbox,
  idempotencyScope: captureIdempotencyScope(context, command),
  semanticFingerprint: sha256Canonical(semanticCommandInput(command)),
  originalTextDigest: crypto
    .createHash("sha256")
    .update(command.payload.originalText)
    .digest("hex"),
  outcomeDigest: sha256Canonical(outcome),
  ftsQuery: "constellationrecovery",
});

function assertDatabase(database) {
  invariant(isRecord(database), "RECOVERY_DATABASE_INVALID");
  invariant(typeof database.exec === "function", "RECOVERY_DATABASE_INVALID");
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

function countTable(database, table) {
  const row = database.prepare(`SELECT count(*) AS count FROM ${table}`).get();
  invariant(hasExactKeys(row, ["count"]), "RECOVERY_COUNT_SHAPE_INVALID");
  invariant(
    Number.isSafeInteger(row.count) && row.count >= 0,
    "RECOVERY_COUNT_INVALID",
  );
  return row.count;
}

function countExpectedCaptureFtsMatches(database) {
  const rows = database
    .prepare(
      `SELECT capture.id AS captureId
       FROM recovery_captures_fts AS search
       JOIN recovery_captures AS capture
         ON capture.rowid = search.rowid
        AND capture.id = ?
       WHERE recovery_captures_fts MATCH ?`,
    )
    .all(
      RECOVERY_CAPTURE_FIXTURE.capture.id,
      RECOVERY_CAPTURE_FIXTURE.ftsQuery,
    );
  invariant(Array.isArray(rows), "RECOVERY_FTS_MATCH_SHAPE_INVALID");
  invariant(rows.length <= 1, "RECOVERY_FTS_MATCH_COUNT_INVALID");
  for (const row of rows) {
    invariant(
      hasExactKeys(row, ["captureId"]) &&
        row.captureId === RECOVERY_CAPTURE_FIXTURE.capture.id,
      "RECOVERY_FTS_MATCH_VALUE_INVALID",
    );
  }
  return rows.length;
}

export function readRecoveryCaptureCounts(database) {
  assertDatabase(database);
  return Object.freeze({
    captures: countTable(database, RECOVERY_CAPTURE_TABLES.captures),
    fts: countExpectedCaptureFtsMatches(database),
    events: countTable(database, RECOVERY_CAPTURE_TABLES.events),
    audits: countTable(database, RECOVERY_CAPTURE_TABLES.audits),
    idempotency: countTable(database, RECOVERY_CAPTURE_TABLES.idempotency),
    outbox: countTable(database, RECOVERY_CAPTURE_TABLES.outbox),
  });
}

function totalChanges(database) {
  const row = database.prepare("SELECT total_changes() AS count").get();
  invariant(
    hasExactKeys(row, ["count"]) &&
      Number.isSafeInteger(row.count) &&
      row.count >= 0,
    "RECOVERY_TOTAL_CHANGES_INVALID",
  );
  return row.count;
}

function rollbackQuietly(database) {
  if (!database.inTransaction) return;
  try {
    database.exec("ROLLBACK");
  } catch {
    // The primary fixture failure remains authoritative.
  }
}

function assertEmptyCounts(counts, code) {
  invariant(
    Object.values(counts).every((count) => count === 0),
    code,
  );
}

export function bootstrapRecoveryCaptureSchema(database) {
  assertDatabase(database);
  invariant(!database.inTransaction, "RECOVERY_TRANSACTION_ALREADY_OPEN");

  database.pragma("foreign_keys = ON");
  database.pragma("synchronous = FULL");
  invariant(
    database.pragma("journal_mode = WAL", { simple: true }) === "wal",
    "RECOVERY_WAL_UNAVAILABLE",
  );
  database.pragma("wal_autocheckpoint = 0");
  invariant(
    database.pragma("foreign_keys", { simple: true }) === 1,
    "RECOVERY_FOREIGN_KEYS_DISABLED",
  );
  invariant(
    database.pragma("synchronous", { simple: true }) === 2,
    "RECOVERY_SYNCHRONOUS_INVALID",
  );

  const existing = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE name GLOB 'recovery_*' ORDER BY name",
    )
    .all();
  invariant(
    Array.isArray(existing) && existing.length === 0,
    "RECOVERY_SCHEMA_ALREADY_EXISTS",
  );

  try {
    database.exec("BEGIN IMMEDIATE");
    invariant(database.inTransaction, "RECOVERY_BEGIN_FAILED");
    database.exec(`
      CREATE TABLE recovery_workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timezone TEXT NOT NULL,
        root_space_id TEXT NOT NULL,
        default_task_status_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE recovery_spaces (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES recovery_workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        UNIQUE (id, workspace_id)
      ) STRICT;

      CREATE TABLE recovery_memberships (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES recovery_workspaces(id) ON DELETE CASCADE,
        principal_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')),
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        UNIQUE (workspace_id, principal_id)
      ) STRICT;

      CREATE TABLE recovery_captures (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES recovery_workspaces(id) ON DELETE CASCADE,
        space_id TEXT NOT NULL,
        original_text TEXT NOT NULL CHECK (length(original_text) BETWEEN 1 AND 262144),
        device_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('global_quick_capture', 'in_app_quick_capture')),
        captured_at TEXT NOT NULL,
        submitted_by TEXT NOT NULL,
        processing_state TEXT NOT NULL CHECK (processing_state = 'pending_processing'),
        version INTEGER NOT NULL CHECK (version = 1),
        FOREIGN KEY (space_id, workspace_id)
          REFERENCES recovery_spaces(id, workspace_id)
      ) STRICT;

      CREATE VIRTUAL TABLE recovery_captures_fts USING fts5(
        original_text,
        content='recovery_captures',
        content_rowid='rowid'
      );

      CREATE TRIGGER recovery_captures_fts_insert
      AFTER INSERT ON recovery_captures BEGIN
        INSERT INTO recovery_captures_fts(rowid, original_text)
        VALUES (new.rowid, new.original_text);
      END;

      CREATE TRIGGER recovery_captures_fts_delete
      AFTER DELETE ON recovery_captures BEGIN
        INSERT INTO recovery_captures_fts(recovery_captures_fts, rowid, original_text)
        VALUES ('delete', old.rowid, old.original_text);
      END;

      CREATE TRIGGER recovery_captures_fts_update
      AFTER UPDATE ON recovery_captures BEGIN
        INSERT INTO recovery_captures_fts(recovery_captures_fts, rowid, original_text)
        VALUES ('delete', old.rowid, old.original_text);
        INSERT INTO recovery_captures_fts(rowid, original_text)
        VALUES (new.rowid, new.original_text);
      END;

      CREATE TABLE recovery_domain_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type = 'capture.submitted'),
        workspace_id TEXT NOT NULL REFERENCES recovery_workspaces(id) ON DELETE CASCADE,
        space_id TEXT NOT NULL,
        aggregate_id TEXT NOT NULL REFERENCES recovery_captures(id) ON DELETE CASCADE,
        aggregate_version INTEGER NOT NULL CHECK (aggregate_version = 1),
        occurred_at TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('global_quick_capture', 'in_app_quick_capture')),
        FOREIGN KEY (space_id, workspace_id)
          REFERENCES recovery_spaces(id, workspace_id)
      ) STRICT;

      CREATE TABLE recovery_audit_receipts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES recovery_workspaces(id) ON DELETE CASCADE,
        space_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        grant_id TEXT NOT NULL,
        origin TEXT NOT NULL,
        command_id TEXT NOT NULL,
        command_name TEXT NOT NULL CHECK (command_name = 'capture.submitText'),
        correlation_id TEXT NOT NULL,
        affected_record_ids_json TEXT NOT NULL,
        record_versions_json TEXT NOT NULL,
        changed_fields_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome = 'success'),
        FOREIGN KEY (space_id, workspace_id)
          REFERENCES recovery_spaces(id, workspace_id)
      ) STRICT;

      CREATE TABLE recovery_idempotency_outcomes (
        scope TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
        outcome_json TEXT NOT NULL,
        outcome_digest TEXT NOT NULL CHECK (length(outcome_digest) = 64)
      ) STRICT;

      CREATE TABLE recovery_outbox (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES recovery_workspaces(id) ON DELETE CASCADE,
        space_id TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE REFERENCES recovery_domain_events(id) ON DELETE CASCADE,
        topic TEXT NOT NULL CHECK (topic = 'capture.processing.requested'),
        created_at TEXT NOT NULL,
        FOREIGN KEY (space_id, workspace_id)
          REFERENCES recovery_spaces(id, workspace_id)
      ) STRICT;
    `);

    database
      .prepare(
        `INSERT INTO recovery_workspaces (
          id, name, timezone, root_space_id, default_task_status_id,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        workspace.id,
        workspace.name,
        workspace.timezone,
        workspace.rootSpaceId,
        workspace.defaultTaskStatusId,
        workspace.version,
        workspace.createdAt,
        workspace.updatedAt,
      );
    database
      .prepare(
        `INSERT INTO recovery_spaces (
          id, workspace_id, name, version, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        space.id,
        space.workspaceId,
        space.name,
        space.version,
        space.createdAt,
      );
    database
      .prepare(
        `INSERT INTO recovery_memberships (
          id, workspace_id, principal_id, role, version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        membership.id,
        membership.workspaceId,
        membership.principalId,
        membership.role,
        membership.version,
        membership.createdAt,
      );
    database.exec("COMMIT");
  } catch (error) {
    rollbackQuietly(database);
    if (error instanceof RecoveryCaptureFixtureError) throw error;
    throw new RecoveryCaptureFixtureError("RECOVERY_SCHEMA_BOOTSTRAP_FAILED");
  }

  const rows = readRecoveryCaptureCounts(database);
  assertEmptyCounts(rows, "RECOVERY_BOOTSTRAP_NOT_EMPTY");
  return Object.freeze({
    scenario: RECOVERY_CAPTURE_SCENARIO,
    workspaceVersion: workspace.version,
    rows,
  });
}

function invokeFailpoint(database, failpoint, reachFailpoint) {
  const visibleRows = readRecoveryCaptureCounts(database);
  const expected =
    failpoint === "after-begin-immediate"
      ? { captures: 0, fts: 0, events: 0, audits: 0, idempotency: 0, outbox: 0 }
      : {
          captures: 1,
          fts: 1,
          events: 0,
          audits: 0,
          idempotency: 0,
          outbox: 0,
        };
  invariant(
    canonicalJson(visibleRows) === canonicalJson(expected),
    "RECOVERY_FAILPOINT_ROWS_INVALID",
  );
  reachFailpoint(
    Object.freeze({
      failpoint,
      visibleRows,
      originalTextDigest: RECOVERY_CAPTURE_FIXTURE.originalTextDigest,
    }),
  );
  throw new RecoveryCaptureFixtureError("RECOVERY_FAILPOINT_RETURNED");
}

function validateExecutionOptions(options) {
  invariant(isRecord(options), "RECOVERY_EXECUTION_OPTIONS_INVALID");
  invariant(
    Object.keys(options).every((key) =>
      ["failpoint", "reachFailpoint"].includes(key),
    ),
    "RECOVERY_EXECUTION_OPTIONS_INVALID",
  );
  const failpoint = options.failpoint ?? "none";
  invariant(
    RECOVERY_CAPTURE_FAILPOINTS.includes(failpoint),
    "RECOVERY_FAILPOINT_INVALID",
  );
  if (failpoint === "none") {
    invariant(
      options.reachFailpoint === undefined,
      "RECOVERY_FAILPOINT_HANDLER_UNEXPECTED",
    );
  } else {
    invariant(
      typeof options.reachFailpoint === "function",
      "RECOVERY_FAILPOINT_HANDLER_MISSING",
    );
  }
  return { failpoint, reachFailpoint: options.reachFailpoint };
}

function parseStoredOutcome(row) {
  invariant(
    hasExactKeys(row, ["fingerprint", "outcome_json", "outcome_digest"]),
    "RECOVERY_IDEMPOTENCY_SHAPE_INVALID",
  );
  invariant(
    row.fingerprint === RECOVERY_CAPTURE_FIXTURE.semanticFingerprint,
    "RECOVERY_IDEMPOTENCY_CONFLICT",
  );
  invariant(
    row.outcome_digest === RECOVERY_CAPTURE_FIXTURE.outcomeDigest,
    "RECOVERY_OUTCOME_DIGEST_INVALID",
  );
  let storedOutcome;
  try {
    storedOutcome = JSON.parse(row.outcome_json);
  } catch {
    throw new RecoveryCaptureFixtureError("RECOVERY_OUTCOME_INVALID");
  }
  invariant(
    canonicalJson(storedOutcome) === canonicalJson(outcome) &&
      canonicalJson(storedOutcome) === row.outcome_json &&
      sha256Canonical(storedOutcome) === row.outcome_digest,
    "RECOVERY_OUTCOME_INVALID",
  );
  return storedOutcome;
}

export function executeRecoveryCapture(database, options = {}) {
  assertDatabase(database);
  const { failpoint, reachFailpoint } = validateExecutionOptions(options);
  invariant(!database.inTransaction, "RECOVERY_TRANSACTION_ALREADY_OPEN");
  const changesBefore = totalChanges(database);

  try {
    database.exec("BEGIN IMMEDIATE");
    invariant(database.inTransaction, "RECOVERY_BEGIN_FAILED");
    if (failpoint === "after-begin-immediate") {
      invokeFailpoint(database, failpoint, reachFailpoint);
    }

    const existing = database
      .prepare(
        `SELECT fingerprint, outcome_json, outcome_digest
         FROM recovery_idempotency_outcomes WHERE scope = ?`,
      )
      .get(RECOVERY_CAPTURE_FIXTURE.idempotencyScope);
    if (existing !== undefined) {
      const storedOutcome = parseStoredOutcome(existing);
      database.exec("ROLLBACK");
      const connectionChanges = totalChanges(database) - changesBefore;
      invariant(connectionChanges === 0, "RECOVERY_REPLAY_MUTATED");
      return deepFreeze({
        kind: "replayed",
        outcome: storedOutcome,
        outcomeDigest: RECOVERY_CAPTURE_FIXTURE.outcomeDigest,
        semanticFingerprint: RECOVERY_CAPTURE_FIXTURE.semanticFingerprint,
        idempotencyScope: RECOVERY_CAPTURE_FIXTURE.idempotencyScope,
        connectionChanges,
      });
    }

    database
      .prepare(
        `INSERT INTO recovery_captures (
          id, workspace_id, space_id, original_text, device_id, source,
          captured_at, submitted_by, processing_state, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        capture.id,
        capture.workspaceId,
        capture.spaceId,
        capture.originalText,
        capture.deviceId,
        capture.source,
        capture.capturedAt,
        capture.submittedBy,
        capture.processingState,
        capture.version,
      );
    if (failpoint === "after-capture-row") {
      invokeFailpoint(database, failpoint, reachFailpoint);
    }

    database
      .prepare(
        `INSERT INTO recovery_domain_events (
          id, type, workspace_id, space_id, aggregate_id,
          aggregate_version, occurred_at, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.type,
        event.workspaceId,
        event.spaceId,
        event.aggregateId,
        event.aggregateVersion,
        event.occurredAt,
        event.source,
      );
    database
      .prepare(
        `INSERT INTO recovery_audit_receipts (
          id, workspace_id, space_id, principal_id, grant_id, origin,
          command_id, command_name, correlation_id,
          affected_record_ids_json, record_versions_json, changed_fields_json,
          occurred_at, outcome
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        audit.id,
        audit.workspaceId,
        audit.spaceId,
        audit.principalId,
        audit.grantId,
        audit.origin,
        audit.commandId,
        audit.commandName,
        audit.correlationId,
        canonicalJson(audit.affectedRecordIds),
        canonicalJson(audit.recordVersions),
        canonicalJson(audit.changedFields),
        audit.occurredAt,
        audit.outcome,
      );
    database
      .prepare(
        `INSERT INTO recovery_idempotency_outcomes (
          scope, fingerprint, outcome_json, outcome_digest
        ) VALUES (?, ?, ?, ?)`,
      )
      .run(
        RECOVERY_CAPTURE_FIXTURE.idempotencyScope,
        RECOVERY_CAPTURE_FIXTURE.semanticFingerprint,
        canonicalJson(outcome),
        RECOVERY_CAPTURE_FIXTURE.outcomeDigest,
      );
    database
      .prepare(
        `INSERT INTO recovery_outbox (
          id, workspace_id, space_id, event_id, topic, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        outbox.id,
        outbox.workspaceId,
        outbox.spaceId,
        outbox.eventId,
        outbox.topic,
        outbox.createdAt,
      );
    database.exec("COMMIT");

    const connectionChanges = totalChanges(database) - changesBefore;
    invariant(connectionChanges > 0, "RECOVERY_APPLY_DID_NOT_MUTATE");
    return deepFreeze({
      kind: "applied",
      outcome,
      outcomeDigest: RECOVERY_CAPTURE_FIXTURE.outcomeDigest,
      semanticFingerprint: RECOVERY_CAPTURE_FIXTURE.semanticFingerprint,
      idempotencyScope: RECOVERY_CAPTURE_FIXTURE.idempotencyScope,
      connectionChanges,
    });
  } catch (error) {
    rollbackQuietly(database);
    if (error instanceof RecoveryCaptureFixtureError) throw error;
    throw new RecoveryCaptureFixtureError("RECOVERY_CAPTURE_EXECUTION_FAILED");
  }
}

export function getRecoveryCapturePlaintextCanaries() {
  return [
    Buffer.from(BODY_PREFIX, "utf8"),
    Buffer.from(BODY_FILL, "utf8"),
    Buffer.from(RECOVERY_CAPTURE_FIXTURE.originalTextDigest, "utf8"),
  ];
}
