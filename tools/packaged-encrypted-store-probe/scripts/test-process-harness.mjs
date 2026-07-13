import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  forceCrashPackagedProcessAtBoundary,
  guardCapturedRootTermination,
  launchManagedPackagedProcess,
  retryTerminateWindowsProcessIdentities,
  snapshotWindowsProcessTree,
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

function writeText(value) {
  const output = Buffer.from(value, "utf8");
  try {
    let offset = 0;
    while (offset < output.length) {
      const written = fs.writeSync(1, output, offset, output.length - offset);
      ensure(written > 0, "TEST_OUTPUT_FAILED");
      offset += written;
    }
  } finally {
    output.fill(0);
  }
}

function writeObject(value) {
  writeText(`${JSON.stringify(value)}\n`);
}

function holdForTest(timeoutMs = 60_000) {
  const state = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) Atomics.wait(state, 0, 0, 1_000);
}

function parseSimpleFaultBoundary(line, processId) {
  let value;
  try {
    value = JSON.parse(line.toString("utf8"));
  } catch {
    throw new Error("TEST_FAULT_BOUNDARY_INVALID");
  }
  ensure(
    value?.type === "fault-boundary/v1" &&
      value.processId === processId &&
      Object.keys(value).sort().join(",") === "processId,type",
    "TEST_FAULT_BOUNDARY_INVALID",
  );
  return value;
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
  if (mode === "fault-diagnostic") {
    writeText("[chromium-native-diagnostic] bounded test preamble\n");
    setTimeout(() => {
      writeObject({ type: "fault-boundary/v1", processId: process.pid });
      holdForTest();
      process.exit(97);
    }, 25);
    return;
  }
  if (mode === "fault-exit-after-boundary") {
    writeObject({ type: "fault-boundary/v1", processId: process.pid });
    setTimeout(() => process.exit(0), 25);
    return;
  }
  if (mode === "fault-duplicate") {
    writeText(
      `${JSON.stringify({ type: "fault-boundary/v1", processId: process.pid })}\n${JSON.stringify({ type: "fault-boundary/v1", processId: process.pid })}\n`,
    );
    holdForTest();
    process.exit(97);
  }
  if (mode === "fault-whitespace-duplicate") {
    const boundary = JSON.stringify({
      type: "fault-boundary/v1",
      processId: process.pid,
    });
    writeText(`${boundary}\n \t${boundary}`);
    holdForTest();
    process.exit(97);
  }
  if (mode === "fault-malformed") {
    writeText("{not-json}\n");
    holdForTest();
    process.exit(97);
  }
  if (mode === "fault-diagnostic-only") {
    writeText("[chromium-native-diagnostic] no protocol record\n");
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
  if (mode === "fault-orphan-pipe") {
    let survivorPid;
    let messageCount = 0;
    const intermediary = spawn(
      process.execPath,
      [filename, "--harness-child=spawn-orphan-pipe"],
      {
        stdio: ["ignore", 1, 2, "ipc"],
        windowsHide: true,
      },
    );
    intermediary.on("message", (message) => {
      messageCount += 1;
      ensure(
        messageCount === 1 &&
          message?.type === "orphan-pipe-ready/v1" &&
          Number.isSafeInteger(message.survivorPid) &&
          message.survivorPid > 0,
        "TEST_ORPHAN_PIPE_MESSAGE_INVALID",
      );
      survivorPid = message.survivorPid;
    });
    intermediary.once("close", (code, signal) => {
      ensure(
        code === 0 &&
          signal === null &&
          messageCount === 1 &&
          Number.isSafeInteger(survivorPid),
        "TEST_ORPHAN_PIPE_INTERMEDIARY_INVALID",
      );
      writeObject({
        type: "fault-survivor-boundary/v1",
        processId: process.pid,
        survivorPid,
      });
      holdForTest();
      process.exit(97);
    });
    return;
  }
  if (mode === "spawn-orphan-pipe") {
    ensure(
      typeof process.send === "function" && process.connected,
      "TEST_ORPHAN_PIPE_CHANNEL_MISSING",
    );
    const survivor = spawn(
      process.execPath,
      [filename, "--harness-child=pipe-holder"],
      {
        detached: true,
        stdio: ["ignore", 1, 2],
        windowsHide: true,
      },
    );
    survivor.unref();
    process.send(
      { type: "orphan-pipe-ready/v1", survivorPid: survivor.pid },
      (error) => {
        ensure(!error, "TEST_ORPHAN_PIPE_SEND_FAILED");
        process.disconnect();
        process.exit(0);
      },
    );
    return;
  }
  if (mode === "fault-detached-silent") {
    const survivor = spawn(
      process.execPath,
      [filename, "--harness-child=pipe-holder"],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    survivor.unref();
    writeObject({
      type: "fault-detached-silent-boundary/v1",
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
        fault.stdoutProtocolCandidateCount === 1 &&
        fault.stdoutDiagnosticLineCount === 0 &&
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

  const diagnosticFault = await forceCrashPackagedProcessAtBoundary({
    executable: process.execPath,
    args: [filename, "--harness-child=fault-diagnostic"],
    errorContext: "fault-diagnostic-test",
    timeoutMs: 10_000,
    parseBoundary: parseSimpleFaultBoundary,
    beforeKill: () => ({ boundaryObserved: true }),
  });
  try {
    ensure(
      diagnosticFault.boundary.type === "fault-boundary/v1" &&
        diagnosticFault.beforeKillEvidence.boundaryObserved === true &&
        diagnosticFault.forcedKillVerified === true &&
        diagnosticFault.stdoutProtocolCandidateCount === 1 &&
        diagnosticFault.stdoutDiagnosticLineCount === 1,
      "TEST_DIAGNOSTIC_BOUNDARY_INVALID",
    );
  } finally {
    diagnosticFault.stdout.fill(0);
    diagnosticFault.stderr.fill(0);
  }

  let delayedBeforeKillCompleted = false;
  let preKillExitError;
  try {
    await forceCrashPackagedProcessAtBoundary({
      executable: process.execPath,
      args: [filename, "--harness-child=fault-exit-after-boundary"],
      errorContext: "fault-exit-during-pre-kill-test",
      timeoutMs: 10_000,
      parseBoundary: parseSimpleFaultBoundary,
      beforeKill: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        delayedBeforeKillCompleted = true;
        return { boundaryObserved: true };
      },
    });
  } catch (error) {
    preKillExitError = error;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  ensure(
    preKillExitError?.message === "FAULT_PROCESS_EXITED_DURING_PRE_KILL" &&
      delayedBeforeKillCompleted === true,
    "TEST_PRE_KILL_EXIT_GUARD_INVALID",
  );

  let identityChangedTerminationCalls = 0;
  const capturedWindowsRoot = {
    pid: 4242,
    creationDate: "2026-01-01T00:00:00.0000000Z",
  };
  const capturedPosixRoot = {
    pid: 4242,
    pgid: 4242,
    uid: 501,
    startedAt: "Thu Jan  1 00:00:00 2026",
  };
  for (const [platform, capturedIdentity, currentIdentity] of [
    [
      "win32",
      capturedWindowsRoot,
      { ...capturedWindowsRoot, creationDate: "2026-01-01T00:00:01.0000000Z" },
    ],
    [
      "darwin",
      capturedPosixRoot,
      { ...capturedPosixRoot, startedAt: "Thu Jan  1 00:00:01 2026" },
    ],
  ]) {
    ensure(
      guardCapturedRootTermination({
        platform,
        capturedIdentity,
        currentIdentity,
        terminate: () => {
          identityChangedTerminationCalls += 1;
          return true;
        },
      }) === false,
      "TEST_CHANGED_ROOT_IDENTITY_ACCEPTED",
    );
  }
  let matchingCapturedIdentity;
  ensure(
    guardCapturedRootTermination({
      platform: "win32",
      capturedIdentity: capturedWindowsRoot,
      currentIdentity: { ...capturedWindowsRoot },
      terminate: (capturedIdentity) => {
        matchingCapturedIdentity = capturedIdentity;
        return true;
      },
    }) === true &&
      matchingCapturedIdentity === capturedWindowsRoot &&
      identityChangedTerminationCalls === 0,
    "TEST_CAPTURED_ROOT_TERMINATION_GUARD_INVALID",
  );

  let duplicateError;
  try {
    await forceCrashPackagedProcessAtBoundary({
      executable: process.execPath,
      args: [filename, "--harness-child=fault-duplicate"],
      errorContext: "fault-duplicate-test",
      timeoutMs: 10_000,
      parseBoundary: parseSimpleFaultBoundary,
      beforeKill: () => ({ boundaryObserved: true }),
    });
  } catch (error) {
    duplicateError = error;
  }
  ensure(
    duplicateError?.message === "FAULT_BOUNDARY_COUNT_INVALID",
    "TEST_DUPLICATE_BOUNDARY_ACCEPTED",
  );

  let whitespaceDuplicateError;
  try {
    await forceCrashPackagedProcessAtBoundary({
      executable: process.execPath,
      args: [filename, "--harness-child=fault-whitespace-duplicate"],
      errorContext: "fault-whitespace-duplicate-test",
      timeoutMs: 10_000,
      parseBoundary: parseSimpleFaultBoundary,
      beforeKill: () => ({ boundaryObserved: true }),
    });
  } catch (error) {
    whitespaceDuplicateError = error;
  }
  ensure(
    whitespaceDuplicateError?.message === "FAULT_BOUNDARY_COUNT_INVALID",
    "TEST_WHITESPACE_DUPLICATE_BOUNDARY_ACCEPTED",
  );

  let malformedBeforeKill = false;
  let malformedError;
  try {
    await forceCrashPackagedProcessAtBoundary({
      executable: process.execPath,
      args: [filename, "--harness-child=fault-malformed"],
      errorContext: "fault-malformed-test",
      timeoutMs: 10_000,
      parseBoundary: parseSimpleFaultBoundary,
      beforeKill: () => {
        malformedBeforeKill = true;
        return { boundaryObserved: true };
      },
    });
  } catch (error) {
    malformedError = error;
  }
  ensure(
    malformedError?.message === "TEST_FAULT_BOUNDARY_INVALID" &&
      malformedBeforeKill === false,
    "TEST_MALFORMED_BOUNDARY_ACCEPTED",
  );

  let diagnosticOnlyBeforeKill = false;
  let diagnosticOnlyError;
  try {
    await forceCrashPackagedProcessAtBoundary({
      executable: process.execPath,
      args: [filename, "--harness-child=fault-diagnostic-only"],
      errorContext: "fault-diagnostic-only-test",
      timeoutMs: 500,
      parseBoundary: parseSimpleFaultBoundary,
      beforeKill: () => {
        diagnosticOnlyBeforeKill = true;
        return { boundaryObserved: true };
      },
    });
  } catch (error) {
    diagnosticOnlyError = error;
  }
  ensure(
    diagnosticOnlyError?.message ===
      "FAULT_BOUNDARY_TIMEOUT:fault-diagnostic-only-test" &&
      diagnosticOnlyBeforeKill === false,
    "TEST_DIAGNOSTIC_ONLY_ACCEPTED",
  );

  let postKillWatchdogVerified = false;
  if (process.platform !== "win32") {
    let detachedSilentPid;
    let detachedSilentError;
    try {
      await forceCrashPackagedProcessAtBoundary({
        executable: process.execPath,
        args: [filename, "--harness-child=fault-detached-silent"],
        errorContext: "fault-detached-silent-test",
        timeoutMs: 10_000,
        parseBoundary: (line, processId) => {
          const value = JSON.parse(line.toString("utf8"));
          ensure(
            value?.type === "fault-detached-silent-boundary/v1" &&
              value.processId === processId &&
              Number.isSafeInteger(value.survivorPid) &&
              value.survivorPid > 0,
            "TEST_DETACHED_SILENT_BOUNDARY_INVALID",
          );
          detachedSilentPid = value.survivorPid;
          return value;
        },
        beforeKill: () => ({ boundaryObserved: true }),
      });
    } catch (error) {
      detachedSilentError = error;
    } finally {
      if (detachedSilentPid) {
        try {
          process.kill(detachedSilentPid, "SIGKILL");
        } catch (error) {
          if (error?.code !== "ESRCH") throw error;
        }
      }
    }
    ensure(
      detachedSilentError?.message === "POSIX_PROCESS_TREE_ESCAPED_GROUP",
      "TEST_DETACHED_SILENT_SURVIVOR_ACCEPTED",
    );

    let survivorPid;
    let watchdogError;
    const startedAt = Date.now();
    try {
      await forceCrashPackagedProcessAtBoundary({
        executable: process.execPath,
        args: [filename, "--harness-child=fault-orphan-pipe"],
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
  let windowsIdentityRetryVerified = false;
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
      retryTerminateWindowsProcessIdentities([
        {
          pid: identityChild.pid,
          creationDate: "1970-01-01T00:00:00.0000000Z",
        },
      ]);
      try {
        process.kill(identityChild.pid, 0);
      } catch {
        stillAlive = false;
      }
      ensure(stillAlive, "TEST_WINDOWS_RETRY_IDENTITY_GUARD_INVALID");
      windowsIdentityGuardVerified = true;
      const identity = snapshotWindowsProcessTree(identityChild.pid).find(
        (candidate) => candidate.pid === identityChild.pid,
      );
      ensure(identity, "TEST_WINDOWS_RETRY_IDENTITY_MISSING");
      retryTerminateWindowsProcessIdentities([identity]);
      if (
        identityChild.exitCode === null &&
        identityChild.signalCode === null
      ) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("TEST_WINDOWS_RETRY_TIMEOUT")),
            5_000,
          );
          identityChild.once("close", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      windowsIdentityRetryVerified = true;
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
      capturedTerminationScope: true,
      inheritedPipesClosed: true,
      stdoutProtocolScanner: true,
      detachedProcessGroupRejected: process.platform !== "win32",
      postKillWatchdog: postKillWatchdogVerified,
      preKillExitGuard: true,
      identityChangeTerminationGuard: true,
      windowsIdentityGuard: windowsIdentityGuardVerified,
      windowsIdentityRetry: windowsIdentityRetryVerified,
    })}\n`,
  );
}
