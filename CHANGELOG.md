# Changelog

All notable changes to Constellation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/) once public
releases begin.

## [Unreleased]

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
