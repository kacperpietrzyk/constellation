import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = process.env.RUNNER_TEMP || os.tmpdir();
let removed = 0;

async function removeWithRetry(target) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(200 * (attempt + 1));
    }
  }
  throw lastError || new Error("CLEANUP_FAILED");
}

function removeProbeKeychainItem() {
  if (process.platform !== "darwin") return;
  const identity = [
    "-s",
    "Constellation Key Custody Probe Safe Storage",
    "-a",
    "Constellation Key Custody Probe Key",
  ];
  const find = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", ...identity],
    {
      stdio: "ignore",
      timeout: 5_000,
    },
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
for (const entry of fs.readdirSync(temporaryRoot, { withFileTypes: true })) {
  if (
    entry.isDirectory() &&
    entry.name.startsWith("constellation-key-custody-probe-")
  ) {
    await removeWithRetry(path.join(temporaryRoot, entry.name));
    removed += 1;
  }
}
removeProbeKeychainItem();

process.stdout.write(`${JSON.stringify({ status: "clean", removed })}\n`);
