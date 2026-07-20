import {
  executeAgentAccessCommand,
  executeAgentAccessQuery,
  isAgentAccessCommandAuthorized,
  type AgentAccessCommand,
  type AgentAccessQuery,
} from "./agent-access.js";
import {
  executeCollaborationCommand,
  executeCollaborationQuery,
  type CollaborationCommand,
  type CollaborationQuery,
} from "./collaboration.js";
import {
  activeMembership,
  canEditSpace,
  canManageWorkspaceAccess,
  canViewSpace,
} from "./collaboration-policy.js";
import {
  AuditReceiptIdSchema,
  AttentionSignalIdSchema,
  CaptureIdSchema,
  CommandOutcomeSchema,
  EventIdSchema,
  MembershipIdSchema,
  KnowledgeSourceIdSchema,
  OutboxEntryIdSchema,
  QueryResultSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
  type CommandEnvelope,
  type CommandOutcome,
  type ContractIssue,
  type ExecutionContext,
  type QueryEnvelope,
  type QueryResult,
  type SpaceId,
  type CaptureOriginal,
  type CaptureId,
  type CaptureReviewReason,
  isCustodiedCaptureOriginal,
  validateCommandEnvelope,
  validateExecutionContext,
  validateQueryEnvelope,
} from "@constellation/contracts";
import {
  createLocalWorkspace,
  awaitVoiceTranscript,
  writeVoiceTranscript,
  requestVoiceAudioDeletion,
  confirmVoiceAudioDeletion,
  captureDisplayText,
  captureFingerprintSource,
  createKnowledgeSource,
  renameWorkspace,
  setWorkspaceVoiceAudioRetention,
  routeCaptureAsKnowledgeSource,
  routeCaptureAsTask,
  submitCapture,
  setAttentionState,
  type AuditReceipt,
  type AttentionSignal,
  type DomainEvent,
  type OutboxEntry,
  type WorkspaceMembership,
  type ReviewCapture,
  type PendingCapture,
  type UnclassifiedCapture,
  type TranscriptReadyCapture,
} from "@constellation/domain";

import {
  isApplicationWave2Transaction,
  RetryableUnitOfWorkError,
  type ApplicationKernelDependencies,
  type ApplicationReadView,
  type ApplicationTransaction,
  type ApplicationWave2Transaction,
  type CurrentAuthorizationPolicy,
  type CapturePaginationCursor,
  type StoreFreshness,
  type TaskDuePaginationCursor,
  type TaskPaginationCursor,
} from "./ports.js";
import {
  executeWave2Command,
  executeWave2Query,
  isWave2CommandAuthorized,
  type Wave2Command,
  type Wave2Query,
} from "./wave2.js";

export interface ContractBoundaryRejection {
  readonly kind: "contract_rejected";
  readonly diagnosticCode: "contract.invalid";
  readonly issues: readonly ContractIssue[];
}

export type ApplicationCommandResponse =
  | { readonly kind: "command_outcome"; readonly outcome: CommandOutcome }
  | ContractBoundaryRejection;

export type ApplicationQueryResponse =
  | { readonly kind: "query_result"; readonly result: QueryResult }
  | ContractBoundaryRejection;

type OutcomeBody = CommandOutcome extends infer Outcome
  ? Outcome extends CommandOutcome
    ? Omit<
        Outcome,
        "contractVersion" | "commandId" | "correlationId" | "kernelTime"
      >
    : never
  : never;

const contractRejection = (
  issueGroups: readonly (readonly ContractIssue[])[],
): ContractBoundaryRejection => ({
  kind: "contract_rejected",
  diagnosticCode: "contract.invalid",
  issues: issueGroups.flat(),
});

const idempotencyScope = (
  context: ExecutionContext,
  command: CommandEnvelope,
): string =>
  [
    command.workspaceId,
    context.principalId,
    command.commandName,
    command.idempotencyKey,
  ].join(":");

const semanticCommandInput = (command: CommandEnvelope): unknown => ({
  contractVersion: command.contractVersion,
  commandName: command.commandName,
  workspaceId: command.workspaceId,
  payload: command.payload,
  expectedVersions: command.expectedVersions,
  causationId: command.causationId ?? null,
  checkpointId: command.checkpointId ?? null,
});

const canUseSpace = (
  context: ExecutionContext,
  workspaceId: string,
  spaceId: SpaceId,
): boolean =>
  context.workspaceId === workspaceId && context.spaceScope.includes(spaceId);

const isWorkspaceAdministrator = (
  membership: WorkspaceMembership | undefined,
): boolean => membership?.role === "owner" || membership?.role === "admin";

const isCurrentlyAuthorized = (
  authorization: CurrentAuthorizationPolicy,
  view: ApplicationReadView,
  context: ExecutionContext,
  command: CommandEnvelope,
): boolean => {
  if (context.workspaceId !== command.workspaceId) {
    return false;
  }

  switch (command.commandName) {
    case "workspace.createLocal":
      return (
        authorization.authorize({
          context,
          capability: command.commandName,
          workspaceId: command.workspaceId,
          spaceId: command.payload.rootSpaceId,
        }) &&
        context.principalKind === "human" &&
        context.principalId === command.payload.ownerPrincipalId &&
        command.workspaceId === command.payload.workspaceId &&
        canUseSpace(context, command.workspaceId, command.payload.rootSpaceId)
      );
    case "workspace.rename":
    case "workspace.setVoiceAudioRetention": {
      const workspace = view.getWorkspace(command.workspaceId);
      const membership = view.getMembership(
        command.workspaceId,
        context.principalId,
      );
      return (
        workspace !== undefined &&
        authorization.authorize({
          context,
          capability: "workspace.rename",
          workspaceId: command.workspaceId,
          spaceId: workspace.rootSpaceId,
        }) &&
        canEditSpace(
          view,
          context,
          command.workspaceId,
          workspace.rootSpaceId,
        ) &&
        isWorkspaceAdministrator(membership)
      );
    }
    case "workspace.memberAdd":
    case "workspace.memberSetAccess":
    case "workspace.memberRevoke": {
      const workspace = view.getWorkspace(command.workspaceId);
      const canManage =
        workspace !== undefined &&
        canManageWorkspaceAccess(view, context, workspace.id) &&
        authorization.authorize({
          context,
          capability: "workspace.manageAccess",
          workspaceId: workspace.id,
        });
      if (!canManage) return false;
      if (command.commandName === "workspace.memberAdd")
        return canEditSpace(
          view,
          context,
          command.workspaceId,
          command.payload.spaceId,
        );
      if (command.commandName === "workspace.memberSetAccess") {
        const grant = view.getSpaceGrant(command.payload.spaceGrantId);
        return (
          grant?.workspaceId === command.workspaceId &&
          canEditSpace(view, context, command.workspaceId, grant.spaceId)
        );
      }
      return true;
    }
    case "agent.grantCreate":
    case "agent.grantRotateCredential":
    case "agent.grantRevoke":
    case "agent.checkpointCreate":
    case "agent.handoffSubmit":
      return isAgentAccessCommandAuthorized(
        { authorization },
        view,
        context,
        command as AgentAccessCommand,
      );
    case "capture.submit":
    case "capture.submitText": {
      const workspace = view.getWorkspace(command.workspaceId);
      const space = view.getSpace(command.payload.spaceId);
      const membership = view.getMembership(
        command.workspaceId,
        context.principalId,
      );
      return (
        workspace !== undefined &&
        space?.workspaceId === workspace.id &&
        membership !== undefined &&
        authorization.authorize({
          context,
          capability: command.commandName,
          workspaceId: command.workspaceId,
          spaceId: command.payload.spaceId,
        }) &&
        canEditSpace(
          view,
          context,
          command.workspaceId,
          command.payload.spaceId,
        )
      );
    }
    case "capture.process":
    case "capture.reportException":
    case "capture.resolveException":
    case "capture.writeTranscript":
    case "capture.requestAudioDeletion":
    case "capture.confirmAudioDeletion":
    case "capture.routeAsTask": {
      if (
        (command.commandName === "capture.requestAudioDeletion" &&
          context.principalKind !== "human") ||
        (command.commandName === "capture.confirmAudioDeletion" &&
          (context.principalKind !== "human" ||
            context.origin !== "maintenance"))
      )
        return false;
      const capture = view.getCapture(command.payload.captureId);
      const membership = view.getMembership(
        command.workspaceId,
        context.principalId,
      );
      return (
        capture?.workspaceId === command.workspaceId &&
        membership !== undefined &&
        authorization.authorize({
          context,
          capability:
            command.commandName === "capture.reportException" ||
            command.commandName === "capture.resolveException"
              ? "capture.process"
              : command.commandName === "capture.writeTranscript"
                ? "capture.transcriptWrite"
                : command.commandName === "capture.requestAudioDeletion"
                  ? "capture.process"
                  : command.commandName === "capture.confirmAudioDeletion"
                    ? "capture.audioDeleteConfirm"
                    : command.commandName,
          workspaceId: command.workspaceId,
          spaceId: capture.spaceId,
        }) &&
        canEditSpace(view, context, command.workspaceId, capture.spaceId)
      );
    }
    case "project.create":
    case "document.create":
    case "knowledge.sourceCreate":
    case "knowledge.sourceUpdate":
    case "knowledge.documentSetEvidence":
    case "knowledge.namedVersionCreate":
    case "knowledge.namedVersionVoid":
    case "relationship.organizationCreate":
    case "relationship.personCreate":
    case "opportunity.create":
    case "opportunity.offerCreate":
    case "opportunity.linkOutcomes":
    case "relationship.renewalCreate":
    case "relationship.renewalResolve":
    case "relationship.factCreate":
    case "decision.create":
    case "decision.supersede":
    case "decision.resolveImpact":
    case "area.create":
    case "initiative.create":
    case "work.linkCreate":
    case "work.linkRemove":
    case "savedView.create":
    case "savedView.rename":
    case "savedView.update":
    case "savedView.delete":
    case "recurrence.create":
    case "recurrence.generateOccurrence":
    case "project.close":
    case "project.reopen":
    case "radar.candidateUpsert":
    case "radar.resolve":
    case "meeting.upsertImported":
    case "meeting.route":
    case "meeting.promoteWorkItem":
    case "meeting.linkParticipants":
    case "project.updateOutcome":
    case "task.create":
    case "task.updateDetails":
    case "task.setParent":
    case "template.create":
    case "template.rename":
    case "template.updateContents":
    case "template.archive":
    case "template.restore":
    case "automation.create":
    case "automation.rename":
    case "automation.setState":
    case "automation.sweep":
    case "recurrence.sweep":
    case "project.applyTemplate":
    case "fieldDef.create":
    case "fieldDef.rename":
    case "fieldDef.archive":
    case "fieldDef.restore":
    case "record.setFieldValue":
    case "taskStatus.create":
    case "taskStatus.rename":
    case "taskStatus.setSemantics":
    case "taskStatus.reorder":
    case "taskStatus.archive":
    case "taskStatus.restore":
    case "workspace.setDefaultTaskStatus":
    case "task.setStatus":
    case "task.setOperationalState":
    case "task.complete":
    case "task.reopen":
    case "task.assign":
    case "task.unassign":
    case "comment.add":
    case "comment.edit":
    case "comment.resolve":
    case "comment.reopen":
    case "attention.markRead":
    case "attention.dismiss":
    case "record.relate":
    case "record.unrelate":
    case "command.previewUndo":
    case "command.undo":
      return isWave2CommandAuthorized(
        { authorization },
        view,
        context,
        command,
      );
  }
};

