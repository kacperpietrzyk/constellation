/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  desktopSurfaceIds,
  desktopSurfaceRegistry,
} from "@constellation/desktop-preload/surface-registry";

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
const realApp = read(path.join(uiRoot, "src", "RealApp.tsx"));
const fixtureContract = read(
  path.join(uiRoot, "src", "client", "wave2-fixtures.ts"),
);
const shellNavigation = read(
  path.join(uiRoot, "src", "client", "shell-navigation.ts"),
);
const applicationMenu = read(
  path.join(packagesRoot, "desktop-main", "src", "app-menu.ts"),
);
const previewMain = read(
  path.join(packagesRoot, "desktop-main", "src", "main.ts"),
);
const productionMain = read(
  path.join(packagesRoot, "desktop-main", "src", "production-main.ts"),
);

test("one desktop surface registry drives navigation, restore, preload, menu, and rendering coverage", () => {
  assert.match(fixtureContract, /export type SurfaceId = DesktopSurface/);
  assert.match(realApp, /const navItems = desktopSurfaceRegistry\.map\(/);
  assert.match(
    realApp,
    /satisfies Record<LazyDesktopSurface, \(\) => Promise<unknown>>/,
  );
  assert.match(shellNavigation, /new Set<SurfaceId>\(desktopSurfaceIds\)/);
  assert.match(applicationMenu, /desktopSurfaceRegistry\.flatMap\(/);
  assert.match(previewMain, /new Set<string>\(desktopSurfaceIds\)/);
  assert.match(productionMain, /new Set<string>\(desktopSurfaceIds\)/);

  const lazyIds = desktopSurfaceRegistry
    .filter((surface) => surface.loading === "lazy")
    .map((surface) => surface.id);
  for (const id of lazyIds) {
    assert.match(realApp, new RegExp(`\\n\\s{2}${id}: load`));
  }
  for (const id of desktopSurfaceIds) {
    assert.match(realApp, new RegExp(`surface === "${id}"`));
  }
});
