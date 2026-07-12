import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

const APP_ID = "io.constellation.key-custody-probe";
const APP_NAME = "Constellation Key Custody Probe";
const ELECTRON_VERSION = "43.1.0";
const PAYLOAD_FORMAT = "constellation.safe-storage-payload/v1";
const WRAPPER_FORMAT = "constellation.safe-storage-wrapper/v1";
const KEY_VERSION = 1;
const MAX_WRAPPER_BYTES = 64 * 1024;

class ProbeFailure extends Error {
  constructor(code, exitCode) {
    super(code);
    this.code = code;
    this.exitCode = exitCode;
  }
}

function fail(code, exitCode) {
  throw new ProbeFailure(code, exitCode);
}

function fixedResult(status, code, extra = {}) {
  return {
    status,
    code,
    phase: config?.mode ?? "startup",
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    packaged: app.isPackaged,
    processId: process.pid,
    ...extra,
  };
}

function writeFixedResult(result) {
  const output = Buffer.from(`${JSON.stringify(result)}\n`, "utf8");
  try {
    fs.writeSync(1, output);
  } finally {
    output.fill(0);
  }
}

function finish(result, exitCode) {
  writeFixedResult(result);
  app.exit(exitCode);
}

function getArgument(name) {
  const prefix = `--probe-${name}=`;
  const matches = process.argv.filter((argument) =>
    argument.startsWith(prefix),
  );
  if (matches.length !== 1) fail("CONFIG_INVALID", 80);
  return matches[0].slice(prefix.length);
}

function parseConfig() {
  const mode = getArgument("mode");
  const stateRoot = getArgument("state-root");
  const workspaceId = getArgument("workspace");
  const wrapperName = getArgument("wrapper");

  if (mode !== "write" && mode !== "verify") fail("CONFIG_INVALID", 80);
  if (!path.isAbsolute(stateRoot)) fail("CONFIG_INVALID", 80);
  if (!/^workspace-[a-z0-9-]{1,48}$/.test(workspaceId)) {
    fail("CONFIG_INVALID", 80);
  }
  if (!/^[a-z0-9-]{1,48}\.wrap\.json$/.test(wrapperName)) {
    fail("CONFIG_INVALID", 80);
  }

  const resolvedRoot = path.resolve(stateRoot);
  const expectedUserData = path.join(resolvedRoot, "profile");
  return {
    mode,
    stateRoot: resolvedRoot,
    expectedUserData,
    workspaceId,
    wrapperPath: path.join(resolvedRoot, wrapperName),
  };
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, i) => key === expected[i])
  );
}

async function readSyntheticKey() {
  if (
    typeof process.send !== "function" ||
    typeof process.disconnect !== "function" ||
    !process.connected ||
    !process.channel
  ) {
    fail("KEY_INPUT_INVALID", 81);
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      process.removeListener("disconnect", failInput);
      process.removeListener("message", receiveKey);
    };
    const failInput = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ProbeFailure("KEY_INPUT_INVALID", 81));
    };
    const receiveKey = (message) => {
      if (
        !hasExactKeys(message, ["key", "type"]) ||
        message.type !== "constellation.synthetic-key/v1" ||
        !Array.isArray(message.key) ||
        message.key.length !== 32 ||
        !message.key.every(
          (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
        )
      ) {
        message?.key?.fill?.(0);
        failInput();
        return;
      }

      settled = true;
      cleanup();
      const key = Buffer.from(message.key);
      message.key.fill(0);
      setImmediate(() => {
        if (process.connected) process.disconnect();
      });
      resolve(key);
    };

    process.once("disconnect", failInput);
    process.once("message", receiveKey);
    try {
      process.send(
        {
          type: "constellation.synthetic-key-ready/v1",
          mode: config.mode,
          processId: process.pid,
          bootstrapEnvironmentCleared:
            process.env.NODE_CHANNEL_FD === undefined &&
            process.env.NODE_CHANNEL_SERIALIZATION_MODE === undefined,
        },
        (error) => {
          if (error) failInput();
        },
      );
    } catch {
      failInput();
    }
  });
}

