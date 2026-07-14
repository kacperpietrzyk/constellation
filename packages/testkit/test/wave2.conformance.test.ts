import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isApplicationWave2Transaction,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  ExecutionContextSchema,
  ProjectIdSchema,
  SpaceIdSchema,
  TaskStatusIdSchema,
  type CommandOutcome,
  type ExecutionContext,
  type ProjectId,
  type RelationId,
  type TaskId,
} from "@constellation/contracts";

import {
  createReferenceHarness,
  type FailureBoundary,
  type ReferenceHarness,
} from "../src/index.js";

const ids = {
  workspace: "10000000-0000-4000-8000-000000000001",
  rootSpace: "10000000-0000-4000-8000-000000000002",
  principal: "10000000-0000-4000-8000-000000000003",
  credential: "10000000-0000-4000-8000-000000000004",
  grant: "10000000-0000-4000-8000-000000000005",
} as const;

let sequence = 4_096;
const requestId = (): string => {
  const suffix = sequence.toString(16).padStart(12, "0");
  sequence += 1;
  return `10000000-0000-4000-8000-${suffix}`;
};

const context = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.principal,
    principalKind: "human",
    credentialId: ids.credential,
    grantId: ids.grant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.rootSpace],
    capabilityScope: [
      "workspace.createLocal",
      "capture.submitText",
      "capture.routeAsTask",
      "project.create",
      "project.updateOutcome",
      "project.list",
      "project.operationalOverview",
      "task.setStatus",
      "task.complete",
      "task.reopen",
      "task.assign",
      "task.unassign",
      "comment.add",
      "comment.edit",
      "comment.resolve",
      "comment.reopen",
      "comment.list",
      "comment.mentionCandidates",
      "attention.inbox",
      "attention.markRead",
      "attention.dismiss",
      "record.relate",
      "record.unrelate",
      "task.list",
      "search.global",
      "cockpit.week",
      "activity.meaningful",
      "capture.history",
      "command.previewUndo",
      "command.undo",
      "recovery.preview",
      "audit.receipt",
    ],
    origin: "desktop",
  });

const metadata = (idempotencyKey: string, expectedVersions = {}) => ({
  contractVersion: 1,
  commandId: requestId(),
  workspaceId: ids.workspace,
  idempotencyKey,
  expectedVersions,
  correlationId: requestId(),
});

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome") throw new Error("Expected outcome.");
  return response.outcome;
};

const setup = (): ReferenceHarness => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const result = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("bootstrap"),
      commandName: "workspace.createLocal",
      payload: {
        workspaceId: context().workspaceId,
        rootSpaceId: ids.rootSpace,
        ownerPrincipalId: ids.principal,
        name: "Synthetic Wave 2 workspace",
        timezone: "Europe/Warsaw",
      },
    }),
  );
  assert.equal(result.outcome, "success");
  return harness;
};

const createTask = (harness: ReferenceHarness, title: string): TaskId => {
  const capture = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`capture-${title}`),
      commandName: "capture.submitText",
      payload: {
        spaceId: ids.rootSpace,
        originalText: `Original: ${title}`,
        deviceId: "synthetic-wave2-device",
        source: "in_app_quick_capture",
      },
    }),
  );
  assert.equal(capture.outcome, "success");
  if (
    capture.outcome !== "success" ||
    capture.projection.kind !== "capture.stored"
  ) {
    throw new Error("Expected capture.");
  }
  const routed = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`route-${title}`, { [capture.projection.captureId]: 1 }),
      commandName: "capture.routeAsTask",
      payload: { captureId: capture.projection.captureId, title },
    }),
  );
  assert.equal(routed.outcome, "success");
  if (
    routed.outcome !== "success" ||
    routed.projection.kind !== "capture.routed_as_task"
  ) {
    throw new Error("Expected Task.");
  }
  return routed.projection.taskId;
};

