import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(
  root,
  "packages",
  "desktop-main",
  "src",
  "mcp-launch-compatibility.ts",
);
const built = path.join(
  root,
  "packages",
  "desktop-main",
  "dist",
  "src",
  "mcp-launch-compatibility.js",
);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const fixture = () => {
  const installRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "constellation-mcp-launch-"),
  );
  const app = path.join(installRoot, "Constellation.app");
  const executableRoot = path.join(app, "Contents", "MacOS");
  const resources = path.join(app, "Contents", "Resources");
  fs.mkdirSync(executableRoot, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  const executable = path.join(executableRoot, "Constellation");
  fs.writeFileSync(executable, "new executable");
  fs.symlinkSync(
    "Constellation",
    path.join(executableRoot, "Constellation Local Alpha"),
  );
  fs.writeFileSync(
    path.join(resources, "constellation-mcp.mjs"),
    "mcp entrypoint",
  );
  return { app, executable, installRoot };
};

const loadCompatibility = async () => {
  assert.equal(
    fs.existsSync(source),
    true,
    "production compatibility module is missing",
  );
  assert.equal(
    fs.existsSync(built),
    true,
    "build desktop-main before running this focused test",
  );
  return import(`${pathToFileURL(built).href}?test=${Date.now()}`);
};

test("an upgraded macOS bundle restores the legacy external MCP launch path", async (t) => {
  const { ensureMacMcpLaunchCompatibility } = await loadCompatibility();
  const current = fixture();
  t.after(() =>
    fs.rmSync(current.installRoot, { recursive: true, force: true }),
  );
  const hidden = [];

  const result = ensureMacMcpLaunchCompatibility({
    executablePath: current.executable,
    markHidden: (target) => hidden.push(target),
    platform: "darwin",
  });

  const legacyApp = path.join(
    current.installRoot,
    "Constellation Local Alpha.app",
  );
  const legacyExecutable = path.join(
    legacyApp,
    "Contents",
    "MacOS",
    "Constellation Local Alpha",
  );
  const legacyMcp = path.join(
    legacyApp,
    "Contents",
    "Resources",
    "constellation-mcp.mjs",
  );
  assert.equal(result.status, "created");
  assert.equal(fs.readlinkSync(legacyApp), "Constellation.app");
  assert.equal(
    fs.realpathSync(legacyExecutable),
    fs.realpathSync(current.executable),
  );
  assert.equal(fs.readFileSync(legacyMcp, "utf8"), "mcp entrypoint");
  assert.deepEqual(hidden, [legacyApp]);

  const repeated = ensureMacMcpLaunchCompatibility({
    executablePath: current.executable,
    markHidden: (target) => hidden.push(target),
    platform: "darwin",
  });
  assert.equal(repeated.status, "ready");
  assert.deepEqual(hidden, [legacyApp, legacyApp]);
});

test("compatibility setup never overwrites an existing legacy application", async (t) => {
  const { ensureMacMcpLaunchCompatibility } = await loadCompatibility();
  const current = fixture();
  t.after(() =>
    fs.rmSync(current.installRoot, { recursive: true, force: true }),
  );
  const legacyApp = path.join(
    current.installRoot,
    "Constellation Local Alpha.app",
  );
  fs.mkdirSync(legacyApp);

  const result = ensureMacMcpLaunchCompatibility({
    executablePath: current.executable,
    markHidden: () => assert.fail("conflicting paths must not be hidden"),
    platform: "darwin",
  });

  assert.equal(result.status, "conflict");
  assert.equal(fs.lstatSync(legacyApp).isDirectory(), true);
});

for (const hideOutcome of ["returns", "throws"]) {
  test(`a ${hideOutcome} hide replacement survives and never reports success`, async (t) => {
    const { ensureMacMcpLaunchCompatibility } = await loadCompatibility();
    const current = fixture();
    t.after(() =>
      fs.rmSync(current.installRoot, { recursive: true, force: true }),
    );
    const legacyApp = path.join(
      current.installRoot,
      "Constellation Local Alpha.app",
    );

    const result = ensureMacMcpLaunchCompatibility({
      executablePath: current.executable,
      markHidden: (target) => {
        fs.rmSync(target);
        fs.symlinkSync("Constellation.app", target);
        if (hideOutcome === "throws") {
          throw new Error("simulated hide failure after rival replacement");
        }
      },
      platform: "darwin",
    });

    assert.equal(result.status, "unavailable");
    assert.equal(fs.lstatSync(legacyApp).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(legacyApp), "Constellation.app");
  });
}

test("compatibility setup is a no-op outside macOS", async (t) => {
  const { ensureMacMcpLaunchCompatibility } = await loadCompatibility();
  const current = fixture();
  t.after(() =>
    fs.rmSync(current.installRoot, { recursive: true, force: true }),
  );

  const result = ensureMacMcpLaunchCompatibility({
    executablePath: current.executable,
    markHidden: () => assert.fail("non-macOS paths must not be touched"),
    platform: "win32",
  });

  assert.equal(result.status, "unsupported");
  assert.equal(
    fs.existsSync(
      path.join(current.installRoot, "Constellation Local Alpha.app"),
    ),
    false,
  );
});

test("macOS distribution serializes DMG and updater ZIP builds", () => {
  const distribution = read("scripts/package-distribution.mjs");

  assert.match(distribution, /const targetArgumentSets =/u);
  assert.match(distribution, /for \(const targetArgs of targetArgumentSets\)/u);
  assert.match(
    distribution,
    /\["--mac", "dmg", `--\$\{alphaManifest\.architecture\}`\][\s\S]*\["--mac", "zip", `--\$\{alphaManifest\.architecture\}`\]/u,
  );
  assert.doesNotMatch(distribution, /\["--mac", "dmg", "zip"/u);
});

test("packaging and production startup carry the legacy MCP command contract", () => {
  const alpha = read("scripts/package-alpha.mjs");
  const productionMain = read("packages/desktop-main/src/production-main.ts");
  const productionFiles = read("scripts/desktop/production-desktop-files.mjs");

  assert.match(alpha, /LEGACY_MCP_EXECUTABLE_NAME/u);
  assert.match(alpha, /fs\.symlinkSync\(appName, legacyMcpExecutable\)/u);
  assert.match(
    productionMain,
    /ensureMacMcpLaunchCompatibility\(\{\s*executablePath: process\.execPath,?\s*\}\)/u,
  );
  assert.match(productionFiles, /"mcp-launch-compatibility\.js"/u);
});
