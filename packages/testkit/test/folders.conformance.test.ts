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
 * B8 — the folder tree (decision #30), and the assertions that carry it.
 *
 * The prototype's own checks for this decision are decoration and were ruled
 * so before a line of this was written: its B34 is a type check on invented
 * data that never exercises a move, and its B35 compares a NOTE count against
 * a CHILD-FOLDER count — unlike things, so it passes trivially. Everything
 * here is written against behaviour instead: commands are issued, and the
 * reads a screen actually renders are what gets asserted.
 *
 * Every assertion in this file was verified BY BREAKING IT, with `tsc -b`
 * inside the loop, because `@constellation/contracts` resolves to `dist/` and
 * a break-test that edits `src/` and rebuilds nothing comes back green on
 * deleted code.
 */

const ids = {
  workspace: "1d000000-0000-4000-8000-000000000001",
  space: "1d000000-0000-4000-8000-000000000002",
  principal: "1d000000-0000-4000-8000-000000000003",
  credential: "1d000000-0000-4000-8000-000000000004",
  grant: "1d000000-0000-4000-8000-000000000005",
} as const;

let sequence = 100;
const uuid = (): string =>
  `1d000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

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
      "document.setFolder",
      "folder.create",
      "folder.rename",
      "folder.setParent",
      "folder.remove",
      "document.list",
      "document.backlinks",
      "knowledge.list",
      "knowledge.documentContext",
      "task.create",
      "command.previewUndo",
      "command.undo",
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
      name: "Folders",
      timezone: "Europe/Warsaw",
    },
  });
  return harness;
};

const createFolder = (
  harness: ReferenceHarness,
  name: string,
  parentFolderId?: string,
): string => {
  const folderId = uuid();
  succeeds(harness, {
    ...metadata(`folder-${folderId}`),
    commandName: "folder.create",
    payload: {
      folderId,
      spaceId: ids.space,
      name,
      ...(parentFolderId === undefined ? {} : { parentFolderId }),
    },
  });
  return folderId;
};

const createNote = (
  harness: ReferenceHarness,
  title: string,
  folderId?: string,
): string => {
  const documentId = uuid();
  succeeds(harness, {
    ...metadata(`document-${documentId}`),
    commandName: "document.create",
    payload: {
      documentId,
      spaceId: ids.space,
      title,
      role: "note" as const,
      ...(folderId === undefined ? {} : { folderId }),
    },
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

const documentList = (harness: ReferenceHarness) => {
  const result = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "document.list",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    result.kind !== "query_result" ||
    result.result.outcome !== "success" ||
    result.result.projection.kind !== "document.list"
  )
    assert.fail("Expected the document list.");
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

const versionOf = (harness: ReferenceHarness, recordId: string): number => {
  const document = documentList(harness).items.find(
    (item) => item.id === recordId,
  );
  if (document !== undefined) return document.version;
  const folder = knowledgeList(harness).folders.find(
    (item) => item.id === recordId,
  );
  if (folder === undefined) assert.fail(`No record ${recordId}`);
  return folder.version;
};

/**
 * PROJECTION HOME 1 of 5. `knowledge.list.documents` is the one the Notes
 * screen actually reads and the easiest of the four document homes to miss,
 * because its name does not contain "document.". Each home gets its OWN test,
 * named after the projection, so a regression says which reader lost the
 * field rather than that "folders broke".
 *
 * `NativeDocument` has no `UnprojectableKeys` guard — that one covers
 * `StrategicRecord` alone — and all five handlers are hand-picked object
 * literals, so `folderId` compiles into the domain and the schema and reaches
 * no reader at all unless something asserts it.
 *
 * BROKEN BY: deleting `folderId` from the handler literal in
 * `wave2.ts`, NOT from the schema. Deleting it from the schema makes
 * `.strict()` reject the extra key and produces a different, louder failure;
 * that is not this check.
 */
it("projects folderId into knowledge.list.documents", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const noteId = createNote(harness, "Falcon kickoff", folderId);
  const looseId = createNote(harness, "Loose thought");

  const documents = knowledgeList(harness).documents;
  assert.equal(
    documents.find((item) => item.id === noteId)?.folderId,
    folderId,
    "the list the Notes screen renders must carry where each note is filed",
  );
  assert.equal(
    documents.find((item) => item.id === looseId)?.folderId,
    undefined,
    "and an Unfiled note carries no folder rather than a null",
  );
});

/**
 * PROJECTION HOME 2 of 5, and the one the brief did not count: the folder
 * array itself. Recon counted four DOCUMENT homes carrying `folderId`; the
 * tree is a fifth hand-picked literal in the same handler and loses a field
 * exactly as silently.
 *
 * This also carries the "refusal is actionable from the read" property:
 * `folder.remove` refuses a folder that still holds child folders, and the
 * caller finds out WHICH children from `parentFolderId` here — the same field
 * the tree is drawn from.
 *
 * BROKEN BY: deleting `parentFolderId` from the handler literal.
 */
it("projects the folder tree into knowledge.list.folders", () => {
  const harness = bootstrapped();
  const parentId = createFolder(harness, "Clients");
  const childId = createFolder(harness, "Falcon", parentId);

  const folders = knowledgeList(harness).folders;
  assert.equal(folders.length, 2);
  assert.equal(folders.find((item) => item.id === parentId)?.name, "Clients");
  assert.equal(
    folders.find((item) => item.id === parentId)?.parentFolderId,
    undefined,
    "a folder at the root of the tree carries no parent",
  );
  assert.equal(
    folders.find((item) => item.id === childId)?.parentFolderId,
    parentId,
    "and every child names its parent, which is what the tree is drawn from",
  );
  assert.deepEqual(
    folders
      .filter((item) => item.parentFolderId === parentId)
      .map((item) => item.id),
    [childId],
    "so the children blocking a removal are derivable from the read the screen already holds",
  );
});

/** PROJECTION HOME 3 of 5 — the list MCP agents enumerate notes with. */
it("projects folderId into document.list", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const noteId = createNote(harness, "Falcon kickoff", folderId);

  assert.equal(
    documentList(harness).items.find((item) => item.id === noteId)?.folderId,
    folderId,
  );
});

/** PROJECTION HOME 4 of 5 — "what points at this". */
it("projects folderId into document.backlinks items", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const noteId = createNote(harness, "Falcon kickoff", folderId);
  const taskId = uuid();
  succeeds(harness, {
    ...metadata(`task-${taskId}`),
    commandName: "task.create",
    payload: { taskId, spaceId: ids.space, title: "Review the kickoff" },
  });
  harness.store.replaceDocumentEntityLinks(noteId as never, [
    {
      workspaceId: ids.workspace as never,
      spaceId: ids.space as never,
      documentId: noteId as never,
      targetKind: "task",
      targetId: taskId,
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
  ]);

  const result = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "document.backlinks",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { targetKind: "task", targetId: taskId },
  });
  if (
    result.kind !== "query_result" ||
    result.result.outcome !== "success" ||
    result.result.projection.kind !== "document.backlinks"
  )
    assert.fail("Expected backlinks.");
  assert.equal(result.result.projection.items[0]?.folderId, folderId);
});

/** PROJECTION HOME 5 of 5 — the note that is open. */
it("projects folderId into knowledge.documentContext.document", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const noteId = createNote(harness, "Falcon kickoff", folderId);

  assert.equal(documentContext(harness, noteId).document.folderId, folderId);
});

/**
 * THE ASSERTION THAT CARRIES DECISION #30 — the replacement for B34.
 *
 * The prototype's version checks that `note.folder` is a string or null on
 * invented data. It cannot fail on any fixture anyone would write and it never
 * exercises a move, while carrying the hardest requirement in the wave. This
 * one calls the move command and observes membership before and after: after
 * a move the note is IN the destination and NO LONGER IN the source, and
 * `null` (Unfiled) is a legal value rather than an error.
 */
it("moves a note out of one folder and into another, and Unfiled is a destination", () => {
  const harness = bootstrapped();
  const sourceId = createFolder(harness, "Inbox");
  const destinationId = createFolder(harness, "Clients");
  const noteId = createNote(harness, "Falcon kickoff", sourceId);

  const membership = () =>
    knowledgeList(harness).documents.find((item) => item.id === noteId)
      ?.folderId;
  const notesIn = (folderId: string | undefined) =>
    knowledgeList(harness)
      .documents.filter((item) => item.folderId === folderId)
      .map((item) => item.id);

  assert.deepEqual(notesIn(sourceId), [noteId], "before: it is in the source");
  assert.deepEqual(
    notesIn(destinationId),
    [],
    "before: not in the destination",
  );

  succeeds(harness, {
    ...metadata(`move-${noteId}`, { [noteId]: versionOf(harness, noteId) }),
    commandName: "document.setFolder",
    payload: { documentId: noteId, folderId: destinationId },
  });

  assert.equal(membership(), destinationId, "after: it is in the destination");
  assert.deepEqual(
    notesIn(sourceId),
    [],
    "after: and no longer in the source — one folder per note, not a set",
  );
  assert.deepEqual(notesIn(destinationId), [noteId]);

  // Unfiled accepts the drop. `null` is a placement, never an error.
  succeeds(harness, {
    ...metadata(`unfile-${noteId}`, { [noteId]: versionOf(harness, noteId) }),
    commandName: "document.setFolder",
    payload: { documentId: noteId, folderId: null },
  });
  assert.equal(membership(), undefined, "Unfiled sets the folder to nothing");
  assert.deepEqual(notesIn(destinationId), []);
});

/**
 * THE REPLACEMENT FOR B35, and the property the prototype's version cannot
 * express: `noteCount(p) === ownNoteCount(p) + Σ noteCount(child)`, on a tree
 * at least three levels deep with notes at more than one level.
 *
 * The prototype compares a note count against a child-FOLDER count — unlike
 * things, which is why it passes trivially. Both counts are projected here so
 * the equation is checked against the read the screen renders rather than
 * against arithmetic this test did itself.
 */
it("rolls a folder's count up through every descendant level", () => {
  const harness = bootstrapped();
  const clients = createFolder(harness, "Clients");
  const falcon = createFolder(harness, "Falcon", clients);
  const contracts = createFolder(harness, "Contracts", falcon);
  const archive = createFolder(harness, "Archive", clients);

  createNote(harness, "Client policy", clients);
  createNote(harness, "Falcon kickoff", falcon);
  createNote(harness, "Falcon retro", falcon);
  createNote(harness, "Falcon MSA", contracts);
  createNote(harness, "Old note", archive);
  createNote(harness, "Loose thought");

  const folders = knowledgeList(harness).folders;
  const at = (id: string) => {
    const folder = folders.find((item) => item.id === id);
    if (folder === undefined) assert.fail(`No folder ${id}`);
    return folder;
  };

  assert.equal(at(contracts).ownNoteCount, 1);
  assert.equal(at(contracts).noteCount, 1);
  assert.equal(at(falcon).ownNoteCount, 2);
  assert.equal(at(falcon).noteCount, 3, "its own two plus the contract below");
  assert.equal(at(clients).ownNoteCount, 1);
  assert.equal(
    at(clients).noteCount,
    5,
    "its own one, Falcon's three and the archived one — three levels deep",
  );
  assert.equal(at(archive).noteCount, 1);

  // The equation itself, at EVERY node, so a tree that happens to satisfy the
  // three numbers above by coincidence still fails.
  for (const folder of folders) {
    const children = folders.filter(
      (candidate) => candidate.parentFolderId === folder.id,
    );
    assert.equal(
      folder.noteCount,
      folder.ownNoteCount +
        children.reduce((total, child) => total + child.noteCount, 0),
      `${folder.name}: its count is its own notes plus its children's counts`,
    );
  }

  // The list is never narrower than the counter beside it: what a folder shows
  // includes notes in its DESCENDANT folders, so the two cannot disagree.
  const documents = knowledgeList(harness).documents;
  const descendantsOf = (id: string): readonly string[] => {
    const children = folders
      .filter((candidate) => candidate.parentFolderId === id)
      .map((candidate) => candidate.id);
    return [id, ...children.flatMap((child) => descendantsOf(child))];
  };
  for (const folder of folders) {
    const reachable = new Set(descendantsOf(folder.id));
    assert.equal(
      documents.filter(
        (document) =>
          document.folderId !== undefined && reachable.has(document.folderId),
      ).length,
      folder.noteCount,
      `${folder.name}: the notes it lists are exactly the notes it counts`,
    );
  }
});

