import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

declare global {
  interface Window {
    readonly constellation?: ConstellationRendererClient;
  }
}

export {};
