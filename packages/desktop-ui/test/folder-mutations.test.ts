/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  DocumentIdSchema,
  FolderIdSchema,
  PrincipalIdSchema,
  type CommandEnvelope,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createDocument,
  createFolder,
  removeFolder,
  renameFolder,
  setDocumentFolder,
  setFolderParent,
  type DesktopSnapshot,
} from "../src/client/workflow.js";
import { populatedBootstrap, workspaceId } from "./shell-fixture.js";

/**
 * THE SECOND SILENT GATE. The kernel conformance tests prove the folder
 * commands work; they cannot see the envelope the RENDERER builds. Wave C
 * found a wrapper one layer out that computed "is anything actually changing"
 * and refused a write of a NEW field alone as "nothing to change" — invisible
 * to the schema, to the kernel and to `tsc`, and visible only as a refused
 * command in a person's hands. So every new key goes through this boundary on
 * its own here, separately from the kernel tests.
 *
 * `null` is the value at risk. On `document.setFolder` it means Unfiled, which
 * is a real destination; a wrapper written with `value ? {...} : {}` would drop
 * it and the note would silently stay where it was while the caller was told
 * the move succeeded.
 */

const principalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a1",
);
const folderId = FolderIdSchema.parse("00000000-0000-4000-8000-0000000000f1");
const parentFolderId = FolderIdSchema.parse(
  "00000000-0000-4000-8000-0000000000f2",
);
const documentId = DocumentIdSchema.parse(
  "00000000-0000-4000-8000-0000000000e1",
);

const unavailable = {
  kind: "unavailable" as const,
  message: "These wrappers do not read this slice.",
};

const snapshot = (): DesktopSnapshot => ({
  build: {
    channel: "local-alpha",
    startupRecovery: "none",
    workspaceAvailability: "ready",
    initialWorkspaceId: workspaceId,
    persistence: "encrypted-local",
    version: "test",
  },
  bootstrap: populatedBootstrap,
  captures: [],
  tasks: [],
  projects: unavailable,
  work: unavailable,
  cockpit: unavailable,
  activity: unavailable,
  access: {
    kind: "ready",
    data: {
      kind: "workspace.access",
      policyVersion: 1,
      currentPrincipalId: principalId,
      canManage: true,
      members: [],
    },
  },
  agentAccess: unavailable,
  assignmentCandidates: unavailable,
  mentionCandidates: unavailable,
  attention: unavailable,
  documents: unavailable,
  knowledge: unavailable,
  relationships: unavailable,
  radar: unavailable,
});

const projectionFor = (command: CommandEnvelope) => {
  const payload = command.payload as Record<string, unknown>;
  switch (command.commandName) {
    case "folder.create":
      return {
        kind: "folder.created",
        folderId: payload["folderId"],
        name: payload["name"],
        version: 1,
      };
    case "folder.rename":
      return {
        kind: "folder.renamed",
        folderId: payload["folderId"],
        name: payload["name"],
        version: 2,
      };
    case "folder.setParent":
      return {
        kind: "folder.parent_changed",
        folderId: payload["folderId"],
        version: 2,
      };
    case "folder.remove":
      return {
        kind: "folder.removed",
        folderId: payload["folderId"],
        version: 2,
      };
    case "document.setFolder":
      return {
        kind: "document.folder_changed",
        documentId: payload["documentId"],
        version: 2,
      };
    default:
      return {
        kind: "document.created",
        documentId: payload["documentId"],
        title: payload["title"],
        role: "note",
        version: 1,
      };
  }
};

/**
 * `execute` runs `CommandEnvelopeSchema.parse` before this is reached, so an
 * envelope that arrives here has satisfied the real contract. A payload key
 * the schema does not allow leaves the recorder empty and the wrapper returns
 * an error, which is why every test below asserts the success AND the envelope.
 */
const recordingClient = (
  sent: CommandEnvelope[],
): ConstellationRendererClient =>
  ({
    executeCommand: async (command: CommandEnvelope) => {
      sent.push(command);
      return {
        kind: "command_outcome",
        outcome: {
          contractVersion: 1,
          commandId: command.commandId,
          correlationId: command.correlationId,
          kernelTime: "2026-08-01T12:00:00.000Z",
          outcome: "success",
          diagnosticCode: "accepted",
          affected: [],
          auditReceiptId: "90000000-0000-4000-8000-000000000009",
          projection: projectionFor(command),
        },
      };
    },
  }) as unknown as ConstellationRendererClient;

