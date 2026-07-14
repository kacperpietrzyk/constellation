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
      version: "0.0.1",
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

for (const name of ["contracts", "domain", "application", "local-store"]) {
  copyPackage(name);
}
copyPackage("desktop-main", [], "package.production.json");
copyPackage("desktop-preload", ["build"]);
copy(
  path.join(root, "packages", "desktop-ui", "dist"),
  path.join(stage, "node_modules", "@constellation", "desktop-ui", "dist"),
);
for (const name of ["zod", "bindings", "file-uri-to-path", "better-sqlite3"]) {
  copy(
    path.join(root, "node_modules", name),
    path.join(stage, "node_modules", name),
  );
}
for (const name of ["zod", "bindings", "file-uri-to-path", "better-sqlite3"]) {
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
  "better-sqlite3-factory.js",
  "device-identity.js",
  "durable-kernel-service.js",
  "index.js",
  "local-data-home-provider.js",
  "production-main.js",
  "runtime-kernel-service.js",
  "security.js",
  "workspace-key-custody.js",
  "workspace-backup-archive.js",
  "workspace-recovery-service.js",
]);
for (const entry of fs.readdirSync(desktopMainSource)) {
  if (!productionDesktopFiles.has(entry)) {
    fs.rmSync(path.join(desktopMainSource, entry), {
      force: true,
      recursive: true,
    });
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
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  "zod",
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
  "better-sqlite3",
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
  appVersion: "0.0.1",
  buildVersion: "0.0.1",
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
  !archiveFiles.some((entry) => entry.endsWith("/production-main.js"))
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
  const verify = spawnSync(
    "codesign",
    ["--verify", "--deep", "--strict", appBundle],
    {
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  if (verify.status !== 0) throw new Error("AD_HOC_SIGNATURE_INVALID");
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
  electronArchiveSha256: electronArchive.sha256,
  executable,
  packagedNativeModules: 1,
  productionEntrypoint:
    "bootstrap.cjs -> @constellation/desktop-main/dist/src/production-main.js",
  runtimePackages: [...expectedRuntimePackages].sort(),
  nativeBindingSha256: digest,
  signatureTier,
};
fs.writeFileSync(
  path.join(output, "local-alpha-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
