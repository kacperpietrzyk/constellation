# Constellation

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-0b7285.svg)](LICENSE)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-c2410c.svg)](#project-status)
[![CI](https://github.com/kacperpietrzyk/constellation/actions/workflows/ci.yml/badge.svg)](https://github.com/kacperpietrzyk/constellation/actions/workflows/ci.yml)

Constellation is an open-source, cross-platform work system built around a
typed graph of projects, tasks, notes, meetings, people, organizations, and
time.

It is designed for two equal operators: a person using a calm desktop interface
and external agents using the documented MCP surface. Both use the same
application commands and queries, see the same authorized fields, and leave the
same audit trail.

## Why Constellation

Most productivity tools optimize either for presenting knowledge or for
operating structured work. Constellation aims to make those two sides part of
one system:

- rich documents remain connected to typed entities;
- relationships are queryable data, not decorative links;
- agent actions are auditable, reversible, and subject to the same rules as UI
  actions;
- integrations preserve source identity and can be retried safely;
- macOS and Windows share one product instead of drifting into separate apps.

## Product boundaries

Constellation deliberately does not rebuild capabilities that mature products
already solve well:

- Jamie remains responsible for meeting capture, transcription, and meeting
  intelligence; Constellation imports the result.
- System calendars remain the calendar source of truth; Constellation reads a
  normalized projection through platform adapters.
- AI models and chat interfaces stay outside the product; MCP is the only agent
  interface. Application or integration APIs are not an alternate agent path.
- The project will not maintain independent native feature stacks for every
  operating system.

## Design principles

1. One graph, multiple surfaces.
2. Desktop and MCP capabilities share one application contract.
3. Every external import is idempotent and observable.
4. Every mutation has an actor, history, and a recovery path.
5. Native code exists only at a narrow operating-system boundary.
6. Product complexity must earn its maintenance cost.

## Project status

Constellation is in **pre-alpha local Alpha work**. There is no distributed
installer yet, and no contract should be considered stable. The repository now
contains a storage-neutral Application Kernel, a restart-safe encrypted local
store, an in-memory Electron developer preview, and a packaged Alpha candidate.
The implemented desktop journey covers Quick Capture to Task, Project outcome
and Task relations, task status/completion, deterministic scoped search,
explainable weekly focus, Capture History, meaningful activity, and previewed
undo. Destinations and open Task or Project contexts share one bounded tab rail
with Back/Forward history and a context-preserving inspector. It can also export
a verified encrypted workspace backup with a separate recovery code, preview a
restore, retain the previous workspace, and reopen the restored logical
identity. The production runtime keeps generated workspace
identity and key custody in the operating-system credential store, has no
plaintext or in-memory fallback, and stops in recovery instead of silently
replacing a missing ready database. If an established workspace cannot open,
the same packaged application presents a recovery-only restore path rather than
requiring a developer tool.

Each durable workspace reports a versioned Data Home descriptor. The
local-only provider says explicitly that its encrypted database is canonical on
this device, identifies the installation without using a hardware fingerprint,
and distinguishes supported portable checkpoints from unsupported remote sync,
attachment transfer, provider quota, and device revocation. The same provider
boundary now also has a self-hosted Hub preview: PostgreSQL coordinates ordered
commands, receipts, checkpoints, revocation, and content-addressed attachments,
while every desktop keeps an encrypted local projection and recoverable command
queue. Backup remains a separate recovery mechanism; neither provider
synchronizes an open database file through a generic cloud folder.

The packaged gate builds the pinned SQLCipher binding as the only unpacked
native module and drives the real window, context-isolated preload, IPC,
Capture-to-Task interaction, encrypted backup/restore, and relaunch on native
macOS arm64, native macOS x64, and Windows x64 runners. No macOS result depends
on Rosetta. The coordinated gate uses two isolated packaged profiles, restores
the same portable workspace on the second device, queues offline work, drops a
response after Hub commit, reconciles by receipt, and verifies the resulting
Task on the other device.
The resulting ad-hoc macOS and unsigned Windows application folders are
verification artifacts, not a signed/notarized release. The Hub is an operator
preview rather than a hosted service. MCP transport, installers, updater,
collaboration-safe sharing, and automatic routing rules beyond the explicit
Capture action remain later work.

The current kernel boundary and implemented subset are documented in
[Application kernel](docs/architecture/application-kernel.md) and
[Local store](docs/architecture/local-store.md). The provider contract and its
current capability limits are documented in
[Data Homes](docs/architecture/data-homes.md).

Operators evaluating multi-device coordination can use the
[self-hosted Hub runbook](docs/self-hosting/hub.md).

The [public roadmap](ROADMAP.md) describes the intended product direction and
the order in which the major outcomes build on one another. It is directional,
not a release-date commitment.

## Development

Use the Node.js version in [`.nvmrc`](.nvmrc), then install the pinned dependency
graph and run the repository gate:

```sh
npm ci --ignore-scripts
npm run check
```

`npm run check` verifies formatting, lint, TypeScript project references, public
Markdown, and the contract/conformance tests. The same command runs in CI on
Linux, macOS, and Windows. CI additionally runs `npm run audit:dependencies`
against the complete locked runtime and development dependency graph.

To launch the interactive in-memory preview, install the pinned Electron binary
and start the desktop development surface:

```sh
npm install
npm run dev:desktop
```

Use the Quick Capture button or `Command/Ctrl+Shift+K`. The preview is
development infrastructure, not a durable local Alpha; closing it clears its
synthetic workspace.

Questions and early product discussion belong in
[GitHub Discussions](https://github.com/kacperpietrzyk/constellation/discussions).
Actionable bugs and scoped proposals belong in
[GitHub Issues](https://github.com/kacperpietrzyk/constellation/issues).

## Contributing

Thoughtful contributions are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

If you find a security issue, do not open a public issue. Follow
[SECURITY.md](SECURITY.md) instead.

## License

Constellation is licensed under the [Apache License 2.0](LICENSE).
