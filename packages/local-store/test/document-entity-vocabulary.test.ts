import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { DOCUMENT_ENTITY_TARGET_KINDS } from "@constellation/contracts";

import {
  LOCAL_STORE_SCHEMA_VERSION,
  initializeLocalStoreSchema,
  type SqliteDatabase,
} from "../src/index.js";
import { initializeLocalStoreSchemaForVersion } from "../src/sqlite-application-store.js";

/**
 * `content_entity_links.target_kind` is a SQL `CHECK`, which is the one holder
 * of the link vocabulary that cannot import `DOCUMENT_ENTITY_TARGET_KINDS`: it
 * lives inside a migration, and a migration whose text is regenerated from the
 * current build is not a migration. So the guard runs the other way — read the
 * constraint back out of a real database and compare it to the contract.
 *
 * Without this, an arm added to the contract and forgotten here compiles
 * cleanly, passes every type test, and then refuses every write of the new kind
 * at runtime with a constraint error nobody attributes to the vocabulary.
 *
 * It also pins WHICH table is live. `document_entity_links` was created by v21
 * and dropped by v23, and reading a dropped table's CHECK would report calm
 * about a constraint no write ever meets.
 */
const LIVE_LINK_TABLE = "content_entity_links";

const sqlitePort = (database: DatabaseSync): SqliteDatabase =>
  database as unknown as SqliteDatabase;

const withDatabase = (run: (filename: string) => void): void => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "constellation-link-vocabulary-"),
  );
  try {
    run(path.join(directory, "workspace.db"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const tableSql = (database: DatabaseSync, name: string): string => {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { readonly sql?: unknown } | undefined;
  assert.equal(
    typeof row?.sql,
    "string",
    `${name} must exist in the migrated schema.`,
  );
  return String(row?.sql);
};

const checkedKinds = (sql: string): readonly string[] => {
  const clause = /CHECK\s*\(\s*target_kind\s+IN\s*\(([^)]*)\)/iu.exec(sql);
  assert.notEqual(
    clause,
    null,
    "target_kind must stay guarded by a CHECK constraint.",
  );
  return [...(clause?.[1] ?? "").matchAll(/'([^']+)'/gu)]
    .map((match) => match[1] ?? "")
    .sort();
};

const TABLE_PRESENT = (name: string): string =>
  `SELECT count(*) AS present FROM sqlite_master WHERE type = 'table' AND name = '${name}'`;

const countOf = (database: DatabaseSync, sql: string): number =>
  Number(
    (database.prepare(sql).get() as { readonly present: unknown }).present,
  );

const ids = {
  workspace: "d0000000-0000-4000-8000-000000000001",
  space: "d0000000-0000-4000-8000-000000000002",
  note: "d0000000-0000-4000-8000-000000000003",
  otherNote: "d0000000-0000-4000-8000-000000000004",
} as const;

const insertLink = (
  database: DatabaseSync,
  targetKind: string,
  targetId: string,
): void => {
  database
    .prepare(
      `INSERT INTO ${LIVE_LINK_TABLE}(workspace_id, space_id, owner_kind, owner_id, target_kind, target_id, updated_at) VALUES (?, ?, 'document', ?, ?, ?, ?)`,
    )
    .run(
      ids.workspace,
      ids.space,
      ids.note,
      targetKind,
      targetId,
      "2026-08-01T09:00:00.000Z",
    );
};

describe("document entity link vocabulary", () => {
  it("guards target_kind with exactly the kinds the contract declares", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(database));
      assert.deepEqual(
        checkedKinds(tableSql(database, LIVE_LINK_TABLE)),
        [...DOCUMENT_ENTITY_TARGET_KINDS].sort(),
      );
      database.close();
    });
  });

  it("keeps the guard on the link table the store actually writes", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(database));
      // The v21 table is gone since v23. A guard reading it would report calm
      // about a constraint no write ever meets.
      assert.equal(
        countOf(
          database,
          "SELECT count(*) AS present FROM sqlite_master WHERE type = 'table' AND name = 'document_entity_links'",
        ),
        0,
      );
      database.close();
    });
  });

  it("rebuilds the table without losing a link and accepts note-to-note", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchemaForVersion(sqlitePort(database), 24);
      insertLink(database, "person", ids.otherNote);
      database.close();

      const migrated = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(migrated));
      assert.equal(
        (
          migrated.prepare("PRAGMA user_version").get() as {
            readonly user_version: number;
          }
        ).user_version,
        LOCAL_STORE_SCHEMA_VERSION,
      );
      // The row written before the rebuild survived the copy.
      assert.deepEqual(
        (
          migrated
            .prepare(
              `SELECT target_id FROM ${LIVE_LINK_TABLE} WHERE workspace_id = ? AND target_kind = 'person'`,
            )
            .all(ids.workspace) as unknown as readonly {
            readonly target_id: string;
          }[]
        ).map((row) => row.target_id),
        [ids.otherNote],
      );
      // The index does not follow the table through a rebuild; it has to be
      // recreated by hand, and a missing one is invisible until a workspace is
      // large enough to feel it.
      assert.equal(
        countOf(
          migrated,
          "SELECT count(*) AS present FROM sqlite_master WHERE type = 'index' AND name = 'content_entity_links_target'",
        ),
        1,
      );
      // The arm this wave exists for now writes...
      insertLink(migrated, "document", ids.otherNote);
      // ...and the constraint is still a constraint.
      assert.throws(() => insertLink(migrated, "folder", ids.otherNote));
      migrated.close();
    });
  });

  it("runs the folder lot's step on the way from 24 to 26", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchemaForVersion(sqlitePort(database), 24);
      // Nothing from either lot exists yet: the folder table is 25's and the
      // widened CHECK is 26's.
      assert.equal(countOf(database, TABLE_PRESENT("folders")), 0);
      assert.equal(checkedKinds(tableSql(database, LIVE_LINK_TABLE)).length, 5);
      database.close();

      const migrated = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(migrated));

      // This is the whole reason this lot waited for the folder lot to land
      // and took 26 rather than filling in a reserved 25. A no-op shipped at
      // 25 would have left a database that ran it stranded at
      // `user_version` 26, never executing the step that creates this table —
      // and nothing else in the suite would have noticed, because every other
      // folder test starts from a fresh database that runs every migration in
      // order anyway. The claim is specifically about the UPGRADE path.
      assert.equal(
        countOf(migrated, TABLE_PRESENT("folders")),
        1,
        "A database upgrading from 24 must actually execute the folder lot's step, not skip past it.",
      );
      assert.equal(
        countOf(
          migrated,
          "SELECT count(*) AS present FROM sqlite_master WHERE type = 'index' AND name = 'folders_parent'",
        ),
        1,
      );
      // ...and this lot's step ran too, in the same sweep.
      assert.deepEqual(
        checkedKinds(tableSql(migrated, LIVE_LINK_TABLE)),
        [...DOCUMENT_ENTITY_TARGET_KINDS].sort(),
      );
      // Derived, never pinned. Written as a literal `26` this went red the
      // moment the next lot added a migration — an assertion about somebody
      // else's version number standing still, reported as this lot's
      // regression. The claim is "the sweep finished", and the sweep finishes
      // at whatever the current version is.
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
});
