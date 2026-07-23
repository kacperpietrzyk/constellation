# Constellation

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-0b7285.svg)](LICENSE)
[![Status: desktop alpha](https://img.shields.io/badge/status-desktop%20alpha-2563eb.svg)](#project-status)
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

- rich documents remain connected to typed entities and managed file sources;
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

Constellation `0.1.0` is the first public **desktop Alpha**. The macOS release is
Developer ID signed, notarized, stapled, and published for Apple Silicon and
Intel through [GitHub Releases](https://github.com/kacperpietrzyk/constellation/releases/latest).
Contracts are still allowed to evolve before a stable release. Windows remains
a first-class build and packaged-behavior target, but its unsigned artifacts
are parity evidence rather than a production download until paid Authenticode
credentials are provisioned. The repository contains the storage-neutral
Application Kernel, restart-safe encrypted local storage, the Electron desktop,
local and remote MCP transports, and the self-hosted Hub.
The implemented desktop journey covers Universal Quick Capture for text, URLs,
file references, one managed file or pasted screenshot, and a short voice note
whose bytes enter the encrypted workspace before deterministic processing.
Operating-system dictation remains ordinary text and never stores audio.
Voice notes are limited to two minutes and 25 MB, wait for an explicitly
authorized external MCP agent instead of invoking transcription, and freeze a
per-capture retention choice at recording time. In a Hub-backed workspace, the
exact payload bytes must also pass resumable
digest verification before the Capture is accepted; an unavailable transfer
keeps the encrypted local original ready for retry. The journey also covers a
closed Capture exception vocabulary in Attention, reason-specific retry,
destination, keep-unclassified, dismiss, and verified missing-payload
replacement actions, Project outcome and Task relations,
and a Work destination that connects Areas, Initiatives, Projects, dependencies,
waiting direction, and saved deterministic views without imposing a mandatory
containment tree. The same work-composition commands and query are available to
desktop and MCP operators with Space-scoped authorization,
task status/completion, deterministic scoped search,
explainable weekly focus, Capture History, meaningful activity, and previewed
undo. Destinations and open Task or Project contexts share one bounded tab rail
with Back/Forward history. The context inspector stays out of the layout until
a user deliberately activates an object; it can then be closed, dismissed with
Escape, and resized on wide windows. The application can also export a verified
encrypted workspace backup with a separate recovery code, preview a restore,
retain the previous workspace, and reopen the restored logical identity. The
production runtime keeps generated workspace
identity and key custody in the operating-system credential store, has no
plaintext or in-memory fallback, and stops in recovery instead of silently
replacing a missing ready database. If an established workspace cannot open,
the same packaged application presents a recovery-only restore path rather than
requiring a developer tool.

Managed files now remain one Capture-backed, encrypted original when attached
to a rich document, Task, or comment. Each consumer stores only a bounded,
versioned Knowledge Source relation; query projections expose safe metadata and
honest device availability, unlink removes only that relation, and a coordinated
device restores bytes only after the Hub response passes exact length and digest
verification.

The desktop can create and switch independent workspaces without sharing their
database, key, Data Home, Hub credential, or local MCP endpoint. A personal
Cockpit may read a bounded focus summary from locally authorized workspace
projections, but it never joins their records. Settings also accepts a strict,
bounded starter-workspace JSON manifest. Selecting a file first shows a
main-process-validated, read-only count preview; a separate confirmation is
required before any command runs. The example at
[`docs/examples/starter-workspace.json`](docs/examples/starter-workspace.json)
creates Areas, Initiatives, Projects, Tasks, and explicit links through the same
idempotent, audited commands used by the UI and MCP. It includes one Project
imported without a written outcome, because an Area's responsibility and a
Project's or Initiative's intended outcome are optional at creation: a record
that never received one is marked as needing review and stays completable
instead of carrying invented prose.

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
typed Capture processing, encrypted backup/restore, and relaunch on native
macOS arm64, native macOS x64, and Windows x64 runners. No macOS result depends
on Rosetta. The coordinated gate uses three isolated packaged profiles: two
devices for one owner plus a separately scoped second human. It restores the
owner's portable workspace on another device, proves that the second human
never receives a private-Space sentinel, exercises offline work and a view-only
downgrade, drops a response after Hub commit, reconciles by receipt, and verifies
revocation-driven local projection removal across relaunch. The same native
package opens a document for the owner and scoped member, converges edits in
both directions, queues an edit while the Hub is stopped, rejoins after restart,
restores a named revision, and turns the editor read-only after a live access
downgrade. It also proves that a converged document phrase remains searchable
after named restore and packaged relaunch.

The delivered collaboration foundation adds versioned human membership and
Space grants without coupling Workspace role to data scope. Every command and
query reauthorizes against the current policy; direct records, relations, search,
counts, activity, scoped exports, and Hub-delivered local projections share the
same Space filter. Revocation rejects queued offline work and atomically removes
the affected client's coordinated records, local full-text index, command
journal, and outbox. The desktop preview includes an accessible
access-management surface for adding a member or guest,
choosing view/comment/edit access, and revoking membership.

Shared Tasks now support one versioned responsible member or guest. Editors can
assign, reassign, or clear responsibility from the Task surface; candidates are
limited to active people who can view that Space. Exact versions reject stale
offline changes, every mutation is attributed and audited, and revoked people
or people who lose Space access remain understandable without leaking their
principal identity. The same assignment projection survives encrypted SQLite
restart and is filtered by the Hub before it reaches another device.

Tasks and Projects now keep attributed, versioned comment threads in their own
context. A Commenter can add replies, mention eligible people, edit their own
text with retained revision history, and resolve their own root thread without
receiving permission to mutate work records; an Editor can also resolve or
reopen a thread. Mentions and assignments create deduplicated, durable in-app
attention items for the exact recipient and record. The main process owns a
foreground-suppressing system-notification adapter for urgent scoped signals;
routine collaboration stays in the in-app Attention surface. Comments,
recipient-only attention, audit, SQLite restart, scoped Hub delivery, and
revocation purge share the same authorization boundary.

Native documents now use a replaceable Yjs collaboration adapter with a
self-hosted Hocuspocus gateway. The editor preserves encrypted local Yjs state
before network delivery, queues coordinated updates while offline, and rejoins
the same document after Hub recovery. PostgreSQL stores bounded opaque document
state and named revisions; restoring a revision is a new attributed
collaborative change rather than a destructive history rewrite. The renderer
receives only a five-minute room token. The durable device credential remains
in Electron main, and every connection, reconnect, inbound update, downgrade,
and revision operation reauthorizes current Workspace membership and Space
access. Local-only workspaces use the same editor and encrypted store without
requiring a Hub.

The writing surface now stores versioned structured content (`rich-v1`) in the
same Yjs document and exposes paragraphs, headings, lists, emphasis, links, and
code blocks through an accessible Tiptap editor. Existing `plain-v1` documents
migrate once without discarding their text. Current clients negotiate the
document format with the Hub; an older client is made read-only instead of
being allowed to overwrite rich structure it cannot understand. Rich named
revisions restore as new collaborative changes and the plain-text projection
remains available to evidence snapshots and bounded text operations. The editor
also inserts typed inline references to Tasks, Projects, People, Organizations,
and Meetings from the same Space. Each reference stores stable identity rather
than a copied label; the current label is resolved when read. Permission-safe
backlink queries show the exact visible source documents in record inspectors
and through MCP, without leaking hidden records or counts. Global search now
also finds phrases inside authorized Note, Document, and Deliverable bodies,
labels the matched field as `Treść`, and returns a bounded local snippet. The
rebuildable encrypted projection follows collaboration and revision restore,
survives relaunch, and is purged with access loss. Granted local and remote MCP
agents now read the same bounded rich blocks and entity links, replace them only
against a current state-vector digest, and restore the returned recovery
revision as a new attributed collaborative change. The v5 exchange format
carries current structured content, its body projection, and remappable Task or
Project links without exporting revision history or live awareness.

The first knowledge-to-deliverable journey now separates preserved Sources,
evolving Notes or Documents, and evidence-backed Deliverables. A named version
freezes one collaborative revision, a content snapshot, milestone meaning, and
the exact source and Note versions used at that moment. Later source changes do
not rewrite a delivered result; the Knowledge surface marks the evidence as
changed, keeps the frozen state inspectable, and restores revisions only as new
collaborative changes. The same commands and permission-safe queries are
available to desktop and MCP, survive encrypted SQLite restart, and pass through
Space-scoped Hub projections. The boundary and current limits are documented in
[Knowledge evidence and deliverables](docs/architecture/knowledge-and-deliverables.md).

The same graph now supports a strategic-depth thread from Organization and
Person through Opportunity, Offer, and Project. Renewals create one
deduplicated follow-up Task per cycle; evidence-backed relationship facts carry
an explicit freshness horizon; superseding a Decision preserves the prior
record and opens a bounded consequence review. Areas, recurring Task
occurrences, reversible Project closure, and a finite Knowledge Radar retain
history instead of manufacturing a parallel workflow. Desktop and MCP use the
same versioned commands, and the records participate in deterministic search,
meaningful activity, scoped export, encrypted restart, and Hub projections.
See [Relationships and strategic depth](docs/architecture/relationships-and-strategic-depth.md).

An opened Project now reads its authorized graph context as one page: client
Organizations, routed meetings, rich documents that reference it, linked
Decisions, and related Tasks come from one bounded operational-overview query
and open their exact source surfaces. The Project also owns a rich collaborative
body keyed directly by its typed identity, not by a hidden duplicate Document.
The desktop and local/remote MCP edit the same Yjs state with explicit Space,
grant, state-vector, attribution, revision, and recovery rules. Project body
text participates in its existing deterministic search result, exchange v6
round-trips structured content and remapped entity references, and revocation
purges local state and rebuildable projections.

Local-only workspaces now expose a versioned MCP server through the same
Application Kernel used by the desktop. The Access surface creates a distinct
agent principal with an independently selected capability preset, Space scope,
expiry, and device-local credential. Every call reauthorizes current policy;
commands retain idempotency and expected-version conflicts, while audit receipts
record the agent, external host run, correlation, and optional checkpoint.
Checkpoint revert applies ordinary compensating commands and refuses to erase
incompatible later work. Query results label record content as untrusted
evidence so imported text never becomes an instruction to the host.
Managed file and screenshot bytes remain outside ordinary tool results. An
authorized Capture-payload resource reads them in bounded chunks and returns a
blob only after full length and SHA-256 verification at the MCP boundary.

The packaged Alpha contains a stdio adapter tested with Codex CLI and Claude
Code. Rotation invalidates the previous credential immediately, revocation
also removes the descriptor, and concurrent full-access agents remain isolated
by principal and grant. This local surface remains intentionally limited to a
local-only Data Home. Setup and security details are in
[Local MCP agent access](docs/local-mcp-agents.md).

Coordinated Workspaces now expose the same MCP contract over authenticated
stateless Streamable HTTP on the self-hosted Hub. Remote principals, credential
digests, host runs, receipts, checkpoints, revocation, and independent
cross-Workspace authorities stay in Hub-owned PostgreSQL control state instead
of device projections. The desktop Access surface creates, rotates, and revokes
a distinct remote grant, writes its bearer token only to an owner-readable
descriptor, and keeps the renderer token-free. Every call reauthorizes current
Workspace, Space, capability, expiry, and provider policy; administrative
capabilities cannot be delegated. Setup and recovery details are in
[Remote MCP agent access](docs/remote-mcp-agents.md).

The desktop now also contains the first meeting-to-work loop. On macOS, a
narrow EventKit helper requests full calendar access and returns normalized
upcoming events; Windows and unsupported environments show an explicit provider
state instead of pretending that calendar data is current. The Meetings
surface builds factual preparation only from authorized graph evidence. It can
store a personal or workspace Jamie API key in operating-system credential
protection, import the last 90 days with stable meeting and task identity, and
preserve local edits when Jamie later corrects a result. Each imported action
has its own version and lifecycle. An imported meeting can then be routed to a
project and an organization, its task and follow-up items promoted into real
Tasks, and its participants linked to People. Those decisions are explicit
commands rather than import side effects: only participants carrying an exact
email address are linked or created, participants known by name alone wait for a
decision instead of being guessed at, and a repeated Jamie delivery never
duplicates a meeting, a person, or a task. Creating or changing a
Constellation-owned calendar block always requires an exact, five-minute,
single-use preview. The same consent boundary governs deletion: the Task offers
a distinct graph-only “stop tracking” action and an exact provider deletion,
and stale EventKit content is refused before either side is misrepresented. The
normalized imported meeting is also published through the existing Hub
command/receipt feed, so another authorized device receives the same stable
meeting projection without a meeting-specific synchronization path. The
boundary and current limitations are documented in
[Meetings and calendar](docs/architecture/meetings-and-calendar.md).

The distribution gate produces a DMG plus update ZIP on macOS and a
per-user NSIS installer on Windows. Hosted drills install the application,
reopen the encrypted workspace through a compatible update and rollback, and
remove application files while preserving workspace data. The public `0.1.0`
macOS artifacts pass the separate fail-closed Developer ID signing,
notarization, stapling, and Gatekeeper workflow; the in-app updater requires
explicit check, download, and restart actions. Windows mechanism artifacts stay
unsigned parity evidence and are not attached as a production release. The Hub
is still an operator preview rather than a hosted service. The distribution
boundary and current limitations are documented in
[Desktop distribution](docs/architecture/desktop-distribution.md).

The current kernel boundary and implemented subset are documented in
[Application kernel](docs/architecture/application-kernel.md) and
[Local store](docs/architecture/local-store.md). The provider contract and its
current capability limits are documented in
[Data Homes](docs/architecture/data-homes.md).

External-host setup is documented in
[Local MCP agent access](docs/local-mcp-agents.md) and
[Remote MCP agent access](docs/remote-mcp-agents.md).

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

`npm run build`, `npm test`, and `npm run check` are the unattended local
development gates. The packaged smoke tests are a separate native integration
gate because the macOS application exercises Electron `safeStorage`. On macOS,
those scripts stop before launching Electron unless CI has prepared a disposable
Keychain or a developer has explicitly opted into the isolated local flow. This
prevents an unattended agent run from blocking on a system Keychain prompt. The
full packaged macOS and Windows matrix remains required in GitHub Actions.

A deliberate local macOS packaged run must use the isolated flow below. The
subshell restores the previous Keychain configuration even when a smoke test
fails:

```sh
(
  set -eu
  export CONSTELLATION_ALLOW_LOCAL_KEYCHAIN_TEST=true
  export CONSTELLATION_KEYCHAIN_TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/constellation-keychain.XXXXXX")"
  trap 'node scripts/desktop/restore-ci-macos-keychain.mjs; rm -rf "$CONSTELLATION_KEYCHAIN_TEST_ROOT"' EXIT
  node scripts/desktop/prepare-ci-macos-keychain.mjs
  npm run package:alpha
  npm run test:alpha:packaged
  npm run test:hub:packaged
)
```

To launch the interactive in-memory preview, install the pinned Electron binary
and start the desktop development surface:

```sh
npm install
npm run dev:desktop
```

Use the Quick Capture button or `Command/Ctrl+Shift+K`. The preview is
development infrastructure, not a durable local Alpha. Text becomes a Task;
URLs, selected file references, managed files, and screenshots become knowledge
sources; exact duplicates remain preserved and appear in Attention for an
explicit destination choice. Short voice notes remain in Capture History while
awaiting an external transcript and do not create Attention debt merely because
no agent is running. An authorized MCP agent can write a versioned transcript
only for the exact audio digest; Constellation records its principal and host
run but never invokes transcription. Audio is deleted by default only after the
transcript is durable and custody verifies removal, or retained by an explicit
workspace/per-capture policy. Managed payloads are bounded to 25 MB, retain no
local path in the Capture record, and are included in encrypted workspace
backup and restore while retained.
Closing the preview clears its synthetic workspace.

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
