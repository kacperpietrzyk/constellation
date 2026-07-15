import type {
  CommandEnvelope,
  AuditReceiptId,
  Capability,
  CaptureId,
  CommandOutcome,
  DocumentId,
  EventId,
  ExecutionContext,
  MembershipId,
  SpaceGrantId,
  OutboxEntryId,
  PrincipalId,
  ProjectId,
  RelationId,
  SpaceId,
  TaskId,
  TaskAssignmentId,
  CommentId,
  AttentionSignalId,
  TaskStatusId,
  WorkspaceId,
  GrantId,
  AgentRunId,
  CheckpointId,
  KnowledgeSourceId,
  NamedDocumentVersionId,
  StrategicRecordId,
} from "@constellation/contracts";
import type {
  AuditReceipt,
  Capture,
  DomainEvent,
  OutboxEntry,
  Space,
  Project,
  Task,
  TaskAssignment,
  TaskProjectRelation,
  TaskStatusDefinition,
  Workspace,
  WorkspaceMembership,
  SpaceGrant,
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
} from "@constellation/domain";

export type GeneratedIdKind =
  | "capture"
  | "task"
  | "project"
  | "document"
  | "relation"
  | "taskStatus"
  | "membership"
  | "spaceGrant"
  | "comment"
  | "attentionSignal"
  | "event"
  | "auditReceipt"
  | "outboxEntry";

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(kind: GeneratedIdKind): string;
}

export interface SemanticHasher {
  fingerprint(value: unknown): string;
}

export interface CapturePaginationCursor {
  readonly kind: "capture";
  readonly orderedAt: string;
  readonly recordId: CaptureId;
}

export interface TaskPaginationCursor {
  readonly kind: "task";
  readonly orderedAt: string;
  readonly recordId: TaskId;
}

export type PaginationCursor = CapturePaginationCursor | TaskPaginationCursor;

export interface PaginationCursorCodec {
  encode(cursor: PaginationCursor): string;
  decode(value: string): PaginationCursor | undefined;
}

export interface AuthorizationRequest {
  readonly context: ExecutionContext;
  readonly capability: Capability;
  readonly workspaceId: WorkspaceId;
  readonly spaceId?: SpaceId;
}

export interface CurrentAuthorizationPolicy {
  authorize(request: AuthorizationRequest): boolean;
}

export interface StoreFreshness {
  readonly mode: "local_authoritative" | "local_projection";
  readonly checkpoint: string | null;
  readonly missingCapabilities: readonly string[];
}

export interface IdempotencyRecord {
  readonly scope: string;
  readonly fingerprint: string;
  readonly outcome: CommandOutcome;
}

export interface CapturePageRequest {
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly after?: CapturePaginationCursor;
  readonly limit: number;
}

export interface TaskPageRequest {
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly after?: TaskPaginationCursor;
  readonly limit: number;
}

export interface ApplicationReadView {
  getFreshness(): StoreFreshness;
  getWorkspace(id: WorkspaceId): Workspace | undefined;
  getSpace(id: SpaceId): Space | undefined;
  listSpaces(workspaceId: WorkspaceId): readonly Space[];
  getTaskStatus(id: TaskStatusId): TaskStatusDefinition | undefined;
  listTaskStatuses(workspaceId: WorkspaceId): readonly TaskStatusDefinition[];
  getMembership(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
  ): WorkspaceMembership | undefined;
  listMemberships(workspaceId: WorkspaceId): readonly WorkspaceMembership[];
  getSpaceGrant(id: SpaceGrantId): SpaceGrant | undefined;
  getSpaceGrantForPrincipal(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    principalId: PrincipalId,
  ): SpaceGrant | undefined;
  listSpaceGrants(
    workspaceId: WorkspaceId,
    principalId?: PrincipalId,
  ): readonly SpaceGrant[];
  getTaskAssignment(id: TaskAssignmentId): TaskAssignment | undefined;
  getActiveTaskAssignment(taskId: TaskId): TaskAssignment | undefined;
  listTaskAssignments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly TaskAssignment[];
  getComment(id: CommentId): RecordComment | undefined;
  listComments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly RecordComment[];
  getAttentionSignal(id: AttentionSignalId): AttentionSignal | undefined;
  findAttentionSignalByDeduplicationKey(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
    deduplicationKey: string,
  ): AttentionSignal | undefined;
  listAttentionSignals(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
  ): readonly AttentionSignal[];
  getCapture(id: CaptureId): Capture | undefined;
  listCaptures(request: CapturePageRequest): readonly Capture[] | undefined;
  getTask(id: TaskId): Task | undefined;
  listTasks(request: TaskPageRequest): readonly Task[] | undefined;
  getAuditReceipt(id: AuditReceiptId): AuditReceipt | undefined;
  getIdempotency(scope: string): IdempotencyRecord | undefined;
  getAgentGrant(id: GrantId): AgentAccessGrant | undefined;
  listAgentGrants(workspaceId: WorkspaceId): readonly AgentAccessGrant[];
  getAgentRun(id: AgentRunId): AgentRun | undefined;
  getAgentCheckpoint(id: CheckpointId): AgentCheckpoint | undefined;
  listAgentHandoffs(runId: AgentRunId): readonly AgentHandoff[];
}

