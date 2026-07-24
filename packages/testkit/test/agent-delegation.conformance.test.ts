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
  otherTask: "41000000-0000-4000-8000-000000000018",
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
  preset: "observe" | "operate" | "full_access",
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

  it("refuses to mint a grant carrying a capability no grant may carry", () => {
    const { harness, owner } = bootstrap();
    // The partition was enforced on the remote transport only, so the local
    // kernel would mint a grant holding administrative authority. A capability
    // is delegable or not by its own classification; which transport asked is
    // not part of that.
    const refused = commandOutcome(
      harness.kernel.execute(owner, {
        ...metadata("delegation-non-delegable", { [ids.workspace]: 1 }),
        commandName: "agent.grantCreate",
        payload: {
          grantId: ids.agentGrant,
          membershipId: ids.agentMembership,
          agentPrincipalId: ids.agent,
          displayName: "Would-be administrator",
          preset: "custom",
          capabilityScope: ["task.create", "workspace.manageAccess"],
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
    );
    assert.equal(refused.outcome, "rejected");
    assert.equal(refused.diagnosticCode, "command.precondition_failed");
    assert.equal(
      harness.store.read((view) =>
        view.getAgentGrant(GrantIdSchema.parse(ids.agentGrant)),
      ),
      undefined,
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

  /**
   * The loop an external agent could not close on 0.1.2: a capability an
   * upgrade added to a preset never reached a grant already in the field,
   * because the grant authorizes against the scope frozen when it was issued
   * and nothing could change that scope afterwards.
   */
  const grantWithScope = (
    scope: readonly string[],
  ): {
    readonly harness: ReturnType<typeof createReferenceHarness>;
    readonly owner: ExecutionContext;
  } => {
    const { harness, owner } = bootstrap();
    assert.equal(
      outcome(
        harness.kernel.execute(owner, {
          ...metadata("rescope-grant", { [ids.workspace]: 1 }),
          commandName: "agent.grantCreate",
          payload: {
            grantId: ids.agentGrant,
            membershipId: ids.agentMembership,
            agentPrincipalId: ids.agent,
            displayName: "Operator issued before the upgrade",
            preset: "operate",
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
    return { harness, owner };
  };

  /**
   * Minting or re-scoping a grant raises the workspace policy version, and a
   * human context pinned to the old one stops being able to manage access —
   * so the owner is rebuilt at the current version before each act, exactly as
   * the desktop rebuilds it per call.
   */
  const ownerNow = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): ExecutionContext => {
    const owner = ExecutionContextSchema.parse({
      ...ownerContext(),
      policyVersion: currentPolicyVersion(harness),
    });
    harness.authorization.register(owner);
    return owner;
  };

  const currentVersions = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): Readonly<Record<string, number>> => ({
    [ids.workspace]:
      harness.store.read((view) =>
        view.getWorkspace(WorkspaceIdSchema.parse(ids.workspace)),
      )?.version ?? 0,
    [ids.agentGrant]:
      harness.store.read((view) =>
        view.getAgentGrant(GrantIdSchema.parse(ids.agentGrant)),
      )?.version ?? 0,
  });

  /** The context the runtime rebuilds from the stored grant on every call. */
  const contextFromStoredGrant = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): ExecutionContext => {
    const grant = harness.store.read((view) =>
      view.getAgentGrant(GrantIdSchema.parse(ids.agentGrant)),
    );
    if (grant === undefined) throw new Error("Expected a stored grant.");
    const agent = ExecutionContextSchema.parse({
      ...agentContext("operate", currentPolicyVersion(harness)),
      capabilityScope: [...grant.capabilityScope],
    });
    harness.authorization.register(agent);
    return agent;
  };

  it("lets a human widen and narrow an issued grant without reissuing it", () => {
    const withoutRemoval = capabilitiesForAgentGrantPreset("operate").filter(
      (capability) => capability !== "task.remove",
    );
    const { harness } = grantWithScope(withoutRemoval);
    const before = contextFromStoredGrant(harness);
    assert.equal(
      outcome(
        harness.kernel.execute(before, {
          ...metadata("rescope-task-create"),
          commandName: "task.create",
          payload: {
            taskId: ids.task,
            spaceId: ids.space,
            title: "Written before the re-scope",
          },
        }),
      ),
      "success",
    );
    const denied = commandOutcome(
      harness.kernel.execute(before, {
        ...metadata("rescope-remove-denied", { [ids.task]: 1 }),
        commandName: "task.remove",
        payload: { taskId: ids.task },
      }),
    );
    assert.equal(denied.diagnosticCode, "authorization.denied");

    const widened = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("rescope-widen", currentVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
        },
      }),
    );
    assert.equal(widened.outcome, "success");
    assert.equal(widened.diagnosticCode, "agent.grant_scope_changed");

    // The credential never changed: the same agent, still connected, may now
    // do what the upgrade added, from its next call onwards.
    assert.equal(
      outcome(
        harness.kernel.execute(contextFromStoredGrant(harness), {
          ...metadata("rescope-remove-allowed", { [ids.task]: 1 }),
          commandName: "task.remove",
          payload: { taskId: ids.task },
        }),
      ),
      "success",
    );

    // And it narrows: the lever is not a one-way widening.
    const narrowed = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("rescope-narrow", currentVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "observe",
          capabilityScope: [...capabilitiesForAgentGrantPreset("observe")],
        },
      }),
    );
    assert.equal(narrowed.outcome, "success");
    const afterNarrowing = commandOutcome(
      harness.kernel.execute(contextFromStoredGrant(harness), {
        ...metadata("rescope-create-denied"),
        commandName: "task.create",
        payload: {
          taskId: ids.otherTask,
          spaceId: ids.space,
          title: "Must not be written",
        },
      }),
    );
    assert.equal(afterNarrowing.diagnosticCode, "authorization.denied");
  });

  it("refuses to re-scope a grant into a capability no grant may carry", () => {
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    // ADR-046 keeps `runtime` and `administrative` capabilities out of every
    // agent grant. Re-scoping is the newest way to ask for one, so it is
    // refused at the kernel, not only on the remote transport.
    const refused = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("rescope-non-delegable", currentVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "custom",
          capabilityScope: ["task.create", "agent.manageAccess"],
        },
      }),
    );
    assert.equal(refused.outcome, "rejected");
    assert.equal(refused.diagnosticCode, "command.precondition_failed");
    assert.deepEqual(
      harness.store
        .read((view) => view.getAgentGrant(GrantIdSchema.parse(ids.agentGrant)))
        ?.capabilityScope.includes("agent.manageAccess"),
      false,
    );
  });

  it("keeps re-scoping out of an agent's own reach", () => {
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    // agent.manageAccess is administrative, so no grant carries it and no
    // agent can widen itself — the lever belongs to a human only.
    const denied = commandOutcome(
      harness.kernel.execute(contextFromStoredGrant(harness), {
        ...metadata("rescope-by-agent", currentVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "full_access",
          capabilityScope: [...capabilitiesForAgentGrantPreset("full_access")],
        },
      }),
    );
    assert.equal(denied.outcome, "rejected");
    assert.equal(denied.diagnosticCode, "authorization.denied");
  });

  /**
   * `authorization.denied` is a verdict about the grant, so it may not also
   * mean "that record is not there". An integrator probing a destructive
   * command on a made-up id was told its grant lacked the capability it
   * actually held, and the only way to tell the two apart was to create a real
   * record first — the very thing the probe existed to avoid.
   */
  it("answers a missing target with a precondition and keeps denial for the grant", () => {
    const { agent, harness } = runningAgent();
    const absent = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("remove-absent", { [ids.otherTask]: 1 }),
        commandName: "task.remove",
        payload: { taskId: ids.otherTask },
      }),
    );
    assert.equal(absent.outcome, "rejected");
    assert.equal(absent.diagnosticCode, "command.precondition_failed");

    assert.equal(
      commandOutcome(
        harness.kernel.execute(agent, {
          ...metadata("remove-target-create"),
          commandName: "task.create",
          payload: {
            taskId: ids.task,
            spaceId: ids.space,
            title: "Removable",
          },
        }),
      ).outcome,
      "success",
    );
    // Same command, same real target, capability withheld: this is the only
    // thing the code now reports, so reading it as a capability verdict is
    // finally correct.
    const denied = commandOutcome(
      harness.kernel.execute(withoutCapability(agent, "task.remove"), {
        ...metadata("remove-denied", { [ids.task]: 1 }),
        commandName: "task.remove",
        payload: { taskId: ids.task },
      }),
    );
    assert.equal(denied.outcome, "rejected");
    assert.equal(denied.diagnosticCode, "authorization.denied");

    const removed = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("remove-allowed", { [ids.task]: 1 }),
        commandName: "task.remove",
        payload: { taskId: ids.task },
      }),
    );
    assert.equal(removed.outcome, "success");
  });

  /**
   * Checkpoint membership is opt-in per command: the kernel attaches a command
   * to a checkpoint only when the envelope names it in `checkpointId`. Sharing
   * a run is not membership. An external agent read the published guidance as
   * "the checkpoint captures what follows it", wrote a slice without the field,
   * and was told the revert succeeded — so the boundary is pinned here.
   */
  const previewRevert = (
    harness: ReturnType<typeof createReferenceHarness>,
    agent: ExecutionContext,
    checkpointId: string,
  ) => {
    const result = harness.kernel.query(agent, {
      contractVersion: 1,
      queryName: "agent.checkpointPreviewRevert",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { checkpointId },
    });
    if (
      result.kind !== "query_result" ||
      result.result.outcome !== "success" ||
      result.result.projection.kind !== "agent.checkpoint_revert_preview"
    )
      throw new Error(`Expected a revert preview: ${JSON.stringify(result)}`);
    return result.result.projection;
  };

  const openCheckpoint = () => {
    const { agent, harness } = runningAgent();
    assert.equal(
      commandOutcome(
        harness.kernel.execute(agent, {
          ...metadata("membership-checkpoint"),
          commandName: "agent.checkpointCreate",
          payload: {
            checkpointId: ids.checkpoint,
            runId: ids.hostAgentRun,
            label: "Before the slice",
          },
        }),
      ).outcome,
      "success",
    );
    return { agent, harness };
  };

  it("previews a checkpoint that captured nothing as unavailable and empty", () => {
    const { agent, harness } = openCheckpoint();
    const preview = previewRevert(harness, agent, ids.checkpoint);
    // Reporting `available: true` here is the success-shaped failure: the
    // caller reads it as "this checkpoint will roll my slice back" when it
    // holds nothing to roll back.
    assert.equal(preview.available, false);
    assert.equal(preview.unavailableReason, "empty");
    assert.deepEqual(preview.commandIds, []);
    assert.deepEqual(preview.affectedRecordIds, []);
  });

  it("captures only the commands whose envelope names the checkpoint", () => {
    const { agent, harness } = openCheckpoint();
    const inside = metadata("membership-inside");
    assert.equal(
      commandOutcome(
        harness.kernel.execute(agent, {
          ...inside,
          checkpointId: ids.checkpoint,
          commandName: "task.create",
          payload: {
            taskId: ids.task,
            spaceId: ids.space,
            title: "Inside the checkpoint",
          },
        }),
      ).outcome,
      "success",
    );
    // Same agent, same run, applied after the checkpoint was opened, but the
    // envelope does not name it. It stays outside, and the preview must not
    // pretend otherwise.
    assert.equal(
      commandOutcome(
        harness.kernel.execute(agent, {
          ...metadata("membership-outside"),
          commandName: "task.create",
          payload: {
            taskId: ids.otherTask,
            spaceId: ids.space,
            title: "Outside the checkpoint",
          },
        }),
      ).outcome,
      "success",
    );
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.equal(preview.available, true);
    assert.equal(preview.unavailableReason, undefined);
    assert.deepEqual(preview.commandIds, [inside.commandId]);
    assert.deepEqual(preview.affectedRecordIds, [ids.task]);
  });
});
