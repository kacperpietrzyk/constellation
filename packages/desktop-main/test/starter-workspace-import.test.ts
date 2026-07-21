import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandEnvelopeSchema,
  DeviceIdSchema,
  ExecutionContextSchema,
  QueryEnvelopeSchema,
} from "@constellation/contracts";
import { isApplicationWave2ReadView } from "@constellation/application";
import { InMemoryReferenceStore } from "@constellation/testkit";

import { createRuntimeKernelService } from "../src/runtime-kernel-service.js";
import { buildExchangeManifest } from "../src/starter-workspace-export.js";
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
    "document.create",
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
    taskStatuses: 0,
    documents: 0,
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
    taskStatuses: 0,
    documents: 0,
    areas: 1,
    initiatives: 1,
    projects: 1,
    tasks: 1,
    links: 3,
  });
  assert.deepEqual(run(), {
    taskStatuses: 0,
    documents: 0,
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
    taskStatuses: 0,
    documents: 0,
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
  // A v3 package brings its own statuses and creates them before routing any
  // task, so a label the package carries is known even to a workspace that has
  // never seen it. Checking only the workspace made the preview refuse exactly
  // the packages v3 exists to accept — the feature was unreachable from the
  // surface while the import underneath worked, and only the installed journey
  // showed it.
  assert.deepEqual(
    manifestStatusErrors(
      {
        ...parsed.manifest,
        version: 3,
        tasks: parsed.manifest.tasks.map((task) => ({
          ...task,
          statusLabel: "Czeka na klienta",
        })),
        taskStatuses: [
          {
            key: "status-waiting-client",
            label: "Czeka na klienta",
            operationalSemantics: "waiting",
          },
        ],
      },
      ["To do"],
    ),
    [],
  );

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
    taskStatuses: 0,
    documents: 0,
    areas: 0,
    initiatives: 0,
    projects: 1,
    tasks: 2,
    links: 2,
  });
  assert.deepEqual(
    run(),
    {
      taskStatuses: 0,
      documents: 0,
      areas: 0,
      initiatives: 0,
      projects: 1,
      tasks: 2,
      links: 2,
    },
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

test("an exported package re-imports elsewhere without duplicating anything", () => {
  // ADR-050 / R14.5. The exit property is a round trip: export produces
  // exactly the package the import engine accepts, a second workspace ends up
  // with the same work, and replaying the package changes nothing.
  const source = new InMemoryReferenceStore();
  const service = createRuntimeKernelService({ context, store: source });
  const spaceId = context.spaceScope[0]!;
  const bootstrap = (label: string) =>
    CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "workspace.createLocal",
      commandId: crypto.randomUUID(),
      workspaceId: context.workspaceId,
      idempotencyKey: label,
      expectedVersions: {},
      correlationId: crypto.randomUUID(),
      payload: {
        workspaceId: context.workspaceId,
        rootSpaceId: spaceId,
        ownerPrincipalId: context.principalId,
        name: "Export source",
        timezone: "Europe/Warsaw",
      },
    });
  assert.equal(
    service.execute(bootstrap("export-source")).kind,
    "command_outcome",
  );
  const seeded = parseStarterWorkspaceManifest(manifestValue);
  assert.ok(seeded);
  if (seeded === undefined) return;
  importStarterWorkspace({
    service,
    workspaceId: context.workspaceId,
    spaceId,
    deviceId: DeviceIdSchema.parse("export-source-device"),
    manifest: seeded,
  });

  const exported = buildExchangeManifest({
    store: source,
    workspaceId: context.workspaceId,
    spaceId,
  });
  assert.ok(exported);
  if (exported === undefined) return;
  assert.deepEqual(exported.counts, {
    // The bootstrap status the imported task sits in travels with it, so a
    // target that has never heard of it can still accept the package.
    taskStatuses: 1,
    documents: 0,
    areas: 1,
    initiatives: 1,
    projects: 1,
    tasks: 1,
  });
  // The package the writer produces is the package the reader validates —
  // one format, not a writer and a reader that can disagree.
  const reparsed = parseStarterWorkspaceManifest(
    JSON.parse(JSON.stringify(exported.manifest)) as unknown,
  );
  assert.ok(reparsed, "the exported package must satisfy the import parser");
  if (reparsed === undefined) return;

  const targetStore = new InMemoryReferenceStore();
  const target = createRuntimeKernelService({ context, store: targetStore });
  assert.equal(
    target.execute(bootstrap("export-target")).kind,
    "command_outcome",
  );
  const targetStatuses = targetStore.read((view) =>
    view.listTaskStatuses(context.workspaceId),
  );
  const targetWorkspace = targetStore.read((view) =>
    view.getWorkspace(context.workspaceId),
  );
  const applyToTarget = () =>
    importStarterWorkspace({
      service: target,
      workspaceId: context.workspaceId,
      spaceId,
      deviceId: DeviceIdSchema.parse("export-target-device"),
      manifest: reparsed,
      // Exactly what the desktop handler passes: a status label the target
      // does not have is refused, so the round trip only claims what the
      // target can actually hold.
      resolveStatusId: (label) =>
        targetStatuses.find(
          (status) =>
            status.label.toLocaleLowerCase("pl-PL") ===
            label.toLocaleLowerCase("pl-PL"),
        )?.id,
      ...(targetWorkspace === undefined
        ? {}
        : { defaultTaskStatusId: targetWorkspace.defaultTaskStatusId }),
    });
  assert.deepEqual(applyToTarget(), {
    taskStatuses: 0,
    documents: 0,
    areas: 1,
    initiatives: 1,
    projects: 1,
    tasks: 1,
    links: 3,
  });
  // Replay: the content-digest importId makes the same package idempotent.
  applyToTarget();

  const overview = target.query(
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
  if (
    overview.kind !== "query_result" ||
    overview.result.outcome !== "success" ||
    overview.result.projection.kind !== "work.overview"
  )
    throw new Error("Expected Work overview.");
  assert.equal(overview.result.projection.areas.length, 1);
  assert.equal(overview.result.projection.projects.length, 1);
  assert.equal(overview.result.projection.tasks.length, 1);
  assert.equal(overview.result.projection.tasks[0]?.title, "Review the week");
  // The waiting state and its reason survive the trip, not just the title.
  assert.equal(
    overview.result.projection.tasks[0]?.operationalState,
    "waiting",
  );

  // v4: a document and its text travel with the work they explain. The text
  // port is injected exactly as the desktop injects it, and the round trip
  // reads back through the same port.
  const documentText = new Map<string, string>();
  const documentPackage = {
    ...reparsed,
    version: 4 as const,
    importId: "20000000-0000-4000-8000-0000000000d1",
    documents: [
      {
        key: "handover-note",
        title: "Notatka z przekazania",
        role: "note" as const,
        text: "Ustalenia z klientem: termin i zakres.",
      },
    ],
  };
  const documentStore = new InMemoryReferenceStore();
  const documentService = createRuntimeKernelService({
    context,
    store: documentStore,
  });
  assert.equal(
    documentService.execute(bootstrap("export-documents")).kind,
    "command_outcome",
  );
  const documentStatuses = documentStore.read((view) =>
    view.listTaskStatuses(context.workspaceId),
  );
  const documentWorkspace = documentStore.read((view) =>
    view.getWorkspace(context.workspaceId),
  );
  const documentApplied = importStarterWorkspace({
    service: documentService,
    workspaceId: context.workspaceId,
    spaceId,
    deviceId: DeviceIdSchema.parse("export-documents-device"),
    manifest: documentPackage,
    resolveStatusId: (label) =>
      documentStatuses.find(
        (status) =>
          status.label.toLocaleLowerCase("pl-PL") ===
          label.toLocaleLowerCase("pl-PL"),
      )?.id,
    existingStatusLabels: documentStatuses.map((status) => status.label),
    ...(documentWorkspace === undefined
      ? {}
      : { defaultTaskStatusId: documentWorkspace.defaultTaskStatusId }),
    writeDocumentText: ({ documentId, text }) => {
      documentText.set(documentId, text);
    },
  });
  assert.equal(documentApplied.documents, 1);
  const importedDocument = documentStore
    .read((view) =>
      isApplicationWave2ReadView(view)
        ? view.listDocuments(context.workspaceId, spaceId)
        : [],
    )
    .find((document) => document.title === "Notatka z przekazania");
  assert.ok(importedDocument);
  assert.equal(importedDocument?.role, "note");
  assert.equal(
    documentText.get(importedDocument?.id),
    "Ustalenia z klientem: termin i zakres.",
  );
  const documentExport = buildExchangeManifest({
    store: documentStore,
    workspaceId: context.workspaceId,
    spaceId,
    readDocumentText: ({ documentId }) => documentText.get(documentId),
  });
  assert.equal(documentExport?.counts.documents, 1);
  assert.deepEqual(
    documentExport?.manifest.documents?.map((document) => [
      document.title,
      document.role,
      document.text,
    ]),
    [
      [
        "Notatka z przekazania",
        "note",
        "Ustalenia z klientem: termin i zakres.",
      ],
    ],
  );

  // A custom status travels with the tasks that name it: without the v3
  // configuration section this import would fail on an unknown status label,
  // which is the R14.5 gap ADR-052 closes.
  const customStore = new InMemoryReferenceStore();
  const custom = createRuntimeKernelService({ context, store: customStore });
  assert.equal(
    custom.execute(bootstrap("export-custom")).kind,
    "command_outcome",
  );
  const statusesBeforeImport = customStore.read((view) =>
    view.listTaskStatuses(context.workspaceId),
  );
  const customApplied = importStarterWorkspace({
    service: custom,
    workspaceId: context.workspaceId,
    spaceId,
    deviceId: DeviceIdSchema.parse("export-custom-device"),
    manifest: {
      ...reparsed,
      importId: "20000000-0000-4000-8000-0000000000c1",
      taskStatuses: [
        {
          key: "status-custom",
          label: "Czeka na klienta",
          operationalSemantics: "waiting",
        },
      ],
      tasks: reparsed.tasks.map((task) => ({
        ...task,
        statusLabel: "Czeka na klienta",
      })),
    },
    // Exactly how the desktop handler is written: the status list is read
    // once, before the import, and the resolver closes over that snapshot. A
    // resolver that re-read the store on every call would be more capable
    // than the real caller and would hide the case this test exists for.
    resolveStatusId: (label) =>
      statusesBeforeImport.find(
        (status) =>
          status.label.toLocaleLowerCase("pl-PL") ===
          label.toLocaleLowerCase("pl-PL"),
      )?.id,
    existingStatusLabels: statusesBeforeImport.map((status) => status.label),
  });
  assert.equal(customApplied.taskStatuses, 1);
  assert.equal(
    customStore
      .read((view) => view.listTaskStatuses(context.workspaceId))
      .some((status) => status.label === "Czeka na klienta"),
    true,
  );

  // Stability is per workspace, not across them: keys are record ids, so two
  // workspaces holding equivalent work honestly export different keys. What
  // must hold is that exporting one workspace twice yields the same package,
  // which is what makes a re-import a no-op rather than a duplicate.
  const again = buildExchangeManifest({
    store: source,
    workspaceId: context.workspaceId,
    spaceId,
  });
  assert.equal(again?.manifest.importId, exported.manifest.importId);
  const targetExport = buildExchangeManifest({
    store: targetStore,
    workspaceId: context.workspaceId,
    spaceId,
  });
  assert.deepEqual(targetExport?.counts, exported.counts);
  assert.deepEqual(
    targetExport?.manifest.tasks.map((task) => [
      task.title,
      task.operationalState,
      task.waitingOn,
    ]),
    exported.manifest.tasks.map((task) => [
      task.title,
      task.operationalState,
      task.waitingOn,
    ]),
  );
});
