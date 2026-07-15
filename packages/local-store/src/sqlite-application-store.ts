import {
  RetryableUnitOfWorkError,
  type ApplicationReadView,
  type ApplicationStore,
  type ApplicationTransaction,
  type ApplicationWave2ReadView,
  type ApplicationWave2Transaction,
  type CapturePageRequest,
  type IdempotencyRecord,
  type ReferenceStateSnapshot,
  type StoreFreshness,
  type TaskPageRequest,
  type MeetingLoopRepository,
  type MeetingLoopState,
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  CommandOutcomeSchema,
  DocumentRevisionIdSchema,
  CorrelationIdSchema,
  DeviceIdSchema,
  type DocumentId,
  type DocumentRevisionId,
  type CorrelationId,
  type DeviceId,
  PrincipalIdSchema,
  type CommandEnvelope,
  type AuditReceiptId,
  type CaptureId,
  type PrincipalId,
  type ProjectId,
  type RelationId,
  type SpaceGrantId,
  type SpaceId,
  type TaskId,
  type TaskAssignmentId,
  type CommentId,
  type AttentionSignalId,
  type TaskStatusId,
  type WorkspaceId,
  type GrantId,
  type AgentRunId,
  type CheckpointId,
  type KnowledgeSourceId,
  type NamedDocumentVersionId,
  type StrategicRecordId,
} from "@constellation/contracts";
import type {
  AuditReceipt,
  Capture,
  DomainEvent,
  OutboxEntry,
  Project,
  Space,
  SpaceGrant,
  Task,
  TaskAssignment,
  TaskProjectRelation,
  TaskStatusDefinition,
  Workspace,
  WorkspaceMembership,
  UndoDescriptor,
  RecordComment,
  AttentionSignal,
  NativeDocument,
  AgentAccessGrant,
  AgentRun,
  AgentHandoff,
  AgentCheckpoint,
  KnowledgeSource,
  NamedDocumentVersion,
  StrategicRecord,
} from "@constellation/domain";

import type {
  SqliteDatabase,
  SqliteRunResult,
  SqliteValue,
} from "./sqlite-driver.js";

const SCHEMA_VERSION = 13;
const FRESHNESS: StoreFreshness = {
  mode: "local_authoritative",
  checkpoint: null,
  missingCapabilities: [],
};

const COORDINATED_PROJECTION_TABLES = [
  "meeting_loop_state",
  "agent_handoffs",
  "agent_checkpoints",
  "agent_runs",
  "agent_grants",
  "outbox_entries",
  "idempotency_records",
  "audit_receipts",
  "events",
  "attention_signals",
  "comments",
  "document_pending_updates",
  "document_revisions",
  "document_collaboration_state",
  "named_document_versions",
  "strategic_records",
  "documents",
  "knowledge_sources",
  "undo_descriptors",
  "task_project_relations",
  "task_assignments",
  "projects",
  "tasks",
  "captures",
  "task_statuses",
  "space_grants",
  "memberships",
  "spaces",
  "workspaces",
] as const;

export class LocalStoreCorruptionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LocalStoreCorruptionError";
  }
}

export interface LocalWorkspaceRecoverySummary {
  readonly principalId: PrincipalId;
  readonly workspace: Workspace;
  readonly counts: {
    readonly captures: number;
    readonly tasks: number;
    readonly projects: number;
    readonly documents: number;
    readonly relations: number;
    readonly auditReceipts: number;
  };
}

