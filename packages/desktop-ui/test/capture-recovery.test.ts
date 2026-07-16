import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { captureRecoveryActions } from "../src/CollaborationSurfaces.js";

describe("Capture recovery actions", () => {
  it("offers only semantically valid actions for every exception reason", () => {
    assert.deepEqual(captureRecoveryActions("capture_ambiguous"), [
      "route",
      "keep_unclassified",
    ]);
    assert.deepEqual(captureRecoveryActions("capture_duplicate"), [
      "route",
      "keep_unclassified",
    ]);
    assert.deepEqual(captureRecoveryActions("capture_unsupported"), [
      "route",
      "keep_unclassified",
    ]);
    assert.deepEqual(captureRecoveryActions("capture_missing_target"), [
      "route",
      "keep_unclassified",
    ]);
    for (const reason of [
      "capture_parsing_failure",
      "capture_permission_failure",
      "capture_stale_conflict",
      "capture_unknown_reconcile",
    ] as const)
      assert.deepEqual(captureRecoveryActions(reason), [
        "retry",
        "keep_unclassified",
      ]);
    for (const reason of [
      "capture_missing_payload",
      "capture_partial_payload_transfer",
    ] as const)
      assert.deepEqual(captureRecoveryActions(reason), [
        "retry",
        "replace_payload",
        "keep_unclassified",
      ]);
    assert.deepEqual(captureRecoveryActions("comment_mention"), []);
  });
});
