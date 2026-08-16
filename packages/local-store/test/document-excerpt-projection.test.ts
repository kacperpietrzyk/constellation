import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  ApplicationKernel,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  CommandEnvelopeSchema,
  DOCUMENT_EXCERPT_MAX_CHARS,
  ExecutionContextSchema,
  type CommandOutcome,
  type DocumentId,
  type ExecutionContext,
} from "@constellation/contracts";
import {
  Base64JsonCursorCodec,
  DeterministicIdGenerator,
  InMemoryAuthorizationPolicy,
  Sha256SemanticHasher,
  TickingClock,
} from "@constellation/testkit";

import {
  SqliteApplicationStore,
  initializeLocalStoreSchema,
  type SqliteDatabase,
} from "../src/index.js";

/**
 * THE EXCERPT ON `knowledge.list` — PHASE III, ENTRY 11-2.
 *
 * WHY THIS FILE EXISTS AND WHY IT IS NOT A CONFORMANCE TEST. The reference
 * store keeps no collaborative document bytes: `memory-store.ts`
 * answers `listDocumentBodyPrefixes` with `[]` and always will. A suite written
 * over the reference harness would therefore be GREEN with the excerpt
 * permanently absent — it would assert that nothing is nothing. That is the
 * exact shape this programme has already paid for twice under the name
 * "an empty fixture protects a wrong assertion", so the only test that can
 * discriminate runs the REAL kernel over a REAL SQLite database, which is what
 * this file does. `document-title-search.test.ts` set the same precedent one
 * schema step earlier and for the same reason.
 *
 * FOUR CLAIMS, and each of them fails differently:
 *   1. a note whose body HAS been indexed comes back with the opening of that
 *      body — not its title, not a snippet centred on a phrase;
 *   2. a note whose body has NEVER been indexed comes back with NO `excerpt`
 *      KEY AT ALL. Not `""`. The write path creates the projection row when a
 *      body is written, so its absence means "never written through this
 *      application", and a reader that receives `""` draws an empty band and
 *      says something false about the note;
 *   3. the excerpt is BOUNDED, and it is bounded by the read rather than by
 *      what happens to be short in the fixture — a body of several thousand
 *      characters must not cross the process boundary whole, once per note,
 *      for every note in the Space;
 *   4. a body that OPENS BY REPEATING THE TITLE does not spend the excerpt on
 *      it. This is the shape an Obsidian import produces by construction (the
 *      title comes from the file name, the `# Title` line stays a heading
 *      node), so it is a production state and not a fixture accident, and the
 *      whole visible clamp is otherwise the line printed directly above.
 */

const ids = {
  workspace: "6c000000-0000-4000-8000-000000000001",
  space: "6c000000-0000-4000-8000-000000000002",
  principal: "6c000000-0000-4000-8000-000000000003",
  credential: "6c000000-0000-4000-8000-000000000004",
  grant: "6c000000-0000-4000-8000-000000000005",
} as const;

