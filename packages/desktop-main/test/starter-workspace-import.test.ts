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
  manifestStatusErrors,
  parseStarterWorkspaceManifest,
  parseTasksCsv,
  previewStarterWorkspace,
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
    "task.updateDetails",
    "task.setStatus",
    "taskStatus.create",
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
  assert.deepEqual(previewStarterWorkspace(manifest), {
    areas: 1,
    initiatives: 1,
    projects: 1,
    tasks: 1,
    links: 3,
  });

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

test("starter preview is a pure count over the validated manifest", () => {
  const manifest = parseStarterWorkspaceManifest({
    ...manifestValue,
    projects: [
      manifestValue.projects[0],
      {
        key: "without-links",
        title: "Unlinked project",
        intendedOutcome: "Remain explicit",
      },
    ],
    tasks: [
      manifestValue.tasks[0],
      { key: "unlinked-task", title: "Unlinked task" },
    ],
  });
  assert.ok(manifest);
  assert.deepEqual(previewStarterWorkspace(manifest), {
    areas: 1,
    initiatives: 1,
    projects: 2,
    tasks: 2,
    links: 3,
  });
});

test("tasks CSV maps onto the v2 exchange manifest through the same engine", () => {
  const headerError = parseTasksCsv("kolumna\nA");
  assert.equal(headerError.outcome, "failure");

  const rowError = parseTasksCsv("title,priority\nDobre,normal\n,urgent\n");
  assert.equal(rowError.outcome, "failure");
  if (rowError.outcome !== "failure") throw new Error("Expected failure.");
  assert.ok(
    rowError.errors.some((error) => error.includes("Wiersz 3")),
    "row errors carry row numbers",
  );

  const csv = [
    "title,project,status,priority,due,state,waitingOn,description",
    '"Zadanie, pierwsze",Wdrożenie,W toku,high,2026-08-01,,,Notatka importu',
    "Czekamy na cennik,Wdrożenie,,normal,,waiting,Cennik dystrybutora,",
    "",
  ].join("\n");
  const parsed = parseTasksCsv(csv);
  assert.equal(parsed.outcome, "success");
  if (parsed.outcome !== "success") throw new Error("Expected manifest.");
  assert.equal(parsed.manifest.version, 2);
  assert.equal(parsed.manifest.tasks.length, 2);
  assert.equal(parsed.manifest.projects.length, 1);
  assert.equal(parsed.manifest.tasks[0]?.dueAt, "2026-08-01T12:00:00.000Z");
  assert.equal(parsed.manifest.tasks[0]?.statusLabel, "W toku");
  const reparsed = parseTasksCsv(csv);
  assert.equal(
    reparsed.outcome === "success" ? reparsed.manifest.importId : undefined,
    parsed.manifest.importId,
    "the same file always maps to the same import identity",
  );

  assert.equal(
    manifestStatusErrors(parsed.manifest, ["Inny status"]).length,
    1,
    "an unknown status label is a preview-visible validation error",
  );
  assert.equal(manifestStatusErrors(parsed.manifest, ["w TOKU"]).length, 0);

  const service = createRuntimeKernelService({
    context,
    store: new InMemoryReferenceStore(),
  });
  const spaceId = context.spaceScope[0]!;
  const base = (name: string) => ({
    contractVersion: 1,
    commandId: crypto.randomUUID(),
    workspaceId: context.workspaceId,
    idempotencyKey: name,
    expectedVersions: {},
    correlationId: crypto.randomUUID(),
  });
  assert.equal(
    service.execute(
      CommandEnvelopeSchema.parse({
        ...base("csv-test-workspace"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: context.workspaceId,
          rootSpaceId: spaceId,
          ownerPrincipalId: context.principalId,
          name: "CSV test",
          timezone: "Europe/Warsaw",
        },
      }),
    ).kind,
    "command_outcome",
  );
  const statusId = "20000000-0000-4000-8000-000000000007";
  const statusCreated = service.execute(
    CommandEnvelopeSchema.parse({
      ...base("csv-test-status"),
      commandName: "taskStatus.create",
      payload: {
        statusId,
        label: "W toku",
        operationalSemantics: "actionable",
      },
    }),
  );
  assert.equal(statusCreated.kind, "command_outcome");

  const run = () =>
    importStarterWorkspace({
      service,
      workspaceId: context.workspaceId,
      spaceId,
      deviceId: DeviceIdSchema.parse("csv-test-device"),
      manifest: parsed.manifest,
      resolveStatusId: (label) =>
        label.toLocaleLowerCase("pl-PL") === "w toku" ? statusId : undefined,
    });
  assert.deepEqual(run(), {
    areas: 0,
    initiatives: 0,
    projects: 1,
    tasks: 2,
    links: 2,
  });
  assert.deepEqual(
    run(),
    { areas: 0, initiatives: 0, projects: 1, tasks: 2, links: 2 },
    "re-running the same file is idempotent",
  );

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
  if (
    overview.kind !== "query_result" ||
    overview.result.outcome !== "success" ||
    overview.result.projection.kind !== "work.overview"
  )
    throw new Error("Expected Work overview.");
  const imported = overview.result.projection.tasks.find(
    (task) => task.title === "Zadanie, pierwsze",
  );
  assert.equal(imported?.statusId, statusId);
  assert.equal(imported?.priority, "high");
  assert.equal(imported?.dueAt, "2026-08-01T12:00:00.000Z");
  const waiting = overview.result.projection.tasks.find(
    (task) => task.title === "Czekamy na cennik",
  );
  assert.equal(waiting?.operationalState, "waiting");
});
