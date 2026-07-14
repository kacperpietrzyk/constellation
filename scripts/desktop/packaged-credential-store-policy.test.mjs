import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePackagedCredentialStorePolicy } from "./packaged-credential-store-policy.mjs";

const evaluate = (platform, env, markerExists = () => false) =>
  evaluatePackagedCredentialStorePolicy({ platform, env, markerExists });

test("allows packaged credential-store tests on non-macOS platforms", () => {
  assert.deepEqual(evaluate("win32", {}), {
    allowed: true,
    mode: "platform-native",
  });
});

test("blocks unattended local macOS packaged tests before Electron starts", () => {
  assert.deepEqual(evaluate("darwin", {}), {
    allowed: false,
    reason: "explicit-isolated-keychain-required",
  });
});

test("requires an absolute disposable-Keychain root for local opt-in", () => {
  assert.deepEqual(
    evaluate("darwin", {
      CONSTELLATION_ALLOW_LOCAL_KEYCHAIN_TEST: "true",
      CONSTELLATION_KEYCHAIN_TEST_ROOT: "relative-root",
    }),
    {
      allowed: false,
      reason: "explicit-isolated-keychain-required",
    },
  );
});

test("requires the disposable Keychain to be prepared before a local test", () => {
  const policy = evaluate("darwin", {
    CONSTELLATION_ALLOW_LOCAL_KEYCHAIN_TEST: "true",
    CONSTELLATION_KEYCHAIN_TEST_ROOT: "/tmp/constellation-keychain-test",
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, "disposable-keychain-not-prepared");
});

test("allows an explicitly prepared local disposable Keychain", () => {
  const policy = evaluate(
    "darwin",
    {
      CONSTELLATION_ALLOW_LOCAL_KEYCHAIN_TEST: "true",
      CONSTELLATION_KEYCHAIN_TEST_ROOT: "/tmp/constellation-keychain-test",
    },
    () => true,
  );
  assert.equal(policy.allowed, true);
  assert.equal(policy.mode, "explicit-local");
});

test("allows a prepared GitHub-hosted macOS runner", () => {
  const policy = evaluate(
    "darwin",
    {
      GITHUB_ACTIONS: "true",
      RUNNER_ENVIRONMENT: "github-hosted",
      RUNNER_TEMP: "/tmp/github-runner",
    },
    () => true,
  );
  assert.equal(policy.allowed, true);
  assert.equal(policy.mode, "github-hosted");
});

test("does not trust an unprepared hosted runner", () => {
  const policy = evaluate("darwin", {
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_TEMP: "/tmp/github-runner",
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, "disposable-keychain-not-prepared");
});
