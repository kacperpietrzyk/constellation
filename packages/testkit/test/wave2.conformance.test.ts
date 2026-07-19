import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isApplicationWave2Transaction,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  ExecutionContextSchema,
  KnowledgeSourceIdSchema,
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
      "document.create",
      "document.list",
      "knowledge.sourceCreate",
      "knowledge.sourceUpdate",
      "knowledge.documentSetEvidence",
      "knowledge.namedVersionCreate",
      "knowledge.namedVersionVoid",
      "knowledge.list",
      "knowledge.documentContext",
      "relationship.organizationCreate",
      "relationship.personCreate",
      "opportunity.create",
      "opportunity.offerCreate",
      "opportunity.linkOutcomes",
      "relationship.workspace",
      "task.create",
      "task.updateDetails",
      "task.setParent",
      "task.setStatus",
      "task.setOperationalState",
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
  it("preserves source provenance through notes, deliverables, named versions, search, and undo", () => {
    const harness = setup();
    const sourceId = requestId();
    const source = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("knowledge-source"),
        commandName: "knowledge.sourceCreate",
        payload: {
          sourceId,
          spaceId: ids.rootSpace,
          sourceKind: "url",
          title: "Restart-safe evidence guide",
          canonicalUrl: "https://example.test/evidence",
          excerpt: "Preserve the original evidence chain.",
          availability: "available",
          observedAt: "2026-07-15T08:00:00.000Z",
        },
      }),
    );
    assert.equal(source.diagnosticCode, "knowledge.source_created");

    const noteId = requestId();
    const deliverableId = requestId();
    for (const [documentId, role, title] of [
      [noteId, "note", "Evidence synthesis"],
      [deliverableId, "deliverable", "Client evidence report"],
    ] as const) {
      const created = unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`document-${role}`),
          commandName: "document.create",
          payload: { documentId, spaceId: ids.rootSpace, title, role },
        }),
      );
      assert.equal(created.diagnosticCode, "document.created");
    }

    const evidenceCommand = {
      ...metadata("knowledge-evidence", {
        [deliverableId]: 1,
        [sourceId]: 1,
        [noteId]: 1,
      }),
      commandName: "knowledge.documentSetEvidence" as const,
      payload: {
        documentId: deliverableId,
        sourceIds: [sourceId],
        noteDocumentIds: [noteId],
      },
    };
    const evidence = unwrap(harness.kernel.execute(context(), evidenceCommand));
    assert.equal(evidence.diagnosticCode, "knowledge.evidence_updated");

    const namedVersionId = requestId();
    const namedVersionCommand = {
      ...metadata("knowledge-version", {
        [deliverableId]: 2,
        [sourceId]: 1,
        [noteId]: 1,
      }),
      commandName: "knowledge.namedVersionCreate" as const,
      payload: {
        namedVersionId,
        documentId: deliverableId,
        documentRevisionId: requestId(),
        name: "Delivered · 15 July",
        milestone: "delivered" as const,
        contentSnapshot: "A durable report with explicit evidence.",
      },
    };
    const namedVersion = unwrap(
      harness.kernel.execute(context(), namedVersionCommand),
    );
    assert.equal(
      namedVersion.diagnosticCode,
      "knowledge.named_version_created",
    );

    const sourceUpdateCommand = {
      ...metadata("knowledge-source-update", { [sourceId]: 1 }),
      commandName: "knowledge.sourceUpdate" as const,
      payload: {
        sourceId,
        title: "Restart-safe evidence guide · revised",
        canonicalUrl: "https://example.test/evidence",
        excerpt: "The upstream source changed after delivery.",
        availability: "available" as const,
        observedAt: "2026-07-15T09:00:00.000Z",
      },
    };
    const sourceUpdate = unwrap(
      harness.kernel.execute(context(), sourceUpdateCommand),
    );
    assert.equal(sourceUpdate.diagnosticCode, "knowledge.source_updated");

    const contextResult = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "knowledge.documentContext",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { documentId: deliverableId },
    });
    assert.equal(contextResult.kind, "query_result");
    if (
      contextResult.kind !== "query_result" ||
      contextResult.result.outcome !== "success" ||
      contextResult.result.projection.kind !== "knowledge.documentContext"
    )
      assert.fail("Expected knowledge context.");
    assert.equal(contextResult.result.projection.namedVersions.length, 1);
    assert.equal(
      contextResult.result.projection.namedVersions[0]?.evidence[0]
        ?.frozenVersion,
      1,
    );
    assert.equal(
      contextResult.result.projection.namedVersions[0]?.evidence[0]?.changed,
      true,
    );

    const search = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "search.global",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceIds: [ids.rootSpace], text: "evidence" },
    });
    assert.equal(search.kind, "query_result");
    if (
      search.kind !== "query_result" ||
      search.result.outcome !== "success" ||
      search.result.projection.kind !== "search.global"
    )
      assert.fail("Expected search projection.");
    assert.ok(
      search.result.projection.items.some(
        (item) => item.recordKind === "source",
      ),
    );
    assert.ok(
      search.result.projection.items.some(
        (item) => item.recordKind === "deliverable",
      ),
    );

    const undoSource = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-source", { [sourceId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: sourceUpdateCommand.commandId },
      }),
    );
    assert.equal(undoSource.diagnosticCode, "command.undone");
    assert.equal(
      harness.store.snapshot().knowledgeSources?.[0]?.title,
      "Restart-safe evidence guide",
    );

    const undoVersion = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-version", { [namedVersionId]: 1 }),
        commandName: "command.undo",
        payload: { targetCommandId: namedVersionCommand.commandId },
      }),
    );
    assert.equal(undoVersion.diagnosticCode, "command.undone");
    assert.equal(
      harness.store.snapshot().namedDocumentVersions?.[0]?.state,
      "voided",
    );
  });

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
      ["task_open", "active_project"],
      "creation time is history, not a focus reason",
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

  it("creates a Task with working context and edits it with replay, conflict, and undo safety", () => {
    const harness = setup();
    const taskId = "10000000-0000-4000-8000-00000000d001";
    const createCommand = {
      ...metadata("task-create"),
      commandName: "task.create",
      payload: {
        taskId,
        spaceId: ids.rootSpace,
        title: "Prepare the renewal offer",
        description: "Client asked for updated pricing after the July call.",
        nextAction: "Confirm distributor pricing before drafting.",
      },
    };
    const created = unwrap(harness.kernel.execute(context(), createCommand));
    assert.equal(created.diagnosticCode, "task.created");
    if (
      created.outcome !== "success" ||
      created.projection.kind !== "task.created"
    ) {
      throw new Error("Expected created Task.");
    }
    assert.equal(created.projection.taskId, taskId);
    assert.equal(
      created.projection.description,
      "Client asked for updated pricing after the July call.",
    );

    const counts = harness.store.snapshot();
    const replay = unwrap(harness.kernel.execute(context(), createCommand));
    assert.deepEqual(replay, created);
    assert.equal(harness.store.snapshot().events.length, counts.events.length);

    const duplicate = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("task-create-duplicate"),
        commandName: "task.create",
        payload: {
          taskId,
          spaceId: ids.rootSpace,
          title: "A different title for the same identity",
        },
      }),
    );
    assert.equal(duplicate.diagnosticCode, "record.already_exists");

    const listed = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (
      listed.kind !== "query_result" ||
      listed.result.outcome !== "success" ||
      listed.result.projection.kind !== "task.list"
    ) {
      throw new Error("Expected task list.");
    }
    const listItem = listed.result.projection.items.find(
      (item) => item.id === taskId,
    );
    assert.equal(
      listItem?.nextAction,
      "Confirm distributor pricing before drafting.",
    );

    const search = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "search.global",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {
        spaceIds: [ids.rootSpace],
        text: "distributor pricing",
        limit: 10,
      },
    });
    if (
      search.kind !== "query_result" ||
      search.result.outcome !== "success" ||
      search.result.projection.kind !== "search.global"
    ) {
      throw new Error("Expected search result.");
    }
    const match = search.result.projection.items.find(
      (item) => item.recordId === taskId,
    );
    assert.ok(match, "Task should be findable through its working context.");
    assert.ok(match.matchedFields.includes("nextAction"));

    const staleUpdate = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("task-update-stale", { [taskId]: 2 }),
        commandName: "task.updateDetails",
        payload: { taskId, nextAction: "Stale expectations" },
      }),
    );
    assert.equal(staleUpdate.diagnosticCode, "record.version_conflict");

    const updateCommand = {
      ...metadata("task-update", { [taskId]: 1 }),
      commandName: "task.updateDetails",
      payload: {
        taskId,
        title: "Prepare and send the renewal offer",
        description: null,
      },
    };
    const updated = unwrap(harness.kernel.execute(context(), updateCommand));
    assert.equal(updated.diagnosticCode, "task.details_updated");
    const storedAfterUpdate = harness.store
      .snapshot()
      .tasks.find((task) => task.id === taskId);
    assert.equal(
      storedAfterUpdate?.title,
      "Prepare and send the renewal offer",
    );
    assert.equal(storedAfterUpdate?.description, undefined);
    assert.equal(
      storedAfterUpdate?.nextAction,
      "Confirm distributor pricing before drafting.",
    );

    const updateReplay = unwrap(
      harness.kernel.execute(context(), updateCommand),
    );
    assert.deepEqual(updateReplay, updated);

    const preview = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("task-update-preview"),
        commandName: "command.previewUndo",
        payload: { targetCommandId: updateCommand.commandId },
      }),
    );
    if (preview.outcome !== "preview") throw new Error("Expected preview.");
    assert.equal(preview.projection.available, true);
    assert.equal(preview.projection.compensationKind, "task.restore_details");

    const undo = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("task-update-undo", { [taskId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: updateCommand.commandId },
      }),
    );
    assert.equal(undo.diagnosticCode, "command.undone");
    const restored = harness.store
      .snapshot()
      .tasks.find((task) => task.id === taskId);
    assert.equal(restored?.title, "Prepare the renewal offer");
    assert.equal(
      restored?.description,
      "Client asked for updated pricing after the July call.",
    );

    const laterEdit = {
      ...metadata("task-later-edit", { [taskId]: 3 }),
      commandName: "task.updateDetails",
      payload: { taskId, nextAction: "Ask about the new procurement owner." },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), laterEdit)).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("task-later-edit-2", { [taskId]: 4 }),
          commandName: "task.updateDetails",
          payload: { taskId, title: "Prepare the Q3 renewal offer" },
        }),
      ).outcome,
      "success",
    );
    const blocked = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("task-unsafe-undo", { [taskId]: 4 }),
        commandName: "command.undo",
        payload: { targetCommandId: laterEdit.commandId },
      }),
    );
    assert.equal(blocked.diagnosticCode, "undo.not_available");
  });

  it("plans Tasks in time with a repaired due ordering, filters, and undo-safe timing", () => {
    const harness = setup();
    const taskIds = {
      dueSoonHigh: "10000000-0000-4000-8000-00000000e001",
      dueSoonNormal: "10000000-0000-4000-8000-00000000e002",
      dueLater: "10000000-0000-4000-8000-00000000e003",
      unscheduledUrgent: "10000000-0000-4000-8000-00000000e004",
      unscheduled: "10000000-0000-4000-8000-00000000e005",
    } as const;
    const create = (
      taskId: string,
      title: string,
      timing: {
        startAt?: string;
        dueAt?: string;
        priority?: "urgent" | "high" | "normal" | "low";
      },
    ) => {
      const created = unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`plan-${title}`),
          commandName: "task.create",
          payload: { taskId, spaceId: ids.rootSpace, title, ...timing },
        }),
      );
      assert.equal(created.diagnosticCode, "task.created");
    };
    create(taskIds.dueLater, "Later deadline", {
      dueAt: "2026-07-28T21:59:59.999Z",
    });
    create(taskIds.unscheduledUrgent, "Unscheduled urgent", {
      priority: "urgent",
    });
    create(taskIds.dueSoonNormal, "Soon normal", {
      startAt: "2026-07-20T22:00:00.000Z",
      dueAt: "2026-07-24T21:59:59.999Z",
    });
    create(taskIds.dueSoonHigh, "Soon high", {
      dueAt: "2026-07-24T21:59:59.999Z",
      priority: "high",
    });
    create(taskIds.unscheduled, "Unscheduled ordinary", {});

    const invalidRange = harness.kernel.execute(context(), {
      ...metadata("plan-invalid"),
      commandName: "task.create",
      payload: {
        taskId: "10000000-0000-4000-8000-00000000e006",
        spaceId: ids.rootSpace,
        title: "Backwards range",
        startAt: "2026-07-25T00:00:00.000Z",
        dueAt: "2026-07-24T00:00:00.000Z",
      },
    });
    assert.equal(invalidRange.kind, "contract_rejected");

    const listDue = (parameters: Record<string, unknown>) => {
      const result = harness.kernel.query(context(), {
        contractVersion: 1,
        queryName: "task.list",
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { spaceId: ids.rootSpace, ...parameters },
      });
      if (
        result.kind !== "query_result" ||
        result.result.outcome !== "success" ||
        result.result.projection.kind !== "task.list"
      ) {
        throw new Error("Expected task list.");
      }
      return result.result.projection;
    };

    const dueOrdered = listDue({ orderBy: "due_asc" });
    assert.deepEqual(
      dueOrdered.items.map((item) => item.id),
      [
        taskIds.dueSoonHigh,
        taskIds.dueSoonNormal,
        taskIds.dueLater,
        taskIds.unscheduledUrgent,
        taskIds.unscheduled,
      ],
      "scheduled first by deadline with priority tie-break; unscheduled follow",
    );
    assert.equal(dueOrdered.items[0]?.dueAt, "2026-07-24T21:59:59.999Z");
    assert.equal(dueOrdered.items[1]?.startAt, "2026-07-20T22:00:00.000Z");

    const firstPage = listDue({ orderBy: "due_asc", limit: 2 });
    assert.equal(firstPage.items.length, 2);
    assert.notEqual(firstPage.nextCursor, null);
    const secondPage = listDue({
      orderBy: "due_asc",
      limit: 3,
      cursor: firstPage.nextCursor,
    });
    assert.deepEqual(
      secondPage.items.map((item) => item.id),
      [taskIds.dueLater, taskIds.unscheduledUrgent, taskIds.unscheduled],
    );

    const unscheduledOnly = listDue({ orderBy: "due_asc", scheduled: false });
    assert.deepEqual(
      unscheduledOnly.items.map((item) => item.id),
      [taskIds.unscheduledUrgent, taskIds.unscheduled],
    );
    const urgentOnly = listDue({ priorities: ["urgent"] });
    assert.deepEqual(
      urgentOnly.items.map((item) => item.id),
      [taskIds.unscheduledUrgent],
    );
    const dueThisWeek = listDue({
      orderBy: "due_asc",
      dueBefore: "2026-07-27T00:00:00.000Z",
    });
    assert.deepEqual(
      dueThisWeek.items.map((item) => item.id),
      [taskIds.dueSoonHigh, taskIds.dueSoonNormal],
    );

    const mergedInvalid = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("plan-merged-invalid", { [taskIds.dueSoonNormal]: 1 }),
        commandName: "task.updateDetails",
        payload: {
          taskId: taskIds.dueSoonNormal,
          startAt: "2026-07-25T00:00:00.000Z",
        },
      }),
    );
    assert.equal(mergedInvalid.diagnosticCode, "command.precondition_failed");

    const retime = {
      ...metadata("plan-retime", { [taskIds.dueSoonNormal]: 1 }),
      commandName: "task.updateDetails",
      payload: {
        taskId: taskIds.dueSoonNormal,
        startAt: null,
        dueAt: "2026-07-30T21:59:59.999Z",
        priority: "low",
      },
    };
    const retimed = unwrap(harness.kernel.execute(context(), retime));
    assert.equal(retimed.diagnosticCode, "task.details_updated");
    const afterRetime = harness.store
      .snapshot()
      .tasks.find((task) => task.id === taskIds.dueSoonNormal);
    assert.equal(afterRetime?.startAt, undefined);
    assert.equal(afterRetime?.dueAt, "2026-07-30T21:59:59.999Z");
    assert.equal(afterRetime?.priority, "low");

    const undone = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("plan-retime-undo", { [taskIds.dueSoonNormal]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: retime.commandId },
      }),
    );
    assert.equal(undone.diagnosticCode, "command.undone");
    const restored = harness.store
      .snapshot()
      .tasks.find((task) => task.id === taskIds.dueSoonNormal);
    assert.equal(restored?.startAt, "2026-07-20T22:00:00.000Z");
    assert.equal(restored?.dueAt, "2026-07-24T21:59:59.999Z");
    assert.equal(restored?.priority, undefined);

    const overdueId = "10000000-0000-4000-8000-00000000e007";
    create(overdueId, "Missed deadline", {
      dueAt: "2026-07-10T21:59:59.999Z",
    });
    const cockpit = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "cockpit.week",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace, weekStart: "2026-07-20" },
    });
    if (
      cockpit.kind !== "query_result" ||
      cockpit.result.outcome !== "success" ||
      cockpit.result.projection.kind !== "cockpit.week"
    )
      throw new Error("Expected cockpit.");
    const focusCodes = new Map<string, readonly string[]>(
      cockpit.result.projection.focus.map((entry) => [
        entry.taskId,
        entry.reasons.map((reason) => reason.code),
      ]),
    );
    assert.deepEqual(focusCodes.get(overdueId), ["task_open", "overdue"]);
    assert.deepEqual(focusCodes.get(taskIds.dueSoonHigh), [
      "task_open",
      "due_this_week",
      "priority_high",
    ]);
    assert.deepEqual(focusCodes.get(taskIds.dueSoonNormal), [
      "task_open",
      "due_this_week",
      "starts_this_week",
    ]);
    assert.deepEqual(focusCodes.get(taskIds.unscheduledUrgent), [
      "task_open",
      "priority_urgent",
    ]);
    assert.equal(
      cockpit.result.projection.focus[0]?.taskId,
      overdueId,
      "late work outranks planned and prioritized work",
    );
    const dueEntry = cockpit.result.projection.focus.find(
      (entry) => entry.taskId === taskIds.dueSoonHigh,
    );
    assert.equal(dueEntry?.dueAt, "2026-07-24T21:59:59.999Z");
  });

  it("decomposes an outcome into one bounded level of subtasks with waiting direction", () => {
    const harness = setup();
    const parentId = "10000000-0000-4000-8000-00000000f001";
    const childA = "10000000-0000-4000-8000-00000000f002";
    const childB = "10000000-0000-4000-8000-00000000f003";
    const other = "10000000-0000-4000-8000-00000000f004";
    const createOutcome = (taskId: string, title: string, parent?: string) =>
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`sub-${title}`),
          commandName: "task.create",
          payload: {
            taskId,
            spaceId: ids.rootSpace,
            title,
            ...(parent === undefined ? {} : { parentTaskId: parent }),
          },
        }),
      );
    assert.equal(
      createOutcome(parentId, "Prepare the offer").diagnosticCode,
      "task.created",
    );
    assert.equal(
      createOutcome(childA, "Draft substantive content", parentId)
        .diagnosticCode,
      "task.created",
    );
    assert.equal(
      createOutcome(other, "Unrelated errand").diagnosticCode,
      "task.created",
    );

    const setParent = {
      ...metadata("sub-adopt", { [childB]: 1 }),
      commandName: "task.setParent",
      payload: { taskId: childB, parentTaskId: parentId },
    };
    assert.equal(
      createOutcome(childB, "Confirm distributor pricing").diagnosticCode,
      "task.created",
    );
    const adopted = unwrap(harness.kernel.execute(context(), setParent));
    assert.equal(adopted.diagnosticCode, "task.parent_changed");

    const nested = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("sub-nested", { [other]: 1 }),
        commandName: "task.setParent",
        payload: { taskId: other, parentTaskId: childA },
      }),
    );
    assert.equal(
      nested.diagnosticCode,
      "command.precondition_failed",
      "a subtask cannot become a parent (one bounded level)",
    );
    const cycle = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("sub-cycle", { [parentId]: 1 }),
        commandName: "task.setParent",
        payload: { taskId: parentId, parentTaskId: childA },
      }),
    );
    assert.equal(
      cycle.diagnosticCode,
      "command.precondition_failed",
      "a parent with children cannot itself be adopted",
    );

    const waiting = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("sub-waiting", { [childB]: 2 }),
        commandName: "task.setOperationalState",
        payload: {
          taskId: childB,
          operationalState: "waiting",
          waitingOn: {
            kind: "external",
            label: "Cennik dystrybutora",
            direction: "waiting_on_them",
            expectedAt: "2026-07-24T21:59:59.999Z",
          },
        },
      }),
    );
    assert.equal(waiting.diagnosticCode, "task.operational_state_changed");
    const storedChildB = harness.store
      .snapshot()
      .tasks.find((task) => task.id === childB);
    assert.equal(storedChildB?.waitingOn?.direction, "waiting_on_them");
    assert.equal(
      storedChildB?.waitingOn?.expectedAt,
      "2026-07-24T21:59:59.999Z",
    );

    const completeA = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("sub-complete-a", { [childA]: 1 }),
        commandName: "task.complete",
        payload: { taskId: childA },
      }),
    );
    assert.equal(completeA.diagnosticCode, "task.completed");
    const parentAfter = harness.store
      .snapshot()
      .tasks.find((task) => task.id === parentId);
    assert.equal(
      parentAfter?.completionState,
      "open",
      "completing children never completes the parent",
    );

    const undoAdopt = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("sub-undo", { [childB]: 3 }),
        commandName: "command.undo",
        payload: { targetCommandId: setParent.commandId },
      }),
    );
    assert.equal(
      undoAdopt.diagnosticCode,
      "undo.not_available",
      "waiting change after adoption blocks the earlier structural undo",
    );

    const listed = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (
      listed.kind !== "query_result" ||
      listed.result.outcome !== "success" ||
      listed.result.projection.kind !== "task.list"
    )
      throw new Error("Expected task list.");
    const byId = new Map<
      string,
      (typeof listed.result.projection.items)[number]
    >(listed.result.projection.items.map((item) => [item.id, item]));
    assert.equal(byId.get(childA)?.parentTaskId, parentId);
    assert.equal(byId.get(childB)?.parentTaskId, parentId);
    assert.equal(byId.get(other)?.parentTaskId, undefined);
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
      {
        queryName: "knowledge.list",
        parameters: { spaceId: ids.rootSpace },
      },
      {
        queryName: "knowledge.documentContext",
        parameters: { documentId: requestId() },
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
    const hiddenSourceId = KnowledgeSourceIdSchema.parse(
      "10000000-0000-4000-8000-00000000dcbc",
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
      transaction.insertKnowledgeSource({
        id: hiddenSourceId,
        workspaceId: context().workspaceId,
        spaceId: hiddenSpaceId,
        sourceKind: "excerpt",
        title: "SECRET_SOURCE_TITLE",
        excerpt: "SECRET_SOURCE_EXCERPT",
        availability: "available",
        observedAt: "2026-07-12T12:00:00.000Z",
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