/**
 * The check `Task.parentTaskId` never needed. Two guards cap a subtask's depth
 * at two, so a task cycle is structurally unreachable and this repo holds no
 * ancestor walk at all. #30 removed that cap for folders, which buys the
 * problem back: without the walk, a folder moved under its own descendant
 * takes the whole subtree off the tree while every note in it stays perfectly
 * present in the store.
 */
it("refuses to move a folder under its own descendant", () => {
  const harness = bootstrapped();
  const clients = createFolder(harness, "Clients");
  const falcon = createFolder(harness, "Falcon", clients);
  const contracts = createFolder(harness, "Contracts", falcon);

  const grandchild = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`cycle-deep-${clients}`, {
        [clients]: versionOf(harness, clients),
      }),
      commandName: "folder.setParent",
      payload: { folderId: clients, parentFolderId: contracts },
    }),
  );
  assert.equal(grandchild.outcome, "rejected");
  assert.equal(grandchild.diagnosticCode, "command.precondition_failed");

  const itself = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`cycle-self-${falcon}`, {
        [falcon]: versionOf(harness, falcon),
      }),
      commandName: "folder.setParent",
      payload: { folderId: falcon, parentFolderId: falcon },
    }),
  );
  assert.equal(itself.outcome, "rejected");

  // And the legal move still works, so the guard is not simply refusing
  // everything — the failure mode a cycle check falls into most easily.
  succeeds(harness, {
    ...metadata(`move-to-root-${contracts}`, {
      [contracts]: versionOf(harness, contracts),
    }),
    commandName: "folder.setParent",
    payload: { folderId: contracts, parentFolderId: null },
  });
  assert.equal(
    knowledgeList(harness).folders.find((item) => item.id === contracts)
      ?.parentFolderId,
    undefined,
  );
});

