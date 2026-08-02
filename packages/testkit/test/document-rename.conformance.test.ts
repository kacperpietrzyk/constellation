import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  DocumentIdSchema,
  ExecutionContextSchema,
  QueryProjectionSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness, type ReferenceHarness } from "../src/index.js";

/**
 * `document.rename` — the command that closes the gap where a note's title
 * could not be changed BY ANY MEANS: not by the Obsidian import, which counted
 * the notes whose title had moved in the vault and could do nothing about it,
 * not by any screen, not by an agent through MCP.
 *
 * WHY THE PROJECTION HALF OF THIS FILE IS DERIVED RATHER THAN LISTED.
 * `NativeDocument` HAS NO COMPILE-TIME PROJECTION GUARD — `UnprojectableKeys`
 * in `application/src/wave2.ts` compares key sets for `StrategicRecord` and
 * for nothing else — and every projection that carries a note is a hand-picked
 * object literal in the kernel. So a value can be correct on the record, pass
 * `tsc`, pass every unit test over the record, and simply never reach a
 * reader.
 *
 * `document-external-id.conformance.test.ts` beside this file answered that
 * with four tests named "PROJECTION HOME n of 4", written from a hand count.
 * THE HAND COUNT WAS SHORT: walking `QueryProjectionSchema` for object shapes
 * that carry both a `DocumentIdSchema` key and a `title` finds SIX, and the
 * two nobody had counted are `project.operationalOverview.relatedDocuments`
 * and `organization.operationalOverview.documents` — the client record and the
 * project record, which are exactly the screens where a note is found by its
 * name rather than opened from a list. That is standing rule 6 (a hand-written
 * list beside a closed vocabulary) landing on the guard itself, so this file
 * derives the set and fails when it grows.
 *
 * `search.global` is deliberately NOT in the derived set: its items carry a
 * bare `recordId: z.uuid()` because one list holds every record kind, so it is
 * not a note-shaped projection and this signature does not claim it. The
 * search index is a STORE concern — a title reaches it through a trigger, not
 * through this kernel — and it is proven in
 * `packages/local-store/test/document-title-search.test.ts` against a real
 * SQLite database. The reference store here has no FTS at all, so a green
 * search read in this file would prove nothing about the index.
 */

const ids = {
  workspace: "5e000000-0000-4000-8000-000000000001",
  space: "5e000000-0000-4000-8000-000000000002",
  principal: "5e000000-0000-4000-8000-000000000003",
  credential: "5e000000-0000-4000-8000-000000000004",
  grant: "5e000000-0000-4000-8000-000000000005",
} as const;

