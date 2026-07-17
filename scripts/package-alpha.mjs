import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listPackage } from "@electron/asar";
import { packager } from "@electron/packager";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(root, "build", "local-alpha-stage");
const output = path.join(root, "release");
const electronZipDir = path.join(root, "build", "electron-zips");
const appName = "Constellation Local Alpha";
const bundleId = "io.constellation.local-alpha";
const architecture = process.env.CONSTELLATION_ALPHA_ARCH ?? process.arch;
const releaseVersion = process.env.CONSTELLATION_RELEASE_VERSION ?? "0.0.1";
const releaseTier = process.env.CONSTELLATION_RELEASE_TIER ?? "mechanism-only";
const releaseOrigin = process.env.CONSTELLATION_UPDATE_ORIGIN;
const stablePackagedSmokeRequirement =
  process.platform === "darwin" &&
  releaseTier === "mechanism-only" &&
  ((process.env.GITHUB_ACTIONS === "true" &&
    process.env.RUNNER_ENVIRONMENT === "github-hosted") ||
    (process.env.CONSTELLATION_ALLOW_LOCAL_KEYCHAIN_TEST === "true" &&
      typeof process.env.CONSTELLATION_KEYCHAIN_TEST_ROOT === "string" &&
      path.isAbsolute(process.env.CONSTELLATION_KEYCHAIN_TEST_ROOT)));
let normalizedReleaseOrigin;
if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) {
  throw new Error("RELEASE_VERSION_INVALID");
}
if (releaseTier !== "mechanism-only" && releaseTier !== "production-signed") {
  throw new Error("RELEASE_TIER_INVALID");
}
if (releaseTier === "production-signed") {
  const origin = new URL(releaseOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    throw new Error("RELEASE_ORIGIN_INVALID");
  }
  normalizedReleaseOrigin = origin.toString().replace(/\/$/, "");
}
const electronArchive = {
  darwin: {
    arm64: {
      filename: "electron-v43.1.0-darwin-arm64.zip",
      sha256:
        "2ee24f768c41bc2ed9bd580d7797b185dffb550dafca59c2cd08b51965bcda3a",
    },
    x64: {
      filename: "electron-v43.1.0-darwin-x64.zip",
      sha256:
        "c84cd358a6c58ee9d6ce26ced694ab3b750109e9f29145ff5a639db64037f1de",
    },
  },
  win32: {
    x64: {
      filename: "electron-v43.1.0-win32-x64.zip",
      sha256:
        "a07dc1e3d5e589593d37e3b19d1b373e02bb58270e2eb0d6633eee0198ad09f0",
    },
  },
}[process.platform]?.[architecture];

if (!new Set(["darwin", "win32"]).has(process.platform)) {
  throw new Error("LOCAL_ALPHA_PACKAGING_PLATFORM_UNSUPPORTED");
}
if (
  (process.platform === "darwin" &&
    !new Set(["arm64", "x64"]).has(architecture)) ||
  (process.platform === "win32" && architecture !== "x64")
) {
  throw new Error("LOCAL_ALPHA_PACKAGING_ARCHITECTURE_UNSUPPORTED");
}
if (electronArchive === undefined) {
  throw new Error("ELECTRON_PLATFORM_UNSUPPORTED");
}

const digestFile = async (filename) => {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
};
const electronArchivePath = path.join(electronZipDir, electronArchive.filename);
if (!fs.existsSync(electronArchivePath)) {
  throw new Error("ELECTRON_ARCHIVE_MISSING");
}
if ((await digestFile(electronArchivePath)) !== electronArchive.sha256) {
  throw new Error("ELECTRON_ARCHIVE_DIGEST_MISMATCH");
}

const copy = (source, target, options = {}) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, dereference: true, ...options });
};

const copyPackage = (name, additions = [], packageManifest) => {
  const source = path.join(root, "packages", name);
  const target = path.join(stage, "node_modules", "@constellation", name);
  copy(
    path.join(source, packageManifest ?? "package.json"),
    path.join(target, "package.json"),
  );
  copy(path.join(source, "dist", "src"), path.join(target, "dist", "src"));
  for (const addition of additions) {
    copy(path.join(source, addition), path.join(target, addition));
  }
};

