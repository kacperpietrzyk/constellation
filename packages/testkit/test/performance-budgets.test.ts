import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness } from "../src/index.js";

const RECORD_COUNT = 250;
const budgets = {
  seedMs: 15_000,
  captureP95Ms: 100,
  queryMs: 1_000,
  heapGrowthBytes: 256 * 1024 * 1024,
} as const;

const ids = {
  workspace: "70000000-0000-4000-8000-000000000001",
  space: "70000000-0000-4000-8000-000000000002",
  principal: "70000000-0000-4000-8000-000000000003",
  credential: "70000000-0000-4000-8000-000000000004",
  grant: "70000000-0000-4000-8000-000000000005",
} as const;

let sequence = 8_192;
const requestId = (): string => {
  const suffix = sequence.toString(16).padStart(12, "0");
  sequence += 1;
  return `70000000-0000-4000-8000-${suffix}`;
};

const context: ExecutionContext = ExecutionContextSchema.parse({
  principalId: ids.principal,
  principalKind: "human",
  credentialId: ids.credential,
  grantId: ids.grant,
  policyVersion: 1,
  workspaceId: ids.workspace,
  spaceScope: [ids.space],
  capabilityScope: [
    "workspace.createLocal",
    "capture.submitText",
    "capture.routeAsTask",
    "task.list",
    "search.global",
    "cockpit.week",
  ],
  origin: "desktop",
});

const metadata = (key: string, expectedVersions = {}) => ({
  contractVersion: 1 as const,
  commandId: requestId(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions,
  correlationId: requestId(),
});

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome") throw new Error("Expected outcome");
  return response.outcome;
};

const percentile95 = (values: readonly number[]): number =>
  [...values].sort((left, right) => left - right)[
    Math.ceil(values.length * 0.95) - 1
  ] ?? 0;

it("keeps representative large-workspace journeys inside release budgets", (t) => {
  const heapBefore = process.memoryUsage().heapUsed;
  const harness = createReferenceHarness();
  harness.authorization.register(context);
  const bootstrap = unwrap(
    harness.kernel.execute(context, {
      ...metadata("performance-bootstrap"),
      commandName: "workspace.createLocal",
      payload: {
        workspaceId: ids.workspace,
        rootSpaceId: ids.space,
        ownerPrincipalId: ids.principal,
        name: "Deterministic performance workspace",
        timezone: "Europe/Warsaw",
      },
    }),
  );
  assert.equal(bootstrap.outcome, "success");

  const captureDurations: number[] = [];
  const seedStarted = performance.now();
  for (let index = 0; index < RECORD_COUNT; index += 1) {
    const title =
      index === RECORD_COUNT - 1
        ? `Target needle task ${index}`
        : `Representative task ${index}`;
    const captureStarted = performance.now();
    const capture = unwrap(
      harness.kernel.execute(context, {
        ...metadata(`performance-capture-${index}`),
        commandName: "capture.submitText",
        payload: {
          spaceId: ids.space,
          originalText: `Original ${title}`,
          deviceId: "performance-device",
          source: "in_app_quick_capture",
        },
      }),
    );
    assert.equal(capture.outcome, "success");
    if (
      capture.outcome !== "success" ||
      capture.projection.kind !== "capture.stored"
    )
      throw new Error("Expected stored Capture");
    const routed = unwrap(
      harness.kernel.execute(context, {
        ...metadata(`performance-route-${index}`, {
          [capture.projection.captureId]: 1,
        }),
        commandName: "capture.routeAsTask",
        payload: { captureId: capture.projection.captureId, title },
      }),
    );
    assert.equal(routed.outcome, "success");
    captureDurations.push(performance.now() - captureStarted);
  }
  const seedMs = performance.now() - seedStarted;

  const query = (queryName: string, parameters: object) => {
    const started = performance.now();
    const response = harness.kernel.query(context, {
      contractVersion: 1,
      queryName,
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters,
    } as never);
    const durationMs = performance.now() - started;
    assert.equal(response.kind, "query_result");
    if (response.kind !== "query_result") throw new Error("Expected query");
    assert.equal(response.result.outcome, "success");
    return { response, durationMs };
  };

  const taskList = query("task.list", { spaceId: ids.space, limit: 100 });
  const search = query("search.global", {
    spaceIds: [ids.space],
    text: "target needle",
  });
  const cockpit = query("cockpit.week", {
    spaceId: ids.space,
    weekStart: "2026-07-13",
  });
  const heapGrowthBytes = Math.max(
    0,
    process.memoryUsage().heapUsed - heapBefore,
  );
  const metrics = {
    recordCount: RECORD_COUNT,
    seedMs: Math.round(seedMs * 100) / 100,
    captureP95Ms: Math.round(percentile95(captureDurations) * 100) / 100,
    taskListMs: Math.round(taskList.durationMs * 100) / 100,
    searchMs: Math.round(search.durationMs * 100) / 100,
    cockpitMs: Math.round(cockpit.durationMs * 100) / 100,
    heapGrowthBytes,
  };
  t.diagnostic(`Journey budgets: ${JSON.stringify(metrics)}`);

  assert.ok(metrics.seedMs <= budgets.seedMs, JSON.stringify(metrics));
  assert.ok(
    metrics.captureP95Ms <= budgets.captureP95Ms,
    JSON.stringify(metrics),
  );
  for (const duration of [
    metrics.taskListMs,
    metrics.searchMs,
    metrics.cockpitMs,
  ])
    assert.ok(duration <= budgets.queryMs, JSON.stringify(metrics));
  assert.ok(
    metrics.heapGrowthBytes <= budgets.heapGrowthBytes,
    JSON.stringify(metrics),
  );
});