const createProjectRecord = (
  harness: ReferenceHarness,
  title = "Launch synthetic alpha",
): { projectId: ProjectId; commandId: string } => {
  const command = {
    ...metadata(`project-${title}`),
    commandName: "project.create",
    payload: {
      spaceId: ids.rootSpace,
      title,
      intendedOutcome: "A restart-safe review build is available",
    },
  };
  const result = unwrap(harness.kernel.execute(context(), command));
  assert.equal(result.outcome, "success");
  if (
    result.outcome !== "success" ||
    result.projection.kind !== "project.created"
  ) {
    throw new Error("Expected Project.");
  }
  return {
    projectId: result.projection.projectId,
    commandId: command.commandId,
  };
};

describe("Wave 2 reference semantics", () => {
  it("keeps attributed comment threads, edit history, and durable attention distinct from activity", () => {
    const harness = setup();
    const taskId = createTask(harness, "Review the scoped comment");
    const task = harness.store
      .snapshot()
      .tasks.find((item) => item.id === taskId);
    assert.ok(task);
    const rootId = requestId();
    const added = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("comment-root", { [taskId]: task.version }),
        commandName: "comment.add",
        payload: {
          commentId: rootId,
          target: { kind: "task", taskId },
          body: "Please verify the recovery evidence.",
          mentionPrincipalIds: [ids.principal],
        },
      }),
    );
    assert.equal(added.diagnosticCode, "comment.added");
    const replyId = requestId();
    const replied = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("comment-reply", { [taskId]: task.version, [rootId]: 1 }),
        commandName: "comment.add",
        payload: {
          commentId: replyId,
          target: { kind: "task", taskId },
          parentCommentId: rootId,
          body: "Recovery evidence is attached.",
          mentionPrincipalIds: [],
        },
      }),
    );
    assert.equal(replied.diagnosticCode, "comment.added");
    const edited = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("comment-edit", { [replyId]: 1 }),
        commandName: "comment.edit",
        payload: {
          commentId: replyId,
          body: "Packaged recovery evidence is attached.",
          mentionPrincipalIds: [],
        },
      }),
    );
    assert.equal(edited.diagnosticCode, "comment.edited");
    const resolved = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("comment-resolve", { [rootId]: 1 }),
        commandName: "comment.resolve",
        payload: { commentId: rootId },
      }),
    );
    assert.equal(resolved.diagnosticCode, "comment.resolved");
    const snapshot = harness.store.snapshot();
    assert.equal(snapshot.comments?.length, 2);
    assert.equal(
      snapshot.comments?.find((item) => item.id === replyId)?.revisions.length,
      1,
    );
    assert.equal(
      snapshot.comments?.find((item) => item.id === rootId)?.threadState,
      "resolved",
    );
    const comments = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "comment.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { target: { kind: "task", taskId } },
    });
    assert.equal(comments.kind, "query_result");
    if (
      comments.kind !== "query_result" ||
      comments.result.outcome !== "success" ||
      comments.result.projection.kind !== "comment.list"
    )
      assert.fail("Expected comment projection.");
    assert.equal(comments.result.projection.threads.length, 2);
    assert.equal(comments.result.projection.threads[1]?.edited, true);
    assert.equal(
      comments.result.projection.threads[1]?.threadState,
      "resolved",
    );
    assert.equal(
      snapshot.attentionSignals?.length,
      0,
      "self mention does not create attention debt",
    );
  });

  it("assigns and unassigns one versioned Task responsibility", () => {
    const harness = setup();
    const taskId = createTask(harness, "Own the collaboration gate");
    const task = harness.store
      .snapshot()
      .tasks.find((item) => item.id === taskId);
    assert.ok(task);
    const assignmentId = requestId();
    const assigned = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("assign-owner", { [taskId]: task.version }),
        commandName: "task.assign",
        payload: {
          assignmentId,
          taskId,
          assigneePrincipalId: ids.principal,
        },
      }),
    );
    assert.equal(assigned.outcome, "success");
    assert.equal(assigned.diagnosticCode, "task.assigned");
    const taskList = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    assert.equal(taskList.kind, "query_result");
    if (
      taskList.kind !== "query_result" ||
      taskList.result.outcome !== "success" ||
      taskList.result.projection.kind !== "task.list"
    ) {
      assert.fail("Task list should expose responsibility.");
    }
    assert.equal(
      taskList.result.projection.items[0]?.assignment?.id,
      assignmentId,
    );
    assert.equal(
      taskList.result.projection.items[0]?.assignment?.availability,
      "active",
    );
    const attention = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "attention.inbox",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {},
    });
    assert.equal(attention.kind, "query_result");
    if (
      attention.kind !== "query_result" ||
      attention.result.outcome !== "success" ||
      attention.result.projection.kind !== "attention.inbox"
    )
      assert.fail("Expected assignment attention.");
    assert.equal(attention.result.projection.unreadCount, 1);
    assert.equal(
      attention.result.projection.items[0]?.reason,
      "task_assignment",
    );
    const unassigned = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("unassign-owner", {
          [taskId]: task.version,
          [assignmentId]: 1,
        }),
        commandName: "task.unassign",
        payload: { assignmentId, taskId },
      }),
    );
    assert.equal(unassigned.outcome, "success");
    assert.equal(unassigned.diagnosticCode, "task.unassigned");
    assert.equal(
      harness.store.snapshot().taskAssignments?.[0]?.state,
      "removed",
    );
  });

  it("rolls back Task assignment at every journal boundary", () => {
    const boundaries: readonly FailureBoundary[] = [
      "task-assignment",
      "attention-signal",
      "event",
      "audit",
      "idempotency",
      "sync-command",
      "outbox",
    ];
    for (const boundary of boundaries) {
      const harness = setup();
      const taskId = createTask(harness, `Atomic assignment ${boundary}`);
      const task = harness.store
        .snapshot()
        .tasks.find((item) => item.id === taskId);
      assert.ok(task);
      const before = harness.store.snapshot();
      harness.store.failures.failAfter(boundary);
      const result = unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`atomic-assignment-${boundary}`, {
            [taskId]: task.version,
          }),
          commandName: "task.assign",
          payload: {
            assignmentId: requestId(),
            taskId,
            assigneePrincipalId: ids.principal,
          },
        }),
      );
      assert.equal(result.outcome, "retryable", boundary);
      const after = harness.store.snapshot();
      assert.deepEqual(after.taskAssignments, before.taskAssignments, boundary);
      assert.deepEqual(
        after.attentionSignals,
        before.attentionSignals,
        boundary,
      );
      assert.equal(after.events.length, before.events.length, boundary);
      assert.equal(
        after.auditReceipts.length,
        before.auditReceipts.length,
        boundary,
      );
      assert.equal(
        after.idempotencyRecords.length,
        before.idempotencyRecords.length,
        boundary,
      );
      assert.equal(
        after.outboxEntries.length,
        before.outboxEntries.length,
        boundary,
      );
    }
  });

  it("rolls back Project creation at every journal boundary", () => {
    const boundaries: readonly FailureBoundary[] = [
      "project",
      "event",
      "audit",
      "idempotency",
      "sync-command",
      "outbox",
    ];
    for (const boundary of boundaries) {
      const harness = setup();
      const before = harness.store.snapshot();
      harness.store.failures.failAfter(boundary);
      const result = unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`atomic-create-${boundary}`),
          commandName: "project.create",
          payload: {
            spaceId: ids.rootSpace,
            title: "Atomic synthetic Project",
            intendedOutcome: "No partial state",
          },
        }),
      );
      assert.equal(result.outcome, "retryable", boundary);
      const after = harness.store.snapshot();
      assert.equal(after.projects.length, before.projects.length, boundary);
      assert.equal(after.events.length, before.events.length, boundary);
      assert.equal(
        after.auditReceipts.length,
        before.auditReceipts.length,
        boundary,
      );
      assert.equal(
        after.idempotencyRecords.length,
        before.idempotencyRecords.length,
        boundary,
      );
      assert.equal(
        after.outboxEntries.length,
        before.outboxEntries.length,
        boundary,
      );
    }
  });

  it("rolls back a reversible update including its undo descriptor", () => {
    const boundaries: readonly FailureBoundary[] = [
      "project-update",
      "event",
      "audit",
      "idempotency",
      "sync-command",
      "outbox",
      "undo",
    ];
    for (const boundary of boundaries) {
      const harness = setup();
      const { projectId } = createProjectRecord(harness, `Atomic ${boundary}`);
      const before = harness.store.snapshot();
      harness.store.failures.failAfter(boundary);
      const result = unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`atomic-update-${boundary}`, { [projectId]: 1 }),
          commandName: "project.updateOutcome",
          payload: { projectId, intendedOutcome: "Should roll back" },
        }),
      );
      assert.equal(result.outcome, "retryable", boundary);
      const after = harness.store.snapshot();
      assert.deepEqual(after.projects, before.projects, boundary);
      assert.equal(after.events.length, before.events.length, boundary);
      assert.equal(
        after.undoDescriptors.length,
        before.undoDescriptors.length,
        boundary,
      );
    }
  });

  it("creates and updates Projects, relates Tasks, and produces explainable projections", () => {
    const harness = setup();
    const taskId = createTask(harness, "Review alpha persistence");
    const { projectId } = createProjectRecord(harness);
    const update = {
      ...metadata("project-outcome", { [projectId]: 1 }),
      commandName: "project.updateOutcome",
      payload: {
        projectId,
        intendedOutcome: "The local alpha survives restart and review",
      },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), update)).diagnosticCode,
      "project.outcome_updated",
    );

    const task = harness.store
      .snapshot()
      .tasks.find((item) => item.id === taskId);
    const project = harness.store
      .snapshot()
      .projects.find((item) => item.id === projectId);
    assert.ok(task);
    assert.ok(project);
    const relate = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("relate", {
          [taskId]: task.version,
          [projectId]: project.version,
        }),
        commandName: "record.relate",
        payload: {
          relationType: "task_contributes_to_project",
          taskId,
          projectId,
        },
      }),
    );
    assert.equal(relate.diagnosticCode, "relation.created");
    if (
      relate.outcome !== "success" ||
      relate.projection.kind !== "relation.created"
    ) {
      throw new Error("Expected relation.");
    }

    const projects = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "project.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    assert.equal(projects.kind, "query_result");
    if (
      projects.kind === "query_result" &&
      projects.result.outcome === "success" &&
      projects.result.projection.kind === "project.list"
    ) {
      assert.equal(
        projects.result.projection.items[0]?.relatedOpenTaskCount,
        1,
      );
      assert.equal(
        projects.result.projection.items[0]?.intendedOutcome,
        "The local alpha survives restart and review",
      );
    } else throw new Error("Expected project list.");

    const overview = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "project.operationalOverview",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { projectId },
    });
    if (
      overview.kind !== "query_result" ||
      overview.result.outcome !== "success" ||
      overview.result.projection.kind !== "project.operationalOverview"
    ) {
      throw new Error("Expected Project operational overview.");
    }
    assert.equal(overview.result.projection.relatedTasks[0]?.id, taskId);
    assert.equal(
      overview.result.projection.project.intendedOutcome,
      "The local alpha survives restart and review",
    );

    const search = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "search.global",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceIds: [ids.rootSpace], text: "restart" },
    });
    if (
      search.kind !== "query_result" ||
      search.result.outcome !== "success" ||
      search.result.projection.kind !== "search.global"
    )
      throw new Error("Expected search.");
    assert.deepEqual(
      search.result.projection.items.map((item) => item.recordKind),
      ["project"],
    );
    assert.deepEqual(search.result.projection.items[0]?.matchedFields, [
      "intendedOutcome",
    ]);

    const cockpit = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "cockpit.week",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace, weekStart: "2026-07-06" },
    });
    if (
      cockpit.kind !== "query_result" ||
      cockpit.result.outcome !== "success" ||
      cockpit.result.projection.kind !== "cockpit.week"
    )
      throw new Error("Expected cockpit.");
    assert.equal(cockpit.result.projection.focus[0]?.taskId, taskId);
    assert.deepEqual(
      cockpit.result.projection.focus[0]?.reasons.map((reason) => reason.code),
      ["task_open", "created_this_week", "active_project"],
    );

    const activity = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "activity.meaningful",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (
      activity.kind !== "query_result" ||
      activity.result.outcome !== "success" ||
      activity.result.projection.kind !== "activity.meaningful"
    )
      throw new Error("Expected activity.");
    assert.deepEqual(
      activity.result.projection.items
        .map((item) => item.activityType)
        .slice(0, 4),
      [
        "relation_added",
        "project_outcome_changed",
        "project_created",
        "capture_routed",
      ],
    );
  });

  it("completes, reopens, and changes Task status with expected-version and replay safety", () => {
    const harness = setup();
    const taskId = createTask(harness, "Close the synthetic loop");
    const completeCommand = {
      ...metadata("complete", { [taskId]: 1 }),
      commandName: "task.complete",
      payload: { taskId },
    };
    const completed = unwrap(
      harness.kernel.execute(context(), completeCommand),
    );
    assert.equal(completed.diagnosticCode, "task.completed");
    const counts = harness.store.snapshot();
    const replay = unwrap(harness.kernel.execute(context(), completeCommand));
    assert.deepEqual(replay, completed);
    assert.equal(harness.store.snapshot().events.length, counts.events.length);

    const stale = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("reopen-stale", { [taskId]: 1 }),
        commandName: "task.reopen",
        payload: { taskId },
      }),
    );
    assert.equal(stale.diagnosticCode, "record.version_conflict");
    const reopened = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("reopen", { [taskId]: 2 }),
        commandName: "task.reopen",
        payload: { taskId },
      }),
    );
    assert.equal(reopened.diagnosticCode, "task.reopened");
    assert.equal(
      harness.store.snapshot().tasks.find((task) => task.id === taskId)
        ?.completionState,
      "open",
    );

    const alternateStatusId = TaskStatusIdSchema.parse(
      "10000000-0000-4000-8000-00000000abcd",
    );
    harness.store.transact((transaction) => {
      transaction.insertTaskStatus({
        id: alternateStatusId,
        workspaceId: context().workspaceId,
        label: "In progress",
        operationalSemantics: "actionable",
        position: 1,
        version: 1,
        createdAt: "2026-07-12T12:00:00.000Z",
        updatedAt: "2026-07-12T12:00:00.000Z",
      });
    });
    const status = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("status", { [taskId]: 3 }),
        commandName: "task.setStatus",
        payload: { taskId, statusId: alternateStatusId },
      }),
    );
    assert.equal(status.diagnosticCode, "task.status_changed");
  });

  it("previews and applies exact compensation, but refuses to overwrite later work", () => {
    const harness = setup();
    const { projectId } = createProjectRecord(harness, "Undo-safe project");
    const updateCommand = {
      ...metadata("undo-target", { [projectId]: 1 }),
      commandName: "project.updateOutcome",
      payload: { projectId, intendedOutcome: "Second outcome" },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), updateCommand)).outcome,
      "success",
    );
    const preview = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("preview"),
        commandName: "command.previewUndo",
        payload: { targetCommandId: updateCommand.commandId },
      }),
    );
    assert.equal(preview.outcome, "preview");
    if (preview.outcome !== "preview") throw new Error("Expected preview.");
    assert.equal(preview.projection.available, true);
    assert.deepEqual(preview.projection.requiredVersions, { [projectId]: 2 });

    const recoveryPreview = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "recovery.preview",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { targetCommandId: updateCommand.commandId },
    });
    if (
      recoveryPreview.kind !== "query_result" ||
      recoveryPreview.result.outcome !== "success" ||
      recoveryPreview.result.projection.kind !== "recovery.preview"
    ) {
      throw new Error("Expected recovery preview query.");
    }
    assert.equal(recoveryPreview.result.projection.available, true);
    assert.deepEqual(recoveryPreview.result.projection.requiredVersions, {
      [projectId]: 2,
    });

    const undo = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo", { [projectId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: updateCommand.commandId },
      }),
    );
    assert.equal(undo.diagnosticCode, "command.undone");
    assert.equal(
      harness.store
        .snapshot()
        .projects.find((project) => project.id === projectId)?.intendedOutcome,
      "A restart-safe review build is available",
    );

    const after = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("preview-after"),
        commandName: "command.previewUndo",
        payload: { targetCommandId: updateCommand.commandId },
      }),
    );
    if (after.outcome !== "preview") throw new Error("Expected preview.");
    assert.equal(after.projection.available, false);
    assert.equal(after.projection.unavailableReason, "already_undone");

    const secondUpdate = {
      ...metadata("later-target", { [projectId]: 3 }),
      commandName: "project.updateOutcome",
      payload: { projectId, intendedOutcome: "Third outcome" },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), secondUpdate)).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("later-change", { [projectId]: 4 }),
          commandName: "project.updateOutcome",
          payload: { projectId, intendedOutcome: "Unrelated later work" },
        }),
      ).outcome,
      "success",
    );
    const blocked = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("unsafe-undo", { [projectId]: 4 }),
        commandName: "command.undo",
        payload: { targetCommandId: secondUpdate.commandId },
      }),
    );
    assert.equal(blocked.diagnosticCode, "undo.not_available");
  });

  it("undoes Capture routing without losing the original or exposing a removed Task", () => {
    const harness = setup();
    const before = harness.store.snapshot();
    const taskId = createTask(harness, "Undo routed Task");
    const routed = harness.store.snapshot();
    const capture = routed.captures.at(-1);
    const routeReceipt = routed.auditReceipts.find(
      (receipt) =>
        receipt.commandName === "capture.routeAsTask" &&
        receipt.affectedRecordIds.includes(taskId),
    );
    assert.ok(capture);
    assert.ok(routeReceipt);
    const preview = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("preview-route-undo"),
        commandName: "command.previewUndo",
        payload: { targetCommandId: routeReceipt.commandId },
      }),
    );
    if (preview.outcome !== "preview") throw new Error("Expected preview.");
    assert.equal(preview.projection.compensationKind, "capture.undo_route");
    const undo = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-route", preview.projection.requiredVersions),
        commandName: "command.undo",
        payload: { targetCommandId: routeReceipt.commandId },
      }),
    );
    assert.equal(undo.diagnosticCode, "command.undone");
    const after = harness.store.snapshot();
    assert.equal(after.captures.at(-1)?.processingState, "pending_processing");
    assert.equal(after.captures.at(-1)?.originalText, capture.originalText);
    assert.equal(
      after.tasks.find((task) => task.id === taskId)?.recordState,
      "removed",
    );
    const tasks = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (
      tasks.kind !== "query_result" ||
      tasks.result.outcome !== "success" ||
      tasks.result.projection.kind !== "task.list"
    )
      throw new Error("Expected task list.");
    assert.equal(tasks.result.projection.items.length, before.tasks.length);
  });

  it("unrelates atomically and restores the typed relation through undo", () => {
    const harness = setup();
    const taskId = createTask(harness, "Restore relation");
    const { projectId } = createProjectRecord(harness, "Relation project");
    const relation = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("relate-undo", { [taskId]: 1, [projectId]: 1 }),
        commandName: "record.relate",
        payload: {
          relationType: "task_contributes_to_project",
          taskId,
          projectId,
        },
      }),
    );
    if (
      relation.outcome !== "success" ||
      relation.projection.kind !== "relation.created"
    )
      throw new Error("Expected relation.");
    const relationId: RelationId = relation.projection.relationId;
    const unrelateCommand = {
      ...metadata("unrelate", { [relationId]: 1 }),
      commandName: "record.unrelate",
      payload: { relationId },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), unrelateCommand)).diagnosticCode,
      "relation.removed",
    );
    assert.equal(harness.store.snapshot().relations[0]?.state, "removed");
    const undo = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("restore-relation", { [relationId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: unrelateCommand.commandId },
      }),
    );
    assert.equal(undo.diagnosticCode, "command.undone");
    assert.equal(harness.store.snapshot().relations[0]?.version, 3);
  });

  it("fails closed for revoked search, cockpit, activity, relation, and undo access", () => {
    const harness = setup();
    const taskId = createTask(harness, "Hidden after revocation");
    const { projectId } = createProjectRecord(harness, "Hidden project");
    harness.authorization.revoke(context().grantId);
    for (const query of [
      {
        queryName: "search.global",
        parameters: { spaceIds: [ids.rootSpace], text: "hidden" },
      },
      {
        queryName: "cockpit.week",
        parameters: { spaceId: ids.rootSpace, weekStart: "2026-07-06" },
      },
      {
        queryName: "activity.meaningful",
        parameters: { spaceId: ids.rootSpace },
      },
    ] as const) {
      const response = harness.kernel.query(context(), {
        contractVersion: 1,
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        ...query,
      });
      assert.equal(response.kind, "query_result");
      if (response.kind === "query_result") {
        assert.equal(response.result.outcome, "rejected");
        if (response.result.outcome === "rejected")
          assert.equal(response.result.diagnosticCode, "authorization.denied");
      }
    }
    const deniedRelation = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("denied-relate", { [taskId]: 1, [projectId]: 1 }),
        commandName: "record.relate",
        payload: {
          relationType: "task_contributes_to_project",
          taskId,
          projectId,
        },
      }),
    );
    assert.equal(deniedRelation.diagnosticCode, "authorization.denied");
    assert.equal(harness.store.snapshot().relations.length, 0);
  });

  it("does not leak a Project or count across an unauthorized Space", () => {
    const harness = setup();
    const taskId = createTask(harness, "Visible root task");
    const hiddenSpaceId = SpaceIdSchema.parse(
      "10000000-0000-4000-8000-00000000dcba",
    );
    const hiddenProjectId = ProjectIdSchema.parse(
      "10000000-0000-4000-8000-00000000dcbb",
    );
    harness.store.transact((transaction) => {
      assert.equal(isApplicationWave2Transaction(transaction), true);
      if (!isApplicationWave2Transaction(transaction)) {
        throw new Error("Expected the Wave 2 reference transaction.");
      }
      transaction.insertSpace({
        id: hiddenSpaceId,
        workspaceId: context().workspaceId,
        name: "Hidden synthetic Space",
        version: 1,
        createdAt: "2026-07-12T12:00:00.000Z",
      });
      transaction.insertProject({
        id: hiddenProjectId,
        workspaceId: context().workspaceId,
        spaceId: hiddenSpaceId,
        title: "SECRET_PROJECT_TITLE",
        intendedOutcome: "SECRET_PROJECT_OUTCOME",
        lifecycle: "active",
        createdBy: context().principalId,
        version: 1,
        createdAt: "2026-07-12T12:00:00.000Z",
        updatedAt: "2026-07-12T12:00:00.000Z",
      });
    });
    const search = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "search.global",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceIds: [hiddenSpaceId], text: "secret" },
    });
    assert.equal(search.kind, "query_result");
    if (search.kind === "query_result") {
      assert.equal(search.result.outcome, "rejected");
      if (search.result.outcome === "rejected") {
        assert.equal(search.result.diagnosticCode, "authorization.denied");
      }
      assert.equal(JSON.stringify(search).includes("SECRET"), false);
    }
    const deniedRelation = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("cross-space-relate", {
          [taskId]: 1,
          [hiddenProjectId]: 1,
        }),
        commandName: "record.relate",
        payload: {
          relationType: "task_contributes_to_project",
          taskId,
          projectId: hiddenProjectId,
        },
      }),
    );
    assert.equal(deniedRelation.diagnosticCode, "authorization.denied");
    assert.equal(harness.store.snapshot().relations.length, 0);
  });
});
