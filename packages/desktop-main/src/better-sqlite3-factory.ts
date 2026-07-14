import { createRequire } from "node:module";

import type {
  EncryptedSqliteDatabase,
  EncryptedSqliteDatabaseFactory,
} from "@constellation/local-store";

type BetterSqlite3Constructor = new (
  filename: string,
  options: { readonly fileMustExist: boolean },
) => EncryptedSqliteDatabase;

const isConstructor = (value: unknown): value is BetterSqlite3Constructor => {
  if (typeof value !== "function") return false;
  const prototype = (value as { readonly prototype?: unknown }).prototype;
  if (
    typeof prototype !== "object" ||
    prototype === null ||
    Array.isArray(prototype)
  ) {
    return false;
  }
  const driver = prototype as Record<string, unknown>;
  return (
    typeof driver.key === "function" &&
    typeof driver.loadExtension === "function" &&
    typeof driver.prepare === "function" &&
    typeof driver.exec === "function" &&
    typeof driver.close === "function"
  );
};

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
        throw new TypeError("The SQLCipher database driver is incompatible.");
      }
      return new Database(filename, options);
    },
  };
};
