# Relationships and strategic depth

The strategic-depth slice connects commercial context, recurring
responsibility, evidence freshness, and decision history to the existing work
graph. It does not introduce a separate CRM, automation engine, or review inbox.

## Commercial thread

An Organization is the durable relationship anchor. People may point to it,
while an Opportunity records the confirmed need, qualification, stage, next
action, and source IDs. Offers point to an existing Deliverable document;
Projects remain independent outcome records. Linking an Offer or Project to an
Opportunity preserves each record's identity and version history.

`project.operationalOverview` composes the authorized Project context from
those existing edges: active Task relations, meetings routed to the Project,
Documents whose derived rich-content links target it, Decisions whose stable
linked IDs include it, and client Organizations reached through an Opportunity
or routed meeting. Every contributing record must share the Project Workspace
and Space before its label or count is projected. The read is bounded and does
not create a second set of relations.

Desktop and MCP operators call the same commands. The desktop relationship
surface creates Organizations, People, Opportunities, Offer drafts tied to a
Deliverable, Renewals with one follow-up, sourced facts, Decisions and their
replacements, recurrence rules, and finite Radar candidates. The forms remain
attached to the connected consequence thread rather than becoming a separate
CRM or generic database builder.

## Time and consequence rules

- A Renewal is keyed by an explicit cycle. Creating it also creates exactly one
  ordinary follow-up Task and one deduplicated attention signal. Replaying the
  same cycle cannot create another follow-up.
- A relationship fact stores its evidence source IDs, verification time, and
  stale-after boundary. Staleness never deletes or silently replaces the last
  verified value.
- Superseding a Decision creates a replacement and a bounded impact-review
  record. The prior Decision remains resolvable, and linked Tasks, Offers,
  Documents, Deliverables, or commitments are never rewritten automatically.
- A recurrence generates an ordinary Task occurrence and advances its next due
  time. An Area remains a durable responsibility rather than a completable
  Project.
- An Initiative is a completable multi-Project outcome. Typed work links connect
  Projects to Areas or Initiatives and Tasks to their dependencies without
  forcing every record into one containment tree.
- An Area's responsibility and a Project's or Initiative's intended outcome are
  optional at creation. Imported work that predates the record often has no
  written intent, and requiring one only guarantees a plausible invention. A
  record created without it carries a derived `needsReview` flag in every
  projection that reads it; the desktop shows that gap instead of an empty line
  and routes to `project.updateOutcome`, `area.updateResponsibility`, or
  `initiative.updateOutcome`. Writing the text clears the flag; the empty string
  stays unrepresentable, so a blank can never pass for prose.
- Task operational state distinguishes actionable, waiting, and blocked work.
  Waiting records its direction explicitly; saved views keep deterministic
  structured filters rather than generated recommendations.
- Closing a Project is a versioned lifecycle change. Open Tasks and history are
  preserved, and reopening is an ordinary auditable command.
- Knowledge Radar candidates are deduplicated by material key. Review is finite:
  saved or dismissed items do not return without new source context.

## Shared operational boundary

Strategic records use encrypted SQLite schema v11 locally and the existing
Space-scoped Hub snapshot for coordinated workspaces. Revocation purges the
projection through the existing authorization path. They participate in
deterministic search, meaningful activity, scoped export, backup and restore,
audit receipts, expected-version conflicts, and generic local or remote MCP
transport.

The desktop Work destination presents this composition as one thread from
responsibility through outcome to next action, and states plainly where a link
in that thread has not been written yet. The desktop does not generate
recommendations or answers from these records.
External agents may reason over authorized evidence through MCP, but their
mutations remain attributable, auditable, scoped, version-checked, and
recoverable like human actions.
