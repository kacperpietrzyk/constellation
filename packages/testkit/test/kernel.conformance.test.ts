import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  AgentRunIdSchema,
  CheckpointIdSchema,
  ExecutionContextSchema,
  type CaptureId,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import {
  createReferenceHarness,
  type FailureBoundary,
  type ReferenceHarness,
} from "../src/index.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  rootSpace: "00000000-0000-4000-8000-000000000002",
  principal: "00000000-0000-4000-8000-000000000003",
  otherPrincipal: "00000000-0000-4000-8000-000000000004",
  credential: "00000000-0000-4000-8000-000000000005",
  grant: "00000000-0000-4000-8000-000000000006",
} as const;

let requestSequence = 32;
const requestId = (): string => {
  const suffix = requestSequence.toString(16).padStart(12, "0");
  requestSequence += 1;
  return `00000000-0000-4000-8000-${suffix}`;
};

const context = (principalId: string = ids.principal): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId,
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

const commandMetadata = (idempotencyKey: string) => ({
  contractVersion: 1,
  commandId: requestId(),
  workspaceId: ids.workspace,
  idempotencyKey,
  expectedVersions: {},
  correlationId: requestId(),
});

const workspaceCommand = () => ({
  ...commandMetadata("workspace-bootstrap"),
  commandName: "workspace.createLocal",
  payload: {
    workspaceId: ids.workspace,
    rootSpaceId: ids.rootSpace,
    ownerPrincipalId: ids.principal,
    name: "Synthetic workspace",
    timezone: "Europe/Warsaw",
  },
});

const captureCommand = (idempotencyKey: string, originalText: string) => ({
  ...commandMetadata(idempotencyKey),
  commandName: "capture.submitText",
  payload: {
    spaceId: ids.rootSpace,
    originalText,
    deviceId: "synthetic-test-device",
    source: "global_quick_capture",
  },
});

const routeCommand = (
  captureId: string,
  idempotencyKey: string,
  title: string,
  expectedVersion = 1,
) => ({
  ...commandMetadata(idempotencyKey),
  commandName: "capture.routeAsTask",
  expectedVersions: { [captureId]: expectedVersion },
  payload: { captureId, title },
});

const unwrapOutcome = (
  response: ApplicationCommandResponse,
): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome") {
    throw new Error("Expected a command outcome.");
  }
  return response.outcome;
};

const bootstrappedHarness = (): ReferenceHarness => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const outcome = unwrapOutcome(
    harness.kernel.execute(context(), workspaceCommand()),
  );
  assert.equal(outcome.outcome, "success");
  return harness;
};

const submitCaptureAndGetId = (
  harness: ReferenceHarness,
  idempotencyKey: string,
  originalText: string,
): CaptureId => {
  const outcome = unwrapOutcome(
    harness.kernel.execute(
      context(),
      captureCommand(idempotencyKey, originalText),
    ),
  );
  assert.equal(outcome.outcome, "success");
  if (
    outcome.outcome !== "success" ||
    outcome.projection.kind !== "capture.stored"
  ) {
    throw new Error("Expected a stored capture projection.");
  }
  return outcome.projection.captureId;
};

const captureCounts = (harness: ReferenceHarness) => {
  const snapshot = harness.store.snapshot();
  return {
    captures: snapshot.captures.length,
    events: snapshot.events.length,
    audits: snapshot.auditReceipts.length,
    idempotency: snapshot.idempotencyRecords.length,
    outbox: snapshot.outboxEntries.length,
  };
};

const routeCounts = (harness: ReferenceHarness) => {
  const snapshot = harness.store.snapshot();
  return {
    captures: snapshot.captures.length,
    tasks: snapshot.tasks.length,
    events: snapshot.events.length,
    audits: snapshot.auditReceipts.length,
    idempotency: snapshot.idempotencyRecords.length,
    outbox: snapshot.outboxEntries.length,
  };
};

