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
    surfaceDensityStorageKey("work"),
    "constellation.surface-density.work",
  );

  assert.equal(
    readSurfaceDensity("work", { getItem: () => "compact", setItem() {} }),
    "compact",
  );
  assert.equal(
    readSurfaceDensity("work", {
      getItem: () => {
        throw new Error("storage denied");
      },
      setItem() {},
    }),
    "comfortable",
  );

  let written: readonly [string, string] | undefined;
  persistSurfaceDensity("work", "compact", {
    getItem: () => null,
    setItem: (key, value) => {
      written = [key, value];
    },
  });
  assert.deepEqual(written, ["constellation.surface-density.work", "compact"]);
  assert.doesNotThrow(() =>
    persistSurfaceDensity("work", "compact", {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage denied");
      },
    }),
  );
});
