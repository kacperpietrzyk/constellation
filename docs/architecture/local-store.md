# Local store

Status: relational adapter and key-custody boundary implemented; not yet wired
into the Electron developer preview.

`@constellation/local-store` implements the existing synchronous
`ApplicationStore` port over a deliberately small SQLite-shaped driver. It does
not change the command/query contract and is never imported by React or the
preload bridge.

## Current capability

- one kernel unit of work maps to `BEGIN IMMEDIATE` and commits or rolls back as
  one database transaction;
- Workspace, Space, membership, Task status, Capture, Task, event, audit,
  idempotency, and outbox records have separate relational tables;
- lookup, Workspace/Space filtering, ordering, pagination, uniqueness, and
  optimistic versions use explicit columns;
- complete typed records are retained as JSON payloads and checked against
  their row identity when loaded;
- malformed JSON, mismatched identity, and unsupported schema versions fail
  closed;
- close/reopen tests prove Capture-to-Task state, provenance, audit, and
  idempotent replay survive a database restart;
- an injected exception rolls back the complete transaction.

The tests use Node's built-in plaintext SQLite as an explicitly test-only
driver. Plain SQLite is not a production fallback and cannot open a product
workspace.

## Production encryption gate

The exported encrypted opener accepts a raw-key-capable driver only after it
proves all of the following:

- SQLCipher `4.16.0 community`;
- CommonCrypto on macOS or the pinned OpenSSL provider on Windows;
- `HAS_CODEC`, FTS5, in-memory temporary storage, and omitted extension loading;
- disabled native and SQL extension-loading paths;
- WAL mode, full synchronization, cipher/database/foreign-key integrity.

The key buffer is wiped after it is applied. Electron main owns asynchronous
Keychain/DPAPI custody through `safeStorage`, workspace-context binding,
authenticated wrapper metadata, and atomic `0600` wrapper publication.

## Remaining integration gate

The desktop runtime still selects the in-memory preview service. The next step
is to package the pinned native SQLCipher binding with the application, open the
workspace through the encrypted gate, and replace the preview service only
after packaged macOS and native Windows verification passes. Until then the UI
continues to label itself as non-durable and no release claims encrypted local
storage.