export interface ApplicationWave2ReadView extends ApplicationReadView {
  listTasksInSpace(workspaceId: WorkspaceId, spaceId: SpaceId): readonly Task[];
  getProject(id: ProjectId): Project | undefined;
  listProjects(workspaceId: WorkspaceId, spaceId: SpaceId): readonly Project[];
  getDocument(id: DocumentId): NativeDocument | undefined;
  listDocuments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly NativeDocument[];
  getKnowledgeSource(id: KnowledgeSourceId): KnowledgeSource | undefined;
  listKnowledgeSources(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly KnowledgeSource[];
  getNamedDocumentVersion(
    id: NamedDocumentVersionId,
  ): NamedDocumentVersion | undefined;
  listNamedDocumentVersions(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    documentId?: DocumentId,
  ): readonly NamedDocumentVersion[];
  getStrategicRecord(id: StrategicRecordId): StrategicRecord | undefined;
  listStrategicRecords(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly StrategicRecord[];
  getRelation(id: RelationId): TaskProjectRelation | undefined;
  findTaskProjectRelation(
    taskId: TaskId,
    projectId: ProjectId,
  ): TaskProjectRelation | undefined;
  listRelations(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly TaskProjectRelation[];
  listEvents(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly DomainEvent[];
  getAuditReceiptByCommand(commandId: string): AuditReceipt | undefined;
  getUndoDescriptor(commandId: string): UndoDescriptor | undefined;
}

export interface ApplicationTransaction extends ApplicationReadView {
  insertWorkspace(workspace: Workspace): void;
  updateWorkspace(workspace: Workspace, expectedVersion: number): boolean;
  insertSpace(space: Space): void;
  insertMembership(membership: WorkspaceMembership): void;
  updateMembership(
    membership: WorkspaceMembership,
    expectedVersion: number,
  ): boolean;
  insertSpaceGrant(grant: SpaceGrant): void;
  updateSpaceGrant(grant: SpaceGrant, expectedVersion: number): boolean;
  insertTaskAssignment(assignment: TaskAssignment): void;
  updateTaskAssignment(
    assignment: TaskAssignment,
    expectedVersion: number,
  ): boolean;
  insertComment(comment: RecordComment): void;
  updateComment(comment: RecordComment, expectedVersion: number): boolean;
  insertAttentionSignal(signal: AttentionSignal): void;
  updateAttentionSignal(
    signal: AttentionSignal,
    expectedVersion: number,
  ): boolean;
  insertTaskStatus(status: TaskStatusDefinition): void;
  insertCapture(capture: Capture): void;
  updateCapture(capture: Capture, expectedVersion: number): boolean;
  insertTask(task: Task): void;
  insertEvent(event: DomainEvent): void;
  insertAuditReceipt(receipt: AuditReceipt): void;
  insertIdempotency(record: IdempotencyRecord): void;
  insertOutbox(entry: OutboxEntry): void;
  insertSyncCommand(command: CommandEnvelope): void;
  insertAgentGrant(grant: AgentAccessGrant): void;
  updateAgentGrant(grant: AgentAccessGrant, expectedVersion: number): boolean;
  insertAgentRun(run: AgentRun): void;
  updateAgentRun(run: AgentRun): void;
  insertAgentCheckpoint(checkpoint: AgentCheckpoint): void;
  updateAgentCheckpoint(checkpoint: AgentCheckpoint): void;
  insertAgentHandoff(handoff: AgentHandoff): void;
}

export interface ApplicationWave2Transaction
  extends ApplicationTransaction, ApplicationWave2ReadView {
  updateTask(task: Task, expectedVersion: number): boolean;
  insertProject(project: Project): void;
  updateProject(project: Project, expectedVersion: number): boolean;
  insertDocument(document: NativeDocument): void;
  updateDocument(document: NativeDocument, expectedVersion: number): boolean;
  insertKnowledgeSource(source: KnowledgeSource): void;
  updateKnowledgeSource(
    source: KnowledgeSource,
    expectedVersion: number,
  ): boolean;
  insertNamedDocumentVersion(version: NamedDocumentVersion): void;
  updateNamedDocumentVersion(
    version: NamedDocumentVersion,
    expectedVersion: number,
  ): boolean;
  insertStrategicRecord(record: StrategicRecord): void;
  updateStrategicRecord(
    record: StrategicRecord,
    expectedVersion: number,
  ): boolean;
  insertRelation(relation: TaskProjectRelation): void;
  updateRelation(
    relation: TaskProjectRelation,
    expectedVersion: number,
  ): boolean;
  insertUndoDescriptor(descriptor: UndoDescriptor): void;
  updateUndoDescriptor(descriptor: UndoDescriptor): void;
}

export const isApplicationWave2ReadView = (
  view: ApplicationReadView,
): view is ApplicationWave2ReadView =>
  "listTasksInSpace" in view &&
  "getProject" in view &&
  "listProjects" in view &&
  "getDocument" in view &&
  "listDocuments" in view &&
  "getKnowledgeSource" in view &&
  "listKnowledgeSources" in view &&
  "getNamedDocumentVersion" in view &&
  "listNamedDocumentVersions" in view &&
  "getStrategicRecord" in view &&
  "listStrategicRecords" in view &&
  "getRelation" in view &&
  "findTaskProjectRelation" in view &&
  "listRelations" in view &&
  "listEvents" in view &&
  "getAuditReceiptByCommand" in view &&
  "getUndoDescriptor" in view;

export const isApplicationWave2Transaction = (
  transaction: ApplicationTransaction,
): transaction is ApplicationWave2Transaction =>
  isApplicationWave2ReadView(transaction) &&
  "updateTask" in transaction &&
  "insertProject" in transaction &&
  "updateProject" in transaction &&
  "insertDocument" in transaction &&
  "updateDocument" in transaction &&
  "insertKnowledgeSource" in transaction &&
  "updateKnowledgeSource" in transaction &&
  "insertNamedDocumentVersion" in transaction &&
  "updateNamedDocumentVersion" in transaction &&
  "insertStrategicRecord" in transaction &&
  "updateStrategicRecord" in transaction &&
  "insertRelation" in transaction &&
  "updateRelation" in transaction &&
  "insertUndoDescriptor" in transaction &&
  "updateUndoDescriptor" in transaction;

export interface ApplicationStore {
  read<Result>(read: (view: ApplicationReadView) => Result): Result;
  transact<Result>(
    work: (transaction: ApplicationTransaction) => Result,
  ): Result;
}

export interface ApplicationKernelDependencies {
  readonly authorization: CurrentAuthorizationPolicy;
  readonly clock: Clock;
  readonly cursorCodec: PaginationCursorCodec;
  readonly hasher: SemanticHasher;
  readonly ids: IdGenerator;
  readonly store: ApplicationStore;
}

export class RetryableUnitOfWorkError extends Error {
  public constructor(message = "The unit of work did not commit.") {
    super(message);
    this.name = "RetryableUnitOfWorkError";
  }
}

export interface ReferenceStateSnapshot {
  readonly workspaces: readonly Workspace[];
  readonly spaces: readonly Space[];
  readonly memberships: readonly WorkspaceMembership[];
  readonly spaceGrants?: readonly SpaceGrant[];
  readonly taskAssignments?: readonly TaskAssignment[];
  readonly comments?: readonly RecordComment[];
  readonly attentionSignals?: readonly AttentionSignal[];
  readonly captures: readonly Capture[];
  readonly taskStatuses: readonly TaskStatusDefinition[];
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly documents?: readonly NativeDocument[];
  readonly knowledgeSources?: readonly KnowledgeSource[];
  readonly namedDocumentVersions?: readonly NamedDocumentVersion[];
  readonly strategicRecords?: readonly StrategicRecord[];
  readonly relations: readonly TaskProjectRelation[];
  readonly undoDescriptors: readonly UndoDescriptor[];
  readonly events: readonly DomainEvent[];
  readonly auditReceipts: readonly AuditReceipt[];
  readonly idempotencyRecords: readonly IdempotencyRecord[];
  readonly outboxEntries: readonly OutboxEntry[];
  readonly agentGrants?: readonly AgentAccessGrant[];
  readonly agentRuns?: readonly AgentRun[];
  readonly agentCheckpoints?: readonly AgentCheckpoint[];
  readonly agentHandoffs?: readonly AgentHandoff[];
}

export type InternalIds =
  | CaptureId
  | TaskId
  | TaskStatusId
  | MembershipId
  | SpaceGrantId
  | TaskAssignmentId
  | CommentId
  | AttentionSignalId
  | EventId
  | AuditReceiptId
  | OutboxEntryId;
