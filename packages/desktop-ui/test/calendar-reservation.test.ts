import assert from "node:assert/strict";
import test from "node:test";

import {
  CalendarBlockDraftSchema,
  TaskIdSchema,
  type CalendarCapability,
} from "@constellation/contracts";

import {
  calendarDeletionDraft,
  calendarReadRefusal,
  nextReservationStart,
  reservationTarget,
} from "../src/client/calendar-reservation.js";

test("calendar deletion sends the strict provider draft without stored revision metadata", () => {
  const draft = calendarDeletionDraft(
    {
      ownedBlockExternalId: "task-block:00000000-0000-4000-8000-000000000001",
      calendarExternalId: "calendar-default",
      revision: "2026-07-22T11:25:15Z",
      startsAt: "2026-07-22T12:24:00.000Z",
      endsAt: "2026-07-22T13:24:00.000Z",
    },
    TaskIdSchema.parse("00000000-0000-4000-8000-000000000001"),
    "Release R16",
  );
  assert.deepEqual(Object.keys(draft).sort(), [
    "calendarExternalId",
    "endsAt",
    "expectedRevision",
    "ownedBlockExternalId",
    "sourceRecordIds",
    "startsAt",
    "title",
  ]);
  assert.doesNotThrow(() => CalendarBlockDraftSchema.parse(draft));
});

const writable: CalendarCapability = {
  platform: "macos",
  provider: "eventkit",
  availability: "available",
  canRead: true,
  canWriteOwnedBlocks: true,
  detailCode: "ok",
  defaultWriteCalendarExternalId: "calendar-default",
};

test("a new reservation starts in the future even after the old 09:00 default", () => {
  const now = new Date("2026-07-22T23:30:00+02:00");
  assert.equal(
    nextReservationStart(now).toISOString(),
    "2026-07-22T22:30:00.000Z",
  );
});

test("reserving time targets the calendar the provider uses for new events", () => {
  const target = reservationTarget(writable);
  assert.equal(target.kind, "ready");
  if (target.kind !== "ready") return;
  assert.equal(target.calendarExternalId, "calendar-default");
});

test("a writable calendar with no default target refuses rather than guessing", () => {
  // The regression this guards: a Task has no event to inherit a calendar
  // from, so a surface tempted to borrow one seen in an upcoming event would
  // write into a calendar that may be read-only or shared with other people.
  // Absence of the default is a first-class answer, not missing data.
  const withoutDefault: CalendarCapability = { ...writable };
  delete (withoutDefault as { defaultWriteCalendarExternalId?: string })
    .defaultWriteCalendarExternalId;
  const target = reservationTarget(withoutDefault);
  assert.equal(target.kind, "unavailable");
  if (target.kind !== "unavailable") return;
  assert.match(target.reason, /domyślnego miejsca/u);
});

test("every way a device can be unable to reserve time is refused distinctly", () => {
  const reasons = new Set<string>();
  for (const capability of [
    undefined,
    { ...writable, availability: "permission_required" as const },
    { ...writable, availability: "permission_denied" as const },
    { ...writable, availability: "provider_unavailable" as const },
    { ...writable, canWriteOwnedBlocks: false },
  ]) {
    const target = reservationTarget(capability);
    assert.equal(target.kind, "unavailable");
    if (target.kind !== "unavailable") return;
    reasons.add(target.reason);
  }
  // Distinct copy per cause: "cannot reserve" without the reason leaves the
  // owner with no idea whether to grant permission, switch device, or pick a
  // calendar.
  assert.equal(reasons.size, 5);
});

test("a readable but unwritable calendar cannot reserve time", () => {
  // canRead and canWriteOwnedBlocks are independent: seeing the day is not
  // permission to put something on it.
  const target = reservationTarget({
    ...writable,
    canRead: true,
    canWriteOwnedBlocks: false,
  });
  assert.equal(target.kind, "unavailable");
});

test("reading and writing a calendar are answered separately", () => {
  // A calendar that can be read but not written to must still show meetings.
  // Collapsing the two permissions would hide a day's meetings just because
  // the owner cannot reserve time in it.
  assert.equal(
    calendarReadRefusal({ ...writable, canWriteOwnedBlocks: false }),
    undefined,
  );
  assert.equal(
    reservationTarget({ ...writable, canRead: false }).kind,
    "ready",
  );
});

test("meetings that cannot be shown say why instead of looking like none", () => {
  // A day view that silently omits meetings looks like a day with no
  // meetings — a lie the owner would plan around.
  for (const capability of [
    undefined,
    { ...writable, availability: "permission_required" as const },
    { ...writable, availability: "permission_denied" as const },
    { ...writable, availability: "provider_unavailable" as const },
    { ...writable, canRead: false },
  ]) {
    assert.notEqual(calendarReadRefusal(capability), undefined);
  }
  assert.equal(calendarReadRefusal(writable), undefined);
});
