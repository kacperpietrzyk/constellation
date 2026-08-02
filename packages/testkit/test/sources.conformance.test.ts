import assert from "node:assert/strict";
import { it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  KNOWLEDGE_SOURCE_AVAILABILITY,
  KNOWLEDGE_SOURCE_KINDS,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness, type ReferenceHarness } from "../src/index.js";

/**
 * SOURCES — the two properties the screen rests on, asserted against the
 * kernel rather than against a fixture.
 *
 *   1. THE SOURCE↔NOTE EDGE IS ONE STORED EDGE, READABLE FROM BOTH ENDS. It is
 *      written ONCE, by `knowledge.documentSetEvidence`, and read from the
 *      source's end through `knowledge.list.sources[].referencedBy` and from
 *      the note's end through `knowledge.documentContext.evidence`. This
 *      programme has already shipped a guard that turned out to be the INVERSE
 *      of the thing it claimed to check, so the discriminator is written into
 *      the test itself: the edge is written exactly once and both reads are
 *      asserted. A test that wrote each side separately would pass with two
 *      independent edges and prove nothing.
 *
 *   2. OBSERVED AND ADDED ARE TWO PROJECTED FACTS. `observedAt` is supplied by
 *      the caller and is freely older than the record; `createdAt` is stamped
 *      by the kernel. Until Wave D only the first reached any reader, so a
 *      screen showing "added" had nothing but `updatedAt` to show — which moves
 *      whenever anybody fixes a typo.
 *
 * Every assertion here was verified BY BREAKING IT, with `tsc -b` inside the
 * loop, because `@constellation/contracts` resolves to `dist/` and a break-test
 * that edits `src/` and rebuilds nothing comes back green on deleted code.
 */

const ids = {
  workspace: "5c000000-0000-4000-8000-000000000001",
  space: "5c000000-0000-4000-8000-000000000002",
  principal: "5c000000-0000-4000-8000-000000000003",
  credential: "5c000000-0000-4000-8000-000000000004",
  grant: "5c000000-0000-4000-8000-000000000005",
} as const;