/**
 * Deleting a folder that still holds anything is REFUSED, and the refusal
 * NAMES what is in the way. A folder is removable only when it is an empty
 * leaf, so deleting a tree is leaf-up — deliberately, because the alternatives
 * are cascading the delete (which destroys notes, the one thing #30 forbids)
 * or cascading the notes to Unfiled (which makes the undo descriptor grow with
 * the folder's contents).
 *
 * Both blocking kinds are asserted, and the note one is asserted from a
 * GRANDCHILD folder: a refusal that only looked at the folder's own notes
 * would let a subtree of notes disappear behind one delete.
 */
it("refuses to remove a folder that still holds notes or child folders, and names them", () => {
  const harness = bootstrapped();
  const clients = createFolder(harness, "Clients");
  const falcon = createFolder(harness, "Falcon", clients);
  const deepNoteId = createNote(harness, "Falcon kickoff", falcon);

  const blockedByNote = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`remove-blocked-${clients}`, {
        [clients]: versionOf(harness, clients),
      }),
      commandName: "folder.remove",
      payload: { folderId: clients },
    }),
  );
  assert.equal(blockedByNote.outcome, "rejected");
  assert.equal(blockedByNote.diagnosticCode, "record.still_referenced");
  if (blockedByNote.diagnosticCode !== "record.still_referenced")
    assert.fail("Expected the removal guard.");
  assert.deepEqual(
    blockedByNote.blockedBy.filter((entry) => entry.recordKind === "document"),
    [{ recordId: deepNoteId, recordKind: "document" }],
    "a note two levels down blocks the delete and is named by id",
  );
  assert.deepEqual(
    blockedByNote.blockedBy.filter((entry) => entry.recordKind === "folder"),
    [{ recordId: falcon, recordKind: "folder" }],
    "and so is the child folder",
  );
  assert.equal(blockedByNote.blockedByCount, 2);

  // Empty the leaf and the leaf goes; the parent still refuses, now naming
  // only the child folder, which is the case a bare "not empty" would leave a
  // person hunting for.
  succeeds(harness, {
    ...metadata(`unfile-${deepNoteId}`, {
      [deepNoteId]: versionOf(harness, deepNoteId),
    }),
    commandName: "document.setFolder",
    payload: { documentId: deepNoteId, folderId: null },
  });
  const blockedByFolder = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`remove-blocked-2-${clients}`, {
        [clients]: versionOf(harness, clients),
      }),
      commandName: "folder.remove",
      payload: { folderId: clients },
    }),
  );
  if (blockedByFolder.diagnosticCode !== "record.still_referenced")
    assert.fail("Expected the removal guard to still refuse.");
  assert.deepEqual(blockedByFolder.blockedBy, [
    { recordId: falcon, recordKind: "folder" },
  ]);

  succeeds(harness, {
    ...metadata(`remove-leaf-${falcon}`, {
      [falcon]: versionOf(harness, falcon),
    }),
    commandName: "folder.remove",
    payload: { folderId: falcon },
  });
  succeeds(harness, {
    ...metadata(`remove-parent-${clients}`, {
      [clients]: versionOf(harness, clients),
    }),
    commandName: "folder.remove",
    payload: { folderId: clients },
  });
  assert.deepEqual(
    knowledgeList(harness).folders,
    [],
    "a removed folder leaves the tree at once, as every removed record does",
  );
});

