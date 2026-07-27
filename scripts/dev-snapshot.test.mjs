import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  copySnapshot,
  installedApplicationIsRunning,
  mcpServerEntry,
} from "./dev-snapshot.mjs";

const seedSource = () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-src-"));
  const workspace = path.join(source, "local-alpha-workspace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "key-wrapper.json"), "{}");
  fs.writeFileSync(path.join(workspace, "workspace.db"), "db");
  fs.writeFileSync(path.join(source, "workspace-registry.json"), "{}");
  fs.mkdirSync(path.join(source, "mcp", "agents"), { recursive: true });
  fs.writeFileSync(path.join(source, "mcp", "agents", "grant.json"), "{}");
  fs.writeFileSync(path.join(source, "mcp", "application.sock"), "");
  fs.mkdirSync(path.join(source, "Cache"), { recursive: true });
  fs.writeFileSync(path.join(source, "Cache", "blob"), "junk");
  return source;
};

test("the copy carries the key wrapper, the registry and the grants", () => {
  const source = seedSource();
  const destination = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-dst-")),
    "Constellation Dev",
  );
  const copied = copySnapshot({ source, destination });
  assert.equal(
    fs.existsSync(
      path.join(destination, "local-alpha-workspace", "key-wrapper.json"),
    ),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(destination, "mcp", "agents", "grant.json")),
    true,
  );
  assert.equal(copied.includes("workspace-registry.json"), true);
  fs.rmSync(source, { recursive: true, force: true });
});

test("the live socket and the browser cache are left behind", () => {
  const source = seedSource();
  const destination = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-dst-")),
    "Constellation Dev",
  );
  copySnapshot({ source, destination });
  assert.equal(
    fs.existsSync(path.join(destination, "mcp", "application.sock")),
    false,
  );
  assert.equal(fs.existsSync(path.join(destination, "Cache")), false);
  fs.rmSync(source, { recursive: true, force: true });
});

test("a source without a key wrapper is refused instead of half-copied", () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-src-"));
  const destination = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-dst-")),
    "Constellation Dev",
  );
  assert.throws(
    () => copySnapshot({ source, destination }),
    /DEV_SNAPSHOT_SOURCE_INCOMPLETE/u,
  );
  assert.equal(fs.existsSync(destination), false);
});

test("a destination that is not the development directory is refused", () => {
  const source = seedSource();
  const destination = path.join(os.tmpdir(), "somewhere-else");
  assert.throws(
    () => copySnapshot({ source, destination }),
    /DEV_SNAPSHOT_DESTINATION_REFUSED/u,
  );
  fs.rmSync(source, { recursive: true, force: true });
});

test("a stale copy is replaced rather than merged", () => {
  const source = seedSource();
  const destination = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-dst-")),
    "Constellation Dev",
  );
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, "stale.json"), "{}");
  copySnapshot({ source, destination });
  assert.equal(fs.existsSync(path.join(destination, "stale.json")), false);
  fs.rmSync(source, { recursive: true, force: true });
});

test("a running installed application is detected through the probe", () => {
  assert.equal(
    installedApplicationIsRunning(() => true),
    true,
  );
  assert.equal(
    installedApplicationIsRunning(() => false),
    false,
  );
});

test("the printed server entry runs the working tree's MCP code", () => {
  const entry = mcpServerEntry({
    descriptor: "/state/mcp/agents/grant.json",
    root: "/repo",
  });
  assert.equal(entry.command, "node");
  assert.deepEqual(entry.args, ["/repo/packages/mcp/dist/bin/stdio.mjs"]);
  assert.equal(
    entry.env.CONSTELLATION_MCP_CREDENTIAL_FILE,
    "/state/mcp/agents/grant.json",
  );
});
