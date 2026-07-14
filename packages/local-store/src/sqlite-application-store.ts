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
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  CommandOutcomeSchema,
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
  type TaskStatusId,
  type WorkspaceId,
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
  TaskProjectRelation,
  TaskStatusDefinition,
  Workspace,
  WorkspaceMembership,
  UndoDescriptor,
} from "@constellation/domain";

import type {
  SqliteDatabase,
  SqliteRunResult,
  SqliteValue,
} from "./sqlite-driver.js";

const SCHEMA_VERSION = 4;
const FRESHNESS: StoreFreshness = {
  mode: "local_authoritative",
  checkpoint: null,
  missingCapabilities: [],
};

const COORDINATED_PROJECTION_TABLES = [
  "outbox_entries",
  "idempotency_records",
  "audit_receipts",
  "events",
  "undo_descriptors",
  "task_project_relations",
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

const numberValue = (row: unknown, key: string, context: string): number => {
  const value = objectValue(row, context)[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new LocalStoreCorruptionError(`${context}.${key} is not an integer.`);
  }
  return value;
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

export class SqliteApplicationStore implements ApplicationStore {
  public constructor(private readonly database: SqliteDatabase) {
    initializeLocalStoreSchema(database);
  }

  public read<Result>(read: (view: ApplicationReadView) => Result): Result {
    return read(new SqliteReadView(this.database));
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
      taskStatuses: records("task_statuses", "id", "id", "task status"),
      captures: records("captures", "id", "id", "capture"),
      tasks: records("tasks", "id", "id", "task"),
      projects: records("projects", "id", "id", "project"),
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
    snapshot.projects.forEach((value) => transaction.insertProject(value));
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
