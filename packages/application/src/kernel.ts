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
  CaptureIdSchema,
  CommandOutcomeSchema,
  EventIdSchema,
  MembershipIdSchema,
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
  validateCommandEnvelope,
  validateExecutionContext,
  validateQueryEnvelope,
} from "@constellation/contracts";
import {
  createLocalWorkspace,
  renameWorkspace,
  routeCaptureAsTask,
  submitCapture,
  type AuditReceipt,
  type DomainEvent,
  type OutboxEntry,
  type WorkspaceMembership,
} from "@constellation/domain";

import {
  isApplicationWave2Transaction,
  RetryableUnitOfWorkError,
  type ApplicationKernelDependencies,
  type ApplicationReadView,
  type ApplicationTransaction,
  type CurrentAuthorizationPolicy,
  type CapturePaginationCursor,
  type StoreFreshness,
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
    case "workspace.rename": {
      const workspace = view.getWorkspace(command.workspaceId);
      const membership = view.getMembership(
        command.workspaceId,
        context.principalId,
      );
      return (
        workspace !== undefined &&
        authorization.authorize({
          context,
          capability: command.commandName,
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
    case "capture.routeAsTask": {
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
          capability: command.commandName,
          workspaceId: command.workspaceId,
          spaceId: capture.spaceId,
        }) &&
        canEditSpace(view, context, command.workspaceId, capture.spaceId)
      );
    }
    case "project.create":
    case "document.create":
    case "project.updateOutcome":
    case "task.setStatus":
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
        diagnosticCode: "storage.unit_of_work_failed",
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
      case "project.updateOutcome":
      case "task.setStatus":
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

  private submitTextCapture(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "capture.submitText" }>,
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
      originalText: command.payload.originalText,
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
      ["originalText", "deviceId", "source", "processingState"],
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

  private routeCaptureToTask(
    transaction: ApplicationTransaction,
    context: ExecutionContext,
    command: Extract<CommandEnvelope, { commandName: "capture.routeAsTask" }>,
    scope: string,
    fingerprint: string,
    occurredAt: string,
  ): CommandOutcome {
    const workspace = transaction.getWorkspace(command.workspaceId);
    const capture = transaction.getCapture(command.payload.captureId);
    const membership = transaction.getMembership(
      command.workspaceId,
      context.principalId,
    );
    if (
      workspace === undefined ||
      capture?.workspaceId !== workspace.id ||
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
    if (expectedVersion !== capture.version) {
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "record.version_conflict",
        currentVersions: currentVersionMap(capture.id, capture.version),
      });
    }
    if (capture.processingState !== "pending_processing") {
      return this.outcome(command, occurredAt, {
        outcome: "conflict",
        diagnosticCode: "capture.already_routed",
        currentVersions: currentVersionMap(capture.id, capture.version),
      });
    }

    const taskStatus = transaction.getTaskStatus(workspace.defaultTaskStatusId);
    if (taskStatus?.workspaceId !== workspace.id) {
      throw new RetryableUnitOfWorkError(
        "The workspace default task status is unavailable.",
      );
    }

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
      title: command.payload.title,
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
      [routed.capture.id, routed.task.id],
      {
        [routed.capture.id]: routed.capture.version,
        [routed.task.id]: routed.task.version,
      },
      [
        "processingState",
        "derivedTaskId",
        "task.title",
        "task.statusId",
        "task.sourceCaptureId",
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
        case "document.list":
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
          position: status.position,
          version: status.version,
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
        items: visibleItems.map((capture) =>
          capture.processingState === "routed_as_task"
            ? {
                id: capture.id,
                spaceId: capture.spaceId,
                originalText: capture.originalText,
                source: capture.source,
                capturedAt: capture.capturedAt,
                processingState: capture.processingState,
                derivedTaskId: capture.derivedTaskId,
                routedAt: capture.routedAt,
                routedBy: capture.routedBy,
                version: capture.version,
              }
            : {
                id: capture.id,
                spaceId: capture.spaceId,
                originalText: capture.originalText,
                source: capture.source,
                capturedAt: capture.capturedAt,
                processingState: capture.processingState,
                version: capture.version,
              },
        ),
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

    let after: TaskPaginationCursor | undefined;
    if (query.parameters.cursor !== undefined) {
      const decoded = this.dependencies.cursorCodec.decode(
        query.parameters.cursor,
      );
      if (decoded?.kind !== "task") {
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
            status: {
              id: status.id,
              label: status.label,
              operationalSemantics: status.operationalSemantics,
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
        ? this.dependencies.cursorCodec.encode({
            kind: "task",
            orderedAt: last.createdAt,
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
