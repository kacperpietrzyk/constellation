import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import * as Y from "yjs";

import { isApplicationWave2ReadView } from "@constellation/application";
import {
  DeviceIdSchema,
  DocumentIdSchema,
  ExecutionContextSchema,
  type ProjectId,
  WorkspaceIdSchema,
  type ExecutionContext,
} from "@constellation/contracts";
import {
  SqliteApplicationStore,
  type SqliteDatabase,
} from "@constellation/local-store";
import {
  RICH_DOCUMENT_FRAGMENT_ROOT,
  YjsRealtimeDocumentAdapter,
} from "@constellation/realtime-documents";

import { DocumentCollaborationBridge } from "../src/document-collaboration.js";
import { createRuntimeKernelService } from "../src/runtime-kernel-service.js";

const ids = {
  workspace: WorkspaceIdSchema.parse("00000000-0000-4000-8000-000000001301"),
  space: "00000000-0000-4000-8000-000000001302",
  principal: "00000000-0000-4000-8000-000000001303",
  credential: "00000000-0000-4000-8000-000000001304",
  grant: "00000000-0000-4000-8000-000000001305",
  document: DocumentIdSchema.parse("00000000-0000-4000-8000-000000001306"),
  device: DeviceIdSchema.parse("document-bridge-device"),
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
      "workspace.bootstrapContext",
      "document.create",
      "document.list",
      "project.create",
      "project.updateOutcome",
    ],
    origin: "desktop",
  });

const setup = () => {
  const database = new DatabaseSync(":memory:");
  const store = new SqliteApplicationStore(
    database as unknown as SqliteDatabase,
  );
  const runtime = createRuntimeKernelService({ context: context(), store });
  let projectId: ProjectId | undefined;
  for (const command of [
    {
      contractVersion: 1,
      commandName: "workspace.createLocal",
      commandId: "00000000-0000-4000-8000-000000001310",
      workspaceId: ids.workspace,
      idempotencyKey: "document-bridge-workspace",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000001311",
      payload: {
        workspaceId: ids.workspace,
        rootSpaceId: ids.space,
        ownerPrincipalId: ids.principal,
        name: "Document bridge",
        timezone: "Europe/Warsaw",
      },
    },
    {
      contractVersion: 1,
      commandName: "document.create",
      commandId: "00000000-0000-4000-8000-000000001312",
      workspaceId: ids.workspace,
      idempotencyKey: "document-bridge-document",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000001313",
      payload: {
        documentId: ids.document,
        spaceId: context().spaceScope[0]!,
        title: "Local first document",
      },
    },
    {
      contractVersion: 1,
      commandName: "project.create",
      commandId: "00000000-0000-4000-8000-000000001314",
      workspaceId: ids.workspace,
      idempotencyKey: "document-bridge-project",
      expectedVersions: {},
      correlationId: "00000000-0000-4000-8000-000000001315",
      payload: {
        spaceId: context().spaceScope[0]!,
        title: "Collaborative Project",
        intendedOutcome: "One Project-owned rich body",
      },
    },
  ]) {
    const result = runtime.execute(command);
    assert.equal(result.kind, "command_outcome");
    if (result.kind === "command_outcome") {
      assert.equal(result.outcome.outcome, "success");
      if (
        result.outcome.outcome === "success" &&
        result.outcome.projection.kind === "project.created"
      ) {
        projectId = result.outcome.projection.projectId;
      }
    }
  }
  if (projectId === undefined) throw new Error("Expected Project creation.");
  return { database, store, runtime, projectId };
};

const edit = (text: string) => {
  const adapter = new YjsRealtimeDocumentAdapter();
  let update: Uint8Array<ArrayBufferLike> = new Uint8Array();
  const unsubscribe = adapter.onUpdate((value) => {
    update = value;
  });
  adapter.replaceText(text, {
    kind: "human",
    principalId: ids.principal,
  });
  unsubscribe();
  const result = { state: adapter.encodeState(), update };
  adapter.destroy();
  return result;
};

const richEdit = (text: string) => {
  const adapter = new YjsRealtimeDocumentAdapter();
  adapter.replaceText(text, {
    kind: "human",
    principalId: ids.principal,
  });
  adapter.migrateToRich("a".repeat(64), {
    kind: "human",
    principalId: ids.principal,
  });
  const result = {
    state: adapter.encodeState(),
    update: adapter.encodeState(),
  };
  adapter.destroy();
  return result;
};

const richEntityEdit = () => {
  const base = richEdit("Sprawdź ");
  const document = new Y.Doc();
  Y.applyUpdate(document, base.state);
  let update = new Uint8Array();
  document.on("update", (value) => {
    update = Uint8Array.from(value);
  });
  const paragraph = document
    .getXmlFragment(RICH_DOCUMENT_FRAGMENT_ROOT)
    .get(0) as Y.XmlElement;
  const reference = new Y.XmlElement("entityReference");
  reference.setAttribute("targetKind", "task");
  reference.setAttribute("targetId", "00000000-0000-4000-8000-000000001399");
  paragraph.insert(paragraph.length, [reference]);
  const result = { state: Y.encodeStateAsUpdate(document), update };
  document.destroy();
  return result;
};

