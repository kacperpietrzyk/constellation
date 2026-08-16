import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const INSTALLED_APP_NAME = "Constellation";
export const INSTALLED_STATE_DIRECTORY = "Constellation Local Alpha";
export const DEV_STATE_DIRECTORY = "Constellation Dev";

// packages/desktop-main/src/local-mcp-runtime.ts falls back to a /tmp socket
// beyond this budget, which would move the endpoint out from under the
// descriptor a reader is holding.
const MAX_PORTABLE_UNIX_SOCKET_BYTES = 96;

const applicationSupport = (home) =>
  path.join(home, "Library", "Application Support");

export const installedStateRoot = (home = os.homedir()) =>
  path.join(applicationSupport(home), INSTALLED_STATE_DIRECTORY);

export const devStateRoot = (home = os.homedir()) =>
  path.join(applicationSupport(home), DEV_STATE_DIRECTORY);

export const localSocketPath = (stateRoot) =>
  path.posix.join(stateRoot, "mcp", "application.sock");

export const socketPathFits = (stateRoot) =>
  Buffer.byteLength(localSocketPath(stateRoot)) <=
  MAX_PORTABLE_UNIX_SOCKET_BYTES;

// The live socket is deliberately absent: a copied socket file is dead, and the
// development runtime binds its own.
export const SNAPSHOT_ENTRIES = Object.freeze([
  "local-alpha-workspace",
  "workspace-registry.json",
  "device",
  path.join("mcp", "agents"),
  "jamie",
]);

export const agentDescriptors = (stateRoot) => {
  const directory = path.join(stateRoot, "mcp", "agents");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => path.join(directory, entry));
};
