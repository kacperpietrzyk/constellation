import {
  RetryableUnitOfWorkError,
  type ApplicationReadView,
  type ApplicationStore,
  type ApplicationTransaction,
  type CapturePageRequest,
  type IdempotencyRecord,
  type ReferenceStateSnapshot,
  type StoreFreshness,
  type TaskPageRequest,
} from "./ports.js";
import type {
  AuditReceiptId,
  CaptureId,
  CommandEnvelope,
  DocumentId,
  PrincipalId,
  ProjectId,
  RelationId,
  SpaceId,
  SpaceGrantId,
  TaskId,
  TaskAssignmentId,
  CommentId,
  AttentionSignalId,
  TaskStatusId,
  FieldDefinitionId,
  AutomationRuleId,
  ProjectTemplateId,
  WorkspaceId,
  GrantId,
  AgentRunId,
  CheckpointId,
  KnowledgeSourceId,
  NamedDocumentVersionId,
  StrategicRecordId,
} from "@constellation/contracts";
import {
  compareTasksByDue,
  effectiveTaskPriority,
  taskMatchesFilters,
} from "@constellation/domain";
import type {
  AuditReceipt,
  Capture,
  DomainEvent,
  FieldDefinition,
  AutomationRule,
  ProjectTemplate,
  OutboxEntry,
  Project,
  Space,
  SpaceGrant,
  Task,
  TaskAssignment,
  TaskProjectRelation,
  TaskStatusDefinition,
  Workspace,
  WorkspaceMembership,
  UndoDescriptor,
  RecordComment,
  AttentionSignal,
  NativeDocument,
  AgentAccessGrant,
  AgentRun,
  AgentHandoff,
  AgentCheckpoint,
  KnowledgeSource,
  NamedDocumentVersion,
  StrategicRecord,
  DocumentEntityLink,
} from "@constellation/domain";

export type FailureBoundary =
  | "workspace"
  | "workspace-update"
  | "space"
  | "membership"
  | "membership-update"
  | "space-grant"
  | "space-grant-update"
  | "task-assignment"
  | "task-assignment-update"
  | "comment"
  | "comment-update"
  | "attention-signal"
  | "attention-signal-update"
  | "task-status"
  | "capture"
  | "capture-update"
  | "task"
  | "task-update"
  | "project"
  | "project-update"
  | "document"
  | "document-update"
  | "knowledge-source"
  | "knowledge-source-update"
  | "named-document-version"
  | "named-document-version-update"
  | "strategic-record"
  | "strategic-record-update"
  | "relation"
  | "relation-update"
  | "undo"
  | "event"
  | "audit"
  | "idempotency"
  | "sync-command"
  | "outbox"
  | "agent-grant"
  | "agent-grant-update"
  | "agent-run"
  | "agent-checkpoint"
  | "agent-handoff";

export class FailureInjector {
  private boundary: FailureBoundary | undefined;

  public failAfter(boundary: FailureBoundary): void {
    this.boundary = boundary;
  }

  public clear(): void {
    this.boundary = undefined;
  }

  public reached(boundary: FailureBoundary): void {
    if (this.boundary === boundary) {
      throw new RetryableUnitOfWorkError(
        `Synthetic failure after ${boundary}.`,
      );
    }
  }
}

interface MutableState {
  readonly workspaces: Map<WorkspaceId, Workspace>;
  readonly spaces: Map<SpaceId, Space>;
  readonly memberships: Map<string, WorkspaceMembership>;
  readonly spaceGrants: Map<SpaceGrantId, SpaceGrant>;
  readonly taskAssignments: Map<TaskAssignmentId, TaskAssignment>;
  readonly comments: Map<CommentId, RecordComment>;
  readonly attentionSignals: Map<AttentionSignalId, AttentionSignal>;
  readonly taskStatuses: Map<TaskStatusId, TaskStatusDefinition>;
  readonly fieldDefinitions: Map<FieldDefinitionId, FieldDefinition>;
  readonly projectTemplates: Map<ProjectTemplateId, ProjectTemplate>;
  readonly automationRules: Map<AutomationRuleId, AutomationRule>;
  readonly captures: Map<CaptureId, Capture>;
  readonly tasks: Map<TaskId, Task>;
  readonly projects: Map<ProjectId, Project>;
  readonly documents: Map<DocumentId, NativeDocument>;
  readonly documentEntityLinks: Map<string, DocumentEntityLink>;
  readonly knowledgeSources: Map<KnowledgeSourceId, KnowledgeSource>;
  readonly namedDocumentVersions: Map<
    NamedDocumentVersionId,
    NamedDocumentVersion
  >;
  readonly strategicRecords: Map<StrategicRecordId, StrategicRecord>;
  readonly relations: Map<RelationId, TaskProjectRelation>;
  readonly undoDescriptors: Map<string, UndoDescriptor>;
  readonly events: Map<string, DomainEvent>;
  readonly auditReceipts: Map<AuditReceiptId, AuditReceipt>;
  readonly idempotencyRecords: Map<string, IdempotencyRecord>;
  readonly outboxEntries: Map<string, OutboxEntry>;
  readonly syncCommands: Map<string, CommandEnvelope>;
  readonly agentGrants: Map<GrantId, AgentAccessGrant>;
  readonly agentRuns: Map<AgentRunId, AgentRun>;
  readonly agentCheckpoints: Map<CheckpointId, AgentCheckpoint>;
  readonly agentHandoffs: Map<string, AgentHandoff>;
}