let sequence = 200;
const uuid = (): string =>
  `5e000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;

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
      "document.rename",
      "document.remove",
      "document.list",
      "document.backlinks",
      "knowledge.list",
      "knowledge.documentContext",
      "project.create",
      "project.operationalOverview",
      "organization.operationalOverview",
      "relationship.organizationCreate",
      "command.previewUndo",
      "command.undo",
      "activity.changeFeed",
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
  assert.equal(
    unwrap(
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
    ).outcome,
    "success",
  );
  return harness;
};

const createNote = (
  harness: ReferenceHarness,
  title: string,
): { readonly documentId: string; readonly outcome: CommandOutcome } => {
  const documentId = uuid();
  const outcome = unwrap(
    harness.kernel.execute(context(), {
      ...metadata(`document-${documentId}`),
      commandName: "document.create",
      payload: { documentId, spaceId: ids.space, title, role: "note" as const },
    }),
  );
  assert.equal(outcome.outcome, "success");
  return { documentId, outcome };
};

const renameResponse = (
  harness: ReferenceHarness,
  documentId: string,
  title: string,
  expectedVersion: number,
): ApplicationCommandResponse =>
  harness.kernel.execute(context(), {
    ...metadata(`rename-${uuid()}`),
    commandName: "document.rename",
    expectedVersions: { [documentId]: expectedVersion },
    payload: { documentId, title },
  });

const rename = (
  harness: ReferenceHarness,
  documentId: string,
  title: string,
  expectedVersion: number,
): CommandOutcome =>
  unwrap(renameResponse(harness, documentId, title, expectedVersion));

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

/**
 * Every projection shape that carries a note's title, read out of the schema.
 *
 * The signature is a `DocumentIdSchema` key beside a `title` key. It is an
 * IDENTITY comparison against the exported schema rather than a name match, so
 * an `id` that is a Project's or a Folder's does not answer here, and a shape
 * that stops naming its id `id` still does.
 *
 * `seen` guards against a cycle rather than against duplicates: the same walk
 * with the guard removed returns the same six shapes, so nothing is hidden
 * behind it today.
 */
const titledDocumentShapes = (): readonly {
  readonly kind: string;
  readonly path: string;
}[] => {
  const found: { kind: string; path: string }[] = [];
  const seen = new Set<unknown>();
  const walk = (schema: unknown, path: string, kind: string): void => {
    if (schema === null || typeof schema !== "object") return;
    const def = (schema as { _zod?: { def?: Record<string, unknown> } })._zod
      ?.def;
    if (def === undefined || seen.has(schema)) return;
    seen.add(schema);
    if (def["type"] === "object") {
      const shape = def["shape"] as Record<string, unknown>;
      const values = (
        shape["kind"] as { _zod?: { def?: { values?: readonly unknown[] } } }
      )?._zod?.def?.values;
      const literal = values?.[0];
      const here = typeof literal === "string" ? literal : kind;
      if (
        (shape["id"] === DocumentIdSchema ||
          shape["documentId"] === DocumentIdSchema) &&
        Object.hasOwn(shape, "title")
      )
        found.push({ kind: here, path });
      for (const key of Object.keys(shape))
        walk(shape[key], `${path}.${key}`, here);
      return;
    }
    if (Array.isArray(def["options"])) {
      (def["options"] as unknown[]).forEach((option, index) => {
        walk(option, `${path}|${index}`, kind);
      });
      return;
    }
    for (const [key, suffix] of [
      ["element", "[]"],
      ["innerType", ""],
      ["valueType", "{}"],
    ] as const) {
      if (def[key] !== undefined) {
        walk(def[key], `${path}${suffix}`, kind);
        return;
      }
    }
    if (Array.isArray(def["items"]))
      (def["items"] as unknown[]).forEach((item, index) => {
        walk(item, `${path}#${index}`, kind);
      });
  };
  walk(QueryProjectionSchema, "projection", "");
  return found;
};

