import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = path.join(root, "release");
const output = path.join(releaseRoot, "distribution");
const buildConfig = path.join(root, "build", "distribution-builder.json");
const alphaManifest = JSON.parse(
  fs.readFileSync(path.join(releaseRoot, "local-alpha-manifest.json"), "utf8"),
);
const releaseTier = process.env.CONSTELLATION_RELEASE_TIER ?? "mechanism-only";
const production = releaseTier === "production-signed";
const origin = process.env.CONSTELLATION_UPDATE_ORIGIN;
const parsedOrigin = origin === undefined ? undefined : new URL(origin);
if (
  parsedOrigin !== undefined &&
  (parsedOrigin.protocol !== "https:" ||
    parsedOrigin.username !== "" ||
    parsedOrigin.password !== "" ||
    parsedOrigin.search !== "" ||
    parsedOrigin.hash !== "")
) {
  throw new Error("RELEASE_ORIGIN_INVALID");
}
const normalizedOrigin = parsedOrigin?.toString().replace(/\/$/, "");
if (releaseTier !== "mechanism-only" && !production) {
  throw new Error("RELEASE_TIER_INVALID");
}
if (production) {
  if (normalizedOrigin === undefined) throw new Error("RELEASE_ORIGIN_INVALID");
  if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) {
    throw new Error("PRODUCTION_CODE_SIGNING_CREDENTIALS_REQUIRED");
  }
  if (
    process.platform === "darwin" &&
    !(
      (process.env.APPLE_API_KEY &&
        process.env.APPLE_API_KEY_ID &&
        process.env.APPLE_API_ISSUER) ||
      (process.env.APPLE_ID &&
        process.env.APPLE_APP_SPECIFIC_PASSWORD &&
        process.env.APPLE_TEAM_ID) ||
      (process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE)
    )
  ) {
    throw new Error("MACOS_NOTARIZATION_CREDENTIALS_REQUIRED");
  }
}
if (alphaManifest.releaseTier !== releaseTier) {
  throw new Error("PREPACKAGED_RELEASE_TIER_MISMATCH");
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.dirname(buildConfig), { recursive: true });
const config = {
  appId: "io.constellation.local-alpha",
  productName: "Constellation Local Alpha",
  forceCodeSigning: production,
  directories: { output },
  artifactName: "Constellation-Local-Alpha-${version}-${os}-${arch}.${ext}",
  publish: normalizedOrigin
    ? [
        {
          provider: "generic",
          url: normalizedOrigin,
        },
      ]
    : undefined,
  generateUpdatesFilesForAllChannels: true,
  extraMetadata: {
    version: alphaManifest.version,
    author: { name: "Constellation contributors" },
  },
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.productivity",
    hardenedRuntime: production,
    identity: production ? undefined : null,
    notarize: production,
    icon: path.join(root, "assets", "app-icon.png"),
  },
  dmg: {
    sign: production,
  },
  win: {
    target: ["nsis"],
    signAndEditExecutable: true,
    icon: path.join(root, "assets", "app-icon.png"),
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
  },
};
fs.writeFileSync(buildConfig, `${JSON.stringify(config, null, 2)}\n`);

const builder = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);
const targetArgs =
  process.platform === "darwin"
    ? ["--mac", "dmg", "zip", `--${alphaManifest.architecture}`]
    : process.platform === "win32"
      ? ["--win", "nsis", "--x64"]
      : undefined;
if (targetArgs === undefined)
  throw new Error("DISTRIBUTION_PLATFORM_UNSUPPORTED");
const built = spawnSync(
  builder,
  [
    "--prepackaged",
    alphaManifest.packageRoot,
    "--config",
    buildConfig,
    "--publish",
    "never",
    ...targetArgs,
  ],
  { cwd: root, encoding: "utf8", stdio: "inherit", timeout: 20 * 60_000 },
);
if (built.status !== 0) throw new Error("DISTRIBUTION_BUILD_FAILED");

const files = fs
  .readdirSync(output, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(output, entry.name));
const expected =
  process.platform === "darwin"
    ? [".dmg", ".zip", "latest-mac.yml"]
    : [".exe", "latest.yml"];
if (
  expected.some((suffix) =>
    suffix.startsWith(".")
      ? !files.some((file) => file.endsWith(suffix))
      : !files.some((file) => path.basename(file) === suffix),
  )
) {
  throw new Error("DISTRIBUTION_ARTIFACT_SET_INVALID");
}

if (production && process.platform === "darwin") {
  if (typeof alphaManifest.appBundle !== "string") {
    throw new Error("MACOS_APPLICATION_BUNDLE_MISSING");
  }
  for (const command of [
    ["codesign", ["--verify", "--deep", "--strict", alphaManifest.appBundle]],
    [
      "spctl",
      ["--assess", "--type", "exec", "--verbose=2", alphaManifest.appBundle],
    ],
    ["xcrun", ["stapler", "validate", alphaManifest.appBundle]],
  ]) {
    const verified = spawnSync(command[0], command[1], {
      encoding: "utf8",
      timeout: 120_000,
    });
    if (verified.status !== 0)
      throw new Error("MACOS_DISTRIBUTION_PROOF_FAILED");
  }
}
if (production && process.platform === "win32") {
  const installer = files.find((file) => file.endsWith(".exe"));
  const verified = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "if ((Get-AuthenticodeSignature -LiteralPath $args[0]).Status -ne 'Valid') { exit 1 }",
      installer,
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  if (verified.status !== 0)
    throw new Error("WINDOWS_DISTRIBUTION_PROOF_FAILED");
}

const digestFile = async (filename) => {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
};
const artifacts = [];
for (const filename of files.sort()) {
  artifacts.push({
    name: path.basename(filename),
    bytes: fs.statSync(filename).size,
    sha256: await digestFile(filename),
  });
}
const manifest = {
  status: "pass",
  releaseTier,
  version: alphaManifest.version,
  platform: alphaManifest.platform,
  architecture: alphaManifest.architecture,
  applicationId: "io.constellation.local-alpha",
  dataRemovalOnUninstall: false,
  productionSignatureVerified: production,
  artifacts,
};
fs.writeFileSync(
  path.join(output, "distribution-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
