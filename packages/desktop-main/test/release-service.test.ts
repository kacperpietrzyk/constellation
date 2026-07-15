import assert from "node:assert/strict";
import test from "node:test";

import {
  DesktopReleaseService,
  isNewerRelease,
  type DesktopUpdaterAdapter,
} from "../src/release-service.js";

const adapter = (
  overrides: Partial<DesktopUpdaterAdapter> = {},
): DesktopUpdaterAdapter => ({
  checkForUpdates: async () => ({ updateInfo: { version: "0.2.0" } }),
  downloadUpdate: async () => ["update.zip"],
  quitAndInstall: () => undefined,
  ...overrides,
});

test("release comparison accepts only a strictly newer numeric release", () => {
  assert.equal(isNewerRelease("0.2.0", "0.1.9"), true);
  assert.equal(isNewerRelease("1.0.0", "0.9.9"), true);
  assert.equal(isNewerRelease("0.1.0", "0.1.0"), false);
  assert.equal(isNewerRelease("0.0.9", "0.1.0"), false);
  assert.equal(isNewerRelease("untrusted", "0.1.0"), false);
});

test("release service checks, downloads, and installs only a verified update", async () => {
  const installs: boolean[][] = [];
  const service = new DesktopReleaseService(
    "0.1.0",
    adapter({ quitAndInstall: (...input) => installs.push(input) }),
  );
  assert.deepEqual(await service.check(), {
    kind: "available",
    currentVersion: "0.1.0",
    version: "0.2.0",
  });
  assert.deepEqual(await service.download(), {
    kind: "ready",
    currentVersion: "0.1.0",
    version: "0.2.0",
  });
  assert.equal(service.install().kind, "installing");
  assert.deepEqual(installs, [[false, true]]);
});

test("release service serializes checks and keeps failures retryable", async () => {
  let checks = 0;
  let releaseCheck: (() => void) | undefined;
  const service = new DesktopReleaseService(
    "0.1.0",
    adapter({
      checkForUpdates: () => {
        checks += 1;
        return new Promise((resolve) => {
          releaseCheck = () => resolve(null);
        });
      },
    }),
  );
  const first = service.check();
  const second = service.check();
  assert.equal(checks, 1);
  assert.equal(first, second);
  releaseCheck?.();
  assert.equal((await first).kind, "current");

  const failed = new DesktopReleaseService(
    "0.1.0",
    adapter({
      checkForUpdates: async () => Promise.reject(new Error("offline")),
    }),
  );
  assert.deepEqual(await failed.check(), {
    kind: "failure",
    currentVersion: "0.1.0",
    operation: "check",
    message:
      "Nie udało się bezpiecznie sprawdzić aktualizacji. Obecna wersja pozostaje bez zmian.",
  });
});

test("mechanism-only builds expose no update operation", async () => {
  const service = new DesktopReleaseService(
    "0.1.0",
    undefined,
    "mechanism_only_build",
  );
  assert.deepEqual(await service.check(), {
    kind: "unavailable",
    currentVersion: "0.1.0",
    reason: "mechanism_only_build",
  });
  assert.equal(service.install().kind, "unavailable");
});
