import assert from "node:assert/strict";
import {
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { DeviceIdSchema, WorkspaceIdSchema } from "@constellation/contracts";

import {
  HubConnectionCustody,
  type HubConnection,
} from "../src/hub-connection-custody.js";
import type { AsyncSafeStorage } from "../src/workspace-key-custody.js";

const connection: HubConnection = {
  workspaceId: WorkspaceIdSchema.parse("00000000-0000-4000-8000-000000000001"),
  deviceId: DeviceIdSchema.parse("00000000-0000-4000-8000-000000000002"),
  origin: "https://hub.example.test/path-that-must-not-be-kept",
  providerInstanceId: "self-hosted-hub/v1:test",
  deviceCredential: "device-secret-that-must-not-appear-on-disk",
};

class SyntheticSafeStorage implements AsyncSafeStorage {
  public constructor(
    private readonly available = true,
    private readonly rotateOnDecrypt = false,
  ) {}

  public async isAsyncEncryptionAvailable(): Promise<boolean> {
    return this.available;
  }

  public async encryptStringAsync(value: string): Promise<Buffer> {
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

const withStateRoot = async (
  run: (stateRoot: string, filename: string) => Promise<void>,
): Promise<void> => {
  const stateRoot = mkdtempSync(
    path.join(tmpdir(), "constellation-hub-custody-"),
  );
  try {
    await run(stateRoot, path.join(stateRoot, "hub", "connection.json"));
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
};

describe("Hub connection custody", () => {
  it("protects the device credential and restores the canonical connection", async () => {
    await withStateRoot(async (stateRoot, filename) => {
      const custody = new HubConnectionCustody(
        stateRoot,
        new SyntheticSafeStorage(),
      );
      assert.equal(await custody.load(), undefined);
      await custody.create(connection);

      const raw = readFileSync(filename, "utf8");
      assert.equal(raw.includes(connection.deviceCredential), false);
      assert.equal(raw.includes("path-that-must-not-be-kept"), false);
      if (process.platform !== "win32") {
        assert.equal(lstatSync(filename).mode & 0o777, 0o600);
      }
      assert.deepEqual(await custody.load(), {
        ...connection,
        origin: "https://hub.example.test",
      });
      await assert.rejects(
        () => custody.create(connection),
        /already configured/,
      );
    });
  });

  it("fails closed when OS protection is unavailable or rotation is required", async () => {
    await withStateRoot(async (stateRoot) => {
      await assert.rejects(
        () =>
          new HubConnectionCustody(
            stateRoot,
            new SyntheticSafeStorage(false),
          ).create(connection),
        /credential protection is unavailable/,
      );

      const custody = new HubConnectionCustody(
        stateRoot,
        new SyntheticSafeStorage(),
      );
      await custody.create(connection);
      await assert.rejects(
        () =>
          new HubConnectionCustody(
            stateRoot,
            new SyntheticSafeStorage(true, true),
          ).load(),
        /requires explicit protected re-encryption/,
      );
    });
  });

  it("rejects malformed and non-exclusive custody records", async () => {
    await withStateRoot(async (stateRoot, filename) => {
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
      writeFileSync(filename, "{}\n", { mode: 0o600 });
      await assert.rejects(
        () =>
          new HubConnectionCustody(
            stateRoot,
            new SyntheticSafeStorage(),
          ).load(),
        /record is invalid/,
      );

      if (process.platform !== "win32") {
        rmSync(filename);
        const target = path.join(stateRoot, "target.json");
        writeFileSync(target, "{}\n", { mode: 0o600 });
        symlinkSync(target, filename);
        await assert.rejects(
          () =>
            new HubConnectionCustody(
              stateRoot,
              new SyntheticSafeStorage(),
            ).load(),
          /custody file is unsafe/,
        );

        rmSync(filename);
        linkSync(target, filename);
        await assert.rejects(
          () =>
            new HubConnectionCustody(
              stateRoot,
              new SyntheticSafeStorage(),
            ).load(),
          /custody file is unsafe/,
        );
      }
    });
  });
});
