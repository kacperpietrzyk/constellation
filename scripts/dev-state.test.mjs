import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEV_STATE_DIRECTORY,
  INSTALLED_APP_NAME,
  SNAPSHOT_ENTRIES,
  agentDescriptors,
  devStateRoot,
  installedStateRoot,
  localSocketPath,
  socketPathFits,
} from "./dev-state.mjs";

test("state roots sit beside each other under Application Support", () => {
  const home = "/Users/example";
  assert.equal(
    installedStateRoot(home),
    `/Users/example/Library/Application Support/${INSTALLED_APP_NAME}`,
  );
  assert.equal(
    devStateRoot(home),
    `/Users/example/Library/Application Support/${DEV_STATE_DIRECTORY}`,
  );
});

test("the development socket fits the portable budget the installed one uses", () => {
  const home = os.homedir();
  assert.equal(socketPathFits(devStateRoot(home)), true);
  assert.equal(
    Buffer.byteLength(localSocketPath(devStateRoot(home))) <=
      Buffer.byteLength(localSocketPath(installedStateRoot(home))),
    true,
  );
});

test("an overlong home is reported rather than silently rerouted to /tmp", () => {
  const home = `/Users/${"n".repeat(120)}`;
  assert.equal(socketPathFits(devStateRoot(home)), false);
});

test("the snapshot carries the key wrapper and the agent grants, never the socket", () => {
  assert.equal(SNAPSHOT_ENTRIES.includes("local-alpha-workspace"), true);
  assert.equal(SNAPSHOT_ENTRIES.includes(path.join("mcp", "agents")), true);
  assert.equal(
    SNAPSHOT_ENTRIES.some((entry) => entry.includes("application.sock")),
    false,
  );
  assert.equal(SNAPSHOT_ENTRIES.includes("mcp"), false);
});

test("agent descriptors are listed in a stable order and tolerate no directory", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "dev-state-"));
  assert.deepEqual(agentDescriptors(fixture), []);
  const agents = path.join(fixture, "mcp", "agents");
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, "b.json"), "{}");
  fs.writeFileSync(path.join(agents, "a.json"), "{}");
  fs.writeFileSync(path.join(agents, "notes.txt"), "ignored");
  assert.deepEqual(agentDescriptors(fixture), [
    path.join(agents, "a.json"),
    path.join(agents, "b.json"),
  ]);
  fs.rmSync(fixture, { recursive: true, force: true });
});
