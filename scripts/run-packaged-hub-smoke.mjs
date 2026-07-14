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
  RealtimeDocumentGateway,
  scopeHubSnapshot,
  snapshotDigest,
  startHubServer,
} from "@constellation/hub";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import WebSocket from "ws";
import * as Y from "yjs";

import { assertPackagedCredentialStoreTestAllowed } from "./desktop/packaged-credential-store-policy.mjs";

assertPackagedCredentialStoreTestAllowed();

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
const memberUserData = path.join(stateRoot, "member-c");
const baselineTitle = "Hub baseline from packaged device A";
const offlineTitle = "Offline packaged work reconciled exactly once";
const rejectedAfterDowngradeTitle = "Must disappear after view downgrade";
const acceptedMemberOfflineTitle = "Member offline edit accepted after regrant";
const privateSentinelTitle = "PRIVATE_SCOPE_SENTINEL_MUST_NEVER_APPEAR";
const packagedCommentBody =
  "Packaged commenter mentions the owner in exact Task context.";
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

const reloadAndWait = async (client, selector, code) => {
  const nonce = crypto.randomUUID();
  await client.evaluate(`(() => {
    sessionStorage.setItem("constellation-smoke-reload", ${JSON.stringify(nonce)});
    window.__constellationSmokeBeforeReload = ${JSON.stringify(nonce)};
    window.location.reload();
    return true;
  })()`);
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const ready = await client.evaluate(`
        sessionStorage.getItem("constellation-smoke-reload") === ${JSON.stringify(nonce)} &&
        window.__constellationSmokeBeforeReload !== ${JSON.stringify(nonce)} &&
        document.querySelector(${JSON.stringify(selector)}) !== null
      `);
      if (ready) {
        await client.evaluate(
          `sessionStorage.removeItem("constellation-smoke-reload")`,
        );
        return;
      }
    } catch {
      // CDP can briefly target the destroyed execution context during reload.
    }
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

