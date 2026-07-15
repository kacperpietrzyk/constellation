import assert from "node:assert/strict";
import { it } from "node:test";

import type { ApplicationCommandResponse } from "@constellation/application";
import {
  ExecutionContextSchema,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "18000000-0000-4000-8000-000000000001",
  space: "18000000-0000-4000-8000-000000000002",
  principal: "18000000-0000-4000-8000-000000000003",
  credential: "18000000-0000-4000-8000-000000000004",
  grant: "18000000-0000-4000-8000-000000000005",
} as const;
let sequence = 100;
const uuid = (): string =>
  `18000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`;
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
      "relationship.organizationCreate",
      "relationship.personCreate",
      "opportunity.create",
      "opportunity.offerCreate",
      "opportunity.linkOutcomes",
      "relationship.workspace",
      "relationship.renewalCreate",
      "relationship.renewalResolve",
      "relationship.factCreate",
      "decision.create",
      "decision.supersede",
      "decision.resolveImpact",
      "area.create",
      "recurrence.create",
      "recurrence.generateOccurrence",
      "project.close",
      "project.reopen",
      "radar.candidateUpsert",
      "radar.resolve",
      "radar.review",
      "meeting.upsertImported",
      "knowledge.sourceCreate",
      "document.create",
      "project.create",
      "search.global",
      "activity.meaningful",
      "workspace.exportScoped",
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

