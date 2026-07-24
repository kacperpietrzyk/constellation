import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type ApplicationCommandResponse } from "@constellation/application";
import {
  COMMAND_REVERTABILITY,
  CapabilitySchema,
  CommandEnvelopeSchema,
  ExecutionContextSchema,
  type CommandName,
  type CommandOutcome,
  type ExecutionContext,
} from "@constellation/contracts";

import { createReferenceHarness, type ReferenceHarness } from "../src/index.js";

const ids = {
  workspace: "13000000-0000-4000-8000-000000000001",
  rootSpace: "13000000-0000-4000-8000-000000000002",
  principal: "13000000-0000-4000-8000-000000000003",
  credential: "13000000-0000-4000-8000-000000000004",
  grant: "13000000-0000-4000-8000-000000000005",
} as const;

let sequence = 8_192;
const uuid = (): string => {
  const suffix = sequence.toString(16).padStart(12, "0");
  sequence += 1;
  return `13000000-0000-4000-8000-${suffix}`;
};

const context = (): ExecutionContext =>
  ExecutionContextSchema.parse({
    principalId: ids.principal,
    principalKind: "human",
    credentialId: ids.credential,
    grantId: ids.grant,
    policyVersion: 1,
    workspaceId: ids.workspace,
    spaceScope: [ids.rootSpace],
    capabilityScope: CapabilitySchema.options,
    origin: "desktop",
  });

interface AppliedCommand {
  readonly commandName: CommandName;
  readonly commandId: string;
}

const versionedCollections = (
  harness: ReferenceHarness,
): readonly (readonly {
  readonly id: string;
  readonly version: number;
}[])[] => {
  const snapshot = harness.store.snapshot();
  return [
    snapshot.workspaces,
    snapshot.captures,
    snapshot.taskAssignments ?? [],
    snapshot.tasks,
    snapshot.projects,
    snapshot.documents ?? [],
    snapshot.knowledgeSources ?? [],
    snapshot.namedDocumentVersions ?? [],
    snapshot.strategicRecords ?? [],
    snapshot.relations ?? [],
    snapshot.taskStatuses ?? [],
    snapshot.fieldDefinitions ?? [],
    snapshot.projectTemplates ?? [],
    snapshot.automationRules ?? [],
  ];
};

