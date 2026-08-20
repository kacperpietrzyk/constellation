import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AgentRunIdSchema,
  capabilitiesForAgentGrantPreset,
  ExecutionContextSchema,
  PrincipalIdSchema,
  ProjectCheckInIdSchema,
  ProjectIdSchema,
  type CommandOutcome,
} from "@constellation/contracts";
import { isApplicationWave2Transaction } from "@constellation/application";

import { createReferenceHarness } from "../src/index.js";

const id = (suffix: string) =>
  `71000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const workspaceId = id("1");
const spaceId = id("2");
const principalId = id("3");
const projectId = ProjectIdSchema.parse(id("4"));
const checkInId = ProjectCheckInIdSchema.parse(id("5"));
const sourceId = id("8");
let sequence = 100;
const nextId = () => id(String(sequence++));
const context = ExecutionContextSchema.parse({
  principalId,
  principalKind: "human",
  credentialId: id("6"),
  grantId: id("7"),
  policyVersion: 1,
  workspaceId,
  spaceScope: [spaceId],
  capabilityScope: [
    "workspace.createLocal",
    "project.create",
    "project.remove",
    "project.checkInAdd",
    "project.checkInList",
    "knowledge.sourceCreate",
    "knowledge.sourceRemove",
    "activity.meaningful",
    "command.undo",
    "task.create",
    "task.remove",
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

const outcome = (value: unknown): CommandOutcome => {
  assert.equal((value as { kind?: string }).kind, "command_outcome");
  return (value as { outcome: CommandOutcome }).outcome;
};

describe("Project check-ins", () => {
  it("redacts a real agent author when its exact grant is revoked but membership and Space access remain active", () => {
    const harness = createReferenceHarness();
    const agentPrincipalId = PrincipalIdSchema.parse(id("501"));
    const agentGrantId = id("502");
    const agentMembershipId = id("503");
    const agentSpaceGrantId = id("504");
    const agentCredentialId = id("505");
    const agentRunId = AgentRunIdSchema.parse(id("506"));
    const owner = ExecutionContextSchema.parse({
      ...context,
      capabilityScope: [
        ...context.capabilityScope,
        "agent.manageAccess",
        "workspace.manageAccess",
      ],
    });
    harness.authorization.register(owner);
    const runAs = (
      executionContext: typeof owner,
      command: Parameters<typeof harness.kernel.execute>[1],
    ) => outcome(harness.kernel.execute(executionContext, command));
    assert.equal(
      runAs(owner, {
        ...metadata("real-revoke-bootstrap", {}),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId,
          rootSpaceId: spaceId,
          ownerPrincipalId: principalId,
          name: "Real grant revocation",
          timezone: "Europe/Warsaw",
        },
      }).outcome,
      "success",
    );
    assert.equal(
      runAs(owner, {
        ...metadata("real-revoke-project", {}),
        commandName: "project.create",
        payload: { projectId, spaceId, title: "Exact grant provenance" },
      }).outcome,
      "success",
    );
    const agentCapabilities = [...capabilitiesForAgentGrantPreset("operate")];
    const workspaceBeforeGrant = harness.store.snapshot().workspaces[0]!;
    assert.equal(
      runAs(owner, {
        ...metadata("real-revoke-grant", {
          [workspaceId]: workspaceBeforeGrant.version,
        }),
        commandName: "agent.grantCreate",
        payload: {
          grantId: agentGrantId,
          membershipId: agentMembershipId,
          agentPrincipalId,
          displayName: "Hermes",
          preset: "operate",
          capabilityScope: agentCapabilities,
          spaces: [
            {
              spaceGrantId: agentSpaceGrantId,
              spaceId,
              access: "edit",
            },
          ],
          credentialId: agentCredentialId,
          credentialDigest: "a".repeat(64),
        },
      }).outcome,
      "success",
    );
    const workspaceAfterGrant = harness.store.snapshot().workspaces[0]!;
    const agent = ExecutionContextSchema.parse({
      principalId: agentPrincipalId,
      principalKind: "agent",
      credentialId: agentCredentialId,
      grantId: agentGrantId,
      policyVersion: workspaceAfterGrant.policyVersion,
      workspaceId,
      spaceScope: [spaceId],
      capabilityScope: agentCapabilities,
      origin: "mcp",
      hostRun: {
        runId: "real-revoked-host-run",
        agentRunId,
        hostName: "Hermes Agent",
      },
    });
    harness.authorization.register(agent);
    const agentCheckInId = ProjectCheckInIdSchema.parse(id("507"));
    assert.equal(
      runAs(agent, {
        ...metadata("real-revoke-check-in", { [projectId]: 1 }),
        commandName: "project.checkInAdd",
        payload: {
          checkInId: agentCheckInId,
          projectId,
          summary: "Written by a real agent grant.",
          evidenceSourceIds: [],
          references: [],
        },
      }).outcome,
      "success",
    );
    const stored = harness.store.snapshot().projectCheckIns?.[0] as unknown as
      Record<string, unknown> | undefined;
    assert.equal(stored?.authorPrincipalKind, "agent");
    assert.equal(stored?.authorGrantId, agentGrantId);

    const list = (queryContext: typeof owner) => {
      const response = harness.kernel.query(queryContext, {
        contractVersion: 1,
        queryName: "project.checkInList",
        queryId: nextId(),
        workspaceId,
        consistency: "local_authoritative",
        parameters: { projectId },
      });
      if (
        response.kind !== "query_result" ||
        response.result.outcome !== "success" ||
        response.result.projection.kind !== "project.checkInList"
      )
        assert.fail("Expected real grant list.");
      return response.result.projection.items[0]!;
    };
    const ownerAfterGrant = ExecutionContextSchema.parse({
      ...owner,
      policyVersion: workspaceAfterGrant.policyVersion,
    });
    harness.authorization.register(ownerAfterGrant);
    assert.equal(list(ownerAfterGrant).actor?.kind, "agent");

    const snapshot = harness.store.snapshot();
    const grant = snapshot.agentGrants?.find(
      (candidate) => candidate.id === agentGrantId,
    );
    assert.ok(grant);
    harness.store.transact((transaction) => {
      transaction.updateAgentGrant(
        {
          ...grant,
          status: "revoked",
          revokedAt: "2026-08-20T12:00:00.000Z",
          version: grant.version + 1,
        },
        grant.version,
      );
    });
    const afterRevokeSnapshot = harness.store.snapshot();
    assert.equal(
      afterRevokeSnapshot.agentGrants?.find(
        (candidate) => candidate.id === agentGrantId,
      )?.status,
      "revoked",
    );
    assert.equal(
      afterRevokeSnapshot.memberships.find(
        (candidate) => candidate.id === agentMembershipId,
      )?.status,
      "active",
    );
    assert.equal(
      afterRevokeSnapshot.spaceGrants?.find(
        (candidate) => candidate.id === agentSpaceGrantId,
      )?.status,
      "active",
    );
    const redacted = list(ownerAfterGrant);
    assert.equal(redacted.authorPrincipalId, undefined);
    assert.equal(redacted.actor, undefined);
    assert.equal(redacted.agentRunId, undefined);
    assert.equal(redacted.hostRunId, undefined);
  });

  it("fails closed for an old row without safe principal-kind and grant provenance", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context);
    const run = (command: Parameters<typeof harness.kernel.execute>[1]) =>
      outcome(harness.kernel.execute(context, command));
    assert.equal(
      run({
        ...metadata("privacy-bootstrap", {}),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId,
          rootSpaceId: spaceId,
          ownerPrincipalId: principalId,
          name: "Privacy workspace",
          timezone: "Europe/Warsaw",
        },
      }).outcome,
      "success",
    );
    assert.equal(
      run({
        ...metadata("privacy-project", {}),
        commandName: "project.create",
        payload: { projectId, spaceId, title: "Private attribution" },
      }).outcome,
      "success",
    );
    const privateCheckInId = ProjectCheckInIdSchema.parse(id("401"));
    assert.equal(
      run({
        ...metadata("privacy-check-in", { [projectId]: 1 }),
        commandName: "project.checkInAdd",
        payload: {
          checkInId: privateCheckInId,
          projectId,
          summary: "Actor later lost access.",
          evidenceSourceIds: [],
          references: [],
        },
      }).outcome,
      "success",
    );
    harness.store.transact((transaction) => {
      assert.equal(isApplicationWave2Transaction(transaction), true);
      if (!isApplicationWave2Transaction(transaction)) return;
      const stored = transaction.getProjectCheckIn(privateCheckInId)!;
      const {
        authorPrincipalKind: _authorPrincipalKind,
        authorGrantId: _authorGrantId,
        ...legacy
      } = stored;
      void _authorPrincipalKind;
      void _authorGrantId;
      transaction.updateProjectCheckIn(
        {
          ...legacy,
          agentRunId: AgentRunIdSchema.parse(id("403")),
          hostRunId: "revoked-host-run",
        },
        stored.version,
      );
    });
    const listed = harness.kernel.query(context, {
      contractVersion: 1,
      queryName: "project.checkInList",
      queryId: nextId(),
      workspaceId,
      consistency: "local_authoritative",
      parameters: { projectId },
    });
    if (
      listed.kind !== "query_result" ||
      listed.result.outcome !== "success" ||
      listed.result.projection.kind !== "project.checkInList"
    )
      assert.fail("Expected privacy list.");
    const item = listed.result.projection.items[0]!;
    assert.equal(item.authorPrincipalId, undefined);
    assert.equal(item.actor, undefined);
    assert.equal(item.agentRunId, undefined);
    assert.equal(item.hostRunId, undefined);
  });

  it("blocks removal of a typed reference instead of leaking an orphaned id or count", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context);
    const run = (command: Parameters<typeof harness.kernel.execute>[1]) =>
      outcome(harness.kernel.execute(context, command));
    assert.equal(
      run({
        ...metadata("reference-bootstrap", {}),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId,
          rootSpaceId: spaceId,
          ownerPrincipalId: principalId,
          name: "Reference guard workspace",
          timezone: "Europe/Warsaw",
        },
      }).outcome,
      "success",
    );
    assert.equal(
      run({
        ...metadata("reference-project", {}),
        commandName: "project.create",
        payload: { projectId, spaceId, title: "Guard references" },
      }).outcome,
      "success",
    );
    const taskId = id("301");
    assert.equal(
      run({
        ...metadata("reference-task", {}),
        commandName: "task.create",
        payload: { taskId, spaceId, title: "Referenced Task" },
      }).outcome,
      "success",
    );
    const referencingCheckInId = ProjectCheckInIdSchema.parse(id("302"));
    assert.equal(
      run({
        ...metadata("reference-check-in", {
          [projectId]: 1,
          [taskId]: 1,
        }),
        commandName: "project.checkInAdd",
        payload: {
          checkInId: referencingCheckInId,
          projectId,
          summary: "Task is evidence of current delivery state.",
          evidenceSourceIds: [],
          references: [{ kind: "task", recordId: taskId }],
        },
      }).outcome,
      "success",
    );
    const removed = run({
      ...metadata("remove-referenced-task", { [taskId]: 1 }),
      commandName: "task.remove",
      payload: { taskId },
    });
    assert.equal(removed.diagnosticCode, "record.still_referenced");
    if (removed.diagnosticCode === "record.still_referenced") {
      assert.equal(removed.blockedByCount, 1);
      assert.deepEqual(removed.blockedBy, [
        { recordId: referencingCheckInId, recordKind: "projectCheckIn" },
      ]);
    }
  });

  it("claims one predecessor for one successor and releases the claim when correction is undone", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context);
    const run = (command: Parameters<typeof harness.kernel.execute>[1]) =>
      outcome(harness.kernel.execute(context, command));
    assert.equal(
      run({
        ...metadata("supersession-bootstrap", {}),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId,
          rootSpaceId: spaceId,
          ownerPrincipalId: principalId,
          name: "Supersession workspace",
          timezone: "Europe/Warsaw",
        },
      }).outcome,
      "success",
    );
    assert.equal(
      run({
        ...metadata("supersession-project", {}),
        commandName: "project.create",
        payload: { projectId, spaceId, title: "Single correction" },
      }).outcome,
      "success",
    );
    const originalId = ProjectCheckInIdSchema.parse(id("201"));
    assert.equal(
      run({
        ...metadata("supersession-original", { [projectId]: 1 }),
        commandName: "project.checkInAdd",
        payload: {
          checkInId: originalId,
          projectId,
          summary: "Original status",
          evidenceSourceIds: [],
          references: [],
        },
      }).outcome,
      "success",
    );
    const correctionAId = ProjectCheckInIdSchema.parse(id("202"));
    const correctionA = {
      ...metadata("supersession-a", { [projectId]: 1, [originalId]: 1 }),
      commandName: "project.checkInAdd" as const,
      payload: {
        checkInId: correctionAId,
        projectId,
        summary: "Corrected status A",
        supersedesCheckInId: originalId,
        evidenceSourceIds: [],
        references: [],
      },
    };
    assert.equal(run(correctionA).outcome, "success");
    const correctionBId = ProjectCheckInIdSchema.parse(id("203"));
    const fork = run({
      ...metadata("supersession-b", { [projectId]: 1, [originalId]: 1 }),
      commandName: "project.checkInAdd",
      payload: {
        checkInId: correctionBId,
        projectId,
        summary: "Corrected status B",
        supersedesCheckInId: originalId,
        evidenceSourceIds: [],
        references: [],
      },
    });
    assert.equal(fork.outcome, "conflict");
    assert.equal(harness.store.snapshot().projectCheckIns?.length, 2);

    const list = () => {
      const response = harness.kernel.query(context, {
        contractVersion: 1,
        queryName: "project.checkInList",
        queryId: nextId(),
        workspaceId,
        consistency: "local_authoritative",
        parameters: { projectId },
      });
      if (
        response.kind !== "query_result" ||
        response.result.outcome !== "success" ||
        response.result.projection.kind !== "project.checkInList"
      )
        assert.fail("Expected supersession list.");
      return response.result.projection;
    };
    assert.equal(list().latestCheckInId, correctionAId);
    assert.equal(
      list().items.find((item) => item.id === originalId)
        ?.supersededByCheckInId,
      correctionAId,
    );
    assert.equal(
      run({
        ...metadata("undo-supersession-a", {
          [correctionAId]: 1,
          [originalId]: 2,
        }),
        commandName: "command.undo",
        payload: { targetCommandId: correctionA.commandId },
      }).outcome,
      "success",
    );
    const restored = list();
    assert.equal(restored.latestCheckInId, originalId);
    assert.equal(
      restored.items.find((item) => item.id === originalId)
        ?.supersededByCheckInId,
      undefined,
    );
    assert.equal(
      restored.items.find((item) => item.id === correctionAId)?.state,
      "voided",
    );
  });

  it("adds and lists immutable check-ins without changing the Project and blocks orphaning removal", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context);
    assert.equal(
      outcome(
        harness.kernel.execute(context, {
          ...metadata("bootstrap", {}),
          commandName: "workspace.createLocal",
          payload: {
            workspaceId,
            rootSpaceId: spaceId,
            ownerPrincipalId: principalId,
            name: "Check-in workspace",
            timezone: "Europe/Warsaw",
          },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(context, {
          ...metadata("project", {}),
          commandName: "project.create",
          payload: {
            projectId,
            spaceId,
            title: "Ship check-ins",
            intendedOutcome: "Projects keep stable outcomes.",
          },
        }),
      ).outcome,
      "success",
    );
    const before = harness.store.snapshot().projects[0]!;
    assert.equal(
      outcome(
        harness.kernel.execute(context, {
          ...metadata("source", {}),
          commandName: "knowledge.sourceCreate",
          payload: {
            sourceId,
            spaceId,
            sourceKind: "url",
            title: "Check-in evidence",
            canonicalUrl: "https://example.test/check-in",
            excerpt: "Status evidence",
            availability: "available",
            observedAt: "2026-08-20T10:00:00.000Z",
          },
        }),
      ).outcome,
      "success",
    );
    const add = {
      ...metadata("check-in", { [projectId]: before.version, [sourceId]: 1 }),
      commandName: "project.checkInAdd" as const,
      payload: {
        checkInId,
        projectId,
        summary: "The storage path is integrated.",
        evidenceSourceIds: [sourceId],
        references: [],
      },
    };
    const added = outcome(harness.kernel.execute(context, add));
    assert.equal(added.outcome, "success");
    const replay = outcome(harness.kernel.execute(context, add));
    assert.deepEqual(replay, added);
    assert.deepEqual(harness.store.snapshot().projects[0], before);

    const listed = harness.kernel.query(context, {
      contractVersion: 1,
      queryName: "project.checkInList",
      queryId: nextId(),
      workspaceId,
      consistency: "local_authoritative",
      parameters: { projectId },
    });
    assert.equal(listed.kind, "query_result");
    if (
      listed.kind !== "query_result" ||
      listed.result.outcome !== "success" ||
      listed.result.projection.kind !== "project.checkInList"
    )
      assert.fail("Expected check-in list.");
    assert.equal(listed.result.projection.latestCheckInId, checkInId);
    assert.equal(
      listed.result.projection.items[0]?.summary,
      "The storage path is integrated.",
    );

    const activity = harness.kernel.query(context, {
      contractVersion: 1,
      queryName: "activity.meaningful",
      queryId: nextId(),
      workspaceId,
      consistency: "local_authoritative",
      parameters: { spaceId },
    });
    assert.equal(activity.kind, "query_result");
    if (
      activity.kind !== "query_result" ||
      activity.result.outcome !== "success" ||
      activity.result.projection.kind !== "activity.meaningful"
    )
      assert.fail("Expected meaningful Activity.");
    const checkInActivity = activity.result.projection.items.find(
      (item) => item.activityType === "project_check_in_added",
    );
    assert.equal(checkInActivity?.recordId, projectId);
    assert.equal(checkInActivity?.recordTitle, "Ship check-ins");
    assert.equal(checkInActivity?.commandName, "project.checkInAdd");

    const removal = outcome(
      harness.kernel.execute(context, {
        ...metadata("remove-project", { [projectId]: before.version }),
        commandName: "project.remove",
        payload: { projectId },
      }),
    );
    assert.equal(removal.outcome, "rejected");
    assert.equal(removal.diagnosticCode, "record.still_referenced");
    if (removal.diagnosticCode === "record.still_referenced") {
      assert.equal(removal.blockedBy[0]?.recordId, checkInId);
      assert.equal(removal.blockedBy[0]?.recordKind, "projectCheckIn");
    }

    const sourceRemoval = outcome(
      harness.kernel.execute(context, {
        ...metadata("remove-source", { [sourceId]: 1 }),
        commandName: "knowledge.sourceRemove",
        payload: { sourceId },
      }),
    );
    assert.equal(sourceRemoval.diagnosticCode, "record.still_referenced");
    if (sourceRemoval.diagnosticCode === "record.still_referenced")
      assert.equal(sourceRemoval.blockedBy[0]?.recordId, checkInId);

    const undone = outcome(
      harness.kernel.execute(context, {
        ...metadata("undo-check-in", { [checkInId]: 1 }),
        commandName: "command.undo",
        payload: { targetCommandId: add.commandId },
      }),
    );
    assert.equal(undone.outcome, "success");
    const afterUndo = harness.kernel.query(context, {
      contractVersion: 1,
      queryName: "project.checkInList",
      queryId: nextId(),
      workspaceId,
      consistency: "local_authoritative",
      parameters: { projectId },
    });
    if (
      afterUndo.kind !== "query_result" ||
      afterUndo.result.outcome !== "success" ||
      afterUndo.result.projection.kind !== "project.checkInList"
    )
      assert.fail("Expected check-in list after undo.");
    assert.equal(afterUndo.result.projection.latestCheckInId, undefined);
    assert.equal(afterUndo.result.projection.items[0]?.state, "voided");
  });
});
