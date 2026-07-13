import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { removeOwnedProbeTemporaryRoots } from "./cleanup-targets.mjs";

const sandboxRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "constellation-cleanup-test-"),
);
const ownedDirectoryNames = [
  "constellation-packaged-store-probe-owned",
  "constellation-packaged-store-recovery-owned",
  "constellation-packaged-store-generation-owned",
];
const preservedDirectoryNames = [
  "constellation-packaged-store-probe",
  "constellation-packaged-store-probe-",
  "constellation-packaged-store-recovery",
  "constellation-packaged-store-recovery-",
  "constellation-packaged-store-recoverable-owned",
  "constellation-packaged-store-generation",
  "constellation-packaged-store-generation-",
  "constellation-packaged-store-generational-owned",
  "unrelated-probe-output",
];
const preservedFileNames = [
  "constellation-packaged-store-probe-file",
  "constellation-packaged-store-recovery-file",
  "constellation-packaged-store-generation-file",
];

try {
  for (const name of ownedDirectoryNames) {
    const directory = path.join(sandboxRoot, name);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, "artifact"), "owned");
  }
  for (const name of preservedDirectoryNames) {
    fs.mkdirSync(path.join(sandboxRoot, name));
  }
  for (const name of preservedFileNames) {
    fs.writeFileSync(path.join(sandboxRoot, name), "not a directory");
  }

  assert.equal(await removeOwnedProbeTemporaryRoots(sandboxRoot), 3);
  for (const name of ownedDirectoryNames) {
    assert.equal(fs.existsSync(path.join(sandboxRoot, name)), false);
  }
  for (const name of [...preservedDirectoryNames, ...preservedFileNames]) {
    assert.equal(fs.existsSync(path.join(sandboxRoot, name)), true);
  }
  assert.equal(await removeOwnedProbeTemporaryRoots(sandboxRoot), 0);
  assert.equal(
    await removeOwnedProbeTemporaryRoots(path.join(sandboxRoot, "missing")),
    0,
  );
} finally {
  fs.rmSync(sandboxRoot, { recursive: true, force: true });
}

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    existingProbeRootRemoved: true,
    recoveryProbeRootRemoved: true,
    generationProbeRootRemoved: true,
    nearMatchesPreserved: true,
  })}\n`,
);
