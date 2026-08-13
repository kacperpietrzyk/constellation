import assert from "node:assert/strict";
import test from "node:test";

import { EncryptedStoreCapabilityError } from "@constellation/local-store";

import { DurableWorkspaceOpenError } from "../src/durable-kernel-service.js";
import {
  STARTUP_CAUSE_LIMIT,
  startupFailureCause,
  startupFailureCopy,
} from "../src/startup-failure.js";
import { WorkspaceKeyCustodyError } from "../src/workspace-key-custody.js";

// The defect these assertions hold shut: the cause of a failed startup used to
// reach nobody unless CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT was set, and that
// same variable reroutes the workspace under a smoke root. Measured twice on
// real data: a modal saying only "The local workspace was not opened", and a
// diagnosis that cost three restarts and a temporary console.error in
// production code. Showing the cause must therefore be free of any switch.

test("the dialog detail carries the cause, not only the reassurance", () => {
  const failure = startupFailureCopy(
    new Error("SQLITE_NOTADB: file is not a database"),
  );
  assert.equal(failure.code, "desktop-startup-failed");
  assert.match(failure.detail, /SQLITE_NOTADB: file is not a database/u);
  // The fixed sentence is still there and still first: it is the part that
  // says the workspace was not damaged.
  assert.match(failure.detail, /Your workspace was not intentionally changed/u);
  assert.equal(
    failure.detail.indexOf(failure.guidance) <
      failure.detail.indexOf(failure.cause),
    true,
  );
  // The cause is its own field, so a caller can log it without parsing prose.
  assert.equal(failure.cause, "Error: SQLITE_NOTADB: file is not a database");
});

test("no environment variable is read to decide whether the cause is shown", () => {
  // Same input, opposite settings of the variable that used to gate this.
  const withSmokeRoot = { ...process.env };
  delete process.env["CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT"];
  const silent = startupFailureCopy(new Error("native driver missing"));
  process.env["CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT"] = "/tmp/smoke";
  const noisy = startupFailureCopy(new Error("native driver missing"));
  process.env = withSmokeRoot;
  assert.deepEqual(silent, noisy);
  assert.match(silent.detail, /native driver missing/u);
});

test("every recognised failure keeps its own guidance and still names the cause", () => {
  const cases = [
    {
      error: new WorkspaceKeyCustodyError("encryption_unavailable"),
      code: "secure-storage-unavailable",
      guidance: /Unlock your sign-in keychain/u,
    },
    {
      error: new WorkspaceKeyCustodyError("wrapper_invalid"),
      code: "protected-key-unavailable",
      guidance: /Restore the key wrapper and database/u,
    },
    {
      error: new DurableWorkspaceOpenError("database_without_key"),
      code: "workspace-open-blocked",
      guidance: /its protected key wrapper is missing/u,
    },
    {
      error: new EncryptedStoreCapabilityError("cipher self-test failed"),
      code: "encrypted-store-unavailable",
      guidance: /did not pass its startup safety checks/u,
    },
  ] as const;
  for (const { error, code, guidance } of cases) {
    const failure = startupFailureCopy(error);
    assert.equal(failure.code, code);
    assert.match(failure.guidance, guidance);
    assert.match(failure.detail, guidance);
    // The message the error itself carries reaches the reader in EVERY arm,
    // not only in the unrecognised one. Asserted against the whole message,
    // which no guidance sentence contains, so a guidance-only detail fails
    // here instead of matching by accident on a shared word.
    assert.equal(failure.cause.endsWith(error.message), true);
    assert.equal(failure.detail.includes(error.message), true);
  }
});

test("the cause is one bounded line: no stack, no runaway message", () => {
  const long = new Error("x".repeat(5_000));
  const cause = startupFailureCause(long);
  assert.equal(cause.length <= STARTUP_CAUSE_LIMIT, true);
  assert.equal(cause.endsWith("…"), true);
  // A stack would leak absolute paths into a screenshot and push the guidance
  // out of a modal that cannot be scrolled.
  assert.equal(cause.includes("\n"), false);
  assert.equal(cause.includes("startup-failure"), false);

  const multiline = new Error("first line\n   second line");
  assert.equal(startupFailureCause(multiline), "Error: first line second line");
});

test("a thrown non-error still says something a reader can act on", () => {
  assert.equal(
    startupFailureCause("plain string failure"),
    "plain string failure",
  );
  assert.equal(
    startupFailureCause(undefined),
    "a thrown undefined with no message",
  );
  assert.equal(startupFailureCause(new Error("")), "Error with no message");
  assert.equal(
    startupFailureCause(new WorkspaceKeyCustodyError("wrapper_missing")),
    "WorkspaceKeyCustodyError: Workspace key custody failed: wrapper_missing.",
  );
});
