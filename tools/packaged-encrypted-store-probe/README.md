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

Before each fault, the child truncates the WAL baseline, enables a small
probe-only page cache with spill, and records the database page size. The Capture
fixture fills the public 262,144-character limit with a repeated canary. For
every row-bearing boundary, a temporary plaintext control executes that same
boundary and must expose the canary in an uncommitted WAL frame; the pre-row
`BEGIN IMMEDIATE` sentinel uses the Capture-row control as its encryption
sensitivity reference. The control database and sidecars are then deleted. The
SQLCipher WAL must contain aligned frames with matching salts, zero commit
markers, and none of the proven spilled canaries. This relative control avoids
claiming encryption merely because a canary happened to remain in page cache.

At the exact boundary, the child writes one strict content-safe record and
blocks synchronously without closing or rolling back. Bounded non-object
Chromium diagnostics are not evidence; the parent still requires exactly one
valid record. It independently checks the WAL, proves the process is live, and
captures creation-bound process identities before force-killing the captured
POSIX process group with `SIGKILL` on macOS or the captured Windows process tree
with `taskkill /T /F`. macOS tracks PID, parent PID, process group, UID, and start
time;
Windows tracks PID and creation time. The controlled POSIX fixture fails before
the kill if any observed descendant has escaped the captured process group. The
parent requires every captured identity to disappear, handles proven numeric
process-group reuse without treating `EPERM` as absence, never repeatedly
signals a numeric group, and waits for all inherited pipes to close. Before any
relaunch, every row-bearing sentinel also requires the same uncommitted WAL
bytes to remain present.

A distinct packaged process must then observe the baseline Workspace, Space,
and membership with zero command rows and unchanged workspace version. Another
process applies the complete Capture, Event, Audit, Idempotency, and Outbox unit
of work once. An identical replay must return the stored outcome with zero
connection changes and an unchanged canonical logical-state digest; a final
process verifies the committed state, FTS result, and cipher/database/foreign-key
integrity.

The fixture semantics also run against Node's ordinary SQLite before the native
package build. That check proves the complete pre-`COMMIT` rollback matrix, each
relative plaintext WAL control, uncommitted frame observation, and replay
without churn; it is not a substitute for the packaged SQLCipher crash
evidence.

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

This proves same-artifact mechanism integration only. The macOS package is
ad-hoc signed and the Windows package is unsigned. It does not prove Developer
ID/notarized or Authenticode-signed N-to-N+1 continuity, installer/reboot or
OS-account migration, wrapper/database crash-atomic provisioning, the
post-commit-before-result fault boundary, generation-manifest
publication, busy/read-only/permission recovery, real disk-full or power-loss
recovery, migration recovery, rotation, temporary provider unavailability,
Windows workspace ACLs, optimized Windows crypto performance, unobserved
pre-boundary daemonization outside the captured POSIX process group, portable
recovery, reliable JavaScript heap zeroization, renderer isolation, or
same-user malware resistance.

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
