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
