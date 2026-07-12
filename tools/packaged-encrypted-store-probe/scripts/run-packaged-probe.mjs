import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appName = "Constellation Packaged Store Probe";
const keychainService = `${appName} Safe Storage`;
const keychainAccount = `${appName} Key`;
const packageRoot = path.join(
  root,
  "out",
  `${appName}-${process.platform}-x64`,
);
const executable =
  process.platform === "darwin"
    ? path.join(packageRoot, `${appName}.app`, "Contents", "MacOS", appName)
    : path.join(packageRoot, `${appName}.exe`);
const resourcesRoot =
  process.platform === "darwin"
    ? path.join(packageRoot, `${appName}.app`, "Contents", "Resources")
    : path.join(packageRoot, "resources");
const appArchive = path.join(resourcesRoot, "app.asar");
const nativeAddon = path.join(
  resourcesRoot,
  "app.asar.unpacked",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);
const temporaryRoot = process.env.RUNNER_TEMP || os.tmpdir();
const stateRoot = fs.mkdtempSync(
  path.join(temporaryRoot, "constellation-packaged-store-probe-"),
);
const profile = path.join(stateRoot, "profile");
const workspace = "workspace-alpha";
const primaryWrapper = "primary.wrap.json";
const primaryDatabase = "primary.db";
const primaryWrapperPath = path.join(stateRoot, primaryWrapper);
const primaryDatabasePath = path.join(stateRoot, primaryDatabase);
const shutdownAuthorizationType =
  "constellation.packaged-store-probe.shutdown/v1";
const exitAuthorizationType = "constellation.packaged-store-probe.exit/v1";
const shutdownAckType =
  "constellation.packaged-store-probe.shutdown-accepted/v1";
const shutdownReadyType =
  "constellation.packaged-store-probe.shutdown-ready/v1";
const exitAckType = "constellation.packaged-store-probe.exit-accepted/v1";
const shutdownCompleteType =
  "constellation.packaged-store-probe.shutdown-complete/v1";
const processIds = new Set();
let electronManagedProcessExits = 0;
let forcedProcessExits = 0;
let acknowledgedShutdowns = 0;
let acknowledgedExitAuthorizations = 0;
let terminallyConfirmedShutdowns = 0;
let windowsPostQuitProviderFaultRejected = false;
let windowsProviderStateDigest;
const captured = [];
const forbiddenOutput = [
  Buffer.from('"keyMaterial"'),
  Buffer.from('"ciphertext"'),
  Buffer.from("constellation.packaged-store-key-payload/v1"),
];
const fixedResultKeys = [
  "architecture",
  "code",
  "declaredExitCode",
  "electron",
  "nativeAddonPackaged",
  "packaged",
  "phase",
  "platform",
  "processId",
  "readyForShutdown",
  "status",
];

function ensure(condition, code) {
  if (!condition) throw new Error(code);
}

function digestFile(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest();
}

function sameDigest(left, right) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function readWindowsProviderStateDigest(profileRoot = profile) {
  if (process.platform !== "win32") return undefined;
  const localStatePath = path.join(profileRoot, "Local State");
  ensure(fs.existsSync(localStatePath), "WINDOWS_PROVIDER_STATE_INVALID");
  const metadata = fs.lstatSync(localStatePath);
  ensure(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      metadata.size > 0 &&
      metadata.size <= 1024 * 1024,
    "WINDOWS_PROVIDER_STATE_INVALID",
  );

  const contents = fs.readFileSync(localStatePath);
  let decoded;
  try {
    let localState;
    try {
      localState = JSON.parse(contents.toString("utf8"));
    } catch {
      throw new Error("WINDOWS_PROVIDER_STATE_INVALID");
    }
    const encryptedKey = localState?.os_crypt?.encrypted_key;
    ensure(
      typeof encryptedKey === "string" && encryptedKey.length > 0,
      "WINDOWS_PROVIDER_KEY_MISSING",
    );
    decoded = Buffer.from(encryptedKey, "base64");
    ensure(
      decoded.toString("base64") === encryptedKey &&
        decoded.length > 5 &&
        decoded.subarray(0, 5).toString("ascii") === "DPAPI",
      "WINDOWS_PROVIDER_KEY_INVALID",
    );
    return crypto.createHash("sha256").update(decoded).digest();
  } finally {
    decoded?.fill(0);
    contents.fill(0);
  }
}

function assertWindowsProviderStateUnchanged(expected) {
  if (process.platform !== "win32") return;
  ensure(Buffer.isBuffer(expected), "WINDOWS_PROVIDER_STATE_MISSING");
  const actual = readWindowsProviderStateDigest();
  try {
    ensure(sameDigest(actual, expected), "WINDOWS_PROVIDER_STATE_CHANGED");
  } finally {
    actual.fill(0);
  }
}

function assertExactResultKeys(result, extraKeys = []) {
  const actual = Object.keys(result).sort();
  const expected = [...fixedResultKeys, ...extraKeys].sort();
  ensure(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    "CHILD_RESULT_SHAPE_INVALID",
  );
}

function inspectOutput(contents) {
  ensure(contents.length <= 64 * 1024, "OUTPUT_TOO_LARGE");
  for (const forbidden of forbiddenOutput) {
    ensure(!contents.includes(forbidden), "SENSITIVE_OUTPUT_SHAPE");
  }
  captured.push(contents);
}

function hasShutdownFields(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.hasOwn(value, "readyForShutdown") ||
      Object.hasOwn(value, "declaredExitCode"))
  );
}

function isReadyShutdownEnvelope(value) {
  return (
    hasShutdownFields(value) &&
    value.readyForShutdown === true &&
    (value.status === "pass" || value.status === "fail") &&
    typeof value.code === "string" &&
    Number.isInteger(value.declaredExitCode) &&
    value.declaredExitCode >= 0 &&
    value.declaredExitCode <= 255 &&
    ((value.status === "pass" && value.declaredExitCode === 0) ||
      (value.status === "fail" && value.declaredExitCode !== 0))
  );
}

function parseFixedResult(stdout) {
  const candidates = [];
  const lines = stdout.toString("utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (hasShutdownFields(value)) candidates.push(value);
    } catch {
      // Invalid non-protocol diagnostics are ignored here and rejected by the
      // incremental scanner if they claim shutdown fields.
    }
  }
  ensure(candidates.length === 1, "FIXED_RESULT_COUNT_INVALID");
  ensure(isReadyShutdownEnvelope(candidates[0]), "FIXED_RESULT_INVALID");
  return candidates[0];
}

