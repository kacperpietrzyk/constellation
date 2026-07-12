import type {
  AuditReceiptId,
  Capability,
  CaptureId,
  CommandOutcome,
  EventId,
  ExecutionContext,
  MembershipId,
  OutboxEntryId,
  PrincipalId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";
import type {
  AuditReceipt,
  Capture,
  DomainEvent,
  OutboxEntry,
  Space,
  Workspace,
  WorkspaceMembership,
} from "@constellation/domain";

export type GeneratedIdKind =
  "capture" | "membership" | "event" | "auditReceipt" | "outboxEntry";

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(kind: GeneratedIdKind): string;
}

export interface SemanticHasher {
  fingerprint(value: unknown): string;
}

export interface PaginationCursor {
  readonly capturedAt: string;
  readonly captureId: CaptureId;
}

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
  readonly after?: PaginationCursor;
  readonly limit: number;
}

export interface ApplicationReadView {
  getFreshness(): StoreFreshness;
  getWorkspace(id: WorkspaceId): Workspace | undefined;
  getSpace(id: SpaceId): Space | undefined;
  listSpaces(workspaceId: WorkspaceId): readonly Space[];
  getMembership(
    workspaceId: WorkspaceId,
    principalId: PrincipalId,
  ): WorkspaceMembership | undefined;
  getCapture(id: CaptureId): Capture | undefined;
  listCaptures(request: CapturePageRequest): readonly Capture[] | undefined;
  getAuditReceipt(id: AuditReceiptId): AuditReceipt | undefined;
  getIdempotency(scope: string): IdempotencyRecord | undefined;
}

export interface ApplicationTransaction extends ApplicationReadView {
  insertWorkspace(workspace: Workspace): void;
  updateWorkspace(workspace: Workspace, expectedVersion: number): boolean;
  insertSpace(space: Space): void;
  insertMembership(membership: WorkspaceMembership): void;
  insertCapture(capture: Capture): void;
  insertEvent(event: DomainEvent): void;
  insertAuditReceipt(receipt: AuditReceipt): void;
  insertIdempotency(record: IdempotencyRecord): void;
  insertOutbox(entry: OutboxEntry): void;
}

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
  readonly captures: readonly Capture[];
  readonly events: readonly DomainEvent[];
  readonly auditReceipts: readonly AuditReceipt[];
  readonly idempotencyRecords: readonly IdempotencyRecord[];
  readonly outboxEntries: readonly OutboxEntry[];
}

export type InternalIds =
  CaptureId | MembershipId | EventId | AuditReceiptId | OutboxEntryId;
