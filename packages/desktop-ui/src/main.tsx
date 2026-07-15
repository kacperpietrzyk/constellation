import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./tokens.css";
import "./styles.css";

const render = async (): Promise<void> => {
  const root = document.getElementById("root");
  if (root === null) throw new Error("Missing renderer root.");
  let content: ReactNode = <App client={window.constellation} />;
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("surface") === "capture"
  ) {
    const { CaptureHarness } = await import("./dev/CaptureHarness.js");
    content = <CaptureHarness />;
  }
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("surface") === "data-home"
  ) {
    const { DataHomeHarness } = await import("./dev/DataHomeHarness.js");
    content = <DataHomeHarness />;
  }
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("surface") === "meetings"
  ) {
    const { MeetingsHarness } = await import("./dev/MeetingsHarness.js");
    content = <MeetingsHarness />;
  }
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("surface") === "access"
  ) {
    const { AccessHarness } = await import("./dev/AccessHarness.js");
    content = <AccessHarness />;
  }
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("surface") ===
      "collaboration"
  ) {
    const { CollaborationHarness } =
      await import("./dev/CollaborationHarness.js");
    content = <CollaborationHarness />;
  }
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("surface") === "knowledge"
  ) {
    const { KnowledgeHarness } = await import("./dev/KnowledgeHarness.js");
    content = <KnowledgeHarness />;
  }
  if (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("surface") === "strategic"
  ) {
    const { StrategicDepthHarness } =
      await import("./dev/StrategicDepthHarness.js");
    content = <StrategicDepthHarness />;
  }

  createRoot(root).render(<StrictMode>{content}</StrictMode>);
};

void render();
