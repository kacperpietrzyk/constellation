import assert from "node:assert/strict";
import { test } from "node:test";

import { CommandEnvelopeSchema } from "../src/index.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  space: "00000000-0000-4000-8000-000000000002",
  command: "00000000-0000-4000-8000-000000000006",
  correlation: "00000000-0000-4000-8000-000000000007",
  grant: "00000000-0000-4000-8000-000000000009",
  spaceGrant: "00000000-0000-4000-8000-00000000000a",
} as const;

const envelope = (commandName: string) => ({
  contractVersion: 1,
  commandName,
  commandId: ids.command,
  workspaceId: ids.workspace,
  idempotencyKey: "grant-set-scope-1",
  expectedVersions: {},
  correlationId: ids.correlation,
});

test("a re-scope may state the grant's Spaces", () => {
  const parsed = CommandEnvelopeSchema.parse({
    ...envelope("agent.grantSetScope"),
    payload: {
      grantId: ids.grant,
      preset: "observe",
      capabilityScope: ["task.list"],
      spaces: [
        { spaceGrantId: ids.spaceGrant, spaceId: ids.space, access: "view" },
      ],
    },
  });
  if (parsed.commandName !== "agent.grantSetScope")
    throw new Error("Expected an agent.grantSetScope envelope.");
  assert.equal(parsed.payload.spaces?.length, 1);
});

test("a re-scope may omit Spaces entirely", () => {
  const parsed = CommandEnvelopeSchema.parse({
    ...envelope("agent.grantSetScope"),
    payload: {
      grantId: ids.grant,
      preset: "observe",
      capabilityScope: ["task.list"],
    },
  });
  if (parsed.commandName !== "agent.grantSetScope")
    throw new Error("Expected an agent.grantSetScope envelope.");
  assert.equal(parsed.payload.spaces, undefined);
});

test("a re-scope may not state an empty Space list", () => {
  // A grant with no active Space fails authenticate() outright and the runtime
  // then answers authorization.denied to everything, including capabilities.
  const result = CommandEnvelopeSchema.safeParse({
    ...envelope("agent.grantSetScope"),
    payload: {
      grantId: ids.grant,
      preset: "observe",
      capabilityScope: ["task.list"],
      spaces: [],
    },
  });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(
    result.error.issues.map((issue) => issue.code),
    ["too_small"],
  );
});
