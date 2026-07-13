import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { WorkspaceId } from "@constellation/contracts";

const PAYLOAD_FORMAT = "constellation.workspace-key-payload/v1";
const WRAPPER_FORMAT = "constellation.workspace-key-wrapper/v1";
const KEY_VERSION = 1;
const MAX_WRAPPER_BYTES = 64 * 1024;

export interface AsyncSafeStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<string>;
}

export class WorkspaceKeyCustodyError extends Error {
  public constructor(
    public readonly code:
      | "encryption_unavailable"
      | "wrapper_exists"
      | "wrapper_missing"
      | "wrapper_invalid"
      | "wrapper_context_mismatch"
      | "wrapper_io_failed",
  ) {
    super(`Workspace key custody failed: ${code}.`);
    this.name = "WorkspaceKeyCustodyError";
  }
}

const exactObject = (
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join("\0") === [...keys].sort().join("\0")
    ? record
    : undefined;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new WorkspaceKeyCustodyError("wrapper_invalid");
  }
};

const assertRegularFile = (filename: string): void => {
  let metadata;
  try {
    metadata = lstatSync(filename);
  } catch {
    throw new WorkspaceKeyCustodyError("wrapper_missing");
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size <= 0 ||
    metadata.size > MAX_WRAPPER_BYTES
  ) {
    throw new WorkspaceKeyCustodyError("wrapper_invalid");
  }
};

const publishAtomically = (filename: string, contents: Buffer): void => {
  const directory = path.dirname(filename);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (existsSync(filename)) {
    throw new WorkspaceKeyCustodyError("wrapper_exists");
  }
  const temporary = path.join(
    directory,
    `.${path.basename(filename)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, filename);
    unlinkSync(temporary);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the publication failure.
      }
    }
    rmSync(temporary, { force: true });
    if (error instanceof WorkspaceKeyCustodyError) throw error;
    throw new WorkspaceKeyCustodyError("wrapper_io_failed");
  }
};

export class WorkspaceKeyCustody {
  public constructor(
    private readonly safeStorage: AsyncSafeStorage,
    private readonly wrapperPath: string,
  ) {}

  public async create(workspaceId: WorkspaceId): Promise<Buffer> {
    if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
      throw new WorkspaceKeyCustodyError("encryption_unavailable");
    }
    const key = randomBytes(32);
    let wrapperContents: Buffer | undefined;
    try {
      const payload = JSON.stringify({
        format: PAYLOAD_FORMAT,
        workspaceId,
        keyVersion: KEY_VERSION,
        keyMaterial: key.toString("base64url"),
      });
      const ciphertext = await this.safeStorage.encryptStringAsync(payload);
      const wrapper = {
        format: WRAPPER_FORMAT,
        workspaceId,
        keyVersion: KEY_VERSION,
        ciphertext: ciphertext.toString("base64"),
        payloadDigest: sha256(payload),
      };
      wrapperContents = Buffer.from(`${JSON.stringify(wrapper)}\n`, "utf8");
      if (
        wrapperContents.includes(key) ||
        wrapperContents.includes(Buffer.from(key.toString("base64url"), "utf8"))
      ) {
        throw new WorkspaceKeyCustodyError("wrapper_invalid");
      }
      publishAtomically(this.wrapperPath, wrapperContents);
      return key;
    } catch (error) {
      key.fill(0);
      if (error instanceof WorkspaceKeyCustodyError) throw error;
      throw new WorkspaceKeyCustodyError("wrapper_io_failed");
    } finally {
      wrapperContents?.fill(0);
    }
  }

  public async load(workspaceId: WorkspaceId): Promise<Buffer> {
    if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
      throw new WorkspaceKeyCustodyError("encryption_unavailable");
    }
    assertRegularFile(this.wrapperPath);
    let contents: Buffer | undefined;
    let ciphertext: Buffer | undefined;
    try {
      contents = readFileSync(this.wrapperPath);
      const wrapper = exactObject(parseJson(contents.toString("utf8")), [
        "format",
        "workspaceId",
        "keyVersion",
        "ciphertext",
        "payloadDigest",
      ]);
      if (
        wrapper?.format !== WRAPPER_FORMAT ||
        wrapper.keyVersion !== KEY_VERSION ||
        typeof wrapper.ciphertext !== "string" ||
        typeof wrapper.payloadDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(wrapper.payloadDigest)
      ) {
        throw new WorkspaceKeyCustodyError("wrapper_invalid");
      }
      if (wrapper.workspaceId !== workspaceId) {
        throw new WorkspaceKeyCustodyError("wrapper_context_mismatch");
      }
      ciphertext = Buffer.from(wrapper.ciphertext, "base64");
      if (
        ciphertext.length === 0 ||
        ciphertext.toString("base64") !== wrapper.ciphertext
      ) {
        throw new WorkspaceKeyCustodyError("wrapper_invalid");
      }
      const payloadText = await this.safeStorage.decryptStringAsync(ciphertext);
      const actualDigest = Buffer.from(sha256(payloadText), "hex");
      const expectedDigest = Buffer.from(wrapper.payloadDigest, "hex");
      try {
        if (!timingSafeEqual(actualDigest, expectedDigest)) {
          throw new WorkspaceKeyCustodyError("wrapper_invalid");
        }
      } finally {
        actualDigest.fill(0);
        expectedDigest.fill(0);
      }
      const payload = exactObject(parseJson(payloadText), [
        "format",
        "workspaceId",
        "keyVersion",
        "keyMaterial",
      ]);
      if (
        payload?.format !== PAYLOAD_FORMAT ||
        payload.workspaceId !== workspaceId ||
        payload.keyVersion !== KEY_VERSION ||
        typeof payload.keyMaterial !== "string"
      ) {
        throw new WorkspaceKeyCustodyError(
          payload?.workspaceId === workspaceId
            ? "wrapper_invalid"
            : "wrapper_context_mismatch",
        );
      }
      const key = Buffer.from(payload.keyMaterial, "base64url");
      if (
        key.length !== 32 ||
        key.toString("base64url") !== payload.keyMaterial
      ) {
        key.fill(0);
        throw new WorkspaceKeyCustodyError("wrapper_invalid");
      }
      return key;
    } catch (error) {
      if (error instanceof WorkspaceKeyCustodyError) throw error;
      throw new WorkspaceKeyCustodyError("wrapper_invalid");
    } finally {
      contents?.fill(0);
      ciphertext?.fill(0);
    }
  }
}
