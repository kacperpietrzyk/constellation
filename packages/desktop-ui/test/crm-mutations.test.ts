/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  PrincipalIdSchema,
  StrategicRecordIdSchema,
  TaskIdSchema,
  type CommandEnvelope,
  type PipelineStage,
} from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  DEFAULT_RENEWAL_LEAD_TIME_DAYS,
  createOffer,
  createOpportunity,
  createOrganization,
  createPerson,
  createRenewal,
  resolveRenewal,
  setWorkspaceCommercialDefaults,
  updateOffer,
  updateOpportunity,
  updateOrganization,
  updatePerson,
  updateRenewalTerm,
  type DesktopSnapshot,
} from "../src/client/workflow.js";
import {
  offerDeliverableDocumentId,
  offerRecordId,
  opportunityRecordId,
  personRecordId,
  populatedBootstrap,
  populatedRelationshipWorkspace,
  populatedTaskList,
  referencedOrganizationId,
  renewalRecordId,
  waitingTaskId,
  workspaceId,
} from "./shell-fixture.js";

/**
 * The renderer builds these envelopes itself, so a defect here is invisible to
 * the kernel conformance tests that prove the commands work — it would show up
 * only as a refused command in a person's hands. Two rules decide almost every
 * assertion in this file:
 *
 *  1. `expectedVersions` is an EXACT key-set match (`wave2.ts`'s
 *     `exactExpected`). One record id too many, or one missing, is a version
 *     conflict — not a partial success. So every envelope is asserted by its
 *     whole sorted key set, never by "the id I care about is in there": a
 *     presence check is what stayed green over `resolveRenewal`'s missing task
 *     version for as long as that wrapper has existed.
 *  2. An optional key is SPREAD-IN-OR-OMITTED, never present holding
 *     `undefined`. `assert.equal(payload.title, undefined)` cannot tell those
 *     two apart and neither can Zod — `.strict()` refuses UNKNOWN keys, not a
 *     known optional key carrying `undefined`. So payload shape is asserted by
 *     key set or by `in`, never by comparing a value to `undefined`.
 */

const principalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a1",
);
const contactPersonId = personRecordId;
const attachedTaskId = TaskIdSchema.parse(
  "00000000-0000-4000-8000-0000000000a2",
);
const startedRenewal = populatedRelationshipWorkspace.records.find(
  (record) => record.kind === "renewal",
);
const fixtureOffer = populatedRelationshipWorkspace.records.find(
  (record) => record.kind === "offer",
);
if (startedRenewal?.kind !== "renewal" || fixtureOffer?.kind !== "offer")
  throw new Error(
    "The shell fixture no longer carries a renewal and an offer.",
  );
const followUpTask = populatedTaskList.items.find(
  (task) => task.id === startedRenewal.followUpTaskId,
);
if (followUpTask === undefined)
  throw new Error("The fixture renewal's follow-up task is not in task.list.");

const unavailable = {
  kind: "unavailable" as const,
  message: "These wrappers do not read this slice.",
};

const snapshotOf = (
  overrides: Partial<DesktopSnapshot> = {},
): DesktopSnapshot => ({
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
  tasks: populatedTaskList.items,
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
  relationships: { kind: "ready", data: populatedRelationshipWorkspace },
  radar: unavailable,
  ...overrides,
});

const projectionFor = (command: CommandEnvelope) =>
  command.commandName === "workspace.setCommercialDefaults"
    ? {
        kind: "workspace.commercial_defaults_changed",
        workspaceId,
        commercialDefaults: populatedBootstrap.workspace.commercialDefaults,
        version: populatedBootstrap.workspace.version + 1,
      }
    : {
        kind: "strategic.record_changed",
        recordId: "",
        recordType: "",
        version: 2,
      };

