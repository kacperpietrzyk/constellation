export {
  LocalStoreCorruptionError,
  LOCAL_STORE_SCHEMA_VERSION,
  SqliteApplicationStore,
  initializeLocalStoreSchema,
} from "./sqlite-application-store.js";
export {
  EncryptedStoreCapabilityError,
  exportEncryptedLocalStore,
  openEncryptedLocalStore,
} from "./encrypted-local-store.js";
export type {
  LocalCoordinationState,
  LocalWorkspaceRecoverySummary,
  PendingSyncCommand,
} from "./sqlite-application-store.js";
export type {
  EncryptedLocalStoreExportFacts,
  EncryptedLocalStoreFacts,
  EncryptedSqliteDatabase,
  EncryptedSqliteDatabaseFactory,
  OpenedEncryptedLocalStore,
} from "./encrypted-local-store.js";
export type {
  SqliteDatabase,
  SqliteRunResult,
  SqliteStatement,
  SqliteValue,
} from "./sqlite-driver.js";

export interface LocalStoreDescriptor {
  readonly adapter: "encrypted-local-store";
  readonly availability: "schema_adapter_ready";
}

/**
 * The relational ApplicationStore adapter is ready. Production availability
 * still depends on Electron opening a capability-verified SQLCipher driver.
 */
export const describeLocalStore = (): LocalStoreDescriptor => ({
  adapter: "encrypted-local-store",
  availability: "schema_adapter_ready",
});
