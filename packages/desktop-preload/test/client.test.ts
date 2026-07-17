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
    "addMeetingWorkItem",
    "cancelWorkspaceRestore",
    "checkForRelease",
    "configureJamie",
    "confirmCalendarBlocks",
    "confirmWorkspaceRestore",
    "copyWorkspaceRecoveryCode",
    "createDocumentRevision",
    "createRemoteAgentGrant",
    "createWorkspace",
    "discardCapturePayload",
    "disconnectJamie",
    "downloadRelease",
    "editMeetingWorkItem",
    "enrollHub",
    "executeCommand",
    "exportHubAuthorization",
    "exportSupportReport",
    "exportWorkspaceBackup",
    "getBuildInfo",
    "getCrossWorkspaceCockpit",
    "getDataHomeStatus",
    "getJamieStatus",
    "getMeetingLoop",
    "getReleaseStatus",
    "importStarterWorkspace",
    "installRelease",
    "listDocumentRevisions",
    "listRemoteAgentGrants",
    "listWorkspaces",
    "onAttentionActivated",
    "openDetachedSurface",
    "openDocument",
    "persistDocumentUpdate",
    "prepareAgentCredential",
    "prepareWorkspaceRestore",
    "previewCalendarBlocks",
    "previewStarterWorkspace",
    "requestCalendarAccess",
    "restoreDocumentRevision",
    "revokeRemoteAgentGrant",
    "rotateRemoteAgentGrant",
    "runQuery",
    "selectCapturePayload",
    "stageCapturePayload",
    "switchWorkspace",
    "syncDataHome",
    "syncJamie",
  ]);
  void client.getBuildInfo();
  assert.equal(calls[0]?.channel, DESKTOP_CHANNELS.getBuildInfo);
  void client.getDataHomeStatus();
  assert.equal(calls[1]?.channel, DESKTOP_CHANNELS.getDataHomeStatus);
  void client.syncDataHome();
  assert.equal(calls[2]?.channel, DESKTOP_CHANNELS.syncDataHome);
  void client.exportHubAuthorization();
  assert.equal(calls[3]?.channel, DESKTOP_CHANNELS.exportHubAuthorization);
  void client.getReleaseStatus();
  assert.equal(calls[4]?.channel, DESKTOP_CHANNELS.getReleaseStatus);
  void client.checkForRelease();
  assert.equal(calls[5]?.channel, DESKTOP_CHANNELS.checkForRelease);
  void client.listWorkspaces?.();
  assert.equal(calls[6]?.channel, DESKTOP_CHANNELS.listWorkspaces);
  void client.getCrossWorkspaceCockpit?.();
  assert.equal(calls[7]?.channel, DESKTOP_CHANNELS.getCrossWorkspaceCockpit);
  void client.previewStarterWorkspace?.({});
  assert.equal(calls[8]?.channel, DESKTOP_CHANNELS.previewStarterWorkspace);
  void client.importStarterWorkspace?.({});
  assert.equal(calls[9]?.channel, DESKTOP_CHANNELS.importStarterWorkspace);
  const recoveryCode = `cst1_${Buffer.alloc(32, 3).toString("base64url")}`;
  void client.copyWorkspaceRecoveryCode({ recoveryCode });
  assert.deepEqual(calls[10], {
    channel: DESKTOP_CHANNELS.copyWorkspaceRecoveryCode,
    payload: { recoveryCode },
  });
});
