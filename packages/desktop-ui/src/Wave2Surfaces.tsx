import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  CaptureId,
  CommandId,
  PrincipalId,
  ProjectId,
  RelationId,
  TaskId,
  TaskStatusId,
} from "@constellation/contracts";
import type {
  ConstellationRendererClient,
  DesktopWorkspaceCockpitEntry,
} from "@constellation/desktop-preload/client";

import {
  searchGlobal,
  type ActivityProjection,
  type DesktopSnapshot,
  type MutationFailure,
  type ProjectOverviewProjection,
  type SearchProjection,
  type UndoPreview,
} from "./client/workflow.js";
import type { SurfaceId } from "./client/wave2-fixtures.js";
import { Icon } from "./components/Icon.js";
import { modifierLabel } from "./components/ShortcutsOverlay.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import {
  countLabel,
  formatDateTime,
  formatTime,
  recordKindLabels,
} from "./i18n.js";

const Mark = ({ kind }: { readonly kind: string }) => (
  <span className={`record-mark mark-${kind}`} aria-hidden="true" />
);

const SurfaceHeader = ({
  kicker,
  title,
  description,
  action,
}: {
  readonly kicker: string;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}) => (
  <header className="surface-header wave2-header">
    <div>
      <p className="eyebrow">{kicker}</p>
      <h1 id="surface-title" tabIndex={-1}>
        {title}
      </h1>
      <p>{description}</p>
    </div>
    {action}
  </header>
);

// Tone separates a benign empty ("no open work this week") from a genuine
// warning. Amber is reserved for warnings only (tokens.md), so the default is
// neutral: a forgotten tone degrades to calm, never a false alarm.
type InlineStateTone = "neutral" | "info" | "warning";

const InlineState = ({
  title,
  detail,
  action,
  tone = "neutral",
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
  readonly tone?: InlineStateTone;
}) => (
  <div
    className={`empty-state empty-state--${tone}`}
    role={tone === "warning" ? "alert" : "status"}
  >
    <span className="empty-glyph">
      <Mark
        kind={
          tone === "warning" ? "warning" : tone === "info" ? "info" : "empty"
        }
      />
    </span>
    <div>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
    {action}
  </div>
);

// The cockpit's differentiator is that its order is a deterministic *rule*, not
// a model. The raw score (100/120/…) is an internal scale with no external
// meaning, so it never reaches the product. Instead we surface only the reasons
// that *distinguish* an entry. `task_open` is true of every eligible entry, so
// it is dropped — it restates the eligibility filter, not a distinction.
type CockpitFocusReason =
  | { readonly code: "task_open" }
  | { readonly code: "created_this_week" }
  | {
      readonly code: "active_project";
      readonly projectId: ProjectId;
      readonly projectTitle: string;
    };

interface CuratedFocusReason {
  readonly createdThisWeek: boolean;
  readonly project: { readonly id: ProjectId; readonly title: string } | null;
}

const curateFocusReason = (
  reasons: readonly CockpitFocusReason[],
): CuratedFocusReason => {
  const active = reasons.find(
    (
      reason,
    ): reason is Extract<CockpitFocusReason, { code: "active_project" }> =>
      reason.code === "active_project",
  );
  return {
    createdThisWeek: reasons.some((r) => r.code === "created_this_week"),
    // The active_project reason carries the title used to label the link;
    // relatedProjectId alone has no title, so it cannot back a labelled link.
    project: active
      ? { id: active.projectId, title: active.projectTitle }
      : null,
  };
};

// Plain-text differentiator parts for the ranked rows (no nested controls:
// rows stay single whole-row buttons). "Dziś" sharpens "w tym tygodniu" and is
// computed against the workspace timezone, never the machine locale.
const focusReasonParts = (
  reasons: readonly CockpitFocusReason[],
  createdToday: boolean,
): string[] => {
  const { createdThisWeek, project } = curateFocusReason(reasons);
  const parts: string[] = [];
  if (createdToday) parts.push("Utworzone dziś");
  else if (createdThisWeek) parts.push("Utworzone w tym tygodniu");
  if (project) parts.push(`Z projektu „${project.title}”`);
  return parts;
};

// A calendar-day key (YYYY-MM-DD) in the workspace timezone. Invalid or
// unsupported timezone identifiers degrade to the machine timezone instead of
// breaking the surface.
const dateKeyInTimeZone = (date: Date, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
};

// Human week range ("13–19 lipca 2026") instead of raw ISO dates. The inputs
// are plain dates, so they are anchored at local midnight — no timezone shift.
const weekRangeLabel = (weekStart: string, weekEnd: string): string => {
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).formatRange(
      new Date(`${weekStart}T00:00:00`),
      new Date(`${weekEnd}T00:00:00`),
    );
  } catch {
    return `${weekStart} – ${weekEnd}`;
  }
};

const unreadSignalsLabel = (count: number): string =>
  countLabel(
    count,
    "nieprzeczytany sygnał",
    "nieprzeczytane sygnały",
    "nieprzeczytanych sygnałów",
  );

// Hero differentiator, where the project name is a real deep link (the hero is
// a non-button container, so a control here is valid).
const HeroFocusReason = ({
  reasons,
  createdToday,
  onOpenProject,
}: {
  readonly reasons: readonly CockpitFocusReason[];
  readonly createdToday: boolean;
  readonly onOpenProject: (id: ProjectId) => void;
}) => {
  const { createdThisWeek, project } = curateFocusReason(reasons);
  const createdLabel = createdToday
    ? "Utworzone dziś"
    : createdThisWeek
      ? "Utworzone w tym tygodniu"
      : null;
  if (!createdLabel && !project) {
    return <p className="now-reason">Otwarte zadanie w kolejności tygodnia.</p>;
  }
  return (
    <p className="now-reason">
      {createdLabel ? (
        <span className={createdToday ? "now-reason-today" : undefined}>
          {createdLabel}
        </span>
      ) : null}
      {createdLabel && project ? (
        <span className="now-reason-sep" aria-hidden="true">
          ·
        </span>
      ) : null}
      {project ? (
        <span>
          {createdLabel ? "z projektu " : "Z projektu "}
          <button
            type="button"
            className="reason-link"
            onClick={() => onOpenProject(project.id)}
          >
            {project.title}
          </button>
        </span>
      ) : null}
    </p>
  );
};

