# Changelog

All notable changes to Constellation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/) once public
releases begin.

## [Unreleased]

## [0.1.3] - 2026-07-24

Four defects an external MCP agent reported against 0.1.2, and two the work
uncovered, all of the same shape: one answer standing for several causes, with
no way to tell them apart.

### Added

- `agent.grantSetScope` re-scopes an issued agent grant in place. A grant
  authorizes against the capability scope frozen when it was issued, so a
  release that widened a preset never reached an agent already connected, and
  there was no lever to change it. A person with access management can now
  restate the scope — widening or narrowing — with an audit receipt and a
  version check; the credential, the descriptor and the connection are
  untouched, and the agent's next call is authorized against the new scope
  without reconnecting. It is deliberately uncompensated, so reverting a
  checkpoint cannot widen a scope a person narrowed, and it is administrative
  and human-only, so no agent can widen itself.

- `constellation://v1/capabilities` reports `grant.scopeStatus`, and names the
  capabilities in `grant.missingFromPreset` when the grant's preset carries
  more than the grant does. Every staleness check the previous release added
  reports "current" in this situation, because the build is current — it is the
  grant that is a release behind. The desktop shows the same state on the grant
  row and offers the single action that closes it.

- Every operation in the catalog states the `requiredCapability` a grant must
  hold for it, which is not always the operation's own name:
  `capture.writeTranscript` is authorized by `capture.transcriptWrite`, and the
  two checkpoint operations by `agent.checkpoint.create` and
  `agent.checkpoint.previewRevert`. The bridge worked and was covered end to
  end on both transports; nothing published it, so it could only be inferred.

### Changed

- `authorization.denied` now states one thing: the grant does not carry the
  capability the command needs. A target that does not exist, a target in a
  Space the caller cannot reach, and a caller with no membership all report
  `command.precondition_failed` instead. Previously one code covered all four,
  so a destructive command could not be probed without creating a real record
  to find out what the error meant. The three non-capability refusals stay
  deliberately indistinguishable: separating them would reveal whether an id
  belongs to a record the caller may not see. Queries are unchanged for now and
  still answer `authorization.denied` for an out-of-scope read. The desktop's
  copy for a rejected command widened accordingly — a refusal that used to read
  as a missing permission now also covers a record out of reach.

- An unexpected fault inside the local MCP runtime is reported as `rejected`
  with `mcp.runtime_fault` and handed to the desktop, instead of being reported
  as `retryable` with `mcp.runtime_unavailable` and discarded. Every throw was
  previously indistinguishable from a transient outage, so a defect that
  reproduces on every call read as something worth waiting out, and the error
  itself survived nowhere. `mcp.runtime_unavailable` now means what it says: a
  unit of work that did not commit.

### Fixed

- A checkpoint revert reported success while compensating nothing. A command
  joins a checkpoint only when its own envelope carries `checkpointId`, but the
  published guidance never said so, so a slice written after
  `agent.checkpointCreate` — same run, same grant — stayed outside it. The
  revert then answered `agent.checkpoint_reverted` with no outcomes and
  consumed the checkpoint, so the honest recovery path was gone before anyone
  noticed. `agent.checkpointPreviewRevert` now answers `available: false` with
  `unavailableReason: "empty"`, the revert is rejected with
  `agent.checkpoint_revert_empty` and leaves the checkpoint open, and both the
  catalog guidance and the agent documentation state how a command joins a
  checkpoint.

- The delegation partition is enforced where grants are minted, not only on the
  wire. `runtime` and `administrative` capabilities are not delegable to any
  agent (ADR-046), but only the Hub checked; the local kernel accepted any
  capability its schema parsed, so a locally minted grant could carry
  administrative authority. Both mint paths now derive the permitted set from
  the same partition.

- An exception raised while authenticating a local MCP request escaped into the
  socket handler instead of being answered, leaving the caller with no response
  at all.

## [0.1.2] - 2026-07-24

### Added

- Removal for every entity an agent or a person can create — organization,
  person, opportunity, offer, relationship fact, decision, area, initiative,
  project, document and knowledge source. Removal is a soft delete that keeps
  history and audit, refuses while another record still points at the one being
  removed, and is itself revertable. The creates now record compensation too, so
  a checkpoint containing one can be reverted; the desktop inspector offers the
  same removal, naming what blocks it before the click. Renewals are resolved
  rather than removed: creating one also raises a follow-up Task and an
  attention signal that a record-level removal would strand.

- `constellation://v1/capabilities` and the operations catalog name the build
  that produced them: the application version plus a contract fingerprint from
  the desktop host and from the MCP server process. When a long-lived MCP
  server process outlives the application build that generated its schemas, the
  two disagree and the response says so, instead of leaving a client to
  correlate process start times against the app bundle.

