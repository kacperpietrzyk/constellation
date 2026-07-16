import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

const sha512 = (filename) =>
  createHash("sha512").update(readFileSync(filename)).digest("base64");

const quote = (value) => JSON.stringify(value);

const describe = (filename) => {
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      `RELEASE_ASSET_NOT_REGULAR_FILE:${path.basename(filename)}`,
    );
  }
  return {
    name: path.basename(filename),
    sha512: sha512(filename),
    size: stat.size,
  };
};

const selectOne = (assets, suffix) => {
  const matches = assets.filter((asset) => asset.name.endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(`RELEASE_ASSET_CARDINALITY:${suffix}:${matches.length}`);
  }
  return matches[0];
};

const yaml = (version, files, releaseDate, includeLegacyPath = false) => {
  const lines = [`version: ${quote(version)}`, "files:"];
  for (const file of files) {
    lines.push(`  - url: ${quote(file.name)}`);
    lines.push(`    sha512: ${quote(file.sha512)}`);
    lines.push(`    size: ${file.size}`);
  }
  if (includeLegacyPath) {
    const primary = files[0];
    lines.push(`path: ${quote(primary.name)}`);
    lines.push(`sha512: ${quote(primary.sha512)}`);
  }
  lines.push(`releaseDate: ${quote(releaseDate)}`);
  return `${lines.join("\n")}\n`;
};

export const prepareGitHubRelease = ({
  directory,
  version,
  includeWindows = false,
  releaseDate = new Date().toISOString(),
}) => {
  if (!STABLE_SEMVER.test(version)) throw new Error("RELEASE_VERSION_INVALID");
  if (Number.isNaN(Date.parse(releaseDate))) {
    throw new Error("RELEASE_DATE_INVALID");
  }

  const assets = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => describe(path.join(directory, entry.name)));
  const versionMarker = `-${version}-`;
  if (assets.some((asset) => !asset.name.includes(versionMarker))) {
    throw new Error("RELEASE_ASSET_VERSION_MISMATCH");
  }

  const macFiles = [
    selectOne(assets, "-mac-arm64.zip"),
    selectOne(assets, "-mac-arm64.dmg"),
    selectOne(assets, "-mac-x64.zip"),
    selectOne(assets, "-mac-x64.dmg"),
  ];
  writeFileSync(
    path.join(directory, "latest-mac.yml"),
    yaml(version, macFiles, releaseDate),
    { mode: 0o644 },
  );

  const published = [...macFiles];
  if (includeWindows) {
    const windows = selectOne(assets, "-win-x64.exe");
    writeFileSync(
      path.join(directory, "latest.yml"),
      yaml(version, [windows], releaseDate, true),
      { mode: 0o644 },
    );
    published.push(windows);
  }

  const manifest = {
    schema: "constellation.github-release/v1",
    version,
    releaseDate,
    updateOrigin:
      "https://github.com/kacperpietrzyk/constellation/releases/latest/download",
    windowsProductionRelease: includeWindows,
    artifacts: published,
  };
  writeFileSync(
    path.join(directory, "constellation-release.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  );
  return manifest;
};

const parseArguments = (argv) => {
  const result = { includeWindows: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--include-windows") {
      result.includeWindows = true;
    } else if (value === "--directory" || value === "--version") {
      const next = argv[index + 1];
      if (next === undefined)
        throw new Error(`RELEASE_ARGUMENT_MISSING:${value}`);
      result[value.slice(2)] = next;
      index += 1;
    } else {
      throw new Error(`RELEASE_ARGUMENT_UNKNOWN:${value}`);
    }
  }
  if (result.directory === undefined || result.version === undefined) {
    throw new Error("RELEASE_ARGUMENTS_INCOMPLETE");
  }
  return result;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = parseArguments(process.argv.slice(2));
  prepareGitHubRelease(input);
  process.stdout.write(
    `Prepared immutable GitHub release metadata for ${input.version}.\n`,
  );
}