export const CockpitSurface = ({
  client,
  snapshot,
  selectedTaskId,
  selectedProjectId,
  onOpenProject,
  onSelectProject,
  onOpenTask,
  onSelectTask,
  onOpenAttention,
  onCapture,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly selectedProjectId: ProjectId | undefined;
  readonly onOpenProject: (id: ProjectId) => void;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onOpenAttention: () => void;
  readonly onCapture: () => void;
}) => {
  const cockpit = snapshot.cockpit;
  const projects = snapshot.projects;
  const focus = cockpit.kind === "ready" ? cockpit.data.focus : [];
  const projectItems = projects.kind === "ready" ? projects.data.items : [];
  // The cockpit rows reuse the WorkSurface state glyphs (dot / ring / rotated
  // square) instead of a uniform check, so open work never reads as done.
  const workTasks = new Map(
    snapshot.work.kind === "ready"
      ? snapshot.work.data.tasks.map((task) => [task.id, task] as const)
      : [],
  );
  const taskRecords = new Map(
    snapshot.tasks.map((task) => [task.id, task] as const),
  );
  // "Dziś" per workspace timezone: which of this week's entries were created
  // today, in the workspace's calendar, not the machine's.
  const timezone = snapshot.bootstrap.workspace.timezone;
  const todayKey = dateKeyInTimeZone(new Date(), timezone);
  const createdToday = new Set(
    snapshot.tasks
      .filter(
        (task) =>
          dateKeyInTimeZone(new Date(task.createdAt), timezone) === todayKey,
      )
      .map((task) => task.id),
  );
  // One meta line per focus row: operational state as text (the state glyph is
  // shape only), assignment, then the differentiating reasons. Ellipsis, no
  // added colors.
  const focusRowMeta = (
    taskId: TaskId,
    reasons: readonly CockpitFocusReason[],
  ): string => {
    const record = taskRecords.get(taskId);
    const workTask = workTasks.get(taskId);
    const parts: string[] = [];
    if (workTask?.operationalState === "blocked") parts.push("Zablokowane");
    else if (workTask?.operationalState === "waiting")
      parts.push(
        workTask.waitingOn
          ? `Czeka na: ${workTask.waitingOn.label}`
          : "Oczekuje",
      );
    else if (record) parts.push(record.status.label);
    if (record?.assignment) parts.push(record.assignment.displayName);
    parts.push(...focusReasonParts(reasons, createdToday.has(taskId)));
    return parts.length === 0
      ? "Otwarte zadanie w kolejności tygodnia"
      : parts.join(" · ");
  };
  // Exceptions ahead of the queue: unread Attention signals with the oldest
  // titles, deep-linking to "Do uwagi". Amber only when signals exist — the
  // bar is absent at zero unread. A failed Attention projection must not look
  // like "no exceptions", so unavailability renders an explicit info state.
  const attention = snapshot.attention;
  const oldestUnread =
    attention.kind === "ready"
      ? attention.data.items
          .filter((item) => item.state === "unread")
          .toSorted((a, b) => a.occurredAt.localeCompare(b.occurredAt))
          .slice(0, 2)
      : [];
  const exceptionsBar =
    attention.kind === "unavailable" ? (
      <InlineState
        tone="info"
        title="Sygnały do uwagi są chwilowo niedostępne"
        detail={attention.message}
        action={
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenAttention}
          >
            Otwórz Do uwagi
          </button>
        }
      />
    ) : attention.kind === "ready" && attention.data.unreadCount > 0 ? (
      <section
        className="cockpit-exceptions"
        aria-label="Nieprzeczytane sygnały do uwagi"
      >
        <Mark kind="warning" />
        <p>
          <strong>{unreadSignalsLabel(attention.data.unreadCount)}</strong>
          {oldestUnread.length > 0 ? (
            <span>
              {oldestUnread.length === 1 ? "Najstarszy: " : "Najstarsze: "}
              {oldestUnread.map((item) => `„${item.title}”`).join(", ")}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          className="secondary-button compact"
          onClick={onOpenAttention}
        >
          Otwórz Do uwagi
        </button>
      </section>
    ) : null;
  const [ruleOpen, setRuleOpen] = useState(false);
  const focusNav = useListNavigation({
    itemCount: focus.length,
    selectOnFocus: true,
    onSelect: (index) => {
      const entry = focus[index];
      if (entry) onSelectTask(entry.taskId);
    },
    onOpen: (index) => {
      const entry = focus[index];
      if (entry) onOpenTask(entry.taskId);
    },
  });
  const projectNav = useListNavigation({
    itemCount: projectItems.length,
    selectOnFocus: true,
    onSelect: (index) => {
      const entry = projectItems[index];
      if (entry) onSelectProject(entry.id);
    },
    onOpen: (index) => {
      const entry = projectItems[index];
      if (entry) onOpenProject(entry.id);
    },
  });
  // The visible rank is a real shortcut: plain digits 1-9 open the n-th focus
  // whenever no dialog is open and no field is being edited. Documented in
  // shellShortcutGroups (ShortcutsOverlay) — the single source of shortcut copy.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!/^[1-9]$/.test(event.key)) return;
      if (document.querySelector("dialog[open]") !== null) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select") !== null)
      )
        return;
      const entry = focus[Number(event.key) - 1];
      if (entry === undefined) return;
      event.preventDefault();
      onOpenTask(entry.taskId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focus, onOpenTask]);
  const [workspaceFocus, setWorkspaceFocus] = useState<
    readonly DesktopWorkspaceCockpitEntry[]
  >([]);
  const [workspaceFocusUnavailable, setWorkspaceFocusUnavailable] =
    useState(false);
  useEffect(() => {
    if (!client?.getCrossWorkspaceCockpit) return;
    let active = true;
    void client
      .getCrossWorkspaceCockpit()
      .then((items) => {
        if (!active) return;
        setWorkspaceFocus(items);
        setWorkspaceFocusUnavailable(false);
      })
      .catch(() => active && setWorkspaceFocusUnavailable(true));
    return () => {
      active = false;
    };
  }, [client]);
  // The cross-workspace strip is administrative context, not this week's work,
  // so it renders after the hero and the exceptions bar: the brief's 30-second
  // orientation (first focus, exceptions) stays ahead of workspace switching.
  const workspaceStrip = (
    <>
      {workspaceFocus.length > 1 && (
        <section
          className="workspace-focus-strip"
          aria-labelledby="workspace-focus-title"
        >
          <header>
            <div>
              <p className="eyebrow">Twoje workspace</p>
              <h2 id="workspace-focus-title">Fokus według workspace</h2>
            </div>
            <span>
              {countLabel(
                workspaceFocus.length,
                "autoryzowany",
                "autoryzowane",
                "autoryzowanych",
              )}
            </span>
          </header>
          <div>
            {workspaceFocus.map((workspace) => (
              <button
                type="button"
                key={workspace.workspaceId}
                disabled={
                  workspace.active ||
                  workspace.availability === "unavailable" ||
                  !client?.switchWorkspace
                }
                onClick={() =>
                  client?.switchWorkspace?.({
                    workspaceId: workspace.workspaceId,
                  })
                }
              >
                <span>
                  <strong>{workspace.name}</strong>
                  <small>
                    {workspace.availability === "unavailable"
                      ? "Lokalna projekcja niedostępna"
                      : (workspace.firstFocus ?? "Brak otwartych działań")}
                  </small>
                </span>
                <em>
                  {workspace.active
                    ? "Otwarty"
                    : workspace.availability === "ready"
                      ? countLabel(
                          workspace.focusCount ?? 0,
                          "działanie",
                          "działania",
                          "działań",
                        )
                      : "Offline"}
                </em>
              </button>
            ))}
          </div>
        </section>
      )}
      {workspaceFocusUnavailable && (
        <InlineState
          tone="info"
          title="Przekrojowy fokus jest chwilowo niedostępny"
          detail="Bieżący workspace działa normalnie; pozostałe zaszyfrowane projekcje nie zostały otwarte."
        />
      )}
    </>
  );
  return (
    <div className="surface-scroll cockpit-surface">
      <SurfaceHeader
        kicker={
          cockpit.kind === "ready"
            ? weekRangeLabel(cockpit.data.weekStart, cockpit.data.weekEnd)
            : "Widok tygodnia"
        }
        title="Tydzień"
        description="Deterministyczna kolejność otwartych zadań i aktywnych projektów. Bez generowanych rekomendacji."
      />
      {cockpit.kind === "unavailable" ? (
        <>
          <InlineState
            tone="warning"
            title="Widok tygodnia jest niedostępny"
            detail={cockpit.message}
          />
          {exceptionsBar}
          {workspaceStrip}
        </>
      ) : focus.length === 0 ? (
        <>
          <InlineState
            title="Brak otwartych działań na ten tydzień"
            detail="Dodaj zadanie przez Quick Capture albo utwórz projekt z konkretnym wynikiem."
            action={
              <button className="secondary-button" onClick={onCapture}>
                Otwórz Quick Capture
              </button>
            }
          />
          {exceptionsBar}
          {workspaceStrip}
        </>
      ) : (
        <>
          <section className="now-panel" aria-labelledby="now-title">
            <div className="now-copy">
              <p className="eyebrow">Pierwszy fokus</p>
              <h2 id="now-title">{focus[0]?.title}</h2>
              {focus[0] ? (
                <HeroFocusReason
                  reasons={focus[0].reasons as readonly CockpitFocusReason[]}
                  createdToday={createdToday.has(focus[0].taskId)}
                  onOpenProject={onOpenProject}
                />
              ) : null}
            </div>
            <button
              className="primary-button"
              onClick={() => focus[0] && onOpenTask(focus[0].taskId)}
            >
              Otwórz zadanie
            </button>
          </section>
          {exceptionsBar}
          {workspaceStrip}
          <section
            className="active-work reading-panel"
            aria-labelledby="active-work-title"
          >
            <header className="section-heading">
              <div>
                <p className="eyebrow">Aktywna praca</p>
                <h2 id="active-work-title">Następne działania</h2>
              </div>
              <span>{focus.length} w kolejności</span>
            </header>
            <p className="ordering-rule">
              <span>
                Kolejność jest deterministyczna: otwarte zadania — najpierw
                utworzone w tym tygodniu i z aktywnych projektów.
              </span>
              <button
                type="button"
                className="ordering-rule-info"
                aria-expanded={ruleOpen}
                aria-controls="ordering-rule-detail"
                onClick={() => setRuleOpen((open) => !open)}
              >
                {ruleOpen ? "Ukryj szczegóły" : "Jak ustalana jest kolejność?"}
              </button>
            </p>
            {ruleOpen ? (
              <div
                id="ordering-rule-detail"
                className="ordering-rule-detail"
                role="region"
                aria-label="Reguła kolejności"
              >
                <p>
                  Widok nie generuje rekomendacji. Pokazuje wyłącznie otwarte
                  zadania i porządkuje je zawsze tak samo: najpierw utworzone w
                  tym tygodniu, potem powiązane z aktywnym projektem, a przy
                  remisie alfabetycznie. Ta sama kolejność wyjdzie za każdym
                  razem.
                </p>
              </div>
            ) : null}
            <div
              className="compact-record-list compact-record-list--focus"
              role="listbox"
              aria-label="Następne działania w kolejności tygodnia"
            >
              {focus.map((task, index) => {
                const state =
                  workTasks.get(task.taskId)?.operationalState ?? "actionable";
                const selected = task.taskId === selectedTaskId;
                return (
                  <button
                    key={task.taskId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`state-${state}${selected ? " selected" : ""}`}
                    {...focusNav(index)}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey)
                        onOpenTask(task.taskId);
                      else onSelectTask(task.taskId);
                    }}
                    onDoubleClick={() => onOpenTask(task.taskId)}
                  >
                    <span className="focus-rank" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="task-state-mark" aria-hidden="true" />
                    <span>
                      <strong>{task.title}</strong>
                      <small>
                        {focusRowMeta(
                          task.taskId,
                          task.reasons as readonly CockpitFocusReason[],
                        )}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
      <section
        className="outcome-rail reading-panel"
        aria-labelledby="outcomes-title"
      >
        <header className="section-heading">
          <div>
            <p className="eyebrow">Aktywne projekty</p>
            <h2 id="outcomes-title">Wyniki do osiągnięcia</h2>
          </div>
          <span>
            {projects.kind === "ready" ? projects.data.items.length : "—"}
          </span>
        </header>
        {projects.kind === "unavailable" ? (
          <InlineState
            tone="warning"
            title="Projekty są niedostępne"
            detail={projects.message}
          />
        ) : projectItems.length === 0 ? (
          <p className="capacity-note">Nie ma jeszcze aktywnych projektów.</p>
        ) : (
          <div role="listbox" aria-label="Aktywne projekty">
            {projectItems.map((project, index) => {
              const selected = project.id === selectedProjectId;
              return (
                <button
                  className={`outcome-row${selected ? " selected" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  key={project.id}
                  {...projectNav(index)}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey)
                      onOpenProject(project.id);
                    else onSelectProject(project.id);
                  }}
                  onDoubleClick={() => onOpenProject(project.id)}
                >
                  <span className="outcome-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{project.intendedOutcome}</strong>
                    <small>{project.title}</small>
                  </span>
                  <em>
                    {countLabel(
                      project.relatedOpenTaskCount,
                      "otwarte",
                      "otwarte",
                      "otwartych",
                    )}
                  </em>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export const TasksSurface = ({
  snapshot,
  selectedTaskId,
  busyTaskId,
  onOpenTask,
  onSelectTask,
  onCapture,
  onSetStatus,
  onSetCompleted,
  onSetAssignment,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly busyTaskId: TaskId | undefined;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onCapture: () => void;
  readonly onSetStatus: (id: TaskId, statusId: TaskStatusId) => void;
  readonly onSetCompleted: (id: TaskId, completed: boolean) => void;
  readonly onSetAssignment: (
    id: TaskId,
    principalId: PrincipalId | undefined,
  ) => void;
}) => {
  const taskNav = useListNavigation({
    itemCount: snapshot.tasks.length,
    onOpen: (index) => {
      const task = snapshot.tasks[index];
      if (task) onOpenTask(task.id);
    },
    onSelect: (index) => {
      const task = snapshot.tasks[index];
      if (task) onSelectTask(task.id);
    },
  });
  return (
    <div className="surface-scroll">
      <SurfaceHeader
        kicker="Root Space · lokalny widok"
        title="Zadania"
        description="Przechwycone działania, ich stan i zachowane źródła."
        action={
          <button className="secondary-button" onClick={onCapture}>
            <Icon name="capture" />
            <span>Nowe zadanie</span>
          </button>
        }
      />
      <section className="task-panel" aria-label="Lista zadań">
        <header>
          <div>
            <h2>Wszystkie zadania</h2>
            <span>{snapshot.tasks.length} w widoku</span>
          </div>
        </header>
        {snapshot.tasks.length === 0 ? (
          <InlineState
            title="Jeszcze nie ma zadań"
            detail="Zapisz pierwszą myśl. Oryginał pozostanie powiązany z wynikiem routingu."
            action={
              <button className="secondary-button" onClick={onCapture}>
                Otwórz Quick Capture
              </button>
            }
          />
        ) : (
          <div className="task-list">
            {snapshot.tasks.map((task, index) => (
              <div
                key={task.id}
                className={`task-row ${task.id === selectedTaskId ? "selected" : ""}`}
              >
                <button
                  className="task-check"
                  aria-label={
                    task.completionState === "completed"
                      ? `Otwórz ponownie: ${task.title}`
                      : `Ukończ: ${task.title}`
                  }
                  aria-pressed={task.completionState === "completed"}
                  disabled={busyTaskId === task.id}
                  onClick={() =>
                    onSetCompleted(
                      task.id,
                      task.completionState !== "completed",
                    )
                  }
                />
                <button
                  className="task-copy"
                  type="button"
                  {...taskNav(index)}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey) onOpenTask(task.id);
                    else onSelectTask(task.id);
                  }}
                  onDoubleClick={() => onOpenTask(task.id)}
                >
                  <strong>{task.title}</strong>
                  <span>
                    {task.sourceCaptureId
                      ? "Z Quick Capture · oryginał zachowany"
                      : "Root Space"}
                  </span>
                </button>
                <label className="sr-only" htmlFor={`status-${task.id}`}>
                  Status zadania {task.title}
                </label>
                <select
                  id={`status-${task.id}`}
                  className="task-status"
                  value={task.status.id}
                  disabled={busyTaskId === task.id}
                  onChange={(event) =>
                    onSetStatus(task.id, event.target.value as TaskStatusId)
                  }
                >
                  {snapshot.bootstrap.taskStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`assignee-${task.id}`}>
                  Osoba odpowiedzialna za {task.title}
                </label>
                <select
                  id={`assignee-${task.id}`}
                  className="task-assignee"
                  aria-label={`Osoba odpowiedzialna za ${task.title}`}
                  value={
                    task.assignment?.availability !== "active" &&
                    task.assignment
                      ? "unavailable-member"
                      : (task.assignment?.assigneePrincipalId ?? "")
                  }
                  disabled={
                    busyTaskId === task.id ||
                    snapshot.assignmentCandidates.kind !== "ready"
                  }
                  onChange={(event) =>
                    onSetAssignment(
                      task.id,
                      event.target.value === ""
                        ? undefined
                        : (event.target.value as PrincipalId),
                    )
                  }
                >
                  <option value="">Nieprzypisane</option>
                  {task.assignment?.availability !== "active" &&
                    task.assignment !== undefined && (
                      <option value="unavailable-member" disabled>
                        {task.assignment.availability === "former_member"
                          ? "Były członek"
                          : "Brak dostępu do Space"}
                      </option>
                    )}
                  {snapshot.assignmentCandidates.kind === "ready" &&
                    snapshot.assignmentCandidates.data.candidates.map(
                      (candidate) => (
                        <option
                          key={candidate.principalId}
                          value={candidate.principalId}
                        >
                          {candidate.displayName}
                          {candidate.participantKind === "guest"
                            ? " · gość"
                            : ""}
                        </option>
                      ),
                    )}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export const ProjectsSurface = ({
  snapshot,
  selectedProjectId,
  overview,
  relation,
  busy,
  onSelectProject,
  onCreate,
  onUpdateOutcome,
  onSetLifecycle,
  onRelate,
  onUnrelate,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedProjectId: ProjectId | undefined;
  readonly overview: ProjectOverviewProjection | undefined;
  readonly relation:
    | {
        readonly id: RelationId;
        readonly version: number;
        readonly taskId: TaskId;
      }
    | undefined;
  readonly busy: boolean;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onCreate: (title: string, outcome: string) => Promise<boolean>;
  readonly onUpdateOutcome: (outcome: string) => void;
  readonly onSetLifecycle: (lifecycle: "active" | "closed") => void;
  readonly onRelate: (taskId: TaskId) => void;
  readonly onUnrelate: () => void;
}) => {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState(
    overview?.project.intendedOutcome ?? "",
  );
  useEffect(
    () => setOutcome(overview?.project.intendedOutcome ?? ""),
    [overview],
  );
  const projects = snapshot.projects;
  const unrelated = snapshot.tasks.filter(
    (task) => !overview?.relatedTasks.some((related) => related.id === task.id),
  );
  return (
    <div className="surface-scroll project-surface">
      <SurfaceHeader
        kicker="Projekty · aktywne"
        title={overview?.project.title ?? "Projekty"}
        description="Operacyjny przegląd zamierzonego wyniku i powiązanej pracy."
        action={
          <button
            className="secondary-button"
            onClick={() => setCreating((value) => !value)}
          >
            <Icon name={creating ? "close" : "capture"} />
            <span>{creating ? "Anuluj" : "Nowy projekt"}</span>
          </button>
        }
      />
      {creating && (
        <form
          className="project-overview"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (title.trim() && outcome.trim()) {
              void onCreate(title, outcome).then((created) => {
                if (!created) return;
                setCreating(false);
                setTitle("");
                setOutcome("");
              });
            }
          }}
        >
          <div className="overview-intent">
            <label htmlFor="project-title">Nazwa projektu</label>
            <input
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label htmlFor="project-outcome">Zamierzony wynik</label>
            <textarea
              id="project-outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Tworzę…" : "Utwórz projekt"}
            </button>
          </div>
        </form>
      )}
      {projects.kind === "unavailable" ? (
        <InlineState
          tone="warning"
          title="Lista projektów jest niedostępna"
          detail={projects.message}
        />
      ) : projects.data.items.length === 0 ? (
        <InlineState
          title="Nie ma jeszcze projektów"
          detail="Utwórz projekt i nazwij wynik, po którym poznasz, że praca jest skończona."
        />
      ) : (
        <div className="cockpit-grid">
          <section
            className="outcome-rail reading-panel"
            aria-label="Lista projektów"
          >
            {projects.data.items.map((project) => (
              <button
                className={`outcome-row ${project.id === selectedProjectId ? "selected" : ""}`}
                key={project.id}
                onClick={() => onSelectProject(project.id)}
              >
                <Mark kind="project" />
                <span>
                  <strong>{project.title}</strong>
                  <small>{project.intendedOutcome}</small>
                </span>
                <em>{project.relatedOpenTaskCount} otw.</em>
              </button>
            ))}
          </section>
          {overview && (
            <section
              className="project-overview"
              aria-labelledby="project-outcome-title"
            >
              <div className="overview-intent">
                <p className="eyebrow">Zamierzony wynik</p>
                {editing ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      onUpdateOutcome(outcome);
                    }}
                  >
                    <label className="sr-only" htmlFor="edited-project-outcome">
                      Zamierzony wynik
                    </label>
                    <textarea
                      id="edited-project-outcome"
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value)}
                    />
                    <div className="capture-footer">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setEditing(false)}
                      >
                        Anuluj
                      </button>
                      <button
                        className="primary-button"
                        disabled={busy}
                        type="submit"
                      >
                        Zapisz wynik
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h2 id="project-outcome-title">
                      {overview.project.intendedOutcome}
                    </h2>
                    <div className="capture-footer">
                      <button
                        className="ghost-button"
                        onClick={() => setEditing(true)}
                      >
                        Edytuj wynik
                      </button>
                      <button
                        className="secondary-button compact"
                        disabled={busy}
                        onClick={() =>
                          onSetLifecycle(
                            overview.project.lifecycle === "active"
                              ? "closed"
                              : "active",
                          )
                        }
                      >
                        {overview.project.lifecycle === "active"
                          ? "Zamknij projekt"
                          : "Otwórz ponownie"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      )}
      {overview && (
        <section
          className="project-work reading-panel"
          aria-labelledby="project-work-title"
        >
          <header className="section-heading">
            <div>
              <p className="eyebrow">Powiązana praca</p>
              <h2 id="project-work-title">Zadania projektu</h2>
            </div>
            {relation ? (
              <button
                className="secondary-button compact"
                disabled={busy}
                onClick={onUnrelate}
              >
                Usuń ostatnie powiązanie
              </button>
            ) : unrelated[0] ? (
              <button
                className="secondary-button compact"
                disabled={busy}
                onClick={() => onRelate(unrelated[0]!.id)}
              >
                Powiąż „{unrelated[0].title}”
              </button>
            ) : null}
          </header>
          {overview.relatedTasks.length === 0 ? (
            <p className="capacity-note">
              Ten projekt nie ma jeszcze powiązanych zadań.
            </p>
          ) : (
            <div className="compact-record-list">
              {overview.relatedTasks.map((task) => (
                <div key={task.id} className="compact-record">
                  <Mark kind="task" />
                  <span>
                    <strong>{task.title}</strong>
                    <small>Powiązane z projektem</small>
                  </span>
                  <em>
                    {task.completionState === "completed"
                      ? "Ukończone"
                      : "Otwarte"}
                  </em>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export const HistorySurface = ({
  snapshot,
  onUndo,
  onDeleteVoiceAudio,
  busyCaptureId,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly onUndo: (targetCommandId: CommandId) => void;
  readonly onDeleteVoiceAudio: (captureId: CaptureId, version: number) => void;
  readonly busyCaptureId: CaptureId | undefined;
}) => {
  const activity =
    snapshot.activity.kind === "ready" ? snapshot.activity.data.items : [];
  return (
    <div className="surface-scroll">
      <SurfaceHeader
        kicker="Zachowane oryginały"
        title="Historia Capture"
        description="Udane przetworzenie pozostaje sprawdzalne i odwracalne, jeśli bieżące wersje na to pozwalają."
      />
      {snapshot.captures.length === 0 ? (
        <InlineState
          title="Historia Capture jest pusta"
          detail="Pierwszy zapis przez Quick Capture pojawi się tutaj wraz z wynikiem przetwarzania."
        />
      ) : (
        <div className="history-grid">
          {snapshot.captures.map((capture) => {
            const routeActivity = activity.find(
              (item) =>
                item.activityType === "capture_routed" &&
                item.recordId === capture.id,
            );
            return (
              <article className="history-card" key={capture.id}>
                <header>
                  <Mark kind="capture" />
                  <div>
                    <p className="eyebrow">
                      Oryginał ·{" "}
                      {capture.original.kind === "text"
                        ? "tekst"
                        : capture.original.kind === "url"
                          ? "link"
                          : capture.original.kind === "screenshot"
                            ? "screenshot"
                            : capture.original.kind === "managed_file"
                              ? "zarządzany plik"
                              : capture.original.kind === "voice_note"
                                ? "notatka głosowa"
                                : "odwołanie do pliku"}
                    </p>
                    <h2>{capture.originalText}</h2>
                  </div>
                  <time>
                    {formatTime(
                      capture.capturedAt,
                      snapshot.bootstrap.workspace.timezone,
                    )}
                  </time>
                </header>
                <ol className="processing-timeline">
                  <li className="done">
                    <i />
                    <div>
                      <strong>Zapisano oryginał</strong>
                      <span>
                        {capture.original.kind === "managed_file" ||
                        capture.original.kind === "screenshot" ||
                        capture.original.kind === "voice_note"
                          ? `Zaszyfrowana kopia · ${Math.ceil(capture.original.payload.byteLength / 1024).toLocaleString("pl-PL")} KB · integralność SHA-256`
                          : "Stan lokalny potwierdzony"}
                      </span>
                    </div>
                  </li>
                  <li className="current">
                    <i />
                    <div>
                      <strong>
                        {capture.processingState === "routed_as_task"
                          ? "Utworzono zadanie"
                          : capture.processingState ===
                              "routed_as_knowledge_source"
                            ? "Utworzono źródło wiedzy"
                            : capture.processingState === "needs_review"
                              ? "Wymaga decyzji w Attention"
                              : capture.processingState ===
                                  "awaiting_transcript"
                                ? "Oczekuje na transkrypcję agenta"
                                : capture.processingState === "transcript_ready"
                                  ? capture.audioState === "retained"
                                    ? "Transkrypcja gotowa · audio zachowane"
                                    : capture.audioState === "deleted"
                                      ? "Transkrypcja gotowa · audio usunięte"
                                      : "Transkrypcja gotowa · usuwanie audio"
                                  : capture.processingState === "unclassified"
                                    ? "Zachowano bez klasyfikacji"
                                    : "Oczekuje na przetworzenie"}
                      </strong>
                      <span>
                        {capture.processingState === "transcript_ready"
                          ? capture.transcript.text
                          : capture.originalText}
                      </span>
                      {capture.processingState === "transcript_ready" && (
                        <small>
                          Zapis: {capture.transcript.writtenByKind} ·{" "}
                          {formatDateTime(
                            capture.transcript.writtenAt,
                            snapshot.bootstrap.workspace.timezone,
                          )}
                          {capture.transcript.hostRunId
                            ? " · przebieg " + capture.transcript.hostRunId
                            : ""}
                        </small>
                      )}
                    </div>
                  </li>
                </ol>
                <footer>
                  <button
                    className="secondary-button"
                    disabled={routeActivity === undefined}
                    title={
                      routeActivity === undefined
                        ? "Brak odwracalnego polecenia dla tego Capture"
                        : undefined
                    }
                    onClick={() =>
                      routeActivity && onUndo(routeActivity.targetCommandId)
                    }
                  >
                    Podgląd cofnięcia
                  </button>
                  {capture.processingState === "transcript_ready" &&
                    capture.audioState === "retained" && (
                      <button
                        className="secondary-button"
                        disabled={busyCaptureId === capture.id}
                        onClick={() =>
                          onDeleteVoiceAudio(capture.id, capture.version)
                        }
                      >
                        {busyCaptureId === capture.id
                          ? "Usuwanie…"
                          : "Usuń zachowane audio"}
                      </button>
                    )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

const activityLabels: Record<
  ActivityProjection["items"][number]["activityType"],
  string
> = {
  capture_routed: "Capture przekształcono w zadanie",
  capture_transcript_ready: "Zapisano transkrypcję notatki głosowej",
  project_created: "Utworzono projekt",
  project_outcome_changed: "Zmieniono zamierzony wynik projektu",
  task_completed: "Ukończono zadanie",
  task_reopened: "Ponownie otwarto zadanie",
  task_assigned: "Przypisano odpowiedzialność za zadanie",
  task_unassigned: "Usunięto odpowiedzialność za zadanie",
  comment_added: "Dodano komentarz",
  comment_resolved: "Rozwiązano wątek komentarzy",
  comment_reopened: "Ponownie otwarto wątek komentarzy",
  relation_added: "Powiązano zadanie z projektem",
  relation_removed: "Usunięto powiązanie",
  knowledge_source_created: "Zachowano źródło wiedzy",
  knowledge_source_updated: "Zaktualizowano źródło wiedzy",
  knowledge_evidence_updated: "Zmieniono dowody dokumentu",
  knowledge_named_version_created: "Zamrożono nazwaną wersję",
  knowledge_named_version_voided: "Unieważniono nazwaną wersję",
  strategic_record_changed: "Zmieniono rekord strategiczny",
  command_undone: "Cofnięto polecenie",
};

export const ActivitySurface = ({
  activity,
  timezone,
  onUndo,
  onRetry,
}: {
  readonly activity: DesktopSnapshot["activity"];
  readonly timezone?: string;
  readonly onUndo: (targetCommandId: CommandId) => void;
  readonly onRetry: () => void;
}) => (
  <div className="surface-scroll">
    <SurfaceHeader
      kicker="Znacząca aktywność"
      title="Aktywność"
      description="Timeline pokazuje potwierdzone zmiany. Atrybucja i pełny receipt pozostają w audycie."
    />
    <section
      className="meaningful-timeline reading-panel"
      aria-labelledby="timeline-title"
    >
      <header className="section-heading">
        <div>
          <p className="eyebrow">Lokalny timeline</p>
          <h2 id="timeline-title">Ostatnie zmiany</h2>
        </div>
      </header>
      {activity.kind === "unavailable" ? (
        <InlineState
          title="Aktywność jest niedostępna"
          detail={activity.message}
          action={
            <button
              type="button"
              className="secondary-button"
              onClick={onRetry}
            >
              Spróbuj ponownie
            </button>
          }
        />
      ) : activity.data.items.length === 0 ? (
        <InlineState
          title="Nie ma jeszcze znaczących zmian"
          detail="Utworzenie projektu, routing Capture lub zmiana zadania pojawią się tutaj."
        />
      ) : (
        activity.data.items.map((item) => (
          <div className="activity-row" key={item.eventId}>
            <span className="actor-avatar actor-human">•</span>
            <span>
              <strong>{activityLabels[item.activityType]}</strong>
              <small>
                {formatDateTime(item.occurredAt, timezone)} · rekord{" "}
                {item.recordId.slice(0, 8)}
              </small>
            </span>
            <button
              className="ghost-button"
              onClick={() => onUndo(item.targetCommandId)}
            >
              Podgląd cofnięcia
            </button>
          </div>
        ))
      )}
    </section>
  </div>
);

const searchResultsCountLabel = (count: number) =>
  countLabel(count, "wynik", "wyniki", "wyników");

export const SearchOverlay = ({
  client,
  snapshot,
  destinations,
  onClose,
  onOpenDestination,
  onNavigate,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly destinations: readonly {
    readonly id: SurfaceId;
    readonly label: string;
    readonly shortcut?: string;
  }[];
  readonly onClose: () => void;
  readonly onOpenDestination: (surface: SurfaceId, label: string) => void;
  readonly onNavigate: (surface: SurfaceId, recordId: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { readonly kind: "idle" | "loading" }
    | { readonly kind: "ready"; readonly data: SearchProjection }
    | { readonly kind: "error"; readonly message: string }
  >({ kind: "idle" });
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    let active = true;
    const timer = window.setTimeout(() => {
      void searchGlobal(client, snapshot, text)
        .then((data) => active && setState({ kind: "ready", data }))
        .catch(
          (error: unknown) =>
            active &&
            setState({
              kind: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Wyszukiwanie jest niedostępne.",
            }),
        );
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, query, snapshot]);
  const results = state.kind === "ready" ? state.data.items : [];
  const commandResults = destinations.filter((item) =>
    item.label
      .toLocaleLowerCase("pl-PL")
      .includes(query.trim().toLocaleLowerCase("pl-PL")),
  );
  const optionCount = commandResults.length + results.length;
  const listboxVisible =
    state.kind === "idle" ||
    (state.kind === "ready" && optionCount > 0) ||
    (state.kind !== "ready" && commandResults.length > 0);
  useEffect(() => {
    document
      .getElementById(`search-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, optionCount]);
  const choose = (item: SearchProjection["items"][number] | undefined) => {
    if (!item) return;
    onNavigate(
      item.recordKind === "project"
        ? "projects"
        : item.recordKind === "task"
          ? "tasks"
          : item.recordKind === "capture"
            ? "history"
            : "documents",
      item.recordId,
    );
    onClose();
  };
  const chooseIndex = (index: number) => {
    const command = commandResults[index];
    if (command !== undefined) {
      onOpenDestination(command.id, command.label);
      onClose();
      return;
    }
    choose(results[index - commandResults.length]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) =>
        Math.min(value + 1, commandResults.length + results.length - 1),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(value - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      chooseIndex(activeIndex);
    }
    if (event.key === "Escape") onClose();
  };
  return (
    <dialog
      ref={dialogRef}
      className="search-backdrop"
      aria-labelledby="search-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <section className="search-dialog">
        <h2 id="search-title" className="sr-only">
          Paleta poleceń i globalne wyszukiwanie
        </h2>
        <div className="search-query">
          <Mark kind="search" />
          <label className="sr-only" htmlFor="global-search">
            Otwórz widok albo szukaj projektów, zadań i Capture
          </label>
          <input
            id="global-search"
            autoFocus
            role="combobox"
            aria-expanded={listboxVisible}
            aria-controls={listboxVisible ? "search-listbox" : undefined}
            aria-activedescendant={
              listboxVisible && optionCount > 0
                ? `search-option-${activeIndex}`
                : undefined
            }
            aria-autocomplete="list"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Widok, projekt, zadanie, źródło…"
          />
          <kbd>Esc</kbd>
        </div>
        <p className="search-scope">
          Lokalny indeks · {snapshot.bootstrap.workspace.name} · dane bieżącego
          workspace
        </p>
        <p className="sr-only" role="status">
          {state.kind === "ready" || state.kind === "idle"
            ? searchResultsCountLabel(optionCount)
            : ""}
        </p>
        {listboxVisible ? (
          <div
            id="search-listbox"
            className={`search-results${state.kind === "idle" ? " search-command-list" : ""}`}
            role="listbox"
            aria-label={
              state.kind === "idle"
                ? "Polecenia nawigacji"
                : "Wyniki wyszukiwania"
            }
          >
            {state.kind === "idle" && <p role="presentation">Otwórz widok</p>}
            {commandResults.map((item, index) => (
              <button
                key={`command:${item.id}`}
                id={`search-option-${index}`}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "active" : ""}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseIndex(index)}
              >
                <Mark kind="command" />
                <span>
                  <strong>{item.label}</strong>
                  <small>Polecenie nawigacji</small>
                </span>
                <em>
                  {item.shortcut !== undefined
                    ? `${modifierLabel}${item.shortcut}`
                    : "↵"}
                </em>
              </button>
            ))}
            {results.map((item, index) => (
              <button
                key={`${item.recordKind}-${item.recordId}`}
                id={`search-option-${index + commandResults.length}`}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={index + commandResults.length === activeIndex}
                className={
                  index + commandResults.length === activeIndex ? "active" : ""
                }
                onMouseEnter={() =>
                  setActiveIndex(index + commandResults.length)
                }
                onClick={() => choose(item)}
              >
                <Mark kind={item.recordKind} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {recordKindLabels[item.recordKind] ?? item.recordKind} ·{" "}
                    {item.snippet}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : state.kind === "loading" ? (
          <div className="search-empty" aria-busy="true">
            <strong>Wyszukuję…</strong>
            <span>Sprawdzam projekty, zadania i Capture.</span>
          </div>
        ) : state.kind === "error" ? (
          <div className="search-empty" role="alert">
            <strong>Wyszukiwanie jest niedostępne</strong>
            <span>{state.message}</span>
          </div>
        ) : (
          <div className="search-empty">
            <strong>Brak wyników dla „{query}”</strong>
            <span>Sprawdź pisownię albo wyszukaj szersze pojęcie.</span>
            <button className="secondary-button" onClick={() => setQuery("")}>
              Wyczyść zapytanie
            </button>
          </div>
        )}
        <footer>
          <span>↑↓ wybierz</span>
          <span>↵ otwórz</span>
          <span>Esc zamknij</span>
          <span>{modifierLabel}/ skróty</span>
        </footer>
      </section>
    </dialog>
  );
};

const compensationCopy: Record<string, string> = {
  "project.restore_outcome": "Przywrócenie poprzedniego wyniku projektu",
  "task.restore_state": "Przywrócenie poprzedniego stanu zadania",
  "task.restore_operational_state":
    "Przywrócenie poprzedniego stanu operacyjnego zadania",
  "work_link.restore_state": "Przywrócenie poprzedniego powiązania pracy",
  "relation.remove": "Usunięcie dodanej relacji",
  "relation.restore": "Przywrócenie usuniętej relacji",
  "capture.undo_route": "Cofnięcie uporządkowania Capture",
  "capture.undo_knowledge_route": "Cofnięcie skierowania Capture do wiedzy",
  "knowledge.restore_source": "Przywrócenie poprzedniego źródła",
  "knowledge.restore_evidence": "Przywrócenie poprzedniego zestawu dowodów",
  "knowledge.void_named_version": "Unieważnienie nazwanej wersji",
};

const unavailableReasonCopy: Record<string, string> = {
  unsupported: "To polecenie nie obsługuje cofnięcia",
  already_undone: "To polecenie zostało już cofnięte",
  later_change: "Późniejsza zmiana blokuje bezpieczne cofnięcie",
};

export const UndoDialog = ({
  preview,
  busy,
  onClose,
  onConfirm,
}: {
  readonly preview: UndoPreview;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const available =
    preview.recovery.available && preview.command.projection.available;
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="undo-backdrop"
      aria-labelledby="undo-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <section className="undo-dialog">
        <header>
          <div>
            <p className="eyebrow">Podgląd cofnięcia</p>
            <h2 id="undo-title">
              {available ? "Cofnij tę zmianę?" : "Tej zmiany nie można cofnąć"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij podgląd cofnięcia"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <dl>
          <div>
            <dt>Polecenie</dt>
            <dd className="mono">{preview.targetCommandId.slice(0, 18)}…</dd>
          </div>
          <div>
            <dt>Wpływ</dt>
            <dd>
              {countLabel(
                preview.recovery.affectedRecordIds.length,
                "rekord",
                "rekordy",
                "rekordów",
              )}
            </dd>
          </div>
          <div>
            <dt>Kompensacja</dt>
            <dd>
              {preview.recovery.compensationKind !== undefined
                ? (compensationCopy[preview.recovery.compensationKind] ??
                  "Przywrócenie poprzedniego stanu")
                : preview.recovery.unavailableReason !== undefined
                  ? (unavailableReasonCopy[
                      preview.recovery.unavailableReason
                    ] ?? "Niedostępna")
                  : "Niedostępna"}
            </dd>
          </div>
        </dl>
        <div className="undo-safety">
          <Mark kind={available ? "recovery" : "warning"} />
          <span>
            <strong>
              {available
                ? "Wersje są zgodne"
                : "Stan zmienił się od czasu polecenia"}
            </strong>
            <small>
              {available
                ? "Cofnięcie zapisze osobne, audytowalne polecenie."
                : "Nie wykonano żadnej zmiany."}
            </small>
          </span>
        </div>
        <footer>
          <button
            ref={cancelRef}
            className="ghost-button"
            disabled={busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            className="primary-button"
            disabled={!available || busy}
            onClick={onConfirm}
          >
            {busy ? "Cofam…" : "Cofnij zmianę"}
          </button>
        </footer>
      </section>
    </dialog>
  );
};

export const failureMessage = (failure: MutationFailure): string =>
  failure.message;
