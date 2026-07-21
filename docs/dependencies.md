# Dependency inventory

Constellation pins direct dependencies and commits the npm lockfile. CI installs
with `npm ci --ignore-scripts`, runs `npm audit`, and fails the ordinary check
when any locked package lacks a declared license or uses a license expression
outside the reviewed allow-list. Workspace links inherit the license from their
own locked manifest entry rather than bypassing the gate.

## Runtime

| Dependency                 | Purpose                                                                                        | License      | Boundary                   |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| `zod` 4.4.3                | Strict runtime command, query, context, and outcome validation with inferred TypeScript types  | MIT          | `contracts` only           |
| React 19.2.7               | Render the shared desktop product surface                                                      | MIT          | `desktop-ui` only          |
| React DOM 19.2.7           | Mount the React renderer into the Electron document                                            | MIT          | `desktop-ui` only          |
| Electron 43.1.0            | Secure desktop main/preload boundary for the preview and local Alpha                           | MIT          | `desktop-main` and preload |
| `electron-updater` 6.8.9   | Manual signed-channel update check, verified download, and explicit restart installation       | MIT          | `desktop-main` only        |
| `better-sqlite3` 12.11.1   | Native driver rebuilt against the pinned SQLCipher source                                      | MIT          | `desktop-main` only        |
| SQLCipher Community 4.16.0 | Encrypted local SQLite compiled into the native driver                                         | BSD-3-Clause | packaged native module     |
| PostgreSQL client 8.22.0   | Hub persistence, migrations, locking, and bounded binary document state                        | MIT          | `hub` only                 |
| Yjs 13.6.31                | Replaceable convergent native-document state and named checkpoints                             | MIT          | document adapter           |
| Hocuspocus 4.4.0           | Self-hosted authenticated Yjs WebSocket gateway and persistence hooks                          | MIT          | `hub` and document UI      |
| Tiptap 3.28.0              | Headless ProseMirror rich-document editing and bounded Yjs/JSON conversion                     | MIT          | document UI and adapter    |
| ProseMirror model 1.25.11  | Strict node/mark schema used to translate the agent document contract into Yjs                 | MIT          | document adapter           |
| `crossws` 0.4.4            | Mount the single bounded realtime WebSocket route on the existing Hub server                   | MIT          | `hub` only                 |
| MCP TypeScript SDK 1.29.0  | Stable v1 stdio and Streamable HTTP framing, tool/resource negotiation, and host compatibility | MIT          | MCP adapter and Hub        |

Zod replaces hand-written boundary parsing; it does not execute product logic,
access storage, or receive secrets outside the values being validated. Validation
errors are converted to content-safe code/path pairs and never echo input values.

## Development

| Dependency                               | Purpose                                                               | License      |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------ |
| TypeScript 6.0.3                         | Strict compilation and project references                             | Apache-2.0   |
| ESLint 10.7.0 + typescript-eslint 8.63.0 | TypeScript static checks                                              | MIT          |
| Prettier 3.9.5                           | Deterministic formatting                                              | MIT          |
| markdownlint-cli2 0.23.1                 | Public Markdown checks                                                | MIT          |
| `@types/node` 24.13.3                    | Node.js 24 compile-time declarations                                  | MIT          |
| Vite 8.1.4 + React plugin 6.0.3          | Renderer and sandboxed preload builds                                 | MIT          |
| React type declarations 19.2             | React compile-time declarations                                       | MIT          |
| `@electron/packager` 20.0.2              | Assemble the native Alpha candidate                                   | BSD-2-Clause |
| `electron-builder` 26.15.3               | Build DMG/ZIP, NSIS, update metadata, signing, and notarization gates | MIT          |
| `node-gyp` 13.0.1                        | Build the pinned Electron native ABI                                  | MIT          |

Electron exposes no generic renderer bridge. The sandboxed preload bundles an
explicit semantic allow-list for application commands, queries, recovery, Data
Home, Attention routing, and document sessions/revisions. Document routes accept
bounded IDs and binary updates; they never expose a database handle, path, key,
Hub authorization context, or durable device credential. Main denies permission
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
readiness on macOS. Yjs and `lib0` are packed inside the ASAR and add no native
module. Hocuspocus, `crossws`, and the PostgreSQL client run in the self-hosted
Hub and are not shipped as privileged renderer code. There is still no
telemetry SDK, model-provider client, or post-install build step.
`electron-updater` is the only desktop release network client; it remains
disabled in developer and mechanism-only builds and never enters the renderer.
Ad-hoc macOS and unsigned Windows installers are Alpha evidence, not a
production release.

Every desktop package also carries an external `resources/licenses` directory.
It contains Constellation's Apache-2.0 license, a deterministic notice bundle
for the complete external desktop runtime dependency closure, and the pinned
SQLCipher license. Windows packages additionally include the license for the
statically linked OpenSSL build. Packaging fails closed when a dependency has
no reviewable license notice or when a required native-component license is
missing; the packaged macOS and Windows journey verifies the exact file set.
Electron's own license and Chromium notice remain alongside these files in the
standard Electron package root.
