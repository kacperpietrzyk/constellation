import assert from "node:assert/strict";
import { it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness, type ReferenceHarness } from "../src/index.js";

/**
 * `externalId` on a note — the field that makes the Obsidian import RETRYABLE.
 *
 * AGENTS.md binds every import to be safely retryable, and a note was the one
 * kind an import could not recognise again: names are not unique, folders
 * move, and a second run against the same vault would have written two hundred
 * duplicates with nothing objecting anywhere.
 *
 * `NativeDocument` HAS NO PROJECTION GUARD — `UnprojectableKeys` covers
 * `StrategicRecord` alone — and all four document projections are hand-picked
 * object literals, so this field compiles into the domain and the schema and
 * reaches NO reader at all unless something asserts it. That is why there is
 * one test per home, named after the projection, so a regression says which
 * reader lost the field rather than that "the import broke".
 *
 * EVERY ONE WAS BROKEN BY deleting `externalId` from the handler literal in
 * `wave2.ts`, never from the schema: deleting it from the schema makes
 * `.strict()` reject the extra key and produces a different, louder failure,
 * which is not this check.
 */

const ids = {
  workspace: "4d000000-0000-4000-8000-000000000001",
  space: "4d000000-0000-4000-8000-000000000002",
  principal: "4d000000-0000-4000-8000-000000000003",
  credential: "4d000000-0000-4000-8000-000000000004",
  grant: "4d000000-0000-4000-8000-000000000005",
} as const;

