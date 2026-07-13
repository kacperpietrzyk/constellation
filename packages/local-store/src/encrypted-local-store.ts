import { SqliteApplicationStore } from "./sqlite-application-store.js";
import type { SqliteDatabase } from "./sqlite-driver.js";

export interface EncryptedSqliteDatabase extends SqliteDatabase {
  close(): void;
  key(key: Uint8Array): unknown;
  loadExtension(filename: string): unknown;
}

export interface EncryptedSqliteDatabaseFactory {
  open(
    filename: string,
    options: { readonly fileMustExist: boolean },
  ): EncryptedSqliteDatabase;
}

export interface EncryptedLocalStoreFacts {
  readonly cipherVersion: "4.16.0 community";
  readonly provider: "commoncrypto" | "openssl";
  readonly providerVersion: string;
  readonly fts5: true;
  readonly loadableExtensions: false;
  readonly encryptedWal: true;
}

export interface OpenedEncryptedLocalStore {
  readonly facts: EncryptedLocalStoreFacts;
  readonly store: SqliteApplicationStore;
  close(): void;
}

export class EncryptedStoreCapabilityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EncryptedStoreCapabilityError";
  }
}

const objectValue = (
  value: unknown,
  context: string,
): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EncryptedStoreCapabilityError(`${context} is unavailable.`);
  }
  return value as Record<string, unknown>;
};

const pragmaText = (
  database: EncryptedSqliteDatabase,
  pragma: string,
  column: string,
): string => {
  const value = objectValue(database.prepare(`PRAGMA ${pragma}`).get(), pragma)[
    column
  ];
  if (typeof value !== "string") {
    throw new EncryptedStoreCapabilityError(`${pragma} is unavailable.`);
  }
  return value;
};

const assertExtensionsDisabled = (database: EncryptedSqliteDatabase): void => {
  let nativeDisabled = false;
  try {
    database.loadExtension("constellation-disabled-extension-check");
  } catch (error) {
    nativeDisabled =
      error instanceof TypeError &&
      error.message === "Loadable extensions are disabled";
  }

  let sqlDisabled = false;
  try {
    database
      .prepare("SELECT load_extension(?)")
      .get("constellation-disabled-extension-check");
  } catch (error) {
    sqlDisabled = /no such function: load_extension/i.test(
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!nativeDisabled || !sqlDisabled) {
    throw new EncryptedStoreCapabilityError(
      "Loadable extensions are not disabled.",
    );
  }
};

const validateCapabilities = (
  database: EncryptedSqliteDatabase,
  platform: NodeJS.Platform,
): EncryptedLocalStoreFacts => {
  const cipherVersion = pragmaText(
    database,
    "cipher_version",
    "cipher_version",
  );
  const provider = pragmaText(database, "cipher_provider", "cipher_provider");
  const providerVersion = pragmaText(
    database,
    "cipher_provider_version",
    "cipher_provider_version",
  );
  const compileOptions = new Set(
    database
      .prepare("PRAGMA compile_options")
      .all()
      .map((row) => {
        const value = objectValue(row, "compile option").compile_options;
        if (typeof value !== "string") {
          throw new EncryptedStoreCapabilityError(
            "Compile options are invalid.",
          );
        }
        return value;
      }),
  );
  const expectedProvider = platform === "darwin" ? "commoncrypto" : "openssl";
  if (
    cipherVersion !== "4.16.0 community" ||
    provider !== expectedProvider ||
    !/^[\x20-\x7e]{1,128}$/.test(providerVersion) ||
    (platform === "win32" && !/^OpenSSL 3\.5\.7\b/.test(providerVersion)) ||
    !compileOptions.has("HAS_CODEC") ||
    !compileOptions.has("ENABLE_FTS5") ||
    !compileOptions.has("TEMP_STORE=2") ||
    !compileOptions.has("OMIT_LOAD_EXTENSION")
  ) {
    throw new EncryptedStoreCapabilityError(
      "The required SQLCipher build is unavailable.",
    );
  }
  assertExtensionsDisabled(database);
  return {
    cipherVersion,
    provider: provider as "commoncrypto" | "openssl",
    providerVersion,
    fts5: true,
    loadableExtensions: false,
    encryptedWal: true,
  };
};

const configureAndVerify = (database: EncryptedSqliteDatabase): void => {
  database.exec("PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL;");
  const journalMode = pragmaText(
    database,
    "journal_mode = WAL",
    "journal_mode",
  );
  if (journalMode.toLowerCase() !== "wal") {
    throw new EncryptedStoreCapabilityError(
      "Encrypted WAL mode is unavailable.",
    );
  }
  database.exec("PRAGMA wal_autocheckpoint = 0;");
  const cipherIntegrity = database
    .prepare("PRAGMA cipher_integrity_check")
    .all();
  const integrity = pragmaText(database, "integrity_check", "integrity_check");
  const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
  if (
    cipherIntegrity.length !== 0 ||
    integrity !== "ok" ||
    foreignKeys.length !== 0
  ) {
    throw new EncryptedStoreCapabilityError(
      "The encrypted workspace failed integrity checks.",
    );
  }
};

export const openEncryptedLocalStore = (input: {
  readonly databaseFactory: EncryptedSqliteDatabaseFactory;
  readonly databasePath: string;
  readonly key: Uint8Array;
  readonly platform?: NodeJS.Platform;
  readonly create?: boolean;
}): OpenedEncryptedLocalStore => {
  if (input.key.byteLength !== 32) {
    input.key.fill(0);
    throw new EncryptedStoreCapabilityError("The workspace key is invalid.");
  }
  let database: EncryptedSqliteDatabase | undefined;
  try {
    database = input.databaseFactory.open(input.databasePath, {
      fileMustExist: input.create !== true,
    });
    try {
      database.key(input.key);
    } finally {
      input.key.fill(0);
    }
    database.prepare("SELECT count(*) AS count FROM sqlite_master").get();
    const facts = validateCapabilities(
      database,
      input.platform ?? process.platform,
    );
    configureAndVerify(database);
    const store = new SqliteApplicationStore(database);
    return {
      facts,
      store,
      close: () => database?.close(),
    };
  } catch (error) {
    input.key.fill(0);
    try {
      database?.close();
    } catch {
      // Preserve the capability, key, or database error.
    }
    throw error;
  }
};
