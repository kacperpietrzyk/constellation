import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isApplicationWave2Transaction,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  ExecutionContextSchema,
  WorkspaceIdSchema,
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
      "capture.submit",
      "capture.process",
      "capture.submitText",
      "capture.routeAsTask",
      "project.create",
      "project.updateOutcome",
      "project.list",
      "project.operationalOverview",
      "document.create",
      "document.list",
      "document.linkCandidates",
      "document.backlinks",
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
      "template.create",
      "automation.create",
      "automation.rename",
      "automation.setState",
      "automation.sweep",
      "template.rename",
      "template.updateContents",
      "template.archive",
      "template.restore",
      "project.applyTemplate",
      "fieldDef.create",
      "fieldDef.rename",
      "fieldDef.archive",
      "fieldDef.restore",
      "record.setFieldValue",
      "taskStatus.create",
      "taskStatus.rename",
      "taskStatus.setSemantics",
      "taskStatus.reorder",
      "taskStatus.archive",
      "taskStatus.restore",
      "workspace.setDefaultTaskStatus",
      "task.setStatus",
      "task.setOperationalState",
      "task.complete",
      "task.reopen",
      "task.remove",
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
      "project.close",
      "task.list",
      "savedView.create",
      "savedView.update",
      "work.overview",
      "search.global",
      "cockpit.week",
      "activity.meaningful",
      "activity.changeFeed",
      "workspace.manageAccess",
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
  it("projects one managed Capture safely through document, Task, and comment attachments", () => {
    const harness = setup();
    const submitted = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("attachment-capture"),
        commandName: "capture.submit",
        payload: {
          spaceId: ids.rootSpace,
          original: {
            kind: "managed_file",
            payload: {
              payloadId: requestId(),
              displayName: "scope.pdf",
              mediaType: "application/pdf",
              byteLength: 4096,
              contentSha256: "ab".repeat(32),
              custodyState: "available",
            },
          },
          deviceId: "attachment-device",
          source: "in_app_quick_capture",
        },
      }),
    );
    assert.equal(submitted.outcome, "success");
    if (
      submitted.outcome !== "success" ||
      submitted.projection.kind !== "capture.stored"
    )
      assert.fail("Expected managed Capture.");
    const routed = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("attachment-route", {
          [submitted.projection.captureId]: submitted.projection.version,
        }),
        commandName: "capture.process",
        payload: {
          captureId: submitted.projection.captureId,
          destination: "knowledge_source",
        },
      }),
    );
    assert.equal(routed.outcome, "success");
    if (
      routed.outcome !== "success" ||
      routed.projection.kind !== "capture.routed_as_knowledge_source"
    )
      assert.fail("Expected file Knowledge Source.");
    const documentId = requestId();
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("attachment-document"),
        commandName: "document.create",
        payload: {
          documentId,
          spaceId: ids.rootSpace,
          title: "Scope",
          role: "document",
        },
      }),
    );
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("attachment-link", {
          [documentId]: 1,
          [routed.projection.sourceId]: 1,
        }),
        commandName: "knowledge.documentSetEvidence",
        payload: {
          documentId,
          sourceIds: [routed.projection.sourceId],
          noteDocumentIds: [],
        },
      }),
    );
    const response = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "knowledge.documentContext",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { documentId },
    });
    assert.equal(response.kind, "query_result");
    if (
      response.kind !== "query_result" ||
      response.result.outcome !== "success" ||
      response.result.projection.kind !== "knowledge.documentContext"
    )
      assert.fail("Expected document context.");
    const attachment = response.result.projection.evidence[0]?.attachment;
    assert.equal(attachment?.captureId, submitted.projection.captureId);
    assert.equal(attachment?.original.kind, "managed_file");
    if (attachment?.original.kind === "managed_file")
      assert.equal(attachment.original.payload.displayName, "scope.pdf");

    const taskId = createTask(harness, "Review the attached scope");
    const missingSourceVersion = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("attachment-task-stale", { [taskId]: 1 }),
        commandName: "task.updateDetails",
        payload: {
          taskId,
          attachmentSourceIds: [routed.projection.sourceId],
        },
      }),
    );
    assert.equal(
      missingSourceVersion.diagnosticCode,
      "record.version_conflict",
      "linking a managed source requires its exact version",
    );
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("attachment-task", {
          [taskId]: 1,
          [routed.projection.sourceId]: 1,
        }),
        commandName: "task.updateDetails",
        payload: {
          taskId,
          attachmentSourceIds: [routed.projection.sourceId],
        },
      }),
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
      assert.fail("Expected Task list.");
    assert.equal(tasks.result.projection.items[0]?.attachments.length, 1);
    assert.equal(
      tasks.result.projection.items[0]?.attachments[0]?.captureId,
      submitted.projection.captureId,
    );

    const commentId = requestId();
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("attachment-comment", {
          [taskId]: 2,
          [routed.projection.sourceId]: 1,
        }),
        commandName: "comment.add",
        payload: {
          commentId,
          target: { kind: "task", taskId },
          body: "The scope is attached.",
          attachmentSourceIds: [routed.projection.sourceId],
        },
      }),
    );
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("attachment-comment-edit", { [commentId]: 1 }),
        commandName: "comment.edit",
        payload: {
          commentId,
          body: "The reviewed scope is attached.",
        },
      }),
    );
    const comments = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "comment.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { target: { kind: "task", taskId } },
    });
    if (
      comments.kind !== "query_result" ||
      comments.result.outcome !== "success" ||
      comments.result.projection.kind !== "comment.list"
    )
      assert.fail("Expected comments.");
    assert.equal(comments.result.projection.threads[0]?.attachments.length, 1);
    assert.equal(
      harness.store.snapshot().comments?.[0]?.revisions[0]
        ?.attachmentSourceIds?.[0],
      routed.projection.sourceId,
      "a text-only edit preserves attachment history",
    );
  });

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

  it("configures workspace Task statuses without rewriting existing Tasks", () => {
    const harness = setup();
    const taskId = createTask(harness, "Status workflow evidence");
    const statusId = "10000000-0000-4000-8000-00000000a101";
    const created = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("status-create"),
        commandName: "taskStatus.create",
        payload: {
          statusId,
          label: "W toku",
          operationalSemantics: "actionable",
        },
      }),
    );
    assert.equal(created.diagnosticCode, "taskStatus.created");
    if (
      created.outcome !== "success" ||
      created.projection.kind !== "taskStatus.created"
    )
      throw new Error("Expected status.");
    assert.equal(created.projection.position, 1);

    const duplicateLabel = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("status-duplicate"),
        commandName: "taskStatus.create",
        payload: {
          statusId: "10000000-0000-4000-8000-00000000a102",
          label: "w toku",
          operationalSemantics: "waiting",
        },
      }),
    );
    assert.equal(
      duplicateLabel.diagnosticCode,
      "command.precondition_failed",
      "active labels stay unique case-insensitively",
    );

    const reordered = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("status-reorder", { [statusId]: 1 }),
        commandName: "taskStatus.reorder",
        payload: { statusId, position: 0 },
      }),
    );
    assert.equal(reordered.diagnosticCode, "taskStatus.changed");

    const used = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("status-use", { [taskId]: 1 }),
        commandName: "task.setStatus",
        payload: { taskId, statusId },
      }),
    );
    assert.equal(used.diagnosticCode, "task.status_changed");

    const renameCommand = {
      ...metadata("status-rename", { [statusId]: 2 }),
      commandName: "taskStatus.rename",
      payload: { statusId, label: "Realizacja" },
    };
    const renamed = unwrap(harness.kernel.execute(context(), renameCommand));
    assert.equal(renamed.diagnosticCode, "taskStatus.changed");
    const taskAfterRename = harness.store
      .snapshot()
      .tasks.find((task) => task.id === taskId);
    assert.equal(
      taskAfterRename?.statusId,
      statusId,
      "renaming a definition rewrites no Task",
    );
    assert.equal(taskAfterRename?.version, 2);

    const archiveDefault = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("status-archive-default", {
          ["10000000-0000-4000-8000-00000000a101"]: 3,
        }),
        commandName: "taskStatus.archive",
        payload: { statusId },
      }),
    );
    assert.equal(archiveDefault.diagnosticCode, "taskStatus.changed");

    const otherTaskId = createTask(harness, "Second status evidence");
    const setOnArchived = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("status-use-archived", { [otherTaskId]: 1 }),
        commandName: "task.setStatus",
        payload: { taskId: otherTaskId, statusId },
      }),
    );
    assert.equal(
      setOnArchived.diagnosticCode,
      "command.precondition_failed",
      "an archived status is not selectable",
    );

    const affected = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace, statusIds: [statusId] },
    });
    if (
      affected.kind !== "query_result" ||
      affected.result.outcome !== "success" ||
      affected.result.projection.kind !== "task.list"
    )
      throw new Error("Expected preview list.");
    assert.equal(
      affected.result.projection.items.length,
      1,
      "archive preview lists Tasks still carrying the status",
    );
    assert.equal(
      affected.result.projection.items[0]?.status.label,
      "Realizacja",
      "carrying Tasks keep rendering the archived label",
    );

    const undoRename = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("status-undo-rename", { [statusId]: 4 }),
        commandName: "command.undo",
        payload: { targetCommandId: renameCommand.commandId },
      }),
    );
    assert.equal(
      undoRename.diagnosticCode,
      "undo.not_available",
      "the later archive blocks undoing the earlier rename",
    );
  });

  it("extends records with typed workspace fields without an authorization bypass", () => {
    const harness = setup();
    const taskId = createTask(harness, "Contract renewal for Orbit");
    const dateFieldId = "10000000-0000-4000-8000-00000000b201";
    const choiceFieldId = "10000000-0000-4000-8000-00000000b202";
    const createField = (
      fieldId: string,
      label: string,
      type: Record<string, unknown>,
    ) =>
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`field-${label}`),
          commandName: "fieldDef.create",
          payload: { fieldId, targetKind: "task", label, type },
        }),
      );
    assert.equal(
      createField(dateFieldId, "Data umowy", { kind: "date" }).diagnosticCode,
      "fieldDef.created",
    );
    assert.equal(
      createField(choiceFieldId, "Segment", {
        kind: "choice",
        options: ["MSSP", "Enterprise", "SMB"],
      }).diagnosticCode,
      "fieldDef.created",
    );
    assert.equal(
      createField("10000000-0000-4000-8000-00000000b203", "data umowy", {
        kind: "text",
      }).diagnosticCode,
      "command.precondition_failed",
      "active labels stay unique per target kind",
    );

    const setValue = {
      ...metadata("field-set", { [taskId]: 1 }),
      commandName: "record.setFieldValue",
      payload: {
        targetKind: "task",
        recordId: taskId,
        fieldId: dateFieldId,
        value: { kind: "date", value: "2026-09-30T12:00:00.000Z" },
      },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), setValue)).diagnosticCode,
      "record.field_value_set",
    );
    const wrongType = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("field-wrong-type", { [taskId]: 2 }),
        commandName: "record.setFieldValue",
        payload: {
          targetKind: "task",
          recordId: taskId,
          fieldId: dateFieldId,
          value: { kind: "text", value: "wrzesień" },
        },
      }),
    );
    assert.equal(wrongType.diagnosticCode, "command.precondition_failed");
    const wrongChoice = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("field-wrong-choice", { [taskId]: 2 }),
        commandName: "record.setFieldValue",
        payload: {
          targetKind: "task",
          recordId: taskId,
          fieldId: choiceFieldId,
          value: { kind: "choice", value: "Startup" },
        },
      }),
    );
    assert.equal(wrongChoice.diagnosticCode, "command.precondition_failed");

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
    const item = listed.result.projection.items.find(
      (entry) => entry.id === taskId,
    );
    assert.deepEqual(item?.fields?.[dateFieldId], {
      kind: "date",
      value: "2026-09-30T12:00:00.000Z",
    });

    const undoSet = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("field-undo", { [taskId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: setValue.commandId },
      }),
    );
    assert.equal(undoSet.diagnosticCode, "command.undone");
    assert.equal(
      harness.store.snapshot().tasks.find((task) => task.id === taskId)?.fields,
      undefined,
      "undo restores the exact prior (absent) value",
    );

    const archive = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("field-archive", { [dateFieldId]: 1 }),
        commandName: "fieldDef.archive",
        payload: { fieldId: dateFieldId },
      }),
    );
    assert.equal(archive.diagnosticCode, "fieldDef.changed");
    const setOnRetired = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("field-set-retired", { [taskId]: 3 }),
        commandName: "record.setFieldValue",
        payload: {
          targetKind: "task",
          recordId: taskId,
          fieldId: dateFieldId,
          value: { kind: "date", value: "2026-10-01T12:00:00.000Z" },
        },
      }),
    );
    assert.equal(
      setOnRetired.diagnosticCode,
      "command.precondition_failed",
      "a retired definition is no longer assignable",
    );
  });

  it("bundles project starters into templates applied prospectively with scoped undo", () => {
    const harness = setup();
    const templateId = "10000000-0000-4000-8000-00000000c301";
    const projectFieldId = "10000000-0000-4000-8000-00000000c302";
    const taskFieldId = "10000000-0000-4000-8000-00000000c303";
    for (const [fieldId, targetKind, label] of [
      [projectFieldId, "project", "Segment klienta"],
      [taskFieldId, "task", "Estymata"],
    ] as const) {
      assert.equal(
        unwrap(
          harness.kernel.execute(context(), {
            ...metadata(`template-field-${label}`),
            commandName: "fieldDef.create",
            payload: { fieldId, targetKind, label, type: { kind: "text" } },
          }),
        ).diagnosticCode,
        "fieldDef.created",
      );
    }
    const created = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("template-create"),
        commandName: "template.create",
        payload: {
          templateId,
          name: "Wdrożenie klienta",
          taskTitles: ["Kickoff", "Retro"],
          fieldIds: [projectFieldId],
        },
      }),
    );
    assert.equal(created.diagnosticCode, "template.created");
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-duplicate"),
          commandName: "template.create",
          payload: {
            templateId: "10000000-0000-4000-8000-00000000c304",
            name: "wdrożenie KLIENTA",
          },
        }),
      ).diagnosticCode,
      "command.precondition_failed",
      "active template names stay unique case-insensitively",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-task-field"),
          commandName: "template.create",
          payload: {
            templateId: "10000000-0000-4000-8000-00000000c305",
            name: "Zły szablon",
            fieldIds: [taskFieldId],
          },
        }),
      ).diagnosticCode,
      "command.precondition_failed",
      "templates only reference project-targeted field definitions",
    );

    const { projectId } = createProjectRecord(harness, "Orbit onboarding");
    const kickoffId = createTask(harness, "Kickoff");
    const snapshotBefore = harness.store.snapshot();
    const kickoff = snapshotBefore.tasks.find((task) => task.id === kickoffId);
    const projectBefore = snapshotBefore.projects.find(
      (project) => project.id === projectId,
    );
    assert.ok(kickoff);
    assert.ok(projectBefore);
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-relate", {
            [kickoffId]: kickoff.version,
            [projectId]: projectBefore.version,
          }),
          commandName: "record.relate",
          payload: {
            relationType: "task_contributes_to_project",
            taskId: kickoffId,
            projectId,
          },
        }),
      ).diagnosticCode,
      "relation.created",
    );

    const projectVersion = harness.store
      .snapshot()
      .projects.find((project) => project.id === projectId)?.version;
    assert.ok(projectVersion !== undefined);
    const applyCommand = {
      ...metadata("template-apply", { [projectId]: projectVersion }),
      commandName: "project.applyTemplate",
      payload: { projectId, templateId },
    };
    const applied = unwrap(harness.kernel.execute(context(), applyCommand));
    assert.equal(applied.diagnosticCode, "project.template_applied");
    if (
      applied.outcome !== "success" ||
      applied.projection.kind !== "project.template_applied"
    ) {
      throw new Error("Expected template application.");
    }
    assert.deepEqual(
      applied.projection.skippedExistingTitles,
      ["Kickoff"],
      "existing related Tasks with a starter title are skipped, not rewritten",
    );
    assert.equal(applied.projection.createdTaskIds.length, 1);
    const retroId = applied.projection.createdTaskIds[0];
    assert.ok(retroId !== undefined);
    const afterApply = harness.store.snapshot();
    assert.equal(
      afterApply.tasks.find((task) => task.id === retroId)?.title,
      "Retro",
    );
    assert.equal(
      afterApply.relations.filter(
        (relation) =>
          relation.projectId === projectId && relation.state === "active",
      ).length,
      2,
      "the created starter joins the project through an ordinary relation",
    );
    assert.equal(
      afterApply.projects.find((project) => project.id === projectId)
        ?.appliedTemplateId,
      templateId,
      "application stamps provenance on the project",
    );

    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-reapply", {
            [projectId]: applied.projection.version,
          }),
          commandName: "project.applyTemplate",
          payload: { projectId, templateId },
        }),
      ).diagnosticCode,
      "command.precondition_failed",
      "re-applying the same template is refused",
    );

    const retroVersion = afterApply.tasks.find(
      (task) => task.id === retroId,
    )?.version;
    assert.ok(retroVersion !== undefined);
    const undoApply = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("template-unapply", {
          [projectId]: applied.projection.version,
          [retroId]: retroVersion,
        }),
        commandName: "command.undo",
        payload: { targetCommandId: applyCommand.commandId },
      }),
    );
    assert.equal(undoApply.diagnosticCode, "command.undone");
    const afterUndo = harness.store.snapshot();
    assert.equal(
      afterUndo.tasks.find((task) => task.id === retroId)?.recordState,
      "removed",
      "unapply removes exactly the Tasks the application created",
    );
    assert.equal(
      afterUndo.projects.find((project) => project.id === projectId)
        ?.appliedTemplateId,
      undefined,
      "unapply clears the provenance stamp",
    );
    assert.equal(
      afterUndo.tasks.find((task) => task.id === kickoffId)?.recordState,
      "active",
      "pre-existing Tasks are untouched by unapply",
    );

    const projectAfterUndo = afterUndo.projects.find(
      (project) => project.id === projectId,
    );
    assert.ok(projectAfterUndo);
    const reapplyCommand = {
      ...metadata("template-apply-2", {
        [projectId]: projectAfterUndo.version,
      }),
      commandName: "project.applyTemplate",
      payload: { projectId, templateId },
    };
    const reapplied = unwrap(harness.kernel.execute(context(), reapplyCommand));
    assert.equal(reapplied.diagnosticCode, "project.template_applied");
    if (
      reapplied.outcome !== "success" ||
      reapplied.projection.kind !== "project.template_applied"
    ) {
      throw new Error("Expected second application.");
    }
    const secondRetroId = reapplied.projection.createdTaskIds[0];
    assert.ok(secondRetroId !== undefined);
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-later-write", { [secondRetroId]: 1 }),
          commandName: "task.updateDetails",
          payload: { taskId: secondRetroId, description: "Notatki z retro" },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-unapply-blocked"),
          commandName: "command.undo",
          payload: { targetCommandId: reapplyCommand.commandId },
        }),
      ).diagnosticCode,
      "undo.not_available",
      "a later edit to a created Task blocks unapplying",
    );

    const renameCommand = {
      ...metadata("template-rename", { [templateId]: 1 }),
      commandName: "template.rename",
      payload: { templateId, name: "Wdrożenie enterprise" },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), renameCommand)).diagnosticCode,
      "template.changed",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-rename-undo", { [templateId]: 2 }),
          commandName: "command.undo",
          payload: { targetCommandId: renameCommand.commandId },
        }),
      ).diagnosticCode,
      "command.undone",
      "definition mutations restore exactly through undo",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-archive", { [templateId]: 3 }),
          commandName: "template.archive",
          payload: { templateId },
        }),
      ).diagnosticCode,
      "template.changed",
    );
    const projectFinal = harness.store
      .snapshot()
      .projects.find((project) => project.id === projectId);
    assert.ok(projectFinal);
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("template-apply-retired", {
            [projectId]: projectFinal.version,
          }),
          commandName: "project.applyTemplate",
          payload: {
            projectId,
            templateId: "10000000-0000-4000-8000-00000000c301",
          },
        }),
      ).diagnosticCode,
      "command.precondition_failed",
      "a retired template is no longer applicable",
    );
  });

  it("automates completion status and elapsed waiting reviews within declared bounds", () => {
    const harness = setup();
    const doneStatusId = "10000000-0000-4000-8000-00000000d401";
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("auto-status"),
          commandName: "taskStatus.create",
          payload: {
            statusId: doneStatusId,
            label: "Zrobione",
            operationalSemantics: "actionable",
          },
        }),
      ).diagnosticCode,
      "taskStatus.created",
    );
    const completionRuleId = "10000000-0000-4000-8000-00000000d402";
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("auto-rule"),
          commandName: "automation.create",
          payload: {
            ruleId: completionRuleId,
            name: "Ukończone ląduje w Zrobione",
            recipe: { kind: "complete_sets_status", statusId: doneStatusId },
          },
        }),
      ).diagnosticCode,
      "automation.created",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("auto-rule-duplicate"),
          commandName: "automation.create",
          payload: {
            ruleId: "10000000-0000-4000-8000-00000000d403",
            name: "ukończone LĄDUJE w Zrobione",
            recipe: { kind: "waiting_review_signals" },
          },
        }),
      ).diagnosticCode,
      "command.precondition_failed",
      "active rule names stay unique case-insensitively",
    );

    const taskId = createTask(harness, "Automated completion evidence");
    const completeCommand = {
      ...metadata("auto-complete", { [taskId]: 1 }),
      commandName: "task.complete",
      payload: { taskId },
    };
    const completed = unwrap(
      harness.kernel.execute(context(), completeCommand),
    );
    assert.equal(completed.diagnosticCode, "task.completed");
    if (
      completed.outcome !== "success" ||
      completed.projection.kind !== "task.completed"
    ) {
      throw new Error("Expected completion.");
    }
    assert.equal(
      completed.projection.appliedAutomationRuleId,
      completionRuleId,
      "the automated effect is attributed to its rule",
    );
    assert.equal(completed.projection.statusId, doneStatusId);
    const afterComplete = harness.store
      .snapshot()
      .tasks.find((task) => task.id === taskId);
    assert.equal(afterComplete?.statusId, doneStatusId);
    assert.equal(afterComplete?.completionState, "completed");

    const undone = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("auto-complete-undo", { [taskId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: completeCommand.commandId },
      }),
    );
    assert.equal(undone.diagnosticCode, "command.undone");
    const afterUndo = harness.store
      .snapshot()
      .tasks.find((task) => task.id === taskId);
    assert.equal(
      afterUndo?.statusId,
      harness.store.snapshot().workspaces[0]?.defaultTaskStatusId,
      "undo restores the pre-automation status exactly",
    );
    assert.equal(afterUndo?.completionState, "open");

    const disableCommand = {
      ...metadata("auto-disable", { [completionRuleId]: 1 }),
      commandName: "automation.setState",
      payload: { ruleId: completionRuleId, state: "disabled" },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), disableCommand)).diagnosticCode,
      "automation.changed",
    );
    const secondComplete = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("auto-complete-2", { [taskId]: 3 }),
        commandName: "task.complete",
        payload: { taskId },
      }),
    );
    assert.equal(secondComplete.diagnosticCode, "task.completed");
    if (
      secondComplete.outcome !== "success" ||
      secondComplete.projection.kind !== "task.completed"
    ) {
      throw new Error("Expected second completion.");
    }
    assert.equal(
      secondComplete.projection.appliedAutomationRuleId,
      undefined,
      "a disabled rule is inert",
    );

    const waitingRuleId = "10000000-0000-4000-8000-00000000d404";
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("auto-waiting-rule"),
          commandName: "automation.create",
          payload: {
            ruleId: waitingRuleId,
            name: "Sygnalizuj minięte przeglądy oczekiwania",
            recipe: { kind: "waiting_review_signals" },
          },
        }),
      ).diagnosticCode,
      "automation.created",
    );
    const waitingTaskId = createTask(harness, "Waiting for pricing");
    const freshTaskId = createTask(harness, "Waiting fresh");
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("auto-waiting", { [waitingTaskId]: 1 }),
          commandName: "task.setOperationalState",
          payload: {
            taskId: waitingTaskId,
            operationalState: "waiting",
            waitingOn: {
              kind: "external",
              label: "Cennik dystrybutora",
              direction: "waiting_on_them",
              expectedAt: "2020-01-01T00:00:00.000Z",
            },
          },
        }),
      ).diagnosticCode,
      "task.operational_state_changed",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("auto-waiting-fresh", { [freshTaskId]: 1 }),
          commandName: "task.setOperationalState",
          payload: {
            taskId: freshTaskId,
            operationalState: "waiting",
            waitingOn: {
              kind: "external",
              label: "Odległy przegląd",
              expectedAt: "2999-01-01T00:00:00.000Z",
            },
          },
        }),
      ).diagnosticCode,
      "task.operational_state_changed",
    );

    const swept = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("auto-sweep"),
        commandName: "automation.sweep",
        payload: {},
      }),
    );
    assert.equal(swept.diagnosticCode, "automation.swept");
    if (
      swept.outcome !== "success" ||
      swept.projection.kind !== "automation.swept"
    ) {
      throw new Error("Expected sweep.");
    }
    assert.deepEqual(
      swept.projection.raisedTaskIds,
      [waitingTaskId],
      "only elapsed review dates raise signals",
    );
    const signals = harness.store.snapshot().attentionSignals ?? [];
    assert.equal(
      signals.filter((signal) => signal.reason === "waiting_review_elapsed")
        .length,
      1,
    );

    const reswept = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("auto-sweep-2"),
        commandName: "automation.sweep",
        payload: {},
      }),
    );
    if (
      reswept.outcome !== "success" ||
      reswept.projection.kind !== "automation.swept"
    ) {
      throw new Error("Expected second sweep.");
    }
    assert.deepEqual(
      reswept.projection.raisedTaskIds,
      [],
      "re-sweeping is idempotent through dedup keys",
    );
    assert.equal(reswept.projection.alreadySignaledCount, 1);
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
    const hiddenDocumentId = "10000000-0000-4000-8000-00000000dcbd" as never;
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
      transaction.insertDocument({
        id: hiddenDocumentId,
        workspaceId: context().workspaceId,
        spaceId: hiddenSpaceId,
        title: "SECRET_DOCUMENT_TITLE",
        role: "note",
        createdBy: context().principalId,
        version: 1,
        createdAt: "2026-07-12T12:00:00.000Z",
        updatedAt: "2026-07-12T12:00:00.000Z",
      });
    });
    harness.store.replaceDocumentEntityLinks(hiddenDocumentId, [
      {
        workspaceId: ids.workspace as never,
        spaceId: hiddenSpaceId,
        documentId: hiddenDocumentId,
        targetKind: "task",
        targetId: taskId,
        updatedAt: "2026-07-12T12:00:00.000Z",
      },
    ]);
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
    const hiddenCandidates = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "document.linkCandidates",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: hiddenSpaceId, text: "secret", limit: 20 },
    });
    assert.equal(hiddenCandidates.kind, "query_result");
    if (hiddenCandidates.kind === "query_result") {
      assert.equal(hiddenCandidates.result.outcome, "rejected");
      assert.equal(JSON.stringify(hiddenCandidates).includes("SECRET"), false);
    }
    const visibleTargetBacklinks = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "document.backlinks",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { targetKind: "task", targetId: taskId },
    });
    if (
      visibleTargetBacklinks.kind !== "query_result" ||
      visibleTargetBacklinks.result.outcome !== "success" ||
      visibleTargetBacklinks.result.projection.kind !== "document.backlinks"
    )
      assert.fail("Expected visible target backlinks.");
    assert.deepEqual(visibleTargetBacklinks.result.projection.items, []);
    assert.equal(
      JSON.stringify(visibleTargetBacklinks).includes("SECRET"),
      false,
    );
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

  it("removes a Task, hides it from singular reads, and restores it on undo", () => {
    const harness = setup();
    const taskId = createTask(harness, "Retire the stale onboarding draft");
    const versionOf = (): number =>
      harness.store.snapshot().tasks.find((t) => t.id === taskId)!.version;

    // A comment and an attention signal exist before removal, so we can prove
    // the two singular read paths stop surfacing the Task once it is removed.
    const commentId = requestId();
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("pre-remove-comment", { [taskId]: versionOf() }),
        commandName: "comment.add",
        payload: {
          commentId,
          target: { kind: "task", taskId },
          body: "Does this still matter?",
          mentionPrincipalIds: [ids.principal],
        },
      }),
    );
    // Returns the thread count when the Task is visible, or "hidden" when the
    // query is rejected — a removed Task is indistinguishable from one that
    // never existed, so comment.list rejects rather than returning an empty
    // list, and that rejection IS the leak being closed.
    const listComments = (): number | "hidden" => {
      const r = harness.kernel.query(context(), {
        contractVersion: 1,
        queryName: "comment.list",
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { target: { kind: "task", taskId } },
      });
      if (r.kind !== "query_result") assert.fail("Expected a query result");
      if (r.result.outcome !== "success") return "hidden";
      return r.result.projection.kind === "comment.list"
        ? r.result.projection.threads.length
        : assert.fail("Expected comment.list projection");
    };
    assert.equal(listComments(), 1);

    const removed = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("remove", { [taskId]: versionOf() }),
        commandName: "task.remove",
        payload: { taskId },
      }),
    );
    assert.equal(removed.diagnosticCode, "task.removed");
    assert.equal(
      harness.store.snapshot().tasks.find((t) => t.id === taskId)!.recordState,
      "removed",
    );

    // The leak fix (ADR-043 §4): a removed Task is invisible to comment.list.
    assert.equal(listComments(), "hidden");
    // It is also gone from task.list, as the list primitives already ensured.
    const listResult = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace },
    });
    if (listResult.kind !== "query_result")
      assert.fail("Expected a task.list result");
    if (
      listResult.result.outcome === "success" &&
      listResult.result.projection.kind === "task.list"
    ) {
      assert.equal(
        listResult.result.projection.items.some((t) => t.id === taskId),
        false,
      );
    }

    // §5 — no new association may attach to a removed Task.
    const deniedComment = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("post-remove-comment", { [taskId]: versionOf() }),
        commandName: "comment.add",
        payload: {
          commentId: requestId(),
          target: { kind: "task", taskId },
          body: "Sneaking a comment onto a removed task",
          mentionPrincipalIds: [],
        },
      }),
    );
    assert.equal(deniedComment.diagnosticCode, "command.precondition_failed");

    // Undo restores the Task to exactly active, and it reappears.
    const preview = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("remove-undo-preview"),
        commandName: "command.previewUndo",
        payload: { targetCommandId: removed.commandId },
      }),
    );
    if (preview.outcome !== "preview") assert.fail("Expected an undo preview");
    assert.equal(
      preview.projection.compensationKind,
      "task.restore_record_state",
    );
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("remove-undo", preview.projection.requiredVersions),
        commandName: "command.undo",
        payload: { targetCommandId: removed.commandId },
      }),
    );
    assert.equal(
      harness.store.snapshot().tasks.find((t) => t.id === taskId)!.recordState,
      "active",
    );
    assert.equal(listComments(), 1);
  });

  it("refuses to remove a Task that still has an active subtask", () => {
    const harness = setup();
    const parentId = createTask(harness, "Parent with a child");
    const childId = createTask(harness, "Child of the parent");
    const versionOf = (id: TaskId): number =>
      harness.store.snapshot().tasks.find((t) => t.id === id)!.version;

    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("adopt-child", { [childId]: versionOf(childId) }),
        commandName: "task.setParent",
        payload: { taskId: childId, parentTaskId: parentId },
      }),
    );

    // The parent is not a leaf, so removing it would orphan the child.
    const refused = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("remove-parent", { [parentId]: versionOf(parentId) }),
        commandName: "task.remove",
        payload: { taskId: parentId },
      }),
    );
    assert.equal(refused.diagnosticCode, "command.precondition_failed");
    assert.equal(
      harness.store.snapshot().tasks.find((t) => t.id === parentId)!
        .recordState,
      "active",
    );

    // Removing the leaf child first is allowed; then the parent is a leaf too.
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("remove-child", { [childId]: versionOf(childId) }),
          commandName: "task.remove",
          payload: { taskId: childId },
        }),
      ).diagnosticCode,
      "task.removed",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("remove-parent-2", { [parentId]: versionOf(parentId) }),
          commandName: "task.remove",
          payload: { taskId: parentId },
        }),
      ).diagnosticCode,
      "task.removed",
    );
  });

  it("filters task.list by a relation-path condition, kernel-side", () => {
    const harness = setup();
    const p1 = createProjectRecord(harness, "Vendor project").projectId;
    const p2 = createProjectRecord(harness, "Other project").projectId;
    const taskInP1 = createTask(harness, "Work on the vendor project");
    const taskInP2 = createTask(harness, "Work on the other project");
    const unrelated = createTask(harness, "Free-floating work");

    const relate = (taskId: TaskId, projectId: ProjectId) => {
      const task = harness.store.snapshot().tasks.find((t) => t.id === taskId)!;
      const project = harness.store
        .snapshot()
        .projects.find((r) => r.id === projectId)!;
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`relate-${taskId}`, {
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
    };
    relate(taskInP1, p1);
    relate(taskInP2, p2);

    const listWith = (conditions: unknown): readonly string[] => {
      const r = harness.kernel.query(context(), {
        contractVersion: 1,
        queryName: "task.list",
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { spaceId: ids.rootSpace, relationConditions: conditions },
      } as never);
      if (r.kind !== "query_result" || r.result.outcome !== "success")
        assert.fail("Expected a task.list result");
      return r.result.projection.kind === "task.list"
        ? r.result.projection.items.map((item) => item.id)
        : assert.fail("Expected task.list projection");
    };

    // project.id — only the task related to p1 survives; the task related only
    // to p2 and the unrelated task are both excluded. This is the R12.4
    // projectIds intent, now honoured kernel-side instead of dropped.
    const byP1 = listWith([
      { path: "project", predicate: { field: "id", in: [p1] } },
    ]);
    assert.deepEqual([...byP1].sort(), [taskInP1].sort());
    assert.equal(byP1.includes(taskInP2), false);
    assert.equal(byP1.includes(unrelated), false);

    // Closing p1 lets a lifecycle condition prove the existential project scan:
    // "active" excludes the task whose only project is now closed.
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("close-p1", {
          [p1]: harness.store.snapshot().projects.find((r) => r.id === p1)!
            .version,
        }),
        commandName: "project.close",
        payload: { projectId: p1 },
      }),
    );
    const activeProjectTasks = listWith([
      { path: "project", predicate: { field: "lifecycle", equals: "active" } },
    ]);
    assert.equal(activeProjectTasks.includes(taskInP2), true);
    assert.equal(activeProjectTasks.includes(taskInP1), false);

    // A condition matching no project yields an empty set, not an unfiltered
    // list — "conditions present but nothing matched" still constrains.
    const noProject = listWith([
      {
        path: "project",
        predicate: {
          field: "id",
          in: ["00000000-0000-4000-8000-0000000000ff"],
        },
      },
    ]);
    assert.equal(noProject.length, 0);
  });

  it("rejects an unknown relation path instead of silently ignoring it", () => {
    const harness = setup();
    createTask(harness, "Some task");
    // ADR-044 §4 / the "Filtr po relacji" acceptance test: an unsupported path
    // is refused at the contract boundary, never accepted-and-dropped.
    const rejected = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {
        spaceId: ids.rootSpace,
        relationConditions: [
          { path: "project.customer", predicate: { field: "id", in: [] } },
        ],
      },
    } as never);
    assert.equal(rejected.kind, "contract_rejected");
  });

  it("answers the two-hop cross-query across Task, Project, and Organization", () => {
    const harness = setup();
    // Build the bridge: Organization → Opportunity(projectIds) → Project, then
    // relate a Task to that project. This is the founding "Zapytanie
    // przekrojowe" shape, expressed as one server-side query.
    const vendorOrg = "20000000-0000-4000-8000-0000000000a1";
    const otherOrg = "20000000-0000-4000-8000-0000000000a2";
    const createOrg = (id: string, state: "active" | "inactive") =>
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`org-${id}`),
          commandName: "relationship.organizationCreate",
          payload: {
            organizationId: id,
            spaceId: ids.rootSpace,
            name: `Org ${id}`,
            relationshipState: state,
          },
        }),
      );
    createOrg(vendorOrg, "active");
    createOrg(otherOrg, "inactive");

    const vendorProject = createProjectRecord(harness, "Vendor work").projectId;
    const otherProject = createProjectRecord(harness, "Other work").projectId;

    const linkOrgToProject = (
      opportunityId: string,
      organizationId: string,
      projectId: ProjectId,
    ) => {
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`opp-${opportunityId}`),
          commandName: "opportunity.create",
          payload: {
            opportunityId,
            spaceId: ids.rootSpace,
            title: `Opp ${opportunityId}`,
            organizationId,
            personIds: [],
            need: "n",
            qualification: "q",
            stage: "s",
            nextAction: "a",
            evidenceSourceIds: [],
          },
        }),
      );
      const opp = (harness.store.snapshot().strategicRecords ?? []).find(
        (r) => r.id === opportunityId,
      )!;
      const projectVersion = harness.store
        .snapshot()
        .projects.find((r) => r.id === projectId)!.version;
      const linked = unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`link-${opportunityId}`, {
            [opportunityId]: opp.version,
            [projectId]: projectVersion,
          }),
          commandName: "opportunity.linkOutcomes",
          payload: {
            opportunityId,
            offerIds: [],
            projectIds: [projectId],
            state: "open",
            nextAction: "a",
          },
        }),
      );
      // Guard the silent failure this test first hit: linkOutcomes requires the
      // project versions in expectedVersions; without them it returns a
      // versionConflict that leaves projectIds empty, and the two-hop finds
      // nothing.
      assert.equal(linked.diagnosticCode, "strategic.record_changed");
    };
    linkOrgToProject(
      "20000000-0000-4000-8000-0000000000b1",
      vendorOrg,
      vendorProject,
    );
    linkOrgToProject(
      "20000000-0000-4000-8000-0000000000b2",
      otherOrg,
      otherProject,
    );

    const taskVendor = createTask(harness, "Do the vendor work");
    const taskOther = createTask(harness, "Do the other work");
    const relate = (taskId: TaskId, projectId: ProjectId) => {
      const task = harness.store.snapshot().tasks.find((t) => t.id === taskId)!;
      const project = harness.store
        .snapshot()
        .projects.find((r) => r.id === projectId)!;
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`rel-${taskId}`, {
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
    };
    relate(taskVendor, vendorProject);
    relate(taskOther, otherProject);

    const query = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {
        spaceId: ids.rootSpace,
        relationConditions: [
          {
            path: "project.organization",
            predicate: { field: "relationshipState", equals: "active" },
          },
        ],
      },
    } as never);
    if (query.kind !== "query_result" || query.result.outcome !== "success")
      assert.fail("Expected a task.list result");
    const ids2 =
      query.result.projection.kind === "task.list"
        ? query.result.projection.items.map((i) => i.id)
        : assert.fail("Expected task.list projection");
    // Only the task whose project's organization is active survives the
    // two-hop. No host-side N+1: one query crossed Task→Project→Organization.
    assert.equal(ids2.includes(taskVendor), true);
    assert.equal(ids2.includes(taskOther), false);

    // ADR-045. The same conditions on a *saved view* must reach the same
    // answer, evaluated by the same evaluator, or a relation filter means one
    // thing to task.list and another to the view that carries it.
    const overviewViews = () => {
      const result = harness.kernel.query(context(), {
        contractVersion: 1,
        queryName: "work.overview",
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { spaceId: ids.rootSpace },
      });
      if (
        result.kind !== "query_result" ||
        result.result.outcome !== "success" ||
        result.result.projection.kind !== "work.overview"
      )
        assert.fail("Expected a work overview");
      return result.result.projection.savedViews;
    };

    const relationViewId = "20000000-0000-4000-8000-0000000000c1";
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("view-relation"),
          commandName: "savedView.create",
          payload: {
            savedViewId: relationViewId,
            spaceId: ids.rootSpace,
            name: "Praca u aktywnych klientów",
            filters: {
              relationConditions: [
                {
                  path: "project.organization",
                  predicate: { field: "relationshipState", equals: "active" },
                },
              ],
            },
            sort: "updated_desc",
          },
        } as never),
      ).outcome,
      "success",
    );
    const relationView = overviewViews().find((v) => v.id === relationViewId);
    assert.deepEqual(
      relationView?.relationTaskIds,
      [taskVendor],
      "a saved view's relation condition is evaluated kernel-side to the same task set task.list returns",
    );

    // The R12.4 keys were accepted, stored, echoed back, and read by nobody —
    // a relation filter that silently did nothing, reachable from MCP. They are
    // now translated into the equivalent condition, so the same request that
    // used to constrain nothing constrains correctly.
    const legacyViewId = "20000000-0000-4000-8000-0000000000c2";
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("view-legacy"),
          commandName: "savedView.create",
          payload: {
            savedViewId: legacyViewId,
            spaceId: ids.rootSpace,
            name: "Stary filtr po projekcie",
            filters: { projectIds: [vendorProject] },
            sort: "updated_desc",
          },
        } as never),
      ).outcome,
      "success",
    );
    const legacyView = overviewViews().find((v) => v.id === legacyViewId);
    assert.deepEqual(
      legacyView?.relationTaskIds,
      [taskVendor],
      "a legacy projectIds filter now constrains instead of being silently ignored",
    );
    assert.deepEqual(
      legacyView?.filters.relationConditions,
      [{ path: "project", predicate: { field: "id", in: [vendorProject] } }],
      "the legacy key is normalized into the shared condition vocabulary on write",
    );

    // ADR-045 asserted undo restores prior conditions and did not exercise it.
    // The descriptor is the generic restore_definition, but "it rides the
    // existing mechanism" is the claim, not the evidence.
    const changeConditions = {
      ...metadata("view-relation-update", { [relationViewId]: 1 }),
      commandName: "savedView.update" as const,
      payload: {
        savedViewId: relationViewId,
        filters: {
          relationConditions: [
            {
              path: "project.organization" as const,
              predicate: {
                field: "relationshipState" as const,
                equals: "prospect" as const,
              },
            },
          ],
        },
      },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), changeConditions)).outcome,
      "success",
    );
    assert.deepEqual(
      overviewViews().find((v) => v.id === relationViewId)?.relationTaskIds,
      [],
      "the narrowed condition is evaluated, not the old one",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("view-relation-undo", { [relationViewId]: 2 }),
          commandName: "command.undo",
          payload: { targetCommandId: changeConditions.commandId },
        }),
      ).diagnosticCode,
      "command.undone",
    );
    assert.deepEqual(
      overviewViews().find((v) => v.id === relationViewId)?.relationTaskIds,
      [taskVendor],
      "undo restores the prior relation conditions, and they are re-evaluated",
    );

    // The legacy keys accept up to 100 ids while the condition they translate
    // into accepts 50, and the translation builds the condition directly rather
    // than through the schema. A legacy filter naming 51+ projects therefore
    // stored a view that the strict projection could no longer parse — the #95
    // outage, reintroduced through the translation ADR-045 calls safe, and
    // invisible while every fixture used one-element arrays.
    const manyProjectIds = Array.from(
      { length: 60 },
      (_unused, index) =>
        `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const wideViewId = "20000000-0000-4000-8000-0000000000c4";
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("view-wide-legacy"),
          commandName: "savedView.create",
          payload: {
            savedViewId: wideViewId,
            spaceId: ids.rootSpace,
            name: "Szeroki stary filtr",
            filters: { projectIds: manyProjectIds },
            sort: "updated_desc",
          },
        } as never),
      ).outcome,
      "success",
      "the legacy vocabulary accepts up to 100 project ids",
    );
    assert.equal(
      overviewViews().find((v) => v.id === wideViewId) !== undefined,
      true,
      "a view translated from a wide legacy filter still projects",
    );

    // A view that constrains by relation but matches nothing must be
    // distinguishable from a view that does not constrain by relation at all.
    const emptyViewId = "20000000-0000-4000-8000-0000000000c3";
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("view-empty"),
          commandName: "savedView.create",
          payload: {
            savedViewId: emptyViewId,
            spaceId: ids.rootSpace,
            name: "Klienci nieaktywni",
            filters: {
              relationConditions: [
                {
                  path: "project.organization",
                  predicate: { field: "relationshipState", equals: "prospect" },
                },
              ],
            },
            sort: "updated_desc",
          },
        } as never),
      ).outcome,
      "success",
    );
    assert.deepEqual(
      overviewViews().find((v) => v.id === emptyViewId)?.relationTaskIds,
      [],
      "constrains by relation and matches nothing — an empty list, not an absent one",
    );
    assert.equal(
      overviewViews().find((v) => v.id === relationViewId)?.relationTaskIds !==
        undefined,
      true,
    );
  });

  it("replays a change feed from a cursor and refuses one it cannot place", () => {
    // ADR-051 / R14.4. An external host must be able to resume exactly where
    // it stopped, and must never be silently restarted — a restart replays
    // processed work as new, which is the one failure it cannot detect.
    const harness = setup();
    createTask(harness, "First");
    createTask(harness, "Second");
    createTask(harness, "Third");
    const feed = (parameters: Record<string, unknown>) => {
      const result = harness.kernel.query(context(), {
        contractVersion: 1,
        queryName: "activity.changeFeed",
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { spaceId: ids.rootSpace, ...parameters },
      });
      return result;
    };
    const first = feed({ limit: 2 });
    assert.equal(first.kind, "query_result");
    if (
      first.kind !== "query_result" ||
      first.result.outcome !== "success" ||
      first.result.projection.kind !== "activity.changeFeed"
    )
      throw new Error("Expected a change feed.");
    assert.equal(first.result.projection.events.length, 2);
    assert.equal(first.result.projection.hasMore, true);
    const cursor = first.result.projection.nextCursor;
    assert.ok(cursor);

    const second = feed({ afterEventId: cursor });
    if (
      second.kind !== "query_result" ||
      second.result.outcome !== "success" ||
      second.result.projection.kind !== "activity.changeFeed"
    )
      throw new Error("Expected a change feed.");
    // No gap and no repeat across the page boundary.
    const firstIds = first.result.projection.events.map(
      (event) => event.eventId,
    );
    const secondIds = second.result.projection.events.map(
      (event) => event.eventId,
    );
    assert.equal(
      firstIds.some((id) => secondIds.includes(id)),
      false,
    );
    assert.equal(second.result.projection.hasMore, false);
    const all = feed({ limit: 200 });
    if (
      all.kind !== "query_result" ||
      all.result.outcome !== "success" ||
      all.result.projection.kind !== "activity.changeFeed"
    )
      throw new Error("Expected a change feed.");
    assert.deepEqual(
      all.result.projection.events.map((event) => event.eventId),
      [...firstIds, ...secondIds],
    );
    // A feed carries ids, types and versions — never record content, so a
    // subscriber cannot learn more than an authorized read would give it.
    assert.deepEqual(
      Object.keys(all.result.projection.events[0] ?? {}).sort(),
      [
        "commandId",
        "eventId",
        "occurredAt",
        "recordId",
        "recordVersion",
        "type",
      ],
    );

    const unplaceable = feed({
      afterEventId: "10000000-0000-4000-8000-0000000000ff",
    });
    assert.equal(unplaceable.kind, "query_result");
    if (unplaceable.kind !== "query_result") throw new Error("Expected result");
    assert.equal(unplaceable.result.outcome, "rejected");
    if (unplaceable.result.outcome !== "rejected") return;
    assert.equal(unplaceable.result.diagnosticCode, "query.cursor_invalid");

    // Produce a membership event, so the filter below is exercised rather
    // than passing because nothing administrative ever happened. Changing
    // access raises the workspace policy version, so every later call is
    // reauthorized against it — both contexts below read it back.
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("feed-member-add", {
            [ids.workspace]: harness.store.read(
              (view) =>
                view.getWorkspace(WorkspaceIdSchema.parse(ids.workspace))
                  ?.version ?? 1,
            ),
          }),
          commandName: "workspace.memberAdd",
          payload: {
            membershipId: "10000000-0000-4000-8000-0000000000b1",
            spaceGrantId: "10000000-0000-4000-8000-0000000000b2",
            principalId: "10000000-0000-4000-8000-0000000000b3",
            displayName: "Second member",
            role: "member",
            spaceId: ids.rootSpace,
            access: "edit",
          },
        }),
      ).outcome,
      "success",
    );
    const policyVersion = harness.store.read(
      (view) =>
        view.getWorkspace(WorkspaceIdSchema.parse(ids.workspace))
          ?.policyVersion ?? 1,
    );
    const currentAdmin = ExecutionContextSchema.parse({
      ...context(),
      policyVersion,
    });
    harness.authorization.register(currentAdmin);
    const readFeed = (
      executionContext: typeof currentAdmin,
    ): readonly { readonly type: string }[] => {
      const result = harness.kernel.query(executionContext, {
        contractVersion: 1,
        queryName: "activity.changeFeed",
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { spaceId: ids.rootSpace, limit: 200 },
      });
      if (
        result.kind !== "query_result" ||
        result.result.outcome !== "success" ||
        result.result.projection.kind !== "activity.changeFeed"
      )
        throw new Error("Expected a change feed.");
      return result.result.projection.events;
    };
    assert.equal(
      readFeed(currentAdmin).some((event) =>
        event.type.startsWith("workspace.member_"),
      ),
      true,
      "an administrator sees membership activity",
    );

    // ADR-051 §3, enforced rather than asserted: the feed never shows an
    // event family whose subject the caller cannot read. `workspace.access`
    // returns only the caller's own row and `agent.access` only its own
    // grant, so membership and grant administration are filtered by the
    // administrative capability that governs them — which an agent grant can
    // never hold.
    const observerContext = ExecutionContextSchema.parse({
      ...context(),
      principalKind: "agent",
      policyVersion,
      // A distinct grant: registering another context under the same grant id
      // would replace the one the rest of this case relies on.
      grantId: "10000000-0000-4000-8000-0000000000a1",
      credentialId: "10000000-0000-4000-8000-0000000000a2",
      capabilityScope: ["activity.changeFeed", "task.list", "agent.access"],
    });
    harness.authorization.register(observerContext);
    assert.equal(
      readFeed(observerContext).some(
        (event) =>
          event.type.startsWith("workspace.member_") ||
          event.type.startsWith("agent."),
      ),
      false,
    );
  });

  it("projects entity-link candidates and backlinks without stale labels or duplicates", () => {
    const harness = setup();
    const taskId = createTask(harness, "Review linked scope");
    const project = unwrap(
      harness.kernel.execute(context(), {
        ...metadata("entity-link-project"),
        commandName: "project.create",
        payload: {
          spaceId: ids.rootSpace,
          title: "Connected project",
          intendedOutcome: "References stay navigable",
        },
      }),
    );
    assert.equal(project.outcome, "success");
    if (
      project.outcome !== "success" ||
      project.projection.kind !== "project.created"
    )
      assert.fail("Expected linked Project.");
    const projectId = project.projection.projectId;
    const documentId = requestId();
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("entity-link-document"),
          commandName: "document.create",
          payload: {
            documentId,
            spaceId: ids.rootSpace,
            title: "Working note",
            role: "note",
          },
        }),
      ).outcome,
      "success",
    );

    const candidates = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "document.linkCandidates",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.rootSpace, text: "connected", limit: 20 },
    });
    assert.equal(candidates.kind, "query_result");
    if (
      candidates.kind !== "query_result" ||
      candidates.result.outcome !== "success" ||
      candidates.result.projection.kind !== "document.linkCandidates"
    )
      assert.fail("Expected entity-link candidates.");
    assert.deepEqual(candidates.result.projection.items, [
      {
        targetKind: "project",
        targetId: projectId,
        label: "Connected project",
      },
    ]);

    harness.store.replaceDocumentEntityLinks(documentId as never, [
      {
        workspaceId: ids.workspace as never,
        spaceId: ids.rootSpace as never,
        documentId: documentId as never,
        targetKind: "task",
        targetId: taskId,
        updatedAt: "2026-07-21T20:00:00.000Z",
      },
      {
        workspaceId: ids.workspace as never,
        spaceId: ids.rootSpace as never,
        documentId: documentId as never,
        targetKind: "task",
        targetId: taskId,
        updatedAt: "2026-07-21T20:00:00.000Z",
      },
    ]);
    const backlinks = () =>
      harness.kernel.query(context(), {
        contractVersion: 1,
        queryName: "document.backlinks",
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        parameters: { targetKind: "task", targetId: taskId },
      });
    const first = backlinks();
    assert.equal(first.kind, "query_result");
    if (
      first.kind !== "query_result" ||
      first.result.outcome !== "success" ||
      first.result.projection.kind !== "document.backlinks"
    )
      assert.fail("Expected backlinks.");
    assert.equal(first.result.projection.items.length, 1);
    assert.equal(first.result.projection.target.label, "Review linked scope");

    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("entity-link-task-rename", { [taskId]: 1 }),
          commandName: "task.updateDetails",
          payload: { taskId, title: "Review renamed scope" },
        }),
      ).outcome,
      "success",
    );
    const renamed = backlinks();
    if (
      renamed.kind !== "query_result" ||
      renamed.result.outcome !== "success" ||
      renamed.result.projection.kind !== "document.backlinks"
    )
      assert.fail("Expected renamed backlink target.");
    assert.equal(
      renamed.result.projection.target.label,
      "Review renamed scope",
    );

    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata("entity-link-task-remove", { [taskId]: 2 }),
          commandName: "task.remove",
          payload: { taskId },
        }),
      ).outcome,
      "success",
    );
    const removed = backlinks();
    assert.equal(removed.kind, "query_result");
    if (removed.kind !== "query_result") return;
    assert.equal(removed.result.outcome, "rejected");
  });
});
