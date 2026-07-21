import type { DocumentId, ProjectId, TaskId } from "@constellation/contracts";

import type { SurfaceId } from "./wave2-fixtures.js";

const MAX_TABS = 7;
const MAX_HISTORY = 32;

export interface ShellContext {
  readonly key: string;
  readonly label: string;
  readonly surface: SurfaceId;
  readonly taskId?: TaskId;
  readonly projectId?: ProjectId;
  readonly documentId?: DocumentId;
}

// Wpisy historii pochodzące z nawigacji w obrębie jednej karty niosą marker
// inCard: tylko takie wpisy wolno z powrotem zmaterializować w aktywnej
// karcie. Wpisy dopisane przy otwieraniu, przełączaniu i zamykaniu kart są
// pomijane, gdy ich karta nie jest już otwarta — Wstecz nie podmienia wtedy
// cudzej karty.
export interface ShellHistoryEntry extends ShellContext {
  readonly inCard?: boolean;
}

export interface ShellNavigationState {
  readonly tabs: readonly ShellContext[];
  readonly activeKey: string;
  readonly history: readonly ShellHistoryEntry[];
  readonly historyIndex: number;
}

export interface ShellOpenOutcome {
  readonly state: ShellNavigationState;
  readonly evictedContext?: ShellContext;
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

const isRestorableShellContext = (value: unknown): value is ShellContext => {
  if (typeof value !== "object" || value === null) return false;
  const context = value as ShellContext;
  if (typeof context.key !== "string" || typeof context.label !== "string")
    return false;
  if (!RESTORABLE_SURFACES.has(context.surface)) return false;
  if (context.taskId !== undefined && typeof context.taskId !== "string")
    return false;
  if (context.projectId !== undefined && typeof context.projectId !== "string")
    return false;
  if (
    context.documentId !== undefined &&
    typeof context.documentId !== "string"
  )
    return false;
  // Prefiks klucza musi być spójny z obecnością identyfikatora — inaczej
  // wpis nigdy nie zostałby przycięty przez pruneInaccessibleShellContexts.
  if (context.key.startsWith("task:") && context.taskId === undefined)
    return false;
  if (context.key.startsWith("project:") && context.projectId === undefined)
    return false;
  if (context.key.startsWith("document:") && context.documentId === undefined)
    return false;
  return true;
};

export const serializeShellNavigation = (state: ShellNavigationState): string =>
  JSON.stringify({ version: 2, state });

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
      parsed.version !== 2 ||
      state === undefined ||
      !Array.isArray(state.tabs) ||
      state.tabs.length === 0 ||
      state.tabs.length > MAX_TABS ||
      typeof state.activeKey !== "string" ||
      !Array.isArray(state.history) ||
      typeof state.historyIndex !== "number"
    )
      return createShellNavigation(fallback);
    const tabs = state.tabs.filter(isRestorableShellContext);
    if (tabs.length !== state.tabs.length)
      return createShellNavigation(fallback);
    if (!tabs.some((tab) => tab.key === state.activeKey))
      return createShellNavigation(fallback);
    const history = state.history.filter(isRestorableShellContext);
    if (history.length !== state.history.length || history.length === 0)
      return createShellNavigation(fallback);
    // Indeks klamrowany PO przycięciu historii i skorygowany o wpisy odcięte
    // z przodu — inaczej przerośnięta historia zostawia indeks poza zakresem.
    const bounded = history.slice(-MAX_HISTORY);
    const dropped = history.length - bounded.length;
    return {
      tabs,
      activeKey: state.activeKey,
      history: bounded,
      historyIndex: Math.min(
        Math.max(0, Math.trunc(state.historyIndex) - dropped),
        bounded.length - 1,
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
    readonly documentIds: ReadonlySet<DocumentId>;
  },
  fallback: ShellContext,
): ShellNavigationState => {
  const accessible = (context: ShellContext): boolean =>
    (context.taskId === undefined || access.taskIds.has(context.taskId)) &&
    (context.projectId === undefined ||
      access.projectIds.has(context.projectId)) &&
    (context.documentId === undefined ||
      access.documentIds.has(context.documentId));
  const tabs = state.tabs.filter(accessible);
  if (tabs.length === 0) return createShellNavigation(fallback);
  const activeKey = tabs.some((tab) => tab.key === state.activeKey)
    ? state.activeKey
    : tabs[0]!.key;
  const active = tabs.find((tab) => tab.key === activeKey)!;
  let history = state.history.filter(accessible);
  let historyIndex = Math.min(state.historyIndex, history.length - 1);
  if (history.length === 0) {
    history = [active];
    historyIndex = 0;
  } else if (history[historyIndex]!.key !== activeKey) {
    history = [...history.slice(0, historyIndex + 1), active];
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

export const documentContext = (
  documentId: DocumentId,
  label: string,
): ShellContext => ({
  key: `document:${documentId}`,
  label,
  surface: "documents",
  documentId,
});

export const createShellNavigation = (
  initial: ShellContext,
): ShellNavigationState => ({
  tabs: [initial],
  activeKey: initial.key,
  history: [initial],
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
  context: ShellHistoryEntry,
): Pick<ShellNavigationState, "history" | "historyIndex"> => {
  const current = state.history[state.historyIndex];
  if (current?.key === context.key) {
    if (current === context) return state;
    return {
      history: state.history.map((entry, index) =>
        index === state.historyIndex ? context : entry,
      ),
      historyIndex: state.historyIndex,
    };
  }
  const history = [
    ...state.history.slice(0, state.historyIndex + 1),
    context,
  ].slice(-MAX_HISTORY);
  return { history, historyIndex: history.length - 1 };
};

export const openShellContextReportingEviction = (
  state: ShellNavigationState,
  context: ShellContext,
): ShellOpenOutcome => {
  const existing = state.tabs.findIndex((tab) => tab.key === context.key);
  let tabs =
    existing < 0
      ? [...state.tabs, context]
      : state.tabs.map((tab, index) => (index === existing ? context : tab));
  let evictedContext: ShellContext | undefined;
  if (tabs.length > MAX_TABS) {
    const removable = tabs.findIndex(
      (tab, index) => index > 0 && tab.key !== state.activeKey,
    );
    const removeIndex = removable < 0 ? 1 : removable;
    evictedContext = tabs[removeIndex];
    tabs = tabs.filter((_, index) => index !== removeIndex);
  }
  const next: ShellNavigationState = {
    ...state,
    ...appendHistory(state, context),
    tabs,
    activeKey: context.key,
  };
  return evictedContext === undefined
    ? { state: next }
    : { state: next, evictedContext };
};

export const openShellContext = (
  state: ShellNavigationState,
  context: ShellContext,
): ShellNavigationState =>
  openShellContextReportingEviction(state, context).state;

export const navigateShellContext = (
  state: ShellNavigationState,
  context: ShellContext,
): ShellNavigationState => {
  const existing = state.tabs.findIndex((tab) => tab.key === context.key);
  if (existing >= 0) {
    const tabs = state.tabs.map((tab, index) =>
      index === existing ? context : tab,
    );
    return {
      ...state,
      ...appendHistory(state, context),
      tabs,
      activeKey: context.key,
    };
  }
  const activeIndex = state.tabs.findIndex(
    (tab) => tab.key === state.activeKey,
  );
  if (activeIndex < 0) return openShellContext(state, context);
  const tabs = state.tabs.map((tab, index) =>
    index === activeIndex ? context : tab,
  );
  // Nawigacja w obrębie karty: zarówno opuszczany, jak i nowy wpis historii
  // należą do łańcucha tej karty, więc oba wolno przywrócić przez Wstecz.
  const marked: ShellNavigationState = {
    ...state,
    history: state.history.map((entry, index) =>
      index === state.historyIndex && entry.inCard !== true
        ? { ...entry, inCard: true }
        : entry,
    ),
  };
  return {
    ...state,
    ...appendHistory(marked, { ...context, inCard: true }),
    tabs,
    activeKey: context.key,
  };
};

export const activateShellContext = (
  state: ShellNavigationState,
  key: string,
): ShellNavigationState => {
  const tab = state.tabs.find((entry) => entry.key === key);
  if (tab === undefined) return state;
  return {
    ...state,
    ...appendHistory(state, tab),
    activeKey: key,
  };
};

export const moveShellHistory = (
  state: ShellNavigationState,
  direction: -1 | 1,
): ShellNavigationState => {
  let index = state.historyIndex + direction;
  while (index >= 0 && index < state.history.length) {
    const target = state.history[index];
    if (target === undefined) return state;
    if (state.tabs.some((tab) => tab.key === target.key)) {
      return { ...state, activeKey: target.key, historyIndex: index };
    }
    if (target.inCard === true) {
      const activeIndex = state.tabs.findIndex(
        (tab) => tab.key === state.activeKey,
      );
      const tabs =
        activeIndex < 0
          ? [...state.tabs, target]
          : state.tabs.map((tab, tabIndex) =>
              tabIndex === activeIndex ? target : tab,
            );
      return { ...state, tabs, activeKey: target.key, historyIndex: index };
    }
    // Wpis z zamkniętej lub eksmitowanej karty — pomijamy go, żeby Wstecz
    // nie podmieniał aktywnej karty na cudzy kontekst.
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

// Pomijanie wpisów w moveShellHistory sprawia, że sam zakres indeksu nie
// wystarcza — przycisk jest aktywny tylko, gdy ruch faktycznie coś zmienia.
export const canMoveShellHistory = (
  state: ShellNavigationState,
  direction: -1 | 1,
): boolean => moveShellHistory(state, direction) !== state;
