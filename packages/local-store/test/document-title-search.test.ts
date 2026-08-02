import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  ApplicationKernel,
  isApplicationWave2ReadView,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  ExecutionContextSchema,
  type CommandOutcome,
  type DocumentId,
  type ExecutionContext,
} from "@constellation/contracts";
import {
  Base64JsonCursorCodec,
  DeterministicIdGenerator,
  InMemoryAuthorizationPolicy,
  Sha256SemanticHasher,
  TickingClock,
} from "@constellation/testkit";

import {
  LOCAL_STORE_SCHEMA_VERSION,
  SqliteApplicationStore,
  initializeLocalStoreSchema,
  type SqliteDatabase,
} from "../src/index.js";
import { initializeLocalStoreSchemaForVersion } from "../src/sqlite-application-store.js";

/**
 * A NOTE'S TITLE IN THE SEARCH INDEX, once `document.rename` can change it.
 *
 * `work_search` is refreshed by TRIGGERS, and `documents` never had one:
 * `captures`, `tasks` and `projects` each carry an
 * `AFTER UPDATE OF payload_json` trigger, and a note reached the index only
 * through `content_search_projection_insert` / `_update`, which fire when its
 * BODY is re-indexed. So a rename that writes only the record row would leave
 * the index answering under the old title — silently, with every kernel test
 * green, because the kernel's projections read the record and never the index.
 *
 * That is why this file is here and not beside the command's conformance test:
 * the reference harness is IN-MEMORY and has no FTS at all, so nothing there
 * can be evidence about a trigger. Everything below runs against a real SQLite
 * database through the real store.
 *
 * TWO CLAIMS, and the second is the one a schema dump cannot make:
 *   1. a database standing at 26 EXECUTES step 27 on its way up — the shape
 *      `document-entity-vocabulary.test.ts` built for the same reason, because
 *      a step that is skipped closes behind itself and never runs again;
 *   2. the trigger FIRES. A trigger that exists and does not fire is exactly
 *      the false calm this programme has met eight times.
 */

const TRIGGER = "work_search_document_update";

const ids = {
  workspace: "7e000000-0000-4000-8000-000000000001",
  space: "7e000000-0000-4000-8000-000000000002",
  principal: "7e000000-0000-4000-8000-000000000003",
  credential: "7e000000-0000-4000-8000-000000000004",
  grant: "7e000000-0000-4000-8000-000000000005",
} as const;