function terminateTree(child) {
  if (!child.pid) return false;
  if (process.platform === "win32") {
    const result = spawnSync(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        windowsHide: true,
        stdio: "ignore",
        timeout: 5_000,
      },
    );
    return result.status === 0;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
    return true;
  } catch {
    try {
      return child.kill("SIGKILL");
    } catch {
      return false;
    }
  }
}

async function launch({
  mode,
  workspaceId,
  wrapperName,
  databaseName,
  probeStateRoot = stateRoot,
}) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const probeProfile = path.join(probeStateRoot, "profile");
  const argumentsForProbe = [
    `--user-data-dir=${probeProfile}`,
    `--probe-mode=${mode}`,
    `--probe-state-root=${probeStateRoot}`,
    `--probe-workspace=${workspaceId}`,
    `--probe-wrapper=${wrapperName}`,
    `--probe-database=${databaseName}`,
  ];

  return await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, argumentsForProbe, {
        detached: process.platform !== "win32",
        env: environment,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
      });
    } catch {
      reject(new Error("PACKAGED_LAUNCH_FAILED"));
      return;
    }

    const stdout = [];
    const stderr = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let settled = false;
    let timer;
    let hardCleanupTimer;
    let cleanupRetryTimer;
    let forcedTerminationRecheckTimer;
    let electronShutdownTimer;
    let helperCleanupTimer;
    let postExitTimer;
    let timedOut = false;
    let parentSupervisionStarted = false;
    let shutdownAuthorizationQueued = false;
    let shutdownAuthorizationSendStatus = "not-started";
    let exitAuthorizationQueued = false;
    let exitAuthorizationSendStatus = "not-started";
    let exitAuthorizationAcknowledged = false;
    let exitAuthorizationAckCount = 0;
    let shutdownAcknowledged = false;
    let shutdownAckCount = 0;
    let shutdownTransportReady = false;
    let shutdownReadyCount = 0;
    let shutdownTerminalConfirmed = false;
    let shutdownTerminalCount = 0;
    let shutdownInternalExitCode;
    let forcedTerminationRequested = false;
    let forcedTerminationAccepted = false;
    let shutdownRequestedWhileAlive = false;
    let electronExitObserved = false;
    let readyResult;
    let protocolError;
    let protocolResultCount = 0;
    let protocolLineStart = 0;
    let protocolScanOffset = 0;
    let hardCleanupStarted = false;
    let mainProcessExited = false;
    let mainExitCode;
    let mainExitSignal;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (hardCleanupTimer) clearTimeout(hardCleanupTimer);
      if (cleanupRetryTimer) clearTimeout(cleanupRetryTimer);
      if (forcedTerminationRecheckTimer) {
        clearTimeout(forcedTerminationRecheckTimer);
      }
      if (electronShutdownTimer) clearTimeout(electronShutdownTimer);
      if (helperCleanupTimer) clearTimeout(helperCleanupTimer);
      if (postExitTimer) clearTimeout(postExitTimer);
      callback();
    };
    const collect = (target, chunk, isStdout) => {
      const buffer = Buffer.from(chunk);
      target.push(buffer);
      if (isStdout) stdoutLength += buffer.length;
      else stderrLength += buffer.length;
      if (stdoutLength > 64 * 1024 || stderrLength > 64 * 1024) {
        terminateTree(child);
      }
      if (isStdout) scanProtocolLines();
    };
    const complete = (code, signal) =>
      finish(() => {
        try {
          const stdoutBuffer = Buffer.concat(stdout, stdoutLength);
          const stderrBuffer = Buffer.concat(stderr, stderrLength);
          inspectOutput(stdoutBuffer);
          inspectOutput(stderrBuffer);
          if (timedOut) {
            let childCode = "NO_FIXED_RESULT";
            try {
              childCode = parseFixedResult(stdoutBuffer).code;
            } catch {
              // The bounded timeout marker is sufficient without child output.
            }
            reject(
              new Error(
                `PACKAGED_LAUNCH_TIMEOUT:${mode}:${wrapperName}:${databaseName}:${childCode}`,
              ),
            );
          } else {
            const result = parseFixedResult(stdoutBuffer);
            if (
              !shutdownAcknowledged &&
              shutdownAuthorizationSendStatus !== "succeeded"
            ) {
              protocolError ||=
                shutdownAuthorizationSendStatus === "failed"
                  ? "SHUTDOWN_AUTHORIZATION_REJECTED"
                  : "SHUTDOWN_AUTHORIZATION_UNCONFIRMED";
            }
            if (
              !shutdownTerminalConfirmed &&
              !exitAuthorizationAcknowledged &&
              exitAuthorizationSendStatus !== "succeeded"
            ) {
              protocolError ||=
                exitAuthorizationSendStatus === "failed"
                  ? "EXIT_AUTHORIZATION_REJECTED"
                  : "EXIT_AUTHORIZATION_UNCONFIRMED";
            }
            ensure(!protocolError, protocolError);
            ensure(protocolResultCount === 1, "PROTOCOL_RESULT_COUNT_INVALID");
            ensure(
              parentSupervisionStarted &&
                shutdownAuthorizationQueued &&
                exitAuthorizationQueued,
              "PARENT_SHUTDOWN_PROTOCOL_MISSING",
            );
            ensure(shutdownAcknowledged, "CHILD_SHUTDOWN_ACK_MISSING");
            ensure(shutdownAckCount === 1, "CHILD_SHUTDOWN_ACK_COUNT_INVALID");
            ensure(shutdownTransportReady, "CHILD_SHUTDOWN_READY_MISSING");
            ensure(
              shutdownReadyCount === 1,
              "CHILD_SHUTDOWN_READY_COUNT_INVALID",
            );
            ensure(
              exitAuthorizationAcknowledged,
              "CHILD_EXIT_AUTHORIZATION_ACK_MISSING",
            );
            ensure(
              exitAuthorizationAckCount === 1,
              "CHILD_EXIT_AUTHORIZATION_ACK_COUNT_INVALID",
            );
            ensure(
              shutdownRequestedWhileAlive,
              "PARENT_SHUTDOWN_LIVENESS_MISSING",
            );
            ensure(
              readyResult &&
                JSON.stringify(result) === JSON.stringify(readyResult),
              "PROTOCOL_RESULT_CHANGED",
            );
            ensure(
              code !== null || signal !== null,
              "ACTUAL_TERMINATION_STATUS_MISSING",
            );
            ensure(
              electronExitObserved ||
                (forcedTerminationRequested && forcedTerminationAccepted),
              "TERMINATION_OUTCOME_UNVERIFIED",
            );
            if (electronExitObserved) {
              const expectedCode = process.platform === "win32" ? 1 : 0;
              ensure(
                shutdownTerminalConfirmed &&
                  shutdownTerminalCount === 1 &&
                  shutdownInternalExitCode === 0,
                "CHILD_SHUTDOWN_COMPLETION_MISSING",
              );
              const codeLabel = Number.isInteger(code)
                ? String(code)
                : code === null
                  ? "null"
                  : typeof code;
              const signalLabel =
                typeof signal === "string"
                  ? signal
                  : signal === null
                    ? "null"
                    : typeof signal;
              ensure(
                code === expectedCode && signal === null,
                `ELECTRON_SHUTDOWN_STATUS_INVALID:${codeLabel}:${signalLabel}`,
              );
              if (process.platform === "win32") {
                const providerStateDigest =
                  readWindowsProviderStateDigest(probeProfile);
                providerStateDigest.fill(0);
              }
            } else {
              ensure(
                shutdownTerminalCount === 0,
                "FORCED_SHUTDOWN_COMPLETION_INVALID",
              );
              ensure(
                process.platform !== "win32",
                "WINDOWS_ELECTRON_EXIT_REQUIRED",
              );
            }
            resolve({
              declaredExitCode: result.declaredExitCode,
              lifecycle: electronExitObserved
                ? "electron-quit-after-parent-authorization"
                : "forced-after-parent-authorization",
              actualCode: code,
              actualSignal: signal,
              parentSupervisionStarted,
              shutdownAuthorizationQueued,
              exitAuthorizationQueued,
              exitAuthorizationAcknowledged,
              shutdownAcknowledged,
              shutdownTransportReady,
              shutdownTerminalConfirmed,
              shutdownInternalExitCode,
              forcedTerminationRequested,
              forcedTerminationAccepted,
              shutdownRequestedWhileAlive,
              electronExitObserved,
              childPid: child.pid,
              result,
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    const failUnverifiedHelperCleanup = () => {
      finish(() =>
        reject(
          new Error(
            timedOut
              ? `PACKAGED_TERMINATION_TIMEOUT:${mode}:${wrapperName}:${databaseName}`
              : `${protocolError || "PACKAGED_HELPER_CLEANUP_UNVERIFIED"}:${mode}:${wrapperName}:${databaseName}`,
          ),
        ),
      );
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const startHardCleanup = (reason) => {
      protocolError ||= reason;
      if (settled || hardCleanupStarted) return;
      hardCleanupStarted = true;
      if (helperCleanupTimer) {
        clearTimeout(helperCleanupTimer);
        helperCleanupTimer = undefined;
      }
      const retry = () => {
        if (settled) return;
        const treeTerminationAccepted = terminateTree(child);
        if (!treeTerminationAccepted) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Keep retrying until close or the hard cleanup deadline.
          }
        }
        cleanupRetryTimer = setTimeout(retry, 500);
      };
      retry();
      // Keep retrying past the child's 30-second self-kill failsafe before an
      // unverified cleanup is allowed to fail the launch.
      hardCleanupTimer = setTimeout(failUnverifiedHelperCleanup, 35_000);
    };
    const childHasExited = () =>
      mainProcessExited || child.exitCode !== null || child.signalCode !== null;
    const requestForcedTermination = () => {
      if (settled || forcedTerminationRequested || childHasExited()) return;
      forcedTerminationRequested = true;
      forcedTerminationAccepted = terminateTree(child);
      if (!forcedTerminationAccepted) {
        // The grace timer can race a natural process exit whose event has not
        // reached Node yet. A rejected force request is not a failure until a
        // short recheck proves the child is still live.
        forcedTerminationRequested = false;
        forcedTerminationRecheckTimer = setTimeout(() => {
          if (!settled && !childHasExited()) {
            startHardCleanup("PARENT_TERMINATION_REJECTED");
          }
        }, 50);
        return;
      }
      helperCleanupTimer = setTimeout(
        () => startHardCleanup("HELPER_CLOSE_TIMEOUT"),
        5_000,
      );
    };
    const requestParentShutdown = () => {
      if (settled || parentSupervisionStarted) return;
      if (
        mainProcessExited ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        protocolError ||= "CHILD_NOT_LIVE_AT_READINESS";
        return;
      }
      shutdownRequestedWhileAlive = true;
      parentSupervisionStarted = true;
      if (
        typeof child.send !== "function" ||
        !child.connected ||
        !child.channel
      ) {
        startHardCleanup("SHUTDOWN_AUTHORIZATION_UNAVAILABLE");
        return;
      }
      try {
        shutdownAuthorizationSendStatus = "pending";
        child.send(
          {
            type: shutdownAuthorizationType,
            processId: child.pid,
          },
          (error) => {
            shutdownAuthorizationSendStatus = error ? "failed" : "succeeded";
          },
        );
        shutdownAuthorizationQueued = true;
      } catch {
        startHardCleanup("SHUTDOWN_AUTHORIZATION_REJECTED");
        return;
      }
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      electronShutdownTimer = setTimeout(requestForcedTermination, 5_000);
    };
    const dispatchExitAuthorization = () => {
      if (settled || exitAuthorizationQueued || childHasExited()) return;
      if (
        typeof child.send !== "function" ||
        !child.connected ||
        !child.channel
      ) {
        protocolError ||= "EXIT_AUTHORIZATION_UNAVAILABLE";
        startHardCleanup(protocolError);
        return;
      }
      try {
        exitAuthorizationSendStatus = "pending";
        child.send(
          {
            type: exitAuthorizationType,
            processId: child.pid,
          },
          // Delivery is proved by the child's exit-acceptance or terminal
          // record. An IPC callback error can race the deliberate disconnect
          // and must not override stronger child evidence; a missing delivery
          // is bounded by the shutdown deadline.
          (error) => {
            exitAuthorizationSendStatus = error ? "failed" : "succeeded";
          },
        );
        exitAuthorizationQueued = true;
      } catch {
        protocolError ||= "EXIT_AUTHORIZATION_REJECTED";
        startHardCleanup(protocolError);
      }
    };
    const maybeDispatchExitAuthorization = () => {
      if (shutdownAcknowledged && shutdownTransportReady) {
        dispatchExitAuthorization();
      }
    };
    const acceptShutdownAcknowledgement = (value) => {
      shutdownAckCount += 1;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        protocolError ||= "SHUTDOWN_ACK_INVALID";
        startHardCleanup(protocolError);
        return;
      }
      const keys = Object.keys(value).sort();
      const expectedKeys = [
        "method",
        "processId",
        "requestedExitCode",
        "type",
      ].sort();
      if (
        shutdownAckCount !== 1 ||
        keys.length !== expectedKeys.length ||
        !keys.every((key, index) => key === expectedKeys[index]) ||
        value.processId !== child.pid ||
        value.type !== shutdownAckType ||
        value.method !== "app.quit" ||
        value.requestedExitCode !== 0 ||
        !parentSupervisionStarted ||
        !shutdownAuthorizationQueued ||
        childHasExited()
      ) {
        protocolError ||= "SHUTDOWN_ACK_INVALID";
        startHardCleanup(protocolError);
        return;
      }

      shutdownAcknowledged = true;
      maybeDispatchExitAuthorization();
    };
    const inspectProtocolLine = (line) => {
      const text = line.toString("utf8");
      const claimsShutdownAccepted = text.includes(
        "constellation.packaged-store-probe.shutdown-accepted",
      );
      const claimsShutdownReady = text.includes(
        "constellation.packaged-store-probe.shutdown-ready",
      );
      const claimsShutdownComplete = text.includes(
        "constellation.packaged-store-probe.shutdown-complete",
      );
      const claimsExitAccepted = text.includes(
        "constellation.packaged-store-probe.exit-accepted",
      );
      const claimsProtocol =
        text.includes('"readyForShutdown"') ||
        text.includes('"declaredExitCode"') ||
        claimsShutdownAccepted ||
        claimsShutdownReady ||
        claimsExitAccepted ||
        claimsShutdownComplete;
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        if (claimsProtocol) {
          protocolError ||= "PROTOCOL_RESULT_JSON_INVALID";
          startHardCleanup(protocolError);
        }
        return;
      }
      if (claimsShutdownAccepted) {
        protocolError ||= "SHUTDOWN_ACK_CHANNEL_INVALID";
        startHardCleanup(protocolError);
        return;
      }
      if (claimsShutdownReady && value?.type !== shutdownReadyType) {
        protocolError ||= "SHUTDOWN_READY_INVALID";
        startHardCleanup(protocolError);
        return;
      }
      if (claimsShutdownComplete && value?.type !== shutdownCompleteType) {
        protocolError ||= "SHUTDOWN_COMPLETION_INVALID";
        startHardCleanup(protocolError);
        return;
      }
      if (claimsExitAccepted && value?.type !== exitAckType) {
        protocolError ||= "EXIT_ACK_INVALID";
        startHardCleanup(protocolError);
        return;
      }
      if (value?.type === shutdownReadyType) {
        shutdownReadyCount += 1;
        const keys = Object.keys(value).sort();
        const expectedKeys = ["nextPhase", "processId", "type"].sort();
        if (
          shutdownReadyCount !== 1 ||
          keys.length !== expectedKeys.length ||
          !keys.every((key, index) => key === expectedKeys[index]) ||
          value.processId !== child.pid ||
          value.nextPhase !== "exit" ||
          !parentSupervisionStarted ||
          !shutdownAuthorizationQueued ||
          exitAuthorizationQueued ||
          childHasExited()
        ) {
          protocolError ||= "SHUTDOWN_READY_INVALID";
          startHardCleanup(protocolError);
        } else {
          shutdownTransportReady = true;
          maybeDispatchExitAuthorization();
        }
        return;
      }
      if (value?.type === exitAckType) {
        exitAuthorizationAckCount += 1;
        const keys = Object.keys(value).sort();
        const expectedKeys = [
          "method",
          "processId",
          "requestedExitCode",
          "type",
        ].sort();
        if (
          exitAuthorizationAckCount !== 1 ||
          keys.length !== expectedKeys.length ||
          !keys.every((key, index) => key === expectedKeys[index]) ||
          value.processId !== child.pid ||
          value.method !== "app.quit" ||
          value.requestedExitCode !== 0 ||
          !parentSupervisionStarted ||
          !shutdownAuthorizationQueued ||
          !shutdownTransportReady ||
          !exitAuthorizationQueued ||
          !shutdownAcknowledged
        ) {
          protocolError ||= "EXIT_ACK_INVALID";
          startHardCleanup(protocolError);
        } else {
          exitAuthorizationAcknowledged = true;
        }
        return;
      }
      if (value?.type === shutdownCompleteType) {
        shutdownTerminalCount += 1;
        const keys = Object.keys(value).sort();
        const expectedKeys = [
          "beforeQuitCount",
          "internalExitCode",
          "lifecycle",
          "method",
          "processId",
          "quitCount",
          "requestedExitCode",
          "type",
          "willQuitCount",
        ].sort();
        const managedLifecycle = ["before-quit", "will-quit", "quit"];
        if (
          shutdownTerminalCount !== 1 ||
          keys.length !== expectedKeys.length ||
          !keys.every((key, index) => key === expectedKeys[index]) ||
          value.processId !== child.pid ||
          value.requestedExitCode !== 0 ||
          !Number.isInteger(value.internalExitCode) ||
          value.internalExitCode < 0 ||
          value.internalExitCode > 255 ||
          !parentSupervisionStarted ||
          !shutdownAuthorizationQueued ||
          !shutdownTransportReady ||
          !exitAuthorizationQueued ||
          !exitAuthorizationAcknowledged ||
          !shutdownAcknowledged
        ) {
          protocolError ||= "SHUTDOWN_COMPLETION_INVALID";
        } else {
          shutdownInternalExitCode = value.internalExitCode;
          if (
            value.method === "app.quit" &&
            value.internalExitCode === 0 &&
            value.beforeQuitCount === 1 &&
            value.willQuitCount === 1 &&
            value.quitCount === 1 &&
            Array.isArray(value.lifecycle) &&
            value.lifecycle.length === managedLifecycle.length &&
            value.lifecycle.every(
              (event, index) => event === managedLifecycle[index],
            )
          ) {
            shutdownTerminalConfirmed = true;
          } else {
            protocolError ||= "SHUTDOWN_TERMINAL_ACK_INVALID";
          }
        }
        return;
      }
      if (!hasShutdownFields(value)) return;
      protocolResultCount += 1;
      if (protocolResultCount !== 1) {
        protocolError ||= "PROTOCOL_RESULT_DUPLICATED";
      }
      if (
        !isReadyShutdownEnvelope(value) ||
        value.processId !== child.pid ||
        value.phase !== mode ||
        value.platform !== process.platform ||
        value.architecture !== "x64" ||
        value.electron !== "43.1.0" ||
        value.packaged !== true
      ) {
        protocolError ||= "PROTOCOL_RESULT_ENVELOPE_INVALID";
      } else if (protocolResultCount === 1) {
        readyResult = value;
      }
      if (protocolError) startHardCleanup(protocolError);
      else requestParentShutdown();
    };
    const scanProtocolLines = () => {
      const contents = Buffer.concat(stdout, stdoutLength);
      try {
        let newline = contents.indexOf(0x0a, protocolScanOffset);
        while (newline !== -1) {
          let lineEnd = newline;
          if (lineEnd > protocolLineStart && contents[lineEnd - 1] === 0x0d) {
            lineEnd -= 1;
          }
          inspectProtocolLine(contents.subarray(protocolLineStart, lineEnd));
          protocolLineStart = newline + 1;
          protocolScanOffset = newline + 1;
          newline = contents.indexOf(0x0a, protocolScanOffset);
        }
        protocolScanOffset = contents.length;
      } finally {
        contents.fill(0);
      }
    };

    child.on("message", acceptShutdownAcknowledgement);
    child.stdout.on("data", (chunk) => collect(stdout, chunk, true));
    child.stderr.on("data", (chunk) => collect(stderr, chunk, false));
    child.on("error", () =>
      finish(() => reject(new Error("PACKAGED_LAUNCH_FAILED"))),
    );

    child.on("exit", (code, signal) => {
      mainProcessExited = true;
      mainExitCode = code;
      mainExitSignal = signal;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (electronShutdownTimer) {
        clearTimeout(electronShutdownTimer);
        electronShutdownTimer = undefined;
      }
      if (parentSupervisionStarted) {
        if (!forcedTerminationRequested) electronExitObserved = true;
        if (!helperCleanupTimer) {
          helperCleanupTimer = setTimeout(
            () => startHardCleanup("HELPER_CLOSE_TIMEOUT"),
            5_000,
          );
        }
        return;
      }
      // Electron helpers may inherit the main process pipes after the main
      // executable has exited. Give pending bytes a bounded drain window,
      // then finalize from the main process exit rather than misclassifying a
      // valid fixed result as a launch timeout.
      postExitTimer = setTimeout(() => {
        const cleanupVerified = terminateTree(child);
        if (!cleanupVerified) {
          startHardCleanup("POST_EXIT_TERMINATION_REJECTED");
          return;
        }
        // A successful signal request is not cleanup evidence. Wait for the
        // child close event, which confirms that both inherited output pipes
        // have closed, and fail closed if that signal never arrives.
        helperCleanupTimer = setTimeout(
          () => startHardCleanup("HELPER_CLOSE_TIMEOUT"),
          5_000,
        );
      }, 1_000);
    });
    child.on("close", (code, signal) => {
      complete(
        mainProcessExited ? mainExitCode : code,
        mainProcessExited ? mainExitSignal : signal,
      );
    });

    timer = setTimeout(() => {
      timedOut = true;
      startHardCleanup("PACKAGED_LAUNCH_TIMEOUT");
    }, 45_000);
  });
}

