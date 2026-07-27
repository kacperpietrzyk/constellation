import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEV_STATE_DIRECTORY,
  devStateRoot,
  installedStateRoot,
  localSocketPath,
} from "./dev-state.mjs";
import {
  copySnapshot,
  installedApplicationIsRunning,
  mcpServerEntry,
} from "./dev-snapshot.mjs";

// A fixture "home" directory, injected via copySnapshot's `home` parameter,
// so the destination guard's equality check (destination === devStateRoot
// (home)) is exercised against a real computed path rather than a caller-
// supplied answer — the guard would mean nothing if a test could simply
// assert whatever destination it passed in.
const makeHome = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-home-"));

// The endpoint a real copied descriptor carries before it is ever repointed:
// the installed application's own socket.
const INSTALLED_ENDPOINT =
  "/Users/example/Library/Application Support/Constellation Local Alpha/mcp/application.sock";

const seedSource = () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "dev-snapshot-src-"));
  const workspace = path.join(source, "local-alpha-workspace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "key-wrapper.json"), "{}");
  fs.writeFileSync(path.join(workspace, "workspace.db"), "db");
  fs.writeFileSync(path.join(source, "workspace-registry.json"), "{}");
  fs.mkdirSync(path.join(source, "mcp", "agents"), { recursive: true });
  const grantPath = path.join(source, "mcp", "agents", "grant.json");
  // Shaped like a real LocalCredentialDescriptor (see
  // local-mcp-credential-custody.ts), not just "{}", so a test can assert
  // that repointing touches only `endpoint` and leaves every other field —
  // including the secret — byte-identical.
  fs.writeFileSync(
    grantPath,
    JSON.stringify({
      descriptorVersion: 1,
      workspaceId: "22222222-2222-2222-2222-222222222222",
      grantId: "33333333-3333-3333-3333-333333333333",
      credentialId: "44444444-4444-4444-4444-444444444444",
      endpoint: INSTALLED_ENDPOINT,
      secret: "top-secret-value",
    }),
  );
  fs.chmodSync(grantPath, 0o600);
  fs.writeFileSync(path.join(source, "mcp", "application.sock"), "");
  fs.mkdirSync(path.join(source, "Cache"), { recursive: true });
  fs.writeFileSync(path.join(source, "Cache", "blob"), "junk");
  return source;
};

