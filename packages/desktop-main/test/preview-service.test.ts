import assert from "node:assert/strict";
import test, { describe, it } from "node:test";

import {
  CapabilitySchema,
  CommandEnvelopeSchema,
  QueryEnvelopeSchema,
  QueryIdSchema,
  type Capability,
} from "@constellation/contracts";

import { LOCAL_ALPHA_CAPABILITIES } from "../src/durable-kernel-service.js";
import {
  ALL_PREVIEW_CAPABILITIES,
  PREVIEW_CAPABILITY_DISPOSITION,
  PREVIEW_IDENTITY,
  createPreviewKernelService,
} from "../src/preview-service.js";
import { isTrustedRendererUrl } from "../src/security.js";

/**
 * The preview session against the one it claims to be.
 *
 * The total `Record` in `preview-service.ts` forces a DECISION about every
 * capability; it cannot force the RIGHT decision, because `{ withheld: … }`
 * compiles just as well as `"granted"`. These two assertions are what make the
 * decision checkable, and they are the ones that would have caught the twelve
 * capabilities that went missing across #28, #47, #48 and #119.
 *
 * Both name the capabilities that differ rather than counting them. A count
 * floor is satisfiable by the wrong population — this wave watched a sweep meet
 * its own file-count floor while reading 139 `.d.ts` files out of `build/ts` —
 * so the failure message here has to say WHICH capability drifted, and a
 * `deepEqual` over sorted names does and a length check does not.
 */
describe("the preview session holds what the desktop operator holds", () => {
  const desktop = new Set<Capability>(LOCAL_ALPHA_CAPABILITIES);
  const preview = new Set<Capability>(ALL_PREVIEW_CAPABILITIES);

  it("withholds nothing the desktop operator holds", () => {
    assert.deepEqual(
      [...desktop].filter((capability) => !preview.has(capability)).sort(),
      [],
    );
  });

  it("holds nothing the desktop operator lacks", () => {
    assert.deepEqual(
      [...preview].filter((capability) => !desktop.has(capability)).sort(),
      [],
    );
  });

  /**
   * The exclusions are DERIVED from the same two sources, never re-listed. A
   * third hand-written array naming the withheld three would be the family's
   * next site, written while paying off this one.
   */
  it("gives every withheld capability a written reason", () => {
    const withheld = CapabilitySchema.options.filter(
      (capability) => !desktop.has(capability),
    );
    assert.ok(withheld.length > 0, "the exclusion set must not be vacuous");
    for (const capability of withheld) {
      const disposition = PREVIEW_CAPABILITY_DISPOSITION[capability];
      assert.notEqual(
        disposition,
        "granted",
        `${capability} is granted to the preview but not to the desktop`,
      );
      if (disposition === "granted") continue;
      assert.ok(
        disposition.withheld.length > 40,
        `${capability} is withheld without a reason anyone can act on`,
      );
    }
  });
});

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
