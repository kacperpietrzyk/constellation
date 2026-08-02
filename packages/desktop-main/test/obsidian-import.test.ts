import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandEnvelopeSchema,
  ExecutionContextSchema,
  QueryEnvelopeSchema,
} from "@constellation/contracts";
import { InMemoryReferenceStore } from "@constellation/testkit";
import type { StructuredDocument } from "@constellation/realtime-documents";

import {
  applyObsidianImport,
  obsidianExternalId,
  planObsidianImport,
  type ObsidianImportPorts,
  type ObsidianVaultFile,
} from "../src/obsidian-import.js";
import { createRuntimeKernelService } from "../src/runtime-kernel-service.js";

/**
 * The Obsidian import, against the real command layer.
 *
 * Every assertion here was verified by breaking it, with `tsc -b` inside the
 * loop. The load-bearing one is idempotence: the same vault imported twice
 * must not double anything, which is the entire reason `externalId` was added
 * to `NativeDocument` at all.
 */

const context = ExecutionContextSchema.parse({
  principalId: "3d000000-0000-4000-8000-000000000001",
  principalKind: "human",
  credentialId: "3d000000-0000-4000-8000-000000000002",
  grantId: "3d000000-0000-4000-8000-000000000003",
  policyVersion: 1,
  workspaceId: "3d000000-0000-4000-8000-000000000004",
  spaceScope: ["3d000000-0000-4000-8000-000000000005"],
  capabilityScope: [
    "workspace.createLocal",
    "document.create",
    "document.remove",
    "folder.create",
    "folder.rename",
    "knowledge.list",
    "document.list",
  ],
  origin: "desktop",
});

const workspaceId = context.workspaceId;
const spaceId = context.spaceScope[0]!;

const bootstrapped = () => {
  const service = createRuntimeKernelService({
    context,
    store: new InMemoryReferenceStore(),
  });
  service.execute(
    CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "workspace.createLocal",
      commandId: crypto.randomUUID(),
      workspaceId,
      idempotencyKey: "obsidian-test-workspace",
      expectedVersions: {},
      correlationId: crypto.randomUUID(),
      payload: {
        workspaceId,
        rootSpaceId: spaceId,
        ownerPrincipalId: context.principalId,
        name: "Vault",
        timezone: "Europe/Warsaw",
      },
    }),
  );
  return service;
};

const knowledgeList = (service: ReturnType<typeof bootstrapped>) => {
  const response = service.query(
    QueryEnvelopeSchema.parse({
      contractVersion: 1,
      queryName: "knowledge.list",
      queryId: crypto.randomUUID(),
      workspaceId,
      consistency: "local_authoritative",
      parameters: { spaceId },
    }),
  );
  if (
    response.kind !== "query_result" ||
    response.result.outcome !== "success" ||
    response.result.projection.kind !== "knowledge.list"
  )
    assert.fail("Expected the knowledge list.");
  return response.result.projection;
};

const portsFor = (
  service: ReturnType<typeof bootstrapped>,
  records: Readonly<
    Record<string, { readonly targetKind: string; readonly targetId: string }>
  > = {},
): ObsidianImportPorts => ({
  readExisting: () => {
    const list = knowledgeList(service);
    return {
      folders: list.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
      })),
      documents: list.documents.map((document) => ({
        id: document.id,
        title: document.title,
        externalId: document.externalId,
      })),
    };
  },
  resolveRecord: (name) => records[name],
});

/** The vault the whole file is built on: nested, Polish, duplicated, broken. */
const vault: readonly ObsidianVaultFile[] = [
  {
    path: "Klienci/Falcon/Kickoff.md",
    text: "Start with [[Wdrożenie w Łodzi]] and [[Nothing here]].",
  },
  {
    path: "Klienci/Wdrożenie w Łodzi.md",
    text: "Zażółć gęślą jaźń. Back to [[Kickoff]].",
  },
  { path: "Klienci/Orbit/Kickoff.md", text: "A second file with one name." },
  { path: "Loose thought.md", text: "No links at all." },
  { path: "Broken.md", text: "[[Nowhere]] and [[Also nowhere]]." },
];

const applied = (
  service: ReturnType<typeof bootstrapped>,
  files: readonly ObsidianVaultFile[],
  written: Map<string, StructuredDocument>,
  records?: Readonly<
    Record<string, { readonly targetKind: string; readonly targetId: string }>
  >,
) => {
  const ports = portsFor(service, records);
  const plan = planObsidianImport(files, ports);
  const result = applyObsidianImport({
    service,
    workspaceId,
    spaceId,
    plan,
    ports,
    writeContent: ({ documentId, content }) => {
      written.set(documentId, content);
    },
  });
  return { plan, result };
};

