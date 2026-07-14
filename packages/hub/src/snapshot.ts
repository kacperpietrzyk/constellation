import { createHash } from "node:crypto";

import type { ReferenceStateSnapshot } from "@constellation/application";
import {
  HubWorkspaceSnapshotSchema,
  type ExecutionContext,
  type HubWorkspaceSnapshot,
  type WorkspaceId,
} from "@constellation/contracts";

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
};

export const snapshotDigest = (snapshot: HubWorkspaceSnapshot): string =>
  createHash("sha256").update(canonicalJson(snapshot)).digest("hex");

export const toHubSnapshot = (
  snapshot: ReferenceStateSnapshot,
): HubWorkspaceSnapshot =>
  HubWorkspaceSnapshotSchema.parse({
    format: "constellation.workspace-snapshot/v1",
    ...snapshot,
  });

export const fromHubSnapshot = (
  snapshot: HubWorkspaceSnapshot,
  workspaceId: WorkspaceId,
): ReferenceStateSnapshot => {
  const parsed = HubWorkspaceSnapshotSchema.parse(snapshot);
  if (
    parsed.workspaces.length !== 1 ||
    parsed.workspaces[0]?.id !== workspaceId ||
    parsed.spaces.some((value) => value.workspaceId !== workspaceId) ||
    parsed.memberships.some((value) => value.workspaceId !== workspaceId) ||
    parsed.spaceGrants.some((value) => value.workspaceId !== workspaceId) ||
    parsed.taskStatuses.some((value) => value.workspaceId !== workspaceId) ||
    parsed.captures.some((value) => value.workspaceId !== workspaceId) ||
    parsed.tasks.some((value) => value.workspaceId !== workspaceId) ||
    parsed.projects.some((value) => value.workspaceId !== workspaceId) ||
    parsed.relations.some((value) => value.workspaceId !== workspaceId) ||
    parsed.events.some((value) => value.workspaceId !== workspaceId) ||
    parsed.auditReceipts.some((value) => value.workspaceId !== workspaceId) ||
    parsed.outboxEntries.some((value) => value.workspaceId !== workspaceId)
  ) {
    throw new Error("Hub snapshot violates its workspace boundary.");
  }
  const { format: _format, ...state } = parsed;
  void _format;
  return state as unknown as ReferenceStateSnapshot;
};

export const authorizationForSnapshot = (
  snapshot: HubWorkspaceSnapshot,
  workspaceId: WorkspaceId,
  authorization: ExecutionContext,
): ExecutionContext | undefined => {
  if (snapshot.workspaces.length === 0) return authorization;
  const state = fromHubSnapshot(snapshot, workspaceId);
  const workspace = state.workspaces[0];
  const membership = state.memberships.find(
    (value) => value.principalId === authorization.principalId,
  );
  if (
    workspace === undefined ||
    membership === undefined ||
    membership.status === "revoked"
  )
    return undefined;
  const availableSpaces = new Set(state.spaces.map((value) => value.id));
  const durableScope = new Set(
    (state.spaceGrants ?? [])
      .filter(
        (grant) =>
          grant.principalId === authorization.principalId &&
          grant.status === "active",
      )
      .map((grant) => grant.spaceId),
  );
  if (membership.role === "owner") durableScope.add(workspace.rootSpaceId);
  const spaceScope = authorization.spaceScope.filter(
    (spaceId) => availableSpaces.has(spaceId) && durableScope.has(spaceId),
  );
  if (spaceScope.length === 0) return undefined;
  return {
    ...authorization,
    policyVersion: workspace.policyVersion ?? 1,
    spaceScope,
  };
};

export const scopeHubSnapshot = (
  snapshot: HubWorkspaceSnapshot,
  workspaceId: WorkspaceId,
  authorization: ExecutionContext,
): HubWorkspaceSnapshot | undefined => {
  const current = authorizationForSnapshot(
    snapshot,
    workspaceId,
    authorization,
  );
  if (current === undefined) return undefined;
  const state = fromHubSnapshot(snapshot, workspaceId);
  const membership = state.memberships.find(
    (value) => value.principalId === current.principalId,
  );
  if (membership === undefined) return undefined;
  const canManagePolicy =
    (membership.role === "owner" || membership.role === "admin") &&
    current.capabilityScope.includes("workspace.manageAccess");
  const spaces = new Set(current.spaceScope);
  const inScope = <Record extends { readonly spaceId: string }>(
    record: Record,
  ) => spaces.has(record.spaceId as never);
  const tasks = state.tasks.filter(inScope);
  const captures = state.captures.filter(inScope);
  const projects = state.projects.filter(inScope);
  const relations = state.relations.filter(inScope);
  const undoDescriptors = state.undoDescriptors.filter(inScope);
  const events = state.events.filter(inScope);
  const auditReceipts = state.auditReceipts.filter(inScope);
  const outboxEntries = state.outboxEntries.filter(inScope);
  const memberships = canManagePolicy
    ? state.memberships
    : state.memberships.filter(
        (value) => value.principalId === current.principalId,
      );
  const spaceGrants = (state.spaceGrants ?? []).filter(
    (value) =>
      spaces.has(value.spaceId) &&
      (canManagePolicy || value.principalId === current.principalId),
  );
  const taskStatusIds = new Set([
    state.workspaces[0]?.defaultTaskStatusId,
    ...tasks.map((value) => value.statusId),
  ]);
  const taskStatuses = state.taskStatuses.filter((value) =>
    taskStatusIds.has(value.id),
  );
  const allowedRecordIds = new Set<string>([
    ...state.workspaces.map((value) => value.id),
    ...memberships.map((value) => value.id),
    ...spaceGrants.map((value) => value.id),
    ...taskStatuses.map((value) => value.id),
    ...captures.map((value) => value.id),
    ...tasks.map((value) => value.id),
    ...projects.map((value) => value.id),
    ...relations.map((value) => value.id),
    ...undoDescriptors.map((value) => value.targetCommandId),
  ]);
  const idempotencyPrefix = `${workspaceId}:${current.principalId}:`;
  return toHubSnapshot({
    workspaces: state.workspaces,
    spaces: state.spaces.filter((value) => spaces.has(value.id)),
    memberships,
    spaceGrants,
    taskStatuses,
    captures,
    tasks,
    projects,
    relations,
    undoDescriptors,
    events,
    auditReceipts,
    idempotencyRecords: state.idempotencyRecords.filter(
      (value) =>
        value.scope.startsWith(idempotencyPrefix) &&
        value.outcome.outcome === "success" &&
        value.outcome.affected.every((affected) =>
          allowedRecordIds.has(affected.recordId),
        ),
    ),
    outboxEntries,
  });
};
