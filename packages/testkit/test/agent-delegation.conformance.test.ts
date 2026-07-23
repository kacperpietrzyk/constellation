import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AgentRunIdSchema,
  ExecutionContextSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  WorkspaceIdSchema,
  capabilitiesForAgentGrantPreset,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "41000000-0000-4000-8000-000000000001",
  space: "41000000-0000-4000-8000-000000000002",
  owner: "41000000-0000-4000-8000-000000000003",
  ownerCredential: "41000000-0000-4000-8000-000000000004",
  ownerGrant: "41000000-0000-4000-8000-000000000005",
  agent: "41000000-0000-4000-8000-000000000006",
  agentCredential: "41000000-0000-4000-8000-000000000007",
  agentGrant: "41000000-0000-4000-8000-000000000008",
  agentMembership: "41000000-0000-4000-8000-000000000009",
  agentSpaceGrant: "41000000-0000-4000-8000-000000000010",
  task: "41000000-0000-4000-8000-000000000011",
  hostAgentRun: "41000000-0000-4000-8000-000000000012",
  otherAgentRun: "41000000-0000-4000-8000-000000000013",
  checkpoint: "41000000-0000-4000-8000-000000000014",
  otherCheckpoint: "41000000-0000-4000-8000-000000000015",
  handoff: "41000000-0000-4000-8000-000000000016",
  otherHandoff: "41000000-0000-4000-8000-000000000017",
} as const;

let sequence = 30_000;
const requestId = (): string =>
  `41000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, "0")}`;

const metadata = (
  key: string,
  expectedVersions: Record<string, number> = {},
) => ({
  contractVersion: 1 as const,
  commandId: requestId(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions,
  correlationId: requestId(),
});

const ownerContext = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.owner,
    principalKind: "human",
    credentialId: ids.ownerCredential,
    grantId: ids.ownerGrant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.space],
    capabilityScope: [
      "workspace.createLocal",
      "workspace.manageAccess",
      "workspace.access",
      "agent.manageAccess",
      "agent.access",
    ],
    origin: "desktop",
  });

const agentContext = (
  preset: "observe" | "full_access",
  policyVersion: number,
): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.agent,
    principalKind: "agent",
    credentialId: ids.agentCredential,
    grantId: ids.agentGrant,
    policyVersion,
    workspaceId: ids.workspace,
    spaceScope: [ids.space],
    capabilityScope: [...capabilitiesForAgentGrantPreset(preset)],
    origin: "mcp",
  });

const currentPolicyVersion = (
  harness: ReturnType<typeof createReferenceHarness>,
): number =>
  // Minting a grant raises the workspace policy version, and every later call
  // is reauthorized against it. Reading it back keeps the test honest about
  // the boundary instead of hard-coding a number that drifts.
  harness.store.read((view) =>
    view.getWorkspace(WorkspaceIdSchema.parse(ids.workspace)),
  )?.policyVersion ?? 1;

const commandOutcome = (response: {
  readonly kind: string;
}): CommandOutcome => {
  if (response.kind !== "command_outcome")
    throw new Error(`Expected a command outcome, received ${response.kind}.`);
  return (response as unknown as { readonly outcome: CommandOutcome }).outcome;
};

const outcome = (response: {
  readonly kind: string;
}): CommandOutcome["outcome"] => commandOutcome(response).outcome;

/**
 * ADR-046. The delegation partition decides what a grant may carry; these
 * cases prove what the carried scope actually reaches through the kernel —
 * including that the two reads the partition newly delegates stay inside the
 * grant's own boundary.
 */
