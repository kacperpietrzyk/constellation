import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  SpaceGrantIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "40000000-0000-4000-8000-000000000001",
  shared: "40000000-0000-4000-8000-000000000002",
  private: "40000000-0000-4000-8000-000000000003",
  owner: "40000000-0000-4000-8000-000000000004",
  member: "40000000-0000-4000-8000-000000000005",
  membership: "40000000-0000-4000-8000-000000000006",
  spaceGrant: "40000000-0000-4000-8000-000000000007",
  ownerCredential: "40000000-0000-4000-8000-000000000008",
  ownerGrant: "40000000-0000-4000-8000-000000000009",
  memberCredential: "40000000-0000-4000-8000-000000000010",
  memberGrant: "40000000-0000-4000-8000-000000000011",
} as const;

let sequence = 20_000;
const requestId = (): string =>
  `40000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, "0")}`;

const capabilityScope = [
  "workspace.createLocal",
  "workspace.manageAccess",
  "workspace.access",
  "workspace.exportScoped",
  "workspace.bootstrapContext",
  "capture.submitText",
  "capture.routeAsTask",
  "capture.history",
  "project.create",
  "project.list",
  "task.list",
  "task.assign",
  "task.unassign",
  "task.assignmentCandidates",
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
  "search.global",
  "activity.meaningful",
] as const;

const context = (
  principal: "owner" | "member",
  policyVersion: number,
  spaces: readonly string[],
): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids[principal],
    principalKind: "human",
    credentialId:
      principal === "owner" ? ids.ownerCredential : ids.memberCredential,
    grantId: principal === "owner" ? ids.ownerGrant : ids.memberGrant,
    policyVersion,
    workspaceId: ids.workspace,
    spaceScope: spaces,
    capabilityScope,
    origin: "desktop",
  });

const metadata = (
  key: string,
  expectedVersions: Readonly<Record<string, number>> = {},
) => ({
  contractVersion: 1,
  commandId: requestId(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions,
  correlationId: requestId(),
});

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome") throw new Error("Expected outcome.");
  return response.outcome;
};