test("the vault's directories become a folder tree and its files become notes", () => {
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  const { plan, result } = applied(service, vault, written);

  assert.deepEqual(
    plan.folders.map((folder) => folder.key),
    ["Klienci", "Klienci/Falcon", "Klienci/Orbit"],
    "the tree is built from the directories that hold notes, parents first",
  );
  assert.equal(result.foldersCreated, 3);
  assert.equal(result.notesCreated, 5);

  const list = knowledgeList(service);
  const byName = new Map(list.folders.map((folder) => [folder.name, folder]));
  assert.equal(
    byName.get("Falcon")?.parentFolderId,
    byName.get("Klienci")?.id,
    "a nested directory becomes a nested folder rather than a second root",
  );
  assert.equal(byName.get("Klienci")?.noteCount, 3);
  assert.equal(byName.get("Klienci")?.ownNoteCount, 1);
  assert.equal(
    list.documents.find((document) => document.title === "Loose thought")
      ?.folderId,
    undefined,
    "a note at the vault root is Unfiled rather than filed under an invented folder",
  );
});

/**
 * IDEMPOTENCE, WHICH IS A REQUIREMENT AND NOT A NICETY.
 *
 * BROKEN BY: dropping `externalId` from the `document.create` payload in
 * `applyObsidianImport`, or from the handler literal that projects it into
 * `knowledge.list.documents`. Either way the second run recognises nothing and
 * the counts double — which is what this asserts, rather than asserting that
 * ids are stable, because a second run that created nothing at all for the
 * wrong reason would pass that.
 */
test("importing the same vault twice does not double a single note or folder", () => {
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  const first = applied(service, vault, written);
  const after = knowledgeList(service);
  assert.equal(after.documents.length, 5);
  assert.equal(after.folders.length, 3);

  const second = applied(service, vault, written);
  const again = knowledgeList(service);
  assert.equal(again.documents.length, 5, "the second run created notes again");
  assert.equal(again.folders.length, 3, "the second run created folders again");
  assert.equal(second.result.notesCreated, 0);
  assert.equal(second.result.foldersCreated, 0);
  assert.equal(second.result.notesMatched, 5);
  assert.equal(second.result.foldersMatched, 3);
  // The bodies are still rewritten: a partial first run is exactly the case a
  // re-run exists for, and the plan cannot tell which halves landed.
  assert.equal(second.result.bodiesWritten, 5);
  assert.equal(first.result.bodiesWritten, 5);
  assert.deepEqual(
    again.documents.map((document) => document.externalId).sort(),
    vault.map((file) => obsidianExternalId(file.path)).sort(),
  );
});

/**
 * THE MITIGATION FOR FOLDERS HAVING NO SOURCE KEY.
 *
 * A `Folder` carries no `externalId`, so a re-run matches on the path. Rename
 * a folder inside Constellation and a second run builds a second tree — which
 * cannot be prevented cheaply, but MUST NOT BE WALKED INTO BLIND. The preview
 * separates matched from created precisely so somebody expecting "31 matched"
 * sees "31 will be created" and stops.
 *
 * BROKEN BY: reporting one folder total instead of the two, or by matching on
 * name alone without the parent.
 */
test("the preview says how many folders are matched and how many are created", () => {
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  applied(service, vault, written);

  const untouched = planObsidianImport(vault, portsFor(service));
  assert.equal(untouched.counts.foldersMatched, 3);
  assert.equal(untouched.counts.foldersCreated, 0);

  // A folder renamed in the app is no longer findable by its vault path.
  const list = knowledgeList(service);
  const renamed = list.folders.find((folder) => folder.name === "Falcon")!;
  service.execute(
    CommandEnvelopeSchema.parse({
      contractVersion: 1,
      commandName: "folder.rename",
      commandId: crypto.randomUUID(),
      workspaceId,
      idempotencyKey: `rename-${renamed.id}`,
      expectedVersions: { [renamed.id]: renamed.version },
      correlationId: crypto.randomUUID(),
      payload: { folderId: renamed.id, name: "Falcon Industries" },
    }),
  );
  const afterRename = planObsidianImport(vault, portsFor(service));
  assert.equal(
    afterRename.counts.foldersCreated,
    1,
    "a renamed folder must show up as one that WILL BE CREATED, before it is",
  );
  assert.equal(afterRename.counts.foldersMatched, 2);
});

/**
 * A nested folder is matched by its PARENT and its name together. Matching on
 * the name alone would find a same-named folder anywhere in the Space, and a
 * vault with `Klienci/Notes` and `Projekty/Notes` would collapse into one.
 */
