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

## Delivered foundation — local Alpha and coordinated Data Homes

The repository contains the first durable desktop journey:

- encrypted local workspace storage with portable backup, destructive restore,
  and rollback at both interrupted activation boundaries;
- one context-preserving desktop shell with bounded Task and Project tabs,
  Back/Forward history, favorites, deterministic command palette, restored
  session state, native detached windows, and one on-demand, closable,
  width-adjustable inspector;
- Universal Quick Capture for text, URLs, and file references, preserving the
  original before deterministic routing to a traceable Task or knowledge source;
- Projects, Task relations, status changes, deterministic search, and a weekly
  cockpit projection;
- one Work destination that composes Areas, Initiatives, Projects, actionable,
  waiting, and blocked Tasks, dependencies, and saved structured views;
- direct strategic operations for People, Offers, Renewals, sourced facts,
  Decisions, recurrence rules, and Radar candidates without a separate CRM;
- first-run onboarding and Settings for workspace identity, Data Home,
  recovery, appearance, access, connectors, starter imports, and honest release
  state;
- independent encrypted workspace creation and switching, plus a bounded
  personal focus summary over locally authorized workspace projections without
  joining their records;
- Capture History, duplicate review-by-exception in Attention, meaningful
  activity, audit receipts, and previewed undo;
- a shared application command/query boundary behind the desktop UI;
- packaged verification on macOS and Windows runners;
- a versioned, capability-tested Data Home contract whose local-only adapter
  exposes canonical storage, encryption, availability, portable checkpoint,
  migration, recovery, and stable installation identity without claiming sync;
- provider status and recovery in the desktop surface, including honest
  unsupported states for remote change exchange, attachments, provider quota,
  and remote device revocation;
- a self-hosted coordinating Hub with encrypted local projections, recoverable
  command queues, one-use enrollment, revocation, resumable attachments, and a
  packaged two-device convergence gate on macOS and Windows.

These foundations now support the coherent desktop Alpha described below; they
are not by themselves a published desktop release.

## Delivered foundation — collaboration-safe workspaces

Build collaboration on the same identity, authorization, and Data Home
boundaries rather than adding it as a separate product:

- members and guests with independently configurable Workspace role and Space
  data scope;
- permission-safe records, relations, search, counts, activity, exports, and
  coordinated local caches;
- explicit version conflicts, immediate revocation, offline reconciliation, and
  auditable access changes;
- assignments, comments, notifications, and simultaneous native-document
  editing through a dedicated, proven collaboration adapter.

The delivered collaboration foundation includes versioned membership and Space
grants, fresh-policy authorization, scoped Hub projections, revocation-driven
cache removal, and a desktop access-management surface. A packaged two-human
gate now proves private-Space exclusion, offline edit acceptance, stale edit
rejection after a view-only downgrade, and atomic local projection removal
after revocation. The desktop and kernel also support one versioned responsible
member or guest per Task, with scoped candidates, explicit conflicts, audit,
activity, safe former-member states, and durable local/Hub projections. Tasks
and Projects now also have attributed, resolvable comment threads; Commenter is
a distinct Space access level, mentions and assignments create recipient-only
durable attention, and system delivery is isolated behind a main-process
adapter. Native documents use a replaceable Yjs/Hocuspocus collaboration
adapter with encrypted local state, offline convergence, immediate
read-only/revoked session enforcement, named revisions, restore, and scoped
purge. Packaged macOS and Windows gates prove the complete two-human
online/offline, conflict, revocation, document-revision, and recovery journey.

## Delivered foundation — local external agents through MCP

Expose the application commands and queries as the only agent interface:

- versioned local MCP tools with scoped grants and agent identity;
- the same authorization, attribution, idempotency, conflict, and audit rules as
  desktop actions;
- structured evidence, receipts, checkpoints, and scoped revert for concurrent
  agent work;
- interoperability testing with multiple external agent hosts;
- credential rotation, expiry, revocation, and a desktop access-management
  surface that keeps capability scope separate from Space data scope.

Constellation will not embed a chat interface, model runtime, AI orchestrator,
or bespoke retrieval stack.

## Delivered foundation — remote MCP through the self-hosted Hub

Carry the same MCP contract across an explicitly configured, always-reachable
Hub endpoint without making a desktop the coordinator:

- reauthorize Workspace, Space, capability, and provider policy on every call;
- preserve equivalent receipts, conflicts, checkpoints, and scoped recovery;
- add bounded rate, replay, abuse, revocation, and disaster-recovery gates;
- keep local-only agent credentials device-local and require a distinct remote
  grant.

The self-hosted Hub now exposes the same versioned MCP tools over authenticated
stateless Streamable HTTP. Remote grants, credential digests, host runs,
receipts, checkpoints, revocations, and three independent cross-Workspace
authorities remain Hub-owned control state and never enter device projections.
The desktop creates, rotates, and revokes a remote grant without exposing its
bearer token to the renderer. Bounded request, rate, concurrency, replay,
PostgreSQL restart, and restore procedures complete the first operational gate.

## Delivered foundation — meetings, calendar, and connected work

- read calendar context through platform-neutral adapters, beginning with
  EventKit on macOS;
- create factual meeting context from authorized Constellation records;
- import normalized Jamie results idempotently while Jamie continues to own
  recording, transcription, and meeting intelligence;
- turn commitments, decisions, and follow-ups into independently managed work;
- require explicit consent for every concrete calendar write or previewed batch.

The first end-to-end loop is now present in the desktop Alpha. macOS reads an
EventKit projection through a narrow native helper, while other platforms
report their calendar capability explicitly. A user can connect a personal or
workspace Jamie API key through operating-system credential protection, import
recent results with stable meeting and task identity, distinguish partial
imports and source corrections, and manage each resulting item independently.
Calendar work blocks use an exact, expiring, single-use preview; no calendar
write occurs from a factual brief or Jamie import.

Imported meeting state also enters the ordinary versioned Hub command and
receipt feed. Coordinated projections therefore carry the same stable meeting
identity to another authorized device; revocation and Space filtering use the
existing synchronization boundary rather than a meeting-specific protocol.

## Delivered foundation — knowledge, relationships, and strategic depth

The first knowledge journey now preserves Sources separately from evolving
Notes, Documents, and Deliverables. Explicit evidence links remain editable,
while each named milestone freezes one collaborative revision, content snapshot,
and the exact versions of every source and Note used. Changed evidence is shown
without rewriting delivered history. The same versioned commands, deterministic
search, audit, recovery, encrypted restart, and Space-scoped Hub projection
rules apply to desktop and MCP operators.

The graph now also connects Organizations and People to Opportunities, Offers,
and Projects without copying the outcome records. Date-aware Renewals create
one deduplicated ordinary follow-up Task, relationship facts retain evidence and
freshness, and replaced Decisions preserve history while opening a bounded
impact review. Areas, recurring Task occurrences, reversible Project closure,
and a finite material-key-deduplicated Knowledge Radar deepen everyday work
without adding generated answers to the desktop application. These records use
the same deterministic search, activity, export, audit, recovery, MCP, local
store, and Space-scoped Hub projection rules as the earlier graph.

Native documents have crossed the first connected-document boundary. The
desktop now edits versioned structured Yjs content with paragraphs, headings,
lists, emphasis, links, and code blocks; existing plaintext documents migrate
once, named revisions restore rich structure, and schema negotiation prevents
an older client from silently flattening newer work. This keeps rich writing on
the same encrypted local and self-hosted collaboration path as the original
document editor. Typed inline references now connect that writing to Tasks,
Projects, People, Organizations, and Meetings. Permission-safe backlinks appear
in record inspectors and use the shared MCP query surface; labels resolve from
current authorized records and exact source navigation opens the linked
document. Global search now finds phrases inside locally available authorized
document bodies, identifies the match as `Treść`, opens the exact document, and
purges the rebuildable encrypted index on access loss. Structured local/remote
agent editing now uses one bounded v1 block contract over that same Yjs state.
Every write reauthorizes the document, Space, grant, schema, state vector, and
typed targets; stale work conflicts, retries are idempotent, and the returned
rich revision can be restored through MCP as a new reversible change. The v5
exchange package carries current structured content, body text, and remappable
Task or Project links while excluding revision history and live awareness.
Generic managed attachments and the remaining connected-document layers are
the next work on this foundation.

## Delivered foundation — coherent desktop Alpha and release candidate