describe("collaboration-safe policy kernel", () => {
  it("filters hidden content and reauthorizes view-only and revoked members", () => {
    const harness = createReferenceHarness();
    const ownerV1 = context("owner", 1, [ids.shared, ids.private]);
    harness.authorization.register(ownerV1);
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata("bootstrap"),
          commandName: "workspace.createLocal",
          payload: {
            workspaceId: ids.workspace,
            rootSpaceId: ids.shared,
            ownerPrincipalId: ids.owner,
            name: "Collaboration matrix",
            timezone: "Europe/Warsaw",
          },
        }),
      ).outcome,
      "success",
    );
    harness.store.transact((transaction) =>
      transaction.insertSpace({
        id: SpaceIdSchema.parse(ids.private),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        name: "Private strategy",
        version: 1,
        createdAt: "2026-07-14T10:00:00.000+00:00",
      }),
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata("owner-scope-is-not-implicit"),
          commandName: "capture.submitText",
          payload: {
            spaceId: ids.private,
            originalText: "Must not commit before a durable grant",
            deviceId: "owner-device",
            source: "in_app_quick_capture",
          },
        }),
      ).diagnosticCode,
      "authorization.denied",
    );
    harness.store.transact((transaction) =>
      transaction.insertSpaceGrant({
        id: SpaceGrantIdSchema.parse("40000000-0000-4000-8000-000000000012"),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        spaceId: SpaceIdSchema.parse(ids.private),
        principalId: ExecutionContextSchema.parse(ownerV1).principalId,
        access: "edit",
        status: "active",
        version: 1,
        createdAt: "2026-07-14T10:00:00.000+00:00",
        updatedAt: "2026-07-14T10:00:00.000+00:00",
      }),
    );
    for (const [spaceId, text, suffix] of [
      [ids.shared, "Shared launch checklist", "shared"],
      [ids.private, "PRIVATE-SENTINEL acquisition plan", "private"],
    ] as const) {
      const capture = unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata(`capture-${suffix}`),
          commandName: "capture.submitText",
          payload: {
            spaceId,
            originalText: text,
            deviceId: "owner-device",
            source: "in_app_quick_capture",
          },
        }),
      );
      assert.equal(capture.outcome, "success");
      if (
        capture.outcome !== "success" ||
        capture.projection.kind !== "capture.stored"
      )
        throw new Error("Expected capture.");
      const routed = unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata(`route-${suffix}`, { [capture.projection.captureId]: 1 }),
          commandName: "capture.routeAsTask",
          payload: {
            captureId: capture.projection.captureId,
            title: `${suffix} task`,
          },
        }),
      );
      assert.equal(routed.outcome, "success");
      if (
        routed.outcome !== "success" ||
        routed.projection.kind !== "capture.routed_as_task"
      )
        throw new Error("Expected task.");
      const project = unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata(`project-${suffix}`),
          commandName: "project.create",
          payload: {
            spaceId,
            title: `${suffix} project`,
            intendedOutcome: `${suffix} outcome`,
          },
        }),
      );
      assert.equal(project.outcome, "success");
      if (
        project.outcome !== "success" ||
        project.projection.kind !== "project.created"
      )
        throw new Error("Expected project.");
      assert.equal(
        unwrap(
          harness.kernel.execute(ownerV1, {
            ...metadata(`relate-${suffix}`, {
              [routed.projection.taskId]: 1,
              [project.projection.projectId]: 1,
            }),
            commandName: "record.relate",
            payload: {
              relationType: "task_contributes_to_project",
              taskId: routed.projection.taskId,
              projectId: project.projection.projectId,
            },
          }),
        ).outcome,
        "success",
      );
    }
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata("add-member", { [ids.workspace]: 1 }),
          commandName: "workspace.memberAdd",
          payload: {
            membershipId: ids.membership,
            spaceGrantId: ids.spaceGrant,
            principalId: ids.member,
            displayName: "Ada Nowak",
            role: "member",
            spaceId: ids.shared,
            access: "comment",
          },
        }),
      ).outcome,
      "success",
    );

    const ownerV2 = context("owner", 2, [ids.shared, ids.private]);
    const memberV2 = context("member", 2, [ids.shared, ids.private]);
    harness.authorization.register(ownerV2);
    harness.authorization.register(memberV2);
    const sharedTask = harness.store
      .snapshot()
      .tasks.find((task) => task.spaceId === ids.shared);
    assert.ok(sharedTask);
    const assignmentId = requestId();
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV2, {
          ...metadata("assign-member", { [sharedTask.id]: sharedTask.version }),
          commandName: "task.assign",
          payload: {
            assignmentId,
            taskId: sharedTask.id,
            assigneePrincipalId: ids.member,
          },
        }),
      ).outcome,
      "success",
    );
    const candidates = harness.kernel.query(memberV2, {
      contractVersion: 1,
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      queryName: "task.assignmentCandidates",
      parameters: { spaceId: ids.shared },
    });
    if (
      candidates.kind !== "query_result" ||
      candidates.result.outcome !== "success" ||
      candidates.result.projection.kind !== "task.assignmentCandidates"
    ) {
      assert.fail(
        "Assignment candidates should be scoped to the visible Space.",
      );
    }
    assert.deepEqual(
      candidates.result.projection.candidates.map((item) => item.principalId),
      [ids.member, ids.owner],
    );
    const hiddenSearch = harness.kernel.query(memberV2, {
      contractVersion: 1,
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      queryName: "search.global",
      parameters: {
        spaceIds: [ids.shared, ids.private],
        text: "PRIVATE-SENTINEL",
      },
    });
    assert.equal(hiddenSearch.kind, "query_result");
    if (hiddenSearch.kind !== "query_result")
      throw new Error("Expected query.");
    assert.equal(hiddenSearch.result.outcome, "rejected");

    const scopedExport = harness.kernel.query(memberV2, {
      contractVersion: 1,
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      queryName: "workspace.exportScoped",
      parameters: {},
    });
    assert.equal(scopedExport.kind, "query_result");
    if (
      scopedExport.kind !== "query_result" ||
      scopedExport.result.outcome !== "success" ||
      scopedExport.result.projection.kind !== "workspace.exportScoped"
    )
      throw new Error("Expected scoped export.");
    assert.deepEqual(
      scopedExport.result.projection.spaces.map((space) => space.id),
      [ids.shared],
    );
    assert.equal(scopedExport.result.projection.counts.captures, 1);
    assert.equal(scopedExport.result.projection.counts.tasks, 1);
    assert.equal(scopedExport.result.projection.counts.projects, 1);
    assert.equal(scopedExport.result.projection.counts.relations, 1);
    assert.equal(scopedExport.result.projection.counts.taskAssignments, 1);
    assert.ok(scopedExport.result.projection.counts.activity >= 4);

    const memberCommentId = requestId();
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("commenter-adds-comment", {
            [sharedTask.id]: sharedTask.version,
          }),
          commandName: "comment.add",
          payload: {
            commentId: memberCommentId,
            target: { kind: "task", taskId: sharedTask.id },
            body: "Owner, please verify the packaged recovery evidence.",
            mentionPrincipalIds: [ids.owner],
          },
        }),
      ).diagnosticCode,
      "comment.added",
    );
    const mentionSignal = harness.store
      .snapshot()
      .attentionSignals?.find(
        (signal) => signal.targetPrincipalId === ids.owner,
      );
    assert.ok(mentionSignal);
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV2, {
          ...metadata("owner-dismisses-mention", {
            [mentionSignal.id]: mentionSignal.version,
          }),
          commandName: "attention.dismiss",
          payload: { attentionSignalId: mentionSignal.id },
        }),
      ).diagnosticCode,
      "attention.dismissed",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("commenter-renews-mention", { [memberCommentId]: 1 }),
          commandName: "comment.edit",
          payload: {
            commentId: memberCommentId,
            body: "Owner, the packaged recovery evidence is ready.",
            mentionPrincipalIds: [ids.owner],
          },
        }),
      ).diagnosticCode,
      "comment.edited",
    );
    const renewedSignal = harness.store
      .snapshot()
      .attentionSignals?.find((signal) => signal.id === mentionSignal.id);
    assert.equal(
      harness.store
        .snapshot()
        .attentionSignals?.filter(
          (signal) => signal.reason === "comment_mention",
        ).length,
      1,
      "one root thread creates one recipient attention signal",
    );
    assert.equal(renewedSignal?.state, "unread");
    assert.equal(renewedSignal?.version, 3);
    assert.equal(renewedSignal?.dismissedAt, undefined);
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("commenter-cannot-edit-work"),
          commandName: "capture.submitText",
          payload: {
            spaceId: ids.shared,
            originalText: "Must not commit",
            deviceId: "member-device",
            source: "in_app_quick_capture",
          },
        }),
      ).diagnosticCode,
      "authorization.denied",
    );

    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV2, {
          ...metadata("set-view", {
            [ids.workspace]: 2,
            [ids.membership]: 1,
            [ids.spaceGrant]: 1,
          }),
          commandName: "workspace.memberSetAccess",
          payload: {
            membershipId: ids.membership,
            spaceGrantId: ids.spaceGrant,
            access: "view",
          },
        }),
      ).outcome,
      "success",
    );
    const memberV3 = context("member", 3, [ids.shared]);
    harness.authorization.register(memberV3);
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV3, {
          ...metadata("viewer-cannot-comment", {
            [sharedTask.id]: sharedTask.version,
          }),
          commandName: "comment.add",
          payload: {
            commentId: requestId(),
            target: { kind: "task", taskId: sharedTask.id },
            body: "Must not comment",
            mentionPrincipalIds: [],
          },
        }),
      ).diagnosticCode,
      "authorization.denied",
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV3, {
          ...metadata("forbidden-edit"),
          commandName: "capture.submitText",
          payload: {
            spaceId: ids.shared,
            originalText: "Must not commit",
            deviceId: "member-device",
            source: "in_app_quick_capture",
          },
        }),
      ).diagnosticCode,
      "authorization.denied",
    );

    const ownerV3 = context("owner", 3, [ids.shared, ids.private]);
    harness.authorization.register(ownerV3);
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV3, {
          ...metadata("revoke", {
            [ids.workspace]: 3,
            [ids.membership]: 1,
          }),
          commandName: "workspace.memberRevoke",
          payload: { membershipId: ids.membership },
        }),
      ).outcome,
      "success",
    );
    const memberV4 = context("member", 4, [ids.shared]);
    harness.authorization.register(memberV4);
    const revoked = harness.kernel.query(memberV4, {
      contractVersion: 1,
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      queryName: "workspace.exportScoped",
      parameters: {},
    });
    assert.equal(revoked.kind, "query_result");
    if (revoked.kind !== "query_result") throw new Error("Expected query.");
    assert.equal(revoked.result.outcome, "rejected");
    const ownerV4 = context("owner", 4, [ids.shared, ids.private]);
    harness.authorization.register(ownerV4);
    const tasksAfterRevocation = harness.kernel.query(ownerV4, {
      contractVersion: 1,
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      queryName: "task.list",
      parameters: { spaceId: ids.shared },
    });
    if (
      tasksAfterRevocation.kind !== "query_result" ||
      tasksAfterRevocation.result.outcome !== "success" ||
      tasksAfterRevocation.result.projection.kind !== "task.list"
    ) {
      assert.fail(
        "Owner should retain the shared Task after member revocation.",
      );
    }
    assert.equal(
      tasksAfterRevocation.result.projection.items[0]?.assignment?.availability,
      "former_member",
    );
    assert.equal(
      tasksAfterRevocation.result.projection.items[0]?.assignment
        ?.assigneePrincipalId,
      undefined,
    );
  });
});
