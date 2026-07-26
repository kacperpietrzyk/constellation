import assert from "node:assert/strict";
import { it } from "node:test";

import {
  isApplicationWave2ReadView,
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

import { createReferenceHarness, type ReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "18000000-0000-4000-8000-000000000001",
  space: "18000000-0000-4000-8000-000000000002",
  principal: "18000000-0000-4000-8000-000000000003",
  credential: "18000000-0000-4000-8000-000000000004",
  grant: "18000000-0000-4000-8000-000000000005",
  foreignSpace: "18000000-0000-4000-8000-000000000006",
  foreignGrant: "18000000-0000-4000-8000-000000000007",
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
      "relationship.organizationRemove",
      "project.remove",
      "document.remove",
      "knowledge.sourceRemove",
      "record.relate",
      "record.unrelate",
      "knowledge.documentSetEvidence",
      "document.backlinks",
      "relationship.personRemove",
      "relationship.personUpdate",
      "relationship.organizationUpdate",
      "record.relate",
      "record.unrelate",
      "task.create",
      "project.create",
      "knowledge.sourceCreate",
      "opportunity.create",
      "relationship.personCreate",
      "opportunity.create",
      "opportunity.offerCreate",
      "opportunity.linkOutcomes",
      "relationship.workspace",
      "person.list",
      "organization.list",
      "project.operationalOverview",
      "organization.operationalOverview",
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
      "knowledge.list",
      "capture.submit",
      "capture.process",
      "opportunity.remove",
      "project.list",
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
  const workOrganizationId = uuid();
  const projectOrganizationLinkId = uuid();
  for (const command of [
    {
      ...metadata("work-organization"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId: workOrganizationId,
        spaceId: ids.space,
        name: "Falcon Freight",
        relationshipState: "active" as const,
      },
    },
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
      // Every link type the command accepts is created here on purpose. A
      // widened link vocabulary that reached the command but not the
      // projections faulted `work.overview` and `relationship.workspace`
      // outright on 0.1.5, because both parse strictly and one unreadable
      // link takes the whole answer down. This block is where that is caught.
      ...metadata("work-project-organization"),
      commandName: "work.linkCreate" as const,
      payload: {
        linkId: projectOrganizationLinkId,
        spaceId: ids.space,
        linkType: "project_serves_organization" as const,
        sourceRecordId: project.id,
        targetRecordId: workOrganizationId,
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
  assert.equal(result.result.projection.links.length, 4);
  assert.equal(
    result.result.projection.links.filter(
      (link) => link.linkType === "project_serves_organization",
    ).length,
    1,
  );
  assert.equal(
    result.result.projection.savedViews[0]?.name,
    "Waiting this week",
  );

  // The other projection that carries a work link, and the one the Relacje
  // surface loads. It answers over the same records, so it is asserted here
  // rather than left to a reader to assume.
  const relationshipResult = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "relationship.workspace",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    relationshipResult.kind !== "query_result" ||
    relationshipResult.result.outcome !== "success" ||
    relationshipResult.result.projection.kind !== "relationship.workspace"
  )
    assert.fail("Expected relationship workspace");
  assert.equal(
    relationshipResult.result.projection.records.filter(
      (record) =>
        record.kind === "work_link" &&
        record.linkType === "project_serves_organization",
    ).length,
    1,
  );

  // Located by name rather than by index: this block grows a command whenever
  // the link vocabulary does, and a positional lookup silently retargets the
  // undo preview at whatever moved into the slot.
  const waitingCommand = commands.find(
    (candidate) => candidate.commandName === "task.setOperationalState",
  )!;
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
        ...metadata("view-layout-calendar", { [savedViewId]: 8 }),
        commandName: "savedView.update",
        payload: { savedViewId, layout: "calendar" },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    overview()[0]?.layout,
    "calendar",
    "calendar remains the same ungrouped Saved View rather than a new model",
  );

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
    ...metadata("view-delete", { [savedViewId]: 9 }),
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
        ...metadata("view-delete-undo", { [savedViewId]: 10 }),
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

  // An unknown Space is refused by the authorization pass before any routing
  // logic — as a precondition, because the grant carries meeting.route. It is
  // the same answer a Space the caller may not reach would get, so the
  // refusal does not say which of the two this id is.
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
    "command.precondition_failed",
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

it("refuses to remove a record other work still points at, and hides it once removed", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("removal-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Removal",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const organizationId = uuid();
  const personId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("removal-organization"),
        commandName: "relationship.organizationCreate",
        payload: {
          organizationId,
          spaceId: ids.space,
          name: "Orbit",
          relationshipState: "active",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("removal-person"),
        commandName: "relationship.personCreate",
        payload: {
          personId,
          spaceId: ids.space,
          name: "Ada",
          organizationId,
        },
      }),
    ).outcome,
    "success",
  );

  const remove = (key: string, id: string, version: number) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key, { [id]: version }),
        commandName:
          id === organizationId
            ? "relationship.organizationRemove"
            : "relationship.personRemove",
        payload:
          id === organizationId ? { organizationId: id } : { personId: id },
      }),
    );

  // ADR-043 §3, as task.remove: refuse rather than orphan. The person still
  // names this organization, so the organization stays until they are detached
  // or removed themselves.
  const blocked = remove("removal-blocked", organizationId, 1);
  assert.equal(blocked.outcome, "rejected");
  assert.equal(blocked.diagnosticCode, "record.still_referenced");

  assert.equal(remove("removal-person-go", personId, 1).outcome, "success");
  const removed = remove("removal-organization-go", organizationId, 1);
  assert.equal(removed.outcome, "success");

  const records = (): readonly string[] => {
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
      throw new Error("Expected the relationship projection.");
    return result.result.projection.records.map((record) => record.id);
  };
  assert.deepEqual(records(), []);
  // Search reads the same list, so a removed record leaves both at once
  // rather than lingering in one surface.
  const search = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "search.global",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceIds: [ids.space], text: "Orbit" },
  });
  if (
    search.kind !== "query_result" ||
    search.result.outcome !== "success" ||
    search.result.projection.kind !== "search.global"
  )
    throw new Error("Expected the search projection.");
  assert.deepEqual(search.result.projection.items, []);

  // Removing twice is a precondition failure, not a second soft delete.
  assert.equal(
    remove("removal-organization-again", organizationId, 2).outcome,
    "rejected",
  );
});

