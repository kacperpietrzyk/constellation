# Constellation roadmap

Constellation is being built as a local-first, cross-platform work system where
people and external agents operate the same typed work graph through the same
rules. This roadmap describes product direction, not release dates or a promise
that every item will ship unchanged.

## How to read this roadmap

- **Delivered foundation** is implemented in the repository and has passed its
  stated verification gates.
- **Current** is the next product outcome we are actively proving.
- **Next** depends on the current foundation and is ordered by product and
  architectural dependency.
- **Later** is part of the intended direction but is not yet scheduled.

We prefer thin, usable end-to-end slices over building broad subsystems in
isolation. A capability moves forward only when its recovery, privacy,
accessibility, and cross-platform behavior are credible too.

## Delivered foundation — local Alpha

The repository contains the first durable desktop journey:

- encrypted local workspace storage with restart and interruption recovery;
- Quick Capture from original text to a traceable Task;
- Projects, Task relations, status changes, deterministic search, and a weekly
  cockpit projection;
- Capture History, meaningful activity, audit receipts, and previewed undo;
- a shared application command/query boundary behind the desktop UI;
- packaged verification on macOS and Windows runners.

This is a pre-alpha engineering foundation, not a distributed desktop release.

## Current — a complete personal local-first workspace

Turn the initial journey into a coherent application that can be used for real
personal work without depending on a server:

- complete the stable desktop shell, navigation, record context, and recovery
  experience;
- expand capture into review-by-exception handling, deterministic routing, and
  durable support for links and files before broader input types;
- deepen Tasks, Projects, Areas, Initiatives, relations, saved views, and the
  weekly cockpit without losing the common command/query model;
- make local search, export, backup, restore, workspace lifecycle, and key
  recovery trustworthy;
- finish accessibility, platform behavior, and the release-quality Visual Atlas
  contract for every changed surface.

## Next — portable Data Homes and multi-device continuity

Give each workspace an explicit data home while preserving offline work and
user ownership:

- define and certify the synchronization-provider contract;
- ship local-only export, restore, and migration guarantees;
- prove a self-hosted, cross-platform coordinating Hub so two devices stay
  current without requiring a desktop machine to remain online;
- add recoverable outbox, change-feed, attachment, conflict, revocation, and
  device-loss behavior;
- keep local databases as device-local stores rather than synchronizing an open
  database file through a generic cloud folder.

Core use and cross-device synchronization will not require a paid
Constellation-hosted backend.

## Next — collaboration-safe workspaces

Build collaboration on the same identity and authorization boundaries rather
than adding it as a separate product:

- members, guests, Spaces, assignments, comments, and permission-safe views;
- authorization across records, relations, search, counts, notifications,
  exports, and local caches;
- explicit version conflicts, revocation, offline reconciliation, and audit;
- simultaneous editing of native documents through a dedicated, proven, and
  replaceable collaboration adapter.

## Next — external agents through MCP

Expose the application commands and queries as the only agent interface:

- versioned local MCP tools with scoped grants and agent identity;
- the same authorization, attribution, idempotency, conflict, and audit rules as
  desktop actions;
- structured evidence, receipts, checkpoints, and scoped revert for concurrent
  agent work;
- interoperability testing with multiple external agent hosts;
- optional remote operation only through an explicitly configured,
  always-reachable authorized endpoint.

Constellation will not embed a chat interface, model runtime, AI orchestrator,
or bespoke retrieval stack.

## Later — meetings, calendar, and connected work

- read calendar context through platform-neutral adapters, beginning with
  EventKit on macOS;
- create factual meeting context from authorized Constellation records;
- import normalized Jamie results idempotently while Jamie continues to own
  recording, transcription, and meeting intelligence;
- turn commitments, decisions, and follow-ups into independently managed work;
- require explicit consent for every concrete calendar write or previewed batch.

## Later — knowledge, relationships, and strategic depth

- sources, notes, native documents, artifacts, named versions, approvals, and
  evidence-backed deliverables;
- people, organizations, opportunities, offers, renewals, and relationship
  history;
- recurring responsibilities, project closure, decision replacement, and impact
  review;
- richer strategic orientation across goals, initiatives, projects, and daily
  work without generated answers inside the application.

## Later — distribution and ecosystem

- signed and notarized macOS distribution;
- signed Windows installer, safe updates, rollback, and clean uninstall;
- tested backup, restore, provider migration, and device-revocation drills;
- documented stable extension points where the underlying contracts are ready;
- a focused mobile capture and review companion using the same product truth,
  developed as a separate client rather than another independent feature stack.

## What will not change silently

Major changes to product behavior, privacy, recurring cost, licensing, or the
long-term scope will be discussed publicly before this roadmap is rewritten.
Implementation order may change when evidence exposes a safer or simpler path.

See the [README](README.md) for the current verified repository status and
[GitHub Discussions](https://github.com/kacperpietrzyk/constellation/discussions)
for product discussion.
