import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import {
  CorrelationIdSchema,
  DeviceIdSchema,
  DocumentIdSchema,
  ExecutionContextSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import { createReferenceHarness } from "@constellation/testkit";
import { YjsRealtimeDocumentAdapter } from "@constellation/realtime-documents";
import WebSocket from "ws";
import * as Y from "yjs";

import {
  HubService,
  InMemoryHubRepository,
  RealtimeDocumentGateway,
  startHubServer,
  toHubSnapshot,
  type RunningHubServer,
} from "../src/index.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000901",
);
const spaceId = "00000000-0000-4000-8000-000000000902";
const principalId = "00000000-0000-4000-8000-000000000903";
const collaboratorPrincipalId = "00000000-0000-4000-8000-000000000907";
const collaboratorMembershipId = "00000000-0000-4000-8000-000000000908";
const collaboratorSpaceGrantId = "00000000-0000-4000-8000-000000000909";
const documentId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-000000000904",
);
const deviceA = DeviceIdSchema.parse("realtime-device-a");
const deviceB = DeviceIdSchema.parse("realtime-device-b");

let sequence = 0x920;
const uuid = (): string =>
  `00000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, "0")}`;

const waitFor = async (
  condition: () => boolean,
  code: string,
): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(code);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const authorization = () =>
  ExecutionContextSchema.parse({
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
      "document.create",
      "document.list",
    ],
    origin: "desktop",
  });

const collaboratorAuthorization = () =>
  ExecutionContextSchema.parse({
    principalId: collaboratorPrincipalId,
    principalKind: "human",
    credentialId: "00000000-0000-4000-8000-000000000910",
    grantId: "00000000-0000-4000-8000-000000000911",
    policyVersion: 1,
    workspaceId,
    spaceScope: [spaceId],
    capabilityScope: ["document.create", "document.list"],
    origin: "desktop",
  });

const snapshotWithDocument = () => {
  const harness = createReferenceHarness();
  const context = authorization();
  harness.authorization.register(context);
  const workspace = harness.kernel.execute(context, {
    contractVersion: 1,
    commandName: "workspace.createLocal",
    commandId: uuid(),
    workspaceId,
    idempotencyKey: "workspace",
    expectedVersions: {},
    correlationId: uuid(),
    payload: {
      workspaceId,
      rootSpaceId: spaceId,
      ownerPrincipalId: principalId,
      name: "Realtime workspace",
      timezone: "Europe/Warsaw",
    },
  });
  assert.equal(workspace.kind, "command_outcome");
  const document = harness.kernel.execute(context, {
    contractVersion: 1,
    commandName: "document.create",
    commandId: uuid(),
    workspaceId,
    idempotencyKey: "document",
    expectedVersions: {},
    correlationId: uuid(),
    payload: { documentId, spaceId, title: "Model odpowiedzialności" },
  });
  assert.equal(document.kind, "command_outcome");
  if (document.kind !== "command_outcome") throw new Error("Document failed.");
  assert.equal(document.outcome.outcome, "success");
  const snapshot = toHubSnapshot(harness.store.snapshot());
  return {
    ...snapshot,
    memberships: [
      ...snapshot.memberships,
      {
        id: collaboratorMembershipId,
        workspaceId,
        principalId: collaboratorPrincipalId,
        role: "member" as const,
        displayName: "Lena",
        status: "active" as const,
        version: 1,
        createdAt: "2026-07-14T12:00:00.000Z",
        updatedAt: "2026-07-14T12:00:00.000Z",
      },
    ],
    spaceGrants: [
      ...snapshot.spaceGrants,
      {
        id: collaboratorSpaceGrantId,
        workspaceId,
        spaceId,
        principalId: collaboratorPrincipalId,
        access: "edit" as const,
        status: "active" as const,
        version: 1,
        createdAt: "2026-07-14T12:00:00.000Z",
        updatedAt: "2026-07-14T12:00:00.000Z",
      },
    ],
  };
};

