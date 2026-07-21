import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ExecutionContextSchema,
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

const outcome = (response: {
  readonly kind: string;
}): CommandOutcome["outcome"] => {
  if (response.kind !== "command_outcome")
    throw new Error(`Expected a command outcome, received ${response.kind}.`);
  return (response as unknown as { readonly outcome: CommandOutcome }).outcome
    .outcome;
};

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
});
