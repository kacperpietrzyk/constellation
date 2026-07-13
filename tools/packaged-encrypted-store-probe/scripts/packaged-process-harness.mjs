import { spawn, spawnSync } from "node:child_process";

import {
  classifyProcessProbeError,
  originalPosixProcessGroupAbsent,
  readPosixProcessSnapshot,
  selectPosixProcessGroup,
} from "./posix-process-tree.mjs";

const PRE_EXIT_CLEANUP_DEADLINE_MS = 10_000;
const POST_KILL_CLOSE_TIMEOUT_MS = 10_000;
const FORCED_TREE_ABSENCE_TIMEOUT_MS = 5_000;
const WINDOWS_FORCED_TREE_ABSENCE_TIMEOUT_MS = 15_000;
const WINDOWS_FORCED_TREE_RETRY_GRACE_MS = 1_000;
const WINDOWS_FORCED_TREE_RETRY_INTERVAL_MS = 2_000;
const FAULT_MAX_OUTPUT_LINE_BYTES = 4 * 1024;
const FAULT_MAX_DIAGNOSTIC_LINES = 32;

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function scanFaultStdoutLines(output, { includeFinalPartial = false } = {}) {
  if (!Buffer.isBuffer(output)) {
    throw new Error("FAULT_OUTPUT_INVALID");
  }
  const protocolCandidates = [];
  let diagnosticLineCount = 0;
  let offset = 0;
  while (offset < output.length) {
    const newline = output.indexOf(0x0a, offset);
    if (newline === -1 && !includeFinalPartial) {
      if (output.length - offset > FAULT_MAX_OUTPUT_LINE_BYTES) {
        throw new Error("FAULT_OUTPUT_LINE_LIMIT_EXCEEDED");
      }
      break;
    }
    const lineBoundary = newline === -1 ? output.length : newline;
    let lineEnd = lineBoundary;
    if (lineEnd > offset && output[lineEnd - 1] === 0x0d) lineEnd -= 1;
    const line = output.subarray(offset, lineEnd);
    offset = newline === -1 ? output.length : newline + 1;
    if (line.length === 0) continue;
    if (line.length > FAULT_MAX_OUTPUT_LINE_BYTES) {
      throw new Error("FAULT_OUTPUT_LINE_LIMIT_EXCEEDED");
    }
    let protocolOffset = 0;
    while (
      protocolOffset < line.length &&
      (line[protocolOffset] === 0x20 ||
        line[protocolOffset] === 0x09 ||
        line[protocolOffset] === 0x0d)
    ) {
      protocolOffset += 1;
    }
    if (line[protocolOffset] === 0x7b) {
      protocolCandidates.push(line.subarray(protocolOffset));
      continue;
    }
    diagnosticLineCount += 1;
    if (diagnosticLineCount > FAULT_MAX_DIAGNOSTIC_LINES) {
      throw new Error("FAULT_DIAGNOSTIC_LINE_LIMIT_EXCEEDED");
    }
  }
  return { diagnosticLineCount, protocolCandidates };
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
  { windowsProcessIdentities, windowsRootIdentity } = {},
) {
  if (!child.pid) return false;
  if (process.platform === "win32") {
    if (
      child.exitCode !== null ||
      child.signalCode !== null ||
      !isWindowsProcessIdentity(windowsRootIdentity) ||
      windowsRootIdentity.pid !== child.pid ||
      (windowsProcessIdentities !== undefined &&
        (!Array.isArray(windowsProcessIdentities) ||
          !windowsProcessIdentities.some(
            (identity) =>
              identity?.pid === windowsRootIdentity.pid &&
              identity?.creationDate === windowsRootIdentity.creationDate,
          )))
    ) {
      return false;
    }
    const identities = windowsProcessIdentities ?? [windowsRootIdentity];
    let matchingPids;
    try {
      matchingPids = matchingWindowsProcessIdentities(identities);
    } catch {
      return false;
    }
    if (!matchingPids.includes(windowsRootIdentity.pid)) return false;
    const matchingIdentities = identities.filter((identity) =>
      matchingPids.includes(identity.pid),
    );
    const rootLast = [
      ...matchingIdentities.filter(
        (identity) => identity.pid !== windowsRootIdentity.pid,
      ),
      windowsRootIdentity,
    ];
    try {
      retryTerminateWindowsProcessIdentities(rootLast);
      return true;
    } catch {
      return false;
    }
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
    let postExitTimer;
    let preExitCleanupError;
    let preExitCleanupStarted = false;
    let outputCollectionStopped = false;
    let mainProcessExited = false;
    let mainExitCode;
    let mainExitSignal;
    let providerBootstrapMessageCount = 0;
    let providerBootstrapCompleted = !providerChannel;
    let windowsFailureProcessIdentities = [];
    let windowsFailureRootIdentity;
    let windowsTerminationAttempted = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (preExitCleanupDeadlineTimer) {
        clearTimeout(preExitCleanupDeadlineTimer);
      }
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
          windowsFailureProcessIdentities = snapshotWindowsProcessTree(
            child.pid,
          );
          windowsFailureRootIdentity = windowsFailureProcessIdentities.find(
            (identity) => identity.pid === child.pid,
          );
        } catch {
          windowsFailureProcessIdentities = [];
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
      preExitCleanupDeadlineTimer = setTimeout(
        rejectAtPreExitCleanupDeadline,
        PRE_EXIT_CLEANUP_DEADLINE_MS,
      );
      if (process.platform === "win32") {
        if (
          !windowsTerminationAttempted &&
          !mainProcessExited &&
          windowsFailureRootIdentity
        ) {
          windowsTerminationAttempted = true;
          terminatePackagedProcessTree(child, {
            windowsProcessIdentities: windowsFailureProcessIdentities,
            windowsRootIdentity: windowsFailureRootIdentity,
          });
        }
      } else if (!mainProcessExited) {
        terminatePackagedProcessTree(child);
      }
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
      postExitTimer = setTimeout(rejectUnverifiedHelperCleanup, 5_000);
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
    return classifyProcessProbeError(error) === "present";
  }
}

