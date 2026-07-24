import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_CHANNELS,
  createRendererClient,
  isWorkspaceChangedEvent,
} from "../src/client.js";
import {
  desktopSurfaceIds,
  desktopSurfaceRegistry,
  isDesktopSurface,
} from "../src/surface-registry.js";

test("desktop surface registry is unique, bounded, and derives its vocabulary", () => {
  assert.equal(desktopSurfaceRegistry.length, 12);
  assert.equal(new Set(desktopSurfaceIds).size, desktopSurfaceRegistry.length);
  assert.equal(
    new Set(desktopSurfaceRegistry.map((surface) => surface.label)).size,
    desktopSurfaceRegistry.length,
  );
  const shortcuts = desktopSurfaceRegistry.flatMap((surface) =>
    surface.shortcut === null ? [] : [surface.shortcut],
  );
  assert.deepEqual(shortcuts, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(shortcuts).size, shortcuts.length);
  assert.equal(
    desktopSurfaceRegistry.every((surface) => surface.icon.length > 0),
    true,
  );
  assert.equal(isDesktopSurface("documents"), true);
  assert.equal(isDesktopSurface("chat"), false);
});

test("renderer client exposes only semantic application and recovery routes", () => {
  const calls: { channel: string; payload: unknown }[] = [];
  const client = createRendererClient((channel, payload) => {
    calls.push({ channel, payload });
    return Promise.resolve({});
  });

  assert.deepEqual(Object.keys(client).sort(), [
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
    "exportSupportReport",
    "exportWorkspaceBackup",
    "getBuildInfo",
    "getCrossWorkspaceCockpit",
    "getDataHomeStatus",
    "getJamieStatus",
    "getMeetingLoop",
    "getReleaseStatus",
    "importStarterWorkspace",
    "inspectManagedPayload",
    "installRelease",
    "listCollaborativeContentRevisions",
    "listDocumentRevisions",
    "listRemoteAgentGrants",
    "listWorkspaces",
    "onAttentionActivated",
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

test("a workspace change event crossing the bridge is validated, never trusted", () => {
  const workspaceId = "51000000-0000-4000-8000-000000000001";
  assert.equal(isWorkspaceChangedEvent({ workspaceId, origin: "agent" }), true);
  // The renderer reloads its whole projection on this signal, so anything that
  // is not the shape the main process sends has to stop at the bridge.
  assert.equal(isWorkspaceChangedEvent({ workspaceId }), false);
  assert.equal(
    isWorkspaceChangedEvent({ workspaceId, origin: "desktop" }),
    false,
  );
  assert.equal(
    isWorkspaceChangedEvent({ workspaceId: "", origin: "agent" }),
    false,
  );
  assert.equal(isWorkspaceChangedEvent(undefined), false);
  assert.equal(isWorkspaceChangedEvent("agent"), false);
});