/**
 * `execute` runs `CommandEnvelopeSchema.parse` before this is ever called, so an
 * envelope reaching here has satisfied the real contract — a payload key the
 * schema does not allow, or a missing required one, means the recorder stays
 * empty and the wrapper returns `kind: "error"` instead. Every "sends …" test
 * below therefore asserts a success AND the recorded envelope.
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
          kernelTime: "2026-07-31T12:00:00.000Z",
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

// ── opportunity.update ──────────────────────────────────────────────────────

test("moving a deal to another stage sends that stage, that deal's version, and nothing else", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateOpportunity(
    recordingClient(sent),
    snapshotOf(),
    { id: opportunityRecordId, version: 4 },
    { stage: "negotiation" },
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "opportunity.update");
  assert.deepEqual(payloadKeys(envelope), ["opportunityId", "stage"]);
  // The exact key set, not "the deal is in there": one extra id is a conflict.
  assert.deepEqual(versionKeys(envelope), [opportunityRecordId]);
  assert.deepEqual(envelope.expectedVersions, { [opportunityRecordId]: 4 });
});

test("clearing a deal's owner sends an explicit null rather than dropping the key", async () => {
  const sent: CommandEnvelope[] = [];
  await updateOpportunity(
    recordingClient(sent),
    snapshotOf(),
    { id: opportunityRecordId, version: 4 },
    { ownerPersonId: null },
  );
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal("ownerPersonId" in payload, true);
  assert.equal(payload["ownerPersonId"], null);
});

test("an estimate rides the deal update as one amount-and-currency object", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateOpportunity(
    recordingClient(sent),
    snapshotOf(),
    { id: opportunityRecordId, version: 4 },
    { estimate: { amountMinor: 4_500_000, currency: "PLN" } },
  );
  assert.equal(result.kind, "success");
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.deepEqual(payload["estimate"], {
    amountMinor: 4_500_000,
    currency: "PLN",
  });
});

test("a deal update with nothing in it never reaches the desktop, and says so in a sentence", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateOpportunity(
    recordingClient(sent),
    snapshotOf(),
    { id: opportunityRecordId, version: 4 },
    {},
  );
  assert.equal(sent.length, 0);
  assert.equal(result.kind, "error");
  // Named in full: the alternative is Zod's JSON blob in front of a person.
  assert.equal(
    result.kind === "error" ? result.message : undefined,
    "Nothing changed, so nothing was saved.",
  );
});

// ── opportunity.offerUpdate ─────────────────────────────────────────────────

test("un-confirming a price sends the derived arm instead of dropping the key", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateOffer(
    recordingClient(sent),
    snapshotOf(),
    { id: offerRecordId, version: 3 },
    { price: { basis: "derived" } },
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "opportunity.offerUpdate");
  // Absent leaves the stored price alone; `{basis:"derived"}` un-confirms. If
  // this key were dropped as "no amount to send", the confirmed price would
  // stay on the record behind a card that reads as derived.
  assert.deepEqual(payloadKeys(envelope), ["offerId", "price"]);
  assert.deepEqual((envelope.payload as Record<string, unknown>)["price"], {
    basis: "derived",
  });
});

test("an offer update that does not mention the price carries no price key at all", async () => {
  const sent: CommandEnvelope[] = [];
  await updateOffer(
    recordingClient(sent),
    snapshotOf(),
    { id: offerRecordId, version: 3 },
    { state: "draft" },
  );
  const envelope = onlyEnvelope(sent);
  assert.deepEqual(payloadKeys(envelope), ["offerId", "state"]);
  assert.deepEqual(versionKeys(envelope), [offerRecordId]);
});

test("confirming a price carries the amount, the cost and the rate it was quoted at", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateOffer(
    recordingClient(sent),
    snapshotOf(),
    { id: offerRecordId, version: 3 },
    {
      cost: { amountMinor: 2_840_000, currency: "EUR" },
      rate: { from: "EUR", to: "PLN", rateMicros: 4_310_000, at: "2026-07-30" },
      price: {
        basis: "confirmed",
        price: { amountMinor: 16_000_000, currency: "PLN" },
      },
    },
  );
  assert.equal(result.kind, "success");
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.deepEqual(Object.keys(payload).sort(), [
    "cost",
    "offerId",
    "price",
    "rate",
  ]);
  assert.deepEqual(payload["price"], {
    basis: "confirmed",
    price: { amountMinor: 16_000_000, currency: "PLN" },
  });
});

// ── workspace.setCommercialDefaults ─────────────────────────────────────────

test("changing the markup does not restate the funnel", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await setWorkspaceCommercialDefaults(
    recordingClient(sent),
    snapshotOf(),
    { markupPct: 30 },
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "workspace.setCommercialDefaults");
  // Restating a list nobody meant to touch is how a stage goes missing.
  assert.deepEqual(payloadKeys(envelope), ["markupPct"]);
  assert.deepEqual(envelope.expectedVersions, {
    [workspaceId]: populatedBootstrap.workspace.version,
  });
});

test("replacing the funnel sends the whole list and neither percentage", async () => {
  const sent: CommandEnvelope[] = [];
  const stages: readonly PipelineStage[] = [
    { id: "triage", label: "Triage", order: 0 },
    { id: "scoping", label: "Scoping", order: 10 },
  ];
  const result = await setWorkspaceCommercialDefaults(
    recordingClient(sent),
    snapshotOf(),
    { stages },
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.deepEqual(payloadKeys(envelope), ["stages"]);
  assert.deepEqual(
    (envelope.payload as Record<string, unknown>)["stages"],
    stages,
  );
});

// ── relationship.renewalUpdate ──────────────────────────────────────────────

test("the contract clock is set on a renewal that already exists", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateRenewalTerm(
    recordingClient(sent),
    snapshotOf(),
    { id: renewalRecordId, version: 6 },
    {
      termStartsAt: "2024-10-01T00:00:00.000Z",
      termMonths: 24,
      cycleOrdinal: 3,
    },
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "relationship.renewalUpdate");
  assert.deepEqual(payloadKeys(envelope), [
    "cycleOrdinal",
    "renewalId",
    "termMonths",
    "termStartsAt",
  ]);
  // `cycleOrdinal` is the printed "term 3". `cycleKey` is the uniqueness key and
  // is not writable here — sending it would be a rejected envelope, not a rename.
  assert.equal(
    "cycleKey" in (envelope.payload as Record<string, unknown>),
    false,
  );
});

test("attaching a follow-up to a renewal expects the renewal's version ONLY", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateRenewalTerm(
    recordingClient(sent),
    snapshotOf(),
    { id: renewalRecordId, version: 6 },
    { followUpTaskId: attachedTaskId },
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  // The asymmetry that has to be right in both directions: `renewalUpdate`
  // POINTS at the task, so only the renewal is versioned; `renewalResolve`
  // COMPLETES it, so both are. Same command family, opposite envelopes.
  assert.deepEqual(versionKeys(envelope), [renewalRecordId]);
  assert.deepEqual(envelope.expectedVersions, { [renewalRecordId]: 6 });
});

// ── relationship.renewalResolve ─────────────────────────────────────────────

test("closing a started contract names BOTH the renewal and its follow-up task", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await resolveRenewal(
    recordingClient(sent),
    snapshotOf(),
    startedRenewal,
    "renewed",
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "relationship.renewalResolve");
  // The kernel completes the follow-up in the same transaction, so its version
  // belongs in the envelope. An envelope naming only the renewal is a version
  // conflict, which is what every Close on a started contract used to be.
  assert.deepEqual(
    versionKeys(envelope),
    [renewalRecordId, waitingTaskId].sort(),
  );
  assert.deepEqual(envelope.expectedVersions, {
    [renewalRecordId]: startedRenewal.version,
    [waitingTaskId]: followUpTask.version,
  });
  assert.deepEqual(payloadKeys(envelope), ["renewalId", "state"]);
});

test("closing a contract nobody has started names only the renewal", async () => {
  const sent: CommandEnvelope[] = [];
  // The key is DELETED rather than set to `undefined`: a renewal nobody has
  // started does not carry the field at all, and the two are what this whole
  // file is careful to tell apart.
  const noFollowUp = { ...startedRenewal };
  delete noFollowUp.followUpTaskId;
  const result = await resolveRenewal(
    recordingClient(sent),
    snapshotOf(),
    noFollowUp,
    "not_renewing",
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.deepEqual(versionKeys(envelope), [renewalRecordId]);
});

test("a follow-up outside the loaded task page is refused with a sentence, not with a conflict", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await resolveRenewal(
    recordingClient(sent),
    snapshotOf({ tasks: [] }),
    startedRenewal,
    "renewed",
  );
  assert.equal(sent.length, 0);
  assert.equal(result.kind, "unavailable");
  assert.match(
    result.kind === "unavailable" ? result.message : "",
    /Reload and try again\.$/,
  );
});

// ── relationship.organizationUpdate / personUpdate ──────────────────────────

test("the segment, the since date and the main contact reach relationship.organizationUpdate", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await updateOrganization(
    recordingClient(sent),
    snapshotOf(),
    { id: referencedOrganizationId, version: 5 },
    {
      segment: "Manufacturing",
      since: "2023-04-11",
      mainContactPersonId: contactPersonId,
    },
  );
  assert.equal(result.kind, "success");
  const envelope = onlyEnvelope(sent);
  assert.equal(envelope.commandName, "relationship.organizationUpdate");
  assert.deepEqual(payloadKeys(envelope), [
    "mainContactPersonId",
    "organizationId",
    "segment",
    "since",
  ]);
  // The contact's own version is NOT in here: the handler reads the person to
  // check it exists and writes only the organisation.
  assert.deepEqual(versionKeys(envelope), [referencedOrganizationId]);
});

test("clearing the main contact sends null — the only way to untangle the mutual reference", async () => {
  const sent: CommandEnvelope[] = [];
  await updateOrganization(
    recordingClient(sent),
    snapshotOf(),
    { id: referencedOrganizationId, version: 5 },
    { mainContactPersonId: null, nextAction: null },
  );
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal(payload["mainContactPersonId"], null);
  assert.equal(payload["nextAction"], null);
});

test("a person's phone reaches relationship.personUpdate, and null clears it", async () => {
  const sent: CommandEnvelope[] = [];
  const client = recordingClient(sent);
  const result = await updatePerson(
    client,
    snapshotOf(),
    { id: personRecordId, version: 2 },
    { phone: "+48 22 000 11 22" },
  );
  assert.equal(result.kind, "success");
  assert.deepEqual(payloadKeys(onlyEnvelope(sent)), ["personId", "phone"]);
  const cleared: CommandEnvelope[] = [];
  await updatePerson(
    recordingClient(cleared),
    snapshotOf(),
    { id: personRecordId, version: 2 },
    { phone: null },
  );
  assert.equal(
    (onlyEnvelope(cleared).payload as Record<string, unknown>)["phone"],
    null,
  );
});

// ── the two hardcodes ───────────────────────────────────────────────────────

test("a new deal starts on the funnel's first column, by order and not by array position", async () => {
  const sent: CommandEnvelope[] = [];
  // `order` may have gaps and the array need not be sorted by it, so
  // `stages[0]` is not the leftmost column — and no id here is "discovery",
  // which is what the wrapper used to send whatever the funnel said.
  const stages: PipelineStage[] = [
    { id: "negotiating", label: "Negotiating", order: 30 },
    { id: "first-call", label: "First call", order: 7 },
    { id: "scoping", label: "Scoping", order: 12 },
  ];
  const result = await createOpportunity(
    recordingClient(sent),
    snapshotOf({
      bootstrap: {
        ...populatedBootstrap,
        workspace: {
          ...populatedBootstrap.workspace,
          commercialDefaults: {
            ...populatedBootstrap.workspace.commercialDefaults,
            stages,
          },
        },
      },
    }),
    {
      organizationId: referencedOrganizationId,
      title: "Second platform",
      need: "Two teams, one contract.",
      nextAction: "Book the scoping call.",
    },
  );
  assert.equal(result.kind, "success");
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal(payload["stage"], "first-call");
});

test("a stage the caller names is sent as given", async () => {
  const sent: CommandEnvelope[] = [];
  await createOpportunity(recordingClient(sent), snapshotOf(), {
    organizationId: referencedOrganizationId,
    title: "Third platform",
    need: "One contract, two teams.",
    nextAction: "Book the call.",
    stage: "proposal",
    estimate: { amountMinor: 12_000_000, currency: "PLN" },
    ownerPersonId: personRecordId,
    personIds: [personRecordId],
  });
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal(payload["stage"], "proposal");
  assert.deepEqual(payload["estimate"], {
    amountMinor: 12_000_000,
    currency: "PLN",
  });
  assert.deepEqual(payload["personIds"], [personRecordId]);
});

test("a new renewal takes the caller's lead time, and the named default only when nobody says", async () => {
  const asked: CommandEnvelope[] = [];
  const result = await createRenewal(recordingClient(asked), snapshotOf(), {
    organizationId: referencedOrganizationId,
    title: "Support and maintenance",
    scope: "24/7, two environments",
    expiresAt: "2027-03-31T21:59:59.000Z",
    evidenceSourceIds: [],
    leadTimeDays: 90,
    termStartsAt: "2024-04-01T00:00:00.000Z",
    termMonths: 36,
    cycleOrdinal: 3,
  });
  assert.equal(result.kind, "success");
  const asking = onlyEnvelope(asked).payload as Record<string, unknown>;
  assert.equal(asking["leadTimeDays"], 90);
  assert.equal(asking["termMonths"], 36);
  assert.equal(asking["cycleOrdinal"], 3);

  const silent: CommandEnvelope[] = [];
  await createRenewal(recordingClient(silent), snapshotOf(), {
    organizationId: referencedOrganizationId,
    title: "Support and maintenance",
    scope: "24/7, two environments",
    expiresAt: "2027-03-31T21:59:59.000Z",
    evidenceSourceIds: [],
  });
  const quiet = onlyEnvelope(silent).payload as Record<string, unknown>;
  assert.equal(quiet["leadTimeDays"], DEFAULT_RENEWAL_LEAD_TIME_DAYS);
  // The clock keys are absent, not `undefined`: a renewal without a recorded
  // term has no term, and an explicit undefined would be a rejected envelope.
  assert.equal("termMonths" in quiet, false);
  assert.equal("termStartsAt" in quiet, false);
});

test("a renewal nobody has started carries no follow-up key and returns no task id", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await createRenewal(recordingClient(sent), snapshotOf(), {
    organizationId: referencedOrganizationId,
    title: "Support, not started",
    scope: "24/7, two environments",
    expiresAt: "2027-03-31T21:59:59.000Z",
    evidenceSourceIds: [],
    startFollowUp: false,
  });
  assert.equal(result.kind, "success");
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal("followUpTaskId" in payload, false);
  assert.equal(
    result.kind === "success" && "followUpTaskId" in result.data,
    false,
  );
});

test("a renewal nobody opted out of still creates its follow-up", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await createRenewal(recordingClient(sent), snapshotOf(), {
    organizationId: referencedOrganizationId,
    title: "Support, started",
    scope: "24/7, two environments",
    expiresAt: "2027-03-31T21:59:59.000Z",
    evidenceSourceIds: [],
  });
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal("followUpTaskId" in payload, true);
  assert.equal(
    result.kind === "success" && "followUpTaskId" in result.data,
    true,
  );
});

// ── money and the four fields on the create paths ───────────────────────────

test("a cost, its rate and a confirmed price reach opportunity.offerCreate", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await createOffer(recordingClient(sent), snapshotOf(), {
    opportunityId: opportunityRecordId,
    deliverableDocumentId: offerDeliverableDocumentId,
    title: "Variant with a night shift",
    nextAction: "Confirm the quote's expiry.",
    cost: { amountMinor: 2_840_000, currency: "EUR" },
    rate: { from: "EUR", to: "PLN", rateMicros: 4_310_000, at: "2026-07-30" },
    price: {
      basis: "confirmed",
      price: { amountMinor: 16_000_000, currency: "PLN" },
    },
    state: "ready",
  });
  assert.equal(result.kind, "success");
  // Two commands: the create, then `linkOutcomes` attaching it to the deal.
  assert.equal(sent.length, 2);
  const created = sent[0];
  if (created === undefined) throw new Error("no create was recorded");
  const payload = created.payload as Record<string, unknown>;
  assert.equal(created.commandName, "opportunity.offerCreate");
  assert.equal(payload["state"], "ready");
  assert.deepEqual(payload["cost"], {
    amountMinor: 2_840_000,
    currency: "EUR",
  });
  assert.deepEqual(payload["rate"], {
    from: "EUR",
    to: "PLN",
    rateMicros: 4_310_000,
    at: "2026-07-30",
  });
});

test("an offer created without money carries none of the three keys", async () => {
  const sent: CommandEnvelope[] = [];
  await createOffer(recordingClient(sent), snapshotOf(), {
    opportunityId: opportunityRecordId,
    deliverableDocumentId: offerDeliverableDocumentId,
    title: "Variant without a quote",
    nextAction: "Chase the distributor.",
  });
  const created = sent[0];
  if (created === undefined) throw new Error("no create was recorded");
  const payload = created.payload as Record<string, unknown>;
  assert.equal("cost" in payload, false);
  assert.equal("rate" in payload, false);
  assert.equal("price" in payload, false);
  assert.equal(payload["state"], "draft");
});

test("segment, since and the main contact reach relationship.organizationCreate", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await createOrganization(recordingClient(sent), snapshotOf(), {
    name: "Meridian Rail",
    segment: "Transport",
    since: "2021-09-01",
    mainContactPersonId: contactPersonId,
    relationshipState: "active",
  });
  assert.equal(result.kind, "success");
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal(payload["segment"], "Transport");
  assert.equal(payload["since"], "2021-09-01");
  assert.equal(payload["mainContactPersonId"], contactPersonId);
  assert.equal(payload["relationshipState"], "active");
});

test("an organisation created with none of the four fields carries none of their keys", async () => {
  const sent: CommandEnvelope[] = [];
  await createOrganization(recordingClient(sent), snapshotOf(), {
    name: "Wiatrak Logistyka",
  });
  const payload = onlyEnvelope(sent).payload as Record<string, unknown>;
  assert.equal("segment" in payload, false);
  assert.equal("since" in payload, false);
  assert.equal("mainContactPersonId" in payload, false);
  assert.equal(payload["relationshipState"], "prospect");
});

test("a phone reaches relationship.personCreate, trimmed, and is absent when blank", async () => {
  const sent: CommandEnvelope[] = [];
  const result = await createPerson(recordingClient(sent), snapshotOf(), {
    name: "Marta Nowak",
    organizationId: StrategicRecordIdSchema.parse(referencedOrganizationId),
    phone: "  +48 22 000 11 22  ",
  });
  assert.equal(result.kind, "success");
  assert.equal(
    (onlyEnvelope(sent).payload as Record<string, unknown>)["phone"],
    "+48 22 000 11 22",
  );
  const blank: CommandEnvelope[] = [];
  await createPerson(recordingClient(blank), snapshotOf(), {
    name: "Marta Nowak",
    phone: "   ",
  });
  assert.equal(
    "phone" in (onlyEnvelope(blank).payload as Record<string, unknown>),
    false,
  );
});
