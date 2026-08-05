import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AgentRunIdSchema,
  CommentIdSchema,
  ExecutionContextSchema,
  GrantIdSchema,
  MembershipIdSchema,
  PrincipalIdSchema,
  ProjectTemplateIdSchema,
  SpaceGrantIdSchema,
  SpaceIdSchema,
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
  secondSpace: "41000000-0000-4000-8000-000000000019",
  secondSpaceGrant: "41000000-0000-4000-8000-000000000020",
  unusedSpaceGrant: "41000000-0000-4000-8000-000000000021",
  ownerSecondSpaceGrant: "41000000-0000-4000-8000-000000000022",
  member: "41000000-0000-4000-8000-000000000023",
  memberCredential: "41000000-0000-4000-8000-000000000024",
  memberGrant: "41000000-0000-4000-8000-000000000025",
  memberMembership: "41000000-0000-4000-8000-000000000026",
  thirdSpace: "41000000-0000-4000-8000-000000000027",
  ownerThirdSpaceGrant: "41000000-0000-4000-8000-000000000028",
  thirdTask: "41000000-0000-4000-8000-000000000029",
  plainMember: "41000000-0000-4000-8000-000000000030",
  plainMemberCredential: "41000000-0000-4000-8000-000000000031",
  plainMemberGrant: "41000000-0000-4000-8000-000000000032",
  plainMemberMembership: "41000000-0000-4000-8000-000000000033",
  plainMemberSpaceGrant: "41000000-0000-4000-8000-000000000034",
  configTaskStatus: "41000000-0000-4000-8000-000000000035",
  configTemplate: "41000000-0000-4000-8000-000000000036",
  configAutomationRule: "41000000-0000-4000-8000-000000000037",
  sweepAdmin: "41000000-0000-4000-8000-000000000038",
  sweepAdminCredential: "41000000-0000-4000-8000-000000000039",
  sweepAdminGrant: "41000000-0000-4000-8000-000000000040",
  sweepAdminMembership: "41000000-0000-4000-8000-000000000041",
  sweepAdminSpaceGrant: "41000000-0000-4000-8000-000000000042",
  agentViewSpaceGrant: "41000000-0000-4000-8000-000000000043",
  comment: "41000000-0000-4000-8000-000000000044",
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
    // A re-scope can only reach a Space the delegating human can already edit,
    // so the cases below need a second and third Space and the owner's grant
    // on each. No command mints a Space, so all records are seeded directly.
    harness.store.transact((transaction) => {
      transaction.insertSpace({
        id: SpaceIdSchema.parse(ids.secondSpace),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        name: "Second space",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      transaction.insertSpaceGrant({
        id: SpaceGrantIdSchema.parse(ids.ownerSecondSpaceGrant),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        spaceId: SpaceIdSchema.parse(ids.secondSpace),
        principalId: PrincipalIdSchema.parse(ids.owner),
        access: "edit",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      transaction.insertSpace({
        id: SpaceIdSchema.parse(ids.thirdSpace),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        name: "Third space",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      transaction.insertSpaceGrant({
        id: SpaceGrantIdSchema.parse(ids.ownerThirdSpaceGrant),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        spaceId: SpaceIdSchema.parse(ids.thirdSpace),
        principalId: PrincipalIdSchema.parse(ids.owner),
        access: "edit",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    });
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
      // Space access is only effective inside the context's own scope, so the
      // owner has to be carrying the second and third Space to delegate them.
      spaceScope: [ids.space, ids.secondSpace, ids.thirdSpace],
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

  /**
   * Stating `spaces` widens what the command changes, so it widens what the
   * caller must agree with. Only the *active* Space grants: a revoked one is
   * absent from the projection the caller read, so it cannot state a version
   * for the record a re-add reactivates.
   */
  const scopeVersions = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): Readonly<Record<string, number>> => ({
    ...currentVersions(harness),
    ...Object.fromEntries(
      harness.store
        .read((view) =>
          view.listSpaceGrants(
            WorkspaceIdSchema.parse(ids.workspace),
            PrincipalIdSchema.parse(ids.agent),
          ),
        )
        .filter((grant) => grant.status === "active")
        .map((grant) => [grant.id, grant.version]),
    ),
  });

  /**
   * A workspace admin: it may manage agent access, so the only thing it lacks
   * is reach into the second Space — which is what the refusal has to be about.
   */
  const memberWithoutSpaceAccess = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): ExecutionContext => {
    harness.store.transact((transaction) =>
      transaction.insertMembership({
        id: MembershipIdSchema.parse(ids.memberMembership),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        principalId: PrincipalIdSchema.parse(ids.member),
        displayName: "Admin without reach",
        role: "admin",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const member = ExecutionContextSchema.parse({
      principalId: ids.member,
      principalKind: "human",
      credentialId: ids.memberCredential,
      grantId: ids.memberGrant,
      policyVersion: currentPolicyVersion(harness),
      workspaceId: ids.workspace,
      // The second Space is in scope and still unreachable: the missing piece
      // is the Space grant, not the context, so the guard under test is the
      // access level and nothing else.
      spaceScope: [ids.space, ids.secondSpace],
      capabilityScope: [
        "workspace.access",
        "agent.manageAccess",
        "agent.access",
      ],
      origin: "desktop",
    });
    harness.authorization.register(member);
    return member;
  };

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
   * `workspace.setWorkingDay` used to share `workspace.rename`'s arm in
   * `isCurrentlyAuthorized`, which is `administrative` and carried by no
   * agent grant — so no preset, however wide, could ever reach it, and the
   * MCP operations catalog never listed it either, since a capability with
   * no entry in any `capabilityScope` never passes the catalog's filter.
   * `workspace.setDefaultTaskStatus` and `workspace.setCommercialDefaults`
   * are the other workspace-level settings and are both `operate`; a working
   * day belongs beside them, not beside a rename.
   */
  const workspaceVersion = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): number =>
    harness.store.read((view) =>
      view.getWorkspace(WorkspaceIdSchema.parse(ids.workspace)),
    )?.version ?? 0;

  const workingDayCommand = (idempotencyKey: string, workspaceVer: number) => ({
    ...metadata(idempotencyKey, { [ids.workspace]: workspaceVer }),
    commandName: "workspace.setWorkingDay" as const,
    payload: {
      workingDay: {
        startMinute: 8 * 60,
        endMinute: 16 * 60,
        weekdays: [1, 2, 3, 4, 5],
      },
    },
  });

  it("lets an operate-preset agent grant set the working day in a Space it holds", () => {
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    const agent = contextFromStoredGrant(harness);
    const changed = commandOutcome(
      harness.kernel.execute(
        agent,
        workingDayCommand("operate-set-working-day", workspaceVersion(harness)),
      ),
    );
    assert.equal(changed.outcome, "success");
    assert.equal(changed.diagnosticCode, "workspace.working_day_changed");
  });

  it("refuses workspace.setWorkingDay as a denial, not a precondition, for a grant that never carried the capability", () => {
    const { harness } = grantWithScope(
      capabilitiesForAgentGrantPreset("operate").filter(
        (capability) => capability !== "workspace.setWorkingDay",
      ),
    );
    const agent = contextFromStoredGrant(harness);
    const denied = commandOutcome(
      harness.kernel.execute(
        agent,
        workingDayCommand(
          "operate-set-working-day-denied",
          workspaceVersion(harness),
        ),
      ),
    );
    assert.equal(denied.outcome, "rejected");
    assert.equal(denied.diagnosticCode, "authorization.denied");
  });

  it("keeps workspace.rename and workspace.setVoiceAudioRetention refused for an operate-preset agent", () => {
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    const agent = contextFromStoredGrant(harness);
    const renameDenied = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("operate-rename-denied", {
          [ids.workspace]: workspaceVersion(harness),
        }),
        commandName: "workspace.rename",
        payload: { name: "Should not happen" },
      }),
    );
    assert.equal(renameDenied.outcome, "rejected");
    assert.equal(renameDenied.diagnosticCode, "authorization.denied");

    const retentionDenied = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("operate-voice-retention-denied", {
          [ids.workspace]: workspaceVersion(harness),
        }),
        commandName: "workspace.setVoiceAudioRetention",
        payload: { retentionPolicy: "retain" },
      }),
    );
    assert.equal(retentionDenied.outcome, "rejected");
    assert.equal(retentionDenied.diagnosticCode, "authorization.denied");
  });

  const agentSpaceGrants = (
    harness: ReturnType<typeof createReferenceHarness>,
  ) =>
    harness.store.read((view) =>
      view.listSpaceGrants(
        WorkspaceIdSchema.parse(ids.workspace),
        PrincipalIdSchema.parse(ids.agent),
      ),
    );

  it("adds a Space, removes a Space, and re-adds a removed one without duplicating the grant", () => {
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    const added = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("rescope-add-space", scopeVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
          spaces: [
            {
              spaceGrantId: ids.agentSpaceGrant,
              spaceId: ids.space,
              access: "edit",
            },
            {
              spaceGrantId: ids.secondSpaceGrant,
              spaceId: ids.secondSpace,
              access: "edit",
            },
          ],
        },
      }),
    );
    assert.equal(added.outcome, "success");

    const removed = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("rescope-remove-space", scopeVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
          spaces: [
            {
              spaceGrantId: ids.agentSpaceGrant,
              spaceId: ids.space,
              access: "edit",
            },
          ],
        },
      }),
    );
    assert.equal(removed.outcome, "success");
    // The removal has to be observed here, not inferred from the re-add: a
    // handler that dropped the revocation path entirely still answers success
    // to all three calls and still ends with one record per Space.
    assert.deepEqual(
      agentSpaceGrants(harness).map((grant) => [grant.spaceId, grant.status]),
      [
        [ids.space, "active"],
        [ids.secondSpace, "revoked"],
      ],
    );
    if (removed.diagnosticCode !== "agent.grant_scope_changed")
      throw new Error(
        `Expected a re-scope outcome: ${JSON.stringify(removed)}`,
      );
    // The revoked grant is part of what this command reports it touched, at the
    // version it now holds — the desktop re-reads from this, not from the store.
    assert.deepEqual(
      removed.affected.find(
        (record) => record.recordId === ids.secondSpaceGrant,
      ),
      { recordId: ids.secondSpaceGrant, recordKind: "spaceGrant", version: 2 },
    );

    // The re-add supplies a *fresh* id on purpose: the removed Space fell out of
    // the projection, so the desktop cannot know the old spaceGrantId. The
    // kernel must reactivate the existing record and ignore this id: both
    // stores hold one grant per (Space, principal), so taking the insert path
    // here aborts the command with a store error rather than duplicating it.
    const readded = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("rescope-readd-space", scopeVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
          spaces: [
            {
              spaceGrantId: ids.agentSpaceGrant,
              spaceId: ids.space,
              access: "edit",
            },
            {
              spaceGrantId: ids.unusedSpaceGrant,
              spaceId: ids.secondSpace,
              access: "edit",
            },
          ],
        },
      }),
    );
    assert.equal(readded.outcome, "success");
    const grants = agentSpaceGrants(harness);
    assert.equal(
      grants.filter((grant) => grant.spaceId === ids.secondSpace).length,
      1,
      "a re-added Space must reuse its record, not create a second one",
    );
    assert.equal(
      grants.find((grant) => grant.spaceId === ids.secondSpace)?.status,
      "active",
    );
  });

  it("refuses a re-scope naming a Space the delegating human cannot edit", () => {
    // Mirrors the guard grantCreate applies: delegation can never hand out reach
    // the delegator does not have.
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    const refused = commandOutcome(
      harness.kernel.execute(memberWithoutSpaceAccess(harness), {
        ...metadata("rescope-unreachable-space", scopeVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
          spaces: [
            {
              spaceGrantId: ids.secondSpaceGrant,
              spaceId: ids.secondSpace,
              access: "edit",
            },
          ],
        },
      }),
    );
    assert.equal(refused.outcome, "rejected");
    // The caller could manage agent access, so the refusal is about the Space
    // and not about its grant — and the Space the payload dropped is still
    // reachable, because a refused command changes nothing.
    assert.equal(refused.diagnosticCode, "command.precondition_failed");
    assert.deepEqual(
      agentSpaceGrants(harness).map((grant) => [grant.spaceId, grant.status]),
      [[ids.space, "active"]],
    );
  });

  it("refuses a re-scope that names one Space twice", () => {
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    const refused = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("rescope-duplicate-space", scopeVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
          spaces: [
            {
              spaceGrantId: ids.agentSpaceGrant,
              spaceId: ids.space,
              access: "edit",
            },
            {
              spaceGrantId: ids.secondSpaceGrant,
              spaceId: ids.space,
              access: "view",
            },
          ],
        },
      }),
    );
    assert.equal(refused.outcome, "rejected");
    assert.equal(refused.diagnosticCode, "command.precondition_failed");
  });

  it("refuses a re-scope naming one Space grant id for two Spaces", () => {
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    const refused = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("rescope-duplicate-grant-id", scopeVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
          spaces: [
            {
              spaceGrantId: ids.agentSpaceGrant,
              spaceId: ids.space,
              access: "edit",
            },
            {
              spaceGrantId: ids.unusedSpaceGrant,
              spaceId: ids.secondSpace,
              access: "edit",
            },
            {
              spaceGrantId: ids.unusedSpaceGrant,
              spaceId: ids.thirdSpace,
              access: "edit",
            },
          ],
        },
      }),
    );
    assert.equal(refused.outcome, "rejected");
    assert.equal(refused.diagnosticCode, "command.precondition_failed");
  });

  it("refuses to mint a grant naming one Space grant id for two Spaces", () => {
    const { harness } = bootstrap();
    // grantWithScope mints ids.agentGrant itself; this case needs a fresh
    // grant, so the second Space is seeded directly, same as grantWithScope
    // does for the re-scope cases above.
    harness.store.transact((transaction) => {
      transaction.insertSpace({
        id: SpaceIdSchema.parse(ids.secondSpace),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        name: "Second space",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      transaction.insertSpaceGrant({
        id: SpaceGrantIdSchema.parse(ids.ownerSecondSpaceGrant),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        spaceId: SpaceIdSchema.parse(ids.secondSpace),
        principalId: PrincipalIdSchema.parse(ids.owner),
        access: "edit",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    const refused = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        ...metadata("grant-duplicate-grant-id", { [ids.workspace]: 1 }),
        commandName: "agent.grantCreate",
        payload: {
          grantId: ids.agentGrant,
          membershipId: ids.agentMembership,
          agentPrincipalId: ids.agent,
          displayName: "Would-be duplicate",
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
          spaces: [
            {
              spaceGrantId: ids.agentSpaceGrant,
              spaceId: ids.space,
              access: "edit",
            },
            {
              spaceGrantId: ids.agentSpaceGrant,
              spaceId: ids.secondSpace,
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

  it("demands the version of every active Space grant when spaces are stated", () => {
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    const stale = commandOutcome(
      harness.kernel.execute(ownerNow(harness), {
        // currentVersions omits the space grants: the exact-key rule must reject.
        ...metadata("rescope-missing-versions", currentVersions(harness)),
        commandName: "agent.grantSetScope",
        payload: {
          grantId: ids.agentGrant,
          preset: "operate",
          capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
          spaces: [
            {
              spaceGrantId: ids.agentSpaceGrant,
              spaceId: ids.space,
              access: "edit",
            },
          ],
        },
      }),
    );
    assert.equal(stale.outcome, "conflict");
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
   * The inverse of the case above, and the one field finding #18 measured. A
   * caller lacking the capability used to be told `command.precondition_failed`
   * whenever the target also happened not to exist, because the branch
   * short-circuited on target resolution and the policy was never consulted —
   * and an unasked question was scored as a passed one. The consequence was not
   * merely a poor diagnostic: it made the pair of codes an existence oracle,
   * which is precisely what the merged refusal in ADR-067 exists to prevent.
   * A caller could learn whether a record existed by reading which refusal it
   * got, for records it had no capability to touch.
   *
   * So the verdict must not depend on the target at all. Both halves are
   * asserted: without the capability the answer is a denial whether or not the
   * record is there, and *with* the capability a missing record still answers a
   * precondition — the second is what proves the oracle was closed rather than
   * merely inverted.
   */
  it("denies a withheld capability whether or not the target exists", () => {
    const { agent, harness } = runningAgent();
    const stripped = withoutCapability(agent, "task.remove");
    for (const [key, taskId] of [
      ["denied-absent", ids.otherTask],
      ["denied-present", ids.task],
    ] as const) {
      if (taskId === ids.task)
        assert.equal(
          commandOutcome(
            harness.kernel.execute(agent, {
              ...metadata(`${key}-create`),
              commandName: "task.create",
              payload: { taskId, spaceId: ids.space, title: "Present" },
            }),
          ).outcome,
          "success",
        );
      const outcome = commandOutcome(
        harness.kernel.execute(stripped, {
          ...metadata(key, { [taskId]: 1 }),
          commandName: "task.remove",
          payload: { taskId },
        }),
      );
      assert.equal(outcome.outcome, "rejected");
      assert.equal(outcome.diagnosticCode, "authorization.denied", key);
    }

    // Holding the capability, a target that is not there is still a
    // precondition. The merge is intact; only the unasked question is gone.
    const held = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("held-absent", { [ids.thirdTask]: 1 }),
        commandName: "task.remove",
        payload: { taskId: ids.thirdTask },
      }),
    );
    assert.equal(held.outcome, "rejected");
    assert.equal(held.diagnosticCode, "command.precondition_failed");
  });

  /**
   * The same invariant on an arm that resolves its target *before* it reaches
   * the shared helper. The meeting commands refuse a non-meeting id on the spot,
   * and refusing without asking the policy is what makes a pair of codes an
   * oracle — so they have to ask anyway, with no Space, which is the
   * grant-level question the caller is entitled to have answered. Kept separate
   * from the task case above because the two reach the policy by different
   * routes, and only this one is skipped by the helper.
   */
  it("denies a withheld capability on a target-resolving arm too", () => {
    const { agent, harness } = runningAgent();
    const stripped = withoutCapability(agent, "meeting.editWorkItem");
    const denied = commandOutcome(
      harness.kernel.execute(stripped, {
        ...metadata("meeting-denied-absent"),
        commandName: "meeting.editWorkItem",
        payload: {
          meetingId: ids.otherTask,
          workItemId: ids.task,
          expectedWorkItemVersion: 1,
          title: "Edited",
          state: "open" as const,
        },
      }),
    );
    assert.equal(denied.outcome, "rejected");
    assert.equal(denied.diagnosticCode, "authorization.denied");

    // And holding it, the same absent target is a precondition — so the two
    // codes still say something about the grant, never about the record.
    const held = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("meeting-held-absent"),
        commandName: "meeting.editWorkItem",
        payload: {
          meetingId: ids.otherTask,
          workItemId: ids.task,
          expectedWorkItemVersion: 1,
          title: "Edited",
          state: "open" as const,
        },
      }),
    );
    assert.equal(held.outcome, "rejected");
    assert.equal(held.diagnosticCode, "command.precondition_failed");
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

  /**
   * A preview that answers `available: true` for a revert that then refuses is
   * the same success-shaped failure as the empty checkpoint above, one layer
   * in: the caller spends a checkpoint it cannot get back to learn what the
   * preview already had every fact to say. The single-command preview has
   * always evaluated the compensation itself; the checkpoint preview evaluated
   * only whether an earlier undo had consumed it, so a record moved on by work
   * outside the checkpoint stayed invisible until the revert.
   */
  it("previews a captured create as blocked once work outside the checkpoint moved the record", () => {
    const { agent, harness } = openCheckpoint();
    const inside = metadata("membership-blocked-create");
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
    // Outside the checkpoint, so its compensation is not part of this revert:
    // taking the create back would erase a change nothing in this slice can
    // restore.
    assert.equal(
      commandOutcome(
        harness.kernel.execute(agent, {
          ...metadata("membership-outside-update", { [ids.task]: 1 }),
          commandName: "task.updateDetails",
          payload: { taskId: ids.task, title: "Moved on afterwards" },
        }),
      ).outcome,
      "success",
    );
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.equal(preview.available, false);
    assert.equal(preview.unavailableReason, "later_change");
    // The revert names the commands that blocked it; the preview must name the
    // same ones, or the two surfaces tell different stories about one state.
    assert.deepEqual(preview.blocked, [
      { targetCommandId: inside.commandId, unavailableReason: "later_change" },
    ]);
  });

  /**
   * The other half of the same question. A checkpoint is a slice, and a slice
   * that creates a record and then corrects it is ordinary work — the
   * correction is captured too, so compensating the whole checkpoint newest
   * first leaves nothing behind. Before this, the create's compensation
   * required the record to still stand at the version the create produced, so
   * a slice containing its own correction could never be reverted at all, and
   * no order of calls repaired it: undoing the correction compensates forward
   * and moves the record further away.
   */
  it("reverts a captured create whose only later change is captured in the same checkpoint", () => {
    const { agent, harness } = openCheckpoint();
    const create = metadata("membership-create-then-correct");
    assert.equal(
      commandOutcome(
        harness.kernel.execute(agent, {
          ...create,
          checkpointId: ids.checkpoint,
          commandName: "task.create",
          payload: {
            taskId: ids.task,
            spaceId: ids.space,
            title: "Created in the slice",
          },
        }),
      ).outcome,
      "success",
    );
    const correction = metadata("membership-correction", { [ids.task]: 1 });
    assert.equal(
      commandOutcome(
        harness.kernel.execute(agent, {
          ...correction,
          checkpointId: ids.checkpoint,
          commandName: "task.updateDetails",
          payload: { taskId: ids.task, title: "Corrected in the same slice" },
        }),
      ).outcome,
      "success",
    );
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.equal(preview.available, true);
    assert.equal(preview.unavailableReason, undefined);
    assert.deepEqual(preview.blocked, []);
    const reverted = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("membership-revert"),
        commandName: "agent.checkpointRevert",
        payload: { checkpointId: ids.checkpoint, runId: ids.hostAgentRun },
      }),
    );
    assert.equal(reverted.outcome, "success", JSON.stringify(reverted));
    assert.equal(
      reverted.outcome === "success" && reverted.diagnosticCode,
      "agent.checkpoint_reverted",
    );
    // Both captured commands, taken back as one act.
    assert.deepEqual(
      reverted.outcome === "success" &&
        reverted.projection.kind === "agent.checkpoint_reverted" &&
        [...reverted.projection.compensatedCommandIds].sort(),
      [create.commandId, correction.commandId].sort(),
    );
    const gone = harness.kernel.query(agent, {
      contractVersion: 1,
      queryName: "task.list",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space, limit: 50 },
    });
    assert.equal(
      gone.kind === "query_result" &&
        gone.result.outcome === "success" &&
        gone.result.projection.kind === "task.list" &&
        gone.result.projection.items.some((item) => item.id === ids.task),
      false,
      "the created Task is gone, so the slice was taken back rather than reported as taken back",
    );
  });

  /**
   * The shape a real migration writes: records arrive with the relations that
   * point at them. Taking back the create of a record something else points at
   * would orphan that work — unless the thing pointing at it is another create
   * this same revert removes first, which only the revert can know.
   */
  it("reverts a captured create whose only dependent is another create in the same checkpoint", () => {
    const { agent, harness } = openCheckpoint();
    const organizationId = "41000000-0000-4000-8000-0000000000a1";
    const personId = "41000000-0000-4000-8000-0000000000a2";
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("membership-org-create"),
          checkpointId: ids.checkpoint,
          commandName: "relationship.organizationCreate",
          payload: {
            organizationId,
            spaceId: ids.space,
            name: "Migrated client",
            relationshipState: "active",
          },
        }),
      ),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("membership-person-create"),
          checkpointId: ids.checkpoint,
          commandName: "relationship.personCreate",
          payload: {
            personId,
            spaceId: ids.space,
            name: "Migrated contact",
            organizationId,
          },
        }),
      ),
      "success",
    );
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.deepEqual(preview.blocked, []);
    assert.equal(preview.available, true);
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("membership-graph-revert"),
          commandName: "agent.checkpointRevert",
          payload: { checkpointId: ids.checkpoint, runId: ids.hostAgentRun },
        }),
      ),
      "success",
    );
    const search = harness.kernel.query(agent, {
      contractVersion: 1,
      queryName: "search.global",
      queryId: requestId(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceIds: [ids.space], text: "Migrated" },
    });
    assert.deepEqual(
      search.kind === "query_result" &&
        search.result.outcome === "success" &&
        search.result.projection.kind === "search.global" &&
        search.result.projection.items.map((item) => item.recordId),
      [],
      "both records are gone: the slice was taken back whole, in dependency order",
    );
  });

  /**
   * The same shape one layer down, and the one the case above never reached: a
   * Project's dependents are counted as *relations*, which are neither strategic
   * records nor tasks. Every migration writes this — records arrive, then the
   * relations that bind them — and while `relation.remove` was missing from the
   * predicate that feeds the revert's `removed` set, a checkpoint holding a
   * create plus the relate pointing at it previewed `still_referenced` on its
   * whole foundation layer and the revert refused to run.
   */
  it("reverts a captured Project whose only dependent is a relation captured with it", () => {
    const { agent, harness } = openCheckpoint();
    const projectId = "41000000-0000-4000-8000-0000000000b1";
    const taskId = "41000000-0000-4000-8000-0000000000b2";
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("cascade-project-create"),
          checkpointId: ids.checkpoint,
          commandName: "project.create",
          payload: {
            projectId,
            spaceId: ids.space,
            title: "Migrated delivery",
          },
        }),
      ),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("cascade-task-create"),
          checkpointId: ids.checkpoint,
          commandName: "task.create",
          payload: {
            taskId,
            spaceId: ids.space,
            title: "Migrated unit of work",
          },
        }),
      ),
      "success",
    );
    // Version-checked on both endpoints, which is what makes the relate a
    // second command per task rather than a field on the create.
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("cascade-relate", { [taskId]: 1, [projectId]: 1 }),
          checkpointId: ids.checkpoint,
          commandName: "record.relate",
          payload: {
            relationType: "task_contributes_to_project",
            taskId,
            projectId,
          },
        }),
      ),
      "success",
    );
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.deepEqual(
      preview.blocked,
      [],
      "the relation is going in this same revert, so it is not something the Project is still referenced by",
    );
    assert.equal(preview.available, true);
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("cascade-revert"),
          commandName: "agent.checkpointRevert",
          payload: { checkpointId: ids.checkpoint, runId: ids.hostAgentRun },
        }),
      ),
      "success",
    );
    const snapshot = harness.store.snapshot();
    assert.equal(
      snapshot.projects.find((project) => project.id === projectId)
        ?.recordState,
      "removed",
    );
    assert.equal(
      snapshot.tasks.find((task) => task.id === taskId)?.recordState,
      "removed",
    );
    assert.deepEqual(
      (snapshot.relations ?? [])
        .filter((relation) => relation.state === "active")
        .map((relation) => relation.id),
      [],
      "the relation went first, which is the only order in which the Project could follow",
    );
  });

  /**
   * The second edge a migration writes, on its own axis: a work link is a
   * strategic record, but its create compensates through `work_link.restore_state`
   * rather than through the create-undo the predicate already knew, so an Area
   * with a Project linked to it was blocked for a different reason than the
   * Project above and had to be proved separately.
   */
  it("reverts a captured Area whose only dependent is a work link captured with it", () => {
    const { agent, harness } = openCheckpoint();
    const areaId = "41000000-0000-4000-8000-0000000000c1";
    const projectId = "41000000-0000-4000-8000-0000000000c2";
    const linkId = "41000000-0000-4000-8000-0000000000c3";
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("cascade-area-create"),
          checkpointId: ids.checkpoint,
          commandName: "area.create",
          payload: {
            areaId,
            spaceId: ids.space,
            title: "Migrated area",
          },
        }),
      ),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("cascade-linked-project"),
          checkpointId: ids.checkpoint,
          commandName: "project.create",
          payload: {
            projectId,
            spaceId: ids.space,
            title: "Migrated project under the area",
          },
        }),
      ),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("cascade-work-link"),
          checkpointId: ids.checkpoint,
          commandName: "work.linkCreate",
          payload: {
            linkId,
            spaceId: ids.space,
            linkType: "project_serves_area",
            sourceRecordId: projectId,
            targetRecordId: areaId,
          },
        }),
      ),
      "success",
    );
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.deepEqual(preview.blocked, []);
    assert.equal(preview.available, true);
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("cascade-area-revert"),
          commandName: "agent.checkpointRevert",
          payload: { checkpointId: ids.checkpoint, runId: ids.hostAgentRun },
        }),
      ),
      "success",
    );
    const snapshot = harness.store.snapshot();
    assert.equal(
      (snapshot.strategicRecords ?? []).find((record) => record.id === areaId)
        ?.recordState,
      "removed",
    );
    // A work link carries its own state rather than the base `recordState`,
    // which is exactly why its create compensates through a restore and had to
    // be admitted to the predicate on its own terms.
    const link = (snapshot.strategicRecords ?? []).find(
      (record) => record.id === linkId,
    );
    assert.equal(
      link?.kind === "work_link" ? link.state : undefined,
      "removed",
      "the work link went first — the Area could not have followed otherwise",
    );
    assert.equal(
      snapshot.projects.find((project) => project.id === projectId)
        ?.recordState,
      "removed",
    );
  });

  /**
   * The compensation the widened predicate made load-bearing. Taking back a
   * relate has to act on the relation as the revert has left it, not as the
   * relate found it — every other compensation reads the record's current
   * version, and this one alone declared the version its own command produced.
   * A relation an earlier compensation in the same revert had moved therefore
   * survived a revert that reported it compensated, and the checkpoint was spent.
   */
  it("takes back a relate whose relation an earlier compensation in the same revert moved", () => {
    const { agent, harness } = openCheckpoint();
    const projectId = "41000000-0000-4000-8000-0000000000e1";
    const taskId = "41000000-0000-4000-8000-0000000000e2";
    // Endpoints outside the checkpoint: this case is about the relation alone.
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("moved-relation-project"),
          commandName: "project.create",
          payload: {
            projectId,
            spaceId: ids.space,
            title: "Standing delivery",
          },
        }),
      ),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("moved-relation-task"),
          commandName: "task.create",
          payload: { taskId, spaceId: ids.space, title: "Standing work" },
        }),
      ),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("moved-relation-relate", {
            [taskId]: 1,
            [projectId]: 1,
          }),
          checkpointId: ids.checkpoint,
          commandName: "record.relate",
          payload: {
            relationType: "task_contributes_to_project",
            taskId,
            projectId,
          },
        }),
      ),
      "success",
    );
    const relationId = (harness.store.snapshot().relations ?? []).find(
      (relation) => relation.state === "active",
    )?.id;
    assert.ok(relationId !== undefined);
    // Captured too, so the revert restores it — and the relate's own
    // compensation then meets a relation two versions past where it left it.
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("moved-relation-unrelate", { [relationId]: 1 }),
          checkpointId: ids.checkpoint,
          commandName: "record.unrelate",
          payload: { relationId },
        }),
      ),
      "success",
    );
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.deepEqual(preview.blocked, []);
    assert.equal(preview.available, true);
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("moved-relation-revert"),
          commandName: "agent.checkpointRevert",
          payload: { checkpointId: ids.checkpoint, runId: ids.hostAgentRun },
        }),
      ),
      "success",
    );
    assert.equal(
      (harness.store.snapshot().relations ?? []).find(
        (relation) => relation.id === relationId,
      )?.state,
      "removed",
      "the revert reported this relation compensated, so it has to be gone",
    );
  });

  /**
   * The two above, in one checkpoint, which is where they used to compound: the
   * cascade lets the Project's create past the judged gate, and a relate whose
   * compensation had silently done nothing then left the Project still
   * referenced when the compensation actually ran — a preview promising a
   * revert that answers a storage fault, forever, on every retry. The whole
   * point of judging before spending is that the two passes agree.
   */
  it("reverts a Project whose relation was rebuilt inside the same checkpoint", () => {
    const { agent, harness } = openCheckpoint();
    const projectId = "41000000-0000-4000-8000-0000000000f1";
    const taskId = "41000000-0000-4000-8000-0000000000f2";
    const captured = (key: string, commandName: string, payload: unknown) =>
      outcome(
        harness.kernel.execute(agent, {
          ...metadata(key),
          checkpointId: ids.checkpoint,
          commandName,
          payload,
        } as never),
      );
    assert.equal(
      captured("rebuilt-project", "project.create", {
        projectId,
        spaceId: ids.space,
        title: "Delivery whose relation was redone",
      }),
      "success",
    );
    assert.equal(
      captured("rebuilt-task", "task.create", {
        taskId,
        spaceId: ids.space,
        title: "Work whose relation was redone",
      }),
      "success",
    );
    const relate = (key: string) =>
      assert.equal(
        outcome(
          harness.kernel.execute(agent, {
            ...metadata(key, { [taskId]: 1, [projectId]: 1 }),
            checkpointId: ids.checkpoint,
            commandName: "record.relate",
            payload: {
              relationType: "task_contributes_to_project",
              taskId,
              projectId,
            },
          }),
        ),
        "success",
      );
    relate("rebuilt-relate-first");
    const firstRelationId = (harness.store.snapshot().relations ?? []).find(
      (relation) => relation.state === "active",
    )?.id;
    assert.ok(firstRelationId !== undefined);
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("rebuilt-unrelate", { [firstRelationId]: 1 }),
          checkpointId: ids.checkpoint,
          commandName: "record.unrelate",
          payload: { relationId: firstRelationId },
        }),
      ),
      "success",
    );
    relate("rebuilt-relate-second");
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.deepEqual(preview.blocked, []);
    assert.equal(preview.available, true);
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("rebuilt-revert"),
          commandName: "agent.checkpointRevert",
          payload: { checkpointId: ids.checkpoint, runId: ids.hostAgentRun },
        }),
      ),
      "success",
      "the preview promised this would apply, so it has to — not a storage fault",
    );
    const snapshot = harness.store.snapshot();
    assert.equal(
      snapshot.projects.find((project) => project.id === projectId)
        ?.recordState,
      "removed",
    );
    assert.deepEqual(
      (snapshot.relations ?? [])
        .filter((relation) => relation.state === "active")
        .map((relation) => relation.id),
      [],
    );
  });

  /**
   * The guard the widened predicate must not cost. A relation the checkpoint
   * does *not* carry is work someone else attached, and taking the Project back
   * would orphan it — `still_referenced` is the right refusal and it has to
   * survive the two kinds this release admitted.
   */
  it("still refuses a captured Project that a relation outside the checkpoint points at", () => {
    const { agent, harness } = openCheckpoint();
    const projectId = "41000000-0000-4000-8000-0000000000d1";
    const taskId = "41000000-0000-4000-8000-0000000000d2";
    const projectCreate = {
      ...metadata("outside-project-create"),
      checkpointId: ids.checkpoint,
      commandName: "project.create" as const,
      payload: { projectId, spaceId: ids.space, title: "Captured delivery" },
    };
    assert.equal(
      outcome(harness.kernel.execute(agent, projectCreate)),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("outside-task-create"),
          commandName: "task.create",
          payload: { taskId, spaceId: ids.space, title: "Work left outside" },
        }),
      ),
      "success",
    );
    // No checkpointId: this relate stays outside, so the revert never takes it
    // back and the Project it points at must not go either.
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("outside-relate", { [taskId]: 1, [projectId]: 1 }),
          commandName: "record.relate",
          payload: {
            relationType: "task_contributes_to_project",
            taskId,
            projectId,
          },
        }),
      ),
      "success",
    );
    const preview = previewRevert(harness, agent, ids.checkpoint);
    assert.equal(preview.available, false);
    assert.equal(preview.unavailableReason, "still_referenced");
    assert.deepEqual(
      preview.blocked.map((item) => item.targetCommandId),
      [projectCreate.commandId],
    );
  });

  /**
   * The guard the allowance must not widen. A lone undo of a create whose
   * record moved on is exactly what `later_change` is for; only a revert knows
   * that the later change is one it is taking back in the same act.
   */
  it("still refuses a single undo of a create whose record moved on", () => {
    const { agent, harness } = openCheckpoint();
    const create = metadata("membership-lone-create");
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...create,
          checkpointId: ids.checkpoint,
          commandName: "task.create",
          payload: {
            taskId: ids.task,
            spaceId: ids.space,
            title: "Created in the slice",
          },
        }),
      ),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("membership-lone-correction", { [ids.task]: 1 }),
          checkpointId: ids.checkpoint,
          commandName: "task.updateDetails",
          payload: { taskId: ids.task, title: "Corrected in the same slice" },
        }),
      ),
      "success",
    );
    const undone = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("membership-lone-undo", { [ids.task]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: create.commandId },
      }),
    );
    assert.equal(undone.outcome, "conflict");
    assert.equal(
      undone.outcome === "conflict" && undone.diagnosticCode,
      "undo.not_available",
    );
  });

  /**
   * Workspace-level configuration — the working day, the default Task status,
   * the commercial defaults, the status and template vocabularies, the
   * automations — is `operate` in `CAPABILITY_DELEGATION` and published by the
   * MCP catalog, but every one of those arms asked
   * `canManageWorkspaceAccess` first, and an agent grant's own membership is
   * always minted with role `guest`. The catalog offered the operation and the
   * kernel answered `command.precondition_failed`, blaming the payload for a
   * door that was nailed shut.
   *
   * `canConfigureWorkspace` asks the role of a human and the grant of an
   * agent. Both halves have to be proven here: an agent that now gets through,
   * and a human `member` that still does not. The second is the load-bearing
   * one — it is the difference between this fix and simply deleting the role
   * check, which would have handed the working day to every editor.
   */
  const configurationCapabilities = () => [
    ...capabilitiesForAgentGrantPreset("operate"),
  ];

  /**
   * A human who is neither `owner` nor `admin`, carrying every configuration
   * capability there is and holding `edit` on the root Space. Both are
   * deliberate: whatever refuses this context cannot be the capability scope
   * and cannot be Space access, so only the membership role is left. A fixture
   * without the membership row would be refused by both branches of the
   * predicate and would prove nothing at all.
   */
  const plainMemberContext = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): ExecutionContext => {
    harness.store.transact((transaction) => {
      transaction.insertMembership({
        id: MembershipIdSchema.parse(ids.plainMemberMembership),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        principalId: PrincipalIdSchema.parse(ids.plainMember),
        displayName: "Ordinary member",
        role: "member",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      transaction.insertSpaceGrant({
        id: SpaceGrantIdSchema.parse(ids.plainMemberSpaceGrant),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        spaceId: SpaceIdSchema.parse(ids.space),
        principalId: PrincipalIdSchema.parse(ids.plainMember),
        access: "edit",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    const member = ExecutionContextSchema.parse({
      principalId: ids.plainMember,
      principalKind: "human",
      credentialId: ids.plainMemberCredential,
      grantId: ids.plainMemberGrant,
      policyVersion: currentPolicyVersion(harness),
      workspaceId: ids.workspace,
      spaceScope: [ids.space],
      capabilityScope: configurationCapabilities(),
      origin: "desktop",
    });
    harness.authorization.register(member);
    return member;
  };

  /** The workspace owner, carrying the configuration vocabulary as well. */
  const ownerWithConfiguration = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): ExecutionContext => {
    const owner = ExecutionContextSchema.parse({
      ...ownerContext(),
      policyVersion: currentPolicyVersion(harness),
      capabilityScope: [
        ...ownerContext().capabilityScope,
        ...configurationCapabilities(),
      ],
    });
    harness.authorization.register(owner);
    return owner;
  };

  const workspaceNow = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): number =>
    harness.store.read((view) =>
      view.getWorkspace(WorkspaceIdSchema.parse(ids.workspace)),
    )?.version ?? 0;

  /**
   * One representative per arm the predicate now governs: `template.create`
   * for the nine-command arm in `wave2.ts` (which additionally demands
   * `task.create`), `taskStatus.create` and the two `workspace.set*` rows for
   * the thirteen-command arm, and `workspace.setWorkingDay` for its own arm in
   * `kernel.ts`. A hand-written list of expectations would measure nothing, so
   * each entry is a real command the kernel executes end to end.
   *
   * Each envelope is built when it is sent, not when the list is made: two of
   * the four write the Workspace record, so an envelope stamped up front
   * carries a version its predecessor has already superseded and comes back
   * `record.version_conflict` — a failure that looks like a refusal and is not.
   */
  const configurationCommands = (
    harness: ReturnType<typeof createReferenceHarness>,
    keyPrefix: string,
    statusId: string,
  ) =>
    [
      {
        name: "template.create",
        build: () => ({
          ...metadata(`${keyPrefix}-template-create`),
          commandName: "template.create" as const,
          payload: {
            templateId: ids.configTemplate,
            name: "Configured by the caller under test",
            taskTitles: ["First"],
            fieldIds: [],
          },
        }),
      },
      {
        name: "taskStatus.create",
        build: () => ({
          ...metadata(`${keyPrefix}-status-create`),
          commandName: "taskStatus.create" as const,
          payload: {
            statusId,
            label: `Configured ${keyPrefix}`,
            operationalSemantics: "actionable" as const,
          },
        }),
      },
      {
        name: "workspace.setCommercialDefaults",
        build: () => ({
          ...metadata(`${keyPrefix}-commercial-defaults`, {
            [ids.workspace]: workspaceNow(harness),
          }),
          commandName: "workspace.setCommercialDefaults" as const,
          payload: { markupPct: 12 },
        }),
      },
      {
        name: "workspace.setWorkingDay",
        build: () =>
          workingDayCommand(`${keyPrefix}-working-day`, workspaceNow(harness)),
      },
    ] as const;

  it("lets an operate-preset agent grant configure the workspace it was granted", () => {
    const { harness } = grantWithScope(configurationCapabilities());
    const agent = contextFromStoredGrant(harness);
    for (const { name, build } of configurationCommands(
      harness,
      "agent-config",
      ids.configTaskStatus,
    )) {
      const result = commandOutcome(harness.kernel.execute(agent, build()));
      assert.equal(result.outcome, "success", `${name}: ${result.outcome}`);
    }
    // The default-status change is executed apart from the loop because it can
    // only name a status that already exists: it is the second half of
    // `taskStatus.create` above, not an independent fixture.
    const defaulted = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("agent-config-default-status", {
          [ids.workspace]: workspaceNow(harness),
        }),
        commandName: "workspace.setDefaultTaskStatus",
        payload: { statusId: ids.configTaskStatus },
      }),
    );
    assert.equal(defaulted.outcome, "success");
    assert.equal(
      harness.store.read((view) =>
        view.getWorkspace(WorkspaceIdSchema.parse(ids.workspace)),
      )?.defaultTaskStatusId,
      ids.configTaskStatus,
    );
  });

  /**
   * The owner as the desktop rebuilds it for a workspace holding more than one
   * Space: the configuration vocabulary plus every Space the owner really has
   * a grant in. `ownerWithConfiguration` carries the root Space alone, and
   * Space access is only effective inside the context's own scope, so the
   * narrower context could neither seed nor sweep the Spaces `grantWithScope`
   * adds — and a sweep that skipped them for the wrong reason would read as
   * the filter working.
   */
  const ownerAcrossSpaces = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): ExecutionContext => {
    const owner = ExecutionContextSchema.parse({
      ...ownerWithConfiguration(harness),
      spaceScope: [ids.space, ids.secondSpace, ids.thirdSpace],
    });
    harness.authorization.register(owner);
    return owner;
  };

  /**
   * Both preconditions the sweep needs before any assertion about it can fail:
   * an active `waiting_review_signals` rule, and at least one open Task whose
   * waiting review date has already passed.
   *
   * Neither is optional. A sweep with no active rule answers
   * `command.precondition_failed` whether the caller was authorized or not, so
   * a refusal assertion without the rule proves nothing; a sweep with nothing
   * due answers `success` with an empty `raisedTaskIds`, so a leak assertion
   * without elapsed tasks is indistinguishable from a filter that works.
   */
  const seedSweepFixture = (
    harness: ReturnType<typeof createReferenceHarness>,
    owner: ExecutionContext,
    tasks: readonly { readonly taskId: string; readonly spaceId: string }[],
  ): void => {
    assert.equal(
      outcome(
        harness.kernel.execute(owner, {
          ...metadata("sweep-rule"),
          commandName: "automation.create",
          payload: {
            ruleId: ids.configAutomationRule,
            name: "Waiting review signals",
            recipe: { kind: "waiting_review_signals" },
          },
        }),
      ),
      "success",
    );
    tasks.forEach(({ taskId, spaceId }, index) => {
      assert.equal(
        outcome(
          harness.kernel.execute(owner, {
            ...metadata(`sweep-task-${index}`),
            commandName: "task.create",
            payload: { taskId, spaceId, title: `Waiting review ${index}` },
          }),
        ),
        "success",
        `seeding the Task in ${spaceId}`,
      );
      assert.equal(
        outcome(
          harness.kernel.execute(owner, {
            ...metadata(`sweep-waiting-${index}`, { [taskId]: 1 }),
            commandName: "task.setOperationalState",
            payload: {
              taskId,
              operationalState: "waiting",
              waitingOn: {
                kind: "external",
                label: "Review date long past",
                direction: "waiting_on_them",
                expectedAt: "2020-01-01T00:00:00.000Z",
              },
            },
          }),
        ),
        "success",
        `making the Task in ${spaceId} due`,
      );
    });
    assert.equal(
      tasks.length > 0,
      true,
      "a sweep fixture with no due Task cannot fail",
    );
  };

  const sweep = (
    harness: ReturnType<typeof createReferenceHarness>,
    caller: ExecutionContext,
    key: string,
  ): {
    readonly raisedTaskIds: readonly string[];
    readonly already: number;
    readonly skipped: number;
  } => {
    const result = commandOutcome(
      harness.kernel.execute(caller, {
        ...metadata(key),
        commandName: "automation.sweep",
        payload: {},
      }),
    );
    if (
      result.outcome !== "success" ||
      result.projection.kind !== "automation.swept"
    )
      throw new Error(`Expected a sweep, received ${result.outcome}.`);
    return {
      raisedTaskIds: result.projection.raisedTaskIds,
      already: result.projection.alreadySignaledCount,
      skipped: result.projection.skippedSpaceCount,
    };
  };

  /**
   * The leak's first half. `raisedTaskIds` is the second, and both are read in
   * every case below: a filter applied to the projection alone would keep the
   * writes, and a filter applied to the writes alone would keep handing the
   * caller identifiers of Tasks it may not read.
   */
  const signalledSpaces = (
    harness: ReturnType<typeof createReferenceHarness>,
  ): readonly string[] =>
    [...(harness.store.snapshot().attentionSignals ?? [])]
      .filter((signal) => signal.reason === "waiting_review_elapsed")
      .map((signal) => signal.spaceId as string)
      .sort();

  it("lets an operate-preset agent grant sweep only the Spaces it may edit", () => {
    const { harness } = grantWithScope(configurationCapabilities());
    const owner = ownerAcrossSpaces(harness);
    seedSweepFixture(harness, owner, [
      { taskId: ids.task, spaceId: ids.space },
      { taskId: ids.otherTask, spaceId: ids.secondSpace },
      { taskId: ids.thirdTask, spaceId: ids.thirdSpace },
    ]);
    // Three Spaces because the filter has two halves to answer for. The agent's
    // grant carries `edit` on the first; the second is inside its context scope
    // and granted `view`, which is the case that separates `canEditSpace` from
    // `canViewSpace`; the third it was never given at all. A fixture with only
    // the third would be refused at the scope gate and would never reach the
    // access level.
    harness.store.transact((transaction) =>
      transaction.insertSpaceGrant({
        id: SpaceGrantIdSchema.parse(ids.agentViewSpaceGrant),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        spaceId: SpaceIdSchema.parse(ids.secondSpace),
        principalId: PrincipalIdSchema.parse(ids.agent),
        access: "view",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const agent = ExecutionContextSchema.parse({
      ...contextFromStoredGrant(harness),
      spaceScope: [ids.space, ids.secondSpace],
    });
    harness.authorization.register(agent);
    const swept = sweep(harness, agent, "agent-automation-sweep");
    assert.deepEqual(
      swept.raisedTaskIds,
      [ids.task],
      "the sweep reports back only the Space the grant may edit",
    );
    assert.deepEqual(
      signalledSpaces(harness),
      [ids.space],
      "and wrote in only that Space",
    );
    // What the narrowing owes the caller. Two of the workspace's three Spaces
    // went unvisited, and without this number the agent could not tell a sweep
    // that found nothing from a sweep that was not allowed to look. The count
    // is the whole answer on purpose: the ids would name Spaces this grant may
    // not know exist.
    assert.equal(
      swept.skipped,
      2,
      "the Space granted `view` and the Space outside the scope, both counted",
    );
    // The control that makes the assertions above capable of failing: the same
    // fixture, swept by a caller that CAN edit the other two Spaces, raises
    // exactly the two Tasks the agent left alone. Without it, a fixture whose
    // Tasks were never sweep-eligible would produce the same green.
    const byOwner = sweep(harness, owner, "owner-automation-sweep");
    assert.deepEqual(byOwner.raisedTaskIds, [ids.otherTask, ids.thirdTask]);
    assert.equal(
      byOwner.already,
      1,
      "the agent's own Space was already signalled, so the fixture is one sweep, not two",
    );
    assert.equal(
      byOwner.skipped,
      0,
      "and the same sweep by a caller who may edit everything skipped nothing — the count is about this caller, not about the workspace",
    );
  });

  it("still refuses automation.sweep to a human member who is neither owner nor admin", () => {
    const { harness } = grantWithScope(configurationCapabilities());
    const owner = ownerAcrossSpaces(harness);
    seedSweepFixture(harness, owner, [
      { taskId: ids.task, spaceId: ids.space },
    ]);
    // The member carries the whole operate vocabulary and holds `edit` on the
    // Space being swept, so neither the capability nor Space access can be the
    // thing refusing: only the role is left. This is the half that separates
    // `canConfigureWorkspace` from deleting the role check outright.
    const refused = commandOutcome(
      harness.kernel.execute(plainMemberContext(harness), {
        ...metadata("member-automation-sweep"),
        commandName: "automation.sweep",
        payload: {},
      }),
    );
    assert.equal(refused.outcome, "rejected");
    assert.equal(refused.diagnosticCode, "command.precondition_failed");
    assert.deepEqual(signalledSpaces(harness), []);
    assert.deepEqual(
      sweep(harness, owner, "owner-sweep-after-member").raisedTaskIds,
      [ids.task],
      "the refusal was the role, not an empty fixture",
    );
  });

  /**
   * What the Space filter costs a human, pinned rather than assumed.
   *
   * `effectiveSpaceAccess` hands out `edit` by role in exactly one case —
   * `owner` on the workspace's own root Space. `admin` has no role branch at
   * all, and neither role reaches a second Space without an active `edit`
   * Space grant. So the filter is NOT free for humans: before it,
   * `canManageWorkspaceAccess` let any `owner`/`admin` sweep every Space of the
   * workspace; after it, both sweep only where they hold `edit`.
   *
   * Two cases, in order of how reachable they are today. `workspace.memberAdd`
   * takes `role` and `access` as independent fields, so an `admin` whose Space
   * grant says `view` is constructible through the product as it ships — and
   * its sweep now succeeds while raising nothing, with no diagnostic saying so.
   * The owner half is latent: no command mints a second Space, so it needs a
   * restored snapshot to occur.
   */
  it("stops sweeping a Space whose caller holds no edit grant there, admin or owner", () => {
    const { harness } = grantWithScope(configurationCapabilities());
    const owner = ownerAcrossSpaces(harness);
    seedSweepFixture(harness, owner, [
      { taskId: ids.task, spaceId: ids.space },
      { taskId: ids.otherTask, spaceId: ids.secondSpace },
    ]);
    harness.store.transact((transaction) => {
      transaction.insertMembership({
        id: MembershipIdSchema.parse(ids.sweepAdminMembership),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        principalId: PrincipalIdSchema.parse(ids.sweepAdmin),
        displayName: "Admin who may only read the Space",
        role: "admin",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      transaction.insertSpaceGrant({
        id: SpaceGrantIdSchema.parse(ids.sweepAdminSpaceGrant),
        workspaceId: WorkspaceIdSchema.parse(ids.workspace),
        spaceId: SpaceIdSchema.parse(ids.space),
        principalId: PrincipalIdSchema.parse(ids.sweepAdmin),
        access: "view",
        status: "active",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    const admin = ExecutionContextSchema.parse({
      principalId: ids.sweepAdmin,
      principalKind: "human",
      credentialId: ids.sweepAdminCredential,
      grantId: ids.sweepAdminGrant,
      policyVersion: currentPolicyVersion(harness),
      workspaceId: ids.workspace,
      spaceScope: [ids.space],
      capabilityScope: configurationCapabilities(),
      origin: "desktop",
    });
    harness.authorization.register(admin);
    // The regression a maintainer has to decide about: this used to raise the
    // Task. It is still not a refusal — the command succeeds and reports an
    // empty sweep — but it no longer reads like a workspace with nothing due,
    // because it says how many Spaces it never opened. Every Space of the
    // workspace, here: the admin holds `view` on the root and no grant at all
    // on the other two, and `admin` has no role branch in
    // `effectiveSpaceAccess`. An empty sweep with skipped 0 would be the honest
    // report of a quiet workspace; this is the other thing.
    const byAdmin = sweep(harness, admin, "admin-automation-sweep");
    assert.deepEqual(byAdmin.raisedTaskIds, []);
    assert.equal(byAdmin.skipped, 3);
    assert.deepEqual(signalledSpaces(harness), []);

    // The owner half. Downgrading the owner's own grant on the second Space
    // leaves the role untouched, so whatever changes is the access level: the
    // root Space is still swept (the role grants `edit` there and nowhere
    // else), the second Space is not.
    harness.store.transact((transaction) => {
      const grant = transaction.getSpaceGrant(
        SpaceGrantIdSchema.parse(ids.ownerSecondSpaceGrant),
      );
      if (grant === undefined) throw new Error("Expected the owner's grant.");
      assert.equal(
        transaction.updateSpaceGrant(
          { ...grant, access: "view", version: grant.version + 1 },
          grant.version,
        ),
        true,
      );
    });
    const byOwner = sweep(harness, owner, "owner-sweep-without-edit");
    assert.deepEqual(
      byOwner.raisedTaskIds,
      [ids.task],
      "an owner is exempt on the root Space only",
    );
    assert.equal(
      byOwner.skipped,
      1,
      "the downgraded Space, and only it — the third is still granted `edit`",
    );
    assert.deepEqual(signalledSpaces(harness), [ids.space]);

    // The control for both halves: restoring `edit` raises the Task the two
    // sweeps above skipped, so neither empty result was an ineligible fixture.
    harness.store.transact((transaction) => {
      const grant = transaction.getSpaceGrant(
        SpaceGrantIdSchema.parse(ids.ownerSecondSpaceGrant),
      );
      if (grant === undefined) throw new Error("Expected the owner's grant.");
      assert.equal(
        transaction.updateSpaceGrant(
          { ...grant, access: "edit", version: grant.version + 1 },
          grant.version,
        ),
        true,
      );
    });
    assert.deepEqual(
      sweep(harness, owner, "owner-sweep-with-edit").raisedTaskIds,
      [ids.otherTask],
    );
  });

  it("still refuses a human member who is neither owner nor admin", () => {
    const { harness } = grantWithScope(configurationCapabilities());
    const member = plainMemberContext(harness);
    for (const { name, build } of configurationCommands(
      harness,
      "member-config",
      ids.configTaskStatus,
    )) {
      const result = commandOutcome(harness.kernel.execute(member, build()));
      assert.equal(result.outcome, "rejected", `${name}: ${result.outcome}`);
      // Not `authorization.denied`: this caller's grant does carry the
      // capability, so the refusal is deliberately indistinguishable from
      // every other non-grant reason the pass can refuse (`kernel.ts`,
      // `RecordedAuthorization`). What matters is that it is a refusal.
      assert.equal(
        result.diagnosticCode,
        "command.precondition_failed",
        `${name}: ${result.diagnosticCode}`,
      );
    }
    const defaulted = commandOutcome(
      harness.kernel.execute(member, {
        ...metadata("member-config-default-status", {
          [ids.workspace]: workspaceNow(harness),
        }),
        commandName: "workspace.setDefaultTaskStatus",
        payload: { statusId: ids.configTaskStatus },
      }),
    );
    assert.equal(defaulted.outcome, "rejected");
    // Nothing was written on the way to the refusal.
    assert.equal(
      harness.store.read((view) =>
        view.getProjectTemplate(
          ProjectTemplateIdSchema.parse(ids.configTemplate),
        ),
      ),
      undefined,
    );
  });

  it("keeps the workspace owner able to configure the workspace", () => {
    const { harness } = grantWithScope(configurationCapabilities());
    const owner = ownerWithConfiguration(harness);
    for (const { name, build } of configurationCommands(
      harness,
      "owner-config",
      ids.configTaskStatus,
    )) {
      const result = commandOutcome(harness.kernel.execute(owner, build()));
      assert.equal(result.outcome, "success", `${name}: ${result.outcome}`);
    }
    const defaulted = commandOutcome(
      harness.kernel.execute(owner, {
        ...metadata("owner-config-default-status", {
          [ids.workspace]: workspaceNow(harness),
        }),
        commandName: "workspace.setDefaultTaskStatus",
        payload: { statusId: ids.configTaskStatus },
      }),
    );
    assert.equal(defaulted.outcome, "success");
  });

  it("refuses an agent grant that never carried the configuration capability as a denial", () => {
    // One capability removed at a time, because the arms differ: a grant that
    // lost everything would be refused by the first check in every arm and
    // would not prove which one answered.
    for (const missing of [
      "template.create",
      "taskStatus.create",
      "workspace.setCommercialDefaults",
      "workspace.setDefaultTaskStatus",
    ] as const) {
      const { harness } = grantWithScope(
        configurationCapabilities().filter(
          (capability) => capability !== missing,
        ),
      );
      const agent = contextFromStoredGrant(harness);
      const envelope =
        missing === "template.create"
          ? {
              ...metadata(`denied-${missing}`),
              commandName: "template.create" as const,
              payload: {
                templateId: ids.configTemplate,
                name: "Should not happen",
                taskTitles: [],
                fieldIds: [],
              },
            }
          : missing === "taskStatus.create"
            ? {
                ...metadata(`denied-${missing}`),
                commandName: "taskStatus.create" as const,
                payload: {
                  statusId: ids.configTaskStatus,
                  label: "Should not happen",
                  operationalSemantics: "actionable" as const,
                },
              }
            : missing === "workspace.setCommercialDefaults"
              ? {
                  ...metadata(`denied-${missing}`, {
                    [ids.workspace]: workspaceNow(harness),
                  }),
                  commandName: "workspace.setCommercialDefaults" as const,
                  payload: { markupPct: 3 },
                }
              : {
                  ...metadata(`denied-${missing}`, {
                    [ids.workspace]: workspaceNow(harness),
                  }),
                  commandName: "workspace.setDefaultTaskStatus" as const,
                  payload: { statusId: ids.configTaskStatus },
                };
      const denied = commandOutcome(harness.kernel.execute(agent, envelope));
      assert.equal(denied.outcome, "rejected", missing);
      // The whole point of the split diagnostic: a missing capability is a
      // statement about the grant, and must not read as a bad payload.
      assert.equal(denied.diagnosticCode, "authorization.denied", missing);
    }
  });

  /**
   * A resolved comment thread, ready to be reopened, written by the agent
   * itself so no second principal is needed. Returned by id rather than
   * asserted about, because what every case below reads is the reopen.
   */
  const resolvedComment = (
    harness: ReturnType<typeof createReferenceHarness>,
    agent: ExecutionContext,
  ): void => {
    const created = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("reopen-task"),
        commandName: "task.create",
        payload: {
          taskId: ids.task,
          spaceId: ids.space,
          title: "Something worth arguing about",
        },
      }),
    );
    assert.equal(created.outcome, "success");
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("reopen-comment", { [ids.task]: 1 }),
          commandName: "comment.add",
          payload: {
            commentId: ids.comment,
            target: { kind: "task", taskId: ids.task },
            body: "Is this still right?",
          },
        }),
      ),
      "success",
    );
    assert.equal(
      outcome(
        harness.kernel.execute(agent, {
          ...metadata("reopen-resolve", { [ids.comment]: 1 }),
          commandName: "comment.resolve",
          payload: { commentId: ids.comment },
        }),
      ),
      "success",
    );
  };

  it("refuses to reopen a comment thread to a scope holding only comment.resolve", () => {
    const withoutReopen = capabilitiesForAgentGrantPreset("operate").filter(
      (capability) => capability !== "comment.reopen",
    );
    const { harness } = grantWithScope(withoutReopen);
    const agent = contextFromStoredGrant(harness);
    // Resolving is what the scope still carries, so the fixture reaches the
    // reopen through the real command rather than through a seeded row — and
    // the refusal below cannot be the thread being in the wrong state.
    resolvedComment(harness, agent);
    // The capability `comment.reopen` was dead vocabulary: classified
    // `operate`, carried by every preset from `operate` up, consulted by
    // nothing, because the requirements table said reopening authorizes
    // against `comment.resolve`. So a scope narrowed by hand to exclude it
    // reopened anyway, and a scope granted it alone achieved nothing.
    const denied = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("reopen-denied", { [ids.comment]: 2 }),
        commandName: "comment.reopen",
        payload: { commentId: ids.comment },
      }),
    );
    assert.equal(denied.outcome, "rejected");
    // A denial and not a precondition: the grant is what is missing, and an
    // agent comparing requiredCapability against its own scope has something
    // to act on. Reading the code alone would not separate the two.
    assert.equal(denied.diagnosticCode, "authorization.denied");
    assert.equal(
      harness.store.read((view) =>
        view.getComment(CommentIdSchema.parse(ids.comment)),
      )?.threadState,
      "resolved",
      "the refusal is a refusal — the thread is still resolved",
    );
  });

  it("lets a scope holding comment.reopen reopen the thread it resolved", () => {
    // The control that makes the case above capable of failing. Same fixture,
    // same commands, one capability added back: without it, a reopen refused
    // for any unrelated reason — a version, a target, a Space — would read as
    // the new requirement working.
    const { harness } = grantWithScope([
      ...capabilitiesForAgentGrantPreset("operate"),
    ]);
    const agent = contextFromStoredGrant(harness);
    resolvedComment(harness, agent);
    const reopened = commandOutcome(
      harness.kernel.execute(agent, {
        ...metadata("reopen-allowed", { [ids.comment]: 2 }),
        commandName: "comment.reopen",
        payload: { commentId: ids.comment },
      }),
    );
    assert.equal(reopened.outcome, "success");
    assert.equal(reopened.diagnosticCode, "comment.reopened");
    assert.equal(
      harness.store.read((view) =>
        view.getComment(CommentIdSchema.parse(ids.comment)),
      )?.threadState,
      "open",
    );
  });
});
