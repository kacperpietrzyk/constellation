import assert from "node:assert/strict";
import test from "node:test";

import { MINIMUM_DESKTOP_WINDOW_WIDTH } from "../src/window-bounds.js";

test("the native desktop window permits the verified 320 px layout", () => {
  assert.equal(MINIMUM_DESKTOP_WINDOW_WIDTH, 320);
});
