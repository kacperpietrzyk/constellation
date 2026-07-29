import {
  useEffect,
  lazy,
  Suspense,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  CaptureId,
  CommandId,
  DocumentId,
  PrincipalId,
  ProjectId,
  RelationId,
  StrategicRecordId,
  TaskId,
  TaskStatusId,
} from "@constellation/contracts";
import { getHumanRecordKindDescriptor } from "@constellation/contracts";
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
import { NarrativeGap, NarrativeText } from "./components/RecordNarrative.js";
import { recordNarrativeGaps } from "./record-narrative.js";
import ProjectContextSections from "./ProjectContextSections.js";
import type { DocumentEntityTargetKind } from "./document-entity-reference.js";
import { modifierLabel } from "./components/ShortcutsOverlay.js";
import { calendarReadRefusal } from "./client/calendar-reservation.js";
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

const ProjectRichBody = lazy(() => import("./ProjectRichBody.js"));

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
    return `Overdue (${formatDate(timing.dueAt, timeZone)})`;
  if (timing.kind === "due")
    return dateKeyInTimeZone(new Date(timing.dueAt), timeZone) === todayKey
      ? "Due today"
      : `Due ${formatDate(timing.dueAt, timeZone)}`;
  return dateKeyInTimeZone(new Date(timing.startAt), timeZone) === todayKey
    ? "Starts today"
    : "Starts this week";
};

const focusPriorityLabel = (
  priority: CuratedFocusReason["priority"],
): string | null =>
  priority === "urgent"
    ? "Urgent"
    : priority === "high"
      ? "High priority"
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
  if (project) parts.push(`From project “${project.title}”`);
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
    return `${formatDate(new Date(`${weekStart}T00:00:00`))} – ${formatDate(
      new Date(`${weekEnd}T00:00:00`),
    )}`;
  } catch {
    return `${weekStart} – ${weekEnd}`;
  }
};

