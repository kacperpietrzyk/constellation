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
  StrategicRecordProjectionSchema,
  convertMoney,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";
import { strategicRecordIsDeleted } from "@constellation/domain";

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
      "opportunity.update",
      "opportunity.offerCreate",
      "opportunity.offerUpdate",
      "opportunity.linkOutcomes",
      "workspace.setCommercialDefaults",
      "workspace.bootstrapContext",
      "relationship.workspace",
      "person.list",
      "organization.list",
      "project.operationalOverview",
      "organization.operationalOverview",
      "relationship.renewalCreate",
      "relationship.renewalUpdate",
      "relationship.renewalResolve",
      "attention.inbox",
      "relationship.factCreate",
      "decision.create",
      "decision.update",
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

it("carries a table view and the two grouping keys the record does not hold", () => {
  // Nothing in the type system sees a widened enum VALUE: `UnprojectableKeys`
  // compares key sets, and `relationship.workspace` spreads the raw record
  // into an untyped projection that is then parsed strictly. So "table",
  // "assignee" and "project" each need a round trip through BOTH saved-view
  // projections, or the widening builds clean and throws on read.
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("table-bootstrap"),
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
    return result.result.projection;
  };
  const projectedView = () => {
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
    const record = result.result.projection.records.find(
      (candidate) => candidate.kind === "saved_view",
    );
    return record?.kind === "saved_view" ? record : undefined;
  };

  // Wersje CZYTAMY, nie wpisujemy: `record.relate` dokłada rekord relacji
  // i podbija wersję zadania, więc liczba wpisana z palca opisuje stan
  // z połowy tego przypadku, a nie stan bieżący — i cała asercja pada na
  // `conflict`, komunikatem bez związku z tym, co sprawdza.
  const taskVersion = (taskId: string) =>
    overview().tasks.find((task) => task.id === taskId)?.version ?? 1;
  const savedViewVersion = () => overview().savedViews[0]?.version ?? 1;

  // A board without grouping has no columns and is refused; a table without
  // grouping is the ordinary case. Copying the board branch would pass every
  // other assertion in this file while making the commonest table view
  // uncreatable, so the acceptance is pinned here.
  const savedViewId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("table-view-create"),
        commandName: "savedView.create",
        payload: {
          savedViewId,
          spaceId: ids.space,
          name: "Wszystkie zadania",
          filters: {},
          sort: "updated_desc",
          layout: "table",
        },
      }),
    ).outcome,
    "success",
    "a table needs no grouping, unlike a board",
  );
  assert.equal(overview().savedViews[0]?.layout, "table");
  assert.equal(
    projectedView()?.layout,
    "table",
    "the strict relationship projection accepts the widened layout too",
  );
  assert.equal(
    overview().savedViews[0]?.groupBy,
    undefined,
    "an accepted table view really was stored ungrouped",
  );

  const twoProjectTaskId = uuid();
  const noProjectTaskId = uuid();
  const firstProjectId = uuid();
  const secondProjectId = uuid();
  for (const [key, taskId, title] of [
    ["table-task-a", twoProjectTaskId, "Zadanie w dwóch projektach"],
    ["table-task-b", noProjectTaskId, "Zadanie bez projektu"],
  ] as const)
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(key),
          commandName: "task.create",
          payload: { taskId, spaceId: ids.space, title },
        }),
      ).outcome,
      "success",
    );
  for (const [key, projectId, title] of [
    ["table-project-a", firstProjectId, "Wdrożenie"],
    ["table-project-b", secondProjectId, "Utrzymanie"],
  ] as const)
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(key),
          commandName: "project.create",
          payload: { projectId, spaceId: ids.space, title },
        }),
      ).outcome,
      "success",
    );
  for (const [key, projectId] of [
    ["table-relate-a", firstProjectId],
    ["table-relate-b", secondProjectId],
  ] as const)
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          // `record.relate` żąda DOKŁADNEJ wersji obu końców, a pierwsze
          // powiązanie podbija wersję zadania — więc drugie z pustymi
          // oczekiwaniami dostaje `conflict`. Czytamy wersję zamiast ją
          // zakładać.
          ...metadata(key, {
            [twoProjectTaskId]: taskVersion(twoProjectTaskId),
            [projectId]: 1,
          }),
          commandName: "record.relate",
          payload: {
            relationType: "task_contributes_to_project",
            taskId: twoProjectTaskId,
            projectId,
          },
        }),
      ).outcome,
      "success",
    );

  // `record.relate` guards pair-uniqueness only, so one task legitimately
  // contributes to several deliveries. The projection carries all of them —
  // grouping by project then lists that task under each — and Task has no
  // projection guard, so a mapper that never ran would show every task with an
  // empty list and nothing would fail.
  const projectIdsFor = (taskId: string) =>
    overview().tasks.find((task) => task.id === taskId)?.projectIds;
  assert.deepEqual(
    [...(projectIdsFor(twoProjectTaskId) ?? [])].sort(),
    [firstProjectId, secondProjectId].sort(),
    "both memberships reach the projection, not just the first",
  );
  assert.deepEqual(
    projectIdsFor(noProjectTaskId),
    [],
    "no membership is an empty list, which is the No project group",
  );

  // NIEZAASERTOWANE, świadomie i z powodem: że projekcja patrzy na relacje
  // AKTYWNE, a nie na wszystkie, jakie kiedykolwiek istniały, dałoby się
  // pokazać wyłącznie przez `record.unrelate` — a ta komenda bierze
  // IDENTYFIKATOR relacji, którego żadne zapytanie nie wystawia. Z zewnątrz
  // kernela nie ma więc czym w to celować. Zostaje to nazwane tutaj, żeby nie
  // wyglądało na przeoczenie; zniknie razem z pierwszym zapytaniem, które
  // wystawi rekordy relacji.

  for (const [key, groupBy] of [
    ["table-group-assignee", "assignee"],
    ["table-group-project", "project"],
  ] as const) {
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(key, { [savedViewId]: savedViewVersion() }),
          commandName: "savedView.update",
          payload: { savedViewId, groupBy },
        }),
      ).outcome,
      "success",
      `${groupBy} grouping is not mistaken for a field definition`,
    );
    assert.equal(overview().savedViews[0]?.groupBy, groupBy);
    assert.equal(
      projectedView()?.groupBy,
      groupBy,
      `${groupBy} survives the strict relationship projection`,
    );
  }

  // The undo descriptor restates both unions a second time. The compiler does
  // reach that restatement, but not the compensation itself: this proves the
  // widened value survives being written into a descriptor and read back out.
  const layoutCommand = {
    ...metadata("table-layout-board", { [savedViewId]: savedViewVersion() }),
    commandName: "savedView.update" as const,
    payload: { savedViewId, layout: "board" as const },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), layoutCommand)).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("table-layout-undo", { [savedViewId]: savedViewVersion() }),
        commandName: "command.undo",
        payload: { targetCommandId: layoutCommand.commandId },
      }),
    ).diagnosticCode,
    "command.undone",
  );
  assert.equal(
    overview().savedViews[0]?.layout,
    "table",
    "undo restores a table layout the descriptor had to be able to hold",
  );
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
  // The Private Space above, and only it. Without this number the sweep's
  // answer would be the same whether that Space held nothing or held work this
  // caller may not touch — the count says the view was partial, and stays a
  // count because naming the Space would say what is in a Space the caller
  // cannot open.
  assert.equal(swept.projection.skippedSpaceCount, 1);

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
  // Reserving an hour on a task nobody had given a day IS planning it — the
  // block carries the date. Without this the app said "not planned" about work
  // it was itself holding an hour for, in three places at once, and the third
  // plan state ("time reserved") was unreachable by this gesture at all.
  assert.equal(taskOf().startAt, block.startsAt);
  // Whoever reserved the hour founded the plan, so the plan is signed by them.
  assert.equal(taskOf().plannedBy?.principalId, ids.principal);

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
  // Letting the hour go is not un-deciding the day. Clearing `startAt` here
  // would delete a decision this gesture never made — taking the COMMAND back
  // is a different thing, and it travels by the undo descriptor.
  assert.equal(taskOf().startAt, block.startsAt);

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

it("reserving an hour never moves a day somebody already chose", () => {
  // The other side of the rule above. A block founds a plan where there is
  // none; where there IS one it stays out of the way, because the day was
  // somebody's decision and an hour reserved elsewhere is a contradiction to
  // SHOW a person, not one to resolve behind their back.
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("keep-bootstrap"),
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
  const chosenDay = "2026-07-20T06:00:00.000Z";
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("keep-task"),
        commandName: "task.create",
        payload: {
          taskId,
          spaceId: ids.space,
          title: "Draft the migration plan",
          startAt: chosenDay,
        },
      }),
    ).outcome,
    "success",
  );
  const taskOf = () =>
    harness.store.snapshot().tasks.find((t) => t.id === taskId)!;
  const plannedBefore = taskOf().plannedBy;

  const block = {
    ownedBlockExternalId: "block-keep",
    calendarExternalId: "calendar-1",
    revision: "rev-1",
    startsAt: "2026-07-22T09:00:00.000Z",
    endsAt: "2026-07-22T11:00:00.000Z",
  };
  const reserved = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("keep-block", { [taskId]: taskOf().version }),
      commandName: "task.setCalendarBlock",
      payload: { taskId, block },
    }),
  );
  assert.equal(reserved.outcome, "success");
  assert.deepEqual(taskOf().calendarBlock, block);
  assert.equal(
    taskOf().startAt,
    chosenDay,
    "reserving time overwrote a day that was chosen deliberately",
  );
  // Authorship follows the plan, and the plan did not change hands.
  assert.deepEqual(taskOf().plannedBy, plannedBefore);

  // And taking the reservation back leaves that day alone: undo removes what
  // the command added, and this command added no plan.
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("keep-undo-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: reserved.commandId },
    }),
  );
  if (preview.outcome !== "preview") assert.fail("Expected an undo preview");
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("keep-undo", preview.projection.requiredVersions),
        commandName: "command.undo",
        payload: { targetCommandId: reserved.commandId },
      }),
    ).outcome,
    "success",
  );
  assert.equal(taskOf().calendarBlock, undefined);
  assert.equal(
    taskOf().startAt,
    chosenDay,
    "undoing a reservation deleted a plan it never made",
  );
});

