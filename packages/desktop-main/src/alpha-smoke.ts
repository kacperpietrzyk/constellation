import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  CommandEnvelopeSchema,
  QueryEnvelopeSchema,
} from "@constellation/contracts";
import type { EncryptedLocalStoreFacts } from "@constellation/local-store";

import type { DesktopKernelService } from "./runtime-kernel-service.js";
import type { WorkspaceBootstrapIdentity } from "./workspace-key-custody.js";

export const runAlphaSmoke = (input: {
  readonly facts: EncryptedLocalStoreFacts;
  readonly identity: WorkspaceBootstrapIdentity;
  readonly reportPath: string;
  readonly service: DesktopKernelService;
}): void => {
  const taskQuery = () =>
    input.service.query(
      QueryEnvelopeSchema.parse({
        contractVersion: 1,
        queryName: "task.list",
        queryId: randomUUID(),
        workspaceId: input.identity.workspaceId,
        consistency: "local_authoritative",
        parameters: { spaceId: input.identity.rootSpaceId, limit: 20 },
      }),
    );
  let tasks = taskQuery();
  if (
    tasks.kind !== "query_result" ||
    tasks.result.outcome !== "success" ||
    tasks.result.projection.kind !== "task.list"
  ) {
    throw new Error("ALPHA_SMOKE_TASK_QUERY_FAILED");
  }
  const restored = tasks.result.projection.items.length > 0;
  if (!restored) {
    const correlationId = randomUUID();
    const submitted = input.service.execute(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "capture.submitText",
        commandId: randomUUID(),
        workspaceId: input.identity.workspaceId,
        idempotencyKey: "packaged-alpha-smoke-capture-v1",
        expectedVersions: {},
        correlationId,
        payload: {
          spaceId: input.identity.rootSpaceId,
          originalText: "Verify packaged local Alpha persistence",
          deviceId: "packaged-alpha-smoke",
          source: "in_app_quick_capture",
        },
      }),
    );
    if (
      submitted.kind !== "command_outcome" ||
      submitted.outcome.outcome !== "success" ||
      submitted.outcome.projection.kind !== "capture.stored"
    ) {
      throw new Error("ALPHA_SMOKE_CAPTURE_FAILED");
    }
    const capture = submitted.outcome.projection;
    const routed = input.service.execute(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "capture.routeAsTask",
        commandId: randomUUID(),
        workspaceId: input.identity.workspaceId,
        idempotencyKey: "packaged-alpha-smoke-route-v1",
        expectedVersions: { [capture.captureId]: capture.version },
        correlationId,
        payload: {
          captureId: capture.captureId,
          title: "Verify packaged local Alpha persistence",
        },
      }),
    );
    if (
      routed.kind !== "command_outcome" ||
      routed.outcome.outcome !== "success"
    ) {
      throw new Error("ALPHA_SMOKE_ROUTE_FAILED");
    }
    tasks = taskQuery();
  }
  if (
    tasks.kind !== "query_result" ||
    tasks.result.outcome !== "success" ||
    tasks.result.projection.kind !== "task.list" ||
    tasks.result.projection.items.length !== 1
  ) {
    throw new Error("ALPHA_SMOKE_RESTART_VERIFICATION_FAILED");
  }
  mkdirSync(path.dirname(input.reportPath), { recursive: true, mode: 0o700 });
  const temporary = `${input.reportPath}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    `${JSON.stringify({
      status: "pass",
      phase: restored ? "restored" : "created",
      persistence: "encrypted-local",
      cipherVersion: input.facts.cipherVersion,
      provider: input.facts.provider,
      taskCount: 1,
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  renameSync(temporary, input.reportPath);
};
