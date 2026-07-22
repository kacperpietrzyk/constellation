import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  ApplicationKernel,
  isApplicationWave2ReadView,
  isApplicationWave2Transaction,
  RetryableUnitOfWorkError,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  CorrelationIdSchema,
  CapturePayloadIdSchema,
  DeviceIdSchema,
  ExecutionContextSchema,
  QueryEnvelopeSchema,
  type CaptureId,
  type CommandEnvelope,
  type CommandOutcome,
  type DocumentId,
  type DocumentRevisionId,
  type EventId,
  type ExecutionContext,
  type ProjectId,
  type RelationId,
  type SpaceId,
  type TaskId,
  type WorkspaceId,
} from "@constellation/contracts";
import type { DomainEvent, Task } from "@constellation/domain";
import {
  Base64JsonCursorCodec,
  DeterministicIdGenerator,
  InMemoryAuthorizationPolicy,
  Sha256SemanticHasher,
  TickingClock,
} from "@constellation/testkit";

import {
  LocalStoreCorruptionError,
  LOCAL_STORE_SCHEMA_VERSION,
  SqliteApplicationStore,
  initializeLocalStoreSchema,
  type SqliteDatabase,
} from "../src/index.js";
import { initializeLocalStoreSchemaForVersion } from "../src/sqlite-application-store.js";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  rootSpace: "00000000-0000-4000-8000-000000000002",
  principal: "00000000-0000-4000-8000-000000000003",
  credential: "00000000-0000-4000-8000-000000000004",
  grant: "00000000-0000-4000-8000-000000000005",
} as const;

const context = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.principal,
    principalKind: "human",
    credentialId: ids.credential,
    grantId: ids.grant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.rootSpace],
    capabilityScope: [
      "workspace.createLocal",
      "workspace.rename",
      "workspace.bootstrapContext",
      "capture.submitText",
      "capture.routeAsTask",
      "capture.history",
      "project.create",
      "project.updateOutcome",
      "project.list",
      "project.operationalOverview",
      "task.setStatus",
      "task.complete",
      "task.reopen",
      "task.assign",
      "task.unassign",
      "task.assignmentCandidates",
      "comment.add",
      "comment.edit",
      "comment.resolve",
      "comment.reopen",
      "comment.list",
      "comment.mentionCandidates",
      "attention.inbox",
      "attention.markRead",
      "attention.dismiss",
      "record.relate",
      "record.unrelate",
      "search.global",
      "cockpit.week",
      "activity.meaningful",
      "command.previewUndo",
      "command.undo",
      "recovery.preview",
      "task.list",
      "audit.receipt",
      "document.create",
      "document.list",
      "knowledge.sourceCreate",
      "knowledge.sourceUpdate",
      "knowledge.documentSetEvidence",
      "knowledge.namedVersionCreate",
      "knowledge.namedVersionVoid",
      "knowledge.list",
      "knowledge.documentContext",
      "relationship.organizationCreate",
      "relationship.personCreate",
      "opportunity.create",
      "opportunity.offerCreate",
      "opportunity.linkOutcomes",
      "relationship.workspace",
      "meeting.upsertImported",
      "meeting.editWorkItem",
    ],
    origin: "desktop",
  });

const workspaceCommand = CommandEnvelopeSchema.parse({
  contractVersion: 1,
  commandName: "workspace.createLocal",
  commandId: "00000000-0000-4000-8000-000000000010",
  workspaceId: ids.workspace,
  idempotencyKey: "durable-workspace-v1",
  expectedVersions: {},
  correlationId: "00000000-0000-4000-8000-000000000011",
  payload: {
    workspaceId: ids.workspace,
    rootSpaceId: ids.rootSpace,
    ownerPrincipalId: ids.principal,
    name: "Durable synthetic workspace",
    timezone: "Europe/Warsaw",
  },
});

describe("meeting loop persistence", () => {
  it("persists optimistic meeting state in the encrypted workspace database", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const state = {
      revision: 1,
      meetings: [],
      previews: [],
      audits: [],
      receipts: [
        {
          id: "00000000-0000-4000-8000-000000000099",
          workspaceId: context().workspaceId,
          externalMeetingIdHash: "a".repeat(64),
          outcome: "no_change" as const,
          changedRecordIds: [],
          occurredAt: "2026-07-15T10:00:00.000Z",
        },
      ],
    };
    assert.equal(store.save(context().workspaceId, 0, state), true);
    assert.equal(store.save(context().workspaceId, 0, state), false);
    assert.deepEqual(store.load(context().workspaceId), state);
    database.close();
  });

  it("projects imported meeting work through the coordinated snapshot onto a second device", () => {
    const sourceDatabase = new DatabaseSync(":memory:");
    const source = createKernel(sourceDatabase);
    assert.equal(
      unwrap(source.kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const meetingId = "00000000-0000-4000-8000-000000000191";
    const meeting = {
      id: meetingId,
      workspaceId: ids.workspace,
      spaceId: ids.rootSpace,
      connectionId: "jamie-personal",
      externalMeetingId: "jamie-meeting-191",
      title: "Coordinated customer review",
      startedAt: "2026-07-15T10:00:00.000Z",
      participants: [],
      workItems: [
        {
          id: "00000000-0000-4000-8000-000000000192",
          kind: "follow_up" as const,
          sourceExternalId: "local:follow-up-191",
          title: "Send the evidence pack",
          state: "open" as const,
          sourceControlled: false,
          locallyModified: true,
          assignee: {
            name: "Antek",
            email: "antek@example.com",
          },
          responsibilityOverride: { name: "Alex" },
          version: 1,
        },
      ],
      contentHash: "b".repeat(64),
      triage: "ready" as const,
      missingComponents: [],
      version: 1,
      updatedAt: "2026-07-15T10:05:00.000Z",
    };
    assert.equal(
      unwrap(
        source.kernel.execute(
          context(),
          CommandEnvelopeSchema.parse({
            contractVersion: 1,
            commandName: "meeting.upsertImported",
            commandId: "00000000-0000-4000-8000-000000000193",
            workspaceId: ids.workspace,
            idempotencyKey: "meeting-191-v1",
            expectedVersions: {},
            correlationId: "00000000-0000-4000-8000-000000000194",
            payload: { meeting },
          }),
        ),
      ).outcome,
      "success",
    );
    const targetDatabase = new DatabaseSync(":memory:");
    const target = createKernel(targetDatabase);
    target.store.initializeProjection(source.store.snapshot());
    assert.deepEqual(target.store.load(context().workspaceId).meetings, [
      meeting,
    ]);
    assert.equal(
      target.store.snapshot().strategicRecords?.[0]?.kind,
      "meeting",
    );
    const completedMeeting = {
      ...meeting,
      workItems: [
        { ...meeting.workItems[0]!, state: "completed" as const, version: 2 },
      ],
      version: 2,
      updatedAt: "2026-07-15T10:10:00.000Z",
    };
    assert.equal(
      unwrap(
        target.kernel.execute(
          context(),
          CommandEnvelopeSchema.parse({
            contractVersion: 1,
            commandName: "meeting.upsertImported",
            commandId: "00000000-0000-4000-8000-000000000195",
            workspaceId: ids.workspace,
            idempotencyKey: "meeting-191-v2-device-b",
            expectedVersions: { [meetingId]: 1 },
            correlationId: "00000000-0000-4000-8000-000000000196",
            payload: { meeting: completedMeeting },
          }),
        ),
      ).outcome,
      "success",
    );
    assert.equal(
      target.store.load(context().workspaceId).meetings[0]?.workItems[0]?.state,
      "completed",
    );
    sourceDatabase.close();
    targetDatabase.close();
  });

  it("carries a kernel work-item edit into the device meeting-loop state", () => {
    // ADR-047 §2. The desktop delegates work-item corrections to the kernel,
    // which writes the strategic record. That is only safe because this store
    // merges a record whose inner meeting version is higher into the
    // device-local state — an edit that failed to advance that version would
    // be discarded here, silently, on the next read.
    const database = new DatabaseSync(":memory:");
    const device = createKernel(database);
    assert.equal(
      unwrap(device.kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const meetingId = "00000000-0000-4000-8000-000000000291";
    const workItemId = "00000000-0000-4000-8000-000000000292";
    assert.equal(
      unwrap(
        device.kernel.execute(
          context(),
          CommandEnvelopeSchema.parse({
            contractVersion: 1,
            commandName: "meeting.upsertImported",
            commandId: "00000000-0000-4000-8000-000000000293",
            workspaceId: ids.workspace,
            idempotencyKey: "meeting-291-v1",
            expectedVersions: {},
            correlationId: "00000000-0000-4000-8000-000000000294",
            payload: {
              meeting: {
                id: meetingId,
                workspaceId: ids.workspace,
                spaceId: ids.rootSpace,
                connectionId: "jamie-personal",
                externalMeetingId: "jamie-meeting-291",
                title: "Delivery review",
                startedAt: "2026-07-21T10:00:00.000Z",
                participants: [],
                workItems: [
                  {
                    id: workItemId,
                    kind: "task" as const,
                    sourceExternalId: "task-291",
                    title: "Confirm the rollout owner",
                    state: "open" as const,
                    sourceControlled: true,
                    locallyModified: false,
                    version: 1,
                  },
                ],
                contentHash: "c".repeat(64),
                triage: "ready" as const,
                missingComponents: [],
                version: 1,
                updatedAt: "2026-07-21T10:05:00.000Z",
              },
            },
          }),
        ),
      ).outcome,
      "success",
    );
    assert.equal(
      unwrap(
        device.kernel.execute(
          context(),
          CommandEnvelopeSchema.parse({
            contractVersion: 1,
            commandName: "meeting.editWorkItem",
            commandId: "00000000-0000-4000-8000-000000000295",
            workspaceId: ids.workspace,
            idempotencyKey: "meeting-291-edit",
            expectedVersions: { [meetingId]: 1 },
            correlationId: "00000000-0000-4000-8000-000000000296",
            payload: {
              meetingId,
              workItemId,
              expectedWorkItemVersion: 1,
              title: "Confirm the rollout owner this week",
              state: "open",
            },
          }),
        ),
      ).outcome,
      "success",
    );
    const meeting = device.store.load(context().workspaceId).meetings[0];
    assert.equal(meeting?.version, 2);
    assert.equal(
      meeting?.workItems[0]?.title,
      "Confirm the rollout owner this week",
    );
    assert.equal(meeting?.workItems[0]?.locallyModified, true);
    database.close();
  });
});

const captureCommand = CommandEnvelopeSchema.parse({
  contractVersion: 1,
  commandName: "capture.submitText",
  commandId: "00000000-0000-4000-8000-000000000012",
  workspaceId: ids.workspace,
  idempotencyKey: "durable-capture-v1",
  expectedVersions: {},
  correlationId: "00000000-0000-4000-8000-000000000013",
  payload: {
    spaceId: ids.rootSpace,
    originalText: "Prepare the restart-safe review",
    deviceId: "synthetic-local-store-test",
    source: "in_app_quick_capture",
  },
});

const sqlitePort = (database: DatabaseSync): SqliteDatabase =>
  database as unknown as SqliteDatabase;

const versionOneSchema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE workspaces (id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE TABLE spaces (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE INDEX spaces_workspace ON spaces(workspace_id, id);
  CREATE TABLE memberships (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), principal_id TEXT NOT NULL, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL, UNIQUE(workspace_id, principal_id)) STRICT;
  CREATE TABLE task_statuses (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), position INTEGER NOT NULL, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE INDEX task_statuses_workspace ON task_statuses(workspace_id, position, id);
  CREATE TABLE captures (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), captured_at TEXT NOT NULL, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE INDEX captures_page ON captures(workspace_id, space_id, captured_at DESC, id DESC);
  CREATE TABLE tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), created_at TEXT NOT NULL, version INTEGER NOT NULL CHECK (version > 0), payload_json TEXT NOT NULL) STRICT;
  CREATE INDEX tasks_page ON tasks(workspace_id, space_id, created_at DESC, id DESC);
  CREATE TABLE events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), payload_json TEXT NOT NULL) STRICT;
  CREATE TABLE audit_receipts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), payload_json TEXT NOT NULL) STRICT;
  CREATE TABLE idempotency_records (scope TEXT PRIMARY KEY, payload_json TEXT NOT NULL) STRICT;
  CREATE TABLE outbox_entries (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), space_id TEXT NOT NULL REFERENCES spaces(id), event_id TEXT NOT NULL REFERENCES events(id), payload_json TEXT NOT NULL) STRICT;
  PRAGMA user_version = 1;