function assertFixedIdentity(result, childPid, mode) {
  ensure(result.packaged === true, "CHILD_NOT_PACKAGED");
  ensure(result.architecture === "x64", "CHILD_ARCH_INVALID");
  ensure(result.electron === "43.1.0", "CHILD_ELECTRON_INVALID");
  ensure(result.platform === process.platform, "CHILD_PLATFORM_INVALID");
  ensure(result.processId === childPid, "CHILD_PROCESS_ID_INVALID");
  ensure(result.phase === mode, "CHILD_PHASE_INVALID");
  ensure(result.nativeAddonPackaged === true, "NATIVE_ADDON_PATH_INVALID");
}

function assertProvider(result) {
  ensure(result.asyncEncryptionAvailable === true, "SAFE_STORAGE_INVALID");
  ensure(result.cipherVersion === "4.16.0 community", "CIPHER_INVALID");
  ensure(result.rawKeyBinding === true, "RAW_KEY_BINDING_INVALID");
  ensure(result.fts5 === true, "FTS_INVALID");
  ensure(result.loadableExtensions === false, "EXTENSION_POLICY_INVALID");
  ensure(result.plaintextScan === true, "PLAINTEXT_SCAN_INVALID");
  if (process.platform === "darwin") {
    ensure(result.provider === "commoncrypto", "PROVIDER_INVALID");
  } else {
    ensure(result.provider === "openssl", "PROVIDER_INVALID");
    ensure(
      /^OpenSSL 3\.5\.7\b/.test(result.providerVersion),
      "PROVIDER_VERSION_INVALID",
    );
  }
}

