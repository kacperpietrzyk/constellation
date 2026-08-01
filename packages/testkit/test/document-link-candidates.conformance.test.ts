import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness } from "../src/index.js";

/**
 * What `document.linkCandidates` must MEAN, as opposed to how fast it is.
 *
 * Two of these properties are invisible in the running app and would be
 * refactored away by anybody who could not see why they were there: that
 * documents come first at an equal match rank, and that a query typed without
 * Polish diacritics reaches a title that has them. Both are decisions, and a
 * decision with no assertion is a preference.
 */

const ids = {
  workspace: "90000000-0000-4000-8000-000000000001",
  space: "90000000-0000-4000-8000-000000000002",
  principal: "90000000-0000-4000-8000-000000000004",
  credential: "90000000-0000-4000-8000-000000000005",
  grant: "90000000-0000-4000-8000-000000000006",
  // Deliberately sorts AFTER the Task id below: if the note came first
  // here too, "documents first" would pass on the last tiebreak instead of
  // on the rule, and deleting the rule would not be visible.
  noteA: "90000000-0000-4000-8000-0000000000fa",
  noteB: "90000000-0000-4000-8000-00000000000b",
  noteRemoved: "90000000-0000-4000-8000-00000000000c",
  noteWeak: "90000000-0000-4000-8000-00000000000e",
  task: "90000000-0000-4000-8000-00000000000d",
} as const;

let sequence = 32_768;
const requestId = (): string =>
  `90000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, "0")}`;

const context: ExecutionContext = ExecutionContextSchema.parse({
  principalId: ids.principal,
  principalKind: "human",
  credentialId: ids.credential,
  grantId: ids.grant,
  policyVersion: 1,
  workspaceId: ids.workspace,
  spaceScope: [ids.space],
  capabilityScope: [
    "workspace.createLocal",
    "task.create",
    "document.create",
    "document.remove",
    "document.list",
    "document.linkCandidates",
  ],
  origin: "desktop",
});

const metadata = (key: string) => ({
  contractVersion: 1 as const,
  commandId: requestId(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions: {},
  correlationId: requestId(),
});

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome") throw new Error("Expected outcome");
  return response.outcome;
};

interface Candidate {
  readonly targetKind: string;
  readonly targetId: string;
  readonly label: string;
}

const seeded = () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context);
  const run = (key: string, commandName: string, payload: object): void => {
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata(key),
          commandName,
          payload,
        } as never),
      ).outcome,
      "success",
      `${commandName} (${key}) did not succeed.`,
    );
  };
  run("conformance-bootstrap", "workspace.createLocal", {
    workspaceId: ids.workspace,
    rootSpaceId: ids.space,
    ownerPrincipalId: ids.principal,
    name: "Link candidate conformance workspace",
    timezone: "Europe/Warsaw",
  });
  // Same label on a Document and on a Task. This is the walkthrough's own
  // ambiguity — a note called Northstar and a record called Northstar — and it
  // is why the kind has to be visible in the list and the order has to be
  // decided rather than incidental.
  run("conformance-note-a", "document.create", {
    documentId: ids.noteA,
    spaceId: ids.space,
    title: "Northstar",
    role: "note",
  });
  run("conformance-note-b", "document.create", {
    documentId: ids.noteB,
    spaceId: ids.space,
    title: "Zakłady Chemiczne",
    role: "note",
  });
  run("conformance-note-removed", "document.create", {
    documentId: ids.noteRemoved,
    spaceId: ids.space,
    title: "Northstar archive",
    role: "note",
  });
  run("conformance-note-weak", "document.create", {
    documentId: ids.noteWeak,
    spaceId: ids.space,
    title: "Plan Northstar",
    role: "note",
  });
  run("conformance-task", "task.create", {
    taskId: ids.task,
    spaceId: ids.space,
    title: "Northstar",
  });
  return harness;
};

const candidates = (
  harness: ReturnType<typeof createReferenceHarness>,
  parameters: object,
): readonly Candidate[] => {
  const response = harness.kernel.query(context, {
    contractVersion: 1,
    queryName: "document.linkCandidates",
    queryId: requestId(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, ...parameters },
  } as never);
  assert.equal(response.kind, "query_result");
  if (response.kind !== "query_result") throw new Error("Expected query");
  assert.equal(response.result.outcome, "success");
  if (
    response.result.outcome !== "success" ||
    response.result.projection.kind !== "document.linkCandidates"
  )
    throw new Error("Expected link candidates");
  return response.result.projection.items;
};

