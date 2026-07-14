import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";

import {
  CommandEnvelopeSchema,
  CorrelationIdSchema,
  DeviceIdSchema,
  DocumentIdSchema,
  DocumentRevisionIdSchema,
  ExecutionContextSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  type ExecutionContext,
} from "@constellation/contracts";
import { createReferenceHarness } from "@constellation/testkit";
import { YjsRealtimeDocumentAdapter } from "@constellation/realtime-documents";
import { Pool } from "pg";

import {
  HubService,
  HubAttachmentError,
  HubAttachmentService,
  PostgresHubRepository,
  startHubServer,
  toHubSnapshot,
} from "../src/index.js";

const databaseUrl = process.env.HUB_TEST_DATABASE_URL;

it(
  "persists enrollment, authoritative state and receipts across Hub restart",
  { skip: databaseUrl === undefined },
  async () => {
    if (databaseUrl === undefined) return;
    const workspaceId = WorkspaceIdSchema.parse(
      "00000000-0000-4000-8000-000000000901",
    );
    const spaceId = SpaceIdSchema.parse("00000000-0000-4000-8000-000000000902");
    const principalId = PrincipalIdSchema.parse(
      "00000000-0000-4000-8000-000000000903",
    );
    const deviceId = DeviceIdSchema.parse(
      "00000000-0000-4000-8000-000000000904",
    );
    const documentId = DocumentIdSchema.parse(
      "00000000-0000-4000-8000-000000000911",
    );
    const revisionId = DocumentRevisionIdSchema.parse(
      "00000000-0000-4000-8000-000000000912",
    );
    const context: ExecutionContext = ExecutionContextSchema.parse({
      principalId,
      principalKind: "human",
      credentialId: "00000000-0000-4000-8000-000000000905",
      grantId: "00000000-0000-4000-8000-000000000906",
      policyVersion: 1,
      workspaceId,
      spaceScope: [spaceId],
      capabilityScope: [
        "workspace.createLocal",
        "workspace.bootstrapContext",
        "capture.submitText",
        "capture.history",
        "document.create",
        "document.list",
        "task.list",
        "audit.receipt",
      ],
      origin: "desktop",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query(`
      DROP TABLE IF EXISTS constellation_hub_document_revisions CASCADE;
      DROP TABLE IF EXISTS constellation_hub_documents CASCADE;
      DROP TABLE IF EXISTS constellation_hub_attachments CASCADE;
      DROP TABLE IF EXISTS constellation_hub_attachment_uploads CASCADE;
      DROP TABLE IF EXISTS constellation_hub_command_receipts CASCADE;
      DROP TABLE IF EXISTS constellation_hub_devices CASCADE;
      DROP TABLE IF EXISTS constellation_hub_enrollments CASCADE;
      DROP TABLE IF EXISTS constellation_hub_workspaces CASCADE;
      DROP TABLE IF EXISTS constellation_hub_meta CASCADE;
    `);
    const repository = new PostgresHubRepository(pool);
    await repository.migrate();

    const harness = createReferenceHarness();
    harness.authorization.register(context);
    const bootstrap = harness.kernel.execute(context, {
      contractVersion: 1,
      commandName: "workspace.createLocal",
      commandId: "00000000-0000-4000-8000-000000000907",
      workspaceId,
      idempotencyKey: "postgres-bootstrap",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000000908",
      payload: {
        workspaceId,
        rootSpaceId: spaceId,
        ownerPrincipalId: principalId,
        name: "PostgreSQL workspace",
        timezone: "Europe/Warsaw",
      },
    });
    assert.equal(bootstrap.kind, "command_outcome");
    const createdDocument = harness.kernel.execute(context, {
      contractVersion: 1,
      commandName: "document.create",
      commandId: "00000000-0000-4000-8000-000000000913",
      workspaceId,
      idempotencyKey: "postgres-document",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000000914",
      payload: { documentId, spaceId, title: "Restart-safe document" },
    });
    assert.equal(createdDocument.kind, "command_outcome");
    const secrets = ["p".repeat(43), "q".repeat(43)];
    const service = new HubService(repository, {
      now: () => "2026-07-14T12:00:00.000Z",
      randomSecret: () => secrets.shift() ?? "r".repeat(43),
    });
    await service.createWorkspace({
      workspaceId,
      snapshot: toHubSnapshot(harness.store.snapshot()),
    });
    const enrollment = await service.createEnrollment({
      workspaceId,
      authorization: context,
      expiresAt: "2026-07-14T12:05:00.000Z",
    });
    const enrolled = await service.enroll({
      protocolVersion: 1,
      workspaceId,
      deviceId,
      deviceLabel: "PostgreSQL test device",
      enrollmentSecret: enrollment.enrollmentSecret,
    });
    assert.equal(enrolled.outcome, "success");
    if (enrolled.outcome !== "success") throw new Error("Enrollment failed.");
    const command = CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "capture.submitText",
      commandId: "00000000-0000-4000-8000-000000000909",
      workspaceId,
      idempotencyKey: "postgres-capture",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000000910",
      payload: {
        spaceId,
        originalText: "Survives Hub process restart",
        deviceId,
        source: "global_quick_capture",
      },
    });
    const pushed = await service.sync(enrolled.deviceCredential, {
      protocolVersion: 1,
      workspaceId,
      deviceId,
      checkpoint: "0",
      commands: [command],
    });
    assert.equal(pushed.outcome, "success");
    const realtimeDocument = new YjsRealtimeDocumentAdapter();
    realtimeDocument.replaceText("Binary document survives restart", {
      kind: "human",
      principalId,
    });
    const checkpoint = realtimeDocument.checkpoint();
    realtimeDocument.destroy();
    await repository.storeDocumentState({
      workspaceId,
      spaceId,
      documentId,
      engine: "yjs-13",
      state: checkpoint.state,
      updatedAt: "2026-07-14T12:01:00.000Z",
    });
    await repository.createDocumentRevision({
      id: revisionId,
      workspaceId,
      spaceId,
      documentId,
      name: "Before restart",
      engine: "yjs-13",
      state: checkpoint.state,
      stateVector: checkpoint.stateVector,
      createdBy: principalId,
      createdByDeviceId: deviceId,
      correlationId: CorrelationIdSchema.parse(
        "00000000-0000-4000-8000-000000000915",
      ),
      createdAt: "2026-07-14T12:01:00.000Z",
    });

    const attachmentRoot = await mkdtemp(
      path.join(os.tmpdir(), "constellation-hub-attachments-"),
    );
    const attachmentService = new HubAttachmentService(
      pool,
      repository,
      attachmentRoot,
    );
    const bytes = Buffer.from(
      "an attachment resumed after an interrupted first chunk",
    );
    const digest = createHash("sha256").update(bytes).digest("hex");
    const upload = await attachmentService.begin(enrolled.deviceCredential, {
      workspaceId,
      deviceId,
      contentSha256: digest,
      byteLength: bytes.length,
    });
    const first = await attachmentService.append({
      credential: enrolled.deviceCredential,
      workspaceId,
      deviceId,
      uploadId: upload.uploadId,
      offset: 0,
      chunk: bytes.subarray(0, 17),
    });
    assert.equal(first.receivedBytes, 17);
    await assert.rejects(
      attachmentService.append({
        credential: enrolled.deviceCredential,
        workspaceId,
        deviceId,
        uploadId: upload.uploadId,
        offset: 0,
        chunk: bytes.subarray(17),
      }),
      (error) =>
        error instanceof HubAttachmentError &&
        error.code === "offset_mismatch" &&
        error.expectedOffset === 17,
    );
    const resumed = await attachmentService.begin(enrolled.deviceCredential, {
      workspaceId,
      deviceId,
      contentSha256: digest,
      byteLength: bytes.length,
    });
    assert.equal(resumed.receivedBytes, 17);
    await attachmentService.append({
      credential: enrolled.deviceCredential,
      workspaceId,
      deviceId,
      uploadId: upload.uploadId,
      offset: 17,
      chunk: bytes.subarray(17),
    });
    const crashTarget = path.join(
      attachmentRoot,
      "objects",
      workspaceId,
      digest.slice(0, 2),
      digest,
    );
    await mkdir(path.dirname(crashTarget), { recursive: true });
    await rename(
      path.join(attachmentRoot, "staging", upload.uploadId),
      crashTarget,
    );
    const published = await attachmentService.publish({
      credential: enrolled.deviceCredential,
      workspaceId,
      deviceId,
      uploadId: upload.uploadId,
    });
    assert.equal(published.state, "published");
    const object = await attachmentService.openObject(workspaceId, digest);
    assert.equal(object.byteLength, bytes.length);
    const chunks: Buffer[] = [];
    for await (const chunk of object.stream) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), bytes);

    const badBytes = Buffer.from("digest substitution must not publish");
    const badUpload = await attachmentService.begin(enrolled.deviceCredential, {
      workspaceId,
      deviceId,
      contentSha256: "0".repeat(64),
      byteLength: badBytes.length,
    });
    await attachmentService.append({
      credential: enrolled.deviceCredential,
      workspaceId,
      deviceId,
      uploadId: badUpload.uploadId,
      offset: 0,
      chunk: badBytes,
    });
    await assert.rejects(
      attachmentService.publish({
        credential: enrolled.deviceCredential,
        workspaceId,
        deviceId,
        uploadId: badUpload.uploadId,
      }),
      (error) =>
        error instanceof HubAttachmentError && error.code === "digest_mismatch",
    );

    const server = await startHubServer({
      service,
      attachments: attachmentService,
      host: "127.0.0.1",
      port: 0,
      allowInsecureLoopback: true,
    });
    const wireBytes = Buffer.from("wire attachment with a ranged read");
    const wireDigest = createHash("sha256").update(wireBytes).digest("hex");
    const authHeaders = {
      authorization: `Bearer ${enrolled.deviceCredential}`,
      "content-type": "application/json",
    };
    const begunResponse = await fetch(
      `${server.origin}/v1/attachments/uploads`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          workspaceId,
          deviceId,
          contentSha256: wireDigest,
          byteLength: wireBytes.length,
        }),
      },
    );
    assert.equal(begunResponse.status, 200);
    const begun = (await begunResponse.json()) as { uploadId: string };
    const appended = await fetch(
      `${server.origin}/v1/attachments/uploads/${begun.uploadId}?workspaceId=${workspaceId}&deviceId=${deviceId}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${enrolled.deviceCredential}`,
          "content-type": "application/octet-stream",
          "upload-offset": "0",
        },
        body: wireBytes,
      },
    );
    assert.equal(appended.status, 200);
    const publishResponse = await fetch(
      `${server.origin}/v1/attachments/uploads/${begun.uploadId}/publish`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ workspaceId, deviceId }),
      },
    );
    assert.equal(publishResponse.status, 200);
    const range = await fetch(
      `${server.origin}/v1/attachments/${wireDigest}?workspaceId=${workspaceId}&deviceId=${deviceId}`,
      {
        headers: {
          authorization: `Bearer ${enrolled.deviceCredential}`,
          range: "bytes=5-14",
        },
      },
    );
    assert.equal(range.status, 206);
    assert.equal(
      range.headers.get("content-range"),
      `bytes 5-14/${wireBytes.length}`,
    );
    assert.deepEqual(
      Buffer.from(await range.arrayBuffer()),
      wireBytes.subarray(5, 15),
    );
    await server.close();

    const attachmentBackup = await mkdtemp(
      path.join(os.tmpdir(), "constellation-hub-attachment-backup-"),
    );
    await cp(attachmentRoot, attachmentBackup, { recursive: true });
    await rm(attachmentRoot, { recursive: true, force: true });
    await cp(attachmentBackup, attachmentRoot, { recursive: true });
    const restoredObject = await attachmentService.openObject(
      workspaceId,
      wireDigest,
    );
    const restoredChunks: Buffer[] = [];
    for await (const chunk of restoredObject.stream)
      restoredChunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(restoredChunks), wireBytes);
    await rm(attachmentBackup, { recursive: true, force: true });
    await rm(attachmentRoot, { recursive: true, force: true });
    await repository.close();

    const restartedRepository = PostgresHubRepository.create(databaseUrl);
    await restartedRepository.migrate();
    const restarted = new HubService(restartedRepository);
    const replay = await restarted.sync(enrolled.deviceCredential, {
      protocolVersion: 1,
      workspaceId,
      deviceId,
      checkpoint: "0",
      commands: [command],
    });
    assert.equal(replay.outcome, "success");
    if (replay.outcome !== "success") throw new Error("Restart pull failed.");
    assert.equal(replay.currentCheckpoint, "1");
    assert.equal(replay.receipts[0]?.commandId, command.commandId);
    assert.equal(replay.change?.snapshot.captures.length, 1);
    const restartedDocument = await restartedRepository.loadDocumentState({
      workspaceId,
      documentId,
    });
    assert.ok(restartedDocument);
    const decodedDocument = new YjsRealtimeDocumentAdapter(
      restartedDocument.state,
    );
    assert.equal(decodedDocument.getText(), "Binary document survives restart");
    decodedDocument.destroy();
    const restartedRevision = (
      await restartedRepository.listDocumentRevisions({
        workspaceId,
        documentId,
      })
    ).at(0);
    assert.equal(restartedRevision?.id, revisionId);
    assert.equal(restartedRevision?.createdByDeviceId, deviceId);
    assert.equal(
      restartedRevision?.correlationId,
      "00000000-0000-4000-8000-000000000915",
    );
    await restartedRepository.close();
  },
);
