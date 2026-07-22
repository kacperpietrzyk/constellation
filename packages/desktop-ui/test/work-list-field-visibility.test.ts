import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWorkListFieldVisibility,
  persistWorkListFieldVisibility,
  readWorkListFieldVisibility,
  workListFieldVisibilityStorageKey,
  type WorkListFieldKey,
} from "../src/hooks/useWorkListFieldVisibility.js";

const available: readonly WorkListFieldKey[] = [
  "context",
  "status",
  "assignee",
  "priority",
  "start",
  "due",
  "field:11111111-1111-4111-8111-111111111111",
];

test("Work list field visibility is bounded, canonical, per-view, and fail-safe", () => {
  assert.deepEqual(parseWorkListFieldVisibility(undefined, available), [
    "context",
    "priority",
    "due",
  ]);
  assert.deepEqual(parseWorkListFieldVisibility([], available), []);
  assert.deepEqual(
    parseWorkListFieldVisibility(["due", "context"], available),
    ["context", "due"],
  );
  assert.deepEqual(
    parseWorkListFieldVisibility(["context", "unknown"], available),
    ["context", "priority", "due"],
  );
  assert.deepEqual(
    parseWorkListFieldVisibility(["context", "context"], available),
    ["context", "priority", "due"],
  );
  assert.deepEqual(
    parseWorkListFieldVisibility(
      Array.from({ length: 33 }, () => "due"),
      available,
    ),
    ["context", "priority", "due"],
  );
  assert.equal(
    workListFieldVisibilityStorageKey("all"),
    "constellation.work-list-fields.all",
  );

  assert.deepEqual(
    readWorkListFieldVisibility("view-a", available, {
      getItem: (key) =>
        key === "constellation.work-list-fields.view-a"
          ? '["status","field:11111111-1111-4111-8111-111111111111"]'
          : null,
      setItem() {},
    }),
    ["status", "field:11111111-1111-4111-8111-111111111111"],
  );
  assert.deepEqual(
    readWorkListFieldVisibility("view-b", available, {
      getItem: () => "not-json",
      setItem() {},
    }),
    ["context", "priority", "due"],
  );
  assert.deepEqual(
    readWorkListFieldVisibility("view-c", available, {
      getItem: () => {
        throw new Error("storage denied");
      },
      setItem() {},
    }),
    ["context", "priority", "due"],
  );

  let written: readonly [string, string] | undefined;
  persistWorkListFieldVisibility("view-a", ["due", "context"], available, {
    getItem: () => null,
    setItem: (key, value) => {
      written = [key, value];
    },
  });
  assert.deepEqual(written, [
    "constellation.work-list-fields.view-a",
    '["context","due"]',
  ]);
  assert.doesNotThrow(() =>
    persistWorkListFieldVisibility("view-a", ["status"], available, {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage denied");
      },
    }),
  );
});