it("taking back the hour that founded a plan takes the plan with it", () => {
  // The reservation put the task on a day, so undoing it must leave no day
  // behind — otherwise a command that is taken back keeps half of what it did,
  // and the task reads as planned by a gesture that no longer exists.
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("drop-bootstrap"),
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
        ...metadata("drop-task"),
        commandName: "task.create",
        payload: { taskId, spaceId: ids.space, title: "Unplanned work" },
      }),
    ).outcome,
    "success",
  );
  const taskOf = () =>
    harness.store.snapshot().tasks.find((t) => t.id === taskId)!;
  assert.equal(taskOf().startAt, undefined);

  const block = {
    ownedBlockExternalId: "block-drop",
    calendarExternalId: "calendar-1",
    revision: "rev-1",
    startsAt: "2026-07-22T09:00:00.000Z",
    endsAt: "2026-07-22T11:00:00.000Z",
  };
  const reserved = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("drop-block", { [taskId]: taskOf().version }),
      commandName: "task.setCalendarBlock",
      payload: { taskId, block },
    }),
  );
  assert.equal(reserved.outcome, "success");
  assert.equal(taskOf().startAt, block.startsAt);
  assert.notEqual(taskOf().plannedBy, undefined);

  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("drop-undo-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: reserved.commandId },
    }),
  );
  if (preview.outcome !== "preview") assert.fail("Expected an undo preview");
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("drop-undo", preview.projection.requiredVersions),
        commandName: "command.undo",
        payload: { targetCommandId: reserved.commandId },
      }),
    ).outcome,
    "success",
  );
  assert.equal(taskOf().calendarBlock, undefined);
  assert.equal(
    taskOf().startAt,
    undefined,
    "undo kept the day the reservation invented",
  );
  // The signature lives exactly as long as the plan does.
  assert.equal(taskOf().plannedBy, undefined);
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

  // And the *set-level* reads let go of it too, which the narrow reader above
  // cannot prove. Both queries used to hand the removed link back alongside the
  // live ones with nothing but `state` to tell them apart, because the store's
  // list filters `recordState` and a work link is removed onto its own axis. A
  // consumer that trusted the list read a detached client as an attached one.
  const workLinkIdsFrom = (
    queryName: "relationship.workspace" | "work.overview",
  ): readonly string[] => {
    const answer = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName,
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space },
    });
    if (answer.kind !== "query_result" || answer.result.outcome !== "success")
      assert.fail(`Expected ${queryName} to answer`);
    const projection = answer.result.projection;
    if (projection.kind === "relationship.workspace")
      return projection.records
        .filter(
          (record): record is typeof record & { readonly id: string } =>
            (record as { readonly kind?: unknown }).kind === "work_link",
        )
        .map((record) => record.id);
    if (projection.kind === "work.overview")
      return projection.links.map((link) => link.id);
    return assert.fail(`Unexpected projection for ${queryName}`);
  };
  assert.deepEqual(workLinkIdsFrom("relationship.workspace"), []);
  assert.deepEqual(workLinkIdsFrom("work.overview"), []);

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

/**
 * The cap is stated twice — once as the array bound in the projection schema,
 * once as the slice the kernel takes — and `querySuccess` parses strictly on
 * the way out, so the two drifting apart would fault the whole read rather than
 * degrade it. That is the shape of the outage this branch opened with, so the
 * boundary is exercised rather than trusted: this fixture holds one more
 * reference than the sample carries.
 */
it("cuts a Source's references to the sample the refusal uses, and states the real total", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  const sourceId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("cap-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Reference cap",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("cap-source"),
        commandName: "knowledge.sourceCreate",
        payload: {
          sourceId,
          spaceId: ids.space,
          sourceKind: "excerpt" as const,
          title: "Cytowane wszędzie",
          availability: "available" as const,
          observedAt: "2026-07-12T09:00:00.000Z",
        },
      }),
    ).outcome,
    "success",
  );
  const total = 21;
  for (let index = 0; index < total; index += 1)
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(`cap-project-${index}`),
          commandName: "project.create",
          payload: {
            projectId: uuid(),
            spaceId: ids.space,
            title: `Projekt ${index}`,
            evidenceSourceIds: [sourceId],
          },
        }),
      ).outcome,
      "success",
    );

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
  assert.equal(source?.referencedBy.length, 20);
  assert.equal(source?.referencedByCount, total);

  // The refusal cuts to the same number and states the same total, because it
  // is the same constant and the same enumeration.
  const refused = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("cap-source-remove", { [sourceId]: 1 }),
      commandName: "knowledge.sourceRemove",
      payload: { sourceId },
    }),
  );
  if (
    refused.outcome !== "rejected" ||
    refused.diagnosticCode !== "record.still_referenced"
  )
    assert.fail("Expected the removal to be refused.");
  assert.equal(refused.blockedBy.length, source?.referencedBy.length);
  assert.equal(refused.blockedByCount, total);
});

/**
 * The drift guard behind the filter the two set-level reads now apply.
 *
 * Deletion lives on two axes: `recordState`, shared by every strategic record,
 * and a per-kind `state` for the two kinds that predate it — a work link is
 * `removed`, a Saved View is `deleted`. The reading that hides a dead record
 * from a set is written against the *value*, so a kind that later names its
 * deletion the same way is covered without anyone remembering to.
 *
 * What this asserts is the correspondence itself, read out of the projection
 * schema rather than out of a list kept by hand: every kind whose state
 * vocabulary contains a deletion word is hidden when it holds it, and every
 * other state a kind can be in — `archived`, `closed`, `lost`, `superseded` —
 * leaves the record visible, because those are lifecycles and not deletions.
 * A kind that invents a *third* word for deletion still needs a person; this
 * test is what makes that omission fail loudly rather than leak a dead edge.
 */
it("hides a strategic record on either deletion axis, and nothing else", () => {
  const base = {
    id: ids.workspace,
    workspaceId: ids.workspace,
    spaceId: ids.space,
    createdBy: ids.principal,
    version: 1,
    createdAt: "2026-07-26T09:00:00.000Z",
    updatedAt: "2026-07-26T09:00:00.000Z",
  } as const;
  const states = (option: unknown): readonly string[] => {
    const shape = (option as { readonly shape?: Record<string, unknown> })
      .shape;
    const state = shape?.["state"] as
      { readonly options?: unknown } | undefined;
    return Array.isArray(state?.options)
      ? (state.options as readonly string[])
      : [];
  };
  const kindOf = (option: unknown): string =>
    ((option as { readonly shape: Record<string, { readonly value: string }> })
      .shape["kind"]?.value ?? "") as string;
  const deleting = new Set(["removed", "deleted"]);
  let sawDeletionState = false;
  let sawLifecycleState = false;
  for (const option of StrategicRecordProjectionSchema.options) {
    const kind = kindOf(option);
    for (const state of states(option)) {
      const record = { ...base, kind, state } as never;
      const expected = deleting.has(state);
      if (expected) sawDeletionState = true;
      else sawLifecycleState = true;
      assert.equal(
        strategicRecordIsDeleted(record),
        expected,
        `${kind}.state = ${state}`,
      );
    }
    // The shared axis answers the same way for every kind, whatever its own
    // state says — a removed Organization is gone even though `state` on the
    // kinds that have one never says so.
    const [first] = states(option);
    const shared = {
      ...base,
      kind,
      ...(first === undefined ? {} : { state: first }),
      recordState: "removed",
    } as never;
    assert.equal(strategicRecordIsDeleted(shared), true, `${kind}.recordState`);
  }
  // Both halves have to have been exercised, or the loop above proves nothing.
  assert.equal(sawDeletionState, true);
  assert.equal(sawLifecycleState, true);
});

/**
 * Until this command existed a deal was frozen from creation to removal: no
 * command carried `stage`, `need`, `qualification`, the owner or the next
 * action, so a Pipeline board could show columns nobody could move a card
 * between.
 */
const dealHarness = (
  key: string,
): {
  readonly harness: ReferenceHarness;
  readonly organizationId: string;
  readonly personId: string;
  readonly opportunityId: string;
} => {
  const harness = removalHarness(key);
  const organizationId = createOrganization(harness, key);
  const personId = createPerson(harness, key, organizationId);
  const opportunityId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(`${key}-opportunity`),
        commandName: "opportunity.create",
        payload: {
          opportunityId,
          spaceId: ids.space,
          title: "Orbit monitoring extension",
          organizationId,
          personIds: [personId],
          need: "Out-of-hours detection.",
          qualification: "Sponsor named, budget unconfirmed.",
          stage: "discovery",
          nextAction: "Send the night-cover variant.",
          evidenceSourceIds: [],
        },
      }),
    ).outcome,
    "success",
  );
  return { harness, organizationId, personId, opportunityId };
};

const dealFromWorkspace = (
  harness: ReferenceHarness,
  opportunityId: string,
): Extract<
  ReturnType<typeof projectedRecords>[number],
  { kind: "opportunity" }
> => {
  const record = projectedRecords(harness).find(
    (candidate) =>
      candidate.kind === "opportunity" && candidate.id === opportunityId,
  );
  if (record === undefined || record.kind !== "opportunity")
    assert.fail("Expected the opportunity in relationship.workspace.");
  return record;
};

const projectedRecords = (harness: ReferenceHarness) => {
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
  return workspace.result.projection.records;
};

const dealFromOverview = (
  harness: ReferenceHarness,
  organizationId: string,
  opportunityId: string,
) => {
  const overview = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "organization.operationalOverview",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, organizationId },
  });
  if (
    overview.kind !== "query_result" ||
    overview.result.outcome !== "success" ||
    overview.result.projection.kind !== "organization.operationalOverview"
  )
    assert.fail("Expected Organization overview");
  const deal = overview.result.projection.opportunities.find(
    (candidate) => candidate.id === opportunityId,
  );
  if (deal === undefined) assert.fail("Expected the deal on its own client.");
  return deal;
};

it("moves a deal between stages and corrects one field without touching the rest", () => {
  const { harness, organizationId, opportunityId } = dealHarness("deal-update");

  const created = dealFromWorkspace(harness, opportunityId);
  assert.ok(
    created.stageEnteredAt,
    "a deal is stamped with its stage entry at creation, not only when it first moves",
  );

  // ONE field. Everything the payload did not name has to stand exactly where
  // it was — the absent-means-leave-alone contract, as against the
  // absent-means-clear convention `updateProjectOutcome` uses.
  const moved = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-update-stage", { [opportunityId]: 1 }),
      commandName: "opportunity.update",
      payload: { opportunityId, stage: "proposal" },
    }),
  );
  assert.equal(moved.diagnosticCode, "strategic.record_changed");

  const afterMove = dealFromWorkspace(harness, opportunityId);
  assert.equal(afterMove.stage, "proposal");
  assert.equal(
    afterMove.need,
    "Out-of-hours detection.",
    "a field the payload never named is left alone",
  );
  assert.equal(afterMove.qualification, "Sponsor named, budget unconfirmed.");
  assert.equal(afterMove.title, "Orbit monitoring extension");
  assert.notEqual(
    afterMove.stageEnteredAt,
    created.stageEnteredAt,
    "moving the stage re-stamps when the deal entered it",
  );

  // The second projection home restates the opportunity by hand, so this is the
  // assertion that catches a field which satisfied the compile guard and
  // reached the client's own screen not at all.
  assert.equal(
    dealFromOverview(harness, organizationId, opportunityId).stageEnteredAt,
    afterMove.stageEnteredAt,
    "and the stamp reaches organization.operationalOverview, the second home",
  );

  // Re-sending the stage the deal already stands in must not restart the clock:
  // a screen writing a whole form back would otherwise erase the number.
  const stamped = afterMove.stageEnteredAt;
  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-update-same-stage", { [opportunityId]: 2 }),
      commandName: "opportunity.update",
      payload: { opportunityId, stage: "proposal", need: "Night cover." },
    }),
  );
  const afterRestate = dealFromWorkspace(harness, opportunityId);
  assert.equal(afterRestate.need, "Night cover.");
  assert.equal(
    afterRestate.stageEnteredAt,
    stamped,
    "re-sending the same stage leaves the entry moment where it was",
  );
});

