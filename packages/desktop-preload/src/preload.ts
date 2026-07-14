import { contextBridge, ipcRenderer } from "electron";

import { createRendererClient } from "./client.js";

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
});
