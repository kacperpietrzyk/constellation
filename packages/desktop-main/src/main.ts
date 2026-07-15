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
import { runAlphaSmoke } from "./alpha-smoke.js";
import { createBetterSqlite3Factory } from "./better-sqlite3-factory.js";
import {
  createDurableKernelService,
  type DurableKernelService,
} from "./durable-kernel-service.js";
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
  decryptStringAsync: (value) => safeStorage.decryptStringAsync(value),
};

const createDesktopRuntime = async (): Promise<DesktopRuntime> => {
  if (process.env.CONSTELLATION_DESKTOP_MODE === "preview") {
    if (app.isPackaged) {
      throw new Error(
        "The in-memory preview is not included in local Alpha builds.",
      );
    }
    const { PREVIEW_IDENTITY, createPreviewKernelService } =
      await import("./preview-service.js");
    return {
      service: createPreviewKernelService(),
      buildInfo: {
        channel: "developer-preview",
        startupRecovery: "none",
        workspaceAvailability: "ready",
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
      startupRecovery: "none",
      workspaceAvailability: "ready",
      initialWorkspaceId: durableKernel.identity.workspaceId,
      persistence: "encrypted-local",
      version: DESKTOP_PREVIEW_VERSION,
    },
  };
};

const DETACHABLE_SURFACES = new Set([
  "cockpit",
  "work",
  "tasks",
  "projects",
  "history",
  "activity",
  "attention",
  "access",
  "documents",
  "meetings",
  "relationships",
  "settings",
]);

const createWindow = async (destination?: string): Promise<BrowserWindow> => {
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
  if (destination === undefined) mainWindow = window;
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

  if (developmentUrl !== undefined) {
    const url = new URL(developmentUrl);
    if (destination !== undefined) {
      url.searchParams.set("destination", destination);
      url.searchParams.set("detached", "1");
    }
    await window.loadURL(url.toString());
  } else
    await window.loadFile(
      rendererPath,
      destination === undefined
        ? undefined
        : { query: { destination, detached: "1" } },
    );
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
  const smokeReport = process.env.CONSTELLATION_ALPHA_SMOKE_REPORT;
  if (smokeReport !== undefined) {
    if (durableKernel === undefined) {
      throw new Error("Alpha smoke requires the durable runtime.");
    }
    runAlphaSmoke({
      facts: durableKernel.facts,
      identity: durableKernel.identity,
      reportPath: smokeReport,
      service: durableKernel.service,
    });
    app.quit();
    return;
  }
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
  ipcMain.handle(DESKTOP_CHANNELS.listWorkspaces, (event) => {
    assertTrustedSender(event, developmentUrl);
    const workspaceId = runtime.buildInfo.initialWorkspaceId;
    return workspaceId === undefined
      ? []
      : [{ workspaceId, name: "Developer preview", active: true }];
  });
  ipcMain.handle(DESKTOP_CHANNELS.createWorkspace, (event) => {
    assertTrustedSender(event, developmentUrl);
    return { outcome: "failure", code: "operation_failed" } as const;
  });
  ipcMain.handle(DESKTOP_CHANNELS.switchWorkspace, (event) => {
    assertTrustedSender(event, developmentUrl);
    return { outcome: "failure", code: "workspace_missing" } as const;
  });
  ipcMain.handle(DESKTOP_CHANNELS.getCrossWorkspaceCockpit, (event) => {
    assertTrustedSender(event, developmentUrl);
    const workspaceId = runtime.buildInfo.initialWorkspaceId;
    return workspaceId === undefined
      ? []
      : [
          {
            workspaceId,
            name: "Developer preview",
            active: true,
            availability: "ready",
            focusCount: 0,
          },
        ];
  });
  ipcMain.handle(DESKTOP_CHANNELS.importStarterWorkspace, (event) => {
    assertTrustedSender(event, developmentUrl);
    return { outcome: "failure", code: "unavailable" } as const;
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.openDetachedSurface,
    async (event, input: unknown) => {
      assertTrustedSender(event, developmentUrl);
      const surface =
        typeof input === "object" && input !== null
          ? (input as { surface?: unknown }).surface
          : undefined;
      if (typeof surface !== "string" || !DETACHABLE_SURFACES.has(surface))
        throw new Error("Unsupported detached surface.");
      await createWindow(surface);
    },
  );

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