### Fixed

- The desktop UI re-reads a workspace an external MCP agent has written to,
  instead of showing the state it opened with until the application is
  restarted. A correct agent write no longer reads as a missing one, and
  "check it in the UI" is a valid verification step again.

## [0.1.1] - 2026-07-23

### Added

- `project.create` accepts an optional client-supplied `projectId`, mirroring
  `initiative.create`, so a project can be forward-referenced inside the same
  MCP batch instead of requiring an extra round trip.
- Compensation (scoped revert / `command.undo`) for `task.create` and
  `savedView.create`, so an agent checkpoint containing them can be reverted
  cleanly; `area.updateResponsibility` and `initiative.updateOutcome` commands
  to fill in a narrative that was left blank at creation.
- Per-operation revertability in the `constellation://v1/operations` catalog and
  a typed `run` envelope schema on every MCP tool, so an external integrator can
  size safe work and satisfy required inputs without a failed probing call.

### Changed

- Project, Area, and Initiative narratives (`intendedOutcome` / `responsibility`)
  are optional at creation; a record left without one is surfaced as
  needs-review rather than forcing the importer to fabricate prose.
- Checkpoint revert now distinguishes an uncompensable command, a genuine
  later-work conflict, and an already-reverted checkpoint, and names the
  commands that blocked it, instead of reporting every case as a conflict.

### Fixed

- `agent.checkpointCreate` reports a `runId` that does not match the run as a
  validation precondition instead of `authorization.denied`.
- The published `command.batch` envelope schema now declares `commands` as a
  real property, so a strict client generated from the catalog accepts valid
  batches.
- Unified the recovery/undo `unavailableReason` vocabulary into a single shared
  schema and corrected the idempotency and recovery guidance and the
  capability-to-operation alias for checkpoint preview-revert.

## [0.1.0] - 2026-07-22

### Added

- First public signed, notarized, and stapled macOS desktop Alpha for Apple
  Silicon and Intel, with explicit update, compatible rollback, backup/restore,
  and data-preserving uninstall gates. Windows remains packaged parity evidence
  until production signing is provisioned.
- Deterministic read-only formula sums and direct-subtask count/sum rollups for
  typed Task fields, evaluated through the same permission-safe query boundary.
- Explicit EventKit deletion for Constellation-owned Task blocks through a
  fresh, exact, expiring, single-use consent preview, with stale revision and
  partial provider/graph recovery behavior.

- Versioned local MCP tools and capability resource over the shared Application
  Kernel, with a production-bundled stdio adapter verified in Codex CLI and
  Claude Code.
- Device-local agent principals and grants with independent capability and
  Space scopes, expiry, credential rotation/revocation, durable run attribution,
  checkpoints, structured handoff, and scoped revert.
- An accessible desktop agent-access surface plus prompt-injection evidence
  labels and concurrency coverage for multiple full-access hosts.

- Self-hosted multi-device Hub preview with PostgreSQL coordination, one-use
  device enrollment, ordered checkpoints, command receipts, revocation, and the
  same application kernel used by the desktop.
- Encrypted coordinated desktop projections with a durable command journal,
  automatic retry/backoff, explicit queued/offline/conflict/unknown-effect
  states, and receipt-first reconciliation after response loss.
- Resumable content-addressed attachment transfer with bounded chunks, atomic
  SHA-256 publication, byte ranges, and interrupted-publication recovery.
- Self-hosted container, schema migration, health/readiness, metadata-only
  request logs, operator backup/restore/upgrade guidance, and automated
  PostgreSQL plus packaged two-device gates.

- Initial open-source repository foundation and community files.
- Storage-neutral TypeScript application-kernel scaffold with strict runtime
  contracts for local workspace bootstrap, rename, text capture, capture history,
  and audit receipt queries.
- In-memory reference adapter and cross-platform conformance tests for
  authorization, idempotency, expected versions, pagination, redaction, and
  atomic record/event/audit/idempotency/outbox behavior.
- Storage-neutral Capture-to-Task routing that preserves the original Capture,
  creates one canonical standalone Task under a versioned default status, and
  exposes permission-safe Capture History and Task list projections.
- Conformance coverage for routing replay, grant revocation, credential
  rotation, stale and double-route conflicts, typed cursors, actual freshness,
  content-safe technical records, and atomic rollback at every routing boundary.
- Linux, macOS, and Windows CI running the repository-wide quality gate.

### Changed

- Clarified that MCP is the only external-agent interface and that calendar
  writes remain consent-gated per concrete Constellation-owned change or batch.
