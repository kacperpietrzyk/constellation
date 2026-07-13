# Packaged encrypted-store integration probe

This contributor tool answers one bounded question: can the same packaged
Electron 43.1.0 x64 artifact compose asynchronous OS-backed `safeStorage` with
the pinned SQLCipher 4.16.0 native binding, then recover the exact encrypted
workspace state in a distinct process on native macOS and Windows?

The fixture is clean-room compatibility evidence. It is not application runtime
code or an accepted persistence adapter.

## Evidence produced

The probe fails unless all of these checks pass:

- the direct executable is a packaged Electron 43.1.0 x64 application with a
  fixed product name, identifier, early persistent profile, ASAR archive, and
  exactly one native add-on at the expected `app.asar.unpacked` resource path;
- the pre-sign packaged add-on digest equals the just-built SQLCipher add-on,
  the finished package passes its platform identity check, and the executable,
  ASAR, and finished add-on digests remain unchanged across every process;
- one provider-initialization process completes an exact keyless parent IPC
  turn, schedules channel disconnect on the next event-loop turn, performs a
  fixed non-secret asynchronous safeStorage round trip, and exits naturally
  before any workspace wrapper or database can be created. The parent requires
  the main-process exit and inherited-channel close before starting the later
  no-IPC processes on the same profile;
- one later privileged packaged writer, launched without any IPC capability,
  generates a fresh random 32-byte synthetic DEK internally, protects a strict
  workspace-bound payload through asynchronous safeStorage, and atomically
  publishes only its ciphertext and metadata;
- that writer applies the raw DEK Buffer to SQLCipher before any schema access,
  clears the explicit Buffer, creates an encrypted WAL database, and writes a
  fresh synthetic marker plus FTS projection;
- a distinct process from the same package decrypts and validates the wrapper,
  applies the recovered DEK to the existing database, clears the Buffer, and
  verifies the exact marker digest, FTS result, cipher/database/foreign-key
  integrity, provider, compile options, and disabled extension loading;
- on Windows, a packaged writer and distinct packaged reader exercise the
  asynchronous safeStorage contract end to end through DPAPI, recovering the
  same workspace-bound wrapper and exact encrypted marker without relying on
  Chromium's private profile representation;
- missing, modified, and wrong-context wrappers (at both the public wrapper and
  decrypted payload boundaries), a valid same-context wrapper with the wrong
  key, a plaintext SQLite database, a corrupted encrypted database, and
  provisioning over existing state all fail closed without modifying the
  known-good wrapper, database, or durable WAL state and without leaving a
  rollback journal; any ephemeral SHM remains a regular non-symlink file;
- the database header and live WAL are encrypted; before and after database
  close, including failure cleanup, the packaged process scans the package,
  unpacked add-on, wrapper, database, WAL, profile, temp, and crash state for the
  actual raw and encoded DEK, key-payload, and marker canaries;
- unbounded application stdout/stderr and console methods are disabled, the
  child can emit only exact bounded result envelopes and non-secret progress
  stages, and the harness reports only the last allowlisted stage on a timeout;
  the earlier dedicated safeStorage probe remains the independent exact-key
  output-channel oracle;
