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
  DEPENDENT_SAMPLE_LIMIT,
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
  TaskAssignmentIdSchema,
  AttentionSignalIdSchema,
  KnowledgeSourceIdSchema,
  NamedDocumentVersionIdSchema,
  StrategicRecordIdSchema,
  type BlockingRecord,
  type CommandEnvelope,
  type CommandOutcome,
  type ExecutionContext,
  type ImportedMeeting,
  type StrategicRecordId,
  type QueryEnvelope,
  type QueryResult,
  type SpaceId,
  type WorkspaceId,
  type KnowledgeSourceId,
  type GlobalSearchRecordKind,
  globalSearchRecordKindIds,
  isGlobalSearchRecordKind,
  translatedRelationConditions,
} from "@constellation/contracts";
import {
  effectiveWorkingDay,
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
  taskFieldsWithComputedValues,
  updateTaskDetails,
  createNativeDocument,
  relateTaskToProject,
  relateTaskToOpportunity,
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
  updateAreaResponsibility,
  updateOrganizationDetails,
  updatePersonDetails,
  createInitiative,
  updateInitiativeOutcome,
  createWorkLink,
  createSavedView,
  createRecurrence,
  createRadarCandidate,
  closeProject,
  reopenProject,
  recordIsActive,
  restoreTaskProjectRelation,
  setStrategicRecordState,
  strategicRecordIsDeleted,
  strategicRecordReferences,
  strategicRecordState,
  setTaskStatus,
  setTaskOperationalState,
  undoCaptureTaskRoute,
  undoCaptureKnowledgeRoute,
  updateProjectDetails,
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
  type TaskWorkRelation,
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
import { projectedTaskAssignment } from "./task-assignment-projection.js";
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
      | "project.remove"
      | "document.create"
      | "document.remove"
      | "knowledge.sourceCreate"
      | "knowledge.sourceRemove"
      | "knowledge.sourceUpdate"
      | "knowledge.documentSetEvidence"
      | "knowledge.namedVersionCreate"
      | "knowledge.namedVersionVoid"
      | "relationship.organizationCreate"
      | "relationship.organizationRemove"
      | "relationship.personCreate"
      | "relationship.personUpdate"
      | "relationship.organizationUpdate"
      | "relationship.personRemove"
      | "opportunity.create"
      | "opportunity.remove"
      | "opportunity.offerCreate"
      | "opportunity.offerRemove"
      | "opportunity.linkOutcomes"
      | "relationship.renewalCreate"
      | "relationship.renewalResolve"
      | "relationship.factCreate"
      | "relationship.factRemove"
      | "decision.create"
      | "decision.remove"
      | "decision.supersede"
      | "decision.resolveImpact"
      | "area.create"
      | "area.remove"
      | "area.updateResponsibility"
      | "initiative.create"
      | "initiative.remove"
      | "initiative.updateOutcome"
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
      | "project.updateDetails"
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
      | "command.undo"
      | "agent.checkpointRevert";
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
      | "person.list"
      | "organization.list"
      | "radar.review"
      | "project.operationalOverview"
      | "organization.operationalOverview"
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

/**
 * The capability a command needs is its own name — a compile-time identity
 * every Wave-2 command keeps, which is why a new command cannot be authorized
 * by accident. `agent.checkpointRevert` is the one exception and is excluded
 * here rather than cast away: its capability, `agent.checkpoint.revert`, is
 * already written into every grant in the field (ADR-069).
 *
 * The policy is consulted before the target is resolved, for the reason
 * `isAgentAccessCommandAuthorized` already gives: a caller told
 * `command.precondition_failed` can spend a run trying to satisfy a
 * precondition when the real answer is that its grant never carried the
 * capability. Field finding #18 measured this on `relationship.personUpdate` —
 * a made-up id answered a precondition and a real record answered a denial, so
 * the diagnostic distinguished records the caller may not name, inside a Space
 * it can already edit. That is the existence oracle `RecordedAuthorization`
 * exists to refuse (kernel.ts).
 *
 * Only which capability the kernel recorded moves. The verdict is still
 * `spaceId !== undefined` and `canEditSpace`, and every policy in the tree
 * reads the ExecutionContext alone, so reordering pure predicates cannot
 * change the answer — and no second capability table is introduced, because
 * the capability is the one this helper already used.
 */
const authorized = (
  dependencies: Pick<ApplicationKernelDependencies, "authorization">,
  view: ApplicationWave2ReadView,
  context: ExecutionContext,
  command: Exclude<Wave2Command, { commandName: "agent.checkpointRevert" }>,
  spaceId: SpaceId | undefined,
): boolean =>
  dependencies.authorization.authorize({
    context,
    capability: command.commandName,
    workspaceId: command.workspaceId,
    ...(spaceId === undefined ? {} : { spaceId }),
  }) &&
  spaceId !== undefined &&
  canEditSpace(view, context, command.workspaceId, spaceId);

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
    case "project.remove": {
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
    case "document.remove": {
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
    case "knowledge.sourceRemove": {
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
    // A partial update names one record it already knows, exactly as a removal
    // does: the Space it is authorized against is that record's own.
    case "relationship.personUpdate": {
      const person = view.getStrategicRecord(command.payload.personId);
      return authorized(
        dependencies,
        view,
        context,
        command,
        person?.workspaceId === command.workspaceId
          ? person.spaceId
          : undefined,
      );
    }
    case "relationship.organizationUpdate": {
      const organization = view.getStrategicRecord(
        command.payload.organizationId,
      );
      return authorized(
        dependencies,
        view,
        context,
        command,
        organization?.workspaceId === command.workspaceId
          ? organization.spaceId
          : undefined,
      );
    }
    // Every removal names one record it already knows, so the Space it is
    // authorized against is the record's own — there is no spaceId in the
    // payload to trust.
    case "relationship.organizationRemove":
    case "relationship.personRemove":
    case "opportunity.remove":
    case "opportunity.offerRemove":
    case "relationship.factRemove":
    case "decision.remove":
    case "area.remove":
    case "initiative.remove": {
      const record = view.getStrategicRecord(removedStrategicRecordId(command));
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
    case "area.updateResponsibility": {
      const record = view.getStrategicRecord(command.payload.areaId);
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
    case "initiative.updateOutcome": {
      const record = view.getStrategicRecord(command.payload.initiativeId);
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
      // A target that is not there still has to ask the policy, or these arms
      // become the oracle the helper below was changed to close: refusing here
      // consults nothing, so a caller lacking the capability would read a
      // precondition for an id that resolves to nothing and a denial for one
      // that resolves to a meeting — including a meeting in a Space it cannot
      // reach. Passing no Space asks the grant-level question, which is the
      // only one whose answer the caller is entitled to.
      if (record?.kind !== "meeting")
        return authorized(dependencies, view, context, command, undefined);
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
      // A target that is not there still has to ask the policy, or these arms
      // become the oracle the helper below was changed to close: refusing here
      // consults nothing, so a caller lacking the capability would read a
      // precondition for an id that resolves to nothing and a denial for one
      // that resolves to a meeting — including a meeting in a Space it cannot
      // reach. Passing no Space asks the grant-level question, which is the
      // only one whose answer the caller is entitled to.
      if (record?.kind !== "meeting")
        return authorized(dependencies, view, context, command, undefined);
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
      // A target that is not there still has to ask the policy, or these arms
      // become the oracle the helper below was changed to close: refusing here
      // consults nothing, so a caller lacking the capability would read a
      // precondition for an id that resolves to nothing and a denial for one
      // that resolves to a meeting — including a meeting in a Space it cannot
      // reach. Passing no Space asks the grant-level question, which is the
      // only one whose answer the caller is entitled to.
      if (record?.kind !== "meeting")
        return authorized(dependencies, view, context, command, undefined);
      // Correcting a work item is ordinary meeting work: it writes nothing
      // outside the meeting record, so it carries no additional grant the way
      // promotion (task.create) and linking (relationship.personCreate) do.
      return authorized(dependencies, view, context, command, record.spaceId);
    }
    case "meeting.linkParticipants": {
      const record = view.getStrategicRecord(command.payload.meetingId);
      // A target that is not there still has to ask the policy, or these arms
      // become the oracle the helper below was changed to close: refusing here
      // consults nothing, so a caller lacking the capability would read a
      // precondition for an id that resolves to nothing and a denial for one
      // that resolves to a meeting — including a meeting in a Space it cannot
      // reach. Passing no Space asks the grant-level question, which is the
      // only one whose answer the caller is entitled to.
      if (record?.kind !== "meeting")
        return authorized(dependencies, view, context, command, undefined);
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
    case "project.updateOutcome":
    case "project.updateDetails": {
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
      // `safeParse`, not `parse`, and the reason is the blast radius rather
      // than a live bug: the envelope already validates `recordId` as a uuid
      // and both id schemas are branded uuids, so nothing that reaches here can
      // fail today. But `.parse` throws, this runs inside `store.transact`, and
      // the executor converts only `RetryableUnitOfWorkError` — so the day that
      // payload field is widened, this arm stops rejecting and starts throwing
      // out of the kernel. A miss is indistinguishable from a record that is
      // not there, which is what the caller should have been told anyway.
      const record = ((): Task | Project | undefined => {
        if (command.payload.targetKind === "task") {
          const id = TaskIdSchema.safeParse(command.payload.recordId);
          return id.success ? view.getTask(id.data) : undefined;
        }
        const id = ProjectIdSchema.safeParse(command.payload.recordId);
        return id.success ? view.getProject(id.data) : undefined;
      })();
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
      // The policy goes first here for the same reason it does in the shared
      // helper above: a branch that refuses before consulting it consults
      // nothing, and the kernel reads "nothing consulted" as "nothing refused",
      // so a caller whose grant never carried the capability is told to fix a
      // target instead. Narrower than the helper's case — these arms resolve
      // records the caller can already read — so what it buys is the honest
      // answer, not a closed disclosure. The two arms below follow this one.
      return (
        dependencies.authorization.authorize({
          context,
          capability: command.commandName,
          workspaceId: command.workspaceId,
          ...(spaceId === undefined ? {} : { spaceId }),
        }) &&
        spaceId !== undefined &&
        canCommentInSpace(view, context, command.workspaceId, spaceId)
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
      // The existing ternary is moved up as-is, never re-derived from the
      // command name: `comment.reopen` is itself a capability, and probing for
      // it would newly refuse a grant that holds `comment.resolve` without it.
      const capability =
        command.commandName === "comment.resolve" ||
        command.commandName === "comment.reopen"
          ? "comment.resolve"
          : "comment.edit";
      return (
        dependencies.authorization.authorize({
          context,
          capability,
          workspaceId: command.workspaceId,
          ...(spaceId === undefined ? {} : { spaceId }),
        }) &&
        spaceId !== undefined &&
        canCommentInSpace(view, context, command.workspaceId, spaceId)
      );
    }
    case "attention.markRead":
    case "attention.dismiss": {
      const signal = view.getAttentionSignal(command.payload.attentionSignalId);
      // Same ordering as the comment arms above, and the same reason.
      const spaceId =
        signal?.workspaceId === command.workspaceId
          ? signal.spaceId
          : undefined;
      return (
        dependencies.authorization.authorize({
          context,
          capability: command.commandName,
          workspaceId: command.workspaceId,
          ...(spaceId === undefined ? {} : { spaceId }),
        }) &&
        signal?.workspaceId === command.workspaceId &&
        signal.targetPrincipalId === context.principalId &&
        canViewSpace(view, context, command.workspaceId, signal.spaceId)
      );
    }
    case "record.relate": {
      const task = view.getTask(command.payload.taskId);
      // Both ends have to sit in one Space, whichever end the relation type
      // names — the Space this command is authorized against is theirs.
      const target =
        command.payload.relationType === "task_contributes_to_project"
          ? view.getProject(command.payload.projectId)
          : view.getStrategicRecord(command.payload.opportunityId);
      const spaceId =
        task?.workspaceId === command.workspaceId &&
        target?.workspaceId === command.workspaceId &&
        task.spaceId === target.spaceId
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
    case "agent.checkpointRevert":
      // Authorized by the kernel against `agent.checkpoint.revert`, the
      // capability every issued grant already carries. Repeated here because
      // the Wave-2 authorization switch is exhaustive and a silent `false`
      // would look like a policy decision rather than a routing detail.
      return dependencies.authorization.authorize({
        context,
        capability: "agent.checkpoint.revert",
        workspaceId: command.workspaceId,
      });
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

/**
 * The one refusal that names its cause. Every record here is inside the
 * target's own Space, and this branch is only reached after an authorization
 * pass that required that Space, so the caller can already read all of them.
 * The list is a sample and the count is the real total, because a Space can
 * hold more dependents than a diagnostic should carry.
 */
const blocked = (
  command: Wave2Command,
  occurredAt: string,
  dependents: readonly BlockingRecord[],
): CommandOutcome =>
  outcome(command, occurredAt, {
    outcome: "rejected",
    diagnosticCode: "record.still_referenced",
    blockedBy: dependents.slice(0, DEPENDENT_SAMPLE_LIMIT),
    blockedByCount: dependents.length,
  });

/**
 * The source key this record claims, if it is a kind that claims one.
 *
 * Named once because the claim is made in three places that must agree: the
 * create that takes the key, the restore that refuses to take it back if a
 * re-import got there first, and the preview of that restore. A kind added to
 * the create and forgotten in the other two would let an undo produce a second
 * live record holding one key, after which the set-once rule refuses to repair
 * either — which is the failure the guards exist to prevent, reached through
 * the guards themselves.
 */
const claimedSourceKey = (
  record: StrategicRecord,
):
  | {
      readonly kind: "person" | "organization" | "opportunity";
      readonly externalId: string;
    }
  | undefined =>
  (record.kind === "person" ||
    record.kind === "organization" ||
    record.kind === "opportunity") &&
  record.externalId !== undefined
    ? { kind: record.kind, externalId: record.externalId }
    : undefined;

/**
 * A record resting on a Knowledge Source, in the vocabulary the removal guard
 * refuses in, plus the label a reader needs to act on it. The two travel
 * together because they are computed together; only the projection carries the
 * title, since `BlockingRecord` is strict.
 */
type SourceReference = {
  readonly blocking: BlockingRecord;
  readonly title: string;
};

/**
 * What a strategic record is recognised by, for the kinds that can rest on a
 * Source. A relationship Fact is the one with no title of its own: its type is
 * what a reader recognises it by, where its value is the claim itself.
 */
const strategicRecordTitle = (record: StrategicRecord): string =>
  "title" in record
    ? record.title
    : record.kind === "relationship_fact"
      ? record.factType
      : record.kind === "person" || record.kind === "organization"
        ? record.name
        : record.kind;

/**
 * What still points at a Project, a Document or a Knowledge Source inside its
 * Space. Same rule as every other removal: refuse rather than orphan, and read
 * the filtered lists, so a reference held by an already-removed record is not
 * a reason to keep this one.
 */
const tableRecordDependents = (
  view: ApplicationWave2ReadView,
  record: {
    readonly id: string;
    readonly workspaceId: WorkspaceId;
    readonly spaceId: SpaceId;
  },
  recordKind: "project" | "document" | "knowledgeSource",
): readonly BlockingRecord[] => {
  const { workspaceId, spaceId, id } = record;
  const strategic = view.listStrategicRecords(workspaceId, spaceId);
  if (recordKind === "project")
    return [
      ...view
        .listRelations(workspaceId, spaceId)
        .filter(
          (relation) =>
            relation.relationType === "task_contributes_to_project" &&
            relation.projectId === id &&
            relation.state === "active",
        )
        .map((relation) => ({
          recordId: relation.id,
          recordKind: "relation" as const,
        })),
      ...strategic
        .filter(
          (candidate) =>
            (candidate.kind === "work_link" &&
              candidate.state === "active" &&
              (candidate.sourceRecordId === id ||
                candidate.targetRecordId === id)) ||
            (candidate.kind === "opportunity" &&
              candidate.projectIds.some((projectId) => projectId === id)) ||
            (candidate.kind === "recurrence" &&
              candidate.contextRecordId === id),
        )
        .map((candidate) => ({
          recordId: candidate.id,
          recordKind: "strategicRecord" as const,
          recordType: candidate.kind,
        })),
    ];
  if (recordKind === "document")
    return [
      ...strategic
        .filter(
          (candidate) =>
            candidate.kind === "offer" &&
            candidate.deliverableDocumentId === id,
        )
        .map((candidate) => ({
          recordId: candidate.id,
          recordKind: "strategicRecord" as const,
          recordType: candidate.kind,
        })),
      ...view
        .listDocuments(workspaceId, spaceId)
        .filter((candidate) =>
          candidate.evidence?.noteDocumentIds.some(
            (documentId) => documentId === id,
          ),
        )
        .map((candidate) => ({
          recordId: candidate.id,
          recordKind: "document" as const,
        })),
      // A named version is the frozen record of what was delivered. Voiding it
      // is the deliberate act; until then the document it froze stays.
      ...view
        .listNamedDocumentVersions(workspaceId, spaceId)
        .filter(
          (version) => version.documentId === id && version.state === "active",
        )
        .map((version) => ({
          recordId: version.id,
          recordKind: "namedDocumentVersion" as const,
        })),
    ];
  return (
    knowledgeSourceReferences(view, workspaceId, spaceId).get(id) ?? []
  ).map((reference) => reference.blocking);
};

/**
 * What rests on each Knowledge Source in a Space, built in one pass.
 *
 * The guard above and `knowledge.list`'s `referencedBy` are the same question
 * asked in two directions, so they read one enumeration. Two copies would let
 * a Source report that nothing references it and then refuse to be removed —
 * the reader would have no way to find what it missed — and the reach this
 * project has already lost once (Projects, when `evidenceSourceIds` moved off
 * strategic records) is exactly the kind a second copy drops.
 *
 * Four reaches, each on its own removal axis, read through the filtered lists
 * so a reference held by an already-removed record does not count. A frozen
 * named version is deliberately absent: it carries its own title and version
 * because it is a snapshot of what was delivered, not a live binding, and
 * answering "what rests on this note today" with one would be misleading.
 */
const knowledgeSourceReferences = (
  view: ApplicationWave2ReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
): ReadonlyMap<string, readonly SourceReference[]> => {
  const references = new Map<string, SourceReference[]>();
  // One entry per referring record, not per mention: the guard this feeds
  // counted records, and a Project that happened to list one Source twice must
  // not read as two things blocking its removal.
  const add = (sourceId: string, reference: SourceReference) => {
    const held = references.get(sourceId);
    if (held === undefined) references.set(sourceId, [reference]);
    else if (
      !held.some(
        (existing) =>
          existing.blocking.recordId === reference.blocking.recordId,
      )
    )
      held.push(reference);
  };
  for (const candidate of view.listStrategicRecords(workspaceId, spaceId)) {
    const sourceIds =
      "evidenceSourceIds" in candidate
        ? candidate.evidenceSourceIds
        : candidate.kind === "radar_candidate"
          ? [candidate.sourceId]
          : [];
    for (const sourceId of sourceIds)
      add(sourceId, {
        blocking: {
          recordId: candidate.id,
          recordKind: "strategicRecord",
          recordType: candidate.kind,
        },
        title: strategicRecordTitle(candidate),
      });
  }
  for (const candidate of view.listDocuments(workspaceId, spaceId))
    for (const sourceId of candidate.evidence?.sourceIds ?? [])
      add(sourceId, {
        blocking: { recordId: candidate.id, recordKind: "document" },
        title: candidate.title,
      });
  for (const task of view.listTasksInSpace(workspaceId, spaceId))
    for (const sourceId of task.attachmentSourceIds ?? [])
      add(sourceId, {
        blocking: { recordId: task.id, recordKind: "task" },
        title: task.title,
      });
  // Projects carry evidence too, since 0.1.5. They were missed when the guard
  // was written because `evidenceSourceIds` was a strategic-record field then
  // and a Project is not a strategic record — so a Source a Project rested on
  // could be removed out from under it, which is the one thing it exists to
  // prevent.
  for (const project of view.listProjects(workspaceId, spaceId))
    for (const sourceId of project.evidenceSourceIds ?? [])
      add(sourceId, {
        blocking: { recordId: project.id, recordKind: "project" },
        title: project.title,
      });
  return references;
};

/**
 * The compensation a create records: taking it back removes the record it
 * made. One shape for every strategic kind, because the toggle is one shape.
 */
const strategicCreateUndo = (
  command: Wave2Command,
  record: StrategicRecord,
): UndoDescriptor => ({
  targetCommandId: command.commandId,
  workspaceId: record.workspaceId,
  spaceId: record.spaceId,
  kind: "strategic.undo_create",
  recordId: record.id,
  resultingVersion: record.version,
});

/**
 * The kind each removal is allowed to act on. Naming it keeps a command from
 * removing a record of the wrong kind that happens to share an id space:
 * decision.remove must refuse an Area, not soft-remove it.
 */
const REMOVED_STRATEGIC_KIND = {
  "relationship.organizationRemove": "organization",
  "relationship.personRemove": "person",
  "opportunity.remove": "opportunity",
  "opportunity.offerRemove": "offer",
  "relationship.factRemove": "relationship_fact",
  "decision.remove": "decision",
  "area.remove": "area",
  "initiative.remove": "initiative",
} as const satisfies Readonly<Record<string, StrategicRecord["kind"]>>;

/**
 * The record a removal names. Each kind keeps its own payload field, because
 * the field name is what makes the command readable at the call site; this is
 * the one place that has to know them all.
 */
const removedStrategicRecordId = (
  command: Extract<
    Wave2Command,
    {
      commandName:
        | "relationship.organizationRemove"
        | "relationship.personRemove"
        | "opportunity.remove"
        | "opportunity.offerRemove"
        | "relationship.factRemove"
        | "decision.remove"
        | "area.remove"
        | "initiative.remove";
    }
  >,
): StrategicRecordId => {
  switch (command.commandName) {
    case "relationship.organizationRemove":
      return command.payload.organizationId;
    case "relationship.personRemove":
      return command.payload.personId;
    case "opportunity.remove":
      return command.payload.opportunityId;
    case "opportunity.offerRemove":
      return command.payload.offerId;
    case "relationship.factRemove":
      return command.payload.factId;
    case "decision.remove":
      return command.payload.decisionId;
    case "area.remove":
      return command.payload.areaId;
    case "initiative.remove":
      return command.payload.initiativeId;
  }
};

/**
 * What still points at a strategic record, inside its own Space. Removal and
 * the undo of a create both consult it: a create that other work has since
 * attached itself to is no longer a lone create, and taking it back would
 * orphan that work.
 *
 * Space-scoped like every other relation read here, and it reads the filtered
 * list on purpose — a reference held by an already-removed record is not a
 * reason to keep a record in the graph.
 */
const strategicRecordDependents = (
  view: ApplicationWave2ReadView,
  record: StrategicRecord,
): readonly BlockingRecord[] =>
  view
    .listStrategicRecords(record.workspaceId, record.spaceId)
    .filter(
      (candidate) =>
        candidate.id !== record.id &&
        strategicRecordReferences(candidate).includes(record.id),
    )
    .map((candidate) => ({
      recordId: candidate.id,
      recordKind: "strategicRecord" as const,
      recordType: candidate.kind,
    }));

/**
 * The removal path for the three records that keep their own table. Same
 * shape as removeStrategicRecord, over a different set of tables: read, check
 * the version, refuse if anything points at it, toggle, compensate.
 */
const removeTableRecord = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationWave2Transaction,
  context: ExecutionContext,
  command: Wave2Command,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
  recordKind: "project" | "document" | "knowledgeSource",
  recordId: string,
): CommandOutcome => {
  const record =
    recordKind === "project"
      ? transaction.getProject(ProjectIdSchema.parse(recordId))
      : recordKind === "document"
        ? transaction.getDocument(DocumentIdSchema.parse(recordId))
        : transaction.getKnowledgeSource(
            KnowledgeSourceIdSchema.parse(recordId),
          );
  if (
    record === undefined ||
    record.workspaceId !== command.workspaceId ||
    !recordIsActive(record)
  )
    return precondition(command, occurredAt);
  if (!exactExpected(command, { [record.id]: record.version }))
    return versionConflict(command, occurredAt, {
      [record.id]: record.version,
    });
  const dependents = tableRecordDependents(transaction, record, recordKind);
  if (dependents.length > 0) return blocked(command, occurredAt, dependents);
  const priorRecordState = recordIsActive(record) ? "active" : "removed";
  const removed = {
    ...record,
    recordState: "removed" as const,
    version: record.version + 1,
    updatedAt: occurredAt,
  };
  const stored =
    recordKind === "project"
      ? transaction.updateProject(removed as Project, record.version)
      : recordKind === "document"
        ? transaction.updateDocument(removed as NativeDocument, record.version)
        : transaction.updateKnowledgeSource(
            removed as KnowledgeSource,
            record.version,
          );
  if (!stored)
    return versionConflict(command, occurredAt, {
      [record.id]: record.version,
    });
  return appendJournal(
    dependencies,
    transaction,
    context,
    command,
    idempotency,
    occurredAt,
    {
      type: "record.removed",
      workspaceId: removed.workspaceId,
      spaceId: removed.spaceId,
      aggregateId: removed.id,
      aggregateVersion: removed.version,
      occurredAt,
    },
    { [removed.id]: removed.version },
    ["recordState"],
    {
      diagnosticCode: "record.removed",
      projection: {
        kind: "record.removed",
        recordId: removed.id,
        recordKind,
        version: removed.version,
      },
    },
    {
      targetCommandId: command.commandId,
      workspaceId: removed.workspaceId,
      spaceId: removed.spaceId,
      kind: "record.restore_record_state",
      recordKind,
      recordId: removed.id,
      priorRecordState,
      resultingVersion: removed.version,
    },
    { [removed.id]: recordKind },
  );
};

/**
 * The explicit removal path, shared by every strategic kind: one guard, one
 * recordState transition, one compensation. Per-kind commands differ only in
 * the capability they carry and the id they name.
 */
const removeStrategicRecord = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationWave2Transaction,
  context: ExecutionContext,
  command: Wave2Command,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
  recordId: StrategicRecordId,
  kind: StrategicRecord["kind"],
): CommandOutcome => {
  const record = transaction.getStrategicRecord(recordId);
  if (
    record === undefined ||
    record.kind !== kind ||
    record.workspaceId !== command.workspaceId ||
    strategicRecordState(record) !== "active"
  )
    return precondition(command, occurredAt);
  if (!exactExpected(command, { [record.id]: record.version }))
    return versionConflict(command, occurredAt, {
      [record.id]: record.version,
    });
  // ADR-043 §3, as task.remove: refuse rather than orphan. The caller detaches
  // the referring record first, which keeps every removal a decision someone
  // made rather than a cascade nobody saw.
  const dependents = strategicRecordDependents(transaction, record);
  if (dependents.length > 0) return blocked(command, occurredAt, dependents);
  const priorRecordState = strategicRecordState(record);
  const removed = setStrategicRecordState(record, "removed", occurredAt);
  if (!transaction.updateStrategicRecord(removed, record.version))
    return versionConflict(command, occurredAt, {
      [record.id]: record.version,
    });
  return appendJournal(
    dependencies,
    transaction,
    context,
    command,
    idempotency,
    occurredAt,
    {
      type: "strategic.record_changed",
      workspaceId: removed.workspaceId,
      spaceId: removed.spaceId,
      aggregateId: removed.id,
      aggregateVersion: removed.version,
      occurredAt,
    },
    { [removed.id]: removed.version },
    ["recordState"],
    {
      diagnosticCode: "strategic.record_removed",
      projection: {
        kind: "strategic.record_removed",
        recordId: removed.id,
        recordType: removed.kind,
        version: removed.version,
      },
    },
    {
      targetCommandId: command.commandId,
      workspaceId: removed.workspaceId,
      spaceId: removed.spaceId,
      kind: "strategic.restore_record_state",
      recordId: removed.id,
      priorRecordState,
      resultingVersion: removed.version,
    },
    { [removed.id]: "strategicRecord" },
  );
};

// Every projection carrying a record narrative derives the same two fields
// from it: the text, coalesced so a reader needs no null handling, and the
// gap, stated as a flag so an unwritten narrative stays visible instead of
// reading as an empty one. Spread rather than restated per projection, because
// restating a shape is how projections drift out of step with each other.
const intendedOutcomeFields = (
  intendedOutcome: string | undefined,
): { readonly intendedOutcome: string; readonly needsReview: boolean } => ({
  intendedOutcome: intendedOutcome ?? "",
  needsReview: intendedOutcome === undefined,
});

const responsibilityFields = (
  responsibility: string | undefined,
): { readonly responsibility: string; readonly needsReview: boolean } => ({
  responsibility: responsibility ?? "",
  needsReview: responsibility === undefined,
});

// The strategic record projection is the domain record itself, so the two
// kinds carrying a narrative are the only ones the derivation has to reach.
/**
 * What a set-level read is allowed to hand back.
 *
 * The store's list primitive filters `recordState`, which is the axis seven
 * kinds are removed on. A work link is removed onto its own `state` and a
 * Saved View onto its own `state`, so both walked straight through a query
 * that trusted the store's filter alone — and a caller reading a detached
 * client edge as an attached one is the whole cost of that. The narrow
 * readers (`project.operationalOverview` and friends) already honour `state`
 * per kind; this is the same reading, applied once, where a *set* is built.
 *
 * Removal is still reversible: the compensation for `work.linkRemove` restores
 * the link, and it is reached through the removing command's id
 * (`recovery.preview` → `command.undo`), never by re-reading a tombstone out of
 * a list. Nothing needs a dead record to be visible in order to bring it back.
 */
const liveStrategicRecords = (
  view: ApplicationWave2ReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
): readonly StrategicRecord[] =>
  view
    .listStrategicRecords(workspaceId, spaceId)
    .filter((record) => !strategicRecordIsDeleted(record));

const strategicRecordProjection = (
  record: StrategicRecord,
): Record<string, unknown> => {
  if (record.kind === "area")
    return { ...record, ...responsibilityFields(record.responsibility) };
  if (record.kind === "initiative")
    return { ...record, ...intendedOutcomeFields(record.intendedOutcome) };
  return { ...record };
};

const taskProjection = (kind: string, task: Task): Record<string, unknown> => ({
  kind,
  taskId: task.id,
  statusId: task.statusId,
  completionState: task.completionState,
  ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
  version: task.version,
});

const managedAttachments = (
  view: ApplicationWave2ReadView,
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
  sourceIds: readonly KnowledgeSourceId[],
) => {
  const items = sourceIds.map((sourceId) => {
    const source = view.getKnowledgeSource(sourceId);
    const capture =
      source?.sourceCaptureId === undefined
        ? undefined
        : view.getCapture(source.sourceCaptureId);
    return source?.workspaceId === workspaceId &&
      source.spaceId === spaceId &&
      capture?.workspaceId === workspaceId &&
      capture.spaceId === spaceId &&
      (capture.original.kind === "managed_file" ||
        capture.original.kind === "screenshot")
      ? {
          source,
          projection: {
            sourceId: source.id,
            captureId: capture.id,
            original: capture.original,
            availability:
              source.availability === "available"
                ? ("available" as const)
                : ("unavailable" as const),
          },
        }
      : undefined;
  });
  return items.some((item) => item === undefined)
    ? undefined
    : items.map((item) => item!);
};

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
    return project?.workspaceId === workspaceId && recordIsActive(project)
      ? { targetKind, targetId, label: project.title, spaceId: project.spaceId }
      : undefined;
  }
  const record = view.getStrategicRecord(
    StrategicRecordIdSchema.parse(targetId),
  );
  // A removed record resolves to nothing, exactly as a removed Task does: a
  // link into it must not keep rendering its title after it left the graph.
  if (
    record?.workspaceId !== workspaceId ||
    record.kind !== targetKind ||
    strategicRecordState(record) !== "active" ||
    !["person", "organization", "meeting"].includes(record.kind)
  )
    return undefined;
  const label =
    record.kind === "meeting"
      ? (record.meeting.title ?? "Untitled meeting")
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
              label: record.meeting.title ?? "Untitled meeting",
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
        {
          targetCommandId: command.commandId,
          workspaceId: document.workspaceId,
          spaceId: document.spaceId,
          kind: "record.undo_create",
          recordKind: "document",
          recordId: document.id,
          resultingVersion: document.version,
        },
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
        {
          targetCommandId: command.commandId,
          workspaceId: source.workspaceId,
          spaceId: source.spaceId,
          kind: "record.undo_create",
          recordKind: "knowledgeSource",
          recordId: source.id,
          resultingVersion: source.version,
        },
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
      // A source key is claimed once per Space and kind. Names are not unique,
      // so this is the only thing that can tell a re-run apart from a genuinely
      // new record — and the refusal has to be actionable, which is why it
      // carries the colliding record's id and version rather than a bare
      // precondition: the caller pivots straight to the update command with
      // exactly those `expectedVersions` instead of minting a second id.
      // Checked against the transaction, not a snapshot, so two creates inside
      // one batch collide with each other too.
      if (command.payload.externalId !== undefined) {
        const claimed = transaction.findStrategicRecordByExternalId(
          command.workspaceId,
          command.payload.spaceId,
          "organization",
          command.payload.externalId,
        );
        if (claimed !== undefined)
          return outcome(command, occurredAt, {
            outcome: "conflict",
            diagnosticCode: "record.already_exists",
            currentVersions: { [claimed.id]: claimed.version },
          });
      }
      const record = createOrganization({
        id: StrategicRecordIdSchema.parse(command.payload.organizationId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        name: command.payload.name,
        relationshipState: command.payload.relationshipState,
        ...(command.payload.nextAction === undefined
          ? {}
          : { nextAction: command.payload.nextAction }),
        ...(command.payload.externalId === undefined
          ? {}
          : { externalId: command.payload.externalId }),
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
        ["name", "relationshipState", "nextAction", "externalId"],
        {
          diagnosticCode: "strategic.record_changed",
          projection: {
            kind: "strategic.record_changed",
            recordId: record.id,
            recordType: record.kind,
            version: record.version,
          },
        },
        strategicCreateUndo(command, record),
        { [record.id]: "strategicRecord" },
      );
    }
    case "project.remove":
      return removeTableRecord(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        "project",
        command.payload.projectId,
      );
    case "document.remove":
      return removeTableRecord(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        "document",
        command.payload.documentId,
      );
    case "knowledge.sourceRemove":
      return removeTableRecord(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        "knowledgeSource",
        command.payload.sourceId,
      );
    case "relationship.organizationRemove":
    case "relationship.personRemove":
    case "opportunity.remove":
    case "opportunity.offerRemove":
    case "relationship.factRemove":
    case "decision.remove":
    case "area.remove":
    case "initiative.remove":
      return removeStrategicRecord(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
        removedStrategicRecordId(command),
        REMOVED_STRATEGIC_KIND[command.commandName],
      );
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
        {},
        {},
        strategicCreateUndo(command, record),
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
        {},
        {},
        strategicCreateUndo(command, record),
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
        ...(command.payload.responsibility === undefined
          ? {}
          : { responsibility: command.payload.responsibility }),
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
        {},
        {},
        strategicCreateUndo(command, record),
      );
    }
    case "area.updateResponsibility": {
      const current = transaction.getStrategicRecord(command.payload.areaId);
      if (current?.kind !== "area") return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const record = updateAreaResponsibility(
        current,
        command.payload.responsibility,
        occurredAt,
      );
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
        ["responsibility"],
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: current.workspaceId,
          spaceId: current.spaceId,
          kind: "area.restore_responsibility",
          areaId: current.id,
          ...(current.responsibility === undefined
            ? {}
            : { priorResponsibility: current.responsibility }),
          resultingVersion: record.version,
        },
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
        ...(command.payload.intendedOutcome === undefined
          ? {}
          : { intendedOutcome: command.payload.intendedOutcome }),
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
        {},
        {},
        strategicCreateUndo(command, record),
      );
    }
    case "initiative.updateOutcome": {
      const current = transaction.getStrategicRecord(
        command.payload.initiativeId,
      );
      if (current?.kind !== "initiative")
        return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const record = updateInitiativeOutcome(
        current,
        command.payload.intendedOutcome,
        occurredAt,
      );
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
        ["intendedOutcome"],
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: current.workspaceId,
          spaceId: current.spaceId,
          kind: "initiative.restore_outcome",
          initiativeId: current.id,
          ...(current.intendedOutcome === undefined
            ? {}
            : { priorOutcome: current.intendedOutcome }),
          resultingVersion: record.version,
        },
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
                targetStrategic.kind === "area") ||
              (command.payload.linkType === "project_serves_organization" &&
                targetStrategic.kind === "organization"));
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
          ...(command.payload.layout === undefined
            ? {}
            : { layout: command.payload.layout }),
        };
        changedFields = [
          ...(command.payload.filters === undefined ? [] : ["filters"]),
          ...(command.payload.sort === undefined ? [] : ["sort"]),
          ...(command.payload.groupBy === undefined ? [] : ["groupBy"]),
          ...(command.payload.layout === undefined ? [] : ["layout"]),
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
        const resultingGroupBy =
          update.groupBy === undefined ? record.groupBy : update.groupBy;
        const resultingLayout = update.layout ?? record.layout ?? "list";
        if (resultingLayout === "board" && resultingGroupBy == null) {
          return precondition(command, occurredAt);
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
          ...(record.layout === undefined
            ? {}
            : { priorLayout: record.layout }),
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
      if (
        command.payload.layout === "board" &&
        command.payload.groupBy === undefined
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
        ...(command.payload.layout === undefined
          ? {}
          : { layout: command.payload.layout }),
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
          "name",
          "filters",
          "sort",
          ...(command.payload.groupBy === undefined ? [] : ["groupBy"]),
          ...(command.payload.layout === undefined ? [] : ["layout"]),
          "state",
        ],
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
          ...(record.layout === undefined
            ? {}
            : { priorLayout: record.layout }),
          // A saved view that never existed undoes to "deleted": the same
          // state savedView.delete leaves, which every read side already hides.
          priorState: "deleted",
          resultingVersion: record.version,
        },
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
      // Same source-key claim as `relationship.organizationCreate` above; the
      // reasoning for the shape of this refusal is stated there.
      if (command.payload.externalId !== undefined) {
        const claimed = transaction.findStrategicRecordByExternalId(
          command.workspaceId,
          command.payload.spaceId,
          "person",
          command.payload.externalId,
        );
        if (claimed !== undefined)
          return outcome(command, occurredAt, {
            outcome: "conflict",
            diagnosticCode: "record.already_exists",
            currentVersions: { [claimed.id]: claimed.version },
          });
      }
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
        ...(command.payload.externalId === undefined
          ? {}
          : { externalId: command.payload.externalId }),
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
        ["name", "organizationId", "role", "email", "externalId"],
        {
          diagnosticCode: "strategic.record_changed",
          projection: {
            kind: "strategic.record_changed",
            recordId: record.id,
            recordType: record.kind,
            version: record.version,
          },
        },
        strategicCreateUndo(command, record),
        { [record.id]: "strategicRecord" },
      );
    }
    case "relationship.personUpdate": {
      const current = transaction.getStrategicRecord(command.payload.personId);
      if (current?.kind !== "person") return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      // Moving a person to another organization is still bounded by the same
      // rule their creation was: the organization has to exist, be one, and be
      // in the person's own Space.
      if (
        command.payload.organizationId !== undefined &&
        command.payload.organizationId !== null
      ) {
        const organization = transaction.getStrategicRecord(
          command.payload.organizationId,
        );
        if (
          organization?.kind !== "organization" ||
          organization.workspaceId !== current.workspaceId ||
          organization.spaceId !== current.spaceId
        )
          return precondition(command, occurredAt);
      }
      // Provenance is stamped once. An update may add a source key to a record
      // that predates the field — that is how an existing graph gets stamped —
      // but naming a different one is refused, because a key that can change
      // silently re-points a record at a different source row and provenance
      // that can be rewritten is not provenance. Claiming a key another record
      // in this Space already holds is refused the same way a create is, so the
      // two paths cannot disagree about who owns a key.
      if (command.payload.externalId !== undefined) {
        if (
          current.externalId !== undefined &&
          current.externalId !== command.payload.externalId
        )
          return precondition(command, occurredAt);
        const claimed = transaction.findStrategicRecordByExternalId(
          current.workspaceId,
          current.spaceId,
          "person",
          command.payload.externalId,
        );
        if (claimed !== undefined && claimed.id !== current.id)
          return outcome(command, occurredAt, {
            outcome: "conflict",
            diagnosticCode: "record.already_exists",
            currentVersions: { [claimed.id]: claimed.version },
          });
      }
      const record = updatePersonDetails(
        current,
        {
          ...(command.payload.name === undefined
            ? {}
            : { name: command.payload.name }),
          ...(command.payload.organizationId === undefined
            ? {}
            : { organizationId: command.payload.organizationId }),
          ...(command.payload.role === undefined
            ? {}
            : { role: command.payload.role }),
          ...(command.payload.email === undefined
            ? {}
            : { email: command.payload.email }),
          ...(command.payload.externalId === undefined
            ? {}
            : { externalId: command.payload.externalId }),
        },
        occurredAt,
      );
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
        // The fields this command actually carried, so the audit receipt says
        // what changed rather than what could have.
        Object.keys(command.payload).filter((field) => field !== "personId"),
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: current.workspaceId,
          spaceId: current.spaceId,
          kind: "relationship.restore_person",
          personId: current.id,
          priorName: current.name,
          ...(current.organizationId === undefined
            ? {}
            : { priorOrganizationId: current.organizationId }),
          ...(current.role === undefined ? {} : { priorRole: current.role }),
          ...(current.email === undefined ? {} : { priorEmail: current.email }),
          ...(current.externalId === undefined
            ? {}
            : { priorExternalId: current.externalId }),
          resultingVersion: record.version,
        },
      );
    }
    case "relationship.organizationUpdate": {
      const current = transaction.getStrategicRecord(
        command.payload.organizationId,
      );
      if (current?.kind !== "organization")
        return precondition(command, occurredAt);
      const expected = { [current.id]: current.version };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      // See `relationship.personUpdate` above — set once, never rewritten,
      // never claimed away from another record.
      if (command.payload.externalId !== undefined) {
        if (
          current.externalId !== undefined &&
          current.externalId !== command.payload.externalId
        )
          return precondition(command, occurredAt);
        const claimed = transaction.findStrategicRecordByExternalId(
          current.workspaceId,
          current.spaceId,
          "organization",
          command.payload.externalId,
        );
        if (claimed !== undefined && claimed.id !== current.id)
          return outcome(command, occurredAt, {
            outcome: "conflict",
            diagnosticCode: "record.already_exists",
            currentVersions: { [claimed.id]: claimed.version },
          });
      }
      const record = updateOrganizationDetails(
        current,
        {
          ...(command.payload.name === undefined
            ? {}
            : { name: command.payload.name }),
          ...(command.payload.relationshipState === undefined
            ? {}
            : { relationshipState: command.payload.relationshipState }),
          ...(command.payload.nextAction === undefined
            ? {}
            : { nextAction: command.payload.nextAction }),
          ...(command.payload.externalId === undefined
            ? {}
            : { externalId: command.payload.externalId }),
        },
        occurredAt,
      );
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
        Object.keys(command.payload).filter(
          (field) => field !== "organizationId",
        ),
        {},
        {},
        {
          targetCommandId: command.commandId,
          workspaceId: current.workspaceId,
          spaceId: current.spaceId,
          kind: "relationship.restore_organization",
          organizationId: current.id,
          priorName: current.name,
          priorRelationshipState: current.relationshipState,
          ...(current.nextAction === undefined
            ? {}
            : { priorNextAction: current.nextAction }),
          ...(current.externalId === undefined
            ? {}
            : { priorExternalId: current.externalId }),
          resultingVersion: record.version,
        },
      );
    }
    case "opportunity.create": {
      if (!exactExpected(command, {})) return precondition(command, occurredAt);
      if (transaction.getStrategicRecord(command.payload.opportunityId))
        return precondition(command, occurredAt);
      const organization = transaction.getStrategicRecord(
        command.payload.organizationId,
      );
      const people = [
        ...command.payload.personIds,
        ...(command.payload.ownerPersonId === undefined
          ? []
          : [command.payload.ownerPersonId]),
      ].map((id) => transaction.getStrategicRecord(id));
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
      // The same claim the two relationship creates make, on the same terms:
      // one key per Space and kind, and the refusal names the record holding
      // it so the caller can act instead of minting a second id. There is no
      // opportunity update command, so unlike a Person this key can only be
      // set at import — a deal that arrives unstamped stays unstamped.
      if (command.payload.externalId !== undefined) {
        const claimed = transaction.findStrategicRecordByExternalId(
          command.workspaceId,
          command.payload.spaceId,
          "opportunity",
          command.payload.externalId,
        );
        if (claimed !== undefined)
          return outcome(command, occurredAt, {
            outcome: "conflict",
            diagnosticCode: "record.already_exists",
            currentVersions: { [claimed.id]: claimed.version },
          });
      }
      const record = createOpportunity({
        id: StrategicRecordIdSchema.parse(command.payload.opportunityId),
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        organizationId: organization.id,
        personIds: command.payload.personIds,
        ...(command.payload.ownerPersonId === undefined
          ? {}
          : { ownerPersonId: command.payload.ownerPersonId }),
        need: command.payload.need,
        qualification: command.payload.qualification,
        stage: command.payload.stage,
        nextAction: command.payload.nextAction,
        evidenceSourceIds: command.payload.evidenceSourceIds,
        ...(command.payload.externalId === undefined
          ? {}
          : { externalId: command.payload.externalId }),
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
          "externalId",
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
        strategicCreateUndo(command, record),
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
        strategicCreateUndo(command, record),
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
              relation.relationType === "task_contributes_to_project" &&
              relation.projectId === current.id &&
              relation.state === "active",
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
        createdByKind: context.principalKind,
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
      const projectId = ProjectIdSchema.parse(
        command.payload.projectId ?? dependencies.ids.next("project"),
      );
      const existing = transaction.getProject(projectId);
      if (existing !== undefined) {
        return outcome(command, occurredAt, {
          outcome: "conflict",
          diagnosticCode: "record.already_exists",
          currentVersions: { [existing.id]: existing.version },
        });
      }
      // Provenance is bound at creation, exactly as an Opportunity's is: a
      // Source in another Space is not this Project's evidence.
      const evidence = (command.payload.evidenceSourceIds ?? []).map((id) =>
        transaction.getKnowledgeSource(id),
      );
      if (
        evidence.some(
          (source) =>
            source === undefined ||
            source.workspaceId !== command.workspaceId ||
            source.spaceId !== command.payload.spaceId ||
            !recordIsActive(source),
        )
      )
        return precondition(command, occurredAt);
      // The same claim the strategic creates make, against the Projects table
      // rather than the strategic one: one key per Space, and the refusal names
      // the delivery already holding it. There is no project update command
      // that takes the field, so a Project can only be stamped at import.
      if (command.payload.externalId !== undefined) {
        const claimed = transaction.findProjectByExternalId(
          command.workspaceId,
          command.payload.spaceId,
          command.payload.externalId,
        );
        if (claimed !== undefined)
          return outcome(command, occurredAt, {
            outcome: "conflict",
            diagnosticCode: "record.already_exists",
            currentVersions: { [claimed.id]: claimed.version },
          });
      }
      const project = createProject({
        id: projectId,
        workspaceId: command.workspaceId,
        spaceId: command.payload.spaceId,
        title: command.payload.title,
        ...(command.payload.intendedOutcome === undefined
          ? {}
          : { intendedOutcome: command.payload.intendedOutcome }),
        ...(command.payload.evidenceSourceIds === undefined
          ? {}
          : { evidenceSourceIds: command.payload.evidenceSourceIds }),
        ...(command.payload.externalId === undefined
          ? {}
          : { externalId: command.payload.externalId }),
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
        ["title", "intendedOutcome", "lifecycle", "evidenceSourceIds"],
        {
          diagnosticCode: "project.created",
          projection: {
            kind: "project.created",
            projectId: project.id,
            title: project.title,
            ...intendedOutcomeFields(project.intendedOutcome),
            ...(project.dueAt === undefined ? {} : { dueAt: project.dueAt }),
            lifecycle: project.lifecycle,
            version: project.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          kind: "record.undo_create",
          recordKind: "project",
          recordId: project.id,
          resultingVersion: project.version,
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
      const updatedEvidence = (command.payload.evidenceSourceIds ?? []).map(
        (id) => transaction.getKnowledgeSource(id),
      );
      if (
        updatedEvidence.some(
          (source) =>
            source === undefined ||
            source.workspaceId !== project.workspaceId ||
            source.spaceId !== project.spaceId ||
            !recordIsActive(source),
        )
      )
        return precondition(command, occurredAt);
      const updated = updateProjectOutcome(
        project,
        command.payload.intendedOutcome,
        occurredAt,
        command.payload.evidenceSourceIds,
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
        command.payload.evidenceSourceIds === undefined
          ? ["intendedOutcome"]
          : ["intendedOutcome", "evidenceSourceIds"],
        {
          diagnosticCode: "project.outcome_updated",
          projection: {
            kind: "project.outcome_updated",
            projectId: updated.id,
            title: updated.title,
            ...intendedOutcomeFields(updated.intendedOutcome),
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
          ...(project.intendedOutcome === undefined
            ? {}
            : { priorOutcome: project.intendedOutcome }),
          ...(project.evidenceSourceIds === undefined
            ? {}
            : { priorEvidenceSourceIds: project.evidenceSourceIds }),
          resultingVersion: updated.version,
        },
      );
    }
    case "project.updateDetails": {
      const project = transaction.getProject(command.payload.projectId);
      if (project === undefined) return precondition(command, occurredAt);
      if (!exactExpected(command, { [project.id]: project.version })) {
        return versionConflict(command, occurredAt, {
          [project.id]: project.version,
        });
      }
      const updated = updateProjectDetails(
        project,
        {
          ...(command.payload.title === undefined
            ? {}
            : { title: command.payload.title }),
          ...(command.payload.dueAt === undefined
            ? {}
            : { dueAt: command.payload.dueAt }),
        },
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
          type: "project.details_updated",
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          aggregateId: project.id,
          aggregateVersion: updated.version,
          occurredAt,
        },
        { [updated.id]: updated.version },
        [
          ...(command.payload.title === undefined ? [] : ["title"]),
          ...(command.payload.dueAt === undefined ? [] : ["dueAt"]),
        ],
        {
          diagnosticCode: "project.details_updated",
          projection: {
            kind: "project.details_updated",
            projectId: updated.id,
            title: updated.title,
            ...intendedOutcomeFields(updated.intendedOutcome),
            lifecycle: updated.lifecycle,
            // NIGDY nie przez `intendedOutcomeFields` i nigdy jako `null`:
            // tamta funkcja skleja brak do "" i przestawia `needsReview`,
            // a `null` w polu ISO ze `.strict()` wywala odczyt.
            ...(updated.dueAt === undefined ? {} : { dueAt: updated.dueAt }),
            version: updated.version,
          },
        },
        {
          targetCommandId: command.commandId,
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          kind: "project.restore_details",
          projectId: project.id,
          priorTitle: project.title,
          ...(project.dueAt === undefined ? {} : { priorDueAt: project.dueAt }),
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
        createdByKind: context.principalKind,
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
        {
          targetCommandId: command.commandId,
          workspaceId: task.workspaceId,
          spaceId: task.spaceId,
          kind: "task.undo_create",
          taskId: task.id,
          resultingVersion: task.version,
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
      // that was itself removed does not block. Refuse rather than orphan,
      // and name the blocker the same way every other removal does, instead
      // of merging it into command.precondition_failed. Tasks have no
      // recordType — that field exists because strategicRecord covers
      // fifteen types.
      const activeChildren = transaction
        .listTasksInSpace(task.workspaceId, task.spaceId)
        .filter((candidate) => candidate.parentTaskId === task.id)
        .map((candidate) => ({
          recordId: candidate.id,
          recordKind: "task" as const,
        }));
      if (activeChildren.length > 0)
        return blocked(command, occurredAt, activeChildren);
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
      const attachmentSourceIds =
        command.payload.attachmentSourceIds === undefined
          ? undefined
          : [...new Set(command.payload.attachmentSourceIds)];
      const attachments =
        attachmentSourceIds === undefined
          ? undefined
          : managedAttachments(
              transaction,
              task.workspaceId,
              task.spaceId,
              attachmentSourceIds,
            );
      if (attachmentSourceIds !== undefined && attachments === undefined)
        return precondition(command, occurredAt);
      const expected = {
        [task.id]: task.version,
        ...Object.fromEntries(
          (attachments ?? []).map(({ source }) => [source.id, source.version]),
        ),
      };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
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
        ...(attachmentSourceIds === undefined ? {} : { attachmentSourceIds }),
      };
      if (!isTaskTimingValid(taskTimingAfterUpdate(task, detailsUpdate))) {
        return precondition(command, occurredAt);
      }
      const updated = updateTaskDetails(task, detailsUpdate, occurredAt, {
        kind: "acting",
        principalId: context.principalId,
        principalKind: context.principalKind,
      });
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
        ...(command.payload.attachmentSourceIds === undefined
          ? []
          : ["attachmentSourceIds"]),
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
          ...(task.plannedBy === undefined
            ? {}
            : { priorPlannedBy: task.plannedBy }),
          ...(task.dueAt === undefined ? {} : { priorDueAt: task.dueAt }),
          ...(task.priority === undefined
            ? {}
            : { priorPriority: task.priority }),
          ...(task.attachmentSourceIds === undefined
            ? {}
            : { priorAttachmentSourceIds: task.attachmentSourceIds }),
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
            createdByKind: context.principalKind,
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
              relation.relationType === "task_contributes_to_project" &&
              relation.projectId === project.id &&
              relation.state === "active",
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
          createdByKind: context.principalKind,
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
      const computedType = command.payload.type;
      if (computedType.kind === "formula") {
        if (command.payload.targetKind !== "task")
          return precondition(command, occurredAt);
        const operands = computedType.fieldIds.map((fieldId) =>
          definitions.find((definition) => definition.id === fieldId),
        );
        if (
          new Set(computedType.fieldIds).size !==
            computedType.fieldIds.length ||
          operands.some(
            (definition) =>
              definition === undefined ||
              definition.targetKind !== command.payload.targetKind ||
              fieldDefinitionState(definition) !== "active" ||
              definition.type.kind !== "number",
          )
        )
          return precondition(command, occurredAt);
      }
      if (computedType.kind === "rollup") {
        if (command.payload.targetKind !== "task")
          return precondition(command, occurredAt);
        if (computedType.operation === "sum") {
          const source = definitions.find(
            (definition) => definition.id === computedType.fieldId,
          );
          if (
            source === undefined ||
            source.targetKind !== "task" ||
            fieldDefinitionState(source) !== "active" ||
            source.type.kind !== "number"
          )
            return precondition(command, occurredAt);
        }
      }
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
      // `safeParse` for the reason given on the authorization arm; the miss
      // falls into the `record === undefined` precondition just below.
      const record = ((): Task | Project | undefined => {
        if (targetKind === "task") {
          const id = TaskIdSchema.safeParse(command.payload.recordId);
          return id.success ? transaction.getTask(id.data) : undefined;
        }
        const id = ProjectIdSchema.safeParse(command.payload.recordId);
        return id.success ? transaction.getProject(id.data) : undefined;
      })();
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
      const attachmentSourceIds = [
        ...new Set(command.payload.attachmentSourceIds ?? []),
      ];
      const attachments =
        record === undefined
          ? undefined
          : managedAttachments(
              transaction,
              command.workspaceId,
              record.spaceId,
              attachmentSourceIds,
            );
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
        ) ||
        attachments === undefined
      )
        return precondition(command, occurredAt);
      const expected = {
        [record.id]: record.version,
        ...(parent === undefined ? {} : { [parent.id]: parent.version }),
        ...Object.fromEntries(
          attachments.map(({ source }) => [source.id, source.version]),
        ),
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
        attachmentSourceIds,
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
        ["body", "mentionPrincipalIds", "attachmentSourceIds", "threadState"],
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
      const attachmentSourceIds = [
        ...new Set(
          command.payload.attachmentSourceIds ??
            comment?.attachmentSourceIds ??
            [],
        ),
      ];
      const attachments =
        comment === undefined
          ? undefined
          : managedAttachments(
              transaction,
              command.workspaceId,
              comment.spaceId,
              attachmentSourceIds,
            );
      if (
        comment === undefined ||
        comment.authorPrincipalId !== context.principalId ||
        attachments === undefined ||
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
      const expected = {
        [comment.id]: comment.version,
        ...Object.fromEntries(
          (command.payload.attachmentSourceIds === undefined
            ? []
            : attachments
          ).map(({ source }) => [source.id, source.version]),
        ),
      };
      if (!exactExpected(command, expected))
        return versionConflict(command, occurredAt, expected);
      const updated = editComment(
        comment,
        command.payload.body,
        mentions,
        context.principalId,
        occurredAt,
        attachmentSourceIds,
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
        ["body", "mentionPrincipalIds", "attachmentSourceIds", "revisions"],
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
      const project =
        command.payload.relationType === "task_contributes_to_project"
          ? transaction.getProject(command.payload.projectId)
          : undefined;
      const opportunity =
        command.payload.relationType === "task_contributes_to_opportunity"
          ? transaction.getStrategicRecord(command.payload.opportunityId)
          : undefined;
      const target =
        command.payload.relationType === "task_contributes_to_project"
          ? project
          : opportunity?.kind === "opportunity"
            ? opportunity
            : undefined;
      // ADR-043 §5 — a removed Task takes no new relation, and neither does a
      // removed record at the other end.
      if (
        task === undefined ||
        target === undefined ||
        task.recordState !== "active" ||
        (opportunity !== undefined &&
          strategicRecordState(opportunity) !== "active")
      )
        return precondition(command, occurredAt);
      if (
        !exactExpected(command, {
          [task.id]: task.version,
          [target.id]: target.version,
        })
      ) {
        return versionConflict(command, occurredAt, {
          [task.id]: task.version,
          [target.id]: target.version,
        });
      }
      const existing = transaction.findTaskProjectRelation(task.id, target.id);
      if (existing !== undefined) {
        return outcome(command, occurredAt, {
          outcome: "conflict",
          diagnosticCode: "relation.already_exists",
          currentVersions: { [existing.id]: existing.version },
        });
      }
      const relation =
        project === undefined
          ? relateTaskToOpportunity({
              id: RelationIdSchema.parse(dependencies.ids.next("relation")),
              task,
              opportunity: {
                id: StrategicRecordIdSchema.parse(target.id),
                workspaceId: target.workspaceId,
                spaceId: target.spaceId,
              },
              createdBy: context.principalId,
              occurredAt,
            })
          : relateTaskToProject({
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
          ...relationFarEnd(relation),
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
            ...relationFarEnd(relation),
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
          ...relationFarEnd(relation),
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
            ...relationFarEnd(relation),
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
    case "agent.checkpointRevert":
      return revertCheckpoint(
        dependencies,
        transaction,
        context,
        command,
        idempotency,
        occurredAt,
      );
  }
};

/**
 * One captured command, judged the way the revert will judge it. A checkpoint
 * preview used to answer from `consumedByCommandId` alone while the revert
 * asked this module — so a record another command had moved on previewed as
 * revertable and refused seconds later, spending a checkpoint the caller could
 * not get back. Both surfaces now come through here.
 */
export interface CheckpointCommandRecovery {
  readonly targetCommandId: string;
  readonly descriptor?: UndoDescriptor;
  readonly available: boolean;
  readonly reason?:
    "unsupported" | "already_undone" | "later_change" | "still_referenced";
}

/**
 * The records a compensation would touch, named once. `descriptorState`
 * reports them only when the compensation is available, and both the
 * checkpoint preview and the revert need them while it is not — so this is the
 * one place that knows which field of a descriptor kind holds a record id.
 */
export /**
 * The record at the other end of a Task's contribution, named by the field the
 * relation type calls for. One helper, so an event and its projection cannot
 * disagree about which end the relation had.
 */
const relationFarEnd = (
  relation: TaskWorkRelation,
): { projectId: ProjectId } | { opportunityId: StrategicRecordId } =>
  relation.relationType === "task_contributes_to_project"
    ? { projectId: relation.projectId }
    : { opportunityId: relation.opportunityId };

export const descriptorRecordIds = (
  descriptor: UndoDescriptor,
): readonly string[] => {
  switch (descriptor.kind) {
    case "project.restore_outcome":
    case "project.restore_details":
      return [descriptor.projectId];
    case "area.restore_responsibility":
      return [descriptor.areaId];
    case "initiative.restore_outcome":
      return [descriptor.initiativeId];
    case "taskStatus.restore_definition":
      return [descriptor.statusId];
    case "fieldDef.restore_definition":
      return [descriptor.fieldId];
    case "template.restore_definition":
      return [descriptor.templateId];
    case "automation.restore_definition":
      return [descriptor.ruleId];
    case "project.unapply_template":
      return [descriptor.projectId, ...descriptor.createdTaskIds];
    case "meeting.unpromote_work_item":
      return [descriptor.meetingId, descriptor.createdTaskId];
    case "meeting.restore_work_item":
    case "meeting.restore_routing":
      return [descriptor.meetingId];
    case "meeting.restore_participant_links":
      return [descriptor.meetingId, ...descriptor.createdPersonIds];
    case "record.restore_field_value":
      return [descriptor.recordId];
    case "workspace.restore_default_status":
      return [descriptor.workspaceId];
    case "task.restore_calendar_block":
    case "task.restore_record_state":
    case "task.undo_create":
    case "task.restore_state":
    case "task.restore_details":
    case "task.restore_parent":
    case "task.restore_operational_state":
      return [descriptor.taskId];
    case "strategic.undo_create":
    case "strategic.restore_record_state":
    case "record.undo_create":
    case "record.restore_record_state":
      return [descriptor.recordId];
    case "savedView.restore_definition":
      return [descriptor.savedViewId];
    case "work_link.restore_state":
      return [descriptor.linkId];
    case "relation.remove":
    case "relation.restore":
      return [descriptor.relationId];
    case "capture.undo_route":
      return [descriptor.captureId, descriptor.taskId];
    case "capture.undo_knowledge_route":
      return [descriptor.captureId, descriptor.sourceId];
    case "knowledge.restore_source":
      return [descriptor.sourceId];
    case "knowledge.restore_evidence":
      return [descriptor.documentId];
    case "knowledge.void_named_version":
      return [descriptor.namedVersionId];
    case "relationship.restore_person":
      return [descriptor.personId];
    case "relationship.restore_organization":
      return [descriptor.organizationId];
  }
};

/**
 * ADR-069. Where a compensation this revert has already applied left a record.
 * A descriptor judged afterwards is measured against that version instead of
 * the one its own command produced — which is the whole difference between a
 * later change this checkpoint carries and one made by anything else.
 */
type RevertAllowance = ReadonlyMap<string, number>;

/**
 * What this revert has already done to the graph, as the next descriptor will
 * find it: where each record now stands, and which records it has taken back
 * altogether. Both are derived by the kernel from compensations it has itself
 * judged or applied — a caller contributes nothing to either.
 */
interface RevertContext {
  readonly versions: RevertAllowance;
  readonly removed: ReadonlySet<string>;
}

/**
 * Whether taking this command back leaves its record gone. That is what lets a
 * revert compensate a create whose only dependent is another create the same
 * revert removes first — the shape every real migration writes, since records
 * arrive with the relations that point at them.
 *
 * The edges belong here as much as the records do, and leaving them out is what
 * made this predicate disagree with its own paragraph above. A Project's
 * dependents are counted as *relations* and *work links* — `tableRecordDependents`
 * names them by their own id — so a revert that takes back a Project along with
 * the relations pointing at it has to know those relations are going, or it
 * refuses to compensate the create it just made way for. Both are single-record
 * compensations, which is what lets them join: `descriptorRecordIds` answers one
 * id for each, and marking that id removed says nothing about a second record
 * that survives.
 *
 * That is also why the multi-record kinds stay out. `capture.undo_route`,
 * `capture.undo_knowledge_route`, `project.unapply_template` and
 * `meeting.restore_participant_links` each name two or more records of which only
 * some go away — a Capture that is un-routed survives, the Task it made does not
 * — so admitting them wholesale would report a live record as removed and let a
 * revert orphan real work. They need per-id handling before they can join, and
 * nothing today asks them to.
 */
const compensationRemovesRecord = (descriptor: UndoDescriptor): boolean =>
  descriptor.kind === "task.undo_create" ||
  descriptor.kind === "strategic.undo_create" ||
  descriptor.kind === "record.undo_create" ||
  // The compensation `record.relate` records: it removes the relation outright,
  // exactly as a create's undo removes its record.
  descriptor.kind === "relation.remove" ||
  ((descriptor.kind === "strategic.restore_record_state" ||
    descriptor.kind === "record.restore_record_state" ||
    descriptor.kind === "task.restore_record_state") &&
    descriptor.priorRecordState === "removed") ||
  // What `work.linkCreate` records, gated on the prior state for the same reason
  // the three restores above are: a restore only removes the record when that is
  // where it is putting it back.
  (descriptor.kind === "work_link.restore_state" &&
    descriptor.priorState === "removed");

/**
 * Only a compensation over a single record can take an allowance. A kind that
 * carries a resulting version per record would need us to decide which of them
 * the allowance belongs to, and a guess is not a guard: those refuse exactly as
 * before.
 */
const withAllowance = (
  descriptor: UndoDescriptor,
  allowance: RevertAllowance,
): UndoDescriptor => {
  if (allowance.size === 0 || !("resultingVersion" in descriptor))
    return descriptor;
  const recordIds = descriptorRecordIds(descriptor);
  if (recordIds.length !== 1) return descriptor;
  const allowed = allowance.get(recordIds[0] as string);
  return allowed === undefined
    ? descriptor
    : { ...descriptor, resultingVersion: allowed };
};

export const checkpointCommandRecovery = (
  view: ApplicationWave2ReadView,
  commandIds: readonly string[],
): readonly CheckpointCommandRecovery[] => {
  // Newest first, because that is the order the revert compensates in: a
  // command only makes way for the ones applied before it.
  const allowance = new Map<string, number>();
  const removed = new Set<string>();
  const judged = [...commandIds].reverse().map((targetCommandId) => {
    const descriptor = view.getUndoDescriptor(targetCommandId);
    // No descriptor means the command applied and its kind records no
    // compensation — permanent, and fatal for the whole checkpoint.
    if (descriptor === undefined)
      return {
        targetCommandId,
        available: false,
        reason: "unsupported" as const,
      };
    const state = descriptorState(view, withAllowance(descriptor, allowance), {
      versions: allowance,
      removed,
    });
    if (state.available && compensationRemovesRecord(descriptor))
      for (const recordId of descriptorRecordIds(descriptor))
        removed.add(recordId);
    // Where this compensation leaves the record, as the next descriptor will
    // find it. Nothing is predicted: judging read-only, the record does not
    // move, so the version the next check will see is the one it has now — and
    // when the revert really runs, it is the version the compensation just
    // wrote. Same rule, both paths, and no assumption about how much a
    // compensation bumps a version.
    if (state.available)
      for (const [recordId, version] of Object.entries(state.versions))
        allowance.set(recordId, version);
    return {
      targetCommandId,
      descriptor,
      available: state.available,
      ...(state.reason === undefined ? {} : { reason: state.reason }),
    };
  });
  // Handed back in the checkpoint's own order: the caller reads it beside
  // `commandIds`, not beside the order compensation happens to run in.
  return judged.reverse();
};

const descriptorState = (
  view: ApplicationWave2ReadView,
  descriptor: UndoDescriptor,
  // ADR-069. Set only while a checkpoint revert is being judged: the records
  // its earlier compensations will already have taken back. A create is
  // blocked by what still points at it, and inside a revert the thing pointing
  // at it may be another create this same revert removes first.
  revert?: RevertContext,
): {
  available: boolean;
  recordIds: string[];
  versions: Record<string, number>;
  reason?: "already_undone" | "later_change" | "still_referenced";
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
    case "project.restore_details":
    case "project.restore_outcome": {
      // Ta gałąź jest tym, co chroni rzutowanie `as Project` w zastosowaniu
      // kompensacji niżej: bez sprawdzenia wersji cofnięcie sięgałoby po rekord,
      // który mógł się zmienić albo zniknąć.
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
    case "area.restore_responsibility": {
      const area = view.getStrategicRecord(descriptor.areaId);
      return area?.kind === "area" &&
        area.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [area.id],
            versions: { [area.id]: area.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "initiative.restore_outcome": {
      const initiative = view.getStrategicRecord(descriptor.initiativeId);
      return initiative?.kind === "initiative" &&
        initiative.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [initiative.id],
            versions: { [initiative.id]: initiative.version },
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
    case "task.undo_create": {
      // Taking a create back removes the Task, so version equality is not
      // enough: a child does not bump its parent's version, and removing a
      // parent that has one would orphan it (ADR-043 §3, as task.remove).
      // The version mismatch wins over a reference: it is the older truth and
      // the one the caller cannot act on, since detaching every child would
      // still leave the undo unavailable. Edited independently from the
      // strategic.undo_create and record.undo_create cases above, which
      // resolve the same precedence the same way.
      const task = view.getTask(descriptor.taskId);
      if (
        task === undefined ||
        task.recordState !== "active" ||
        task.completionState !== "open" ||
        task.version !== descriptor.resultingVersion
      )
        return {
          available: false,
          recordIds: [],
          versions: {},
          reason: "later_change",
        };
      const children = view
        .listTasksInSpace(task.workspaceId, task.spaceId)
        .filter(
          (candidate) =>
            candidate.parentTaskId === task.id &&
            revert?.removed.has(candidate.id) !== true,
        );
      return children.length === 0
        ? {
            available: true,
            recordIds: [task.id],
            versions: { [task.id]: task.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "still_referenced",
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
    case "relationship.restore_person": {
      const person = view.getStrategicRecord(descriptor.personId);
      if (
        person?.kind !== "person" ||
        strategicRecordState(person) !== "active" ||
        person.version !== descriptor.resultingVersion
      )
        return {
          available: false,
          recordIds: [],
          versions: {},
          reason: "later_change",
        };
      // The compensation writes an organization id back, so that organization
      // has to still be there: restoring a person onto a record that has since
      // been removed would leave a reference pointing at nothing, which is the
      // state every removal guard in this module exists to prevent.
      if (descriptor.priorOrganizationId !== undefined) {
        const organization = view.getStrategicRecord(
          descriptor.priorOrganizationId,
        );
        if (
          organization?.kind !== "organization" ||
          strategicRecordState(organization) !== "active"
        )
          return {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
      }
      return {
        available: true,
        recordIds: [person.id],
        versions: { [person.id]: person.version },
      };
    }
    case "relationship.restore_organization": {
      const organization = view.getStrategicRecord(descriptor.organizationId);
      return organization?.kind === "organization" &&
        strategicRecordState(organization) === "active" &&
        organization.version === descriptor.resultingVersion
        ? {
            available: true,
            recordIds: [organization.id],
            versions: { [organization.id]: organization.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "later_change",
          };
    }
    case "strategic.undo_create": {
      // Taking a create back removes the record, so version equality is not
      // enough: a person, opportunity or link attached afterwards does not
      // bump the record's version, and removing it would orphan them.
      // The version mismatch wins over a reference: it is the older truth and
      // the one the caller cannot act on, since detaching every dependent
      // would still leave the version gap the undo cannot cross. Edited
      // independently from the record.undo_create case below, which resolves
      // the same precedence the same way.
      const record = view.getStrategicRecord(descriptor.recordId);
      if (
        record === undefined ||
        strategicRecordState(record) !== "active" ||
        record.version !== descriptor.resultingVersion
      )
        return {
          available: false,
          recordIds: [],
          versions: {},
          reason: "later_change",
        };
      const dependents = strategicRecordDependents(view, record).filter(
        (dependent) => revert?.removed.has(dependent.recordId) !== true,
      );
      return dependents.length === 0
        ? {
            available: true,
            recordIds: [record.id],
            versions: { [record.id]: record.version },
          }
        : {
            available: false,
            recordIds: [],
            versions: {},
            reason: "still_referenced",
          };
    }
    case "record.undo_create":
    case "record.restore_record_state": {
      const record =
        descriptor.recordKind === "project"
          ? view.getProject(ProjectIdSchema.parse(descriptor.recordId))
          : descriptor.recordKind === "document"
            ? view.getDocument(DocumentIdSchema.parse(descriptor.recordId))
            : view.getKnowledgeSource(
                KnowledgeSourceIdSchema.parse(descriptor.recordId),
              );
      // Undoing a create removes the record, so it has to re-run the guard the
      // explicit removal runs; restoring one only has to find it unchanged.
      //
      // The version mismatch wins over a reference: it is the older truth and
      // the one the caller cannot act on, since detaching every dependent
      // would still leave the version gap the undo cannot cross. Edited
      // independently from the strategic.undo_create case above, which
      // resolves the same precedence the same way.
      if (
        record === undefined ||
        record.version !== descriptor.resultingVersion
      )
        return {
          available: false,
          recordIds: [],
          versions: {},
          reason: "later_change",
        };
      // Putting a Project back is infeasible when a re-import claimed its
      // source key while it was gone, for the reason the strategic restore
      // gives above: two live records under one key, and a set-once rule that
      // then refuses to repair either. Only restoring can hit it — undoing a
      // create removes the record and frees the key rather than taking one.
      if (
        descriptor.kind === "record.restore_record_state" &&
        descriptor.priorRecordState === "active" &&
        descriptor.recordKind === "project" &&
        "externalId" in record &&
        record.externalId !== undefined
      ) {
        const claimed = view.findProjectByExternalId(
          record.workspaceId,
          record.spaceId,
          record.externalId,
        );
        if (claimed !== undefined && claimed.id !== record.id)
          return {
            available: false,
            recordIds: [],
            versions: {},
            reason: "still_referenced",
          };
      }
      const orphans =
        descriptor.kind === "record.undo_create" &&
        tableRecordDependents(view, record, descriptor.recordKind).filter(
          (dependent) => revert?.removed.has(dependent.recordId) !== true,
        ).length > 0;
      return orphans
        ? {
            available: false,
            recordIds: [],
            versions: {},
            reason: "still_referenced",
          }
        : {
            available: true,
            recordIds: [record.id],
            versions: { [record.id]: record.version },
          };
    }
    case "strategic.restore_record_state": {
      const record = view.getStrategicRecord(descriptor.recordId);
      if (record?.version !== descriptor.resultingVersion)
        return {
          available: false,
          recordIds: [],
          versions: {},
          reason: "later_change",
        };
      // The preview has to agree with the revert, which is the lesson of #15:
      // a preview that reports feasible and then refuses spends a checkpoint to
      // tell you what it already knew. Restoring a removed record that carries
      // a source key is infeasible when a re-import has claimed it in the
      // meantime — see the matching guard in `compensateDescriptor`.
      // `still_referenced` is the closest member of a vocabulary that is
      // deliberately small: another record in the caller's own Space stands in
      // the way, and clearing it makes this available again, which is exactly
      // what that reason tells a caller to do.
      const previewKey = claimedSourceKey(record);
      if (
        descriptor.priorRecordState === "active" &&
        previewKey !== undefined
      ) {
        const claimed = view.findStrategicRecordByExternalId(
          record.workspaceId,
          record.spaceId,
          previewKey.kind,
          previewKey.externalId,
        );
        if (claimed !== undefined && claimed.id !== record.id)
          return {
            available: false,
            recordIds: [],
            versions: {},
            reason: "still_referenced",
          };
      }
      return {
        available: true,
        recordIds: [record.id],
        versions: { [record.id]: record.version },
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
    // Both entry points already require an audit receipt in the caller's
    // workspace, so an unknown or foreign command id is rejected as
    // command.precondition_failed before it reaches here: "unsupported" means
    // the target applied and its kind records no compensation, nothing else.
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

/**
 * What a compensation touched, by record kind — the same vocabulary the
 * journal carries, named once because two callers now build it.
 */
type CompensatedRecordKinds = Record<
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

/**
 * ADR-069. The compensation itself, named apart from the command that asks for
 * it. A single `command.undo` and a checkpoint revert apply exactly these
 * writes; a revert that carried its own copy would drift from the undo it is
 * made of. The refusals kept here are the defensive ones — a record that
 * vanished between the availability check and the write — and they say only
 * that nothing was compensated, leaving each caller to name its own refusal.
 */
const compensateDescriptor = (
  transaction: ApplicationWave2Transaction,
  context: ExecutionContext,
  descriptor: UndoDescriptor,
  occurredAt: string,
):
  | {
      readonly ok: true;
      readonly versions: Record<string, number>;
      readonly kinds: CompensatedRecordKinds;
    }
  | { readonly ok: false } => {
  let compensatedVersions: Record<string, number>;
  let compensatedKinds: CompensatedRecordKinds;
  if (descriptor.kind === "project.restore_details") {
    const project = transaction.getProject(descriptor.projectId) as Project;
    const restored = updateProjectDetails(
      project,
      {
        title: descriptor.priorTitle,
        // `?? null`, nie `?? undefined`: brak terminu w deskryptorze znaczy
        // „przedtem go nie było", a `undefined` w tej funkcji znaczy „zostaw
        // w spokoju". Bez tej zamiany cofnięcie komendy, która termin DODAŁA,
        // zostawiałoby datę na miejscu — czyli cofałoby połowę.
        dueAt: descriptor.priorDueAt ?? null,
      },
      occurredAt,
    );
    transaction.updateProject(restored, project.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "project" };
  } else if (descriptor.kind === "project.restore_outcome") {
    const project = transaction.getProject(descriptor.projectId) as Project;
    const restored = updateProjectOutcome(
      project,
      descriptor.priorOutcome,
      occurredAt,
      // An empty list rather than absent: absent would leave whatever evidence
      // the update wrote, which is a half-restored record.
      descriptor.priorEvidenceSourceIds ?? [],
    );
    transaction.updateProject(restored, project.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "project" };
  } else if (descriptor.kind === "area.restore_responsibility") {
    const area = transaction.getStrategicRecord(descriptor.areaId) as Extract<
      StrategicRecord,
      { kind: "area" }
    >;
    const restored = updateAreaResponsibility(
      area,
      descriptor.priorResponsibility,
      occurredAt,
    );
    transaction.updateStrategicRecord(restored, area.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
  } else if (descriptor.kind === "initiative.restore_outcome") {
    const initiative = transaction.getStrategicRecord(
      descriptor.initiativeId,
    ) as Extract<StrategicRecord, { kind: "initiative" }>;
    const restored = updateInitiativeOutcome(
      initiative,
      descriptor.priorOutcome,
      occurredAt,
    );
    transaction.updateStrategicRecord(restored, initiative.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
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
      return { ok: false };
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
  } else if (descriptor.kind === "task.undo_create") {
    const task = transaction.getTask(descriptor.taskId) as Task;
    const removed: Task = {
      ...task,
      recordState: "removed",
      version: task.version + 1,
      updatedAt: occurredAt,
    };
    transaction.updateTask(removed, task.version);
    compensatedVersions = { [removed.id]: removed.version };
    compensatedKinds = { [removed.id]: "task" };
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
        attachmentSourceIds: descriptor.priorAttachmentSourceIds ?? [],
      },
      occurredAt,
      // Cofnięcie przywraca podpis sprzed zmiany, nie podpisuje cofającego.
      {
        kind: "restore",
        ...(descriptor.priorPlannedBy === undefined
          ? {}
          : { plannedBy: descriptor.priorPlannedBy }),
      },
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
  } else if (
    descriptor.kind === "strategic.undo_create" ||
    descriptor.kind === "strategic.restore_record_state"
  ) {
    const record = transaction.getStrategicRecord(
      descriptor.recordId,
    ) as StrategicRecord;
    const priorRecordState =
      descriptor.kind === "strategic.undo_create"
        ? ("removed" as const)
        : descriptor.priorRecordState;
    // Removal frees a source key, which is deliberate — a source row whose
    // record was removed has to be importable again. The consequence is that
    // bringing the record back can no longer be assumed safe: if a re-import
    // claimed the key in between, restoring would leave two active records of
    // one kind in one Space carrying the same key, and the set-once rule then
    // refuses to re-point either, so the only way out would be deleting one.
    // Refusing here is the whole point of a compensation that can say no.
    const restoredKey = claimedSourceKey(record);
    if (priorRecordState === "active" && restoredKey !== undefined) {
      const claimed = transaction.findStrategicRecordByExternalId(
        record.workspaceId,
        record.spaceId,
        restoredKey.kind,
        restoredKey.externalId,
      );
      if (claimed !== undefined && claimed.id !== record.id) {
        return { ok: false };
      }
    }
    const restored = setStrategicRecordState(
      record,
      priorRecordState,
      occurredAt,
    );
    transaction.updateStrategicRecord(restored, record.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
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
        layout: descriptor.priorLayout ?? null,
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
      return { ok: false };
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
    // Act on the relation as this revert has left it, not as the relate found
    // it. Declaring `descriptor.resultingVersion` here was the one arm that
    // named a version from its own command's past instead of reading the
    // record's current one: a relation an earlier compensation in the same
    // revert had restored no longer stood there, the update silently did
    // nothing, and the revert still reported the relation compensated and spent
    // the checkpoint. The reverse-order cascade made that arm reachable, so it
    // now fails closed like every other one.
    const relation = transaction.getRelation(descriptor.relationId);
    if (relation === undefined) return { ok: false };
    const removed = removeTaskProjectRelation(
      relation as TaskProjectRelation,
      occurredAt,
    );
    if (!transaction.updateRelation(removed, relation.version))
      return { ok: false };
    compensatedVersions = { [descriptor.relationId]: removed.version };
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
      return { ok: false };
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
      return { ok: false };
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
  } else if (
    descriptor.kind === "record.undo_create" ||
    descriptor.kind === "record.restore_record_state"
  ) {
    const recordState =
      descriptor.kind === "record.undo_create"
        ? "removed"
        : descriptor.priorRecordState;
    if (descriptor.recordKind === "project") {
      const project = transaction.getProject(
        ProjectIdSchema.parse(descriptor.recordId),
      )!;
      // The matching refusal to the preview above: a re-import may have taken
      // the source key while this Project was removed, and putting it back
      // would leave two live deliveries holding one key.
      if (recordState === "active" && project.externalId !== undefined) {
        const claimed = transaction.findProjectByExternalId(
          project.workspaceId,
          project.spaceId,
          project.externalId,
        );
        if (claimed !== undefined && claimed.id !== project.id)
          return { ok: false };
      }
      const restored: Project = {
        ...project,
        recordState,
        version: project.version + 1,
        updatedAt: occurredAt,
      };
      transaction.updateProject(restored, project.version);
      compensatedVersions = { [restored.id]: restored.version };
      compensatedKinds = { [restored.id]: "project" };
    } else if (descriptor.recordKind === "document") {
      const document = transaction.getDocument(
        DocumentIdSchema.parse(descriptor.recordId),
      )!;
      const restored: NativeDocument = {
        ...document,
        recordState,
        version: document.version + 1,
        updatedAt: occurredAt,
      };
      transaction.updateDocument(restored, document.version);
      compensatedVersions = { [restored.id]: restored.version };
      compensatedKinds = { [restored.id]: "document" };
    } else {
      const source = transaction.getKnowledgeSource(
        KnowledgeSourceIdSchema.parse(descriptor.recordId),
      )!;
      const restored: KnowledgeSource = {
        ...source,
        recordState,
        version: source.version + 1,
        updatedAt: occurredAt,
      };
      transaction.updateKnowledgeSource(restored, source.version);
      compensatedVersions = { [restored.id]: restored.version };
      compensatedKinds = { [restored.id]: "knowledgeSource" };
    }
  } else if (descriptor.kind === "relationship.restore_person") {
    const person = transaction.getStrategicRecord(
      descriptor.personId,
    ) as Extract<StrategicRecord, { kind: "person" }>;
    const restored = updatePersonDetails(
      person,
      {
        name: descriptor.priorName,
        organizationId: descriptor.priorOrganizationId ?? null,
        role: descriptor.priorRole ?? null,
        email: descriptor.priorEmail ?? null,
        // Explicit null when the descriptor carries none: the record was
        // unstamped before this update, and an undo that left the key behind
        // would report success while changing nothing a caller can see.
        externalId: descriptor.priorExternalId ?? null,
      },
      occurredAt,
    );
    transaction.updateStrategicRecord(restored, person.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
  } else if (descriptor.kind === "relationship.restore_organization") {
    const organization = transaction.getStrategicRecord(
      descriptor.organizationId,
    ) as Extract<StrategicRecord, { kind: "organization" }>;
    const restored = updateOrganizationDetails(
      organization,
      {
        name: descriptor.priorName,
        relationshipState: descriptor.priorRelationshipState,
        nextAction: descriptor.priorNextAction ?? null,
        externalId: descriptor.priorExternalId ?? null,
      },
      occurredAt,
    );
    transaction.updateStrategicRecord(restored, organization.version);
    compensatedVersions = { [restored.id]: restored.version };
    compensatedKinds = { [restored.id]: "strategicRecord" };
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
  return { ok: true, versions: compensatedVersions, kinds: compensatedKinds };
};

/**
 * ADR-069. One revert, one transaction, one receipt.
 *
 * Compensation runs newest first, and each one that applies tells the next
 * where it left the record. That allowance is the only thing this adds to the
 * guard every single undo already runs: a record may stand where its own
 * command left it, or where this revert's own earlier compensation put it.
 * Work from outside the checkpoint contributes no allowance and still refuses
 * the whole revert, which is what the guard was always for.
 *
 * Nothing is applied until every captured command has been judged, so a
 * refusal leaves the checkpoint exactly as it was rather than half spent —
 * the state a recovery mechanism must never be able to produce.
 */
const revertCheckpoint = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationTransaction,
  context: ExecutionContext,
  command: Extract<Wave2Command, { commandName: "agent.checkpointRevert" }>,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
): CommandOutcome => {
  if (!isApplicationWave2Transaction(transaction))
    return precondition(command, occurredAt);
  if (!exactExpected(command, {})) return precondition(command, occurredAt);
  const checkpoint = transaction.getAgentCheckpoint(
    command.payload.checkpointId,
  );
  // `runId` names the run doing the reverting, not the run that opened the
  // checkpoint: a slice written yesterday is still a slice a later run may take
  // back. Same precondition as agent.checkpointCreate — a grant can own several
  // runs, so the payload has to name the one the caller is executing.
  if (
    checkpoint === undefined ||
    checkpoint.workspaceId !== command.workspaceId ||
    command.payload.runId !== context.hostRun?.agentRunId
  )
    return precondition(command, occurredAt);
  if (checkpoint.status === "reverted")
    return outcome(command, occurredAt, {
      outcome: "rejected",
      diagnosticCode: "agent.checkpoint_already_reverted",
    });
  // Refused before the checkpoint is spent: it captured nothing, so reverting
  // it would report success, change nothing, and leave the caller without the
  // checkpoint they still need.
  if (checkpoint.commandIds.length === 0)
    return outcome(command, occurredAt, {
      outcome: "rejected",
      diagnosticCode: "agent.checkpoint_revert_empty",
    });
  const judged = checkpointCommandRecovery(transaction, checkpoint.commandIds);
  const blocked = judged.flatMap((item) =>
    item.available
      ? []
      : [
          {
            targetCommandId: item.targetCommandId,
            unavailableReason: item.reason ?? "later_change",
          },
        ],
  );
  if (blocked.length > 0)
    return outcome(command, occurredAt, {
      // "unsupported" is fatal for the command kind, so it outranks the
      // reasons a person can still act on: never advertise a retry that
      // provably cannot succeed.
      outcome: blocked.some((item) => item.unavailableReason === "unsupported")
        ? "rejected"
        : "conflict",
      diagnosticCode: "agent.checkpoint_revert_blocked",
      checkpointId: checkpoint.id,
      blocked,
    });
  const allowance = new Map<string, number>();
  const compensatedVersions: Record<string, number> = {};
  const compensatedKinds: Record<string, string> = {};
  for (const targetCommandId of [...checkpoint.commandIds].reverse()) {
    const descriptor = transaction.getUndoDescriptor(targetCommandId);
    const state =
      descriptor === undefined
        ? undefined
        : descriptorState(transaction, withAllowance(descriptor, allowance));
    // The judgement above ran against this same transaction, so disagreeing
    // here means the predicted and the real compensation differ. Nothing may
    // be left half applied on that: the sentinel rolls the whole revert back
    // and the caller is told to retry rather than handed a partial slice.
    if (descriptor === undefined || state?.available !== true)
      throw new RetryableUnitOfWorkError("storage.unit_of_work_failed");
    const compensation = compensateDescriptor(
      transaction,
      context,
      descriptor,
      occurredAt,
    );
    if (!compensation.ok)
      throw new RetryableUnitOfWorkError("storage.unit_of_work_failed");
    transaction.updateUndoDescriptor({
      ...descriptor,
      consumedByCommandId: command.commandId,
    });
    for (const [recordId, version] of Object.entries(compensation.versions)) {
      allowance.set(recordId, version);
      compensatedVersions[recordId] = version;
      compensatedKinds[recordId] = compensation.kinds[recordId] as string;
    }
  }
  transaction.updateAgentCheckpoint({
    ...checkpoint,
    status: "reverted",
    updatedAt: occurredAt,
    revertedAt: occurredAt,
  });
  return appendJournal(
    dependencies,
    transaction,
    context,
    command,
    idempotency,
    occurredAt,
    {
      type: "agent.checkpoint_reverted",
      workspaceId: checkpoint.workspaceId,
      // A checkpoint has no Space of its own; the work it took back does, and
      // every captured command is inside the grant's Space scope.
      spaceId: (judged[0]?.descriptor as UndoDescriptor).spaceId,
      aggregateId: checkpoint.id,
      // Checkpoints are not versioned records: they are opened once and
      // reverted at most once, which is the whole lifecycle.
      aggregateVersion: 1,
      occurredAt,
    },
    compensatedVersions,
    ["status", "revertedAt"],
    {
      diagnosticCode: "agent.checkpoint_reverted",
      projection: {
        kind: "agent.checkpoint_reverted",
        checkpointId: checkpoint.id,
        compensatedCommandIds: [...checkpoint.commandIds],
        recordVersions: compensatedVersions,
      },
    },
    undefined,
    compensatedKinds as CompensatedRecordKinds,
  );
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
  const compensation = compensateDescriptor(
    transaction,
    context,
    descriptor,
    occurredAt,
  );
  if (!compensation.ok)
    return outcome(command, occurredAt, {
      outcome: "conflict",
      diagnosticCode: "undo.not_available",
      currentVersions: state.versions,
    });
  const compensatedVersions = compensation.versions;
  const compensatedKinds = compensation.kinds;
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
      return { title: record.title, detail: record.responsibility ?? "" };
    case "initiative":
      return { title: record.title, detail: record.intendedOutcome ?? "" };
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
    const records = liveStrategicRecords(view, query.workspaceId, space.id);
    const spaceTasks = view.listTasksInSpace(query.workspaceId, space.id);
    const fieldDefinitions = view.listFieldDefinitions(query.workspaceId);
    const subtasksByParent = new Map<
      string,
      Array<(typeof spaceTasks)[number]>
    >();
    for (const candidate of spaceTasks) {
      if (
        candidate.parentTaskId === undefined ||
        candidate.recordState !== "active"
      )
        continue;
      const siblings = subtasksByParent.get(candidate.parentTaskId);
      if (siblings === undefined)
        subtasksByParent.set(candidate.parentTaskId, [candidate]);
      else siblings.push(candidate);
    }
    const stateOrder = { waiting: 0, blocked: 1, actionable: 2 } as const;
    // Task→Project is a relation, not a field, so the memberships are gathered
    // once here rather than per task: the same call and the same filter
    // `project.list` makes for `relatedOpenTaskCount`. A task may hold several
    // — `record.relate` guards pair-uniqueness only — and all of them are
    // projected, because grouping by project lists such a task under each.
    const projectIdsByTask = new Map<TaskId, ProjectId[]>();
    for (const relation of view.listRelations(query.workspaceId, space.id)) {
      if (
        relation.relationType !== "task_contributes_to_project" ||
        relation.state !== "active"
      )
        continue;
      const existing = projectIdsByTask.get(relation.taskId);
      if (existing === undefined)
        projectIdsByTask.set(relation.taskId, [relation.projectId]);
      else existing.push(relation.projectId);
    }
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
          ...(() => {
            const assignment = view.getActiveTaskAssignment(task.id);
            return assignment === undefined
              ? {}
              : {
                  assignment: projectedTaskAssignment(
                    view,
                    query.workspaceId,
                    space.id,
                    assignment,
                  ),
                };
          })(),
          operationalState: task.operationalState,
          ...(task.waitingOn === undefined
            ? {}
            : { waitingOn: task.waitingOn }),
          completionState: task.completionState,
          ...(task.startAt === undefined ? {} : { startAt: task.startAt }),
          ...(task.plannedBy === undefined
            ? {}
            : { plannedBy: task.plannedBy }),
          ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
          ...(task.priority === undefined ? {} : { priority: task.priority }),
          ...(task.parentTaskId === undefined
            ? {}
            : { parentTaskId: task.parentTaskId }),
          ...(task.calendarBlock === undefined
            ? {}
            : { calendarBlock: task.calendarBlock }),
          projectIds: projectIdsByTask.get(task.id) ?? [],
          ...(() => {
            const fields = taskFieldsWithComputedValues(
              task.fields,
              fieldDefinitions,
              subtasksByParent.get(task.id) ?? [],
            );
            return fields === undefined ? {} : { fields };
          })(),
          version: task.version,
          updatedAt: task.updatedAt,
        })),
      projects: view
        .listProjects(query.workspaceId, space.id)
        .map((project) => ({
          id: project.id,
          title: project.title,
          ...intendedOutcomeFields(project.intendedOutcome),
          ...(project.dueAt === undefined ? {} : { dueAt: project.dueAt }),
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
          ...responsibilityFields(area.responsibility),
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
          ...intendedOutcomeFields(initiative.intendedOutcome),
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
            ...(savedView.layout === undefined
              ? {}
              : { layout: savedView.layout }),
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
    const threads = comments.map((comment) => {
      const attachments = managedAttachments(
        view,
        query.workspaceId,
        comment.spaceId,
        comment.attachmentSourceIds ?? [],
      );
      if (attachments === undefined) return undefined;
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
          ...(visibleAuthor ? { principalId: comment.authorPrincipalId } : {}),
          displayName: visibleAuthor
            ? (author.displayName ?? "Workspace member")
            : "Former member",
        },
        mentionPrincipalIds: comment.mentionPrincipalIds.filter((principalId) =>
          eligibleMention(
            view,
            query.workspaceId,
            comment.spaceId,
            principalId,
          ),
        ),
        attachments: attachments.map(({ projection }) => projection),
        threadState: root?.threadState ?? "open",
        version: comment.version,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        edited: comment.revisions.length > 0,
      };
    });
    if (threads.some((thread) => thread === undefined))
      return queryRejected(query, kernelTime, "query.consistency_unavailable");
    return querySuccess(query, kernelTime, freshness, {
      kind: "comment.list",
      target: query.parameters.target,
      threads,
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
        : query.queryName === "organization.operationalOverview"
          ? [query.parameters.spaceId]
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
      records: liveStrategicRecords(
        view,
        query.workspaceId,
        query.parameters.spaceId,
      ).map(strategicRecordProjection),
      freshness,
    });
  }
  if (
    query.queryName === "person.list" ||
    query.queryName === "organization.list"
  ) {
    const kind = query.queryName === "person.list" ? "person" : "organization";
    // Filtered before `querySuccess`, and that ordering is the whole point.
    // The strict parse inside `querySuccess` is the only place a stored record
    // can fault a read — the store casts payloads and never revalidates them —
    // so narrowing to one kind first means a kind this build cannot project can
    // no longer take the read of people down with it, the way one unreadable
    // work link took down every record in the Space on 0.1.5. Mapped through
    // the same `strategicRecordProjection` the wide read uses, so the two
    // answers to the same question cannot drift apart.
    return querySuccess(query, kernelTime, freshness, {
      kind: query.queryName,
      items: view
        .listStrategicRecords(query.workspaceId, query.parameters.spaceId)
        .filter((record) => record.kind === kind)
        .map(strategicRecordProjection),
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
          ...intendedOutcomeFields(project.intendedOutcome),
          ...(project.dueAt === undefined ? {} : { dueAt: project.dueAt }),
          // The set-level read of deliveries, so it carries the key a re-run
          // recognises what it already imported by — the same reason
          // `person.list` and `organization.list` carry theirs.
          ...(project.externalId === undefined
            ? {}
            : { externalId: project.externalId }),
          lifecycle: project.lifecycle,
          relatedOpenTaskCount: relations.filter(
            (relation) =>
              relation.relationType === "task_contributes_to_project" &&
              relation.projectId === project.id &&
              relation.state === "active" &&
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
    // Once for the Space, not once per Source: this is the only field on this
    // query whose cost grows with how much the Space holds.
    const references = knowledgeSourceReferences(
      view,
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
        .map((source) => {
          const held = references.get(source.id) ?? [];
          return {
            id: source.id,
            sourceKind: source.sourceKind,
            title: source.title,
            ...(source.canonicalUrl === undefined
              ? {}
              : { canonicalUrl: source.canonicalUrl }),
            availability: source.availability,
            observedAt: source.observedAt,
            // Capped at the same 20 the refusal samples, and paired with the
            // real size for the same reason: nothing in the domain bounds how
            // many records rest on one Source, and a silently truncated list
            // reads as the whole answer.
            referencedBy: held
              .slice(0, DEPENDENT_SAMPLE_LIMIT)
              .map((reference) => ({
                ...reference.blocking,
                title: reference.title,
              })),
            referencedByCount: held.length,
            version: source.version,
            updatedAt: source.updatedAt,
          };
        }),
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
        .filter(
          (relation) =>
            relation.relationType === "task_contributes_to_project" &&
            relation.projectId === project.id &&
            relation.state === "active",
        )
        .map((relation) => relation.taskId),
    );
    const strategicRecords = view.listStrategicRecords(
      query.workspaceId,
      project.spaceId,
    );
    const relatedMeetings = strategicRecords.filter(
      (
        record,
      ): record is Extract<StrategicRecord, { readonly kind: "meeting" }> =>
        record.kind === "meeting" && record.meeting.projectId === project.id,
    );
    const relatedDecisions = strategicRecords.filter(
      (
        record,
      ): record is Extract<StrategicRecord, { readonly kind: "decision" }> =>
        record.kind === "decision" &&
        record.linkedRecordIds.includes(project.id),
    );
    const clientOrganizationIds = new Set(
      strategicRecords.flatMap((record): readonly string[] => {
        if (
          record.kind === "opportunity" &&
          record.projectIds.includes(project.id)
        )
          return [record.organizationId];
        if (
          record.kind === "meeting" &&
          record.meeting.projectId === project.id &&
          record.meeting.organizationId !== undefined
        )
          return [record.meeting.organizationId];
        // The delivery a Project runs at a named client, as its own edge. Until
        // 0.1.5 a client could be reached only through a deal or a meeting, so
        // a Project linked straight to an Organization answered `[]` here while
        // the organization side already listed that same Project under
        // `activeProjects` — the edge surfaced one way only. `state` is the
        // per-kind removal axis for a work link (`recordState` is the
        // record-lifecycle one), so it is what decides whether the link counts.
        if (
          record.kind === "work_link" &&
          record.state === "active" &&
          record.linkType === "project_serves_organization" &&
          record.sourceRecordId === project.id
        )
          return [record.targetRecordId];
        return [];
      }),
    );
    const documentIds = new Set(
      view
        .listDocumentEntityLinks(query.workspaceId, "project", project.id)
        .filter((link) => link.spaceId === project.spaceId)
        .map((link) => link.documentId),
    );
    return querySuccess(query, kernelTime, freshness, {
      kind: "project.operationalOverview",
      project: {
        id: project.id,
        spaceId: project.spaceId,
        title: project.title,
        ...intendedOutcomeFields(project.intendedOutcome),
        ...(project.dueAt === undefined ? {} : { dueAt: project.dueAt }),
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
        })
        .slice(0, 100),
      relatedMeetings: relatedMeetings.slice(0, 100).map((record) => ({
        id: record.id,
        title: record.meeting.title ?? "Untitled meeting",
        startedAt: record.meeting.startedAt,
        triage: record.meeting.triage,
        version: record.version,
        updatedAt: record.updatedAt,
      })),
      relatedDocuments: view
        .listDocuments(query.workspaceId, project.spaceId)
        .filter((document) => documentIds.has(document.id))
        .slice(0, 100)
        .map((document) => ({
          id: document.id,
          title: document.title,
          role: document.role ?? "document",
          version: document.version,
          updatedAt: document.updatedAt,
        })),
      relatedDecisions: relatedDecisions.slice(0, 100).map((record) => ({
        id: record.id,
        title: record.title,
        state: record.state,
        version: record.version,
        updatedAt: record.updatedAt,
      })),
      clientOrganizations: strategicRecords
        .filter(
          (
            record,
          ): record is Extract<
            StrategicRecord,
            { readonly kind: "organization" }
          > =>
            record.kind === "organization" &&
            clientOrganizationIds.has(record.id),
        )
        .slice(0, 100)
        .map((record) => ({
          id: record.id,
          name: record.name,
          relationshipState: record.relationshipState,
          version: record.version,
          updatedAt: record.updatedAt,
        })),
      // Resolved from the Project's own Space rather than from the id list
      // alone, so a Source that has been removed, or that never belonged to
      // this Space, is absent rather than projected as a dead id.
      evidenceSources: view
        .listKnowledgeSources(query.workspaceId, project.spaceId)
        .filter((source) =>
          project.evidenceSourceIds?.some((sourceId) => sourceId === source.id),
        )
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
    });
  }
  if (query.queryName === "organization.operationalOverview") {
    const strategicRecords = view.listStrategicRecords(
      query.workspaceId,
      query.parameters.spaceId,
    );
    const organization = strategicRecords.find(
      (
        record,
      ): record is Extract<
        StrategicRecord,
        { readonly kind: "organization" }
      > =>
        record.kind === "organization" &&
        record.id === query.parameters.organizationId,
    );
    if (organization === undefined) {
      return queryRejected(query, kernelTime, "authorization.denied");
    }
    const people = strategicRecords
      .filter(
        (
          record,
        ): record is Extract<StrategicRecord, { readonly kind: "person" }> =>
          record.kind === "person" && record.organizationId === organization.id,
      )
      .sort((left, right) => left.name.localeCompare(right.name));
    const opportunities = strategicRecords
      .filter(
        (
          record,
        ): record is Extract<
          StrategicRecord,
          { readonly kind: "opportunity" }
        > =>
          record.kind === "opportunity" &&
          record.organizationId === organization.id &&
          record.state !== "rejected" &&
          record.state !== "lost",
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.title.localeCompare(right.title),
      );
    const opportunityIds = new Set(
      opportunities.map((opportunity) => opportunity.id),
    );
    const offers = strategicRecords
      .filter(
        (
          record,
        ): record is Extract<StrategicRecord, { readonly kind: "offer" }> =>
          record.kind === "offer" && opportunityIds.has(record.opportunityId),
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.title.localeCompare(right.title),
      );
    const renewals = strategicRecords
      .filter(
        (
          record,
        ): record is Extract<StrategicRecord, { readonly kind: "renewal" }> =>
          record.kind === "renewal" &&
          record.organizationId === organization.id &&
          record.state !== "irrelevant",
      )
      .sort(
        (left, right) =>
          left.expiresAt.localeCompare(right.expiresAt) ||
          left.title.localeCompare(right.title),
      );
    const facts = strategicRecords
      .filter(
        (
          record,
        ): record is Extract<
          StrategicRecord,
          { readonly kind: "relationship_fact" }
        > =>
          record.kind === "relationship_fact" &&
          record.organizationId === organization.id,
      )
      .sort(
        (left, right) =>
          left.state.localeCompare(right.state) ||
          left.factType.localeCompare(right.factType),
      );
    const meetings = strategicRecords
      .filter(
        (
          record,
        ): record is Extract<StrategicRecord, { readonly kind: "meeting" }> =>
          record.kind === "meeting" &&
          record.meeting.organizationId === organization.id,
      )
      .sort((left, right) =>
        right.meeting.startedAt.localeCompare(left.meeting.startedAt),
      );
    // Two reaches, unioned, exactly as the project.organization condition path
    // unions them (ADR-071): the delivery linked straight at this client, and
    // the projects its live opportunities name. Composing only the second is
    // what made a PoV invisible on the client it was running at.
    const projectIds = new Set([
      ...opportunities.flatMap((opportunity) => opportunity.projectIds),
      ...strategicRecords.flatMap((record) =>
        record.kind === "work_link" &&
        record.state === "active" &&
        record.linkType === "project_serves_organization" &&
        record.targetRecordId === organization.id
          ? [ProjectIdSchema.parse(record.sourceRecordId)]
          : [],
      ),
    ]);
    const activeProjects = view
      .listProjects(query.workspaceId, organization.spaceId)
      .filter(
        (project) =>
          project.lifecycle === "active" && projectIds.has(project.id),
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.title.localeCompare(right.title),
      );
    const activeProjectIds = new Set(
      activeProjects.map((project) => project.id),
    );
    const projectIdsByTask = new Map<string, Set<ProjectId>>();
    for (const relation of view.listRelations(
      query.workspaceId,
      organization.spaceId,
    )) {
      if (
        relation.state !== "active" ||
        relation.relationType !== "task_contributes_to_project" ||
        !activeProjectIds.has(relation.projectId)
      )
        continue;
      const ids = projectIdsByTask.get(relation.taskId) ?? new Set<ProjectId>();
      ids.add(relation.projectId);
      projectIdsByTask.set(relation.taskId, ids);
    }
    const openTasks = view
      .listTasksInSpace(query.workspaceId, organization.spaceId)
      .filter(
        (task) =>
          task.recordState !== "removed" &&
          task.completionState === "open" &&
          projectIdsByTask.has(task.id),
      )
      .sort(
        (left, right) =>
          (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999") ||
          left.title.localeCompare(right.title),
      );
    const documentIds = new Set(
      view
        .listDocumentEntityLinks(
          query.workspaceId,
          "organization",
          organization.id,
        )
        .filter((link) => link.spaceId === organization.spaceId)
        .map((link) => link.documentId),
    );
    const documents = view
      .listDocuments(query.workspaceId, organization.spaceId)
      .filter((document) => documentIds.has(document.id))
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.title.localeCompare(right.title),
      );
    const relatedRecordIds = new Set<string>([
      organization.id,
      ...people.map((record) => record.id),
      ...opportunities.map((record) => record.id),
      ...offers.map((record) => record.id),
      ...renewals.map((record) => record.id),
      ...facts.map((record) => record.id),
      ...meetings.map((record) => record.id),
      ...activeProjects.map((record) => record.id),
      ...openTasks.map((record) => record.id),
      ...documents.map((record) => record.id),
    ]);
    return querySuccess(query, kernelTime, freshness, {
      kind: "organization.operationalOverview",
      organization: {
        id: organization.id,
        spaceId: organization.spaceId,
        name: organization.name,
        relationshipState: organization.relationshipState,
        ...(organization.nextAction === undefined
          ? {}
          : { nextAction: organization.nextAction }),
        version: organization.version,
        updatedAt: organization.updatedAt,
      },
      people: people.slice(0, 100).map((record) => ({
        id: record.id,
        name: record.name,
        ...(record.role === undefined ? {} : { role: record.role }),
        ...(record.email === undefined ? {} : { email: record.email }),
        version: record.version,
        updatedAt: record.updatedAt,
      })),
      opportunities: opportunities.slice(0, 100).map((record) => {
        // Resolved against every Person in the Space, not against this
        // organization's own `people`: a deal can be owned by a colleague who
        // is not a contact at the client, and looking the owner up in the
        // client's contact list would silently drop exactly those.
        const owner =
          record.ownerPersonId === undefined
            ? undefined
            : strategicRecords.find(
                (candidate) =>
                  candidate.kind === "person" &&
                  candidate.id === record.ownerPersonId,
              );
        return {
          id: record.id,
          title: record.title,
          need: record.need,
          stage: record.stage,
          nextAction: record.nextAction,
          ...(owner === undefined || owner.kind !== "person"
            ? {}
            : { owner: { id: owner.id, name: owner.name } }),
          state: record.state,
          version: record.version,
          updatedAt: record.updatedAt,
        };
      }),
      offers: offers.slice(0, 100).map((record) => ({
        id: record.id,
        title: record.title,
        opportunityId: record.opportunityId,
        deliverableDocumentId: record.deliverableDocumentId,
        ownerPrincipalId: record.ownerPrincipalId,
        state: record.state,
        nextAction: record.nextAction,
        version: record.version,
        updatedAt: record.updatedAt,
      })),
      renewals: renewals.slice(0, 100).map((record) => ({
        id: record.id,
        title: record.title,
        scope: record.scope,
        expiresAt: record.expiresAt,
        leadTimeDays: record.leadTimeDays,
        followUpTaskId: record.followUpTaskId,
        state: record.state,
        version: record.version,
        updatedAt: record.updatedAt,
      })),
      facts: facts.slice(0, 100).map((record) => ({
        id: record.id,
        factType: record.factType,
        value: record.value,
        verifiedAt: record.verifiedAt,
        staleAfter: record.staleAfter,
        state: record.state,
        version: record.version,
        updatedAt: record.updatedAt,
      })),
      activeProjects: activeProjects.slice(0, 100).map((project) => ({
        id: project.id,
        title: project.title,
        ...intendedOutcomeFields(project.intendedOutcome),
        ...(project.dueAt === undefined ? {} : { dueAt: project.dueAt }),
        version: project.version,
        updatedAt: project.updatedAt,
      })),
      openTasks: openTasks.slice(0, 100).map((task) => ({
        id: task.id,
        title: task.title,
        projectIds: [...(projectIdsByTask.get(task.id) ?? [])].sort(),
        operationalState: task.operationalState,
        ...(task.dueAt === undefined ? {} : { dueAt: task.dueAt }),
        ...(task.priority === undefined ? {} : { priority: task.priority }),
        version: task.version,
        updatedAt: task.updatedAt,
      })),
      meetings: meetings.slice(0, 100).map((record) => ({
        id: record.id,
        title: record.meeting.title ?? "Untitled meeting",
        startedAt: record.meeting.startedAt,
        triage: record.meeting.triage,
        version: record.version,
        updatedAt: record.updatedAt,
      })),
      documents: documents.slice(0, 100).map((document) => ({
        id: document.id,
        title: document.title,
        role: document.role ?? "document",
        version: document.version,
        updatedAt: document.updatedAt,
      })),
      recentActivity: view
        .listEvents(query.workspaceId, organization.spaceId)
        .filter((event) => relatedRecordIds.has(event.aggregateId))
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, 20)
        .map((event) => ({
          eventId: event.id,
          eventType: event.type,
          recordId: event.aggregateId,
          occurredAt: event.occurredAt,
        })),
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
    const kinds = new Set(query.parameters.kinds ?? globalSearchRecordKindIds);
    const items: Array<{
      recordKind: GlobalSearchRecordKind;
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
        const projectBodyMatches = new Map(
          view
            .searchProjectBodies(
              query.workspaceId,
              spaceId,
              query.parameters.text,
              query.parameters.limit ?? 50,
            )
            .map((match) => [match.projectId, match.snippet] as const),
        );
        for (const project of view.listProjects(query.workspaceId, spaceId)) {
          const title = normalizeSearch(project.title);
          const projectOutcome = normalizeSearch(project.intendedOutcome ?? "");
          const bodySnippet = projectBodyMatches.get(project.id);
          const matchedFields: Array<"title" | "intendedOutcome" | "body"> = [];
          if (title.includes(needle)) matchedFields.push("title");
          if (projectOutcome.includes(needle))
            matchedFields.push("intendedOutcome");
          if (bodySnippet !== undefined) matchedFields.push("body");
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
                : matchedFields.includes("intendedOutcome")
                  ? (project.intendedOutcome ?? "")
                  : (bodySnippet ?? project.title),
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
        if (!isGlobalSearchRecordKind(record.kind) || !kinds.has(record.kind))
          continue;
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
    // Dzień roboczy jest ustawieniem WORKSPACE'U, więc tydzień musi go mieć w
    // ręku. Brak workspace'u to nie jest przypadek do wypełnienia domyślną
    // wartością — to pytanie o coś, czego pytający nie widzi.
    const workspace = view.getWorkspace(query.workspaceId);
    if (workspace === undefined)
      return queryRejected(query, kernelTime, "authorization.denied");
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
          (candidate) =>
            candidate.taskId === task.id &&
            candidate.relationType === "task_contributes_to_project",
        );
        const project =
          relation === undefined ||
          relation.relationType !== "task_contributes_to_project"
            ? undefined
            : projects.get(relation.projectId);
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
          ...(task.plannedBy === undefined
            ? {}
            : { plannedBy: task.plannedBy }),
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
      workingDay: effectiveWorkingDay(workspace),
      focus,
    });
  }
  const activityMap: Partial<Record<DomainEvent["type"], string>> = {
    "capture.routed_as_task": "capture_routed",
    "capture.transcript_written": "capture_transcript_ready",
    "project.created": "project_created",
    "project.outcome_updated": "project_outcome_changed",
    // Mapa jest `Partial`, więc brak wpisu KOMPILUJE SIĘ i po prostu na zawsze
    // ukrywa przemianowanie w Aktywności. Wpis i wartość w enumie zapytania
    // muszą wejść tą samą zmianą, inaczej `activity.meaningful` rzuca.
    "project.details_updated": "project_details_changed",
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
