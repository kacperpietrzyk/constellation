import assert from "node:assert/strict";
import test from "node:test";

import { DESKTOP_CHANNELS, createRendererClient } from "../src/client.js";

test("renderer client exposes only semantic application and recovery routes", () => {
  const calls: { channel: string; payload: unknown }[] = [];
  const client = createRendererClient((channel, payload) => {
    calls.push({ channel, payload });
    return Promise.resolve({});
  });

  assert.deepEqual(Object.keys(client).sort(), [
    "acknowledgeDocumentUpdates",
    "cancelWorkspaceRestore",
    "confirmWorkspaceRestore",
    "createDocumentRevision",
    "enrollHub",
    "executeCommand",
    "exportHubAuthorization",
    "exportWorkspaceBackup",
    "getBuildInfo",
    "getDataHomeStatus",
    "listDocumentRevisions",
    "onAttentionActivated",
    "openDocument",
    "persistDocumentUpdate",
    "prepareAgentCredential",
    "prepareWorkspaceRestore",
    "restoreDocumentRevision",
    "runQuery",
    "syncDataHome",
  ]);
  void client.getBuildInfo();
  assert.equal(calls[0]?.channel, DESKTOP_CHANNELS.getBuildInfo);
  void client.getDataHomeStatus();
  assert.equal(calls[1]?.channel, DESKTOP_CHANNELS.getDataHomeStatus);
  void client.syncDataHome();
  assert.equal(calls[2]?.channel, DESKTOP_CHANNELS.syncDataHome);
  void client.exportHubAuthorization();
  assert.equal(calls[3]?.channel, DESKTOP_CHANNELS.exportHubAuthorization);
});
