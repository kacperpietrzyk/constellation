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
adding generated answers. It also finds phrases in authorized document bodies
through the same `search.global` query, labels the match as `body`, and returns
only a bounded local snippet.

`document.linkCandidates` and `document.backlinks` are the shared read boundary
for typed inline references. Candidate lookup is bounded to the document's
authorized Space. Backlink lookup authorizes both the current target and each
source document independently. A rich reference persists only its closed kind
and stable ID; its current label is resolved from the typed record rather than
copied into document content.

External agents can read, replace, and restore the same versioned rich block
tree through local or remote MCP. Writes require the state-vector digest from a
fresh read, reject unknown structure and unauthorized entity targets, and save
the pre-write rich state as the returned recovery revision. Restore is a new
collaborative change and saves its own recovery revision. The v5 exchange
manifest carries the structured current content, its plain body projection,
and explicit entity-reference descriptors; Task and Project targets are
remapped to their imported IDs. Revision history and ephemeral awareness are
deliberately excluded.

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

Electron main derives a permission-scoped body-search projection only after the
encrypted Yjs state is durable. The local index stores a state digest, rebuilds
after restart and revision restore, follows converged collaboration updates,
and is purged atomically when its document or Space becomes unavailable. It is
a deterministic retrieval index, not a generated-answer or RAG path.

## Recovery behavior

- A failed named-version association leaves the already-created realtime
  revision safe and can be retried.
- Restoring a realtime revision creates a new collaborative change; it does not
  erase later history or mutate the named version.
- A source becoming unavailable preserves the frozen evidence reference.
- Source changes create deduplicated in-app attention for the owner of an
  affected document. Creating a new named version dismisses that stale signal.
- A managed file attached to a document remains a Capture-backed Knowledge
  Source in the document's versioned evidence relation. The document never
  stores bytes in Yjs. The desktop verifies local custody independently from
  metadata and can retry an authorized, digest-verified Hub download when a
  coordinated device lacks the object.
- Unlinking removes only the evidence relation and remains undoable. The
  preserved Capture continues to protect the original, so another reference or
  recovery path cannot lose bytes through an ordinary document action.

## Current limits

This slice does not yet implement approvals, external Artifact transfer,
automatic citation extraction, source freshness schedules, relationship-record
exchange for Person, Organization, and Meeting links, or managed attachment
surfaces on Tasks and comments. Those outcomes must extend the
same typed records, authorization boundary, and deterministic query model
rather than add a second document system or an embedded reasoning layer.
