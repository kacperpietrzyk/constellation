import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CommandOutcomeSchema,
  validateCommandEnvelope,
  validateExecutionContext,
  validateQueryEnvelope,
} from "../src/index.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  space: "00000000-0000-4000-8000-000000000002",
  principal: "00000000-0000-4000-8000-000000000003",
  credential: "00000000-0000-4000-8000-000000000004",
  grant: "00000000-0000-4000-8000-000000000005",
  command: "00000000-0000-4000-8000-000000000006",
  correlation: "00000000-0000-4000-8000-000000000007",
  query: "00000000-0000-4000-8000-000000000008",
} as const;

const context = {
  principalId: ids.principal,
  principalKind: "human",
  credentialId: ids.credential,
  grantId: ids.grant,
  policyVersion: 1,
  workspaceId: ids.workspace,
  spaceScope: [ids.space],
  capabilityScope: ["capture.submitText", "capture.history"],
  origin: "desktop",
};

const captureCommand = {
  contractVersion: 1,
  commandName: "capture.submitText",
  commandId: ids.command,
  workspaceId: ids.workspace,
  payload: {
    spaceId: ids.space,
    originalText: "Synthetic private body",
    deviceId: "test-device",
    source: "global_quick_capture",
  },
  idempotencyKey: "capture-1",
  expectedVersions: {},
  correlationId: ids.correlation,
};

describe("application contracts", () => {
  it("accepts strict execution, command, and query envelopes", () => {
    assert.equal(validateExecutionContext(context).ok, true);
    assert.equal(validateCommandEnvelope(captureCommand).ok, true);
    assert.equal(
      validateQueryEnvelope({
        contractVersion: 1,
        queryName: "capture.history",
        queryId: ids.query,
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { spaceId: ids.space },
      }).ok,
      true,
    );
  });

  it("rejects unknown fields at the envelope and payload boundaries", () => {
    const topLevel = validateCommandEnvelope({
      ...captureCommand,
      unexpected: true,
    });
    const payload = validateCommandEnvelope({
      ...captureCommand,
      payload: { ...captureCommand.payload, unexpected: true },
    });

    assert.equal(topLevel.ok, false);
    assert.equal(payload.ok, false);
    if (!topLevel.ok && !payload.ok) {
      assert.deepEqual(topLevel.issues, [
        { code: "unrecognized_keys", path: "" },
      ]);
      assert.deepEqual(payload.issues, [
        { code: "unrecognized_keys", path: "payload" },
      ]);
    }
  });

  it("returns content-safe validation issues without echoing capture text", () => {
    const secret = "DO_NOT_ECHO_THIS_CAPTURE_BODY";
    const result = validateCommandEnvelope({
      ...captureCommand,
      payload: {
        ...captureCommand.payload,
        originalText: "",
        privateDebugValue: secret,
      },
    });

    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(secret), false);
    if (!result.ok) {
      assert.deepEqual(
        result.issues.map((issue) => issue.path),
        ["payload.originalText", "payload"],
      );
    }
  });

  it("rejects an invalid workspace time zone before domain execution", () => {
    const result = validateCommandEnvelope({
      ...captureCommand,
      commandName: "workspace.createLocal",
      payload: {
        workspaceId: ids.workspace,
        rootSpaceId: ids.space,
        ownerPrincipalId: ids.principal,
        name: "Synthetic workspace",
        timezone: "Mars/Olympus_Mons",
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.issues, [
        { code: "custom", path: "payload.timezone" },
      ]);
    }
  });

  it("rejects outcome and diagnostic combinations that contradict each other", () => {
    const result = CommandOutcomeSchema.safeParse({
      outcome: "success",
      contractVersion: 1,
      commandId: ids.command,
      correlationId: ids.correlation,
      kernelTime: "2026-07-12T12:00:00.000Z",
      diagnosticCode: "workspace.created",
      affected: [],
      auditReceiptId: ids.query,
      projection: {
        kind: "capture.stored",
        captureId: ids.query,
        processingState: "pending_processing",
        version: 1,
      },
    });
    assert.equal(result.success, false);
  });
});