const currentVersionMap = (
  recordId: string,
  version: number,
): Record<string, number> => ({ [recordId]: version });

const captureAttentionReason = (
  reason: CaptureReviewReason,
): AttentionSignal["reason"] =>
  reason === "duplicate" ? "capture_duplicate" : `capture_${reason}`;

export class ApplicationKernel {
  public constructor(
    private readonly dependencies: ApplicationKernelDependencies,
  ) {}

  public execute(
    rawContext: unknown,
    rawCommand: unknown,
  ): ApplicationCommandResponse {
    const context = validateExecutionContext(rawContext);
    const command = validateCommandEnvelope(rawCommand);
    if (!context.ok || !command.ok) {
      return contractRejection([
        ...(context.ok ? [] : [context.issues]),
        ...(command.ok ? [] : [command.issues]),
      ]);
    }

    return {
      kind: "command_outcome",
      outcome: this.executeValidated(context.value, command.value),
    };
  }

  public query(
    rawContext: unknown,
    rawQuery: unknown,
  ): ApplicationQueryResponse {
    const context = validateExecutionContext(rawContext);
    const query = validateQueryEnvelope(rawQuery);
    if (!context.ok || !query.ok) {
      return contractRejection([
        ...(context.ok ? [] : [context.issues]),
        ...(query.ok ? [] : [query.issues]),
      ]);
    }

    return {
      kind: "query_result",
      result: this.queryValidated(context.value, query.value),
    };
  }

