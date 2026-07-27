import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarCapability } from "@constellation/contracts";

import { calendarAccessOutcome } from "../src/MeetingsSurface.js";

const capability = (
  overrides: Partial<CalendarCapability>,
): CalendarCapability => ({
  platform: "macos",
  provider: "eventkit",
  availability: "permission_required",
  canRead: false,
  canWriteOwnedBlocks: false,
  detailCode: "not_determined",
  ...overrides,
});

test("a granted request says the calendar is now readable", () => {
  assert.match(
    calendarAccessOutcome(
      capability({
        availability: "available",
        canRead: true,
        canWriteOwnedBlocks: true,
        detailCode: "full_access",
      }),
    ),
    /przyznany/i,
  );
});

test("a refusal by the person points at the system setting that reverses it", () => {
  const said = calendarAccessOutcome(
    capability({
      availability: "permission_denied",
      detailCode: "access_denied",
    }),
  );
  assert.match(said, /Odmówiono/);
  assert.match(said, /Ustawieniach systemowych/);
});

// The defect this test exists for: macOS refusing to raise the prompt is not a
// refusal by the person and not a broken build, and clicking the button again
// cannot fix it. Reported as "the button does nothing", because that is exactly
// what it looked like.
test("a suppressed prompt is named rather than left looking like a dead button", () => {
  const said = calendarAccessOutcome(
    capability({ detailCode: "permission_prompt_suppressed" }),
  );
  assert.match(said, /nie pokazał pytania/);
  assert.match(said, /Ustawieniach systemowych/);
  assert.notEqual(said, calendarAccessOutcome(capability({})));
});

test("an outcome that granted nothing never claims the calendar changed", () => {
  for (const outcome of [
    capability({}),
    capability({ availability: "error", detailCode: "unknown_authorization" }),
    capability({ detailCode: "permission_prompt_suppressed" }),
  ]) {
    assert.doesNotMatch(calendarAccessOutcome(outcome), /są już widoczne/);
  }
});
