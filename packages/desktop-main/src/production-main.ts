import { fileURLToPath } from "node:url";

import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  safeStorage,
  session,
  shell,
} from "electron";
import {
  DESKTOP_CHANNELS,
  type DesktopBuildInfo,
} from "@constellation/desktop-preload/client";
import { EncryptedStoreCapabilityError } from "@constellation/local-store";

import { createBetterSqlite3Factory } from "./better-sqlite3-factory.js";
import {
  createDurableKernelService,
  DurableWorkspaceOpenError,
  type DurableKernelService,
} from "./durable-kernel-service.js";
import { DESKTOP_PREVIEW_VERSION } from "./index.js";
import type { DesktopKernelService } from "./runtime-kernel-service.js";
import { assertTrustedSender, isTrustedRendererUrl } from "./security.js";
import {
  WorkspaceKeyCustodyError,
  type AsyncSafeStorage,
} from "./workspace-key-custody.js";

const preloadPath = fileURLToPath(
  new URL("../../../desktop-preload/build/preload.cjs", import.meta.url),
);
const rendererPath = fileURLToPath(
  new URL("../../../desktop-ui/dist/index.html", import.meta.url),
);
let mainWindow: BrowserWindow | undefined;
let durableKernel: DurableKernelService | undefined;

interface DesktopRuntime {
  readonly buildInfo: DesktopBuildInfo;
  readonly service: DesktopKernelService;
}

const electronSafeStorage: AsyncSafeStorage = {
  isAsyncEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encryptStringAsync: (value) => safeStorage.encryptStringAsync(value),
  decryptStringAsync: (value) => safeStorage.decryptStringAsync(value),
};

const createDesktopRuntime = async (): Promise<DesktopRuntime> => {
  durableKernel = await createDurableKernelService({
    databaseFactory: createBetterSqlite3Factory(),
    safeStorage: electronSafeStorage,
    stateRoot: app.getPath("userData"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  return {
    service: durableKernel.service,
    buildInfo: {
      channel: "local-alpha",
      initialWorkspaceId: durableKernel.identity.workspaceId,
      persistence: "encrypted-local",
      version: DESKTOP_PREVIEW_VERSION,
    },
  };
};

const createWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#08090b",
    show: false,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 18 },
        }
      : { titleBarStyle: "default" as const }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow = window;
  window.once("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  await window.loadFile(rendererPath);
  return window;
};

const startProductionDesktop = async (): Promise<void> => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  const runtime = await createDesktopRuntime();
  ipcMain.handle(DESKTOP_CHANNELS.executeCommand, (event, command: unknown) => {
    assertTrustedSender(event);
    return runtime.service.execute(command);
  });
  ipcMain.handle(DESKTOP_CHANNELS.runQuery, (event, query: unknown) => {
    assertTrustedSender(event);
    return runtime.service.query(query);
  });
  ipcMain.handle(DESKTOP_CHANNELS.getBuildInfo, (event) => {
    assertTrustedSender(event);
    return runtime.buildInfo;
  });

  await createWindow();
  const shortcutRegistered = globalShortcut.register(
    "CommandOrControl+Shift+K",
    () => {
      const window = mainWindow;
      if (window === undefined || window.isDestroyed()) return;
      window.show();
      window.focus();
      window.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: "K",
        modifiers:
          process.platform === "darwin"
            ? ["meta", "shift"]
            : ["control", "shift"],
      });
    },
  );
  if (!shortcutRegistered) {
    console.warn("Quick Capture global shortcut could not be registered.");
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch(reportStartupFailure);
    }
  });
};

const startupFailureCopy = (
  error: unknown,
): { readonly code: string; readonly detail: string } => {
  if (error instanceof WorkspaceKeyCustodyError) {
    if (error.code === "encryption_unavailable") {
      return {
        code: "secure-storage-unavailable",
        detail:
          "Secure operating-system key storage is unavailable. Unlock your sign-in keychain or credential store, then start Constellation again.",
      };
    }
    return {
      code: "protected-key-unavailable",
      detail:
        "The protected workspace key could not be opened safely. Constellation did not modify the workspace. Restore the key wrapper and database from the same backup before trying again.",
    };
  }
  if (error instanceof DurableWorkspaceOpenError) {
    return {
      code: "workspace-open-blocked",
      detail:
        error.code === "database_without_key"
          ? "The encrypted database is present but its protected key wrapper is missing. Constellation did not modify the database. Restore both files from the same backup before trying again."
          : "The local workspace could not be opened safely. Constellation did not continue with a partial workspace. Restore a known-good workspace backup before trying again.",
    };
  }
  if (error instanceof EncryptedStoreCapabilityError) {
    return {
      code: "encrypted-store-unavailable",
      detail:
        "The encrypted database component did not pass its startup safety checks. Reinstall this Constellation build; your existing workspace was not intentionally changed.",
    };
  }
  return {
    code: "desktop-startup-failed",
    detail:
      "Constellation could not start the local workspace safely. Your workspace was not intentionally changed. Open the data folder for recovery or try reinstalling this build.",
  };
};

const reportStartupFailure = async (error: unknown): Promise<void> => {
  durableKernel?.close();
  durableKernel = undefined;
  const failure = startupFailureCopy(error);
  console.error(`Constellation startup stopped safely (${failure.code}).`);
  try {
    const result = await dialog.showMessageBox({
      type: "error",
      title: "Constellation could not open the workspace",
      message: "The local workspace was not opened.",
      detail: failure.detail,
      buttons: ["Quit", "Open Data Folder"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (result.response === 1) {
      await shell.openPath(app.getPath("userData"));
    }
  } catch {
    // The app must still terminate if the operating-system dialog fails.
  } finally {
    app.exit(1);
  }
};

void app.whenReady().then(startProductionDesktop).catch(reportStartupFailure);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  durableKernel?.close();
  durableKernel = undefined;
});
