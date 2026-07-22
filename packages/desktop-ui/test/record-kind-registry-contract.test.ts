/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "RealApp.tsx"))) {
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error("Could not locate the desktop-ui package root.");
    directory = parent;
  }
  return directory;
};

const uiRoot = findPackageRoot();
const packagesRoot = path.dirname(uiRoot);
const read = (file: string): string => readFileSync(file, "utf8");

test("one human record registry drives search defaults, labels, and inspector destinations", () => {
  const application = read(
    path.join(packagesRoot, "application", "src", "wave2.ts"),
  );
  const queryContract = read(
    path.join(packagesRoot, "contracts", "src", "query.ts"),
  );
  const labels = read(path.join(uiRoot, "src", "i18n.ts"));
  const surfaces = read(path.join(uiRoot, "src", "Wave2Surfaces.tsx"));

  assert.match(
    queryContract,
    /kinds: z\s*\.array\(GlobalSearchRecordKindSchema\)/,
  );
  assert.match(queryContract, /recordKind: GlobalSearchRecordKindSchema/);
  assert.match(
    application,
    /query\.parameters\.kinds \?\? globalSearchRecordKindIds/,
  );
  assert.match(application, /isGlobalSearchRecordKind\(record\.kind\)/);
  assert.match(labels, /humanRecordKindRegistry\.map\(\(descriptor\) =>/);
  assert.match(
    surfaces,
    /getHumanRecordKindDescriptor\(item\.recordKind\)\.inspectorSurface/,
  );
  assert.doesNotMatch(surfaces, /const relationshipKinds = new Set/);
});