const onlyEnvelope = (sent: readonly CommandEnvelope[]): CommandEnvelope => {
  assert.equal(sent.length, 1, "expected exactly one command");
  const envelope = sent[0];
  if (envelope === undefined) throw new Error("no command was recorded");
  return envelope;
};

const payloadKeys = (envelope: CommandEnvelope): readonly string[] =>
  Object.keys(envelope.payload as Record<string, unknown>).sort();

const versionKeys = (envelope: CommandEnvelope): readonly string[] =>
  Object.keys(envelope.expectedVersions).sort();

test("filing a note into a folder sends the destination and only the note's version", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await setDocumentFolder(
    recordingClient(sent),
    snapshot(),
    { id: documentId, version: 3 },
    folderId,
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "document.setFolder");
  assert.deepEqual(payloadKeys(envelope), ["documentId", "folderId"]);
  // The exact key set, not "the note is in there": `exactExpected` treats one
  // id too many as a conflict, and the folder is NOT written by this command.
  assert.deepEqual(versionKeys(envelope), [documentId]);
  assert.deepEqual(envelope.expectedVersions, { [documentId]: 3 });
});

test("dropping a note on Unfiled sends an explicit null rather than dropping the key", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await setDocumentFolder(
    recordingClient(sent),
    snapshot(),
    { id: documentId, version: 3 },
    null,
  );
  assert.equal(
    result.kind,
    "success",
    "Unfiled is a destination, never a wrapper-level no-op",
  );
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal("folderId" in payload, true);
  assert.equal(payload["folderId"], null);
});

test("creating a folder at the root omits the parent key rather than sending undefined", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await createFolder(recordingClient(sent), snapshot(), {
    name: "Clients",
  });
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "folder.create");
  // By key set, never by comparing a value to `undefined`: `.strict()` refuses
  // UNKNOWN keys, not a known optional key that is present holding `undefined`,
  // so an equality check cannot tell "omitted" from "present and empty".
  assert.deepEqual(payloadKeys(envelope), ["folderId", "name", "spaceId"]);
  assert.deepEqual(versionKeys(envelope), []);
});

test("creating a folder inside another sends the parent", async () => {
  const sent: CommandEnvelope[] = [];
  await createFolder(recordingClient(sent), snapshot(), {
    name: "Falcon",
    parentFolderId,
  });
  const envelope = onlyEnvelope(sent);
  assert.deepEqual(payloadKeys(envelope), [
    "folderId",
    "name",
    "parentFolderId",
    "spaceId",
  ]);
  assert.equal(
    (envelope.payload as Record<string, unknown>)["parentFolderId"],
    parentFolderId,
  );
});

test("renaming a folder sends one field and that folder's version", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await renameFolder(
    recordingClient(sent),
    snapshot(),
    { id: folderId, version: 4 },
    "Klienci",
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "folder.rename");
  assert.deepEqual(payloadKeys(envelope), ["folderId", "name"]);
  assert.deepEqual(envelope.expectedVersions, { [folderId]: 4 });
});

test("moving a folder to the root sends an explicit null", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await setFolderParent(
    recordingClient(sent),
    snapshot(),
    { id: folderId, version: 4 },
    null,
  );
  assert.equal(result.kind, "success");
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal("parentFolderId" in payload, true);
  assert.equal(payload["parentFolderId"], null);
});

test("removing a folder sends its id and its version", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await removeFolder(recordingClient(sent), snapshot(), {
    id: folderId,
    version: 4,
  });
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "folder.remove");
  assert.deepEqual(payloadKeys(envelope), ["folderId"]);
  assert.deepEqual(envelope.expectedVersions, { [folderId]: 4 });
});

test("creating a note without a folder omits folderId; creating one inside a folder carries it", async () => {
  const loose: CommandEnvelope[] = [];
  await createDocument(recordingClient(loose), snapshot(), "Loose", "note");
  assert.deepEqual(payloadKeys(onlyEnvelope(loose)), [
    "documentId",
    "role",
    "spaceId",
    "title",
  ]);

  const filed: CommandEnvelope[] = [];
  const result = await createDocument(
    recordingClient(filed),
    snapshot(),
    "Filed",
    "note",
    folderId,
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(filed);
  assert.deepEqual(payloadKeys(envelope), [
    "documentId",
    "folderId",
    "role",
    "spaceId",
    "title",
  ]);
  assert.equal(
    (envelope.payload as Record<string, unknown>)["folderId"],
    folderId,
    "an import places a note in one command rather than a create and a move",
  );
});
