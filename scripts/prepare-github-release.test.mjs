import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { prepareGitHubRelease } from "./prepare-github-release.mjs";

const require = createRequire(import.meta.url);
const { MacUpdater } = require("electron-updater/out/MacUpdater.js");

const VERSION = "0.2.0";
const RELEASE_DATE = "2026-07-16T08:00:00.000Z";

const fixture = (includeWindows = false) => {
  const directory = mkdtempSync(path.join(tmpdir(), "constellation-release-"));
  const names = [
    `Constellation-Local-Alpha-${VERSION}-mac-arm64.zip`,
    `Constellation-Local-Alpha-${VERSION}-mac-arm64.dmg`,
    `Constellation-Local-Alpha-${VERSION}-mac-x64.zip`,
    `Constellation-Local-Alpha-${VERSION}-mac-x64.dmg`,
  ];
  if (includeWindows) {
    names.push(`Constellation-Local-Alpha-${VERSION}-win-x64.exe`);
  }
  for (const [index, name] of names.entries()) {
    writeFileSync(path.join(directory, name), `fixture-${index}`);
  }
  return directory;
};

test("prepares one architecture-aware macOS channel for GitHub Releases", () => {
  const directory = fixture();
  try {
    const manifest = prepareGitHubRelease({
      directory,
      version: VERSION,
      releaseDate: RELEASE_DATE,
    });
    const metadata = readFileSync(
      path.join(directory, "latest-mac.yml"),
      "utf8",
    );

    assert.match(metadata, /mac-arm64\.zip/u);
    assert.match(metadata, /mac-arm64\.dmg/u);
    assert.match(metadata, /mac-x64\.zip/u);
    assert.match(metadata, /mac-x64\.dmg/u);
    assert.equal((metadata.match(/sha512:/gu) ?? []).length, 4);
    assert.equal(manifest.windowsProductionRelease, false);
    assert.equal(manifest.artifacts.length, 4);
    assert.equal(
      manifest.updateOrigin,
      "https://github.com/kacperpietrzyk/constellation/releases/latest/download",
    );

    const resolved = manifest.artifacts.map((artifact) => ({
      url: new URL(`https://example.invalid/${artifact.name}`),
      info: { url: artifact.name },
    }));
    assert.deepEqual(
      MacUpdater.filterFilesForArch(resolved, true).map(
        (file) => file.info.url,
      ),
      manifest.artifacts
        .filter((artifact) => artifact.name.includes("arm64"))
        .map((artifact) => artifact.name),
    );
    assert.deepEqual(
      MacUpdater.filterFilesForArch(resolved, false).map(
        (file) => file.info.url,
      ),
      manifest.artifacts
        .filter((artifact) => artifact.name.includes("x64"))
        .map((artifact) => artifact.name),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("adds Windows metadata only when paid signing is explicitly enabled", () => {
  const directory = fixture(true);
  try {
    const manifest = prepareGitHubRelease({
      directory,
      version: VERSION,
      includeWindows: true,
      releaseDate: RELEASE_DATE,
    });
    const metadata = readFileSync(path.join(directory, "latest.yml"), "utf8");

    assert.match(metadata, /win-x64\.exe/u);
    assert.match(metadata, /^path:/mu);
    assert.equal(manifest.windowsProductionRelease, true);
    assert.equal(manifest.artifacts.length, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fails closed when one macOS architecture is missing", () => {
  const directory = fixture();
  try {
    rmSync(
      path.join(directory, `Constellation-Local-Alpha-${VERSION}-mac-x64.zip`),
    );
    assert.throws(
      () =>
        prepareGitHubRelease({
          directory,
          version: VERSION,
          releaseDate: RELEASE_DATE,
        }),
      /RELEASE_ASSET_CARDINALITY:-mac-x64\.zip:0/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects mismatched artifact versions", () => {
  const directory = fixture();
  try {
    assert.throws(
      () =>
        prepareGitHubRelease({
          directory,
          version: "0.3.0",
          releaseDate: RELEASE_DATE,
        }),
      /RELEASE_ASSET_VERSION_MISMATCH/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects prerelease versions because GitHub latest excludes them", () => {
  const directory = fixture();
  try {
    assert.throws(
      () =>
        prepareGitHubRelease({
          directory,
          version: "0.2.0-alpha.1",
          releaseDate: RELEASE_DATE,
        }),
      /RELEASE_VERSION_INVALID/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
