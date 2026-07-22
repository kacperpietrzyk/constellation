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
  assert.deepEqual(parseCollapsedNavigationGroups("Praca"), []);
  assert.deepEqual(
    parseCollapsedNavigationGroups([
      "Administracja",
      "unknown",
      "Praca",
      "Administracja",
    ]),
    ["Praca", "Administracja"],
  );
  assert.equal(
    collapsedNavigationGroupsStorageKey,
    "constellation.navigation-groups",
  );

  assert.deepEqual(
    readCollapsedNavigationGroups({
      getItem: () => '["Wiedza","Praca"]',
      setItem() {},
    }),
    ["Praca", "Wiedza"],
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
  persistCollapsedNavigationGroups(["Administracja", "Praca"], {
    getItem: () => null,
    setItem: (key, value) => {
      written = [key, value];
    },
  });
  assert.deepEqual(written, [
    "constellation.navigation-groups",
    '["Praca","Administracja"]',
  ]);
  assert.doesNotThrow(() =>
    persistCollapsedNavigationGroups(["Wiedza"], {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage denied");
      },
    }),
  );
});
