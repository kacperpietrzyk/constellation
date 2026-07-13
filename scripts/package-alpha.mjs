import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { packager } from "@electron/packager";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(root, "build", "local-alpha-stage");
const output = path.join(root, "release");
const appName = "Constellation Local Alpha";
const bundleId = "io.constellation.local-alpha";
const architecture = process.env.CONSTELLATION_ALPHA_ARCH ?? "x64";

if (!new Set(["darwin", "win32"]).has(process.platform)) {
  throw new Error("LOCAL_ALPHA_PACKAGING_PLATFORM_UNSUPPORTED");
}
if (architecture !== "x64") {
  throw new Error("LOCAL_ALPHA_PACKAGING_ARCHITECTURE_UNSUPPORTED");
}

const copy = (source, target, options = {}) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, dereference: true, ...options });
};

const copyPackage = (name, additions = []) => {
  const source = path.join(root, "packages", name);
  const target = path.join(stage, "node_modules", "@constellation", name);
  copy(path.join(source, "package.json"), path.join(target, "package.json"));
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
      main: "node_modules/@constellation/desktop-main/dist/src/main.js",
    },
    null,
    2,
  )}\n`,
);

for (const name of ["contracts", "domain", "application", "local-store"]) {
  copyPackage(name);
}
copyPackage("desktop-main");
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
fs.rmSync(
  path.join(
    stage,
    "node_modules",
    "@constellation",
    "desktop-main",
    "dist",
    "src",
    "preview-service.js",
  ),
  { force: true },
);

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
  !fs.existsSync(path.join(resources, "app.asar")) ||
  unpackedFiles.length !== 1 ||
  path.basename(unpackedFiles[0]) !== "better_sqlite3.node"
) {
  throw new Error("PACKAGED_NATIVE_MODULE_SET_INVALID");
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
  executable,
  packagedNativeModules: 1,
  nativeBindingSha256: digest,
  signatureTier,
};
fs.writeFileSync(
  path.join(output, "local-alpha-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
