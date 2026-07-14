import {
  RetryableUnitOfWorkError,
  type ApplicationReadView,
  type ApplicationStore,
  type ApplicationTransaction,
  type ApplicationWave2ReadView,
  type ApplicationWave2Transaction,
  type CapturePageRequest,
  type IdempotencyRecord,
  type StoreFreshness,
  type TaskPageRequest,
} from "@constellation/application";
import {
  PrincipalIdSchema,
  type AuditReceiptId,
  type CaptureId,
  type PrincipalId,
  type ProjectId,
  type RelationId,
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

const SCHEMA_VERSION = 2;
const FRESHNESS: StoreFreshness = {
  mode: "local_authoritative",
  checkpoint: null,
  missingCapabilities: [],
};

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
    return FRESHNESS;
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