/**
 * THE TWO SILENT GATES, exercised separately, for the key each command adds.
 *
 * The first is a boundary `refine` that enumerates its own keys: Wave C added
 * a field to a command carrying one and the write of that field ALONE was
 * refused at the boundary as "nothing to change", silently in the schema, in
 * the kernel and in `tsc`. None of B8's commands carries such a refine, and
 * that is by construction rather than luck — `folder.rename` takes one field
 * and `document.setFolder` takes one destination, so there is no member of
 * that family here to drift.
 *
 * The second is `document.create`, which gains an OPTIONAL `folderId` on a
 * command that already existed. That is the exact shape the family is made of,
 * so the new key goes through the boundary ALONE — no `role`, nothing else
 * moved — and the note has to arrive in the folder.
 */
it("accepts document.create carrying only the new folderId beside its required fields", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const documentId = uuid();

  succeeds(harness, {
    ...metadata(`create-with-folder-${documentId}`),
    commandName: "document.create",
    payload: {
      documentId,
      spaceId: ids.space,
      title: "Filed at creation",
      folderId,
    },
  });

  assert.equal(
    knowledgeList(harness).documents.find((item) => item.id === documentId)
      ?.folderId,
    folderId,
    "one command places an imported note, rather than a create and then a move",
  );

  // And the destination is checked on the same terms a move checks it: a
  // create naming a folder that is gone is refused rather than filed nowhere.
  succeeds(harness, {
    ...metadata(`clear-${documentId}`, {
      [documentId]: versionOf(harness, documentId),
    }),
    commandName: "document.setFolder",
    payload: { documentId, folderId: null },
  });
  succeeds(harness, {
    ...metadata(`drop-folder-${folderId}`, {
      [folderId]: versionOf(harness, folderId),
    }),
    commandName: "folder.remove",
    payload: { folderId },
  });
  const orphan = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`create-orphan-${uuid()}`),
      commandName: "document.create",
      payload: {
        documentId: uuid(),
        spaceId: ids.space,
        title: "Filed nowhere",
        folderId,
      },
    }),
  );
  assert.equal(orphan.outcome, "rejected");
});

