# Changelog

All notable changes to Constellation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/) once public
releases begin.

## [0.1.7] - 2026-07-26

Every fix in this release is the same shape: the kernel knew the right answer
and the caller was handed the wrong **kind** of answer. A rule you broke came back
as an internal error, a removed link came back as a live one, and a body nobody
wrote came back indistinguishable from somebody's work.

### Fixed

- **A claimed run identity is refused by name, not reported as a broken
  build.** An `agentRunId` is bound on first use to the grant, the agent
  principal and the `hostRunId` it arrived with, and one host run carries at
  most one agent run. Both rules were enforced by a raw throw, which the guard
  for genuine defects turned into `mcp.runtime_fault` — the code that means
  "this build is broken and there is nothing in your request to fix" — on that
  call and on every later one carrying the same run, permanently. Because
  `capabilities` is answered before a run is registered, the session gate kept
  reporting a healthy build, a current grant and a full capability scope while
  nothing else worked. It is now a `conflict` with `mcp.run_identity_conflict`
  and a message naming the repair: generate a fresh `agentRunId` **and** a fresh
  `hostRunId` and retry. The pair matters — a new agent run under an unchanged
  host run collided with the store's own uniqueness rule and failed the same
  unnamed way, which is the second half of this fix. The invariant is unchanged:
  a run identity is never reassigned, and the refusal stays merged rather than
  naming which half collided.
- **The two set-level reads let go of removed work links.**
  `relationship.workspace` and `work.overview` handed back links whose removal
  had already been applied, mixed in with the live ones, so a caller reconciling
  "which client does this delivery serve" attached a client that had been
  deliberately detached. Deletion is written on two axes — the `recordState`
  every strategic record shares, and the per-kind `state` that a work link and a
  Saved View predate it with — and the wide reads honoured only the first, so
  seven kinds were filtered and the eighth was not inside one answer. Both reads
  now ask one shared question that covers both axes, applied where a set is
  built, so tombstones already on disk disappear too. Narrow readers were
  already correct and are unchanged, and removal stays reversible through the
  removing command's id.
- **An unavailable Capture payload is a refusal, and says so.** Reading
  `constellation://v1/…/payload` for a capture that does not exist, sits outside
  your Spaces, retains no bytes, or needs a capability your grant lacks answered
  a bare JSON-RPC internal error with prose and nothing machine-readable. Those
  four causes stay deliberately indistinguishable — that merge is what stops a
  refusal from revealing whether a record exists — but the answer now carries an
  invalid-request code and `mcp.payload_unavailable`, so a caller can tell a
  refusal from a broken build.

### Added

- **`contentOrigin` on both structured reads, answering whether anyone actually
  wrote the body.** A person merely opening a Project in the desktop
  materialises its body from the Project's own intended outcome, so
  `contentState: "rich-v1"` covered both a page that was looked at once and a
  page holding somebody's work — and an agent deciding whether it may write had
  no way to tell them apart. The read now states it: `absent` when there is no
  body, `seeded` when the body holds nothing beyond what materialising it would
  have produced, `authored` once anything else is in it. It is a claim about
  content rather than authorship — one edited word makes a body somebody's,
  because from then on there is something to lose — and it is computed
  structurally, so an added block or a link counts too.

## [0.1.6] - 2026-07-26

0.1.5 added a link type to the domain and to the command that writes it, but to
neither projection that reads one, and strict parsing turned a single such link
into two dead surfaces. This release repairs that regression and closes the
findings the field channel raised against 0.1.5, including a refusal that told a
caller with no permission whether a record existed. It also finishes what 0.1.5
started: the evidence and the ownership it made writable can now be read, a
record imported from a row can carry that row's identity, and the client edge
can be authored from either end in the desktop.

### Fixed

- **Relacje and Praca came back.** 0.1.5 added the `project_serves_organization`
  link type to the domain and to the command that writes it, but to neither
  projection that reads one. Query results are parsed strictly, so a single such
  link did not degrade a view — it faulted the whole answer, and
  `relationship.workspace` and `work.overview` both stopped answering. In the
  desktop that surfaced as "dane niedostępne" on two surfaces with nothing
  naming the cause; over MCP it was `mcp.runtime_fault`. The link vocabulary is
  now one shared shape that both readers and the writer use, so the two cannot
  drift again. Nothing on disk needs repairing — the link simply becomes
  readable.

- **A Task could contribute to the same Opportunity twice.** The duplicate guard
  on `record.relate` reads one finder whose two implementations disagreed: the
  SQL one matched either far end, the in-memory one only a Project, so a second
  identical relate was refused against a Project and accepted against a deal.
  The conformance suite runs against the in-memory store, so it was blessing an
  outcome the shipped store does not have.

