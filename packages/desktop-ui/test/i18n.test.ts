import assert from "node:assert/strict";
import test from "node:test";

import { dateKeyInZone, instantForZonedDate } from "../src/i18n.js";

test("zoned deadline keeps the chosen Warsaw calendar day to its last millisecond", () => {
  const dueAt = instantForZonedDate("2026-07-24", "Europe/Warsaw", "end");

  assert.equal(dueAt, "2026-07-24T21:59:59.999Z");
  assert.equal(dateKeyInZone(dueAt!, "Europe/Warsaw"), "2026-07-24");
});

test("zoned date boundaries converge on both sides of a DST transition", () => {
  const startAt = instantForZonedDate("2026-03-29", "Europe/Warsaw", "start");
  const dueAt = instantForZonedDate("2026-03-29", "Europe/Warsaw", "end");

  assert.equal(startAt, "2026-03-28T23:00:00.000Z");
  assert.equal(dueAt, "2026-03-29T21:59:59.999Z");
  assert.equal(dateKeyInZone(startAt!, "Europe/Warsaw"), "2026-03-29");
  assert.equal(dateKeyInZone(dueAt!, "Europe/Warsaw"), "2026-03-29");
});
