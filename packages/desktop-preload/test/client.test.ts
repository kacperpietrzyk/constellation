import assert from "node:assert/strict";
import test from "node:test";

import { DESKTOP_CHANNELS, createRendererClient } from "../src/client.js";

test("renderer client exposes only the frozen M0 allow-list", () => {
  const calls: { channel: string; payload: unknown }[] = [];
  const client = createRendererClient((channel, payload) => {
    calls.push({ channel, payload });
    return Promise.resolve({});
  });

  assert.deepEqual(Object.keys(client).sort(), [
    "executeCommand",
    "getBuildInfo",
    "runQuery",
  ]);
  void client.getBuildInfo();
  assert.equal(calls[0]?.channel, DESKTOP_CHANNELS.getBuildInfo);
});
