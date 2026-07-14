import { createHash } from "node:crypto";

import type { ReferenceStateSnapshot } from "@constellation/application";
import {
  HubWorkspaceSnapshotSchema,
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