function isProcessGroupAlive(pid) {
  if (process.platform === "win32") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return classifyProcessProbeError(error) === "present";
  }
}

function isWindowsProcessIdentity(value) {
  return (
    hasExactKeys(value, ["creationDate", "pid"]) &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    value.pid <= 0x7fffffff &&
    typeof value.creationDate === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(value.creationDate)
  );
}

function isWindowsProcessRow(value) {
  return (
    hasExactKeys(value, ["creationDate", "parentPid", "pid"]) &&
    isWindowsProcessIdentity({
      pid: value.pid,
      creationDate: value.creationDate,
    }) &&
    Number.isSafeInteger(value.parentPid) &&
    value.parentPid >= 0 &&
    value.parentPid <= 0x7fffffff
  );
}

export function selectWindowsProcessTree(rows, rootPid) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    rows.length > 4096 ||
    !rows.every(isWindowsProcessRow) ||
    !Number.isSafeInteger(rootPid) ||
    rootPid <= 0 ||
    rootPid > 0x7fffffff ||
    new Set(rows.map((row) => row.pid)).size !== rows.length
  ) {
    throw new Error("WINDOWS_PROCESS_ROWS_INVALID");
  }
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  if (!byPid.has(rootPid)) {
    throw new Error("WINDOWS_PROCESS_ROOT_MISSING");
  }
  const pending = [rootPid];
  const selected = new Set();
  while (pending.length > 0) {
    const currentPid = pending.shift();
    if (selected.has(currentPid)) continue;
    selected.add(currentPid);
    const parent = byPid.get(currentPid);
    for (const row of rows) {
      if (
        row.parentPid === currentPid &&
        row.creationDate >= parent.creationDate
      ) {
        pending.push(row.pid);
      }
    }
  }
  if (selected.size > 64) {
    throw new Error("WINDOWS_PROCESS_TREE_TOO_LARGE");
  }
  return Object.freeze(
    [...selected]
      .map((pid) => {
        const row = byPid.get(pid);
        return Object.freeze({
          pid: row.pid,
          creationDate: row.creationDate,
        });
      })
      .sort((left, right) => left.pid - right.pid),
  );
}

function capturedRootIdentityMatches(
  platform,
  capturedIdentity,
  currentIdentity,
) {
  return Boolean(
    capturedIdentity &&
    currentIdentity &&
    capturedIdentity.pid === currentIdentity.pid &&
    (platform === "win32"
      ? capturedIdentity.creationDate === currentIdentity.creationDate
      : capturedIdentity.pgid === currentIdentity.pgid &&
        capturedIdentity.uid === currentIdentity.uid &&
        capturedIdentity.startedAt === currentIdentity.startedAt),
  );
}

export function guardCapturedRootTermination({
  platform = process.platform,
  capturedIdentity,
  currentIdentity,
  terminate,
}) {
  if (typeof terminate !== "function") {
    throw new Error("CAPTURED_ROOT_TERMINATION_GUARD_INVALID");
  }
  return capturedRootIdentityMatches(
    platform,
    capturedIdentity,
    currentIdentity,
  )
    ? terminate(capturedIdentity) === true
    : false;
}

