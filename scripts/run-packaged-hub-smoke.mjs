import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ExecutionContextSchema,
  HubWorkspaceSnapshotSchema,
  WorkspaceIdSchema,
} from "@constellation/contracts";
import {
  HubService,
  InMemoryHubRepository,
  startHubServer,
} from "@constellation/hub";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(root, "release", "local-alpha-manifest.json"),
    "utf8",
  ),
);
const stateRoot = path.join(root, "build", "packaged-hub-smoke-state");
const firstUserData = path.join(stateRoot, "device-a");
const secondUserData = path.join(stateRoot, "device-b");
const baselineTitle = "Hub baseline from packaged device A";
const offlineTitle = "Offline packaged work reconciled exactly once";
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
  if (address === null || typeof address === "string")
    throw new Error("PORT_ALLOCATION_FAILED");
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
    const result = new Promise((resolve, reject) =>
      this.#pending.set(id, { resolve, reject }),
    );
    this.#socket.send(JSON.stringify({ id, method, params }));
    return result;
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression: `(async () => (${expression}))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails !== undefined)
      throw new Error("RENDERER_EVALUATION_FAILED");
    return result.result.value;
  }
  close() {
    this.#socket.close();
  }
}

const waitFor = async (client, expression, code) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(code);
};

const waitForTarget = async (port, child) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(`PACKAGED_APP_EXITED_${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = response.ok ? await response.json() : [];
      const page = targets.find(
        (value) => value.type === "page" && value.url.startsWith("file://"),
      );
      if (page?.webSocketDebuggerUrl !== undefined) return page;
    } catch {
      /* Electron is still starting. */
    }
    await delay(100);
  }
  throw new Error("PACKAGED_APP_CDP_TIMEOUT");
};

const launch = async (userData, registrationUrl) => {
  const port = await reservePort();
  const recoveryRoot = path.join(userData, "recovery-smoke");
  fs.mkdirSync(recoveryRoot, { recursive: true });
  let stderr = "";
  const child = spawn(
    manifest.executable,
    [
      `--user-data-dir=${userData}`,
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
    ],
    {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        CONSTELLATION_ALPHA_RECOVERY_SMOKE_ROOT: recoveryRoot,
        CONSTELLATION_ALPHA_HUB_SMOKE_MANUAL_SYNC: "1",
        ...(registrationUrl === undefined
          ? {}
          : { CONSTELLATION_ALPHA_HUB_SMOKE_REGISTER: registrationUrl }),
      },
    },
  );
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    const target = await waitForTarget(port, child);
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      await waitFor(
        client,
        `document.querySelector(".desktop-shell, .recovery-required-state") !== null`,
        "PACKAGED_HUB_UI_NOT_READY",
      );
    } catch (error) {
      const diagnostic = await client.evaluate(
        `({ text: document.body?.innerText ?? "", html: document.body?.innerHTML?.slice(0, 2000) ?? "" })`,
      );
      throw new Error(
        `${error instanceof Error ? error.message : "PACKAGED_HUB_UI_NOT_READY"}_${JSON.stringify(diagnostic)}`,
      );
    }
    return { child, client, recoveryRoot, stderr: () => stderr };
  } catch (error) {
    child.kill("SIGKILL");
    process.stderr.write(stderr);
    throw error;
  }
};

const stop = async (session) => {
  void session.client.send("Browser.close").catch(() => undefined);
  await delay(100);
  session.client.close();
  for (
    let attempt = 0;
    attempt < 100 &&
    session.child.exitCode === null &&
    session.child.signalCode === null;
    attempt += 1
  )
    await delay(50);
  if (session.child.exitCode === null && session.child.signalCode === null)
    session.child.kill("SIGTERM");
  for (
    let attempt = 0;
    attempt < 100 &&
    session.child.exitCode === null &&
    session.child.signalCode === null;
    attempt += 1
  )
    await delay(50);
  if (session.child.exitCode === null && session.child.signalCode === null)
    session.child.kill("SIGKILL");
};

