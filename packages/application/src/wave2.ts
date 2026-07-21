import {
  canCommentInSpace,
  canEditSpace,
  canManageWorkspaceAccess,
  canViewSpace,
  effectiveSpaceAccess,
} from "./collaboration-policy.js";
import type { z } from "zod";

import type { StrategicRecordProjectionSchema } from "@constellation/contracts";
import {
  AuditReceiptIdSchema,
  CommandOutcomeSchema,
  DocumentIdSchema,
  EventIdSchema,
  OutboxEntryIdSchema,
  ProjectIdSchema,
  QueryResultSchema,
  RelationIdSchema,
  TaskIdSchema,
  type RelationId,
  type AutomationRuleId,
  type TaskId,
  type ProjectId,
  type RelationCondition,
  TaskAssignmentIdSchema,
  AttentionSignalIdSchema,
  KnowledgeSourceIdSchema,
  NamedDocumentVersionIdSchema,
  StrategicRecordIdSchema,
  type CommandEnvelope,
  type CommandOutcome,
  type ExecutionContext,
  type ImportedMeeting,
  type StrategicRecordId,
  type QueryEnvelope,
  type QueryResult,
  type SpaceId,
  type WorkspaceId,
} from "@constellation/contracts";
import {
  completeTask,
  assignTask,
  createProject,
  automationRuleState,
  createAutomationRule,
  createFieldDefinition,
  createProjectTemplate,
  createTask,
  projectTemplateState,
  updateAutomationRule,
  updateProjectTemplate,
  updateSavedView,
  type SavedViewUpdate,
  createTaskStatus,
  fieldDefinitionState,
  fieldValueMatchesType,
  MAX_POPULATED_FIELDS,
  updateFieldDefinition,
  withFieldValue,
  isTaskTimingValid,
  setTaskParent,
  taskStatusState,
  updateTaskStatusDefinition,
  taskTimingAfterUpdate,
  updateTaskDetails,
  createNativeDocument,
  relateTaskToProject,
  removeTaskProjectRelation,
  reopenTask,
  removeTaskAssignment,
  editComment,
  setCommentThreadState,
  setAttentionState,
  createKnowledgeSource,
  updateKnowledgeSource,
  setDocumentEvidence,
  createNamedDocumentVersion,
  voidNamedDocumentVersion,
  createOrganization,
  createPerson,
  createOpportunity,
  createOffer,
  linkOpportunityOutcomes,
  createRenewal,
  createRelationshipFact,
  createDecision,
  createArea,
  createInitiative,
  createWorkLink,
  createSavedView,
  createRecurrence,
  createRadarCandidate,
  closeProject,
  reopenProject,
  restoreTaskProjectRelation,
  setTaskStatus,
  setTaskOperationalState,
  undoCaptureTaskRoute,
  undoCaptureKnowledgeRoute,
  updateProjectOutcome,
  type AuditReceipt,
  type DomainEvent,
  type FieldDefinition,
  type FieldDefinitionUpdate,
  type AutomationRule,
  type AutomationRuleUpdate,
  type ProjectTemplate,
  type ProjectTemplateUpdate,
  type TaskStatusDefinition,
  type TaskStatusDefinitionUpdate,
  type Workspace,
  type OutboxEntry,
  type Project,
  type Task,
  type TaskAssignment,
  type TaskProjectRelation,
  type UndoDescriptor,
  type RecordComment,
  type AttentionSignal,
  type CommentTarget,
  type AttentionDestination,
  type Capture,
  type KnowledgeSource,
  type NativeDocument,
  type StrategicRecord,
  type DocumentEntityTargetKind,
} from "@constellation/domain";

import type {
  ApplicationKernelDependencies,
  ApplicationReadView,
  ApplicationTransaction,
  ApplicationWave2ReadView,
  ApplicationWave2Transaction,
  IdempotencyRecord,
  StoreFreshness,
} from "./ports.js";
import { evaluateRelationConditions } from "./relation-conditions.js";
import {
  addMeetingWorkItem,
  correctMeetingWorkItemResponsibility,
  editMeetingWorkItem,
} from "./meeting-work-items.js";
import {
  isApplicationWave2ReadView,
  isApplicationWave2Transaction,
  RetryableUnitOfWorkError,
} from "./ports.js";

type DomainEventBody = DomainEvent extends infer Event
  ? Event extends DomainEvent
    ? Omit<Event, "id" | "commandId">
    : never
  : never;

export type Wave2Command = Extract<
  CommandEnvelope,
  {
    commandName:
      | "project.create"
      | "document.create"
      | "knowledge.sourceCreate"
      | "knowledge.sourceUpdate"
      | "knowledge.documentSetEvidence"
      | "knowledge.namedVersionCreate"
      | "knowledge.namedVersionVoid"
      | "relationship.organizationCreate"
      | "relationship.personCreate"
      | "opportunity.create"
      | "opportunity.offerCreate"
      | "opportunity.linkOutcomes"
      | "relationship.renewalCreate"
      | "relationship.renewalResolve"
      | "relationship.factCreate"
      | "decision.create"
      | "decision.supersede"
      | "decision.resolveImpact"
      | "area.create"
      | "initiative.create"
      | "work.linkCreate"
      | "work.linkRemove"
      | "savedView.create"
      | "savedView.rename"
      | "savedView.update"
      | "savedView.delete"
      | "recurrence.create"
      | "recurrence.generateOccurrence"
      | "project.close"
      | "project.reopen"
      | "radar.candidateUpsert"
      | "radar.resolve"
      | "meeting.upsertImported"
      | "meeting.route"
      | "meeting.promoteWorkItem"
      | "meeting.linkParticipants"
      | "meeting.editWorkItem"
      | "meeting.correctWorkItemResponsibility"
      | "meeting.addWorkItem"
      | "project.updateOutcome"
      | "task.create"
      | "task.updateDetails"
      | "task.setParent"
      | "template.create"
      | "automation.create"
      | "automation.rename"
      | "automation.setState"
      | "automation.sweep"
      | "recurrence.sweep"
      | "task.setCalendarBlock"
      | "template.rename"
      | "template.updateContents"
      | "template.archive"
      | "template.restore"
      | "project.applyTemplate"
      | "fieldDef.create"
      | "fieldDef.rename"
      | "fieldDef.archive"
      | "fieldDef.restore"
      | "record.setFieldValue"
      | "taskStatus.create"
      | "taskStatus.rename"
      | "taskStatus.setSemantics"
      | "taskStatus.reorder"
      | "taskStatus.archive"
      | "taskStatus.restore"
      | "workspace.setDefaultTaskStatus"
      | "task.setStatus"
      | "task.setOperationalState"
      | "task.complete"
      | "task.reopen"
      | "task.remove"
      | "task.assign"
      | "task.unassign"
      | "comment.add"
      | "comment.edit"
      | "comment.resolve"
      | "comment.reopen"
      | "attention.markRead"
      | "attention.dismiss"
      | "record.relate"
      | "record.unrelate"
      | "command.previewUndo"
      | "command.undo";
  }
>;

export type Wave2Query = Extract<
  QueryEnvelope,
  {
    queryName:
      | "project.list"
      | "document.list"
      | "document.linkCandidates"
      | "document.backlinks"
      | "knowledge.list"
      | "knowledge.documentContext"
      | "relationship.workspace"
      | "radar.review"
      | "project.operationalOverview"
      | "search.global"
      | "cockpit.week"
      | "activity.meaningful"
      | "activity.changeFeed"
      | "recovery.preview"
      | "comment.list"
      | "comment.mentionCandidates"
      | "attention.inbox"
      | "work.overview";
  }
>;

const authorized = (
  dependencies: Pick<ApplicationKernelDependencies, "authorization">,
  view: ApplicationWave2ReadView,
  context: ExecutionContext,
  command: Wave2Command,
  spaceId: SpaceId | undefined,
): boolean =>
  spaceId !== undefined &&
  canEditSpace(view, context, command.workspaceId, spaceId) &&
  dependencies.authorization.authorize({
    context,
    capability: command.commandName,
    workspaceId: command.workspaceId,
    spaceId,
  });

export const isWave2CommandAuthorized = (
  dependencies: Pick<ApplicationKernelDependencies, "authorization">,
  view: ApplicationReadView,
  context: ExecutionContext,
  command: Wave2Command,
): boolean => {
  if (!isApplicationWave2ReadView(view)) return false;
  if (context.workspaceId !== command.workspaceId) return false;
  switch (command.commandName) {
    case "project.create": {
      const space = view.getSpace(command.payload.spaceId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        space?.workspaceId === command.workspaceId ? space.id : undefined,
      );
    }
    case "document.create": {
      const space = view.getSpace(command.payload.spaceId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        space?.workspaceId === command.workspaceId ? space.id : undefined,
      );
    }
    case "knowledge.sourceCreate": {
      const space = view.getSpace(command.payload.spaceId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        space?.workspaceId === command.workspaceId ? space.id : undefined,
      );
    }
    case "knowledge.sourceUpdate": {
      const source = view.getKnowledgeSource(command.payload.sourceId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        source?.workspaceId === command.workspaceId
          ? source.spaceId
          : undefined,
      );
    }
    case "knowledge.documentSetEvidence":
    case "knowledge.namedVersionCreate": {
      const document = view.getDocument(command.payload.documentId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        document?.workspaceId === command.workspaceId
          ? document.spaceId
          : undefined,
      );
    }
    case "knowledge.namedVersionVoid": {
      const namedVersion = view.getNamedDocumentVersion(
        command.payload.namedVersionId,
      );
      return authorized(
        dependencies,
        view,
        context,
        command,
        namedVersion?.workspaceId === command.workspaceId
          ? namedVersion.spaceId
          : undefined,
      );
    }
    case "relationship.organizationCreate":
    case "relationship.personCreate":
    case "opportunity.create": {
      const space = view.getSpace(command.payload.spaceId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        space?.workspaceId === command.workspaceId ? space.id : undefined,
      );
    }
    case "opportunity.offerCreate":
    case "opportunity.linkOutcomes": {
      const opportunity = view.getStrategicRecord(
        command.payload.opportunityId,
      );
      return authorized(
        dependencies,
        view,
        context,
        command,
        opportunity?.workspaceId === command.workspaceId
          ? opportunity.spaceId
          : undefined,
      );
    }
    case "relationship.renewalCreate":
    case "relationship.factCreate":
    case "decision.create":
    case "area.create":
    case "initiative.create":
    case "work.linkCreate":
    case "savedView.create":
    case "recurrence.create":
    case "radar.candidateUpsert": {
      const space = view.getSpace(command.payload.spaceId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        space?.workspaceId === command.workspaceId ? space.id : undefined,
      );
    }
    case "savedView.rename":
    case "savedView.update":
    case "savedView.delete": {
      const record = view.getStrategicRecord(command.payload.savedViewId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        record?.workspaceId === command.workspaceId
          ? record.spaceId
          : undefined,
      );
    }
    case "relationship.renewalResolve": {
      const record = view.getStrategicRecord(command.payload.renewalId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        record?.workspaceId === command.workspaceId
          ? record.spaceId
          : undefined,
      );
    }
    case "work.linkRemove": {
      const record = view.getStrategicRecord(command.payload.linkId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        record?.workspaceId === command.workspaceId
          ? record.spaceId
          : undefined,
      );
    }
    case "decision.supersede": {
      const record = view.getStrategicRecord(command.payload.priorDecisionId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        record?.workspaceId === command.workspaceId
          ? record.spaceId
          : undefined,
      );
    }
    case "decision.resolveImpact": {
      const record = view.getStrategicRecord(command.payload.impactReviewId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        record?.workspaceId === command.workspaceId
          ? record.spaceId
          : undefined,
      );
    }
    case "recurrence.generateOccurrence":
    case "radar.resolve": {
      const record = view.getStrategicRecord(
        command.commandName === "recurrence.generateOccurrence"
          ? command.payload.recurrenceId
          : command.payload.candidateId,
      );
      return authorized(
        dependencies,
        view,
        context,
        command,
        record?.workspaceId === command.workspaceId
          ? record.spaceId
          : undefined,
      );
    }
    case "project.close":
    case "project.reopen": {
      const project = view.getProject(command.payload.projectId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        project?.workspaceId === command.workspaceId
          ? project.spaceId
          : undefined,
      );
    }
    case "meeting.upsertImported": {
      const meeting = command.payload.meeting;
      return authorized(
        dependencies,
        view,
        context,
        command,
        meeting.workspaceId === command.workspaceId
          ? meeting.spaceId
          : undefined,
      );
    }
    case "meeting.route": {
      const record = view.getStrategicRecord(command.payload.meetingId);
      if (record?.kind !== "meeting") return false;
      // A Space move must be permitted in both the current and target Space.
      if (
        command.commandName === "meeting.route" &&
        command.payload.spaceId !== undefined &&
        command.payload.spaceId !== record.spaceId
      ) {
        const target = view.getSpace(command.payload.spaceId);
        if (
          target?.workspaceId !== command.workspaceId ||
          !canEditSpace(view, context, command.workspaceId, target.id) ||
          !dependencies.authorization.authorize({
            context,
            capability: command.commandName,
            workspaceId: command.workspaceId,
            spaceId: target.id,
          })
        ) {
          return false;
        }
      }
      return authorized(dependencies, view, context, command, record.spaceId);
    }
    case "meeting.promoteWorkItem": {
      const record = view.getStrategicRecord(command.payload.meetingId);
      if (record?.kind !== "meeting") return false;
      // ADR-040 §7: promotion inserts a Task directly, so it must not become a
      // privilege path around the Task-creation grant.
      return (
        authorized(dependencies, view, context, command, record.spaceId) &&
        dependencies.authorization.authorize({
          context,
          capability: "task.create",
          workspaceId: command.workspaceId,
          spaceId: record.spaceId,
        })
      );
    }
    case "meeting.editWorkItem":
    case "meeting.correctWorkItemResponsibility":
    case "meeting.addWorkItem": {
      const record = view.getStrategicRecord(command.payload.meetingId);
      if (record?.kind !== "meeting") return false;
      // Correcting a work item is ordinary meeting work: it writes nothing
      // outside the meeting record, so it carries no additional grant the way
      // promotion (task.create) and linking (relationship.personCreate) do.
      return authorized(dependencies, view, context, command, record.spaceId);
    }
    case "meeting.linkParticipants": {
      const record = view.getStrategicRecord(command.payload.meetingId);
      if (record?.kind !== "meeting") return false;
      // Linking can create a Person, so it carries the relationship grant too.
      return (
        authorized(dependencies, view, context, command, record.spaceId) &&
        dependencies.authorization.authorize({
          context,
          capability: "relationship.personCreate",
          workspaceId: command.workspaceId,
          spaceId: record.spaceId,
        })
      );
    }
    case "project.updateOutcome": {
      const project = view.getProject(command.payload.projectId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        project?.workspaceId === command.workspaceId
          ? project.spaceId
          : undefined,
      );
    }
    case "task.create": {
      const space = view.getSpace(command.payload.spaceId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        space?.workspaceId === command.workspaceId ? space.id : undefined,
      );
    }
    case "template.create":
    case "template.rename":
    case "template.updateContents":
    case "template.archive":
    case "template.restore":
    case "automation.create":
    case "automation.rename":
    case "automation.setState":
    case "recurrence.sweep": {
      // Maintenance like automation.sweep, but it inserts Tasks directly, so
      // it carries the Task-creation grant too rather than becoming a path
      // around it (the rule ADR-040 §7 established for meeting promotion).
      return (
        view.getWorkspace(command.workspaceId) !== undefined &&
        canManageWorkspaceAccess(view, context, command.workspaceId) &&
        dependencies.authorization.authorize({
          context,
          capability: command.commandName,
          workspaceId: command.workspaceId,
        }) &&
        dependencies.authorization.authorize({
          context,
          capability: "task.create",
          workspaceId: command.workspaceId,
        })
      );
    }
    case "automation.sweep":
    case "fieldDef.create":
    case "fieldDef.rename":
    case "fieldDef.archive":
    case "fieldDef.restore":
    case "taskStatus.create":
    case "taskStatus.rename":
    case "taskStatus.setSemantics":
    case "taskStatus.reorder":
    case "taskStatus.archive":
    case "taskStatus.restore":
    case "workspace.setDefaultTaskStatus": {
      // Workflow definitions are workspace-level shared configuration:
      // maintainers (owner/admin) publish them; the capability grant still
      // gates each operation for agents and humans alike.
      return (
        view.getWorkspace(command.workspaceId) !== undefined &&
        canManageWorkspaceAccess(view, context, command.workspaceId) &&
        dependencies.authorization.authorize({
          context,
          capability: command.commandName,
          workspaceId: command.workspaceId,
        })
      );
    }
    case "project.applyTemplate": {
      const project = view.getProject(command.payload.projectId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        project?.workspaceId === command.workspaceId
          ? project.spaceId
          : undefined,
      );
    }
    case "record.setFieldValue": {
      const record =
        command.payload.targetKind === "task"
          ? view.getTask(TaskIdSchema.parse(command.payload.recordId))
          : view.getProject(ProjectIdSchema.parse(command.payload.recordId));
      return authorized(
        dependencies,
        view,
        context,
        command,
        record?.workspaceId === command.workspaceId
          ? record.spaceId
          : undefined,
      );
    }
    case "task.updateDetails":
    case "task.setCalendarBlock":
    case "task.setParent":
    case "task.setStatus":
    case "task.setOperationalState":
    case "task.complete":
    case "task.reopen":
    case "task.remove":
    case "task.assign":
    case "task.unassign": {
      const task = view.getTask(command.payload.taskId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        task?.workspaceId === command.workspaceId ? task.spaceId : undefined,
      );
    }
    case "comment.add": {
      const target = command.payload.target;
      const record =
        target.kind === "task"
          ? view.getTask(target.taskId)
          : view.getProject(target.projectId);
      const spaceId =
        record?.workspaceId === command.workspaceId
          ? record.spaceId
          : undefined;
      return (
        spaceId !== undefined &&
        canCommentInSpace(view, context, command.workspaceId, spaceId) &&
        dependencies.authorization.authorize({
          context,
          capability: command.commandName,
          workspaceId: command.workspaceId,
          spaceId,
        })
      );
    }
    case "comment.edit":
    case "comment.resolve":
    case "comment.reopen": {
      const comment = view.getComment(command.payload.commentId);
      const spaceId =
        comment?.workspaceId === command.workspaceId
          ? comment.spaceId
          : undefined;
      return (
        spaceId !== undefined &&
        canCommentInSpace(view, context, command.workspaceId, spaceId) &&
        dependencies.authorization.authorize({
          context,
          capability:
            command.commandName === "comment.resolve" ||
            command.commandName === "comment.reopen"
              ? "comment.resolve"
              : "comment.edit",
          workspaceId: command.workspaceId,
          spaceId,
        })
      );
    }
    case "attention.markRead":
    case "attention.dismiss": {
      const signal = view.getAttentionSignal(command.payload.attentionSignalId);
      return (
        signal?.workspaceId === command.workspaceId &&
        signal.targetPrincipalId === context.principalId &&
        canViewSpace(view, context, command.workspaceId, signal.spaceId) &&
        dependencies.authorization.authorize({
          context,
          capability: command.commandName,
          workspaceId: command.workspaceId,
          spaceId: signal.spaceId,
        })
      );
    }
    case "record.relate": {
      const task = view.getTask(command.payload.taskId);
      const project = view.getProject(command.payload.projectId);
      const spaceId =
        task?.workspaceId === command.workspaceId &&
        project?.workspaceId === command.workspaceId &&
        task.spaceId === project.spaceId
          ? task.spaceId
          : undefined;
      return authorized(dependencies, view, context, command, spaceId);
    }
    case "record.unrelate": {
      const relation = view.getRelation(command.payload.relationId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        relation?.workspaceId === command.workspaceId
          ? relation.spaceId
          : undefined,
      );
    }
    case "command.previewUndo":
    case "command.undo": {
      const receipt = view.getAuditReceiptByCommand(
        command.payload.targetCommandId,
      );
      return authorized(
        dependencies,
        view,
        context,
        command,
        receipt?.workspaceId === command.workspaceId
          ? receipt.spaceId
          : undefined,
      );
    }
  }
};

const outcome = (
  command: CommandEnvelope,
  kernelTime: string,
  body: Record<string, unknown>,
): CommandOutcome =>
  CommandOutcomeSchema.parse({
    contractVersion: 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    kernelTime,
    ...body,
  });

const exactExpected = (
  command: CommandEnvelope,
  versions: Readonly<Record<string, number>>,
): boolean => {
  const expectedKeys = Object.keys(command.expectedVersions).sort();
  const versionKeys = Object.keys(versions).sort();
  return (
    expectedKeys.length === versionKeys.length &&
    expectedKeys.every(
      (key, index) =>
        key === versionKeys[index] &&
        command.expectedVersions[key] === versions[key],
    )
  );
};

const auditReceipt = (
  id: AuditReceipt["id"],
  context: ExecutionContext,
  command: CommandEnvelope,
  spaceId: SpaceId,
  recordVersions: Readonly<Record<string, number>>,
  changedFields: readonly string[],
  occurredAt: string,
): AuditReceipt => ({
  id,
  workspaceId: command.workspaceId,
  spaceId,
  principalId: context.principalId,
  grantId: context.grantId,
  origin: context.origin,
  commandId: command.commandId,
  commandName: command.commandName,
  correlationId: command.correlationId,
  affectedRecordIds: Object.keys(recordVersions),
  recordVersions,
  changedFields,
  occurredAt,
  outcome: "success",
  ...(command.checkpointId === undefined
    ? {}
    : { checkpointId: command.checkpointId }),
  ...(context.hostRun?.agentRunId === undefined
    ? {}
    : { agentRunId: context.hostRun.agentRunId }),
  ...(context.hostRun?.runId === undefined
    ? {}
    : { hostRunId: context.hostRun.runId }),
});

const appendJournal = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationWave2Transaction,
  context: ExecutionContext,
  command: Wave2Command,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
  event: DomainEventBody,
  recordVersions: Readonly<Record<string, number>>,
  changedFields: readonly string[],
  result: Record<string, unknown>,
  undoDescriptor?: UndoDescriptor,
  affectedKinds?: Readonly<
    Record<
      string,
      | "capture"
      | "task"
      | "taskAssignment"
      | "project"
      | "document"
      | "knowledgeSource"
      | "namedDocumentVersion"
      | "strategicRecord"
      | "relation"
      | "comment"
      | "attentionSignal"
      | "taskStatus"
      | "workspace"
      | "fieldDefinition"
      | "projectTemplate"
      | "automationRule"
    >
  >,
): CommandOutcome => {
  const eventId = EventIdSchema.parse(dependencies.ids.next("event"));
  const auditReceiptId = AuditReceiptIdSchema.parse(
    dependencies.ids.next("auditReceipt"),
  );
  const outboxEntryId = OutboxEntryIdSchema.parse(
    dependencies.ids.next("outboxEntry"),
  );
  const committed = outcome(command, occurredAt, {
    outcome: "success",
    affected: Object.entries(recordVersions).map(([recordId, version]) => ({
      recordId,
      recordKind:
        affectedKinds?.[recordId] ??
        (event.type.startsWith("project.")
          ? "project"
          : event.type.startsWith("relation.")
            ? "relation"
            : "task"),
      version,
    })),
    auditReceiptId,
    ...result,
  });
  const storedEvent = {
    id: eventId,
    commandId: command.commandId,
    ...event,
  } as DomainEvent;
  const audit = auditReceipt(
    auditReceiptId,
    context,
    command,
    event.spaceId,
    recordVersions,
    changedFields,
    occurredAt,
  );
  const outbox: OutboxEntry = {
    id: outboxEntryId,
    workspaceId: command.workspaceId,
    spaceId: event.spaceId,
    eventId,
    topic: "work.projection.requested",
    createdAt: occurredAt,
  };
  transaction.insertEvent(storedEvent);
  transaction.insertAuditReceipt(audit);
  transaction.insertIdempotency({ ...idempotency, outcome: committed });
  transaction.insertSyncCommand(command);
  transaction.insertOutbox(outbox);
  if (undoDescriptor !== undefined)
    transaction.insertUndoDescriptor(undoDescriptor);
  return committed;
};

type SavedViewFilters = Extract<
  StrategicRecord,
  { kind: "saved_view" }
>["filters"];

// ADR-045. The R12.4 relation keys were accepted and stored while nothing read
// them — a filter that silently did nothing. They now become the equivalent
// relation conditions, which is the ADR-044 §4 intent finally honoured. An
// empty legacy array contributes no condition: that preserves its historical
// meaning exactly (it never constrained anything) rather than inventing a
// filter that matches nothing.
export const translatedRelationConditions = (filters: {
  readonly relationConditions?: readonly RelationCondition[] | undefined;
  readonly projectIds?: readonly ProjectId[] | undefined;
  readonly areaIds?: readonly StrategicRecordId[] | undefined;
  readonly initiativeIds?: readonly StrategicRecordId[] | undefined;
}): readonly RelationCondition[] => [
  ...(filters.relationConditions ?? []),
  ...(filters.projectIds !== undefined && filters.projectIds.length > 0
    ? [
        {
          path: "project",
          predicate: { field: "id", in: [...filters.projectIds] },
        } satisfies RelationCondition,
      ]
    : []),
  ...(filters.areaIds !== undefined && filters.areaIds.length > 0
    ? [
        {
          path: "project.area",
          predicate: { field: "id", in: [...filters.areaIds] },
        } satisfies RelationCondition,
      ]
    : []),
  ...(filters.initiativeIds !== undefined && filters.initiativeIds.length > 0
    ? [
        {
          path: "project.initiative",
          predicate: { field: "id", in: [...filters.initiativeIds] },
        } satisfies RelationCondition,
      ]
    : []),
];

// The command schema caps relation conditions, and the same schema validates
// the stored record on the way out, so a translation that pushed the list past
// the cap would store a view that can never be projected again.
export const MAX_SAVED_VIEW_RELATION_CONDITIONS = 10;

// Copying key-by-key is what let R12.4's filters be dropped by savedView.create
// (fixed in PR #75) and what let the projection drift (PR #95). This copies
// every defined key generically instead, so a key added to the vocabulary
// cannot be forgotten here. The input is already parsed by the strict
// SavedViewFiltersSchema, so no unexpected key can arrive through it.
const savedViewFilters = (filters: {
  readonly [K in keyof SavedViewFilters]?: SavedViewFilters[K] | undefined;
}): SavedViewFilters => {
  const conditions = translatedRelationConditions(filters);
  const { projectIds, areaIds, initiativeIds, ...rest } = filters;
  void projectIds;
  void areaIds;
  void initiativeIds;
  return Object.fromEntries(
    Object.entries({
      ...rest,
      ...(conditions.length === 0 ? {} : { relationConditions: conditions }),
    }).filter(([, value]) => value !== undefined),
  ) as SavedViewFilters;
};

// ADR-041 §4. Cadence arithmetic is UTC and clamps a day-of-month that does
// not exist in the target month to that month's last day, so a month-end
// cadence still fires every month. The accepted consequence is that a 31st
// cadence drifts down once it passes through February.
const advanceCadence = (
  instant: string,
  cadence: "daily" | "weekly" | "monthly" | "yearly",
): string => {
  const date = new Date(instant);
  if (cadence === "daily" || cadence === "weekly") {
    date.setUTCDate(date.getUTCDate() + (cadence === "daily" ? 1 : 7));
    return date.toISOString();
  }
  const day = date.getUTCDate();
  const target = new Date(instant);
  // Move to the first of the month before shifting, so a long month never
  // rolls the shift into the month after the intended one.
  target.setUTCDate(1);
  if (cadence === "monthly") target.setUTCMonth(target.getUTCMonth() + 1);
  else target.setUTCFullYear(target.getUTCFullYear() + 1);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
};

// ADR-041 §3. A missed cadence produces one occurrence, not a backlog: roll
// forward by whole steps until the next due instant is in the future.
const rollForward = (
  instant: string,
  cadence: "daily" | "weekly" | "monthly" | "yearly",
  now: string,
): string => {
  let next = advanceCadence(instant, cadence);
  // Bounded so a corrupt far-past instant can never spin: a daily cadence
  // five years behind still converges well inside this budget.
  for (let step = 0; step < 2000 && Date.parse(next) <= Date.parse(now); step++)
    next = advanceCadence(next, cadence);
  // Exhausting the budget must still yield a future instant. Returning a past
  // one would leave the cadence permanently due, generating one occurrence
  // every day instead of resuming its real rhythm. Re-anchor on now instead.
  return Date.parse(next) > Date.parse(now)
    ? next
    : advanceCadence(now, cadence);
};

