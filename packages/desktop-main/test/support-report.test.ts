import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createPrivacySafeSupportReport,
  writePrivacySafeSupportReport,
} from "../src/support-report.js";

const sensitiveSentinels = [
  "Ada Lovelace",
  "workspace-secret-id",
  "/Users/ada/private.db",
  "https://hub.example.test?token=secret",
  "raw updater failure with customer name",
];

const input = {
  generatedAt: "2026-07-16T12:00:00.000Z",
  build: {
    channel: "local-alpha" as const,
    persistence: "encrypted-local" as const,
    version: "0.11.0",
    startupRecovery: "none" as const,
    workspaceAvailability: "ready" as const,
    initialWorkspaceId: "workspace-secret-id",
  },
  packaged: true,
  platform: "darwin" as const,
  architecture: "arm64",
  electronVersion: "43.1.0",
  dataHome: {
    descriptor: {
      providerKind: "local_only" as const,
      providerInstanceId: "https://hub.example.test?token=secret",
      displayName: "Ada Lovelace",
      storageRole: "canonical" as const,
      workspaceId: "workspace-secret-id",
      capabilities: {
        durable_writes: { support: "supported" as const },
        ordered_changes: { support: "unsupported" as const },
        checkpoints: { support: "supported" as const },
        collaborative_documents: { support: "unsupported" as const },
      },
    },
    availability: "available" as const,
    syncState: "not_configured" as const,
    checkpointState: "verified_this_session" as const,
    quota: { state: "unknown" as const },
    lastVerifiedAt: "2026-07-16T12:00:00.000Z",
    recoveryActions: [],
  },
  release: {
    kind: "failure" as const,
    currentVersion: "0.11.0",
    operation: "check" as const,
    message: "raw updater failure with customer name",
  },
};

test("support report excludes content, identities, paths, endpoints, and raw errors", () => {
  const serialized = JSON.stringify(createPrivacySafeSupportReport(input));
  for (const sentinel of sensitiveSentinels)
    assert.equal(serialized.includes(sentinel), false, sentinel);
  assert.match(serialized, /constellation\.support-report\.v1/);
  assert.match(serialized, /encrypted-local/);
});

test("support report writer is private and refuses to overwrite", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "support-report-"));
  const destination = path.join(directory, "report.json");
  try {
    writePrivacySafeSupportReport(
      destination,
      createPrivacySafeSupportReport(input),
    );
    assert.match(readFileSync(destination, "utf8"), /support-report/);
    assert.equal(statSync(destination).mode & 0o777, 0o600);
    writeFileSync(destination, "preserve me", { encoding: "utf8" });
    assert.throws(() =>
      writePrivacySafeSupportReport(
        destination,
        createPrivacySafeSupportReport(input),
      ),
    );
    assert.equal(readFileSync(destination, "utf8"), "preserve me");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