const schemaV1 = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS spaces_workspace ON spaces(workspace_id, id);
  CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    principal_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL,
    UNIQUE(workspace_id, principal_id)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS task_statuses (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    position INTEGER NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS task_statuses_workspace ON task_statuses(workspace_id, position, id);
  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    captured_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS captures_page ON captures(workspace_id, space_id, captured_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    created_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS tasks_page ON tasks(workspace_id, space_id, created_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS audit_receipts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS idempotency_records (
    scope TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS outbox_entries (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    event_id TEXT NOT NULL REFERENCES events(id),
    payload_json TEXT NOT NULL
  ) STRICT;
`;

const schemaV2 = `
  ALTER TABLE tasks ADD COLUMN record_state TEXT;
  ALTER TABLE tasks ADD COLUMN completion_state TEXT;
  ALTER TABLE tasks ADD COLUMN updated_at TEXT;
  UPDATE tasks
    SET record_state = json_extract(payload_json, '$.recordState'),
        completion_state = json_extract(payload_json, '$.completionState'),
        updated_at = json_extract(payload_json, '$.updatedAt')
    WHERE record_state IS NULL OR completion_state IS NULL OR updated_at IS NULL;
  CREATE INDEX tasks_operational
    ON tasks(workspace_id, space_id, record_state, completion_state, updated_at DESC, id DESC);

  ALTER TABLE events ADD COLUMN occurred_at TEXT;
  UPDATE events
    SET occurred_at = json_extract(payload_json, '$.occurredAt')
    WHERE occurred_at IS NULL;
  CREATE INDEX events_activity
    ON events(workspace_id, space_id, occurred_at DESC, id DESC);

  ALTER TABLE audit_receipts ADD COLUMN command_id TEXT;
  UPDATE audit_receipts
    SET command_id = json_extract(payload_json, '$.commandId')
    WHERE command_id IS NULL;
  CREATE UNIQUE INDEX audit_receipts_command
    ON audit_receipts(command_id);

  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX projects_page
    ON projects(workspace_id, space_id, updated_at DESC, id DESC);

  CREATE TABLE task_project_relations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    task_id TEXT NOT NULL REFERENCES tasks(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX task_project_relations_scope
    ON task_project_relations(workspace_id, space_id, state, id);
  CREATE INDEX task_project_relations_task
    ON task_project_relations(task_id, project_id, state);
  CREATE INDEX task_project_relations_project
    ON task_project_relations(project_id, task_id, state);
  CREATE UNIQUE INDEX task_project_relations_one_active
    ON task_project_relations(task_id, project_id)
    WHERE state = 'active';

  CREATE TABLE undo_descriptors (
    target_command_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX undo_descriptors_scope
    ON undo_descriptors(workspace_id, space_id, target_command_id);

  CREATE VIRTUAL TABLE work_search USING fts5(
    record_id UNINDEXED,
    workspace_id UNINDEXED,
    space_id UNINDEXED,
    record_kind UNINDEXED,
    title,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER work_search_capture_insert AFTER INSERT ON captures BEGIN
    INSERT INTO work_search(record_id, workspace_id, space_id, record_kind, title, body)
    VALUES (new.id, new.workspace_id, new.space_id, 'capture', '', json_extract(new.payload_json, '$.originalText'));
  END;
  CREATE TRIGGER work_search_capture_update AFTER UPDATE OF payload_json ON captures BEGIN
    DELETE FROM work_search WHERE record_kind = 'capture' AND record_id = old.id;
    INSERT INTO work_search(record_id, workspace_id, space_id, record_kind, title, body)
    VALUES (new.id, new.workspace_id, new.space_id, 'capture', '', json_extract(new.payload_json, '$.originalText'));
  END;
  CREATE TRIGGER work_search_capture_delete AFTER DELETE ON captures BEGIN
    DELETE FROM work_search WHERE record_kind = 'capture' AND record_id = old.id;
  END;
  CREATE TRIGGER work_search_task_insert AFTER INSERT ON tasks BEGIN
    INSERT INTO work_search(record_id, workspace_id, space_id, record_kind, title, body)
    SELECT new.id, new.workspace_id, new.space_id, 'task', json_extract(new.payload_json, '$.title'), ''
    WHERE new.record_state = 'active';
  END;
  CREATE TRIGGER work_search_task_update AFTER UPDATE OF payload_json ON tasks BEGIN
    DELETE FROM work_search WHERE record_kind = 'task' AND record_id = old.id;
    INSERT INTO work_search(record_id, workspace_id, space_id, record_kind, title, body)
    SELECT new.id, new.workspace_id, new.space_id, 'task', json_extract(new.payload_json, '$.title'), ''
    WHERE new.record_state = 'active';
  END;
  CREATE TRIGGER work_search_task_delete AFTER DELETE ON tasks BEGIN
    DELETE FROM work_search WHERE record_kind = 'task' AND record_id = old.id;
  END;
  CREATE TRIGGER work_search_project_insert AFTER INSERT ON projects BEGIN
    INSERT INTO work_search(record_id, workspace_id, space_id, record_kind, title, body)
    VALUES (new.id, new.workspace_id, new.space_id, 'project', json_extract(new.payload_json, '$.title'), json_extract(new.payload_json, '$.intendedOutcome'));
  END;
  CREATE TRIGGER work_search_project_update AFTER UPDATE OF payload_json ON projects BEGIN
    DELETE FROM work_search WHERE record_kind = 'project' AND record_id = old.id;
    INSERT INTO work_search(record_id, workspace_id, space_id, record_kind, title, body)
    VALUES (new.id, new.workspace_id, new.space_id, 'project', json_extract(new.payload_json, '$.title'), json_extract(new.payload_json, '$.intendedOutcome'));
  END;
  CREATE TRIGGER work_search_project_delete AFTER DELETE ON projects BEGIN
    DELETE FROM work_search WHERE record_kind = 'project' AND record_id = old.id;
  END;

  INSERT INTO work_search(record_id, workspace_id, space_id, record_kind, title, body)
    SELECT id, workspace_id, space_id, 'capture', '', json_extract(payload_json, '$.originalText')
    FROM captures;
  INSERT INTO work_search(record_id, workspace_id, space_id, record_kind, title, body)
    SELECT id, workspace_id, space_id, 'task', json_extract(payload_json, '$.title'), ''
    FROM tasks
    WHERE record_state = 'active';
`;

const schemaV3 = `
  CREATE TABLE coordination_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    workspace_id TEXT NOT NULL,
    provider_instance_id TEXT NOT NULL,
    hub_origin TEXT NOT NULL,
    checkpoint TEXT NOT NULL,
    snapshot_digest TEXT NOT NULL,
    sync_state TEXT NOT NULL CHECK (sync_state IN ('current', 'queued', 'syncing', 'offline', 'conflict', 'unknown_reconcile', 'revoked')),
    last_synced_at TEXT,
    last_error_code TEXT
  ) STRICT;
  CREATE TABLE sync_delivery (
    command_id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('accepted', 'conflict', 'rejected', 'unknown_reconcile', 'seeded')),
    outcome_json TEXT,
    updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE command_journal (
    command_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    payload_json TEXT NOT NULL
  ) STRICT;
`;

const schemaV4 = `
  CREATE TABLE space_grants (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    principal_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL,
    UNIQUE(workspace_id, space_id, principal_id)
  ) STRICT;
  CREATE INDEX space_grants_principal
    ON space_grants(workspace_id, principal_id, status, space_id);
`;

const schemaV5 = `
  CREATE TABLE task_assignments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    task_id TEXT NOT NULL REFERENCES tasks(id),
    assignee_principal_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX task_assignments_scope
    ON task_assignments(workspace_id, space_id, assignee_principal_id, state, id);
  CREATE UNIQUE INDEX task_assignments_one_active
    ON task_assignments(task_id)
    WHERE state = 'active';
`;

const schemaV6 = `
  CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    root_comment_id TEXT NOT NULL,
    author_principal_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX comments_scope
    ON comments(workspace_id, space_id, root_comment_id, created_at, id);
  CREATE TABLE attention_signals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    target_principal_id TEXT NOT NULL,
    deduplication_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('unread', 'read', 'dismissed')),
    version INTEGER NOT NULL CHECK (version > 0),
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE(workspace_id, target_principal_id, deduplication_key)
  ) STRICT;
  CREATE INDEX attention_signals_inbox
    ON attention_signals(workspace_id, target_principal_id, state, updated_at DESC, id);
`;

const schemaV7 = `
  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX documents_page
    ON documents(workspace_id, space_id, updated_at DESC, id DESC);
  CREATE TABLE document_collaboration_state (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    engine TEXT NOT NULL CHECK (engine = 'yjs-13'),
    state_blob BLOB NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE document_pending_updates (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    update_blob BLOB NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX document_pending_updates_queue
    ON document_pending_updates(document_id, created_at, id);
  CREATE TABLE document_revisions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    name TEXT NOT NULL,
    engine TEXT NOT NULL CHECK (engine = 'yjs-13'),
    state_blob BLOB NOT NULL,
    state_vector_blob BLOB NOT NULL,
    created_by TEXT NOT NULL,
    created_by_device_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    restored_from_revision_id TEXT
  ) STRICT;
  CREATE INDEX document_revisions_history
    ON document_revisions(document_id, created_at DESC, id DESC);
`;

const schemaV8 = `
  CREATE TABLE agent_grants (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    agent_principal_id TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    credential_digest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
    version INTEGER NOT NULL CHECK (version > 0),
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE(workspace_id, agent_principal_id)
  ) STRICT;
  CREATE INDEX agent_grants_scope
    ON agent_grants(workspace_id, status, updated_at DESC, id);
  CREATE TABLE agent_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    agent_principal_id TEXT NOT NULL,
    grant_id TEXT NOT NULL REFERENCES agent_grants(id),
    host_run_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE(grant_id, host_run_id)
  ) STRICT;
  CREATE INDEX agent_runs_scope
    ON agent_runs(workspace_id, agent_principal_id, updated_at DESC, id);
  CREATE TABLE agent_checkpoints (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    agent_principal_id TEXT NOT NULL,
    grant_id TEXT NOT NULL REFERENCES agent_grants(id),
    run_id TEXT NOT NULL REFERENCES agent_runs(id),
    status TEXT NOT NULL CHECK (status IN ('open', 'reverted')),
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX agent_checkpoints_run ON agent_checkpoints(run_id, updated_at, id);
  CREATE TABLE agent_handoffs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    agent_principal_id TEXT NOT NULL,
    grant_id TEXT NOT NULL REFERENCES agent_grants(id),
    run_id TEXT NOT NULL REFERENCES agent_runs(id),
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX agent_handoffs_run ON agent_handoffs(run_id, created_at, id);
`;

const schemaV9 = `
  CREATE TABLE meeting_loop_state (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
    revision INTEGER NOT NULL CHECK (revision >= 0),
    payload_json TEXT NOT NULL
  ) STRICT;
`;

const schemaV10 = `
  CREATE TABLE knowledge_sources (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX knowledge_sources_page
    ON knowledge_sources(workspace_id, space_id, updated_at DESC, id DESC);
  CREATE TABLE named_document_versions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'voided')),
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX named_document_versions_document
    ON named_document_versions(workspace_id, space_id, document_id, created_at DESC, id DESC);
`;

const schemaV11 = `
  CREATE TABLE strategic_records (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    space_id TEXT NOT NULL REFERENCES spaces(id),
    kind TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX strategic_records_page
    ON strategic_records(workspace_id, space_id, updated_at DESC, id DESC);
`;

const schemaV12 = `
  UPDATE captures
  SET payload_json = json_set(
    payload_json,
    '$.original', json_object(
      'kind', 'text',
      'text', json_extract(payload_json, '$.originalText')
    ),
    '$.originalFingerprint', 'legacy:' || id
  )
  WHERE json_type(payload_json, '$.original') IS NULL;
`;

const schemaV13 = `
  UPDATE tasks
  SET payload_json = json_set(payload_json, '$.operationalState', 'actionable')
  WHERE json_type(payload_json, '$.operationalState') IS NULL;
`;

export interface LocalCoordinationState {
  readonly workspaceId: WorkspaceId;
  readonly providerInstanceId: string;
  readonly hubOrigin: string;
  readonly checkpoint: string;
  readonly snapshotDigest: string;
  readonly syncState:
    | "current"
    | "queued"
    | "syncing"
    | "offline"
    | "conflict"
    | "unknown_reconcile"
    | "revoked";
  readonly lastSyncedAt?: string;
  readonly lastErrorCode?: string;
}

export interface PendingSyncCommand {
  readonly command: CommandEnvelope;
  readonly outboxEntryId: string;
}

export interface LocalDocumentCollaborationState {
  readonly documentId: DocumentId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly engine: "yjs-13";
  readonly state: Uint8Array;
  readonly updatedAt: string;
}

export interface LocalPendingDocumentUpdate {
  readonly id: string;
  readonly documentId: DocumentId;
  readonly update: Uint8Array;
  readonly createdAt: string;
}

export interface LocalDocumentRevision {
  readonly id: DocumentRevisionId;
  readonly documentId: DocumentId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly name: string;
  readonly engine: "yjs-13";
  readonly state: Uint8Array;
  readonly stateVector: Uint8Array;
  readonly createdBy: PrincipalId;
  readonly createdByDeviceId: DeviceId;
  readonly correlationId: CorrelationId;
  readonly createdAt: string;
  readonly restoredFromRevisionId?: DocumentRevisionId;
}

const objectValue = (
  value: unknown,
  context: string,
): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LocalStoreCorruptionError(`${context} is not an object.`);
  }
  return value as Record<string, unknown>;
};

const stringValue = (row: unknown, key: string, context: string): string => {
  const value = objectValue(row, context)[key];
  if (typeof value !== "string") {
    throw new LocalStoreCorruptionError(`${context}.${key} is not text.`);
  }
  return value;
};

const nullableStringValue = (
  row: unknown,
  key: string,
  context: string,
): string | undefined => {
  const value = objectValue(row, context)[key];
  if (value === null) return undefined;
  if (typeof value !== "string") {
    throw new LocalStoreCorruptionError(`${context}.${key} is not a string.`);
  }
  return value;
};

const numberValue = (row: unknown, key: string, context: string): number => {
  const value = objectValue(row, context)[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new LocalStoreCorruptionError(`${context}.${key} is not an integer.`);
  }
  return value;
};

const bytesValue = (row: unknown, key: string, context: string): Uint8Array => {
  const value = objectValue(row, context)[key];
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new LocalStoreCorruptionError(`${context}.${key} is not binary.`);
  }
  return value.slice();
};

const parsePayload = <RecordType extends object>(
  row: unknown,
  key: "id" | "scope" | "targetCommandId",
  expected: string,
  context: string,
  scopedIdentities: Readonly<Record<string, string>> = {},
): RecordType => {
  const raw = stringValue(row, "payload_json", context);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new LocalStoreCorruptionError(`${context} contains invalid JSON.`);
  }
  const object = objectValue(parsed, `${context}.payload`);
  if (object[key] !== expected) {
    throw new LocalStoreCorruptionError(
      `${context} identity does not match its payload.`,
    );
  }
  for (const [payloadKey, expectedValue] of Object.entries(scopedIdentities)) {
    if (object[payloadKey] !== expectedValue) {
      throw new LocalStoreCorruptionError(
        `${context}.${payloadKey} does not match its storage scope.`,
      );
    }
  }
  return object as RecordType;
};

const payload = (value: object): string => JSON.stringify(value);
const changed = (result: SqliteRunResult): boolean =>
  Number(result.changes) === 1;

const isBusy = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === "SQLITE_BUSY" ||
    (typeof record.code === "string" &&
      record.code.startsWith("SQLITE_BUSY_")) ||
    record.errcode === 5
  );
};

export const initializeLocalStoreSchema = (database: SqliteDatabase): void => {
  database.exec("PRAGMA foreign_keys = ON;");
  const versionRow = database.prepare("PRAGMA user_version").get();
  const currentVersion = numberValue(versionRow, "user_version", "schema");
  if (currentVersion > SCHEMA_VERSION) {
    throw new LocalStoreCorruptionError(
      `Unsupported local-store schema version ${currentVersion}.`,
    );
  }
  if (currentVersion === SCHEMA_VERSION) return;

  database.exec("BEGIN EXCLUSIVE;");
  try {
    if (currentVersion === 0) database.exec(schemaV1);
    if (currentVersion < 2) database.exec(schemaV2);
    if (currentVersion < 3) database.exec(schemaV3);
    if (currentVersion < 4) database.exec(schemaV4);
    if (currentVersion < 5) database.exec(schemaV5);
    if (currentVersion < 6) database.exec(schemaV6);
    if (currentVersion < 7) database.exec(schemaV7);
    if (currentVersion < 8) database.exec(schemaV8);
    if (currentVersion < 9) database.exec(schemaV9);
    if (currentVersion < 10) database.exec(schemaV10);
    if (currentVersion < 11) database.exec(schemaV11);
    if (currentVersion < 12) database.exec(schemaV12);
    if (currentVersion < 13) database.exec(schemaV13);
    database.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    database.exec("COMMIT;");
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // Preserve the migration error; the next open will verify schema again.
    }
    throw error;
  }
};

class SqliteReadView implements ApplicationWave2ReadView {
  public constructor(protected readonly database: SqliteDatabase) {}

  public getFreshness(): StoreFreshness {
    const row = this.database
      .prepare(
        "SELECT checkpoint, sync_state FROM coordination_state WHERE singleton = 1",
      )
      .get();
    if (row === undefined) return FRESHNESS;
    const syncState = stringValue(row, "sync_state", "coordination state");
    return {
      mode: "local_projection",
      checkpoint: stringValue(row, "checkpoint", "coordination state"),
      missingCapabilities:
        syncState === "current" ||
        syncState === "queued" ||
        syncState === "syncing"
          ? []
          : [`hub.${syncState}`],
    };
  }

  public getWorkspace(id: WorkspaceId): Workspace | undefined {
    const row = this.database
      .prepare("SELECT payload_json FROM workspaces WHERE id = ?")
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<Workspace>(row, "id", id, "workspace");
  }

  public getSpace(id: SpaceId): Space | undefined {
    const row = this.database
      .prepare("SELECT workspace_id, payload_json FROM spaces WHERE id = ?")
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<Space>(row, "id", id, "space", {
          workspaceId: stringValue(row, "workspace_id", "space"),
        });
  }

  public listSpaces(workspaceId: WorkspaceId): readonly Space[] {
    return this.database
      .prepare(
        "SELECT id, payload_json FROM spaces WHERE workspace_id = ? ORDER BY id",
      )
      .all(workspaceId)
      .map((row) => {
        const id = stringValue(row, "id", "space");
        return parsePayload<Space>(row, "id", id, "space", { workspaceId });
      });
  }

  public getTaskStatus(id: TaskStatusId): TaskStatusDefinition | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, payload_json FROM task_statuses WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<TaskStatusDefinition>(row, "id", id, "task status", {
          workspaceId: stringValue(row, "workspace_id", "task status"),
        });
  }

  public listTaskStatuses(
    workspaceId: WorkspaceId,
  ): readonly TaskStatusDefinition[] {
    return this.database
      .prepare(
        "SELECT id, payload_json FROM task_statuses WHERE workspace_id = ? ORDER BY position, id",
      )
      .all(workspaceId)
      .map((row) => {
        const id = stringValue(row, "id", "task status");
        return parsePayload<TaskStatusDefinition>(
          row,
          "id",
          id,
          "task status",
          { workspaceId },
        );
      });
  }

  public getMembership(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
  ): WorkspaceMembership | undefined {
    const row = this.database
      .prepare(
        "SELECT id, payload_json FROM memberships WHERE workspace_id = ? AND principal_id = ?",
      )
      .get(workspaceId, principalId);
    if (row === undefined) return undefined;
    const id = stringValue(row, "id", "membership");
    return parsePayload<WorkspaceMembership>(row, "id", id, "membership", {
      workspaceId,
      principalId,
    });
  }

  public listMemberships(
    workspaceId: WorkspaceId,
  ): readonly WorkspaceMembership[] {
    return this.database
      .prepare(
        "SELECT id, principal_id, payload_json FROM memberships WHERE workspace_id = ? ORDER BY id",
      )
      .all(workspaceId)
      .map((row) => {
        const id = stringValue(row, "id", "membership");
        return parsePayload<WorkspaceMembership>(row, "id", id, "membership", {
          workspaceId,
          principalId: stringValue(row, "principal_id", "membership"),
        });
      });
  }

  public getSpaceGrant(id: SpaceGrantId): SpaceGrant | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, principal_id, payload_json FROM space_grants WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<SpaceGrant>(row, "id", id, "Space grant", {
          workspaceId: stringValue(row, "workspace_id", "Space grant"),
          spaceId: stringValue(row, "space_id", "Space grant"),
          principalId: stringValue(row, "principal_id", "Space grant"),
        });
  }

  public getSpaceGrantForPrincipal(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    principalId: PrincipalId,
  ): SpaceGrant | undefined {
    const row = this.database
      .prepare(
        "SELECT id, payload_json FROM space_grants WHERE workspace_id = ? AND space_id = ? AND principal_id = ?",
      )
      .get(workspaceId, spaceId, principalId);
    if (row === undefined) return undefined;
    const id = stringValue(row, "id", "Space grant");
    return parsePayload<SpaceGrant>(row, "id", id, "Space grant", {
      workspaceId,
      spaceId,
      principalId,
    });
  }

  public listSpaceGrants(
    workspaceId: WorkspaceId,
    principalId?: PrincipalId,
  ): readonly SpaceGrant[] {
    const rows =
      principalId === undefined
        ? this.database
            .prepare(
              "SELECT id, space_id, principal_id, payload_json FROM space_grants WHERE workspace_id = ? ORDER BY id",
            )
            .all(workspaceId)
        : this.database
            .prepare(
              "SELECT id, space_id, principal_id, payload_json FROM space_grants WHERE workspace_id = ? AND principal_id = ? ORDER BY id",
            )
            .all(workspaceId, principalId);
    return rows.map((row) => {
      const id = stringValue(row, "id", "Space grant");
      return parsePayload<SpaceGrant>(row, "id", id, "Space grant", {
        workspaceId,
        spaceId: stringValue(row, "space_id", "Space grant"),
        principalId: stringValue(row, "principal_id", "Space grant"),
      });
    });
  }

  public getTaskAssignment(id: TaskAssignmentId): TaskAssignment | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, task_id, assignee_principal_id, payload_json FROM task_assignments WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<TaskAssignment>(row, "id", id, "Task assignment", {
          workspaceId: stringValue(row, "workspace_id", "Task assignment"),
          spaceId: stringValue(row, "space_id", "Task assignment"),
          taskId: stringValue(row, "task_id", "Task assignment"),
          assigneePrincipalId: stringValue(
            row,
            "assignee_principal_id",
            "Task assignment",
          ),
        });
  }

  public getActiveTaskAssignment(taskId: TaskId): TaskAssignment | undefined {
    const row = this.database
      .prepare(
        "SELECT id, workspace_id, space_id, assignee_principal_id, payload_json FROM task_assignments WHERE task_id = ? AND state = 'active'",
      )
      .get(taskId);
    if (row === undefined) return undefined;
    const id = stringValue(row, "id", "Task assignment");
    return parsePayload<TaskAssignment>(row, "id", id, "Task assignment", {
      workspaceId: stringValue(row, "workspace_id", "Task assignment"),
      spaceId: stringValue(row, "space_id", "Task assignment"),
      taskId,
      assigneePrincipalId: stringValue(
        row,
        "assignee_principal_id",
        "Task assignment",
      ),
    });
  }

  public listTaskAssignments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly TaskAssignment[] {
    return this.database
      .prepare(
        "SELECT id, task_id, assignee_principal_id, payload_json FROM task_assignments WHERE workspace_id = ? AND space_id = ? ORDER BY id",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "Task assignment");
        return parsePayload<TaskAssignment>(row, "id", id, "Task assignment", {
          workspaceId,
          spaceId,
          taskId: stringValue(row, "task_id", "Task assignment"),
          assigneePrincipalId: stringValue(
            row,
            "assignee_principal_id",
            "Task assignment",
          ),
        });
      });
  }

  public getComment(id: CommentId): RecordComment | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM comments WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<RecordComment>(row, "id", id, "comment", {
          workspaceId: stringValue(row, "workspace_id", "comment"),
          spaceId: stringValue(row, "space_id", "comment"),
        });
  }

  public listComments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly RecordComment[] {
    return this.database
      .prepare(
        "SELECT id, payload_json FROM comments WHERE workspace_id = ? AND space_id = ? ORDER BY created_at, id",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "comment");
        return parsePayload<RecordComment>(row, "id", id, "comment", {
          workspaceId,
          spaceId,
        });
      });
  }

  public getAttentionSignal(
    id: AttentionSignalId,
  ): AttentionSignal | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, target_principal_id, payload_json FROM attention_signals WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<AttentionSignal>(row, "id", id, "attention signal", {
          workspaceId: stringValue(row, "workspace_id", "attention signal"),
          spaceId: stringValue(row, "space_id", "attention signal"),
          targetPrincipalId: stringValue(
            row,
            "target_principal_id",
            "attention signal",
          ),
        });
  }

  public findAttentionSignalByDeduplicationKey(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
    deduplicationKey: string,
  ): AttentionSignal | undefined {
    const row = this.database
      .prepare(
        "SELECT id, space_id, payload_json FROM attention_signals WHERE workspace_id = ? AND target_principal_id = ? AND deduplication_key = ?",
      )
      .get(workspaceId, principalId, deduplicationKey);
    if (row === undefined) return undefined;
    const id = stringValue(row, "id", "attention signal");
    return parsePayload<AttentionSignal>(row, "id", id, "attention signal", {
      workspaceId,
      spaceId: stringValue(row, "space_id", "attention signal"),
      targetPrincipalId: principalId,
    });
  }

  public listAttentionSignals(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
  ): readonly AttentionSignal[] {
    return this.database
      .prepare(
        "SELECT id, space_id, payload_json FROM attention_signals WHERE workspace_id = ? AND target_principal_id = ? ORDER BY updated_at DESC, id DESC",
      )
      .all(workspaceId, principalId)
      .map((row) => {
        const id = stringValue(row, "id", "attention signal");
        return parsePayload<AttentionSignal>(
          row,
          "id",
          id,
          "attention signal",
          {
            workspaceId,
            spaceId: stringValue(row, "space_id", "attention signal"),
            targetPrincipalId: principalId,
          },
        );
      });
  }

  public getCapture(id: CaptureId): Capture | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM captures WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<Capture>(row, "id", id, "capture", {
          workspaceId: stringValue(row, "workspace_id", "capture"),
          spaceId: stringValue(row, "space_id", "capture"),
        });
  }

  public listCapturesInSpace(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly Capture[] {
    return this.database
      .prepare(
        "SELECT id, workspace_id, space_id, payload_json FROM captures WHERE workspace_id = ? AND space_id = ? ORDER BY captured_at DESC, id DESC",
      )
      .all(workspaceId, spaceId)
      .map((row) =>
        parsePayload<Capture>(
          row,
          "id",
          stringValue(row, "id", "capture"),
          "capture",
          { workspaceId, spaceId },
        ),
      );
  }

  public listCaptures(
    request: CapturePageRequest,
  ): readonly Capture[] | undefined {
    return this.listPage<Capture>(
      "captures",
      "captured_at",
      request,
      "capture",
    );
  }

  public getTask(id: TaskId): Task | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM tasks WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<Task>(row, "id", id, "task", {
          workspaceId: stringValue(row, "workspace_id", "task"),
          spaceId: stringValue(row, "space_id", "task"),
        });
  }

  public listTasksInSpace(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly Task[] {
    return this.database
      .prepare(
        "SELECT id, payload_json FROM tasks WHERE workspace_id = ? AND space_id = ? AND record_state = 'active' ORDER BY created_at DESC, id DESC",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "task");
        return parsePayload<Task>(row, "id", id, "task", {
          workspaceId,
          spaceId,
        });
      });
  }

  public getProject(id: ProjectId): Project | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM projects WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<Project>(row, "id", id, "project", {
          workspaceId: stringValue(row, "workspace_id", "project"),
          spaceId: stringValue(row, "space_id", "project"),
        });
  }

  public listProjects(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly Project[] {
    return this.database
      .prepare(
        "SELECT id, payload_json FROM projects WHERE workspace_id = ? AND space_id = ? ORDER BY updated_at DESC, id DESC",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "project");
        return parsePayload<Project>(row, "id", id, "project", {
          workspaceId,
          spaceId,
        });
      });
  }

  public getDocument(id: DocumentId): NativeDocument | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM documents WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<NativeDocument>(row, "id", id, "document", {
          workspaceId: stringValue(row, "workspace_id", "document"),
          spaceId: stringValue(row, "space_id", "document"),
        });
  }

  public listDocuments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly NativeDocument[] {
    return this.database
      .prepare(
        "SELECT id, payload_json FROM documents WHERE workspace_id = ? AND space_id = ? ORDER BY updated_at DESC, id DESC",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "document");
        return parsePayload<NativeDocument>(row, "id", id, "document", {
          workspaceId,
          spaceId,
        });
      });
  }

  public getKnowledgeSource(
    id: KnowledgeSourceId,
  ): KnowledgeSource | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM knowledge_sources WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<KnowledgeSource>(row, "id", id, "knowledge source", {
          workspaceId: stringValue(row, "workspace_id", "knowledge source"),
          spaceId: stringValue(row, "space_id", "knowledge source"),
        });
  }

  public listKnowledgeSources(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly KnowledgeSource[] {
    return this.database
      .prepare(
        "SELECT id, payload_json FROM knowledge_sources WHERE workspace_id = ? AND space_id = ? ORDER BY updated_at DESC, id DESC",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "knowledge source");
        return parsePayload<KnowledgeSource>(
          row,
          "id",
          id,
          "knowledge source",
          {
            workspaceId,
            spaceId,
          },
        );
      });
  }

  public getNamedDocumentVersion(
    id: NamedDocumentVersionId,
  ): NamedDocumentVersion | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM named_document_versions WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<NamedDocumentVersion>(
          row,
          "id",
          id,
          "named document version",
          {
            workspaceId: stringValue(
              row,
              "workspace_id",
              "named document version",
            ),
            spaceId: stringValue(row, "space_id", "named document version"),
          },
        );
  }

  public listNamedDocumentVersions(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    documentId?: DocumentId,
  ): readonly NamedDocumentVersion[] {
    const rows =
      documentId === undefined
        ? this.database
            .prepare(
              "SELECT id, payload_json FROM named_document_versions WHERE workspace_id = ? AND space_id = ? ORDER BY created_at DESC, id DESC",
            )
            .all(workspaceId, spaceId)
        : this.database
            .prepare(
              "SELECT id, payload_json FROM named_document_versions WHERE workspace_id = ? AND space_id = ? AND document_id = ? ORDER BY created_at DESC, id DESC",
            )
            .all(workspaceId, spaceId, documentId);
    return rows.map((row) => {
      const id = stringValue(row, "id", "named document version");
      return parsePayload<NamedDocumentVersion>(
        row,
        "id",
        id,
        "named document version",
        { workspaceId, spaceId },
      );
    });
  }

  public getStrategicRecord(
    id: StrategicRecordId,
  ): StrategicRecord | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM strategic_records WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<StrategicRecord>(row, "id", id, "strategic record", {
          workspaceId: stringValue(row, "workspace_id", "strategic record"),
          spaceId: stringValue(row, "space_id", "strategic record"),
        });
  }

  public listStrategicRecords(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly StrategicRecord[] {
    return this.database
      .prepare(
        "SELECT id, payload_json FROM strategic_records WHERE workspace_id = ? AND space_id = ? ORDER BY updated_at DESC, id DESC",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "strategic record");
        return parsePayload<StrategicRecord>(
          row,
          "id",
          id,
          "strategic record",
          { workspaceId, spaceId },
        );
      });
  }

  public getRelation(id: RelationId): TaskProjectRelation | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, task_id, project_id, state, payload_json FROM task_project_relations WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<TaskProjectRelation>(row, "id", id, "relation", {
          workspaceId: stringValue(row, "workspace_id", "relation"),
          spaceId: stringValue(row, "space_id", "relation"),
          taskId: stringValue(row, "task_id", "relation"),
          projectId: stringValue(row, "project_id", "relation"),
          state: stringValue(row, "state", "relation"),
        });
  }

  public findTaskProjectRelation(
    taskId: TaskId,
    projectId: ProjectId,
  ): TaskProjectRelation | undefined {
    const row = this.database
      .prepare(
        "SELECT id, workspace_id, space_id, task_id, project_id, state, payload_json FROM task_project_relations WHERE task_id = ? AND project_id = ? AND state = 'active' ORDER BY id LIMIT 1",
      )
      .get(taskId, projectId);
    if (row === undefined) return undefined;
    const id = stringValue(row, "id", "relation");
    return parsePayload<TaskProjectRelation>(row, "id", id, "relation", {
      workspaceId: stringValue(row, "workspace_id", "relation"),
      spaceId: stringValue(row, "space_id", "relation"),
      taskId,
      projectId,
      state: "active",
    });
  }

  public listRelations(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly TaskProjectRelation[] {
    return this.database
      .prepare(
        "SELECT id, task_id, project_id, state, payload_json FROM task_project_relations WHERE workspace_id = ? AND space_id = ? AND state = 'active' ORDER BY id",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "relation");
        return parsePayload<TaskProjectRelation>(row, "id", id, "relation", {
          workspaceId,
          spaceId,
          taskId: stringValue(row, "task_id", "relation"),
          projectId: stringValue(row, "project_id", "relation"),
          state: stringValue(row, "state", "relation"),
        });
      });
  }

  public listEvents(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly DomainEvent[] {
    return this.database
      .prepare(
        "SELECT id, occurred_at, payload_json FROM events WHERE workspace_id = ? AND space_id = ? ORDER BY occurred_at DESC, id DESC",
      )
      .all(workspaceId, spaceId)
      .map((row) => {
        const id = stringValue(row, "id", "event");
        return parsePayload<DomainEvent>(row, "id", id, "event", {
          workspaceId,
          spaceId,
          occurredAt: stringValue(row, "occurred_at", "event"),
        });
      });
  }

  public getAuditReceiptByCommand(commandId: string): AuditReceipt | undefined {
    const row = this.database
      .prepare(
        "SELECT id, workspace_id, space_id, command_id, payload_json FROM audit_receipts WHERE command_id = ? ORDER BY id LIMIT 1",
      )
      .get(commandId);
    if (row === undefined) return undefined;
    const id = stringValue(row, "id", "audit receipt");
    return parsePayload<AuditReceipt>(row, "id", id, "audit receipt", {
      workspaceId: stringValue(row, "workspace_id", "audit receipt"),
      spaceId: stringValue(row, "space_id", "audit receipt"),
      commandId: stringValue(row, "command_id", "audit receipt"),
    });
  }

  public getUndoDescriptor(commandId: string): UndoDescriptor | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM undo_descriptors WHERE target_command_id = ?",
      )
      .get(commandId);
    return row === undefined
      ? undefined
      : parsePayload<UndoDescriptor>(
          row,
          "targetCommandId",
          commandId,
          "undo descriptor",
          {
            workspaceId: stringValue(row, "workspace_id", "undo descriptor"),
            spaceId: stringValue(row, "space_id", "undo descriptor"),
          },
        );
  }

  public listTasks(request: TaskPageRequest): readonly Task[] | undefined {
    return this.listPage<Task>("tasks", "created_at", request, "task");
  }

  public getAuditReceipt(id: AuditReceiptId): AuditReceipt | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, command_id, payload_json FROM audit_receipts WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<AuditReceipt>(row, "id", id, "audit receipt", {
          workspaceId: stringValue(row, "workspace_id", "audit receipt"),
          spaceId: stringValue(row, "space_id", "audit receipt"),
          commandId: stringValue(row, "command_id", "audit receipt"),
        });
  }

  public getIdempotency(scope: string): IdempotencyRecord | undefined {
    const row = this.database
      .prepare("SELECT payload_json FROM idempotency_records WHERE scope = ?")
      .get(scope);
    return row === undefined
      ? undefined
      : parsePayload<IdempotencyRecord>(
          row,
          "scope",
          scope,
          "idempotency record",
        );
  }

  public getAgentGrant(id: GrantId): AgentAccessGrant | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, agent_principal_id, credential_id, payload_json FROM agent_grants WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<AgentAccessGrant>(row, "id", id, "agent grant", {
          workspaceId: stringValue(row, "workspace_id", "agent grant"),
          agentPrincipalId: stringValue(
            row,
            "agent_principal_id",
            "agent grant",
          ),
          credentialId: stringValue(row, "credential_id", "agent grant"),
        });
  }

  public listAgentGrants(
    workspaceId: WorkspaceId,
  ): readonly AgentAccessGrant[] {
    return this.database
      .prepare(
        "SELECT id, agent_principal_id, credential_id, payload_json FROM agent_grants WHERE workspace_id = ? ORDER BY id",
      )
      .all(workspaceId)
      .map((row) => {
        const id = stringValue(row, "id", "agent grant");
        return parsePayload<AgentAccessGrant>(row, "id", id, "agent grant", {
          workspaceId,
          agentPrincipalId: stringValue(
            row,
            "agent_principal_id",
            "agent grant",
          ),
          credentialId: stringValue(row, "credential_id", "agent grant"),
        });
      });
  }

  public getAgentRun(id: AgentRunId): AgentRun | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, agent_principal_id, grant_id, payload_json FROM agent_runs WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<AgentRun>(row, "id", id, "agent run", {
          workspaceId: stringValue(row, "workspace_id", "agent run"),
          agentPrincipalId: stringValue(row, "agent_principal_id", "agent run"),
          grantId: stringValue(row, "grant_id", "agent run"),
        });
  }

  public getAgentCheckpoint(id: CheckpointId): AgentCheckpoint | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, agent_principal_id, grant_id, run_id, payload_json FROM agent_checkpoints WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<AgentCheckpoint>(row, "id", id, "agent checkpoint", {
          workspaceId: stringValue(row, "workspace_id", "agent checkpoint"),
          agentPrincipalId: stringValue(
            row,
            "agent_principal_id",
            "agent checkpoint",
          ),
          grantId: stringValue(row, "grant_id", "agent checkpoint"),
          runId: stringValue(row, "run_id", "agent checkpoint"),
        });
  }

  public listAgentHandoffs(runId: AgentRunId): readonly AgentHandoff[] {
    return this.database
      .prepare(
        "SELECT id, workspace_id, agent_principal_id, grant_id, payload_json FROM agent_handoffs WHERE run_id = ? ORDER BY created_at, id",
      )
      .all(runId)
      .map((row) => {
        const id = stringValue(row, "id", "agent handoff");
        return parsePayload<AgentHandoff>(row, "id", id, "agent handoff", {
          workspaceId: stringValue(row, "workspace_id", "agent handoff"),
          agentPrincipalId: stringValue(
            row,
            "agent_principal_id",
            "agent handoff",
          ),
          grantId: stringValue(row, "grant_id", "agent handoff"),
          runId,
        });
      });
  }

  private listPage<RecordType extends object>(
    table: "captures" | "tasks",
    orderedColumn: "captured_at" | "created_at",
    request: CapturePageRequest | TaskPageRequest,
    context: string,
  ): readonly RecordType[] | undefined {
    const parameters: SqliteValue[] = [request.workspaceId, request.spaceId];
    const recordStateWhere =
      table === "tasks" ? " AND record_state = 'active'" : "";
    let cursorWhere = "";
    if (request.after !== undefined) {
      const cursor = this.database
        .prepare(
          `SELECT 1 AS present FROM ${table} WHERE id = ? AND workspace_id = ? AND space_id = ? AND ${orderedColumn} = ?${recordStateWhere}`,
        )
        .get(
          request.after.recordId,
          request.workspaceId,
          request.spaceId,
          request.after.orderedAt,
        );
      if (cursor === undefined) return undefined;
      cursorWhere = ` AND (${orderedColumn} < ? OR (${orderedColumn} = ? AND id < ?))`;
      parameters.push(
        request.after.orderedAt,
        request.after.orderedAt,
        request.after.recordId,
      );
    }
    parameters.push(request.limit);
    return this.database
      .prepare(
        `SELECT id, payload_json FROM ${table} WHERE workspace_id = ? AND space_id = ?${recordStateWhere}${cursorWhere} ORDER BY ${orderedColumn} DESC, id DESC LIMIT ?`,
      )
      .all(...parameters)
      .map((row) => {
        const id = stringValue(row, "id", context);
        return parsePayload<RecordType>(row, "id", id, context, {
          workspaceId: request.workspaceId,
          spaceId: request.spaceId,
        });
      });
  }
}

class SqliteTransaction
  extends SqliteReadView
  implements ApplicationWave2Transaction
{
  public insertWorkspace(record: Workspace): void {
    this.insert(
      "workspaces",
      ["id", "version", "payload_json"],
      [record.id, record.version, payload(record)],
    );
  }
  public updateWorkspace(record: Workspace, expectedVersion: number): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE workspaces SET version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(record.version, payload(record), record.id, expectedVersion),
    );
  }
  public insertSpace(record: Space): void {
    this.insert(
      "spaces",
      ["id", "workspace_id", "version", "payload_json"],
      [record.id, record.workspaceId, record.version, payload(record)],
    );
  }
  public insertMembership(record: WorkspaceMembership): void {
    this.insert(
      "memberships",
      ["id", "workspace_id", "principal_id", "version", "payload_json"],
      [
        record.id,
        record.workspaceId,
        record.principalId,
        record.version,
        payload(record),
      ],
    );
  }
  public updateMembership(
    record: WorkspaceMembership,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE memberships SET version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(record.version, payload(record), record.id, expectedVersion),
    );
  }
  public insertSpaceGrant(record: SpaceGrant): void {
    this.insert(
      "space_grants",
      [
        "id",
        "workspace_id",
        "space_id",
        "principal_id",
        "status",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.principalId,
        record.status,
        record.version,
        payload(record),
      ],
    );
  }
  public updateSpaceGrant(
    record: SpaceGrant,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE space_grants SET status = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.status,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertTaskAssignment(record: TaskAssignment): void {
    this.insert(
      "task_assignments",
      [
        "id",
        "workspace_id",
        "space_id",
        "task_id",
        "assignee_principal_id",
        "state",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.taskId,
        record.assigneePrincipalId,
        record.state,
        record.version,
        payload(record),
      ],
    );
  }
  public updateTaskAssignment(
    record: TaskAssignment,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE task_assignments SET state = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.state,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertComment(record: RecordComment): void {
    this.insert(
      "comments",
      [
        "id",
        "workspace_id",
        "space_id",
        "root_comment_id",
        "author_principal_id",
        "version",
        "created_at",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.rootCommentId,
        record.authorPrincipalId,
        record.version,
        record.createdAt,
        payload(record),
      ],
    );
  }
  public updateComment(
    record: RecordComment,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE comments SET version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(record.version, payload(record), record.id, expectedVersion),
    );
  }
  public insertAttentionSignal(record: AttentionSignal): void {
    this.insert(
      "attention_signals",
      [
        "id",
        "workspace_id",
        "space_id",
        "target_principal_id",
        "deduplication_key",
        "state",
        "version",
        "updated_at",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.targetPrincipalId,
        record.deduplicationKey,
        record.state,
        record.version,
        record.updatedAt,
        payload(record),
      ],
    );
  }
  public updateAttentionSignal(
    record: AttentionSignal,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE attention_signals SET state = ?, version = ?, updated_at = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.state,
          record.version,
          record.updatedAt,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertTaskStatus(record: TaskStatusDefinition): void {
    this.insert(
      "task_statuses",
      ["id", "workspace_id", "position", "version", "payload_json"],
      [
        record.id,
        record.workspaceId,
        record.position,
        record.version,
        payload(record),
      ],
    );
  }
  public insertCapture(record: Capture): void {
    this.insert(
      "captures",
      [
        "id",
        "workspace_id",
        "space_id",
        "captured_at",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.capturedAt,
        record.version,
        payload(record),
      ],
    );
  }
  public updateCapture(record: Capture, expectedVersion: number): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE captures SET version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(record.version, payload(record), record.id, expectedVersion),
    );
  }
  public insertTask(record: Task): void {
    this.insert(
      "tasks",
      [
        "id",
        "workspace_id",
        "space_id",
        "created_at",
        "record_state",
        "completion_state",
        "updated_at",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.createdAt,
        record.recordState,
        record.completionState,
        record.updatedAt,
        record.version,
        payload(record),
      ],
    );
  }
  public updateTask(record: Task, expectedVersion: number): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE tasks SET record_state = ?, completion_state = ?, updated_at = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.recordState,
          record.completionState,
          record.updatedAt,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertProject(record: Project): void {
    this.insert(
      "projects",
      [
        "id",
        "workspace_id",
        "space_id",
        "updated_at",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.updatedAt,
        record.version,
        payload(record),
      ],
    );
  }
  public updateProject(record: Project, expectedVersion: number): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE projects SET updated_at = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.updatedAt,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertDocument(record: NativeDocument): void {
    this.insert(
      "documents",
      [
        "id",
        "workspace_id",
        "space_id",
        "updated_at",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.updatedAt,
        record.version,
        payload(record),
      ],
    );
  }
  public updateDocument(
    record: NativeDocument,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE documents SET updated_at = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.updatedAt,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertKnowledgeSource(record: KnowledgeSource): void {
    this.insert(
      "knowledge_sources",
      [
        "id",
        "workspace_id",
        "space_id",
        "updated_at",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.updatedAt,
        record.version,
        payload(record),
      ],
    );
  }
  public updateKnowledgeSource(
    record: KnowledgeSource,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE knowledge_sources SET updated_at = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.updatedAt,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertNamedDocumentVersion(record: NamedDocumentVersion): void {
    this.insert(
      "named_document_versions",
      [
        "id",
        "workspace_id",
        "space_id",
        "document_id",
        "created_at",
        "state",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.documentId,
        record.createdAt,
        record.state,
        record.version,
        payload(record),
      ],
    );
  }
  public updateNamedDocumentVersion(
    record: NamedDocumentVersion,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE named_document_versions SET state = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.state,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertStrategicRecord(record: StrategicRecord): void {
    this.insert(
      "strategic_records",
      [
        "id",
        "workspace_id",
        "space_id",
        "kind",
        "updated_at",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.kind,
        record.updatedAt,
        record.version,
        payload(record),
      ],
    );
  }
  public updateStrategicRecord(
    record: StrategicRecord,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE strategic_records SET kind = ?, updated_at = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.kind,
          record.updatedAt,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertRelation(record: TaskProjectRelation): void {
    this.insert(
      "task_project_relations",
      [
        "id",
        "workspace_id",
        "space_id",
        "task_id",
        "project_id",
        "state",
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.taskId,
        record.projectId,
        record.state,
        record.version,
        payload(record),
      ],
    );
  }
  public updateRelation(
    record: TaskProjectRelation,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE task_project_relations SET state = ?, version = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.state,
          record.version,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }
  public insertUndoDescriptor(record: UndoDescriptor): void {
    this.insert(
      "undo_descriptors",
      ["target_command_id", "workspace_id", "space_id", "payload_json"],
      [
        record.targetCommandId,
        record.workspaceId,
        record.spaceId,
        payload(record),
      ],
    );
  }
  public updateUndoDescriptor(record: UndoDescriptor): void {
    const result = this.database
      .prepare(
        "UPDATE undo_descriptors SET workspace_id = ?, space_id = ?, payload_json = ? WHERE target_command_id = ?",
      )
      .run(
        record.workspaceId,
        record.spaceId,
        payload(record),
        record.targetCommandId,
      );
    if (!changed(result)) {
      throw new LocalStoreCorruptionError(
        `Missing undo descriptor: ${record.targetCommandId}`,
      );
    }
  }
  public insertEvent(record: DomainEvent): void {
    this.insert(
      "events",
      ["id", "workspace_id", "space_id", "occurred_at", "payload_json"],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.occurredAt,
        payload(record),
      ],
    );
  }
  public insertAuditReceipt(record: AuditReceipt): void {
    this.insert(
      "audit_receipts",
      ["id", "workspace_id", "space_id", "command_id", "payload_json"],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.commandId,
        payload(record),
      ],
    );
  }
  public insertIdempotency(record: IdempotencyRecord): void {
    this.insert(
      "idempotency_records",
      ["scope", "payload_json"],
      [record.scope, payload(record)],
    );
  }
  public insertOutbox(record: OutboxEntry): void {
    this.insert(
      "outbox_entries",
      ["id", "workspace_id", "space_id", "event_id", "payload_json"],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.eventId,
        payload(record),
      ],
    );
  }
  public insertSyncCommand(command: CommandEnvelope): void {
    this.insert(
      "command_journal",
      ["command_id", "workspace_id", "payload_json"],
      [command.commandId, command.workspaceId, payload(command)],
    );
  }

  public insertAgentGrant(record: AgentAccessGrant): void {
    this.insert(
      "agent_grants",
      [
        "id",
        "workspace_id",
        "agent_principal_id",
        "credential_id",
        "credential_digest",
        "status",
        "version",
        "updated_at",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.agentPrincipalId,
        record.credentialId,
        record.credentialDigest,
        record.status,
        record.version,
        record.updatedAt,
        payload(record),
      ],
    );
  }

  public updateAgentGrant(
    record: AgentAccessGrant,
    expectedVersion: number,
  ): boolean {
    return changed(
      this.database
        .prepare(
          "UPDATE agent_grants SET credential_id = ?, credential_digest = ?, status = ?, version = ?, updated_at = ?, payload_json = ? WHERE id = ? AND version = ?",
        )
        .run(
          record.credentialId,
          record.credentialDigest,
          record.status,
          record.version,
          record.updatedAt,
          payload(record),
          record.id,
          expectedVersion,
        ),
    );
  }

  public insertAgentRun(record: AgentRun): void {
    this.insert(
      "agent_runs",
      [
        "id",
        "workspace_id",
        "agent_principal_id",
        "grant_id",
        "host_run_id",
        "status",
        "updated_at",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.agentPrincipalId,
        record.grantId,
        record.hostRunId,
        record.status,
        record.updatedAt,
        payload(record),
      ],
    );
  }

  public updateAgentRun(record: AgentRun): void {
    if (
      !changed(
        this.database
          .prepare(
            "UPDATE agent_runs SET status = ?, updated_at = ?, payload_json = ? WHERE id = ?",
          )
          .run(record.status, record.updatedAt, payload(record), record.id),
      )
    )
      throw new LocalStoreCorruptionError(`Missing agent run: ${record.id}`);
  }

  public insertAgentCheckpoint(record: AgentCheckpoint): void {
    this.insert(
      "agent_checkpoints",
      [
        "id",
        "workspace_id",
        "agent_principal_id",
        "grant_id",
        "run_id",
        "status",
        "updated_at",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.agentPrincipalId,
        record.grantId,
        record.runId,
        record.status,
        record.updatedAt,
        payload(record),
      ],
    );
  }

  public updateAgentCheckpoint(record: AgentCheckpoint): void {
    if (
      !changed(
        this.database
          .prepare(
            "UPDATE agent_checkpoints SET status = ?, updated_at = ?, payload_json = ? WHERE id = ?",
          )
          .run(record.status, record.updatedAt, payload(record), record.id),
      )
    )
      throw new LocalStoreCorruptionError(
        `Missing agent checkpoint: ${record.id}`,
      );
  }

  public insertAgentHandoff(record: AgentHandoff): void {
    this.insert(
      "agent_handoffs",
      [
        "id",
        "workspace_id",
        "agent_principal_id",
        "grant_id",
        "run_id",
        "created_at",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.agentPrincipalId,
        record.grantId,
        record.runId,
        record.createdAt,
        payload(record),
      ],
    );
  }

  private insert(
    table: string,
    columns: readonly string[],
    values: readonly SqliteValue[],
  ): void {
    const placeholders = columns.map(() => "?").join(", ");
    this.database
      .prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
      )
      .run(...values);
  }
}

export class SqliteApplicationStore
  implements ApplicationStore, MeetingLoopRepository
{
  public constructor(private readonly database: SqliteDatabase) {
    initializeLocalStoreSchema(database);
  }

  private requireDocumentScope(
    documentId: DocumentId,
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): NativeDocument {
    const document = new SqliteReadView(this.database).getDocument(documentId);
    if (
      document === undefined ||
      document.workspaceId !== workspaceId ||
      document.spaceId !== spaceId
    ) {
      throw new LocalStoreCorruptionError(
        "Document collaboration scope does not match its metadata.",
      );
    }
    return document;
  }

  public read<Result>(read: (view: ApplicationReadView) => Result): Result {
    return read(new SqliteReadView(this.database));
  }

  public load(workspaceId: WorkspaceId): MeetingLoopState {
    const coordinatedMeetings = new SqliteReadView(this.database)
      .listSpaces(workspaceId)
      .flatMap((space) =>
        new SqliteReadView(this.database)
          .listStrategicRecords(workspaceId, space.id)
          .flatMap((record) =>
            record.kind === "meeting" ? [record.meeting] : [],
          ),
      );
    const withCoordinatedMeetings = (
      state: MeetingLoopState,
    ): MeetingLoopState => {
      const meetings = new Map(
        state.meetings.map((meeting) => [meeting.id, meeting]),
      );
      for (const meeting of coordinatedMeetings) {
        const current = meetings.get(meeting.id);
        if (current === undefined || meeting.version > current.version) {
          meetings.set(meeting.id, meeting);
        }
      }
      return {
        ...state,
        meetings: [...meetings.values()].sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        ),
      };
    };
    const row = this.database
      .prepare(
        "SELECT revision, payload_json FROM meeting_loop_state WHERE workspace_id = ?",
      )
      .get(workspaceId);
    if (row === undefined) {
      return withCoordinatedMeetings({
        revision: 0,
        meetings: [],
        previews: [],
        receipts: [],
        audits: [],
      });
    }
    const revision = numberValue(row, "revision", "meeting loop state");
    const raw = stringValue(row, "payload_json", "meeting loop state");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new LocalStoreCorruptionError(
        "Meeting loop state contains invalid JSON.",
      );
    }
    const state = objectValue(parsed, "meeting loop state payload");
    if (
      state.revision !== revision ||
      !Array.isArray(state.meetings) ||
      !Array.isArray(state.previews) ||
      !Array.isArray(state.receipts) ||
      (state.audits !== undefined && !Array.isArray(state.audits))
    ) {
      throw new LocalStoreCorruptionError(
        "Meeting loop state violates its storage contract.",
      );
    }
    return withCoordinatedMeetings({
      ...(state as unknown as MeetingLoopState),
      audits: (state.audits as MeetingLoopState["audits"] | undefined) ?? [],
    });
  }

  public save(
    workspaceId: WorkspaceId,
    expectedRevision: number,
    state: MeetingLoopState,
  ): boolean {
    if (state.revision !== expectedRevision + 1) return false;
    if (expectedRevision === 0) {
      try {
        const result = this.database
          .prepare(
            "INSERT INTO meeting_loop_state (workspace_id, revision, payload_json) VALUES (?, ?, ?)",
          )
          .run(workspaceId, state.revision, payload(state));
        return changed(result);
      } catch (error) {
        const existing = this.database
          .prepare(
            "SELECT revision FROM meeting_loop_state WHERE workspace_id = ?",
          )
          .get(workspaceId);
        if (existing !== undefined) return false;
        throw error;
      }
    }
    return changed(
      this.database
        .prepare(
          "UPDATE meeting_loop_state SET revision = ?, payload_json = ? WHERE workspace_id = ? AND revision = ?",
        )
        .run(state.revision, payload(state), workspaceId, expectedRevision),
    );
  }

  public loadDocumentCollaborationState(input: {
    readonly documentId: DocumentId;
    readonly workspaceId: WorkspaceId;
    readonly spaceId: SpaceId;
  }): LocalDocumentCollaborationState | undefined {
    this.requireDocumentScope(
      input.documentId,
      input.workspaceId,
      input.spaceId,
    );
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, engine, state_blob, updated_at FROM document_collaboration_state WHERE document_id = ?",
      )
      .get(input.documentId);
    if (row === undefined) return undefined;
    if (
      stringValue(row, "workspace_id", "document state") !==
        input.workspaceId ||
      stringValue(row, "space_id", "document state") !== input.spaceId ||
      stringValue(row, "engine", "document state") !== "yjs-13"
    ) {
      throw new LocalStoreCorruptionError(
        "Document collaboration state violates its scope.",
      );
    }
    return {
      ...input,
      engine: "yjs-13",
      state: bytesValue(row, "state_blob", "document state"),
      updatedAt: stringValue(row, "updated_at", "document state"),
    };
  }

  public commitDocumentUpdate(input: {
    readonly id: string;
    readonly documentId: DocumentId;
    readonly workspaceId: WorkspaceId;
    readonly spaceId: SpaceId;
    readonly state: Uint8Array;
    readonly update: Uint8Array;
    readonly createdAt: string;
  }): void {
    if (
      input.state.byteLength < 1 ||
      input.state.byteLength > 1_048_576 ||
      input.update.byteLength < 1 ||
      input.update.byteLength > 1_048_576
    ) {
      throw new Error("Document collaboration binary size is invalid.");
    }
    this.transact(() => {
      this.requireDocumentScope(
        input.documentId,
        input.workspaceId,
        input.spaceId,
      );
      this.database
        .prepare(
          "INSERT INTO document_collaboration_state (document_id, workspace_id, space_id, engine, state_blob, updated_at) VALUES (?, ?, ?, 'yjs-13', ?, ?) ON CONFLICT(document_id) DO UPDATE SET workspace_id = excluded.workspace_id, space_id = excluded.space_id, engine = excluded.engine, state_blob = excluded.state_blob, updated_at = excluded.updated_at",
        )
        .run(
          input.documentId,
          input.workspaceId,
          input.spaceId,
          input.state,
          input.createdAt,
        );
      this.database
        .prepare(
          "INSERT INTO document_pending_updates (id, document_id, workspace_id, space_id, update_blob, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          input.id,
          input.documentId,
          input.workspaceId,
          input.spaceId,
          input.update,
          input.createdAt,
        );
    });
  }

  public storeDocumentCollaborationState(input: {
    readonly documentId: DocumentId;
    readonly workspaceId: WorkspaceId;
    readonly spaceId: SpaceId;
    readonly state: Uint8Array;
    readonly updatedAt: string;
  }): void {
    if (input.state.byteLength < 1 || input.state.byteLength > 1_048_576) {
      throw new Error("Document collaboration binary size is invalid.");
    }
    this.transact(() => {
      this.requireDocumentScope(
        input.documentId,
        input.workspaceId,
        input.spaceId,
      );
      this.database
        .prepare(
          "INSERT INTO document_collaboration_state (document_id, workspace_id, space_id, engine, state_blob, updated_at) VALUES (?, ?, ?, 'yjs-13', ?, ?) ON CONFLICT(document_id) DO UPDATE SET workspace_id = excluded.workspace_id, space_id = excluded.space_id, engine = excluded.engine, state_blob = excluded.state_blob, updated_at = excluded.updated_at",
        )
        .run(
          input.documentId,
          input.workspaceId,
          input.spaceId,
          input.state,
          input.updatedAt,
        );
    });
  }

  public listPendingDocumentUpdates(input: {
    readonly documentId: DocumentId;
    readonly workspaceId: WorkspaceId;
    readonly spaceId: SpaceId;
  }): readonly LocalPendingDocumentUpdate[] {
    this.requireDocumentScope(
      input.documentId,
      input.workspaceId,
      input.spaceId,
    );
    return this.database
      .prepare(
        "SELECT id, workspace_id, space_id, update_blob, created_at FROM document_pending_updates WHERE document_id = ? ORDER BY created_at, id",
      )
      .all(input.documentId)
      .map((row) => {
        if (
          stringValue(row, "workspace_id", "document update") !==
            input.workspaceId ||
          stringValue(row, "space_id", "document update") !== input.spaceId
        ) {
          throw new LocalStoreCorruptionError(
            "Pending document update violates its scope.",
          );
        }
        return {
          id: stringValue(row, "id", "document update"),
          documentId: input.documentId,
          update: bytesValue(row, "update_blob", "document update"),
          createdAt: stringValue(row, "created_at", "document update"),
        };
      });
  }

  public acknowledgeDocumentUpdates(input: {
    readonly documentId: DocumentId;
    readonly updateIds: readonly string[];
  }): void {
    this.transact(() => {
      const remove = this.database.prepare(
        "DELETE FROM document_pending_updates WHERE document_id = ? AND id = ?",
      );
      for (const id of input.updateIds) remove.run(input.documentId, id);
    });
  }

  public storeDocumentRevision(revision: LocalDocumentRevision): void {
    if (
      revision.state.byteLength < 1 ||
      revision.state.byteLength > 1_048_576 ||
      revision.stateVector.byteLength < 1 ||
      revision.stateVector.byteLength > 1_048_576
    ) {
      throw new Error("Document revision binary size is invalid.");
    }
    this.transact(() => {
      this.requireDocumentScope(
        revision.documentId,
        revision.workspaceId,
        revision.spaceId,
      );
      this.database
        .prepare(
          "INSERT INTO document_revisions (id, document_id, workspace_id, space_id, name, engine, state_blob, state_vector_blob, created_by, created_by_device_id, correlation_id, created_at, restored_from_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          revision.id,
          revision.documentId,
          revision.workspaceId,
          revision.spaceId,
          revision.name,
          revision.engine,
          revision.state,
          revision.stateVector,
          revision.createdBy,
          revision.createdByDeviceId,
          revision.correlationId,
          revision.createdAt,
          revision.restoredFromRevisionId ?? null,
        );
    });
  }

  public listDocumentRevisions(input: {
    readonly documentId: DocumentId;
    readonly workspaceId: WorkspaceId;
    readonly spaceId: SpaceId;
  }): readonly LocalDocumentRevision[] {
    this.requireDocumentScope(
      input.documentId,
      input.workspaceId,
      input.spaceId,
    );
    return this.database
      .prepare(
        "SELECT id, workspace_id, space_id, name, engine, state_blob, state_vector_blob, created_by, created_by_device_id, correlation_id, created_at, restored_from_revision_id FROM document_revisions WHERE document_id = ? ORDER BY created_at DESC, id DESC",
      )
      .all(input.documentId)
      .map((row) => {
        if (
          stringValue(row, "workspace_id", "document revision") !==
            input.workspaceId ||
          stringValue(row, "space_id", "document revision") !== input.spaceId ||
          stringValue(row, "engine", "document revision") !== "yjs-13"
        ) {
          throw new LocalStoreCorruptionError(
            "Document revision violates its scope.",
          );
        }
        const restoredFromRevisionId = nullableStringValue(
          row,
          "restored_from_revision_id",
          "document revision",
        );
        return {
          id: DocumentRevisionIdSchema.parse(
            stringValue(row, "id", "document revision"),
          ),
          ...input,
          name: stringValue(row, "name", "document revision"),
          engine: "yjs-13" as const,
          state: bytesValue(row, "state_blob", "document revision"),
          stateVector: bytesValue(
            row,
            "state_vector_blob",
            "document revision",
          ),
          createdBy: PrincipalIdSchema.parse(
            stringValue(row, "created_by", "document revision"),
          ),
          createdByDeviceId: DeviceIdSchema.parse(
            stringValue(row, "created_by_device_id", "document revision"),
          ),
          correlationId: CorrelationIdSchema.parse(
            stringValue(row, "correlation_id", "document revision"),
          ),
          createdAt: stringValue(row, "created_at", "document revision"),
          ...(restoredFromRevisionId === undefined
            ? {}
            : {
                restoredFromRevisionId: DocumentRevisionIdSchema.parse(
                  restoredFromRevisionId,
                ),
              }),
        };
      });
  }

  public purgeDocumentCollaboration(documentId: DocumentId): void {
    this.transact(() => {
      this.database
        .prepare("DELETE FROM document_pending_updates WHERE document_id = ?")
        .run(documentId);
      this.database
        .prepare("DELETE FROM document_revisions WHERE document_id = ?")
        .run(documentId);
      this.database
        .prepare(
          "DELETE FROM document_collaboration_state WHERE document_id = ?",
        )
        .run(documentId);
    });
  }

  public recoverySummary(
    workspaceId: WorkspaceId,
  ): LocalWorkspaceRecoverySummary {
    const view = new SqliteReadView(this.database);
    const workspace = view.getWorkspace(workspaceId);
    if (
      workspace === undefined ||
      view.getSpace(workspace.rootSpaceId) === undefined
    ) {
      throw new LocalStoreCorruptionError(
        "The recovery workspace identity is incomplete.",
      );
    }
    const owners = this.database
      .prepare(
        "SELECT id, principal_id, payload_json FROM memberships WHERE workspace_id = ? ORDER BY id",
      )
      .all(workspaceId)
      .map((row) => {
        const id = stringValue(row, "id", "membership");
        const principal = PrincipalIdSchema.safeParse(
          stringValue(row, "principal_id", "membership"),
        );
        if (!principal.success) {
          throw new LocalStoreCorruptionError(
            "The recovery workspace principal is invalid.",
          );
        }
        return parsePayload<WorkspaceMembership>(row, "id", id, "membership", {
          workspaceId,
          principalId: principal.data,
        });
      })
      .filter((membership) => membership.role === "owner");
    if (owners.length !== 1 || owners[0] === undefined) {
      throw new LocalStoreCorruptionError(
        "The recovery workspace must have exactly one owner.",
      );
    }
    const count = (table: string): number =>
      numberValue(
        this.database
          .prepare(
            `SELECT count(*) AS count FROM ${table} WHERE workspace_id = ?`,
          )
          .get(workspaceId),
        "count",
        `${table} recovery count`,
      );
    return {
      principalId: owners[0].principalId,
      workspace,
      counts: {
        captures: count("captures"),
        tasks: count("tasks"),
        projects: count("projects"),
        documents: count("documents"),
        relations: count("task_project_relations"),
        auditReceipts: count("audit_receipts"),
      },
    };
  }

  public snapshot(): ReferenceStateSnapshot {
    const records = <RecordType extends object>(
      table: string,
      storageKey: string,
      payloadKey: "id" | "scope" | "targetCommandId",
      context: string,
    ): readonly RecordType[] =>
      this.database
        .prepare(
          `SELECT ${storageKey} AS storage_identity, payload_json FROM ${table} ORDER BY ${storageKey}`,
        )
        .all()
        .map((row) =>
          parsePayload<RecordType>(
            row,
            payloadKey,
            stringValue(row, "storage_identity", context),
            context,
          ),
        );
    return {
      workspaces: records("workspaces", "id", "id", "workspace"),
      spaces: records("spaces", "id", "id", "space"),
      memberships: records("memberships", "id", "id", "membership"),
      spaceGrants: records("space_grants", "id", "id", "Space grant"),
      taskAssignments: records(
        "task_assignments",
        "id",
        "id",
        "Task assignment",
      ),
      comments: records("comments", "id", "id", "comment"),
      attentionSignals: records(
        "attention_signals",
        "id",
        "id",
        "attention signal",
      ),
      taskStatuses: records("task_statuses", "id", "id", "task status"),
      captures: records("captures", "id", "id", "capture"),
      tasks: records("tasks", "id", "id", "task"),
      projects: records("projects", "id", "id", "project"),
      documents: records("documents", "id", "id", "document"),
      knowledgeSources: records(
        "knowledge_sources",
        "id",
        "id",
        "knowledge source",
      ),
      namedDocumentVersions: records(
        "named_document_versions",
        "id",
        "id",
        "named document version",
      ),
      strategicRecords: records(
        "strategic_records",
        "id",
        "id",
        "strategic record",
      ),
      relations: records("task_project_relations", "id", "id", "relation"),
      undoDescriptors: records(
        "undo_descriptors",
        "target_command_id",
        "targetCommandId",
        "undo descriptor",
      ),
      events: records("events", "id", "id", "event"),
      auditReceipts: records("audit_receipts", "id", "id", "audit receipt"),
      idempotencyRecords: records(
        "idempotency_records",
        "scope",
        "scope",
        "idempotency record",
      ),
      outboxEntries: records("outbox_entries", "id", "id", "outbox entry"),
      agentGrants: records("agent_grants", "id", "id", "agent grant"),
      agentRuns: records("agent_runs", "id", "id", "agent run"),
      agentCheckpoints: records(
        "agent_checkpoints",
        "id",
        "id",
        "agent checkpoint",
      ),
      agentHandoffs: records("agent_handoffs", "id", "id", "agent handoff"),
    };
  }

  public getCoordinationState(): LocalCoordinationState | undefined {
    const raw = this.database
      .prepare("SELECT * FROM coordination_state WHERE singleton = 1")
      .get();
    if (raw === undefined) return undefined;
    const row = objectValue(raw, "coordination state");
    const syncState = stringValue(row, "sync_state", "coordination state");
    if (
      ![
        "current",
        "queued",
        "syncing",
        "offline",
        "conflict",
        "unknown_reconcile",
        "revoked",
      ].includes(syncState)
    ) {
      throw new LocalStoreCorruptionError("Invalid coordination sync state.");
    }
    const lastSyncedAt = row.last_synced_at;
    const lastErrorCode = row.last_error_code;
    if (lastSyncedAt !== null && typeof lastSyncedAt !== "string") {
      throw new LocalStoreCorruptionError("Invalid coordination timestamp.");
    }
    if (lastErrorCode !== null && typeof lastErrorCode !== "string") {
      throw new LocalStoreCorruptionError("Invalid coordination error code.");
    }
    return {
      workspaceId: row.workspace_id as WorkspaceId,
      providerInstanceId: stringValue(
        row,
        "provider_instance_id",
        "coordination state",
      ),
      hubOrigin: stringValue(row, "hub_origin", "coordination state"),
      checkpoint: stringValue(row, "checkpoint", "coordination state"),
      snapshotDigest: stringValue(row, "snapshot_digest", "coordination state"),
      syncState: syncState as LocalCoordinationState["syncState"],
      ...(lastSyncedAt === null ? {} : { lastSyncedAt }),
      ...(lastErrorCode === null ? {} : { lastErrorCode }),
    };
  }

  public configureCoordination(input: {
    readonly workspaceId: WorkspaceId;
    readonly providerInstanceId: string;
    readonly hubOrigin: string;
    readonly checkpoint: string;
    readonly snapshotDigest: string;
    readonly configuredAt: string;
  }): void {
    this.transact(() => {
      this.database
        .prepare(
          "INSERT INTO coordination_state (singleton, workspace_id, provider_instance_id, hub_origin, checkpoint, snapshot_digest, sync_state, last_synced_at) VALUES (1, ?, ?, ?, ?, ?, 'current', ?)",
        )
        .run(
          input.workspaceId,
          input.providerInstanceId,
          input.hubOrigin,
          input.checkpoint,
          input.snapshotDigest,
          input.configuredAt,
        );
      const delivery = this.database.prepare(
        "INSERT OR IGNORE INTO sync_delivery (command_id, state, updated_at) VALUES (?, 'seeded', ?)",
      );
      for (const row of this.database
        .prepare("SELECT command_id FROM command_journal")
        .all()) {
        delivery.run(
          stringValue(row, "command_id", "command journal"),
          input.configuredAt,
        );
      }
    });
  }

  public listPendingSyncCommands(limit = 50): readonly PendingSyncCommand[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("Sync command limit must be between 1 and 50.");
    }
    const delivered = this.database.prepare(
      "SELECT state FROM sync_delivery WHERE command_id = ?",
    );
    const pending: PendingSyncCommand[] = [];
    const entries = this.database
      .prepare(
        "SELECT command_id, payload_json FROM command_journal ORDER BY rowid",
      )
      .all();
    for (const row of entries) {
      const commandId = stringValue(row, "command_id", "command journal");
      let raw: unknown;
      try {
        raw = JSON.parse(stringValue(row, "payload_json", "command journal"));
      } catch {
        throw new LocalStoreCorruptionError(
          "Command journal contains invalid JSON.",
        );
      }
      const command = CommandEnvelopeSchema.safeParse(raw);
      if (
        !command.success ||
        delivered.get(command.data.commandId) !== undefined
      ) {
        continue;
      }
      pending.push({ command: command.data, outboxEntryId: commandId });
      if (pending.length === limit) break;
    }
    return pending;
  }

  public listUnknownSyncCommands(): readonly PendingSyncCommand[] {
    return this.database
      .prepare(
        "SELECT j.command_id, j.payload_json FROM command_journal j JOIN sync_delivery d ON d.command_id = j.command_id WHERE d.state = 'unknown_reconcile' ORDER BY j.rowid LIMIT 50",
      )
      .all()
      .map((row) => {
        const commandId = stringValue(row, "command_id", "command journal");
        let raw: unknown;
        try {
          raw = JSON.parse(stringValue(row, "payload_json", "command journal"));
        } catch {
          throw new LocalStoreCorruptionError(
            "Command journal contains invalid JSON.",
          );
        }
        return {
          command: CommandEnvelopeSchema.parse(raw),
          outboxEntryId: commandId,
        };
      });
  }

  public retrySyncCommand(commandId: string): void {
    this.database
      .prepare(
        "DELETE FROM sync_delivery WHERE command_id = ? AND state = 'unknown_reconcile'",
      )
      .run(commandId);
  }

  public recordSyncResult(input: {
    readonly commandId: string;
    readonly state: "accepted" | "conflict" | "rejected" | "unknown_reconcile";
    readonly outcome?: unknown;
    readonly updatedAt: string;
  }): void {
    const outcome =
      input.outcome === undefined
        ? undefined
        : CommandOutcomeSchema.parse(input.outcome);
    this.database
      .prepare(
        "INSERT INTO sync_delivery (command_id, state, outcome_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(command_id) DO UPDATE SET state = excluded.state, outcome_json = excluded.outcome_json, updated_at = excluded.updated_at",
      )
      .run(
        input.commandId,
        input.state,
        outcome === undefined ? null : payload(outcome),
        input.updatedAt,
      );
  }

  public updateCoordinationState(input: {
    readonly checkpoint: string;
    readonly snapshotDigest: string;
    readonly syncState: LocalCoordinationState["syncState"];
    readonly updatedAt?: string;
    readonly errorCode?: string;
  }): void {
    const result = this.database
      .prepare(
        "UPDATE coordination_state SET checkpoint = ?, snapshot_digest = ?, sync_state = ?, last_synced_at = ?, last_error_code = ? WHERE singleton = 1",
      )
      .run(
        input.checkpoint,
        input.snapshotDigest,
        input.syncState,
        input.updatedAt ?? null,
        input.errorCode ?? null,
      );
    if (!changed(result)) {
      throw new LocalStoreCorruptionError(
        "Coordination state is not configured.",
      );
    }
  }

  public replaceProjection(
    snapshot: ReferenceStateSnapshot,
    coordination: {
      readonly checkpoint: string;
      readonly snapshotDigest: string;
      readonly syncState: LocalCoordinationState["syncState"];
      readonly updatedAt: string;
    },
  ): void {
    if (
      snapshot.workspaces.length !== 1 ||
      snapshot.workspaces[0] === undefined
    ) {
      throw new LocalStoreCorruptionError(
        "A coordinated projection must contain exactly one workspace.",
      );
    }
    this.transact(() => {
      for (const table of COORDINATED_PROJECTION_TABLES) {
        this.database.exec(`DELETE FROM ${table};`);
      }
      this.insertProjection(snapshot);
      this.updateCoordinationState(coordination);
    });
  }

  /** Seeds a newly-created encrypted store from an already scoped projection. */
  public initializeProjection(snapshot: ReferenceStateSnapshot): void {
    if (
      snapshot.workspaces.length !== 1 ||
      snapshot.workspaces[0] === undefined
    ) {
      throw new LocalStoreCorruptionError(
        "An initial projection must contain exactly one workspace.",
      );
    }
    this.transact(() => {
      const occupied = COORDINATED_PROJECTION_TABLES.some(
        (table) =>
          this.database.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get() !==
          undefined,
      );
      if (occupied || this.getCoordinationState() !== undefined) {
        throw new LocalStoreCorruptionError(
          "An initial projection can only seed an empty store.",
        );
      }
      this.insertProjection(snapshot);
    });
  }

  private insertProjection(snapshot: ReferenceStateSnapshot): void {
    const transaction = new SqliteTransaction(this.database);
    snapshot.workspaces.forEach((value) => transaction.insertWorkspace(value));
    snapshot.spaces.forEach((value) => transaction.insertSpace(value));
    snapshot.memberships.forEach((value) =>
      transaction.insertMembership(value),
    );
    (snapshot.spaceGrants ?? []).forEach((value) =>
      transaction.insertSpaceGrant(value),
    );
    snapshot.taskStatuses.forEach((value) =>
      transaction.insertTaskStatus(value),
    );
    snapshot.captures.forEach((value) => transaction.insertCapture(value));
    snapshot.tasks.forEach((value) => transaction.insertTask(value));
    (snapshot.taskAssignments ?? []).forEach((value) =>
      transaction.insertTaskAssignment(value),
    );
    snapshot.projects.forEach((value) => transaction.insertProject(value));
    (snapshot.documents ?? []).forEach((value) =>
      transaction.insertDocument(value),
    );
    (snapshot.knowledgeSources ?? []).forEach((value) =>
      transaction.insertKnowledgeSource(value),
    );
    (snapshot.namedDocumentVersions ?? []).forEach((value) =>
      transaction.insertNamedDocumentVersion(value),
    );
    (snapshot.strategicRecords ?? []).forEach((value) =>
      transaction.insertStrategicRecord(value),
    );
    (snapshot.comments ?? []).forEach((value) =>
      transaction.insertComment(value),
    );
    (snapshot.attentionSignals ?? []).forEach((value) =>
      transaction.insertAttentionSignal(value),
    );
    snapshot.relations.forEach((value) => transaction.insertRelation(value));
    snapshot.undoDescriptors.forEach((value) =>
      transaction.insertUndoDescriptor(value),
    );
    snapshot.events.forEach((value) => transaction.insertEvent(value));
    snapshot.auditReceipts.forEach((value) =>
      transaction.insertAuditReceipt(value),
    );
    snapshot.idempotencyRecords.forEach((value) =>
      transaction.insertIdempotency(value),
    );
    snapshot.outboxEntries.forEach((value) => transaction.insertOutbox(value));
    (snapshot.agentGrants ?? []).forEach((value) =>
      transaction.insertAgentGrant(value),
    );
    (snapshot.agentRuns ?? []).forEach((value) =>
      transaction.insertAgentRun(value),
    );
    (snapshot.agentCheckpoints ?? []).forEach((value) =>
      transaction.insertAgentCheckpoint(value),
    );
    (snapshot.agentHandoffs ?? []).forEach((value) =>
      transaction.insertAgentHandoff(value),
    );
  }

  public purgeProjection(input: {
    readonly checkpoint: string;
    readonly snapshotDigest: string;
    readonly updatedAt: string;
    readonly errorCode: "device_revoked" | "membership_revoked";
  }): void {
    this.transact(() => {
      this.database.exec("DELETE FROM sync_delivery;");
      this.database.exec("DELETE FROM command_journal;");
      for (const table of COORDINATED_PROJECTION_TABLES) {
        this.database.exec(`DELETE FROM ${table};`);
      }
      this.updateCoordinationState({
        checkpoint: input.checkpoint,
        snapshotDigest: input.snapshotDigest,
        syncState: "revoked",
        updatedAt: input.updatedAt,
        errorCode: input.errorCode,
      });
    });
  }

  public transact<Result>(
    work: (transaction: ApplicationTransaction) => Result,
  ): Result {
    try {
      this.database.exec("BEGIN IMMEDIATE;");
    } catch (error) {
      if (isBusy(error))
        throw new RetryableUnitOfWorkError("The local store is busy.");
      throw error;
    }
    try {
      const result = work(new SqliteTransaction(this.database));
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      try {
        this.database.exec("ROLLBACK;");
      } catch {
        /* Preserve the original failure. */
      }
      if (isBusy(error))
        throw new RetryableUnitOfWorkError("The local store is busy.");
      throw error;
    }
  }
}
