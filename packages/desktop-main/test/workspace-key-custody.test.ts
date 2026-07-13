import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { WorkspaceIdSchema } from "@constellation/contracts";

import {
  WorkspaceKeyCustody,
  WorkspaceKeyCustodyError,
  type AsyncSafeStorage,
} from "../src/workspace-key-custody.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);

class SyntheticSafeStorage implements AsyncSafeStorage {
  public constructor(private readonly available = true) {}

  public async isAsyncEncryptionAvailable(): Promise<boolean> {
    return this.available;
  }

  public async encryptStringAsync(value: string): Promise<Buffer> {
    return Buffer.from(Buffer.from(value, "utf8").map((byte) => byte ^ 0xa5));
  }

  public async decryptStringAsync(value: Buffer): Promise<string> {
    return Buffer.from(Buffer.from(value).map((byte) => byte ^ 0xa5)).toString(
      "utf8",
    );
  }
}

const withWrapper = async (
  run: (filename: string) => Promise<void>,
): Promise<void> => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "constellation-key-custody-"),
  );
  try {
    await run(path.join(directory, "key-wrapper.json"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("workspace key custody", () => {
  it("publishes one wrapped key and restores the exact material", async () => {
    await withWrapper(async (filename) => {
      const custody = new WorkspaceKeyCustody(
        new SyntheticSafeStorage(),
        filename,
      );
      const created = await custody.create(workspaceId);
      assert.equal(created.length, 32);
      const createdCopy = Buffer.from(created);
      const wrapper = readFileSync(filename);
      assert.equal(wrapper.includes(created), false);
      if (process.platform !== "win32") {
        assert.equal(statSync(filename).mode & 0o777, 0o600);
      }
      const restored = await custody.load(workspaceId);
      assert.deepEqual(restored, createdCopy);
      assert.equal(
        wrapper.includes(Buffer.from(created.toString("base64url"))),
        false,
      );
      created.fill(0);
      createdCopy.fill(0);
      restored.fill(0);
      wrapper.fill(0);
      await assert.rejects(
        () => custody.create(workspaceId),
        (error: unknown) => {
          assert(error instanceof WorkspaceKeyCustodyError);
          return error.code === "wrapper_exists";
        },
      );
    });
  });

  it("rejects unavailable encryption, context mismatch, and tampering", async () => {
    await withWrapper(async (filename) => {
      const unavailable = new WorkspaceKeyCustody(
        new SyntheticSafeStorage(false),
        filename,
      );
      await assert.rejects(
        () => unavailable.create(workspaceId),
        (error: unknown) => {
          assert(error instanceof WorkspaceKeyCustodyError);
          return error.code === "encryption_unavailable";
        },
      );

      const custody = new WorkspaceKeyCustody(
        new SyntheticSafeStorage(),
        filename,
      );
      const key = await custody.create(workspaceId);
      key.fill(0);
      const otherWorkspace = WorkspaceIdSchema.parse(
        "00000000-0000-4000-8000-000000000002",
      );
      await assert.rejects(
        () => custody.load(otherWorkspace),
        (error: unknown) => {
          assert(error instanceof WorkspaceKeyCustodyError);
          return error.code === "wrapper_context_mismatch";
        },
      );

      writeFileSync(filename, "{}\n", { mode: 0o600 });
      await assert.rejects(
        () => custody.load(workspaceId),
        (error: unknown) => {
          assert(error instanceof WorkspaceKeyCustodyError);
          return error.code === "wrapper_invalid";
        },
      );
    });
  });
});
