import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertPackagedCredentialStoreTestAllowed } from "./desktop/packaged-credential-store-policy.mjs";
// Zbiór celów bierzemy z rejestru, nie z liczby wpisanej w asercję. Poprzednia
// wersja sprawdzała `length === 12`, a nowa nawigacja też ma dwanaście pozycji —
// czyli ta asercja przeszłaby przez CAŁKOWITĄ wymianę zbioru celów.
import { desktopNavigationSurfaceIds } from "../packages/desktop-preload/dist/src/surface-registry.js";
// Etykieta rodzaju też idzie z rejestru, nie z napisu wpisanego tutaj. Poprzednia
// wersja porównywała z „Projekt" i przeżyła flip na angielski jako czerwień na
// trzech systemach — a jest to dokładnie ten sam niezmiennik co wyżej: kontrakt
// wyprowadzamy ze źródła prawdy, nie przepisujemy go ręcznie.
import { getHumanRecordKindDescriptor } from "../packages/contracts/dist/src/record-kind-registry.js";

const projectKindLabel = getHumanRecordKindDescriptor("project").label;

assertPackagedCredentialStoreTestAllowed();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(root, "release", "local-alpha-manifest.json"),
    "utf8",
  ),
);
const executable =
  process.env.CONSTELLATION_PACKAGED_EXECUTABLE ?? manifest.executable;
const stateRoot =
  process.env.CONSTELLATION_PACKAGED_SMOKE_STATE_ROOT ??
  path.join(root, "build", "packaged-alpha-ui-smoke-state");
const continuityWorkspaceId =
  process.env.CONSTELLATION_VERIFY_EXISTING_WORKSPACE_ID;
const applicationStateRoot = path.join(stateRoot, "application-state");
const recoverySmokeRoot = path.join(applicationStateRoot, "recovery-smoke");
const taskTitle = "Verify packaged UI, preload, IPC, and persistence";
const mutationTitle = "This mutation must disappear after restore";
const projectTitle = "Verify packaged Project context";
const projectOutcome = "Project inspector preserves the intended outcome";
const directAreaId = "00000000-0000-4000-8000-000000000060";
const directInitiativeId = "00000000-0000-4000-8000-000000000061";
// A freshly mounted ad-hoc macOS app can briefly stall CDP while OS services
// attach. The journey-level waits remain bounded separately.
const CDP_COMMAND_TIMEOUT_MS = 15_000;
/**
 * The preload bridge, as an OUTSIDE observer sees it on the packaged app.
 *
 * Written out here rather than imported on purpose: importing the preload's
 * own channel list would compare the packaged application to itself and stop
 * catching the thing this exists to catch — a key that shipped without anybody
 * deciding it should. One line per key rather than one comma-joined string of
 * sixty, so the diff is readable when a channel is added.
 */
const PACKAGED_BRIDGE_KEYS = [
  "acknowledgeCollaborativeContentUpdates",
  "acknowledgeDocumentUpdates",
  "addMeetingWorkItem",
  "cancelWorkspaceRestore",
  "checkForRelease",
  "configureJamie",
  "confirmCalendarBlocks",
  "confirmWorkspaceRestore",
  "copyWorkspaceRecoveryCode",
  "correctMeetingWorkItemResponsibility",
  "createCollaborativeContentRevision",
  "createDocumentRevision",
  "createRemoteAgentGrant",
  "createWorkspace",
  "discardCapturePayload",
  "disconnectJamie",
  "downloadRelease",
  "editMeetingWorkItem",
  "enrollHub",
  "executeCommand",
  "exportExchangePackage",
  "exportHubAuthorization",
  "exportNotesMarkdown",
  "exportSupportReport",
  "exportWorkspaceBackup",
  "getBuildInfo",
  "getCrossWorkspaceCockpit",
  "getDataHomeStatus",
  "getJamieStatus",
  "getMeetingLoop",
  "getReleaseStatus",
  "importObsidianVault",
  "importStarterWorkspace",
  "inspectManagedPayload",
  "installRelease",
  "listCollaborativeContentRevisions",
  "listDocumentRevisions",
  "listRemoteAgentGrants",
  "listWorkspaces",
  "onAttentionActivated",
  "onShellCommand",
  "onWorkspaceChanged",
  "openCollaborativeContent",
  "openDetachedSurface",
  "openDocument",
  "persistCollaborativeContentUpdate",
  "persistDocumentUpdate",
  "prepareAgentCredential",
  "prepareWorkspaceRestore",
  "previewCalendarBlocks",
  "previewStarterWorkspace",
  "requestCalendarAccess",
  "restoreCollaborativeContentRevision",
  "restoreDocumentRevision",
  "restoreManagedPayload",
  "revokeRemoteAgentGrant",
  "rotateRemoteAgentGrant",
  "runQuery",
  "scanObsidianVault",
  "selectCapturePayload",
  "stageCapturePayload",
  "switchWorkspace",
  "syncDataHome",
  "syncJamie",
];

const PACKAGED_STARTUP_BUDGET_MS = 30_000;
const PACKAGED_INTERACTION_BUDGET_MS = 10_000;
const packagedResources =
  manifest.platform === "darwin"
    ? path.join(manifest.appBundle, "Contents", "Resources")
    : path.join(manifest.packageRoot, "resources");
const packagedLicenseRoot = path.join(packagedResources, "licenses");
const packagedLicenseFiles = fs.readdirSync(packagedLicenseRoot).sort();
if (
  packagedLicenseFiles.join("\0") !== manifest.licenseFiles.join("\0") ||
  !packagedLicenseFiles.includes("CONSTELLATION-LICENSE.txt") ||
  !packagedLicenseFiles.includes("SQLCipher-LICENSE.md") ||
  !packagedLicenseFiles.includes("THIRD-PARTY-NOTICES.txt") ||
  (manifest.platform === "win32" &&
    !packagedLicenseFiles.includes("OpenSSL-LICENSE.txt")) ||
  !fs
    .readFileSync(
      path.join(packagedLicenseRoot, "THIRD-PARTY-NOTICES.txt"),
      "utf8",
    )
    .includes("electron-updater 6.8.9 — MIT")
) {
  throw new Error("PACKAGED_ALPHA_LICENSE_NOTICES_INVALID");
}
if (continuityWorkspaceId === undefined) {
  fs.rmSync(stateRoot, { recursive: true, force: true });
}
fs.mkdirSync(stateRoot, { recursive: true });

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const clearSystemClipboard = () => {
  let cleared;
  if (process.platform === "darwin") {
    cleared = spawnSync("/usr/bin/pbcopy", [], {
      input: "",
      encoding: "utf8",
      timeout: 10_000,
    });
  } else if (process.platform === "win32") {
    cleared = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear()",
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
  } else {
    throw new Error("PACKAGED_ALPHA_CLIPBOARD_PLATFORM_UNSUPPORTED");
  }
  if (cleared.error !== undefined || cleared.status !== 0) {
    throw new Error("PACKAGED_ALPHA_CLIPBOARD_CLEAR_FAILED");
  }
};

class CdpClient {
  #id = 0;
  #issues = [];
  #pending = new Map();
  #sessionId;
  #closeTransport;
  #sendRaw;

  constructor(sendRaw, closeTransport, subscribe) {
    this.#sendRaw = sendRaw;
    this.#closeTransport = closeTransport;
    subscribe(
      (payload) => {
        const message = JSON.parse(payload);
        if (message.method === "Runtime.exceptionThrown") {
          this.#issues.push("renderer-exception");
        }
        if (
          message.method === "Log.entryAdded" &&
          message.params?.entry?.level === "error"
        ) {
          this.#issues.push(`renderer-log-${message.params.entry.level}`);
        }
        if (message.id === undefined) return;
        const pending = this.#pending.get(message.id);
        if (pending === undefined) return;
        this.#pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error === undefined) pending.resolve(message.result);
        else pending.reject(new Error(`CDP_${message.error.message}`));
      },
      () => {
        for (const pending of this.#pending.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("CDP_CONNECTION_CLOSED"));
        }
        this.#pending.clear();
      },
    );
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          socket.close();
        } catch {
          // A connecting WebSocket can reject close before it is established.
        }
        reject(new Error("CDP_CONNECTION_TIMEOUT"));
      }, 5_000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        { once: true },
      );
    });
    return new CdpClient(
      (payload) => socket.send(payload),
      () => socket.close(),
      (onMessage, onClose) => {
        socket.addEventListener("message", (event) =>
          onMessage(String(event.data)),
        );
        socket.addEventListener("close", onClose);
      },
    );
  }

  static connectPipe(input, output) {
    return new CdpClient(
      (payload) => output.write(`${payload}\0`),
      () => {
        input.destroy();
        output.destroy();
      },
      (onMessage, onClose) => {
        let buffer = "";
        input.setEncoding("utf8");
        input.on("data", (chunk) => {
          buffer += chunk;
          let boundary = buffer.indexOf("\0");
          while (boundary !== -1) {
            const payload = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 1);
            if (payload.length > 0) onMessage(payload);
            boundary = buffer.indexOf("\0");
          }
        });
        input.on("close", onClose);
      },
    );
  }

  async send(method, params = {}, browserCommand = false) {
    const id = ++this.#id;
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        reject(new Error(`CDP_${method}_TIMEOUT`));
      }, CDP_COMMAND_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timeout });
    });
    this.#sendRaw(
      JSON.stringify({
        id,
        method,
        params,
        ...(!browserCommand && this.#sessionId !== undefined
          ? { sessionId: this.#sessionId }
          : {}),
      }),
    );
    return result;
  }

  sendBrowser(method, params = {}) {
    return this.send(method, params, true);
  }

  async attachToPage() {
    const { targetInfos } = await this.sendBrowser("Target.getTargets");
    const page = targetInfos.find(
      (target) => target.type === "page" && target.url.startsWith("file://"),
    );
    if (page === undefined) return false;
    const { sessionId } = await this.sendBrowser("Target.attachToTarget", {
      targetId: page.targetId,
      flatten: true,
    });
    this.#sessionId = sessionId;
    return true;
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression: `(async () => (${expression}))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails !== undefined) {
      throw new Error(
        `RENDERER_EVALUATION_FAILED_${result.exceptionDetails.text ?? "UNKNOWN"}`,
      );
    }
    return result.result.value;
  }

  close() {
    this.#closeTransport();
  }

  issues() {
    return [...this.#issues];
  }
}

const waitForBrowserEndpoint = async (process, browserUserData) => {
  const activePortFile = path.join(browserUserData, "DevToolsActivePort");
  const deadline = Date.now() + 60_000;
  let lastObservation = "active-port-unavailable";
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`PACKAGED_ALPHA_EXITED_EARLY_${process.exitCode}`);
    }
    try {
      const [port, browserPath] = fs
        .readFileSync(activePortFile, "utf8")
        .trim()
        .split("\n");
      if (/^\d+$/.test(port) && browserPath?.startsWith("/devtools/browser/")) {
        return `ws://127.0.0.1:${port}${browserPath}`;
      }
      lastObservation = "active-port-invalid";
    } catch (error) {
      lastObservation = error instanceof Error ? error.message : "read-error";
      // The packaged browser is still starting.
    }
    await delay(100);
  }
  throw new Error(`PACKAGED_ALPHA_CDP_BROWSER_TIMEOUT_${lastObservation}`);
};

