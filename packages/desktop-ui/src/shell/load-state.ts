import type { DesktopBuildInfo } from "@constellation/desktop-preload/client";

import type { DesktopSnapshot } from "../client/workflow.js";

export type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "recovery"; readonly build: DesktopBuildInfo }
  | { readonly kind: "unavailable" | "error"; readonly message: string }
  | { readonly kind: "ready"; readonly snapshot: DesktopSnapshot };
