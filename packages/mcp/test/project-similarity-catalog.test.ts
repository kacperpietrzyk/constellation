import assert from "node:assert/strict";
import { it } from "node:test";

import { buildOperationCatalog } from "../src/catalog.js";

it("publishes similarity and atomic Task-in-Project through the generated MCP catalog", () => {
  const catalog = buildOperationCatalog([
    "project.list",
    "task.create",
    "record.relate",
  ]);
  const similar = catalog.operations.find(
    (operation) => operation.name === "project.similarCandidates",
  );
  const create = catalog.operations.find(
    (operation) => operation.name === "task.createInProject",
  );

  assert.equal(similar?.kind, "query");
  assert.equal(similar?.requiredCapability, "project.list");
  assert.match(
    JSON.stringify(similar?.envelopeSchema),
    /clientOrganizationIds/u,
  );
  assert.match(JSON.stringify(similar?.envelopeSchema), /contexts/u);
  assert.equal(create?.kind, "command");
  assert.equal(create?.requiredCapability, "task.create");
  assert.deepEqual(create?.additionalCapabilities, ["record.relate"]);
  assert.equal(create?.revertable, "always");
  assert.match(JSON.stringify(create?.envelopeSchema), /projectId/u);
});
