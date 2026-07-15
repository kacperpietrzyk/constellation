import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CommandEnvelopeSchema,
  DeviceIdSchema,
  ExecutionContextSchema,
  HubWorkspaceSnapshotSchema,
  WorkspaceIdSchema,
  type ExecutionContext,
} from "@constellation/contracts";
import { createReferenceHarness } from "@constellation/testkit";

import {
  HubService,
  InMemoryHubRepository,
  fromHubSnapshot,
  snapshotDigest,
  scopeHubSnapshot,
  toHubSnapshot,
} from "../src/index.js";

const ids = {
  workspace: WorkspaceIdSchema.parse("00000000-0000-4000-8000-000000000801"),
  space: "00000000-0000-4000-8000-000000000802",
  principal: "00000000-0000-4000-8000-000000000803",
  credential: "00000000-0000-4000-8000-000000000804",
  grant: "00000000-0000-4000-8000-000000000805",
  deviceA: DeviceIdSchema.parse("00000000-0000-4000-8000-000000000806"),
  deviceB: DeviceIdSchema.parse("00000000-0000-4000-8000-000000000807"),
} as const;

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
      "workspace.rename",
      "workspace.bootstrapContext",
      "capture.submitText",
      "capture.history",
      "task.list",
      "audit.receipt",
    ],
    origin: "desktop",
  });

let sequence = 0x820;
const uuid = (): string => {
  const suffix = sequence.toString(16).padStart(12, "0");
  sequence += 1;
  return `00000000-0000-4000-8000-${suffix}`;
};

const bootstrapSnapshot = () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const result = harness.kernel.execute(context(), {
    contractVersion: 1,
    commandName: "workspace.createLocal",
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: "hub-bootstrap",
    expectedVersions: {},
    correlationId: uuid(),
    payload: {
      workspaceId: ids.workspace,
      rootSpaceId: ids.space,
      ownerPrincipalId: ids.principal,
      name: "Hub workspace",
      timezone: "Europe/Warsaw",
    },
  });
  assert.equal(result.kind, "command_outcome");
  return toHubSnapshot(harness.store.snapshot());
};

const captureCommand = () =>
  CommandEnvelopeSchema.parse({
    contractVersion: 1 as const,
    commandName: "capture.submitText" as const,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: `capture-${sequence}`,
    expectedVersions: {},
    correlationId: uuid(),
    payload: {
      spaceId: ids.space,
      originalText: "Offline work from device A",
      deviceId: ids.deviceA,
      source: "global_quick_capture" as const,
    },
  });

const renameCommand = (name: string, expectedVersion: number) =>
  CommandEnvelopeSchema.parse({
    contractVersion: 1 as const,
    commandName: "workspace.rename" as const,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: `rename-${name}`,
    expectedVersions: { [ids.workspace]: expectedVersion },
    correlationId: uuid(),
    payload: { name },
  });