it("refuses to remove a Project, Document or Source that live work still cites", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const execute = (
    key: string,
    commandName: string,
    payload: Record<string, unknown>,
    expectedVersions: Readonly<Record<string, number>> = {},
  ) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key, expectedVersions),
        commandName,
        payload,
      } as never),
    );
  assert.equal(
    execute("table-bootstrap", "workspace.createLocal", {
      workspaceId: ids.workspace,
      rootSpaceId: ids.space,
      ownerPrincipalId: ids.principal,
      name: "Table removal",
      timezone: "Europe/Warsaw",
    }).outcome,
    "success",
  );

  // A Project a Task contributes to. The relation is what blocks the removal,
  // so detaching it is what unblocks it.
  const created = execute("table-project", "project.create", {
    spaceId: ids.space,
    title: "Cited project",
  });
  if (
    created.outcome !== "success" ||
    created.projection.kind !== "project.created"
  )
    throw new Error("Expected a created Project.");
  const projectId = created.projection.projectId;
  const taskId = uuid();
  assert.equal(
    execute("table-task", "task.create", {
      taskId,
      spaceId: ids.space,
      title: "Contributing task",
    }).outcome,
    "success",
  );
  const related = execute(
    "table-relate",
    "record.relate",
    { relationType: "task_contributes_to_project", taskId, projectId },
    { [taskId]: 1, [projectId]: 1 },
  );
  if (
    related.outcome !== "success" ||
    related.projection.kind !== "relation.created"
  )
    throw new Error("Expected a relation.");
  assert.equal(
    execute(
      "table-project-blocked",
      "project.remove",
      { projectId },
      {
        [projectId]: 1,
      },
    ).diagnosticCode,
    "record.still_referenced",
  );
  assert.equal(
    execute(
      "table-unrelate",
      "record.unrelate",
      { relationId: related.projection.relationId },
      { [related.projection.relationId]: 1 },
    ).outcome,
    "success",
  );
  assert.equal(
    execute(
      "table-project-go",
      "project.remove",
      { projectId },
      {
        [projectId]: 1,
      },
    ).outcome,
    "success",
  );

  // A Source cited as a Document's evidence, and the note Document that
  // evidence names: both ends are blocked while the citation stands.
  const sourceId = uuid();
  const noteId = uuid();
  const deliverableId = uuid();
  assert.equal(
    execute("table-source", "knowledge.sourceCreate", {
      sourceId,
      spaceId: ids.space,
      sourceKind: "url",
      title: "Cited source",
      canonicalUrl: "https://example.test/cited",
      availability: "reference_only",
      observedAt: "2026-07-24T09:00:00.000Z",
    }).outcome,
    "success",
  );
  for (const [documentId, role, key] of [
    [noteId, "note", "table-note"],
    [deliverableId, "deliverable", "table-deliverable"],
  ] as const)
    assert.equal(
      execute(key, "document.create", {
        documentId,
        spaceId: ids.space,
        title: `Cited ${role}`,
        role,
      }).outcome,
      "success",
    );
  assert.equal(
    execute(
      "table-evidence",
      "knowledge.documentSetEvidence",
      {
        documentId: deliverableId,
        sourceIds: [sourceId],
        noteDocumentIds: [noteId],
      },
      { [deliverableId]: 1, [sourceId]: 1, [noteId]: 1 },
    ).outcome,
    "success",
  );
  assert.equal(
    execute(
      "table-source-blocked",
      "knowledge.sourceRemove",
      { sourceId },
      {
        [sourceId]: 1,
      },
    ).diagnosticCode,
    "record.still_referenced",
  );
  assert.equal(
    execute(
      "table-note-blocked",
      "document.remove",
      { documentId: noteId },
      {
        [noteId]: 1,
      },
    ).diagnosticCode,
    "record.still_referenced",
  );
  // The deliverable cites; nothing cites it, so it goes.
  assert.equal(
    execute(
      "table-deliverable-go",
      "document.remove",
      { documentId: deliverableId },
      { [deliverableId]: 2 },
    ).outcome,
    "success",
  );
  // With the citing Document gone, both cited records are free.
  assert.equal(
    execute(
      "table-source-go",
      "knowledge.sourceRemove",
      { sourceId },
      {
        [sourceId]: 1,
      },
    ).outcome,
    "success",
  );
  assert.equal(
    execute(
      "table-note-go",
      "document.remove",
      { documentId: noteId },
      {
        [noteId]: 1,
      },
    ).outcome,
    "success",
  );
});

/**
 * A harness with the workspace already made, because every removal test below
 * starts from the same two lines and differs only in what it attaches.
 */
const removalHarness = (key: string): ReferenceHarness => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`${key}-bootstrap`),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Blocking records",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  return harness;
};

const createOrganization = (harness: ReferenceHarness, key: string): string => {
  const organizationId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`${key}-organization`),
        commandName: "relationship.organizationCreate",
        payload: {
          organizationId,
          spaceId: ids.space,
          name: "Orbit",
          relationshipState: "active",
        },
      }),
    ).outcome,
    "success",
  );
  return organizationId;
};

const createPerson = (
  harness: ReferenceHarness,
  key: string,
  organizationId: string,
): string => {
  const personId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`${key}-person`),
        commandName: "relationship.personCreate",
        payload: { personId, spaceId: ids.space, name: "Ada", organizationId },
      }),
    ).outcome,
    "success",
  );
  return personId;
};

const removeOrganization = (
  harness: ReferenceHarness,
  key: string,
  organizationId: string,
  callerContext: ExecutionContext = context(),
): CommandOutcome =>
  unwrap(
    harness.kernel.execute(callerContext, {
      ...metadata(key, { [organizationId]: 1 }),
      commandName: "relationship.organizationRemove",
      payload: { organizationId },
    }),
  );

/**
 * A grant that carries the removal capability but reaches a different Space.
 * The no-leak argument rests on the authorization pass, not on the removal
 * handler, so the caller has to be refused before the handler runs.
 */
const outsideThisSpace = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    ...context(),
    grantId: ids.foreignGrant,
    spaceScope: [ids.foreignSpace],
  });

it("names the record that blocks removing an organization", () => {
  const harness = removalHarness("blocking-organization");
  const organizationId = createOrganization(harness, "blocking-organization");
  const personId = createPerson(
    harness,
    "blocking-organization",
    organizationId,
  );
  const refused = removeOrganization(
    harness,
    "blocking-organization-remove",
    organizationId,
  );
  assert.equal(refused.outcome, "rejected");
  if (refused.diagnosticCode !== "record.still_referenced")
    throw new Error("Expected the blocked outcome.");
  assert.deepEqual(refused.blockedBy, [
    { recordId: personId, recordKind: "strategicRecord", recordType: "person" },
  ]);
  assert.equal(refused.blockedByCount, 1);
});

it("names the record that blocks removing a project", () => {
  const harness = removalHarness("blocking-project");
  const organizationId = createOrganization(harness, "blocking-project");
  const opportunityId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("blocking-project-opportunity"),
        commandName: "opportunity.create",
        payload: {
          opportunityId,
          spaceId: ids.space,
          title: "Northstar remediation",
          organizationId,
          personIds: [],
          need: "Choose the first remediation programme.",
          qualification: "Sponsor and evidence confirmed.",
          stage: "qualified",
          nextAction: "Prepare a scoped offer.",
          evidenceSourceIds: [],
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("blocking-project-project"),
        commandName: "project.create",
        payload: {
          spaceId: ids.space,
          title: "Deliver the remediation",
          intendedOutcome: "Northstar accepts a remediation plan.",
        },
      }),
    ).outcome,
    "success",
  );
  const project = harness.store.snapshot().projects[0];
  assert.ok(project);
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("blocking-project-link", {
          [opportunityId]: 1,
          [project.id]: 1,
        }),
        commandName: "opportunity.linkOutcomes",
        payload: {
          opportunityId,
          offerIds: [],
          projectIds: [project.id],
          state: "pursued",
          nextAction: "Run the accepted programme.",
        },
      }),
    ).outcome,
    "success",
  );
  const refused = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("blocking-project-remove", { [project.id]: 1 }),
      commandName: "project.remove",
      payload: { projectId: project.id },
    }),
  );
  if (refused.diagnosticCode !== "record.still_referenced")
    throw new Error("Expected the blocked outcome.");
  assert.deepEqual(refused.blockedBy, [
    {
      recordId: opportunityId,
      recordKind: "strategicRecord",
      recordType: "opportunity",
    },
  ]);
  assert.equal(refused.blockedByCount, 1);
});

