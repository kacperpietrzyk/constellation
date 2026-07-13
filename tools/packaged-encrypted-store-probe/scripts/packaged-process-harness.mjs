import { spawn, spawnSync } from "node:child_process";

const PRE_EXIT_CLEANUP_DEADLINE_MS = 10_000;
const PRE_EXIT_CLEANUP_RETRY_MS = 250;
const POST_KILL_CLOSE_TIMEOUT_MS = 10_000;

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function parseLastProgress(stderr, mode, processId, protocol) {
  if (!protocol) return "none";
  let lastStage = "none";
  const lines = stderr.toString("utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (
        hasExactKeys(value, ["mode", "processId", "stage", "type"]) &&
        value.type === protocol.type &&
        value.mode === mode &&
        value.processId === processId &&
        protocol.stages.has(value.stage)
      ) {
        lastStage = value.stage;
      }
    } catch {
      // Only exact probe-owned progress envelopes are diagnostic evidence.
    }
  }
  return lastStage;
}

export function terminatePackagedProcessTree(
  child,
  { rootExited = false, windowsRootIdentity } = {},
) {
  if (!child.pid) return false;
  if (process.platform === "win32") {
    if (
      rootExited ||
      child.exitCode !== null ||
      child.signalCode !== null ||
      !isWindowsProcessIdentity(windowsRootIdentity) ||
      windowsRootIdentity.pid !== child.pid
    ) {
      return false;
    }
    return terminateWindowsProcessTree(windowsRootIdentity);
  }
  try {
    process.kill(-child.pid, "SIGKILL");
    return true;
  } catch {
    if (rootExited) return false;
    try {
      return child.kill("SIGKILL");
    } catch {
      return false;
    }
  }
}

