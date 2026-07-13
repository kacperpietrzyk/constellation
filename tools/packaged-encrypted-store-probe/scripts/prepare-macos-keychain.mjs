import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

if (
  process.platform !== "darwin" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RUNNER_ENVIRONMENT !== "github-hosted" ||
  !process.env.RUNNER_TEMP ||
  !path.isAbsolute(process.env.RUNNER_TEMP)
) {
  throw new Error("CI_MACOS_KEYCHAIN_REQUIRED");
}

const temporaryRoot = process.env.RUNNER_TEMP;
const keychainPath = path.join(
  temporaryRoot,
  "constellation-packaged-store-probe.keychain-db",
);
const restorePath = path.join(
  temporaryRoot,
  "constellation-packaged-store-keychain-restore.json",
);

function security(args, capture = false) {
  const result = spawnSync("/usr/bin/security", args, {
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "ignore"] : "ignore",
    timeout: 10_000,
  });
  if (result.status !== 0) throw new Error("KEYCHAIN_COMMAND_FAILED");
  return capture ? result.stdout : "";
}

function parseKeychainPaths(output) {
  const values = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error("KEYCHAIN_STATE_INVALID");
      }
    });
  if (
    values.length === 0 ||
    values.some((value) => typeof value !== "string" || !path.isAbsolute(value))
  ) {
    throw new Error("KEYCHAIN_STATE_INVALID");
  }
  return values;
}

if (fs.existsSync(keychainPath) || fs.existsSync(restorePath)) {
  throw new Error("KEYCHAIN_PROBE_STATE_EXISTS");
}

const defaultKeychains = parseKeychainPaths(
  security(["default-keychain", "-d", "user"], true),
);
if (defaultKeychains.length !== 1) throw new Error("KEYCHAIN_STATE_INVALID");
const defaultKeychain = defaultKeychains[0];
const searchList = parseKeychainPaths(
  security(["list-keychains", "-d", "user"], true),
);
if (searchList.includes(keychainPath)) {
  throw new Error("KEYCHAIN_PROBE_STATE_EXISTS");
}
const restoreState = Buffer.from(
  `${JSON.stringify({
    format: "constellation.packaged-store-keychain-restore/v1",
    defaultKeychain,
    searchList,
  })}\n`,
  "utf8",
);
fs.writeFileSync(restorePath, restoreState, { flag: "wx", mode: 0o600 });
restoreState.fill(0);

const passwordBytes = crypto.randomBytes(32);
const password = passwordBytes.toString("hex");
passwordBytes.fill(0);

// The workflow's always-run restore step consumes the saved state even when a
// setup command fails, so a partial configuration is never cleaned blindly.
security(["create-keychain", "-p", password, keychainPath]);
security(["set-keychain-settings", "-lut", "21600", keychainPath]);
security(["unlock-keychain", "-p", password, keychainPath]);
security(["list-keychains", "-d", "user", "-s", keychainPath, ...searchList]);
security(["default-keychain", "-d", "user", "-s", keychainPath]);

process.stdout.write(
  `${JSON.stringify({ status: "pass", disposableKeychain: true })}\n`,
);
