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
      "task.setCalendarBlock",
      "task.updateDetails",
      "task.complete",
      "task.reopen",
      "cockpit.week",
      "task.list",
      "project.close",
      "project.reopen",
      "radar.candidateUpsert",
      "radar.resolve",
      "radar.review",
      "meeting.upsertImported",
      "meeting.route",
      "meeting.promoteWorkItem",
      "meeting.linkParticipants",
      "meeting.editWorkItem",
      "meeting.correctWorkItemResponsibility",
      "meeting.addWorkItem",
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
      layout: "board" as const,
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

  // R13.3 left one projection behind: `relationship.workspace` returns every
  // strategic record in the space unfiltered, saved views included, and its
  // result is parsed against the strict projection schema. A saved view
  // carrying typed field conditions — authorable from the save popover — made
  // that parse throw, so storing an ordinary view broke an unrelated surface.
  // Every projection that can carry a saved view must accept the whole filter
  // vocabulary, not the subset one query happened to need.
  const relationshipRecords = (() => {
    const result = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "relationship.workspace",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space },
    });
    if (
      result.kind !== "query_result" ||
      result.result.outcome !== "success" ||
      result.result.projection.kind !== "relationship.workspace"
    )
      assert.fail("Expected the relationship workspace projection");
    return result.result.projection.records;
  })();
  const projectedView = relationshipRecords.find(
    (record) => record.kind === "saved_view",
  );
  assert.deepEqual(
    projectedView?.kind === "saved_view"
      ? projectedView.filters.fields
      : undefined,
    [{ fieldId, predicate: { kind: "choice_is", option: "MSSP" } }],
    "a saved view survives the relationship projection with its field conditions intact",
  );
  assert.deepEqual(created?.filters.fields, [
    { fieldId, predicate: { kind: "choice_is", option: "MSSP" } },
  ]);
  assert.equal(created?.groupBy, "priority");
  assert.equal(created?.layout, "board");
  assert.equal(
    projectedView?.kind === "saved_view" ? projectedView.layout : undefined,
    "board",
    "the strict relationship projection carries the same durable layout",
  );

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
    overview()[0]?.layout,
    "board",
    "changing grouping does not reset the spatial rendering",
  );
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

  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-board-without-group", { [savedViewId]: 4 }),
        commandName: "savedView.update",
        payload: { savedViewId, groupBy: null },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
    "a board cannot silently lose the grouping that defines its columns",
  );

  const layoutCommand = {
    ...metadata("view-layout-list", { [savedViewId]: 4 }),
    commandName: "savedView.update" as const,
    payload: { savedViewId, layout: "list" as const },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), layoutCommand)).outcome,
    "success",
  );
  assert.equal(overview()[0]?.layout, "list");
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-layout-undo", { [savedViewId]: 5 }),
        commandName: "command.undo",
        payload: { targetCommandId: layoutCommand.commandId },
      }),
    ).diagnosticCode,
    "command.undone",
  );
  assert.equal(
    overview()[0]?.layout,
    "board",
    "scoped undo restores the prior rendering along with the same Task view",
  );

  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-layout-timeline", { [savedViewId]: 6 }),
        commandName: "savedView.update",
        payload: { savedViewId, layout: "timeline" },
      }),
    ).outcome,
    "success",
  );
  assert.equal(overview()[0]?.layout, "timeline");
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-timeline-without-group", { [savedViewId]: 7 }),
        commandName: "savedView.update",
        payload: { savedViewId, groupBy: null },
      }),
    ).outcome,
    "success",
    "timeline projects Task timing and does not require board columns",
  );
  assert.equal(overview()[0]?.groupBy, undefined);
  assert.equal(overview()[0]?.layout, "timeline");

  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("view-ungrouped-board-create"),
        commandName: "savedView.create",
        payload: {
          savedViewId: uuid(),
          spaceId: ids.space,
          name: "Invalid board",
          filters: {},
          sort: "updated_desc",
          layout: "board",
        },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
    "board creation requires declared grouping instead of inventing columns",
  );

  const deleteCommand = {
    ...metadata("view-delete", { [savedViewId]: 8 }),
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
        ...metadata("view-delete-undo", { [savedViewId]: 9 }),
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

it("reserves time for a Task without touching its deadline", () => {
  // ADR-042 / R12.6 (F7). "When it is due" and "when I will do it" are
  // different facts: a deadline never enters the calendar-consent path, and
  // reserving time never edits the deadline.
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("block-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Time blocking",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const taskId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("block-task"),
        commandName: "task.create",
        payload: {
          taskId,
          spaceId: ids.space,
          title: "Draft the migration plan",
          dueAt: "2026-07-24T17:00:00.000Z",
        },
      }),
    ).outcome,
    "success",
  );
  const taskOf = () =>
    harness.store.snapshot().tasks.find((t) => t.id === taskId)!;

  const block = {
    ownedBlockExternalId: "block-1",
    calendarExternalId: "calendar-1",
    revision: "rev-1",
    startsAt: "2026-07-22T09:00:00.000Z",
    endsAt: "2026-07-22T11:00:00.000Z",
  };
  const reserved = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("block-set", { [taskId]: taskOf().version }),
      commandName: "task.setCalendarBlock",
      payload: { taskId, block },
    }),
  );
  assert.equal(reserved.outcome, "success");
  assert.deepEqual(taskOf().calendarBlock, block);
  // The deadline is untouched by reserving time to do the work.
  assert.equal(taskOf().dueAt, "2026-07-24T17:00:00.000Z");

  // Moving the deadline does not disturb the reserved block either.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("block-move-deadline", { [taskId]: taskOf().version }),
        commandName: "task.updateDetails",
        payload: { taskId, dueAt: "2026-07-25T17:00:00.000Z" },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(taskOf().calendarBlock, block);
  assert.equal(taskOf().dueAt, "2026-07-25T17:00:00.000Z");

  // Completing the work does not release the reservation: the block is a
  // provider-owned event that outlives the Task's completion state, and
  // dropping it here would strand a real calendar entry.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("block-complete", { [taskId]: taskOf().version }),
        commandName: "task.complete",
        payload: { taskId },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(taskOf().calendarBlock, block);
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("block-reopen", { [taskId]: taskOf().version }),
        commandName: "task.reopen",
        payload: { taskId },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(taskOf().calendarBlock, block);

  // Releasing the claim clears the descriptor and is undoable to the exact
  // prior block rather than to "some block".
  const released = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("block-release", { [taskId]: taskOf().version }),
      commandName: "task.setCalendarBlock",
      payload: { taskId, block: null },
    }),
  );
  assert.equal(released.outcome, "success");
  assert.equal(taskOf().calendarBlock, undefined);

  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("block-undo-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: released.commandId },
    }),
  );
  if (preview.outcome !== "preview") assert.fail("Expected an undo preview");
  assert.equal(
    preview.projection.compensationKind,
    "task.restore_calendar_block",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("block-undo", preview.projection.requiredVersions),
        commandName: "command.undo",
        payload: { targetCommandId: released.commandId },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(taskOf().calendarBlock, block);
  assert.equal(taskOf().dueAt, "2026-07-25T17:00:00.000Z");

  // The weekly cockpit carries the reservation beside the deadline, so a day
  // view can show "due Friday, doing it Wednesday" without a second query.
  const cockpitResponse = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "cockpit.week",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, weekStart: "2026-07-20" },
  } as never);
  assert.equal(cockpitResponse.kind, "query_result");
  if (cockpitResponse.kind !== "query_result")
    throw new Error("Expected a cockpit result");
  const cockpit = cockpitResponse.result;
  if (
    cockpit.outcome !== "success" ||
    cockpit.projection.kind !== "cockpit.week"
  )
    assert.fail("Expected a weekly cockpit projection");
  const focused = cockpit.projection.focus.find(
    (entry) => entry.taskId === taskId,
  );
  assert.deepEqual(focused?.calendarBlock, block);
  // Both facts travel together: the deadline and the time reserved for it.
  assert.equal(focused?.dueAt, "2026-07-25T17:00:00.000Z");

  // task.list carries it too, and that is the projection the Task inspector
  // actually reads. The cockpit cannot stand in for it: cockpit.week is
  // week-scoped and capped, so a block reserved outside the current week
  // would be invisible to a surface trying to show or release it.
  const listBlock = (): unknown => {
    const response = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "task.list",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space },
    } as never);
    if (response.kind !== "query_result")
      throw new Error("Expected a task.list result");
    const result = response.result;
    if (result.outcome !== "success" || result.projection.kind !== "task.list")
      assert.fail("Expected a task.list projection");
    return result.projection.items.find((item) => item.id === taskId)
      ?.calendarBlock;
  };
  assert.deepEqual(listBlock(), block);

  // Releasing the claim removes the key from the projection rather than
  // leaving a hollow descriptor behind.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("block-release-again", { [taskId]: taskOf().version }),
        commandName: "task.setCalendarBlock",
        payload: { taskId, block: null },
      }),
    ).outcome,
    "success",
  );
  assert.equal(listBlock(), undefined);

  // Undoing a first reservation must clear the descriptor, not restore some
  // earlier block — the prior state was "no block at all".
  const freshTaskId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("block-fresh-task"),
        commandName: "task.create",
        payload: { taskId: freshTaskId, spaceId: ids.space, title: "Fresh" },
      }),
    ).outcome,
    "success",
  );
  const freshOf = () =>
    harness.store.snapshot().tasks.find((t) => t.id === freshTaskId)!;
  const firstReservation = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("block-fresh-set", { [freshTaskId]: freshOf().version }),
      commandName: "task.setCalendarBlock",
      payload: { taskId: freshTaskId, block },
    }),
  );
  assert.equal(firstReservation.outcome, "success");
  const freshPreview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("block-fresh-undo-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: firstReservation.commandId },
    }),
  );
  if (freshPreview.outcome !== "preview") assert.fail("Expected a preview");
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(
          "block-fresh-undo",
          freshPreview.projection.requiredVersions,
        ),
        commandName: "command.undo",
        payload: { targetCommandId: firstReservation.commandId },
      }),
    ).outcome,
    "success",
  );
  assert.equal(freshOf().calendarBlock, undefined);
});

