import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
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
  // Copied into a sibling staging directory first and swapped into place only
  // once every entry has landed. A failure partway through an entry (a
  // permission error, say) would otherwise leave a destination where
  // local-alpha-workspace/key-wrapper.json — copied first — already exists
  // but later entries such as the agent grants do not.
  const staging = `${destination}.staging-${randomUUID()}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const copied = [];
  try {
    for (const entry of entries) {
      const from = path.join(source, entry);
      if (!existsSync(from)) continue;
      cpSync(from, path.join(staging, entry), {
        recursive: true,
        filter: (candidate) => path.basename(candidate) !== "application.sock",
      });
      copied.push(entry);
    }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  // The swap is two renames, not a delete-then-move: deleting the previous
  // destination first can itself fail partway (a recursive delete can leave
  // a half-removed destination), which would silently orphan the
  // fully-built staging directory. Instead the previous copy is renamed
  // aside, the new copy is renamed into its place, and only then is the
  // previous copy discarded. A rename within one parent directory does not
  // half-complete the way a recursive delete can, so after any failure here
  // the destination is either the previous complete copy or absent - never
  // partial - and neither the staging nor the backup directory survives.
  const backup = `${destination}.backup-${randomUUID()}`;
  const destinationExisted = existsSync(destination);
  let renamedAway = false;
  try {
    if (destinationExisted) {
      renameSync(destination, backup);
      renamedAway = true;
    }
    renameSync(staging, destination);
  } catch (error) {
    let swapError = error;
    if (renamedAway) {
      try {
        renameSync(backup, destination);
      } catch (restoreError) {
        // The previous copy is stranded under `backup` rather than lost:
        // name the path so a human can recover it by hand.
        swapError = new Error(
          `DEV_SNAPSHOT_SWAP_FAILED: the previous copy could not be restored from ${backup}: ${restoreError.message}`,
        );
      }
    }
    rmSync(staging, { recursive: true, force: true });
    throw swapError;
  }
  rmSync(backup, { recursive: true, force: true });
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
