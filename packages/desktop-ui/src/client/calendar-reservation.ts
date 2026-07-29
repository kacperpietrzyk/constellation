import type {
  CalendarBlockDraft,
  CalendarCapability,
  TaskId,
} from "@constellation/contracts";

export const calendarDeletionDraft = (
  block: {
    readonly ownedBlockExternalId: string;
    readonly calendarExternalId: string;
    readonly revision: string;
    readonly startsAt: string;
    readonly endsAt: string;
  },
  taskId: TaskId,
  taskTitle: string,
): CalendarBlockDraft => ({
  ownedBlockExternalId: block.ownedBlockExternalId,
  calendarExternalId: block.calendarExternalId,
  title: taskTitle,
  startsAt: block.startsAt,
  endsAt: block.endsAt,
  expectedRevision: block.revision,
  sourceRecordIds: [`task:${taskId}`],
});

// A same-day 09:00 default becomes a guaranteed provider failure once the
// owner opens the inspector later in the day. Start one hour ahead instead;
// the surface still validates at submit time in case the form stayed open.
export const nextReservationStart = (now = new Date()): Date =>
  new Date(now.getTime() + 3_600_000);

// R12.6 / ADR-042 — decides whether this device can reserve time for a Task,
// and where that reservation would be written.
//
// A Task has no event to inherit a calendar from, unlike a meeting-prep block,
// so the only honest target is the calendar the provider designates for new
// events. When that is absent the answer is "time cannot be reserved here" —
// never a nearby calendar, which may be read-only or shared with other people.
//
// Kept as a pure function so every refusal path is testable without a browser
// or a real calendar provider: the interesting cases are all refusals, and
// they are the ones a surface is most likely to get silently wrong.
// Reading a calendar and writing to it are separate permissions, so they get
// separate answers. This one asks only "can meetings be shown here", and
// returns the reason when they cannot — a day view that silently omits
// meetings looks like a day with no meetings, which is a lie the owner would
// plan around.
export const calendarReadRefusal = (
  capability: CalendarCapability | undefined,
): string | undefined => {
  if (capability === undefined)
    return "No supported calendar on this device, so meetings cannot be shown here.";
  if (capability.availability === "permission_required")
    return "Showing meetings needs Calendar access. Grant the permission in Meetings.";
  if (capability.availability === "permission_denied")
    return "Calendar access is turned off, so meetings cannot be shown here.";
  if (capability.availability === "provider_unavailable")
    return "The calendar provider is unavailable, so meetings cannot be shown here.";
  if (!capability.canRead)
    return "This calendar does not allow reading, so meetings cannot be shown here.";
  return undefined;
};

export type ReservationTarget =
  | { readonly kind: "ready"; readonly calendarExternalId: string }
  | { readonly kind: "unavailable"; readonly reason: string };

export const reservationTarget = (
  capability: CalendarCapability | undefined,
): ReservationTarget => {
  // The meeting loop itself is missing — no supported provider on this device.
  if (capability === undefined)
    return {
      kind: "unavailable",
      reason:
        "No supported calendar on this device, so time cannot be reserved.",
    };
  if (capability.availability === "permission_required")
    return {
      kind: "unavailable",
      reason:
        "Reserving time needs full Calendar access. Grant the permission in Meetings.",
    };
  if (capability.availability === "permission_denied")
    return {
      kind: "unavailable",
      reason: "Calendar access is turned off, so time cannot be reserved.",
    };
  if (capability.availability === "provider_unavailable")
    return {
      kind: "unavailable",
      reason:
        "The calendar provider is unavailable, so time cannot be reserved.",
    };
  if (!capability.canWriteOwnedBlocks)
    return {
      kind: "unavailable",
      reason:
        "This calendar does not allow writing owned blocks, so time cannot be reserved.",
    };
  // Available and writable, but the provider names no calendar for new events.
  // Guessing one would write where the user never asked.
  if (capability.defaultWriteCalendarExternalId === undefined)
    return {
      kind: "unavailable",
      reason:
        "The calendar names no default place for new events, so there is nowhere to write the block.",
    };
  return {
    kind: "ready",
    calendarExternalId: capability.defaultWriteCalendarExternalId,
  };
};
