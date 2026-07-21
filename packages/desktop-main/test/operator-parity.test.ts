import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAPABILITY_DELEGATION,
  CapabilitySchema,
  CommandEnvelopeSchema,
  capabilitiesForAgentGrantPreset,
  type Capability,
} from "@constellation/contracts";

import { LOCAL_ALPHA_CAPABILITIES } from "../src/durable-kernel-service.js";

/**
 * ADR-046 §6. R14.3 claims the desktop and an authorized agent are equal
 * operators, and that the only remaining differences are deliberate,
 * administrative exclusions. These tests make that claim checkable: adding a
 * capability to one side and not the other names the capability here instead
 * of quietly widening the gap the way the pre-ADR-046 lists did.
 */
describe("operator parity between the desktop session and a full-access grant", () => {
  const fullAccess = new Set<Capability>(
    capabilitiesForAgentGrantPreset("full_access"),
  );
  const desktop = new Set<Capability>(LOCAL_ALPHA_CAPABILITIES);

  it("withholds exactly the recorded administrative capabilities from an agent", () => {
    const desktopOnly = [...desktop].filter(
      (capability) => !fullAccess.has(capability),
    );
    assert.deepEqual(desktopOnly.sort(), [
      "agent.manageAccess",
      "workspace.createLocal",
      "workspace.exportScoped",
      "workspace.manageAccess",
      "workspace.rename",
    ]);
  });

  it("grants an agent only agent-lifecycle capabilities the desktop lacks", () => {
    const agentOnly = [...fullAccess].filter(
      (capability) => !desktop.has(capability),
    );
    assert.deepEqual(agentOnly.sort(), [
      "agent.checkpoint.create",
      "agent.handoff.submit",
    ]);
  });

  it("lets a full-access agent reach the work the R12 and R13 waves delivered", () => {
    for (const capability of [
      "task.create",
      "task.updateDetails",
      "task.remove",
      "task.setCalendarBlock",
      "meeting.promoteWorkItem",
      "project.applyTemplate",
      "fieldDef.create",
      "record.setFieldValue",
      "taskStatus.create",
      "automation.create",
      "recurrence.create",
      "savedView.update",
    ] as const)
      assert.ok(
        fullAccess.has(capability),
        `${capability} is unreachable to a full-access agent`,
      );
  });

  it("classifies every capability exactly once, with no unclassified survivors", () => {
    const classified = CapabilitySchema.options.filter(
      (capability) => CAPABILITY_DELEGATION[capability] !== undefined,
    );
    assert.equal(classified.length, CapabilitySchema.options.length);
  });

  it("keeps preset scopes nested", () => {
    const observe = capabilitiesForAgentGrantPreset("observe");
    const propose = new Set(capabilitiesForAgentGrantPreset("propose"));
    const operate = new Set(capabilitiesForAgentGrantPreset("operate"));
    for (const capability of observe) {
      assert.ok(propose.has(capability));
      assert.ok(operate.has(capability));
      assert.ok(fullAccess.has(capability));
    }
    for (const capability of propose) assert.ok(operate.has(capability));
    for (const capability of operate) assert.ok(fullAccess.has(capability));
  });

  it("accepts a full-access scope in the grant command it is minted with", () => {
    // The bound and the vocabulary have to agree: a fixed cap of 100 would
    // refuse the product's own preset on a strict parse and no test would
    // notice, because every fixture hand-picks a handful of capabilities
    // (ADR-046 §4, the PR #97 lesson).
    const command = CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "agent.grantCreate",
      commandId: "40000000-0000-4000-8000-000000000001",
      workspaceId: "40000000-0000-4000-8000-000000000002",
      idempotencyKey: "operator-parity-grant",
      expectedVersions: { "40000000-0000-4000-8000-000000000002": 1 },
      correlationId: "40000000-0000-4000-8000-000000000003",
      payload: {
        grantId: "40000000-0000-4000-8000-000000000004",
        membershipId: "40000000-0000-4000-8000-000000000005",
        agentPrincipalId: "40000000-0000-4000-8000-000000000006",
        displayName: "Full access operator",
        preset: "full_access",
        capabilityScope: [...fullAccess],
        spaces: [
          {
            spaceGrantId: "40000000-0000-4000-8000-000000000007",
            spaceId: "40000000-0000-4000-8000-000000000008",
            access: "edit",
          },
        ],
        credentialId: "40000000-0000-4000-8000-000000000009",
        credentialDigest: "a".repeat(64),
      },
    });
    assert.equal(command.commandName, "agent.grantCreate");
    if (command.commandName !== "agent.grantCreate") return;
    assert.equal(command.payload.capabilityScope.length, fullAccess.size);
  });

  it("keeps an observing agent read-only", () => {
    for (const capability of capabilitiesForAgentGrantPreset("observe"))
      assert.equal(CAPABILITY_DELEGATION[capability], "read");
  });
});
