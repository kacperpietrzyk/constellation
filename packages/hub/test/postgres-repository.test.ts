import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";

import {
  CaptureOriginalSchema,
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
  HubRemoteMcpService,
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
        "capture.submit",
        "capture.submitText",
        "capture.history",
        "document.create",
        "document.list",
        "task.list",
        "audit.receipt",
        "workspace.manageAccess",
        "agent.manageAccess",
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

    await pool.query(`
      CREATE TABLE constellation_hub_meta (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
        schema_version integer NOT NULL CHECK (schema_version > 0),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO constellation_hub_meta (singleton, schema_version)
      VALUES (true, 3);
    `);
    await assert.rejects(
      repository.migrate(),
      /supports versions 1 through 2/u,
    );
    const futureSchema = await pool.query(
      "SELECT schema_version FROM constellation_hub_meta WHERE singleton = true",
    );
    assert.equal(futureSchema.rows[0]?.schema_version, 3);
    const futureWorkspaceTable = await pool.query(
      "SELECT to_regclass('public.constellation_hub_workspaces')::text AS table_name",
    );
    assert.equal(futureWorkspaceTable.rows[0]?.table_name, null);

    await pool.query(`
      DROP TABLE constellation_hub_meta;
      CREATE TABLE constellation_hub_meta (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
        schema_version integer NOT NULL CHECK (schema_version > 0),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO constellation_hub_meta (singleton, schema_version)
      VALUES (true, 1);
      CREATE TABLE constellation_hub_workspaces (
        workspace_id uuid PRIMARY KEY,
        checkpoint bigint NOT NULL DEFAULT 0 CHECK (checkpoint >= 0),
        snapshot jsonb NOT NULL,
        snapshot_digest char(64) NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO constellation_hub_workspaces
        (workspace_id, checkpoint, snapshot, snapshot_digest)
      VALUES
        ('00000000-0000-4000-8000-000000000900', 7, '{"sentinel":true}'::jsonb, repeat('0', 64));
      CREATE FUNCTION constellation_fail_schema_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected migration failure';
      END;
      $$;
      CREATE TRIGGER constellation_fail_schema_update
      BEFORE UPDATE ON constellation_hub_meta
      FOR EACH ROW EXECUTE FUNCTION constellation_fail_schema_update();
    `);
    await assert.rejects(repository.migrate(), /injected migration failure/u);
    const interruptedSchema = await pool.query(
      "SELECT schema_version FROM constellation_hub_meta WHERE singleton = true",
    );
    assert.equal(interruptedSchema.rows[0]?.schema_version, 1);
    const interruptedWorkspace = await pool.query(
      "SELECT checkpoint::text, snapshot FROM constellation_hub_workspaces WHERE workspace_id = '00000000-0000-4000-8000-000000000900'",
    );
    assert.equal(interruptedWorkspace.rows[0]?.checkpoint, "7");
    assert.deepEqual(interruptedWorkspace.rows[0]?.snapshot, {
      sentinel: true,
    });
    const interruptedColumn = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'constellation_hub_workspaces' AND column_name = 'remote_agent_state'",
    );
    assert.equal(interruptedColumn.rowCount, 0);

    await pool.query(`
      DROP TRIGGER constellation_fail_schema_update ON constellation_hub_meta;
      DROP FUNCTION constellation_fail_schema_update();
    `);
    await repository.migrate();
    const recoveredSchema = await pool.query(
      "SELECT schema_version FROM constellation_hub_meta WHERE singleton = true",
    );
    assert.equal(recoveredSchema.rows[0]?.schema_version, 2);
    const recoveredWorkspace = await pool.query(
      "SELECT checkpoint::text, snapshot, remote_agent_state FROM constellation_hub_workspaces WHERE workspace_id = '00000000-0000-4000-8000-000000000900'",
    );
    assert.equal(recoveredWorkspace.rows[0]?.checkpoint, "7");
    assert.deepEqual(recoveredWorkspace.rows[0]?.snapshot, { sentinel: true });
    assert.deepEqual(recoveredWorkspace.rows[0]?.remote_agent_state, {
      grants: [],
      memberships: [],
      spaceGrants: [],
      runs: [],
      checkpoints: [],
      handoffs: [],
      federationScopes: {},
    });

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
    const remoteGateway = new HubRemoteMcpService(repository, {
      now: () => "2026-07-14T12:00:00.000Z",
      randomSecret: () => "z".repeat(43),
    });
    const remoteGrant = await remoteGateway.createGrant(
      enrolled.deviceCredential,
      {
        protocolVersion: 1,
        workspaceId,
        deviceId,
        displayName: "Restart-safe remote operator",
        preset: "observe",
        capabilityScope: ["task.list", "audit.receipt"],
        spaces: [{ spaceId, access: "view" }],
        federationScope: {
          crossWorkspaceRead: false,
          derivedResultWrite: false,
          sourceMaterialization: false,
        },
      },
    );
    assert.equal(remoteGrant.outcome, "success");
    if (remoteGrant.outcome !== "success")
      throw new Error("Remote grant creation failed.");
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
    await assert.rejects(
      attachmentService.begin(enrolled.deviceCredential, {
        workspaceId,
        deviceId,
        contentSha256: digest,
        byteLength: bytes.length + 1,
      }),
      (error) =>
        error instanceof HubAttachmentError && error.code === "length_mismatch",
    );
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
    const managedOriginal = CaptureOriginalSchema.parse({
      kind: "managed_file",
      payload: {
        payloadId: "00000000-0000-4000-8000-000000000921",
        displayName: "resumed.txt",
        mediaType: "text/plain",
        byteLength: bytes.length,
        contentSha256: digest,
        custodyState: "available",
      },
    });
    assert.equal(
      await attachmentService.isAvailable(workspaceId, managedOriginal),
      true,
    );
    assert.deepEqual(
      await attachmentService.readCapturePayloadChunk({
        workspaceId,
        original: managedOriginal,
        offset: 5,
        length: 11,
      }),
      bytes.subarray(5, 16),
    );
    const payloadService = new HubService(repository, {
      capturePayloadVerifier: attachmentService,
    });
    const hubCheckpoint = await repository.withWorkspaceLock(
      workspaceId,
      (state) => state.checkpoint.toString(),
    );
    const managedCapture = await payloadService.sync(
      enrolled.deviceCredential,
      {
        protocolVersion: 1,
        workspaceId,
        deviceId,
        checkpoint: hubCheckpoint,
        commands: [
          CommandEnvelopeSchema.parse({
            contractVersion: 1,
            commandName: "capture.submit",
            commandId: "00000000-0000-4000-8000-000000000922",
            workspaceId,
            idempotencyKey: "postgres-managed-capture",
            expectedVersions: {},
            correlationId: "00000000-0000-4000-8000-000000000923",
            payload: {
              spaceId,
              original: managedOriginal,
              deviceId: "postgres-device",
              source: "in_app_quick_capture",
            },
          }),
        ],
      },
    );
    assert.equal(managedCapture.outcome, "success");
    assert.equal(managedCapture.receipts[0]?.outcome.outcome, "success");
    await writeFile(crashTarget, Buffer.alloc(bytes.length, 0x78));
    assert.equal(
      await attachmentService.isAvailable(workspaceId, managedOriginal),
      false,
    );
    const unavailableCheckpoint = await repository.withWorkspaceLock(
      workspaceId,
      (state) => state.checkpoint.toString(),
    );
    const unavailableCapture = await payloadService.sync(
      enrolled.deviceCredential,
      {
        protocolVersion: 1,
        workspaceId,
        deviceId,
        checkpoint: unavailableCheckpoint,
        commands: [
          CommandEnvelopeSchema.parse({
            contractVersion: 1,
            commandName: "capture.submit",
            commandId: "00000000-0000-4000-8000-000000000924",
            workspaceId,
            idempotencyKey: "postgres-corrupt-managed-capture",
            expectedVersions: {},
            correlationId: "00000000-0000-4000-8000-000000000925",
            payload: {
              spaceId,
              original: managedOriginal,
              deviceId: "postgres-device",
              source: "in_app_quick_capture",
            },
          }),
        ],
      },
    );
    assert.equal(unavailableCapture.outcome, "success");
    assert.equal(
      unavailableCapture.receipts[0]?.outcome.diagnosticCode,
      "capture.payload_unavailable",
    );
    await writeFile(crashTarget, bytes);
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
    assert.equal(replay.currentCheckpoint, "3");
    assert.equal(replay.receipts[0]?.commandId, command.commandId);
    assert.equal(replay.change?.snapshot.captures.length, 2);
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
    const restartedRemote = new HubRemoteMcpService(restartedRepository);
    assert.equal(
      await restartedRemote.isAuthorized(workspaceId, remoteGrant.bearerToken),
      true,
    );
    const remoteList = await restartedRemote.listGrants(
      enrolled.deviceCredential,
      { protocolVersion: 1, workspaceId, deviceId },
    );
    assert.equal(remoteList.outcome, "success");
    if (remoteList.outcome === "success")
      assert.equal(
        remoteList.grants[0]?.displayName,
        "Restart-safe remote operator",
      );
    await restartedRepository.close();
  },
);