fs.rmSync(stage, { recursive: true, force: true });
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.writeFileSync(
  path.join(stage, "package.json"),
  `${JSON.stringify(
    {
      name: "constellation-local-alpha",
      productName: appName,
      version: releaseVersion,
      private: true,
      type: "module",
      main: "bootstrap.cjs",
      dependencies: { "@constellation/desktop-main": "0.0.1" },
    },
    null,
    2,
  )}\n`,
);
fs.writeFileSync(
  path.join(stage, "bootstrap.cjs"),
  `void import("./node_modules/@constellation/desktop-main/dist/src/production-main.js").catch((error) => {
  console.error("Constellation production bootstrap failed.", error);
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});
`,
);

for (const name of [
  "contracts",
  "domain",
  "application",
  "local-store",
  "mcp",
  "realtime-documents",
]) {
  copyPackage(name);
}
copy(
  path.join(root, "packages", "mcp", "dist", "bin"),
  path.join(stage, "node_modules", "@constellation", "mcp", "dist", "bin"),
);
copyPackage("desktop-main", [], "package.production.json");
copyPackage("desktop-preload", ["build"]);
copy(
  path.join(root, "packages", "desktop-ui", "dist"),
  path.join(stage, "node_modules", "@constellation", "desktop-ui", "dist"),
);
for (const name of [
  "zod",
  "bindings",
  "file-uri-to-path",
  "better-sqlite3",
  "yjs",
  "lib0",
  "electron-updater",
  "builder-util-runtime",
  "debug",
  "ms",
  "sax",
  "fs-extra",
  "graceful-fs",
  "jsonfile",
  "universalify",
  "lazy-val",
  "lodash.escaperegexp",
  "lodash.isequal",
  "tiny-typed-emitter",
]) {
  copy(
    path.join(root, "node_modules", name),
    path.join(stage, "node_modules", name),
  );
}
for (const name of [
  "zod",
  "bindings",
  "file-uri-to-path",
  "better-sqlite3",
  "yjs",
  "lib0",
  "electron-updater",
  "builder-util-runtime",
  "debug",
  "ms",
  "sax",
  "fs-extra",
  "graceful-fs",
  "jsonfile",
  "universalify",
  "lazy-val",
  "lodash.escaperegexp",
  "lodash.isequal",
  "tiny-typed-emitter",
]) {
  for (const directory of ["test", "tests"]) {
    fs.rmSync(path.join(stage, "node_modules", name, directory), {
      recursive: true,
      force: true,
    });
  }
}
for (const target of [
  path.join(stage, "node_modules", "better-sqlite3", "src"),
  path.join(stage, "node_modules", "better-sqlite3", "deps"),
  path.join(stage, "node_modules", "better-sqlite3", "build", "Release", "obj"),
  path.join(
    stage,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "test_extension.node",
  ),
]) {
  fs.rmSync(target, { recursive: true, force: true });
}
const desktopMainSource = path.join(
  stage,
  "node_modules",
  "@constellation",
  "desktop-main",
  "dist",
  "src",
);
const productionDesktopFiles = new Set([
  "attention-notification.js",
  "calendar-meeting-loop.js",
  "capture-payload-custody.js",
  "jamie-integration.js",
  "better-sqlite3-factory.js",
  "coordinated-data-home-provider.js",
  "coordinated-sync-engine.js",
  "device-identity.js",
  "document-collaboration.js",
  "durable-kernel-service.js",
  "hub-authorization-export.js",
  "hub-connection-custody.js",
  "index.js",
  "local-data-home-provider.js",
  "local-mcp-credential-custody.js",
  "local-mcp-runtime.js",
  "media-permission.js",
  "production-main.js",
  "release-service.js",
  "remote-mcp-credential-custody.js",
  "runtime-kernel-service.js",
  "security.js",
  "starter-workspace-import.js",
  "support-report.js",
  "workspace-key-custody.js",
  "workspace-backup-archive.js",
  "workspace-recovery-service.js",
  "workspace-registry.js",
]);
for (const entry of fs.readdirSync(desktopMainSource)) {
  if (!productionDesktopFiles.has(entry)) {
    fs.rmSync(path.join(desktopMainSource, entry), {
      force: true,
      recursive: true,
    });
  }
}

