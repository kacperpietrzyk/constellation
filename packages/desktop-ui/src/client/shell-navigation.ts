import type {
  DocumentId,
  ProjectId,
  StrategicRecordId,
  TaskId,
} from "@constellation/contracts";

import {
  desktopSurfaceIds,
  desktopSurfaceLabel,
  resolveDesktopSurface,
  type DesktopSurface as SurfaceId,
} from "@constellation/desktop-preload/surface-registry";

const MAX_TABS = 7;

// Trzy odczyty jednego celu nawigacji. Biblioteka jest JEDNYM celem — decyzja
// D-1 fali Knowledge — a Notatki, Źródła i Historia wrzutek są sposobami jej
// czytania, nie osobnymi zakładkami. Zamrożony prototyp niósł dokładnie ten
// kształt (`v3/app.js:1371-1374`, segmentowany przełącznik).
//
// Słownik stoi TUTAJ, a nie w `src/library/`, i to jest decyzja ZMIERZONA:
// powłoka nawigacji leży na ścieżce gorącej, więc import z leniwego katalogu
// Biblioteki kazał rolldownowi wydzielić z chunka wejściowego wspólny chunk
// preładowany. Zmierzone: ścieżka gorąca spadła o 3 177 B surowych, a URosła
// o 606 B po gzipie — bo dwadzieścia jeden chunków kompresuje się gorzej niż
// dwadzieścia. Kierunek zależności idzie więc od Biblioteki do powłoki i nigdy
// odwrotnie.
export const libraryReadings = ["notes", "sources", "captures"] as const;

export type LibraryReading = (typeof libraryReadings)[number];

export const isLibraryReading = (value: unknown): value is LibraryReading =>
  typeof value === "string" &&
  (libraryReadings as readonly string[]).includes(value);

const MAX_HISTORY = 32;

