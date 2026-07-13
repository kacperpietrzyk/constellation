import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  forceCrashPackagedProcessAtBoundary,
  launchManagedPackagedProcess,
  terminatePackagedProcessTree,
} from "./packaged-process-harness.mjs";

const readyType = "constellation.process-harness-test.ready/v1";
const continueType = "constellation.process-harness-test.continue/v1";
const filename = fileURLToPath(import.meta.url);
const childArgument = process.argv.find((argument) =>
  argument.startsWith("--harness-child="),
);

function ensure(condition, code) {
  if (!condition) throw new Error(code);
}

function writeObject(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function holdForTest(timeoutMs = 60_000) {
  const state = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) Atomics.wait(state, 0, 0, 1_000);
}

function runChild(mode) {
  if (mode === "managed") {
    writeObject({ type: "managed-result/v1", processId: process.pid });
    process.exit(0);
  }
  if (mode === "provider") {
    ensure(
      typeof process.send === "function" && process.connected,
      "TEST_PROVIDER_CHANNEL_MISSING",
    );
    process.once("message", (message) => {
      ensure(
        message?.type === continueType &&
          message.mode === "provider-test" &&
          message.processId === process.pid,
        "TEST_PROVIDER_CONTINUE_INVALID",
      );
      process.once("disconnect", () => {
        writeObject({ type: "provider-result/v1", processId: process.pid });
        process.exit(0);
      });
      process.disconnect();
    });
    process.send({
      type: readyType,
      mode: "provider-test",
      processId: process.pid,
      bootstrapEnvironmentCleared:
        process.env.NODE_CHANNEL_FD === undefined &&
        process.env.NODE_CHANNEL_SERIALIZATION_MODE === undefined,
    });
    return;
  }
  if (mode === "fault") {
    writeObject({ type: "fault-boundary/v1", processId: process.pid });
    holdForTest();
    process.exit(97);
  }
  if (mode === "fault-survivor") {
    const survivor = spawn(
      process.execPath,
      [filename, "--harness-child=pipe-holder"],
      {
        detached: process.platform !== "win32",
        stdio: ["ignore", 1, 2],
        windowsHide: true,
      },
    );
    survivor.unref();
    writeObject({
      type: "fault-survivor-boundary/v1",
      processId: process.pid,
      survivorPid: survivor.pid,
    });
    holdForTest();
    process.exit(97);
  }
  if (mode === "pipe-holder" || mode === "identity-hold") {
    holdForTest();
    process.exit(98);
  }
  throw new Error("TEST_CHILD_MODE_INVALID");
}

