import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandEnvelopeSchema,
  ExecutionContextSchema,
  QueryEnvelopeSchema,
} from "@constellation/contracts";
import { InMemoryReferenceStore } from "@constellation/testkit";

import { createRuntimeKernelService } from "../src/runtime-kernel-service.js";

const context = ExecutionContextSchema.parse({
  principalId: "00000000-0000-4000-8000-000000000001",
  principalKind: "human",
  credentialId: "00000000-0000-4000-8000-000000000002",
  grantId: "00000000-0000-4000-8000-000000000003",
  policyVersion: 1,
  workspaceId: "00000000-0000-4000-8000-000000000004",
  spaceScope: ["00000000-0000-4000-8000-000000000005"],
  capabilityScope: [
    "workspace.createLocal",
    "workspace.bootstrapContext",
    "capture.submitText",
    "capture.routeAsTask",
    "capture.history",
    "task.list",
    "audit.receipt",
  ],
  origin: "desktop",
});
const rootSpaceId = context.spaceScope[0]!;

test("runtime service uses fresh IDs and a trusted desktop grant", () => {
  const service = createRuntimeKernelService({
    context,
    store: new InMemoryReferenceStore(),
  });
  const workspace = service.execute(
    CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "workspace.createLocal",
      commandId: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      idempotencyKey: "runtime-workspace-v1",
      expectedVersions: {},
      correlationId: crypto.randomUUID(),
      payload: {
        workspaceId: context.workspaceId,
        rootSpaceId,
        ownerPrincipalId: context.principalId,
        name: "Runtime workspace",
        timezone: "Europe/Warsaw",
      },
    }),
  );
  assert.equal(workspace.kind, "command_outcome");
  if (workspace.kind !== "command_outcome")
    throw new Error("Expected outcome.");
  assert.equal(workspace.outcome.outcome, "success");

  const captures = ["first", "second"].map((text) =>
    service.execute(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "capture.submitText",
        commandId: crypto.randomUUID(),
        workspaceId: context.workspaceId,
        idempotencyKey: `runtime-${text}`,
        expectedVersions: {},
        correlationId: crypto.randomUUID(),
        payload: {
          spaceId: rootSpaceId,
          originalText: text,
          deviceId: "runtime-test",
          source: "in_app_quick_capture",
        },
      }),
    ),
  );
  for (const response of captures) {
    assert.equal(response.kind, "command_outcome");
    if (response.kind !== "command_outcome")
      throw new Error("Expected outcome.");
    assert.equal(response.outcome.outcome, "success");
  }

  const history = service.query(
    QueryEnvelopeSchema.parse({
      contractVersion: 1,
      queryName: "capture.history",
      queryId: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      consistency: "local_authoritative",
      parameters: { spaceId: rootSpaceId, limit: 20 },
    }),
  );
  assert.equal(history.kind, "query_result");
  if (history.kind !== "query_result" || history.result.outcome !== "success") {
    throw new Error("Expected history.");
  }
  assert.equal(history.result.projection.kind, "capture.history");
  if (history.result.projection.kind !== "capture.history") {
    throw new Error("Expected Capture history.");
  }
  assert.equal(history.result.projection.items.length, 2);
  assert.notEqual(
    history.result.projection.items[0]?.id,
    history.result.projection.items[1]?.id,
  );
});
