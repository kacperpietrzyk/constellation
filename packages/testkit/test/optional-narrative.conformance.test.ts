import assert from "node:assert/strict";
import { it } from "node:test";

import { type ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  type CommandOutcome,
  type ExecutionContext,
  type QueryResult,
} from "@constellation/contracts";

import { createReferenceHarness, type ReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "21000000-0000-4000-8000-000000000001",
  space: "21000000-0000-4000-8000-000000000002",
  principal: "21000000-0000-4000-8000-000000000003",
  credential: "21000000-0000-4000-8000-000000000004",
  grant: "21000000-0000-4000-8000-000000000005",
} as const;

let sequence = 100;
const uuid = (): string =>
  `21000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

const context = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.principal,
    principalKind: "human",
    credentialId: ids.credential,
    grantId: ids.grant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.space],
    capabilityScope: [
      "workspace.createLocal",
      "project.create",
      "project.updateOutcome",
      "project.list",
      "project.operationalOverview",
      "area.create",
      "area.updateResponsibility",
      "initiative.create",
      "initiative.updateOutcome",
      "work.overview",
      "cockpit.week",
      "relationship.workspace",
      "search.global",
      "command.previewUndo",
      "command.undo",
    ],
    origin: "desktop",
  });

const metadata = (key: string, expectedVersions = {}) => ({
  contractVersion: 1 as const,
  commandId: uuid(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions,
  correlationId: uuid(),
});

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome") throw new Error("Expected outcome.");
  return response.outcome;
};

const query = (harness: ReferenceHarness, envelope: unknown): QueryResult => {
  const response = harness.kernel.query(context(), envelope as never);
  assert.equal(response.kind, "query_result");
  if (response.kind !== "query_result") throw new Error("Expected a result.");
  return response.result;
};

const areaId = uuid();
const initiativeId = uuid();
const projectId = uuid();

const setup = (): ReferenceHarness => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Imported workspace",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  for (const command of [
    {
      ...metadata("area"),
      commandName: "area.create" as const,
      payload: {
        areaId,
        spaceId: ids.space,
        title: "Client delivery",
      },
    },
    {
      ...metadata("initiative"),
      commandName: "initiative.create" as const,
      payload: {
        initiativeId,
        spaceId: ids.space,
        title: "Migrate the archive",
      },
    },
    {
      ...metadata("project"),
      commandName: "project.create" as const,
      payload: {
        projectId,
        spaceId: ids.space,
        title: "Rebuild the reporting pack",
      },
    },
  ])
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
      `${command.commandName} refused a record with no narrative`,
    );
  return harness;
};

it("imports strategic records whose narrative was never written", () => {
  const harness = setup();

  // Every projection that carries the narrative has to survive its absence:
  // each one is built through a strict parse, so a missed site is a thrown
  // query rather than a blank field.
  const projects = query(harness, {
    queryName: "project.list",
    contractVersion: 1,
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    projects.outcome !== "success" ||
    projects.projection.kind !== "project.list"
  )
    assert.fail("Expected a project list.");
  const listed = projects.projection.items.find(
    (item) => item.id === projectId,
  );
  assert.equal(listed?.intendedOutcome, "");
  assert.equal(listed?.needsReview, true);

  const overview = query(harness, {
    queryName: "work.overview",
    contractVersion: 1,
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    overview.outcome !== "success" ||
    overview.projection.kind !== "work.overview"
  )
    assert.fail("Expected a work overview.");
  assert.equal(
    overview.projection.projects.find((item) => item.id === projectId)
      ?.needsReview,
    true,
  );
  assert.equal(
    overview.projection.areas.find((item) => item.id === areaId)?.needsReview,
    true,
  );
  assert.equal(
    overview.projection.initiatives.find((item) => item.id === initiativeId)
      ?.needsReview,
    true,
  );

  const operational = query(harness, {
    queryName: "project.operationalOverview",
    contractVersion: 1,
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { projectId },
  });
  if (
    operational.outcome !== "success" ||
    operational.projection.kind !== "project.operationalOverview"
  )
    assert.fail("Expected an operational overview.");
  assert.equal(operational.projection.project.intendedOutcome, "");
  assert.equal(operational.projection.project.needsReview, true);

  const week = query(harness, {
    queryName: "cockpit.week",
    contractVersion: 1,
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, weekStart: "2026-07-20" },
  });
  assert.equal(week.outcome, "success");

  const records = query(harness, {
    queryName: "relationship.workspace",
    contractVersion: 1,
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    records.outcome !== "success" ||
    records.projection.kind !== "relationship.workspace"
  )
    assert.fail("Expected a relationship workspace.");
  const area = records.projection.records.find(
    (record) => record.id === areaId,
  );
  assert.equal(area?.kind === "area" ? area.responsibility : undefined, "");
  assert.equal(area?.kind === "area" ? area.needsReview : undefined, true);
  const initiative = records.projection.records.find(
    (record) => record.id === initiativeId,
  );
  assert.equal(
    initiative?.kind === "initiative" ? initiative.intendedOutcome : undefined,
    "",
  );
  assert.equal(
    initiative?.kind === "initiative" ? initiative.needsReview : undefined,
    true,
  );
});

it("finds a narrative-less Project by title without matching the absent field", () => {
  const harness = setup();
  const byTitle = query(harness, {
    queryName: "search.global",
    contractVersion: 1,
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceIds: [ids.space], text: "reporting pack" },
  });
  if (
    byTitle.outcome !== "success" ||
    byTitle.projection.kind !== "search.global"
  )
    assert.fail("Expected search results.");
  const hit = byTitle.projection.items.find(
    (item) => item.recordId === projectId,
  );
  assert.deepEqual(hit?.matchedFields, ["title"]);
  assert.equal(hit?.snippet, "Rebuild the reporting pack");
});

it("fills a missing narrative in and undoes the edit back to unwritten", () => {
  const harness = setup();
  const narratives = () => {
    const records = query(harness, {
      queryName: "relationship.workspace",
      contractVersion: 1,
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space },
    });
    if (
      records.outcome !== "success" ||
      records.projection.kind !== "relationship.workspace"
    )
      assert.fail("Expected a relationship workspace.");
    const area = records.projection.records.find(
      (record) => record.id === areaId,
    );
    const initiative = records.projection.records.find(
      (record) => record.id === initiativeId,
    );
    const projects = query(harness, {
      queryName: "project.list",
      contractVersion: 1,
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space },
    });
    if (
      projects.outcome !== "success" ||
      projects.projection.kind !== "project.list"
    )
      assert.fail("Expected a project list.");
    const project = projects.projection.items.find(
      (item) => item.id === projectId,
    );
    return {
      area: area?.kind === "area" ? area : undefined,
      initiative: initiative?.kind === "initiative" ? initiative : undefined,
      project,
    };
  };

  const edits = [
    {
      ...metadata("area-fill", { [areaId]: 1 }),
      commandName: "area.updateResponsibility" as const,
      payload: { areaId, responsibility: "Keep delivery commitments healthy." },
    },
    {
      ...metadata("initiative-fill", { [initiativeId]: 1 }),
      commandName: "initiative.updateOutcome" as const,
      payload: {
        initiativeId,
        intendedOutcome: "The archive runs on the new store.",
      },
    },
    {
      ...metadata("project-fill", { [projectId]: 1 }),
      commandName: "project.updateOutcome" as const,
      payload: { projectId, intendedOutcome: "One pack every finance reads." },
    },
  ];
  for (const edit of edits)
    assert.equal(
      unwrap(harness.kernel.execute(context(), edit)).outcome,
      "success",
    );

  const filled = narratives();
  assert.equal(
    filled.area?.responsibility,
    "Keep delivery commitments healthy.",
  );
  assert.equal(filled.area?.needsReview, false);
  assert.equal(
    filled.initiative?.intendedOutcome,
    "The archive runs on the new store.",
  );
  assert.equal(filled.initiative?.needsReview, false);
  assert.equal(
    filled.project?.intendedOutcome,
    "One pack every finance reads.",
  );
  assert.equal(filled.project?.needsReview, false);

  // Undoing an edit that filled a blank has to reach the state the record was
  // imported in, not an empty string standing in for it.
  for (const edit of [...edits].reverse()) {
    const preview = unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`${edit.idempotencyKey}-preview`),
        commandName: "command.previewUndo",
        payload: { targetCommandId: edit.commandId },
      }),
    );
    if (
      preview.outcome !== "preview" ||
      preview.projection.kind !== "undo.previewed"
    )
      assert.fail(`Expected an undo preview for ${edit.commandName}.`);
    assert.equal(preview.projection.available, true);
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(
            `${edit.idempotencyKey}-undo`,
            preview.projection.requiredVersions,
          ),
          commandName: "command.undo",
          payload: { targetCommandId: edit.commandId },
        }),
      ).outcome,
      "success",
    );
  }

  const restored = narratives();
  assert.equal(restored.area?.responsibility, "");
  assert.equal(restored.area?.needsReview, true);
  assert.equal(restored.initiative?.intendedOutcome, "");
  assert.equal(restored.initiative?.needsReview, true);
  assert.equal(restored.project?.intendedOutcome, "");
  assert.equal(restored.project?.needsReview, true);
});

it("refuses area.updateResponsibility against a missing or wrong-kind record", () => {
  const harness = setup();

  // A wrong-kind target (an initiative) still resolves a space, so authorization
  // passes and the `current?.kind !== "area"` guard is what rejects the edit.
  const wrongKind = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("area-wrong-kind"),
      commandName: "area.updateResponsibility",
      payload: {
        areaId: initiativeId,
        responsibility: "Keep delivery commitments healthy.",
      },
    }),
  );
  assert.equal(wrongKind.outcome, "rejected");
  assert.equal(wrongKind.diagnosticCode, "command.precondition_failed");

  // A non-existent id resolves no space, so the authorization pass refuses it
  // before the handler ever runs. It reports the same precondition as the
  // wrong-kind target: the grant carried area.updateResponsibility in both, so
  // neither refusal is a statement about the grant.
  const missing = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("area-missing"),
      commandName: "area.updateResponsibility",
      payload: {
        areaId: uuid(),
        responsibility: "Keep delivery commitments healthy.",
      },
    }),
  );
  assert.equal(missing.outcome, "rejected");
  assert.equal(missing.diagnosticCode, "command.precondition_failed");
});

it("refuses initiative.updateOutcome against a missing or wrong-kind record", () => {
  const harness = setup();

  // A wrong-kind target (an area) resolves a space, so authorization passes and
  // the `current?.kind !== "initiative"` guard is what rejects the edit.
  const wrongKind = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("initiative-wrong-kind"),
      commandName: "initiative.updateOutcome",
      payload: {
        initiativeId: areaId,
        intendedOutcome: "The archive runs on the new store.",
      },
    }),
  );
  assert.equal(wrongKind.outcome, "rejected");
  assert.equal(wrongKind.diagnosticCode, "command.precondition_failed");

  // Same precondition as the wrong-kind target, for the same reason: the grant
  // carried the capability, so the refusal is not about the grant.
  const missing = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("initiative-missing"),
      commandName: "initiative.updateOutcome",
      payload: {
        initiativeId: uuid(),
        intendedOutcome: "The archive runs on the new store.",
      },
    }),
  );
  assert.equal(missing.outcome, "rejected");
  assert.equal(missing.diagnosticCode, "command.precondition_failed");
});