describe("Command revertability", () => {
  it("records a compensation descriptor exactly where the catalog says it does", () => {
    const harness = createReferenceHarness();
    harness.authorization.register(context());
    const applied: AppliedCommand[] = [];

    const version = (recordId: string): number => {
      for (const collection of versionedCollections(harness)) {
        const record = collection.find((entry) => entry.id === recordId);
        if (record !== undefined) return record.version;
      }
      throw new Error(`No versioned record ${recordId}.`);
    };

    const versions = (...recordIds: readonly string[]) =>
      Object.fromEntries(recordIds.map((id) => [id, version(id)]));

    const apply = (
      commandName: CommandName,
      payload: Record<string, unknown>,
      expectedVersions: Record<string, number> = {},
    ): CommandOutcome => {
      const command = CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandId: uuid(),
        workspaceId: ids.workspace,
        idempotencyKey: `revertability-${applied.length}`,
        expectedVersions,
        correlationId: uuid(),
        commandName,
        payload,
      });
      const response: ApplicationCommandResponse = harness.kernel.execute(
        context(),
        command,
      );
      assert.equal(response.kind, "command_outcome");
      if (response.kind !== "command_outcome")
        throw new Error("Expected a command outcome.");
      assert.equal(
        response.outcome.outcome,
        "success",
        `${commandName}: ${JSON.stringify(response.outcome)}`,
      );
      applied.push({ commandName, commandId: command.commandId });
      return response.outcome;
    };

    const projection = (
      outcome: CommandOutcome,
    ): Record<string, unknown> & { readonly kind: string } => {
      if (outcome.outcome !== "success")
        throw new Error("Expected a successful outcome.");
      return outcome.projection as Record<string, unknown> & {
        readonly kind: string;
      };
    };

    const captureText = (text: string): string => {
      const stored = projection(
        apply("capture.submitText", {
          spaceId: ids.rootSpace,
          originalText: text,
          deviceId: "revertability-device",
          source: "in_app_quick_capture",
        }),
      );
      return String(stored["captureId"]);
    };

    apply("workspace.createLocal", {
      workspaceId: ids.workspace,
      rootSpaceId: ids.rootSpace,
      ownerPrincipalId: ids.principal,
      name: "Revertability workspace",
      timezone: "Europe/Warsaw",
    });

    // Task statuses: one create (no compensation) and the whole definition
    // family that restores the prior definition.
    const statusId = uuid();
    apply("taskStatus.create", {
      statusId,
      label: "Doing",
      operationalSemantics: "actionable",
    });
    apply(
      "taskStatus.rename",
      { statusId, label: "In progress" },
      versions(statusId),
    );
    apply(
      "taskStatus.setSemantics",
      { statusId, operationalSemantics: "waiting" },
      versions(statusId),
    );
    apply("taskStatus.reorder", { statusId, position: 7 }, versions(statusId));
    apply("taskStatus.archive", { statusId }, versions(statusId));
    apply("taskStatus.restore", { statusId }, versions(statusId));
    apply(
      "workspace.setDefaultTaskStatus",
      { statusId },
      versions(ids.workspace),
    );

    // Captures and Tasks.
    const routedCaptureId = captureText("Prepare the revertability sweep");
    const routedTaskId = String(
      projection(
        apply(
          "capture.routeAsTask",
          { captureId: routedCaptureId, title: "Prepare the sweep" },
          versions(routedCaptureId),
        ),
      )["taskId"],
    );

    const taskId = uuid();
    apply("task.create", {
      taskId,
      spaceId: ids.rootSpace,
      title: "Review the compensation table",
    });
    apply(
      "task.updateDetails",
      { taskId, title: "Review the compensation table again" },
      versions(taskId),
    );
    apply(
      "task.setParent",
      { taskId, parentTaskId: routedTaskId },
      versions(taskId),
    );
    apply(
      "task.setCalendarBlock",
      {
        taskId,
        block: {
          ownedBlockExternalId: "block-1",
          calendarExternalId: "calendar-1",
          revision: "revision-1",
          startsAt: "2026-07-23T09:00:00.000Z",
          endsAt: "2026-07-23T10:00:00.000Z",
        },
      },
      versions(taskId),
    );
    const secondStatusId = uuid();
    apply("taskStatus.create", {
      statusId: secondStatusId,
      label: "Blocked",
      operationalSemantics: "blocked",
    });
    apply(
      "task.setStatus",
      { taskId, statusId: secondStatusId },
      versions(taskId),
    );
    apply(
      "task.setOperationalState",
      {
        taskId,
        operationalState: "waiting",
        waitingOn: { kind: "external", label: "Review" },
      },
      versions(taskId),
    );
    apply("task.complete", { taskId }, versions(taskId));
    apply("task.reopen", { taskId }, versions(taskId));
    const assignmentId = uuid();
    apply(
      "task.assign",
      { assignmentId, taskId, assigneePrincipalId: ids.principal },
      versions(taskId),
    );
    apply(
      "task.unassign",
      { assignmentId, taskId },
      versions(taskId, assignmentId),
    );

    const removedTaskId = uuid();
    apply("task.create", {
      taskId: removedTaskId,
      spaceId: ids.rootSpace,
      title: "Task that goes away",
    });
    apply("task.remove", { taskId: removedTaskId }, versions(removedTaskId));

    // Projects and relations.
    const projectId = String(
      projection(
        apply("project.create", {
          spaceId: ids.rootSpace,
          title: "Revertability",
          intendedOutcome: "The published table matches the handlers",
        }),
      )["projectId"],
    );
    apply(
      "project.updateOutcome",
      { projectId, intendedOutcome: "The table is pinned by this test" },
      versions(projectId),
    );
    const relationId = String(
      projection(
        apply(
          "record.relate",
          { relationType: "task_contributes_to_project", taskId, projectId },
          versions(taskId, projectId),
        ),
      )["relationId"],
    );
    apply("record.unrelate", { relationId }, versions(relationId));

    // Knowledge.
    const sourceId = uuid();
    apply("knowledge.sourceCreate", {
      sourceId,
      spaceId: ids.rootSpace,
      sourceKind: "url",
      title: "Compensation notes",
      canonicalUrl: "https://example.com/notes",
      availability: "reference_only",
      observedAt: "2026-07-22T09:00:00.000Z",
    });
    apply(
      "knowledge.sourceUpdate",
      {
        sourceId,
        title: "Compensation notes, revised",
        availability: "reference_only",
        observedAt: "2026-07-22T10:00:00.000Z",
      },
      versions(sourceId),
    );
    const documentId = uuid();
    apply("document.create", {
      documentId,
      spaceId: ids.rootSpace,
      title: "Compensation report",
      role: "deliverable",
    });
    apply(
      "knowledge.documentSetEvidence",
      { documentId, sourceIds: [sourceId], noteDocumentIds: [] },
      versions(documentId, sourceId),
    );
    apply(
      "knowledge.namedVersionCreate",
      {
        namedVersionId: uuid(),
        documentId,
        documentRevisionId: uuid(),
        name: "Delivered · 22 July",
        milestone: "delivered",
        contentSnapshot: "The compensation table and its pin.",
      },
      versions(documentId, sourceId),
    );

    // Strategic depth.
    const areaId = uuid();
    apply("area.create", {
      areaId,
      spaceId: ids.rootSpace,
      title: "Agent surface",
      responsibility: "Keep the MCP contract honest",
    });
    apply(
      "area.updateResponsibility",
      { areaId, responsibility: "Keep the MCP contract honest and legible" },
      versions(areaId),
    );
    const initiativeId = uuid();
    apply("initiative.create", {
      initiativeId,
      spaceId: ids.rootSpace,
      title: "Revertable slices",
      intendedOutcome: "Agents size their writes before making them",
    });
    apply(
      "initiative.updateOutcome",
      {
        initiativeId,
        intendedOutcome: "Agents size their writes from the catalog",
      },
      versions(initiativeId),
    );
    const linkId = uuid();
    apply("work.linkCreate", {
      linkId,
      spaceId: ids.rootSpace,
      linkType: "project_advances_initiative",
      sourceRecordId: projectId,
      targetRecordId: initiativeId,
    });
    apply("work.linkRemove", { linkId }, versions(linkId));

    // A created record and its removal are the same recordState toggle seen
    // from two sides, so both arms are exercised for every kind: the create
    // records the compensation that takes it back, the removal the one that
    // restores it. Removal is refused while anything still points at the
    // record, so each kind is removed from the leaves inwards.
    const organizationId = uuid();
    apply("relationship.organizationCreate", {
      organizationId,
      spaceId: ids.rootSpace,
      name: "Kept organization",
      relationshipState: "active",
    });
    const personId = uuid();
    apply("relationship.personCreate", {
      personId,
      spaceId: ids.rootSpace,
      name: "Named contact",
      organizationId,
      role: "Sponsor",
    });
    const opportunityId = uuid();
    apply("opportunity.create", {
      opportunityId,
      spaceId: ids.rootSpace,
      title: "Compensation review",
      organizationId,
      personIds: [personId],
      need: "Every agent write can be taken back.",
      qualification: "The catalog and the handlers agree.",
      stage: "qualified",
      nextAction: "Pin the table with this test.",
      evidenceSourceIds: [sourceId],
    });
    const offerId = uuid();
    apply("opportunity.offerCreate", {
      offerId,
      opportunityId,
      deliverableDocumentId: documentId,
      title: "Compensation offer",
      ownerPrincipalId: ids.principal,
      state: "ready",
      nextAction: "Send once the table is pinned.",
    });
    const factId = uuid();
    apply("relationship.factCreate", {
      factId,
      spaceId: ids.rootSpace,
      organizationId,
      factType: "agent_surface",
      value: "Operates over MCP",
      evidenceSourceIds: [sourceId],
      verifiedAt: "2026-07-22T09:00:00.000Z",
      staleAfter: "2027-01-22T09:00:00.000Z",
    });
    const decisionId = uuid();
    apply("decision.create", {
      decisionId,
      spaceId: ids.rootSpace,
      title: "Removal is a soft delete",
      rationale: "History and audit outlive the record leaving the graph.",
      evidenceSourceIds: [sourceId],
      linkedRecordIds: [taskId],
    });
    const renewalId = uuid();
    apply("relationship.renewalCreate", {
      renewalId,
      followUpTaskId: uuid(),
      spaceId: ids.rootSpace,
      organizationId,
      title: "Support entitlement",
      scope: "Managed support",
      expiresAt: "2027-03-31T12:00:00.000Z",
      leadTimeDays: 30,
      ownerPrincipalId: ids.principal,
      evidenceSourceIds: [sourceId],
      cycleKey: "support:2027-03",
    });

    apply("decision.remove", { decisionId }, versions(decisionId));
    apply("relationship.factRemove", { factId }, versions(factId));
    apply("relationship.renewalRemove", { renewalId }, versions(renewalId));
    apply("opportunity.offerRemove", { offerId }, versions(offerId));
    apply("opportunity.remove", { opportunityId }, versions(opportunityId));
    apply("relationship.personRemove", { personId }, versions(personId));
    apply(
      "relationship.organizationRemove",
      { organizationId },
      versions(organizationId),
    );

    // The three records that keep their own table, each removed from a state
    // where nothing points at it: the guard is the subject of its own test.
    const removedProjectId = String(
      projection(
        apply("project.create", {
          spaceId: ids.rootSpace,
          title: "Project that goes away",
        }),
      )["projectId"],
    );
    apply(
      "project.remove",
      { projectId: removedProjectId },
      versions(removedProjectId),
    );
    const removedDocumentId = uuid();
    apply("document.create", {
      documentId: removedDocumentId,
      spaceId: ids.rootSpace,
      title: "Document that goes away",
    });
    apply(
      "document.remove",
      { documentId: removedDocumentId },
      versions(removedDocumentId),
    );
    const removedSourceId = uuid();
    apply("knowledge.sourceCreate", {
      sourceId: removedSourceId,
      spaceId: ids.rootSpace,
      sourceKind: "url",
      title: "Source that goes away",
      canonicalUrl: "https://example.com/removed",
      availability: "reference_only",
      observedAt: "2026-07-22T11:00:00.000Z",
    });
    apply(
      "knowledge.sourceRemove",
      { sourceId: removedSourceId },
      versions(removedSourceId),
    );

    const removedAreaId = uuid();
    apply("area.create", {
      areaId: removedAreaId,
      spaceId: ids.rootSpace,
      title: "Area that goes away",
    });
    apply("area.remove", { areaId: removedAreaId }, versions(removedAreaId));
    const removedInitiativeId = uuid();
    apply("initiative.create", {
      initiativeId: removedInitiativeId,
      spaceId: ids.rootSpace,
      title: "Initiative that goes away",
    });
    apply(
      "initiative.remove",
      { initiativeId: removedInitiativeId },
      versions(removedInitiativeId),
    );

    const savedViewId = uuid();
    apply("savedView.create", {
      savedViewId,
      spaceId: ids.rootSpace,
      name: "Waiting",
      filters: { operationalStates: ["waiting"] },
      sort: "updated_desc",
    });
    apply(
      "savedView.rename",
      { savedViewId, name: "Waiting on review" },
      versions(savedViewId),
    );
    apply(
      "savedView.update",
      { savedViewId, sort: "due_asc" },
      versions(savedViewId),
    );
    apply("savedView.delete", { savedViewId }, versions(savedViewId));

    // Templates, field definitions and automations.
    const templateId = uuid();
    apply("template.create", {
      templateId,
      name: "Delivery",
      taskTitles: ["Kickoff"],
    });
    apply(
      "template.rename",
      { templateId, name: "Delivery run" },
      versions(templateId),
    );
    apply(
      "template.updateContents",
      { templateId, taskTitles: ["Kickoff", "Review"] },
      versions(templateId),
    );
    apply("template.archive", { templateId }, versions(templateId));
    apply("template.restore", { templateId }, versions(templateId));
    apply(
      "project.applyTemplate",
      { projectId, templateId },
      versions(projectId),
    );

    const fieldId = uuid();
    apply("fieldDef.create", {
      fieldId,
      targetKind: "task",
      label: "Effort",
      type: { kind: "number" },
    });
    apply(
      "fieldDef.rename",
      { fieldId, label: "Effort days" },
      versions(fieldId),
    );
    apply("fieldDef.archive", { fieldId }, versions(fieldId));
    apply("fieldDef.restore", { fieldId }, versions(fieldId));
    apply(
      "record.setFieldValue",
      {
        targetKind: "task",
        recordId: taskId,
        fieldId,
        value: { kind: "number", value: 3 },
      },
      versions(taskId),
    );

    const ruleId = uuid();
    apply("automation.create", {
      ruleId,
      name: "Completed lands in Doing",
      recipe: { kind: "complete_sets_status", statusId },
    });
    apply(
      "automation.rename",
      { ruleId, name: "Completed lands in progress" },
      versions(ruleId),
    );
    apply(
      "automation.setState",
      { ruleId, state: "disabled" },
      versions(ruleId),
    );

    // Meetings.
    const meetingId = uuid();
    const workItemId = uuid();
    apply("meeting.upsertImported", {
      meeting: {
        id: meetingId,
        workspaceId: ids.workspace,
        spaceId: ids.rootSpace,
        connectionId: "revertability-connection",
        externalMeetingId: "meeting-1",
        title: "Compensation review",
        startedAt: "2026-07-20T09:00:00.000Z",
        participants: [{ externalId: "participant-1", name: "Antek" }],
        workItems: [
          {
            id: workItemId,
            kind: "follow_up",
            sourceExternalId: "item-1",
            title: "Publish the table",
            state: "open",
            sourceControlled: true,
            locallyModified: false,
            version: 1,
          },
        ],
        contentHash: "b".repeat(64),
        triage: "ready",
        missingComponents: [],
        version: 1,
        updatedAt: "2026-07-20T10:00:00.000Z",
      },
    });
    apply("meeting.route", { meetingId, projectId }, versions(meetingId));
    const localWorkItemId = uuid();
    apply(
      "meeting.addWorkItem",
      {
        meetingId,
        workItemId: localWorkItemId,
        kind: "task",
        title: "Pin the table",
      },
      versions(meetingId),
    );
    apply(
      "meeting.editWorkItem",
      {
        meetingId,
        workItemId: localWorkItemId,
        expectedWorkItemVersion: 1,
        title: "Pin the table with a test",
        state: "open",
      },
      versions(meetingId),
    );
    apply(
      "meeting.correctWorkItemResponsibility",
      {
        meetingId,
        workItemId: localWorkItemId,
        expectedWorkItemVersion: 2,
        name: "Antek",
      },
      versions(meetingId),
    );
    apply(
      "meeting.promoteWorkItem",
      { meetingId, workItemId, taskId: uuid() },
      versions(meetingId),
    );
    apply(
      "meeting.linkParticipants",
      { meetingId, personIdPool: [uuid()] },
      versions(meetingId),
    );

    // capture.process reaches two different routing paths depending on its
    // destination, so "always" is only true if both of them compensate.
    const knowledgeCaptureId = captureText("A note that becomes a source");
    const knowledgeRoute = applied.length;
    apply(
      "capture.process",
      { captureId: knowledgeCaptureId, destination: "knowledge_source" },
      versions(knowledgeCaptureId),
    );
    const taskCaptureId = captureText("A note that becomes a task");
    const taskRoute = applied.length;
    apply(
      "capture.process",
      { captureId: taskCaptureId, destination: "task" },
      versions(taskCaptureId),
    );

    const compensated = new Set<string>(
      (harness.store.snapshot().undoDescriptors ?? []).map(
        (descriptor) => descriptor.targetCommandId,
      ),
    );
    for (const [index, entry] of applied.entries()) {
      assert.equal(
        compensated.has(entry.commandId),
        COMMAND_REVERTABILITY[entry.commandName] === "always",
        `${entry.commandName} (step ${index}) does not match its published revertability`,
      );
    }
    assert.ok(
      compensated.has(applied[knowledgeRoute]!.commandId) &&
        compensated.has(applied[taskRoute]!.commandId),
      "both Capture destinations compensate, which is what makes capture.process always revertable",
    );

    const exercised = new Set<string>(
      applied.map((entry) => entry.commandName),
    );
    const unexercised = Object.entries(COMMAND_REVERTABILITY)
      .filter(([name, value]) => value !== "never" && !exercised.has(name))
      .map(([name]) => name)
      .sort();
    assert.deepEqual(
      unexercised,
      [],
      "every command the catalog advertises as revertable is executed here",
    );
  });
});