it("caps the named records and still reports the real total", () => {
  const harness = removalHarness("blocking-cap");
  const organizationId = createOrganization(harness, "blocking-cap");
  const personIds = Array.from({ length: 21 }, (_, index) =>
    createPerson(harness, `blocking-cap-${index}`, organizationId),
  );
  const refused = removeOrganization(
    harness,
    "blocking-cap-remove",
    organizationId,
  );
  if (refused.diagnosticCode !== "record.still_referenced")
    throw new Error("Expected the blocked outcome.");
  // A sample, not a set: the count is what tells the caller how much detaching
  // is left once the twenty named ones are done.
  assert.equal(refused.blockedBy.length, 20);
  assert.equal(refused.blockedByCount, personIds.length);
});

it("still answers precondition_failed to a caller outside the Space", () => {
  // The no-leak argument rests entirely on this: the new code is only
  // reachable after an authorization pass that required the target's Space, so
  // it can never tell a caller about records it may not read. A green happy
  // path does not test that.
  const harness = removalHarness("blocking-foreign");
  harness.authorization.register(outsideThisSpace());
  const organizationId = createOrganization(harness, "blocking-foreign");
  createPerson(harness, "blocking-foreign", organizationId);
  // The control: the same removal, run by a caller who can reach the Space,
  // still names the reference. Without this, the test above would pass just
  // as well if the shared creators stopped producing a dependent at all.
  const inSpace = removeOrganization(
    harness,
    "blocking-foreign-control",
    organizationId,
  );
  assert.equal(inSpace.diagnosticCode, "record.still_referenced");
  const refused = removeOrganization(
    harness,
    "blocking-foreign-remove",
    organizationId,
    outsideThisSpace(),
  );
  assert.equal(refused.diagnosticCode, "command.precondition_failed");
  assert.equal("blockedBy" in refused, false);
});

it("says undoing a create is blocked by a reference, not a later change", () => {
  const harness = removalHarness("undo-blocked-strategic");
  const organizationCommand = {
    ...metadata("undo-blocked-strategic-organization"),
    commandName: "relationship.organizationCreate" as const,
    payload: {
      organizationId: uuid(),
      spaceId: ids.space,
      name: "Orbit",
      relationshipState: "active" as const,
    },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), organizationCommand)).outcome,
    "success",
  );
  createPerson(
    harness,
    "undo-blocked-strategic",
    organizationCommand.payload.organizationId,
  );
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("undo-blocked-strategic-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: organizationCommand.commandId },
    }),
  );
  if (
    preview.outcome !== "preview" ||
    preview.projection.kind !== "undo.previewed"
  )
    throw new Error("Expected an undo preview.");
  assert.equal(preview.projection.available, false);
  assert.equal(preview.projection.unavailableReason, "still_referenced");
});

it("says undoing a table record create is blocked by a reference, not a later change", () => {
  const harness = removalHarness("undo-blocked-table");
  const projectCommand = {
    ...metadata("undo-blocked-table-project"),
    commandName: "project.create" as const,
    payload: { spaceId: ids.space, title: "Cited project" },
  };
  const created = unwrap(harness.kernel.execute(context(), projectCommand));
  if (
    created.outcome !== "success" ||
    created.projection.kind !== "project.created"
  )
    throw new Error("Expected a created Project.");
  const projectId = created.projection.projectId;
  const taskId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-blocked-table-task"),
        commandName: "task.create",
        payload: { taskId, spaceId: ids.space, title: "Contributing task" },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-blocked-table-relate", {
          [taskId]: 1,
          [projectId]: 1,
        }),
        commandName: "record.relate",
        payload: {
          relationType: "task_contributes_to_project",
          taskId,
          projectId,
        },
      }),
    ).outcome,
    "success",
  );
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("undo-blocked-table-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: projectCommand.commandId },
    }),
  );
  if (
    preview.outcome !== "preview" ||
    preview.projection.kind !== "undo.previewed"
  )
    throw new Error("Expected an undo preview.");
  assert.equal(preview.projection.available, false);
  assert.equal(preview.projection.unavailableReason, "still_referenced");
});

it("degrades reads that resolve a removed record instead of failing them", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const execute = (
    key: string,
    commandName: string,
    payload: Record<string, unknown>,
    expectedVersions: Readonly<Record<string, number>> = {},
  ) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key, expectedVersions),
        commandName,
        payload,
      } as never),
    );
  assert.equal(
    execute("dangling-bootstrap", "workspace.createLocal", {
      workspaceId: ids.workspace,
      rootSpaceId: ids.space,
      ownerPrincipalId: ids.principal,
      name: "Dangling reads",
      timezone: "Europe/Warsaw",
    }).outcome,
    "success",
  );
  const organizationId = uuid();
  assert.equal(
    execute("dangling-organization", "relationship.organizationCreate", {
      organizationId,
      spaceId: ids.space,
      name: "Removed relation",
      relationshipState: "prospect",
    }).outcome,
    "success",
  );
  assert.equal(
    execute(
      "dangling-remove",
      "relationship.organizationRemove",
      { organizationId },
      { [organizationId]: 1 },
    ).outcome,
    "success",
  );

  // A document link into a removed record resolves to nothing, exactly as a
  // link into a removed Task does. The read has to answer — a removal that
  // makes an ordinary query throw would be worse than the gap it closed.
  const backlinks = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "document.backlinks",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { targetKind: "organization", targetId: organizationId },
  });
  assert.equal(backlinks.kind, "query_result");
  if (backlinks.kind !== "query_result") throw new Error("Expected a result.");
  assert.equal(backlinks.result.outcome, "rejected");
  assert.equal(backlinks.result.diagnosticCode, "authorization.denied");

  // And the Space the record left still reads cleanly.
  const records = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "relationship.workspace",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    records.kind !== "query_result" ||
    records.result.outcome !== "success" ||
    records.result.projection.kind !== "relationship.workspace"
  )
    throw new Error("Expected the relationship projection.");
  assert.deepEqual(records.result.projection.records, []);
});

/**
 * The gap this closes was the one most likely to be met on an ordinary day: a
 * misspelled surname. Person and Organization were the only entity kinds with
 * no update, so the only fix was to remove the record and re-create it under a
 * new id — which lost createdAt and the lineage, dangled every reference to the
 * old id, and stopped working entirely once anything pointed at the person.
 */