describe("self-hosted Hub core", () => {
  it("lets the first enrolled device publish the initial snapshot exactly once", async () => {
    const repository = new InMemoryHubRepository();
    const secrets = ["f".repeat(43), "g".repeat(43)];
    const service = new HubService(repository, {
      now: () => "2026-07-14T12:00:00.000Z",
      randomSecret: () => secrets.shift() ?? "h".repeat(43),
    });
    const empty = HubWorkspaceSnapshotSchema.parse({
      format: "constellation.workspace-snapshot/v1",
      workspaces: [],
      spaces: [],
      memberships: [],
      taskStatuses: [],
      captures: [],
      tasks: [],
      projects: [],
      relations: [],
      undoDescriptors: [],
      events: [],
      auditReceipts: [],
      idempotencyRecords: [],
      outboxEntries: [],
    });
    await service.createWorkspace({
      workspaceId: ids.workspace,
      snapshot: empty,
    });
    const grant = await service.createEnrollment({
      workspaceId: ids.workspace,
      authorization: context(),
      expiresAt: "2026-07-14T12:05:00.000Z",
    });
    const device = await service.enroll({
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceA,
      deviceLabel: "First device",
      enrollmentSecret: grant.enrollmentSecret,
    });
    assert.equal(device.outcome, "success");
    if (device.outcome !== "success") throw new Error("Enrollment failed.");
    const initial = bootstrapSnapshot();
    assert.deepEqual(
      await service.bootstrapSnapshot(device.deviceCredential, {
        protocolVersion: 1,
        workspaceId: ids.workspace,
        deviceId: ids.deviceA,
        digest: snapshotDigest(initial),
        snapshot: initial,
      }),
      { outcome: "success" },
    );
    const changed = HubWorkspaceSnapshotSchema.parse({
      ...initial,
      workspaces: [{ ...initial.workspaces[0], name: "Replacement denied" }],
    });
    assert.deepEqual(
      await service.bootstrapSnapshot(device.deviceCredential, {
        protocolVersion: 1,
        workspaceId: ids.workspace,
        deviceId: ids.deviceA,
        digest: snapshotDigest(changed),
        snapshot: changed,
      }),
      { outcome: "rejected", code: "workspace_not_empty" },
    );
  });

  it("enrolls two devices, converges, deduplicates, reconciles and revokes", async () => {
    const repository = new InMemoryHubRepository();
    const secrets = [
      "a".repeat(43),
      "b".repeat(43),
      "c".repeat(43),
      "d".repeat(43),
    ];
    const service = new HubService(repository, {
      now: () => "2026-07-14T12:00:00.000Z",
      randomSecret: () => secrets.shift() ?? "e".repeat(43),
    });
    const initial = bootstrapSnapshot();
    await service.createWorkspace({
      workspaceId: ids.workspace,
      snapshot: initial,
    });

    const enrollmentA = await service.createEnrollment({
      workspaceId: ids.workspace,
      authorization: context(),
      expiresAt: "2026-07-14T12:05:00.000Z",
    });
    const enrolledA = await service.enroll({
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceA,
      deviceLabel: "MacBook",
      enrollmentSecret: enrollmentA.enrollmentSecret,
    });
    assert.equal(enrolledA.outcome, "success");
    if (enrolledA.outcome !== "success")
      throw new Error("Enrollment A failed.");
    assert.deepEqual(
      await service.enroll({
        protocolVersion: 1,
        workspaceId: ids.workspace,
        deviceId: ids.deviceB,
        deviceLabel: "Reused code",
        enrollmentSecret: enrollmentA.enrollmentSecret,
      }),
      { outcome: "rejected", code: "enrollment_used" },
    );

    const enrollmentB = await service.createEnrollment({
      workspaceId: ids.workspace,
      authorization: context(),
      expiresAt: "2026-07-14T12:05:00.000Z",
    });
    const enrolledB = await service.enroll({
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceB,
      deviceLabel: "Windows",
      enrollmentSecret: enrollmentB.enrollmentSecret,
    });
    assert.equal(enrolledB.outcome, "success");
    if (enrolledB.outcome !== "success")
      throw new Error("Enrollment B failed.");

    const capture = captureCommand();
    const pushed = await service.sync(enrolledA.deviceCredential, {
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceA,
      checkpoint: "0",
      commands: [capture],
    });
    assert.equal(pushed.outcome, "success");
    if (pushed.outcome !== "success") throw new Error("Push failed.");
    assert.equal(pushed.currentCheckpoint, "1");
    assert.equal(pushed.change?.snapshot.captures.length, 1);

    const duplicate = await service.sync(enrolledA.deviceCredential, {
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceA,
      checkpoint: "1",
      commands: [capture],
    });
    assert.equal(duplicate.outcome, "success");
    if (duplicate.outcome !== "success") throw new Error("Replay failed.");
    assert.equal(duplicate.currentCheckpoint, "1");
    assert.equal(duplicate.receipts[0]?.commandId, capture.commandId);

    const pulledB = await service.sync(enrolledB.deviceCredential, {
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceB,
      checkpoint: "0",
      commands: [],
    });
    assert.equal(pulledB.outcome, "success");
    if (pulledB.outcome !== "success") throw new Error("Pull failed.");
    assert.equal(pulledB.change?.snapshot.captures.length, 1);

    const acceptedRename = renameCommand("Authoritative A", 1);
    const renamed = await service.sync(enrolledA.deviceCredential, {
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceA,
      checkpoint: "1",
      commands: [acceptedRename],
    });
    assert.equal(renamed.outcome, "success");
    if (renamed.outcome !== "success") throw new Error("Rename failed.");
    assert.equal(renamed.currentCheckpoint, "2");

    const staleRename = renameCommand("Offline stale B", 1);
    const conflict = await service.sync(enrolledB.deviceCredential, {
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceB,
      checkpoint: "1",
      commands: [staleRename],
    });
    assert.equal(conflict.outcome, "success");
    if (conflict.outcome !== "success")
      throw new Error("Conflict sync failed.");
    assert.equal(conflict.receipts[0]?.outcome.outcome, "conflict");
    assert.equal(conflict.currentCheckpoint, "2");
    assert.equal(
      conflict.change?.snapshot.workspaces[0]?.name,
      "Authoritative A",
    );

    const reconciled = await service.reconcileCommand({
      credential: enrolledA.deviceCredential,
      workspaceId: ids.workspace,
      deviceId: ids.deviceA,
      commandId: acceptedRename.commandId,
    });
    assert.equal(reconciled.outcome, "committed");

    assert.deepEqual(
      await service.sync(enrolledA.deviceCredential, {
        protocolVersion: 1,
        workspaceId: ids.workspace,
        deviceId: ids.deviceB,
        checkpoint: "2",
        commands: [],
      }),
      {
        outcome: "rejected",
        code: "credential_invalid",
        purgeLocalProjection: false,
      },
    );
    assert.deepEqual(
      await service.sync(enrolledA.deviceCredential, {
        protocolVersion: 1,
        workspaceId: ids.workspace,
        deviceId: ids.deviceA,
        checkpoint: "999",
        commands: [],
      }),
      {
        outcome: "rejected",
        code: "checkpoint_ahead",
        purgeLocalProjection: false,
      },
    );

    assert.equal(
      await service.revokeDevice({
        workspaceId: ids.workspace,
        deviceId: ids.deviceB,
      }),
      true,
    );
    const revoked = await service.sync(enrolledB.deviceCredential, {
      protocolVersion: 1,
      workspaceId: ids.workspace,
      deviceId: ids.deviceB,
      checkpoint: "2",
      commands: [],
    });
    assert.deepEqual(revoked, {
      outcome: "rejected",
      code: "device_revoked",
      purgeLocalProjection: true,
    });
  });

  it("rejects snapshot boundary violations and detects digest changes", () => {
    const snapshot = bootstrapSnapshot();
    const digest = snapshotDigest(snapshot);
    assert.equal(digest.length, 64);
    assert.equal(fromHubSnapshot(snapshot, ids.workspace).workspaces.length, 1);
    const changed = HubWorkspaceSnapshotSchema.parse({
      ...snapshot,
      workspaces: [{ ...snapshot.workspaces[0], name: "Changed" }],
    });
    assert.notEqual(snapshotDigest(changed), digest);
    assert.throws(() =>
      fromHubSnapshot(
        HubWorkspaceSnapshotSchema.parse({
          ...snapshot,
          tasks: [
            {
              id: uuid(),
              workspaceId: "00000000-0000-4000-8000-000000009999",
            },
          ],
        }),
        ids.workspace,
      ),
    );
  });

  it("builds a per-human projection and removes revoked membership access", () => {
    const initial = bootstrapSnapshot();
    const privateSpace = uuid();
    const memberId = uuid();
    const membershipId = uuid();
    const spaceGrantId = uuid();
    const assigneeId = uuid();
    const assigneeMembershipId = uuid();
    const assigneeSpaceGrantId = uuid();
    const sharedCaptureId = uuid();
    const privateCaptureId = uuid();
    const sharedTaskId = uuid();
    const assignmentId = uuid();
    const memberAttentionId = uuid();
    const otherAttentionId = uuid();
    const attentionReceiptId = uuid();
    const resolvedCommentId = uuid();
    const sharedDocumentId = uuid();
    const privateDocumentId = uuid();
    const sharedSourceId = uuid();
    const privateSourceId = uuid();
    const sharedNamedVersionId = uuid();
    const privateNamedVersionId = uuid();
    const snapshot = HubWorkspaceSnapshotSchema.parse({
      ...initial,
      workspaces: [{ ...initial.workspaces[0], policyVersion: 2, version: 2 }],
      spaces: [
        ...initial.spaces,
        {
          id: privateSpace,
          workspaceId: ids.workspace,
          name: "Private",
          version: 1,
          createdAt: "2026-07-14T12:00:00.000Z",
        },
      ],
      memberships: [
        ...initial.memberships,
        {
          id: membershipId,
          workspaceId: ids.workspace,
          principalId: memberId,
          role: "guest",
          displayName: "Scoped guest",
          status: "active",
          version: 1,
          createdAt: "2026-07-14T12:00:00.000Z",
          updatedAt: "2026-07-14T12:00:00.000Z",
        },
        {
          id: assigneeMembershipId,
          workspaceId: ids.workspace,
          principalId: assigneeId,
          role: "member",
          displayName: "Visible assignee",
          status: "active",
          version: 1,
          createdAt: "2026-07-14T12:00:00.000Z",
          updatedAt: "2026-07-14T12:00:00.000Z",
        },
      ],
      spaceGrants: [
        {
          id: spaceGrantId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          principalId: memberId,
          access: "view",
          status: "active",
          version: 1,
          createdAt: "2026-07-14T12:00:00.000Z",
          updatedAt: "2026-07-14T12:00:00.000Z",
        },
        {
          id: assigneeSpaceGrantId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          principalId: assigneeId,
          access: "edit",
          status: "active",
          version: 1,
          createdAt: "2026-07-14T12:00:00.000Z",
          updatedAt: "2026-07-14T12:00:00.000Z",
        },
      ],
      captures: [
        {
          id: sharedCaptureId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          originalText: "Shared",
        },
        {
          id: privateCaptureId,
          workspaceId: ids.workspace,
          spaceId: privateSpace,
          originalText: "PRIVATE-SENTINEL",
        },
      ],
      tasks: [
        {
          id: sharedTaskId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
        },
      ],
      documents: [
        {
          id: sharedDocumentId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          title: "Shared evidence report",
        },
        {
          id: privateDocumentId,
          workspaceId: ids.workspace,
          spaceId: privateSpace,
          title: "PRIVATE-DOCUMENT-SENTINEL",
        },
      ],
      knowledgeSources: [
        {
          id: sharedSourceId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          title: "Shared source",
        },
        {
          id: privateSourceId,
          workspaceId: ids.workspace,
          spaceId: privateSpace,
          title: "PRIVATE-SOURCE-SENTINEL",
        },
      ],
      namedDocumentVersions: [
        {
          id: sharedNamedVersionId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          documentId: sharedDocumentId,
          name: "Shared delivered version",
        },
        {
          id: privateNamedVersionId,
          workspaceId: ids.workspace,
          spaceId: privateSpace,
          documentId: privateDocumentId,
          name: "PRIVATE-VERSION-SENTINEL",
        },
      ],
      taskAssignments: [
        {
          id: assignmentId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          taskId: sharedTaskId,
          assigneePrincipalId: assigneeId,
          state: "active",
        },
      ],
      comments: [
        {
          id: resolvedCommentId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          target: { kind: "task", taskId: sharedTaskId },
          rootCommentId: resolvedCommentId,
          body: "Resolved shared comment",
          mentionPrincipalIds: [],
          authorPrincipalId: assigneeId,
          threadState: "resolved",
          revisions: [],
          version: 2,
          createdAt: "2026-07-14T12:00:00.000Z",
          updatedAt: "2026-07-14T12:01:00.000Z",
          resolvedAt: "2026-07-14T12:01:00.000Z",
          resolvedBy: assigneeId,
        },
      ],
      attentionSignals: [
        {
          id: memberAttentionId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          targetPrincipalId: memberId,
          reason: "task_assignment",
          destination: { kind: "task", taskId: sharedTaskId },
          sourceRecordId: assignmentId,
          deduplicationKey: `task-assignment:${assignmentId}:${memberId}`,
          urgency: "in_app",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-14T12:00:00.000Z",
          updatedAt: "2026-07-14T12:00:00.000Z",
        },
        {
          id: otherAttentionId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          targetPrincipalId: assigneeId,
          reason: "task_assignment",
          destination: { kind: "task", taskId: sharedTaskId },
          sourceRecordId: assignmentId,
          deduplicationKey: `task-assignment:${assignmentId}:${assigneeId}`,
          urgency: "in_app",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-14T12:00:00.000Z",
          updatedAt: "2026-07-14T12:00:00.000Z",
        },
      ],
      auditReceipts: [
        ...initial.auditReceipts,
        {
          id: attentionReceiptId,
          workspaceId: ids.workspace,
          spaceId: ids.space,
          principalId: assigneeId,
          grantId: assigneeSpaceGrantId,
          origin: "desktop",
          commandId: uuid(),
          commandName: "task.assign",
          correlationId: uuid(),
          affectedRecordIds: [
            sharedTaskId,
            memberAttentionId,
            otherAttentionId,
          ],
          recordVersions: {
            [sharedTaskId]: 1,
            [memberAttentionId]: 1,
            [otherAttentionId]: 1,
          },
          changedFields: ["assigneePrincipalId"],
          occurredAt: "2026-07-14T12:00:00.000Z",
          outcome: "success",
        },
      ],
    });
    const memberContext = ExecutionContextSchema.parse({
      ...context(),
      principalId: memberId,
      credentialId: uuid(),
      grantId: uuid(),
      policyVersion: 1,
      spaceScope: [ids.space, privateSpace],
    });
    const scoped = scopeHubSnapshot(snapshot, ids.workspace, memberContext);
    assert.ok(scoped);
    assert.deepEqual(
      scoped.spaces.map((space) => space.id),
      [ids.space],
    );
    assert.deepEqual(
      scoped.captures.map((capture) => capture.id),
      [sharedCaptureId],
    );
    assert.deepEqual(
      scoped.memberships.map((member) => member.principalId),
      [ids.principal, memberId, assigneeId],
    );
    assert.deepEqual(
      scoped.spaceGrants.map((grant) => grant.principalId),
      [memberId, assigneeId],
    );
    assert.deepEqual(
      scoped.taskAssignments.map((assignment) => assignment.id),
      [assignmentId],
    );
    assert.deepEqual(
      scoped.documents.map((item) => item.id),
      [sharedDocumentId],
    );
    assert.deepEqual(
      scoped.knowledgeSources.map((item) => item.id),
      [sharedSourceId],
    );
    assert.deepEqual(
      scoped.namedDocumentVersions.map((item) => item.id),
      [sharedNamedVersionId],
    );
    assert.deepEqual(
      scoped.attentionSignals.map((signal) => signal.id),
      [memberAttentionId],
    );
    const attentionReceipt = scoped.auditReceipts.find(
      (receipt) => receipt.id === attentionReceiptId,
    );
    assert.ok(attentionReceipt);
    assert.equal(attentionReceipt.principalId, assigneeId);
    assert.deepEqual(attentionReceipt.affectedRecordIds, [
      sharedTaskId,
      memberAttentionId,
    ]);
    assert.deepEqual(attentionReceipt.recordVersions, {
      [sharedTaskId]: 1,
      [memberAttentionId]: 1,
    });
    assert.equal(scoped.idempotencyRecords.length, 0);
    const adminWithoutManagementCapability = scopeHubSnapshot(
      HubWorkspaceSnapshotSchema.parse({
        ...snapshot,
        memberships: snapshot.memberships.map((membership) =>
          membership.id === membershipId
            ? { ...membership, role: "admin" }
            : membership,
        ),
      }),
      ids.workspace,
      memberContext,
    );
    assert.ok(adminWithoutManagementCapability);
    assert.deepEqual(
      adminWithoutManagementCapability.memberships.map(
        (member) => member.principalId,
      ),
      [ids.principal, memberId, assigneeId],
    );
    const formerAssignee = scopeHubSnapshot(
      HubWorkspaceSnapshotSchema.parse({
        ...snapshot,
        memberships: snapshot.memberships.map((candidate) =>
          candidate.id === assigneeMembershipId
            ? { ...candidate, status: "revoked", version: 2 }
            : candidate,
        ),
        spaceGrants: snapshot.spaceGrants.map((grant) =>
          grant.id === assigneeSpaceGrantId
            ? { ...grant, status: "revoked", version: 2 }
            : grant,
        ),
      }),
      ids.workspace,
      memberContext,
    );
    assert.ok(formerAssignee);
    assert.deepEqual(
      formerAssignee.memberships.map((candidate) => candidate.principalId),
      [ids.principal, memberId],
    );
    assert.deepEqual(formerAssignee.taskAssignments, [
      {
        ...snapshot.taskAssignments[0],
        assigneePrincipalId: "00000000-0000-4000-8000-000000000000",
        redactedAssigneeState: "former_member",
      },
    ]);
    assert.equal(
      formerAssignee.comments[0]?.authorPrincipalId,
      "00000000-0000-4000-8000-000000000000",
    );
    assert.equal(
      formerAssignee.comments[0]?.resolvedBy,
      "00000000-0000-4000-8000-000000000000",
    );
    const formerReceipt = formerAssignee.auditReceipts.find(
      (receipt) => receipt.id === attentionReceiptId,
    );
    assert.equal(
      formerReceipt?.principalId,
      "00000000-0000-4000-8000-000000000000",
    );
    assert.equal(
      formerReceipt?.grantId,
      "00000000-0000-4000-8000-000000000000",
    );
    const revoked = HubWorkspaceSnapshotSchema.parse({
      ...snapshot,
      workspaces: [{ ...snapshot.workspaces[0], policyVersion: 3, version: 3 }],
      memberships: snapshot.memberships.map((membership) =>
        membership.id === membershipId
          ? { ...membership, status: "revoked", version: 2 }
          : membership,
      ),
    });
    assert.equal(
      scopeHubSnapshot(revoked, ids.workspace, memberContext),
      undefined,
    );
  });
});
