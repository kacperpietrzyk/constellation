import { createRequire } from "node:module";

import type {
  EncryptedSqliteDatabase,
  EncryptedSqliteDatabaseFactory,
} from "@constellation/local-store";

type BetterSqlite3Constructor = new (
  filename: string,
  options: { readonly fileMustExist: boolean },
) => EncryptedSqliteDatabase;

const isConstructor = (value: unknown): value is BetterSqlite3Constructor =>
  typeof value === "function";

export const createBetterSqlite3Factory = (input?: {
  readonly load?: () => unknown;
}): EncryptedSqliteDatabaseFactory => {
  const load =
    input?.load ??
    (() => createRequire(import.meta.url)("better-sqlite3") as unknown);
  return {
    open(filename, options) {
      const Database = load();
      if (!isConstructor(Database)) {
        throw new TypeError(
          "The SQLCipher database constructor is unavailable.",
        );
      }
      const database = new Database(filename, options);
      if (
        typeof database.key !== "function" ||
        typeof database.loadExtension !== "function" ||
        typeof database.prepare !== "function" ||
        typeof database.exec !== "function" ||
        typeof database.close !== "function"
      ) {
        database.close?.();
        throw new TypeError("The SQLCipher database driver is incompatible.");
      }
      return database;
    },
  };
};
