import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
const exclusiveRenameSource = path.join(
  root,
  "scripts",
  "native",
  "macos-rename-exclusive.c",
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
  let publishedTarget;
  let publishedDestination;

  const result = ensureMacMcpLaunchCompatibility({
    executablePath: current.executable,
    platform: "darwin",
    publishExclusive: (target, destination) => {
      publishedTarget = target;
      publishedDestination = destination;
      fs.symlinkSync(target, destination);
      return "published";
    },
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
  assert.equal(publishedTarget, "Constellation.app");
  assert.equal(publishedDestination, legacyApp);
  assert.equal(fs.readlinkSync(legacyApp), "Constellation.app");
  assert.equal(
    fs.realpathSync(legacyExecutable),
    fs.realpathSync(current.executable),
  );
  assert.equal(fs.readFileSync(legacyMcp, "utf8"), "mcp entrypoint");

  const repeated = ensureMacMcpLaunchCompatibility({
    executablePath: current.executable,
    platform: "darwin",
  });
  assert.equal(repeated.status, "ready");
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
    platform: "darwin",
  });

  assert.equal(result.status, "conflict");
  assert.equal(fs.lstatSync(legacyApp).isDirectory(), true);
});

test("an existing valid compatibility symlink is never mutated", async (t) => {
  const { ensureMacMcpLaunchCompatibility } = await loadCompatibility();
  const current = fixture();
  t.after(() =>
    fs.rmSync(current.installRoot, { recursive: true, force: true }),
  );
  const legacyApp = path.join(
    current.installRoot,
    "Constellation Local Alpha.app",
  );
  fs.symlinkSync("Constellation.app", legacyApp);

  const result = ensureMacMcpLaunchCompatibility({
    executablePath: current.executable,
    platform: "darwin",
  });

  assert.equal(result.status, "ready");
  assert.equal(fs.lstatSync(legacyApp).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(legacyApp), "Constellation.app");
});

for (const publishRace of [
  "exists-before-publish",
  "replacement-after-publish",
]) {
  test(`a ${publishRace} race never overwrites or reports success`, async (t) => {
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
      platform: "darwin",
      publishExclusive: (target, destination) => {
        if (publishRace === "replacement-after-publish") {
          fs.symlinkSync(target, destination);
          fs.rmSync(destination);
        }
        fs.symlinkSync("Foreign Replacement.app", destination);
        return publishRace === "exists-before-publish" ? "exists" : "published";
      },
    });

    assert.equal(result.status, "unavailable");
    assert.equal(fs.lstatSync(legacyApp).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(legacyApp), "Foreign Replacement.app");
  });
}

test(
  "the macOS publisher atomically renames a symlink without overwriting",
  { skip: process.platform !== "darwin" },
  (t) => {
    assert.equal(
      fs.existsSync(exclusiveRenameSource),
      true,
      "exclusive rename helper source is missing",
    );
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "constellation-rename-exclusive-"),
    );
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const helper = path.join(directory, "constellation-rename-exclusive");
    const compile = spawnSync(
      "xcrun",
      [
        "clang",
        "-std=c11",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-Os",
        exclusiveRenameSource,
        "-o",
        helper,
      ],
      { encoding: "utf8" },
    );
    assert.equal(compile.status, 0, compile.stderr);

    const destination = path.join(directory, "destination");
    assert.equal(
      spawnSync(helper, ["Constellation.app", destination]).status,
      0,
    );
    assert.equal(fs.readlinkSync(destination), "Constellation.app");
    assert.match(
      spawnSync("/usr/bin/stat", ["-f", "%Sf", destination], {
        encoding: "utf8",
      }).stdout,
      /hidden/u,
    );

    fs.rmSync(destination);
    fs.symlinkSync("Foreign Replacement.app", destination);
    assert.equal(
      spawnSync(helper, ["Constellation.app", destination]).status,
      17,
    );
    assert.equal(fs.readlinkSync(destination), "Foreign Replacement.app");
    assert.deepEqual(fs.readdirSync(directory).sort(), [
      "constellation-rename-exclusive",
      "destination",
    ]);
  },
);

test("compatibility setup is a no-op outside macOS", async (t) => {
  const { ensureMacMcpLaunchCompatibility } = await loadCompatibility();
  const current = fixture();
  t.after(() =>
    fs.rmSync(current.installRoot, { recursive: true, force: true }),
  );

  const result = ensureMacMcpLaunchCompatibility({
    executablePath: current.executable,
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
  const compatibility = read(
    "packages/desktop-main/src/mcp-launch-compatibility.ts",
  );
  const nativePublisher = read("scripts/native/macos-rename-exclusive.c");
  const productionMain = read("packages/desktop-main/src/production-main.ts");
  const productionFiles = read("scripts/desktop/production-desktop-files.mjs");

  assert.doesNotMatch(compatibility, /symlinkSync|markHidden/u);
  assert.match(nativePublisher, /mkdtemp/u);
  assert.match(nativePublisher, /symlinkat/u);
  assert.match(nativePublisher, /openat\([^;]+O_SYMLINK/u);
  assert.match(nativePublisher, /fchflags/u);
  assert.match(nativePublisher, /renameatx_np\([^;]+RENAME_EXCL/u);

  assert.match(alpha, /LEGACY_MCP_EXECUTABLE_NAME/u);
  assert.match(alpha, /fs\.symlinkSync\(appName, legacyMcpExecutable\)/u);
  assert.match(alpha, /macos-rename-exclusive\.c/u);
  assert.match(alpha, /constellation-rename-exclusive/u);
  assert.match(alpha, /renameExclusiveHelperSha256/u);
  assert.match(
    productionMain,
    /ensureMacMcpLaunchCompatibility\(\{\s*executablePath: process\.execPath,?\s*\}\)/u,
  );
  assert.match(productionFiles, /"mcp-launch-compatibility\.js"/u);
});