export function snapshotWindowsProcessTree(rootPid) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CreationDate)
$snapshot = foreach ($row in $rows) {
  if ([int]$row.ProcessId -le 0 -or $null -eq $row.CreationDate) { continue }
  [pscustomobject]@{
    pid = [int]$row.ProcessId
    parentPid = [int]$row.ParentProcessId
    creationDate = ([datetime]$row.CreationDate).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
  }
}
ConvertTo-Json -InputObject @($snapshot | Sort-Object pid) -Compress
`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: {
        ...process.env,
      },
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 512 * 1024,
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
  try {
    return selectWindowsProcessTree(
      Array.isArray(value) ? value : [value],
      rootPid,
    );
  } catch {
    throw new Error("WINDOWS_PROCESS_TREE_SNAPSHOT_INVALID");
  }
}

export function retryTerminateWindowsProcessIdentities(identities) {
  if (
    !Array.isArray(identities) ||
    identities.length === 0 ||
    identities.length > 64 ||
    !identities.every(isWindowsProcessIdentity) ||
    new Set(identities.map((identity) => identity.pid)).size !==
      identities.length
  ) {
    throw new Error("WINDOWS_PROCESS_IDENTITIES_INVALID");
  }
  const identityText = identities
    .map((identity) => `${identity.pid}\t${identity.creationDate}`)
    .join("\n");
  const identityPayload = Buffer.from(identityText, "utf8").toString("base64");
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:CONSTELLATION_FAULT_IDENTITIES))
$taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
if (-not (Test-Path -LiteralPath $taskkill -PathType Leaf)) { exit 5 }
foreach ($line in @($text -split [char]10)) {
  $fields = @($line -split [char]9)
  if ($fields.Count -ne 2 -or $fields[0] -notmatch '^[1-9][0-9]{0,9}$') { exit 2 }
  $processId = [int]$fields[0]
  $expectedCreationDate = $fields[1]
  $rows = @(Get-CimInstance Win32_Process -Filter "ProcessId = $processId")
  if ($rows.Count -eq 0) { continue }
  if ($rows.Count -ne 1) { exit 3 }
  $actualCreationDate = ([datetime]$rows[0].CreationDate).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
  if (-not [string]::Equals($actualCreationDate, $expectedCreationDate, [StringComparison]::Ordinal)) { continue }
  & $taskkill /PID $processId /F *> $null
}
exit 0
`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: {
        ...process.env,
        CONSTELLATION_FAULT_IDENTITIES: identityPayload,
      },
      windowsHide: true,
      stdio: "ignore",
      timeout: 10_000,
    },
  );
  if (result.status !== 0 || result.signal !== null) {
    throw new Error("WINDOWS_PROCESS_TREE_RETRY_FAILED");
  }
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

