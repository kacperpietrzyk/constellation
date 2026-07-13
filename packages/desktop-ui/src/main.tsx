import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing renderer root.");

createRoot(root).render(
  <StrictMode>
    <main>Constellation M0</main>
  </StrictMode>,
);
