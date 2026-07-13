import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  EncryptedStoreCapabilityError,
  openEncryptedLocalStore,
  type EncryptedSqliteDatabase,
  type EncryptedSqliteDatabaseFactory,
  type SqliteStatement,
} from "../src/index.js";

const rowStatement = (row: unknown): SqliteStatement => ({
  all: () => (row === undefined ? [] : [row]),
  get: () => row,
  run: () => ({ changes: 0 }),
});

class SyntheticEncryptedDatabase implements EncryptedSqliteDatabase {
  public closed = false;
  public keyed = false;

  public constructor(
    private readonly database: DatabaseSync,
    private readonly provider: "commoncrypto" | "openssl" = "commoncrypto",
  ) {}

  public key(key: Uint8Array): void {
    assert.equal(key.byteLength, 32);
    assert(key.some((value) => value !== 0));
    this.keyed = true;
  }

  public loadExtension(): never {
    throw new TypeError("Loadable extensions are disabled");
  }

  public exec(sql: string): void {
    this.database.exec(sql);
  }

  public prepare(sql: string): SqliteStatement {
    const normalized = sql.trim();
    if (normalized === "PRAGMA cipher_version") {
      return rowStatement({ cipher_version: "4.16.0 community" });
    }
    if (normalized === "PRAGMA cipher_provider") {
      return rowStatement({ cipher_provider: this.provider });
    }
    if (normalized === "PRAGMA cipher_provider_version") {
      return rowStatement({
        cipher_provider_version:
          this.provider === "openssl"
            ? "OpenSSL 3.5.7 synthetic"
            : "Apple CommonCrypto synthetic",
      });
    }
    if (normalized === "PRAGMA compile_options") {
      return {
        ...rowStatement(undefined),
        all: () =>
          [
            "HAS_CODEC",
            "ENABLE_FTS5",
            "TEMP_STORE=2",
            "OMIT_LOAD_EXTENSION",
          ].map((compile_options) => ({ compile_options })),
      };
    }
    if (normalized === "PRAGMA cipher_integrity_check") {
      return { ...rowStatement(undefined), all: () => [] };
    }
    if (normalized === "PRAGMA journal_mode = WAL") {
      return rowStatement({ journal_mode: "wal" });
    }
    if (normalized === "SELECT load_extension(?)") {
      return {
        ...rowStatement(undefined),
        get: () => {
          throw new Error("no such function: load_extension");
        },
      };
    }
    return this.database.prepare(sql) as unknown as SqliteStatement;
  }

  public close(): void {
    this.closed = true;
    this.database.close();
  }
}

class SyntheticEncryptedFactory implements EncryptedSqliteDatabaseFactory {
  public opened: SyntheticEncryptedDatabase | undefined;

  public constructor(
    private readonly provider: "commoncrypto" | "openssl" = "commoncrypto",
  ) {}

  public open(): SyntheticEncryptedDatabase {
    this.opened = new SyntheticEncryptedDatabase(
      new DatabaseSync(":memory:"),
      this.provider,
    );
    return this.opened;
  }
}

describe("encrypted local-store gate", () => {
  it("opens only after keying and validating the pinned SQLCipher contract", () => {
    const factory = new SyntheticEncryptedFactory();
    const key = new Uint8Array(32).fill(7);
    const opened = openEncryptedLocalStore({
      databaseFactory: factory,
      databasePath: "synthetic-workspace.db",
      key,
      platform: "darwin",
      create: true,
    });
    assert(factory.opened?.keyed);
    assert(key.every((value) => value === 0));
    assert.deepEqual(opened.facts, {
      cipherVersion: "4.16.0 community",
      provider: "commoncrypto",
      providerVersion: "Apple CommonCrypto synthetic",
      fts5: true,
      loadableExtensions: false,
      encryptedWal: true,
    });
    assert.equal(
      opened.store.read(
        (view) =>
          view.listSpaces("00000000-0000-4000-8000-000000000001" as never)
            .length,
      ),
      0,
    );
    opened.close();
    assert(factory.opened.closed);
  });

  it("fails closed, wipes the key, and closes an incompatible driver", () => {
    const factory = new SyntheticEncryptedFactory("openssl");
    const key = new Uint8Array(32).fill(9);
    assert.throws(
      () =>
        openEncryptedLocalStore({
          databaseFactory: factory,
          databasePath: "synthetic-workspace.db",
          key,
          platform: "darwin",
          create: true,
        }),
      EncryptedStoreCapabilityError,
    );
    assert(key.every((value) => value === 0));
    assert(factory.opened?.closed);
  });
});
