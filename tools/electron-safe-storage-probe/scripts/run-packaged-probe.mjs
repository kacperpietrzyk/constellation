import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appName = "Constellation Key Custody Probe";
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
const appResources =
  process.platform === "darwin"
    ? path.join(
        packageRoot,
        `${appName}.app`,
        "Contents",
        "Resources",
        "app.asar",
      )
    : path.join(packageRoot, "resources", "app.asar");
const temporaryRoot = process.env.RUNNER_TEMP || os.tmpdir();
const stateRoot = fs.mkdtempSync(
  path.join(temporaryRoot, "constellation-key-custody-probe-"),
);
const profile = path.join(stateRoot, "profile");
const primaryWrapper = "primary.wrap.json";
const primaryPath = path.join(stateRoot, primaryWrapper);
const workspace = "workspace-alpha";
const payloadFormat = "constellation.safe-storage-payload/v1";
const secretBytes = crypto.randomBytes(32);
const secretText = secretBytes.toString("base64url");
const exactPayload = JSON.stringify({
  format: payloadFormat,
  workspaceId: workspace,
  keyVersion: 1,
  keyMaterial: secretText,
});
const replacementSecretBytes = crypto.randomBytes(32);
const replacementSecretText = replacementSecretBytes.toString("base64url");
const replacementPayload = JSON.stringify({
  format: payloadFormat,
  workspaceId: workspace,
  keyVersion: 1,
  keyMaterial: replacementSecretText,
});
const canaries = [
  secretBytes,
  Buffer.from(secretText),
  Buffer.from(exactPayload),
  replacementSecretBytes,
  Buffer.from(replacementSecretText),
  Buffer.from(replacementPayload),
];
const processIds = new Set();
const captured = [];

function ensure(condition, code) {
  if (!condition) throw new Error(code);
}

function containsCanary(contents) {
  return canaries.some(
    (canary) => canary.length > 0 && contents.includes(canary),
  );
}

function inspectOutput(contents) {
  ensure(contents.length <= 64 * 1024, "OUTPUT_TOO_LARGE");
  ensure(!containsCanary(contents), "PLAINTEXT_FOUND_IN_OUTPUT");
  captured.push(contents);
}

function parseFixedResult(stdout) {
  const lines = stdout
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .reverse();
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (
        value &&
        typeof value.status === "string" &&
        typeof value.code === "string"
      ) {
        return value;
      }
    } catch {
      // Chromium may emit unrelated diagnostic lines; only bounded JSON is evidence.
    }
  }
  throw new Error("FIXED_RESULT_MISSING");
}

function terminateTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      timeout: 5_000,
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

async function launch({ mode, workspaceId, wrapperName, input }) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const argumentsForProbe = [
    `--user-data-dir=${profile}`,
    `--probe-mode=${mode}`,
    `--probe-state-root=${stateRoot}`,
    `--probe-workspace=${workspaceId}`,
    `--probe-wrapper=${wrapperName}`,
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn(executable, argumentsForProbe, {
      detached: process.platform !== "win32",
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let settled = false;
    let timer;
    let terminationTimer;
    let postExitTimer;
    let timedOut = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (terminationTimer) clearTimeout(terminationTimer);
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
    };

    child.stdout.on("data", (chunk) => collect(stdout, chunk, true));
    child.stderr.on("data", (chunk) => collect(stderr, chunk, false));
    child.stdin.on("error", () => {
      // An early fixed failure may close stdin before the parent finishes it.
    });
    child.on("error", () =>
      finish(() => reject(new Error("PACKAGED_LAUNCH_FAILED"))),
    );
    child.on("exit", () => {
      postExitTimer = setTimeout(() => terminateTree(child), 250);
    });
    child.on("close", (code, signal) =>
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
              // The sanitized marker is sufficient when the child never responded.
            }
            reject(
              new Error(
                `PACKAGED_LAUNCH_TIMEOUT:${mode}:${wrapperName}:${childCode}`,
              ),
            );
          } else {
            resolve({
              code,
              signal,
              result: parseFixedResult(stdoutBuffer),
            });
          }
        } catch (error) {
          reject(error);
        }
      }),
    );

    timer = setTimeout(() => {
      timedOut = true;
      terminateTree(child);
      terminationTimer = setTimeout(
        () =>
          finish(() =>
            reject(
              new Error(`PACKAGED_TERMINATION_TIMEOUT:${mode}:${wrapperName}`),
            ),
          ),
        10_000,
      );
    }, 45_000);

    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function writeFixture(name, contents) {
  fs.writeFileSync(path.join(stateRoot, name), contents, {
    flag: "wx",
    mode: 0o600,
  });
}

