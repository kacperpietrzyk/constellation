import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { WorkspaceIdSchema, type WorkspaceId } from "@constellation/contracts";

const MAGIC = Buffer.from("CONSTELLATION-BACKUP\n", "ascii");
const ARCHIVE_FORMAT = "constellation.workspace-backup/v1";
const ENVELOPE_ALGORITHM = "aes-256-gcm";
const RECOVERY_CODE_PREFIX = "cst1_";
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_DATABASE_BYTES = 512 * 1024 * 1024;
const AUTH_TAG_BYTES = 16;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

export type WorkspaceBackupArchiveErrorCode =
  | "archive_exists"
  | "archive_invalid"
  | "archive_too_large"
  | "archive_unsupported"
  | "archive_io_failed"
  | "recovery_code_invalid";

export class WorkspaceBackupArchiveError extends Error {
  public constructor(public readonly code: WorkspaceBackupArchiveErrorCode) {
    super(`Workspace backup archive failed: ${code}.`);
    this.name = "WorkspaceBackupArchiveError";
  }
}

export interface WorkspaceBackupMetadata {
  readonly archiveId: string;
  readonly workspaceId: WorkspaceId;
  readonly workspaceName: string;
  readonly createdAt: string;
  readonly appVersion: string;
  readonly databaseByteLength: number;
  readonly databaseDigest: string;
}

interface WorkspaceBackupHeader extends WorkspaceBackupMetadata {
  readonly format: typeof ARCHIVE_FORMAT;
  readonly envelopeAlgorithm: typeof ENVELOPE_ALGORITHM;
  readonly recoveryCodeContract: "direct-random-256-bit/v1";
  readonly wrappedKeyContract: "sqlcipher-raw-256-bit/v1";
  readonly nonce: string;
  readonly wrappedExportKey: string;
  readonly authenticationTag: string;
}

