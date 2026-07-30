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
  // A second grant for the same member, registered separately so a context
  // built without `comment.add` cannot overwrite the full one it is compared
  // against — the policy keys its grants by grantId.
  memberNarrowGrant: "40000000-0000-4000-8000-000000000013",
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
  "relationship.organizationCreate",
  "relationship.personCreate",
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
  // Every refusal below is `command.precondition_failed`, and the owner and
  // the member carry the same capabilityScope on purpose: each one is about a
  // Space the caller may not reach or an access level too low for the
  // operation, never about a capability the grant lacks.
  // `authorization.denied` is reserved for the latter, so that a caller can
  // read it as the verdict on its grant that its name claims to be.
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
      "command.precondition_failed",
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
      "command.precondition_failed",
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
      "command.precondition_failed",
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
      "command.precondition_failed",
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

  // Decision #28 — the record screen carries one `Comments` tab across all
  // three record kinds, so an Organization has to be a comment target on the
  // terms a Task and a Project already have: the same capability, the same
  // Space scoping, the same version semantics and the same mention fan-out.
  // Until it was one, both the read and the write refused it at the contract
  // boundary — a malformed request rather than a rule anyone chose.
  it("carries comments on an Organization on the terms work records have", () => {
    const harness = createReferenceHarness();
    const ownerV1 = context("owner", 1, [ids.shared, ids.private]);
    harness.authorization.register(ownerV1);
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata("relationship-bootstrap"),
          commandName: "workspace.createLocal",
          payload: {
            workspaceId: ids.workspace,
            rootSpaceId: ids.shared,
            ownerPrincipalId: ids.owner,
            name: "Relationship matrix",
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
        createdAt: "2026-07-30T10:00:00.000+00:00",
      }),
    );
    harness.store.transact((transaction) =>
      transaction.insertSpaceGrant({
        id: SpaceGrantIdSchema.parse("40000000-0000-4000-8000-000000000014"),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        spaceId: SpaceIdSchema.parse(ids.private),
        principalId: ExecutionContextSchema.parse(ownerV1).principalId,
        access: "edit",
        status: "active",
        version: 1,
        createdAt: "2026-07-30T10:00:00.000+00:00",
        updatedAt: "2026-07-30T10:00:00.000+00:00",
      }),
    );

    const sharedOrganizationId = requestId();
    const privateOrganizationId = requestId();
    const personId = requestId();
    for (const [key, organizationId, spaceId, name] of [
      ["shared-org", sharedOrganizationId, ids.shared, "Falcon Freight"],
      ["private-org", privateOrganizationId, ids.private, "Kestrel Holdings"],
    ] as const) {
      assert.equal(
        unwrap(
          harness.kernel.execute(ownerV1, {
            ...metadata(key),
            commandName: "relationship.organizationCreate",
            payload: {
              organizationId,
              spaceId,
              name,
              relationshipState: "active",
            },
          }),
        ).outcome,
        "success",
      );
    }
    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata("shared-person"),
          commandName: "relationship.personCreate",
          payload: { personId, spaceId: ids.shared, name: "Ola Brzeska" },
        }),
      ).outcome,
      "success",
    );
    const project = unwrap(
      harness.kernel.execute(ownerV1, {
        ...metadata("shared-project"),
        commandName: "project.create",
        payload: {
          spaceId: ids.shared,
          title: "Freight onboarding",
          intendedOutcome: "Falcon Freight is live on the new lane plan",
        },
      }),
    );
    if (
      project.outcome !== "success" ||
      project.projection.kind !== "project.created"
    )
      assert.fail("Expected a Project.");
    const projectId = project.projection.projectId;

    assert.equal(
      unwrap(
        harness.kernel.execute(ownerV1, {
          ...metadata("relationship-add-member", { [ids.workspace]: 1 }),
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

    const projectCommentId = requestId();
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("project-comment", { [projectId]: 1 }),
          commandName: "comment.add",
          payload: {
            commentId: projectCommentId,
            target: { kind: "project", projectId },
            body: "The lane plan belongs to the Project, not to the client.",
            mentionPrincipalIds: [],
          },
        }),
      ).diagnosticCode,
      "comment.added",
    );
    const organizationCommentId = requestId();
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("organization-comment", { [sharedOrganizationId]: 1 }),
          commandName: "comment.add",
          payload: {
            commentId: organizationCommentId,
            target: {
              kind: "organization",
              organizationId: sharedOrganizationId,
            },
            body: "Owner, the renewal terms come from their legal team.",
            mentionPrincipalIds: [ids.owner],
          },
        }),
      ).diagnosticCode,
      "comment.added",
    );

    const listComments = (
      principal: ExecutionContext,
      target: Readonly<Record<string, string>>,
    ) =>
      harness.kernel.query(principal, {
        contractVersion: 1,
        queryId: requestId(),
        workspaceId: ids.workspace,
        consistency: "local_authoritative",
        queryName: "comment.list",
        parameters: { target },
      });

    const organizationThreads = listComments(memberV2, {
      kind: "organization",
      organizationId: sharedOrganizationId,
    });
    // `query_result` at all is half the assertion: a target the contract does
    // not carry never reaches the kernel, and comes back as a contract
    // rejection — a broken request, not a verdict on the request.
    if (
      organizationThreads.kind !== "query_result" ||
      organizationThreads.result.outcome !== "success" ||
      organizationThreads.result.projection.kind !== "comment.list"
    )
      assert.fail("Expected the Organization's comment thread.");
    assert.deepEqual(organizationThreads.result.projection.target, {
      kind: "organization",
      organizationId: sharedOrganizationId,
    });
    assert.deepEqual(
      organizationThreads.result.projection.threads.map(
        (thread) => thread.body,
      ),
      ["Owner, the renewal terms come from their legal team."],
    );
    const projectThreads = listComments(memberV2, {
      kind: "project",
      projectId,
    });
    if (
      projectThreads.kind !== "query_result" ||
      projectThreads.result.outcome !== "success" ||
      projectThreads.result.projection.kind !== "comment.list"
    )
      assert.fail("Expected the Project's comment thread.");
    assert.deepEqual(
      projectThreads.result.projection.threads.map((thread) => thread.id),
      [projectCommentId],
      "one Space, two record kinds, two threads that do not bleed together",
    );

    // The mention has to arrive through the inbox QUERY, not through the
    // stored signal: the signal is written whatever its destination says, and
    // it is the projection on the way out that has to know the kind.
    const inbox = harness.kernel.query(ownerV2, {
      contractVersion: 1,
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      queryName: "attention.inbox",
      parameters: {},
    });
    if (
      inbox.kind !== "query_result" ||
      inbox.result.outcome !== "success" ||
      inbox.result.projection.kind !== "attention.inbox"
    )
      assert.fail("Expected the owner's attention inbox.");
    const mention = inbox.result.projection.items.find(
      (item) => item.reason === "comment_mention",
    );
    assert.deepEqual(mention?.destination, {
      kind: "organization",
      organizationId: sharedOrganizationId,
    });
    assert.equal(
      mention?.title,
      "Falcon Freight",
      "an Organization is named, not titled",
    );

    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("organization-comment-stale-resolve", {
            [organizationCommentId]: 2,
          }),
          commandName: "comment.resolve",
          payload: { commentId: organizationCommentId },
        }),
      ).diagnosticCode,
      "record.version_conflict",
    );
    for (const [key, commandName, expected, diagnosticCode] of [
      ["org-comment-resolve", "comment.resolve", 1, "comment.resolved"],
      ["org-comment-reopen", "comment.reopen", 2, "comment.reopened"],
    ] as const) {
      assert.equal(
        unwrap(
          harness.kernel.execute(memberV2, {
            ...metadata(key, { [organizationCommentId]: expected }),
            commandName,
            payload: { commentId: organizationCommentId },
          }),
        ).diagnosticCode,
        diagnosticCode,
      );
    }
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("organization-comment-edit", {
            [organizationCommentId]: 3,
          }),
          commandName: "comment.edit",
          payload: {
            commentId: organizationCommentId,
            body: "Owner, their legal team sent the renewal terms today.",
            mentionPrincipalIds: [ids.owner],
          },
        }),
      ).diagnosticCode,
      "comment.edited",
    );
    const stored = harness.store
      .snapshot()
      .comments?.find((comment) => comment.id === organizationCommentId);
    assert.equal(stored?.version, 4);
    assert.equal(stored?.threadState, "open");
    assert.deepEqual(stored?.target, {
      kind: "organization",
      organizationId: sharedOrganizationId,
    });

    // A StrategicRecordId names a record of SOME strategic kind, and only one
    // of those kinds is a comment target.
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("person-is-not-an-organization"),
          commandName: "comment.add",
          payload: {
            commentId: requestId(),
            target: { kind: "organization", organizationId: personId },
            body: "Must not attach to a Person",
            mentionPrincipalIds: [],
          },
        }),
      ).diagnosticCode,
      "command.precondition_failed",
    );
    // A Project read through the organization arm resolves to nothing, and a
    // target that resolves to nothing is answered exactly as one the caller may
    // not see — which is the point.
    const projectIdAsOrganization = listComments(memberV2, {
      kind: "organization",
      organizationId: projectId,
    });
    if (
      projectIdAsOrganization.kind !== "query_result" ||
      projectIdAsOrganization.result.outcome !== "rejected"
    )
      assert.fail("A Project id must not resolve as an Organization.");
    assert.equal(
      projectIdAsOrganization.result.diagnosticCode,
      "authorization.denied",
    );

    // The member's spaceScope names the private Space; no grant backs it.
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("unreachable-organization-comment", {
            [privateOrganizationId]: 1,
          }),
          commandName: "comment.add",
          payload: {
            commentId: requestId(),
            target: {
              kind: "organization",
              organizationId: privateOrganizationId,
            },
            body: "Must not reach the private Space",
            mentionPrincipalIds: [],
          },
        }),
      ).diagnosticCode,
      "command.precondition_failed",
    );
    const unreachable = listComments(memberV2, {
      kind: "organization",
      organizationId: privateOrganizationId,
    });
    assert.equal(
      unreachable.kind,
      "query_result",
      "an Organization the caller may not see is refused, not malformed",
    );
    if (
      unreachable.kind !== "query_result" ||
      unreachable.result.outcome !== "rejected"
    )
      assert.fail("Expected a refusal for an unreachable Organization.");
    assert.equal(unreachable.result.diagnosticCode, "authorization.denied");

    // ADR-067 — the ORDER of the two checks is the assertion. A caller whose
    // grant never carried `comment.add` is told that even when the target it
    // named resolves to nothing: an arm that refuses on the target first
    // consults the policy not at all, and nothing consulted reads back as
    // nothing refused.
    const memberWithoutCommenting = ExecutionContextSchema.parse({
      ...memberV2,
      grantId: ids.memberNarrowGrant,
      capabilityScope: capabilityScope.filter(
        (capability) => capability !== "comment.add",
      ),
    });
    harness.authorization.register(memberWithoutCommenting);
    assert.equal(
      unwrap(
        harness.kernel.execute(memberWithoutCommenting, {
          ...metadata("ungranted-organization-comment"),
          commandName: "comment.add",
          payload: {
            commentId: requestId(),
            target: { kind: "organization", organizationId: requestId() },
            body: "Must be answered about the grant, not about the target",
            mentionPrincipalIds: [],
          },
        }),
      ).diagnosticCode,
      "authorization.denied",
    );
    // The same unresolvable target, from a grant that does carry the
    // capability, says nothing about whether that Organization exists.
    assert.equal(
      unwrap(
        harness.kernel.execute(memberV2, {
          ...metadata("missing-organization-comment"),
          commandName: "comment.add",
          payload: {
            commentId: requestId(),
            target: { kind: "organization", organizationId: requestId() },
            body: "Must neither confirm nor deny the Organization",
            mentionPrincipalIds: [],
          },
        }),
      ).diagnosticCode,
      "command.precondition_failed",
    );
  });
});
