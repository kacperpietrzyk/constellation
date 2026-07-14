import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  ApplicationKernel,
  isApplicationWave2ReadView,
  isApplicationWave2Transaction,
  RetryableUnitOfWorkError,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  ExecutionContextSchema,
  QueryEnvelopeSchema,
  type CaptureId,
  type CommandEnvelope,
  type CommandOutcome,
  type EventId,
  type ExecutionContext,
  type ProjectId,
  type RelationId,
  type TaskId,
} from "@constellation/contracts";
import type { DomainEvent } from "@constellation/domain";
import {
  Base64JsonCursorCodec,
  DeterministicIdGenerator,
  InMemoryAuthorizationPolicy,
  Sha256SemanticHasher,
  TickingClock,
} from "@constellation/testkit";

import {
  LocalStoreCorruptionError,
  SqliteApplicationStore,
  type SqliteDatabase,
} from "../src/index.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  rootSpace: "00000000-0000-4000-8000-000000000002",
  principal: "00000000-0000-4000-8000-000000000003",
  credential: "00000000-0000-4000-8000-000000000004",
  grant: "00000000-0000-4000-8000-000000000005",
} as const;

const context = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.principal,
    principalKind: "human",
    credentialId: ids.credential,
    grantId: ids.grant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.rootSpace],
    capabilityScope: [
      "workspace.createLocal",
      "workspace.rename",
      "workspace.bootstrapContext",
      "capture.submitText",
      "capture.routeAsTask",
      "capture.history",
      "project.create",
      "project.updateOutcome",
      "project.list",
      "project.operationalOverview",
      "task.setStatus",
      "task.complete",
      "task.reopen",
      "task.assign",
      "task.unassign",
      "task.assignmentCandidates",
      "record.relate",
      "record.unrelate",
      "search.global",
      "cockpit.week",
      "activity.meaningful",
      "command.previewUndo",
      "command.undo",
      "recovery.preview",
      "task.list",
      "audit.receipt",
    ],
    origin: "desktop",
  });

const workspaceCommand = CommandEnvelopeSchema.parse({
  contractVersion: 1,
  commandName: "workspace.createLocal",
  commandId: "00000000-0000-4000-8000-000000000010",
  workspaceId: ids.workspace,
  idempotencyKey: "durable-workspace-v1",
  expectedVersions: {},
  correlationId: "00000000-0000-4000-8000-000000000011",
  payload: {
    workspaceId: ids.workspace,
    rootSpaceId: ids.rootSpace,
    ownerPrincipalId: ids.principal,
    name: "Durable synthetic workspace",
    timezone: "Europe/Warsaw",
  },
});

const captureCommand = CommandEnvelopeSchema.parse({
  contractVersion: 1,
  commandName: "capture.submitText",
  commandId: "00000000-0000-4000-8000-000000000012",
  workspaceId: ids.workspace,
  idempotencyKey: "durable-capture-v1",
  expectedVersions: {},
  correlationId: "00000000-0000-4000-8000-000000000013",
  payload: {
    spaceId: ids.rootSpace,
    originalText: "Prepare the restart-safe review",
    deviceId: "synthetic-local-store-test",
    source: "in_app_quick_capture",
  },
});

const sqlitePort = (database: DatabaseSync): SqliteDatabase =>
  database as unknown as SqliteDatabase;

const versionOneSchema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE workspaces (id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE TABLE spaces (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE INDEX spaces_workspace ON spaces(workspace_id, id);
  CREATE TABLE memberships (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), principal_id TEXT NOT NULL, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL, UNIQUE(workspace_id, principal_id)) STRICT;
  CREATE TABLE task_statuses (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), position INTEGER NOT NULL, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE INDEX task_statuses_workspace ON task_statuses(workspace_id, position, id);
  CREATE TABLE captures (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), captured_at TEXT NOT NULL, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE INDEX captures_page ON captures(workspace_id, space_id, captured_at DESC, id DESC);
  CREATE TABLE tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), created_at TEXT NOT NULL, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE INDEX tasks_page ON tasks(workspace_id, space_id, created_at DESC, id DESC);
  CREATE TABLE events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), payload_json TEXT NOT NULL) STRICT;
  CREATE TABLE audit_receipts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), payload_json TEXT NOT NULL) STRICT;
  CREATE TABLE idempotency_records (scope TEXT PRIMARY KEY, payload_json TEXT NOT NULL) STRICT;
  CREATE TABLE outbox_entries (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), event_id TEXT NOT NULL REFERENCES events(id), payload_json TEXT NOT NULL) STRICT;
  PRAGMA user_version = 1;
