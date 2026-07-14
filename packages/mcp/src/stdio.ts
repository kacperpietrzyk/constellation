#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { invokeDesktopMcp } from "./ipc-client.js";
import { createConstellationMcpServer } from "./server.js";

const credentialFile = process.env.CONSTELLATION_MCP_CREDENTIAL_FILE;
if (credentialFile === undefined || credentialFile.length === 0) {
  process.stderr.write(
    "CONSTELLATION_MCP_CREDENTIAL_FILE must point to a Constellation-generated local agent descriptor.\n",
  );
  process.exitCode = 78;
} else {
  const server = createConstellationMcpServer({
    invoke: (invocation) => invokeDesktopMcp(credentialFile, invocation),
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
