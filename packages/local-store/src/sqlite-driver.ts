export type SqliteValue = string | number | bigint | Uint8Array | null;

export interface SqliteRunResult {
  readonly changes: number | bigint;
}

export interface SqliteStatement {
  all(...parameters: readonly SqliteValue[]): readonly unknown[];
  get(...parameters: readonly SqliteValue[]): unknown;
  run(...parameters: readonly SqliteValue[]): SqliteRunResult;
}

/**
 * Small common subset implemented by Node's test SQLite and the production
 * SQLCipher-patched better-sqlite3 binding. No key material crosses this port.
 */
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