function recordProcess(execution, mode) {
  const { childPid, result } = execution;
  ensure(
    execution.lifecycle === "electron-quit-after-parent-authorization" ||
      execution.lifecycle === "forced-after-parent-authorization",
    "CHILD_LIFECYCLE_INVALID",
  );
  ensure(
    execution.parentSupervisionStarted === true &&
      execution.shutdownAuthorizationQueued === true &&
      execution.exitAuthorizationQueued === true &&
      execution.exitAuthorizationAcknowledged === true &&
      execution.shutdownAcknowledged === true &&
      execution.shutdownTransportReady === true &&
      execution.shutdownRequestedWhileAlive === true,
    "CHILD_TERMINATION_EVIDENCE_INVALID",
  );
  if (execution.lifecycle === "electron-quit-after-parent-authorization") {
    const expectedCode = process.platform === "win32" ? 1 : 0;
    ensure(
      execution.electronExitObserved === true &&
        execution.shutdownTerminalConfirmed === true &&
        execution.shutdownInternalExitCode === 0 &&
        execution.forcedTerminationRequested === false &&
        execution.actualCode === expectedCode &&
        execution.actualSignal === null,
      "CHILD_ELECTRON_EXIT_INVALID",
    );
    electronManagedProcessExits += 1;
    terminallyConfirmedShutdowns += 1;
  } else {
    ensure(
      execution.electronExitObserved === false &&
        execution.shutdownTerminalConfirmed === false &&
        execution.shutdownInternalExitCode === undefined &&
        execution.forcedTerminationRequested === true &&
        execution.forcedTerminationAccepted === true,
      "CHILD_FORCED_EXIT_INVALID",
    );
    forcedProcessExits += 1;
  }
  acknowledgedShutdowns += 1;
  acknowledgedExitAuthorizations += 1;
  ensure(
    execution.actualCode !== null || execution.actualSignal !== null,
    "CHILD_ACTUAL_TERMINATION_INVALID",
  );
  ensure(result.readyForShutdown === true, "CHILD_READINESS_INVALID");
  ensure(
    result.declaredExitCode === execution.declaredExitCode,
    "CHILD_EXIT_CODE_INVALID",
  );
  assertFixedIdentity(result, childPid, mode);
  ensure(!processIds.has(result.processId), "PROCESS_REUSED");
  processIds.add(result.processId);
}

