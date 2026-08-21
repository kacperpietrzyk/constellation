import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "92000000-0000-4000-8000-000000000001",
  space: "92000000-0000-4000-8000-000000000002",
  principal: "92000000-0000-4000-8000-000000000003",
  credential: "92000000-0000-4000-8000-000000000004",
  grant: "92000000-0000-4000-8000-000000000005",
  project: "92000000-0000-4000-8000-000000000101",
  task: "92000000-0000-4000-8000-000000000102",
} as const;
let sequence = 1_000;
const uuid = () =>
  `92000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;
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
    "project.create",
    "project.list",
    "project.close",
    "task.create",
    "task.list",
    "record.relate",
    "recovery.preview",
  ],
  origin: "desktop",
});
const metadata = (
  key: string,
  expectedVersions: Readonly<Record<string, number>> = {},
) => ({
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
const setup = () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context);
  assert.equal(
    unwrap(
      harness.kernel.execute(context, {
        ...metadata("bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Atomic Task",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context, {
        ...metadata("project"),
        commandName: "project.create",
        payload: {
          projectId: ids.project,
          spaceId: ids.space,
          title: "Existing delivery",
        },
      }),
    ).outcome,
    "success",
  );
  return harness;
};

describe("atomic Task-in-Project creation", () => {
  it("creates the Task and its Project relation in one command", () => {
    const harness = setup();
    const command = metadata("task-in-project", { [ids.project]: 1 });
    const result = unwrap(
      harness.kernel.execute(context, {
        ...command,
        commandName: "task.createInProject",
        payload: {
          taskId: ids.task,
          projectId: ids.project,
          spaceId: ids.space,
          title: "Prepare migration plan",
        },
      } as never),
    );
    assert.equal(result.outcome, "success");
    if (result.outcome !== "success") throw new Error("Expected success.");
    const projection = result.projection as unknown as Record<string, unknown>;
    assert.equal(projection.kind, "task.created_in_project");
    assert.equal(projection.taskId, ids.task);
    assert.equal(projection.projectId, ids.project);
    assert.equal(typeof projection.relationId, "string");

    const state = harness.store.snapshot();
    assert.equal(
      state.tasks.some((task) => task.id === ids.task),
      true,
    );
    assert.equal(
      state.relations.some(
        (relation) =>
          relation.state === "active" &&
          relation.relationType === "task_contributes_to_project" &&
          relation.taskId === ids.task &&
          relation.projectId === ids.project,
      ),
      true,
    );

    const preview = harness.kernel.query(context, {
      contractVersion: 1,
      queryName: "recovery.preview",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { targetCommandId: command.commandId },
    });
    assert.equal(preview.kind, "query_result");
    if (
      preview.kind !== "query_result" ||
      preview.result.outcome !== "success" ||
      preview.result.projection.kind !== "recovery.preview"
    )
      throw new Error("Expected recovery preview.");
    assert.equal(preview.result.projection.available, true);
  });

  it("refuses to create work inside a closed Project", () => {
    const harness = setup();
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("close-project", { [ids.project]: 1 }),
          commandName: "project.close",
          payload: { projectId: ids.project },
        }),
      ).outcome,
      "success",
    );

    const result = unwrap(
      harness.kernel.execute(context, {
        ...metadata("task-in-closed-project", { [ids.project]: 2 }),
        commandName: "task.createInProject",
        payload: {
          taskId: ids.task,
          projectId: ids.project,
          spaceId: ids.space,
          title: "Work that must not be created",
        },
      } as never),
    );

    assert.equal(result.outcome, "rejected");
    assert.equal(harness.store.snapshot().tasks.length, 0);
    assert.equal(harness.store.snapshot().relations.length, 0);
  });
});
