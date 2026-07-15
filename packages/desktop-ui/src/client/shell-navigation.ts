import type { ProjectId, TaskId } from "@constellation/contracts";

import type { SurfaceId } from "./wave2-fixtures.js";

const MAX_TABS = 7;
const MAX_HISTORY = 32;

export interface ShellContext {
  readonly key: string;
  readonly label: string;
  readonly surface: SurfaceId;
  readonly taskId?: TaskId;
  readonly projectId?: ProjectId;
}

export interface ShellNavigationState {
  readonly tabs: readonly ShellContext[];
  readonly activeKey: string;
  readonly history: readonly string[];
  readonly historyIndex: number;
}

const RESTORABLE_SURFACES = new Set<SurfaceId>([
  "cockpit",
  "work",
  "tasks",
  "projects",
  "history",
  "activity",
  "attention",
  "access",
  "documents",
  "meetings",
  "relationships",
  "settings",
]);

export const serializeShellNavigation = (state: ShellNavigationState): string =>
  JSON.stringify({ version: 1, state });

export const restoreShellNavigation = (
  value: string | null,
  fallback: ShellContext,
): ShellNavigationState => {
  if (value === null) return createShellNavigation(fallback);
  try {
    const parsed = JSON.parse(value) as {
      readonly version?: unknown;
      readonly state?: Partial<ShellNavigationState>;
    };
    const state = parsed.state;
    if (
      parsed.version !== 1 ||
      state === undefined ||
      !Array.isArray(state.tabs) ||
      state.tabs.length === 0 ||
      state.tabs.length > MAX_TABS ||
      typeof state.activeKey !== "string" ||
      !Array.isArray(state.history) ||
      typeof state.historyIndex !== "number"
    )
      return createShellNavigation(fallback);
    const tabs = state.tabs.filter(
      (tab): tab is ShellContext =>
        typeof tab === "object" &&
        tab !== null &&
        typeof tab.key === "string" &&
        typeof tab.label === "string" &&
        RESTORABLE_SURFACES.has(tab.surface),
    );
    if (tabs.length !== state.tabs.length)
      return createShellNavigation(fallback);
    if (!tabs.some((tab) => tab.key === state.activeKey))
      return createShellNavigation(fallback);
    const keys = new Set(tabs.map((tab) => tab.key));
    const history = state.history.filter(
      (key): key is string => typeof key === "string" && keys.has(key),
    );
    if (history.length === 0) return createShellNavigation(fallback);
    return {
      tabs,
      activeKey: state.activeKey,
      history: history.slice(-MAX_HISTORY),
      historyIndex: Math.min(
        Math.max(0, Math.trunc(state.historyIndex)),
        history.length - 1,
      ),
    };
  } catch {
    return createShellNavigation(fallback);
  }
};

export const pruneInaccessibleShellContexts = (
  state: ShellNavigationState,
  access: {
    readonly taskIds: ReadonlySet<TaskId>;
    readonly projectIds: ReadonlySet<ProjectId>;
  },
  fallback: ShellContext,
): ShellNavigationState => {
  const tabs = state.tabs.filter(
    (tab) =>
      (tab.taskId === undefined || access.taskIds.has(tab.taskId)) &&
      (tab.projectId === undefined || access.projectIds.has(tab.projectId)),
  );
  if (tabs.length === 0) return createShellNavigation(fallback);
  const keys = new Set(tabs.map((tab) => tab.key));
  const activeKey = keys.has(state.activeKey) ? state.activeKey : tabs[0]!.key;
  let history = state.history.filter((key) => keys.has(key));
  let historyIndex = Math.min(state.historyIndex, history.length - 1);
  if (history.length === 0) {
    history = [activeKey];
    historyIndex = 0;
  } else if (history[historyIndex] !== activeKey) {
    history = [...history.slice(0, historyIndex + 1), activeKey];
    historyIndex = history.length - 1;
  }
  if (
    tabs.length === state.tabs.length &&
    history.length === state.history.length &&
    activeKey === state.activeKey &&
    historyIndex === state.historyIndex
  ) {
    return state;
  }
  return { tabs, activeKey, history, historyIndex };
};

export const destinationContext = (
  surface: SurfaceId,
  label: string,
): ShellContext => ({ key: `destination:${surface}`, label, surface });

export const taskContext = (taskId: TaskId, label: string): ShellContext => ({
  key: `task:${taskId}`,
  label,
  surface: "tasks",
  taskId,
});

export const projectContext = (
  projectId: ProjectId,
  label: string,
): ShellContext => ({
  key: `project:${projectId}`,
  label,
  surface: "projects",
  projectId,
});

export const createShellNavigation = (
  initial: ShellContext,
): ShellNavigationState => ({
  tabs: [initial],
  activeKey: initial.key,
  history: [initial.key],
  historyIndex: 0,
});

export const activeShellContext = (state: ShellNavigationState): ShellContext =>
  state.tabs.find((tab) => tab.key === state.activeKey) ?? state.tabs[0]!;

export const destinationShortcutIndex = (code: string): number | undefined => {
  const match = /^Digit([1-9])$/.exec(code);
  return match?.[1] === undefined ? undefined : Number(match[1]) - 1;
};

const appendHistory = (
  state: ShellNavigationState,
  key: string,
): Pick<ShellNavigationState, "history" | "historyIndex"> => {
  const current = state.history[state.historyIndex];
  if (current === key) return state;
  const history = [
    ...state.history.slice(0, state.historyIndex + 1),
    key,
  ].slice(-MAX_HISTORY);
  return { history, historyIndex: history.length - 1 };
};

export const openShellContext = (
  state: ShellNavigationState,
  context: ShellContext,
): ShellNavigationState => {
  const existing = state.tabs.findIndex((tab) => tab.key === context.key);
  let tabs =
    existing < 0
      ? [...state.tabs, context]
      : state.tabs.map((tab, index) => (index === existing ? context : tab));
  if (tabs.length > MAX_TABS) {
    const removable = tabs.findIndex(
      (tab, index) => index > 0 && tab.key !== state.activeKey,
    );
    tabs = tabs.filter((_, index) => index !== (removable < 0 ? 1 : removable));
  }
  return {
    ...state,
    ...appendHistory(state, context.key),
    tabs,
    activeKey: context.key,
  };
};

export const activateShellContext = (
  state: ShellNavigationState,
  key: string,
): ShellNavigationState => {
  if (!state.tabs.some((tab) => tab.key === key)) return state;
  return {
    ...state,
    ...appendHistory(state, key),
    activeKey: key,
  };
};

export const moveShellHistory = (
  state: ShellNavigationState,
  direction: -1 | 1,
): ShellNavigationState => {
  let index = state.historyIndex + direction;
  while (index >= 0 && index < state.history.length) {
    const key = state.history[index];
    if (key !== undefined && state.tabs.some((tab) => tab.key === key)) {
      return { ...state, activeKey: key, historyIndex: index };
    }
    index += direction;
  }
  return state;
};

export const closeShellContext = (
  state: ShellNavigationState,
  key: string,
): ShellNavigationState => {
  if (state.tabs.length === 1) return state;
  const closingIndex = state.tabs.findIndex((tab) => tab.key === key);
  if (closingIndex < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.key !== key);
  if (state.activeKey !== key) return { ...state, tabs };
  const fallback = tabs[Math.min(closingIndex, tabs.length - 1)]!;
  return openShellContext(
    { ...state, tabs, activeKey: fallback.key },
    fallback,
  );
};

export const canMoveShellHistory = (
  state: ShellNavigationState,
  direction: -1 | 1,
): boolean => moveShellHistory(state, direction) !== state;
