import {
  AuditReceiptIdSchema,
  CommandOutcomeSchema,
  EventIdSchema,
  OutboxEntryIdSchema,
  QueryResultSchema,
  type CommandEnvelope,
  type CommandOutcome,
  type ExecutionContext,
  type QueryEnvelope,
  type QueryResult,
} from "@constellation/contracts";
import {
  addWorkspaceMember,
  bumpWorkspacePolicy,
  changeSpaceAccess,
  grantSpaceAccess,
  revokeSpaceGrant,
  revokeWorkspaceMember,
  type AuditReceipt,
  type DomainEvent,
  type OutboxEntry,
} from "@constellation/domain";

import {
  canEditSpace,
  canManageWorkspaceAccess,
  canViewSpace,
} from "./collaboration-policy.js";
import {
  isApplicationWave2ReadView,
  type ApplicationKernelDependencies,
  type ApplicationReadView,
  type ApplicationTransaction,
  type IdempotencyRecord,
  RetryableUnitOfWorkError,
  type StoreFreshness,
} from "./ports.js";

export type CollaborationCommand = Extract<
  CommandEnvelope,
  {
    commandName:
      | "workspace.memberAdd"
      | "workspace.memberSetAccess"
      | "workspace.memberRevoke";
  }
>;

export type CollaborationQuery = Extract<
  QueryEnvelope,
  { queryName: "workspace.access" | "workspace.exportScoped" }
>;

const exactExpected = (
  command: CollaborationCommand,
  records: Readonly<Record<string, number>>,
): boolean => {
  const actual = Object.keys(command.expectedVersions).sort();
  const expected = Object.keys(records).sort();
  return (
    actual.length === expected.length &&
    actual.every(
      (key, index) =>
        key === expected[index] &&
        command.expectedVersions[key] === records[key],
    )
  );
};

const conflict = (
  command: CollaborationCommand,
  occurredAt: string,
  currentVersions: Record<string, number>,
): CommandOutcome =>
  CommandOutcomeSchema.parse({
    outcome: "conflict",
    diagnosticCode: "record.version_conflict",
    contractVersion: 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    kernelTime: occurredAt,
    currentVersions,
  });

const rejected = (
  command: CollaborationCommand,
  occurredAt: string,
): CommandOutcome =>
  CommandOutcomeSchema.parse({
    outcome: "rejected",
    diagnosticCode: "command.precondition_failed",
    contractVersion: 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    kernelTime: occurredAt,
  });

const commit = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationTransaction,
  context: ExecutionContext,
  command: CollaborationCommand,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
  input: {
    readonly event: Omit<DomainEvent, "id" | "commandId">;
    readonly recordVersions: Readonly<Record<string, number>>;
    readonly auditRecordVersions?: Readonly<Record<string, number>>;
    readonly changedFields: readonly string[];
    readonly diagnosticCode:
      | "workspace.member_added"
      | "workspace.member_access_changed"
      | "workspace.member_revoked";
    readonly projection: Record<string, unknown>;
    readonly affectedKinds: Readonly<
      Record<string, "workspace" | "membership" | "spaceGrant">
    >;
  },
): CommandOutcome => {
  const eventId = EventIdSchema.parse(dependencies.ids.next("event"));
  const auditReceiptId = AuditReceiptIdSchema.parse(
    dependencies.ids.next("auditReceipt"),
  );
  const outboxEntryId = OutboxEntryIdSchema.parse(
    dependencies.ids.next("outboxEntry"),
  );
  const outcome = CommandOutcomeSchema.parse({
    outcome: "success",
    diagnosticCode: input.diagnosticCode,
    contractVersion: 1,
    commandId: command.commandId,
    correlationId: command.correlationId,
    kernelTime: occurredAt,
    affected: Object.entries(input.recordVersions).map(
      ([recordId, version]) => ({
        recordId,
        recordKind: input.affectedKinds[recordId],
        version,
      }),
    ),
    auditReceiptId,
    projection: input.projection,
  });
  const event = {
    id: eventId,
    commandId: command.commandId,
    ...input.event,
  } as DomainEvent;
  const audit: AuditReceipt = {
    id: auditReceiptId,
    workspaceId: command.workspaceId,
    spaceId: input.event.spaceId,
    principalId: context.principalId,
    grantId: context.grantId,
    origin: context.origin,
    commandId: command.commandId,
    commandName: command.commandName,
    correlationId: command.correlationId,
    affectedRecordIds: Object.keys(
      input.auditRecordVersions ?? input.recordVersions,
    ),
    recordVersions: input.auditRecordVersions ?? input.recordVersions,
    changedFields: input.changedFields,
    occurredAt,
    outcome: "success",
  };
  const outbox: OutboxEntry = {
    id: outboxEntryId,
    workspaceId: command.workspaceId,
    spaceId: input.event.spaceId,
    eventId,
    topic: "workspace.projection.requested",
    createdAt: occurredAt,
  };
  transaction.insertEvent(event);
  transaction.insertAuditReceipt(audit);
  transaction.insertIdempotency({ ...idempotency, outcome });
  transaction.insertSyncCommand(command);
  transaction.insertOutbox(outbox);
  return outcome;
};