it("corrects meeting work items through the kernel, attributed and undoable", () => {
  // ADR-047 / R14.3. The three corrections the desktop has always made
  // through IPC are kernel commands, so an authorized agent makes them under
  // the same grants, audit, and undo — and the inner meeting version moves,
  // which is what both reconciliation points compare.
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-items-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Meeting corrections",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const meetingId = uuid();
  const sourceItemId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-items-import"),
        commandName: "meeting.upsertImported",
        payload: {
          meeting: {
            id: meetingId,
            workspaceId: ids.workspace,
            spaceId: ids.space,
            connectionId: "jamie-workspace",
            externalMeetingId: "meeting-77",
            title: "Delivery review",
            startedAt: "2026-07-21T09:00:00.000Z",
            participants: [],
            workItems: [
              {
                id: sourceItemId,
                kind: "task",
                sourceExternalId: "task-77",
                title: "Confirm the rollout owner",
                state: "open",
                sourceControlled: true,
                locallyModified: false,
                sourceValueInConflict: "Confirm the rollout owner today",
                version: 1,
              },
            ],
            contentHash: "b".repeat(64),
            triage: "ready",
            missingComponents: [],
            version: 1,
            updatedAt: "2026-07-21T10:00:00.000Z",
          },
        },
      }),
    ).outcome,
    "success",
  );
  const meetingRecord = () => {
    const record = harness.store
      .snapshot()
      .strategicRecords!.find((candidate) => candidate.id === meetingId)!;
    if (record.kind !== "meeting") throw new Error("Expected a meeting.");
    return record;
  };
  const item = () =>
    meetingRecord().meeting.workItems.find(
      (candidate) => candidate.id === sourceItemId,
    )!;

  const innerVersionBefore = meetingRecord().meeting.version;

  // A stale work-item version is refused rather than applied to whatever the
  // item happens to be now.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-items-edit-stale", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.editWorkItem",
        payload: {
          meetingId,
          workItemId: sourceItemId,
          expectedWorkItemVersion: 7,
          title: "Something else",
          state: "open",
        },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
  );

  // Typing the conflicting source value back accepts the source instead of
  // recording a local edit that would keep reporting the same conflict.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-items-accept-source", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.editWorkItem",
        payload: {
          meetingId,
          workItemId: sourceItemId,
          expectedWorkItemVersion: item().version,
          title: "Confirm the rollout owner today",
          state: "open",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(item().sourceControlled, true);
  assert.equal(item().sourceValueInConflict, undefined);

  const edit = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("meeting-items-edit", {
        [meetingId]: meetingRecord().version,
      }),
      commandName: "meeting.editWorkItem",
      payload: {
        meetingId,
        workItemId: sourceItemId,
        expectedWorkItemVersion: item().version,
        title: "Confirm the rollout owner this week",
        state: "open",
      },
    }),
  );
  assert.equal(edit.outcome, "success");
  assert.equal(item().title, "Confirm the rollout owner this week");
  assert.equal(item().locallyModified, true);
  assert.equal(item().sourceControlled, false);
  // The inner version is load-bearing: the device store and the desktop
  // publisher both compare it, so an edit that left it alone would be
  // discarded as stale on the next device load (ADR-047 §2).
  assert.equal(meetingRecord().meeting.version, innerVersionBefore + 2);

  const correction = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("meeting-items-responsibility", {
        [meetingId]: meetingRecord().version,
      }),
      commandName: "meeting.correctWorkItemResponsibility",
      payload: {
        meetingId,
        workItemId: sourceItemId,
        expectedWorkItemVersion: item().version,
        name: " Antek ",
      },
    }),
  );
  assert.equal(correction.outcome, "success");
  assert.deepEqual(item().responsibilityOverride, { name: "Antek" });
  // Attribution is a real receipt, replacing a device trail nothing read.
  assert.equal(
    harness.store
      .snapshot()
      .auditReceipts.some(
        (receipt) =>
          receipt.commandName === "meeting.correctWorkItemResponsibility" &&
          receipt.principalId === ids.principal,
      ),
    true,
  );

  const addedId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-items-add", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.addWorkItem",
        payload: {
          meetingId,
          workItemId: addedId,
          kind: "waiting",
          title: "Wait for legal review",
        },
      }),
    ).outcome,
    "success",
  );
  const added = meetingRecord().meeting.workItems.find(
    (candidate) => candidate.id === addedId,
  );
  assert.equal(added?.state, "open");
  assert.equal(added?.sourceControlled, false);
  assert.equal(added?.sourceExternalId, `local:${addedId}`);

  // Reusing an id is refused: the caller believes it is creating something.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-items-add-again", {
          [meetingId]: meetingRecord().version,
        }),
        commandName: "meeting.addWorkItem",
        payload: {
          meetingId,
          workItemId: addedId,
          kind: "waiting",
          title: "Wait for legal review",
        },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
  );

  // Undo removes exactly the added item and leaves the corrections standing.
  const addCommandId = harness.store
    .snapshot()
    .auditReceipts.find(
      (receipt) => receipt.commandName === "meeting.addWorkItem",
    )!.commandId;
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("meeting-items-undo-preview", {}),
      commandName: "command.previewUndo",
      payload: { targetCommandId: addCommandId },
    }),
  );
  assert.equal(preview.outcome, "preview");
  if (
    preview.outcome !== "preview" ||
    preview.projection.kind !== "undo.previewed"
  )
    assert.fail("Expected an added-work-item undo preview");
  assert.equal(
    preview.projection.compensationKind,
    "meeting.restore_work_item",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("meeting-items-undo", preview.projection.requiredVersions),
        commandName: "command.undo",
        payload: { targetCommandId: addCommandId },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    meetingRecord().meeting.workItems.some(
      (candidate) => candidate.id === addedId,
    ),
    false,
  );
  assert.deepEqual(item().responsibilityOverride, { name: "Antek" });
});