test("a folder is matched under its own parent, never by name alone", () => {
  // BOTH parents must ALREADY exist for this to bite. A child whose own parent
  // is new cannot match anything anyway — the guard clause sees to that — so a
  // vault with only one branch present passes even with the parent ignored,
  // which is what the first version of this test did. The first import lays
  // down `Projekty/Notes` AND `Klienci`; the second then asks for
  // `Klienci/Notes`, whose name a folder elsewhere in the Space already holds.
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  applied(
    service,
    [
      { path: "Projekty/Notes/One.md", text: "one" },
      { path: "Klienci/Placeholder.md", text: "placeholder" },
    ],
    written,
  );
  const plan = planObsidianImport(
    [
      { path: "Projekty/Notes/One.md", text: "one" },
      { path: "Klienci/Placeholder.md", text: "placeholder" },
      { path: "Klienci/Notes/Two.md", text: "two" },
    ],
    portsFor(service),
  );
  assert.deepEqual(
    plan.folders.map((folder) => [folder.key, folder.existingId !== undefined]),
    [
      ["Klienci", true],
      ["Projekty", true],
      ["Klienci/Notes", false],
      ["Projekty/Notes", true],
    ],
    "a folder was matched to a same-named one under a different parent",
  );
});

/**
 * WIKILINKS ARE THE WHOLE POINT. A link to a note becomes a `document`
 * reference, a link naming a record becomes that record's, and one that
 * resolves to nothing becomes the text that was written.
 */
test("a link to a note becomes a document reference and a broken one stays text", () => {
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  const { plan, result } = applied(service, vault, written);

  assert.equal(plan.counts.links, 5);
  // `[[Kickoff]]` is ambiguous — two files carry that name — so only the
  // Polish-titled one resolves. That is the honest count, not a shortfall.
  assert.equal(plan.counts.linksToNotes, 1);
  assert.equal(plan.counts.linksUnresolved, 4);
  assert.deepEqual(plan.unresolvedTargets, [
    "Also nowhere",
    "Kickoff",
    "Nothing here",
    "Nowhere",
  ]);
  assert.equal(result.linksResolved, 1);
  assert.equal(result.linksUnresolved, 4);

  const list = knowledgeList(service);
  const kickoff = list.documents.find(
    (document) =>
      document.externalId === obsidianExternalId("Klienci/Falcon/Kickoff.md"),
  )!;
  const rollout = list.documents.find(
    (document) =>
      document.externalId ===
      obsidianExternalId("Klienci/Wdrożenie w Łodzi.md"),
  )!;
  const body = written.get(kickoff.id)!;
  const inline = body.content[0]?.content ?? [];
  const reference = inline.find((node) => node.type === "entityReference");
  assert.equal(reference?.attrs?.targetKind, "document");
  assert.equal(
    reference?.attrs?.targetId,
    rollout.id,
    "the Polish-titled note is the one the link resolves to, matched as written",
  );
  assert.ok(
    inline.some((node) => (node.text ?? "").includes("[[Nothing here]]")),
    "the unresolvable link did not stay as the text that was written",
  );
  assert.equal(
    inline.some((node) => (node.text ?? "").includes(rollout.id)),
    false,
    "an id leaked into the body as text",
  );
});

test("a name two files share resolves to neither, rather than to whichever came first", () => {
  // `Klienci/Falcon/Kickoff.md` and `Klienci/Orbit/Kickoff.md` both answer to
  // `[[Kickoff]]`. Picking one would silently point half a vault's links at the
  // wrong note, and there is no way for the person to see that it happened.
  const plan = planObsidianImport(vault, {
    readExisting: () => ({ folders: [], documents: [] }),
    resolveRecord: () => undefined,
  });
  assert.ok(
    plan.unresolvedTargets.includes("Kickoff"),
    "an ambiguous link resolved to something",
  );
  // A PATH is not ambiguous, so the same vault resolves the explicit form.
  const explicit = planObsidianImport(
    [...vault, { path: "Explicit.md", text: "[[Klienci/Orbit/Kickoff]]" }],
    {
      readExisting: () => ({ folders: [], documents: [] }),
      resolveRecord: () => undefined,
    },
  );
  assert.equal(explicit.counts.linksToNotes, 2);
});

/**
 * AN AMBIGUOUS VAULT NAME IS UNRESOLVABLE, and it does NOT fall through to a
 * record search.
 *
 * The discriminating case, and the one the first version of the ambiguity test
 * could not see because it answered `undefined` to every record: two files
 * called `Kickoff` PLUS a Project called `Kickoff`. Collapsing "several files
 * claim this" into "no file claims this" sent the link to the Project — which
 * is confidently wrong, and inverts the rule that a note in the vault wins over
 * a record of the same name in exactly the case that rule exists for.
 *
 * BROKEN BY: removing the `ambiguous` arm from `answerFor` or from
 * `resolutionFor` — they must stay one rule.
 */