let sequence = 100;
const uuid = (): string =>
  `5c000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

const context = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.principal,
    principalKind: "human",
    credentialId: ids.credential,
    grantId: ids.grant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.space],
    capabilityScope: [
      "workspace.createLocal",
      "document.create",
      "knowledge.sourceCreate",
      "knowledge.sourceUpdate",
      "knowledge.documentSetEvidence",
      "knowledge.list",
      "knowledge.documentContext",
    ],
    origin: "desktop",
  });

const metadata = (key: string, expectedVersions = {}) => ({
  contractVersion: 1 as const,
  commandId: uuid(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions,
  correlationId: uuid(),
});

const unwrap = (value: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(value.kind, "command_outcome");
  if (value.kind !== "command_outcome") throw new Error("Expected outcome");
  return value.outcome;
};

const succeeds = (
  harness: ReferenceHarness,
  command: Record<string, unknown> & { readonly commandName: string },
): CommandOutcome => {
  const outcome = unwrap(harness.kernel.execute(context(), command));
  assert.equal(
    outcome.outcome,
    "success",
    `${command.commandName} was expected to succeed`,
  );
  return outcome;
};

const bootstrapped = (): ReferenceHarness => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  succeeds(harness, {
    ...metadata(`bootstrap-${uuid()}`),
    commandName: "workspace.createLocal",
    payload: {
      workspaceId: ids.workspace,
      rootSpaceId: ids.space,
      ownerPrincipalId: ids.principal,
      name: "Sources",
      timezone: "Europe/Warsaw",
    },
  });
  return harness;
};

const createSource = (
  harness: ReferenceHarness,
  overrides: {
    readonly sourceKind?: (typeof KNOWLEDGE_SOURCE_KINDS)[number];
    readonly availability?: (typeof KNOWLEDGE_SOURCE_AVAILABILITY)[number];
    readonly observedAt?: string;
    readonly title?: string;
  } = {},
): string => {
  const sourceId = uuid();
  succeeds(harness, {
    ...metadata(`source-${sourceId}`),
    commandName: "knowledge.sourceCreate",
    payload: {
      sourceId,
      spaceId: ids.space,
      sourceKind: overrides.sourceKind ?? "file",
      title: overrides.title ?? "Workshop minutes",
      availability: overrides.availability ?? "reference_only",
      observedAt: overrides.observedAt ?? "2026-07-24T11:30:00.000Z",
    },
  });
  return sourceId;
};

const createNote = (harness: ReferenceHarness, title: string): string => {
  const documentId = uuid();
  succeeds(harness, {
    ...metadata(`document-${documentId}`),
    commandName: "document.create",
    payload: { documentId, spaceId: ids.space, title, role: "note" as const },
  });
  return documentId;
};

const knowledgeList = (harness: ReferenceHarness) => {
  const result = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "knowledge.list",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    result.kind !== "query_result" ||
    result.result.outcome !== "success" ||
    result.result.projection.kind !== "knowledge.list"
  )
    assert.fail("Expected the knowledge list.");
  return result.result.projection;
};

const documentContext = (harness: ReferenceHarness, documentId: string) => {
  const result = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "knowledge.documentContext",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { documentId },
  });
  if (
    result.kind !== "query_result" ||
    result.result.outcome !== "success" ||
    result.result.projection.kind !== "knowledge.documentContext"
  )
    assert.fail("Expected the document context.");
  return result.result.projection;
};

/**
 * ONE WRITE, TWO READS. The command below is the only mutation in this test
 * that touches the relation, and both directions are read after it. Break
 * either read and exactly one half goes red, which is what distinguishes this
 * from a guard that is secretly the inverse of what it claims.
 */
it("stores the source-note edge once and reads it from both ends", () => {
  const harness = bootstrapped();
  const sourceId = createSource(harness, { title: "Vendor rate limits" });
  const noteId = createNote(harness, "Notes on the rate limits");

  // Written ONCE, from the note. Nothing writes the source's side.
  succeeds(harness, {
    ...metadata("evidence", { [noteId]: 1, [sourceId]: 1 }),
    commandName: "knowledge.documentSetEvidence",
    payload: { documentId: noteId, sourceIds: [sourceId], noteDocumentIds: [] },
  });

  // END 1 — from the source: "what rests on this".
  const source = knowledgeList(harness).sources.find(
    (item) => item.id === sourceId,
  );
  assert.ok(source, "the source left the knowledge list");
  assert.equal(source.referencedByCount, 1);
  assert.deepEqual(
    source.referencedBy.map((reference) => ({
      recordId: reference.recordId,
      recordKind: reference.recordKind,
      title: reference.title,
    })),
    [
      {
        recordId: noteId,
        recordKind: "document",
        title: "Notes on the rate limits",
      },
    ],
    "the source's end does not name the note that rests on it",
  );

  // END 2 — from the note: the evidence it rests on. Same edge, other side.
  assert.deepEqual(
    documentContext(harness, noteId).evidence.map((item) => ({
      kind: item.kind,
      recordId: item.recordId,
      title: item.title,
    })),
    [{ kind: "source", recordId: sourceId, title: "Vendor rate limits" }],
    "the note's end does not name the source it rests on",
  );
});

/**
 * AND THE SAMPLE AGREES WITH THE COUNT. `referencedByCount` is the real total
 * and `referencedBy` is a sample bounded by `DEPENDENT_SAMPLE_LIMIT`; below the
 * bound they must be the same length. The harness fixture shipped a nonzero
 * count beside an EMPTY sample — a shape the kernel cannot produce — and the
 * screen rendered an empty section under a counter saying two.
 */
it("keeps the sample and the count of what rests on a source in step", () => {
  const harness = bootstrapped();
  const sourceId = createSource(harness, { title: "Shared evidence" });
  const notes = ["First note", "Second note", "Third note"].map((title) =>
    createNote(harness, title),
  );
  for (const [index, noteId] of notes.entries())
    succeeds(harness, {
      ...metadata(`evidence-${index}`, { [noteId]: 1, [sourceId]: 1 }),
      commandName: "knowledge.documentSetEvidence",
      payload: {
        documentId: noteId,
        sourceIds: [sourceId],
        noteDocumentIds: [],
      },
    });

  const source = knowledgeList(harness).sources.find(
    (item) => item.id === sourceId,
  );
  assert.ok(source);
  assert.equal(source.referencedByCount, notes.length);
  assert.equal(source.referencedBy.length, source.referencedByCount);
  assert.deepEqual(
    source.referencedBy.map((reference) => reference.recordId).sort(),
    [...notes].sort(),
  );
});

/**
 * THE TWO DATES, PROJECTED SEPARATELY. `observedAt` travels from the caller
 * untouched; `createdAt` is the kernel's own stamp. A projection carrying only
 * one of them cannot answer both questions, and `updatedAt` is neither — it
 * moves on the next edit, which is asserted here rather than assumed.
 */
it("projects the observation date and the added date as separate facts", () => {
  const harness = bootstrapped();
  const observedAt = "2019-11-04T14:00:00.000Z";
  const sourceId = createSource(harness, {
    observedAt,
    title: "Contract excerpt",
  });

  const projected = knowledgeList(harness).sources.find(
    (item) => item.id === sourceId,
  );
  assert.ok(projected);
  assert.equal(
    projected.observedAt,
    observedAt,
    "the observation date did not survive the projection",
  );
  assert.notEqual(
    projected.createdAt,
    projected.observedAt,
    "the added date is the observation date, so the two have been collapsed",
  );
  assert.ok(
    Date.parse(projected.createdAt) > Date.parse(observedAt),
    "the record was added before its content was observed, which cannot be",
  );

  // A later edit moves `updatedAt` and leaves BOTH dates alone. Without this,
  // a reader printing `updatedAt` as "added" would pass every check above.
  succeeds(harness, {
    ...metadata("rename", { [sourceId]: 1 }),
    commandName: "knowledge.sourceUpdate",
    payload: {
      sourceId,
      title: "Contract excerpt — clause 7",
      availability: "reference_only",
      observedAt,
    },
  });
  const edited = knowledgeList(harness).sources.find(
    (item) => item.id === sourceId,
  );
  assert.ok(edited);
  assert.equal(edited.createdAt, projected.createdAt);
  assert.equal(edited.observedAt, observedAt);
  assert.notEqual(
    edited.updatedAt,
    edited.createdAt,
    "`updatedAt` did not move on an edit, so it cannot stand in for either date",
  );
});

/**
 * EVERY MEMBER OF BOTH VOCABULARIES SURVIVES A ROUND TRIP. Iterated over the
 * exported arrays rather than a list written here: a fifth kind or a fourth
 * availability is covered the day it exists, and a member the writer accepts
 * but the reader drops is red rather than silent. On the measured workspace
 * `screenshot` is 0 of 81 and `unavailable` is 0 of 81 — nothing real would
 * ever exercise either.
 */
it("round-trips every kind and every availability the contract declares", () => {
  const harness = bootstrapped();
  const created = KNOWLEDGE_SOURCE_KINDS.flatMap((sourceKind) =>
    KNOWLEDGE_SOURCE_AVAILABILITY.map((availability) => ({
      sourceKind,
      availability,
      id: createSource(harness, {
        sourceKind,
        availability,
        title: `${sourceKind} · ${availability}`,
      }),
    })),
  );
  const listed = knowledgeList(harness).sources;
  const projected = new Map<string, (typeof listed)[number]>(
    listed.map((source) => [source.id, source]),
  );
  assert.equal(
    projected.size,
    created.length,
    "the list dropped a source the writer accepted",
  );
  for (const expected of created) {
    const source = projected.get(expected.id);
    assert.ok(
      source,
      `${expected.sourceKind}/${expected.availability} is gone`,
    );
    assert.equal(source.sourceKind, expected.sourceKind);
    assert.equal(source.availability, expected.availability);
  }
});
