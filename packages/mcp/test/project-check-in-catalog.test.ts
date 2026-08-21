import assert from "node:assert/strict";
import { it } from "node:test";

import { buildOperationCatalog } from "../src/catalog.js";

it("generates Project check-in MCP operations from the strict contracts", () => {
  const catalog = buildOperationCatalog([
    "project.checkInAdd",
    "project.checkInList",
  ]);
  const add = catalog.operations.find(
    (operation) => operation.name === "project.checkInAdd",
  );
  const list = catalog.operations.find(
    (operation) => operation.name === "project.checkInList",
  );
  assert.equal(add?.kind, "command");
  assert.equal(add?.requiredCapability, "project.checkInAdd");
  assert.equal(add?.revertable, "always");
  assert.match(JSON.stringify(add?.envelopeSchema), /summary/u);
  assert.equal(list?.kind, "query");
  assert.equal(list?.requiredCapability, "project.checkInList");
  assert.match(JSON.stringify(list?.envelopeSchema), /projectId/u);
});