function assertOriginalUnchanged(expectedHash) {
  const actualHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(primaryPath))
    .digest();
  const unchanged = crypto.timingSafeEqual(expectedHash, actualHash);
  actualHash.fill(0);
  ensure(unchanged, "ORIGINAL_WRAPPER_CHANGED");
}

function assertFixedIdentity(result) {
  ensure(result.packaged === true, "CHILD_NOT_PACKAGED");
  ensure(result.architecture === "x64", "CHILD_ARCH_INVALID");
  ensure(result.electron === "43.1.0", "CHILD_ELECTRON_INVALID");
  ensure(result.platform === process.platform, "CHILD_PLATFORM_INVALID");
  ensure(Number.isInteger(result.processId), "CHILD_PROCESS_ID_INVALID");
}

async function expectFailure(options, acceptedCodes, expectedHash) {
  const execution = await launch(options);
  ensure(execution.code !== 0, "NEGATIVE_PROBE_SUCCEEDED");
  ensure(execution.signal === null, "NEGATIVE_PROBE_SIGNALED");
  ensure(execution.result.status === "fail", "NEGATIVE_RESULT_INVALID");
  assertFixedIdentity(execution.result);
  ensure(
    acceptedCodes.includes(execution.result.code),
    "NEGATIVE_CODE_INVALID",
  );
  ensure(!processIds.has(execution.result.processId), "PROCESS_REUSED");
  processIds.add(execution.result.processId);
  assertOriginalUnchanged(expectedHash);
}

function scanDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) scanDirectory(target);
    else if (entry.isFile()) {
      const contents = fs.readFileSync(target);
      ensure(!containsCanary(contents), "PLAINTEXT_FOUND_ON_DISK");
    }
  }
}