export interface ExtractedWorkspaceBackup {
  readonly metadata: WorkspaceBackupMetadata;
  readonly exportKey: Buffer;
}

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const syncDirectory = (directory: string): void => {
  if (process.platform === "win32") return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

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

const decodeCanonicalBase64 = (
  value: unknown,
  expectedBytes: number,
): Buffer => {
  if (typeof value !== "string") {
    throw new WorkspaceBackupArchiveError("archive_invalid");
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.byteLength !== expectedBytes ||
    decoded.toString("base64") !== value
  ) {
    decoded.fill(0);
    throw new WorkspaceBackupArchiveError("archive_invalid");
  }
  return decoded;
};

const decodeRecoveryCode = (value: string): Buffer => {
  const normalized = value.trim();
  if (!normalized.startsWith(RECOVERY_CODE_PREFIX)) {
    throw new WorkspaceBackupArchiveError("recovery_code_invalid");
  }
  const encoded = normalized.slice(RECOVERY_CODE_PREFIX.length);
  const key = Buffer.from(encoded, "base64url");
  if (key.byteLength !== KEY_BYTES || key.toString("base64url") !== encoded) {
    key.fill(0);
    throw new WorkspaceBackupArchiveError("recovery_code_invalid");
  }
  return key;
};

const headerAad = (
  header: Omit<
    WorkspaceBackupHeader,
    "nonce" | "wrappedExportKey" | "authenticationTag"
  >,
): Buffer => Buffer.from(canonicalJson(header), "utf8");

const metadataFromHeader = (
  header: WorkspaceBackupHeader,
): WorkspaceBackupMetadata => ({
  archiveId: header.archiveId,
  workspaceId: header.workspaceId,
  workspaceName: header.workspaceName,
  createdAt: header.createdAt,
  appVersion: header.appVersion,
  databaseByteLength: header.databaseByteLength,
  databaseDigest: header.databaseDigest,
});

const parseHeader = (value: Uint8Array): WorkspaceBackupHeader => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value).toString("utf8")) as unknown;
  } catch {
    throw new WorkspaceBackupArchiveError("archive_invalid");
  }
  const header = exactObject(parsed, [
    "format",
    "archiveId",
    "workspaceId",
    "workspaceName",
    "createdAt",
    "appVersion",
    "databaseByteLength",
    "databaseDigest",
    "envelopeAlgorithm",
    "recoveryCodeContract",
    "wrappedKeyContract",
    "nonce",
    "wrappedExportKey",
    "authenticationTag",
  ]);
  if (header?.format !== ARCHIVE_FORMAT) {
    throw new WorkspaceBackupArchiveError(
      typeof header?.format === "string"
        ? "archive_unsupported"
        : "archive_invalid",
    );
  }
  const workspaceId = WorkspaceIdSchema.safeParse(header.workspaceId);
  if (
    !workspaceId.success ||
    typeof header.archiveId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(header.archiveId) ||
    typeof header.workspaceName !== "string" ||
    header.workspaceName.length < 1 ||
    header.workspaceName.length > 200 ||
    typeof header.createdAt !== "string" ||
    Number.isNaN(Date.parse(header.createdAt)) ||
    typeof header.appVersion !== "string" ||
    !/^[\x20-\x7e]{1,80}$/.test(header.appVersion) ||
    typeof header.databaseByteLength !== "number" ||
    !Number.isSafeInteger(header.databaseByteLength) ||
    header.databaseByteLength <= 0 ||
    header.databaseByteLength > MAX_DATABASE_BYTES ||
    typeof header.databaseDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(header.databaseDigest) ||
    header.envelopeAlgorithm !== ENVELOPE_ALGORITHM ||
    header.recoveryCodeContract !== "direct-random-256-bit/v1" ||
    header.wrappedKeyContract !== "sqlcipher-raw-256-bit/v1"
  ) {
    throw new WorkspaceBackupArchiveError("archive_invalid");
  }
  decodeCanonicalBase64(header.nonce, NONCE_BYTES).fill(0);
  decodeCanonicalBase64(header.wrappedExportKey, KEY_BYTES).fill(0);
  decodeCanonicalBase64(header.authenticationTag, AUTH_TAG_BYTES).fill(0);
  return {
    format: ARCHIVE_FORMAT,
    archiveId: header.archiveId,
    workspaceId: workspaceId.data,
    workspaceName: header.workspaceName,
    createdAt: header.createdAt,
    appVersion: header.appVersion,
    databaseByteLength: header.databaseByteLength,
    databaseDigest: header.databaseDigest,
    envelopeAlgorithm: ENVELOPE_ALGORITHM,
    recoveryCodeContract: "direct-random-256-bit/v1",
    wrappedKeyContract: "sqlcipher-raw-256-bit/v1",
    nonce: header.nonce as string,
    wrappedExportKey: header.wrappedExportKey as string,
    authenticationTag: header.authenticationTag as string,
  };
};

const readArchive = (
  filename: string,
): {
  readonly header: WorkspaceBackupHeader;
  readonly database: Buffer;
} => {
  let metadata;
  try {
    metadata = lstatSync(filename);
  } catch {
    throw new WorkspaceBackupArchiveError("archive_io_failed");
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size <= MAGIC.byteLength + 4 ||
    metadata.size > MAGIC.byteLength + 4 + MAX_HEADER_BYTES + MAX_DATABASE_BYTES
  ) {
    throw new WorkspaceBackupArchiveError(
      metadata.size > MAX_DATABASE_BYTES
        ? "archive_too_large"
        : "archive_invalid",
    );
  }
  const archive = readFileSync(filename);
  try {
    if (!archive.subarray(0, MAGIC.byteLength).equals(MAGIC)) {
      throw new WorkspaceBackupArchiveError("archive_invalid");
    }
    const headerLength = archive.readUInt32BE(MAGIC.byteLength);
    if (headerLength <= 0 || headerLength > MAX_HEADER_BYTES) {
      throw new WorkspaceBackupArchiveError("archive_invalid");
    }
    const headerStart = MAGIC.byteLength + 4;
    const databaseStart = headerStart + headerLength;
    if (databaseStart >= archive.byteLength) {
      throw new WorkspaceBackupArchiveError("archive_invalid");
    }
    const header = parseHeader(archive.subarray(headerStart, databaseStart));
    const database = Buffer.from(archive.subarray(databaseStart));
    if (
      database.byteLength !== header.databaseByteLength ||
      sha256(database) !== header.databaseDigest
    ) {
      database.fill(0);
      throw new WorkspaceBackupArchiveError("archive_invalid");
    }
    return { header, database };
  } finally {
    archive.fill(0);
  }
};

