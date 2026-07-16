import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import {
  HubAttachmentBeginRequestSchema,
  HubAttachmentUploadSchema,
  isCustodiedCaptureOriginal,
  type CaptureOriginal,
  type HubAttachmentBeginRequest,
  type HubAttachmentUpload,
  type WorkspaceId,
} from "@constellation/contracts";
import type { Pool } from "pg";

import type { HubRepository } from "./repository.js";

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

const exists = async (filename: string): Promise<boolean> =>
  access(filename).then(
    () => true,
    () => false,
  );

const digestFile = async (filename: string): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
};

export class HubAttachmentError extends Error {
  public constructor(
    public readonly code:
      | "credential_invalid"
      | "device_revoked"
      | "workspace_mismatch"
      | "upload_not_found"
      | "offset_mismatch"
      | "chunk_too_large"
      | "length_mismatch"
      | "digest_mismatch",
    public readonly expectedOffset?: number,
  ) {
    super(code);
  }
}

export class HubAttachmentService {
  public constructor(
    private readonly pool: Pool,
    private readonly repository: HubRepository,
    private readonly root: string,
  ) {}

  private async authorize(
    credential: string,
    input: Pick<HubAttachmentBeginRequest, "workspaceId" | "deviceId">,
  ): Promise<void> {
    const auth = await this.repository.authenticate({
      ...input,
      credentialDigest: createHash("sha256").update(credential).digest("hex"),
    });
    if (auth.outcome === "rejected") throw new HubAttachmentError(auth.code);
  }

  private stagingPath(uploadId: string): string {
    return path.join(this.root, "staging", uploadId);
  }

  private objectPath(workspaceId: string, digest: string): string {
    return path.join(
      this.root,
      "objects",
      workspaceId,
      digest.slice(0, 2),
      digest,
    );
  }

  public async isAvailable(
    workspaceId: WorkspaceId,
    original: CaptureOriginal,
  ): Promise<boolean> {
    if (!isCustodiedCaptureOriginal(original)) return false;
    const result = await this.pool.query(
      "SELECT storage_key, byte_length::text FROM constellation_hub_attachments WHERE workspace_id = $1 AND content_sha256 = $2",
      [workspaceId, original.payload.contentSha256],
    );
    if (result.rowCount !== 1) return false;
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (
      row === undefined ||
      Number(row.byte_length) !== original.payload.byteLength ||
      typeof row.storage_key !== "string"
    )
      return false;
    try {
      const target = path.join(this.root, row.storage_key);
      const info = await stat(target);
      return (
        info.isFile() &&
        info.size === original.payload.byteLength &&
        (await digestFile(target)) === original.payload.contentSha256
      );
    } catch {
      return false;
    }
  }

  public async readCapturePayloadChunk(input: {
    readonly workspaceId: WorkspaceId;
    readonly original: CaptureOriginal;
    readonly offset: number;
    readonly length: number;
  }): Promise<Uint8Array | undefined> {
    if (
      !isCustodiedCaptureOriginal(input.original) ||
      !Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      !Number.isSafeInteger(input.length) ||
      input.length <= 0 ||
      input.offset >= input.original.payload.byteLength
    )
      return undefined;
    const registered = await this.pool.query(
      "SELECT byte_length::text FROM constellation_hub_attachments WHERE workspace_id = $1 AND content_sha256 = $2",
      [input.workspaceId, input.original.payload.contentSha256],
    );
    if (
      registered.rowCount !== 1 ||
      Number(
        (registered.rows[0] as Record<string, unknown> | undefined)
          ?.byte_length,
      ) !== input.original.payload.byteLength
    )
      return undefined;
    const target = this.objectPath(
      input.workspaceId,
      input.original.payload.contentSha256,
    );
    try {
      const info = await stat(target);
      if (!info.isFile() || info.size !== input.original.payload.byteLength)
        return undefined;
      const size = Math.min(input.length, info.size - input.offset);
      const bytes = Buffer.alloc(size);
      const file = await open(target, "r");
      try {
        const result = await file.read(bytes, 0, size, input.offset);
        return result.bytesRead === size ? bytes : undefined;
      } finally {
        await file.close();
      }
    } catch {
      return undefined;
    }
  }

