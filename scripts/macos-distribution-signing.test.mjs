import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveNotarizationOptions,
  signAndNotarizeMacApp,
} from "./macos-distribution-signing.mjs";

test("resolves App Store Connect API-key notarization", () => {
  assert.deepEqual(
    resolveNotarizationOptions("/tmp/Constellation.app", {
      APPLE_API_KEY: "/tmp/AuthKey.p8",
      APPLE_API_KEY_ID: "KEY123",
      APPLE_API_ISSUER: "issuer-id",
    }),
    {
      appPath: "/tmp/Constellation.app",
      appleApiKey: "/tmp/AuthKey.p8",
      appleApiKeyId: "KEY123",
      appleApiIssuer: "issuer-id",
    },
  );
});

test("imports one Developer ID identity before signing and notarizing", async () => {
  const securityCalls = [];
  const lifecycle = [];
  const securityRunner = (args) => {
    securityCalls.push(args);
    if (args[0] === "list-keychains" && !args.includes("-s")) {
      return {
        status: 0,
        stdout: '    "/Users/runner/Library/Keychains/login.keychain-db"\n',
      };
    }
    if (args[0] === "find-identity") {
      return {
        status: 0,
        stdout:
          '  1) ABCDEF123456 "Developer ID Application: Example (TEAM123456)"\n',
      };
    }
    return { status: 0, stdout: "" };
  };

  await signAndNotarizeMacApp({
    appPath: "/tmp/Constellation.app",
    cscLink: Buffer.from("test-pkcs12").toString("base64"),
    cscPassword: "secret",
    env: {
      APPLE_API_KEY: "/tmp/AuthKey.p8",
      APPLE_API_KEY_ID: "KEY123",
      APPLE_API_ISSUER: "issuer-id",
    },
    securityRunner,
    signer: async (options) => lifecycle.push(["sign", options]),
    notarizer: async (options) => lifecycle.push(["notarize", options]),
  });

  assert.deepEqual(
    securityCalls.map((args) => args[0]),
    [
      "list-keychains",
      "create-keychain",
      "unlock-keychain",
      "set-keychain-settings",
      "list-keychains",
      "import",
      "set-key-partition-list",
      "find-identity",
      "list-keychains",
      "delete-keychain",
    ],
  );
  const searchListUpdates = securityCalls.filter(
    (args) => args[0] === "list-keychains" && args.includes("-s"),
  );
  assert.equal(searchListUpdates.length, 2);
  assert.match(searchListUpdates[0][4], /release\.keychain-db$/);
  assert.equal(
    searchListUpdates[0][5],
    "/Users/runner/Library/Keychains/login.keychain-db",
  );
  assert.deepEqual(searchListUpdates[1], [
    "list-keychains",
    "-d",
    "user",
    "-s",
    "/Users/runner/Library/Keychains/login.keychain-db",
  ]);
  assert.equal(lifecycle[0][0], "sign");
  assert.equal(
    lifecycle[0][1].identity,
    "Developer ID Application: Example (TEAM123456)",
  );
  assert.equal(lifecycle[0][1].platform, "darwin");
  assert.equal(lifecycle[1][0], "notarize");
  assert.equal(lifecycle[1][1].appPath, "/tmp/Constellation.app");
});

test("fails closed without one Developer ID identity", async () => {
  await assert.rejects(
    signAndNotarizeMacApp({
      appPath: "/tmp/Constellation.app",
      cscLink: Buffer.from("test-pkcs12").toString("base64"),
      cscPassword: "secret",
      securityRunner: (args) => ({
        status: 0,
        stdout:
          args[0] === "list-keychains" && !args.includes("-s")
            ? '    "/Users/runner/Library/Keychains/login.keychain-db"\n'
            : args[0] === "find-identity"
              ? '  1) ABCDEF123456 "Apple Development: Example (TEAM123456)"\n'
              : "",
      }),
      signer: async () => {},
      notarizer: async () => {},
    }),
    /MACOS_DEVELOPER_IDENTITY_AMBIGUOUS/,
  );
});
