import assert from "node:assert/strict";
import { mkdtempSync, linkSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  DeviceIdentityError,
  loadOrCreateDeviceIdentity,
} from "../src/device-identity.js";

const temporaryRoot = (): string =>
  mkdtempSync(path.join(os.tmpdir(), "constellation-device-"));

describe("installation device identity", () => {
  it("publishes one stable non-hardware identity", () => {
    const root = temporaryRoot();
    try {
      const first = loadOrCreateDeviceIdentity(root);
      const second = loadOrCreateDeviceIdentity(root);
      assert.deepEqual(second, first);
      assert.match(first.deviceId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed for corrupt or multiply-linked identity files", () => {
    const corruptRoot = temporaryRoot();
    const linkedRoot = temporaryRoot();
    try {
      loadOrCreateDeviceIdentity(corruptRoot);
      writeFileSync(
        path.join(corruptRoot, "device", "identity.json"),
        '{"deviceId":"hardware-serial"}\n',
      );
      assert.throws(
        () => loadOrCreateDeviceIdentity(corruptRoot),
        (error) =>
          error instanceof DeviceIdentityError &&
          error.code === "identity_invalid",
      );

      loadOrCreateDeviceIdentity(linkedRoot);
      linkSync(
        path.join(linkedRoot, "device", "identity.json"),
        path.join(linkedRoot, "device", "identity-copy.json"),
      );
      assert.throws(
        () => loadOrCreateDeviceIdentity(linkedRoot),
        (error) =>
          error instanceof DeviceIdentityError &&
          error.code === "identity_invalid",
      );
    } finally {
      rmSync(corruptRoot, { recursive: true, force: true });
      rmSync(linkedRoot, { recursive: true, force: true });
    }
  });
});
