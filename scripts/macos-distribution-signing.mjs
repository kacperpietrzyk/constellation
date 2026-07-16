import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { notarize } from "@electron/notarize";
import { sign } from "@electron/osx-sign";

const runSecurity = (args) =>
  spawnSync("security", args, { encoding: "utf8", timeout: 120_000 });

const requireSuccessfulSecurityCommand = (result, errorCode) => {
  if (result.status !== 0) throw new Error(errorCode);
  return result;
};

const parseKeychainSearchList = (stdout) =>
  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith('"') && line.endsWith('"') ? line.slice(1, -1) : line,
    );

export const resolveNotarizationOptions = (appPath, env) => {
  if (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) {
    return {
      appPath,
      appleApiKey: env.APPLE_API_KEY,
      appleApiKeyId: env.APPLE_API_KEY_ID,
      appleApiIssuer: env.APPLE_API_ISSUER,
    };
  }
  if (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) {
    return {
      appPath,
      appleId: env.APPLE_ID,
      appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: env.APPLE_TEAM_ID,
    };
  }
  if (env.APPLE_KEYCHAIN && env.APPLE_KEYCHAIN_PROFILE) {
    return {
      appPath,
      keychain: env.APPLE_KEYCHAIN,
      keychainProfile: env.APPLE_KEYCHAIN_PROFILE,
    };
  }
  throw new Error("MACOS_NOTARIZATION_CREDENTIALS_REQUIRED");
};

const writePkcs12 = (cscLink, destination) => {
  if (cscLink.startsWith("file://")) {
    fs.copyFileSync(fileURLToPath(cscLink), destination);
    return;
  }
  if (path.isAbsolute(cscLink) && fs.existsSync(cscLink)) {
    fs.copyFileSync(cscLink, destination);
    return;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cscLink)) {
    throw new Error("MACOS_CODE_SIGNING_CERTIFICATE_INVALID");
  }
  const decoded = Buffer.from(cscLink, "base64");
  if (decoded.length === 0) {
    throw new Error("MACOS_CODE_SIGNING_CERTIFICATE_INVALID");
  }
  fs.writeFileSync(destination, decoded, { mode: 0o600 });
};

const findDeveloperIdIdentity = (stdout) => {
  const identities = [...stdout.matchAll(/^\s*\d+\)\s+[0-9A-F]+\s+"([^"]+)"/gm)]
    .map((match) => match[1])
    .filter((identity) => identity.startsWith("Developer ID Application:"));
  if (identities.length !== 1) {
    throw new Error("MACOS_DEVELOPER_IDENTITY_AMBIGUOUS");
  }
  return identities[0];
};

export const signAndNotarizeMacApp = async ({
  appPath,
  cscLink,
  cscPassword,
  env = process.env,
  securityRunner = runSecurity,
  signer = sign,
  notarizer = notarize,
}) => {
  if (!appPath || !cscLink || !cscPassword) {
    throw new Error("PRODUCTION_CODE_SIGNING_CREDENTIALS_REQUIRED");
  }

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "constellation-signing-"),
  );
  const certificatePath = path.join(temporaryRoot, "developer-id.p12");
  const keychainPath = path.join(temporaryRoot, "release.keychain-db");
  const keychainPassword = crypto.randomBytes(32).toString("hex");
  let keychainCreated = false;
  let keychainSearchListChanged = false;
  let originalKeychainSearchList = [];

  try {
    writePkcs12(cscLink, certificatePath);
    originalKeychainSearchList = parseKeychainSearchList(
      requireSuccessfulSecurityCommand(
        securityRunner(["list-keychains", "-d", "user"]),
        "MACOS_SIGNING_KEYCHAIN_LIST_FAILED",
      ).stdout,
    );
    requireSuccessfulSecurityCommand(
      securityRunner(["create-keychain", "-p", keychainPassword, keychainPath]),
      "MACOS_SIGNING_KEYCHAIN_CREATE_FAILED",
    );
    keychainCreated = true;
    requireSuccessfulSecurityCommand(
      securityRunner(["unlock-keychain", "-p", keychainPassword, keychainPath]),
      "MACOS_SIGNING_KEYCHAIN_UNLOCK_FAILED",
    );
    requireSuccessfulSecurityCommand(
      securityRunner(["set-keychain-settings", keychainPath]),
      "MACOS_SIGNING_KEYCHAIN_SETTINGS_FAILED",
    );
    requireSuccessfulSecurityCommand(
      securityRunner([
        "list-keychains",
        "-d",
        "user",
        "-s",
        keychainPath,
        ...originalKeychainSearchList,
      ]),
      "MACOS_SIGNING_KEYCHAIN_SEARCH_LIST_FAILED",
    );
    keychainSearchListChanged = true;
    requireSuccessfulSecurityCommand(
      securityRunner([
        "import",
        certificatePath,
        "-k",
        keychainPath,
        "-P",
        cscPassword,
        "-T",
        "/usr/bin/codesign",
      ]),
      "MACOS_SIGNING_CERTIFICATE_IMPORT_FAILED",
    );
    requireSuccessfulSecurityCommand(
      securityRunner([
        "set-key-partition-list",
        "-S",
        "apple-tool:,apple:",
        "-s",
        "-k",
        keychainPassword,
        keychainPath,
      ]),
      "MACOS_SIGNING_KEY_ACCESS_FAILED",
    );
    const identityResult = requireSuccessfulSecurityCommand(
      securityRunner([
        "find-identity",
        "-v",
        "-p",
        "codesigning",
        keychainPath,
      ]),
      "MACOS_SIGNING_IDENTITY_LOOKUP_FAILED",
    );
    const identity = findDeveloperIdIdentity(identityResult.stdout);

    await signer({
      app: appPath,
      identity,
      keychain: keychainPath,
      platform: "darwin",
    });
    await notarizer(resolveNotarizationOptions(appPath, env));
  } finally {
    if (keychainSearchListChanged) {
      securityRunner([
        "list-keychains",
        "-d",
        "user",
        "-s",
        ...originalKeychainSearchList,
      ]);
    }
    if (keychainCreated) securityRunner(["delete-keychain", keychainPath]);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};
