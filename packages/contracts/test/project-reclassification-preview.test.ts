import assert from "node:assert/strict";
import { it } from "node:test";

import { QueryEnvelopeSchema } from "../src/query.js";

const id = (suffix: string) =>
  `76200000-0000-4000-8000-${suffix.padStart(12, "0")}`;

it("accepts a bounded Project reclassification preview query", () => {
  const parsed = QueryEnvelopeSchema.parse({
    contractVersion: 1,
    queryId: id("1"),
    workspaceId: id("2"),
    consistency: "local_authoritative",
    queryName: "project.reclassificationPreview",
    parameters: {
      projectId: id("3"),
      destination: { mode: "merge", kind: "area", targetId: id("4") },
    },
  });
  assert.equal(parsed.queryName, "project.reclassificationPreview");
});