const launch = async (userData, registrationUrl, bootstrap) => {
  const port = await reservePort();
  const recoveryRoot = path.join(userData, "recovery-smoke");
  fs.mkdirSync(recoveryRoot, { recursive: true });
  if (bootstrap !== undefined) {
    fs.writeFileSync(
      path.join(recoveryRoot, "hub-bootstrap.json"),
      `${JSON.stringify(bootstrap)}\n`,
      { mode: 0o600 },
    );
  }
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
const connections = new Map();
let hubPort = await reservePort();
let dropNextSyncResponse = false;
let realtimeDocuments = new RealtimeDocumentGateway(service, repository);
let hub = await startHubServer({
  service,
  realtimeDocuments,
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
    connections.set(context.principalId, {
      context,
      credential: enrolled.deviceCredential,
      deviceId: enrolled.deviceId,
    });
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
let member;
let ownerDocumentProvider;
let ownerDocumentSocket;
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

  const workspaceId = WorkspaceIdSchema.parse(firstBuild.initialWorkspaceId);
  const ownerConnection = [...connections.values()].find(
    (value) => value.context.workspaceId === workspaceId,
  );
  if (ownerConnection === undefined)
    throw new Error("OWNER_CONNECTION_NOT_CAPTURED");
  const memberPrincipalId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const memberSpaceGrantId = crypto.randomUUID();
  const memberCredentialId = crypto.randomUUID();
  const memberGrantId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const collaborativeDocumentId = crypto.randomUUID();

  const executeOwnerPolicy = async (commandName, payload) => {
    const current = await repository.withWorkspaceLock(
      workspaceId,
      (state) => ({
        checkpoint: state.checkpoint.toString(),
        workspace: state.snapshot.workspaces[0],
        membership: state.snapshot.memberships.find(
          (value) => value.id === membershipId,
        ),
        grant: state.snapshot.spaceGrants.find(
          (value) => value.id === memberSpaceGrantId,
        ),
        task: state.snapshot.tasks.find((value) => value.id === payload.taskId),
      }),
    );
    if (current.workspace === undefined)
      throw new Error("AUTHORITATIVE_WORKSPACE_MISSING");
    const expectedVersions =
      commandName === "document.create"
        ? {}
        : commandName === "task.assign"
          ? { [payload.taskId]: current.task?.version }
          : { [workspaceId]: current.workspace.version };
    if (commandName === "workspace.memberSetAccess") {
      expectedVersions[membershipId] = current.membership?.version;
      expectedVersions[memberSpaceGrantId] = current.grant?.version;
    }
    if (commandName === "workspace.memberRevoke") {
      expectedVersions[membershipId] = current.membership?.version;
    }
    const command = {
      contractVersion: 1,
      commandName,
      commandId: crypto.randomUUID(),
      workspaceId,
      idempotencyKey: `packaged-r4-${commandName}-${crypto.randomUUID()}`,
      expectedVersions,
      correlationId: crypto.randomUUID(),
      payload,
    };
    const result = await service.sync(ownerConnection.credential, {
      protocolVersion: 1,
      workspaceId,
      deviceId: ownerConnection.deviceId,
      checkpoint: current.checkpoint,
      commands: [command],
    });
    if (
      result.outcome !== "success" ||
      result.receipts[0]?.outcome.outcome !== "success"
    ) {
      throw new Error(`OWNER_POLICY_${commandName}_FAILED`);
    }
  };

  const authoritative = await repository.withWorkspaceLock(
    workspaceId,
    (state) => state.snapshot,
  );
  const rootSpaceId = authoritative.workspaces[0]?.rootSpaceId;
  if (rootSpaceId === undefined) throw new Error("ROOT_SPACE_MISSING");
  await executeOwnerPolicy("workspace.memberAdd", {
    membershipId,
    spaceGrantId: memberSpaceGrantId,
    principalId: memberPrincipalId,
    displayName: "Packaged R4 member",
    role: "member",
    spaceId: rootSpaceId,
    access: "edit",
  });
  await executeOwnerPolicy("document.create", {
    documentId: collaborativeDocumentId,
    spaceId: rootSpaceId,
    title: "Packaged collaboration notes",
  });

  const privateSpaceId = crypto.randomUUID();
  await repository.withWorkspaceLock(workspaceId, (state) => {
    const rootSpace = state.snapshot.spaces[0];
    const sourceTask = state.snapshot.tasks[0];
    const sourceCapture = state.snapshot.captures[0];
    if (
      rootSpace === undefined ||
      sourceTask === undefined ||
      sourceCapture === undefined
    )
      throw new Error("PRIVATE_SENTINEL_SOURCE_MISSING");
    const privateCaptureId = crypto.randomUUID();
    state.snapshot = HubWorkspaceSnapshotSchema.parse({
      ...state.snapshot,
      spaces: [
        ...state.snapshot.spaces,
        { ...rootSpace, id: privateSpaceId, name: "Owner private" },
      ],
      captures: [
        ...state.snapshot.captures,
        {
          ...sourceCapture,
          id: privateCaptureId,
          spaceId: privateSpaceId,
          originalText: privateSentinelTitle,
        },
      ],
      tasks: [
        ...state.snapshot.tasks,
        {
          ...sourceTask,
          id: crypto.randomUUID(),
          spaceId: privateSpaceId,
          sourceCaptureId: privateCaptureId,
          title: privateSentinelTitle,
        },
      ],
    });
    state.checkpoint += 1n;
    state.snapshotDigest = snapshotDigest(state.snapshot);
  });
  const sharedTask = await repository.withWorkspaceLock(workspaceId, (state) =>
    state.snapshot.tasks.find((task) => task.spaceId === rootSpaceId),
  );
  if (sharedTask === undefined) throw new Error("SHARED_TASK_MISSING");
  await executeOwnerPolicy("task.assign", {
    assignmentId,
    taskId: sharedTask.id,
    assigneePrincipalId: memberPrincipalId,
  });

  const memberContext = {
    ...ownerConnection.context,
    principalId: memberPrincipalId,
    credentialId: memberCredentialId,
    grantId: memberGrantId,
    spaceScope: [rootSpaceId],
  };
  const memberSnapshot = await repository.withWorkspaceLock(
    workspaceId,
    (state) => scopeHubSnapshot(state.snapshot, workspaceId, memberContext),
  );
  if (memberSnapshot === undefined)
    throw new Error("MEMBER_SCOPED_SNAPSHOT_MISSING");
  if (
    JSON.stringify(memberSnapshot).includes(privateSentinelTitle) ||
    memberSnapshot.spaces.some((space) => space.id === privateSpaceId)
  ) {
    throw new Error("MEMBER_BOOTSTRAP_LEAKED_PRIVATE_SCOPE");
  }
  const memberBootstrap = {
    identity: {
      workspaceId,
      rootSpaceId,
      principalId: memberPrincipalId,
      credentialId: memberCredentialId,
      grantId: memberGrantId,
    },
    snapshot: memberSnapshot,
  };
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

  process.stderr.write("packaged-hub: bootstrap scoped member profile\n");
  member = await launch(memberUserData, registrationUrl, memberBootstrap);
  const memberStatus = await member.client.evaluate(
    `window.constellation.getDataHomeStatus()`,
  );
  if (memberStatus.descriptor.providerKind !== "coordinated")
    throw new Error("MEMBER_NOT_COORDINATED");
  const leakedPrivateText = await member.client.evaluate(
    `document.body.innerText.includes(${JSON.stringify(privateSentinelTitle)})`,
  );
  if (leakedPrivateText) throw new Error("MEMBER_UI_LEAKED_PRIVATE_SCOPE");
  await member.client.evaluate(
    `(() => { document.querySelector('.nav-item[data-surface="tasks"]').click(); return true; })()`,
  );
  await waitFor(
    member.client,
    `[...document.querySelectorAll(".task-assignee")].some((select) => select.value === ${JSON.stringify(memberPrincipalId)})`,
    "MEMBER_ASSIGNMENT_NOT_RENDERED",
  );

  process.stderr.write(
    "packaged-hub: reject queued member edit after view downgrade\n",
  );
  await hub.close();
  await submitCapture(member.client, rejectedAfterDowngradeTitle);
  await executeOwnerPolicy("workspace.memberSetAccess", {
    membershipId,
    spaceGrantId: memberSpaceGrantId,
    access: "view",
  });
  realtimeDocuments = new RealtimeDocumentGateway(service, repository);
  hub = await startHubServer({
    service,
    realtimeDocuments,
    host: "127.0.0.1",
    port: hubPort,
    allowInsecureLoopback: true,
  });
  const downgraded = await member.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (downgraded.syncState !== "current")
    throw new Error(`MEMBER_DOWNGRADE_SYNC_FAILED_${downgraded.syncState}`);
  await reloadAndWait(
    member.client,
    ".desktop-shell",
    "MEMBER_DOWNGRADE_RELOAD_FAILED",
  );
  const rejectedStillVisible = await member.client.evaluate(
    `document.body.innerText.includes(${JSON.stringify(rejectedAfterDowngradeTitle)})`,
  );
  if (rejectedStillVisible)
    throw new Error("REJECTED_MEMBER_EDIT_REMAINED_VISIBLE");

  process.stderr.write(
    "packaged-hub: prove commenter boundary and scoped mention attention\n",
  );
  await executeOwnerPolicy("workspace.memberSetAccess", {
    membershipId,
    spaceGrantId: memberSpaceGrantId,
    access: "comment",
  });
  await member.client.evaluate(`window.constellation.syncDataHome()`);
  await reloadAndWait(
    member.client,
    ".desktop-shell",
    "MEMBER_COMMENTER_RELOAD_FAILED",
  );
  await member.client.evaluate(`(() => {
    document.querySelector('.nav-item[data-surface="tasks"]').click();
    return true;
  })()`);
  await waitFor(
    member.client,
    `[...document.querySelectorAll(".task-row")].some((row) => row.textContent.includes(${JSON.stringify(sharedTask.title)}))`,
    "COMMENT_TARGET_NOT_RENDERED",
  );
  await member.client.evaluate(`(() => {
    const row = [...document.querySelectorAll(".task-row")].find((candidate) => candidate.textContent.includes(${JSON.stringify(sharedTask.title)}));
    row.querySelector(".task-copy").click();
    return true;
  })()`);
  await waitFor(
    member.client,
    `document.querySelector(".comment-composer textarea") !== null && [...document.querySelectorAll(".comment-composer select option")].some((option) => option.value === ${JSON.stringify(ownerConnection.context.principalId)})`,
    "COMMENT_COMPOSER_NOT_RENDERED",
  );
  await member.client.evaluate(`(() => {
    const textarea = document.querySelector(".comment-composer textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, ${JSON.stringify(packagedCommentBody)});
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const mentions = document.querySelector(".comment-composer select");
    for (const option of mentions.options) option.selected = option.value === ${JSON.stringify(ownerConnection.context.principalId)};
    mentions.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    member.client,
    `document.querySelector(".comment-composer button[type=submit]")?.disabled === false`,
    "COMMENT_SUBMIT_DISABLED",
  );
  await member.client.evaluate(
    `(() => { document.querySelector(".comment-composer button[type=submit]").click(); return true; })()`,
  );
  await waitFor(
    member.client,
    `[...document.querySelectorAll(".comment-entry p")].some((node) => node.textContent === ${JSON.stringify(packagedCommentBody)})`,
    "COMMENT_NOT_RENDERED",
  );
  const forbiddenCapture = await member.client.evaluate(
    `window.constellation.executeCommand(${JSON.stringify({
      contractVersion: 1,
      commandName: "capture.submitText",
      commandId: crypto.randomUUID(),
      workspaceId,
      idempotencyKey: `commenter-cannot-edit-${crypto.randomUUID()}`,
      expectedVersions: {},
      correlationId: crypto.randomUUID(),
      payload: {
        spaceId: rootSpaceId,
        originalText: "COMMENTER_MUST_NOT_CREATE_WORK",
        deviceId: "packaged-commenter-boundary",
        source: "in_app_quick_capture",
      },
    })})`,
  );
  if (
    forbiddenCapture.kind !== "command_outcome" ||
    forbiddenCapture.outcome.outcome !== "rejected" ||
    forbiddenCapture.outcome.diagnosticCode !== "authorization.denied"
  ) {
    throw new Error("COMMENTER_MUTATED_WORK");
  }
  const commenterSynced = await member.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (commenterSynced.syncState !== "current")
    throw new Error("COMMENT_MENTION_NOT_SYNCED");

  first = await launch(firstUserData);
  const ownerAttentionSynced = await first.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (ownerAttentionSynced.syncState !== "current")
    throw new Error("OWNER_ATTENTION_NOT_SYNCED");
  await reloadAndWait(
    first.client,
    ".desktop-shell",
    "OWNER_ATTENTION_RELOAD_FAILED",
  );
  await first.client.evaluate(
    `(() => { document.querySelector('.nav-item[data-surface="attention"]').click(); return true; })()`,
  );
  await waitFor(
    first.client,
    `[...document.querySelectorAll(".attention-main strong")].some((node) => node.textContent === ${JSON.stringify(sharedTask.title)})`,
    "OWNER_ATTENTION_NOT_RENDERED",
  );
  await first.client.evaluate(`(() => {
    const item = [...document.querySelectorAll(".attention-main")].find((candidate) => candidate.textContent.includes(${JSON.stringify(sharedTask.title)}));
    item.click();
    return true;
  })()`);
  await waitFor(
    first.client,
    `[...document.querySelectorAll(".comment-entry p")].some((node) => node.textContent === ${JSON.stringify(packagedCommentBody)})`,
    "ATTENTION_DID_NOT_OPEN_EXACT_COMMENT_CONTEXT",
  );
  await stop(first);
  first = undefined;

  await executeOwnerPolicy("workspace.memberSetAccess", {
    membershipId,
    spaceGrantId: memberSpaceGrantId,
    access: "view",
  });
  await member.client.evaluate(`window.constellation.syncDataHome()`);
  await reloadAndWait(
    member.client,
    ".desktop-shell",
    "MEMBER_VIEW_RELOAD_FAILED",
  );
  await member.client.evaluate(
    `(() => { document.querySelector('.nav-item[data-surface="tasks"]').click(); return true; })()`,
  );
  await waitFor(
    member.client,
    `[...document.querySelectorAll(".task-row")].some((row) => row.textContent.includes(${JSON.stringify(sharedTask.title)}))`,
    "VIEWER_COMMENT_TARGET_NOT_RENDERED",
  );
  await member.client.evaluate(`(() => {
    const row = [...document.querySelectorAll(".task-row")].find((candidate) => candidate.textContent.includes(${JSON.stringify(sharedTask.title)}));
    row.querySelector(".task-copy").click();
    return true;
  })()`);
  await waitFor(
    member.client,
    `document.querySelector(".comment-composer textarea")?.disabled === true`,
    "VIEWER_COMMENT_COMPOSER_NOT_DISABLED",
  );

  await executeOwnerPolicy("workspace.memberSetAccess", {
    membershipId,
    spaceGrantId: memberSpaceGrantId,
    access: "edit",
  });
  await member.client.evaluate(`window.constellation.syncDataHome()`);
  await hub.close();
  await submitCapture(member.client, acceptedMemberOfflineTitle);
  realtimeDocuments = new RealtimeDocumentGateway(service, repository);
  hub = await startHubServer({
    service,
    realtimeDocuments,
    host: "127.0.0.1",
    port: hubPort,
    allowInsecureLoopback: true,
  });
  const memberAccepted = await member.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (memberAccepted.syncState !== "current")
    throw new Error("MEMBER_OFFLINE_EDIT_NOT_ACCEPTED");

  process.stderr.write(
    "packaged-hub: converge native document, restore revision, and enforce downgrade\n",
  );
  await member.client.evaluate(`(() => {
    document.querySelector('.nav-item[data-surface="documents"]').click();
    return true;
  })()`);
  await waitFor(
    member.client,
    `document.querySelector(".document-canvas") !== null`,
    "PACKAGED_DOCUMENT_EDITOR_MISSING",
  );
  const ownerSessionResponse = await fetch(
    `${hub.origin}/v1/documents/session`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${ownerConnection.credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspaceId,
        deviceId: ownerConnection.deviceId,
        documentId: collaborativeDocumentId,
      }),
    },
  );
  if (!ownerSessionResponse.ok)
    throw new Error("PACKAGED_OWNER_DOCUMENT_SESSION_REJECTED");
  const ownerSession = await ownerSessionResponse.json();
  let ownerDocument = new Y.Doc();
  ownerDocumentSocket = new HocuspocusProviderWebsocket({
    url: `${hub.origin.replace(/^http/u, "ws")}/v1/realtime`,
    WebSocketPolyfill: WebSocket,
  });
  ownerDocumentProvider = new HocuspocusProvider({
    websocketProvider: ownerDocumentSocket,
    name: ownerSession.room,
    token: ownerSession.token,
    document: ownerDocument,
  });
  ownerDocumentProvider.attach();
  for (
    let attempt = 0;
    attempt < 300 && !ownerDocumentProvider.synced;
    attempt += 1
  )
    await delay(100);
  if (!ownerDocumentProvider.synced)
    throw new Error("PACKAGED_OWNER_DOCUMENT_NOT_SYNCED");
  const packagedDocumentText =
    "Wspólny zakres pilotażu z aplikacji pakietowej.";
  await member.client.evaluate(`(() => {
    const input = document.querySelector(".document-canvas");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
      input,
      ${JSON.stringify(packagedDocumentText)},
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  for (
    let attempt = 0;
    attempt < 300 &&
    ownerDocument.getText("content").toString() !== packagedDocumentText;
    attempt += 1
  )
    await delay(100);
  if (ownerDocument.getText("content").toString() !== packagedDocumentText)
    throw new Error("PACKAGED_DOCUMENT_MEMBER_EDIT_NOT_CONVERGED");
  ownerDocument
    .getText("content")
    .insert(
      ownerDocument.getText("content").length,
      " Potwierdzone przez właściciela.",
    );
  const ownerCompletedText = `${packagedDocumentText} Potwierdzone przez właściciela.`;
  await waitFor(
    member.client,
    `document.querySelector(".document-canvas")?.value === ${JSON.stringify(ownerCompletedText)}`,
    "PACKAGED_DOCUMENT_OWNER_EDIT_NOT_CONVERGED",
  );
  ownerDocumentProvider.destroy();
  ownerDocumentProvider = undefined;
  ownerDocumentSocket.destroy();
  ownerDocumentSocket = undefined;
  ownerDocument.destroy();
  await hub.close();
  await waitFor(
    member.client,
    `document.querySelector(".document-presence.offline") !== null`,
    "PACKAGED_DOCUMENT_OFFLINE_STATE_MISSING",
  );
  const offlineCompletedText = `${ownerCompletedText} Dopisek offline.`;
  await member.client.evaluate(`(() => {
    const input = document.querySelector(".document-canvas");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
      input,
      ${JSON.stringify(offlineCompletedText)},
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    member.client,
    `document.querySelector(".document-presence")?.textContent.includes("zmian oczekuje") === true`,
    "PACKAGED_DOCUMENT_OFFLINE_UPDATE_NOT_QUEUED",
  );
  realtimeDocuments = new RealtimeDocumentGateway(service, repository);
  hub = await startHubServer({
    service,
    realtimeDocuments,
    host: "127.0.0.1",
    port: hubPort,
    allowInsecureLoopback: true,
  });
  const resumedOwnerSessionResponse = await fetch(
    `${hub.origin}/v1/documents/session`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${ownerConnection.credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspaceId,
        deviceId: ownerConnection.deviceId,
        documentId: collaborativeDocumentId,
      }),
    },
  );
  if (!resumedOwnerSessionResponse.ok)
    throw new Error("PACKAGED_OWNER_DOCUMENT_RESUME_REJECTED");
  const resumedOwnerSession = await resumedOwnerSessionResponse.json();
  ownerDocument = new Y.Doc();
  ownerDocumentSocket = new HocuspocusProviderWebsocket({
    url: `${hub.origin.replace(/^http/u, "ws")}/v1/realtime`,
    WebSocketPolyfill: WebSocket,
  });
  ownerDocumentProvider = new HocuspocusProvider({
    websocketProvider: ownerDocumentSocket,
    name: resumedOwnerSession.room,
    token: resumedOwnerSession.token,
    document: ownerDocument,
  });
  ownerDocumentProvider.attach();
  for (
    let attempt = 0;
    attempt < 300 &&
    ownerDocument.getText("content").toString() !== offlineCompletedText;
    attempt += 1
  )
    await delay(100);
  if (ownerDocument.getText("content").toString() !== offlineCompletedText)
    throw new Error("PACKAGED_DOCUMENT_OFFLINE_EDIT_NOT_CONVERGED");
  await waitFor(
    member.client,
    `document.querySelector(".document-presence.current") !== null`,
    "PACKAGED_DOCUMENT_DID_NOT_RECONNECT",
  );
  await member.client.evaluate(`(() => {
    const input = document.querySelector("#revision-name");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
      input,
      "Review packaged",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    member.client,
    `document.querySelector(".document-revisions form button")?.disabled === false`,
    "PACKAGED_DOCUMENT_REVISION_DISABLED",
  );
  await member.client.evaluate(
    `(() => { document.querySelector(".document-revisions form button").click(); return true; })()`,
  );
  await waitFor(
    member.client,
    `[...document.querySelectorAll(".document-revisions li strong")].some((node) => node.textContent === "Review packaged")`,
    "PACKAGED_DOCUMENT_REVISION_MISSING",
  );
  ownerDocument.getText("content").insert(0, "TYMCZASOWE ");
  await waitFor(
    member.client,
    `document.querySelector(".document-canvas")?.value.startsWith("TYMCZASOWE") === true`,
    "PACKAGED_DOCUMENT_TEMP_EDIT_NOT_CONVERGED",
  );
  await member.client.evaluate(`(() => {
    window.confirm = () => true;
    document.querySelector(".document-revisions li .text-button").click();
    return true;
  })()`);
  for (
    let attempt = 0;
    attempt < 300 &&
    ownerDocument.getText("content").toString() !== offlineCompletedText;
    attempt += 1
  )
    await delay(100);
  if (ownerDocument.getText("content").toString() !== offlineCompletedText)
    throw new Error("PACKAGED_DOCUMENT_RESTORE_NOT_CONVERGED");
  await executeOwnerPolicy("workspace.memberSetAccess", {
    membershipId,
    spaceGrantId: memberSpaceGrantId,
    access: "view",
  });
  await realtimeDocuments.reauthorizeSessions();
  await waitFor(
    member.client,
    `document.querySelector(".document-canvas")?.readOnly === true`,
    "PACKAGED_DOCUMENT_DOWNGRADE_NOT_READ_ONLY",
  );
  ownerDocumentProvider.destroy();
  ownerDocumentProvider = undefined;
  ownerDocumentSocket.destroy();
  ownerDocumentSocket = undefined;
  ownerDocument.destroy();

  process.stderr.write("packaged-hub: revoke member and purge projection\n");
  await executeOwnerPolicy("workspace.memberRevoke", { membershipId });
  const revoked = await member.client.evaluate(
    `window.constellation.syncDataHome()`,
  );
  if (
    revoked.availability !== "unavailable" ||
    revoked.detailCode !== "membership_revoked"
  ) {
    throw new Error(`MEMBER_REVOCATION_NOT_ENFORCED_${revoked.detailCode}`);
  }
  await stop(member);
  member = undefined;
  member = await launch(memberUserData);
  const recoveryVisible = await member.client.evaluate(
    `document.querySelector(".recovery-required-state") !== null`,
  );
  if (!recoveryVisible)
    throw new Error("REVOKED_MEMBER_REOPENED_PURGED_PROJECTION");
  await stop(member);
  member = undefined;

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
    realtimeDocuments: (realtimeDocuments = new RealtimeDocumentGateway(
      service,
      repository,
    )),
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
  await reloadAndWait(
    second.client,
    ".desktop-shell",
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
      packagedProfiles: 3,
      distinctHumanPrincipals: 2,
      distinctDevices: true,
      offlineQueued: true,
      lostResponseReconciled: true,
      convergedTask: offlineTitle,
      scopedBootstrap: true,
      privateScopeLeakFree: true,
      staleEditRejectedAfterDowngrade: true,
      memberOfflineEditAccepted: true,
      commenterMentionAttentionRouted: true,
      realtimeDocumentConverged: true,
      namedRevisionRestored: true,
      documentDowngradeReadOnly: true,
      membershipRevocationPurged: true,
    })}\n`,
  );
} finally {
  ownerDocumentProvider?.destroy();
  ownerDocumentSocket?.destroy();
  if (first !== undefined) await stop(first).catch(() => undefined);
  if (second !== undefined) await stop(second).catch(() => undefined);
  if (member !== undefined) await stop(member).catch(() => undefined);
  await hub.close().catch(() => undefined);
  await new Promise((resolve) => registrationServer.close(resolve));
}
