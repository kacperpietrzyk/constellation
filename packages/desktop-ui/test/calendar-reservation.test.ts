import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarCapability } from "@constellation/contracts";

import { reservationTarget } from "../src/client/calendar-reservation.js";

const writable: CalendarCapability = {
  platform: "macos",
  provider: "eventkit",
  availability: "available",
  canRead: true,
  canWriteOwnedBlocks: true,
  detailCode: "ok",
  defaultWriteCalendarExternalId: "calendar-default",
};

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
