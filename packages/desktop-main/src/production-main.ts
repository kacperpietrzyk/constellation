import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
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
import type { DataHomeProvider } from "@constellation/application";
import {
  CredentialIdSchema,
  GrantIdSchema,
  HubEnrollmentResultSchema,
  HubWorkspaceSnapshotSchema,
  PrincipalIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  type DeviceId,
} from "@constellation/contracts";
import { EncryptedStoreCapabilityError } from "@constellation/local-store";

import { createBetterSqlite3Factory } from "./better-sqlite3-factory.js";
import { CoordinatedDataHomeProvider } from "./coordinated-data-home-provider.js";
import {
  CoordinatedSyncEngine,
  HttpHubTransport,
  coordinatedSnapshotDigest,
  createHubWorkspaceSnapshot,
  parseHubWorkspaceProjection,
} from "./coordinated-sync-engine.js";
import {
  DurableWorkspaceOpenError,
  type DurableBootstrapProjection,
} from "./durable-kernel-service.js";
import { writeHubAuthorizationFile } from "./hub-authorization-export.js";
import { loadOrCreateDeviceIdentity } from "./device-identity.js";
import {
  HubConnectionCustody,
  type HubConnection,
} from "./hub-connection-custody.js";
import { DESKTOP_PREVIEW_VERSION } from "./index.js";
import { LocalOnlyDataHomeProvider } from "./local-data-home-provider.js";
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
let dataHomeProvider: DataHomeProvider | undefined;
let coordinatedDataHomeProvider: CoordinatedDataHomeProvider | undefined;
let hubConnectionCustody: HubConnectionCustody | undefined;
let installationDeviceId: DeviceId | undefined;
let hubSyncTimer: NodeJS.Timeout | undefined;
let hubSyncFailures = 0;
const manualHubSyncForPackagedSmoke =
  process.env.CONSTELLATION_ALPHA_HUB_SMOKE_MANUAL_SYNC === "1";

