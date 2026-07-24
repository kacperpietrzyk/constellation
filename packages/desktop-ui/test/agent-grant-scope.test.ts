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
  space: "90000000-0000-4000-8000-000000000005",
  spaceGrant: "90000000-0000-4000-8000-000000000006",
  otherSpace: "90000000-0000-4000-8000-000000000007",
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
            spaces: [
              {
                spaceGrantId: ids.spaceGrant,
                spaceId: ids.space,
                spaceName: "Ops",
                // Set to something a preset-derived value could never
                // produce by accident (the fixture's own preset is
                // "operate", which derives "edit") — so an assertion that
                // the sent access follows the *target* preset can only pass
                // by deriving it, not by echoing this fixture value back.
                access: "edit",
                version: 2,
              },
            ],
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

const recordingClient = (
  sent: CommandEnvelope[],
): ConstellationRendererClient =>
  ({
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
  }) as unknown as ConstellationRendererClient;

/**
 * The renderer builds this envelope itself, so a defect here is invisible to
 * the kernel conformance tests that prove the command works — it would show up
 * only as a rejected command in a person's hands.
 */
test("sends the chosen preset, its capabilities, and the target Spaces", async () => {
  const sent: CommandEnvelope[] = [];
  const client = recordingClient(sent);
  const result = await updateAgentGrantScope(
    client,
    snapshot("operate"),
    grantOf("operate"),
    { preset: "observe", spaceIds: [ids.space] },
  );
  assert.equal(result.kind, "success");
  const envelope = sent[0];
  assert.equal(envelope?.commandName, "agent.grantSetScope");
  if (envelope?.commandName !== "agent.grantSetScope")
    throw new Error("Expected the scope command.");
  assert.equal(envelope.payload.preset, "observe");
  assert.deepEqual(envelope.payload.capabilityScope, [
    ...capabilitiesForAgentGrantPreset("observe"),
  ]);
  // The level per Space follows the target preset, not the fixture's own.
  assert.deepEqual(envelope.payload.spaces, [
    { spaceGrantId: ids.spaceGrant, spaceId: ids.space, access: "view" },
  ]);
  // The kernel requires these two records exactly plus every active Space
  // grant, or the exact-key rule answers conflict.
  assert.deepEqual(envelope.expectedVersions, {
    [ids.workspace]: 4,
    [ids.grant]: 3,
    [ids.spaceGrant]: 2,
  });
});

test("mints an id for a Space the grant does not hold yet", async () => {
  const sent: CommandEnvelope[] = [];
  await updateAgentGrantScope(
    recordingClient(sent),
    snapshot("operate"),
    grantOf("operate"),
    { preset: "operate", spaceIds: [ids.space, ids.otherSpace] },
  );
  const envelope = sent[0];
  if (envelope?.commandName !== "agent.grantSetScope")
    throw new Error("Expected the scope command.");
  const spaces = envelope.payload.spaces;
  assert.ok(spaces, "expected a spaces list on the payload");
  const added = spaces.find((space) => space.spaceId === ids.otherSpace);
  assert.notEqual(added, undefined);
  assert.match(added?.spaceGrantId ?? "", /^[0-9a-f-]{36}$/);
  const kept = spaces.find((space) => space.spaceId === ids.space);
  assert.equal(kept?.spaceGrantId, ids.spaceGrant);
});

test("no longer refuses a custom grant", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateAgentGrantScope(
    recordingClient(sent),
    snapshot("custom"),
    grantOf("custom"),
    { preset: "observe", spaceIds: [ids.space] },
  );
  assert.equal(sent.length, 1);
  assert.equal(result.kind, "success");
});

test("refuses an empty Space set before a command is sent", async () => {
  let called = false;
  const client = {
    executeCommand: async () => {
      called = true;
      throw new Error("must not be called");
    },
  } as unknown as ConstellationRendererClient;
  // The schema requires at least one Space, and a grant with none fails
  // authorization outright — refuse locally with a clear reason instead of
  // letting a malformed command surface a generic error.
  const result = await updateAgentGrantScope(
    client,
    snapshot("operate"),
    grantOf("operate"),
    { preset: "operate", spaceIds: [] },
  );
  assert.equal(result.kind, "unavailable");
  assert.equal(called, false);
});