async function waitForForcedTreeAbsence(
  rootPid,
  windowsProcessIdentities,
  posixProcessGroup,
) {
  const startedAt = Date.now();
  const deadline =
    startedAt +
    (process.platform === "win32"
      ? WINDOWS_FORCED_TREE_ABSENCE_TIMEOUT_MS
      : FORCED_TREE_ABSENCE_TIMEOUT_MS);
  let nextWindowsRetryAt = startedAt + WINDOWS_FORCED_TREE_RETRY_GRACE_MS;
  let windowsRetryCount = 0;
  let remainingWindowsIdentities = 0;
  while (Date.now() < deadline) {
    if (process.platform === "win32") {
      const matchingPids = matchingWindowsProcessIdentities(
        windowsProcessIdentities,
      );
      remainingWindowsIdentities = matchingPids.length;
      if (matchingPids.length === 0) return;
      if (Date.now() >= nextWindowsRetryAt) {
        const matching = windowsProcessIdentities.filter((identity) =>
          matchingPids.includes(identity.pid),
        );
        retryTerminateWindowsProcessIdentities(matching);
        windowsRetryCount += 1;
        nextWindowsRetryAt = Date.now() + WINDOWS_FORCED_TREE_RETRY_INTERVAL_MS;
      }
    } else if (posixProcessGroup) {
      if (
        originalPosixProcessGroupAbsent(
          posixProcessGroup,
          readPosixProcessSnapshot(),
        )
      ) {
        return;
      }
    } else if (!isProcessAlive(rootPid) && !isProcessGroupAlive(rootPid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    process.platform === "win32"
      ? `FORCED_PROCESS_TREE_STILL_ALIVE:REMAINING:${remainingWindowsIdentities}:RETRIES:${windowsRetryCount}`
      : "FORCED_PROCESS_TREE_STILL_ALIVE",
  );
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
    let windowsProcessIdentities = [];
    let posixProcessGroup;
    let exitObserved = false;
    let exitCode;
    let exitSignal;
    let primaryError;
    let timeoutTimer;
    let terminationTimer;
    let postKillCloseTimer;
    let failureWindowsProcessIdentities = [];
    let failurePosixProcessGroup;
    let windowsFailureTerminationAttempted = false;
    let acceptedBoundaryLine;
    let initialWindowsProcessIdentities = [];
    let initialPosixProcessGroup;
    let initialWindowsRootIdentity;
    let initialPosixRootIdentity;

    const clearTimers = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (terminationTimer) clearTimeout(terminationTimer);
      if (postKillCloseTimer) clearTimeout(postKillCloseTimer);
    };
    const clearOutput = () => {
      for (const chunk of stdout) chunk.fill(0);
      for (const chunk of stderr) chunk.fill(0);
      stdout.length = 0;
      stderr.length = 0;
      stdoutLength = 0;
      stderrLength = 0;
      if (acceptedBoundaryLine) {
        acceptedBoundaryLine.fill(0);
        acceptedBoundaryLine = undefined;
      }
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      clearOutput();
      reject(error);
    };
    const terminateCapturedBoundaryProcessTree = () => {
      try {
        if (process.platform === "win32") {
          const currentRootIdentity = snapshotWindowsProcessTree(
            child.pid,
          ).find((identity) => identity.pid === child.pid);
          return guardCapturedRootTermination({
            capturedIdentity: initialWindowsRootIdentity,
            currentIdentity: currentRootIdentity,
            terminate: (capturedIdentity) =>
              terminatePackagedProcessTree(child, {
                windowsProcessIdentities: initialWindowsProcessIdentities,
                windowsRootIdentity: capturedIdentity,
              }),
          });
        }
        const currentRootIdentity = readPosixProcessSnapshot().find(
          (identity) =>
            identity.pid === child.pid &&
            identity.pgid === child.pid &&
            identity.uid === process.geteuid?.(),
        );
        return guardCapturedRootTermination({
          capturedIdentity: initialPosixRootIdentity,
          currentIdentity: currentRootIdentity,
          terminate: () => terminatePackagedProcessTree(child),
        });
      } catch {
        return false;
      }
    };
    const beginFailureCleanup = (error) => {
      if (settled || primaryError) return;
      primaryError = error;
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
      }
      try {
        if (boundaryAccepted) {
          failureWindowsProcessIdentities = initialWindowsProcessIdentities;
          failurePosixProcessGroup = initialPosixProcessGroup;
        } else {
          failureWindowsProcessIdentities =
            process.platform === "win32" &&
            child.pid &&
            !exitObserved &&
            child.exitCode === null &&
            child.signalCode === null
              ? snapshotWindowsProcessTree(child.pid)
              : [];
          if (
            process.platform !== "win32" &&
            child.pid &&
            !exitObserved &&
            child.exitCode === null &&
            child.signalCode === null
          ) {
            failurePosixProcessGroup = selectPosixProcessGroup(
              readPosixProcessSnapshot(),
              child.pid,
            );
          }
        }
      } catch {
        failureWindowsProcessIdentities = [];
        failurePosixProcessGroup = undefined;
      }
      if (process.platform === "win32") {
        if (!windowsFailureTerminationAttempted && !exitObserved) {
          windowsFailureTerminationAttempted = true;
          if (boundaryAccepted) {
            terminateCapturedBoundaryProcessTree();
          } else {
            const rootIdentity = failureWindowsProcessIdentities.find(
              (identity) => identity.pid === child.pid,
            );
            if (rootIdentity) {
              terminatePackagedProcessTree(child, {
                windowsProcessIdentities: failureWindowsProcessIdentities,
                windowsRootIdentity: rootIdentity,
              });
            }
          }
        }
      } else if (!exitObserved) {
        if (boundaryAccepted) {
          terminateCapturedBoundaryProcessTree();
        } else {
          terminatePackagedProcessTree(child);
        }
      }
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
      try {
        const scan = scanFaultStdoutLines(output);
        if (scan.protocolCandidates.length > 1) {
          throw new Error("FAULT_BOUNDARY_COUNT_INVALID");
        }
        if (scan.protocolCandidates.length === 0) return;
        boundary = parseBoundary(scan.protocolCandidates[0], child.pid);
        acceptedBoundaryLine = Buffer.from(scan.protocolCandidates[0]);
      } catch (error) {
        beginFailureCleanup(
          error instanceof Error ? error : new Error("FAULT_BOUNDARY_INVALID"),
        );
        return;
      } finally {
        output.fill(0);
      }
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
        if (process.platform === "win32") {
          initialWindowsProcessIdentities = snapshotWindowsProcessTree(
            child.pid,
          );
          initialWindowsRootIdentity = initialWindowsProcessIdentities.find(
            (identity) => identity.pid === child.pid,
          );
          if (!initialWindowsRootIdentity) {
            throw new Error("FAULT_PROCESS_ROOT_IDENTITY_MISSING");
          }
        } else {
          const initialPosixSnapshot = readPosixProcessSnapshot();
          initialPosixRootIdentity = initialPosixSnapshot.find(
            (identity) =>
              identity.pid === child.pid &&
              identity.pgid === child.pid &&
              identity.uid === process.geteuid?.(),
          );
          if (!initialPosixRootIdentity) {
            throw new Error("FAULT_PROCESS_ROOT_IDENTITY_MISSING");
          }
          initialPosixProcessGroup = selectPosixProcessGroup(
            initialPosixSnapshot,
            child.pid,
          );
        }
        beforeKillEvidence = await beforeKill(boundary, child.pid);
        if (settled || primaryError) return;
        if (
          exitObserved ||
          child.exitCode !== null ||
          child.signalCode !== null
        ) {
          throw new Error("FAULT_PROCESS_EXITED_DURING_PRE_KILL");
        }
        if (process.platform === "win32") {
          windowsProcessIdentities = snapshotWindowsProcessTree(child.pid);
          const currentRootIdentity = windowsProcessIdentities.find(
            (identity) => identity.pid === child.pid,
          );
          if (
            !capturedRootIdentityMatches(
              process.platform,
              initialWindowsRootIdentity,
              currentRootIdentity,
            )
          ) {
            throw new Error("FAULT_PROCESS_ROOT_IDENTITY_CHANGED");
          }
          processIds = Object.freeze(
            windowsProcessIdentities.map((identity) => identity.pid),
          );
          if (settled || primaryError || exitObserved) return;
          forcedKillRequested = terminatePackagedProcessTree(child, {
            windowsProcessIdentities,
            windowsRootIdentity: initialWindowsRootIdentity,
          });
        } else {
          posixProcessGroup = selectPosixProcessGroup(
            readPosixProcessSnapshot(),
            child.pid,
          );
          const currentRootIdentity = posixProcessGroup.find(
            (identity) => identity.pid === child.pid,
          );
          if (
            !capturedRootIdentityMatches(
              process.platform,
              initialPosixRootIdentity,
              currentRootIdentity,
            )
          ) {
            throw new Error("FAULT_PROCESS_ROOT_IDENTITY_CHANGED");
          }
          processIds = Object.freeze(
            posixProcessGroup.map((identity) => identity.pid),
          );
          if (settled || primaryError || exitObserved) return;
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
      } else if (!forcedKillRequested && !primaryError) {
        beginFailureCleanup(new Error("FAULT_PROCESS_EXITED_DURING_PRE_KILL"));
      }
    });
    child.on("close", async (code, signal) => {
      if (settled) return;
      if (postKillCloseTimer) {
        clearTimeout(postKillCloseTimer);
        postKillCloseTimer = undefined;
      }
      if (terminationTimer) {
        clearTimeout(terminationTimer);
        terminationTimer = undefined;
      }
      if (primaryError) {
        try {
          if (child.pid) {
            await waitForForcedTreeAbsence(
              child.pid,
              failureWindowsProcessIdentities,
              failurePosixProcessGroup,
            );
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
        await waitForForcedTreeAbsence(
          child.pid,
          windowsProcessIdentities,
          posixProcessGroup,
        );
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
        const finalOutput = Buffer.concat(stdout, stdoutLength);
        let stdoutProtocolCandidateCount;
        let stdoutDiagnosticLineCount;
        try {
          const finalScan = scanFaultStdoutLines(finalOutput, {
            includeFinalPartial: true,
          });
          stdoutProtocolCandidateCount = finalScan.protocolCandidates.length;
          stdoutDiagnosticLineCount = finalScan.diagnosticLineCount;
          if (stdoutProtocolCandidateCount !== 1) {
            throw new Error("FAULT_BOUNDARY_COUNT_INVALID");
          }
          if (
            !acceptedBoundaryLine ||
            !finalScan.protocolCandidates[0].equals(acceptedBoundaryLine)
          ) {
            throw new Error("FAULT_BOUNDARY_EVIDENCE_INVALID");
          }
        } finally {
          finalOutput.fill(0);
        }
        acceptedBoundaryLine.fill(0);
        acceptedBoundaryLine = undefined;
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
          stdoutProtocolCandidateCount,
          stdoutDiagnosticLineCount,
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
