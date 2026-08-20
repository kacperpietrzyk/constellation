/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as recordActivity from "../src/record/RecordActivityPanel.js";
import type { ActivityItem } from "../src/activity-collection.js";

const activityItem = (
  recordId: string,
  principalId: string,
  displayName: string,
): ActivityItem =>
  ({
    eventId: crypto.randomUUID(),
    targetCommandId: crypto.randomUUID(),
    activityType: "task_created",
    recordId,
    recordKind: "task",
    recordTitle: "Observable task",
    actor: {
      principalId,
      displayName,
      kind: "agent",
    },
    occurredAt: "2026-08-20T10:00:00.000Z",
  }) as ActivityItem;

describe("record activity actor wiring", () => {
  it("uses the shared authorized activity actor instead of a second resolver", () => {
    const recordId = "91111111-1111-4111-8111-111111111111";
    const hermes = activityItem(
      recordId,
      "92222222-2222-4222-8222-222222222222",
      "Hermes",
    );
    const claude = activityItem(
      recordId,
      "93333333-3333-4333-8333-333333333333",
      "Claude",
    );
    const entriesFor = (
      recordActivity as unknown as {
        recordActivityEntries: (
          items: readonly ActivityItem[],
          targetRecordId: string,
        ) => readonly {
          item: ActivityItem;
          actor?: { name: string; agent: boolean };
        }[];
      }
    ).recordActivityEntries;
    assert.deepEqual(entriesFor([hermes, claude], recordId), [
      { item: hermes, actor: { name: "Hermes", agent: true } },
      { item: claude, actor: { name: "Claude", agent: true } },
    ]);
  });
});
