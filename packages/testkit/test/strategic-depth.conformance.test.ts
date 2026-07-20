import assert from "node:assert/strict";
import { it } from "node:test";

import {
  isApplicationWave2Transaction,
  type ApplicationCommandResponse,
} from "@constellation/application";
import {
  ExecutionContextSchema,
  ProjectIdSchema,
  SpaceGrantIdSchema,
  SpaceIdSchema,
  StrategicRecordIdSchema,
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
      "fieldDef.create",
      "decision.supersede",
      "decision.resolveImpact",
      "area.create",
      "initiative.create",
      "work.linkCreate",
      "work.linkRemove",
      "savedView.create",
      "savedView.rename",
      "savedView.update",
      "savedView.delete",
      "task.setOperationalState",
      "work.overview",
      "command.previewUndo",
      "command.undo",
      "capture.submitText",
      "capture.routeAsTask",
      "recurrence.create",
      "recurrence.generateOccurrence",
      "recurrence.sweep",
      "project.close",
      "project.reopen",
      "radar.candidateUpsert",
      "radar.resolve",
      "radar.review",
      "meeting.upsertImported",
      "meeting.route",
      "meeting.promoteWorkItem",
      "meeting.linkParticipants",
      "task.create",
      "relationship.personCreate",
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

it("composes Areas, Initiatives, dependencies, waiting, and saved views", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("work-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Work graph",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );

  const areaId = uuid();
  const initiativeId = uuid();
  const savedViewId = uuid();
  const projectInitiativeLinkId = uuid();
  const projectAreaLinkId = uuid();
  for (const command of [
    {
      ...metadata("work-area"),
      commandName: "area.create" as const,
      payload: {
        areaId,
        spaceId: ids.space,
        title: "Product",
        responsibility: "Keep Constellation useful and maintainable",
      },
    },
    {
      ...metadata("work-initiative"),
      commandName: "initiative.create" as const,
      payload: {
        initiativeId,
        spaceId: ids.space,
        title: "Interactive alpha",
        intendedOutcome: "Use Constellation for a real working week",
      },
    },
    {
      ...metadata("work-project"),
      commandName: "project.create" as const,
      payload: {
        spaceId: ids.space,
        title: "Application completion",
        intendedOutcome: "All primary product surfaces are operable",
      },
    },
  ]) {
    const outcome = unwrap(harness.kernel.execute(context(), command));
    assert.equal(outcome.outcome, "success");
    if (
      command.commandName === "project.create" &&
      outcome.outcome === "success" &&
      outcome.projection.kind === "project.created"
    ) {
      assert.equal(outcome.projection.projectId.length > 0, true);
    }
  }
  const project = harness.store.snapshot().projects[0];
  assert.ok(project);

  const taskIds: string[] = [];
  for (const [index, title] of [
    "Prepare the Work surface",
    "Approve the content model",
  ].entries()) {
    const submitted = unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`work-capture-${index}`),
        commandName: "capture.submitText",
        payload: {
          spaceId: ids.space,
          originalText: title,
          deviceId: "work-test-device",
          source: "in_app_quick_capture",
        },
      }),
    );
    if (
      submitted.outcome !== "success" ||
      submitted.projection.kind !== "capture.stored"
    )
      assert.fail("Expected stored capture");
    const routed = unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`work-route-${index}`, {
          [submitted.projection.captureId]: submitted.projection.version,
        }),
        commandName: "capture.routeAsTask",
        payload: { captureId: submitted.projection.captureId, title },
      }),
    );
    if (
      routed.outcome !== "success" ||
      routed.projection.kind !== "capture.routed_as_task"
    )
      assert.fail("Expected routed task");
    taskIds.push(routed.projection.taskId);
  }

  const commands = [
    {
      ...metadata("work-project-initiative"),
      commandName: "work.linkCreate" as const,
      payload: {
        linkId: projectInitiativeLinkId,
        spaceId: ids.space,
        linkType: "project_advances_initiative" as const,
        sourceRecordId: project.id,
        targetRecordId: initiativeId,
      },
    },
    {
      ...metadata("work-project-area"),
      commandName: "work.linkCreate" as const,
      payload: {
        linkId: projectAreaLinkId,
        spaceId: ids.space,
        linkType: "project_serves_area" as const,
        sourceRecordId: project.id,
        targetRecordId: areaId,
      },
    },
    {
      ...metadata("work-task-dependency"),
      commandName: "work.linkCreate" as const,
      payload: {
        linkId: uuid(),
        spaceId: ids.space,
        linkType: "task_depends_on_task" as const,
        sourceRecordId: taskIds[0]!,
        targetRecordId: taskIds[1]!,
      },
    },
    {
      ...metadata("work-waiting", { [taskIds[0]!]: 1 }),
      commandName: "task.setOperationalState" as const,
      payload: {
        taskId: taskIds[0]!,
        operationalState: "waiting" as const,
        waitingOn: { kind: "external" as const, label: "Product review" },
      },
    },
    {
      ...metadata("work-saved-view"),
      commandName: "savedView.create" as const,
      payload: {
        savedViewId,
        spaceId: ids.space,
        name: "Waiting this week",
        filters: { operationalStates: ["waiting" as const] },
        sort: "updated_desc" as const,
      },
    },
  ];
  for (const command of commands) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }

  const result = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "work.overview",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    result.kind !== "query_result" ||
    result.result.outcome !== "success" ||
    result.result.projection.kind !== "work.overview"
  )
    assert.fail("Expected Work overview");
  assert.equal(result.result.projection.areas.length, 1);
  assert.equal(result.result.projection.initiatives.length, 1);
  assert.equal(result.result.projection.projects.length, 1);
  assert.equal(result.result.projection.tasks.length, 2);
  assert.equal(result.result.projection.tasks[0]?.operationalState, "waiting");
  assert.equal(result.result.projection.links.length, 3);
  assert.equal(
    result.result.projection.savedViews[0]?.name,
    "Waiting this week",
  );

  const waitingCommand = commands[3]!;
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("work-waiting-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: waitingCommand.commandId },
    }),
  );
  assert.equal(preview.outcome, "preview");
  if (
    preview.outcome !== "preview" ||
    preview.projection.kind !== "undo.previewed"
  )
    assert.fail("Expected operational-state undo preview");
  assert.equal(
    preview.projection.compensationKind,
    "task.restore_operational_state",
  );
  const undone = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("work-waiting-undo", preview.projection.requiredVersions),
      commandName: "command.undo",
      payload: { targetCommandId: waitingCommand.commandId },
    }),
  );
  assert.equal(undone.outcome, "success");
  assert.equal(
    harness.store.snapshot().tasks.find((task) => task.id === taskIds[0])
      ?.operationalState,
    "actionable",
  );
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
  assert.equal(
    harness.store.snapshot().tasks.find((task) => task.id === followUpTaskId)
      ?.dueAt,
    "2026-08-01T12:00:00.000Z",
    "renewal follow-up carries the review deadline (expiry minus lead time)",
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
  const occurrenceTask = harness.store
    .snapshot()
    .tasks.find((task) => task.id === occurrenceTaskId);
  assert.ok(
    occurrenceTask?.dueAt !== undefined,
    "the generated occurrence inherits the due moment it was generated for",
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

it("manages saved view lifecycle with field filters and grouping", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Work graph",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const fieldId = "18000000-0000-4000-8000-0000000000f1";
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-field"),
        commandName: "fieldDef.create",
        payload: {
          fieldId,
          targetKind: "task",
          label: "Segment",
          type: { kind: "choice", options: ["MSSP", "Enterprise"] },
        },
      }),
    ).outcome,
    "success",
  );
  const savedViewId = uuid();
  const createCommand = {
    ...metadata("view-create"),
    commandName: "savedView.create" as const,
    payload: {
      savedViewId,
      spaceId: ids.space,
      name: "Segment MSSP",
      filters: {
        priorities: ["urgent" as const, "high" as const],
        dueWindow: "this_week" as const,
        fields: [
          {
            fieldId,
            predicate: { kind: "choice_is" as const, option: "MSSP" },
          },
        ],
      },
      sort: "due_asc" as const,
      groupBy: "priority" as const,
    },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), createCommand)).outcome,
    "success",
  );

  const overview = () => {
    const result = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "work.overview",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space },
    });
    if (
      result.kind !== "query_result" ||
      result.result.outcome !== "success" ||
      result.result.projection.kind !== "work.overview"
    )
      assert.fail("Expected Work overview");
    return result.result.projection.savedViews;
  };

  const created = overview()[0];
  assert.deepEqual(
    created?.filters.priorities,
    ["urgent", "high"],
    "the closed R12.4 vocabulary persists through the kernel",
  );
  assert.deepEqual(created?.filters.fields, [
    { fieldId, predicate: { kind: "choice_is", option: "MSSP" } },
  ]);
  assert.equal(created?.groupBy, "priority");

  const renameCommand = {
    ...metadata("view-rename", { [savedViewId]: 1 }),
    commandName: "savedView.rename" as const,
    payload: { savedViewId, name: "Segment MSSP — pilne" },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), renameCommand)).outcome,
    "success",
  );
  assert.equal(overview()[0]?.name, "Segment MSSP — pilne");
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-rename-undo", { [savedViewId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: renameCommand.commandId },
      }),
    ).diagnosticCode,
    "command.undone",
  );
  assert.equal(overview()[0]?.name, "Segment MSSP");

  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-group-field", { [savedViewId]: 3 }),
        commandName: "savedView.update",
        payload: { savedViewId, groupBy: { fieldId } },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(overview()[0]?.groupBy, { fieldId });
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-group-unknown", { [savedViewId]: 4 }),
        commandName: "savedView.update",
        payload: {
          savedViewId,
          groupBy: { fieldId: "18000000-0000-4000-8000-0000000000f2" },
        },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
    "grouping requires an existing choice definition",
  );

  const deleteCommand = {
    ...metadata("view-delete", { [savedViewId]: 4 }),
    commandName: "savedView.delete" as const,
    payload: { savedViewId },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), deleteCommand)).outcome,
    "success",
  );
  assert.equal(overview().length, 0, "deleted views leave the strip");
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-delete-undo", { [savedViewId]: 5 }),
        commandName: "command.undo",
        payload: { targetCommandId: deleteCommand.commandId },
      }),
    ).diagnosticCode,
    "command.undone",
  );
  assert.equal(overview()[0]?.name, "Segment MSSP", "undo restores the view");
});

