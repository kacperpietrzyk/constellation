import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandEnvelopeSchema,
  DeviceIdSchema,
  ExecutionContextSchema,
  QueryEnvelopeSchema,
} from "@constellation/contracts";
import { InMemoryReferenceStore } from "@constellation/testkit";

import { createRuntimeKernelService } from "../src/runtime-kernel-service.js";
import {
  importStarterWorkspace,
  parseStarterWorkspaceManifest,
} from "../src/starter-workspace-import.js";

const context = ExecutionContextSchema.parse({
  principalId: "20000000-0000-4000-8000-000000000001",
  principalKind: "human",
  credentialId: "20000000-0000-4000-8000-000000000002",
  grantId: "20000000-0000-4000-8000-000000000003",
  policyVersion: 1,
  workspaceId: "20000000-0000-4000-8000-000000000004",
  spaceScope: ["20000000-0000-4000-8000-000000000005"],
  capabilityScope: [
    "workspace.createLocal",
    "area.create",
    "initiative.create",
    "project.create",
    "work.linkCreate",
    "capture.submit",
    "capture.process",
    "task.setOperationalState",
    "record.relate",
    "work.overview",
    "task.list",
  ],
  origin: "desktop",
});

const manifestValue = {
  version: 1,
  importId: "20000000-0000-4000-8000-000000000006",
  areas: [
    { key: "product", title: "Product", responsibility: "Own the product" },
  ],
  initiatives: [
    {
      key: "alpha",
      title: "Alpha",
      intendedOutcome: "Ordinary work is possible",
    },
  ],
  projects: [
    {
      key: "dogfood",
      title: "Dogfood",
      intendedOutcome: "One week is complete",
      areaKey: "product",
      initiativeKey: "alpha",
    },
  ],
  tasks: [
    {
      key: "review",
      title: "Review the week",
      projectKey: "dogfood",
      operationalState: "waiting",
      waitingOn: "A completed week",
    },
  ],
};

test("starter manifest is strict, referentially valid, and idempotent through production commands", () => {
  assert.equal(
    parseStarterWorkspaceManifest({ ...manifestValue, unexpected: true }),
    undefined,
  );
  assert.equal(
    parseStarterWorkspaceManifest({
      ...manifestValue,
      projects: [{ ...manifestValue.projects[0], areaKey: "missing" }],
    }),
    undefined,
  );
  const manifest = parseStarterWorkspaceManifest(manifestValue);
  assert.ok(manifest);

  const service = createRuntimeKernelService({
    context,
    store: new InMemoryReferenceStore(),
  });
  const spaceId = context.spaceScope[0]!;
  const created = service.execute(
    CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "workspace.createLocal",
      commandId: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      idempotencyKey: "starter-test-workspace",
      expectedVersions: {},
      correlationId: crypto.randomUUID(),
      payload: {
        workspaceId: context.workspaceId,
        rootSpaceId: spaceId,
        ownerPrincipalId: context.principalId,
        name: "Starter test",
        timezone: "Europe/Warsaw",
      },
    }),
  );
  assert.equal(created.kind, "command_outcome");

  const run = () =>
    importStarterWorkspace({
      service,
      workspaceId: context.workspaceId,
      spaceId,
      deviceId: DeviceIdSchema.parse("starter-test-device"),
      manifest,
    });
  assert.deepEqual(run(), {
    areas: 1,
    initiatives: 1,
    projects: 1,
    tasks: 1,
    links: 3,
  });
  assert.deepEqual(run(), {
    areas: 1,
    initiatives: 1,
    projects: 1,
    tasks: 1,
    links: 3,
  });

  const overview = service.query(
    QueryEnvelopeSchema.parse({
      contractVersion: 1,
      queryName: "work.overview",
      queryId: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      consistency: "local_authoritative",
      parameters: { spaceId },
    }),
  );
  assert.equal(overview.kind, "query_result");
  if (overview.kind !== "query_result" || overview.result.outcome !== "success")
    throw new Error("Expected Work overview.");
  assert.equal(overview.result.projection.kind, "work.overview");
  if (overview.result.projection.kind !== "work.overview")
    throw new Error("Expected Work overview.");
  assert.equal(overview.result.projection.areas.length, 1);
  assert.equal(overview.result.projection.initiatives.length, 1);
  assert.equal(overview.result.projection.projects.length, 1);
  assert.equal(overview.result.projection.tasks.length, 1);
  assert.equal(
    overview.result.projection.tasks[0]?.operationalState,
    "waiting",
  );
});
