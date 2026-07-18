import { contextBridge, ipcRenderer } from "electron";

import {
  createRendererClient,
  DESKTOP_CHANNELS,
  isDesktopShellCommand,
  type DesktopShellCommand,
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
