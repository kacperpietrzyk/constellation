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
} from "@constellation/application";
import type {
  AuditReceiptId,
  CaptureId,
  PrincipalId,
  ProjectId,
  RelationId,
  SpaceId,
  TaskId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";
import type {
  AuditReceipt,
  Capture,
  DomainEvent,
  OutboxEntry,
  Project,
  Space,
  Task,
  TaskProjectRelation,
  TaskStatusDefinition,
  Workspace,
  WorkspaceMembership,
  UndoDescriptor,
} from "@constellation/domain";

export type FailureBoundary =
  | "workspace"
  | "workspace-update"
  | "space"
  | "membership"
  | "task-status"
  | "capture"
  | "capture-update"
  | "task"
  | "task-update"
  | "project"
  | "project-update"
  | "relation"
  | "relation-update"
  | "undo"
  | "event"
  | "audit"
  | "idempotency"
  | "outbox";

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
  readonly taskStatuses: Map<TaskStatusId, TaskStatusDefinition>;
  readonly captures: Map<CaptureId, Capture>;
  readonly tasks: Map<TaskId, Task>;
  readonly projects: Map<ProjectId, Project>;
  readonly relations: Map<RelationId, TaskProjectRelation>;
  readonly undoDescriptors: Map<string, UndoDescriptor>;
  readonly events: Map<string, DomainEvent>;
  readonly auditReceipts: Map<AuditReceiptId, AuditReceipt>;
  readonly idempotencyRecords: Map<string, IdempotencyRecord>;
  readonly outboxEntries: Map<string, OutboxEntry>;
}

const emptyState = (): MutableState => ({
  workspaces: new Map(),
  spaces: new Map(),
  memberships: new Map(),
  taskStatuses: new Map(),
  captures: new Map(),
  tasks: new Map(),
  projects: new Map(),
  relations: new Map(),
  undoDescriptors: new Map(),
  events: new Map(),
  auditReceipts: new Map(),
  idempotencyRecords: new Map(),
  outboxEntries: new Map(),
});

const cloneState = (state: MutableState): MutableState => ({
  workspaces: new Map(state.workspaces),
  spaces: new Map(state.spaces),
  memberships: new Map(state.memberships),
  taskStatuses: new Map(state.taskStatuses),
  captures: new Map(state.captures),
  tasks: new Map(state.tasks),
  projects: new Map(state.projects),
  relations: new Map(state.relations),
  undoDescriptors: new Map(state.undoDescriptors),
  events: new Map(state.events),
  auditReceipts: new Map(state.auditReceipts),
  idempotencyRecords: new Map(state.idempotencyRecords),
  outboxEntries: new Map(state.outboxEntries),
});

const membershipKey = (
  workspaceId: WorkspaceId,
  principalId: PrincipalId,
): string => `${workspaceId}:${principalId}`;

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

  public getCapture(id: CaptureId): Capture | undefined {
    return this.state.captures.get(id);
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
    const tasks = [...this.state.tasks.values()]
      .filter(
        (task) =>
          task.recordState === "active" &&
          task.workspaceId === request.workspaceId &&
          task.spaceId === request.spaceId,
      )
      .sort(compareTaskDescending);
    if (request.after === undefined) {
      return tasks.slice(0, request.limit);
    }
    const cursorIndex = tasks.findIndex(
      (task) =>
        task.id === request.after?.recordId &&
        task.createdAt === request.after.orderedAt,
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

  public insertTaskStatus(status: TaskStatusDefinition): void {
    if (this.state.taskStatuses.has(status.id)) {
      throw new Error(`Duplicate task status ID: ${status.id}`);
    }
    this.state.taskStatuses.set(status.id, status);
    this.failures.reached("task-status");
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
}

export class InMemoryReferenceStore implements ApplicationStore {
  private state = emptyState();
  private freshness: StoreFreshness = {
    mode: "local_authoritative",
    checkpoint: null,
    missingCapabilities: [],
  };

  public constructor(
    public readonly failures: FailureInjector = new FailureInjector(),
  ) {}

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

  public snapshot(): ReferenceStateSnapshot {
    return {
      workspaces: [...this.state.workspaces.values()],
      spaces: [...this.state.spaces.values()],
      memberships: [...this.state.memberships.values()],
      taskStatuses: [...this.state.taskStatuses.values()],
      captures: [...this.state.captures.values()],
      tasks: [...this.state.tasks.values()],
      projects: [...this.state.projects.values()],
      relations: [...this.state.relations.values()],
      undoDescriptors: [...this.state.undoDescriptors.values()],
      events: [...this.state.events.values()],
      auditReceipts: [...this.state.auditReceipts.values()],
      idempotencyRecords: [...this.state.idempotencyRecords.values()],
      outboxEntries: [...this.state.outboxEntries.values()],
    };
  }

  public setFreshness(freshness: StoreFreshness): void {
    this.freshness = freshness;
  }
}
