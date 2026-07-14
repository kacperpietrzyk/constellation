# Changelog

All notable changes to Constellation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/) once public
releases begin.

## [Unreleased]

### Added

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
