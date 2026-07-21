# Knowledge evidence and deliverables

Constellation keeps sources, evolving writing, and delivered states distinct.
The first implemented knowledge journey turns a preserved source into a Note or
Document, connects explicit evidence, and freezes a named Deliverable version
without rewriting its provenance later.

## Record model

- A **Knowledge Source** stores stable identity, kind, title, optional canonical
  URL and excerpt, availability, observation time, version, and attribution.
- A **Native Document** has one role: `note`, `document`, or `deliverable`. Its
  collaborative body remains in the existing replaceable Yjs adapter. Current
  bodies use the versioned `rich-v1` Yjs format; non-empty legacy `plain-v1`
  bodies migrate once and retain a verification digest.
- A document's current evidence set contains explicit source and Note IDs. It is
  editable and versioned like other record state.
- A **Named Document Version** is an immutable milestone such as finalized,
  delivered, approved, or published. It binds a name, one realtime document
  revision, a content snapshot, and the exact versions and titles of every
  source and Note used at that moment.

Changing a source or Note never rewrites a named version. Queries compare its
frozen evidence versions with current records and expose a factual changed flag.
The desktop can therefore show that a delivered result remains intact while one
of its inputs has since changed.

## Shared application boundary

Desktop and MCP use the same commands:

- `knowledge.sourceCreate` and `knowledge.sourceUpdate`;
- `knowledge.documentSetEvidence`;
- `knowledge.namedVersionCreate` and `knowledge.namedVersionVoid`.

They use `knowledge.list` for a Space-scoped library and
`knowledge.documentContext` for one authorized evidence/version view. Global
search includes sources and Note, Document, and Deliverable titles without
adding generated answers. Body indexing remains a subsequent
connected-document slice.

Every mutation requires its declared capability, current Workspace and Space
access, exact expected versions, idempotency, attribution, audit, and one unit
of work. Source updates, evidence changes, and named-version creation produce
ordinary compensation descriptors. Undo restores prior source/evidence state or
voids the created milestone only when no later incompatible change exists.

## Persistence and coordination

Knowledge sources and named versions are stored in encrypted SQLite beside
document metadata and survive restart. Coordinated snapshots carry them through
the existing Hub projection contract. Hub scoping filters sources by Space and
named versions by both Space and their authorized document, so search, counts,
exports, and device projections cannot reveal hidden knowledge.

Realtime document bodies are still synchronized only by the dedicated
Yjs/Hocuspocus adapter. Record synchronization does not become a second CRDT,
and a generic cloud-synced database file is never treated as coordination. The
adapter owns schema inspection, plaintext projection, deterministic
`plain-v1`-to-`rich-v1` migration, checkpoints, and rich revision restore.
Session negotiation refuses a writer that does not support the stored format;
the client can still see an explicit upgrade-required state without being able
to flatten newer structure.

## Recovery behavior

- A failed named-version association leaves the already-created realtime
  revision safe and can be retried.
- Restoring a realtime revision creates a new collaborative change; it does not
  erase later history or mutate the named version.
- A source becoming unavailable preserves the frozen evidence reference.
- Source changes create deduplicated in-app attention for the owner of an
  affected document. Creating a new named version dismisses that stale signal.

## Current limits

This slice does not yet implement approvals, external Artifact transfer,
automatic citation extraction, source freshness schedules, inline typed-record
links and backlinks, document-body search, structured remote MCP editing, or
generic document attachments. Those outcomes must extend the same typed
records, authorization boundary, and deterministic query model rather than add
a second document system or an embedded reasoning layer.
