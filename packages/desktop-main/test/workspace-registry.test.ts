import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { WorkspaceIdSchema } from "@constellation/contracts";

import {
  ensureRegisteredWorkspace,
  loadWorkspaceRegistry,
  renameRegisteredWorkspace,
  resolveWorkspaceStateRoot,
  setActiveRegisteredWorkspace,
} from "../src/workspace-registry.js";

const firstId = WorkspaceIdSchema.parse("10000000-0000-4000-8000-000000000001");
const secondId = WorkspaceIdSchema.parse(
  "10000000-0000-4000-8000-000000000002",
);

test("workspace registry migrates the legacy root and switches isolated roots", () => {
  const root = mkdtempSync(path.join(tmpdir(), "constellation-registry-"));
  try {
    ensureRegisteredWorkspace(root, {
      workspaceId: firstId,
      name: "Personal",
      relativeStateRoot: ".",
    });
    ensureRegisteredWorkspace(root, {
      workspaceId: secondId,
      name: "Studio",
      relativeStateRoot: `workspaces/${secondId}`,
    });
    setActiveRegisteredWorkspace(root, firstId);
    renameRegisteredWorkspace(root, secondId, "Studio North");

    ensureRegisteredWorkspace(root, {
      workspaceId: firstId,
      name: "Personal restored",
      relativeStateRoot: `workspaces/${secondId}`,
    });

    const registry = loadWorkspaceRegistry(root);
    assert.equal(registry?.activeWorkspaceId, firstId);
    assert.equal(registry?.workspaces.length, 1);
    assert.equal(registry?.workspaces[0]?.name, "Personal restored");
    assert.equal(
      resolveWorkspaceStateRoot(root, registry!.workspaces[0]!),
      path.join(root, "workspaces", secondId),
    );
    assert.match(
      readFileSync(path.join(root, "workspace-registry.json"), "utf8"),
      /"version": 1/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
