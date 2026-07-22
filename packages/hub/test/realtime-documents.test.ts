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
  ProjectIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import { createReferenceHarness } from "@constellation/testkit";
import {
  RICH_DOCUMENT_FRAGMENT_ROOT,
  YjsRealtimeDocumentAdapter,
  documentPlainText,
} from "@constellation/realtime-documents";
import WebSocket from "ws";
import * as Y from "yjs";

import {
  HubService,
  InMemoryHubRepository,
  RealtimeDocumentGateway,
  startHubServer,
  toHubSnapshot,
  type RealtimeDocumentSessionResult,
  type RunningHubServer,
} from "../src/index.js";

const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000901",
);
const spaceId = SpaceIdSchema.parse("00000000-0000-4000-8000-000000000902");
const principalId = "00000000-0000-4000-8000-000000000903";
const collaboratorPrincipalId = "00000000-0000-4000-8000-000000000907";
const collaboratorMembershipId = "00000000-0000-4000-8000-000000000908";
const collaboratorSpaceGrantId = "00000000-0000-4000-8000-000000000909";
const documentId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-000000000904",
);
// Intentionally aliases the Document UUID: room identity must include kind.
const projectId = ProjectIdSchema.parse(documentId);
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

const appendRichText = (document: Y.Doc, text: string): void => {
  const fragment = document.getXmlFragment(RICH_DOCUMENT_FRAGMENT_ROOT);
  let paragraph = fragment.get(0);
  if (!(paragraph instanceof Y.XmlElement)) {
    paragraph = new Y.XmlElement("paragraph");
    fragment.insert(0, [paragraph]);
  }
  const node = new Y.XmlText();
  node.insert(0, text);
  paragraph.insert(paragraph.length, [node]);
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
      "project.create",
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
    capabilityScope: ["document.create", "document.list", "project.create"],
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
  const project = harness.kernel.execute(context, {
    contractVersion: 1,
    commandName: "project.create",
    commandId: uuid(),
    workspaceId,
    idempotencyKey: "project",
    expectedVersions: {},
    correlationId: uuid(),
    payload: {
      spaceId,
      title: "Project-owned content",
      intendedOutcome: "Prove simultaneous rich editing",
    },
  });
  assert.equal(project.kind, "command_outcome");
  if (
    project.kind !== "command_outcome" ||
    project.outcome.outcome !== "success" ||
    project.outcome.projection.kind !== "project.created"
  ) {
    throw new Error("Project failed.");
  }
  const generatedProjectId = project.outcome.projection.projectId;
  const snapshot = toHubSnapshot(harness.store.snapshot());
  return {
    ...snapshot,
    projects: snapshot.projects.map((candidate) =>
      candidate.id === generatedProjectId
        ? { ...candidate, id: projectId }
        : candidate,
    ),
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
    const rich = new YjsRealtimeDocumentAdapter();
    rich.replaceText("Dokument po migracji", {
      kind: "human",
      principalId,
    });
    rich.migrateToRich("a".repeat(64), {
      kind: "human",
      principalId,
    });
    await repository.storeDocumentState({
      workspaceId,
      documentId,
      spaceId,
      engine: "yjs-13",
      state: rich.encodeState(),
      updatedAt: "2026-07-14T12:05:00.000Z",
    });
    rich.destroy();
    assert.equal(
      await gateway.createSession({
        credential: credentialA,
        workspaceId,
        deviceId: deviceA,
        documentId,
        supportedDocumentFormats: ["plain-v1"],
      }),
      "upgrade_required",
    );
    const emptyLegacy = new YjsRealtimeDocumentAdapter();
    await repository.storeDocumentState({
      workspaceId,
      documentId,
      spaceId,
      engine: "yjs-13",
      state: emptyLegacy.encodeState(),
      updatedAt: "2026-07-14T12:06:00.000Z",
    });
    emptyLegacy.destroy();
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
      supportedDocumentFormats: ["plain-v1", "rich-v1"],
    });
    const sessionB = await gateway.createSession({
      credential: credentialB,
      workspaceId,
      deviceId: deviceB,
      documentId,
      supportedDocumentFormats: ["plain-v1", "rich-v1"],
    });
    assert.ok(sessionA);
    assert.ok(sessionB);
    assert.notEqual(sessionA, "upgrade_required");
    assert.notEqual(sessionB, "upgrade_required");
    if (
      sessionA === undefined ||
      sessionA === "upgrade_required" ||
      sessionB === undefined ||
      sessionB === "upgrade_required"
    ) {
      throw new Error("Document sessions unavailable.");
    }
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

  it("converges simultaneous edits and recovery in a Project-owned Hub room", async () => {
    const repository = new InMemoryHubRepository();
    const secrets = [
      "f".repeat(43),
      "g".repeat(43),
      "h".repeat(43),
      "i".repeat(43),
    ];
    const service = new HubService(repository, {
      randomSecret: () => secrets.shift() ?? "j".repeat(43),
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
    const sameIdDocument = new YjsRealtimeDocumentAdapter();
    sameIdDocument.replaceText("Independent same-id document", {
      kind: "human",
      principalId,
    });
    await repository.storeDocumentState({
      workspaceId,
      spaceId,
      documentId,
      engine: "yjs-13",
      state: sameIdDocument.encodeState(),
      updatedAt: "2026-07-22T02:10:00.000Z",
    });
    sameIdDocument.destroy();
    const owner = { kind: "project", projectId } as const;
    const sessionResponse = await fetch(`${server.origin}/v1/content/session`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credentialA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspaceId,
        deviceId: deviceA,
        owner,
        supportedDocumentFormats: ["plain-v1", "rich-v1"],
      }),
    });
    assert.equal(sessionResponse.status, 200);
    const sessionA =
      (await sessionResponse.json()) as RealtimeDocumentSessionResult;
    const sessionB = await gateway.createContentSession({
      credential: credentialB,
      workspaceId,
      deviceId: deviceB,
      owner,
      supportedDocumentFormats: ["plain-v1", "rich-v1"],
    });
    if (sessionB === undefined || sessionB === "upgrade_required") {
      throw new Error("Project sessions unavailable.");
    }
    assert.match(sessionA.room, /\/project\//u);
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
    const alice = new Y.Doc();
    const bob = new Y.Doc();
    const providerA = new HocuspocusProvider({
      websocketProvider: socketA,
      name: sessionA.room,
      token: sessionA.token,
      document: alice,
    });
    const providerB = new HocuspocusProvider({
      websocketProvider: socketB,
      name: sessionB.room,
      token: sessionB.token,
      document: bob,
    });
    providers.push(providerA, providerB);
    providerA.attach();
    providerB.attach();
    await waitFor(
      () => providerA.synced && providerB.synced,
      "PROJECT_PROVIDERS_NOT_SYNCED",
    );
    appendRichText(alice, " Plan A");
    appendRichText(bob, " Plan B");
    await waitFor(
      () =>
        documentPlainText(alice) === documentPlainText(bob) &&
        documentPlainText(alice).includes("Plan A") &&
        documentPlainText(alice).includes("Plan B"),
      "PROJECT_EDITS_NOT_CONVERGED",
    );
    const converged = documentPlainText(alice);
    assert.equal(
      converged.split("Prove simultaneous rich editing").length - 1,
      1,
    );
    const revisionId = await gateway.createContentRevision({
      credential: credentialA,
      workspaceId,
      deviceId: deviceA,
      owner,
      name: "Project checkpoint",
      correlationId: CorrelationIdSchema.parse(uuid()),
    });
    assert.ok(revisionId);
    appendRichText(alice, " later");
    await waitFor(
      () => documentPlainText(bob).endsWith("later"),
      "PROJECT_LATER_EDIT_NOT_CONVERGED",
    );
    assert.equal(
      await gateway.restoreContentRevision({
        credential: credentialA,
        workspaceId,
        deviceId: deviceA,
        owner,
        revisionId,
        correlationId: CorrelationIdSchema.parse(uuid()),
      }),
      true,
    );
    await waitFor(
      () =>
        documentPlainText(alice) === converged &&
        documentPlainText(bob) === converged,
      "PROJECT_RESTORE_NOT_CONVERGED",
    );
    const stored = await repository.loadCollaborativeContentState({
      workspaceId,
      owner,
    });
    assert.ok(stored);
    assert.equal(
      new YjsRealtimeDocumentAdapter(stored.state).getText(),
      converged,
    );
    assert.equal(
      (
        await gateway.listContentRevisions({
          credential: credentialA,
          workspaceId,
          deviceId: deviceA,
          owner,
        })
      )?.length,
      2,
    );
    const independentDocument = await repository.loadDocumentState({
      workspaceId,
      documentId,
    });
    assert.ok(independentDocument);
    const decodedIndependentDocument = new YjsRealtimeDocumentAdapter(
      independentDocument.state,
    );
    assert.equal(
      decodedIndependentDocument.getText(),
      "Independent same-id document",
    );
    decodedIndependentDocument.destroy();
  });
});
