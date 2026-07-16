# Local store

Status: relational adapter, key custody, Electron lifecycle, packaged Alpha,
and local-only Data Home certification implemented; distribution signing
remains gated.

`@constellation/local-store` implements the existing synchronous
`ApplicationStore` port over a deliberately small SQLite-shaped driver. It does
not change the command/query contract and is never imported by React or the
preload bridge.

## Current capability

- one kernel unit of work maps to `BEGIN IMMEDIATE` and commits or rolls back as
  one database transaction;
- Workspace, Space, membership, Task status, Capture, Task, Task assignment,
  comment, Attention signal, Project, Task-to-Project relation, undo descriptor,
  event, audit, idempotency, and outbox records have separate relational tables;
- lookup, Workspace/Space filtering, ordering, pagination, uniqueness, and
  optimistic versions use explicit columns;
- complete typed records are retained as JSON payloads and checked against
  their row identity when loaded;
- malformed JSON, mismatched identity, and unsupported schema versions fail
  closed;
- the versioned migration chain through schema v15 runs exclusively and
  backfills the accumulated event/audit, full-text, collaboration, agent,
  knowledge, strategic, meeting, and managed-payload structures in the same
  transaction;
- this build opens and upgrades every historical local schema from v1 through
  the current v15; it refuses v16 or newer before changing the database and
  does not support opening a v15 workspace with an older build unless that
  build's documented schema window includes v15;
- the FTS5 index carries Workspace and Space scope on every Capture, Task, and
  Project entry; application search still authorizes scopes before reading and
  keeps deterministic ranking in the shared query layer;
- close/reopen tests prove Project/status/relation/assignment/comment/Attention/
  search/cockpit/activity/undo state and idempotent replay survive a database
  restart;
- injected exceptions roll back both the original Capture slice and Wave 2
  records, while an injected v14-to-v15 migration failure stays at v14 and can
  be retried successfully; indexed-scope corruption fails closed.
- Task assignments have their own optimistic version and a partial unique index
  allowing at most one active assignment per Task.
- Comments and per-principal Attention signals use separate scoped indexes;
  deduplication keys prevent repeated assignment or mention delivery.

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

The key buffer is wiped after it is applied. Electron main owns Keychain/DPAPI
custody through `safeStorage`, workspace-context binding, authenticated wrapper
metadata, and atomic `0600` wrapper publication. Windows uses Electron's
asynchronous DPAPI provider. The macOS Alpha accesses the synchronous Keychain
provider only after `app.whenReady()` because the asynchronous provider can
block indefinitely for an ad-hoc application identity; it never runs in the
renderer. The
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
workspace identity, Capture, Task, provenance, the interrupted state where the
wrapped identity exists but database creation did not finish, and a
recovery-only launch when an established database cannot recover its protected
wrapper.

The local SQLCipher database is the canonical store for a local-only Data Home.
It is not a synchronized file and is never placed behind an arbitrary-folder
sync claim. In a coordinated Data Home the same adapter acts as a device-local,
principal-scoped projection plus outbox while preserving the application
command/query semantics. Hub snapshot replacement and revocation purge are
single SQLite transactions; the latter removes projected records, FTS rows,
queued commands, receipts, and local policy metadata before recording the
revoked coordination state.

Native document metadata remains part of the normal scoped projection. Its Yjs
body is stored separately as a bounded opaque blob. A local-only edit replaces
that encrypted state atomically; a coordinated edit commits the new state and a
pending binary update in one transaction. Acknowledgement removes only updates
confirmed after document synchronization. Named revision state and state
vectors survive restart, while access-revocation purge removes document bodies,
pending updates, and revisions before their parent metadata. Scope columns are
checked against the document record on every load and write so corrupted or
cross-Space binary rows fail closed.

The local Alpha also exposes semantic backup and restore operations without
giving the renderer database paths, handles, or keys. Export uses
`sqlcipher_export` under a fresh random key, verifies the closed encrypted copy,
and publishes one bounded `.constellation-backup` archive. A separate random
256-bit recovery code authenticates and unwraps the archive key; Constellation
does not persist or embed that code. Restore verifies the archive in isolation,
re-encrypts it under a fresh local key, shows logical record counts, and only
activates the candidate after explicit confirmation. The previous workspace is
retained, and startup rolls back either interruption boundary before an
unverified candidate can replace it.

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
Task, exports a verified backup, adds later work, relaunches, previews and
confirms restore, and requires the backup state and stable workspace identity
to return without renderer or load errors. The same journey terminates the
packaged process at both restore activation boundaries and requires startup to
reopen the retained last-known-good workspace before a successful retry. Native
macOS arm64, macOS x64, and Windows x64 jobs are required. Each macOS binding is compiled and exercised on
a matching native runner; Rosetta is not a build or verification dependency.
Managed Capture payload bytes now live in a dedicated SQLCipher table and are
therefore included in the same closed encrypted export, staged restore, and
last-known-good rollback boundary. Coordinated snapshot replacement preserves
current staged bytes and bytes referenced by the newly authorized projection,
while removed Capture scope and revocation purge the corresponding custody.
For voice notes, a durable transcript first moves the Capture to
`deletion_pending`, which revokes payload reads. SQLCipher removes the audio and
records `deleted` only after absence is verified; coordinated projection
replacement also purges pending/deleted voice bytes while preserving unrelated
dialog staging and explicitly retained audio.
The adapter deterministically injects capacity loss and write-permission loss
before a transaction and at commit. It maps a safe retry only after rollback
succeeds or the native connection confirms that no transaction remains, using
the content-safe `storage.capacity_exhausted` or
`storage.permission_denied` retry outcome, proves that no partial row remains,
and then replays successfully after the fault clears. Native VFS drills on both
packaged platforms remain a separate release-candidate gate.
Installer/update/compatible-rollback/uninstall mechanics now have a separate
packaged distribution drill; production signing and notarization remain a
credential-gated release proof rather than a claim made by ordinary CI. See
[Desktop distribution](desktop-distribution.md).

The packaged journey also validates the safe Data Home status route, stable
installation-generated device identity, honest capability matrix, and verified
checkpoint state across relaunch and recovery. See [Data Homes](data-homes.md)
for the provider contract.