const unreadSignalsLabel = (count: number): string =>
  countLabel(count, "unread signal");

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
    return <p className="now-reason">Open task in this week’s order.</p>;
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
          {leadLabel ? "from project " : "From project "}
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
    if (workTask?.operationalState === "blocked") parts.push("Blocked");
    else if (workTask?.operationalState === "waiting")
      parts.push(
        workTask.waitingOn
          ? `Waiting on: ${workTask.waitingOn.label}`
          : "Waiting",
      );
    else if (record) parts.push(record.status.label);
    if (record?.assignment) parts.push(record.assignment.displayName);
    parts.push(...focusReasonParts(reasons, timezone, todayKey));
    return parts.length === 0
      ? "Open task in this week’s order"
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
        title="Inbox signals are unavailable"
        detail={attention.message}
        action={
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenAttention}
          >
            Open Inbox
          </button>
        }
      />
    ) : attention.kind === "ready" && attention.data.unreadCount > 0 ? (
      <section className="cockpit-exceptions" aria-label="Unread inbox signals">
        <Mark kind="warning" />
        <p>
          <strong>{unreadSignalsLabel(attention.data.unreadCount)}</strong>
          {oldestUnread.length > 0 ? (
            <span>
              {oldestUnread.length === 1 ? "Oldest: " : "Oldest two: "}
              {oldestUnread.map((item) => `“${item.title}”`).join(", ")}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          className="secondary-button compact"
          onClick={onOpenAttention}
        >
          Open Inbox
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
  // R12.6 / ADR-042 — meetings complete the day composition, and they cannot
  // come from the kernel: calendar state is deliberately device-local, so the
  // renderer composes them in beside the kernel-sourced deadlines and blocks.
  //
  // The window is the shown week rather than a rolling fortnight, so the
  // fetched events line up with the days actually rendered.
  const [weekMeetings, setWeekMeetings] = useState<
    readonly { readonly startsAt: string; readonly title: string }[]
  >([]);
  const [meetingsRefusal, setMeetingsRefusal] = useState<string>();
  const cockpitWeekStart =
    cockpit.kind === "ready" ? cockpit.data.weekStart : "";
  const cockpitWeekEnd = cockpit.kind === "ready" ? cockpit.data.weekEnd : "";
  useEffect(() => {
    if (!client?.getMeetingLoop || cockpitWeekStart === "") return;
    let active = true;
    void client
      .getMeetingLoop({
        from: `${cockpitWeekStart}T00:00:00.000Z`,
        to: `${cockpitWeekEnd}T23:59:59.999Z`,
      })
      .then((surface) => {
        if (!active) return;
        const refusal = calendarReadRefusal(surface.capability);
        setMeetingsRefusal(refusal);
        setWeekMeetings(
          refusal !== undefined
            ? []
            : surface.upcoming.map((entry) => ({
                startsAt: entry.event.startsAt,
                title: entry.event.title,
              })),
        );
      })
      // The loop being absent is itself an answer, and calendarReadRefusal
      // words it. Swallowing it would render a week that looks meeting-free.
      .catch(() => {
        if (!active) return;
        setMeetingsRefusal(calendarReadRefusal(undefined));
        setWeekMeetings([]);
      });
    return () => {
      active = false;
    };
  }, [client, cockpitWeekStart, cockpitWeekEnd]);
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
            label: new Intl.DateTimeFormat("en-US", {
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
  const meetingsByDay = new Map<string, typeof weekMeetings>();
  for (const meeting of weekMeetings) {
    const key = dateKeyInTimeZone(new Date(meeting.startsAt), timezone);
    meetingsByDay.set(key, [...(meetingsByDay.get(key) ?? []), meeting]);
  }
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
            <p className="eyebrow">Week plan</p>
            <h2 id="week-plan-title">
              Deadlines, meetings and reserved time, day by day
            </h2>
          </div>
          <span>
            {countLabel(
              scheduledThisWeek,
              "deadline this week",
              "deadlines this week",
            )}
            {reservedThisWeek.size > 0 &&
              ` · ${countLabel(reservedCount, "reserved block")}`}
          </span>
        </header>
        {overdueTasks.length > 0 ? (
          <div className="week-plan-overdue" role="group" aria-label="Overdue">
            <Mark kind="warning" />
            <p>
              <strong>{countLabel(overdueTasks.length, "overdue task")}</strong>
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
                ? ` +${overdueTasks.length - 3} more`
                : null}
            </span>
          </div>
        ) : null}
        <div className="week-plan-grid">
          {weekDays.map((day) => {
            const tasks = dueThisWeek.get(day.key) ?? [];
            const reserved = reservedThisWeek.get(day.key) ?? [];
            const meetings = meetingsByDay.get(day.key) ?? [];
            return (
              <div
                key={day.key}
                className={`week-plan-day${day.key === todayKey ? " today" : ""}`}
              >
                <h3>{day.label}</h3>
                {/* A day holding only reserved time is not an empty day. */}
                {tasks.length === 0 &&
                reserved.length === 0 &&
                meetings.length === 0 ? (
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
                      <p className="week-plan-more">+{tasks.length - 3} more</p>
                    ) : null}
                  </>
                )}
                {reserved.length > 0 && (
                  <div
                    className="week-plan-reserved"
                    role="group"
                    aria-label={`Reserved time, ${day.label}`}
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
                {meetings.length > 0 && (
                  <div
                    className="week-plan-meetings"
                    role="group"
                    aria-label={`Meetings, ${day.label}`}
                  >
                    {meetings.map((meeting) => (
                      <p
                        key={`${meeting.startsAt}-${meeting.title}`}
                        className="week-plan-meeting"
                      >
                        <span className="week-plan-block-time">
                          {formatTime(meeting.startsAt, timezone)}
                        </span>
                        {meeting.title}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {meetingsRefusal !== undefined && (
          <p className="week-plan-note">{meetingsRefusal}</p>
        )}
        {unscheduledCount > 0 ? (
          <p className="week-plan-note">
            No deadline: {countLabel(unscheduledCount, "task")}. Set a deadline
            or reserve time in the task inspector.
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
              <p className="eyebrow">Your workspaces</p>
              <h2 id="workspace-focus-title">Focus by workspace</h2>
            </div>
            <span>
              {countLabel(workspaceFocus.length, "authorized", "authorized")}
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
                      ? "Local projection unavailable"
                      : (workspace.firstFocus ?? "No open work")}
                  </small>
                </span>
                <em>
                  {workspace.active
                    ? "Open"
                    : workspace.availability === "ready"
                      ? countLabel(workspace.focusCount ?? 0, "action")
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
          title="Cross-workspace focus is unavailable"
          detail="This workspace works normally. The other encrypted projections were not opened."
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
          <p className="eyebrow">Active projects</p>
          <h2 id="outcomes-title">Outcomes to reach</h2>
        </div>
        <span>
          {projects.kind === "ready" ? projects.data.items.length : "—"}
        </span>
      </header>
      {projects.kind === "unavailable" ? (
        <InlineState
          tone="warning"
          title="Projects are unavailable"
          detail={projects.message}
        />
      ) : projectItems.length === 0 ? (
        <p className="capacity-note">No active projects yet.</p>
      ) : (
        <div role="listbox" aria-label="Active projects">
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
                  <strong>
                    <NarrativeText
                      kind="project"
                      text={project.intendedOutcome}
                      needsReview={project.needsReview}
                    />
                  </strong>
                  <small>{project.title}</small>
                </span>
                <em>
                  {countLabel(project.relatedOpenTaskCount, "open", "open")}
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
            : "Today"
        }
        // Cel nazywa się „Today" i ekran musi się z nim zgadzać — nawigacja
        // mówiąca jedno, a nagłówek drugie, czyta się jak nietrafiony klik.
        // Sama TREŚĆ jest wciąż starym widokiem tygodnia; przepisuje ją fala A,
        // więc zakres tygodnia zostaje w nadtytule, gdzie mówi prawdę o tym, co
        // widać.
        title="Today"
        description="Open tasks and active projects in one fixed order."
      />
      {cockpit.kind === "unavailable" ? (
        <>
          <InlineState
            tone="warning"
            headingLevel="h2"
            title="Today is unavailable"
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
            title="No open work this week"
            detail="Add a task with Quick Capture, or create a project with a clear outcome."
            action={
              <button className="secondary-button" onClick={onCapture}>
                Open Quick Capture
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
              <p className="eyebrow">First focus</p>
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
              Open task
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
                  <p className="eyebrow">Active work</p>
                  <h2 id="active-work-title">Next actions</h2>
                </div>
                <span>{focus.length} in order</span>
              </header>
              <p className="ordering-rule">
                <span>
                  Fixed order: overdue first, then due this week, then urgent
                  and active projects.
                </span>
                <button
                  type="button"
                  className="ordering-rule-info"
                  aria-expanded={ruleOpen}
                  aria-controls="ordering-rule-detail"
                  onClick={() => setRuleOpen((open) => !open)}
                >
                  {ruleOpen ? "Hide details" : "How is the order set?"}
                </button>
              </p>
              <div
                id="ordering-rule-detail"
                className="ordering-rule-detail"
                role="region"
                aria-label="Ordering rule"
                hidden={!ruleOpen}
              >
                <p>
                  Nothing here is generated. Open tasks always get the same
                  order. Overdue first, then due this week, urgent, high
                  priority, starting this week, active project. Ties break
                  alphabetically; creation time never changes the order.
                </p>
              </div>
              <div
                className="compact-record-list compact-record-list--focus"
                role="listbox"
                aria-label="Next actions in this week’s order"
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
        kicker="Root Space · local view"
        title="Tasks"
        description="Captured actions, their state and the kept sources."
        action={
          <button className="secondary-button" onClick={onCapture}>
            <Icon name="capture" />
            <span>New task</span>
          </button>
        }
      />
      <section className="task-panel" aria-label="Task list">
        <header>
          <div>
            <h2>All tasks</h2>
            <span aria-live="polite">
              {filteredTasks.length}
              {filtersActive ? ` of ${snapshot.tasks.length}` : " in view"}
            </span>
          </div>
        </header>
        <form
          className="task-create-row"
          aria-label="New task"
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
            <span className="sr-only">New task title</span>
            <input
              type="text"
              value={newTaskTitle}
              maxLength={500}
              disabled={creatingTask}
              placeholder="Add a task — type a title and press Enter"
              onChange={(event) => setNewTaskTitle(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="secondary-button"
            disabled={creatingTask || newTaskTitle.trim().length === 0}
          >
            {creatingTask ? "Adding…" : "Add"}
          </button>
        </form>
        {snapshot.tasks.length === 0 ? (
          <InlineState
            title="No tasks yet"
            detail="Capture the first thought. The original stays linked to what it became."
            action={
              <button className="secondary-button" onClick={onCapture}>
                Open Quick Capture
              </button>
            }
          />
        ) : (
          <>
            <div className="task-control-strip" aria-label="Task filters">
              <label className="task-search-control">
                <Icon name="search" />
                <span className="sr-only">Search tasks</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by task, state or person"
                />
              </label>
              <label className="task-filter-control">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {snapshot.bootstrap.taskStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-filter-control">
                <span>Assignee</span>
                <select
                  value={assigneeFilter}
                  onChange={(event) => setAssigneeFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="unassigned">Unassigned</option>
                  {assignmentCandidates.map((candidate) => (
                    <option
                      key={candidate.principalId}
                      value={candidate.principalId}
                    >
                      {candidate.displayName}
                      {candidate.participantKind === "guest" ? " · guest" : ""}
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
                  Clear
                </button>
              )}
            </div>
            <div className="task-column-head" aria-hidden="true">
              <span />
              <span>Task</span>
              <span>Status</span>
              <span>Assignee</span>
            </div>
            {filteredTasks.length === 0 ? (
              <InlineState
                title="No tasks in this view"
                detail="Change the filters, or clear them to see every task."
                action={
                  <button className="secondary-button" onClick={resetFilters}>
                    Clear filters
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
                          ? `Reopen: ${task.title}`
                          : `Complete: ${task.title}`
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
                            ? "From Quick Capture · original kept"
                            : "Root Space",
                          ...(task.dueAt === undefined
                            ? []
                            : [
                                `Due ${formatDate(
                                  task.dueAt,
                                  snapshot.bootstrap.workspace.timezone,
                                )}${
                                  task.completionState === "open" &&
                                  Date.parse(task.dueAt) < Date.now()
                                    ? " · overdue"
                                    : ""
                                }`,
                              ]),
                          ...(task.priority === undefined ||
                          task.priority === "normal"
                            ? []
                            : [
                                task.priority === "urgent"
                                  ? "Urgent"
                                  : task.priority === "high"
                                    ? "High priority"
                                    : "Low priority",
                              ]),
                        ].join(" · ")}
                      </span>
                    </button>
                    <label className="sr-only" htmlFor={`status-${task.id}`}>
                      Status of {task.title}
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
                      Assignee for {task.title}
                    </label>
                    <span className="task-row-field">
                      <span aria-hidden="true">Assignee</span>
                      <select
                        id={`assignee-${task.id}`}
                        className="task-assignee"
                        aria-label={`Assignee for ${task.title}`}
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
                        <option value="">Unassigned</option>
                        {task.assignment?.availability !== "active" &&
                          task.assignment !== undefined && (
                            <option value="unavailable-member" disabled>
                              {task.assignment.availability === "former_member"
                                ? "Former member"
                                : "No access to the Space"}
                            </option>
                          )}
                        {assignmentCandidates.map((candidate) => (
                          <option
                            key={candidate.principalId}
                            value={candidate.principalId}
                          >
                            {candidate.displayName}
                            {candidate.participantKind === "guest"
                              ? " · guest"
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
  client,
  snapshot,
  selectedProjectId,
  activeProjectId,
  overview,
  relation,
  clientCandidates,
  linkedClientIds,
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
  onLinkClient,
  onUnlinkClient,
  onOpenDocument,
  onOpenMeeting,
  onOpenRelationship,
  onEntityActivate,
}: {
  readonly client: ConstellationRendererClient | undefined;
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
  // Resolved by the caller, not here: which Organizations may be offered and
  // which are already directly linked are both kernel preconditions, and this
  // surface stays free of kernel semantics like every other verb on it.
  readonly clientCandidates:
    | readonly { readonly id: StrategicRecordId; readonly name: string }[]
    | undefined;
  readonly linkedClientIds: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onOpenProject: (id: ProjectId) => void;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onBackToProjects: () => void;
  readonly onCreate: (
    title: string,
    outcome: string | undefined,
    templateId?: string,
  ) => Promise<boolean>;
  readonly onApplyTemplate: (templateId: string) => void;
  readonly onUpdateOutcome: (outcome: string) => void;
  readonly onSetLifecycle: (lifecycle: "active" | "closed") => void;
  readonly onRelate: (taskId: TaskId) => void;
  readonly onUnrelate: () => void;
  readonly onLinkClient: (organizationId: StrategicRecordId) => void;
  readonly onUnlinkClient: (organizationId: StrategicRecordId) => void;
  readonly onOpenDocument: (id: DocumentId, title: string) => void;
  readonly onOpenMeeting: (id: StrategicRecordId) => void;
  readonly onOpenRelationship: (id: StrategicRecordId) => void;
  readonly onEntityActivate: (target: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  }) => void;
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
        kicker="Projects · active"
        title={fullView ? overview.project.title : "Projects"}
        description={
          fullView
            ? "The intended outcome, lifecycle and work in this project."
            : "Intended outcomes and the work behind them."
        }
        action={
          <div className="project-header-actions">
            {fullView && (
              <button
                type="button"
                className="ghost-button"
                onClick={onBackToProjects}
              >
                <span>Back to projects</span>
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
              <span>{creating ? "Cancel" : "New project"}</span>
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
            if (title.trim()) {
              void onCreate(
                title,
                newOutcome.trim() === "" ? undefined : newOutcome,
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
            <label htmlFor="project-title">Project name</label>
            <input
              ref={createTitleRef}
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              required
            />
            <label htmlFor="project-outcome">Intended outcome (optional)</label>
            <textarea
              id="project-outcome"
              value={newOutcome}
              onChange={(event) => setNewOutcome(event.target.value)}
              maxLength={2_000}
              placeholder="How will you know the work is done? You can fill this in later."
            />
            {activeTemplates.length > 0 && (
              <>
                <label htmlFor="project-create-template">
                  Starting template (optional)
                </label>
                <select
                  id="project-create-template"
                  value={createTemplateId}
                  onChange={(event) => setCreateTemplateId(event.target.value)}
                >
                  <option value="">No template</option>
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      )}
      {projects.kind === "unavailable" ? (
        <InlineState
          tone="warning"
          headingLevel="h2"
          title="The project list is unavailable"
          detail={projects.message}
        />
      ) : projectItems.length === 0 ? (
        <InlineState
          headingLevel="h2"
          title="No projects yet"
          detail="Create a project and name the outcome that tells you it is done."
        />
      ) : fullView ? (
        <div className="project-detail-flow">
          <section
            className="project-overview"
            aria-labelledby="project-outcome-title"
          >
            <div className="overview-intent">
              <p className="eyebrow">Intended outcome</p>
              {editing ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    onUpdateOutcome(editedOutcome);
                  }}
                >
                  <label className="sr-only" htmlFor="edited-project-outcome">
                    Intended outcome
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
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      disabled={busy || editedOutcome.trim() === ""}
                      type="submit"
                    >
                      Save outcome
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {overview.project.needsReview ? (
                    <>
                      {/* Nagłówek zostaje dostępną nazwą sekcji, ale nie udaje
                          treści, której nikt nie napisał. */}
                      <h2 id="project-outcome-title" className="sr-only">
                        {recordNarrativeGaps.project.field}
                      </h2>
                      <NarrativeGap
                        kind="project"
                        onWrite={() => setEditing(true)}
                      />
                    </>
                  ) : (
                    <h2 id="project-outcome-title">
                      {overview.project.intendedOutcome}
                    </h2>
                  )}
                  <div className="capture-footer">
                    {!overview.project.needsReview && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setEditing(true)}
                      >
                        Edit outcome
                      </button>
                    )}
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
                        ? "Close project"
                        : "Reopen"}
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
                      Template:{" "}
                      {projectTemplates.find(
                        (template) =>
                          template.id === overview.project.appliedTemplateId,
                      )?.name ?? "retired template"}
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
                        Template to apply
                      </label>
                      <select
                        id="project-apply-template"
                        value={applyTemplateId}
                        disabled={busy}
                        onChange={(event) =>
                          setApplyTemplateId(event.target.value)
                        }
                      >
                        <option value="">Apply template…</option>
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
                        Apply
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
          {client !== undefined && (
            <Suspense
              fallback={
                <section
                  className="project-rich-body reading-panel"
                  aria-busy="true"
                >
                  <p className="capacity-note">Opening the project document…</p>
                </section>
              }
            >
              <ProjectRichBody
                client={client}
                snapshot={snapshot}
                project={overview.project}
                onEntityActivate={onEntityActivate}
              />
            </Suspense>
          )}
          <ProjectContextSections
            overview={overview}
            clientCandidates={clientCandidates}
            linkedClientIds={linkedClientIds}
            busy={busy}
            onLinkClient={onLinkClient}
            onUnlinkClient={onUnlinkClient}
            onOpenDocument={onOpenDocument}
            onOpenMeeting={onOpenMeeting}
            onOpenRelationship={onOpenRelationship}
          />
          <section
            className="project-work reading-panel"
            aria-labelledby="project-work-title"
          >
            <header className="section-heading">
              <div>
                <p className="eyebrow">Related work</p>
                <h2 id="project-work-title">Project tasks</h2>
              </div>
              {relation ? (
                <button
                  type="button"
                  className="secondary-button compact"
                  disabled={busy}
                  onClick={onUnrelate}
                >
                  Remove last link
                </button>
              ) : unrelated[0] ? (
                <button
                  type="button"
                  className="secondary-button compact"
                  disabled={busy}
                  onClick={() => onRelate(unrelated[0]!.id)}
                >
                  Link “{unrelated[0].title}”
                </button>
              ) : null}
            </header>
            {overview.relatedTasks.length === 0 ? (
              <p className="capacity-note">
                No tasks are linked to this project yet.
              </p>
            ) : (
              <div className="compact-record-list">
                {overview.relatedTasks.map((task) => (
                  <div key={task.id} className="compact-record">
                    <Mark kind="task" />
                    <span>
                      <strong>{task.title}</strong>
                      <small>Linked to this project</small>
                    </span>
                    <em>
                      {task.completionState === "completed"
                        ? "Completed"
                        : "Open"}
                    </em>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="project-portfolio" aria-label="Project list">
          <header>
            <div>
              <h2>Project portfolio</h2>
              <span>{projectItems.length} in view</span>
            </div>
            <span>Outcome and open work</span>
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
                  <small>
                    <NarrativeText
                      kind="project"
                      text={project.intendedOutcome}
                      needsReview={project.needsReview}
                    />
                  </small>
                </span>
                <em>{project.relatedOpenTaskCount} open</em>
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
    ? "Text"
    : capture.original.kind === "url"
      ? "Link"
      : capture.original.kind === "screenshot"
        ? "Screenshot"
        : capture.original.kind === "managed_file"
          ? "Managed file"
          : capture.original.kind === "voice_note"
            ? "Voice note"
            : "File reference";

const captureResultLabel = (capture: HistoryCapture): string =>
  capture.processingState === "routed_as_task"
    ? "Task created"
    : capture.processingState === "routed_as_knowledge_source"
      ? "Knowledge source created"
      : capture.processingState === "needs_review"
        ? "Needs a decision"
        : capture.processingState === "awaiting_transcript"
          ? "Waiting for the transcript"
          : capture.processingState === "transcript_ready"
            ? capture.audioState === "retained"
              ? "Transcript ready · audio kept"
              : capture.audioState === "deleted"
                ? "Transcript ready · audio deleted"
                : "Transcript ready · deleting audio"
            : capture.processingState === "unclassified"
              ? "Kept without a classification"
              : "Waiting to be processed";

const captureCustodyLabel = (capture: HistoryCapture): string =>
  capture.original.kind === "managed_file" ||
  capture.original.kind === "screenshot" ||
  capture.original.kind === "voice_note"
    ? `Encrypted copy · ${Math.ceil(capture.original.payload.byteLength / 1024).toLocaleString("en-US")} KB · SHA-256 integrity`
    : "Local state confirmed";

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
      {captureKindLabel(capture)} · saved{" "}
      {formatDateTime(capture.capturedAt, timezone)}
    </p>
    <section className="inspector-section provenance-block">
      <p className="section-label">Processing steps</p>
      <ol className="processing-timeline">
        <li className="done">
          <i />
          <div>
            <strong>Original saved</strong>
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
                Written by {capture.transcript.writtenByKind} ·{" "}
                {formatDateTime(capture.transcript.writtenAt, timezone)}
                {capture.transcript.hostRunId
                  ? " · run " + capture.transcript.hostRunId
                  : ""}
              </small>
            )}
          </div>
        </li>
      </ol>
    </section>
    <section className="inspector-section capture-history-actions">
      <p className="section-label">Available actions</p>
      <button
        className="secondary-button"
        disabled={undoCommandId === undefined}
        title={
          undoCommandId === undefined
            ? "No reversible command for this Capture"
            : undefined
        }
        onClick={() => undoCommandId && onUndo(undoCommandId)}
      >
        Preview undo
      </button>
      {capture.processingState === "transcript_ready" &&
        capture.audioState === "retained" && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onDeleteVoiceAudio(capture.id, capture.version)}
          >
            {busy ? "Deleting…" : "Delete the kept audio"}
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
        kicker="Kept originals"
        title="Capture history"
        description="What was processed stays checkable, and reversible when versions match."
      />
      {snapshot.captures.length === 0 ? (
        <InlineState
          headingLevel="h2"
          title="Capture history is empty"
          detail="The first Quick Capture will appear here with what it became."
        />
      ) : (
        <section className="history-ledger" aria-label="Kept captures">
          <header>
            <div>
              <h2>Kept originals</h2>
              <span>{countLabel(snapshot.captures.length, "capture")}</span>
            </div>
            <span>Select a row to see its steps</span>
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

const searchResultsCountLabel = (count: number) => countLabel(count, "result");

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
    // Ognisko przenosimy TUTAJ, a nie atrybutem `autoFocus` na polu. React
    // stosuje `autoFocus` w commicie, czyli ZANIM ruszy ten efekt — więc linia
    // wyżej odczytywała jako „kto otworzył" już własne pole nakładki, a przy
    // zamknięciu oddawała ognisko elementowi, który sama właśnie usuwała.
    // Ognisko lądowało na `<body>`. `UndoDialog` w tym samym pliku robi to
    // od początku imperatywnie (`cancelRef.current?.focus()`) i dlatego działa.
    searchInputRef.current?.focus();
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
      getHumanRecordKindDescriptor(item.recordKind).inspectorSurface,
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
          Command palette and global search
        </h2>
        <div className="search-query">
          <Mark kind="search" />
          <label className="sr-only" htmlFor="global-search">
            Open a view, or search projects, tasks and captures
          </label>
          <input
            ref={searchInputRef}
            id="global-search"
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
            placeholder="View, project, task, source…"
          />
          <kbd>Esc</kbd>
        </div>
        <p className="search-scope">
          Local index · {snapshot.bootstrap.workspace.name} · this workspace
          only
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
              state.kind === "idle" ? "Navigation commands" : "Search results"
            }
          >
            {state.kind === "idle" && <p role="presentation">Open a view</p>}
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
                  <small>Navigation command</small>
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
                    {item.matchedFields.includes("body") ? "Body · " : ""}
                    {item.snippet}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : state.kind === "loading" ? (
          <div className="search-empty" aria-busy="true">
            <strong>Searching…</strong>
            <span>Checking projects, tasks and captures.</span>
          </div>
        ) : state.kind === "error" ? (
          <div className="search-empty" role="alert">
            <strong>Search is unavailable</strong>
            <span>
              The local index could not answer. Your data is unchanged.
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
                Try again
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
                Clear the query
              </button>
            </div>
          </div>
        ) : (
          <div className="search-empty">
            <strong>No results for “{query}”</strong>
            <span>Check the spelling, or try a broader term.</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                searchInputRef.current?.focus();
                setQuery("");
                setActiveIndex(0);
              }}
            >
              Clear the query
            </button>
          </div>
        )}
        <footer>
          <span>↑↓ select</span>
          <span>↵ open</span>
          <span>Esc close</span>
          <span>{modifierLabel}/ shortcuts</span>
        </footer>
      </section>
    </dialog>
  );
};

const compensationCopy: Record<string, string> = {
  "project.restore_outcome": "Restore the previous project outcome",
  "task.restore_state": "Restore the previous task state",
  "task.restore_operational_state": "Restore the previous operational state",
  "work_link.restore_state": "Restore the previous work link",
  "relationship.restore_person": "Restore the previous person details",
  "relationship.restore_organization":
    "Restore the previous organization details",
  "relation.remove": "Remove the added relation",
  "relation.restore": "Restore the removed relation",
  "capture.undo_route": "Undo the capture routing",
  "capture.undo_knowledge_route": "Undo routing the capture to knowledge",
  "knowledge.restore_source": "Restore the previous source",
  "knowledge.restore_evidence": "Restore the previous evidence set",
  "knowledge.void_named_version": "Void the named version",
};

const unavailableReasonCopy: Record<string, string> = {
  unsupported: "This command cannot be undone",
  already_undone: "This command was already undone",
  later_change: "A later change blocks a safe undo",
  still_referenced: "Another record still references this",
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
            <p className="eyebrow">Undo preview</p>
            <h2 id="undo-title">
              {available ? "Undo this change?" : "This change cannot be undone"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close the undo preview"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <dl>
          <div>
            <dt>Command</dt>
            <dd className="mono">{preview.targetCommandId.slice(0, 18)}…</dd>
          </div>
          <div>
            <dt>Impact</dt>
            <dd>
              {countLabel(preview.recovery.affectedRecordIds.length, "record")}
            </dd>
          </div>
          <div>
            <dt>Compensation</dt>
            <dd>
              {preview.recovery.compensationKind !== undefined
                ? (compensationCopy[preview.recovery.compensationKind] ??
                  "Restore the previous state")
                : preview.recovery.unavailableReason !== undefined
                  ? (unavailableReasonCopy[
                      preview.recovery.unavailableReason
                    ] ?? "Unavailable")
                  : "Unavailable"}
            </dd>
          </div>
        </dl>
        <div className="undo-safety">
          <Mark kind={available ? "recovery" : "warning"} />
          <span>
            <strong>
              {available
                ? "Versions match"
                : "The state changed since the command"}
            </strong>
            <small>
              {available
                ? "The undo is written as its own auditable command."
                : "Nothing was changed."}
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
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!available || busy}
            onClick={onConfirm}
          >
            {busy ? "Undoing…" : "Undo the change"}
          </button>
        </footer>
      </section>
    </dialog>
  );
};

export const failureMessage = (failure: MutationFailure): string =>
  failure.message;
