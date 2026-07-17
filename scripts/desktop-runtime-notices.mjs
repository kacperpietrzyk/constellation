import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { ACCEPTED_LICENSE_EXPRESSIONS } from "./verify-dependency-licenses.mjs";

const DESKTOP_RUNTIME_ROOTS = [
  "@hocuspocus/provider",
  "@modelcontextprotocol/sdk",
  "better-sqlite3",
  "electron-updater",
  "react",
  "react-dom",
  "yjs",
  "zod",
];

const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/iu;
const MAX_LICENSE_BYTES = 512 * 1024;
const MAX_NOTICE_PACKAGES = 1_000;
const MAX_NOTICE_BUNDLE_BYTES = 10 * 1024 * 1024;

const LAZY_VAL_MIT = `The MIT License (MIT)

Copyright (c) Vladimir Krivosheev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));

const findPackageManifest = (packageName, requireFrom) => {
  let resolved;
  try {
    resolved = requireFrom.resolve(`${packageName}/package.json`);
  } catch {
    resolved = requireFrom.resolve(packageName);
  }
  let directory = path.dirname(resolved);
  while (directory !== path.dirname(directory)) {
    const candidate = path.join(directory, "package.json");
    if (fs.existsSync(candidate)) {
      const manifest = readJson(candidate);
      if (manifest.name === packageName)
        return { filename: candidate, manifest };
    }
    directory = path.dirname(directory);
  }
  throw new Error(`DESKTOP_NOTICE_PACKAGE_UNRESOLVED:${packageName}`);
};

const licenseTexts = (packageDirectory, packageKey, manifest) => {
  const files = fs
    .readdirSync(packageDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) {
    if (packageKey === "lazy-val@1.0.5" && manifest.license === "MIT") {
      return [{ name: "declared MIT license", text: LAZY_VAL_MIT }];
    }
    throw new Error(`DESKTOP_NOTICE_LICENSE_MISSING:${packageKey}`);
  }
  return files.map((name) => {
    const filename = path.join(packageDirectory, name);
    const stat = fs.statSync(filename);
    if (stat.size > MAX_LICENSE_BYTES) {
      throw new Error(`DESKTOP_NOTICE_LICENSE_TOO_LARGE:${packageKey}:${name}`);
    }
    return { name, text: fs.readFileSync(filename, "utf8").trim() };
  });
};

export const collectDesktopRuntimeNotices = ({
  root,
  packageRoots = DESKTOP_RUNTIME_ROOTS,
}) => {
  const rootRequire = createRequire(path.join(root, "package.json"));
  const queue = packageRoots.map((name) => ({
    name,
    requireFrom: rootRequire,
  }));
  const packages = new Map();
  let noticeBytes = 0;
  while (queue.length > 0) {
    const next = queue.shift();
    const { filename, manifest } = findPackageManifest(
      next.name,
      next.requireFrom,
    );
    if (
      typeof manifest.version !== "string" ||
      typeof manifest.license !== "string" ||
      !ACCEPTED_LICENSE_EXPRESSIONS.has(manifest.license)
    ) {
      throw new Error(`DESKTOP_NOTICE_METADATA_INVALID:${next.name}`);
    }
    const key = `${manifest.name}@${manifest.version}`;
    if (packages.has(key)) continue;
    const directory = path.dirname(filename);
    const notices = licenseTexts(directory, key, manifest);
    noticeBytes += notices.reduce(
      (total, notice) => total + Buffer.byteLength(notice.text),
      0,
    );
    if (noticeBytes > MAX_NOTICE_BUNDLE_BYTES) {
      throw new Error("DESKTOP_NOTICE_BUNDLE_LIMIT_EXCEEDED");
    }
    packages.set(key, {
      key,
      name: manifest.name,
      version: manifest.version,
      license: manifest.license,
      notices,
    });
    if (packages.size > MAX_NOTICE_PACKAGES) {
      throw new Error("DESKTOP_NOTICE_PACKAGE_LIMIT_EXCEEDED");
    }
    const requireFrom = createRequire(filename);
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    };
    for (const dependency of Object.keys(dependencies).sort()) {
      try {
        findPackageManifest(dependency, requireFrom);
      } catch {
        if (
          manifest.optionalDependencies?.[dependency] !== undefined ||
          manifest.peerDependenciesMeta?.[dependency]?.optional === true
        ) {
          continue;
        }
        throw new Error(
          `DESKTOP_NOTICE_DEPENDENCY_UNRESOLVED:${key}:${dependency}`,
        );
      }
      queue.push({ name: dependency, requireFrom });
      if (queue.length > MAX_NOTICE_PACKAGES * 10) {
        throw new Error("DESKTOP_NOTICE_QUEUE_LIMIT_EXCEEDED");
      }
    }
  }
  return [...packages.values()].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  );
};

export const renderDesktopRuntimeNotices = (packages) => {
  const sections = [
    "Constellation desktop third-party notices",
    "",
    "This file preserves the license notices for the external runtime dependency closure bundled into or linked with the desktop application. Electron and Chromium notices are distributed alongside this file by Electron itself.",
  ];
  for (const entry of packages) {
    sections.push("", "=".repeat(78), "");
    sections.push(`${entry.name} ${entry.version} — ${entry.license}`);
    for (const notice of entry.notices) {
      sections.push("", `Source notice: ${notice.name}`, "", notice.text);
    }
  }
  return `${sections.join("\n")}\n`;
};

export const writeDesktopLicenseBundle = ({ root, destination }) => {
  const packages = collectDesktopRuntimeNotices({ root });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(
    path.join(root, "LICENSE"),
    path.join(destination, "CONSTELLATION-LICENSE.txt"),
  );
  const notices = renderDesktopRuntimeNotices(packages);
  if (Buffer.byteLength(notices) > MAX_NOTICE_BUNDLE_BYTES) {
    throw new Error("DESKTOP_NOTICE_BUNDLE_LIMIT_EXCEEDED");
  }
  fs.writeFileSync(path.join(destination, "THIRD-PARTY-NOTICES.txt"), notices);
  const nativeRoot = path.join(root, "node_modules", "better-sqlite3");
  const requiredNativeLicenses = ["SQLCipher-LICENSE.md"];
  if (process.platform === "win32")
    requiredNativeLicenses.push("OpenSSL-LICENSE.txt");
  for (const name of requiredNativeLicenses) {
    const source = path.join(nativeRoot, name);
    if (!fs.existsSync(source)) {
      throw new Error(`DESKTOP_NOTICE_NATIVE_LICENSE_MISSING:${name}`);
    }
    fs.copyFileSync(source, path.join(destination, name));
  }
  return {
    packageCount: packages.length,
    files: fs.readdirSync(destination).sort(),
  };
};
