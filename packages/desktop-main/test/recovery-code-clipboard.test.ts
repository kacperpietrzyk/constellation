import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { copyRecoveryCodeToClipboard } from "../src/recovery-code-clipboard.js";

const recoveryCode = `cst1_${Buffer.alloc(32, 7).toString("base64url")}`;

describe("recovery-code clipboard bridge", () => {
  it("copies one canonical recovery code without returning it", () => {
    const writes: string[] = [];
    assert.deepEqual(
      copyRecoveryCodeToClipboard(
        { writeText: (text) => writes.push(text) },
        { recoveryCode },
      ),
      { outcome: "success" },
    );
    assert.deepEqual(writes, [recoveryCode]);
  });

  it("rejects malformed, non-canonical, and over-posted input", () => {
    const writes: string[] = [];
    const clipboard = { writeText: (text: string) => writes.push(text) };
    assert.deepEqual(copyRecoveryCodeToClipboard(clipboard, recoveryCode), {
      outcome: "failure",
    });
    assert.deepEqual(
      copyRecoveryCodeToClipboard(clipboard, {
        recoveryCode: `${recoveryCode}=`,
      }),
      { outcome: "failure" },
    );
    assert.deepEqual(
      copyRecoveryCodeToClipboard(clipboard, { recoveryCode, extra: true }),
      { outcome: "failure" },
    );
    assert.deepEqual(writes, []);
  });

  it("returns a content-free failure when the operating-system write fails", () => {
    assert.deepEqual(
      copyRecoveryCodeToClipboard(
        {
          writeText: () => {
            throw new Error("clipboard unavailable");
          },
        },
        { recoveryCode },
      ),
      { outcome: "failure" },
    );
  });
});
