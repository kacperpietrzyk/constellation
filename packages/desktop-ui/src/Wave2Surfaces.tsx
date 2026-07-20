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
  formatDate,
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
  headingLevel = "h3",
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
  readonly tone?: InlineStateTone;
  readonly headingLevel?: "h2" | "h3";
}) => {
  const Heading = headingLevel;
  return (
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
        <Heading>{title}</Heading>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
};

// The cockpit's differentiator is that its order is a deterministic *rule*, not
// a model. The raw score (100/160/…) is an internal scale with no external
// meaning, so it never reaches the product. Instead we surface only the reasons
// that *distinguish* an entry. `task_open` is true of every eligible entry, so
// it is dropped — it restates the eligibility filter, not a distinction. Since
// R12.1 the distinctions are planning semantics (late, due, starting,
// priority), never creation time.
type CockpitFocusReason =
  | { readonly code: "task_open" }
  | { readonly code: "overdue"; readonly dueAt: string }
  | { readonly code: "due_this_week"; readonly dueAt: string }
  | { readonly code: "starts_this_week"; readonly startAt: string }
  | { readonly code: "priority_urgent" }
  | { readonly code: "priority_high" }
  | {
      readonly code: "active_project";
      readonly projectId: ProjectId;
      readonly projectTitle: string;
    };

interface CuratedFocusReason {
  readonly timing:
    | { readonly kind: "overdue"; readonly dueAt: string }
    | { readonly kind: "due"; readonly dueAt: string }
    | { readonly kind: "starts"; readonly startAt: string }
    | null;
  readonly priority: "urgent" | "high" | null;
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
  const overdue = reasons.find(
    (reason): reason is Extract<CockpitFocusReason, { code: "overdue" }> =>
      reason.code === "overdue",
  );
  const due = reasons.find(
    (
      reason,
    ): reason is Extract<CockpitFocusReason, { code: "due_this_week" }> =>
      reason.code === "due_this_week",
  );
  const starts = reasons.find(
    (
      reason,
    ): reason is Extract<CockpitFocusReason, { code: "starts_this_week" }> =>
      reason.code === "starts_this_week",
  );
  return {
    timing: overdue
      ? { kind: "overdue", dueAt: overdue.dueAt }
      : due
        ? { kind: "due", dueAt: due.dueAt }
        : starts
          ? { kind: "starts", startAt: starts.startAt }
          : null,
    priority: reasons.some((r) => r.code === "priority_urgent")
      ? "urgent"
      : reasons.some((r) => r.code === "priority_high")
        ? "high"
        : null,
    // The active_project reason carries the title used to label the link;
    // relatedProjectId alone has no title, so it cannot back a labelled link.
    project: active
      ? { id: active.projectId, title: active.projectTitle }
      : null,
  };
};

// One short timing label per entry. "Dziś" sharpens the week-level phrasing
// and is computed against the workspace timezone, never the machine locale.
const focusTimingLabel = (
  timing: CuratedFocusReason["timing"],
  timeZone: string,
  todayKey: string,
): string | null => {
  if (timing === null) return null;
  if (timing.kind === "overdue")
    return `Po terminie (${formatDate(timing.dueAt, timeZone)})`;
  if (timing.kind === "due")
    return dateKeyInTimeZone(new Date(timing.dueAt), timeZone) === todayKey
      ? "Termin dziś"
      : `Termin: ${formatDate(timing.dueAt, timeZone)}`;
  return dateKeyInTimeZone(new Date(timing.startAt), timeZone) === todayKey
    ? "Start dziś"
    : "Start w tym tygodniu";
};

const focusPriorityLabel = (
  priority: CuratedFocusReason["priority"],
): string | null =>
  priority === "urgent"
    ? "Pilne"
    : priority === "high"
      ? "Wysoki priorytet"
      : null;

// Plain-text differentiator parts for the ranked rows (no nested controls:
// rows stay single whole-row buttons).
const focusReasonParts = (
  reasons: readonly CockpitFocusReason[],
  timeZone: string,
  todayKey: string,
): string[] => {
  const { timing, priority, project } = curateFocusReason(reasons);
  const parts: string[] = [];
  const timingLabel = focusTimingLabel(timing, timeZone, todayKey);
  if (timingLabel) parts.push(timingLabel);
  const priorityLabel = focusPriorityLabel(priority);
  if (priorityLabel) parts.push(priorityLabel);
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
  timeZone,
  todayKey,
  onOpenProject,
}: {
  readonly reasons: readonly CockpitFocusReason[];
  readonly timeZone: string;
  readonly todayKey: string;
  readonly onOpenProject: (id: ProjectId) => void;
}) => {
  const { timing, priority, project } = curateFocusReason(reasons);
  const timingLabel = focusTimingLabel(timing, timeZone, todayKey);
  const priorityLabel = focusPriorityLabel(priority);
  const leadLabel =
    timingLabel && priorityLabel
      ? `${timingLabel} · ${priorityLabel}`
      : (timingLabel ?? priorityLabel);
  if (!leadLabel && !project) {
    return <p className="now-reason">Otwarte zadanie w kolejności tygodnia.</p>;
  }
  return (
    <p className="now-reason">
      {leadLabel ? (
        <span
          className={
            timing?.kind === "overdue" ? "now-reason-today" : undefined
          }
        >
          {leadLabel}
        </span>
      ) : null}
      {leadLabel && project ? (
        <span className="now-reason-sep" aria-hidden="true">
          ·
        </span>
      ) : null}
      {project ? (
        <span>
          {leadLabel ? "z projektu " : "Z projektu "}
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
  // "Dziś" per workspace timezone: planning labels agree with the workspace's
  // calendar, not the machine's.
  const timezone = snapshot.bootstrap.workspace.timezone;
  const todayKey = dateKeyInTimeZone(new Date(), timezone);
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
    parts.push(...focusReasonParts(reasons, timezone, todayKey));
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
        headingLevel="h2"
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
  // The week plan is the time-oriented composition of the cockpit: real
  // deadlines placed on the days of the shown week, late work first, and an
  // honest note about what has no date at all. It never invents capacity —
  // it only shows what was deliberately planned.
  const openTasks = snapshot.tasks.filter(
    (task) => task.completionState === "open",
  );
  const weekStartKey = cockpit.kind === "ready" ? cockpit.data.weekStart : "";
  const weekDays =
    cockpit.kind === "ready"
      ? Array.from({ length: 7 }, (_, index) => {
          const date = new Date(`${cockpit.data.weekStart}T00:00:00`);
          date.setDate(date.getDate() + index);
          const key = dateKeyInTimeZone(date, timezone);
          return {
            key,
            label: new Intl.DateTimeFormat("pl-PL", {
              weekday: "short",
              day: "numeric",
            }).format(date),
          };
        })
      : [];
  const dueKeyOf = (dueAt: string): string =>
    dateKeyInTimeZone(new Date(dueAt), timezone);
  const overdueTasks = openTasks.filter(
    (task) =>
      task.dueAt !== undefined &&
      Date.parse(task.dueAt) < Date.now() &&
      dueKeyOf(task.dueAt) < todayKey,
  );
  const dueThisWeek = new Map<string, typeof openTasks>();
  for (const task of openTasks) {
    if (task.dueAt === undefined) continue;
    const key = dueKeyOf(task.dueAt);
    if (weekDays.some((day) => day.key === key)) {
      dueThisWeek.set(key, [...(dueThisWeek.get(key) ?? []), task]);
    }
  }
  // R12.6 / ADR-042 — reserved time placed on the day it was reserved for.
  // Sourced from snapshot.tasks, the same array the deadlines above come from,
  // rather than from cockpit.week focus entries: the cockpit projection is
  // capped, so reading blocks from it would silently drop reservations once a
  // workspace has more focus items than the cap.
  //
  // A Task can legitimately appear twice in one week — a deadline on Friday, a
  // reservation on Wednesday. That is the whole point of keeping the two facts
  // separate, so it is shown as two entries rather than deduplicated.
  const reservedThisWeek = new Map<string, typeof openTasks>();
  for (const task of openTasks) {
    if (task.calendarBlock === undefined) continue;
    const key = dateKeyInTimeZone(
      new Date(task.calendarBlock.startsAt),
      timezone,
    );
    if (weekDays.some((day) => day.key === key)) {
      reservedThisWeek.set(key, [...(reservedThisWeek.get(key) ?? []), task]);
    }
  }
  const reservedCount = [...reservedThisWeek.values()].reduce(
    (sum, tasks) => sum + tasks.length,
    0,
  );
  const unscheduledCount = openTasks.filter(
    (task) => task.dueAt === undefined,
  ).length;
  const scheduledThisWeek = [...dueThisWeek.values()].reduce(
    (sum, tasks) => sum + tasks.length,
    0,
  );
  const weekPlan =
    cockpit.kind === "ready" && weekStartKey !== "" ? (
      <section className="week-plan" aria-labelledby="week-plan-title">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Plan tygodnia</p>
            <h2 id="week-plan-title">
              Terminy i zarezerwowany czas dzień po dniu
            </h2>
          </div>
          <span>
            {countLabel(
              scheduledThisWeek,
              "termin w tym tygodniu",
              "terminy w tym tygodniu",
              "terminów w tym tygodniu",
            )}
            {reservedThisWeek.size > 0 &&
              ` · ${countLabel(
                reservedCount,
                "zarezerwowany blok",
                "zarezerwowane bloki",
                "zarezerwowanych bloków",
              )}`}
          </span>
        </header>
        {overdueTasks.length > 0 ? (
          <div
            className="week-plan-overdue"
            role="group"
            aria-label="Po terminie"
          >
            <Mark kind="warning" />
            <p>
              <strong>
                {countLabel(
                  overdueTasks.length,
                  "zadanie po terminie",
                  "zadania po terminie",
                  "zadań po terminie",
                )}
              </strong>
            </p>
            <span className="week-plan-overdue-items">
              {overdueTasks.slice(0, 3).map((task) => (
                <button
                  type="button"
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  onDoubleClick={() => onOpenTask(task.id)}
                >
                  {task.title}
                </button>
              ))}
              {overdueTasks.length > 3
                ? ` +${overdueTasks.length - 3} więcej`
                : null}
            </span>
          </div>
        ) : null}
        <div className="week-plan-grid">
          {weekDays.map((day) => {
            const tasks = dueThisWeek.get(day.key) ?? [];
            const reserved = reservedThisWeek.get(day.key) ?? [];
            return (
              <div
                key={day.key}
                className={`week-plan-day${day.key === todayKey ? " today" : ""}`}
              >
                <h3>{day.label}</h3>
                {/* A day holding only reserved time is not an empty day. */}
                {tasks.length === 0 && reserved.length === 0 ? (
                  <p className="week-plan-empty" aria-hidden="true">
                    —
                  </p>
                ) : tasks.length === 0 ? null : (
                  <>
                    {tasks.slice(0, 3).map((task) => (
                      <button
                        type="button"
                        key={task.id}
                        className={`week-plan-task${
                          task.id === selectedTaskId ? " selected" : ""
                        }`}
                        onClick={() => onSelectTask(task.id)}
                        onDoubleClick={() => onOpenTask(task.id)}
                      >
                        {task.title}
                      </button>
                    ))}
                    {tasks.length > 3 ? (
                      <p className="week-plan-more">
                        +{tasks.length - 3} więcej
                      </p>
                    ) : null}
                  </>
                )}
                {reserved.length > 0 && (
                  <div
                    className="week-plan-reserved"
                    role="group"
                    aria-label={`Zarezerwowany czas, ${day.label}`}
                  >
                    {reserved.map((task) => (
                      <button
                        type="button"
                        key={`reserved-${task.id}`}
                        className={`week-plan-block${
                          task.id === selectedTaskId ? " selected" : ""
                        }`}
                        onClick={() => onSelectTask(task.id)}
                        onDoubleClick={() => onOpenTask(task.id)}
                      >
                        <span className="week-plan-block-time">
                          {formatTime(task.calendarBlock!.startsAt, timezone)}
                        </span>
                        {task.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {unscheduledCount > 0 ? (
          <p className="week-plan-note">
            Bez terminu:{" "}
            {countLabel(unscheduledCount, "zadanie", "zadania", "zadań")}.
            Termin i rezerwację czasu nadasz w inspektorze zadania — to dwie
            różne rzeczy: kiedy ma być zrobione i kiedy to zrobisz.
          </p>
        ) : null}
      </section>
    ) : null;
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
          headingLevel="h2"
          title="Przekrojowy fokus jest chwilowo niedostępny"
          detail="Bieżący workspace działa normalnie; pozostałe zaszyfrowane projekcje nie zostały otwarte."
        />
      )}
    </>
  );
  const outcomeRail = (
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
                  if (event.metaKey || event.ctrlKey) onOpenProject(project.id);
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
            headingLevel="h2"
            title="Widok tygodnia jest niedostępny"
            detail={cockpit.message}
          />
          {exceptionsBar}
          {workspaceStrip}
          {outcomeRail}
        </>
      ) : focus.length === 0 ? (
        <>
          <InlineState
            headingLevel="h2"
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
          {outcomeRail}
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
                  timeZone={timezone}
                  todayKey={todayKey}
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
          {weekPlan}
          <div className="cockpit-grid">
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
                  Kolejność jest deterministyczna: otwarte zadania — najpierw po
                  terminie i z terminem w tym tygodniu, potem pilne i z
                  aktywnych projektów.
                </span>
                <button
                  type="button"
                  className="ordering-rule-info"
                  aria-expanded={ruleOpen}
                  aria-controls="ordering-rule-detail"
                  onClick={() => setRuleOpen((open) => !open)}
                >
                  {ruleOpen
                    ? "Ukryj szczegóły"
                    : "Jak ustalana jest kolejność?"}
                </button>
              </p>
              <div
                id="ordering-rule-detail"
                className="ordering-rule-detail"
                role="region"
                aria-label="Reguła kolejności"
                hidden={!ruleOpen}
              >
                <p>
                  Widok nie generuje rekomendacji. Pokazuje wyłącznie otwarte
                  zadania i porządkuje je zawsze tak samo: najpierw po terminie,
                  potem z terminem w tym tygodniu, następnie pilne i o wysokim
                  priorytecie, zaczynające się w tym tygodniu oraz powiązane z
                  aktywnym projektem, a przy remisie alfabetycznie. Data
                  utworzenia pozostaje historią i nie wpływa na kolejność. Ta
                  sama kolejność wyjdzie za każdym razem.
                </p>
              </div>
              <div
                className="compact-record-list compact-record-list--focus"
                role="listbox"
                aria-label="Następne działania w kolejności tygodnia"
              >
                {focus.map((task, index) => {
                  const state =
                    workTasks.get(task.taskId)?.operationalState ??
                    "actionable";
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
            {outcomeRail}
          </div>
        </>
      )}
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
  onCreateTask,
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
  readonly onCreateTask: (title: string) => Promise<boolean>;
  readonly onSetStatus: (id: TaskId, statusId: TaskStatusId) => void;
  readonly onSetCompleted: (id: TaskId, completed: boolean) => void;
  readonly onSetAssignment: (
    id: TaskId,
    principalId: PrincipalId | undefined,
  ) => void;
}) => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase("pl-PL");
  const assignmentCandidates =
    snapshot.assignmentCandidates.kind === "ready"
      ? snapshot.assignmentCandidates.data.candidates
      : [];
  const filteredTasks = snapshot.tasks.filter((task) => {
    const matchesStatus =
      statusFilter === "all" || task.status.id === statusFilter;
    const matchesAssignee =
      assigneeFilter === "all" ||
      (assigneeFilter === "unassigned"
        ? task.assignment === undefined
        : task.assignment?.assigneePrincipalId === assigneeFilter);
    const searchable = [
      task.title,
      task.status.label,
      task.assignment?.displayName,
      task.sourceCaptureId ? "Quick Capture" : "Root Space",
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pl-PL");
    return (
      matchesStatus &&
      matchesAssignee &&
      (normalizedQuery.length === 0 || searchable.includes(normalizedQuery))
    );
  });
  const filtersActive =
    normalizedQuery.length > 0 ||
    statusFilter !== "all" ||
    assigneeFilter !== "all";
  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setAssigneeFilter("all");
  };
  const taskNav = useListNavigation({
    itemCount: filteredTasks.length,
    onOpen: (index) => {
      const task = filteredTasks[index];
      if (task) onOpenTask(task.id);
    },
    onSelect: (index) => {
      const task = filteredTasks[index];
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
            <span aria-live="polite">
              {filteredTasks.length}
              {filtersActive ? ` z ${snapshot.tasks.length}` : " w widoku"}
            </span>
          </div>
        </header>
        <form
          className="task-create-row"
          aria-label="Nowe zadanie"
          onSubmit={(event) => {
            event.preventDefault();
            const title = newTaskTitle.trim();
            if (title.length === 0 || creatingTask) return;
            setCreatingTask(true);
            void onCreateTask(title).then((created) => {
              setCreatingTask(false);
              if (created) setNewTaskTitle("");
            });
          }}
        >
          <label className="task-create-title">
            <span className="sr-only">Tytuł nowego zadania</span>
            <input
              type="text"
              value={newTaskTitle}
              maxLength={500}
              disabled={creatingTask}
              placeholder="Dodaj zadanie — wpisz tytuł i zatwierdź"
              onChange={(event) => setNewTaskTitle(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="secondary-button"
            disabled={creatingTask || newTaskTitle.trim().length === 0}
          >
            {creatingTask ? "Dodawanie…" : "Dodaj"}
          </button>
        </form>
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
          <>
            <div className="task-control-strip" aria-label="Filtry zadań">
              <label className="task-search-control">
                <Icon name="search" />
                <span className="sr-only">Szukaj zadań</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Szukaj po zadaniu, stanie lub osobie"
                />
              </label>
              <label className="task-filter-control">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">Wszystkie</option>
                  {snapshot.bootstrap.taskStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-filter-control">
                <span>Odpowiedzialność</span>
                <select
                  value={assigneeFilter}
                  onChange={(event) => setAssigneeFilter(event.target.value)}
                >
                  <option value="all">Wszyscy</option>
                  <option value="unassigned">Nieprzypisane</option>
                  {assignmentCandidates.map((candidate) => (
                    <option
                      key={candidate.principalId}
                      value={candidate.principalId}
                    >
                      {candidate.displayName}
                      {candidate.participantKind === "guest" ? " · gość" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {filtersActive && (
                <button
                  type="button"
                  className="task-reset-button"
                  onClick={resetFilters}
                >
                  Wyczyść
                </button>
              )}
            </div>
            <div className="task-column-head" aria-hidden="true">
              <span />
              <span>Zadanie</span>
              <span>Status</span>
              <span>Odpowiedzialność</span>
            </div>
            {filteredTasks.length === 0 ? (
              <InlineState
                title="Brak zadań w tym widoku"
                detail="Zmień filtry albo wyczyść je, aby wrócić do pełnej listy."
                action={
                  <button className="secondary-button" onClick={resetFilters}>
                    Wyczyść filtry
                  </button>
                }
              />
            ) : (
              <div className="task-list">
                {filteredTasks.map((task, index) => (
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
                      <strong title={task.title}>{task.title}</strong>
                      <span>
                        {[
                          task.sourceCaptureId
                            ? "Z Quick Capture · oryginał zachowany"
                            : "Root Space",
                          ...(task.dueAt === undefined
                            ? []
                            : [
                                `Termin: ${formatDate(
                                  task.dueAt,
                                  snapshot.bootstrap.workspace.timezone,
                                )}${
                                  task.completionState === "open" &&
                                  Date.parse(task.dueAt) < Date.now()
                                    ? " · po terminie"
                                    : ""
                                }`,
                              ]),
                          ...(task.priority === undefined ||
                          task.priority === "normal"
                            ? []
                            : [
                                task.priority === "urgent"
                                  ? "Pilny"
                                  : task.priority === "high"
                                    ? "Wysoki priorytet"
                                    : "Niski priorytet",
                              ]),
                        ].join(" · ")}
                      </span>
                    </button>
                    <label className="sr-only" htmlFor={`status-${task.id}`}>
                      Status zadania {task.title}
                    </label>
                    <span className="task-row-field">
                      <span aria-hidden="true">Status</span>
                      <select
                        id={`status-${task.id}`}
                        className="task-status"
                        value={task.status.id}
                        disabled={busyTaskId === task.id}
                        onChange={(event) =>
                          onSetStatus(
                            task.id,
                            event.target.value as TaskStatusId,
                          )
                        }
                      >
                        {snapshot.bootstrap.taskStatuses.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </span>
                    <label className="sr-only" htmlFor={`assignee-${task.id}`}>
                      Osoba odpowiedzialna za {task.title}
                    </label>
                    <span className="task-row-field">
                      <span aria-hidden="true">Odpowiedzialność</span>
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
                        {assignmentCandidates.map((candidate) => (
                          <option
                            key={candidate.principalId}
                            value={candidate.principalId}
                          >
                            {candidate.displayName}
                            {candidate.participantKind === "guest"
                              ? " · gość"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export const ProjectsSurface = ({
  snapshot,
  selectedProjectId,
  activeProjectId,
  overview,
  relation,
  busy,
  onOpenProject,
  onSelectProject,
  onBackToProjects,
  onCreate,
  onApplyTemplate,
  onUpdateOutcome,
  onSetLifecycle,
  onRelate,
  onUnrelate,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedProjectId: ProjectId | undefined;
  readonly activeProjectId: ProjectId | undefined;
  readonly overview: ProjectOverviewProjection | undefined;
  readonly relation:
    | {
        readonly id: RelationId;
        readonly version: number;
        readonly taskId: TaskId;
      }
    | undefined;
  readonly busy: boolean;
  readonly onOpenProject: (id: ProjectId) => void;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onBackToProjects: () => void;
  readonly onCreate: (
    title: string,
    outcome: string,
    templateId?: string,
  ) => Promise<boolean>;
  readonly onApplyTemplate: (templateId: string) => void;
  readonly onUpdateOutcome: (outcome: string) => void;
  readonly onSetLifecycle: (lifecycle: "active" | "closed") => void;
  readonly onRelate: (taskId: TaskId) => void;
  readonly onUnrelate: () => void;
}) => {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [newOutcome, setNewOutcome] = useState("");
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const createTitleRef = useRef<HTMLInputElement>(null);
  const [editedOutcome, setEditedOutcome] = useState(
    overview?.project.intendedOutcome ?? "",
  );
  useEffect(
    () => setEditedOutcome(overview?.project.intendedOutcome ?? ""),
    [overview],
  );
  useEffect(() => {
    if (creating) createTitleRef.current?.focus();
  }, [creating]);
  const projects = snapshot.projects;
  const projectItems = projects.kind === "ready" ? projects.data.items : [];
  const projectTemplates = snapshot.bootstrap.projectTemplates ?? [];
  const activeTemplates = projectTemplates.filter(
    (template) => template.state !== "retired",
  );
  const fullView =
    activeProjectId !== undefined && overview?.project.id === activeProjectId;
  const projectNav = useListNavigation({
    itemCount: projectItems.length,
    onOpen: (index) => {
      const project = projectItems[index];
      if (project) onOpenProject(project.id);
    },
    onSelect: (index) => {
      const project = projectItems[index];
      if (project) onSelectProject(project.id);
    },
  });
  const unrelated = snapshot.tasks.filter(
    (task) => !overview?.relatedTasks.some((related) => related.id === task.id),
  );
  return (
    <div className="surface-scroll project-surface">
      <SurfaceHeader
        kicker="Projekty · aktywne"
        title={fullView ? overview.project.title : "Projekty"}
        description={
          fullView
            ? "Zamierzony wynik, cykl życia i praca należące do tego projektu."
            : "Portfel zamierzonych wyników i powiązanej pracy."
        }
        action={
          <div className="project-header-actions">
            {fullView && (
              <button
                type="button"
                className="ghost-button"
                onClick={onBackToProjects}
              >
                <span>Wróć do projektów</span>
              </button>
            )}
            <button
              ref={createTriggerRef}
              type="button"
              className="secondary-button"
              aria-expanded={creating}
              aria-controls={creating ? "project-create-form" : undefined}
              onClick={() => setCreating((value) => !value)}
            >
              <Icon name={creating ? "close" : "capture"} />
              <span>{creating ? "Anuluj" : "Nowy projekt"}</span>
            </button>
          </div>
        }
      />
      {creating && (
        <form
          id="project-create-form"
          className="project-overview"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (title.trim() && newOutcome.trim()) {
              void onCreate(
                title,
                newOutcome,
                createTemplateId === "" ? undefined : createTemplateId,
              ).then((created) => {
                if (!created) return;
                setCreating(false);
                setTitle("");
                setNewOutcome("");
                setCreateTemplateId("");
                requestAnimationFrame(() => createTriggerRef.current?.focus());
              });
            }
          }}
        >
          <div className="overview-intent">
            <label htmlFor="project-title">Nazwa projektu</label>
            <input
              ref={createTitleRef}
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              required
            />
            <label htmlFor="project-outcome">Zamierzony wynik</label>
            <textarea
              id="project-outcome"
              value={newOutcome}
              onChange={(event) => setNewOutcome(event.target.value)}
              maxLength={2_000}
              required
            />
            {activeTemplates.length > 0 && (
              <>
                <label htmlFor="project-create-template">
                  Szablon startowy (opcjonalnie)
                </label>
                <select
                  id="project-create-template"
                  value={createTemplateId}
                  onChange={(event) => setCreateTemplateId(event.target.value)}
                >
                  <option value="">Bez szablonu</option>
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Tworzę…" : "Utwórz projekt"}
            </button>
          </div>
        </form>
      )}
      {projects.kind === "unavailable" ? (
        <InlineState
          tone="warning"
          headingLevel="h2"
          title="Lista projektów jest niedostępna"
          detail={projects.message}
        />
      ) : projectItems.length === 0 ? (
        <InlineState
          headingLevel="h2"
          title="Nie ma jeszcze projektów"
          detail="Utwórz projekt i nazwij wynik, po którym poznasz, że praca jest skończona."
        />
      ) : fullView ? (
        <div className="project-detail-flow">
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
                    onUpdateOutcome(editedOutcome);
                  }}
                >
                  <label className="sr-only" htmlFor="edited-project-outcome">
                    Zamierzony wynik
                  </label>
                  <textarea
                    id="edited-project-outcome"
                    value={editedOutcome}
                    onChange={(event) => setEditedOutcome(event.target.value)}
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
                      type="button"
                      className="ghost-button"
                      onClick={() => setEditing(true)}
                    >
                      Edytuj wynik
                    </button>
                    <button
                      type="button"
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
              {(overview.project.appliedTemplateId !== undefined ||
                activeTemplates.some(
                  (template) =>
                    template.id !== overview.project.appliedTemplateId,
                )) && (
                <div className="project-template-row">
                  {overview.project.appliedTemplateId !== undefined && (
                    <small>
                      Szablon:{" "}
                      {projectTemplates.find(
                        (template) =>
                          template.id === overview.project.appliedTemplateId,
                      )?.name ?? "wycofany szablon"}
                    </small>
                  )}
                  {activeTemplates.some(
                    (template) =>
                      template.id !== overview.project.appliedTemplateId,
                  ) && (
                    <>
                      <label
                        className="sr-only"
                        htmlFor="project-apply-template"
                      >
                        Szablon do zastosowania
                      </label>
                      <select
                        id="project-apply-template"
                        value={applyTemplateId}
                        disabled={busy}
                        onChange={(event) =>
                          setApplyTemplateId(event.target.value)
                        }
                      >
                        <option value="">Zastosuj szablon…</option>
                        {activeTemplates
                          .filter(
                            (template) =>
                              template.id !==
                              overview.project.appliedTemplateId,
                          )
                          .map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="secondary-button compact"
                        disabled={busy || applyTemplateId === ""}
                        onClick={() => {
                          onApplyTemplate(applyTemplateId);
                          setApplyTemplateId("");
                        }}
                      >
                        Zastosuj
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
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
                  type="button"
                  className="secondary-button compact"
                  disabled={busy}
                  onClick={onUnrelate}
                >
                  Usuń ostatnie powiązanie
                </button>
              ) : unrelated[0] ? (
                <button
                  type="button"
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
        </div>
      ) : (
        <section className="project-portfolio" aria-label="Lista projektów">
          <header>
            <div>
              <h2>Portfel projektów</h2>
              <span>{projectItems.length} w widoku</span>
            </div>
            <span>Wynik i otwarta praca</span>
          </header>
          <div className="project-list">
            {projectItems.map((project, index) => (
              <button
                type="button"
                className={`outcome-row ${project.id === selectedProjectId ? "selected" : ""}`}
                key={project.id}
                {...projectNav(index)}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey) onOpenProject(project.id);
                  else onSelectProject(project.id);
                }}
                onDoubleClick={() => onOpenProject(project.id)}
              >
                <Mark kind="project" />
                <span>
                  <strong>{project.title}</strong>
                  <small>{project.intendedOutcome}</small>
                </span>
                <em>{project.relatedOpenTaskCount} otw.</em>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export type HistoryCapture = DesktopSnapshot["captures"][number];

const captureKindLabel = (capture: HistoryCapture): string =>
  capture.original.kind === "text"
    ? "Tekst"
    : capture.original.kind === "url"
      ? "Link"
      : capture.original.kind === "screenshot"
        ? "Screenshot"
        : capture.original.kind === "managed_file"
          ? "Zarządzany plik"
          : capture.original.kind === "voice_note"
            ? "Notatka głosowa"
            : "Odwołanie do pliku";

const captureResultLabel = (capture: HistoryCapture): string =>
  capture.processingState === "routed_as_task"
    ? "Utworzono zadanie"
    : capture.processingState === "routed_as_knowledge_source"
      ? "Utworzono źródło wiedzy"
      : capture.processingState === "needs_review"
        ? "Wymaga decyzji"
        : capture.processingState === "awaiting_transcript"
          ? "Czeka na transkrypcję"
          : capture.processingState === "transcript_ready"
            ? capture.audioState === "retained"
              ? "Transkrypcja gotowa · audio zachowane"
              : capture.audioState === "deleted"
                ? "Transkrypcja gotowa · audio usunięte"
                : "Transkrypcja gotowa · usuwanie audio"
            : capture.processingState === "unclassified"
              ? "Zachowano bez klasyfikacji"
              : "Oczekuje na przetworzenie";

const captureCustodyLabel = (capture: HistoryCapture): string =>
  capture.original.kind === "managed_file" ||
  capture.original.kind === "screenshot" ||
  capture.original.kind === "voice_note"
    ? `Zaszyfrowana kopia · ${Math.ceil(capture.original.payload.byteLength / 1024).toLocaleString("pl-PL")} KB · integralność SHA-256`
    : "Stan lokalny potwierdzony";

export const CaptureHistoryDetail = ({
  capture,
  timezone,
  undoCommandId,
  busy,
  onUndo,
  onDeleteVoiceAudio,
}: {
  readonly capture: HistoryCapture;
  readonly timezone: string;
  readonly undoCommandId?: CommandId;
  readonly busy: boolean;
  readonly onUndo: (targetCommandId: CommandId) => void;
  readonly onDeleteVoiceAudio: (captureId: CaptureId, version: number) => void;
}) => (
  <div className="inspector-body capture-history-detail">
    <span className="record-status">
      <i />
      {captureResultLabel(capture)}
    </span>
    <h2>{capture.originalText}</h2>
    <p className="record-summary">
      {captureKindLabel(capture)} · zapisano{" "}
      {formatDateTime(capture.capturedAt, timezone)}
    </p>
    <section className="inspector-section provenance-block">
      <p className="section-label">Przebieg przetwarzania</p>
      <ol className="processing-timeline">
        <li className="done">
          <i />
          <div>
            <strong>Zapisano oryginał</strong>
            <span>{captureCustodyLabel(capture)}</span>
          </div>
        </li>
        <li className="current">
          <i />
          <div>
            <strong>{captureResultLabel(capture)}</strong>
            <span>
              {capture.processingState === "transcript_ready"
                ? capture.transcript.text
                : capture.originalText}
            </span>
            {capture.processingState === "transcript_ready" && (
              <small>
                Zapis: {capture.transcript.writtenByKind} ·{" "}
                {formatDateTime(capture.transcript.writtenAt, timezone)}
                {capture.transcript.hostRunId
                  ? " · przebieg " + capture.transcript.hostRunId
                  : ""}
              </small>
            )}
          </div>
        </li>
      </ol>
    </section>
    <section className="inspector-section capture-history-actions">
      <p className="section-label">Dostępne działania</p>
      <button
        className="secondary-button"
        disabled={undoCommandId === undefined}
        title={
          undoCommandId === undefined
            ? "Brak odwracalnego polecenia dla tego Capture"
            : undefined
        }
        onClick={() => undoCommandId && onUndo(undoCommandId)}
      >
        Podgląd cofnięcia
      </button>
      {capture.processingState === "transcript_ready" &&
        capture.audioState === "retained" && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onDeleteVoiceAudio(capture.id, capture.version)}
          >
            {busy ? "Usuwanie…" : "Usuń zachowane audio"}
          </button>
        )}
    </section>
  </div>
);

export const HistorySurface = ({
  snapshot,
  selectedCaptureId,
  onSelectCapture,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedCaptureId: CaptureId | undefined;
  readonly onSelectCapture: (captureId: CaptureId) => void;
}) => {
  const captureNav = useListNavigation({
    itemCount: snapshot.captures.length,
    onOpen: (index) => {
      const capture = snapshot.captures[index];
      if (capture) onSelectCapture(capture.id);
    },
    onSelect: (index) => {
      const capture = snapshot.captures[index];
      if (capture) onSelectCapture(capture.id);
    },
  });
  return (
    <div className="surface-scroll history-surface">
      <SurfaceHeader
        kicker="Zachowane oryginały"
        title="Historia Capture"
        description="Udane przetworzenie pozostaje sprawdzalne i odwracalne, jeśli bieżące wersje na to pozwalają."
      />
      {snapshot.captures.length === 0 ? (
        <InlineState
          headingLevel="h2"
          title="Historia Capture jest pusta"
          detail="Pierwszy zapis przez Quick Capture pojawi się tutaj wraz z wynikiem przetwarzania."
        />
      ) : (
        <section className="history-ledger" aria-label="Zachowane Capture">
          <header>
            <div>
              <h2>Zachowane oryginały</h2>
              <span>
                {countLabel(
                  snapshot.captures.length,
                  "zapis",
                  "zapisy",
                  "zapisów",
                )}
              </span>
            </div>
            <span>Kliknij rekord, aby sprawdzić przebieg</span>
          </header>
          <div className="history-list">
            {snapshot.captures.map((capture, index) => (
              <button
                type="button"
                className={`history-row${selectedCaptureId === capture.id ? " selected" : ""}`}
                key={capture.id}
                aria-pressed={selectedCaptureId === capture.id}
                {...captureNav(index)}
                onClick={() => onSelectCapture(capture.id)}
              >
                <Mark kind="capture" />
                <span className="history-row-copy">
                  <span>{captureKindLabel(capture)}</span>
                  <strong>{capture.originalText}</strong>
                  <small>{captureResultLabel(capture)}</small>
                </span>
                <time dateTime={capture.capturedAt}>
                  {formatDateTime(
                    capture.capturedAt,
                    snapshot.bootstrap.workspace.timezone,
                  )}
                </time>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

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
    | { readonly kind: "error" }
  >({ kind: "idle" });
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const returnTargetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const activeElement = document.activeElement;
    returnTargetRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      const returnTarget = returnTargetRef.current;
      if (returnTarget?.isConnected && !returnTarget.hasAttribute("disabled")) {
        returnTarget.focus({ preventScroll: true });
      }
    };
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
        .catch(() => active && setState({ kind: "error" }));
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, query, searchAttempt, snapshot]);
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
            ref={searchInputRef}
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
            <span>
              Lokalny indeks jest chwilowo niedostępny. Twoje dane pozostały bez
              zmian.
            </span>
            <div className="search-empty-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  searchInputRef.current?.focus();
                  setSearchAttempt((attempt) => attempt + 1);
                }}
              >
                Ponów wyszukiwanie
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  searchInputRef.current?.focus();
                  setQuery("");
                  setActiveIndex(0);
                }}
              >
                Wyczyść zapytanie
              </button>
            </div>
          </div>
        ) : (
          <div className="search-empty">
            <strong>Brak wyników dla „{query}”</strong>
            <span>Sprawdź pisownię albo wyszukaj szersze pojęcie.</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                searchInputRef.current?.focus();
                setQuery("");
                setActiveIndex(0);
              }}
            >
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
  const returnTargetRef = useRef<HTMLElement | null>(null);
  const available =
    preview.recovery.available && preview.command.projection.available;
  useEffect(() => {
    const dialog = dialogRef.current;
    const activeElement = document.activeElement;
    returnTargetRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      const returnTarget = returnTargetRef.current;
      if (returnTarget?.isConnected && !returnTarget.hasAttribute("disabled")) {
        returnTarget.focus({ preventScroll: true });
      }
    };
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