it("corrects a person and an organization in place, reversibly", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("update-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Corrections",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const organizationId = uuid();
  const otherOrganizationId = uuid();
  const personId = uuid();
  for (const command of [
    {
      ...metadata("update-org"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId,
        spaceId: ids.space,
        name: "Sofinet",
        relationshipState: "prospect" as const,
      },
    },
    {
      ...metadata("update-other-org"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId: otherOrganizationId,
        spaceId: ids.space,
        name: "Second client",
        relationshipState: "active" as const,
      },
    },
    {
      ...metadata("update-person"),
      commandName: "relationship.personCreate" as const,
      payload: {
        personId,
        spaceId: ids.space,
        name: "Diana Grab",
        organizationId,
        role: "Sponsor",
        email: "diana@example.test",
      },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }

  const correction = metadata("update-person-name", { [personId]: 1 });
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...correction,
        commandName: "relationship.personUpdate",
        payload: {
          personId,
          name: "Daiana Grab",
          organizationId: otherOrganizationId,
          role: null,
        },
      }),
    ).outcome,
    "success",
  );
  const strategic = (id: string) =>
    harness.store.read((view) =>
      isApplicationWave2ReadView(view)
        ? view.getStrategicRecord(StrategicRecordIdSchema.parse(id))
        : undefined,
    );
  const corrected = strategic(personId);
  assert.equal(corrected?.kind === "person" && corrected.name, "Daiana Grab");
  // Absent leaves a field alone, null clears it: the email the command never
  // mentioned survives, the role it cleared is gone.
  assert.equal(
    corrected?.kind === "person" && corrected.email,
    "diana@example.test",
  );
  assert.equal(corrected?.kind === "person" && corrected.role, undefined);
  assert.equal(
    corrected?.kind === "person" && corrected.organizationId,
    otherOrganizationId,
  );
  // The record is the same record: same id, same createdAt, one version on.
  assert.equal(corrected?.id, personId);
  assert.equal(corrected?.version, 2);

  const undone = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("update-person-undo", { [personId]: 2 }),
      commandName: "command.undo",
      payload: { targetCommandId: correction.commandId },
    }),
  );
  assert.equal(undone.outcome, "success");
  const restored = strategic(personId);
  assert.equal(restored?.kind === "person" && restored.name, "Diana Grab");
  assert.equal(restored?.kind === "person" && restored.role, "Sponsor");
  assert.equal(
    restored?.kind === "person" && restored.organizationId,
    organizationId,
  );

  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("update-org-state", { [organizationId]: 1 }),
        commandName: "relationship.organizationUpdate",
        payload: {
          organizationId,
          name: "Softinet",
          relationshipState: "active",
        },
      }),
    ).outcome,
    "success",
  );
  const organization = strategic(organizationId);
  assert.equal(
    organization?.kind === "organization" && organization.name,
    "Softinet",
  );
  assert.equal(
    organization?.kind === "organization" && organization.relationshipState,
    "active",
  );

  // A stale version is a conflict, not a silent overwrite.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("update-org-stale", { [organizationId]: 1 }),
        commandName: "relationship.organizationUpdate",
        payload: { organizationId, name: "Stale" },
      }),
    ).outcome,
    "conflict",
  );
  // A person is not an organization: naming the wrong kind is a precondition
  // failure rather than a write into the wrong record.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("update-wrong-kind", { [personId]: 3 }),
        commandName: "relationship.organizationUpdate",
        payload: { organizationId: personId, name: "Wrong kind" },
      }),
    ).outcome,
    "rejected",
  );
});

/**
 * The four reaches the first real migration went without. Each one had a
 * workaround — a client name inside a title, provenance in a paragraph, an
 * owner restated in prose, a per-client action parked on a reporting project —
 * and every workaround answers a question the graph should have answered.
 */
