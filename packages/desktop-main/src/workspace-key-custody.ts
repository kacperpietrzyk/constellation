import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  constants,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  CredentialIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  type CredentialId,
  type GrantId,
  type PrincipalId,
  type SpaceId,
  type WorkspaceId,
} from "@constellation/contracts";

const PAYLOAD_FORMAT = "constellation.workspace-key-payload/v3";
const WRAPPER_FORMAT = "constellation.workspace-key-wrapper/v3";
const KEY_VERSION = 1;
const MAX_WRAPPER_BYTES = 64 * 1024;

export interface AsyncSafeStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{
    readonly result: string;
    readonly shouldReEncrypt: boolean;
  }>;
}

export type WorkspaceLifecycleState = "prepared" | "ready";

export interface WorkspaceBootstrapIdentity {
  readonly workspaceId: WorkspaceId;
  readonly rootSpaceId: SpaceId;
  readonly principalId: PrincipalId;
  readonly credentialId: CredentialId;
  readonly grantId: GrantId;
}

export interface WorkspaceKeyBundle {
  readonly identity: WorkspaceBootstrapIdentity;
  readonly key: Buffer;
  readonly state: WorkspaceLifecycleState;
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

const syncDirectory = (directory: string): void => {
  if (process.platform === "win32") return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, constants.O_RDONLY);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
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
    syncDirectory(directory);
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

const replaceAtomically = (filename: string, contents: Buffer): void => {
  assertRegularFile(filename);
  const directory = path.dirname(filename);
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
    renameSync(temporary, filename);
    syncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the replacement failure.
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

  public discoverWorkspaceId(): WorkspaceId {
    assertRegularFile(this.wrapperPath);
    let contents: Buffer | undefined;
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
        wrapper.keyVersion !== KEY_VERSION
      ) {
        throw new WorkspaceKeyCustodyError("wrapper_invalid");
      }
      const workspaceId = WorkspaceIdSchema.safeParse(wrapper.workspaceId);
      if (!workspaceId.success) {
        throw new WorkspaceKeyCustodyError("wrapper_invalid");
      }
      return workspaceId.data;
    } finally {
      contents?.fill(0);
    }
  }

  private async wrap(
    identity: WorkspaceBootstrapIdentity,
    key: Buffer,
    state: WorkspaceLifecycleState,
  ): Promise<Buffer> {
    const payload = JSON.stringify({
      format: PAYLOAD_FORMAT,
      workspaceId: identity.workspaceId,
      rootSpaceId: identity.rootSpaceId,
      principalId: identity.principalId,
      credentialId: identity.credentialId,
      grantId: identity.grantId,
      workspaceState: state,
      keyVersion: KEY_VERSION,
      keyMaterial: key.toString("base64url"),
    });
    const ciphertext = await this.safeStorage.encryptStringAsync(payload);
    const wrapper = {
      format: WRAPPER_FORMAT,
      workspaceId: identity.workspaceId,
      keyVersion: KEY_VERSION,
      ciphertext: ciphertext.toString("base64"),
      payloadDigest: sha256(payload),
    };
    const contents = Buffer.from(`${JSON.stringify(wrapper)}\n`, "utf8");
    if (
      contents.includes(key) ||
      contents.includes(Buffer.from(key.toString("base64url"), "utf8"))
    ) {
      contents.fill(0);
      throw new WorkspaceKeyCustodyError("wrapper_invalid");
    }
    return contents;
  }

  public async create(
    identity: WorkspaceBootstrapIdentity,
  ): Promise<WorkspaceKeyBundle> {
    if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
      throw new WorkspaceKeyCustodyError("encryption_unavailable");
    }
    const key = randomBytes(32);
    let wrapperContents: Buffer | undefined;
    try {
      wrapperContents = await this.wrap(identity, key, "prepared");
      publishAtomically(this.wrapperPath, wrapperContents);
      return { identity, key, state: "prepared" };
    } catch (error) {
      key.fill(0);
      if (error instanceof WorkspaceKeyCustodyError) throw error;
      throw new WorkspaceKeyCustodyError("wrapper_io_failed");
    } finally {
      wrapperContents?.fill(0);
    }
  }

  public async load(workspaceId: WorkspaceId): Promise<WorkspaceKeyBundle> {
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
      const decrypted = await this.safeStorage.decryptStringAsync(ciphertext);
      const payloadText = decrypted.result;
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
        "rootSpaceId",
        "principalId",
        "credentialId",
        "grantId",
        "workspaceState",
        "keyVersion",
        "keyMaterial",
      ]);
      if (
        payload?.format !== PAYLOAD_FORMAT ||
        payload.workspaceId !== workspaceId ||
        payload.keyVersion !== KEY_VERSION ||
        (payload.workspaceState !== "prepared" &&
          payload.workspaceState !== "ready") ||
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
      const identityResult = {
        workspaceId: WorkspaceIdSchema.safeParse(payload.workspaceId),
        rootSpaceId: SpaceIdSchema.safeParse(payload.rootSpaceId),
        principalId: PrincipalIdSchema.safeParse(payload.principalId),
        credentialId: CredentialIdSchema.safeParse(payload.credentialId),
        grantId: GrantIdSchema.safeParse(payload.grantId),
      };
      if (
        !identityResult.workspaceId.success ||
        !identityResult.rootSpaceId.success ||
        !identityResult.principalId.success ||
        !identityResult.credentialId.success ||
        !identityResult.grantId.success
      ) {
        key.fill(0);
        throw new WorkspaceKeyCustodyError("wrapper_invalid");
      }
      const bundle: WorkspaceKeyBundle = {
        key,
        state: payload.workspaceState,
        identity: {
          workspaceId: identityResult.workspaceId.data,
          rootSpaceId: identityResult.rootSpaceId.data,
          principalId: identityResult.principalId.data,
          credentialId: identityResult.credentialId.data,
          grantId: identityResult.grantId.data,
        },
      };
      if (decrypted.shouldReEncrypt) {
        const rotated = await this.wrap(bundle.identity, key, bundle.state);
        try {
          replaceAtomically(this.wrapperPath, rotated);
        } finally {
          rotated.fill(0);
        }
      }
      return bundle;
    } catch (error) {
      if (error instanceof WorkspaceKeyCustodyError) throw error;
      throw new WorkspaceKeyCustodyError("wrapper_invalid");
    } finally {
      contents?.fill(0);
      ciphertext?.fill(0);
    }
  }

  public async markReady(workspaceId: WorkspaceId): Promise<void> {
    const bundle = await this.load(workspaceId);
    try {
      if (bundle.state === "ready") return;
      const contents = await this.wrap(bundle.identity, bundle.key, "ready");
      try {
        replaceAtomically(this.wrapperPath, contents);
      } finally {
        contents.fill(0);
      }
    } finally {
      bundle.key.fill(0);
    }
  }
}
