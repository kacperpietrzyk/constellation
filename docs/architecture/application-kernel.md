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
- `capture.submit`
- `capture.process`
- `capture.reportException`
- `capture.resolveException`
- `capture.submitText`
- `capture.routeAsTask`
- `project.create`
- `project.updateOutcome`
- `document.create`
- `knowledge.sourceCreate`
- `knowledge.sourceUpdate`
- `knowledge.documentSetEvidence`
- `knowledge.namedVersionCreate`
- `knowledge.namedVersionVoid`
- `relationship.organizationCreate`
- `relationship.personCreate`
- `opportunity.create`
- `opportunity.offerCreate`
- `opportunity.linkOutcomes`
- `relationship.renewalCreate`
- `relationship.renewalResolve`
- `relationship.factCreate`
- `decision.create`
- `decision.supersede`
- `decision.resolveImpact`
- `area.create`
- `initiative.create`
- `work.linkCreate`
- `work.linkRemove`
- `savedView.create`
- `recurrence.create`
- `recurrence.generateOccurrence`
- `recurrence.sweep`
- `project.close`
- `project.reopen`
- `radar.candidateUpsert`
- `radar.resolve`
- `meeting.upsertImported`
- `task.create`
- `task.updateDetails`
- `task.setParent`
- `taskStatus.create`
- `taskStatus.rename`
- `taskStatus.setSemantics`
- `taskStatus.reorder`
- `taskStatus.archive`
- `taskStatus.restore`
- `workspace.setDefaultTaskStatus`
- `task.setStatus`
- `task.setOperationalState`
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
- `work.overview`
- `project.operationalOverview`
- `document.list`
- `knowledge.list`
- `knowledge.documentContext`
- `relationship.workspace`
- `radar.review`
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
semantics are `actionable`. The generic Capture contract preserves typed text,
URL, file-reference, managed-file, screenshot, or short voice-note originals before a separate
deterministic processing command creates one canonical standalone Task or
knowledge source that points back to its source Capture. Voice notes take a
distinct deterministic path to `awaiting_transcript`: lack of an external agent
is normal work-in-progress, not an Attention exception. A managed original
contains only an opaque payload ID, digest, byte length, media type, display
name, and custody state. A voice original additionally freezes bounded duration
and the chosen post-transcript retention policy. Bytes and local paths never enter the command, audit,
outbox, or MCP projection. The original text command remains compatible.
MCP operations are discoverable in-band: the `constellation://v1/operations`
resource lists every command and query the active grant authorizes, each
with its full strict envelope JSON Schema plus shared invocation guidance
(expected versions, idempotency, recovery). The catalog is generated at
read time from the same Zod contract unions the kernel validates with and
filtered by the grant's capability scope, so it can never drift from the
kernel or reveal an unauthorized operation; the three generic tools remain
the only invocation surface.

An explicitly requested MCP payload resource is the only agent byte path. Voice
audio additionally requires the independent `capture.audioRead` capability;
ordinary managed files and screenshots do not imply access to microphone data. It
resolves an authorized Capture, reads at most 512 KiB per internal invocation,
reauthorizes the current grant and Space for every chunk, and returns a blob
only after the MCP server verifies the complete length and SHA-256 digest.
For a coordinated Data Home, the trusted Electron adapter reads and verifies
the staged local bytes, publishes them through the authorized Hub attachment
transport, and verifies its digest and length before invoking
`capture.submit`. Transfer failure therefore has no domain side effect and the
same staged original can be retried. The kernel still rejects any managed
descriptor whose encrypted local custody is missing or inconsistent. The Hub
performs the equivalent check against its published content-addressed object
before accepting the queued command into the authoritative projection.
`capture.reportException` records one closed reason code without accepting
renderer-authored diagnostic text. `capture.resolveException` permits only the
reason-specific retry, keep-unclassified, or verified payload-replacement
actions. An explicit `capture.process` destination resolves ambiguity,
duplicate, unsupported input, or a missing target. A successful resolution
updates the Capture and dismisses its exact recipient-only Attention signal in
one unit of work; keeping an original unclassified removes inbox debt without
discarding or falsely routing it.