it("refuses to move a deal into a stage the workspace funnel does not list", () => {
  const { harness, organizationId, opportunityId } =
    dealHarness("deal-stage-guard");

  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-stage-guard-stages", { [ids.workspace]: 1 }),
      commandName: "workspace.setCommercialDefaults",
      payload: {
        stages: [
          { id: "discovery", label: "Discovery", order: 0 },
          { id: "proposal", label: "Proposal", order: 1 },
        ],
      },
    }),
  );

  const refused = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-stage-guard-move", { [opportunityId]: 1 }),
      commandName: "opportunity.update",
      payload: { opportunityId, stage: "negotiation" },
    }),
  );
  assert.equal(
    refused.diagnosticCode,
    "command.precondition_failed",
    "a stage nobody configured is not a column this board has",
  );
  assert.equal(
    dealFromWorkspace(harness, opportunityId).stage,
    "discovery",
    "and the refusal left the deal where it stood",
  );

  // Standing on a retired stage is NOT refused, and this is the half that keeps
  // boot alive: reads are strict and stored payloads are never revalidated, so
  // a read side narrowed to the configured set would make the deal unreadable
  // and take the whole `relationship.workspace` answer down with it.
  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-stage-guard-retire", { [ids.workspace]: 2 }),
      commandName: "workspace.setCommercialDefaults",
      payload: {
        stages: [{ id: "proposal", label: "Proposal", order: 0 }],
      },
    }),
  );
  assert.equal(
    dealFromWorkspace(harness, opportunityId).stage,
    "discovery",
    "the orphaned stage projects unchanged rather than being remapped or hidden",
  );
  assert.equal(
    dealFromOverview(harness, organizationId, opportunityId).stage,
    "discovery",
    "through both projection homes",
  );
});

it("takes back an opportunity update, including the stamp it added", () => {
  const { harness, personId, opportunityId } = dealHarness("deal-undo");
  const originalStamp = dealFromWorkspace(
    harness,
    opportunityId,
  ).stageEnteredAt;

  const update = {
    ...metadata("deal-undo-update", { [opportunityId]: 1 }),
    commandName: "opportunity.update" as const,
    payload: {
      opportunityId,
      stage: "proposal",
      title: "Orbit monitoring extension — night cover",
      ownerPersonId: personId,
    },
  };
  unwrap(harness.kernel.execute(context(), update));
  const moved = dealFromWorkspace(harness, opportunityId);
  assert.equal(moved.ownerPersonId, personId);

  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-undo-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: update.commandId },
    }),
  );
  if (preview.outcome !== "preview") assert.fail("Expected a preview.");
  assert.equal(preview.projection.available, true);
  assert.equal(
    preview.projection.compensationKind,
    "opportunity.restore_details",
  );

  const undone = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-undo-apply", { [opportunityId]: 2 }),
      commandName: "command.undo",
      payload: { targetCommandId: update.commandId },
    }),
  );
  assert.equal(undone.diagnosticCode, "command.undone");

  const restored = dealFromWorkspace(harness, opportunityId);
  assert.equal(restored.stage, "discovery");
  assert.equal(restored.title, "Orbit monitoring extension");
  assert.equal(
    restored.ownerPersonId,
    undefined,
    "undoing an update that ADDED an owner takes the owner off, not just its value",
  );
  // The VALUE, not merely "it changed": a compensation that wrote a fresh third
  // stamp would satisfy `notEqual` while still losing the moment the deal
  // actually entered discovery, which is the whole point of the field.
  assert.notEqual(originalStamp, moved.stageEnteredAt);
  assert.equal(
    restored.stageEnteredAt,
    originalStamp,
    "putting the stage back puts its ORIGINAL entry moment back, not a new one",
  );
});

/**
 * The contract clock and the state the kernel used to make unreachable: a
 * renewal nobody has started. Four of five real contracts sit there, and until
 * 0.2.0 `relationship.renewalCreate` demanded a follow-up task id, so the
 * Renewals screen's `Start` action had nothing to act on and its empty state
 * could not occur.
 */
it("records a contract term, and lets a renewal exist with nobody on it", () => {
  const harness = removalHarness("renewal-term");
  const organizationId = createOrganization(harness, "renewal-term");
  const renewalId = uuid();

  const created = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("renewal-term-create"),
      commandName: "relationship.renewalCreate",
      payload: {
        renewalId,
        spaceId: ids.space,
        organizationId,
        title: "Orbit monitoring",
        scope: "24/7 detection and response",
        expiresAt: "2026-09-30T00:00:00.000Z",
        leadTimeDays: 90,
        ownerPrincipalId: ids.principal,
        evidenceSourceIds: [],
        cycleKey: `${organizationId}:2026-09-30`,
      },
    }),
  );
  assert.equal(created.outcome, "success");

  const stored = () => {
    const record = (harness.store.snapshot().strategicRecords ?? []).find(
      (candidate) => candidate.id === renewalId,
    );
    if (record?.kind !== "renewal") assert.fail("Expected the renewal.");
    return record;
  };
  assert.equal(
    stored().followUpTaskId,
    undefined,
    "a renewal created without a follow-up carries none",
  );
  assert.equal(
    harness.store.snapshot().tasks.length,
    0,
    "and no task was invented on its behalf",
  );

  // The warning must NOT vanish with the task. A contract nobody has started is
  // exactly the one that needs it, so it points at the client instead.
  // Asserted through the READ, not through the store. This destination shape
  // has never been projected for a renewal before, and `attention.inbox`
  // strict-parses its destination union — a value the union had not been
  // taught would fail on the way out and read as a broken inbox.
  const inbox = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "attention.inbox",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: {},
  });
  if (
    inbox.kind !== "query_result" ||
    inbox.result.outcome !== "success" ||
    inbox.result.projection.kind !== "attention.inbox"
  )
    assert.fail("Expected the attention inbox.");
  // This harness holds exactly one renewal, so the reason identifies it.
  const signal = inbox.result.projection.items.find(
    (candidate) => candidate.reason === "renewal_due",
  );
  if (signal === undefined)
    assert.fail(
      "the renewal_due signal still fires with nobody on the renewal",
    );
  assert.deepEqual(
    signal.destination,
    { kind: "organization", organizationId },
    "with no task to point at, the warning points at the client rather than vanishing",
  );

  // The clock, set on a renewal that already exists — the case a create-only
  // field would have left permanently without one.
  const update = {
    ...metadata("renewal-term-update", { [renewalId]: 1 }),
    commandName: "relationship.renewalUpdate" as const,
    payload: {
      renewalId,
      termStartsAt: "2024-10-01T00:00:00.000Z",
      termMonths: 24,
      cycleOrdinal: 3,
    },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), update)).outcome,
    "success",
  );

  const projected = projectedRecords(harness).find(
    (record) => record.kind === "renewal" && record.id === renewalId,
  );
  if (projected?.kind !== "renewal")
    assert.fail("Expected the renewal in relationship.workspace.");
  assert.equal(projected.termStartsAt, "2024-10-01T00:00:00.000Z");
  assert.equal(projected.termMonths, 24);
  assert.equal(
    projected.cycleOrdinal,
    3,
    "the ordinal the screen prints as 'term 3', distinct from cycleKey",
  );
  assert.equal(
    projected.cycleKey,
    `${organizationId}:2026-09-30`,
    "and cycleKey keeps its own meaning — the per-organization uniqueness key",
  );
  assert.equal(projected.followUpTaskId, undefined);

  // The second projection home restates the renewal by hand, so nothing forces
  // these keys to arrive there. This is the assertion that catches it.
  const overview = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "organization.operationalOverview",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, organizationId },
  });
  if (
    overview.kind !== "query_result" ||
    overview.result.outcome !== "success" ||
    overview.result.projection.kind !== "organization.operationalOverview"
  )
    assert.fail("Expected Organization overview");
  const overviewRenewal = overview.result.projection.renewals.find(
    (candidate) => candidate.id === renewalId,
  );
  assert.equal(overviewRenewal?.termStartsAt, "2024-10-01T00:00:00.000Z");
  assert.equal(overviewRenewal?.termMonths, 24);
  assert.equal(overviewRenewal?.cycleOrdinal, 3);

  // Undo puts the renewal back to having no clock at all, rather than freezing
  // the values the update introduced.
  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("renewal-term-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: update.commandId },
    }),
  );
  if (preview.outcome !== "preview") assert.fail("Expected a preview.");
  assert.equal(
    preview.projection.compensationKind,
    "relationship.restore_renewal_term",
  );
  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("renewal-term-undo", { [renewalId]: 2 }),
      commandName: "command.undo",
      payload: { targetCommandId: update.commandId },
    }),
  );
  assert.equal(
    stored().termMonths,
    undefined,
    "undoing the command that ADDED the term takes the key off the record",
  );

  // And a renewal nobody started can still be CLOSED. Refusing this would have
  // made the state a trap: the screen offers Close on every row.
  const closed = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("renewal-term-close", { [renewalId]: 3 }),
      commandName: "relationship.renewalResolve",
      payload: { renewalId, state: "renewed" },
    }),
  );
  assert.equal(closed.outcome, "success");
  assert.equal(stored().state, "renewed");
});

it("attaches a follow-up to a started renewal once, and links an amendment to it", () => {
  const harness = removalHarness("renewal-start");
  const organizationId = createOrganization(harness, "renewal-start");
  const renewalId = uuid();
  const followUpTaskId = uuid();

  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-start-create"),
        commandName: "relationship.renewalCreate",
        payload: {
          renewalId,
          spaceId: ids.space,
          organizationId,
          title: "Orbit monitoring",
          scope: "24/7 detection and response",
          expiresAt: "2026-09-30T00:00:00.000Z",
          leadTimeDays: 90,
          ownerPrincipalId: ids.principal,
          evidenceSourceIds: [],
          cycleKey: `${organizationId}:2026-09-30`,
        },
      }),
    ).outcome,
    "success",
  );

  // `Start` on the screen: make a task, then attach it.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-start-task"),
        commandName: "task.create",
        payload: {
          taskId: followUpTaskId,
          spaceId: ids.space,
          title: "Open the renewal conversation",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-start-attach", { [renewalId]: 1 }),
        commandName: "relationship.renewalUpdate",
        payload: { renewalId, followUpTaskId },
      }),
    ).outcome,
    "success",
  );

  const secondTaskId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-start-task-2"),
        commandName: "task.create",
        payload: {
          taskId: secondTaskId,
          spaceId: ids.space,
          title: "A second follow-up nobody asked for",
        },
      }),
    ).outcome,
    "success",
  );
  const repointed = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("renewal-start-repoint", { [renewalId]: 2 }),
      commandName: "relationship.renewalUpdate",
      payload: { renewalId, followUpTaskId: secondTaskId },
    }),
  );
  assert.equal(
    repointed.diagnosticCode,
    "command.precondition_failed",
    "a follow-up is attached once: re-pointing would strand the first task",
  );

  // The amendment edge. Without it `Add to contract` has nowhere to write.
  const opportunityId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-start-opportunity"),
        commandName: "opportunity.create",
        payload: {
          opportunityId,
          spaceId: ids.space,
          title: "+180 licences, no change to the term",
          organizationId,
          personIds: [],
          need: "More seats before the term ends.",
          qualification: "Budget already approved.",
          stage: "proposal",
          nextAction: "Send the amended schedule.",
          evidenceSourceIds: [],
        },
      }),
    ).outcome,
    "success",
  );
  const linkId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-start-link"),
        commandName: "work.linkCreate",
        payload: {
          linkId,
          spaceId: ids.space,
          linkType: "opportunity_amends_renewal",
          sourceRecordId: opportunityId,
          targetRecordId: renewalId,
        },
      }),
    ).outcome,
    "success",
  );

  // The edge is directional and typed: the same link the other way round is a
  // renewal amending a deal, which is not a thing.
  const reversed = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("renewal-start-link-reversed"),
      commandName: "work.linkCreate",
      payload: {
        linkId: uuid(),
        spaceId: ids.space,
        linkType: "opportunity_amends_renewal",
        sourceRecordId: renewalId,
        targetRecordId: opportunityId,
      },
    }),
  );
  assert.equal(reversed.diagnosticCode, "command.precondition_failed");
});

