import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const build = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const rendererUrl = "http://127.0.0.1:5173";
const vite = spawn(
  "npm",
  [
    "run",
    "dev",
    "-w",
    "@constellation/desktop-ui",
    "--",
    "--port",
    "5173",
    "--strictPort",
  ],
  { stdio: "inherit" },
);

const stop = () => {
  electron?.kill("SIGTERM");
  vite.kill("SIGTERM");
};

let electron;
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(rendererUrl);
    if (response.ok) break;
  } catch {
    // The bounded poll only waits for the local Vite server.
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (attempt === 59) {
    stop();
    throw new Error("Desktop renderer did not start on port 5173.");
  }
}

electron = spawn(
  path.resolve(
    "node_modules/.bin",
    process.platform === "win32" ? "electron.cmd" : "electron",
  ),
  ["./packages/desktop-main/dist/src/main.js"],
  {
    env: {
      ...process.env,
      CONSTELLATION_DESKTOP_MODE: "preview",
      CONSTELLATION_RENDERER_URL: rendererUrl,
    },
    stdio: "inherit",
  },
);
electron.once("exit", (code) => {
  vite.kill("SIGTERM");
  process.exitCode = code ?? 0;
});
