import assert from "node:assert/strict";
import { it } from "node:test";

import { buildOperationCatalog } from "../src/catalog.js";

it("publishes Project reclassification command and authoritative preview to local MCP operators", () => {
  const catalog = buildOperationCatalog(["project.reclassify"]);
  const command = catalog.operations.find(
    (operation) => operation.name === "project.reclassify",
  );
  const preview = catalog.operations.find(
    (operation) => operation.name === "project.reclassificationPreview",
  );

  assert.equal(command?.kind, "command");
  assert.equal(command?.requiredCapability, "project.reclassify");
  assert.equal(command?.revertable, "always");
  assert.match(JSON.stringify(command?.envelopeSchema), /destination/u);
  assert.equal(preview?.kind, "query");
  assert.equal(preview?.requiredCapability, "project.reclassify");
  assert.match(JSON.stringify(preview?.envelopeSchema), /projectId/u);
});