// B4 + the four fields Kacper accepted. The point of this test is the SECOND
// projection home. `UnprojectableKeys` (`wave2.ts:10058`) forces every one of
// these keys into `StrategicRecordProjectionSchema` and will not compile
// without it — but `organization.operationalOverview` restates the
// organization, person, opportunity and offer shapes and hand-picks every
// field into a fresh object literal, so a field can satisfy the compile guard
// and reach that projection NOT AT ALL, with nothing failing. Every assertion
// below that names `overview` is hand-written for exactly that reason, and
// each was verified by deleting its mapper line and watching it go red.
it("carries money and the four CRM fields through BOTH projection homes", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("money-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Money",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const organizationId = uuid();
  const contactId = uuid();
  const opportunityId = uuid();
  const deliverableDocumentId = uuid();
  const offerId = uuid();
  const estimate = { amountMinor: 320_000_00, currency: "EUR" as const };
  const cost = { amountMinor: 28_400_00, currency: "EUR" as const };
  const rate = {
    from: "EUR" as const,
    to: "PLN" as const,
    rateMicros: 4_310_000,
    at: "2026-07-18",
  };
  const price = {
    basis: "confirmed" as const,
    price: { amountMinor: 205_000_00, currency: "PLN" as const },
  };
  for (const command of [
    {
      ...metadata("money-contact"),
      commandName: "relationship.personCreate" as const,
      payload: {
        personId: contactId,
        spaceId: ids.space,
        name: "Marta Nowak",
        role: "Security lead",
        email: "marta@example.test",
        phone: "+48 601 234 567",
      },
    },
    {
      ...metadata("money-organization"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId,
        spaceId: ids.space,
        name: "Northstar Industries",
        relationshipState: "active" as const,
        segment: "Produkcja",
        since: "2023-04-11",
        mainContactPersonId: contactId,
      },
    },
    // The contact is employed here, and the two edges are independent: the
    // organisation names its contact, the person names their employer. The
    // second is what puts them in this client's `people` list.
    {
      ...metadata("money-contact-employed", { [contactId]: 1 }),
      commandName: "relationship.personUpdate" as const,
      payload: { personId: contactId, organizationId },
    },
    {
      ...metadata("money-opportunity"),
      commandName: "opportunity.create" as const,
      payload: {
        opportunityId,
        spaceId: ids.space,
        title: "Continuity after 30 September",
        organizationId,
        personIds: [contactId],
        need: "Support continuity after the current term ends.",
        qualification: "Sponsor named, budget indicated.",
        estimate,
        stage: "qualified",
        nextAction: "Agree the decision-maker.",
        evidenceSourceIds: [],
      },
    },
    {
      ...metadata("money-deliverable"),
      commandName: "document.create" as const,
      payload: {
        documentId: deliverableDocumentId,
        spaceId: ids.space,
        title: "Continuity offer",
        role: "deliverable" as const,
      },
    },
    {
      ...metadata("money-offer"),
      commandName: "opportunity.offerCreate" as const,
      payload: {
        offerId,
        opportunityId,
        deliverableDocumentId,
        title: "Continuity offer",
        ownerPrincipalId: ids.principal,
        cost,
        rate,
        price,
        state: "ready" as const,
        nextAction: "Send after the sponsor confirms.",
      },
    },
  ])
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
      command.commandName,
    );

  // HOME ONE — the guarded projection, and a BOOT query. A money value this
  // cannot parse does not degrade the Pipeline screen; it takes boot down.
  const records = (() => {
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
  const projectedOrganization = records.find(
    (record) => record.id === organizationId,
  );
  assert.equal(projectedOrganization?.kind, "organization");
  if (projectedOrganization?.kind !== "organization")
    assert.fail("Expected the organization");
  assert.equal(projectedOrganization.segment, "Produkcja");
  assert.equal(projectedOrganization.since, "2023-04-11");
  assert.equal(projectedOrganization.mainContactPersonId, contactId);
  const projectedContact = records.find((record) => record.id === contactId);
  assert.equal(
    projectedContact?.kind === "person" ? projectedContact.phone : undefined,
    "+48 601 234 567",
  );
  const projectedOpportunity = records.find(
    (record) => record.id === opportunityId,
  );
  assert.deepEqual(
    projectedOpportunity?.kind === "opportunity"
      ? projectedOpportunity.estimate
      : undefined,
    estimate,
  );
  const projectedOffer = records.find((record) => record.id === offerId);
  assert.equal(projectedOffer?.kind, "offer");
  if (projectedOffer?.kind !== "offer") assert.fail("Expected the offer");
  assert.deepEqual(projectedOffer.cost, cost);
  assert.deepEqual(projectedOffer.rate, rate);
  assert.deepEqual(projectedOffer.price, price);

  // HOME TWO — the unguarded one. Eight hand-written assertions, one per new
  // field, because nothing here is forced by a type.
  const overview = () => {
    const result = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "organization.operationalOverview",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space, organizationId },
    });
    if (
      result.kind !== "query_result" ||
      result.result.outcome !== "success" ||
      result.result.projection.kind !== "organization.operationalOverview"
    )
      assert.fail("Expected the Organization overview");
    return result.result.projection;
  };
  assert.equal(
    overview().organization.segment,
    "Produkcja",
    "segment reaches organization.operationalOverview",
  );
  assert.equal(
    overview().organization.since,
    "2023-04-11",
    "since reaches organization.operationalOverview",
  );
  // Resolved by name, not a bare id: the column reads `Main contact` and a
  // caller that had to make a second query to render it would not.
  assert.deepEqual(
    overview().organization.mainContact,
    { id: contactId, name: "Marta Nowak" },
    "mainContact reaches organization.operationalOverview, resolved",
  );
  assert.equal(
    overview().people.find((person) => person.id === contactId)?.phone,
    "+48 601 234 567",
    "phone reaches organization.operationalOverview",
  );
  assert.deepEqual(
    overview().opportunities.find((deal) => deal.id === opportunityId)
      ?.estimate,
    estimate,
    "estimate reaches organization.operationalOverview",
  );
  const overviewOffer = overview().offers.find((offer) => offer.id === offerId);
  assert.deepEqual(
    overviewOffer?.cost,
    cost,
    "cost reaches organization.operationalOverview",
  );
  assert.deepEqual(
    overviewOffer?.rate,
    rate,
    "rate reaches organization.operationalOverview",
  );
  assert.deepEqual(
    overviewOffer?.price,
    price,
    "price reaches organization.operationalOverview",
  );

  // An offer whose stored rate is for the WRONG PAIR is a real record, and the
  // kernel stores it. It is on the seed list for the wave on purpose: a dollar
  // cost converted at the euro rate yields a plausible złoty amount rather than
  // an error, so the screen has to be shown refusing to convert it — and it
  // cannot be shown doing that if the state is unwritable. The guard is
  // structural in `convertMoney` (decision §2.1: the type or ONE guarded
  // function), not a second refusal at the boundary that would make the
  // degradation path unreachable and leave it green.
  const mismatchedOfferId = uuid();
  const mismatchedCost = { amountMinor: 12_000_00, currency: "USD" as const };
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("money-offer-wrong-pair"),
        commandName: "opportunity.offerCreate",
        payload: {
          offerId: mismatchedOfferId,
          opportunityId,
          deliverableDocumentId,
          title: "Quoted against last month's euro rate",
          ownerPrincipalId: ids.principal,
          cost: mismatchedCost,
          rate,
          state: "draft",
          nextAction: "Re-quote at the dollar rate.",
        },
      }),
    ).outcome,
    "success",
    "an offer whose rate is for the wrong pair is storable — the seed list needs it",
  );
  const mismatched = overview().offers.find(
    (offer) => offer.id === mismatchedOfferId,
  );
  assert.deepEqual(
    mismatched?.cost,
    mismatchedCost,
    "and it reads back through organization.operationalOverview intact",
  );
  assert.deepEqual(mismatched?.rate, rate);
  // …and this is what the reader does with it. `undefined`, not a number.
  assert.equal(convertMoney(mismatchedCost, rate), undefined);
  // A rate with nothing to convert yet is storable for the same reason: it is
  // an intermediate state, not a contradiction.
  const rateOnlyOfferId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("money-offer-rate-without-cost"),
        commandName: "opportunity.offerCreate",
        payload: {
          offerId: rateOnlyOfferId,
          opportunityId,
          deliverableDocumentId,
          title: "Rate agreed, quote still outstanding",
          ownerPrincipalId: ids.principal,
          rate,
          state: "draft",
          nextAction: "Chase the quote.",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    overview().offers.find((offer) => offer.id === rateOnlyOfferId)?.cost,
    undefined,
  );
  // The state Kacper named as his common one: the distributor's quote has not
  // come back. An offer with no money at all is a first-class record.
  const costlessOfferId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("money-offer-costless"),
        commandName: "opportunity.offerCreate",
        payload: {
          offerId: costlessOfferId,
          opportunityId,
          deliverableDocumentId,
          title: "Waiting for the distributor's quote",
          ownerPrincipalId: ids.principal,
          state: "draft",
          nextAction: "Chase the quote.",
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    overview().offers.find((offer) => offer.id === costlessOfferId)?.cost,
    undefined,
    "an offer with no cost still projects, and says nothing rather than zero",
  );

  // The reference guard, which the compile check above is blind to: adding an
  // optional key to the projection still satisfies
  // `StrategicProjectionsCarryTheirReferences`, so the `organization` arm of
  // `strategicRecordReferences` is hand-written and nothing forces it.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("money-remove-contact", { [contactId]: 2 }),
        commandName: "relationship.personRemove",
        payload: { personId: contactId },
      }),
    ).diagnosticCode,
    "record.still_referenced",
    "a person named as the main contact cannot be removed out from under it",
  );
});

