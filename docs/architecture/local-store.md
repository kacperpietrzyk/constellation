# Local store

Status: relational adapter, key custody, Electron lifecycle, and packaged Alpha
path implemented; distribution signing remains gated.

`@constellation/local-store` implements the existing synchronous
`ApplicationStore` port over a deliberately small SQLite-shaped driver. It does
not change the command/query contract and is never imported by React or the
preload bridge.

## Current capability

- one kernel unit of work maps to `BEGIN IMMEDIATE` and commits or rolls back as
  one database transaction;
- Workspace, Space, membership, Task status, Capture, Task, Project,
  Task-to-Project relation, undo descriptor, event, audit, idempotency, and
  outbox records have separate relational tables;
- lookup, Workspace/Space filtering, ordering, pagination, uniqueness, and
  optimistic versions use explicit columns;
- complete typed records are retained as JSON payloads and checked against
  their row identity when loaded;
- malformed JSON, mismatched identity, and unsupported schema versions fail
  closed;
- the versioned v1-to-v2 migration runs exclusively and backfills event/audit
  lookup columns plus the local full-text index in the same transaction;
- the FTS5 index carries Workspace and Space scope on every Capture, Task, and
  Project entry; application search still authorizes scopes before reading and
  keeps deterministic ranking in the shared query layer;
- close/reopen tests prove Project/status/relation/search/cockpit/activity/undo
  state and idempotent replay survive a database restart;
- injected exceptions roll back both the original Capture slice and Wave 2
  records, while indexed-scope corruption fails closed.

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
hard-coded privileged identity. Its authenticated `prepared`/`ready` state
distinguishes an interrupted first bootstrap from loss of an established
database: only the former can resume creation, while the latter stops in
explicit recovery instead of silently creating an empty workspace. SafeStorage
rotation requests rewrap the validated payload atomically.

The production desktop lifecycle creates or opens a fixed local workspace,
verifies the stored root Space and membership, and exposes the same
command/query service used by the in-memory preview. Restart tests cover
workspace identity, Capture, Task, provenance, and the interrupted state where
the wrapped identity exists but database creation did not finish.

## Packaged application gate

The desktop entry point selects the durable runtime by default and requires the
patched, capability-verified `better-sqlite3` binding. `npm run dev:desktop`
explicitly selects the in-memory developer preview so ordinary web UI work does
not imply durability. There is no plaintext or in-memory fallback in the local
Alpha path.

The production package uses a dedicated entry point and dependency manifest.
It excludes preview/testkit/smoke artifacts, verifies a pinned Electron archive,
and permits exactly one unpacked native module. The packaged test drives the
real window through the context-isolated preload and IPC, creates a Capture and
Task, closes the browser, relaunches the same encrypted workspace, and requires
the Task to return without renderer or load errors. Native macOS x64 and Windows
x64 jobs are required. Remaining release gates are production code signing,
notarization, installer/updater behavior, and distribution continuity.
