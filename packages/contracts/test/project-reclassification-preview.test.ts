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

it("requires the same complete Opportunity facts in preview and apply", () => {
  const parsed = QueryEnvelopeSchema.safeParse({
    contractVersion: 1,
    queryId: id("5"),
    workspaceId: id("2"),
    consistency: "local_authoritative",
    queryName: "project.reclassificationPreview",
    parameters: {
      projectId: id("3"),
      destination: {
        mode: "create",
        kind: "opportunity",
        targetId: id("4"),
        title: "Renewal",
      },
    },
  });
  assert.equal(parsed.success, false);

  const complete = QueryEnvelopeSchema.safeParse({
    contractVersion: 1,
    queryId: id("6"),
    workspaceId: id("2"),
    consistency: "local_authoritative",
    queryName: "project.reclassificationPreview",
    parameters: {
      projectId: id("3"),
      destination: {
        mode: "create",
        kind: "opportunity",
        targetId: id("4"),
        title: "Renewal",
        organizationId: id("7"),
        personIds: [],
        need: "Renew the service",
        qualification: "Incumbent and budget confirmed",
        stage: "qualified",
        nextAction: "Prepare the offer",
        evidenceSourceIds: [],
      },
    },
  });
  assert.equal(complete.success, true);
});
