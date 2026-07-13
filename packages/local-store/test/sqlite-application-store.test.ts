import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  ApplicationKernel,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  ExecutionContextSchema,
  QueryEnvelopeSchema,
  type CaptureId,
  type CommandEnvelope,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";
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

describe("SQLite ApplicationStore", () => {
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
});