Capture provenance is optional on the core Task model. A routed Task records
its source Capture, while a directly created Task (`task.create`) does not
invent one.

A Task also carries optional bounded working context — a plain-text
`description` and a separate one-line `nextAction` — and optional planning in
time: `startAt`, `dueAt`, and a small closed `priority` vocabulary
(`urgent`/`high`/`normal`/`low`). All of these travel through `task.create`
and the expected-version `task.updateDetails` command with the standard
attribution, idempotent replay, audit, activity, previewed undo, and Space
authorization semantics. Clearing a field is an explicit null assignment
rather than an omission, undo restores the exact prior values, and the text
fields are covered by permission-safe deterministic search. A deadline is not
reserved working time: Task timing never creates or edits a calendar event and
never enters the calendar-consent path. `startAt` may not exceed `dueAt`;
existing Tasks remain unscheduled rather than inheriting fabricated dates.
Imported timing is preserved: a recurrence occurrence inherits the due moment
it was generated for and a renewal follow-up carries its review deadline.

Recurring work advances on its own. `recurrence.sweep` runs once per unlocked
day under a maintenance origin, generates an occurrence for every active
cadence whose next due instant has passed, and rolls that instant forward. A
missed stretch produces exactly one current occurrence per cadence rather than
a backdated backlog, so a fortnight away yields one honestly overdue item
instead of fourteen. Cadence arithmetic is UTC and clamps a day-of-month the
target month lacks to that month's last day, which means a month-end cadence
still fires every month and settles on the 28th once it has passed through
February. Paused and ended cadences are skipped rather than attempted. The
sweep is bounded to 50 occurrences per run as a rate limit; because each
generation advances its cadence, successive runs make forward progress.
`recurrence.generateOccurrence` remains the precise manual path for one record.
`task.list` supports a tested due-aware ordering (`due_asc`: scheduled first
by deadline, then priority, creation time, and id; unscheduled follow
deterministically) plus status, priority, scheduled, and due-range filters
with cursor pagination. A richer collaborative Document remains an explicitly
related, separately created record; no Task requires one merely to hold a few
paragraphs of working context.

A Task may be decomposed into exactly one level of subtasks. `task.create`
accepts an optional `parentTaskId` and the expected-version `task.setParent`
command adopts, moves, or clears the relation with its own previewed undo
(`task.restore_parent`). The invariant is transactional: a subtask cannot
become a parent, a Task with children cannot be adopted, and parent and child
must share a workspace and Space. Every subtask keeps fully independent
status, completion, operational state, timing, priority, responsibility,
comments, and recovery; completing all children never completes the parent —
surfaces show explicit counts, never a percentage or an automatic transition.
The lightweight `waitingOn` descriptor gains an explicit optional `direction`
(`waiting_on_them` or `we_owe`) and an `expectedAt` review instant, so waiting
work and owed commitments stay distinguishable without forcing dependencies
into subtasks.

Task workflow statuses are configurable workspace behavior. A status
definition carries a workspace-owned label and ordering plus one closed broad
operational meaning (`actionable`, `waiting`, `blocked`, or `paused`) so
views, workload signals, and MCP agents behave predictably without depending
on an exact label. Workspace maintainers create, rename, reorder, re-scope,
archive, and restore definitions and change the workspace default through
versioned commands with audit, activity, and previewed undo. Active labels
stay unique; the default status cannot be archived; an archived status is no
longer selectable, while Tasks already carrying it keep rendering its
historical label — configuration never silently rewrites existing Tasks.
Completion state remains a separate dimension from workflow status.
Allowed-transition matrices are deliberately not introduced yet.