// t.after runs even when an assertion above it throws, so a failing test
// still tidies up its own fixtures instead of leaking them into the system
// temp directory.
test("the copy carries the key wrapper, the registry and the grants", (t) => {
  const source = seedSource();
  const home = makeHome();
  const destination = devStateRoot(home);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const copied = copySnapshot({ source, destination, home });
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

test("a copied grant descriptor is repointed at the copy's own socket before the shell has ever launched", (t) => {
  const source = seedSource();
  const home = makeHome();
  const destination = devStateRoot(home);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  copySnapshot({ source, destination, home });
  const seededPath = path.join(source, "mcp", "agents", "grant.json");
  const copiedPath = path.join(destination, "mcp", "agents", "grant.json");
  const seeded = JSON.parse(fs.readFileSync(seededPath, "utf8"));
  const copiedDescriptor = JSON.parse(fs.readFileSync(copiedPath, "utf8"));
  // The one field a reader would use to connect now names the copy's own
  // socket, not the installed application's — the defect this closes is a
  // descriptor that would otherwise authenticate against production.
  assert.equal(copiedDescriptor.endpoint, localSocketPath(destination));
  assert.equal(
    copiedDescriptor.endpoint.includes("Constellation Local Alpha"),
    false,
  );
  // Every other field, including the secret, survives untouched — this is
  // still the same grant, just told where to actually connect.
  const seededRest = { ...seeded };
  delete seededRest.endpoint;
  const copiedRest = { ...copiedDescriptor };
  delete copiedRest.endpoint;
  assert.deepEqual(copiedRest, seededRest);
  // The descriptor holds a secret; rewriting it must not loosen who can read it.
  assert.equal((fs.statSync(copiedPath).mode & 0o777).toString(8), "600");
  // The source is untouched by this repointing.
  assert.equal(seeded.endpoint, INSTALLED_ENDPOINT);
});

test("the live socket and the browser cache are left behind", (t) => {
  const source = seedSource();
  const home = makeHome();
  const destination = devStateRoot(home);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  copySnapshot({ source, destination, home });
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
  const home = makeHome();
  const destination = devStateRoot(home);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  copySnapshot({ source, destination, home });
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
  const home = makeHome();
  const destination = devStateRoot(home);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  assert.throws(
    () => copySnapshot({ source, destination, home }),
    /DEV_SNAPSHOT_SOURCE_INCOMPLETE/u,
  );
  assert.equal(fs.existsSync(destination), false);
});

test("a grant descriptor that is not a JSON object is refused rather than silently rewritten", (t) => {
  const source = seedSource();
  // A malformed descriptor - an array here, but null or a primitive would
  // fail the same guard - would otherwise be spread into
  // `{ ...descriptor, endpoint }`, discarding it silently and leaving a file
  // that is just `{"endpoint": "…"}`.
  fs.writeFileSync(
    path.join(source, "mcp", "agents", "malformed.json"),
    JSON.stringify(["not", "a", "descriptor"]),
  );
  const home = makeHome();
  const destination = devStateRoot(home);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  assert.throws(
    () => copySnapshot({ source, destination, home }),
    /DEV_SNAPSHOT_DESCRIPTOR_MALFORMED/u,
  );
  assert.equal(fs.existsSync(destination), false);
});

test("a source whose active workspace is not at the base root is refused, not silently copied", (t) => {
  const source = seedSource();
  fs.writeFileSync(
    path.join(source, "workspace-registry.json"),
    JSON.stringify({
      version: 1,
      activeWorkspaceId: "11111111-1111-1111-1111-111111111111",
      workspaces: [
        {
          workspaceId: "11111111-1111-1111-1111-111111111111",
          name: "Second workspace",
          relativeStateRoot: "workspaces/11111111-1111-1111-1111-111111111111",
        },
      ],
    }),
  );
  const home = makeHome();
  const destination = devStateRoot(home);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  assert.throws(
    () => copySnapshot({ source, destination, home }),
    /DEV_SNAPSHOT_MULTI_WORKSPACE_UNSUPPORTED/u,
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

test("a Constellation Dev nested inside the installed state root is refused", (t) => {
  // The basename-only check M1 replaced would have accepted this: it ends in
  // "Constellation Dev", but it lives under the installed application's own
  // state root rather than beside it. This is the exact hole M1 named, so
  // it needs its own assertion rather than relying on the sibling-path test
  // above (whose basename alone would already have failed the old check).
  const source = seedSource();
  const home = makeHome();
  const destination = path.join(installedStateRoot(home), DEV_STATE_DIRECTORY);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  assert.throws(
    () => copySnapshot({ source, destination, home }),
    /DEV_SNAPSHOT_DESTINATION_REFUSED/u,
  );
  assert.equal(fs.existsSync(destination), false);
});

test("a stale copy is replaced rather than merged", (t) => {
  const source = seedSource();
  const home = makeHome();
  const destination = devStateRoot(home);
  t.after(() => {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, "stale.json"), "{}");
  copySnapshot({ source, destination, home });
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
  const home = makeHome();
  const destination = devStateRoot(home);
  const destinationParent = path.dirname(destination);
  t.after(() => {
    fs.chmodSync(lockedFile, 0o644);
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  assert.throws(() => copySnapshot({ source, destination, home }), /EACCES/u);
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
  const home = makeHome();
  const destination = devStateRoot(home);
  const destinationParent = path.dirname(destination);
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
    fs.rmSync(home, { recursive: true, force: true });
  });
  assert.throws(
    () => copySnapshot({ source, destination, home }),
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
