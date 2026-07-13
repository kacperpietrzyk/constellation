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
- one privileged packaged writer generates a fresh random 32-byte synthetic DEK
  internally, protects a strict workspace-bound payload through asynchronous
  safeStorage, and atomically publishes only its ciphertext and metadata;
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
  harness accepts exact fixed result shapes only, and the earlier dedicated
  safeStorage probe remains the independent exact-key output-channel oracle;
- each process emits one synchronous readiness record only after store close,
  post-close scanning, and failure cleanup. It then performs bounded synchronous
  polling for one per-launch control file, avoiding dependence on late Electron
  main-loop IPC or timer delivery. Only after parsing the exact fixed readiness
  result does the parent atomically publish an authorization bound to a random
  control token, the live process, the `app.quit()` method, and exit code zero.
  The child consumes and deletes that file, then acknowledges the shutdown and
  accepted exit request as ordered synchronous records before calling
  `app.quit()`. That call supplies the exact Electron `before-quit` →
  `will-quit` → `quit(0)` lifecycle evidence; `app.exit(0)` then drives normal
  browser-loop teardown under the same authorized exit code. The harness
  preserves the declared outcome separately from the observed process result,
  reports natural exits and forced post-lifecycle cleanup separately, retains
  an unreferenced child self-kill failsafe, and requires both inherited output
  pipes to close;
- a dedicated falsification launch emits readiness and the pre-exit
  acknowledgement, then exits internally with code `1`; the harness must reject
  it before the ordinary twelve-process result can pass;
- macOS uses an ad-hoc-signed package and disposable hosted-runner Keychain;
  Windows uses an unsigned mechanism package with statically linked pinned
  OpenSSL; every generated file and exact probe-only Keychain item is removed
  without artifact upload.

The child processes have a 45-second readiness watchdog so an interactive
provider prompt or native hang becomes a bounded failure. After readiness, the
parent allows up to five seconds for the acknowledged shutdown to produce the
complete ordered Electron lifecycle and `quit` event code `0`, then five seconds
for a natural process exit. A lingering process tree is force-terminated only
after that terminal evidence; either outcome must close both inherited output
pipes within five more seconds or the probe fails closed. Natural exits record
the observed status `0` without a signal on both targets, while forced
post-lifecycle cleanup is reported separately. The initial Windows writer must
exit naturally before the distinct reader starts. On Windows, the evidence is
the real async wrap/unwrap through distinct processes and exact marker recovery;
provider rotation and temporary unavailability remain outside this bounded
mechanism probe. The fixed declared outcome remains authoritative for each probe
operation.

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
OS-account migration, wrapper/database crash-atomic provisioning, real disk-full
or power-loss recovery, migration recovery, rotation, temporary provider
unavailability, Windows workspace ACLs, optimized Windows crypto performance,
portable recovery, reliable JavaScript heap zeroization, renderer isolation, or
same-user malware resistance.

See Electron's versioned
[`safeStorage` documentation](https://github.com/electron/electron/blob/v43.1.0/docs/api/safe-storage.md)
and SQLCipher's
[`sqlite3_key` guidance](https://www.zetetic.net/sqlcipher/sqlcipher-api/#sqlite3_key).