  public async deleteCapturePayload(input: {
    readonly workspaceId: WorkspaceId;
    readonly original: CaptureOriginal;
  }): Promise<boolean> {
    if (!isCustodiedCaptureOriginal(input.original)) return false;
    const digest = input.original.payload.contentSha256;
    const registered = await this.pool.query(
      "SELECT storage_key FROM constellation_hub_attachments WHERE workspace_id = $1 AND content_sha256 = $2",
      [input.workspaceId, digest],
    );
    if (registered.rowCount === 0) return true;
    const storageKey = (
      registered.rows[0] as Record<string, unknown> | undefined
    )?.storage_key;
    if (typeof storageKey !== "string") return false;
    const target = path.join(this.root, storageKey);
    await rm(target, { force: true });
    if (await exists(target)) return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM constellation_hub_attachments WHERE workspace_id = $1 AND content_sha256 = $2",
        [input.workspaceId, digest],
      );
      await client.query(
        "DELETE FROM constellation_hub_attachment_uploads WHERE workspace_id = $1 AND content_sha256 = $2",
        [input.workspaceId, digest],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return !(await this.isAvailable(input.workspaceId, input.original));
  }

  public async begin(
    credential: string,
    raw: HubAttachmentBeginRequest,
  ): Promise<HubAttachmentUpload> {
    const input = HubAttachmentBeginRequestSchema.parse(raw);
    await this.authorize(credential, input);
    const existing = await this.pool.query(
      "SELECT upload_id::text, content_sha256, byte_length::text, received_bytes::text, state FROM constellation_hub_attachment_uploads WHERE workspace_id = $1 AND content_sha256 = $2 AND state IN ('staging', 'published')",
      [input.workspaceId, input.contentSha256],
    );
    if (existing.rowCount === 1) {
      const upload = this.parseUpload(existing.rows[0]);
      if (upload.byteLength !== input.byteLength)
        throw new HubAttachmentError("length_mismatch");
      return upload;
    }
    const uploadId = randomUUID();
    await mkdir(path.dirname(this.stagingPath(uploadId)), {
      recursive: true,
      mode: 0o700,
    });
    const file = await open(this.stagingPath(uploadId), "wx", 0o600);
    await file.close();
    try {
      await this.pool.query(
        "INSERT INTO constellation_hub_attachment_uploads (upload_id, workspace_id, device_id, content_sha256, byte_length, state) VALUES ($1, $2, $3, $4, $5, 'staging')",
        [
          uploadId,
          input.workspaceId,
          input.deviceId,
          input.contentSha256,
          input.byteLength,
        ],
      );
    } catch (error) {
      await rm(this.stagingPath(uploadId), { force: true });
      throw error;
    }
    return HubAttachmentUploadSchema.parse({
      uploadId,
      contentSha256: input.contentSha256,
      byteLength: input.byteLength,
      receivedBytes: 0,
      state: "staging",
    });
  }

  private parseUpload(row: Record<string, unknown>): HubAttachmentUpload {
    return HubAttachmentUploadSchema.parse({
      uploadId: row.upload_id,
      contentSha256:
        typeof row.content_sha256 === "string"
          ? row.content_sha256.trim()
          : row.content_sha256,
      byteLength: Number(row.byte_length),
      receivedBytes: Number(row.received_bytes),
      state: row.state,
    });
  }