export async function launchManagedPackagedProcess({
  executable,
  args,
  environment = process.env,
  mode,
  errorContext,
  providerBootstrap,
  progressProtocol,
  timeoutMs = 45_000,
  maxOutputBytes = 64 * 1024,
}) {
  const env = { ...environment };
  delete env.ELECTRON_RUN_AS_NODE;
  const providerChannel = providerBootstrap !== undefined;

  return await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, {
        detached: process.platform !== "win32",
        env,
        stdio: ["ignore", "pipe", "pipe", providerChannel ? "ipc" : "ignore"],
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
    let preExitCleanupDeadlineTimer;
    let preExitCleanupRetryTimer;
    let helperCleanupTimer;
    let postExitTimer;
    let preExitCleanupError;
    let preExitCleanupStarted = false;
    let outputCollectionStopped = false;
    let mainProcessExited = false;
    let mainExitCode;
    let mainExitSignal;
    let providerBootstrapMessageCount = 0;
    let providerBootstrapCompleted = !providerChannel;
    let windowsFailureRootIdentity;
    let windowsTerminationAttempted = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (preExitCleanupDeadlineTimer) {
        clearTimeout(preExitCleanupDeadlineTimer);
      }
      if (preExitCleanupRetryTimer) clearTimeout(preExitCleanupRetryTimer);
      if (helperCleanupTimer) clearTimeout(helperCleanupTimer);
      if (postExitTimer) clearTimeout(postExitTimer);
      callback();
    };
    const clearCapturedOutput = () => {
      for (const chunk of stdout) chunk.fill(0);
      for (const chunk of stderr) chunk.fill(0);
      stdout.length = 0;
      stderr.length = 0;
      stdoutLength = 0;
      stderrLength = 0;
    };
    const rejectAtPreExitCleanupDeadline = () => {
      if (settled || !preExitCleanupStarted) return;
      outputCollectionStopped = true;
      clearCapturedOutput();
      if (child.connected && typeof child.disconnect === "function") {
        try {
          child.disconnect();
        } catch {
          // Cleanup is already failing; the bounded termination error remains
          // authoritative after the remaining handles are detached.
        }
      }
      child.channel?.unref?.();
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      finish(() =>
        reject(
          new Error(
            `PACKAGED_TERMINATION_TIMEOUT:${errorContext}:${preExitCleanupError.message}`,
          ),
        ),
      );
    };
    const startPreExitCleanup = (error) => {
      if (settled || preExitCleanupStarted) return;
      preExitCleanupStarted = true;
      const stderrBuffer = Buffer.concat(stderr, stderrLength);
      const lastProgressStage = parseLastProgress(
        stderrBuffer,
        mode,
        child.pid,
        progressProtocol,
      );
      stderrBuffer.fill(0);
      preExitCleanupError = new Error(
        `${error.message}:LAST_STAGE:${lastProgressStage}`,
      );
      if (
        process.platform === "win32" &&
        !mainProcessExited &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        try {
          windowsFailureRootIdentity = snapshotWindowsProcessTree(
            child.pid,
          ).find((identity) => identity.pid === child.pid);
        } catch {
          windowsFailureRootIdentity = undefined;
        }
      }
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (postExitTimer) {
        clearTimeout(postExitTimer);
        postExitTimer = undefined;
      }
      if (helperCleanupTimer) {
        clearTimeout(helperCleanupTimer);
        helperCleanupTimer = undefined;
      }
      const cleanupDeadline = Date.now() + PRE_EXIT_CLEANUP_DEADLINE_MS;
      const retryCleanup = () => {
        if (settled || !preExitCleanupStarted) return;
        if (Date.now() >= cleanupDeadline) {
          rejectAtPreExitCleanupDeadline();
          return;
        }
        if (process.platform === "win32") {
          if (
            !windowsTerminationAttempted &&
            !mainProcessExited &&
            windowsFailureRootIdentity
          ) {
            windowsTerminationAttempted = true;
            terminatePackagedProcessTree(child, {
              windowsRootIdentity: windowsFailureRootIdentity,
            });
          }
          return;
        }
        terminatePackagedProcessTree(child);
        const remaining = cleanupDeadline - Date.now();
        preExitCleanupRetryTimer = setTimeout(
          retryCleanup,
          Math.max(0, Math.min(PRE_EXIT_CLEANUP_RETRY_MS, remaining)),
        );
      };
      preExitCleanupDeadlineTimer = setTimeout(
        rejectAtPreExitCleanupDeadline,
        PRE_EXIT_CLEANUP_DEADLINE_MS,
      );
      retryCleanup();
    };
    const collect = (target, chunk, isStdout) => {
      const buffer = Buffer.from(chunk);
      if (outputCollectionStopped) {
        buffer.fill(0);
        return;
      }
      const nextLength =
        (isStdout ? stdoutLength : stderrLength) + buffer.length;
      if (nextLength > maxOutputBytes) {
        buffer.fill(0);
        outputCollectionStopped = true;
        clearCapturedOutput();
        startPreExitCleanup(new Error("PACKAGED_OUTPUT_LIMIT_EXCEEDED"));
        return;
      }
      target.push(buffer);
      if (isStdout) stdoutLength = nextLength;
      else stderrLength = nextLength;
    };

    child.stdout.on("data", (chunk) => collect(stdout, chunk, true));
    child.stderr.on("data", (chunk) => collect(stderr, chunk, false));
    if (providerChannel) {
      child.on("message", (message) => {
        providerBootstrapMessageCount += 1;
        if (
          providerBootstrapMessageCount !== 1 ||
          !hasExactKeys(message, [
            "bootstrapEnvironmentCleared",
            "mode",
            "processId",
            "type",
          ]) ||
          message.type !== providerBootstrap.readyType ||
          message.mode !== mode ||
          message.processId !== child.pid ||
          message.bootstrapEnvironmentCleared !== true
        ) {
          startPreExitCleanup(new Error("PROVIDER_BOOTSTRAP_PROTOCOL_INVALID"));
          return;
        }

        try {
          child.send(
            {
              type: providerBootstrap.continueType,
              mode,
              processId: child.pid,
            },
            (error) => {
              if (!error) {
                providerBootstrapCompleted = true;
                return;
              }
              startPreExitCleanup(new Error("PROVIDER_BOOTSTRAP_SEND_FAILED"));
            },
          );
        } catch {
          if (!settled) {
            startPreExitCleanup(new Error("PROVIDER_BOOTSTRAP_SEND_FAILED"));
          }
        }
      });
    }
    child.on("error", () =>
      startPreExitCleanup(new Error("PACKAGED_LAUNCH_FAILED")),
    );
    const complete = (code, signal) =>
      finish(() => {
        resolve({
          actualCode: code,
          actualSignal: signal,
          providerBootstrapCompleted,
          providerBootstrapMessageCount,
          childPid: child.pid,
          stdout: Buffer.concat(stdout, stdoutLength),
          stderr: Buffer.concat(stderr, stderrLength),
        });
      });
    const rejectUnverifiedHelperCleanup = () => {
      finish(() =>
        reject(new Error(`PACKAGED_HELPER_CLEANUP_UNVERIFIED:${errorContext}`)),
      );
      child.stdout.destroy();
      child.stderr.destroy();
    };

    child.on("exit", (code, signal) => {
      mainProcessExited = true;
      mainExitCode = code;
      mainExitSignal = signal;
      if (preExitCleanupStarted) return;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (process.platform === "win32") {
        postExitTimer = setTimeout(rejectUnverifiedHelperCleanup, 5_000);
        return;
      }
      postExitTimer = setTimeout(() => {
        const cleanupVerified = terminatePackagedProcessTree(child, {
          rootExited: true,
        });
        if (!cleanupVerified) {
          rejectUnverifiedHelperCleanup();
          return;
        }
        helperCleanupTimer = setTimeout(rejectUnverifiedHelperCleanup, 5_000);
      }, 1_000);
    });
    child.on("close", (code, signal) => {
      if (preExitCleanupStarted) {
        outputCollectionStopped = true;
        clearCapturedOutput();
        finish(() => reject(preExitCleanupError));
        return;
      }
      complete(
        mainProcessExited ? mainExitCode : code,
        mainProcessExited ? mainExitSignal : signal,
      );
    });

    timer = setTimeout(() => {
      startPreExitCleanup(new Error(`PACKAGED_LAUNCH_TIMEOUT:${errorContext}`));
    }, timeoutMs);

    if (
      providerChannel &&
      (typeof child.send !== "function" || !child.connected)
    ) {
      startPreExitCleanup(new Error("PROVIDER_BOOTSTRAP_CHANNEL_UNAVAILABLE"));
    }
  });
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function isProcessGroupAlive(pid) {
  if (process.platform === "win32") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function isWindowsProcessIdentity(value) {
  return (
    hasExactKeys(value, ["creationDate", "pid"]) &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    value.pid <= 0x7fffffff &&
    typeof value.creationDate === "string" &&
    /^[\x20-\x7e]{1,64}$/.test(value.creationDate)
  );
}

function snapshotWindowsProcessTree(rootPid) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$root = [int]$env:CONSTELLATION_FAULT_ROOT_PID
$rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CreationDate)
$byPid = @{}
foreach ($row in $rows) { $byPid[[int]$row.ProcessId] = $row }
if (-not $byPid.ContainsKey($root)) { exit 3 }
$pending = [System.Collections.Generic.Queue[int]]::new()
$seen = [System.Collections.Generic.HashSet[int]]::new()
$pending.Enqueue($root)
while ($pending.Count -gt 0) {
  $current = $pending.Dequeue()
  if (-not $seen.Add($current)) { continue }
  foreach ($row in $rows) {
    if ([int]$row.ParentProcessId -eq $current) {
      $pending.Enqueue([int]$row.ProcessId)
    }
  }
}
$identities = foreach ($processId in $seen) {
  $row = $byPid[$processId]
  if ($null -eq $row) { continue }
  [pscustomobject]@{
    pid = [int]$row.ProcessId
    creationDate = ([datetime]$row.CreationDate).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
  }
}
ConvertTo-Json -InputObject @($identities | Sort-Object pid) -Compress
`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: {
        ...process.env,
        CONSTELLATION_FAULT_ROOT_PID: String(rootPid),
      },
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    },
  );
  if (result.status !== 0 || result.signal !== null) {
    throw new Error("WINDOWS_PROCESS_TREE_SNAPSHOT_FAILED");
  }
  let value;
  try {
    value = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("WINDOWS_PROCESS_TREE_SNAPSHOT_INVALID");
  }
  const identities = Array.isArray(value) ? value : [value];
  if (
    identities.length === 0 ||
    identities.length > 64 ||
    !identities.every(isWindowsProcessIdentity) ||
    !identities.some((identity) => identity.pid === rootPid) ||
    new Set(identities.map((identity) => identity.pid)).size !==
      identities.length
  ) {
    throw new Error("WINDOWS_PROCESS_TREE_SNAPSHOT_INVALID");
  }
  return Object.freeze(
    identities
      .map((identity) => Object.freeze({ ...identity }))
      .sort((left, right) => left.pid - right.pid),
  );
}

function terminateWindowsProcessTree(rootIdentity) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$root = [int]$env:CONSTELLATION_FAULT_ROOT_PID
$expectedCreationDate = $env:CONSTELLATION_FAULT_ROOT_CREATION_DATE
$rows = @(Get-CimInstance Win32_Process -Filter "ProcessId = $root")
if ($rows.Count -ne 1) { exit 3 }
$actualCreationDate = ([datetime]$rows[0].CreationDate).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
if (-not [string]::Equals($actualCreationDate, $expectedCreationDate, [StringComparison]::Ordinal)) { exit 4 }
$taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
if (-not (Test-Path -LiteralPath $taskkill -PathType Leaf)) { exit 5 }
& $taskkill /PID $root /T /F *> $null
exit $LASTEXITCODE
`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: {
        ...process.env,
        CONSTELLATION_FAULT_ROOT_PID: String(rootIdentity.pid),
        CONSTELLATION_FAULT_ROOT_CREATION_DATE: rootIdentity.creationDate,
      },
      windowsHide: true,
      stdio: "ignore",
      timeout: 10_000,
    },
  );
  return result.status === 0 && result.signal === null;
}