let sequence = 4_096;
const uuid = (): string =>
  `7e000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

const sqlitePort = (database: DatabaseSync): SqliteDatabase =>
  database as unknown as SqliteDatabase;

const withDatabase = (run: (filename: string) => void): void => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "constellation-document-title-"),
  );
  try {
    run(path.join(directory, "workspace.db"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

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
      "document.create",
      "document.rename",
    ],
    origin: "desktop",
  });

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome")
    throw new Error("Expected a command outcome.");
  return response.outcome;
};

const envelope = (
  commandName: string,
  payload: Readonly<Record<string, unknown>>,
  expectedVersions: Readonly<Record<string, number>> = {},
) =>
  CommandEnvelopeSchema.parse({
    contractVersion: 1,
    commandName,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: `title-search-${uuid()}`,
    expectedVersions,
    correlationId: uuid(),
    payload,
  });

const bootstrapped = (database: DatabaseSync) => {
  const store = new SqliteApplicationStore(sqlitePort(database));
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
  assert.equal(
    unwrap(
      kernel.execute(
        context(),
        envelope("workspace.createLocal", {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Vault",
          timezone: "Europe/Warsaw",
        }),
      ),
    ).outcome,
    "success",
  );
  return { kernel, store };
};

/** What the FTS row for this note says its title is — read, not inferred. */
const indexedTitle = (
  database: DatabaseSync,
  documentId: string,
): string | undefined => {
  const row = database
    .prepare(
      "SELECT title FROM work_search WHERE record_id = ? AND record_kind IN ('note', 'document', 'deliverable')",
    )
    .get(documentId) as { readonly title?: unknown } | undefined;
  return row === undefined ? undefined : String(row.title);
};

const findByText = (
  store: SqliteApplicationStore,
  text: string,
): readonly string[] =>
  store.read((view) => {
    assert.equal(isApplicationWave2ReadView(view), true);
    if (!isApplicationWave2ReadView(view)) return [];
    return view
      .searchDocumentBodies(
        ids.workspace as never,
        ids.space as never,
        text,
        10,
      )
      .map((hit) => hit.documentId as string);
  }) as readonly string[];

const triggerCount = (database: DatabaseSync): number =>
  Number(
    (
      database
        .prepare(
          `SELECT count(*) AS present FROM sqlite_master WHERE type = 'trigger' AND name = '${TRIGGER}'`,
        )
        .get() as { readonly present: unknown }
    ).present,
  );

describe("a note's title in the search index", () => {
  it("runs step 27 on the way up from 26, rather than skipping past it", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchemaForVersion(sqlitePort(database), 26);
      // ABSENT AT 26 IS WHAT MAKES THIS AN ORDERING PROOF. Without it the test
      // below says only "a fresh database has the trigger", which every fresh
      // database gets from running every step in order — and a no-op shipped
      // at 27 would pass it while an upgrading database recorded
      // `user_version` 27 and never executed this step again.
      assert.equal(triggerCount(database), 0);
      database.close();

      const migrated = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(migrated));
      assert.equal(
        triggerCount(migrated),
        1,
        "a database upgrading from 26 must actually execute this step",
      );
      assert.equal(
        (
          migrated.prepare("PRAGMA user_version").get() as {
            readonly user_version: number;
          }
        ).user_version,
        LOCAL_STORE_SCHEMA_VERSION,
      );
      migrated.close();
    });
  });

  it("carries the new title after a rename, and stops answering to the old one", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(database));
      const { kernel, store } = bootstrapped(database);
      const documentId = uuid();
      assert.equal(
        unwrap(
          kernel.execute(
            context(),
            envelope("document.create", {
              documentId,
              spaceId: ids.space,
              title: "Kickoff",
              role: "note",
            }),
          ),
        ).outcome,
        "success",
      );
      // The body being indexed is what puts the note in `work_search` at all,
      // exactly as it does today: this is the state a note is in the moment
      // anybody has opened it.
      store.replaceDocumentSearchProjection({
        documentId: documentId as DocumentId,
        workspaceId: ids.workspace as never,
        spaceId: ids.space as never,
        body: "Ustalenia ze spotkania otwierającego",
        stateDigest: "b".repeat(64),
        indexedAt: "2026-08-02T09:00:00.000Z",
      });
      assert.equal(indexedTitle(database, documentId), "Kickoff");
      assert.deepEqual(findByText(store, "Kickoff"), [documentId]);

      assert.equal(
        unwrap(
          kernel.execute(
            context(),
            envelope(
              "document.rename",
              // NOT "Falcon — kickoff". The FTS tokenizer is case-folding, so
              // a new title that still contains the old word would leave the
              // note answering to the old search for a reason that has nothing
              // to do with the index being stale — the fixture would report
              // the defect while the trigger worked.
              { documentId, title: "Falcon — podsumowanie" },
              { [documentId]: 1 },
            ),
          ),
        ).outcome,
        "success",
      );

      // THE CLAIM: the index moved with the record. Both halves are asserted,
      // because a trigger that inserted without deleting would satisfy the
      // first and leave the note answering under both names forever.
      assert.equal(indexedTitle(database, documentId), "Falcon — podsumowanie");
      assert.deepEqual(findByText(store, "podsumowanie"), [documentId]);
      assert.deepEqual(findByText(store, "Kickoff"), []);
      // The body was never re-indexed and is still there: the trigger reads it
      // back out of `content_search_projections` rather than replacing it with
      // an empty string.
      assert.deepEqual(findByText(store, "spotkania otwierającego"), [
        documentId,
      ]);
      database.close();
    });
  });

  /**
   * THE OTHER HALF OF THE TRIGGER, and the reason it selects the body FROM
   * `content_search_projections` instead of inserting unconditionally the way
   * the `projects` trigger it is modelled on does.
   *
   * A Project always has an index row; a note has one only once its body has
   * been indexed. An unconditional insert would make a note nobody has ever
   * opened become findable BY BEING RENAMED — a capability nobody asked for,
   * arriving through a trigger, and inconsistent with the note beside it that
   * nobody renamed.
   */
  it("does not invent an index row for a note whose body was never indexed", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(database));
      const { kernel } = bootstrapped(database);
      const documentId = uuid();
      assert.equal(
        unwrap(
          kernel.execute(
            context(),
            envelope("document.create", {
              documentId,
              spaceId: ids.space,
              title: "Never opened",
              role: "note",
            }),
          ),
        ).outcome,
        "success",
      );
      assert.equal(indexedTitle(database, documentId), undefined);
      assert.equal(
        unwrap(
          kernel.execute(
            context(),
            envelope(
              "document.rename",
              { documentId, title: "Still never opened" },
              { [documentId]: 1 },
            ),
          ),
        ).outcome,
        "success",
      );
      assert.equal(indexedTitle(database, documentId), undefined);
      database.close();
    });
  });
});