const scheduleHubSync = (delay = 0): void => {
  if (manualHubSyncForPackagedSmoke) return;
  if (hubSyncTimer !== undefined) clearTimeout(hubSyncTimer);
  if (coordinatedDataHomeProvider === undefined) return;
  hubSyncTimer = setTimeout(() => {
    const provider = coordinatedDataHomeProvider;
    if (provider === undefined) return;
    void provider.syncNow().then((result) => {
      const healthy = result.state === "current" || result.state === "conflict";
      hubSyncFailures = healthy ? 0 : Math.min(hubSyncFailures + 1, 6);
      const nextDelay = healthy
        ? 30_000
        : Math.min(5_000 * 2 ** hubSyncFailures, 300_000);
      scheduleHubSync(nextDelay);
    });
  }, delay);
  hubSyncTimer.unref();
};

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
  const deviceIdentity = loadOrCreateDeviceIdentity(stateRoot);
  installationDeviceId = deviceIdentity.deviceId;
  hubConnectionCustody = new HubConnectionCustody(
    stateRoot,
    electronSafeStorage,
  );
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
  let smokeBootstrap: DurableBootstrapProjection | undefined;
  if (smokeRoot !== undefined) {
    const bootstrapPath = path.join(smokeRoot, "hub-bootstrap.json");
    try {
      const facts = lstatSync(bootstrapPath);
      if (
        !facts.isFile() ||
        facts.isSymbolicLink() ||
        facts.size > 2 * 1024 * 1024
      ) {
        throw new Error("Hub smoke bootstrap must be a bounded regular file.");
      }
      const raw = JSON.parse(readFileSync(bootstrapPath, "utf8")) as unknown;
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("Hub smoke bootstrap is invalid.");
      }
      const record = raw as Record<string, unknown>;
      if (Object.keys(record).sort().join(",") !== "identity,snapshot") {
        throw new Error("Hub smoke bootstrap is invalid.");
      }
      const identity = record.identity as Record<string, unknown>;
      if (
        typeof identity !== "object" ||
        identity === null ||
        Array.isArray(identity) ||
        Object.keys(identity).sort().join(",") !==
          "credentialId,grantId,principalId,rootSpaceId,workspaceId"
      ) {
        throw new Error("Hub smoke bootstrap identity is invalid.");
      }
      const workspaceId = WorkspaceIdSchema.parse(identity.workspaceId);
      smokeBootstrap = {
        identity: {
          workspaceId,
          rootSpaceId: SpaceIdSchema.parse(identity.rootSpaceId),
          principalId: PrincipalIdSchema.parse(identity.principalId),
          credentialId: CredentialIdSchema.parse(identity.credentialId),
          grantId: GrantIdSchema.parse(identity.grantId),
        },
        snapshot: parseHubWorkspaceProjection(
          HubWorkspaceSnapshotSchema.parse(record.snapshot),
          workspaceId,
        ),
      };
      rmSync(bootstrapPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const smokeFailpoint = process.env.CONSTELLATION_ALPHA_RECOVERY_FAILPOINT;
  if (manualHubSyncForPackagedSmoke && smokeRoot === undefined) {
    throw new Error("Manual Hub sync is restricted to packaged smoke tests.");
  }
  if (
    smokeFailpoint !== undefined &&
    (smokeRoot === undefined ||
      (smokeFailpoint !== "after-previous-retained" &&
        smokeFailpoint !== "after-candidate-activated"))
  ) {
    throw new Error(
      "Recovery failpoints are restricted to packaged smoke tests.",
    );
  }
  const recovery = await createWorkspaceRecoveryService({
    appVersion: DESKTOP_PREVIEW_VERSION,
    databaseFactory,
    safeStorage: electronSafeStorage,
    stateRoot,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ...(smokeBootstrap === undefined
      ? {}
      : { bootstrapProjection: smokeBootstrap }),
    ...(smokeFailpoint === undefined
      ? {}
      : {
          failpoint: (boundary) => {
            if (boundary !== smokeFailpoint) return;
            process.kill(process.pid, "SIGKILL");
            throw new Error("Recovery smoke failpoint did not terminate.");
          },
        }),
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
  const activateHub = (connection: HubConnection): void => {
    if (
      recovery.kernel === undefined ||
      connection.workspaceId !== recovery.kernel.identity.workspaceId ||
      connection.deviceId !== deviceIdentity.deviceId
    ) {
      throw new Error("Hub connection identity does not match this workspace.");
    }
    const snapshot = createHubWorkspaceSnapshot(
      recovery.kernel.store.snapshot(),
    );
    if (recovery.kernel.store.getCoordinationState() === undefined) {
      recovery.kernel.store.configureCoordination({
        workspaceId: connection.workspaceId,
        providerInstanceId: connection.providerInstanceId,
        hubOrigin: connection.origin,
        checkpoint: "0",
        snapshotDigest: coordinatedSnapshotDigest(snapshot),
        configuredAt: new Date().toISOString(),
      });
    }
    const sync = new CoordinatedSyncEngine({
      workspaceId: connection.workspaceId,
      deviceId: connection.deviceId,
      credential: connection.deviceCredential,
      store: recovery.kernel.store,
      transport: new HttpHubTransport(connection.origin),
    });
    coordinatedDataHomeProvider = new CoordinatedDataHomeProvider({
      workspaceId: connection.workspaceId,
      deviceId: connection.deviceId,
      providerInstanceId: connection.providerInstanceId,
      displayName: `Self-hosted Hub · ${new URL(connection.origin).host}`,
      store: recovery.kernel.store,
      recovery,
      sync,
    });
    dataHomeProvider = coordinatedDataHomeProvider;
    scheduleHubSync(0);
  };
  let existingHubConnection = await hubConnectionCustody.load();
  const smokeHubRegistration =
    process.env.CONSTELLATION_ALPHA_HUB_SMOKE_REGISTER;
  if (smokeHubRegistration !== undefined) {
    if (
      smokeRoot === undefined ||
      recovery.kernel === undefined ||
      existingHubConnection !== undefined
    ) {
      throw new Error(
        "Hub smoke registration is restricted to a fresh packaged smoke profile.",
      );
    }
    const registrationUrl = new URL(smokeHubRegistration);
    if (
      registrationUrl.protocol !== "http:" ||
      !["127.0.0.1", "::1", "localhost"].includes(registrationUrl.hostname)
    ) {
      throw new Error("Hub smoke registration must use loopback HTTP.");
    }
    const response = await fetch(registrationUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: recovery.kernel.identity.workspaceId,
        deviceId: deviceIdentity.deviceId,
        context: recovery.kernel.context,
        snapshot: createHubWorkspaceSnapshot(recovery.kernel.store.snapshot()),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = (await response.json()) as Record<string, unknown>;
    if (
      !response.ok ||
      raw.workspaceId !== recovery.kernel.identity.workspaceId ||
      raw.deviceId !== deviceIdentity.deviceId ||
      typeof raw.origin !== "string" ||
      typeof raw.deviceCredential !== "string" ||
      raw.deviceCredential.length < 32 ||
      typeof raw.providerInstanceId !== "string"
    ) {
      throw new Error("Hub smoke registration returned an invalid connection.");
    }
    existingHubConnection = {
      workspaceId: recovery.kernel.identity.workspaceId,
      deviceId: deviceIdentity.deviceId,
      origin: new URL(raw.origin).origin,
      deviceCredential: raw.deviceCredential,
      providerInstanceId: raw.providerInstanceId,
    };
    await hubConnectionCustody.create(existingHubConnection);
  }
  if (existingHubConnection === undefined) {
    dataHomeProvider = new LocalOnlyDataHomeProvider(
      recovery,
      deviceIdentity.deviceId,
    );
  } else if (recovery.kernel !== undefined) {
    activateHub(existingHubConnection);
  } else {
    // A stale coordinated credential must never hide the restore surface when
    // the encrypted local projection cannot be opened.
    dataHomeProvider = new LocalOnlyDataHomeProvider(
      recovery,
      deviceIdentity.deviceId,
    );
  }
  return {
    service: {
      execute: (command) => {
        if (recovery.kernel === undefined)
          throw new Error("Workspace recovery is required.");
        return recovery.kernel.service.execute(command);
      },
      query: (query) => {
        if (recovery.kernel === undefined)
          throw new Error("Workspace recovery is required.");
        return recovery.kernel.service.query(query);
      },
    },
    buildInfo: {
      channel: "local-alpha",
      startupRecovery: recovery.startupRecovery,
      workspaceAvailability:
        recovery.kernel === undefined ? "recovery_required" : "ready",
      ...(recovery.kernel === undefined
        ? {
            recoveryReason:
              recovery.recoveryReason === "none"
                ? ("workspace_unavailable" as const)
                : recovery.recoveryReason,
          }
        : { initialWorkspaceId: recovery.kernel.identity.workspaceId }),
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
    const result = runtime.service.execute(command);
    if (
      result.kind === "command_outcome" &&
      result.outcome.outcome === "success" &&
      coordinatedDataHomeProvider !== undefined
    ) {
      scheduleHubSync(0);
    }
    return result;
  });
  ipcMain.handle(DESKTOP_CHANNELS.runQuery, (event, query: unknown) => {
    assertTrustedSender(event);
    return runtime.service.query(query);
  });
  ipcMain.handle(DESKTOP_CHANNELS.getBuildInfo, (event) => {
    assertTrustedSender(event);
    return {
      ...runtime.buildInfo,
      workspaceAvailability:
        workspaceRecovery?.kernel === undefined ? "recovery_required" : "ready",
      ...(workspaceRecovery?.kernel === undefined
        ? { recoveryReason: workspaceRecovery?.recoveryReason }
        : {
            initialWorkspaceId: workspaceRecovery.kernel.identity.workspaceId,
            recoveryReason: undefined,
          }),
    };
  });
  ipcMain.handle(DESKTOP_CHANNELS.getDataHomeStatus, (event) => {
    assertTrustedSender(event);
    if (dataHomeProvider === undefined) {
      throw new Error("Data Home provider is unavailable.");
    }
    return dataHomeProvider.getStatus();
  });
  ipcMain.handle(DESKTOP_CHANNELS.syncDataHome, async (event) => {
    assertTrustedSender(event);
    if (coordinatedDataHomeProvider !== undefined) {
      await coordinatedDataHomeProvider.syncNow();
      scheduleHubSync(30_000);
    }
    if (dataHomeProvider === undefined) {
      throw new Error("Data Home provider is unavailable.");
    }
    return dataHomeProvider.getStatus();
  });
  ipcMain.handle(DESKTOP_CHANNELS.enrollHub, async (event, raw: unknown) => {
    assertTrustedSender(event);
    if (
      typeof raw !== "object" ||
      raw === null ||
      Array.isArray(raw) ||
      Object.keys(raw).sort().join(",") !==
        "deviceLabel,enrollmentSecret,hubOrigin"
    ) {
      return { outcome: "rejected", code: "input_invalid" };
    }
    const input = raw as Record<string, unknown>;
    if (
      typeof input.hubOrigin !== "string" ||
      typeof input.enrollmentSecret !== "string" ||
      typeof input.deviceLabel !== "string" ||
      input.enrollmentSecret.length < 32 ||
      input.enrollmentSecret.length > 256 ||
      input.deviceLabel.trim().length < 1 ||
      input.deviceLabel.trim().length > 80
    ) {
      return { outcome: "rejected", code: "input_invalid" };
    }
    if (
      workspaceRecovery?.kernel === undefined ||
      installationDeviceId === undefined ||
      hubConnectionCustody === undefined
    ) {
      return { outcome: "rejected", code: "workspace_unavailable" };
    }
    if (hubConnectionCustody.exists()) {
      return { outcome: "rejected", code: "input_invalid" };
    }
    let origin: string;
    try {
      const transport = new HttpHubTransport(input.hubOrigin);
      void transport;
      origin = new URL(input.hubOrigin).origin;
    } catch {
      return { outcome: "rejected", code: "input_invalid" };
    }
    let enrollment;
    try {
      const response = await fetch(`${origin}/v1/enroll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          protocolVersion: 1,
          workspaceId: workspaceRecovery.kernel.identity.workspaceId,
          deviceId: installationDeviceId,
          enrollmentSecret: input.enrollmentSecret,
          deviceLabel: input.deviceLabel.trim(),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Hub enrollment request failed.");
      enrollment = HubEnrollmentResultSchema.parse(await response.json());
    } catch {
      return { outcome: "rejected", code: "hub_unreachable" };
    }
    if (enrollment.outcome === "rejected") return enrollment;
    const providerInstanceId = `constellation.hub:${createHash("sha256")
      .update(origin)
      .digest("hex")
      .slice(0, 24)}`;
    const connection: HubConnection = {
      workspaceId: enrollment.workspaceId,
      deviceId: enrollment.deviceId,
      origin,
      deviceCredential: enrollment.deviceCredential,
      providerInstanceId,
    };
    const abandonEnrollment = async (): Promise<void> => {
      await fetch(`${origin}/v1/leave-device`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${enrollment.deviceCredential}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: enrollment.workspaceId,
          deviceId: enrollment.deviceId,
        }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
    };
    const snapshot = createHubWorkspaceSnapshot(
      workspaceRecovery.kernel.store.snapshot(),
    );
    const digest = coordinatedSnapshotDigest(snapshot);
    try {
      const bootstrapResponse = await fetch(`${origin}/v1/bootstrap-snapshot`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${enrollment.deviceCredential}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          protocolVersion: 1,
          workspaceId: enrollment.workspaceId,
          deviceId: enrollment.deviceId,
          digest,
          snapshot,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const bootstrap = (await bootstrapResponse.json()) as {
        outcome?: unknown;
      };
      if (!bootstrapResponse.ok || bootstrap.outcome !== "success") {
        await abandonEnrollment();
        return { outcome: "rejected", code: "hub_unreachable" };
      }
    } catch {
      await abandonEnrollment();
      return { outcome: "rejected", code: "hub_unreachable" };
    }
    try {
      await hubConnectionCustody.create(connection);
    } catch {
      await abandonEnrollment();
      return { outcome: "rejected", code: "credential_storage_failed" };
    }
    try {
      workspaceRecovery.kernel.store.configureCoordination({
        workspaceId: enrollment.workspaceId,
        providerInstanceId,
        hubOrigin: origin,
        checkpoint: "0",
        snapshotDigest: digest,
        configuredAt: new Date().toISOString(),
      });
      const sync = new CoordinatedSyncEngine({
        workspaceId: enrollment.workspaceId,
        deviceId: enrollment.deviceId,
        credential: enrollment.deviceCredential,
        store: workspaceRecovery.kernel.store,
        transport: new HttpHubTransport(origin),
      });
      coordinatedDataHomeProvider = new CoordinatedDataHomeProvider({
        workspaceId: enrollment.workspaceId,
        deviceId: enrollment.deviceId,
        providerInstanceId,
        displayName: `Self-hosted Hub · ${new URL(origin).host}`,
        store: workspaceRecovery.kernel.store,
        recovery: workspaceRecovery,
        sync,
      });
      dataHomeProvider = coordinatedDataHomeProvider;
      await coordinatedDataHomeProvider.syncNow();
      return {
        outcome: "success",
        status: await coordinatedDataHomeProvider.getStatus(),
      };
    } catch {
      // Credential custody and the local migration marker are durable. A
      // restart can resume safely; do not orphan or revoke this device.
      return { outcome: "rejected", code: "hub_unreachable" };
    }
  });
  ipcMain.handle(DESKTOP_CHANNELS.exportWorkspaceBackup, (event) => {
    assertTrustedSender(event);
    return (
      dataHomeProvider?.exportPortableCheckpoint() ??
      Promise.resolve({ outcome: "failure", code: "io_failed" as const })
    );
  });
  ipcMain.handle(DESKTOP_CHANNELS.exportHubAuthorization, async (event) => {
    assertTrustedSender(event);
    if (workspaceRecovery?.kernel === undefined) return { outcome: "failure" };
    const result = await dialog.showSaveDialog({
      title: "Export Hub authorization",
      defaultPath: "constellation-hub-authorization.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (result.canceled || result.filePath === undefined) {
      return { outcome: "cancelled" };
    }
    try {
      writeHubAuthorizationFile(
        result.filePath,
        workspaceRecovery.kernel.context,
      );
      return { outcome: "success", fileLabel: path.basename(result.filePath) };
    } catch {
      return { outcome: "failure" };
    }
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
      return (
        dataHomeProvider?.prepareProviderMigration(
          (input as { recoveryCode: string }).recoveryCode,
        ) ?? Promise.resolve({ outcome: "failure", code: "io_failed" as const })
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
        : (dataHomeProvider?.confirmProviderMigration(restoreId) ?? {
            outcome: "failure",
            code: "io_failed",
          });
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.cancelWorkspaceRestore,
    (event, input: unknown) => {
      assertTrustedSender(event);
      const restoreId = parseRestoreId(input);
      if (restoreId !== undefined)
        dataHomeProvider?.cancelProviderMigration(restoreId);
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
  dataHomeProvider = undefined;
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
  if (hubSyncTimer !== undefined) clearTimeout(hubSyncTimer);
  hubSyncTimer = undefined;
  globalShortcut.unregisterAll();
  workspaceRecovery?.close();
  workspaceRecovery = undefined;
  dataHomeProvider = undefined;
});
