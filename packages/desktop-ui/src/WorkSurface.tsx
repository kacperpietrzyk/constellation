import {
  Fragment,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { ProjectId, TaskId } from "@constellation/contracts";
import { type DesktopSnapshot } from "./client/workflow.js";
import { InlinePopover } from "./components/InlinePopover.js";
import { NarrativeText } from "./components/RecordNarrative.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import { useSurfaceDensity } from "./hooks/useSurfaceDensity.js";
import {
  useWorkListFieldVisibility,
  type WorkListFieldKey,
} from "./hooks/useWorkListFieldVisibility.js";
import { countLabel, dateKeyInZone, formatDate } from "./i18n.js";

import "./work-board.css";
import "./work-calendar.css";
import "./work-density.css";
import "./work-field-visibility.css";
import "./work-timeline.css";

const shiftMonthKey = (monthKey: string, offset: number): string => {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
};

const monthDateKeys = (monthKey: string): readonly (string | undefined)[] => {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year!, month! - 1, 1));
  const leading = (first.getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const cells: (string | undefined)[] = Array.from(
    { length: leading },
    () => undefined,
  );
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(undefined);
  return cells;
};

const monthLabel = (monthKey: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthKey}-01T12:00:00.000Z`));

const fullDateLabel = (dateKey: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));

const coreWorkListFields: readonly {
  readonly key: WorkListFieldKey;
  readonly label: string;
}[] = [
  { key: "context", label: "Context" },
  { key: "status", label: "Status" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Priority" },
  { key: "start", label: "Start" },
  { key: "due", label: "Deadline" },
];

const WorkEmpty = ({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: string;
  readonly action?: ReactNode;
}) => (
  <div className="work-empty" role="status">
    <span className="empty-glyph" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M5 12h14" />
      </svg>
    </span>
    <div>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
    {action}
  </div>
);

export const WorkSurface = ({
  snapshot,
  selectedTaskId,
  selectedProjectId,
  onSelectTask,
  onOpenTask,
  onSelectProject,
  onReload,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly selectedProjectId: ProjectId | undefined;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onSelectProject: (id: ProjectId) => void;
  readonly onReload: () => Promise<void>;
}) => {
  const work = snapshot.work;
  const [openPopover, setOpenPopover] = useState<string>();
  const projection = work.kind === "ready" ? work.data : undefined;
  const [activeViewId, setActiveViewId] = useState<string>();
  // Branded, and not as decoration: `SavedWorkViewFilters` is now DERIVED from
  // the projection rather than restated beside it, and the projection brands
  // this id. The hand-written copy typed it a bare `string`, so a filter set
  // built here type-checked while carrying an id the query layer would not
  // accept. The brand is lost crossing a `<select>` and restored below, the
  // same way `TasksSurface` restores it.
  const [density, setDensity] = useSurfaceDensity("work");
  const timeZone = snapshot.bootstrap.workspace.timezone;
  // The applied saved view is a deterministic client-side projection of the
  // already permission-safe work overview: same filters, same order, every
  // time. Week membership follows the workspace calendar.
  const activeView = projection?.savedViews.find(
    (view) => view.id === activeViewId,
  );
  const activeTaskFieldDefinitions = (
    snapshot.bootstrap.fieldDefinitions ?? []
  ).filter(
    (definition) =>
      definition.targetKind === "task" && definition.state !== "retired",
  );
  const availableListFields = [
    ...coreWorkListFields,
    ...activeTaskFieldDefinitions.map((definition) => ({
      key: `field:${definition.id}` as WorkListFieldKey,
      label: definition.label,
    })),
  ];
  const availableListFieldKeys = availableListFields.map((field) => field.key);
  const [visibleListFieldKeys, toggleListField, resetListFields] =
    useWorkListFieldVisibility(activeView?.id ?? "all", availableListFieldKeys);
  const visibleListFields = availableListFields.filter((field) =>
    visibleListFieldKeys.includes(field.key),
  );
  const todayKey = dateKeyInZone(new Date(), timeZone);
  const [calendarMonthKey, setCalendarMonthKey] = useState(() =>
    todayKey.slice(0, 7),
  );
  const weekdayIndex = (() => {
    try {
      const name = new Intl.DateTimeFormat("en", {
        timeZone,
        weekday: "short",
      }).format(new Date());
      return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
    } catch {
      return (new Date().getDay() + 6) % 7;
    }
  })();
  const dayKeyAt = (offset: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return dateKeyInZone(date, timeZone);
  };
  const weekStartKey = dayKeyAt(-Math.max(0, weekdayIndex));
  const weekEndKey = dayKeyAt(6 - Math.max(0, weekdayIndex));
  // ADR-045. Relation filtering is NOT evaluated here. The kernel resolves the
  // view's relation conditions and sends the Task ids that satisfy them; this
  // is a membership test against that answer, never a walk of the relation
  // graph. Re-deriving relations client-side would reopen the ADR-036 deferral
  // the kernel evaluator closed, and would let the desktop and an MCP operator
  // disagree about what the same saved view means.
  //
  // Absent means the view carries no relation condition; an empty array means
  // it carries one that nothing matched — those must not collapse together.
  const relationAllowList =
    activeView?.relationTaskIds === undefined
      ? undefined
      : new Set(activeView.relationTaskIds);
  const matchesActiveView = (
    task: NonNullable<typeof projection>["tasks"][number],
  ): boolean => {
    if (!activeView) return true;
    if (relationAllowList !== undefined && !relationAllowList.has(task.id))
      return false;
    const filters = activeView.filters;
    if (
      filters.operationalStates !== undefined &&
      !filters.operationalStates.includes(task.operationalState)
    )
      return false;
    if (filters.unassigned === true && task.assignment !== undefined)
      return false;
    if (
      filters.statusIds !== undefined &&
      !filters.statusIds.includes(task.statusId)
    )
      return false;
    if (
      filters.assigneePrincipalIds !== undefined &&
      // A view naming somebody this reader may not be told about matches
      // nothing, rather than matching by an id the projection withheld.
      (task.assignment?.assigneePrincipalId === undefined ||
        !filters.assigneePrincipalIds.includes(
          task.assignment.assigneePrincipalId,
        ))
    )
      return false;
    if (
      filters.priorities !== undefined &&
      !filters.priorities.includes(task.priority ?? "normal")
    )
      return false;
    if (filters.scheduled !== undefined) {
      if (filters.scheduled !== (task.dueAt !== undefined)) return false;
    }
    if (filters.dueWindow !== undefined) {
      if (task.dueAt === undefined) return false;
      const dueKey = dateKeyInZone(task.dueAt, timeZone);
      if (filters.dueWindow === "overdue") {
        if (Date.parse(task.dueAt) >= Date.now()) return false;
      } else if (filters.dueWindow === "today") {
        if (dueKey !== todayKey) return false;
      } else if (dueKey < weekStartKey || dueKey > weekEndKey) return false;
    }
    for (const filter of filters.fields ?? []) {
      const value = task.fields?.[filter.fieldId];
      if (filter.predicate.kind === "set" && value === undefined) return false;
      if (filter.predicate.kind === "empty" && value !== undefined)
        return false;
      if (
        filter.predicate.kind === "choice_is" &&
        (value?.kind !== "choice" || value.value !== filter.predicate.option)
      )
        return false;
    }
    return true;
  };
  const priorityRank = { urgent: 3, high: 2, normal: 1, low: 0 } as const;
  const priorityLabels = {
    urgent: "Urgent",
    high: "High priority",
    normal: "Normal priority",
    low: "Low priority",
  } as const;
  const groupBy = activeView?.groupBy;
  const orderedTaskStatuses = snapshot.bootstrap.taskStatuses.toSorted(
    (left, right) => left.position - right.position,
  );
  // Group order is declared, never inferred: status position, priority rank,
  // or the definition's option order, with an explicit trailing "No value"
  // group. Grouping composes before the view's sort.
  const groupFor = (
    task: NonNullable<typeof projection>["tasks"][number],
  ): {
    readonly key: string;
    readonly rank: number;
    readonly label: string;
  } => {
    if (groupBy === "status") {
      const index = orderedTaskStatuses.findIndex(
        (status) => status.id === task.statusId,
      );
      return {
        key: index === -1 ? "status:historical" : `status:${task.statusId}`,
        rank: index === -1 ? Number.MAX_SAFE_INTEGER : index,
        label: orderedTaskStatuses[index]?.label ?? "Historical status",
      };
    }
    if (groupBy === "priority") {
      const priority = task.priority ?? "normal";
      return {
        key: `priority:${priority}`,
        rank: 3 - priorityRank[priority],
        label: priorityLabels[priority],
      };
    }
    // Narrowed on the object shape, not on "not undefined": the vocabulary now
    // also carries "assignee" and "project", which this surface does not group
    // by. They fall through to the single "all" group below — the Tasks screen
    // that replaces this surface owns those two branches.
    if (typeof groupBy === "object") {
      const definition = (snapshot.bootstrap.fieldDefinitions ?? []).find(
        (candidate) => candidate.id === groupBy.fieldId,
      );
      const value = task.fields?.[groupBy.fieldId];
      const options =
        definition?.type.kind === "choice" ? definition.type.options : [];
      const index =
        value?.kind === "choice" ? options.indexOf(value.value) : -1;
      return index === -1
        ? {
            key: "field:empty",
            rank: Number.MAX_SAFE_INTEGER,
            label: "No value",
          }
        : {
            key: `field:${options[index]!}`,
            rank: index,
            label: options[index]!,
          };
    }
    return { key: "all", rank: 0, label: "" };
  };
  const visibleTasks = (projection?.tasks ?? [])
    .filter(matchesActiveView)
    .toSorted((left, right) => {
      if (groupBy !== undefined) {
        const byGroup = groupFor(left).rank - groupFor(right).rank;
        if (byGroup !== 0) return byGroup;
      }
      if (activeView?.sort === "title_asc")
        return (
          left.title.localeCompare(right.title, "pl-PL") ||
          left.id.localeCompare(right.id)
        );
      if (activeView?.sort === "due_asc") {
        if (left.dueAt !== undefined || right.dueAt !== undefined) {
          if (left.dueAt === undefined) return 1;
          if (right.dueAt === undefined) return -1;
          const byDue = Date.parse(left.dueAt) - Date.parse(right.dueAt);
          if (byDue !== 0) return byDue;
        }
        const byPriority =
          priorityRank[right.priority ?? "normal"] -
          priorityRank[left.priority ?? "normal"];
        if (byPriority !== 0) return byPriority;
        return left.id.localeCompare(right.id);
      }
      return 0;
    });
  const declaredGroups = (() => {
    if (groupBy === "status") {
      return orderedTaskStatuses
        .map((status, index) => ({
          key: `status:${status.id}`,
          label: status.label,
          rank: index,
          state: status.state,
          statusId: status.id,
        }))
        .filter(
          (status) =>
            status.state !== "archived" ||
            visibleTasks.some((task) => task.statusId === status.statusId),
        );
    }
    if (groupBy === "priority") {
      return (["urgent", "high", "normal", "low"] as const).map(
        (priority, index) => ({
          key: `priority:${priority}`,
          label: priorityLabels[priority],
          rank: index,
        }),
      );
    }
    if (typeof groupBy === "object") {
      const definition = (snapshot.bootstrap.fieldDefinitions ?? []).find(
        (candidate) => candidate.id === groupBy.fieldId,
      );
      return definition?.type.kind === "choice"
        ? definition.type.options.map((option, index) => ({
            key: `field:${option}`,
            label: option,
            rank: index,
          }))
        : [];
    }
    return [];
  })();
  const actualGroups = new Map<
    string,
    {
      readonly key: string;
      readonly label: string;
      readonly rank: number;
      readonly tasks: typeof visibleTasks;
    }
  >();
  for (const task of visibleTasks) {
    const group = groupFor(task);
    const current = actualGroups.get(group.key);
    if (current === undefined) {
      actualGroups.set(group.key, { ...group, tasks: [task] });
    } else {
      actualGroups.set(group.key, {
        ...current,
        tasks: [...current.tasks, task],
      });
    }
  }
  const taskGroups = [
    ...declaredGroups.map((group) => ({
      ...group,
      tasks: actualGroups.get(group.key)?.tasks ?? [],
    })),
    ...[...actualGroups.values()].filter(
      (group) => !declaredGroups.some((declared) => declared.key === group.key),
    ),
  ].toSorted((left, right) => left.rank - right.rank);
  const visibleTaskIndex = new Map(
    visibleTasks.map((task, index) => [task.id, index]),
  );
  const requestedLayout = activeView?.layout ?? "list";
  const activeLayout =
    requestedLayout === "board" && groupBy === undefined
      ? "list"
      : requestedLayout;
  const timelineInstants = visibleTasks.flatMap((task) =>
    [task.startAt, task.dueAt]
      .filter((instant): instant is string => instant !== undefined)
      .map((instant) => Date.parse(instant)),
  );
  const timelineStart =
    timelineInstants.length === 0 ? undefined : Math.min(...timelineInstants);
  const timelineEnd =
    timelineInstants.length === 0 ? undefined : Math.max(...timelineInstants);
  const timelineRange =
    timelineStart === undefined || timelineEnd === undefined
      ? undefined
      : Math.max(timelineEnd - timelineStart, 1);
  const timelineTicks =
    timelineStart === undefined ||
    timelineEnd === undefined ||
    timelineRange === undefined
      ? []
      : [timelineStart, timelineStart + timelineRange / 2, timelineEnd];
  const calendarCells = monthDateKeys(calendarMonthKey);
  const calendarMonthStart = `${calendarMonthKey}-01`;
  const calendarMonthEnd = [...calendarCells]
    .reverse()
    .find((dateKey): dateKey is string => dateKey !== undefined)!;
  const calendarTasksByDate = new Map<string, typeof visibleTasks>();
  const calendarBeforeTasks: typeof visibleTasks = [];
  const calendarAfterTasks: typeof visibleTasks = [];
  const calendarUndatedTasks: typeof visibleTasks = [];
  for (const task of visibleTasks) {
    const anchor = task.dueAt ?? task.startAt;
    if (anchor === undefined) {
      calendarUndatedTasks.push(task);
      continue;
    }
    const anchorKey = dateKeyInZone(anchor, timeZone);
    if (anchorKey < calendarMonthStart) {
      calendarBeforeTasks.push(task);
      continue;
    }
    if (anchorKey > calendarMonthEnd) {
      calendarAfterTasks.push(task);
      continue;
    }
    calendarTasksByDate.set(anchorKey, [
      ...(calendarTasksByDate.get(anchorKey) ?? []),
      task,
    ]);
  }
  const calendarOverflowGroups = [
    { label: "Earlier", tasks: calendarBeforeTasks },
    { label: "Later", tasks: calendarAfterTasks },
    { label: "No date", tasks: calendarUndatedTasks },
  ] as const;
  const taskNav = useListNavigation({
    itemCount: visibleTasks.length,
    onOpen: (index) => {
      const task = visibleTasks[index];
      if (task) onOpenTask(task.id);
    },
    onSelect: (index) => {
      const task = visibleTasks[index];
      if (task) onSelectTask(task.id);
    },
  });
  const activeLinks =
    projection?.links.filter((link) => link.state === "active") ?? [];
  const projectContext = useMemo(
    () =>
      new Map(
        activeLinks
          // Only the two strategic links this surface can name. A
          // project_serves_organization link resolves to a client this
          // projection does not carry, and letting it through would label the
          // Project with an empty area title — or overwrite the area label it
          // already had, since both links share the Project as their key.
          .filter(
            (link) =>
              link.linkType === "project_advances_initiative" ||
              link.linkType === "project_serves_area",
          )
          .map((link) => [
            link.sourceRecordId,
            link.linkType === "project_advances_initiative"
              ? projection?.initiatives.find(
                  (initiative) => initiative.id === link.targetRecordId,
                )?.title
              : projection?.areas.find(
                  (area) => area.id === link.targetRecordId,
                )?.title,
          ]),
      ),
    [activeLinks, projection],
  );

  if (projection === undefined) {
    return (
      <div className="surface-scroll work-surface">
        <header className="surface-header wave2-header">
          <div>
            <p className="eyebrow">Work model</p>
            <h1 id="surface-title" tabIndex={-1}>
              Work
            </h1>
            <p>Responsibility, outcomes and next actions in one thread.</p>
          </div>
        </header>
        <WorkEmpty
          title="Work view unavailable"
          detail={work.kind === "unavailable" ? work.message : "Try again."}
          action={
            <button
              type="button"
              className="secondary-button"
              onClick={() => void onReload()}
            >
              Try again
            </button>
          }
        />
      </div>
    );
  }

  // Popover forms reset by unmounting, so run() closes the matching popover
  // (and resets the form) only after the mutation reports success; a failure
  // keeps the draft on screen.

  const assigneeNames = new Map(
    snapshot.assignmentCandidates.kind === "ready"
      ? snapshot.assignmentCandidates.data.candidates.map((candidate) => [
          candidate.principalId,
          candidate.displayName,
        ])
      : [],
  );
  const taskContextLabel = (task: (typeof visibleTasks)[number]): string => {
    const dependency = activeLinks.find(
      (link) =>
        link.linkType === "task_depends_on_task" &&
        link.sourceRecordId === task.id,
    );
    const dependencyTitle = projection.tasks.find(
      (item) => item.id === dependency?.targetRecordId,
    )?.title;
    if (task.waitingOn !== undefined) {
      const direction =
        task.waitingOn.direction === "we_owe" ? "We owe: " : "Waiting on: ";
      const review =
        task.waitingOn.expectedAt === undefined
          ? ""
          : ` · review ${formatDate(
              task.waitingOn.expectedAt,
              snapshot.bootstrap.workspace.timezone,
            )}`;
      return `${direction}${task.waitingOn.label}${review}`;
    }
    return dependencyTitle === undefined
      ? "Ready to start"
      : `Depends on: ${dependencyTitle}`;
  };
  const listFieldValue = (
    task: (typeof visibleTasks)[number],
    field: (typeof availableListFields)[number],
  ): string => {
    switch (field.key) {
      case "context":
        return taskContextLabel(task);
      case "status":
        return (
          orderedTaskStatuses.find((status) => status.id === task.statusId)
            ?.label ?? "Historical status"
        );
      case "assignee":
        // The projection already decided what this reader may be told; the
        // group takes its name from that answer instead of looking the
        // principal up a second time and disagreeing.
        if (task.assignment === undefined) return "Unassigned";
        return task.assignment.assigneePrincipalId === undefined
          ? task.assignment.displayName
          : (assigneeNames.get(task.assignment.assigneePrincipalId) ??
              task.assignment.displayName);
      case "priority":
        return priorityLabels[task.priority ?? "normal"];
      case "start":
        return task.startAt === undefined
          ? "—"
          : formatDate(task.startAt, snapshot.bootstrap.workspace.timezone);
      case "due":
        return task.dueAt === undefined
          ? "—"
          : `${formatDate(
              task.dueAt,
              snapshot.bootstrap.workspace.timezone,
            )}${Date.parse(task.dueAt) < Date.now() ? " · overdue" : ""}`;
      default: {
        const value = task.fields?.[field.key.slice("field:".length)];
        if (value === undefined) return "—";
        if (value.kind === "date")
          return formatDate(value.value, snapshot.bootstrap.workspace.timezone);
        if (value.kind === "number")
          return new Intl.NumberFormat("pl-PL").format(value.value);
        return value.value;
      }
    }
  };

  const renderTask = (
    task: (typeof visibleTasks)[number],
    index: number,
    variant: "list" | "board" | "timeline" | "calendar",
  ) => {
    return (
      <article
        key={task.id}
        className={`work-task-row work-task-row--${variant}${
          variant === "list" && visibleListFields.length > 0
            ? " has-list-fields"
            : ""
        } state-${task.operationalState}${
          task.id === selectedTaskId ? " selected" : ""
        }`}
      >
        <span className="task-state-mark" aria-hidden="true" />
        <button
          type="button"
          className="work-task-copy work-row-copy"
          role="option"
          aria-selected={task.id === selectedTaskId}
          {...taskNav(index)}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) onOpenTask(task.id);
            else onSelectTask(task.id);
          }}
          onDoubleClick={() => onOpenTask(task.id)}
        >
          <strong>{task.title}</strong>
          {variant !== "list" && (
            <span>
              {[
                taskContextLabel(task),
                ...((variant !== "timeline" && variant !== "calendar") ||
                task.startAt === undefined
                  ? []
                  : [
                      `Start: ${formatDate(
                        task.startAt,
                        snapshot.bootstrap.workspace.timezone,
                      )}`,
                    ]),
                ...(task.dueAt === undefined
                  ? []
                  : [
                      `Deadline: ${formatDate(
                        task.dueAt,
                        snapshot.bootstrap.workspace.timezone,
                      )}${Date.parse(task.dueAt) < Date.now() ? " · overdue" : ""}`,
                    ]),
                ...((variant !== "timeline" && variant !== "calendar") ||
                task.startAt !== undefined ||
                task.dueAt !== undefined
                  ? []
                  : ["No deadline"]),
                ...(task.priority === undefined ||
                task.priority === "normal" ||
                task.priority === "low"
                  ? []
                  : [task.priority === "urgent" ? "Urgent" : "High priority"]),
              ].join(" · ")}
            </span>
          )}
        </button>
        {variant === "list" && visibleListFields.length > 0 && (
          <span
            className="work-list-field-grid"
            style={
              {
                "--work-list-field-count": visibleListFields.length,
              } as CSSProperties
            }
          >
            {visibleListFields.map((field) => (
              <span className="work-list-field-cell" key={field.key}>
                <small>{field.label}</small>
                <span>{listFieldValue(task, field)}</span>
              </span>
            ))}
          </span>
        )}
      </article>
    );
  };

  return (
    <div className="surface-scroll work-surface" data-density={density}>
      <header className="surface-header wave2-header work-header">
        <div>
          <p className="eyebrow">Area → initiative → project → action</p>
          <h1 id="surface-title" tabIndex={-1}>
            Work
          </h1>
          <p>
            Lasting responsibility stays separate from the outcome to reach.
          </p>
        </div>
        <div className="work-header-controls">
          <span className="work-freshness">
            {projection.freshness.mode === "local_authoritative"
              ? "Local source of truth"
              : "Synced projection"}
          </span>
          <fieldset className="work-density-switch">
            <legend>Work surface density</legend>
            <button
              type="button"
              aria-pressed={density === "comfortable"}
              onClick={() => setDensity("comfortable")}
            >
              Comfortable
            </button>
            <button
              type="button"
              aria-pressed={density === "compact"}
              onClick={() => setDensity("compact")}
            >
              Compact
            </button>
          </fieldset>
        </div>
      </header>

      <nav className="saved-view-strip" aria-label="Saved work views">
        <span>Views</span>
        <button
          type="button"
          className={`view-chip${activeViewId === undefined ? " active" : ""}`}
          aria-pressed={activeViewId === undefined}
          onClick={() => setActiveViewId(undefined)}
        >
          All
        </button>
        {projection.savedViews.length === 0 ? (
          <em>No saved views yet</em>
        ) : (
          projection.savedViews.map((view) => (
            <button
              type="button"
              key={view.id}
              className={`view-chip${activeViewId === view.id ? " active" : ""}`}
              aria-pressed={activeViewId === view.id}
              onClick={() =>
                setActiveViewId((current) =>
                  current === view.id ? undefined : view.id,
                )
              }
            >
              {view.name}
            </button>
          ))
        )}
      </nav>

      <div className="work-thread">
        <section
          className="work-delivery-column"
          aria-labelledby="work-delivery-title"
        >
          <div className="work-section-heading">
            <div>
              <h2 id="work-delivery-title">Projects and next actions</h2>
            </div>
            <div className="work-heading-meta">
              <span>
                {countLabel(projection.projects.length, "project")} ·{" "}
                {countLabel(visibleTasks.length, "task")}
                {activeView !== undefined ? ` · view “${activeView.name}”` : ""}
              </span>
              {activeLayout === "list" && (
                <InlinePopover
                  label={`Fields · ${visibleListFields.length}`}
                  panelLabel={`Visible list fields: ${activeView?.name ?? "All"}`}
                  triggerClassName="work-field-visibility-trigger"
                  open={openPopover === "list-fields"}
                  onOpenChange={(next) =>
                    setOpenPopover(next ? "list-fields" : undefined)
                  }
                >
                  <fieldset className="work-field-visibility">
                    <legend>List fields — {activeView?.name ?? "All"}</legend>
                    <p>
                      Title and action state always show. This choice is local
                      to this device.
                    </p>
                    <div className="work-field-visibility-options">
                      {availableListFields.map((field) => (
                        <label key={field.key}>
                          <input
                            type="checkbox"
                            checked={visibleListFieldKeys.includes(field.key)}
                            onChange={() => toggleListField(field.key)}
                          />
                          <span>{field.label}</span>
                        </label>
                      ))}
                    </div>
                    <button type="button" onClick={resetListFields}>
                      Reset to recommended
                    </button>
                  </fieldset>
                </InlinePopover>
              )}
            </div>
          </div>
          {projection.projects.map((project) => (
            <button
              type="button"
              className={`work-project-row${
                project.id === selectedProjectId ? " selected" : ""
              }`}
              aria-pressed={project.id === selectedProjectId}
              key={project.id}
              onClick={() => onSelectProject(project.id)}
            >
              <span className="work-branch" aria-hidden="true" />
              <span className="work-row-copy">
                <small>
                  {projectContext.get(project.id) ??
                    "Project without a context"}
                </small>
                <strong>{project.title}</strong>
                <span>
                  <NarrativeText
                    kind="project"
                    text={project.intendedOutcome}
                    needsReview={project.needsReview}
                  />
                </span>
              </span>
            </button>
          ))}
          {projection.projects.length === 0 && (
            <WorkEmpty
              title="No projects"
              detail="A project should lead to one checkable outcome."
            />
          )}
          {/* Roving tabindex pairs with listbox/option semantics, matching the
              cockpit lists: AT learns this is one composite widget where Tab
              stops once and arrows move between rows. */}
          {activeLayout === "list" && (
            <div className="work-task-list-shell">
              <div
                className={`work-list-columns${
                  visibleListFields.length > 0 ? " has-list-fields" : ""
                }`}
                aria-hidden="true"
              >
                <span />
                <span>Task</span>
                {visibleListFields.length > 0 && (
                  <span
                    className="work-list-field-headings"
                    style={
                      {
                        "--work-list-field-count": visibleListFields.length,
                      } as CSSProperties
                    }
                  >
                    {visibleListFields.map((field) => (
                      <span key={field.key}>{field.label}</span>
                    ))}
                  </span>
                )}
                <span>State</span>
              </div>
              <div
                className="work-task-list"
                role="listbox"
                aria-label="Next actions — list"
              >
                {visibleTasks.map((task, index) => {
                  const group =
                    groupBy === undefined ? undefined : groupFor(task);
                  const previous = visibleTasks[index - 1];
                  const groupStarts =
                    group !== undefined &&
                    (previous === undefined ||
                      groupFor(previous).key !== group.key);
                  return (
                    <Fragment key={task.id}>
                      {groupStarts && group !== undefined && (
                        <div className="work-group-heading" role="presentation">
                          <span>{group.label}</span>
                          <small>
                            {countLabel(
                              visibleTasks.filter(
                                (candidate) =>
                                  groupFor(candidate).key === group.key,
                              ).length,
                              "task",
                            )}
                          </small>
                        </div>
                      )}
                      {renderTask(task, index, "list")}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}
          {activeLayout === "board" && (
            <div
              className="work-task-board"
              role="listbox"
              aria-label="Next actions — board"
            >
              {taskGroups.map((group) => (
                <section
                  className="work-board-column"
                  role="group"
                  aria-label={group.label}
                  key={group.key}
                >
                  <header>
                    <h3>{group.label}</h3>
                    <span>{group.tasks.length}</span>
                  </header>
                  <div className="work-board-cards">
                    {group.tasks.length === 0 ? (
                      <p>No tasks</p>
                    ) : (
                      group.tasks.map((task) =>
                        renderTask(
                          task,
                          visibleTaskIndex.get(task.id)!,
                          "board",
                        ),
                      )
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
          {activeLayout === "timeline" && (
            <div
              className="work-task-timeline"
              role="listbox"
              aria-label="Next actions — timeline"
            >
              <div className="work-timeline-content">
                <div className="work-timeline-axis" aria-hidden="true">
                  <span>Task</span>
                  {timelineTicks.length === 0 ? (
                    <strong>No planned dates</strong>
                  ) : (
                    <div>
                      {timelineTicks.map((instant, index) => (
                        <time
                          dateTime={new Date(instant).toISOString()}
                          key={`${instant}:${index}`}
                        >
                          {formatDate(
                            new Date(instant).toISOString(),
                            snapshot.bootstrap.workspace.timezone,
                          )}
                        </time>
                      ))}
                    </div>
                  )}
                </div>
                {visibleTasks.map((task, index) => {
                  const start = Date.parse(task.startAt ?? task.dueAt ?? "");
                  const end = Date.parse(task.dueAt ?? task.startAt ?? "");
                  const hasTiming =
                    timelineStart !== undefined &&
                    timelineRange !== undefined &&
                    Number.isFinite(start) &&
                    Number.isFinite(end);
                  const left = hasTiming
                    ? ((start - timelineStart) / timelineRange) * 100
                    : 0;
                  const width = hasTiming
                    ? ((end - start) / timelineRange) * 100
                    : 0;
                  const isSpan = hasTiming && end > start;
                  return (
                    <div className="work-timeline-row" key={task.id}>
                      {renderTask(task, index, "timeline")}
                      <div className="work-timeline-track" aria-hidden="true">
                        {hasTiming ? (
                          <span
                            className={
                              isSpan
                                ? "work-timeline-span"
                                : "work-timeline-milestone"
                            }
                            style={{
                              left: `${left}%`,
                              ...(isSpan ? { width: `${width}%` } : {}),
                            }}
                          />
                        ) : (
                          <span className="work-timeline-unscheduled">
                            No deadline
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeLayout === "calendar" && (
            <section
              className="work-task-calendar"
              aria-labelledby="work-calendar-month-label"
            >
              <header className="work-calendar-toolbar">
                <div>
                  <span>Task calendar</span>
                  <h3 id="work-calendar-month-label">
                    {monthLabel(calendarMonthKey)}
                  </h3>
                </div>
                <nav aria-label="Month navigation">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() =>
                      setCalendarMonthKey((current) =>
                        shiftMonthKey(current, -1),
                      )
                    }
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarMonthKey(todayKey.slice(0, 7))}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() =>
                      setCalendarMonthKey((current) =>
                        shiftMonthKey(current, 1),
                      )
                    }
                  >
                    →
                  </button>
                </nav>
              </header>
              <div className="work-calendar-scroll">
                <div className="work-calendar-content">
                  <div className="work-calendar-weekdays" aria-hidden="true">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (weekday) => (
                        <span key={weekday}>{weekday}</span>
                      ),
                    )}
                  </div>
                  <div
                    className="work-calendar-grid"
                    role="listbox"
                    aria-label={`Tasks — ${monthLabel(calendarMonthKey)}`}
                  >
                    {calendarCells.map((dateKey, cellIndex) => {
                      if (dateKey === undefined) {
                        return (
                          <div
                            className="work-calendar-day work-calendar-day--blank"
                            aria-hidden="true"
                            key={`blank:${cellIndex}`}
                          />
                        );
                      }
                      const tasks = calendarTasksByDate.get(dateKey) ?? [];
                      return (
                        <section
                          className={`work-calendar-day${
                            dateKey === todayKey
                              ? " work-calendar-day--today"
                              : ""
                          }`}
                          role="group"
                          aria-label={fullDateLabel(dateKey)}
                          key={dateKey}
                        >
                          <header>
                            <time dateTime={dateKey}>
                              {Number(dateKey.slice(-2))}
                            </time>
                            {dateKey === todayKey && <span>Today</span>}
                          </header>
                          <div className="work-calendar-day-tasks">
                            {tasks.map((task) =>
                              renderTask(
                                task,
                                visibleTaskIndex.get(task.id)!,
                                "calendar",
                              ),
                            )}
                          </div>
                        </section>
                      );
                    })}
                    {calendarTasksByDate.size === 0 && (
                      <p className="work-calendar-month-empty" role="status">
                        No dated tasks this month
                      </p>
                    )}
                    {calendarOverflowGroups.map(({ label, tasks }) =>
                      tasks.length === 0 ? null : (
                        <section
                          className="work-calendar-overflow-group"
                          role="group"
                          aria-label={label}
                          key={label}
                        >
                          <header>
                            <h4>{label}</h4>
                            <span>{tasks.length}</span>
                          </header>
                          <div>
                            {tasks.map((task) =>
                              renderTask(
                                task,
                                visibleTaskIndex.get(task.id)!,
                                "calendar",
                              ),
                            )}
                          </div>
                        </section>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
          {visibleTasks.length === 0 && (
            <WorkEmpty
              title={
                activeView !== undefined && projection.tasks.length > 0
                  ? "No task matches this view"
                  : "No next actions"
              }
              detail={
                activeView !== undefined && projection.tasks.length > 0
                  ? "Change the view or go back to “All”."
                  : "Quick Capture creates a task without asking you to classify it."
              }
            />
          )}
        </section>
      </div>
    </div>
  );
};
