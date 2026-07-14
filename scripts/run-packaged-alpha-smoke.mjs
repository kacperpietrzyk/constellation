import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(root, "release", "local-alpha-manifest.json"),
    "utf8",
  ),
);
const stateRoot = path.join(root, "build", "packaged-alpha-ui-smoke-state");
const userData = path.join(stateRoot, "user-data");
const recoverySmokeRoot = path.join(userData, "recovery-smoke");
const taskTitle = "Verify packaged UI, preload, IPC, and persistence";
const mutationTitle = "This mutation must disappear after restore";
const projectTitle = "Verify packaged Project context";
const projectOutcome = "Project inspector preserves the intended outcome";
fs.rmSync(stateRoot, { recursive: true, force: true });
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
      if (message.error === undefined) pending.resolve(message.result);
      else pending.reject(new Error(`CDP_${message.error.message}`));
    });
    socket.addEventListener("close", () => {
      for (const pending of this.#pending.values()) {
        pending.reject(new Error("CDP_CONNECTION_CLOSED"));
      }
      this.#pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }

  async send(method, params = {}) {
    const id = ++this.#id;
    const result = new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
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
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(`PACKAGED_ALPHA_EXITED_EARLY_${process.exitCode}`);
    }
    try {
      const response = await fetch(endpoint);
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

const stopPackagedApp = async (client, process) => {
  try {
    await client.send("Browser.close");
  } catch {
    // A closed browser can tear down CDP before acknowledging the command.
  }
  client.close();
  for (
    let attempt = 0;
    attempt < 100 && process.exitCode === null;
    attempt += 1
  ) {
    await delay(50);
  }
  if (process.exitCode === null) process.kill("SIGTERM");
  if (process.exitCode === null) {
    await new Promise((resolve) => process.once("exit", resolve));
  }
};

const run = async (phase, recoveryCode, expectedWorkspaceId, failpoint) => {
  const port = await reservePort();
  let stdout = "";
  let stderr = "";
  const packagedProcess = spawn(
    manifest.executable,
    [
      `--user-data-dir=${userData}`,
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
    ],
    {
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
      return {
        build,
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
        "cancelWorkspaceRestore,confirmWorkspaceRestore,executeCommand,exportWorkspaceBackup,getBuildInfo,prepareWorkspaceRestore,runQuery"
    ) {
      throw new Error("PACKAGED_ALPHA_PRELOAD_OR_IPC_INVALID");
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
    const expectedTaskCount = phase === "restored" ? 1 : 2;
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
      persistence: boundary.build.persistence,
      preload: "context-isolated",
      transport: "renderer-preload-ipc",
    };
  } catch (error) {
    if (client !== undefined) client.close();
    if (packagedProcess.exitCode === null) packagedProcess.kill("SIGKILL");
    process.stderr.write(stdout);
    process.stderr.write(stderr);
    throw error;
  }
};

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
    restoreCounts: restored.restorePreview.counts,
  })}\n`,
);
