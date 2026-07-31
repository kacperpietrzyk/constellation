import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSurfaceDensity,
  persistSurfaceDensity,
  readSurfaceDensity,
  surfaceDensityStorageKey,
} from "../src/hooks/useSurfaceDensity.js";

test("surface density is closed, local, and fail-safe", () => {
  assert.equal(parseSurfaceDensity("compact"), "compact");
  assert.equal(parseSurfaceDensity("comfortable"), "comfortable");
  assert.equal(parseSurfaceDensity("dense"), "comfortable");
  assert.equal(parseSurfaceDensity({ compact: true }), "comfortable");
  assert.equal(
    surfaceDensityStorageKey("tasks"),
    "constellation.surface-density.tasks",
  );

  assert.equal(
    readSurfaceDensity("tasks", { getItem: () => "compact", setItem() {} }),
    "compact",
  );
  assert.equal(
    readSurfaceDensity("tasks", {
      getItem: () => {
        throw new Error("storage denied");
      },
      setItem() {},
    }),
    "comfortable",
  );

  let written: readonly [string, string] | undefined;
  persistSurfaceDensity("tasks", "compact", {
    getItem: () => null,
    setItem: (key, value) => {
      written = [key, value];
    },
  });
  assert.deepEqual(written, ["constellation.surface-density.tasks", "compact"]);
  assert.doesNotThrow(() =>
    persistSurfaceDensity("tasks", "compact", {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage denied");
      },
    }),
  );
});

test("a density stored before the surface was renamed is read forward, not reset", () => {
  // Widening the union alone would have thrown every stored choice away in
  // silence: `getItem` answers null under the new key, `parseSurfaceDensity`
  // answers "comfortable", nothing is logged and nothing throws. The reader
  // would have found their compact list comfortable again with no way to tell
  // whether they had ever set it.
  const legacy = new Map([["constellation.surface-density.work", "compact"]]);
  assert.equal(
    readSurfaceDensity("tasks", {
      getItem: (key) => legacy.get(key) ?? null,
      setItem() {},
    }),
    "compact",
  );

  // The current key WINS when both are set: a choice made since the rename is
  // the newer fact.
  assert.equal(
    readSurfaceDensity("tasks", {
      getItem: (key) =>
        key === "constellation.surface-density.tasks"
          ? "comfortable"
          : "compact",
      setItem() {},
    }),
    "comfortable",
  );

  // Writing goes forward only. The retired key is read from and never written
  // to, so it stops meaning anything the first time a choice is made.
  let written: readonly [string, string] | undefined;
  persistSurfaceDensity("tasks", "comfortable", {
    getItem: () => null,
    setItem: (key, value) => {
      written = [key, value];
    },
  });
  assert.deepEqual(written, [
    "constellation.surface-density.tasks",
    "comfortable",
  ]);
});