export const executeCollaborationCommand = (
  dependencies: ApplicationKernelDependencies,
  transaction: ApplicationTransaction,
  context: ExecutionContext,
  command: CollaborationCommand,
  idempotency: Omit<IdempotencyRecord, "outcome">,
  occurredAt: string,
): CommandOutcome => {
  const workspace = transaction.getWorkspace(command.workspaceId);
  if (workspace === undefined) return rejected(command, occurredAt);
  if (command.commandName === "workspace.memberAdd") {
    const space = transaction.getSpace(command.payload.spaceId);
    if (
      space?.workspaceId !== workspace.id ||
      !canEditSpace(
        transaction,
        context,
        workspace.id,
        command.payload.spaceId,
      ) ||
      transaction.getMembership(workspace.id, command.payload.principalId) !==
        undefined ||
      transaction.getSpaceGrant(command.payload.spaceGrantId) !== undefined ||
      !exactExpected(command, { [workspace.id]: workspace.version })
    )
      return rejected(command, occurredAt);
    const membership = addWorkspaceMember({
      membershipId: command.payload.membershipId,
      workspaceId: workspace.id,
      principalId: command.payload.principalId,
      displayName: command.payload.displayName,
      role: command.payload.role,
      occurredAt,
    });
    const grant = grantSpaceAccess({
      id: command.payload.spaceGrantId,
      workspaceId: workspace.id,
      spaceId: space.id,
      principalId: membership.principalId,
      access: command.payload.access,
      occurredAt,
    });
    const updatedWorkspace = bumpWorkspacePolicy(workspace, occurredAt);
    transaction.insertMembership(membership);
    transaction.insertSpaceGrant(grant);
    if (!transaction.updateWorkspace(updatedWorkspace, workspace.version)) {
      throw new RetryableUnitOfWorkError();
    }
    return commit(
      dependencies,
      transaction,
      context,
      command,
      idempotency,
      occurredAt,
      {
        event: {
          type: "workspace.member_added",
          workspaceId: workspace.id,
          spaceId: space.id,
          aggregateId: membership.id,
          aggregateVersion: membership.version,
          occurredAt,
        },
        recordVersions: {
          [workspace.id]: updatedWorkspace.version,
          [membership.id]: membership.version,
          [grant.id]: grant.version,
        },
        changedFields: [
          "membership.role",
          "membership.status",
          "spaceGrant.access",
          "policyVersion",
        ],
        diagnosticCode: "workspace.member_added",
        projection: {
          kind: "workspace.member_added",
          membershipId: membership.id,
          principalId: membership.principalId,
          role: membership.role,
          status: membership.status,
          membershipVersion: membership.version,
          policyVersion: updatedWorkspace.policyVersion,
          spaceGrantId: grant.id,
          spaceId: grant.spaceId,
          access: grant.access,
          spaceGrantVersion: grant.version,
        },
        affectedKinds: {
          [workspace.id]: "workspace",
          [membership.id]: "membership",
          [grant.id]: "spaceGrant",
        },
      },
    );
  }
  const membership = transaction
    .listMemberships(workspace.id)
    .find((item) => item.id === command.payload.membershipId);
  if (membership === undefined || membership.role === "owner")
    return rejected(command, occurredAt);
  if (command.commandName === "workspace.memberSetAccess") {
    const grant = transaction.getSpaceGrant(command.payload.spaceGrantId);
    if (
      membership.status === "revoked" ||
      grant?.status === "revoked" ||
      grant?.principalId !== membership.principalId ||
      grant.workspaceId !== workspace.id ||
      !canEditSpace(transaction, context, workspace.id, grant.spaceId) ||
      !exactExpected(command, {
        [workspace.id]: workspace.version,
        [membership.id]: membership.version,
        [grant.id]: grant.version,
      })
    )
      return rejected(command, occurredAt);
    const updatedGrant = changeSpaceAccess(
      grant,
      command.payload.access,
      occurredAt,
    );
    const updatedWorkspace = bumpWorkspacePolicy(workspace, occurredAt);
    if (
      !transaction.updateSpaceGrant(updatedGrant, grant.version) ||
      !transaction.updateWorkspace(updatedWorkspace, workspace.version)
    )
      throw new RetryableUnitOfWorkError();
    return commit(
      dependencies,
      transaction,
      context,
      command,
      idempotency,
      occurredAt,
      {
        event: {
          type: "workspace.member_access_changed",
          workspaceId: workspace.id,
          spaceId: grant.spaceId,
          aggregateId: membership.id,
          aggregateVersion: membership.version,
          occurredAt,
        },
        recordVersions: {
          [workspace.id]: updatedWorkspace.version,
          [membership.id]: membership.version,
          [updatedGrant.id]: updatedGrant.version,
        },
        changedFields: ["spaceGrant.access", "policyVersion"],
        diagnosticCode: "workspace.member_access_changed",
        projection: {
          kind: "workspace.member_access_changed",
          membershipId: membership.id,
          principalId: membership.principalId,
          role: membership.role,
          status: membership.status ?? "active",
          membershipVersion: membership.version,
          policyVersion: updatedWorkspace.policyVersion,
          spaceGrantId: updatedGrant.id,
          spaceId: updatedGrant.spaceId,
          access: updatedGrant.access,
          spaceGrantVersion: updatedGrant.version,
        },
        affectedKinds: {
          [workspace.id]: "workspace",
          [membership.id]: "membership",
          [updatedGrant.id]: "spaceGrant",
        },
      },
    );
  }
  const grants = transaction
    .listSpaceGrants(workspace.id, membership.principalId)
    .filter((grant) => grant.status === "active");
  const expected = {
    [workspace.id]: workspace.version,
    [membership.id]: membership.version,
  };
  if (!exactExpected(command, expected))
    return conflict(command, occurredAt, expected);
  const revokedMembership = revokeWorkspaceMember(membership, occurredAt);
  const revokedGrants = grants.map((grant) =>
    revokeSpaceGrant(grant, occurredAt),
  );
  const visibleRevokedGrants = revokedGrants.filter((grant) =>
    canViewSpace(transaction, context, workspace.id, grant.spaceId),
  );
  const updatedWorkspace = bumpWorkspacePolicy(workspace, occurredAt);
  if (
    !transaction.updateMembership(revokedMembership, membership.version) ||
    revokedGrants.some(
      (grant, index) =>
        !transaction.updateSpaceGrant(grant, grants[index]!.version),
    ) ||
    !transaction.updateWorkspace(updatedWorkspace, workspace.version)
  )
    throw new RetryableUnitOfWorkError();
  return commit(
    dependencies,
    transaction,
    context,
    command,
    idempotency,
    occurredAt,
    {
      event: {
        type: "workspace.member_revoked",
        workspaceId: workspace.id,
        spaceId: workspace.rootSpaceId,
        aggregateId: membership.id,
        aggregateVersion: revokedMembership.version,
        occurredAt,
      },
      recordVersions: {
        [workspace.id]: updatedWorkspace.version,
        [revokedMembership.id]: revokedMembership.version,
        ...Object.fromEntries(
          visibleRevokedGrants.map((grant) => [grant.id, grant.version]),
        ),
      },
      auditRecordVersions: {
        [workspace.id]: updatedWorkspace.version,
        [revokedMembership.id]: revokedMembership.version,
        ...Object.fromEntries(
          revokedGrants.map((grant) => [grant.id, grant.version]),
        ),
      },
      changedFields: [
        "membership.status",
        "spaceGrant.status",
        "policyVersion",
      ],
      diagnosticCode: "workspace.member_revoked",
      projection: {
        kind: "workspace.member_revoked",
        membershipId: revokedMembership.id,
        principalId: revokedMembership.principalId,
        role: revokedMembership.role,
        status: revokedMembership.status,
        membershipVersion: revokedMembership.version,
        policyVersion: updatedWorkspace.policyVersion,
        revokedSpaceGrantIds: visibleRevokedGrants.map((grant) => grant.id),
      },
      affectedKinds: {
        [workspace.id]: "workspace",
        [revokedMembership.id]: "membership",
        ...Object.fromEntries(
          revokedGrants.map((grant) => [grant.id, "spaceGrant" as const]),
        ),
      },
    },
  );
};

