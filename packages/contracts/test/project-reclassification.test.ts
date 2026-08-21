import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CommandEnvelopeSchema } from "../src/command.js";

const id = (suffix: string) =>
  `76000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const metadata = {
  contractVersion: 1 as const,
  commandId: id("1"),
  workspaceId: id("2"),
  idempotencyKey: "reclassify-project",
  expectedVersions: { [id("3")]: 4 },
  correlationId: id("4"),
};

describe("Project reclassification contract", () => {
  it("accepts an expected-versioned create destination without a close step", () => {
    const parsed = CommandEnvelopeSchema.parse({
      ...metadata,
      commandName: "project.reclassify",
      payload: {
        projectId: id("3"),
        destination: {
          mode: "create",
          kind: "initiative",
          targetId: id("5"),
          title: "Operate the work system",
          intendedOutcome: "One durable outcome instead of a delivery project",
        },
      },
    });

    assert.equal(parsed.commandName, "project.reclassify");
    assert.equal(parsed.payload.destination.mode, "create");
    assert.equal(parsed.payload.destination.kind, "initiative");
    assert.equal("closeProject" in parsed.payload, false);
  });

  it("accepts merge into an existing Area, Initiative or Opportunity", () => {
    for (const kind of ["area", "initiative", "opportunity"] as const) {
      const parsed = CommandEnvelopeSchema.parse({
        ...metadata,
        commandId: id(`1${kind.length}`),
        idempotencyKey: `merge-${kind}`,
        expectedVersions: { [id("3")]: 4, [id("5")]: 7 },
        commandName: "project.reclassify",
        payload: {
          projectId: id("3"),
          destination: { mode: "merge", kind, targetId: id("5") },
        },
      });
      assert.equal(parsed.commandName, "project.reclassify");
      assert.equal(parsed.payload.destination.mode, "merge");
    }
  });

  it("requires complete Opportunity creation facts rather than inventing commercial state", () => {
    const incomplete = CommandEnvelopeSchema.safeParse({
      ...metadata,
      commandName: "project.reclassify",
      payload: {
        projectId: id("3"),
        destination: {
          mode: "create",
          kind: "opportunity",
          targetId: id("5"),
          title: "Renewal",
        },
      },
    });
    assert.equal(incomplete.success, false);

    const complete = CommandEnvelopeSchema.safeParse({
      ...metadata,
      commandName: "project.reclassify",
      payload: {
        projectId: id("3"),
        destination: {
          mode: "create",
          kind: "opportunity",
          targetId: id("5"),
          title: "Renewal",
          organizationId: id("6"),
          personIds: [],
          need: "Renew the service",
          qualification: "Confirmed incumbent scope",
          stage: "qualified",
          nextAction: "Prepare the renewal offer",
          evidenceSourceIds: [],
        },
      },
    });
    assert.equal(complete.success, true);
  });
});