async function expectFailure(options, acceptedCodes, expectedState) {
  const execution = await launch(options);
  ensure(execution.declaredExitCode !== 0, "NEGATIVE_PROBE_SUCCEEDED");
  ensure(execution.result.status === "fail", "NEGATIVE_RESULT_INVALID");
  recordProcess(execution, options.mode);
  assertExactResultKeys(execution.result);
  ensure(
    acceptedCodes.includes(execution.result.code),
    "NEGATIVE_CODE_INVALID",
  );
  assertPrimaryUnchanged(expectedState);
}

async function expectPreExitAcknowledgementRejected(expectedState) {
  let rejection;
  try {
    await launch({
      mode: "shutdown-fault",
      workspaceId: workspace,
      wrapperName: "unused-fault.wrap.json",
      databaseName: "unused-fault.db",
    });
  } catch (error) {
    rejection = error;
  }
  ensure(
    rejection instanceof Error &&
      rejection.message === "SHUTDOWN_TERMINAL_ACK_INVALID",
    "PRE_EXIT_ACK_FAULT_NOT_REJECTED",
  );
  assertPrimaryUnchanged(expectedState);
}

async function expectPostQuitProviderStateFaultRejected() {
  if (process.platform !== "win32") return;
  const faultStateRoot = fs.mkdtempSync(
    path.join(temporaryRoot, "constellation-post-quit-fault-"),
  );
  let rejection;
  try {
    await launch({
      mode: "shutdown-post-quit-fault",
      workspaceId: workspace,
      wrapperName: "unused-post-quit-fault.wrap.json",
      databaseName: "unused-post-quit-fault.db",
      probeStateRoot: faultStateRoot,
    });
  } catch (error) {
    rejection = error;
  } finally {
    await removeDirectory(faultStateRoot);
  }
  ensure(
    rejection instanceof Error &&
      new Set([
        "WINDOWS_PROVIDER_STATE_INVALID",
        "WINDOWS_PROVIDER_KEY_MISSING",
        "WINDOWS_PROVIDER_KEY_INVALID",
      ]).has(rejection.message),
    "POST_QUIT_PROVIDER_FAULT_NOT_REJECTED",
  );
  windowsPostQuitProviderFaultRejected = true;
}

