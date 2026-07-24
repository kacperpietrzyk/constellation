import { contextBridge, ipcRenderer } from "electron";

import {
  createRendererClient,
  DESKTOP_CHANNELS,
  isDesktopShellCommand,
  isWorkspaceChangedEvent,
  type DesktopShellCommand,
  type WorkspaceChangedEvent,
} from "./client.js";

const client = createRendererClient((channel, payload) =>
  ipcRenderer.invoke(channel, payload),
);
contextBridge.exposeInMainWorld("constellation", {
  ...client,
  onAttentionActivated: (listener: (destination: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, destination: unknown) =>
      listener(destination);
    ipcRenderer.on("constellation:attention:activated", handler);
    return () =>
      ipcRenderer.removeListener("constellation:attention:activated", handler);
  },
  onWorkspaceChanged: (listener: (event: WorkspaceChangedEvent) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      changed: unknown,
    ): void => {
      if (isWorkspaceChangedEvent(changed)) listener(changed);
    };
    ipcRenderer.on(DESKTOP_CHANNELS.workspaceChanged, handler);
    return () =>
      ipcRenderer.removeListener(DESKTOP_CHANNELS.workspaceChanged, handler);
  },
  onShellCommand: (listener: (command: DesktopShellCommand) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      command: unknown,
    ): void => {
      if (isDesktopShellCommand(command)) listener(command);
    };
    ipcRenderer.on(DESKTOP_CHANNELS.shellCommand, handler);
    return () =>
      ipcRenderer.removeListener(DESKTOP_CHANNELS.shellCommand, handler);
  },
});