- **A withheld capability is now reported as one, whatever the target.** A
  command whose capability was missing from the grant answered
  `command.precondition_failed` whenever the target also happened not to exist,
  because the branch gave up on resolving the target before the policy was ever
  asked. Two consequences: an agent could not tell a missing permission from a
  missing record, and the pair of codes leaked whether a record existed to a
  caller with no capability to touch it — the existence oracle the merged
  refusal exists to prevent. The policy is now consulted first. A refusal that
  is genuinely about the Space or the record is still the same merged
  `command.precondition_failed` it always was. This now covers every branch that
  refused before asking — the capture family, the workspace and member commands,
  the comment and attention arms, and the meeting commands, where a first pass
  had made the leak _wider_ before review caught it.

- **A client links both ways.** `project.operationalOverview` reported no client
  for a Project linked straight to an Organization, while the Organization
  already listed that Project — so the question the link was added to answer
  could only be asked from one end.

### Added

- **The evidence a Project rests on, and the person whose deal it is, can be
  read.** Both were writable in 0.1.5 and appeared in no projection.
  `project.operationalOverview` now returns `evidenceSources`, and the
  opportunities on `organization.operationalOverview` carry `owner` by name.

- **A Person and an Organization can carry the identity of the row they came
  from.** Nothing refused a duplicate: names are not unique, and the idempotency
  key only recognises the same command re-sent by the same principal, so a
  migration re-run that minted fresh ids created a second record nothing
  objected to. `externalId` is claimed once per Space and kind; a create whose
  key is taken is refused with the colliding record's id and version, so the
  caller corrects in place. It can be stamped onto a record that predates the
  field, but never rewritten.

- **`person.list` and `organization.list`.** `relationship.workspace` was the
  only set-level read of who is in the graph, and being one answer it was also
  one failure — a single unprojectable record took the whole set down at exactly
  the moment a migration needed it. These carry one kind each and filter before
  the strict parse, so one kind's problem stays its own. Same item shape as the
  wide read, which still answers when you need more than one kind.

- **A Knowledge Source says what rests on it.** `knowledge.list` returned
  Sources with no bindings, so a note could be traced from the records citing it
  but never the other way — "which Projects rest on the note whose currency I
  doubt?" had no answer from the note. Each Source now carries `referencedBy`:
  up to twenty Projects, Documents, Tasks and strategic records with their
  titles, plus `referencedByCount` for the real total. It is the same
  enumeration the removal guard reads, so an empty `referencedBy` is a Source
  `knowledge.sourceRemove` will accept.

- **A deal and a delivery can carry the identity of the row they came from.**
  `externalId` reached only Person and Organization; deal titles collide across
  clients and across years and project titles repeat, so a re-run still
  duplicated both. `opportunity.create` and `project.create` now claim a key the
  same way, once per Space, with the refusal naming what holds it. Neither has
  an update command that takes the field, so both can only be stamped at import.
  A Project's key is claimed against deliveries alone, so a Project and a Person
  may share one string — they come from different source systems.
  `project.list` carries the key so a re-import recognises what it created.

- **A client can be linked to a Project from the desktop.** The link was
  readable but only writable over MCP. The Klient card now offers the
  Organizations in the Project's own Space, and detaches a direct link in two
  steps. It says plainly when the list could not be loaded, rather than
  reporting an empty Space.

- **A delivery can be linked to its client from the client's own page.** The
  Project side gained the authoring row first; from the Organization the edge
  stayed read-only, so recording who a delivery runs for meant opening every
  Project in turn. The Aktywna praca card now offers the active Projects in the
  client's Space and detaches a direct link in two steps, and both ends read one
  scan of the links so they cannot disagree about what is attached.

### Changed

- **A Knowledge Source a Project rests on can no longer be removed while the
  Project stands.** The guard that refuses to orphan a record was written before
  Projects carried evidence and did not cover them. This applies to data already
  on disk, so a Source that was deletable yesterday may refuse today with
  `record.still_referenced` naming the Project — detach it there first. No user
  action caused the change.

- The MCP invocation guidance now names `referencedBy`, the two commands that
  take a source key but can never be stamped after the fact, and states which
  query reads a whole set, that
  `search.global` needs a term and truncates silently without folding Polish
  diacritics, and that nothing refuses a duplicate person or organization by
  name — so a re-runnable import has to derive its idempotency keys and record
  ids from the source row. This moves `contractFingerprint`, which is the signal
  a connected agent uses to notice the contract changed.

## [0.1.5] - 2026-07-25

The first migration of a real client engagement into Constellation, run by an
external MCP agent, produced two contract defects and five capability gaps.
This release closes all of them.

### Added

- **An agent can give a Project a working body.** A Project nobody had opened
  had no body at all, and both content tools refused — so a migration could
  land an engagement's records but never the operating context they exist for.
  A body that does not exist yet is now a state a read reports rather than a
  refusal: it answers with the digest that means "nothing here yet", and
  quoting that digest back creates the body, seeded from the Project's own
  intended outcome so the field and the page do not start out disagreeing. A
  document written as plain text is upgraded to rich blocks by the same write,
  and both answers say which happened.