The desktop application is now one coherent, recoverable product surface rather
than a collection of architectural demonstrations. Universal Capture handles
text, URLs, and file references; Work connects Areas, Initiatives, Projects,
dependencies, waiting direction, next actions, and saved deterministic views;
and the relationship surface directly operates People, Offers, Renewals,
sourced facts, Decisions, recurrences, and finite Radar review. Onboarding,
Settings, independent encrypted workspaces, cross-workspace focus, restored
navigation, detached windows, and starter imports complete the current Alpha.

Hosted macOS and Windows gates prove the application, Hub, collaboration,
recovery, update, compatible rollback, and uninstall journeys. A protected
workflow has also produced an unpublished `0.1.0` GitHub Release draft whose
Apple Silicon and Intel artifacts are Developer ID signed, notarized, stapled,
and Gatekeeper accepted. Windows remains built and packaged as a first-class
target, while paid Windows production signing is intentionally deferred.

This is a dogfoodable desktop Alpha and a release candidate, not yet the final
desktop product or a published release.

## Current — desktop product readiness

Close the remaining difference between a verified Alpha and a desktop product
that can carry real daily work:

1. dogfood representative personal work through onboarding, capture, planning,
   meetings, knowledge, relationships, recovery, and weekly review; convert
   observed friction into bounded fixes without committing private work data;
2. complete Universal Capture on desktop with managed file payloads,
   screenshots, dictation, encrypted short voice notes, explicit retention, and
   the full ambiguity/failure/permission/conflict recovery vocabulary;
3. close daily-use gaps exposed by dogfooding while preserving the shared
   command/query, authorization, audit, sync, and recovery boundaries;
4. finish Visual Atlas review plus keyboard, screen-reader, contrast,
   transparency, motion, narrow-window, macOS, and Windows quality gates;
5. prove supported upgrades, backup/restore, Hub recovery, performance, and
   clean-checkout reliability at the release candidate;
6. publish a reviewed signed and notarized macOS release only after those gates
   pass, while retaining Windows functional and packaged parity without calling
   an unsigned Windows artifact a production release.

Desktop product readiness does not require a managed Constellation backend, a
public extension API, or paid Windows signing. Those capabilities must not
weaken local-only and self-hosted operation if introduced later.

The first bounded Universal Capture readiness slice now places one selected,
dropped, or pasted file/screenshot into encrypted local workspace custody before
routing, without retaining its local path. A coordinated workspace now accepts
the Capture only after the same bytes are published through the Hub's resumable,
digest-verified attachment channel; transfer failure keeps the local original
and a direct retry path, while revoked scope purges it. Authorized local and
remote MCP hosts can read one managed Capture payload only as a versioned
resource: bounded internal chunks are reauthorized, reassembled, and verified
before a blob is returned. Capture exceptions now use an explicit
ambiguity/duplicate/parsing/permission/conflict/missing/partial/unknown
vocabulary. Resolving one exception changes the Capture and closes its exact
Attention signal atomically; a missing managed payload can be replaced only
after the runtime proves the new bytes. Quick Capture now also records a bounded
short voice note through an audio-only desktop permission, preserves it in the
same encrypted custody, waits without Attention debt, and exposes its bytes only
to an MCP grant with the separate `capture.audioRead` capability. A separately
granted, expected-version transcript command binds durable text and agent-run
provenance to the exact audio digest. The frozen Capture policy then either
retains audio explicitly or enters two-phase deletion: reads stop immediately,
local or Hub custody verifies reference-safe removal, and only then records the
audio as deleted. Workspace defaults are prospective, per-capture overrides
remain visible, and retained audio can be deleted later from Capture History.
The first desktop-quality acceptance correction also removes an obsolete
minimum shell width: Week, Meetings, Settings, tabs, and Quick Capture now stay
inside a 320 px desktop window, the collapsed rail keeps non-overlapping 44 px
destinations, and dismissing Quick Capture restores keyboard focus to its exact
invoking control. The initial renderer also keeps the shell and weekly cockpit
immediately available while loading heavier destinations on intent; a measured
bundle budget now prevents startup cost from growing unnoticed.
The accepted enterprise-shell correction now keeps the main work plane at full
width until an object is deliberately activated. Its single context inspector
can be closed, dismissed with Escape, and resized on wide windows. All 12
destinations use the same hierarchy and recovery grammar; the weekly cockpit
keeps first focus, exceptions, active work, and intended project outcomes in a
stable reading order. Light-theme semantic status text now meets the measured
contrast floor without turning status color into a competing accent.
Local write failures now distinguish exhausted capacity from lost permission,
confirm rollback before offering retry, and tell the user which environmental
condition to correct without exposing paths or native errors.
Release packaging also preserves Constellation, runtime dependency, SQLCipher,
and platform-native license notices as externally inspectable files and fails
closed if the required notice set is incomplete.

