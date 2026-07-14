import fs from "node:fs";
import path from "node:path";

const restoreFileName = "constellation-local-alpha-keychain-restore.json";

export function evaluatePackagedCredentialStorePolicy({
  platform,
  env,
  markerExists = fs.existsSync,
}) {
  if (platform !== "darwin") return { allowed: true, mode: "platform-native" };

  const hostedRunner =
    env.GITHUB_ACTIONS === "true" &&
    env.RUNNER_ENVIRONMENT === "github-hosted" &&
    typeof env.RUNNER_TEMP === "string" &&
    path.isAbsolute(env.RUNNER_TEMP);
  const explicitLocalTest =
    env.CONSTELLATION_ALLOW_LOCAL_KEYCHAIN_TEST === "true" &&
    typeof env.CONSTELLATION_KEYCHAIN_TEST_ROOT === "string" &&
    path.isAbsolute(env.CONSTELLATION_KEYCHAIN_TEST_ROOT);

  if (!hostedRunner && !explicitLocalTest) {
    return { allowed: false, reason: "explicit-isolated-keychain-required" };
  }

  const root = hostedRunner
    ? env.RUNNER_TEMP
    : env.CONSTELLATION_KEYCHAIN_TEST_ROOT;
  const restoreMarker = path.join(root, restoreFileName);
  if (!markerExists(restoreMarker)) {
    return {
      allowed: false,
      reason: "disposable-keychain-not-prepared",
      restoreMarker,
    };
  }

  return {
    allowed: true,
    mode: hostedRunner ? "github-hosted" : "explicit-local",
    restoreMarker,
  };
}

export function assertPackagedCredentialStoreTestAllowed({
  platform = process.platform,
  env = process.env,
  markerExists = fs.existsSync,
} = {}) {
  const policy = evaluatePackagedCredentialStorePolicy({
    platform,
    env,
    markerExists,
  });
  if (policy.allowed) return policy;

  const remediation =
    policy.reason === "disposable-keychain-not-prepared"
      ? "Run scripts/desktop/prepare-ci-macos-keychain.mjs first and always restore it with scripts/desktop/restore-ci-macos-keychain.mjs."
      : "Use npm run check for unattended local work. Run packaged macOS tests in CI, or explicitly opt into the documented disposable-Keychain flow.";
  throw new Error(
    `LOCAL_PACKAGED_KEYCHAIN_TEST_BLOCKED: packaged macOS tests start Electron safeStorage and may show an interactive Keychain prompt. ${remediation}`,
  );
}