`;

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome")
    throw new Error("Expected command outcome.");
  return response.outcome;
};

const createKernel = (database: DatabaseSync) => {
  const authorization = new InMemoryAuthorizationPolicy();
  authorization.register(context());
  const store = new SqliteApplicationStore(sqlitePort(database));
  const kernel = new ApplicationKernel({
    authorization,
    clock: new TickingClock(),
    cursorCodec: new Base64JsonCursorCodec(),
    hasher: new Sha256SemanticHasher(),
    ids: new DeterministicIdGenerator(),
    store,
  });
  return { kernel, store };
};

const routeCommand = (captureId: CaptureId): CommandEnvelope =>
  CommandEnvelopeSchema.parse({
    contractVersion: 1,
    commandName: "capture.routeAsTask",
    commandId: "00000000-0000-4000-8000-000000000014",
    workspaceId: ids.workspace,
    idempotencyKey: "durable-route-v1",
    expectedVersions: { [captureId]: 1 },
    correlationId: captureCommand.correlationId,
    payload: { captureId, title: "Prepare the restart-safe review" },
  });

const withDatabase = (run: (filename: string) => void): void => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "constellation-local-store-"),
  );
  try {
    run(path.join(directory, "workspace.db"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

let wave2RequestSequence = 512;
const wave2RequestId = (): string => {
  const suffix = wave2RequestSequence.toString(16).padStart(12, "0");
  wave2RequestSequence += 1;
  return `00000000-0000-4000-8000-${suffix}`;
};

const wave2Command = (
  commandName: CommandEnvelope["commandName"],
  payload: object,
  idempotencyKey: string,
  expectedVersions: Readonly<Record<string, number>> = {},
): CommandEnvelope =>
  CommandEnvelopeSchema.parse({
    contractVersion: 1,
    commandName,
    commandId: wave2RequestId(),
    workspaceId: ids.workspace,
    idempotencyKey,
    expectedVersions,
    correlationId: wave2RequestId(),
    payload,
  });

describe("SQLite ApplicationStore", () => {
  it("maps only SQLite busy failures to a retryable unit of work", () => {
    for (const code of ["SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT"] as const) {
      const database = new DatabaseSync(":memory:");
      const delegated: SqliteDatabase = {
        exec(sql) {
          if (sql === "BEGIN IMMEDIATE;") {
            throw Object.assign(new Error(code), { code });
          }
          database.exec(sql);
        },
        prepare: (sql) => sqlitePort(database).prepare(sql),
      };
      const store = new SqliteApplicationStore(delegated);
      assert.throws(
        () => store.transact(() => undefined),
        RetryableUnitOfWorkError,
      );
      database.close();
    }

    for (const code of [
      "SQLITE_LOCKED",
      "SQLITE_FULL",
      "SQLITE_IOERR",
      "SQLITE_CANTOPEN",
    ] as const) {
      const database = new DatabaseSync(":memory:");
      const failure = Object.assign(new Error(code), { code });
      const delegated: SqliteDatabase = {
        exec(sql) {
          if (sql === "BEGIN IMMEDIATE;") throw failure;
          database.exec(sql);
        },
        prepare: (sql) => sqlitePort(database).prepare(sql),
      };
      const store = new SqliteApplicationStore(delegated);
      assert.throws(
        () => store.transact(() => undefined),
        (error) => {
          assert.equal(error, failure);
          assert.equal(error instanceof RetryableUnitOfWorkError, false);
          return true;
        },
      );
      database.close();
    }
  });

  it("preserves event command attribution across restart", () => {
    withDatabase((filename) => {
      const eventId = "00000000-0000-4000-8000-000000000089" as EventId;
      const firstDatabase = new DatabaseSync(filename);
      const first = createKernel(firstDatabase);
      assert.equal(
        unwrap(first.kernel.execute(context(), workspaceCommand)).outcome,
        "success",
      );
      const attributedEvent: DomainEvent = {
        id: eventId,
        type: "workspace.renamed",
        workspaceId: context().workspaceId,
        spaceId: context().spaceScope[0]!,
        aggregateId: context().workspaceId,
        aggregateVersion: 2,
        occurredAt: "2026-07-13T10:00:00.000Z",
        commandId: workspaceCommand.commandId,
      };
      first.store.transact((transaction) => {
        transaction.insertEvent(attributedEvent);
      });
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(filename);
      const reopened = createKernel(reopenedDatabase);
      reopened.store.read((view) => {
        assert.equal(isApplicationWave2ReadView(view), true);
        if (!isApplicationWave2ReadView(view)) return;
        const restored = view
          .listEvents(context().workspaceId, context().spaceScope[0]!)
          .find((event) => event.id === eventId);
        assert.equal(restored?.commandId, workspaceCommand.commandId);
      });
      reopenedDatabase.close();
    });
  });

  it("migrates a v1 database transactionally and backfills scoped FTS records", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(versionOneSchema);
    const taskId = "00000000-0000-4000-8000-000000000090" as TaskId;
    const createdAt = "2026-07-13T09:00:00.000Z";
    database
      .prepare(
        "INSERT INTO workspaces(id, version, payload_json) VALUES (?, 1, ?)",
      )
      .run(ids.workspace, JSON.stringify({ id: ids.workspace, version: 1 }));
    database
      .prepare(
        "INSERT INTO spaces(id, workspace_id, version, payload_json) VALUES (?, ?, 1, ?)",
      )
      .run(
        ids.rootSpace,
        ids.workspace,
        JSON.stringify({
          id: ids.rootSpace,
          workspaceId: ids.workspace,
          version: 1,
        }),
      );
    database
      .prepare(
        "INSERT INTO tasks(id, workspace_id, space_id, created_at, version, payload_json) VALUES (?, ?, ?, ?, 1, ?)",
      )
      .run(
        taskId,
        ids.workspace,
        ids.rootSpace,
        createdAt,
        JSON.stringify({
          id: taskId,
          workspaceId: ids.workspace,
          spaceId: ids.rootSpace,
          title: "Migrated restart evidence",
          statusId: "00000000-0000-4000-8000-000000000091",
          recordState: "active",
          completionState: "open",
          createdBy: ids.principal,
          version: 1,
          createdAt,
          updatedAt: createdAt,
        }),
      );

    const store = new SqliteApplicationStore(sqlitePort(database));
    assert.deepEqual(
      store
        .read((view) =>
          view.listTasks({
            workspaceId: context().workspaceId,
            spaceId: context().spaceScope[0]!,
            limit: 10,
          }),
        )
        ?.map((task) => task.id),
      [taskId],
    );
    assert.equal(
      (
        database.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
      5,
    );
    assert.equal(
      (
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_assignments'",
          )
          .get() as { count: number }
      ).count,
      1,
    );
    assert.deepEqual(
      (
        database
          .prepare(
            "SELECT record_id FROM work_search WHERE work_search MATCH ? AND workspace_id = ? AND space_id = ?",
          )
          .all("migrated", ids.workspace, ids.rootSpace) as Array<{
          record_id: string;
        }>
      ).map((row) => row.record_id),
      [taskId],
    );
    database.close();
  });

  it("persists Wave 2 Project, status, relation, search, cockpit, activity, and undo semantics", () => {
    withDatabase((filename) => {
      const firstDatabase = new DatabaseSync(filename);
      const first = createKernel(firstDatabase);
      assert.equal(
        unwrap(first.kernel.execute(context(), workspaceCommand)).outcome,
        "success",
      );
      const capture = unwrap(first.kernel.execute(context(), captureCommand));
      if (
        capture.outcome !== "success" ||
        capture.projection.kind !== "capture.stored"
      ) {
        throw new Error("Expected Capture storage.");
      }
      const captureId = capture.projection.captureId;
      const routed = unwrap(
        first.kernel.execute(context(), routeCommand(captureId)),
      );
      if (
        routed.outcome !== "success" ||
        routed.projection.kind !== "capture.routed_as_task"
      ) {
        throw new Error("Expected Capture routing.");
      }
      const taskId = routed.projection.taskId as TaskId;
      const assignmentId = "00000000-0000-4000-8000-000000000089";
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command(
              "task.assign",
              {
                assignmentId,
                taskId,
                assigneePrincipalId: ids.principal,
              },
              "durable-assignment-v5",
              { [taskId]: 1 },
            ),
          ),
        ).diagnosticCode,
        "task.assigned",
      );

      const projectCreate = wave2Command(
        "project.create",
        {
          spaceId: ids.rootSpace,
          title: "Restart-safe alpha",
          intendedOutcome: "A durable operational cockpit",
        },
        "durable-project-v2",
      );
      const created = unwrap(first.kernel.execute(context(), projectCreate));
      if (
        created.outcome !== "success" ||
        created.projection.kind !== "project.created"
      ) {
        throw new Error("Expected Project creation.");
      }
      const projectId = created.projection.projectId as ProjectId;
      const projectUpdate = wave2Command(
        "project.updateOutcome",
        {
          projectId,
          intendedOutcome: "The restart-safe alpha remains explainable",
        },
        "durable-project-outcome-v2",
        { [projectId]: 1 },
      );
      const updated = unwrap(first.kernel.execute(context(), projectUpdate));
      assert.equal(updated.diagnosticCode, "project.outcome_updated");

      const related = unwrap(
        first.kernel.execute(
          context(),
          wave2Command(
            "record.relate",
            {
              relationType: "task_contributes_to_project",
              taskId,
              projectId,
            },
            "durable-relation-v2",
            { [taskId]: 1, [projectId]: 2 },
          ),
        ),
      );
      if (
        related.outcome !== "success" ||
        related.projection.kind !== "relation.created"
      ) {
        throw new Error("Expected relation creation.");
      }
      const relationId = related.projection.relationId as RelationId;

      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command("task.complete", { taskId }, "durable-complete-v2", {
              [taskId]: 1,
            }),
          ),
        ).diagnosticCode,
        "task.completed",
      );
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command("task.reopen", { taskId }, "durable-reopen-v2", {
              [taskId]: 2,
            }),
          ),
        ).diagnosticCode,
        "task.reopened",
      );

      const ftsRows = firstDatabase
        .prepare(
          "SELECT record_kind, record_id FROM work_search WHERE work_search MATCH ? AND workspace_id = ? AND space_id = ? ORDER BY record_kind",
        )
        .all("restart*", ids.workspace, ids.rootSpace) as Array<{
        record_kind: string;
        record_id: string;
      }>;
      assert.deepEqual(
        ftsRows.map((row) => row.record_kind),
        ["capture", "project", "task"],
      );
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(filename);
      const reopened = createKernel(reopenedDatabase);
      assert.equal(
        reopened.store.snapshot().taskAssignments?.[0]?.id,
        assignmentId,
      );
      const projects = reopened.kernel.query(
        context(),
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName: "project.list",
          queryId: wave2RequestId(),
          workspaceId: ids.workspace,
          consistency: "local_authoritative",
          parameters: { spaceId: ids.rootSpace },
        }),
      );
      if (
        projects.kind !== "query_result" ||
        projects.result.outcome !== "success" ||
        projects.result.projection.kind !== "project.list"
      ) {
        throw new Error("Expected Project list after restart.");
      }
      assert.equal(projects.result.projection.items[0]?.id, projectId);
      assert.equal(
        projects.result.projection.items[0]?.relatedOpenTaskCount,
        1,
      );

      for (const [queryName, parameters, projectionKind] of [
        [
          "search.global",
          { spaceIds: [ids.rootSpace], text: "restart" },
          "search.global",
        ],
        [
          "cockpit.week",
          { spaceId: ids.rootSpace, weekStart: "2026-07-06" },
          "cockpit.week",
        ],
        [
          "activity.meaningful",
          { spaceId: ids.rootSpace },
          "activity.meaningful",
        ],
        [
          "recovery.preview",
          { targetCommandId: projectUpdate.commandId },
          "recovery.preview",
        ],
      ] as const) {
        const response = reopened.kernel.query(
          context(),
          QueryEnvelopeSchema.parse({
            contractVersion: 1,
            queryName,
            queryId: wave2RequestId(),
            workspaceId: ids.workspace,
            consistency: "local_authoritative",
            parameters,
          }),
        );
        assert.equal(response.kind, "query_result", queryName);
        if (response.kind !== "query_result") continue;
        assert.equal(response.result.outcome, "success", queryName);
        if (response.result.outcome !== "success") continue;
        assert.equal(
          response.result.projection.kind,
          projectionKind,
          queryName,
        );
        if (response.result.projection.kind === "search.global") {
          assert.ok(response.result.projection.items.length >= 2);
        }
        if (response.result.projection.kind === "cockpit.week") {
          assert.equal(response.result.projection.focus[0]?.taskId, taskId);
          assert.equal(
            response.result.projection.focus[0]?.relatedProjectId,
            projectId,
          );
        }
        if (response.result.projection.kind === "activity.meaningful") {
          assert.ok(response.result.projection.items.length >= 5);
        }
        if (response.result.projection.kind === "recovery.preview") {
          assert.equal(response.result.projection.available, true);
        }
      }

      assert.deepEqual(
        unwrap(reopened.kernel.execute(context(), projectUpdate)),
        updated,
      );
      const undone = unwrap(
        reopened.kernel.execute(
          context(),
          wave2Command(
            "command.undo",
            { targetCommandId: projectUpdate.commandId },
            "durable-undo-v2",
            { [projectId]: 2 },
          ),
        ),
      );
      assert.equal(undone.diagnosticCode, "command.undone");
      reopened.store.read((view) => {
        assert.equal(isApplicationWave2ReadView(view), true);
        if (!isApplicationWave2ReadView(view)) return;
        assert.equal(
          view.getProject(projectId)?.intendedOutcome,
          "A durable operational cockpit",
        );
        assert.equal(view.getRelation(relationId)?.state, "active");
      });
      reopenedDatabase.close();
    });
  });

  it("survives close and reopen with Capture, Task, provenance, audit, and idempotency", () => {
    withDatabase((filename) => {
      const firstDatabase = new DatabaseSync(filename);
      const first = createKernel(firstDatabase);
      assert.equal(
        unwrap(first.kernel.execute(context(), workspaceCommand)).outcome,
        "success",
      );
      const captureOutcome = unwrap(
        first.kernel.execute(context(), captureCommand),
      );
      assert.equal(captureOutcome.outcome, "success");
      if (
        captureOutcome.outcome !== "success" ||
        captureOutcome.projection.kind !== "capture.stored"
      ) {
        throw new Error("Expected Capture storage.");
      }
      const captureId = captureOutcome.projection.captureId;
      const routed = unwrap(
        first.kernel.execute(context(), routeCommand(captureId)),
      );
      assert.equal(routed.outcome, "success");
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(filename);
      const reopened = createKernel(reopenedDatabase);
      const tasks = reopened.kernel.query(
        context(),
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName: "task.list",
          queryId: "00000000-0000-4000-8000-000000000020",
          workspaceId: ids.workspace,
          consistency: "local_authoritative",
          parameters: { spaceId: ids.rootSpace, limit: 20 },
        }),
      );
      assert.equal(tasks.kind, "query_result");
      if (tasks.kind !== "query_result" || tasks.result.outcome !== "success") {
        throw new Error("Expected Task query success.");
      }
      assert.equal(tasks.result.projection.kind, "task.list");
      if (tasks.result.projection.kind !== "task.list")
        throw new Error("Expected Task list.");
      assert.equal(tasks.result.projection.items.length, 1);
      assert.equal(
        tasks.result.projection.items[0]?.sourceCaptureId,
        captureId,
      );

      const replay = unwrap(reopened.kernel.execute(context(), captureCommand));
      assert.deepEqual(replay, captureOutcome);
      const capture = reopened.store.read((view) => view.getCapture(captureId));
      assert.equal(capture?.processingState, "routed_as_task");
      reopenedDatabase.close();
    });
  });

  it("rolls back every write when work throws", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const syntheticCapture = {
      id: "00000000-0000-4000-8000-000000000099" as CaptureId,
      workspaceId: context().workspaceId,
      spaceId: context().spaceScope[0]!,
      originalText: "Must roll back",
      deviceId: "synthetic-local-store-test",
      source: "in_app_quick_capture" as const,
      capturedAt: "2026-07-13T20:00:00.000Z",
      submittedBy: context().principalId,
      processingState: "pending_processing" as const,
      version: 1,
    };
    assert.throws(
      () =>
        store.transact((transaction) => {
          transaction.insertCapture(syntheticCapture);
          throw new Error("injected failure");
        }),
      /injected failure/,
    );
    assert.equal(
      store.read((view) => view.getCapture(syntheticCapture.id)),
      undefined,
    );
    database.close();
  });

  it("rolls back Wave 2 writes and fails closed on corrupt Project scope", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const projectId = "00000000-0000-4000-8000-000000000098" as ProjectId;
    const project = {
      id: projectId,
      workspaceId: context().workspaceId,
      spaceId: context().spaceScope[0]!,
      title: "Atomic Project",
      intendedOutcome: "No partial Wave 2 state",
      lifecycle: "active" as const,
      createdBy: context().principalId,
      version: 1,
      createdAt: "2026-07-13T20:00:00.000Z",
      updatedAt: "2026-07-13T20:00:00.000Z",
    };
    assert.throws(
      () =>
        store.transact((transaction) => {
          assert.equal(isApplicationWave2Transaction(transaction), true);
          if (!isApplicationWave2Transaction(transaction)) return;
          transaction.insertProject(project);
          throw new Error("injected Wave 2 failure");
        }),
      /injected Wave 2 failure/,
    );
    store.read((view) => {
      assert.equal(isApplicationWave2ReadView(view), true);
      if (!isApplicationWave2ReadView(view)) return;
      assert.equal(view.getProject(projectId), undefined);
    });

    store.transact((transaction) => {
      assert.equal(isApplicationWave2Transaction(transaction), true);
      if (!isApplicationWave2Transaction(transaction)) return;
      transaction.insertProject(project);
    });
    const row = database
      .prepare("SELECT payload_json FROM projects WHERE id = ?")
      .get(projectId) as { payload_json: string };
    database.prepare("UPDATE projects SET payload_json = ? WHERE id = ?").run(
      JSON.stringify({
        ...(JSON.parse(row.payload_json) as Record<string, unknown>),
        spaceId: "00000000-0000-4000-8000-000000000999",
      }),
      projectId,
    );
    assert.throws(
      () =>
        store.read((view) => {
          assert.equal(isApplicationWave2ReadView(view), true);
          return isApplicationWave2ReadView(view)
            ? view.getProject(projectId)
            : undefined;
        }),
      LocalStoreCorruptionError,
    );
    database.close();
  });

  it("fails closed on corrupt persisted payloads", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    database
      .prepare("UPDATE workspaces SET payload_json = ? WHERE id = ?")
      .run("{not-json", ids.workspace);
    assert.throws(
      () => store.read((view) => view.getWorkspace(context().workspaceId)),
      LocalStoreCorruptionError,
    );
    database.close();
  });

  it("fails closed when payload scope disagrees with indexed columns", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const stored = unwrap(kernel.execute(context(), captureCommand));
    assert.equal(stored.outcome, "success");
    if (
      stored.outcome !== "success" ||
      stored.projection.kind !== "capture.stored"
    ) {
      throw new Error("Expected Capture storage.");
    }
    const captureId = stored.projection.captureId;
    const row = database
      .prepare("SELECT payload_json FROM captures WHERE id = ?")
      .get(captureId) as { payload_json: string };
    const changed = {
      ...(JSON.parse(row.payload_json) as Record<string, unknown>),
      workspaceId: "00000000-0000-4000-8000-000000000999",
    };
    database
      .prepare("UPDATE captures SET payload_json = ? WHERE id = ?")
      .run(JSON.stringify(changed), captureId);
    assert.throws(
      () => store.read((view) => view.getCapture(captureId)),
      LocalStoreCorruptionError,
    );
    database.close();
  });

  it("keeps a recoverable command outbox and atomically replaces a coordinated projection", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    assert.equal(
      unwrap(kernel.execute(context(), captureCommand)).outcome,
      "success",
    );
    const authoritative = store.snapshot();
    store.configureCoordination({
      workspaceId: context().workspaceId,
      providerInstanceId: "constellation.hub:test",
      hubOrigin: "https://hub.example.test",
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      configuredAt: "2026-07-14T12:00:00.000Z",
    });
    assert.equal(store.listPendingSyncCommands().length, 0);

    const rename = CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "workspace.rename",
      commandId: "00000000-0000-4000-8000-000000000099",
      workspaceId: ids.workspace,
      idempotencyKey: "offline-rename",
      expectedVersions: { [ids.workspace]: 1 },
      correlationId: "00000000-0000-4000-8000-000000000098",
      payload: { name: "Optimistic offline name" },
    });
    assert.equal(unwrap(kernel.execute(context(), rename)).outcome, "success");
    const pending = store.listPendingSyncCommands();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.command.commandId, rename.commandId);
    store.recordSyncResult({
      commandId: rename.commandId,
      state: "conflict",
      outcome: {
        contractVersion: 1,
        commandId: rename.commandId,
        correlationId: rename.correlationId,
        kernelTime: "2026-07-14T12:01:00.000Z",
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: { [ids.workspace]: 2 },
      },
      updatedAt: "2026-07-14T12:01:00.000Z",
    });
    assert.equal(store.listPendingSyncCommands().length, 0);
    store.replaceProjection(authoritative, {
      checkpoint: "2",
      snapshotDigest: "b".repeat(64),
      syncState: "conflict",
      updatedAt: "2026-07-14T12:01:00.000Z",
    });
    assert.equal(
      store.read((view) => view.getWorkspace(context().workspaceId)?.name),
      "Durable synthetic workspace",
    );
    assert.deepEqual(
      store.read((view) => view.getFreshness()),
      {
        mode: "local_projection",
        checkpoint: "2",
        missingCapabilities: ["hub.conflict"],
      },
    );
    assert.equal(store.getCoordinationState()?.syncState, "conflict");
    database.close();
  });

  it("atomically purges coordinated records, FTS, and queued commands after access revocation", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    assert.equal(
      unwrap(kernel.execute(context(), captureCommand)).outcome,
      "success",
    );
    store.configureCoordination({
      workspaceId: context().workspaceId,
      providerInstanceId: "constellation.hub:purge-test",
      hubOrigin: "https://hub.example.test",
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      configuredAt: "2026-07-14T12:00:00.000Z",
    });
    const rename = CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "workspace.rename",
      commandId: "00000000-0000-4000-8000-000000000097",
      workspaceId: ids.workspace,
      idempotencyKey: "queued-before-revocation",
      expectedVersions: { [ids.workspace]: 1 },
      correlationId: "00000000-0000-4000-8000-000000000096",
      payload: { name: "Must be purged" },
    });
    assert.equal(unwrap(kernel.execute(context(), rename)).outcome, "success");
    assert.equal(store.listPendingSyncCommands().length, 1);

    database.exec(`
      CREATE TRIGGER fail_purge BEFORE DELETE ON captures BEGIN
        SELECT RAISE(ABORT, 'synthetic purge failure');
      END;
    `);
    assert.throws(() =>
      store.purgeProjection({
        checkpoint: "1",
        snapshotDigest: "a".repeat(64),
        updatedAt: "2026-07-14T12:01:00.000Z",
        errorCode: "membership_revoked",
      }),
    );
    assert.equal(store.snapshot().captures.length, 1);
    assert.equal(store.listPendingSyncCommands().length, 1);
    assert.equal(store.getCoordinationState()?.syncState, "current");

    database.exec("DROP TRIGGER fail_purge;");
    store.purgeProjection({
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      updatedAt: "2026-07-14T12:02:00.000Z",
      errorCode: "membership_revoked",
    });
    const purged = store.snapshot();
    assert.equal(purged.workspaces.length, 0);
    assert.equal(purged.memberships.length, 0);
    assert.equal(purged.captures.length, 0);
    assert.equal(purged.tasks.length, 0);
    assert.equal(store.listPendingSyncCommands().length, 0);
    assert.equal(
      (
        database.prepare("SELECT count(*) AS count FROM work_search").get() as {
          count: number;
        }
      ).count,
      0,
    );
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS count FROM command_journal")
          .get() as { count: number }
      ).count,
      0,
    );
    assert.deepEqual(store.getCoordinationState(), {
      workspaceId: ids.workspace,
      providerInstanceId: "constellation.hub:purge-test",
      hubOrigin: "https://hub.example.test",
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      syncState: "revoked",
      lastSyncedAt: "2026-07-14T12:02:00.000Z",
      lastErrorCode: "membership_revoked",
    });
    database.close();
  });
});
