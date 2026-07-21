# Data Homes

Status: versioned contract, certified local-only provider, and self-hosted Hub
coordination preview implemented.

A Data Home is the explicit storage and coordination boundary for one
workspace. It tells the application where canonical data lives, which
capabilities are available, how current status was verified, and which recovery
actions are safe. It is not a second command API: UI, imports, rules, and future
MCP tools continue to use the shared application commands and queries.

## Contract

`@constellation/contracts` defines a strict versioned descriptor and status for:

- provider instance, workspace, and installation-generated device identity;
- canonical local storage or a future coordinated projection with outbox;
- availability, encryption, key custody, checkpoint verification, quota
  knowledge, and recovery actions;
- ordered changes, checkpoints, tombstones, attachments, quota, portable
  export/import, provider migration, and device revocation;
- distinct `success`, `partial`, `conflict`, `retryable`,
  `unknown_reconcile`, `unsupported`, and `cancelled` outcomes.

Capabilities are independent. A provider must explain every unsupported
capability and cannot report a coordinated projection without ordered change
exchange. A degraded status must provide at least one concrete recovery action.
Unknown effects are never converted to success.

The privileged provider port lives in `@constellation/application`. Electron
main owns the implementation and exposes only semantic status and portability
operations through the context-isolated preload. Filesystem paths, database
handles, keys, and recovery secrets are not provider status.

## Local-only provider

`constellation.local-only/v1` describes the current packaged Alpha:

- the SQLCipher database on this device is canonical;
- Keychain or DPAPI-backed `safeStorage` owns the local key wrapper;
- a random installation identity is published create-only with restrictive
  permissions and is never derived from hardware identifiers;
- encrypted portable export, verified preview, staged restore, provider
  migration, retained-previous rollback, and checkpoints are supported;
- bounded managed Capture payloads are supported inside the local encrypted
  workspace and portable backup/restore boundary;
- ordered remote changes, tombstone propagation, provider quota, and remote
  device revocation are explicitly unsupported;
- sync state is `not_configured`, not an offline error.

The desktop Data Home surface presents these facts beside export and restore.
It labels a checkpoint verified only after a successful export or restore in
the current session and never presents synchronization as backup.

## Certification and evidence

The reusable provider certification checks schema stability, capability
consistency, local canonicality, recovery actions, and non-mutating
cancellation. Contract tests keep partial, conflict, retryable, and
unknown-effect outcomes distinct. Provider and device tests cover checkpoint
truth, locked key custody, malformed identity, symlinks, and multiply-linked
identity records.

The packaged application gate additionally proves status through the real
window, preload, and IPC while it exports, mutates, relaunches, survives forced
termination at both restore activation boundaries, enters recovery after key
loss, restores the portable checkpoint, and reopens the same workspace. It also
requires one stable device identity across every phase. Native macOS arm64,
macOS x64, and Windows x64 are required CI targets.

## Self-hosted coordinated provider

`constellation.self-hosted-hub/v1` keeps a SQLCipher projection and durable
command journal on every device while PostgreSQL coordinates authoritative
ordering, receipts, checkpoints, and device grants. The Hub executes the same
application kernel as the desktop; HTTP is a transport, not another domain API.

Enrollment uses a short-lived one-use secret. The resulting per-device
credential is held by the operating-system credential service. The first device
may publish the initial logical snapshot exactly once while the Hub workspace is
empty. Later updates are commands with expected versions and deterministic IDs,
so replay is idempotent and stale work becomes an explicit conflict. A lost
response is reconciled by command receipt before retry.

Attachments use resumable, bounded chunks and content-addressed SHA-256 objects.
The Hub publishes an object only after its complete length and digest match.
Selecting, dropping, pasting, or recording a managed Capture payload stages it
only inside the encrypted local workspace. A short voice note is bounded to two
minutes and 25 MB and records its retention choice alongside the encrypted
audio descriptor. Immediately before `capture.submit`, the desktop
publishes those exact bytes, verifies digest and length, and only then accepts
the local Capture command. The Hub independently requires the matching
published object before accepting its coordinated command, so a descriptor can
never advance the authoritative projection without its bytes. A failed
transfer creates no Capture, keeps local staging for an explicit retry, and
does not block ordinary record synchronization.
Replacing a missing or partially transferred Capture payload follows the same
gate. The replacement bytes are staged and, for a coordinated workspace,
published before `capture.resolveException`; the kernel then replaces the
descriptor and dismisses the exact Attention signal atomically. A failed
transfer, digest check, authorization check, or version precondition preserves
the previous Capture and its Attention state. Only after success may local
reconciliation purge bytes that no Capture references.
Normal projection replacement retains bytes only for still-authorized Capture
records and current dialog staging. Membership or device revocation purges the
whole coordinated projection, including managed payload bytes.
Document attachments reuse this exact custody and transport. Their visible
Knowledge Source/evidence relation carries metadata and provenance, while each
device verifies whether it holds the bytes. An authorized retry downloads the
workspace-scoped digest from the Hub and writes it only after length and SHA-256
match; attachment metadata alone is never treated as local availability.
Authorized external agents read a managed payload through the same versioned
MCP resource contract in either Data Home. Reading a voice original also needs
the separate `capture.audioRead` grant; Space and Capture History authorization
remain mandatory. Local stdio obtains bounded chunks
from encrypted custody; remote Streamable HTTP obtains them from the Hub object.
The MCP server reassembles and verifies the complete digest before returning a
blob, while revocation or a Space-scope change fails the whole read.

The correctness-first v1 change feed sends a validated logical snapshot after a
new checkpoint. This is intentionally less bandwidth-efficient than a mature
incremental feed, but it preserves workspace boundaries and makes atomic local
projection replacement testable. Provider quota reporting and incremental
tombstone compaction remain future optimizations; they must not weaken current
recovery behavior.

Every delivered snapshot is filtered for the enrolled human's current Space
scope before it reaches the device. If a Workspace membership or device grant
is revoked, the next sync requests an atomic local purge of the projection,
full-text index, command journal, and outbox. A ready encrypted profile whose
projection was purged cannot reopen that content after relaunch and enters the
explicit recovery surface instead.

The same projection boundary includes comments only for visible Spaces and
Attention signals only for the enrolled principal. Former authors are reduced
to a safe label, ineligible mention IDs are removed, and audit receipt record
lists are stripped of another principal's Attention identifiers before the
snapshot leaves the Hub.

Native-document bodies use a dedicated collaboration channel rather than the
logical snapshot feed. Each desktop first commits Yjs state to its encrypted
local store; coordinated workspaces also retain a bounded update outbox until a
live document session synchronizes. The Hub accepts only `/v1/realtime`, uses a
five-minute random room token minted from the protected device credential, and
reauthorizes current membership and Space access before every inbound update.
PostgreSQL stores opaque bounded Yjs state and named revision checkpoints.
Presence is ephemeral, size-limited, and never treated as authoritative data.
Local-only workspaces keep the same editor and named revisions entirely in
SQLCipher without claiming remote collaboration.

Operational setup and recovery are documented in the
[self-hosted Hub runbook](../self-hosting/hub.md). Constellation never
synchronizes an actively opened database through a generic cloud folder.
