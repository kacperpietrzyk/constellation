import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
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
      "capture.history",
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
    const command = {
      ...captureCommand("capture-checkpoint", "Checkpointed synthetic body"),
      checkpointId: requestId(),
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
        checkpointId: requestId(),
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