function assertPrimaryUnchanged(expected) {
  for (const [filename, expectedDigest] of expected) {
    const exists = fs.existsSync(filename);
    ensure(exists === Boolean(expectedDigest), "PRIMARY_SIDECAR_SET_CHANGED");
    if (expectedDigest) {
      const actual = digestFile(filename);
      try {
        ensure(sameDigest(actual, expectedDigest), "PRIMARY_STATE_CHANGED");
      } finally {
        actual.fill(0);
      }
    }
  }
  assertPrimarySidecarsSafe();
  assertNoProbeTemps();
}

function snapshotPrimaryState() {
  const snapshot = new Map();
  for (const filename of [primaryWrapperPath, primaryDatabasePath]) {
    snapshot.set(
      filename,
      fs.existsSync(filename) ? digestFile(filename) : null,
    );
  }
  return snapshot;
}

function assertPrimarySidecarsSafe() {
  ensure(
    !fs.existsSync(`${primaryDatabasePath}-journal`),
    "PRIMARY_ROLLBACK_JOURNAL_RESIDUE",
  );
  for (const filename of [
    `${primaryDatabasePath}-wal`,
    `${primaryDatabasePath}-shm`,
  ]) {
    if (fs.existsSync(filename)) {
      const metadata = fs.lstatSync(filename);
      ensure(
        metadata.isFile() && !metadata.isSymbolicLink(),
        "PRIMARY_SIDECAR_INVALID",
      );
    }
  }
}

function clearSnapshot(snapshot) {
  for (const digest of snapshot.values()) digest?.fill(0);
}

function assertNoProbeTemps() {
  for (const entry of fs.readdirSync(stateRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      ensure(!entry.name.endsWith(".tmp"), "PROBE_TEMP_RESIDUE");
    }
  }
}

function writeFixture(name, contents) {
  fs.writeFileSync(path.join(stateRoot, name), contents, {
    flag: "wx",
    mode: 0o600,
  });
}

function removeProbeKeychainItem() {
  if (process.platform !== "darwin") return;
  const identity = ["-s", keychainService, "-a", keychainAccount];
  const find = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  if (find.status === 44) return;
  ensure(find.status === 0, "KEYCHAIN_QUERY_FAILED");
  const remove = spawnSync(
    "/usr/bin/security",
    ["delete-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  ensure(remove.status === 0, "KEYCHAIN_CLEANUP_FAILED");
  const verify = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", ...identity],
    { stdio: "ignore", timeout: 5_000 },
  );
  ensure(verify.status === 44, "KEYCHAIN_CLEANUP_UNVERIFIED");
}

function assertProbeKeychainItemPresent() {
  if (process.platform !== "darwin") return;
  const find = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", "-s", keychainService, "-a", keychainAccount],
    { stdio: "ignore", timeout: 5_000 },
  );
  ensure(find.status === 0, "KEYCHAIN_ITEM_MISSING");
}