function matchingWindowsProcessIdentities(identities) {
  if (
    !Array.isArray(identities) ||
    identities.length > 64 ||
    !identities.every(isWindowsProcessIdentity) ||
    new Set(identities.map((identity) => identity.pid)).size !==
      identities.length
  ) {
    throw new Error("WINDOWS_PROCESS_IDENTITIES_INVALID");
  }
  if (identities.length === 0) return [];
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$pidText = $env:CONSTELLATION_FAULT_PROCESS_IDS
if ($pidText -notmatch '^[1-9][0-9]{0,9}(,[1-9][0-9]{0,9}){0,63}$') { exit 2 }
$expectedPids = @($pidText.Split(',') | ForEach-Object { [int]$_ })
$filterClauses = @($expectedPids | ForEach-Object { "ProcessId = $_" })
$filter = [string]::Join(' OR ', [string[]]$filterClauses)
$rows = @(Get-CimInstance Win32_Process -Filter $filter | Select-Object ProcessId, CreationDate)
foreach ($row in ($rows | Sort-Object ProcessId)) {
  $processId = [int]$row.ProcessId
  $actualCreationDate = ([datetime]$row.CreationDate).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
  [Console]::Out.WriteLine(("{0}{1}{2}" -f $processId, [char]9, $actualCreationDate))
}
`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: {
        ...process.env,
        CONSTELLATION_FAULT_PROCESS_IDS: identities
          .map((identity) => identity.pid)
          .join(","),
      },
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    },
  );
  if (result.status !== 0 || result.signal !== null) {
    throw new Error("WINDOWS_PROCESS_IDENTITY_CHECK_FAILED");
  }
  const output = result.stdout.trim();
  const value = output
    ? output.split(/\r?\n/).map((line) => {
        const fields = line.split("\t");
        return {
          pid: fields.length === 2 ? Number(fields[0]) : Number.NaN,
          creationDate: fields.length === 2 ? fields[1] : "",
        };
      })
    : [];
  if (
    !Array.isArray(value) ||
    !value.every(isWindowsProcessIdentity) ||
    !value.every((actualIdentity) =>
      identities.some((identity) => identity.pid === actualIdentity.pid),
    ) ||
    new Set(value.map((identity) => identity.pid)).size !== value.length
  ) {
    throw new Error("WINDOWS_PROCESS_IDENTITY_CHECK_INVALID");
  }
  return identities
    .filter((identity) =>
      value.some(
        (actualIdentity) =>
          actualIdentity.pid === identity.pid &&
          actualIdentity.creationDate === identity.creationDate,
      ),
    )
    .map((identity) => identity.pid);
}

async function waitForForcedTreeAbsence(rootPid, processIdentities) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (process.platform === "win32") {
      if (matchingWindowsProcessIdentities(processIdentities).length === 0) {
        return;
      }
    } else if (!isProcessAlive(rootPid) && !isProcessGroupAlive(rootPid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("FORCED_PROCESS_TREE_STILL_ALIVE");
}

export async function forceCrashPackagedProcessAtBoundary({
  executable,
  args,
  environment = process.env,
  errorContext,
  parseBoundary,
  beforeKill,
  timeoutMs = 45_000,
  maxOutputBytes = 64 * 1024,
  postKillCloseTimeoutMs = POST_KILL_CLOSE_TIMEOUT_MS,
}) {
  if (
    !Number.isSafeInteger(postKillCloseTimeoutMs) ||
    postKillCloseTimeoutMs < 100 ||
    postKillCloseTimeoutMs > 30_000
  ) {
    throw new Error("FAULT_POST_KILL_CLOSE_TIMEOUT_INVALID");
  }
  const env = { ...environment };
  delete env.ELECTRON_RUN_AS_NODE;

  return await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, {
        detached: process.platform !== "win32",
        env,
        stdio: ["ignore", "pipe", "pipe", "ignore"],
        windowsHide: true,
      });
    } catch {
      reject(new Error("FAULT_PROCESS_LAUNCH_FAILED"));
      return;
    }

    const stdout = [];
    const stderr = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let settled = false;
    let boundaryAccepted = false;
    let forcedKillRequested = false;
    let forcedKillVerified = false;
    let boundary;
    let beforeKillEvidence;
    let processIds = [];
    let processIdentities = [];
    let exitObserved = false;
    let exitCode;
    let exitSignal;
    let primaryError;
    let timeoutTimer;
    let terminationTimer;
    let failureCleanupRetryTimer;
    let postKillCloseTimer;
    let failureProcessIdentities = [];
    let windowsFailureTerminationAttempted = false;

    const clearTimers = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (terminationTimer) clearTimeout(terminationTimer);
      if (failureCleanupRetryTimer) clearTimeout(failureCleanupRetryTimer);
      if (postKillCloseTimer) clearTimeout(postKillCloseTimer);
    };
    const clearOutput = () => {
      for (const chunk of stdout) chunk.fill(0);
      for (const chunk of stderr) chunk.fill(0);
      stdout.length = 0;
      stderr.length = 0;
      stdoutLength = 0;
      stderrLength = 0;
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      clearOutput();
      reject(error);
    };
    const beginFailureCleanup = (error) => {
      if (settled || primaryError) return;
      primaryError = error;
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
      }
      try {
        failureProcessIdentities =
          process.platform === "win32" &&
          child.pid &&
          !exitObserved &&
          child.exitCode === null &&
          child.signalCode === null
            ? snapshotWindowsProcessTree(child.pid)
            : [];
      } catch {
        failureProcessIdentities = [];
      }
      const cleanupDeadline = Date.now() + 10_000;
      const retryCleanup = () => {
        if (settled || !primaryError) return;
        if (process.platform === "win32") {
          if (!windowsFailureTerminationAttempted && !exitObserved) {
            windowsFailureTerminationAttempted = true;
            const rootIdentity = failureProcessIdentities.find(
              (identity) => identity.pid === child.pid,
            );
            if (rootIdentity) {
              terminatePackagedProcessTree(child, {
                windowsRootIdentity: rootIdentity,
              });
            }
          }
          return;
        }
        terminatePackagedProcessTree(child);
        if (Date.now() >= cleanupDeadline) return;
        failureCleanupRetryTimer = setTimeout(retryCleanup, 250);
      };
      retryCleanup();
      terminationTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        finishReject(
          new Error(
            `FAULT_PROCESS_TERMINATION_TIMEOUT:${errorContext}:${primaryError.message}`,
          ),
        );
      }, 10_000);
    };
    const collect = (target, chunk, isStdout) => {
      const buffer = Buffer.from(chunk);
      const nextLength =
        (isStdout ? stdoutLength : stderrLength) + buffer.length;
      if (nextLength > maxOutputBytes) {
        buffer.fill(0);
        beginFailureCleanup(new Error("FAULT_PROCESS_OUTPUT_LIMIT_EXCEEDED"));
        return;
      }
      target.push(buffer);
      if (isStdout) stdoutLength = nextLength;
      else stderrLength = nextLength;
    };
    const acceptBoundary = async () => {
      if (settled || boundaryAccepted || primaryError) return;
      const output = Buffer.concat(stdout, stdoutLength);
      const newline = output.indexOf(0x0a);
      if (newline === -1) {
        output.fill(0);
        return;
      }
      const trailing = output.subarray(newline + 1);
      if (trailing.some((byte) => byte !== 0x0d && byte !== 0x0a)) {
        output.fill(0);
        beginFailureCleanup(new Error("FAULT_BOUNDARY_COUNT_INVALID"));
        return;
      }
      const line = Buffer.from(output.subarray(0, newline));
      output.fill(0);
      try {
        boundary = parseBoundary(line, child.pid);
      } catch (error) {
        line.fill(0);
        beginFailureCleanup(
          error instanceof Error ? error : new Error("FAULT_BOUNDARY_INVALID"),
        );
        return;
      }
      line.fill(0);
      if (
        !child.pid ||
        !isProcessAlive(child.pid) ||
        (process.platform !== "win32" && !isProcessGroupAlive(child.pid))
      ) {
        beginFailureCleanup(new Error("FAULT_PROCESS_NOT_LIVE_AT_BOUNDARY"));
        return;
      }
      boundaryAccepted = true;
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
      }

      try {
        beforeKillEvidence = await beforeKill(boundary, child.pid);
        if (process.platform === "win32") {
          processIdentities = snapshotWindowsProcessTree(child.pid);
          processIds = Object.freeze(
            processIdentities.map((identity) => identity.pid),
          );
          const rootIdentity = processIdentities.find(
            (identity) => identity.pid === child.pid,
          );
          forcedKillRequested = terminatePackagedProcessTree(child, {
            windowsRootIdentity: rootIdentity,
          });
        } else {
          processIds = Object.freeze([child.pid]);
          forcedKillRequested = terminatePackagedProcessTree(child);
        }
        if (!forcedKillRequested) {
          throw new Error("FORCED_PROCESS_TREE_KILL_FAILED");
        }
        postKillCloseTimer = setTimeout(() => {
          if (settled) return;
          finishReject(
            new Error(`FAULT_PROCESS_POST_KILL_CLOSE_TIMEOUT:${errorContext}`),
          );
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
        }, postKillCloseTimeoutMs);
      } catch (error) {
        beginFailureCleanup(
          error instanceof Error ? error : new Error("FAULT_PRE_KILL_FAILED"),
        );
      }
    };

    child.stdout.on("data", (chunk) => {
      collect(stdout, chunk, true);
      void acceptBoundary();
    });
    child.stderr.on("data", (chunk) => collect(stderr, chunk, false));
    child.on("error", () =>
      beginFailureCleanup(new Error("FAULT_PROCESS_LAUNCH_FAILED")),
    );
    child.on("exit", (code, signal) => {
      exitObserved = true;
      exitCode = code;
      exitSignal = signal;
      if (!boundaryAccepted && !primaryError) {
        beginFailureCleanup(new Error("FAULT_PROCESS_EXITED_BEFORE_BOUNDARY"));
      }
    });
    child.on("close", async (code, signal) => {
      if (settled) return;
      if (postKillCloseTimer) {
        clearTimeout(postKillCloseTimer);
        postKillCloseTimer = undefined;
      }
      if (primaryError) {
        try {
          if (child.pid) {
            await waitForForcedTreeAbsence(child.pid, failureProcessIdentities);
          }
          finishReject(primaryError);
        } catch {
          finishReject(
            new Error(
              `FAULT_PROCESS_TERMINATION_UNVERIFIED:${errorContext}:${primaryError.message}`,
            ),
          );
        }
        return;
      }
      if (!boundaryAccepted || !forcedKillRequested) {
        finishReject(new Error("FAULT_PROCESS_CLOSED_BEFORE_FORCED_KILL"));
        return;
      }
      try {
        await waitForForcedTreeAbsence(child.pid, processIdentities);
        forcedKillVerified = true;
        const actualCode = exitObserved ? exitCode : code;
        const actualSignal = exitObserved ? exitSignal : signal;
        if (process.platform === "darwin") {
          if (actualCode !== null || actualSignal !== "SIGKILL") {
            throw new Error("FAULT_PROCESS_EXIT_STATUS_INVALID");
          }
        } else if (actualSignal !== null) {
          throw new Error("FAULT_PROCESS_EXIT_STATUS_INVALID");
        }
        settled = true;
        clearTimers();
        resolve({
          boundary,
          beforeKillEvidence,
          childPid: child.pid,
          processIds,
          actualCode,
          actualSignal,
          forcedKillVerified,
          stdout: Buffer.concat(stdout, stdoutLength),
          stderr: Buffer.concat(stderr, stderrLength),
        });
      } catch (error) {
        finishReject(
          error instanceof Error ? error : new Error("FAULT_CLEANUP_FAILED"),
        );
      }
    });

    timeoutTimer = setTimeout(() => {
      beginFailureCleanup(new Error(`FAULT_BOUNDARY_TIMEOUT:${errorContext}`));
    }, timeoutMs);
  });
}