// The four fields go through the two existing update commands, which are
// `revertability: "always"`. `UndoDescriptor` sits outside `UnprojectableKeys`
// entirely, so a forgotten `prior*` compiles, ships, and reports success while
// leaving the new value in place. Each stamp is undone immediately: the kernel
// refuses an undo once the record has moved on, which is its own correct
// behaviour and not what this test is measuring.
it("undoes an update that ADDED one of the four fields by clearing it", () => {
  const harness = createReferenceHarness();
  harness.authorization.register(context());
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-bootstrap"),
        commandName: "workspace.createLocal",
        payload: {
          workspaceId: ids.workspace,
          rootSpaceId: ids.space,
          ownerPrincipalId: ids.principal,
          name: "Undo",
          timezone: "Europe/Warsaw",
        },
      }),
    ).outcome,
    "success",
  );
  const organizationId = uuid();
  const contactId = uuid();
  const otherContactId = uuid();
  for (const command of [
    {
      ...metadata("undo-organization"),
      commandName: "relationship.organizationCreate" as const,
      payload: {
        organizationId,
        spaceId: ids.space,
        name: "Northstar Industries",
        relationshipState: "prospect" as const,
      },
    },
    {
      ...metadata("undo-contact"),
      commandName: "relationship.personCreate" as const,
      payload: {
        personId: contactId,
        spaceId: ids.space,
        name: "Marta Nowak",
        organizationId,
      },
    },
    {
      ...metadata("undo-other-contact"),
      commandName: "relationship.personCreate" as const,
      payload: {
        personId: otherContactId,
        spaceId: ids.space,
        name: "Piotr Zieliński",
        organizationId,
        phone: "+48 602 000 000",
      },
    },
  ])
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
      command.commandName,
    );
  const read = () => {
    const result = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "organization.operationalOverview",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space, organizationId },
    });
    if (
      result.kind !== "query_result" ||
      result.result.outcome !== "success" ||
      result.result.projection.kind !== "organization.operationalOverview"
    )
      assert.fail("Expected the Organization overview");
    return result.result.projection;
  };
  const update = (
    key: string,
    version: number,
    payload: Record<string, unknown>,
  ) => {
    const command = {
      ...metadata(key, { [organizationId]: version }),
      commandName: "relationship.organizationUpdate" as const,
      payload: { organizationId, ...payload },
    };
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
      // Each new field ALONE has to satisfy the at-least-one-field refine.
      // Nothing asserts that an ordinary case is ACCEPTED unless it is written
      // down, and a refusal nobody asked for passes a suite of refusals.
      `${key} alone is a change`,
    );
    return command;
  };
  const undo = (key: string, version: number, targetCommandId: string) =>
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(key, { [organizationId]: version }),
          commandName: "command.undo",
          payload: { targetCommandId },
        }),
      ).diagnosticCode,
      "command.undone",
      key,
    );

  // Each of the three: stamp it where there was nothing, then undo. Passing
  // the bare `descriptor.priorX` instead of `descriptor.priorX ?? null` leaves
  // the new value in place and still reports success.
  const stampSegment = update("undo-segment", 1, { segment: "Produkcja" });
  assert.equal(read().organization.segment, "Produkcja");
  undo("undo-segment-undo", 2, stampSegment.commandId);
  assert.equal(
    read().organization.segment,
    undefined,
    "undoing the update that stamped a segment clears it",
  );

  const stampSince = update("undo-since", 3, { since: "2023-04-11" });
  assert.equal(read().organization.since, "2023-04-11");
  undo("undo-since-undo", 4, stampSince.commandId);
  assert.equal(
    read().organization.since,
    undefined,
    "undoing the update that stamped a start date clears it",
  );

  // Set a segment that stays put, so the next undo can be shown to leave the
  // fields its own command never touched alone.
  update("undo-segment-again", 5, { segment: "Produkcja" });
  const stampContact = update("undo-contact-set", 6, {
    mainContactPersonId: contactId,
  });
  assert.deepEqual(read().organization.mainContact, {
    id: contactId,
    name: "Marta Nowak",
  });
  undo("undo-contact-undo", 7, stampContact.commandId);
  assert.equal(
    read().organization.mainContact,
    undefined,
    "undoing the update that named a contact clears it",
  );
  assert.equal(
    read().organization.segment,
    "Produkcja",
    "and leaves the fields that update never touched alone",
  );

  // Same rule on the person arm.
  const stampPhone = {
    ...metadata("undo-phone", { [contactId]: 1 }),
    commandName: "relationship.personUpdate" as const,
    payload: { personId: contactId, phone: "+48 601 234 567" },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), stampPhone)).outcome,
    "success",
    "phone alone is a change",
  );
  assert.equal(
    read().people.find((person) => person.id === contactId)?.phone,
    "+48 601 234 567",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-phone-undo", { [contactId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: stampPhone.commandId },
      }),
    ).diagnosticCode,
    "command.undone",
  );
  assert.equal(
    read().people.find((person) => person.id === contactId)?.phone,
    undefined,
    "undoing the update that added a number clears it",
  );

  // A REPLACEMENT is put back, not cleared — the other half of the same rule.
  const replacePhone = {
    ...metadata("undo-phone-replace", { [otherContactId]: 1 }),
    commandName: "relationship.personUpdate" as const,
    payload: { personId: otherContactId, phone: "+48 603 111 111" },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), replacePhone)).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-phone-replace-undo", { [otherContactId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: replacePhone.commandId },
      }),
    ).diagnosticCode,
    "command.undone",
  );
  assert.equal(
    read().people.find((person) => person.id === otherContactId)?.phone,
    "+48 602 000 000",
    "undoing a replacement restores the previous number rather than clearing it",
  );

  // Naming a contact that is not a person in this Space is refused, on the same
  // terms moving a person to another organisation is.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-contact-bogus", { [organizationId]: 8 }),
        commandName: "relationship.organizationUpdate",
        payload: { organizationId, mainContactPersonId: organizationId },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
    "a main contact must be a person",
  );
  // And clearing it is how the mutual reference with `person.organizationId`
  // is untangled: the person becomes removable again.
  update("undo-contact-reset", 8, { mainContactPersonId: otherContactId });
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-contact-blocked", { [otherContactId]: 3 }),
        commandName: "relationship.personRemove",
        payload: { personId: otherContactId },
      }),
    ).diagnosticCode,
    "record.still_referenced",
  );
  update("undo-contact-clear", 9, { mainContactPersonId: null });
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("undo-contact-freed", { [otherContactId]: 3 }),
        commandName: "relationship.personRemove",
        payload: { personId: otherContactId },
      }),
    ).outcome,
    "success",
    "clearing the contact frees the person for removal",
  );
});

/**
 * The offer's own correction command. Until it existed an offer was frozen at
 * create: `state` could not walk draft→ready→submitted→accepted, and a cost
 * that arrived when the distributor's quote finally came back could not be
 * written down at all.
 */
it("moves an offer's state and corrects its money after the quote comes back", () => {
  const harness = removalHarness("offer-update");
  const organizationId = createOrganization(harness, "offer-update");
  const opportunityId = uuid();
  const offerId = uuid();
  const deliverableDocumentId = uuid();
  for (const command of [
    {
      ...metadata("offer-update-opportunity"),
      commandName: "opportunity.create" as const,
      payload: {
        opportunityId,
        spaceId: ids.space,
        title: "Orbit monitoring extension",
        organizationId,
        personIds: [],
        need: "Out-of-hours detection.",
        qualification: "Sponsor named.",
        stage: "proposal",
        nextAction: "Send the variant.",
        evidenceSourceIds: [],
      },
    },
    {
      ...metadata("offer-update-document"),
      commandName: "document.create" as const,
      payload: {
        documentId: deliverableDocumentId,
        spaceId: ids.space,
        title: "Orbit offer",
        role: "deliverable" as const,
      },
    },
    {
      // Kacper's common case: the distributor's quote has not come back, so
      // the offer exists with no money on it at all.
      ...metadata("offer-update-offer"),
      commandName: "opportunity.offerCreate" as const,
      payload: {
        offerId,
        opportunityId,
        deliverableDocumentId,
        title: "Monitoring, 24/7",
        ownerPrincipalId: ids.principal,
        state: "draft" as const,
        nextAction: "Chase the quote.",
      },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }

  const storedOffer = () => {
    const record = (harness.store.snapshot().strategicRecords ?? []).find(
      (candidate) => candidate.id === offerId,
    );
    if (record?.kind !== "offer") assert.fail("Expected the offer.");
    return record;
  };
  const projectedOffer = () => {
    const record = projectedRecords(harness).find(
      (candidate) => candidate.kind === "offer" && candidate.id === offerId,
    );
    if (record?.kind !== "offer")
      assert.fail("Expected the offer in relationship.workspace.");
    return record;
  };
  const overviewOffer = () => {
    const overview = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "organization.operationalOverview",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space, organizationId },
    });
    if (
      overview.kind !== "query_result" ||
      overview.result.outcome !== "success" ||
      overview.result.projection.kind !== "organization.operationalOverview"
    )
      assert.fail("Expected Organization overview");
    const offer = overview.result.projection.offers.find(
      (candidate) => candidate.id === offerId,
    );
    if (offer === undefined) assert.fail("Expected the offer on its client.");
    return offer;
  };

  assert.equal(storedOffer().cost, undefined);

  // The quote comes back. Cost and rate land on an offer that had neither, and
  // the state walks forward — one command, and the fields it did not name are
  // left alone.
  const cost = { amountMinor: 28_400_00, currency: "EUR" as const };
  const rate = {
    from: "EUR" as const,
    to: "PLN" as const,
    rateMicros: 4_310_000,
    at: "2026-07-18",
  };
  const quoted = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("offer-update-quote", { [offerId]: 1 }),
      commandName: "opportunity.offerUpdate",
      payload: { offerId, cost, rate, state: "ready" },
    }),
  );
  assert.equal(quoted.diagnosticCode, "strategic.record_changed");
  assert.deepEqual(projectedOffer().cost, cost);
  assert.deepEqual(projectedOffer().rate, rate);
  assert.equal(projectedOffer().state, "ready");
  assert.equal(
    projectedOffer().nextAction,
    "Chase the quote.",
    "a field the payload never named is left alone",
  );
  // The second projection home restates the offer in its own literal, so this
  // is the assertion that catches money written by UPDATE — a different claim
  // from Lot A's, which only covers money written at create.
  assert.deepEqual(overviewOffer().cost, cost);
  assert.deepEqual(overviewOffer().rate, rate);

  // Confirming a price stores it; un-confirming CLEARS it, so "derived" has
  // exactly one spelling on the record and no stale confirmed amount can sit
  // behind a card that reads as derived.
  const price = {
    basis: "confirmed" as const,
    price: { amountMinor: 205_000_00, currency: "PLN" as const },
  };
  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("offer-update-confirm", { [offerId]: 2 }),
      commandName: "opportunity.offerUpdate",
      payload: { offerId, price },
    }),
  );
  assert.deepEqual(storedOffer().price, price);
  assert.deepEqual(overviewOffer().price, price);

  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("offer-update-unconfirm", { [offerId]: 3 }),
      commandName: "opportunity.offerUpdate",
      payload: { offerId, price: { basis: "derived" } },
    }),
  );
  assert.equal(
    storedOffer().price,
    undefined,
    "un-confirming clears the stored price rather than storing a second spelling of derived",
  );

  // A state that goes BACKWARDS is accepted. There is no transition graph and
  // none should be invented: a client reopening a closed negotiation is an
  // ordinary event, and a refusal nobody asked for would pass the suite because
  // nothing else asserts the ordinary case.
  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("offer-update-accept", { [offerId]: 4 }),
      commandName: "opportunity.offerUpdate",
      payload: { offerId, state: "accepted" },
    }),
  );
  const reopened = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("offer-update-reopen", { [offerId]: 5 }),
      commandName: "opportunity.offerUpdate",
      payload: { offerId, state: "draft" },
    }),
  );
  assert.equal(
    reopened.diagnosticCode,
    "strategic.record_changed",
    "an offer may go backwards; nothing here is a one-way door",
  );
  assert.equal(projectedOffer().state, "draft");

  // A rate whose `from` is not the cost's currency is STORED by the update as
  // it is by the create — the pair check is structural in `convertMoney`, and a
  // second refusal here would make the mismatched offer unreachable through the
  // one command that can correct it.
  const mismatched = { amountMinor: 12_000_00, currency: "USD" as const };
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("offer-update-wrong-pair", { [offerId]: 6 }),
        commandName: "opportunity.offerUpdate",
        payload: { offerId, cost: mismatched },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(storedOffer().cost, mismatched);
  assert.equal(convertMoney(mismatched, rate), undefined);
});

