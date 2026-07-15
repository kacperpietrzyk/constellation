import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
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
const userData = path.join(stateRoot, "user-data");
const recoverySmokeRoot = path.join(userData, "recovery-smoke");
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

const reservePort = async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("CDP_PORT_ALLOCATION_FAILED");
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return address.port;
};

class CdpClient {
  #id = 0;
  #issues = [];
  #pending = new Map();
  #socket;

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
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
    });
    socket.addEventListener("close", () => {
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("CDP_CONNECTION_CLOSED"));
      }
      this.#pending.clear();
    });
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
    return new CdpClient(socket);
  }

  async send(method, params = {}) {
    const id = ++this.#id;
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        reject(new Error(`CDP_${method}_TIMEOUT`));
      }, 5_000);
      this.#pending.set(id, { resolve, reject, timeout });
    });
    this.#socket.send(JSON.stringify({ id, method, params }));
    return result;
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
    this.#socket.close();
  }

  issues() {
    return [...this.#issues];
  }
}

const waitForTarget = async (port, process) => {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`PACKAGED_ALPHA_EXITED_EARLY_${process.exitCode}`);
    }
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(250),
      });
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) =>
            target.type === "page" && target.url.startsWith("file://"),
        );
        if (page?.webSocketDebuggerUrl !== undefined) return page;
      }
    } catch {
      // The packaged browser is still starting.
    }
    await delay(100);
  }
  throw new Error("PACKAGED_ALPHA_CDP_TARGET_TIMEOUT");
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

const stopPackagedApp = async (client, child) => {
  await Promise.race([
    client.send("Browser.close").catch(() => undefined),
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
  await delay(500);
  signalPackagedProcessTree(child, "SIGKILL");
  if (!(await waitForExit())) throw new Error("PACKAGED_ALPHA_DID_NOT_EXIT");
  child.stdout.destroy();
  child.stderr.destroy();
};

const run = async (phase, recoveryCode, expectedWorkspaceId, failpoint) => {
  const port = await reservePort();
  let stdout = "";
  let stderr = "";
  const packagedProcess = spawn(
    executable,
    [
      `--user-data-dir=${userData}`,
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
    ],
    {
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
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
    const target = await waitForTarget(port, packagedProcess);
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
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
        (phase === "restored" ? "recovery_required" : "ready") ||
      boundary.hasNodeRequire ||
      boundary.bridgeKeys.join(",") !==
        "acknowledgeDocumentUpdates,addMeetingWorkItem,cancelWorkspaceRestore,checkForRelease,configureJamie,confirmCalendarBlocks,confirmWorkspaceRestore,createDocumentRevision,createRemoteAgentGrant,disconnectJamie,downloadRelease,editMeetingWorkItem,enrollHub,executeCommand,exportHubAuthorization,exportWorkspaceBackup,getBuildInfo,getDataHomeStatus,getJamieStatus,getMeetingLoop,getReleaseStatus,installRelease,listDocumentRevisions,listRemoteAgentGrants,onAttentionActivated,openDocument,persistDocumentUpdate,prepareAgentCredential,prepareWorkspaceRestore,previewCalendarBlocks,requestCalendarAccess,restoreDocumentRevision,revokeRemoteAgentGrant,rotateRemoteAgentGrant,runQuery,syncDataHome,syncJamie"
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
      dataHome.descriptor.capabilities.attachments.support !== "unsupported" ||
      dataHome.descriptor.capabilities.quota.support !== "unsupported" ||
      dataHome.descriptor.capabilities.device_revocation.support !==
        "unsupported" ||
      dataHome.availability !==
        (phase === "restored" ? "recovery_required" : "available") ||
      (phase === "restored"
        ? dataHome.descriptor.workspaceId !== undefined
        : dataHome.descriptor.workspaceId !== boundary.build.initialWorkspaceId)
    ) {
      throw new Error("PACKAGED_ALPHA_DATA_HOME_CONTRACT_INVALID");
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
    } else if (phase === "restored") {
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
      const restored = await client.evaluate(
        `window.constellation.confirmWorkspaceRestore({ restoreId: ${JSON.stringify(restorePreview.restoreId)} })`,
      );
      if (
        restored.outcome !== "success" ||
        restored.workspaceId !== expectedWorkspaceId
      ) {
        throw new Error("PACKAGED_ALPHA_RESTORE_CONFIRM_FAILED");
      }
      await client.evaluate(
        `(() => { window.location.reload(); return true; })()`,
      );
      await waitFor(
        client,
        `document.querySelector(".desktop-shell") !== null`,
        "PACKAGED_ALPHA_RESTORED_UI_NOT_READY",
      );
      await client.evaluate(`(() => {
        document.querySelector('.nav-item[data-surface="tasks"]').click();
        return true;
      })()`);
      await waitFor(
        client,
        `document.querySelector('.shell-tab.active [data-shell-tab="destination:tasks"]') !== null`,
        "PACKAGED_ALPHA_TASK_DESTINATION_CONTEXT_MISSING",
      );
      const restoredDataHome = await client.evaluate(
        `window.constellation.getDataHomeStatus()`,
      );
      if (
        restoredDataHome.availability !== "available" ||
        restoredDataHome.descriptor.workspaceId !== expectedWorkspaceId ||
        restoredDataHome.checkpointState !== "verified_this_session"
      ) {
        throw new Error("PACKAGED_ALPHA_RESTORED_DATA_HOME_INVALID");
      }
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
    await stopPackagedApp(client, packagedProcess);
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
  userData,
  "local-alpha-workspace",
  "key-wrapper.json",
);
fs.rmSync(destroyedWrapper, { force: true });
if (fs.existsSync(destroyedWrapper)) {
  throw new Error("PACKAGED_ALPHA_DESTRUCTIVE_FIXTURE_FAILED");
}
const restored = await run(
  "restored",
  created.backup.recoveryCode,
  created.backup.metadata.workspaceId,
);
const dataHomeDeviceIds = [
  created,
  interruptedAfterRetention,
  recoveredAfterRetention,
  interruptedAfterActivation,
  recoveredAfterActivation,
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
        restored.phase,
      ],
      interruptionTerminations: [
        interruptedAfterRetention.termination,
        interruptedAfterActivation.termination,
      ],
      persistence: restored.persistence,
      preload: restored.preload,
      transport: restored.transport,
      taskCount: restored.taskCount,
      backupWorkspaceId: created.backup.metadata.workspaceId,
      dataHomeProvider: "constellation.local-only/v1",
      stableDeviceIdentity: true,
      restoreCounts: restored.restorePreview.counts,
    })}\n`,
    (error) => {
      if (error === null || error === undefined) resolve();
      else reject(error);
    },
  );
});
process.exit(0);
