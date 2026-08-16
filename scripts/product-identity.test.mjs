import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("0.2.0 packages the public product as Constellation while retaining upgrade identity", () => {
  const alpha = read("scripts/package-alpha.mjs");
  const distribution = read("scripts/package-distribution.mjs");
  const productionMain = read("packages/desktop-main/src/production-main.ts");
  const developmentMain = read("packages/desktop-main/src/dev-main.ts");
  const applicationMenu = read("packages/desktop-main/src/app-menu.ts");
  const productionDesktopFiles = read(
    "scripts/desktop/production-desktop-files.mjs",
  );
  const devState = read("scripts/dev-state.mjs");

  assert.match(alpha, /const appName = "Constellation";/u);
  assert.match(distribution, /productName: "Constellation"/u);
  assert.match(
    distribution,
    /artifactName: "Constellation-\$\{version\}-\$\{os\}-\$\{arch\}\.\$\{ext\}"/u,
  );

  // These compatibility identities must survive the 0.1.9 -> 0.2.0 rename.
  assert.match(alpha, /const bundleId = "io\.constellation\.local-alpha";/u);
  assert.match(
    alpha,
    /updaterCacheDirName: constellation-local-alpha-updater/u,
  );
  assert.match(
    productionMain,
    /LEGACY_USER_DATA_DIRECTORY = "Constellation Local Alpha"/u,
  );
  assert.match(productionMain, /app\.setPath\(\s*"userData"/u);
  assert.match(productionMain, /app\.setName\(LEGACY_KEYCHAIN_APP_NAME\)/u);
  assert.match(
    developmentMain,
    /LEGACY_KEYCHAIN_APP_NAME = "Constellation Local Alpha"/u,
  );
  assert.match(developmentMain, /app\.setName\(LEGACY_KEYCHAIN_APP_NAME\)/u);
  assert.match(applicationMenu, /label: "Constellation"/u);
  assert.match(
    productionMain,
    /const \{ installApplicationMenu \} = await import\("\.\/app-menu\.js"\);/u,
  );
  assert.doesNotMatch(
    productionMain,
    /import \{ installApplicationMenu \} from "\.\/app-menu\.js";/u,
  );
  assert.match(productionMain, /installApplicationMenu\(\);/u);
  assert.match(
    productionMain,
    /app\.setAboutPanelOptions\(\{ applicationName: "Constellation" \}\);/u,
  );
  assert.match(productionDesktopFiles, /"app-menu\.js"/u);
  assert.match(devState, /INSTALLED_APP_NAME = "Constellation"/u);
  assert.match(
    devState,
    /INSTALLED_STATE_DIRECTORY = "Constellation Local Alpha"/u,
  );
});