it("projects a meeting into routed, promoted, and identified work-graph records", () => {
  // ADR-040 / R12.5. One meeting becomes: a routed context (project +
  // organization), a real Task from its follow-up, and Person records for its
  // participants — each through an explicit, authorized, undoable command.
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-graph-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Meeting graph",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );

  const organizationId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-graph-org"),
        commandName: "relationship.organizationCreate",
        payload: {
          organizationId,
          spaceId: ids.space,
          name: "IT Card",
          relationshipState: "active",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-graph-project"),
        commandName: "project.create",
        payload: {
          spaceId: ids.space,
          title: "CrowdStrike rollout",
          intendedOutcome: "The rollout is accepted by the client.",
        },
      }),
    ).outcome,
    "success",
  );
  const projectId = harness.store.snapshot().projects[0]!.id;

  const meetingId = uuid();
  const followUpId = uuid();
  const importMeeting = (version: number, expectedVersions = {}) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`meeting-graph-import-${version}`, expectedVersions),
        commandName: "meeting.upsertImported",
        payload: {
          meeting: {
            id: meetingId,
            workspaceId: ids.workspace,
            spaceId: ids.space,
            connectionId: "jamie-workspace",
            externalMeetingId: "meeting-99",
            title: "Kwalifikacja klientow",
            startedAt: "2026-07-20T09:00:00.000Z",
            participants: [
              {
                externalId: "participant-1",
                name: "Antek",
                email: "antek@example.com",
              },
              { externalId: "participant-2", name: "Nieznany" },
            ],
            workItems: [
              {
                id: followUpId,
                kind: "follow_up",
                sourceExternalId: "task-99",
                title: "Send the qualification summary",
                state: "open",
                sourceControlled: true,
                locallyModified: false,
                dueAt: "2026-07-24T09:00:00.000Z",
                version: 1,
              },
            ],
            contentHash: "a".repeat(64),
            triage: "ready",
            missingComponents: [],
            version,
            updatedAt: "2026-07-20T10:00:00.000Z",
          },
        },
      }),
    );
  assert.equal(importMeeting(1).outcome, "success");

  const meetingRecord = () =>
    harness.store
      .snapshot()
      .strategicRecords!.find((record) => record.id === meetingId)!;

  // Routing: the meeting stops being an orphan in the first editable Space.
  const routed = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("meeting-graph-route", {
        [meetingId]: meetingRecord().version,
      }),
      commandName: "meeting.route",
      payload: { meetingId, projectId, organizationId },
    }),
  );
  assert.equal(routed.outcome, "success");

  // Promotion: the follow-up becomes a real Task, related to the project.
  const promotedTaskId = uuid();
  const promoted = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("meeting-graph-promote", {
        [meetingId]: meetingRecord().version,
      }),
      commandName: "meeting.promoteWorkItem",
      payload: { meetingId, workItemId: followUpId, taskId: promotedTaskId },
    }),
  );
  assert.equal(promoted.outcome, "success");
  const task = harness.store
    .snapshot()
    .tasks.find((candidate) => candidate.id === promotedTaskId);
  assert.equal(task?.title, "Send the qualification summary");
  // The Jamie due instant survives into real planning data.
  assert.equal(task?.dueAt, "2026-07-24T09:00:00.000Z");
  const record = meetingRecord();
  assert.equal(record.kind === "meeting", true);
  if (record.kind !== "meeting") throw new Error("Expected a meeting record");
  assert.equal(record.meeting.workItems[0]?.taskId, promotedTaskId);
  assert.equal(record.meeting.projectId, projectId);
  assert.equal(record.meeting.organizationId, organizationId);

  // Promoting the same work item again is refused: the back-reference makes
  // duplicate Tasks structurally impossible, not merely unlikely.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-graph-promote-again", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.promoteWorkItem",
        payload: { meetingId, workItemId: followUpId, taskId: uuid() },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
    "a promoted work item cannot mint a second Task",
  );

  // A Space move is refused once work is promoted, because the promoted Task
  // and its relation already live in the meeting's Space (ADR-040 §6).
  const secondSpaceId = "18000000-0000-4000-8000-000000000777";
  harness.store.transact((transaction) => {
    if (!isApplicationWave2Transaction(transaction))
      throw new Error("Expected the Wave 2 reference transaction.");
    transaction.insertSpace({
      id: SpaceIdSchema.parse(secondSpaceId),
      workspaceId: context().workspaceId,
      name: "Client delivery",
      version: 1,
      createdAt: "2026-07-20T08:00:00.000Z",
    });
    // Grant real edit access, so the refusal below is the routing rule itself
    // rather than an authorization failure standing in for it.
    transaction.insertSpaceGrant({
      id: SpaceGrantIdSchema.parse("18000000-0000-4000-8000-000000000778"),
      workspaceId: context().workspaceId,
      spaceId: SpaceIdSchema.parse(secondSpaceId),
      principalId: context().principalId,
      access: "edit",
      status: "active",
      version: 1,
      createdAt: "2026-07-20T08:00:00.000Z",
      updatedAt: "2026-07-20T08:00:00.000Z",
    });
  });
  const twoSpaceContext = ExecutionContextSchema.parse({
    ...context(),
    spaceScope: [ids.space, secondSpaceId],
  });
  harness.authorization.register(twoSpaceContext);
  assert.equal(
    unwrap(
      harness.kernel.execute(twoSpaceContext, {
        ...metadata("meeting-graph-move", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.route",
        payload: { meetingId, spaceId: secondSpaceId },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
    "routing must precede promotion, not split it across Spaces",
  );

  // A project in another Space is not a routing destination. Without this,
  // routing would succeed and promotion — which only relates within the
  // meeting's Space — would silently create a Task connected to nothing.
  const foreignProjectId = uuid();
  harness.store.transact((transaction) => {
    if (!isApplicationWave2Transaction(transaction))
      throw new Error("Expected the Wave 2 reference transaction.");
    transaction.insertProject({
      id: ProjectIdSchema.parse(foreignProjectId),
      workspaceId: context().workspaceId,
      spaceId: SpaceIdSchema.parse(secondSpaceId),
      title: "Praca w innej przestrzeni",
      intendedOutcome: "Nie powinna być celem routingu tego spotkania.",
      lifecycle: "active",
      createdBy: context().principalId,
      version: 1,
      createdAt: "2026-07-20T08:00:00.000Z",
      updatedAt: "2026-07-20T08:00:00.000Z",
    });
  });
  assert.equal(
    unwrap(
      harness.kernel.execute(twoSpaceContext, {
        ...metadata("meeting-graph-foreign-project", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.route",
        payload: { meetingId, projectId: foreignProjectId },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
    "a cross-Space project would leave a promoted Task unconnected",
  );

  // An unknown Space is refused by authorization before any routing logic.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-graph-move-unknown", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.route",
        payload: {
          meetingId,
          spaceId: "18000000-0000-4000-8000-000000000999",
        },
      }),
    ).diagnosticCode,
    "authorization.denied",
    "an unknown Space is not a routing destination",
  );

  // Identity linking: the participant with an email becomes a Person; the
  // name-only participant is left for explicit review, never guessed.
  const createdPersonId = uuid();
  const linked = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("meeting-graph-link", {
        [meetingId]: meetingRecord().version,
      }),
      commandName: "meeting.linkParticipants",
      payload: { meetingId, personIdPool: [createdPersonId] },
    }),
  );
  assert.equal(linked.outcome, "success");
  const afterLink = meetingRecord();
  if (afterLink.kind !== "meeting") throw new Error("Expected a meeting");
  assert.equal(afterLink.meeting.participants[0]?.personId, createdPersonId);
  assert.equal(afterLink.meeting.participants[1]?.personId, undefined);
  const person = harness.store
    .snapshot()
    .strategicRecords!.find((candidate) => candidate.id === createdPersonId);
  assert.equal(person?.kind === "person" ? person.name : undefined, "Antek");
  // The created Person inherits the meeting's routed organization.
  assert.equal(
    person?.kind === "person" ? person.organizationId : undefined,
    organizationId,
  );

  // Re-linking is a no-op rather than a second Person for the same human.
  const relinked = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("meeting-graph-link-again", {
        [meetingId]: meetingRecord().version,
      }),
      commandName: "meeting.linkParticipants",
      payload: { meetingId, personIdPool: [uuid()] },
    }),
  );
  assert.equal(relinked.outcome, "success");
  assert.equal(
    harness.store
      .snapshot()
      .strategicRecords!.filter((candidate) => candidate.kind === "person")
      .length,
    1,
  );

  // Promotion is reversible through the ordinary previewed-undo path: the
  // Task is removed and the work item returns to promotable state.
  const promoteCommandId = promoted.commandId;
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("meeting-graph-undo-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: promoteCommandId },
    }),
  );
  if (preview.outcome !== "preview")
    assert.fail("Expected a promotion undo preview");
  assert.equal(
    preview.projection.compensationKind,
    "meeting.unpromote_work_item",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-graph-undo", preview.projection.requiredVersions),
        commandName: "command.undo",
        payload: { targetCommandId: promoteCommandId },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    harness.store
      .snapshot()
      .tasks.find((candidate) => candidate.id === promotedTaskId)?.recordState,
    "removed",
  );
  const afterUndo = meetingRecord();
  if (afterUndo.kind !== "meeting") throw new Error("Expected a meeting");
  assert.equal(afterUndo.meeting.workItems[0]?.taskId, undefined);
  // Undo unlinks identity but never deletes a Person (ADR-040 §4).
  assert.equal(
    harness.store
      .snapshot()
      .strategicRecords!.filter((candidate) => candidate.kind === "person")
      .length,
    1,
  );

  // The work item is genuinely promotable again, not merely cleared: undo
  // followed by a fresh promotion is an ordinary supported cycle.
  const rePromotedTaskId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-graph-promote-after-undo", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.promoteWorkItem",
        payload: {
          meetingId,
          workItemId: followUpId,
          taskId: rePromotedTaskId,
        },
      }),
    ).outcome,
    "success",
  );
  const rePromoted = meetingRecord();
  if (rePromoted.kind !== "meeting") throw new Error("Expected a meeting");
  assert.equal(rePromoted.meeting.workItems[0]?.taskId, rePromotedTaskId);
});