function removeProbeKeychainItem() {
  if (process.platform !== "darwin") return;
  const identity = ["-s", keychainService, "-a", keychainAccount];
  const find = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", ...identity],
    {
      stdio: "ignore",
      timeout: 5_000,
    },
  );
  if (find.status === 44) return;
  ensure(find.status === 0, "KEYCHAIN_QUERY_FAILED");
  const remove = spawnSync(
    "/usr/bin/security",
    ["delete-generic-password", ...identity],
    {
      stdio: "ignore",
      timeout: 5_000,
    },
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

try {
  ensure(/^(darwin|win32)$/.test(process.platform), "PLATFORM_UNSUPPORTED");
  ensure(
    process.arch === "x64" || process.arch === "arm64",
    "HOST_ARCH_UNSUPPORTED",
  );
  ensure(fs.existsSync(executable), "PACKAGED_EXECUTABLE_MISSING");
  ensure(fs.existsSync(appResources), "PACKAGED_RESOURCES_MISSING");
  removeProbeKeychainItem();

  const writer = await launch({
    mode: "write",
    workspaceId: workspace,
    wrapperName: primaryWrapper,
    input: secretBytes,
  });
  ensure(writer.code === 0 && writer.signal === null, "WRITER_FAILED");
  ensure(writer.result.status === "pass", "WRITER_RESULT_INVALID");
  ensure(writer.result.code === "WRAPPER_PUBLISHED", "WRITER_CODE_INVALID");
  assertFixedIdentity(writer.result);
  ensure(
    writer.result.asyncEncryptionAvailable === true,
    "WRITER_PROVIDER_INVALID",
  );
  processIds.add(writer.result.processId);
  assertProbeKeychainItemPresent();

  const original = fs.readFileSync(primaryPath);
  ensure(!containsCanary(original), "PLAINTEXT_FOUND_IN_WRAPPER");
  const originalHash = crypto.createHash("sha256").update(original).digest();
  const originalWrapper = JSON.parse(original.toString("utf8"));
  const expectedPayloadDigest = crypto
    .createHash("sha256")
    .update(exactPayload)
    .digest();
  const publishedPayloadDigest = Buffer.from(
    originalWrapper.payloadDigest,
    "hex",
  );
  ensure(
    publishedPayloadDigest.length === expectedPayloadDigest.length &&
      crypto.timingSafeEqual(expectedPayloadDigest, publishedPayloadDigest),
    "PUBLISHED_KEY_MISMATCH",
  );
  expectedPayloadDigest.fill(0);
  publishedPayloadDigest.fill(0);

  await expectFailure(
    {
      mode: "write",
      workspaceId: workspace,
      wrapperName: primaryWrapper,
      input: replacementSecretBytes,
    },
    ["WRAPPER_EXISTS"],
    originalHash,
  );

  const reader = await launch({
    mode: "verify",
    workspaceId: workspace,
    wrapperName: primaryWrapper,
  });
  ensure(reader.code === 0 && reader.signal === null, "READER_FAILED");
  ensure(reader.result.status === "pass", "READER_RESULT_INVALID");
  ensure(reader.result.code === "WRAPPER_VERIFIED", "READER_CODE_INVALID");
  assertFixedIdentity(reader.result);
  ensure(
    reader.result.asyncEncryptionAvailable === true,
    "READER_PROVIDER_INVALID",
  );
  ensure(
    typeof reader.result.rotationRequired === "boolean",
    "ROTATION_SIGNAL_INVALID",
  );
  ensure(!processIds.has(reader.result.processId), "PROCESS_REUSED");
  processIds.add(reader.result.processId);
  assertOriginalUnchanged(originalHash);

  writeFixture("zero.wrap.json", Buffer.alloc(0));
  writeFixture(
    "truncated.wrap.json",
    original.subarray(0, Math.max(1, original.length >> 1)),
  );
  writeFixture("random.wrap.json", crypto.randomBytes(128));
  const flippedWrapper = structuredClone(originalWrapper);
  const flippedCiphertext = Buffer.from(flippedWrapper.ciphertext, "base64");
  flippedCiphertext[Math.floor(flippedCiphertext.length / 2)] ^= 0x01;
  flippedWrapper.ciphertext = flippedCiphertext.toString("base64");
  flippedCiphertext.fill(0);
  writeFixture(
    "flipped.wrap.json",
    Buffer.from(`${JSON.stringify(flippedWrapper)}\n`),
  );
  const forgedContextWrapper = structuredClone(originalWrapper);
  forgedContextWrapper.workspaceId = "workspace-beta";
  writeFixture(
    "forged-context.wrap.json",
    Buffer.from(`${JSON.stringify(forgedContextWrapper)}\n`),
  );

  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "missing.wrap.json",
    },
    ["WRAPPER_MISSING"],
    originalHash,
  );
  await expectFailure(
    { mode: "verify", workspaceId: workspace, wrapperName: "zero.wrap.json" },
    ["WRAPPER_INVALID"],
    originalHash,
  );
  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "truncated.wrap.json",
    },
    ["WRAPPER_INVALID"],
    originalHash,
  );
  await expectFailure(
    { mode: "verify", workspaceId: workspace, wrapperName: "random.wrap.json" },
    ["WRAPPER_INVALID"],
    originalHash,
  );
  await expectFailure(
    {
      mode: "verify",
      workspaceId: workspace,
      wrapperName: "flipped.wrap.json",
    },
    ["WRAPPER_DECRYPT_FAILED", "WRAPPER_INTEGRITY_FAILED"],
    originalHash,
  );
  await expectFailure(
    {
      mode: "verify",
      workspaceId: "workspace-beta",
      wrapperName: primaryWrapper,
    },
    ["WRAPPER_CONTEXT_MISMATCH"],
    originalHash,
  );
  await expectFailure(
    {
      mode: "verify",
      workspaceId: "workspace-beta",
      wrapperName: "forged-context.wrap.json",
    },
    ["WRAPPER_INTEGRITY_FAILED"],
    originalHash,
  );

  ensure(
    !fs.existsSync(path.join(stateRoot, "missing.wrap.json")),
    "MISSING_WRAPPER_CREATED",
  );
  ensure(processIds.size === 10, "PROCESS_COUNT_INVALID");

  original.fill(0);
  originalHash.fill(0);
  scanDirectory(stateRoot);
  const packagedSource = fs.readFileSync(appResources);
  ensure(!containsCanary(packagedSource), "PLAINTEXT_FOUND_IN_PACKAGE");
  packagedSource.fill(0);
  for (const output of captured) output.fill(0);

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      platform: process.platform,
      targetArchitecture: "x64",
      electron: "43.1.0",
      packagedRelaunch: true,
      distinctProcesses: processIds.size,
      asyncSafeStorage: true,
      rotationSignalRead: true,
      exactKeyRecovered: true,
      existingWrapperPreserved: true,
      invalidWrappersRejected: 5,
      crossWorkspaceSwapRejected: true,
      contextForgeryRejected: true,
      plaintextScan: true,
      provider:
        process.platform === "darwin"
          ? "Electron documented macOS Keychain provider"
          : "Electron documented Windows DPAPI provider",
      identityTier:
        process.platform === "darwin"
          ? "same ad-hoc-signed artifact"
          : "same unsigned packaged artifact and Windows user",
    })}\n`,
  );
} finally {
  secretBytes.fill(0);
  replacementSecretBytes.fill(0);
  try {
    removeProbeKeychainItem();
  } finally {
    await removeStateRoot();
  }
}