it("deduplicates reviews and preserves recurrence, decision, and Project history", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("depth-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Review loops",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const organizationId = uuid();
  const sourceId = uuid();
  for (const command of [
    {
      ...metadata("depth-org"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId,
        spaceId: ids.space,
        name: "Orbit Systems",
        relationshipState: "active" as const,
      },
    },
    {
      ...metadata("depth-source"),
      commandName: "knowledge.sourceCreate" as const,
      payload: {
        sourceId,
        spaceId: ids.space,
        sourceKind: "excerpt" as const,
        title: "Orbit contract",
        excerpt: "The support contract expires in September.",
        availability: "available" as const,
        observedAt: "2026-07-15T10:00:00.000Z",
      },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }

  const renewalId = uuid();
  const followUpTaskId = uuid();
  const renewalPayload = {
    renewalId,
    followUpTaskId,
    spaceId: ids.space,
    organizationId,
    title: "Orbit support contract",
    scope: "Managed support entitlement",
    expiresAt: "2026-09-30T12:00:00.000Z",
    leadTimeDays: 60,
    ownerPrincipalId: ids.principal,
    evidenceSourceIds: [sourceId],
    cycleKey: "orbit-support:2026-09",
  };
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-create"),
        commandName: "relationship.renewalCreate",
        payload: renewalPayload,
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-duplicate"),
        commandName: "relationship.renewalCreate",
        payload: {
          ...renewalPayload,
          renewalId: uuid(),
          followUpTaskId: uuid(),
        },
      }),
    ).outcome,
    "rejected",
  );
  assert.equal(harness.store.snapshot().attentionSignals?.length, 1);
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-resolve", {
          [renewalId]: 1,
          [followUpTaskId]: 1,
        }),
        commandName: "relationship.renewalResolve",
        payload: { renewalId, state: "renewed" },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    harness.store.snapshot().tasks.find((task) => task.id === followUpTaskId)
      ?.completionState,
    "completed",
  );

  const factId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("stale-fact"),
        commandName: "relationship.factCreate",
        payload: {
          factId,
          spaceId: ids.space,
          organizationId,
          factType: "security_stack",
          value: "Legacy gateway",
          evidenceSourceIds: [sourceId],
          verifiedAt: "2025-01-01T12:00:00.000Z",
          staleAfter: "2025-07-01T12:00:00.000Z",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    harness.store
      .snapshot()
      .strategicRecords?.find((record) => record.id === factId)?.kind,
    "relationship_fact",
  );

  const decisionId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-create"),
        commandName: "decision.create",
        payload: {
          decisionId,
          spaceId: ids.space,
          title: "Use the managed support route",
          rationale: "The contract evidence supports the managed route.",
          evidenceSourceIds: [sourceId],
          linkedRecordIds: [followUpTaskId],
        },
      }),
    ).outcome,
    "success",
  );
  const replacementDecisionId = uuid();
  const impactReviewId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-replace", { [decisionId]: 1 }),
        commandName: "decision.supersede",
        payload: {
          priorDecisionId: decisionId,
          replacementDecisionId,
          impactReviewId,
          title: "Use the self-service route",
          rationale: "The renewed terms changed the preferred delivery model.",
          reason: "Commercial terms changed.",
          evidenceSourceIds: [sourceId],
          consequences: [{ recordId: followUpTaskId, recordKind: "task" }],
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("impact-resolve", { [impactReviewId]: 1 }),
        commandName: "decision.resolveImpact",
        payload: {
          impactReviewId,
          recordId: followUpTaskId,
          resolution: "Historical renewal follow-up remains completed.",
        },
      }),
    ).outcome,
    "success",
  );

  const areaId = uuid();
  const recurrenceId = uuid();
  const occurrenceTaskId = uuid();
  for (const command of [
    {
      ...metadata("area-create"),
      commandName: "area.create" as const,
      payload: {
        areaId,
        spaceId: ids.space,
        title: "Client continuity",
        responsibility: "Keep active client commitments healthy.",
      },
    },
    {
      ...metadata("recurrence-create"),
      commandName: "recurrence.create" as const,
      payload: {
        recurrenceId,
        spaceId: ids.space,
        title: "Monthly client review",
        taskTitle: "Review Orbit relationship",
        contextRecordId: areaId,
        cadence: "monthly" as const,
        nextDueAt: "2026-08-01T09:00:00.000Z",
      },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("recurrence-occurrence", { [recurrenceId]: 1 }),
        commandName: "recurrence.generateOccurrence",
        payload: {
          recurrenceId,
          occurrenceTaskId,
          nextDueAt: "2026-09-01T09:00:00.000Z",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    harness.store.snapshot().tasks.find((task) => task.id === occurrenceTaskId)
      ?.completionState,
    "open",
  );

  const candidateId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("radar-candidate"),
        commandName: "radar.candidateUpsert",
        payload: {
          candidateId,
          spaceId: ids.space,
          sourceId,
          materialKey: "orbit-contract:revision-1",
          title: "Orbit contract terms changed",
          relevance: "May affect an active relationship decision.",
        },
      }),
    ).outcome,
    "success",
  );
  const radar = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "radar.review",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, limit: 12 },
  });
  assert.equal(radar.kind, "query_result");
  if (
    radar.kind !== "query_result" ||
    radar.result.outcome !== "success" ||
    radar.result.projection.kind !== "radar.review"
  )
    assert.fail("Expected finite radar review");
  assert.equal(radar.result.projection.finite, true);
  assert.equal(radar.result.projection.pendingCount, 1);
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("radar-dismiss", { [candidateId]: 1 }),
        commandName: "radar.resolve",
        payload: { candidateId, state: "dismissed" },
      }),
    ).outcome,
    "success",
  );
  const after = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "radar.review",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, limit: 12 },
  });
  if (
    after.kind !== "query_result" ||
    after.result.outcome !== "success" ||
    after.result.projection.kind !== "radar.review"
  )
    assert.fail("Expected empty radar review");
  assert.equal(after.result.projection.pendingCount, 0);
});
const unwrap = (value: ApplicationCommandResponse): CommandOutcome => {
  assert.equal(value.kind, "command_outcome");
  if (value.kind !== "command_outcome") throw new Error("Expected outcome");
  return value.outcome;
};

