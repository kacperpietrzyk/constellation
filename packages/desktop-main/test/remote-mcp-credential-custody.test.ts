import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GrantIdSchema } from "@constellation/contracts";

import { RemoteMcpCredentialCustody } from "../src/remote-mcp-credential-custody.js";

test("remote MCP custody publishes, atomically rotates, and removes a private host descriptor", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "constellation-remote-mcp-"));
  const grantId = GrantIdSchema.parse("70000000-0000-4000-8000-000000000001");
  const custody = new RemoteMcpCredentialCustody(root);
  const descriptorPath = custody.publish({
    grantId,
    endpoint:
      "https://hub.example.test/v1/mcp/70000000-0000-4000-8000-000000000002",
    bearerToken: `70000000-0000-4000-8000-000000000003.${"a".repeat(43)}`,
  });
  if (process.platform !== "win32")
    assert.equal(statSync(descriptorPath).mode & 0o077, 0);
  assert.match(readFileSync(descriptorPath, "utf8"), /Bearer 70000000/u);

  custody.publish({
    grantId,
    endpoint:
      "https://hub.example.test/v1/mcp/70000000-0000-4000-8000-000000000002",
    bearerToken: `70000000-0000-4000-8000-000000000004.${"b".repeat(43)}`,
  });
  const rotated = readFileSync(descriptorPath, "utf8");
  assert.doesNotMatch(rotated, /000000000003/u);
  assert.match(rotated, /000000000004/u);

  custody.revoke(grantId);
  assert.throws(() => readFileSync(descriptorPath, "utf8"));
});
