import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  removeOwnedProbeTemporaryRoots,
  removeWithRetry,
} from "./cleanup-targets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = process.env.RUNNER_TEMP || os.tmpdir();

function removeProbeKeychainItem() {
  if (process.platform !== "darwin") return;
  const identity = [
    "-s",
    "Constellation Packaged Store Probe Safe Storage",
    "-a",
    "Constellation Packaged Store Probe Key",
  ];
  const find = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  if (find.status === 44) return;
  if (find.status !== 0) throw new Error("KEYCHAIN_QUERY_FAILED");
  const remove = spawnSync(
    "/usr/bin/security",
    ["delete-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  if (remove.status !== 0) throw new Error("KEYCHAIN_CLEANUP_FAILED");
  const verify = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  if (verify.status !== 44) throw new Error("KEYCHAIN_CLEANUP_UNVERIFIED");
}

await removeWithRetry(path.join(root, "out"));
await removeWithRetry(path.join(root, "build"));
const removed = await removeOwnedProbeTemporaryRoots(temporaryRoot);
removeProbeKeychainItem();

process.stdout.write(`${JSON.stringify({ status: "clean", removed })}\n`);