/**
 * `document.setFolder` expects the NOTE's version and nothing else. A folder
 * holds no list of its notes — which is what makes one folder per note cheap —
 * so demanding the folder's version would make two people filing two different
 * notes into one folder conflict over a record neither of them changed.
 */
it("expects only the note's version when filing it", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const first = createNote(harness, "First");
  const second = createNote(harness, "Second");

  succeeds(harness, {
    ...metadata(`file-first-${first}`, { [first]: versionOf(harness, first) }),
    commandName: "document.setFolder",
    payload: { documentId: first, folderId },
  });
  // The folder's version has NOT moved, so the second filing states the same
  // versions the first one did and must not conflict.
  succeeds(harness, {
    ...metadata(`file-second-${second}`, {
      [second]: versionOf(harness, second),
    }),
    commandName: "document.setFolder",
    payload: { documentId: second, folderId },
  });
  assert.equal(
    knowledgeList(harness).folders.find((item) => item.id === folderId)
      ?.ownNoteCount,
    2,
  );
});

/**
 * ONE TEST PER COMPENSATION KIND, because the vocabulary is silent on a
 * missing entry: Wave C proved that deleting an entry from
 * `CompensationKindSchema` leaves a test that merely "names every compensation
 * kind" green. Each of these names the kind its command records, and the
 * preview projection is parsed against the enum, so DELETING AN ENTRY turns
 * exactly one of them red.
 *
 * The fifth is `document.restore_folder`, which recon's four did not count:
 * `document.setFolder` moves a NOTE, and a move nobody can take back is the
 * failure decision #30 names outright ("jak skopiesz notatki, to cały efekt
 * się zawali").
 */
