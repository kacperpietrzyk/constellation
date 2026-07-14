import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  CredentialIdSchema,
  ExecutionContextSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";

import { writeHubAuthorizationFile } from "../src/hub-authorization-export.js";

const context = ExecutionContextSchema.parse({
  workspaceId: WorkspaceIdSchema.parse("00000000-0000-4000-8000-000000000001"),
  principalId: PrincipalIdSchema.parse("00000000-0000-4000-8000-000000000002"),
  principalKind: "human",
  credentialId: CredentialIdSchema.parse(
    "00000000-0000-4000-8000-000000000003",
  ),
  grantId: GrantIdSchema.parse("00000000-0000-4000-8000-000000000004"),
  policyVersion: 1,
  origin: "desktop",
  capabilityScope: ["workspace.rename", "task.list"],
  spaceScope: [SpaceIdSchema.parse("00000000-0000-4000-8000-000000000005")],
});

describe("Hub authorization export", () => {
  it("publishes the exact validated context as a private file", () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "constellation-hub-auth-"),
    );
    try {
      const filename = path.join(directory, "nested", "authorization.json");
      writeHubAuthorizationFile(filename, context);
      assert.deepEqual(JSON.parse(readFileSync(filename, "utf8")), context);
      if (process.platform !== "win32") {
        assert.equal(lstatSync(filename).mode & 0o777, 0o600);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