describe("desktop document collaboration bridge", () => {
  it("keeps local documents encrypted-store backed and supports named restore", async () => {
    const { database, store } = setup();
    const bridge = new DocumentCollaborationBridge({
      workspaceId: ids.workspace,
      deviceId: ids.device,
      store,
      connection: () => undefined,
      now: () => "2026-07-14T15:00:00.000Z",
    });
    const first = edit("Zakres pilotażu");
    bridge.persist({
      documentId: ids.document,
      spaceId: ids.space,
      ...first,
    });
    const revisionId = await bridge.createRevision({
      documentId: ids.document,
      name: "Review 1",
    });
    const second = edit("Zmieniony zakres");
    bridge.persist({
      documentId: ids.document,
      spaceId: ids.space,
      ...second,
    });
    await bridge.restoreRevision({ documentId: ids.document, revisionId });
    const opened = await bridge.open({
      documentId: ids.document,
      spaceId: ids.space,
      supportedDocumentFormats: ["plain-v1", "rich-v1"],
    });
    assert.equal(opened.mode, "local");
    assert.equal(opened.searchIndexState, "current");
    assert.ok(opened.state);
    const restored = new YjsRealtimeDocumentAdapter(opened.state);
    assert.equal(restored.getText(), "Zakres pilotażu");
    restored.destroy();
    assert.deepEqual(
      store.read((view) =>
        isApplicationWave2ReadView(view)
          ? view.searchDocumentBodies(
              ids.workspace,
              context().spaceScope[0]!,
              "zakres pilotażu",
              10,
            )
          : [],
      ),
      [
        {
          documentId: ids.document,
          snippet: "Zakres pilotażu",
        },
      ],
    );
    assert.equal(
      (await bridge.listRevisions({ documentId: ids.document })).length,
      2,
    );
    database.close();
  });

  it("opens, indexes, revisions, and restores Project-owned rich content", async () => {
    const { database, store, runtime, projectId } = setup();
    const bridge = new DocumentCollaborationBridge({
      workspaceId: ids.workspace,
      deviceId: ids.device,
      store,
      connection: () => undefined,
      now: () => "2026-07-22T02:00:00.000Z",
    });
    const owner = { kind: "project", projectId } as const;
    const seeded = await bridge.openContent({
      owner,
      spaceId: ids.space,
      supportedDocumentFormats: ["rich-v1"],
    });
    assert.ok(seeded.state);
    const initial = new YjsRealtimeDocumentAdapter(seeded.state);
    assert.equal(initial.getText(), "One Project-owned rich body");
    initial.destroy();
    bridge.persistContent({
      owner,
      spaceId: ids.space,
      ...richEdit("Pierwszy plan projektu"),
    });
    const scalarUpdate = runtime.execute({
      contractVersion: 1,
      commandName: "project.updateOutcome",
      commandId: "00000000-0000-4000-8000-000000001316",
      workspaceId: ids.workspace,
      idempotencyKey: "project-scalar-after-rich-seed",
      expectedVersions: { [projectId]: 1 },
      correlationId: "00000000-0000-4000-8000-000000001317",
      payload: {
        projectId,
        intendedOutcome: "Changed scalar outcome",
      },
    });
    assert.equal(
      scalarUpdate.kind === "command_outcome"
        ? scalarUpdate.outcome.outcome
        : "invalid",
      "success",
    );
    const revisionId = await bridge.createContentRevision({
      owner,
      name: "Project review",
    });
    bridge.persistContent({
      owner,
      spaceId: ids.space,
      ...richEdit("Zmieniony plan projektu"),
    });
    await bridge.restoreContentRevision({ owner, revisionId });
    const opened = await bridge.openContent({
      owner,
      spaceId: ids.space,
      supportedDocumentFormats: ["rich-v1"],
    });
    assert.equal(opened.mode, "local");
    assert.equal(opened.searchIndexState, "current");
    const restored = new YjsRealtimeDocumentAdapter(opened.state);
    assert.equal(restored.getText(), "Pierwszy plan projektu");
    restored.destroy();
    assert.deepEqual(
      (await bridge.listContentRevisions({ owner }))
        .map((revision) => revision.name)
        .sort(),
      ["Project review", "Restored Project review"],
    );
    assert.equal(
      store.getCollaborativeContentSearchProjection({
        owner,
        workspaceId: ids.workspace,
        spaceId: context().spaceScope[0]!,
      })?.body,
      "Pierwszy plan projektu",
    );
    const coordinatedBridge = new DocumentCollaborationBridge({
      workspaceId: ids.workspace,
      deviceId: ids.device,
      store,
      connection: () => ({
        workspaceId: ids.workspace,
        deviceId: ids.device,
        origin: "https://hub.example.test",
        deviceCredential: "offline-project-device",
        providerInstanceId: "constellation.hub:project-offline",
      }),
      now: () => "2026-07-22T02:05:00.000Z",
    });
    coordinatedBridge.persistContent({
      owner,
      spaceId: ids.space,
      ...richEdit("Edycja projektu oczekująca na Hub"),
    });
    assert.equal(
      store.listPendingCollaborativeContentUpdates({
        owner,
        workspaceId: ids.workspace,
        spaceId: context().spaceScope[0]!,
      }).length,
      1,
    );
    coordinatedBridge.acknowledgeContent({ owner, spaceId: ids.space });
    assert.equal(
      store.listPendingCollaborativeContentUpdates({
        owner,
        workspaceId: ids.workspace,
        spaceId: context().spaceScope[0]!,
      }).length,
      0,
    );
    database.close();
  });

  it("keeps the durable device credential in main and returns only a short session", async () => {
    const { database, store } = setup();
    let authorizationHeader = "";
    const bridge = new DocumentCollaborationBridge({
      workspaceId: ids.workspace,
      deviceId: ids.device,
      store,
      connection: () => ({
        workspaceId: ids.workspace,
        deviceId: ids.device,
        origin: "https://hub.example.test",
        deviceCredential: "durable-main-only-secret",
        providerInstanceId: "constellation.hub:test",
      }),
      fetcher: async (_url, init) => {
        authorizationHeader =
          new Headers(init?.headers).get("authorization") ?? "";
        return new Response(
          JSON.stringify({
            token: "short-lived-session",
            room: `${ids.workspace}/${ids.document}`,
            expiresAt: "2026-07-14T15:05:00.000Z",
            access: "edit",
            documentFormat: "plain-v1",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    const opened = await bridge.open({
      documentId: ids.document,
      spaceId: ids.space,
      supportedDocumentFormats: ["plain-v1", "rich-v1"],
    });
    assert.equal(opened.mode, "coordinated");
    assert.equal(opened.session?.token, "short-lived-session");
    assert.equal(opened.session?.url, "wss://hub.example.test/v1/realtime");
    assert.equal(authorizationHeader, "Bearer durable-main-only-secret");
    assert.equal(
      JSON.stringify(opened).includes("durable-main-only-secret"),
      false,
    );
    database.close();
  });

  it("refuses a legacy-only client after a local document becomes rich", async () => {
    const { database, store } = setup();
    const bridge = new DocumentCollaborationBridge({
      workspaceId: ids.workspace,
      deviceId: ids.device,
      store,
      connection: () => undefined,
    });
    bridge.persist({
      documentId: ids.document,
      spaceId: ids.space,
      ...richEdit("Dokument rich text"),
    });

    await assert.rejects(
      bridge.open({
        documentId: ids.document,
        spaceId: ids.space,
        supportedDocumentFormats: ["plain-v1"],
      }),
      /DOCUMENT_SCHEMA_UPGRADE_REQUIRED/u,
    );
    const current = await bridge.open({
      documentId: ids.document,
      spaceId: ids.space,
      supportedDocumentFormats: ["plain-v1", "rich-v1"],
    });
    assert.ok(current.state);
    const reopened = new YjsRealtimeDocumentAdapter(current.state);
    assert.equal(reopened.getFormat(), "rich-v1");
    reopened.destroy();
    database.close();
  });

  it("projects rich entity references idempotently and purges them with document state", () => {
    const { database, store } = setup();
    const bridge = new DocumentCollaborationBridge({
      workspaceId: ids.workspace,
      deviceId: ids.device,
      store,
      connection: () => undefined,
      now: () => "2026-07-21T20:00:00.000Z",
    });
    const linked = richEntityEdit();
    for (let replay = 0; replay < 2; replay += 1)
      bridge.persist({
        documentId: ids.document,
        spaceId: ids.space,
        ...linked,
      });
    const links = store.read((view) => {
      assert.equal(isApplicationWave2ReadView(view), true);
      if (!isApplicationWave2ReadView(view)) return [];
      return view.listDocumentEntityLinks(ids.workspace, "task");
    });
    assert.deepEqual(
      links.map(({ documentId, targetKind, targetId }) => ({
        documentId,
        targetKind,
        targetId,
      })),
      [
        {
          documentId: ids.document,
          targetKind: "task",
          targetId: "00000000-0000-4000-8000-000000001399",
        },
      ],
    );
    store.purgeDocumentCollaboration(ids.document);
    assert.equal(
      store.read((view) =>
        isApplicationWave2ReadView(view)
          ? view.listDocumentEntityLinks(ids.workspace).length
          : -1,
      ),
      0,
    );
    database.close();
  });
});