for (const entry of productionDesktopFiles) {
  const sourcePath = path.join(desktopMainSource, entry);
  const source = fs.readFileSync(sourcePath, "utf8");
  const relativeImports = source.matchAll(
    /(?:from\s+|import\()\s*["'](\.[^"']+\.js)["']/g,
  );
  for (const [, specifier] of relativeImports) {
    const importedPath = path.resolve(path.dirname(sourcePath), specifier);
    if (!fs.existsSync(importedPath)) {
      throw new Error(
        `PRODUCTION_DESKTOP_IMPORT_MISSING:${entry}:${specifier}`,
      );
    }
  }
}

const expectedRuntimePackages = new Set([
  "@constellation/application",
  "@constellation/contracts",
  "@constellation/desktop-main",
  "@constellation/desktop-preload",
  "@constellation/desktop-ui",
  "@constellation/domain",
  "@constellation/local-store",
  "@constellation/mcp",
  "@constellation/realtime-documents",
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  "lib0",
  "yjs",
  "zod",
  "electron-updater",
  "builder-util-runtime",
  "debug",
  "ms",
  "sax",
  "fs-extra",
  "graceful-fs",
  "jsonfile",
  "universalify",
  "lazy-val",
  "lodash.escaperegexp",
  "lodash.isequal",
  "tiny-typed-emitter",
]);
const stagedRuntimePackages = new Set();
for (const entry of fs.readdirSync(path.join(stage, "node_modules"), {
  withFileTypes: true,
})) {
  if (entry.name === "@constellation") {
    for (const scoped of fs.readdirSync(
      path.join(stage, "node_modules", entry.name),
      { withFileTypes: true },
    )) {
      if (scoped.isDirectory())
        stagedRuntimePackages.add(`@constellation/${scoped.name}`);
    }
  } else if (entry.isDirectory()) stagedRuntimePackages.add(entry.name);
}
if (
  [...expectedRuntimePackages].some(
    (name) => !stagedRuntimePackages.has(name),
  ) ||
  [...stagedRuntimePackages].some((name) => !expectedRuntimePackages.has(name))
) {
  throw new Error("PRODUCTION_RUNTIME_PACKAGE_CLOSURE_INVALID");
}
const productionRequire = createRequire(path.join(stage, "package.json"));
for (const name of expectedRuntimePackages) {
  if (name === "@constellation/desktop-ui") continue;
  productionRequire.resolve(
    name === "@constellation/desktop-preload" ? `${name}/client` : name,
  );
}
const productionDesktopManifest = JSON.parse(
  fs.readFileSync(
    path.join(
      stage,
      "node_modules",
      "@constellation",
      "desktop-main",
      "package.json",
    ),
    "utf8",
  ),
);
const expectedDesktopDependencies = [
  "@constellation/application",
  "@constellation/contracts",
  "@constellation/desktop-preload",
  "@constellation/local-store",
  "@constellation/mcp",
  "@constellation/realtime-documents",
  "better-sqlite3",
  "electron-updater",
];
if (
  productionDesktopManifest.main !== "dist/src/production-main.js" ||
  Object.keys(productionDesktopManifest.dependencies).sort().join("\0") !==
    expectedDesktopDependencies.sort().join("\0") ||
  "@constellation/testkit" in productionDesktopManifest.dependencies ||
  "electron" in productionDesktopManifest.dependencies
) {
  throw new Error("PRODUCTION_ENTRYPOINT_MANIFEST_INVALID");
}

const nativeBinding = path.join(
  stage,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);
if (!fs.existsSync(nativeBinding)) throw new Error("NATIVE_BINDING_MISSING");

const calendarHelperBuild = path.join(
  root,
  "build",
  "calendar-helper",
  "constellation-calendar-helper",
);
if (process.platform === "darwin") {
  fs.mkdirSync(path.dirname(calendarHelperBuild), { recursive: true });
  const buildCalendarHelper = spawnSync(
    "swiftc",
    [
      path.join(
        root,
        "packages",
        "desktop-main",
        "native",
        "macos-calendar",
        "main.swift",
      ),
      "-framework",
      "EventKit",
      "-o",
      calendarHelperBuild,
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  if (buildCalendarHelper.status !== 0)
    throw new Error("CALENDAR_HELPER_BUILD_FAILED");
}

const packagePaths = await packager({
  dir: stage,
  name: appName,
  out: output,
  overwrite: true,
  platform: process.platform,
  arch: architecture,
  electronVersion: "43.1.0",
  electronZipDir,
  asar: true,
  prune: false,
  appBundleId: bundleId,
  helperBundleId: `${bundleId}.helper`,
  icon: path.join(
    root,
    "assets",
    process.platform === "darwin" ? "app-icon.icns" : "app-icon.ico",
  ),
  appVersion: releaseVersion,
  buildVersion: releaseVersion,
  extendInfo:
    process.platform === "darwin"
      ? {
          NSCalendarsFullAccessUsageDescription:
            "Constellation reads upcoming meetings to prepare factual work context and writes only exact work blocks you explicitly confirm.",
          NSMicrophoneUsageDescription:
            "Constellation records only a short voice note when you explicitly start Quick Capture recording. It never records meetings or transcribes audio itself.",
        }
      : undefined,
  appCopyright: "Copyright Constellation contributors",
  win32metadata: {
    CompanyName: "Constellation contributors",
    FileDescription: appName,
    ProductName: appName,
    InternalName: "ConstellationLocalAlpha",
    OriginalFilename: `${appName}.exe`,
  },
  quiet: true,
});
if (packagePaths.length !== 1) throw new Error("PACKAGE_OUTPUT_INVALID");

const packageRoot = packagePaths[0];
const appBundle =
  process.platform === "darwin"
    ? path.join(packageRoot, `${appName}.app`)
    : undefined;
const executable =
  process.platform === "darwin"
    ? path.join(appBundle, "Contents", "MacOS", appName)
    : path.join(packageRoot, `${appName}.exe`);
const resources =
  process.platform === "darwin"
    ? path.join(appBundle, "Contents", "Resources")
    : path.join(packageRoot, "resources");
if (appBundle !== undefined) {
  const infoPlist = path.join(appBundle, "Contents", "Info.plist");
  const plistBuddy = "/usr/libexec/PlistBuddy";
  const cameraEntry = spawnSync(
    plistBuddy,
    ["-c", "Print :NSCameraUsageDescription", infoPlist],
    { encoding: "utf8", timeout: 10_000 },
  );
  if (cameraEntry.status === 0) {
    const removed = spawnSync(
      plistBuddy,
      ["-c", "Delete :NSCameraUsageDescription", infoPlist],
      { encoding: "utf8", timeout: 10_000 },
    );
    if (removed.status !== 0) throw new Error("CAMERA_USAGE_REMOVAL_FAILED");
  }
  const microphoneEntry = spawnSync(
    plistBuddy,
    ["-c", "Print :NSMicrophoneUsageDescription", infoPlist],
    { encoding: "utf8", timeout: 10_000 },
  );
  if (
    microphoneEntry.status !== 0 ||
    !microphoneEntry.stdout.includes("short voice note")
  ) {
    throw new Error("MICROPHONE_USAGE_DESCRIPTION_INVALID");
  }
}
fs.writeFileSync(
  path.join(resources, "release-config.json"),
  `${JSON.stringify(
    releaseTier === "production-signed"
      ? { tier: releaseTier, releaseOrigin: normalizedReleaseOrigin }
      : { tier: releaseTier, releaseOrigin: null },
    null,
    2,
  )}\n`,
);
if (releaseTier === "production-signed") {
  fs.writeFileSync(
    path.join(resources, "app-update.yml"),
    `provider: generic\nurl: ${JSON.stringify(normalizedReleaseOrigin)}\nupdaterCacheDirName: constellation-local-alpha-updater\n`,
  );
}
const packagedMcpEntrypoint = path.join(resources, "constellation-mcp.mjs");
copy(
  path.join(root, "packages", "mcp", "dist", "bin", "stdio.mjs"),
  packagedMcpEntrypoint,
);
const packagedCalendarHelper =
  process.platform === "darwin"
    ? path.join(resources, "constellation-calendar-helper")
    : undefined;
if (packagedCalendarHelper !== undefined) {
  copy(calendarHelperBuild, packagedCalendarHelper);
  fs.chmodSync(packagedCalendarHelper, 0o755);
  const signCalendarHelper = spawnSync(
    "codesign",
    [
      "--force",
      "--sign",
      "-",
      "--entitlements",
      path.join(
        root,
        "packages",
        "desktop-main",
        "native",
        "macos-calendar",
        "CalendarHelper.entitlements",
      ),
      packagedCalendarHelper,
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  if (signCalendarHelper.status !== 0)
    throw new Error("CALENDAR_HELPER_SIGNING_FAILED");
}
const unpacked = path.join(resources, "app.asar.unpacked");
const archive = path.join(resources, "app.asar");
const unpackedFiles = [];
if (fs.existsSync(unpacked)) {
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) unpackedFiles.push(target);
      else throw new Error("PACKAGE_CONTENT_INVALID");
    }
  };
  visit(unpacked);
}
if (
  !fs.existsSync(executable) ||
  !fs.existsSync(archive) ||
  !fs.existsSync(packagedMcpEntrypoint) ||
  (packagedCalendarHelper !== undefined &&
    !fs.existsSync(packagedCalendarHelper)) ||
  unpackedFiles.length !== 1 ||
  path.basename(unpackedFiles[0]) !== "better_sqlite3.node"
) {
  throw new Error("PACKAGED_NATIVE_MODULE_SET_INVALID");
}
const archiveFiles = listPackage(archive).map((entry) =>
  entry.replaceAll("\\", "/").toLowerCase(),
);
const archiveDenylist = [
  "/test/",
  "/testkit/",
  "alpha-smoke",
  "preview-service",
  "wave2-fixtures",
  "/src/main.js",
];
if (
  archiveFiles.some((entry) =>
    archiveDenylist.some((denied) => entry.includes(denied)),
  ) ||
  !archiveFiles.includes("/bootstrap.cjs") ||
  !archiveFiles.some((entry) => entry.endsWith("/production-main.js")) ||
  !archiveFiles.some((entry) =>
    entry.endsWith("/remote-mcp-credential-custody.js"),
  ) ||
  !archiveFiles.some((entry) => entry.endsWith("/attention-notification.js")) ||
  !archiveFiles.some((entry) => entry.endsWith("/document-collaboration.js")) ||
  !archiveFiles.some((entry) => entry.endsWith("/support-report.js"))
) {
  throw new Error("PRODUCTION_ASAR_CONTENT_INVALID");
}

let signatureTier = "unsigned-mechanism-only";
if (appBundle !== undefined) {
  const sign = spawnSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", appBundle],
    {
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  if (sign.status !== 0) throw new Error("AD_HOC_SIGNING_FAILED");
  if (stablePackagedSmokeRequirement) {
    const signMain = spawnSync(
      "codesign",
      [
        "--force",
        "--sign",
        "-",
        "--requirements",
        '=designated => identifier "io.constellation.local-alpha"',
        appBundle,
      ],
      {
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    if (signMain.status !== 0) throw new Error("AD_HOC_MAIN_SIGNING_FAILED");
  }
  const verify = spawnSync(
    "codesign",
    ["--verify", "--deep", "--strict", appBundle],
    {
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  if (verify.status !== 0) throw new Error("AD_HOC_SIGNATURE_INVALID");
  if (stablePackagedSmokeRequirement) {
    const requirement = spawnSync(
      "codesign",
      ["--display", "--requirements", "-", appBundle],
      {
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    if (
      requirement.status !== 0 ||
      !`${requirement.stdout}${requirement.stderr}`.includes(
        'designated => identifier "io.constellation.local-alpha"',
      )
    ) {
      throw new Error("AD_HOC_DESIGNATED_REQUIREMENT_INVALID");
    }
  }
  signatureTier = "ad-hoc-mechanism-only";
}
const digest = crypto
  .createHash("sha256")
  .update(fs.readFileSync(unpackedFiles[0]))
  .digest("hex");
const manifest = {
  status: "pass",
  platform: process.platform,
  architecture,
  electron: "43.1.0",
  version: releaseVersion,
  electronArchiveSha256: electronArchive.sha256,
  executable,
  packageRoot,
  ...(appBundle === undefined ? {} : { appBundle }),
  packagedNativeModules: 1,
  productionEntrypoint:
    "bootstrap.cjs -> @constellation/desktop-main/dist/src/production-main.js",
  runtimePackages: [...expectedRuntimePackages].sort(),
  nativeBindingSha256: digest,
  mcpEntrypoint: packagedMcpEntrypoint,
  mcpEntrypointSha256: await digestFile(packagedMcpEntrypoint),
  ...(packagedCalendarHelper === undefined
    ? {}
    : {
        calendarHelper: packagedCalendarHelper,
        calendarHelperSha256: await digestFile(packagedCalendarHelper),
      }),
  signatureTier:
    releaseTier === "production-signed"
      ? "pending-production-signing"
      : signatureTier,
  releaseTier,
};
fs.writeFileSync(
  path.join(output, "local-alpha-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
