import type {
  CommandEnvelope,
  AuditReceiptId,
  Capability,
  CaptureId,
  CaptureOriginal,
  CommandOutcome,
  DocumentId,
  EventId,
  ExecutionContext,
  MembershipId,
  SpaceGrantId,
  OutboxEntryId,
  PrincipalId,
  ProjectId,
  ProjectCheckInId,
  RelationId,
  SpaceId,
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
  FolderId,
  StrategicRecordId,
  DiagnosticCode,
} from "@constellation/contracts";
import type {
  AuditReceipt,
  Capture,
  DomainEvent,
  OutboxEntry,
  Space,
  Project,
  ProjectCheckIn,
  FieldDefinition,
  AutomationRule,
  ProjectTemplate,
  Task,
  TaskAssignment,
  TaskListFilters,
  TaskPriority,
  TaskProjectRelation,
  TaskStatusDefinition,
  Workspace,
  WorkspaceMembership,
  SpaceGrant,
  UndoDescriptor,
  RecordComment,
  AttentionSignal,
  DocumentEntityLink,
  NativeDocument,
  AgentAccessGrant,
  AgentRun,
  AgentHandoff,
  AgentCheckpoint,
  KnowledgeSource,
  NamedDocumentVersion,
  Folder,
  StrategicRecord,
} from "@constellation/domain";

export type GeneratedIdKind =
  | "capture"
  | "task"
  | "project"
  | "document"
  | "knowledgeSource"
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

export interface TaskDuePaginationCursor {
  readonly kind: "task_due";
  readonly dueAt: string | null;
  readonly priority: TaskPriority;
  readonly orderedAt: string;
  readonly recordId: TaskId;
}

export interface InventoryPaginationCursor {
  readonly kind: "opportunity_inventory" | "relation_inventory";
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly snapshot: string;
  readonly orderedAt: string;
  readonly recordId: StrategicRecordId | RelationId;
}

export type PaginationCursor =
  | CapturePaginationCursor
  | TaskPaginationCursor
  | TaskDuePaginationCursor
  | InventoryPaginationCursor;

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
  readonly after?: TaskPaginationCursor | TaskDuePaginationCursor;
  readonly limit: number;
  readonly order?: "created_desc" | "due_asc";
  readonly filters?: TaskListFilters;
}

