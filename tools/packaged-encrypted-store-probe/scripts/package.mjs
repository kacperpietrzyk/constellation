import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "out");
const electronZipDir = path.join(root, "build", "electron-zips");
const appName = "Constellation Packaged Store Probe";
const bundleId = "io.constellation.packaged-store-probe";
const platform = process.platform;
const sourceBinding = path.join(
  root,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);
const electronArchive = {
  darwin: {
    filename: "electron-v43.1.0-darwin-x64.zip",
    sha256: "c84cd358a6c58ee9d6ce26ced694ab3b750109e9f29145ff5a639db64037f1de",
  },
  win32: {
    filename: "electron-v43.1.0-win32-x64.zip",
    sha256: "a07dc1e3d5e589593d37e3b19d1b373e02bb58270e2eb0d6633eee0198ad09f0",
  },
}[platform];

if (!electronArchive) throw new Error("PACKAGING_PLATFORM_UNSUPPORTED");
if (!fs.existsSync(sourceBinding)) throw new Error("NATIVE_BINDING_MISSING");

async function digestFile(filename) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(target));
    else if (entry.isFile()) files.push(target);
    else throw new Error("PACKAGE_CONTENT_INVALID");
  }
  return files;
}

const archivePath = path.join(electronZipDir, electronArchive.filename);
if (!fs.existsSync(archivePath)) throw new Error("ELECTRON_ARCHIVE_MISSING");
if ((await digestFile(archivePath)) !== electronArchive.sha256) {
  throw new Error("ELECTRON_ARCHIVE_DIGEST_MISMATCH");
}
const sourceBindingSha256 = await digestFile(sourceBinding);

const ignoredTopLevelEntries = ["scripts", "build", "out"].map(
  (entry) => new RegExp(`^[\\\\/]${entry}(?:[\\\\/]|$)`),
);
ignoredTopLevelEntries.push(/^[\\/]README\.md$/, /^[\\/]package-lock\.json$/);

fs.rmSync(outputRoot, { recursive: true, force: true });
const packagePaths = await packager({
  dir: root,
  name: appName,
  out: outputRoot,
  overwrite: true,
  platform,
  arch: "x64",
  electronVersion: "43.1.0",
  electronZipDir,
  asar: true,
  prune: true,
  ignore: ignoredTopLevelEntries,
  appBundleId: bundleId,
  helperBundleId: `${bundleId}.helper`,
  appVersion: "0.0.1",
  buildVersion: "0.0.1",
  appCopyright: "Copyright Constellation contributors",
  // Electron already carries the required asInvoker manifest. Rewriting it
  // through Packager 20.0.2 corrupts the Windows activation context.
  win32metadata: {
    CompanyName: "Constellation contributors",
    FileDescription: appName,
    ProductName: appName,
    InternalName: "ConstellationPackagedStoreProbe",
    OriginalFilename: `${appName}.exe`,
  },
  quiet: true,
});

if (packagePaths.length !== 1) throw new Error("PACKAGE_OUTPUT_INVALID");
const packageRoot = packagePaths[0];
let appBundle;
let executable;
let resourcesRoot;
let signatureTier;
let identityMetadataVerified = false;

if (platform === "darwin") {
  appBundle = path.join(packageRoot, `${appName}.app`);
  const infoPlist = path.join(appBundle, "Contents", "Info.plist");
  executable = path.join(appBundle, "Contents", "MacOS", appName);
  resourcesRoot = path.join(appBundle, "Contents", "Resources");

  const actualBundleId = spawnSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleIdentifier", infoPlist],
    { encoding: "utf8", timeout: 10_000 },
  );
  const bundleName = spawnSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleName", infoPlist],
    { encoding: "utf8", timeout: 10_000 },
  );
  if (
    actualBundleId.status !== 0 ||
    actualBundleId.stdout.trim() !== bundleId ||
    bundleName.status !== 0 ||
    bundleName.stdout.trim() !== appName
  ) {
    throw new Error("PACKAGE_IDENTITY_METADATA_INVALID");
  }
  identityMetadataVerified = true;
} else {
  executable = path.join(packageRoot, `${appName}.exe`);
  resourcesRoot = path.join(packageRoot, "resources");
  const metadata = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$v=(Get-Item -LiteralPath $env:CONSTELLATION_PROBE_EXE).VersionInfo; [Console]::Out.Write((@{ProductName=$v.ProductName;FileDescription=$v.FileDescription}|ConvertTo-Json -Compress))",
    ],
    {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      env: { ...process.env, CONSTELLATION_PROBE_EXE: executable },
    },
  );
  let parsedMetadata;
  try {
    parsedMetadata = JSON.parse(metadata.stdout.trim());
  } catch {
    throw new Error("PACKAGE_IDENTITY_METADATA_INVALID");
  }
  if (
    metadata.status !== 0 ||
    parsedMetadata.ProductName !== appName ||
    parsedMetadata.FileDescription !== appName
  ) {
    throw new Error("PACKAGE_IDENTITY_METADATA_INVALID");
  }
  identityMetadataVerified = true;
}

const asarPath = path.join(resourcesRoot, "app.asar");
const unpackedRoot = path.join(resourcesRoot, "app.asar.unpacked");
const packagedBinding = path.join(
  unpackedRoot,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);
if (
  !fs.existsSync(executable) ||
  !fs.existsSync(asarPath) ||
  !fs.existsSync(unpackedRoot) ||
  !fs.existsSync(packagedBinding)
) {
  throw new Error("PACKAGE_CONTENT_INVALID");
}
const unpackedFiles = collectFiles(unpackedRoot);
if (
  unpackedFiles.length !== 1 ||
  unpackedFiles[0] !== packagedBinding ||
  path.extname(unpackedFiles[0]) !== ".node"
) {
  throw new Error("PACKAGED_NATIVE_MODULE_SET_INVALID");
}
if ((await digestFile(packagedBinding)) !== sourceBindingSha256) {
  throw new Error("PACKAGED_NATIVE_MODULE_DIGEST_MISMATCH");
}

if (platform === "darwin") {
  const sign = spawnSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", appBundle],
    { encoding: "utf8", timeout: 60_000 },
  );
  if (sign.status !== 0) throw new Error("AD_HOC_SIGNING_FAILED");
  const verify = spawnSync(
    "codesign",
    ["--verify", "--deep", "--strict", appBundle],
    { encoding: "utf8", timeout: 60_000 },
  );
  if (verify.status !== 0) throw new Error("AD_HOC_SIGNATURE_INVALID");
  signatureTier = "ad-hoc-mechanism-only";
} else {
  signatureTier = "unsigned-mechanism-only";
}
const packagedBindingSha256 = await digestFile(packagedBinding);

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    platform,
    architecture: "x64",
    electron: "43.1.0",
    asar: true,
    identityMetadataVerified,
    packagedNativeModules: 1,
    sourceNativeBindingSha256: sourceBindingSha256,
    packagedNativeBindingSha256: packagedBindingSha256,
    signatureTier,
  })}\n`,
);