function publishAtomically(target, contents) {
  const temporary = path.join(
    path.dirname(target),
    `.safe-storage-${process.pid}-${crypto.randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;

  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, contents);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      fs.linkSync(temporary, target);
    } catch (error) {
      if (error && error.code === "EEXIST") fail("WRAPPER_EXISTS", 82);
      throw error;
    }
    fs.rmSync(temporary, { force: true });

    if (process.platform === "darwin") {
      const directory = fs.openSync(path.dirname(target), "r");
      try {
        fs.fsyncSync(directory);
      } finally {
        fs.closeSync(directory);
      }
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

async function writeWrapper(keyBytes) {
  const keyMaterial = keyBytes.toString("base64url");
  keyBytes.fill(0);

  const payload = JSON.stringify({
    format: PAYLOAD_FORMAT,
    workspaceId: config.workspaceId,
    keyVersion: KEY_VERSION,
    keyMaterial,
  });
  const payloadDigest = crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex");
  const encrypted = await safeStorage.encryptStringAsync(payload);

  if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
    encrypted?.fill?.(0);
    fail("ENCRYPTION_FAILED", 83);
  }
  const encodedKey = Buffer.from(keyMaterial);
  const plaintextExposed = encrypted.includes(encodedKey);
  encodedKey.fill(0);
  if (plaintextExposed) {
    encrypted.fill(0);
    fail("PLAINTEXT_EXPOSED", 84);
  }

  const wrapper = Buffer.from(
    `${JSON.stringify({
      format: WRAPPER_FORMAT,
      workspaceId: config.workspaceId,
      keyVersion: KEY_VERSION,
      ciphertext: encrypted.toString("base64"),
      payloadDigest,
    })}\n`,
    "utf8",
  );
  encrypted.fill(0);
  publishAtomically(config.wrapperPath, wrapper);
  wrapper.fill(0);

  return fixedResult("pass", "WRAPPER_PUBLISHED", {
    asyncEncryptionAvailable: true,
    keyTransport: "inherited-ipc",
    wrapperPublished: true,
  });
}

function parseWrapper(contents) {
  if (contents.length === 0 || contents.length > MAX_WRAPPER_BYTES) {
    fail("WRAPPER_INVALID", 85);
  }

  let wrapper;
  try {
    wrapper = JSON.parse(contents.toString("utf8"));
  } catch {
    fail("WRAPPER_INVALID", 85);
  }

  if (
    !hasExactKeys(wrapper, [
      "format",
      "workspaceId",
      "keyVersion",
      "ciphertext",
      "payloadDigest",
    ]) ||
    wrapper.format !== WRAPPER_FORMAT ||
    wrapper.keyVersion !== KEY_VERSION ||
    typeof wrapper.ciphertext !== "string" ||
    !/^[A-Fa-f0-9]{64}$/.test(wrapper.payloadDigest)
  ) {
    fail("WRAPPER_INVALID", 85);
  }
  if (wrapper.workspaceId !== config.workspaceId) {
    fail("WRAPPER_CONTEXT_MISMATCH", 86);
  }

  const ciphertext = Buffer.from(wrapper.ciphertext, "base64");
  if (
    ciphertext.length === 0 ||
    ciphertext.toString("base64") !== wrapper.ciphertext
  ) {
    ciphertext.fill(0);
    fail("WRAPPER_INVALID", 85);
  }

  return { wrapper, ciphertext };
}

async function verifyWrapper() {
  if (!fs.existsSync(config.wrapperPath)) fail("WRAPPER_MISSING", 87);
  const contents = fs.readFileSync(config.wrapperPath);
  const { wrapper, ciphertext } = parseWrapper(contents);
  contents.fill(0);

  let decrypted;
  try {
    decrypted = await safeStorage.decryptStringAsync(ciphertext);
  } catch {
    ciphertext.fill(0);
    fail("WRAPPER_DECRYPT_FAILED", 88);
  }
  ciphertext.fill(0);

  if (
    !decrypted ||
    typeof decrypted.result !== "string" ||
    typeof decrypted.shouldReEncrypt !== "boolean"
  ) {
    fail("WRAPPER_DECRYPT_FAILED", 88);
  }

  const expectedDigest = Buffer.from(wrapper.payloadDigest, "hex");
  const actualDigest = crypto
    .createHash("sha256")
    .update(decrypted.result)
    .digest();
  const digestMatches = crypto.timingSafeEqual(expectedDigest, actualDigest);
  expectedDigest.fill(0);
  actualDigest.fill(0);
  if (!digestMatches) fail("WRAPPER_INTEGRITY_FAILED", 89);

  let payload;
  try {
    payload = JSON.parse(decrypted.result);
  } catch {
    fail("WRAPPER_INTEGRITY_FAILED", 89);
  }
  if (
    !hasExactKeys(payload, [
      "format",
      "workspaceId",
      "keyVersion",
      "keyMaterial",
    ]) ||
    payload.format !== PAYLOAD_FORMAT ||
    payload.workspaceId !== config.workspaceId ||
    payload.keyVersion !== KEY_VERSION ||
    !/^[A-Za-z0-9_-]{43}$/.test(payload.keyMaterial)
  ) {
    fail("WRAPPER_INTEGRITY_FAILED", 89);
  }

  return fixedResult("pass", "WRAPPER_VERIFIED", {
    asyncEncryptionAvailable: true,
    wrapperVerified: true,
    rotationSignalRead: true,
    rotationRequired: decrypted.shouldReEncrypt,
  });
}

let config;
try {
  config = parseConfig();
  fs.mkdirSync(config.stateRoot, { recursive: true, mode: 0o700 });
  for (const directory of ["profile", "temp", "crash-dumps"]) {
    fs.mkdirSync(path.join(config.stateRoot, directory), {
      recursive: true,
      mode: 0o700,
    });
  }
  app.disableHardwareAcceleration();
  app.setAppUserModelId(APP_ID);
  app.setPath("temp", path.join(config.stateRoot, "temp"));
  app.setPath("crashDumps", path.join(config.stateRoot, "crash-dumps"));
} catch (error) {
  const code = error instanceof ProbeFailure ? error.code : "CONFIG_INVALID";
  const exitCode = error instanceof ProbeFailure ? error.exitCode : 80;
  writeFixedResult(fixedResult("fail", code));
  process.exit(exitCode);
}

if (config) {
  app.whenReady().then(async () => {
    try {
      if (
        !app.isPackaged ||
        process.env.ELECTRON_RUN_AS_NODE ||
        process.arch !== "x64" ||
        !/^(darwin|win32)$/.test(process.platform) ||
        process.versions.electron !== ELECTRON_VERSION ||
        app.getName() !== APP_NAME ||
        fs.realpathSync.native(app.getPath("userData")) !==
          fs.realpathSync.native(config.expectedUserData) ||
        fs.realpathSync.native(app.getPath("sessionData")) !==
          fs.realpathSync.native(config.expectedUserData)
      ) {
        fail("PACKAGED_IDENTITY_INVALID", 90);
      }

      let keyBytes;
      try {
        if (config.mode === "write") keyBytes = await readSyntheticKey();
        const asyncAvailable = await safeStorage.isAsyncEncryptionAvailable();
        if (asyncAvailable !== true) fail("ENCRYPTION_UNAVAILABLE", 91);

        const result =
          config.mode === "write"
            ? await writeWrapper(keyBytes)
            : await verifyWrapper();
        finish(result, 0);
      } finally {
        keyBytes?.fill(0);
      }
    } catch (error) {
      const code = error instanceof ProbeFailure ? error.code : "PROBE_FAILED";
      const exitCode = error instanceof ProbeFailure ? error.exitCode : 99;
      finish(fixedResult("fail", code), exitCode);
    }
  });
}
