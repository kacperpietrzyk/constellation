import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandEnvelopeSchema,
  QueryEnvelopeSchema,
  QueryIdSchema,
} from "@constellation/contracts";

import {
  PREVIEW_IDENTITY,
  createPreviewKernelService,
} from "../src/preview-service.js";
import { isTrustedRendererUrl } from "../src/security.js";

test("preview service rejects malformed renderer messages without mutation", () => {
  const service = createPreviewKernelService();
  const malformed = service.execute({ commandName: "capture.submitText" });
  assert.equal(malformed.kind, "contract_rejected");

  const query = QueryEnvelopeSchema.parse({
    contractVersion: 1,
    queryName: "task.list",
    queryId: QueryIdSchema.parse("00000000-0000-4000-8000-000000000900"),
    workspaceId: PREVIEW_IDENTITY.workspaceId,
    consistency: "local_authoritative",
    parameters: { spaceId: PREVIEW_IDENTITY.rootSpaceId },
  });
  const response = service.query(query);
  assert.equal(response.kind, "query_result");
  if (
    response.kind === "query_result" &&
    response.result.outcome === "success"
  ) {
    assert.equal(response.result.projection.kind, "task.list");
    if (response.result.projection.kind === "task.list") {
      assert.equal(response.result.projection.items.length, 0);
    }
  }
});

test("preview service executes Capture to Task through the real kernel", () => {
  const service = createPreviewKernelService();
  const submitted = service.execute(
    CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "capture.submitText",
      commandId: "00000000-0000-4000-8000-000000000910",
      workspaceId: PREVIEW_IDENTITY.workspaceId,
      idempotencyKey: "preview-test-capture",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000000911",
      payload: {
        spaceId: PREVIEW_IDENTITY.rootSpaceId,
        originalText: "Prepare interactive alpha handoff",
        deviceId: "test-device",
        source: "in_app_quick_capture",
      },
    }),
  );
  if (
    submitted.kind !== "command_outcome" ||
    submitted.outcome.outcome !== "success" ||
    submitted.outcome.projection.kind !== "capture.stored"
  ) {
    assert.fail("Capture should commit successfully.");
  }

  const capture = submitted.outcome.projection;
  const routed = service.execute(
    CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "capture.routeAsTask",
      commandId: "00000000-0000-4000-8000-000000000912",
      workspaceId: PREVIEW_IDENTITY.workspaceId,
      idempotencyKey: "preview-test-route",
      expectedVersions: { [capture.captureId]: capture.version },
      correlationId: "00000000-0000-4000-8000-000000000911",
      payload: {
        captureId: capture.captureId,
        title: "Prepare interactive alpha handoff",
      },
    }),
  );
  if (
    routed.kind !== "command_outcome" ||
    routed.outcome.outcome !== "success" ||
    routed.outcome.projection.kind !== "capture.routed_as_task"
  ) {
    assert.fail("Capture should route to one Task.");
  }

  const taskList = service.query(
    QueryEnvelopeSchema.parse({
      contractVersion: 1,
      queryName: "task.list",
      queryId: "00000000-0000-4000-8000-000000000913",
      workspaceId: PREVIEW_IDENTITY.workspaceId,
      consistency: "local_authoritative",
      parameters: { spaceId: PREVIEW_IDENTITY.rootSpaceId },
    }),
  );
  if (
    taskList.kind === "query_result" &&
    taskList.result.outcome === "success" &&
    taskList.result.projection.kind === "task.list"
  ) {
    assert.equal(taskList.result.projection.items.length, 1);
    assert.equal(
      taskList.result.projection.items[0]?.sourceCaptureId,
      capture.captureId,
    );
  } else {
    assert.fail("Task list should return the routed Task.");
  }
});

test("renderer origin checks fail closed", () => {
  assert.equal(isTrustedRendererUrl("file:///app/index.html"), true);
  assert.equal(isTrustedRendererUrl("https://example.test"), false);
  assert.equal(
    isTrustedRendererUrl("http://127.0.0.1:5173/src", "http://127.0.0.1:5173"),
    true,
  );
  assert.equal(
    isTrustedRendererUrl("http://127.0.0.1:51730", "http://127.0.0.1:5173"),
    false,
  );
});
