# Local store

Status: relational adapter, key custody, and Electron runtime lifecycle
implemented; native application packaging remains gated.

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
authenticated wrapper metadata, and atomic `0600` wrapper publication. The
wrapped payload also retains generated workspace, root Space, principal,
credential, and grant identifiers so desktop bootstrap never relies on a
hard-coded privileged identity.

The production desktop lifecycle creates or opens a fixed local workspace,
verifies the stored root Space and membership, and exposes the same
command/query service used by the in-memory preview. Restart tests cover
workspace identity, Capture, Task, provenance, and the interrupted state where
the wrapped identity exists but database creation did not finish.

## Remaining integration gate

The desktop entry point selects the durable runtime by default and requires the
patched, capability-verified `better-sqlite3` binding. `npm run dev:desktop`
explicitly selects the in-memory developer preview so ordinary web UI work does
not imply durability. There is no plaintext or in-memory fallback in the local
Alpha path.

The remaining gate is to package that pinned native binding as the only
unpacked native module and run the real application journey on packaged macOS
and native Windows. No installable release claims encrypted local storage until
that evidence passes.
