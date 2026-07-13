import {
  RetryableUnitOfWorkError,
  type ApplicationReadView,
  type ApplicationStore,
  type ApplicationTransaction,
  type CapturePageRequest,
  type IdempotencyRecord,
  type StoreFreshness,
  type TaskPageRequest,
} from "@constellation/application";
import type {
  AuditReceiptId,
  CaptureId,
  PrincipalId,
  SpaceId,
  TaskId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";
import type {
  AuditReceipt,
  Capture,
  DomainEvent,
  OutboxEntry,
  Space,
  Task,
  TaskStatusDefinition,
  Workspace,
  WorkspaceMembership,
} from "@constellation/domain";

import type {
  SqliteDatabase,
  SqliteRunResult,
  SqliteValue,
} from "./sqlite-driver.js";

const SCHEMA_VERSION = 1;
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

const schema = `
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
  key: "id" | "scope",
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
    database.exec(schema);
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

class SqliteReadView implements ApplicationReadView {
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

  public listTasks(request: TaskPageRequest): readonly Task[] | undefined {
    return this.listPage<Task>("tasks", "created_at", request, "task");
  }

  public getAuditReceipt(id: AuditReceiptId): AuditReceipt | undefined {
    const row = this.database
      .prepare(
        "SELECT workspace_id, space_id, payload_json FROM audit_receipts WHERE id = ?",
      )
      .get(id);
    return row === undefined
      ? undefined
      : parsePayload<AuditReceipt>(row, "id", id, "audit receipt", {
          workspaceId: stringValue(row, "workspace_id", "audit receipt"),
          spaceId: stringValue(row, "space_id", "audit receipt"),
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
    let cursorWhere = "";
    if (request.after !== undefined) {
      const cursor = this.database
        .prepare(
          `SELECT 1 AS present FROM ${table} WHERE id = ? AND workspace_id = ? AND space_id = ? AND ${orderedColumn} = ?`,
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
        `SELECT id, payload_json FROM ${table} WHERE workspace_id = ? AND space_id = ?${cursorWhere} ORDER BY ${orderedColumn} DESC, id DESC LIMIT ?`,
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
  implements ApplicationTransaction
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
        "version",
        "payload_json",
      ],
      [
        record.id,
        record.workspaceId,
        record.spaceId,
        record.createdAt,
        record.version,
        payload(record),
      ],
    );
  }
  public insertEvent(record: DomainEvent): void {
    this.insert(
      "events",
      ["id", "workspace_id", "space_id", "payload_json"],
      [record.id, record.workspaceId, record.spaceId, payload(record)],
    );
  }
  public insertAuditReceipt(record: AuditReceipt): void {
    this.insert(
      "audit_receipts",
      ["id", "workspace_id", "space_id", "payload_json"],
      [record.id, record.workspaceId, record.spaceId, payload(record)],
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
