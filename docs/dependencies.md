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

## Native application build

The local Alpha has one runtime native module: the reviewed
`better-sqlite3` binding rebuilt from pinned SQLCipher source. It is compiled in
CI, never by an install-time lifecycle script, and is the only file unpacked
from the application ASAR. The packaged gate verifies the Electron archive
digest, native-module digest/count, production dependency closure,
Keychain/DPAPI custody, renderer/preload/IPC boundary, and encrypted relaunch
state on native macOS arm64, native macOS x64, and Windows x64 runners. Build
scripts live under `scripts/native`; they are application packaging
infrastructure, not technology-selection probes. The Windows binding uses the
pinned static OpenSSL provider, while macOS uses CommonCrypto. Key custody uses
the asynchronous DPAPI provider on Windows and the Keychain provider after app
readiness on macOS. There is still no telemetry SDK, network client,
model-provider client, or post-install build step. Ad-hoc macOS and unsigned
Windows folders are Alpha evidence, not production signing, notarization,
installer, updater, or distribution continuity.