const submitCapture = async (client, title) => {
  await client.evaluate(
    `(() => { document.querySelector(".sidebar-capture").click(); return true; })()`,
  );
  await waitFor(
    client,
    `document.querySelector("#capture-text") !== null`,
    "CAPTURE_DIALOG_MISSING",
  );
  await client.evaluate(`(() => {
    const input = document.querySelector("#capture-text");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, ${JSON.stringify(title)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    client,
    `document.querySelector(".capture-footer .primary-button")?.disabled === false`,
    "CAPTURE_DISABLED",
  );
  await client.evaluate(
    `(() => { document.querySelector(".capture-footer .primary-button").click(); return true; })()`,
  );
  await waitFor(
    client,
    `[...document.querySelectorAll(".task-row strong")].some((node) => node.textContent === ${JSON.stringify(title)})`,
    "CAPTURE_RESULT_MISSING",
  );
};

const repository = new InMemoryHubRepository();
const service = new HubService(repository);
const initialized = new Set();
let hubPort = await reservePort();
let dropNextSyncResponse = false;
let hub = await startHubServer({
  service,
  host: "127.0.0.1",
  port: hubPort,
  allowInsecureLoopback: true,
  dropSyncResponseAfterCommit: () => {
    const drop = dropNextSyncResponse;
    dropNextSyncResponse = false;
    return drop;
  },
});

const registrationServer = http.createServer((request, response) => {
  void (async () => {
    if (request.method !== "POST" || request.url !== "/register") {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const workspaceId = WorkspaceIdSchema.parse(raw.workspaceId);
    const context = ExecutionContextSchema.parse(raw.context);
    const snapshot = HubWorkspaceSnapshotSchema.parse(raw.snapshot);
    if (!initialized.has(workspaceId)) {
      await service.createWorkspace({ workspaceId, snapshot });
      initialized.add(workspaceId);
    }
    const grant = await service.createEnrollment({
      workspaceId,
      authorization: context,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const enrolled = await service.enroll({
      protocolVersion: 1,
      workspaceId,
      deviceId: raw.deviceId,
      deviceLabel: `Packaged ${process.platform}`,
      enrollmentSecret: grant.enrollmentSecret,
    });
    if (enrolled.outcome !== "success")
      throw new Error(`ENROLLMENT_${enrolled.code}`);
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(
      JSON.stringify({
        workspaceId,
        deviceId: enrolled.deviceId,
        origin: hub.origin,
        deviceCredential: enrolled.deviceCredential,
        providerInstanceId: "constellation.hub:packaged-smoke",
      }),
    );
  })().catch((error) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        code: error instanceof Error ? error.message : "registration_failed",
      }),
    );
  });
});
await new Promise((resolve, reject) => {
  registrationServer.once("error", reject);
  registrationServer.listen(0, "127.0.0.1", resolve);
});
const registrationAddress = registrationServer.address();
if (registrationAddress === null || typeof registrationAddress === "string")
  throw new Error("REGISTRATION_ADDRESS_INVALID");
const registrationUrl = `http://127.0.0.1:${registrationAddress.port}/register`;

let first;
let second;
try {
  process.stderr.write("packaged-hub: enroll device A\n");
  first = await launch(firstUserData, registrationUrl);
  const firstBuild = await first.client.evaluate(
    `window.constellation.getBuildInfo()`,
  );
  const firstStatus = await first.client.evaluate(
    `window.constellation.getDataHomeStatus()`,
  );
  if (firstStatus.descriptor.providerKind !== "coordinated")
    throw new Error("FIRST_DEVICE_NOT_COORDINATED");
  await submitCapture(first.client, baselineTitle);
  const firstSynced = await first.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (firstSynced.syncState !== "current")
    throw new Error("FIRST_CHECKPOINT_NOT_CURRENT");
  const backup = await first.client.evaluate(
    `window.constellation.exportWorkspaceBackup()`,
  );
  if (backup.outcome !== "success") throw new Error("PORTABLE_BACKUP_FAILED");
  await stop(first);
  first = undefined;

  const secondRecovery = path.join(secondUserData, "recovery-smoke");
  fs.mkdirSync(secondRecovery, { recursive: true });
  fs.copyFileSync(
    path.join(
      firstUserData,
      "recovery-smoke",
      "workspace.constellation-backup",
    ),
    path.join(secondRecovery, "workspace.constellation-backup"),
  );
  second = await launch(secondUserData);
  process.stderr.write(
    "packaged-hub: restore portable workspace on device B\n",
  );
  const preview = await second.client.evaluate(
    `window.constellation.prepareWorkspaceRestore({ recoveryCode: ${JSON.stringify(backup.recoveryCode)} })`,
  );
  if (preview.outcome !== "preview")
    throw new Error("SECOND_DEVICE_RESTORE_PREVIEW_FAILED");
  const restored = await second.client.evaluate(
    `window.constellation.confirmWorkspaceRestore({ restoreId: ${JSON.stringify(preview.restoreId)} })`,
  );
  if (
    restored.outcome !== "success" ||
    restored.workspaceId !== firstBuild.initialWorkspaceId
  )
    throw new Error("SECOND_DEVICE_RESTORE_FAILED");
  await stop(second);
  second = undefined;

  process.stderr.write("packaged-hub: enroll device B\n");
  second = await launch(secondUserData, registrationUrl);
  const secondStatus = await second.client.evaluate(
    `window.constellation.getDataHomeStatus()`,
  );
  if (secondStatus.descriptor.providerKind !== "coordinated")
    throw new Error("SECOND_DEVICE_NOT_COORDINATED");
  await second.client.evaluate(`window.constellation.syncDataHome()`);
  await stop(second);
  second = undefined;

  process.stderr.write(
    "packaged-hub: queue offline work and inject response loss\n",
  );
  first = await launch(firstUserData);
  await hub.close();
  await submitCapture(first.client, offlineTitle);
  const queued = await first.client.evaluate(
    `window.constellation.getDataHomeStatus()`,
  );
  if (queued.syncState !== "queued")
    throw new Error(`OFFLINE_WORK_NOT_QUEUED_${queued.syncState}`);

  hub = await startHubServer({
    service,
    host: "127.0.0.1",
    port: hubPort,
    allowInsecureLoopback: true,
    dropSyncResponseAfterCommit: () => {
      const drop = dropNextSyncResponse;
      dropNextSyncResponse = false;
      return drop;
    },
  });
  dropNextSyncResponse = true;
  const uncertain = await first.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (uncertain.syncState !== "unknown_reconcile")
    throw new Error(`LOST_RESPONSE_NOT_UNKNOWN_${uncertain.syncState}`);
  const reconciled = await first.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (reconciled.syncState !== "current")
    throw new Error(`RECONCILIATION_FAILED_${reconciled.syncState}`);
  await stop(first);
  first = undefined;

  process.stderr.write("packaged-hub: converge device B\n");
  second = await launch(secondUserData);
  const converged = await second.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (converged.syncState !== "current")
    throw new Error("SECOND_DEVICE_PULL_FAILED");
  await second.client.evaluate(
    `(() => { window.location.reload(); return true; })()`,
  );
  await waitFor(
    second.client,
    `document.querySelector(".desktop-shell") !== null`,
    "SECOND_DEVICE_RELOAD_FAILED",
  );
  await second.client.evaluate(
    `(() => { document.querySelector('.nav-item[data-surface="tasks"]').click(); return true; })()`,
  );
  await waitFor(
    second.client,
    `[...document.querySelectorAll(".task-row strong")].some((node) => node.textContent === ${JSON.stringify(offlineTitle)})`,
    "SECOND_DEVICE_DID_NOT_CONVERGE",
  );
  if (firstStatus.descriptor.deviceId === secondStatus.descriptor.deviceId)
    throw new Error("DEVICE_IDENTITIES_NOT_DISTINCT");
  await stop(second);
  second = undefined;

  process.stdout.write(
    `${JSON.stringify({
      status: "pass",
      platform: process.platform,
      provider: "constellation.self-hosted-hub/v1",
      packagedProfiles: 2,
      distinctDevices: true,
      offlineQueued: true,
      lostResponseReconciled: true,
      convergedTask: offlineTitle,
    })}\n`,
  );
} finally {
  if (first !== undefined) await stop(first).catch(() => undefined);
  if (second !== undefined) await stop(second).catch(() => undefined);
  await hub.close().catch(() => undefined);
  await new Promise((resolve) => registrationServer.close(resolve));
}
