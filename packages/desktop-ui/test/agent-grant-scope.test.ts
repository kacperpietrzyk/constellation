/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilitiesForAgentGrantPreset,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import { updateAgentGrantScope } from "../src/client/workflow.js";

const ids = {
  workspace: "90000000-0000-4000-8000-000000000001",
  grant: "90000000-0000-4000-8000-000000000002",
  agent: "90000000-0000-4000-8000-000000000003",
  membership: "90000000-0000-4000-8000-000000000004",
} as const;

const snapshot = (preset: string): never =>
  ({
    bootstrap: { workspace: { id: ids.workspace } },
    agentAccess: {
      kind: "ready",
      data: {
        kind: "agent.access",
        policyVersion: 7,
        workspaceVersion: 4,
        canManage: true,
        grants: [
          {
            grantId: ids.grant,
            agentPrincipalId: ids.agent,
            displayName: "Codex",
            preset,
            capabilityScope: ["task.create"],
            scopeStatus: "behind_preset",
            missingFromPreset: ["task.remove"],
            status: "active",
            credentialVersion: 1,
            version: 3,
            membershipId: ids.membership,
            membershipVersion: 1,
            spaces: [],
          },
        ],
      },
    },
  }) as never;

const grantOf = (preset: string): never =>
  (
    snapshot(preset) as unknown as {
      agentAccess: { data: { grants: never[] } };
    }
  ).agentAccess.data.grants[0] as never;

/**
 * The renderer builds this envelope itself, so a defect here is invisible to
 * the kernel conformance tests that prove the command works — it would show up
 * only as a rejected command in a person's hands.
 */
test("the desktop asks for exactly the preset's scope, against the versions it read", async () => {
  const sent: CommandEnvelope[] = [];
  const client = {
    executeCommand: async (command: CommandEnvelope) => {
      sent.push(command);
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: "2026-07-24T12:00:00.000Z",
          outcome: "success",
          diagnosticCode: "agent.grant_scope_changed",
          affected: [],
          auditReceiptId: "90000000-0000-4000-8000-000000000009",
          projection: {
            kind: "agent.grant_scope_changed",
            grantId: ids.grant,
            preset: "operate",
            capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
            version: 4,
            policyVersion: 8,
          },
        },
      };
    },
  } as unknown as ConstellationRendererClient;

  const result = await updateAgentGrantScope(
    client,
    snapshot("operate"),
    grantOf("operate"),
  );
  assert.equal(result.kind, "success");
  const command = sent[0];
  assert.equal(command?.commandName, "agent.grantSetScope");
  if (command?.commandName !== "agent.grantSetScope")
    throw new Error("Expected the scope command.");
  assert.deepEqual(command.payload, {
    grantId: ids.grant,
    preset: "operate",
    capabilityScope: [...capabilitiesForAgentGrantPreset("operate")],
  });
  // The kernel requires these two records exactly; naming a third, or the
  // wrong version, is a conflict the person would read as a bug.
  assert.deepEqual(command.expectedVersions, {
    [ids.workspace]: 4,
    [ids.grant]: 3,
  });
});

test("a hand-picked scope is refused before a command is sent", async () => {
  let called = false;
  const client = {
    executeCommand: async () => {
      called = true;
      throw new Error("must not be called");
    },
  } as unknown as ConstellationRendererClient;
  // "custom" has no preset to be dragged up to, so there is nothing to ask
  // for — and asking would silently replace a scope somebody chose by hand.
  const result = await updateAgentGrantScope(
    client,
    snapshot("custom"),
    grantOf("custom"),
  );
  assert.equal(result.kind, "unavailable");
  assert.equal(called, false);
});
