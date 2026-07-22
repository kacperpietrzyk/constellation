# Meetings and calendar

The meeting loop connects upcoming calendar context, factual preparation,
Jamie results, follow-up work, and explicit calendar blocks without moving
recording or model execution into Constellation.

## Ownership boundaries

- System calendars remain the source of truth for events. The application sees
  only normalized calendar projections through a platform-neutral reader.
- Jamie remains responsible for recording, transcription, summaries, and task
  extraction. Constellation imports its result and retains provider identity.
- Constellation creates deterministic factual briefs from authorized graph
  evidence. It does not generate a narrative brief or call a model.
- Constellation writes or deletes only work blocks that it owns. Every concrete
  change or batch requires a fresh user confirmation.

## Platform capability

The macOS Alpha packages a narrow Swift EventKit helper. It requests full event
access, reads a bounded date range, and writes or deletes only events marked
with a Constellation ownership URL. EventKit identifiers and content-derived
revisions remain at the adapter boundary. The shared application and UI do not
import native types.

Windows currently reports `provider_unavailable`. Meeting results and their
follow-up work remain usable without calendar access; no silent fallback claims
that calendar data is current.

## Jamie import

The desktop supports Jamie personal and workspace API keys. The key is accepted
once by Electron main, encrypted by operating-system credential protection, and
never returned to the renderer. Synchronization uses Jamie's meeting list,
meeting detail, and meeting-filtered task list routes.

The provider meeting ID is the identity key. Stable task IDs come from the task
list rather than array position. Exact redelivery is a no-op. A correction
updates source-controlled values, preserves independently changed local work,
and exposes a conflict when both sides changed the same value. If stable task
IDs are temporarily unavailable, the meeting is retained as a partial import
and can converge on a later retry.

## Work-graph projection

Import never mutates the work graph. Turning a meeting into connected work is
three explicit, authorized, undoable commands:

- `meeting.route` sets a project and an organization at meeting level, and may
  move the meeting to another Space. A Space move is refused once any work item
  has been promoted, because the created Tasks and their relations already live
  in the meeting's Space.
- `meeting.promoteWorkItem` turns a `task` or `follow_up` item into a real Task,
  carrying the source due instant, relating it to the routed project, and
  writing the Task identifier back onto the work item. That back-reference makes
  the operation idempotent: promoting the same item twice is refused rather than
  creating a second Task. Promotion requires the Task-creation capability in
  addition to its own, so it cannot become a path around the Task grant.
- `meeting.linkParticipants` links participants to People. An exact email match
  links an existing Person; a participant with an unmatched email becomes a new
  Person; a participant known only by name is reported for explicit review.
  Name similarity is never a matching signal, so two people who share a name are
  never merged.

A Jamie assignee remains source provenance and never becomes a Constellation
responsibility by import or promotion.

Routing, participant links, and promoted Task identifiers are workspace-owned:
they are carried across re-import and are never accepted from a Jamie payload.
A corrected redelivery therefore refreshes meeting content while leaving the
graph intact, which is what keeps repeated delivery free of duplicate meetings,
people, and tasks.

Undo runs on the ordinary previewed-undo path. Undoing a promotion removes the
created Task and returns the work item to promotable state, refusing when the
Task already has later writes. Undoing participant linking restores the prior
links but deliberately does not delete People it created, since a Person may
already be referenced elsewhere.

## Calendar-write consent

A preview is bound to its operation (`write` or `delete`), workspace, human
principal, provider calendar, Constellation-owned block identity, exact title
and time, source records, and expected provider revision. The consent token is
single use and expires after five minutes. Altered values, cross-operation
replay, expired previews, and stale provider revisions fail closed before the
provider changes. A Task may clear only its graph descriptor without claiming
that the EventKit event was removed; provider deletion and descriptor clearing
are reported separately if the second step fails.

## Current limitation

Meeting-loop state is durable in the encrypted local workspace database.
Normalized imported meetings are also strategic records published through
`meeting.upsertImported`, the ordinary Hub command/receipt feed, and the same
Space-scoped coordinated snapshot used by other records. Loading that projection
hydrates the local meeting surface on another authorized device. Local calendar
capabilities, provider credentials, exact write previews, and unsynchronized
optimistic edits remain device concerns; they are not copied through Hub state.

EventKit and Jamie can expose different identifiers for the same real-world
meeting. Factual preparation therefore still requires an exact provider link
and remains empty when one cannot be established safely.