it("carries provenance, a client, a deal owner and a per-deal action", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("reach-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Engagement",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const sourceId = uuid();
  // A second Source, cited by the Project and by nothing else. The first one is
  // shared with the Opportunity, which is a strategic record and has always
  // blocked its removal — so asserting against it would pass whether or not
  // Projects are counted, and prove nothing about the arm being tested.
  const projectSourceId = uuid();
  const organizationId = uuid();
  const ownerId = uuid();
  const contactId = uuid();
  const projectId = uuid();
  const opportunityId = uuid();
  const taskId = uuid();
  const linkId = uuid();
  for (const command of [
    {
      ...metadata("reach-source"),
      commandName: "knowledge.sourceCreate" as const,
      payload: {
        sourceId,
        spaceId: ids.space,
        sourceKind: "excerpt" as const,
        title: "Eight interviews",
        excerpt: "The PoV has to start from the sensor rollout.",
        availability: "available" as const,
        observedAt: "2026-07-15T10:00:00.000Z",
      },
    },
    {
      ...metadata("reach-project-source"),
      commandName: "knowledge.sourceCreate" as const,
      payload: {
        sourceId: projectSourceId,
        spaceId: ids.space,
        sourceKind: "excerpt" as const,
        title: "Rollout note",
        excerpt: "Sensors go out by GPO, without a restart.",
        availability: "available" as const,
        observedAt: "2026-07-16T10:00:00.000Z",
      },
    },
    {
      ...metadata("reach-org"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId,
        spaceId: ids.space,
        name: "Starostwo Powiatowe",
        relationshipState: "active" as const,
      },
    },
    {
      ...metadata("reach-owner"),
      commandName: "relationship.personCreate" as const,
      payload: { personId: ownerId, spaceId: ids.space, name: "Paweł" },
    },
    {
      ...metadata("reach-contact"),
      commandName: "relationship.personCreate" as const,
      payload: {
        personId: contactId,
        spaceId: ids.space,
        name: "Natalia",
        organizationId,
      },
    },
    {
      // The Project names the Source it rests on, mechanically rather than in
      // a paragraph.
      ...metadata("reach-project"),
      commandName: "project.create" as const,
      payload: {
        projectId,
        spaceId: ids.space,
        title: "PoV",
        intendedOutcome: "Prove the rollout in fourteen days.",
        evidenceSourceIds: [sourceId, projectSourceId],
      },
    },
    {
      // The Project serves a named client, so the Organization knows a
      // delivery is running at it.
      ...metadata("reach-link"),
      commandName: "work.linkCreate" as const,
      payload: {
        linkId,
        spaceId: ids.space,
        linkType: "project_serves_organization" as const,
        sourceRecordId: projectId,
        targetRecordId: organizationId,
      },
    },
    {
      ...metadata("reach-opportunity"),
      commandName: "opportunity.create" as const,
      payload: {
        opportunityId,
        spaceId: ids.space,
        title: "Licence renewal",
        organizationId,
        personIds: [contactId],
        // Whose deal it is, as against who is named on it.
        ownerPersonId: ownerId,
        need: "The licence expires in fourteen days.",
        qualification: "Budget confirmed.",
        stage: "qualified",
        nextAction: "Send the two-variant quote.",
        evidenceSourceIds: [sourceId],
      },
    },
    {
      ...metadata("reach-task"),
      commandName: "task.create" as const,
      payload: {
        taskId,
        spaceId: ids.space,
        title: "Wyjaśnić rejestrację deala",
      },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }

  // The action belongs to the deal, not to a reporting project it would
  // outlive.
  const related = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("reach-relate", { [taskId]: 1, [opportunityId]: 1 }),
      commandName: "record.relate",
      payload: {
        relationType: "task_contributes_to_opportunity",
        taskId,
        opportunityId,
      },
    }),
  );
  assert.equal(related.outcome, "success", JSON.stringify(related));
  assert.equal(
    related.outcome === "success" &&
      related.projection.kind === "relation.created" &&
      related.projection.opportunityId,
    opportunityId,
  );

  // Relating the same Task to the same Opportunity twice is the same act
  // twice, and it is refused on the far end that is an Opportunity exactly as
  // it is on the one that is a Project. The guard reads the relation through a
  // single finder whose contract is "whichever far end that is", and this is
  // the only assertion that holds the in-memory implementation of it to that
  // contract — the SQL one answers on either end and the pair had drifted.
  const duplicate = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("reach-relate-again", { [taskId]: 1, [opportunityId]: 1 }),
      commandName: "record.relate",
      payload: {
        relationType: "task_contributes_to_opportunity",
        taskId,
        opportunityId,
      },
    }),
  );
  assert.equal(duplicate.outcome, "conflict", JSON.stringify(duplicate));
  if (
    duplicate.outcome !== "conflict" ||
    duplicate.diagnosticCode !== "relation.already_exists"
  )
    throw new Error("Expected the existing relation to be named.");
  assert.deepEqual(duplicate.currentVersions, {
    [related.outcome === "success" &&
    related.projection.kind === "relation.created"
      ? related.projection.relationId
      : "unreachable"]: 1,
  });

  const strategic = (id: string) =>
    harness.store.read((view) =>
      isApplicationWave2ReadView(view)
        ? view.getStrategicRecord(StrategicRecordIdSchema.parse(id))
        : undefined,
    );
  const opportunity = strategic(opportunityId);
  assert.equal(
    opportunity?.kind === "opportunity" && opportunity.ownerPersonId,
    ownerId,
  );
  const project = harness.store.read((view) =>
    isApplicationWave2ReadView(view)
      ? view.getProject(ProjectIdSchema.parse(projectId))
      : undefined,
  );
  assert.deepEqual(project?.evidenceSourceIds, [sourceId, projectSourceId]);

  // Naming the owner is what makes them undeletable while the deal stands: the
  // guard that stops a graph from being silently orphaned now covers them.
  const blocked = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("reach-owner-remove", { [ownerId]: 1 }),
      commandName: "relationship.personRemove",
      payload: { personId: ownerId },
    }),
  );
  assert.equal(blocked.outcome, "rejected");
  assert.equal(
    blocked.outcome === "rejected" && blocked.diagnosticCode,
    "record.still_referenced",
  );

  // A Source a Project rests on is undeletable while the Project stands. The
  // guard was written when `evidenceSourceIds` was a strategic-record field
  // only, so Projects — which are not strategic records — fell through it and
  // a Project's evidence could be removed out from under it. This is asserted
  // against the Source the Project alone cites, so it fails if that arm is
  // taken out; the shared one would refuse on the Opportunity either way.
  const blockedSource = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("reach-source-remove", { [projectSourceId]: 1 }),
      commandName: "knowledge.sourceRemove",
      payload: { sourceId: projectSourceId },
    }),
  );
  assert.equal(blockedSource.outcome, "rejected");
  assert.equal(
    blockedSource.outcome === "rejected" && blockedSource.diagnosticCode,
    "record.still_referenced",
  );
  assert.deepEqual(
    blockedSource.outcome === "rejected" &&
      blockedSource.diagnosticCode === "record.still_referenced"
      ? blockedSource.blockedBy.map((blocker) => blocker.recordId)
      : [],
    [projectId],
  );

  // The client reads back from the Project side too. Until 0.1.5 this answered
  // `[]` for a Project linked straight at an Organization, while the
  // organization side already listed that same Project — the edge surfaced one
  // way only.
  const clientOf = () => {
    const overview = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "project.operationalOverview",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { projectId },
    });
    if (
      overview.kind !== "query_result" ||
      overview.result.outcome !== "success" ||
      overview.result.projection.kind !== "project.operationalOverview"
    )
      assert.fail("Expected Project overview");
    return overview.result.projection.clientOrganizations.map(
      (organization) => organization.id,
    );
  };
  assert.deepEqual(clientOf(), [organizationId]);

  // The evidence a Project rests on reads back, so "which Projects rest on the
  // note whose currency I doubt?" has an answer from the Project's end.
  const overviewOf = () => {
    const overview = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "project.operationalOverview",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { projectId },
    });
    if (
      overview.kind !== "query_result" ||
      overview.result.outcome !== "success" ||
      overview.result.projection.kind !== "project.operationalOverview"
    )
      assert.fail("Expected Project overview");
    return overview.result.projection;
  };
  assert.deepEqual(
    [...overviewOf().evidenceSources.map((source) => source.id)].sort(),
    [sourceId, projectSourceId].sort(),
  );

  // The deal owner is projected where a client is actually read, and by name —
  // an id alone would need a second query the caller may not be able to make.
  const organizationOverview = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "organization.operationalOverview",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, organizationId },
  });
  if (
    organizationOverview.kind !== "query_result" ||
    organizationOverview.result.outcome !== "success" ||
    organizationOverview.result.projection.kind !==
      "organization.operationalOverview"
  )
    assert.fail("Expected Organization overview");
  const projectedDeal =
    organizationOverview.result.projection.opportunities.find(
      (candidate) => candidate.id === opportunityId,
    );
  assert.equal(projectedDeal?.owner?.id, ownerId);

  // And it lets go. This half is the one that catches a builder reading the
  // link without honouring `state`, which is the axis a work link is removed
  // on.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("reach-link-remove", { [linkId]: 1 }),
        commandName: "work.linkRemove",
        payload: { linkId },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(clientOf(), []);

  // The query layer's project.organization path resolves through the direct
  // link, not only through an Opportunity that happens to name both.
  const filtered = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "task.list",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: {
      spaceId: ids.space,
      relationConditions: [
        {
          path: "project.organization",
          predicate: { field: "id", in: [organizationId] },
        },
      ],
    },
  });
  assert.equal(
    filtered.kind === "query_result" && filtered.result.outcome,
    "success",
  );
});

/**
 * A migration re-run is the case this field exists for. Names are not unique —
 * two people genuinely can share one — so before `externalId` the only thing
 * standing between a second run and a duplicate record was the caller's own
 * discipline with idempotency keys, which a fresh command id or a different
 * principal walks straight past.
 */
