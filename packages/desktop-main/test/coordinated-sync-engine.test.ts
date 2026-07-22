import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  ExecutionContextSchema,
  DeviceIdSchema,
  WorkspaceIdSchema,
  type ExecutionContext,
  type DeviceId,
  type HubReconcileCommandResult,
  type HubSyncRequest,
  type HubSyncResult,
} from "@constellation/contracts";
import {
  HubService,
  InMemoryHubRepository,
  snapshotDigest,
  toHubSnapshot,
} from "@constellation/hub";
import {
  SqliteApplicationStore,
  type SqliteDatabase,
} from "@constellation/local-store";

import {
  CoordinatedSyncEngine,
  HttpHubTransport,
  createHubWorkspaceSnapshot,
  type HubTransport,
} from "../src/coordinated-sync-engine.js";
import { createRuntimeKernelService } from "../src/runtime-kernel-service.js";

const ids = {
  workspace: WorkspaceIdSchema.parse("00000000-0000-4000-8000-000000001001"),
  space: "00000000-0000-4000-8000-000000001002",
  principal: "00000000-0000-4000-8000-000000001003",
  credential: "00000000-0000-4000-8000-000000001004",
  grant: "00000000-0000-4000-8000-000000001005",
  deviceA: DeviceIdSchema.parse("00000000-0000-4000-8000-000000001006"),
  deviceB: DeviceIdSchema.parse("00000000-0000-4000-8000-000000001007"),
} as const;

const context = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.principal,
    principalKind: "human",
    credentialId: ids.credential,
    grantId: ids.grant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.space],
    capabilityScope: [
      "workspace.createLocal",
      "workspace.rename",
      "workspace.bootstrapContext",
      "capture.submitText",
      "capture.routeAsTask",
      "capture.history",
      "project.create",
      "record.relate",
      "record.unrelate",
      "task.list",
      "audit.receipt",
    ],
    origin: "desktop",
  });

const createDevice = () => {
  const database = new DatabaseSync(":memory:");
  const store = new SqliteApplicationStore(
    database as unknown as SqliteDatabase,
  );
  const runtime = createRuntimeKernelService({ context: context(), store });
  const bootstrap = runtime.execute({
    contractVersion: 1,
    commandName: "workspace.createLocal",
    commandId: "00000000-0000-4000-8000-000000001010",
    workspaceId: ids.workspace,
    idempotencyKey: "coordinated-bootstrap",
    expectedVersions: {},
    correlationId: "00000000-0000-4000-8000-000000001011",
    payload: {
      workspaceId: ids.workspace,
      rootSpaceId: ids.space,
      ownerPrincipalId: ids.principal,
      name: "Coordinated workspace",
      timezone: "Europe/Warsaw",
    },
  });
  assert.equal(bootstrap.kind, "command_outcome");
  return { database, runtime, store };
};

class ServiceTransport implements HubTransport {
  public throwAfterNextSync = false;

  public constructor(private readonly service: HubService) {}

  public reconcileCommand(input: {
    readonly credential: string;
    readonly workspaceId: typeof ids.workspace;
    readonly deviceId: DeviceId;
    readonly commandId: string;
  }): Promise<HubReconcileCommandResult> {
    return this.service.reconcileCommand(input);
  }

  public async sync(
    credential: string,
    request: HubSyncRequest,
  ): Promise<HubSyncResult> {
    const result = await this.service.sync(credential, request);
    if (this.throwAfterNextSync) {
      this.throwAfterNextSync = false;
      throw new Error("Synthetic response loss after Hub commit.");
    }
    return result;
  }
}

