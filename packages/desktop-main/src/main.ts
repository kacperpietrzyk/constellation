import { fileURLToPath } from "node:url";

import {
  app,
  BrowserWindow,
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

import { DESKTOP_PREVIEW_VERSION } from "./index.js";
import { createBetterSqlite3Factory } from "./better-sqlite3-factory.js";
import {
  createDurableKernelService,
  type DurableKernelService,
} from "./durable-kernel-service.js";
import {
  PREVIEW_IDENTITY,
  createPreviewKernelService,
} from "./preview-service.js";
import type { DesktopKernelService } from "./runtime-kernel-service.js";
import { assertTrustedSender, isTrustedRendererUrl } from "./security.js";
import type { AsyncSafeStorage } from "./workspace-key-custody.js";

const developmentUrl = process.env.CONSTELLATION_RENDERER_URL;
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
  decryptStringAsync: async (value) =>
    (await safeStorage.decryptStringAsync(value)).result,
};

const createDesktopRuntime = async (): Promise<DesktopRuntime> => {
  if (process.env.CONSTELLATION_DESKTOP_MODE === "preview") {
    return {
      service: createPreviewKernelService(),
      buildInfo: {
        channel: "developer-preview",
        initialWorkspaceId: PREVIEW_IDENTITY.workspaceId,
        persistence: "in-memory",
        version: DESKTOP_PREVIEW_VERSION,
      },
    };
  }
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
    if (!isTrustedRendererUrl(url, developmentUrl)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());

  if (developmentUrl !== undefined) await window.loadURL(developmentUrl);
  else await window.loadFile(rendererPath);
  return window;
};

void app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  const runtime = await createDesktopRuntime();
  ipcMain.handle(DESKTOP_CHANNELS.executeCommand, (event, command: unknown) => {
    assertTrustedSender(event, developmentUrl);
    return runtime.service.execute(command);
  });
  ipcMain.handle(DESKTOP_CHANNELS.runQuery, (event, query: unknown) => {
    assertTrustedSender(event, developmentUrl);
    return runtime.service.query(query);
  });
  ipcMain.handle(DESKTOP_CHANNELS.getBuildInfo, (event) => {
    assertTrustedSender(event, developmentUrl);
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
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  durableKernel?.close();
  durableKernel = undefined;
});
