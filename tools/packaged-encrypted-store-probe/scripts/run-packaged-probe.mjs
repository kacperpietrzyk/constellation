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
const processIds = new Set();
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
  "readyForTermination",
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

function hasTerminationFields(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.hasOwn(value, "readyForTermination") ||
      Object.hasOwn(value, "declaredExitCode"))
  );
}

function isReadyResultEnvelope(value) {
  return (
    hasTerminationFields(value) &&
    value.readyForTermination === true &&
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
      if (hasTerminationFields(value)) candidates.push(value);
    } catch {
      // Invalid non-protocol diagnostics are ignored here and rejected by the
      // incremental scanner if they claim termination fields.
    }
  }
  ensure(candidates.length === 1, "FIXED_RESULT_COUNT_INVALID");
  ensure(isReadyResultEnvelope(candidates[0]), "FIXED_RESULT_INVALID");
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

async function launch({ mode, workspaceId, wrapperName, databaseName }) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const argumentsForProbe = [
    `--user-data-dir=${profile}`,
    `--probe-mode=${mode}`,
    `--probe-state-root=${stateRoot}`,
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
        stdio: ["ignore", "pipe", "pipe"],
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
    let helperCleanupTimer;
    let postExitTimer;
    let timedOut = false;
    let parentTerminationRequested = false;
    let parentTerminationAccepted = false;
    let terminationRequestedWhileAlive = false;
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
            ensure(!protocolError, protocolError);
            ensure(protocolResultCount === 1, "PROTOCOL_RESULT_COUNT_INVALID");
            ensure(
              parentTerminationRequested && parentTerminationAccepted,
              "PARENT_TERMINATION_PROTOCOL_MISSING",
            );
            ensure(
              terminationRequestedWhileAlive,
              "PARENT_TERMINATION_LIVENESS_MISSING",
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
            resolve({
              declaredExitCode: result.declaredExitCode,
              lifecycle: "parent-terminated-after-result",
              actualCode: code,
              actualSignal: signal,
              parentTerminationRequested,
              parentTerminationAccepted,
              terminationRequestedWhileAlive,
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
    const requestParentTermination = () => {
      if (settled || parentTerminationRequested) return;
      if (
        mainProcessExited ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        protocolError ||= "CHILD_NOT_LIVE_AT_READINESS";
        return;
      }
      terminationRequestedWhileAlive = true;
      parentTerminationRequested = true;
      parentTerminationAccepted = terminateTree(child);
      if (!parentTerminationAccepted) {
        startHardCleanup("PARENT_TERMINATION_REJECTED");
        return;
      }
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      helperCleanupTimer = setTimeout(
        () => startHardCleanup("HELPER_CLOSE_TIMEOUT"),
        5_000,
      );
    };
    const inspectProtocolLine = (line) => {
      const text = line.toString("utf8");
      const claimsProtocol =
        text.includes('"readyForTermination"') ||
        text.includes('"declaredExitCode"');
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        if (claimsProtocol) {
          protocolError ||= "PROTOCOL_RESULT_JSON_INVALID";
          requestParentTermination();
        }
        return;
      }
      if (!hasTerminationFields(value)) return;
      protocolResultCount += 1;
      if (protocolResultCount !== 1) {
        protocolError ||= "PROTOCOL_RESULT_DUPLICATED";
      }
      if (
        !isReadyResultEnvelope(value) ||
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
      requestParentTermination();
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
      if (parentTerminationRequested) return;
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
    execution.lifecycle === "parent-terminated-after-result",
    "CHILD_LIFECYCLE_INVALID",
  );
  ensure(
    execution.parentTerminationRequested === true &&
      execution.parentTerminationAccepted === true &&
      execution.terminationRequestedWhileAlive === true,
    "CHILD_TERMINATION_EVIDENCE_INVALID",
  );
  ensure(
    execution.actualCode !== null || execution.actualSignal !== null,
    "CHILD_ACTUAL_TERMINATION_INVALID",
  );
  ensure(result.readyForTermination === true, "CHILD_READINESS_INVALID");
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

async function removeStateRoot() {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(stateRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(200 * (attempt + 1));
    }
  }
  throw lastError || new Error("STATE_CLEANUP_FAILED");
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

  const writer = await launch({
    mode: "provision",
    workspaceId: workspace,
    wrapperName: primaryWrapper,
    databaseName: primaryDatabase,
  });
  ensure(writer.declaredExitCode === 0, "WRITER_FAILED");
  ensure(writer.result.status === "pass", "WRITER_RESULT_INVALID");
  ensure(writer.result.code === "STORE_PROVISIONED", "WRITER_CODE_INVALID");
  recordProcess(writer, "provision");
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
  ensure(reader.declaredExitCode === 0, "READER_FAILED");
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

  ensure(processIds.size === 11, "PROCESS_COUNT_INVALID");
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
      parentManagedTermination: true,
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
  for (const digest of artifactDigests.values()) digest.fill(0);
  for (const output of captured) output.fill(0);
  try {
    removeProbeKeychainItem();
  } finally {
    await removeStateRoot();
  }
}
