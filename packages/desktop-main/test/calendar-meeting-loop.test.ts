import assert from "node:assert/strict";
import test from "node:test";

import { NativeCalendarAdapter } from "../src/calendar-meeting-loop.js";

test("Windows calendar capability is explicit and never invokes EventKit", async () => {
  let invoked = false;
  const adapter = new NativeCalendarAdapter("win32", async () => {
    invoked = true;
    return {};
  });
  const result = await adapter.readUpcoming({
    from: "2026-07-15T00:00:00.000Z",
    to: "2026-07-16T00:00:00.000Z",
  });
  assert.equal(result.capability.platform, "windows");
  assert.equal(result.capability.availability, "provider_unavailable");
  assert.equal(result.freshness, "partial");
  assert.equal(invoked, false);
  assert.deepEqual(await adapter.writeOwnedBlocks({ blocks: [] }), {
    outcome: "rejected",
    code: "provider_unavailable",
  });
  assert.deepEqual(await adapter.deleteOwnedBlocks({ blocks: [] }), {
    outcome: "rejected",
    code: "provider_unavailable",
  });
});

test("macOS calendar adapter deletes only through the native delete command", async () => {
  const blocks = [
    {
      calendarExternalId: "calendar-1",
      ownedBlockExternalId: "task-block:task-1",
      title: "Release review",
      startsAt: "2026-07-22T08:00:00.000Z",
      endsAt: "2026-07-22T09:00:00.000Z",
      expectedRevision: "rev-1",
      sourceRecordIds: ["task:task-1"],
    },
  ];
  const adapter = new NativeCalendarAdapter(
    "darwin",
    async (command, payload) => {
      assert.equal(command, "delete");
      assert.deepEqual(payload, { blocks });
      return { outcome: "applied", revisions: [] };
    },
  );
  assert.deepEqual(await adapter.deleteOwnedBlocks({ blocks }), {
    outcome: "applied",
    revisions: [],
  });
});

test("macOS calendar adapter validates the native projection boundary", async () => {
  const adapter = new NativeCalendarAdapter("darwin", async (command) => {
    assert.equal(command, "read");
    return {
      capability: {
        platform: "macos",
        provider: "eventkit",
        availability: "available",
        canRead: true,
        canWriteOwnedBlocks: true,
        detailCode: "full_access",
      },
      events: [
        {
          provider: "eventkit",
          calendarExternalId: "calendar-1",
          eventExternalId: "event-1",
          revision: "2026-07-15T09:00:00.000Z",
          title: "Delivery review",
          startsAt: "2026-07-16T09:00:00.000Z",
          endsAt: "2026-07-16T10:00:00.000Z",
          isAllDay: false,
          attendees: [],
        },
      ],
    };
  });
  const result = await adapter.readUpcoming({
    from: "2026-07-15T00:00:00.000Z",
    to: "2026-07-17T00:00:00.000Z",
  });
  assert.equal(result.events[0]?.eventExternalId, "event-1");
  assert.equal(result.freshness, "current");
});

test("malformed native output fails to an honest calendar error", async () => {
  const adapter = new NativeCalendarAdapter("darwin", async () => ({
    capability: { availability: "available" },
    events: [],
  }));
  const result = await adapter.readUpcoming({
    from: "2026-07-15T00:00:00.000Z",
    to: "2026-07-17T00:00:00.000Z",
  });
  assert.equal(result.capability.availability, "error");
  assert.equal(result.capability.detailCode, "eventkit_helper_failed");
});
