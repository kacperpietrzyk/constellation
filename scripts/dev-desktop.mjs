import { spawn, spawnSync } from "node:child_process";
import { existsSync, watch } from "node:fs";
import path from "node:path";

import { devStateRoot } from "./dev-state.mjs";

const RESTART_DEBOUNCE_MS = 300;
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const stateRoot = devStateRoot();

if (
  !existsSync(path.join(stateRoot, "local-alpha-workspace", "key-wrapper.json"))
) {
  console.error("No development snapshot yet. Run: npm run dev:snapshot");
  process.exit(1);
}

const build = spawnSync("npm", ["run", "build"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const children = [];
const watchProcess = (args) => {
  const child = spawn("npm", args, { cwd: repositoryRoot, stdio: "inherit" });
  children.push(child);
  return child;
};

watchProcess(["exec", "--", "tsc", "-b", "--watch", "--preserveWatchOutput"]);
watchProcess([
  "run",
  "build",
  "-w",
  "@constellation/desktop-ui",
  "--",
  "--watch",
]);

const electronBinary = path.join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);
const entry = path.join(
  repositoryRoot,
  "packages",
  "desktop-main",
  "dist",
  "src",
  "dev-main.js",
);

let electron;
let restarting = false;
const startElectron = () => {
  electron = spawn(electronBinary, [entry], {
    cwd: repositoryRoot,
    env: { ...process.env, CONSTELLATION_DEV_STATE_ROOT: stateRoot },
    stdio: "inherit",
  });
  electron.once("exit", (code) => {
    if (restarting) return;
    stop();
    process.exitCode = code ?? 0;
  });
};

const stop = () => {
  for (const child of children) child.kill("SIGTERM");
  electron?.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

startElectron();

// A renderer change is picked up by dev-main's own watcher; only main-process
// output needs the window torn down and rebuilt. Measured: an idle
// `tsc -b --watch` emits nothing here over 15 seconds, so this does not storm.
let pending;
watch(
  path.join(repositoryRoot, "packages", "desktop-main", "dist", "src"),
  { recursive: true },
  (_event, filename) => {
    if (filename !== null && !filename.endsWith(".js")) return;
    if (pending !== undefined) clearTimeout(pending);
    pending = setTimeout(() => {
      restarting = true;
      const previous = electron;
      previous?.once("exit", () => {
        restarting = false;
        startElectron();
      });
      previous?.kill("SIGTERM");
    }, RESTART_DEBOUNCE_MS);
  },
);