const previewCompensation = (
  harness: ReferenceHarness,
  targetCommandId: string,
): string | undefined => {
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`preview-${targetCommandId}`),
      commandName: "command.previewUndo",
      payload: { targetCommandId },
    }),
  );
  if (preview.outcome !== "preview") assert.fail("Expected a preview.");
  assert.equal(preview.projection.available, true);
  return preview.projection.compensationKind;
};

it("records folder.undo_create and takes the folder back", () => {
  const harness = bootstrapped();
  const command = {
    ...metadata(`compensate-create-${uuid()}`),
    commandName: "folder.create" as const,
    payload: { folderId: uuid(), spaceId: ids.space, name: "Clients" },
  };
  succeeds(harness, command);
  assert.equal(
    previewCompensation(harness, command.commandId),
    "folder.undo_create",
  );

  succeeds(harness, {
    ...metadata(`undo-create-${uuid()}`, {
      [command.payload.folderId]: versionOf(harness, command.payload.folderId),
    }),
    commandName: "command.undo",
    payload: { targetCommandId: command.commandId },
  });
  assert.deepEqual(knowledgeList(harness).folders, []);
});

it("records folder.restore_details and puts the old name back", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const command = {
    ...metadata(`compensate-rename-${folderId}`, {
      [folderId]: versionOf(harness, folderId),
    }),
    commandName: "folder.rename" as const,
    payload: { folderId, name: "Klienci" },
  };
  succeeds(harness, command);
  assert.equal(
    previewCompensation(harness, command.commandId),
    "folder.restore_details",
  );

  succeeds(harness, {
    ...metadata(`undo-rename-${folderId}`, {
      [folderId]: versionOf(harness, folderId),
    }),
    commandName: "command.undo",
    payload: { targetCommandId: command.commandId },
  });
  assert.equal(
    knowledgeList(harness).folders.find((item) => item.id === folderId)?.name,
    "Clients",
  );
});