describe("self-hosted realtime document gateway", () => {
  let server: RunningHubServer | undefined;
  const providers: HocuspocusProvider[] = [];
  const sockets: HocuspocusProviderWebsocket[] = [];

  afterEach(async () => {
    for (const provider of providers.splice(0)) provider.destroy();
    for (const socket of sockets.splice(0)) socket.destroy();
    await server?.close();
    server = undefined;
  });

  it("converges two clients, persists binary state, and restores a named revision", async () => {
    const repository = new InMemoryHubRepository();
    const secrets = [
      "a".repeat(43),
      "b".repeat(43),
      "c".repeat(43),
      "d".repeat(43),
    ];
    const service = new HubService(repository, {
      randomSecret: () => secrets.shift() ?? "e".repeat(43),
    });
    await service.createWorkspace({
      workspaceId,
      snapshot: snapshotWithDocument(),
    });
    const enroll = async (
      deviceId: typeof deviceA,
      context = authorization(),
    ) => {
      const grant = await service.createEnrollment({
        workspaceId,
        authorization: context,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const result = await service.enroll({
        protocolVersion: 1,
        workspaceId,
        deviceId,
        deviceLabel: deviceId,
        enrollmentSecret: grant.enrollmentSecret,
      });
      assert.equal(result.outcome, "success");
      if (result.outcome !== "success") throw new Error("Enrollment failed.");
      return result.deviceCredential;
    };
    const credentialA = await enroll(deviceA);
    const credentialB = await enroll(deviceB, collaboratorAuthorization());
    const gateway = new RealtimeDocumentGateway(service, repository);
    server = await startHubServer({
      service,
      realtimeDocuments: gateway,
      host: "127.0.0.1",
      port: 0,
      allowInsecureLoopback: true,
    });
    const sessionA = await gateway.createSession({
      credential: credentialA,
      workspaceId,
      deviceId: deviceA,
      documentId,
    });
    const sessionB = await gateway.createSession({
      credential: credentialB,
      workspaceId,
      deviceId: deviceB,
      documentId,
    });
    assert.ok(sessionA);
    assert.ok(sessionB);
    const alice = new Y.Doc();
    const bob = new Y.Doc();
    const statuses: string[] = [];
    const websocketUrl = server.origin.replace(/^http/u, "ws") + "/v1/realtime";
    const socketA = new HocuspocusProviderWebsocket({
      url: websocketUrl,
      WebSocketPolyfill: WebSocket,
    });
    const socketB = new HocuspocusProviderWebsocket({
      url: websocketUrl,
      WebSocketPolyfill: WebSocket,
    });
    sockets.push(socketA, socketB);
    const providerA = new HocuspocusProvider({
      websocketProvider: socketA,
      name: sessionA.room,
      token: sessionA.token,
      document: alice,
      onStatus: ({ status }) => statuses.push(`a:${status}`),
      onAuthenticationFailed: ({ reason }) => statuses.push(`a:auth:${reason}`),
      onClose: ({ event }) =>
        statuses.push(`a:close:${event.code}:${event.reason}`),
    });
    const providerB = new HocuspocusProvider({
      websocketProvider: socketB,
      name: sessionB.room,
      token: sessionB.token,
      document: bob,
      onStatus: ({ status }) => statuses.push(`b:${status}`),
      onAuthenticationFailed: ({ reason }) => statuses.push(`b:auth:${reason}`),
      onClose: ({ event }) =>
        statuses.push(`b:close:${event.code}:${event.reason}`),
    });
    providers.push(providerA, providerB);
    providerA.attach();
    providerB.attach();
    await waitFor(
      () => providerA.synced && providerB.synced,
      "PROVIDERS_NOT_SYNCED",
    ).catch(() => {
      throw new Error(`PROVIDERS_NOT_SYNCED:${JSON.stringify(statuses)}`);
    });
    alice.getText("content").insert(0, "Zakres partnera");
    await waitFor(
      () => bob.getText("content").toString() === "Zakres partnera",
      "ONLINE_EDIT_NOT_CONVERGED",
    );
    const revisionId = await gateway.createRevision({
      credential: credentialA,
      workspaceId,
      deviceId: deviceA,
      documentId,
      name: "Review 1",
      correlationId: CorrelationIdSchema.parse(uuid()),
    });
    assert.ok(revisionId);
    bob.getText("content").insert(bob.getText("content").length, " i klienta");
    await waitFor(
      () => alice.getText("content").toString().endsWith("i klienta"),
      "SECOND_EDIT_NOT_CONVERGED",
    );
    assert.equal(
      await gateway.restoreRevision({
        credential: credentialA,
        workspaceId,
        deviceId: deviceA,
        documentId,
        revisionId,
        correlationId: CorrelationIdSchema.parse(uuid()),
      }),
      true,
    );
    await waitFor(
      () =>
        alice.getText("content").toString() === "Zakres partnera" &&
        bob.getText("content").toString() === "Zakres partnera",
      "RESTORE_NOT_CONVERGED",
    );
    const stored = await repository.loadDocumentState({
      workspaceId,
      documentId,
    });
    assert.ok(stored);
    assert.equal(
      new YjsRealtimeDocumentAdapter(stored.state).getText(),
      "Zakres partnera",
    );
    assert.equal(
      (
        await gateway.listRevisions({
          credential: credentialA,
          workspaceId,
          deviceId: deviceA,
          documentId,
        })
      )?.length,
      2,
    );
    assert.equal(
      (
        await gateway.listRevisions({
          credential: credentialA,
          workspaceId,
          deviceId: deviceA,
          documentId,
        })
      )?.[0]?.restoredFromRevisionId,
      revisionId,
    );
    const restoredRevision = (
      await gateway.listRevisions({
        credential: credentialA,
        workspaceId,
        deviceId: deviceA,
        documentId,
      })
    )?.[0];
    assert.equal(restoredRevision?.createdByDeviceId, deviceA);
    assert.ok(restoredRevision?.correlationId);
    await repository.withWorkspaceLock(workspaceId, (state) => {
      state.snapshot = {
        ...state.snapshot,
        spaceGrants: state.snapshot.spaceGrants.map((grant) =>
          grant.id === collaboratorSpaceGrantId
            ? { ...grant, access: "view", version: 2 }
            : grant,
        ),
      };
    });
    await gateway.reauthorizeSessions();
    await waitFor(
      () => statuses.some((status) => status.startsWith("b:close:")),
      "VIEWER_NOT_DISCONNECTED_FOR_REAUTH",
    );
    bob.getText("content").insert(0, "NIEDOZWOLONA ZMIANA ");
    await new Promise((resolve) => setTimeout(resolve, 80));
    const afterDowngrade = await repository.loadDocumentState({
      workspaceId,
      documentId,
    });
    assert.ok(afterDowngrade);
    const persisted = new YjsRealtimeDocumentAdapter(afterDowngrade.state);
    assert.equal(persisted.getText().includes("NIEDOZWOLONA ZMIANA"), false);
    persisted.destroy();
  });
});