describe("reference kernel conformance", () => {
  it("creates a general workspace boundary and exposes bootstrap context", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context());
    const outcome = unwrapOutcome(
      harness.kernel.execute(context(), workspaceCommand()),
    );
    assert.equal(outcome.outcome, "success");
    assert.equal(outcome.diagnosticCode, "workspace.created");

    const snapshot = harness.store.snapshot();
    assert.equal(snapshot.workspaces.length, 1);
    assert.equal(snapshot.spaces.length, 1);
    assert.equal(snapshot.memberships.length, 1);
    assert.equal(snapshot.taskStatuses.length, 1);
    assert.equal(snapshot.taskStatuses[0]?.label, "To do");
    assert.equal(snapshot.taskStatuses[0]?.operationalSemantics, "actionable");
    assert.equal(snapshot.tasks.length, 0);
    assert.equal(snapshot.events.length, 1);
    assert.equal(snapshot.auditReceipts.length, 1);
    assert.equal(snapshot.idempotencyRecords.length, 1);
    assert.equal(snapshot.outboxEntries.length, 1);

    const response = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "workspace.bootstrapContext",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {},
    });
    assert.equal(response.kind, "query_result");
    if (response.kind === "query_result") {
      assert.equal(response.result.outcome, "success");
      if (response.result.outcome === "success") {
        assert.equal(
          response.result.projection.kind,
          "workspace.bootstrapContext",
        );
        if (response.result.projection.kind === "workspace.bootstrapContext") {
          assert.equal(response.result.projection.taskStatuses.length, 1);
          assert.equal(
            response.result.projection.workspace.defaultTaskStatusId,
            snapshot.taskStatuses[0]?.id,
          );
        }
      }
    }
  });

  it("commits capture original, event, audit, idempotency, and outbox together", () => {
    const harness = bootstrappedHarness();
    const originalText = "Prepare a synthetic project brief";
    const outcome = unwrapOutcome(
      harness.kernel.execute(
        context(),
        captureCommand("capture-atomic", originalText),
      ),
    );
    assert.equal(outcome.outcome, "success");
    assert.equal(outcome.diagnosticCode, "capture.stored");

    const snapshot = harness.store.snapshot();
    assert.equal(snapshot.captures.at(-1)?.originalText, originalText);
    assert.equal(snapshot.events.at(-1)?.type, "capture.submitted");
    assert.deepEqual(snapshot.auditReceipts.at(-1)?.changedFields, [
      "originalText",
      "deviceId",
      "source",
      "processingState",
    ]);
    assert.deepEqual(snapshot.auditReceipts.at(-1)?.recordVersions, {
      [snapshot.captures.at(-1)?.id ?? "missing"]: 1,
    });
    assert.equal(
      snapshot.outboxEntries.at(-1)?.topic,
      "capture.processing.requested",
    );
    assert.equal(
      JSON.stringify(snapshot.auditReceipts).includes(originalText),
      false,
    );
    assert.equal(JSON.stringify(snapshot.events).includes(originalText), false);
    assert.equal(
      JSON.stringify(snapshot.outboxEntries).includes(originalText),
      false,
    );

    if (outcome.outcome !== "success") {
      throw new Error("Expected capture success.");
    }
    const auditResponse = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "audit.receipt",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { receiptId: outcome.auditReceiptId },
    });
    assert.equal(auditResponse.kind, "query_result");
    if (
      auditResponse.kind === "query_result" &&
      auditResponse.result.outcome === "success" &&
      auditResponse.result.projection.kind === "audit.receipt"
    ) {
      assert.equal(
        auditResponse.result.projection.receipt.commandId,
        outcome.commandId,
      );
      assert.equal(
        JSON.stringify(auditResponse.result.projection).includes(originalText),
        false,
      );
    }
  });

  it("routes a capture to one canonical standalone Task without losing provenance", () => {
    const harness = bootstrappedHarness();
    const empty = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (
      empty.kind !== "query_result" ||
      empty.result.outcome !== "success" ||
      empty.result.projection.kind !== "task.list"
    ) {
      throw new Error("Expected an empty Task list.");
    }
    assert.deepEqual(empty.result.projection.items, []);

    const originalText = "PRIVATE_CAPTURE_BODY_MUST_STAY_IN_SOURCE";
    const captureId = submitCaptureAndGetId(
      harness,
      "route-source",
      originalText,
    );
    const outcome = unwrapOutcome(
      harness.kernel.execute(
        context(),
        routeCommand(
          captureId,
          "route-happy",
          "Prepare the synthetic project brief",
        ),
      ),
    );
    assert.equal(outcome.outcome, "success");
    assert.equal(outcome.diagnosticCode, "capture.routed_as_task");
    if (
      outcome.outcome !== "success" ||
      outcome.projection.kind !== "capture.routed_as_task"
    ) {
      throw new Error("Expected a routed Task projection.");
    }

    const snapshot = harness.store.snapshot();
    const capture = snapshot.captures.find((item) => item.id === captureId);
    const task = snapshot.tasks.find(
      (item) => item.id === outcome.projection.taskId,
    );
    assert.equal(capture?.originalText, originalText);
    assert.equal(capture?.processingState, "routed_as_task");
    assert.equal(capture?.version, 2);
    if (capture?.processingState === "routed_as_task") {
      assert.equal(capture.derivedTaskId, task?.id);
      assert.equal(capture.routedBy, ids.principal);
    }
    assert.equal(task?.sourceCaptureId, captureId);
    assert.equal(task?.title, "Prepare the synthetic project brief");
    assert.equal(task?.statusId, snapshot.taskStatuses[0]?.id);
    assert.equal(task?.version, 1);
    assert.equal(snapshot.events.at(-1)?.type, "capture.routed_as_task");
    assert.equal(
      snapshot.outboxEntries.at(-1)?.topic,
      "work.projection.requested",
    );
    assert.deepEqual(snapshot.auditReceipts.at(-1)?.recordVersions, {
      [captureId]: 2,
      [task?.id ?? "missing"]: 1,
    });
    assert.equal(JSON.stringify(snapshot.events).includes(originalText), false);
    assert.equal(
      JSON.stringify(snapshot.auditReceipts).includes(originalText),
      false,
    );
    assert.equal(
      JSON.stringify(snapshot.outboxEntries).includes(originalText),
      false,
    );

    const history = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "capture.history",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (
      history.kind !== "query_result" ||
      history.result.outcome !== "success" ||
      history.result.projection.kind !== "capture.history"
    ) {
      throw new Error("Expected Capture History after routing.");
    }
    const historyItem = history.result.projection.items[0];
    assert.equal(historyItem?.originalText, originalText);
    assert.equal(historyItem?.processingState, "routed_as_task");
    if (historyItem?.processingState === "routed_as_task") {
      assert.equal(historyItem.derivedTaskId, task?.id);
      assert.equal(historyItem.routedBy, ids.principal);
    }

    const tasks = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (
      tasks.kind !== "query_result" ||
      tasks.result.outcome !== "success" ||
      tasks.result.projection.kind !== "task.list"
    ) {
      throw new Error("Expected the routed Task list.");
    }
    assert.equal(tasks.result.projection.items.length, 1);
    assert.deepEqual(tasks.result.projection.items[0]?.status, {
      id: snapshot.taskStatuses[0]?.id,
      label: "To do",
      operationalSemantics: "actionable",
    });
    assert.equal(tasks.result.projection.items[0]?.sourceCaptureId, captureId);
  });

  it("replays routing without duplicate Task churn and reauthorizes every replay", () => {
    const harness = bootstrappedHarness();
    const captureId = submitCaptureAndGetId(
      harness,
      "route-replay-source",
      "Replay-safe route source",
    );
    const command = routeCommand(captureId, "route-replay", "Replay-safe Task");
    const original = unwrapOutcome(harness.kernel.execute(context(), command));
    assert.equal(original.outcome, "success");
    const before = routeCounts(harness);

    const changedInput = unwrapOutcome(
      harness.kernel.execute(context(), {
        ...command,
        commandId: requestId(),
        correlationId: requestId(),
        payload: { ...command.payload, title: "Changed replay title" },
      }),
    );
    assert.equal(changedInput.outcome, "conflict");
    assert.equal(changedInput.diagnosticCode, "idempotency.key_reused");
    assert.deepEqual(routeCounts(harness), before);

    for (let replay = 0; replay < 10; replay += 1) {
      const repeated = unwrapOutcome(
        harness.kernel.execute(context(), {
          ...command,
          commandId: requestId(),
          correlationId: requestId(),
        }),
      );
      assert.deepEqual(repeated, original);
    }
    assert.deepEqual(routeCounts(harness), before);

    harness.authorization.revoke(context().grantId);
    const revoked = unwrapOutcome(
      harness.kernel.execute(context(), {
        ...command,
        commandId: requestId(),
        correlationId: requestId(),
      }),
    );
    assert.equal(revoked.outcome, "rejected");
    assert.equal(revoked.diagnosticCode, "authorization.denied");

    const rotatedContext = ExecutionContextSchema.parse({
      ...context(),
      credentialId: "00000000-0000-4000-8000-000000000014",
      grantId: "00000000-0000-4000-8000-000000000015",
    });
    harness.authorization.register(rotatedContext);
    const rotated = unwrapOutcome(
      harness.kernel.execute(rotatedContext, {
        ...command,
        commandId: requestId(),
        correlationId: requestId(),
      }),
    );
    assert.deepEqual(rotated, original);
    assert.deepEqual(routeCounts(harness), before);
  });

  it("requires an exact Capture version and rejects a second route explicitly", () => {
    const harness = bootstrappedHarness();
    const captureId = submitCaptureAndGetId(
      harness,
      "route-conflict-source",
      "Conflict source",
    );
    const missingPrecondition = unwrapOutcome(
      harness.kernel.execute(context(), {
        ...routeCommand(captureId, "route-no-version", "No version"),
        expectedVersions: {},
      }),
    );
    assert.equal(missingPrecondition.outcome, "rejected");
    assert.equal(
      missingPrecondition.diagnosticCode,
      "command.precondition_failed",
    );

    const first = unwrapOutcome(
      harness.kernel.execute(
        context(),
        routeCommand(captureId, "route-first", "First route"),
      ),
    );
    assert.equal(first.outcome, "success");
    const before = routeCounts(harness);

    const stale = unwrapOutcome(
      harness.kernel.execute(
        context(),
        routeCommand(captureId, "route-stale", "Stale route", 1),
      ),
    );
    assert.equal(stale.outcome, "conflict");
    assert.equal(stale.diagnosticCode, "record.version_conflict");

    const alreadyRouted = unwrapOutcome(
      harness.kernel.execute(
        context(),
        routeCommand(captureId, "route-twice", "Second route", 2),
      ),
    );
    assert.equal(alreadyRouted.outcome, "conflict");
    assert.equal(alreadyRouted.diagnosticCode, "capture.already_routed");
    assert.deepEqual(routeCounts(harness), before);
  });

  it("returns the original durable outcome for identical replay without churn", () => {
    const harness = bootstrappedHarness();
    const command = captureCommand(
      "capture-replay",
      "Replay-safe synthetic body",
    );
    const original = unwrapOutcome(harness.kernel.execute(context(), command));
    const before = captureCounts(harness);

    for (let replay = 0; replay < 10; replay += 1) {
      const repeated = unwrapOutcome(
        harness.kernel.execute(context(), {
          ...command,
          commandId: requestId(),
          correlationId: requestId(),
        }),
      );
      assert.deepEqual(repeated, original);
    }
    assert.deepEqual(captureCounts(harness), before);
  });

  it("reauthorizes an idempotent replay before returning its original outcome", () => {
    const harness = bootstrappedHarness();
    const command = captureCommand(
      "capture-reauthorize",
      "Synthetic authorization-sensitive body",
    );
    assert.equal(
      unwrapOutcome(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
    harness.authorization.revoke(context().grantId);

    const replay = unwrapOutcome(
      harness.kernel.execute(context(), {
        ...command,
        commandId: requestId(),
        correlationId: requestId(),
      }),
    );
    assert.equal(replay.outcome, "rejected");
    assert.equal(replay.diagnosticCode, "authorization.denied");
  });

  it("preserves idempotency across an authorized credential rotation", () => {
    const harness = bootstrappedHarness();
    const command = captureCommand(
      "capture-credential-rotation",
      "Credential-rotation synthetic body",
    );
    const original = unwrapOutcome(harness.kernel.execute(context(), command));
    assert.equal(original.outcome, "success");
    harness.authorization.revoke(context().grantId);
    const rotatedContext = ExecutionContextSchema.parse({
      ...context(),
      credentialId: "00000000-0000-4000-8000-000000000014",
      grantId: "00000000-0000-4000-8000-000000000015",
    });
    harness.authorization.register(rotatedContext);

    const replay = unwrapOutcome(
      harness.kernel.execute(rotatedContext, {
        ...command,
        commandId: requestId(),
        correlationId: requestId(),
      }),
    );
    assert.deepEqual(replay, original);
  });

  it("rejects a reused idempotency key with different semantic input", () => {
    const harness = bootstrappedHarness();
    const original = captureCommand(
      "capture-conflict",
      "Original synthetic body",
    );
    assert.equal(
      unwrapOutcome(harness.kernel.execute(context(), original)).outcome,
      "success",
    );
    const before = captureCounts(harness);

    const conflict = unwrapOutcome(
      harness.kernel.execute(
        context(),
        captureCommand("capture-conflict", "Different synthetic body"),
      ),
    );
    assert.equal(conflict.outcome, "conflict");
    assert.equal(conflict.diagnosticCode, "idempotency.key_reused");
    assert.deepEqual(captureCounts(harness), before);
    assert.equal(
      harness.store.snapshot().captures.at(-1)?.originalText,
      "Original synthetic body",
    );
  });

  it("treats checkpoint membership as idempotency-significant", () => {
    const harness = bootstrappedHarness();
    const firstCheckpointId = CheckpointIdSchema.parse(requestId());
    const secondCheckpointId = CheckpointIdSchema.parse(requestId());
    const now = "2026-07-14T10:00:00.000+00:00";
    for (const checkpointId of [firstCheckpointId, secondCheckpointId]) {
      harness.store.transact((transaction) =>
        transaction.insertAgentCheckpoint({
          id: checkpointId,
          workspaceId: context().workspaceId,
          agentPrincipalId: context().principalId,
          grantId: context().grantId,
          runId: AgentRunIdSchema.parse(requestId()),
          label: "Idempotency checkpoint",
          commandIds: [],
          status: "open",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const command = {
      ...captureCommand("capture-checkpoint", "Checkpointed synthetic body"),
      checkpointId: firstCheckpointId,
    };
    assert.equal(
      unwrapOutcome(harness.kernel.execute(context(), command)).outcome,
      "success",
    );

    const conflict = unwrapOutcome(
      harness.kernel.execute(context(), {
        ...command,
        commandId: requestId(),
        correlationId: requestId(),
        checkpointId: secondCheckpointId,
      }),
    );
    assert.equal(conflict.outcome, "conflict");
    assert.equal(conflict.diagnosticCode, "idempotency.key_reused");
  });

  it("rolls back every capture persistence boundary under injected failure", () => {
    const boundaries: readonly FailureBoundary[] = [
      "capture",
      "event",
      "audit",
      "idempotency",
      "sync-command",
      "outbox",
    ];
    for (const boundary of boundaries) {
      const harness = bootstrappedHarness();
      const before = captureCounts(harness);
      harness.store.failures.failAfter(boundary);
      const outcome = unwrapOutcome(
        harness.kernel.execute(
          context(),
          captureCommand(`failure-${boundary}`, `Synthetic ${boundary}`),
        ),
      );
      assert.equal(outcome.outcome, "retryable");
      assert.equal(outcome.diagnosticCode, "storage.unit_of_work_failed");
      assert.deepEqual(captureCounts(harness), before);
    }
  });

  it("uses expected versions to reject stale workspace updates", () => {
    const harness = bootstrappedHarness();
    const rename = (name: string, idempotencyKey: string) => ({
      ...commandMetadata(idempotencyKey),
      commandName: "workspace.rename",
      expectedVersions: { [ids.workspace]: 1 },
      payload: { name },
    });
    const first = unwrapOutcome(
      harness.kernel.execute(context(), rename("Renamed once", "rename-1")),
    );
    const stale = unwrapOutcome(
      harness.kernel.execute(context(), rename("Stale overwrite", "rename-2")),
    );

    assert.equal(first.outcome, "success");
    assert.equal(stale.outcome, "conflict");
    assert.equal(stale.diagnosticCode, "record.version_conflict");
    assert.equal(harness.store.snapshot().workspaces[0]?.name, "Renamed once");
    assert.equal(harness.store.snapshot().workspaces[0]?.version, 2);
  });

  it("returns a typed conflict when a new workspace reuses an existing root Space ID", () => {
    const harness = bootstrappedHarness();
    const secondWorkspace = "00000000-0000-4000-8000-000000000011";
    const secondContext = ExecutionContextSchema.parse({
      ...context(),
      credentialId: "00000000-0000-4000-8000-000000000012",
      grantId: "00000000-0000-4000-8000-000000000013",
      workspaceId: secondWorkspace,
    });
    harness.authorization.register(secondContext);
    const conflict = unwrapOutcome(
      harness.kernel.execute(secondContext, {
        ...commandMetadata("workspace-root-collision"),
        commandName: "workspace.createLocal",
        workspaceId: secondWorkspace,
        payload: {
          workspaceId: secondWorkspace,
          rootSpaceId: ids.rootSpace,
          ownerPrincipalId: ids.principal,
          name: "Second synthetic workspace",
          timezone: "Europe/Warsaw",
        },
      }),
    );
    assert.equal(conflict.outcome, "conflict");
    assert.equal(conflict.diagnosticCode, "record.already_exists");
  });

  it("filters capture history and audit by current workspace, Space, and membership", () => {
    const harness = bootstrappedHarness();
    const outcome = unwrapOutcome(
      harness.kernel.execute(
        context(),
        captureCommand("private-capture", "Private synthetic capture"),
      ),
    );
    assert.equal(outcome.outcome, "success");
    if (outcome.outcome !== "success") {
      throw new Error("Expected capture success.");
    }

    const deniedHistory = harness.kernel.query(context(ids.otherPrincipal), {
      contractVersion: 1,
      queryName: "capture.history",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    const deniedAudit = harness.kernel.query(context(ids.otherPrincipal), {
      contractVersion: 1,
      queryName: "audit.receipt",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { receiptId: outcome.auditReceiptId },
    });
    assert.equal(deniedHistory.kind, "query_result");
    assert.equal(deniedAudit.kind, "query_result");
    if (
      deniedHistory.kind === "query_result" &&
      deniedAudit.kind === "query_result"
    ) {
      assert.deepEqual(deniedHistory.result, {
        outcome: "rejected",
        contractVersion: 1,
        queryId: deniedHistory.result.queryId,
        kernelTime: deniedHistory.result.kernelTime,
        diagnosticCode: "authorization.denied",
      });
      assert.equal(deniedAudit.result.outcome, "rejected");
      if (deniedAudit.result.outcome === "rejected") {
        assert.equal(deniedAudit.result.diagnosticCode, "query.not_available");
      }
    }
  });

  it("returns indistinguishable denials for missing or inaccessible routing targets", () => {
    const harness = bootstrappedHarness();
    const captureId = submitCaptureAndGetId(
      harness,
      "private-route-source",
      "Private routing source",
    );
    const foreignWorkspace = "00000000-0000-4000-8000-000000000091";
    const foreignSpace = "00000000-0000-4000-8000-000000000092";
    const foreignContext = ExecutionContextSchema.parse({
      ...context(),
      credentialId: "00000000-0000-4000-8000-000000000093",
      grantId: "00000000-0000-4000-8000-000000000094",
      workspaceId: foreignWorkspace,
      spaceScope: [foreignSpace],
    });
    harness.authorization.register(foreignContext);
    const foreignWorkspaceOutcome = unwrapOutcome(
      harness.kernel.execute(foreignContext, {
        ...workspaceCommand(),
        commandId: requestId(),
        correlationId: requestId(),
        workspaceId: foreignWorkspace,
        idempotencyKey: "foreign-workspace-bootstrap",
        payload: {
          workspaceId: foreignWorkspace,
          rootSpaceId: foreignSpace,
          ownerPrincipalId: ids.principal,
          name: "Foreign synthetic workspace",
          timezone: "Europe/Warsaw",
        },
      }),
    );
    assert.equal(foreignWorkspaceOutcome.outcome, "success");
    const before = routeCounts(harness);
    const missingCaptureId = "00000000-0000-4000-8000-000000000099";

    const noMembership = unwrapOutcome(
      harness.kernel.execute(
        context(ids.otherPrincipal),
        routeCommand(captureId, "route-no-membership", "Denied Task"),
      ),
    );
    const missing = unwrapOutcome(
      harness.kernel.execute(
        context(),
        routeCommand(missingCaptureId, "route-missing", "Missing source Task"),
      ),
    );

    const otherSpace = "00000000-0000-4000-8000-000000000098";
    const restrictedContext = ExecutionContextSchema.parse({
      ...context(),
      credentialId: "00000000-0000-4000-8000-000000000096",
      grantId: "00000000-0000-4000-8000-000000000097",
      spaceScope: [otherSpace],
    });
    harness.authorization.register(restrictedContext);
    const noSpaceAccess = unwrapOutcome(
      harness.kernel.execute(
        restrictedContext,
        routeCommand(captureId, "route-no-space", "Denied by Space"),
      ),
    );
    const crossWorkspace = unwrapOutcome(
      harness.kernel.execute(foreignContext, {
        ...routeCommand(
          captureId,
          "route-cross-workspace",
          "Cross-workspace Task",
        ),
        workspaceId: foreignWorkspace,
      }),
    );

    for (const outcome of [
      noMembership,
      missing,
      noSpaceAccess,
      crossWorkspace,
    ]) {
      assert.equal(outcome.outcome, "rejected");
      assert.equal(outcome.diagnosticCode, "authorization.denied");
    }
    assert.deepEqual(routeCounts(harness), before);

    const deniedList = harness.kernel.query(restrictedContext, {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (deniedList.kind !== "query_result") {
      throw new Error("Expected a typed Task-list denial.");
    }
    assert.equal(deniedList.result.outcome, "rejected");
    if (deniedList.result.outcome === "rejected") {
      assert.equal(deniedList.result.diagnosticCode, "authorization.denied");
    }
  });

  it("rolls back every capture-to-Task persistence boundary", () => {
    const boundaries: readonly FailureBoundary[] = [
      "capture-update",
      "task",
      "event",
      "audit",
      "idempotency",
      "sync-command",
      "outbox",
      "undo",
    ];
    for (const boundary of boundaries) {
      const harness = bootstrappedHarness();
      const captureId = submitCaptureAndGetId(
        harness,
        `route-failure-source-${boundary}`,
        `Synthetic route failure ${boundary}`,
      );
      const before = harness.store.snapshot();
      harness.store.failures.failAfter(boundary);
      const outcome = unwrapOutcome(
        harness.kernel.execute(
          context(),
          routeCommand(
            captureId,
            `route-failure-${boundary}`,
            `Synthetic Task ${boundary}`,
          ),
        ),
      );
      assert.equal(outcome.outcome, "retryable");
      assert.equal(outcome.diagnosticCode, "storage.unit_of_work_failed");
      assert.deepEqual(harness.store.snapshot(), before);
    }
  });

  it("paginates Task projections with typed opaque cursors and reports freshness", () => {
    const harness = bootstrappedHarness();
    for (const [index, title] of ["First", "Second", "Third"].entries()) {
      const captureId = submitCaptureAndGetId(
        harness,
        `task-page-source-${index}`,
        `${title} page source`,
      );
      const outcome = unwrapOutcome(
        harness.kernel.execute(
          context(),
          routeCommand(captureId, `task-page-${index}`, `${title} Task`),
        ),
      );
      assert.equal(outcome.outcome, "success");
    }

    const firstPage = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace, limit: 2 },
    });
    if (
      firstPage.kind !== "query_result" ||
      firstPage.result.outcome !== "success" ||
      firstPage.result.projection.kind !== "task.list"
    ) {
      throw new Error("Expected the first Task page.");
    }
    assert.equal(firstPage.result.projection.items.length, 2);
    assert.notEqual(firstPage.result.projection.nextCursor, null);

    const secondPage = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {
        spaceId: ids.rootSpace,
        limit: 2,
        cursor: firstPage.result.projection.nextCursor ?? "",
      },
    });
    if (
      secondPage.kind !== "query_result" ||
      secondPage.result.outcome !== "success" ||
      secondPage.result.projection.kind !== "task.list"
    ) {
      throw new Error("Expected the second Task page.");
    }
    assert.equal(secondPage.result.projection.items.length, 1);
    assert.equal(secondPage.result.projection.nextCursor, null);
    const firstIds = new Set(
      firstPage.result.projection.items.map((item) => item.id),
    );
    const secondItem = secondPage.result.projection.items[0];
    if (secondItem === undefined) {
      throw new Error("Expected one Task on the second page.");
    }
    assert.equal(firstIds.has(secondItem.id), false);

    const capturePage = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "capture.history",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace, limit: 1 },
    });
    if (
      capturePage.kind !== "query_result" ||
      capturePage.result.outcome !== "success" ||
      capturePage.result.projection.kind !== "capture.history"
    ) {
      throw new Error("Expected a Capture cursor.");
    }
    const wrongCursor = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {
        spaceId: ids.rootSpace,
        cursor: capturePage.result.projection.nextCursor ?? "",
      },
    });
    if (wrongCursor.kind !== "query_result") {
      throw new Error("Expected a typed cursor rejection.");
    }
    assert.equal(wrongCursor.result.outcome, "rejected");
    if (wrongCursor.result.outcome === "rejected") {
      assert.equal(wrongCursor.result.diagnosticCode, "query.cursor_invalid");
    }

    harness.store.setFreshness({
      mode: "local_projection",
      checkpoint: "task-projection-checkpoint-3",
      missingCapabilities: ["remote-task-updates"],
    });
    const projection = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_projection",
      parameters: { spaceId: ids.rootSpace },
    });
    if (
      projection.kind !== "query_result" ||
      projection.result.outcome !== "success"
    ) {
      throw new Error("Expected a fresh-enough Task projection.");
    }
    assert.deepEqual(projection.result.freshness, {
      mode: "local_projection",
      checkpoint: "task-projection-checkpoint-3",
      missingCapabilities: ["remote-task-updates"],
    });
    const authoritative = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (authoritative.kind !== "query_result") {
      throw new Error("Expected a typed consistency rejection.");
    }
    assert.equal(authoritative.result.outcome, "rejected");
    if (authoritative.result.outcome === "rejected") {
      assert.equal(
        authoritative.result.diagnosticCode,
        "query.consistency_unavailable",
      );
    }
  });

  it("paginates authorized capture history with an opaque cursor", () => {
    const harness = bootstrappedHarness();
    for (const [index, text] of ["First", "Second", "Third"].entries()) {
      const outcome = unwrapOutcome(
        harness.kernel.execute(
          context(),
          captureCommand(`page-${index}`, `${text} synthetic capture`),
        ),
      );
      assert.equal(outcome.outcome, "success");
    }
    const firstPage = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "capture.history",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace, limit: 2 },
    });
    assert.equal(firstPage.kind, "query_result");
    if (
      firstPage.kind !== "query_result" ||
      firstPage.result.outcome !== "success" ||
      firstPage.result.projection.kind !== "capture.history"
    ) {
      throw new Error("Expected the first capture page.");
    }
    assert.equal(firstPage.result.projection.items.length, 2);
    assert.notEqual(firstPage.result.projection.nextCursor, null);

    const secondPage = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "capture.history",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {
        spaceId: ids.rootSpace,
        limit: 2,
        cursor: firstPage.result.projection.nextCursor ?? "",
      },
    });
    if (
      secondPage.kind !== "query_result" ||
      secondPage.result.outcome !== "success" ||
      secondPage.result.projection.kind !== "capture.history"
    ) {
      throw new Error("Expected the second capture page.");
    }
    assert.equal(secondPage.result.projection.items.length, 1);
    assert.equal(secondPage.result.projection.nextCursor, null);
    const firstPageIds = new Set(
      firstPage.result.projection.items.map((item) => item.id),
    );
    const secondPageItem = secondPage.result.projection.items[0];
    if (secondPageItem === undefined) {
      throw new Error("Expected one item on the second capture page.");
    }
    assert.equal(firstPageIds.has(secondPageItem.id), false);
  });

  it("reports actual store freshness and rejects unavailable consistency", () => {
    const harness = bootstrappedHarness();
    harness.store.setFreshness({
      mode: "local_projection",
      checkpoint: "projection-checkpoint-7",
      missingCapabilities: ["remote-agent-availability"],
    });
    const projectionQuery = {
      contractVersion: 1,
      queryName: "workspace.bootstrapContext",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_projection",
      parameters: {},
    };
    const projection = harness.kernel.query(context(), projectionQuery);
    assert.equal(projection.kind, "query_result");
    if (
      projection.kind !== "query_result" ||
      projection.result.outcome !== "success"
    ) {
      throw new Error("Expected a local projection result.");
    }
    assert.deepEqual(projection.result.freshness, {
      mode: "local_projection",
      checkpoint: "projection-checkpoint-7",
      missingCapabilities: ["remote-agent-availability"],
    });

    const authoritative = harness.kernel.query(context(), {
      ...projectionQuery,
      queryId: requestId(),
      consistency: "local_authoritative",
    });
    assert.equal(authoritative.kind, "query_result");
    if (authoritative.kind === "query_result") {
      assert.equal(authoritative.result.outcome, "rejected");
      if (authoritative.result.outcome === "rejected") {
        assert.equal(
          authoritative.result.diagnosticCode,
          "query.consistency_unavailable",
        );
      }
    }

    harness.authorization.revoke(context().grantId);
    const revoked = harness.kernel.query(context(), {
      ...projectionQuery,
      queryId: requestId(),
      consistency: "local_authoritative",
    });
    if (
      revoked.kind !== "query_result" ||
      revoked.result.outcome !== "rejected"
    ) {
      throw new Error(
        "Expected authorization-safe rejection for a revoked grant.",
      );
    }
    assert.equal(revoked.result.diagnosticCode, "authorization.denied");
  });

  it("rejects malformed input at the kernel boundary without writing", () => {
    const harness = bootstrappedHarness();
    const before = harness.store.snapshot();
    const secret = "MALFORMED_SECRET_CAPTURE";
    const response = harness.kernel.execute(context(), {
      ...captureCommand("malformed", secret),
      unexpected: secret,
    });
    assert.equal(response.kind, "contract_rejected");
    assert.equal(JSON.stringify(response).includes(secret), false);
    assert.deepEqual(harness.store.snapshot(), before);
  });
});