it("claims a source row once per Space, and never re-points a claim", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("external-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Provenance",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const personId = uuid();
  const secondPersonId = uuid();
  const organizationId = uuid();
  const create = (id: string, key: string, externalId?: string) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key),
        commandName: "relationship.personCreate",
        payload: {
          personId: id,
          spaceId: ids.space,
          name: "Karina Szambelan",
          ...(externalId === undefined ? {} : { externalId }),
        },
      }),
    );

  assert.equal(create(personId, "ext-first", "jamie:p-1").outcome, "success");

  // The re-run: same source row, a fresh record id, a fresh idempotency key —
  // everything the old dedup keyed on has changed, which is exactly why it
  // could not catch this.
  const rerun = create(secondPersonId, "ext-rerun", "jamie:p-1");
  assert.equal(rerun.outcome, "conflict");
  assert.equal(
    rerun.outcome === "conflict" && rerun.diagnosticCode,
    "record.already_exists",
  );
  // And the refusal is actionable rather than merely correct: it hands back the
  // record that holds the key and the version an update has to state, so the
  // caller corrects in place instead of minting a second id.
  assert.deepEqual(
    rerun.outcome === "conflict" &&
      rerun.diagnosticCode === "record.already_exists"
      ? rerun.currentVersions
      : {},
    { [personId]: 1 },
  );

  // The same name with no source key is still allowed. Two people can share a
  // name, and refusing that would have made the field a worse version of the
  // uniqueness rule it deliberately is not.
  assert.equal(create(secondPersonId, "ext-namesake").outcome, "success");

  // An Organization may hold the identical key: the claim is per kind.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("ext-org"),
        commandName: "relationship.organizationCreate",
        payload: {
          organizationId,
          spaceId: ids.space,
          name: "Softinet",
          relationshipState: "prospect" as const,
          externalId: "jamie:p-1",
        },
      }),
    ).outcome,
    "success",
  );

  // Stamping a record that predates the field is the supported path, because it
  // is how an existing graph acquires provenance at all.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("ext-stamp", { [secondPersonId]: 1 }),
        commandName: "relationship.personUpdate",
        payload: { personId: secondPersonId, externalId: "jamie:p-2" },
      }),
    ).outcome,
    "success",
  );

  // But re-pointing one is refused. Provenance that can be rewritten is not
  // provenance — a changed key silently re-attributes the record to a
  // different source row.
  const repointed = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("ext-repoint", { [secondPersonId]: 2 }),
      commandName: "relationship.personUpdate",
      payload: { personId: secondPersonId, externalId: "jamie:p-3" },
    }),
  );
  assert.equal(repointed.outcome, "rejected");
  assert.equal(
    repointed.outcome === "rejected" && repointed.diagnosticCode,
    "command.precondition_failed",
  );

  // Nor can an update take a key another record already holds.
  const stolen = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("ext-steal", { [secondPersonId]: 2 }),
      commandName: "relationship.personUpdate",
      payload: { personId: secondPersonId, externalId: "jamie:p-1" },
    }),
  );
  assert.equal(stolen.outcome, "rejected");

  // It reads back where an agent reconciles, not only in the store.
  const workspace = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "relationship.workspace",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    workspace.kind !== "query_result" ||
    workspace.result.outcome !== "success" ||
    workspace.result.projection.kind !== "relationship.workspace"
  )
    assert.fail("Expected relationship workspace");
  assert.deepEqual(
    workspace.result.projection.records
      .filter((record) => record.kind === "person" && record.id === personId)
      .map((record) =>
        record.kind === "person" ? record.externalId : undefined,
      ),
    ["jamie:p-1"],
  );
});

/**
 * The reason these exist as their own queries rather than a filter on the wide
 * read: `relationship.workspace` is one answer, so it is also one failure. A
 * single record a build cannot project faults the entire set — which is exactly
 * what happened on 0.1.5, and it took the enumeration of people with it. These
 * two carry one kind each, so the failure of another kind cannot reach them.
 */
it("enumerates one kind each, and answers the same shape as the wide read", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("list-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Enumeration",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const organizationId = uuid();
  const personId = uuid();
  for (const command of [
    {
      ...metadata("list-org"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId,
        spaceId: ids.space,
        name: "CAPTRAIN",
        relationshipState: "active" as const,
        externalId: "folder:captrain",
      },
    },
    {
      ...metadata("list-person"),
      commandName: "relationship.personCreate" as const,
      payload: {
        personId,
        spaceId: ids.space,
        name: "Rene Golembewski",
        organizationId,
        externalId: "jamie:rene",
      },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }

  const list = (queryName: "person.list" | "organization.list") => {
    const result = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName,
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space },
    });
    if (
      result.kind !== "query_result" ||
      result.result.outcome !== "success" ||
      result.result.projection.kind !== queryName
    )
      assert.fail(`Expected ${queryName}`);
    return result.result.projection.items;
  };

  // One kind each: the person list does not carry the organization, and the
  // organization list does not carry the person.
  assert.deepEqual(
    list("person.list").map((item) => item.id),
    [personId],
  );
  assert.deepEqual(
    list("organization.list").map((item) => item.id),
    [organizationId],
  );

  // The source key an import reconciles on reads back here, which is the whole
  // reason a migration calls this before it writes anyone.
  assert.equal(list("person.list")[0]?.externalId, "jamie:rene");
  assert.equal(list("organization.list")[0]?.externalId, "folder:captrain");

  // Same shape as the wide read, field for field — the two are one schema, so a
  // record read from either is written back the same way.
  const workspace = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "relationship.workspace",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    workspace.kind !== "query_result" ||
    workspace.result.outcome !== "success" ||
    workspace.result.projection.kind !== "relationship.workspace"
  )
    assert.fail("Expected relationship workspace");
  assert.deepEqual(
    list("person.list")[0],
    workspace.result.projection.records.find(
      (record) => record.id === personId,
    ),
  );

  // A removed record leaves both, through the same choke point every other
  // projection uses.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("list-person-remove", { [personId]: 1 }),
        commandName: "relationship.personRemove",
        payload: { personId },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(list("person.list"), []);
  assert.equal(list("organization.list").length, 1);
});

/**
 * Removal frees a source key on purpose — a source row whose record was removed
 * has to be importable again. The consequence is that putting the record back
 * is no longer unconditionally safe, and neither the undo nor its preview may
 * pretend otherwise: restoring on top of a re-import would leave two active
 * records of one kind in one Space holding one key, and the set-once rule then
 * refuses to re-point either, so the only way out would be deleting one.
 */
it("refuses to restore a record whose source key was claimed while it was gone", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("reclaim-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Reclaim",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const firstId = uuid();
  const secondId = uuid();
  const create = (personId: string, key: string) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key),
        commandName: "relationship.personCreate",
        payload: {
          personId,
          spaceId: ids.space,
          name: "Karina Szambelan",
          externalId: "jamie:p-1",
        },
      }),
    );
  assert.equal(create(firstId, "reclaim-first").outcome, "success");

  const removal = {
    ...metadata("reclaim-remove", { [firstId]: 1 }),
    commandName: "relationship.personRemove" as const,
    payload: { personId: firstId },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), removal)).outcome,
    "success",
  );

  // The key is free again, which is the behaviour we want.
  assert.equal(create(secondId, "reclaim-second").outcome, "success");

  // The preview has to say so before the undo is spent, not after.
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("reclaim-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: removal.commandId },
    }),
  );
  assert.equal(preview.outcome, "preview");
  assert.equal(
    preview.outcome === "preview" &&
      preview.projection.kind === "undo.previewed" &&
      preview.projection.available,
    false,
  );

  const undone = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("reclaim-undo", { [firstId]: 2 }),
      commandName: "command.undo",
      payload: { targetCommandId: removal.commandId },
    }),
  );
  // Refused as a conflict rather than a rejection: something else now holds
  // the thing this compensation needs, which is what `conflict` means here.
  assert.notEqual(undone.outcome, "success");

  // And the Space still holds exactly one active person for that key — the
  // invariant the refusal exists to keep.
  const people = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "person.list",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    people.kind !== "query_result" ||
    people.result.outcome !== "success" ||
    people.result.projection.kind !== "person.list"
  )
    assert.fail("Expected person.list");
  assert.deepEqual(
    people.result.projection.items
      .filter((item) => item.externalId === "jamie:p-1")
      .map((item) => item.id),
    [secondId],
  );
});

/**
 * The other half: undoing the update that stamped a key has to unstamp the
 * record. No command can clear provenance — that is the set-once rule — but a
 * compensation that left the key in place would report success while changing
 * nothing the caller can see, and the record would be permanently attributed to
 * a source row it was never imported from.
 */