const success = (
  query: CollaborationQuery,
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
const denied = (query: CollaborationQuery, kernelTime: string): QueryResult =>
  QueryResultSchema.parse({
    outcome: "rejected",
    diagnosticCode: "authorization.denied",
    contractVersion: 1,
    queryId: query.queryId,
    kernelTime,
  });

export const executeCollaborationQuery = (
  dependencies: ApplicationKernelDependencies,
  view: ApplicationReadView,
  context: ExecutionContext,
  query: CollaborationQuery,
  kernelTime: string,
): QueryResult => {
  const workspace = view.getWorkspace(query.workspaceId);
  const membership = view.getMembership(query.workspaceId, context.principalId);
  if (
    workspace === undefined ||
    membership === undefined ||
    membership.status === "revoked" ||
    (workspace.policyVersion ?? 1) !== context.policyVersion ||
    !dependencies.authorization.authorize({
      context,
      capability: query.queryName,
      workspaceId: query.workspaceId,
    })
  )
    return denied(query, kernelTime);
  const canManage =
    canManageWorkspaceAccess(view, context, workspace.id) &&
    dependencies.authorization.authorize({
      context,
      capability: "workspace.manageAccess",
      workspaceId: workspace.id,
    });
  if (query.queryName === "workspace.access") {
    const memberships = canManage
      ? view.listMemberships(workspace.id)
      : [membership];
    return success(query, kernelTime, view.getFreshness(), {
      kind: "workspace.access",
      policyVersion: workspace.policyVersion ?? 1,
      currentPrincipalId: context.principalId,
      canManage,
      members: memberships.map((item) => ({
        membershipId: item.id,
        principalId: item.principalId,
        displayName:
          item.displayName ??
          (item.principalId === context.principalId
            ? "You"
            : "Workspace member"),
        role: item.role,
        status: item.status ?? "active",
        version: item.version,
        spaces: view
          .listSpaceGrants(workspace.id, item.principalId)
          .filter((grant) =>
            canManage
              ? canViewSpace(view, context, workspace.id, grant.spaceId)
              : grant.status === "active" &&
                canViewSpace(view, context, workspace.id, grant.spaceId),
          )
          .map((grant) => ({
            spaceGrantId: grant.id,
            spaceId: grant.spaceId,
            spaceName:
              view.getSpace(grant.spaceId)?.name ?? "Unavailable Space",
            access: grant.access,
            status: grant.status,
            version: grant.version,
          })),
      })),
    });
  }
  if (!isApplicationWave2ReadView(view)) return denied(query, kernelTime);
  const spaces = view.listSpaces(workspace.id).filter(
    (space) =>
      canViewSpace(view, context, workspace.id, space.id) &&
      dependencies.authorization.authorize({
        context,
        capability: query.queryName,
        workspaceId: workspace.id,
        spaceId: space.id,
      }),
  );
  if (spaces.length === 0) return denied(query, kernelTime);
  const records: Array<{
    kind:
      | "task"
      | "project"
      | "document"
      | "capture"
      | "task_assignment"
      | "comment"
      | "attention_signal";
    id: string;
    spaceId: string;
  }> = [];
  let activity = 0;
  let relations = 0;
  for (const space of spaces) {
    records.push(
      ...view.listComments(workspace.id, space.id).map((record) => ({
        kind: "comment" as const,
        id: record.id,
        spaceId: record.spaceId,
      })),
    );
    records.push(
      ...view
        .listAttentionSignals(workspace.id, context.principalId)
        .filter(
          (record) =>
            record.spaceId === space.id && record.state !== "dismissed",
        )
        .map((record) => ({
          kind: "attention_signal" as const,
          id: record.id,
          spaceId: record.spaceId,
        })),
    );
    records.push(
      ...view.listTasksInSpace(workspace.id, space.id).map((record) => ({
        kind: "task" as const,
        id: record.id,
        spaceId: record.spaceId,
      })),
    );
    records.push(
      ...view
        .listTaskAssignments(workspace.id, space.id)
        .filter((record) => record.state === "active")
        .map((record) => ({
          kind: "task_assignment" as const,
          id: record.id,
          spaceId: record.spaceId,
        })),
    );
    records.push(
      ...view.listProjects(workspace.id, space.id).map((record) => ({
        kind: "project" as const,
        id: record.id,
        spaceId: record.spaceId,
      })),
    );
    records.push(
      ...view.listDocuments(workspace.id, space.id).map((record) => ({
        kind: "document" as const,
        id: record.id,
        spaceId: record.spaceId,
      })),
    );
    records.push(
      ...(
        view.listCaptures({
          workspaceId: workspace.id,
          spaceId: space.id,
          limit: 10000,
        }) ?? []
      ).map((record) => ({
        kind: "capture" as const,
        id: record.id,
        spaceId: record.spaceId,
      })),
    );
    relations += view
      .listRelations(workspace.id, space.id)
      .filter((record) => record.state === "active").length;
    activity += view.listEvents(workspace.id, space.id).length;
  }
  return success(query, kernelTime, view.getFreshness(), {
    kind: "workspace.exportScoped",
    policyVersion: workspace.policyVersion ?? 1,
    workspace: { id: workspace.id, name: workspace.name },
    spaces: spaces.map(({ id, name }) => ({ id, name })),
    counts: {
      tasks: records.filter((item) => item.kind === "task").length,
      projects: records.filter((item) => item.kind === "project").length,
      documents: records.filter((item) => item.kind === "document").length,
      captures: records.filter((item) => item.kind === "capture").length,
      taskAssignments: records.filter((item) => item.kind === "task_assignment")
        .length,
      comments: records.filter((item) => item.kind === "comment").length,
      attentionSignals: records.filter(
        (item) => item.kind === "attention_signal",
      ).length,
      relations,
      activity,
    },
    records,
  });
};
