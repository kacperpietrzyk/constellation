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
const taskTitle = "Verify packaged UI, preload, IPC, and persistence";
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
  #pending = new Map();
  #socket;

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
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

const run = async (phase) => {
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
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
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
    await waitFor(
      client,
      `document.querySelector(".desktop-shell") !== null`,
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
      boundary.hasNodeRequire ||
      boundary.bridgeKeys.join(",") !== "executeCommand,getBuildInfo,runQuery"
    ) {
      throw new Error("PACKAGED_ALPHA_PRELOAD_OR_IPC_INVALID");
    }

    if (phase === "created") {
      const initialCount = await client.evaluate(
        `document.querySelectorAll(".task-row").length`,
      );
      if (initialCount !== 0) throw new Error("PACKAGED_ALPHA_NOT_EMPTY");
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
        setter.call(input, ${JSON.stringify(taskTitle)});
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
    if (taskCount !== 1) throw new Error("PACKAGED_ALPHA_TASK_COUNT_INVALID");
    await stopPackagedApp(client, packagedProcess);
    return {
      phase,
      taskCount,
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
const restored = await run("restored");
process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    platform: process.platform,
    phases: [created.phase, restored.phase],
    persistence: restored.persistence,
    preload: restored.preload,
    transport: restored.transport,
    taskCount: restored.taskCount,
  })}\n`,
);