if (childArgument) {
  runChild(childArgument.slice("--harness-child=".length));
} else {
  ensure(process.argv.length === 2, "TEST_ARGUMENT_INVALID");
  const managed = await launchManagedPackagedProcess({
    executable: process.execPath,
    args: [filename, "--harness-child=managed"],
    mode: "managed-test",
    errorContext: "managed-test",
    timeoutMs: 10_000,
  });
  try {
    const value = JSON.parse(managed.stdout.toString("utf8"));
    ensure(
      managed.actualCode === 0 &&
        managed.actualSignal === null &&
        value.type === "managed-result/v1" &&
        value.processId === managed.childPid,
      "TEST_MANAGED_PROCESS_INVALID",
    );
  } finally {
    managed.stdout.fill(0);
    managed.stderr.fill(0);
  }

  const provider = await launchManagedPackagedProcess({
    executable: process.execPath,
    args: [filename, "--harness-child=provider"],
    mode: "provider-test",
    errorContext: "provider-test",
    providerBootstrap: { readyType, continueType },
    timeoutMs: 10_000,
  });
  try {
    const value = JSON.parse(provider.stdout.toString("utf8"));
    ensure(
      provider.actualCode === 0 &&
        provider.actualSignal === null &&
        provider.providerBootstrapCompleted === true &&
        provider.providerBootstrapMessageCount === 1 &&
        value.type === "provider-result/v1" &&
        value.processId === provider.childPid,
      "TEST_PROVIDER_PROCESS_INVALID",
    );
  } finally {
    provider.stdout.fill(0);
    provider.stderr.fill(0);
  }

  const windowsTreeFault = process.platform === "win32";
  let windowsSurvivorPid;
  const fault = await forceCrashPackagedProcessAtBoundary({
    executable: process.execPath,
    args: [
      filename,
      `--harness-child=${windowsTreeFault ? "fault-survivor" : "fault"}`,
    ],
    errorContext: "fault-test",
    timeoutMs: 10_000,
    parseBoundary: (line, processId) => {
      const value = JSON.parse(line.toString("utf8"));
      if (windowsTreeFault) {
        ensure(
          value?.type === "fault-survivor-boundary/v1" &&
            value.processId === processId &&
            Number.isSafeInteger(value.survivorPid) &&
            value.survivorPid > 0 &&
            Object.keys(value).sort().join(",") ===
              "processId,survivorPid,type",
          "TEST_FAULT_BOUNDARY_INVALID",
        );
        windowsSurvivorPid = value.survivorPid;
        return value;
      }
      ensure(
        value?.type === "fault-boundary/v1" &&
          value.processId === processId &&
          Object.keys(value).sort().join(",") === "processId,type",
        "TEST_FAULT_BOUNDARY_INVALID",
      );
      return value;
    },
    beforeKill: (_boundary, processId) => {
      ensure(processId > 0, "TEST_FAULT_PID_INVALID");
      return { boundaryObserved: true };
    },
  });
  try {
    ensure(
      fault.boundary.type ===
        (windowsTreeFault
          ? "fault-survivor-boundary/v1"
          : "fault-boundary/v1") &&
        fault.beforeKillEvidence.boundaryObserved === true &&
        fault.forcedKillVerified === true &&
        fault.processIds.includes(fault.childPid) &&
        (!windowsTreeFault ||
          (fault.processIds.length >= 2 &&
            fault.processIds.includes(windowsSurvivorPid))),
      "TEST_FORCED_PROCESS_INVALID",
    );
  } finally {
    fault.stdout.fill(0);
    fault.stderr.fill(0);
  }

  let postKillWatchdogVerified = false;
  if (process.platform !== "win32") {
    let survivorPid;
    let watchdogError;
    const startedAt = Date.now();
    try {
      await forceCrashPackagedProcessAtBoundary({
        executable: process.execPath,
        args: [filename, "--harness-child=fault-survivor"],
        errorContext: "fault-survivor-test",
        timeoutMs: 10_000,
        postKillCloseTimeoutMs: 250,
        parseBoundary: (line, processId) => {
          const value = JSON.parse(line.toString("utf8"));
          ensure(
            value?.type === "fault-survivor-boundary/v1" &&
              value.processId === processId &&
              Number.isSafeInteger(value.survivorPid) &&
              value.survivorPid > 0 &&
              Object.keys(value).sort().join(",") ===
                "processId,survivorPid,type",
            "TEST_SURVIVOR_BOUNDARY_INVALID",
          );
          survivorPid = value.survivorPid;
          return value;
        },
        beforeKill: () => ({ boundaryObserved: true }),
      });
    } catch (error) {
      watchdogError = error;
    } finally {
      if (survivorPid) {
        try {
          process.kill(survivorPid, "SIGKILL");
        } catch (error) {
          if (error?.code !== "ESRCH") throw error;
        }
      }
    }
    ensure(
      watchdogError?.message ===
        "FAULT_PROCESS_POST_KILL_CLOSE_TIMEOUT:fault-survivor-test" &&
        Date.now() - startedAt < 5_000,
      "TEST_POST_KILL_WATCHDOG_INVALID",
    );
    postKillWatchdogVerified = true;
  }

  let windowsIdentityGuardVerified = false;
  if (process.platform === "win32") {
    const identityChild = spawn(
      process.execPath,
      [filename, "--harness-child=identity-hold"],
      { stdio: "ignore", windowsHide: true },
    );
    try {
      await new Promise((resolve, reject) => {
        identityChild.once("spawn", resolve);
        identityChild.once("error", reject);
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const terminated = terminatePackagedProcessTree(identityChild, {
        windowsRootIdentity: {
          pid: identityChild.pid,
          creationDate: "1970-01-01T00:00:00.0000000Z",
        },
      });
      let stillAlive = true;
      try {
        process.kill(identityChild.pid, 0);
      } catch {
        stillAlive = false;
      }
      ensure(!terminated && stillAlive, "TEST_WINDOWS_IDENTITY_GUARD_INVALID");
      windowsIdentityGuardVerified = true;
    } finally {
      if (
        identityChild.exitCode === null &&
        identityChild.signalCode === null
      ) {
        identityChild.kill("SIGKILL");
        await new Promise((resolve) => identityChild.once("close", resolve));
      }
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      platform: process.platform,
      managedLifecycle: true,
      providerBootstrap: true,
      forcedTreeKill: true,
      inheritedPipesClosed: true,
      postKillWatchdog: postKillWatchdogVerified,
      windowsIdentityGuard: windowsIdentityGuardVerified,
    })}\n`,
  );
}