- **A person or an organization can be corrected in place.** They were the only
  entity kinds with no update, so fixing a misspelled surname meant removing the
  record and re-creating it under a new id — losing its creation date and audit
  lineage, dangling every reference to the old id, and failing outright once
  anything pointed at the person. `relationship.personUpdate` and
  `relationship.organizationUpdate` change named fields only: what you omit is
  left alone, and both are reversible.

- **Four reaches the graph did not have.** A Project carries the Sources it
  rests on (`evidenceSourceIds`), so "which projects rest on the note I now
  doubt" is a query rather than a search through paragraphs. A Task can
  contribute to an Opportunity, so a per-client next action dies with the deal
  instead of outliving it on a reporting project. A Project can serve an
  Organization directly, so a client is no longer only a word in a title. An
  Opportunity names its owner — the person whose deal it is, as distinct from
  everyone named on it — and that person cannot be removed while the deal
  stands.

### Changed

- **A checkpoint revert is one act now, and it knows its own slice.** A
  checkpoint holding a create and a later correction of the same record could
  never be reverted at all, and neither could one holding a record and the
  record created against it — the shape every real migration writes. The revert
  now compensates newest-first inside one transaction, so a later change it is
  itself taking back no longer blocks the earlier one, while a change made by
  anything outside the checkpoint still refuses the whole revert. Nothing is
  applied until every captured command has been judged, so a refusal leaves the
  checkpoint open instead of half spent.

- **A checkpoint revert preview answers what the revert will answer.** It used
  to report only whether an earlier undo had consumed a compensation, so a
  record other work had moved on previewed as revertable and refused seconds
  later — spending a checkpoint to learn what the preview already knew. It now
  carries `blocked`: every captured command whose compensation does not apply,
  with its own reason.

### Contract changes an external host should read

- `agent.checkpoint_revert_partial` and `agent.checkpoint_revert_preview_failed`
  are retired. A revert is atomic and has no separate preview call to fail.
- A successful revert returns `compensatedCommandIds` and `recordVersions`
  instead of a list of per-undo outcomes.
- `blocked` is now a required field of the `agent.checkpoint_revert_preview`
  projection, and the checkpoint vocabulary gained `already_undone` and
  `still_referenced` so a summary names the real cause.
- A revert no longer requires the `recovery.preview` capability — only
  `agent.checkpoint.revert`, the one the tool publishes.
- Structured content reads return `contentState` (`absent` / `plain-v1` /
  `rich-v1`) and no longer answer `content_unavailable`,
  `schema_upgrade_required`, or an internal fault for a body that is merely not
  rich yet; structured writes return `contentCreated` and `formatUpgraded`.
- `record.relate` takes `relationType` plus the far end that type names, so a
  task-to-opportunity relation carries `opportunityId` rather than `projectId`.

## [0.1.4] - 2026-07-25

### Added

- `agent.grantSetScope` can now re-scope which Spaces an issued agent grant
  reaches, alongside its capability scope, in the same command. A grant
  issued into the wrong Space, or one that needs a Space added later, no
  longer needs a revoke and a reissue to fix — no new credential, no host
  reconfiguration, and the change applies on the agent's next call. Re-adding
  a Space the grant previously held reactivates its old record instead of
  minting a duplicate.

- The desktop offers this on every local agent grant, not only a drifted one.
  "Zmień uprawnienia" replaces the drift-only "Zaktualizuj zakres" button: a
  person picks the level and the Spaces together, sees the difference the save
  would make before making it, and saves both in one command — without
  revoking the grant, issuing a new credential or reconfiguring the connected
  host, and effective on the agent's next call. A grant whose scope was
  hand-picked rather than taken from a level had no exit before this and now
  has one.

### Changed

- A removal refused because another record still points at the target now
  answers `record.still_referenced` instead of the same
  `command.precondition_failed` every other refusal uses, and names what is
  blocking it: `blockedBy` carries up to twenty of the blocking records
  (`recordId`, `recordKind`, and `recordType` where the kind has one) plus
  the real count in `blockedByCount`. An integrator can now tell "detach
  these and resend" from "this will never be allowed" without spending a
  write to find out which.

- `command.previewUndo` and `recovery.preview` report the same cause as
  `unavailableReason: "still_referenced"` where they previously said
  `later_change`, which claimed a version had moved when nothing had. The undo
  itself is unchanged: a blocked `command.undo` still answers
  `undo.not_available` and carries no `blockedBy`, and a checkpoint revert
  blocked this way still folds into `agent.checkpoint_revert_conflict`.

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
  row and, on a local workspace, offers the single action that closes it. A Hub
  grant is changed through the Hub's own management API, which carries no scope
  method yet, so a coordinated workspace names the state without offering an
  action that could not reach the grant.

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