  public async append(input: {
    readonly credential: string;
    readonly workspaceId: HubAttachmentBeginRequest["workspaceId"];
    readonly deviceId: HubAttachmentBeginRequest["deviceId"];
    readonly uploadId: string;
    readonly offset: number;
    readonly chunk: Uint8Array;
  }): Promise<HubAttachmentUpload> {
    await this.authorize(input.credential, input);
    if (input.chunk.byteLength > MAX_CHUNK_BYTES)
      throw new HubAttachmentError("chunk_too_large");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT upload_id::text, content_sha256, byte_length::text, received_bytes::text, state FROM constellation_hub_attachment_uploads WHERE upload_id = $1 AND workspace_id = $2 AND device_id = $3 FOR UPDATE",
        [input.uploadId, input.workspaceId, input.deviceId],
      );
      if (result.rowCount !== 1)
        throw new HubAttachmentError("upload_not_found");
      const upload = this.parseUpload(result.rows[0]);
      if (upload.receivedBytes !== input.offset)
        throw new HubAttachmentError("offset_mismatch", upload.receivedBytes);
      if (input.offset + input.chunk.byteLength > upload.byteLength)
        throw new HubAttachmentError("length_mismatch");
      const file = await open(this.stagingPath(input.uploadId), "r+");
      try {
        await file.write(input.chunk, 0, input.chunk.byteLength, input.offset);
        await file.sync();
      } finally {
        await file.close();
      }
      const receivedBytes = input.offset + input.chunk.byteLength;
      await client.query(
        "UPDATE constellation_hub_attachment_uploads SET received_bytes = $1, updated_at = now() WHERE upload_id = $2",
        [receivedBytes, input.uploadId],
      );
      await client.query("COMMIT");
      return { ...upload, receivedBytes };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async publish(input: {
    readonly credential: string;
    readonly workspaceId: HubAttachmentBeginRequest["workspaceId"];
    readonly deviceId: HubAttachmentBeginRequest["deviceId"];
    readonly uploadId: string;
  }): Promise<HubAttachmentUpload> {
    await this.authorize(input.credential, input);
    const result = await this.pool.query(
      "SELECT upload_id::text, content_sha256, byte_length::text, received_bytes::text, state FROM constellation_hub_attachment_uploads WHERE upload_id = $1 AND workspace_id = $2 AND device_id = $3",
      [input.uploadId, input.workspaceId, input.deviceId],
    );
    if (result.rowCount !== 1) throw new HubAttachmentError("upload_not_found");
    const upload = this.parseUpload(result.rows[0]);
    if (upload.receivedBytes !== upload.byteLength)
      throw new HubAttachmentError("length_mismatch");
    const staging = this.stagingPath(input.uploadId);
    const target = this.objectPath(input.workspaceId, upload.contentSha256);
    const source = (await exists(staging))
      ? staging
      : (await exists(target))
        ? target
        : undefined;
    if (source === undefined) throw new HubAttachmentError("upload_not_found");
    const sourceStat = await stat(source);
    if (sourceStat.size !== upload.byteLength)
      throw new HubAttachmentError("length_mismatch");
    const actual = await digestFile(source);
    if (actual !== upload.contentSha256) {
      await this.pool.query(
        "UPDATE constellation_hub_attachment_uploads SET state = 'failed', updated_at = now() WHERE upload_id = $1",
        [input.uploadId],
      );
      throw new HubAttachmentError("digest_mismatch");
    }
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    if (source === staging) await rename(staging, target);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO constellation_hub_attachments (workspace_id, content_sha256, byte_length, storage_key) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [
          input.workspaceId,
          actual,
          upload.byteLength,
          path.relative(this.root, target),
        ],
      );
      await client.query(
        "UPDATE constellation_hub_attachment_uploads SET state = 'published', updated_at = now() WHERE upload_id = $1",
        [input.uploadId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return { ...upload, state: "published" };
  }

  public async openObject(
    workspaceId: string,
    digest: string,
    range?: { readonly start: number; readonly end: number },
  ): Promise<{
    readonly byteLength: number;
    readonly stream: ReturnType<typeof createReadStream>;
  }> {
    const target = this.objectPath(workspaceId, digest);
    const info = await stat(target);
    if (
      range !== undefined &&
      (range.start < 0 || range.end < range.start || range.end >= info.size)
    )
      throw new HubAttachmentError("length_mismatch");
    return { byteLength: info.size, stream: createReadStream(target, range) };
  }

  public async openAuthorized(input: {
    readonly credential: string;
    readonly workspaceId: HubAttachmentBeginRequest["workspaceId"];
    readonly deviceId: HubAttachmentBeginRequest["deviceId"];
    readonly digest: string;
    readonly range?: { readonly start: number; readonly end: number };
  }): Promise<{
    readonly byteLength: number;
    readonly stream: ReturnType<typeof createReadStream>;
  }> {
    await this.authorize(input.credential, input);
    if (!/^[0-9a-f]{64}$/u.test(input.digest))
      throw new HubAttachmentError("upload_not_found");
    return this.openObject(input.workspaceId, input.digest, input.range);
  }
}