`;

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome")
    throw new Error("Expected command outcome.");
  return response.outcome;
};

const createKernelWithStore = (store: SqliteApplicationStore) => {
  const authorization = new InMemoryAuthorizationPolicy();
  authorization.register(context());
  const kernel = new ApplicationKernel({
    authorization,
    clock: new TickingClock(),
    cursorCodec: new Base64JsonCursorCodec(),
    hasher: new Sha256SemanticHasher(),
    ids: new DeterministicIdGenerator(),
    store,
  });
  return { kernel, store };
};

const createKernel = (database: DatabaseSync) =>
  createKernelWithStore(new SqliteApplicationStore(sqlitePort(database)));

const routeCommand = (captureId: CaptureId): CommandEnvelope =>
  CommandEnvelopeSchema.parse({
    contractVersion: 1,
    commandName: "capture.routeAsTask",
    commandId: "00000000-0000-4000-8000-000000000014",
    workspaceId: ids.workspace,
    idempotencyKey: "durable-route-v1",
    expectedVersions: { [captureId]: 1 },
    correlationId: captureCommand.correlationId,
    payload: { captureId, title: "Prepare the restart-safe review" },
  });

const withDatabase = (run: (filename: string) => void): void => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "constellation-local-store-"),
  );
  try {
    run(path.join(directory, "workspace.db"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

let wave2RequestSequence = 512;
const wave2RequestId = (): string => {
  const suffix = wave2RequestSequence.toString(16).padStart(12, "0");
  wave2RequestSequence += 1;
  return `00000000-0000-4000-8000-${suffix}`;
};

const wave2Command = (
  commandName: CommandEnvelope["commandName"],
  payload: object,
  idempotencyKey: string,
  expectedVersions: Readonly<Record<string, number>> = {},
): CommandEnvelope =>
  CommandEnvelopeSchema.parse({
    contractVersion: 1,
    commandName,
    commandId: wave2RequestId(),
    workspaceId: ids.workspace,
    idempotencyKey,
    expectedVersions,
    correlationId: wave2RequestId(),
    payload,
  });

describe("SQLite ApplicationStore", () => {
  it("restores sources, evidence links, and immutable named versions after restart", () => {
    withDatabase((filename) => {
      const sourceId = "00000000-0000-4000-8000-000000000130";
      const noteId = "00000000-0000-4000-8000-000000000131";
      const deliverableId = "00000000-0000-4000-8000-000000000132";
      const namedVersionId = "00000000-0000-4000-8000-000000000133";
      const firstDatabase = new DatabaseSync(filename);
      const first = createKernel(firstDatabase);
      assert.equal(
        unwrap(first.kernel.execute(context(), workspaceCommand)).outcome,
        "success",
      );
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command(
              "knowledge.sourceCreate",
              {
                sourceId,
                spaceId: ids.rootSpace,
                sourceKind: "url",
                title: "Durable source",
                canonicalUrl: "https://example.test/durable",
                availability: "available",
                observedAt: "2026-07-15T08:00:00.000Z",
              },
              "durable-source",
            ),
          ),
        ).outcome,
        "success",
      );
      for (const [documentId, role] of [
        [noteId, "note"],
        [deliverableId, "deliverable"],
      ] as const) {
        assert.equal(
          unwrap(
            first.kernel.execute(
              context(),
              wave2Command(
                "document.create",
                {
                  documentId,
                  spaceId: ids.rootSpace,
                  title: `Durable ${role}`,
                  role,
                },
                `durable-${role}`,
              ),
            ),
          ).outcome,
          "success",
        );
      }
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command(
              "knowledge.documentSetEvidence",
              {
                documentId: deliverableId,
                sourceIds: [sourceId],
                noteDocumentIds: [noteId],
              },
              "durable-evidence",
              { [deliverableId]: 1, [sourceId]: 1, [noteId]: 1 },
            ),
          ),
        ).outcome,
        "success",
      );
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command(
              "knowledge.namedVersionCreate",
              {
                namedVersionId,
                documentId: deliverableId,
                documentRevisionId: "00000000-0000-4000-8000-000000000134",
                name: "Delivered state",
                milestone: "delivered",
                contentSnapshot: "Durable content",
              },
              "durable-named-version",
              { [deliverableId]: 2, [sourceId]: 1, [noteId]: 1 },
            ),
          ),
        ).outcome,
        "success",
      );
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(filename);
      const reopened = createKernel(reopenedDatabase);
      const snapshot = reopened.store.snapshot();
      assert.equal(snapshot.knowledgeSources?.[0]?.id, sourceId);
      assert.deepEqual(
        snapshot.documents?.find((item) => item.id === deliverableId)?.evidence,
        { sourceIds: [sourceId], noteDocumentIds: [noteId] },
      );
      assert.equal(
        snapshot.namedDocumentVersions?.[0]?.evidence[0]?.version,
        1,
      );
      assert.equal(snapshot.namedDocumentVersions?.[0]?.state, "active");
      reopenedDatabase.close();
    });
  });

  it("persists document state and its outbox atomically across restart, then purges collaboration data", () => {
    withDatabase((filename) => {
      const documentId = "00000000-0000-4000-8000-000000000120" as DocumentId;
      const revisionId =
        "00000000-0000-4000-8000-000000000121" as DocumentRevisionId;
      const scope = {
        documentId,
        workspaceId: context().workspaceId,
        spaceId: context().spaceScope[0]!,
      };
      const firstDatabase = new DatabaseSync(filename);
      const first = createKernel(firstDatabase);
      assert.equal(
        unwrap(first.kernel.execute(context(), workspaceCommand)).outcome,
        "success",
      );
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command(
              "document.create",
              { documentId, spaceId: scope.spaceId, title: "Shared notes" },
              "document-create",
            ),
          ),
        ).outcome,
        "success",
      );
      first.store.replaceDocumentEntityLinks({
        ...scope,
        links: [
          {
            targetKind: "task",
            targetId: "00000000-0000-4000-8000-000000000129",
          },
        ],
        updatedAt: "2026-07-14T13:59:00.000Z",
      });
      first.store.replaceDocumentSearchProjection({
        ...scope,
        body: "Poufny zakres pilotażu dla fabryki",
        stateDigest: "a".repeat(64),
        indexedAt: "2026-07-14T13:59:30.000Z",
      });
      first.store.commitDocumentUpdate({
        id: "update-1",
        ...scope,
        state: Uint8Array.of(1, 2, 3),
        update: Uint8Array.of(2, 3),
        createdAt: "2026-07-14T14:00:00.000Z",
      });
      first.store.storeDocumentRevision({
        id: revisionId,
        ...scope,
        name: "Before review",
        engine: "yjs-13",
        state: Uint8Array.of(1, 2, 3),
        stateVector: Uint8Array.of(4),
        createdBy: context().principalId,
        createdByDeviceId: DeviceIdSchema.parse("local-store-test-device"),
        correlationId: CorrelationIdSchema.parse(
          "00000000-0000-4000-8000-000000000122",
        ),
        createdAt: "2026-07-14T14:01:00.000Z",
      });

      firstDatabase.exec(`
        CREATE TRIGGER fail_document_update BEFORE INSERT ON content_pending_updates BEGIN
          SELECT RAISE(ABORT, 'synthetic document outbox failure');
        END;
      `);
      assert.throws(() =>
        first.store.commitDocumentUpdate({
          id: "update-2",
          ...scope,
          state: Uint8Array.of(9),
          update: Uint8Array.of(9),
          createdAt: "2026-07-14T14:02:00.000Z",
        }),
      );
      assert.deepEqual(
        [...(first.store.loadDocumentCollaborationState(scope)?.state ?? [])],
        [1, 2, 3],
      );
      firstDatabase.exec("DROP TRIGGER fail_document_update;");
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(filename);
      const reopened = createKernel(reopenedDatabase);
      assert.deepEqual(
        [
          ...(reopened.store.loadDocumentCollaborationState(scope)?.state ??
            []),
        ],
        [1, 2, 3],
      );
      assert.deepEqual(
        reopened.store
          .listPendingDocumentUpdates(scope)
          .map((update) => [update.id, [...update.update]]),
        [["update-1", [2, 3]]],
      );
      assert.deepEqual(
        reopened.store.read((view) => {
          assert.equal(isApplicationWave2ReadView(view), true);
          if (!isApplicationWave2ReadView(view))
            throw new Error("Expected the Wave 2 reference view.");
          return view.listDocumentEntityLinks(scope.workspaceId);
        }),
        [
          {
            workspaceId: scope.workspaceId,
            spaceId: scope.spaceId,
            documentId,
            targetKind: "task",
            targetId: "00000000-0000-4000-8000-000000000129",
            updatedAt: "2026-07-14T13:59:00.000Z",
          },
        ],
      );
      assert.deepEqual(
        reopened.store.read((view) => {
          assert.equal(isApplicationWave2ReadView(view), true);
          if (!isApplicationWave2ReadView(view)) return [];
          return view.searchDocumentBodies(
            scope.workspaceId,
            scope.spaceId,
            "zakres pilotażu",
            10,
          );
        }),
        [
          {
            documentId,
            snippet: "Poufny zakres pilotażu dla fabryki",
          },
        ],
      );
      const bodySearch = reopened.kernel.query(
        context(),
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName: "search.global",
          queryId: "00000000-0000-4000-8000-000000000128",
          workspaceId: scope.workspaceId,
          consistency: "local_authoritative",
          parameters: {
            spaceIds: [scope.spaceId],
            text: "zakres pilotażu",
          },
        }),
      );
      assert.equal(bodySearch.kind, "query_result");
      if (
        bodySearch.kind !== "query_result" ||
        bodySearch.result.outcome !== "success" ||
        bodySearch.result.projection.kind !== "search.global"
      ) {
        throw new Error("Expected document body search result.");
      }
      assert.equal(bodySearch.result.projection.items.length, 1);
      assert.deepEqual(bodySearch.result.projection.items[0]?.matchedFields, [
        "body",
      ]);
      assert.equal(
        bodySearch.result.projection.items[0]?.snippet,
        "Poufny zakres pilotażu dla fabryki",
      );
      const restoredRevision = reopened.store.listDocumentRevisions(scope)[0];
      assert.equal(restoredRevision?.id, revisionId);
      assert.equal(
        restoredRevision?.createdByDeviceId,
        "local-store-test-device",
      );
      assert.equal(
        restoredRevision?.correlationId,
        "00000000-0000-4000-8000-000000000122",
      );
      reopened.store.acknowledgeDocumentUpdates({
        documentId,
        updateIds: ["update-1"],
      });
      assert.equal(reopened.store.listPendingDocumentUpdates(scope).length, 0);
      reopened.store.purgeDocumentCollaboration(documentId);
      assert.equal(
        reopened.store.loadDocumentCollaborationState(scope),
        undefined,
      );
      for (const table of [
        "content_pending_updates",
        "content_collaboration_state",
        "content_revisions",
        "content_entity_links",
        "content_search_projections",
      ]) {
        assert.equal(
          (
            reopenedDatabase
              .prepare(`SELECT count(*) AS count FROM ${table}`)
              .get() as { count: number }
          ).count,
          0,
        );
      }
      assert.equal(
        (
          reopenedDatabase
            .prepare(
              "SELECT count(*) AS count FROM work_search WHERE record_id = ?",
            )
            .get(documentId) as { count: number }
        ).count,
        0,
      );
      const purgedSearch = reopened.kernel.query(
        context(),
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName: "search.global",
          queryId: "00000000-0000-4000-8000-000000000127",
          workspaceId: scope.workspaceId,
          consistency: "local_authoritative",
          parameters: {
            spaceIds: [scope.spaceId],
            text: "zakres pilotażu",
          },
        }),
      );
      assert.equal(
        purgedSearch.kind === "query_result" &&
          purgedSearch.result.outcome === "success" &&
          purgedSearch.result.projection.kind === "search.global"
          ? purgedSearch.result.projection.items.length
          : -1,
        0,
      );
      reopenedDatabase.close();
    });
  });

  it("isolates Project and Document content owners even when their UUIDs match", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const sharedId = "00000000-0000-4000-8000-00000000012a";
    const documentId = sharedId as DocumentId;
    const projectId = sharedId as ProjectId;
    assert.equal(
      unwrap(
        kernel.execute(
          context(),
          wave2Command(
            "document.create",
            {
              documentId,
              spaceId: ids.rootSpace,
              title: "Same-id document",
            },
            "same-id-document",
          ),
        ),
      ).outcome,
      "success",
    );
    store.transact((transaction) => {
      assert.equal(isApplicationWave2Transaction(transaction), true);
      if (!isApplicationWave2Transaction(transaction))
        throw new Error("Expected Wave 2 transaction.");
      transaction.insertProject({
        id: projectId,
        workspaceId: context().workspaceId,
        spaceId: context().spaceScope[0]!,
        title: "Same-id project",
        intendedOutcome: "Prove owner isolation",
        lifecycle: "active",
        createdBy: context().principalId,
        version: 1,
        createdAt: "2026-07-22T01:30:00.000Z",
        updatedAt: "2026-07-22T01:30:00.000Z",
      });
    });
    const documentOwner = { kind: "document", documentId } as const;
    const projectOwner = { kind: "project", projectId } as const;
    const scope = {
      workspaceId: context().workspaceId,
      spaceId: context().spaceScope[0]!,
    };
    store.storeCollaborativeContentState({
      owner: documentOwner,
      ...scope,
      state: Uint8Array.of(1, 2, 3),
      updatedAt: "2026-07-22T01:31:00.000Z",
    });
    store.storeCollaborativeContentState({
      owner: projectOwner,
      ...scope,
      state: Uint8Array.of(7, 8, 9),
      updatedAt: "2026-07-22T01:32:00.000Z",
    });
    store.replaceCollaborativeContentSearchProjection({
      owner: documentOwner,
      ...scope,
      body: "Document-only evidence",
      stateDigest: "a".repeat(64),
      indexedAt: "2026-07-22T01:33:00.000Z",
    });
    store.replaceCollaborativeContentSearchProjection({
      owner: projectOwner,
      ...scope,
      body: "NebulaProjectEvidence",
      stateDigest: "b".repeat(64),
      indexedAt: "2026-07-22T01:34:00.000Z",
    });

    assert.deepEqual(
      [
        ...(store.loadCollaborativeContentState({
          owner: documentOwner,
          ...scope,
        })?.state ?? []),
      ],
      [1, 2, 3],
    );
    assert.deepEqual(
      [
        ...(store.loadCollaborativeContentState({
          owner: projectOwner,
          ...scope,
        })?.state ?? []),
      ],
      [7, 8, 9],
    );
    assert.equal(
      (
        database
          .prepare(
            "SELECT count(*) AS count FROM content_collaboration_state WHERE owner_id = ?",
          )
          .get(sharedId) as { count: number }
      ).count,
      2,
    );
    const projectSearch = kernel.query(
      context(),
      QueryEnvelopeSchema.parse({
        contractVersion: 1,
        queryName: "search.global",
        queryId: "00000000-0000-4000-8000-00000000012b",
        workspaceId: scope.workspaceId,
        consistency: "local_authoritative",
        parameters: {
          spaceIds: [scope.spaceId],
          text: "NebulaProjectEvidence",
        },
      }),
    );
    assert.equal(projectSearch.kind, "query_result");
    if (
      projectSearch.kind !== "query_result" ||
      projectSearch.result.outcome !== "success" ||
      projectSearch.result.projection.kind !== "search.global"
    )
      throw new Error("Expected Project body search result.");
    assert.equal(projectSearch.result.projection.items.length, 1);
    assert.equal(
      projectSearch.result.projection.items[0]?.recordKind,
      "project",
    );
    assert.deepEqual(projectSearch.result.projection.items[0]?.matchedFields, [
      "body",
    ]);

    store.purgeCollaborativeContent(documentOwner);
    assert.equal(
      store.loadCollaborativeContentState({ owner: documentOwner, ...scope }),
      undefined,
    );
    assert.deepEqual(
      [
        ...(store.loadCollaborativeContentState({
          owner: projectOwner,
          ...scope,
        })?.state ?? []),
      ],
      [7, 8, 9],
    );
    assert.equal(
      store.getCollaborativeContentSearchProjection({
        owner: projectOwner,
        ...scope,
      })?.body,
      "NebulaProjectEvidence",
    );
    database.close();
  });

  it("maps only known safe SQLite write failures to exact retry outcomes", () => {
    for (const code of ["SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT"] as const) {
      const database = new DatabaseSync(":memory:");
      const delegated: SqliteDatabase = {
        exec(sql) {
          if (sql === "BEGIN IMMEDIATE;") {
            throw Object.assign(new Error(code), { code });
          }
          database.exec(sql);
        },
        prepare: (sql) => sqlitePort(database).prepare(sql),
      };
      const store = new SqliteApplicationStore(delegated);
      assert.throws(
        () => store.transact(() => undefined),
        (error) => {
          assert.ok(error instanceof RetryableUnitOfWorkError);
          assert.equal(error.diagnosticCode, "storage.unit_of_work_failed");
          return true;
        },
      );
      database.close();
    }

    for (const [code, diagnosticCode] of [
      ["SQLITE_FULL", "storage.capacity_exhausted"],
      ["SQLITE_READONLY_DIRECTORY", "storage.permission_denied"],
      ["SQLITE_PERM", "storage.permission_denied"],
      ["SQLITE_AUTH", "storage.permission_denied"],
    ] as const) {
      const database = new DatabaseSync(":memory:");
      const delegated: SqliteDatabase = {
        exec(sql) {
          if (sql === "BEGIN IMMEDIATE;")
            throw Object.assign(new Error(code), { code });
          database.exec(sql);
        },
        prepare: (sql) => sqlitePort(database).prepare(sql),
      };
      const store = new SqliteApplicationStore(delegated);
      assert.throws(
        () => store.transact(() => undefined),
        (error) => {
          assert.ok(error instanceof RetryableUnitOfWorkError);
          assert.equal(error.diagnosticCode, diagnosticCode);
          return true;
        },
      );
      database.close();
    }

    for (const code of [
      "SQLITE_LOCKED",
      "SQLITE_IOERR",
      "SQLITE_CANTOPEN",
    ] as const) {
      const database = new DatabaseSync(":memory:");
      const failure = Object.assign(new Error(code), { code });
      const delegated: SqliteDatabase = {
        exec(sql) {
          if (sql === "BEGIN IMMEDIATE;") throw failure;
          database.exec(sql);
        },
        prepare: (sql) => sqlitePort(database).prepare(sql),
      };
      const store = new SqliteApplicationStore(delegated);
      assert.throws(
        () => store.transact(() => undefined),
        (error) => {
          assert.equal(error, failure);
          assert.equal(error instanceof RetryableUnitOfWorkError, false);
          return true;
        },
      );
      database.close();
    }
  });

  it("rolls back a capacity failure at commit before a successful replay", () => {
    const database = new DatabaseSync(":memory:");
    let failCommit = false;
    const delegated: SqliteDatabase = {
      exec(sql) {
        if (sql === "COMMIT;" && failCommit) {
          throw Object.assign(new Error("SQLITE_FULL"), {
            code: "SQLITE_FULL",
          });
        }
        database.exec(sql);
      },
      prepare: (sql) => sqlitePort(database).prepare(sql),
    };
    const store = new SqliteApplicationStore(delegated);
    const { kernel } = createKernelWithStore(store);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    failCommit = true;

    const failed = unwrap(kernel.execute(context(), captureCommand));
    assert.equal(failed.outcome, "retryable");
    assert.equal(failed.diagnosticCode, "storage.capacity_exhausted");
    assert.equal(
      (
        database.prepare("SELECT count(*) AS count FROM captures").get() as {
          count: number;
        }
      ).count,
      0,
    );

    failCommit = false;
    assert.equal(
      unwrap(kernel.execute(context(), captureCommand)).outcome,
      "success",
    );
    assert.equal(
      (
        database.prepare("SELECT count(*) AS count FROM captures").get() as {
          count: number;
        }
      ).count,
      1,
    );
    database.close();
  });

  it("rolls back permission loss during a unit of work before replay", () => {
    const database = new DatabaseSync(":memory:");
    const store = new SqliteApplicationStore(sqlitePort(database));
    database.exec("CREATE TABLE permission_probe (value TEXT NOT NULL);");

    assert.throws(
      () =>
        store.transact(() => {
          database
            .prepare("INSERT INTO permission_probe(value) VALUES (?)")
            .run("must-roll-back");
          throw Object.assign(new Error("SQLITE_READONLY_DIRECTORY"), {
            code: "SQLITE_READONLY_DIRECTORY",
          });
        }),
      (error) => {
        assert.ok(error instanceof RetryableUnitOfWorkError);
        assert.equal(error.diagnosticCode, "storage.permission_denied");
        return true;
      },
    );
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS count FROM permission_probe")
          .get() as { count: number }
      ).count,
      0,
    );

    store.transact(() => {
      database
        .prepare("INSERT INTO permission_probe(value) VALUES (?)")
        .run("replayed");
    });
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS count FROM permission_probe")
          .get() as { count: number }
      ).count,
      1,
    );
    database.close();
  });

  it("does not promise a safe retry when rollback cannot be confirmed", () => {
    const database = new DatabaseSync(":memory:");
    const capacityFailure = Object.assign(new Error("SQLITE_FULL"), {
      code: "SQLITE_FULL",
    });
    const delegated: SqliteDatabase = {
      get inTransaction() {
        return true;
      },
      exec(sql) {
        if (sql === "ROLLBACK;")
          throw Object.assign(new Error("SQLITE_IOERR"), {
            code: "SQLITE_IOERR",
          });
        database.exec(sql);
      },
      prepare: (sql) => sqlitePort(database).prepare(sql),
    };
    const store = new SqliteApplicationStore(delegated);

    assert.throws(
      () =>
        store.transact(() => {
          throw capacityFailure;
        }),
      (error) => {
        assert.equal(error, capacityFailure);
        assert.equal(error instanceof RetryableUnitOfWorkError, false);
        return true;
      },
    );
    database.exec("ROLLBACK;");
    database.close();
  });

  it("survives a real SQLite capacity limit without a partial write", () => {
    const database = new DatabaseSync(":memory:");
    const store = new SqliteApplicationStore(sqlitePort(database));
    database.exec("CREATE TABLE capacity_probe (value BLOB NOT NULL);");
    const pageCount = (
      database.prepare("PRAGMA page_count").get() as { page_count: number }
    ).page_count;
    database.exec(`PRAGMA max_page_count = ${pageCount};`);

    assert.throws(
      () =>
        store.transact(() => {
          database
            .prepare("INSERT INTO capacity_probe(value) VALUES (zeroblob(?))")
            .run(1_000_000);
        }),
      (error) => {
        assert.ok(error instanceof RetryableUnitOfWorkError);
        assert.equal(error.diagnosticCode, "storage.capacity_exhausted");
        return true;
      },
    );
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS count FROM capacity_probe")
          .get() as { count: number }
      ).count,
      0,
    );

    database.exec(`PRAGMA max_page_count = ${pageCount + 4096};`);
    store.transact(() => {
      database
        .prepare("INSERT INTO capacity_probe(value) VALUES (zeroblob(?))")
        .run(128);
    });
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS count FROM capacity_probe")
          .get() as { count: number }
      ).count,
      1,
    );
    database.close();
  });

  it("preserves event command attribution across restart", () => {
    withDatabase((filename) => {
      const eventId = "00000000-0000-4000-8000-000000000089" as EventId;
      const firstDatabase = new DatabaseSync(filename);
      const first = createKernel(firstDatabase);
      assert.equal(
        unwrap(first.kernel.execute(context(), workspaceCommand)).outcome,
        "success",
      );
      const attributedEvent: DomainEvent = {
        id: eventId,
        type: "workspace.renamed",
        workspaceId: context().workspaceId,
        spaceId: context().spaceScope[0]!,
        aggregateId: context().workspaceId,
        aggregateVersion: 2,
        occurredAt: "2026-07-13T10:00:00.000Z",
        commandId: workspaceCommand.commandId,
      };
      first.store.transact((transaction) => {
        transaction.insertEvent(attributedEvent);
      });
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(filename);
      const reopened = createKernel(reopenedDatabase);
      reopened.store.read((view) => {
        assert.equal(isApplicationWave2ReadView(view), true);
        if (!isApplicationWave2ReadView(view)) return;
        const restored = view
          .listEvents(context().workspaceId, context().spaceScope[0]!)
          .find((event) => event.id === eventId);
        assert.equal(restored?.commandId, workspaceCommand.commandId);
      });
      reopenedDatabase.close();
    });
  });

  it("migrates a v1 database transactionally and backfills scoped FTS records", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(versionOneSchema);
    const taskId = "00000000-0000-4000-8000-000000000090" as TaskId;
    const createdAt = "2026-07-13T09:00:00.000Z";
    database
      .prepare(
        "INSERT INTO workspaces(id, version, payload_json) VALUES (?, 1, ?)",
      )
      .run(ids.workspace, JSON.stringify({ id: ids.workspace, version: 1 }));
    database
      .prepare(
        "INSERT INTO spaces(id, workspace_id, version, payload_json) VALUES (?, ?, 1, ?)",
      )
      .run(
        ids.rootSpace,
        ids.workspace,
        JSON.stringify({
          id: ids.rootSpace,
          workspaceId: ids.workspace,
          version: 1,
        }),
      );
    database
      .prepare(
        "INSERT INTO tasks(id, workspace_id, space_id, created_at, version, payload_json) VALUES (?, ?, ?, ?, 1, ?)",
      )
      .run(
        taskId,
        ids.workspace,
        ids.rootSpace,
        createdAt,
        JSON.stringify({
          id: taskId,
          workspaceId: ids.workspace,
          spaceId: ids.rootSpace,
          title: "Migrated restart evidence",
          statusId: "00000000-0000-4000-8000-000000000091",
          recordState: "active",
          completionState: "open",
          createdBy: ids.principal,
          version: 1,
          createdAt,
          updatedAt: createdAt,
        }),
      );

    const store = new SqliteApplicationStore(sqlitePort(database));
    assert.deepEqual(
      store
        .read((view) =>
          view.listTasks({
            workspaceId: context().workspaceId,
            spaceId: context().spaceScope[0]!,
            limit: 10,
          }),
        )
        ?.map((task) => task.id),
      [taskId],
    );
    assert.equal(
      (
        database.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
      LOCAL_STORE_SCHEMA_VERSION,
    );
    assert.equal(
      store.read((view) => view.getTask(taskId))?.operationalState,
      "actionable",
    );
    assert.equal(
      (
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'task_assignments'",
          )
          .get() as { count: number }
      ).count,
      1,
    );
    assert.deepEqual(
      (
        database
          .prepare(
            "SELECT record_id FROM work_search WHERE work_search MATCH ? AND workspace_id = ? AND space_id = ?",
          )
          .all("migrated", ids.workspace, ids.rootSpace) as Array<{
          record_id: string;
        }>
      ).map((row) => row.record_id),
      [taskId],
    );
    database.close();
  });

  it("migrates every supported historical schema to the current version", () => {
    for (
      let sourceVersion = 1;
      sourceVersion <= LOCAL_STORE_SCHEMA_VERSION;
      sourceVersion += 1
    ) {
      withDatabase((filename) => {
        const historical = new DatabaseSync(filename);
        initializeLocalStoreSchemaForVersion(
          sqlitePort(historical),
          sourceVersion,
        );
        const taskId = "00000000-0000-4000-8000-000000000090" as TaskId;
        const createdAt = "2026-07-13T09:00:00.000Z";
        historical
          .prepare(
            "INSERT INTO workspaces(id, version, payload_json) VALUES (?, 1, ?)",
          )
          .run(
            ids.workspace,
            JSON.stringify({ id: ids.workspace, version: 1 }),
          );
        historical
          .prepare(
            "INSERT INTO spaces(id, workspace_id, version, payload_json) VALUES (?, ?, 1, ?)",
          )
          .run(
            ids.rootSpace,
            ids.workspace,
            JSON.stringify({
              id: ids.rootSpace,
              workspaceId: ids.workspace,
              version: 1,
            }),
          );
        const task = {
          id: taskId,
          workspaceId: ids.workspace,
          spaceId: ids.rootSpace,
          title: `Schema ${sourceVersion} migration evidence`,
          statusId: "00000000-0000-4000-8000-000000000091",
          recordState: "active",
          completionState: "open",
          operationalState: "actionable",
          createdBy: ids.principal,
          version: 1,
          createdAt,
          updatedAt: createdAt,
        };
        if (sourceVersion === 1) {
          historical
            .prepare(
              "INSERT INTO tasks(id, workspace_id, space_id, created_at, version, payload_json) VALUES (?, ?, ?, ?, 1, ?)",
            )
            .run(
              taskId,
              ids.workspace,
              ids.rootSpace,
              createdAt,
              JSON.stringify(task),
            );
        } else {
          historical
            .prepare(
              "INSERT INTO tasks(id, workspace_id, space_id, created_at, version, payload_json, record_state, completion_state, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)",
            )
            .run(
              taskId,
              ids.workspace,
              ids.rootSpace,
              createdAt,
              JSON.stringify(task),
              task.recordState,
              task.completionState,
              task.updatedAt,
            );
        }
        historical.close();

        const reopened = new DatabaseSync(filename);
        const store = new SqliteApplicationStore(sqlitePort(reopened));
        assert.equal(
          (
            reopened.prepare("PRAGMA user_version").get() as {
              user_version: number;
            }
          ).user_version,
          LOCAL_STORE_SCHEMA_VERSION,
          `source schema ${sourceVersion}`,
        );
        assert.equal(
          store.read((view) => view.getTask(taskId))?.title,
          task.title,
          `source schema ${sourceVersion}`,
        );
        assert.match(
          (
            reopened
              .prepare(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'capture_payloads'",
              )
              .get() as { sql: string }
          ).sql,
          /voice_note/u,
          `source schema ${sourceVersion}`,
        );
        reopened.close();
      });
    }
  });

  it("migrates v22 rich Document collaboration bytes and history without rewriting them", () => {
    withDatabase((filename) => {
      const documentId = "00000000-0000-4000-8000-0000000000a4" as DocumentId;
      const revisionId =
        "00000000-0000-4000-8000-0000000000a5" as DocumentRevisionId;
      const historical = new DatabaseSync(filename);
      initializeLocalStoreSchemaForVersion(sqlitePort(historical), 22);
      historical
        .prepare(
          "INSERT INTO workspaces(id, version, payload_json) VALUES (?, 1, ?)",
        )
        .run(ids.workspace, JSON.stringify({ id: ids.workspace, version: 1 }));
      historical
        .prepare(
          "INSERT INTO spaces(id, workspace_id, version, payload_json) VALUES (?, ?, 1, ?)",
        )
        .run(
          ids.rootSpace,
          ids.workspace,
          JSON.stringify({
            id: ids.rootSpace,
            workspaceId: ids.workspace,
            version: 1,
          }),
        );
      const document = {
        id: documentId,
        workspaceId: ids.workspace,
        spaceId: ids.rootSpace,
        title: "Migrated rich document",
        role: "document",
        createdBy: ids.principal,
        version: 1,
        createdAt: "2026-07-21T12:00:00.000Z",
        updatedAt: "2026-07-21T12:00:00.000Z",
      };
      historical
        .prepare(
          "INSERT INTO documents(id, workspace_id, space_id, updated_at, version, payload_json) VALUES (?, ?, ?, ?, 1, ?)",
        )
        .run(
          documentId,
          ids.workspace,
          ids.rootSpace,
          document.updatedAt,
          JSON.stringify(document),
        );
      historical
        .prepare(
          "INSERT INTO document_collaboration_state(document_id, workspace_id, space_id, engine, state_blob, updated_at) VALUES (?, ?, ?, 'yjs-13', ?, ?)",
        )
        .run(
          documentId,
          ids.workspace,
          ids.rootSpace,
          Uint8Array.of(4, 5, 6),
          document.updatedAt,
        );
      historical
        .prepare(
          "INSERT INTO document_pending_updates(id, document_id, workspace_id, space_id, update_blob, created_at) VALUES ('migrated-update', ?, ?, ?, ?, ?)",
        )
        .run(
          documentId,
          ids.workspace,
          ids.rootSpace,
          Uint8Array.of(7, 8),
          document.updatedAt,
        );
      historical
        .prepare(
          "INSERT INTO document_revisions(id, document_id, workspace_id, space_id, name, engine, state_blob, state_vector_blob, created_by, created_by_device_id, correlation_id, created_at) VALUES (?, ?, ?, ?, 'Before migration', 'yjs-13', ?, ?, ?, 'migration-device', ?, ?)",
        )
        .run(
          revisionId,
          documentId,
          ids.workspace,
          ids.rootSpace,
          Uint8Array.of(1, 2, 3),
          Uint8Array.of(9),
          ids.principal,
          "00000000-0000-4000-8000-0000000000a7",
          document.updatedAt,
        );
      historical.close();

      const reopened = new DatabaseSync(filename);
      const store = new SqliteApplicationStore(sqlitePort(reopened));
      const scope = {
        documentId,
        workspaceId: ids.workspace as WorkspaceId,
        spaceId: ids.rootSpace as SpaceId,
      };
      assert.deepEqual(
        [...(store.loadDocumentCollaborationState(scope)?.state ?? [])],
        [4, 5, 6],
      );
      assert.deepEqual(
        store
          .listPendingDocumentUpdates(scope)
          .map((update) => [update.id, [...update.update]]),
        [["migrated-update", [7, 8]]],
      );
      assert.deepEqual(
        store.listDocumentRevisions(scope).map((revision) => ({
          id: revision.id,
          state: [...revision.state],
          stateVector: [...revision.stateVector],
        })),
        [{ id: revisionId, state: [1, 2, 3], stateVector: [9] }],
      );
      assert.equal(
        (
          reopened
            .prepare(
              "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'document_%' AND name IN ('document_collaboration_state', 'document_pending_updates', 'document_revisions')",
            )
            .get() as { count: number }
        ).count,
        0,
      );
      reopened.close();
    });
  });

  it("indexes Task working context through the v16 migration and its triggers", () => {
    withDatabase((filename) => {
      const historical = new DatabaseSync(filename);
      initializeLocalStoreSchemaForVersion(sqlitePort(historical), 15);
      const taskId = "00000000-0000-4000-8000-0000000000a6" as TaskId;
      const createdAt = "2026-07-19T09:00:00.000Z";
      historical
        .prepare(
          "INSERT INTO workspaces(id, version, payload_json) VALUES (?, 1, ?)",
        )
        .run(ids.workspace, JSON.stringify({ id: ids.workspace, version: 1 }));
      historical
        .prepare(
          "INSERT INTO spaces(id, workspace_id, version, payload_json) VALUES (?, ?, 1, ?)",
        )
        .run(
          ids.rootSpace,
          ids.workspace,
          JSON.stringify({
            id: ids.rootSpace,
            workspaceId: ids.workspace,
            version: 1,
          }),
        );
      const task = {
        id: taskId,
        workspaceId: ids.workspace,
        spaceId: ids.rootSpace,
        title: "Renewal offer",
        description: "Wymaga kosztorysu od dystrybutora przed wysyłką.",
        nextAction: "Zapytać o właściciela budżetu.",
        statusId: "00000000-0000-4000-8000-0000000000a7",
        recordState: "active",
        completionState: "open",
        operationalState: "actionable",
        createdBy: ids.principal,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      };
      historical
        .prepare(
          "INSERT INTO tasks(id, workspace_id, space_id, created_at, version, payload_json, record_state, completion_state, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)",
        )
        .run(
          taskId,
          ids.workspace,
          ids.rootSpace,
          createdAt,
          JSON.stringify(task),
          task.recordState,
          task.completionState,
          task.updatedAt,
        );
      assert.equal(
        (
          historical
            .prepare(
              "SELECT count(*) AS count FROM work_search WHERE work_search MATCH 'kosztorysu'",
            )
            .get() as { count: number }
        ).count,
        0,
        "v15 does not index Task working context",
      );
      historical.close();

      const reopened = new DatabaseSync(filename);
      const store = new SqliteApplicationStore(sqlitePort(reopened));
      assert.equal(
        (
          reopened.prepare("PRAGMA user_version").get() as {
            user_version: number;
          }
        ).user_version,
        LOCAL_STORE_SCHEMA_VERSION,
      );
      const matches = (needle: string): number =>
        (
          reopened
            .prepare(
              "SELECT count(*) AS count FROM work_search WHERE work_search MATCH ? AND record_kind = 'task'",
            )
            .get(needle) as { count: number }
        ).count;
      assert.equal(matches("kosztorysu"), 1, "backfilled description");
      assert.equal(matches("budżetu"), 1, "backfilled next action");

      store.transact((transaction) => {
        assert.ok(isApplicationWave2Transaction(transaction));
        transaction.updateTask(
          {
            ...task,
            description: "Nowy zakres: audyt licencji.",
            nextAction: undefined,
            version: 2,
          } as unknown as Task,
          1,
        );
      });
      assert.equal(matches("licencji"), 1, "trigger indexes new description");
      assert.equal(matches("budżetu"), 0, "cleared next action leaves FTS");
      reopened.close();
    });
  });

  it("orders and filters Tasks by the shared due-aware contract", () => {
    const database = new DatabaseSync(":memory:");
    const store = new SqliteApplicationStore(sqlitePort(database));
    const createdAt = "2026-07-19T09:00:00.000Z";
    const workspaceId = ids.workspace as WorkspaceId;
    const spaceId = ids.rootSpace as SpaceId;
    store.transact((transaction) => {
      transaction.insertWorkspace({
        id: workspaceId,
        version: 1,
      } as never);
      transaction.insertSpace({
        id: spaceId,
        workspaceId,
        version: 1,
      } as never);
      const base = {
        workspaceId,
        spaceId,
        statusId: "00000000-0000-4000-8000-0000000000b0",
        recordState: "active",
        completionState: "open",
        operationalState: "actionable",
        createdBy: ids.principal,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      };
      transaction.insertTask({
        ...base,
        id: "00000000-0000-4000-8000-0000000000b1",
        title: "Later",
        dueAt: "2026-07-30T21:59:59.999Z",
      } as never);
      transaction.insertTask({
        ...base,
        id: "00000000-0000-4000-8000-0000000000b2",
        title: "Soon high",
        dueAt: "2026-07-24T21:59:59.999Z",
        priority: "high",
      } as never);
      transaction.insertTask({
        ...base,
        id: "00000000-0000-4000-8000-0000000000b3",
        title: "Soon normal",
        dueAt: "2026-07-24T21:59:59.999Z",
      } as never);
      transaction.insertTask({
        ...base,
        id: "00000000-0000-4000-8000-0000000000b4",
        title: "Unscheduled urgent",
        priority: "urgent",
      } as never);
    });
    const page = store.read((view) =>
      view.listTasks({
        workspaceId,
        spaceId,
        limit: 10,
        order: "due_asc",
      }),
    );
    assert.deepEqual(
      page?.map((task) => task.id),
      [
        "00000000-0000-4000-8000-0000000000b2",
        "00000000-0000-4000-8000-0000000000b3",
        "00000000-0000-4000-8000-0000000000b1",
        "00000000-0000-4000-8000-0000000000b4",
      ],
    );
    const continued = store.read((view) =>
      view.listTasks({
        workspaceId,
        spaceId,
        limit: 10,
        order: "due_asc",
        after: {
          kind: "task_due",
          dueAt: "2026-07-24T21:59:59.999Z",
          priority: "normal",
          orderedAt: createdAt,
          recordId: "00000000-0000-4000-8000-0000000000b3" as TaskId,
        },
      }),
    );
    assert.deepEqual(
      continued?.map((task) => task.id),
      [
        "00000000-0000-4000-8000-0000000000b1",
        "00000000-0000-4000-8000-0000000000b4",
      ],
    );
    const filtered = store.read((view) =>
      view.listTasks({
        workspaceId,
        spaceId,
        limit: 10,
        order: "due_asc",
        filters: { dueBefore: "2026-07-25T00:00:00.000Z" },
      }),
    );
    assert.deepEqual(
      filtered?.map((task) => task.title),
      ["Soon high", "Soon normal"],
    );
    database.close();
  });

  it("rolls back an interrupted migration and retries from the same source", () => {
    const database = new DatabaseSync(":memory:");
    initializeLocalStoreSchemaForVersion(sqlitePort(database), 14);
    let failMigration = true;
    const failure = new Error("injected schema 15 failure");
    const delegated: SqliteDatabase = {
      exec(sql) {
        if (
          failMigration &&
          sql.includes("ALTER TABLE capture_payloads RENAME TO")
        ) {
          throw failure;
        }
        database.exec(sql);
      },
      prepare: (sql) => sqlitePort(database).prepare(sql),
    };

    assert.throws(() => initializeLocalStoreSchema(delegated), failure);
    assert.equal(
      (
        database.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
      14,
    );
    assert.equal(
      (
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'capture_payloads_v14'",
          )
          .get() as { count: number }
      ).count,
      0,
    );

    failMigration = false;
    initializeLocalStoreSchema(delegated);
    assert.equal(
      (
        database.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
      LOCAL_STORE_SCHEMA_VERSION,
    );
    database.close();
  });

  it("fails closed without modifying a future local-store schema", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`PRAGMA user_version = ${LOCAL_STORE_SCHEMA_VERSION + 1};`);
    assert.throws(
      () => initializeLocalStoreSchema(sqlitePort(database)),
      LocalStoreCorruptionError,
    );
    assert.equal(
      (
        database.prepare("PRAGMA user_version").get() as {
          user_version: number;
        }
      ).user_version,
      LOCAL_STORE_SCHEMA_VERSION + 1,
    );
    assert.equal(
      (
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'",
          )
          .get() as { count: number }
      ).count,
      0,
    );
    database.close();
  });

  it("persists Wave 2 Project, status, relation, search, cockpit, activity, and undo semantics", () => {
    withDatabase((filename) => {
      const firstDatabase = new DatabaseSync(filename);
      const first = createKernel(firstDatabase);
      assert.equal(
        unwrap(first.kernel.execute(context(), workspaceCommand)).outcome,
        "success",
      );
      const capture = unwrap(first.kernel.execute(context(), captureCommand));
      if (
        capture.outcome !== "success" ||
        capture.projection.kind !== "capture.stored"
      ) {
        throw new Error("Expected Capture storage.");
      }
      const captureId = capture.projection.captureId;
      const routed = unwrap(
        first.kernel.execute(context(), routeCommand(captureId)),
      );
      if (
        routed.outcome !== "success" ||
        routed.projection.kind !== "capture.routed_as_task"
      ) {
        throw new Error("Expected Capture routing.");
      }
      const taskId = routed.projection.taskId as TaskId;
      const assignmentId = "00000000-0000-4000-8000-000000000089";
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command(
              "task.assign",
              {
                assignmentId,
                taskId,
                assigneePrincipalId: ids.principal,
              },
              "durable-assignment-v5",
              { [taskId]: 1 },
            ),
          ),
        ).diagnosticCode,
        "task.assigned",
      );
      const commentId = "00000000-0000-4000-8000-00000000008a";
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command(
              "comment.add",
              {
                commentId,
                target: { kind: "task", taskId },
                body: "Persist this attributed review note.",
                mentionPrincipalIds: [],
              },
              "durable-comment-v1",
              { [taskId]: 1 },
            ),
          ),
        ).diagnosticCode,
        "comment.added",
      );

      const projectCreate = wave2Command(
        "project.create",
        {
          spaceId: ids.rootSpace,
          title: "Restart-safe alpha",
          intendedOutcome: "A durable operational cockpit",
        },
        "durable-project-v2",
      );
      const created = unwrap(first.kernel.execute(context(), projectCreate));
      if (
        created.outcome !== "success" ||
        created.projection.kind !== "project.created"
      ) {
        throw new Error("Expected Project creation.");
      }
      const projectId = created.projection.projectId as ProjectId;
      const projectUpdate = wave2Command(
        "project.updateOutcome",
        {
          projectId,
          intendedOutcome: "The restart-safe alpha remains explainable",
        },
        "durable-project-outcome-v2",
        { [projectId]: 1 },
      );
      const updated = unwrap(first.kernel.execute(context(), projectUpdate));
      assert.equal(updated.diagnosticCode, "project.outcome_updated");

      const related = unwrap(
        first.kernel.execute(
          context(),
          wave2Command(
            "record.relate",
            {
              relationType: "task_contributes_to_project",
              taskId,
              projectId,
            },
            "durable-relation-v2",
            { [taskId]: 1, [projectId]: 2 },
          ),
        ),
      );
      if (
        related.outcome !== "success" ||
        related.projection.kind !== "relation.created"
      ) {
        throw new Error("Expected relation creation.");
      }
      const relationId = related.projection.relationId as RelationId;

      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command("task.complete", { taskId }, "durable-complete-v2", {
              [taskId]: 1,
            }),
          ),
        ).diagnosticCode,
        "task.completed",
      );
      assert.equal(
        unwrap(
          first.kernel.execute(
            context(),
            wave2Command("task.reopen", { taskId }, "durable-reopen-v2", {
              [taskId]: 2,
            }),
          ),
        ).diagnosticCode,
        "task.reopened",
      );

      const ftsRows = firstDatabase
        .prepare(
          "SELECT record_kind, record_id FROM work_search WHERE work_search MATCH ? AND workspace_id = ? AND space_id = ? ORDER BY record_kind",
        )
        .all("restart*", ids.workspace, ids.rootSpace) as Array<{
        record_kind: string;
        record_id: string;
      }>;
      assert.deepEqual(
        ftsRows.map((row) => row.record_kind),
        ["capture", "project", "task"],
      );
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(filename);
      const reopened = createKernel(reopenedDatabase);
      assert.equal(
        reopened.store.snapshot().taskAssignments?.[0]?.id,
        assignmentId,
      );
      assert.equal(reopened.store.snapshot().comments?.[0]?.id, commentId);
      assert.equal(
        reopened.store.snapshot().attentionSignals?.[0]?.reason,
        "task_assignment",
      );
      const projects = reopened.kernel.query(
        context(),
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName: "project.list",
          queryId: wave2RequestId(),
          workspaceId: ids.workspace,
          consistency: "local_authoritative",
          parameters: { spaceId: ids.rootSpace },
        }),
      );
      if (
        projects.kind !== "query_result" ||
        projects.result.outcome !== "success" ||
        projects.result.projection.kind !== "project.list"
      ) {
        throw new Error("Expected Project list after restart.");
      }
      assert.equal(projects.result.projection.items[0]?.id, projectId);
      assert.equal(
        projects.result.projection.items[0]?.relatedOpenTaskCount,
        1,
      );

      for (const [queryName, parameters, projectionKind] of [
        [
          "search.global",
          { spaceIds: [ids.rootSpace], text: "restart" },
          "search.global",
        ],
        [
          "cockpit.week",
          { spaceId: ids.rootSpace, weekStart: "2026-07-06" },
          "cockpit.week",
        ],
        [
          "activity.meaningful",
          { spaceId: ids.rootSpace },
          "activity.meaningful",
        ],
        [
          "recovery.preview",
          { targetCommandId: projectUpdate.commandId },
          "recovery.preview",
        ],
      ] as const) {
        const response = reopened.kernel.query(
          context(),
          QueryEnvelopeSchema.parse({
            contractVersion: 1,
            queryName,
            queryId: wave2RequestId(),
            workspaceId: ids.workspace,
            consistency: "local_authoritative",
            parameters,
          }),
        );
        assert.equal(response.kind, "query_result", queryName);
        if (response.kind !== "query_result") continue;
        assert.equal(response.result.outcome, "success", queryName);
        if (response.result.outcome !== "success") continue;
        assert.equal(
          response.result.projection.kind,
          projectionKind,
          queryName,
        );
        if (response.result.projection.kind === "search.global") {
          assert.ok(response.result.projection.items.length >= 2);
        }
        if (response.result.projection.kind === "cockpit.week") {
          assert.equal(response.result.projection.focus[0]?.taskId, taskId);
          assert.equal(
            response.result.projection.focus[0]?.relatedProjectId,
            projectId,
          );
        }
        if (response.result.projection.kind === "activity.meaningful") {
          assert.ok(response.result.projection.items.length >= 5);
        }
        if (response.result.projection.kind === "recovery.preview") {
          assert.equal(response.result.projection.available, true);
        }
      }

      assert.deepEqual(
        unwrap(reopened.kernel.execute(context(), projectUpdate)),
        updated,
      );
      const undone = unwrap(
        reopened.kernel.execute(
          context(),
          wave2Command(
            "command.undo",
            { targetCommandId: projectUpdate.commandId },
            "durable-undo-v2",
            { [projectId]: 2 },
          ),
        ),
      );
      assert.equal(undone.diagnosticCode, "command.undone");
      reopened.store.read((view) => {
        assert.equal(isApplicationWave2ReadView(view), true);
        if (!isApplicationWave2ReadView(view)) return;
        assert.equal(
          view.getProject(projectId)?.intendedOutcome,
          "A durable operational cockpit",
        );
        assert.equal(view.getRelation(relationId)?.state, "active");
      });
      reopenedDatabase.close();
    });
  });

  it("survives close and reopen with Capture, Task, provenance, audit, and idempotency", () => {
    withDatabase((filename) => {
      const firstDatabase = new DatabaseSync(filename);
      const first = createKernel(firstDatabase);
      assert.equal(
        unwrap(first.kernel.execute(context(), workspaceCommand)).outcome,
        "success",
      );
      const captureOutcome = unwrap(
        first.kernel.execute(context(), captureCommand),
      );
      assert.equal(captureOutcome.outcome, "success");
      if (
        captureOutcome.outcome !== "success" ||
        captureOutcome.projection.kind !== "capture.stored"
      ) {
        throw new Error("Expected Capture storage.");
      }
      const captureId = captureOutcome.projection.captureId;
      const routed = unwrap(
        first.kernel.execute(context(), routeCommand(captureId)),
      );
      assert.equal(routed.outcome, "success");
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(filename);
      const reopened = createKernel(reopenedDatabase);
      const tasks = reopened.kernel.query(
        context(),
        QueryEnvelopeSchema.parse({
          contractVersion: 1,
          queryName: "task.list",
          queryId: "00000000-0000-4000-8000-000000000020",
          workspaceId: ids.workspace,
          consistency: "local_authoritative",
          parameters: { spaceId: ids.rootSpace, limit: 20 },
        }),
      );
      assert.equal(tasks.kind, "query_result");
      if (tasks.kind !== "query_result" || tasks.result.outcome !== "success") {
        throw new Error("Expected Task query success.");
      }
      assert.equal(tasks.result.projection.kind, "task.list");
      if (tasks.result.projection.kind !== "task.list")
        throw new Error("Expected Task list.");
      assert.equal(tasks.result.projection.items.length, 1);
      assert.equal(
        tasks.result.projection.items[0]?.sourceCaptureId,
        captureId,
      );

      const replay = unwrap(reopened.kernel.execute(context(), captureCommand));
      assert.deepEqual(replay, captureOutcome);
      const capture = reopened.store.read((view) => view.getCapture(captureId));
      assert.equal(capture?.processingState, "routed_as_task");
      reopenedDatabase.close();
    });
  });

  it("rolls back every write when work throws", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const syntheticCapture = {
      id: "00000000-0000-4000-8000-000000000099" as CaptureId,
      workspaceId: context().workspaceId,
      spaceId: context().spaceScope[0]!,
      originalText: "Must roll back",
      original: { kind: "text" as const, text: "Must roll back" },
      originalFingerprint: "synthetic-capture-fingerprint",
      deviceId: "synthetic-local-store-test",
      source: "in_app_quick_capture" as const,
      capturedAt: "2026-07-13T20:00:00.000Z",
      submittedBy: context().principalId,
      processingState: "pending_processing" as const,
      version: 1,
    };
    assert.throws(
      () =>
        store.transact((transaction) => {
          transaction.insertCapture(syntheticCapture);
          throw new Error("injected failure");
        }),
      /injected failure/,
    );
    assert.equal(
      store.read((view) => view.getCapture(syntheticCapture.id)),
      undefined,
    );
    database.close();
  });

  it("rolls back Wave 2 writes and fails closed on corrupt Project scope", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const projectId = "00000000-0000-4000-8000-000000000098" as ProjectId;
    const project = {
      id: projectId,
      workspaceId: context().workspaceId,
      spaceId: context().spaceScope[0]!,
      title: "Atomic Project",
      intendedOutcome: "No partial Wave 2 state",
      lifecycle: "active" as const,
      createdBy: context().principalId,
      version: 1,
      createdAt: "2026-07-13T20:00:00.000Z",
      updatedAt: "2026-07-13T20:00:00.000Z",
    };
    assert.throws(
      () =>
        store.transact((transaction) => {
          assert.equal(isApplicationWave2Transaction(transaction), true);
          if (!isApplicationWave2Transaction(transaction)) return;
          transaction.insertProject(project);
          throw new Error("injected Wave 2 failure");
        }),
      /injected Wave 2 failure/,
    );
    store.read((view) => {
      assert.equal(isApplicationWave2ReadView(view), true);
      if (!isApplicationWave2ReadView(view)) return;
      assert.equal(view.getProject(projectId), undefined);
    });

    store.transact((transaction) => {
      assert.equal(isApplicationWave2Transaction(transaction), true);
      if (!isApplicationWave2Transaction(transaction)) return;
      transaction.insertProject(project);
    });
    const row = database
      .prepare("SELECT payload_json FROM projects WHERE id = ?")
      .get(projectId) as { payload_json: string };
    database.prepare("UPDATE projects SET payload_json = ? WHERE id = ?").run(
      JSON.stringify({
        ...(JSON.parse(row.payload_json) as Record<string, unknown>),
        spaceId: "00000000-0000-4000-8000-000000000999",
      }),
      projectId,
    );
    assert.throws(
      () =>
        store.read((view) => {
          assert.equal(isApplicationWave2ReadView(view), true);
          return isApplicationWave2ReadView(view)
            ? view.getProject(projectId)
            : undefined;
        }),
      LocalStoreCorruptionError,
    );
    database.close();
  });

  it("fails closed on corrupt persisted payloads", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    database
      .prepare("UPDATE workspaces SET payload_json = ? WHERE id = ?")
      .run("{not-json", ids.workspace);
    assert.throws(
      () => store.read((view) => view.getWorkspace(context().workspaceId)),
      LocalStoreCorruptionError,
    );
    database.close();
  });

  it("fails closed when payload scope disagrees with indexed columns", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const stored = unwrap(kernel.execute(context(), captureCommand));
    assert.equal(stored.outcome, "success");
    if (
      stored.outcome !== "success" ||
      stored.projection.kind !== "capture.stored"
    ) {
      throw new Error("Expected Capture storage.");
    }
    const captureId = stored.projection.captureId;
    const row = database
      .prepare("SELECT payload_json FROM captures WHERE id = ?")
      .get(captureId) as { payload_json: string };
    const changed = {
      ...(JSON.parse(row.payload_json) as Record<string, unknown>),
      workspaceId: "00000000-0000-4000-8000-000000000999",
    };
    database
      .prepare("UPDATE captures SET payload_json = ? WHERE id = ?")
      .run(JSON.stringify(changed), captureId);
    assert.throws(
      () => store.read((view) => view.getCapture(captureId)),
      LocalStoreCorruptionError,
    );
    database.close();
  });

  it("keeps a recoverable command outbox and atomically replaces a coordinated projection", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    assert.equal(
      unwrap(kernel.execute(context(), captureCommand)).outcome,
      "success",
    );
    const authoritative = store.snapshot();
    store.configureCoordination({
      workspaceId: context().workspaceId,
      providerInstanceId: "constellation.hub:test",
      hubOrigin: "https://hub.example.test",
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      configuredAt: "2026-07-14T12:00:00.000Z",
    });
    assert.equal(store.listPendingSyncCommands().length, 0);

    const rename = CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "workspace.rename",
      commandId: "00000000-0000-4000-8000-000000000099",
      workspaceId: ids.workspace,
      idempotencyKey: "offline-rename",
      expectedVersions: { [ids.workspace]: 1 },
      correlationId: "00000000-0000-4000-8000-000000000098",
      payload: { name: "Optimistic offline name" },
    });
    assert.equal(unwrap(kernel.execute(context(), rename)).outcome, "success");
    const pending = store.listPendingSyncCommands();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.command.commandId, rename.commandId);
    store.recordSyncResult({
      commandId: rename.commandId,
      state: "conflict",
      outcome: {
        contractVersion: 1,
        commandId: rename.commandId,
        correlationId: rename.correlationId,
        kernelTime: "2026-07-14T12:01:00.000Z",
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: { [ids.workspace]: 2 },
      },
      updatedAt: "2026-07-14T12:01:00.000Z",
    });
    assert.equal(store.listPendingSyncCommands().length, 0);
    store.replaceProjection(authoritative, {
      checkpoint: "2",
      snapshotDigest: "b".repeat(64),
      syncState: "conflict",
      updatedAt: "2026-07-14T12:01:00.000Z",
    });
    assert.equal(
      store.read((view) => view.getWorkspace(context().workspaceId)?.name),
      "Durable synthetic workspace",
    );
    assert.deepEqual(
      store.read((view) => view.getFreshness()),
      {
        mode: "local_projection",
        checkpoint: "2",
        missingCapabilities: ["hub.conflict"],
      },
    );
    assert.equal(store.getCoordinationState()?.syncState, "conflict");
    database.close();
  });

  it("initializes a fresh scoped projection with its Task before assignment", () => {
    const sourceDatabase = new DatabaseSync(":memory:");
    const source = createKernel(sourceDatabase);
    assert.equal(
      unwrap(source.kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    const stored = unwrap(source.kernel.execute(context(), captureCommand));
    if (
      stored.outcome !== "success" ||
      stored.projection.kind !== "capture.stored"
    ) {
      throw new Error("Expected Capture storage.");
    }
    const routed = unwrap(
      source.kernel.execute(
        context(),
        routeCommand(stored.projection.captureId),
      ),
    );
    if (
      routed.outcome !== "success" ||
      routed.projection.kind !== "capture.routed_as_task"
    ) {
      throw new Error("Expected Task routing.");
    }
    const assignmentId = wave2RequestId();
    assert.equal(
      unwrap(
        source.kernel.execute(
          context(),
          wave2Command(
            "task.assign",
            {
              assignmentId,
              taskId: routed.projection.taskId,
              assigneePrincipalId: ids.principal,
            },
            "scoped-projection-assignment",
            { [routed.projection.taskId]: 1 },
          ),
        ),
      ).outcome,
      "success",
    );
    const snapshot = source.store.snapshot();

    const targetDatabase = new DatabaseSync(":memory:");
    const target = createKernel(targetDatabase);
    target.store.initializeProjection(snapshot);
    assert.equal(
      target.store.snapshot().tasks[0]?.id,
      routed.projection.taskId,
    );
    assert.equal(
      target.store.snapshot().taskAssignments?.[0]?.id,
      assignmentId,
    );
    sourceDatabase.close();
    targetDatabase.close();
  });

  it("retains authorized and staged payloads across sync, then purges removed or revoked bytes", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    assert.equal(
      unwrap(kernel.execute(context(), captureCommand)).outcome,
      "success",
    );
    const captured = store.snapshot().captures[0];
    if (captured === undefined) throw new Error("Expected Capture fixture.");
    const referencedPayloadId = CapturePayloadIdSchema.parse(
      "00000000-0000-4000-8000-000000000151",
    );
    const stagedPayloadId = CapturePayloadIdSchema.parse(
      "00000000-0000-4000-8000-000000000152",
    );
    const referencedBytes = new TextEncoder().encode("referenced payload");
    const stagedBytes = new TextEncoder().encode("dialog staging");
    const storePayload = (
      payloadId: typeof referencedPayloadId,
      displayName: string,
      bytes: Uint8Array,
    ) =>
      store.storeCapturePayload({
        payloadId,
        workspaceId: context().workspaceId,
        displayName,
        mediaType: "text/plain",
        inputKind: "file",
        contentSha256: createHash("sha256").update(bytes).digest("hex"),
        bytes,
        createdAt: "2026-07-16T17:00:00.000Z",
      });
    storePayload(referencedPayloadId, "referenced.txt", referencedBytes);
    storePayload(stagedPayloadId, "staged.txt", stagedBytes);
    database.prepare("UPDATE captures SET payload_json = ? WHERE id = ?").run(
      JSON.stringify({
        ...captured,
        originalText: "referenced.txt",
        original: {
          kind: "managed_file",
          payload: {
            payloadId: referencedPayloadId,
            displayName: "referenced.txt",
            mediaType: "text/plain",
            byteLength: referencedBytes.byteLength,
            contentSha256: createHash("sha256")
              .update(referencedBytes)
              .digest("hex"),
            custodyState: "available",
          },
        },
      }),
      captured.id,
    );
    const managedSnapshot = store.snapshot();
    store.configureCoordination({
      workspaceId: context().workspaceId,
      providerInstanceId: "constellation.hub:payload-retention",
      hubOrigin: "https://hub.example.test",
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      configuredAt: "2026-07-16T17:01:00.000Z",
    });
    store.replaceProjection(managedSnapshot, {
      checkpoint: "2",
      snapshotDigest: "b".repeat(64),
      syncState: "current",
      updatedAt: "2026-07-16T17:02:00.000Z",
    });
    assert.deepEqual(
      store.readCapturePayload({
        payloadId: referencedPayloadId,
        workspaceId: context().workspaceId,
      })?.bytes,
      referencedBytes,
    );
    assert.deepEqual(
      store.readCapturePayload({
        payloadId: stagedPayloadId,
        workspaceId: context().workspaceId,
      })?.bytes,
      stagedBytes,
    );

    const transcriptReadySnapshot = {
      ...managedSnapshot,
      captures: managedSnapshot.captures.map((capture) => ({
        ...capture,
        originalText: "Voice note.webm",
        original: {
          kind: "voice_note" as const,
          payload: {
            payloadId: referencedPayloadId,
            displayName: "Voice note.webm",
            mediaType: "audio/webm" as const,
            byteLength: referencedBytes.byteLength,
            contentSha256: createHash("sha256")
              .update(referencedBytes)
              .digest("hex"),
            custodyState: "available" as const,
          },
          durationMs: 4_000,
          retentionPolicy: "delete_after_transcript" as const,
        },
        processingState: "transcript_ready" as const,
        transcript: {
          text: "Transcript retained without source audio.",
          audioContentSha256: createHash("sha256")
            .update(referencedBytes)
            .digest("hex"),
          writtenAt: "2026-07-16T17:02:30.000Z",
          writtenBy: context().principalId,
          writtenByKind: "human" as const,
        },
        audioState: "deleted" as const,
        audioStateChangedAt: "2026-07-16T17:02:31.000Z",
      })),
    };
    store.replaceProjection(transcriptReadySnapshot, {
      checkpoint: "3",
      snapshotDigest: "c".repeat(64),
      syncState: "current",
      updatedAt: "2026-07-16T17:02:32.000Z",
    });
    assert.equal(
      store.readCapturePayload({
        payloadId: referencedPayloadId,
        workspaceId: context().workspaceId,
      }),
      undefined,
    );
    assert.deepEqual(
      store.readCapturePayload({
        payloadId: stagedPayloadId,
        workspaceId: context().workspaceId,
      })?.bytes,
      stagedBytes,
    );

    store.replaceProjection(
      {
        ...managedSnapshot,
        captures: managedSnapshot.captures.map((capture) => ({
          ...capture,
          originalText: "payload no longer authorized",
          original: {
            kind: "text" as const,
            text: "payload no longer authorized",
          },
        })),
      },
      {
        checkpoint: "4",
        snapshotDigest: "d".repeat(64),
        syncState: "current",
        updatedAt: "2026-07-16T17:03:00.000Z",
      },
    );
    assert.equal(
      store.readCapturePayload({
        payloadId: referencedPayloadId,
        workspaceId: context().workspaceId,
      }),
      undefined,
    );
    assert.notEqual(
      store.readCapturePayload({
        payloadId: stagedPayloadId,
        workspaceId: context().workspaceId,
      }),
      undefined,
    );
    store.purgeProjection({
      checkpoint: "3",
      snapshotDigest: "c".repeat(64),
      updatedAt: "2026-07-16T17:04:00.000Z",
      errorCode: "device_revoked",
    });
    assert.equal(
      store.readCapturePayload({
        payloadId: stagedPayloadId,
        workspaceId: context().workspaceId,
      }),
      undefined,
    );
    database.close();
  });

  it("atomically purges coordinated records, FTS, and queued commands after access revocation", () => {
    const database = new DatabaseSync(":memory:");
    const { kernel, store } = createKernel(database);
    assert.equal(
      unwrap(kernel.execute(context(), workspaceCommand)).outcome,
      "success",
    );
    assert.equal(
      unwrap(kernel.execute(context(), captureCommand)).outcome,
      "success",
    );
    store.configureCoordination({
      workspaceId: context().workspaceId,
      providerInstanceId: "constellation.hub:purge-test",
      hubOrigin: "https://hub.example.test",
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      configuredAt: "2026-07-14T12:00:00.000Z",
    });
    const rename = CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "workspace.rename",
      commandId: "00000000-0000-4000-8000-000000000097",
      workspaceId: ids.workspace,
      idempotencyKey: "queued-before-revocation",
      expectedVersions: { [ids.workspace]: 1 },
      correlationId: "00000000-0000-4000-8000-000000000096",
      payload: { name: "Must be purged" },
    });
    assert.equal(unwrap(kernel.execute(context(), rename)).outcome, "success");
    assert.equal(store.listPendingSyncCommands().length, 1);

    database.exec(`
      CREATE TRIGGER fail_purge BEFORE DELETE ON captures BEGIN
        SELECT RAISE(ABORT, 'synthetic purge failure');
      END;
    `);
    assert.throws(() =>
      store.purgeProjection({
        checkpoint: "1",
        snapshotDigest: "a".repeat(64),
        updatedAt: "2026-07-14T12:01:00.000Z",
        errorCode: "membership_revoked",
      }),
    );
    assert.equal(store.snapshot().captures.length, 1);
    assert.equal(store.listPendingSyncCommands().length, 1);
    assert.equal(store.getCoordinationState()?.syncState, "current");

    database.exec("DROP TRIGGER fail_purge;");
    store.purgeProjection({
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      updatedAt: "2026-07-14T12:02:00.000Z",
      errorCode: "membership_revoked",
    });
    const purged = store.snapshot();
    assert.equal(purged.workspaces.length, 0);
    assert.equal(purged.memberships.length, 0);
    assert.equal(purged.captures.length, 0);
    assert.equal(purged.tasks.length, 0);
    assert.equal(store.listPendingSyncCommands().length, 0);
    assert.equal(
      (
        database.prepare("SELECT count(*) AS count FROM work_search").get() as {
          count: number;
        }
      ).count,
      0,
    );
    assert.equal(
      (
        database
          .prepare("SELECT count(*) AS count FROM command_journal")
          .get() as { count: number }
      ).count,
      0,
    );
    assert.deepEqual(store.getCoordinationState(), {
      workspaceId: ids.workspace,
      providerInstanceId: "constellation.hub:purge-test",
      hubOrigin: "https://hub.example.test",
      checkpoint: "1",
      snapshotDigest: "a".repeat(64),
      syncState: "revoked",
      lastSyncedAt: "2026-07-14T12:02:00.000Z",
      lastErrorCode: "membership_revoked",
    });
    database.close();
  });
});