export interface ApplicationReadView {
  getFreshness(): StoreFreshness;
  getWorkspace(id: WorkspaceId): Workspace | undefined;
  getSpace(id: SpaceId): Space | undefined;
  listSpaces(workspaceId: WorkspaceId): readonly Space[];
  getTaskStatus(id: TaskStatusId): TaskStatusDefinition | undefined;
  listTaskStatuses(workspaceId: WorkspaceId): readonly TaskStatusDefinition[];
  getFieldDefinition(id: FieldDefinitionId): FieldDefinition | undefined;
  listFieldDefinitions(workspaceId: WorkspaceId): readonly FieldDefinition[];
  getProjectTemplate(id: ProjectTemplateId): ProjectTemplate | undefined;
  listProjectTemplates(workspaceId: WorkspaceId): readonly ProjectTemplate[];
  getAutomationRule(id: AutomationRuleId): AutomationRule | undefined;
  listAutomationRules(workspaceId: WorkspaceId): readonly AutomationRule[];
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
  listCapturesInSpace(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly Capture[];
  listCaptures(request: CapturePageRequest): readonly Capture[] | undefined;
  getTask(id: TaskId): Task | undefined;
  listTasks(request: TaskPageRequest): readonly Task[] | undefined;
  getAuditReceipt(id: AuditReceiptId): AuditReceipt | undefined;
  getIdempotency(scope: string): IdempotencyRecord | undefined;
  getAgentGrant(id: GrantId): AgentAccessGrant | undefined;
  listAgentGrants(workspaceId: WorkspaceId): readonly AgentAccessGrant[];
  getAgentRun(id: AgentRunId): AgentRun | undefined;
  /**
   * The other half of a run's identity. A grant and a host run name at most one
   * agent run, and a transport registering a run has to be able to say so
   * *before* it writes — otherwise the store's own uniqueness rule is the thing
   * that reports it, as an unnamed failure the caller cannot act on.
   */
  findAgentRunByHostRun(
    grantId: GrantId,
    hostRunId: string,
  ): AgentRun | undefined;
  getAgentCheckpoint(id: CheckpointId): AgentCheckpoint | undefined;
  listAgentHandoffs(runId: AgentRunId): readonly AgentHandoff[];
}

export interface ApplicationWave2ReadView extends ApplicationReadView {
  listTasksInSpace(workspaceId: WorkspaceId, spaceId: SpaceId): readonly Task[];
  getProject(id: ProjectId): Project | undefined;
  listProjects(workspaceId: WorkspaceId, spaceId: SpaceId): readonly Project[];
  getProjectCheckIn(id: ProjectCheckInId): ProjectCheckIn | undefined;
  listProjectCheckIns(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    projectId?: ProjectId,
  ): readonly ProjectCheckIn[];
  getDocument(id: DocumentId): NativeDocument | undefined;
  /**
   * The note claiming a source key in this Space, if one does.
   *
   * The same claim `findProjectByExternalId` answers, on a kind that is not a
   * strategic record either, so there is no `kind` to scope by and none is
   * wanted: a note and a Person may hold one string without colliding.
   */
  findDocumentByExternalId(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    externalId: string,
  ): NativeDocument | undefined;
  listDocuments(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
  ): readonly NativeDocument[];
  getFolder(id: FolderId): Folder | undefined;
  /**
   * Every ACTIVE folder in the Space, unordered and uncapped, exactly as
   * `listDocuments` returns documents. Uncapped is the same bet the note list
   * already makes and the reason B8 needs no SQL: the tree, the rolled-up
   * counts and the deletion guard are all computed in the kernel over this
   * list, where Space authorization lives. A `GROUP BY folder_id` in SQL would
   * compute a number the reader may not be allowed to see.
   */
  listFolders(workspaceId: WorkspaceId, spaceId: SpaceId): readonly Folder[];
  listDocumentEntityLinks(
    workspaceId: WorkspaceId,
    targetKind?: DocumentEntityLink["targetKind"],
    targetId?: string,
  ): readonly DocumentEntityLink[];
  /**
   * THE FIRST `maxChars` CHARACTERS OF EVERY INDEXED NOTE BODY IN THE SPACE,
   * one answer for the whole Space rather than one call per note. The Notes
   * list renders every note it holds, so a per-row read would turn one list
   * into N scans — the same reason `knowledge.list` reads its references and
   * its named versions once.
   *
   * THIS IS NOT `searchDocumentBodies` WITH AN EMPTY PHRASE, and that is a
   * measurement rather than a preference: that method returns `[]` for an
   * empty phrase, and its `snippet(...)` centres the window ON THE MATCH. A
   * note list has no phrase and wants the BEGINNING. Two different questions,
   * two different reads.
   *
   * A NOTE WITH NO INDEXED BODY IS ABSENT FROM THIS ANSWER — not present with
   * an empty prefix. The write path creates the projection row when a body is
   * written, so "no row" means "never written through this application", and
   * flattening that into `""` would let the reader draw an empty band under a
   * note it knows nothing about.
   *
   * THE CUT IS THE STORE'S JOB, and it must happen in the query rather than
   * after loading. A body can be thousands of characters and a Space can hold
   * hundreds of notes; a store that returned whole bodies for the caller to
   * slice would move the entire Library through memory to render a list.
   * Cutting at `maxChars` may land mid-word — the caller owns the readable
   * boundary, and `documentExcerpt` is where that single rule lives.
   */
  listDocumentBodyPrefixes(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    maxChars: number,
  ): readonly {
    readonly documentId: DocumentId;
    readonly prefix: string;
  }[];
  searchDocumentBodies(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    text: string,
    limit: number,
  ): readonly {
    readonly documentId: DocumentId;
    readonly snippet: string;
  }[];
  searchProjectBodies(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    text: string,
    limit: number,
  ): readonly {
    readonly projectId: ProjectId;
    readonly snippet: string;
  }[];
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
  /**
   * The active record of `kind` that already carries this source key, if the
   * Space holds one. Uniqueness is enforced here rather than by a SQL
   * constraint: `strategic_records` stores its payload opaquely, the in-memory
   * store every conformance test runs against enforces no constraints at all,
   * and a constraint violation surfaces as a retryable unit-of-work failure —
   * the wrong outcome class for "this source row is already here", which the
   * caller has to be able to act on.
   */
  findStrategicRecordByExternalId(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    kind: "person" | "organization" | "opportunity",
    externalId: string,
  ): StrategicRecord | undefined;
  /**
   * The same claim for a Project, which is not a strategic record and lives in
   * its own table. There is no `kind` to scope by, and none is wanted: the
   * scope is the Space and the fact that this is a Project, so a Project and a
   * Person may hold one string without colliding.
   */
  findProjectByExternalId(
    workspaceId: WorkspaceId,
    spaceId: SpaceId,
    externalId: string,
  ): Project | undefined;
  getRelation(id: RelationId): TaskProjectRelation | undefined;
  /**
   * The active relation between a Task and the record it contributes to,
   * whichever typed far end that is: Project, Opportunity, Area, or Initiative.
   */
  findTaskProjectRelation(
    taskId: TaskId,
    targetId: ProjectId | StrategicRecordId,
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
  updateTaskStatus(
    status: TaskStatusDefinition,
    expectedVersion: number,
  ): boolean;
  insertFieldDefinition(definition: FieldDefinition): void;
  updateFieldDefinition(
    definition: FieldDefinition,
    expectedVersion: number,
  ): boolean;
  insertProjectTemplate(template: ProjectTemplate): void;
  updateProjectTemplate(
    template: ProjectTemplate,
    expectedVersion: number,
  ): boolean;
  insertAutomationRule(rule: AutomationRule): void;
  updateAutomationRule(rule: AutomationRule, expectedVersion: number): boolean;
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
  insertProjectCheckIn(checkIn: ProjectCheckIn): void;
  updateProjectCheckIn(
    checkIn: ProjectCheckIn,
    expectedVersion: number,
  ): boolean;
  insertDocument(document: NativeDocument): void;
  updateDocument(document: NativeDocument, expectedVersion: number): boolean;
  insertFolder(folder: Folder): void;
  updateFolder(folder: Folder, expectedVersion: number): boolean;
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
  "getProjectCheckIn" in view &&
  "listProjectCheckIns" in view &&
  "getDocument" in view &&
  "listDocuments" in view &&
  "getFolder" in view &&
  "listFolders" in view &&
  "listDocumentEntityLinks" in view &&
  "listDocumentBodyPrefixes" in view &&
  "searchDocumentBodies" in view &&
  "searchProjectBodies" in view &&
  "getKnowledgeSource" in view &&
  "listKnowledgeSources" in view &&
  "getNamedDocumentVersion" in view &&
  "listNamedDocumentVersions" in view &&
  "getStrategicRecord" in view &&
  "listStrategicRecords" in view &&
  "findStrategicRecordByExternalId" in view &&
  "findProjectByExternalId" in view &&
  "findDocumentByExternalId" in view &&
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
  "insertFolder" in transaction &&
  "updateFolder" in transaction &&
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
  readonly capturePayloadVerifier?: {
    isAvailable(workspaceId: WorkspaceId, original: CaptureOriginal): boolean;
  };
}

export class RetryableUnitOfWorkError extends Error {
  public constructor(
    message = "The unit of work did not commit.",
    public readonly diagnosticCode: Extract<
      DiagnosticCode,
      | "storage.unit_of_work_failed"
      | "storage.capacity_exhausted"
      | "storage.permission_denied"
    > = "storage.unit_of_work_failed",
  ) {
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
  readonly fieldDefinitions?: readonly FieldDefinition[];
  readonly projectTemplates?: readonly ProjectTemplate[];
  readonly automationRules?: readonly AutomationRule[];
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly projectCheckIns?: readonly ProjectCheckIn[];
  readonly documents?: readonly NativeDocument[];
  readonly folders?: readonly Folder[];
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
