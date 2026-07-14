import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const hostedRunner =
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_ENVIRONMENT === "github-hosted" &&
  typeof process.env.RUNNER_TEMP === "string" &&
  path.isAbsolute(process.env.RUNNER_TEMP);
const explicitLocalRoot = process.env.CONSTELLATION_KEYCHAIN_TEST_ROOT;
const explicitLocalTest =
  process.env.CONSTELLATION_ALLOW_LOCAL_KEYCHAIN_TEST === "true" &&
  typeof explicitLocalRoot === "string" &&
  path.isAbsolute(explicitLocalRoot);
if (process.platform !== "darwin" || (!hostedRunner && !explicitLocalTest)) {
  throw new Error("ISOLATED_MACOS_KEYCHAIN_REQUIRED");
}

const temporaryRoot = hostedRunner
  ? process.env.RUNNER_TEMP
  : explicitLocalRoot;

const keychainPath = path.join(
  temporaryRoot,
  "constellation-local-alpha.keychain-db",
);
const restorePath = path.join(
  temporaryRoot,
  "constellation-local-alpha-keychain-restore.json",
);

function security(args) {
  const result = spawnSync("/usr/bin/security", args, {
    stdio: "ignore",
    timeout: 10_000,
  });
  if (result.status !== 0) throw new Error("KEYCHAIN_COMMAND_FAILED");
}

function readRestoreState() {
  if (!fs.existsSync(restorePath)) return undefined;
  let value;
  try {
    value = JSON.parse(fs.readFileSync(restorePath, "utf8"));
  } catch {
    throw new Error("KEYCHAIN_STATE_INVALID");
  }
  if (
    value?.format !== "constellation.packaged-store-keychain-restore/v1" ||
    typeof value.defaultKeychain !== "string" ||
    !path.isAbsolute(value.defaultKeychain) ||
    !Array.isArray(value.searchList) ||
    value.searchList.length === 0 ||
    value.searchList.some(
      (entry) => typeof entry !== "string" || !path.isAbsolute(entry),
    )
  ) {
    throw new Error("KEYCHAIN_STATE_INVALID");
  }
  return value;
}

const state = readRestoreState();
if (!state) {
  if (fs.existsSync(keychainPath)) throw new Error("KEYCHAIN_STATE_INVALID");
} else {
  security(["default-keychain", "-d", "user", "-s", state.defaultKeychain]);
  security(["list-keychains", "-d", "user", "-s", ...state.searchList]);
  if (fs.existsSync(keychainPath)) security(["delete-keychain", keychainPath]);
  fs.rmSync(restorePath, { force: true });
}
process.stdout.write(
  `${JSON.stringify({ status: "clean", disposableKeychain: true })}\n`,
);
