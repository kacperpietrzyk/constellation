import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, type BrowserWindow } from "electron";

// The macOS Keychain item that wraps the workspace key is named after the
// application, so this name — not the state directory — is what lets an
// unpackaged run open a real workspace.
const LEGACY_KEYCHAIN_APP_NAME = "Constellation Local Alpha";
const RELOAD_DEBOUNCE_MS = 120;

const stateRoot = process.env.CONSTELLATION_DEV_STATE_ROOT;
if (stateRoot === undefined || !path.isAbsolute(stateRoot)) {
  throw new Error(
    "CONSTELLATION_DEV_STATE_ROOT must be an absolute path. Run: npm run dev:snapshot",
  );
}

app.setName(LEGACY_KEYCHAIN_APP_NAME);
app.setPath("userData", stateRoot);

// Vite's emptyOutDir clears this directory's contents on every rebuild but does
// not unlink the directory itself, so one watcher survives repeated builds.
// Measured: 66 events per rebuild, identical across three consecutive rebuilds.
const rendererDirectory = fileURLToPath(
  new URL("../../../desktop-ui/dist", import.meta.url),
);

app.on("browser-window-created", (_event: unknown, window: BrowserWindow) => {
  let pending: NodeJS.Timeout | undefined;
  const watcher = watch(rendererDirectory, { recursive: true }, () => {
    if (pending !== undefined) clearTimeout(pending);
    pending = setTimeout(() => {
      if (!window.isDestroyed()) window.webContents.reloadIgnoringCache();
    }, RELOAD_DEBOUNCE_MS);
  });
  window.once("closed", () => {
    if (pending !== undefined) clearTimeout(pending);
    watcher.close();
  });
});

// Not awaited: an ESM main entry that awaits app.whenReady() at top level never
// reaches ready. scripts/package-alpha.mjs generates its packaged entry the
// same way.
void import("./production-main.js");