  private executeValidated(
    context: ExecutionContext,
    command: CommandEnvelope,
  ): CommandOutcome {
    const occurredAt = this.dependencies.clock.now();
    const scope = idempotencyScope(context, command);
    const fingerprint = this.dependencies.hasher.fingerprint(
      semanticCommandInput(command),
    );

    try {
      return this.dependencies.store.transact((transaction) => {
        if (
          !isCurrentlyAuthorized(
            this.dependencies.authorization,
            transaction,
            context,
            command,
          )
        ) {
          return this.outcome(command, occurredAt, {
            outcome: "rejected",
            diagnosticCode: "authorization.denied",
          });
        }
        const existing = transaction.getIdempotency(scope);
        if (existing !== undefined) {
          return existing.fingerprint === fingerprint
            ? existing.outcome
            : this.outcome(command, occurredAt, {
                outcome: "conflict",
                diagnosticCode: "idempotency.key_reused",
                currentVersions: {},
              });
        }

        const checkpoint =
          command.checkpointId === undefined
            ? undefined
            : transaction.getAgentCheckpoint(command.checkpointId);
        if (
          command.checkpointId !== undefined &&
          (checkpoint === undefined ||
            checkpoint.status !== "open" ||
            checkpoint.workspaceId !== command.workspaceId ||
            checkpoint.agentPrincipalId !== context.principalId ||
            checkpoint.grantId !== context.grantId)
        ) {
          return this.outcome(command, occurredAt, {
            outcome: "rejected",
            diagnosticCode: "command.precondition_failed",
          });
        }
        const outcome = this.handleCommand(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
        if (
          outcome.outcome === "success" &&
          checkpoint !== undefined &&
          !checkpoint.commandIds.includes(command.commandId)
        ) {
          transaction.updateAgentCheckpoint({
            ...checkpoint,
            commandIds: [...checkpoint.commandIds, command.commandId],
            updatedAt: occurredAt,
          });
        }
        return outcome;
      });
    } catch (error) {
      if (!(error instanceof RetryableUnitOfWorkError)) {
        throw error;
      }
      return this.outcome(command, occurredAt, {
        outcome: "retryable",
        diagnosticCode: error.diagnosticCode,
      });
    }
  }

  private handleCommand(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: CommandEnvelope,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    switch (command.commandName) {
      case "workspace.createLocal":
        return this.createWorkspace(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "workspace.rename":
        return this.renameWorkspace(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "workspace.setVoiceAudioRetention":
        return this.setWorkspaceVoiceAudioRetention(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "workspace.memberAdd":
      case "workspace.memberSetAccess":
      case "workspace.memberRevoke":
        return executeCollaborationCommand(
          this.dependencies,
          transaction,
          context,
          command as CollaborationCommand,
          { scope, fingerprint },
          occurredAt,
        );
      case "agent.grantCreate":
      case "agent.grantRotateCredential":
      case "agent.grantRevoke":
      case "agent.checkpointCreate":
      case "agent.handoffSubmit":
        return executeAgentAccessCommand(
          this.dependencies,
          transaction,
          context,
          command as AgentAccessCommand,
          { scope, fingerprint },
          occurredAt,
        );
      case "capture.submitText":
        return this.submitTextCapture(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "capture.submit":
        return this.submitTypedCapture(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "capture.process":
        return this.processCapture(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "capture.reportException":
        return this.reportCaptureException(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "capture.resolveException":
        return this.resolveCaptureException(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "capture.writeTranscript":
        return this.writeCaptureTranscript(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "capture.requestAudioDeletion":
        return this.requestCaptureAudioDeletion(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "capture.confirmAudioDeletion":
        return this.confirmCaptureAudioDeletion(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "capture.routeAsTask":
        return this.routeCaptureToTask(
          transaction,
          context,
          command,
          scope,
          fingerprint,
          occurredAt,
        );
      case "project.create":
      case "document.create":
      case "knowledge.sourceCreate":
      case "knowledge.sourceUpdate":
      case "knowledge.documentSetEvidence":
      case "knowledge.namedVersionCreate":
      case "knowledge.namedVersionVoid":
      case "relationship.organizationCreate":
      case "relationship.personCreate":
      case "opportunity.create":
      case "opportunity.offerCreate":
      case "opportunity.linkOutcomes":
      case "relationship.renewalCreate":
      case "relationship.renewalResolve":
      case "relationship.factCreate":
      case "decision.create":
      case "decision.supersede":
      case "decision.resolveImpact":
      case "area.create":
      case "initiative.create":
      case "work.linkCreate":
      case "work.linkRemove":
      case "savedView.create":
      case "savedView.rename":
      case "savedView.update":
      case "savedView.delete":
      case "recurrence.create":
      case "recurrence.generateOccurrence":
      case "project.close":
      case "project.reopen":
      case "radar.candidateUpsert":
      case "radar.resolve":
      case "meeting.upsertImported":
      case "meeting.route":
      case "meeting.promoteWorkItem":
      case "meeting.linkParticipants":
      case "project.updateOutcome":
      case "task.create":
      case "task.updateDetails":
      case "task.setParent":
      case "template.create":
      case "template.rename":
      case "template.updateContents":
      case "template.archive":
      case "template.restore":
      case "project.applyTemplate":
      case "automation.create":
      case "automation.rename":
      case "automation.setState":
      case "automation.sweep":
      case "recurrence.sweep":
      case "fieldDef.create":
      case "fieldDef.rename":
      case "fieldDef.archive":
      case "fieldDef.restore":
      case "record.setFieldValue":
      case "taskStatus.create":
      case "taskStatus.rename":
      case "taskStatus.setSemantics":
      case "taskStatus.reorder":
      case "taskStatus.archive":
      case "taskStatus.restore":
      case "workspace.setDefaultTaskStatus":
      case "task.setStatus":
      case "task.setOperationalState":
      case "task.complete":
      case "task.reopen":
      case "comment.add":
      case "comment.edit":
      case "comment.resolve":
      case "comment.reopen":
      case "attention.markRead":
      case "attention.dismiss":
      case "task.assign":
      case "task.unassign":
      case "record.relate":
      case "record.unrelate":
      case "command.previewUndo":
      case "command.undo":
        return executeWave2Command(
          this.dependencies,
          transaction,
          context,
          command as Wave2Command,
          { scope, fingerprint },
          occurredAt,
        );
    }
  }

  private createWorkspace(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "workspace.createLocal" }>,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    if (Object.keys(command.expectedVersions).length !== 0) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    }

    if (
      transaction.getWorkspace(command.workspaceId) !== undefined ||
      transaction.getSpace(command.payload.rootSpaceId) !== undefined
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.already_exists",
        currentVersions: {},
      });
    }

    const membershipId = MembershipIdSchema.parse(
      this.dependencies.ids.next("membership"),
    );
    const defaultTaskStatusId = TaskStatusIdSchema.parse(
      this.dependencies.ids.next("taskStatus"),
    );
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const outboxEntryId = OutboxEntryIdSchema.parse(
      this.dependencies.ids.next("outboxEntry"),
    );
    const created = createLocalWorkspace({
      workspaceId: command.payload.workspaceId,
      rootSpaceId: command.payload.rootSpaceId,
      membershipId,
      defaultTaskStatusId,
      ownerPrincipalId: command.payload.ownerPrincipalId,
      name: command.payload.name,
      timezone: command.payload.timezone,
      occurredAt,
    });
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "workspace.created",
      workspaceId: created.workspace.id,
      spaceId: created.rootSpace.id,
      aggregateId: created.workspace.id,
      aggregateVersion: created.workspace.version,
      occurredAt,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      created.rootSpace.id,
      [
        created.workspace.id,
        created.rootSpace.id,
        created.ownerMembership.id,
        created.defaultTaskStatus.id,
      ],
      {
        [created.workspace.id]: created.workspace.version,
        [created.rootSpace.id]: created.rootSpace.version,
        [created.ownerMembership.id]: created.ownerMembership.version,
        [created.defaultTaskStatus.id]: created.defaultTaskStatus.version,
      },
      [
        "name",
        "timezone",
        "rootSpaceId",
        "ownerPrincipalId",
        "defaultTaskStatusId",
      ],
      occurredAt,
    );
    const outbox: OutboxEntry = {
      id: outboxEntryId,
      workspaceId: created.workspace.id,
      spaceId: created.rootSpace.id,
      eventId,
      topic: "workspace.projection.requested",
      createdAt: occurredAt,
    };
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "workspace.created",
      affected: [
        {
          recordId: created.workspace.id,
          recordKind: "workspace",
          version: 1,
        },
        {
          recordId: created.rootSpace.id,
          recordKind: "space",
          version: 1,
        },
        {
          recordId: created.ownerMembership.id,
          recordKind: "membership",
          version: 1,
        },
        {
          recordId: created.defaultTaskStatus.id,
          recordKind: "taskStatus",
          version: 1,
        },
      ],
      auditReceiptId,
      projection: {
        kind: "workspace.created",
        workspaceId: created.workspace.id,
        rootSpaceId: created.rootSpace.id,
        defaultTaskStatusId: created.defaultTaskStatus.id,
        version: created.workspace.version,
      },
    });

    transaction.insertWorkspace(created.workspace);
    transaction.insertSpace(created.rootSpace);
    transaction.insertMembership(created.ownerMembership);
    transaction.insertTaskStatus(created.defaultTaskStatus);
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    transaction.insertOutbox(outbox);
    return outcome;
  }

  private renameWorkspace(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "workspace.rename" }>,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const workspace = transaction.getWorkspace(command.workspaceId);
    const membership = transaction.getMembership(
      command.workspaceId,
      context.principalId,
    );
    if (
      workspace === undefined ||
      !canEditSpace(
        transaction,
        context,
        command.workspaceId,
        workspace.rootSpaceId,
      ) ||
      !isWorkspaceAdministrator(membership)
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "authorization.denied",
      });
    }

    const expectedVersion = command.expectedVersions[workspace.id];
    const expectedRecordIds = Object.keys(command.expectedVersions);
    if (
      expectedVersion === undefined ||
      expectedRecordIds.length !== 1 ||
      expectedRecordIds[0] !== workspace.id
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    }
    if (expectedVersion !== workspace.version) {
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(workspace.id, workspace.version),
      });
    }

    const updated = renameWorkspace(
      workspace,
      command.payload.name,
      occurredAt,
    );
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const outboxEntryId = OutboxEntryIdSchema.parse(
      this.dependencies.ids.next("outboxEntry"),
    );
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "workspace.renamed",
      workspaceId: workspace.id,
      spaceId: workspace.rootSpaceId,
      aggregateId: workspace.id,
      aggregateVersion: updated.version,
      occurredAt,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      workspace.rootSpaceId,
      [workspace.id],
      { [workspace.id]: updated.version },
      ["name"],
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "workspace.renamed",
      affected: [
        {
          recordId: updated.id,
          recordKind: "workspace",
          version: updated.version,
        },
      ],
      auditReceiptId,
      projection: {
        kind: "workspace.renamed",
        workspaceId: updated.id,
        name: updated.name,
        version: updated.version,
      },
    });
    const outbox: OutboxEntry = {
      id: outboxEntryId,
      workspaceId: workspace.id,
      spaceId: workspace.rootSpaceId,
      eventId,
      topic: "workspace.projection.requested",
      createdAt: occurredAt,
    };

    if (!transaction.updateWorkspace(updated, expectedVersion)) {
      const current = transaction.getWorkspace(workspace.id);
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions:
          current === undefined
            ? {}
            : currentVersionMap(current.id, current.version),
      });
    }
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    transaction.insertOutbox(outbox);
    return outcome;
  }

  private setWorkspaceVoiceAudioRetention(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "workspace.setVoiceAudioRetention" }
    >,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const workspace = transaction.getWorkspace(command.workspaceId);
    const membership = transaction.getMembership(
      command.workspaceId,
      context.principalId,
    );
    if (
      workspace === undefined ||
      !canEditSpace(
        transaction,
        context,
        command.workspaceId,
        workspace.rootSpaceId,
      ) ||
      !isWorkspaceAdministrator(membership)
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "authorization.denied",
      });
    const expectedVersion = command.expectedVersions[workspace.id];
    if (
      expectedVersion === undefined ||
      Object.keys(command.expectedVersions).length !== 1
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (expectedVersion !== workspace.version)
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(workspace.id, workspace.version),
      });
    const updated = setWorkspaceVoiceAudioRetention(
      workspace,
      command.payload.retentionPolicy,
      occurredAt,
    );
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "workspace.voice_audio_retention_changed",
      workspaceId: workspace.id,
      spaceId: workspace.rootSpaceId,
      aggregateId: workspace.id,
      aggregateVersion: updated.version,
      occurredAt,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      workspace.rootSpaceId,
      [workspace.id],
      { [workspace.id]: updated.version },
      ["voiceAudioRetentionPolicy"],
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "workspace.voice_audio_retention_changed",
      affected: [
        {
          recordId: updated.id,
          recordKind: "workspace",
          version: updated.version,
        },
      ],
      auditReceiptId,
      projection: {
        kind: "workspace.voice_audio_retention_changed",
        workspaceId: updated.id,
        retentionPolicy: command.payload.retentionPolicy,
        version: updated.version,
      },
    });
    if (!transaction.updateWorkspace(updated, expectedVersion))
      throw new RetryableUnitOfWorkError();
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    return outcome;
  }

  private submitTextCapture(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "capture.submitText" }>,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    return this.storeCapture(
      transaction,
      context,
      command,
      { kind: "text", text: command.payload.originalText },
      scope,
      fingerprint,
      occurredAt,
    );
  }

  private submitTypedCapture(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "capture.submit" }>,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    return this.storeCapture(
      transaction,
      context,
      command,
      command.payload.original,
      scope,
      fingerprint,
      occurredAt,
    );
  }

  private storeCapture(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "capture.submitText" | "capture.submit" }
    >,
    original: CaptureOriginal,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const workspace = transaction.getWorkspace(command.workspaceId);
    const space = transaction.getSpace(command.payload.spaceId);
    const membership = transaction.getMembership(
      command.workspaceId,
      context.principalId,
    );
    if (
      workspace === undefined ||
      space?.workspaceId !== workspace.id ||
      membership === undefined ||
      !canEditSpace(
        transaction,
        context,
        command.workspaceId,
        command.payload.spaceId,
      )
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "authorization.denied",
      });
    }
    if (Object.keys(command.expectedVersions).length !== 0) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    }
    if (
      isCustodiedCaptureOriginal(original) &&
      this.dependencies.capturePayloadVerifier?.isAvailable(
        command.workspaceId,
        original,
      ) !== true
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "capture.payload_unavailable",
      });
    }

    const captureId = CaptureIdSchema.parse(
      this.dependencies.ids.next("capture"),
    );
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const outboxEntryId = OutboxEntryIdSchema.parse(
      this.dependencies.ids.next("outboxEntry"),
    );
    const capture = submitCapture({
      captureId,
      workspaceId: command.workspaceId,
      spaceId: command.payload.spaceId,
      originalText: captureDisplayText(original),
      original,
      originalFingerprint: this.dependencies.hasher.fingerprint(
        captureFingerprintSource(original),
      ),
      deviceId: command.payload.deviceId,
      source: command.payload.source,
      submittedBy: context.principalId,
      capturedAt: occurredAt,
    });
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "capture.submitted",
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      aggregateId: capture.id,
      aggregateVersion: capture.version,
      occurredAt,
      source: capture.source,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      capture.spaceId,
      [capture.id],
      { [capture.id]: capture.version },
      ["original", "deviceId", "source", "processingState"],
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "capture.stored",
      affected: [
        {
          recordId: capture.id,
          recordKind: "capture",
          version: capture.version,
        },
      ],
      auditReceiptId,
      projection: {
        kind: "capture.stored",
        captureId: capture.id,
        processingState: capture.processingState,
        version: capture.version,
      },
    });
    const outbox: OutboxEntry = {
      id: outboxEntryId,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      eventId,
      topic: "capture.processing.requested",
      createdAt: occurredAt,
    };

    transaction.insertCapture(capture);
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    transaction.insertOutbox(outbox);
    return outcome;
  }

  private processCapture(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "capture.process" }>,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const capture = transaction.getCapture(command.payload.captureId);
    const expectedVersion =
      capture === undefined ? undefined : command.expectedVersions[capture.id];
    if (
      capture === undefined ||
      capture.workspaceId !== command.workspaceId ||
      !canEditSpace(transaction, context, command.workspaceId, capture.spaceId)
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "authorization.denied",
      });
    }
    if (
      expectedVersion === undefined ||
      Object.keys(command.expectedVersions).length !== 1
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    }
    if (expectedVersion !== capture.version) {
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(capture.id, capture.version),
      });
    }
    if (
      capture.processingState !== "pending_processing" &&
      !(
        capture.processingState === "needs_review" &&
        command.payload.destination !== "auto"
      )
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "capture.already_routed",
        currentVersions: currentVersionMap(capture.id, capture.version),
      });
    }
    if (
      capture.processingState === "needs_review" &&
      command.payload.destination !== "auto" &&
      !new Set<CaptureReviewReason>([
        "ambiguous",
        "duplicate",
        "unsupported",
        "missing_target",
      ]).has(capture.reviewReason)
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    const pendingCapture: PendingCapture =
      capture.processingState === "pending_processing"
        ? capture
        : {
            id: capture.id,
            workspaceId: capture.workspaceId,
            spaceId: capture.spaceId,
            originalText: capture.originalText,
            original: capture.original,
            originalFingerprint: capture.originalFingerprint,
            deviceId: capture.deviceId,
            source: capture.source,
            capturedAt: capture.capturedAt,
            submittedBy: capture.submittedBy,
            processingState: "pending_processing",
            version: capture.version,
          };
    const duplicate =
      capture.processingState === "pending_processing"
        ? transaction
            .listCapturesInSpace(capture.workspaceId, capture.spaceId)
            .find(
              (candidate) =>
                candidate.id !== capture.id &&
                candidate.originalFingerprint === capture.originalFingerprint &&
                candidate.processingState !== "needs_review",
            )
        : undefined;
    if (duplicate !== undefined) {
      return this.markCaptureForReview(
        transaction,
        context,
        command,
        pendingCapture,
        "duplicate",
        scope,
        fingerprint,
        occurredAt,
        duplicate.id,
      );
    }

    if (pendingCapture.original.kind === "voice_note")
      return this.markCaptureAwaitingTranscript(
        transaction,
        context,
        command,
        pendingCapture,
        scope,
        fingerprint,
        occurredAt,
      );

    const destination =
      command.payload.destination === "auto"
        ? capture.original.kind === "text"
          ? "task"
          : "knowledge_source"
        : command.payload.destination;
    if (destination === "task") {
      const title =
        command.payload.title ??
        captureDisplayText(pendingCapture.original).trim().slice(0, 500);
      return this.routePendingCaptureToTask(
        transaction,
        context,
        command,
        title.length === 0 ? "Captured task" : title,
        scope,
        fingerprint,
        occurredAt,
        pendingCapture,
      );
    }
    if (!isApplicationWave2Transaction(transaction)) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    }
    return this.routePendingCaptureToKnowledgeSource(
      transaction,
      context,
      command,
      pendingCapture,
      expectedVersion,
      scope,
      fingerprint,
      occurredAt,
    );
  }

  private markCaptureAwaitingTranscript(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "capture.process" }>,
    capture: PendingCapture,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const awaiting = awaitVoiceTranscript({ capture, occurredAt });
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "capture.awaiting_transcript",
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      aggregateId: capture.id,
      aggregateVersion: awaiting.version,
      occurredAt,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      capture.spaceId,
      [capture.id],
      { [capture.id]: awaiting.version },
      ["processingState", "awaitingTranscriptSince"],
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "capture.awaiting_transcript",
      affected: [
        {
          recordId: capture.id,
          recordKind: "capture",
          version: awaiting.version,
        },
      ],
      auditReceiptId,
      projection: {
        kind: "capture.awaiting_transcript",
        captureId: capture.id,
        captureVersion: awaiting.version,
      },
    });
    if (!transaction.updateCapture(awaiting, capture.version))
      throw new RetryableUnitOfWorkError();
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    return outcome;
  }

  private writeCaptureTranscript(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "capture.writeTranscript" }
    >,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const capture = transaction.getCapture(command.payload.captureId);
    const expectedVersion =
      capture === undefined ? undefined : command.expectedVersions[capture.id];
    if (
      capture === undefined ||
      capture.workspaceId !== command.workspaceId ||
      capture.processingState !== "awaiting_transcript" ||
      capture.original.kind !== "voice_note"
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (
      expectedVersion === undefined ||
      Object.keys(command.expectedVersions).length !== 1 ||
      command.payload.audioContentSha256 !==
        capture.original.payload.contentSha256
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (expectedVersion !== capture.version)
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(capture.id, capture.version),
      });

    const updated = writeVoiceTranscript({
      capture,
      transcript: command.payload.transcript,
      writtenAt: occurredAt,
      writtenBy: context.principalId,
      writtenByKind: context.principalKind,
      ...(context.hostRun?.agentRunId === undefined
        ? {}
        : { agentRunId: context.hostRun.agentRunId }),
      ...(context.hostRun?.runId === undefined
        ? {}
        : { hostRunId: context.hostRun.runId }),
    });
    return this.commitCaptureLifecycleMutation(
      transaction,
      context,
      command,
      capture.version,
      updated,
      "capture.transcript_written",
      ["processingState", "transcript", "audioState", "audioStateChangedAt"],
      {
        kind: "capture.transcript_written",
        captureId: capture.id,
        captureVersion: updated.version,
        audioState:
          capture.original.retentionPolicy === "retain"
            ? "retained"
            : "deletion_pending",
      },
      scope,
      fingerprint,
      occurredAt,
    );
  }

  private requestCaptureAudioDeletion(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "capture.requestAudioDeletion" }
    >,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const capture = transaction.getCapture(command.payload.captureId);
    const expectedVersion =
      capture === undefined ? undefined : command.expectedVersions[capture.id];
    if (
      capture === undefined ||
      capture.workspaceId !== command.workspaceId ||
      capture.processingState !== "transcript_ready" ||
      capture.audioState !== "retained" ||
      expectedVersion === undefined ||
      Object.keys(command.expectedVersions).length !== 1
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (expectedVersion !== capture.version)
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(capture.id, capture.version),
      });
    const updated = requestVoiceAudioDeletion({ capture, occurredAt });
    return this.commitCaptureLifecycleMutation(
      transaction,
      context,
      command,
      capture.version,
      updated,
      "capture.audio_deletion_requested",
      ["audioState", "audioStateChangedAt"],
      {
        kind: "capture.audio_deletion_requested",
        captureId: capture.id,
        captureVersion: updated.version,
      },
      scope,
      fingerprint,
      occurredAt,
    );
  }

  private confirmCaptureAudioDeletion(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "capture.confirmAudioDeletion" }
    >,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const capture = transaction.getCapture(command.payload.captureId);
    const expectedVersion =
      capture === undefined ? undefined : command.expectedVersions[capture.id];
    if (
      capture === undefined ||
      capture.workspaceId !== command.workspaceId ||
      capture.processingState !== "transcript_ready" ||
      capture.audioState !== "deletion_pending" ||
      capture.original.kind !== "voice_note" ||
      command.payload.audioContentSha256 !==
        capture.original.payload.contentSha256 ||
      expectedVersion === undefined ||
      Object.keys(command.expectedVersions).length !== 1
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (expectedVersion !== capture.version)
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(capture.id, capture.version),
      });
    const updated = confirmVoiceAudioDeletion({ capture, occurredAt });
    return this.commitCaptureLifecycleMutation(
      transaction,
      context,
      command,
      capture.version,
      updated,
      "capture.audio_deleted",
      ["audioState", "audioStateChangedAt"],
      {
        kind: "capture.audio_deleted",
        captureId: capture.id,
        captureVersion: updated.version,
      },
      scope,
      fingerprint,
      occurredAt,
    );
  }

  private commitCaptureLifecycleMutation(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      {
        commandName:
          | "capture.writeTranscript"
          | "capture.requestAudioDeletion"
          | "capture.confirmAudioDeletion";
      }
    >,
    expectedVersion: number,
    capture: TranscriptReadyCapture,
    diagnosticCode:
      | "capture.transcript_written"
      | "capture.audio_deletion_requested"
      | "capture.audio_deleted",
    changedFields: readonly string[],
    projection:
      | {
          readonly kind: "capture.transcript_written";
          readonly captureId: CaptureId;
          readonly captureVersion: number;
          readonly audioState: "deletion_pending" | "retained";
        }
      | {
          readonly kind:
            "capture.audio_deletion_requested" | "capture.audio_deleted";
          readonly captureId: CaptureId;
          readonly captureVersion: number;
        },
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const event: DomainEvent = {
      id: EventIdSchema.parse(this.dependencies.ids.next("event")),
      commandId: command.commandId,
      type: diagnosticCode,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      aggregateId: capture.id,
      aggregateVersion: capture.version,
      occurredAt,
    };
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      capture.spaceId,
      [capture.id],
      { [capture.id]: capture.version },
      changedFields,
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode,
      affected: [
        {
          recordId: capture.id,
          recordKind: "capture",
          version: capture.version,
        },
      ],
      auditReceiptId,
      projection,
    } as OutcomeBody);
    if (!transaction.updateCapture(capture, expectedVersion))
      throw new RetryableUnitOfWorkError();
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    return outcome;
  }

  private reportCaptureException(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "capture.reportException" }
    >,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const capture = transaction.getCapture(command.payload.captureId);
    if (
      capture === undefined ||
      capture.workspaceId !== command.workspaceId ||
      capture.processingState !== "pending_processing" ||
      !canEditSpace(transaction, context, command.workspaceId, capture.spaceId)
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (
      Object.keys(command.expectedVersions).length !== 1 ||
      command.expectedVersions[capture.id] === undefined
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (command.expectedVersions[capture.id] !== capture.version)
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(capture.id, capture.version),
      });
    return this.markCaptureForReview(
      transaction,
      context,
      command,
      capture,
      command.payload.reason,
      scope,
      fingerprint,
      occurredAt,
    );
  }

  private resolveCaptureException(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "capture.resolveException" }
    >,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const capture = transaction.getCapture(command.payload.captureId);
    if (
      capture === undefined ||
      capture.workspaceId !== command.workspaceId ||
      capture.processingState !== "needs_review" ||
      !canEditSpace(transaction, context, command.workspaceId, capture.spaceId)
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    const attention = transaction.getAttentionSignal(capture.attentionSignalId);
    if (
      attention === undefined ||
      attention.destination.kind !== "capture" ||
      attention.destination.captureId !== capture.id
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    const expected = command.expectedVersions;
    if (
      Object.keys(expected).length !== 2 ||
      expected[capture.id] === undefined ||
      expected[attention.id] === undefined
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (
      expected[capture.id] !== capture.version ||
      expected[attention.id] !== attention.version
    )
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: {
          [capture.id]: capture.version,
          [attention.id]: attention.version,
        },
      });
    const retryableReasons = new Set<CaptureReviewReason>([
      "parsing_failure",
      "permission_failure",
      "stale_conflict",
      "missing_payload",
      "partial_payload_transfer",
      "unknown_reconcile",
    ]);
    if (
      command.payload.action === "retry" &&
      !retryableReasons.has(capture.reviewReason)
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    if (command.payload.action === "replace_payload") {
      if (
        capture.reviewReason !== "missing_payload" &&
        capture.reviewReason !== "partial_payload_transfer"
      )
        return this.outcome(command, occurredAt, {
          outcome: "rejected",
          diagnosticCode: "command.precondition_failed",
        });
      const original = command.payload.original;
      if (
        (original.kind !== "managed_file" && original.kind !== "screenshot") ||
        this.dependencies.capturePayloadVerifier?.isAvailable(
          command.workspaceId,
          original,
        ) !== true
      )
        return this.outcome(command, occurredAt, {
          outcome: "rejected",
          diagnosticCode: "capture.payload_unavailable",
        });
    }

    const base = {
      id: capture.id,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      originalText: capture.originalText,
      original: capture.original,
      originalFingerprint: capture.originalFingerprint,
      deviceId: capture.deviceId,
      source: capture.source,
      capturedAt: capture.capturedAt,
      submittedBy: capture.submittedBy,
      version: capture.version + 1,
    };
    const updatedCapture: PendingCapture | UnclassifiedCapture =
      command.payload.action === "keep_unclassified"
        ? {
            ...base,
            processingState: "unclassified",
            unclassifiedAt: occurredAt,
            unclassifiedBy: context.principalId,
            previousReviewReason: capture.reviewReason,
          }
        : command.payload.action === "replace_payload"
          ? {
              ...base,
              originalText: captureDisplayText(command.payload.original),
              original: command.payload.original,
              originalFingerprint: this.dependencies.hasher.fingerprint(
                captureFingerprintSource(command.payload.original),
              ),
              processingState: "pending_processing",
            }
          : { ...base, processingState: "pending_processing" };
    const updatedAttention = setAttentionState(
      attention,
      "dismissed",
      occurredAt,
    );
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "capture.exception_resolved",
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      aggregateId: capture.id,
      aggregateVersion: updatedCapture.version,
      attentionSignalId: attention.id,
      action: command.payload.action,
      processingState: updatedCapture.processingState,
      occurredAt,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      capture.spaceId,
      [capture.id, attention.id],
      {
        [capture.id]: updatedCapture.version,
        [attention.id]: updatedAttention.version,
      },
      ["processingState", "reviewReason", "attention.state"],
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "capture.exception_resolved",
      affected: [
        {
          recordId: capture.id,
          recordKind: "capture",
          version: updatedCapture.version,
        },
        {
          recordId: attention.id,
          recordKind: "attentionSignal",
          version: updatedAttention.version,
        },
      ],
      auditReceiptId,
      projection: {
        kind: "capture.exception_resolved",
        captureId: capture.id,
        captureVersion: updatedCapture.version,
        attentionSignalId: attention.id,
        attentionVersion: updatedAttention.version,
        action: command.payload.action,
        processingState: updatedCapture.processingState,
      },
    });
    if (!transaction.updateCapture(updatedCapture, capture.version))
      throw new RetryableUnitOfWorkError();
    if (!transaction.updateAttentionSignal(updatedAttention, attention.version))
      throw new RetryableUnitOfWorkError();
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    if (updatedCapture.processingState === "pending_processing") {
      transaction.insertOutbox({
        id: OutboxEntryIdSchema.parse(
          this.dependencies.ids.next("outboxEntry"),
        ),
        workspaceId: capture.workspaceId,
        spaceId: capture.spaceId,
        eventId,
        topic: "capture.processing.requested",
        createdAt: occurredAt,
      });
    }
    return outcome;
  }

  private markCaptureForReview(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "capture.process" | "capture.reportException" }
    >,
    capture: PendingCapture,
    reviewReason: CaptureReviewReason,
    scope: string,
    fingerprint: string,
    occurredAt: string,
    duplicateOfCaptureId?: CaptureId,
  ): CommandOutcome {
    const attentionSignalId = AttentionSignalIdSchema.parse(
      this.dependencies.ids.next("attentionSignal"),
    );
    const reviewed: ReviewCapture = {
      ...capture,
      processingState: "needs_review",
      reviewReason,
      ...(duplicateOfCaptureId === undefined ? {} : { duplicateOfCaptureId }),
      attentionSignalId,
      reviewedAt: occurredAt,
      version: capture.version + 1,
    };
    const attention: AttentionSignal = {
      id: attentionSignalId,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      targetPrincipalId: capture.submittedBy,
      reason: captureAttentionReason(reviewReason),
      destination: { kind: "capture", captureId: capture.id },
      sourceRecordId: duplicateOfCaptureId ?? capture.id,
      deduplicationKey: `capture:${capture.id}:${reviewReason}`,
      urgency: "in_app",
      state: "unread",
      version: 1,
      occurredAt,
      updatedAt: occurredAt,
    };
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const outboxEntryId = OutboxEntryIdSchema.parse(
      this.dependencies.ids.next("outboxEntry"),
    );
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "capture.needs_review",
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      aggregateId: capture.id,
      aggregateVersion: reviewed.version,
      attentionSignalId,
      reason: reviewReason,
      occurredAt,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      capture.spaceId,
      [capture.id, attention.id],
      { [capture.id]: reviewed.version, [attention.id]: attention.version },
      ["processingState", "reviewReason", "duplicateOfCaptureId"],
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "capture.needs_review",
      affected: [
        {
          recordId: capture.id,
          recordKind: "capture",
          version: reviewed.version,
        },
        { recordId: attention.id, recordKind: "attentionSignal", version: 1 },
      ],
      auditReceiptId,
      projection: {
        kind: "capture.needs_review",
        captureId: capture.id,
        captureVersion: reviewed.version,
        attentionSignalId,
        reason: reviewReason,
      },
    });
    if (!transaction.updateCapture(reviewed, capture.version)) {
      throw new RetryableUnitOfWorkError();
    }
    transaction.insertAttentionSignal(attention);
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    transaction.insertOutbox({
      id: outboxEntryId,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      eventId,
      topic: "attention.delivery.requested",
      createdAt: occurredAt,
    });
    return outcome;
  }

  private routePendingCaptureToKnowledgeSource(
    transaction: ApplicationWave2Transaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "capture.process" }>,
    capture: PendingCapture,
    expectedVersion: number,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    if (capture.original.kind === "voice_note")
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    const storedCapture = transaction.getCapture(capture.id);
    const reviewAttention =
      storedCapture?.processingState === "needs_review"
        ? transaction.getAttentionSignal(storedCapture.attentionSignalId)
        : undefined;
    if (
      storedCapture?.processingState === "needs_review" &&
      (reviewAttention === undefined ||
        reviewAttention.destination.kind !== "capture" ||
        reviewAttention.destination.captureId !== storedCapture.id)
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    const dismissedAttention =
      reviewAttention === undefined
        ? undefined
        : setAttentionState(reviewAttention, "dismissed", occurredAt);
    const sourceId = KnowledgeSourceIdSchema.parse(
      this.dependencies.ids.next("knowledgeSource"),
    );
    const title =
      command.payload.title ??
      captureDisplayText(capture.original).slice(0, 500);
    const source = createKnowledgeSource({
      id: sourceId,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      sourceKind:
        capture.original.kind === "text"
          ? "excerpt"
          : capture.original.kind === "managed_file"
            ? "file"
            : capture.original.kind,
      title,
      ...(capture.original.kind === "url"
        ? { canonicalUrl: capture.original.url }
        : {}),
      ...(capture.original.kind === "text"
        ? { excerpt: capture.original.text.slice(0, 32_768) }
        : {}),
      availability:
        capture.original.kind === "url" ||
        capture.original.kind === "managed_file" ||
        capture.original.kind === "screenshot"
          ? "available"
          : "reference_only",
      sourceCaptureId: capture.id,
      observedAt: capture.capturedAt,
      createdBy: context.principalId,
      occurredAt,
    });
    const routed = routeCaptureAsKnowledgeSource({
      capture,
      sourceId,
      routedBy: context.principalId,
      occurredAt,
    });
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const outboxEntryId = OutboxEntryIdSchema.parse(
      this.dependencies.ids.next("outboxEntry"),
    );
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "capture.routed_as_knowledge_source",
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      aggregateId: capture.id,
      aggregateVersion: routed.version,
      knowledgeSourceId: source.id,
      occurredAt,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      capture.spaceId,
      [
        capture.id,
        source.id,
        ...(dismissedAttention === undefined ? [] : [dismissedAttention.id]),
      ],
      {
        [capture.id]: routed.version,
        [source.id]: source.version,
        ...(dismissedAttention === undefined
          ? {}
          : { [dismissedAttention.id]: dismissedAttention.version }),
      },
      [
        "processingState",
        "derivedKnowledgeSourceId",
        "source.sourceCaptureId",
        ...(dismissedAttention === undefined ? [] : ["attention.state"]),
      ],
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "capture.routed_as_knowledge_source",
      affected: [
        {
          recordId: capture.id,
          recordKind: "capture",
          version: routed.version,
        },
        {
          recordId: source.id,
          recordKind: "knowledgeSource",
          version: source.version,
        },
        ...(dismissedAttention === undefined
          ? []
          : [
              {
                recordId: dismissedAttention.id,
                recordKind: "attentionSignal" as const,
                version: dismissedAttention.version,
              },
            ]),
      ],
      auditReceiptId,
      projection: {
        kind: "capture.routed_as_knowledge_source",
        captureId: capture.id,
        captureVersion: routed.version,
        sourceId: source.id,
        sourceVersion: source.version,
      },
    });
    if (!transaction.updateCapture(routed, expectedVersion)) {
      throw new RetryableUnitOfWorkError();
    }
    if (
      dismissedAttention !== undefined &&
      reviewAttention !== undefined &&
      !transaction.updateAttentionSignal(
        dismissedAttention,
        reviewAttention.version,
      )
    )
      throw new RetryableUnitOfWorkError();
    transaction.insertKnowledgeSource(source);
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    transaction.insertOutbox({
      id: outboxEntryId,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      eventId,
      topic: "work.projection.requested",
      createdAt: occurredAt,
    });
    transaction.insertUndoDescriptor({
      targetCommandId: command.commandId,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      kind: "capture.undo_knowledge_route",
      captureId: routed.id,
      sourceId: source.id,
      resultingCaptureVersion: routed.version,
      resultingSourceVersion: source.version,
    });
    return outcome;
  }

  private routeCaptureToTask(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "capture.routeAsTask" }>,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    return this.routePendingCaptureToTask(
      transaction,
      context,
      command,
      command.payload.title,
      scope,
      fingerprint,
      occurredAt,
    );
  }

  private routePendingCaptureToTask(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<
      CommandEnvelope,
      { commandName: "capture.routeAsTask" | "capture.process" }
    >,
    title: string,
    scope: string,
    fingerprint: string,
    occurredAt: string,
    providedCapture?: PendingCapture,
  ): CommandOutcome {
    const workspace = transaction.getWorkspace(command.workspaceId);
    const storedCapture = transaction.getCapture(command.payload.captureId);
    const capture = providedCapture ?? storedCapture;
    const membership = transaction.getMembership(
      command.workspaceId,
      context.principalId,
    );
    if (
      workspace === undefined ||
      capture?.workspaceId !== workspace.id ||
      storedCapture?.workspaceId !== workspace.id ||
      membership === undefined ||
      !canEditSpace(transaction, context, command.workspaceId, capture.spaceId)
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "authorization.denied",
      });
    }

    const expectedVersion = command.expectedVersions[capture.id];
    const expectedRecordIds = Object.keys(command.expectedVersions);
    if (
      expectedVersion === undefined ||
      expectedRecordIds.length !== 1 ||
      expectedRecordIds[0] !== capture.id
    ) {
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    }
    if (expectedVersion !== storedCapture.version) {
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(
          storedCapture.id,
          storedCapture.version,
        ),
      });
    }
    if (capture.processingState !== "pending_processing") {
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "capture.already_routed",
        currentVersions: currentVersionMap(
          storedCapture.id,
          storedCapture.version,
        ),
      });
    }

    const taskStatus = transaction.getTaskStatus(workspace.defaultTaskStatusId);
    if (taskStatus?.workspaceId !== workspace.id) {
      throw new RetryableUnitOfWorkError(
        "The workspace default task status is unavailable.",
      );
    }

    const reviewAttention =
      storedCapture.processingState === "needs_review"
        ? transaction.getAttentionSignal(storedCapture.attentionSignalId)
        : undefined;
    if (
      storedCapture.processingState === "needs_review" &&
      (reviewAttention === undefined ||
        reviewAttention.destination.kind !== "capture" ||
        reviewAttention.destination.captureId !== storedCapture.id)
    )
      return this.outcome(command, occurredAt, {
        outcome: "rejected",
        diagnosticCode: "command.precondition_failed",
      });
    const dismissedAttention =
      reviewAttention === undefined
        ? undefined
        : setAttentionState(reviewAttention, "dismissed", occurredAt);

    const taskId = TaskIdSchema.parse(this.dependencies.ids.next("task"));
    const eventId = EventIdSchema.parse(this.dependencies.ids.next("event"));
    const auditReceiptId = AuditReceiptIdSchema.parse(
      this.dependencies.ids.next("auditReceipt"),
    );
    const outboxEntryId = OutboxEntryIdSchema.parse(
      this.dependencies.ids.next("outboxEntry"),
    );
    const routed = routeCaptureAsTask({
      capture,
      taskId,
      taskStatusId: taskStatus.id,
      title,
      routedBy: context.principalId,
      occurredAt,
    });
    const event: DomainEvent = {
      id: eventId,
      commandId: command.commandId,
      type: "capture.routed_as_task",
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      aggregateId: capture.id,
      aggregateVersion: routed.capture.version,
      taskId: routed.task.id,
      taskStatusId: routed.task.statusId,
      occurredAt,
    };
    const audit = this.auditReceipt(
      auditReceiptId,
      context,
      command,
      capture.spaceId,
      [
        routed.capture.id,
        routed.task.id,
        ...(dismissedAttention === undefined ? [] : [dismissedAttention.id]),
      ],
      {
        [routed.capture.id]: routed.capture.version,
        [routed.task.id]: routed.task.version,
        ...(dismissedAttention === undefined
          ? {}
          : { [dismissedAttention.id]: dismissedAttention.version }),
      },
      [
        "processingState",
        "derivedTaskId",
        "task.title",
        "task.statusId",
        "task.sourceCaptureId",
        ...(dismissedAttention === undefined ? [] : ["attention.state"]),
      ],
      occurredAt,
    );
    const outcome = this.outcome(command, occurredAt, {
      outcome: "success",
      diagnosticCode: "capture.routed_as_task",
      affected: [
        {
          recordId: routed.capture.id,
          recordKind: "capture",
          version: routed.capture.version,
        },
        {
          recordId: routed.task.id,
          recordKind: "task",
          version: routed.task.version,
        },
        ...(dismissedAttention === undefined
          ? []
          : [
              {
                recordId: dismissedAttention.id,
                recordKind: "attentionSignal" as const,
                version: dismissedAttention.version,
              },
            ]),
      ],
      auditReceiptId,
      projection: {
        kind: "capture.routed_as_task",
        captureId: routed.capture.id,
        captureVersion: routed.capture.version,
        taskId: routed.task.id,
        taskStatusId: routed.task.statusId,
        taskVersion: routed.task.version,
      },
    });
    const outbox: OutboxEntry = {
      id: outboxEntryId,
      workspaceId: capture.workspaceId,
      spaceId: capture.spaceId,
      eventId,
      topic: "work.projection.requested",
      createdAt: occurredAt,
    };

    if (!transaction.updateCapture(routed.capture, expectedVersion)) {
      const current = transaction.getCapture(capture.id);
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions:
          current === undefined
            ? {}
            : currentVersionMap(current.id, current.version),
      });
    }
    if (
      dismissedAttention !== undefined &&
      reviewAttention !== undefined &&
      !transaction.updateAttentionSignal(
        dismissedAttention,
        reviewAttention.version,
      )
    )
      throw new RetryableUnitOfWorkError();
    transaction.insertTask(routed.task);
    transaction.insertEvent(event);
    transaction.insertAuditReceipt(audit);
    transaction.insertIdempotency({ scope, fingerprint, outcome });
    transaction.insertSyncCommand(command);
    transaction.insertOutbox(outbox);
    if (isApplicationWave2Transaction(transaction)) {
      transaction.insertUndoDescriptor({
        targetCommandId: command.commandId,
        workspaceId: capture.workspaceId,
        spaceId: capture.spaceId,
        kind: "capture.undo_route",
        captureId: routed.capture.id,
        taskId: routed.task.id,
        resultingCaptureVersion: routed.capture.version,
        resultingTaskVersion: routed.task.version,
      });
    }
    return outcome;
  }

  private queryValidated(
    context: ExecutionContext,
    query: QueryEnvelope,
  ): QueryResult {
    const kernelTime = this.dependencies.clock.now();
    if (context.workspaceId !== query.workspaceId) {
      return this.queryRejected(query, kernelTime, "authorization.denied");
    }
    return this.dependencies.store.read((view) => {
      const freshness = view.getFreshness();
      switch (query.queryName) {
        case "workspace.bootstrapContext":
          return this.bootstrapContext(
            view,
            context,
            query,
            kernelTime,
            freshness,
          );
        case "workspace.access":
        case "workspace.exportScoped":
          return executeCollaborationQuery(
            this.dependencies,
            view,
            context,
            query as CollaborationQuery,
            kernelTime,
          );
        case "agent.access":
        case "agent.checkpointPreviewRevert":
          return executeAgentAccessQuery(
            this.dependencies,
            view,
            context,
            query as AgentAccessQuery,
            kernelTime,
          );
        case "capture.history":
          return this.captureHistory(
            view,
            context,
            query,
            kernelTime,
            freshness,
          );
        case "task.list":
          return this.taskList(view, context, query, kernelTime, freshness);
        case "task.assignmentCandidates":
          return this.taskAssignmentCandidates(
            view,
            context,
            query,
            kernelTime,
            freshness,
          );
        case "audit.receipt":
          return this.auditReceiptQuery(
            view,
            context,
            query,
            kernelTime,
            freshness,
          );
        case "project.list":
        case "work.overview":
        case "document.list":
        case "knowledge.list":
        case "knowledge.documentContext":
        case "relationship.workspace":
        case "radar.review":
        case "project.operationalOverview":
        case "search.global":
        case "cockpit.week":
        case "activity.meaningful":
        case "recovery.preview":
        case "comment.list":
        case "comment.mentionCandidates":
        case "attention.inbox":
          return executeWave2Query(
            this.dependencies,
            view,
            context,
            query as Wave2Query,
            kernelTime,
          );
      }
    });
  }

  private bootstrapContext(
    view: ApplicationReadView,
    context: ExecutionContext,
    query: Extract<QueryEnvelope, { queryName: "workspace.bootstrapContext" }>,
    kernelTime: string,
    freshness: StoreFreshness,
  ): QueryResult {
    const workspace = view.getWorkspace(query.workspaceId);
    const membership = activeMembership(
      view,
      query.workspaceId,
      context.principalId,
    );
    if (
      workspace === undefined ||
      membership === undefined ||
      !this.dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
      })
    ) {
      return this.queryRejected(query, kernelTime, "authorization.denied");
    }
    if (this.consistencyUnavailable(query, freshness)) {
      return this.queryRejected(
        query,
        kernelTime,
        "query.consistency_unavailable",
      );
    }
    const spaces = view.listSpaces(workspace.id).filter(
      (space) =>
        canViewSpace(view, context, query.workspaceId, space.id) &&
        this.dependencies.authorization.authorize({
          context,
          capability: query.queryName,
          workspaceId: query.workspaceId,
          spaceId: space.id,
        }),
    );
    const taskStatuses = view.listTaskStatuses(workspace.id);
    return QueryResultSchema.parse({
      outcome: "success",
      contractVersion: 1,
      queryId: query.queryId,
      kernelTime,
      freshness: {
        mode: freshness.mode,
        checkpoint: freshness.checkpoint,
        missingCapabilities: freshness.missingCapabilities,
      },
      projection: {
        kind: "workspace.bootstrapContext",
        workspace: {
          id: workspace.id,
          name: workspace.name,
          timezone: workspace.timezone,
          defaultTaskStatusId: workspace.defaultTaskStatusId,
          voiceAudioRetentionPolicy:
            workspace.voiceAudioRetentionPolicy ?? "delete_after_transcript",
          version: workspace.version,
        },
        spaces: spaces.map((space) => ({
          id: space.id,
          name: space.name,
          version: space.version,
        })),
        taskStatuses: taskStatuses.map((status) => ({
          id: status.id,
          label: status.label,
          operationalSemantics: status.operationalSemantics,
          ...(status.state === undefined ? {} : { state: status.state }),
          position: status.position,
          version: status.version,
        })),
        fieldDefinitions: view
          .listFieldDefinitions(workspace.id)
          .map((definition) => ({
            id: definition.id,
            targetKind: definition.targetKind,
            label: definition.label,
            type: definition.type,
            ...(definition.state === undefined
              ? {}
              : { state: definition.state }),
            position: definition.position,
            version: definition.version,
          })),
        projectTemplates: view
          .listProjectTemplates(workspace.id)
          .map((template) => ({
            id: template.id,
            name: template.name,
            ...(template.description === undefined
              ? {}
              : { description: template.description }),
            taskTitles: template.taskTitles,
            fieldIds: template.fieldIds,
            ...(template.state === undefined ? {} : { state: template.state }),
            position: template.position,
            version: template.version,
          })),
        automationRules: view.listAutomationRules(workspace.id).map((rule) => ({
          id: rule.id,
          name: rule.name,
          recipe: rule.recipe,
          ...(rule.state === undefined ? {} : { state: rule.state }),
          position: rule.position,
          version: rule.version,
        })),
      },
    });
  }

  private captureHistory(
    view: ApplicationReadView,
    context: ExecutionContext,
    query: Extract<QueryEnvelope, { queryName: "capture.history" }>,
    kernelTime: string,
    freshness: StoreFreshness,
  ): QueryResult {
    const membership = view.getMembership(
      query.workspaceId,
      context.principalId,
    );
    const space = view.getSpace(query.parameters.spaceId);
    if (
      membership === undefined ||
      space?.workspaceId !== query.workspaceId ||
      !this.dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
        spaceId: query.parameters.spaceId,
      }) ||
      !canViewSpace(view, context, query.workspaceId, query.parameters.spaceId)
    ) {
      return this.queryRejected(query, kernelTime, "authorization.denied");
    }
    if (this.consistencyUnavailable(query, freshness)) {
      return this.queryRejected(
        query,
        kernelTime,
        "query.consistency_unavailable",
      );
    }

    let after: CapturePaginationCursor | undefined;
    if (query.parameters.cursor !== undefined) {
      const decoded = this.dependencies.cursorCodec.decode(
        query.parameters.cursor,
      );
      if (decoded?.kind !== "capture") {
        return this.queryRejected(query, kernelTime, "query.cursor_invalid");
      }
      after = decoded;
    }
    const limit = query.parameters.limit ?? 50;
    const items = view.listCaptures({
      workspaceId: query.workspaceId,
      spaceId: query.parameters.spaceId,
      ...(after === undefined ? {} : { after }),
      limit: limit + 1,
    });
    if (items === undefined) {
      return this.queryRejected(query, kernelTime, "query.cursor_invalid");
    }
    const visibleItems = items.slice(0, limit);
    const last = visibleItems.at(-1);
    const nextCursor =
      items.length > limit && last !== undefined
        ? this.dependencies.cursorCodec.encode({
            kind: "capture",
            orderedAt: last.capturedAt,
            recordId: last.id,
          })
        : null;

    return QueryResultSchema.parse({
      outcome: "success",
      contractVersion: 1,
      queryId: query.queryId,
      kernelTime,
      freshness: {
        mode: freshness.mode,
        checkpoint: freshness.checkpoint,
        missingCapabilities: freshness.missingCapabilities,
      },
      projection: {
        kind: "capture.history",
        items: visibleItems.map((capture) => ({
          id: capture.id,
          spaceId: capture.spaceId,
          originalText: capture.originalText,
          original: capture.original,
          source: capture.source,
          capturedAt: capture.capturedAt,
          processingState: capture.processingState,
          ...(capture.processingState === "routed_as_task"
            ? {
                derivedTaskId: capture.derivedTaskId,
                routedAt: capture.routedAt,
                routedBy: capture.routedBy,
              }
            : capture.processingState === "routed_as_knowledge_source"
              ? {
                  derivedKnowledgeSourceId: capture.derivedKnowledgeSourceId,
                  routedAt: capture.routedAt,
                  routedBy: capture.routedBy,
                }
              : capture.processingState === "needs_review"
                ? {
                    reviewReason: capture.reviewReason,
                    ...(capture.duplicateOfCaptureId === undefined
                      ? {}
                      : { duplicateOfCaptureId: capture.duplicateOfCaptureId }),
                    attentionSignalId: capture.attentionSignalId,
                    reviewedAt: capture.reviewedAt,
                  }
                : capture.processingState === "awaiting_transcript"
                  ? {
                      awaitingTranscriptSince: capture.awaitingTranscriptSince,
                    }
                  : capture.processingState === "transcript_ready"
                    ? {
                        transcript: capture.transcript,
                        audioState: capture.audioState,
                        audioStateChangedAt: capture.audioStateChangedAt,
                      }
                    : capture.processingState === "unclassified"
                      ? {
                          unclassifiedAt: capture.unclassifiedAt,
                          unclassifiedBy: capture.unclassifiedBy,
                          previousReviewReason: capture.previousReviewReason,
                        }
                      : {}),
          version: capture.version,
        })),
        nextCursor,
      },
    });
  }

  private taskList(
    view: ApplicationReadView,
    context: ExecutionContext,
    query: Extract<QueryEnvelope, { queryName: "task.list" }>,
    kernelTime: string,
    freshness: StoreFreshness,
  ): QueryResult {
    const membership = view.getMembership(
      query.workspaceId,
      context.principalId,
    );
    const space = view.getSpace(query.parameters.spaceId);
    if (
      membership === undefined ||
      space?.workspaceId !== query.workspaceId ||
      !this.dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
        spaceId: query.parameters.spaceId,
      }) ||
      !canViewSpace(view, context, query.workspaceId, query.parameters.spaceId)
    ) {
      return this.queryRejected(query, kernelTime, "authorization.denied");
    }
    if (this.consistencyUnavailable(query, freshness)) {
      return this.queryRejected(
        query,
        kernelTime,
        "query.consistency_unavailable",
      );
    }

    const order = query.parameters.orderBy ?? "created_desc";
    const filters = {
      ...(query.parameters.statusIds === undefined
        ? {}
        : { statusIds: query.parameters.statusIds }),
      ...(query.parameters.priorities === undefined
        ? {}
        : { priorities: query.parameters.priorities }),
      ...(query.parameters.scheduled === undefined
        ? {}
        : { scheduled: query.parameters.scheduled }),
      ...(query.parameters.dueBefore === undefined
        ? {}
        : { dueBefore: query.parameters.dueBefore }),
      ...(query.parameters.dueAfter === undefined
        ? {}
        : { dueAfter: query.parameters.dueAfter }),
    };
    let after: TaskPaginationCursor | TaskDuePaginationCursor | undefined;
    if (query.parameters.cursor !== undefined) {
      const decoded = this.dependencies.cursorCodec.decode(
        query.parameters.cursor,
      );
      if (
        decoded?.kind !== (order === "due_asc" ? "task_due" : "task") ||
        (decoded.kind !== "task" && decoded.kind !== "task_due")
      ) {
        return this.queryRejected(query, kernelTime, "query.cursor_invalid");
      }
      after = decoded;
    }
    const limit = query.parameters.limit ?? 50;
    const items = view.listTasks({
      workspaceId: query.workspaceId,
      spaceId: query.parameters.spaceId,
      ...(after === undefined ? {} : { after }),
      limit: limit + 1,
      order,
      ...(Object.keys(filters).length === 0 ? {} : { filters }),
    });
    if (items === undefined) {
      return this.queryRejected(query, kernelTime, "query.cursor_invalid");
    }
    const visibleItems = items.slice(0, limit);
    const projections = visibleItems.map((task) => {
      const status = view.getTaskStatus(task.statusId);
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
          view.getWorkspace(query.workspaceId)?.rootSpaceId === task.spaceId) ||
          assigneeGrant?.status === "active");
      return status?.workspaceId === query.workspaceId
        ? {
            id: task.id,
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
            ...(task.parentTaskId === undefined
              ? {}
              : { parentTaskId: task.parentTaskId }),
            ...(task.fields === undefined ? {} : { fields: task.fields }),
            status: {
              id: status.id,
              label: status.label,
              operationalSemantics: status.operationalSemantics,
              ...(status.state === undefined ? {} : { state: status.state }),
            },
            completionState: task.completionState,
            ...(task.completedAt === undefined
              ? {}
              : { completedAt: task.completedAt }),
            ...(task.sourceCaptureId === undefined
              ? {}
              : { sourceCaptureId: task.sourceCaptureId }),
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
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
          }
        : undefined;
    });
    if (projections.some((projection) => projection === undefined)) {
      return this.queryRejected(query, kernelTime, "query.not_available");
    }
    const last = visibleItems.at(-1);
    const nextCursor =
      items.length > limit && last !== undefined
        ? this.dependencies.cursorCodec.encode(
            order === "due_asc"
              ? {
                  kind: "task_due",
                  dueAt: last.dueAt ?? null,
                  priority: last.priority ?? "normal",
                  orderedAt: last.createdAt,
                  recordId: last.id,
                }
              : {
                  kind: "task",
                  orderedAt: last.createdAt,
                  recordId: last.id,
                },
          )
        : null;

    return QueryResultSchema.parse({
      outcome: "success",
      contractVersion: 1,
      queryId: query.queryId,
      kernelTime,
      freshness: {
        mode: freshness.mode,
        checkpoint: freshness.checkpoint,
        missingCapabilities: freshness.missingCapabilities,
      },
      projection: {
        kind: "task.list",
        items: projections,
        nextCursor,
      },
    });
  }

  private taskAssignmentCandidates(
    view: ApplicationReadView,
    context: ExecutionContext,
    query: Extract<QueryEnvelope, { queryName: "task.assignmentCandidates" }>,
    kernelTime: string,
    freshness: StoreFreshness,
  ): QueryResult {
    const space = view.getSpace(query.parameters.spaceId);
    if (
      space?.workspaceId !== query.workspaceId ||
      !canViewSpace(view, context, query.workspaceId, space.id) ||
      !this.dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
        spaceId: space.id,
      })
    ) {
      return this.queryRejected(query, kernelTime, "authorization.denied");
    }
    if (this.consistencyUnavailable(query, freshness)) {
      return this.queryRejected(
        query,
        kernelTime,
        "query.consistency_unavailable",
      );
    }
    const workspace = view.getWorkspace(query.workspaceId);
    const agentPrincipals = new Set(
      view
        .listAgentGrants(query.workspaceId)
        .map((grant) => grant.agentPrincipalId),
    );
    const candidates = view
      .listMemberships(query.workspaceId)
      .filter((membership) => {
        if (agentPrincipals.has(membership.principalId)) return false;
        if (membership.status === "revoked") return false;
        if (
          membership.role === "owner" &&
          workspace?.rootSpaceId === space.id
        ) {
          return true;
        }
        return (
          view.getSpaceGrantForPrincipal(
            query.workspaceId,
            space.id,
            membership.principalId,
          )?.status === "active"
        );
      })
      .map((membership) => ({
        principalId: membership.principalId,
        displayName: membership.displayName ?? "Workspace member",
        participantKind: membership.role === "guest" ? "guest" : "member",
      }))
      .sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName) ||
          left.principalId.localeCompare(right.principalId),
      );
    return QueryResultSchema.parse({
      outcome: "success",
      contractVersion: 1,
      queryId: query.queryId,
      kernelTime,
      freshness,
      projection: {
        kind: "task.assignmentCandidates",
        spaceId: space.id,
        candidates,
      },
    });
  }

  private auditReceiptQuery(
    view: ApplicationReadView,
    context: ExecutionContext,
    query: Extract<QueryEnvelope, { queryName: "audit.receipt" }>,
    kernelTime: string,
    freshness: StoreFreshness,
  ): QueryResult {
    const receipt = view.getAuditReceipt(query.parameters.receiptId);
    const membership = view.getMembership(
      query.workspaceId,
      context.principalId,
    );
    if (
      receipt === undefined ||
      receipt.workspaceId !== query.workspaceId ||
      membership === undefined ||
      !this.dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: query.workspaceId,
        spaceId: receipt.spaceId,
      }) ||
      !canViewSpace(view, context, query.workspaceId, receipt.spaceId)
    ) {
      return this.queryRejected(query, kernelTime, "query.not_available");
    }
    if (this.consistencyUnavailable(query, freshness)) {
      return this.queryRejected(
        query,
        kernelTime,
        "query.consistency_unavailable",
      );
    }
    return QueryResultSchema.parse({
      outcome: "success",
      contractVersion: 1,
      queryId: query.queryId,
      kernelTime,
      freshness: {
        mode: freshness.mode,
        checkpoint: freshness.checkpoint,
        missingCapabilities: freshness.missingCapabilities,
      },
      projection: {
        kind: "audit.receipt",
        receipt: {
          id: receipt.id,
          principalId: receipt.principalId,
          grantId: receipt.grantId,
          origin: receipt.origin,
          commandId: receipt.commandId,
          commandName: receipt.commandName,
          correlationId: receipt.correlationId,
          affectedRecordIds: receipt.affectedRecordIds,
          recordVersions: receipt.recordVersions,
          changedFields: receipt.changedFields,
          occurredAt: receipt.occurredAt,
          outcome: receipt.outcome,
          ...(receipt.checkpointId === undefined
            ? {}
            : { checkpointId: receipt.checkpointId }),
          ...(receipt.agentRunId === undefined
            ? {}
            : { agentRunId: receipt.agentRunId }),
          ...(receipt.hostRunId === undefined
            ? {}
            : { hostRunId: receipt.hostRunId }),
        },
      },
    });
  }

  private auditReceipt(
    id: AuditReceipt["id"],
    context: ExecutionContext,
    command: CommandEnvelope,
    spaceId: SpaceId,
    affectedRecordIds: readonly string[],
    recordVersions: Readonly<Record<string, number>>,
    changedFields: readonly string[],
    occurredAt: string,
  ): AuditReceipt {
    return {
      id,
      workspaceId: command.workspaceId,
      spaceId,
      principalId: context.principalId,
      grantId: context.grantId,
      origin: context.origin,
      commandId: command.commandId,
      commandName: command.commandName,
      correlationId: command.correlationId,
      affectedRecordIds,
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
    };
  }

  private outcome(
    command: CommandEnvelope,
    kernelTime: string,
    body: OutcomeBody,
  ): CommandOutcome {
    return CommandOutcomeSchema.parse({
      contractVersion: 1,
      commandId: command.commandId,
      correlationId: command.correlationId,
      kernelTime,
      ...body,
    });
  }

  private queryRejected(
    query: QueryEnvelope,
    kernelTime: string,
    diagnosticCode:
      | "authorization.denied"
      | "query.not_available"
      | "query.cursor_invalid"
      | "query.consistency_unavailable",
  ): QueryResult {
    return QueryResultSchema.parse({
      outcome: "rejected",
      contractVersion: 1,
      queryId: query.queryId,
      kernelTime,
      diagnosticCode,
    });
  }

  private consistencyUnavailable(
    query: QueryEnvelope,
    freshness: StoreFreshness,
  ): boolean {
    return (
      query.consistency === "local_authoritative" &&
      freshness.mode !== "local_authoritative"
    );
  }
}