const appendStrategicJournal = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationWave2Transaction,
  context: ExecutionContext,
  command: Wave2Command,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
  record: StrategicRecord,
  changedFields: readonly string[],
  additionalVersions: Readonly<Record<string, number>> = {},
  additionalKinds: Readonly<
    Record<
      string,
      "task" | "project" | "attentionSignal" | "relation" | "strategicRecord"
    >
  > = {},
  undoDescriptor?: UndoDescriptor,
): CommandOutcome =>
  appendJournal(
    dependencies,
    transaction,
    context,
    command,
    idempotency,
    occurredAt,
    {
      type: "strategic.record_changed",
      workspaceId: record.workspaceId,
      spaceId: record.spaceId,
      aggregateId: record.id,
      aggregateVersion: record.version,
      occurredAt,
    },
    { [record.id]: record.version, ...additionalVersions },
    changedFields,
    {
      diagnosticCode: "strategic.record_changed",
      projection: {
        kind: "strategic.record_changed",
        recordId: record.id,
        recordType: record.kind,
        version: record.version,
      },
    },
    undoDescriptor,
    {
      [record.id]: "strategicRecord",
      ...additionalKinds,
    },
  );

const versionConflict = (
  command: Wave2Command,
  occurredAt: string,
  currentVersions: Record<string, number>,
): CommandOutcome =>
  outcome(command, occurredAt, {
    outcome: "conflict",
    diagnosticCode: "record.version_conflict",
    currentVersions,
  });

const precondition = (
  command: Wave2Command,
  occurredAt: string,
): CommandOutcome =>
  outcome(command, occurredAt, {
    outcome: "rejected",
    diagnosticCode: "command.precondition_failed",
  });

const taskProjection = (kind: string, task: Task): Record<string, unknown> => ({
  kind,
  taskId: task.id,
  statusId: task.statusId,
  completionState: task.completionState,
  ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
  version: task.version,
});

const targetRecord = (
  view: ApplicationWave2ReadView,
  target: AttentionDestination,
): Task | Project | NativeDocument | Capture | undefined =>
  target.kind === "task"
    ? view.getTask(target.taskId)
    : target.kind === "project"
      ? view.getProject(target.projectId)
      : target.kind === "document"
        ? view.getDocument(target.documentId)
        : view.getCapture(target.captureId);

// ADR-043 §4 — the read-side view of a target record: a removed Task must be
// invisible, the same way the list primitives already hide it. targetRecord
// itself stays unfiltered because write-side guards need to see a removed Task
// to reject an operation on it; the filtering belongs at the read callsite.
const activeTargetRecord = (
  view: ApplicationWave2ReadView,
  target: AttentionDestination,
): Task | Project | NativeDocument | Capture | undefined => {
  const record = targetRecord(view, target);
  return record !== undefined &&
    "recordState" in record &&
    record.recordState === "removed"
    ? undefined
    : record;
};

export interface ResolvedDocumentEntityTarget {
  readonly targetKind: DocumentEntityTargetKind;
  readonly targetId: string;
  readonly label: string;
  readonly spaceId: SpaceId;
}

export const resolveDocumentEntityTarget = (
  view: ApplicationWave2ReadView,
  workspaceId: WorkspaceId,
  targetKind: DocumentEntityTargetKind,
  targetId: string,
): ResolvedDocumentEntityTarget | undefined => {
  if (targetKind === "task") {
    const task = view.getTask(TaskIdSchema.parse(targetId));
    return task?.workspaceId === workspaceId && task.recordState === "active"
      ? { targetKind, targetId, label: task.title, spaceId: task.spaceId }
      : undefined;
  }
  if (targetKind === "project") {
    const project = view.getProject(ProjectIdSchema.parse(targetId));
    return project?.workspaceId === workspaceId
      ? { targetKind, targetId, label: project.title, spaceId: project.spaceId }
      : undefined;
  }
  const record = view.getStrategicRecord(
    StrategicRecordIdSchema.parse(targetId),
  );
  if (
    record?.workspaceId !== workspaceId ||
    record.kind !== targetKind ||
    !["person", "organization", "meeting"].includes(record.kind)
  )
    return undefined;
  const label =
    record.kind === "meeting"
      ? (record.meeting.title ?? "Spotkanie bez tytułu")
      : record.name;
  return { targetKind, targetId, label, spaceId: record.spaceId };
};

const documentEntityCandidates = (
  view: ApplicationWave2ReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
): readonly ResolvedDocumentEntityTarget[] => {
  const work = [
    ...view.listTasksInSpace(workspaceId, spaceId).map((task) => ({
      targetKind: "task" as const,
      targetId: task.id,
      label: task.title,
      spaceId,
    })),
    ...view.listProjects(workspaceId, spaceId).map((project) => ({
      targetKind: "project" as const,
      targetId: project.id,
      label: project.title,
      spaceId,
    })),
    ...view
      .listStrategicRecords(workspaceId, spaceId)
      .flatMap((record): readonly ResolvedDocumentEntityTarget[] => {
        if (record.kind === "person" || record.kind === "organization")
          return [
            {
              targetKind: record.kind,
              targetId: record.id,
              label: record.name,
              spaceId,
            },
          ];
        if (record.kind === "meeting")
          return [
            {
              targetKind: "meeting",
              targetId: record.id,
              label: record.meeting.title ?? "Spotkanie bez tytułu",
              spaceId,
            },
          ];
        return [];
      }),
  ];
  return work.sort(
    (left, right) =>
      left.label.localeCompare(right.label, "pl", { sensitivity: "base" }) ||
      left.targetKind.localeCompare(right.targetKind) ||
      left.targetId.localeCompare(right.targetId),
  );
};

const attentionDetail = (reason: AttentionSignal["reason"]): string => {
  switch (reason) {
    case "comment_mention":
      return "You were mentioned in a comment.";
    case "task_assignment":
      return "You are responsible for this Task.";
    case "knowledge_evidence_changed":
      return "Source evidence changed after the latest named version.";
    case "renewal_due":
      return "A date-aware renewal has one follow-up ready for review.";
    case "relationship_fact_stale":
      return "A time-sensitive relationship fact needs verification.";
    case "decision_impact_review":
      return "A replacement Decision has unresolved consequences.";
    case "capture_duplicate":
      return "This capture matches an existing item. Choose its destination, keep it unclassified, or dismiss the signal.";
    case "capture_ambiguous":
      return "Deterministic rules cannot choose a destination. Choose one or keep the original unclassified.";
    case "capture_unsupported":
      return "The original is preserved but this input cannot be processed automatically.";
    case "capture_parsing_failure":
      return "The preserved original could not be parsed. Retry or keep it unclassified.";
    case "capture_permission_failure":
      return "Processing lacks current permission. Restore access and retry, or keep the original unclassified.";
    case "capture_stale_conflict":
      return "The destination changed during processing. Retry against the current version.";
    case "capture_missing_target":
      return "The intended destination no longer exists. Choose another destination or keep the original unclassified.";
    case "capture_missing_payload":
      return "The managed original is unavailable. Replace it with verified bytes or keep the Capture unclassified.";
    case "capture_partial_payload_transfer":
      return "Only part of the managed original reached the Data Home. Retry or replace it without losing the local original.";
    case "capture_unknown_reconcile":
      return "The external result is unknown. Reconcile and retry without creating a second record.";
    case "sync_conflict":
      return "An offline change needs reconciliation.";
    case "waiting_review_elapsed":
      return "A waiting Task's review date has passed. Check on the waiting work.";
  }
};

const targetId = (target: CommentTarget): string =>
  target.kind === "task" ? target.taskId : target.projectId;

const eligibleMention = (
  view: ApplicationWave2ReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
  principalId: ExecutionContext["principalId"],
): boolean => {
  const membership = view.getMembership(workspaceId, principalId);
  if (membership === undefined || membership.status === "revoked") return false;
  const workspace = view.getWorkspace(workspaceId);
  return (
    (membership.role === "owner" && workspace?.rootSpaceId === spaceId) ||
    view.getSpaceGrantForPrincipal(workspaceId, spaceId, principalId)
      ?.status === "active"
  );
};

const upsertAttention = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationWave2Transaction,
  input: Omit<
    AttentionSignal,
    "id" | "version" | "state" | "occurredAt" | "updatedAt"
  >,
  occurredAt: string,
): AttentionSignal => {
  const current = transaction.findAttentionSignalByDeduplicationKey(
    input.workspaceId,
    input.targetPrincipalId,
    input.deduplicationKey,
  );
  if (current !== undefined) {
    const reopened = { ...current };
    delete reopened.readAt;
    delete reopened.dismissedAt;
    const updated: AttentionSignal = {
      ...reopened,
      ...input,
      state: "unread",
      version: current.version + 1,
      occurredAt,
      updatedAt: occurredAt,
    };
    if (!transaction.updateAttentionSignal(updated, current.version))
      throw new RetryableUnitOfWorkError();
    return updated;
  }
  const created: AttentionSignal = {
    id: AttentionSignalIdSchema.parse(dependencies.ids.next("attentionSignal")),
    ...input,
    state: "unread",
    version: 1,
    occurredAt,
    updatedAt: occurredAt,
  };
  transaction.insertAttentionSignal(created);
  return created;
};