test("an ambiguous name is not handed to the record search instead", () => {
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  const { plan, result } = applied(service, vault, written, {
    Kickoff: {
      targetKind: "project",
      targetId: "3d000000-0000-4000-8000-0000000000a3",
    },
  });
  assert.equal(plan.counts.linksToRecords, 0, "an ambiguous link found a record");
  assert.ok(plan.unresolvedTargets.includes("Kickoff"));
  assert.equal(result.linksUnresolved, 4);
  const rollout = [...written.values()].find((document) =>
    (document.content[0]?.content ?? []).some((node) =>
      (node.text ?? "").includes("[[Kickoff]]"),
    ),
  );
  assert.ok(rollout, "the ambiguous link did not stay as the text that was written");
  assert.equal(
    (rollout.content[0]?.content ?? []).some(
      (node) => node.type === "entityReference",
    ),
    false,
    "an ambiguous link became a reference to something",
  );
});

test("a link naming a record becomes that record's reference", () => {
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  const projectId = "3d000000-0000-4000-8000-0000000000a1";
  const { plan } = applied(
    service,
    [{ path: "Plan.md", text: "Runs under [[Orbit rollout]]." }],
    written,
    { "Orbit rollout": { targetKind: "project", targetId: projectId } },
  );
  assert.equal(plan.counts.linksToRecords, 1);
  const [document] = [...written.values()];
  const reference = (document?.content[0]?.content ?? []).find(
    (node) => node.type === "entityReference",
  );
  assert.equal(reference?.attrs?.targetKind, "project");
  assert.equal(reference?.attrs?.targetId, projectId);
});

test("a note the vault holds wins over a record with the same name", () => {
  // The vault is what the person is migrating, and `[[X]]` inside it means
  // "the file X". A record search answering first would silently redirect a
  // note-to-note link at whatever else happens to be called that.
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  const { plan } = applied(
    service,
    [
      { path: "Plan.md", text: "See [[Orbit]]." },
      { path: "Orbit.md", text: "The note." },
    ],
    written,
    {
      Orbit: {
        targetKind: "project",
        targetId: "3d000000-0000-4000-8000-0000000000a2",
      },
    },
  );
  assert.equal(plan.counts.linksToNotes, 1);
  assert.equal(plan.counts.linksToRecords, 0);
});

test("a note too large to store is named in the preview and never half-written", () => {
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  const { plan, result } = applied(
    service,
    [
      { path: "Small.md", text: "fine" },
      { path: "Huge.md", text: "x".repeat(210_000) },
    ],
    written,
  );
  assert.deepEqual(plan.skipped, [{ path: "Huge.md", reason: "too_large" }]);
  assert.equal(plan.counts.notesCreated, 1);
  assert.equal(result.notesCreated, 1);
  assert.equal(
    knowledgeList(service).documents.length,
    1,
    "a note whose body cannot be stored must not arrive as an empty note",
  );
});

test("the plan counts what the vault holds that this model cannot express", () => {
  const plan = planObsidianImport(
    [
      {
        path: "Rich.md",
        text: [
          "---",
          "tags: [a]",
          "---",
          "",
          "> [!warning] Careful",
          "",
          "![[Other]]",
          "",
          "- [ ] a box",
          "",
          "#tag and [rel](./x.md) and ![pic](a.png)",
        ].join("\n"),
      },
    ],
    {
      readExisting: () => ({ folders: [], documents: [] }),
      resolveRecord: () => undefined,
    },
  );
  assert.deepEqual(plan.constructs, {
    frontmatter: 1,
    embed: 1,
    tag: 1,
    taskCheckbox: 1,
    callout: 1,
    blockReference: 0,
    imageLink: 1,
    relativeLink: 1,
    listItemLead: 0,
  });
});

test("a file renamed in the vault arrives as a new note, and a renamed note is reported", () => {
  const service = bootstrapped();
  const written = new Map<string, StructuredDocument>();
  applied(service, [{ path: "Plan.md", text: "body" }], written);
  // There is NO `document.rename`. A title corrected inside Constellation and
  // then re-imported keeps the stored title; the count is what says so.
  const list = knowledgeList(service);
  const stored = list.documents[0]!;
  assert.equal(stored.title, "Plan");
  const plan = planObsidianImport([{ path: "Plan.md", text: "body" }], {
    readExisting: () => ({
      folders: [],
      documents: [
        {
          id: stored.id,
          title: "Renamed by hand",
          externalId: stored.externalId,
        },
      ],
    }),
    resolveRecord: () => undefined,
  });
  assert.equal(plan.counts.titlesDiverged, 1);
  assert.equal(plan.notes[0]?.storedTitle, "Renamed by hand");
});

test("a source key longer than the field is still stable across runs", () => {
  const deep = `${"folder/".repeat(90)}Note.md`;
  const key = obsidianExternalId(deep);
  assert.ok(key.length <= 500);
  assert.equal(key, obsidianExternalId(deep));
  assert.notEqual(key, obsidianExternalId(`${"folder/".repeat(90)}Other.md`));
});