export const createRecoveryCode = (): {
  readonly code: string;
  readonly key: Buffer;
} => {
  const key = randomBytes(KEY_BYTES);
  return { code: `${RECOVERY_CODE_PREFIX}${key.toString("base64url")}`, key };
};

export const readWorkspaceBackupMetadata = (
  filename: string,
): WorkspaceBackupMetadata => {
  const archive = readArchive(filename);
  archive.database.fill(0);
  return metadataFromHeader(archive.header);
};

export const publishWorkspaceBackupArchive = (input: {
  readonly filename: string;
  readonly databasePath: string;
  readonly workspaceId: WorkspaceId;
  readonly workspaceName: string;
  readonly appVersion: string;
  readonly createdAt: string;
  readonly exportKey: Buffer;
  readonly recoveryKey: Buffer;
}): WorkspaceBackupMetadata => {
  if (
    input.exportKey.byteLength !== KEY_BYTES ||
    input.recoveryKey.byteLength !== KEY_BYTES
  ) {
    input.exportKey.fill(0);
    input.recoveryKey.fill(0);
    throw new WorkspaceBackupArchiveError("archive_invalid");
  }
  const database = readFileSync(input.databasePath);
  if (database.byteLength <= 0 || database.byteLength > MAX_DATABASE_BYTES) {
    database.fill(0);
    input.exportKey.fill(0);
    input.recoveryKey.fill(0);
    throw new WorkspaceBackupArchiveError("archive_too_large");
  }
  const headerBase = {
    format: ARCHIVE_FORMAT as typeof ARCHIVE_FORMAT,
    archiveId: randomUUID(),
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    createdAt: input.createdAt,
    appVersion: input.appVersion,
    databaseByteLength: database.byteLength,
    databaseDigest: sha256(database),
    envelopeAlgorithm: ENVELOPE_ALGORITHM as typeof ENVELOPE_ALGORITHM,
    recoveryCodeContract: "direct-random-256-bit/v1" as const,
    wrappedKeyContract: "sqlcipher-raw-256-bit/v1" as const,
  };
  const nonce = randomBytes(NONCE_BYTES);
  const aad = headerAad(headerBase);
  let wrappedKey: Buffer | undefined;
  let authenticationTag: Buffer | undefined;
  try {
    const cipher = createCipheriv(
      ENVELOPE_ALGORITHM,
      input.recoveryKey,
      nonce,
      { authTagLength: AUTH_TAG_BYTES },
    );
    cipher.setAAD(aad);
    wrappedKey = Buffer.concat([
      cipher.update(input.exportKey),
      cipher.final(),
    ]);
    authenticationTag = cipher.getAuthTag();
    const header: WorkspaceBackupHeader = {
      ...headerBase,
      nonce: nonce.toString("base64"),
      wrappedExportKey: wrappedKey.toString("base64"),
      authenticationTag: authenticationTag.toString("base64"),
    };
    const serializedHeader = Buffer.from(canonicalJson(header), "utf8");
    if (serializedHeader.byteLength > MAX_HEADER_BYTES) {
      throw new WorkspaceBackupArchiveError("archive_invalid");
    }
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(serializedHeader.byteLength);
    const archive = Buffer.concat([MAGIC, length, serializedHeader, database]);
    if (
      archive.includes(input.recoveryKey) ||
      archive.includes(input.exportKey) ||
      archive.includes(Buffer.from(input.recoveryKey.toString("base64url")))
    ) {
      archive.fill(0);
      throw new WorkspaceBackupArchiveError("archive_invalid");
    }
    const directory = path.dirname(input.filename);
    const temporary = path.join(
      directory,
      `.${path.basename(input.filename)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
    );
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, "wx", 0o600);
      writeFileSync(descriptor, archive);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      try {
        linkSync(temporary, input.filename);
      } catch {
        throw new WorkspaceBackupArchiveError("archive_exists");
      }
      unlinkSync(temporary);
      syncDirectory(directory);
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      rmSync(temporary, { force: true });
      if (error instanceof WorkspaceBackupArchiveError) throw error;
      throw new WorkspaceBackupArchiveError("archive_io_failed");
    } finally {
      archive.fill(0);
      serializedHeader.fill(0);
    }
    return metadataFromHeader(header);
  } finally {
    database.fill(0);
    input.exportKey.fill(0);
    input.recoveryKey.fill(0);
    nonce.fill(0);
    aad.fill(0);
    wrappedKey?.fill(0);
    authenticationTag?.fill(0);
  }
};

export const extractWorkspaceBackup = (input: {
  readonly filename: string;
  readonly recoveryCode: string;
  readonly destinationPath: string;
}): ExtractedWorkspaceBackup => {
  const recoveryKey = decodeRecoveryCode(input.recoveryCode);
  const archive = readArchive(input.filename);
  const nonce = decodeCanonicalBase64(archive.header.nonce, NONCE_BYTES);
  const wrappedKey = decodeCanonicalBase64(
    archive.header.wrappedExportKey,
    KEY_BYTES,
  );
  const authenticationTag = decodeCanonicalBase64(
    archive.header.authenticationTag,
    AUTH_TAG_BYTES,
  );
  const headerBase = {
    format: archive.header.format,
    archiveId: archive.header.archiveId,
    workspaceId: archive.header.workspaceId,
    workspaceName: archive.header.workspaceName,
    createdAt: archive.header.createdAt,
    appVersion: archive.header.appVersion,
    databaseByteLength: archive.header.databaseByteLength,
    databaseDigest: archive.header.databaseDigest,
    envelopeAlgorithm: archive.header.envelopeAlgorithm,
    recoveryCodeContract: archive.header.recoveryCodeContract,
    wrappedKeyContract: archive.header.wrappedKeyContract,
  };
  const aad = headerAad(headerBase);
  let exportKey: Buffer | undefined;
  try {
    const decipher = createDecipheriv(ENVELOPE_ALGORITHM, recoveryKey, nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(authenticationTag);
    try {
      exportKey = Buffer.concat([
        decipher.update(wrappedKey),
        decipher.final(),
      ]);
    } catch {
      throw new WorkspaceBackupArchiveError("recovery_code_invalid");
    }
    if (exportKey.byteLength !== KEY_BYTES) {
      exportKey.fill(0);
      throw new WorkspaceBackupArchiveError("archive_invalid");
    }
    let descriptor: number | undefined;
    try {
      descriptor = openSync(input.destinationPath, "wx", 0o600);
      writeFileSync(descriptor, archive.database);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
    } catch {
      if (descriptor !== undefined) closeSync(descriptor);
      rmSync(input.destinationPath, { force: true });
      exportKey.fill(0);
      throw new WorkspaceBackupArchiveError("archive_io_failed");
    }
    return {
      metadata: metadataFromHeader(archive.header),
      exportKey,
    };
  } finally {
    recoveryKey.fill(0);
    archive.database.fill(0);
    nonce.fill(0);
    wrappedKey.fill(0);
    authenticationTag.fill(0);
    aad.fill(0);
  }
};