The everyday work model has now closed its first accepted gaps. A Task
carries optional bounded working context and a separate next action, so
resuming work does not require a linked document; optional start and deadline
instants plus a small closed priority vocabulary make planning real, with the
previously unsatisfiable due ordering replaced by a tested null-ordering
contract and cursor-safe filters. The weekly cockpit composes the week around
real deadlines — late work first, a day-by-day week plan, and an honest note
for undated work — instead of treating creation time as a plan. Outcomes can
be decomposed into one deliberate level of subtasks with fully independent
state and no automatic parent completion, and lightweight waiting work
records an explicit direction and review date. Task workflow statuses are
configurable workspace behavior with a closed broad operational meaning, an
archived lifecycle that never rewrites existing Tasks, and a managed default.
Saved work views apply a typed, closed filter vocabulary with deterministic
ordering and honest empty states. Imported timing provenance is preserved:
recurring occurrences inherit their due moment and renewal follow-ups carry
their review deadline.

On top of that model sits a configurable workspace layer, delivered as the
same kind of versioned, audited, undoable workspace records as statuses.
Typed extension fields (text, number, date, constrained choice) attach
values to Tasks and Projects that inherit the record's own authorization, so
configuration can never become a permission bypass and no free-form JSON
enters the graph. Project templates bundle starter Tasks and field
references; applying one is always an explicit, prospective command that
only adds what is missing, stamps provenance, and is exactly undoable —
editing a template never rewrites existing projects. Saved views gained a
full lifecycle (rename, update, soft delete), typed field conditions, and
declared grouping with deterministic group order. Automations are bounded,
deterministic recipes rather than scripts: completing a Task can enter a
configured status inside the same transaction, audit entry, and undo as the
completion, and an elapsed waiting-review date raises a deduplicated
attention signal through an idempotent, rate-bounded sweep — automated
effects never cascade and disabling a rule never rewrites history.

Data also moves in and out honestly. One import engine covers a versioned
JSON exchange format and a documented tasks CSV, both validated whole-file
at preview with row-numbered errors, executed only through the ordinary
versioned commands, and safe to re-run: the same file idempotently
completes an interrupted import instead of duplicating records. For
external agents, the local MCP endpoint now publishes a grant-filtered
operation catalog — every command and query the grant authorizes, each
with its full strict envelope schema, generated from the kernel's own
contracts so it cannot drift — making the agent surface discoverable
without out-of-band documentation.

Agent access also stopped promising more than it granted. The capability
scope behind each preset is now derived from one classification of the whole
vocabulary, so a granted agent operates through the same commands as the
desktop across the surface those commands cover — creating and editing Tasks,
projecting meetings into the work graph, templates, typed fields, statuses,
automations, recurrences, time reservations — while five administrative
capabilities stay undelegable by design: managing workspace access, managing
agent access, creating a workspace, renaming it, and exporting a workspace
scope. A new capability cannot quietly land outside that decision, because
an unclassified one fails the build. The same partition governs remote
grants through a self-hosted Hub, and a refused capability is now named
instead of being reported as an unreachable Hub.

## Later — desktop ecosystem after product readiness

- a signed public Windows installer when a maintainer or sponsor provisions a
  suitable paid signing identity;
- stable extension points and compatibility policy after the underlying
  contracts earn stability through real use;
- an optional managed Data Home without weakening local-only or self-hosted
  paths;
- broader release operations such as staged channels, additional provider
  migrations, and longer supported upgrade windows when evidence justifies
  their maintenance cost.

## Outside the current roadmap — mobile client

A mobile capture and review companion remains compatible with the long-term
product direction, but it is explicitly outside the current scope. No mobile
implementation work is planned until the product owner brings it back into
scope after desktop product readiness.

## What will not change silently

Major changes to product behavior, privacy, recurring cost, licensing, or the
long-term scope will be discussed publicly before this roadmap is rewritten.
Implementation order may change when evidence exposes a safer or simpler path.

See the [README](README.md) for the current verified repository status and
[GitHub Discussions](https://github.com/kacperpietrzyk/constellation/discussions)
for product discussion.
