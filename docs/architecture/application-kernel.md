# Application kernel

Status: pre-alpha reference implementation. No contract is stable yet.

Constellation keeps product behavior in a storage- and transport-neutral
application kernel. Desktop UI, imports, deterministic rules, and local or
remote MCP adapters call this same boundary. Electron, a database, HTTP, and MCP are
adapters; none may reimplement domain behavior.

```text
desktop / import / rule / MCP adapter
                 |
       runtime-validated contract
                 |
      authorization + application kernel
                 |
       unit of work and read-model ports
                 |
     local store or coordinating Data Home
```

## Implemented reference subset

Commands:

- `workspace.createLocal`
- `workspace.rename`
- `workspace.memberAdd`
- `workspace.memberSetAccess`
- `workspace.memberRevoke`
- `agent.grantCreate`
- `agent.grantRotateCredential`
- `agent.grantRevoke`
- `agent.checkpointCreate`
- `agent.handoffSubmit`
- `capture.submitText`
- `capture.routeAsTask`
- `project.create`
- `project.updateOutcome`
- `document.create`
- `task.setStatus`
- `task.complete`
- `task.reopen`
- `task.assign`
- `task.unassign`
- `comment.add`
- `comment.edit`
- `comment.resolve`
- `comment.reopen`
- `attention.markRead`
- `attention.dismiss`
- `record.relate`
- `record.unrelate`
- `command.previewUndo`
- `command.undo`

Queries:

- `workspace.bootstrapContext`
- `workspace.access`
- `workspace.exportScoped`
- `agent.access`
- `agent.checkpointPreviewRevert`
- `capture.history`
- `task.list`
- `task.assignmentCandidates`
- `comment.list`
- `comment.mentionCandidates`
- `attention.inbox`
- `project.list`
- `project.operationalOverview`
- `document.list`
- `search.global`
- `cockpit.week`
- `activity.meaningful`
- `recovery.preview`
- `audit.receipt`

This subset proves the command/query mechanics across the in-memory reference
adapter, the Electron transport, the versioned local MCP stdio adapter, the
Hub-owned Streamable HTTP MCP adapter, and a
restart-safe encrypted relational local store adapter. The packaged production entry point uses that durable store; the
developer preview remains an explicit in-memory adapter. A local workspace
starts with one versioned
default Task status whose display label is data and whose broad operational
semantics are `actionable`. An explicit routing command preserves the original
Capture, advances its processing state, and creates one canonical standalone
Task that points back to its source.

Capture provenance is optional on the core Task model. A routed Task records
its source Capture, while future direct `task.create` commands will not invent
one.

The implementation deliberately does not parse task syntax or start automatic
processing. A future deterministic rule adapter must invoke the same
`capture.routeAsTask` command. The current slice has a runnable desktop flow,
typed Project relations, status/completion, scoped search, explainable cockpit,
meaningful activity, version-safe undo, contextual comments, and durable
recipient attention. It does not yet claim generalized Attention rules,
editable workflow configuration, or a federated cross-Workspace copy command.

Task responsibility is a separate versioned collaboration record rather than a
free-form Task field. An editor can assign one active Workspace member or guest
who can view the Task's Space, reassign atomically, or remove responsibility.
The Task list and Project overview show a safe label; a revoked member or a
member who lost Space access is retained for audit without exposing a principal
identifier. Assignments and explicit comment mentions create deduplicated
recipient-only Attention records that open the exact Task or Project.

Comments are versioned records attached to a Task or Project, not a chat
transport. They retain edit revisions, explicit eligible mention IDs, reply
roots, and resolve/reopen state. Space access is ordered `view < comment < edit`:
a Commenter can discuss work without mutating it, while an Editor can also
resolve any visible root thread. Routine collaboration remains in-app. Electron
main owns the optional foreground-suppressing system delivery adapter and only
receives already scoped urgent Attention projections.

