/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Ta połowa kontraktu celowo czyta źródła `desktop-main`: to jedyny sposób, w
// jaki test renderera dosięga niezmiennika z drugiej paczki — proces główny nie
// jest importowalny z testów UI (Electron w runtime). Połowa dotycząca samego
// renderera została przeniesiona do surface-registry-render.test.ts i nie
// czyta już ani jednego pliku źródłowego.
const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "package.json"))) {
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
const applicationMenu = read(
  path.join(packagesRoot, "desktop-main", "src", "app-menu.ts"),
);
const previewMain = read(
  path.join(packagesRoot, "desktop-main", "src", "main.ts"),
);
const productionMain = read(
  path.join(packagesRoot, "desktop-main", "src", "production-main.ts"),
);

test("the desktop main process derives its menu and window destinations from the one surface registry", () => {
  assert.match(applicationMenu, /desktopSurfaceRegistry\.flatMap\(/);
  assert.match(previewMain, /new Set<string>\(desktopSurfaceIds\)/);
  assert.match(productionMain, /new Set<string>\(desktopSurfaceIds\)/);
});