Core records accept typed workspace extension fields. A field definition is
workspace-scoped (target kind Task or Project, label, closed type union of
text/number/date/constrained choice, active/retired lifecycle) and is managed
by workspace maintainers through versioned `fieldDef.*` commands with audit
and previewed undo. Values live on the target record itself
(`record.setFieldValue`, expected-version, explicit null to clear, at most 32
populated fields), so Space authorization, audit, export, backup, Hub
projection, and revocation are inherited from the record — a value can never
out-scope its record, definitions cannot bypass authorization, and no
arbitrary JSON enters the graph. A retired definition stops being assignable
while existing values keep rendering with a historical marker. Field-based
saved-view filters and search indexing are deliberately later steps.

Project templates bundle a reusable start: a workspace-scoped template
definition (name, up to 24 starter Task titles, referenced project-targeted
field definitions, active/retired lifecycle) managed by maintainers through
versioned `template.*` commands with audit and previewed undo. Application is
always an explicit, prospective command — `project.applyTemplate` creates only
the starter Tasks the project does not already have (exact-title matches are
reported as skipped, never rewritten), relates them through the ordinary
relation semantics, and stamps `appliedTemplateId` provenance on the project.
Editing a template never touches existing projects, re-applying the same
template is refused, and undo removes exactly the Tasks the application
created — refusing when any of them has been edited since. Starting a project
without a template stays first-class; a templated start composes creation
with application in the UI.

Automations are bounded, deterministic recipes — never scripts. A rule is
workspace-scoped configuration (managed by maintainers with audit,
activity, and previewed undo of the definition) drawn from a closed recipe
vocabulary: a completed Task also enters a configured workflow status, and
a waiting Task whose explicit review date has elapsed raises a deduplicated
in-app attention signal. The reactive effect rides the triggering command's
transaction, journal entry, audit receipt, and undo descriptor, with the
applied rule attributed in the outcome; the date-driven effect runs through
an explicit idempotent sweep command (at most 50 signals per run, one
signal per elapsed review date). Automated effects never trigger further
rules, never touch anything outside the workspace, and disabling a rule
never rewrites history.

Saved work views carry a typed, closed filter vocabulary — operational
states, workflow statuses, priorities, a deadline window (overdue, today,
this week in the workspace calendar), scheduled/unscheduled,
responsibility including unassigned, and typed field conditions (has a
value, empty, or equals a declared choice option) — plus one deterministic
ordering (recently updated, nearest deadline with the shared null-ordering
contract, or alphabetical) and optional declared grouping by status,
priority, or a constrained-choice field. Applying a view is an explainable
projection over the permission-safe work overview: the same filters
produce the same result every time, group order follows declared
configuration (status position, priority rank, option order, with an
explicit trailing no-value group), and a view that matches nothing says so
instead of hiding work. Views have a full lifecycle — rename, update, and
soft delete are versioned commands with audit and previewed undo restoring
the exact prior definition; a filter referencing a retired field
definition deterministically matches nothing rather than erroring.

The application-owned rule is deliberately narrow: text becomes a Task, while
URLs, file references, managed files, and screenshots become knowledge
sources. Managed payload duplicates use exact content digest and byte length;
no similarity model is involved. Exact duplicates remain
durable and create a scoped Attention signal instead of a second domain record.
The same review state distinguishes ambiguity, unsupported input, parsing,
permission, stale conflict, missing target, missing payload, partial payload
transfer, and unknown reconciliation. Recovery actions are validated in the
kernel rather than inferred by the renderer. The rules never start an AI
executor. The current slice has a runnable desktop flow,
typed Project relations, status/completion, scoped search, explainable cockpit,
meaningful activity, version-safe undo, contextual comments, and durable
recipient attention. It does not yet claim editable workflow configuration or
a federated cross-Workspace copy command.

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

Knowledge Sources remain separate versioned records. A Native Document declares
whether it is a Note, Document, or Deliverable and keeps an explicit current
evidence set. A named version freezes one realtime revision, its content
snapshot, milestone meaning, and the exact versions of its source and Note
evidence. Later evidence changes are reported without rewriting that version.
The implemented boundary and recovery behavior are documented in
[Knowledge evidence and deliverables](knowledge-and-deliverables.md).

