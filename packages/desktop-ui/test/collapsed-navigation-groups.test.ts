import assert from "node:assert/strict";
import test from "node:test";

import {
  collapsedNavigationGroupsStorageKey,
  parseCollapsedNavigationGroups,
  persistCollapsedNavigationGroups,
  readCollapsedNavigationGroups,
} from "../src/hooks/useCollapsedNavigationGroups.js";

test("collapsed navigation groups are closed, canonical, local, and fail-safe", () => {
  assert.deepEqual(parseCollapsedNavigationGroups(undefined), []);
  assert.deepEqual(parseCollapsedNavigationGroups("Work Management"), []);
  assert.deepEqual(
    parseCollapsedNavigationGroups([
      "CRM",
      "unknown",
      "Work Management",
      "CRM",
    ]),
    ["Work Management", "CRM"],
  );
  assert.equal(
    collapsedNavigationGroupsStorageKey,
    "constellation.navigation-groups",
  );

  assert.deepEqual(
    readCollapsedNavigationGroups({
      getItem: () => '["Knowledge","Work Management"]',
      setItem() {},
    }),
    ["Work Management", "Knowledge"],
  );
  assert.deepEqual(
    readCollapsedNavigationGroups({
      getItem: () => "not-json",
      setItem() {},
    }),
    [],
  );
  assert.deepEqual(
    readCollapsedNavigationGroups({
      getItem: () => {
        throw new Error("storage denied");
      },
      setItem() {},
    }),
    [],
  );

  let written: readonly [string, string] | undefined;
  persistCollapsedNavigationGroups(["CRM", "Work Management"], {
    getItem: () => null,
    setItem: (key, value) => {
      written = [key, value];
    },
  });
  assert.deepEqual(written, [
    "constellation.navigation-groups",
    '["Work Management","CRM"]',
  ]);
  assert.doesNotThrow(() =>
    persistCollapsedNavigationGroups(["Knowledge"], {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage denied");
      },
    }),
  );
});
