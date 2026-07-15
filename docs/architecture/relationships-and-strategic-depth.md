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

Desktop and MCP operators call the same commands. The desktop relationship
surface can create Organizations and Opportunities and renders the connected
thread; the remaining structured commands stay available through the shared
contract rather than a UI-only write path.

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

The desktop does not generate recommendations or answers from these records.
External agents may reason over authorized evidence through MCP, but their
mutations remain attributable, auditable, scoped, version-checked, and
recoverable like human actions.
