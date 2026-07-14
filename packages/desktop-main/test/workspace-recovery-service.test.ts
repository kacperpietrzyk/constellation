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

import { recoverInterruptedWorkspaceRestore } from "../src/workspace-recovery-service.js";

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
  state: "previous_retained" | "candidate_active_unverified",
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