it("generates due recurrence occurrences on a sweep without building a backlog", () => {
  // ADR-041 / R12.7 (F13). Recurring work must advance on its own rhythm; the
  // handler behind the manual button does no date arithmetic at all, so the
  // due test, the cadence maths, and the no-backlog rule all live here.
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("sweep-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Cadence",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );

  const overdueDailyId = uuid();
  const monthEndId = uuid();
  const futureId = uuid();
  const yearEndId = uuid();
  const ancientId = uuid();
  const pausedId = uuid();
  for (const [key, recurrenceId, cadence, nextDueAt, title] of [
    // Three weeks behind: a naive loop would mint 21 backdated Tasks.
    [
      "sweep-daily",
      overdueDailyId,
      "daily",
      "2026-06-21T09:00:00.000Z",
      "Daily standup note",
    ],
    // 31 January monthly, due long ago: exercises short-month clamping.
    [
      "sweep-monthly",
      monthEndId,
      "monthly",
      "2026-01-31T09:00:00.000Z",
      "Month-end close",
    ],
    // Crosses a year boundary while rolling forward, clamping on the way.
    [
      "sweep-yearend",
      yearEndId,
      "monthly",
      "2025-12-31T09:00:00.000Z",
      "Year-end carry",
    ],
    [
      "sweep-future",
      futureId,
      "weekly",
      "2026-09-01T09:00:00.000Z",
      "Not yet due",
    ],
    // Far enough behind to exhaust the roll-forward budget: the cadence must
    // still come back with a future instant rather than staying permanently
    // due and generating one occurrence every single day.
    [
      "sweep-ancient",
      ancientId,
      "daily",
      "2010-01-01T09:00:00.000Z",
      "Ancient cadence",
    ],
    [
      "sweep-paused",
      pausedId,
      "daily",
      "2026-06-01T09:00:00.000Z",
      "Paused cadence",
    ],
  ] as const) {
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(key),
          commandName: "recurrence.create",
          payload: {
            recurrenceId,
            spaceId: ids.space,
            title,
            taskTitle: title,
            cadence,
            nextDueAt,
          },
        }),
      ).outcome,
      "success",
    );
  }
  const pausedRecord = harness.store
    .snapshot()
    .strategicRecords!.find((record) => record.id === pausedId)!;
  if (pausedRecord.kind !== "recurrence")
    throw new Error("Expected a recurrence record");
  harness.store.transact((transaction) => {
    if (!isApplicationWave2Transaction(transaction))
      throw new Error("Expected the Wave 2 reference transaction.");
    transaction.updateStrategicRecord(
      { ...pausedRecord, state: "paused", version: pausedRecord.version + 1 },
      pausedRecord.version,
    );
  });

  // A due cadence in a Space the sweeper cannot edit must not be swept:
  // workspace maintenance rights are not Space access, and echoing its task
  // id back through `affected` would leak across the boundary.
  const foreignSpaceId = "18000000-0000-4000-8000-0000000008a1";
  const foreignRecurrenceId = "18000000-0000-4000-8000-0000000008a2";
  harness.store.transact((transaction) => {
    if (!isApplicationWave2Transaction(transaction))
      throw new Error("Expected the Wave 2 reference transaction.");
    transaction.insertSpace({
      id: SpaceIdSchema.parse(foreignSpaceId),
      workspaceId: context().workspaceId,
      name: "Private Space",
      version: 1,
      createdAt: "2026-07-12T12:00:00.000Z",
    });
    transaction.insertStrategicRecord({
      id: StrategicRecordIdSchema.parse(foreignRecurrenceId),
      workspaceId: context().workspaceId,
      spaceId: SpaceIdSchema.parse(foreignSpaceId),
      kind: "recurrence",
      title: "Private cadence",
      taskTitle: "Private cadence occurrence",
      cadence: "daily",
      nextDueAt: "2026-06-01T09:00:00.000Z",
      state: "active",
      createdBy: context().principalId,
      version: 1,
      createdAt: "2026-07-12T12:00:00.000Z",
      updatedAt: "2026-07-12T12:00:00.000Z",
    });
  });

  const swept = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("sweep-run"),
      commandName: "recurrence.sweep",
      payload: {},
    }),
  );
  if (
    swept.outcome !== "success" ||
    swept.projection.kind !== "recurrence.swept"
  )
    assert.fail("Expected a recurrence sweep projection");
  // One occurrence per due cadence — never one per missed period.
  assert.equal(swept.projection.generatedTaskIds.length, 4);
  assert.equal(swept.projection.truncated, false);
  // The future cadence is reported as pending; the paused one is not counted
  // at all, because a paused cadence is skipped rather than attempted.
  assert.equal(swept.projection.pendingCount, 1);

  const recurrenceOf = (id: string) => {
    const record = harness.store
      .snapshot()
      .strategicRecords!.find((candidate) => candidate.id === id)!;
    if (record.kind !== "recurrence") throw new Error("Expected a recurrence");
    return record;
  };
  const tasks = harness.store.snapshot().tasks;
  // The generated occurrence keeps the due moment it was generated for.
  const daily = tasks.find((task) => task.title === "Daily standup note");
  assert.equal(daily?.dueAt, "2026-06-21T09:00:00.000Z");
  assert.equal(daily?.completionState, "open");
  // Rolled forward past now rather than one step at a time.
  assert.ok(
    Date.parse(recurrenceOf(overdueDailyId).nextDueAt) >
      Date.parse("2026-07-12T00:00:00.000Z"),
  );
  // 31 January monthly clamps into February and keeps advancing from there.
  assert.equal(recurrenceOf(monthEndId).nextDueAt.slice(0, 10), "2026-07-28");
  // 31 December 2025 monthly rolls across the year boundary and clamps in
  // February on the way, landing on the same drifted day of month.
  assert.equal(recurrenceOf(yearEndId).nextDueAt.slice(0, 10), "2026-07-28");
  assert.ok(
    Date.parse(recurrenceOf(ancientId).nextDueAt) >
      Date.parse("2026-07-12T00:00:00.000Z"),
  );
  assert.equal(recurrenceOf(futureId).lastOccurrenceTaskId, undefined);
  // The unreachable Space was never touched, and none of its identifiers
  // appear in the outcome.
  assert.equal(
    recurrenceOf(foreignRecurrenceId).lastOccurrenceTaskId,
    undefined,
  );
  assert.equal(
    tasks.some((task) => task.title === "Private cadence occurrence"),
    false,
  );
  assert.equal(recurrenceOf(pausedId).lastOccurrenceTaskId, undefined);

  // Nothing is due any more, so a second sweep is an honest no-op rather than
  // a second batch of occurrences.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("sweep-run-again"),
        commandName: "recurrence.sweep",
        payload: {},
      }),
    ).diagnosticCode,
    "command.precondition_failed",
  );
  assert.equal(
    harness.store
      .snapshot()
      .tasks.filter((task) => task.title === "Daily standup note").length,
    1,
  );
});