it("unstamps a record when the update that stamped it is undone", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("unstamp-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Unstamp",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const personId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("unstamp-create"),
        commandName: "relationship.personCreate",
        payload: { personId, spaceId: ids.space, name: "Antek" },
      }),
    ).outcome,
    "success",
  );
  const stamp = {
    ...metadata("unstamp-stamp", { [personId]: 1 }),
    commandName: "relationship.personUpdate" as const,
    payload: { personId, externalId: "folder:antek" },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), stamp)).outcome,
    "success",
  );

  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("unstamp-undo", { [personId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: stamp.commandId },
      }),
    ).outcome,
    "success",
  );

  const record = harness.store.read((view) =>
    isApplicationWave2ReadView(view)
      ? view.getStrategicRecord(StrategicRecordIdSchema.parse(personId))
      : undefined,
  );
  assert.equal(
    record?.kind === "person" ? record.externalId : "still stamped",
    undefined,
  );

  // The key is free, so the row can be imported onto a different record.
  const otherId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("unstamp-reimport"),
        commandName: "relationship.personCreate",
        payload: {
          personId: otherId,
          spaceId: ids.space,
          name: "Antek",
          externalId: "folder:antek",
        },
      }),
    ).outcome,
    "success",
  );
});

it("names every record that rests on a Source, and names the same ones the refusal does", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const organizationId = uuid();
  const opportunityId = uuid();
  const projectId = uuid();
  const documentId = uuid();
  const taskId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("refs-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Evidence graph",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  // Routed from a managed Capture rather than declared, because the Task reach
  // is the one that will not take any other kind: `task.updateDetails` accepts
  // an attachment only when the Source is backed by a managed file.
  const submitted = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("refs-capture"),
      commandName: "capture.submit",
      payload: {
        spaceId: ids.space,
        original: {
          kind: "managed_file" as const,
          payload: {
            payloadId: uuid(),
            displayName: "protokol.pdf",
            mediaType: "application/pdf",
            byteLength: 2048,
            contentSha256: "cd".repeat(32),
            custodyState: "available" as const,
          },
        },
        deviceId: "refs-device",
        source: "in_app_quick_capture" as const,
      },
    }),
  );
  if (
    submitted.outcome !== "success" ||
    submitted.projection.kind !== "capture.stored"
  )
    assert.fail("Expected a managed Capture.");
  const routed = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("refs-route", {
        [submitted.projection.captureId]: submitted.projection.version,
      }),
      commandName: "capture.process",
      payload: {
        captureId: submitted.projection.captureId,
        destination: "knowledge_source",
      },
    }),
  );
  if (
    routed.outcome !== "success" ||
    routed.projection.kind !== "capture.routed_as_knowledge_source"
  )
    assert.fail("Expected a file Knowledge Source.");
  const sourceId = routed.projection.sourceId;
  for (const command of [
    {
      ...metadata("refs-organization"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId,
        spaceId: ids.space,
        name: "Klient",
        relationshipState: "active" as const,
      },
    },
    // One reference from each reach the guard reads. All four have to appear,
    // and the fixture is built so that dropping any single arm changes the
    // answer — a shared record would let the assertion pass on someone else's
    // reference.
    {
      ...metadata("refs-opportunity"),
      commandName: "opportunity.create" as const,
      payload: {
        opportunityId,
        spaceId: ids.space,
        title: "Odnowienie",
        organizationId,
        personIds: [],
        need: "Licencja wygasa.",
        qualification: "Budżet potwierdzony.",
        stage: "qualified",
        nextAction: "Wyślij ofertę.",
        evidenceSourceIds: [sourceId],
      },
    },
    {
      ...metadata("refs-project"),
      commandName: "project.create" as const,
      payload: {
        projectId,
        spaceId: ids.space,
        title: "Wdrożenie",
        intendedOutcome: "Działający pilotaż.",
        evidenceSourceIds: [sourceId],
      },
    },
    {
      ...metadata("refs-document"),
      commandName: "document.create" as const,
      payload: {
        documentId,
        spaceId: ids.space,
        title: "Notatka z ustaleń",
        role: "note" as const,
      },
    },
    {
      ...metadata("refs-document-evidence", {
        [documentId]: 1,
        [sourceId]: 1,
      }),
      commandName: "knowledge.documentSetEvidence" as const,
      payload: { documentId, sourceIds: [sourceId], noteDocumentIds: [] },
    },
    {
      ...metadata("refs-task"),
      commandName: "task.create" as const,
      payload: { taskId, spaceId: ids.space, title: "Sprawdź rozbieżność" },
    },
    {
      ...metadata("refs-task-attachment", { [taskId]: 1, [sourceId]: 1 }),
      commandName: "task.updateDetails" as const,
      payload: { taskId, attachmentSourceIds: [sourceId] },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
      command.commandName,
    );
  }

  const listed = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "knowledge.list",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    listed.kind !== "query_result" ||
    listed.result.outcome !== "success" ||
    listed.result.projection.kind !== "knowledge.list"
  )
    assert.fail("Expected the knowledge list.");
  const source = listed.result.projection.sources.find(
    (item) => item.id === sourceId,
  );
  assert.equal(source?.referencedByCount, 4);
  assert.deepEqual(
    source?.referencedBy.map((reference) => [
      reference.recordKind,
      reference.recordId,
      reference.title,
    ]),
    [
      ["strategicRecord", opportunityId, "Odnowienie"],
      ["document", documentId, "Notatka z ustaleń"],
      ["task", taskId, "Sprawdź rozbieżność"],
      ["project", projectId, "Wdrożenie"],
    ],
  );
  assert.equal(source?.referencedBy[0]?.recordType, "opportunity");

  // The point of the field, and the reason it is not a second enumeration: a
  // reader told "nothing references me" and then met `record.still_referenced`
  // would have no way to find what it missed. This assertion holds by
  // construction while the guard delegates to the same helper — which is what
  // it is here to pin. The list above is what proves the helper right; this is
  // what catches someone re-inlining a second, divergent enumeration.
  const refused = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("refs-source-remove", { [sourceId]: 1 }),
      commandName: "knowledge.sourceRemove",
      payload: { sourceId },
    }),
  );
  if (
    refused.outcome !== "rejected" ||
    refused.diagnosticCode !== "record.still_referenced"
  )
    assert.fail("Expected the removal to be refused.");
  assert.equal(refused.blockedByCount, source?.referencedByCount);
  assert.deepEqual(
    refused.blockedBy.map((blocker) => blocker.recordId),
    source?.referencedBy.map((reference) => reference.recordId),
  );

  // A Source nothing rests on says so, rather than omitting the field: absent
  // and empty would be the same statement, and only one of them is true.
  const freeSourceId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("refs-free-source"),
        commandName: "knowledge.sourceCreate",
        payload: {
          sourceId: freeSourceId,
          spaceId: ids.space,
          sourceKind: "url" as const,
          title: "Nieużywane",
          canonicalUrl: "https://example.invalid/nieuzywane",
          availability: "available" as const,
          observedAt: "2026-07-12T09:00:00.000Z",
        },
      }),
    ).outcome,
    "success",
  );
  const reread = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "knowledge.list",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    reread.kind !== "query_result" ||
    reread.result.outcome !== "success" ||
    reread.result.projection.kind !== "knowledge.list"
  )
    assert.fail("Expected the knowledge list.");
  const free = reread.result.projection.sources.find(
    (item) => item.id === freeSourceId,
  );
  assert.deepEqual(free?.referencedBy, []);
  assert.equal(free?.referencedByCount, 0);
});