const waitForPage = async (client) => {
  const deadline = Date.now() + 60_000;
  let lastObservation = "page-unavailable";
  while (Date.now() < deadline) {
    try {
      if (await client.attachToPage()) return;
      lastObservation = "page-unavailable";
    } catch (error) {
      lastObservation =
        error instanceof Error ? error.message : "target-query-error";
    }
    await delay(100);
  }
  throw new Error(`PACKAGED_ALPHA_CDP_PAGE_TIMEOUT_${lastObservation}`);
};

const connectToBrowser = async (process, browserUserData) => {
  const endpoint = await waitForBrowserEndpoint(process, browserUserData);
  const deadline = Date.now() + 60_000;
  let lastObservation = "websocket-unavailable";
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`PACKAGED_ALPHA_EXITED_EARLY_${process.exitCode}`);
    }
    try {
      return await CdpClient.connect(endpoint);
    } catch (error) {
      lastObservation = error instanceof Error ? error.message : "socket-error";
    }
    await delay(100);
  }
  throw new Error(`PACKAGED_ALPHA_CDP_CONNECT_TIMEOUT_${lastObservation}`);
};

/**
 * A packaged wait that times out says only which condition never came true,
 * which is the least useful half of the story: the surface it was watching may
 * have thrown, rendered an error, or never navigated. This reads the renderer's
 * own state on the way out — strictly in the failure path, and never allowed to
 * replace the original diagnostic with a diagnostic-collection failure.
 */
const rendererDiagnostics = async (client) => {
  try {
    return await client.evaluate(`(() => {
      const text = (selector) =>
        document.querySelector(selector)?.textContent?.trim().slice(0, 200) ??
        null;
      return JSON.stringify({
        url: location.href,
        activeSurface:
          document.querySelector(".nav-item.active")?.getAttribute("data-surface") ??
          null,
        shellTab:
          document.querySelector(".shell-tab.active [data-shell-tab]")?.getAttribute(
            "data-shell-tab",
          ) ?? null,
        error: text(".error-banner") ?? text("[role=alert]"),
        status: text(".sync-state") ?? text(".status-line"),
        documentCanvas: document.querySelector(".document-canvas") !== null,
        documentShell: document.querySelector(".document-editor-shell") !== null,
        listItems: document.querySelectorAll("li, [data-task-row], [data-inbox-row], .list-row").length,
        bodyStart: document.body?.innerHTML?.slice(0, 600) ?? null,
      });
    })()`);
  } catch (error) {
    return `DIAGNOSTICS_UNAVAILABLE:${String(error).slice(0, 200)}`;
  }
};

const waitFor = async (client, expression, diagnosticCode) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  process.stderr.write(
    `${diagnosticCode} renderer state: ${await rendererDiagnostics(client)}\n`,
  );
  throw new Error(diagnosticCode);
};

const signalPackagedProcessTree = (child, signal) => {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child when the process group has already gone.
    }
  }
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
};

const signalInstalledAppProcesses = (signal) => {
  if (process.platform === "darwin") {
    const appBundle = path.dirname(path.dirname(path.dirname(executable)));
    spawnSync("/usr/bin/pkill", [`-${signal}`, "-f", appBundle], {
      stdio: "ignore",
      timeout: 5_000,
    });
  } else if (process.platform === "win32") {
    spawnSync(
      "taskkill.exe",
      [
        "/IM",
        path.basename(executable),
        "/T",
        ...(signal === "KILL" ? ["/F"] : []),
      ],
      { stdio: "ignore", timeout: 5_000 },
    );
  }
};

const removeSmokeSingletonArtifacts = (browserUserData) => {
  for (const name of [
    "DevToolsActivePort",
    "SingletonCookie",
    "SingletonLock",
    "SingletonSocket",
  ]) {
    fs.rmSync(path.join(browserUserData, name), {
      force: true,
      recursive: true,
    });
  }
};

const stopPackagedApp = async (client, child, browserUserData) => {
  await Promise.race([
    client.sendBrowser("Browser.close").catch(() => undefined),
    delay(1_000),
  ]);
  client.close();
  const waitForExit = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null || child.signalCode !== null) return true;
      await delay(50);
    }
    return false;
  };
  await waitForExit();
  signalPackagedProcessTree(child, "SIGTERM");
  signalInstalledAppProcesses("TERM");
  await delay(500);
  signalPackagedProcessTree(child, "SIGKILL");
  signalInstalledAppProcesses("KILL");
  if (!(await waitForExit())) throw new Error("PACKAGED_ALPHA_DID_NOT_EXIT");
  child.stdout.destroy();
  child.stderr.destroy();
  removeSmokeSingletonArtifacts(browserUserData);
  if (process.platform === "darwin") {
    fs.rmSync(browserUserData, { force: true, recursive: true });
  }
};

const directContextState = async (client, workspaceId) =>
  client.evaluate(`(async () => {
    const bootstrap = await window.constellation.runQuery({
      contractVersion: 1,
      queryName: "workspace.bootstrapContext",
      queryId: crypto.randomUUID(),
      workspaceId: ${JSON.stringify(workspaceId)},
      consistency: "local_authoritative",
      parameters: {}
    });
    const spaceId = bootstrap.kind === "query_result" &&
      bootstrap.result.outcome === "success" &&
      bootstrap.result.projection.kind === "workspace.bootstrapContext"
        ? bootstrap.result.projection.spaces[0]?.id
        : undefined;
    if (spaceId === undefined) return { outcome: "bootstrap_failed", bootstrap };
    const query = await window.constellation.runQuery({
      contractVersion: 1,
      queryName: "work.overview",
      queryId: crypto.randomUUID(),
      workspaceId: ${JSON.stringify(workspaceId)},
      consistency: "local_authoritative",
      parameters: { spaceId }
    });
    if (
      query.kind !== "query_result" ||
      query.result.outcome !== "success" ||
      query.result.projection.kind !== "work.overview"
    ) return { outcome: "unavailable", query };
    const task = query.result.projection.tasks.find(
      (item) => item.title === ${JSON.stringify(taskTitle)}
    );
    return {
      outcome: task === undefined ? "task_missing" : "success",
      areaIds: task?.areaIds ?? [],
      initiativeIds: task?.initiativeIds ?? [],
      directTypes: (task?.directContextRelations ?? [])
        .map((relation) => relation.relationType)
        .sort(),
      projectIds: task?.projectIds ?? []
    };
  })()`);

const assertDirectContextState = (state, phase) => {
  if (
    state.outcome !== "success" ||
    state.areaIds.join(",") !== directAreaId ||
    state.initiativeIds.join(",") !== directInitiativeId ||
    state.directTypes.join(",") !==
      "task_advances_initiative,task_contributes_to_area" ||
    state.projectIds.length !== 0
  ) {
    throw new Error(
      `PACKAGED_ALPHA_DIRECT_CONTEXT_${phase.toUpperCase()}_INVALID:${JSON.stringify(state)}`,
    );
  }
};

const createDirectContext = async (client, workspaceId) =>
  client.evaluate(`(async () => {
    const bootstrap = await window.constellation.runQuery({
      contractVersion: 1,
      queryName: "workspace.bootstrapContext",
      queryId: crypto.randomUUID(),
      workspaceId: ${JSON.stringify(workspaceId)},
      consistency: "local_authoritative",
      parameters: {}
    });
    const spaceId = bootstrap.kind === "query_result" &&
      bootstrap.result.outcome === "success" &&
      bootstrap.result.projection.kind === "workspace.bootstrapContext"
        ? bootstrap.result.projection.spaces[0]?.id
        : undefined;
    if (spaceId === undefined) return { outcome: "bootstrap_failed", bootstrap };
    const tasks = await window.constellation.runQuery({
      contractVersion: 1,
      queryName: "task.list",
      queryId: crypto.randomUUID(),
      workspaceId: ${JSON.stringify(workspaceId)},
      consistency: "local_authoritative",
      parameters: { spaceId }
    });
    if (
      tasks.kind !== "query_result" ||
      tasks.result.outcome !== "success" ||
      tasks.result.projection.kind !== "task.list"
    ) return { outcome: "task_query_failed", tasks };
    const task = tasks.result.projection.items.find(
      (item) => item.title === ${JSON.stringify(taskTitle)}
    );
    if (task === undefined) return { outcome: "task_missing" };
    const execute = (commandName, payload, expectedVersions) =>
      window.constellation.executeCommand({
        contractVersion: 1,
        commandName,
        commandId: crypto.randomUUID(),
        workspaceId: ${JSON.stringify(workspaceId)},
        idempotencyKey: crypto.randomUUID(),
        expectedVersions,
        correlationId: crypto.randomUUID(),
        payload
      });
    const area = await execute("area.create", {
      areaId: ${JSON.stringify(directAreaId)},
      spaceId: task.spaceId,
      title: "Packaged direct Area",
      responsibility: "Prove direct context survives relaunch."
    }, {});
    const initiative = await execute("initiative.create", {
      initiativeId: ${JSON.stringify(directInitiativeId)},
      spaceId: task.spaceId,
      title: "Packaged direct Initiative",
      intendedOutcome: "Both typed relations survive encrypted restart."
    }, {});
    const areaRelation = await execute("record.relate", {
      relationType: "task_contributes_to_area",
      taskId: task.id,
      areaId: ${JSON.stringify(directAreaId)}
    }, { [task.id]: task.version, [${JSON.stringify(directAreaId)}]: 1 });
    const initiativeRelation = await execute("record.relate", {
      relationType: "task_advances_initiative",
      taskId: task.id,
      initiativeId: ${JSON.stringify(directInitiativeId)}
    }, { [task.id]: task.version, [${JSON.stringify(directInitiativeId)}]: 1 });
    return {
      outcome: [area, initiative, areaRelation, initiativeRelation].every(
        (result) => result.kind === "command_outcome" && result.outcome.outcome === "success"
      ) ? "success" : "failed",
      results: [area, initiative, areaRelation, initiativeRelation]
    };
  })()`);

