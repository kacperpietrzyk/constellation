import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const OWNED_TEMPORARY_DIRECTORY_PREFIXES = Object.freeze([
  "constellation-packaged-store-probe-",
  "constellation-packaged-store-recovery-",
  "constellation-packaged-store-generation-",
]);

export async function removeWithRetry(target) {
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

function isOwnedTemporaryDirectory(entry) {
  if (!entry.isDirectory()) return false;
  return OWNED_TEMPORARY_DIRECTORY_PREFIXES.some(
    (prefix) =>
      entry.name.startsWith(prefix) && entry.name.length > prefix.length,
  );
}

export async function removeOwnedProbeTemporaryRoots(temporaryRoot) {
  let entries;
  try {
    entries = fs.readdirSync(temporaryRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!isOwnedTemporaryDirectory(entry)) continue;
    await removeWithRetry(path.join(temporaryRoot, entry.name));
    removed += 1;
  }
  return removed;
}