let sequence = 100;
const uuid = (): string =>
  `4d000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

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
      "document.remove",
      "document.list",
      "document.backlinks",
      "knowledge.list",
      "knowledge.documentContext",
      "task.create",
      "project.create",
    ],
    origin: "desktop",
  });

const metadata = (key: string) => ({
  contractVersion: 1 as const,
  commandId: uuid(),
  workspaceId: ids.workspace,
  idempotencyKey: key,
  expectedVersions: {},
  correlationId: uuid(),
});

const unwrap = (value: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(value.kind, "command_outcome");
  if (value.kind !== "command_outcome") throw new Error("Expected outcome");
  return value.outcome;
};

const bootstrapped = (): ReferenceHarness => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const outcome = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`bootstrap-${uuid()}`),
      commandName: "workspace.createLocal",
      payload: {
        workspaceId: ids.workspace,
        rootSpaceId: ids.space,
        ownerPrincipalId: ids.principal,
        name: "Vault",
        timezone: "Europe/Warsaw",
      },
    }),
  );
  assert.equal(outcome.outcome, "success");
  return harness;
};

const createNote = (
  harness: ReferenceHarness,
  title: string,
  externalId?: string,
): { readonly documentId: string; readonly outcome: CommandOutcome } => {
  const documentId = uuid();
  const outcome = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`document-${documentId}`),
      commandName: "document.create",
      payload: {
        documentId,
        spaceId: ids.space,
        title,
        role: "note" as const,
        ...(externalId === undefined ? {} : { externalId }),
      },
    }),
  );
  return { documentId, outcome };
};

const projection = <Kind extends string>(
  harness: ReferenceHarness,
  queryName: Kind,
  parameters: Readonly<Record<string, unknown>>,
) => {
  const result = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName,
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters,
  });
  if (
    result.kind !== "query_result" ||
    result.result.outcome !== "success" ||
    result.result.projection.kind !== queryName
  )
    assert.fail(`Expected ${queryName}.`);
  return result.result.projection as Extract<
    typeof result.result.projection,
    { readonly kind: Kind }
  >;
};

/** PROJECTION HOME 1 of 4 — the read the desktop import enumerates. */
it("projects externalId into knowledge.list.documents", () => {
  const harness = bootstrapped();
  const imported = createNote(harness, "Kickoff", "obsidian:Klienci/Kickoff.md");
  const typed = createNote(harness, "Written here");

  const documents = projection(harness, "knowledge.list", {
    spaceId: ids.space,
  }).documents;
  assert.equal(
    documents.find((item) => item.id === imported.documentId)?.externalId,
    "obsidian:Klienci/Kickoff.md",
    "the read the import enumerates must carry which file each note came from",
  );
  assert.equal(
    documents.find((item) => item.id === typed.documentId)?.externalId,
    undefined,
    "and a note nobody imported carries no key rather than an empty string",
  );
});

/** PROJECTION HOME 2 of 4 — the list MCP agents enumerate notes with. */
it("projects externalId into document.list", () => {
  const harness = bootstrapped();
  const { documentId } = createNote(harness, "Kickoff", "obsidian:Kickoff.md");
  assert.equal(
    projection(harness, "document.list", { spaceId: ids.space }).items.find(
      (item) => item.id === documentId,
    )?.externalId,
    "obsidian:Kickoff.md",
  );
});

/** PROJECTION HOME 3 of 4 — "what points at this". */
it("projects externalId into document.backlinks items", () => {
  const harness = bootstrapped();
  const { documentId } = createNote(harness, "Kickoff", "obsidian:Kickoff.md");
  const taskId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`task-${taskId}`),
        commandName: "task.create",
        payload: { taskId, spaceId: ids.space, title: "Review the kickoff" },
      }),
    ).outcome,
    "success",
  );
  harness.store.replaceDocumentEntityLinks(documentId as never, [
    {
      workspaceId: ids.workspace as never,
      spaceId: ids.space as never,
      documentId: documentId as never,
      targetKind: "task",
      targetId: taskId,
      updatedAt: "2026-08-02T10:00:00.000Z",
    },
  ]);
  assert.equal(
    projection(harness, "document.backlinks", {
      targetKind: "task",
      targetId: taskId,
    }).items[0]?.externalId,
    "obsidian:Kickoff.md",
  );
});

/** PROJECTION HOME 4 of 4 — the note that is open. */
it("projects externalId into knowledge.documentContext.document", () => {
  const harness = bootstrapped();
  const { documentId } = createNote(harness, "Kickoff", "obsidian:Kickoff.md");
  assert.equal(
    projection(harness, "knowledge.documentContext", { documentId }).document
      .externalId,
    "obsidian:Kickoff.md",
  );
});

/**
 * THE CLAIM ITSELF, which is what stops a second import from doubling a vault.
 *
 * The refusal carries the colliding note's id and version rather than a bare
 * precondition, because there is nothing else the caller can do with it: there
 * is no `document.update`, so it cannot correct the record — what it CAN do is
 * stop minting a second id and write the body into the note that already
 * exists, which is exactly what the import does.
 */
it("refuses a second note claiming one file, and names the note that holds it", () => {
  const harness = bootstrapped();
  const first = createNote(harness, "Kickoff", "obsidian:Kickoff.md");
  assert.equal(first.outcome.outcome, "success");

  const second = createNote(harness, "Kickoff again", "obsidian:Kickoff.md");
  assert.equal(second.outcome.outcome, "conflict");
  if (second.outcome.outcome !== "conflict") return;
  assert.equal(second.outcome.diagnosticCode, "record.already_exists");
  assert.deepEqual(second.outcome.currentVersions, {
    [first.documentId]: 1,
  });
  assert.equal(
    projection(harness, "document.list", { spaceId: ids.space }).items.length,
    1,
    "the refused create wrote a second note anyway",
  );
});

it("a key is claimed per kind, so a Project and a note may hold one string", () => {
  const harness = bootstrapped();
  const projectId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`project-${projectId}`),
        commandName: "project.create",
        payload: {
          projectId,
          spaceId: ids.space,
          title: "Kickoff",
          externalId: "obsidian:Kickoff.md",
        },
      }),
    ).outcome,
    "success",
  );
  // Two rows from two places, not a collision — the same rule
  // `findProjectByExternalId` already carries for a Project against a Person.
  assert.equal(
    createNote(harness, "Kickoff", "obsidian:Kickoff.md").outcome.outcome,
    "success",
  );
});

/**
 * A REMOVED NOTE DOES NOT KEEP ITS FILE RESERVED.
 *
 * Through the same `recordIsActive` choke point `listDocuments` uses, as on
 * Projects: delete a note in the app and re-import the vault, and the file has
 * to arrive again. A key held forever by a soft-deleted row would make that
 * file permanently unimportable, with a refusal naming a note nobody can see.
 */
it("a removed note releases the file it was imported from", () => {
  const harness = bootstrapped();
  const first = createNote(harness, "Kickoff", "obsidian:Kickoff.md");
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`remove-${first.documentId}`),
        commandName: "document.remove",
        expectedVersions: { [first.documentId]: 1 },
        payload: { documentId: first.documentId },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    createNote(harness, "Kickoff", "obsidian:Kickoff.md").outcome.outcome,
    "success",
  );
});
