import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_CHANNELS,
  createRendererClient,
  isWorkspaceChangedEvent,
} from "../src/client.js";
import {
  desktopNavigationSurfaceIds,
  desktopSurfaceIds,
  desktopSurfaceRegistry,
  isDesktopSurface,
} from "../src/surface-registry.js";

test("desktop surface registry is unique, bounded, and derives its vocabulary", () => {
  // Dwanaście: `history` wsiąkł w `library` w fali Knowledge, a `access`
  // i `activity` w `settings` w fali Wycofań — za każdym razem SCALENIE
  // TREŚCI, a nie skasowanie ekranu. Liczba jest tu wpisana ręcznie i to jest
  // jej sens: cel nie może wyjść z rejestru ani do niego wejść po cichu, bo
  // każde takie przejście wymaga wpisu w `retiredDesktopSurfaces` albo osieroca
  // zapisane sesje.
  assert.equal(desktopSurfaceRegistry.length, 12);
  assert.equal(new Set(desktopSurfaceIds).size, desktopSurfaceRegistry.length);
  assert.equal(
    new Set(desktopSurfaceRegistry.map((surface) => surface.label)).size,
    desktopSurfaceRegistry.length,
  );
  const shortcuts = desktopSurfaceRegistry.flatMap((surface) =>
    surface.shortcut === null ? [] : [surface.shortcut],
  );
  // Cyfry są PRZYPISANE DO CELÓW, nie rozdawane po kolei, a przypisuje je
  // prototyp v3 (`v3/app.js:156-169`, pole `key`): cel bez odpowiednika po
  // tamtej stronie nie dostaje cyfry, więc w zbiorze zostają dziury i asercja
  // o ciągłym [1..9] byłaby fałszywa.
  //
  // CAŁY ZBIÓR, NIE POJEDYNCZE WPISY — i to jest różnica wobec poprzedniej
  // wersji tego testu, która pytała wyłącznie o unikalność i zasięg. Mapa
  // rozjeżdżała się z prototypem od cyfry 8 (u nas People, tam Meetings)
  // i ŻADNA asercja tego nie widziała, bo unikalność i zasięg były spełnione
  // przez oba przypisania. Ta sama lekcja co przy `resolveRenewal` w fali C:
  // asertuj cały zbiór kluczy, bo pojedynczy klucz jest ślepy na przestawienie.
  assert.deepEqual(
    desktopSurfaceRegistry.map((surface) => [surface.id, surface.shortcut]),
    [
      ["today", 1],
      ["calendar", 2],
      ["inbox", 3],
      ["tasks", 4],
      ["projects", 5],
      ["pipeline", 6],
      ["organizations", 7],
      ["people", null],
      ["renewals", null],
      ["meetings", 8],
      ["library", 9],
      ["settings", null],
    ],
  );
  assert.equal(new Set(shortcuts).size, shortcuts.length);
  assert.equal(
    shortcuts.every(
      (digit) => Number.isInteger(digit) && digit >= 1 && digit <= 9,
    ),
    true,
  );
  assert.ok(
    shortcuts.length >= 5,
    "a registry with no direct routes is a regression",
  );
  assert.equal(
    desktopSurfaceRegistry.every((surface) => surface.icon.length > 0),
    true,
  );
  assert.equal(isDesktopSurface("library"), true);
  assert.equal(isDesktopSurface("chat"), false);
  // KAŻDY wpis mówi, którymi drzwiami się w niego wchodzi, i dokładnie JEDEN
  // mówi „trybem". To pole zastąpiło filtr `shortcut !== null`, który stał
  // w powłoce przez dwie fale i NIE ODSIEWAŁ NICZEGO, więc Ustawienia rysowały
  // się w lewej kolumnie wbrew dwóm komentarzom mówiącym, że tak nie jest.
  assert.equal(
    desktopSurfaceRegistry.filter((surface) => surface.chrome === "mode")
      .length,
    1,
  );
  assert.deepEqual(
    desktopSurfaceRegistry
      .filter((surface) => surface.chrome === "mode")
      .map((surface) => surface.id),
    ["settings"],
  );
  assert.equal(
    desktopNavigationSurfaceIds.length,
    desktopSurfaceRegistry.length - 1,
  );
  assert.equal(desktopNavigationSurfaceIds.includes("settings"), false);
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