describe("document.rename", () => {
  it("replaces the title on the record and answers with what it wrote", () => {
    const harness = bootstrapped();
    const { documentId } = createNote(harness, "Kickoff");
    const outcome = rename(harness, documentId, "Kickoff — Falcon", 1);
    assert.equal(outcome.outcome, "success");
    if (outcome.outcome !== "success") return;
    assert.equal(outcome.diagnosticCode, "document.renamed");
    assert.deepEqual(outcome.projection, {
      kind: "document.renamed",
      documentId,
      title: "Kickoff — Falcon",
      version: 2,
    });
  });

  /**
   * The gap this whole lot exists for, stated as an assertion: BEFORE the
   * rename the note answers under its old title everywhere, and after it, it
   * does not answer under that title anywhere. A test that only checked the
   * new title would pass against a projection that carried both.
   */
  it("is the only thing that changes a title, and it changes it everywhere", () => {
    const harness = bootstrapped();
    const { documentId } = createNote(harness, "Kickoff");

    // A Project and an Organization the note points at, so the two overview
    // reads the hand count missed have something to project.
    const projectId = uuid();
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`project-${projectId}`),
          commandName: "project.create",
          payload: { projectId, spaceId: ids.space, title: "Falcon" },
        }),
      ).outcome,
      "success",
    );
    const organizationId = uuid();
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`organization-${organizationId}`),
          commandName: "relationship.organizationCreate",
          payload: {
            organizationId,
            spaceId: ids.space,
            name: "Falcon sp. z o.o.",
            relationshipState: "active",
          },
        }),
      ).outcome,
      "success",
    );
    harness.store.replaceDocumentEntityLinks(documentId as never, [
      {
        workspaceId: ids.workspace as never,
        spaceId: ids.space as never,
        documentId: documentId as never,
        targetKind: "project",
        targetId: projectId,
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
      {
        workspaceId: ids.workspace as never,
        spaceId: ids.space as never,
        documentId: documentId as never,
        targetKind: "organization",
        targetId: organizationId,
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
    ]);

    /** Every title this note is projected under, by the read that carries it. */
    const titles = (): ReadonlyMap<string, readonly string[]> =>
      new Map<string, readonly string[]>([
        [
          "knowledge.list",
          projection(harness, "knowledge.list", { spaceId: ids.space })
            .documents.filter((item) => item.id === documentId)
            .map((item) => item.title),
        ],
        [
          "knowledge.documentContext",
          [
            projection(harness, "knowledge.documentContext", { documentId })
              .document.title,
          ],
        ],
        [
          "document.list",
          projection(harness, "document.list", { spaceId: ids.space })
            .items.filter((item) => item.id === documentId)
            .map((item) => item.title),
        ],
        [
          "document.backlinks",
          projection(harness, "document.backlinks", {
            targetKind: "project",
            targetId: projectId,
          })
            .items.filter((item) => item.documentId === documentId)
            .map((item) => item.title),
        ],
        [
          "project.operationalOverview",
          projection(harness, "project.operationalOverview", { projectId })
            .relatedDocuments.filter((item) => item.id === documentId)
            .map((item) => item.title),
        ],
        [
          "organization.operationalOverview",
          projection(harness, "organization.operationalOverview", {
            organizationId,
            spaceId: ids.space,
          })
            .documents.filter((item) => item.id === documentId)
            .map((item) => item.title),
        ],
      ]);

    // THE COVERAGE IS BOUND TO THE SCHEMA, not to this list. A seventh
    // projection carrying a note's title reddens here, naming itself, instead
    // of quietly not being read.
    const derived = [...new Set(titledDocumentShapes().map((s) => s.kind))];
    assert.ok(
      derived.length >= 6,
      `the walk found ${derived.length} projections carrying a note title, which is too few to be all of them`,
    );
    assert.deepEqual(
      [...derived].sort(),
      [...titles().keys()].sort(),
      "a projection carries a note's title and this test does not read it",
    );

    const before = titles();
    for (const [name, values] of before)
      assert.deepEqual(
        values,
        ["Kickoff"],
        `${name} did not project the note before the rename`,
      );

    assert.equal(
      rename(harness, documentId, "Kickoff — Falcon", 1).outcome,
      "success",
    );

    for (const [name, values] of titles()) {
      assert.deepEqual(
        values,
        ["Kickoff — Falcon"],
        `${name} still answers under the title the rename replaced`,
      );
    }
  });

  /**
   * A NEW EVENT TYPE IS ONLY REAL IF SOMEBODY CAN SEE IT.
   *
   * `activity.changeFeed` passes `event.type` through as an opaque string, so
   * `document.renamed` reaches a subscriber without a site to edit — which is
   * exactly why it is asserted rather than assumed: "no vocabulary to update"
   * and "it arrives" are two different claims, and only the second is the one
   * an agent watching the feed depends on.
   *
   * `activity.meaningful` beside it is the other half of the answer and is
   * deliberately NOT asserted: its curated map carries no document event at
   * all — not `document.created`, not `document.folder_changed` — so a rename
   * is absent there on exactly the terms every other note event already is.
   * Putting one note event into that feed and not the other two would be worse
   * than none, and it is a product decision rather than this lot's.
   */
  it("reaches an agent watching the change feed", () => {
    const harness = bootstrapped();
    const { documentId } = createNote(harness, "Kickoff");
    assert.equal(rename(harness, documentId, "Falcon", 1).outcome, "success");
    // Sorted by the note's own version rather than asserted in feed order:
    // what this test claims is that the rename ARRIVES, carrying the version
    // it produced. The feed's ordering is ADR-051's claim and belongs to
    // whatever asserts the cursor, not here.
    assert.deepEqual(
      projection(harness, "activity.changeFeed", { spaceId: ids.space })
        .events.filter((event) => event.recordId === documentId)
        .map((event) => [event.type, event.recordVersion] as const)
        .sort((left, right) => left[1] - right[1]),
      [
        ["document.created", 1],
        ["document.renamed", 2],
      ],
    );
  });

  it("expects the note's own version and nothing else", () => {
    const harness = bootstrapped();
    const { documentId } = createNote(harness, "Kickoff");
    const stale = rename(harness, documentId, "Later", 7);
    assert.equal(stale.outcome, "conflict");
    if (
      stale.outcome !== "conflict" ||
      stale.diagnosticCode !== "record.version_conflict"
    )
      assert.fail("Expected a version conflict naming the note's version.");
    assert.deepEqual(stale.currentVersions, { [documentId]: 1 });
    // A refusal does not bump a version, so the caller's read still stands.
    assert.equal(rename(harness, documentId, "Later", 1).outcome, "success");
  });

  it("refuses a note that was removed, and one that never existed", () => {
    const harness = bootstrapped();
    const { documentId } = createNote(harness, "Kickoff");
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`remove-${documentId}`),
          commandName: "document.remove",
          expectedVersions: { [documentId]: 1 },
          payload: { documentId },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      rename(harness, documentId, "Back again", 2).outcome,
      "rejected",
    );
    assert.equal(rename(harness, uuid(), "Nowhere", 1).outcome, "rejected");
  });

  /**
   * Accepted, not refused — the one place this command deliberately differs
   * from `document.setFolder` beside it, which refuses a move to the folder a
   * note already occupies. A destination is a place; a title is a value the
   * caller supplies, and refusing "the string it already has" would fail a
   * retry against a workspace that had already applied the first attempt.
   */
  it("accepts the title the note already carries rather than refusing a retry", () => {
    const harness = bootstrapped();
    const { documentId } = createNote(harness, "Kickoff");
    assert.equal(rename(harness, documentId, "Kickoff", 1).outcome, "success");
    assert.equal(
      projection(harness, "knowledge.documentContext", { documentId }).document
        .version,
      2,
    );
  });

  it("trims the title it is given, on the bound document.create already uses", () => {
    const harness = bootstrapped();
    const { documentId } = createNote(harness, "Kickoff");
    assert.equal(
      rename(harness, documentId, "   Kickoff — Falcon   ", 1).outcome,
      "success",
    );
    assert.equal(
      projection(harness, "knowledge.documentContext", { documentId }).document
        .title,
      "Kickoff — Falcon",
    );
    // Refused at the BOUNDARY, before the kernel sees it — a whitespace-only
    // title and one over the bound are not commands this contract can express,
    // and the reply says so rather than reporting a precondition the kernel
    // evaluated. Asserting `rejected` here would have passed against a
    // kernel-side check that does not exist.
    assert.equal(
      renameResponse(harness, documentId, "   ", 2).kind,
      "contract_rejected",
    );
    assert.equal(
      renameResponse(harness, documentId, "x".repeat(501), 2).kind,
      "contract_rejected",
    );
  });

  /**
   * A rename can be taken back, and the compensation carries the title it
   * replaced. `revertability.ts` says why it must: nothing in this app searches
   * by a title that no longer exists, so a title replaced by mistake takes the
   * note out of reach of everyone who knew it by name.
   */
  it("puts the old title back through the checkpoint that recorded it", () => {
    const harness = bootstrapped();
    const { documentId } = createNote(harness, "Kickoff");
    const renamed = rename(harness, documentId, "Kickoff — Falcon", 1);
    assert.equal(renamed.outcome, "success");
    if (renamed.outcome !== "success") return;

    const preview = unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`preview-${uuid()}`),
        commandName: "command.previewUndo",
        payload: { targetCommandId: renamed.commandId },
      }),
    );
    if (preview.outcome !== "preview") assert.fail("Expected a preview.");
    assert.equal(preview.projection.available, true);
    assert.equal(preview.projection.compensationKind, "document.restore_title");
    assert.deepEqual(preview.projection.affectedRecordIds, [documentId]);

    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`undo-${uuid()}`),
          commandName: "command.undo",
          expectedVersions: { [documentId]: 2 },
          payload: { targetCommandId: renamed.commandId },
        }),
      ).outcome,
      "success",
    );
    assert.equal(
      projection(harness, "knowledge.documentContext", { documentId }).document
        .title,
      "Kickoff",
    );
  });
});
