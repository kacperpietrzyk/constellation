import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INSTALLED_APP_NAME,
  SNAPSHOT_ENTRIES,
  agentDescriptors,
  devStateRoot,
  installedStateRoot,
  localSocketPath,
  socketPathFits,
} from "./dev-state.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const MULTI_WORKSPACE_UNSUPPORTED_MESSAGE =
  'multi-workspace layouts are not supported by the snapshot yet: the active workspace must have relativeStateRoot ".".';

// Mirrors production's fallback deliberately loosely rather than replicating
// workspace-registry.ts's full schema check. Production (parseRegistry) only
// ever resolves a non-"." root once the registry is fully valid and
// versioned, and falls back to treating the base root as the workspace the
// moment any part of the shape is off — including a missing file. A parser
// this loose can therefore only diverge from production in one direction: a
// registry production would still fall back on (an unrecognized `version`,
// say) makes this refuse anyway. A false refusal is the safe direction for a
// copy tool.
const activeRelativeStateRoot = (source) => {
  const registryPath = path.join(source, "workspace-registry.json");
  let raw;
  try {
    raw = readFileSync(registryPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw new Error(
      `DEV_SNAPSHOT_REGISTRY_UNREADABLE: could not read ${registryPath}: ${error.message}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `DEV_SNAPSHOT_REGISTRY_UNREADABLE: ${registryPath} is not valid JSON: ${error.message}`,
    );
  }
  const workspaces = Array.isArray(parsed?.workspaces) ? parsed.workspaces : [];
  const active = workspaces.find(
    (workspace) =>
      workspace !== null &&
      typeof workspace === "object" &&
      workspace.workspaceId === parsed?.activeWorkspaceId,
  );
  return active?.relativeStateRoot;
};

const assertSingleWorkspaceLayout = (source) => {
  const relativeStateRoot = activeRelativeStateRoot(source);
  if (relativeStateRoot !== undefined && relativeStateRoot !== ".") {
    throw new Error(
      `DEV_SNAPSHOT_MULTI_WORKSPACE_UNSUPPORTED: the active workspace's relativeStateRoot is ${JSON.stringify(relativeStateRoot)}, not "."; ${MULTI_WORKSPACE_UNSUPPORTED_MESSAGE}`,
    );
  }
};

// The runtime rewrites an *active* grant's endpoint when it binds its socket
// (LocalMcpRuntime.start filters `grant.status === "active"`), so for those
// grants this is idempotent — it exists only to close the window between
// "snapshot taken" and "dev shell launched once", during which a copied
// descriptor would otherwise still name the installed application's socket
// and be authenticated by it. A descriptor whose grant is not active (e.g.
// already revoked) is never touched by the runtime at all, so this function
// is the only place its endpoint is ever corrected.
const repointAgentDescriptors = (agentsDirectory, endpoint) => {
  if (!existsSync(agentsDirectory)) return;
  for (const entry of readdirSync(agentsDirectory)) {
    if (!entry.endsWith(".json")) continue;
    const filePath = path.join(agentsDirectory, entry);
    const descriptor = JSON.parse(readFileSync(filePath, "utf8"));
    // A descriptor is expected to be a JSON object; parsing to null, an
    // array, or a primitive would otherwise be silently rewritten into
    // `{"endpoint": "…"}` instead of being refused, in a function whose
    // whole purpose is not to silently write the wrong thing.
    if (
      descriptor === null ||
      typeof descriptor !== "object" ||
      Array.isArray(descriptor)
    ) {
      throw new Error(
        `DEV_SNAPSHOT_DESCRIPTOR_MALFORMED: ${filePath} is not a JSON object.`,
      );
    }
    writeFileSync(
      filePath,
      `${JSON.stringify({ ...descriptor, endpoint })}\n`,
      "utf8",
    );
  }
};

export const copySnapshot = ({
  source,
  destination,
  entries = SNAPSHOT_ENTRIES,
  home = os.homedir(),
}) => {
  // A wrong destination would be deleted recursively, so it must match the
  // development state root exactly. A basename-only check ("ends in
  // Constellation Dev") would also accept a path nested inside the installed
  // state root; `home` is injected only so tests can point this at a
  // fixture home directory instead of the real one.
  if (destination !== devStateRoot(home)) {
    throw new Error("DEV_SNAPSHOT_DESTINATION_REFUSED");
  }
  assertSingleWorkspaceLayout(source);
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
    // The endpoint written here must be the one valid at the FINAL
    // destination, even though the descriptors themselves still live under
    // the staging path at this point — the runtime resolves grants' sockets
    // from the destination, never from staging.
    repointAgentDescriptors(
      path.join(staging, "mcp", "agents"),
      localSocketPath(destination),
    );
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
  try {
    rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    // The swap above already succeeded — the destination is correct — so a
    // failure to tidy up the backup must not be reported as a fault. Naming
    // the leftover path here is the only way a maintainer would otherwise
    // learn it is still there.
    console.warn(
      `dev:snapshot: the swap succeeded, but the previous copy could not be removed from ${backup}: ${error.message}`,
    );
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
