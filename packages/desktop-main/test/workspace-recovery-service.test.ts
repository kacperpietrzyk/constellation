import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createWorkspaceRecoveryService,
  recoverInterruptedWorkspaceRestore,
} from "../src/workspace-recovery-service.js";

const restoreId = "00000000-0000-4000-8000-000000000001";

const withStateRoot = (run: (stateRoot: string) => void): void => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "constellation-restore-"));
  try {
    run(stateRoot);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
};

const writeMarker = (directory: string, marker: string): void => {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(directory, "marker"), marker, { mode: 0o600 });
};

const writeJournal = (
  stateRoot: string,
  state: "prepared" | "previous_retained" | "candidate_active_unverified",
): void => {
  const recoveryRoot = path.join(stateRoot, "workspace-recovery");
  mkdirSync(recoveryRoot, { recursive: true, mode: 0o700 });
  writeFileSync(
    path.join(recoveryRoot, "activation.json"),
    `${JSON.stringify({
      format: "constellation.workspace-restore-activation/v1",
      restoreId,
      state,
    })}\n`,
    { mode: 0o600 },
  );
};

describe("interrupted workspace restore recovery", () => {
  it("does not disguise an unexpected storage failure as a restore journey", async () => {
    const stateRoot = mkdtempSync(
      path.join(tmpdir(), "constellation-restore-startup-"),
    );
    try {
      await assert.rejects(
        createWorkspaceRecoveryService({
          appVersion: "test",
          databaseFactory: {
            open: () => {
              throw new Error("native driver exploded");
            },
          },
          safeStorage: {
            isAsyncEncryptionAvailable: async () => true,
            encryptStringAsync: async (value) => Buffer.from(value),
            decryptStringAsync: async (value) => ({
              result: value.toString("utf8"),
              shouldReEncrypt: false,
            }),
          },
          selectBackupPath: async () => undefined,
          selectExportPath: async () => undefined,
          stateRoot,
          timezone: "UTC",
        }),
        /native driver exploded/,
      );
    } finally {
      rmSync(stateRoot, { recursive: true, force: true });
    }
  });

  it("restores the retained workspace when interruption happens before activation", () => {
    withStateRoot((stateRoot) => {
      const retained = path.join(
        stateRoot,
        "workspace-recovery",
        `retained-${restoreId}`,
      );
      writeMarker(retained, "last-known-good");
      writeMarker(
        path.join(
          stateRoot,
          "workspace-recovery",
          "operations",
          restoreId,
          "candidate",
        ),
        "candidate",
      );
      writeJournal(stateRoot, "previous_retained");

      assert.equal(
        recoverInterruptedWorkspaceRestore(stateRoot),
        "previous_workspace_restored",
      );
      assert.equal(
        readFileSync(
          path.join(stateRoot, "local-alpha-workspace", "marker"),
          "utf8",
        ),
        "last-known-good",
      );
      assert.equal(existsSync(retained), false);
    });
  });

  it("restores the retained workspace when interruption lands before the journal update", () => {
    withStateRoot((stateRoot) => {
      const retained = path.join(
        stateRoot,
        "workspace-recovery",
        `retained-${restoreId}`,
      );
      writeMarker(retained, "last-known-good");
      writeMarker(
        path.join(
          stateRoot,
          "workspace-recovery",
          "operations",
          restoreId,
          "candidate",
        ),
        "candidate",
      );
      writeJournal(stateRoot, "prepared");

      assert.equal(
        recoverInterruptedWorkspaceRestore(stateRoot),
        "previous_workspace_restored",
      );
      assert.equal(
        readFileSync(
          path.join(stateRoot, "local-alpha-workspace", "marker"),
          "utf8",
        ),
        "last-known-good",
      );
      assert.equal(existsSync(retained), false);
    });
  });

  it("clears a prepared journal when interruption happens before retention", () => {
    withStateRoot((stateRoot) => {
      const active = path.join(stateRoot, "local-alpha-workspace");
      const candidate = path.join(
        stateRoot,
        "workspace-recovery",
        "operations",
        restoreId,
        "candidate",
      );
      writeMarker(active, "last-known-good");
      writeMarker(candidate, "candidate");
      writeJournal(stateRoot, "prepared");

      assert.equal(recoverInterruptedWorkspaceRestore(stateRoot), "none");
      assert.equal(
        readFileSync(path.join(active, "marker"), "utf8"),
        "last-known-good",
      );
      assert.equal(
        existsSync(
          path.join(stateRoot, "workspace-recovery", "activation.json"),
        ),
        false,
      );
    });
  });

  it("fails closed when a prepared journal has both active and retained roots", () => {
    withStateRoot((stateRoot) => {
      writeMarker(
        path.join(stateRoot, "local-alpha-workspace"),
        "ambiguous-active",
      );
      writeMarker(
        path.join(stateRoot, "workspace-recovery", `retained-${restoreId}`),
        "ambiguous-retained",
      );
      writeMarker(
        path.join(
          stateRoot,
          "workspace-recovery",
          "operations",
          restoreId,
          "candidate",
        ),
        "candidate",
      );
      writeJournal(stateRoot, "prepared");

      assert.throws(
        () => recoverInterruptedWorkspaceRestore(stateRoot),
        /WORKSPACE_RESTORE_PREPARED_STATE_AMBIGUOUS/,
      );
    });
  });

  it("isolates an unverified active candidate and restores the previous workspace", () => {
    withStateRoot((stateRoot) => {
      const active = path.join(stateRoot, "local-alpha-workspace");
      const retained = path.join(
        stateRoot,
        "workspace-recovery",
        `retained-${restoreId}`,
      );
      const candidate = path.join(
        stateRoot,
        "workspace-recovery",
        "operations",
        restoreId,
        "candidate",
      );
      mkdirSync(path.dirname(candidate), { recursive: true, mode: 0o700 });
      writeMarker(active, "unverified-candidate");
      writeMarker(retained, "last-known-good");
      writeJournal(stateRoot, "candidate_active_unverified");

      assert.equal(
        recoverInterruptedWorkspaceRestore(stateRoot),
        "previous_workspace_restored",
      );
      assert.equal(
        readFileSync(path.join(active, "marker"), "utf8"),
        "last-known-good",
      );
      assert.equal(
        readFileSync(path.join(candidate, "marker"), "utf8"),
        "unverified-candidate",
      );
    });
  });
});