Native document metadata is an ordinary typed, versioned domain record handled
by `document.create` and `document.list`. Collaborative body state is deliberately
not folded into record synchronization. A replaceable document adapter owns the
opaque Yjs state, updates, state vectors, and named revisions. Local SQLCipher
is authoritative for local-only workspaces and retains encrypted state plus an
outbox for coordinated workspaces; the Hub persists bounded binary state and
revision checkpoints in PostgreSQL. Revision restore applies a new Yjs change
and records which immutable revision it came from.

## Boundary rules

- Zod schemas validate untrusted envelopes at runtime and reject unknown fields.
- A trusted adapter constructs the execution context; request payloads cannot
  choose their actor, credential, grant, workspace, or capability scope.
- Local MCP credentials are random, stored only in a mode-`0600` descriptor,
  and compared through a one-way digest in Electron main. The renderer receives
  the descriptor path and host launch instructions, never the secret itself.
- Agent capabilities and Space scope are independent intersections. Full Access
  removes prompts only inside both declared scopes; expiry, rotation,
  revocation, current membership, provider boundaries, and expected versions
  are still checked on every call.
- External host runs, parent runs, correlation, causation, checkpoint, and
  idempotency metadata remain separate. Host-supplied model metadata is marked
  as host asserted; it cannot choose the durable Constellation principal.
- Query content returned through MCP is labeled as Space-scoped untrusted
  evidence. Tool descriptions and response labels explicitly forbid treating
  record, import, file, comment, or transcript text as instructions.
- Local agent grants are device-local and available only while the local-only
  Data Home and desktop are available. They are excluded from Hub snapshots.
  Remote grants use a separate Hub-owned credential, principal, rate boundary,
  receipt/checkpoint state, and three independent federation authorities.
- Authorization resolves the current credential, grant, policy version,
  capability, Workspace membership, owning Space, and record scope before every
  command, query, and idempotent replay. Revoked grants cannot reuse an earlier
  durable outcome.
- Workspace role and Space data scope are independent. Owner membership covers
  only the bootstrap root Space implicitly; every additional Space, including
  one used by an owner or administrator, requires an active durable grant that
  also intersects the caller's declared scope.
- Membership and Space-grant changes are versioned, idempotent, audited policy
  mutations. Revocation invalidates older policy contexts, rejects queued Hub
  work, and removes the affected coordinated local projection.
- Commands carry a caller-scoped idempotency key and semantic fingerprint.
  Identical replay returns the original durable outcome without new audit or
  version churn; different input under the same key conflicts.
- Existing-record mutations require expected versions. Stale writes return an
  explicit conflict and never apply last-write-wins.
- Assignment mutations require exact Task and current-assignment versions. The
  assignee is reauthorized against active membership and Space access when the
  command executes; assignment candidates never include unrelated members.
- Comment mutations require exact target/comment versions, author-only edits,
  and current Space eligibility for every explicit mention. Attention queries
  are always restricted to the current principal and reauthorize the target
  Space before returning its title or destination.
- Document rooms derive from validated Workspace and document IDs. Electron
  main exchanges its protected device credential for a short-lived room token;
  current membership, Space scope, and view/comment/edit access are checked at
  authentication, before every inbound update, after policy synchronization,
  and for revision operations. Downgrades invalidate the old session and force
  a newly authorized read-only session; revocation closes the room and local
  coordinated purge removes document metadata, state, queued updates, and
  revisions.
- Capture routing requires the exact current Capture version. Repeating a
  committed route with the same idempotency input returns its original result;
  a distinct attempt cannot create a second Task.
- Record changes, domain events, audit receipts, idempotency outcomes, and outbox
  entries share one unit of work. Success is returned only after that unit commits.
- Audit, events, outbox records, validation issues, and diagnostics omit capture
  bodies. Authorized Capture History retains the original text and routing
  provenance, while the Task projection exposes only the canonical Task fields.
