import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  App,
  BrowserWindow as BrowserWindowType,
  Clipboard,
  Dialog,
  GlobalShortcut,
  IpcMain,
  Notification as NotificationType,
  SafeStorage,
  Session,
  Shell,
} from "electron";
import {
  DESKTOP_CHANNELS,
  type DesktopBuildInfo,
  type DesktopWorkspaceCockpitEntry,
} from "@constellation/desktop-preload/client";
import { desktopSurfaceIds } from "@constellation/desktop-preload/surface-registry";
import {
  canEditSpace,
  isApplicationWave2ReadView,
  normalizeJamieApiMeeting,
  type DataHomeProvider,
} from "@constellation/application";
import {
  CredentialIdSchema,
  DocumentIdSchema,
  GrantIdSchema,
  HubEnrollmentResultSchema,
  HubWorkspaceSnapshotSchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  SpaceIdSchema,
  WorkspaceIdSchema,
  CommandEnvelopeSchema,
  QueryEnvelopeSchema,
  RemoteMcpGrantChangeRequestSchema,
  RemoteMcpGrantCreateRequestSchema,
  RemoteMcpGrantListRequestSchema,
  RemoteMcpGrantProjectionSchema,
  type DeviceId,
  type CaptureId,
  CalendarBlockDraftSchema,
  CaptureIdSchema,
  CaptureOriginalSchema,
  isCustodiedCaptureOriginal,
  MeetingWorkItemResponsibilityOverrideSchema,
  MeetingWorkItemSchema,
  type ImportedMeeting,
} from "@constellation/contracts";
import { EncryptedStoreCapabilityError } from "@constellation/local-store";
import { RemoteMcpCredentialSchema } from "@constellation/mcp/protocol";

import { createBetterSqlite3Factory } from "./better-sqlite3-factory.js";
import { AttentionNotificationCoordinator } from "./attention-notification.js";
import {
  CapturePayloadCustody,
  MAX_CAPTURE_PAYLOAD_BYTES,
} from "./capture-payload-custody.js";
import { createDesktopMeetingLoopRuntime } from "./calendar-meeting-loop.js";
import { JamieApiClient, JamieConnectionCustody } from "./jamie-integration.js";
import { CoordinatedDataHomeProvider } from "./coordinated-data-home-provider.js";
import { buildExchangeManifest } from "./starter-workspace-export.js";
import {
  DocumentCollaborationBridge,
  createAgentDocumentTextPort,
} from "./document-collaboration.js";
import {
  CoordinatedSyncEngine,
  HttpHubTransport,
  coordinatedSnapshotDigest,
  createHubWorkspaceSnapshot,
  parseHubWorkspaceProjection,
} from "./coordinated-sync-engine.js";
import {
  DurableWorkspaceOpenError,
  createDurableKernelService,
  type DurableBootstrapProjection,
} from "./durable-kernel-service.js";
import { writeHubAuthorizationFile } from "./hub-authorization-export.js";
import { loadOrCreateDeviceIdentity } from "./device-identity.js";
import {
  HubConnectionCustody,
  type HubConnection,
} from "./hub-connection-custody.js";
import { LocalOnlyDataHomeProvider } from "./local-data-home-provider.js";
import { LocalMcpRuntime } from "./local-mcp-runtime.js";
import { createRuntimeKernelService } from "./runtime-kernel-service.js";
import type { PreparedLocalMcpCredential } from "./local-mcp-credential-custody.js";
import { RemoteMcpCredentialCustody } from "./remote-mcp-credential-custody.js";
import type { DesktopKernelService } from "./runtime-kernel-service.js";
import { assertTrustedSender, isTrustedRendererUrl } from "./security.js";
import {
  allowsAudioMediaCheck,
  allowsAudioMediaRequest,
} from "./media-permission.js";
import {
  WorkspaceKeyCustodyError,
  type AsyncSafeStorage,
} from "./workspace-key-custody.js";
import {
  createWorkspaceRecoveryService,
  type WorkspaceRecoveryService,
} from "./workspace-recovery-service.js";
import {
  ensureRegisteredWorkspace,
  loadWorkspaceRegistry,
  renameRegisteredWorkspace,
  resolveWorkspaceStateRoot,
  setActiveRegisteredWorkspace,
} from "./workspace-registry.js";
import {
  importStarterWorkspace,
  manifestStatusErrors,
  parseTasksCsv,
  parseStarterWorkspaceManifest,
  previewStarterWorkspace,
  type StarterWorkspaceManifest,
} from "./starter-workspace-import.js";
import {
  DesktopReleaseService,
  type DesktopUpdaterAdapter,
} from "./release-service.js";
import {
  createPrivacySafeSupportReport,
  writePrivacySafeSupportReport,
} from "./support-report.js";
import { copyRecoveryCodeToClipboard } from "./recovery-code-clipboard.js";

// Electron's ESM namespace materializes lazy exports before the application is
// ready. On macOS that can initialize safeStorage early and block on Keychain.
// Keep the CommonJS proxy and access safeStorage only after app.whenReady().
interface ElectronRuntime {
  readonly app: App;
  readonly BrowserWindow: typeof BrowserWindowType;
  readonly clipboard: Clipboard;
  readonly dialog: Dialog;
  readonly globalShortcut: GlobalShortcut;
  readonly ipcMain: IpcMain;
  readonly Notification: typeof NotificationType;
  readonly safeStorage: SafeStorage;
  readonly session: { readonly defaultSession: Session };
  readonly shell: Shell;
}

interface ElectronUpdaterRuntime {
  readonly autoUpdater: {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    checkForUpdates(): ReturnType<DesktopUpdaterAdapter["checkForUpdates"]>;
    downloadUpdate(): ReturnType<DesktopUpdaterAdapter["downloadUpdate"]>;
    quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
  };
}

const electron = createRequire(import.meta.url)("electron") as ElectronRuntime;
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  session,
  shell,
} = electron;

const preloadPath = fileURLToPath(
  new URL("../../../desktop-preload/build/preload.cjs", import.meta.url),
);
const rendererPath = fileURLToPath(
  new URL("../../../desktop-ui/dist/index.html", import.meta.url),
);
const packagedRendererUrl = pathToFileURL(rendererPath).toString();
const isTrustedMediaUrl = (url: string): boolean =>
  url === "file://" ||
  url === "file:///" ||
  url === packagedRendererUrl ||
  url.startsWith(`${packagedRendererUrl}?`);
let mainWindow: BrowserWindowType | undefined;
let workspaceRecovery: WorkspaceRecoveryService | undefined;
let dataHomeProvider: DataHomeProvider | undefined;
let coordinatedDataHomeProvider: CoordinatedDataHomeProvider | undefined;
let hubConnectionCustody: HubConnectionCustody | undefined;
let installationDeviceId: DeviceId | undefined;
let activeHubConnection: HubConnection | undefined;
let hubSyncTimer: NodeJS.Timeout | undefined;
let hubSyncFailures = 0;
let localMcpRuntime: LocalMcpRuntime | undefined;
const manualHubSyncForPackagedSmoke =
  process.env.CONSTELLATION_ALPHA_HUB_SMOKE_MANUAL_SYNC === "1";

const loadReleaseService = (): DesktopReleaseService => {
  const currentVersion = app.getVersion();
  if (!app.isPackaged) {
    return new DesktopReleaseService(
      currentVersion,
      undefined,
      "developer_preview",
    );
  }
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return new DesktopReleaseService(
      currentVersion,
      undefined,
      "platform_unsupported",
    );
  }
  let config: unknown;
  try {
    config = JSON.parse(
      readFileSync(
        path.join(process.resourcesPath, "release-config.json"),
        "utf8",
      ),
    );
  } catch {
    return new DesktopReleaseService(
      currentVersion,
      undefined,
      "mechanism_only_build",
    );
  }
  if (
    config === null ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).sort().join(",") !== "releaseOrigin,tier" ||
    (config as Record<string, unknown>).tier !== "production-signed" ||
    typeof (config as Record<string, unknown>).releaseOrigin !== "string"
  ) {
    return new DesktopReleaseService(
      currentVersion,
      undefined,
      "mechanism_only_build",
    );
  }
  try {
    const origin = new URL(
      (config as { readonly releaseOrigin: string }).releaseOrigin,
    );
    if (
      origin.protocol !== "https:" ||
      origin.username !== "" ||
      origin.password !== "" ||
      origin.search !== "" ||
      origin.hash !== ""
    ) {
      throw new Error("release origin");
    }
  } catch {
    return new DesktopReleaseService(
      currentVersion,
      undefined,
      "release_origin_missing",
    );
  }
  const updater = (
    createRequire(import.meta.url)("electron-updater") as ElectronUpdaterRuntime
  ).autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  return new DesktopReleaseService(currentVersion, updater);
};

