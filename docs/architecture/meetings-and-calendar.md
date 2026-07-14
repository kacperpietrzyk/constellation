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
- Constellation writes only work blocks that it owns. Every concrete write or
  batch requires a fresh user confirmation.

## Platform capability

The macOS Alpha packages a narrow Swift EventKit helper. It requests full event
access, reads a bounded date range, and writes only events marked with a
Constellation ownership URL. EventKit identifiers and revisions remain at the
adapter boundary. The shared application and UI do not import native types.

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

## Calendar-write consent

A preview is bound to the workspace, human principal, provider calendar,
Constellation-owned block identity, exact title and time, source records, and
expected provider revision. The consent token is single use and expires after
five minutes. Altered values, replay, expired previews, and stale provider
revisions fail closed before a provider write.

## Current limitation

Meeting-loop state is durable in the encrypted local workspace database. It is
not yet part of the coordinated Hub command feed. That compatibility pass must
reuse the existing command, receipt, and authorization path; it must not create
a second synchronization protocol.
