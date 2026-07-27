import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

// Every test's destination lives inside a freshly minted temp directory so
// that a leftover staging directory (a sibling of "Constellation Dev") would
// show up in a directory listing rather than among unrelated fixtures.
const makeDestinationParent = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-dst-"));

// t.after runs even when an assertion above it throws, so a failing test
// still tidies up its own fixtures instead of leaking them into the system
// temp directory.
test("the copy carries the key wrapper, the registry and the grants", (t) => {
  const source = seedSource();
  const destinationParent = makeDestinationParent();
  const destination = path.join(destinationParent, "Constellation Dev");
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destinationParent, { recursive: true, force: true });
  });
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
});

test("the live socket and the browser cache are left behind", (t) => {
  const source = seedSource();
  const destinationParent = makeDestinationParent();
  const destination = path.join(destinationParent, "Constellation Dev");
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destinationParent, { recursive: true, force: true });
  });
  copySnapshot({ source, destination });
  assert.equal(
    fs.existsSync(path.join(destination, "mcp", "application.sock")),
    false,
  );
  assert.equal(fs.existsSync(path.join(destination, "Cache")), false);
});

test("a socket nested inside a copied directory is stripped by the filter, not just left out by the entry list", (t) => {
  // SNAPSHOT_ENTRIES names "mcp/agents", not "mcp", so a socket living
  // directly under "mcp" (the case above) is excluded before cpSync's filter
  // ever runs. This seeds one inside the entry that IS copied, so only the
  // filter itself can be keeping it out.
  const source = seedSource();
  fs.writeFileSync(path.join(source, "mcp", "agents", "application.sock"), "");
  const destinationParent = makeDestinationParent();
  const destination = path.join(destinationParent, "Constellation Dev");
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destinationParent, { recursive: true, force: true });
  });
  copySnapshot({ source, destination });
  assert.equal(
    fs.existsSync(path.join(destination, "mcp", "agents", "application.sock")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(destination, "mcp", "agents", "grant.json")),
    true,
  );
});

test("a source without a key wrapper is refused instead of half-copied", (t) => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-src-"));
  const destinationParent = makeDestinationParent();
  const destination = path.join(destinationParent, "Constellation Dev");
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destinationParent, { recursive: true, force: true });
  });
  assert.throws(
    () => copySnapshot({ source, destination }),
    /DEV_SNAPSHOT_SOURCE_INCOMPLETE/u,
  );
  assert.equal(fs.existsSync(destination), false);
});

test("a destination that is not the development directory is refused", (t) => {
  const source = seedSource();
  const destination = path.join(os.tmpdir(), "somewhere-else");
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
  });
  assert.throws(
    () => copySnapshot({ source, destination }),
    /DEV_SNAPSHOT_DESTINATION_REFUSED/u,
  );
});

test("a stale copy is replaced rather than merged", (t) => {
  const source = seedSource();
  const destinationParent = makeDestinationParent();
  const destination = path.join(destinationParent, "Constellation Dev");
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destinationParent, { recursive: true, force: true });
  });
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, "stale.json"), "{}");
  copySnapshot({ source, destination });
  assert.equal(fs.existsSync(path.join(destination, "stale.json")), false);
});

test("a mid-copy failure leaves neither a destination nor a leftover staging directory", (t) => {
  const source = seedSource();
  // "device" is copied whole, ahead of the agent grants in SNAPSHOT_ENTRIES,
  // so a fault here happens after local-alpha-workspace/key-wrapper.json has
  // already landed in staging - exactly the partial state the atomicity fix
  // guards against. A file with its permission bits cleared is unreadable
  // even to its own owner (verified: this is not a root-only restriction),
  // which makes cpSync throw EACCES reliably without needing root.
  const deviceDirectory = path.join(source, "device");
  fs.mkdirSync(deviceDirectory, { recursive: true });
  const lockedFile = path.join(deviceDirectory, "locked.txt");
  fs.writeFileSync(lockedFile, "secret");
  fs.chmodSync(lockedFile, 0o000);
  const destinationParent = makeDestinationParent();
  const destination = path.join(destinationParent, "Constellation Dev");
  t.after(() => {
    fs.chmodSync(lockedFile, 0o644);
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destinationParent, { recursive: true, force: true });
  });
  assert.throws(() => copySnapshot({ source, destination }), /EACCES/u);
  assert.equal(fs.existsSync(destination), false);
  assert.deepEqual(fs.readdirSync(destinationParent), []);
});

test("a swap failure leaves the previous copy in place and no orphan behind", (t) => {
  // The copy loop above completes cleanly here - the fault is placed in the
  // swap step, which the mid-copy test above never reaches. macOS's uchg
  // flag marks a directory immutable to its own owner without root: it can
  // still be read, but renaming or deleting the entry itself is refused.
  // Unlike restricting write permission on the parent (which would also
  // block creating the sibling staging directory the copy loop needs),
  // flagging only the destination isolates the fault to the rename of the
  // destination itself - the first of the swap's two renames.
  const source = seedSource();
  const destinationParent = makeDestinationParent();
  const destination = path.join(destinationParent, "Constellation Dev");
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, "previous-copy.json"), "{}");
  const flagged = spawnSync("chflags", ["uchg", destination]);
  assert.equal(
    flagged.status,
    0,
    "chflags uchg must succeed for this test to exercise anything",
  );
  t.after(() => {
    spawnSync("chflags", ["nouchg", destination]);
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(destinationParent, { recursive: true, force: true });
  });
  assert.throws(
    () => copySnapshot({ source, destination }),
    /EPERM|operation not permitted/iu,
  );
  // The previous copy was never even renamed aside, let alone replaced.
  assert.equal(
    fs.existsSync(path.join(destination, "previous-copy.json")),
    true,
  );
  const leftovers = fs
    .readdirSync(destinationParent)
    .filter((entry) => entry !== "Constellation Dev");
  assert.deepEqual(leftovers, []);
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