async function removeDirectory(directory) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(200 * (attempt + 1));
    }
  }
  throw lastError || new Error("STATE_CLEANUP_FAILED");
}

async function removeStateRoot() {
  await removeDirectory(stateRoot);
}

const artifactPaths = [executable, appArchive, nativeAddon];
const artifactDigests = new Map();

try {
  ensure(/^(darwin|win32)$/.test(process.platform), "PLATFORM_UNSUPPORTED");
  ensure(process.arch === "x64", "HOST_ARCH_UNSUPPORTED");
  for (const artifact of artifactPaths) {
    ensure(fs.existsSync(artifact), "PACKAGED_ARTIFACT_MISSING");
    artifactDigests.set(artifact, digestFile(artifact));
  }
  removeProbeKeychainItem();
  await expectPostQuitProviderStateFaultRejected();

  const writer = await launch({
    mode: "provision",
    workspaceId: workspace,
    wrapperName: primaryWrapper,
    databaseName: primaryDatabase,
  });
  ensure(writer.declaredExitCode === 0, `WRITER_FAILED:${writer.result.code}`);
  ensure(writer.result.status === "pass", "WRITER_RESULT_INVALID");
  ensure(writer.result.code === "STORE_PROVISIONED", "WRITER_CODE_INVALID");
  recordProcess(writer, "provision");
  ensure(
    process.platform !== "win32" ||
      writer.lifecycle === "electron-quit-after-parent-authorization",
    "WINDOWS_WRITER_SHUTDOWN_INVALID",
  );
  assertExactResultKeys(writer.result, [
    "asyncEncryptionAvailable",
    "cipherVersion",
    "encryptedWal",
    "fts5",
    "loadableExtensions",
    "markerDigest",
    "plaintextScan",
    "provider",
    "providerVersion",
    "rawKeyBinding",
  ]);
  assertProvider(writer.result);
  ensure(
    /^[a-f0-9]{64}$/.test(writer.result.markerDigest),
    "MARKER_DIGEST_INVALID",
  );
  ensure(writer.result.encryptedWal === true, "ENCRYPTED_WAL_INVALID");
  assertProbeKeychainItemPresent();
  windowsProviderStateDigest = readWindowsProviderStateDigest();

  ensure(fs.existsSync(primaryWrapperPath), "PRIMARY_WRAPPER_MISSING");
  ensure(fs.existsSync(primaryDatabasePath), "PRIMARY_DATABASE_MISSING");
  const header = fs.readFileSync(primaryDatabasePath).subarray(0, 16);
  ensure(header.toString("utf8") !== "SQLite format 3\0", "PLAINTEXT_DATABASE");
  header.fill(0);

  const primaryState = snapshotPrimaryState();

  const reader = await launch({
    mode: "verify",
    workspaceId: workspace,
    wrapperName: primaryWrapper,
    databaseName: primaryDatabase,
  });
  ensure(reader.declaredExitCode === 0, `READER_FAILED:${reader.result.code}`);
  ensure(reader.result.status === "pass", "READER_RESULT_INVALID");
  ensure(reader.result.code === "STORE_VERIFIED", "READER_CODE_INVALID");
  recordProcess(reader, "verify");
  assertExactResultKeys(reader.result, [
    "asyncEncryptionAvailable",
    "cipherVersion",
    "fts5",
    "integrityVerified",
    "loadableExtensions",
    "markerDigest",
    "plaintextScan",
    "provider",
    "providerVersion",
    "rawKeyBinding",
  ]);
  assertProvider(reader.result);
  ensure(
    reader.result.markerDigest === writer.result.markerDigest,
    "RECOVERED_MARKER_MISMATCH",
  );
  ensure(reader.result.integrityVerified === true, "INTEGRITY_INVALID");
  assertWindowsProviderStateUnchanged(windowsProviderStateDigest);
  assertPrimaryUnchanged(primaryState);

  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "missing.wrap.json",
      databaseName: primaryDatabase,
    },
    ["WRAPPER_MISSING"],
    primaryState,
  );

  const primaryWrapperContents = fs.readFileSync(primaryWrapperPath);
  const parsedWrapper = JSON.parse(primaryWrapperContents.toString("utf8"));
  const flippedCiphertext = Buffer.from(parsedWrapper.ciphertext, "base64");
  flippedCiphertext[Math.floor(flippedCiphertext.length / 2)] ^= 0x01;
  parsedWrapper.ciphertext = flippedCiphertext.toString("base64");
  flippedCiphertext.fill(0);
  writeFixture(
    "flipped.wrap.json",
    Buffer.from(`${JSON.stringify(parsedWrapper)}\n`),
  );
  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "flipped.wrap.json",
      databaseName: primaryDatabase,
    },
    ["WRAPPER_DECRYPT_FAILED", "WRAPPER_INTEGRITY_FAILED"],
    primaryState,
  );

  const forgedContext = JSON.parse(primaryWrapperContents.toString("utf8"));
  forgedContext.workspaceId = "workspace-beta";
  writeFixture(
    "forged-context.wrap.json",
    Buffer.from(`${JSON.stringify(forgedContext)}\n`),
  );
  primaryWrapperContents.fill(0);
  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "forged-context.wrap.json",
      databaseName: primaryDatabase,
    },
    ["WRAPPER_CONTEXT_MISMATCH"],
    primaryState,
  );

  const secondaryWriter = await launch({
    mode: "provision",
    workspaceId: workspace,
    wrapperName: "secondary.wrap.json",
    databaseName: "secondary.db",
  });
  ensure(secondaryWriter.declaredExitCode === 0, "SECONDARY_WRITER_FAILED");
  ensure(
    secondaryWriter.result.status === "pass" &&
      secondaryWriter.result.code === "STORE_PROVISIONED",
    "SECONDARY_WRITER_RESULT_INVALID",
  );
  recordProcess(secondaryWriter, "provision");
  assertExactResultKeys(secondaryWriter.result, [
    "asyncEncryptionAvailable",
    "cipherVersion",
    "encryptedWal",
    "fts5",
    "loadableExtensions",
    "markerDigest",
    "plaintextScan",
    "provider",
    "providerVersion",
    "rawKeyBinding",
  ]);
  assertProvider(secondaryWriter.result);
  ensure(
    secondaryWriter.result.markerDigest !== writer.result.markerDigest,
    "SECONDARY_MARKER_REUSED",
  );
  assertPrimaryUnchanged(primaryState);

  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "secondary.wrap.json",
      databaseName: primaryDatabase,
    },
    ["DATABASE_OPEN_FAILED", "DATABASE_INTEGRITY_FAILED"],
    primaryState,
  );

  const plaintext = await launch({
    mode: "plaintext",
    workspaceId: workspace,
    wrapperName: "unused.wrap.json",
    databaseName: "plaintext.db",
  });
  ensure(plaintext.declaredExitCode === 0, "PLAINTEXT_SETUP_FAILED");
  ensure(
    plaintext.result.status === "pass" &&
      plaintext.result.code === "PLAINTEXT_FIXTURE_CREATED",
    "PLAINTEXT_SETUP_RESULT_INVALID",
  );
  recordProcess(plaintext, "plaintext");
  assertExactResultKeys(plaintext.result, ["plaintextFixtureCreated"]);
  assertPrimaryUnchanged(primaryState);
  const plaintextPath = path.join(stateRoot, "plaintext.db");
  ensure(fs.existsSync(plaintextPath), "PLAINTEXT_FIXTURE_MISSING");
  ensure(fs.statSync(plaintextPath).size > 512, "PLAINTEXT_FIXTURE_TOO_SMALL");
  const plaintextHeader = fs.readFileSync(plaintextPath).subarray(0, 16);
  ensure(
    plaintextHeader.toString("utf8") === "SQLite format 3\0",
    "PLAINTEXT_FIXTURE_INVALID",
  );
  plaintextHeader.fill(0);

  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: primaryWrapper,
      databaseName: "plaintext.db",
    },
    ["DATABASE_OPEN_FAILED"],
    primaryState,
  );

  const corruptDatabase = fs.readFileSync(primaryDatabasePath);
  ensure(corruptDatabase.length > 1024, "DATABASE_FIXTURE_TOO_SMALL");
  corruptDatabase[Math.min(512, corruptDatabase.length - 1)] ^= 0x01;
  writeFixture("corrupt.db", corruptDatabase);
  corruptDatabase.fill(0);
  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: primaryWrapper,
      databaseName: "corrupt.db",
    },
    ["DATABASE_OPEN_FAILED", "DATABASE_INTEGRITY_FAILED"],
    primaryState,
  );

  await expectFailure(
    {
      mode: "provision",
      workspaceId: workspace,
      wrapperName: primaryWrapper,
      databaseName: primaryDatabase,
    },
    ["WRAPPER_EXISTS", "DATABASE_EXISTS"],
    primaryState,
  );

  await expectPreExitAcknowledgementRejected(primaryState);
  assertWindowsProviderStateUnchanged(windowsProviderStateDigest);

  ensure(processIds.size === 11, "PROCESS_COUNT_INVALID");
  ensure(
    electronManagedProcessExits + forcedProcessExits === processIds.size,
    "PROCESS_LIFECYCLE_COUNT_INVALID",
  );
  ensure(
    acknowledgedShutdowns === processIds.size,
    "SHUTDOWN_ACK_COUNT_INVALID",
  );
  ensure(
    acknowledgedExitAuthorizations === processIds.size,
    "EXIT_AUTHORIZATION_ACK_COUNT_INVALID",
  );
  ensure(
    terminallyConfirmedShutdowns === electronManagedProcessExits,
    "SHUTDOWN_COMPLETION_COUNT_INVALID",
  );
  if (process.platform === "win32") {
    ensure(
      electronManagedProcessExits === processIds.size &&
        forcedProcessExits === 0,
      "WINDOWS_ELECTRON_EXIT_MATRIX_INVALID",
    );
    ensure(
      windowsPostQuitProviderFaultRejected,
      "POST_QUIT_PROVIDER_FAULT_NOT_REJECTED",
    );
  }
  assertWindowsProviderStateUnchanged(windowsProviderStateDigest);
  for (const [artifact, expected] of artifactDigests) {
    const actual = digestFile(artifact);
    try {
      ensure(sameDigest(actual, expected), "PACKAGED_ARTIFACT_CHANGED");
    } finally {
      actual.fill(0);
      expected.fill(0);
    }
  }
  clearSnapshot(primaryState);
  for (const output of captured) output.fill(0);

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      platform: process.platform,
      targetArchitecture: "x64",
      electron: "43.1.0",
      packagedRelaunch: true,
      parentManagedShutdown: true,
      acknowledgedShutdowns,
      acknowledgedExitAuthorizations,
      terminallyConfirmedShutdowns,
      electronManagedProcessExits,
      forcedProcessExits,
      observedElectronExitCode: process.platform === "win32" ? 1 : 0,
      preExitAcknowledgementFaultRejected: true,
      windowsPostQuitProviderFaultRejected:
        process.platform === "win32"
          ? windowsPostQuitProviderFaultRejected
          : "not-applicable",
      distinctProcesses: processIds.size,
      internallyGeneratedDek: true,
      asyncSafeStorage: true,
      rawKeyBinding: true,
      cipherVersion: "4.16.0 community",
      exactMarkerRecovered: true,
      encryptedDatabase: true,
      encryptedWal: true,
      nativeAddonDigestStable: true,
      missingWrapperRejected: true,
      corruptWrapperRejected: true,
      contextMismatchRejected: true,
      wrongKeyRejected: true,
      plaintextDatabaseRejected: true,
      corruptDatabaseRejected: true,
      existingStatePreserved: true,
      plaintextScan: true,
      provider:
        process.platform === "darwin"
          ? "Electron Keychain plus SQLCipher CommonCrypto"
          : "Electron DPAPI plus SQLCipher OpenSSL 3.5.7",
      identityTier:
        process.platform === "darwin"
          ? "same ad-hoc-signed packaged artifact"
          : "same unsigned packaged artifact and Windows user",
    })}\n`,
  );
} finally {
  windowsProviderStateDigest?.fill(0);
  for (const digest of artifactDigests.values()) digest.fill(0);
  for (const output of captured) output.fill(0);
  try {
    removeProbeKeychainItem();
  } finally {
    await removeStateRoot();
  }
}
