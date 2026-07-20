import type { CalendarCapability } from "@constellation/contracts";

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
    return "Na tym urządzeniu nie ma obsługiwanego kalendarza, więc spotkania nie są tu widoczne.";
  if (capability.availability === "permission_required")
    return "Pokazanie spotkań wymaga dostępu do Kalendarza. Przyznaj uprawnienie w Spotkaniach.";
  if (capability.availability === "permission_denied")
    return "Dostęp do Kalendarza jest wyłączony, więc spotkania nie są tu widoczne.";
  if (capability.availability === "provider_unavailable")
    return "Provider kalendarza nie jest dostępny, więc spotkania nie są tu widoczne.";
  if (!capability.canRead)
    return "Ten kalendarz nie pozwala na odczyt, więc spotkania nie są tu widoczne.";
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
        "Na tym urządzeniu nie ma obsługiwanego kalendarza, więc nie można zarezerwować czasu.",
    };
  if (capability.availability === "permission_required")
    return {
      kind: "unavailable",
      reason:
        "Zarezerwowanie czasu wymaga pełnego dostępu do Kalendarza. Przyznaj uprawnienie w Spotkaniach.",
    };
  if (capability.availability === "permission_denied")
    return {
      kind: "unavailable",
      reason:
        "Dostęp do Kalendarza jest wyłączony, więc nie można zarezerwować czasu.",
    };
  if (capability.availability === "provider_unavailable")
    return {
      kind: "unavailable",
      reason:
        "Provider kalendarza nie jest dostępny, więc nie można zarezerwować czasu.",
    };
  if (!capability.canWriteOwnedBlocks)
    return {
      kind: "unavailable",
      reason:
        "Ten kalendarz nie zezwala na zapis własnych bloków, więc nie można zarezerwować czasu.",
    };
  // Available and writable, but the provider names no calendar for new events.
  // Guessing one would write where the user never asked.
  if (capability.defaultWriteCalendarExternalId === undefined)
    return {
      kind: "unavailable",
      reason:
        "Kalendarz nie wskazuje domyślnego miejsca na nowe wydarzenia, więc nie wiadomo, gdzie zapisać blok.",
    };
  return {
    kind: "ready",
    calendarExternalId: capability.defaultWriteCalendarExternalId,
  };
};
