import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "app");
const outputRoot = path.join(root, "out");
const electronZipDir = path.join(root, "build", "electron-zips");
const appName = "Constellation Key Custody Probe";
const platform = process.platform;
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

if (!electronArchive) {
  throw new Error("PACKAGING_PLATFORM_UNSUPPORTED");
}

const archivePath = path.join(electronZipDir, electronArchive.filename);
if (!fs.existsSync(archivePath)) throw new Error("ELECTRON_ARCHIVE_MISSING");
const archiveHash = crypto.createHash("sha256");
for await (const chunk of fs.createReadStream(archivePath)) {
  archiveHash.update(chunk);
}
if (archiveHash.digest("hex") !== electronArchive.sha256) {
  throw new Error("ELECTRON_ARCHIVE_DIGEST_MISMATCH");
}

fs.rmSync(outputRoot, { recursive: true, force: true });
const packagePaths = await packager({
  dir: appRoot,
  name: appName,
  out: outputRoot,
  overwrite: true,
  platform,
  arch: "x64",
  electronVersion: "43.1.0",
  electronZipDir,
  asar: true,
  prune: true,
  appBundleId: "io.constellation.key-custody-probe",
  helperBundleId: "io.constellation.key-custody-probe.helper",
  appVersion: "0.0.1",
  buildVersion: "0.0.1",
  appCopyright: "Copyright Constellation contributors",
  win32metadata: {
    CompanyName: "Constellation contributors",
    FileDescription: appName,
    ProductName: appName,
    InternalName: "ConstellationKeyCustodyProbe",
    OriginalFilename: `${appName}.exe`,
    "requested-execution-level": "asInvoker",
  },
  quiet: true,
});

if (packagePaths.length !== 1) throw new Error("PACKAGE_OUTPUT_INVALID");
const packageRoot = packagePaths[0];
let executable;
let resources;
let signatureTier;
let identityMetadataVerified = false;

if (platform === "darwin") {
  const appBundle = path.join(packageRoot, `${appName}.app`);
  const infoPlist = path.join(appBundle, "Contents", "Info.plist");
  executable = path.join(appBundle, "Contents", "MacOS", appName);
  resources = path.join(appBundle, "Contents", "Resources", "app.asar");

  const bundleId = spawnSync(
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
    bundleId.status !== 0 ||
    bundleId.stdout.trim() !== "io.constellation.key-custody-probe" ||
    bundleName.status !== 0 ||
    bundleName.stdout.trim() !== appName
  ) {
    throw new Error("PACKAGE_IDENTITY_METADATA_INVALID");
  }
  identityMetadataVerified = true;

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
} else {
  executable = path.join(packageRoot, `${appName}.exe`);
  resources = path.join(packageRoot, "resources", "app.asar");
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
  signatureTier = "unsigned-mechanism-only";
}

if (!fs.existsSync(executable) || !fs.existsSync(resources)) {
  throw new Error("PACKAGE_CONTENT_INVALID");
}

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    platform,
    architecture: "x64",
    electron: "43.1.0",
    asar: true,
    identityMetadataVerified,
    signatureTier,
  })}\n`,
);
