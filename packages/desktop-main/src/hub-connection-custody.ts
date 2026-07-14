import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  DeviceIdSchema,
  WorkspaceIdSchema,
  type DeviceId,
  type WorkspaceId,
} from "@constellation/contracts";

import type { AsyncSafeStorage } from "./workspace-key-custody.js";

const FORMAT = "constellation.hub-connection/v1";

export interface HubConnection {
  readonly workspaceId: WorkspaceId;
  readonly deviceId: DeviceId;
  readonly origin: string;
  readonly deviceCredential: string;
  readonly providerInstanceId: string;
}

const safeFile = (filename: string): void => {
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error("Hub connection custody file is unsafe.");
  }
};

const syncDirectory = (directory: string): void => {
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

export class HubConnectionCustody {
  private readonly filename: string;

  public constructor(
    stateRoot: string,
    private readonly safeStorage: AsyncSafeStorage,
  ) {
    this.filename = path.join(stateRoot, "hub", "connection.json");
  }

  public exists(): boolean {
    return existsSync(this.filename);
  }

  public async create(connection: HubConnection): Promise<void> {
    if (this.exists())
      throw new Error("A Hub connection is already configured.");
    if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error("Operating-system credential protection is unavailable.");
    }
    const directory = path.dirname(this.filename);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const encrypted = await this.safeStorage.encryptStringAsync(
      connection.deviceCredential,
    );
    const record = {
      format: FORMAT,
      workspaceId: connection.workspaceId,
      deviceId: connection.deviceId,
      origin: new URL(connection.origin).origin,
      providerInstanceId: connection.providerInstanceId,
      credentialCiphertext: Buffer.from(encrypted).toString("base64"),
    };
    const temporary = `${this.filename}.tmp`;
    rmSync(temporary, { force: true });
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(record)}\n`, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, this.filename);
    syncDirectory(directory);
  }

  public async load(): Promise<HubConnection | undefined> {
    if (!this.exists()) return undefined;
    safeFile(this.filename);
    const raw = JSON.parse(readFileSync(this.filename, "utf8")) as unknown;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Hub connection custody record is invalid.");
    }
    const record = raw as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(",") !==
        "credentialCiphertext,deviceId,format,origin,providerInstanceId,workspaceId" ||
      record.format !== FORMAT ||
      typeof record.origin !== "string" ||
      typeof record.providerInstanceId !== "string" ||
      typeof record.credentialCiphertext !== "string"
    ) {
      throw new Error("Hub connection custody record is invalid.");
    }
    const workspaceId = WorkspaceIdSchema.parse(record.workspaceId);
    const deviceId = DeviceIdSchema.parse(record.deviceId);
    const decrypted = await this.safeStorage.decryptStringAsync(
      Buffer.from(record.credentialCiphertext, "base64"),
    );
    if (decrypted.shouldReEncrypt) {
      throw new Error(
        "Hub credential requires explicit protected re-encryption.",
      );
    }
    return {
      workspaceId,
      deviceId,
      origin: new URL(record.origin).origin,
      providerInstanceId: record.providerInstanceId,
      deviceCredential: decrypted.result,
    };
  }
}
