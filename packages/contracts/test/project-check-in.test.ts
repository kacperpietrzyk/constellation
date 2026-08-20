import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CommandEnvelopeSchema,
  ProjectCheckInAddCommandSchema,
  ProjectCheckInListQuerySchema,
  HubWorkspaceSnapshotSchema,
} from "../src/index.js";

const id = (suffix: string) =>
  `70000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const command = {
  contractVersion: 1,
  commandName: "project.checkInAdd",
  commandId: id("1"),
  workspaceId: id("2"),
  idempotencyKey: "project-check-in-contract",
  expectedVersions: { [id("3")]: 4, [id("4")]: 2 },
  correlationId: id("5"),
  payload: {
    checkInId: id("6"),
    projectId: id("3"),
    summary: "The rollout is ready for the next checkpoint.",
    waitingOn: "Client confirmation",
    nextCheckpointAt: "2026-08-27T09:00:00.000Z",
    evidenceSourceIds: [id("4")],
    references: [{ kind: "task", recordId: id("7") }],
  },
};

describe("Project check-in contracts", () => {
  it("accepts a bounded strict append command and list query", () => {
    assert.equal(
      ProjectCheckInAddCommandSchema.parse(command).commandName,
      "project.checkInAdd",
    );
    const parsed = CommandEnvelopeSchema.parse(command);
    assert.equal(parsed.commandName, "project.checkInAdd");
    if (parsed.commandName !== "project.checkInAdd")
      assert.fail("Expected check-in command.");
    assert.equal(parsed.payload.summary, command.payload.summary);
    assert.equal(
      ProjectCheckInListQuerySchema.parse({
        contractVersion: 1,
        queryName: "project.checkInList",
        queryId: id("8"),
        workspaceId: id("2"),
        consistency: "local_authoritative",
        parameters: { projectId: id("3") },
      }).queryName,
      "project.checkInList",
    );
  });

  it("rejects unbounded content, duplicate evidence and unknown references", () => {
    assert.equal(
      ProjectCheckInAddCommandSchema.safeParse({
        ...command,
        payload: { ...command.payload, summary: "x".repeat(4_001) },
      }).success,
      false,
    );
    assert.equal(
      ProjectCheckInAddCommandSchema.safeParse({
        ...command,
        payload: {
          ...command.payload,
          evidenceSourceIds: [id("4"), id("4")],
        },
      }).success,
      false,
    );
    assert.equal(
      ProjectCheckInAddCommandSchema.safeParse({
        ...command,
        payload: {
          ...command.payload,
          references: [{ kind: "workspace", recordId: id("7") }],
        },
      }).success,
      false,
    );
  });

  it("defaults the check-in family for backward Hub snapshots", () => {
    const snapshot = HubWorkspaceSnapshotSchema.parse({
      format: "constellation.workspace-snapshot/v1",
      workspaces: [],
      spaces: [],
      memberships: [],
      taskStatuses: [],
      captures: [],
      tasks: [],
      projects: [],
      relations: [],
      undoDescriptors: [],
      events: [],
      auditReceipts: [],
      idempotencyRecords: [],
      outboxEntries: [],
    });
    assert.deepEqual(snapshot.projectCheckIns, []);
  });
});
