import { spawn } from "node:child_process";

import { agentDescriptors, devStateRoot } from "./dev-state.mjs";
import { mcpServerEntry } from "./dev-snapshot.mjs";

const [descriptor] = agentDescriptors(devStateRoot());
if (descriptor === undefined) {
  console.error(
    "No agent grant in the development state root. Run: npm run dev:snapshot",
  );
  process.exit(1);
}

const server = mcpServerEntry({ descriptor });
// Fetched on demand rather than added as a dependency.
const inspector = spawn(
  "npx",
  ["--yes", "@modelcontextprotocol/inspector", server.command, ...server.args],
  { env: { ...process.env, ...server.env }, stdio: "inherit" },
);
inspector.once("exit", (code) => {
  process.exitCode = code ?? 0;
});
