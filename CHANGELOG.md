# Changelog

All notable changes to Constellation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/) once public
releases begin.

## [Unreleased]

### Added

- Initial open-source repository foundation and community files.
- Storage-neutral TypeScript application-kernel scaffold with strict runtime
  contracts for local workspace bootstrap, rename, text capture, capture history,
  and audit receipt queries.
- In-memory reference adapter and cross-platform conformance tests for
  authorization, idempotency, expected versions, pagination, redaction, and
  atomic record/event/audit/idempotency/outbox behavior.
- Linux, macOS, and Windows CI running the repository-wide quality gate.

### Changed

- Clarified that MCP is the only external-agent interface and that calendar
  writes remain consent-gated per concrete Constellation-owned change or batch.