describe("document.linkCandidates semantics", () => {
  it("offers another note as a link target", () => {
    const found = candidates(seeded(), { text: "Zakłady" });
    assert.deepEqual(
      found.map((item) => [item.targetKind, item.label]),
      [["document", "Zakłady Chemiczne"]],
    );
  });

  it("finds a Polish title typed without its diacritics", () => {
    // `Zaklady` finding nothing while `Zakłady` sits in the list is the defect
    // the MCP catalogue records for `search.global`. NFD alone does not fix it:
    // `ł` is a single code point with no decomposition.
    const found = candidates(seeded(), { text: "zaklady" });
    assert.deepEqual(
      found.map((item) => item.label),
      ["Zakłady Chemiczne"],
    );
  });

  it("ranks a document ahead of a record carrying the same label", () => {
    const found = candidates(seeded(), { text: "Northstar" });
    const sameLabel = found.filter((item) => item.label === "Northstar");
    assert.deepEqual(
      sameLabel.map((item) => item.targetKind),
      ["document", "task"],
      `Equal-scoring candidates must put the document first: ${JSON.stringify(found)}`,
    );
  });

  it("ranks a better match ahead of a document with a worse one", () => {
    // The kind tiebreak must not outrank match quality. "Plan Northstar" is a
    // note and matches only at a later word; the Task matches from the first
    // character. If documents-first won here, `[[nor` would put the weaker
    // match on top purely because it is a note.
    const found = candidates(seeded(), { text: "nor" });
    const labels = found.map((item) => item.label);
    assert.ok(
      labels.indexOf("Plan Northstar") > labels.indexOf("Northstar"),
      `A whole-label prefix must outrank a later-word match: ${JSON.stringify(found)}`,
    );
    assert.equal(
      labels[labels.length - 1],
      "Plan Northstar",
      `The weakest match comes last: ${JSON.stringify(found)}`,
    );
  });

  it("narrows to the kinds the caller asked for", () => {
    const found = candidates(seeded(), {
      text: "Northstar",
      targetKinds: ["task", "project", "person", "organization", "meeting"],
    });
    assert.deepEqual(
      found.map((item) => item.targetKind),
      ["task"],
    );
  });

  it("does not offer the note that is being written", () => {
    const found = candidates(seeded(), {
      text: "Northstar",
      excludeDocumentId: ids.noteA,
    });
    assert.equal(
      found.some((item) => item.targetId === ids.noteA),
      false,
      `A note must not offer itself: ${JSON.stringify(found)}`,
    );
  });

  it("stops resolving a note once it leaves the graph", () => {
    const harness = seeded();
    // Resolving a target the caller already holds is the path a document takes
    // when it opens; a removed note must go quiet there rather than keep
    // rendering its old title.
    assert.deepEqual(
      candidates(harness, {
        targets: [{ targetKind: "document", targetId: ids.noteRemoved }],
      }).map((item) => item.label),
      ["Northstar archive"],
    );
    assert.equal(
      unwrap(
        harness.kernel.execute(context, {
          ...metadata("conformance-remove"),
          expectedVersions: { [ids.noteRemoved]: 1 },
          commandName: "document.remove",
          payload: { documentId: ids.noteRemoved },
        } as never),
      ).outcome,
      "success",
    );
    assert.deepEqual(
      candidates(harness, {
        targets: [{ targetKind: "document", targetId: ids.noteRemoved }],
      }),
      [],
    );
    assert.equal(
      candidates(harness, { text: "Northstar" }).some(
        (item) => item.targetId === ids.noteRemoved,
      ),
      false,
    );
  });

  it("refuses a document id offered under another kind", () => {
    // The branch that used to catch every unrecognised kind parsed the id as a
    // StrategicRecordId, so a DocumentId arriving under the wrong arm threw
    // rather than resolving to nothing. A stored link is only ever as
    // trustworthy as what wrote it.
    assert.deepEqual(
      candidates(seeded(), {
        targets: [
          { targetKind: "task", targetId: ids.noteA },
          { targetKind: "person", targetId: ids.noteA },
        ],
      }),
      [],
    );
  });
});