Strategic records remain ordinary Space-scoped graph records. Their commands
share expected versions, idempotency, attribution, audit receipts, recovery,
and synchronization with the rest of the kernel. Renewal deduplication,
Decision impact review, recurrence generation, Project closure, and finite
Radar behavior are domain rules rather than UI or MCP special cases. See
[Relationships and strategic depth](relationships-and-strategic-depth.md).

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
- Knowledge evidence is authorized in one Space before linking. Named versions
  freeze exact evidence versions, while source/evidence changes and version
  creation remain recoverable through ordinary compensation descriptors.
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
- Capture processing requires the exact current Capture version. Repeating a
  committed route with the same idempotency input returns its original result;
  a distinct attempt cannot create a second Task or knowledge source.
- Capture exception recovery requires the exact Capture and Attention versions.
  A route closes its associated signal in the same transaction. Payload
  replacement first passes current local or Hub custody proof, then replaces
  the path-free descriptor and fingerprint; failed proof changes neither
  record.
- Record changes, domain events, audit receipts, idempotency outcomes, and outbox
  entries share one unit of work. Success is returned only after that unit commits.
- Audit, events, outbox records, validation issues, and diagnostics omit capture
  bodies. Authorized Capture History retains the typed original and routing
  provenance, while Task and knowledge projections expose only their canonical
  fields plus the source-Capture link.
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
  Task, Task assignment, comment, Attention signal, Knowledge Source, Native
  Document, named document version, Task status, event, audit, and outbox
  records.
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

## Desktop workspace runtime boundary

The desktop registry contains only workspace identity, display name, active
selection, and a relative application-state root. Every registered workspace
opens through its own SQLCipher database, wrapped key, Data Home state, Hub
credential, and local MCP endpoint. Switching changes the registry selection
and relaunches the process; the renderer cannot switch an identifier while
retaining another workspace's privileged main-process services.

The personal Cockpit may open an inactive encrypted local projection long
enough to run the ordinary `cockpit.week` query with that workspace's own
principal and Space scope. It returns only a bounded focus count and first
action, closes the store immediately, and never joins records across workspace
boundaries. Unavailable or unauthorized projections remain unavailable without
affecting the active workspace.

Import is one engine over general documented exchange formats, not an
alternate write kernel. The versioned JSON exchange manifest (v2 adds
optional task description, priority, start/deadline instants, and a status
label matched case-insensitively against existing workspace statuses) and
the documented tasks CSV (fixed header vocabulary, RFC-4180-style quoting,
row-numbered validation errors) both map onto the same model. Main
validates the whole file strictly at preview — any malformed row or unknown
status label rejects the file before anything executes — derives stable
record IDs and per-step idempotency keys from the file's content-derived
`importId`, and executes only the normal versioned commands. Partial
progress remains auditable, every imported record is individually
undoable through the ordinary recovery surface, and re-running the same
file idempotently completes an interrupted import instead of duplicating
records.

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

Retryable storage diagnostics distinguish transient contention from exhausted
capacity and lost write permission. The owning adapter rolls back first, and
desktop/MCP callers receive only `storage.unit_of_work_failed`,
`storage.capacity_exhausted`, or `storage.permission_denied`—never native error
objects, SQL, content, or local paths. Unknown I/O and corruption failures are
not mislabeled as safe retries.

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

Knowledge coverage proves source-to-Note-to-Deliverable provenance, frozen
evidence versions, changed-evidence signals, deterministic scoped search,
version-safe undo, encrypted SQLite restart, and Hub exclusion of private-Space
sources and named versions.

Production signing/notarization, installer/updater continuity, MCP mapping,
deterministic syntax parsing, generalized Attention rules, checkpoint revert, editable
configuration, document comments/citations, and the exhaustive cross-workspace leak
matrix remain later capability gates.

The current adapters and their remaining runtime boundaries are documented in
[Local store](local-store.md) and [Data Homes](data-homes.md).
