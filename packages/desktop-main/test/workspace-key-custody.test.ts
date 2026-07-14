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

import {
  CredentialIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";

import {
  WorkspaceKeyCustody,
  WorkspaceKeyCustodyError,
  type AsyncSafeStorage,
} from "../src/workspace-key-custody.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);
const identity = {
  workspaceId,
  rootSpaceId: SpaceIdSchema.parse("00000000-0000-4000-8000-000000000002"),
  principalId: PrincipalIdSchema.parse("00000000-0000-4000-8000-000000000003"),
  credentialId: CredentialIdSchema.parse(
    "00000000-0000-4000-8000-000000000004",
  ),
  grantId: GrantIdSchema.parse("00000000-0000-4000-8000-000000000005"),
} as const;

class SyntheticSafeStorage implements AsyncSafeStorage {
  public encryptions = 0;

  public constructor(
    private readonly available = true,
    private readonly rotateOnDecrypt = false,
  ) {}

  public async isAsyncEncryptionAvailable(): Promise<boolean> {
    return this.available;
  }

  public async encryptStringAsync(value: string): Promise<Buffer> {
    this.encryptions += 1;
    return Buffer.from(Buffer.from(value, "utf8").map((byte) => byte ^ 0xa5));
  }

  public async decryptStringAsync(value: Buffer): Promise<{
    readonly result: string;
    readonly shouldReEncrypt: boolean;
  }> {
    return {
      result: Buffer.from(
        Buffer.from(value).map((byte) => byte ^ 0xa5),
      ).toString("utf8"),
      shouldReEncrypt: this.rotateOnDecrypt,
    };
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
      const safeStorage = new SyntheticSafeStorage(true, true);
      const custody = new WorkspaceKeyCustody(safeStorage, filename);
      const created = await custody.create(identity);
      assert.equal(created.key.length, 32);
      assert.deepEqual(created.identity, identity);
      assert.equal(created.state, "prepared");
      const createdCopy = Buffer.from(created.key);
      const wrapper = readFileSync(filename);
      assert.equal(wrapper.includes(created.key), false);
      if (process.platform !== "win32") {
        assert.equal(statSync(filename).mode & 0o777, 0o600);
      }
      const restored = await custody.load(workspaceId);
      assert.deepEqual(restored.key, createdCopy);
      assert.deepEqual(restored.identity, identity);
      assert.equal(restored.state, "prepared");
      assert.equal(safeStorage.encryptions, 2);
      await custody.markReady(workspaceId);
      const ready = await custody.load(workspaceId);
      assert.equal(ready.state, "ready");
      assert.equal(
        wrapper.includes(Buffer.from(created.key.toString("base64url"))),
        false,
      );
      created.key.fill(0);
      createdCopy.fill(0);
      restored.key.fill(0);
      ready.key.fill(0);
      wrapper.fill(0);
      await assert.rejects(
        () => custody.create(identity),
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
        () => unavailable.create(identity),
        (error: unknown) => {
          assert(error instanceof WorkspaceKeyCustodyError);
          return error.code === "encryption_unavailable";
        },
      );

      const custody = new WorkspaceKeyCustody(
        new SyntheticSafeStorage(),
        filename,
      );
      const bundle = await custody.create(identity);
      bundle.key.fill(0);
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