it("takes back an offer update, including the money it added", () => {
  const harness = removalHarness("offer-undo");
  const organizationId = createOrganization(harness, "offer-undo");
  const opportunityId = uuid();
  const offerId = uuid();
  const deliverableDocumentId = uuid();
  for (const command of [
    {
      ...metadata("offer-undo-opportunity"),
      commandName: "opportunity.create" as const,
      payload: {
        opportunityId,
        spaceId: ids.space,
        title: "Orbit monitoring extension",
        organizationId,
        personIds: [],
        need: "Out-of-hours detection.",
        qualification: "Sponsor named.",
        stage: "proposal",
        nextAction: "Send the variant.",
        evidenceSourceIds: [],
      },
    },
    {
      ...metadata("offer-undo-document"),
      commandName: "document.create" as const,
      payload: {
        documentId: deliverableDocumentId,
        spaceId: ids.space,
        title: "Orbit offer",
        role: "deliverable" as const,
      },
    },
    {
      ...metadata("offer-undo-offer"),
      commandName: "opportunity.offerCreate" as const,
      payload: {
        offerId,
        opportunityId,
        deliverableDocumentId,
        title: "Monitoring, 24/7",
        ownerPrincipalId: ids.principal,
        state: "draft" as const,
        nextAction: "Chase the quote.",
      },
    },
  ]) {
    assert.equal(
      unwrap(harness.kernel.execute(context(), command)).outcome,
      "success",
    );
  }

  const update = {
    ...metadata("offer-undo-update", { [offerId]: 1 }),
    commandName: "opportunity.offerUpdate" as const,
    payload: {
      offerId,
      cost: { amountMinor: 28_400_00, currency: "EUR" as const },
      price: {
        basis: "confirmed" as const,
        price: { amountMinor: 205_000_00, currency: "PLN" as const },
      },
      state: "ready" as const,
    },
  };
  unwrap(harness.kernel.execute(context(), update));

  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("offer-undo-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: update.commandId },
    }),
  );
  if (preview.outcome !== "preview") assert.fail("Expected a preview.");
  assert.equal(
    preview.projection.compensationKind,
    "opportunity.restore_offer_details",
  );

  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("offer-undo-apply", { [offerId]: 2 }),
      commandName: "command.undo",
      payload: { targetCommandId: update.commandId },
    }),
  );

  const stored = (harness.store.snapshot().strategicRecords ?? []).find(
    (candidate) => candidate.id === offerId,
  );
  if (stored?.kind !== "offer") assert.fail("Expected the offer.");
  // The KEY is gone, not replaced by `{basis:"derived"}`. Those two read alike
  // through `offerPriceState` and differently through a strict round-trip and
  // through the org-overview mapper's `=== undefined` test, so the stored
  // record is what this asserts.
  assert.equal(
    stored.cost,
    undefined,
    "undoing an update that ADDED a cost takes the key off the record",
  );
  assert.equal(stored.price, undefined);
  assert.equal(stored.state, "draft", "and puts the prior state back");
});

it("corrects a deal's estimate through the same update command", () => {
  const { harness, organizationId, opportunityId } =
    dealHarness("deal-estimate");
  const estimate = { amountMinor: 180_000_00, currency: "PLN" as const };
  unwrap(
    harness.kernel.execute(context(), {
      ...metadata("deal-estimate-set", { [opportunityId]: 1 }),
      commandName: "opportunity.update",
      payload: { opportunityId, estimate },
    }),
  );
  const projected = dealFromWorkspace(harness, opportunityId);
  assert.deepEqual(projected.estimate, estimate);
  assert.equal(
    projected.stage,
    "discovery",
    "setting the estimate moved nothing else",
  );
  // Written by UPDATE, read through the hand-written second home. Lot A asserts
  // the create path; only this covers the correction path.
  assert.deepEqual(
    dealFromOverview(harness, organizationId, opportunityId).estimate,
    estimate,
  );
});

// A renewal's own worth. Two projection homes again, and only ONE of them is
// guarded: `UnprojectableKeys` forces `value` into
// `StrategicRecordProjectionSchema` and would not compile without it (verified
// — the error names `value` by name), but
// `organization.operationalOverview` restates the renewal shape and hand-picks
// every field into a fresh literal, so a `value` that satisfies the compile
// guard can reach the Organizations screen NOT AT ALL with nothing failing.
// The overview assertions below are hand-written for exactly that reason and
// were verified by deleting the mapper line.
it("records what a contract is worth, through BOTH projection homes", () => {
  const harness = removalHarness("renewal-value");
  const organizationId = createOrganization(harness, "renewal-value");
  const renewalId = uuid();
  const value = { amountMinor: 45_000_00, currency: "PLN" as const };

  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-value-create"),
        commandName: "relationship.renewalCreate",
        payload: {
          renewalId,
          spaceId: ids.space,
          organizationId,
          title: "Orbit monitoring",
          scope: "24/7 detection and response",
          expiresAt: "2026-09-30T00:00:00.000Z",
          leadTimeDays: 90,
          ownerPrincipalId: ids.principal,
          evidenceSourceIds: [],
          cycleKey: `${organizationId}:2026-09-30`,
        },
      }),
    ).outcome,
    "success",
  );

  const projectedRenewal = () => {
    const record = projectedRecords(harness).find(
      (candidate) => candidate.kind === "renewal" && candidate.id === renewalId,
    );
    if (record?.kind !== "renewal")
      assert.fail("Expected the renewal in relationship.workspace.");
    return record;
  };
  const overviewRenewal = () => {
    const result = harness.kernel.query(context(), {
      contractVersion: 1,
      queryName: "organization.operationalOverview",
      queryId: uuid(),
      workspaceId: ids.workspace,
      consistency: "local_authoritative",
      parameters: { spaceId: ids.space, organizationId },
    });
    if (
      result.kind !== "query_result" ||
      result.result.outcome !== "success" ||
      result.result.projection.kind !== "organization.operationalOverview"
    )
      assert.fail("Expected the Organization overview");
    const renewal = result.result.projection.renewals.find(
      (candidate) => candidate.id === renewalId,
    );
    if (renewal === undefined)
      assert.fail("Expected the renewal in the Organization overview.");
    return renewal;
  };

  // A contract whose worth nobody has recorded is a real state and stays
  // representable. It says nothing, rather than zero: a projected `0` would
  // read as "this contract is worth nothing", which is a different claim.
  assert.equal(projectedRenewal().value, undefined);
  assert.equal(
    overviewRenewal().value,
    undefined,
    "a renewal with no worth recorded still projects, and says nothing rather than zero",
  );

  // The newest key ALONE through the boundary. The at-least-one-field refine
  // on this command is key-generic, but a refine that enumerated its keys
  // would refuse this envelope while `tsc` stayed silent — so the ordinary
  // case is written down rather than assumed. Nothing in a suite of refusals
  // proves an acceptance.
  const stamp = {
    ...metadata("renewal-value-set", { [renewalId]: 1 }),
    commandName: "relationship.renewalUpdate" as const,
    payload: { renewalId, value },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), stamp)).outcome,
    "success",
    "value alone is a change",
  );

  assert.deepEqual(projectedRenewal().value, value);
  assert.deepEqual(
    overviewRenewal().value,
    value,
    "value reaches organization.operationalOverview",
  );
  // Pinned, not `> 0`: an assertion that a rounding or a conversion could
  // satisfy with any number is not an assertion about this number. Minor
  // units, so this is 45 000,00 PLN and not 4 500 000 of anything.
  assert.equal(overviewRenewal().value?.amountMinor, 4_500_000);
  assert.equal(overviewRenewal().value?.currency, "PLN");
  // The WHOLE key set, not "value is in there". A presence check is what let
  // a wrapper send one version where the kernel demanded two for as long as
  // that wrapper existed; the same reasoning applies to a hand-picked mapper,
  // which can drop a key as easily as it can gain one.
  assert.deepEqual(Object.keys(overviewRenewal()).sort(), [
    "expiresAt",
    "id",
    "leadTimeDays",
    "scope",
    "state",
    "title",
    "updatedAt",
    "value",
    "version",
  ]);

  // Undo. `UndoDescriptor` sits outside the compile guard entirely, so a
  // forgotten `priorValue` — or a bare `descriptor.priorValue` instead of
  // `?? null` — compiles, ships, and reports success while leaving the money
  // on the record. Asserted as ABSENT rather than as changed: leaving the
  // stale key on `...base` in `updateRenewalTerm` is invisible to a test that
  // only checks the set path.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-value-undo", { [renewalId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: stamp.commandId },
      }),
    ).diagnosticCode,
    "command.undone",
  );
  assert.equal(
    projectedRenewal().value,
    undefined,
    "undoing the update that recorded a worth clears it",
  );
  assert.equal(overviewRenewal().value, undefined);
  assert.equal(
    "value" in overviewRenewal(),
    false,
    "and clears it by dropping the key, not by projecting an undefined one",
  );

  // At create as well, on the clock's own terms: a contract imported with its
  // worth already known should not need a second command to say so.
  const secondRenewalId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-value-create-with"),
        commandName: "relationship.renewalCreate",
        payload: {
          renewalId: secondRenewalId,
          spaceId: ids.space,
          organizationId,
          title: "Orbit response retainer",
          scope: "Incident response retainer",
          expiresAt: "2027-03-31T00:00:00.000Z",
          leadTimeDays: 60,
          ownerPrincipalId: ids.principal,
          evidenceSourceIds: [],
          cycleKey: `${organizationId}:2027-03-31`,
          value: { amountMinor: 120_000_00, currency: "EUR" },
        },
      }),
    ).outcome,
    "success",
  );
  const created = projectedRecords(harness).find(
    (candidate) =>
      candidate.kind === "renewal" && candidate.id === secondRenewalId,
  );
  assert.deepEqual(
    created?.kind === "renewal" ? created.value : undefined,
    { amountMinor: 12_000_000, currency: "EUR" },
    "a worth recorded at create survives to the projection",
  );
});

