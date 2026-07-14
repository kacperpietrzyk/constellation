import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  App,
  BrowserWindow as BrowserWindowType,
  Dialog,
  GlobalShortcut,
  IpcMain,
  SafeStorage,
  Session,
  Shell,
} from "electron";
import {
  DESKTOP_CHANNELS,
  type DesktopBuildInfo,
} from "@constellation/desktop-preload/client";
import { EncryptedStoreCapabilityError } from "@constellation/local-store";

import { createBetterSqlite3Factory } from "./better-sqlite3-factory.js";
import { DurableWorkspaceOpenError } from "./durable-kernel-service.js";
import { DESKTOP_PREVIEW_VERSION } from "./index.js";
import type { DesktopKernelService } from "./runtime-kernel-service.js";
import { assertTrustedSender, isTrustedRendererUrl } from "./security.js";
import {
  WorkspaceKeyCustodyError,
  type AsyncSafeStorage,
} from "./workspace-key-custody.js";
import {
  createWorkspaceRecoveryService,
  type WorkspaceRecoveryService,
} from "./workspace-recovery-service.js";

// Electron's ESM namespace materializes lazy exports before the application is
// ready. On macOS that can initialize safeStorage early and block on Keychain.
// Keep the CommonJS proxy and access safeStorage only after app.whenReady().
interface ElectronRuntime {
  readonly app: App;
  readonly BrowserWindow: typeof BrowserWindowType;
  readonly dialog: Dialog;
  readonly globalShortcut: GlobalShortcut;
  readonly ipcMain: IpcMain;
  readonly safeStorage: SafeStorage;
  readonly session: { readonly defaultSession: Session };
  readonly shell: Shell;
}

const electron = createRequire(import.meta.url)("electron") as ElectronRuntime;
const { app, BrowserWindow, dialog, globalShortcut, ipcMain, session, shell } =
  electron;

const preloadPath = fileURLToPath(
  new URL("../../../desktop-preload/build/preload.cjs", import.meta.url),
);
const rendererPath = fileURLToPath(
  new URL("../../../desktop-ui/dist/index.html", import.meta.url),
);
let mainWindow: BrowserWindowType | undefined;
let workspaceRecovery: WorkspaceRecoveryService | undefined;

interface DesktopRuntime {
  readonly buildInfo: DesktopBuildInfo;
  readonly service: DesktopKernelService;
}

const electronSafeStorage: AsyncSafeStorage = {
  isAsyncEncryptionAvailable: async () =>
    process.platform === "darwin"
      ? electron.safeStorage.isEncryptionAvailable()
      : electron.safeStorage.isAsyncEncryptionAvailable(),
  encryptStringAsync: async (value) =>
    process.platform === "darwin"
      ? electron.safeStorage.encryptString(value)
      : electron.safeStorage.encryptStringAsync(value),
  decryptStringAsync: async (value) =>
    process.platform === "darwin"
      ? {
          result: electron.safeStorage.decryptString(value),
          shouldReEncrypt: false,
        }
      : electron.safeStorage.decryptStringAsync(value),
};

const createDesktopRuntime = async (): Promise<DesktopRuntime> => {
  const databaseFactory = createBetterSqlite3Factory();
  const stateRoot = app.getPath("userData");
  const smokeRootValue = process.env.CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT;
  const smokeRoot =
    smokeRootValue === undefined ? undefined : path.resolve(smokeRootValue);
  if (
    smokeRoot !== undefined &&
    !smokeRoot.startsWith(`${path.resolve(stateRoot)}${path.sep}`)
  ) {
    throw new Error("Recovery smoke path must remain inside user data.");
  }
  const smokeBackupPath =
    smokeRoot === undefined
      ? undefined
      : path.join(smokeRoot, "workspace.constellation-backup");
  if (smokeRoot !== undefined) {
    mkdirSync(smokeRoot, { recursive: true, mode: 0o700 });
  }
  const recovery = await createWorkspaceRecoveryService({
    appVersion: DESKTOP_PREVIEW_VERSION,
    databaseFactory,
    safeStorage: electronSafeStorage,
    stateRoot,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    selectExportPath: async (workspaceName) => {
      if (smokeBackupPath !== undefined) return smokeBackupPath;
      const stamp = new Date().toISOString().slice(0, 10);
      const safeName =
        workspaceName
          .normalize("NFKD")
          .replace(/[^a-zA-Z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48) || "workspace";
      const result = await dialog.showSaveDialog({
        title: "Export encrypted workspace backup",
        defaultPath: `${safeName}-${stamp}.constellation-backup`,
        filters: [
          {
            name: "Constellation workspace backup",
            extensions: ["constellation-backup"],
          },
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      });
      return result.canceled ? undefined : result.filePath;
    },
    selectBackupPath: async () => {
      if (smokeBackupPath !== undefined) return smokeBackupPath;
      const result = await dialog.showOpenDialog({
        title: "Choose a Constellation workspace backup",
        filters: [
          {
            name: "Constellation workspace backup",
            extensions: ["constellation-backup"],
          },
        ],
        properties: ["openFile"],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },
  });
  workspaceRecovery = recovery;
  return {
    service: {
      execute: (command) => recovery.kernel.service.execute(command),
      query: (query) => recovery.kernel.service.query(query),
    },
    buildInfo: {
      channel: "local-alpha",
      startupRecovery: recovery.startupRecovery,
      initialWorkspaceId: recovery.kernel.identity.workspaceId,
      persistence: "encrypted-local",
      version: DESKTOP_PREVIEW_VERSION,
    },
  };
};

const parseRestoreId = (input: unknown): string | undefined => {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).join(",") !== "restoreId"
  ) {
    return undefined;
  }
  const restoreId = (input as { restoreId?: unknown }).restoreId;
  return typeof restoreId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(restoreId)
    ? restoreId
    : undefined;
};

const createWindow = async (): Promise<BrowserWindowType> => {
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
    return {
      ...runtime.buildInfo,
      initialWorkspaceId:
        workspaceRecovery?.kernel.identity.workspaceId ??
        runtime.buildInfo.initialWorkspaceId,
    };
  });
  ipcMain.handle(DESKTOP_CHANNELS.exportWorkspaceBackup, (event) => {
    assertTrustedSender(event);
    return workspaceRecovery?.exportBackup();
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.prepareWorkspaceRestore,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input) ||
        Object.keys(input).join(",") !== "recoveryCode" ||
        typeof (input as { recoveryCode?: unknown }).recoveryCode !==
          "string" ||
        (input as { recoveryCode: string }).recoveryCode.length > 128
      ) {
        return { outcome: "failure", code: "recovery_code_invalid" };
      }
      return workspaceRecovery?.prepareRestore(
        (input as { recoveryCode: string }).recoveryCode,
      );
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.confirmWorkspaceRestore,
    (event, input: unknown) => {
      assertTrustedSender(event);
      const restoreId = parseRestoreId(input);
      return restoreId === undefined
        ? { outcome: "failure", code: "workspace_identity_invalid" }
        : workspaceRecovery?.confirmRestore(restoreId);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.cancelWorkspaceRestore,
    (event, input: unknown) => {
      assertTrustedSender(event);
      const restoreId = parseRestoreId(input);
      if (restoreId !== undefined) workspaceRecovery?.cancelRestore(restoreId);
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
  workspaceRecovery?.close();
  workspaceRecovery = undefined;
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
  workspaceRecovery?.close();
  workspaceRecovery = undefined;
});
