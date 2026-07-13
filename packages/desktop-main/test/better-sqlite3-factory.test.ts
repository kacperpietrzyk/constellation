import assert from "node:assert/strict";
import test from "node:test";

import type { EncryptedSqliteDatabase } from "@constellation/local-store";

import { createBetterSqlite3Factory } from "../src/better-sqlite3-factory.js";

test("native factory rejects an unpatched better-sqlite3 binding", () => {
  class UnpatchedDatabase {
    public close(): void {}
  }
  const factory = createBetterSqlite3Factory({ load: () => UnpatchedDatabase });
  assert.throws(
    () => factory.open("workspace.db", { fileMustExist: false }),
    /SQLCipher database driver is incompatible/,
  );
});

test("native factory exposes the patched SQLCipher database", () => {
  class PatchedDatabase {
    public close(): void {}
    public exec(): void {}
    public key(): void {}
    public loadExtension(): void {}
    public prepare(): never {
      throw new Error("not exercised");
    }
  }
  const factory = createBetterSqlite3Factory({ load: () => PatchedDatabase });
  const database = factory.open("workspace.db", { fileMustExist: false });
  assert(database instanceof PatchedDatabase);
  database.close();
  assert(database satisfies EncryptedSqliteDatabase);
});
