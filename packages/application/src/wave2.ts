import {
  canCommentInSpace,
  canEditSpace,
  canViewSpace,
  effectiveSpaceAccess,
} from "./collaboration-policy.js";
import {
  AuditReceiptIdSchema,
  CommandOutcomeSchema,
  DocumentIdSchema,
  EventIdSchema,
  OutboxEntryIdSchema,
  ProjectIdSchema,
  QueryResultSchema,
  RelationIdSchema,
  TaskAssignmentIdSchema,
  AttentionSignalIdSchema,
  KnowledgeSourceIdSchema,
  NamedDocumentVersionIdSchema,
  type CommandEnvelope,
  type CommandOutcome,
  type ExecutionContext,
  type QueryEnvelope,
  type QueryResult,
  type SpaceId,
  type WorkspaceId,
} from "@constellation/contracts";
import {
  completeTask,
  assignTask,
  createProject,
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
  restoreTaskProjectRelation,
  setTaskStatus,
  undoCaptureTaskRoute,
  updateProjectOutcome,
  type AuditReceipt,
  type DomainEvent,
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
  type KnowledgeSource,
  type NativeDocument,
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
      | "project.updateOutcome"
      | "task.setStatus"
      | "task.complete"
      | "task.reopen"
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
      | "knowledge.list"
      | "knowledge.documentContext"
      | "project.operationalOverview"
      | "search.global"
      | "cockpit.week"
      | "activity.meaningful"
      | "recovery.preview"
      | "comment.list"
      | "comment.mentionCandidates"
      | "attention.inbox";
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
    case "task.setStatus":
    case "task.complete":
    case "task.reopen":
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
      | "relation"
      | "comment"
      | "attentionSignal"
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
): Task | Project | NativeDocument | undefined =>
  target.kind === "task"
    ? view.getTask(target.taskId)
    : target.kind === "project"
      ? view.getProject(target.projectId)
      : view.getDocument(target.documentId);

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
      let eventType: "task.status_changed" | "task.completed" | "task.reopened";
      let diagnosticCode:
        "task.status_changed" | "task.completed" | "task.reopened";
      if (command.commandName === "task.setStatus") {
        const status = transaction.getTaskStatus(command.payload.statusId);
        if (
          status?.workspaceId !== task.workspaceId ||
          status.id === task.statusId
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
          : ["completionState", "completedAt"],
        { diagnosticCode, projection: taskProjection(diagnosticCode, updated) },
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
      if (task === undefined) return precondition(command, occurredAt);
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
      if (task === undefined || project === undefined)
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
  diagnosticCode: "authorization.denied" | "query.consistency_unavailable",
): QueryResult =>
  QueryResultSchema.parse({
    outcome: "rejected",
    contractVersion: 1,
    queryId: query.queryId,
    kernelTime,
    diagnosticCode,
  });

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
    const record = targetRecord(view, query.parameters.target);
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
        const record = targetRecord(view, signal.destination);
        if (record === undefined) return [];
        return [
          {
            id: signal.id,
            reason: signal.reason,
            destination: signal.destination,
            title: record.title,
            detail:
              signal.reason === "comment_mention"
                ? "You were mentioned in a comment."
                : signal.reason === "task_assignment"
                  ? "You are responsible for this Task."
                  : signal.reason === "knowledge_evidence_changed"
                    ? "Source evidence changed after the latest named version."
                    : "An offline change needs reconciliation.",
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
            : [query.parameters.spaceId];
  if (
    spaceIds.length === 0 ||
    !authorizeSpaces(dependencies, view, context, query, spaceIds)
  ) {
    return queryRejected(query, kernelTime, "authorization.denied");
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
        return source === undefined
          ? []
          : [
              {
                kind: "source" as const,
                recordId: source.id,
                title: source.title,
                currentVersion: source.version,
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
        | "deliverable";
      recordId: string;
      spaceId: SpaceId;
      title: string;
      snippet: string;
      matchedFields: Array<
        | "title"
        | "intendedOutcome"
        | "originalText"
        | "excerpt"
        | "canonicalUrl"
      >;
      score: number;
      updatedAt: string;
    }> = [];
    for (const spaceId of spaceIds) {
      if (kinds.has("task")) {
        for (const task of view.listTasksInSpace(query.workspaceId, spaceId)) {
          const title = normalizeSearch(task.title);
          if (!title.includes(needle)) continue;
          items.push({
            recordKind: "task",
            recordId: task.id,
            spaceId,
            title: task.title,
            snippet: snippet(task.title, needle),
            matchedFields: ["title"],
            score:
              title === needle ? 300 : title.startsWith(needle) ? 220 : 160,
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
      for (const document of view.listDocuments(query.workspaceId, spaceId)) {
        const role = document.role ?? "document";
        if (!kinds.has(role)) continue;
        const title = normalizeSearch(document.title);
        if (!title.includes(needle)) continue;
        items.push({
          recordKind: role,
          recordId: document.id,
          spaceId,
          title: document.title,
          snippet: snippet(document.title, needle),
          matchedFields: ["title"],
          score: title === needle ? 300 : title.startsWith(needle) ? 220 : 160,
          updatedAt: document.updatedAt,
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
        if (
          task.createdAt.slice(0, 10) >= query.parameters.weekStart &&
          task.createdAt.slice(0, 10) <= weekEnd
        )
          reasons.push({ code: "created_this_week", weight: 20 });
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
    "project.created": "project_created",
    "project.outcome_updated": "project_outcome_changed",
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