const run = async (phase, recoveryCode, expectedWorkspaceId, failpoint) => {
  // Non-macOS safeStorage binds its protected material to Chromium's profile.
  // Keep that profile across relaunch phases while macOS uses isolated profiles
  // to avoid stale singleton/CDP state; macOS key custody lives in Keychain.
  const browserUserData =
    process.platform === "darwin"
      ? path.join(
          stateRoot,
          "browser-data",
          `${phase}-${process.pid}-${Date.now()}`,
        )
      : path.join(stateRoot, "browser-data", "profile-bound-safe-storage");
  removeSmokeSingletonArtifacts(browserUserData);
  let stdout = "";
  let stderr = "";
  const launchedAt = performance.now();
  const packagedProcess = spawn(
    executable,
    [
      `--user-data-dir=${browserUserData}`,
      ...(process.platform === "darwin"
        ? ["--remote-debugging-pipe"]
        : [
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=0",
          ]),
    ],
    {
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio:
        process.platform === "darwin"
          ? ["ignore", "pipe", "pipe", "pipe", "pipe"]
          : ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CONSTELLATION_ALPHA_STATE_ROOT: applicationStateRoot,
        CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT: recoverySmokeRoot,
        ...(failpoint === undefined
          ? {}
          : { CONSTELLATION_ALPHA_RECOVERY_FAILPOINT: failpoint }),
      },
    },
  );
  packagedProcess.stdout.setEncoding("utf8");
  packagedProcess.stderr.setEncoding("utf8");
  packagedProcess.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  packagedProcess.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let client;
  try {
    client =
      process.platform === "darwin"
        ? CdpClient.connectPipe(
            packagedProcess.stdio[4],
            packagedProcess.stdio[3],
          )
        : await connectToBrowser(packagedProcess, browserUserData);
    await waitForPage(client);
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await waitFor(
      client,
      `document.querySelector(".desktop-shell, .recovery-required-state") !== null`,
      "PACKAGED_ALPHA_UI_NOT_READY",
    );
    const shellReadyMs = performance.now() - launchedAt;
    if (shellReadyMs > PACKAGED_STARTUP_BUDGET_MS) {
      throw new Error(`PACKAGED_ALPHA_STARTUP_BUDGET_EXCEEDED_${shellReadyMs}`);
    }
    const boundary = await client.evaluate(`(async () => {
      const build = await window.constellation.getBuildInfo();
      const dataHome = await window.constellation.getDataHomeStatus();
      const release = await window.constellation.getReleaseStatus();
      return {
        build,
        dataHome,
        release,
        bridgeKeys: Object.keys(window.constellation).sort(),
        hasNodeRequire: typeof window.require !== "undefined"
      };
    })()`);
    if (
      boundary.build.channel !== "local-alpha" ||
      boundary.build.persistence !== "encrypted-local" ||
      boundary.build.workspaceAvailability !==
        (phase === "restore-confirm" ? "recovery_required" : "ready") ||
      boundary.hasNodeRequire ||
      boundary.bridgeKeys.join(",") !== PACKAGED_BRIDGE_KEYS.join(",")
    ) {
      throw new Error(
        `PACKAGED_ALPHA_PRELOAD_OR_IPC_INVALID:${JSON.stringify(boundary)}`,
      );
    }
    if (
      boundary.release.kind !== "unavailable" ||
      boundary.release.reason !== "mechanism_only_build" ||
      boundary.release.currentVersion !== boundary.build.version
    ) {
      throw new Error("PACKAGED_ALPHA_RELEASE_BOUNDARY_INVALID");
    }
    const dataHome = boundary.dataHome;
    if (
      dataHome.descriptor.providerId !== "constellation.local-only/v1" ||
      dataHome.descriptor.providerKind !== "local_only" ||
      dataHome.descriptor.storageRole !== "canonical" ||
      dataHome.descriptor.location !== "this_device" ||
      dataHome.descriptor.encryption.atRest !== "sqlcipher" ||
      dataHome.syncState !== "not_configured" ||
      dataHome.quota.state !== "unknown" ||
      dataHome.descriptor.capabilities.checkpoints.support !== "supported" ||
      dataHome.descriptor.capabilities.portable_export.support !==
        "supported" ||
      dataHome.descriptor.capabilities.portable_import.support !==
        "supported" ||
      dataHome.descriptor.capabilities.provider_migration.support !==
        "supported" ||
      dataHome.descriptor.capabilities.ordered_changes.support !==
        "unsupported" ||
      dataHome.descriptor.capabilities.tombstones.support !== "unsupported" ||
      dataHome.descriptor.capabilities.attachments.support !== "supported" ||
      dataHome.descriptor.capabilities.quota.support !== "unsupported" ||
      dataHome.descriptor.capabilities.device_revocation.support !==
        "unsupported" ||
      dataHome.availability !==
        (phase === "restore-confirm" ? "recovery_required" : "available") ||
      (phase === "restore-confirm"
        ? dataHome.descriptor.workspaceId !== undefined
        : dataHome.descriptor.workspaceId !== boundary.build.initialWorkspaceId)
    ) {
      throw new Error("PACKAGED_ALPHA_DATA_HOME_CONTRACT_INVALID");
    }

    if (phase !== "restore-confirm") {
      // RÓWNOŚĆ ZBIORU, WYPROWADZONA — nie przypięta liczba. Od fali E lista
      // pochodzi z `desktopNavigationSurfaceIds`, a nie z całego rejestru:
      // Ustawienia są TRYBEM i wchodzi się w nie kołem zębatym, więc
      // porównanie z całym rejestrem czekałoby tu na pozycję, której powłoka
      // celowo nie rysuje. Do fali E przechodziło TYLKO dlatego, że filtr
      // lewej kolumny nie odsiewał niczego — czyli ta asercja przez dwie fale
      // potwierdzała defekt.
      await waitFor(
        client,
        `document.querySelector(".capture-dock") !== null && document.querySelector("[data-settings-entry]") !== null && JSON.stringify([...document.querySelectorAll(".nav-item[data-surface]")].map((item) => item.dataset.surface).sort()) === ${JSON.stringify(JSON.stringify([...desktopNavigationSurfaceIds].sort()))}`,
        "PACKAGED_ALPHA_OPERATIONAL_SHELL_NOT_READY",
      );
      const shellAccessibility = await client.evaluate(`(() => {
        const main = document.querySelector("main");
        const attention = document.querySelector(
          '.nav-item[data-surface="inbox"]'
        );
        const attentionCount = attention?.querySelector(".nav-count")?.textContent?.trim();
        const ids = [...document.querySelectorAll("[id]")].map(
          (element) => element.id
        );
        return {
          language: document.documentElement.lang,
          mainCount: document.querySelectorAll("main").length,
          mainIsWorkColumn: main?.classList.contains("work-column") ?? false,
          sidebarInsideMain: Boolean(main?.querySelector(".sidebar")),
          inspectorInsideMain: Boolean(main?.querySelector(".inspector")),
          sidebarLabel: document.querySelector(".sidebar")?.getAttribute("aria-label"),
          attentionName: attention?.getAttribute("aria-label"),
          attentionCount,
          duplicateIds: [...new Set(
            ids.filter((id, index) => ids.indexOf(id) !== index)
          )]
        };
      })()`);
      if (
        // Interfejs jest po angielsku od przebudowy 0.2.0, więc `lang` musi to
        // mówić — czytnik ekranu wymawia treść według tego atrybutu, a angielskie
        // zdanie czytane polską fonetyką jest niezrozumiałe. To jedyne miejsce
        // w smoke'ach, gdzie język był wpisany na sztywno, i wyszło dopiero na
        // paczkowanym buildzie: grep po polskich znakach go nie łapie.
        shellAccessibility.language !== "en" ||
        shellAccessibility.mainCount !== 1 ||
        !shellAccessibility.mainIsWorkColumn ||
        shellAccessibility.sidebarInsideMain ||
        shellAccessibility.inspectorInsideMain ||
        !shellAccessibility.sidebarLabel ||
        shellAccessibility.duplicateIds.length > 0 ||
        (shellAccessibility.attentionCount &&
          !shellAccessibility.attentionName?.includes(
            shellAccessibility.attentionCount,
          ))
      ) {
        throw new Error(
          `PACKAGED_ALPHA_SHELL_ACCESSIBILITY_INVALID:${JSON.stringify(shellAccessibility)}`,
        );
      }

      await client.send("Page.bringToFront");
      const favoriteKeyboardPath = await client.evaluate(`(() => {
        const item = document.querySelector(".nav-item[data-surface].active");
        const favorite = item?.parentElement?.querySelector(
          ".nav-favorite-toggle"
        );
        const pressedBefore = favorite?.getAttribute("aria-pressed");
        favorite?.focus();
        const favoriteFocused = document.activeElement === favorite;
        favorite?.click();
        return {
          activeItemPresent: item !== null,
          favoriteFocused,
          favoriteTag: favorite?.tagName,
          favoriteDisabled: favorite?.hasAttribute("disabled"),
          favoriteTabIndex: favorite?.tabIndex,
          favoriteDisplay: favorite ? getComputedStyle(favorite).display : null,
          favoriteFollowsItem: Boolean(
            item &&
              favorite &&
              item.compareDocumentPosition(favorite) &
                Node.DOCUMENT_POSITION_FOLLOWING
          ),
          pressedBefore,
          viewportWidth: innerWidth
        };
      })()`);
      await client.evaluate(`new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )`);
      const favoritePressedAfter = await client.evaluate(`document
        .querySelector(".nav-item[data-surface].active")
        ?.parentElement
        ?.querySelector(".nav-favorite-toggle")
        ?.getAttribute("aria-pressed")`);
      if (
        !favoriteKeyboardPath.activeItemPresent ||
        favoriteKeyboardPath.favoriteTag !== "BUTTON" ||
        favoriteKeyboardPath.favoriteDisabled ||
        favoriteKeyboardPath.favoriteTabIndex !== 0 ||
        favoriteKeyboardPath.favoriteDisplay === "none" ||
        !favoriteKeyboardPath.favoriteFollowsItem ||
        favoritePressedAfter === favoriteKeyboardPath.pressedBefore
      ) {
        throw new Error(
          `PACKAGED_ALPHA_FAVORITE_KEYBOARD_PATH_MISSING:${JSON.stringify({
            ...favoriteKeyboardPath,
            favoritePressedAfter,
          })}`,
        );
      }

      const textScalingSurfaces = await client.evaluate(`(async () => {
        const results = [];
        document.documentElement.style.fontSize = "200%";
        try {
          // Powłoka potrafi PODMIENIĆ lewą kolumnę: w trybie Ustawień nawigacja
          // po pracy nie jest renderowana wcale. Iterowanie po zebranym raz
          // zbiorze węzłów oznaczałoby klikanie w elementy odpięte od dokumentu,
          // które nigdy nie staną się aktywne — każdy dobiłby do pełnego limitu
          // 3 s i całe wywołanie CDP padłoby na timeout, komunikatem bez związku
          // z przyczyną. Chodzimy więc po IDENTYFIKATORACH i za każdym razem
          // szukamy pozycji od nowa, wracając z trybu, jeśli w nim jesteśmy.
          const destinations = [...document.querySelectorAll(
            ".nav-item[data-surface]"
          )].map((item) => item.dataset.surface);
          for (const surfaceId of destinations) {
            const leaveMode = document.querySelector("[data-settings-back]");
            if (leaveMode !== null) {
              leaveMode.click();
              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
              );
            }
            const destination = document.querySelector(
              '.nav-item[data-surface="' + surfaceId + '"]'
            );
            if (destination === null) continue;
            destination.click();
            const readyDeadline = performance.now() + 3000;
            const hasMissingAriaReference = () =>
              [...document.querySelectorAll(
                "[aria-labelledby], [aria-describedby], [aria-controls]"
              )].some((element) =>
                ["aria-labelledby", "aria-describedby", "aria-controls"].some(
                  (attribute) =>
                    (element.getAttribute(attribute) ?? "")
                      .split(/\\s+/u)
                      .filter(Boolean)
                      .some((id) => document.getElementById(id) === null)
                )
              );
            while (
              (!destination.classList.contains("active") ||
                document.querySelector('#main-content[role="tabpanel"] [aria-busy="true"]') ||
                hasMissingAriaReference()) &&
              performance.now() < readyDeadline
            ) {
              await new Promise((resolve) => setTimeout(resolve, 25));
            }
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
            const work = document.querySelector('#main-content[role="tabpanel"]');
            // WSZYSTKIE WIDOCZNE KORZENIE, nie pierwszy — patrz nota przy tym
            // samym wyliczeniu w zamiataniu 320 px niżej. Ekran przepięty
            // w locie D10 ma ich troje (pasmo, pasek widoku, przewijane
            // pudełko), a przy 200% tekstu to WŁAŚNIE pasma się zawijają: sweep
            // po pierwszym korzeniu widziałby tu 40-pikselowy pasek i wracał
            // zielony nad przepełnieniem w pudełku pod nim.
            const roots = [...(work?.children ?? [])].filter(
              (element) =>
                element.getClientRects().length > 0 &&
                !element.classList.contains("shell-tabbar") &&
                !element.classList.contains("capture-dock")
            );
            const overflowingDescendants = roots
              .flatMap((root) => [root, ...root.querySelectorAll("*")])
              .filter(
                (element) =>
                  element.getClientRects().length > 0 &&
                  element.scrollWidth > element.clientWidth + 1
              )
              .slice(0, 8)
              .map((element) => ({
                tag: element.tagName.toLowerCase(),
                className: element.getAttribute("class"),
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth
              }));
            // Ta sama reguła co niżej: jeden wiersz na etykietę, więc wskazuje
            // korzeń przepełniający się NAJMOCNIEJ.
            const surface = roots.reduce(
              (worst, element) =>
                worst === undefined ||
                element.scrollWidth - element.clientWidth >
                  worst.scrollWidth - worst.clientWidth
                  ? element
                  : worst,
              undefined
            );
            results.push({
              surface: destination.dataset.surface,
              documentWidth: document.documentElement.scrollWidth,
              viewportWidth: innerWidth,
              surfacePresent: surface !== undefined,
              surfaceRoots: roots.length,
              surfaceWidth: surface?.scrollWidth,
              surfaceClientWidth: surface?.clientWidth,
              overflowingDescendants
            });
          }
        } finally {
          document.documentElement.style.fontSize = "";
          // Wyjście z trybu Ustawień PRZED powrotem na Today: w trybie pozycji
          // "today" nie ma w dokumencie, więc samo kliknięcie byłoby no-opem
          // i petla zostawilaby aplikacje w Ustawieniach.
          document.querySelector("[data-settings-back]")?.click();
          document.querySelector('.nav-item[data-surface="today"]')?.click();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
        }
        return results;
      })()`);
      const invalidTextScalingSurface = textScalingSurfaces.find(
        (surface) =>
          !surface.surfacePresent ||
          surface.documentWidth > surface.viewportWidth ||
          surface.surfaceWidth > surface.surfaceClientWidth,
      );
      if (invalidTextScalingSurface !== undefined) {
        throw new Error(
          `PACKAGED_ALPHA_TEXT_SCALING_INVALID:${JSON.stringify(invalidTextScalingSurface)}`,
        );
      }
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: 320,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      try {
        // CZEKANIE NA STAN USTALONY, NIE NA DWIE KLATKI — i to jest poprawka
        // PRZYRZĄDU, opłacona trzema czerwonymi przebiegami CI.
        //
        // Dwie klatki po nałożeniu metryk urządzenia ta bramka mierzyła układ
        // W TRAKCIE PRZELICZANIA i raportowała stan, który nie może istnieć.
        // Zmierzone, wprost z jej własnej diagnostyki:
        //
        //   --sidebar-width       3.25rem      (szyna ZADZIAŁAŁA)
        //   grid-template-columns 220px 100px  (tor trzyma szerokość SPRZED)
        //
        // Jedna powłoka, klasa "rail" na miejscu, token rozwiązany na 52 px,
        // a użyta wartość toru to 220 px. Stan ustalony nie może nieść obu
        // liczb naraz. Stąd brały się wszystkie trzy odmowy: dok o szerokości
        // 26 px to dok w kolumnie pracy szerokiej na 100 px, a nie na 268.
        // Pierwszy przebieg złapał moment jeszcze wcześniejszy — dok pod
        // adresem x=475 przy oknie 320 px.
        //
        // Harness deweloperski NIGDY tego nie odtworzył, w żadnej kolejności
        // (ładowanie od razu wąsko, zwężanie po ułożeniu, oba motywy), bo
        // `setViewportSize` Playwrighta czeka na zastosowanie zmiany, a
        // `Emulation.setDeviceMetricsOverride` przez CDP nie.
        //
        // WARUNEK JEST NA ZGODNOŚCI DWÓCH ODCZYTÓW, nie na czasie: tor siatki
        // ma się zgadzać z rozwiązanym tokenem. Uśpienie na stałą liczbę
        // milisekund przeszłoby tu tak samo i zgniło przy pierwszej wolniejszej
        // maszynie — to jest ta sama rodzina co „asercja mierząca CZAS zamiast
        // ZDARZENIA", którą to repozytorium już raz zapłaciło.
        //
        // NIEUSTALENIE SIĘ JEST AWARIĄ PRZYRZĄDU, nie werdyktem o układzie:
        // rzuca własną nazwą, żeby czytający nie wziął jej za defekt ekranu.
        const settled = await client.evaluate(`(async () => {
          const frame = () => new Promise((r) => requestAnimationFrame(r));
          const read = () => {
            const shell = document.querySelector(".desktop-shell");
            if (!shell) return null;
            const style = getComputedStyle(shell);
            const rail = style.getPropertyValue("--sidebar-width").trim();
            const track = style.gridTemplateColumns.split(" ")[0];
            const rem = Number.parseFloat(
              getComputedStyle(document.documentElement).fontSize
            );
            const wanted = rail.endsWith("rem")
              ? Number.parseFloat(rail) * rem
              : Number.parseFloat(rail);
            const used = Number.parseFloat(track);
            return { rail, track, wanted, used, agrees: Math.abs(wanted - used) <= 1 };
          };
          for (let attempt = 0; attempt < 120; attempt += 1) {
            await frame();
            const state = read();
            if (state === null) continue;
            if (state.agrees) return { settled: true, attempts: attempt + 1, ...state };
          }
          return { settled: false, attempts: 120, ...(read() ?? {}) };
        })()`);
        if (settled.settled !== true) {
          throw new Error(
            `PACKAGED_ALPHA_NARROW_SHELL_NOT_SETTLED:${JSON.stringify(settled)}`,
          );
        }
        const narrowShell = await client.evaluate(`(() => {
          const shell = document.querySelector(".desktop-shell");
          const work = document.querySelector('#main-content[role="tabpanel"]');
          const dock = document.querySelector(".capture-dock");
          const dockLabel = document.querySelector(".capture-dock-label");
          const detach = document.querySelector(".shell-detach");
          const targets = [...document.querySelectorAll(
            ".search-control, .nav-item, .capture-dock"
          )].filter((element) => element.getClientRects().length > 0);
          const favorites = [...document.querySelectorAll(".nav-favorite-toggle")];
          const withinViewport = (element) => {
            const rect = element.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth + 1;
          };
          return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            shellWidth: shell?.getBoundingClientRect().width,
            workWithinViewport: work ? withinViewport(work) : false,
            dockWithinViewport: dock ? withinViewport(dock) : false,
            detachWithinViewport: detach ? withinViewport(detach) : false,
            dockLabelTruncatesCleanly: dockLabel
              ? dockLabel.scrollWidth <= dockLabel.clientWidth ||
                getComputedStyle(dockLabel).textOverflow === "ellipsis"
              : false,
            dockRect: dock
              ? (() => {
                  const rect = dock.getBoundingClientRect();
                  return { left: rect.left, right: rect.right, width: rect.width };
                })()
              : null,
            targetsAreLargeEnough: targets.every((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width >= 44 && rect.height >= 44;
            }),
            undersizedTargets: targets
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  className: element.className,
                  width: rect.width,
                  height: rect.height
                };
              })
              .filter(({ width, height }) => width < 44 || height < 44),
            favoritesHidden: favorites.every(
              (element) => element.getClientRects().length === 0
            ),
            // DLACZEGO ODMOWA NIESIE POMIAR, A NIE SAMĄ LICZBĘ. Ta bramka
            // zwróciła „dok ma 26 px szerokości" na paczce, a ten sam dok mierzy
            // 244 px na harnessie deweloperskim — przy tej samej szerokości
            // okna, tym samym arkuszu i tej samej kolejności (szeroko, potem
            // wąsko). Różnicy nie da się odtworzyć poza paczką, a paczkowany
            // smoke ODMAWIA uruchomienia lokalnie na macOS, żeby nie wywołać
            // promptu Keychaina. Jedynym przyrządem jest więc CI, a przebieg CI
            // oddający wyłącznie „26" nie mówi, czy zwęził się przycisk, czy
            // jego pojemnik.
            //
            // Te pola są tu po to, żeby JEDEN czerwony przebieg wystarczył:
            // szerokość pojemnika rozstrzyga między "width: 100% z czegoś
            // wąskiego" a "coś nadpisało width", a display i szerokość etykiety
            // mówią, czy treść w ogóle się rysuje.
            //
            // ŻADNYCH BACKTICKÓW W TYM KOMENTARZU — cały ten blok jest wnętrzem
            // literału szablonowego przekazywanego do przeglądarki, więc jeden
            // backtick w prozie zamyka string i plik przestaje się parsować.
            // Złapane przez eslint przy pierwszej wersji tej diagnostyki.
            dockDiagnostic: dock
              ? (() => {
                  const layer = dock.parentElement;
                  const styleOf = (el) => {
                    const s = getComputedStyle(el);
                    return {
                      display: s.display,
                      width: s.width,
                      maxWidth: s.maxWidth,
                      flex: s.flex,
                      overflow: s.overflow
                    };
                  };
                  return {
                    dock: styleOf(dock),
                    layer: layer
                      ? {
                          ...styleOf(layer),
                          rectWidth: layer.getBoundingClientRect().width
                        }
                      : null,
                    main: (() => {
                      const m = dock.closest("main");
                      return m
                        ? { ...styleOf(m), rectWidth: m.getBoundingClientRect().width }
                        : null;
                    })(),
                    // CO ROZSTRZYGA MIĘDZY DEFEKTEM PRODUKTU A DEFEKTEM
                    // PRZYRZĄDU, i dlaczego to jest JEDNO pytanie, nie dwa.
                    // Poprzedni przebieg oddał main o szerokości 100 px przy
                    // oknie 320 px. 220 + 100 = 320, a 220 to spoczynkowa
                    // szerokość lewej kolumny — czyli szyna się NIE ZWINĘŁA
                    // i kolumna zabrała pracy wszystko poza setką.
                    // Na harnessie przy tej samej szerokości kolumna schodzi do
                    // 52 px, a praca dostaje 268 — i schodzi tak samo, gdy
                    // strona ładuje się od razu wąska, i gdy zwęża się po
                    // ułożeniu. Zostaje więc pytanie, czy to paczka nie wchodzi
                    // w szynę, czy nakładka metryk urządzenia nie doprowadza
                    // do niej stanu, który zwykłe okno by dostało.
                    // Klasa powłoki mówi to wprost: jest w niej "rail", albo
                    // jej nie ma.
                    shellClassName: (() => {
                      const s = document.querySelector(".desktop-shell");
                      return s ? s.className : null;
                    })(),
                    sidebarRectWidth: (() => {
                      const s = document.querySelector(".sidebar");
                      return s ? s.getBoundingClientRect().width : null;
                    })(),
                    // TRZECIE PYTANIE, I OSTATNIE, KTÓRE UMIEM ZADAĆ Z DALEKA.
                    // Poprzedni przebieg wykluczył dwie hipotezy naraz: klasa
                    // powłoki NIESIE "rail", a mimo to lewa kolumna mierzy
                    // 220 px, czyli spoczynkowe 13.75rem. W zbudowanym arkuszu
                    // (sprawdzone w dist) blok ":root,[data-theme=dark]" definiuje
                    // oba tokeny, a reguła ".desktop-shell.rail" nadpisuje
                    // szerokość PÓŹNIEJ, więc kaskada jest po stronie szyny.
                    // Ten sam stan na harnessie, w tym samym motywie ciemnym,
                    // oddaje 3.25rem i kolumnę 52 px.
                    //
                    // Zostaje jedno wyjaśnienie zgodne ze wszystkimi liczbami:
                    // mierzone są DWIE RÓŻNE powłoki — klasa czytana z pierwszej
                    // w dokumencie, a dok żyje w innej. Dlatego pytamy o token
                    // rozwiązany na powłoce DOKU, nie na pierwszej znalezionej,
                    // i o to, ile powłok w ogóle jest.
                    shellCount: document.querySelectorAll(".desktop-shell").length,
                    dockShellClassName: (() => {
                      const s = dock.closest(".desktop-shell");
                      return s ? s.className : null;
                    })(),
                    dockShellTokens: (() => {
                      const s = dock.closest(".desktop-shell");
                      if (!s) return null;
                      const cs = getComputedStyle(s);
                      return {
                        sidebarWidth: cs.getPropertyValue("--sidebar-width").trim(),
                        sidebarRail: cs.getPropertyValue("--sidebar-rail").trim(),
                        gridTemplateColumns: cs.gridTemplateColumns
                      };
                    })(),
                    labelDisplay: dockLabel ? getComputedStyle(dockLabel).display : null,
                    labelRectWidth: dockLabel
                      ? dockLabel.getBoundingClientRect().width
                      : null,
                    contentRectWidth: (() => {
                      const c = document.querySelector(".capture-dock-content");
                      return c ? c.getBoundingClientRect().width : null;
                    })()
                  };
                })()
              : null
          };
        })()`);
        if (
          narrowShell.viewportWidth !== 320 ||
          narrowShell.documentWidth > 320 ||
          narrowShell.shellWidth > 320 ||
          !narrowShell.workWithinViewport ||
          !narrowShell.dockWithinViewport ||
          !narrowShell.detachWithinViewport ||
          !narrowShell.dockLabelTruncatesCleanly ||
          !narrowShell.targetsAreLargeEnough ||
          !narrowShell.favoritesHidden
        ) {
          throw new Error(
            `PACKAGED_ALPHA_NARROW_SHELL_INVALID:${JSON.stringify(narrowShell)}`,
          );
        }

        const narrowSurfaces = await client.evaluate(`(async () => {
          const results = [];
          const controlSelector = [
            "button:not(:disabled)",
            "a[href]",
            "input:not(:disabled)",
            "select:not(:disabled)",
            "textarea:not(:disabled)",
            '[tabindex]:not([tabindex="-1"])'
          ].join(",");
          const hasAccessibleName = (element) =>
            Boolean(
              element.getAttribute("aria-label")?.trim() ||
              element.getAttribute("aria-labelledby")?.trim() ||
              element.getAttribute("title")?.trim() ||
              element.labels?.length ||
              element.textContent?.trim()
            );
          // Powłoka potrafi PODMIENIĆ lewą kolumnę: w trybie Ustawień nawigacja
          // po pracy nie jest renderowana wcale. Iterowanie po zebranym raz
          // zbiorze węzłów oznaczałoby klikanie w elementy odpięte od dokumentu,
          // które nigdy nie staną się aktywne — każdy dobiłby do pełnego limitu
          // 3 s i całe wywołanie CDP padłoby na timeout, komunikatem bez związku
          // z przyczyną. Chodzimy więc po IDENTYFIKATORACH i za każdym razem
          // szukamy pozycji od nowa, wracając z trybu, jeśli w nim jesteśmy.
          const destinations = [...document.querySelectorAll(
            ".nav-item[data-surface]"
          )].map((item) => item.dataset.surface);
          for (const surfaceId of destinations) {
            const leaveMode = document.querySelector("[data-settings-back]");
            if (leaveMode !== null) {
              leaveMode.click();
              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
              );
            }
            const destination = document.querySelector(
              '.nav-item[data-surface="' + surfaceId + '"]'
            );
            if (destination === null) continue;
            destination.click();
            const readyDeadline = performance.now() + 3000;
            const hasMissingAriaReference = () =>
              [...document.querySelectorAll(
                "[aria-labelledby], [aria-describedby], [aria-controls]"
              )].some((element) =>
                ["aria-labelledby", "aria-describedby", "aria-controls"].some(
                  (attribute) =>
                    (element.getAttribute(attribute) ?? "")
                      .split(/\\s+/u)
                      .filter(Boolean)
                      .some((id) => document.getElementById(id) === null)
                )
              );
            while (
              (!destination.classList.contains("active") ||
                document.querySelector('#main-content[role="tabpanel"] [aria-busy="true"]') ||
                hasMissingAriaReference()) &&
              performance.now() < readyDeadline
            ) {
              await new Promise((resolve) => setTimeout(resolve, 25));
            }
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
            const work = document.querySelector('#main-content[role="tabpanel"]');
            // POWIERZCHNIA MOŻE MIEĆ WIĘCEJ NIŻ JEDEN KORZEŃ. Tu stało
            // \`.find()\`, czyli PIERWSZE widoczne dziecko nośnika, i to
            // twierdzenie jest fałszywe od lotu D10: pasmo tytułu, pasek widoku
            // i przewijane pudełko są od niego TROJGIEM RODZEŃSTWA, więc
            // pierwszym dzieckiem jest pasmo — pasek 40 px. Bramka układu
            // dostała tę samą poprawkę w tym samym locie
            // (\`verify-renderer-layout.mjs\`, \`measure()\`), ten skrypt jej NIE
            // dostał, i przez to zamiatał czterdziestopikselowy pasek na
            // Organizacjach i Odnowieniach, meldując pod etykietą ekranu.
            //
            // CO PRZEZ TO MILCZAŁO, a nie „co mogłoby": \`.surface-header button\`
            // nie ma dopasowania, kiedy podmiotem JEST \`.surface-header\` —
            // selektor potomka nie sięga samego korzenia — więc pusta akcja
            // pasma była nie do wykrycia. Drabina nagłówków miała wtedy jeden
            // stopień (\`h1\` pasma), a jeden stopień NIGDY nie przeskakuje, więc
            // ten sam ekran wracał zielony nad dowolną dziurą pod pasmem.
            const roots = [...(work?.children ?? [])].filter(
              (element) =>
                element.getClientRects().length > 0 &&
                !element.classList.contains("shell-tabbar") &&
                !element.classList.contains("capture-dock")
            );
            // Korzeń dopasowany przez selektor liczy się SAM ZE SIEBIE, nie
            // tylko przez potomków — inaczej wraca dokładnie ta cisza wyżej.
            const withinRoots = (selector) =>
              roots.flatMap((root) => [
                ...(root.matches(selector) ? [root] : []),
                ...root.querySelectorAll(selector)
              ]);
            // JEDEN WIERSZ NA ETYKIETĘ, więc szerokość musi wskazać jeden
            // korzeń: ten, który przepełnia się NAJMOCNIEJ. Porównanie jest
            // ostre, więc przy remisie (w tym przy zerze) wygrywa pierwszy —
            // na ekranie o jednym korzeniu wynik jest tożsamy z poprzednim.
            const surface = roots.reduce(
              (worst, element) =>
                worst === undefined ||
                element.scrollWidth - element.clientWidth >
                  worst.scrollWidth - worst.clientWidth
                  ? element
                  : worst,
              undefined
            );
            const unnamedControls = [...document.querySelectorAll(controlSelector)]
              .filter(
                (element) =>
                  element.getClientRects().length > 0 &&
                  !hasAccessibleName(element)
              )
              .map((element) => element.tagName.toLowerCase());
            const blankHeaderActions = withinRoots(".surface-header")
              .flatMap((header) => [
                ...header.querySelectorAll("button:not(:disabled)")
              ])
              .filter((element) => {
                const hasVisibleIcon = [...element.querySelectorAll("svg")].some(
                  (icon) => icon.getClientRects().length > 0
                );
                const hasVisibleText =
                  Boolean(element.textContent?.trim()) &&
                  Number.parseFloat(getComputedStyle(element).fontSize) > 0;
                return !hasVisibleIcon && !hasVisibleText;
              })
              .map((element) => element.textContent?.trim() || "unnamed");
            // Gwarancja: powierzchnia, której nie da się otworzyć, ZAWSZE proponuje
            // ponowienie. Rozpoznawana po stanie, nie po słowach — inaczej flip na
            // angielski wywala test pilnujący czegoś prawdziwego.
            const unavailableSurface = withinRoots(
              '[data-surface-state="failed"]'
            )[0];
            const unavailableWithoutRetry =
              unavailableSurface !== null &&
              unavailableSurface !== undefined &&
              unavailableSurface.querySelector('[data-surface-action="retry"]') === null;
            const ids = [...document.querySelectorAll("[id]")].map(
              (element) => element.id
            );
            const missingAriaReferences = [...document.querySelectorAll(
              "[aria-labelledby], [aria-describedby], [aria-controls]"
            )].flatMap((element) =>
              ["aria-labelledby", "aria-describedby", "aria-controls"].flatMap(
                (attribute) =>
                  (element.getAttribute(attribute) ?? "")
                    .split(/\\s+/u)
                    .filter(Boolean)
                    .filter((id) => document.getElementById(id) === null)
                    .map((id) => attribute + ":" + id)
              )
            );
            // Drabina biegnie przez WSZYSTKIE korzenie w kolejności dokumentu:
            // \`h1\` mieszka w paśmie, a sekcje pod nim w przewijanym pudełku,
            // więc drabina policzona nad jednym korzeniem nie jest drabiną
            // ekranu. Dzieci nośnika są w kolejności dokumentu, a
            // \`querySelectorAll\` też — złożenie zachowuje kolejność.
            const headingNodes = withinRoots("h1, h2, h3, h4, h5, h6");
            const headings = headingNodes.map(
              (element) => Number(element.tagName.slice(1))
            );
            // WERDYKT MÓWI, KTÓRY NAGŁÓWEK PRZESKOCZYŁ, a nie samą cyfrę jego
            // szczebla — i to jest poprawka po zdarzeniu, nie ozdoba. Do tej
            // wersji ładunek niósł \`headingJumps: [3]\`, czyli „gdzieś na tym
            // ekranie jest \`h3\` po czymś płytszym niż \`h2\`": z trzech systemów
            // CI wracała liczba, po której trzeba było dopiero ODTWARZAĆ, o który
            // nagłówek chodzi. Repozytorium ma nazwaną klasę „werdykt bez
            // pomiaru"; ten wiersz ją stąd usuwa.
            const headingJumps = headings
              .slice(1)
              .map((level, index) => ({ level, previous: headings[index], index: index + 1 }))
              .filter((step) => step.level - step.previous > 1)
              .map((step) => {
                const element = headingNodes[step.index];
                return (
                  "h" + step.previous + "→h" + step.level + " " +
                  element.tagName.toLowerCase() +
                  (element.id ? "#" + element.id : "") +
                  ' "' + (element.textContent || "").trim().slice(0, 40) + '"'
                );
              });
            results.push({
              surface: destination.dataset.surface,
              documentWidth: document.documentElement.scrollWidth,
              surfacePresent: surface !== undefined,
              surfaceRoots: roots.length,
              surfaceWidth: surface?.scrollWidth,
              surfaceClientWidth: surface?.clientWidth,
              unnamedControls,
              blankHeaderActions,
              unavailableWithoutRetry,
              duplicateIds: [...new Set(
                ids.filter((id, index) => ids.indexOf(id) !== index)
              )],
              missingAriaReferences,
              headingJumps
            });
          }
          return results;
        })()`);
        // WSZYSTKIE WADLIWE POWIERZCHNIE, NIE PIERWSZA. Tu stało `.find()`, więc
        // jeden przebieg mówił o JEDNYM ekranie — a przebieg kosztuje
        // spakowanie aplikacji i chodzi na trzech systemach. Przy rozdziale
        // Biblioteki na trzy cele (lot D3) znaczyło to, że o wadzie na drugim
        // z nich dałoby się dowiedzieć dopiero w NASTĘPNYM cyklu CI, po
        // naprawieniu pierwszej. Zbieranie kosztuje jedno słowo i oddaje cały
        // obraz naraz.
        const invalidNarrowSurfaces = narrowSurfaces.filter(
          (surface) =>
            surface.documentWidth > 320 ||
            !surface.surfacePresent ||
            surface.unnamedControls.length > 0 ||
            surface.blankHeaderActions.length > 0 ||
            surface.unavailableWithoutRetry ||
            surface.duplicateIds.length > 0 ||
            surface.missingAriaReferences.length > 0 ||
            surface.headingJumps.length > 0,
        );
        if (invalidNarrowSurfaces.length > 0) {
          throw new Error(
            `PACKAGED_ALPHA_NARROW_SURFACE_INVALID:${JSON.stringify(invalidNarrowSurfaces)}`,
          );
        }

        // Ustawienia są TRYBEM (#31), więc nie ma ich w zamiataniu wyżej —
        // wchodzi się do nich kołem zębatym, nie pozycją `data-surface`.
        // TO ZDANIE JEST PRAWDZIWE OD FALI E, i do niej nie było: powłoka
        // rysowała pozycję `data-surface="settings"` mimo filtra, który miał ją
        // odsiać. Nośnikiem jest dziś pole `chrome` w rejestrze, a zamiatanie
        // wyżej porównuje się z `desktopNavigationSurfaceIds`.
        // Gwarancja jest jedna i przeżywa każdą zmianę układu: ŻADNA KATEGORIA
        // NIE STAJE SIĘ NIEOSIĄGALNA. Poniżej 58rem sticky nawigator się zwija,
        // a rolę przejmuje kontrolka natywna — to jest dokładnie ten przypadek,
        // którego happy-dom nie zmierzy, bo nie liczy układu. Asercja o
        // szerokości w środowisku bez układu wyglądałaby na pomiar, nie będąc
        // nim; tutaj okno naprawdę ma 320 px.
        const settingsReach = await client.evaluate(`(async () => {
          const frame = () => new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
          const visible = (element) =>
            element !== null &&
            element !== undefined &&
            element.getClientRects().length > 0;
          const entry = document.querySelector("[data-settings-entry]");
          if (!visible(entry)) return { entered: false, unreachable: [], categories: [] };
          entry.click();
          await frame();
          const deadline = performance.now() + 3000;
          while (
            document.querySelector("[data-settings-category]") === null &&
            performance.now() < deadline
          ) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          await frame();
          const categories = [...document.querySelectorAll("[data-settings-category]")]
            .map((element) => element.dataset.settingsCategory);
          // BIEŻĄCA SEKCJA CZYTANA Z DEKLARACJI. Do lotu 6 stała jako
          // aria-current na pozycji nawigatora rysowanego przez sam ekran;
          // nawigator Ustawień jest teraz JEDEN i stoi w powłoce
          // (.settings-mode-column), a przy 320 px powłoka zwija lewą kolumnę
          // do szyny ikon i spis sekcji w niej nie stoi. Odczyt znacznika
          // z nawigatora zwracałby więc null przy KAŻDEJ kategorii i cała
          // ta kontrola raportowałaby, że nic nie jest osiągalne — mierząc
          // szerokość okna zamiast osiągalności.
          // (Komentarz bez apostrofów odwrotnych ŚWIADOMIE: cały ten blok
          // jest literałem szablonowym, więc apostrof odwrotny zamknąłby go
          // w połowie zdania.)
          //
          // KTÓRA GAŁĄŹ TU CHODZI, POWIEDZIANE WPROST, BO PRZY 320 PX CHODZI
          // TYLKO JEDNA. Powłoka zwija lewą kolumnę pod
          // @media (max-width: 50rem), a spis sekcji dostaje tam display: none
          // — więc getClientRects() wpisu sekcji jest puste, visible(navButton)
          // jest fałszem i gałąź nawigatora NIE WYKONUJE SIĘ ANI RAZU. Cała
          // osiągalność mierzona w tym oknie jest osiągalnością przez
          // kontrolkę natywną. Selektor .settings-mode-column
          // [data-settings-section] jest tu pisany dla POPRAWNOŚCI drugiej
          // gałęzi, a nie dlatego, że ten przelot ją sprawdza — kto go zmieni,
          // nie dowie się tego stąd.
          //
          // I DRUGA RZECZ DLA TEGO, KTO KIEDYŚ URUCHOMI TO SZERZEJ: obie
          // gałęzie pytają current(), czyli deklarację ekranu, ale ustawiają
          // DWA RÓŻNE fakty. Kontrolka natywna woła navigateToCategory, które
          // ustawia activeCategory synchronicznie i deklaracja zmienia się
          // w tej samej klatce. Wpis kolumny ustawia settingsCategory
          // W POWŁOCE i przewija; deklaracja idzie za obserwatorem przecięć,
          // więc jedno await frame() może nie wystarczyć i gałąź nawigatora
          // mierzyłaby czas obserwatora, a nie osiągalność.
          const current = () =>
            document
              .querySelector("[data-settings-active-category]")
              ?.getAttribute("data-settings-active-category") ?? null;
          const unreachable = [];
          for (const id of categories) {
            const navButton = document.querySelector(
              '.settings-mode-column [data-settings-section="' + id + '"]'
            );
            const picker = document.getElementById("settings-category-select");
            let reached = false;
            if (visible(navButton)) {
              navButton.click();
              await frame();
              reached = current() === id;
            } else if (visible(picker)) {
              // Kontrolka natywna musi NAPRAWDĘ przestawiać bieżącą kategorię,
              // nie tylko zawierać opcję. Sama obecność wpisu w liście to nie
              // osiągalność — to obietnica osiągalności.
              picker.value = id;
              picker.dispatchEvent(new Event("change", { bubbles: true }));
              await frame();
              reached = current() === id;
            }
            if (!reached) {
              unreachable.push({
                id,
                navButtonVisible: visible(navButton),
                pickerVisible: visible(picker),
                current: current()
              });
            }
          }
          const back = document.querySelector("[data-settings-back]");
          if (back !== null) {
            back.click();
            await frame();
          }
          return {
            entered: true,
            categories,
            unreachable,
            leftTheMode: document.querySelector("[data-settings-back]") === null
          };
        })()`);
        if (
          !settingsReach.entered ||
          settingsReach.categories.length < 3 ||
          settingsReach.unreachable.length > 0 ||
          !settingsReach.leftTheMode
        ) {
          throw new Error(
            `PACKAGED_ALPHA_NARROW_SETTINGS_UNREACHABLE:${JSON.stringify(settingsReach)}`,
          );
        }

        const resetTabCount = await client.evaluate(`(async () => {
          document.querySelector('.nav-item[data-surface="today"]').click();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
          let close = document.querySelector(
            ".shell-tab:not(.active) .shell-tab-close"
          );
          while (close !== null) {
            close.click();
            await new Promise((resolve) => requestAnimationFrame(resolve));
            close = document.querySelector(
              ".shell-tab:not(.active) .shell-tab-close"
            );
          }
          return document.querySelectorAll(".shell-tab").length;
        })()`);
        if (resetTabCount !== 1) {
          throw new Error("PACKAGED_ALPHA_NARROW_SWEEP_STATE_NOT_RESTORED");
        }

        await client.send("Page.bringToFront");
        const captureOpener = await client.evaluate(`(() => {
          const trigger = document.querySelector(".capture-dock");
          trigger.focus();
          const focused = document.activeElement === trigger;
          trigger.click();
          return { focused };
        })()`);
        await waitFor(
          client,
          `document.querySelector("dialog.capture-backdrop[open]") !== null`,
          "PACKAGED_ALPHA_CAPTURE_DIALOG_MISSING_AT_NARROW_WIDTH",
        );
        await client.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        });
        await client.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        });
        await waitFor(
          client,
          `document.querySelector("dialog.capture-backdrop[open]") === null`,
          "PACKAGED_ALPHA_CAPTURE_DIALOG_DID_NOT_CLOSE",
        );
        const captureFocus = await client.evaluate(`(() => ({
          tag: document.activeElement?.tagName,
          className: document.activeElement?.className,
          ariaLabel: document.activeElement?.getAttribute("aria-label")
        }))()`);
        if (
          captureOpener.focused &&
          (typeof captureFocus.className !== "string" ||
            !captureFocus.className.split(/\s+/u).includes("capture-dock"))
        ) {
          throw new Error(
            `PACKAGED_ALPHA_CAPTURE_FOCUS_NOT_RESTORED:${JSON.stringify(captureFocus)}`,
          );
        }
      } finally {
        await client.send("Emulation.clearDeviceMetricsOverride");
      }

      const payloadCustody = await client.evaluate(`(async () => {
        const staged = await window.constellation.stageCapturePayload({
          displayName: "packaged-custody.txt",
          mediaType: "text/plain",
          inputKind: "file",
          bytes: new Uint8Array([82, 49, 49, 46, 50])
        });
        if (staged.outcome === "success") {
          await window.constellation.discardCapturePayload(staged.original);
        }
        return staged;
      })()`);
      if (
        payloadCustody.outcome !== "success" ||
        payloadCustody.original.kind !== "managed_file" ||
        payloadCustody.original.payload.byteLength !== 5 ||
        payloadCustody.original.payload.custodyState !== "available"
      ) {
        throw new Error(
          `PACKAGED_ALPHA_CAPTURE_PAYLOAD_CUSTODY_INVALID:${JSON.stringify(payloadCustody)}`,
        );
      }
    }

    const submitCapture = async (title) => {
      const startedAt = performance.now();
      await client.evaluate(`(() => {
        document.querySelector(".capture-dock").click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector("#capture-text") !== null`,
        "PACKAGED_ALPHA_CAPTURE_DIALOG_MISSING",
      );
      await client.evaluate(`(() => {
        const input = document.querySelector("#capture-text");
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        ).set;
        setter.call(input, ${JSON.stringify(title)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector(".capture-footer .primary-button")?.disabled === false`,
        "PACKAGED_ALPHA_CAPTURE_SUBMIT_DISABLED",
      );
      await client.evaluate(`(() => {
        document.querySelector(".capture-footer .primary-button").click();
        return true;
      })()`);
      await waitFor(
        client,
        `[...document.querySelectorAll("[data-task-row] [data-row-title]")].some(
          (node) => node.textContent === ${JSON.stringify(title)}
        )`,
        "PACKAGED_ALPHA_CAPTURE_RESULT_MISSING",
      );
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [data-shell-tab^="task:"]') !== null`,
        "PACKAGED_ALPHA_CAPTURE_CONTEXT_TAB_MISSING",
      );
      const durationMs = performance.now() - startedAt;
      if (durationMs > PACKAGED_INTERACTION_BUDGET_MS) {
        throw new Error(`PACKAGED_ALPHA_CAPTURE_BUDGET_EXCEEDED_${durationMs}`);
      }
      return durationMs;
    };

    let backup;
    let restorePreview;
    let captureCommitMs;
    let searchMs;
    if (phase === "created") {
      const initialCount = await client.evaluate(
        `document.querySelectorAll("[data-task-row]").length`,
      );
      if (initialCount !== 0) throw new Error("PACKAGED_ALPHA_NOT_EMPTY");
      const starterPreview = await client.evaluate(
        `window.constellation.previewStarterWorkspace(${JSON.stringify({
          version: 1,
          importId: "10000000-0000-4000-8000-000000000050",
          areas: [
            {
              key: "preview-only",
              title: "Preview only",
              responsibility: "Must not mutate the packaged workspace",
            },
          ],
          initiatives: [],
          projects: [],
          tasks: [],
        })})`,
      );
      if (
        starterPreview.outcome !== "success" ||
        starterPreview.counts.areas !== 1 ||
        starterPreview.counts.initiatives !== 0 ||
        starterPreview.counts.projects !== 0 ||
        starterPreview.counts.tasks !== 0 ||
        starterPreview.counts.links !== 0 ||
        (await client.evaluate(
          `document.querySelectorAll("[data-task-row]").length`,
        )) !== 0
      ) {
        throw new Error("PACKAGED_ALPHA_STARTER_PREVIEW_MUTATED");
      }
      captureCommitMs = await submitCapture(taskTitle);
      const directCreated = await createDirectContext(
        client,
        boundary.build.initialWorkspaceId,
      );
      if (directCreated.outcome !== "success") {
        throw new Error(
          `PACKAGED_ALPHA_DIRECT_CONTEXT_CREATE_FAILED:${JSON.stringify(directCreated)}`,
        );
      }
      assertDirectContextState(
        await directContextState(client, boundary.build.initialWorkspaceId),
        "created",
      );
      backup = await client.evaluate(
        `window.constellation.exportWorkspaceBackup()`,
      );
      if (
        backup.outcome !== "success" ||
        typeof backup.recoveryCode !== "string" ||
        backup.metadata.workspaceId !== boundary.build.initialWorkspaceId
      ) {
        throw new Error(
          `PACKAGED_ALPHA_BACKUP_EXPORT_FAILED_${backup.outcome}_${backup.code ?? "no-code"}_${backup.metadata?.workspaceId ?? "no-workspace"}_${boundary.build.initialWorkspaceId}`,
        );
      }
      let clipboardCopy;
      try {
        clipboardCopy = await client.evaluate(
          `window.constellation.copyWorkspaceRecoveryCode({ recoveryCode: ${JSON.stringify(backup.recoveryCode)} })`,
        );
      } finally {
        clearSystemClipboard();
      }
      if (clipboardCopy.outcome !== "success") {
        throw new Error("PACKAGED_ALPHA_RECOVERY_CODE_COPY_FAILED");
      }
      const checkpointStatus = await client.evaluate(
        `window.constellation.getDataHomeStatus()`,
      );
      if (checkpointStatus.checkpointState !== "verified_this_session") {
        throw new Error("PACKAGED_ALPHA_CHECKPOINT_STATUS_NOT_VERIFIED");
      }
      await submitCapture(mutationTitle);
      const contextTabs = await client.evaluate(
        `document.querySelectorAll('.shell-tab').length`,
      );
      if (contextTabs !== 1) {
        throw new Error("PACKAGED_ALPHA_CONTEXT_TAB_COUNT_INVALID");
      }
      await client.evaluate(`(() => {
        document.querySelector('.shell-history-controls [data-shell-history="back"]').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [role="tab"] span:last-child')?.textContent === ${JSON.stringify(taskTitle)}`,
        "PACKAGED_ALPHA_CONTEXT_BACK_FAILED",
      );
      await client.evaluate(`(() => {
        document.querySelector('.shell-history-controls [data-shell-history="forward"]').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [role="tab"] span:last-child')?.textContent === ${JSON.stringify(mutationTitle)}`,
        "PACKAGED_ALPHA_CONTEXT_FORWARD_FAILED",
      );
      await client.evaluate(`(() => {
        document.querySelector('.search-control').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('#global-search') !== null`,
        "PACKAGED_ALPHA_SEARCH_MISSING",
      );
      const searchStartedAt = performance.now();
      await client.evaluate(`(() => {
        const input = document.querySelector('#global-search');
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        ).set;
        setter.call(input, ${JSON.stringify(taskTitle)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      await waitFor(
        client,
        `[...document.querySelectorAll('.search-results button')].some(
          (button) => button.querySelector('strong')?.textContent === ${JSON.stringify(taskTitle)}
        )`,
        "PACKAGED_ALPHA_LOCAL_SEARCH_RESULT_MISSING",
      );
      searchMs = performance.now() - searchStartedAt;
      if (searchMs > PACKAGED_INTERACTION_BUDGET_MS) {
        throw new Error(`PACKAGED_ALPHA_SEARCH_BUDGET_EXCEEDED_${searchMs}`);
      }
      await client.evaluate(`(() => {
        const result = [...document.querySelectorAll('.search-results button')].find(
          (button) => button.querySelector('strong')?.textContent === ${JSON.stringify(taskTitle)}
        );
        result.click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [role="tab"] span:last-child')?.textContent === ${JSON.stringify(taskTitle)} && document.querySelectorAll('.shell-tab').length === 1`,
        "PACKAGED_ALPHA_SEARCH_CONTEXT_NAVIGATION_FAILED",
      );
      await client.evaluate(`(() => {
        document.querySelector('.nav-item[data-surface="projects"]').click();
        return true;
      })()`);
      await waitFor(
        client,
        // PO TOŻSAMOŚCI, NIE PO STOPNIU FARBY. Ten selektor brzmiał
        // `.secondary-button` i przez to KODOWAŁ WADĘ, którą wpis 5-2 nazwał:
        // `New project` był jedyną drugorzędną akcją tworzącą w produkcie
        // (spis powszechny bramki: siedem akcji w paśmie, sześć `primary`).
        // Naprawa wpisu przewróciła ten krok — nie dlatego, że produkt się
        // zepsuł, tylko dlatego, że asercja opisywała defekt. `aria-expanded`
        // stoi na tym przycisku w OBU stanach (`Wave2Surfaces.tsx`, jeden węzeł
        // przełączany między `New project` a `Cancel`) i jest deklaracją tego,
        // CZYM ten przycisk jest, a nie tego, jak jest pomalowany.
        `document.querySelector('.project-surface .surface-header button[data-project-create]') !== null`,
        "PACKAGED_ALPHA_PROJECT_SURFACE_MISSING",
      );
      await client.evaluate(`(() => {
        document.querySelector('.project-surface .surface-header button[data-project-create]').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('#project-title') !== null && document.querySelector('#project-outcome') !== null`,
        "PACKAGED_ALPHA_PROJECT_FORM_MISSING",
      );
      await client.evaluate(`(() => {
        const title = document.querySelector('#project-title');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
          title,
          ${JSON.stringify(projectTitle)}
        );
        title.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      await client.evaluate(`(() => {
        const outcome = document.querySelector('#project-outcome');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
          outcome,
          ${JSON.stringify(projectOutcome)}
        );
        outcome.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.project-surface form .primary-button')?.disabled === false`,
        "PACKAGED_ALPHA_PROJECT_SUBMIT_DISABLED",
      );
      await client.evaluate(`(() => {
        document.querySelector('.project-surface form .primary-button').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.inspector-header small')?.textContent === ${JSON.stringify(projectKindLabel)} && document.querySelector('.inspector-body h2')?.textContent === ${JSON.stringify(projectTitle)} && document.querySelector('.provenance-block blockquote')?.textContent === ${JSON.stringify(projectOutcome)}`,
        "PACKAGED_ALPHA_PROJECT_CONTEXT_MISSING",
      );
      await client.evaluate(`(() => {
        document.querySelector('.nav-item[data-surface="tasks"]').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [data-shell-tab="destination:tasks"]') !== null`,
        "PACKAGED_ALPHA_TASK_CONTEXT_RETURN_FAILED",
      );
    } else if (phase.startsWith("interrupted-")) {
      restorePreview = await client.evaluate(
        `window.constellation.prepareWorkspaceRestore({ recoveryCode: ${JSON.stringify(recoveryCode)} })`,
      );
      if (
        restorePreview.outcome !== "preview" ||
        restorePreview.counts.tasks !== 1
      ) {
        throw new Error("PACKAGED_ALPHA_INTERRUPTED_PREVIEW_INVALID");
      }
      let connectionClosed = false;
      try {
        await client.evaluate(
          `window.constellation.confirmWorkspaceRestore({ restoreId: ${JSON.stringify(restorePreview.restoreId)} })`,
        );
      } catch {
        connectionClosed = true;
      }
      for (
        let attempt = 0;
        attempt < 200 &&
        packagedProcess.signalCode === null &&
        packagedProcess.exitCode === null;
        attempt += 1
      ) {
        await delay(50);
      }
      client.close();
      if (
        !connectionClosed ||
        (packagedProcess.signalCode === null &&
          packagedProcess.exitCode === null)
      ) {
        throw new Error("PACKAGED_ALPHA_RECOVERY_FAILPOINT_DID_NOT_TERMINATE");
      }
      return {
        phase,
        failpoint,
        restorePreview,
        dataHomeDeviceId: boundary.dataHome.descriptor.deviceId,
        performance: { shellReadyMs: Math.round(shellReadyMs) },
        termination:
          packagedProcess.signalCode ?? `exit-${packagedProcess.exitCode}`,
      };
    } else if (phase === "restore-confirm") {
      restorePreview = await client.evaluate(
        `window.constellation.prepareWorkspaceRestore({ recoveryCode: ${JSON.stringify(recoveryCode)} })`,
      );
      if (
        restorePreview.outcome !== "preview" ||
        restorePreview.counts.tasks !== 1 ||
        restorePreview.counts.captures !== 1 ||
        restorePreview.counts.auditReceipts < 3
      ) {
        throw new Error("PACKAGED_ALPHA_RESTORE_PREVIEW_INVALID");
      }
      let restored;
      let connectionClosed = false;
      try {
        restored = await client.evaluate(
          `window.constellation.confirmWorkspaceRestore({ restoreId: ${JSON.stringify(restorePreview.restoreId)} })`,
        );
      } catch {
        connectionClosed = true;
      }
      if (
        restored !== undefined &&
        (restored.outcome !== "success" ||
          restored.workspaceId !== expectedWorkspaceId)
      ) {
        throw new Error("PACKAGED_ALPHA_RESTORE_CONFIRM_FAILED");
      }
      for (
        let attempt = 0;
        attempt < 200 &&
        packagedProcess.signalCode === null &&
        packagedProcess.exitCode === null;
        attempt += 1
      ) {
        await delay(50);
      }
      client.close();
      signalInstalledAppProcesses("TERM");
      await delay(500);
      signalInstalledAppProcesses("KILL");
      if (
        packagedProcess.signalCode === null &&
        packagedProcess.exitCode === null
      ) {
        throw new Error("PACKAGED_ALPHA_RESTORE_DID_NOT_RELAUNCH");
      }
      return {
        phase,
        restorePreview,
        dataHomeDeviceId: boundary.dataHome.descriptor.deviceId,
        performance: { shellReadyMs: Math.round(shellReadyMs) },
        connectionClosed,
        termination:
          packagedProcess.signalCode ?? `exit-${packagedProcess.exitCode}`,
      };
    } else if (phase === "restored") {
      if (
        boundary.build.startupRecovery !== "none" ||
        boundary.build.initialWorkspaceId !== expectedWorkspaceId
      ) {
        throw new Error("PACKAGED_ALPHA_RESTORED_BOOT_INVALID");
      }
      await client.evaluate(`(() => {
        document.querySelector('.nav-item[data-surface="tasks"]').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [data-shell-tab="destination:tasks"]') !== null`,
        "PACKAGED_ALPHA_TASK_DESTINATION_CONTEXT_MISSING",
      );
    } else if (phase === "continuity") {
      if (
        boundary.build.startupRecovery !== "none" ||
        boundary.build.initialWorkspaceId !== expectedWorkspaceId
      ) {
        throw new Error("PACKAGED_ALPHA_RELEASE_CONTINUITY_INVALID");
      }
      await client.evaluate(`(() => {
        document.querySelector('.nav-item[data-surface="tasks"]').click();
        return true;
      })()`);
    } else {
      if (boundary.build.startupRecovery !== "previous_workspace_restored") {
        throw new Error("PACKAGED_ALPHA_PREVIOUS_WORKSPACE_NOT_RECOVERED");
      }
      await client.evaluate(`(() => {
        document.querySelector('.nav-item[data-surface="tasks"]').click();
        return true;
      })()`);
    }
    await waitFor(
      client,
      `[...document.querySelectorAll("[data-task-row] [data-row-title]")].some(
        (node) => node.textContent === ${JSON.stringify(taskTitle)}
      )`,
      `PACKAGED_ALPHA_TASK_${phase.toUpperCase()}_MISSING`,
    );
    if (phase.startsWith("recovered-") || phase === "restored") {
      assertDirectContextState(
        await directContextState(client, boundary.build.initialWorkspaceId),
        phase,
      );
    }
    const taskCount = await client.evaluate(
      `document.querySelectorAll("[data-task-row]").length`,
    );
    const expectedTaskCount =
      phase === "restored" || phase === "continuity" ? 1 : 2;
    if (taskCount !== expectedTaskCount) {
      throw new Error("PACKAGED_ALPHA_TASK_COUNT_INVALID");
    }
    if (
      phase === "restored" &&
      (await client.evaluate(
        `[...document.querySelectorAll("[data-task-row] [data-row-title]")].some(
          (node) => node.textContent === ${JSON.stringify(mutationTitle)}
        )`,
      ))
    ) {
      throw new Error("PACKAGED_ALPHA_MUTATION_SURVIVED_RESTORE");
    }
    if (client.issues().length > 0) {
      throw new Error(
        `PACKAGED_ALPHA_RENDERER_ERRORS_${client.issues().join("_")}`,
      );
    }
    await stopPackagedApp(client, packagedProcess, browserUserData);
    return {
      phase,
      taskCount,
      backup,
      restorePreview,
      dataHomeDeviceId: boundary.dataHome.descriptor.deviceId,
      persistence: boundary.build.persistence,
      preload: "context-isolated",
      transport: "renderer-preload-ipc",
      version: boundary.build.version,
      performance: {
        shellReadyMs: Math.round(shellReadyMs),
        ...(captureCommitMs === undefined
          ? {}
          : { captureCommitMs: Math.round(captureCommitMs) }),
        ...(searchMs === undefined ? {} : { searchMs: Math.round(searchMs) }),
      },
    };
  } catch (error) {
    if (client !== undefined) client.close();
    signalPackagedProcessTree(packagedProcess, "SIGKILL");
    signalInstalledAppProcesses("KILL");
    packagedProcess.stdout.destroy();
    packagedProcess.stderr.destroy();
    process.stderr.write(stdout);
    process.stderr.write(stderr);
    throw error;
  }
};

if (continuityWorkspaceId !== undefined) {
  const continuity = await run("continuity", undefined, continuityWorkspaceId);
  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      phase: continuity.phase,
      version: continuity.version,
      workspaceId: continuityWorkspaceId,
      taskCount: continuity.taskCount,
      encryptedContinuity: true,
      performance: continuity.performance,
    })}\n`,
  );
  process.exit(0);
}

const created = await run("created");
const interruptedAfterRetention = await run(
  "interrupted-after-retention",
  created.backup.recoveryCode,
  created.backup.metadata.workspaceId,
  "after-previous-retained",
);
const recoveredAfterRetention = await run("recovered-after-retention");
const interruptedAfterActivation = await run(
  "interrupted-after-activation",
  created.backup.recoveryCode,
  created.backup.metadata.workspaceId,
  "after-candidate-activated",
);
const recoveredAfterActivation = await run("recovered-after-activation");
const destroyedWrapper = path.join(
  applicationStateRoot,
  "local-alpha-workspace",
  "key-wrapper.json",
);
fs.rmSync(destroyedWrapper, { force: true });
if (fs.existsSync(destroyedWrapper)) {
  throw new Error("PACKAGED_ALPHA_DESTRUCTIVE_FIXTURE_FAILED");
}
const restoreConfirmed = await run(
  "restore-confirm",
  created.backup.recoveryCode,
  created.backup.metadata.workspaceId,
);
const restored = await run(
  "restored",
  undefined,
  created.backup.metadata.workspaceId,
);
const dataHomeDeviceIds = [
  created,
  interruptedAfterRetention,
  recoveredAfterRetention,
  interruptedAfterActivation,
  recoveredAfterActivation,
  restoreConfirmed,
  restored,
].map((result) => result.dataHomeDeviceId);
if (new Set(dataHomeDeviceIds).size !== 1) {
  throw new Error("PACKAGED_ALPHA_DEVICE_ID_NOT_STABLE");
}
await new Promise((resolve, reject) => {
  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      platform: process.platform,
      phases: [
        created.phase,
        interruptedAfterRetention.phase,
        recoveredAfterRetention.phase,
        interruptedAfterActivation.phase,
        recoveredAfterActivation.phase,
        restoreConfirmed.phase,
        restored.phase,
      ],
      interruptionTerminations: [
        interruptedAfterRetention.termination,
        interruptedAfterActivation.termination,
      ],
      restoreRelaunchTermination: restoreConfirmed.termination,
      persistence: restored.persistence,
      preload: restored.preload,
      transport: restored.transport,
      taskCount: restored.taskCount,
      backupWorkspaceId: created.backup.metadata.workspaceId,
      dataHomeProvider: "constellation.local-only/v1",
      stableDeviceIdentity: true,
      restoreCounts: restoreConfirmed.restorePreview.counts,
      performance: {
        startupMsByPhase: [
          created,
          interruptedAfterRetention,
          recoveredAfterRetention,
          interruptedAfterActivation,
          recoveredAfterActivation,
          restoreConfirmed,
          restored,
        ].map((result) => ({
          phase: result.phase,
          milliseconds: result.performance.shellReadyMs,
        })),
        captureCommitMs: created.performance.captureCommitMs,
        searchMs: created.performance.searchMs,
      },
    })}\n`,
    (error) => {
      if (error === null || error === undefined) resolve();
      else reject(error);
    },
  );
});
process.exit(0);