/**
 * A deal imported from a pipeline sheet needs the same re-run protection a
 * Person and an Organization have — titles collide across clients and across
 * years, so nothing else tells a second import apart from a second deal. The
 * whole recovery machinery is walked here, not just the create: a key with an
 * invariant that only the create honours produces two live records holding one
 * key the first time an undo runs, and the set-once rule then refuses to repair
 * either.
 */
it("claims a source row for a deal, frees it on removal, and refuses to take it back", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const organizationId = uuid();
  for (const command of [
    {
      ...metadata("deal-key-bootstrap"),
      commandName: "workspace.createLocal" as const,
      payload: {
        workspaceId: ids.workspace,
        rootSpaceId: ids.space,
        ownerPrincipalId: ids.principal,
        name: "Deal keys",
        timezone: "Europe/Warsaw",
      },
    },
    {
      ...metadata("deal-key-organization"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId,
        spaceId: ids.space,
        name: "Klient",
        relationshipState: "active" as const,
        // The same key on another kind, to prove the claim is scoped by kind:
        // a Person and a deal come from different source systems and the row
        // that produced each is its own.
        externalId: "sheet:row-7",
      },
    },
  ])
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
      command.commandName,
    );

  const firstId = uuid();
  const secondId = uuid();
  const create = (opportunityId: string, key: string) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key),
        commandName: "opportunity.create",
        payload: {
          opportunityId,
          spaceId: ids.space,
          title: "Odnowienie 2026",
          organizationId,
          personIds: [],
          need: "Licencja wygasa.",
          qualification: "Budżet potwierdzony.",
          stage: "qualified",
          nextAction: "Wyślij ofertę.",
          evidenceSourceIds: [],
          externalId: "sheet:row-7",
        },
      }),
    );
  const first = create(firstId, "deal-key-first");
  assert.equal(first.outcome, "success", JSON.stringify(first));

  // A second import of the same row under a fresh id is refused, and the
  // refusal hands back what holds the key so the caller can act on it.
  const duplicate = create(secondId, "deal-key-duplicate");
  if (
    duplicate.outcome !== "conflict" ||
    duplicate.diagnosticCode !== "record.already_exists"
  )
    assert.fail("Expected the claimed source row to be named.");
  assert.deepEqual(duplicate.currentVersions, { [firstId]: 1 });

  const removal = {
    ...metadata("deal-key-remove", { [firstId]: 1 }),
    commandName: "opportunity.remove" as const,
    payload: { opportunityId: firstId },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), removal)).outcome,
    "success",
  );
  // Removal frees the key, deliberately: a source row whose record was removed
  // has to be importable again.
  assert.equal(create(secondId, "deal-key-reimport").outcome, "success");

  // Which makes the undo of that removal infeasible, and the preview has to
  // say so before the undo is spent rather than after.
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-key-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: removal.commandId },
    }),
  );
  assert.equal(
    preview.outcome === "preview" &&
      preview.projection.kind === "undo.previewed" &&
      preview.projection.available,
    false,
  );
  assert.notEqual(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("deal-key-undo", { [firstId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: removal.commandId },
      }),
    ).outcome,
    "success",
  );

  // One active deal for that key, and the Organization that shares the string
  // is untouched — the invariant the refusals exist to keep.
  const read = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "relationship.workspace",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    read.kind !== "query_result" ||
    read.result.outcome !== "success" ||
    read.result.projection.kind !== "relationship.workspace"
  )
    assert.fail("Expected the workspace read.");
  assert.deepEqual(
    read.result.projection.records
      .filter(
        (record) =>
          (record.kind === "opportunity" || record.kind === "organization") &&
          record.externalId === "sheet:row-7",
      )
      .map((record) => record.id)
      .sort(),
    [organizationId, secondId].sort(),
  );
});

/**
 * The same walk for a Project, which is not a strategic record: its own table,
 * its own finder, and a removal/restore family (`record.restore_record_state`)
 * that shares no code with the strategic one. Every link of the chain is
 * exercised because a key whose invariant only the create honours produces two
 * live records under one key the first time an undo runs.
 */
it("claims a source row for a delivery, and refuses to restore one whose key was taken", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const personId = uuid();
  for (const command of [
    {
      ...metadata("delivery-key-bootstrap"),
      commandName: "workspace.createLocal" as const,
      payload: {
        workspaceId: ids.workspace,
        rootSpaceId: ids.space,
        ownerPrincipalId: ids.principal,
        name: "Delivery keys",
        timezone: "Europe/Warsaw",
      },
    },
    {
      // A Person holding the same string, to pin the scope: a Project lives in
      // its own table and comes from its own source system, so this is two
      // rows from two places rather than a collision.
      ...metadata("delivery-key-person"),
      commandName: "relationship.personCreate" as const,
      payload: {
        personId,
        spaceId: ids.space,
        name: "Karina",
        externalId: "folder:wdrozenie-2026",
      },
    },
  ])
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
      command.commandName,
    );

  const firstId = uuid();
  const secondId = uuid();
  const create = (projectId: string, key: string) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key),
        commandName: "project.create",
        payload: {
          projectId,
          spaceId: ids.space,
          title: "Wdrożenie 2026",
          intendedOutcome: "Działający pilotaż.",
          externalId: "folder:wdrozenie-2026",
        },
      }),
    );
  assert.equal(create(firstId, "delivery-key-first").outcome, "success");

  const duplicate = create(secondId, "delivery-key-duplicate");
  if (
    duplicate.outcome !== "conflict" ||
    duplicate.diagnosticCode !== "record.already_exists"
  )
    assert.fail("Expected the claimed source row to be named.");
  assert.deepEqual(duplicate.currentVersions, { [firstId]: 1 });

  const removal = {
    ...metadata("delivery-key-remove", { [firstId]: 1 }),
    commandName: "project.remove" as const,
    payload: { projectId: firstId },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), removal)).outcome,
    "success",
  );
  assert.equal(create(secondId, "delivery-key-reimport").outcome, "success");

  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("delivery-key-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: removal.commandId },
    }),
  );
  if (
    preview.outcome !== "preview" ||
    preview.projection.kind !== "undo.previewed"
  )
    assert.fail("Expected an undo preview.");
  assert.equal(preview.projection.available, false);
  assert.equal(preview.projection.unavailableReason, "still_referenced");
  assert.notEqual(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("delivery-key-undo", { [firstId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: removal.commandId },
      }),
    ).outcome,
    "success",
  );

  // One active delivery for that key, and the set-level read carries it, so a
  // migration recognises what it already imported without writing anything.
  const listed = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "project.list",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    listed.kind !== "query_result" ||
    listed.result.outcome !== "success" ||
    listed.result.projection.kind !== "project.list"
  )
    assert.fail("Expected the project list.");
  assert.deepEqual(
    listed.result.projection.items
      .filter((item) => item.externalId === "folder:wdrozenie-2026")
      .map((item) => item.id),
    [secondId],
  );
  // And the Person keeping the same string is untouched by any of it.
  const people = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "person.list",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space },
  });
  if (
    people.kind !== "query_result" ||
    people.result.outcome !== "success" ||
    people.result.projection.kind !== "person.list"
  )
    assert.fail("Expected person.list");
  assert.deepEqual(
    people.result.projection.items
      .filter((item) => item.externalId === "folder:wdrozenie-2026")
      .map((item) => item.id),
    [personId],
  );
});
