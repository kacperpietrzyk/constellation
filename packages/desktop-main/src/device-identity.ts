import { randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
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

import { DeviceIdSchema, type DeviceId } from "@constellation/contracts";

const DEVICE_IDENTITY_FORMAT = "constellation.device-identity/v1";
const MAX_IDENTITY_BYTES = 1024;

export interface DeviceIdentity {
  readonly format: typeof DEVICE_IDENTITY_FORMAT;
  readonly deviceId: DeviceId;
}

export class DeviceIdentityError extends Error {
  public constructor(
    public readonly code: "identity_invalid" | "identity_io_failed",
  ) {
    super(`Device identity failed: ${code}.`);
    this.name = "DeviceIdentityError";
  }
}

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

const parseIdentity = (contents: string): DeviceIdentity => {
  let value: unknown;
  try {
    value = JSON.parse(contents) as unknown;
  } catch {
    throw new DeviceIdentityError("identity_invalid");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DeviceIdentityError("identity_invalid");
  }
  const record = value as Record<string, unknown>;
  const parsedId = DeviceIdSchema.safeParse(record.deviceId);
  if (
    Object.keys(record).sort().join(",") !== "deviceId,format" ||
    record.format !== DEVICE_IDENTITY_FORMAT ||
    !parsedId.success ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(parsedId.data)
  ) {
    throw new DeviceIdentityError("identity_invalid");
  }
  return { format: DEVICE_IDENTITY_FORMAT, deviceId: parsedId.data };
};

const readIdentity = (filename: string): DeviceIdentity => {
  let metadata;
  try {
    metadata = lstatSync(filename);
  } catch {
    throw new DeviceIdentityError("identity_io_failed");
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    metadata.size <= 0 ||
    metadata.size > MAX_IDENTITY_BYTES
  ) {
    throw new DeviceIdentityError("identity_invalid");
  }
  return parseIdentity(readFileSync(filename, "utf8"));
};

export const loadOrCreateDeviceIdentity = (
  stateRoot: string,
): DeviceIdentity => {
  const directory = path.join(stateRoot, "device");
  const filename = path.join(directory, "identity.json");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (existsSync(filename)) return readIdentity(filename);

  const identity: DeviceIdentity = {
    format: DEVICE_IDENTITY_FORMAT,
    deviceId: DeviceIdSchema.parse(randomUUID()),
  };
  const contents = `${JSON.stringify(identity)}\n`;
  const temporary = path.join(
    directory,
    `.identity.json.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, filename);
    unlinkSync(temporary);
    syncDirectory(directory);
    return readIdentity(filename);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original publication failure.
      }
    }
    rmSync(temporary, { force: true });
    if (error instanceof DeviceIdentityError) throw error;
    if (existsSync(filename)) return readIdentity(filename);
    throw new DeviceIdentityError("identity_io_failed");
  }
};
