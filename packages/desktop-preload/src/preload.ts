import { contextBridge, ipcRenderer } from "electron";

import { createRendererClient } from "./client.js";

contextBridge.exposeInMainWorld(
  "constellation",
  createRendererClient((channel, payload) =>
    ipcRenderer.invoke(channel, payload),
  ),
);
