import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { WorkspaceIdSchema, type WorkspaceId } from "@constellation/contracts";

const REGISTRY_FILE = "workspace-registry.json";

export interface RegisteredWorkspace {
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly relativeStateRoot: string;
}

export interface WorkspaceRegistryState {
  readonly activeWorkspaceId: WorkspaceId;
  readonly workspaces: readonly RegisteredWorkspace[];
}

const validRelativeRoot = (value: string): boolean =>
  value === "." ||
  (/^workspaces\/[0-9a-f-]{36}$/.test(value) &&
    !value.includes("..") &&
    !path.isAbsolute(value));

const parseRegistry = (raw: unknown): WorkspaceRegistryState | undefined => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return undefined;
  const record = raw as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.workspaces))
    return undefined;
  let activeWorkspaceId: WorkspaceId;
  try {
    activeWorkspaceId = WorkspaceIdSchema.parse(record.activeWorkspaceId);
  } catch {
    return undefined;
  }
  const workspaces: RegisteredWorkspace[] = [];
  for (const item of record.workspaces) {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      return undefined;
    const entry = item as Record<string, unknown>;
    let workspaceId: WorkspaceId;
    try {
      workspaceId = WorkspaceIdSchema.parse(entry.workspaceId);
    } catch {
      return undefined;
    }
    if (
      typeof entry.name !== "string" ||
      entry.name.trim().length === 0 ||
      entry.name.length > 120 ||
      typeof entry.relativeStateRoot !== "string" ||
      !validRelativeRoot(entry.relativeStateRoot)
    )
      return undefined;
    workspaces.push({
      workspaceId,
      name: entry.name,
      relativeStateRoot: entry.relativeStateRoot,
    });
  }
  if (
    workspaces.length === 0 ||
    new Set(workspaces.map((item) => item.workspaceId)).size !==
      workspaces.length ||
    new Set(workspaces.map((item) => item.relativeStateRoot)).size !==
      workspaces.length ||
    !workspaces.some((item) => item.workspaceId === activeWorkspaceId)
  )
    return undefined;
  return { activeWorkspaceId, workspaces };
};

export const loadWorkspaceRegistry = (
  baseRoot: string,
): WorkspaceRegistryState | undefined => {
  try {
    return parseRegistry(
      JSON.parse(readFileSync(path.join(baseRoot, REGISTRY_FILE), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("WORKSPACE_REGISTRY_INVALID", { cause: error });
  }
};

export const resolveWorkspaceStateRoot = (
  baseRoot: string,
  workspace: RegisteredWorkspace,
): string => {
  const resolved = path.resolve(baseRoot, workspace.relativeStateRoot);
  if (
    resolved !== path.resolve(baseRoot) &&
    !resolved.startsWith(`${path.resolve(baseRoot)}${path.sep}`)
  )
    throw new Error("WORKSPACE_REGISTRY_PATH_INVALID");
  return resolved;
};

export const persistWorkspaceRegistry = (
  baseRoot: string,
  state: WorkspaceRegistryState,
): void => {
  mkdirSync(baseRoot, { recursive: true, mode: 0o700 });
  const filename = path.join(baseRoot, REGISTRY_FILE);
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    writeFileSync(
      temporary,
      `${JSON.stringify({ version: 1, ...state }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    renameSync(temporary, filename);
  } finally {
    rmSync(temporary, { force: true });
  }
};

export const ensureRegisteredWorkspace = (
  baseRoot: string,
  workspace: RegisteredWorkspace,
): WorkspaceRegistryState => {
  const current = loadWorkspaceRegistry(baseRoot);
  if (current === undefined) {
    const created = {
      activeWorkspaceId: workspace.workspaceId,
      workspaces: [workspace],
    } satisfies WorkspaceRegistryState;
    persistWorkspaceRegistry(baseRoot, created);
    return created;
  }
  const replacementIndex = current.workspaces.findIndex(
    (item) =>
      item.workspaceId === workspace.workspaceId ||
      item.relativeStateRoot === workspace.relativeStateRoot,
  );
  const existing = current.workspaces[replacementIndex];
  if (
    existing?.workspaceId === workspace.workspaceId &&
    existing.name === workspace.name &&
    existing.relativeStateRoot === workspace.relativeStateRoot &&
    current.activeWorkspaceId === workspace.workspaceId
  )
    return current;
  const workspaces = current.workspaces
    .map((item, index) => (index === replacementIndex ? workspace : item))
    .filter(
      (item, index) =>
        index === replacementIndex ||
        (item.workspaceId !== workspace.workspaceId &&
          item.relativeStateRoot !== workspace.relativeStateRoot),
    );
  if (replacementIndex < 0) workspaces.push(workspace);
  const next = {
    activeWorkspaceId: workspace.workspaceId,
    workspaces,
  } satisfies WorkspaceRegistryState;
  persistWorkspaceRegistry(baseRoot, next);
  return next;
};

export const setActiveRegisteredWorkspace = (
  baseRoot: string,
  workspaceId: WorkspaceId,
): WorkspaceRegistryState => {
  const current = loadWorkspaceRegistry(baseRoot);
  if (
    current === undefined ||
    !current.workspaces.some((item) => item.workspaceId === workspaceId)
  )
    throw new Error("WORKSPACE_REGISTRY_ENTRY_MISSING");
  const next = { ...current, activeWorkspaceId: workspaceId };
  persistWorkspaceRegistry(baseRoot, next);
  return next;
};

export const renameRegisteredWorkspace = (
  baseRoot: string,
  workspaceId: WorkspaceId,
  name: string,
): void => {
  const current = loadWorkspaceRegistry(baseRoot);
  if (current === undefined) return;
  const next = {
    ...current,
    workspaces: current.workspaces.map((item) =>
      item.workspaceId === workspaceId ? { ...item, name } : item,
    ),
  };
  persistWorkspaceRegistry(baseRoot, next);
};
