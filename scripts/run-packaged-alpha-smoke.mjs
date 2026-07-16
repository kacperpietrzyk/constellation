import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertPackagedCredentialStoreTestAllowed } from "./desktop/packaged-credential-store-policy.mjs";

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
if (continuityWorkspaceId === undefined) {
  fs.rmSync(stateRoot, { recursive: true, force: true });
}
fs.mkdirSync(stateRoot, { recursive: true });

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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
      }, 5_000);
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

const waitFor = async (client, expression, diagnosticCode) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
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
      boundary.bridgeKeys.join(",") !==
        "acknowledgeDocumentUpdates,addMeetingWorkItem,cancelWorkspaceRestore,checkForRelease,configureJamie,confirmCalendarBlocks,confirmWorkspaceRestore,createDocumentRevision,createRemoteAgentGrant,createWorkspace,discardCapturePayload,disconnectJamie,downloadRelease,editMeetingWorkItem,enrollHub,executeCommand,exportHubAuthorization,exportWorkspaceBackup,getBuildInfo,getCrossWorkspaceCockpit,getDataHomeStatus,getJamieStatus,getMeetingLoop,getReleaseStatus,importStarterWorkspace,installRelease,listDocumentRevisions,listRemoteAgentGrants,listWorkspaces,onAttentionActivated,openDetachedSurface,openDocument,persistDocumentUpdate,prepareAgentCredential,prepareWorkspaceRestore,previewCalendarBlocks,previewStarterWorkspace,requestCalendarAccess,restoreDocumentRevision,revokeRemoteAgentGrant,rotateRemoteAgentGrant,runQuery,selectCapturePayload,stageCapturePayload,switchWorkspace,syncDataHome,syncJamie"
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
      await waitFor(
        client,
        `document.querySelector(".capture-dock") !== null && document.querySelectorAll(".nav-item[data-surface]").length === 12`,
        "PACKAGED_ALPHA_OPERATIONAL_SHELL_NOT_READY",
      );
      const originalViewport = await client.evaluate(`({
        width: innerWidth,
        height: innerHeight
      })`);
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: 320,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
        dontSetVisibleSize: true,
      });
      await client.send("Emulation.setVisibleSize", {
        width: 320,
        height: 800,
      });
      try {
        await client.evaluate(`new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )`);
        const narrowShell = await client.evaluate(`(() => {
          const shell = document.querySelector(".desktop-shell");
          const work = document.querySelector(".work-surface");
          const dock = document.querySelector(".capture-dock");
          const targets = [...document.querySelectorAll(
            ".search-control, .nav-item, .sidebar-capture"
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
            favoritesHidden: favorites.every(
              (element) => element.getClientRects().length === 0
            )
          };
        })()`);
        if (
          narrowShell.viewportWidth !== 320 ||
          narrowShell.documentWidth > 320 ||
          narrowShell.shellWidth > 320 ||
          !narrowShell.workWithinViewport ||
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
          for (const destination of document.querySelectorAll(
            ".nav-item[data-surface]"
          )) {
            destination.click();
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
            const work = document.querySelector(".work-surface");
            const surface = [...(work?.children ?? [])].find(
              (element) =>
                element.getClientRects().length > 0 &&
                !element.classList.contains("shell-tabbar") &&
                !element.classList.contains("capture-dock")
            );
            const unnamedControls = [...document.querySelectorAll(controlSelector)]
              .filter(
                (element) =>
                  element.getClientRects().length > 0 &&
                  !hasAccessibleName(element)
              )
              .map((element) => element.tagName.toLowerCase());
            results.push({
              surface: destination.dataset.surface,
              documentWidth: document.documentElement.scrollWidth,
              surfacePresent: surface !== undefined,
              surfaceWidth: surface?.scrollWidth,
              surfaceClientWidth: surface?.clientWidth,
              unnamedControls
            });
          }
          return results;
        })()`);
        const invalidNarrowSurface = narrowSurfaces.find(
          (surface) =>
            surface.documentWidth > 320 ||
            !surface.surfacePresent ||
            surface.unnamedControls.length > 0,
        );
        if (invalidNarrowSurface !== undefined) {
          throw new Error(
            `PACKAGED_ALPHA_NARROW_SURFACE_INVALID:${JSON.stringify(invalidNarrowSurface)}`,
          );
        }

        const resetTabCount = await client.evaluate(`(async () => {
          document.querySelector('.nav-item[data-surface="cockpit"]').click();
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
          const trigger = document.querySelector(".sidebar-capture");
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
            !captureFocus.className.split(/\s+/u).includes("sidebar-capture"))
        ) {
          throw new Error(
            `PACKAGED_ALPHA_CAPTURE_FOCUS_NOT_RESTORED:${JSON.stringify(captureFocus)}`,
          );
        }
      } finally {
        await client.send("Emulation.clearDeviceMetricsOverride");
        await client.send("Emulation.setVisibleSize", originalViewport);
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
      await client.evaluate(`(() => {
        document.querySelector(".sidebar-capture").click();
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
        `[...document.querySelectorAll(".task-row strong")].some(
          (node) => node.textContent === ${JSON.stringify(title)}
        )`,
        "PACKAGED_ALPHA_CAPTURE_RESULT_MISSING",
      );
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [data-shell-tab^="task:"]') !== null`,
        "PACKAGED_ALPHA_CAPTURE_CONTEXT_TAB_MISSING",
      );
    };

    let backup;
    let restorePreview;
    if (phase === "created") {
      const initialCount = await client.evaluate(
        `document.querySelectorAll(".task-row").length`,
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
          `document.querySelectorAll(".task-row").length`,
        )) !== 0
      ) {
        throw new Error("PACKAGED_ALPHA_STARTER_PREVIEW_MUTATED");
      }
      await submitCapture(taskTitle);
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
      if (contextTabs !== 3) {
        throw new Error("PACKAGED_ALPHA_CONTEXT_TAB_COUNT_INVALID");
      }
      await client.evaluate(`(() => {
        document.querySelector('.shell-history-controls [aria-label="Wstecz"]').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [role="tab"] span:last-child')?.textContent === ${JSON.stringify(taskTitle)}`,
        "PACKAGED_ALPHA_CONTEXT_BACK_FAILED",
      );
      await client.evaluate(`(() => {
        document.querySelector('.shell-history-controls [aria-label="Dalej"]').click();
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
          (button) => button.querySelector('small')?.textContent?.startsWith('task ·')
        )`,
        "PACKAGED_ALPHA_LOCAL_SEARCH_RESULT_MISSING",
      );
      await client.evaluate(`(() => {
        const result = [...document.querySelectorAll('.search-results button')].find(
          (button) => button.querySelector('small')?.textContent?.startsWith('task ·')
        );
        result.click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [role="tab"] span:last-child')?.textContent === ${JSON.stringify(taskTitle)} && document.querySelectorAll('.shell-tab').length === 3`,
        "PACKAGED_ALPHA_SEARCH_CONTEXT_NAVIGATION_FAILED",
      );
      await client.evaluate(`(() => {
        document.querySelector('.nav-item[data-surface="projects"]').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.project-surface .surface-header .secondary-button') !== null`,
        "PACKAGED_ALPHA_PROJECT_SURFACE_MISSING",
      );
      await client.evaluate(`(() => {
        document.querySelector('.project-surface .surface-header .secondary-button').click();
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
        `document.querySelector('.inspector-header small')?.textContent === 'Projekt' && document.querySelector('.inspector-body h2')?.textContent === ${JSON.stringify(projectTitle)} && document.querySelector('.provenance-block blockquote')?.textContent === ${JSON.stringify(projectOutcome)}`,
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
      `[...document.querySelectorAll(".task-row strong")].some(
        (node) => node.textContent === ${JSON.stringify(taskTitle)}
      )`,
      `PACKAGED_ALPHA_TASK_${phase.toUpperCase()}_MISSING`,
    );
    const taskCount = await client.evaluate(
      `document.querySelectorAll(".task-row").length`,
    );
    const expectedTaskCount =
      phase === "restored" || phase === "continuity" ? 1 : 2;
    if (taskCount !== expectedTaskCount) {
      throw new Error("PACKAGED_ALPHA_TASK_COUNT_INVALID");
    }
    if (
      phase === "restored" &&
      (await client.evaluate(
        `[...document.querySelectorAll(".task-row strong")].some(
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
    })}\n`,
    (error) => {
      if (error === null || error === undefined) resolve();
      else reject(error);
    },
  );
});
process.exit(0);