- the initializer emits one synchronous fixed result and uses `app.exit()` so
  Electron commits provider state before the parent starts phase two. Every
  no-IPC store process asserts that the channel is absent before provider or
  database access. It emits its fixed result only after store close, post-close
  scanning, and failure cleanup. Electron
  [maps `process.exit()` to graceful `app.exit()`](https://github.com/electron/electron/blob/v43.1.0/lib/browser/init.ts#L76-L86)
  in the browser process, so this synthetic mechanism probe invokes Node's
  [internal immediate exit](https://github.com/nodejs/node/blob/v24.15.0/src/node_process_methods.cc#L501-L510)
  only after synchronous result publication. The parent accepts either launch
  only after the main process exits with that exact code and no signal, both
  inherited output pipes close, and the result shape and status/code
  relationship validate. Immediate exit is not a production
  application-shutdown contract;
- macOS uses an ad-hoc-signed package and disposable hosted-runner Keychain;
  Windows uses an unsigned mechanism package with statically linked pinned
  OpenSSL; every generated file and exact probe-only Keychain item is removed
  without artifact upload.

The child processes have a 45-second watchdog so an interactive provider prompt
or native hang becomes a bounded failure. Any forced cleanup before an observed
natural main-process exit is failure-only and can never become passing evidence.
After the main process exits with the exact declared code, the parent never
retargets its numeric PID or process-group ID. It waits for `close`, preserves
the already observed main-process status, and fails if inherited helpers do not
close their pipes within five seconds. On Windows, the evidence is the real
async wrap/unwrap through distinct processes and exact marker recovery;
provider rotation and temporary unavailability remain outside this bounded
mechanism probe. The direct exit paths are probe-only: the fixture is headless,
has no windows, and completes the relevant provider or store work before
emitting its fixed result. They do not define the product's eventual
user-facing graceful-shutdown policy.

## Forced-crash recovery sentinels

The separate `probe:recovery` runner reuses the already-built package and native
binding. It covers all six pre-`COMMIT` transaction sentinels for one
deterministic `capture.submitText` fixture:

- immediately after `BEGIN IMMEDIATE`, before any command row exists;
- after the Capture row and its external-content FTS projection;
- after the Event row;
- after the Audit row;
- after the Idempotency outcome row;
- after the Outbox row, while every command row is visible only inside the
  still-open transaction.

A separate seventh sentinel enters its post-commit fault path immediately after
`COMMIT` returns, verifies the committed state, and then stops before the
command can publish a result envelope. At the reported boundary, the transaction
is closed, all six command rows and the canonical state are committed, and the
caller still has no result.

Before each fault, the child truncates the WAL baseline, enables a small
probe-only page cache with spill, and records the database page size. The Capture
fixture fills the public 262,144-character limit with a repeated canary. For
every row-bearing boundary, a temporary plaintext control executes that same
boundary and must expose the canary in WAL; the pre-row `BEGIN IMMEDIATE`
sentinel uses the Capture-row control as its encryption-sensitivity reference.
The six pre-`COMMIT` controls require uncommitted frames with zero commit
markers. The post-`COMMIT` control requires exactly one commit frame. The
control database and sidecars are then deleted. The corresponding SQLCipher WAL
must contain aligned frames with matching salts, the expected commit-frame
count, and none of the proven spilled canaries. This relative control avoids
claiming encryption merely because a canary happened to remain in page cache.

At the reported boundary, the child writes one strict content-safe record and
blocks synchronously without closing the database; pre-`COMMIT` boundaries also
leave the transaction open without rolling it back. Bounded non-object Chromium
diagnostics are not evidence; the parent still requires exactly one valid
record. It independently checks the WAL, proves the process is live, and
captures creation-bound process identities before force-killing the captured
POSIX process group with `SIGKILL` on macOS or the captured Windows process tree
with `taskkill /T /F`. macOS tracks PID, parent PID, process group, UID, and start
time;
Windows tracks PID and creation time. The controlled POSIX fixture fails before
the kill if any observed descendant has escaped the captured process group. The
root identity is captured before any asynchronous pre-kill observer and checked
again afterward. An exited, missing, or changed root aborts the kill, and failure
cleanup may use only the original identity set rather than adopting a fresh
numeric PID or process group. The
parent requires every captured identity to disappear, handles proven numeric
process-group reuse without treating `EPERM` as absence, never repeatedly
signals a numeric group, and waits for all inherited pipes to close. Before any
relaunch, every row-bearing sentinel also requires the same fault-boundary WAL
bytes to remain present. Process accounting counts verified executions rather
than unique numeric PIDs because an operating system may legally reuse a PID
after the earlier process has been verified terminated. The full matrix uses 50
verified packaged process executions: 43 managed and seven forced.

On Windows, a descendant can remain visible briefly after the initial tree
kill. During one bounded 15-second verification window, the parent may retry
`taskkill /T /F` only for identities from the original snapshot that still
match both PID and creation time, rechecking that pair immediately before each
retry. A taskkill return code is never success evidence; every captured
identity must disappear or the probe fails.

A distinct packaged process must then observe the baseline Workspace, Space,
and membership with zero command rows and unchanged workspace version. Another
process applies the complete Capture, Event, Audit, Idempotency, and Outbox unit
of work once. An identical replay must return the stored outcome with zero
connection changes and an unchanged canonical logical-state digest; a final
process verifies the committed state, FTS result, and cipher/database/foreign-key
integrity.

After the post-`COMMIT` kill, the first fresh process must instead recover the
already committed canonical state. An identical command must replay the stored
outcome with zero changes. A fixed command with the same idempotency scope but
different semantic input must return `idempotency.key_reused`, also with zero
changes. A final fresh process proves that replay and conflict handling left the
committed state unchanged. The boundary stream must contain no command result,
and the last accepted progress stage must remain the fault-boundary stage.

The fixture semantics also run against Node's ordinary SQLite before the native
package build. That check proves the complete pre-`COMMIT` rollback matrix, the
post-`COMMIT` committed-state semantics, each relative plaintext WAL control,
commit-frame classification, replay and idempotency conflict without churn, and
strict post-`COMMIT` boundary validation. It is not a substitute for the
packaged SQLCipher crash evidence.

## Generation publication recovery gate

The separate `probe:generation-recovery` runner covers one exact generation
publication pivot. It starts with an encrypted `generation-1` selected by a
strict workspace manifest, exports that database through SQLCipher's
[`sqlcipher_export`](https://www.zetetic.net/sqlcipher/sqlcipher-api/#sqlcipher_export)
into an encrypted `generation-2`, and retains both generations. The candidate
receives the verified source `user_version` explicitly because
`sqlcipher_export` intentionally leaves the target value unchanged, then applies
the synthetic v2 migration. It is closed and reopened for integrity and
immutable-identity verification before publication. Activation changes only
the canonical workspace manifest; the runner never selects a generation by
directory order, modification time, or the largest identifier.

The prepared publication has one create-only, immutable operation record. Its
canonical contents bind the workspace and operation identifiers, source and
candidate generation identities, semantic input fingerprint, target manifest,
and stored outcome by digest. Reuse with the identical fingerprint is replay;
reuse of that operation identifier with different semantic input is a conflict.
Strict path, identifier, regular-file, and canonical-content checks reject
symlinks, malformed records, corrupt manifests, and corrupt or mismatched
generations before publication.

Two independent sentinels force-kill a creation-bound packaged process:

- after the complete temporary manifest has been file-synced, while the source
  manifest still selects `generation-1`;
- after the temporary manifest has replaced the workspace manifest, while the
  new manifest selects `generation-2` and before the child can report success.

After the first crash, a fresh packaged process must open the source selected by
the unchanged manifest. An identical replay must reuse the already verified
candidate and publish it exactly once; it must not export `generation-3`. After
the second crash, a fresh packaged process must open the target selected by the
new manifest. Identical replay must return the stored outcome without changing
the manifest or either generation. At both boundaries, a different fingerprint
for the same operation must fail closed without changing any verified bytes.
Fresh-process source and target opens verify the expected identity, synthetic
schema state, SQLCipher integrity, database integrity, and foreign keys.

The gate also requires the safeStorage wrapper bytes and digest to remain
unchanged, the executable, ASAR, and unpacked native add-on digests to remain
unchanged across every process, and both retained database generations to stay
encrypted. Package and runtime-tree scans must not persist the actual raw or
encoded DEK, protected payload, or random marker; runtime-state scans also
exclude the deterministic Capture canaries from profile, wrapper, manifest,
operation, generation, temp, and crash artifacts. Rejected symlink and
corruption fixtures must leave the last valid manifest, operation record,
wrapper, and generation bytes unchanged.

This is process-crash evidence for the two reported boundaries on the tested
native hosted runners. File sync before replacement and the observed manifest
replacement are part of the fixture, but it does not claim that the replacement
directory entry survives power loss: no parent-directory durability barrier is
proven. It also does not cover a full migration matrix, permission denial, real
disk-full behavior, or cleanup and garbage collection of retained generations,
operation records, or interrupted temporary manifests.

## Candidate build, staging, and handoff recovery gate

The separate `probe:generation-preparation-recovery` runner moves one boundary
earlier than manifest activation. Before export starts, it writes a canonical,
create-only, file-synced intent that binds the workspace, source manifest,
source and candidate identities, wrapper digest, semantic fingerprint, and
fixed export/migration recipes. The intent specifically binds
`sqlcipher-export-transactional/v2`: the operation attaches a reserved target,
configures its rollback journal and `synchronous = FULL`, and wraps
[`sqlcipher_export`](https://www.zetetic.net/sqlcipher/sqlcipher-api/#sqlcipher_export),
the target `user_version`, and their commit in one explicit transaction. The
synthetic v2 migration then runs in its own transaction. Both write only to the
exact operation-local `candidate-building` directory.

The operation holds `BEGIN IMMEDIATE` on the source database from prerequisite
verification through candidate publication. This is the cross-process
single-writer lock for the complete preparation operation, while the source
remains the verified read input. Lock acquisition uses no busy wait: a
concurrent retry receives the fixed `GENERATION_PREPARATION_BUSY` result without
mutating the source, intent, or partial candidate. See SQLite's
[`BEGIN IMMEDIATE` transaction semantics](https://www.sqlite.org/lang_transaction.html#deferred_immediate_and_exclusive_transactions).

Read-only verification and the operation lock may leave SQLite-owned source
read sidecars. The shared validator accepts only no rollback journal, an exact
zero-byte single-link WAL, and a bounded single-link SHM, all regular and
non-symlink; source sidecars are never manually unlinked. Replay snapshots
validate that shape before and after but exclude those two ephemeral
coordination files from the authoritative-workspace comparison. The source
database, manifests, records, wrapper, and candidate bytes must remain exact.

An interrupted unsealed build is never adopted as a candidate. Recovery treats
the database and its rollback-journal or WAL sidecars as one directory unit,
renames `candidate-building` to the fixed `candidate-discarding` name, verifies
that the move preserved the exact bounded regular-file set, explicitly deletes
only those recognized files, removes the now-empty directory, and regenerates
the candidate from the verified source under the same intent. Recovery resumes
that bounded deletion if a crash leaves `candidate-discarding` behind; it does
not recursively delete an arbitrary tree. This follows SQLite's requirement to
keep a database with its
[`hot journal`](https://www.sqlite.org/lockingv3.html#hot_journals) or
[`WAL file`](https://www.sqlite.org/wal.html#the_wal_file) rather than deleting
a sidecar independently.

Intent, sealed-candidate, and publication-operation records now share one
crash-recoverable create-only contract. Each canonical value selects a
same-directory temporary name containing its SHA-256 digest. The writer creates
that file with exclusive create, file-syncs and descriptor-reverifies it, then
publishes the final name with a hard link that cannot overwrite an existing
record. Before removing the temporary name, both names must contain the exact
bytes, identify the same inode, and report the expected link count. Replay
accepts only an exact single-link final record. Case variants, foreign suffixes,
unexpected hard links, symlinks, oversized or non-canonical values, and a
temporary name bound to another expected digest all fail closed. A strict
digest-bound partial prefix may be recreated; a conflicting retry cannot adopt
it as a different operation value.

After checkpoint and close, a fresh read-only open verifies the candidate's
identity, schema marker, logical Capture state, FTS, cipher, database, and
foreign-key integrity. A create-only sealed record binds that verification to
the closed encrypted file's exact digest and size. Only then may the closed
candidate directory move by one same-workspace rename into
`generations/generation-2`. The source manifest remains authoritative during
the entire handoff; a final generation directory never activates itself. The
immutable publication operation record is also present and verified before
either tested handoff boundary is reachable.

The two independent sentinels first cover all six record-publication boundaries:

- each of the three records after the complete temporary file is re-synced and
  reverified, before the final hard link exists;
- each record after the final hard link exists, while both exact names still
  identify the same two-link file.

Fresh processes recover intent and stop, recover the sealed-candidate record and
stop, then recover the operation record into the complete staged state. The
first sentinel uses all three temporary-file boundaries; the second uses all
three published-link boundaries. Earlier record inodes and bytes, the wrapper,
source database, source manifest, and sealed candidate must not churn. Only
after each recovery an additional fresh process must return the record's replay
outcome with an unchanged workspace snapshot. Only after that matrix passes do
the same sentinels force-kill the captured packaged process at the handoff
boundaries:

- after the sealed staged candidate has passed a second read-only verification,
  before its final generation path exists;
- after the candidate directory has moved into `generations`, before any result
  is published and while the manifest still selects `generation-1`.

Five additional native packaged sentinels cover the unsealed candidate build:

- during the transactional SQLCipher export, after the child reports the open
  transaction and while the parent independently observes a non-empty,
  incomplete database plus non-empty rollback journal with that child still
  alive;
- during the synthetic migration, after its writes and before `COMMIT`, with
  the migration transaction still open;
- after the synthetic migration commits, while committed frames remain in WAL;
- after a successful
  [`wal_checkpoint(TRUNCATE)`](https://www.sqlite.org/pragma.html#pragma_wal_checkpoint)
  has reduced WAL to zero bytes, before the database closes;
- after close, sidecar removal, a fresh read-only integrity and identity
  verification, and the rename from `candidate-building` to the sealed
  `candidate` staging name, before its immutable verification record is
  published.

The first four recoveries discard the complete unsealed directory unit and
regenerate it. The fifth adopts the already closed and verified staged
candidate, after re-verification, and continues normal immutable-record and
handoff recovery. Every sentinel must converge on the same intent-bound
candidate identity and logical state. The verified-rename sentinel additionally
continues through the operation record, handoff, manifest publication, replay,
and final target verification to prove downstream compatibility. Rebuilt
encrypted database bytes are deliberately not an identity contract and may
differ across attempts; replay after the verified record is published must keep
that attempt's sealed bytes unchanged.

A fresh process must recover the exact staged or handed-off state selected by
the intent and sealed record. Identical replay reuses those same candidate
bytes, performs at most one move, never exports again, and never creates
`generation-3`. Reusing the operation ID with different semantic input fails
before moving or rewriting anything. After handoff completes, the already
proved publication pivot activates the candidate, and its replay and conflict
checks must still cause no verified-file churn.

The ordinary fixture rejects a missing or oversized record, corrupt candidate,
digest or identity mismatch, simultaneous staging and final locations, and
symlinked database or sidecar. The packaged build is also rejected unless
SQLCipher reports SQLite's [`TEMP_STORE=2`](https://www.sqlite.org/compile.html#temp_store)
compile-time option. The packaged runner preserves the wrapper and package
artifact digests, scans runtime state for deterministic Capture canaries, and
verifies exact process accounting and inherited-pipe closure on both native
hosts. A passing combined record-publication, candidate-build, handoff,
activation, and direct preparation-setup matrix is currently required to report
exactly 85 packaged process executions: 72 managed and 13 force-terminated at
exact creation-bound identities. Those counts are the runner's acceptance
condition, not completed native evidence until both hosted jobs are green.

Once green on both native hosts, this gate is process-crash evidence for the
five candidate-build boundaries, six exact immutable-record boundaries, a fully
verified candidate, and its same-workspace handoff. It does not prove power-loss
or parent-directory durability; cross-volume or filesystems without
same-directory hard-link support; real disk-full/quota behavior;
permission-denied recovery; arbitrary production migrations; a
non-cooperating same-user writer outside the application lock discipline; or
long-term secure erasure of discarded encrypted candidate bytes. There is no
copy or overwrite fallback when hard links are unsupported. The path-race
checks assume workspace-owned `0700` directories and cooperative access through
the application operation lock.

## Pinned inputs

| Input                | Pin                                                                        | Purpose                                       | License      |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------------------- | ------------ |
| SQLCipher Community  | 4.16.0 / `e2a6040f2ae5cfff2b3e08eb3320007d93cdf3fc`                        | Generate the encrypted SQLite source          | BSD-3-Clause |
| OpenSSL              | 3.5.7 / `a8c0d28a529ca480f9f36cf5792e2cd21984552a3c8e4aa11a24aa31aeac98e8` | Static Windows SQLCipher crypto provider      | Apache-2.0   |
| `better-sqlite3`     | 12.11.1                                                                    | Exercise the raw-key native binding           | MIT          |
| Electron             | 43.1.0                                                                     | Packaged Keychain/DPAPI and native ABI host   | MIT          |
| `@electron/packager` | 20.0.2                                                                     | Produce native x64 application folders        | BSD-2-Clause |
| `node-gyp`           | 13.0.1                                                                     | Compile the disposable Electron native add-on | MIT          |

The workflow installs npm dependencies without lifecycle scripts, generates the
pinned SQLCipher amalgamation in a short-lived Ubuntu job, verifies platform
Electron archives and the Windows OpenSSL archive against committed SHA-256
digests, has read-only repository permissions, references no project secrets,
uploads only the licensed generated SQLCipher source for one day, and publishes
no compiled binary or runtime state.

## Execution boundary

The supported evidence path is
`.github/workflows/packaged-encrypted-store-probe.yml` on the native hosted
`macos-15-intel` and `windows-2022` runners. The macOS isolation scripts refuse
to alter Keychain configuration outside GitHub-hosted Actions. A direct local
run is intended only for a matching x64 host and can create the exact synthetic
safeStorage item in the current default Keychain; the runner removes it in
`finally`, and `npm run cleanup` is the interruption-recovery path.

The native build reuses the reviewed, target-root-aware patch and build scripts
from `tools/sqlcipher-native-probe`; its own lockfile and compiled module remain
isolated from the product dependency graph.

## Scope limits

This proves same-artifact mechanism integration plus only the process-crash
immutable-record, transactional candidate-build, candidate-handoff, and
generation-publication pivots described above. The macOS package is ad-hoc
signed and the Windows package is unsigned. It does not prove Developer
ID/notarized or Authenticode-signed N-to-N+1 continuity, installer/reboot or
OS-account migration, wrapper/database crash-atomic initial provisioning,
generation publication or migration recovery beyond the exact retained
`generation-1`/`generation-2` fixture, arbitrary production migrations,
read-only/permission recovery, real disk-full or power-loss recovery,
parent-directory durability, device-cache ordering, generation cleanup or
garbage collection, long-term secure erasure of discarded encrypted bytes,
client or renderer result delivery, authorization rechecks, external-effect
delivery, rotation, temporary provider unavailability, Windows workspace ACLs,
optimized Windows crypto performance, a non-cooperating same-user writer
outside the application lock discipline, unobserved pre-boundary daemonization
outside the captured POSIX process group, portable recovery, reliable
JavaScript heap zeroization, renderer isolation, or same-user malware
resistance.

The initializer alone is not evidence that provider state is durable; the later
no-IPC writer and reader recovering the exact marker provide that evidence. The
probe does not claim that no OS permission UI can appear, or that plaintext is
absent from the packaged child or OS cryptographic provider memory. Its
no-exposure claim is limited to IPC, the harness, output, and persisted
plaintext artifacts.

See Electron's versioned
[`safeStorage` documentation](https://github.com/electron/electron/blob/v43.1.0/docs/api/safe-storage.md)
and SQLCipher's
[`sqlite3_key` guidance](https://www.zetetic.net/sqlcipher/sqlcipher-api/#sqlite3_key).