const emptyState = (): MutableState => ({
  workspaces: new Map(),
  spaces: new Map(),
  memberships: new Map(),
  spaceGrants: new Map(),
  taskAssignments: new Map(),
  comments: new Map(),
  attentionSignals: new Map(),
  taskStatuses: new Map(),
  fieldDefinitions: new Map(),
  projectTemplates: new Map(),
  automationRules: new Map(),
  captures: new Map(),
  tasks: new Map(),
  projects: new Map(),
  documents: new Map(),
  documentEntityLinks: new Map(),
  knowledgeSources: new Map(),
  namedDocumentVersions: new Map(),
  strategicRecords: new Map(),
  relations: new Map(),
  undoDescriptors: new Map(),
  events: new Map(),
  auditReceipts: new Map(),
  idempotencyRecords: new Map(),
  outboxEntries: new Map(),
  syncCommands: new Map(),
  agentGrants: new Map(),
  agentRuns: new Map(),
  agentCheckpoints: new Map(),
  agentHandoffs: new Map(),
});

const cloneState = (state: MutableState): MutableState => ({
  workspaces: new Map(state.workspaces),
  spaces: new Map(state.spaces),
  memberships: new Map(state.memberships),
  spaceGrants: new Map(state.spaceGrants),
  taskAssignments: new Map(state.taskAssignments),
  comments: new Map(state.comments),
  attentionSignals: new Map(state.attentionSignals),
  taskStatuses: new Map(state.taskStatuses),
  fieldDefinitions: new Map(state.fieldDefinitions),
  projectTemplates: new Map(state.projectTemplates),
  automationRules: new Map(state.automationRules),
  captures: new Map(state.captures),
  tasks: new Map(state.tasks),
  projects: new Map(state.projects),
  documents: new Map(state.documents),
  documentEntityLinks: new Map(state.documentEntityLinks),
  knowledgeSources: new Map(state.knowledgeSources),
  namedDocumentVersions: new Map(state.namedDocumentVersions),
  strategicRecords: new Map(state.strategicRecords),
  relations: new Map(state.relations),
  undoDescriptors: new Map(state.undoDescriptors),
  events: new Map(state.events),
  auditReceipts: new Map(state.auditReceipts),
  idempotencyRecords: new Map(state.idempotencyRecords),
  outboxEntries: new Map(state.outboxEntries),
  syncCommands: new Map(state.syncCommands),
  agentGrants: new Map(state.agentGrants),
  agentRuns: new Map(state.agentRuns),
  agentCheckpoints: new Map(state.agentCheckpoints),
  agentHandoffs: new Map(state.agentHandoffs),
});

const membershipKey = (
  workspaceId: WorkspaceId,
  principalId: PrincipalId,
): string => `${workspaceId}:${principalId}`;

const grantScopeKey = (
  workspaceId: WorkspaceId,
  spaceId: SpaceId,
  principalId: PrincipalId,
): string => `${workspaceId}:${spaceId}:${principalId}`;

const documentEntityLinkKey = (
  link: Pick<DocumentEntityLink, "documentId" | "targetKind" | "targetId">,
): string => `${link.documentId}:${link.targetKind}:${link.targetId}`;

const compareCaptureDescending = (left: Capture, right: Capture): number => {
  const time = right.capturedAt.localeCompare(left.capturedAt);
  return time === 0 ? right.id.localeCompare(left.id) : time;
};

const compareTaskDescending = (left: Task, right: Task): number => {
  const time = right.createdAt.localeCompare(left.createdAt);
  return time === 0 ? right.id.localeCompare(left.id) : time;
};

class ReadView implements ApplicationReadView {
  public constructor(
    protected readonly state: MutableState,
    private readonly freshness: StoreFreshness,
  ) {}

  public getFreshness(): StoreFreshness {
    return this.freshness;
  }

  public getWorkspace(id: WorkspaceId): Workspace | undefined {
    return this.state.workspaces.get(id);
  }

  public getSpace(id: SpaceId): Space | undefined {
    return this.state.spaces.get(id);
  }

