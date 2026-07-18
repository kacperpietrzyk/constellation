/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activityCategoryFor,
  filterActivityItems,
  groupActivityItems,
  type ActivityItem,
} from "../src/activity-collection.js";

const item = (
  activityType: ActivityItem["activityType"],
  occurredAt: string,
  recordId = "11111111-1111-4111-8111-111111111111",
): ActivityItem =>
  ({
    eventId: crypto.randomUUID(),
    targetCommandId: crypto.randomUUID(),
    activityType,
    recordId,
    occurredAt,
  }) as ActivityItem;

describe("activity collection", () => {
  const items = [
    item("task_completed", "2026-07-18T08:00:00.000Z"),
    item(
      "knowledge_source_updated",
      "2026-07-18T07:00:00.000Z",
      "22222222-2222-4222-8222-222222222222",
    ),
    item("command_undone", "2026-07-17T18:00:00.000Z"),
  ];

  it("maps every meaningful change to a truthful user-facing category", () => {
    assert.equal(activityCategoryFor(items[0]!), "work");
    assert.equal(activityCategoryFor(items[1]!), "knowledge");
    assert.equal(activityCategoryFor(items[2]!), "recovery");
  });

  it("filters by category, human label, and stable record prefix", () => {
    assert.deepEqual(filterActivityItems(items, "knowledge", ""), [items[1]]);
    assert.deepEqual(filterActivityItems(items, "all", "ukończono"), [
      items[0],
    ]);
    assert.deepEqual(filterActivityItems(items, "all", "22222222"), [items[1]]);
    assert.deepEqual(filterActivityItems(items, "work", "22222222"), []);
  });

  it("groups in source order with workspace-relative today labels", () => {
    const groups = groupActivityItems(
      items,
      "Europe/Warsaw",
      new Date("2026-07-18T12:00:00.000Z"),
    );
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.label, "Dzisiaj");
    assert.deepEqual(groups[0]?.items, [items[0], items[1]]);
    assert.equal(groups[1]?.label, "Wczoraj");
    assert.deepEqual(groups[1]?.items, [items[2]]);
  });
});