let sequence = 8_192;
const uuid = (): string =>
  `6c000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

const sqlitePort = (database: DatabaseSync): SqliteDatabase =>
  database as unknown as SqliteDatabase;

const withDatabase = (run: (filename: string) => void): void => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "constellation-document-excerpt-"),
  );
  try {
    run(path.join(directory, "workspace.db"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

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
      "knowledge.list",
    ],
    origin: "desktop",
  });

const unwrap = (response: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(response.kind, "command_outcome");
  if (response.kind !== "command_outcome")
    throw new Error("Expected a command outcome.");
  return response.outcome;
};

const envelope = (
  commandName: string,
  payload: Readonly<Record<string, unknown>>,
) =>
  CommandEnvelopeSchema.parse({
    contractVersion: 1,
    commandName,
    commandId: uuid(),
    workspaceId: ids.workspace,
    idempotencyKey: `excerpt-${uuid()}`,
    expectedVersions: {},
    correlationId: uuid(),
    payload,
  });

const bootstrapped = (database: DatabaseSync) => {
  const store = new SqliteApplicationStore(sqlitePort(database));
  const authorization = new InMemoryAuthorizationPolicy();
  authorization.register(context());
  const kernel = new ApplicationKernel({
    authorization,
    clock: new TickingClock(),
    cursorCodec: new Base64JsonCursorCodec(),
    hasher: new Sha256SemanticHasher(),
    ids: new DeterministicIdGenerator(),
    store,
  });
  assert.equal(
    unwrap(
      kernel.execute(
        context(),
        envelope("workspace.createLocal", {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Vault",
          timezone: "Europe/Warsaw",
        }),
      ),
    ).outcome,
    "success",
  );
  return { kernel, store };
};

/** The note rows of `knowledge.list`, read through the kernel, not the store. */
const listedNotes = (kernel: ApplicationKernel) => {
  const result = kernel.query(context(), {
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
  return result.result.projection.documents;
};

const createNote = (kernel: ApplicationKernel, title: string): DocumentId => {
  const documentId = uuid() as DocumentId;
  assert.equal(
    unwrap(
      kernel.execute(
        context(),
        envelope("document.create", {
          documentId,
          spaceId: ids.space,
          title,
          role: "note",
        }),
      ),
    ).outcome,
    "success",
  );
  return documentId;
};

describe("the excerpt a note list shows under a title", () => {
  it("carries the opening of the indexed body, and no key at all for a note nobody has written", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(database));
      const { kernel, store } = bootstrapped(database);

      const written = createNote(kernel, "Runbook");
      const untouched = createNote(kernel, "Never opened");

      // This is the state a note is in the moment anybody has written it: the
      // write path refreshes exactly this projection, and the excerpt is read
      // back out of it rather than stored a second time.
      store.replaceDocumentSearchProjection({
        documentId: written,
        workspaceId: ids.workspace as never,
        spaceId: ids.space as never,
        body: "Notatka opisuje kolejność, w jakiej środowisko wstaje od zera.\n\nOkno serwisowe jest podane w dwóch miejscach.",
        stateDigest: "c".repeat(64),
        indexedAt: "2026-08-16T09:00:00.000Z",
      });

      const byId = new Map(listedNotes(kernel).map((note) => [note.id, note]));

      // CLAIM 1 — THE TEXT, not "some non-empty string". A pair asserting only
      // that the field is present would be satisfied by a full stop.
      assert.equal(
        byId.get(written)?.excerpt,
        "Notatka opisuje kolejność, w jakiej środowisko wstaje od zera. Okno serwisowe jest podane w dwóch miejscach.",
        "the note list must receive the opening of the indexed body; a projection that stops composing the excerpt leaves every row a title and nothing else",
      );
      // And the newlines are gone rather than carried: the row clamps to two
      // lines, and a body's block breaks would spend both of them on the first
      // sentence.
      assert.equal(byId.get(written)?.excerpt?.includes("\n"), false);

      // CLAIM 2 — ABSENT, NOT EMPTY, and both halves are asserted because a
      // projection that sent `""` would satisfy the first alone.
      assert.equal(byId.get(untouched)?.excerpt, undefined);
      assert.equal(
        Object.hasOwn(byId.get(untouched) ?? {}, "excerpt"),
        false,
        "a note with no indexed body must carry no excerpt key, so the reader can tell 'never written' from 'says nothing'",
      );
      database.close();
    });
  });

  it("bounds a long body at the read, and cuts it on a word boundary", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(database));
      const { kernel, store } = bootstrapped(database);
      const documentId = createNote(kernel, "Long");

      // Derived from the bound rather than pinned to a number: a literal here
      // would go stale the day the bound moved and would then assert that the
      // bound is whatever it used to be.
      const word = "kolejność ";
      const body = word.repeat(
        Math.ceil((DOCUMENT_EXCERPT_MAX_CHARS * 4) / word.length),
      );
      store.replaceDocumentSearchProjection({
        documentId,
        workspaceId: ids.workspace as never,
        spaceId: ids.space as never,
        body,
        stateDigest: "d".repeat(64),
        indexedAt: "2026-08-16T09:00:00.000Z",
      });

      const excerpt = listedNotes(kernel).find(
        (note) => note.id === documentId,
      )?.excerpt;
      assert.equal(typeof excerpt, "string");
      assert.equal(
        (excerpt ?? "").length <= DOCUMENT_EXCERPT_MAX_CHARS,
        true,
        `a ${body.length}-character body must not cross the boundary whole`,
      );
      // THE BOUND IS NOT THE ONLY CLAIM. A read that returned one character
      // would also satisfy it, so the excerpt has to be most of what was asked
      // for — and it has to end on a word, not mid-token.
      assert.equal(
        (excerpt ?? "").length > DOCUMENT_EXCERPT_MAX_CHARS / 2,
        true,
      );
      assert.equal((excerpt ?? "").endsWith("kolejność"), true);
      database.close();
    });
  });

  it("does not open by repeating the title the row already shows", () => {
    withDatabase((filename) => {
      const database = new DatabaseSync(filename);
      initializeLocalStoreSchema(sqlitePort(database));
      const { kernel, store } = bootstrapped(database);

      // THE OBSIDIAN SHAPE, WRITTEN OUT. The importer takes the title from the
      // file name and keeps the `# Title` line as a heading node, and the
      // plain text the search projection stores joins block nodes with a
      // newline — so this is byte-for-byte what the first import produces.
      // The heading is a SUFFIX of the title rather than equal to it, because
      // that is the ordinary case (`Orbit — <heading>`) and an equality test
      // would pass while the reader still read the title twice.
      const echoing = createNote(
        kernel,
        "Orbit — runbook uruchomienia środowiska",
      );
      const quoting = createNote(kernel, "EPS");
      store.replaceDocumentSearchProjection({
        documentId: echoing,
        workspaceId: ids.workspace as never,
        spaceId: ids.space as never,
        body: "Runbook uruchomienia środowiska\nNotatka opisuje kolejność, w jakiej środowisko wstaje od zera.",
        stateDigest: "e".repeat(64),
        indexedAt: "2026-08-16T09:00:00.000Z",
      });
      // THE OTHER SIDE OF THE SAME RULE, and it is the reason the test is
      // asymmetric rather than "either contains the other": a note whose text
      // legitimately OPENS with its own subject must keep that opening. A
      // symmetric rule would eat this line and leave the row saying nothing.
      store.replaceDocumentSearchProjection({
        documentId: quoting,
        workspaceId: ids.workspace as never,
        spaceId: ids.space as never,
        body: "EPS liczony z próbki tygodniowej zaniża wolumen.\nDruga linia.",
        stateDigest: "f".repeat(64),
        indexedAt: "2026-08-16T09:00:00.000Z",
      });

      const byId = new Map(listedNotes(kernel).map((note) => [note.id, note]));
      assert.equal(
        byId.get(echoing)?.excerpt,
        "Notatka opisuje kolejność, w jakiej środowisko wstaje od zera.",
        "a body opening with its own title must reach the row as the text UNDER that heading, not as the title a second time",
      );
      assert.equal(
        byId.get(quoting)?.excerpt,
        "EPS liczony z próbki tygodniowej zaniża wolumen. Druga linia.",
        "a first line that merely mentions the note's name is the note's own text and must survive",
      );
      database.close();
    });
  });
});