- Query freshness comes from the read provider, never from the caller's requested
  consistency. The current local reference reports an authoritative local view;
  a projection reports its checkpoint and missing capabilities, and rejects an
  unavailable authoritative read.
- Permission-filtered records, relations, search, counts, meaningful activity,
  exports, and Hub snapshots derive from the same effective Space-access
  evaluator. A coordinating Hub never sends its authoritative raw snapshot to
  a partially scoped human principal.

## Package direction

```text
testkit -> application + domain + contracts
application -> domain + contracts
domain -> contracts (identity and actor types only)
contracts -> Zod
```

- `contracts` owns schemas, branded IDs, result taxonomy, and safe validation
  issues.
- `domain` owns framework-independent workspace, Space, membership, Capture,
  Task, Task assignment, comment, Attention signal, Task status, event, audit,
  and outbox records.
- `application` owns authorization orchestration, command/query handlers, and
  storage ports.
- `testkit` owns deterministic clocks/IDs, hashing/cursor fixtures, the in-memory
  reference adapter, and failure injection. It is not production persistence.
- `local-store` owns the relational ApplicationStore schema and the fail-closed
  SQLCipher driver gate. Electron main retains native loading and key custody.
- `application` also owns the privileged Data Home provider port. Its versioned
  descriptor, capabilities, status, and closed outcome vocabulary live in
  `contracts`; React receives only safe status and portability operations.
- `realtime-documents` owns the replaceable Yjs adapter. Hocuspocus is a Hub
  transport/presence adapter and never becomes a second domain implementation.

## Verification

Run the complete local gate:

```sh
npm ci --ignore-scripts
npm run check
```

The conformance suite currently verifies strict contract rejection, workspace
bootstrap, durable capture semantics, ten identical replays, conflicting-key
rejection, credential rotation and grant revocation, stale-version rejection,
permission-safe history/audit queries, actual freshness reporting, opaque cursor
pagination, content-safe diagnostics, and rollback after injected failure at
each capture unit-of-work boundary. Capture-to-Task coverage additionally proves
original preservation, standalone Task projection, strict expected versions,
double-route conflict, grant revocation and credential rotation, Workspace/Space
denial without target disclosure, typed opaque pagination, actual freshness,
and rollback after every Capture update, Task, event, audit, idempotency, and
outbox boundary.

Collaboration coverage uses two human principals and two Spaces, including a
private sentinel. It proves that role does not imply scope, hidden content does
not appear through direct search or scoped export counts, view-only access
cannot mutate, policy changes invalidate older contexts, Hub projections omit
out-of-scope data, and membership revocation removes access and coordinated
cache state.

Assignment coverage additionally proves member and guest eligibility,
view-only assignee support, exact-version conflicts, atomic reassignment and
removal, former/unavailable-member presentation, scoped exports and Hub
projections, SQLite restart and purge behavior, and rollback at every journal
boundary.

Comment and Attention coverage proves Viewer/Commenter/Editor separation,
author-only revision history, thread resolution, eligible mentions,
deduplication, recipient-only Hub projections and audit fields, encrypted
SQLite restart, exact destination routing, foreground suppression, and atomic
rollback with assignment/comment journal boundaries.

Document coverage proves two-human online and offline convergence, encrypted
local state and queued updates, bounded binary persistence across PostgreSQL
restart, five-minute renderer sessions without credential exposure, named
revision restore, view downgrade, revoked-session closure, coordinated purge,
and the real packaged editor on macOS and Windows gates.

Production signing/notarization, installer/updater continuity, MCP mapping,
deterministic syntax parsing, generalized Attention rules, checkpoint revert, editable
configuration, document comments/citations, and the exhaustive cross-workspace leak
matrix remain later capability gates.

The current adapters and their remaining runtime boundaries are documented in
[Local store](local-store.md) and [Data Homes](data-homes.md).