it("records folder.restore_parent and puts the folder back where it stood", () => {
  const harness = bootstrapped();
  const clients = createFolder(harness, "Clients");
  const falcon = createFolder(harness, "Falcon", clients);
  const command = {
    ...metadata(`compensate-move-${falcon}`, {
      [falcon]: versionOf(harness, falcon),
    }),
    commandName: "folder.setParent" as const,
    payload: { folderId: falcon, parentFolderId: null },
  };
  succeeds(harness, command);
  assert.equal(
    previewCompensation(harness, command.commandId),
    "folder.restore_parent",
  );

  succeeds(harness, {
    ...metadata(`undo-move-${falcon}`, {
      [falcon]: versionOf(harness, falcon),
    }),
    commandName: "command.undo",
    payload: { targetCommandId: command.commandId },
  });
  assert.equal(
    knowledgeList(harness).folders.find((item) => item.id === falcon)
      ?.parentFolderId,
    clients,
  );
});

it("records folder.restore_record_state and brings the folder back", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const command = {
    ...metadata(`compensate-remove-${folderId}`, {
      [folderId]: versionOf(harness, folderId),
    }),
    commandName: "folder.remove" as const,
    payload: { folderId },
  };
  succeeds(harness, command);
  assert.deepEqual(knowledgeList(harness).folders, []);
  assert.equal(
    previewCompensation(harness, command.commandId),
    "folder.restore_record_state",
  );

  succeeds(harness, {
    ...metadata(`undo-remove-${folderId}`, { [folderId]: 2 }),
    commandName: "command.undo",
    payload: { targetCommandId: command.commandId },
  });
  assert.equal(knowledgeList(harness).folders.length, 1);
});

it("records document.restore_folder and returns a moved note to where it was", () => {
  const harness = bootstrapped();
  const inbox = createFolder(harness, "Inbox");
  const clients = createFolder(harness, "Clients");
  const noteId = createNote(harness, "Falcon kickoff", inbox);
  const command = {
    ...metadata(`compensate-file-${noteId}`, {
      [noteId]: versionOf(harness, noteId),
    }),
    commandName: "document.setFolder" as const,
    payload: { documentId: noteId, folderId: clients },
  };
  succeeds(harness, command);
  assert.equal(
    previewCompensation(harness, command.commandId),
    "document.restore_folder",
  );

  succeeds(harness, {
    ...metadata(`undo-file-${noteId}`, {
      [noteId]: versionOf(harness, noteId),
    }),
    commandName: "command.undo",
    payload: { targetCommandId: command.commandId },
  });
  assert.equal(
    knowledgeList(harness).documents.find((item) => item.id === noteId)
      ?.folderId,
    inbox,
    "the note is back in the folder it came from, not merely out of the new one",
  );
});

/**
 * Taking back the move that FILED a loose note has to leave it loose again.
 * The descriptor records an ABSENT prior folder, and the helper destructures
 * the key away rather than writing `undefined`, so the undo cannot leave the
 * note where the move put it while reporting success.
 */
it("takes an Unfiled note back to Unfiled", () => {
  const harness = bootstrapped();
  const folderId = createFolder(harness, "Clients");
  const noteId = createNote(harness, "Loose thought");
  const command = {
    ...metadata(`file-loose-${noteId}`, {
      [noteId]: versionOf(harness, noteId),
    }),
    commandName: "document.setFolder" as const,
    payload: { documentId: noteId, folderId },
  };
  succeeds(harness, command);

  succeeds(harness, {
    ...metadata(`undo-loose-${noteId}`, {
      [noteId]: versionOf(harness, noteId),
    }),
    commandName: "command.undo",
    payload: { targetCommandId: command.commandId },
  });
  assert.equal(
    knowledgeList(harness).documents.find((item) => item.id === noteId)
      ?.folderId,
    undefined,
  );
});