const attentionNotifications = new AttentionNotificationCoordinator({
  show: ({ title, body, onActivate }) => {
    if (!electron.Notification.isSupported()) return;
    const notification = new electron.Notification({
      title,
      body,
      silent: true,
    });
    notification.once("click", onActivate);
    notification.show();
  },
});

const deliverUrgentAttention = (service: DesktopKernelService): void => {
  const workspaceId = workspaceRecovery?.kernel?.identity.workspaceId;
  if (workspaceId === undefined) return;
  const response = service.query({
    contractVersion: 1,
    queryName: "attention.inbox",
    queryId: randomUUID(),
    workspaceId,
    consistency: "local_projection",
    parameters: { limit: 100 },
  });
  if (
    response.kind !== "query_result" ||
    response.result.outcome !== "success" ||
    response.result.projection.kind !== "attention.inbox"
  )
    return;
  attentionNotifications.deliver({
    items: response.result.projection.items,
    appIsFocused: mainWindow?.isFocused() ?? false,
    onActivate: (destination) => {
      const window = mainWindow;
      if (window === undefined || window.isDestroyed()) return;
      window.show();
      window.focus();
      window.webContents.send(DESKTOP_CHANNELS.attentionActivated, destination);
    },
  });
};

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
      if (workspaceRecovery?.kernel !== undefined) {
        deliverUrgentAttention(workspaceRecovery.kernel.service);
      }
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

const desktopBaseRoot = (): string => {
  const override = process.env.CONSTELLATION_ALPHA_STATE_ROOT;
  if (override === undefined) return app.getPath("userData");
  if (
    !path.isAbsolute(override) ||
    process.env.CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT === undefined
  ) {
    throw new Error(
      "The Alpha state override is restricted to packaged smoke.",
    );
  }
  return path.resolve(override);
};

const desktopStateRoot = (baseRoot = desktopBaseRoot()): string => {
  const registry = loadWorkspaceRegistry(baseRoot);
  if (registry === undefined) return baseRoot;
  const active = registry.workspaces.find(
    (workspace) => workspace.workspaceId === registry.activeWorkspaceId,
  );
  if (active === undefined)
    throw new Error("WORKSPACE_REGISTRY_ACTIVE_MISSING");
  return resolveWorkspaceStateRoot(baseRoot, active);
};