export interface ShellContext {
  readonly key: string;
  readonly label: string;
  readonly surface: SurfaceId;
  readonly taskId?: TaskId;
  readonly projectId?: ProjectId;
  readonly documentId?: DocumentId;
  readonly organizationId?: StrategicRecordId;
  /** The deal opened AS A RECORD. No `record` flag beside it, and the absence is
   *  the design: a task context is built at eleven call sites that mostly mean
   *  "take me to this task", so the promotion there has to be asked for. Every
   *  opportunity context in this program is built by somebody who means the
   *  record — the board holds a merely-SELECTED deal in the inspector instead,
   *  and never in a context. So carrying the id IS the request, and a second
   *  boolean would only be a way to build a context that asks for nothing. */
  readonly opportunityId?: StrategicRecordId;
  /** Set when the context was opened AS A RECORD rather than merely navigated
   *  to. See `taskContext` for why the promotion has to be asked for. */
  readonly record?: boolean;
  /** Który odczyt Biblioteki ma się otworzyć. Biblioteka jest JEDNYM celem
   *  o trzech odczytach, a dwa wywołania — wrzutka głosowa i wrzutka otwarta
   *  z Inboxa — mają trafić na Historię wrzutek, nie na domyślne Notatki.
   *  Przed wycofaniem celu `history` niosły to identyfikatorem powierzchni;
   *  po wycofaniu samo `surface: "library"` kompiluje się i wysyła człowieka
   *  nie tam, bez ani jednego błędu.
   *
   *  Pole siedzi na KONTEKŚCIE, a nie w stanie powłoki, z tego samego powodu
   *  co `record` przy zadaniu: zakładka ma się otworzyć jako to, czym była,
   *  więc przeżywa serializację. Nie wymaga podbicia
   *  `NAVIGATION_STATE_VERSION` — zapis bez tego pola czyta się dalej, a to
   *  z nim czyta starsza wersja, bo walidacja nie odrzuca nadmiarowych
   *  kluczy. */
  readonly libraryReading?: LibraryReading;
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

const RESTORABLE_SURFACES = new Set<SurfaceId>(desktopSurfaceIds);

const isRestorableShellContext = (value: unknown): value is ShellContext => {
  if (typeof value !== "object" || value === null) return false;
  const context = value as ShellContext;
  if (typeof context.key !== "string" || typeof context.label !== "string")
    return false;
  if (!RESTORABLE_SURFACES.has(context.surface)) return false;
  if (context.taskId !== undefined && typeof context.taskId !== "string")
    return false;
  if (context.record !== undefined && typeof context.record !== "boolean")
    return false;
  if (context.projectId !== undefined && typeof context.projectId !== "string")
    return false;
  if (
    context.documentId !== undefined &&
    typeof context.documentId !== "string"
  )
    return false;
  if (
    context.organizationId !== undefined &&
    typeof context.organizationId !== "string"
  )
    return false;
  if (
    context.opportunityId !== undefined &&
    typeof context.opportunityId !== "string"
  )
    return false;
  // Odczyt spoza słownika odrzuca CAŁY zapis, tak samo jak nieznana
  // powierzchnia: napis, którego powłoka nie zna, wpadłby do przełącznika
  // i nie wyrenderował żadnego z trzech odczytów.
  if (
    context.libraryReading !== undefined &&
    !isLibraryReading(context.libraryReading)
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
  if (
    context.key.startsWith("organization:") &&
    context.organizationId === undefined
  )
    return false;
  if (
    context.key.startsWith("opportunity:") &&
    context.opportunityId === undefined
  )
    return false;
  return true;
};

// Wersja 3 przyszła z przebudową 0.2.0: osiem identyfikatorów powierzchni
// zmieniło nazwę. Zapis idzie już w nowej wersji, ODCZYT przyjmuje obie —
// stan zapisany przez 0.1.9 ma się otworzyć, a nie wyparować.
const NAVIGATION_STATE_VERSION = 3;

export const serializeShellNavigation = (state: ShellNavigationState): string =>
  JSON.stringify({ version: NAVIGATION_STATE_VERSION, state });

// Kontekst zapisany pod starym identyfikatorem celu, przeniesiony na nowy.
// Cel, którego nie da się umiejscowić, zostaje nietknięty — odsiewa go dopiero
// `isRestorableShellContext`, a wołający traktuje to jako „nie ufam całemu
// zapisowi" i wraca na start. To jest świadomie mocniejsze niż wyrzucenie
// pojedynczej zakładki: zapis, którego połowy nie rozumiemy, mógł zostać
// napisany przez wersję, o której nic nie wiemy.
//
// Etykieta zakładki-celu jest odczytywana Z REJESTRU, a nie z zapisu. Zapis
// niesie własną kopię napisu sprzed aktualizacji, więc bez tego pierwsze
// uruchomienie po przebudowie pokazywałoby angielską nawigację i polskie
// zakładki naraz. Zakładki rekordów (`task:`, `project:`, …) zachowują swój
// tytuł — tam napis to nazwa cudzej pracy, nie etykieta interfejsu.
const migrateRestoredContext = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null) return value;
  const context = value as {
    readonly surface?: unknown;
    readonly key?: unknown;
  };
  const resolved = resolveDesktopSurface(context.surface);
  if (resolved === undefined) return value;
  const isDestination =
    typeof context.key === "string" && context.key.startsWith("destination:");
  if (!isDestination) {
    return resolved === context.surface
      ? value
      : { ...context, surface: resolved };
  }
  return {
    ...context,
    key: migrateContextKey(context.key as string),
    surface: resolved,
    label: desktopSurfaceLabel(resolved),
  };
};