describe("agent grant delegation reaches the product without widening scope", () => {
  const bootstrap = () => {
    const harness = createReferenceHarness();
    const owner = ownerContext();
    harness.authorization.register(owner);
    assert.equal(
      outcome(
        harness.kernel.execute(owner, {
          ...metadata("delegation-bootstrap"),
          commandName: "workspace.createLocal",
          payload: {
            workspaceId: ids.workspace,
            rootSpaceId: ids.space,
            ownerPrincipalId: ids.owner,
            name: "Delegation workspace",
            timezone: "Europe/Warsaw",
          },
        }),
      ),
      "success",
    );
    return { harness, owner };
  };

  it("mints a full-access grant carrying the whole delegable vocabulary", () => {
    const { harness, owner } = bootstrap();
    const scope = [...capabilitiesForAgentGrantPreset("full_access")];
    // The bound, the schema, and the preset have to agree end to end: this is
    // the path a fixed .max(100) would have failed while every hand-picked
    // fixture kept passing.
    assert.ok(scope.length > 100);
    assert.equal(
      outcome(
        harness.kernel.execute(owner, {
          ...metadata("delegation-grant", { [ids.workspace]: 1 }),
          commandName: "agent.grantCreate",
          payload: {
            grantId: ids.agentGrant,
            membershipId: ids.agentMembership,
            agentPrincipalId: ids.agent,
            displayName: "Full access operator",
            preset: "full_access",
            capabilityScope: scope,
            spaces: [
              {
                spaceGrantId: ids.agentSpaceGrant,
                spaceId: ids.space,
                access: "edit",
              },
            ],
            credentialId: ids.agentCredential,
            credentialDigest: "b".repeat(64),
          },
        }),
      ),
      "success",
    );
  });

  it("lets a full-access agent create a Task", () => {
    const { harness, owner } = bootstrap();
    harness.kernel.execute(owner, {
      ...metadata("delegation-grant", { [ids.workspace]: 1 }),
      commandName: "agent.grantCreate",
      payload: {
        grantId: ids.agentGrant,
        membershipId: ids.agentMembership,
        agentPrincipalId: ids.agent,
        displayName: "Full access operator",
        preset: "full_access",
        capabilityScope: [...capabilitiesForAgentGrantPreset("full_access")],
        spaces: [
          {
            spaceGrantId: ids.agentSpaceGrant,
            spaceId: ids.space,
            access: "edit",
          },
        ],
        credentialId: ids.agentCredential,
        credentialDigest: "b".repeat(64),
      },
    });
    const agent = agentContext("full_access", currentPolicyVersion(harness));
    harness.authorization.register(agent);
    // The headline defect: before ADR-046 the preset the product calls Full
    // Access did not carry task.create at all.
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("delegation-task"),
          commandName: "task.create",
          payload: {
            taskId: ids.task,
            spaceId: ids.space,
            title: "Written by an authorized agent",
          },
        }),
      ),
      "success",
    );
  });

  it("shows an observing agent its own access row and no roster", () => {
    const { harness, owner } = bootstrap();
    harness.kernel.execute(owner, {
      ...metadata("delegation-grant", { [ids.workspace]: 1 }),
      commandName: "agent.grantCreate",
      payload: {
        grantId: ids.agentGrant,
        membershipId: ids.agentMembership,
        agentPrincipalId: ids.agent,
        displayName: "Observer",
        preset: "observe",
        capabilityScope: [...capabilitiesForAgentGrantPreset("observe")],
        spaces: [
          {
            spaceGrantId: ids.agentSpaceGrant,
            spaceId: ids.space,
            access: "view",
          },
        ],
        credentialId: ids.agentCredential,
        credentialDigest: "b".repeat(64),
      },
    });
    const agent = agentContext("observe", currentPolicyVersion(harness));
    harness.authorization.register(agent);
    const result = harness.kernel.query(agent, {
      contractVersion: 1,
      queryName: "workspace.access",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: {},
    });
    assert.equal(result.kind, "query_result");
    if (
      result.kind !== "query_result" ||
      result.result.outcome !== "success" ||
      result.result.projection.kind !== "workspace.access"
    )
      throw new Error(
        `Expected an access projection: ${JSON.stringify(result)}`,
      );
    // `workspace.access` is delegable because managing access is not: without
    // the administrative capability the projection is the caller's own row,
    // so an agent learns its own authority and never the workspace roster.
    assert.equal(result.result.projection.canManage, false);
    assert.deepEqual(
      result.result.projection.members.map((member) => member.principalId),
      [ids.agent],
    );
  });

  // Two runs the same grant owns: the ownership guard cannot tell them apart,
  // so only the host-run comparison keeps a checkpoint attached to the run
  // that is actually executing.
  const runningAgent = (): {
    readonly agent: ExecutionContext;
    readonly harness: ReturnType<typeof createReferenceHarness>;
  } => {
    const { harness, owner } = bootstrap();
    harness.kernel.execute(owner, {
      ...metadata("delegation-grant", { [ids.workspace]: 1 }),
      commandName: "agent.grantCreate",
      payload: {
        grantId: ids.agentGrant,
        membershipId: ids.agentMembership,
        agentPrincipalId: ids.agent,
        displayName: "Full access operator",
        preset: "full_access",
        capabilityScope: [...capabilitiesForAgentGrantPreset("full_access")],
        spaces: [
          {
            spaceGrantId: ids.agentSpaceGrant,
            spaceId: ids.space,
            access: "edit",
          },
        ],
        credentialId: ids.agentCredential,
        credentialDigest: "b".repeat(64),
      },
    });
    const agent = ExecutionContextSchema.parse({
      ...agentContext("full_access", currentPolicyVersion(harness)),
      hostRun: { runId: "host-run-1", agentRunId: ids.hostAgentRun },
    });
    harness.authorization.register(agent);
    harness.store.transact((transaction) => {
      for (const [index, runId] of [
        ids.hostAgentRun,
        ids.otherAgentRun,
      ].entries()) {
        transaction.insertAgentRun({
          id: AgentRunIdSchema.parse(runId),
          workspaceId: WorkspaceIdSchema.parse(ids.workspace),
          agentPrincipalId: PrincipalIdSchema.parse(ids.agent),
          grantId: GrantIdSchema.parse(ids.agentGrant),
          hostRunId: `host-run-${index + 1}`,
          hostName: "conformance-host",
          attributionTrust: "host_asserted",
          status: "active",
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      }
    });
    return { agent, harness };
  };

  const withoutCapability = (
    agent: ExecutionContext,
    capability: string,
  ): ExecutionContext =>
    ExecutionContextSchema.parse({
      ...agent,
      capabilityScope: agent.capabilityScope.filter(
        (entry) => entry !== capability,
      ),
    });

  it("reads a checkpoint run mismatch as a payload defect, not a denied grant", () => {
    const { agent, harness } = runningAgent();
    const mismatched = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("checkpoint-run-mismatch"),
        commandName: "agent.checkpointCreate",
        payload: {
          checkpointId: ids.otherCheckpoint,
          runId: ids.otherAgentRun,
          label: "Wrong run",
        },
      }),
    );
    // The grant authorized the operation; runId named a run this agent owns
    // but is not executing. Reporting that as authorization.denied sends an
    // integrator to the grant instead of to the field it must correct.
    assert.equal(mismatched.outcome, "rejected");
    assert.equal(mismatched.diagnosticCode, "command.precondition_failed");
    assert.equal(harness.store.snapshot().agentCheckpoints?.length ?? 0, 0);

    const created = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("checkpoint-run-match"),
        commandName: "agent.checkpointCreate",
        payload: {
          checkpointId: ids.checkpoint,
          runId: ids.hostAgentRun,
          label: "Before the risky slice",
        },
      }),
    );
    assert.equal(created.outcome, "success");
    assert.equal(created.diagnosticCode, "agent.checkpoint_created");

    const denied = commandOutcome(
      harness.kernel.execute(
        withoutCapability(agent, "agent.checkpoint.create"),
        {
          ...metadata("checkpoint-denied"),
          commandName: "agent.checkpointCreate",
          payload: {
            checkpointId: ids.otherCheckpoint,
            runId: ids.hostAgentRun,
            label: "Out of scope",
          },
        },
      ),
    );
    assert.equal(denied.outcome, "rejected");
    assert.equal(denied.diagnosticCode, "authorization.denied");
  });

  it("reads a handoff run mismatch as a payload defect, not a denied grant", () => {
    const { agent, harness } = runningAgent();
    const handoff = (handoffId: string, runId: string) => ({
      handoffId,
      runId,
      evidence: ["audit-receipt-1"],
      changes: ["Wrote one Task"],
      decisions: ["Kept the existing owner"],
      remainingWork: ["Review the Task"],
      nextAction: "Hand back to the operator",
    });
    const mismatched = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("handoff-run-mismatch"),
        commandName: "agent.handoffSubmit",
        payload: handoff(ids.otherHandoff, ids.otherAgentRun),
      }),
    );
    assert.equal(mismatched.outcome, "rejected");
    assert.equal(mismatched.diagnosticCode, "command.precondition_failed");

    const submitted = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("handoff-run-match"),
        commandName: "agent.handoffSubmit",
        payload: handoff(ids.handoff, ids.hostAgentRun),
      }),
    );
    assert.equal(submitted.outcome, "success");
    assert.equal(submitted.diagnosticCode, "agent.handoff_submitted");

    const denied = commandOutcome(
      harness.kernel.execute(withoutCapability(agent, "agent.handoff.submit"), {
        ...metadata("handoff-denied"),
        commandName: "agent.handoffSubmit",
        payload: handoff(ids.otherHandoff, ids.hostAgentRun),
      }),
    );
    assert.equal(denied.outcome, "rejected");
    assert.equal(denied.diagnosticCode, "authorization.denied");
  });
});