const createDesktopRuntime = async (): Promise<DesktopRuntime> => {
  const databaseFactory = createBetterSqlite3Factory();
  const baseRoot = desktopBaseRoot();
  const stateRoot = desktopStateRoot(baseRoot);
  const deviceIdentity = loadOrCreateDeviceIdentity(baseRoot);
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
    throw new Error(
      "Recovery smoke path must remain inside application state.",
    );
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
    appVersion: app.getVersion(),
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
  if (recovery.kernel !== undefined) {
    ensureRegisteredWorkspace(baseRoot, {
      workspaceId: recovery.kernel.identity.workspaceId,
      name: recovery.kernel.workspaceName,
      relativeStateRoot:
        path.resolve(stateRoot) === path.resolve(baseRoot)
          ? "."
          : path.relative(baseRoot, stateRoot),
    });
  }
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
    activeHubConnection = connection;
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
      executeBatch: (batch) => {
        if (recovery.kernel === undefined)
          throw new Error("Workspace recovery is required.");
        return recovery.kernel.service.executeBatch(batch);
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
      version: app.getVersion(),
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

const DETACHABLE_SURFACES = new Set<string>(desktopSurfaceIds);

const createWindow = async (
  destination?: string,
): Promise<BrowserWindowType> => {
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
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  await window.loadFile(
    rendererPath,
    destination === undefined
      ? undefined
      : { query: { destination, detached: "1" } },
  );
  return window;
};

const startProductionDesktop = async (): Promise<void> => {
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) =>
      allowsAudioMediaCheck(
        {
          permission,
          requestingOrigin,
          ...(webContents === null
            ? {}
            : { webContentsUrl: webContents.getURL() }),
          details,
        },
        isTrustedMediaUrl,
      ),
  );
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      callback(
        "mediaTypes" in details &&
          allowsAudioMediaRequest(
            {
              permission,
              webContentsUrl: webContents.getURL(),
              details,
            },
            isTrustedMediaUrl,
          ),
      );
    },
  );

  const stateRoot = desktopStateRoot();
  const baseRoot = desktopBaseRoot();
  const runtime = await createDesktopRuntime();
  const relaunchIntoSelectedWorkspace = (): void => {
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 150);
  };
  ipcMain.handle(DESKTOP_CHANNELS.listWorkspaces, (event) => {
    assertTrustedSender(event);
    const registry = loadWorkspaceRegistry(baseRoot);
    return (
      registry?.workspaces.map((workspace) => ({
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        active: workspace.workspaceId === registry.activeWorkspaceId,
      })) ?? []
    );
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.createWorkspace,
    async (event, input: unknown) => {
      assertTrustedSender(event);
      if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input) ||
        Object.keys(input).join(",") !== "name" ||
        typeof (input as { name?: unknown }).name !== "string"
      )
        return { outcome: "failure", code: "invalid_name" } as const;
      const name = (input as { name: string }).name.trim();
      if (name.length === 0 || name.length > 80)
        return { outcome: "failure", code: "invalid_name" } as const;
      const directoryId = randomUUID();
      const relativeStateRoot = `workspaces/${directoryId}`;
      const nextStateRoot = path.join(baseRoot, relativeStateRoot);
      try {
        const created = await createDurableKernelService({
          databaseFactory: createBetterSqlite3Factory(),
          safeStorage: electronSafeStorage,
          stateRoot: nextStateRoot,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          workspaceName: name,
        });
        const workspaceId = created.identity.workspaceId;
        created.close();
        ensureRegisteredWorkspace(baseRoot, {
          workspaceId,
          name,
          relativeStateRoot,
        });
        relaunchIntoSelectedWorkspace();
        return { outcome: "success" } as const;
      } catch {
        rmSync(nextStateRoot, { recursive: true, force: true });
        return { outcome: "failure", code: "operation_failed" } as const;
      }
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.switchWorkspace, (event, input: unknown) => {
    assertTrustedSender(event);
    if (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input) ||
      Object.keys(input).join(",") !== "workspaceId"
    )
      return { outcome: "failure", code: "workspace_missing" } as const;
    const parsed = WorkspaceIdSchema.safeParse(
      (input as { workspaceId?: unknown }).workspaceId,
    );
    if (!parsed.success)
      return { outcome: "failure", code: "workspace_missing" } as const;
    try {
      setActiveRegisteredWorkspace(baseRoot, parsed.data);
      relaunchIntoSelectedWorkspace();
      return { outcome: "success" } as const;
    } catch {
      return { outcome: "failure", code: "workspace_missing" } as const;
    }
  });
  ipcMain.handle(DESKTOP_CHANNELS.getCrossWorkspaceCockpit, async (event) => {
    assertTrustedSender(event);
    const registry = loadWorkspaceRegistry(baseRoot);
    if (registry === undefined) return [];
    const now = new Date();
    const day = now.getDay() || 7;
    now.setDate(now.getDate() - day + 1);
    const weekStart = now.toISOString().slice(0, 10);
    const result: DesktopWorkspaceCockpitEntry[] = [];
    for (const entry of registry.workspaces) {
      const active = entry.workspaceId === registry.activeWorkspaceId;
      let kernel = active ? workspaceRecovery?.kernel : undefined;
      let close = false;
      try {
        if (kernel === undefined) {
          const entryRoot = resolveWorkspaceStateRoot(baseRoot, entry);
          if (!existsSync(path.join(entryRoot, "active", "workspace.db")))
            throw new Error("WORKSPACE_NOT_AVAILABLE");
          kernel = await createDurableKernelService({
            databaseFactory: createBetterSqlite3Factory(),
            safeStorage: electronSafeStorage,
            stateRoot: entryRoot,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          });
          close = true;
        }
        const query = kernel.service.query(
          QueryEnvelopeSchema.parse({
            contractVersion: 1,
            queryName: "cockpit.week",
            queryId: randomUUID(),
            workspaceId: kernel.identity.workspaceId,
            consistency: "local_projection",
            parameters: {
              spaceId: kernel.identity.rootSpaceId,
              weekStart,
              limit: 10,
            },
          }),
        );
        if (
          query.kind !== "query_result" ||
          query.result.outcome !== "success" ||
          query.result.projection.kind !== "cockpit.week"
        )
          throw new Error("WORKSPACE_COCKPIT_UNAVAILABLE");
        result.push({
          workspaceId: entry.workspaceId,
          name: entry.name,
          active,
          availability: "ready" as const,
          focusCount: query.result.projection.focus.length,
          ...(query.result.projection.focus[0] === undefined
            ? {}
            : { firstFocus: query.result.projection.focus[0].title }),
        });
      } catch {
        result.push({
          workspaceId: entry.workspaceId,
          name: entry.name,
          active,
          availability: "unavailable" as const,
        });
      } finally {
        if (close) kernel?.close();
      }
    }
    return result;
  });
  const parseStarterWorkspaceInput = (
    input: unknown,
  ):
    | { readonly manifest: StarterWorkspaceManifest }
    | { readonly errors: readonly string[] }
    | undefined => {
    try {
      if (
        typeof input === "object" &&
        input !== null &&
        !Array.isArray(input) &&
        (input as Record<string, unknown>).format === "tasks_csv" &&
        typeof (input as Record<string, unknown>).text === "string"
      ) {
        const parsed = parseTasksCsv(
          (input as Record<string, unknown>).text as string,
        );
        return parsed.outcome === "success"
          ? { manifest: parsed.manifest }
          : { errors: parsed.errors };
      }
      if (Buffer.byteLength(JSON.stringify(input), "utf8") > 256 * 1024)
        return undefined;
      const manifest = parseStarterWorkspaceManifest(input);
      return manifest === undefined ? undefined : { manifest };
    } catch {
      return undefined;
    }
  };
  const workspaceStatusLabels = (): readonly string[] => {
    const kernel = workspaceRecovery?.kernel;
    return kernel === undefined
      ? []
      : kernel.store.read((view) =>
          view
            .listTaskStatuses(kernel.identity.workspaceId)
            .map((status) => status.label),
        );
  };
  ipcMain.handle(
    DESKTOP_CHANNELS.previewStarterWorkspace,
    (event, input: unknown) => {
      assertTrustedSender(event);
      const parsed = parseStarterWorkspaceInput(input);
      if (parsed === undefined)
        return { outcome: "failure", code: "manifest_invalid" } as const;
      if ("errors" in parsed)
        return {
          outcome: "failure",
          code: "manifest_invalid",
          errors: parsed.errors,
        } as const;
      const statusErrors =
        workspaceRecovery?.kernel === undefined
          ? []
          : manifestStatusErrors(parsed.manifest, workspaceStatusLabels());
      if (statusErrors.length > 0)
        return {
          outcome: "failure",
          code: "manifest_invalid",
          errors: statusErrors,
        } as const;
      return {
        outcome: "success",
        counts: previewStarterWorkspace(parsed.manifest),
      } as const;
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.importStarterWorkspace,
    (event, input: unknown) => {
      assertTrustedSender(event);
      const parsed = parseStarterWorkspaceInput(input);
      if (parsed === undefined || "errors" in parsed)
        return {
          outcome: "failure",
          code: "manifest_invalid",
          ...(parsed !== undefined && "errors" in parsed
            ? { errors: parsed.errors }
            : {}),
        } as const;
      const kernel = workspaceRecovery?.kernel;
      if (kernel === undefined || installationDeviceId === undefined)
        return { outcome: "failure", code: "unavailable" } as const;
      try {
        const statuses = kernel.store.read((view) =>
          view.listTaskStatuses(kernel.identity.workspaceId),
        );
        const workspaceRecord = kernel.store.read((view) =>
          view.getWorkspace(kernel.identity.workspaceId),
        );
        const counts = importStarterWorkspace({
          service: runtime.service,
          workspaceId: kernel.identity.workspaceId,
          spaceId: kernel.identity.rootSpaceId,
          deviceId: installationDeviceId,
          manifest: parsed.manifest,
          resolveStatusId: (label) =>
            statuses.find(
              (status) =>
                status.label.toLocaleLowerCase("pl-PL") ===
                label.toLocaleLowerCase("pl-PL"),
            )?.id,
          existingStatusLabels: statuses.map((status) => status.label),
          ...(installationDeviceId === undefined
            ? {}
            : (() => {
                const deviceId = installationDeviceId;
                const documentPort = createAgentDocumentTextPort({
                  workspaceId: kernel.identity.workspaceId,
                  store: kernel.store,
                  connection: () => activeHubConnection,
                });
                return {
                  writeDocumentText: ({ documentId, spaceId, text }) => {
                    documentPort.replace({
                      documentId: DocumentIdSchema.parse(documentId),
                      spaceId,
                      text,
                      // An import is the person's act, not an agent run.
                      principalId: kernel.context.principalId,
                      deviceId,
                    });
                  },
                  writeDocumentContent: ({
                    documentId,
                    spaceId,
                    text,
                    content,
                  }) => {
                    const imported = documentPort.importStructured({
                      documentId: DocumentIdSchema.parse(documentId),
                      spaceId,
                      text,
                      content,
                      principalId: kernel.context.principalId,
                      deviceId,
                    });
                    if (imported === undefined)
                      throw new Error("DOCUMENT_STRUCTURED_IMPORT_FAILED");
                  },
                  writeProjectContent: ({ projectId, spaceId, content }) => {
                    const imported = documentPort.importStructured({
                      owner: {
                        kind: "project",
                        projectId: ProjectIdSchema.parse(projectId),
                      },
                      spaceId,
                      text: "",
                      content,
                      principalId: kernel.context.principalId,
                      deviceId,
                    });
                    if (imported === undefined)
                      throw new Error("PROJECT_STRUCTURED_IMPORT_FAILED");
                  },
                };
              })()),
          ...(workspaceRecord === undefined
            ? {}
            : { defaultTaskStatusId: workspaceRecord.defaultTaskStatusId }),
        });
        if (coordinatedDataHomeProvider !== undefined) scheduleHubSync(0);
        deliverUrgentAttention(runtime.service);
        return { outcome: "success", counts } as const;
      } catch {
        return { outcome: "failure", code: "import_failed" } as const;
      }
    },
  );
  const releaseService = loadReleaseService();
  const calendarHelperCandidate =
    process.env.CONSTELLATION_CALENDAR_HELPER_PATH ??
    path.join(process.resourcesPath, "constellation-calendar-helper");
  const meetingLoop =
    workspaceRecovery?.kernel === undefined
      ? undefined
      : createDesktopMeetingLoopRuntime({
          context: workspaceRecovery.kernel.context,
          store: workspaceRecovery.kernel.store,
          ...(existsSync(calendarHelperCandidate)
            ? { helperPath: calendarHelperCandidate }
            : {}),
        });
  const publishMeetingToCommandFeed = (meeting: ImportedMeeting): void => {
    const store = workspaceRecovery?.kernel?.store;
    if (store === undefined)
      throw new Error("Meeting projection is unavailable.");
    const current = store
      .snapshot()
      .strategicRecords?.find((record) => record.id === meeting.id);
    if (
      current?.kind === "meeting" &&
      current.meeting.version >= meeting.version
    )
      return;
    const result = runtime.service.execute(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: "meeting.upsertImported",
        commandId: randomUUID(),
        workspaceId: meeting.workspaceId,
        idempotencyKey: `meeting:${meeting.id}:v${meeting.version}`,
        expectedVersions:
          current === undefined ? {} : { [current.id]: current.version },
        correlationId: randomUUID(),
        payload: { meeting },
      }),
    );
    if (
      result.kind !== "command_outcome" ||
      result.outcome.outcome !== "success"
    ) {
      throw new Error("Meeting change could not enter the coordinated feed.");
    }
  };
  /**
   * ADR-047: work-item corrections run through the kernel, not the device
   * meeting-loop table. A remote operator reaches the Hub, where that table
   * does not exist, so the kernel owns the write and the desktop delegates —
   * leaving both writers alive would give one meeting two concurrency models.
   */
  const executeMeetingWorkItemCommand = (
    meetingId: string,
    build: (input: {
      readonly meetingId: string;
      readonly workspaceId: string;
      readonly recordVersion: number;
    }) => { readonly commandName: string; readonly payload: unknown },
  ): boolean => {
    const store = workspaceRecovery?.kernel?.store;
    if (store === undefined) throw new Error("Meeting loop is unavailable.");
    const current = store
      .snapshot()
      .strategicRecords?.find((record) => record.id === meetingId);
    if (current?.kind !== "meeting") return false;
    const built = build({
      meetingId,
      workspaceId: current.workspaceId,
      recordVersion: current.version,
    });
    const result = runtime.service.execute(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName: built.commandName,
        commandId: randomUUID(),
        workspaceId: current.workspaceId,
        // The record version rides in the key: a successful command binds it,
        // so a repeat after undo must not collide with the earlier attempt.
        idempotencyKey: `meeting-work-item:${built.commandName}:${meetingId}:v${current.version}`,
        expectedVersions: { [current.id]: current.version },
        correlationId: randomUUID(),
        payload: built.payload,
      }),
    );
    return (
      result.kind === "command_outcome" && result.outcome.outcome === "success"
    );
  };
  const jamieCustody = new JamieConnectionCustody(
    stateRoot,
    electronSafeStorage,
  );
  const jamieApi = new JamieApiClient();
  const recoveredKernel = workspaceRecovery?.kernel;
  const capturePayloadCustody =
    recoveredKernel === undefined
      ? undefined
      : new CapturePayloadCustody(
          recoveredKernel.identity.workspaceId,
          recoveredKernel.store,
        );
  const voiceLifecycleService =
    recoveredKernel === undefined
      ? undefined
      : createRuntimeKernelService({
          context: {
            ...recoveredKernel.context,
            capabilityScope: [
              ...new Set([
                ...recoveredKernel.context.capabilityScope,
                "capture.audioDeleteConfirm" as const,
              ]),
            ],
            origin: "maintenance",
          },
          store: recoveredKernel.store,
        });
  const finalizeVoiceAudio = (captureId: CaptureId): void => {
    if (capturePayloadCustody === undefined || recoveredKernel === undefined)
      return;
    const capture = recoveredKernel.store.read((view) =>
      view.getCapture(captureId),
    );
    if (
      capture?.processingState !== "transcript_ready" ||
      capture.audioState !== "deletion_pending" ||
      capture.original.kind !== "voice_note" ||
      !capturePayloadCustody.deleteVoiceAudio(capture.original)
    )
      return;
    voiceLifecycleService?.execute({
      contractVersion: 1,
      commandName: "capture.confirmAudioDeletion",
      commandId: randomUUID(),
      workspaceId: capture.workspaceId,
      idempotencyKey: `voice-audio-delete:${capture.id}:v${capture.version}`,
      expectedVersions: { [capture.id]: capture.version },
      correlationId: randomUUID(),
      payload: {
        captureId: capture.id,
        audioContentSha256: capture.original.payload.contentSha256,
      },
    });
  };
  capturePayloadCustody?.reconcile();
  recoveredKernel?.store
    .read((view) =>
      view
        .listSpaces(recoveredKernel.identity.workspaceId)
        .flatMap((space) =>
          view.listCapturesInSpace(
            recoveredKernel.identity.workspaceId,
            space.id,
          ),
        ),
    )
    .filter(
      (capture) =>
        capture.processingState === "transcript_ready" &&
        capture.audioState === "deletion_pending",
    )
    .forEach((capture) => finalizeVoiceAudio(capture.id));
  // One automation sweep per unlocked day: waiting Tasks whose review date
  // elapsed raise deduplicated attention signals. The daily idempotency key
  // makes restarts replay the stored outcome instead of re-sweeping.
  if (
    recoveredKernel !== undefined &&
    recoveredKernel.store.read((view) =>
      view
        .listAutomationRules(recoveredKernel.identity.workspaceId)
        .some(
          (rule) =>
            (rule.state ?? "active") === "active" &&
            rule.recipe.kind === "waiting_review_signals",
        ),
    )
  ) {
    createRuntimeKernelService({
      context: {
        ...recoveredKernel.context,
        capabilityScope: [
          ...new Set([
            ...recoveredKernel.context.capabilityScope,
            "automation.sweep" as const,
          ]),
        ],
        origin: "maintenance",
      },
      store: recoveredKernel.store,
    }).execute({
      contractVersion: 1,
      commandName: "automation.sweep",
      commandId: randomUUID(),
      workspaceId: recoveredKernel.identity.workspaceId,
      idempotencyKey: `automation-sweep:${new Date().toISOString().slice(0, 10)}`,
      expectedVersions: {},
      correlationId: randomUUID(),
      payload: {},
    });
  }

  // One recurrence sweep per unlocked day, on the same rhythm and for the same
  // reason: recurring work should advance without the owner remembering to ask
  // for it. Guarded on a due cadence existing so an ordinary launch does no
  // work, and made replay-safe by the daily idempotency key. A missed stretch
  // produces one current occurrence per cadence, not a backlog (ADR-041 §3).
  if (
    recoveredKernel !== undefined &&
    recoveredKernel.store.read((view) => {
      if (!isApplicationWave2ReadView(view)) return false;
      const now = Date.now();
      // The guard mirrors the handler's Space scoping. Without it, a due
      // cadence in a Space this principal cannot edit would fire a command
      // that finds nothing to do on every unlock, forever.
      return view
        .listSpaces(recoveredKernel.identity.workspaceId)
        .some(
          (space) =>
            canEditSpace(
              view,
              recoveredKernel.context,
              recoveredKernel.identity.workspaceId,
              space.id,
            ) &&
            view
              .listStrategicRecords(
                recoveredKernel.identity.workspaceId,
                space.id,
              )
              .some(
                (record) =>
                  record.kind === "recurrence" &&
                  record.state === "active" &&
                  Date.parse(record.nextDueAt) <= now,
              ),
        );
    })
  ) {
    createRuntimeKernelService({
      context: {
        ...recoveredKernel.context,
        capabilityScope: [
          ...new Set([
            ...recoveredKernel.context.capabilityScope,
            "recurrence.sweep" as const,
            "task.create" as const,
          ]),
        ],
        origin: "maintenance",
      },
      store: recoveredKernel.store,
    }).execute({
      contractVersion: 1,
      commandName: "recurrence.sweep",
      commandId: randomUUID(),
      workspaceId: recoveredKernel.identity.workspaceId,
      idempotencyKey: `recurrence-sweep:${new Date().toISOString().slice(0, 10)}`,
      expectedVersions: {},
      correlationId: randomUUID(),
      payload: {},
    });
  }
  if (
    workspaceRecovery?.kernel !== undefined &&
    coordinatedDataHomeProvider === undefined
  ) {
    localMcpRuntime = new LocalMcpRuntime({
      stateRoot,
      workspaceId: workspaceRecovery.kernel.identity.workspaceId,
      store: workspaceRecovery.kernel.store,
      isEnabled: () => coordinatedDataHomeProvider === undefined,
      readCapturePayload: (original) => capturePayloadCustody?.read(original),
      finalizeVoiceAudio,
      documentText: (() => {
        const port = createAgentDocumentTextPort({
          workspaceId: workspaceRecovery.kernel.identity.workspaceId,
          store: workspaceRecovery.kernel.store,
          connection: () => activeHubConnection,
        });
        return {
          read: port.read,
          readStructured: port.readStructured,
          replace: (request) =>
            installationDeviceId === undefined
              ? undefined
              : port.replace({
                  ...request,
                  deviceId: installationDeviceId,
                }),
          replaceStructured: (request) =>
            installationDeviceId === undefined
              ? undefined
              : port.replaceStructured({
                  ...request,
                  deviceId: installationDeviceId,
                }),
          restoreStructured: (request) =>
            installationDeviceId === undefined
              ? undefined
              : port.restoreStructured({
                  ...request,
                  deviceId: installationDeviceId,
                }),
        };
      })(),
    });
    await localMcpRuntime.start();
  }
  const pendingAgentCredentials = new Map<
    string,
    {
      readonly grantId: string;
      readonly prepared: PreparedLocalMcpCredential;
      readonly expiresAt: number;
    }
  >();
  const purgeExpiredAgentCredentials = (): void => {
    const now = Date.now();
    for (const [credentialId, pending] of pendingAgentCredentials) {
      if (pending.expiresAt <= now)
        pendingAgentCredentials.delete(credentialId);
    }
  };
  ipcMain.handle(
    DESKTOP_CHANNELS.prepareAgentCredential,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      if (localMcpRuntime === undefined)
        throw new Error("Local MCP runtime is unavailable.");
      if (coordinatedDataHomeProvider !== undefined)
        throw new Error("Local MCP grants require a local-only Data Home.");
      purgeExpiredAgentCredentials();
      if (pendingAgentCredentials.size >= 32)
        throw new Error("Too many pending local MCP credentials.");
      if (
        typeof raw !== "object" ||
        raw === null ||
        Array.isArray(raw) ||
        Object.keys(raw).join(",") !== "grantId"
      )
        throw new Error("Invalid local MCP credential request.");
      const grantId = GrantIdSchema.parse(
        (raw as { grantId?: unknown }).grantId,
      );
      const prepared = localMcpRuntime.credentialCustody.prepare(grantId);
      pendingAgentCredentials.set(prepared.credentialId, {
        grantId,
        prepared,
        expiresAt: Date.now() + 5 * 60_000,
      });
      return {
        credentialId: prepared.credentialId,
        credentialDigest: prepared.credentialDigest,
        descriptorPath:
          localMcpRuntime.credentialCustody.descriptorPath(grantId),
        launchCommand: process.execPath,
        launchArgs: [path.join(process.resourcesPath, "constellation-mcp.mjs")],
        launchEnvironment: {
          ELECTRON_RUN_AS_NODE: "1",
          CONSTELLATION_MCP_CREDENTIAL_FILE:
            localMcpRuntime.credentialCustody.descriptorPath(grantId),
        },
      };
    },
  );
  const remoteAgentRequest = async (
    method: "POST" | "PUT" | "DELETE",
    pathName: "/v1/remote-mcp/grants" | "/v1/remote-mcp/grants/list",
    body: unknown,
  ): Promise<Record<string, unknown>> => {
    const connection = activeHubConnection;
    if (connection === undefined)
      throw new Error("Remote MCP requires an active Hub Data Home.");
    const result = await fetch(`${connection.origin}${pathName}`, {
      method,
      headers: {
        authorization: `Bearer ${connection.deviceCredential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const value = (await result.json()) as unknown;
    if (
      !result.ok ||
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      (value as { outcome?: unknown }).outcome !== "success"
    ) {
      // A refused capability scope is a policy answer the operator can act on,
      // so it is reported as itself instead of as "unavailable" (ADR-046 §5).
      const refused =
        result.status === 403 &&
        (value as { diagnosticCode?: unknown })?.diagnosticCode ===
          "grant.capability_not_delegable"
          ? (value as { capabilities?: unknown }).capabilities
          : undefined;
      throw new Error(
        Array.isArray(refused) && refused.length > 0
          ? `Remote MCP refused these non-delegable capabilities: ${refused.join(", ")}.`
          : result.status === 409
            ? "Remote MCP policy changed. Refresh and retry."
            : "Remote MCP management is unavailable.",
      );
    }
    return value as Record<string, unknown>;
  };
  const remoteMcpCredentialCustody = new RemoteMcpCredentialCustody(stateRoot);
  ipcMain.handle(DESKTOP_CHANNELS.listRemoteAgentGrants, async (event) => {
    assertTrustedSender(event);
    const connection = activeHubConnection;
    if (connection === undefined)
      throw new Error("Remote MCP requires an active Hub Data Home.");
    const request = RemoteMcpGrantListRequestSchema.parse({
      protocolVersion: 1,
      workspaceId: connection.workspaceId,
      deviceId: connection.deviceId,
    });
    const result = await remoteAgentRequest(
      "POST",
      "/v1/remote-mcp/grants/list",
      request,
    );
    if (
      typeof result.policyVersion !== "number" ||
      !Number.isSafeInteger(result.policyVersion) ||
      result.policyVersion < 1 ||
      typeof result.workspaceVersion !== "number" ||
      !Number.isSafeInteger(result.workspaceVersion) ||
      result.workspaceVersion < 1 ||
      !Array.isArray(result.grants)
    )
      throw new Error("Remote MCP management returned an invalid response.");
    return {
      policyVersion: result.policyVersion,
      workspaceVersion: result.workspaceVersion,
      grants: result.grants.map((grant) =>
        RemoteMcpGrantProjectionSchema.parse(grant),
      ),
    };
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.createRemoteAgentGrant,
    async (event, raw: unknown) => {
      assertTrustedSender(event);
      const connection = activeHubConnection;
      if (connection === undefined)
        throw new Error("Remote MCP requires an active Hub Data Home.");
      const input =
        raw !== null && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const request = RemoteMcpGrantCreateRequestSchema.parse({
        ...input,
        protocolVersion: 1,
        workspaceId: connection.workspaceId,
        deviceId: connection.deviceId,
      });
      const result = await remoteAgentRequest(
        "POST",
        "/v1/remote-mcp/grants",
        request,
      );
      const grant = RemoteMcpGrantProjectionSchema.parse(result.grant);
      const endpoint = `${connection.origin}/v1/mcp/${connection.workspaceId}`;
      const descriptorPath = remoteMcpCredentialCustody.publish({
        grantId: grant.grantId,
        endpoint,
        bearerToken: RemoteMcpCredentialSchema.parse(result.bearerToken),
      });
      return { grant, endpoint, descriptorPath };
    },
  );
  const changeRemoteAgentGrant = async (
    raw: unknown,
    method: "PUT" | "DELETE",
  ) => {
    const connection = activeHubConnection;
    if (connection === undefined)
      throw new Error("Remote MCP requires an active Hub Data Home.");
    const input =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const request = RemoteMcpGrantChangeRequestSchema.parse({
      ...input,
      protocolVersion: 1,
      workspaceId: connection.workspaceId,
      deviceId: connection.deviceId,
    });
    const result = await remoteAgentRequest(
      method,
      "/v1/remote-mcp/grants",
      request,
    );
    const grant = RemoteMcpGrantProjectionSchema.parse(result.grant);
    if (method === "DELETE") {
      remoteMcpCredentialCustody.revoke(grant.grantId);
      return { grant };
    }
    const endpoint = `${connection.origin}/v1/mcp/${connection.workspaceId}`;
    const descriptorPath = remoteMcpCredentialCustody.publish({
      grantId: grant.grantId,
      endpoint,
      bearerToken: RemoteMcpCredentialSchema.parse(result.bearerToken),
    });
    return { grant, endpoint, descriptorPath };
  };
  ipcMain.handle(
    DESKTOP_CHANNELS.rotateRemoteAgentGrant,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      return changeRemoteAgentGrant(raw, "PUT");
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.revokeRemoteAgentGrant,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      return changeRemoteAgentGrant(raw, "DELETE");
    },
  );
  const documentCollaboration =
    workspaceRecovery?.kernel === undefined ||
    installationDeviceId === undefined
      ? undefined
      : new DocumentCollaborationBridge({
          workspaceId: workspaceRecovery.kernel.identity.workspaceId,
          deviceId: installationDeviceId,
          store: workspaceRecovery.kernel.store,
          connection: () => activeHubConnection,
        });
  const mediaTypeForFilename = (filename: string): string => {
    switch (path.extname(filename).toLowerCase()) {
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      case ".pdf":
        return "application/pdf";
      case ".txt":
      case ".md":
        return "text/plain";
      default:
        return "application/octet-stream";
    }
  };
  ipcMain.handle(DESKTOP_CHANNELS.selectCapturePayload, async (event) => {
    assertTrustedSender(event);
    if (capturePayloadCustody === undefined)
      return { outcome: "failure", code: "payload_unavailable" } as const;
    const selected = await dialog.showOpenDialog({
      title: "Choose a file to preserve in Constellation",
      properties: ["openFile"],
    });
    const filename = selected.filePaths[0];
    if (selected.canceled || filename === undefined)
      return { outcome: "failure", code: "cancelled" } as const;
    let descriptor: number | undefined;
    try {
      const info = lstatSync(filename);
      if (!info.isFile() || info.isSymbolicLink())
        return { outcome: "failure", code: "payload_unsupported" } as const;
      if (info.size < 1)
        return { outcome: "failure", code: "payload_empty" } as const;
      if (info.size > MAX_CAPTURE_PAYLOAD_BYTES)
        return { outcome: "failure", code: "payload_too_large" } as const;
      descriptor = openSync(
        filename,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      );
      const openedInfo = fstatSync(descriptor);
      if (
        !openedInfo.isFile() ||
        openedInfo.size !== info.size ||
        openedInfo.dev !== info.dev ||
        openedInfo.ino !== info.ino
      )
        return {
          outcome: "failure",
          code: "payload_integrity_failed",
        } as const;
      const mediaType = mediaTypeForFilename(filename);
      return capturePayloadCustody.stage({
        displayName: path.basename(filename),
        mediaType,
        inputKind: mediaType.startsWith("image/") ? "screenshot" : "file",
        bytes: readFileSync(descriptor),
      });
    } catch {
      return { outcome: "failure", code: "payload_unavailable" } as const;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.stageCapturePayload,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      if (
        capturePayloadCustody === undefined ||
        typeof raw !== "object" ||
        raw === null ||
        Array.isArray(raw)
      )
        return { outcome: "failure", code: "payload_unavailable" } as const;
      const input = raw as Record<string, unknown>;
      if (
        Object.keys(input).sort().join(",") !==
          (input.inputKind === "voice_note"
            ? "bytes,displayName,durationMs,inputKind,mediaType,retentionPolicy"
            : "bytes,displayName,inputKind,mediaType") ||
        typeof input.displayName !== "string" ||
        typeof input.mediaType !== "string" ||
        (input.inputKind !== "file" &&
          input.inputKind !== "screenshot" &&
          input.inputKind !== "voice_note") ||
        !(input.bytes instanceof Uint8Array)
      )
        return { outcome: "failure", code: "payload_unsupported" } as const;
      return capturePayloadCustody.stage({
        displayName: input.displayName,
        mediaType: input.mediaType,
        inputKind: input.inputKind,
        bytes: input.bytes,
        ...(input.inputKind === "voice_note"
          ? {
              durationMs: input.durationMs as number,
              retentionPolicy: input.retentionPolicy as
                "delete_after_transcript" | "retain",
            }
          : {}),
      });
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.discardCapturePayload,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      const original = CaptureOriginalSchema.safeParse(raw);
      if (original.success) capturePayloadCustody?.discard(original.data);
    },
  );
  const authorizedManagedPayload = (raw: unknown) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return undefined;
    const input = raw as Record<string, unknown>;
    if (Object.keys(input).sort().join(",") !== "captureId,original")
      return undefined;
    const captureId = CaptureIdSchema.safeParse(input.captureId);
    const original = CaptureOriginalSchema.safeParse(input.original);
    if (
      !captureId.success ||
      !original.success ||
      !isCustodiedCaptureOriginal(original.data) ||
      workspaceRecovery?.kernel === undefined
    )
      return undefined;
    const capture = workspaceRecovery.kernel.store.read((view) =>
      view.getCapture(captureId.data),
    );
    if (
      capture === undefined ||
      JSON.stringify(capture.original) !== JSON.stringify(original.data)
    )
      return undefined;
    return original.data;
  };
  ipcMain.handle(
    DESKTOP_CHANNELS.inspectManagedPayload,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      const original = authorizedManagedPayload(raw);
      return {
        state:
          original !== undefined && capturePayloadCustody?.verify(original)
            ? "available"
            : "unavailable",
      } as const;
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.restoreManagedPayload,
    async (event, raw: unknown) => {
      assertTrustedSender(event);
      const original = authorizedManagedPayload(raw);
      if (original === undefined || capturePayloadCustody === undefined)
        return { state: "unavailable" } as const;
      if (capturePayloadCustody.verify(original))
        return { state: "available" } as const;
      if (activeHubConnection === undefined)
        return { state: "unavailable" } as const;
      try {
        const bytes = await new HttpHubTransport(
          activeHubConnection.origin,
        ).downloadAttachment({
          credential: activeHubConnection.deviceCredential,
          workspaceId: activeHubConnection.workspaceId,
          deviceId: activeHubConnection.deviceId,
          digest: original.payload.contentSha256,
        });
        return {
          state: capturePayloadCustody.restore(original, bytes)
            ? "available"
            : "unavailable",
        } as const;
      } catch {
        return { state: "unavailable" } as const;
      }
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.executeCommand,
    async (event, command: unknown) => {
      assertTrustedSender(event);
      const parsedCommand = CommandEnvelopeSchema.safeParse(command);
      const managedOriginal = (() => {
        if (!parsedCommand.success) return undefined;
        const accepted = parsedCommand.data;
        const original =
          accepted.commandName === "capture.submit"
            ? accepted.payload.original
            : accepted.commandName === "capture.resolveException" &&
                accepted.payload.action === "replace_payload"
              ? accepted.payload.original
              : undefined;
        return original !== undefined && isCustodiedCaptureOriginal(original)
          ? original
          : undefined;
      })();
      if (
        managedOriginal !== undefined &&
        (capturePayloadCustody === undefined ||
          !capturePayloadCustody.verify(managedOriginal))
      )
        throw new Error("CAPTURE_PAYLOAD_INTEGRITY_FAILED");
      if (managedOriginal !== undefined && activeHubConnection !== undefined) {
        const bytes = capturePayloadCustody?.read(managedOriginal);
        if (bytes === undefined)
          throw new Error("CAPTURE_PAYLOAD_INTEGRITY_FAILED");
        try {
          const transferred = await new HttpHubTransport(
            activeHubConnection.origin,
          ).uploadAttachment({
            credential: activeHubConnection.deviceCredential,
            workspaceId: activeHubConnection.workspaceId,
            deviceId: activeHubConnection.deviceId,
            bytes,
          });
          if (
            transferred.digest !== managedOriginal.payload.contentSha256 ||
            transferred.byteLength !== managedOriginal.payload.byteLength
          )
            throw new Error("CAPTURE_PAYLOAD_INTEGRITY_FAILED");
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "CAPTURE_PAYLOAD_INTEGRITY_FAILED"
          )
            throw error;
          throw new Error(
            "Nie udało się przesłać pliku do Data Home. Plik pozostaje przygotowany lokalnie — spróbuj ponownie.",
          );
        }
      }
      if (
        parsedCommand.success &&
        coordinatedDataHomeProvider !== undefined &&
        (parsedCommand.data.commandName === "agent.grantCreate" ||
          parsedCommand.data.commandName === "agent.grantRotateCredential")
      )
        throw new Error("Local MCP grants require a local-only Data Home.");
      const pendingAgentCredential =
        parsedCommand.success &&
        (parsedCommand.data.commandName === "agent.grantCreate" ||
          parsedCommand.data.commandName === "agent.grantRotateCredential")
          ? pendingAgentCredentials.get(parsedCommand.data.payload.credentialId)
          : undefined;
      if (
        parsedCommand.success &&
        (parsedCommand.data.commandName === "agent.grantCreate" ||
          parsedCommand.data.commandName === "agent.grantRotateCredential") &&
        (pendingAgentCredential === undefined ||
          pendingAgentCredential.expiresAt <= Date.now() ||
          pendingAgentCredential.grantId !==
            parsedCommand.data.payload.grantId ||
          pendingAgentCredential.prepared.credentialDigest !==
            parsedCommand.data.payload.credentialDigest)
      )
        throw new Error(
          "Local MCP credential preparation is invalid or expired.",
        );
      const result = runtime.service.execute(command);
      if (
        result.kind === "command_outcome" &&
        result.outcome.outcome === "success" &&
        parsedCommand.success &&
        localMcpRuntime !== undefined
      ) {
        const accepted = parsedCommand.data;
        if (
          accepted.commandName === "agent.grantCreate" ||
          accepted.commandName === "agent.grantRotateCredential"
        ) {
          if (pendingAgentCredential === undefined)
            throw new Error("Prepared local MCP credential is unavailable.");
          localMcpRuntime.credentialCustody.publish({
            workspaceId: accepted.workspaceId,
            grantId: accepted.payload.grantId,
            endpoint: localMcpRuntime.endpoint,
            credential: pendingAgentCredential.prepared,
          });
          pendingAgentCredentials.delete(accepted.payload.credentialId);
        } else if (accepted.commandName === "agent.grantRevoke") {
          localMcpRuntime.credentialCustody.revoke(accepted.payload.grantId);
        }
      }
      if (
        result.kind === "command_outcome" &&
        result.outcome.outcome === "success" &&
        coordinatedDataHomeProvider !== undefined
      ) {
        scheduleHubSync(0);
      }
      if (
        result.kind === "command_outcome" &&
        result.outcome.outcome === "success"
      ) {
        if (
          activeHubConnection === undefined &&
          parsedCommand.success &&
          (parsedCommand.data.commandName === "capture.writeTranscript" ||
            parsedCommand.data.commandName === "capture.requestAudioDeletion")
        )
          finalizeVoiceAudio(parsedCommand.data.payload.captureId);
        if (
          parsedCommand.success &&
          parsedCommand.data.commandName === "capture.resolveException" &&
          parsedCommand.data.payload.action === "replace_payload"
        )
          capturePayloadCustody?.reconcile();
        if (
          parsedCommand.success &&
          parsedCommand.data.commandName === "workspace.rename"
        ) {
          renameRegisteredWorkspace(
            baseRoot,
            parsedCommand.data.workspaceId,
            parsedCommand.data.payload.name,
          );
        }
        deliverUrgentAttention(runtime.service);
      }
      return result;
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.runQuery, (event, query: unknown) => {
    assertTrustedSender(event);
    return runtime.service.query(query);
  });
  ipcMain.handle(DESKTOP_CHANNELS.getJamieStatus, async (event) => {
    assertTrustedSender(event);
    const connection = await jamieCustody.load();
    return connection === undefined
      ? { configured: false }
      : { configured: true, scope: connection.scope };
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.configureJamie,
    async (event, raw: unknown) => {
      assertTrustedSender(event);
      if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid Jamie connection.");
      const candidate = raw as Record<string, unknown>;
      if (
        Object.keys(candidate).sort().join(",") !== "apiKey,scope" ||
        typeof candidate.apiKey !== "string" ||
        (candidate.scope !== "personal" && candidate.scope !== "workspace")
      )
        throw new Error("Invalid Jamie connection.");
      await jamieCustody.replace({
        apiKey: candidate.apiKey,
        scope: candidate.scope,
      });
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.disconnectJamie, (event) => {
    assertTrustedSender(event);
    jamieCustody.revoke();
  });
  ipcMain.handle(DESKTOP_CHANNELS.syncJamie, async (event) => {
    assertTrustedSender(event);
    if (meetingLoop === undefined)
      throw new Error("Meeting loop is unavailable.");
    const connection = await jamieCustody.load();
    if (connection === undefined) throw new Error("Jamie is not configured.");
    const authorization = meetingLoop.authorization();
    const spaceId = authorization.editableSpaceIds[0];
    if (spaceId === undefined || !authorization.canImportJamie)
      throw new Error("Jamie import is not authorized.");
    const now = new Date().toISOString();
    const meetingIds = await jamieApi.listRecent({
      connection,
      startDate: new Date(Date.parse(now) - 90 * 86_400_000).toISOString(),
      limit: 50,
    });
    const counts = {
      applied: 0,
      corrected: 0,
      noChange: 0,
      partial: 0,
      conflicted: 0,
      failed: 0,
    };
    for (const meetingId of meetingIds) {
      try {
        const meeting = await jamieApi.getMeeting({ connection, meetingId });
        let tasksComplete = true;
        const tasks = await jamieApi
          .listMeetingTasks({ connection, meetingId })
          .catch(() => {
            tasksComplete = false;
            return [];
          });
        const normalized = normalizeJamieApiMeeting({
          connectionId: connection.connectionId,
          meeting,
          tasks,
          tasksComplete,
          receivedAt: now,
          hasher: {
            fingerprint: (value) =>
              createHash("sha256").update(JSON.stringify(value)).digest("hex"),
          },
        });
        if (normalized === undefined) {
          counts.failed += 1;
          continue;
        }
        const outcome = meetingLoop.service.importJamie({
          authorization,
          spaceId,
          source: normalized,
        });
        if (outcome.outcome === "rejected") counts.failed += 1;
        else if (outcome.outcome === "no_change") {
          publishMeetingToCommandFeed(outcome.meeting);
          counts.noChange += 1;
        } else {
          publishMeetingToCommandFeed(outcome.meeting);
          counts[outcome.outcome] += 1;
        }
      } catch {
        counts.failed += 1;
      }
    }
    return counts;
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.getMeetingLoop,
    async (event, raw: unknown) => {
      assertTrustedSender(event);
      if (meetingLoop === undefined)
        throw new Error("Meeting loop is unavailable.");
      if (
        raw === null ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        Object.keys(raw).sort().join(",") !== "from,to"
      )
        throw new Error("Invalid meeting window.");
      const candidate = raw as Record<string, unknown>;
      if (
        typeof candidate.from !== "string" ||
        typeof candidate.to !== "string" ||
        Number.isNaN(Date.parse(candidate.from)) ||
        Number.isNaN(Date.parse(candidate.to)) ||
        Date.parse(candidate.to) <= Date.parse(candidate.from) ||
        Date.parse(candidate.to) - Date.parse(candidate.from) > 93 * 86_400_000
      )
        throw new Error("Invalid meeting window.");
      return meetingLoop.service.surface({
        authorization: meetingLoop.authorization(),
        from: candidate.from,
        to: candidate.to,
      });
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.requestCalendarAccess, (event) => {
    assertTrustedSender(event);
    if (meetingLoop === undefined)
      throw new Error("Meeting loop is unavailable.");
    return meetingLoop.requestCalendarAccess();
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.editMeetingWorkItem,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      if (meetingLoop === undefined)
        throw new Error("Meeting loop is unavailable.");
      if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid meeting work item edit.");
      const candidate = raw as Record<string, unknown>;
      if (
        Object.keys(candidate).sort().join(",") !==
          "expectedVersion,meetingId,state,title,workItemId" ||
        typeof candidate.meetingId !== "string" ||
        typeof candidate.workItemId !== "string" ||
        typeof candidate.expectedVersion !== "number" ||
        typeof candidate.title !== "string" ||
        candidate.title.trim().length === 0 ||
        candidate.title.length > 4_000
      )
        throw new Error("Invalid meeting work item edit.");
      const state = MeetingWorkItemSchema.shape.state.parse(candidate.state);
      const meetingId = candidate.meetingId;
      const workItemId = candidate.workItemId;
      const expectedWorkItemVersion = candidate.expectedVersion;
      const title = candidate.title;
      return executeMeetingWorkItemCommand(meetingId, () => ({
        commandName: "meeting.editWorkItem",
        payload: {
          meetingId,
          workItemId,
          expectedWorkItemVersion,
          title: title.trim(),
          state,
        },
      }));
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.correctMeetingWorkItemResponsibility,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      if (meetingLoop === undefined)
        throw new Error("Meeting loop is unavailable.");
      if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid meeting responsibility correction.");
      const candidate = raw as Record<string, unknown>;
      if (
        Object.keys(candidate).sort().join(",") !==
          "expectedVersion,meetingId,name,workItemId" ||
        typeof candidate.meetingId !== "string" ||
        typeof candidate.workItemId !== "string" ||
        typeof candidate.expectedVersion !== "number" ||
        (candidate.name !== null && typeof candidate.name !== "string")
      )
        throw new Error("Invalid meeting responsibility correction.");
      const override =
        candidate.name === null
          ? undefined
          : MeetingWorkItemResponsibilityOverrideSchema.parse({
              name: candidate.name,
            });
      const meetingId = candidate.meetingId;
      const workItemId = candidate.workItemId;
      const expectedWorkItemVersion = candidate.expectedVersion;
      return executeMeetingWorkItemCommand(meetingId, () => ({
        commandName: "meeting.correctWorkItemResponsibility",
        payload: {
          meetingId,
          workItemId,
          expectedWorkItemVersion,
          name: override === undefined ? null : override.name,
        },
      }));
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.addMeetingWorkItem, (event, raw: unknown) => {
    assertTrustedSender(event);
    if (meetingLoop === undefined)
      throw new Error("Meeting loop is unavailable.");
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Invalid meeting work item.");
    const candidate = raw as Record<string, unknown>;
    if (
      Object.keys(candidate).sort().join(",") !==
        "kind,meetingId,requestId,title" ||
      typeof candidate.meetingId !== "string" ||
      typeof candidate.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate.requestId,
      ) ||
      typeof candidate.title !== "string" ||
      candidate.title.trim().length === 0 ||
      candidate.title.length > 4_000
    )
      throw new Error("Invalid meeting work item.");
    const kind = MeetingWorkItemSchema.shape.kind.parse(candidate.kind);
    const meetingId = candidate.meetingId;
    // The renderer's requestId is the work item's id: it is already a v4 UUID
    // generated once per attempt, so retrying the same attempt stays
    // idempotent while the kernel keeps owning id ownership explicitly.
    const workItemId = candidate.requestId;
    const title = candidate.title;
    return executeMeetingWorkItemCommand(meetingId, () => ({
      commandName: "meeting.addWorkItem",
      payload: { meetingId, workItemId, kind, title: title.trim() },
    }));
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.previewCalendarBlocks,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      if (meetingLoop === undefined)
        throw new Error("Meeting loop is unavailable.");
      if (
        raw === null ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        Object.keys(raw).join(",") !== "blocks" ||
        !Array.isArray((raw as Record<string, unknown>).blocks)
      )
        throw new Error("Invalid calendar preview.");
      const blocks = (raw as { blocks: unknown[] }).blocks.map((block) =>
        CalendarBlockDraftSchema.parse(block),
      );
      return meetingLoop.service.previewCalendarWrite({
        authorization: meetingLoop.authorization(),
        blocks,
      });
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.confirmCalendarBlocks,
    (event, raw: unknown) => {
      assertTrustedSender(event);
      if (meetingLoop === undefined)
        throw new Error("Meeting loop is unavailable.");
      if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid calendar confirmation.");
      const candidate = raw as Record<string, unknown>;
      if (
        Object.keys(candidate).sort().join(",") !==
          "blocks,consentToken,previewId" ||
        typeof candidate.previewId !== "string" ||
        typeof candidate.consentToken !== "string" ||
        !Array.isArray(candidate.blocks)
      )
        throw new Error("Invalid calendar confirmation.");
      return meetingLoop.service.confirmCalendarWrite({
        authorization: meetingLoop.authorization(),
        previewId: candidate.previewId,
        consentToken: candidate.consentToken,
        blocks: candidate.blocks.map((block) =>
          CalendarBlockDraftSchema.parse(block),
        ),
      });
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.openDocument, (event, input: unknown) => {
    assertTrustedSender(event);
    if (documentCollaboration === undefined)
      throw new Error("Workspace documents are unavailable.");
    return documentCollaboration.open(input as never);
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.persistDocumentUpdate,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace documents are unavailable.");
      documentCollaboration.persist(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.acknowledgeDocumentUpdates,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace documents are unavailable.");
      documentCollaboration.acknowledge(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.createDocumentRevision,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace documents are unavailable.");
      return documentCollaboration.createRevision(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.listDocumentRevisions,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace documents are unavailable.");
      return documentCollaboration.listRevisions(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.restoreDocumentRevision,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace documents are unavailable.");
      return documentCollaboration.restoreRevision(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.openCollaborativeContent,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace content is unavailable.");
      return documentCollaboration.openContent(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.persistCollaborativeContentUpdate,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace content is unavailable.");
      documentCollaboration.persistContent(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.acknowledgeCollaborativeContentUpdates,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace content is unavailable.");
      documentCollaboration.acknowledgeContent(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.createCollaborativeContentRevision,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace content is unavailable.");
      return documentCollaboration.createContentRevision(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.listCollaborativeContentRevisions,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace content is unavailable.");
      return documentCollaboration.listContentRevisions(input as never);
    },
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.restoreCollaborativeContentRevision,
    (event, input: unknown) => {
      assertTrustedSender(event);
      if (documentCollaboration === undefined)
        throw new Error("Workspace content is unavailable.");
      return documentCollaboration.restoreContentRevision(input as never);
    },
  );
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
  ipcMain.handle(
    DESKTOP_CHANNELS.openDetachedSurface,
    async (event, input: unknown) => {
      assertTrustedSender(event);
      const surface =
        typeof input === "object" && input !== null
          ? (input as { surface?: unknown }).surface
          : undefined;
      if (typeof surface !== "string" || !DETACHABLE_SURFACES.has(surface))
        throw new Error("Unsupported detached surface.");
      await createWindow(surface);
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.getReleaseStatus, (event) => {
    assertTrustedSender(event);
    return releaseService.getStatus();
  });
  ipcMain.handle(DESKTOP_CHANNELS.exportSupportReport, async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showSaveDialog({
      title: "Save privacy-safe support report",
      defaultPath: "constellation-support-report.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (result.canceled || result.filePath === undefined)
      return { outcome: "cancelled" } as const;
    let dataHome;
    try {
      dataHome = await dataHomeProvider?.getStatus();
    } catch {
      dataHome = undefined;
    }
    try {
      writePrivacySafeSupportReport(
        result.filePath,
        createPrivacySafeSupportReport({
          generatedAt: new Date().toISOString(),
          build: runtime.buildInfo,
          packaged: app.isPackaged,
          platform: process.platform,
          architecture: process.arch,
          electronVersion: process.versions.electron ?? "unknown",
          ...(dataHome === undefined ? {} : { dataHome }),
          release: releaseService.getStatus(),
        }),
      );
      return {
        outcome: "success",
        fileLabel: path.basename(result.filePath),
      } as const;
    } catch {
      return { outcome: "failure" } as const;
    }
  });
  ipcMain.handle(DESKTOP_CHANNELS.exportExchangePackage, async (event) => {
    assertTrustedSender(event);
    const kernel = workspaceRecovery?.kernel;
    if (kernel === undefined) return { outcome: "failure" } as const;
    const documentTextPort = createAgentDocumentTextPort({
      workspaceId: kernel.identity.workspaceId,
      store: kernel.store,
      connection: () => activeHubConnection,
    });
    const built = buildExchangeManifest({
      store: kernel.store,
      workspaceId: kernel.identity.workspaceId,
      spaceId: kernel.identity.rootSpaceId,
      readDocumentText: documentTextPort.read,
      readDocumentContent: documentTextPort.readStructured,
      readProjectContent: ({ projectId, spaceId }) =>
        documentTextPort.readStructured({
          owner: { kind: "project", projectId },
          spaceId,
        }),
    });
    if (built === undefined) return { outcome: "failure" } as const;
    const result = await dialog.showSaveDialog({
      title: "Export a Constellation exchange package",
      defaultPath: "constellation-exchange.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (result.canceled || result.filePath === undefined)
      return { outcome: "cancelled" } as const;
    try {
      writeFileSync(
        result.filePath,
        `${JSON.stringify(built.manifest, undefined, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      return {
        outcome: "success",
        fileLabel: path.basename(result.filePath),
        counts: built.counts,
      } as const;
    } catch {
      return { outcome: "failure" } as const;
    }
  });
  ipcMain.handle(DESKTOP_CHANNELS.checkForRelease, (event) => {
    assertTrustedSender(event);
    return releaseService.check();
  });
  ipcMain.handle(DESKTOP_CHANNELS.downloadRelease, (event) => {
    assertTrustedSender(event);
    return releaseService.download();
  });
  ipcMain.handle(DESKTOP_CHANNELS.installRelease, (event) => {
    assertTrustedSender(event);
    return releaseService.install();
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
      deliverUrgentAttention(runtime.service);
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
      activeHubConnection = connection;
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
  ipcMain.handle(
    DESKTOP_CHANNELS.copyWorkspaceRecoveryCode,
    (event, input: unknown) => {
      assertTrustedSender(event);
      return copyRecoveryCodeToClipboard(clipboard, input);
    },
  );
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
    async (event, input: unknown) => {
      assertTrustedSender(event);
      const restoreId = parseRestoreId(input);
      const result =
        restoreId === undefined
          ? { outcome: "failure", code: "workspace_identity_invalid" }
          : await (dataHomeProvider?.confirmProviderMigration(restoreId) ??
              Promise.resolve({
                outcome: "failure" as const,
                code: "io_failed" as const,
              }));
      if (result.outcome === "success" && workspaceRecovery?.kernel) {
        ensureRegisteredWorkspace(baseRoot, {
          workspaceId: workspaceRecovery.kernel.identity.workspaceId,
          name: workspaceRecovery.kernel.workspaceName,
          relativeStateRoot:
            path.resolve(stateRoot) === path.resolve(baseRoot)
              ? "."
              : path.relative(baseRoot, stateRoot),
        });
        relaunchIntoSelectedWorkspace();
      }
      return result;
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
  if (process.env.CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT !== undefined) {
    console.error(
      `Packaged smoke startup diagnostic: ${
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : typeof error
      }`,
    );
  }
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
      await shell.openPath(desktopStateRoot());
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
  void localMcpRuntime?.close();
  localMcpRuntime = undefined;
});
