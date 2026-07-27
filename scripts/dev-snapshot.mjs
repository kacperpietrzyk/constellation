import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEV_STATE_DIRECTORY,
  INSTALLED_APP_NAME,
  SNAPSHOT_ENTRIES,
  agentDescriptors,
  devStateRoot,
  installedStateRoot,
  socketPathFits,
} from "./dev-state.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

export const copySnapshot = ({
  source,
  destination,
  entries = SNAPSHOT_ENTRIES,
}) => {
  // A wrong destination would be deleted recursively, so it is checked by name.
  if (path.basename(destination) !== DEV_STATE_DIRECTORY) {
    throw new Error("DEV_SNAPSHOT_DESTINATION_REFUSED");
  }
  if (
    !existsSync(path.join(source, "local-alpha-workspace", "key-wrapper.json"))
  ) {
    throw new Error("DEV_SNAPSHOT_SOURCE_INCOMPLETE");
  }
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  const copied = [];
  for (const entry of entries) {
    const from = path.join(source, entry);
    if (!existsSync(from)) continue;
    cpSync(from, path.join(destination, entry), {
      recursive: true,
      filter: (candidate) => path.basename(candidate) !== "application.sock",
    });
    copied.push(entry);
  }
  return copied;
};

const pgrepProbe = () =>
  spawnSync(
    "pgrep",
    ["-f", `${INSTALLED_APP_NAME}.app/Contents/MacOS/${INSTALLED_APP_NAME}`],
    { encoding: "utf8" },
  ).status === 0;

export const installedApplicationIsRunning = (probe = pgrepProbe) => probe();

export const mcpServerEntry = ({ descriptor, root = repositoryRoot }) => ({
  type: "stdio",
  command: "node",
  args: [path.join(root, "packages", "mcp", "dist", "bin", "stdio.mjs")],
  env: { CONSTELLATION_MCP_CREDENTIAL_FILE: descriptor },
});

const main = () => {
  if (process.platform !== "darwin") {
    throw new Error("DEV_SNAPSHOT_PLATFORM_UNSUPPORTED");
  }
  const source = installedStateRoot();
  const destination = devStateRoot();
  if (!socketPathFits(destination)) {
    throw new Error("DEV_SNAPSHOT_SOCKET_PATH_TOO_LONG");
  }
  if (installedApplicationIsRunning()) {
    console.error(
      `Quit ${INSTALLED_APP_NAME} first. Copying the workspace out from under a live writer would take an inconsistent database.`,
    );
    process.exitCode = 1;
    return;
  }
  const copied = copySnapshot({ source, destination });
  console.log(`Copied ${copied.length} entries to ${destination}`);
  const [descriptor] = agentDescriptors(destination);
  if (descriptor === undefined) {
    console.log(
      "No agent grant was copied. Create one in the application, then run this again.",
    );
    return;
  }
  console.log("\nRegister this alongside your existing server:\n");
  console.log(
    JSON.stringify(
      { mcpServers: { "constellation-dev": mcpServerEntry({ descriptor }) } },
      undefined,
      2,
    ),
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