describe("coordinated desktop projection", () => {
  it("uploads resumable attachment bytes and verifies downloaded content", async () => {
    const bytes = new TextEncoder().encode("encrypted custody transfer");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const uploadId = "00000000-0000-4000-8000-000000001090";
    const requests: Array<{
      readonly url: string;
      readonly init?: RequestInit;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, ...(init === undefined ? {} : { init }) });
      if (url.endsWith("/v1/attachments/uploads")) {
        return Response.json({
          uploadId,
          contentSha256: digest,
          byteLength: bytes.byteLength,
          receivedBytes: 0,
          state: "staging",
        });
      }
      if (url.includes(`/v1/attachments/uploads/${uploadId}?`)) {
        return Response.json({
          uploadId,
          contentSha256: digest,
          byteLength: bytes.byteLength,
          receivedBytes: bytes.byteLength,
          state: "staging",
        });
      }
      if (url.endsWith(`/v1/attachments/uploads/${uploadId}/publish`)) {
        return Response.json({
          uploadId,
          contentSha256: digest,
          byteLength: bytes.byteLength,
          receivedBytes: bytes.byteLength,
          state: "published",
        });
      }
      if (url.includes(`/v1/attachments/${digest}?`)) {
        return new Response(bytes);
      }
      return new Response(undefined, { status: 404 });
    };
    const transport = new HttpHubTransport("https://hub.example.test", fetcher);

    assert.deepEqual(
      await transport.uploadAttachment({
        credential: "c".repeat(43),
        workspaceId: ids.workspace,
        deviceId: ids.deviceA,
        bytes,
      }),
      { digest, byteLength: bytes.byteLength },
    );
    assert.deepEqual(
      await transport.downloadAttachment({
        credential: "c".repeat(43),
        workspaceId: ids.workspace,
        deviceId: ids.deviceA,
        digest,
      }),
      bytes,
    );
    assert.equal(requests.length, 4);
    assert.equal(requests[1]?.init?.method, "PUT");
    assert.equal(
      new Headers(requests[1]?.init?.headers).get("upload-offset"),
      "0",
    );
  });

  it("rejects attachment downloads whose bytes do not match the digest", async () => {
    const expected = createHash("sha256").update("expected").digest("hex");
    const transport = new HttpHubTransport(
      "https://hub.example.test",
      async () => new Response("tampered"),
    );
    await assert.rejects(
      transport.downloadAttachment({
        credential: "c".repeat(43),
        workspaceId: ids.workspace,
        deviceId: ids.deviceA,
        digest: expected,
      }),
      /digest does not match/u,
    );
  });

  it("keeps device-local agent control-plane tables out of Hub snapshots", () => {
    const device = createDevice();
    try {
      const snapshot = createHubWorkspaceSnapshot(device.store.snapshot());
      const record = snapshot as unknown as Record<string, unknown>;
      assert.equal("agentGrants" in record, false);
      assert.equal("agentRuns" in record, false);
      assert.equal("agentCheckpoints" in record, false);
      assert.equal("agentHandoffs" in record, false);
    } finally {
      device.database.close();
    }
  });

  it("purges the local projection when Hub membership is revoked", async () => {
    const device = createDevice();
    const initial = toHubSnapshot(device.store.snapshot());
    device.store.configureCoordination({
      workspaceId: ids.workspace,
      providerInstanceId: "constellation.hub:revocation-test",
      hubOrigin: "https://hub.example.test",
      checkpoint: "2",
      snapshotDigest: snapshotDigest(initial),
      configuredAt: "2026-07-14T12:00:00.000Z",
    });
    const createdProject = device.runtime.execute({
      contractVersion: 1,
      commandName: "project.create",
      commandId: "00000000-0000-4000-8000-000000001040",
      workspaceId: ids.workspace,
      idempotencyKey: "revocation-project-content",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000001041",
      payload: {
        spaceId: ids.space,
        title: "Revoked Project",
        intendedOutcome: "Must leave no local rich-content trace",
      },
    });
    assert.equal(createdProject.kind, "command_outcome");
    if (
      createdProject.kind !== "command_outcome" ||
      createdProject.outcome.outcome !== "success" ||
      createdProject.outcome.projection.kind !== "project.created"
    )
      throw new Error("Project creation failed.");
    const owner = {
      kind: "project" as const,
      projectId: createdProject.outcome.projection.projectId,
    };
    device.store.commitCollaborativeContentUpdate({
      id: "revoked-project-update",
      owner,
      workspaceId: ids.workspace,
      spaceId: context().spaceScope[0]!,
      state: Uint8Array.of(1, 2, 3),
      update: Uint8Array.of(2, 3),
      createdAt: "2026-07-14T12:00:30.000Z",
    });
    device.store.replaceCollaborativeContentSearchProjection({
      owner,
      workspaceId: ids.workspace,
      spaceId: context().spaceScope[0]!,
      body: "revoked private project body",
      stateDigest: "a".repeat(64),
      indexedAt: "2026-07-14T12:00:30.000Z",
    });
    const transport: HubTransport = {
      reconcileCommand: () =>
        Promise.resolve({ outcome: "not_found" as const }),
      sync: () =>
        Promise.resolve({
          outcome: "rejected" as const,
          code: "membership_revoked" as const,
          purgeLocalProjection: true,
        }),
    };
    const engine = new CoordinatedSyncEngine({
      workspaceId: ids.workspace,
      deviceId: ids.deviceA,
      credential: "r".repeat(43),
      store: device.store,
      transport,
      now: () => "2026-07-14T12:01:00.000Z",
    });
    assert.deepEqual(await engine.syncNow(), {
      state: "revoked",
      checkpoint: "2",
      accepted: 0,
      conflicts: 0,
    });
    assert.equal(device.store.snapshot().workspaces.length, 0);
    assert.equal(device.store.snapshot().captures.length, 0);
    for (const table of [
      "content_collaboration_state",
      "content_pending_updates",
      "content_revisions",
      "content_entity_links",
      "content_search_projections",
    ]) {
      assert.equal(
        (
          device.database
            .prepare(`SELECT count(*) AS count FROM ${table}`)
            .get() as { count: number }
        ).count,
        0,
      );
    }
    assert.equal(device.store.getCoordinationState()?.syncState, "revoked");
    assert.equal(
      device.store.getCoordinationState()?.lastErrorCode,
      "membership_revoked",
    );
    device.database.close();
  });

  it("converges two devices and reconciles a response lost after commit", async () => {
    const deviceA = createDevice();
    const deviceB = createDevice();
    const initial = toHubSnapshot(deviceA.store.snapshot());
    const initialDigest = snapshotDigest(initial);
    const repository = new InMemoryHubRepository();
    const secrets = [
      "a".repeat(43),
      "b".repeat(43),
      "c".repeat(43),
      "d".repeat(43),
    ];
    const hub = new HubService(repository, {
      now: () => "2026-07-14T12:00:00.000Z",
      randomSecret: () => secrets.shift() ?? "e".repeat(43),
    });
    await hub.createWorkspace({
      workspaceId: ids.workspace,
      snapshot: initial,
    });
    const enroll = async (deviceId: DeviceId, label: string) => {
      const invitation = await hub.createEnrollment({
        workspaceId: ids.workspace,
        authorization: context(),
        expiresAt: "2026-07-14T12:05:00.000Z",
      });
      const result = await hub.enroll({
        protocolVersion: 1,
        workspaceId: ids.workspace,
        deviceId,
        deviceLabel: label,
        enrollmentSecret: invitation.enrollmentSecret,
      });
      assert.equal(result.outcome, "success");
      if (result.outcome !== "success") throw new Error("Enrollment failed.");
      return result;
    };
    const enrolledA = await enroll(ids.deviceA, "macOS");
    const enrolledB = await enroll(ids.deviceB, "Windows");
    for (const device of [deviceA, deviceB]) {
      device.store.configureCoordination({
        workspaceId: ids.workspace,
        providerInstanceId: "constellation.hub:test",
        hubOrigin: "https://hub.example.test",
        checkpoint: "0",
        snapshotDigest: initialDigest,
        configuredAt: "2026-07-14T12:00:00.000Z",
      });
    }
    const transport = new ServiceTransport(hub);
    const engineA = new CoordinatedSyncEngine({
      workspaceId: ids.workspace,
      deviceId: enrolledA.deviceId,
      credential: enrolledA.deviceCredential,
      store: deviceA.store,
      transport,
      now: () => "2026-07-14T12:01:00.000Z",
    });
    const engineB = new CoordinatedSyncEngine({
      workspaceId: ids.workspace,
      deviceId: enrolledB.deviceId,
      credential: enrolledB.deviceCredential,
      store: deviceB.store,
      transport,
      now: () => "2026-07-14T12:01:00.000Z",
    });
    const capture = {
      contractVersion: 1,
      commandName: "capture.submitText",
      commandId: "00000000-0000-4000-8000-000000001020",
      workspaceId: ids.workspace,
      idempotencyKey: "offline-capture-a",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000001021",
      payload: {
        spaceId: ids.space,
        originalText: "Created while device B is offline",
        deviceId: ids.deviceA,
        source: "global_quick_capture",
      },
    };
    assert.equal(deviceA.runtime.execute(capture).kind, "command_outcome");
    assert.equal((await engineA.syncNow()).checkpoint, "1");
    assert.equal((await engineB.syncNow()).checkpoint, "1");
    assert.equal(deviceB.store.snapshot().captures.length, 1);

    const captureId = deviceA.store.snapshot().captures[0]?.id;
    if (captureId === undefined) throw new Error("Capture missing.");
    assert.equal(
      deviceA.runtime.execute({
        contractVersion: 1,
        commandName: "capture.routeAsTask",
        commandId: "00000000-0000-4000-8000-000000001030",
        workspaceId: ids.workspace,
        idempotencyKey: "tombstone-task",
        expectedVersions: { [captureId]: 1 },
        correlationId: "00000000-0000-4000-8000-000000001031",
        payload: { captureId, title: "Tombstone convergence" },
      }).kind,
      "command_outcome",
    );
    assert.equal(
      deviceA.runtime.execute({
        contractVersion: 1,
        commandName: "project.create",
        commandId: "00000000-0000-4000-8000-000000001032",
        workspaceId: ids.workspace,
        idempotencyKey: "tombstone-project",
        expectedVersions: {},
        correlationId: "00000000-0000-4000-8000-000000001033",
        payload: {
          spaceId: ids.space,
          title: "Tombstone project",
          intendedOutcome: "Removed relation remains explicit",
        },
      }).kind,
      "command_outcome",
    );
    const local = deviceA.store.snapshot();
    const taskId = local.tasks[0]?.id;
    const projectId = local.projects[0]?.id;
    if (taskId === undefined || projectId === undefined)
      throw new Error("Task or project missing.");
    assert.equal(
      deviceA.runtime.execute({
        contractVersion: 1,
        commandName: "record.relate",
        commandId: "00000000-0000-4000-8000-000000001034",
        workspaceId: ids.workspace,
        idempotencyKey: "tombstone-relate",
        expectedVersions: { [taskId]: 1, [projectId]: 1 },
        correlationId: "00000000-0000-4000-8000-000000001035",
        payload: {
          relationType: "task_contributes_to_project",
          taskId,
          projectId,
        },
      }).kind,
      "command_outcome",
    );
    const relationId = deviceA.store.snapshot().relations[0]?.id;
    if (relationId === undefined) throw new Error("Relation missing.");
    assert.equal(
      deviceA.runtime.execute({
        contractVersion: 1,
        commandName: "record.unrelate",
        commandId: "00000000-0000-4000-8000-000000001036",
        workspaceId: ids.workspace,
        idempotencyKey: "tombstone-unrelate",
        expectedVersions: { [relationId]: 1 },
        correlationId: "00000000-0000-4000-8000-000000001037",
        payload: { relationId },
      }).kind,
      "command_outcome",
    );
    assert.equal((await engineA.syncNow()).checkpoint, "5");
    assert.equal((await engineB.syncNow()).checkpoint, "5");
    assert.equal(deviceB.store.snapshot().relations[0]?.state, "removed");

    const rename = {
      contractVersion: 1,
      commandName: "workspace.rename",
      commandId: "00000000-0000-4000-8000-000000001022",
      workspaceId: ids.workspace,
      idempotencyKey: "offline-rename-response-loss",
      expectedVersions: { [ids.workspace]: 1 },
      correlationId: "00000000-0000-4000-8000-000000001023",
      payload: { name: "Renamed exactly once" },
    };
    assert.equal(deviceA.runtime.execute(rename).kind, "command_outcome");
    transport.throwAfterNextSync = true;
    assert.equal((await engineA.syncNow()).state, "unknown_reconcile");
    const reconciled = await engineA.syncNow();
    assert.equal(reconciled.state, "current");
    assert.equal(reconciled.checkpoint, "6");
    assert.equal(
      deviceA.store.read((view) => view.getWorkspace(ids.workspace)?.name),
      "Renamed exactly once",
    );
    assert.equal((await engineB.syncNow()).checkpoint, "6");
    assert.equal(
      deviceB.store.read((view) => view.getWorkspace(ids.workspace)?.name),
      "Renamed exactly once",
    );
    deviceA.database.close();
    deviceB.database.close();
  });
});
