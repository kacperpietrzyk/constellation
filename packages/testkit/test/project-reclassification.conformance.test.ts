import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ExecutionContextSchema,
  ProjectIdSchema,
  type CommandOutcome,
} from "@constellation/contracts";

import { createReferenceHarness } from "../src/index.js";

const id = (suffix: string) =>
  `76100000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const workspaceId = id("1");
const spaceId = id("2");
const principalId = id("3");
const projectId = ProjectIdSchema.parse(id("4"));
let sequence = 100;
const nextId = () => id(String(sequence++));

const context = ExecutionContextSchema.parse({
  principalId,
  principalKind: "human",
  credentialId: id("5"),
  grantId: id("6"),
  policyVersion: 1,
  workspaceId,
  spaceScope: [spaceId],
  capabilityScope: [
    "workspace.createLocal",
    "workspace.bootstrapContext",
    "project.create",
    "project.reclassify",
    "relationship.organizationCreate",
    "relationship.personCreate",
    "project.list",
    "project.checkInAdd",
    "knowledge.sourceCreate",
    "task.create",
    "record.relate",
    "comment.add",
    "area.create",
    "initiative.create",
    "work.overview",
    "command.previewUndo",
    "command.undo",
  ],
  origin: "desktop",
});

const metadata = (key: string, expectedVersions: Record<string, number>) => ({
  contractVersion: 1 as const,
  commandId: nextId(),
  workspaceId,
  idempotencyKey: key,
  expectedVersions,
  correlationId: nextId(),
});

const unwrap = (value: unknown): CommandOutcome => {
  assert.equal((value as { kind?: string }).kind, "command_outcome");
  return (value as { outcome: CommandOutcome }).outcome;
};

describe("Project reclassification", () => {
  it("reclassifies into a mechanically linked Initiative without closing the source and records reversible lineage", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context);
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("bootstrap", {}),
          commandName: "workspace.createLocal",
          payload: {
            workspaceId,
            rootSpaceId: spaceId,
            ownerPrincipalId: principalId,
            name: "Reclassification",
            timezone: "Europe/Warsaw",
          },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("project", {}),
          commandName: "project.create",
          payload: {
            projectId,
            spaceId,
            title: "Operate the work system",
            intendedOutcome: "A durable ongoing product outcome",
          },
        }),
      ).outcome,
      "success",
    );

    const sourceId = id("30");
    const taskId = id("31");
    const commentId = id("33");
    const checkInId = id("34");
    for (const artifact of [
      {
        ...metadata("history-source", {}),
        commandName: "knowledge.sourceCreate" as const,
        payload: {
          sourceId,
          spaceId,
          sourceKind: "excerpt" as const,
          title: "Classification evidence",
          excerpt: "The work is ongoing responsibility.",
          availability: "available" as const,
          observedAt: "2026-08-21T08:00:00.000Z",
        },
      },
      {
        ...metadata("history-task", {}),
        commandName: "task.create" as const,
        payload: { taskId, spaceId, title: "Preserved task" },
      },
      {
        ...metadata("history-relation", { [taskId]: 1, [projectId]: 1 }),
        commandName: "record.relate" as const,
        payload: {
          relationType: "task_contributes_to_project" as const,
          taskId,
          projectId,
        },
      },
      {
        ...metadata("history-comment", { [projectId]: 1 }),
        commandName: "comment.add" as const,
        payload: {
          commentId,
          target: { kind: "project" as const, projectId },
          body: "Keep this discussion with the reclassified work.",
          mentionPrincipalIds: [],
        },
      },
      {
        ...metadata("history-check-in", {
          [projectId]: 1,
          [taskId]: 1,
          [sourceId]: 1,
        }),
        commandName: "project.checkInAdd" as const,
        payload: {
          checkInId,
          projectId,
          summary: "The project is ongoing responsibility, not a delivery.",
          evidenceSourceIds: [sourceId],
          references: [{ kind: "task" as const, recordId: taskId }],
        },
      },
    ])
      assert.equal(
        unwrap(harness.kernel.execute(context, artifact)).outcome,
        "success",
      );
    const relationId = harness.store.snapshot().relations[0]!.id;

    const command = {
      ...metadata("reclassify", { [projectId]: 1 }),
      commandName: "project.reclassify" as const,
      payload: {
        projectId,
        destination: {
          mode: "create" as const,
          kind: "initiative" as const,
          targetId: id("7"),
          title: "Operate the work system",
          intendedOutcome: "A durable ongoing product outcome",
        },
      },
    };
    const preview = harness.kernel.query(context, {
      contractVersion: 1,
      queryId: nextId(),
      workspaceId,
      consistency: "local_authoritative",
      queryName: "project.reclassificationPreview",
      parameters: {
        projectId,
        destination: {
          mode: "create",
          kind: "initiative",
          targetId: id("7"),
          title: "Operate the work system",
          intendedOutcome: "A durable ongoing product outcome",
        },
      },
    });
    if (
      preview.kind !== "query_result" ||
      preview.result.outcome !== "success" ||
      preview.result.projection.kind !== "project.reclassificationPreview"
    )
      assert.fail("Expected an authoritative reclassification preview.");
    assert.equal(preview.result.projection.canApply, true);
    assert.deepEqual(preview.result.projection.expectedVersions, {
      [projectId]: 1,
    });
    assert.deepEqual(preview.result.projection.history.bodyOwner, {
      kind: "project",
      projectId,
    });
    assert.deepEqual(preview.result.projection.history.checkInIds, [checkInId]);
    assert.deepEqual(preview.result.projection.history.commentIds, [commentId]);
    assert.deepEqual(preview.result.projection.history.evidenceSourceIds, [
      sourceId,
    ]);
    assert.deepEqual(preview.result.projection.history.taskIds, [taskId]);
    assert.deepEqual(preview.result.projection.history.relationIds, [
      relationId,
    ]);
    assert.equal(preview.result.projection.history.eventIds.length >= 6, true);
    assert.equal(
      preview.result.projection.history.auditReceiptIds.length >= 6,
      true,
    );

    const result = unwrap(harness.kernel.execute(context, command));
    assert.equal(result.outcome, "success");

    const snapshot = harness.store.snapshot();
    const source = snapshot.projects.find(
      (item) => item.id === projectId,
    ) as unknown as
      | {
          lifecycle: string;
          reclassifiedTo?: {
            kind: string;
            targetId: string;
            commandId: string;
          };
        }
      | undefined;
    const target = snapshot.strategicRecords?.find(
      (item) => item.id === id("7") && item.kind === "initiative",
    ) as unknown as
      { reclassifiedFromProjectIds?: readonly string[] } | undefined;
    assert.deepEqual(source?.reclassifiedTo, {
      kind: "initiative",
      targetId: id("7"),
      commandId: command.commandId,
    });
    assert.equal(source?.lifecycle, "active");
    assert.deepEqual(target?.reclassifiedFromProjectIds, [projectId]);

    const projectList = harness.kernel.query(context, {
      contractVersion: 1,
      queryId: nextId(),
      workspaceId,
      consistency: "local_authoritative",
      queryName: "project.list",
      parameters: { spaceId },
    });
    if (
      projectList.kind !== "query_result" ||
      projectList.result.outcome !== "success" ||
      projectList.result.projection.kind !== "project.list"
    )
      assert.fail("Expected Project list after reclassification.");
    assert.equal(
      projectList.result.projection.items.some((item) => item.id === projectId),
      false,
    );

    const undoPreview = unwrap(
      harness.kernel.execute(context, {
        ...metadata("preview-reclassification-undo", {}),
        commandName: "command.previewUndo",
        payload: { targetCommandId: command.commandId },
      }),
    );
    assert.equal(undoPreview.outcome, "preview");
    if (
      undoPreview.outcome !== "preview" ||
      undoPreview.projection.kind !== "undo.previewed"
    )
      assert.fail("Expected reclassification undo preview.");
    assert.equal(undoPreview.projection.available, true);

    const replay = unwrap(
      harness.kernel.execute(context, {
        ...command,
        commandId: nextId(),
        correlationId: nextId(),
      }),
    );
    assert.deepEqual(replay, result);
    assert.equal(
      harness.store
        .snapshot()
        .strategicRecords?.filter(
          (item) => item.id === id("7") && item.kind === "initiative",
        ).length,
      1,
    );

    const undone = unwrap(
      harness.kernel.execute(context, {
        ...metadata(
          "undo-reclassification",
          undoPreview.projection.requiredVersions,
        ),
        commandName: "command.undo",
        payload: { targetCommandId: command.commandId },
      }),
    );
    assert.equal(undone.outcome, "success");
    const afterUndo = harness.store.snapshot();
    assert.equal(
      afterUndo.projects.find((item) => item.id === projectId)?.reclassifiedTo,
      undefined,
    );
    assert.equal(
      afterUndo.strategicRecords?.find((item) => item.id === id("7"))
        ?.recordState,
      "removed",
    );
  });

  it("merges into an existing Area with both expected versions and undo preserves the target", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context);
    const run = (command: Parameters<typeof harness.kernel.execute>[1]) =>
      unwrap(harness.kernel.execute(context, command));
    assert.equal(
      run({
        ...metadata("merge-bootstrap", {}),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId,
          rootSpaceId: spaceId,
          ownerPrincipalId: principalId,
          name: "Merge reclassification",
          timezone: "Europe/Warsaw",
        },
      }).outcome,
      "success",
    );
    const areaId = id("20");
    const sourceId = ProjectIdSchema.parse(id("21"));
    assert.equal(
      run({
        ...metadata("merge-area", {}),
        commandName: "area.create",
        payload: { areaId, spaceId, title: "Product stewardship" },
      }).outcome,
      "success",
    );
    assert.equal(
      run({
        ...metadata("merge-project", {}),
        commandName: "project.create",
        payload: { projectId: sourceId, spaceId, title: "Maintain product" },
      }).outcome,
      "success",
    );

    const stale = run({
      ...metadata("merge-stale", { [sourceId]: 1 }),
      commandName: "project.reclassify",
      payload: {
        projectId: sourceId,
        destination: { mode: "merge", kind: "area", targetId: areaId },
      },
    });
    assert.equal(stale.outcome, "conflict");
    if (stale.outcome !== "conflict" || !("currentVersions" in stale))
      assert.fail("Expected merge conflict.");
    assert.deepEqual(stale.currentVersions, { [sourceId]: 1, [areaId]: 1 });

    const mergeCommand = {
      ...metadata("merge-apply", { [sourceId]: 1, [areaId]: 1 }),
      commandName: "project.reclassify" as const,
      payload: {
        projectId: sourceId,
        destination: {
          mode: "merge" as const,
          kind: "area" as const,
          targetId: areaId,
        },
      },
    };
    assert.equal(run(mergeCommand).outcome, "success");
    const merged = harness.store
      .snapshot()
      .strategicRecords?.find((item) => item.id === areaId);
    assert.deepEqual(merged?.reclassifiedFromProjectIds, [sourceId]);

    const preview = run({
      ...metadata("merge-undo-preview", {}),
      commandName: "command.previewUndo",
      payload: { targetCommandId: mergeCommand.commandId },
    });
    if (
      preview.outcome !== "preview" ||
      preview.projection.kind !== "undo.previewed"
    )
      assert.fail("Expected merge undo preview.");
    assert.equal(preview.projection.available, true);
    assert.equal(
      run({
        ...metadata("merge-undo", preview.projection.requiredVersions),
        commandName: "command.undo",
        payload: { targetCommandId: mergeCommand.commandId },
      }).outcome,
      "success",
    );
    const restored = harness.store.snapshot();
    assert.equal(
      restored.projects.find((item) => item.id === sourceId)?.reclassifiedTo,
      undefined,
    );
    const restoredArea = restored.strategicRecords?.find(
      (item) => item.id === areaId,
    );
    assert.equal(restoredArea?.recordState, undefined);
    assert.deepEqual(restoredArea?.reclassifiedFromProjectIds, []);
  });

  it("rejects invalid Opportunity references and stage identically in preview and apply without writes", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context);
    const run = (command: Parameters<typeof harness.kernel.execute>[1]) =>
      unwrap(harness.kernel.execute(context, command));
    assert.equal(
      run({
        ...metadata("invalid-bootstrap", {}),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId,
          rootSpaceId: spaceId,
          ownerPrincipalId: principalId,
          name: "Invalid destination guards",
          timezone: "Europe/Warsaw",
        },
      }).outcome,
      "success",
    );
    const guardedProjectId = ProjectIdSchema.parse(id("40"));
    const organizationId = id("41");
    const personId = id("42");
    const sourceId = id("43");
    for (const command of [
      {
        ...metadata("invalid-project", {}),
        commandName: "project.create" as const,
        payload: {
          projectId: guardedProjectId,
          spaceId,
          title: "Guard this Project",
        },
      },
      {
        ...metadata("invalid-organization", {}),
        commandName: "relationship.organizationCreate" as const,
        payload: {
          organizationId,
          spaceId,
          name: "Valid organization",
          relationshipState: "active" as const,
        },
      },
      {
        ...metadata("invalid-person", {}),
        commandName: "relationship.personCreate" as const,
        payload: { personId, spaceId, name: "Valid person" },
      },
      {
        ...metadata("invalid-evidence", {}),
        commandName: "knowledge.sourceCreate" as const,
        payload: {
          sourceId,
          spaceId,
          sourceKind: "excerpt" as const,
          title: "Valid evidence",
          excerpt: "A bounded source.",
          availability: "available" as const,
          observedAt: "2026-08-21T08:00:00.000Z",
        },
      },
    ])
      assert.equal(run(command).outcome, "success");
    const bootstrap = harness.kernel.query(context, {
      contractVersion: 1,
      queryId: nextId(),
      workspaceId,
      consistency: "local_authoritative",
      queryName: "workspace.bootstrapContext",
      parameters: {},
    });
    if (
      bootstrap.kind !== "query_result" ||
      bootstrap.result.outcome !== "success" ||
      bootstrap.result.projection.kind !== "workspace.bootstrapContext"
    )
      assert.fail("Expected bootstrap defaults.");
    const stage =
      bootstrap.result.projection.workspace.commercialDefaults.stages[0]!.id;
    const valid = {
      mode: "create" as const,
      kind: "opportunity" as const,
      title: "Guarded opportunity",
      organizationId,
      personIds: [personId],
      ownerPersonId: personId,
      need: "A confirmed need",
      qualification: "A confirmed qualification",
      stage,
      nextAction: "Take the next action",
      evidenceSourceIds: [sourceId],
    };
    const invalidDestinations = [
      { ...valid, targetId: id("50"), organizationId: id("90") },
      { ...valid, targetId: id("51"), personIds: [id("91")] },
      { ...valid, targetId: id("52"), ownerPersonId: id("92") },
      { ...valid, targetId: id("53"), evidenceSourceIds: [id("93")] },
      { ...valid, targetId: id("54"), stage: "not-a-workspace-stage" },
    ];
    for (const [index, destination] of invalidDestinations.entries()) {
      const preview = harness.kernel.query(context, {
        contractVersion: 1,
        queryId: nextId(),
        workspaceId,
        consistency: "local_authoritative",
        queryName: "project.reclassificationPreview",
        parameters: { projectId: guardedProjectId, destination },
      });
      if (
        preview.kind !== "query_result" ||
        preview.result.outcome !== "success" ||
        preview.result.projection.kind !== "project.reclassificationPreview"
      )
        assert.fail("Expected a bounded invalid-destination preview.");
      assert.equal(preview.result.projection.canApply, false);
      assert.equal(
        preview.result.projection.blockedReason,
        "destination_invalid",
      );
      const applied = run({
        ...metadata(`invalid-apply-${index}`, { [guardedProjectId]: 1 }),
        commandName: "project.reclassify",
        payload: { projectId: guardedProjectId, destination },
      });
      assert.equal(applied.outcome, "rejected");
      assert.equal(applied.diagnosticCode, "command.precondition_failed");
      const state = harness.store.snapshot();
      assert.equal(
        state.projects.find((project) => project.id === guardedProjectId)
          ?.version,
        1,
      );
      assert.equal(
        state.strategicRecords?.some(
          (record) => record.id === destination.targetId,
        ),
        false,
      );
    }
  });
});