// The deal that BECOMES the next term, as against the deal that changes the
// running one. Two edges, and the whole point of the second is that a reader
// projecting the next term's worth can tell them apart: printing an
// amendment's value as the renewal's is a number that looks reasonable and is
// about something else.
it("tells the deal that renews a contract from the deal that amends it", () => {
  const harness = removalHarness("renewal-edges");
  const organizationId = createOrganization(harness, "renewal-edges");
  const renewalId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("renewal-edges-create"),
        commandName: "relationship.renewalCreate",
        payload: {
          renewalId,
          spaceId: ids.space,
          organizationId,
          title: "Orbit monitoring",
          scope: "24/7 detection and response",
          expiresAt: "2026-09-30T00:00:00.000Z",
          leadTimeDays: 90,
          ownerPrincipalId: ids.principal,
          evidenceSourceIds: [],
          cycleKey: `${organizationId}:2026-09-30`,
          value: { amountMinor: 45_000_00, currency: "PLN" },
        },
      }),
    ).outcome,
    "success",
  );
  const opportunity = (key: string, title: string) => {
    const opportunityId = uuid();
    assert.equal(
      unwrap(
        harness.kernel.execute(context(), {
          ...metadata(key),
          commandName: "opportunity.create",
          payload: {
            opportunityId,
            spaceId: ids.space,
            title,
            organizationId,
            personIds: [],
            need: "Recorded so the edge has a real source.",
            qualification: "Budget approved.",
            stage: "proposal",
            nextAction: "Send the paperwork.",
            evidenceSourceIds: [],
          },
        }),
      ).outcome,
      "success",
    );
    return opportunityId;
  };
  const link = (
    key: string,
    linkType: string,
    sourceRecordId: string,
    targetRecordId: string,
  ) =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key),
        commandName: "work.linkCreate",
        payload: {
          linkId: uuid(),
          spaceId: ids.space,
          linkType,
          sourceRecordId,
          targetRecordId,
        },
      }),
    );

  const amendment = opportunity("renewal-edges-amendment", "+180 licences");
  const nextTerm = opportunity("renewal-edges-next-term", "Renewal 2026–2028");
  assert.equal(
    link(
      "renewal-edges-amends",
      "opportunity_amends_renewal",
      amendment,
      renewalId,
    ).outcome,
    "success",
  );
  assert.equal(
    link(
      "renewal-edges-renews",
      "opportunity_renews_renewal",
      nextTerm,
      renewalId,
    ).outcome,
    "success",
    "the deal that becomes the next term is its own edge",
  );

  // Both at once on ONE contract, and told apart by their type. A term can be
  // amended twice and still be renewed, so the reader picks by linkType rather
  // than by "the deal attached to this renewal".
  const links = projectedRecords(harness).filter(
    (record) =>
      record.kind === "work_link" && record.targetRecordId === renewalId,
  );
  assert.deepEqual(
    links
      .map((record) =>
        record.kind === "work_link"
          ? `${record.linkType}:${record.sourceRecordId}`
          : "",
      )
      .sort(),
    [
      `opportunity_amends_renewal:${amendment}`,
      `opportunity_renews_renewal:${nextTerm}`,
    ].sort(),
    "the two edges coexist on one contract and stay distinguishable",
  );

  // Typed and directional, exactly as the amendment edge is: a renewal does
  // not renew a deal.
  assert.equal(
    link(
      "renewal-edges-reversed",
      "opportunity_renews_renewal",
      renewalId,
      nextTerm,
    ).diagnosticCode,
    "command.precondition_failed",
  );
  // And the source must be an Opportunity, not any strategic record that
  // happens to be to hand.
  assert.equal(
    link(
      "renewal-edges-wrong-source",
      "opportunity_renews_renewal",
      organizationId,
      renewalId,
    ).diagnosticCode,
    "command.precondition_failed",
  );
});

// WAVE C, lot organisation edges. `decision` was the one of Wave C's homeless
// kinds that turned out to have a real client edge to build. `recurrence` and
// `impact_review` did NOT and got none — see the PR body; the honest answer for
// those two was a finding, not a field.
const decisionsOnOrganization = (
  harness: ReferenceHarness,
  organizationId: string,
) => {
  const overview = harness.kernel.query(context(), {
    contractVersion: 1,
    queryName: "organization.operationalOverview",
    queryId: uuid(),
    workspaceId: ids.workspace,
    consistency: "local_authoritative",
    parameters: { spaceId: ids.space, organizationId },
  });
  if (
    overview.kind !== "query_result" ||
    overview.result.outcome !== "success" ||
    overview.result.projection.kind !== "organization.operationalOverview"
  )
    assert.fail("Expected Organization overview");
  return overview.result.projection;
};

it("a decision is taken about a client, and the client's record is where it is read", () => {
  const { harness, organizationId } = dealHarness("decision-org");
  const decisionId = uuid();

  // `organizationId` travels ALONE: no other key of this payload changes, so a
  // boundary that dropped or rejected exactly this one key has nothing else to
  // hide behind.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-org-create"),
        commandName: "decision.create",
        payload: {
          decisionId,
          spaceId: ids.space,
          title: "Managed route for Orbit",
          rationale: "Their team cannot carry night cover themselves.",
          organizationId,
          evidenceSourceIds: [],
          linkedRecordIds: [],
        },
      }),
    ).outcome,
    "success",
  );

  // Home one: the wide strategic projection, forced by `UnprojectableKeys`.
  const projected = projectedRecords(harness).find(
    (candidate) => candidate.id === decisionId,
  );
  if (projected?.kind !== "decision")
    assert.fail("Expected the decision in relationship.workspace.");
  assert.equal(
    projected.organizationId,
    organizationId,
    "the edge survives the strict parse the published projection goes through",
  );

  // The receipt's `changedFields` is a hand-written literal beside the payload
  // — the wave's recurring trap in miniature. Nothing makes it move with the
  // schema, so without this assertion a write that set the client would be
  // audited as if it had not.
  assert.ok(
    harness.store
      .snapshot()
      .auditReceipts?.some(
        (receipt) =>
          receipt.affectedRecordIds.includes(decisionId) &&
          receipt.changedFields.includes("organizationId"),
      ),
    "and the receipt for the write names the field the write actually set",
  );

  // Home two: `organization.operationalOverview`, which restates its shapes by
  // hand and forces nothing. This assertion IS the gate on that home.
  const overview = decisionsOnOrganization(harness, organizationId);
  assert.deepEqual(
    overview.decisions.map((record) => ({
      id: record.id,
      title: record.title,
      state: record.state,
    })),
    [
      {
        id: decisionId,
        title: "Managed route for Orbit",
        state: "current",
      },
    ],
    "the decision reaches the client screen through the second projection home",
  );
  assert.equal(
    overview.decisions[0]?.rationale,
    "Their team cannot carry night cover themselves.",
    "and carries the why, which is the whole content of a decision",
  );

  // The same edge feeds the activity feed, which filters by a hand-built set of
  // related ids. Two readers, one edge, neither forced by the other.
  assert.ok(
    overview.recentActivity.some((event) => event.recordId === decisionId),
    "and 'decided X' appears in the same screen's activity",
  );

  // A decision naming this client blocks removing it, exactly as a person does.
  // The compile guard is satisfied by an optional key, so only this refusal
  // proves `strategicRecordReferences` learned the new arm.
  const refused = removeOrganization(
    harness,
    "decision-org-remove",
    organizationId,
  );
  assert.equal(refused.outcome, "rejected");
  if (refused.diagnosticCode !== "record.still_referenced")
    throw new Error("Expected the blocked outcome.");
  assert.ok(
    refused.blockedBy?.some((entry) => entry.recordId === decisionId),
    "and the decision is named among the records that block the removal",
  );
});

it("superseding a decision keeps it on the client it was taken about", () => {
  const { harness, organizationId, personId } = dealHarness("decision-carry");
  const decisionId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-carry-create"),
        commandName: "decision.create",
        payload: {
          decisionId,
          spaceId: ids.space,
          title: "Managed route for Orbit",
          rationale: "Their team cannot carry night cover themselves.",
          organizationId,
          evidenceSourceIds: [],
          linkedRecordIds: [],
        },
      }),
    ).outcome,
    "success",
  );

  const replacementDecisionId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-carry-supersede", { [decisionId]: 1 }),
        commandName: "decision.supersede",
        payload: {
          priorDecisionId: decisionId,
          replacementDecisionId,
          impactReviewId: uuid(),
          title: "Self-service route for Orbit",
          rationale: "They hired a night shift.",
          reason: "Their capability changed.",
          evidenceSourceIds: [],
          consequences: [],
        },
      }),
    ).outcome,
    "success",
  );

  // `decision.supersede` names no client and never will: the replacement is the
  // same decision taken again. Inheriting is what keeps it on the record at the
  // exact moment a reader most wants it — and no fixture that never supersedes
  // could tell the difference.
  const replacement = projectedRecords(harness).find(
    (candidate) => candidate.id === replacementDecisionId,
  );
  if (replacement?.kind !== "decision")
    assert.fail("Expected the replacement decision.");
  assert.equal(
    replacement.organizationId,
    organizationId,
    "the replacement inherits the client the prior decision was about",
  );

  // BOTH, and superseded is not filtered out the way a lost deal is: the record
  // dims the old one, because "what did we decide, and what did we decide
  // before that" is one question.
  assert.deepEqual(
    decisionsOnOrganization(harness, organizationId)
      .decisions.map((record) => [record.title, record.state])
      .sort((left, right) => left[0]!.localeCompare(right[0]!)),
    [
      ["Managed route for Orbit", "superseded"],
      ["Self-service route for Orbit", "current"],
    ],
    "the client's record carries the replacement and the decision it replaced",
  );

  // An id that is not an organisation is refused rather than stored, on the
  // terms relationship.factCreate refuses one. A dead or foreign id here would
  // put a record on a client screen that client cannot be shown to hold.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-carry-wrong-kind"),
        commandName: "decision.create",
        payload: {
          decisionId: uuid(),
          spaceId: ids.space,
          title: "Decision about a person",
          rationale: "A person is not a client.",
          organizationId: personId,
          evidenceSourceIds: [],
          linkedRecordIds: [],
        },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
  );
});

/** The decision as the published projection carries it — home one of two. */
const decisionFromWorkspace = (
  harness: ReferenceHarness,
  decisionId: string,
): Extract<
  ReturnType<typeof projectedRecords>[number],
  { kind: "decision" }
> => {
  const record = projectedRecords(harness).find(
    (candidate) => candidate.kind === "decision" && candidate.id === decisionId,
  );
  if (record === undefined || record.kind !== "decision")
    assert.fail("Expected the decision in relationship.workspace.");
  return record;
};

// #196 gave `decision` the edge to a client but only at CREATE, which left
// every decision already in the graph permanently unattributable: openable by
// title in ⌘K and listed on no client record. This is that regression, closed.
it("a decision written before the client edge existed is attributed after the fact", () => {
  const { harness, organizationId } = dealHarness("decision-attribute");
  const decisionId = uuid();
  // Created with NO client, which is the state every decision in the real graph
  // is in — the fixture has to start where the regression starts.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-attribute-create"),
        commandName: "decision.create",
        payload: {
          decisionId,
          spaceId: ids.space,
          title: "Managed route for Orbit",
          rationale: "Their team cannot carry night cover themselves.",
          evidenceSourceIds: [],
          linkedRecordIds: [],
        },
      }),
    ).outcome,
    "success",
  );
  assert.deepEqual(
    decisionsOnOrganization(harness, organizationId).decisions,
    [],
    "the unattributed decision is on no client record — that IS the regression",
  );

  const attach = {
    ...metadata("decision-attribute-set", { [decisionId]: 1 }),
    commandName: "decision.update" as const,
    // `organizationId` ALONE. A boundary that dropped or refused exactly this
    // one key — the one added last — has nothing else to hide behind.
    payload: { decisionId, organizationId },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), attach)).outcome,
    "success",
  );

  // Home one: the wide strategic projection, forced by `UnprojectableKeys`.
  assert.equal(
    decisionFromWorkspace(harness, decisionId).organizationId,
    organizationId,
    "the edge an UPDATE wrote survives the strict parse the projection goes through",
  );
  // Home two: `organization.operationalOverview`, which restates its shapes by
  // hand and forces nothing. #196 proved a CREATED decision reaches it; nothing
  // in that proof says an updated one does.
  const attached = decisionsOnOrganization(harness, organizationId);
  assert.deepEqual(
    attached.decisions.map((record) => record.id),
    [decisionId],
    "and the updated decision reaches the client screen through the second home",
  );
  assert.ok(
    attached.recentActivity.some((event) => event.recordId === decisionId),
    "and the same screen's activity, which filters by its own hand-built id set",
  );

  // The receipt's `changedFields` is derived from the payload, so it must name
  // the one field sent and NOT the two that were not.
  const receipt = harness.store
    .snapshot()
    .auditReceipts?.find((entry) => entry.commandId === attach.commandId);
  assert.deepEqual(
    [...(receipt?.changedFields ?? [])].sort(),
    ["organizationId"],
    "the receipt names the field the write actually set, and only that field",
  );

  // The removal guard is derived from the live record, so attaching has to make
  // the client unremovable — the half that is easy to satisfy at create and
  // forget on update.
  const refused = removeOrganization(
    harness,
    "decision-attribute-remove",
    organizationId,
  );
  assert.equal(refused.outcome, "rejected");
  if (refused.diagnosticCode !== "record.still_referenced")
    throw new Error("Expected the blocked outcome.");
  assert.ok(
    refused.blockedBy?.some((entry) => entry.recordId === decisionId),
    "and the decision an update attributed is named among the blockers",
  );

  // Revertible, and the undo has to DETACH: the decision was about no client
  // before, so a compensation that left the attribution in place would report
  // success while changing nothing a reader can see.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-attribute-undo", { [decisionId]: 2 }),
        commandName: "command.undo",
        payload: { targetCommandId: attach.commandId },
      }),
    ).diagnosticCode,
    "command.undone",
  );
  assert.equal(
    decisionFromWorkspace(harness, decisionId).organizationId,
    undefined,
    "the undo takes the attribution back off rather than leaving it behind",
  );
  assert.deepEqual(
    decisionsOnOrganization(harness, organizationId).decisions,
    [],
    "and the client record stops listing it",
  );
});

