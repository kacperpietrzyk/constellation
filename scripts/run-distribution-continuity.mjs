import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateRoot = path.join(root, "build", "distribution-continuity-state");
const installRoot = path.join(stateRoot, "installed");
const smokeStateRoot = path.join(stateRoot, "workspace-state");
const releaseRoot = path.join(root, "release", "distribution");
fs.rmSync(stateRoot, { recursive: true, force: true });
fs.mkdirSync(stateRoot, { recursive: true });

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 25 * 60_000,
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`DISTRIBUTION_COMMAND_FAILED_${path.basename(command)}`);
  }
  return result;
};

const distributionManifest = () =>
  JSON.parse(
    fs.readFileSync(
      path.join(releaseRoot, "distribution-manifest.json"),
      "utf8",
    ),
  );

const build = (version) => {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  run(npm, ["run", "package:distribution"], {
    env: {
      ...process.env,
      CONSTELLATION_RELEASE_VERSION: version,
      CONSTELLATION_RELEASE_TIER: "mechanism-only",
    },
    stdio: "inherit",
  });
  const manifest = distributionManifest();
  if (manifest.version !== version)
    throw new Error("DISTRIBUTION_VERSION_INVALID");
  return manifest;
};

const install = (manifest) => {
  fs.rmSync(installRoot, { recursive: true, force: true });
  fs.mkdirSync(installRoot, { recursive: true });
  if (process.platform === "darwin") {
    const dmg = manifest.artifacts.find((item) => item.name.endsWith(".dmg"));
    if (dmg === undefined) throw new Error("DISTRIBUTION_DMG_MISSING");
    const mount = path.join(stateRoot, "mounted");
    fs.rmSync(mount, { recursive: true, force: true });
    fs.mkdirSync(mount, { recursive: true });
    run("hdiutil", [
      "attach",
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mount,
      path.join(releaseRoot, dmg.name),
    ]);
    try {
      const app = fs.readdirSync(mount).find((entry) => entry.endsWith(".app"));
      if (app === undefined) throw new Error("DISTRIBUTION_APP_MISSING");
      const target = path.join(installRoot, app);
      run("ditto", [path.join(mount, app), target]);
      const executableRoot = path.join(target, "Contents", "MacOS");
      const executables = fs
        .readdirSync(executableRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(executableRoot, entry.name));
      if (executables.length !== 1) {
        throw new Error("DISTRIBUTION_EXECUTABLE_SET_INVALID");
      }
      return executables[0];
    } finally {
      run("hdiutil", ["detach", mount, "-force"]);
    }
  }
  if (process.platform === "win32") {
    const installer = manifest.artifacts.find((item) =>
      item.name.endsWith(".exe"),
    );
    if (installer === undefined)
      throw new Error("DISTRIBUTION_INSTALLER_MISSING");
    run(path.join(releaseRoot, installer.name), ["/S", `/D=${installRoot}`]);
    return path.join(installRoot, "Constellation Local Alpha.exe");
  }
  throw new Error("DISTRIBUTION_PLATFORM_UNSUPPORTED");
};

const smoke = (executable, workspaceId) => {
  if (!fs.existsSync(executable))
    throw new Error("INSTALLED_EXECUTABLE_MISSING");
  const result = run(
    process.execPath,
    ["scripts/run-packaged-alpha-smoke.mjs"],
    {
      env: {
        ...process.env,
        CONSTELLATION_PACKAGED_EXECUTABLE: executable,
        CONSTELLATION_PACKAGED_SMOKE_STATE_ROOT: smokeStateRoot,
        ...(workspaceId === undefined
          ? {}
          : { CONSTELLATION_VERIFY_EXISTING_WORKSPACE_ID: workspaceId }),
      },
    },
  );
  process.stdout.write(result.stdout);
  const lines = result.stdout.trim().split("\n");
  const summary = JSON.parse(lines.at(-1));
  if (summary.status !== "pass") throw new Error("DISTRIBUTION_SMOKE_FAILED");
  return summary;
};

let manifest = fs.existsSync(
  path.join(releaseRoot, "distribution-manifest.json"),
)
  ? distributionManifest()
  : build("0.0.1");
if (manifest.version !== "0.0.1") manifest = build("0.0.1");
let executable = install(manifest);
const installed = smoke(executable);
const workspaceId = installed.backupWorkspaceId;
if (typeof workspaceId !== "string") throw new Error("WORKSPACE_ID_MISSING");

manifest = build("0.0.2");
executable = install(manifest);
const updated = smoke(executable, workspaceId);
if (updated.version !== "0.0.2") throw new Error("UPDATE_VERSION_NOT_ACTIVE");

manifest = build("0.0.1");
executable = install(manifest);
const rolledBack = smoke(executable, workspaceId);
if (rolledBack.version !== "0.0.1")
  throw new Error("ROLLBACK_VERSION_NOT_ACTIVE");

if (process.platform === "win32") {
  const uninstaller = path.join(
    installRoot,
    "Uninstall Constellation Local Alpha.exe",
  );
  run(uninstaller, ["/S"]);
} else {
  fs.rmSync(installRoot, { recursive: true, force: true });
}
if (fs.existsSync(executable)) throw new Error("APPLICATION_UNINSTALL_FAILED");
const preservedWorkspace = path.join(
  smokeStateRoot,
  "user-data",
  "local-alpha-workspace",
  "workspace.db",
);
const preservedKey = path.join(
  smokeStateRoot,
  "user-data",
  "local-alpha-workspace",
  "key-wrapper.json",
);
if (!fs.existsSync(preservedWorkspace) || !fs.existsSync(preservedKey)) {
  throw new Error("UNINSTALL_REMOVED_WORKSPACE_DATA");
}

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    platform: process.platform,
    phases: ["install", "update", "compatible-rollback", "clean-uninstall"],
    versions: ["0.0.1", "0.0.2", "0.0.1"],
    workspaceId,
    encryptedWorkspacePreserved: true,
    protectedKeyPreserved: true,
    uninstallRemovedApplicationOnly: true,
  })}\n`,
);