  public listSpaces(workspaceId: WorkspaceId): readonly Space[] {
    return [...this.state.spaces.values()]
      .filter((space) => space.workspaceId === workspaceId)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public getTaskStatus(id: TaskStatusId): TaskStatusDefinition | undefined {
    return this.state.taskStatuses.get(id);
  }

  public getFieldDefinition(
    id: FieldDefinitionId,
  ): FieldDefinition | undefined {
    return this.state.fieldDefinitions.get(id);
  }

  public getProjectTemplate(
    id: ProjectTemplateId,
  ): ProjectTemplate | undefined {
    return this.state.projectTemplates.get(id);
  }

  public getAutomationRule(id: AutomationRuleId): AutomationRule | undefined {
    return this.state.automationRules.get(id);
  }

  public listAutomationRules(
    workspaceId: WorkspaceId,
  ): readonly AutomationRule[] {
    return [...this.state.automationRules.values()]
      .filter((rule) => rule.workspaceId === workspaceId)
      .sort(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      );
  }

  public listProjectTemplates(
    workspaceId: WorkspaceId,
  ): readonly ProjectTemplate[] {
    return [...this.state.projectTemplates.values()]
      .filter((template) => template.workspaceId === workspaceId)
      .sort(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      );
  }

  public listFieldDefinitions(
    workspaceId: WorkspaceId,
  ): readonly FieldDefinition[] {
    return [...this.state.fieldDefinitions.values()]
      .filter((definition) => definition.workspaceId === workspaceId)
      .sort(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      );
  }

  public listTaskStatuses(
    workspaceId: WorkspaceId,
  ): readonly TaskStatusDefinition[] {
    return [...this.state.taskStatuses.values()]
      .filter((status) => status.workspaceId === workspaceId)
      .sort(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      );
  }

  public getMembership(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
  ): WorkspaceMembership | undefined {
    return this.state.memberships.get(membershipKey(workspaceId, principalId));
  }

  public listMemberships(
    workspaceId: WorkspaceId,
  ): readonly WorkspaceMembership[] {
    return [...this.state.memberships.values()]
      .filter((membership) => membership.workspaceId === workspaceId)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public getSpaceGrant(id: SpaceGrantId): SpaceGrant | undefined {
    return this.state.spaceGrants.get(id);
  }

  public getSpaceGrantForPrincipal(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    principalId: PrincipalId,
  ): SpaceGrant | undefined {
    const key = grantScopeKey(workspaceId, spaceId, principalId);
    return [...this.state.spaceGrants.values()].find(
      (grant) =>
        grantScopeKey(grant.workspaceId, grant.spaceId, grant.principalId) ===
        key,
    );
  }

  public listSpaceGrants(
    workspaceId: WorkspaceId,
    principalId?: PrincipalId,
  ): readonly SpaceGrant[] {
    return [...this.state.spaceGrants.values()]
      .filter(
        (grant) =>
          grant.workspaceId === workspaceId &&
          (principalId === undefined || grant.principalId === principalId),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public getTaskAssignment(id: TaskAssignmentId): TaskAssignment | undefined {
    return this.state.taskAssignments.get(id);
  }

  public getActiveTaskAssignment(taskId: TaskId): TaskAssignment | undefined {
    return [...this.state.taskAssignments.values()].find(
      (assignment) =>
        assignment.taskId === taskId && assignment.state === "active",
    );
  }

  public listTaskAssignments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly TaskAssignment[] {
    return [...this.state.taskAssignments.values()]
      .filter(
        (assignment) =>
          assignment.workspaceId === workspaceId &&
          assignment.spaceId === spaceId,
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public getComment(id: CommentId): RecordComment | undefined {
    return this.state.comments.get(id);
  }

  public listComments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly RecordComment[] {
    return [...this.state.comments.values()]
      .filter(
        (comment) =>
          comment.workspaceId === workspaceId && comment.spaceId === spaceId,
      )
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      );
  }

  public getAttentionSignal(
    id: AttentionSignalId,
  ): AttentionSignal | undefined {
    return this.state.attentionSignals.get(id);
  }

  public findAttentionSignalByDeduplicationKey(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
    deduplicationKey: string,
  ): AttentionSignal | undefined {
    return [...this.state.attentionSignals.values()].find(
      (signal) =>
        signal.workspaceId === workspaceId &&
        signal.targetPrincipalId === principalId &&
        signal.deduplicationKey === deduplicationKey,
    );
  }

  public listAttentionSignals(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
  ): readonly AttentionSignal[] {
    return [...this.state.attentionSignals.values()]
      .filter(
        (signal) =>
          signal.workspaceId === workspaceId &&
          signal.targetPrincipalId === principalId,
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.id.localeCompare(left.id),
      );
  }

  public getCapture(id: CaptureId): Capture | undefined {
    return this.state.captures.get(id);
  }

  public listCapturesInSpace(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly Capture[] {
    return [...this.state.captures.values()].filter(
      (capture) =>
        capture.workspaceId === workspaceId && capture.spaceId === spaceId,
    );
  }

  public listCaptures(
    request: CapturePageRequest,
  ): readonly Capture[] | undefined {
    const captures = [...this.state.captures.values()]
      .filter(
        (capture) =>
          capture.workspaceId === request.workspaceId &&
          capture.spaceId === request.spaceId,
      )
      .sort(compareCaptureDescending);
    if (request.after === undefined) {
      return captures.slice(0, request.limit);
    }
    const cursorIndex = captures.findIndex(
      (capture) =>
        capture.id === request.after?.recordId &&
        capture.capturedAt === request.after.orderedAt,
    );
    return cursorIndex < 0
      ? undefined
      : captures.slice(cursorIndex + 1, cursorIndex + 1 + request.limit);
  }

  public getTask(id: TaskId): Task | undefined {
    return this.state.tasks.get(id);
  }

  public listTasksInSpace(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly Task[] {
    return [...this.state.tasks.values()]
      .filter(
        (task) =>
          task.recordState === "active" &&
          task.workspaceId === workspaceId &&
          task.spaceId === spaceId,
      )
      .sort(compareTaskDescending);
  }

  public getProject(id: ProjectId): Project | undefined {
    return this.state.projects.get(id);
  }

  public listProjects(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly Project[] {
    return [...this.state.projects.values()]
      .filter(
        (project) =>
          project.workspaceId === workspaceId && project.spaceId === spaceId,
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.id.localeCompare(left.id),
      );
  }

  public getDocument(id: DocumentId): NativeDocument | undefined {
    return this.state.documents.get(id);
  }

  public listDocuments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly NativeDocument[] {
    return [...this.state.documents.values()]
      .filter(
        (document) =>
          document.workspaceId === workspaceId && document.spaceId === spaceId,
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.id.localeCompare(left.id),
      );
  }

  public listDocumentEntityLinks(
    workspaceId: WorkspaceId,
    targetKind?: DocumentEntityLink["targetKind"],
    targetId?: string,
  ): readonly DocumentEntityLink[] {
    return [...this.state.documentEntityLinks.values()]
      .filter(
        (link) =>
          link.workspaceId === workspaceId &&
          (targetKind === undefined || link.targetKind === targetKind) &&
          (targetId === undefined || link.targetId === targetId),
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.documentId.localeCompare(right.documentId),
      );
  }

  public searchDocumentBodies(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    text: string,
    limit: number,
  ): readonly { readonly documentId: DocumentId; readonly snippet: string }[] {
    // Collaborative document bytes live outside the reference store. The
    // durable SQLite view supplies this rebuildable projection in production.
    void workspaceId;
    void spaceId;
    void text;
    void limit;
    return [];
  }

  public getKnowledgeSource(
    id: KnowledgeSourceId,
  ): KnowledgeSource | undefined {
    return this.state.knowledgeSources.get(id);
  }

  public listKnowledgeSources(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly KnowledgeSource[] {
    return [...this.state.knowledgeSources.values()]
      .filter(
        (source) =>
          source.workspaceId === workspaceId && source.spaceId === spaceId,
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.id.localeCompare(left.id),
      );
  }

  public getNamedDocumentVersion(
    id: NamedDocumentVersionId,
  ): NamedDocumentVersion | undefined {
    return this.state.namedDocumentVersions.get(id);
  }

  public listNamedDocumentVersions(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    documentId?: DocumentId,
  ): readonly NamedDocumentVersion[] {
    return [...this.state.namedDocumentVersions.values()]
      .filter(
        (version) =>
          version.workspaceId === workspaceId &&
          version.spaceId === spaceId &&
          (documentId === undefined || version.documentId === documentId),
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id),
      );
  }

  public getStrategicRecord(
    id: StrategicRecordId,
  ): StrategicRecord | undefined {
    return this.state.strategicRecords.get(id);
  }

  public listStrategicRecords(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly StrategicRecord[] {
    return [...this.state.strategicRecords.values()]
      .filter(
        (record) =>
          record.workspaceId === workspaceId && record.spaceId === spaceId,
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.id.localeCompare(right.id),
      );
  }

  public getRelation(id: RelationId): TaskProjectRelation | undefined {
    return this.state.relations.get(id);
  }

  public findTaskProjectRelation(
    taskId: TaskId,
    projectId: ProjectId,
  ): TaskProjectRelation | undefined {
    return [...this.state.relations.values()].find(
      (relation) =>
        relation.state === "active" &&
        relation.taskId === taskId &&
        relation.projectId === projectId,
    );
  }

  public listRelations(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly TaskProjectRelation[] {
    return [...this.state.relations.values()]
      .filter(
        (relation) =>
          relation.state === "active" &&
          relation.workspaceId === workspaceId &&
          relation.spaceId === spaceId,
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public listEvents(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly DomainEvent[] {
    return [...this.state.events.values()]
      .filter(
        (event) =>
          event.workspaceId === workspaceId && event.spaceId === spaceId,
      )
      .sort(
        (left, right) =>
          right.occurredAt.localeCompare(left.occurredAt) ||
          right.id.localeCompare(left.id),
      );
  }

  public getAuditReceiptByCommand(commandId: string): AuditReceipt | undefined {
    return [...this.state.auditReceipts.values()].find(
      (receipt) => receipt.commandId === commandId,
    );
  }

  public getUndoDescriptor(commandId: string): UndoDescriptor | undefined {
    return this.state.undoDescriptors.get(commandId);
  }

  public listTasks(request: TaskPageRequest): readonly Task[] | undefined {
    const dueOrder = request.order === "due_asc";
    const tasks = [...this.state.tasks.values()]
      .filter(
        (task) =>
          task.recordState === "active" &&
          task.workspaceId === request.workspaceId &&
          task.spaceId === request.spaceId &&
          (request.filters === undefined ||
            taskMatchesFilters(task, request.filters)),
      )
      .sort(dueOrder ? compareTasksByDue : compareTaskDescending);
    if (request.after === undefined) {
      return tasks.slice(0, request.limit);
    }
    const after = request.after;
    if (dueOrder !== (after.kind === "task_due")) return undefined;
    const cursorIndex = tasks.findIndex(
      (task) =>
        task.id === after.recordId &&
        task.createdAt === after.orderedAt &&
        (after.kind !== "task_due" ||
          ((task.dueAt ?? null) === after.dueAt &&
            effectiveTaskPriority(task) === after.priority)),
    );
    return cursorIndex < 0
      ? undefined
      : tasks.slice(cursorIndex + 1, cursorIndex + 1 + request.limit);
  }

  public getAuditReceipt(id: AuditReceiptId): AuditReceipt | undefined {
    return this.state.auditReceipts.get(id);
  }

  public getIdempotency(scope: string): IdempotencyRecord | undefined {
    return this.state.idempotencyRecords.get(scope);
  }

  public getAgentGrant(id: GrantId): AgentAccessGrant | undefined {
    return this.state.agentGrants.get(id);
  }

  public listAgentGrants(
    workspaceId: WorkspaceId,
  ): readonly AgentAccessGrant[] {
    return [...this.state.agentGrants.values()]
      .filter((grant) => grant.workspaceId === workspaceId)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public getAgentRun(id: AgentRunId): AgentRun | undefined {
    return this.state.agentRuns.get(id);
  }

  public getAgentCheckpoint(id: CheckpointId): AgentCheckpoint | undefined {
    return this.state.agentCheckpoints.get(id);
  }

  public listAgentHandoffs(runId: AgentRunId): readonly AgentHandoff[] {
    return [...this.state.agentHandoffs.values()]
      .filter((handoff) => handoff.runId === runId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}

class Transaction extends ReadView implements ApplicationTransaction {
  public constructor(
    state: MutableState,
    private readonly failures: FailureInjector,
    freshness: StoreFreshness,
  ) {
    super(state, freshness);
  }

  public insertWorkspace(workspace: Workspace): void {
    if (this.state.workspaces.has(workspace.id)) {
      throw new Error(`Duplicate workspace ID: ${workspace.id}`);
    }
    this.state.workspaces.set(workspace.id, workspace);
    this.failures.reached("workspace");
  }

  public updateWorkspace(
    workspace: Workspace,
    expectedVersion: number,
  ): boolean {
    const current = this.state.workspaces.get(workspace.id);
    if (current?.version !== expectedVersion) {
      return false;
    }
    this.state.workspaces.set(workspace.id, workspace);
    this.failures.reached("workspace-update");
    return true;
  }

  public insertSpace(space: Space): void {
    if (this.state.spaces.has(space.id)) {
      throw new Error(`Duplicate Space ID: ${space.id}`);
    }
    this.state.spaces.set(space.id, space);
    this.failures.reached("space");
  }

  public insertMembership(membership: WorkspaceMembership): void {
    const key = membershipKey(membership.workspaceId, membership.principalId);
    if (this.state.memberships.has(key)) {
      throw new Error(`Duplicate membership scope: ${key}`);
    }
    this.state.memberships.set(key, membership);
    this.failures.reached("membership");
  }

  public updateMembership(
    membership: WorkspaceMembership,
    expectedVersion: number,
  ): boolean {
    const key = membershipKey(membership.workspaceId, membership.principalId);
    const current = this.state.memberships.get(key);
    if (current?.id !== membership.id || current.version !== expectedVersion)
      return false;
    this.state.memberships.set(key, membership);
    this.failures.reached("membership-update");
    return true;
  }

  public insertSpaceGrant(grant: SpaceGrant): void {
    if (
      this.state.spaceGrants.has(grant.id) ||
      this.getSpaceGrantForPrincipal(
        grant.workspaceId,
        grant.spaceId,
        grant.principalId,
      ) !== undefined
    ) {
      throw new Error(`Duplicate Space grant scope: ${grant.id}`);
    }
    this.state.spaceGrants.set(grant.id, grant);
    this.failures.reached("space-grant");
  }

  public updateSpaceGrant(grant: SpaceGrant, expectedVersion: number): boolean {
    const current = this.state.spaceGrants.get(grant.id);
    if (current?.version !== expectedVersion) return false;
    this.state.spaceGrants.set(grant.id, grant);
    this.failures.reached("space-grant-update");
    return true;
  }

  public insertTaskAssignment(assignment: TaskAssignment): void {
    if (
      this.state.taskAssignments.has(assignment.id) ||
      (assignment.state === "active" &&
        this.getActiveTaskAssignment(assignment.taskId) !== undefined)
    ) {
      throw new Error(`Duplicate active Task assignment: ${assignment.taskId}`);
    }
    this.state.taskAssignments.set(assignment.id, assignment);
    this.failures.reached("task-assignment");
  }

  public updateTaskAssignment(
    assignment: TaskAssignment,
    expectedVersion: number,
  ): boolean {
    const current = this.state.taskAssignments.get(assignment.id);
    if (current?.version !== expectedVersion) return false;
    this.state.taskAssignments.set(assignment.id, assignment);
    this.failures.reached("task-assignment-update");
    return true;
  }

  public insertComment(comment: RecordComment): void {
    if (this.state.comments.has(comment.id))
      throw new Error(`Duplicate comment ID: ${comment.id}`);
    this.state.comments.set(comment.id, comment);
    this.failures.reached("comment");
  }

  public updateComment(
    comment: RecordComment,
    expectedVersion: number,
  ): boolean {
    const current = this.state.comments.get(comment.id);
    if (current?.version !== expectedVersion) return false;
    this.state.comments.set(comment.id, comment);
    this.failures.reached("comment-update");
    return true;
  }

  public insertAttentionSignal(signal: AttentionSignal): void {
    if (
      this.state.attentionSignals.has(signal.id) ||
      this.findAttentionSignalByDeduplicationKey(
        signal.workspaceId,
        signal.targetPrincipalId,
        signal.deduplicationKey,
      ) !== undefined
    )
      throw new Error(`Duplicate attention signal: ${signal.id}`);
    this.state.attentionSignals.set(signal.id, signal);
    this.failures.reached("attention-signal");
  }

  public updateAttentionSignal(
    signal: AttentionSignal,
    expectedVersion: number,
  ): boolean {
    const current = this.state.attentionSignals.get(signal.id);
    if (current?.version !== expectedVersion) return false;
    this.state.attentionSignals.set(signal.id, signal);
    this.failures.reached("attention-signal-update");
    return true;
  }

  public insertProjectTemplate(template: ProjectTemplate): void {
    if (this.state.projectTemplates.has(template.id)) {
      throw new Error(`Duplicate project template ID: ${template.id}`);
    }
    this.state.projectTemplates.set(template.id, template);
  }

  public updateProjectTemplate(
    template: ProjectTemplate,
    expectedVersion: number,
  ): boolean {
    const current = this.state.projectTemplates.get(template.id);
    if (current === undefined || current.version !== expectedVersion) {
      return false;
    }
    this.state.projectTemplates.set(template.id, template);
    return true;
  }

  public insertAutomationRule(rule: AutomationRule): void {
    if (this.state.automationRules.has(rule.id)) {
      throw new Error(`Duplicate automation rule ID: ${rule.id}`);
    }
    this.state.automationRules.set(rule.id, rule);
  }

  public updateAutomationRule(
    rule: AutomationRule,
    expectedVersion: number,
  ): boolean {
    const current = this.state.automationRules.get(rule.id);
    if (current === undefined || current.version !== expectedVersion) {
      return false;
    }
    this.state.automationRules.set(rule.id, rule);
    return true;
  }

  public insertFieldDefinition(definition: FieldDefinition): void {
    if (this.state.fieldDefinitions.has(definition.id)) {
      throw new Error(`Duplicate field definition ID: ${definition.id}`);
    }
    this.state.fieldDefinitions.set(definition.id, definition);
  }

  public updateFieldDefinition(
    definition: FieldDefinition,
    expectedVersion: number,
  ): boolean {
    const current = this.state.fieldDefinitions.get(definition.id);
    if (current === undefined || current.version !== expectedVersion) {
      return false;
    }
    this.state.fieldDefinitions.set(definition.id, definition);
    return true;
  }

  public insertTaskStatus(status: TaskStatusDefinition): void {
    if (this.state.taskStatuses.has(status.id)) {
      throw new Error(`Duplicate task status ID: ${status.id}`);
    }
    this.state.taskStatuses.set(status.id, status);
    this.failures.reached("task-status");
  }

  public updateTaskStatus(
    status: TaskStatusDefinition,
    expectedVersion: number,
  ): boolean {
    const current = this.state.taskStatuses.get(status.id);
    if (current === undefined || current.version !== expectedVersion) {
      return false;
    }
    this.state.taskStatuses.set(status.id, status);
    this.failures.reached("task-status");
    return true;
  }

  public insertCapture(capture: Capture): void {
    if (this.state.captures.has(capture.id)) {
      throw new Error(`Duplicate capture ID: ${capture.id}`);
    }
    this.state.captures.set(capture.id, capture);
    this.failures.reached("capture");
  }

  public updateCapture(capture: Capture, expectedVersion: number): boolean {
    const current = this.state.captures.get(capture.id);
    if (current?.version !== expectedVersion) {
      return false;
    }
    this.state.captures.set(capture.id, capture);
    this.failures.reached("capture-update");
    return true;
  }

  public insertTask(task: Task): void {
    if (this.state.tasks.has(task.id)) {
      throw new Error(`Duplicate task ID: ${task.id}`);
    }
    this.state.tasks.set(task.id, task);
    this.failures.reached("task");
  }

  public updateTask(task: Task, expectedVersion: number): boolean {
    const current = this.state.tasks.get(task.id);
    if (current?.version !== expectedVersion) return false;
    this.state.tasks.set(task.id, task);
    this.failures.reached("task-update");
    return true;
  }

  public insertProject(project: Project): void {
    if (this.state.projects.has(project.id))
      throw new Error(`Duplicate project ID: ${project.id}`);
    this.state.projects.set(project.id, project);
    this.failures.reached("project");
  }

  public updateProject(project: Project, expectedVersion: number): boolean {
    const current = this.state.projects.get(project.id);
    if (current?.version !== expectedVersion) return false;
    this.state.projects.set(project.id, project);
    this.failures.reached("project-update");
    return true;
  }

  public insertDocument(document: NativeDocument): void {
    if (this.state.documents.has(document.id)) {
      throw new Error(`Duplicate document ID: ${document.id}`);
    }
    this.state.documents.set(document.id, document);
    this.failures.reached("document");
  }

  public updateDocument(
    document: NativeDocument,
    expectedVersion: number,
  ): boolean {
    const current = this.state.documents.get(document.id);
    if (current?.version !== expectedVersion) return false;
    this.state.documents.set(document.id, document);
    this.failures.reached("document-update");
    return true;
  }

  public insertKnowledgeSource(source: KnowledgeSource): void {
    if (this.state.knowledgeSources.has(source.id)) {
      throw new Error(`Duplicate knowledge source ID: ${source.id}`);
    }
    this.state.knowledgeSources.set(source.id, source);
    this.failures.reached("knowledge-source");
  }

  public updateKnowledgeSource(
    source: KnowledgeSource,
    expectedVersion: number,
  ): boolean {
    const current = this.state.knowledgeSources.get(source.id);
    if (current?.version !== expectedVersion) return false;
    this.state.knowledgeSources.set(source.id, source);
    this.failures.reached("knowledge-source-update");
    return true;
  }

  public insertNamedDocumentVersion(version: NamedDocumentVersion): void {
    if (this.state.namedDocumentVersions.has(version.id)) {
      throw new Error(`Duplicate named document version ID: ${version.id}`);
    }
    this.state.namedDocumentVersions.set(version.id, version);
    this.failures.reached("named-document-version");
  }

  public updateNamedDocumentVersion(
    version: NamedDocumentVersion,
    expectedVersion: number,
  ): boolean {
    const current = this.state.namedDocumentVersions.get(version.id);
    if (current?.version !== expectedVersion) return false;
    this.state.namedDocumentVersions.set(version.id, version);
    this.failures.reached("named-document-version-update");
    return true;
  }

  public insertStrategicRecord(record: StrategicRecord): void {
    if (this.state.strategicRecords.has(record.id)) {
      throw new Error(`Duplicate strategic record ID: ${record.id}`);
    }
    this.state.strategicRecords.set(record.id, record);
    this.failures.reached("strategic-record");
  }

  public updateStrategicRecord(
    record: StrategicRecord,
    expectedVersion: number,
  ): boolean {
    const current = this.state.strategicRecords.get(record.id);
    if (current?.version !== expectedVersion) return false;
    this.state.strategicRecords.set(record.id, record);
    this.failures.reached("strategic-record-update");
    return true;
  }

  public insertRelation(relation: TaskProjectRelation): void {
    if (this.state.relations.has(relation.id))
      throw new Error(`Duplicate relation ID: ${relation.id}`);
    this.state.relations.set(relation.id, relation);
    this.failures.reached("relation");
  }

  public updateRelation(
    relation: TaskProjectRelation,
    expectedVersion: number,
  ): boolean {
    const current = this.state.relations.get(relation.id);
    if (current?.version !== expectedVersion) return false;
    this.state.relations.set(relation.id, relation);
    this.failures.reached("relation-update");
    return true;
  }

  public insertUndoDescriptor(descriptor: UndoDescriptor): void {
    if (this.state.undoDescriptors.has(descriptor.targetCommandId)) {
      throw new Error(
        `Duplicate undo descriptor: ${descriptor.targetCommandId}`,
      );
    }
    this.state.undoDescriptors.set(descriptor.targetCommandId, descriptor);
    this.failures.reached("undo");
  }

  public updateUndoDescriptor(descriptor: UndoDescriptor): void {
    if (!this.state.undoDescriptors.has(descriptor.targetCommandId)) {
      throw new Error(`Missing undo descriptor: ${descriptor.targetCommandId}`);
    }
    this.state.undoDescriptors.set(descriptor.targetCommandId, descriptor);
    this.failures.reached("undo");
  }

  public insertEvent(event: DomainEvent): void {
    if (this.state.events.has(event.id)) {
      throw new Error(`Duplicate event ID: ${event.id}`);
    }
    this.state.events.set(event.id, event);
    this.failures.reached("event");
  }

  public insertAuditReceipt(receipt: AuditReceipt): void {
    if (this.state.auditReceipts.has(receipt.id)) {
      throw new Error(`Duplicate audit receipt ID: ${receipt.id}`);
    }
    this.state.auditReceipts.set(receipt.id, receipt);
    this.failures.reached("audit");
  }

  public insertIdempotency(record: IdempotencyRecord): void {
    if (this.state.idempotencyRecords.has(record.scope)) {
      throw new Error(`Duplicate idempotency scope: ${record.scope}`);
    }
    this.state.idempotencyRecords.set(record.scope, record);
    this.failures.reached("idempotency");
  }

  public insertOutbox(entry: OutboxEntry): void {
    if (this.state.outboxEntries.has(entry.id)) {
      throw new Error(`Duplicate outbox entry ID: ${entry.id}`);
    }
    this.state.outboxEntries.set(entry.id, entry);
    this.failures.reached("outbox");
  }

  public insertSyncCommand(command: CommandEnvelope): void {
    if (this.state.syncCommands.has(command.commandId)) {
      throw new Error(`Duplicate sync command: ${command.commandId}`);
    }
    this.state.syncCommands.set(command.commandId, command);
    this.failures.reached("sync-command");
  }

  public insertAgentGrant(grant: AgentAccessGrant): void {
    if (this.state.agentGrants.has(grant.id))
      throw new Error(`Duplicate agent grant: ${grant.id}`);
    this.state.agentGrants.set(grant.id, grant);
    this.failures.reached("agent-grant");
  }

  public updateAgentGrant(
    grant: AgentAccessGrant,
    expectedVersion: number,
  ): boolean {
    if (this.state.agentGrants.get(grant.id)?.version !== expectedVersion)
      return false;
    this.state.agentGrants.set(grant.id, grant);
    this.failures.reached("agent-grant-update");
    return true;
  }

  public insertAgentRun(run: AgentRun): void {
    if (this.state.agentRuns.has(run.id))
      throw new Error(`Duplicate agent run: ${run.id}`);
    this.state.agentRuns.set(run.id, run);
    this.failures.reached("agent-run");
  }

  public updateAgentRun(run: AgentRun): void {
    if (!this.state.agentRuns.has(run.id))
      throw new Error(`Missing agent run: ${run.id}`);
    this.state.agentRuns.set(run.id, run);
    this.failures.reached("agent-run");
  }

  public insertAgentCheckpoint(checkpoint: AgentCheckpoint): void {
    if (this.state.agentCheckpoints.has(checkpoint.id))
      throw new Error(`Duplicate agent checkpoint: ${checkpoint.id}`);
    this.state.agentCheckpoints.set(checkpoint.id, checkpoint);
    this.failures.reached("agent-checkpoint");
  }

  public updateAgentCheckpoint(checkpoint: AgentCheckpoint): void {
    if (!this.state.agentCheckpoints.has(checkpoint.id))
      throw new Error(`Missing agent checkpoint: ${checkpoint.id}`);
    this.state.agentCheckpoints.set(checkpoint.id, checkpoint);
    this.failures.reached("agent-checkpoint");
  }

  public insertAgentHandoff(handoff: AgentHandoff): void {
    if (this.state.agentHandoffs.has(handoff.id))
      throw new Error(`Duplicate agent handoff: ${handoff.id}`);
    this.state.agentHandoffs.set(handoff.id, handoff);
    this.failures.reached("agent-handoff");
  }
}

const stateFromSnapshot = (snapshot: ReferenceStateSnapshot): MutableState => ({
  workspaces: new Map(snapshot.workspaces.map((value) => [value.id, value])),
  spaces: new Map(snapshot.spaces.map((value) => [value.id, value])),
  memberships: new Map(
    snapshot.memberships.map((value) => [
      membershipKey(value.workspaceId, value.principalId),
      value,
    ]),
  ),
  spaceGrants: new Map(
    (snapshot.spaceGrants ?? []).map((value) => [value.id, value]),
  ),
  taskAssignments: new Map(
    (snapshot.taskAssignments ?? []).map((value) => [value.id, value]),
  ),
  comments: new Map(
    (snapshot.comments ?? []).map((value) => [value.id, value]),
  ),
  attentionSignals: new Map(
    (snapshot.attentionSignals ?? []).map((value) => [value.id, value]),
  ),
  taskStatuses: new Map(
    snapshot.taskStatuses.map((value) => [value.id, value]),
  ),
  fieldDefinitions: new Map(
    (snapshot.fieldDefinitions ?? []).map((value) => [value.id, value]),
  ),
  projectTemplates: new Map(
    (snapshot.projectTemplates ?? []).map((value) => [value.id, value]),
  ),
  automationRules: new Map(
    (snapshot.automationRules ?? []).map((value) => [value.id, value]),
  ),
  captures: new Map(snapshot.captures.map((value) => [value.id, value])),
  tasks: new Map(snapshot.tasks.map((value) => [value.id, value])),
  projects: new Map(snapshot.projects.map((value) => [value.id, value])),
  documents: new Map(
    (snapshot.documents ?? []).map((value) => [value.id, value]),
  ),
  documentEntityLinks: new Map(),
  knowledgeSources: new Map(
    (snapshot.knowledgeSources ?? []).map((value) => [value.id, value]),
  ),
  namedDocumentVersions: new Map(
    (snapshot.namedDocumentVersions ?? []).map((value) => [value.id, value]),
  ),
  strategicRecords: new Map(
    (snapshot.strategicRecords ?? []).map((value) => [value.id, value]),
  ),
  relations: new Map(snapshot.relations.map((value) => [value.id, value])),
  undoDescriptors: new Map(
    snapshot.undoDescriptors.map((value) => [value.targetCommandId, value]),
  ),
  events: new Map(snapshot.events.map((value) => [value.id, value])),
  auditReceipts: new Map(
    snapshot.auditReceipts.map((value) => [value.id, value]),
  ),
  idempotencyRecords: new Map(
    snapshot.idempotencyRecords.map((value) => [value.scope, value]),
  ),
  outboxEntries: new Map(
    snapshot.outboxEntries.map((value) => [value.id, value]),
  ),
  syncCommands: new Map(),
  agentGrants: new Map(
    (snapshot.agentGrants ?? []).map((value) => [value.id, value]),
  ),
  agentRuns: new Map(
    (snapshot.agentRuns ?? []).map((value) => [value.id, value]),
  ),
  agentCheckpoints: new Map(
    (snapshot.agentCheckpoints ?? []).map((value) => [value.id, value]),
  ),
  agentHandoffs: new Map(
    (snapshot.agentHandoffs ?? []).map((value) => [value.id, value]),
  ),
});

export class InMemoryReferenceStore implements ApplicationStore {
  private state: MutableState;
  private freshness: StoreFreshness = {
    mode: "local_authoritative",
    checkpoint: null,
    missingCapabilities: [],
  };

  public constructor(
    public readonly failures: FailureInjector = new FailureInjector(),
    initial?: ReferenceStateSnapshot,
  ) {
    this.state =
      initial === undefined ? emptyState() : stateFromSnapshot(initial);
  }

  public read<Result>(read: (view: ApplicationReadView) => Result): Result {
    return read(new ReadView(this.state, this.freshness));
  }

  public transact<Result>(
    work: (transaction: ApplicationTransaction) => Result,
  ): Result {
    const candidate = cloneState(this.state);
    const result = work(
      new Transaction(candidate, this.failures, this.freshness),
    );
    this.state = candidate;
    return result;
  }

  public replaceDocumentEntityLinks(
    documentId: DocumentId,
    links: readonly DocumentEntityLink[],
  ): void {
    for (const [key, link] of this.state.documentEntityLinks) {
      if (link.documentId === documentId)
        this.state.documentEntityLinks.delete(key);
    }
    for (const link of links) {
      if (link.documentId !== documentId)
        throw new Error("Document entity link scope is invalid.");
      this.state.documentEntityLinks.set(documentEntityLinkKey(link), link);
    }
  }

  public snapshot(): ReferenceStateSnapshot {
    return {
      workspaces: [...this.state.workspaces.values()],
      spaces: [...this.state.spaces.values()],
      memberships: [...this.state.memberships.values()],
      spaceGrants: [...this.state.spaceGrants.values()],
      taskAssignments: [...this.state.taskAssignments.values()],
      comments: [...this.state.comments.values()],
      attentionSignals: [...this.state.attentionSignals.values()],
      taskStatuses: [...this.state.taskStatuses.values()],
      fieldDefinitions: [...this.state.fieldDefinitions.values()],
      projectTemplates: [...this.state.projectTemplates.values()],
      automationRules: [...this.state.automationRules.values()],
      captures: [...this.state.captures.values()],
      tasks: [...this.state.tasks.values()],
      projects: [...this.state.projects.values()],
      documents: [...this.state.documents.values()],
      knowledgeSources: [...this.state.knowledgeSources.values()],
      namedDocumentVersions: [...this.state.namedDocumentVersions.values()],
      strategicRecords: [...this.state.strategicRecords.values()],
      relations: [...this.state.relations.values()],
      undoDescriptors: [...this.state.undoDescriptors.values()],
      events: [...this.state.events.values()],
      auditReceipts: [...this.state.auditReceipts.values()],
      idempotencyRecords: [...this.state.idempotencyRecords.values()],
      outboxEntries: [...this.state.outboxEntries.values()],
      agentGrants: [...this.state.agentGrants.values()],
      agentRuns: [...this.state.agentRuns.values()],
      agentCheckpoints: [...this.state.agentCheckpoints.values()],
      agentHandoffs: [...this.state.agentHandoffs.values()],
    };
  }

  public setFreshness(freshness: StoreFreshness): void {
    this.freshness = freshness;
  }
}