// Klucz zakładki-celu niesie identyfikator powierzchni, więc przeniesienie
// celu MUSI przenieść też klucz — inaczej zapisany `activeKey` nie wskazuje
// żadnej z odtworzonych zakładek i cała sesja jest odrzucana. Drugi powód:
// zakładka zostawiona pod starym kluczem zdublowałaby się, gdy człowiek otworzy
// ten sam cel jeszcze raz.
const migrateContextKey = (key: string): string => {
  if (!key.startsWith("destination:")) return key;
  const resolved = resolveDesktopSurface(key.slice("destination:".length));
  return resolved === undefined ? key : `destination:${resolved}`;
};

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
      (parsed.version !== 2 && parsed.version !== NAVIGATION_STATE_VERSION) ||
      state === undefined ||
      !Array.isArray(state.tabs) ||
      state.tabs.length === 0 ||
      state.tabs.length > MAX_TABS ||
      typeof state.activeKey !== "string" ||
      !Array.isArray(state.history) ||
      typeof state.historyIndex !== "number"
    )
      return createShellNavigation(fallback);
    const tabs = state.tabs
      .map(migrateRestoredContext)
      .filter(isRestorableShellContext);
    if (tabs.length !== state.tabs.length)
      return createShellNavigation(fallback);
    const activeKey = migrateContextKey(state.activeKey);
    if (!tabs.some((tab) => tab.key === activeKey))
      return createShellNavigation(fallback);
    const history = state.history
      .map(migrateRestoredContext)
      .filter(isRestorableShellContext);
    if (history.length !== state.history.length || history.length === 0)
      return createShellNavigation(fallback);
    // Indeks klamrowany PO przycięciu historii i skorygowany o wpisy odcięte
    // z przodu — inaczej przerośnięta historia zostawia indeks poza zakresem.
    const bounded = history.slice(-MAX_HISTORY);
    const dropped = history.length - bounded.length;
    return {
      tabs,
      activeKey,
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
    readonly organizationIds: ReadonlySet<StrategicRecordId>;
    readonly opportunityIds: ReadonlySet<StrategicRecordId>;
  },
  fallback: ShellContext,
): ShellNavigationState => {
  const accessible = (context: ShellContext): boolean =>
    (context.taskId === undefined || access.taskIds.has(context.taskId)) &&
    (context.projectId === undefined ||
      access.projectIds.has(context.projectId)) &&
    (context.documentId === undefined ||
      access.documentIds.has(context.documentId)) &&
    (context.organizationId === undefined ||
      access.organizationIds.has(context.organizationId)) &&
    // A deal removed, or in a Space this reader lost, must not leave a tab that
    // reopens onto a record nothing can find. The record screen's own gate is
    // "the surface found it"; this is the gate for the tab that outlived it.
    (context.opportunityId === undefined ||
      access.opportunityIds.has(context.opportunityId));
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

/**
 * Biblioteka otwarta NA KONKRETNYM ODCZYCIE.
 *
 * Klucz jest ten sam co u zwykłego celu (`destination:library`), i to jest
 * zamierzone: Biblioteka to jeden cel, więc otwarcie jej z inną etykietą
 * podmienia tę samą zakładkę, zamiast robić drugą pod tym samym ekranem.
 * `openShellContextReportingEviction` podmienia istniejącą zakładkę CAŁYM
 * nowym kontekstem, więc żądany odczyt dojeżdża także wtedy, gdy Biblioteka
 * jest już otwarta.
 */
export const libraryReadingContext = (
  reading: LibraryReading,
  label: string,
): ShellContext => ({
  key: "destination:library",
  label,
  surface: "library",
  libraryReading: reading,
});

/**
 * A task in context — and, when it is asked for, the task opened as a RECORD.
 *
 * The promotion is OPT-IN, and that is the whole point of the flag. Eleven call
 * sites build a task context and most of them mean "take me to this task": a
 * capture that just became one, a signal activated from the operating system, a
 * reference followed out of a document. Those want the collection with the task
 * in hand. Only a deliberate open — Enter or a double click on a row, or a
 * subtask followed out of a record — means "show me this task instead of the
 * list".
 *
 * It was not opt-in for one CI cycle, and every one of those eleven started
 * landing on a record: the packaged smoke turned a capture into a task and then
 * looked for its row on a screen that had replaced the list with the record.
 * The flag lives on the CONTEXT rather than in the shell's own state because a
 * tab has to reopen as what it was; it survives serialization for the same
 * reason.
 */
export const taskContext = (
  taskId: TaskId,
  label: string,
  options: { readonly record?: boolean } = {},
): ShellContext => ({
  key: `task:${taskId}`,
  label,
  surface: "tasks",
  taskId,
  ...(options.record === true ? { record: true } : {}),
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
  surface: "library",
  documentId,
});

export const organizationContext = (
  organizationId: StrategicRecordId,
  label: string,
): ShellContext => ({
  key: `organization:${organizationId}`,
  label,
  surface: "organizations",
  organizationId,
});

/**
 * A deal in context, and it is always the RECORD.
 *
 * The surface is `pipeline` because that is where the record lives — a context
 * on the board exactly as the task record is a context on `tasks`. It is not a
 * destination of its own: a nav target that is a record is a display case, and
 * `DesktopSurface` is the only vocabulary `ShellContext.surface` accepts.
 */
export const opportunityContext = (
  opportunityId: StrategicRecordId,
  label: string,
): ShellContext => ({
  key: `opportunity:${opportunityId}`,
  label,
  surface: "pipeline",
  opportunityId,
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
