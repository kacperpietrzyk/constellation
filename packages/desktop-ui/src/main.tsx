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
    new URLSearchParams(window.location.search).get("surface") === "data-home"
  ) {
    const { DataHomeHarness } = await import("./dev/DataHomeHarness.js");
    content = <DataHomeHarness />;
  }

  createRoot(root).render(<StrictMode>{content}</StrictMode>);
};

void render();
