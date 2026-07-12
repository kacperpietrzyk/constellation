import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probe = path.join(root, "scripts", "probe.mjs");
const execution = spawnSync(electron, [probe], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
});

if (execution.error) throw execution.error;
if (execution.status !== 0) {
  throw new Error(
    `Electron probe failed with ${execution.signal ?? `exit ${execution.status}`}`,
  );
}