export const executeWave2Command = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationTransaction,
  context: ExecutionContext,
  command: Wave2Command,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
): CommandOutcome => {
  if (!isApplicationWave2Transaction(transaction)) {
    return precondition(command, occurredAt);
  }
  switch (command.commandName) {
    case "document.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getDocument(command.payload.documentId) !== undefined) {
        return precondition(command, occurredAt);
      }
      const document = createNativeDocument({
        id: DocumentIdSchema.parse(command.payload.documentId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        ...(command.payload.role === undefined
          ? {}
          : { role: command.payload.role }),
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertDocument(document);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "document.created",
          workspaceId: document.workspaceId,
          spaceId: document.spaceId,
          aggregateId: document.id,
          aggregateVersion: document.version,
          occurredAt,
        },
        { [document.id]: document.version },
        ["title"],
        {
          diagnosticCode: "document.created",
          projection: {
            kind: "document.created",
            documentId: document.id,
            title: document.title,
            role: document.role ?? "document",
            version: document.version,
          },
        },
        undefined,
        { [document.id]: "document" },
      );
    }
    case "knowledge.sourceCreate": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (
        transaction.getKnowledgeSource(command.payload.sourceId) !== undefined
      )
        return precondition(command, occurredAt);
      const source = createKnowledgeSource({
        id: KnowledgeSourceIdSchema.parse(command.payload.sourceId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        sourceKind: command.payload.sourceKind,
        title: command.payload.title,
        ...(command.payload.canonicalUrl === undefined
          ? {}
          : { canonicalUrl: command.payload.canonicalUrl }),
        ...(command.payload.excerpt === undefined
          ? {}
          : { excerpt: command.payload.excerpt }),
        availability: command.payload.availability,
        observedAt: command.payload.observedAt,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertKnowledgeSource(source);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "knowledge.source_created",
          workspaceId: source.workspaceId,
          spaceId: source.spaceId,
          aggregateId: source.id,
          aggregateVersion: source.version,
          occurredAt,
        },
        { [source.id]: source.version },
        [
          "sourceKind",
          "title",
          "canonicalUrl",
          "excerpt",
          "availability",
          "observedAt",
        ],
        {
          diagnosticCode: "knowledge.source_created",
          projection: {
            kind: "knowledge.source_created",
            sourceId: source.id,
            title: source.title,
            version: source.version,
          },
        },
        undefined,
        { [source.id]: "knowledgeSource" },
      );
    }
    case "knowledge.sourceUpdate": {
      const source = transaction.getKnowledgeSource(command.payload.sourceId);
      if (source === undefined) return precondition(command, occurredAt);
      const expected = { [source.id]: source.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const updated = updateKnowledgeSource(source, {
        title: command.payload.title,
        ...(command.payload.canonicalUrl === undefined
          ? {}
          : { canonicalUrl: command.payload.canonicalUrl }),
        ...(command.payload.excerpt === undefined
          ? {}
          : { excerpt: command.payload.excerpt }),
        availability: command.payload.availability,
        observedAt: command.payload.observedAt,
        occurredAt,
      });
      if (!transaction.updateKnowledgeSource(updated, source.version))
        return versionConflict(command, occurredAt, expected);
      const signals = transaction
        .listDocuments(source.workspaceId, source.spaceId)
        .flatMap((document) => {
          const latest = transaction
            .listNamedDocumentVersions(
              source.workspaceId,
              source.spaceId,
              document.id,
            )
            .find((version) => version.state === "active");
          if (
            latest === undefined ||
            !latest.evidence.some(
              (item) =>
                item.kind === "source" &&
                item.recordId === source.id &&
                item.version === source.version,
            ) ||
            !eligibleMention(
              transaction,
              source.workspaceId,
              source.spaceId,
              document.createdBy,
            )
          )
            return [];
          return [
            upsertAttention(
              dependencies,
              transaction,
              {
                workspaceId: source.workspaceId,
                spaceId: source.spaceId,
                targetPrincipalId: document.createdBy,
                reason: "knowledge_evidence_changed",
                destination: { kind: "document", documentId: document.id },
                sourceRecordId: source.id,
                deduplicationKey: `knowledge_evidence:${document.id}:${document.createdBy}`,
                urgency: "in_app",
              },
              occurredAt,
            ),
          ];
        });
      const recordVersions = {
        [updated.id]: updated.version,
        ...Object.fromEntries(
          signals.map((signal) => [signal.id, signal.version]),
        ),
      };
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "knowledge.source_updated",
          workspaceId: updated.workspaceId,
          spaceId: updated.spaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        recordVersions,
        ["title", "canonicalUrl", "excerpt", "availability", "observedAt"],
        {
          diagnosticCode: "knowledge.source_updated",
          projection: {
            kind: "knowledge.source_updated",
            sourceId: updated.id,
            title: updated.title,
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: source.workspaceId,
          spaceId: source.spaceId,
          kind: "knowledge.restore_source",
          sourceId: source.id,
          priorTitle: source.title,
          ...(source.canonicalUrl === undefined
            ? {}
            : { priorCanonicalUrl: source.canonicalUrl }),
          ...(source.excerpt === undefined
            ? {}
            : { priorExcerpt: source.excerpt }),
          priorAvailability: source.availability,
          priorObservedAt: source.observedAt,
          resultingVersion: updated.version,
        },
        {
          [updated.id]: "knowledgeSource",
          ...Object.fromEntries(
            signals.map((signal) => [signal.id, "attentionSignal" as const]),
          ),
        },
      );
    }
    case "knowledge.documentSetEvidence": {
      const document = transaction.getDocument(command.payload.documentId);
      if (document === undefined) return precondition(command, occurredAt);
      const sources = command.payload.sourceIds.map((id) =>
        transaction.getKnowledgeSource(id),
      );
      const notes = command.payload.noteDocumentIds.map((id) =>
        transaction.getDocument(id),
      );
      if (
        sources.some(
          (source) =>
            source === undefined ||
            source.workspaceId !== document.workspaceId ||
            source.spaceId !== document.spaceId,
        ) ||
        notes.some(
          (note) =>
            note === undefined ||
            note.workspaceId !== document.workspaceId ||
            note.spaceId !== document.spaceId ||
            (note.role ?? "document") !== "note" ||
            note.id === document.id,
        )
      )
        return precondition(command, occurredAt);
      const expected = {
        [document.id]: document.version,
        ...Object.fromEntries(
          sources.map((source) => [source!.id, source!.version]),
        ),
        ...Object.fromEntries(notes.map((note) => [note!.id, note!.version])),
      };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const updated = setDocumentEvidence(document, {
        sourceIds: command.payload.sourceIds,
        noteDocumentIds: command.payload.noteDocumentIds,
        occurredAt,
      });
      if (!transaction.updateDocument(updated, document.version))
        return versionConflict(command, occurredAt, expected);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "knowledge.evidence_updated",
          workspaceId: updated.workspaceId,
          spaceId: updated.spaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["evidence"],
        {
          diagnosticCode: "knowledge.evidence_updated",
          projection: {
            kind: "knowledge.evidence_updated",
            documentId: updated.id,
            evidenceCount:
              (updated.evidence?.sourceIds.length ?? 0) +
              (updated.evidence?.noteDocumentIds.length ?? 0),
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: document.workspaceId,
          spaceId: document.spaceId,
          kind: "knowledge.restore_evidence",
          documentId: document.id,
          priorSourceIds: document.evidence?.sourceIds ?? [],
          priorNoteDocumentIds: document.evidence?.noteDocumentIds ?? [],
          resultingVersion: updated.version,
        },
        { [updated.id]: "document" },
      );
    }
    case "knowledge.namedVersionCreate": {
      const document = transaction.getDocument(command.payload.documentId);
      if (
        document === undefined ||
        transaction.getNamedDocumentVersion(command.payload.namedVersionId) !==
          undefined
      )
        return precondition(command, occurredAt);
      const sourceIds = document.evidence?.sourceIds ?? [];
      const noteIds = document.evidence?.noteDocumentIds ?? [];
      const sources = sourceIds.map((id) => transaction.getKnowledgeSource(id));
      const notes = noteIds.map((id) => transaction.getDocument(id));
      if (
        sources.some((value) => value === undefined) ||
        notes.some((value) => value === undefined)
      )
        return precondition(command, occurredAt);
      const expected = {
        [document.id]: document.version,
        ...Object.fromEntries(
          sources.map((value) => [value!.id, value!.version]),
        ),
        ...Object.fromEntries(
          notes.map((value) => [value!.id, value!.version]),
        ),
      };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const namedVersion = createNamedDocumentVersion({
        id: NamedDocumentVersionIdSchema.parse(command.payload.namedVersionId),
        workspaceId: document.workspaceId,
        spaceId: document.spaceId,
        documentId: document.id,
        documentRevisionId: command.payload.documentRevisionId,
        name: command.payload.name,
        milestone: command.payload.milestone,
        contentSnapshot: command.payload.contentSnapshot,
        evidence: [
          ...sources.map((source) => ({
            kind: "source" as const,
            recordId: source!.id,
            version: source!.version,
            title: source!.title,
          })),
          ...notes.map((note) => ({
            kind: "note" as const,
            recordId: note!.id,
            version: note!.version,
            title: note!.title,
          })),
        ],
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertNamedDocumentVersion(namedVersion);
      const staleSignal = transaction.findAttentionSignalByDeduplicationKey(
        document.workspaceId,
        document.createdBy,
        `knowledge_evidence:${document.id}:${document.createdBy}`,
      );
      const clearedSignal =
        staleSignal === undefined || staleSignal.state === "dismissed"
          ? undefined
          : setAttentionState(staleSignal, "dismissed", occurredAt);
      if (
        clearedSignal !== undefined &&
        !transaction.updateAttentionSignal(clearedSignal, staleSignal!.version)
      )
        throw new RetryableUnitOfWorkError();
      const namedRecordVersions = {
        [namedVersion.id]: namedVersion.version,
        ...(clearedSignal === undefined
          ? {}
          : { [clearedSignal.id]: clearedSignal.version }),
      };
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "knowledge.named_version_created",
          workspaceId: namedVersion.workspaceId,
          spaceId: namedVersion.spaceId,
          aggregateId: namedVersion.id,
          aggregateVersion: namedVersion.version,
          occurredAt,
        },
        namedRecordVersions,
        [
          "documentRevisionId",
          "name",
          "milestone",
          "contentSnapshot",
          "evidence",
        ],
        {
          diagnosticCode: "knowledge.named_version_created",
          projection: {
            kind: "knowledge.named_version_created",
            namedVersionId: namedVersion.id,
            documentId: namedVersion.documentId,
            documentRevisionId: namedVersion.documentRevisionId,
            state: namedVersion.state,
            version: namedVersion.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: namedVersion.workspaceId,
          spaceId: namedVersion.spaceId,
          kind: "knowledge.void_named_version",
          namedVersionId: namedVersion.id,
          resultingVersion: namedVersion.version,
        },
        {
          [namedVersion.id]: "namedDocumentVersion",
          ...(clearedSignal === undefined
            ? {}
            : { [clearedSignal.id]: "attentionSignal" as const }),
        },
      );
    }
    case "knowledge.namedVersionVoid": {
      const namedVersion = transaction.getNamedDocumentVersion(
        command.payload.namedVersionId,
      );
      if (namedVersion === undefined || namedVersion.state === "voided")
        return precondition(command, occurredAt);
      const expected = { [namedVersion.id]: namedVersion.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const voided = voidNamedDocumentVersion(namedVersion, {
        principalId: context.principalId,
        occurredAt,
      });
      if (!transaction.updateNamedDocumentVersion(voided, namedVersion.version))
        return versionConflict(command, occurredAt, expected);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "knowledge.named_version_voided",
          workspaceId: voided.workspaceId,
          spaceId: voided.spaceId,
          aggregateId: voided.id,
          aggregateVersion: voided.version,
          occurredAt,
        },
        { [voided.id]: voided.version },
        ["state", "voidedAt", "voidedBy"],
        {
          diagnosticCode: "knowledge.named_version_voided",
          projection: {
            kind: "knowledge.named_version_voided",
            namedVersionId: voided.id,
            documentId: voided.documentId,
            documentRevisionId: voided.documentRevisionId,
            state: voided.state,
            version: voided.version,
          },
        },
        undefined,
        { [voided.id]: "namedDocumentVersion" },
      );
    }
    case "relationship.organizationCreate": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getStrategicRecord(command.payload.organizationId))
        return precondition(command, occurredAt);
      const record = createOrganization({
        id: StrategicRecordIdSchema.parse(command.payload.organizationId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        name: command.payload.name,
        relationshipState: command.payload.relationshipState,
        ...(command.payload.nextAction === undefined
          ? {}
          : { nextAction: command.payload.nextAction }),
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "strategic.record_changed",
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          aggregateId: record.id,
          aggregateVersion: record.version,
          occurredAt,
        },
        { [record.id]: record.version },
        ["name", "relationshipState", "nextAction"],
        {
          diagnosticCode: "strategic.record_changed",
          projection: {
            kind: "strategic.record_changed",
            recordId: record.id,
            recordType: record.kind,
            version: record.version,
          },
        },
        undefined,
        { [record.id]: "strategicRecord" },
      );
    }
    case "relationship.renewalCreate": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (
        transaction.getStrategicRecord(command.payload.renewalId) !==
          undefined ||
        transaction.getTask(command.payload.followUpTaskId) !== undefined
      )
        return precondition(command, occurredAt);
      const organization = transaction.getStrategicRecord(
        command.payload.organizationId,
      );
      const sources = command.payload.evidenceSourceIds.map((id) =>
        transaction.getKnowledgeSource(id),
      );
      const owner = transaction.getMembership(
        command.workspaceId,
        command.payload.ownerPrincipalId,
      );
      const duplicateCycle = transaction
        .listStrategicRecords(command.workspaceId, command.payload.spaceId)
        .some(
          (record) =>
            record.kind === "renewal" &&
            record.organizationId === command.payload.organizationId &&
            record.cycleKey === command.payload.cycleKey,
        );
      if (
        organization?.kind !== "organization" ||
        organization.spaceId !== command.payload.spaceId ||
        owner === undefined ||
        owner.status === "revoked" ||
        duplicateCycle ||
        sources.some(
          (source) =>
            source === undefined ||
            source.workspaceId !== command.workspaceId ||
            source.spaceId !== command.payload.spaceId,
        )
      )
        return precondition(command, occurredAt);
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      const record = createRenewal({
        id: StrategicRecordIdSchema.parse(command.payload.renewalId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        organizationId: organization.id,
        title: command.payload.title,
        scope: command.payload.scope,
        expiresAt: command.payload.expiresAt,
        leadTimeDays: command.payload.leadTimeDays,
        ownerPrincipalId: command.payload.ownerPrincipalId,
        evidenceSourceIds: command.payload.evidenceSourceIds,
        followUpTaskId: TaskIdSchema.parse(command.payload.followUpTaskId),
        cycleKey: command.payload.cycleKey,
        createdBy: context.principalId,
        occurredAt,
      });
      const reviewDueAt = new Date(
        Date.parse(record.expiresAt) -
          record.leadTimeDays * 24 * 60 * 60 * 1_000,
      ).toISOString();
      const task: Task = {
        id: record.followUpTaskId,
        workspaceId: record.workspaceId,
        spaceId: record.spaceId,
        title: `Review renewal: ${record.title}`,
        // The follow-up carries the renewal review moment as its deadline so
        // date-aware views surface it without a separate side list.
        dueAt: reviewDueAt,
        statusId: workspace.defaultTaskStatusId,
        recordState: "active",
        completionState: "open",
        operationalState: "actionable",
        createdBy: context.principalId,
        version: 1,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      transaction.insertStrategicRecord(record);
      transaction.insertTask(task);
      const signal = upsertAttention(
        dependencies,
        transaction,
        {
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          targetPrincipalId: record.ownerPrincipalId,
          reason: "renewal_due",
          destination: { kind: "task", taskId: task.id },
          sourceRecordId: record.id,
          deduplicationKey: `renewal:${record.id}:${record.cycleKey}`,
          urgency: "in_app",
        },
        occurredAt,
      );
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        [
          "organizationId",
          "expiresAt",
          "leadTimeDays",
          "evidenceSourceIds",
          "followUpTaskId",
          "cycleKey",
          "state",
        ],
        { [task.id]: task.version, [signal.id]: signal.version },
        { [task.id]: "task", [signal.id]: "attentionSignal" },
      );
    }
    case "relationship.renewalResolve": {
      const current = transaction.getStrategicRecord(command.payload.renewalId);
      if (current?.kind !== "renewal" || current.state !== "watching")
        return precondition(command, occurredAt);
      const task = transaction.getTask(current.followUpTaskId);
      if (task === undefined) return precondition(command, occurredAt);
      const expected = {
        [current.id]: current.version,
        [task.id]: task.version,
      };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const record: StrategicRecord = {
        ...current,
        state: command.payload.state,
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      const updatedTask =
        task.completionState === "completed"
          ? task
          : completeTask(task, occurredAt);
      if (!transaction.updateStrategicRecord(record, current.version))
        return versionConflict(command, occurredAt, expected);
      if (
        updatedTask !== task &&
        !transaction.updateTask(updatedTask, task.version)
      )
        throw new RetryableUnitOfWorkError();
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["state"],
        { [updatedTask.id]: updatedTask.version },
        { [updatedTask.id]: "task" },
      );
    }
    case "relationship.factCreate": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getStrategicRecord(command.payload.factId) !== undefined)
        return precondition(command, occurredAt);
      const organization = transaction.getStrategicRecord(
        command.payload.organizationId,
      );
      const sources = command.payload.evidenceSourceIds.map((id) =>
        transaction.getKnowledgeSource(id),
      );
      if (
        organization?.kind !== "organization" ||
        organization.spaceId !== command.payload.spaceId ||
        sources.some(
          (source) =>
            source === undefined || source.spaceId !== command.payload.spaceId,
        )
      )
        return precondition(command, occurredAt);
      const record = createRelationshipFact({
        id: StrategicRecordIdSchema.parse(command.payload.factId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        organizationId: organization.id,
        factType: command.payload.factType,
        value: command.payload.value,
        evidenceSourceIds: command.payload.evidenceSourceIds,
        verifiedAt: command.payload.verifiedAt,
        staleAfter: command.payload.staleAfter,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        [
          "organizationId",
          "factType",
          "value",
          "evidenceSourceIds",
          "verifiedAt",
          "staleAfter",
          "state",
        ],
      );
    }
    case "decision.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (
        transaction.getStrategicRecord(command.payload.decisionId) !== undefined
      )
        return precondition(command, occurredAt);
      const sources = command.payload.evidenceSourceIds.map((id) =>
        transaction.getKnowledgeSource(id),
      );
      if (
        sources.some(
          (source) =>
            source === undefined || source.spaceId !== command.payload.spaceId,
        )
      )
        return precondition(command, occurredAt);
      const record = createDecision({
        id: StrategicRecordIdSchema.parse(command.payload.decisionId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        rationale: command.payload.rationale,
        evidenceSourceIds: command.payload.evidenceSourceIds,
        linkedRecordIds: command.payload.linkedRecordIds,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["title", "rationale", "evidenceSourceIds", "linkedRecordIds", "state"],
      );
    }
    case "decision.supersede": {
      const prior = transaction.getStrategicRecord(
        command.payload.priorDecisionId,
      );
      if (
        prior?.kind !== "decision" ||
        prior.state !== "current" ||
        transaction.getStrategicRecord(
          command.payload.replacementDecisionId,
        ) !== undefined ||
        transaction.getStrategicRecord(command.payload.impactReviewId) !==
          undefined
      )
        return precondition(command, occurredAt);
      const sources = command.payload.evidenceSourceIds.map((id) =>
        transaction.getKnowledgeSource(id),
      );
      if (
        sources.some(
          (source) => source === undefined || source.spaceId !== prior.spaceId,
        )
      )
        return precondition(command, occurredAt);
      const expected = { [prior.id]: prior.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const replacement = createDecision({
        id: StrategicRecordIdSchema.parse(
          command.payload.replacementDecisionId,
        ),
        workspaceId: prior.workspaceId,
        spaceId: prior.spaceId,
        title: command.payload.title,
        rationale: command.payload.rationale,
        evidenceSourceIds: command.payload.evidenceSourceIds,
        linkedRecordIds: command.payload.consequences.map(
          (item) => item.recordId,
        ),
        createdBy: context.principalId,
        occurredAt,
      });
      const superseded: StrategicRecord = {
        ...prior,
        state: "superseded",
        supersededById: replacement.id,
        supersededAt: occurredAt,
        version: prior.version + 1,
        updatedAt: occurredAt,
      };
      const review: StrategicRecord = {
        id: StrategicRecordIdSchema.parse(command.payload.impactReviewId),
        workspaceId: prior.workspaceId,
        spaceId: prior.spaceId,
        kind: "impact_review",
        priorDecisionId: prior.id,
        replacementDecisionId: replacement.id,
        reason: command.payload.reason,
        consequences: command.payload.consequences.map((item) => ({
          ...item,
          state: "open" as const,
        })),
        state: command.payload.consequences.length === 0 ? "resolved" : "open",
        createdBy: context.principalId,
        version: 1,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      if (!transaction.updateStrategicRecord(superseded, prior.version))
        return versionConflict(command, occurredAt, expected);
      transaction.insertStrategicRecord(replacement);
      transaction.insertStrategicRecord(review);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        review,
        [
          "priorDecisionId",
          "replacementDecisionId",
          "reason",
          "consequences",
          "state",
        ],
        {
          [superseded.id]: superseded.version,
          [replacement.id]: replacement.version,
        },
        {},
      );
    }
    case "decision.resolveImpact": {
      const current = transaction.getStrategicRecord(
        command.payload.impactReviewId,
      );
      if (current?.kind !== "impact_review" || current.state !== "open")
        return precondition(command, occurredAt);
      const consequence = current.consequences.find(
        (item) => item.recordId === command.payload.recordId,
      );
      if (consequence === undefined || consequence.state === "resolved")
        return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const consequences = current.consequences.map((item) =>
        item.recordId === consequence.recordId
          ? {
              ...item,
              state: "resolved" as const,
              resolution: command.payload.resolution,
            }
          : item,
      );
      const record: StrategicRecord = {
        ...current,
        consequences,
        state: consequences.every((item) => item.state === "resolved")
          ? "resolved"
          : "open",
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateStrategicRecord(record, current.version))
        return versionConflict(command, occurredAt, expected);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["consequences", "state"],
      );
    }
    case "area.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getStrategicRecord(command.payload.areaId) !== undefined)
        return precondition(command, occurredAt);
      const record = createArea({
        id: StrategicRecordIdSchema.parse(command.payload.areaId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        responsibility: command.payload.responsibility,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["title", "responsibility", "state"],
      );
    }
    case "initiative.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (
        transaction.getStrategicRecord(command.payload.initiativeId) !==
        undefined
      )
        return precondition(command, occurredAt);
      const record = createInitiative({
        id: StrategicRecordIdSchema.parse(command.payload.initiativeId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        intendedOutcome: command.payload.intendedOutcome,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["title", "intendedOutcome", "state"],
      );
    }
    case "work.linkCreate": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (
        transaction.getStrategicRecord(command.payload.linkId) !== undefined ||
        command.payload.sourceRecordId === command.payload.targetRecordId
      )
        return precondition(command, occurredAt);
      const sourceProject = transaction.getProject(
        ProjectIdSchema.parse(command.payload.sourceRecordId),
      );
      const sourceTask = transaction.getTask(
        TaskIdSchema.parse(command.payload.sourceRecordId),
      );
      const targetTask = transaction.getTask(
        TaskIdSchema.parse(command.payload.targetRecordId),
      );
      const targetStrategic = transaction.getStrategicRecord(
        StrategicRecordIdSchema.parse(command.payload.targetRecordId),
      );
      const valid =
        command.payload.linkType === "task_depends_on_task"
          ? sourceTask?.spaceId === command.payload.spaceId &&
            sourceTask.workspaceId === command.workspaceId &&
            targetTask?.spaceId === command.payload.spaceId &&
            targetTask.workspaceId === command.workspaceId
          : sourceProject?.spaceId === command.payload.spaceId &&
            sourceProject.workspaceId === command.workspaceId &&
            targetStrategic?.spaceId === command.payload.spaceId &&
            targetStrategic.workspaceId === command.workspaceId &&
            ((command.payload.linkType === "project_advances_initiative" &&
              targetStrategic.kind === "initiative") ||
              (command.payload.linkType === "project_serves_area" &&
                targetStrategic.kind === "area"));
      if (!valid) return precondition(command, occurredAt);
      const duplicate = transaction
        .listStrategicRecords(command.workspaceId, command.payload.spaceId)
        .some(
          (record) =>
            record.kind === "work_link" &&
            record.state === "active" &&
            record.linkType === command.payload.linkType &&
            record.sourceRecordId === command.payload.sourceRecordId &&
            record.targetRecordId === command.payload.targetRecordId,
        );
      if (duplicate) return precondition(command, occurredAt);
      const record = createWorkLink({
        id: StrategicRecordIdSchema.parse(command.payload.linkId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        linkType: command.payload.linkType,
        sourceRecordId: command.payload.sourceRecordId,
        targetRecordId: command.payload.targetRecordId,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["linkType", "sourceRecordId", "targetRecordId", "state"],
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          kind: "work_link.restore_state",
          linkId: record.id,
          priorState: "removed",
          priorRemovedAt: occurredAt,
          resultingVersion: record.version,
        },
      );
    }
    case "work.linkRemove": {
      const current = transaction.getStrategicRecord(command.payload.linkId);
      if (current?.kind !== "work_link" || current.state !== "active")
        return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const record: StrategicRecord = {
        ...current,
        state: "removed",
        removedAt: occurredAt,
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateStrategicRecord(record, current.version))
        return versionConflict(command, occurredAt, expected);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["state", "removedAt"],
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          kind: "work_link.restore_state",
          linkId: record.id,
          priorState: "active",
          resultingVersion: record.version,
        },
      );
    }
    case "savedView.rename":
    case "savedView.update":
    case "savedView.delete": {
      const record = transaction.getStrategicRecord(
        command.payload.savedViewId,
      );
      if (
        record?.kind !== "saved_view" ||
        record.workspaceId !== command.workspaceId ||
        record.state === "deleted"
      ) {
        return precondition(command, occurredAt);
      }
      let update: SavedViewUpdate;
      let changedFields: readonly string[];
      if (command.commandName === "savedView.rename") {
        if (command.payload.name === record.name) {
          return precondition(command, occurredAt);
        }
        update = { name: command.payload.name };
        changedFields = ["name"];
      } else if (command.commandName === "savedView.update") {
        if (
          command.payload.filters !== undefined &&
          translatedRelationConditions(command.payload.filters).length >
            MAX_SAVED_VIEW_RELATION_CONDITIONS
        )
          return precondition(command, occurredAt);
        update = {
          ...(command.payload.filters === undefined
            ? {}
            : { filters: savedViewFilters(command.payload.filters) }),
          ...(command.payload.sort === undefined
            ? {}
            : { sort: command.payload.sort }),
          ...(command.payload.groupBy === undefined
            ? {}
            : { groupBy: command.payload.groupBy }),
        };
        changedFields = [
          ...(command.payload.filters === undefined ? [] : ["filters"]),
          ...(command.payload.sort === undefined ? [] : ["sort"]),
          ...(command.payload.groupBy === undefined ? [] : ["groupBy"]),
        ];
        if (
          update.groupBy !== undefined &&
          update.groupBy !== null &&
          typeof update.groupBy === "object"
        ) {
          const definition = transaction.getFieldDefinition(
            update.groupBy.fieldId,
          );
          if (
            definition?.workspaceId !== command.workspaceId ||
            definition.type.kind !== "choice"
          ) {
            return precondition(command, occurredAt);
          }
        }
      } else {
        update = { state: "deleted" };
        changedFields = ["state"];
      }
      if (!exactExpected(command, { [record.id]: record.version })) {
        return versionConflict(command, occurredAt, {
          [record.id]: record.version,
        });
      }
      const updated = updateSavedView(record, update, occurredAt);
      if (!transaction.updateStrategicRecord(updated, record.version)) {
        return versionConflict(command, occurredAt, {
          [record.id]: record.version,
        });
      }
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        updated,
        changedFields,
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          kind: "savedView.restore_definition",
          savedViewId: record.id,
          priorName: record.name,
          priorFilters: record.filters,
          priorSort: record.sort,
          ...(record.groupBy === undefined
            ? {}
            : { priorGroupBy: record.groupBy }),
          priorState: record.state,
          resultingVersion: updated.version,
        },
      );
    }
    case "savedView.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (
        transaction.getStrategicRecord(command.payload.savedViewId) !==
        undefined
      )
        return precondition(command, occurredAt);
      // Translating the legacy keys can push the condition list past the cap
      // the schema enforces on the way back out. Refuse the write rather than
      // store a view that could never be projected again (ADR-045).
      if (
        translatedRelationConditions(command.payload.filters).length >
        MAX_SAVED_VIEW_RELATION_CONDITIONS
      )
        return precondition(command, occurredAt);
      const record = createSavedView({
        id: StrategicRecordIdSchema.parse(command.payload.savedViewId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        name: command.payload.name,
        filters: savedViewFilters(command.payload.filters),
        sort: command.payload.sort,
        ...(command.payload.groupBy === undefined
          ? {}
          : { groupBy: command.payload.groupBy }),
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["name", "filters", "sort", "state"],
      );
    }
    case "recurrence.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (
        transaction.getStrategicRecord(command.payload.recurrenceId) !==
        undefined
      )
        return precondition(command, occurredAt);
      const record = createRecurrence({
        id: StrategicRecordIdSchema.parse(command.payload.recurrenceId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        taskTitle: command.payload.taskTitle,
        ...(command.payload.contextRecordId === undefined
          ? {}
          : { contextRecordId: command.payload.contextRecordId }),
        cadence: command.payload.cadence,
        nextDueAt: command.payload.nextDueAt,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        [
          "title",
          "taskTitle",
          "contextRecordId",
          "cadence",
          "nextDueAt",
          "state",
        ],
      );
    }
    case "recurrence.generateOccurrence": {
      const current = transaction.getStrategicRecord(
        command.payload.recurrenceId,
      );
      if (
        current?.kind !== "recurrence" ||
        current.state !== "active" ||
        transaction.getTask(command.payload.occurrenceTaskId) !== undefined
      )
        return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      const task: Task = {
        id: TaskIdSchema.parse(command.payload.occurrenceTaskId),
        workspaceId: current.workspaceId,
        spaceId: current.spaceId,
        title: current.taskTitle,
        // The occurrence inherits the due moment it is generated for, so the
        // recurring responsibility lands in due-aware views without retyping.
        dueAt: current.nextDueAt,
        statusId: workspace.defaultTaskStatusId,
        recordState: "active",
        completionState: "open",
        operationalState: "actionable",
        createdBy: context.principalId,
        version: 1,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      const record: StrategicRecord = {
        ...current,
        lastOccurrenceTaskId: task.id,
        nextDueAt: command.payload.nextDueAt,
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      transaction.insertTask(task);
      if (!transaction.updateStrategicRecord(record, current.version))
        return versionConflict(command, occurredAt, expected);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["lastOccurrenceTaskId", "nextDueAt"],
        { [task.id]: task.version },
        { [task.id]: "task" },
      );
    }
    case "relationship.personCreate": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getStrategicRecord(command.payload.personId))
        return precondition(command, occurredAt);
      const organization =
        command.payload.organizationId === undefined
          ? undefined
          : transaction.getStrategicRecord(command.payload.organizationId);
      if (
        organization !== undefined &&
        (organization.kind !== "organization" ||
          organization.workspaceId !== command.workspaceId ||
          organization.spaceId !== command.payload.spaceId)
      )
        return precondition(command, occurredAt);
      if (
        command.payload.organizationId !== undefined &&
        organization === undefined
      )
        return precondition(command, occurredAt);
      const record = createPerson({
        id: StrategicRecordIdSchema.parse(command.payload.personId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        name: command.payload.name,
        ...(organization === undefined
          ? {}
          : { organizationId: organization.id }),
        ...(command.payload.role === undefined
          ? {}
          : { role: command.payload.role }),
        ...(command.payload.email === undefined
          ? {}
          : { email: command.payload.email }),
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "strategic.record_changed",
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          aggregateId: record.id,
          aggregateVersion: record.version,
          occurredAt,
        },
        { [record.id]: record.version },
        ["name", "organizationId", "role", "email"],
        {
          diagnosticCode: "strategic.record_changed",
          projection: {
            kind: "strategic.record_changed",
            recordId: record.id,
            recordType: record.kind,
            version: record.version,
          },
        },
        undefined,
        { [record.id]: "strategicRecord" },
      );
    }
    case "opportunity.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getStrategicRecord(command.payload.opportunityId))
        return precondition(command, occurredAt);
      const organization = transaction.getStrategicRecord(
        command.payload.organizationId,
      );
      const people = command.payload.personIds.map((id) =>
        transaction.getStrategicRecord(id),
      );
      const sources = command.payload.evidenceSourceIds.map((id) =>
        transaction.getKnowledgeSource(id),
      );
      if (
        organization?.kind !== "organization" ||
        organization.workspaceId !== command.workspaceId ||
        organization.spaceId !== command.payload.spaceId ||
        people.some(
          (person) =>
            person?.kind !== "person" ||
            person.workspaceId !== command.workspaceId ||
            person.spaceId !== command.payload.spaceId,
        ) ||
        sources.some(
          (source) =>
            source === undefined ||
            source.workspaceId !== command.workspaceId ||
            source.spaceId !== command.payload.spaceId,
        )
      )
        return precondition(command, occurredAt);
      const record = createOpportunity({
        id: StrategicRecordIdSchema.parse(command.payload.opportunityId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        organizationId: organization.id,
        personIds: command.payload.personIds,
        need: command.payload.need,
        qualification: command.payload.qualification,
        stage: command.payload.stage,
        nextAction: command.payload.nextAction,
        evidenceSourceIds: command.payload.evidenceSourceIds,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "strategic.record_changed",
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          aggregateId: record.id,
          aggregateVersion: record.version,
          occurredAt,
        },
        { [record.id]: record.version },
        [
          "title",
          "organizationId",
          "personIds",
          "need",
          "qualification",
          "stage",
          "nextAction",
          "evidenceSourceIds",
        ],
        {
          diagnosticCode: "strategic.record_changed",
          projection: {
            kind: "strategic.record_changed",
            recordId: record.id,
            recordType: record.kind,
            version: record.version,
          },
        },
        undefined,
        { [record.id]: "strategicRecord" },
      );
    }
    case "opportunity.offerCreate": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getStrategicRecord(command.payload.offerId))
        return precondition(command, occurredAt);
      const opportunity = transaction.getStrategicRecord(
        command.payload.opportunityId,
      );
      const document = transaction.getDocument(
        command.payload.deliverableDocumentId,
      );
      const owner = transaction.getMembership(
        command.workspaceId,
        command.payload.ownerPrincipalId,
      );
      if (
        opportunity?.kind !== "opportunity" ||
        document === undefined ||
        (document.role ?? "document") !== "deliverable" ||
        document.workspaceId !== command.workspaceId ||
        document.spaceId !== opportunity.spaceId ||
        owner === undefined ||
        owner.status === "revoked"
      )
        return precondition(command, occurredAt);
      const record = createOffer({
        id: StrategicRecordIdSchema.parse(command.payload.offerId),
        workspaceId: command.workspaceId,
        spaceId: opportunity.spaceId,
        title: command.payload.title,
        opportunityId: opportunity.id,
        deliverableDocumentId: document.id,
        ownerPrincipalId: command.payload.ownerPrincipalId,
        state: command.payload.state,
        nextAction: command.payload.nextAction,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "strategic.record_changed",
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          aggregateId: record.id,
          aggregateVersion: record.version,
          occurredAt,
        },
        { [record.id]: record.version },
        [
          "title",
          "opportunityId",
          "deliverableDocumentId",
          "ownerPrincipalId",
          "state",
          "nextAction",
        ],
        {
          diagnosticCode: "strategic.record_changed",
          projection: {
            kind: "strategic.record_changed",
            recordId: record.id,
            recordType: record.kind,
            version: record.version,
          },
        },
        undefined,
        { [record.id]: "strategicRecord" },
      );
    }
    case "opportunity.linkOutcomes": {
      const opportunity = transaction.getStrategicRecord(
        command.payload.opportunityId,
      );
      if (opportunity?.kind !== "opportunity")
        return precondition(command, occurredAt);
      const offers = command.payload.offerIds.map((id) =>
        transaction.getStrategicRecord(id),
      );
      const projects = command.payload.projectIds.map((id) =>
        transaction.getProject(id),
      );
      if (
        offers.some(
          (offer) =>
            offer?.kind !== "offer" ||
            offer.opportunityId !== opportunity.id ||
            offer.spaceId !== opportunity.spaceId,
        ) ||
        projects.some(
          (project) =>
            project === undefined ||
            project.workspaceId !== opportunity.workspaceId ||
            project.spaceId !== opportunity.spaceId,
        )
      )
        return precondition(command, occurredAt);
      const expected = {
        [opportunity.id]: opportunity.version,
        ...Object.fromEntries(
          offers.map((offer) => [offer!.id, offer!.version]),
        ),
        ...Object.fromEntries(
          projects.map((project) => [project!.id, project!.version]),
        ),
      };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const record = linkOpportunityOutcomes(opportunity, {
        offerIds: command.payload.offerIds,
        projectIds: command.payload.projectIds,
        state: command.payload.state,
        nextAction: command.payload.nextAction,
        occurredAt,
      });
      if (!transaction.updateStrategicRecord(record, opportunity.version))
        return versionConflict(command, occurredAt, expected);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "strategic.record_changed",
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          aggregateId: record.id,
          aggregateVersion: record.version,
          occurredAt,
        },
        { [record.id]: record.version },
        ["offerIds", "projectIds", "state", "nextAction"],
        {
          diagnosticCode: "strategic.record_changed",
          projection: {
            kind: "strategic.record_changed",
            recordId: record.id,
            recordType: record.kind,
            version: record.version,
          },
        },
        undefined,
        { [record.id]: "strategicRecord" },
      );
    }
    case "project.close":
    case "project.reopen": {
      const current = transaction.getProject(command.payload.projectId);
      if (
        current === undefined ||
        (command.commandName === "project.close" &&
          current.lifecycle === "closed") ||
        (command.commandName === "project.reopen" &&
          current.lifecycle === "active")
      )
        return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const relatedTaskIds = new Set(
        transaction
          .listRelations(current.workspaceId, current.spaceId)
          .filter(
            (relation) =>
              relation.projectId === current.id && relation.state === "active",
          )
          .map((relation) => relation.taskId),
      );
      const unresolvedTaskCount = transaction
        .listTasksInSpace(current.workspaceId, current.spaceId)
        .filter(
          (task) =>
            relatedTaskIds.has(task.id) && task.completionState === "open",
        ).length;
      const project =
        command.commandName === "project.close"
          ? closeProject(current, context.principalId, occurredAt)
          : reopenProject(current, occurredAt);
      if (!transaction.updateProject(project, current.version))
        return versionConflict(command, occurredAt, expected);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "project.lifecycle_changed",
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          aggregateId: project.id,
          aggregateVersion: project.version,
          occurredAt,
        },
        { [project.id]: project.version },
        ["lifecycle", "closedAt", "closedBy"],
        {
          diagnosticCode: "project.lifecycle_changed",
          projection: {
            kind: "project.lifecycle_changed",
            projectId: project.id,
            lifecycle: project.lifecycle,
            unresolvedTaskCount,
            version: project.version,
          },
        },
        undefined,
        { [project.id]: "project" },
      );
    }
    case "radar.candidateUpsert": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (
        transaction.getStrategicRecord(command.payload.candidateId) !==
        undefined
      )
        return precondition(command, occurredAt);
      const source = transaction.getKnowledgeSource(command.payload.sourceId);
      const duplicate = transaction
        .listStrategicRecords(command.workspaceId, command.payload.spaceId)
        .some(
          (record) =>
            record.kind === "radar_candidate" &&
            record.materialKey === command.payload.materialKey,
        );
      if (
        source === undefined ||
        source.spaceId !== command.payload.spaceId ||
        duplicate
      )
        return precondition(command, occurredAt);
      const record = createRadarCandidate({
        id: StrategicRecordIdSchema.parse(command.payload.candidateId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        sourceId: source.id,
        materialKey: command.payload.materialKey,
        title: command.payload.title,
        relevance: command.payload.relevance,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertStrategicRecord(record);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["sourceId", "materialKey", "title", "relevance", "state"],
      );
    }
    case "radar.resolve": {
      const current = transaction.getStrategicRecord(
        command.payload.candidateId,
      );
      if (current?.kind !== "radar_candidate" || current.state !== "pending")
        return precondition(command, occurredAt);
      if (
        command.payload.state === "saved" &&
        command.payload.resolutionRecordId === undefined
      )
        return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const record: StrategicRecord = {
        ...current,
        state: command.payload.state,
        ...(command.payload.resolutionRecordId === undefined
          ? {}
          : { resolutionRecordId: command.payload.resolutionRecordId }),
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateStrategicRecord(record, current.version))
        return versionConflict(command, occurredAt, expected);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["state", "resolutionRecordId"],
      );
    }
    case "meeting.upsertImported": {
      const meeting = command.payload.meeting;
      if (meeting.workspaceId !== command.workspaceId)
        return precondition(command, occurredAt);
      const id = StrategicRecordIdSchema.parse(meeting.id);
      const current = transaction.getStrategicRecord(id);
      if (current !== undefined && current.kind !== "meeting")
        return precondition(command, occurredAt);
      if (
        current?.kind === "meeting" &&
        meeting.version <= current.meeting.version
      )
        return precondition(command, occurredAt);
      const expected =
        current === undefined ? {} : { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const record: StrategicRecord = {
        id,
        workspaceId: meeting.workspaceId,
        spaceId: meeting.spaceId,
        kind: "meeting",
        meeting,
        createdBy: context.principalId,
        version: (current?.version ?? 0) + 1,
        createdAt: current?.createdAt ?? occurredAt,
        updatedAt: occurredAt,
      };
      if (current === undefined) transaction.insertStrategicRecord(record);
      else if (!transaction.updateStrategicRecord(record, current.version))
        return versionConflict(command, occurredAt, expected);
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["meeting", "triage", "workItems"],
      );
    }
    case "meeting.route": {
      const current = transaction.getStrategicRecord(command.payload.meetingId);
      if (current?.kind !== "meeting") return precondition(command, occurredAt);
      if (!exactExpected(command, { [current.id]: current.version })) {
        return versionConflict(command, occurredAt, {
          [current.id]: current.version,
        });
      }
      const meeting = current.meeting;
      // ADR-040 §6: promoted Tasks already live in the meeting's Space, so a
      // Space move is refused rather than silently splitting the graph.
      const movesSpace =
        command.payload.spaceId !== undefined &&
        command.payload.spaceId !== meeting.spaceId;
      if (movesSpace && meeting.workItems.some((item) => item.taskId))
        return precondition(command, occurredAt);
      const nextSpaceId = command.payload.spaceId ?? meeting.spaceId;
      const {
        projectId: priorProjectId,
        organizationId: priorOrganizationId,
        ...meetingBase
      } = meeting;
      const nextProjectId =
        command.payload.projectId === undefined
          ? priorProjectId
          : (command.payload.projectId ?? undefined);
      const nextOrganizationId =
        command.payload.organizationId === undefined
          ? priorOrganizationId
          : (command.payload.organizationId ?? undefined);
      // Every resulting destination must live in the resulting Space — the
      // newly supplied one and any carried over across a Space move alike.
      // Space is the access boundary, so a cross-Space destination is never
      // routable: relating across it would leak scope, while accepting it
      // silently would leave promotion unable to relate, producing a Task
      // disconnected from the project it came from.
      if (nextProjectId !== undefined) {
        const project = transaction.getProject(nextProjectId);
        if (
          project === undefined ||
          project.workspaceId !== command.workspaceId ||
          project.spaceId !== nextSpaceId
        ) {
          return precondition(command, occurredAt);
        }
      }
      if (nextOrganizationId !== undefined) {
        const organization = transaction.getStrategicRecord(nextOrganizationId);
        if (
          organization?.kind !== "organization" ||
          organization.workspaceId !== command.workspaceId ||
          organization.spaceId !== nextSpaceId
        ) {
          return precondition(command, occurredAt);
        }
      }
      const routed: ImportedMeeting = {
        ...meetingBase,
        spaceId: nextSpaceId,
        ...(nextProjectId === undefined ? {} : { projectId: nextProjectId }),
        ...(nextOrganizationId === undefined
          ? {}
          : { organizationId: nextOrganizationId }),
        version: meeting.version + 1,
        updatedAt: occurredAt,
      };
      const record: StrategicRecord = {
        ...current,
        spaceId: nextSpaceId,
        meeting: routed,
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateStrategicRecord(record, current.version)) {
        return versionConflict(command, occurredAt, {
          [current.id]: current.version,
        });
      }
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["projectId", "organizationId", "spaceId"],
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: record.workspaceId,
          spaceId: meeting.spaceId,
          kind: "meeting.restore_routing",
          meetingId: current.id,
          ...(priorProjectId === undefined
            ? {}
            : { priorProjectId: priorProjectId }),
          ...(priorOrganizationId === undefined
            ? {}
            : { priorOrganizationId: priorOrganizationId }),
          priorSpaceId: meeting.spaceId,
          resultingVersion: record.version,
        },
      );
    }
    case "meeting.editWorkItem":
    case "meeting.correctWorkItemResponsibility":
    case "meeting.addWorkItem": {
      const current = transaction.getStrategicRecord(command.payload.meetingId);
      if (current?.kind !== "meeting") return precondition(command, occurredAt);
      if (!exactExpected(command, { [current.id]: current.version })) {
        return versionConflict(command, occurredAt, {
          [current.id]: current.version,
        });
      }
      const meeting = current.meeting;
      const priorItem = meeting.workItems.find(
        (candidate) => candidate.id === command.payload.workItemId,
      );
      const updated =
        command.commandName === "meeting.editWorkItem"
          ? editMeetingWorkItem(meeting, { ...command.payload, occurredAt })
          : command.commandName === "meeting.correctWorkItemResponsibility"
            ? correctMeetingWorkItemResponsibility(meeting, {
                ...command.payload,
                occurredAt,
              })
            : addMeetingWorkItem(meeting, { ...command.payload, occurredAt });
      if (updated === undefined) return precondition(command, occurredAt);
      const record: StrategicRecord = {
        ...current,
        meeting: updated,
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateStrategicRecord(record, current.version)) {
        return versionConflict(command, occurredAt, {
          [current.id]: current.version,
        });
      }
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["workItems", "triage"],
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          kind: "meeting.restore_work_item",
          meetingId: current.id,
          workItemId: command.payload.workItemId,
          ...(priorItem === undefined ? {} : { priorItem }),
          resultingVersion: record.version,
        },
      );
    }
    case "meeting.promoteWorkItem": {
      const current = transaction.getStrategicRecord(command.payload.meetingId);
      if (current?.kind !== "meeting") return precondition(command, occurredAt);
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      const meeting = current.meeting;
      const item = meeting.workItems.find(
        (candidate) => candidate.id === command.payload.workItemId,
      );
      // Only actionable kinds promote; decisions and notes are not work.
      if (
        item === undefined ||
        (item.kind !== "task" && item.kind !== "follow_up")
      )
        return precondition(command, occurredAt);
      // Idempotent by construction: a live back-reference means done already.
      if (
        item.taskId !== undefined &&
        transaction.getTask(item.taskId) !== undefined
      ) {
        return precondition(command, occurredAt);
      }
      if (transaction.getTask(command.payload.taskId) !== undefined)
        return precondition(command, occurredAt);
      if (!exactExpected(command, { [current.id]: current.version })) {
        return versionConflict(command, occurredAt, {
          [current.id]: current.version,
        });
      }
      const task = createTask({
        id: command.payload.taskId,
        workspaceId: current.workspaceId,
        spaceId: current.spaceId,
        title: item.title.slice(0, 500),
        ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
        statusId: workspace.defaultTaskStatusId,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertTask(task);
      const recordVersions: Record<string, number> = {
        [task.id]: task.version,
      };
      const affectedKinds: Record<
        string,
        "task" | "project" | "attentionSignal" | "relation" | "strategicRecord"
      > = { [task.id]: "task" };
      // Relate to the routed project when the meeting has one, so the Task
      // lands in the same place a manually created one would.
      let createdRelationId: RelationId | undefined;
      const project =
        meeting.projectId === undefined
          ? undefined
          : transaction.getProject(meeting.projectId);
      if (project !== undefined && project.spaceId === current.spaceId) {
        const relation = relateTaskToProject({
          id: RelationIdSchema.parse(dependencies.ids.next("relation")),
          task,
          project,
          createdBy: context.principalId,
          occurredAt,
        });
        transaction.insertRelation(relation);
        createdRelationId = relation.id;
        recordVersions[relation.id] = relation.version;
        affectedKinds[relation.id] = "relation";
      }
      const promoted: ImportedMeeting = {
        ...meeting,
        workItems: meeting.workItems.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, taskId: task.id, version: candidate.version + 1 }
            : candidate,
        ),
        version: meeting.version + 1,
        updatedAt: occurredAt,
      };
      const record: StrategicRecord = {
        ...current,
        meeting: promoted,
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateStrategicRecord(record, current.version)) {
        return versionConflict(command, occurredAt, {
          [current.id]: current.version,
        });
      }
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["workItems"],
        recordVersions,
        affectedKinds,
        {
          targetCommandId: command.commandId,
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          kind: "meeting.unpromote_work_item",
          meetingId: current.id,
          workItemId: item.id,
          createdTaskId: task.id,
          ...(createdRelationId === undefined
            ? {}
            : { createdRelationId: createdRelationId }),
          resultingMeetingVersion: record.version,
          resultingTaskVersion: task.version,
        },
      );
    }
    case "meeting.linkParticipants": {
      const current = transaction.getStrategicRecord(command.payload.meetingId);
      if (current?.kind !== "meeting") return precondition(command, occurredAt);
      if (!exactExpected(command, { [current.id]: current.version })) {
        return versionConflict(command, occurredAt, {
          [current.id]: current.version,
        });
      }
      const meeting = current.meeting;
      const priorLinks = meeting.participants.map((participant) => ({
        externalId: participant.externalId,
        ...(participant.personId === undefined
          ? {}
          : { personId: participant.personId }),
      }));
      // Existing People in this Space, indexed by exact normalized email.
      // Name is deliberately not an index: ADR-040 §4 forbids name matching.
      const peopleByEmail = new Map<string, StrategicRecordId>();
      for (const candidate of transaction.listStrategicRecords(
        current.workspaceId,
        current.spaceId,
      )) {
        if (candidate.kind === "person" && candidate.email !== undefined)
          peopleByEmail.set(candidate.email.trim().toLowerCase(), candidate.id);
      }
      const resolutions = new Map(
        command.payload.resolutions.map((resolution) => [
          resolution.participantExternalId,
          resolution.personId,
        ]),
      );
      const availableIds = [...command.payload.personIdPool];
      const createdPersonIds: StrategicRecordId[] = [];
      const ambiguousParticipants: string[] = [];
      const recordVersions: Record<string, number> = {};
      const affectedKinds: Record<
        string,
        "task" | "project" | "attentionSignal" | "relation" | "strategicRecord"
      > = {};
      const organizationId = meeting.organizationId;
      const participants = meeting.participants.map((participant) => {
        if (participant.personId !== undefined) return participant;
        const resolved = resolutions.get(participant.externalId);
        if (resolved !== undefined) {
          const person = transaction.getStrategicRecord(resolved);
          // An operator-supplied identifier is still subject to Space scoping:
          // linking a Person the caller happens to know the id of but cannot
          // see here would cross the access boundary the rest of this handler
          // preserves. Out-of-scope ids are treated as unresolved, not honoured.
          if (
            person?.kind === "person" &&
            person.workspaceId === current.workspaceId &&
            person.spaceId === current.spaceId
          ) {
            return { ...participant, personId: resolved };
          }
          ambiguousParticipants.push(participant.externalId);
          return participant;
        }
        const email = participant.email?.trim().toLowerCase();
        if (email === undefined) {
          // Name-only: never matched, never created. Explicit review only.
          ambiguousParticipants.push(participant.externalId);
          return participant;
        }
        const existing = peopleByEmail.get(email);
        if (existing !== undefined)
          return { ...participant, personId: existing };
        const personId = availableIds.shift();
        if (personId === undefined) {
          ambiguousParticipants.push(participant.externalId);
          return participant;
        }
        const person = createPerson({
          id: personId,
          workspaceId: current.workspaceId,
          spaceId: current.spaceId,
          name: participant.name,
          ...(organizationId === undefined ? {} : { organizationId }),
          ...(participant.email === undefined
            ? {}
            : { email: participant.email }),
          createdBy: context.principalId,
          occurredAt,
        });
        transaction.insertStrategicRecord(person);
        peopleByEmail.set(email, person.id);
        createdPersonIds.push(person.id);
        recordVersions[person.id] = person.version;
        affectedKinds[person.id] = "strategicRecord";
        return { ...participant, personId: person.id };
      });
      const linked: ImportedMeeting = {
        ...meeting,
        participants,
        version: meeting.version + 1,
        updatedAt: occurredAt,
      };
      const record: StrategicRecord = {
        ...current,
        meeting: linked,
        version: current.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateStrategicRecord(record, current.version)) {
        return versionConflict(command, occurredAt, {
          [current.id]: current.version,
        });
      }
      void ambiguousParticipants;
      return appendStrategicJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        record,
        ["participants"],
        recordVersions,
        affectedKinds,
        {
          targetCommandId: command.commandId,
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          kind: "meeting.restore_participant_links",
          meetingId: current.id,
          priorLinks,
          createdPersonIds,
          resultingVersion: record.version,
        },
      );
    }
    case "project.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      const project = createProject({
        id: ProjectIdSchema.parse(dependencies.ids.next("project")),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        intendedOutcome: command.payload.intendedOutcome,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertProject(project);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "project.created",
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          aggregateId: project.id,
          aggregateVersion: project.version,
          occurredAt,
        },
        { [project.id]: project.version },
        ["title", "intendedOutcome", "lifecycle"],
        {
          diagnosticCode: "project.created",
          projection: {
            kind: "project.created",
            projectId: project.id,
            title: project.title,
            intendedOutcome: project.intendedOutcome,
            lifecycle: project.lifecycle,
            version: project.version,
          },
        },
      );
    }
    case "project.updateOutcome": {
      const project = transaction.getProject(command.payload.projectId);
      if (project === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, { [project.id]: project.version })) {
        return versionConflict(command, occurredAt, {
          [project.id]: project.version,
        });
      }
      const updated = updateProjectOutcome(
        project,
        command.payload.intendedOutcome,
        occurredAt,
      );
      if (!transaction.updateProject(updated, project.version)) {
        return versionConflict(command, occurredAt, {
          [project.id]: project.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "project.outcome_updated",
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          aggregateId: project.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["intendedOutcome"],
        {
          diagnosticCode: "project.outcome_updated",
          projection: {
            kind: "project.outcome_updated",
            projectId: updated.id,
            title: updated.title,
            intendedOutcome: updated.intendedOutcome,
            lifecycle: updated.lifecycle,
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          kind: "project.restore_outcome",
          projectId: project.id,
          priorOutcome: project.intendedOutcome,
          resultingVersion: updated.version,
        },
      );
    }
    case "task.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      const existing = transaction.getTask(command.payload.taskId);
      if (existing !== undefined) {
        return outcome(command, occurredAt, {
          outcome: "conflict",
          diagnosticCode: "record.already_exists",
          currentVersions: { [existing.id]: existing.version },
        });
      }
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      if (command.payload.parentTaskId !== undefined) {
        const parent = transaction.getTask(command.payload.parentTaskId);
        if (
          parent === undefined ||
          parent.workspaceId !== command.workspaceId ||
          parent.spaceId !== command.payload.spaceId ||
          parent.recordState !== "active" ||
          parent.parentTaskId !== undefined
        ) {
          return precondition(command, occurredAt);
        }
      }
      const task = createTask({
        id: command.payload.taskId,
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        ...(command.payload.description === undefined
          ? {}
          : { description: command.payload.description }),
        ...(command.payload.nextAction === undefined
          ? {}
          : { nextAction: command.payload.nextAction }),
        ...(command.payload.startAt === undefined
          ? {}
          : { startAt: command.payload.startAt }),
        ...(command.payload.dueAt === undefined
          ? {}
          : { dueAt: command.payload.dueAt }),
        ...(command.payload.priority === undefined
          ? {}
          : { priority: command.payload.priority }),
        ...(command.payload.parentTaskId === undefined
          ? {}
          : { parentTaskId: command.payload.parentTaskId }),
        statusId: workspace.defaultTaskStatusId,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertTask(task);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "task.created",
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: task.id,
          aggregateVersion: task.version,
          occurredAt,
        },
        { [task.id]: task.version },
        [
          "title",
          "description",
          "nextAction",
          "startAt",
          "dueAt",
          "priority",
          "parentTaskId",
          "statusId",
        ],
        {
          diagnosticCode: "task.created",
          projection: {
            kind: "task.created",
            taskId: task.id,
            spaceId: task.spaceId,
            title: task.title,
            ...(task.description === undefined
              ? {}
              : { description: task.description }),
            ...(task.nextAction === undefined
              ? {}
              : { nextAction: task.nextAction }),
            ...(task.startAt === undefined ? {} : { startAt: task.startAt }),
            ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
            ...(task.priority === undefined ? {} : { priority: task.priority }),
            statusId: task.statusId,
            completionState: task.completionState,
            version: task.version,
          },
        },
      );
    }
    case "task.setCalendarBlock": {
      const task = transaction.getTask(command.payload.taskId);
      if (task === undefined || task.recordState !== "active")
        return precondition(command, occurredAt);
      if (!exactExpected(command, { [task.id]: task.version })) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      const { calendarBlock: priorBlock, ...taskBase } = task;
      const updated: Task = {
        ...taskBase,
        ...(command.payload.block === null
          ? {}
          : { calendarBlock: command.payload.block }),
        version: task.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateTask(updated, task.version)) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "task.details_updated",
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: task.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["calendarBlock"],
        {
          diagnosticCode: "task.details_updated",
          projection: {
            kind: "task.details_updated",
            taskId: updated.id,
            title: updated.title,
            ...(updated.description === undefined
              ? {}
              : { description: updated.description }),
            ...(updated.nextAction === undefined
              ? {}
              : { nextAction: updated.nextAction }),
            ...(updated.startAt === undefined
              ? {}
              : { startAt: updated.startAt }),
            // The deadline is echoed unchanged: reserving time never edits it
            // and never enters the calendar-consent path (ADR-042 §3).
            ...(updated.dueAt === undefined ? {} : { dueAt: updated.dueAt }),
            ...(updated.priority === undefined
              ? {}
              : { priority: updated.priority }),
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          kind: "task.restore_calendar_block",
          taskId: task.id,
          ...(priorBlock === undefined ? {} : { priorBlock }),
          resultingVersion: updated.version,
        },
        { [updated.id]: "task" },
      );
    }
    case "task.remove": {
      const task = transaction.getTask(command.payload.taskId);
      if (task === undefined || task.recordState !== "active")
        return precondition(command, occurredAt);
      if (!exactExpected(command, { [task.id]: task.version })) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      // ADR-043 §3 — a Task that still has active children is not a leaf.
      // listTasksInSpace already filters to recordState "active", so a child
      // that was itself removed does not block. Refuse rather than orphan.
      const activeChildren = transaction
        .listTasksInSpace(task.workspaceId, task.spaceId)
        .filter((candidate) => candidate.parentTaskId === task.id).length;
      if (activeChildren > 0) return precondition(command, occurredAt);
      const priorRecordState = task.recordState;
      const updated: Task = {
        ...task,
        recordState: "removed",
        version: task.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateTask(updated, task.version)) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "task.removed",
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: task.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["recordState"],
        {
          diagnosticCode: "task.removed",
          projection: {
            kind: "task.removed",
            taskId: updated.id,
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          kind: "task.restore_record_state",
          taskId: task.id,
          priorRecordState,
          resultingVersion: updated.version,
        },
        { [updated.id]: "task" },
      );
    }
    case "task.updateDetails": {
      const task = transaction.getTask(command.payload.taskId);
      if (task === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, { [task.id]: task.version })) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      const detailsUpdate = {
        ...(command.payload.title === undefined
          ? {}
          : { title: command.payload.title }),
        ...(command.payload.description === undefined
          ? {}
          : { description: command.payload.description }),
        ...(command.payload.nextAction === undefined
          ? {}
          : { nextAction: command.payload.nextAction }),
        ...(command.payload.startAt === undefined
          ? {}
          : { startAt: command.payload.startAt }),
        ...(command.payload.dueAt === undefined
          ? {}
          : { dueAt: command.payload.dueAt }),
        ...(command.payload.priority === undefined
          ? {}
          : { priority: command.payload.priority }),
      };
      if (!isTaskTimingValid(taskTimingAfterUpdate(task, detailsUpdate))) {
        return precondition(command, occurredAt);
      }
      const updated = updateTaskDetails(task, detailsUpdate, occurredAt);
      if (!transaction.updateTask(updated, task.version)) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      const changedFields = [
        ...(command.payload.title === undefined ? [] : ["title"]),
        ...(command.payload.description === undefined ? [] : ["description"]),
        ...(command.payload.nextAction === undefined ? [] : ["nextAction"]),
        ...(command.payload.startAt === undefined ? [] : ["startAt"]),
        ...(command.payload.dueAt === undefined ? [] : ["dueAt"]),
        ...(command.payload.priority === undefined ? [] : ["priority"]),
      ];
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "task.details_updated",
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: task.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        changedFields,
        {
          diagnosticCode: "task.details_updated",
          projection: {
            kind: "task.details_updated",
            taskId: updated.id,
            title: updated.title,
            ...(updated.description === undefined
              ? {}
              : { description: updated.description }),
            ...(updated.nextAction === undefined
              ? {}
              : { nextAction: updated.nextAction }),
            ...(updated.startAt === undefined
              ? {}
              : { startAt: updated.startAt }),
            ...(updated.dueAt === undefined ? {} : { dueAt: updated.dueAt }),
            ...(updated.priority === undefined
              ? {}
              : { priority: updated.priority }),
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          kind: "task.restore_details",
          taskId: task.id,
          priorTitle: task.title,
          ...(task.description === undefined
            ? {}
            : { priorDescription: task.description }),
          ...(task.nextAction === undefined
            ? {}
            : { priorNextAction: task.nextAction }),
          ...(task.startAt === undefined ? {} : { priorStartAt: task.startAt }),
          ...(task.dueAt === undefined ? {} : { priorDueAt: task.dueAt }),
          ...(task.priority === undefined
            ? {}
            : { priorPriority: task.priority }),
          resultingVersion: updated.version,
        },
      );
    }
    case "automation.create": {
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getAutomationRule(command.payload.ruleId) !== undefined) {
        return precondition(command, occurredAt);
      }
      const recipe = command.payload.recipe;
      if (recipe.kind === "complete_sets_status") {
        const status = transaction.getTaskStatus(recipe.statusId);
        if (
          status?.workspaceId !== command.workspaceId ||
          taskStatusState(status) === "archived"
        ) {
          return precondition(command, occurredAt);
        }
      }
      const rules = transaction.listAutomationRules(command.workspaceId);
      const normalizedName = command.payload.name.toLocaleLowerCase("pl-PL");
      if (
        rules.some(
          (rule) =>
            automationRuleState(rule) === "active" &&
            rule.name.toLocaleLowerCase("pl-PL") === normalizedName,
        )
      ) {
        return precondition(command, occurredAt);
      }
      const rule = createAutomationRule({
        id: command.payload.ruleId,
        workspaceId: command.workspaceId,
        name: command.payload.name,
        recipe,
        position:
          rules.reduce((max, entry) => Math.max(max, entry.position), -1) + 1,
        occurredAt,
      });
      transaction.insertAutomationRule(rule);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "automation.created",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: rule.id,
          aggregateVersion: rule.version,
          occurredAt,
        },
        { [rule.id]: rule.version },
        ["name", "recipe", "state"],
        {
          diagnosticCode: "automation.created",
          projection: {
            kind: "automation.created",
            ruleId: rule.id,
            name: rule.name,
            recipe: rule.recipe,
            state: "active",
            position: rule.position,
            version: rule.version,
          },
        },
        undefined,
        { [rule.id]: "automationRule" },
      );
    }
    case "automation.rename":
    case "automation.setState": {
      const rule = transaction.getAutomationRule(command.payload.ruleId);
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (
        rule === undefined ||
        rule.workspaceId !== command.workspaceId ||
        workspace === undefined
      ) {
        return precondition(command, occurredAt);
      }
      const currentState = automationRuleState(rule);
      let update: AutomationRuleUpdate;
      let changedFields: readonly string[];
      if (command.commandName === "automation.rename") {
        const normalizedName = command.payload.name.toLocaleLowerCase("pl-PL");
        if (
          command.payload.name === rule.name ||
          transaction
            .listAutomationRules(command.workspaceId)
            .some(
              (entry) =>
                entry.id !== rule.id &&
                automationRuleState(entry) === "active" &&
                entry.name.toLocaleLowerCase("pl-PL") === normalizedName,
            )
        ) {
          return precondition(command, occurredAt);
        }
        update = { name: command.payload.name };
        changedFields = ["name"];
      } else {
        if (command.payload.state === currentState) {
          return precondition(command, occurredAt);
        }
        update = { state: command.payload.state };
        changedFields = ["state"];
      }
      if (!exactExpected(command, { [rule.id]: rule.version })) {
        return versionConflict(command, occurredAt, {
          [rule.id]: rule.version,
        });
      }
      const updated = updateAutomationRule(rule, update, occurredAt);
      if (!transaction.updateAutomationRule(updated, rule.version)) {
        return versionConflict(command, occurredAt, {
          [rule.id]: rule.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "automation.changed",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        changedFields,
        {
          diagnosticCode: "automation.changed",
          projection: {
            kind: "automation.changed",
            ruleId: updated.id,
            name: updated.name,
            recipe: updated.recipe,
            state: automationRuleState(updated),
            position: updated.position,
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          kind: "automation.restore_definition",
          ruleId: rule.id,
          priorName: rule.name,
          priorState: currentState,
          ...(rule.disabledAt === undefined
            ? {}
            : { priorDisabledAt: rule.disabledAt }),
          priorPosition: rule.position,
          resultingVersion: updated.version,
        },
        { [updated.id]: "automationRule" },
      );
    }
    case "recurrence.sweep": {
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      // Bounded like automation.sweep: a rate limit, not a completeness
      // promise. Each generation advances nextDueAt, so successive sweeps
      // make forward progress rather than repeating the same work.
      const limit = 50;
      const generatedTaskIds: TaskId[] = [];
      const recordVersions: Record<string, number> = {};
      const affectedKinds: Record<
        string,
        "task" | "project" | "attentionSignal" | "relation" | "strategicRecord"
      > = {};
      let pendingCount = 0;
      let truncated = false;
      let lastRecurrence: StrategicRecord | undefined;
      for (const space of transaction.listSpaces(command.workspaceId)) {
        // Workspace-level maintenance rights are not Space access. Sweeping a
        // Space the caller cannot edit would both write there on their behalf
        // and echo its task identifiers back through `affected`, which is the
        // cross-Space leak the authorization model exists to prevent. A
        // cadence in an unreadable Space simply waits for a sweep by someone
        // who can edit it.
        if (!canEditSpace(transaction, context, command.workspaceId, space.id))
          continue;
        for (const record of transaction.listStrategicRecords(
          command.workspaceId,
          space.id,
        )) {
          // Paused and ended cadences are skipped by the scan rather than
          // attempted and refused, so they produce no failed commands.
          if (record.kind !== "recurrence" || record.state !== "active")
            continue;
          if (Date.parse(record.nextDueAt) > Date.parse(occurredAt)) {
            pendingCount += 1;
            continue;
          }
          if (generatedTaskIds.length >= limit) {
            truncated = true;
            break;
          }
          const task = createTask({
            id: TaskIdSchema.parse(dependencies.ids.next("task")),
            workspaceId: record.workspaceId,
            spaceId: record.spaceId,
            title: record.taskTitle,
            // The occurrence keeps the due moment it was generated for, which
            // is the semantics recurrence.generateOccurrence already uses.
            dueAt: record.nextDueAt,
            statusId: workspace.defaultTaskStatusId,
            createdBy: context.principalId,
            occurredAt,
          });
          transaction.insertTask(task);
          const advanced: StrategicRecord = {
            ...record,
            lastOccurrenceTaskId: task.id,
            nextDueAt: rollForward(
              record.nextDueAt,
              record.cadence,
              occurredAt,
            ),
            version: record.version + 1,
            updatedAt: occurredAt,
          };
          // The Task is already inserted, so skipping here would orphan it and
          // let the next sweep generate a duplicate for the same period. The
          // record was read from this same transaction, so a failure is an
          // invariant violation rather than ordinary contention: fail the whole
          // sweep and let it roll back, matching project.applyTemplate.
          if (!transaction.updateStrategicRecord(advanced, record.version)) {
            return versionConflict(command, occurredAt, {
              [record.id]: record.version,
            });
          }
          generatedTaskIds.push(task.id);
          recordVersions[task.id] = task.version;
          affectedKinds[task.id] = "task";
          recordVersions[advanced.id] = advanced.version;
          affectedKinds[advanced.id] = "strategicRecord";
          lastRecurrence = advanced;
        }
        if (truncated) break;
      }
      // Nothing was due: report an honest no-op rather than inventing a
      // journal entry against an unrelated aggregate.
      if (lastRecurrence === undefined)
        return precondition(command, occurredAt);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "strategic.record_changed",
          workspaceId: command.workspaceId,
          // A sweep is a workspace-level operation, so it anchors on the root
          // Space like automation.sweep rather than on whichever cadence the
          // iteration happened to reach last. An arbitrary Space in the event
          // header would suggest the sweep was scoped to it. Every touched
          // record still reports its own version through `affected`.
          spaceId: workspace.rootSpaceId,
          aggregateId: lastRecurrence.id,
          aggregateVersion: lastRecurrence.version,
          occurredAt,
        },
        recordVersions,
        ["lastOccurrenceTaskId", "nextDueAt"],
        {
          diagnosticCode: "recurrence.swept",
          projection: {
            kind: "recurrence.swept",
            generatedTaskIds,
            pendingCount,
            truncated,
          },
        },
        undefined,
        affectedKinds,
      );
    }
    case "automation.sweep": {
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      const rule = transaction
        .listAutomationRules(command.workspaceId)
        .find(
          (entry) =>
            automationRuleState(entry) === "active" &&
            entry.recipe.kind === "waiting_review_signals",
        );
      if (rule === undefined) return precondition(command, occurredAt);
      // One sweep raises at most 50 signals: a deterministic rate bound, not
      // a completeness promise — the next sweep continues where dedup keys
      // left off.
      const limit = 50;
      const raisedTaskIds: TaskId[] = [];
      let alreadySignaledCount = 0;
      let truncated = false;
      const owner = transaction
        .listMemberships(command.workspaceId)
        .find(
          (membership) =>
            membership.role === "owner" && membership.status !== "revoked",
        );
      for (const space of transaction.listSpaces(command.workspaceId)) {
        for (const task of transaction.listTasksInSpace(
          command.workspaceId,
          space.id,
        )) {
          if (
            task.recordState !== "active" ||
            task.completionState !== "open" ||
            task.operationalState !== "waiting" ||
            task.waitingOn?.expectedAt === undefined ||
            task.waitingOn.expectedAt > occurredAt
          ) {
            continue;
          }
          const targetPrincipalId =
            transaction.getActiveTaskAssignment(task.id)?.assigneePrincipalId ??
            owner?.principalId;
          if (targetPrincipalId === undefined) continue;
          if (raisedTaskIds.length >= limit) {
            truncated = true;
            break;
          }
          const deduplicationKey = `automation:${rule.id}:${task.id}:${task.waitingOn.expectedAt}`;
          const existing = transaction.findAttentionSignalByDeduplicationKey(
            command.workspaceId,
            targetPrincipalId,
            deduplicationKey,
          );
          if (existing !== undefined) {
            alreadySignaledCount += 1;
            continue;
          }
          upsertAttention(
            dependencies,
            transaction,
            {
              workspaceId: command.workspaceId,
              spaceId: task.spaceId,
              targetPrincipalId,
              reason: "waiting_review_elapsed",
              destination: { kind: "task", taskId: task.id },
              sourceRecordId: rule.id,
              deduplicationKey,
              urgency: "in_app",
            },
            occurredAt,
          );
          raisedTaskIds.push(task.id);
        }
        if (truncated) break;
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "automation.swept",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: rule.id,
          aggregateVersion: rule.version,
          occurredAt,
        },
        { [rule.id]: rule.version },
        ["signals"],
        {
          diagnosticCode: "automation.swept",
          projection: {
            kind: "automation.swept",
            raisedTaskIds,
            alreadySignaledCount,
            truncated,
          },
        },
        undefined,
        { [rule.id]: "automationRule" },
      );
    }
    case "template.create": {
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      const existing = transaction.getProjectTemplate(
        command.payload.templateId,
      );
      if (existing !== undefined) {
        return outcome(command, occurredAt, {
          outcome: "conflict",
          diagnosticCode: "record.already_exists",
          currentVersions: { [existing.id]: existing.version },
        });
      }
      const templates = transaction.listProjectTemplates(command.workspaceId);
      const normalizedName = command.payload.name.toLocaleLowerCase("pl-PL");
      if (
        templates.some(
          (template) =>
            projectTemplateState(template) === "active" &&
            template.name.toLocaleLowerCase("pl-PL") === normalizedName,
        ) ||
        command.payload.fieldIds.some((fieldId) => {
          const definition = transaction.getFieldDefinition(fieldId);
          return (
            definition === undefined ||
            definition.workspaceId !== command.workspaceId ||
            definition.targetKind !== "project"
          );
        })
      ) {
        return precondition(command, occurredAt);
      }
      const template = createProjectTemplate({
        id: command.payload.templateId,
        workspaceId: command.workspaceId,
        name: command.payload.name,
        ...(command.payload.description === undefined
          ? {}
          : { description: command.payload.description }),
        taskTitles: command.payload.taskTitles,
        fieldIds: command.payload.fieldIds,
        position:
          templates.reduce((max, entry) => Math.max(max, entry.position), -1) +
          1,
        occurredAt,
      });
      transaction.insertProjectTemplate(template);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "template.created",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: template.id,
          aggregateVersion: template.version,
          occurredAt,
        },
        { [template.id]: template.version },
        ["name", "description", "taskTitles", "fieldIds", "state"],
        {
          diagnosticCode: "template.created",
          projection: {
            kind: "template.created",
            templateId: template.id,
            name: template.name,
            taskTitles: template.taskTitles,
            fieldIds: template.fieldIds,
            state: "active",
            position: template.position,
            version: template.version,
          },
        },
        undefined,
        { [template.id]: "projectTemplate" },
      );
    }
    case "template.rename":
    case "template.updateContents":
    case "template.archive":
    case "template.restore": {
      const template = transaction.getProjectTemplate(
        command.payload.templateId,
      );
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (
        template === undefined ||
        template.workspaceId !== command.workspaceId ||
        workspace === undefined
      ) {
        return precondition(command, occurredAt);
      }
      const currentState = projectTemplateState(template);
      let update: ProjectTemplateUpdate;
      let changedFields: readonly string[];
      if (command.commandName === "template.rename") {
        const normalizedName = command.payload.name.toLocaleLowerCase("pl-PL");
        if (
          command.payload.name === template.name ||
          transaction
            .listProjectTemplates(command.workspaceId)
            .some(
              (entry) =>
                entry.id !== template.id &&
                projectTemplateState(entry) === "active" &&
                entry.name.toLocaleLowerCase("pl-PL") === normalizedName,
            )
        ) {
          return precondition(command, occurredAt);
        }
        update = { name: command.payload.name };
        changedFields = ["name"];
      } else if (command.commandName === "template.updateContents") {
        if (
          command.payload.fieldIds !== undefined &&
          command.payload.fieldIds.some((fieldId) => {
            const definition = transaction.getFieldDefinition(fieldId);
            return (
              definition === undefined ||
              definition.workspaceId !== command.workspaceId ||
              definition.targetKind !== "project"
            );
          })
        ) {
          return precondition(command, occurredAt);
        }
        update = {
          ...(command.payload.description === undefined
            ? {}
            : { description: command.payload.description }),
          ...(command.payload.taskTitles === undefined
            ? {}
            : { taskTitles: command.payload.taskTitles }),
          ...(command.payload.fieldIds === undefined
            ? {}
            : { fieldIds: command.payload.fieldIds }),
        };
        changedFields = [
          ...(command.payload.description === undefined ? [] : ["description"]),
          ...(command.payload.taskTitles === undefined ? [] : ["taskTitles"]),
          ...(command.payload.fieldIds === undefined ? [] : ["fieldIds"]),
        ];
      } else if (command.commandName === "template.archive") {
        if (currentState === "retired")
          return precondition(command, occurredAt);
        update = { state: "retired" };
        changedFields = ["state"];
      } else {
        const normalizedName = template.name.toLocaleLowerCase("pl-PL");
        if (
          currentState === "active" ||
          transaction
            .listProjectTemplates(command.workspaceId)
            .some(
              (entry) =>
                entry.id !== template.id &&
                projectTemplateState(entry) === "active" &&
                entry.name.toLocaleLowerCase("pl-PL") === normalizedName,
            )
        ) {
          return precondition(command, occurredAt);
        }
        update = { state: "active" };
        changedFields = ["state"];
      }
      if (!exactExpected(command, { [template.id]: template.version })) {
        return versionConflict(command, occurredAt, {
          [template.id]: template.version,
        });
      }
      const updated = updateProjectTemplate(template, update, occurredAt);
      if (!transaction.updateProjectTemplate(updated, template.version)) {
        return versionConflict(command, occurredAt, {
          [template.id]: template.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "template.changed",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        changedFields,
        {
          diagnosticCode: "template.changed",
          projection: {
            kind: "template.changed",
            templateId: updated.id,
            name: updated.name,
            taskTitles: updated.taskTitles,
            fieldIds: updated.fieldIds,
            state: projectTemplateState(updated),
            position: updated.position,
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          kind: "template.restore_definition",
          templateId: template.id,
          priorName: template.name,
          ...(template.description === undefined
            ? {}
            : { priorDescription: template.description }),
          priorTaskTitles: template.taskTitles,
          priorFieldIds: template.fieldIds,
          priorPosition: template.position,
          priorState: currentState,
          ...(template.retiredAt === undefined
            ? {}
            : { priorRetiredAt: template.retiredAt }),
          resultingVersion: updated.version,
        },
        { [updated.id]: "projectTemplate" },
      );
    }
    case "project.applyTemplate": {
      const project = transaction.getProject(command.payload.projectId);
      const template = transaction.getProjectTemplate(
        command.payload.templateId,
      );
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (
        project === undefined ||
        workspace === undefined ||
        template?.workspaceId !== project.workspaceId ||
        projectTemplateState(template) !== "active" ||
        project.appliedTemplateId === template.id
      ) {
        return precondition(command, occurredAt);
      }
      if (!exactExpected(command, { [project.id]: project.version })) {
        return versionConflict(command, occurredAt, {
          [project.id]: project.version,
        });
      }
      // Application is prospective and additive: existing related Tasks with
      // an exact starter title are skipped explicitly, never rewritten.
      const relations = transaction.listRelations(
        project.workspaceId,
        project.spaceId,
      );
      const existingTitles = new Set(
        relations
          .filter(
            (relation) =>
              relation.projectId === project.id && relation.state === "active",
          )
          .map((relation) => transaction.getTask(relation.taskId)?.title ?? ""),
      );
      const skippedExistingTitles = template.taskTitles.filter((title) =>
        existingTitles.has(title),
      );
      const createdTaskIds: TaskId[] = [];
      const createdRelationIds: RelationId[] = [];
      const resultingTaskVersions: Record<string, number> = {};
      const recordVersions: Record<string, number> = {};
      const affectedKinds: Record<string, "task" | "project" | "relation"> = {};
      for (const title of template.taskTitles) {
        if (existingTitles.has(title)) continue;
        const task = createTask({
          id: TaskIdSchema.parse(dependencies.ids.next("task")),
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          title,
          statusId: workspace.defaultTaskStatusId,
          createdBy: context.principalId,
          occurredAt,
        });
        transaction.insertTask(task);
        const relation = relateTaskToProject({
          id: RelationIdSchema.parse(dependencies.ids.next("relation")),
          task,
          project,
          createdBy: context.principalId,
          occurredAt,
        });
        transaction.insertRelation(relation);
        createdTaskIds.push(task.id);
        createdRelationIds.push(relation.id);
        resultingTaskVersions[task.id] = task.version;
        recordVersions[task.id] = task.version;
        recordVersions[relation.id] = relation.version;
        affectedKinds[task.id] = "task";
        affectedKinds[relation.id] = "relation";
      }
      const { appliedTemplateId: _prior, ...projectBase } = project;
      void _prior;
      const updatedProject: Project = {
        ...projectBase,
        appliedTemplateId: template.id,
        version: project.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateProject(updatedProject, project.version)) {
        return versionConflict(command, occurredAt, {
          [project.id]: project.version,
        });
      }
      recordVersions[project.id] = updatedProject.version;
      affectedKinds[project.id] = "project";
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "project.template_applied",
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          aggregateId: project.id,
          aggregateVersion: updatedProject.version,
          occurredAt,
        },
        recordVersions,
        ["appliedTemplateId", "templateTasks"],
        {
          diagnosticCode: "project.template_applied",
          projection: {
            kind: "project.template_applied",
            projectId: project.id,
            templateId: template.id,
            createdTaskIds,
            skippedExistingTitles,
            version: updatedProject.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          kind: "project.unapply_template",
          projectId: project.id,
          templateId: template.id,
          createdTaskIds,
          createdRelationIds,
          resultingProjectVersion: updatedProject.version,
          resultingTaskVersions,
        },
        affectedKinds,
      );
    }
    case "fieldDef.create": {
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      const existing = transaction.getFieldDefinition(command.payload.fieldId);
      if (existing !== undefined) {
        return outcome(command, occurredAt, {
          outcome: "conflict",
          diagnosticCode: "record.already_exists",
          currentVersions: { [existing.id]: existing.version },
        });
      }
      const definitions = transaction.listFieldDefinitions(command.workspaceId);
      const normalizedLabel = command.payload.label.toLocaleLowerCase("pl-PL");
      if (
        definitions.some(
          (definition) =>
            definition.targetKind === command.payload.targetKind &&
            fieldDefinitionState(definition) === "active" &&
            definition.label.toLocaleLowerCase("pl-PL") === normalizedLabel,
        )
      ) {
        return precondition(command, occurredAt);
      }
      const definition = createFieldDefinition({
        id: command.payload.fieldId,
        workspaceId: command.workspaceId,
        targetKind: command.payload.targetKind,
        label: command.payload.label,
        type: command.payload.type,
        position:
          definitions.reduce(
            (max, entry) => Math.max(max, entry.position),
            -1,
          ) + 1,
        occurredAt,
      });
      transaction.insertFieldDefinition(definition);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "fieldDef.created",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: definition.id,
          aggregateVersion: definition.version,
          occurredAt,
        },
        { [definition.id]: definition.version },
        ["label", "targetKind", "type", "position", "state"],
        {
          diagnosticCode: "fieldDef.created",
          projection: {
            kind: "fieldDef.created",
            fieldId: definition.id,
            targetKind: definition.targetKind,
            label: definition.label,
            state: "active",
            position: definition.position,
            version: definition.version,
          },
        },
        undefined,
        { [definition.id]: "fieldDefinition" },
      );
    }
    case "fieldDef.rename":
    case "fieldDef.archive":
    case "fieldDef.restore": {
      const definition = transaction.getFieldDefinition(
        command.payload.fieldId,
      );
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (
        definition === undefined ||
        definition.workspaceId !== command.workspaceId ||
        workspace === undefined
      ) {
        return precondition(command, occurredAt);
      }
      const currentState = fieldDefinitionState(definition);
      let update: FieldDefinitionUpdate;
      let changedFields: readonly string[];
      if (command.commandName === "fieldDef.rename") {
        const normalizedLabel =
          command.payload.label.toLocaleLowerCase("pl-PL");
        if (
          command.payload.label === definition.label ||
          transaction
            .listFieldDefinitions(command.workspaceId)
            .some(
              (entry) =>
                entry.id !== definition.id &&
                entry.targetKind === definition.targetKind &&
                fieldDefinitionState(entry) === "active" &&
                entry.label.toLocaleLowerCase("pl-PL") === normalizedLabel,
            )
        ) {
          return precondition(command, occurredAt);
        }
        update = { label: command.payload.label };
        changedFields = ["label"];
      } else if (command.commandName === "fieldDef.archive") {
        if (currentState === "retired")
          return precondition(command, occurredAt);
        update = { state: "retired" };
        changedFields = ["state"];
      } else {
        const normalizedLabel = definition.label.toLocaleLowerCase("pl-PL");
        if (
          currentState === "active" ||
          transaction
            .listFieldDefinitions(command.workspaceId)
            .some(
              (entry) =>
                entry.id !== definition.id &&
                entry.targetKind === definition.targetKind &&
                fieldDefinitionState(entry) === "active" &&
                entry.label.toLocaleLowerCase("pl-PL") === normalizedLabel,
            )
        ) {
          return precondition(command, occurredAt);
        }
        update = { state: "active" };
        changedFields = ["state"];
      }
      if (!exactExpected(command, { [definition.id]: definition.version })) {
        return versionConflict(command, occurredAt, {
          [definition.id]: definition.version,
        });
      }
      const updated = updateFieldDefinition(definition, update, occurredAt);
      if (!transaction.updateFieldDefinition(updated, definition.version)) {
        return versionConflict(command, occurredAt, {
          [definition.id]: definition.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "fieldDef.changed",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        changedFields,
        {
          diagnosticCode: "fieldDef.changed",
          projection: {
            kind: "fieldDef.changed",
            fieldId: updated.id,
            targetKind: updated.targetKind,
            label: updated.label,
            state: fieldDefinitionState(updated),
            position: updated.position,
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          kind: "fieldDef.restore_definition",
          fieldId: definition.id,
          priorLabel: definition.label,
          priorPosition: definition.position,
          priorState: currentState,
          ...(definition.retiredAt === undefined
            ? {}
            : { priorRetiredAt: definition.retiredAt }),
          resultingVersion: updated.version,
        },
        { [updated.id]: "fieldDefinition" },
      );
    }
    case "record.setFieldValue": {
      const targetKind = command.payload.targetKind;
      const record =
        targetKind === "task"
          ? transaction.getTask(TaskIdSchema.parse(command.payload.recordId))
          : transaction.getProject(
              ProjectIdSchema.parse(command.payload.recordId),
            );
      const definition = transaction.getFieldDefinition(
        command.payload.fieldId,
      );
      if (
        record === undefined ||
        definition === undefined ||
        definition.workspaceId !== record.workspaceId ||
        definition.targetKind !== targetKind ||
        fieldDefinitionState(definition) !== "active"
      ) {
        return precondition(command, occurredAt);
      }
      const priorValue = record.fields?.[definition.id];
      const nextValue =
        command.payload.value === null ? undefined : command.payload.value;
      if (nextValue === undefined && priorValue === undefined) {
        return precondition(command, occurredAt);
      }
      if (
        nextValue !== undefined &&
        !fieldValueMatchesType(definition.type, nextValue)
      ) {
        return precondition(command, occurredAt);
      }
      if (
        nextValue !== undefined &&
        priorValue === undefined &&
        Object.keys(record.fields ?? {}).length >= MAX_POPULATED_FIELDS
      ) {
        return precondition(command, occurredAt);
      }
      if (!exactExpected(command, { [record.id]: record.version })) {
        return versionConflict(command, occurredAt, {
          [record.id]: record.version,
        });
      }
      const nextFields = withFieldValue(
        record.fields,
        definition.id,
        nextValue,
      );
      const { fields: _priorFields, ...base } = record;
      void _priorFields;
      const updatedRecord = {
        ...base,
        ...(nextFields === undefined ? {} : { fields: nextFields }),
        version: record.version + 1,
        updatedAt: occurredAt,
      };
      const stored =
        targetKind === "task"
          ? transaction.updateTask(updatedRecord as Task, record.version)
          : transaction.updateProject(updatedRecord as Project, record.version);
      if (!stored) {
        return versionConflict(command, occurredAt, {
          [record.id]: record.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "record.field_value_set",
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          aggregateId: record.id,
          aggregateVersion: updatedRecord.version,
          occurredAt,
        },
        { [record.id]: updatedRecord.version },
        [`fields.${definition.id}`],
        {
          diagnosticCode: "record.field_value_set",
          projection: {
            kind: "record.field_value_set",
            targetKind,
            recordId: record.id,
            fieldId: definition.id,
            cleared: nextValue === undefined,
            version: updatedRecord.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          kind: "record.restore_field_value",
          targetKind,
          recordId: record.id,
          fieldId: definition.id,
          ...(priorValue === undefined ? {} : { priorValue }),
          resultingVersion: updatedRecord.version,
        },
        { [record.id]: targetKind === "task" ? "task" : "project" },
      );
    }
    case "taskStatus.create": {
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (workspace === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      const existing = transaction.getTaskStatus(command.payload.statusId);
      if (existing !== undefined) {
        return outcome(command, occurredAt, {
          outcome: "conflict",
          diagnosticCode: "record.already_exists",
          currentVersions: { [existing.id]: existing.version },
        });
      }
      const definitions = transaction.listTaskStatuses(command.workspaceId);
      const normalizedLabel = command.payload.label.toLocaleLowerCase("pl-PL");
      if (
        definitions.some(
          (definition) =>
            taskStatusState(definition) === "active" &&
            definition.label.toLocaleLowerCase("pl-PL") === normalizedLabel,
        )
      ) {
        return precondition(command, occurredAt);
      }
      const status = createTaskStatus({
        id: command.payload.statusId,
        workspaceId: command.workspaceId,
        label: command.payload.label,
        operationalSemantics: command.payload.operationalSemantics,
        position:
          command.payload.position ??
          definitions.reduce(
            (max, definition) => Math.max(max, definition.position),
            -1,
          ) + 1,
        occurredAt,
      });
      transaction.insertTaskStatus(status);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "taskStatus.created",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: status.id,
          aggregateVersion: status.version,
          occurredAt,
        },
        { [status.id]: status.version },
        ["label", "operationalSemantics", "position", "state"],
        {
          diagnosticCode: "taskStatus.created",
          projection: {
            kind: "taskStatus.created",
            statusId: status.id,
            label: status.label,
            operationalSemantics: status.operationalSemantics,
            state: "active",
            position: status.position,
            version: status.version,
          },
        },
        undefined,
        { [status.id]: "taskStatus" },
      );
    }
    case "taskStatus.rename":
    case "taskStatus.setSemantics":
    case "taskStatus.reorder":
    case "taskStatus.archive":
    case "taskStatus.restore": {
      const status = transaction.getTaskStatus(command.payload.statusId);
      const workspace = transaction.getWorkspace(command.workspaceId);
      if (
        status === undefined ||
        status.workspaceId !== command.workspaceId ||
        workspace === undefined
      ) {
        return precondition(command, occurredAt);
      }
      const currentState = taskStatusState(status);
      let update: TaskStatusDefinitionUpdate;
      let changedFields: readonly string[];
      if (command.commandName === "taskStatus.rename") {
        const normalizedLabel =
          command.payload.label.toLocaleLowerCase("pl-PL");
        if (
          command.payload.label === status.label ||
          transaction
            .listTaskStatuses(command.workspaceId)
            .some(
              (definition) =>
                definition.id !== status.id &&
                taskStatusState(definition) === "active" &&
                definition.label.toLocaleLowerCase("pl-PL") === normalizedLabel,
            )
        ) {
          return precondition(command, occurredAt);
        }
        update = { label: command.payload.label };
        changedFields = ["label"];
      } else if (command.commandName === "taskStatus.setSemantics") {
        if (
          command.payload.operationalSemantics === status.operationalSemantics
        ) {
          return precondition(command, occurredAt);
        }
        update = {
          operationalSemantics: command.payload.operationalSemantics,
        };
        changedFields = ["operationalSemantics"];
      } else if (command.commandName === "taskStatus.reorder") {
        if (command.payload.position === status.position) {
          return precondition(command, occurredAt);
        }
        update = { position: command.payload.position };
        changedFields = ["position"];
      } else if (command.commandName === "taskStatus.archive") {
        if (
          currentState === "archived" ||
          workspace.defaultTaskStatusId === status.id
        ) {
          return precondition(command, occurredAt);
        }
        update = { state: "archived" };
        changedFields = ["state"];
      } else {
        const normalizedLabel = status.label.toLocaleLowerCase("pl-PL");
        if (
          currentState === "active" ||
          transaction
            .listTaskStatuses(command.workspaceId)
            .some(
              (definition) =>
                definition.id !== status.id &&
                taskStatusState(definition) === "active" &&
                definition.label.toLocaleLowerCase("pl-PL") === normalizedLabel,
            )
        ) {
          return precondition(command, occurredAt);
        }
        update = { state: "active" };
        changedFields = ["state"];
      }
      if (!exactExpected(command, { [status.id]: status.version })) {
        return versionConflict(command, occurredAt, {
          [status.id]: status.version,
        });
      }
      const updated = updateTaskStatusDefinition(status, update, occurredAt);
      if (!transaction.updateTaskStatus(updated, status.version)) {
        return versionConflict(command, occurredAt, {
          [status.id]: status.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "taskStatus.changed",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        changedFields,
        {
          diagnosticCode: "taskStatus.changed",
          projection: {
            kind: "taskStatus.changed",
            statusId: updated.id,
            label: updated.label,
            operationalSemantics: updated.operationalSemantics,
            state: taskStatusState(updated),
            position: updated.position,
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
          kind: "taskStatus.restore_definition",
          statusId: status.id,
          priorLabel: status.label,
          priorSemantics: status.operationalSemantics,
          priorPosition: status.position,
          priorState: currentState,
          ...(status.archivedAt === undefined
            ? {}
            : { priorArchivedAt: status.archivedAt }),
          resultingVersion: updated.version,
        },
        { [updated.id]: "taskStatus" },
      );
    }
    case "workspace.setDefaultTaskStatus": {
      const workspace = transaction.getWorkspace(command.workspaceId);
      const status = transaction.getTaskStatus(command.payload.statusId);
      if (
        workspace === undefined ||
        status?.workspaceId !== command.workspaceId ||
        taskStatusState(status) !== "active" ||
        workspace.defaultTaskStatusId === status.id
      ) {
        return precondition(command, occurredAt);
      }
      if (!exactExpected(command, { [workspace.id]: workspace.version })) {
        return versionConflict(command, occurredAt, {
          [workspace.id]: workspace.version,
        });
      }
      const updated: Workspace = {
        ...workspace,
        defaultTaskStatusId: status.id,
        version: workspace.version + 1,
        updatedAt: occurredAt,
      };
      if (!transaction.updateWorkspace(updated, workspace.version)) {
        return versionConflict(command, occurredAt, {
          [workspace.id]: workspace.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "workspace.default_status_changed",
          workspaceId: workspace.id,
          spaceId: workspace.rootSpaceId,
          aggregateId: workspace.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["defaultTaskStatusId"],
        {
          diagnosticCode: "workspace.default_status_changed",
          projection: {
            kind: "workspace.default_status_changed",
            workspaceId: workspace.id,
            defaultTaskStatusId: status.id,
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: workspace.id,
          spaceId: workspace.rootSpaceId,
          kind: "workspace.restore_default_status",
          priorDefaultTaskStatusId: workspace.defaultTaskStatusId,
          resultingVersion: updated.version,
        },
        { [updated.id]: "workspace" },
      );
    }
    case "task.setParent": {
      const task = transaction.getTask(command.payload.taskId);
      if (task === undefined) return precondition(command, occurredAt);
      const nextParentId =
        command.payload.parentTaskId === null
          ? undefined
          : command.payload.parentTaskId;
      if (nextParentId !== undefined) {
        const parent = transaction.getTask(nextParentId);
        const children = transaction.listTasksInSpace(
          task.workspaceId,
          task.spaceId,
        );
        const taskHasChildren = children.some(
          (candidate) => candidate.parentTaskId === task.id,
        );
        // One deliberate decomposition level: a parent cannot itself be a
        // subtask and a Task that already has children cannot become one.
        if (
          parent === undefined ||
          parent.id === task.id ||
          parent.workspaceId !== task.workspaceId ||
          parent.spaceId !== task.spaceId ||
          parent.recordState !== "active" ||
          parent.parentTaskId !== undefined ||
          taskHasChildren
        ) {
          return precondition(command, occurredAt);
        }
      }
      if ((task.parentTaskId ?? undefined) === nextParentId) {
        return precondition(command, occurredAt);
      }
      if (!exactExpected(command, { [task.id]: task.version })) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      const updated = setTaskParent(task, nextParentId, occurredAt);
      if (!transaction.updateTask(updated, task.version)) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "task.parent_changed",
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: task.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["parentTaskId"],
        {
          diagnosticCode: "task.parent_changed",
          projection: {
            kind: "task.parent_changed",
            taskId: updated.id,
            ...(updated.parentTaskId === undefined
              ? {}
              : { parentTaskId: updated.parentTaskId }),
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          kind: "task.restore_parent",
          taskId: task.id,
          ...(task.parentTaskId === undefined
            ? {}
            : { priorParentTaskId: task.parentTaskId }),
          resultingVersion: updated.version,
        },
      );
    }
    case "task.setOperationalState": {
      const task = transaction.getTask(command.payload.taskId);
      if (task === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, { [task.id]: task.version }))
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      if (
        (command.payload.operationalState === "waiting" &&
          command.payload.waitingOn === undefined) ||
        (command.payload.operationalState !== "waiting" &&
          command.payload.waitingOn !== undefined)
      )
        return precondition(command, occurredAt);
      const waitingOn = command.payload.waitingOn;
      const updated = setTaskOperationalState(task, {
        operationalState: command.payload.operationalState,
        ...(waitingOn === undefined
          ? {}
          : {
              waitingOn: {
                kind: waitingOn.kind,
                label: waitingOn.label,
                ...(waitingOn.recordId === undefined
                  ? {}
                  : { recordId: waitingOn.recordId }),
                ...(waitingOn.direction === undefined
                  ? {}
                  : { direction: waitingOn.direction }),
                ...(waitingOn.expectedAt === undefined
                  ? {}
                  : { expectedAt: waitingOn.expectedAt }),
              },
            }),
        occurredAt,
      });
      if (!transaction.updateTask(updated, task.version))
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "task.operational_state_changed",
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: task.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["operationalState", "waitingOn"],
        {
          diagnosticCode: "task.operational_state_changed",
          projection: {
            kind: "task.operational_state_changed",
            taskId: updated.id,
            operationalState: updated.operationalState,
            ...(updated.waitingOn === undefined
              ? {}
              : { waitingOn: updated.waitingOn }),
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          kind: "task.restore_operational_state",
          taskId: task.id,
          priorOperationalState: task.operationalState,
          ...(task.waitingOn === undefined
            ? {}
            : { priorWaitingOn: task.waitingOn }),
          resultingVersion: updated.version,
        },
        { [updated.id]: "task" },
      );
    }
    case "task.setStatus":
    case "task.complete":
    case "task.reopen": {
      const task = transaction.getTask(command.payload.taskId);
      if (task === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, { [task.id]: task.version })) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      let updated: Task;
      let appliedAutomationRuleId: AutomationRuleId | undefined;
      let eventType: "task.status_changed" | "task.completed" | "task.reopened";
      let diagnosticCode:
        "task.status_changed" | "task.completed" | "task.reopened";
      if (command.commandName === "task.setStatus") {
        const status = transaction.getTaskStatus(command.payload.statusId);
        if (
          status?.workspaceId !== task.workspaceId ||
          status.id === task.statusId ||
          taskStatusState(status) === "archived"
        ) {
          return precondition(command, occurredAt);
        }
        updated = setTaskStatus(task, status.id, occurredAt);
        eventType = "task.status_changed";
        diagnosticCode = "task.status_changed";
      } else if (command.commandName === "task.complete") {
        if (task.completionState === "completed") {
          return outcome(command, occurredAt, {
            outcome: "conflict",
            diagnosticCode: "task.already_completed",
            currentVersions: { [task.id]: task.version },
          });
        }
        updated = completeTask(task, occurredAt);
        // Bounded reactive automation: an active complete_sets_status rule
        // rides the same transaction, journal entry, and undo descriptor as
        // the completion (task.restore_state already captures the prior
        // status), so the effect is attributed, audited, and exactly
        // undoable. Automated effects never trigger further rules.
        const completionRule = transaction
          .listAutomationRules(command.workspaceId)
          .find(
            (rule) =>
              automationRuleState(rule) === "active" &&
              rule.recipe.kind === "complete_sets_status",
          );
        if (
          completionRule !== undefined &&
          completionRule.recipe.kind === "complete_sets_status"
        ) {
          const target = transaction.getTaskStatus(
            completionRule.recipe.statusId,
          );
          if (
            target?.workspaceId === task.workspaceId &&
            taskStatusState(target) !== "archived" &&
            target.id !== updated.statusId
          ) {
            updated = { ...updated, statusId: target.id };
            appliedAutomationRuleId = completionRule.id;
          }
        }
        eventType = "task.completed";
        diagnosticCode = "task.completed";
      } else {
        if (task.completionState === "open") {
          return outcome(command, occurredAt, {
            outcome: "conflict",
            diagnosticCode: "task.already_open",
            currentVersions: { [task.id]: task.version },
          });
        }
        updated = reopenTask(task, occurredAt);
        eventType = "task.reopened";
        diagnosticCode = "task.reopened";
      }
      if (!transaction.updateTask(updated, task.version)) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: eventType,
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: task.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        command.commandName === "task.setStatus"
          ? ["statusId"]
          : appliedAutomationRuleId === undefined
            ? ["completionState", "completedAt"]
            : ["completionState", "completedAt", "statusId"],
        {
          diagnosticCode,
          projection: {
            ...taskProjection(diagnosticCode, updated),
            ...(appliedAutomationRuleId === undefined
              ? {}
              : { appliedAutomationRuleId }),
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          kind: "task.restore_state",
          taskId: task.id,
          priorStatusId: task.statusId,
          priorCompletionState: task.completionState,
          ...(task.completedAt === undefined
            ? {}
            : { priorCompletedAt: task.completedAt }),
          resultingVersion: updated.version,
        },
      );
    }
    case "task.assign": {
      const task = transaction.getTask(command.payload.taskId);
      // ADR-043 §5 — a removed Task takes no new assignment.
      if (task === undefined || task.recordState !== "active")
        return precondition(command, occurredAt);
      const membership = transaction.getMembership(
        command.workspaceId,
        command.payload.assigneePrincipalId,
      );
      const workspace = transaction.getWorkspace(command.workspaceId);
      const grant = transaction.getSpaceGrantForPrincipal(
        command.workspaceId,
        task.spaceId,
        command.payload.assigneePrincipalId,
      );
      const assigneeCanView =
        membership !== undefined &&
        membership.status !== "revoked" &&
        ((membership.role === "owner" &&
          workspace?.rootSpaceId === task.spaceId) ||
          grant?.status === "active");
      const current = transaction.getActiveTaskAssignment(task.id);
      if (
        !assigneeCanView ||
        transaction.getTaskAssignment(command.payload.assignmentId) !==
          undefined ||
        current?.assigneePrincipalId === command.payload.assigneePrincipalId
      ) {
        return precondition(command, occurredAt);
      }
      const expected = {
        [task.id]: task.version,
        ...(current === undefined ? {} : { [current.id]: current.version }),
      };
      if (!exactExpected(command, expected)) {
        return versionConflict(command, occurredAt, expected);
      }
      let removed: TaskAssignment | undefined;
      if (current !== undefined) {
        removed = removeTaskAssignment(current, occurredAt);
        if (!transaction.updateTaskAssignment(removed, current.version)) {
          return versionConflict(command, occurredAt, {
            [current.id]: current.version,
          });
        }
      }
      const assignment = assignTask({
        id: TaskAssignmentIdSchema.parse(command.payload.assignmentId),
        task,
        assigneePrincipalId: command.payload.assigneePrincipalId,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertTaskAssignment(assignment);
      const attention = upsertAttention(
        dependencies,
        transaction,
        {
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          targetPrincipalId: assignment.assigneePrincipalId,
          reason: "task_assignment",
          destination: { kind: "task", taskId: task.id },
          sourceRecordId: assignment.id,
          deduplicationKey: `task_assignment:${task.id}:${assignment.assigneePrincipalId}`,
          urgency: "in_app",
        },
        occurredAt,
      );
      const versions = {
        ...(removed === undefined ? {} : { [removed.id]: removed.version }),
        [assignment.id]: assignment.version,
        [attention.id]: attention.version,
      };
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "task.assigned",
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: assignment.id,
          aggregateVersion: assignment.version,
          taskId: task.id,
          assigneePrincipalId: assignment.assigneePrincipalId,
          occurredAt,
        },
        versions,
        ["assigneePrincipalId", "state"],
        {
          diagnosticCode: "task.assigned",
          projection: {
            kind: "task.assigned",
            assignmentId: assignment.id,
            taskId: task.id,
            assigneePrincipalId: assignment.assigneePrincipalId,
            assignmentVersion: assignment.version,
          },
        },
        undefined,
        Object.fromEntries(
          Object.keys(versions).map((id) => [
            id,
            id === attention.id ? "attentionSignal" : "taskAssignment",
          ]),
        ),
      );
    }
    case "task.unassign": {
      const task = transaction.getTask(command.payload.taskId);
      const assignment = transaction.getTaskAssignment(
        command.payload.assignmentId,
      );
      if (
        task === undefined ||
        assignment?.taskId !== task.id ||
        assignment.workspaceId !== command.workspaceId ||
        assignment.spaceId !== task.spaceId ||
        assignment.state !== "active"
      ) {
        return precondition(command, occurredAt);
      }
      const expected = {
        [task.id]: task.version,
        [assignment.id]: assignment.version,
      };
      if (!exactExpected(command, expected)) {
        return versionConflict(command, occurredAt, expected);
      }
      const removed = removeTaskAssignment(assignment, occurredAt);
      if (!transaction.updateTaskAssignment(removed, assignment.version)) {
        return versionConflict(command, occurredAt, {
          [assignment.id]: assignment.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "task.unassigned",
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          aggregateId: removed.id,
          aggregateVersion: removed.version,
          taskId: task.id,
          assigneePrincipalId: removed.assigneePrincipalId,
          occurredAt,
        },
        { [removed.id]: removed.version },
        ["state", "removedAt"],
        {
          diagnosticCode: "task.unassigned",
          projection: {
            kind: "task.unassigned",
            assignmentId: removed.id,
            taskId: task.id,
            assignmentVersion: removed.version,
          },
        },
        undefined,
        { [removed.id]: "taskAssignment" },
      );
    }
    case "comment.add": {
      const record = targetRecord(transaction, command.payload.target);
      const parent =
        command.payload.parentCommentId === undefined
          ? undefined
          : transaction.getComment(command.payload.parentCommentId);
      const mentions = [...new Set(command.payload.mentionPrincipalIds)];
      if (
        record === undefined ||
        // ADR-043 §5 — no new association may attach to a removed Task, or the
        // read-path fix would hide a Task that is still accreting comments.
        ("recordState" in record && record.recordState === "removed") ||
        transaction.getComment(command.payload.commentId) !== undefined ||
        (parent !== undefined &&
          (parent.workspaceId !== record.workspaceId ||
            parent.spaceId !== record.spaceId ||
            targetId(parent.target) !== targetId(command.payload.target))) ||
        (command.payload.parentCommentId !== undefined &&
          parent === undefined) ||
        mentions.some(
          (principalId) =>
            !eligibleMention(
              transaction,
              command.workspaceId,
              record.spaceId,
              principalId,
            ),
        )
      )
        return precondition(command, occurredAt);
      const expected = {
        [record.id]: record.version,
        ...(parent === undefined ? {} : { [parent.id]: parent.version }),
      };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const comment: RecordComment = {
        id: command.payload.commentId,
        workspaceId: record.workspaceId,
        spaceId: record.spaceId,
        target: command.payload.target,
        ...(parent === undefined ? {} : { parentCommentId: parent.id }),
        rootCommentId: parent?.rootCommentId ?? command.payload.commentId,
        body: command.payload.body,
        mentionPrincipalIds: mentions,
        authorPrincipalId: context.principalId,
        threadState: parent?.threadState ?? "open",
        revisions: [],
        version: 1,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      transaction.insertComment(comment);
      const signals = mentions
        .filter((principalId) => principalId !== context.principalId)
        .map((principalId) =>
          upsertAttention(
            dependencies,
            transaction,
            {
              workspaceId: comment.workspaceId,
              spaceId: comment.spaceId,
              targetPrincipalId: principalId,
              reason: "comment_mention",
              destination: comment.target,
              sourceRecordId: comment.id,
              deduplicationKey: `comment_mention:${comment.rootCommentId}:${principalId}`,
              urgency: "in_app",
            },
            occurredAt,
          ),
        );
      const versions = {
        [comment.id]: comment.version,
        ...Object.fromEntries(
          signals.map((signal) => [signal.id, signal.version]),
        ),
      };
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "comment.added",
          workspaceId: comment.workspaceId,
          spaceId: comment.spaceId,
          aggregateId: comment.id,
          aggregateVersion: comment.version,
          rootCommentId: comment.rootCommentId,
          occurredAt,
        },
        versions,
        ["body", "mentionPrincipalIds", "threadState"],
        {
          diagnosticCode: "comment.added",
          projection: {
            kind: "comment.added",
            commentId: comment.id,
            rootCommentId: comment.rootCommentId,
            version: comment.version,
          },
        },
        undefined,
        {
          [comment.id]: "comment",
          ...Object.fromEntries(
            signals.map((signal) => [signal.id, "attentionSignal" as const]),
          ),
        },
      );
    }
    case "comment.edit": {
      const comment = transaction.getComment(command.payload.commentId);
      const mentions = [...new Set(command.payload.mentionPrincipalIds)];
      if (
        comment === undefined ||
        comment.authorPrincipalId !== context.principalId ||
        mentions.some(
          (principalId) =>
            !eligibleMention(
              transaction,
              command.workspaceId,
              comment.spaceId,
              principalId,
            ),
        )
      )
        return precondition(command, occurredAt);
      const expected = { [comment.id]: comment.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const updated = editComment(
        comment,
        command.payload.body,
        mentions,
        context.principalId,
        occurredAt,
      );
      if (!transaction.updateComment(updated, comment.version))
        return versionConflict(command, occurredAt, expected);
      const signals = mentions
        .filter((principalId) => principalId !== context.principalId)
        .map((principalId) =>
          upsertAttention(
            dependencies,
            transaction,
            {
              workspaceId: updated.workspaceId,
              spaceId: updated.spaceId,
              targetPrincipalId: principalId,
              reason: "comment_mention",
              destination: updated.target,
              sourceRecordId: updated.id,
              deduplicationKey: `comment_mention:${updated.rootCommentId}:${principalId}`,
              urgency: "in_app",
            },
            occurredAt,
          ),
        );
      const versions = {
        [updated.id]: updated.version,
        ...Object.fromEntries(
          signals.map((signal) => [signal.id, signal.version]),
        ),
      };
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "comment.edited",
          workspaceId: updated.workspaceId,
          spaceId: updated.spaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          rootCommentId: updated.rootCommentId,
          occurredAt,
        },
        versions,
        ["body", "mentionPrincipalIds", "revisions"],
        {
          diagnosticCode: "comment.edited",
          projection: {
            kind: "comment.edited",
            commentId: updated.id,
            rootCommentId: updated.rootCommentId,
            version: updated.version,
          },
        },
        undefined,
        {
          [updated.id]: "comment",
          ...Object.fromEntries(
            signals.map((signal) => [signal.id, "attentionSignal" as const]),
          ),
        },
      );
    }
    case "comment.resolve":
    case "comment.reopen": {
      const comment = transaction.getComment(command.payload.commentId);
      if (
        comment === undefined ||
        comment.parentCommentId !== undefined ||
        (comment.authorPrincipalId !== context.principalId &&
          effectiveSpaceAccess(
            transaction,
            context,
            command.workspaceId,
            comment.spaceId,
          ) !== "edit")
      )
        return precondition(command, occurredAt);
      const expected = { [comment.id]: comment.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const state =
        command.commandName === "comment.resolve" ? "resolved" : "open";
      if (comment.threadState === state)
        return precondition(command, occurredAt);
      const updated = setCommentThreadState(
        comment,
        state,
        context.principalId,
        occurredAt,
      );
      if (!transaction.updateComment(updated, comment.version))
        return versionConflict(command, occurredAt, expected);
      const diagnosticCode =
        command.commandName === "comment.resolve"
          ? "comment.resolved"
          : "comment.reopened";
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: diagnosticCode,
          workspaceId: updated.workspaceId,
          spaceId: updated.spaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          rootCommentId: updated.rootCommentId,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["threadState", "resolvedAt", "resolvedBy"],
        {
          diagnosticCode,
          projection: {
            kind: diagnosticCode,
            commentId: updated.id,
            rootCommentId: updated.rootCommentId,
            version: updated.version,
          },
        },
        undefined,
        { [updated.id]: "comment" },
      );
    }
    case "attention.markRead":
    case "attention.dismiss": {
      const signal = transaction.getAttentionSignal(
        command.payload.attentionSignalId,
      );
      if (
        signal === undefined ||
        signal.targetPrincipalId !== context.principalId
      )
        return precondition(command, occurredAt);
      const expected = { [signal.id]: signal.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const state =
        command.commandName === "attention.markRead" ? "read" : "dismissed";
      const updated = setAttentionState(signal, state, occurredAt);
      if (!transaction.updateAttentionSignal(updated, signal.version))
        return versionConflict(command, occurredAt, expected);
      const diagnosticCode =
        command.commandName === "attention.markRead"
          ? "attention.read"
          : "attention.dismissed";
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: diagnosticCode,
          workspaceId: updated.workspaceId,
          spaceId: updated.spaceId,
          aggregateId: updated.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        ["state", state === "read" ? "readAt" : "dismissedAt"],
        {
          diagnosticCode,
          projection: {
            kind: diagnosticCode,
            attentionSignalId: updated.id,
            version: updated.version,
          },
        },
        undefined,
        { [updated.id]: "attentionSignal" },
      );
    }
    case "record.relate": {
      const task = transaction.getTask(command.payload.taskId);
      const project = transaction.getProject(command.payload.projectId);
      // ADR-043 §5 — a removed Task takes no new relation.
      if (
        task === undefined ||
        project === undefined ||
        task.recordState !== "active"
      )
        return precondition(command, occurredAt);
      if (
        !exactExpected(command, {
          [task.id]: task.version,
          [project.id]: project.version,
        })
      ) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
          [project.id]: project.version,
        });
      }
      const existing = transaction.findTaskProjectRelation(task.id, project.id);
      if (existing !== undefined) {
        return outcome(command, occurredAt, {
          outcome: "conflict",
          diagnosticCode: "relation.already_exists",
          currentVersions: { [existing.id]: existing.version },
        });
      }
      const relation = relateTaskToProject({
        id: RelationIdSchema.parse(dependencies.ids.next("relation")),
        task,
        project,
        createdBy: context.principalId,
        occurredAt,
      });
      transaction.insertRelation(relation);
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "relation.created",
          workspaceId: relation.workspaceId,
          spaceId: relation.spaceId,
          aggregateId: relation.id,
          aggregateVersion: relation.version,
          taskId: relation.taskId,
          projectId: relation.projectId,
          occurredAt,
        },
        { [relation.id]: relation.version },
        ["relationType", "taskId", "projectId"],
        {
          diagnosticCode: "relation.created",
          projection: {
            kind: "relation.created",
            relationId: relation.id,
            taskId: relation.taskId,
            projectId: relation.projectId,
            version: relation.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: relation.workspaceId,
          spaceId: relation.spaceId,
          kind: "relation.remove",
          relationId: relation.id,
          resultingVersion: relation.version,
        },
      );
    }
    case "record.unrelate": {
      const relation = transaction.getRelation(command.payload.relationId);
      if (relation === undefined || relation.state !== "active") {
        return precondition(command, occurredAt);
      }
      if (!exactExpected(command, { [relation.id]: relation.version })) {
        return versionConflict(command, occurredAt, {
          [relation.id]: relation.version,
        });
      }
      const removed = removeTaskProjectRelation(relation, occurredAt);
      if (!transaction.updateRelation(removed, relation.version)) {
        return versionConflict(command, occurredAt, {
          [relation.id]: relation.version,
        });
      }
      return appendJournal(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        {
          type: "relation.removed",
          workspaceId: relation.workspaceId,
          spaceId: relation.spaceId,
          aggregateId: relation.id,
          aggregateVersion: removed.version,
          taskId: relation.taskId,
          projectId: relation.projectId,
          occurredAt,
        },
        { [relation.id]: removed.version },
        ["deleted"],
        {
          diagnosticCode: "relation.removed",
          projection: {
            kind: "relation.removed",
            relationId: relation.id,
            taskId: relation.taskId,
            projectId: relation.projectId,
            version: removed.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: relation.workspaceId,
          spaceId: relation.spaceId,
          kind: "relation.restore",
          relationId: relation.id,
          resultingVersion: removed.version,
        },
      );
    }
    case "command.previewUndo":
      return previewUndo(transaction, command, occurredAt);
    case "command.undo":
      return applyUndo(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
      );
  }
};

const descriptorState = (
  view: ApplicationWave2ReadView,
  descriptor: UndoDescriptor,
): {
  available: boolean;
  recordIds: string[];
  versions: Record<string, number>;
  reason?: "already_undone" | "later_change";
} => {
  if (descriptor.consumedByCommandId !== undefined) {
    return {
      available: false,
      recordIds: [],
      versions: {},
      reason: "already_undone",
    };
  }
  switch (descriptor.kind) {
    case "project.restore_outcome": {
      const project = view.getProject(descriptor.projectId);
      return project?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [project.id],
            versions: { [project.id]: project.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "task.restore_state": {
      const task = view.getTask(descriptor.taskId);
      return task?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [task.id],
            versions: { [task.id]: task.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "task.restore_operational_state": {
      const task = view.getTask(descriptor.taskId);
      return task?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [task.id],
            versions: { [task.id]: task.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "automation.restore_definition": {
      const rule = view.getAutomationRule(descriptor.ruleId);
      return rule?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [rule.id],
            versions: { [rule.id]: rule.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "template.restore_definition": {
      const template = view.getProjectTemplate(descriptor.templateId);
      return template?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [template.id],
            versions: { [template.id]: template.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "meeting.unpromote_work_item": {
      const meeting = view.getStrategicRecord(descriptor.meetingId);
      const task = view.getTask(descriptor.createdTaskId);
      // Refuse once the promoted Task has been worked on, matching the
      // later-write refusal project.unapply_template established. The gate is
      // the Task and this work item's back-reference — not the meeting
      // version, which unrelated routing or linking legitimately bumps.
      return meeting?.kind === "meeting" &&
        meeting.meeting.workItems.some(
          (item) =>
            item.id === descriptor.workItemId &&
            item.taskId === descriptor.createdTaskId,
        ) &&
        task !== undefined &&
        task.recordState === "active" &&
        task.completionState === "open" &&
        task.version === descriptor.resultingTaskVersion
        ? {
            available: true,
            recordIds: [meeting.id, task.id],
            versions: {
              [meeting.id]: meeting.version,
              [task.id]: task.version,
            },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "meeting.restore_routing":
    case "meeting.restore_work_item":
    case "meeting.restore_participant_links": {
      const meeting = view.getStrategicRecord(descriptor.meetingId);
      return meeting?.kind === "meeting" &&
        meeting.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [meeting.id],
            versions: { [meeting.id]: meeting.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "project.unapply_template": {
      const project = view.getProject(descriptor.projectId);
      const tasksUnchanged = descriptor.createdTaskIds.every((taskId) => {
        const task = view.getTask(taskId);
        return (
          task !== undefined &&
          task.recordState === "active" &&
          task.completionState === "open" &&
          task.version === descriptor.resultingTaskVersions[taskId]
        );
      });
      return project?.version === descriptor.resultingProjectVersion &&
        tasksUnchanged
        ? {
            available: true,
            recordIds: [project.id, ...descriptor.createdTaskIds],
            versions: {
              [project.id]: project.version,
              ...descriptor.resultingTaskVersions,
            },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "fieldDef.restore_definition": {
      const definition = view.getFieldDefinition(descriptor.fieldId);
      return definition?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [definition.id],
            versions: { [definition.id]: definition.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "record.restore_field_value": {
      const record =
        descriptor.targetKind === "task"
          ? view.getTask(TaskIdSchema.parse(descriptor.recordId))
          : view.getProject(ProjectIdSchema.parse(descriptor.recordId));
      return record?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [record.id],
            versions: { [record.id]: record.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "taskStatus.restore_definition": {
      const status = view.getTaskStatus(descriptor.statusId);
      return status?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [status.id],
            versions: { [status.id]: status.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "workspace.restore_default_status": {
      const workspace = view.getWorkspace(descriptor.workspaceId);
      return workspace?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [workspace.id],
            versions: { [workspace.id]: workspace.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "task.restore_parent":
    case "task.restore_calendar_block":
    case "task.restore_record_state":
    case "task.restore_details": {
      const task = view.getTask(descriptor.taskId);
      return task?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [task.id],
            versions: { [task.id]: task.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "savedView.restore_definition": {
      const record = view.getStrategicRecord(descriptor.savedViewId);
      return record?.kind === "saved_view" &&
        record.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [record.id],
            versions: { [record.id]: record.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "work_link.restore_state": {
      const link = view.getStrategicRecord(descriptor.linkId);
      return link?.kind === "work_link" &&
        link.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [link.id],
            versions: { [link.id]: link.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "relation.remove": {
      const relation = view.getRelation(descriptor.relationId);
      return relation?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [relation.id],
            versions: { [relation.id]: relation.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "relation.restore":
      return view.getRelation(descriptor.relationId)?.state === "removed" &&
        view.getRelation(descriptor.relationId)?.version ===
          descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [descriptor.relationId],
            versions: { [descriptor.relationId]: descriptor.resultingVersion },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    case "capture.undo_route": {
      const capture = view.getCapture(descriptor.captureId);
      const task = view.getTask(descriptor.taskId);
      return capture?.processingState === "routed_as_task" &&
        capture.version === descriptor.resultingCaptureVersion &&
        task?.recordState === "active" &&
        task.version === descriptor.resultingTaskVersion
        ? {
            available: true,
            recordIds: [capture.id, task.id],
            versions: {
              [capture.id]: capture.version,
              [task.id]: task.version,
            },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "capture.undo_knowledge_route": {
      const capture = view.getCapture(descriptor.captureId);
      const source = view.getKnowledgeSource(descriptor.sourceId);
      return capture?.processingState === "routed_as_knowledge_source" &&
        capture.version === descriptor.resultingCaptureVersion &&
        source?.version === descriptor.resultingSourceVersion
        ? {
            available: true,
            recordIds: [capture.id, source.id],
            versions: {
              [capture.id]: capture.version,
              [source.id]: source.version,
            },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "knowledge.restore_source": {
      const source = view.getKnowledgeSource(descriptor.sourceId);
      return source?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [source.id],
            versions: { [source.id]: source.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "knowledge.restore_evidence": {
      const document = view.getDocument(descriptor.documentId);
      return document?.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [document.id],
            versions: { [document.id]: document.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "knowledge.void_named_version": {
      const version = view.getNamedDocumentVersion(descriptor.namedVersionId);
      return version?.state === "active" &&
        version.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [version.id],
            versions: { [version.id]: version.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
  }
};

const previewUndo = (
  view: ApplicationWave2ReadView,
  command: Extract<Wave2Command, { commandName: "command.previewUndo" }>,
  occurredAt: string,
): CommandOutcome => {
  if (!exactExpected(command, {})) return precondition(command, occurredAt);
  return outcome(command, occurredAt, {
    outcome: "preview",
    diagnosticCode: "undo.previewed",
    projection: undoPreviewProjection(
      view,
      command.payload.targetCommandId,
      "undo.previewed",
    ),
  });
};

const undoPreviewProjection = (
  view: ApplicationWave2ReadView,
  targetCommandId: Wave2Command["commandId"],
  kind: "undo.previewed" | "recovery.preview",
): Record<string, unknown> => {
  const descriptor = view.getUndoDescriptor(targetCommandId);
  if (descriptor === undefined) {
    return {
      kind,
      targetCommandId,
      available: false,
      affectedRecordIds: [],
      requiredVersions: {},
      unavailableReason: "unsupported",
    };
  }
  const state = descriptorState(view, descriptor);
  return {
    kind,
    targetCommandId,
    available: state.available,
    ...(state.available ? { compensationKind: descriptor.kind } : {}),
    affectedRecordIds: state.recordIds,
    requiredVersions: state.versions,
    ...(state.reason === undefined ? {} : { unavailableReason: state.reason }),
  };
};

const applyUndo = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationTransaction,
  context: ExecutionContext,
  command: Extract<Wave2Command, { commandName: "command.undo" }>,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
): CommandOutcome => {
  if (!isApplicationWave2Transaction(transaction)) {
    return precondition(command, occurredAt);
  }
  const descriptor = transaction.getUndoDescriptor(
    command.payload.targetCommandId,
  );
  if (descriptor === undefined) {
    return outcome(command, occurredAt, {
      outcome: "conflict",
      diagnosticCode: "undo.not_available",
      currentVersions: {},
    });
  }
  if (descriptor.consumedByCommandId !== undefined) {
    return outcome(command, occurredAt, {
      outcome: "conflict",
      diagnosticCode: "undo.already_applied",
      currentVersions: {},
    });
  }
  const state = descriptorState(transaction, descriptor);
  if (!state.available || !exactExpected(command, state.versions)) {
    return outcome(command, occurredAt, {
      outcome: "conflict",
      diagnosticCode: "undo.not_available",
      currentVersions: state.versions,
    });
  }
  let compensatedVersions: Record<string, number>;
  let compensatedKinds: Record<
    string,
    | "capture"
    | "task"
    | "project"
    | "document"
    | "knowledgeSource"
    | "namedDocumentVersion"
    | "relation"
    | "strategicRecord"
    | "taskStatus"
    | "workspace"
    | "fieldDefinition"
    | "projectTemplate"
    | "automationRule"
  >;
  if (descriptor.kind === "project.restore_outcome") {
    const project = transaction.getProject(descriptor.projectId) as Project;
    const restored = updateProjectOutcome(
      project,
      descriptor.priorOutcome,
      occurredAt,
    );
    transaction.updateProject(restored, project.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "project" };
  } else if (descriptor.kind === "task.restore_state") {
    const task = transaction.getTask(descriptor.taskId) as Task;
    const base = setTaskStatus(task, descriptor.priorStatusId, occurredAt);
    const restored: Task =
      descriptor.priorCompletionState === "completed"
        ? {
            ...base,
            completionState: "completed",
            ...(descriptor.priorCompletedAt === undefined
              ? {}
              : { completedAt: descriptor.priorCompletedAt }),
          }
        : (() => {
            const withoutCompletedAt: Omit<Task, "completedAt"> & {
              completedAt?: string;
            } = { ...base };
            delete withoutCompletedAt.completedAt;
            return { ...withoutCompletedAt, completionState: "open" };
          })();
    transaction.updateTask(restored, task.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "task" };
  } else if (descriptor.kind === "automation.restore_definition") {
    const rule = transaction.getAutomationRule(
      descriptor.ruleId,
    ) as AutomationRule;
    const { disabledAt: _disabledAt, ...base } = rule;
    void _disabledAt;
    const restored: AutomationRule = {
      ...base,
      name: descriptor.priorName,
      state: descriptor.priorState,
      ...(descriptor.priorDisabledAt === undefined
        ? {}
        : { disabledAt: descriptor.priorDisabledAt }),
      position: descriptor.priorPosition,
      version: rule.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateAutomationRule(restored, rule.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "automationRule" };
  } else if (descriptor.kind === "template.restore_definition") {
    const template = transaction.getProjectTemplate(
      descriptor.templateId,
    ) as ProjectTemplate;
    const {
      description: _description,
      retiredAt: _retiredAt,
      ...base
    } = template;
    void _description;
    void _retiredAt;
    const restored: ProjectTemplate = {
      ...base,
      name: descriptor.priorName,
      ...(descriptor.priorDescription === undefined
        ? {}
        : { description: descriptor.priorDescription }),
      taskTitles: descriptor.priorTaskTitles,
      fieldIds: descriptor.priorFieldIds,
      position: descriptor.priorPosition,
      state: descriptor.priorState,
      ...(descriptor.priorRetiredAt === undefined
        ? {}
        : { retiredAt: descriptor.priorRetiredAt }),
      version: template.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateProjectTemplate(restored, template.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "projectTemplate" };
  } else if (descriptor.kind === "meeting.unpromote_work_item") {
    const record = transaction.getStrategicRecord(descriptor.meetingId);
    compensatedVersions = {};
    compensatedKinds = {};
    if (descriptor.createdRelationId !== undefined) {
      const relation = transaction.getRelation(descriptor.createdRelationId);
      if (relation !== undefined && relation.state === "active") {
        const removed = removeTaskProjectRelation(relation, occurredAt);
        transaction.updateRelation(removed, relation.version);
        compensatedVersions[removed.id] = removed.version;
        compensatedKinds[removed.id] = "relation";
      }
    }
    const task = transaction.getTask(descriptor.createdTaskId);
    if (task !== undefined) {
      const removedTask: Task = {
        ...task,
        recordState: "removed",
        version: task.version + 1,
        updatedAt: occurredAt,
      };
      transaction.updateTask(removedTask, task.version);
      compensatedVersions[removedTask.id] = removedTask.version;
      compensatedKinds[removedTask.id] = "task";
    }
    if (record?.kind === "meeting") {
      // Clearing taskId returns the work item to promotable state.
      const restored: StrategicRecord = {
        ...record,
        meeting: {
          ...record.meeting,
          workItems: record.meeting.workItems.map((item) => {
            if (item.id !== descriptor.workItemId) return item;
            const { taskId: _taskId, ...base } = item;
            void _taskId;
            return { ...base, version: item.version + 1 };
          }),
          version: record.meeting.version + 1,
          updatedAt: occurredAt,
        },
        version: record.version + 1,
        updatedAt: occurredAt,
      };
      transaction.updateStrategicRecord(restored, record.version);
      compensatedVersions[restored.id] = restored.version;
      compensatedKinds[restored.id] = "strategicRecord";
    }
  } else if (descriptor.kind === "meeting.restore_routing") {
    const record = transaction.getStrategicRecord(
      descriptor.meetingId,
    ) as Extract<StrategicRecord, { kind: "meeting" }>;
    const {
      projectId: _projectId,
      organizationId: _organizationId,
      ...meetingBase
    } = record.meeting;
    void _projectId;
    void _organizationId;
    const restored: StrategicRecord = {
      ...record,
      spaceId: descriptor.priorSpaceId,
      meeting: {
        ...meetingBase,
        spaceId: descriptor.priorSpaceId,
        ...(descriptor.priorProjectId === undefined
          ? {}
          : { projectId: descriptor.priorProjectId }),
        ...(descriptor.priorOrganizationId === undefined
          ? {}
          : { organizationId: descriptor.priorOrganizationId }),
        version: record.meeting.version + 1,
        updatedAt: occurredAt,
      },
      version: record.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateStrategicRecord(restored, record.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
  } else if (descriptor.kind === "meeting.restore_work_item") {
    const record = transaction.getStrategicRecord(
      descriptor.meetingId,
    ) as Extract<StrategicRecord, { kind: "meeting" }>;
    const priorItem = descriptor.priorItem;
    const workItems =
      priorItem === undefined
        ? record.meeting.workItems.filter(
            (item) => item.id !== descriptor.workItemId,
          )
        : record.meeting.workItems.map((item) =>
            item.id === descriptor.workItemId ? priorItem : item,
          );
    const restored: StrategicRecord = {
      ...record,
      meeting: {
        ...record.meeting,
        workItems,
        triage: workItems.some((item) => item.state === "conflicted")
          ? "conflicted"
          : record.meeting.missingComponents.length > 0
            ? "partial"
            : "ready",
        version: record.meeting.version + 1,
        updatedAt: occurredAt,
      },
      version: record.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateStrategicRecord(restored, record.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
  } else if (descriptor.kind === "meeting.restore_participant_links") {
    const record = transaction.getStrategicRecord(
      descriptor.meetingId,
    ) as Extract<StrategicRecord, { kind: "meeting" }>;
    const priorById = new Map(
      descriptor.priorLinks.map((link) => [link.externalId, link.personId]),
    );
    compensatedVersions = {};
    compensatedKinds = {};
    // Undo unlinks; it deliberately does not delete People the command
    // created. A Person may already be referenced by other records, and
    // deleting identity on undo is destructive in a way unlinking is not
    // (ADR-040 §4). `createdPersonIds` stays on the descriptor as the audit
    // trail of what linking brought into existence.
    const restored: StrategicRecord = {
      ...record,
      meeting: {
        ...record.meeting,
        participants: record.meeting.participants.map((participant) => {
          const prior = priorById.get(participant.externalId);
          const { personId: _personId, ...base } = participant;
          void _personId;
          return prior === undefined ? base : { ...base, personId: prior };
        }),
        version: record.meeting.version + 1,
        updatedAt: occurredAt,
      },
      version: record.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateStrategicRecord(restored, record.version);
    compensatedVersions[restored.id] = restored.version;
    compensatedKinds[restored.id] = "strategicRecord";
  } else if (descriptor.kind === "project.unapply_template") {
    const project = transaction.getProject(descriptor.projectId) as Project;
    compensatedVersions = {};
    compensatedKinds = {};
    for (const relationId of descriptor.createdRelationIds) {
      const relation = transaction.getRelation(relationId);
      if (relation !== undefined && relation.state === "active") {
        const removed = removeTaskProjectRelation(relation, occurredAt);
        transaction.updateRelation(removed, relation.version);
        compensatedVersions[removed.id] = removed.version;
        compensatedKinds[removed.id] = "relation";
      }
    }
    for (const taskId of descriptor.createdTaskIds) {
      const task = transaction.getTask(taskId);
      if (task === undefined) continue;
      const removedTask: Task = {
        ...task,
        recordState: "removed",
        version: task.version + 1,
        updatedAt: occurredAt,
      };
      transaction.updateTask(removedTask, task.version);
      compensatedVersions[removedTask.id] = removedTask.version;
      compensatedKinds[removedTask.id] = "task";
    }
    const { appliedTemplateId: _applied, ...projectBase } = project;
    void _applied;
    const restoredProject: Project = {
      ...projectBase,
      version: project.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateProject(restoredProject, project.version);
    compensatedVersions[restoredProject.id] = restoredProject.version;
    compensatedKinds[restoredProject.id] = "project";
  } else if (descriptor.kind === "fieldDef.restore_definition") {
    const definition = transaction.getFieldDefinition(
      descriptor.fieldId,
    ) as FieldDefinition;
    const { retiredAt: _retiredAt, ...base } = definition;
    void _retiredAt;
    const restored: FieldDefinition = {
      ...base,
      label: descriptor.priorLabel,
      position: descriptor.priorPosition,
      state: descriptor.priorState,
      ...(descriptor.priorRetiredAt === undefined
        ? {}
        : { retiredAt: descriptor.priorRetiredAt }),
      version: definition.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateFieldDefinition(restored, definition.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "fieldDefinition" };
  } else if (descriptor.kind === "record.restore_field_value") {
    const record =
      descriptor.targetKind === "task"
        ? transaction.getTask(TaskIdSchema.parse(descriptor.recordId))
        : transaction.getProject(ProjectIdSchema.parse(descriptor.recordId));
    if (record === undefined) {
      return outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "undo.not_available",
        currentVersions: state.versions,
      });
    }
    const nextFields = withFieldValue(
      record.fields,
      descriptor.fieldId,
      descriptor.priorValue,
    );
    const { fields: _fields, ...base } = record;
    void _fields;
    const restored = {
      ...base,
      ...(nextFields === undefined ? {} : { fields: nextFields }),
      version: record.version + 1,
      updatedAt: occurredAt,
    };
    if (descriptor.targetKind === "task")
      transaction.updateTask(restored as Task, record.version);
    else transaction.updateProject(restored as Project, record.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = {
      [restored.id]: descriptor.targetKind === "task" ? "task" : "project",
    };
  } else if (descriptor.kind === "taskStatus.restore_definition") {
    const status = transaction.getTaskStatus(
      descriptor.statusId,
    ) as TaskStatusDefinition;
    const { archivedAt: _archivedAt, ...base } = status;
    void _archivedAt;
    const restored: TaskStatusDefinition = {
      ...base,
      label: descriptor.priorLabel,
      operationalSemantics: descriptor.priorSemantics,
      position: descriptor.priorPosition,
      state: descriptor.priorState,
      ...(descriptor.priorArchivedAt === undefined
        ? {}
        : { archivedAt: descriptor.priorArchivedAt }),
      version: status.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateTaskStatus(restored, status.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "taskStatus" };
  } else if (descriptor.kind === "workspace.restore_default_status") {
    const workspace = transaction.getWorkspace(
      descriptor.workspaceId,
    ) as Workspace;
    const restored: Workspace = {
      ...workspace,
      defaultTaskStatusId: descriptor.priorDefaultTaskStatusId,
      version: workspace.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateWorkspace(restored, workspace.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "workspace" };
  } else if (descriptor.kind === "task.restore_parent") {
    const task = transaction.getTask(descriptor.taskId) as Task;
    const restored = setTaskParent(
      task,
      descriptor.priorParentTaskId,
      occurredAt,
    );
    transaction.updateTask(restored, task.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "task" };
  } else if (descriptor.kind === "task.restore_record_state") {
    const task = transaction.getTask(descriptor.taskId) as Task;
    const restored: Task = {
      ...task,
      recordState: descriptor.priorRecordState,
      version: task.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateTask(restored, task.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "task" };
  } else if (descriptor.kind === "task.restore_calendar_block") {
    const task = transaction.getTask(descriptor.taskId) as Task;
    const { calendarBlock: _current, ...base } = task;
    void _current;
    const restored: Task = {
      ...base,
      ...(descriptor.priorBlock === undefined
        ? {}
        : { calendarBlock: descriptor.priorBlock }),
      version: task.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateTask(restored, task.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "task" };
  } else if (descriptor.kind === "task.restore_details") {
    const task = transaction.getTask(descriptor.taskId) as Task;
    const restored = updateTaskDetails(
      task,
      {
        title: descriptor.priorTitle,
        description: descriptor.priorDescription ?? null,
        nextAction: descriptor.priorNextAction ?? null,
        startAt: descriptor.priorStartAt ?? null,
        dueAt: descriptor.priorDueAt ?? null,
        priority: descriptor.priorPriority ?? null,
      },
      occurredAt,
    );
    transaction.updateTask(restored, task.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "task" };
  } else if (descriptor.kind === "task.restore_operational_state") {
    const task = transaction.getTask(descriptor.taskId) as Task;
    const restored = setTaskOperationalState(task, {
      operationalState: descriptor.priorOperationalState,
      ...(descriptor.priorWaitingOn === undefined
        ? {}
        : { waitingOn: descriptor.priorWaitingOn }),
      occurredAt,
    });
    transaction.updateTask(restored, task.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "task" };
  } else if (descriptor.kind === "savedView.restore_definition") {
    const record = transaction.getStrategicRecord(
      descriptor.savedViewId,
    ) as Extract<StrategicRecord, { kind: "saved_view" }>;
    const restored = updateSavedView(
      record,
      {
        name: descriptor.priorName,
        filters: descriptor.priorFilters,
        sort: descriptor.priorSort,
        groupBy: descriptor.priorGroupBy ?? null,
        state: descriptor.priorState,
      },
      occurredAt,
    );
    transaction.updateStrategicRecord(restored, record.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
  } else if (descriptor.kind === "work_link.restore_state") {
    const link = transaction.getStrategicRecord(descriptor.linkId);
    if (link?.kind !== "work_link") {
      return outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "undo.not_available",
        currentVersions: state.versions,
      });
    }
    const { removedAt: _removedAt, ...withoutRemovedAt } = link;
    void _removedAt;
    const restored: StrategicRecord = {
      ...withoutRemovedAt,
      state: descriptor.priorState,
      ...(descriptor.priorRemovedAt === undefined
        ? {}
        : { removedAt: descriptor.priorRemovedAt }),
      version: link.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateStrategicRecord(restored, link.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
  } else if (descriptor.kind === "relation.remove") {
    const relation = transaction.getRelation(
      descriptor.relationId,
    ) as TaskProjectRelation;
    transaction.updateRelation(
      removeTaskProjectRelation(relation, occurredAt),
      descriptor.resultingVersion,
    );
    compensatedVersions = {
      [descriptor.relationId]: descriptor.resultingVersion + 1,
    };
    compensatedKinds = { [descriptor.relationId]: "relation" };
  } else if (descriptor.kind === "relation.restore") {
    const relation = transaction.getRelation(
      descriptor.relationId,
    ) as TaskProjectRelation;
    const restored = restoreTaskProjectRelation(relation);
    transaction.updateRelation(restored, relation.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "relation" };
  } else if (descriptor.kind === "capture.undo_route") {
    const capture = transaction.getCapture(descriptor.captureId);
    const task = transaction.getTask(descriptor.taskId);
    if (capture?.processingState !== "routed_as_task" || task === undefined) {
      return outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "undo.not_available",
        currentVersions: state.versions,
      });
    }
    const restored = undoCaptureTaskRoute({ capture, task, occurredAt });
    transaction.updateCapture(restored.capture, capture.version);
    transaction.updateTask(restored.task, task.version);
    compensatedVersions = {
      [restored.capture.id]: restored.capture.version,
      [restored.task.id]: restored.task.version,
    };
    compensatedKinds = {
      [restored.capture.id]: "capture",
      [restored.task.id]: "task",
    };
  } else if (descriptor.kind === "capture.undo_knowledge_route") {
    const capture = transaction.getCapture(descriptor.captureId);
    const source = transaction.getKnowledgeSource(descriptor.sourceId);
    if (
      capture?.processingState !== "routed_as_knowledge_source" ||
      source === undefined
    ) {
      return outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "undo.not_available",
        currentVersions: state.versions,
      });
    }
    const restored = undoCaptureKnowledgeRoute({
      capture,
      source,
      occurredAt,
    });
    transaction.updateCapture(restored.capture, capture.version);
    transaction.updateKnowledgeSource(restored.source, source.version);
    compensatedVersions = {
      [restored.capture.id]: restored.capture.version,
      [restored.source.id]: restored.source.version,
    };
    compensatedKinds = {
      [restored.capture.id]: "capture",
      [restored.source.id]: "knowledgeSource",
    };
  } else if (descriptor.kind === "knowledge.restore_source") {
    const source = transaction.getKnowledgeSource(
      descriptor.sourceId,
    ) as KnowledgeSource;
    const {
      canonicalUrl: _currentCanonicalUrl,
      excerpt: _currentExcerpt,
      ...sourceWithoutOptionalText
    } = source;
    void _currentCanonicalUrl;
    void _currentExcerpt;
    const restored: KnowledgeSource = {
      ...sourceWithoutOptionalText,
      title: descriptor.priorTitle,
      availability: descriptor.priorAvailability,
      observedAt: descriptor.priorObservedAt,
      version: source.version + 1,
      updatedAt: occurredAt,
      ...(descriptor.priorCanonicalUrl === undefined
        ? {}
        : { canonicalUrl: descriptor.priorCanonicalUrl }),
      ...(descriptor.priorExcerpt === undefined
        ? {}
        : { excerpt: descriptor.priorExcerpt }),
    };
    transaction.updateKnowledgeSource(restored, source.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "knowledgeSource" };
  } else if (descriptor.kind === "knowledge.restore_evidence") {
    const document = transaction.getDocument(descriptor.documentId)!;
    const restored = setDocumentEvidence(document, {
      sourceIds: descriptor.priorSourceIds,
      noteDocumentIds: descriptor.priorNoteDocumentIds,
      occurredAt,
    });
    transaction.updateDocument(restored, document.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "document" };
  } else {
    const namedVersion = transaction.getNamedDocumentVersion(
      descriptor.namedVersionId,
    )!;
    const voided = voidNamedDocumentVersion(namedVersion, {
      principalId: context.principalId,
      occurredAt,
    });
    transaction.updateNamedDocumentVersion(voided, namedVersion.version);
    compensatedVersions = { [voided.id]: voided.version };
    compensatedKinds = { [voided.id]: "namedDocumentVersion" };
  }
  transaction.updateUndoDescriptor({
    ...descriptor,
    consumedByCommandId: command.commandId,
  });
  return appendJournal(
    dependencies,
    transaction,
    context,
    command,
    idempotency,
    occurredAt,
    {
      type: "command.undone",
      workspaceId: descriptor.workspaceId,
      spaceId: descriptor.spaceId,
      aggregateId: Object.keys(compensatedVersions)[0] as string,
      aggregateVersion: Math.max(...Object.values(compensatedVersions)),
      targetCommandId: descriptor.targetCommandId,
      occurredAt,
    },
    compensatedVersions,
    ["compensated", "targetCommandId"],
    {
      diagnosticCode: "command.undone",
      projection: {
        kind: "command.undone",
        targetCommandId: descriptor.targetCommandId,
        compensatedRecordIds: Object.keys(compensatedVersions),
        recordVersions: compensatedVersions,
      },
    },
    undefined,
    compensatedKinds,
  );
};

const queryRejected = (
  query: QueryEnvelope,
  kernelTime: string,
  diagnosticCode:
    | "authorization.denied"
    | "query.consistency_unavailable"
    | "query.cursor_invalid",
): QueryResult =>
  QueryResultSchema.parse({
    outcome: "rejected",
    contractVersion: 1,
    queryId: query.queryId,
    kernelTime,
    diagnosticCode,
  });

// `querySuccess` takes an untyped projection and validates it strictly at
// runtime, so `relationship.workspace` handing it a raw strategic record
// typechecks no matter what the projection schema can actually carry. A domain
// field the schema lacks surfaces only as a ZodError, on a query the desktop
// snapshot loads — which is how a saved view with grouping came to break the
// Relacje surface with nothing naming the cause.
//
// This makes that mistake a compile error for every record kind. The check is
// deliberately a comparison of KEY SETS, not assignability: TypeScript allows a
// value carrying extra properties to satisfy a narrower object type (excess
// properties are rejected only for object literals), so an assignability
// assertion passes happily while Zod's `.strict()` rejects the very same record
// at runtime. Comparing keys is what actually catches a domain field the
// projection cannot carry.
type StrategicRecordProjection = z.infer<
  typeof StrategicRecordProjectionSchema
>;
type UnprojectableKeys = {
  [Kind in StrategicRecord["kind"]]: Exclude<
    keyof Extract<StrategicRecord, { kind: Kind }>,
    keyof Extract<StrategicRecordProjection, { kind: Kind }>
  >;
}[StrategicRecord["kind"]];
// Fails to compile naming the offending key(s) if any domain field has no home
// in the projection schema. The check is one level deep by design: it catches a
// missing top-level field on any record kind (it catches `groupBy` on the
// saved view, verified by reverting the schema). Drift *inside* a nested shape
// is prevented the other way, by projections importing the one schema for that
// shape rather than restating it — which is why `filters` is shared rather than
// copied. A deeper recursive comparison was tried and rejected: union-typed
// fields make it produce confusing false positives.
type AssertNoUnprojectableKeys<Gap extends never> = Gap;
export type StrategicRecordsAreFullyProjectable =
  AssertNoUnprojectableKeys<UnprojectableKeys>;

const querySuccess = (
  query: QueryEnvelope,
  kernelTime: string,
  freshness: StoreFreshness,
  projection: Record<string, unknown>,
): QueryResult =>
  QueryResultSchema.parse({
    outcome: "success",
    contractVersion: 1,
    queryId: query.queryId,
    kernelTime,
    freshness,
    projection,
  });

const authorizeSpaces = (
  dependencies: ApplicationKernelDependencies,
  view: ApplicationWave2ReadView,
  context: ExecutionContext,
  query: Wave2Query,
  spaceIds: readonly SpaceId[],
): boolean =>
  spaceIds.every((spaceId) => {
    const space = view.getSpace(spaceId);
    return (
      space?.workspaceId === query.workspaceId &&
      canViewSpace(view, context, query.workspaceId, spaceId) &&
      dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
        spaceId,
      })
    );
  });

const normalizeSearch = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();

const snippet = (value: string, needle: string): string => {
  const normalized = normalizeSearch(value);
  const index = normalized.indexOf(needle);
  if (index < 0) return value.slice(0, 160);
  const start = Math.max(0, index - 40);
  return value.slice(start, start + 160);
};

const strategicSearchText = (
  record: StrategicRecord,
): { readonly title: string; readonly detail: string } => {
  switch (record.kind) {
    case "organization":
      return {
        title: record.name,
        detail: record.nextAction ?? record.relationshipState,
      };
    case "person":
      return {
        title: record.name,
        detail: [record.role, record.email].filter(Boolean).join(" · "),
      };
    case "opportunity":
      return {
        title: record.title,
        detail: [
          record.need,
          record.qualification,
          record.stage,
          record.nextAction,
        ].join(" · "),
      };
    case "offer":
      return { title: record.title, detail: record.nextAction };
    case "renewal":
      return {
        title: record.title,
        detail: `${record.scope} · ${record.expiresAt}`,
      };
    case "relationship_fact":
      return { title: record.factType, detail: record.value };
    case "decision":
      return { title: record.title, detail: record.rationale };
    case "impact_review":
      return { title: "Decision impact review", detail: record.reason };
    case "area":
      return { title: record.title, detail: record.responsibility };
    case "initiative":
      return { title: record.title, detail: record.intendedOutcome };
    case "work_link":
      return {
        title: record.linkType.replaceAll("_", " "),
        detail: `${record.sourceRecordId} -> ${record.targetRecordId}`,
      };
    case "saved_view":
      return {
        title: record.name,
        detail: `${record.sort} saved work view`,
      };
    case "recurrence":
      return { title: record.title, detail: record.taskTitle };
    case "radar_candidate":
      return { title: record.title, detail: record.relevance };
    case "meeting":
      return {
        title: record.meeting.title ?? "Imported meeting",
        detail: [
          record.meeting.summaryMarkdown,
          record.meeting.transcriptMarkdown,
        ]
          .filter(Boolean)
          .join(" · "),
      };
  }
};

export const executeWave2Query = (
  dependencies: ApplicationKernelDependencies,
  view: ApplicationReadView,
  context: ExecutionContext,
  query: Wave2Query,
  kernelTime: string,
): QueryResult => {
  if (!isApplicationWave2ReadView(view)) {
    return QueryResultSchema.parse({
      outcome: "rejected",
      contractVersion: 1,
      queryId: query.queryId,
      kernelTime,
      diagnosticCode: "query.not_available",
    });
  }
  const freshness = view.getFreshness();
  if (
    context.workspaceId !== query.workspaceId ||
    (query.consistency === "local_authoritative" &&
      freshness.mode !== "local_authoritative")
  ) {
    return queryRejected(
      query,
      kernelTime,
      context.workspaceId !== query.workspaceId
        ? "authorization.denied"
        : "query.consistency_unavailable",
    );
  }
  if (query.queryName === "work.overview") {
    const space = view.getSpace(query.parameters.spaceId);
    if (
      space?.workspaceId !== query.workspaceId ||
      !canViewSpace(view, context, query.workspaceId, space.id) ||
      !dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
        spaceId: space.id,
      })
    )
      return queryRejected(query, kernelTime, "authorization.denied");
    const records = view.listStrategicRecords(query.workspaceId, space.id);
    const stateOrder = { waiting: 0, blocked: 1, actionable: 2 } as const;
    return querySuccess(query, kernelTime, freshness, {
      kind: "work.overview",
      tasks: view
        .listTasksInSpace(query.workspaceId, space.id)
        .filter((task) => task.recordState === "active")
        .sort(
          (left, right) =>
            stateOrder[left.operationalState] -
              stateOrder[right.operationalState] ||
            right.updatedAt.localeCompare(left.updatedAt),
        )
        .map((task) => ({
          id: task.id,
          title: task.title,
          statusId: task.statusId,
          ...(view.getActiveTaskAssignment(task.id)?.assigneePrincipalId ===
          undefined
            ? {}
            : {
                assigneePrincipalId: view.getActiveTaskAssignment(task.id)!
                  .assigneePrincipalId,
              }),
          operationalState: task.operationalState,
          ...(task.waitingOn === undefined
            ? {}
            : { waitingOn: task.waitingOn }),
          completionState: task.completionState,
          ...(task.startAt === undefined ? {} : { startAt: task.startAt }),
          ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
          ...(task.priority === undefined ? {} : { priority: task.priority }),
          ...(task.parentTaskId === undefined
            ? {}
            : { parentTaskId: task.parentTaskId }),
          ...(task.fields === undefined ? {} : { fields: task.fields }),
          version: task.version,
          updatedAt: task.updatedAt,
        })),
      projects: view
        .listProjects(query.workspaceId, space.id)
        .map((project) => ({
          id: project.id,
          title: project.title,
          intendedOutcome: project.intendedOutcome,
          lifecycle: project.lifecycle,
          version: project.version,
        })),
      areas: records
        .filter(
          (record): record is Extract<StrategicRecord, { kind: "area" }> =>
            record.kind === "area",
        )
        .map((area) => ({
          id: area.id,
          title: area.title,
          responsibility: area.responsibility,
          state: area.state,
          version: area.version,
        })),
      initiatives: records
        .filter(
          (
            record,
          ): record is Extract<StrategicRecord, { kind: "initiative" }> =>
            record.kind === "initiative",
        )
        .map((initiative) => ({
          id: initiative.id,
          title: initiative.title,
          intendedOutcome: initiative.intendedOutcome,
          state: initiative.state,
          version: initiative.version,
        })),
      links: records
        .filter(
          (record): record is Extract<StrategicRecord, { kind: "work_link" }> =>
            record.kind === "work_link",
        )
        .map((link) => ({
          id: link.id,
          linkType: link.linkType,
          sourceRecordId: link.sourceRecordId,
          targetRecordId: link.targetRecordId,
          state: link.state,
          version: link.version,
        })),
      savedViews: records
        .filter(
          (
            record,
          ): record is Extract<StrategicRecord, { kind: "saved_view" }> =>
            record.kind === "saved_view" && record.state === "active",
        )
        .map((savedView) => {
          // ADR-045. Relation conditions are evaluated here, kernel-side, by
          // the same evaluator `task.list` uses, and the view carries the
          // resulting Task ids. The surface then intersects its own intrinsic
          // filtering with this set — a membership test against an answer the
          // kernel computed, never a client-side walk of the relation graph.
          //
          // Returning the set per view (rather than taking conditions as a
          // query parameter) keeps switching views instant: the snapshot is
          // loaded once, so a chip click stays a local operation instead of
          // becoming a round-trip with its own loading state.
          //
          // Legacy R12.4 keys are translated on the way out too, so a view
          // stored before ADR-045 starts filtering rather than staying inert.
          const conditions = translatedRelationConditions(savedView.filters);
          return {
            id: savedView.id,
            name: savedView.name,
            filters: savedView.filters,
            sort: savedView.sort,
            ...(savedView.groupBy === undefined
              ? {}
              : { groupBy: savedView.groupBy }),
            ...(conditions.length === 0
              ? {}
              : {
                  relationTaskIds: [
                    ...evaluateRelationConditions(
                      view,
                      query.workspaceId,
                      space.id,
                      conditions,
                    ),
                  ],
                }),
            state: savedView.state,
            version: savedView.version,
          };
        }),
      freshness,
    });
  }
  if (query.queryName === "comment.mentionCandidates") {
    const space = view.getSpace(query.parameters.spaceId);
    if (
      space?.workspaceId !== query.workspaceId ||
      !canViewSpace(view, context, query.workspaceId, space.id) ||
      !dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
        spaceId: space.id,
      })
    )
      return queryRejected(query, kernelTime, "authorization.denied");
    const workspace = view.getWorkspace(query.workspaceId);
    const agentPrincipals = new Set(
      view
        .listAgentGrants(query.workspaceId)
        .map((grant) => grant.agentPrincipalId),
    );
    const candidates = view
      .listMemberships(query.workspaceId)
      .filter(
        (membership) =>
          !agentPrincipals.has(membership.principalId) &&
          membership.status !== "revoked" &&
          ((membership.role === "owner" &&
            workspace?.rootSpaceId === space.id) ||
            view.getSpaceGrantForPrincipal(
              query.workspaceId,
              space.id,
              membership.principalId,
            )?.status === "active"),
      )
      .map((membership) => ({
        principalId: membership.principalId,
        displayName: membership.displayName ?? "Workspace member",
        participantKind:
          membership.role === "guest"
            ? ("guest" as const)
            : ("member" as const),
      }))
      .sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName) ||
          left.principalId.localeCompare(right.principalId),
      );
    return querySuccess(query, kernelTime, freshness, {
      kind: "comment.mentionCandidates",
      spaceId: space.id,
      candidates,
    });
  }
  if (query.queryName === "comment.list") {
    const record = activeTargetRecord(view, query.parameters.target);
    if (
      record?.workspaceId !== query.workspaceId ||
      !canViewSpace(view, context, query.workspaceId, record.spaceId) ||
      !dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
        spaceId: record.spaceId,
      })
    )
      return queryRejected(query, kernelTime, "authorization.denied");
    const comments = view
      .listComments(query.workspaceId, record.spaceId)
      .filter((comment) => targetId(comment.target) === record.id);
    return querySuccess(query, kernelTime, freshness, {
      kind: "comment.list",
      target: query.parameters.target,
      threads: comments.map((comment) => {
        const author = view.getMembership(
          query.workspaceId,
          comment.authorPrincipalId,
        );
        const visibleAuthor =
          author !== undefined &&
          author.status !== "revoked" &&
          eligibleMention(
            view,
            query.workspaceId,
            comment.spaceId,
            author.principalId,
          );
        const root =
          comment.rootCommentId === comment.id
            ? comment
            : view.getComment(comment.rootCommentId);
        return {
          id: comment.id,
          ...(comment.parentCommentId === undefined
            ? {}
            : { parentCommentId: comment.parentCommentId }),
          rootCommentId: comment.rootCommentId,
          body: comment.body,
          author: {
            ...(visibleAuthor
              ? { principalId: comment.authorPrincipalId }
              : {}),
            displayName: visibleAuthor
              ? (author.displayName ?? "Workspace member")
              : "Former member",
          },
          mentionPrincipalIds: comment.mentionPrincipalIds.filter(
            (principalId) =>
              eligibleMention(
                view,
                query.workspaceId,
                comment.spaceId,
                principalId,
              ),
          ),
          threadState: root?.threadState ?? "open",
          version: comment.version,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          edited: comment.revisions.length > 0,
        };
      }),
    });
  }
  if (query.queryName === "attention.inbox") {
    if (
      !dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
      })
    )
      return queryRejected(query, kernelTime, "authorization.denied");
    const items = view
      .listAttentionSignals(query.workspaceId, context.principalId)
      .filter(
        (signal) =>
          signal.state !== "dismissed" &&
          canViewSpace(view, context, query.workspaceId, signal.spaceId),
      )
      .slice(0, query.parameters.limit ?? 50)
      .flatMap((signal) => {
        const record = activeTargetRecord(view, signal.destination);
        if (record === undefined) return [];
        return [
          {
            id: signal.id,
            reason: signal.reason,
            destination: signal.destination,
            title:
              "originalText" in record ? record.originalText : record.title,
            detail: attentionDetail(signal.reason),
            urgency: signal.urgency,
            state: signal.state,
            version: signal.version,
            occurredAt: signal.occurredAt,
          },
        ];
      });
    return querySuccess(query, kernelTime, freshness, {
      kind: "attention.inbox",
      unreadCount: items.filter((item) => item.state === "unread").length,
      items,
    });
  }
  const spaceIds =
    query.queryName === "search.global"
      ? query.parameters.spaceIds
      : query.queryName === "project.operationalOverview"
        ? (() => {
            const project = view.getProject(query.parameters.projectId);
            return project?.workspaceId === query.workspaceId
              ? [project.spaceId]
              : [];
          })()
        : query.queryName === "knowledge.documentContext"
          ? (() => {
              const document = view.getDocument(query.parameters.documentId);
              return document?.workspaceId === query.workspaceId
                ? [document.spaceId]
                : [];
            })()
          : query.queryName === "recovery.preview"
            ? (() => {
                const receipt = view.getAuditReceiptByCommand(
                  query.parameters.targetCommandId,
                );
                return receipt?.workspaceId === query.workspaceId
                  ? [receipt.spaceId]
                  : [];
              })()
            : query.queryName === "document.backlinks"
              ? (() => {
                  const target = resolveDocumentEntityTarget(
                    view,
                    query.workspaceId,
                    query.parameters.targetKind,
                    query.parameters.targetId,
                  );
                  return target === undefined ? [] : [target.spaceId];
                })()
              : [query.parameters.spaceId];
  if (
    spaceIds.length === 0 ||
    !authorizeSpaces(dependencies, view, context, query, spaceIds)
  ) {
    return queryRejected(query, kernelTime, "authorization.denied");
  }
  if (query.queryName === "activity.changeFeed") {
    // ADR-051. Every event in the Space, in order, resumable by id — as
    // distinct from `activity.meaningful`, which curates a human-readable
    // subset and cannot be resumed at all.
    // Space scope is not the whole boundary. `activity.meaningful` curated a
    // subset by hand; a feed over *every* event type exposes families whose
    // subject an agent cannot read: `workspace.access` returns only the
    // caller's own row and `agent.access` only its own grant, so membership
    // and grant administration events would hand an observer the existence,
    // ids, and cadence of changes those reads deliberately withhold. They are
    // filtered by the administrative capability that governs the subject —
    // which an agent grant can never hold (ADR-046) — so the feed cannot show
    // what a later read would refuse (ADR-051 §3).
    const administrative = (
      capability: "workspace.manageAccess" | "agent.manageAccess",
    ): boolean =>
      dependencies.authorization.authorize({
        context,
        capability,
        workspaceId: query.workspaceId,
      });
    const canSeeMembership = administrative("workspace.manageAccess");
    const canSeeGrants = administrative("agent.manageAccess");
    const events = view
      .listEvents(query.workspaceId, query.parameters.spaceId)
      .filter((event) => {
        if (event.type.startsWith("workspace.member_")) return canSeeMembership;
        if (event.type.startsWith("agent.")) return canSeeGrants;
        return true;
      });
    const cursor = query.parameters.afterEventId;
    const start =
      cursor === undefined
        ? 0
        : events.findIndex((event) => event.id === cursor) + 1;
    if (cursor !== undefined && start === 0) {
      // A cursor the feed cannot place is refused. Silently restarting from
      // the beginning would replay processed work as new, which is the one
      // failure a subscriber cannot detect.
      return queryRejected(query, kernelTime, "query.cursor_invalid");
    }
    const limit = query.parameters.limit ?? 50;
    const page = events.slice(start, start + limit);
    const last = page.at(-1);
    return querySuccess(query, kernelTime, freshness, {
      kind: "activity.changeFeed",
      events: page.map((event) => ({
        eventId: event.id,
        type: event.type,
        recordId: event.aggregateId,
        recordVersion: event.aggregateVersion,
        commandId: event.commandId,
        occurredAt: event.occurredAt,
      })),
      ...(last === undefined ? {} : { nextCursor: last.id }),
      hasMore: start + page.length < events.length,
    });
  }
  if (query.queryName === "relationship.workspace") {
    return querySuccess(query, kernelTime, freshness, {
      kind: "relationship.workspace",
      records: view.listStrategicRecords(
        query.workspaceId,
        query.parameters.spaceId,
      ),
      freshness,
    });
  }
  if (query.queryName === "radar.review") {
    const pending = view
      .listStrategicRecords(query.workspaceId, query.parameters.spaceId)
      .filter(
        (
          record,
        ): record is Extract<StrategicRecord, { kind: "radar_candidate" }> =>
          record.kind === "radar_candidate" && record.state === "pending",
      );
    return querySuccess(query, kernelTime, freshness, {
      kind: "radar.review",
      items: pending.slice(0, query.parameters.limit),
      pendingCount: pending.length,
      finite: true,
      freshness,
    });
  }
  if (query.queryName === "project.list") {
    const relations = view.listRelations(
      query.workspaceId,
      query.parameters.spaceId,
    );
    const openTasks = new Set(
      view
        .listTasksInSpace(query.workspaceId, query.parameters.spaceId)
        .filter((task) => task.completionState === "open")
        .map((task) => task.id),
    );
    return querySuccess(query, kernelTime, freshness, {
      kind: "project.list",
      items: view
        .listProjects(query.workspaceId, query.parameters.spaceId)
        .map((project) => ({
          id: project.id,
          spaceId: project.spaceId,
          title: project.title,
          intendedOutcome: project.intendedOutcome,
          lifecycle: project.lifecycle,
          relatedOpenTaskCount: relations.filter(
            (relation) =>
              relation.projectId === project.id &&
              openTasks.has(relation.taskId),
          ).length,
          version: project.version,
          updatedAt: project.updatedAt,
        })),
    });
  }
  if (query.queryName === "document.list") {
    return querySuccess(query, kernelTime, freshness, {
      kind: "document.list",
      items: view
        .listDocuments(query.workspaceId, query.parameters.spaceId)
        .map((document) => ({
          id: document.id,
          spaceId: document.spaceId,
          title: document.title,
          role: document.role ?? "document",
          version: document.version,
          updatedAt: document.updatedAt,
        })),
    });
  }
  if (query.queryName === "document.linkCandidates") {
    const normalized = query.parameters.text.toLocaleLowerCase();
    const exactTargets =
      query.parameters.targets === undefined
        ? undefined
        : new Set(
            query.parameters.targets.map(
              (target) => `${target.targetKind}:${target.targetId}`,
            ),
          );
    const items = documentEntityCandidates(
      view,
      query.workspaceId,
      query.parameters.spaceId,
    )
      .filter(
        (candidate) =>
          (exactTargets === undefined ||
            exactTargets.has(
              `${candidate.targetKind}:${candidate.targetId}`,
            )) &&
          (normalized === "" ||
            candidate.label.toLocaleLowerCase().includes(normalized)),
      )
      .slice(0, query.parameters.limit)
      .map(({ targetKind, targetId, label }) => ({
        targetKind,
        targetId,
        label,
      }));
    return querySuccess(query, kernelTime, freshness, {
      kind: "document.linkCandidates",
      items,
    });
  }
  if (query.queryName === "document.backlinks") {
    const target = resolveDocumentEntityTarget(
      view,
      query.workspaceId,
      query.parameters.targetKind,
      query.parameters.targetId,
    );
    if (target === undefined)
      return queryRejected(query, kernelTime, "authorization.denied");
    const items = view
      .listDocumentEntityLinks(
        query.workspaceId,
        query.parameters.targetKind,
        query.parameters.targetId,
      )
      .flatMap((link) => {
        const source = view.getDocument(link.documentId);
        if (
          source === undefined ||
          source.workspaceId !== query.workspaceId ||
          !canViewSpace(view, context, query.workspaceId, source.spaceId)
        )
          return [];
        return [
          {
            documentId: source.id,
            spaceId: source.spaceId,
            title: source.title,
            role: source.role ?? "document",
            updatedAt: source.updatedAt,
          },
        ];
      });
    return querySuccess(query, kernelTime, freshness, {
      kind: "document.backlinks",
      target: {
        targetKind: query.parameters.targetKind,
        targetId: query.parameters.targetId,
        label: target.label,
      },
      items,
    });
  }
  if (query.queryName === "knowledge.list") {
    const namedVersions = view.listNamedDocumentVersions(
      query.workspaceId,
      query.parameters.spaceId,
    );
    const currentVersion = (kind: "source" | "note", recordId: string) =>
      kind === "source"
        ? view.getKnowledgeSource(recordId as never)?.version
        : view.getDocument(recordId as never)?.version;
    return querySuccess(query, kernelTime, freshness, {
      kind: "knowledge.list",
      spaceId: query.parameters.spaceId,
      sources: view
        .listKnowledgeSources(query.workspaceId, query.parameters.spaceId)
        .map((source) => ({
          id: source.id,
          sourceKind: source.sourceKind,
          title: source.title,
          ...(source.canonicalUrl === undefined
            ? {}
            : { canonicalUrl: source.canonicalUrl }),
          availability: source.availability,
          observedAt: source.observedAt,
          version: source.version,
          updatedAt: source.updatedAt,
        })),
      documents: view
        .listDocuments(query.workspaceId, query.parameters.spaceId)
        .map((document) => {
          const versions = namedVersions.filter(
            (version) =>
              version.documentId === document.id && version.state === "active",
          );
          const latest = versions[0];
          return {
            id: document.id,
            title: document.title,
            role: document.role ?? "document",
            evidenceCount:
              (document.evidence?.sourceIds.length ?? 0) +
              (document.evidence?.noteDocumentIds.length ?? 0),
            namedVersionCount: versions.length,
            staleEvidence:
              latest?.evidence.some(
                (evidence) =>
                  currentVersion(evidence.kind, evidence.recordId) !==
                  evidence.version,
              ) ?? false,
            version: document.version,
            updatedAt: document.updatedAt,
          };
        }),
    });
  }
  if (query.queryName === "knowledge.documentContext") {
    const document = view.getDocument(query.parameters.documentId);
    if (document === undefined)
      return queryRejected(query, kernelTime, "authorization.denied");
    const evidence = [
      ...(document.evidence?.sourceIds ?? []).flatMap((id) => {
        const source = view.getKnowledgeSource(id);
        const capture =
          source?.sourceCaptureId === undefined
            ? undefined
            : view.getCapture(source.sourceCaptureId);
        const attachment =
          capture !== undefined &&
          capture.workspaceId === document.workspaceId &&
          capture.spaceId === document.spaceId &&
          (capture.original.kind === "managed_file" ||
            capture.original.kind === "screenshot")
            ? {
                captureId: capture.id,
                original: capture.original,
                availability:
                  source?.availability === "available"
                    ? ("available" as const)
                    : ("unavailable" as const),
              }
            : undefined;
        return source === undefined
          ? []
          : [
              {
                kind: "source" as const,
                recordId: source.id,
                title: source.title,
                currentVersion: source.version,
                ...(attachment === undefined ? {} : { attachment }),
              },
            ];
      }),
      ...(document.evidence?.noteDocumentIds ?? []).flatMap((id) => {
        const note = view.getDocument(id);
        return note === undefined
          ? []
          : [
              {
                kind: "note" as const,
                recordId: note.id,
                title: note.title,
                currentVersion: note.version,
              },
            ];
      }),
    ];
    const currentById = new Map(
      evidence.map((item) => [item.recordId, item.currentVersion]),
    );
    return querySuccess(query, kernelTime, freshness, {
      kind: "knowledge.documentContext",
      document: {
        id: document.id,
        spaceId: document.spaceId,
        title: document.title,
        role: document.role ?? "document",
        version: document.version,
        updatedAt: document.updatedAt,
      },
      evidence,
      namedVersions: view
        .listNamedDocumentVersions(
          query.workspaceId,
          document.spaceId,
          document.id,
        )
        .map((version) => ({
          id: version.id,
          documentRevisionId: version.documentRevisionId,
          name: version.name,
          milestone: version.milestone,
          contentSnapshot: version.contentSnapshot,
          evidence: version.evidence.map((item) => {
            const current = currentById.get(item.recordId);
            return {
              kind: item.kind,
              recordId: item.recordId,
              title: item.title,
              frozenVersion: item.version,
              ...(current === undefined ? {} : { currentVersion: current }),
              changed: current !== item.version,
            };
          }),
          state: version.state,
          version: version.version,
          createdAt: version.createdAt,
        })),
    });
  }
  if (query.queryName === "project.operationalOverview") {
    const project = view.getProject(query.parameters.projectId);
    if (project === undefined) {
      return queryRejected(query, kernelTime, "authorization.denied");
    }
    const taskIds = new Set(
      view
        .listRelations(query.workspaceId, project.spaceId)
        .filter((relation) => relation.projectId === project.id)
        .map((relation) => relation.taskId),
    );
    return querySuccess(query, kernelTime, freshness, {
      kind: "project.operationalOverview",
      project: {
        id: project.id,
        spaceId: project.spaceId,
        title: project.title,
        intendedOutcome: project.intendedOutcome,
        lifecycle: project.lifecycle,
        ...(project.appliedTemplateId === undefined
          ? {}
          : { appliedTemplateId: project.appliedTemplateId }),
        version: project.version,
        updatedAt: project.updatedAt,
      },
      relatedTasks: view
        .listTasksInSpace(query.workspaceId, project.spaceId)
        .filter((task) => taskIds.has(task.id))
        .map((task) => {
          const assignment = view.getActiveTaskAssignment(task.id);
          const assignee =
            assignment === undefined
              ? undefined
              : view.getMembership(
                  query.workspaceId,
                  assignment.assigneePrincipalId,
                );
          const assigneeGrant =
            assignee === undefined
              ? undefined
              : view.getSpaceGrantForPrincipal(
                  query.workspaceId,
                  task.spaceId,
                  assignee.principalId,
                );
          const assigneeIsActive =
            assignment?.redactedAssigneeState === undefined &&
            assignee !== undefined &&
            assignee.status !== "revoked" &&
            ((assignee.role === "owner" &&
              view.getWorkspace(query.workspaceId)?.rootSpaceId ===
                task.spaceId) ||
              assigneeGrant?.status === "active");
          return {
            id: task.id,
            title: task.title,
            completionState: task.completionState,
            version: task.version,
            ...(assignment === undefined
              ? {}
              : {
                  assignment: {
                    id: assignment.id,
                    ...(assigneeIsActive
                      ? { assigneePrincipalId: assignment.assigneePrincipalId }
                      : {}),
                    displayName: assigneeIsActive
                      ? (assignee.displayName ?? "Workspace member")
                      : assignment.redactedAssigneeState ===
                          "unavailable_member"
                        ? "No Space access"
                        : assignee?.status === "revoked" ||
                            assignee === undefined
                          ? "Former member"
                          : "No Space access",
                    availability: assigneeIsActive
                      ? "active"
                      : (assignment.redactedAssigneeState ??
                        (assignee?.status === "revoked" ||
                        assignee === undefined
                          ? "former_member"
                          : "unavailable_member")),
                    version: assignment.version,
                  },
                }),
          };
        }),
    });
  }
  if (query.queryName === "recovery.preview") {
    return querySuccess(
      query,
      kernelTime,
      freshness,
      undoPreviewProjection(
        view,
        query.parameters.targetCommandId,
        "recovery.preview",
      ),
    );
  }
  if (query.queryName === "search.global") {
    const needle = normalizeSearch(query.parameters.text);
    const kinds = new Set(
      query.parameters.kinds ?? [
        "task",
        "project",
        "capture",
        "source",
        "note",
        "document",
        "deliverable",
        "organization",
        "person",
        "opportunity",
        "offer",
        "renewal",
        "relationship_fact",
        "decision",
        "impact_review",
        "area",
        "recurrence",
        "radar_candidate",
        "meeting",
      ],
    );
    const items: Array<{
      recordKind:
        | "task"
        | "project"
        | "capture"
        | "source"
        | "note"
        | "document"
        | "deliverable"
        | StrategicRecord["kind"];
      recordId: string;
      spaceId: SpaceId;
      title: string;
      snippet: string;
      matchedFields: Array<
        | "title"
        | "description"
        | "nextAction"
        | "intendedOutcome"
        | "originalText"
        | "excerpt"
        | "canonicalUrl"
        | "detail"
        | "body"
      >;
      score: number;
      updatedAt: string;
    }> = [];
    for (const spaceId of spaceIds) {
      if (kinds.has("task")) {
        for (const task of view.listTasksInSpace(query.workspaceId, spaceId)) {
          const title = normalizeSearch(task.title);
          const description = normalizeSearch(task.description ?? "");
          const nextAction = normalizeSearch(task.nextAction ?? "");
          const matchedFields: Array<"title" | "description" | "nextAction"> =
            [];
          if (title.includes(needle)) matchedFields.push("title");
          if (description.includes(needle)) matchedFields.push("description");
          if (nextAction.includes(needle)) matchedFields.push("nextAction");
          if (matchedFields.length === 0) continue;
          items.push({
            recordKind: "task",
            recordId: task.id,
            spaceId,
            title: task.title,
            snippet: snippet(
              matchedFields.includes("title")
                ? task.title
                : matchedFields.includes("nextAction")
                  ? (task.nextAction ?? task.title)
                  : (task.description ?? task.title),
              needle,
            ),
            matchedFields,
            score:
              title === needle
                ? 300
                : title.startsWith(needle)
                  ? 220
                  : title.includes(needle)
                    ? 160
                    : 100,
            updatedAt: task.updatedAt,
          });
        }
      }
      if (kinds.has("project")) {
        for (const project of view.listProjects(query.workspaceId, spaceId)) {
          const title = normalizeSearch(project.title);
          const projectOutcome = normalizeSearch(project.intendedOutcome);
          const matchedFields: Array<"title" | "intendedOutcome"> = [];
          if (title.includes(needle)) matchedFields.push("title");
          if (projectOutcome.includes(needle))
            matchedFields.push("intendedOutcome");
          if (matchedFields.length === 0) continue;
          const score =
            title === needle
              ? 300
              : title.startsWith(needle)
                ? 220
                : title.includes(needle)
                  ? 160
                  : 100;
          items.push({
            recordKind: "project",
            recordId: project.id,
            spaceId,
            title: project.title,
            snippet: snippet(
              matchedFields.includes("title")
                ? project.title
                : project.intendedOutcome,
              needle,
            ),
            matchedFields,
            score,
            updatedAt: project.updatedAt,
          });
        }
      }
      if (kinds.has("capture")) {
        const captures =
          view.listCaptures({
            workspaceId: query.workspaceId,
            spaceId,
            limit: 10_000,
          }) ?? [];
        for (const capture of captures) {
          if (!normalizeSearch(capture.originalText).includes(needle)) continue;
          items.push({
            recordKind: "capture",
            recordId: capture.id,
            spaceId,
            title: capture.originalText.slice(0, 80),
            snippet: snippet(capture.originalText, needle),
            matchedFields: ["originalText"],
            score: 80,
            updatedAt:
              capture.processingState === "routed_as_task"
                ? capture.routedAt
                : capture.capturedAt,
          });
        }
      }
      if (kinds.has("source")) {
        for (const source of view.listKnowledgeSources(
          query.workspaceId,
          spaceId,
        )) {
          const title = normalizeSearch(source.title);
          const sourceExcerpt = normalizeSearch(source.excerpt ?? "");
          const sourceUrl = normalizeSearch(source.canonicalUrl ?? "");
          const matchedFields: Array<"title" | "excerpt" | "canonicalUrl"> = [];
          if (title.includes(needle)) matchedFields.push("title");
          if (sourceExcerpt.includes(needle)) matchedFields.push("excerpt");
          if (sourceUrl.includes(needle)) matchedFields.push("canonicalUrl");
          if (matchedFields.length === 0) continue;
          const value = matchedFields.includes("title")
            ? source.title
            : matchedFields.includes("excerpt")
              ? (source.excerpt ?? source.title)
              : (source.canonicalUrl ?? source.title);
          items.push({
            recordKind: "source",
            recordId: source.id,
            spaceId,
            title: source.title,
            snippet: snippet(value, needle),
            matchedFields,
            score:
              title === needle ? 300 : title.startsWith(needle) ? 220 : 140,
            updatedAt: source.updatedAt,
          });
        }
      }
      const documentBodyMatches = new Map(
        view
          .searchDocumentBodies(
            query.workspaceId,
            spaceId,
            query.parameters.text,
            query.parameters.limit ?? 50,
          )
          .map((match) => [match.documentId, match.snippet] as const),
      );
      for (const document of view.listDocuments(query.workspaceId, spaceId)) {
        const role = document.role ?? "document";
        if (!kinds.has(role)) continue;
        const title = normalizeSearch(document.title);
        const bodySnippet = documentBodyMatches.get(document.id);
        const matchedFields: Array<"title" | "body"> = [];
        if (title.includes(needle)) matchedFields.push("title");
        if (bodySnippet !== undefined) matchedFields.push("body");
        if (matchedFields.length === 0) continue;
        items.push({
          recordKind: role,
          recordId: document.id,
          spaceId,
          title: document.title,
          snippet:
            bodySnippet === undefined
              ? snippet(document.title, needle)
              : bodySnippet,
          matchedFields,
          score:
            title === needle
              ? 300
              : title.startsWith(needle)
                ? 220
                : title.includes(needle)
                  ? 160
                  : 90,
          updatedAt: document.updatedAt,
        });
      }
      for (const record of view.listStrategicRecords(
        query.workspaceId,
        spaceId,
      )) {
        if (!kinds.has(record.kind)) continue;
        const content = strategicSearchText(record);
        const title = normalizeSearch(content.title);
        const detail = normalizeSearch(content.detail);
        const matchedFields: Array<"title" | "detail"> = [];
        if (title.includes(needle)) matchedFields.push("title");
        if (detail.includes(needle)) matchedFields.push("detail");
        if (matchedFields.length === 0) continue;
        items.push({
          recordKind: record.kind,
          recordId: record.id,
          spaceId,
          title: content.title,
          snippet: snippet(
            matchedFields.includes("title") ? content.title : content.detail,
            needle,
          ),
          matchedFields,
          score:
            title === needle
              ? 300
              : title.startsWith(needle)
                ? 220
                : title.includes(needle)
                  ? 160
                  : 100,
          updatedAt: record.updatedAt,
        });
      }
    }
    items.sort(
      (left, right) =>
        right.score - left.score ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.recordKind.localeCompare(right.recordKind) ||
        left.recordId.localeCompare(right.recordId),
    );
    return querySuccess(query, kernelTime, freshness, {
      kind: "search.global",
      normalizedQuery: needle,
      items: items.slice(0, query.parameters.limit ?? 50),
    });
  }
  if (query.queryName === "cockpit.week") {
    const weekStart = new Date(`${query.parameters.weekStart}T00:00:00.000Z`);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    const relations = view.listRelations(
      query.workspaceId,
      query.parameters.spaceId,
    );
    const projects = new Map(
      view
        .listProjects(query.workspaceId, query.parameters.spaceId)
        .map((project) => [project.id, project]),
    );
    // Planned time replaces the old creation-time proxy: what is late, due,
    // or starting this week outranks what merely exists, and priority is a
    // deliberate signal instead of recency. Creation time remains history.
    const focus = view
      .listTasksInSpace(query.workspaceId, query.parameters.spaceId)
      .filter((task) => task.completionState === "open")
      .map((task) => {
        const relation = relations.find(
          (candidate) => candidate.taskId === task.id,
        );
        const project =
          relation === undefined ? undefined : projects.get(relation.projectId);
        const reasons: Array<Record<string, unknown>> = [
          { code: "task_open", weight: 100 },
        ];
        if (task.dueAt !== undefined) {
          if (task.dueAt < kernelTime) {
            reasons.push({ code: "overdue", weight: 60, dueAt: task.dueAt });
          } else if (
            task.dueAt.slice(0, 10) >= query.parameters.weekStart &&
            task.dueAt.slice(0, 10) <= weekEnd
          ) {
            reasons.push({
              code: "due_this_week",
              weight: 40,
              dueAt: task.dueAt,
            });
          }
        }
        if (
          task.startAt !== undefined &&
          task.startAt.slice(0, 10) >= query.parameters.weekStart &&
          task.startAt.slice(0, 10) <= weekEnd
        ) {
          reasons.push({
            code: "starts_this_week",
            weight: 15,
            startAt: task.startAt,
          });
        }
        if (task.priority === "urgent")
          reasons.push({ code: "priority_urgent", weight: 25 });
        else if (task.priority === "high")
          reasons.push({ code: "priority_high", weight: 15 });
        if (project !== undefined)
          reasons.push({
            code: "active_project",
            weight: 10,
            projectId: project.id,
            projectTitle: project.title,
          });
        return {
          taskId: task.id,
          title: task.title,
          score: reasons.reduce(
            (sum, reason) => sum + Number(reason.weight),
            0,
          ),
          ...(task.startAt === undefined ? {} : { startAt: task.startAt }),
          ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
          ...(task.priority === undefined ? {} : { priority: task.priority }),
          ...(task.calendarBlock === undefined
            ? {}
            : { calendarBlock: task.calendarBlock }),
          reasons,
          ...(project === undefined ? {} : { relatedProjectId: project.id }),
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.title.localeCompare(right.title) ||
          left.taskId.localeCompare(right.taskId),
      )
      .slice(0, query.parameters.limit ?? 10);
    return querySuccess(query, kernelTime, freshness, {
      kind: "cockpit.week",
      weekStart: query.parameters.weekStart,
      weekEnd,
      focus,
    });
  }
  const activityMap: Partial<Record<DomainEvent["type"], string>> = {
    "capture.routed_as_task": "capture_routed",
    "capture.transcript_written": "capture_transcript_ready",
    "project.created": "project_created",
    "project.outcome_updated": "project_outcome_changed",
    "task.created": "task_created",
    "task.details_updated": "task_details_updated",
    "task.parent_changed": "task_parent_changed",
    "automation.created": "automation_rule_created",
    "automation.changed": "automation_rule_changed",
    "automation.swept": "automation_swept",
    "template.created": "template_definition_created",
    "template.changed": "template_definition_changed",
    "project.template_applied": "project_template_applied",
    "fieldDef.created": "field_definition_created",
    "fieldDef.changed": "field_definition_changed",
    "record.field_value_set": "record_field_value_set",
    "taskStatus.created": "task_status_definition_created",
    "taskStatus.changed": "task_status_definition_changed",
    "workspace.default_status_changed": "workspace_default_status_changed",
    "task.completed": "task_completed",
    "task.reopened": "task_reopened",
    "task.assigned": "task_assigned",
    "task.unassigned": "task_unassigned",
    "comment.added": "comment_added",
    "comment.resolved": "comment_resolved",
    "comment.reopened": "comment_reopened",
    "relation.created": "relation_added",
    "relation.removed": "relation_removed",
    "knowledge.source_created": "knowledge_source_created",
    "knowledge.source_updated": "knowledge_source_updated",
    "knowledge.evidence_updated": "knowledge_evidence_updated",
    "knowledge.named_version_created": "knowledge_named_version_created",
    "knowledge.named_version_voided": "knowledge_named_version_voided",
    "strategic.record_changed": "strategic_record_changed",
    "command.undone": "command_undone",
  };
  const items = view
    .listEvents(query.workspaceId, query.parameters.spaceId)
    .flatMap((event) => {
      const activityType = activityMap[event.type];
      return activityType === undefined
        ? []
        : [
            {
              eventId: event.id,
              targetCommandId: event.commandId,
              activityType,
              recordId: event.aggregateId,
              occurredAt: event.occurredAt,
            },
          ];
    })
    .slice(0, query.parameters.limit ?? 50);
  return querySuccess(query, kernelTime, freshness, {
    kind: "activity.meaningful",
    items,
  });
};
