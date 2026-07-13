# Dependency inventory

Constellation pins direct dependencies and commits the npm lockfile. CI installs
with `npm ci --ignore-scripts` and runs `npm audit` as part of lockfile review.

## Runtime

| Dependency                 | Purpose                                                                                       | License      | Boundary                   |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| `zod` 4.4.3                | Strict runtime command, query, context, and outcome validation with inferred TypeScript types | MIT          | `contracts` only           |
| React 19.2.7               | Render the shared desktop product surface                                                     | MIT          | `desktop-ui` only          |
| React DOM 19.2.7           | Mount the React renderer into the Electron document                                           | MIT          | `desktop-ui` only          |
| Electron 43.1.0            | Secure desktop main/preload boundary for the preview and local Alpha                          | MIT          | `desktop-main` and preload |
| `better-sqlite3` 12.11.1   | Native driver rebuilt against the pinned SQLCipher source                                     | MIT          | `desktop-main` only        |
| SQLCipher Community 4.16.0 | Encrypted local SQLite compiled into the native driver                                        | BSD-3-Clause | packaged native module     |

Zod replaces hand-written boundary parsing; it does not execute product logic,
access storage, or receive secrets outside the values being validated. Validation
errors are converted to content-safe code/path pairs and never echo input values.

## Development

| Dependency                               | Purpose                                   | License      |
| ---------------------------------------- | ----------------------------------------- | ------------ |
| TypeScript 6.0.3                         | Strict compilation and project references | Apache-2.0   |
| ESLint 10.7.0 + typescript-eslint 8.63.0 | TypeScript static checks                  | MIT          |
| Prettier 3.9.5                           | Deterministic formatting                  | MIT          |
| markdownlint-cli2 0.23.0                 | Public Markdown checks                    | MIT          |
| `@types/node` 24.13.3                    | Node.js 24 compile-time declarations      | MIT          |
| Vite 8.1.4 + React plugin 6.0.3          | Renderer and sandboxed preload builds     | MIT          |
| React type declarations 19.2             | React compile-time declarations           | MIT          |
| `@electron/packager` 20.0.2              | Assemble the native Alpha candidate       | BSD-2-Clause |
| `node-gyp` 13.0.1                        | Build the pinned Electron native ABI      | MIT          |

Electron exposes no generic renderer bridge. The sandboxed preload bundles a
three-method command/query-shaped allow-list, while main denies permission
requests, untrusted navigation, new windows, and untrusted IPC senders. The
production entry point has a dependency-closed manifest and excludes the
in-memory preview, testkit, fixtures, and test-only smoke code.

## Native compatibility probe

`tools/sqlcipher-native-probe` has a separate lockfile and dependency graph. It
is contributor evidence, not application runtime code and not an accepted
persistence dependency.

| Dependency                 | Purpose                                      | License      |
| -------------------------- | -------------------------------------------- | ------------ |
| SQLCipher Community 4.16.0 | Generate the pinned encrypted SQLite source  | BSD-3-Clause |
| OpenSSL 3.5.7              | Static Windows crypto provider               | Apache-2.0   |
| `better-sqlite3` 12.11.1   | Exercise the generated source under Electron | MIT          |
| Electron 43.1.0            | Execute the native ABI compatibility probe   | MIT          |
| `node-gyp` 13.0.1          | Compile the disposable native binding        | MIT          |

The probe installs npm dependencies without lifecycle scripts, explicitly
installs only the pinned Electron runtime, verifies the OpenSSL release digest,
and uploads only the licensed SQLCipher source artifact for one day. Compiled
binaries, keys, and generated databases are not published.

## Packaged safeStorage probe

`tools/electron-safe-storage-probe` has a separate lockfile and dependency
graph. It packages only a synthetic fixture and is not application runtime code.

| Dependency                  | Purpose                                      | License      |
| --------------------------- | -------------------------------------------- | ------------ |
| Electron 43.1.0             | Exercise packaged Keychain/DPAPI safeStorage | MIT          |
| `@electron/packager` 20.0.2 | Produce native x64 application folders       | BSD-2-Clause |

The probe installs without lifecycle scripts, downloads the exact platform
Electron archive only through a committed SHA-256 allow-list, runs separate
packaged processes plus fail-closed wrapper cases, uploads no artifacts, and
removes its package, synthetic runtime state, and exact probe-only Keychain item.
The hosted macOS job isolates that item in a disposable user Keychain and
restores the prior Keychain configuration. Its ad-hoc macOS and unsigned Windows
packages prove mechanism compatibility only, not production signing or update
continuity.

## Packaged encrypted-store integration probe

`tools/packaged-encrypted-store-probe` has a third separate lockfile and
dependency graph. It composes the two primitive probes inside one synthetic
packaged main process; it is not application runtime code or an accepted
persistence adapter.

| Dependency                  | Purpose                                      | License      |
| --------------------------- | -------------------------------------------- | ------------ |
| SQLCipher Community 4.16.0  | Generate the pinned encrypted SQLite source  | BSD-3-Clause |
| OpenSSL 3.5.7               | Static Windows crypto provider               | Apache-2.0   |
| `better-sqlite3` 12.11.1    | Exercise the packaged raw-key native binding | MIT          |
| Electron 43.1.0             | Compose packaged safeStorage and native ABI  | MIT          |
| `@electron/packager` 20.0.2 | Produce native x64 application folders       | BSD-2-Clause |
| `node-gyp` 13.0.1           | Compile the disposable native binding        | MIT          |

The tool reuses the reviewed target-root-aware SQLCipher patch/build scripts,
installs without lifecycle scripts, verifies source archives by committed
digest, unpacks the native add-on before packaging/signing, uploads no compiled
binary or runtime state, and removes its package, synthetic wrapper/database,
profile, and exact probe-only Keychain item. Its ad-hoc macOS and unsigned
Windows packages prove same-artifact mechanism integration only, not production
signing or update continuity.

The local Alpha has one runtime native module: the reviewed
`better-sqlite3` binding rebuilt from pinned SQLCipher source. It is compiled in
CI, never by an install-time lifecycle script, and is the only file unpacked
from the application ASAR. The packaged gate verifies the Electron archive
digest, native-module digest/count, production dependency closure,
Keychain/DPAPI custody, renderer/preload/IPC boundary, and encrypted relaunch
state on macOS x64 and Windows x64. There is still no telemetry SDK, network
client, model-provider client, or post-install build step. Ad-hoc macOS and
unsigned Windows folders are Alpha evidence, not production signing,
notarization, installer, updater, or distribution continuity.