// #189 found the enumerated "at least one field" gate on a command refine; #194
// found the same shape one layer out, in the renderer wrapper. Each field has
// to arrive ALONE, at both boundaries, and be applied.
it("every field of decision.update travels alone, and the client one clears", () => {
  const { harness, organizationId, personId } = dealHarness("decision-alone");
  const decisionId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-alone-create"),
        commandName: "decision.create",
        payload: {
          decisionId,
          spaceId: ids.space,
          title: "Managed route",
          rationale: "Night cover.",
          organizationId,
          evidenceSourceIds: [],
          linkedRecordIds: [],
        },
      }),
    ).outcome,
    "success",
  );

  const update = (
    key: string,
    version: number,
    payload: object,
  ): CommandOutcome =>
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata(key, { [decisionId]: version }),
        commandName: "decision.update",
        payload: { decisionId, ...payload },
      }),
    );

  assert.equal(
    update("decision-alone-title", 1, { title: "Managed route for Orbit" })
      .outcome,
    "success",
  );
  const afterTitle = decisionFromWorkspace(harness, decisionId);
  assert.equal(afterTitle.title, "Managed route for Orbit");
  assert.equal(
    afterTitle.rationale,
    "Night cover.",
    "and a field the caller left out is left alone, not blanked",
  );
  assert.equal(
    afterTitle.organizationId,
    organizationId,
    "and the client the caller did not mention stays attached",
  );

  assert.equal(
    update("decision-alone-rationale", 2, {
      rationale: "Their team cannot carry night cover themselves.",
    }).outcome,
    "success",
  );
  const afterRationale = decisionFromWorkspace(harness, decisionId);
  assert.equal(
    afterRationale.rationale,
    "Their team cannot carry night cover themselves.",
  );
  assert.equal(afterRationale.title, "Managed route for Orbit");

  // An explicit null, alone. This is the detachment a wrongly attributed
  // decision needs, and the value a truthiness test silently drops.
  assert.equal(
    update("decision-alone-clear", 3, { organizationId: null }).outcome,
    "success",
  );
  assert.equal(
    decisionFromWorkspace(harness, decisionId).organizationId,
    undefined,
    "an explicit null detaches the decision from the client",
  );
  assert.deepEqual(
    decisionsOnOrganization(harness, organizationId).decisions,
    [],
    "and the client record stops listing it",
  );
  // And the guard flips back — the half a one-directional test never reaches.
  // The organisation is still blocked by the person the harness put on it, so
  // the assertion is about WHO blocks it, not that it became removable: the
  // detached decision has to be gone from that list.
  const stillBlocked = removeOrganization(
    harness,
    "decision-alone-remove",
    organizationId,
  );
  assert.equal(stillBlocked.outcome, "rejected");
  if (stillBlocked.diagnosticCode !== "record.still_referenced")
    throw new Error("Expected the blocked outcome.");
  assert.ok(
    !(stillBlocked.blockedBy ?? []).some(
      (entry) => entry.recordId === decisionId,
    ),
    "the detached decision is no longer among the records that block removal",
  );
  assert.ok(
    (stillBlocked.blockedBy ?? []).some((entry) => entry.recordId === personId),
    "and the blocker that remains is the person, which nothing here detached",
  );

  // Nothing to change is refused on the ENVELOPE SCHEMA, before the kernel: the
  // key-generic refine fires at the boundary, so a no-op never reaches a
  // handler and never bumps a version.
  assert.equal(
    harness.kernel.execute(context(), {
      ...metadata("decision-alone-empty", { [decisionId]: 4 }),
      commandName: "decision.update",
      payload: { decisionId },
    }).kind,
    "contract_rejected",
  );
  assert.equal(
    decisionFromWorkspace(harness, decisionId).version,
    4,
    "and the refused no-op leaves the record exactly where it stood",
  );
});

it("decision.update refuses the state supersede owns, and the ids create refuses", () => {
  const { harness, organizationId, personId } = dealHarness("decision-refuse");
  const decisionId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-refuse-create"),
        commandName: "decision.create",
        payload: {
          decisionId,
          spaceId: ids.space,
          title: "Managed route",
          rationale: "Night cover.",
          evidenceSourceIds: [],
          linkedRecordIds: [],
        },
      }),
    ).outcome,
    "success",
  );

  // `state` is not merely unread — `.strict()` REFUSES it, on the envelope
  // schema, so the command never reaches a handler that could be tempted to
  // honour it. Two write paths onto one field is this repo's named drift
  // family, and `decision.supersede` — `revertability: "never"` — owns this one.
  assert.equal(
    harness.kernel.execute(context(), {
      ...metadata("decision-refuse-state", { [decisionId]: 1 }),
      commandName: "decision.update",
      payload: { decisionId, state: "superseded" },
    }).kind,
    "contract_rejected",
  );
  assert.equal(
    decisionFromWorkspace(harness, decisionId).state,
    "current",
    "and the decision stays in the state supersede alone can move it out of",
  );

  // An id that is not an organisation, on the terms `decision.create` refuses
  // one: an update that checked less than the create is how a foreign id gets
  // onto a decision after the create said no.
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-refuse-kind", { [decisionId]: 1 }),
        commandName: "decision.update",
        payload: { decisionId, organizationId: personId },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
  );

  // An organisation in a different Space of the same workspace. Reachable by
  // id, refused all the same — the decision's Space is the boundary.
  const foreignSpaceId = "18000000-0000-4000-8000-0000000009f1";
  const foreignOrganizationId = "18000000-0000-4000-8000-0000000009f2";
  harness.store.transact((transaction) => {
    if (!isApplicationWave2Transaction(transaction))
      throw new Error("Expected the Wave 2 reference transaction.");
    transaction.insertSpace({
      id: SpaceIdSchema.parse(foreignSpaceId),
      workspaceId: context().workspaceId,
      name: "Another Space",
      version: 1,
      createdAt: "2026-07-31T12:00:00.000Z",
    });
    transaction.insertStrategicRecord({
      id: StrategicRecordIdSchema.parse(foreignOrganizationId),
      workspaceId: context().workspaceId,
      spaceId: SpaceIdSchema.parse(foreignSpaceId),
      kind: "organization",
      name: "Client in another Space",
      relationshipState: "active",
      createdBy: context().principalId,
      version: 1,
      createdAt: "2026-07-31T12:00:00.000Z",
      updatedAt: "2026-07-31T12:00:00.000Z",
    });
  });
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-refuse-space", { [decisionId]: 1 }),
        commandName: "decision.update",
        payload: { decisionId, organizationId: foreignOrganizationId },
      }),
    ).diagnosticCode,
    "command.precondition_failed",
  );

  // A superseded decision IS updatable, deliberately: the client record shows
  // superseded decisions as the history of the relationship, so refusing here
  // would leave exactly the oldest entries — the ones this command exists for —
  // unattributable for good.
  const replacementDecisionId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-refuse-supersede", { [decisionId]: 1 }),
        commandName: "decision.supersede",
        payload: {
          priorDecisionId: decisionId,
          replacementDecisionId,
          impactReviewId: uuid(),
          title: "Self-service route",
          rationale: "They hired their own night shift.",
          reason: "Their staffing changed.",
          evidenceSourceIds: [],
          consequences: [],
        },
      }),
    ).outcome,
    "success",
  );
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-refuse-old", { [decisionId]: 2 }),
        commandName: "decision.update",
        payload: { decisionId, organizationId },
      }),
    ).outcome,
    "success",
  );
  const superseded = decisionFromWorkspace(harness, decisionId);
  assert.equal(superseded.organizationId, organizationId);
  assert.equal(
    superseded.state,
    "superseded",
    "and updating it does not move the state supersede put it in",
  );
  assert.deepEqual(
    decisionsOnOrganization(harness, organizationId).decisions.map(
      (record) => record.id,
    ),
    [decisionId],
    "the history of the relationship is what the client record gains",
  );
});

// The compensation for a DETACHMENT writes an organisation id back, so it is
// only good while that organisation is still there. Nothing in the type system
// says so — `UndoDescriptor` sits outside `UnprojectableKeys` entirely — and an
// undo that restored a removed client would re-create the dead reference the
// write path refuses to create, reached through the undo path.
it("an undone detachment is unavailable once the client itself is gone", () => {
  const harness = removalHarness("decision-detach-undo");
  const organizationId = createOrganization(harness, "decision-detach-undo");
  const decisionId = uuid();
  assert.equal(
    unwrap(
      harness.kernel.execute(context(), {
        ...metadata("decision-detach-undo-create"),
        commandName: "decision.create",
        payload: {
          decisionId,
          spaceId: ids.space,
          title: "Managed route",
          rationale: "Night cover.",
          organizationId,
          evidenceSourceIds: [],
          linkedRecordIds: [],
        },
      }),
    ).outcome,
    "success",
  );
  const detach = {
    ...metadata("decision-detach-undo-clear", { [decisionId]: 1 }),
    commandName: "decision.update" as const,
    payload: { decisionId, organizationId: null },
  };
  assert.equal(
    unwrap(harness.kernel.execute(context(), detach)).outcome,
    "success",
  );
  // Detaching is what makes the client removable — the guard flipping back is
  // itself half of what this asserts.
  assert.equal(
    removeOrganization(harness, "decision-detach-undo-remove", organizationId)
      .outcome,
    "success",
  );

  const preview = unwrap(
    harness.kernel.execute(context(), {
      ...metadata("decision-detach-undo-preview"),
      commandName: "command.previewUndo",
      payload: { targetCommandId: detach.commandId },
    }),
  );
  if (
    preview.outcome !== "preview" ||
    preview.projection.kind !== "undo.previewed"
  )
    assert.fail("Expected an undo preview for the detachment");
  assert.equal(
    preview.projection.available,
    false,
    "the undo is refused rather than restoring a reference to a removed client",
  );
  assert.equal(
    decisionFromWorkspace(harness, decisionId).organizationId,
    undefined,
    "and the decision is left detached, which is a state the graph can hold",
  );
});