it("keeps opportunity history while linking an evidence-backed offer and Project", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Strategic depth",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const organizationId = uuid();
  const personId = uuid();
  const sourceId = uuid();
  const opportunityId = uuid();
  const deliverableDocumentId = uuid();
  const offerId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("organization"),
        commandName: "relationship.organizationCreate",
        payload: {
          organizationId,
          spaceId: ids.space,
          name: "Northstar Industries",
          relationshipState: "prospect",
          nextAction: "Confirm the workshop sponsor.",
        },
      }),
    ).diagnosticCode,
    "strategic.record_changed",
  );
  for (const command of [
    {
      ...metadata("person"),
      commandName: "relationship.personCreate" as const,
      payload: {
        personId,
        spaceId: ids.space,
        name: "Marta Nowak",
        organizationId,
        role: "Security lead",
        email: "marta@example.test",
      },
    },
    {
      ...metadata("source"),
      commandName: "knowledge.sourceCreate" as const,
      payload: {
        sourceId,
        spaceId: ids.space,
        sourceKind: "excerpt" as const,
        title: "Qualification note",
        excerpt: "Northstar needs an evidence-backed workshop.",
        availability: "available" as const,
        observedAt: "2026-07-15T10:00:00.000Z",
      },
    },
    {
      ...metadata("opportunity"),
      commandName: "opportunity.create" as const,
      payload: {
        opportunityId,
        spaceId: ids.space,
        title: "Northstar security workshop",
        organizationId,
        personIds: [personId],
        need: "Choose the first remediation programme.",
        qualification: "Sponsor and evidence confirmed.",
        stage: "qualified",
        nextAction: "Prepare a scoped offer.",
        evidenceSourceIds: [sourceId],
      },
    },
    {
      ...metadata("deliverable"),
      commandName: "document.create" as const,
      payload: {
        documentId: deliverableDocumentId,
        spaceId: ids.space,
        title: "Northstar workshop offer",
        role: "deliverable" as const,
      },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("offer"),
        commandName: "opportunity.offerCreate",
        payload: {
          offerId,
          opportunityId,
          deliverableDocumentId,
          title: "Security workshop offer",
          ownerPrincipalId: ids.principal,
          state: "ready",
          nextAction: "Send after sponsor confirmation.",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("project"),
        commandName: "project.create",
        payload: {
          spaceId: ids.space,
          title: "Deliver Northstar workshop",
          intendedOutcome: "Northstar accepts a remediation plan.",
        },
      }),
    ).outcome,
    "success",
  );
  const project = harness.store.snapshot().projects[0];
  assert.ok(project);
  const expected = {
    [opportunityId]: 1,
    [offerId]: 1,
    [project.id]: 1,
  };
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("link", expected),
        commandName: "opportunity.linkOutcomes",
        payload: {
          opportunityId,
          offerIds: [offerId],
          projectIds: [project.id],
          state: "pursued",
          nextAction: "Run the accepted workshop.",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("stale-link", expected),
        commandName: "opportunity.linkOutcomes",
        payload: {
          opportunityId,
          offerIds: [offerId],
          projectIds: [project.id],
          state: "pursued",
          nextAction: "A stale write must not win.",
        },
      }),
    ).outcome,
    "conflict",
  );
  const result = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "relationship.workspace",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  assert.equal(result.kind, "query_result");
  if (
    result.kind !== "query_result" ||
    result.result.outcome !== "success" ||
    result.result.projection.kind !== "relationship.workspace"
  )
    assert.fail("Expected relationship workspace");
  const opportunity = result.result.projection.records.find(
    (record) => record.kind === "opportunity",
  );
  assert.equal(opportunity?.kind, "opportunity");
  if (opportunity?.kind === "opportunity") {
    assert.deepEqual(opportunity.offerIds, [offerId]);
    assert.deepEqual(opportunity.projectIds, [project.id]);
    assert.equal(opportunity.version, 2);
  }
  const search = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "search.global",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceIds: [ids.space], text: "Northstar security" },
  });
  if (
    search.kind !== "query_result" ||
    search.result.outcome !== "success" ||
    search.result.projection.kind !== "search.global"
  )
    assert.fail("Expected strategic records in deterministic search");
  assert.ok(
    search.result.projection.items.some(
      (item) =>
        item.recordKind === "opportunity" && item.recordId === opportunityId,
    ),
  );

  const activity = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "activity.meaningful",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    activity.kind !== "query_result" ||
    activity.result.outcome !== "success" ||
    activity.result.projection.kind !== "activity.meaningful"
  )
    assert.fail("Expected strategic activity");
  assert.ok(
    activity.result.projection.items.some(
      (item) => item.activityType === "strategic_record_changed",
    ),
  );

  const exported = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "workspace.exportScoped",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: {},
  });
  if (
    exported.kind !== "query_result" ||
    exported.result.outcome !== "success" ||
    exported.result.projection.kind !== "workspace.exportScoped"
  )
    assert.fail("Expected scoped export");
  assert.equal(exported.result.projection.counts.strategicRecords, 4);
});
