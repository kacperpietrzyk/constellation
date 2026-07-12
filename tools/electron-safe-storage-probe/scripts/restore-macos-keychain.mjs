import { spawnSync } from "node:child_process";
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

const keychainPath = path.join(
  process.env.RUNNER_TEMP,
  "constellation-safe-storage-probe.keychain-db",
);
const restorePath = path.join(
  process.env.RUNNER_TEMP,
  "constellation-safe-storage-keychain-restore.json",
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
    value?.format !== "constellation.safe-storage-keychain-restore/v1" ||
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
